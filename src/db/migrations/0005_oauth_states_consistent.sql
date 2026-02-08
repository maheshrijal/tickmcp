CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  mcp_oauth_request TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);
