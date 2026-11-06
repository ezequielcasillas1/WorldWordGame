import { siteUrl } from "./constants.js";
import { runNotificationCron, sendConfirmationEmail } from "./cron.js";
import { empty, html, json, readJsonBody } from "./http.js";
import { createEmailRepository } from "./repository.js";
import { normalizeEmail, normalizeTrackedWord } from "./validate.js";
import { clientIp, sha256Hex } from "./tokens.js";

function statusPage(env, { title, message, ok }) {
  const home = siteUrl(env);
  const accent = ok ? "#6aaa64" : "#787c7e";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} · World Word</title>
<style>
body{font-family:'Clear Sans',system-ui,sans-serif;background:#f6f7f8;color:#1a1a1b;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
.card{max-width:420px;background:#fff;border:1px solid #d3d6da;border-radius:12px;padding:28px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.06);}
h1{font-size:22px;margin:0 0 12px;}
p{color:#565758;line-height:1.5;}
a{color:${accent};font-weight:700;}
@media (prefers-color-scheme:dark){body{background:#121213;color:#fff;}.card{background:#1a1a1b;border-color:#3a3a3c;}p{color:#d7dadc;}}
</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p><p><a href="${home}">Back to World Word</a></p></div></body></html>`;
}

async function handleSubscribe(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ ok: false, error: parsed.error, code: parsed.code }, 400);
  }
  const email = normalizeEmail(parsed.body.email);
  const word = normalizeTrackedWord(parsed.body.word);
  if (!email) {
    return json({ ok: false, error: "Enter a valid email address.", code: "INVALID_EMAIL" }, 400);
  }
  if (!word) {
    return json({ ok: false, error: "Missing or invalid word to track.", code: "INVALID_WORD" }, 400);
  }

  const repo = createEmailRepository(env.DB);
  const ipHash = await sha256Hex(`ip:${clientIp(request)}`);
  const emailHash = await sha256Hex(`email:${email}`);
  const ipLimit = await repo.checkRateLimit(
    `signup:ip:${ipHash}`,
    repo.signupRateConfig.ipMaxPerHour,
    repo.signupRateConfig.ipWindowMs
  );
  if (!ipLimit.ok) {
    return json({ ok: false, error: ipLimit.error, code: ipLimit.code }, 429);
  }
  const emailLimit = await repo.checkRateLimit(
    `signup:email:${emailHash}`,
    repo.signupRateConfig.emailMaxPerDay,
    repo.signupRateConfig.emailWindowMs
  );
  if (!emailLimit.ok) {
    return json({ ok: false, error: emailLimit.error, code: emailLimit.code }, 429);
  }

  const created = await repo.createPendingSubscription(email, word);
  if (!created.ok) {
    return json({ ok: false, error: created.error, code: created.code }, 409);
  }

  let confirmToken = created.confirmToken;
  let unsubscribeToken = created.unsubscribeToken;
  if (created.resent && confirmToken) {
    const row = await repo.findByConfirmToken(confirmToken);
    if (row?.unsubscribe_token) unsubscribeToken = String(row.unsubscribe_token);
  }

  const sendResult = await sendConfirmationEmail(env, {
    email,
    word,
    confirmToken,
    unsubscribeToken,
  });
  if (!sendResult.ok) {
    return json({ ok: false, error: sendResult.error || "Could not send confirmation email." }, 502);
  }

  return json({
    ok: true,
    message: "Check your inbox to confirm email updates.",
    pending: true,
  });
}

async function handleConfirm(request, env, url) {
  const token = String(url.searchParams.get("token") || "").trim();
  if (!token) {
    return html(
      statusPage(env, { title: "Invalid link", message: "This confirmation link is missing a token.", ok: false }),
      400
    );
  }
  const repo = createEmailRepository(env.DB);
  const row = await repo.findByConfirmToken(token);
  if (!row) {
    return html(
      statusPage(env, { title: "Link not found", message: "This confirmation link is invalid or expired.", ok: false }),
      404
    );
  }
  if (row.status === "confirmed") {
    return html(
      statusPage(env, {
        title: "Already confirmed",
        message: `You're already subscribed to updates for ${String(row.word).toUpperCase()}.`,
        ok: true,
      })
    );
  }
  if (row.status === "unsubscribed") {
    return html(
      statusPage(env, {
        title: "Subscription ended",
        message: "This subscription was unsubscribed. Submit the word again on the site to re-subscribe.",
        ok: false,
      }),
      410
    );
  }
  await repo.confirmSubscription(row.id);
  const stats = await repo.getWordStats(String(row.word));
  await repo.updateSubscriptionAfterNotify(row.id, {
    last_notified_rank: stats.rank,
    last_notified_count: stats.count,
    milestones_sent: [],
  });
  return html(
    statusPage(env, {
      title: "You're subscribed!",
      message: `We'll email you when ${String(row.word).toUpperCase()} moves on the leaderboard, hits milestones, or tops the chart.`,
      ok: true,
    })
  );
}

async function handleUnsubscribe(request, env, url) {
  let token = String(url.searchParams.get("token") || "").trim();

  if (request.method === "POST" && !token) {
    const contentType = String(request.headers.get("content-type") || "");
    if (contentType.includes("application/json")) {
      const parsed = await readJsonBody(request, 2048);
      if (parsed.ok && parsed.body.token) token = String(parsed.body.token).trim();
    } else {
      try {
        const form = await request.text();
        const match = form.match(/(?:^|&)token=([^&]+)/);
        if (match) token = decodeURIComponent(match[1]);
      } catch (_err) {
        // ignore
      }
    }
  }

  if (!token) {
    if (request.method === "POST") return json({ ok: false, error: "Missing token." }, 400);
    return html(
      statusPage(env, { title: "Invalid link", message: "This unsubscribe link is missing a token.", ok: false }),
      400
    );
  }

  const repo = createEmailRepository(env.DB);
  const row = await repo.findByUnsubscribeToken(token);
  if (!row) {
    if (request.method === "POST") return json({ ok: false, error: "Unknown token." }, 404);
    return html(
      statusPage(env, { title: "Link not found", message: "This unsubscribe link is invalid.", ok: false }),
      404
    );
  }

  await repo.unsubscribe(row.id);
  if (request.method === "POST") {
    return json({ ok: true, message: "Unsubscribed." });
  }
  return html(
    statusPage(env, {
      title: "Unsubscribed",
      message: `You will no longer receive updates for ${String(row.word).toUpperCase()}.`,
      ok: true,
    })
  );
}

export async function handleEmailApi(request, env, url) {
  if (request.method === "OPTIONS") return empty(204);
  const path = url.pathname;
  try {
    if (path === "/api/email/subscribe" && request.method === "POST") {
      return handleSubscribe(request, env);
    }
    if (path === "/api/email/confirm" && request.method === "GET") {
      return handleConfirm(request, env, url);
    }
    if (path === "/api/email/unsubscribe" && (request.method === "GET" || request.method === "POST")) {
      return handleUnsubscribe(request, env, url);
    }
    if (
      path === "/api/email/subscribe" ||
      path === "/api/email/confirm" ||
      path === "/api/email/unsubscribe"
    ) {
      return json({ ok: false, error: "Method not allowed." }, 405);
    }
    return json({ ok: false, error: "Not found." }, 404);
  } catch (err) {
    console.error(
      JSON.stringify({
        message: "email api failed",
        path,
        error: err instanceof Error ? err.message : "unknown",
      })
    );
    return json({ ok: false, error: "The request could not be completed." }, 500);
  }
}

export async function handleEmailCron(controller, env) {
  const cronExpr = String(controller.cron || "");
  const weekly = /0\s+15\s+\*\s+\*\s+0/.test(cronExpr);
  try {
    const result = await runNotificationCron(env, { weekly });
    console.log(JSON.stringify({ message: "email cron complete", cron: cronExpr, ...result }));
  } catch (err) {
    console.error(
      JSON.stringify({
        message: "email cron failed",
        cron: cronExpr,
        error: err instanceof Error ? err.message : "unknown",
      })
    );
  }
}
