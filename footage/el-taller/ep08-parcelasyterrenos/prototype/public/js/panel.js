// Sebastián's panel: who wrote, who's coming, what people ask, what the page is missing.
const $ = (s, el = document) => el.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const leerClave = () => { try { return localStorage.getItem('pyt-clave') || ''; } catch { return ''; } };
const guardarClave = (k) => { try { k ? localStorage.setItem('pyt-clave', k) : localStorage.removeItem('pyt-clave'); } catch {} };

// A private link (/sebastian#k=…) logs in once and forgets the key from the address bar.
if (location.hash.startsWith('#k=')) { guardarClave(decodeURIComponent(location.hash.slice(3))); history.replaceState(null, '', location.pathname); }

const nombreParcela = (id) => D?.parcelas.find((p) => p.id === id)?.titulo || '';
const pesos = (n) => `$${Number(n).toLocaleString('es-CL')}`;
const TEMA = { auspiciar: 'Auspiciar', precio: 'Precio', credito: 'Crédito directo', visita: 'Ir a verla', agua_luz: 'Agua y luz', ubicacion: 'Distancia / ubicación',
  fotos: 'Más fotos', tamano: 'Tamaño', subdivision: 'Subdividir', papeles: 'Papeles', construir: 'Construir', vender: 'Vender la suya', otro: 'Otro' };
const ESTADO = { nuevo: 'Nuevo', contactado: 'Le escribí', visita: 'Fue a verla', negociando: 'Negociando', vendido: 'Vendido', descartado: 'Descartado' };
let D = null;

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-clave': leerClave(), ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { guardarClave(''); mostrarEntrar('Clave incorrecta.'); throw new Error('clave'); }
  if (!r.ok) throw new Error(j.mensaje || 'error');
  return j;
}

function mostrarEntrar(err) {
  $('#app').hidden = true;
  $('#entrar').hidden = false;
  const e = $('#form-clave .form-err');
  e.hidden = !err; e.textContent = err || '';
}

$('#form-clave').addEventListener('submit', (e) => {
  e.preventDefault();
  guardarClave(new FormData(e.target).get('clave'));
  cargar();
});
$('#salir').addEventListener('click', () => { guardarClave(''); mostrarEntrar(); });

function hace(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

const primerNombre = (n) => String(n || '').split(' ')[0];
const telBonito = (t) => (t ? `+56 9 ${t.slice(3, 7)} ${t.slice(7)}` : '');

function waLink(c) {
  const l = c.lead;
  const nombre = primerNombre(l.nombre);
  const parcela = l.parcela_titulo ? ` por "${l.parcela_titulo}"` : '';
  const txt = `Hola ${nombre}, soy ${l.vendedor || D.sitio.dueno}, de Parcelas y Terrenos. Te escribo${parcela}.`;
  return `https://wa.me/${l.telefono}?text=${encodeURIComponent(txt)}`;
}

function resumen(convs) {
  const desde = Date.now() - 24 * 3600e3;
  const hoy = convs.filter((c) => c.t1 >= desde);
  const conDatos = hoy.filter((c) => c.lead?.telefono);
  const visitas = hoy.filter((c) => c.lead?.visita);
  const precio = hoy.filter((c) => c.temas?.includes('precio')).length;
  const top = conDatos.filter((c) => c.estado === 'nuevo')
    .sort((a, b) => ((b.temperatura === 'caliente') - (a.temperatura === 'caliente')) || (b.t1 - a.t1))[0];
  let t = `En las últimas 24 horas <b>${hoy.length} ${hoy.length === 1 ? 'persona' : 'personas'}</b> preguntaron por tus parcelas`;
  t += conDatos.length ? ` y <b>${conDatos.length} dejaron su WhatsApp</b>.` : '.';
  if (visitas.length) t += ` ${visitas.length === 1 ? 'Una quiere' : `${visitas.length} quieren`} ir a verlas.`;
  if (top) t += ` Escríbele primero a <b>${esc(primerNombre(top.lead.nombre))}</b>: ${esc(top.resumen || '')}`;
  if (precio >= 2) t += ` ${precio} preguntaron el precio.`;
  if (!hoy.length) t = 'Hoy todavía nadie ha escrito. Cuando alguien pregunte en la página, te lo resumo aquí.';
  const nuevas = D.parcelas.filter((p) => !p.fija && Date.now() - p.t < 24 * 3600e3);
  if (nuevas.length) t += ` <b>${nuevas.length === 1 ? 'Alguien publicó su parcela' : `${nuevas.length} publicaron su parcela`}</b>: ya está en el mapa.`;
  const pagos = (D.compras || []).filter((c) => Date.now() - c.pagada < 24 * 3600e3);
  if (pagos.length) t += ` Entraron <b>${pesos(pagos.reduce((a, c) => a + c.monto, 0))}</b> por Mercado Pago.`;
  if (D.auspicios.some((a) => Date.now() - a.t < 24 * 3600e3)) t += ' Y una empresa quiere auspiciar.';
  return `<p class="de"><span class="punto"></span>Claude · tu resumen del día</p><p class="t">${t}</p>`;
}

function numeros(convs) {
  const semana = convs.filter((c) => c.t1 >= Date.now() - 7 * 24 * 3600e3);
  const n = [
    [semana.length, 'conversaciones'],
    [semana.filter((c) => c.lead?.telefono).length, 'dejaron su WhatsApp'],
    [semana.filter((c) => c.lead?.visita).length, 'quieren ir a verlas'],
    [D.parcelas.filter((p) => p.estado === 'publicada').length, 'parcelas publicadas'],
  ];
  return n.map(([v, t]) => `<div class="num"><b>${v}</b><span>${t}</span></div>`).join('') +
    '<p class="sub" style="grid-column:1/-1;margin:2px 0 0;text-align:right">últimos 7 días</p>';
}

function visitas(convs) {
  const hoy = D.hoy;
  const vs = convs.filter((c) => c.visita?.fecha && c.visita.fecha >= hoy).sort((a, b) =>
    (a.visita.fecha + a.visita.hora).localeCompare(b.visita.fecha + b.visita.hora));
  if (!vs.length) return '<p class="vacio">Nadie ha agendado todavía.</p>';
  return vs.map((c) => {
    const d = new Date(c.visita.fecha + 'T12:00:00');
    return `<div class="visita">
      <div class="cal"><small>${d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')}</small><b>${d.getDate()}</b></div>
      <div class="q"><b>${esc(c.visita.hora)} · ${esc(primerNombre(c.lead.nombre))}</b><span>${esc(nombreParcela(c.visita.parcela || c.lead.parcela) || 'Parcela por definir')}${c.lead.vendedor && c.lead.vendedor !== D.sitio.dueno ? ` · con ${esc(c.lead.vendedor)}` : ''}</span></div>
      <a class="wa" href="${waLink(c)}" target="_blank" rel="noopener">Confirmar</a>
    </div>`;
  }).join('');
}

function temas(convs) {
  const cuenta = {};
  for (const c of convs) for (const t of c.temas || []) cuenta[t] = (cuenta[t] || 0) + 1;
  const lista = Object.entries(cuenta).filter(([t]) => t !== 'otro').sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!lista.length) return '<p class="vacio">Todavía no hay preguntas.</p>';
  const max = lista[0][1];
  return lista.map(([t, n]) => `<div class="tema"><span>${esc(TEMA[t] || t)}</span><div class="barra"><i style="width:${(n / max) * 100}%"></i></div><b>${n}</b></div>`).join('');
}

// What the page should say, from what people ask (each one is a change Claude can make to the page today).
function ideas(convs) {
  const n = (t) => convs.filter((c) => c.temas?.includes(t)).length;
  const out = [];
  if (n('precio') >= 2) out.push(`<b>${n('precio')} personas</b> preguntaron el precio. La página no lo dice: si me das un "desde", lo publico y llegan más decididos.`);
  if (n('ubicacion')) out.push(`<b>${n('ubicacion')}</b> preguntaron cuánto queda de Puerto Varas. Dime los minutos y lo agrego a cada parcela.`);
  if (n('fotos')) {
    const lm = convs.some((c) => c.temas?.includes('fotos') && c.lead?.parcela === 'las-marcas');
    out.push(lm ? 'Piden fotos de <b>Las Marcas</b>: solo tiene el plano. Mándame 5 fotos por WhatsApp y las subo.' : `<b>${n('fotos')}</b> pidieron más fotos.`);
  }
  if (n('subdivision')) out.push('Preguntan si se puede <b>subdividir</b>. Dime la respuesta una vez y Claude la da solo desde ahora.');
  if (n('credito') >= 2) out.push(`<b>${n('credito')}</b> preguntaron cómo es el crédito directo. Un ejemplo de pie y cuotas ayudaría.`);
  return out.map((t) => `<div class="idea"><span>${t}</span></div>`).join('');
}

// The business: listing is free; the billboards pay.
function plata() {
  const st = D.sitio;
  const total = D.compras.reduce((a, c) => a + c.monto, 0);
  const tomados = Object.keys(D.carteles || {}).length;
  return `<div class="plata">
    <div class="plata-total"><small>Este mes, solo</small><b>${pesos(total)}</b><span>${D.pagos ? 'Mercado Pago conectado ✓: se cobra y se activa sin ti' : 'Falta conectar Mercado Pago: sin eso, nadie puede pagar'}</span></div>
    ${!st.venta_carteles ? `<div><small>Letreros</small><b>Próximamente</b><span>${(D.clics['interes-letrero'] || 0).toLocaleString('es-CL')} tocaron "Me interesa" este mes · te escriben por WhatsApp</span></div>` : `<div><small>Carteles</small><b>${tomados} de ${st.cupos_auspicio}</b><span>${pesos(st.precio_auspicio)} c/u · ${Object.values(D.carteles || {}).map((c) => esc(c.empresa)).join(', ') || 'todos libres'}</span></div>`}
    <p>Publicar es gratis y sin comisión. La plata viene de la atención: los letreros del mapa, pagados con Mercado Pago, prendidos y apagados solos.</p>
    ${tomados ? `<div class="letreros">${Object.entries(D.carteles).map(([i, a]) => `<div class="letrero-p" data-cupo="${esc(i)}">
      <span class="cartel">${caraLetrero(a)}</span>
      <small>${esc(a.empresa)} · hasta el ${new Date(a.hasta).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}</small>
      ${a.img ? '<button class="btn-mini no" data-quitar-img>Quitar su imagen</button>' : ''}</div>`).join('')}</div>` : ''}
  </div>`;
}

function indice() {
  const ix = D.indice;
  const filas = Object.entries(ix.fuentes).map(([k, f]) => `<div class="fx">
    <div><b>${esc(f.nombre)}</b><span>${f.t ? `actualizado ${hace(f.t)}` : 'todavía no se lee'}${f.error ? ` · <em>${esc(f.error)}</em>` : ''}</span></div>
    <b class="fx-n">${f.n.toLocaleString('es-CL')}</b></div>`).join('');
  const q = (ix.quitados || []).filter(Boolean);
  return `<div class="ix-caja"><div class="ix-total"><b>${ix.total.toLocaleString('es-CL')}</b><span>parcelas de otros sitios · UF $${Math.round(ix.uf).toLocaleString('es-CL')}</span></div>
    ${filas}
    <button class="btn-mini si" data-indice>Actualizar ahora</button>
    ${q.length ? `<p class="sub" style="margin:12px 0 4px">Pidieron quitar (${q.length}), ya no aparecen:</p>${q.slice(0, 5).map((x) => `<p class="q-x">${esc(x.titulo)} · ${hace(x.t)}${x.motivo ? ` · “${esc(x.motivo)}”` : ''}</p>`).join('')}` : ''}</div>`;
}

function corredoras() {
  const cs = D.corredoras || [];
  if (!cs.length) return '<p class="vacio">Cuando una corredora se sume en /corredoras/, aparece aquí (con un feed que funcione, entra sola).</p>';
  const ET = { verificada: '✓ verificada', indexada: 'web pública', pendiente: 'quiere ayuda' };
  return cs.sort((a, b) => (D.clics[`co-${b.id}`] || 0) - (D.clics[`co-${a.id}`] || 0)).map((c) => `<div class="pp" data-co="${esc(c.id)}">
    <div class="pp-txt"><b>${esc(c.nombre)}</b> <span class="co-estado ${esc(c.estado)}">${ET[c.estado] || esc(c.estado)}</span>
      <span>${esc(c.comuna || '')}${c.web ? ` · <a href="${esc(c.web)}" target="_blank" rel="noopener">${esc(c.web.replace(/^https?:\/\//, ''))}</a>` : ''}${c.error ? ` · <em>${esc(c.error)}</em>` : ''}</span>
      <span><b>${(D.clics[`co-${c.id}`] || 0).toLocaleString('es-CL')}</b> visitas enviadas este mes${D.indice.fuentes[`co-${c.id}`] ? ` · ${D.indice.fuentes[`co-${c.id}`].n} parcelas` : ''}</span>
      <div class="pp-acc">${c.whatsapp ? `<a class="wa" href="https://wa.me/${esc(c.whatsapp)}?text=${encodeURIComponent(`Hola, soy ${D.sitio.dueno} de parcelasyterrenos.cl. Vi que quieren poner sus parcelas en el mapa.`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${c.estado === 'pendiente' ? '<button class="btn-mini si" data-co-ok>Ya tiene feed: activar</button>' : ''}
        <button class="btn-mini no" data-co-borrar>Quitar</button></div></div></div>`).join('');
}

function tarjetaParcela(p, conAcciones) {
  const v = p.vendedor || {};
  return `<div class="pp" data-p="${esc(p.id)}">
    ${p.fotos?.[0] ? `<img src="${esc(p.fotos[0])}" alt="">` : '<div class="pp-sin">sin fotos</div>'}
    <div class="pp-txt"><b>${esc(p.titulo)}</b> ${p.demo ? '<span class="ej">ejemplo</span>' : ''}
      <span>${esc(p.comuna)} · ${esc(p.superficie)}${p.precio ? ` · ${pesos(p.precio)}` : ''}</span>
      <span>${esc(v.nombre)}${v.quien ? `: ${esc(v.quien)}` : ''}</span>
      ${conAcciones ? `<div class="pp-acc"><button class="btn-mini no" data-rechazar>Bajar</button>
        <a class="wa" href="https://wa.me/${esc(v.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a></div>` : ''}
    </div>
  </div>`;
}

function tarjeta(c) {
  const l = c.lead || {};
  const datos = [
    l.vendedor && `<span class="para">Para ${esc(l.vendedor)}</span>`,
    l.parcela_titulo && `<span>${esc(l.parcela_titulo)}</span>`,
    l.busca && `<span>${esc(l.busca)}</span>`,
    l.credito === 'sí' && '<span>Crédito directo</span>',
    l.visita && `<span class="v">Visita: ${esc(l.visita)}</span>`,
    l.telefono && `<span>${telBonito(l.telefono)}</span>`,
  ].filter(Boolean).join('');
  const estados = D.estados.map((e) => `<option value="${e}" ${c.estado === e ? 'selected' : ''}>${ESTADO[e]}</option>`).join('');
  return `<article class="lead" data-id="${esc(c.id)}">
    <div class="lead-cab"><b>${esc(l.nombre || 'Sin nombre')}</b><span class="temp ${esc(c.temperatura)}">${esc(c.temperatura)}</span>
<span class="hace">${hace(c.t1)}</span></div>
    ${c.resumen ? `<p class="res">${esc(c.resumen)}</p>` : ''}
    <div class="datos">${datos}</div>
    <div class="lead-pie">
      ${l.telefono ? `<a class="wa" href="${waLink(c)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      ${l.telefono ? `<select data-estado>${estados}</select>` : ''}
      <button data-ver>Ver conversación</button>
    </div>
    <div class="conv" hidden>${(c.msgs || []).map((m) => m.r === 'evento' ? `<span class="ev">${esc(m.c)}</span>`
      : `<div class="msg ${m.r === 'user' ? 'el' : 'yo'}">${esc(m.c)}</div>`).join('')}</div>
  </article>`;
}

function pintar() {
  const { convs } = D;
  $('#fecha').textContent = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#resumen').innerHTML = resumen(convs);
  $('#numeros').innerHTML = numeros(convs);
  $('#visitas').innerHTML = visitas(convs);
  $('#temas').innerHTML = temas(convs);
  $('#ideas').innerHTML = ideas(convs);
  const orden = { caliente: 0, tibio: 1, curioso: 2 };
  const con = convs.filter((c) => c.lead?.telefono).sort((a, b) =>
    ((a.estado === 'vendido' || a.estado === 'descartado') - (b.estado === 'vendido' || b.estado === 'descartado')) ||
    (orden[a.temperatura] - orden[b.temperatura]) || (b.t1 - a.t1));
  const sin = convs.filter((c) => !c.lead?.telefono);
  $('#leads').innerHTML = con.length ? con.map(tarjeta).join('') : '<p class="vacio">Todavía nadie deja su WhatsApp.</p>';
  $('#mirando').hidden = !sin.length;
  $('#mirando summary').textContent = `Solo mirando: ${sin.length} ${sin.length === 1 ? 'persona' : 'personas'} sin datos`;
  $('#leads-mirando').innerHTML = sin.map(tarjeta).join('');
  $('#plata').innerHTML = plata();
  $('#indice').innerHTML = indice();
  const nuevas = D.parcelas.filter((p) => !p.fija && p.estado === 'publicada' && Date.now() - p.t < 14 * 864e5);
  $('#b-aprobar').hidden = !nuevas.length;
  $('#aprobar').innerHTML = nuevas.map((p) => tarjetaParcela(p, true)).join('');
  $('#corredoras').innerHTML = corredoras();
  $('#auspicios').innerHTML = D.auspicios.length ? D.auspicios.map((a) => `<div class="vendedor">
      <b>${esc(a.empresa)}</b> ${a.demo ? '<span class="ej">ejemplo</span>' : ''} <span class="hace">· ${hace(a.t)}</span>
      <p>${esc(a.nombre || '')}${a.que ? ` · “${esc(a.que)}”` : ''}</p>
      <a class="wa" href="https://wa.me/${a.telefono}" target="_blank" rel="noopener">WhatsApp</a></div>`).join('')
    : '<p class="vacio">Cuando una empresa quiera aparecer frente a tu tráfico, aparece aquí.</p>';
  const ongs = D.ongs || [];
  $('#ongs').innerHTML = ongs.length ? ongs.map((o) => `<div class="vendedor" data-ong="${esc(o.id)}">
      <b>${esc(o.nombre)}</b> <span class="hace">· ${esc(o.estado)} · ${hace(o.t)}</span>
      <p><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.dominio)} ↗</a>${o.que ? ` · “${esc(o.que)}”` : ''}</p>
      <p>${esc(o.contacto || '')}</p>
      ${o.estado !== 'aprobada' ? '<button class="btn-mini si" data-ong-si>Aprobar</button>' : ''}
      ${o.estado !== 'rechazada' ? '<button class="btn-mini no" data-ong-no>' + (o.estado === 'aprobada' ? 'Sacar' : 'No') + '</button>' : ''}</div>`).join('')
    : '<p class="vacio">Las ONGs que se inscriban para el cartel gratis aparecen aquí. Las que apruebas se turnan en el mapa.</p>';
  $('#publicadas').innerHTML = D.parcelas.filter((p) => p.estado === 'publicada')
    .sort((a, b) => b.t - a.t).map((p) => tarjetaParcela(p, false)).join('');
}

document.addEventListener('click', async (e) => {
  const ver = e.target.closest('[data-ver]');
  if (ver) {
    const c = ver.closest('.lead').querySelector('.conv');
    c.hidden = !c.hidden;
    ver.textContent = c.hidden ? 'Ver conversación' : 'Ocultar';
    return;
  }
  const qi = e.target.closest('[data-quitar-img]');
  if (qi) {
    await api(`/api/panel/cartel/${qi.closest('[data-cupo]').dataset.cupo}`, { method: 'POST', body: '{}' });
    return cargar();
  }
  const og = e.target.closest('[data-ong]');
  if (og && (e.target.closest('[data-ong-si]') || e.target.closest('[data-ong-no]'))) {
    await api(`/api/panel/ong/${og.dataset.ong}`, { method: 'POST', body: JSON.stringify({ estado: e.target.closest('[data-ong-si]') ? 'aprobada' : 'rechazada' }) });
    return cargar();
  }
  const co = e.target.closest('[data-co]');
  if (co) {
    const cambio = e.target.closest('[data-co-ok]') ? { estado: 'verificada' } : e.target.closest('[data-co-borrar]') ? { borrar: true } : null;
    if (cambio) { await api(`/api/panel/co/${co.dataset.co}`, { method: 'POST', body: JSON.stringify(cambio) }); return cargar(); }
  }
  const pp = e.target.closest('[data-p]');
  if (pp) {
    const id = pp.dataset.p;
    const cambio = e.target.closest('[data-aprobar]') ? { estado: 'publicada' }
      : e.target.closest('[data-rechazar]') ? { estado: 'rechazada' } : null;
    if (cambio) { await api(`/api/panel/p/${id}`, { method: 'POST', body: JSON.stringify(cambio) }); return cargar(); }
  }
  const bi = e.target.closest('[data-indice]');
  if (bi) { bi.disabled = true; bi.textContent = 'Leyendo los sitios…'; await api('/api/panel/indice', { method: 'POST', body: '{}' }).catch(() => {}); return cargar(); }
  const demo = e.target.closest('[data-demo]');
  if (demo) { await api('/api/panel/demo', { method: 'POST', body: JSON.stringify({ accion: demo.dataset.demo }) }); cargar(); }
});
document.addEventListener('change', async (e) => {
  if (!e.target.matches('[data-estado]')) return;
  const id = e.target.closest('.lead').dataset.id;
  await api(`/api/panel/c/${id}`, { method: 'POST', body: JSON.stringify({ estado: e.target.value }) });
  D.convs.find((c) => c.id === id).estado = e.target.value;
});

async function cargar() {
  if (!leerClave()) return mostrarEntrar();
  try {
    D = await api('/api/panel');
    $('#entrar').hidden = true;
    $('#app').hidden = false;
    pintar();
  } catch {}
}
cargar();
setInterval(() => { if (!$('#app').hidden && !document.querySelector('.conv:not([hidden])')) cargar(); }, 30000);
