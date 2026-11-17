// El Duelo: two cars from the stock race over four rounds (price, km, year, engine). The winner of each round moves further.
// It is a comparison dressed as a race (TuAuto already runs a "Torneo de Marcas Japonesas" on Instagram).
import { state, $, esc, abrirHoja, cerrarHoja, foto, wa, nombreCorto, kmTxt } from './app.js';
import { clp } from './precio.js';

const d = { a: null, b: null, corriendo: false, eligiendo: 'a' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const porSlug = (s) => state.autos.find((x) => x.slug === s);
const cc = (a) => { const n = parseFloat(String(a.motor || '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

const RONDAS = [
  { n: 'Precio', gana: 'menor', v: (a) => a.precio, f: (a) => clp(a.precio) },
  { n: 'Kilómetros', gana: 'menor', v: (a) => a.km, f: (a) => kmTxt(a.km) },
  { n: 'Año', gana: 'mayor', v: (a) => a.ano, f: (a) => String(a.ano) },
  { n: 'Motor', gana: 'mayor', v: cc, f: (a) => (cc(a) ? `${cc(a).toLocaleString('es-CL')} L` : '–') },
];

// Side views, 200×80, wheels at x=50/150. One per body type in their stock.
const CUERPO = {
  sedan: 'M8 60 L8 47 Q10 41 24 39 L60 36 L80 22 Q86 18 98 18 L128 18 Q138 18 146 26 L160 37 L184 41 Q193 43 193 51 L193 60 Z',
  hatchback: 'M10 60 L10 45 Q12 39 24 37 L52 35 L72 19 Q77 15 88 15 L140 15 Q151 15 158 25 L176 41 Q182 47 182 53 L182 60 Z',
  suv: 'M8 60 L8 41 Q10 35 20 34 L42 32 L58 14 Q62 10 72 10 L152 10 Q160 10 164 16 L176 33 L187 35 Q195 37 195 45 L195 60 Z',
  pickup: 'M6 60 L6 42 Q8 36 18 35 L40 34 L56 15 Q60 11 70 11 L114 11 Q120 11 120 17 L120 35 L196 35 L196 60 Z',
  coupe: 'M8 60 L8 49 Q10 43 26 41 L68 36 L92 24 Q98 21 110 21 L132 22 Q143 23 153 32 L178 40 Q193 43 193 52 L193 60 Z',
  comercial: 'M8 60 L8 36 Q10 28 20 26 L36 12 Q40 8 50 8 L188 8 Q195 8 195 14 L195 60 Z',
};
const VIDRIO = {
  sedan: 'M66 36 L83 23 Q87 21 96 21 L126 21 Q134 21 140 27 L150 36 Z',
  hatchback: 'M58 35 L74 21 Q78 18 88 18 L138 18 Q146 18 151 26 L160 35 Z',
  suv: 'M48 32 L61 16 Q64 13 72 13 L150 13 Q156 13 159 18 L169 32 Z',
  pickup: 'M46 34 L59 17 Q62 14 70 14 L112 14 Q116 14 116 18 L116 34 Z',
  coupe: 'M76 36 L95 26 Q100 24 110 24 L130 25 Q139 26 146 33 L150 36 Z',
  comercial: 'M24 27 L39 13 Q42 11 50 11 L66 11 L66 27 Z',
};
const TIPO = { suv: 'suv', pickup: 'pickup', hatchback: 'hatchback', citycar: 'hatchback', sedan: 'sedan', coupe: 'coupe', comerciales: 'comercial' };

function silueta(tipo, color) {
  const k = TIPO[tipo] || 'sedan';
  const rueda = (x) => `<g class="rueda"><circle cx="${x}" cy="62" r="13" fill="#0b0d16"/><circle cx="${x}" cy="62" r="6.5" fill="#9aa0b4"/>
    <path d="M${x} 56 L${x} 68 M${x - 6} 62 L${x + 6} 62" stroke="#0b0d16" stroke-width="2"/></g>`;
  return `<svg viewBox="0 0 200 80" aria-hidden="true">
    <path d="${CUERPO[k]}" fill="${color}"/>
    <path d="${VIDRIO[k]}" fill="rgba(200,220,255,.55)"/>
    <rect x="${k === 'comercial' ? 12 : 10}" y="${k === 'pickup' ? 43 : 46}" width="8" height="4" rx="2" fill="#ffe9a6"/>
    ${rueda(50)}${rueda(150)}
  </svg>`;
}

function pintarPick(lado) {
  const a = porSlug(d[lado]);
  const el = $(`#pick-${lado}`);
  el.classList.toggle('lleno', Boolean(a));
  el.innerHTML = a
    ? `<img src="${foto(a)}" alt=""><span class="tx"><b>${esc(nombreCorto(a))}</b>${a.ano} · ${clp(a.precio)}</span>`
    : `<span class="vacio-p">+ Elegir ${lado === 'a' ? 'el primero' : 'el rival'}</span>`;
  $('#largar').disabled = !(d.a && d.b) || d.corriendo;
}

function elegir(lado) {
  d.eligiendo = lado;
  const otro = d[lado === 'a' ? 'b' : 'a'];
  const xs = [...state.autos].sort((x, y) => x.precio - y.precio);
  $('#elegir').innerHTML = `<button class="cerrar" data-cerrar="hoja-elegir" aria-label="Cerrar">×</button>
    <div class="hoja-pad">
      <p class="kicker">El Duelo · ${lado === 'a' ? 'carril azul' : 'carril amarillo'}</p>
      <h2 style="font-size:2rem;margin-bottom:12px">Elige un auto</h2>
      <div class="form" style="margin:0 0 12px"><input id="elegir-q" type="search" placeholder="Buscar marca o modelo"></div>
      <div class="elegir-lista" id="elegir-lista">${xs.map((a) => `<button type="button" data-elige="${a.slug}" ${a.slug === otro ? 'disabled style="opacity:.4"' : ''}>
        <img src="${foto(a)}" alt="" loading="lazy"><span><b>${esc(a.titulo)}</b><small class="num">${a.ano} · ${kmTxt(a.km)} · ${clp(a.precio)}</small></span></button>`).join('')}</div>
    </div>`;
  abrirHoja('hoja-elegir');
  $('#elegir-q').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    $('#elegir-lista').querySelectorAll('[data-elige]').forEach((b) => { b.hidden = q && !b.textContent.toLowerCase().includes(q); });
  });
}

function poner(lado, slug) {
  d[lado] = slug;
  pintarPick(lado);
  limpiarPista();
  if (d.a && d.b) history.replaceState(null, '', `#duelo=${d.a},${d.b}`);
}

function limpiarPista() {
  $('#pista').hidden = true;
  $('#rondas').innerHTML = '';
  $('#ganador').hidden = true;
}

function posicion(el, p) {
  // p: 0–100 = start → finish line; the car's width is subtracted so it stops at the line.
  el.style.left = `calc(${(p * 0.97).toFixed(2)}% - ${(p / 100).toFixed(3)} * min(150px, 32%))`;
}

async function largar() {
  if (!(d.a && d.b) || d.corriendo) return;
  d.corriendo = true;
  $('#largar').disabled = true;
  const A = porSlug(d.a), B = porSlug(d.b);
  const ca = $('#car-a'), cb = $('#car-b');
  ca.innerHTML = `<span class="tag">${clp(A.precio)}</span>${silueta(A.tipo, '#4a62b8')}`;
  cb.innerHTML = `<span class="tag">${clp(B.precio)}</span>${silueta(B.tipo, '#e8a800')}`;
  ca.title = A.titulo; cb.title = B.titulo;
  $('#rondas').innerHTML = '';
  $('#ganador').hidden = true;
  $('#pista').hidden = false;
  posicion(ca, 0); posicion(cb, 0);
  $('#pista').scrollIntoView({ behavior: 'smooth', block: 'center' });

  const sem = $('#semaforo');
  const luces = [...sem.children];
  sem.hidden = false;
  luces.forEach((l) => (l.className = ''));
  for (let i = 0; i < 3; i++) { await sleep(450); luces[i].className = 'r'; }
  await sleep(550);
  luces.forEach((l) => (l.className = 'g'));
  await sleep(350);
  sem.hidden = true;

  let pa = 0, pb = 0, wa_ = 0, wb = 0;
  for (const r of RONDAS) {
    const va = r.v(A), vb = r.v(B);
    const empate = va === vb;
    const ganaA = !empate && (r.gana === 'menor' ? va < vb : va > vb);
    if (!empate) ganaA ? wa_++ : wb++;
    pa += empate ? 19 : ganaA ? 25 : 13;
    pb += empate ? 19 : ganaA ? 13 : 25;
    ca.classList.add('corre'); cb.classList.add('corre');
    posicion(ca, pa); posicion(cb, pb);
    const li = document.createElement('li');
    li.className = 'ronda';
    li.innerHTML = `<span class="va ${!empate && ganaA ? 'gana' : ''}">${esc(r.f(A))}</span>
      <span class="n">Ronda ${RONDAS.indexOf(r) + 1}<b>${r.n}</b></span>
      <span class="va ${!empate && !ganaA ? 'gana' : ''}">${esc(r.f(B))}</span>`;
    $('#rondas').append(li);
    await sleep(1250);
    ca.classList.remove('corre'); cb.classList.remove('corre');
    await sleep(200);
  }
  // Last stretch: the winner crosses the line.
  const ganaA = wa_ > wb || (wa_ === wb && A.precio <= B.precio);
  ca.classList.add('corre'); cb.classList.add('corre');
  posicion(ca, ganaA ? 100 : Math.min(pa, 88)); posicion(cb, ganaA ? Math.min(pb, 88) : 100);
  await sleep(1150);
  ca.classList.remove('corre'); cb.classList.remove('corre');

  const G = ganaA ? A : B, P = ganaA ? B : A;
  const [g, p] = ganaA ? [wa_, wb] : [wb, wa_];
  const g2 = $('#ganador');
  g2.innerHTML = `<p class="kicker">Gana</p>
    <h3>${esc(nombreCorto(G))} ${G.ano}</h3>
    <p>${g === p ? `Empate ${g} a ${p}: gana el más barato.` : `${g} rondas a ${p}.`} Pero el auto lo eliges tú.</p>
    <div class="acciones">
      <a class="btn btn-wa" target="_blank" rel="noopener" href="${wa(`Hola TuAuto, me interesa el ${G.titulo} ${G.ano} (${clp(G.precio)}). Lo vi ganar un duelo en su web 🏁`)}">Me interesa ${esc(nombreCorto(G).split(' ').slice(1).join(' ') || 'este')}</a>
      <a class="btn btn-ghost" target="_blank" rel="noopener" href="${wa(`Hola TuAuto, me interesa el ${P.titulo} ${P.ano} (${clp(P.precio)}). Perdió un duelo en su web, pero me gusta 😅`)}">Me interesa ${esc(nombreCorto(P).split(' ').slice(1).join(' ') || 'el otro')}</a>
    </div>
    <div class="duelo-btns compartir">
      <button class="btn btn-tag" type="button" id="revancha">Otro duelo al azar</button>
      <button class="btn btn-ghost" type="button" id="compartir">Compartir este duelo</button>
    </div>`;
  g2.hidden = false;
  $('#revancha').addEventListener('click', () => { azar(); largar(); });
  $('#compartir').addEventListener('click', compartir);
  d.corriendo = false;
  $('#largar').disabled = false;
}

async function compartir() {
  const A = porSlug(d.a), B = porSlug(d.b);
  const url = `${location.origin}/#duelo=${d.a},${d.b}`;
  const text = `${nombreCorto(A)} ${A.ano} vs ${nombreCorto(B)} ${B.ano}: ¿cuál gana? 🏁`;
  try {
    if (navigator.share) await navigator.share({ title: 'El Duelo · TuAuto', text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); $('#compartir').textContent = '¡Link copiado!'; }
  } catch { /* cancelled */ }
}

function azar() {
  const xs = state.autos;
  const a = xs[Math.floor(Math.random() * xs.length)];
  // A rival in a similar price band makes a better race.
  const cerca = xs.filter((x) => x !== a && Math.abs(x.precio - a.precio) <= Math.max(3_000_000, a.precio * 0.3));
  const b = (cerca.length ? cerca : xs.filter((x) => x !== a))[Math.floor(Math.random() * (cerca.length || xs.length - 1))];
  d.a = a.slug; d.b = b.slug;
  pintarPick('a'); pintarPick('b');
  limpiarPista();
  history.replaceState(null, '', `#duelo=${d.a},${d.b}`);
}

export function alDuelo(slug) {
  if (!d.a || d.a === slug) poner('a', slug); else poner('b', slug);
  if (!d.b) {
    const a = porSlug(slug);
    const cerca = state.autos.filter((x) => x.slug !== slug && x.tipo === a.tipo).sort((x, y) => Math.abs(x.precio - a.precio) - Math.abs(y.precio - a.precio));
    if (cerca[0]) poner('b', cerca[0].slug);
  }
  $('#duelo').scrollIntoView({ behavior: 'smooth' });
}

export function iniciarDuelo() {
  const m = location.hash.match(/^#duelo=([\w-]+),([\w-]+)/);
  if (m && porSlug(m[1]) && porSlug(m[2])) {
    d.a = m[1]; d.b = m[2];
    setTimeout(() => $('#duelo').scrollIntoView(), 300);
  } else {
    const a = porSlug('chevrolet-silverado-4x4-3-0l-aut-high-country'), b = porSlug('ford-f-150-lariat-sport-4x4-5-0l-aut');
    if (a && b) { d.a = a.slug; d.b = b.slug; }
  }
  pintarPick('a'); pintarPick('b');
  $('#pick-a').addEventListener('click', () => !d.corriendo && elegir('a'));
  $('#pick-b').addEventListener('click', () => !d.corriendo && elegir('b'));
  $('#largar').addEventListener('click', largar);
  $('#azar').addEventListener('click', () => !d.corriendo && azar());
  $('#elegir').addEventListener('click', (e) => {
    const b = e.target.closest('[data-elige]');
    if (!b) return;
    poner(d.eligiendo, b.dataset.elige);
    cerrarHoja('hoja-elegir');
  });
}
