/* Admin: promo codes, delivery fees by block (with the Parcel prompt), and stock give-aways / write-offs. */
(function () {
  "use strict";
  var A = window.DCAdmin, E = window.DCEmails;
  if (!A) return;
  var sb = A.sb, $ = A.$, esc = A.esc, bd = A.bd, fmt = A.fmt, toast = A.toast, D = A.data;
  var REASON = { sample: "Sample to show people", gift: "Gift / giveaway", damaged: "Damaged or lost", other: "Other" };
  var blockSearch = "";

  function fils(v) { return Math.round(parseFloat(v) * 1000); }

  A.loaders.push(function () {
    return Promise.all([
      sb.from("promo_codes").select("*").order("created_at", { ascending: false }).then(function (r) { D.promos = r.data || []; }),
      sb.from("delivery_blocks").select("*").order("block").limit(3000).then(function (r) { D.blocks = r.data || []; }),
      sb.from("stock_adjustments").select("*").order("at", { ascending: false }).limit(500).then(function (r) { D.adjustments = r.data || []; })
    ]);
  });
  A.hooks.push(function () { renderPromos(); renderBlocks(); renderAdj(); });

  /* ================= PROMO CODES ================= */
  function promoUsage(code) {
    var used = A.orders().filter(function (o) { return o.promo_code === code && o.status !== "cancelled"; });
    return { n: used.length, disc: used.reduce(function (s, o) { return s + (o.discount_fils || 0); }, 0) };
  }
  function renderPromos() {
    $("promoTable").innerHTML = '<tr><th>Code</th><th>For</th><th>Discount</th><th>Min order</th><th>Uses</th><th>Expires</th><th>Discount given</th><th>Status</th><th></th></tr>' + (D.promos.length ? D.promos.map(function (c) {
      var u = promoUsage(c.code), expired = c.expires_at && new Date(c.expires_at) < new Date();
      var label = c.kind === "percent" ? c.value + "% off" : bd(c.value) + " off";
      return "<tr><td><b>" + esc(c.code) + "</b></td><td>" + esc(c.note || "") + "</td><td>" + label + "</td><td>" + (c.min_order_fils ? bd(c.min_order_fils) : "—") + "</td><td>" + u.n + (c.max_uses ? " / " + c.max_uses : "") + "</td><td>" + (c.expires_at ? esc(new Date(c.expires_at).toLocaleDateString("en-GB", { timeZone: "Asia/Bahrain" })) : "—") + "</td><td>" + bd(u.disc) + "</td><td>" +
        (!c.active ? '<span class="status cancelled">Off</span>' : expired ? '<span class="status cancelled">Expired</span>' : (c.max_uses && u.n >= c.max_uses) ? '<span class="status preparing">Used up</span>' : '<span class="status ready">Active</span>') +
        '</td><td><button class="btn btn--ghost btn--sm" data-pctoggle="' + esc(c.code) + '" data-on="' + (c.active ? "0" : "1") + '">' + (c.active ? "Turn off" : "Turn on") + '</button> <button class="link-btn" data-pcdel="' + esc(c.code) + '">Delete</button></td></tr>';
    }).join("") : '<tr><td colspan="9" class="muted">No promo codes yet.</td></tr>');
  }
  $("pcKind").addEventListener("change", function () { $("pcValueLabel").textContent = $("pcKind").value === "percent" ? "Percent" : "Amount off (BD)"; });
  $("promoForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = $("pcCode").value.trim().toUpperCase(), kind = $("pcKind").value, v = parseFloat($("pcValue").value);
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) { toast("Use 3-30 letters or numbers for the code"); return; }
    var value = kind === "percent" ? Math.round(v) : fils(v);
    if (!(value > 0) || (kind === "percent" && value > 100)) { toast("Enter a valid discount (percent 1-100)"); return; }
    var row = { code: code, kind: kind, value: value, note: $("pcNote").value.trim() || null, min_order_fils: $("pcMin").value ? fils($("pcMin").value) : 0, max_uses: $("pcMax").value ? parseInt($("pcMax").value, 10) : null, expires_at: $("pcExp").value ? $("pcExp").value + "T23:59:59+03:00" : null };
    sb.from("promo_codes").insert(row).then(function (r) {
      if (r.error) { toast(/duplicate/.test(r.error.message) ? "That code already exists" : "Error: " + r.error.message + " (run the upgrade 3 SQL?)"); return; }
      $("promoForm").reset(); toast("Code " + code + " created"); A.extraLoad();
    });
  });
  $("promoTable").addEventListener("click", function (e) {
    var t = e.target.closest("[data-pctoggle]"), d = e.target.closest("[data-pcdel]");
    if (t) sb.from("promo_codes").update({ active: t.dataset.on === "1" }).eq("code", t.dataset.pctoggle).then(function () { A.extraLoad(); });
    if (d) { if (d.dataset.sure) sb.from("promo_codes").delete().eq("code", d.dataset.pcdel).then(function () { A.extraLoad(); }); else { d.dataset.sure = "1"; d.textContent = "Tap again"; } }
  });

  /* ================= DELIVERY FEES BY BLOCK ================= */
  function renderBlocks() {
    var s = blockSearch.trim(), list = D.blocks.filter(function (b) { return !s || String(b.block).indexOf(s) === 0; });
    $("blockCount").textContent = "(" + D.blocks.length + " blocks)";
    $("blockTable").innerHTML = '<tr><th>Block</th><th>Fee (BD)</th><th>Show</th><th></th></tr>' + (list.length ? list.slice(0, 120).map(function (b) {
      return '<tr data-block="' + b.block + '"><td><b>' + b.block + '</b></td><td><input type="number" step="0.001" min="0" data-k="fee" value="' + (b.fee_fils / 1000).toFixed(3) + '"></td><td><input type="checkbox" data-k="active"' + (b.active ? " checked" : "") + '></td><td><button class="btn btn--sm" data-bsave="' + b.block + '">Save</button> <button class="link-btn" data-bdel="' + b.block + '">Delete</button></td></tr>';
    }).join("") + (list.length > 120 ? '<tr><td colspan="4" class="muted">Showing the first 120. Search for a block to see more.</td></tr>' : "") : '<tr><td colspan="4" class="muted">No block prices yet. Until you add some, checkout says the delivery fee is confirmed by phone.</td></tr>');
  }
  $("blockSearch").addEventListener("input", function (e) { blockSearch = e.target.value; renderBlocks(); });
  $("blockTable").addEventListener("click", function (e) {
    var s = e.target.closest("[data-bsave]"), d = e.target.closest("[data-bdel]");
    if (s) {
      var tr = s.closest("tr"), fee = fils(tr.querySelector('[data-k="fee"]').value), act = tr.querySelector('[data-k="active"]').checked;
      if (isNaN(fee) || fee < 0) { toast("Enter a valid fee"); return; }
      sb.from("delivery_blocks").update({ fee_fils: fee, active: act, updated_at: new Date().toISOString() }).eq("block", Number(s.dataset.bsave)).then(function (r) { toast(r.error ? "Error: " + r.error.message : "Saved"); A.extraLoad(); });
    }
    if (d) { if (d.dataset.sure) sb.from("delivery_blocks").delete().eq("block", Number(d.dataset.bdel)).then(function () { A.extraLoad(); }); else { d.dataset.sure = "1"; d.textContent = "Tap again"; } }
  });
  $("blockForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var b = parseInt($("nbBlock").value, 10), f = fils($("nbFee").value);
    sb.from("delivery_blocks").upsert({ block: b, fee_fils: f, active: true, updated_at: new Date().toISOString() }).then(function (r) { if (r.error) { toast("Error: " + r.error.message + " (run the upgrade 3 SQL?)"); return; } $("blockForm").reset(); toast("Block " + b + " saved"); A.extraLoad(); });
  });
  $("importForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var rows = {}, bad = 0;
    $("importText").value.split(/\r?\n/).forEach(function (line) {
      line = line.trim(); if (!line) return;
      var m = line.replace(/BD/gi, "").match(/^(\d{1,4})\s*[,;:\t =-]+\s*(\d+(?:\.\d+)?)\s*$/);
      if (!m) { bad++; return; }
      var b = parseInt(m[1], 10), f = Math.round(parseFloat(m[2]) * 1000);
      if (b < 1 || b > 9999 || isNaN(f)) { bad++; return; }
      rows[b] = { block: b, fee_fils: f, active: true, updated_at: new Date().toISOString() };
    });
    var list = Object.keys(rows).map(function (k) { return rows[k]; });
    if (!list.length) { toast("No valid lines found. Use: 929, 1.200"); return; }
    var chunks = []; for (var i = 0; i < list.length; i += 500) chunks.push(list.slice(i, i + 500));
    Promise.all(chunks.map(function (c) { return sb.from("delivery_blocks").upsert(c); })).then(function (rs) {
      var err = rs.filter(function (r) { return r.error; })[0];
      if (err) { toast("Error: " + err.error.message + " (run the upgrade 3 SQL?)"); return; }
      toast(list.length + " blocks imported" + (bad ? ", " + bad + " lines skipped" : "")); $("importText").value = ""; A.extraLoad();
    });
  });

  // prompt for Claude Cowork to read prices from Parcel
  $("homeAddr").value = (function () { try { return localStorage.getItem("dc_home") || ""; } catch (e) { return ""; } })();
  $("homeAddr").addEventListener("input", function () { try { localStorage.setItem("dc_home", $("homeAddr").value); } catch (e) {} });
  function expandBlocks(text) {
    var out = [];
    String(text).split(/[,\s;]+/).forEach(function (p) {
      var m = p.match(/^(\d{1,4})-(\d{1,4})$/);
      if (m) { var a = +m[1], b = +m[2]; if (a <= b && b - a <= 1500) for (var i = a; i <= b; i++) out.push(i); }
      else if (/^\d{1,4}$/.test(p)) out.push(+p);
    });
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }
  $("p3Btn").addEventListener("click", function () {
    var list = expandBlocks($("blockList").value);
    if (!list.length) { toast("Enter the block numbers first"); return; }
    $("p3Text").value = E.promptBlocks(list.join(", "), $("homeAddr").value.trim()); $("p3Text").hidden = false; $("p3Copy").hidden = false;
  });
  $("p3Copy").addEventListener("click", function () { (navigator.clipboard ? navigator.clipboard.writeText($("p3Text").value) : Promise.reject()).then(function () { toast("Prompt copied"); }, function () { $("p3Text").select(); toast("Press Cmd+C to copy"); }); });

  /* ================= STOCK GIVE-AWAYS / WRITE-OFFS ================= */
  function renderAdj() {
    var sel = $("adjProduct"), cur = sel.value;
    sel.innerHTML = A.products().map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + " (" + p.stock + " in stock)</option>"; }).join(""); if (cur) sel.value = cur;
    $("adjTable").innerHTML = '<tr><th>Date</th><th>Item</th><th>How many</th><th>Reason</th><th>Loss at cost</th><th>Note</th></tr>' + (D.adjustments.length ? D.adjustments.slice(0, 40).map(function (a) {
      return "<tr><td>" + esc(fmt(a.at)) + "</td><td>" + esc(a.name) + "</td><td>" + a.qty + "</td><td>" + REASON[a.reason] + "</td><td>" + bd(a.qty * a.unit_cost_fils) + "</td><td>" + esc(a.note || "") + "</td></tr>";
    }).join("") : '<tr><td colspan="6" class="muted">Nothing given away or written off yet.</td></tr>');
  }
  $("adjForm").addEventListener("submit", function (e) {
    e.preventDefault();
    sb.rpc("adjust_stock", { p_product: Number($("adjProduct").value), p_qty: parseInt($("adjQty").value, 10), p_reason: $("adjReason").value, p_note: $("adjNote").value }).then(function (r) {
      if (r.error) { toast("Error: " + r.error.message.replace(/^.*?:\s*/, "")); return; }
      toast("Taken out of stock. Loss recorded."); $("adjForm").reset(); A.reload();
    });
  });
})();
