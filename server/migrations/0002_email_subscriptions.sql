-- Email word-update subscriptions (double opt-in). Apply locally / prod via:
-- wrangler d1 execute worldwordgame --remote --file=server/migrations/0002_email_subscriptions.sql

CREATE TABLE IF NOT EXISTS email_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE,
  word TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  confirm_token TEXT NOT NULL UNIQUE,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  last_notified_rank INTEGER,
  last_rank_email_at TEXT,
  last_notified_count INTEGER,
  milestones_sent TEXT NOT NULL DEFAULT '[]',
  sent_rank_one_at TEXT,
  UNIQUE (email, word)
);

CREATE INDEX IF NOT EXISTS idx_email_subs_status ON email_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_email_subs_word ON email_subscriptions (word);
CREATE INDEX IF NOT EXISTS idx_email_subs_confirm ON email_subscriptions (confirm_token);
CREATE INDEX IF NOT EXISTS idx_email_subs_unsub ON email_subscriptions (unsubscribe_token);

CREATE TABLE IF NOT EXISTS email_signup_rate (
  bucket_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_ends_at TEXT NOT NULL
);
