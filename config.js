/**
 * Site configuration — edit values here (no build step required).
 * Set cloudflareWebAnalyticsToken to your Cloudflare Web Analytics token to enable the beacon.
 */
window.WORLDWORD_SITE = Object.freeze({
  url: "https://worldwordgame.com",
  name: "World Word",
  tagline: "Global Word Frequency Game",
  launchDate: "2026-03-20",
  utmDefaults: {
    source: "share",
    medium: "social",
    campaign: "result",
  },
  /** Leave empty to disable analytics. Get a token: Cloudflare Dashboard → Web Analytics → Add a site. */
  cloudflareWebAnalyticsToken: "",
});
