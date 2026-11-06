import { SIGNUP_RATE } from "./constants.js";
import { newToken } from "./tokens.js";

function parseMilestones(raw) {
  try {
    const arr = JSON.parse(String(raw || "[]"));
    return Array.isArray(arr) ? arr.filter((n) => Number.isFinite(Number(n))).map(Number) : [];
  } catch (_err) {
    return [];
  }
}

export function createEmailRepository(db) {
  async function checkRateLimit(bucketKey, max, windowMs) {
    const now = Date.now();
    const row = await db
      .prepare("SELECT count, window_ends_at FROM email_signup_rate WHERE bucket_key = ?")
      .bind(bucketKey)
      .first();
    const ends = row?.window_ends_at ? Date.parse(String(row.window_ends_at)) : 0;
    if (!row || !Number.isFinite(ends) || ends <= now) {
      const windowEnds = new Date(now + windowMs).toISOString();
      await db
        .prepare(
          `INSERT INTO email_signup_rate (bucket_key, count, window_ends_at)
           VALUES (?, 1, ?)
           ON CONFLICT(bucket_key) DO UPDATE SET count = 1, window_ends_at = excluded.window_ends_at`
        )
        .bind(bucketKey, windowEnds)
        .run();
      return { ok: true };
    }
    const count = Number(row.count || 0);
    if (count >= max) {
      return { ok: false, code: "RATE_LIMIT", error: "Too many signup attempts. Try again later." };
    }
    await db
      .prepare("UPDATE email_signup_rate SET count = count + 1 WHERE bucket_key = ?")
      .bind(bucketKey)
      .run();
    return { ok: true };
  }

  async function createPendingSubscription(email, word) {
    const confirmToken = newToken();
    const unsubscribeToken = newToken();
    const createdAt = new Date().toISOString();
    try {
      await db
        .prepare(
          `INSERT INTO email_subscriptions
           (email, word, status, confirm_token, unsubscribe_token, created_at, milestones_sent)
           VALUES (?, ?, 'pending', ?, ?, ?, '[]')`
        )
        .bind(email, word, confirmToken, unsubscribeToken, createdAt)
        .run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("UNIQUE")) {
        const existing = await db
          .prepare("SELECT status, confirm_token FROM email_subscriptions WHERE email = ? AND word = ?")
          .bind(email, word)
          .first();
        if (existing?.status === "confirmed") {
          return { ok: false, code: "ALREADY_SUBSCRIBED", error: "You are already subscribed to updates for this word." };
        }
        if (existing?.status === "pending") {
          return {
            ok: true,
            resent: true,
            confirmToken: String(existing.confirm_token),
            unsubscribeToken: null,
          };
        }
        if (existing?.status === "unsubscribed") {
          await db
            .prepare(
              `UPDATE email_subscriptions SET status = 'pending', confirm_token = ?, unsubscribe_token = ?,
               created_at = ?, confirmed_at = NULL, unsubscribed_at = NULL,
               last_notified_rank = NULL, last_rank_email_at = NULL, last_notified_count = NULL,
               milestones_sent = '[]', sent_rank_one_at = NULL
               WHERE email = ? AND word = ?`
            )
            .bind(confirmToken, unsubscribeToken, createdAt, email, word)
            .run();
          return { ok: true, confirmToken, unsubscribeToken };
        }
      }
      throw err;
    }
    return { ok: true, confirmToken, unsubscribeToken };
  }

  async function findByConfirmToken(token) {
    return db
      .prepare("SELECT * FROM email_subscriptions WHERE confirm_token = ? LIMIT 1")
      .bind(token)
      .first();
  }

  async function findByUnsubscribeToken(token) {
    return db
      .prepare("SELECT * FROM email_subscriptions WHERE unsubscribe_token = ? LIMIT 1")
      .bind(token)
      .first();
  }

  async function confirmSubscription(id) {
    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE email_subscriptions SET status = 'confirmed', confirmed_at = ?
         WHERE id = ? AND status = 'pending'`
      )
      .bind(now, id)
      .run();
  }

  async function unsubscribe(id) {
    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE email_subscriptions SET status = 'unsubscribed', unsubscribed_at = ?
         WHERE id = ? AND status != 'unsubscribed'`
      )
      .bind(now, id)
      .run();
  }

  async function listConfirmedSubscriptions(limit = 500, offset = 0) {
    const { results } = await db
      .prepare(
        `SELECT * FROM email_subscriptions WHERE status = 'confirmed'
         ORDER BY id ASC LIMIT ? OFFSET ?`
      )
      .bind(limit, offset)
      .all();
    return (results || []).map((row) => ({
      ...row,
      milestones_sent: parseMilestones(row.milestones_sent),
    }));
  }

  async function getWordStats(word) {
    const countRow = await db
      .prepare("SELECT COUNT(*) AS count FROM submissions WHERE word = ?")
      .bind(word)
      .first();
    const rankRow = await db
      .prepare(
        `SELECT rank FROM (
           SELECT word, ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, word ASC) AS rank
           FROM submissions GROUP BY word
         ) WHERE word = ?`
      )
      .bind(word)
      .first();
    const totalRow = await db.prepare("SELECT COUNT(*) AS total FROM submissions").first();
    const count = Number(countRow?.count || 0);
    const rank = count > 0 ? Number(rankRow?.rank || 0) : null;
    const total = Number(totalRow?.total || 0);
    const sharePercent = total > 0 && count > 0 ? Number(((count / total) * 100).toFixed(2)) : 0;
    return { word, count, rank, totalSubmissions: total, sharePercent };
  }

  async function updateSubscriptionAfterNotify(id, patch) {
    const milestones = patch.milestones_sent ? JSON.stringify(patch.milestones_sent) : undefined;
    await db
      .prepare(
        `UPDATE email_subscriptions SET
           last_notified_rank = COALESCE(?, last_notified_rank),
           last_rank_email_at = COALESCE(?, last_rank_email_at),
           last_notified_count = COALESCE(?, last_notified_count),
           milestones_sent = COALESCE(?, milestones_sent),
           sent_rank_one_at = COALESCE(?, sent_rank_one_at)
         WHERE id = ?`
      )
      .bind(
        patch.last_notified_rank ?? null,
        patch.last_rank_email_at ?? null,
        patch.last_notified_count ?? null,
        milestones ?? null,
        patch.sent_rank_one_at ?? null,
        id
      )
      .run();
  }

  async function getWeeklyLeaderboardSnippet(limit = 5) {
    const { results } = await db
      .prepare(
        `SELECT word, COUNT(*) AS count FROM submissions
         GROUP BY word ORDER BY count DESC, word ASC LIMIT ?`
      )
      .bind(limit)
      .all();
    return results || [];
  }

  return {
    checkRateLimit,
    createPendingSubscription,
    findByConfirmToken,
    findByUnsubscribeToken,
    confirmSubscription,
    unsubscribe,
    listConfirmedSubscriptions,
    getWordStats,
    updateSubscriptionAfterNotify,
    getWeeklyLeaderboardSnippet,
    signupRateConfig: SIGNUP_RATE,
  };
}
