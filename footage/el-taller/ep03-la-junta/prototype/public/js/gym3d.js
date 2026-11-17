// La Junta: walkable 3D model of the gym, built from the architect's renders.
// API: POIS, mountGym(container, opts) -> { goTo(id), setWallNames(names, highlight), destroy() }
import * as THREE from '../vendor/three.module.min.js';

const ASSET = (p) => new URL(`../assets/${p}`, import.meta.url).href;
const EYE = 1.65;          // eye height (m)
const MEZZ = 3.6;          // mezzanine floor height (m)
const RADIUS = 0.3;        // player radius for collisions
const DEG = Math.PI / 180;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const POIS = [
  { id: 'entrada', label: { es: 'Entrada', en: 'Entrance' },
    blurb: { es: 'Vidrio, madera y luz del sur. Así se ve La Junta desde la puerta.', en: 'Glass, wood and southern light. This is La Junta from the front door.' } },
  { id: 'recepcion', label: { es: 'Recepción', en: 'Front desk' },
    blurb: { es: 'Check-in con tu WhatsApp, un saludo y a escalar.', en: 'Check in with your WhatsApp, say hi, go climb.' } },
  { id: 'muro-40', label: { es: 'Muro 40°', en: '40° Wall' },
    blurb: { es: 'El desplome principal. Bloques que cambian cada semana.', en: 'The main overhang. Problems that change every week.' } },
  { id: 'cueva', label: { es: 'La Cueva', en: 'The Cave' },
    blurb: { es: 'Techo bajo y desplomado para entrenar fuerza. Aquí se pasa el invierno.', en: 'A low, steep roof to build strength. This is where winter happens.' } },
  { id: 'kids', label: { es: 'Zona Kids', en: 'Kids Zone' },
    blurb: { es: 'Muro bajo, presas grandes y colchonetas de colores. Escalar parte jugando.', en: 'Low wall, big holds, colorful mats. Climbing starts as play.' } },
  { id: 'cafe', label: { es: 'Café', en: 'Café' },
    blurb: { es: 'Un café. Una cordada. Un lugar para quedarse.', en: 'A coffee. A rope team. A place to stay.' } },
  { id: 'mezzanine', label: { es: 'Mezzanine', en: 'Mezzanine' },
    blurb: { es: 'Entrenamiento, trotadoras y la mejor vista de los muros.', en: 'Training, treadmills and the best view of the walls.' } },
  { id: 'muro-socios', label: { es: 'Muro de Socios', en: 'Members Wall' },
    blurb: { es: 'Los 100 socios honorarios, para siempre en la pared.', en: 'The 100 honorary members, on the wall forever.' } },
  { id: 'terraza', label: { es: 'Terraza', en: 'Terrace' },
    blurb: { es: 'Abedules y mesas al sol, para cuando sí hay sol.', en: 'Birch trees and tables in the sun, for when the sun does show up.' } },
];

// Camera viewpoint for each POI: p = eye position, t = look target.
const VIEWS = {
  entrada: { p: [1.5, EYE, 8.6], t: [1.5, 2.6, -11] },
  recepcion: { p: [4.2, EYE, 2.9], t: [8.2, 2.4, 9.4] },
  'muro-40': { p: [8.6, EYE, -0.9], t: [1.6, 2.4, -8.8] },
  cueva: { p: [9.4, EYE, -2.0], t: [16.2, 2.1, -6.6] },
  kids: { p: [-12.0, EYE, -4.4], t: [-14.4, 1.2, -10.6] },
  cafe: { p: [-10.9, EYE, 9.7], t: [-15.2, 1.4, 4.2] },
  mezzanine: { p: [-11.0, MEZZ + EYE, 0.6], t: [4, 2.6, -7.5] },
  'muro-socios': { p: [14.6, EYE, 4.6], t: [14.6, 2.35, 10.9] },
  terraza: { p: [-5.8, EYE, 17.4], t: [-9.5, 3.2, 8] },
};
const INTRO = [
  { p: [1.5, 2.3, 28], t: [1.5, 4.6, 11], d: 0 },
  { p: [1.5, 1.8, 14.0], t: [1.5, 2.8, -5], d: 2.4 },
  { p: [1.5, EYE, 7.0], t: [2.0, 2.4, -11], d: 1.9 },
];

const T = {
  hint: { es: 'Arrastra para mirar · Joystick para caminar', en: 'Drag to look · Joystick to walk' },
  hintDesk: { es: 'Arrastra para mirar · WASD o flechas para caminar', en: 'Drag to look · WASD or arrows to walk' },
  wallTitle: { es: 'MURO DE SOCIOS HONORARIOS', en: 'HONORARY MEMBERS WALL' },
  wallSub: { es: 'Los primeros 100 · Desde el día 0', en: 'The first 100 · From day 0' },
  free: { es: 'libre', en: 'free' },
  noGL: { es: 'Tu navegador no pudo abrir el 3D. Prueba en Chrome o Safari actualizado.', en: 'Your browser could not open the 3D view. Try an up-to-date Chrome or Safari.' },
};

// ---------------------------------------------------------------- utils
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function noise(ctx, w, h, amp) {
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amp;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function loadImage(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

// ---------------------------------------------------------------- procedural textures
function concreteTex() {
  const S = 1024; const [c, x] = canvas(S, S);
  x.fillStyle = '#a7a5a0'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const r = 60 + Math.random() * 220, px = Math.random() * S, py = Math.random() * S;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const dark = Math.random() < 0.5;
    g.addColorStop(0, dark ? 'rgba(70,68,64,0.10)' : 'rgba(235,232,226,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  noise(x, S, S, 14);
  x.strokeStyle = 'rgba(60,58,55,0.45)'; x.lineWidth = 2;
  x.strokeRect(1, 1, S - 2, S - 2);
  return tex(c);
}
function plyTex(base, dot, seam) {
  const S = 512; const [c, x] = canvas(S, S);
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '120,90,50' : '255,250,235'},${0.025 + Math.random() * 0.04})`;
    x.fillRect(0, Math.random() * S, S, 1 + Math.random() * 5);
  }
  noise(x, S, S, 8);
  x.fillStyle = dot;
  const n = 8, step = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    x.beginPath(); x.arc(step * (i + 0.5) + ((j % 2) * step) / 2 - step / 4, step * (j + 0.5), 3.2, 0, Math.PI * 2); x.fill();
  }
  x.strokeStyle = seam; x.lineWidth = 2; x.strokeRect(0, 0, S, S);
  return tex(c);
}
function woodTex(base = [214, 184, 142]) {
  const S = 512; const [c, x] = canvas(S, S);
  const planks = 4, pw = S / planks;
  for (let i = 0; i < planks; i++) {
    const v = (Math.random() - 0.5) * 22;
    x.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v * 0.8})`;
    x.fillRect(i * pw, 0, pw, S);
    for (let k = 0; k < 26; k++) {
      x.strokeStyle = `rgba(120,80,40,${0.04 + Math.random() * 0.06})`;
      x.lineWidth = 1 + Math.random() * 2;
      x.beginPath();
      const ox = i * pw + Math.random() * pw;
      x.moveTo(ox, 0);
      for (let yy = 0; yy <= S; yy += 32) x.lineTo(ox + Math.sin(yy / 60 + k) * 4, yy);
      x.stroke();
    }
    x.fillStyle = 'rgba(80,55,30,0.45)'; x.fillRect(i * pw, 0, 2, S);
  }
  noise(x, S, S, 6);
  return tex(c);
}
function slatTex() {
  const S = 256; const [c, x] = canvas(S, S);
  for (let i = 0; i < 8; i++) {
    const v = (Math.random() - 0.5) * 16;
    x.fillStyle = `rgb(${212 + v},${180 + v},${136 + v})`; x.fillRect(i * 32, 0, 32, S);
    x.fillStyle = 'rgba(70,45,20,0.55)'; x.fillRect(i * 32 + 28, 0, 4, S);
  }
  noise(x, S, S, 6);
  return tex(c);
}
function claddingTex() {
  const S = 256; const [c, x] = canvas(S, S);
  x.fillStyle = '#3d3530'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = 'rgba(255,240,225,0.07)'; x.fillRect(i * 32, 0, 6, S);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(i * 32 + 6, 0, 3, S);
  }
  noise(x, S, S, 6);
  return tex(c);
}
function matTex() {
  const S = 256; const [c, x] = canvas(S, S);
  x.fillStyle = '#29292c'; x.fillRect(0, 0, S, S);
  noise(x, S, S, 7);
  x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, 0, S, 3); x.fillRect(0, 0, 3, S);
  return tex(c);
}
function deckTex() {
  const S = 512; const [c, x] = canvas(S, S);
  const n = 4, s = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = (Math.random() - 0.5) * 14;
    x.fillStyle = `rgb(${200 + v},${196 + v},${188 + v})`; x.fillRect(i * s, j * s, s, s);
  }
  noise(x, S, S, 10);
  x.strokeStyle = 'rgba(90,85,80,0.5)'; x.lineWidth = 3;
  for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, S); x.moveTo(0, i * s); x.lineTo(S, i * s); x.stroke(); }
  return tex(c);
}
function grassTex() {
  const S = 256; const [c, x] = canvas(S, S);
  x.fillStyle = '#6f8f4a'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '40,70,25' : '150,180,90'},0.18)`;
    x.fillRect(Math.random() * S, Math.random() * S, 3, 6);
  }
  noise(x, S, S, 16);
  return tex(c);
}
function barkTex() {
  const [c, x] = canvas(64, 256);
  x.fillStyle = '#ece9e1'; x.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 26; i++) {
    x.fillStyle = 'rgba(30,28,26,0.85)';
    x.fillRect(Math.random() * 64, Math.random() * 256, 6 + Math.random() * 18, 2 + Math.random() * 3);
  }
  return tex(c);
}
function lockerTex() {
  const S = 256; const [c, x] = canvas(S, S);
  x.fillStyle = '#e2ad1e'; x.fillRect(0, 0, S, S);
  noise(x, S, S, 6);
  x.fillStyle = 'rgba(80,55,0,0.55)';
  x.fillRect(0, 0, 3, S); x.fillRect(128, 0, 3, S); x.fillRect(0, 126, S, 3);
  x.fillStyle = 'rgba(40,30,0,0.6)';
  for (const ox of [100, 228]) for (const oy of [52, 180]) x.fillRect(ox, oy, 6, 26);
  for (const ox of [20, 148]) for (const oy of [14, 142]) for (let k = 0; k < 4; k++) x.fillRect(ox, oy + k * 7, 60, 3);
  return tex(c);
}
function railTex() {
  const [c, x] = canvas(256, 64);
  x.clearRect(0, 0, 256, 64);
  x.fillStyle = '#1d1e20';
  for (let i = 0; i < 16; i++) x.fillRect(i * 16 + 7, 0, 2.5, 64);
  return tex(c);
}
function shadowTex() {
  const S = 128; const [c, x] = canvas(S, S);
  const g = x.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return tex(c, { repeat: false });
}
function aoTex() {
  const [c, x] = canvas(4, 64);
  const g = x.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 4, 64);
  const t = tex(c, { repeat: false });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
function skyGeo() {
  const g = new THREE.SphereGeometry(400, 24, 16);
  const col = []; const p = g.attributes.position; const top = new THREE.Color('#8fbfe3'); const hor = new THREE.Color('#eef2f2');
  for (let i = 0; i < p.count; i++) {
    const h = clamp(p.getY(i) / 400, 0, 1);
    const cc = hor.clone().lerp(top, Math.pow(h, 0.6));
    col.push(cc.r, cc.g, cc.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// ---------------------------------------------------------------- geometry batching
function mergeGeometries(geos) {
  let vc = 0, ic = 0;
  for (const g of geos) { vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------- mount
export function mountGym(container, opts = {}) {
  const lang = opts.lang === 'en' ? 'en' : 'es';
  injectStyles();
  const root = document.createElement('div');
  root.className = 'g3d-root';
  container.appendChild(root);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    const fb = document.createElement('div');
    fb.className = 'g3d-fallback';
    fb.textContent = T.noGL[lang];
    root.appendChild(fb);
    return { goTo() {}, setWallNames() {}, destroy() { root.remove(); } };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.className = 'g3d-canvas';
  root.appendChild(renderer.domElement);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9eff1');
  scene.fog = new THREE.Fog('#e6ecee', 70, 260);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
  camera.rotation.order = 'YXZ';

  // lights: warm, soft, no realtime shadows
  scene.add(new THREE.HemisphereLight('#fff6ea', '#a59a8b', 2.1));
  const sun = new THREE.DirectionalLight('#fff0d8', 1.5);
  sun.position.set(-30, 50, 40);
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#dfe9f2', 0.45);
  fill.position.set(30, 20, -40);
  scene.add(fill);

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // materials: key -> { mat, tm } (tm = texture size in meters)
  const M = {};
  const lam = (key, p, tm = 1) => { M[key] = { mat: track(new THREE.MeshLambertMaterial(p)), tm }; };
  const basic = (key, p, tm = 1) => { M[key] = { mat: track(new THREE.MeshBasicMaterial(p)), tm }; };
  const T_ = (t) => { t.anisotropy = maxAniso; return track(t); };
  lam('concrete', { map: T_(concreteTex()) }, 4);
  lam('plaster', { color: '#ece7de' }, 3);
  lam('wood', { map: T_(woodTex([228, 203, 165])) }, 2.4);
  lam('ceil', { map: T_(woodTex([236, 216, 184])), emissive: '#3b3024' }, 2.4);
  lam('woodDark', { map: T_(woodTex([150, 112, 78])) }, 2.4);
  lam('woodShade', { map: T_(woodTex([236, 216, 184])), color: '#d8d0c4', emissive: '#2a221a' }, 2.4);
  lam('slat', { map: T_(slatTex()) }, 1);
  lam('ply', { map: T_(plyTex('#f1e7d3', 'rgba(70,58,45,0.85)', 'rgba(150,120,80,0.35)')), side: THREE.DoubleSide }, 1.6);
  lam('plyDark', { map: T_(plyTex('#2d2d2f', 'rgba(0,0,0,0.9)', 'rgba(255,255,255,0.06)')), side: THREE.DoubleSide }, 1.6);
  lam('black', { color: '#151515', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  lam('steel', { color: '#2a2d31' });
  lam('mat', { map: T_(matTex()) }, 2);
  lam('matTeal', { color: '#2EAD82' });
  lam('matBlue', { color: '#3A8FB5' });
  lam('matOrange', { color: '#C97C2A' });
  lam('cladding', { map: T_(claddingTex()) }, 2);
  lam('deck', { map: T_(deckTex()) }, 2.4);
  lam('grass', { map: T_(grassTex()) }, 5);
  lam('asphalt', { color: '#5d5d5c' });
  lam('bark', { map: T_(barkTex()) }, 1);
  lam('leaf', { color: '#86a957', flatShading: true });
  lam('leafDark', { color: '#5c8040', flatShading: true });
  lam('forest', { color: '#4e6b3d', flatShading: true });
  lam('rock', { color: '#c9c5bd', flatShading: true });
  lam('locker', { map: T_(lockerTex()) }, 1);
  lam('shade', { color: '#3f4f4a', side: THREE.DoubleSide });
  lam('gymFloor', { color: '#34343a' });
  lam('cream', { color: '#EAE5DC' });
  lam('chair', { color: '#c48a4a' });
  lam('totem', { color: '#202022' });
  basic('glow', { color: '#fff7e6' });
  basic('sky', { color: '#ffffff', toneMapped: false });
  basic('glass', { color: '#cfe2ea', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  basic('shadow', { map: T_(shadowTex()), transparent: true, depthWrite: false, color: '#000000', opacity: 0.6 });
  basic('ao', { map: T_(aoTex()), transparent: true, depthWrite: false, color: '#000000' });
  lam('rail', { map: T_(railTex()), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }, 1);

  const batches = new Map();
  const push = (key, g) => { if (!batches.has(key)) batches.set(key, []); batches.get(key).push(g); };

  // --- primitive helpers
  function box(key, x0, x1, y0, y1, z0, z1) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const g = new THREE.BoxGeometry(w, h, d);
    const tm = M[key].tm; const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tm, (uv.getY(i) * dims[f][1]) / tm);
    }
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    push(key, g);
  }
  function boxR(key, cx, cz, w, d, y0, y1, ry) {
    const g = new THREE.BoxGeometry(w, y1 - y0, d);
    g.rotateY(ry); g.translate(cx, (y0 + y1) / 2, cz);
    push(key, g);
  }
  function quad(key, p0, p1, p2, p3, out) {
    const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p3, p0)).normalize();
    const flip = !!(out && n.dot(out) < 0);
    if (flip) n.negate();
    const tm = M[key].tm;
    const eu = new THREE.Vector3().subVectors(p1, p0).normalize();
    const ev = new THREE.Vector3().subVectors(p3, p0); ev.addScaledVector(eu, -ev.dot(eu)).normalize();
    const pts = [p0, p1, p2, p3];
    const pos = [], nor = [], uv = [];
    for (const p of pts) {
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
      const r = new THREE.Vector3().subVectors(p, p0);
      uv.push(r.dot(eu) / tm, r.dot(ev) / tm);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    push(key, g);
    return flip ? { p0: p1, p1: p0, p2: p3, p3: p2, n } : { p0, p1, p2, p3, n };
  }
  function tri(key, a, b, c, want) {
    let n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (want && n.dot(want) < 0) { [b, c] = [c, b]; n.negate(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    push(key, g);
  }
  // planar polygon in a constant-x plane (pts are [z, y]) or constant-z plane (pts are [x, y])
  function shapeX(key, x, pts) {
    const s = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ShapeGeometry(s); const tm = M[key].tm; const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tm, uv.getY(i) / tm);
    g.rotateY(-Math.PI / 2); g.translate(x, 0, 0);
    push(key, g);
  }
  function shapeZ(key, z, pts) {
    const s = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ShapeGeometry(s); const tm = M[key].tm; const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tm, uv.getY(i) / tm);
    g.translate(0, 0, z);
    push(key, g);
  }
  const floorQuad = (key, x0, x1, z0, z1, y = 0) => quad(key, V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), V(0, 1, 0));
  function shadowQuad(x0, x1, z0, z1, pad = 0.45, y = 0.006) {
    const g = new THREE.PlaneGeometry(x1 - x0 + 2 * pad, z1 - z0 + 2 * pad);
    g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    push('shadow', g);
  }

  // --- collision world
  const obs = { g: [], u: [] };
  const addObs = (lvl, x0, x1, z0, z1) => {
    const o = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
    if (lvl !== 'u') obs.g.push(o);
    if (lvl !== 'g') obs.u.push(o);
  };
  const mats = []; // walkable soft mats (raise eye a bit)

  // --- climbing panels + holds
  const panels = []; const volumes = [];
  function panelPoint(P, u, v) {
    const a = P.p0.clone().lerp(P.p1, u); const b = P.p3.clone().lerp(P.p2, u);
    return a.lerp(b, v);
  }
  function decal(P, uvs, key = 'black') {
    const [a, b, c] = uvs.map(([u, v]) => panelPoint(P, u, v).addScaledVector(P.n, 0.012));
    tri(key, a, b, c, P.n);
  }
  function addPanel(key, p0, p1, p2, p3, out, density = 3.2, kind = 'std') {
    const P = quad(key, p0, p1, p2, p3, out);
    const area = P.p0.distanceTo(P.p1) * P.p0.distanceTo(P.p3);
    panels.push({ ...P, count: Math.round(area * density), kind, dark: key === 'plyDark' });
    return panels[panels.length - 1];
  }
  const ZW = -10.93; // north wall inner face
  function northSection(x0, x1, ang, H, key, density = 3.2, kind = 'std', zBase) {
    const t = Math.tan(ang * DEG);
    const zb = zBase ?? (ang >= 0 ? -10.6 : -10.85 - H * t);
    const zt = zb + H * t;
    const P = addPanel(key, V(x0, 0, zb), V(x1, 0, zb), V(x1, H, zt), V(x0, H, zt), V(0, -t, 1), density, kind);
    for (const x of [x0 + 0.004, x1 - 0.004]) shapeX(key, x, [[ZW, 0], [zb, 0], [zt, H], [ZW, H]]);
    quad(key, V(x0, H, zt), V(x1, H, zt), V(x1, H, ZW), V(x0, H, ZW), V(0, 1, 0));
    addObs('g', x0, x1, -11, Math.max(zb, zb + 1.95 * t) + 0.04);
    return P;
  }

  // ================================================================= BUILDING SHELL
  const X0 = -18, X1 = 18, Z0 = -11, Z1 = 11, H = 8.5, HX = 9.2;
  floorQuad('concrete', X0, X1, Z0, Z1, 0);
  // ceiling (wood), darker under mezzanine
  quad('ceil', V(-10, H, Z0), V(X1, H, Z0), V(X1, H, Z1), V(-10, H, Z1), V(0, -1, 0));
  quad('ceil', V(X0, H, Z0), V(-10, H, Z0), V(-10, H, Z1), V(X0, H, Z1), V(0, -1, 0));
  // interior walls
  quad('plaster', V(X0, 0, -10.95), V(X1, 0, -10.95), V(X1, H, -10.95), V(X0, H, -10.95), V(0, 0, 1));
  quad('plaster', V(17.95, 0, Z0), V(17.95, 0, Z1), V(17.95, H, Z1), V(17.95, H, Z0), V(-1, 0, 0));
  quad('plaster', V(-17.95, 0, Z0), V(-17.95, 0, 3), V(-17.95, H, 3), V(-17.95, H, Z0), V(1, 0, 0));
  quad('plaster', V(-17.95, 7.6, 3), V(-17.95, 7.6, Z1), V(-17.95, H, Z1), V(-17.95, H, 3), V(1, 0, 0));
  quad('wood', V(3, 0, 10.95), V(17.95, 0, 10.95), V(17.95, H, 10.95), V(3, H, 10.95), V(0, 0, -1));
  quad('plaster', V(X0, 7.6, 10.95), V(3, 7.6, 10.95), V(3, H, 10.95), V(X0, H, 10.95), V(0, 0, -1));
  // exterior skin (dark vertical cladding)
  quad('cladding', V(3, 0, 11.25), V(18.25, 0, 11.25), V(18.25, HX, 11.25), V(3, HX, 11.25), V(0, 0, 1));
  quad('cladding', V(-18.25, 7.6, 11.25), V(3, 7.6, 11.25), V(3, HX, 11.25), V(-18.25, HX, 11.25), V(0, 0, 1));
  quad('cladding', V(-18.25, 0, -11.25), V(-18.25, 0, 3), V(-18.25, HX, 3), V(-18.25, HX, -11.25), V(-1, 0, 0));
  quad('cladding', V(-18.25, 7.6, 3), V(-18.25, 7.6, 11.25), V(-18.25, HX, 11.25), V(-18.25, HX, 3), V(-1, 0, 0));
  quad('cladding', V(18.25, 0, -11.25), V(18.25, 0, 11.25), V(18.25, HX, 11.25), V(18.25, HX, -11.25), V(1, 0, 0));
  quad('cladding', V(-18.25, 0, -11.25), V(18.25, 0, -11.25), V(18.25, HX, -11.25), V(-18.25, HX, -11.25), V(0, 0, -1));
  quad('steel', V(-18.25, HX, -11.25), V(18.25, HX, -11.25), V(18.25, HX, 11.25), V(-18.25, HX, 11.25), V(0, 1, 0));
  // glass: south (café + hall) and west (café)
  quad('glass', V(X0, 0, 11.1), V(0, 0, 11.1), V(0, 7.6, 11.1), V(X0, 7.6, 11.1));
  quad('glass', V(0, 3.0, 11.1), V(3, 3.0, 11.1), V(3, 7.6, 11.1), V(0, 7.6, 11.1));
  quad('glass', V(-18.1, 0, 3), V(-18.1, 0, Z1), V(-18.1, 7.6, Z1), V(-18.1, 7.6, 3));
  for (let x = X0; x <= 0.01; x += 2) box('steel', x - 0.05, x + 0.05, 0, 7.6, 11.03, 11.17);
  for (const y of [0, 3.6, 7.55]) box('steel', X0, 0, y, y + 0.08, 11.03, 11.17);
  for (let z = 3; z <= 11.01; z += 2) box('steel', -18.17, -18.03, 0, 7.6, z - 0.05, z + 0.05);
  for (const y of [0, 3.6, 7.55]) box('steel', -18.17, -18.03, y, y + 0.08, 3, Z1);
  // door frame + canopy
  box('steel', -0.08, 0.08, 0, 7.6, 11.0, 11.2); box('steel', 2.92, 3.08, 0, 7.6, 11.0, 11.2);
  box('steel', 0, 3, 2.95, 3.08, 11.0, 11.2);
  box('steel', -0.8, 3.8, 3.3, 3.45, 11.2, 13.0);
  // wall-floor soft occlusion strips
  const aoStrip = (a, b, out) => quad('ao', a, b, b.clone().addScaledVector(out, 1.1), a.clone().addScaledVector(out, 1.1), V(0, 1, 0));
  aoStrip(V(17.95, 0.004, -1), V(17.95, 0.004, 10.95), V(-1, 0, 0));
  aoStrip(V(3, 0.004, 10.95), V(17.95, 0.004, 10.95), V(0, 0, -1));
  aoStrip(V(-17.95, 0.004, -10.95), V(-17.95, 0.004, 3), V(1, 0, 0));
  addObs('b', X0 - 0.3, X0 + 0.1, Z0, Z1);
  addObs('b', X1 - 0.1, X1 + 0.3, Z0, Z1);
  addObs('b', X0, X1, Z0 - 0.3, Z0 + 0.1);
  addObs('b', X0 - 0.3, 0, 10.95, 11.3);
  addObs('b', 3, X1 + 0.3, 10.95, 11.3);

  // roof structure: beams, purlins, skylights
  for (const x of [-15, -9, -3, 3, 9, 15]) {
    box('steel', x - 0.14, x + 0.14, 7.85, H, Z0, Z1);
    box('steel', x - 0.12, x + 0.12, 0, 7.85, -10.95, -10.7);
    if (x === 3) box('steel', x - 0.12, x + 0.12, 0, 7.85, 10.7, 10.95);
  }
  for (const z of [-8.2, -2.8, 2.6, 8.0]) box('steel', X0, X1, 8.22, 8.36, z - 0.08, z + 0.08);
  for (const zc of [-5.5, 0.0, 5.3]) {
    quad('sky', V(-17.6, H - 0.01, zc - 0.85), V(17.6, H - 0.01, zc - 0.85), V(17.6, H - 0.01, zc + 0.85), V(-17.6, H - 0.01, zc + 0.85), V(0, -1, 0));
    for (let x = -17.6; x <= 17.6; x += 1.6) box('steel', x - 0.03, x + 0.03, H - 0.09, H - 0.02, zc - 0.85, zc + 0.85);
    box('steel', -17.6, 17.6, H - 0.1, H - 0.02, zc - 0.9, zc - 0.82);
    box('steel', -17.6, 17.6, H - 0.1, H - 0.02, zc + 0.82, zc + 0.9);
  }
  // industrial pendant lamps
  const lamps = [[-6, -5, 5.6], [2.5, -5, 5.6], [10, -5, 5.6], [15.5, -5.5, 5.8], [-4.5, 3.2, 5.6], [4.5, 2.4, 5.6], [12.5, 3.2, 5.6], [-15, 7.2, 4.8], [-12.2, 8.0, 4.8], [8, 6.5, 5.4]];
  for (const [x, z, y] of lamps) {
    box('steel', x - 0.012, x + 0.012, y + 0.36, H, z - 0.012, z + 0.012);
    const sh = new THREE.CylinderGeometry(0.07, 0.34, 0.4, 18, 1, true); sh.translate(x, y + 0.18, z); push('shade', sh);
    const cap = new THREE.CylinderGeometry(0.05, 0.07, 0.12, 10); cap.translate(x, y + 0.42, z); push('shade', cap);
    const bulb = new THREE.CircleGeometry(0.3, 18); bulb.rotateX(Math.PI / 2); bulb.translate(x, y + 0.02, z); push('glow', bulb);
  }

  // ================================================================= CLIMBING WALLS
  const S1 = northSection(-9.5, -5, 0, 4.6, 'ply');
  const S2 = northSection(-5, -1, 18, 4.6, 'ply');
  const S3 = northSection(-1, 6, 40, 4.4, 'ply', 3.6);
  const S4 = northSection(6, 9.5, 25, 4.6, 'plyDark');
  const S5 = northSection(9.5, 12.8, -8, 4.6, 'ply');
  decal(S3, [[0.08, 0.12], [0.5, 0.96], [0.78, 0.18]]);
  decal(S3, [[0.62, 0.9], [0.98, 0.95], [0.9, 0.45]]);
  decal(S2, [[0.15, 0.55], [0.95, 0.97], [0.9, 0.2]]);
  decal(S1, [[0.05, 0.75], [0.6, 0.98], [0.3, 0.4]]);
  decal(S5, [[0.2, 0.1], [0.9, 0.65], [0.95, 0.12]]);
  void S4;
  for (const x of [1.95, 3.05]) box('steel', x - 0.008, x + 0.008, 6.5, H, -7.42, -7.4);
  for (const x of [-15.5, -13.5]) box('steel', x - 0.008, x + 0.008, 3.16, 3.25, 3.06, 3.08);
  // freestanding dark tower (like the black column in the render)
  {
    const B = [[-4, -0.6], [-1.2, -0.6], [-1.2, 2.2], [-4, 2.2]];
    const Tp = [[-3.5, -0.2], [-0.75, -0.45], [-0.95, 1.95], [-3.7, 1.75]];
    const th = 4.4; const c = V(-2.4, 0, 0.8);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const p0 = V(B[i][0], 0, B[i][1]), p1 = V(B[j][0], 0, B[j][1]);
      const p2 = V(Tp[j][0], th, Tp[j][1]), p3 = V(Tp[i][0], th, Tp[i][1]);
      const mid = p0.clone().add(p1).multiplyScalar(0.5).sub(c).setY(0).normalize();
      const P = addPanel('plyDark', p0, p1, p2, p3, mid, 3.0);
      if (i === 0) decal(P, [[0.1, 0.2], [0.5, 0.9], [0.7, 0.3]], 'cream');
    }
    quad('plyDark', ...Tp.map(([x, z]) => V(x, th, z)), V(0, 1, 0));
    addObs('g', -4.1, -0.65, -0.7, 2.3);
  }
  // the cave (east side): low steep roof
  {
    const za = -1, zbb = -10.6;
    const back = addPanel('ply', V(17.6, 0, za), V(17.6, 0, zbb), V(17.6, 1.3, zbb), V(17.6, 1.3, za), V(-1, 0, 0), 3.2);
    const roof = addPanel('ply', V(17.6, 1.3, za), V(17.6, 1.3, zbb), V(14.2, 3.4, zbb), V(14.2, 3.4, za), V(-0.5, -1, 0), 3.8);
    const head = addPanel('plyDark', V(14.2, 3.4, za), V(14.2, 3.4, zbb), V(14.2, 4.6, zbb), V(14.2, 4.6, za), V(-1, 0, 0), 0);
    quad('ply', V(14.2, 4.6, za), V(14.2, 4.6, zbb), V(17.95, 4.6, zbb), V(17.95, 4.6, za), V(0, 1, 0));
    const prof = [[17.95, 0], [17.6, 0], [17.6, 1.3], [14.2, 3.4], [14.2, 4.6], [17.95, 4.6]];
    shapeZ('ply', za - 0.004, prof); shapeZ('ply', zbb + 0.004, prof);
    decal(roof, [[0.1, 0.3], [0.55, 0.95], [0.6, 0.15]]);
    void back; void head;
    addObs('g', 16.45, 18, zbb, za);
  }
  // kids wall under the mezzanine
  const KW = northSection(-17.4, -11.4, 5, 2.6, 'ply', 1.6, 'big');
  decal(KW, [[0.7, 0.2], [0.95, 0.9], [0.98, 0.25]], 'matTeal');

  // mats
  function mat(key, x0, x1, z0, z1, h = 0.3) { box(key, x0, x1, 0, h, z0, z1); mats.push({ x0, x1, z0, z1, h }); }
  mat('mat', -9.5, 12.8, -10.6, -5.0);
  mat('mat', -5.0, 0.2, -1.8, 3.4);
  mat('mat', 13.0, 17.9, -10.6, -0.6);
  mat('matTeal', -17.4, -14.4, -10.4, -7.8, 0.25);
  mat('matOrange', -14.4, -11.4, -10.4, -7.8, 0.25);
  // light wood plinths/benches
  const bench = (x0, x1, z0, z1, h = 0.45) => { box('wood', x0, x1, 0, h, z0, z1); shadowQuad(x0, x1, z0, z1, 0.3); addObs('g', x0, x1, z0, z1); };
  bench(-7.5, -4.0, -4.4, -3.9);
  bench(4.0, 7.6, -4.4, -3.9);
  bench(9.6, 12.0, -4.4, -3.9);
  bench(11.6, 12.1, -3.2, -0.6);

  // ================================================================= MEZZANINE + STAIRS
  box('gymFloor', X0, -10, MEZZ - 0.02, MEZZ, Z0, 3);
  quad('woodShade', V(X0, MEZZ - 0.35, 3), V(-10, MEZZ - 0.35, 3), V(-10, MEZZ - 0.35, Z0), V(X0, MEZZ - 0.35, Z0), V(0, -1, 0));
  box('steel', -10.05, -9.95, MEZZ - 0.35, MEZZ, Z0, 3);
  box('steel', X0, -10, MEZZ - 0.35, MEZZ, 2.95, 3.05);
  for (const z of [-10.5, -6, -1.5, 3]) { box('steel', -10.12, -9.88, 0, MEZZ - 0.35, z - 0.12, z + 0.12); addObs('g', -10.15, -9.85, z - 0.15, z + 0.15); }
  // landing
  box('gymFloor', -10, -8.6, MEZZ - 0.02, MEZZ, 1.5, 3);
  box('steel', -10, -8.6, MEZZ - 0.35, MEZZ - 0.02, 1.5, 3);
  box('steel', -8.72, -8.48, 0, MEZZ - 0.35, 1.38, 1.62); addObs('g', -8.75, -8.45, 1.35, 1.65);
  // stairs: 20 steps from z=9 (floor) to z=3 (mezzanine)
  for (let i = 0; i < 20; i++) box('wood', -10, -8.6, i * 0.18, (i + 1) * 0.18, 9 - (i + 1) * 0.3, 9 - i * 0.3);
  for (const x of [-10.02, -8.58]) {
    quad('steel', V(x, -0.2, 9.2), V(x, MEZZ - 0.35, 3), V(x, MEZZ + 0.02, 3), V(x, 0.18, 9.2), V(x < -9.5 ? -1 : 1, 0, 0));
    quad('steel', V(x, -0.2, 9.2), V(x, MEZZ - 0.35, 3), V(x, MEZZ + 0.02, 3), V(x, 0.18, 9.2), V(x < -9.5 ? 1 : -1, 0, 0));
  }
  addObs('b', -10.08, -9.92, 3, 9);
  addObs('b', -8.68, -8.52, 1.5, 9);
  addObs('g', -10, -8.6, 2.9, 3.05);
  // railings (top bar + bar texture)
  function railing(a, b, h = 1.05) {
    const top = h;
    quad('rail', a.clone(), b.clone(), b.clone().setY(b.y + top), a.clone().setY(a.y + top));
    const g = new THREE.CylinderGeometry(0.03, 0.03, a.distanceTo(b), 6);
    g.rotateZ(Math.PI / 2);
    const dir = new THREE.Vector3().subVectors(b, a);
    const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), dir.clone().normalize());
    g.applyQuaternion(q);
    const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y + top, m.z);
    push('steel', g);
  }
  railing(V(-10, MEZZ, Z0 + 0.05), V(-10, MEZZ, 1.5));
  railing(V(X0 + 0.05, MEZZ, 3), V(-10, MEZZ, 3));
  railing(V(-10, MEZZ, 1.5), V(-8.6, MEZZ, 1.5));
  railing(V(-8.6, MEZZ, 1.5), V(-8.6, MEZZ, 3));
  railing(V(-8.6, MEZZ, 3), V(-8.6, 0.0, 9));
  railing(V(-10, MEZZ, 3), V(-10, 0.0, 9));
  addObs('u', -10.1, -9.9, Z0, 1.5);
  addObs('u', X0, -10, 2.9, 3.1);
  addObs('u', -10, -8.6, 1.4, 1.55);
  addObs('u', -8.65, -8.5, 1.5, 3);
  // treadmills upstairs, facing the hall
  for (const z of [-8.6, -6.6, -4.6]) {
    box('totem', -13.9, -12.1, MEZZ, MEZZ + 0.22, z - 0.38, z + 0.38);
    box('steel', -12.25, -12.15, MEZZ, MEZZ + 1.2, z - 0.36, z - 0.3);
    box('steel', -12.25, -12.15, MEZZ, MEZZ + 1.2, z + 0.3, z + 0.36);
    box('totem', -12.35, -11.95, MEZZ + 1.15, MEZZ + 1.35, z - 0.4, z + 0.4);
    shadowQuad(-13.9, -12.0, z - 0.4, z + 0.4, 0.25, MEZZ + 0.006);
    addObs('u', -14.0, -11.9, z - 0.45, z + 0.45);
  }
  // a stack of plyo boxes + a bench upstairs
  box('woodDark', -16.8, -15.6, MEZZ, MEZZ + 0.6, -9.6, -8.4);
  box('woodDark', -16.6, -15.8, MEZZ + 0.6, MEZZ + 1.05, -9.4, -8.6);
  addObs('u', -16.9, -15.5, -9.7, -8.3);

  // ================================================================= RECEPTION + TOTEM
  box('slat', 3.6, 8.0, 0, 1.08, 7.6, 8.4);
  box('totem', 3.5, 8.1, 1.08, 1.14, 7.5, 8.5);
  box('totem', 6.6, 7.2, 1.14, 1.5, 8.0, 8.05);
  box('totem', 6.75, 7.05, 1.14, 1.16, 8.0, 8.25);
  shadowQuad(3.6, 8.0, 7.6, 8.4, 0.4);
  addObs('g', 3.5, 8.1, 7.5, 8.5);
  box('totem', 8.6, 11.0, 0, 6.2, 9.6, 10.1);
  shadowQuad(8.6, 11.0, 9.6, 10.1, 0.5);
  addObs('g', 8.55, 11.05, 9.55, 10.15);
  // lockers (yellow) under the mezzanine, along the west wall
  box('locker', -17.95, -17.4, 0, 2.1, -6.2, -1.2);
  shadowQuad(-17.95, -17.4, -6.2, -1.2, 0.35);
  addObs('g', -18, -17.35, -6.25, -1.15);
  box('wood', -16.4, -15.9, 0, 0.45, -5.8, -1.6);
  addObs('g', -16.45, -15.85, -5.85, -1.55);

  // ================================================================= CAFÉ
  box('slat', -16.8, -12.2, 0, 1.05, 4.0, 4.75);
  box('totem', -16.9, -12.1, 1.05, 1.11, 3.95, 4.85);
  box('steel', -15.6, -14.9, 1.11, 1.55, 4.05, 4.5);
  box('cream', -14.0, -13.7, 1.11, 1.32, 4.2, 4.5);
  shadowQuad(-16.8, -12.2, 4.0, 4.75, 0.4);
  addObs('g', -16.9, -12.1, 3.9, 4.9);
  box('woodDark', -17.9, -12.5, 1.4, 1.46, 3.05, 3.4);
  function tableSet(cx, cz, round = true, key = 'wood') {
    if (round) {
      const top = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20); top.translate(cx, 0.75, cz); push(key, top);
      const leg = new THREE.CylinderGeometry(0.05, 0.05, 0.72, 8); leg.translate(cx, 0.36, cz); push('steel', leg);
    } else {
      box(key, cx - 0.8, cx + 0.8, 0.72, 0.77, cz - 0.4, cz + 0.4);
      for (const dx of [-0.7, 0.7]) for (const dz of [-0.3, 0.3]) box('steel', cx + dx - 0.03, cx + dx + 0.03, 0, 0.72, cz + dz - 0.03, cz + dz + 0.03);
    }
    const seats = round ? [[0, 0.8], [0, -0.8], [0.8, 0], [-0.8, 0]] : [[-0.45, 0.75], [0.45, 0.75], [-0.45, -0.75], [0.45, -0.75]];
    for (const [dx, dz] of seats) {
      const x = cx + dx, z = cz + dz;
      box('chair', x - 0.22, x + 0.22, 0.42, 0.47, z - 0.22, z + 0.22);
      const bz = dz > 0 ? 0.2 : dz < 0 ? -0.2 : 0; const bx = dx > 0 ? 0.2 : dx < 0 ? -0.2 : 0;
      if (bz) box('chair', x - 0.22, x + 0.22, 0.47, 0.85, z + bz - 0.025, z + bz + 0.025);
      else box('chair', x + bx - 0.025, x + bx + 0.025, 0.47, 0.85, z - 0.22, z + 0.22);
      for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) box('steel', x + lx - 0.015, x + lx + 0.015, 0, 0.42, z + lz - 0.015, z + lz + 0.015);
    }
    shadowQuad(cx - 0.9, cx + 0.9, cz - 0.9, cz + 0.9, 0.2);
    addObs('g', cx - 1.05, cx + 1.05, cz - 1.05, cz + 1.05);
  }
  tableSet(-15.6, 8.6);
  tableSet(-12.6, 6.9);
  // potted plants
  function plant(x, z, s = 1, y0 = 0) {
    const pot = new THREE.CylinderGeometry(0.22 * s, 0.17 * s, 0.45 * s, 12); pot.translate(x, y0 + 0.225 * s, z); push('cream', pot);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.IcosahedronGeometry(0.32 * s, 0); f.translate(x + (i - 1) * 0.12 * s, y0 + (0.65 + i * 0.18) * s, z + (i % 2) * 0.1 * s); push('leafDark', f);
    }
    addObs(y0 > 1 ? 'u' : 'g', x - 0.3 * s, x + 0.3 * s, z - 0.3 * s, z + 0.3 * s);
  }
  plant(-17.3, 10.4, 1.6); plant(-7.4, 10.4, 1.3); plant(17.2, 1.6, 1.5); plant(-17.2, -0.4, 1.3, MEZZ);

  // ================================================================= MURO DE SOCIOS frame
  box('woodDark', 11.45, 17.75, 0.25, 4.75, 10.82, 10.92);
  box('steel', 11.6, 17.6, 4.88, 4.96, 10.6, 10.92);
  box('glow', 11.7, 17.5, 4.84, 4.88, 10.62, 10.88);
  aoStrip(V(11.4, 0.005, 10.8), V(17.8, 0.005, 10.8), V(0, 0, -1));

  // ================================================================= EXTERIOR
  floorQuad('grass', -140, 140, -140, 140, -0.03);
  floorQuad('deck', -24, 4, 11.25, 19, 0.004);
  floorQuad('deck', -0.6, 3.6, 19, 40, 0.004);
  floorQuad('asphalt', 6, 60, 22, 60, -0.01);
  addObs('b', -24, 4, 19, 19.3); addObs('b', -24.3, -24, 11, 19.3); addObs('b', 4, 4.3, 11.3, 19.3);
  addObs('b', -24, -18.25, 11, 11.3);
  tableSet(-15.5, 14.8, false); tableSet(-10.5, 15.6, false); tableSet(-5.0, 14.6, false);
  function birch(x, z, s = 1, seed = 1) {
    const r = rng(seed);
    const trunk = new THREE.CylinderGeometry(0.11 * s, 0.17 * s, 9 * s, 8); trunk.translate(x, 4.5 * s, z); push('bark', trunk);
    for (let i = 0; i < 9; i++) {
      const g = new THREE.IcosahedronGeometry((0.9 + r() * 0.9) * s, 1);
      g.scale(1, 1.25, 1);
      g.translate(x + (r() - 0.5) * 2.6 * s, (5.2 + r() * 4.6) * s, z + (r() - 0.5) * 2.6 * s);
      push(i % 3 ? 'leaf' : 'leafDark', g);
    }
    addObs('g', x - 0.3, x + 0.3, z - 0.3, z + 0.3);
  }
  birch(-19.5, 16.8, 1, 3); birch(-1.8, 17.6, 0.95, 7); birch(6.5, 14.2, 1.05, 11); birch(9.6, 17.8, 0.9, 13);
  birch(-26, 13, 1.1, 17); birch(-4, 25, 1, 19); birch(7, 24, 1.1, 23); birch(14.5, 14.0, 1, 29);
  function bush(x, z, s = 1) {
    const g = new THREE.IcosahedronGeometry(0.8 * s, 1); g.scale(1.4, 0.75, 1); g.translate(x, 0.45 * s, z); push('leafDark', g);
  }
  for (let x = 4.8; x < 18; x += 1.7) bush(x, 12.2, 0.9 + ((x * 7) % 3) / 10);
  for (const [x, z] of [[-23, 18], [-21.5, 12.2], [-8, 19.6], [-13, 19.8]]) bush(x, z, 1.1);
  for (const [x, z, s] of [[5.6, 12.5, 0.8], [8.4, 13.0, 1.1], [-1.4, 12.4, 0.7]]) {
    const g = new THREE.IcosahedronGeometry(s, 0); g.scale(1.3, 0.7, 1); g.translate(x, 0.3 * s, z); push('rock', g);
  }
  // distant forest ring
  {
    const r = rng(99);
    for (let i = 0; i < 110; i++) {
      const a = r() * Math.PI * 2; const d = 55 + r() * 45;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z > 20 && Math.abs(x) < 25) continue;
      const h = 9 + r() * 10;
      const g = new THREE.ConeGeometry(2 + r() * 2.5, h, 7); g.translate(x, h / 2, z);
      push(r() < 0.5 ? 'forest' : 'leafDark', g);
    }
  }
  const sky = new THREE.Mesh(skyGeo(), track(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
  track(sky.geometry); scene.add(sky);

  // ================================================================= HOLDS (instanced)
  {
    const r = rng(42);
    const palette = ['#d7263d', '#f2c014', '#2b6cd4', '#8e44d6', '#2eb872', '#151515', '#f1efe9', '#e8702a', '#e05ca8', '#2EAD82', '#3A8FB5'];
    const big = ['#f2c014', '#2EAD82', '#e8702a', '#2b6cd4', '#e05ca8', '#d7263d'];
    const items = [];
    for (const P of panels) {
      for (let i = 0; i < P.count; i++) {
        const u = 0.04 + r() * 0.92, v = 0.06 + r() * 0.9;
        const s = P.kind === 'big' ? 0.12 + r() * 0.12 : 0.045 + Math.pow(r(), 2.2) * 0.16;
        const col = P.kind === 'big' ? big[(r() * big.length) | 0] : palette[(r() * palette.length) | 0];
        items.push({ p: panelPoint(P, u, v), n: P.n, s, col: P.dark && col === '#151515' ? '#f1efe9' : col, spin: r() * Math.PI * 2 });
      }
      if (P.kind !== 'big') {
        const nv = Math.round(P.count / 45);
        for (let i = 0; i < nv; i++) volumes.push({ p: panelPoint(P, 0.1 + r() * 0.8, 0.15 + r() * 0.75), n: P.n, s: 0.25 + r() * 0.35, spin: r() * Math.PI * 2, col: ['#151515', '#f1efe9', '#6d6d6d', '#2EAD82', '#f2c014'][(r() * 5) | 0] });
      }
    }
    const holdGeo = track(new THREE.IcosahedronGeometry(1, 0));
    const holdMat = track(new THREE.MeshLambertMaterial({ flatShading: true }));
    const im = new THREE.InstancedMesh(holdGeo, holdMat, items.length);
    const volGeo = track(new THREE.ConeGeometry(1, 1, 3)); volGeo.rotateX(Math.PI / 2); volGeo.translate(0, 0, 0.5);
    const vm = new THREE.InstancedMesh(volGeo, holdMat, volumes.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qs = new THREE.Quaternion(), sc = new THREE.Vector3(), cc = new THREE.Color();
    items.forEach((h, i) => {
      q.setFromUnitVectors(V(0, 0, 1), h.n); qs.setFromAxisAngle(V(0, 0, 1), h.spin); q.multiply(qs);
      sc.set(h.s, h.s * (0.6 + (i % 5) * 0.1), h.s * 0.5);
      m4.compose(h.p.clone().addScaledVector(h.n, 0.01), q, sc); im.setMatrixAt(i, m4);
      im.setColorAt(i, cc.set(h.col));
    });
    volumes.forEach((h, i) => {
      q.setFromUnitVectors(V(0, 0, 1), h.n); qs.setFromAxisAngle(V(0, 0, 1), h.spin); q.multiply(qs);
      sc.set(h.s, h.s * 0.8, h.s * 0.45);
      m4.compose(h.p, q, sc); vm.setMatrixAt(i, m4);
      vm.setColorAt(i, cc.set(h.col));
    });
    im.frustumCulled = vm.frustumCulled = false;
    scene.add(im, vm);
  }

  // ================================================================= build batches
  for (const [key, geos] of batches) {
    const g = track(mergeGeometries(geos));
    geos.forEach((x) => x.dispose());
    const mesh = new THREE.Mesh(g, M[key].mat);
    mesh.matrixAutoUpdate = false;
    if (key === 'glass' || key === 'shadow' || key === 'ao') mesh.renderOrder = 2;
    scene.add(mesh);
  }

  // ================================================================= textured planes (logo, signs, wall)
  function plane(w, h, mat, x, y, z, ry = 0) {
    const g = track(new THREE.PlaneGeometry(w, h));
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
    return m;
  }
  const totemMat = track(new THREE.MeshLambertMaterial({ color: '#202022' }));
  plane(2.36, 6.1, totemMat, 9.8, 3.1, 9.585, Math.PI);   // faces -z (hall)
  plane(2.36, 6.1, totemMat, 9.8, 3.1, 10.115, 0);
  const facadeMat = track(new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, color: '#f3efe8' }));
  const facadeMesh = plane(6.4, 0.88, facadeMat, 11.2, 6.7, 11.27, 0);
  facadeMesh.visible = false;
  const wallMat = track(new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  plane(6.0, 4.2, wallMat, 14.6, 2.5, 10.8, Math.PI);
  const signs = [
    { text: 'LA CUEVA', w: 2.4, h: 0.6, pos: [14.17, 4.0, -5.8], ry: -Math.PI / 2 },
    { text: 'ZONA KIDS', w: 2.2, h: 0.48, pos: [-14.4, 2.92, -10.62], ry: 0 },
    { text: 'CAFÉ · REFUGIO', w: 2.4, h: 0.44, pos: [-14.5, 2.95, 3.07], ry: 0 },
    { text: '40°', w: 1.3, h: 0.62, pos: [2.5, 6.2, -7.4], ry: 0, accent: true },
  ];
  for (const s of signs) {
    s.mat = track(new THREE.MeshLambertMaterial({ color: '#1b1b1b', side: THREE.DoubleSide }));
    plane(s.w, s.h, s.mat, ...s.pos, s.ry);
  }

  let wallNames = Array.isArray(opts.names) ? opts.names.slice(0, 100) : [];
  let wallHL = opts.highlightName || '';
  let fontReady = false; let isoImg = null; let logoImg = null;
  let wallTex = null;

  // Members wall viewpoint: walk up to your own name (or the first column) so it's readable on a phone.
  // The wall is a 6.0 × 4.2 m plane at x = 14.6, z = 10.8 facing −z; canvas x grows toward world −x.
  function wallView() {
    const names = wallNames || [];
    let idx = wallHL ? names.findIndex((n) => n && n.trim().toLowerCase() === wallHL.trim().toLowerCase()) : -1;
    const narrow = camera.aspect < 1;
    if (idx < 0 && !narrow) return VIEWS['muro-socios'];
    if (idx < 0) idx = 0;
    const col = Math.floor(idx / 20), row = idx % 20;
    const colW = (2048 - 140) / 5, rowH = (1434 - 226 - 34) / 20;
    const u = (70 + (col + 0.5) * colW) / 2048;               // 0..1 across the canvas
    const vv = (226 + (row + 0.5) * rowH) / 1434;              // 0..1 down the canvas
    const tx = 14.6 + 3.0 - u * 6.0;
    const ty = clamp(4.6 - vv * 4.2, 1.2, 3.6);
    const d = narrow ? 3.4 : 4.6;
    return { p: [tx, EYE, 10.8 - d], t: [tx, (ty + EYE) / 2 + 0.25, 10.8] };
  }
  function drawWall() {
    if (!fontReady) return;
    const W = 2048, Hh = 1434;
    const [c, x] = canvas(W, Hh);
    const g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, '#2a2622'); g.addColorStop(1, '#1d1b19');
    x.fillStyle = g; x.fillRect(0, 0, W, Hh);
    if (isoImg) x.drawImage(isoImg, 70, 46, 150, 150 * (isoImg.height / isoImg.width));
    x.fillStyle = '#EAE5DC'; x.font = '700 64px "Space Grotesk", sans-serif'; x.textBaseline = 'alphabetic';
    x.fillText(T.wallTitle[lang], 250, 112);
    x.fillStyle = '#C97C2A'; x.font = '500 34px "Space Grotesk", sans-serif';
    x.fillText(T.wallSub[lang], 252, 160);
    const taken = wallNames.length;
    x.textAlign = 'right'; x.fillStyle = '#EAE5DC'; x.font = '700 64px "Space Grotesk", sans-serif';
    x.fillText(`${taken}`, W - 210, 112);
    x.fillStyle = 'rgba(234,229,220,0.5)'; x.font = '500 40px "Space Grotesk", sans-serif';
    x.fillText('/ 100', W - 70, 112);
    x.textAlign = 'left';
    x.fillStyle = 'rgba(234,229,220,0.18)'; x.fillRect(70, 196, W - 140, 2);
    const cols = 5, rows = 20, top = 226, rowH = (Hh - top - 34) / rows, colW = (W - 140) / cols;
    for (let i = 0; i < 100; i++) {
      const col = Math.floor(i / rows), row = i % rows;
      const px = 70 + col * colW, py = top + row * rowH;
      const num = `Nº ${String(i + 1).padStart(2, '0')}`;
      const name = wallNames[i];
      const isHL = name && wallHL && name.trim().toLowerCase() === wallHL.trim().toLowerCase();
      if (isHL) {
        x.fillStyle = '#C97C2A';
        x.beginPath(); x.roundRect ? x.roundRect(px - 10, py - 3, colW - 16, rowH + 2, 8) : x.rect(px - 10, py - 3, colW - 16, rowH + 2); x.fill();
      }
      x.font = `600 ${isHL ? 26 : 24}px "Space Grotesk", sans-serif`;
      x.fillStyle = isHL ? '#1A1A1A' : name ? '#C97C2A' : 'rgba(234,229,220,0.3)';
      x.fillText(num, px, py + rowH * 0.68);
      const nx = px + 88; const maxW = colW - 112;
      x.font = isHL ? '700 38px "Space Grotesk", sans-serif' : name ? '600 34px "Space Grotesk", sans-serif' : '400 28px "Space Grotesk", sans-serif';
      x.fillStyle = isHL ? '#1A1A1A' : name ? '#EAE5DC' : 'rgba(234,229,220,0.28)';
      let label = name || `— ${T.free[lang]}`;
      while (x.measureText(label).width > maxW && label.length > 3) label = label.slice(0, -2) + '…';
      x.fillText(label, nx, py + rowH * 0.7);
    }
    if (wallTex) { wallTex.image = c; wallTex.needsUpdate = true; }
    else {
      wallTex = track(tex(c, { repeat: false })); wallTex.anisotropy = maxAniso;
      wallMat.map = wallTex; wallMat.needsUpdate = true;
    }
    dirty = true;
  }
  function drawTotem() {
    const W = 512, Hh = 1324; const [c, x] = canvas(W, Hh);
    x.fillStyle = '#232325'; x.fillRect(0, 0, W, Hh);
    noise(x, W, Hh, 5);
    const iw = 330; const ih = isoImg ? iw * (isoImg.height / isoImg.width) : 0;
    if (isoImg) x.drawImage(isoImg, (W - iw) / 2, 250, iw, ih);
    if (logoImg) {
      const sx = 365, sw = logoImg.width - sx, sh = logoImg.height; const dw = 360, dh = dw * (sh / sw);
      x.drawImage(logoImg, sx * (logoImg.width / 1200), 0, sw * (logoImg.width / 1200), sh, (W - dw) / 2, 250 + ih + 40, dw, dh);
    }
    x.fillStyle = '#EAE5DC'; x.font = '500 30px "Space Grotesk", sans-serif'; x.textAlign = 'center';
    if ('letterSpacing' in x) x.letterSpacing = '12px';
    x.fillText('ESCALADA', W / 2 + 6, 250 + ih + 40 + 72 + 46);
    const t = track(tex(c, { repeat: false })); t.anisotropy = maxAniso;
    totemMat.map = t; totemMat.color.set('#ffffff'); totemMat.needsUpdate = true;
    if (logoImg) {
      const lt = track(new THREE.CanvasTexture(logoImg)); lt.colorSpace = THREE.SRGBColorSpace;
      facadeMat.map = lt; facadeMat.needsUpdate = true; facadeMesh.visible = true;
    }
    dirty = true;
  }
  function drawSigns() {
    for (const s of signs) {
      const W = 512, Hh = Math.round(512 * (s.h / s.w)); const [c, x] = canvas(W, Hh);
      x.fillStyle = s.accent ? '#C97C2A' : '#1b1b1b'; x.fillRect(0, 0, W, Hh);
      x.fillStyle = s.accent ? '#1A1A1A' : '#EAE5DC';
      x.font = `700 ${Math.round(Hh * 0.52)}px "Space Grotesk", sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      if ('letterSpacing' in x) x.letterSpacing = '4px';
      x.fillText(s.text, W / 2, Hh / 2 + 2);
      const t = track(tex(c, { repeat: false })); s.mat.map = t; s.mat.color.set('#ffffff'); s.mat.needsUpdate = true;
    }
    dirty = true;
  }
  const fontP = (async () => {
    try {
      if (!document.fonts.check('16px "Space Grotesk"')) {
        const ff = new FontFace('Space Grotesk', `url(${ASSET('SpaceGrotesk-VariableFont_wght.ttf')})`, { weight: '300 700' });
        await ff.load(); document.fonts.add(ff);
      }
      await document.fonts.load('700 32px "Space Grotesk"');
    } catch (e) { /* fall back to sans-serif */ }
  })();
  const imgP = Promise.all([loadImage(ASSET('brand/isotipo-blanco.png')), loadImage(ASSET('brand/logo-blanco-horizontal.png'))]).then(([a, b]) => { isoImg = a; logoImg = b; });

  // ================================================================= controls + camera state
  const st = { pos: V(...INTRO[0].p), yaw: 0, pitch: 0, floor: 0, eyeY: INTRO[0].p[1] };
  function lookYP(from, to) {
    const d = new THREE.Vector3().subVectors(to, from);
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
  }
  Object.assign(st, lookYP(V(...INTRO[0].p), V(...INTRO[0].t)));
  let dirty = true; let tween = null; let introActive = opts.intro !== false;
  let lastPoi = null; const keys = new Set(); const joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
  const look = new Map();

  function startTween(p, t, dur, onDone) {
    const to = V(...p); const yp = lookYP(to, V(...t));
    let dyaw = yp.yaw - st.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    const dist = st.pos.distanceTo(to);
    tween = { from: st.pos.clone(), to, y0: st.yaw, dy: dyaw, p0: st.pitch, p1: yp.pitch, t: 0, dur, arc: dist > 9 ? Math.min(2.6, dist * 0.1) : 0, onDone };
  }
  const introPath = new THREE.CatmullRomCurve3(INTRO.map((k) => V(...k.p)));
  const introLook = new THREE.CatmullRomCurve3(INTRO.map((k) => V(...k.t)));
  function startIntro() { if (introActive) tween = { intro: true, t: 0, dur: 4.6 }; }
  function endIntro(instant) {
    introActive = false; tween = null;
    if (opts.startAt && VIEWS[opts.startAt]) { if (instant) snapTo(opts.startAt === 'muro-socios' ? wallView() : VIEWS[opts.startAt]); else api.goTo(opts.startAt); return; }
    const k = INTRO[INTRO.length - 1];
    if (instant) snapTo(k); else startTween(k.p, k.t, 0.8, () => { st.floor = 0; st.eyeY = EYE; });
  }
  function snapTo(v) {
    st.pos.set(...v.p); Object.assign(st, lookYP(st.pos, V(...v.t)));
    st.floor = v.p[1] - EYE; st.eyeY = v.p[1]; dirty = true;
  }
  function skipIntro() { if (introActive) endIntro(false); }

  function floorAt(x, z, cur) {
    if (x > -10 && x < -8.6 && z > 3 && z < 9) return clamp((9 - z) / 6, 0, 1) * MEZZ;
    if (cur > 1.8) return MEZZ;
    for (const m of mats) if (x > m.x0 && x < m.x1 && z > m.z0 && z < m.z1) return m.h;
    return 0;
  }
  function hits(x, z, list) {
    for (const o of list) {
      const cx = clamp(x, o.x0, o.x1), cz = clamp(z, o.z0, o.z1);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < RADIUS * RADIUS) return true;
    }
    return false;
  }
  function move(dx, dz) {
    const list = st.floor > 1.8 ? obs.u : obs.g;
    if (!hits(st.pos.x + dx, st.pos.z, list)) st.pos.x += dx;
    if (!hits(st.pos.x, st.pos.z + dz, list)) st.pos.z += dz;
    st.floor = floorAt(st.pos.x, st.pos.z, st.floor);
  }
  function checkPoi() {
    let best = null, bd = 1e9;
    for (const id in VIEWS) {
      const v = VIEWS[id].p; const d = Math.hypot(st.pos.x - v[0], st.pos.z - v[2]);
      if (d < bd && Math.abs(st.floor + EYE - v[1]) < 1.5) { bd = d; best = id; }
    }
    if (best && bd < 2.6 && best !== lastPoi) { lastPoi = best; emitPoi(best); }
    else if (lastPoi && best !== lastPoi && bd > 4) lastPoi = null;
  }
  function emitPoi(id) { const p = POIS.find((x) => x.id === id); if (p && opts.onPoi) try { opts.onPoi(p); } catch (e) { console.error(e); } }

  // DOM overlay: joystick + hint
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const joyEl = document.createElement('div'); joyEl.className = 'g3d-joy';
  const knob = document.createElement('div'); knob.className = 'g3d-knob'; joyEl.appendChild(knob);
  const ghost = document.createElement('div'); ghost.className = 'g3d-ghost'; ghost.innerHTML = '<div class="g3d-ghost-knob"></div>';
  const hint = document.createElement('div'); hint.className = 'g3d-hint'; hint.textContent = coarse ? T.hint[lang] : T.hintDesk[lang];
  root.append(joyEl, hint);
  if (coarse) root.appendChild(ghost);
  let hinted = false;
  const dismissHint = () => { if (!hinted) { hinted = true; hint.classList.add('g3d-out'); } };

  const el = renderer.domElement;
  function onDown(e) {
    skipIntro(); dismissHint();
    const r = root.getBoundingClientRect();
    const lx = e.clientX - r.left, ly = e.clientY - r.top;
    if (e.pointerType !== 'mouse' && joy.id === null && lx < r.width * 0.5 && ly > r.height * 0.4) {
      joy.id = e.pointerId; joy.ox = lx; joy.oy = ly; joy.x = joy.y = 0;
      joyEl.style.left = lx + 'px'; joyEl.style.top = ly + 'px'; joyEl.classList.add('g3d-on'); ghost.classList.add('g3d-hide');
      knob.style.transform = 'translate(0px,0px)';
    } else {
      look.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  }
  function onMove(e) {
    if (e.pointerId === joy.id) {
      const r = root.getBoundingClientRect();
      let dx = e.clientX - r.left - joy.ox, dy = e.clientY - r.top - joy.oy;
      const m = Math.hypot(dx, dy), R = 52;
      if (m > R) { dx *= R / m; dy *= R / m; }
      joy.x = dx / R; joy.y = dy / R;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      return;
    }
    const l = look.get(e.pointerId); if (!l) return;
    const k = e.pointerType === 'mouse' ? 0.0042 : 0.0058;
    st.yaw += (e.clientX - l.x) * k; st.pitch = clamp(st.pitch + (e.clientY - l.y) * k, -1.25, 1.25);
    l.x = e.clientX; l.y = e.clientY;
    if (tween && !introActive) tween = null;
    dirty = true;
  }
  function onUp(e) {
    if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyEl.classList.remove('g3d-on'); ghost.classList.remove('g3d-hide'); }
    look.delete(e.pointerId);
  }
  const onKey = (e) => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) return;
    if (e.type === 'keydown') { keys.add(k); skipIntro(); dismissHint(); } else keys.delete(k);
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const blur = () => keys.clear();
  window.addEventListener('blur', blur);

  // resize
  function resize() {
    const w = root.clientWidth || 1, h = root.clientHeight || 1;
    renderer.setSize(w, h, false);
    const aspect = w / h; camera.aspect = aspect;
    const hfov = 78 * DEG;
    camera.fov = clamp((2 * Math.atan(Math.tan(hfov / 2) / aspect)) / DEG, 58, 92);
    camera.updateProjectionMatrix(); dirty = true;
  }
  const ro = new ResizeObserver(resize); ro.observe(root); resize();

  // loop
  let raf = 0, last = 0, alive = true, readyFired = false;
  function update(dt, rawDt) {
    if (tween && tween.intro) {
      tween.t += rawDt / tween.dur;
      const k = Math.min(1, tween.t); const e = k * k * (3 - 2 * k);
      st.pos.copy(introPath.getPoint(e)); st.eyeY = st.pos.y;
      Object.assign(st, lookYP(st.pos, introLook.getPoint(e)));
      dirty = true;
      if (k >= 1) { introActive = false; tween = null; st.floor = 0; st.eyeY = EYE; if (opts.startAt && VIEWS[opts.startAt]) api.goTo(opts.startAt); }
      return;
    }
    if (tween) {
      tween.t += rawDt / tween.dur;
      const k = Math.min(1, tween.t); const e = ease(k);
      st.pos.lerpVectors(tween.from, tween.to, e);
      st.pos.y += Math.sin(Math.PI * e) * tween.arc;
      st.yaw = tween.y0 + tween.dy * e; st.pitch = tween.p0 + (tween.p1 - tween.p0) * e;
      st.eyeY = st.pos.y;
      dirty = true;
      if (k >= 1) { const done = tween.onDone; tween = null; done && done(); }
      return;
    }
    let f = 0, s = 0;
    if (keys.has('w') || keys.has('arrowup')) f += 1;
    if (keys.has('s') || keys.has('arrowdown')) f -= 1;
    if (keys.has('d')) s += 1;
    if (keys.has('a')) s -= 1;
    if (keys.has('arrowleft')) { st.yaw += 1.8 * dt; dirty = true; }
    if (keys.has('arrowright')) { st.yaw -= 1.8 * dt; dirty = true; }
    if (joy.id !== null) { f += -joy.y; s += joy.x; }
    if (f || s) {
      const m = Math.hypot(f, s); if (m > 1) { f /= m; s /= m; }
      const sp = (keys.has('shift') ? 5.2 : 3.1) * dt;
      const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
      move((fx * f + rx * s) * sp, (fz * f + rz * s) * sp);
      checkPoi();
      dirty = true;
    }
    const target = st.floor + EYE;
    if (Math.abs(st.eyeY - target) > 0.002) { st.eyeY += (target - st.eyeY) * Math.min(1, dt * 10); dirty = true; }
    st.pos.y = st.eyeY;
  }
  function frame(t) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const raw = last ? (t - last) / 1000 : 0.016; last = t;
    update(Math.min(0.05, raw), Math.min(0.25, raw));
    if (dirty) {
      camera.position.copy(st.pos); camera.rotation.set(st.pitch, st.yaw, 0);
      renderer.render(scene, camera); dirty = false;
    }
  }
  const onVis = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && alive) { last = 0; dirty = true; raf = requestAnimationFrame(frame); }
  };
  document.addEventListener('visibilitychange', onVis);

  Promise.all([fontP, imgP]).then(() => {
    if (!alive) return;
    fontReady = true; drawWall(); drawTotem(); drawSigns();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!alive || readyFired) return; readyFired = true;
      if (introActive) startIntro();
      opts.onReady && opts.onReady();
    }));
  });
  if (!introActive) endIntro(true);
  raf = requestAnimationFrame(frame);

  const api = {
    goTo(id) {
      const v = id === 'muro-socios' ? wallView() : VIEWS[id]; if (!v) return;
      if (introActive) { introActive = false; tween = null; }
      if (!api) return;
      dismissHint();
      const dist = st.pos.distanceTo(V(...v.p));
      startTween(v.p, v.t, clamp(0.9 + dist * 0.035, 1.0, 1.8), () => {
        st.floor = v.p[1] - EYE; st.eyeY = v.p[1]; lastPoi = id; emitPoi(id);
      });
    },
    _state() { return { x: +st.pos.x.toFixed(2), y: +st.pos.y.toFixed(2), z: +st.pos.z.toFixed(2), floor: +st.floor.toFixed(2) }; },
    _place(x, z, yaw, floor = 0) { tween = null; introActive = false; st.pos.set(x, floor + EYE, z); st.yaw = yaw; st.pitch = 0; st.floor = floor; st.eyeY = floor + EYE; dirty = true; },
    _info() { return { ...renderer.info.render, programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; },
    setWallNames(names, highlightName) {
      wallNames = Array.isArray(names) ? names.slice(0, 100) : [];
      if (highlightName !== undefined) wallHL = highlightName || '';
      drawWall();
    },
    destroy() {
      if (!alive) return; alive = false;
      cancelAnimationFrame(raf); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); window.removeEventListener('blur', blur);
      for (const d of disposables) d.dispose && d.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      renderer.dispose(); renderer.forceContextLoss();
      root.remove();
    },
  };
  return api;
}

let stylesDone = false;
function injectStyles() {
  if (stylesDone) return; stylesDone = true;
  const s = document.createElement('style');
  s.textContent = `
.g3d-root{position:absolute;inset:0;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;background:#1A1A1A}
.g3d-canvas{display:block;width:100%;height:100%;touch-action:none;outline:none}
.g3d-joy{position:absolute;width:112px;height:112px;margin:-56px 0 0 -56px;border-radius:50%;background:rgba(26,26,26,.32);border:1.5px solid rgba(234,229,220,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);pointer-events:none;opacity:0;transition:opacity .12s}
.g3d-joy.g3d-on{opacity:1}
.g3d-knob{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:#EAE5DC;box-shadow:0 4px 14px rgba(0,0,0,.35)}
.g3d-ghost{position:absolute;left:calc(28px + env(safe-area-inset-left));bottom:calc(var(--g3d-bottom, 28px) + env(safe-area-inset-bottom));width:96px;height:96px;border-radius:50%;border:1.5px dashed rgba(234,229,220,.5);background:rgba(26,26,26,.18);pointer-events:none;transition:opacity .2s}
.g3d-ghost.g3d-hide{opacity:0}
.g3d-ghost-knob{position:absolute;left:50%;top:50%;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;background:rgba(234,229,220,.55)}
.g3d-hint{position:absolute;left:50%;bottom:calc(var(--g3d-bottom, 28px) + 120px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:10px 16px;border-radius:999px;background:rgba(26,26,26,.72);color:#EAE5DC;font:500 14px/1.2 "Space Grotesk",system-ui,sans-serif;white-space:nowrap;pointer-events:none;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:opacity .5s, transform .5s}
.g3d-hint.g3d-out{opacity:0;transform:translateX(-50%) translateY(8px)}
.g3d-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:32px;text-align:center;color:#EAE5DC;font:500 16px/1.4 "Space Grotesk",system-ui,sans-serif}
`;
  document.head.appendChild(s);
}
