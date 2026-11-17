// The team side: every "Mandar a TuAuto" lands here as a card (photo, model, year, km, range, what they want, code).
// When the WhatsApp arrives with "Código de mi foto: K7Q2", whoever answers already has the car in front of them.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mill = (n) => (n / 1e6).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ESTADOS = [['nueva', 'Nueva'], ['tomada', 'Tomada'], ['revision', 'Revisión'], ['cerrada', 'Cerrada']];
const st = { key: '', lista: [], equipo: [], tab: 'abiertas' };

function getKey() { try { return localStorage.getItem('tuauto-equipo') || ''; } catch { return ''; } }
function setKey(k) { try { localStorage.setItem('tuauto-equipo', k); } catch { /* private mode */ } }

const api = (path, opts = {}) => fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-equipo': st.key, ...(opts.headers || {}) } });

function hace(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(ts).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

function login(msg) {
  $('#eq').innerHTML = `<form class="login form" id="login">
    <p class="kicker">TuAuto · equipo</p>
    <h2 style="font-size:2.2rem">Autos por revisar</h2>
    ${msg ? `<p class="error">${esc(msg)}</p>` : ''}
    <label>Clave del equipo<input name="k" type="password" autocomplete="current-password" required></label>
    <button class="btn btn-navy" type="submit">Entrar</button>
  </form>`;
  $('#login').addEventListener('submit', (e) => { e.preventDefault(); st.key = e.target.k.value.trim(); cargar(); });
}

async function cargar() {
  const r = await api('/api/equipo/solicitudes');
  if (r.status === 401) return login(st.key ? 'Esa clave no es.' : '');
  const d = await r.json();
  setKey(st.key);
  st.lista = d.solicitudes;
  st.equipo = d.equipo;
  pintar();
}

function pintar() {
  const abiertas = st.lista.filter((s) => s.estado !== 'cerrada');
  const xs = st.tab === 'abiertas' ? abiertas : st.lista.filter((s) => s.estado === st.tab);
  const nuevas = st.lista.filter((s) => s.estado === 'nueva').length;
  const hoy = st.lista.filter((s) => Date.now() - s.ts < 864e5).length;
  $('#eq').innerHTML = `
    <div class="eq-head">
      <div><p class="kicker">TuAuto · Compramos tu auto</p><h1>Autos por revisar</h1></div>
      <div class="resumen"><span><b>${nuevas}</b>nuevas</span><span><b>${hoy}</b>últimas 24 h</span><span><b>${st.lista.length}</b>total</span></div>
    </div>
    <div class="tabs">
      ${[['abiertas', 'Abiertas', abiertas.length], ...ESTADOS.map(([k, n]) => [k, n, st.lista.filter((s) => s.estado === k).length])]
        .map(([k, n, c]) => `<button class="chip" data-tab="${k}" aria-pressed="${st.tab === k}">${n}<b>${c}</b></button>`).join('')}
      <button class="chip" id="recargar">↻ Actualizar</button>
    </div>
    ${xs.length ? `<div class="lista">${xs.map(card).join('')}</div>` : '<p class="vacio-eq">Nada por aquí todavía. Cuando alguien tase su auto en la web y lo mande, aparece acá.</p>'}`;
}

function card(s) {
  return `<article class="sol" data-id="${s.id}">
    <div class="ph"><img src="/api/equipo/foto/${s.id}?k=${encodeURIComponent(st.key)}" alt="${esc(s.auto)}" loading="lazy" onerror="this.style.opacity=0">
      <span class="cod">#${s.id}</span><span class="hace">${hace(s.ts)}</span>${s.demo ? '<span class="demo">DEMO</span>' : ''}</div>
    <div class="tx">
      <span class="quiere ${s.camino}">${s.camino === 'consigna' ? 'Quiere que lo vendan por él' : 'Quiere venderlo hoy'}</span>
      <span class="ti">${esc(s.auto)} ${s.ano || ''}</span>
      <span class="me">${s.km != null ? `${Number(s.km).toLocaleString('es-CL')} km` : ''}${s.nombre ? ` · ${esc(s.nombre)}` : ''}</span>
      <span class="rg">${s.min ? `Web: $${mill(s.min)} – $${mill(s.max)} M` : 'Web: sin datos de este modelo'}</span>
      <div class="fila">
        <select data-quien aria-label="Quién la toma"><option value="">Sin asignar</option>${st.equipo.map((q) => `<option ${s.quien === q ? 'selected' : ''}>${q}</option>`).join('')}</select>
      </div>
      <div class="estados">${ESTADOS.map(([k, n]) => `<button data-estado="${k}" aria-pressed="${s.estado === k}">${n}</button>`).join('')}</div>
    </div>
  </article>`;
}

async function cambiar(id, patch) {
  const s = st.lista.find((x) => x.id === id);
  Object.assign(s, patch);
  if (patch.quien && s.estado === 'nueva') { s.estado = 'tomada'; patch.estado = 'tomada'; }
  pintar();
  await api(`/api/equipo/solicitudes/${id}`, { method: 'POST', body: JSON.stringify(patch) });
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { st.tab = t.dataset.tab; pintar(); return; }
  if (e.target.id === 'recargar') { cargar(); return; }
  const b = e.target.closest('[data-estado]');
  if (b) cambiar(b.closest('[data-id]').dataset.id, { estado: b.dataset.estado });
});
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-quien]')) cambiar(e.target.closest('[data-id]').dataset.id, { quien: e.target.value });
});

st.key = new URLSearchParams(location.search).get('k') || getKey();
if (st.key) cargar(); else login();
setInterval(() => { if (st.key && document.visibilityState === 'visible') cargar(); }, 30000);
