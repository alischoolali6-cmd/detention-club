(function () {
  var c = window.DC_CONFIG || {};
  if (!c.supabaseUrl || !c.supabaseAnonKey) return;
  var id;
  try {
    id = localStorage.getItem("dc_vid");
    if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem("dc_vid", id); }
  } catch (e) { id = "anon-" + Math.random().toString(36).slice(2); }
  var ref = "";
  try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
  if (ref === location.hostname) ref = "";
  fetch(c.supabaseUrl + "/rest/v1/page_views", {
    method: "POST",
    headers: { apikey: c.supabaseAnonKey, Authorization: "Bearer " + c.supabaseAnonKey, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ visitor_id: id, path: location.pathname, referrer: ref, device: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop" }),
    keepalive: true
  }).catch(function () {});
})();
