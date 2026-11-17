// /horno/?k=…: Campo & Mar's private link. Writes today's batch, the tests (goal, state, who reserved) and deliveries.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[<&"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]));
const k = new URLSearchParams(location.search).get('k') || '';
const api = `/api/horno?k=${encodeURIComponent(k)}`;

async function enviar(cambio) {
  $('#error').textContent = '';
  const r = await fetch(api, cambio ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cambio) } : {});
  const j = await r.json();
  if (!r.ok) { $('#error').textContent = j.message || 'No se pudo.'; return null; }
  pintar(j);
  return j;
}

function pintar(est) {
  const h = est.hoy;
  if (h) { $('#f-hoy').elements.ancud.value = h.ancud; $('#f-hoy').elements.castro.value = h.castro; }
  $('#pruebas').innerHTML = est.pruebas.map((p) => `
    <form class="form prueba-dueña" data-id="${esc(p.id)}" style="margin-bottom:12px">
      <div class="n" style="font-family:var(--marca);font-weight:700;font-size:22px">${esc(p.nombre)}</div>
      <div><b>${p.cuenta}</b> reservas${p.reservas?.length ? ': ' + p.reservas.map((r) => `${esc(r.nombre)} (${esc(r.tienda)})`).join(', ') : ''}</div>
      <div class="dos">
        <label>Con cuántas la hornean<input name="meta" type="number" min="1" max="999" value="${p.meta ?? ''}"></label>
        <label>Estado<select name="estado">
          ${[['abierta', 'abierta: se reserva'], ['sale', 'sale: ya la hornean'], ['cerrada', 'cerrada: no se muestra']]
            .map(([v, t]) => `<option value="${v}"${p.estado === v ? ' selected' : ''}>${t}</option>`).join('')}
        </select></label>
      </div>
      <label>Si sale, ¿cuándo? <input name="sale" maxlength="80" value="${esc(p.sale || '')}" placeholder="el jueves en Ancud"></label>
      <button type="submit" class="mas" style="justify-self:start">Guardar</button>
    </form>`).join('');
}

$('#f-hoy').addEventListener('submit', (e) => {
  e.preventDefault();
  enviar({ hoy: { ancud: e.target.elements.ancud.value, castro: e.target.elements.castro.value } });
});
$('#f-nueva').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  if (await enviar({ prueba: { nombre: f.nombre.value, texto: f.texto.value, meta: f.meta.value } })) e.target.reset();
});
$('#f-llego').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  if (await enviar({ llego: { donde: f.donde.value, ciudad: f.ciudad.value, que: f.que.value } })) e.target.reset();
});
$('#pruebas').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target.elements;
  enviar({ prueba: { id: e.target.dataset.id, meta: f.meta.value, estado: f.estado.value, sale: f.sale.value } });
});

enviar();
