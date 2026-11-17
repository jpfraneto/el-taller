// The moon, computed (never invented). Phases: Jean Meeus, Astronomical Algorithms, ch. 49 (main terms: error of
// a few minutes, plenty for "this Tuesday is full moon"). Works in the browser and in node (scripts/seed.mjs).

const RAD = Math.PI / 180;
const SYN = 29.530588861;

/** Julian Ephemeris Day of phase k (integer = new moon, +0.5 = full moon). */
function faseJDE(k) {
  const T = k / 1236.85;
  let jde = 2451550.09766 + SYN * k + 0.00015437 * T * T - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const M = (2.5534 + 29.1053567 * k - 0.0000014 * T * T) * RAD;
  const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T * T) * RAD;
  const F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T) * RAD;
  const O = (124.7746 - 1.56375588 * k + 0.0020672 * T * T) * RAD;
  const llena = Math.abs(k % 1) > 0.25;
  const c = llena
    ? [-0.40614, 0.17302, 0.01614, 0.01043, 0.00734, -0.00515, 0.00209]
    : [-0.4072, 0.17241, 0.01608, 0.01039, 0.00739, -0.00514, 0.00208];
  jde += c[0] * Math.sin(Mp) + c[1] * E * Math.sin(M) + c[2] * Math.sin(2 * Mp) + c[3] * Math.sin(2 * F)
    + c[4] * E * Math.sin(Mp - M) + c[5] * E * Math.sin(Mp + M) + c[6] * E * E * Math.sin(2 * M)
    - 0.00111 * Math.sin(Mp - 2 * F) - 0.00057 * Math.sin(Mp + 2 * F) + 0.00056 * E * Math.sin(2 * Mp + M)
    - 0.00042 * Math.sin(3 * Mp) + 0.00042 * E * Math.sin(M + 2 * F) + 0.00038 * E * Math.sin(M - 2 * F)
    - 0.00024 * E * Math.sin(2 * Mp - M) - 0.00017 * Math.sin(O);
  return jde;
}
const jdeToDate = (jde) => new Date((jde - 2440587.5) * 86400000);
const dateToK = (d) => ((d.getTime() / 86400000 + 2440587.5) - 2451550.09766) / SYN;

/** The phases (new and full) from `desde` on, in order: [{tipo:'nueva'|'llena', fecha: Date}]. */
export function proximasFases(desde = new Date(), n = 6) {
  const out = [];
  let k = Math.floor(dateToK(desde) * 2) / 2 - 1;
  while (out.length < n) {
    const f = jdeToDate(faseJDE(k));
    if (f >= desde) out.push({ tipo: k % 1 === 0 ? 'nueva' : 'llena', fecha: f });
    k += 0.5;
  }
  return out;
}

/** Today's moon: age in days, illuminated fraction, waxing or not, and its name in Spanish. */
export function lunaDe(d = new Date()) {
  let k = Math.floor(dateToK(d)) + 1;
  let nueva = jdeToDate(faseJDE(k));
  while (nueva > d) { k -= 1; nueva = jdeToDate(faseJDE(k)); }
  const edad = (d - nueva) / 86400000;
  const fr = edad / SYN;
  const iluminada = (1 - Math.cos(2 * Math.PI * fr)) / 2;
  const creciente = fr < 0.5;
  let nombre;
  if (edad < 1.5 || edad > SYN - 1.5) nombre = 'Luna nueva';
  else if (Math.abs(edad - SYN / 2) < 1.5) nombre = 'Luna llena';
  else if (Math.abs(edad - SYN / 4) < 1.5) nombre = 'Cuarto creciente';
  else if (Math.abs(edad - (3 * SYN) / 4) < 1.5) nombre = 'Cuarto menguante';
  else if (creciente) nombre = edad < SYN / 4 ? 'Luna creciente' : 'Gibosa creciente';
  else nombre = edad < (3 * SYN) / 4 ? 'Gibosa menguante' : 'Luna menguante';
  // Miranda Gray's four archetypes, the language Pili uses for the cycle.
  const arquetipo = fr < 0.25 ? 'La Doncella' : fr < 0.5 ? 'La Madre' : fr < 0.75 ? 'La Hechicera' : 'La Anciana';
  return { edad, fraccion: fr, iluminada, creciente, nombre, arquetipo };
}

/** An SVG moon with the right shadow (southern hemisphere: lit side flipped, as seen from Chile). */
export function lunaSVG(fr, { size = 120, sur = true, luz = '#F6EDE2', sombra = '#5D4233' } = {}) {
  const r = 50;
  const ph = fr * 2 * Math.PI;
  const x = Math.cos(ph) * r; // terminator ellipse half-width
  let derecha = fr < 0.5; // lit side, northern hemisphere: right while waxing
  if (sur) derecha = !derecha;
  const s = derecha ? 1 : 0;
  // lit region = half disc on the lit side + (or −) the terminator ellipse
  const d = `M0 ${-r} A${r} ${r} 0 0 ${s} 0 ${r} A${Math.abs(x)} ${r} 0 0 ${fr >= 0.25 && fr < 0.75 ? s : 1 - s} 0 ${-r}Z`;
  return `<svg viewBox="-55 -55 110 110" width="${size}" height="${size}" aria-hidden="true">
    <circle r="${r}" fill="${sombra}" opacity=".85"/>
    <path d="${d}" fill="${luz}"/>
    <circle r="${r}" fill="none" stroke="${sombra}" stroke-opacity=".35" stroke-width="2"/>
  </svg>`;
}
