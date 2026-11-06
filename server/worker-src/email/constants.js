export const MILESTONE_THRESHOLDS = [10, 50, 100, 200, 500, 1000, 2500, 5000, 10000];

export const RANK_EMAIL_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const SIGNUP_RATE = {
  ipMaxPerHour: 8,
  emailMaxPerDay: 5,
  ipWindowMs: 60 * 60 * 1000,
  emailWindowMs: 24 * 60 * 60 * 1000,
};

export const EMAIL_REGEX =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function siteUrl(env) {
  const raw = String(env.PUBLIC_SITE_URL || env.SITE_URL || "https://worldwordgame.com").trim();
  return raw.replace(/\/+$/, "");
}

export function fromAddress(env) {
  return String(env.EMAIL_FROM || "updates@worldwordgame.com").trim();
}
