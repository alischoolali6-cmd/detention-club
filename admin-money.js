/* Admin: money (profit, bank balance), restock suggestions (Temu), alerts, 3-month customer data cleanup. */
(function () {
  "use strict";
  var A = window.DCAdmin;
  if (!A) return;
  var sb = A.sb, $ = A.$, esc = A.esc, bd = A.bd, fmt = A.fmt, dayKey = A.dayKey, toast = A.toast;
  var ledger = [], restocks = [], mode = "day", pDay = dayKey(new Date()), pMonth = dayKey(new Date()).slice(0, 7);
  var qtyEdits = {}, confirmRs = false, confirmPurge = false;
  var LEAD_AND_BUFFER_DAYS = 24; // Temu takes about 10 days, plus 2 weeks of stock
  var LABEL = { opening: "Starting balance", sale: "Order delivered", delivery: "Parcel delivery", restock: "Temu order", other_expense: "Expense", other_income: "Extra income" };

  function sum(a, f) { return a.reduce(function (s, x) { return s + f(x); }, 0); }
  function inPeriod(at) { var k = dayKey(at); return mode === "day" ? k === pDay : k.slice(0, 7) === pMonth; }
  function ordersById() { var m = {}; A.orders().forEach(function (o) { m[o.id] = o; }); return m; }

  /* ---------- loading ---------- */
  function loadLedger() { return sb.from("ledger").select("*").order("at", { ascending: false }).limit(3000).then(function (r) { ledger = r.data || []; }); }
  function loadRestocks() { return sb.from("restocks").select("*, restock_items(*)").order("ordered_at", { ascending: false }).limit(200).then(function (r) { restocks = r.data || []; }); }
  A.extraLoad = function () { return Promise.all([loadLedger(), loadRestocks()]).then(renderAll); };
  A.hooks.push(renderAll);

  /* ---------- restock maths ---------- */
  function stats() {
    var cutoff = Date.now() - 30 * 864e5, rows = {};
    A.products().forEach(function (p) { rows[p.id] = { p: p, sold30: 0, pending: 0, incoming: 0 }; });
    A.orders().forEach(function (o) {
      if (o.status === "cancelled") return;
      var recent = new Date(o.created_at).getTime() >= cutoff, open = o.status !== "delivered";
      (o.order_items || []).forEach(function (i) {
        var r = rows[i.product_id]; if (!r) return;
        if (recent) r.sold30 += i.qty;
        if (open) r.pending += i.preorder_qty;
      });
    });
    restocks.forEach(function (rs) { if (rs.status !== "ordered") return; (rs.restock_items || []).forEach(function (i) { if (rows[i.product_id]) rows[i.product_id].incoming += i.qty; }); });
    return Object.keys(rows).map(function (k) {
      var r = rows[k], p = r.p, daily = r.sold30 / 30;
      r.daysLeft = daily > 0 ? p.stock / daily : null;
      var level = p.reorder_level == null ? 5 : p.reorder_level;
      r.state = p.stock <= 0 ? "out" : (p.stock <= level || (r.daysLeft !== null && r.daysLeft < 10)) ? "low" : "ok";
      var target = Math.max(level * 2, Math.ceil(daily * LEAD_AND_BUFFER_DAYS));
      r.suggest = Math.max(0, r.pending + target - p.stock - r.incoming);
      if (r.state === "ok" && r.pending === 0) r.suggest = 0;
      return r;
    });
  }
  function balance() { return sum(ledger, function (x) { return x.amount_fils; }); }

  /* ---------- alerts ---------- */
  function renderAlerts() {
    var s = stats(), out = s.filter(function (r) { return r.state === "out"; }), low = s.filter(function (r) { return r.state === "low"; });
    var pend = sum(s, function (r) { return r.pending; });
    var need = s.filter(function (r) { return r.suggest > 0; }).length;
    var bar = $("alertBar");
    if (!out.length && !low.length && !pend) { bar.hidden = true; $("restockBadge").textContent = ""; return; }
    var parts = [];
    if (out.length) parts.push(out.length + " out of stock (" + out.slice(0, 3).map(function (r) { return esc(r.p.name); }).join(", ") + (out.length > 3 ? "…" : "") + ")");
    if (low.length) parts.push(low.length + " running low (" + low.slice(0, 3).map(function (r) { return esc(r.p.name); }).join(", ") + (low.length > 3 ? "…" : "") + ")");
    if (pend) parts.push(pend + " pre-order unit" + (pend === 1 ? "" : "s") + " waiting for stock");
    bar.innerHTML = "<b>Time to order from Temu:</b> " + parts.join(" · ") + ' <button class="link-btn" id="goRestock" style="color:inherit">Open Restock</button>';
    bar.hidden = false;
    $("restockBadge").textContent = need ? "(" + need + ")" : "";
    $("goRestock").onclick = function () { A.showTab("restock"); };
  }

  /* ---------- money tab ---------- */
  function renderMoney() {
    var byId = ordersById();
    var sales = ledger.filter(function (x) { return x.category === "sale" && inPeriod(x.at); });
    var collected = sum(sales, function (x) { return x.amount_fils; });
    var cogs = 0, delCost = 0, unknownCost = 0;
    sales.forEach(function (x) {
      var o = byId[x.order_id]; if (!o) return;
      (o.order_items || []).forEach(function (i) { cogs += i.qty * (i.unit_cost_fils || 0); if (!i.unit_cost_fils) unknownCost++; });
      delCost += o.delivery_cost_fils != null ? o.delivery_cost_fils : o.delivery_fee_fils;
    });
    var otherExp = -sum(ledger.filter(function (x) { return x.category === "other_expense" && inPeriod(x.at); }), function (x) { return x.amount_fils; });
    var otherInc = sum(ledger.filter(function (x) { return x.category === "other_income" && inPeriod(x.at); }), function (x) { return x.amount_fils; });
    var temu = -sum(ledger.filter(function (x) { return x.category === "restock" && inPeriod(x.at); }), function (x) { return x.amount_fils; });
    var profit = collected - cogs - delCost - otherExp + otherInc;
    var placed = A.orders().filter(function (o) { return o.status !== "cancelled" && inPeriod(o.created_at); });
    var cells = [
      [bd(balance()), "Bank balance now"], [bd(collected), "Money collected (delivered)"], [bd(cogs), "Cost of items sold"], [bd(delCost), "Delivery costs"],
      [bd(otherExp), "Other expenses"], [bd(profit), "PROFIT"], [bd(temu), "Spent on Temu (not in profit)"], [placed.length + " · " + bd(sum(placed, function (o) { return o.total_fils; })), "Orders placed · value"], [sales.length, "Orders delivered"]
    ];
    $("moneyStats").innerHTML = cells.map(function (c) { return '<div class="stat"><b' + (c[1] === "PROFIT" ? ' style="color:' + (profit < 0 ? "var(--color-pink)" : "var(--color-blue)") + '"' : "") + ">" + esc(c[0]) + "</b><span>" + c[1] + "</span></div>"; }).join("");
    var notes = [];
    if (unknownCost) notes.push("Some items sold have no cost saved, so profit looks too high. Set your cost per item in Stock & prices.");
    if (sales.some(function (x) { var o = byId[x.order_id]; return o && o.delivery_cost_fils == null; })) notes.push("Some orders have no Parcel price entered. Until you enter it, delivery is counted as break-even (the delivery fee the customer paid).");
    $("moneyNote").hidden = !notes.length; $("moneyNote").textContent = notes.join(" ");
    var hasOpen = ledger.some(function (x) { return x.category === "opening"; });
    $("openNote").textContent = hasOpen ? "A starting balance is already set. Delete it in the record below to change it." : "Enter what is in the bank right now. Everything after this is added or deducted automatically.";
    $("openAmt").disabled = hasOpen;

    var asc = ledger.slice().sort(function (a, b) { return new Date(a.at) - new Date(b.at) || a.id - b.id; }), run = 0, after = {};
    asc.forEach(function (x) { run += x.amount_fils; after[x.id] = run; });
    $("ledgerTable").innerHTML = '<tr><th>Date</th><th>What</th><th>Note</th><th>Amount</th><th>Balance after</th><th></th></tr>' + (ledger.length ? ledger.slice(0, 80).map(function (x) {
      var manual = x.category === "opening" || x.category === "other_expense" || x.category === "other_income";
      return "<tr><td>" + esc(fmt(x.at)) + "</td><td>" + LABEL[x.category] + "</td><td>" + esc(x.note || "") + '</td><td style="color:' + (x.amount_fils < 0 ? "var(--color-pink)" : "inherit") + ';font-family:var(--font-outlier)">' + (x.amount_fils < 0 ? "−" : "+") + bd(Math.abs(x.amount_fils)) + '</td><td style="font-family:var(--font-outlier)">' + bd(after[x.id]) + "</td><td>" + (manual ? '<button class="link-btn" data-lgdel="' + x.id + '">Delete</button>' : "") + "</td></tr>";
    }).join("") : '<tr><td colspan="6" class="muted">Nothing recorded yet. Set your starting bank balance above.</td></tr>');
  }

  $("modeDay").addEventListener("click", function () { mode = "day"; setMode(); });
  $("modeMonth").addEventListener("click", function () { mode = "month"; setMode(); });
  function setMode() {
    $("modeDay").setAttribute("aria-pressed", mode === "day"); $("modeMonth").setAttribute("aria-pressed", mode === "month");
    $("periodDay").hidden = mode !== "day"; $("periodMonth").hidden = mode !== "month"; renderMoney();
  }
  $("periodDay").value = pDay; $("periodMonth").value = pMonth;
  $("periodDay").addEventListener("change", function (e) { if (e.target.value) { pDay = e.target.value; renderMoney(); } });
  $("periodMonth").addEventListener("change", function (e) { if (e.target.value) { pMonth = e.target.value; renderMoney(); } });

  function fils(v) { return Math.round(parseFloat(v) * 1000); }
  $("openingForm").addEventListener("submit", function (e) {
    e.preventDefault(); var a = fils($("openAmt").value); if (isNaN(a) || a < 0) return;
    sb.from("ledger").insert({ category: "opening", amount_fils: a, note: "Starting bank balance" }).then(function (r) { if (r.error) { toast("Run the upgrade SQL first: " + r.error.message); return; } $("openingForm").reset(); toast("Starting balance saved"); A.extraLoad(); });
  });
  $("entryForm").addEventListener("submit", function (e) {
    e.preventDefault(); var a = fils($("entAmt").value), t = $("entType").value; if (isNaN(a) || a <= 0) return;
    sb.from("ledger").insert({ category: t, amount_fils: t === "other_expense" ? -a : a, note: $("entNote").value.trim() }).then(function (r) { if (r.error) { toast("Error: " + r.error.message); return; } $("entryForm").reset(); toast("Added"); A.extraLoad(); });
  });
  $("ledgerTable").addEventListener("click", function (e) {
    var b = e.target.closest("[data-lgdel]"); if (!b) return;
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Tap again"; return; }
    sb.from("ledger").delete().eq("id", Number(b.dataset.lgdel)).then(function (r) { toast(r.error ? "Error: " + r.error.message : "Deleted"); A.extraLoad(); });
  });

  /* ---------- restock tab ---------- */
  function selectedItems(st) {
    return st.map(function (r) { var q = qtyEdits[r.p.id] != null ? qtyEdits[r.p.id] : r.suggest; return { r: r, qty: Math.max(0, parseInt(q, 10) || 0) }; }).filter(function (x) { return x.qty > 0; });
  }
  function renderRestock() {
    var st = stats();
    st.sort(function (a, b) { var rank = { out: 0, low: 1, ok: 2 }; return rank[a.state] - rank[b.state] || b.suggest - a.suggest; });
    var bal = balance();
    $("restockIntro").innerHTML = "These suggestions use your last 30 days of sales, the pre-orders waiting for stock, and Temu orders already on the way. They aim to keep about " + LEAD_AND_BUFFER_DAYS + " days of stock (Temu takes about 10 days). Change any number before you record the order. Bank balance now: <b>" + bd(bal) + "</b>.";
    $("restockTable").innerHTML = '<tr><th>Item</th><th>In stock</th><th>Sold (30 days)</th><th>Days left</th><th>Pre-orders waiting</th><th>On the way</th><th>Status</th><th>Order qty</th><th>Your cost</th><th>Est. cost</th></tr>' + st.map(function (r) {
      var q = qtyEdits[r.p.id] != null ? qtyEdits[r.p.id] : r.suggest, cost = r.p.cost_fils || 0;
      var badge = r.state === "out" ? '<span class="status cancelled">Out</span>' : r.state === "low" ? '<span class="status received">Low</span>' : '<span class="status ready">OK</span>';
      return "<tr><td><b>" + esc(r.p.name) + "</b></td><td>" + r.p.stock + "</td><td>" + r.sold30 + "</td><td>" + (r.daysLeft === null ? "—" : Math.round(r.daysLeft)) + "</td><td>" + r.pending + "</td><td>" + r.incoming + "</td><td>" + badge + '</td><td><input type="number" min="0" data-rq="' + r.p.id + '" value="' + q + '"></td><td>' + (cost ? bd(cost) : '<span class="muted">not set</span>') + "</td><td>" + (cost ? bd(cost * (parseInt(q, 10) || 0)) : "—") + "</td></tr>";
    }).join("");
    updateRestockSummary(st);
    var way = restocks.filter(function (x) { return x.status === "ordered"; }), done = restocks.filter(function (x) { return x.status === "arrived"; });
    var card = function (x, btn) { return '<div class="form-card" style="margin-bottom:var(--space-sm)"><div style="display:flex;justify-content:space-between;gap:var(--space-md);flex-wrap:wrap"><b>Temu order #' + x.id + " · " + bd(x.total_fils) + "</b><span class=\"muted\">" + esc(fmt(x.ordered_at)) + (x.arrived_at ? " → arrived " + esc(fmt(x.arrived_at)) : "") + "</span></div>" + (x.note ? "<p>" + esc(x.note) + "</p>" : "") + '<ul class="items-list">' + (x.restock_items || []).map(function (i) { return "<li><span>" + i.qty + " × " + esc(i.name) + "</span><span>" + (i.unit_cost_fils ? bd(i.unit_cost_fils) + " each" : "") + "</span></li>"; }).join("") + "</ul>" + (btn || "") + "</div>"; };
    $("onTheWay").innerHTML = way.length ? way.map(function (x) { return card(x, '<button class="btn btn--lime btn--sm" data-arrived="' + x.id + '">Mark arrived (adds to stock)</button>'); }).join("") : '<p class="muted">No Temu orders on the way.</p>';
    $("arrived").innerHTML = done.length ? done.slice(0, 10).map(function (x) { return card(x); }).join("") : '<p class="muted">Nothing yet.</p>';
  }
  function updateRestockSummary(st) {
    st = st || stats();
    var sel = selectedItems(st), est = 0, unknown = 0;
    sel.forEach(function (x) { var c = x.r.p.cost_fils || 0; if (!c) unknown++; est += c * x.qty; });
    var bal = balance(), s = sel.length + " item type" + (sel.length === 1 ? "" : "s") + " selected" + (est ? " · estimated " + bd(est) : "") + (unknown ? " · " + unknown + " without a saved cost" : "");
    if (est) s += " · bank after order ≈ " + bd(bal - est) + (bal - est < 0 ? " (NOT ENOUGH MONEY)" : "");
    $("restockSummary").textContent = s;
    if (est && !$("rsTotal").value) $("rsTotal").value = (est / 1000).toFixed(3);
  }
  $("restockTable").addEventListener("input", function (e) {
    var el = e.target.closest("[data-rq]"); if (!el) return; qtyEdits[el.dataset.rq] = el.value;
    var tr = el.closest("tr"); var p = A.products().filter(function (x) { return String(x.id) === el.dataset.rq; })[0];
    tr.lastElementChild.textContent = p && p.cost_fils ? bd(p.cost_fils * (parseInt(el.value, 10) || 0)) : "—"; updateRestockSummary();
  });
  $("restockForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var sel = selectedItems(stats()), total = fils($("rsTotal").value);
    if (!sel.length) { toast("Pick at least one item"); return; }
    if (isNaN(total) || total <= 0) { toast("Enter how much you paid"); return; }
    var btn = $("rsBtn");
    if (!confirmRs) { confirmRs = true; btn.textContent = "Tap again: deduct " + bd(total) + " from the bank"; setTimeout(function () { confirmRs = false; btn.textContent = "Record order and deduct from bank"; }, 5000); return; }
    confirmRs = false; btn.textContent = "Record order and deduct from bank";
    var w = sum(sel, function (x) { return x.r.p.price_fils * x.qty; }) || 1;
    var items = sel.map(function (x) { return { product_id: x.r.p.id, qty: x.qty, unit_cost_fils: Math.max(0, Math.round(total * (x.r.p.price_fils * x.qty) / w / x.qty)) }; });
    sb.rpc("create_restock", { p_total: total, p_note: $("rsNote").value, p_items: items }).then(function (r) {
      if (r.error) { toast("Error: " + r.error.message); return; }
      qtyEdits = {}; $("restockForm").reset(); toast(bd(total) + " deducted. Temu order recorded."); A.extraLoad();
    });
  });
  $("onTheWay").addEventListener("click", function (e) {
    var b = e.target.closest("[data-arrived]"); if (!b) return;
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Tap again to add to stock"; return; }
    sb.rpc("receive_restock", { p_id: Number(b.dataset.arrived) }).then(function (r) { if (r.error) { toast("Error: " + r.error.message); return; } toast("Added to stock"); A.reload(); });
  });

  /* ---------- customer data cleanup ---------- */
  function renderData() {
    var cutoff = Date.now() - 90 * 864e5;
    var n = A.orders().filter(function (o) { return (o.status === "delivered" || o.status === "cancelled") && new Date(o.created_at).getTime() < cutoff && o.customer_name !== "(deleted)"; }).length;
    $("purgeCount").textContent = n;
  }
  $("purgeBtn").addEventListener("click", function () {
    var b = $("purgeBtn");
    if (!confirmPurge) { confirmPurge = true; b.textContent = "Tap again to delete for good"; setTimeout(function () { confirmPurge = false; b.textContent = "Delete old customer details now"; }, 5000); return; }
    confirmPurge = false; b.textContent = "Delete old customer details now";
    sb.rpc("purge_old_data", { p_days: 90 }).then(function (r) {
      if (r.error) { toast("Run the upgrade SQL first: " + r.error.message); return; }
      toast("Cleaned " + r.data.orders_cleaned + " orders, " + r.data.views_deleted + " old visits"); A.reload();
    });
  });

  function renderAll() { renderAlerts(); renderMoney(); renderRestock(); renderData(); }
})();
