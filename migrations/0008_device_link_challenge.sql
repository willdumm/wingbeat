-- invite_tokens.code_challenge: the app's PKCE S256 challenge for a device link made by
-- "Sign in with Browser" (POST /app/connect; docs/mobile-app-plan.md, "Auth and pairing").
-- Such a token is redeemed only by POST /api/app/pair with the matching code_verifier. NULL is
-- an ordinary invite or device link.
ALTER TABLE invite_tokens ADD COLUMN code_challenge TEXT;
