# Worker phrase support

Patched live Worker `worldwordgame` (`server/worker-src/index.js`) to accept:
- `type: "phrase"` or multi-word `word` / `phrase`
- per-token dictionary checks
- LanguageTool sense guard
- existing discriminatory moderation per token

Redeploy from this file when the Worker needs updating.
