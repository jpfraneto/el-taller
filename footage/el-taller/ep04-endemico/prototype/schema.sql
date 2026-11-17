-- Endémico: schema for Cloudflare D1 (SQLite). Times are Unix milliseconds (UTC); days are 'YYYY-MM-DD' in Chile time.

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  phone       TEXT NOT NULL UNIQUE,            -- digits only, e.g. 56985491126
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'alumno',  -- 'coach' | 'alumno' | 'remoto' (only follows the weekly workout)
  plan        INTEGER NOT NULL DEFAULT 0,      -- days per week (1..5), 0 = no plan
  plan_monto  INTEGER NOT NULL DEFAULT 0,      -- CLP per month
  activo      INTEGER NOT NULL DEFAULT 1,
  sub_until   INTEGER,                         -- remoto: weekly-workout subscription paid until
  is_demo     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_codes (
  phone       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,
  intent      TEXT NOT NULL DEFAULT 'login',   -- 'login' | 'remoto'
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

-- One row per person per day: scanning the door QR twice the same day doesn't count twice.
CREATE TABLE IF NOT EXISTS checkins (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,
  at          INTEGER NOT NULL,
  source      TEXT NOT NULL DEFAULT 'qr',      -- 'qr' | 'coach'
  UNIQUE (user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_checkins_day ON checkins(day);

CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL,
  method       TEXT NOT NULL,                  -- 'efectivo' | 'transferencia' | 'tarjeta' | 'mercadopago'
  status       TEXT NOT NULL DEFAULT 'confirmado', -- 'confirmado' | 'por_confirmar'
  paid_at      INTEGER NOT NULL,
  receipt      TEXT,                           -- data URL of the transfer receipt (member upload)
  created_by   TEXT NOT NULL DEFAULT 'coach',  -- 'coach' | 'alumno'
  created_at   INTEGER NOT NULL,
  confirmed_at INTEGER,
  mp_order_id  TEXT UNIQUE,                    -- Mercado Pago order id (so a webhook retry never counts twice)
  item         TEXT NOT NULL DEFAULT 'plan',   -- 'plan' (monthly classes) | 'puncion' | 'kine' | 'personalizado' | 'masaje' | 'prueba' (test, counts for nothing)
  clases       INTEGER                         -- plan: classes it gives for its month (NULL = plan × 4); service: 1 session
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, paid_at);

-- The weekly workout: Seba's whiteboard photo + the plan read from it.
CREATE TABLE IF NOT EXISTS weeks (
  week_start  TEXT PRIMARY KEY,                -- Monday, 'YYYY-MM-DD'
  photo       TEXT,                            -- data URL (JPEG)
  plan        TEXT NOT NULL,                   -- JSON
  source      TEXT NOT NULL DEFAULT 'foto',    -- 'foto' | 'manual' | 'demo'
  updated_at  INTEGER NOT NULL
);

-- Mercado Pago Checkout Pro orders we created (Orders API). external_reference ties MP's order back to the person.
CREATE TABLE IF NOT EXISTS mp_links (
  ref            TEXT PRIMARY KEY,             -- external_reference sent to MP
  order_id       TEXT NOT NULL UNIQUE,         -- MP order id (ORD…)
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL,                -- 'plan' | 'semana'
  amount         INTEGER NOT NULL,
  title          TEXT NOT NULL,
  checkout_url   TEXT NOT NULL,
  created_by     TEXT NOT NULL,                -- 'alumno' | 'coach' | 'remoto'
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,
  paid_at        INTEGER                       -- set once, when MP reports it processed + accredited
);
CREATE INDEX IF NOT EXISTS idx_mp_links_user ON mp_links(user_id, created_at);

-- Agenda: a member books the class time they're coming to (one class a day), or a session of a service.
CREATE TABLE IF NOT EXISTS reservas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,                   -- 'YYYY-MM-DD'
  hora        TEXT NOT NULL,                   -- '19:00'
  servicio    TEXT NOT NULL DEFAULT 'clase',   -- 'clase' | 'puncion' | 'kine' | 'personalizado' | 'masaje'
  created_at  INTEGER NOT NULL,
  UNIQUE (user_id, day, servicio)
);
CREATE INDEX IF NOT EXISTS idx_reservas_day ON reservas(day, hora);
