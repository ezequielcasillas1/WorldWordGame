# World Word

Global word frequency game at [worldwordgame.com](https://worldwordgame.com).

## Content moderation

- **Blocked:** discriminatory / hate slurs only
- **Allowed:** swears and general vulgarity
- **Exceptions:** edit `ALLOWLIST_EXCEPTIONS` in `moderation.js` and `server/wordModeration.mjs`
- **Blocklist adjustments:** edit `DISCRIMINATORY_TERMS` in those same files

Client (`moderation.js`) stops blocked submits in the UI and hides them on the leaderboard/stats.

Server enforcement needs the live Worker updated with `server/wordModeration.mjs` (Cloudflare access required). Until then, direct API calls can still bypass the client check.

## Scripts

```bash
npm test
npm start
```
