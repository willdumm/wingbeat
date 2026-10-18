-- Session tokens are stored as sha256 hex of the cookie value. Rows that predate this
-- migration hold the raw token (token_hashed = 0); the Worker upgrades them in place the
-- next time they authenticate. token_hashed is part of every lookup so a leaked hash can't
-- be presented as a cookie.
ALTER TABLE sessions ADD COLUMN token_hashed INTEGER NOT NULL DEFAULT 0;
