### [2026-11-05] - Discriminatory word filter
**Status:** SUCCESS
**Files:** moderation.js, app.js, index.html, server/wordModeration.mjs, worker (live)
**Result:** Live Worker `/api/submit` returns DISCRIMINATORY_WORD; swears/exceptions allowed. Client assets in repo; static `/moderation.js` not yet on CDN.

### [2026-11-05] - Live Worker deploy
**Status:** SUCCESS
**Files:** Cloudflare Worker `worldwordgame`
**Result:** Patched + deployed via CF API; verified block/allow on worldwordgame.com.
