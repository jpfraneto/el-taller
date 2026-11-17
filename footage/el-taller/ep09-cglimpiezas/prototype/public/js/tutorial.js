// The tutorial's live status: each step marks itself done from /api/config (what's connected, never the values),
// /api/casos (how many priced jobs) and, for the Instagram step, a "ya lo hice" this phone remembers.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[<&"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]));

function estado(id, hecho, texto) {
  const el = $(id);
  el.classList.toggle('hecho', hecho);
  el.querySelector('[data-st]').textContent = texto;
}

// copy boxes (a link box shows this site's own address)
for (const b of document.querySelectorAll('[data-link]')) b.textContent = location.origin + b.dataset.link;
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copia]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.textContent.trim()); b.classList.add('ok'); setTimeout(() => b.classList.remove('ok'), 1600); } catch {}
});

// "ya lo hice" (Instagram): remembered on this phone
const hice = (k) => { try { return localStorage.getItem(`hice-${k}`) === '1'; } catch { return false; } };
for (const c of document.querySelectorAll('[data-hice]')) {
  c.checked = hice(c.dataset.hice);
  c.addEventListener('change', () => {
    try { localStorage.setItem(`hice-${c.dataset.hice}`, c.checked ? '1' : ''); } catch {}
    estado('#p-ig', c.checked, c.checked ? 'listo' : 'por hacer');
  });
}
estado('#p-ig', hice('ig'), hice('ig') ? 'listo' : 'por hacer');

// the 3 reels' captions, ready to copy
fetch('../data/posts.json').then((r) => r.json()).then((d) => {
  $('#captions').innerHTML = d.posts.filter((p) => p.tipo === 'reel')
    .map((p, i) => `<div style="font-size:13px;color:#5a6a80;margin-top:8px">Texto del reel ${i + 1}:</div><button type="button" class="copia" data-copia>${esc(p.texto)}</button>`).join('');
});

Promise.all([
  fetch('/api/config').then((r) => r.json()),
  fetch('/api/casos').then((r) => r.json()),
  fetch('../data/casos.json').then((r) => r.json()),
]).then(([c, pub, base]) => {
  const k = c.conectado || {};
  const n = (pub.casos || []).filter((x) => x.precio).length;
  const total = base.casos.length - (pub.ocultos || []).length;
  estado('#p-precios', n >= Math.min(5, total), `${n} de ${total}`);
  estado('#p-wa', k.whatsapp_propio, k.whatsapp_propio ? 'listo: llega a ti' : 'va a El Taller');
  estado('#p-mp', k.mercadopago && k.webhook, k.mercadopago ? (k.webhook ? 'listo' : 'falta el webhook') : 'pago de prueba');
  estado('#p-ia', false, k.ia ? 'usa la de El Taller' : 'sin IA');
  estado('#p-dominio', k.dominio_propio, k.dominio_propio ? 'listo' : 'en jpfraneto.com');
}).catch(() => {});
