CREATE TABLE IF NOT EXISTS notification_devices (
  token text PRIMARY KEY CHECK (length(token) BETWEEN 1 AND 4096),
  user_id text NOT NULL REFERENCES users(xata_id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_devices_user_id_idx ON notification_devices(user_id);
