/* Detention Club admin: login, orders, stock & products, reviews, visitors. (Money, restock, promo, delivery, cleanup live in admin-money.js and admin-more.js.) */
(function () {
  "use strict";
  var cfg = window.DC_CONFIG || {};
  var E = window.DCEmails;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); }
  function bd(f) { return (Number(f) / 1000).toFixed(3) + " BD"; }
  function money(f) { f = Number(f) || 0; return f >= 1000 ? bd(f) : f + " fils"; }
  function fmt(d) { return new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
  function dayKey(d) { return new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Bahrain" }); }
  var toastT;
  function toast(m) { var t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2600); }

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) { $("lErr").textContent = "The admin is not connected to Supabase yet (config.js is empty)."; return; }
  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  var orders = [], products = [], filter = "active", q = "", openIds = {}, confirmCancel = null;
  var A = window.DCAdmin = {
    sb: sb, $: $, esc: esc, bd: bd, fmt: fmt, dayKey: dayKey, toast: toast, hooks: [], loaders: [], data: { adjustments: [], promos: [], blocks: [] },
    orders: function () { return orders; }, products: function () { return products; },
    reload: function () { loadAll(); },
    showTab: function (name) { var b = document.querySelector('#mainTabs [data-tab="' + name + '"]'); if (b) b.click(); },
    extraLoad: function () { return Promise.all(A.loaders.map(function (f) { return f(); })).then(fire); }
  };
  function fire() { A.hooks.forEach(function (f) { f(); }); }

  var STATUS = { received: "New", preparing: "Confirmed", ready: "Confirmed for delivery", out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled" };
  var NEXT = { received: ["preparing", "Confirm order"], preparing: ["ready", "Confirm for delivery"], ready: ["out_for_delivery", "Mark out for delivery"], out_for_delivery: ["delivered", "Mark delivered"] };
  var CATS = { fidget: "Fidget & Stretch", squish: "Squish Zone", style: "Style & Accessories", useful: "Cool & Useful", creative: "Creative & Novelty", special: "Special Finds" };
  A.CATS = CATS;
  var FILTERS = [["active", "Active"], ["received", "New"], ["pre", "Pre-orders"], ["preparing", "Confirmed"], ["ready", "For delivery"], ["out_for_delivery", "Out for delivery"], ["delivered", "Delivered"], ["cancelled", "Cancelled"], ["all", "All"]];
  var TABS = ["orders", "money", "restock", "stock", "promos", "zones", "reviews", "visitors", "data"];

  /* ---------- login ---------- */
  sb.auth.getSession().then(function (r) { if (r.data.session) enter(); });
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault(); $("lErr").textContent = "";
    var u = $("lEmail").value.trim();
    sb.auth.signInWithPassword({ email: u.indexOf("@") > -1 ? u : u.toLowerCase() + "@detentionclub.app", password: $("lPass").value }).then(function (r) {
      if (r.error) { $("lErr").textContent = "Wrong username or password."; return; }
      enter();
    });
  });
  $("logoutBtn").addEventListener("click", function () { sb.auth.signOut().then(function () { location.reload(); }); });
  $("refreshBtn").addEventListener("click", function () { loadAll(true); });

  function enter() {
    $("loginView").hidden = true; $("app").hidden = false;
    $("npCat").innerHTML = Object.keys(CATS).map(function (k) { return '<option value="' + k + '">' + CATS[k] + '</option>'; }).join("");
    $("orderFilters").innerHTML = FILTERS.map(function (f) { return '<button class="tab" data-f="' + f[0] + '" aria-pressed="' + (f[0] === filter) + '">' + f[1] + '</button>'; }).join("");
    loadAll();
    setInterval(function () { if (!$("tab-orders").hidden) loadOrders(); }, 30000);
  }
  $("mainTabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]"); if (!b) return;
    document.querySelectorAll("#mainTabs .tab").forEach(function (t) { t.setAttribute("aria-pressed", t === b ? "true" : "false"); });
    TABS.forEach(function (t) { $("tab-" + t).hidden = t !== b.dataset.tab; });
    if (b.dataset.tab === "visitors") loadViews();
  });
  function loadAll(announce) {
    Promise.all([loadOrders(), loadStock(), loadReviews(), A.extraLoad()]).then(function () { if (announce) toast("Updated"); });
  }

  /* ---------- prompts + email preview ---------- */
  function showPrompt(t) { $("promptText").value = t; $("promptBox").hidden = false; $("promptBox").scrollIntoView({ block: "nearest" }); }
  $("p1Btn").addEventListener("click", function () { showPrompt(E.prompt1(orders)); });
  $("p2Btn").addEventListener("click", function () { showPrompt(E.prompt2(orders)); });
  $("promptCopy").addEventListener("click", function () { (navigator.clipboard ? navigator.clipboard.writeText($("promptText").value) : Promise.reject()).then(function () { toast("Prompt copied"); }, function () { $("promptText").select(); toast("Press Cmd+C to copy"); }); });
  $("previewBtn").addEventListener("click", function () {
    $("previewBox").hidden = !$("previewBox").hidden;
    var s = E.sampleOrder(), p = E.samplePre();
    $("previewConfirm").textContent = "Subject: " + E.subject(s, "confirm") + "\n\n" + E.text(s, "confirm");
    $("previewPre").textContent = "Subject: " + E.subject(p, "preorder") + "\n\n" + E.text(p, "preorder");
    $("previewDelivery").textContent = "Subject: " + E.subject(s, "delivery") + "\n\n" + E.text(s, "delivery");
  });

  /* ---------- orders ---------- */
  function loadOrders() {
    return sb.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(1000).then(function (r) {
      if (r.error) { $("orderList").innerHTML = '<p class="err">' + esc(r.error.message) + '</p>'; return; }
      orders = r.data || []; renderOrders(); fire();
    });
  }
  function isOpen(o) { return o.status !== "delivered" && o.status !== "cancelled"; }
  function renderStats() {
    var today = dayKey(new Date()), live = orders.filter(function (o) { return o.status !== "cancelled"; });
    var tOrders = live.filter(function (o) { return dayKey(o.created_at) === today; });
    var sum = function (a) { return a.reduce(function (s, o) { return s + o.total_fils; }, 0); };
    var count = function (st) { return orders.filter(function (o) { return o.status === st; }).length; };
    var preN = orders.filter(function (o) { return o.has_preorder && isOpen(o); }).length;
    var cells = [[tOrders.length, "Orders today"], [bd(sum(tOrders)), "Order value today"], [count("received"), "New (to confirm)"], [count("preparing"), "Confirmed (email due)"], [count("ready"), "Confirmed for delivery"], [preN, "Open orders with abroad items"], [live.length, "All orders"], [bd(sum(live)), "All order value"]];
    $("stats").innerHTML = cells.map(function (c) { return '<div class="stat"><b>' + esc(c[0]) + '</b><span>' + c[1] + '</span></div>'; }).join("");
    $("newBadge").textContent = count("received") ? "(" + count("received") + " new)" : "";
  }
  function matchFilter(o) {
    if (filter === "all") return true;
    if (filter === "active") return isOpen(o);
    if (filter === "pre") return o.has_preorder && isOpen(o);
    return o.status === filter;
  }
  function digits(p) { var d = String(p).replace(/[^0-9]/g, ""); return d.length === 8 ? "973" + d : d; }
  function renderOrders() {
    renderStats();
    var s = q.trim().toLowerCase();
    var list = orders.filter(matchFilter).filter(function (o) { return !s || o.code.toLowerCase().indexOf(s) > -1 || o.customer_name.toLowerCase().indexOf(s) > -1 || o.phone.indexOf(s) > -1; });
    if (!list.length) { $("orderList").innerHTML = '<p class="muted">No orders here yet.</p>'; return; }
    $("orderList").innerHTML = list.map(function (o) {
      var next = NEXT[o.status];
      var items = (o.order_items || []).map(function (i) { return '<li><span>' + i.qty + ' × ' + esc(i.name) + (i.preorder_qty ? ' <span class="pre-tag">' + i.preorder_qty + ' from abroad</span>' : '') + '</span><span>' + money(i.unit_price_fils * i.qty) + '</span></li>'; }).join("");
      var firstBtn = o.has_preorder ? ["preorder", "Email 2: Pre-order"] : ["confirm", "Email 1: Confirmation"];
      return '<details class="order" data-id="' + o.id + '"' + (openIds[o.id] ? " open" : "") + '>' +
        '<summary><span><span class="code">' + esc(o.code) + '</span> <span class="status ' + o.status + '">' + STATUS[o.status] + '</span>' + (o.has_preorder ? ' <span class="pre-tag">Abroad items</span>' : '') + (o.promo_code ? ' <span class="pre-tag" style="background:var(--color-pink)">' + esc(o.promo_code) + '</span>' : '') + '</span>' +
        '<span class="amt">' + bd(o.total_fils) + '</span><span class="sub">' + esc(o.customer_name) + ' · ' + fmt(o.created_at) + '</span></summary>' +
        '<div class="order__body"><div class="order__cols">' +
        '<div><h4>Customer</h4><p><b>' + esc(o.customer_name) + '</b></p><p><a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a> · <a href="https://wa.me/' + digits(o.phone) + '" target="_blank" rel="noopener">WhatsApp</a></p><p>' + esc(o.email) + '</p>' +
        '<h4 style="margin-top:8px">Delivery address</h4><p>' + esc(E.address(o)) + '</p>' + (o.notes ? '<h4 style="margin-top:8px">Notes</h4><p>' + esc(o.notes) + '</p>' : '') + '</div>' +
        '<div><h4>Items</h4><ul class="items-list">' + items + '</ul>' +
        '<div class="total-row"><span>Items price</span><span>' + bd(o.subtotal_fils) + '</span></div>' +
        (o.discount_fils ? '<div class="total-row"><span>Discount' + (o.promo_code ? ' (' + esc(o.promo_code) + ')' : '') + '</span><span>−' + bd(o.discount_fils) + '</span></div>' : '') +
        '<div class="total-row"><span>Delivery fee' + (o.delivery_block ? ' (block ' + o.delivery_block + ')' : '') + '</span><span>' + bd(o.delivery_fee_fils) + '</span></div><div class="total-row big"><span>Collect (cash)</span><span>' + bd(o.total_fils) + '</span></div></div></div>' +
        '<div class="actions">' +
        (next ? '<button class="btn btn--lime btn--sm" data-set="' + next[0] + '" data-id="' + o.id + '">' + next[1] + '</button>' : '') +
        '<button class="btn btn--ghost btn--sm" data-parcel="' + o.id + '">Copy for Parcel</button>' +
        '<a class="btn btn--ghost btn--sm" href="' + E.mailLink(o, firstBtn[0]) + '">' + firstBtn[1] + (o.confirm_emailed_at ? " ✓" : "") + '</a>' +
        '<a class="btn btn--ghost btn--sm" href="' + E.mailLink(o, "delivery") + '">Email 3: Delivery day' + (o.delivery_emailed_at ? " ✓" : "") + '</a>' +
        '<button class="btn btn--ghost btn--sm" data-sent="confirm_emailed_at" data-id="' + o.id + '">' + (o.confirm_emailed_at ? "Unmark confirmation sent" : "Mark confirmation sent") + '</button>' +
        '<button class="btn btn--ghost btn--sm" data-sent="delivery_emailed_at" data-id="' + o.id + '">' + (o.delivery_emailed_at ? "Unmark delivery email sent" : "Mark delivery email sent") + '</button>' +
        (isOpen(o) ? '<button class="btn btn--danger btn--sm" data-cancel="' + o.id + '">' + (confirmCancel === o.id ? "Tap again to cancel" : "Cancel order") + '</button>' : '') +
        (o.status === "cancelled" ? '<button class="btn btn--ghost btn--sm" data-set="received" data-id="' + o.id + '">Reopen</button>' : '') +
        '</div><div class="actions"><label class="field" style="grid-auto-flow:column;align-items:center;gap:8px">Parcel charged (fils)<input type="number" min="0" style="width:7rem" data-dcost="' + o.id + '" value="' + (o.delivery_cost_fils == null ? "" : o.delivery_cost_fils) + '" placeholder="' + o.delivery_fee_fils + '"></label><button class="btn btn--ghost btn--sm" data-dcsave="' + o.id + '">Save delivery cost</button></div></div></details>';
    }).join("");
  }
  $("orderFilters").addEventListener("click", function (e) {
    var b = e.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f;
    document.querySelectorAll("#orderFilters .tab").forEach(function (t) { t.setAttribute("aria-pressed", t === b ? "true" : "false"); }); renderOrders();
  });
  $("orderSearch").addEventListener("input", function (e) { q = e.target.value; renderOrders(); });
  $("orderList").addEventListener("toggle", function (e) { var d = e.target; if (d.dataset && d.dataset.id) openIds[d.dataset.id] = d.open; }, true);
  $("orderList").addEventListener("click", function (e) {
    var dcs = e.target.closest("[data-dcsave]");
    if (dcs) {
      var inp = document.querySelector('[data-dcost="' + dcs.dataset.dcsave + '"]'), val = parseInt(inp.value, 10);
      if (isNaN(val) || val < 0) { toast("Enter the Parcel price in fils"); return; }
      sb.rpc("set_delivery_cost", { p_order: dcs.dataset.dcsave, p_fils: val }).then(function (r) { if (r.error) { toast("Run the upgrade SQL first: " + r.error.message); return; } toast("Delivery cost saved"); loadAll(); });
      return;
    }
    var sent = e.target.closest("[data-sent]");
    if (sent) {
      var oo = orders.filter(function (x) { return x.id === sent.dataset.id; })[0], patch = {};
      patch[sent.dataset.sent] = oo[sent.dataset.sent] ? null : new Date().toISOString();
      sb.from("orders").update(patch).eq("id", sent.dataset.id).then(function (r) { if (r.error) { toast("Run the upgrade SQL first (email tracking)"); return; } loadOrders(); });
      return;
    }
    var set = e.target.closest("[data-set]"), par = e.target.closest("[data-parcel]"), can = e.target.closest("[data-cancel]");
    if (set) { setStatus(set.dataset.id, set.dataset.set); }
    else if (par) {
      var o = orders.filter(function (x) { return x.id === par.dataset.parcel; })[0];
      var txt = "Items price: " + bd(o.subtotal_fils - o.discount_fils) + "\nCollect (cash): " + bd(o.total_fils) + "\nPhone: " + o.phone + "\nLocation: " + E.address(o) + "\nOrder: " + o.code;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast("Copied for Parcel"); }, function () { toast("Copy failed"); });
    } else if (can) {
      if (confirmCancel === can.dataset.cancel) { confirmCancel = null; setStatus(can.dataset.cancel, "cancelled"); }
      else { confirmCancel = can.dataset.cancel; renderOrders(); setTimeout(function () { confirmCancel = null; }, 4000); }
    }
  });
  function setStatus(id, st) {
    sb.rpc("update_order_status", { p_order: id, p_status: st }).then(function (r) {
      if (r.error) { toast("Error: " + r.error.message); return; }
      toast("Status: " + STATUS[st]); loadAll();
    });
  }

  /* ---------- products & stock ---------- */
  function resizeToBlob(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 900, s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error("Could not read that image.")); }, "image/jpeg", 0.85);
      };
      img.onerror = function () { reject(new Error("That file is not an image.")); };
      img.src = url;
    });
  }
  function uploadPhoto(file) {
    return resizeToBlob(file).then(function (blob) {
      var path = "p-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
      return sb.storage.from("product-images").upload(path, blob, { contentType: "image/jpeg", upsert: false }).then(function (r) {
        if (r.error) throw new Error("Photo upload is not set up yet. Run the upgrade 3 SQL. (" + r.error.message + ")");
        return sb.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      });
    });
  }
  function loadStock() {
    return sb.from("products").select("*").order("sort").order("id").then(function (r) {
      products = r.data || []; fire();
      $("stockTable").innerHTML = '<tr><th>Photo</th><th>Name</th><th>Category</th><th>Sell price (fils)</th><th>Your cost (fils)</th><th>Stock</th><th>Low at</th><th>Pre-order OK</th><th>Show</th><th></th></tr>' + products.map(function (p) {
        return '<tr data-id="' + p.id + '"><td>' + (p.image ? '<img src="' + esc(p.image) + '" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:2px solid var(--color-ink);display:block;margin-bottom:4px">' : '<span class="muted">none</span><br>') +
          '<label class="link-btn" style="cursor:pointer">Change<input type="file" accept="image/*" hidden data-photo="' + p.id + '"></label></td>' +
          '<td><input type="text" data-k="name" value="' + esc(p.name) + '"></td>' +
          '<td><select data-k="category">' + Object.keys(CATS).map(function (k) { return '<option value="' + k + '"' + (k === p.category ? " selected" : "") + '>' + CATS[k] + '</option>'; }).join("") + '</select></td>' +
          '<td><input type="number" min="0" data-k="price_fils" value="' + p.price_fils + '"></td><td><input type="number" min="0" data-k="cost_fils" value="' + (p.cost_fils || 0) + '"></td>' +
          '<td><input type="number" min="0" data-k="stock" value="' + p.stock + '"></td><td><input type="number" min="0" data-k="reorder_level" value="' + (p.reorder_level == null ? 5 : p.reorder_level) + '"></td>' +
          '<td><input type="checkbox" data-k="allow_preorder"' + (p.allow_preorder === false ? "" : " checked") + '></td>' +
          '<td><input type="checkbox" data-k="active"' + (p.active ? " checked" : "") + '></td><td><button class="btn btn--sm" data-save="' + p.id + '">Save</button></td></tr>';
      }).join("");
    });
  }
  $("stockTable").addEventListener("click", function (e) {
    var b = e.target.closest("[data-save]"); if (!b) return;
    var tr = b.closest("tr"), v = {};
    tr.querySelectorAll("[data-k]").forEach(function (el) { var k = el.dataset.k; v[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? Math.max(0, parseInt(el.value || "0", 10)) : el.value.trim(); });
    sb.from("products").update(v).eq("id", Number(b.dataset.save)).then(function (r) { toast(r.error ? "Error: " + r.error.message + (/allow_preorder|cost_fils|reorder_level/.test(r.error.message) ? " (run the upgrade SQL)" : "") : "Saved"); loadStock(); });
  });
  $("stockTable").addEventListener("change", function (e) {
    var f = e.target.closest("[data-photo]"); if (!f || !f.files[0]) return;
    toast("Uploading photo…");
    uploadPhoto(f.files[0]).then(function (url) { return sb.from("products").update({ image: url }).eq("id", Number(f.dataset.photo)); })
      .then(function (r) { if (r && r.error) throw r.error; toast("Photo saved"); loadStock(); }, function (err) { toast(err.message); });
  });
  $("addProduct").addEventListener("submit", function (e) {
    e.preventDefault();
    var file = $("npFile").files[0];
    var make = function (url) {
      return sb.from("products").insert({ name: $("npName").value.trim(), category: $("npCat").value, price_fils: parseInt($("npPrice").value, 10), cost_fils: parseInt($("npCost").value || "0", 10), stock: parseInt($("npStock").value, 10), description: $("npDesc").value.trim(), image: url || null, allow_preorder: $("npPre").checked, sort: 100 });
    };
    (file ? uploadPhoto(file) : Promise.resolve(null)).then(make).then(function (r) {
      if (r.error) { toast("Error: " + r.error.message); return; }
      toast("Product added"); $("addProduct").reset(); loadStock();
    }, function (err) { toast(err.message); });
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
      var rows = r.data || [], today = dayKey(new Date()), uniq = {}; rows.forEach(function (x) { uniq[x.visitor_id] = 1; });
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
