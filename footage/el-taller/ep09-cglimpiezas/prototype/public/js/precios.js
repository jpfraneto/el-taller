// Reference prices for the estimate: what 10 Santiago cleaners publish (research/precios-referencia.md, seen 2026-11-12).
// Market references, NOT CG's prices: CG hasn't published any (that's a gap the page shows). n = businesses behind
// each number; "desde" = only a starting price was published.
export const FUENTES = { negocios: 10, fecha: '2026-11-12' };

export const ITEMS = {
  alfombra_muro:  { nombre: 'Alfombra muro a muro', unidad: 'm²', min: 2800, max: 5000, n: 3, pordefecto: 12, rango: [4, 120] },
  alfombra_deco:  { nombre: 'Alfombra decorativa', unidad: 'm²', min: 5000, max: 6400, n: 3, pordefecto: 4, rango: [1, 30] },
  sillon:         { nombre: 'Sillón', unidad: 'cuerpos', porCuerpos: { 1: [25000, 28000], 2: [35000, 38000], 3: [30000, 50000] },
                    n: 3, pordefecto: 3, rango: [1, 3] },
  seccional:      { nombre: 'Sillón en L / seccional', unidad: 'pieza', min: 60000, max: 65000, n: 1, desde: true, pordefecto: 1, rango: [1, 2] },
  poltrona:       { nombre: 'Poltrona / butaca / silla mariposa', unidad: 'pieza', min: 40000, max: 40000, n: 1, desde: true, pordefecto: 1, rango: [1, 6] },
  silla:          { nombre: 'Silla de comedor', unidad: 'sillas', min: 7000, max: 12000, n: 2, pordefecto: 6, rango: [1, 16] },
  colchon:        { nombre: 'Colchón', unidad: 'plazas', porTamano: { '1': [25000, 35000], '1.5': [25000, 38000], '2': [30000, 45000], 'king': [40000, 50000] },
                    n: 4, pordefecto: '2' },
  coche:          { nombre: 'Coche de bebé / silla de auto', unidad: 'pieza', min: 39990, max: 59900, n: 1, pordefecto: 1, rango: [1, 3] },
};

// Minimum order (3 businesses: 30.000–45.000). Stains and pet hair: two businesses include them; urine/odor treatment
// has no published price (a marketplace guide says 5.000–15.000), so it's shown apart, as "puede sumar".
export const MINIMO = [30000, 45000];
export const EXTRA_ORINA = [5000, 15000];

export const clp = (n) => '$' + (Math.round(n / 1000) * 1000).toLocaleString('es-CL');

// tipo + cantidad → { min, max, desde, n, detalle }
export function estimar(tipo, cantidad, { orina = false } = {}) {
  const it = ITEMS[tipo];
  if (!it) return null;
  let min, max;
  if (it.porCuerpos) {
    const c = Math.max(1, Math.min(3, Number(cantidad) || 3));
    [min, max] = it.porCuerpos[c];
  } else if (it.porTamano) {
    [min, max] = it.porTamano[String(cantidad)] || it.porTamano['2'];
  } else {
    const q = Math.max(1, Number(cantidad) || it.pordefecto);
    min = it.min * q; max = it.max * q;
  }
  const bajoMinimo = max < MINIMO[0];
  min = Math.max(min, MINIMO[0]); max = Math.max(max, MINIMO[0]);
  if (orina) { min += EXTRA_ORINA[0]; max += EXTRA_ORINA[1]; }
  return { min, max, desde: Boolean(it.desde), n: it.n, bajoMinimo };
}

// CG's own price from its public jobs (/api/casos: what CG wrote on /tus-casos/). Same type → the price per unit of
// each case (per m², per cuerpo, per piece; mattresses by size) × this quantity. null if CG has no similar case yet.
export function deCG(casos, tipo, cantidad) {
  const igual = (casos || []).filter((c) => c.tipo === tipo && c.precio);
  if (!igual.length) return null;
  let precios;
  if (tipo === 'colchon') {
    const mismo = igual.filter((c) => String(c.cantidad) === String(cantidad));
    precios = (mismo.length ? mismo : igual).map((c) => c.precio);
  } else {
    const q = Math.max(1, Number(cantidad) || 1);
    precios = igual.map((c) => (c.precio / Math.max(1, Number(c.cantidad) || 1)) * q);
  }
  return { min: Math.min(...precios), max: Math.max(...precios), n: igual.length };
}
