### 2026-11-06 - Smart phrase input
**Status:** PARTIAL (awaiting user SUCCESS confirm)
**Files:** phraseSense.js, app.js, index.html, styles.css, about.html, server/phraseValidation.mjs, server/worker-src/index.js, functions/api/[[path]].js
**Result:** Phrase mode + sense checks live on worldwordgame.com via Cloudflare Pages deploy (Actions run 42168879058 → https://a78a0b1e.worldwordgame.pages.dev). Custom domain serves Word|Phrase toggle + phraseSense.js; `/api/submit` accepts `good morning`, rejects `asdf qwer` with SPELLING_GIBBERISH. Worker GitHub Action failed (token lacks Workers service access); phrase API already live on Worker from earlier surgical deploy. PR #4 merged.

### 2026-11-06 - Deploy surface notes
**Status:** PARTIAL
**Files:** .github/workflows/deploy-cloudflare-pages.yml, .github/workflows/deploy-worker.yml
**Result:** `.com` is Pages (not Worker assets). Pages owns UI; Pages Function proxies `/api/*` to `worldwordgame.ezequielcasillas1.workers.dev`. Remaining risk: Worker workflow cannot redeploy until Cloudflare API token gains Workers edit scope.
