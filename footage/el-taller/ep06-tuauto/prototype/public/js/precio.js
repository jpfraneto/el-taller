// The price range: "autos como el tuyo se publican entre X y Y".
// Inputs: the reference table (data/precios.json: asking prices seen in Chilean listings, by model and year)
// plus TuAuto's own stock (same model). Output: a range, the points it stands on, and how sure it is.
// It is a reference of published prices, not an offer: the offer is made by a person at the inspection.

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (s) => norm(s).replace(/ /g, '');

const MARCA_ALIAS = { 'mercedes': 'mercedes benz', 'mercedes-benz': 'mercedes benz', 'vw': 'volkswagen', 'chevy': 'chevrolet',
  'great wall motors': 'great wall', 'gwm': 'great wall', 'citroën': 'citroen' };
const marcaN = (m) => { const n = norm(m); return MARCA_ALIAS[n] || n; };

// Which reference entry is this car? Same brand, and the longest model name contained in what we were told.
export function buscarModelo(ref, marca, modelo) {
  const mk = marcaN(marca), md = compact(modelo);
  if (!md) return null;
  let best = null;
  for (const r of ref.modelos) {
    if (marcaN(r.marca) !== mk) continue;
    const rm = compact(r.modelo.split('(')[0]);
    const alts = [rm, ...rm.split('/').map(compact)].filter(Boolean);
    for (const a of alts) {
      if (md === a || md.includes(a) || a.includes(md)) {
        const score = (md === a ? 100 : 0) + Math.min(a.length, md.length);
        if (!best || score > best.score) best = { r, score };
      }
    }
  }
  return best?.r || null;
}

// TuAuto's stock cars of the same model (their titles are "FORD ECOSPORT S 1.5 MT").
// With a reference entry, a stock car counts only if its own best entry is the same one ("Corolla" ≠ "Corolla Cross").
export function delStock(autos, marca, modelo, ref, r) {
  const mk = marcaN(marca), md = norm(modelo);
  if (!md) return [];
  return autos.filter((a) => {
    if (marcaN(a.marca) !== mk) return false;
    const resto = norm(a.titulo).replace(new RegExp(`^${mk} `), '');
    if (r) return buscarModelo(ref, a.marca, resto) === r;
    return ` ${resto} `.includes(` ${md} `);
  });
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function precioAlAno(puntos, ano) {
  const porAno = new Map();
  for (const p of puntos) porAno.set(p.ano, [...(porAno.get(p.ano) || []), p.precio]);
  const anos = [...porAno.keys()].sort((a, b) => a - b);
  const val = (y) => median(porAno.get(y));
  if (porAno.has(ano)) return { precio: val(ano), dentro: true };
  const bajo = anos.filter((y) => y < ano).pop();
  const alto = anos.find((y) => y > ano);
  if (bajo != null && alto != null) {
    const t = (ano - bajo) / (alto - bajo);
    return { precio: Math.exp(Math.log(val(bajo)) * (1 - t) + Math.log(val(alto)) * t), dentro: true };
  }
  // Outside the data: ~9% a year down for older, ~7% up for newer, from the nearest point.
  if (alto != null) return { precio: val(alto) * Math.pow(0.91, alto - ano), dentro: alto - ano <= 1, lejos: alto - ano };
  return { precio: val(bajo) * Math.pow(1.07, ano - bajo), dentro: ano - bajo <= 1, lejos: ano - bajo };
}

const ESTADO_AJUSTE = { 'impecable': 0.02, 'bueno': 0, 'con detalles': -0.05, 'para reparar': -0.15 };
const redondear = (n) => Math.round(n / 100000) * 100000;
const HOY = 2026.85; // Nov 2026

// Pickups: "D-Max" + "4x4" in the version → the "D-Max 4x4" entry when there is one.
function modeloConTraccion(ref, marca, modelo, version) {
  const tr = String(version || '').match(/4x[24]/i);
  if (!tr || /4x[24]/i.test(modelo)) return buscarModelo(ref, marca, modelo);
  const r = buscarModelo(ref, marca, `${modelo} ${tr[0].toLowerCase()}`);
  return r && /4x[24]/i.test(r.modelo) ? r : buscarModelo(ref, marca, modelo);
}

export function tasar({ ref, autos, marca, modelo, version, ano, km, estado }) {
  const r = modeloConTraccion(ref, marca, modelo, version);
  const stock = delStock(autos, marca, modelo, ref, r);
  const puntos = [
    ...(r?.puntos || []).map((p) => ({ ano: p.ano, precio: p.precio, n: p.n || 1, fuente: 'avisos' })),
    ...stock.map((a) => ({ ano: a.ano, precio: a.precio, km: a.km, fuente: 'tuauto', slug: a.slug })),
  ].filter((p) => p.ano && p.precio);
  if (!puntos.length) return { ok: false, modelo: r, stock };

  const base = precioAlAno(puntos, ano);
  const esperado = Math.max(8000, 15000 * (HOY - ano));
  const kmAdj = km == null ? 0 : Math.max(-0.14, Math.min(0.06, -((km - esperado) / 10000) * 0.012));
  const estAdj = ESTADO_AJUSTE[estado] ?? 0;
  const centro = base.precio * (1 + kmAdj + estAdj);
  const nAvisos = (r?.puntos || []).reduce((s, p) => s + (p.n || 1), 0);
  const solido = base.dentro && puntos.length >= 3;
  // How spread out the listings are for this model: the middle half of asking prices (P25–P75) relative to the median.
  const rel = (r?.puntos || []).filter((p) => p.rango_p25_p75).map((p) => [p.rango_p25_p75[0] / p.precio, p.rango_p25_p75[1] / p.precio]);
  let bajo = rel.length ? median(rel.map((x) => 1 - x[0])) : 0.07;
  let alto = rel.length ? median(rel.map((x) => x[1] - 1)) : 0.07;
  const extra = solido ? 0 : base.dentro ? 0.02 : 0.05;
  bajo = Math.min(0.18, Math.max(0.04, bajo + extra));
  alto = Math.min(0.18, Math.max(0.04, alto + extra));
  const min = redondear(centro * (1 - bajo));
  const max = redondear(centro * (1 + alto));
  return {
    ok: true, min, max, centro: redondear(centro),
    confianza: solido ? 'alta' : base.dentro ? 'media' : 'baja',
    ajustes: { km: kmAdj, estado: estAdj, esperado: Math.round(esperado) },
    puntos, nAvisos, modelo: r, stock,
  };
}

// Cars in stock the seller could take with theirs as down payment: priced above their car, closest first.
export function parteDePago(autos, valor, n = 3) {
  return autos
    .filter((a) => a.precio > valor && a.precio - valor <= 9_000_000)
    .sort((a, b) => (a.precio - valor) - (b.precio - valor))
    .slice(0, n);
}

export const clp = (n) => '$' + Math.round(n).toLocaleString('es-CL');
export const millones = (n, d = 1) => (n / 1e6).toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d });
