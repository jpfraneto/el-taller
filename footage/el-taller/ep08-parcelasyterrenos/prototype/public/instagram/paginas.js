// The reels as a phone directory: every zoom level is a yellow page, and the pages riffle one behind the other until the
// last one is the parcel. Paper grain, an engraved ocean, Chile in halftone, guide words and the real scale on top, and
// the real listings of that stretch of Chile in directory columns. The last pages print the satellite photo on the paper.
(async function () {
  const TINTA = '#161512', AMARILLO = '#f6cf3a', R_KM = 6371;
  await Promise.all(['700 20px "Archivo Narrow"', '500 20px "Archivo Narrow"'].map((f) => document.fonts.load(f))).catch(() => {});
  const [mundo, detalle, datos] = await Promise.all(['mundo.json', 'detalle.json', 'reels.json'].map((u) => fetch(u).then((r) => r.json())));
  const paises = topojson.feature(mundo, mundo.objects.countries);
  const tierra = topojson.merge(mundo, mundo.objects.countries.geometries);
  const chile = paises.features.find((f) => f.id === '152');
  const chileFino = detalle.features.find((f) => f.id === '152');
  const argFino = detalle.features.find((f) => f.id === '032');
  const reticula = d3.geoGraticule10();
  const R = datos.reels;

  // Every listing on the map, for the directory columns (facts only, the same ones the map shows).
  let indice = [];
  const indiceListo = fetch('/api/parcelas?mapa=1').then((r) => r.json()).then((d) => {
    indice = d.indexadas.filter((x) => x.monto > 0 && x.lat && x.comuna && !/[+\d]/.test(x.comuna)).map((x) => ({
      comuna: x.comuna, lat: x.lat, lng: x.lng,
      usd: x.monto * (x.moneda === 'UF' ? datos.uf_clp : 1) / datos.usd_clp,
    }));
  }).catch(() => {});

  const fmt = (n) => n.toLocaleString('es-CL');
  const usdCorto = (n) => n >= 1e6 ? `USD ${(n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M` : `USD ${Math.round(n / 1000)}k`;
  const sup = (m2) => !m2 ? '' : m2 < 10000 ? `${fmt(m2)} m²` : `${(m2 / 10000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} ha`;
  const entre = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const suave = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const mayus = (s) => (s || '').toLocaleUpperCase('es-CL');

  // ── Paper, ink and screens ──
  const papelLienzo = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); g.fillStyle = AMARILLO; g.fillRect(0, 0, 256, 256);
    const im = g.getImageData(0, 0, 256, 256), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.5; }
    g.putImageData(im, 0, 0);
    g.strokeStyle = '#6b4e00'; g.lineWidth = 0.6;
    for (let i = 0; i < 70; i++) { g.globalAlpha = 0.05 + Math.random() * 0.05; g.beginPath(); const x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); g.lineTo(x + Math.random() * 36 - 18, y + Math.random() * 3 - 1.5); g.stroke(); }
    return c;
  })();
  const tramas = new Map();
  function trama(ctx, tipo, u) {
    const paso = Math.max(3, Math.round(4.2 * u)), k = `${tipo}${paso}`;
    if (!tramas.has(k)) {
      const c = document.createElement('canvas'); c.width = c.height = paso;
      const g = c.getContext('2d'); g.fillStyle = TINTA;
      if (tipo === 'rayas') { g.globalAlpha = 0.42; g.fillRect(0, 0, paso, Math.max(1, paso * 0.22)); }
      else { g.globalAlpha = 0.5; g.beginPath(); g.arc(paso / 2, paso / 2, paso * 0.2, 0, Math.PI * 2); g.fill(); }
      tramas.set(k, c);
    }
    return ctx.createPattern(tramas.get(k), 'repeat');
  }
  const papel = (ctx) => ctx.createPattern(papelLienzo, 'repeat');

  // ── Satellite, printed: Sentinel-2 cloudless 2016 (EOX, CC BY 4.0) in grey, multiplied into the yellow paper ──
  const SAT_KM = 260, TESELAS = new Map();
  function teselas(w, h, cy, lng, lat, km) {
    const mpp = km * 1000 / w, base = 156543.03 * Math.cos(lat * Math.PI / 180);
    const z = Math.max(4, Math.min(14, Math.round(Math.log2(base / mpp))));
    const f = (base / 2 ** z) / mpp, n = 2 ** z;
    const cx = (lng + 180) / 360 * 256 * n;
    const r = lat * Math.PI / 180, my = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * n;
    const out = [];
    for (let tx = Math.floor((cx - w / 2 / f) / 256); tx <= Math.floor((cx + w / 2 / f) / 256); tx++)
      for (let ty = Math.floor((my - cy / f) / 256); ty <= Math.floor((my + (h - cy) / f) / 256); ty++)
        out.push({ z, tx, ty, x: w / 2 + (tx * 256 - cx) * f, y: cy + (ty * 256 - my) * f, lado: 256 * f });
    return out;
  }
  function tesela(t) {
    const k = `${t.z}/${t.ty}/${t.tx}`;
    if (!TESELAS.has(k)) { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${k}.jpg`; TESELAS.set(k, im); }
    return TESELAS.get(k);
  }
  function satelite(ctx, w, h, cy, lng, lat, km, a) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'multiply';
    ctx.filter = 'grayscale(1) brightness(1.85) contrast(1.05)';
    for (const t of teselas(w, h, cy, lng, lat, km)) { const im = tesela(t); if (im.complete && im.naturalWidth) ctx.drawImage(im, t.x, t.y, t.lado + 0.5, t.lado + 0.5); }
    ctx.restore();
  }

  // ── The directory columns: the real listings inside this page's map ──
  function listados(lng, lat, km, w, h) {
    if (!indice.length) return [];
    let L;
    if (km > 3500) L = indice;
    else {
      const dLat = km * (h / w) / 2 / 111, dLng = km / 2 / (111 * Math.cos(lat * Math.PI / 180));
      L = indice.filter((x) => Math.abs(x.lat - lat) < dLat && Math.abs(x.lng - lng) < dLng);
    }
    const porComuna = new Map();
    for (const x of L) { const c = porComuna.get(x.comuna); if (!c || x.usd < c.usd) porComuna.set(x.comuna, { comuna: x.comuna, usd: x.usd, n: (c?.n || 0) + 1 }); else c.n++; }
    return [...porComuna.values()].sort((a, b) => a.comuna.localeCompare(b.comuna, 'es')).slice(0, 10);
  }

  function escala(km) {
    // The ratio if this page were printed 6.5 cm wide.
    const r = km * 1e5 / 6.5, p = 10 ** Math.floor(Math.log10(r));
    return `1:${fmt(Math.round(r / p) * p)}`;
  }

  // ── One page ──
  // o: { lng, lat, km, x (the parcel, or null), guia, cols (directory columns), sat, salto, u, desnudo (no header) }
  function centroY(h, u, o) {
    const cabeza = o.desnudo ? 0 : 40 * u, columnas = o.cols ? 74 * u : 0;
    return o.desnudo ? h / 2 : cabeza + columnas + (h - cabeza - columnas) * 0.42;
  }
  function pagina(ctx, w, h, o) {
    const u = o.u || w / 360;
    const cabeza = o.desnudo ? 0 : 40 * u, columnas = o.cols ? 74 * u : 0;
    const cy = centroY(h, u, o);
    const s = Math.min(w * R_KM / o.km, 4e7);
    const proj = d3.geoOrthographic().translate([w / 2, cy]).scale(s).rotate([-o.lng, -o.lat]).clipExtent([[-20, -20], [w + 20, h + 20]]).precision(0.4);
    const path = d3.geoPath(proj, ctx);
    const cerca = o.km < 900, tierras = cerca ? [argFino, chileFino] : [tierra];
    ctx.save();
    ctx.fillStyle = papel(ctx); ctx.fillRect(0, 0, w, h);
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = trama(ctx, 'rayas', u); ctx.fill();
    ctx.beginPath(); tierras.forEach((f) => path(f)); ctx.fillStyle = papel(ctx); ctx.fill();
    ctx.beginPath(); path(cerca ? chileFino : chile); ctx.fillStyle = trama(ctx, 'puntos', u); ctx.fill();
    if (o.km > 1500) { ctx.beginPath(); path(reticula); ctx.setLineDash([2 * u, 3 * u]); ctx.strokeStyle = 'rgba(22,21,18,.35)'; ctx.lineWidth = 0.8 * u; ctx.stroke(); ctx.setLineDash([]); }
    if (o.sat && o.km < SAT_KM) satelite(ctx, w, h, cy, o.lng, o.lat, o.km, 1 - entre(o.km, SAT_KM * 0.35, SAT_KM));
    ctx.lineJoin = 'round'; ctx.strokeStyle = TINTA;
    ctx.beginPath(); tierras.forEach((f) => path(f)); ctx.lineWidth = 1.3 * u; ctx.stroke();
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.lineWidth = 2 * u; ctx.stroke();
    if (o.km > 4000 && !o.desnudo) {
      ctx.font = `500 ${10 * u}px "Archivo Narrow", sans-serif`; ctx.fillStyle = TINTA; ctx.textAlign = 'center';
      for (const [lugar, txt] of [[[-90, -30], 'O C É A N O   P A C Í F I C O'], [[-30, -25], 'O C É A N O   A T L Á N T I C O']]) {
        const p = proj(lugar); if (p && d3.geoDistance(lugar, [o.lng, o.lat]) < 1.4) ctx.fillText(txt, p[0], p[1]);
      }
    }
    if (o.x) marcar(ctx, proj, s, u, w, h, o);
    if (!o.desnudo) encabezado(ctx, w, h, u, o, cabeza, columnas);
    ctx.restore();
    return proj;
  }

  function marcar(ctx, proj, s, u, w, h, o) {
    const x = o.x, p = proj([x.lng, x.lat]);
    if (!p) return;
    if (x.aprox && o.km < 400) {
      // We only know the comuna: a ring around it, not a pin on a spot we don't know.
      const rad = Math.max(10 * u, 8 * s / R_KM);
      ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(22,21,18,.12)'; ctx.fill();
      ctx.lineWidth = 4 * u; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
      ctx.setLineDash([6 * u, 5 * u]); ctx.lineWidth = 2.2 * u; ctx.strokeStyle = TINTA; ctx.stroke(); ctx.setLineDash([]);
    }
    const py = p[1] - (o.salto || 0);
    ctx.beginPath(); ctx.arc(p[0], py - 14 * u, 9 * u, Math.PI * 0.85, Math.PI * 0.15); ctx.lineTo(p[0], py); ctx.closePath();
    ctx.fillStyle = TINTA; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * u; ctx.stroke();
    ctx.beginPath(); ctx.arc(p[0], py - 14 * u, 3.6 * u, 0, Math.PI * 2); ctx.fillStyle = AMARILLO; ctx.fill();
    if (o.km < 400) {
      // The comuna as a directory tab next to the pin.
      const txt = mayus(x.sector || x.comuna);
      ctx.font = `700 ${12 * u}px "Archivo Narrow", sans-serif`;
      const tw = ctx.measureText(txt).width, bx = p[0] + 14 * u, by = py - 24 * u;
      ctx.fillStyle = TINTA; ctx.fillRect(bx, by, tw + 10 * u, 17 * u);
      ctx.fillStyle = AMARILLO; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 5 * u, by + 9 * u);
      ctx.textBaseline = 'alphabetic';
      const kmBarra = o.km > 120 ? 20 : o.km > 30 ? 5 : 1, px = kmBarra * s / R_KM, bx2 = w - 16 * u - px, by2 = h * 0.62;
      ctx.fillStyle = TINTA; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.fillRect(bx2, by2, px, 3 * u); ctx.strokeRect(bx2, by2, px, 3 * u);
      ctx.font = `700 ${10 * u}px "Archivo Narrow", sans-serif`; ctx.textAlign = 'right'; ctx.fillText(`${kmBarra} KM`, w - 16 * u, by2 - 4 * u);
    }
  }

  function encabezado(ctx, w, h, u, o, cabeza, columnas) {
    const m = 14 * u;
    ctx.fillStyle = papel(ctx); ctx.fillRect(0, 0, w, cabeza + columnas);
    ctx.fillStyle = TINTA; ctx.fillRect(m, 8 * u, w - 2 * m, 3 * u);
    ctx.font = `700 ${20 * u}px "Archivo Narrow", sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(mayus(o.guia), m, 31 * u);
    ctx.font = `500 ${10 * u}px "Archivo Narrow", sans-serif`; ctx.textAlign = 'right';
    ctx.fillText(`ESCALA ${escala(o.km)}`, w - m, 30 * u);
    ctx.fillRect(m, cabeza - 3 * u, w - 2 * m, 1 * u);
    if (!columnas) return;
    const L = listados(o.lng, o.lat, o.km, w, h);
    const colW = (w - 2 * m - 10 * u) / 2, lh = 13 * u;
    ctx.font = `500 ${10 * u}px "Archivo Narrow", sans-serif`;
    L.forEach((x, i) => {
      const col = i < 5 ? 0 : 1, fila = i % 5;
      const x0 = m + col * (colW + 10 * u), y = cabeza + 10 * u + fila * lh;
      const der = `${x.n > 1 ? 'desde ' : ''}${usdCorto(x.usd)}`, izq = x.comuna;
      ctx.textAlign = 'left'; ctx.fillStyle = TINTA; ctx.fillText(izq, x0, y);
      ctx.textAlign = 'right'; ctx.fillText(der, x0 + colW, y);
      const a = x0 + ctx.measureText(izq).width + 3 * u, b = x0 + colW - ctx.measureText(der).width - 3 * u;
      ctx.globalAlpha = 0.6; for (let d = a; d < b; d += 3 * u) ctx.fillRect(d, y - 1 * u, 1 * u, 1 * u); ctx.globalAlpha = 1;
    });
    ctx.fillRect(m + colW + 4.5 * u, cabeza + 2 * u, 0.8 * u, columnas - 8 * u);
    ctx.fillRect(m, cabeza + columnas - 3 * u, w - 2 * m, 1 * u);
  }

  function lienzo(c) {
    const r = devicePixelRatio || 1, b = c.getBoundingClientRect();
    c.width = Math.round(b.width * r); c.height = Math.round(b.height * r);
    return c.getContext('2d');
  }

  // ── Profile, highlights, grid ──
  const chico = (c, lng, lat, km) => pagina(c.getContext('2d'), c.width, c.height, { lng, lat, km, desnudo: true, u: c.width / 120 });
  chico(document.getElementById('pfp'), -71, -30, 16000);
  chico(document.getElementById('pfp2'), -71, -30, 16000);
  const dest = document.getElementById('destacadas');
  [['Norte', -70, -24], ['Centro', -71.5, -34], ['Sur', -72.6, -39.5], ['Chiloé', -73.8, -42.5], ['Patagonia', -73, -47.5]].forEach(([n, lng, lat]) => {
    const d = document.createElement('div'), c = document.createElement('canvas'); c.width = c.height = 120;
    d.append(c, n); dest.append(d); chico(c, lng, lat, 2600);
  });
  const grilla = document.getElementById('grilla');
  document.getElementById('n-pub').textContent = R.length;
  R.forEach((x, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cuadro';
    b.setAttribute('aria-label', `Reel: ${x.titulo}, ${x.comuna}`);
    b.innerHTML = `<canvas></canvas><svg class="pl" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><span class="px"><b>${x.usd ? usdCorto(x.usd) : 'CON EL DUEÑO'}</b><span>${x.comuna}${x.m2 ? ' · ' + sup(x.m2) : ''}</span></span>`;
    grilla.append(b);
    b.addEventListener('click', () => abrir(i));
  });
  function pintarGrilla() {
    grilla.querySelectorAll('canvas').forEach((c, i) => {
      const ctx = lienzo(c);
      pagina(ctx, c.width, c.height, { lng: R[i].lng, lat: R[i].lat, km: 2200, x: R[i], guia: R[i].region, u: c.width / 150 });
    });
  }
  requestAnimationFrame(pintarGrilla);
  addEventListener('resize', () => { clearTimeout(pintarGrilla.t); pintarGrilla.t = setTimeout(pintarGrilla, 200); });
  document.getElementById('datos').textContent =
    `Dólar ${datos.usd_clp.toLocaleString('es-CL')} y UF ${datos.uf_clp.toLocaleString('es-CL')} pesos al ${datos.fecha.split('-').reverse().join('-')}. Los precios se redondean al millar de dólares.`;

  // ── The reel: the pages riffle until the parcel ──
  const DUR = 11000, VUELO = 7600, N = 15;

  // The pages of one reel: each one closer, from the whole Earth to the parcel. The globe reaches Chile in the first half.
  function armar(x, w, h) {
    const u = w / 360, kmIni = 24000, kmFin = x.aprox ? 60 : 7;
    const giro = d3.geoInterpolate([x.lng + 75, 12], [x.lng, x.lat]);
    const P = Array.from({ length: N }, (_, j) => {
      const [lng, lat] = giro(suave(Math.min(1, j / ((N - 1) * 0.55))));
      const km = kmIni * Math.pow(kmFin / kmIni, j / (N - 1));
      const guia = j < N * 0.3 ? 'Chile' : j < N * 0.72 ? x.region : (x.sector || x.comuna);
      return { lng, lat, km, guia, x: j >= N * 0.45 ? x : null, cols: true, sat: true, u };
    });
    const hoja = document.createElement('canvas'), debajo = document.createElement('canvas');
    hoja.width = debajo.width = w; hoja.height = debajo.height = h;
    return { x, w, h, u, P, hoja, debajo, debajoDe: -1 };
  }
  // Every satellite tile the reel will print, so a video never has a blank page.
  function teselasDe(st) {
    const out = [];
    st.P.forEach((p, j) => {
      const sig = st.P[Math.min(N - 1, j + 1)];
      for (const km of [p.km, p.km * Math.pow(sig.km / p.km, 0.2)]) if (km < SAT_KM) out.push(...teselas(st.w, st.h, centroY(st.h, st.u, p), p.lng, p.lat, km));
    });
    return out;
  }
  // One frame at `e` ms: the page underneath waits (drawn once), the current one turns over its left edge.
  function dibujarReel(ctx, st, e) {
    const { w, h, u, P } = st;
    const pos = (N - 1) * suave(entre(e, 400, VUELO));
    const i = Math.min(N - 1, Math.floor(pos)), f = pos - i;
    if (i >= N - 1) {
      const salto = Math.max(0, Math.sin(Math.min(1, (e - VUELO) / 450) * Math.PI)) * 14 * u;
      pagina(ctx, w, h, { ...P[N - 1], salto });
      return;
    }
    if (st.debajoDe !== i + 1) { pagina(st.debajo.getContext('2d'), w, h, P[i + 1]); st.debajoDe = i + 1; }
    const g = suave(entre(f, 0.2, 1)), a = P[i], b = P[i + 1];
    pagina(st.hoja.getContext('2d'), w, h, { ...a, km: a.km * Math.pow(b.km / a.km, 0.2 * f) });
    ctx.drawImage(st.debajo, 0, 0);
    const ancho = w * Math.cos(g * Math.PI / 2);
    if (ancho > 1) {
      const sombra = ctx.createLinearGradient(ancho, 0, ancho + 46 * u, 0);
      sombra.addColorStop(0, `rgba(0,0,0,${0.32 * (1 - g)})`); sombra.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sombra; ctx.fillRect(ancho, 0, 46 * u, h);
      ctx.save();
      ctx.setTransform(ancho / w, -0.06 * Math.sin(g * Math.PI), 0, 1, 0, 0);
      ctx.drawImage(st.hoja, 0, 0);
      ctx.fillStyle = `rgba(0,0,0,${0.4 * g})`; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    // The edges of the pages still to come, on the right.
    ctx.fillStyle = 'rgba(22,21,18,.35)';
    for (let k = 1; k <= Math.min(5, N - 1 - i); k++) ctx.fillRect(w - k * 2 * u, 0, 0.6 * u, h);
  }

  const visor = document.getElementById('visor'), cv = document.getElementById('lienzo');
  const tarjeta = document.getElementById('tarjeta'), barra = document.getElementById('barra'), fotofin = document.getElementById('fotofin');
  const audio = document.getElementById('audio'), musica = document.getElementById('musica'), sonido = document.getElementById('sonido');
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let actual = 0, raf = 0, mudo = false;

  function sonar(m) {
    audio.pause();
    if (!m) return;
    audio.src = m.preview; audio.volume = 0; audio.muted = mudo;
    audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = m.desde || 0; } catch (e) {} }, { once: true });
    audio.play().catch(() => {});
    const t0 = performance.now();
    (function subir() { const a = Math.min(1, (performance.now() - t0) / 1200); audio.volume = 0.85 * a; if (a < 1 && !visor.hidden) requestAnimationFrame(subir); })();
  }
  const cancion = (m) => m.cancion.replace(/\s*\(.*\)$/, '');
  // "La Trenza · La Trenza (2017)" → "La Trenza (2017)" when the song is the album's title track.
  const disco = (m) => cancion(m).toLowerCase() === m.album.toLowerCase() ? `${m.album} (${m.anio})` : `${cancion(m)} · ${m.album} (${m.anio})`;

  function abrir(i) {
    actual = (i + R.length) % R.length;
    const x = R[actual], m = x.musica;
    visor.hidden = false;
    tarjeta.className = 'tarjeta'; fotofin.className = 'fotofin'; fotofin.removeAttribute('src');
    if (x.foto) fotofin.src = x.foto;
    musica.innerHTML = m ? `♪ <b>${m.artista}</b> · ${cancion(m)} · <i>${m.album}</i> (${m.anio}) <a href="${m.link}" target="_blank" rel="noopener">Apple Music ↗</a>` : '';
    sonar(m);
    tarjeta.innerHTML = `<div class="aviso-cab">PARCELA · ${mayus(x.comuna)}</div>` + (x.propia
      ? `<div class="usd">Precio directo<small>con ${x.fuente}</small></div>
         <div class="que">${sup(x.m2)} · ${x.sector}, ${x.comuna}</div>
         <div class="quien">Vista a los volcanes · crédito directo, sin banco</div>
         <div class="acciones"><a class="si" href="${x.url}" target="_blank" rel="noopener">Ver la parcela ↗</a></div>`
      : `<div class="usd">${usdCorto(x.usd)}<small>${x.moneda === 'UF' ? 'UF ' + fmt(x.monto) : '$' + fmt(x.monto)}</small></div>
         <div class="que">${[sup(x.m2), x.comuna + ', ' + x.region].filter(Boolean).join(' · ')}</div>
         <div class="quien">La publica ${x.fuente}${x.aprox ? ' · ubicación de la comuna' : ''}</div>
         <div class="acciones"><a class="si" href="${x.url}" target="_blank" rel="noopener">Ver la publicación ↗</a><a href="/" target="_blank">Todas las parcelas</a></div>`);
    const ctx = lienzo(cv), st = armar(x, cv.width, cv.height);
    teselasDe(st).forEach(tesela);
    cancelAnimationFrame(raf);
    const t0 = performance.now();
    function cuadro(ahora) {
      const e = quieto ? DUR : Math.min(DUR, ahora - t0);
      dibujarReel(ctx, st, e);
      barra.style.width = `${(e / DUR) * 100}%`;
      if (e >= VUELO + 300) { tarjeta.classList.add('on'); if (x.foto && e >= VUELO + 1200) fotofin.classList.add('on'); }
      if (e >= DUR - 1200) audio.volume = Math.max(0, 0.85 * (DUR - e) / 1200);
      if (e < DUR) raf = requestAnimationFrame(cuadro);
      else audio.pause();
    }
    raf = requestAnimationFrame(cuadro);
  }

  function cerrar() { cancelAnimationFrame(raf); audio.pause(); visor.hidden = true; }
  document.getElementById('cerrar').addEventListener('click', cerrar);
  document.getElementById('otra').addEventListener('click', () => abrir(actual));
  document.getElementById('sig').addEventListener('click', () => abrir(actual + 1));
  document.getElementById('ant').addEventListener('click', () => abrir(actual - 1));
  sonido.addEventListener('click', () => { mudo = !mudo; audio.muted = mudo; sonido.textContent = mudo ? '🔇' : '🔊'; sonido.setAttribute('aria-label', mudo ? 'Activar sonido' : 'Silenciar'); });
  visor.addEventListener('click', (e) => { if (e.target === visor) cerrar(); });
  addEventListener('keydown', (e) => {
    if (visor.hidden) return;
    if (e.key === 'Escape') cerrar();
    if (e.key === 'ArrowRight') abrir(actual + 1);
    if (e.key === 'ArrowLeft') abrir(actual - 1);
  });

  // ── Video: the same reel, frame by frame, with everything drawn on the canvas (tools/../render_reels.py) ──
  // It opens on the place, the song and @parcelasyterrenos (that first frame is the cover), the pages riffle, and it
  // closes on the listing as a directory ad.
  const INTRO = 2600, HANDLE = '@parcelasyterrenos';
  function ajustar(ctx, txt, peso, max, ancho, familia = '"Archivo Narrow", sans-serif') {
    let t = max; ctx.font = `${peso} ${t}px ${familia}`;
    while (ctx.measureText(txt).width > ancho && t > 8) { t -= 2; ctx.font = `${peso} ${t}px ${familia}`; }
    return t;
  }
  function portada(ctx, st, a) {
    const { x, w, h, u } = st, m = x.musica, mg = 22 * u, y0 = h * 0.29, alto = h * 0.42;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = TINTA; ctx.fillRect(0, y0, w, alto);
    ctx.fillStyle = AMARILLO; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `500 ${13 * u}px "Archivo Narrow", sans-serif`;
    ctx.fillText(x.propia ? 'UNA PARCELA EN' : 'UNA PARCELA EN VENTA EN', mg, y0 + 32 * u);
    const lugar = mayus(x.sector || x.comuna);
    const t = ajustar(ctx, lugar, 700, 64 * u, w - 2 * mg);
    ctx.fillText(lugar, mg, y0 + 32 * u + t * 0.95);
    let y = y0 + 32 * u + t * 0.95 + 26 * u;
    ctx.font = `500 ${17 * u}px "Archivo Narrow", sans-serif`;
    ctx.fillText(mayus(`${x.sector ? x.comuna + ' · ' : ''}${x.region} · Chile`), mg, y);
    y += 22 * u; ctx.fillRect(mg, y, w - 2 * mg, 1.2 * u);
    if (m) {
      y += 30 * u; ctx.font = `700 ${17 * u}px "Archivo Narrow", sans-serif`;
      ctx.fillText(`♪  ${mayus(m.artista)}`, mg, y);
      y += 22 * u; ctx.font = `500 ${15 * u}px "Archivo Narrow", sans-serif`;
      ajustar(ctx, disco(m), 500, 15 * u, w - 2 * mg);
      ctx.fillText(disco(m), mg, y);
      y += 18 * u; ctx.fillRect(mg, y, w - 2 * mg, 1.2 * u);
    }
    ctx.font = `700 ${26 * u}px "Archivo Narrow", sans-serif`;
    ctx.fillText(HANDLE, mg, y0 + alto - 22 * u);
    ctx.restore();
  }
  function tira(ctx, st, a) {
    const { x, w, h, u } = st, m = x.musica, mg = 14 * u;
    ctx.save(); ctx.globalAlpha = a;
    const l1 = HANDLE, l2 = m ? `♪ ${m.artista} · ${cancion(m)} (${m.anio})` : '';
    ctx.font = `700 ${15 * u}px "Archivo Narrow", sans-serif`;
    const a1 = ctx.measureText(l1).width;
    ctx.font = `500 ${12 * u}px "Archivo Narrow", sans-serif`;
    const a2 = Math.min(w - 2 * mg - 16 * u, ctx.measureText(l2).width);
    const bw = Math.max(a1, a2) + 16 * u, by = h - 70 * u;
    ctx.fillStyle = 'rgba(246,207,58,.92)'; ctx.fillRect(mg, by, bw, 46 * u);
    ctx.strokeStyle = TINTA; ctx.lineWidth = 1.5 * u; ctx.strokeRect(mg, by, bw, 46 * u);
    ctx.fillStyle = TINTA; ctx.textAlign = 'left';
    ctx.font = `700 ${15 * u}px "Archivo Narrow", sans-serif`; ctx.fillText(l1, mg + 8 * u, by + 19 * u);
    ctx.font = `500 ${12 * u}px "Archivo Narrow", sans-serif`; ctx.fillText(l2, mg + 8 * u, by + 36 * u, w - 2 * mg - 16 * u);
    ctx.restore();
  }
  function fotoFinal(ctx, st, a) {
    if (!st.foto || a <= 0) return;
    const { w, h } = st, im = st.foto, k = Math.max(w / im.naturalWidth, h / im.naturalHeight);
    ctx.save(); ctx.globalAlpha = a;
    ctx.drawImage(im, (w - im.naturalWidth * k) / 2, (h - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
    ctx.restore();
  }
  function aviso(ctx, st, k) {
    const { x, w, h, u } = st, mg = 14 * u, bw = w - 2 * mg, bh = 196 * u, bx = mg, by = h - 28 * u - bh + (1 - k) * 60 * u;
    ctx.save(); ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(22,21,18,.35)'; ctx.fillRect(bx + 5 * u, by + 5 * u, bw, bh);
    ctx.fillStyle = papel(ctx); ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = TINTA; ctx.lineWidth = 3 * u; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = TINTA; ctx.fillRect(bx, by, bw, 30 * u);
    ctx.fillStyle = AMARILLO; ctx.textAlign = 'left'; ctx.font = `700 ${14 * u}px "Archivo Narrow", sans-serif`;
    ctx.fillText(`PARCELA · ${mayus(x.comuna)}`, bx + 14 * u, by + 20 * u);
    ctx.fillStyle = TINTA;
    const p = bx + 14 * u, ancho = bw - 28 * u;
    if (x.propia) {
      ctx.font = `700 ${34 * u}px "Archivo Narrow", sans-serif`; ctx.fillText('Precio directo', p, by + 72 * u);
      ctx.font = `500 ${16 * u}px "Archivo Narrow", sans-serif`; ctx.fillText(`con ${x.fuente} · crédito directo, sin banco`, p, by + 96 * u, ancho);
      ctx.font = `700 ${17 * u}px "Archivo Narrow", sans-serif`; ctx.fillText(`${sup(x.m2)} · ${x.sector}, ${x.comuna}`, p, by + 122 * u, ancho);
      ctx.font = `500 ${14 * u}px "Archivo Narrow", sans-serif`; ctx.fillText('Vista a los volcanes · bosque nativo', p, by + 142 * u, ancho);
    } else {
      const precio = usdCorto(x.usd);
      ctx.font = `700 ${48 * u}px "Archivo Narrow", sans-serif`; ctx.fillText(precio, p, by + 80 * u);
      const pw = ctx.measureText(precio).width;
      ctx.font = `500 ${16 * u}px "Archivo Narrow", sans-serif`;
      ctx.fillText(x.moneda === 'UF' ? `UF ${fmt(x.monto)}` : `$${fmt(x.monto)}`, p + pw + 10 * u, by + 80 * u);
      ctx.font = `700 ${17 * u}px "Archivo Narrow", sans-serif`;
      ctx.fillText([sup(x.m2), `${x.comuna}, ${x.region}`].filter(Boolean).join(' · '), p, by + 108 * u, ancho);
      ctx.font = `500 ${14 * u}px "Archivo Narrow", sans-serif`;
      ctx.fillText(`La publica ${x.fuente}${x.aprox ? ' · ubicación de la comuna' : ''}`, p, by + 130 * u, ancho);
    }
    ctx.fillStyle = TINTA; ctx.fillRect(p, by + bh - 46 * u, ancho, 32 * u);
    ctx.fillStyle = AMARILLO; ctx.font = `700 ${15 * u}px "Archivo Narrow", sans-serif`;
    ctx.fillText('PARCELASYTERRENOS.CL', p + 12 * u, by + bh - 25 * u);
    ctx.textAlign = 'right'; ctx.font = `500 ${14 * u}px "Archivo Narrow", sans-serif`;
    ctx.fillText(HANDLE, p + ancho - 12 * u, by + bh - 25 * u);
    ctx.restore();
  }
  function dibujarVideo(st, ms) {
    const ctx = st.ctx, e = Math.max(0, ms - INTRO);
    dibujarReel(ctx, st, e);
    const aIntro = 1 - entre(ms, INTRO - 400, INTRO + 300);
    if (aIntro > 0) portada(ctx, st, aIntro);
    const aTira = entre(ms, INTRO, INTRO + 500) * (1 - entre(e, VUELO, VUELO + 400));
    if (aTira > 0) tira(ctx, st, aTira);
    if (e >= VUELO + 200) {
      fotoFinal(ctx, st, entre(e, VUELO + 1000, VUELO + 2200));
      aviso(ctx, st, suave(entre(e, VUELO + 200, VUELO + 800)));
    }
  }
  const cargarImg = (src) => new Promise((ok) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
  let vst = null;
  window.video = {
    listo: indiceListo.then(() => R.map((x) => x.id)),
    async preparar(i, w, h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      vst = armar(R[i], w, h); vst.ctx = c.getContext('2d'); vst.c = c;
      const ts = teselasDe(vst).map(tesela);
      await Promise.race([Promise.all(ts.map((im) => im.complete ? 0 : new Promise((ok) => { im.addEventListener('load', ok, { once: true }); im.addEventListener('error', ok, { once: true }); }))), new Promise((ok) => setTimeout(ok, 30000))]);
      if (R[i].foto) vst.foto = await cargarImg(R[i].foto);
      return { total: INTRO + DUR, id: R[i].id, comuna: R[i].comuna, teselas: ts.length, faltan: ts.filter((im) => !im.naturalWidth).length };
    },
    cuadro(ms) { dibujarVideo(vst, ms); return vst.c.toDataURL('image/jpeg', 0.9); },
  };
})();
