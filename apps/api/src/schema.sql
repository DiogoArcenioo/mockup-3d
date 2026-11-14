CREATE SCHEMA IF NOT EXISTS forma_auth;
CREATE TABLE IF NOT EXISTS forma_auth.users (
  id uuid PRIMARY KEY,
  name varchar(100) NOT NULL,
  login varchar(40) NOT NULL UNIQUE CHECK (login = lower(login)),
  password_hash text NOT NULL,
  role varchar(10) NOT NULL CHECK (role IN ('admin', 'user')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS forma_auth.sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES forma_auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON forma_auth.sessions(expires_at);
CREATE TABLE IF NOT EXISTS forma_auth.login_attempts (
  key_hash char(64) PRIMARY KEY,
  count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);
