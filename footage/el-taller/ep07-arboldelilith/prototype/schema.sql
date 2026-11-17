-- Árbol de Lilith · the niche's data (../../SOFTWARE-EVOLUTIVO.md §4): every product reads and writes this,
-- so changing the champion never loses an inscription.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  phone TEXT UNIQUE,                 -- NULL for the dueña when she enters by her private link
  name TEXT,
  role TEXT NOT NULL DEFAULT 'persona',  -- 'persona' | 'duena'
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_codes (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Circles, workshops: what Pili offers on a date.
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'circulo',  -- 'circulo' | 'taller'
  nombre TEXT NOT NULL,
  bajada TEXT,                           -- one line in her voice, under the name
  descripcion TEXT,
  fecha TEXT NOT NULL,                   -- YYYY-MM-DD (Chile)
  hora TEXT NOT NULL,                    -- HH:MM
  hora_fin TEXT,
  lugar TEXT,
  luna TEXT,                             -- 'llena' | 'nueva' | 'solsticio' | NULL
  pregunta TEXT,                         -- the question she asks for this one
  cupos_presencial INTEGER NOT NULL DEFAULT 0,
  cupos_online INTEGER NOT NULL DEFAULT 0,
  precios TEXT NOT NULL,                 -- JSON [{"hasta":"YYYY-MM-DD"|null,"monto":15000}], in order
  estado TEXT NOT NULL DEFAULT 'abierto',  -- 'abierto' | 'cerrado'
  created_at INTEGER NOT NULL
);

-- Paid ones keep their place: see lugares() in src/worker.js.
CREATE TABLE IF NOT EXISTS inscripciones (
  id INTEGER PRIMARY KEY,
  evento_id INTEGER NOT NULL REFERENCES eventos(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  modalidad TEXT NOT NULL,               -- 'presencial' | 'online'
  estado TEXT NOT NULL DEFAULT 'reservada',  -- 'reservada' (no payment yet) | 'pagada' | 'cancelada'
  monto INTEGER,                         -- what was paid
  metodo TEXT,                           -- 'mercadopago' | 'transferencia' | 'demo'
  pagada_at INTEGER,
  regalo_de INTEGER REFERENCES users(id),  -- someone else bought/reserved this place for her
  compra_id INTEGER REFERENCES compras(id),
  created_at INTEGER NOT NULL,
  UNIQUE (evento_id, user_id)
);

-- One payment for one or more things: places (yours + gifted ones) or a 1:1 hour.
CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),   -- who pays
  monto INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',         -- 'pendiente' | 'pagada'
  metodo TEXT,
  pagada_at INTEGER,
  created_at INTEGER NOT NULL
);

-- A 1:1 hour with Pili. Bought (or requested) here; the day is agreed by WhatsApp.
CREATE TABLE IF NOT EXISTS sesiones (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),   -- who asked / paid
  para_nombre TEXT,                                 -- NULL = for herself; else a gift
  para_telefono TEXT,
  motivo TEXT,
  modalidad TEXT NOT NULL,                          -- 'presencial' | 'online'
  preferencia TEXT,                                 -- "martes o jueves en la tarde"
  monto INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pedida',            -- 'pedida' | 'agendada' | 'hecha' | 'cancelada' (paid or not: `pagada`)
  pagada INTEGER NOT NULL DEFAULT 0,
  metodo TEXT,
  compra_id INTEGER REFERENCES compras(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mp_links (
  ref TEXT PRIMARY KEY,
  order_id TEXT UNIQUE,
  compra_id INTEGER NOT NULL REFERENCES compras(id),
  amount INTEGER NOT NULL,
  title TEXT,
  checkout_url TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER
);

-- "Te leo": answers to her question, read only by her.
CREATE TABLE IF NOT EXISTS mensajes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  nombre TEXT,
  pregunta TEXT,
  texto TEXT NOT NULL,
  ip_hash TEXT,
  leido INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- The niche itself: which product is champion.
CREATE TABLE IF NOT EXISTS nicho (
  k TEXT PRIMARY KEY,
  v TEXT,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS insc_evento ON inscripciones(evento_id, estado);
CREATE INDEX IF NOT EXISTS msg_fecha ON mensajes(created_at);
