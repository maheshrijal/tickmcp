CREATE TABLE IF NOT EXISTS oauth_start_tickets (
  ticket TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_start_tickets_user_id ON oauth_start_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_start_tickets_expires_at ON oauth_start_tickets(expires_at);
