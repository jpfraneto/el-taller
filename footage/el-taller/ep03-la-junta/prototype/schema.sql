-- La Junta: schema for Cloudflare D1 (SQLite).
-- Times are stored as Unix milliseconds (UTC).

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  phone       TEXT NOT NULL UNIQUE,          -- digits only, e.g. 56912345678 (verified by WhatsApp)
  name        TEXT NOT NULL DEFAULT '',
  wa_name     TEXT NOT NULL DEFAULT '',      -- WhatsApp profile name at signup
  level       TEXT NOT NULL DEFAULT '',      -- 'empiezo' | 'escalo' | 'anos'
  origin      TEXT NOT NULL DEFAULT '',      -- 'pv' | 'chile' | 'mundo'
  lang        TEXT NOT NULL DEFAULT 'es',    -- 'es' | 'en'
  is_demo     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- One row per "Entrar con WhatsApp" tap.
CREATE TABLE IF NOT EXISTS login_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sid_hash     TEXT NOT NULL UNIQUE,         -- hash of the browser's lj_login cookie
  code         TEXT NOT NULL,                -- e.g. 4F7K (shown as JUNTA-4F7K)
  lang         TEXT NOT NULL DEFAULT 'es',
  status       TEXT NOT NULL DEFAULT 'waiting', -- waiting | code_sent | done | expired
  phone        TEXT,
  wa_name      TEXT,
  otp_hash     TEXT,
  otp_expires  INTEGER,
  attempts     INTEGER NOT NULL DEFAULT 0,
  ip           TEXT,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_code ON login_requests(code, status);
CREATE INDEX IF NOT EXISTS idx_login_ip ON login_requests(ip, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

-- A "junta": a ride to the crag, a search for a climbing partner, or a session at the gym.
CREATE TABLE IF NOT EXISTS juntas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                 -- 'roca' | 'cordada' | 'sesion'
  place       TEXT NOT NULL,                 -- destination, e.g. "Valle Cochamó"
  meet        TEXT NOT NULL DEFAULT '',      -- meeting point, e.g. "Plaza de Puerto Varas"
  starts_at   INTEGER NOT NULL,
  seats       INTEGER NOT NULL DEFAULT 0,    -- free seats in the car (roca) / people wanted
  note        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_juntas_start ON juntas(starts_at);

CREATE TABLE IF NOT EXISTS junta_members (
  junta_id    INTEGER NOT NULL REFERENCES juntas(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (junta_id, user_id)
);

-- Honorary members ("socios honorarios"): limited, numbered, paid before opening.
CREATE TABLE IF NOT EXISTS socios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  method        TEXT NOT NULL,               -- 'simulado' in the prototype
  paid_at       INTEGER NOT NULL
);
