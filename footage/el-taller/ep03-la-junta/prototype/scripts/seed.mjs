// Prints SQL with demo data (marked is_demo = 1) so the app doesn't look empty in the meeting.
// Dates are relative to today, in Puerto Varas time.
// Usage: node scripts/seed.mjs > .seed.sql

const TZ = 'America/Santiago';

// Unix ms for a wall-clock time in Puerto Varas, `days` from today.
function at(days, hour, minute = 0) {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now).map((p) => [p.type, p.value])
  );
  const guess = Date.UTC(+parts.year, +parts.month - 1, +parts.day + days, hour, minute);
  // Find the zone offset at that moment and correct for it.
  const asLocal = new Date(new Date(guess).toLocaleString('en-US', { timeZone: TZ }));
  const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  return guess + (asUtc - asLocal);
}

function nextWeekday(target) { // 0 = Sunday … 6 = Saturday
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: TZ })).getDay();
  const d = (target - today + 7) % 7;
  return d === 0 ? 7 : d;
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const now = Date.now();

const users = [
  // id, phone, name, level, origin, lang
  [1001, '56900000101', 'Camila Rivas', 'anos', 'pv', 'es'],
  [1002, '56900000102', 'Tomás Fuentes', 'escalo', 'pv', 'es'],
  [1003, '4915100000103', 'Lena Hoffmann', 'anos', 'mundo', 'en'],
  [1004, '56900000104', 'Ignacio Pérez', 'empiezo', 'chile', 'es'],
  [1005, '56900000105', 'Antonia Soto', 'escalo', 'pv', 'es'],
  [1006, '14150000106', 'Jake Miller', 'anos', 'mundo', 'en'],
  [1007, '56900000107', 'Valentina Muñoz', 'empiezo', 'pv', 'es'],
  [1008, '56900000108', 'Diego Araya', 'anos', 'pv', 'es'],
  [1009, '56900000109', 'Francisca Lagos', 'escalo', 'chile', 'es'],
  [1010, '56900000110', 'Matías Ojeda', 'escalo', 'pv', 'es'],
  [1011, '56900000111', 'Sofía Barría', 'empiezo', 'pv', 'es'],
  [1012, '33600000112', 'Chloé Martin', 'escalo', 'mundo', 'en'],
];

const sat = nextWeekday(6);
const sun = nextWeekday(0);
const juntas = [
  // id, user, kind, place, meet, startsAt, seats, note, members
  [2001, 1001, 'roca', 'Valle Cochamó', 'Plaza de Armas, Puerto Varas', at(sat, 7, 30), 3,
    'Salgo temprano, vuelvo el domingo en la tarde. Llevo cuerda de 70 m y un juego de friends.', [1003, 1006]],
  [2002, 1003, 'cordada', 'Valle Cochamó', 'Hostel en Puerto Varas', at(sat, 9, 0), 1,
    'Looking for a partner for multi-pitch (6b–6c). I have a full rack, staying in PV until Thursday.', []],
  [2003, 1008, 'roca', 'Boulder en Ensenada', 'Salida de Puerto Varas hacia Ensenada', at(sun, 10, 0), 2,
    'Boulder tranqui, llevo dos crashpads. Si llueve lo movemos.', [1007]],
  [2004, 1002, 'sesion', 'Tabla en casa de Tomás · Puerto Varas', '', at(2, 19, 0), 6,
    'Entrenamiento de fuerza de dedos en tabla. Todos los niveles, se comparte mate.', [1004, 1005, 1011]],
  [2005, 1009, 'cordada', 'Valle Cochamó', 'Terminal de buses Puerto Varas', at(sat + 7, 8, 0), 1,
    'Busco cordada para una semana en Cochamó en diciembre. Escalo 6a+ de primera.', []],
];

const socios = [
  [1001, 'Camila Rivas'], [1008, 'Diego Araya'], [1002, 'Tomás Fuentes'], [1005, 'Antonia Soto'],
  [1003, 'Lena Hoffmann'], [1010, 'Matías Ojeda'], [1009, 'Francisca Lagos'], [1006, 'Jake Miller'],
  [1011, 'Sofía Barría'],
];

const out = [];
out.push('DELETE FROM junta_members WHERE user_id IN (SELECT id FROM users WHERE is_demo = 1) OR junta_id IN (SELECT id FROM juntas WHERE user_id IN (SELECT id FROM users WHERE is_demo = 1));');
out.push('DELETE FROM juntas WHERE user_id IN (SELECT id FROM users WHERE is_demo = 1);');
out.push('DELETE FROM socios WHERE user_id IN (SELECT id FROM users WHERE is_demo = 1);');
out.push('DELETE FROM users WHERE is_demo = 1;');
for (const [id, phone, name, level, origin, lang] of users) {
  out.push(`INSERT INTO users (id, phone, name, wa_name, level, origin, lang, is_demo, created_at) VALUES (${id}, ${q(phone)}, ${q(name)}, ${q(name)}, ${q(level)}, ${q(origin)}, ${q(lang)}, 1, ${now - 864e5 * 10});`);
}
for (const [id, user, kind, place, meet, startsAt, seats, note, members] of juntas) {
  out.push(`INSERT INTO juntas (id, user_id, kind, place, meet, starts_at, seats, note, created_at) VALUES (${id}, ${user}, ${q(kind)}, ${q(place)}, ${q(meet)}, ${startsAt}, ${seats}, ${q(note)}, ${now - 864e5});`);
  for (const m of members) out.push(`INSERT INTO junta_members (junta_id, user_id, created_at) VALUES (${id}, ${m}, ${now - 3600e3});`);
}
socios.forEach(([user, name], i) => {
  out.push(`INSERT INTO socios (user_id, number, display_name, amount, method, paid_at) VALUES (${user}, ${i + 1}, ${q(name)}, 100000, 'demo', ${now - 864e5 * (9 - i)});`);
});
console.log(out.join('\n'));
