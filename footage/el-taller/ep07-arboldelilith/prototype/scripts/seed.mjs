// Demo data → SQL on stdout (npm run db:reset). Every person here is INVENTED. Circle names, places, prices and
// questions come from Pili's own posts; dates are the real next full moon / solstice (computed), but the events
// themselves are a demo until Pili confirms her real ones.
import { proximasFases } from '../public/comun/luna.js';

const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const iso = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const now = Date.now();
const H = 3600 * 1000;
const out = [];

const llena = proximasFases(new Date(now + 2 * 24 * H), 4).find((f) => f.tipo === 'llena');
const year = new Date().getFullYear();
const solsticio = `${year}-12-21` > iso(new Date()) ? `${year}-12-21` : `${year + 1}-12-21`;
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// the workshop: the Saturday about 3 weeks out
const taller = (() => { let d = addDays(iso(new Date()), 21); while (new Date(d + 'T12:00:00Z').getUTCDay() !== 6) d = addDays(d, 1); return d; })();

const eventos = [
  {
    tipo: 'circulo', nombre: 'Círculo de Luna Llena', bajada: 'Haz una pausa. Vacía lo que pesa.', fecha: iso(llena.fecha), hora: '19:00', hora_fin: '21:00',
    lugar: 'Club Lunera, Puerto Varas', luna: 'llena', pregunta: '¿Qué necesita más descanso en ti hoy?', cp: 15, co: 10,
    precios: [{ hasta: null, monto: 15000 }],
    descripcion: 'Un espacio para detenernos, respirar y acompañar juntas aquello que está cambiando dentro de nosotras.',
  },
  {
    tipo: 'taller', nombre: 'Despertando tu Poder Femenino', bajada: 'Explora la ciclicidad y renueva tu esencia.', fecha: taller, hora: '10:00', hora_fin: '14:00',
    lugar: 'Línea Nueva, Llanquihue', luna: null, pregunta: null, cp: 12, co: 0,
    precios: [{ hasta: addDays(taller, -12), monto: 35000 }, { hasta: addDays(taller, -1), monto: 40000 }],
    descripcion: 'La fuerza de cada fase del ciclo, movimiento espontáneo, meditación, el Tarot Madre Paz y los 4 elementos.',
  },
  {
    tipo: 'circulo', nombre: 'Círculo de Solsticio', bajada: 'La noche más corta del año.', fecha: solsticio, hora: '19:00', hora_fin: '21:30',
    lugar: 'Anahata Lodge, Puerto Varas', luna: 'solsticio', pregunta: null, cp: 15, co: 15,
    precios: [{ hasta: addDays(solsticio, -11), monto: 12000 }, { hasta: null, monto: 15000 }],
    descripcion: null,
  },
];
eventos.forEach((e, i) => out.push(
  `INSERT INTO eventos (id, tipo, nombre, bajada, descripcion, fecha, hora, hora_fin, lugar, luna, pregunta, cupos_presencial, cupos_online, precios, estado, created_at) VALUES (${i + 1}, ${q(e.tipo)}, ${q(e.nombre)}, ${q(e.bajada)}, ${q(e.descripcion)}, ${q(e.fecha)}, ${q(e.hora)}, ${q(e.hora_fin)}, ${q(e.lugar)}, ${q(e.luna)}, ${q(e.pregunta)}, ${e.cp}, ${e.co}, ${q(JSON.stringify(e.precios))}, 'abierto', ${now - 5 * 24 * H});`));

// Invented women (first name + initial). Phones in a range no one has.
const NOMBRES = ['Camila R.', 'Javiera M.', 'Francisca T.', 'Valentina S.', 'Antonia P.', 'Catalina V.', 'Daniela F.', 'Constanza L.',
  'Ignacia B.', 'Fernanda O.', 'Macarena C.', 'Josefa A.', 'Trinidad G.', 'Paula E.', 'Isidora N.', 'Carolina H.', 'Rocío D.', 'Amanda K.'];
NOMBRES.forEach((n, i) => out.push(`INSERT INTO users (id, phone, name, role, created_at) VALUES (${i + 1}, '5690000${String(1000 + i)}', ${q(n)}, 'persona', ${now - (20 - i) * 24 * H});`));

let id = 1;
const insc = (ev, user, modalidad, pagada, hAgo, monto) => out.push(
  `INSERT INTO inscripciones (id, evento_id, user_id, modalidad, estado, monto, metodo, pagada_at, created_at) VALUES (${id++}, ${ev}, ${user}, ${q(modalidad)}, ${pagada ? "'pagada'" : "'reservada'"}, ${pagada ? monto : 'NULL'}, ${pagada ? (user % 3 ? "'mercadopago'" : "'transferencia'") : 'NULL'}, ${pagada ? now - (hAgo - 2) * H : 'NULL'}, ${now - hAgo * H});`);
// Luna llena: presencial 8 paid + 5 without paying (2 places left) · online 2 + 2
[1, 2, 3, 4, 5, 6, 7, 8].forEach((u, i) => insc(1, u, 'presencial', true, 90 - i * 7, 15000));
[9, 10, 11, 12, 13].forEach((u, i) => insc(1, u, 'presencial', false, 40 - i * 5, null));
[14, 15].forEach((u, i) => insc(1, u, 'online', true, 70 - i * 9, 15000));
[16, 17].forEach((u, i) => insc(1, u, 'online', false, 20 - i * 4, null));
// Taller: 3
[2, 6].forEach((u, i) => insc(2, u, 'presencial', true, 60 - i * 10, 35000));
insc(2, 18, 'presencial', false, 12, null);
// Solsticio: 1
insc(3, 3, 'presencial', false, 6, null);
// A gift: Valentina S. paid Constanza L.'s place
out.push(`UPDATE inscripciones SET regalo_de = 4 WHERE evento_id = 1 AND user_id = 8;`);

// 1:1 hours ($40.000): one paid for herself, one gift not paid yet
out.push(`INSERT INTO sesiones (user_id, para_nombre, para_telefono, motivo, modalidad, preferencia, monto, estado, pagada, metodo, created_at) VALUES (15, NULL, NULL, 'Terapia (Gestalt, menstrual, Biografía Humana)', 'presencial', 'lunes o miércoles en la mañana', 40000, 'pedida', 1, 'mercadopago', ${now - 26 * H});`);
out.push(`INSERT INTO sesiones (user_id, para_nombre, para_telefono, motivo, modalidad, preferencia, monto, estado, pagada, metodo, created_at) VALUES (16, 'Pía (mi hermana)', '56900009999', 'Lectura de Tarot Madre Paz', 'online', 'cualquier tarde', 40000, 'pedida', 0, NULL, ${now - 5 * H});`);

const MSG = [
  ['Antonia', '¿Qué necesita más descanso en ti hoy?', 'Mi cabeza. Llevo semanas resolviendo todo para todos y hoy me di cuenta de que no me he preguntado qué quiero yo.', 30],
  [null, '¿Qué necesita más descanso en ti hoy?', 'El cuerpo. Gracias por la pregunta, me hizo parar un rato.', 9],
  ['Josefa', 'Quiero saber más: Lectura de Tarot Madre Paz', '¿Haces lecturas online? Vivo en Osorno.', 3],
];
MSG.forEach(([n, p, t, h], i) => out.push(`INSERT INTO mensajes (id, nombre, pregunta, texto, leido, created_at) VALUES (${i + 1}, ${q(n)}, ${q(p)}, ${q(t)}, ${i === 0 ? 1 : 0}, ${now - h * H});`));

out.push(`INSERT INTO nicho (k, v, updated_at) VALUES ('campeon', 'jp-01', ${now});`);
console.log(out.join('\n'));
