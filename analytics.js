(function () {
  "use strict";
  var cfg = window.WORLDWORD_SITE;
  if (!cfg || !cfg.cloudflareWebAnalyticsToken) {
    return;
  }
  var token = String(cfg.cloudflareWebAnalyticsToken).trim();
  if (!token) {
    return;
  }
  var script = document.createElement("script");
  script.defer = true;
  script.src = "https://static.cloudflareinsights.com/beacon.min.js";
  script.setAttribute("data-cf-beacon", JSON.stringify({ token: token }));
  document.head.appendChild(script);
})();
