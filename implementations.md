### 2026-11-06 - SEO, share loop, discoverable content
**Status:** SUCCESS (user confirmed)
**Files:** index.html, about.html, app.js, config.js, analytics.js, robots.txt, sitemap.xml, site.webmanifest, og-image.png, styles.css
**Result:** Merged PR #1 to main. Pages deploy succeeded to `worldwordgame.pages.dev`; custom domain `worldwordgame.com` pending DNS activation in dashboard (apex still serves pre-SEO HTML until then). `/api/*` on .com unchanged.

### 2026-11-06 - Smart phrase submissions
**Status:** PARTIAL (awaiting user SUCCESS confirm)
**Files:** phraseSense.js, app.js, index.html, styles.css, about.html, server/phraseValidation.mjs, server/worker-src/index.js
**Result:** Word|Phrase mode + multi-layer sense guard (structure, Wiktionary, LanguageTool); Worker patched for phrase `/api/submit`.
