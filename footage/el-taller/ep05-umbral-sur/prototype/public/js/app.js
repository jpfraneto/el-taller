// Refugio Bruma · prototype for Umbral Sur (El Taller, Ep. 05).
// Every fact here comes from umbralsur.com (partidas, prices, materials) or their Instagram.
// Things still to confirm with Iván are marked "confirmar".

// The number shown on their Contacto page. (Their footer button points to …6229: confirmar cuál es el bueno.)
const WA = "56965546992";

// confirmar: m² and rooms are the defaults of their own quote form + the beds listed in "Partidas complementarias".
const FACTS = ["50 m² + 10 m² de terraza", "2 dormitorios", "1 baño", "Hot tub incluido"];

// The walk: their renders, in the order you'd walk the house.
const ROOMS = [
  { img: "llegada", name: "Llegas", text: "Madera termotratada negra por fuera. En la terraza, el hot tub ya está incluido." },
  { img: "salon", name: "El salón", text: "Estufa a combustión en voladizo y lámparas de diseño. Por dentro, todo es eucalipto australiano." },
  { img: "doble", name: "La doble altura", text: "El salón sube hasta el techo. La escalera lleva al altillo." },
  { img: "cocina", name: "La cocina", text: "Muebles hechos a medida, cubierta de cuarzo, repisas iluminadas. Refrigerador y cafetera incluidos." },
  { img: "bano-visitas", name: "Baño de visitas", text: "Bajo la escalera: ningún metro se pierde." },
  { img: "bano", name: "El baño", text: "Tina exenta y artefactos de línea premium." },
  { img: "altillo", name: "El altillo", text: "Cama de 2 plazas, ropa de cama y veladores en voladizo: incluidos." },
  { img: "noche", name: "De noche", text: "Termopanel en cada ventana: el bosque se queda afuera, y el frío también." },
];

// The wall, outside → inside (from the partidas Terminaciones, Tabiquería, Obra gruesa + the Aislacor alliance).
const LAYERS = [
  { id: "ext", name: "Madera termotratada", color: "#1d1c1a", w: 34,
    text: "El revestimiento exterior: madera tratada con calor y sellada con impermeabilizante negro. Así aguanta la lluvia del sur." },
  { id: "sip", name: "Panel SIP", color: "#c9b48e", w: 40,
    text: "El muro es un panel estructural aislado: estructura y aislación en una sola pieza, de alto estándar térmico y acústico." },
  { id: "eu", name: "Aislación de eucalipto", color: "#a98e64", w: 70,
    text: "Fibra natural de eucalipto, de Aislacor. Renovable, y mantiene el refugio tibio todo el año." },
  { id: "int", name: "Eucalipto australiano", color: "#e2c79b", w: 28,
    text: "Lo que tocas por dentro: madera noble en muros y cielos. Por eso se siente cálido, no solo se ve." },
];
const EXTRA = [
  { id: "win", name: "Ventana termopanel", text: "Doble vidrio con aire entre medio: ves el bosque y no sientes el frío." },
  { id: "floor", name: "Radier aislado", text: "Fundaciones y radier armado, con aislación bajo el piso. El frío tampoco sube." },
];

// Their 9 partidas (umbralsur.com calculator, IVA incluido), in construction order, said plainly.
const STAGES = [
  { name: "Permisos y planos", price: 2700000, text: "Los papeles para que tu refugio quede regularizado." },
  { name: "Fundaciones y estructura", price: 12500000, text: "Radier armado y aislado, la estructura principal." },
  { name: "Muros, ventanas y puertas", price: 22000000, text: "Paneles SIP, ventanas termopanel, puertas estilo galpón." },
  { name: "Agua, luz y alcantarillado", price: 5000000, text: "Redes eléctricas, agua potable, fosa séptica." },
  { name: "Revestimientos", price: 28000000, text: "Madera termotratada afuera, eucalipto australiano adentro, pisos y cielos." },
  { name: "Iluminación", price: 2300000, text: "Lámparas de diseño, luz ambiental, adentro y afuera." },
  { name: "Baños y cocina", price: 5000000, text: "Artefactos de baño y cocina." },
  { name: "Muebles de cocina", price: 2100000, text: "Hechos a medida, con cubierta de cuarzo." },
  { name: "Todo para llegar a vivir", price: 12400000, furn: true,
    text: "Camas, ropa de cama, sofá, combustión, hot tub, refrigerador, cafetera, losa, bancas." },
];
const FULL = STAGES.reduce((s, x) => s + x.price, 0);
const BARE = STAGES.filter((x) => !x.furn).reduce((s, x) => s + x.price, 0);

const OPTIONS = [
  { id: "amoblado", name: "Amoblado", fem: "amoblada", tag: "Listo para habitar", price: FULL,
    text: "Llegas con tu maleta. Camas, sofá, hot tub, cocina equipada: todo adentro." },
  { id: "terminado", name: "Terminado", fem: "terminada", tag: "Sin amoblar", price: BARE,
    text: "Construido y terminado, con baños y cocina. Los muebles los pones tú." },
  { id: "medida", name: "A tu medida", tag: "Otro tamaño, otro terreno", price: null,
    text: "¿Más metros, otra habitación? Eso no se resuelve en un formulario: se conversa con Iván." },
];
const LAND = ["Sí, tengo", "Estoy buscando", "Todavía no"];

// Build capacity: the scarce thing. confirmar con Iván: how many refugios a year he can build well (EXAMPLE number),
// and when each one starts. The first slot is the real one: the refugio sold in July 2026, going to Coyhaique.
const CAPACITY = { year: 2027, n: 3, example: true };
const SLOTS = [
  { name: "Refugio Niebla", where: "Coyhaique", status: "taken", label: "Vendido · ingeniería lista" },
  ...Array.from({ length: CAPACITY.n - 1 }, (_, i) => ({ name: `Cupo ${i + 2}`, status: "free", label: "Disponible" })),
];

// Build progress of slot 1, from their own posts: sold Jul 23, engineering done Aug 25. The rest: not shown yet.
const BUILD = [
  { name: "Vendido", when: "Julio 2026", done: true, note: "«¡Vendimos nuestro primer refugio!»" },
  { name: "Ingeniería", when: "Agosto 2026", done: true, note: "«Terminamos la ingeniería»" },
  { name: "Prefabricación", when: "Próximo", done: false, note: "Paneles SIP en taller" },
  { name: "Montaje en Coyhaique", when: "", done: false, note: "" },
  { name: "Entrega de llaves", when: "", done: false, note: "" },
];

const $ = (s) => document.querySelector(s);
const clp = (n) => "$" + n.toLocaleString("es-CL");
const mill = (n) => (n / 1e6).toLocaleString("es-CL", { maximumFractionDigits: 1 });
const state = { opt: "amoblado", land: null, slot: null };

// facts
$("#facts").innerHTML = FACTS.map((f) => `<span>${f}</span>`).join("");

// walk
const walk = $("#walk");
walk.innerHTML = ROOMS.map((r, i) => `
  <figure class="room" data-i="${i}">
    <img src="/img/${r.img}.webp" alt="${r.name}" loading="${i < 2 ? "eager" : "lazy"}">
    <figcaption><span class="step">${i + 1} / ${ROOMS.length}</span><b>${r.name}</b><p>${r.text}</p></figcaption>
  </figure>`).join("");
$("#wdots").innerHTML = ROOMS.map((_, i) => `<i data-i="${i}"></i>`).join("");
const dots = [...document.querySelectorAll("#wdots i")];
const goRoom = (i) => walk.scrollTo({ left: i * walk.clientWidth, behavior: "smooth" });
const curRoom = () => Math.round(walk.scrollLeft / walk.clientWidth);
const markDot = () => dots.forEach((d, i) => d.classList.toggle("on", i === curRoom()));
walk.addEventListener("scroll", () => requestAnimationFrame(markDot), { passive: true });
dots.forEach((d) => d.addEventListener("click", () => goRoom(+d.dataset.i)));
$("#wprev").onclick = () => goRoom(Math.max(0, curRoom() - 1));
$("#wnext").onclick = () => goRoom(Math.min(ROOMS.length - 1, curRoom() + 1));
markDot();

// wall: a section drawing, layers from outside (left) to inside (right), a window and the floor slab
function drawWall() {
  const svg = $("#wallsvg");
  let x = 60, g = "";
  const top = 20, h = 220;
  // ground + slab
  g += `<rect x="0" y="${top + h}" width="360" height="40" fill="#3a3632"/>`;
  g += `<rect class="hit" data-id="floor" x="40" y="${top + h - 4}" width="300" height="24" rx="2" fill="#8f877c"/>`;
  g += `<g stroke="#5f5850" stroke-width="1">${[...Array(14)].map((_, i) => `<line x1="${48 + i * 21}" y1="${top + h + 2}" x2="${58 + i * 21}" y2="${top + h + 18}"/>`).join("")}</g>`;
  for (const L of LAYERS) {
    g += `<rect class="hit" data-id="${L.id}" x="${x}" y="${top}" width="${L.w}" height="${h - 4}" fill="${L.color}"/>`;
    if (L.id === "eu") g += `<g class="fib" stroke="#7c6646" stroke-width="1.4" fill="none">${[...Array(9)].map((_, i) =>
      `<path d="M${x + 6} ${top + 14 + i * 23} q 14 -10 29 0 t 29 0"/>`).join("")}</g>`;
    if (L.id === "ext") g += `<g stroke="#2e2c29" stroke-width="2">${[...Array(4)].map((_, i) =>
      `<line x1="${x + 8 + i * 7}" y1="${top}" x2="${x + 8 + i * 7}" y2="${top + h - 4}"/>`).join("")}</g>`;
    if (L.id === "int") g += `<g stroke="#c9ad80" stroke-width="1.5">${[...Array(3)].map((_, i) =>
      `<line x1="${x + 7 + i * 7}" y1="${top}" x2="${x + 7 + i * 7}" y2="${top + h - 4}"/>`).join("")}</g>`;
    x += L.w;
  }
  // window, inside the wall's upper part
  g += `<g class="hit" data-id="win"><rect x="60" y="${top + 30}" width="${x - 60}" height="58" fill="#2a2a28"/>
        <rect x="${(60 + x) / 2 - 22}" y="${top + 36}" width="12" height="46" fill="#9fb4bf" opacity=".85"/>
        <rect x="${(60 + x) / 2 - 6}" y="${top + 36}" width="6" height="46" fill="#dfe8ec" opacity=".35"/>
        <rect x="${(60 + x) / 2 + 4}" y="${top + 36}" width="12" height="46" fill="#9fb4bf" opacity=".85"/></g>`;
  // rain outside, warm light inside
  g += `<g stroke="#8a9aa3" stroke-width="1.2" opacity=".6">${[...Array(10)].map((_, i) =>
    `<line x1="${8 + (i % 5) * 10}" y1="${top + 10 + i * 20}" x2="${3 + (i % 5) * 10}" y2="${top + 24 + i * 20}"/>`).join("")}</g>`;
  g += `<circle cx="${x + 46}" cy="${top + 60}" r="26" fill="#f2c46d" opacity=".25"/><circle cx="${x + 46}" cy="${top + 60}" r="9" fill="#f2c46d"/>`;
  svg.innerHTML = g;
  svg.querySelectorAll(".hit").forEach((el) => el.addEventListener("click", () => pickLayer(el.dataset.id)));
}
function pickLayer(id) {
  const L = [...LAYERS, ...EXTRA].find((l) => l.id === id);
  const n = [...LAYERS, ...EXTRA].indexOf(L) + 1;
  document.querySelectorAll("#wallsvg .hit").forEach((el) => el.classList.toggle("sel", el.dataset.id === id));
  $("#layercard").innerHTML = `<span class="n">${n}</span><div><b>${L.name}</b><p>${L.text}</p></div>`;
  $("#layercard").classList.remove("pop"); void $("#layercard").offsetWidth; $("#layercard").classList.add("pop");
}
drawWall();
pickLayer("ext");

// options + breakdown
function renderOptions() {
  $("#options").innerHTML = OPTIONS.map((o) => `
    <button class="opt ${state.opt === o.id ? "on" : ""}" data-id="${o.id}">
      <span class="tag">${o.tag}</span>
      <b>${o.name}</b>
      ${o.price ? `<span class="p">${mill(o.price)} <small>millones</small></span>` : `<span class="p talk">Conversemos</span>`}
      <p>${o.text}</p>
    </button>`).join("");
  document.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => { state.opt = b.dataset.id; update(); }));
  const furnished = state.opt !== "terminado";
  $("#stages").innerHTML = STAGES.map((s) => `
    <li class="${s.furn && !furnished ? "off" : ""}"><div><b>${s.name}</b><p>${s.text}</p></div><span>${clp(s.price)}</span></li>`).join("")
    + `<li class="total"><div><b>Total</b></div><span>${clp(furnished ? FULL : BARE)}</span></li>`;
  $("#bdtotal").textContent = mill(furnished ? FULL : BARE);
}
function renderLand() {
  $("#land").innerHTML = LAND.map((l) => `<button class="chip ${state.land === l ? "on" : ""}">${l}</button>`).join("");
  document.querySelectorAll("#land .chip").forEach((b) => b.addEventListener("click", () => {
    state.land = state.land === b.textContent ? null : b.textContent; update();
  }));
}
function waLink() {
  const o = OPTIONS.find((x) => x.id === state.opt);
  let m = "Hola Iván, vi el Refugio Bruma. ";
  m += o.price ? `Me interesa la versión ${o.fem} (${mill(o.price)} millones). ` : "Me interesa un refugio a mi medida. ";
  if (state.land === "Sí, tengo") m += "Tengo terreno en ___. ";
  else if (state.land === "Estoy buscando") m += "Estoy buscando terreno. ";
  else if (state.land === "Todavía no") m += "Todavía no tengo terreno. ";
  if (state.slot) m += `Quiero reservar el ${state.slot.toLowerCase()} de ${CAPACITY.year}. `;
  m += "¿Cuándo podemos conversar?";
  return `https://wa.me/${WA}?text=${encodeURIComponent(m)}`;
}
function renderSlots() {
  $("#slotyear").textContent = CAPACITY.year;
  $("#slotn").textContent = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho"][CAPACITY.n] || CAPACITY.n;
  const free = SLOTS.filter((x) => x.status === "free").length;
  $("#slots").innerHTML = SLOTS.map((x, i) => `
    <button class="slot ${x.status} ${state.slot === x.name ? "on" : ""}" data-name="${x.name}" ${x.status === "taken" ? "disabled" : ""}>
      <span class="sn">${i + 1}</span>
      <b>${x.name}</b>
      <small>${x.where ? x.where + " · " : ""}${state.slot === x.name ? "Tuyo, si conversamos" : x.label}</small>
    </button>`).join("");
  $("#slotnote").innerHTML = `Quedan <b>${free} de ${CAPACITY.n}</b>. Toca uno para pedirlo.` +
    (CAPACITY.example ? " <i>(Cifra de ejemplo: la define Umbral Sur.)</i>" : "");
  document.querySelectorAll(".slot.free").forEach((b) => b.addEventListener("click", () => {
    state.slot = state.slot === b.dataset.name ? null : b.dataset.name; update();
  }));
}
function update() {
  renderOptions();
  renderSlots();
  renderLand();
  const o = OPTIONS.find((x) => x.id === state.opt);
  $("#barname").textContent = o.price ? `Bruma ${o.name.toLowerCase()}` : "Bruma a tu medida";
  $("#barprice").textContent = o.price ? clp(o.price) : "Conversemos";
  $("#wa").href = $("#wa2").href = waLink();
}
update();

// the bar appears after the hero
const bar = $("#bar");
const seen = { hero: true, ivan: false };
const syncBar = () => bar.classList.toggle("show", !seen.hero && !seen.ivan);
new IntersectionObserver(([e]) => { seen.hero = e.isIntersecting; syncBar(); }, { threshold: 0.15 }).observe($(".hero"));
new IntersectionObserver(([e]) => { seen.ivan = e.isIntersecting; syncBar(); }, { threshold: 0.2 }).observe($(".ivan-txt"));

// avance
{
  const done = BUILD.filter((s) => s.done).length, pct = Math.round((done / BUILD.length) * 100);
  $("#apct").textContent = pct + "%";
  $("#astages").innerHTML = BUILD.map((s, i) => `
    <li class="${s.done ? "done" : i === done ? "next" : ""}"><span class="dot">${s.done ? "✓" : i + 1}</span>
      <div><b>${s.name}</b>${s.when ? `<small>${s.when}</small>` : ""}${s.note ? `<p>${s.note}</p>` : ""}</div></li>`).join("");
  const bar = $("#abar");
  new IntersectionObserver((es, o) => es.forEach((e) => { if (e.isIntersecting) { bar.style.width = pct + "%"; o.disconnect(); } }),
    { threshold: 0.4 }).observe($("#avance"));
}
