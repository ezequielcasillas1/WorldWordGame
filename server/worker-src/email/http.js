export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Visitor-Id, Visitor-Id, List-Unsubscribe, List-Unsubscribe-Post",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

export function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...SECURITY_HEADERS,
    },
  });
}

export function empty(status = 204) {
  return new Response(null, { status, headers: SECURITY_HEADERS });
}

export async function readJsonBody(request, maxChars = 4096) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxChars) {
    return { ok: false, error: "Request body is too large.", code: "BODY_TOO_LARGE" };
  }
  let text = "";
  try {
    text = await request.text();
  } catch (_err) {
    return { ok: false, error: "Could not read the request body.", code: "BODY_UNREADABLE" };
  }
  if (text.length > maxChars) {
    return { ok: false, error: "Request body is too large.", code: "BODY_TOO_LARGE" };
  }
  if (!text.trim()) {
    return { ok: true, body: {} };
  }
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, error: "Request body must be a JSON object.", code: "INVALID_JSON" };
    }
    return { ok: true, body };
  } catch (_err) {
    return { ok: false, error: "Request body must be valid JSON.", code: "INVALID_JSON" };
  }
}
