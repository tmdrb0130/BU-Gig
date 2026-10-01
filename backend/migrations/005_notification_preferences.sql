CREATE TABLE notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  messages boolean NOT NULL DEFAULT true,
  matching boolean NOT NULL DEFAULT true
);
