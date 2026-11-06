const TILE_COLORS = ["#6aaa64", "#c9b458", "#787c7e"];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTiles(displayWord) {
  const upper = String(displayWord || "").toUpperCase();
  let colorIdx = 0;
  return Array.from(upper)
    .map((ch) => {
      if (ch === " ") {
        return `<span style="display:inline-block;width:8px;"></span>`;
      }
      const bg = TILE_COLORS[colorIdx % TILE_COLORS.length];
      colorIdx += 1;
      return `<span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;margin:2px;border-radius:4px;background:${bg};color:#fff;font-weight:700;font-size:18px;font-family:'Clear Sans','Helvetica Neue',Arial,sans-serif;">${escapeHtml(ch)}</span>`;
    })
    .join("");
}

function emailShell({ preheader, title, bodyHtml, ctaHref, ctaLabel, footerHtml }) {
  const pre = escapeHtml(preheader);
  const safeTitle = escapeHtml(title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<meta name="supported-color-schemes" content="light dark"/>
<title>${safeTitle}</title>
<style>
  body{margin:0;padding:0;background:#f6f7f8;color:#1a1a1b;}
  .wrap{max-width:560px;margin:0 auto;padding:24px 16px;}
  .card{background:#ffffff;border:1px solid #d3d6da;border-radius:12px;padding:28px 24px;box-shadow:0 4px 16px rgba(0,0,0,.06);}
  .brand{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#565758;margin:0 0 8px;}
  h1{font-size:22px;line-height:1.25;margin:0 0 12px;font-family:'Clear Sans','Helvetica Neue',Arial,sans-serif;}
  p{font-size:15px;line-height:1.55;margin:0 0 14px;color:#565758;font-family:'Clear Sans','Helvetica Neue',Arial,sans-serif;}
  .tiles{margin:16px 0 20px;line-height:0;}
  .btn{display:inline-block;background:#6aaa64;color:#ffffff!important;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;font-size:14px;letter-spacing:.04em;}
  .muted{font-size:12px;color:#787c7e;margin-top:20px;line-height:1.5;}
  @media (prefers-color-scheme:dark){
    body{background:#121213;color:#ffffff;}
    .card{background:#1a1a1b;border-color:#3a3a3c;}
    .brand{color:#d7dadc;}
    p{color:#d7dadc;}
    .muted{color:#818384;}
    .btn{background:#538d4e;}
  }
</style>
</head>
<body>
<div style="display:none;max-height:0;overflow:hidden;">${pre}</div>
<div class="wrap">
  <div class="card">
    <p class="brand">World Word 🌍</p>
    <h1>${safeTitle}</h1>
    ${bodyHtml}
    ${ctaHref ? `<p style="margin-top:22px;"><a class="btn" href="${escapeHtml(ctaHref)}">${escapeHtml(ctaLabel || "Play World Word")}</a></p>` : ""}
    <p class="muted">${footerHtml || ""}</p>
  </div>
</div>
</body>
</html>`;
}

function displayWord(word) {
  return String(word || "").toUpperCase();
}

export function renderConfirmationEmail({ word, confirmUrl, unsubscribeUrl }) {
  const tiles = renderTiles(displayWord(word));
  const html = emailShell({
    preheader: "Confirm your World Word email updates",
    title: "Confirm your email",
    bodyHtml: `<p>You asked for updates about <strong>${escapeHtml(displayWord(word))}</strong> on World Word. Tap confirm to start receiving rank and milestone emails.</p>
<div class="tiles" role="presentation">${tiles}</div>
<p style="margin-bottom:0;">This link expires when you confirm. If you did not request this, ignore this message.</p>`,
    ctaHref: confirmUrl,
    ctaLabel: "Confirm subscription",
    footerHtml: `You can <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6aaa64;">unsubscribe</a> anytime.`,
  });
  const text = `World Word — Confirm your email\n\nConfirm updates for ${displayWord(word)}:\n${confirmUrl}\n\nUnsubscribe: ${unsubscribeUrl}`;
  return { subject: `Confirm World Word updates for ${displayWord(word)}`, html, text };
}

export function renderRankChangeEmail({ word, oldRank, newRank, count, playUrl, unsubscribeUrl }) {
  const direction = newRank < oldRank ? "up" : "down";
  const tiles = renderTiles(displayWord(word));
  const html = emailShell({
    preheader: `${displayWord(word)} moved ${direction} to #${newRank}`,
    title: `${displayWord(word)} moved ${direction}`,
    bodyHtml: `<p>Your tracked word is now <strong>#${newRank}</strong> on the global leaderboard (was #${oldRank}). It has been submitted <strong>${Number(count).toLocaleString()}</strong> times.</p>
<div class="tiles" role="presentation">${tiles}</div>`,
    ctaHref: playUrl,
    ctaLabel: "See the leaderboard",
    footerHtml: `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#6aaa64;">Unsubscribe</a> from ${escapeHtml(displayWord(word))} updates.`,
  });
  const text = `World Word — ${displayWord(word)} is now rank #${newRank} (was #${oldRank}). Times said: ${count}.\n${playUrl}\nUnsubscribe: ${unsubscribeUrl}`;
  return { subject: `${displayWord(word)} is now #${newRank} on World Word`, html, text };
}

export function renderMilestoneEmail({ word, milestone, count, rank, playUrl, unsubscribeUrl }) {
  const tiles = renderTiles(displayWord(word));
  const html = emailShell({
    preheader: `${displayWord(word)} hit ${milestone} submissions`,
    title: `${milestone.toLocaleString()} submissions!`,
    bodyHtml: `<p><strong>${escapeHtml(displayWord(word))}</strong> just reached <strong>${milestone.toLocaleString()}</strong> submissions worldwide${rank ? ` and sits at rank <strong>#${rank}</strong>` : ""}.</p>
<div class="tiles" role="presentation">${tiles}</div>
<p>Thanks for being part of the pool.</p>`,
    ctaHref: playUrl,
    ctaLabel: "Play again",
    footerHtml: `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#6aaa64;">Unsubscribe</a>.`,
  });
  const text = `World Word milestone: ${displayWord(word)} reached ${milestone} submissions.\n${playUrl}\nUnsubscribe: ${unsubscribeUrl}`;
  return { subject: `${displayWord(word)} hit ${milestone.toLocaleString()} submissions`, html, text };
}

export function renderWeeklySummaryEmail({ word, count, rank, sharePercent, topRows, playUrl, unsubscribeUrl }) {
  const tiles = renderTiles(displayWord(word));
  const topList = (topRows || [])
    .map((row, i) => {
      const w = escapeHtml(String(row.word || "").toUpperCase());
      const c = Number(row.count || 0).toLocaleString();
      return `<tr><td style="padding:6px 0;color:#565758;font-size:14px;">#${i + 1} ${w}</td><td style="padding:6px 0;text-align:right;color:#565758;font-size:14px;">${c}×</td></tr>`;
    })
    .join("");
  const html = emailShell({
    preheader: `Weekly recap for ${displayWord(word)}`,
    title: "Your weekly World Word recap",
    bodyHtml: `<p>This week for <strong>${escapeHtml(displayWord(word))}</strong>:</p>
<div class="tiles" role="presentation">${tiles}</div>
<ul style="padding-left:18px;margin:0 0 16px;color:#565758;font-size:15px;line-height:1.6;">
<li>Rank: <strong>#${rank ?? "—"}</strong></li>
<li>Times said: <strong>${Number(count).toLocaleString()}</strong></li>
<li>Share of pool: <strong>${sharePercent}%</strong></li>
</ul>
<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#787c7e;margin-bottom:8px;">Top words right now</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${topList}</table>`,
    ctaHref: playUrl,
    ctaLabel: "Submit another word",
    footerHtml: `Weekly summary · <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6aaa64;">Unsubscribe</a>`,
  });
  const text = `World Word weekly recap for ${displayWord(word)} — rank #${rank}, ${count}× said, ${sharePercent}% of pool.\n${playUrl}\nUnsubscribe: ${unsubscribeUrl}`;
  return { subject: `Weekly recap: ${displayWord(word)} on World Word`, html, text };
}

export function renderNumberOneEmail({ word, count, playUrl, unsubscribeUrl }) {
  const tiles = renderTiles(displayWord(word));
  const html = emailShell({
    preheader: `${displayWord(word)} is #1 on World Word`,
    title: "You're tracking the #1 word! 🥇",
    bodyHtml: `<p><strong>${escapeHtml(displayWord(word))}</strong> is <strong>#1</strong> on the global leaderboard with <strong>${Number(count).toLocaleString()}</strong> submissions.</p>
<div class="tiles" role="presentation">${tiles}</div>
<p>Share the moment with friends.</p>`,
    ctaHref: playUrl,
    ctaLabel: "Share & play",
    footerHtml: `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#6aaa64;">Unsubscribe</a>.`,
  });
  const text = `${displayWord(word)} is #1 on World Word with ${count} submissions!\n${playUrl}\nUnsubscribe: ${unsubscribeUrl}`;
  return { subject: `${displayWord(word)} is #1 on World Word 🥇`, html, text };
}

/** Static previews for docs / screenshot script */
export const PREVIEW_SAMPLES = {
  confirmation: () =>
    renderConfirmationEmail({
      word: "world",
      confirmUrl: "https://worldwordgame.com/api/email/confirm?token=preview",
      unsubscribeUrl: "https://worldwordgame.com/api/email/unsubscribe?token=preview",
    }),
  rankChange: () =>
    renderRankChangeEmail({
      word: "hello",
      oldRank: 4,
      newRank: 2,
      count: 128,
      playUrl: "https://worldwordgame.com",
      unsubscribeUrl: "https://worldwordgame.com/api/email/unsubscribe?token=preview",
    }),
  milestone: () =>
    renderMilestoneEmail({
      word: "peace",
      milestone: 100,
      count: 100,
      rank: 5,
      playUrl: "https://worldwordgame.com",
      unsubscribeUrl: "https://worldwordgame.com/api/email/unsubscribe?token=preview",
    }),
  weeklySummary: () =>
    renderWeeklySummaryEmail({
      word: "love",
      count: 64,
      rank: 3,
      sharePercent: 4.2,
      topRows: [
        { word: "world", count: 420 },
        { word: "hello", count: 360 },
        { word: "love", count: 64 },
      ],
      playUrl: "https://worldwordgame.com",
      unsubscribeUrl: "https://worldwordgame.com/api/email/unsubscribe?token=preview",
    }),
  numberOne: () =>
    renderNumberOneEmail({
      word: "world",
      count: 420,
      playUrl: "https://worldwordgame.com",
      unsubscribeUrl: "https://worldwordgame.com/api/email/unsubscribe?token=preview",
    }),
};
