/* Detention Club shared store code: config, products, cart, header/footer. */
(function () {
  "use strict";
  var cfg = window.DC_CONFIG || {};
  var EMAIL = "detentionclub0@gmail.com";
  var PREORDER_DAYS = "8-10";

  var CATS = {
    fidget:   { label: "Fidget & Stretch",    color: "var(--color-lime)" },
    squish:   { label: "Squish Zone",         color: "var(--color-pink)" },
    style:    { label: "Style & Accessories", color: "var(--color-orange)" },
    useful:   { label: "Cool & Useful",       color: "var(--color-blue)" },
    creative: { label: "Creative & Novelty",  color: "var(--color-yellow)" },
    special:  { label: "Special Finds",       color: "var(--color-paper-3)" }
  };

  // Shown only if Supabase is not connected yet (preview mode).
  var FALLBACK = [
    { id: 1, name: "Stretchy Toy", category: "fidget", price_fils: 300, stock: 24, description: "Stretch it, twist it, snap it back — endlessly fidget-friendly.", image: "images/stretchy-toy.jpeg" },
    { id: 2, name: "Fashionable Glasses", category: "style", price_fils: 500, stock: 30, description: "Bold, oversized frames that turn any outfit into a look.", image: "images/fashionable-glasses.jpeg" },
    { id: 3, name: "Cheer Megaphones", category: "style", price_fils: 500, stock: 4, description: "Get loud and proud — perfect for cheering on your favorites.", image: "images/cheer-megaphones.jpeg" },
    { id: 4, name: "Fidget Pop-Ups", category: "fidget", price_fils: 300, stock: 50, description: "The click-and-pop favorite, restocked and ready for recess.", image: "images/fidget-pop-ups.jpeg" },
    { id: 5, name: "Banana Squishies", category: "squish", price_fils: 700, stock: 10, description: "Slow-rise banana squishies, soft and satisfying to squeeze.", image: "images/banana-squishies.jpeg" },
    { id: 6, name: "3D-Printed Gradient Items", category: "creative", price_fils: 500, stock: 10, description: "Small printed shapes with a smooth color-gradient finish, one-of-a-kind desk decor.", image: "images/3d-printed-gradient-items.jpeg" },
    { id: 7, name: "Small Keychains", category: "style", price_fils: 200, stock: 50, description: "Clip-on keychains to decorate your bag or keys.", image: "images/small-keychains.jpeg" },
    { id: 8, name: "Silicone Cup Phone Holders", category: "useful", price_fils: 500, stock: 50, description: "A soft silicone cup stand that keeps your phone propped up and steady.", image: "images/silicone-cup-phone-holders.jpeg" },
    { id: 9, name: "Mini Colorful Rings", category: "style", price_fils: 300, stock: 48, description: "Tiny stackable rings in a rainbow of colors.", image: "images/mini-colorful-rings.jpeg" },
    { id: 10, name: "Watermelon Squishies", category: "squish", price_fils: 500, stock: 30, description: "Slow-rise watermelon slices, soft and satisfying to squeeze.", image: "images/watermelon-squishies.jpeg" },
    { id: 11, name: "Payment Star", category: "special", price_fils: 2000, stock: 2, description: "A rare special find — grab one before it is gone.", image: "images/payment-star.jpeg" },
    { id: 12, name: "Invisible Pens", category: "useful", price_fils: 500, stock: 20, description: "Write a secret message that only shows up under UV light.", image: "images/invisible-pens.jpeg" }
  ];

  var sb = null;
  if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); }
  function money(fils) { fils = Number(fils) || 0; return fils >= 1000 ? (fils / 1000).toFixed(3) + " BD" : fils + " fils"; }
  function moneyFull(fils) { return (Number(fils) / 1000).toFixed(3) + " BD"; }

  /* ---------- products ---------- */
  var products = [];
  var live = false;
  function loadProducts() {
    if (!sb) { products = FALLBACK.slice(); live = false; return Promise.resolve(products); }
    return sb.from("products").select("*").eq("active", true).order("sort").order("id").then(function (r) {
      if (r.error || !r.data || !r.data.length) { products = FALLBACK.slice(); live = false; }
      else { products = r.data; live = true; }
      return products;
    }, function () { products = FALLBACK.slice(); live = false; return products; });
  }
  function byId(id) { for (var i = 0; i < products.length; i++) if (products[i].id === Number(id)) return products[i]; return null; }

  /* ---------- cart (saved in this browser) ---------- */
  var cart = {};
  try { cart = JSON.parse(localStorage.getItem("dc_cart") || "{}") || {}; } catch (e) { cart = {}; }
  var listeners = [];
  function saveCart() { try { localStorage.setItem("dc_cart", JSON.stringify(cart)); } catch (e) {} listeners.forEach(function (f) { f(); }); }
  function cartCount() { var n = 0; for (var k in cart) n += cart[k]; return n; }
  function addToCart(id, n) { id = String(id); cart[id] = Math.min(20, (cart[id] || 0) + (n || 1)); saveCart(); }
  function setQty(id, q) { id = String(id); if (q <= 0) delete cart[id]; else cart[id] = Math.min(20, q); saveCart(); }
  function clearCart() { cart = {}; saveCart(); }
  function cartLines() {
    var out = [];
    for (var k in cart) {
      var p = byId(k);
      if (!p) continue;
      var qty = cart[k];
      var pre = Math.max(0, qty - p.stock);
      out.push({ p: p, qty: qty, pre: pre, total: p.price_fils * qty });
    }
    return out;
  }
  function cartSubtotal() { return cartLines().reduce(function (s, l) { return s + l.total; }, 0); }

  /* ---------- header / footer / drawer ---------- */
  function mountChrome(active) {
    var base = document.getElementById("chrome-header");
    if (base) {
      base.outerHTML =
        '<div class="site-header"><header class="nav"><div class="wrap nav__inner">' +
        '<a href="index.html" class="wordmark" aria-label="Detention Club home">DETENTION<span class="dot">•</span>CLUB</a>' +
        '<nav aria-label="Primary"><ul class="nav__links">' +
        '<li><a href="index.html">Home</a></li><li><a href="index.html#shop">Shop</a></li>' +
        '<li><a href="track.html">Track Order</a></li><li><a href="index.html#about">About Us</a></li><li><a href="index.html#contact">Contact</a></li>' +
        '</ul></nav>' +
        '<div class="nav__right"><button class="btn btn--sm cart-btn" id="cartBtn" aria-label="Open cart">Cart <span class="cart-count" id="cartCount" data-n="0">0</span></button>' +
        '<button class="hamburger" id="hamburgerBtn" aria-label="Open menu" aria-expanded="false" aria-controls="mobileMenu"><span></span></button></div>' +
        '</div><nav id="mobileMenu" class="wrap" aria-label="Mobile">' +
        '<a href="index.html">Home</a><a href="index.html#shop">Shop</a><a href="track.html">Track Order</a><a href="index.html#about">About Us</a><a href="index.html#contact">Contact</a>' +
        '</nav></header></div>';
    }
    var foot = document.getElementById("chrome-footer");
    if (foot) {
      foot.outerHTML =
        '<footer><div class="wrap">' +
        '<p class="foot-statement">SQUISH <span class="hl">•</span> STRETCH <span class="hl">•</span> POP <span class="hl">•</span> PLAY</p>' +
        '<p style="font-family:var(--font-display);font-weight:800;margin-top:var(--space-sm);">DETENTION CLUB</p>' +
        '<div class="foot-meta"><a href="index.html#shop">Shop</a><a href="track.html">Track your order</a><a href="terms.html">Terms &amp; Privacy</a>' +
        '<a href="mailto:' + EMAIL + '">' + EMAIL + '</a><a href="admin.html">Admin</a><span>Cash on delivery</span></div>' +
        '<p class="foot-copy">Created by ALI.Y, DANNY &amp; ABR. A student-run business in Bahrain.</p>' +
        '</div></footer>';
    }
    if (!sb) {
      var bar = document.createElement("div");
      bar.className = "notice";
      bar.style.cssText = "text-align:center;border-radius:0;border-width:0 0 3px 0;margin-inline:calc(-1 * clamp(1rem,4vw,2rem));";
      bar.textContent = "Online ordering is opening soon. You can browse the shop now.";
      document.body.insertBefore(bar, document.body.firstChild);
    }
    var d = document.createElement("div");
    d.innerHTML =
      '<div class="drawer-scrim" id="drawerScrim"></div>' +
      '<aside class="drawer" id="drawer" aria-label="Your cart" aria-hidden="true">' +
      '<div class="drawer__head"><h2>Your cart</h2><button class="icon-btn" id="drawerClose" aria-label="Close cart">×</button></div>' +
      '<div class="drawer__body" id="drawerBody"></div><div class="drawer__foot" id="drawerFoot"></div></aside>';
    document.body.appendChild(d);

    var hb = document.getElementById("hamburgerBtn"), mm = document.getElementById("mobileMenu");
    if (hb) hb.addEventListener("click", function () { var o = mm.classList.toggle("open"); hb.setAttribute("aria-expanded", o ? "true" : "false"); });
    document.getElementById("cartBtn").addEventListener("click", openDrawer);
    document.getElementById("drawerClose").addEventListener("click", closeDrawer);
    document.getElementById("drawerScrim").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });
    document.getElementById("drawerBody").addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      var id = b.getAttribute("data-id"), cur = cart[id] || 0, a = b.getAttribute("data-act");
      if (a === "inc") setQty(id, cur + 1); else if (a === "dec") setQty(id, cur - 1); else if (a === "rm") setQty(id, 0);
    });
    listeners.push(renderDrawer);
    renderDrawer();
  }
  function openDrawer() { document.getElementById("drawer").classList.add("open"); document.getElementById("drawerScrim").classList.add("open"); document.getElementById("drawer").setAttribute("aria-hidden", "false"); }
  function closeDrawer() { var d = document.getElementById("drawer"); if (!d) return; d.classList.remove("open"); document.getElementById("drawerScrim").classList.remove("open"); d.setAttribute("aria-hidden", "true"); }
  function renderDrawer() {
    var n = cartCount(), c = document.getElementById("cartCount");
    if (c) { c.textContent = n; c.setAttribute("data-n", n); }
    var body = document.getElementById("drawerBody"), foot = document.getElementById("drawerFoot");
    if (!body) return;
    var lines = cartLines();
    if (!lines.length) {
      body.innerHTML = '<p class="muted">Your cart is empty. Pick something fun from the shop.</p>';
      foot.innerHTML = '<a class="btn btn--block" href="index.html#shop">Browse the shop</a>';
      return;
    }
    body.innerHTML = lines.map(function (l) {
      var img = l.p.image ? '<img src="' + esc(l.p.image) + '" alt="">' : '<div class="ph"></div>';
      return '<div class="line">' + img + '<div><b>' + esc(l.p.name) + '</b><span class="price">' + money(l.p.price_fils) + '</span>' +
        '<div class="qty"><button data-act="dec" data-id="' + l.p.id + '" aria-label="Fewer">−</button><span>' + l.qty + '</span><button data-act="inc" data-id="' + l.p.id + '" aria-label="More">+</button></div>' +
        (l.pre ? '<div class="stock-note pre">' + l.pre + ' pre-order · ' + PREORDER_DAYS + ' days</div>' : '') + '</div>' +
        '<div style="text-align:right"><span class="price">' + money(l.total) + '</span><br><button class="link-btn" data-act="rm" data-id="' + l.p.id + '">Remove</button></div></div>';
    }).join("");
    var hasPre = lines.some(function (l) { return l.pre > 0; });
    foot.innerHTML = '<div class="total-row"><span>Items</span><span class="price">' + money(cartSubtotal()) + '</span></div>' +
      '<p class="stock-note">Delivery fee is added at checkout by area. Pay cash on delivery.</p>' +
      (hasPre ? '<p class="notice blue">Some items are pre-order and take ' + PREORDER_DAYS + ' days.</p>' : '') +
      '<a class="btn btn--block" href="checkout.html">Checkout</a>';
  }

  /* ---------- visit counter (anonymous) ---------- */
  function logView() {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
    var id;
    try { id = localStorage.getItem("dc_vid"); if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem("dc_vid", id); } } catch (e) { id = "anon-" + Math.random().toString(36).slice(2); }
    var ref = ""; try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
    if (ref === location.hostname) ref = "";
    fetch(cfg.supabaseUrl + "/rest/v1/page_views", {
      method: "POST",
      headers: { apikey: cfg.supabaseAnonKey, Authorization: "Bearer " + cfg.supabaseAnonKey, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ visitor_id: id, path: location.pathname, referrer: ref, device: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop" }),
      keepalive: true
    }).catch(function () {});
  }

  window.DC = {
    cfg: cfg, sb: sb, EMAIL: EMAIL, PREORDER_DAYS: PREORDER_DAYS, CATS: CATS,
    esc: esc, money: money, moneyFull: moneyFull,
    loadProducts: loadProducts, byId: byId, isLive: function () { return live; }, products: function () { return products; },
    cart: cart, addToCart: addToCart, setQty: setQty, clearCart: clearCart, cartLines: cartLines, cartSubtotal: cartSubtotal, cartCount: cartCount,
    openDrawer: openDrawer, mountChrome: mountChrome, onCart: function (f) { listeners.push(f); }, logView: logView
  };
})();
