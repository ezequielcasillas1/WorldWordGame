# World Word — Global Word Frequency Game

Static frontend for [worldwordgame.com](https://worldwordgame.com/). Deploy the repo root to Cloudflare Pages (API routes are served separately on the same domain).

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
