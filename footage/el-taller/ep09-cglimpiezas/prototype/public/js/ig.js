// @cglimpiezas, redesigned: the grid from data/posts.json (made by make_grid.py), the post viewer, Hoy/Propuesta, huecos.
const $ = (s) => document.querySelector(s);
const ICO = {
  reel: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm6 6v7l6-3.5z"/></svg>',
  pin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15 3l6 6-3 1-4 4 1 5-2 1-4-5-5 5-1-1 5-5-5-4 1-2 5 1 4-4z"/></svg>',
};

let posts = [];

function tile(p, alto) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tile' + (p.tipo === 'hueco' ? ' es-hueco' : '');
  b.dataset.post = p.id;
  b.innerHTML = `<img src="${p.img}" alt="" loading="lazy">` +
    (p.tipo === 'reel' ? `<span class="ico">${ICO.reel}</span>` : p.fijado ? `<span class="ico">${ICO.pin}</span>` : '');
  if (alto) b.style.aspectRatio = '9 / 16';
  return b;
}

function pintar(tab) {
  const g = $('#grilla');
  g.replaceChildren(...(tab === 'reels' ? posts.filter((p) => p.tipo === 'reel') : posts).map((p) => tile(p, tab === 'reels')));
  g.classList.toggle('reels', tab === 'reels');
}

function abrir(id) {
  const p = posts.find((x) => x.id === id);
  if (!p) return;
  const m = $('#post-media');
  m.innerHTML = p.video
    ? `<video src="${p.video}" poster="${p.img}" autoplay muted loop playsinline controls></video>`
    : `<img src="${p.img}" alt="">`;
  $('#post-texto').innerHTML = `<b>cglimpiezas</b> ${p.texto.replace(/[<&]/g, (c) => ({ '<': '&lt;', '&': '&amp;' }[c]))}`;
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
$('#post').addEventListener('close', () => { $('#post-media').innerHTML = ''; });

fetch('/api/config').then((r) => r.json()).then((c) => {
  $('#wa-ig').href = `https://wa.me/${c.wa}?text=${encodeURIComponent((c.demo ? `[demo · ${c.demo}] ` : '') + 'Hola CG, quiero cotizar')}`;
}).catch(() => {});

fetch('data/posts.json').then((r) => r.json()).then((d) => { posts = d.posts; pintar('grilla'); });
