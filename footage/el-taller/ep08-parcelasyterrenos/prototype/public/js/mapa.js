// The home: a cartoon Chile you scroll from Arica to Magallanes, one price tag per parcel (or per cluster when they
// overlap), the quick filters on top and the full ones in a modal. Tap a cluster → the map flies in until it splits;
// parcels sharing one spot fan out around it; the list (a column on the desktop) shows what's on screen. Each listing
// opens where it's published (its source's logo on it). The billboards along the Ruta 5 are the ad slots: the business.
// Uses the globals of app.js ($, $$, esc, pesos, P, SITIO, FUENTES, abrirHoja). Map shape: /data/chile.json (+ the
// detailed coast, /data/chile-fino.json, loaded the first time someone zooms in).
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const ZMAX = 24;                                            // 24× Chile ≈ 15 px per km: a loteo's parcels split
  const REGION_LAT = { 'Arica y Parinacota': -18.5, 'Tarapacá': -20.2, 'Antofagasta': -23.6, 'Atacama': -27.4, 'Coquimbo': -29.9,
    'Valparaíso': -33.0, 'Metropolitana': -33.45, "O'Higgins": -34.2, 'Maule': -35.4, 'Ñuble': -36.6, 'Biobío': -37.3,
    'La Araucanía': -38.7, 'Los Ríos': -39.8, 'Los Lagos': -41.5, 'Aysén': -45.6, 'Magallanes': -53.1 };
  // The Andes: roughly where the border runs (lat → lon), for the little mountains.
  const CORDILLERA = [[-18.4, -69.3], [-21, -68.4], [-23, -67.6], [-25, -68.6], [-27, -68.9], [-29, -69.9], [-31, -70.2], [-33, -70.1],
    [-35, -70.4], [-37, -71.0], [-39, -71.4], [-41, -71.9], [-43, -71.9], [-45, -71.8], [-47, -72.5], [-49, -73.1], [-51, -72.6]];
  const DIBUJOS = [['🦙', -19.6, -69.3], ['🌵', -26.2, -70.0], ['🍇', -34.9, -71.3], ['🌋', -41.1, -72.4], ['🐋', -43.4, -75.3], ['🐧', -53.6, -70.9]];
  // The Ruta 5, Arica → Quellón (the main towns it goes through; a cartoon, not a road map).
  const RUTA5 = [[-18.48, -70.31], [-19.16, -70.17], [-19.99, -69.77], [-20.26, -69.79], [-21.65, -69.55], [-22.4, -69.62], [-23.33, -69.85],
    [-23.75, -70.31], [-24.5, -70.05], [-25.39, -69.96], [-26.35, -70.62], [-27.07, -70.82], [-27.37, -70.33], [-28.57, -70.76],
    [-29.9, -71.25], [-30.6, -71.45], [-31.2, -71.6], [-31.91, -71.51], [-32.45, -71.25], [-32.84, -70.96], [-33.45, -70.67],
    [-34.17, -70.74], [-34.58, -70.99], [-34.98, -71.24], [-35.43, -71.65], [-35.85, -71.6], [-36.61, -72.1], [-37.47, -72.35],
    [-38.74, -72.6], [-39.37, -72.63], [-40.07, -72.87], [-40.57, -73.13], [-41.47, -72.94], [-41.79, -73.43], [-41.87, -73.8],
    [-42.48, -73.76], [-42.62, -73.77], [-43.12, -73.62]];
  // Where the road is at a latitude.
  function enRuta(lat) {
    const i = RUTA5.findIndex(([la]) => la <= lat);
    if (i <= 0) return RUTA5[Math.max(0, i)][1];
    const [a, b] = [RUTA5[i - 1], RUTA5[i]];
    return a[1] + ((lat - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  // The billboards by the road (JP, 2026-11-16: "like the ones we have on the ruta 5"): the first sitio.cupos_auspicio
  // are sold, the last one is free for NGOs. Which sponsor stands where is decided by the Worker on every visit
  // (ordenarCarteles in src/pagos.js): they take turns.
  // Where each one starts; on every render it slides along the road to the stretch with the fewest price tags (dondeCartel).
  // The NGOs' one stands past the end of the road, south of Quellón.
  const CARTELES = [-21.9, -26.0, -31.9, -36.1, -39.0, -45.3];
  // A billboard by the road near `lat`, where its face covers the fewest tags (they're the content; it's the ad).
  // Face + legs ≈ ancho × alto px, the legs at its right end; a tag ≈ 100 × 46 px above its point.
  function dondeCartel(lat, k, puestos) {
    const ancho = escritorio() ? 184 : 150, alto = escritorio() ? 96 : 82;
    let mejor = null;
    for (let d = 0; d <= 2.2; d += 0.1) {
      for (const l of d ? [lat - d, lat + d] : [lat]) {
        const [rx, ry] = aPx({ lat: l, lng: enRuta(l) }, k);
        let tapa = 0;
        for (const g of GRUPOS) {
          const w = Math.min(rx + 0.06 * ancho, g.px + 50) - Math.max(rx - 0.94 * ancho, g.px - 50);
          const h = Math.min(ry, g.py) - Math.max(ry - alto, g.py - 46);
          if (w > 0 && h > 0) tapa += w * h;
        }
        for (const [ox, oy] of puestos) {                       // and never on top of another billboard
          const w = ancho - Math.abs(rx - ox), h = alto - Math.abs(ry - oy);
          if (w > 0 && h > 0) tapa += 10 * w * h;
        }
        if (!mejor || tapa < mejor.tapa - 200) mejor = { tapa, rx, ry };
      }
      if (mejor.tapa === 0) break;
    }
    puestos.push([mejor.rx, mejor.ry]);
    return [mejor.rx, mejor.ry];
  }

  let G = null, todos = [], vista = [], zf = 1, f = { tam: '', max: '', conprecio: false, region: '', q: '', fuentes: new Set() };
  let lugar = null;                                          // the items the person tapped (null = what's on screen)
  let OCUPADOS = [];                                         // billboard 1…6 in this visit's order: {cupo, empresa (its domain), url, img} · null (free) · {ong}
  // A sponsor's clicks, counted per month (the input for ordering the billboards someday): clic:<mes>:auspicio-<dominio>.
  const clicDe = (a) => `auspicio-${String(a.empresa).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 64);
  let GRUPOS = [], COMUNAS = [], DECO = [], abanico = null, ultimaLista = '';

  const sin = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const proy = (lat, lng) => [(lng - G.proy.lon_left) * G.proy.k * G.proy.cos, (G.proy.lat_top - lat) * G.proy.k];
  const VB = { x0: 0, x1: 0 };
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  const corto = (x) => (x.monto ? (x.moneda === 'UF' ? `UF ${Math.round(x.monto).toLocaleString('es-CL')}`
    : x.monto >= 1e6 ? `$${(x.monto / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M` : pesos(x.monto)) : '');
  const largo = (x) => (x.monto ? (x.moneda === 'UF' ? `UF ${x.monto.toLocaleString('es-CL', { maximumFractionDigits: 2 })}` : pesos(x.monto)) : '');
  const sup = (m) => (!m ? '' : m >= 10000 ? `${(m / 10000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} ha` : `${m.toLocaleString('es-CL')} m²`);
  const SC = () => $('#mapa-scroll'), LZ = () => $('#lienzo');
  const escritorio = () => matchMedia('(min-width: 900px)').matches;

  // Own listings and indexed ones in one shape.
  function unificar(j) {
    const propias = (j.parcelas || []).filter((p) => p.lat && p.lng).map((p) => ({
      k: `aqui:${p.id}`, f: 'aqui', url: `/parcela/${p.id}`, titulo: p.titulo, region: p.region || '', comuna: p.comuna,
      m2: p.m2, moneda: p.precio ? 'CLP' : '', monto: p.precio || 0, clp: p.precio || 0, lat: p.lat, lng: p.lng,
      vendedor: p.vendedor?.nombre, nota: p.credito ? 'Crédito directo' : '', fecha: '9999',
    }));
    return [...propias, ...(j.indexadas || []).filter((x) => x.lat && x.lng)];
  }

  const TAM = { chica: [1, 5000], media: [5001, 10000], grande: [10001, 1e12] };
  function pasa(x) {
    const [min, max] = TAM[f.tam] || [0, 1e12];
    const palabras = sin(f.q).split(/\s+/).filter((w) => w.length > 2);
    return (!f.tam || (x.m2 >= min && x.m2 <= max)) && (!f.max || (x.clp && x.clp <= Number(f.max)))
      && (!f.conprecio || x.monto) && (!f.region || x.region === f.region) && (!f.fuentes.size || f.fuentes.has(x.f))
      && (!palabras.length || palabras.every((w) => sin(`${x.titulo} ${x.comuna} ${x.region}`).includes(w)));
  }
  const orden = (a, b) => ((b.f === 'aqui') - (a.f === 'aqui')) || String(b.fecha).localeCompare(String(a.fecha));

  // ── The drawing ───────────────────────────────────────────────────────────

  function el(tag, attrs, padre) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (padre) padre.appendChild(e);
    return e;
  }
  // A decoration (mountain, llama, label) that keeps its size on screen when the map zooms in.
  function deco(lat, lng, padre) {
    const [x, y] = proy(lat, lng);
    const g = el('g', { transform: `translate(${x} ${y})` }, padre);
    const s = el('g', {}, g);
    DECO.push(s);
    return s;
  }

  function dibujar() {
    const svg = $('#mapa');
    VB.x0 = proy(0, -76.7)[0]; VB.x1 = proy(0, -65.3)[0];
    svg.setAttribute('viewBox', `${VB.x0} 0 ${VB.x1 - VB.x0} ${G.h}`);
    svg.innerHTML = `<defs>
      <linearGradient id="tierra" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f1c869"/><stop offset=".17" stop-color="#ebc77a"/><stop offset=".3" stop-color="#c9cf7a"/>
        <stop offset=".42" stop-color="#9fcd7d"/><stop offset=".58" stop-color="#6fb26c"/><stop offset=".74" stop-color="#7cb89c"/>
        <stop offset=".88" stop-color="#bcdcd8"/><stop offset="1" stop-color="#eef6f5"/></linearGradient>
      <pattern id="olas" width="90" height="60" patternUnits="userSpaceOnUse"></pattern>
    </defs>`;
    el('rect', { x: VB.x0, y: 0, width: VB.x1 - VB.x0, height: G.h, fill: '#cdeaf3' }, svg);
    el('rect', { x: VB.x0, y: 0, width: VB.x1 - VB.x0, height: G.h, fill: 'url(#olas)' }, svg);
    const vec = el('g', { id: 'vecinos' }, svg);
    for (const d of Object.values(G.vecinos)) el('path', { d, fill: '#f5eedf', stroke: '#dccfaf', 'stroke-width': 2.6, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }, vec);
    el('path', { id: 'sombra', d: G.chile, fill: '#1d3528', opacity: '.22', transform: 'translate(10 14)' }, svg);       // the cartoon shadow
    el('path', { id: 'chile', d: G.chile, fill: 'url(#tierra)', stroke: '#1d3528', 'stroke-width': 4.6, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }, svg);
    // The Ruta 5: asphalt with a dashed yellow line, and its shield here and there.
    const ruta = el('g', { id: 'ruta5' }, svg);
    const d = 'M' + RUTA5.map(([lat, lng]) => proy(lat, lng).map((v) => v.toFixed(1)).join(' ')).join(' L');
    el('path', { d, fill: 'none', stroke: '#1d3528', 'stroke-width': 6, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, ruta);
    el('path', { d, fill: 'none', stroke: '#6d6a64', 'stroke-width': 4, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, ruta);
    el('path', { d, fill: 'none', stroke: '#f6d55c', 'stroke-width': 1.2, 'stroke-dasharray': '5 6', 'vector-effect': 'non-scaling-stroke' }, ruta);
    for (const lat of [-22.9, -28.1, -36.0, -40.4]) {
      const g = deco(lat, enRuta(lat) + 0.42, ruta);
      el('path', { d: 'M-15 -17 H15 V4 Q15 14 0 19 Q-15 14 -15 4 Z', fill: '#fff', stroke: '#1d3528', 'stroke-width': 3.5, 'stroke-linejoin': 'round' }, g);
      el('text', { x: 0, y: 3, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'ruta5-num' }, g).textContent = '5';
    }
    if (G.lagos) el('path', { d: G.lagos, fill: '#a9d8ea', stroke: '#1d3528', 'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }, svg);
    for (const [lat, lng] of CORDILLERA) {                    // little snow-capped mountains along the Andes
      const g = deco(lat, lng + 0.55, svg);
      el('path', { d: 'M-26 14 L0 -22 L26 14 Z', fill: '#8a7a62', stroke: '#1d3528', 'stroke-width': 4, 'stroke-linejoin': 'round' }, g);
      el('path', { d: 'M-9 -9 L0 -22 L9 -9 L4 -6 L0 -10 L-4 -6 Z', fill: '#fff' }, g);
    }
    for (const [e, lat, lng] of DIBUJOS) {
      const t = el('text', { x: 0, y: 0, 'font-size': 44, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, deco(lat, lng, svg));
      t.textContent = e;
    }
    // A little boat sailing up and down the coast.
    const barco = el('text', { x: 0, y: 0, 'font-size': 52, 'text-anchor': 'middle', class: 'barco' }, deco(-32.6, -73.4, svg));
    barco.textContent = '⛵';
    el('animateTransform', { attributeName: 'transform', type: 'translate', values: '0 0; -40 -260; 0 -520; -30 -260; 0 0', dur: '38s', repeatCount: 'indefinite' }, barco);
    const oc = el('text', { x: 0, y: 0, transform: 'rotate(-90)', 'text-anchor': 'middle', class: 'oceano' }, deco(-31, -75.6, svg));
    oc.textContent = 'OCÉANO PACÍFICO';
    for (const [r, lat] of Object.entries(REGION_LAT)) {     // region names on the Argentine side, like road signs
      const t = el('text', { x: 0, y: 0, class: 'region-nombre', 'text-anchor': 'middle' }, deco(lat, -67.2, svg));
      t.textContent = r === 'Metropolitana' ? 'Santiago' : r;
    }
  }

  // Zoomed in, the drawings, the waves and the shadow stay their size; the coast gets its detailed version.
  let fino = null;
  function ajustarDibujo() {
    const s = Math.min(1, 1.6 / zf);
    for (const g of DECO) g.setAttribute('transform', `scale(${s})`);
    $('#sombra').setAttribute('transform', `translate(${10 * s} ${14 * s})`);
    $('#ruta5').style.opacity = zf >= 6 ? '0' : '';           // close in, a cartoon road would run through the wrong fields
    $('#olas').setAttribute('width', 90 * s); $('#olas').setAttribute('height', 60 * s);
    $('#olas').innerHTML = `<path d="M8 30 q10 -9 20 0 t20 0" transform="scale(${s})" fill="none" stroke="#9fd0e2" stroke-width="3" stroke-linecap="round"/>
      <animateTransform attributeName="patternTransform" type="translate" from="0 0" to="${90 * s} 0" dur="7s" repeatCount="indefinite"/>`;
    if (zf >= 2.5 && !fino) {
      fino = fetch('/data/chile-fino.json').then((r) => r.json()).then((d) => {
        $('#chile').setAttribute('d', d.chile); $('#sombra').setAttribute('d', d.chile);
        [...$('#vecinos').children].forEach((p, i) => p.setAttribute('d', Object.values(d.vecinos)[i] || p.getAttribute('d')));
      }).catch(() => { fino = null; });
    }
  }

  // ── Pins ──────────────────────────────────────────────────────────────────

  const escala = () => LZ().clientWidth / (VB.x1 - VB.x0);
  const aPx = (x, k) => { const [px, py] = proy(x.lat, x.lng); return [(px - VB.x0) * k, py * k]; };
  const enPx = (x) => aPx(x, escala());
  const mismoPunto = (items) => items.every((q) => q.lat === items[0].lat && q.lng === items[0].lng);

  // Pins that would overlap become one ("5 parcelas"): on a grid in screen pixels, at the current zoom. DX × DY ≈ a tag.
  const DX = 96, DY = 46;
  function agrupar(items, k) {
    const grupos = [], celdas = new Map();
    for (const x of items) {
      const [px, py] = aPx(x, k);
      const cx = Math.floor(px / DX), cy = Math.floor(py / DY);
      let g = null;
      for (let i = -1; i <= 1 && !g; i++) for (let j = -1; j <= 1 && !g; j++) {
        g = (celdas.get(`${cx + i},${cy + j}`) || []).find((q) => Math.abs(q.px - px) < DX && Math.abs(q.py - py) < DY) || null;
      }
      if (g) { g.items.push(x); continue; }
      g = { px, py, items: [x] };
      grupos.push(g);
      const c = `${cx},${cy}`;
      celdas.set(c, [...(celdas.get(c) || []), g]);
    }
    return grupos;
  }

  function etiqueta(g) {
    const x = g.items[0], n = g.items.length;
    if (n === 1) {
      const logo = FUENTES_LOGO(x.f) ? `<img src="${esc(FUENTES_LOGO(x.f))}" alt="" onerror="this.remove()">` : '';
      return `${logo}${esc(corto(x) || sup(x.m2) || 'Parcela')}`;
    }
    const conPrecio = g.items.filter((q) => q.monto).sort((a, b) => a.clp - b.clp);
    const comunas = new Set(g.items.map((q) => q.comuna));
    const sub = g.mismo && comunas.size === 1 && x.comuna ? `en ${x.comuna}` : conPrecio[0] ? `desde ${corto(conPrecio[0])}` : '';
    return `${n.toLocaleString('es-CL')} parcelas${sub ? `<small>${esc(sub)}</small>` : ''}`;
  }

  let primera = true;
  function pintarPines() {
    const k = escala();
    LZ().style.height = `${G.h * k}px`;
    GRUPOS = agrupar(vista, k);
    for (const g of GRUPOS) g.mismo = g.items.length > 1 && mismoPunto(g.items);
    abanico = null;
    const alto = LZ().clientHeight || 1;
    // Zoomed in: the names of the comunas where there are parcels, so you know where you are.
    let nombres = '';
    if (zf >= 3.5) {
      const puestos = [];
      for (const c of COMUNAS) {
        const [px, py] = aPx(c, k);
        if (puestos.some(([a, b]) => Math.abs(a - px) < 110 && Math.abs(b - py) < 22)) continue;
        puestos.push([px, py]);
        nombres += `<span class="comuna-nombre" style="left:${px}px;top:${py}px">${esc(c.n)}</span>`;
      }
    }
    $('#pines').classList.toggle('ya', !primera);
    $('#pines').innerHTML = nombres + GRUPOS.map((g, i) => {
      const x = g.items[0], uno = g.items.length === 1;
      const cls = uno ? (x.f === 'aqui' ? 'pin aqui' : 'pin') : g.mismo ? 'pin grupo lugar' : 'pin grupo';
      const d = Math.round(Math.min(1400, (g.py / alto) * 1400));
      return `<button class="${cls}" data-g="${i}" style="left:${g.px}px;top:${g.py}px;--d:${d}ms" aria-label="${esc(uno ? `${x.titulo}, ${x.comuna}` : `${g.items.length} parcelas en ${x.comuna || x.region}`)}">
        <span>${etiqueta(g)}</span></button>`;
    }).join('') + CARTELES.map(function (lat, i) {
      // A billboard is a link and nothing else: its domain, opening its page.
      // Its legs stand on the road at that latitude; the face hangs toward the sea. Its number (north → south) on a
      // small plate on the legs, like the real ones: the place stays, what's on it changes on every visit.
      const [px, py] = dondeCartel(lat, k, this), pos = `style="left:${px}px;top:${py}px"`;
      const patas = `<i class="patas"><span class="placa" aria-label="Letrero ${i + 1}">${i + 1}</span></i>`;
      const a = OCUPADOS[i];
      if (a?.ong) {
        return a.url
          ? `<a class="cartel tomado" href="${esc(a.url)}" target="_blank" rel="noopener" data-f="ong" ${pos}>${caraLetrero({ empresa: a.empresa, ong: true, bajada: 'ONG' })}${patas}</a>`
          : `<button class="cartel ong" data-ong ${pos}>${caraLetrero({ empresa: '¿Tienes una ONG?', ong: true, bajada: 'Este letrero es gratis' })}${patas}</button>`;
      }
      return a
        ? `<a class="cartel tomado" href="${esc(a.url || '#')}" target="_blank" rel="sponsored noopener" data-f="${esc(clicDe(a))}" ${pos}>${caraLetrero(a)}${patas}</a>`
        : `<button class="cartel libre" data-cartel="${i + 1}" ${pos}><span class="cara"><b>${SITIO.venta_carteles ? 'Disponible' : 'Próximamente'}</b>`
          + `<small>${SITIO.venta_carteles ? `${pesos(SITIO.precio_auspicio)} al mes` : 'Tu marca aquí'}</small></span>${patas}</button>`;
    }, []).join('');
    primera = false;
  }

  function marcar(b) {
    $$('.pin.activo').forEach((p) => p.classList.remove('activo'));
    b?.classList.add('activo');
  }

  // A tap on a pin: one parcel → its listing. A cluster → fly in until it splits. Parcels that share one spot
  // (a loteo, or listings that only say their comuna) → they fan out around it, or the list when they're many.
  function tocar(g, b) {
    cerrarAbanico();
    if (g.items.length === 1) { marcar(b); return abrirLista(g.items); }
    if (!g.mismo && zf < ZMAX - 0.01) return volarA(g.items);
    // As close as it gets: one tag per spot (a spot with many = "209 parcelas en Puerto Varas", its list on tap).
    const puntos = [...g.items.reduce((m, x) => m.set(`${x.lat},${x.lng}`, [...(m.get(`${x.lat},${x.lng}`) || []), x]), new Map()).values()];
    const piezas = puntos.length > 1 ? puntos : g.items.length <= 14 ? g.items.map((x) => [x]) : null;
    if (piezas && piezas.length <= 16) return abrirAbanico(g, b, piezas);
    marcar(b);
    if (zf < 5) volar(6, g.px, g.py - 20, SC().clientWidth / 2, SC().clientHeight / 2, () => { marcar($(`.pin[data-g="${GRUPOS.findIndex((q) => q.items.includes(g.items[0]))}"]`)); abrirLista(g.items); });
    else abrirLista(g.items);
  }

  // The fan: each parcel (or each spot) as its own tag, on rings around the cluster, with a line to where it is.
  function abrirAbanico(g, b, piezas) {
    const n = piezas.length, pos = [];
    for (let ring = 0, i = 0; i < n; ring++) {
      const a = 96 + ring * 70, bb = 46 + ring * 34;
      const cap = Math.max(5, Math.floor((2 * Math.PI * Math.sqrt((a * a + bb * bb) / 2)) / 100));
      const m = Math.min(cap, n - i);
      for (let j = 0; j < m; j++) {
        const t = -Math.PI / 2 + (j / m) * 2 * Math.PI + ring * 0.35;
        pos.push([Math.cos(t) * a, Math.sin(t) * bb]);
      }
      i += m;
    }
    const k = escala();
    const R = Math.max(...pos.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))) + 60;
    piezas = piezas.map((p) => p.slice().sort(orden)).sort((a, c) => orden(a[0], c[0]));
    const lineas = piezas.map((p, i) => {
      const [tx, ty] = aPx(p[0], k);
      return `<line x1="${R + pos[i][0]}" y1="${R + pos[i][1]}" x2="${R + tx - g.px}" y2="${R + ty - g.py}"/>`;
    }).join('') + piezas.map((p) => { const [tx, ty] = aPx(p[0], k); return `<circle cx="${R + tx - g.px}" cy="${R + ty - g.py}" r="4"/>`; }).join('');
    const cont = document.createElement('div');
    cont.className = 'abanico';
    cont.innerHTML = `<svg class="abanico-l" width="${2 * R}" height="${2 * R}" style="left:${g.px - R}px;top:${g.py - R}px">${lineas}</svg>`
      + piezas.map((p, i) => `<button class="pin chip${p.length > 1 ? ' grupo lugar' : p[0].f === 'aqui' ? ' aqui' : ''}" data-chip="${i}" style="left:${g.px + pos[i][0]}px;top:${g.py + pos[i][1]}px;--d:${i * 25}ms">
        <span>${etiqueta({ items: p, mismo: true })}</span></button>`).join('');
    $('#pines').appendChild(cont);
    b.classList.add('abierto');
    abanico = { piezas, b };
    // If the fan would fall off the screen, bring it in.
    const s = SC(), L = LZ();
    const vx = g.px + L.offsetLeft - s.scrollLeft, vy = g.py - s.scrollTop;
    if (vx < R || vx > s.clientWidth - R || vy < R * 0.6 || vy > s.clientHeight - R * 0.6) {
      s.scrollTo({ left: g.px + L.offsetLeft - s.clientWidth / 2, top: g.py - s.clientHeight / 2, behavior: calma ? 'auto' : 'smooth' });
    }
  }
  function cerrarAbanico() {
    if (!abanico) return;
    abanico.b.classList.remove('abierto');
    $('#pines .abanico')?.remove();
    abanico = null;
  }

  const FUENTES_LOGO = (f) => (f === 'aqui' ? '/img/fuentes/aqui.svg' : FUENTES[f]?.logo || '');
  // A corredora's favicon may not exist: then its initial, in a green square.
  const logoImg = (f, nombre) => `<img src="${esc(FUENTES_LOGO(f))}" alt="${esc(nombre)}" onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:'${esc((nombre || '?')[0])}'}))">`;

  // ── The list (bottom sheet on the phone, a column on the desktop) ─────────

  function fila(x) {
    const fuera = x.f !== 'aqui';
    const nombre = fuera ? (FUENTES[x.f]?.nombre || x.f) : 'Publicada aquí';
    const pr = largo(x) || (x.f === 'bienes-nacionales' ? 'Precio al abrir la licitación' : fuera ? 'Precio en la publicación' : `Precio con ${x.vendedor || 'el dueño'}`);
    return `<a class="fila" href="${esc(x.url)}" data-f="${esc(x.f)}"${fuera ? ' target="_blank" rel="nofollow noopener"' : ''}>
      <span class="fila-logo">${logoImg(x.f, nombre)}</span>
      <span class="fila-txt">
        ${FUENTES[x.f]?.verificada ? '<em class="fila-ok">✓ Corredora verificada</em>' : ''}
        <b>${esc(x.titulo)}</b>
        <span>${esc([x.comuna, x.region].filter(Boolean).join(', '))}${x.m2 ? ` · ${sup(x.m2)}` : ''}</span>
        <strong>${esc(pr)}</strong>
        ${x.nota ? `<span class="fila-nota">${esc(x.nota)}</span>` : ''}
      </span>
      <span class="fila-ir">${fuera ? `Ver en ${esc(nombre)} ↗` : `Ver · ${esc(x.vendedor || '')}`}</span>
    </a>`;
  }

  // The parcels inside the part of the map on screen.
  function enPantalla() {
    const s = SC(), L = LZ(), k = escala();
    const x0 = s.scrollLeft - L.offsetLeft, y0 = s.scrollTop, x1 = x0 + s.clientWidth, y1 = y0 + s.clientHeight;
    return vista.filter((x) => { const [px, py] = aPx(x, k); return px >= x0 && px <= x1 && py >= y0 + 16 && py <= y1 + 8; });
  }
  const zona = () => !lugar && zf > 1.05;
  function nombreDe(items) {
    if (!items.length) return 'Aquí no hay parcelas';
    const comunas = new Set(items.map((q) => q.comuna)), regiones = new Set(items.map((q) => q.region));
    return comunas.size === 1 && items[0].comuna ? items[0].comuna : regiones.size === 1 && items[0].region ? items[0].region : 'En esta parte del mapa';
  }

  function pintarLista() {
    const items = (lugar || (zona() ? enPantalla() : vista)).slice().sort(orden);
    $('#ver-lista-n').textContent = zona() ? ` · ${items.length.toLocaleString('es-CL')}` : '';
    // On the phone the sheet is closed most of the time: then only the count on the "Lista" button changes.
    if (!escritorio() && !$('#lista').classList.contains('abierta')) { ultimaLista = ''; return; }
    const firma = `${lugar ? 'l' : zona() ? 'z' : 't'}:${items.length}:${items.slice(0, 40).map((x) => x.k).join(',')}`;
    if (firma === ultimaLista) return;
    ultimaLista = firma;
    $('#lista-titulo').textContent = lugar || zona() ? nombreDe(items) : 'Todas las parcelas';
    $('#lista-n').textContent = `${items.length.toLocaleString('es-CL')} ${items.length === 1 ? 'parcela' : 'parcelas'}${zona() ? ' en pantalla' : ''}`;
    // Many listings on the exact same point = the publication only says its comuna: we say so.
    const nota = lugar && lugar.length >= 3 && mismoPunto(lugar)
      ? `<p class="lista-nota">📍 Estas publicaciones solo dicen la comuna, así que las ponemos en el centro de ${esc(lugar[0].comuna || 'la comuna')}. El punto exacto está en cada aviso.</p>` : '';
    const vacio = !items.length ? '<p class="lista-vacia">Ninguna en esta parte del mapa. Aleja el mapa (−) o prueba 🎲.</p>' : '';
    $('#lista-cuerpo').innerHTML = nota + vacio + items.slice(0, 300).map(fila).join('')
      + (lugar ? `<button class="ver-todas" data-todas>${zf > 1.05 ? 'Ver las de esta parte del mapa' : 'Ver todas las parcelas'}</button>` : '')
      + `<p class="lista-pie"><a href="/fuentes/">De dónde vienen las parcelas</a> · <a href="/publicar/">Publica la tuya gratis</a> · <a href="/corredoras/">¿Eres corredora?</a> · <button class="enlace" data-ong>¿Tienes una ONG? Un espacio gratis</button></p>`;
    $('#lista-cuerpo').scrollTop = 0;
  }

  function abrirLista(items) {
    lugar = items;
    $('#lista').classList.add('abierta');
    pintarLista();
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  function aplicar({ irARegion = false } = {}) {
    vista = todos.filter(pasa);
    lugar = null;
    const regiones = new Set(vista.map((x) => x.region).filter(Boolean)).size;
    $('#contador').innerHTML = `<b>${vista.length.toLocaleString('es-CL')}</b> ${vista.length === 1 ? 'parcela' : 'parcelas'} · ${regiones} ${regiones === 1 ? 'región' : 'regiones'}`;
    contar($('#contador b'), vista.length);
    const n = (f.tam ? 1 : 0) + (f.max ? 1 : 0) + (f.conprecio ? 1 : 0) + (f.region ? 1 : 0) + (f.q ? 1 : 0) + (f.fuentes.size ? 1 : 0);
    $('#n-filtros').hidden = !n; $('#n-filtros').textContent = n;
    $$('#rapidos button').forEach((b) => b.classList.toggle('si',
      b.dataset.r === 'todas' ? !f.tam && !f.conprecio : b.dataset.r === 'precio' ? f.conprecio : f.tam === b.dataset.r));
    pintarPines();
    pintarLista();
    if (irARegion && f.region) {
      if (vista.length) volarA(vista, { max: 6, min: 1 }); else irALat(REGION_LAT[f.region]);
    }
  }

  function irALat(lat) {
    const y = proy(lat, -70)[1] * escala();
    SC().scrollTo({ top: Math.max(0, y - SC().clientHeight / 3), behavior: 'smooth' });
  }

  function leerModal() {
    const fd = new FormData($('#form-filtros'));
    return { tam: fd.get('tam') || '', max: fd.get('max') || '', conprecio: fd.has('conprecio'), region: fd.get('region') || '',
      q: (fd.get('q') || '').trim(), fuentes: new Set(fd.getAll('fuente')) };
  }
  function llenarModal() {
    const form = $('#form-filtros');
    form.region.value = f.region; form.q.value = f.q; form.conprecio.checked = f.conprecio;
    form.querySelector(`[name=tam][value="${f.tam}"]`).checked = true;
    form.querySelector(`[name=max][value="${f.max}"]`).checked = true;
    $$('#f-fuentes input').forEach((i) => (i.checked = f.fuentes.has(i.value)));
    contarModal();
  }
  function contarModal() {
    const viejo = f; f = leerModal();
    const n = todos.filter(pasa).length;
    f = viejo;
    $('#ver-n').textContent = n ? `Ver ${n.toLocaleString('es-CL')} ${n === 1 ? 'parcela' : 'parcelas'}` : 'Ninguna con esos filtros';
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────
  // The map is one big drawing inside a scrolling box: zooming makes it wider (zf × the screen) and scrolls so the
  // point you're looking at stays put. Points are in the drawing's pixels (P) and on the screen (v).

  function ancho() { return Math.min(SC().clientWidth, 620) * zf; }

  function fijar(nz) {
    zf = lim(nz, 1, ZMAX);
    LZ().style.width = `${ancho()}px`;
    pintarPines();
    ajustarDibujo();
    $('#zoom-menos').disabled = zf <= 1.001; $('#zoom-mas').disabled = zf >= ZMAX - 0.001;
    $('#zoom-chile').hidden = zf <= 1.001;
  }

  // Show drawing point P (at the current zoom) at screen point v, scaled by r: a preview while pinching or flying.
  function previa(r, Px, Py, vx, vy) {
    const s = SC(), L = LZ();
    L.style.transformOrigin = '0 0';
    L.style.transform = `translate(${vx - L.offsetLeft + s.scrollLeft - r * Px}px, ${vy + s.scrollTop - r * Py}px) scale(${r})`;
  }
  function soltar(r, Px, Py, vx, vy) {
    const s = SC(), L = LZ();
    const nz = lim(zf * r, 1, ZMAX), rr = nz / zf;
    L.style.transition = ''; L.style.transform = '';
    lugar = null; cerrarAbanico();
    fijar(nz);
    s.scrollLeft = L.offsetLeft + rr * Px - vx;
    s.scrollTop = rr * Py - vy;
    $('#pines').classList.remove('volando');
    pintarLista();
  }

  let volando = false;
  function volar(nz, Px, Py, vx, vy, luego) {
    const s = SC(), L = LZ();
    nz = lim(nz, 1, ZMAX);
    const r = nz / zf;
    // Where the flight lands (the box can't scroll past the drawing's edges), so the preview ends exactly there.
    const W = L.offsetWidth * r, H = L.offsetHeight * r;
    const off = Math.max(0, (s.clientWidth - W) / 2);
    const sl = lim(off + r * Px - vx, 0, Math.max(0, W - s.clientWidth)), st = lim(r * Py - vy, 0, Math.max(0, H - s.clientHeight));
    const vx2 = off + r * Px - sl, vy2 = r * Py - st;
    cerrarAbanico();
    const fin = () => { volando = false; soltar(r, Px, Py, vx2, vy2); luego?.(); };
    if (calma || Math.abs(r - 1) < 0.01 && Math.abs(vx2 - (L.offsetLeft + Px - s.scrollLeft)) < 2) return fin();
    volando = true;
    $('#pines').classList.add('volando');
    L.style.transition = 'transform .45s cubic-bezier(.3,.1,.2,1)';
    void L.offsetWidth;
    previa(r, Px, Py, vx2, vy2);
    setTimeout(fin, 470);
  }
  // Fly so these parcels fill the screen (at least twice closer, at most ZMAX).
  function volarA(items, { max = ZMAX, min = 1.8 } = {}) {
    const s = SC(), k = escala();
    const ps = items.map((x) => aPx(x, k));
    const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const r = Math.min((s.clientWidth - 150) / Math.max(x1 - x0, 1), (s.clientHeight - 190) / Math.max(y1 - y0, 1));
    const nz = lim(zf * r, Math.min(max, zf * min), max);
    volar(nz, (x0 + x1) / 2, (y0 + y1) / 2 - 14, s.clientWidth / 2, s.clientHeight / 2);
  }
  function zoom(factor) {
    const s = SC(), L = LZ();
    volar(zf * factor, s.scrollLeft - L.offsetLeft + s.clientWidth / 2, s.scrollTop + s.clientHeight / 2, s.clientWidth / 2, s.clientHeight / 2);
  }

  // Pinch (phone), trackpad pinch / ctrl+wheel (desktop), double click, and dragging the map with the mouse.
  function gestos() {
    const s = SC(), L = LZ();
    const punto = (cx, cy) => { const R = s.getBoundingClientRect(); const vx = cx - R.left, vy = cy - R.top; return { vx, vy, Px: s.scrollLeft - L.offsetLeft + vx, Py: s.scrollTop + vy }; };
    let pinza = null;
    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    s.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 2 || volando) return;
      const [a, b] = e.touches;
      pinza = { d0: dist(a, b), r: 1, ...punto((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2) };
      pinza.v0 = [pinza.vx, pinza.vy];
      $('#pines').classList.add('volando');
    }, { passive: true });
    s.addEventListener('touchmove', (e) => {
      if (!pinza || e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = e.touches, m = punto((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      pinza.r = lim(dist(a, b) / pinza.d0, 1 / zf, ZMAX / zf);
      pinza.vx = m.vx; pinza.vy = m.vy;
      previa(pinza.r, pinza.Px, pinza.Py, pinza.vx, pinza.vy);
    }, { passive: false });
    const finPinza = (e) => {
      if (!pinza || e.touches.length >= 2) return;
      const p = pinza; pinza = null;
      soltar(p.r, p.Px, p.Py, p.vx, p.vy);
    };
    s.addEventListener('touchend', finPinza); s.addEventListener('touchcancel', finPinza);

    let rueda = null, ruedaT, gesto = null;
    s.addEventListener('wheel', (e) => {
      if (!e.ctrlKey || gesto || volando) return;
      e.preventDefault();
      if (!rueda) { rueda = { r: 1, ...punto(e.clientX, e.clientY) }; $('#pines').classList.add('volando'); }
      rueda.r = lim(rueda.r * Math.exp(-e.deltaY * 0.012), 1 / zf, ZMAX / zf);
      previa(rueda.r, rueda.Px, rueda.Py, rueda.vx, rueda.vy);
      clearTimeout(ruedaT);
      ruedaT = setTimeout(() => { const p = rueda; rueda = null; soltar(p.r, p.Px, p.Py, p.vx, p.vy); }, 180);
    }, { passive: false });
    // Safari on the Mac pinches with "gesture" events instead.
    s.addEventListener('gesturestart', (e) => { e.preventDefault(); if (volando) return; gesto = { r: 1, ...punto(e.clientX, e.clientY) }; $('#pines').classList.add('volando'); });
    s.addEventListener('gesturechange', (e) => { e.preventDefault(); if (!gesto) return; gesto.r = lim(e.scale, 1 / zf, ZMAX / zf); previa(gesto.r, gesto.Px, gesto.Py, gesto.vx, gesto.vy); });
    s.addEventListener('gestureend', (e) => { e.preventDefault(); if (!gesto) return; const p = gesto; gesto = null; soltar(p.r, p.Px, p.Py, p.vx, p.vy); });

    s.addEventListener('dblclick', (e) => {
      if (e.target.closest('.pin, .cartel')) return;
      const p = punto(e.clientX, e.clientY);
      volar(zf * 2, p.Px, p.Py, p.vx, p.vy);
    });

    let arrastre = null, movio = false;
    s.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.pin, .cartel')) return;
      arrastre = { x: e.clientX, y: e.clientY, sl: s.scrollLeft, st: s.scrollTop }; movio = false;
    });
    addEventListener('pointermove', (e) => {
      if (!arrastre) return;
      const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
      if (!movio && Math.hypot(dx, dy) < 5) return;
      movio = true; s.classList.add('arrastrando');
      s.scrollLeft = arrastre.sl - dx; s.scrollTop = arrastre.st - dy;
    });
    addEventListener('pointerup', () => { arrastre = null; s.classList.remove('arrastrando'); });

    $('#pines').addEventListener('click', (e) => {
      if (movio) { movio = false; return; }
      if (e.target.closest('button[data-ong]')) return window.abrirOng();
      const pagado = e.target.closest('a.cartel[data-f]');
      if (pagado) return navigator.sendBeacon?.('/api/clic', JSON.stringify({ f: pagado.dataset.f }));
      const ct = e.target.closest('button.cartel');
      if (ct) return window.abrirAuspicio(OCUPADOS, Number(ct.dataset.cartel));
      const chip = e.target.closest('[data-chip]');
      if (chip && abanico) { marcar(chip); return abrirLista(abanico.piezas[Number(chip.dataset.chip)]); }
      const b = e.target.closest('[data-g]');
      if (!b) return cerrarAbanico();
      tocar(GRUPOS[Number(b.dataset.g)], b);
    });
  }

  // ── The fun bits ──────────────────────────────────────────────────────────

  const calma = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let nAnterior = 0;
  function contar(b, n) {                                     // the counter ticks up to its number
    if (!b || calma) return;
    const desde = nAnterior, t0 = performance.now();
    nAnterior = n;
    const paso = (t) => { const k = Math.min(1, (t - t0) / 700); b.textContent = Math.round(desde + (n - desde) * (1 - (1 - k) ** 3)).toLocaleString('es-CL'); if (k < 1) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  }

  // "Estás en: Los Lagos" as you scroll down Chile; zoomed in, the nearest comuna with parcels ("Puerto Varas").
  function dondeEstoy() {
    const sc = SC(), L = LZ();
    const k = escala();
    const lat = G.proy.lat_top - (sc.scrollTop + sc.clientHeight / 2) / k / G.proy.k;
    let t = '';
    if (zf >= 3.5) {
      const cx = sc.scrollLeft - L.offsetLeft + sc.clientWidth / 2, cy = sc.scrollTop + sc.clientHeight / 2;
      let mejor = null, d = 1e9;
      for (const c of COMUNAS) { const [px, py] = aPx(c, k); const dd = Math.hypot(px - cx, py - cy); if (dd < d) { d = dd; mejor = c; } }
      if (mejor && d < Math.max(sc.clientWidth, sc.clientHeight)) t = mejor.n;
    }
    if (!t) {
      let dist = 99;
      for (const [r, l] of Object.entries(REGION_LAT)) if (Math.abs(l - lat) < dist) { dist = Math.abs(l - lat); t = r; }
      if (t === 'Metropolitana') t = 'Santiago';
    }
    if ($('#estas-en b').textContent !== t) {
      $('#estas-en b').textContent = t;
      $('#estas-en').classList.remove('cambia'); void $('#estas-en').offsetWidth; $('#estas-en').classList.add('cambia');
    }
    if (sc.scrollTop > 40 || zf > 1) $('#pista').classList.add('fuera');
  }

  // 🎲: fly to a random parcel, make its pin jump, open it.
  function sorpresa() {
    if (!vista.length) return;
    const x = vista[Math.floor(Math.random() * vista.length)];
    const [px, py] = enPx(x);
    const s = SC();
    volar(Math.max(zf, 9), px, py - 14, s.clientWidth / 2, s.clientHeight / 2.4, () => {
      const pin = $(`.pin[data-g="${GRUPOS.findIndex((g) => g.items.includes(x))}"]`);
      if (pin) { pin.classList.add('salta'); setTimeout(() => pin.classList.remove('salta'), 1300); }
      marcar(pin);
      abrirLista([x]);
    });
  }

  // ── Start ─────────────────────────────────────────────────────────────────

  window.iniciarMapa = async (j) => {
    document.body.classList.add('en-mapa');
    G = await fetch('/data/chile.json').then((r) => r.json());
    todos = unificar(j);
    OCUPADOS = Array.isArray(j.carteles) ? j.carteles : [];
    window.CARTELES_OCUPADOS = OCUPADOS;
    // Each comuna with parcels, for its name on the map when zoomed in: where its listings are (the most common point).
    const porComuna = new Map();
    for (const x of todos) {
      if (!x.comuna) continue;
      const c = porComuna.get(x.comuna) || porComuna.set(x.comuna, new Map()).get(x.comuna);
      const p = `${x.lat},${x.lng}`;
      c.set(p, (c.get(p) || 0) + 1);
    }
    COMUNAS = [...porComuna].map(([n, pts]) => {
      const [lat, lng] = [...pts].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
      return { n, lat, lng, total: [...pts.values()].reduce((a, b) => a + b, 0) };
    }).sort((a, b) => b.total - a.total);
    $('#f-region').innerHTML = '<option value="">Todo Chile</option>' + j.lista_regiones.map((r) => {
      const n = todos.filter((x) => x.region === r).length;
      return `<option value="${esc(r)}"${n ? '' : ' disabled'}>${esc(r)}${n ? ` (${n})` : ''}</option>`;
    }).join('');
    $('#f-fuentes').innerHTML = [['aqui', 'Publicadas aquí'], ...Object.entries(FUENTES).map(([k, v]) => [k, v.nombre])].map(([k, n]) =>
      `<label><input type="checkbox" name="fuente" value="${esc(k)}"><span><img src="${FUENTES_LOGO(k)}" alt="">${esc(n)}</span></label>`).join('');
    dibujar();
    LZ().style.width = `${ancho()}px`;
    ajustarDibujo();
    aplicar();
    $('#zoom-menos').disabled = true;
    gestos();
    let tl;
    SC().addEventListener('scroll', () => {
      requestAnimationFrame(dondeEstoy);
      clearTimeout(tl);
      tl = setTimeout(() => { if (zona()) pintarLista(); }, 200);
    }, { passive: true });
    dondeEstoy();
    $('#dado').addEventListener('click', sorpresa);
    // Visits each source gets from the map (what a corredora wants to know).
    $('#lista-cuerpo').addEventListener('click', (e) => {
      const a = e.target.closest('a.fila[data-f]');
      if (a && a.dataset.f !== 'aqui') navigator.sendBeacon?.('/api/clic', JSON.stringify({ f: a.dataset.f }));
    });

    $('#rapidos').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.id === 'dado') return;
      const r = b.dataset.r;
      if (r === 'todas') { f.tam = ''; f.conprecio = false; } else if (r === 'precio') f.conprecio = !f.conprecio; else f.tam = f.tam === r ? '' : r;
      aplicar();
    });
    $('#abrir-filtros').addEventListener('click', () => { llenarModal(); $('#modal-filtros').hidden = false; });
    $('#modal-filtros').addEventListener('click', (e) => {
      if (e.target.id === 'modal-filtros' || e.target.closest('[data-cerrar-filtros]')) $('#modal-filtros').hidden = true;
    });
    $('#form-filtros').addEventListener('input', contarModal);
    $('#form-filtros').addEventListener('submit', (e) => {
      e.preventDefault();
      f = leerModal();
      $('#modal-filtros').hidden = true;
      aplicar({ irARegion: true });
    });
    $('#limpiar').addEventListener('click', () => { f = { tam: '', max: '', conprecio: false, region: '', q: '', fuentes: new Set() }; llenarModal(); });
    $('#zoom-mas').addEventListener('click', () => zoom(2));
    $('#zoom-menos').addEventListener('click', () => zoom(0.5));
    $('#zoom-chile').addEventListener('click', () => zoom(1 / zf));
    $('#ver-lista').addEventListener('click', () => { lugar = null; ultimaLista = ''; $('#lista').classList.add('abierta'); pintarLista(); });
    $('#lista-cerrar').addEventListener('click', () => {
      $('#lista').classList.remove('abierta');
      marcar(null);
      if (escritorio()) { lugar = null; pintarLista(); }
    });
    $('#lista-cuerpo').addEventListener('click', (e) => {
      if (e.target.closest('[data-ong]')) return window.abrirOng();
      if (e.target.closest('[data-todas]')) { lugar = null; marcar(null); cerrarAbanico(); pintarLista(); }
    });
    let t;
    addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const s = SC(), L = LZ();
        const cx = (s.scrollLeft - L.offsetLeft + s.clientWidth / 2) / L.offsetWidth, cy = (s.scrollTop + s.clientHeight / 2) / L.offsetHeight;
        fijar(zf);
        s.scrollLeft = L.offsetLeft + cx * L.offsetWidth - s.clientWidth / 2; s.scrollTop = cy * L.offsetHeight - s.clientHeight / 2;
      }, 150);
    });
    // An old address (/parcelas/ etc.) or ?region= lands on that part of the map.
    const r = new URLSearchParams(location.search).get('region');
    if (r && REGION_LAT[r]) { f.region = r; aplicar({ irARegion: true }); }
  };
})();
