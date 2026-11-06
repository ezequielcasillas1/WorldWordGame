import { MILESTONE_THRESHOLDS, RANK_EMAIL_MIN_INTERVAL_MS } from "./constants.js";
import { createEmailRepository } from "./repository.js";
import {
  buildConfirmUrl,
  buildPlayUrl,
  buildUnsubscribeUrl,
  listUnsubscribeHeaders,
  sendViaResend,
} from "./resend.js";
import {
  renderMilestoneEmail,
  renderNumberOneEmail,
  renderRankChangeEmail,
  renderWeeklySummaryEmail,
} from "./templates.js";

function milestonesToNotify(currentCount, alreadySent) {
  const sent = new Set(alreadySent || []);
  return MILESTONE_THRESHOLDS.filter((t) => currentCount >= t && !sent.has(t));
}

export async function runNotificationCron(env, { weekly = false } = {}) {
  if (!env.RESEND_API_KEY) {
    console.error(JSON.stringify({ message: "cron skipped: RESEND_API_KEY missing" }));
    return { processed: 0, skipped: true };
  }
  const repo = createEmailRepository(env.DB);
  let offset = 0;
  const batchSize = 200;
  let sent = 0;
  let processed = 0;

  while (true) {
    const subs = await repo.listConfirmedSubscriptions(batchSize, offset);
    if (!subs.length) break;
    offset += subs.length;

    for (const sub of subs) {
      processed += 1;
      const stats = await repo.getWordStats(String(sub.word));
      if (!stats.count || !stats.rank) continue;

      const unsubscribeUrl = buildUnsubscribeUrl(env, sub.unsubscribe_token);
      const playUrl = buildPlayUrl(env);
      const headers = listUnsubscribeHeaders(unsubscribeUrl);

      if (weekly) {
        const topRows = await repo.getWeeklyLeaderboardSnippet(5);
        const tpl = renderWeeklySummaryEmail({
          word: sub.word,
          count: stats.count,
          rank: stats.rank,
          sharePercent: stats.sharePercent,
          topRows,
          playUrl,
          unsubscribeUrl,
        });
        const result = await sendViaResend(env, {
          to: sub.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          headers,
        });
        if (result.ok) sent += 1;
        continue;
      }

      const patch = {
        last_notified_rank: sub.last_notified_rank != null ? sub.last_notified_rank : stats.rank,
        last_notified_count: stats.count,
        milestones_sent: sub.milestones_sent || [],
        sent_rank_one_at: sub.sent_rank_one_at || null,
      };

      if (stats.rank === 1 && !sub.sent_rank_one_at) {
        const tpl = renderNumberOneEmail({
          word: sub.word,
          count: stats.count,
          playUrl,
          unsubscribeUrl,
        });
        const result = await sendViaResend(env, {
          to: sub.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          headers,
        });
        if (result.ok) {
          sent += 1;
          patch.sent_rank_one_at = new Date().toISOString();
        }
      }

      const newMilestones = milestonesToNotify(stats.count, sub.milestones_sent);
      for (const milestone of newMilestones) {
        const tpl = renderMilestoneEmail({
          word: sub.word,
          milestone,
          count: stats.count,
          rank: stats.rank,
          playUrl,
          unsubscribeUrl,
        });
        const result = await sendViaResend(env, {
          to: sub.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          headers,
        });
        if (result.ok) {
          sent += 1;
          patch.milestones_sent = [...(patch.milestones_sent || []), milestone];
        }
      }

      const prevRank = sub.last_notified_rank != null ? Number(sub.last_notified_rank) : null;
      if (prevRank != null && prevRank !== stats.rank) {
        const lastAt = sub.last_rank_email_at ? Date.parse(String(sub.last_rank_email_at)) : 0;
        const canSendRank = !lastAt || Date.now() - lastAt >= RANK_EMAIL_MIN_INTERVAL_MS;
        if (canSendRank) {
          const tpl = renderRankChangeEmail({
            word: sub.word,
            oldRank: prevRank,
            newRank: stats.rank,
            count: stats.count,
            playUrl,
            unsubscribeUrl,
          });
          const result = await sendViaResend(env, {
            to: sub.email,
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
            headers,
          });
          if (result.ok) {
            sent += 1;
            patch.last_rank_email_at = new Date().toISOString();
          }
        }
      }

      patch.last_notified_rank = stats.rank;
      patch.last_notified_count = stats.count;
      await repo.updateSubscriptionAfterNotify(sub.id, patch);
    }

    if (subs.length < batchSize) break;
  }

  return { processed, sent, weekly };
}

import { renderConfirmationEmail } from "./templates.js";

export async function sendConfirmationEmail(env, { email, word, confirmToken, unsubscribeToken }) {
  const confirmUrl = buildConfirmUrl(env, confirmToken);
  const unsubscribeUrl = buildUnsubscribeUrl(env, unsubscribeToken);
  const tpl = renderConfirmationEmail({ word, confirmUrl, unsubscribeUrl });
  return sendViaResend(env, {
    to: email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    headers: listUnsubscribeHeaders(unsubscribeUrl),
  });
}
