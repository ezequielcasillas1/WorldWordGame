import core from "./core.bundle.js";
import { handleEmailApi, handleEmailCron } from "./email/handlers.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/email" || url.pathname.startsWith("/api/email/")) {
      return handleEmailApi(request, env, url);
    }
    return core.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(handleEmailCron(controller, env));
  },
};
