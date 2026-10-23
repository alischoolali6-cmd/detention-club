(function () {
  "use strict";
  var cfg = window.DC_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); }
  function money(f) { f = Number(f) || 0; return f >= 1000 ? (f / 1000).toFixed(3) + " BD" : f + " fils"; }
  function bd(f) { return (Number(f) / 1000).toFixed(3) + " BD"; }
  function fmt(d) { return new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
  function dayKey(d) { return new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Bahrain" }); }
  var toastT;
  function toast(m) { var t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2200); }

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    $("lErr").textContent = "The admin is not connected to Supabase yet (config.js is empty).";
    return;
  }
  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  var STATUS = { received: "New", preparing: "Preparing", ready: "Ready for delivery", out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled" };
  var NEXT = { received: ["preparing", "Approve order"], preparing: ["ready", "Mark ready for delivery"], ready: ["out_for_delivery", "Out for delivery"], out_for_delivery: ["delivered", "Mark delivered"] };
  var CATS = { fidget: "Fidget & Stretch", squish: "Squish Zone", style: "Style & Accessories", useful: "Cool & Useful", creative: "Creative & Novelty", special: "Special Finds" };
  var FILTERS = [["active", "Active"], ["received", "New"], ["pre", "Pre-orders"], ["preparing", "Preparing"], ["ready", "Ready"], ["out_for_delivery", "Out for delivery"], ["delivered", "Delivered"], ["cancelled", "Cancelled"], ["all", "All"]];
  var orders = [], filter = "active", q = "", openIds = {}, confirmCancel = null, timer = null;

  /* ---------- login ---------- */
  sb.auth.getSession().then(function (r) { if (r.data.session) enter(); });
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault(); $("lErr").textContent = "";
    sb.auth.signInWithPassword({ email: (function(u){ return u.indexOf("@") > -1 ? u : u.toLowerCase() + "@detentionclub.app"; })($("lEmail").value.trim()), password: $("lPass").value }).then(function (r) {
      if (r.error) { $("lErr").textContent = "Wrong email or password."; return; }
      enter();
    });
  });
  $("logoutBtn").addEventListener("click", function () { sb.auth.signOut().then(function () { location.reload(); }); });
  $("previewBtn").addEventListener("click", function () {
    var o = sampleOrder();
    $("previewBox").hidden = !$("previewBox").hidden;
    $("previewConfirm").textContent = "Subject: " + emailSubject(o, "confirm") + "\n\n" + emailText(o, "confirm");
    $("previewDelivery").textContent = "Subject: " + emailSubject(o, "delivery") + "\n\n" + emailText(o, "delivery");
  });
  $("promptBtn").addEventListener("click", function () { $("promptText").value = buildPrompt(); $("promptBox").hidden = false; });
  $("promptCopy").addEventListener("click", function () { (navigator.clipboard ? navigator.clipboard.writeText($("promptText").value) : Promise.reject()).then(function () { toast("Prompt copied"); }, function () { $("promptText").select(); toast("Press Cmd+C to copy"); }); });
  $("refreshBtn").addEventListener("click", function () { loadAll(true); });

  function enter() {
    $("loginView").hidden = true; $("app").hidden = false;
    $("npCat").innerHTML = Object.keys(CATS).map(function (k) { return '<option value="' + k + '">' + CATS[k] + '</option>'; }).join("");
    $("orderFilters").innerHTML = FILTERS.map(function (f) { return '<button class="tab" data-f="' + f[0] + '" aria-pressed="' + (f[0] === filter) + '">' + f[1] + '</button>'; }).join("");
    loadAll();
    timer = setInterval(function () { if (!$("tab-orders").hidden) loadOrders(); }, 30000);
  }

  $("mainTabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]"); if (!b) return;
    document.querySelectorAll("#mainTabs .tab").forEach(function (t) { t.setAttribute("aria-pressed", t === b ? "true" : "false"); });
    ["orders", "stock", "zones", "reviews", "visitors"].forEach(function (t) { $("tab-" + t).hidden = t !== b.dataset.tab; });
    if (b.dataset.tab === "visitors") loadViews();
  });

  function loadAll(announce) {
    Promise.all([loadOrders(), loadStock(), loadZones(), loadReviews()]).then(function () { if (announce) toast("Updated"); });
  }

  /* ---------- orders ---------- */
  function loadOrders() {
    return sb.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(1000).then(function (r) {
      if (r.error) { $("orderList").innerHTML = '<p class="err">' + esc(r.error.message) + '</p>'; return; }
      orders = r.data || []; renderOrders();
    });
  }
  function isOpen(o) { return o.status !== "delivered" && o.status !== "cancelled"; }
  function renderStats() {
    var today = dayKey(new Date()), live = orders.filter(function (o) { return o.status !== "cancelled"; });
    var tOrders = live.filter(function (o) { return dayKey(o.created_at) === today; });
    var sum = function (a) { return a.reduce(function (s, o) { return s + o.total_fils; }, 0); };
    var newN = orders.filter(function (o) { return o.status === "received"; }).length;
    var preN = orders.filter(function (o) { return o.has_preorder && isOpen(o); }).length;
    var cells = [
      [tOrders.length, "Orders today"], [bd(sum(tOrders)), "Money today"], [newN, "New orders"], [preN, "Open pre-orders"],
      [live.length, "All orders"], [bd(sum(live)), "All money"], [bd(sum(live.filter(function (o) { return o.status === "delivered"; }))), "Delivered money"]
    ];
    $("stats").innerHTML = cells.map(function (c) { return '<div class="stat"><b>' + esc(c[0]) + '</b><span>' + c[1] + '</span></div>'; }).join("");
    $("newBadge").textContent = newN ? "(" + newN + " new)" : "";
  }
  function matchFilter(o) {
    if (filter === "all") return true;
    if (filter === "active") return isOpen(o);
    if (filter === "pre") return o.has_preorder && isOpen(o);
    return o.status === filter;
  }
  function itemsText(o) { return (o.order_items || []).map(function (i) { return i.qty + " x " + i.name + (i.preorder_qty ? " (" + i.preorder_qty + " pre-order)" : ""); }).join(", "); }
  function digits(p) { var d = String(p).replace(/[^0-9]/g, ""); return d.length === 8 ? "973" + d : d; }
  function trackLink(o) { return location.origin + location.pathname.replace(/\/admin(\.html)?\/?$/, "").replace(/\/$/, "") + "/track.html?code=" + o.code; }
  function itemLines(o) {
    return (o.order_items || []).map(function (i) {
      return "  - " + i.qty + " x " + i.name + " (" + bd(i.unit_price_fils * i.qty) + ")" + (i.preorder_qty ? " - " + i.preorder_qty + " pre-order, arrives in 8-10 days" : "");
    }).join("\n");
  }
  function emailSubject(o, kind) {
    return kind === "confirm" ? "Thank you for ordering from Detention Club (order " + o.code + ")" : "Your Detention Club order " + o.code + " arrives today";
  }
  function emailText(o, kind) {
    var first = o.customer_name.split(" ")[0], link = trackLink(o);
    var summary = "Order code: " + o.code + "\n" + itemLines(o) + "\n" +
      "  Items: " + bd(o.subtotal_fils) + "\n  Delivery: " + (o.delivery_fee_fils ? bd(o.delivery_fee_fils) : "to be confirmed by phone") + "\n  Total to pay in cash on delivery: " + bd(o.total_fils);
    var pre = o.has_preorder ? "\nSome items in your order are pre-order items, which take 8-10 days to arrive. We will tell you when they are on their way.\n" : "";
    if (kind === "confirm") {
      return "Dear " + first + ",\n\nThank you for ordering from Detention Club! We have received and approved your order.\n\n" + summary +
        "\n\nDelivery address: " + (o.area ? o.area + ", " : "") + o.address + "\n" + pre +
        "\nYou pay in cash when your order arrives. Please keep your phone nearby so our driver can reach you.\n\nYou can follow your order at any time on our website with your order code:\n" + link +
        "\n\nFor inquiries and birthday parties, please contact detentionclub0@gmail.com.\n\nKind regards,\nDetention Club";
    }
    return "Dear " + first + ",\n\nGood news! Your Detention Club order " + o.code + " will arrive through the day today.\n\n" + summary +
      "\n\nDelivery address: " + (o.area ? o.area + ", " : "") + o.address + "\n\nPlease keep your phone nearby and have " + bd(o.total_fils) + " in cash ready for the driver.\n" +
      "\nTrack your order here:\n" + link +
      "\n\nOnce you have received your order, we would love a review. You can leave one on our website here:\n" + link +
      "\n\nFor inquiries and birthday parties, please contact detentionclub0@gmail.com.\n\nKind regards,\nDetention Club";
  }
  function mailLink(o, kind) {
    return "mailto:" + encodeURIComponent(o.email) + "?subject=" + encodeURIComponent(emailSubject(o, kind)) + "&body=" + encodeURIComponent(emailText(o, kind));
  }
  function buildPrompt() {
    var conf = orders.filter(function (o) { return o.status === "preparing" && !o.confirm_emailed_at; });
    var rdy = orders.filter(function (o) { return o.status === "ready" || o.status === "out_for_delivery"; });
    var del = rdy.filter(function (o) { return !o.delivery_emailed_at; });
    if (!conf.length && !rdy.length) return "There is nothing to do right now: no approved orders waiting for a confirmation email and no orders ready for delivery.";
    var t = "You are helping me run Detention Club, a student-run toy store in Bahrain. Do the tasks below in order. Never enter payment details anywhere. Never send an email without showing me the draft and waiting for me to say 'send'.\n\n";
    if (conf.length) {
      t += "TASK 1 - CONFIRMATION EMAILS (from detentionclub0@gmail.com)\nThese orders are approved. Email each customer the confirmation below.\n\n";
      conf.forEach(function (o, n) { t += "-- Confirmation " + (n + 1) + " of " + conf.length + " (order " + o.code + ") --\nTo: " + o.email + "\nSubject: " + emailSubject(o, "confirm") + "\nBody:\n" + emailText(o, "confirm") + "\n\n"; });
    }
    if (rdy.length) {
      t += "TASK 2 - PARCEL APP (on this laptop)\nFor each order marked READY below, open the Parcel app and create a delivery. Enter ONLY the items price, the customer phone number and the customer location. For every order STOP before the final step that orders the driver, tell me what you filled in, and wait for me to say 'approved'.\n\n";
      rdy.forEach(function (o, n) {
        t += "-- Delivery " + (n + 1) + " of " + rdy.length + " (" + (o.status === "ready" ? "READY: book a driver" : "already out for delivery: no booking needed") + ") --\nCode: " + o.code + "\nCustomer: " + o.customer_name + "\nPhone: " + o.phone +
          "\nLocation: " + (o.area ? o.area + ", " : "") + o.address + (o.notes ? "\nNotes: " + o.notes : "") + "\nItems: " + itemsText(o) + "\nItems price (enter in Parcel): " + bd(o.subtotal_fils) + "\nCash to collect: " + bd(o.total_fils) + "\n\n";
      });
    }
    if (del.length) {
      t += "TASK 3 - DELIVERY DAY EMAILS (from detentionclub0@gmail.com)\nAfter I approve each driver booking, email that customer the delivery day email below.\n\n";
      del.forEach(function (o, n) { t += "-- Delivery email " + (n + 1) + " of " + del.length + " (order " + o.code + ") --\nTo: " + o.email + "\nSubject: " + emailSubject(o, "delivery") + "\nBody:\n" + emailText(o, "delivery") + "\n\n"; });
    }
    return t + "When everything is done, give me a short summary listing the order codes: which confirmation emails were sent, which drivers are booked, and which delivery emails were sent.";
  }
  function sampleOrder() {
    return { code: "DC-A1B2C3", customer_name: "Sara Ahmed", email: "sara@example.com", area: "Riffa", address: "Building 12, Road 34, Block 929", subtotal_fils: 2900, delivery_fee_fils: 1000, total_fils: 3900, has_preorder: true,
      order_items: [{ name: "Small Keychains", qty: 2, preorder_qty: 0, unit_price_fils: 200 }, { name: "Payment Star", qty: 1, preorder_qty: 1, unit_price_fils: 2000 }, { name: "Mini Colorful Rings", qty: 1, preorder_qty: 0, unit_price_fils: 300 }, { name: "Banana Squishies", qty: 1, preorder_qty: 0, unit_price_fils: 700 }] };
  }
  function renderOrders() {
    renderStats();
    var s = q.trim().toLowerCase();
    var list = orders.filter(matchFilter).filter(function (o) {
      return !s || o.code.toLowerCase().indexOf(s) > -1 || o.customer_name.toLowerCase().indexOf(s) > -1 || o.phone.indexOf(s) > -1;
    });
    if (!list.length) { $("orderList").innerHTML = '<p class="muted">No orders here yet.</p>'; return; }
    $("orderList").innerHTML = list.map(function (o) {
      var next = NEXT[o.status];
      var items = (o.order_items || []).map(function (i) { return '<li><span>' + i.qty + ' × ' + esc(i.name) + (i.preorder_qty ? ' <span class="pre-tag">' + i.preorder_qty + ' pre-order</span>' : '') + '</span><span>' + money(i.unit_price_fils * i.qty) + '</span></li>'; }).join("");
      return '<details class="order" data-id="' + o.id + '"' + (openIds[o.id] ? " open" : "") + '>' +
        '<summary><span><span class="code">' + esc(o.code) + '</span> <span class="status ' + o.status + '">' + STATUS[o.status] + '</span>' + (o.has_preorder ? ' <span class="pre-tag">Pre-order</span>' : '') + '</span>' +
        '<span class="amt">' + bd(o.total_fils) + '</span><span class="sub">' + esc(o.customer_name) + ' · ' + fmt(o.created_at) + '</span></summary>' +
        '<div class="order__body"><div class="order__cols">' +
        '<div><h4>Customer</h4><p><b>' + esc(o.customer_name) + '</b></p><p><a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a> · <a href="https://wa.me/' + digits(o.phone) + '" target="_blank" rel="noopener">WhatsApp</a></p><p>' + esc(o.email) + '</p>' +
        '<h4 style="margin-top:8px">Delivery address</h4><p>' + (o.area ? esc(o.area) + '<br>' : '') + esc(o.address) + '</p>' + (o.notes ? '<h4 style="margin-top:8px">Notes</h4><p>' + esc(o.notes) + '</p>' : '') + '</div>' +
        '<div><h4>Items</h4><ul class="items-list">' + items + '</ul>' +
        '<div class="total-row"><span>Items price</span><span>' + bd(o.subtotal_fils) + '</span></div><div class="total-row"><span>Delivery fee</span><span>' + bd(o.delivery_fee_fils) + '</span></div><div class="total-row big"><span>Collect (cash)</span><span>' + bd(o.total_fils) + '</span></div></div></div>' +
        '<div class="actions">' +
        (next ? '<button class="btn btn--lime btn--sm" data-set="' + next[0] + '" data-id="' + o.id + '">' + next[1] + '</button>' : '') +
        '<button class="btn btn--ghost btn--sm" data-parcel="' + o.id + '">Copy for Parcel</button>' +
        '<a class="btn btn--ghost btn--sm" href="' + mailLink(o, "confirm") + '">Email 1: Confirmation' + (o.confirm_emailed_at ? " ✓" : "") + '</a>' +
        '<a class="btn btn--ghost btn--sm" href="' + mailLink(o, "delivery") + '">Email 2: Delivery day' + (o.delivery_emailed_at ? " ✓" : "") + '</a>' +
        '<button class="btn btn--ghost btn--sm" data-sent="confirm_emailed_at" data-id="' + o.id + '">' + (o.confirm_emailed_at ? "Unmark confirmation sent" : "Mark confirmation sent") + '</button>' +
        '<button class="btn btn--ghost btn--sm" data-sent="delivery_emailed_at" data-id="' + o.id + '">' + (o.delivery_emailed_at ? "Unmark delivery email sent" : "Mark delivery email sent") + '</button>' +
        (isOpen(o) ? '<button class="btn btn--danger btn--sm" data-cancel="' + o.id + '">' + (confirmCancel === o.id ? "Tap again to cancel" : "Cancel order") + '</button>' : '') +
        (o.status === "cancelled" ? '<button class="btn btn--ghost btn--sm" data-set="received" data-id="' + o.id + '">Reopen</button>' : '') +
        '</div></div></details>';
    }).join("");
  }
  $("orderFilters").addEventListener("click", function (e) {
    var b = e.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f;
    document.querySelectorAll("#orderFilters .tab").forEach(function (t) { t.setAttribute("aria-pressed", t === b ? "true" : "false"); }); renderOrders();
  });
  $("orderSearch").addEventListener("input", function (e) { q = e.target.value; renderOrders(); });
  $("orderList").addEventListener("toggle", function (e) { var d = e.target; if (d.dataset && d.dataset.id) openIds[d.dataset.id] = d.open; }, true);
  $("orderList").addEventListener("click", function (e) {
    var sent = e.target.closest("[data-sent]");
    if (sent) { var oo = orders.filter(function (x) { return x.id === sent.dataset.id; })[0], patch = {}; patch[sent.dataset.sent] = oo[sent.dataset.sent] ? null : new Date().toISOString(); sb.from("orders").update(patch).eq("id", sent.dataset.id).then(function (r) { if (r.error) { toast("Run the new SQL first (email tracking)"); return; } loadOrders(); }); return; }
    var set = e.target.closest("[data-set]"), par = e.target.closest("[data-parcel]"), can = e.target.closest("[data-cancel]");
    if (set) { setStatus(set.dataset.id, set.dataset.set); }
    else if (par) {
      var o = orders.filter(function (x) { return x.id === par.dataset.parcel; })[0];
      var txt = "Items price: " + bd(o.subtotal_fils) + "\nCollect (cash): " + bd(o.total_fils) + "\nPhone: " + o.phone + "\nLocation: " + (o.area ? o.area + ", " : "") + o.address + "\nOrder: " + o.code;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast("Copied for Parcel"); }, function () { toast("Copy failed"); });
    } else if (can) {
      if (confirmCancel === can.dataset.cancel) { confirmCancel = null; setStatus(can.dataset.cancel, "cancelled"); }
      else { confirmCancel = can.dataset.cancel; renderOrders(); setTimeout(function () { confirmCancel = null; }, 4000); }
    }
  });
  function setStatus(id, st) {
    sb.rpc("update_order_status", { p_order: id, p_status: st }).then(function (r) {
      if (r.error) { toast("Error: " + r.error.message); return; }
      toast("Status: " + STATUS[st]); loadOrders(); loadStock();
    });
  }

  /* ---------- stock ---------- */
  var products = [];
  function loadStock() {
    return sb.from("products").select("*").order("sort").order("id").then(function (r) {
      products = r.data || [];
      $("stockTable").innerHTML = '<tr><th>Name</th><th>Category</th><th>Price (fils)</th><th>Stock</th><th>Show</th><th></th></tr>' + products.map(function (p) {
        return '<tr data-id="' + p.id + '"><td><input type="text" data-k="name" value="' + esc(p.name) + '"></td>' +
          '<td><select data-k="category">' + Object.keys(CATS).map(function (k) { return '<option value="' + k + '"' + (k === p.category ? " selected" : "") + '>' + CATS[k] + '</option>'; }).join("") + '</select></td>' +
          '<td><input type="number" min="0" data-k="price_fils" value="' + p.price_fils + '"></td><td><input type="number" min="0" data-k="stock" value="' + p.stock + '"></td>' +
          '<td><input type="checkbox" data-k="active"' + (p.active ? " checked" : "") + '></td><td><button class="btn btn--sm" data-save="' + p.id + '">Save</button></td></tr>';
      }).join("");
    });
  }
  $("stockTable").addEventListener("click", function (e) {
    var b = e.target.closest("[data-save]"); if (!b) return;
    var tr = b.closest("tr"), v = {};
    tr.querySelectorAll("[data-k]").forEach(function (el) { var k = el.dataset.k; v[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? Math.max(0, parseInt(el.value || "0", 10)) : el.value.trim(); });
    sb.from("products").update(v).eq("id", Number(b.dataset.save)).then(function (r) { toast(r.error ? "Error: " + r.error.message : "Saved"); });
  });
  $("addProduct").addEventListener("submit", function (e) {
    e.preventDefault();
    sb.from("products").insert({ name: $("npName").value.trim(), category: $("npCat").value, price_fils: parseInt($("npPrice").value, 10), stock: parseInt($("npStock").value, 10), description: $("npDesc").value.trim(), image: $("npImg").value.trim() || null, sort: 100 })
      .then(function (r) { if (r.error) { toast("Error: " + r.error.message); return; } toast("Product added"); $("addProduct").reset(); loadStock(); });
  });

  /* ---------- zones ---------- */
  function loadZones() {
    return sb.from("delivery_zones").select("*").order("name").then(function (r) {
      var z = r.data || [];
      $("zoneTable").innerHTML = '<tr><th>Area</th><th>Fee (fils)</th><th>Show</th><th></th></tr>' + (z.length ? z.map(function (x) {
        return '<tr data-id="' + x.id + '"><td><input type="text" data-k="name" value="' + esc(x.name) + '"></td><td><input type="number" min="0" data-k="fee_fils" value="' + x.fee_fils + '"></td>' +
          '<td><input type="checkbox" data-k="active"' + (x.active ? " checked" : "") + '></td><td><button class="btn btn--sm" data-save="' + x.id + '">Save</button> <button class="btn btn--danger btn--sm" data-del="' + x.id + '">Delete</button></td></tr>';
      }).join("") : '<tr><td colspan="4" class="muted">No areas yet. Until you add some, customers type their area and you confirm the fee by phone.</td></tr>');
    });
  }
  $("zoneTable").addEventListener("click", function (e) {
    var s = e.target.closest("[data-save]"), d = e.target.closest("[data-del]");
    if (s) {
      var v = {}; s.closest("tr").querySelectorAll("[data-k]").forEach(function (el) { var k = el.dataset.k; v[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? Math.max(0, parseInt(el.value || "0", 10)) : el.value.trim(); });
      sb.from("delivery_zones").update(v).eq("id", Number(s.dataset.save)).then(function (r) { toast(r.error ? "Error: " + r.error.message : "Saved"); });
    } else if (d) {
      if (d.dataset.sure) { sb.from("delivery_zones").delete().eq("id", Number(d.dataset.del)).then(function (r) { toast(r.error ? "Error: " + r.error.message : "Deleted"); loadZones(); }); }
      else { d.dataset.sure = "1"; d.textContent = "Tap again"; }
    }
  });
  $("addZone").addEventListener("submit", function (e) {
    e.preventDefault();
    sb.from("delivery_zones").insert({ name: $("nzName").value.trim(), fee_fils: parseInt($("nzFee").value, 10) }).then(function (r) { if (r.error) { toast("Error: " + r.error.message); return; } $("addZone").reset(); loadZones(); toast("Area added"); });
  });

  /* ---------- reviews ---------- */
  function loadReviews() {
    return sb.from("reviews").select("*, orders(code)").order("created_at", { ascending: false }).then(function (r) {
      var list = r.data || [];
      $("reviewAdmin").innerHTML = list.length ? list.map(function (v) {
        return '<div class="review" style="margin-bottom:var(--space-md)"><span class="stars-ro">' + "★".repeat(v.rating) + "☆".repeat(5 - v.rating) + '</span> <span class="status ' + (v.approved ? "ready" : "received") + '">' + (v.approved ? "Published" : "Waiting") + '</span>' +
          '<p>' + esc(v.comment) + '</p><b>' + esc(v.first_name) + ' · ' + esc(v.orders ? v.orders.code : "") + ' · ' + fmt(v.created_at) + '</b>' +
          '<div class="actions" style="margin-top:var(--space-sm)"><button class="btn btn--sm" data-rv="' + v.id + '" data-a="' + (v.approved ? "0" : "1") + '">' + (v.approved ? "Unpublish" : "Publish") + '</button><button class="btn btn--danger btn--sm" data-rvdel="' + v.id + '">Delete</button></div></div>';
      }).join("") : '<p class="muted">No reviews yet.</p>';
    });
  }
  $("reviewAdmin").addEventListener("click", function (e) {
    var a = e.target.closest("[data-rv]"), d = e.target.closest("[data-rvdel]");
    if (a) sb.from("reviews").update({ approved: a.dataset.a === "1" }).eq("id", Number(a.dataset.rv)).then(loadReviews);
    if (d) { if (d.dataset.sure) sb.from("reviews").delete().eq("id", Number(d.dataset.rvdel)).then(loadReviews); else { d.dataset.sure = "1"; d.textContent = "Tap again"; } }
  });

  /* ---------- visitors ---------- */
  function loadViews() {
    sb.from("page_views").select("visitor_id,device,at").order("at", { ascending: false }).limit(5000).then(function (r) {
      var rows = r.data || [], today = dayKey(new Date());
      var uniq = {}; rows.forEach(function (x) { uniq[x.visitor_id] = 1; });
      var td = rows.filter(function (x) { return dayKey(x.at) === today; }).length;
      $("vStats").innerHTML = [[rows.length, "Views (latest 5000)"], [Object.keys(uniq).length, "Visitors"], [td, "Views today"]].map(function (c) { return '<div class="stat"><b>' + c[0] + '</b><span>' + c[1] + '</span></div>'; }).join("");
      var days = {}; for (var i = 0; i < 14; i++) { days[dayKey(Date.now() - i * 864e5)] = 0; }
      rows.forEach(function (x) { var k = dayKey(x.at); if (k in days) days[k]++; });
      var dk = Object.keys(days).sort(), mx = Math.max.apply(null, dk.map(function (k) { return days[k]; }).concat(1));
      $("vDays").innerHTML = dk.map(function (k) { return '<div class="bar"><span>' + k.slice(5) + '</span><i style="width:' + Math.max(2, Math.round(days[k] / mx * 100)) + '%"></i><em>' + days[k] + '</em></div>'; }).join("");
      var dev = {}; rows.forEach(function (x) { dev[x.device || "?"] = (dev[x.device || "?"] || 0) + 1; });
      var dm = Math.max.apply(null, Object.keys(dev).map(function (k) { return dev[k]; }).concat(1));
      $("vDevices").innerHTML = Object.keys(dev).map(function (k) { return '<div class="bar"><span>' + esc(k) + '</span><i style="width:' + Math.round(dev[k] / dm * 100) + '%"></i><em>' + dev[k] + '</em></div>'; }).join("") || '<p class="muted">No visits yet.</p>';
    });
  }
})();
