CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, operation, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at
  ON idempotency_keys(created_at);
