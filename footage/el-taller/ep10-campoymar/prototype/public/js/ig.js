// @campoymar_chiloe, redesigned: the grid from data/posts.json, the post viewer, Hoy/Propuesta, huecos.
const $ = (s) => document.querySelector(s);
const ICO = {
  reel: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm6 6v7l6-3.5z"/></svg>',
  pin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15 3l6 6-3 1-4 4 1 5-2 1-4-5-5 5-1-1 5-5-5-4 1-2 5 1 4-4z"/></svg>',
};

let posts = [];
const esc = (t) => String(t ?? '').replace(/[<&"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]));
const SELLO = { prueba: 'en prueba', salio: 'salió', llego: 'llegó', lleva: 'qué lleva' };

// a proposed post: their photo + the editorial line on top (en prueba · salió · llegó · qué lleva), or one of their sentences
function disenio(p) {
  // foco + zoom: move in on their photo when it carries the old post's text (it would clash with the new design)
  const img = `<img src="${p.img}" alt="" loading="lazy"${p.zoom ? ` style="object-position:${p.foco};transform:scale(${p.zoom});transform-origin:${p.foco}"` : ''}>`;
  if (!p.formato) return img;
  if (p.formato === 'frase') {
    return `${img}<span class="velo"></span><span class="frase">${esc(p.titulo)}</span><span class="firma-cm">CAMPO &amp; MAR</span>`;
  }
  return `${img}<span class="velo abajo"></span><span class="sello s-${p.formato}">${SELLO[p.formato]}</span>` +
    `<span class="tt"><b>${esc(p.titulo)}</b>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</span>`;
}

function tile(p, alto) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tile' + (p.formato ? ' disenado f-' + p.formato : '');
  b.dataset.post = p.id;
  b.innerHTML = disenio(p) +
    (p.fijado ? `<span class="ico">${ICO.pin}</span>` : p.video ? `<span class="ico">${ICO.reel}</span>` : '');
  if (alto) b.style.aspectRatio = '9 / 16';
  return b;
}

function pintar(tab) {
  const g = $('#grilla');
  g.replaceChildren(...(tab === 'reels' ? posts.filter((p) => p.video) : posts).map((p) => tile(p, tab === 'reels')));
}

function abrir(id) {
  const p = posts.find((x) => x.id === id);
  if (!p) return;
  $('#post-media').innerHTML = `<div class="tile disenado grande${p.formato ? ' f-' + p.formato : ''}">${disenio(p)}</div>`;
  $('#post-texto').innerHTML = `<b>campoymar_chiloe</b> ${p.texto.replace(/[<&]/g, (c) => ({ '<': '&lt;', '&': '&amp;' }[c]))}`;
  $('#post').showModal();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-post]');
  if (t) return abrir(t.dataset.post);
  if (e.target.closest('[data-cerrar]') || e.target === $('#post')) return $('#post').close();
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === tab)));
    return pintar(tab.dataset.tab);
  }
  const ver = e.target.closest('[data-ver]');
  if (ver) {
    document.querySelectorAll('[data-ver]').forEach((x) => x.setAttribute('aria-pressed', String(x === ver)));
    $('#hoy').hidden = ver.dataset.ver !== 'hoy';
    $('#ig').hidden = ver.dataset.ver !== 'ig';
    return;
  }
  if (e.target.closest('#huecos')) {
    const on = document.body.classList.toggle('mostrar-huecos');
    $('#huecos').setAttribute('aria-pressed', String(on));
    if (on) { $('[data-ver="ig"]').click(); document.querySelector('.hueco')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
});

fetch('/api/config').then((r) => r.json()).then((c) => {
  $('#wa-ig').href = `https://wa.me/${c.wa}?text=${encodeURIComponent((c.demo ? `[demo · ${c.demo}] ` : '') + 'Hola Campo & Mar 🌿')}`;
}).catch(() => {});

fetch('/data/posts.json').then((r) => r.json()).then((d) => { posts = d.posts; pintar('grilla'); });
