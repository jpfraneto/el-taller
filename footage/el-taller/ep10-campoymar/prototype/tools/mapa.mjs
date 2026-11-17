// The map of where Campo & Mar is, drawn like their sign (wine lines, cream, the turquoise of the Ancud door).
// Coast: Natural Earth 10m (world-atlas). Lago Llanquihue and the volcano are drawn by hand.
// Run from a folder with the deps (npm i world-atlas topojson-client topojson-simplify d3-geo):
//   node <this file> > public/data/mapa.svg
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(process.cwd() + "/");
const tc = require("topojson-client"), ts = require("topojson-simplify");
const d3 = await import(require.resolve("d3-geo"));
const atlas = ts.simplify(ts.presimplify(require("world-atlas/countries-10m.json")), 1e-6);
const chile = tc.feature(atlas, atlas.objects.countries).features.find((f) => f.properties.name === "Chile");
const cat = JSON.parse(readFileSync(new URL("../public/data/catalogo.json", import.meta.url)));

const W = 420, O = -74.35, E = -72.25, N = -40.45, S = -43.3;
const box = { type: "Polygon", coordinates: [[[O, N], [E, N], [E, S], [O, S], [O, N]]] };
const proj = d3.geoMercator().fitWidth(W, box);
const H = Math.round(d3.geoPath(proj).bounds(box)[1][1]);
proj.clipExtent([[0, 0], [W, H]]);
const camino = d3.geoPath(proj).digits(1);
const xy = (lon, lat) => proj([lon, lat]).map((v) => Math.round(v * 10) / 10);
const esc = (s) => String(s).replace(/[<&"]/g, (c) => ({ "<": "&lt;", "&": "&amp;", '"': "&quot;" }[c]));

const tierra = camino(chile);
const lago = "M" + [[-72.9, -40.99], [-72.8, -41.0], [-72.68, -41.03], [-72.6, -41.08], [-72.57, -41.15], [-72.58, -41.21], [-72.66, -41.24],
  [-72.78, -41.27], [-72.9, -41.3], [-72.97, -41.31], [-73.0, -41.28], [-73.01, -41.25], [-73.03, -41.18], [-73.05, -41.12], [-73.03, -41.05],
  [-72.97, -41.01]].map((p) => xy(...p).join(",")).join("L") + "Z";

// where each point is
const LUGAR = {
  "Ancud": [-73.828, -41.869], "Castro": [-73.762, -42.482], "Chonchi": [-73.774, -42.623], "Quellón": [-73.617, -43.116],
  "Puerto Varas": [-72.985, -41.319], "Llanquihue": [-73.006, -41.257], "Nueva Braunau": [-73.086, -41.316], "Osorno": [-73.135, -40.574],
};
const porCiudad = {};
for (const p of cat.puntos) for (const c of p.ciudad.split(/ y /)) (porCiudad[c] ||= []).push(p);

// the road the cakes travel: Quellón → Castro → Ancud → Chacao → Puerto Montt → Puerto Varas → Osorno
const ruta = [[-73.617, -43.116], [-73.7, -42.85], [-73.774, -42.623], [-73.762, -42.482], [-73.78, -42.2], [-73.72, -41.98], [-73.828, -41.869],
  [-73.52, -41.83], [-73.44, -41.79], [-73.2, -41.6], [-72.942, -41.469], [-72.985, -41.319], [-73.006, -41.257], [-73.08, -40.9], [-73.135, -40.574]];
const rutaD = "M" + ruta.map((p) => xy(...p).join(",")).join("L");

const [vx, vy] = xy(-72.493, -41.1);
const volcan = `<g class="volcan" transform="translate(${vx},${vy})"><path d="M-17,10 L-4,-13 Q0,-17 4,-13 L17,10 Z" class="cono"/>
  <path d="M-8.5,-4.5 L-4,-13 Q0,-17 4,-13 L8.5,-4.5 L5,-6.5 L2,-3.5 L-1,-7 L-4.5,-3.5 Z" class="nieve"/></g>
  <text class="rio" x="${vx}" y="${vy - 21}" text-anchor="middle">volcán Osorno</text>`;

// [marker dx, dy, label dx, dy, anchor]: Puerto Varas, Llanquihue and Nueva Braunau are 8 km apart, so their markers step aside
const ETIQ = {
  "Osorno": [0, 0, 13, 4, "start"], "Llanquihue": [-26, -24, -13, 4, "end"], "Nueva Braunau": [-30, 18, -13, 4, "end"],
  "Puerto Varas": [8, 30, 13, 4, "start"], "Chonchi": [0, 0, -13, 5, "end"], "Quellón": [0, 0, 13, 5, "start"],
};
const cafes = Object.entries(porCiudad).map(([c, ps]) => {
  const [x0, y0] = xy(...LUGAR[c]);
  const [mx, my, dx, dy, an] = ETIQ[c];
  const [x, y] = [x0 + mx, y0 + my];
  const id = c.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
  const guia = mx || my ? `<line x1="${x0}" y1="${y0}" x2="${x}" y2="${y}"/><circle class="aqui" cx="${x0}" cy="${y0}" r="2.4"/>` : "";
  return `<a href="#en-${id}" class="cafe" aria-label="${esc(c)}: ${ps.length} ${ps.length === 1 ? "lugar" : "lugares"}">${guia}
    <circle cx="${x}" cy="${y}" r="10"/><text class="n" x="${x}" y="${y + 4.2}" text-anchor="middle">${ps.length}</text>
    <text class="ciudad" x="${x + dx}" y="${y + dy}" text-anchor="${an}">${esc(c.toUpperCase())}</text></a>`;
}).join("\n");

// the two shops, as little signs like theirs
const LETRERO = { "Ancud": [-74, -72], "Castro": [20, -20] };
const tiendas = cat.tiendas.map((t) => {
  const [x, y] = xy(...LUGAR[t.ciudad]);
  const [dx, dy] = LETRERO[t.ciudad];
  const w = 84, h = 40, lx = x + dx, ly = y + dy;
  return `<a href="https://www.google.com/maps/search/${encodeURIComponent(`${t.direccion}, ${t.ciudad}, Chile`)}" target="_blank" rel="noopener" class="tienda-m">
    <line x1="${x}" y1="${y}" x2="${lx + w / 2}" y2="${ly + h / 2}"/>
    <rect class="placa" x="${lx}" y="${ly}" width="${w}" height="${h}"/>
    <rect class="filete" x="${lx + 3}" y="${ly + 3}" width="${w - 6}" height="${h - 6}"/>
    <text class="t" x="${lx + w / 2}" y="${ly + 19}" text-anchor="middle">${esc(t.ciudad.toUpperCase())}</text>
    <text class="d" x="${lx + w / 2}" y="${ly + 31}" text-anchor="middle">${esc(t.direccion)}</text>
    <circle cx="${x}" cy="${y}" r="5.5"/></a>`;
}).join("\n");

const lbl = (lon, lat, txt, cls, rot = 0) => { const [x, y] = xy(lon, lat); return `<text class="${cls}" x="${x}" y="${y}" text-anchor="middle"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ""}>${txt}</text>`; };
const [rx, ry] = [34, H - 70];

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="mapa-svg" role="img" aria-labelledby="mapa-t">
<title id="mapa-t">Mapa: Campo &amp; Mar en Ancud, Castro y 9 cafés y tiendas del sur de Chile</title>
<defs>
  <pattern id="olas" width="26" height="14" patternUnits="userSpaceOnUse"><path d="M2,9 q4,-5 8,0 t8,0" fill="none" stroke="var(--mar)" stroke-width=".9" opacity=".32"/></pattern>
  <clipPath id="marco"><rect width="${W}" height="${H}"/></clipPath>
</defs>
<g clip-path="url(#marco)">
<rect width="${W}" height="${H}" class="mar"/><rect width="${W}" height="${H}" fill="url(#olas)"/>
<path d="${tierra}" class="anillo a1"/><path d="${tierra}" class="anillo a2"/><path d="${tierra}" class="anillo a3"/>
<path d="${tierra}" class="tierra"/>
<path d="${lago}" class="lago"/>
${lbl(-74.17, -41.2, "Océano Pacífico", "agua", -90)}
${lbl(-73.08, -42.15, "Golfo de Ancud", "agua")}
${lbl(-72.8, -41.12, "Lago", "rio")}${lbl(-72.8, -41.16, "Llanquihue", "rio")}
${lbl(-74.0, -42.2, "Isla Grande de Chiloé", "isla", -76)}
${volcan}
<path d="${rutaD}" class="ruta"/>
${lbl(-73.42, -41.57, "así viajan", "nota-ruta", -33)}${lbl(-73.38, -41.61, "las tortas", "nota-ruta", -33)}
${cafes}
${tiendas}
<g class="rosa" transform="translate(${rx},${ry})"><circle r="17"/><path d="M0,-24 L5,0 L0,5 L-5,0 Z"/><path d="M0,24 L5,0 L0,-5 L-5,0 Z" class="sur"/>
  <text y="-28" text-anchor="middle">N</text></g>
</g>
</svg>
`);
