// The Google Earth reels (render_earth.py), printed in the phone directory: the real flight from space to the parcel
// comes in as frames and goes out as yellow pages, the same family as paginas.js: the photo in ink with a halftone
// screen on yellow paper, the parcel's official boundary in ink, the guide word and the real scale on top, the listings
// of that stretch of Chile in directory columns, the cover band, the handle box and the ad at the end.
(function () {
  const TINTA = '#161512', AMARILLO = '#f6cf3a', W = 1080, H = 1920, u = W / 360;
  const CABEZA = 40 * u, COLUMNAS = 74 * u;
  const HANDLE = '@parcelasyterrenos';
  const entre = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const suave = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const fmt = (n) => n.toLocaleString('es-CL');
  const mayus = (s) => (s || '').toLocaleUpperCase('es-CL');

  // ── Paper (the same recipe as paginas.js) ──
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
  const papel = (ctx) => ctx.createPattern(papelLienzo, 'repeat');

  // ── The photo, printed: grey levels → ink on the paper, half of it through a 45° halftone screen ──
  // The KML boundary comes in magenta (render_earth.py): those pixels are lifted out and drawn back in ink.
  const IMPRENTA = { negro: 0.04, blanco: 0.5, gamma: 0.85, celda: 7, trama: 0.55, resalte: 1 };
  const foto = document.createElement('canvas'); foto.width = W; foto.height = H;
  const fctx = foto.getContext('2d', { willReadFrequently: true });
  const borde = new Uint8Array(W * H);
  const GW = W / 4, GH = H / 4, rejilla = new Uint8Array(GW * GH), cola = new Int32Array(GW * GH);
  const dentro = document.createElement('canvas'); dentro.width = GW; dentro.height = GH;
  const tinta = document.createElement('canvas'); tinta.width = W; tinta.height = H;

  function imprimir(ctx, img, o) {
    const p = { ...IMPRENTA, ...o };
    fctx.drawImage(img, 0, 0, W, H);
    const im = fctx.getImageData(0, 0, W, H), d = im.data;
    const k = Math.SQRT1_2 / p.celda, rango = p.blanco - p.negro;
    let hay = 0;
    for (let y = 0, i = 0, q = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i += 4, q++) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (r > 150 && b > 150 && g < 110 && r - g > 80) { borde[q] = 1; hay++; d[i] = d[i + 1] = d[i + 2] = 255; continue; }
        borde[q] = 0;
        let L = ((0.3 * r + 0.59 * g + 0.11 * b) / 255 - p.negro) / rango;
        L = L <= 0 ? 0 : L >= 1 ? 1 : Math.pow(L, p.gamma);
        const a = (x + y) * k, c = (x - y) * k;
        const fu = a - Math.floor(a) - 0.5, fv = c - Math.floor(c) - 0.5;
        const punto = Math.sqrt((1 - L) / Math.PI) - Math.sqrt(fu * fu + fv * fv);
        const enPunto = Math.min(1, Math.max(0, punto * p.celda + 0.5));
        const v = 255 * (L * (1 - p.trama) + (1 - enPunto) * p.trama);
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
    fctx.putImageData(im, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(foto, 0, 0);
    ctx.restore();
    if (hay > 40) parcela(ctx, p);
  }

  // The parcel: the rest of the page takes a little more ink, so its inside stays bright (as if someone had gone over it
  // with a highlighter), and the boundary is a thick ink line with a paper edge.
  function parcela(ctx, p) {
    rejilla.fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (borde[y * W + x]) rejilla[(y >> 2) * GW + (x >> 2)] = 1;
    // Flood the outside from the edges; what the water doesn't reach is the inside.
    let n = 0;
    const meter = (q) => { if (!rejilla[q]) { rejilla[q] = 2; cola[n++] = q; } };
    for (let x = 0; x < GW; x++) { meter(x); meter((GH - 1) * GW + x); }
    for (let y = 0; y < GH; y++) { meter(y * GW); meter(y * GW + GW - 1); }
    for (let h = 0; h < n; h++) {
      const q = cola[h], x = q % GW;
      if (x > 0) meter(q - 1); if (x < GW - 1) meter(q + 1);
      if (q >= GW) meter(q - GW); if (q < GW * (GH - 1)) meter(q + GW);
    }
    let adentro = 0;
    const dctx = dentro.getContext('2d'), di = dctx.createImageData(GW, GH);
    for (let q = 0; q < GW * GH; q++) if (rejilla[q] !== 2) { di.data[q * 4 + 3] = 255; adentro++; }
    const fuerza = p.resalte * entre(adentro, 30, 600);   // grows in as the parcel gets big enough to see
    if (adentro < GW * GH * 0.6 && fuerza > 0) {
      dctx.putImageData(di, 0, 0);
      const t = tinta.getContext('2d');
      t.clearRect(0, 0, W, H);
      t.globalCompositeOperation = 'source-over';
      t.fillStyle = `rgba(22,21,18,${0.24 * fuerza})`; t.fillRect(0, 0, W, H);
      t.globalCompositeOperation = 'destination-out';
      t.imageSmoothingEnabled = true; t.drawImage(dentro, 0, 0, W, H);
      ctx.drawImage(tinta, 0, 0);
    }
    // The line: the magenta pixels, thickened, paper first and ink on top.
    const t = tinta.getContext('2d'), li = t.createImageData(W, H);
    for (let q = 0; q < W * H; q++) if (borde[q]) li.data[q * 4 + 3] = 255;
    t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, W, H); t.putImageData(li, 0, 0);
    const trazo = (color, r) => {
      const s = document.createElement('canvas'); s.width = W; s.height = H;
      const g = s.getContext('2d');
      for (let a = 0; a < 16; a++) g.drawImage(tinta, Math.cos(a * Math.PI / 8) * r, Math.sin(a * Math.PI / 8) * r);
      g.drawImage(tinta, 0, 0);
      g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, W, H);
      ctx.drawImage(s, 0, 0);
    };
    trazo(AMARILLO, 2.2 * u);
    trazo(TINTA, 1.1 * u);
  }

  // ── The directory around it ──
  function escala(km) {
    // The ratio if this page were printed 6.5 cm wide.
    const r = km * 1e5 / 6.5, p = 10 ** Math.floor(Math.log10(r));
    return `1:${fmt(Math.round(r / p) * p)}`;
  }
  function encabezado(ctx, col, km, credito) {
    const m = 14 * u;
    ctx.fillStyle = papel(ctx); ctx.fillRect(0, 0, W, CABEZA + COLUMNAS);
    ctx.fillStyle = TINTA; ctx.fillRect(m, 8 * u, W - 2 * m, 3 * u);
    ctx.font = `700 ${20 * u}px "Archivo Narrow", sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(mayus(col.guia), m, 31 * u);
    ctx.font = `500 ${10 * u}px "Archivo Narrow", sans-serif`; ctx.textAlign = 'right';
    ctx.fillText(`ESCALA ${escala(km)}`, W - m, 30 * u);
    ctx.fillRect(m, CABEZA - 3 * u, W - 2 * m, 1 * u);
    const colW = (W - 2 * m - 10 * u) / 2, lh = 13 * u;
    col.filas.slice(0, 10).forEach(([izq, der, propia], i) => {
      const x0 = m + (i < 5 ? 0 : colW + 10 * u), y = CABEZA + 10 * u + (i % 5) * lh;
      ctx.font = `${propia ? 700 : 500} ${10 * u}px "Archivo Narrow", sans-serif`;
      ctx.fillStyle = TINTA;
      if (propia) { ctx.fillText('►', x0 - 1 * u, y); }
      const xi = x0 + (propia ? 9 * u : 0);
      ctx.textAlign = 'right'; ctx.fillText(der, x0 + colW, y);
      const dw = ctx.measureText(der).width;
      ctx.textAlign = 'left'; ctx.fillText(izq, xi, y, colW - dw - 14 * u);
      const a = xi + Math.min(ctx.measureText(izq).width, colW - dw - 14 * u) + 3 * u, b = x0 + colW - dw - 3 * u;
      ctx.globalAlpha = 0.6; for (let x = a; x < b; x += 3 * u) ctx.fillRect(x, y - 1 * u, 1 * u, 1 * u); ctx.globalAlpha = 1;
    });
    ctx.fillRect(m + colW + 4.5 * u, CABEZA + 2 * u, 0.8 * u, COLUMNAS - 8 * u);
    ctx.fillRect(m, CABEZA + COLUMNAS - 3 * u, W - 2 * m, 1 * u);
    // Google's attribution, hanging under the header like a tab: it stays on every frame.
    ctx.font = `500 ${8 * u}px "Archivo Narrow", sans-serif`;
    const tw = ctx.measureText(credito).width + 10 * u, ty = CABEZA + COLUMNAS - 2 * u;
    ctx.fillStyle = papel(ctx); ctx.fillRect(W - m - tw, ty, tw, 13 * u);
    ctx.strokeStyle = TINTA; ctx.lineWidth = 0.8 * u; ctx.strokeRect(W - m - tw, ty, tw, 13 * u);
    ctx.fillStyle = TINTA; ctx.textAlign = 'right'; ctx.fillText(credito, W - m - 5 * u, ty + 9.5 * u);
  }

  function ajustar(ctx, txt, peso, max, ancho) {
    let t = max; ctx.font = `${peso} ${t}px "Archivo Narrow", sans-serif`;
    while (ctx.measureText(txt).width > ancho && t > 8) { t -= 2; ctx.font = `${peso} ${t}px "Archivo Narrow", sans-serif`; }
    return t;
  }

  // The cover band (the first frames, and the cover image): ink with the headline in yellow.
  function portada(ctx, d, a) {
    const mg = 22 * u, y0 = H * 0.29, alto = H * 0.42;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = TINTA; ctx.fillRect(0, y0, W, alto);
    ctx.fillStyle = AMARILLO; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const [sello, ...grandes] = d.titular;
    ctx.font = `700 ${14 * u}px "Archivo Narrow", sans-serif`;
    const sw = ctx.measureText(sello).width;
    ctx.fillRect(mg, y0 + 20 * u, sw + 14 * u, 22 * u);
    ctx.fillStyle = TINTA; ctx.fillText(sello, mg + 7 * u, y0 + 36 * u);
    ctx.fillStyle = AMARILLO;
    let y = y0 + 46 * u;
    for (const l of grandes) {
      const t = ajustar(ctx, l, 700, 46 * u, W - 2 * mg);
      y += t * 0.98; ctx.fillText(l, mg, y);
    }
    y += 26 * u;
    ctx.font = `500 ${17 * u}px "Archivo Narrow", sans-serif`;
    ctx.fillText(mayus(d.lugar), mg, y);
    y += 16 * u; ctx.fillRect(mg, y, W - 2 * mg, 1.2 * u);
    ctx.font = `700 ${26 * u}px "Archivo Narrow", sans-serif`;
    ctx.fillText(HANDLE, mg, y0 + alto - 22 * u);
    ctx.restore();
  }

  function tira(ctx, d, a) {
    const mg = 14 * u;
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = `700 ${15 * u}px "Archivo Narrow", sans-serif`;
    const a1 = ctx.measureText(HANDLE).width;
    ctx.font = `500 ${12 * u}px "Archivo Narrow", sans-serif`;
    const a2 = Math.min(W - 2 * mg - 16 * u, ctx.measureText(d.tira).width);
    const bw = Math.max(a1, a2) + 16 * u, by = H - 70 * u;
    ctx.fillStyle = 'rgba(246,207,58,.92)'; ctx.fillRect(mg, by, bw, 46 * u);
    ctx.strokeStyle = TINTA; ctx.lineWidth = 1.5 * u; ctx.strokeRect(mg, by, bw, 46 * u);
    ctx.fillStyle = TINTA; ctx.textAlign = 'left';
    ctx.font = `700 ${15 * u}px "Archivo Narrow", sans-serif`; ctx.fillText(HANDLE, mg + 8 * u, by + 19 * u);
    ctx.font = `500 ${12 * u}px "Archivo Narrow", sans-serif`; ctx.fillText(d.tira, mg + 8 * u, by + 36 * u, W - 2 * mg - 16 * u);
    ctx.restore();
  }

  // The listing as a directory ad, typeset one line at a time while the camera turns around the parcel (t from the
  // landing): the box, its header, the size, the name, where it is, who sells it, the address. Then the stamp.
  function aviso(ctx, d, t) {
    const A = d.aviso, mg = 14 * u, bw = W - 2 * mg, bh = 196 * u, bx = mg;
    const fila = (desde) => suave(entre(t, desde, desde + 0.35));
    const k = fila(0);
    const by = H - 28 * u - bh + (1 - k) * 60 * u;
    ctx.save(); ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(22,21,18,.35)'; ctx.fillRect(bx + 5 * u, by + 5 * u, bw, bh);
    ctx.fillStyle = papel(ctx); ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = TINTA; ctx.lineWidth = 3 * u; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = TINTA; ctx.fillRect(bx, by, bw, 30 * u);
    ctx.restore();
    const p = bx + 14 * u, ancho = bw - 28 * u;
    const linea = (desde, fn) => {
      const a = fila(desde);
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a * k; ctx.translate((1 - a) * -14 * u, 0); ctx.textAlign = 'left'; fn(); ctx.restore();
    };
    const [l1, l2, l3] = A.lineas;
    linea(0.3, () => { ctx.fillStyle = AMARILLO; ctx.font = `700 ${14 * u}px "Archivo Narrow", sans-serif`; ctx.fillText(mayus(A.cabeza), bx + 14 * u, by + 20 * u); });
    linea(1.1, () => {
      ctx.fillStyle = TINTA; ctx.font = `700 ${48 * u}px "Archivo Narrow", sans-serif`; ctx.fillText(A.grande, p, by + 80 * u);
      const gw = ctx.measureText(A.grande).width;
      ctx.font = `500 ${16 * u}px "Archivo Narrow", sans-serif`; ctx.fillText(A.chico || '', p + gw + 10 * u, by + 80 * u);
    });
    if (l1) linea(2.0, () => { ctx.fillStyle = TINTA; ctx.font = `700 ${17 * u}px "Archivo Narrow", sans-serif`; ctx.fillText(l1, p, by + 106 * u, ancho); });
    if (l2) linea(2.8, () => { ctx.fillStyle = TINTA; ctx.font = `500 ${14 * u}px "Archivo Narrow", sans-serif`; ctx.fillText(l2, p, by + 126 * u, ancho); });
    if (l3) linea(3.6, () => { ctx.fillStyle = TINTA; ctx.font = `500 ${14 * u}px "Archivo Narrow", sans-serif`; ctx.fillText(l3, p, by + 144 * u, ancho); });
    linea(4.4, () => {
      ctx.fillStyle = TINTA; ctx.fillRect(p, by + bh - 46 * u, ancho, 32 * u);
      ctx.fillStyle = AMARILLO; ctx.font = `700 ${15 * u}px "Archivo Narrow", sans-serif`;
      ctx.fillText('PARCELASYTERRENOS.CL', p + 12 * u, by + bh - 25 * u);
      ctx.textAlign = 'right'; ctx.font = `500 ${14 * u}px "Archivo Narrow", sans-serif`;
      ctx.fillText(HANDLE, p + ancho - 12 * u, by + bh - 25 * u);
    });
    if (d.invitacion?.length) sello(ctx, d.invitacion, t - d.sello, bx + bw - 10 * u, by - 16 * u);
  }

  // A rubber stamp over the ad's corner: it lands (big → its size), with the ink a little uneven.
  function sello(ctx, lineas, t, x, y) {
    if (t <= 0) return;
    const a = entre(t, 0, 0.18), esc = 1 + 0.5 * (1 - suave(entre(t, 0, 0.22)));
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(-0.12); ctx.scale(esc, esc);
    ctx.font = `700 ${20 * u}px "Archivo Narrow", sans-serif`;
    const ancho = Math.max(...lineas.map((l) => ctx.measureText(l).width)) + 22 * u, alto = lineas.length * 22 * u + 14 * u;
    ctx.translate(-ancho, -alto);
    ctx.fillStyle = 'rgba(246,207,58,.9)'; ctx.fillRect(0, 0, ancho, alto);
    ctx.strokeStyle = TINTA; ctx.lineWidth = 3 * u; ctx.strokeRect(0, 0, ancho, alto);
    ctx.lineWidth = 1 * u; ctx.strokeRect(4 * u, 4 * u, ancho - 8 * u, alto - 8 * u);
    ctx.fillStyle = TINTA; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    lineas.forEach((l, i) => ctx.fillText(l, ancho / 2, 7 * u + (i + 1) * 22 * u - 4 * u));
    // Where the stamp didn't take: specks of paper.
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 90; i++) { const r = (Math.sin(i * 91.7) * 0.5 + 0.5); ctx.globalAlpha = 0.5 * a; ctx.fillRect((Math.sin(i * 12.9) * 0.5 + 0.5) * ancho, (Math.sin(i * 78.2) * 0.5 + 0.5) * alto, 1 + r * 2.5 * u, 1 + r * u); }
    ctx.restore();
  }

  // ── Postcards: real photos of each place (public/data/lugares.json, Wikimedia Commons), in colour on the printed
  // page, as the flight goes over that place. White border, the caption on the paper and the author + licence. ──
  function postal(ctx, f, t) {
    const dur = f.hasta - f.desde, e = t - f.desde;
    if (e < 0 || e > dur || !f.im) return;
    const entra = suave(entre(e, 0, 0.45)), sale = suave(entre(e, dur - 0.35, dur));
    const w = f.ancho * u, im = f.im, ih = w * Math.min(0.8, im.naturalHeight / im.naturalWidth);
    const borde = 6 * u, pie = 30 * u, alto = ih + 2 * borde + pie;
    const cx = f.x * u + w / 2 + (1 - entra) * 220 * u - sale * 260 * u, cy = f.y * u + alto / 2;
    ctx.save();
    ctx.globalAlpha = Math.min(entra, 1 - sale);
    ctx.translate(cx, cy); ctx.rotate((f.giro + (1 - entra) * 7 - sale * 5) * Math.PI / 180);
    ctx.fillStyle = 'rgba(22,21,18,.4)'; ctx.fillRect(-w / 2 - borde + 4 * u, -alto / 2 + 5 * u, w + 2 * borde, alto);
    ctx.fillStyle = '#fbf8ef'; ctx.fillRect(-w / 2 - borde, -alto / 2, w + 2 * borde, alto);
    // The photo, slowly pushing in, cropped to its window.
    const zoom = 1.04 + 0.06 * entre(e, 0, dur), k = Math.max(w / im.naturalWidth, ih / im.naturalHeight) * zoom;
    ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, -alto / 2 + borde, w, ih); ctx.clip();
    ctx.drawImage(im, -im.naturalWidth * k / 2, -alto / 2 + borde + ih / 2 - im.naturalHeight * k / 2, im.naturalWidth * k, im.naturalHeight * k);
    ctx.restore();
    ctx.fillStyle = TINTA; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${12.5 * u}px "Archivo Narrow", sans-serif`;
    ctx.fillText(mayus(f.pie), -w / 2, alto / 2 - 13 * u, w);
    ctx.font = `500 ${7.5 * u}px "Archivo Narrow", sans-serif`; ctx.globalAlpha *= 0.75;
    ctx.fillText(f.credito, -w / 2, alto / 2 - 4 * u, w);
    ctx.restore();
  }

  // ── One frame ──
  const lienzo = document.createElement('canvas'); lienzo.width = W; lienzo.height = H;
  const ctx = lienzo.getContext('2d');
  let D = null;
  const cargar = (src) => new Promise((ok, mal) => { const im = new Image(); im.onload = () => ok(im); im.onerror = mal; im.src = src; });

  window.earth = {
    // d: { titular: [sello, línea…], lugar, tira, aviso: {cabeza, grande, chico, lineas}, invitacion: [líneas], sello (s
    //      after landing), credito, columnas: [{km, guia, filas: [[izq, der, propia]]}] (from the widest),
    //      fotos: [{src, pie, credito, desde, hasta, x, y, ancho, giro}] (x, y, ancho in 360ths), intro, bajada, dur, imprenta }
    async preparar(d) {
      D = d;
      await Promise.all(['700 20px "Archivo Narrow"', '500 20px "Archivo Narrow"'].map((f) => document.fonts.load(f)));
      await Promise.all(D.fotos.map(async (f) => { f.im = await cargar(f.src); }));
      return true;
    },
    // One frame: the Earth image (data URL), its second and the camera distance in metres.
    async cuadro(src, t, dist) {
      const img = await cargar(src);
      const km = 0.832 * dist / 1000;            // the ground across the frame (measured in Earth: 0.83 × distance)
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = papel(ctx); ctx.fillRect(0, 0, W, H);
      imprimir(ctx, img, D.imprenta);
      const col = D.columnas.find((c) => dist / 1000 > c.km) || D.columnas[D.columnas.length - 1];
      encabezado(ctx, col, km, D.credito);
      const [b0, b1] = D.bajada;
      const aIntro = 1 - entre(t, D.intro - 0.4, D.intro + 0.3);
      if (aIntro > 0) portada(ctx, D, aIntro);
      const aTira = entre(t, D.intro, D.intro + 0.5) * (1 - entre(t, b1 - 0.2, b1 + 0.2));
      if (aTira > 0) tira(ctx, D, aTira);
      for (const f of D.fotos) postal(ctx, f, t);
      if (t >= b1) aviso(ctx, D, t - b1);
      return lienzo.toDataURL('image/jpeg', 0.92);
    },
  };
})();
