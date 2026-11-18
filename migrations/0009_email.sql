-- Email sign-in and email invites (docs/mobile-app-plan.md, "Email sign-in, email invites and
-- finding your instance").
--
-- user_emails: a user's addresses (any number), lowercased. A row is added only by redeeming a
-- join token sent to that address (opening the link proves the inbox), so every address here
-- is verified. An address belongs to one user at most; any of a user's addresses signs in.
CREATE TABLE IF NOT EXISTS user_emails (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      TEXT    NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS user_emails_user ON user_emails(user_id);

-- invite_tokens.email: the address an invite or device link was emailed to; redeeming the
-- token adds it to the user's addresses. code_hash: on a device link from the /login form, the
-- SHA-256 of the 6-digit code in the same email, which signs in with the address instead of
-- the link (POST /login/code); attempts counts its wrong tries. The rows fit the table's
-- existing CHECK, so it isn't rebuilt.
ALTER TABLE invite_tokens ADD COLUMN email TEXT;
ALTER TABLE invite_tokens ADD COLUMN code_hash TEXT;
ALTER TABLE invite_tokens ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS invite_tokens_email ON invite_tokens(email) WHERE email IS NOT NULL;
