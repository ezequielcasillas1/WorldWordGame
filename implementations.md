### 2026-11-06 - SEO, share loop, discoverable content
**Status:** SUCCESS (user confirmed)
**Files:** index.html, about.html, app.js, config.js, analytics.js, robots.txt, sitemap.xml, site.webmanifest, og-image.png, styles.css
**Result:** Merged PR #1 to main. Pages deploy succeeded to `worldwordgame.pages.dev`; custom domain `worldwordgame.com` pending DNS activation in dashboard (apex still serves pre-SEO HTML until then). `/api/*` on .com unchanged.

### 2026-11-06 - Email word updates (opt-in)
**Status:** PARTIAL (PR open; awaiting deploy + user SUCCESS)
**Files:** server/worker-src/email/*, server/migrations/0002_email_subscriptions.sql, index.html, app.js, styles.css, docs/email-previews/*
**Result:** Double opt-in subscriptions, Resend templates, cron triggers, site opt-in UI on branch `cursor/email-updates-0235`.
