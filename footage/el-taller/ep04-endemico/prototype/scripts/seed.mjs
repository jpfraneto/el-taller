// Demo data for the prototype: fake members (is_demo = 1), plus Seba (coach) and JP with their real numbers.
// Prints SQL to stdout: node scripts/seed.mjs > .seed.sql
// Everything is relative to "now", so the demo always looks current.

const TZ = 'America/Santiago';
const DAY = 864e5;
const NOW = Date.now();

let seed = 20261104;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

const dayOf = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
// Chile is UTC-3 in November (summer time). Good enough for demo timestamps.
const tsAt = (day, h, m) => Date.parse(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`);
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = (day) => new Date(day + 'T12:00:00Z').getUTCDay(); // 0 Sunday
const mondayOf = (day) => { const wd = weekday(day); return addDays(day, wd === 0 ? -6 : 1 - wd); };

const PRECIOS = { 1: 40000, 2: 80000, 3: 100000, 4: 120000, 5: 140000 };
const TODAY = dayOf(NOW);
const START = addDays(TODAY, -75);

const out = [];
const users = [];
let uid = 0;
function user(phone, name, role, plan, extra = {}) {
  uid++;
  const u = { id: uid, phone, name, role, plan, monto: PRECIOS[plan] || 0, ...extra };
  users.push(u);
  out.push(`INSERT INTO users (id, phone, name, role, plan, plan_monto, activo, is_demo, created_at) VALUES (${uid}, ${q(phone)}, ${q(name)}, ${q(role)}, ${plan}, ${u.monto}, 1, ${extra.real ? 0 : 1}, ${NOW - 200 * DAY});`);
  return u;
}

user('56900000000', 'Seba', 'coach', 0, { real: true });
const jp = user('56985491126', 'JP Franeto', 'alumno', 3, { real: true, slot: 'pm', anchor: 3, methods: ['transferencia'] });

const NOMBRES = [
  ['Camila Rojas', 3, 'pm'], ['Francisca Soto', 2, 'am'], ['Karina Muñoz', 3, 'pm'], ['Valentina Díaz', 4, 'am'],
  ['Catalina Fuentes', 2, 'pm'], ['Javiera Pérez', 3, 'am'], ['Daniela Vera', 5, 'am'], ['Constanza Silva', 2, 'pm'],
  ['Fernanda Contreras', 3, 'pm'], ['María José Torres', 1, 'sat'], ['Paula Hernández', 3, 'am'], ['Antonia Morales', 2, 'pm'],
  ['Matías González', 4, 'pm'], ['Felipe Araya', 3, 'am'], ['Tomás Espinoza', 3, 'pm'], ['Diego Castillo', 5, 'am'],
  ['Nicolás Tapia', 2, 'pm'], ['Benjamín Reyes', 3, 'pm'], ['Cristóbal Navarro', 4, 'am'], ['Ignacio Bravo', 2, 'pm'],
  ['Joaquín Sepúlveda', 3, 'am'], ['Rodrigo Pizarro', 1, 'sat'], ['Andrés Carrasco', 3, 'pm'], ['Pablo Vargas', 2, 'am'],
  ['Claudio Riquelme', 3, 'pm'], ['Ximena Alarcón', 2, 'am'],
];
const members = [jp];
NOMBRES.forEach(([name, plan, slot], i) => {
  const phone = '5699' + String(1000000 + Math.floor(rnd() * 8999999)).slice(0, 7);
  members.push(user(phone, name, 'alumno', plan, { slot, anchor: 1 + Math.floor(rnd() * 27), methods: pick([['transferencia'], ['tarjeta'], ['efectivo'], ['transferencia', 'tarjeta']]), idx: i }));
});

// Who stopped coming (for "no ha venido en 10 días") and who is behind on payment.
const ausentes = { 'Catalina Fuentes': 12, 'Nicolás Tapia': 16, 'Rodrigo Pizarro': 22 };
const vencidos = new Set(['Ignacio Bravo', 'Nicolás Tapia', 'JP Franeto']);
const porConfirmar = 'Constanza Silva';

/* ---------------- check-ins */
let cid = 0;
for (const m of members) {
  const stopAfter = ausentes[m.name] ? addDays(TODAY, -ausentes[m.name]) : TODAY;
  // Preferred weekdays for their plan (1 = Monday).
  const pref = { 1: [6], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] }[m.plan] || [];
  for (let d = START; d <= stopAfter; d = addDays(d, 1)) {
    const wd = weekday(d);
    if (wd === 0) continue;
    let goes = pref.includes(wd) ? rnd() < 0.86 : rnd() < 0.05;
    if (m.slot === 'sat' && wd === 6) goes = rnd() < 0.8;
    if (m === jp) {
      if (d === TODAY) goes = false;        // JP checks in live in the demo
      if (d >= mondayOf(TODAY) && d < TODAY) goes = wd === 1 || wd === 3; // this week: Mon + Wed, so today he's on Día 3
      if (d === '2026-10-21') goes = true;  // the class we filmed
    }
    if (!goes) continue;
    let h, mi;
    if (wd === 6) { h = 9 + Math.floor(rnd() * 2); mi = Math.floor(rnd() * 60); }
    else if (m.slot === 'am') { h = 7 + Math.floor(rnd() * 3); mi = Math.floor(rnd() * 60); }
    else { h = 18 + Math.floor(rnd() * 2); mi = Math.floor(rnd() * 60); }
    if (m === jp) { h = 19; mi = 2 + Math.floor(rnd() * 12); }
    const at = tsAt(d, h, mi);
    if (at > NOW) continue;
    cid++;
    out.push(`INSERT INTO checkins (id, user_id, day, at, source) VALUES (${cid}, ${m.id}, ${q(d)}, ${at}, ${q(rnd() < 0.06 ? 'coach' : 'qr')});`);
  }
}

/* ---------------- payments */
const receiptSvg = (name, amount, day) => 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="820" viewBox="0 0 600 820">
  <rect width="600" height="820" fill="#f4f6f8"/><rect x="0" y="0" width="600" height="120" fill="#1f4e8c"/>
  <text x="40" y="74" font-family="Helvetica" font-size="34" fill="#fff" font-weight="bold">Banco Demo</text>
  <text x="40" y="200" font-family="Helvetica" font-size="26" fill="#1f4e8c" font-weight="bold">Transferencia exitosa</text>
  <text x="40" y="290" font-family="Helvetica" font-size="20" fill="#667">Monto</text>
  <text x="40" y="330" font-family="Helvetica" font-size="40" fill="#111" font-weight="bold">$${amount.toLocaleString('es-CL')}</text>
  <text x="40" y="410" font-family="Helvetica" font-size="20" fill="#667">Desde</text><text x="40" y="442" font-family="Helvetica" font-size="24" fill="#111">${name}</text>
  <text x="40" y="510" font-family="Helvetica" font-size="20" fill="#667">Para</text><text x="40" y="542" font-family="Helvetica" font-size="24" fill="#111">Endémico Functional Training</text>
  <text x="40" y="610" font-family="Helvetica" font-size="20" fill="#667">Fecha</text><text x="40" y="642" font-family="Helvetica" font-size="24" fill="#111">${day}</text>
  <text x="40" y="760" font-family="Helvetica" font-size="16" fill="#99a">COMPROBANTE DE EJEMPLO · DATOS FALSOS</text></svg>`).toString('base64');

let pid = 0;
function pay(m, day, method, status = 'confirmado', receipt = null) {
  pid++;
  const at = tsAt(day, 10 + Math.floor(rnd() * 9), Math.floor(rnd() * 60));
  out.push(`INSERT INTO payments (id, user_id, amount, method, status, paid_at, receipt, created_by, created_at, confirmed_at, item, clases) VALUES (${pid}, ${m.id}, ${m.monto}, ${q(method)}, ${q(status)}, ${at}, ${q(receipt)}, ${q(receipt ? 'alumno' : 'coach')}, ${at}, ${status === 'confirmado' ? at + 3600e3 : 'NULL'}, 'plan', ${m.plan * 4});`);
}
for (const m of members) {
  const [y, mo] = TODAY.split('-').map(Number);
  // Anchor-day payments for the last 3 months, up to today.
  const dates = [];
  for (let k = 3; k >= 0; k--) {
    const d = new Date(Date.UTC(y, mo - 1 - k, m.anchor, 12));
    const day = d.toISOString().slice(0, 10);
    if (day <= TODAY && day >= addDays(TODAY, -100)) dates.push(day);
  }
  if (vencidos.has(m.name)) dates.pop();                 // missed the latest one
  const pending = m.name === porConfirmar;
  if (pending && dates.length && dates[dates.length - 1] > addDays(TODAY, -6)) dates.pop();
  for (const day of dates) {
    const method = m === jp ? 'transferencia' : pick(m.methods);
    pay(m, day, method, 'confirmado', m === jp ? receiptSvg(m.name, m.monto, day) : null);
  }
  if (pending) pay(m, addDays(TODAY, -1), 'transferencia', 'por_confirmar', receiptSvg(m.name, m.monto, addDays(TODAY, -1)));
}

/* ---------------- this week's workout (as read from the whiteboard) */
// Seba numbers the days (Día 1 to Día 5, usually), not weekdays. Every day: Warmup, Serie 1, Serie 2, with the rounds on top.
const E = (nombre, dosis, mancuernas, sin_equipo, nota = '') => ({ nombre, dosis, mancuernas, sin_equipo, nota });
const plan = {
  titulo: 'Semana de volumen',
  nota: 'Pierna y tren superior se alternan, con un día de cuerpo completo al medio: el cuerpo descansa entremedio. Nada es al azar.',
  dias: [
    { dia: 'Día 1', foco: 'Pierna · fuerza', bloques: [
      { nombre: 'Warmup', formato: 'x2', ejercicios: [
        E('Puente de glúteo a una pierna', '10 por lado', 'Puente de glúteo con mancuerna en la cadera', 'Puente de glúteo a una pierna', 'Sin que caiga la cadera'),
        E('Rodilla al pecho en plancha', '10 por lado', 'Rodilla al pecho en plancha', 'Rodilla al pecho en plancha'),
        E('Sentadilla con pausa', '10', 'Sentadilla goblet con pausa', 'Sentadilla con pausa abajo (3")'),
      ] },
      { nombre: 'Serie 1', formato: 'x4', ejercicios: [
        E('Sentadilla con barra', '10–12', 'Sentadilla goblet con mancuerna', 'Sentadilla búlgara'),
        E('Peso muerto rumano', '10–12', 'Peso muerto rumano con mancuernas', 'Bisagra de cadera a una pierna'),
        E('Salto al cajón', '8', 'Sentadilla con salto', 'Sentadilla con salto'),
      ] },
      { nombre: 'Serie 2', formato: 'x3', ejercicios: [
        E('Zancada caminando', '12 por pierna', 'Zancada con mancuernas', 'Zancada caminando'),
        E('Hip thrust con barra', '12', 'Hip thrust con mancuerna', 'Hip thrust a una pierna'),
        E('Plancha frontal', '40"', 'Plancha frontal', 'Plancha frontal'),
      ] },
    ] },
    { dia: 'Día 2', foco: 'Tren superior · hombro y espalda', bloques: [
      { nombre: 'Warmup', formato: 'x2', ejercicios: [
        E('Rotación torácica en cuadrupedia', '8 por lado', 'Rotación torácica en cuadrupedia', 'Rotación torácica en cuadrupedia'),
        E('Y-T en el suelo', '10', 'Y-T con mancuernas livianas', 'Y-T en el suelo', 'Pulgares arriba'),
        E('Escaladores lentos', '20', 'Escaladores lentos', 'Escaladores lentos'),
      ] },
      { nombre: 'Serie 1', formato: 'x4', ejercicios: [
        E('Press de hombro con mancuernas', '10–12', 'Press de hombro con mancuernas', 'Flexión pica (pike push-up)', 'La mancuerna toca el hombro'),
        E('Remo a una mano', '10–12 por lado', 'Remo a una mano con mancuerna', 'Remo invertido bajo una mesa'),
        E('Fondos de tríceps en banco', '12', 'Extensión de tríceps sobre la cabeza', 'Fondos de tríceps en una silla'),
      ] },
      { nombre: 'Serie 2', formato: 'x3', ejercicios: [
        E('Remo sentado en máquina', '12', 'Remo inclinado con dos mancuernas', 'Superman con tirón de brazos', 'El manubrio va al ombligo'),
        E('Bíceps con barra corta en polea', '12', 'Curl de bíceps con mancuernas', 'Curl isométrico con toalla', 'Pausa abajo: sin inercia'),
        E('Cuerda', '40"', 'Golpes al aire con mancuernas livianas', 'Jumping jacks'),
      ] },
    ] },
    { dia: 'Día 3', foco: 'Cuerpo completo · core', bloques: [
      { nombre: 'Warmup', formato: 'x2', ejercicios: [
        E('Dead bug', '12', 'Dead bug con mancuerna', 'Dead bug'),
        E('Bisagra de cadera con palo', '10', 'Bisagra de cadera con mancuernas livianas', 'Bisagra de cadera con las manos en la cadera'),
        E('Jumping jacks', '30', 'Jumping jacks', 'Jumping jacks'),
      ] },
      { nombre: 'Serie 1', formato: 'x4', ejercicios: [
        E('Kettlebell swing', '15', 'Swing con mancuerna', 'Salto largo + vuelta caminando'),
        E('Press banca con mancuernas', '10–12', 'Press de pecho en el suelo con mancuernas', 'Flexiones'),
        E('Sentadilla búlgara', '10 por pierna', 'Sentadilla búlgara con mancuernas', 'Sentadilla búlgara'),
      ] },
      { nombre: 'Serie 2', formato: 'x3', ejercicios: [
        E('Farmer walk', '30 m', 'Farmer walk con mancuernas', 'Caminata en puntillas brazos arriba'),
        E('Pallof press en polea', '10 por lado', 'Rotación rusa con mancuerna', 'Plancha lateral con rotación'),
        E('Burpees', '10', 'Burpees', 'Burpees'),
      ] },
    ] },
    { dia: 'Día 4', foco: 'Pierna · potencia', bloques: [
      { nombre: 'Warmup', formato: 'x2', ejercicios: [
        E('Zancada lateral', '8 por lado', 'Zancada lateral con mancuerna', 'Zancada lateral'),
        E('Puente de glúteo', '15', 'Puente de glúteo con mancuerna', 'Puente de glúteo'),
        E('Sentadilla con salto suave', '10', 'Sentadilla con salto suave', 'Sentadilla con salto suave', 'Cae blando'),
      ] },
      { nombre: 'Serie 1', formato: 'x4', ejercicios: [
        E('Sentadilla frontal', '8–10', 'Sentadilla frontal con mancuernas', 'Sentadilla con pausa abajo (3")'),
        E('Step-up al cajón', '10 por pierna', 'Step-up con mancuernas', 'Step-up a una silla firme'),
        E('Salto largo', '6', 'Salto largo', 'Salto largo'),
      ] },
      { nombre: 'Serie 2', formato: 'x3', ejercicios: [
        E('Peso muerto a una pierna', '10 por lado', 'Peso muerto a una pierna con mancuerna', 'Bisagra de cadera a una pierna'),
        E('Sentadilla isométrica en la pared', '40"', 'Sentadilla isométrica con mancuerna', 'Sentadilla isométrica en la pared'),
        E('Escaladores', '30', 'Escaladores', 'Escaladores'),
      ] },
    ] },
    { dia: 'Día 5', foco: 'Tren superior · pecho y espalda', bloques: [
      { nombre: 'Warmup', formato: 'x2', ejercicios: [
        E('Rotación externa con banda', '15', 'Rotación externa con mancuerna liviana', 'Círculos de brazos'),
        E('Flexiones inclinadas', '10', 'Flexiones inclinadas', 'Flexiones inclinadas'),
        E('Superman', '12', 'Superman', 'Superman'),
      ] },
      { nombre: 'Serie 1', formato: 'x4', ejercicios: [
        E('Press banca con barra', '8–10', 'Press de pecho en el suelo con mancuernas', 'Flexiones'),
        E('Jalón al pecho', '10–12', 'Pullover con mancuerna', 'Remo invertido bajo una mesa'),
        E('Face pull', '15', 'Pájaro con mancuernas', 'Y-T-W en el suelo'),
      ] },
      { nombre: 'Serie 2', formato: 'x3', ejercicios: [
        E('Aperturas en polea', '12', 'Aperturas con mancuernas', 'Flexiones abiertas'),
        E('Remo con barra', '10', 'Remo inclinado con mancuernas', 'Remo invertido bajo una mesa'),
        E('Burpees', '10', 'Burpees', 'Burpees'),
      ] },
    ] },
  ],
};
out.push(`INSERT INTO weeks (week_start, photo, plan, source, updated_at) VALUES (${q(mondayOf(TODAY))}, NULL, ${q(JSON.stringify(plan))}, 'demo', ${NOW});`);

/* ---------------- agenda: who booked a class time, today and the next days */
const HORAS_AM = ['07:00', '08:00', '09:00'], HORAS_PM = ['18:00', '19:00'], HORAS_SAB = ['09:00', '10:00'];
const resv = (m, day, hora) => out.push(`INSERT OR IGNORE INTO reservas (user_id, day, hora, created_at) SELECT id, ${q(day)}, ${q(hora)}, ${NOW - DAY} FROM users WHERE phone = ${q(m.phone)};`);
for (const m of members) {
  if (m === jp || ausentes[m.name]) continue;
  const pref = { 1: [6], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] }[m.plan] || [];
  for (let k = 0; k <= 6; k++) {
    const d = addDays(TODAY, k);
    const wd = weekday(d);
    if (wd === 0 || !pref.includes(wd) || rnd() > 0.65) continue;
    resv(m, d, wd === 6 ? pick(HORAS_SAB) : m.slot === 'am' ? pick(HORAS_AM) : pick(HORAS_PM));
  }
}
resv(jp, TODAY, '19:00'); // JP booked tonight's class; he checks in live in the demo

/* ---------------- services bought one session at a time (Mercado Pago) and booked */
const SERV = { puncion: 35000, kine: 28000, personalizado: 22000, masaje: 30000 };
const byName = (n) => members.find((m) => m.name === n);
function servicio(m, item, paidDay, bookDay, hora) {
  pid++;
  const at = tsAt(paidDay, 12, 30);
  out.push(`INSERT INTO payments (id, user_id, amount, method, status, paid_at, created_by, created_at, confirmed_at, item, clases) VALUES (${pid}, ${m.id}, ${SERV[item]}, 'mercadopago', 'confirmado', ${at}, 'mercadopago', ${at}, ${at}, ${q(item)}, 1);`);
  if (bookDay) out.push(`INSERT OR IGNORE INTO reservas (user_id, day, hora, servicio, created_at) SELECT id, ${q(bookDay)}, ${q(hora)}, ${q(item)}, ${at} FROM users WHERE phone = ${q(m.phone)};`);
}
servicio(byName('Camila Rojas'), 'masaje', addDays(TODAY, -2), TODAY, '16:00');
servicio(byName('Matías González'), 'kine', addDays(TODAY, -1), TODAY, '17:00');
servicio(byName('Felipe Araya'), 'puncion', addDays(TODAY, -1), addDays(TODAY, 1), '10:00');
servicio(byName('Valentina Díaz'), 'personalizado', addDays(TODAY, -3), addDays(TODAY, 2), '08:00');

console.log(out.join('\n'));
