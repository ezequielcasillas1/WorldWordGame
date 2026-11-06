# World Word — Global Word Frequency Game

Static frontend for [worldwordgame.com](https://worldwordgame.com/).

## Deploy (Cloudflare Pages)

**GitHub Actions (recommended):** add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Pushes to `main` run `.github/workflows/deploy-cloudflare-pages.yml`. If your Pages project name is not `worldwordgame`, edit `CLOUDFLARE_PAGES_PROJECT_NAME` in that workflow.

**Local CLI (if you are already logged in with Wrangler):**

```bash
npm ci && npm test && npm run deploy
```

Static assets only — keep your existing Worker/API routes for `/api/*` unchanged in the Cloudflare dashboard.

**Custom domain:** apex DNS should point at Pages (`CNAME` `@` → `worldwordgame.pages.dev`, proxied). If `/sitemap.xml` or `/og-image.png` 404 on `.com` but work on `worldwordgame.pages.dev`, the apex is not fully on Pages yet—finish **Custom domains** in the Pages project and remove catch-all Worker routes.

## Local preview

```bash
npm test
npm start
```

Open `http://localhost:4173`. Word submission requires the live `/api/*` backend on the deployed domain.

## Analytics

Set `cloudflareWebAnalyticsToken` in `config.js` to enable Cloudflare Web Analytics (leave empty to disable).

## Assets

- `og-image.png` — 1200×630 Open Graph / Twitter card image
- `npm run generate:assets` — regenerate favicons from `favicon.svg` (requires `sharp`)
