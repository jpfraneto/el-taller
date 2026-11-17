-- 2026-11-05: plans become "clases al mes" + services you can buy and book. Run once on a DB created before this.
ALTER TABLE payments ADD COLUMN item TEXT NOT NULL DEFAULT 'plan';
ALTER TABLE payments ADD COLUMN clases INTEGER;
CREATE TABLE reservas_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,
  hora        TEXT NOT NULL,
  servicio    TEXT NOT NULL DEFAULT 'clase',
  created_at  INTEGER NOT NULL,
  UNIQUE (user_id, day, servicio)
);
INSERT INTO reservas_new (id, user_id, day, hora, servicio, created_at) SELECT id, user_id, day, hora, 'clase', created_at FROM reservas;
DROP TABLE reservas;
ALTER TABLE reservas_new RENAME TO reservas;
CREATE INDEX IF NOT EXISTS idx_reservas_day ON reservas(day, hora);
-- Plan payments made before this: their month gives plan × 4 classes.
UPDATE payments SET clases = (SELECT plan * 4 FROM users WHERE users.id = payments.user_id) WHERE item = 'plan' AND clases IS NULL;
