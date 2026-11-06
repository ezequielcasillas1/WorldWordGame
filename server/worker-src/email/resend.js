import { fromAddress, siteUrl } from "./constants.js";

export async function sendViaResend(env, { to, subject, html, text, headers = {} }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(JSON.stringify({ message: "RESEND_API_KEY missing" }));
    return { ok: false, error: "Email service is not configured." };
  }
  const from = fromAddress(env);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
      headers,
    }),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (_err) {
    payload = null;
  }
  if (!response.ok) {
    console.error(
      JSON.stringify({
        message: "resend send failed",
        status: response.status,
        payload,
      })
    );
    return { ok: false, error: "Could not send email.", detail: payload };
  }
  return { ok: true, id: payload?.id };
}

export function listUnsubscribeHeaders(unsubscribeUrl) {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function buildUnsubscribeUrl(env, token) {
  return `${siteUrl(env)}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function buildConfirmUrl(env, token) {
  return `${siteUrl(env)}/api/email/confirm?token=${encodeURIComponent(token)}`;
}

export function buildPlayUrl(env) {
  return siteUrl(env);
}
