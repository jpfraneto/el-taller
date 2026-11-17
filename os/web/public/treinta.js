// Los 30 días 1:1 con JP (el paywall): la hoja, sus estilos y su lógica en un solo lugar. La usan la portada de El Taller
// (index.html) y la de El Taller de Rubén (ruben/index.html). Treinta.abrir(e) la abre; "#30dias" en el link también.
// Usa las variables de color de la página (--y, --ink, --panel, --bubble, --mute, --dim, --line, --wa, --head, --sans).
(function () {
  var CSS = `
  .go { display: flex; align-items: center; justify-content: center; gap: 12px; width: min(460px, 100%);
    padding: clamp(17px, 2.8vh, 24px) 28px; border-radius: 999px; background: var(--y); color: #111; text-decoration: none;
    font: 900 clamp(1.15rem, 1.9vw, 1.5rem)/1 var(--head); text-transform: uppercase;
    box-shadow: 0 0 0 5px rgba(255,210,63,.14), 0 14px 44px -10px rgba(255,210,63,.55); transition: transform .15s ease; }
  .go:hover { transform: translateY(-2px); }
  /* las hojas (gratis y los 30 días): suben desde abajo y caben en una pantalla */
  dialog { margin: auto auto 0; width: 100%; max-width: 600px; max-height: 100dvh; border: 1px solid var(--line); border-bottom: 0;
    border-radius: 26px 26px 0 0; background: var(--panel); color: var(--ink); padding: 0; overflow: auto; overscroll-behavior: contain; }
  @media (min-width: 700px) { dialog { margin: auto; border-radius: 26px; border-bottom: 1px solid var(--line); max-height: 92dvh; } }
  dialog::backdrop { background: rgba(0,0,0,.72); backdrop-filter: blur(3px); }
  dialog:focus, .hoja:focus { outline: none; }
  .hoja { padding: 20px clamp(18px, 4vw, 30px) calc(20px + env(safe-area-inset-bottom)); }
  .hoja > section, .hoja.una { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
  .hoja header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
  .hoja h2 { font: 900 clamp(1.5rem, 6.4vw, 2.1rem)/.95 var(--head); text-transform: uppercase; letter-spacing: -.01em; }
  .hoja p { color: var(--mute); font-size: 15px; line-height: 1.42; }
  .hoja .kick { font: 600 11.5px var(--sans); letter-spacing: .2em; text-transform: uppercase; color: var(--y); margin-bottom: 8px; }
  .hoja .fine { font-size: 12.5px; color: var(--dim); text-align: center; }
  .cerrar, .atras { width: 38px; height: 38px; flex: none; border: 0; border-radius: 50%; background: rgba(255,255,255,.06); color: var(--mute); font-size: 22px; line-height: 1; cursor: pointer; }
  .cerrar:focus, .atras:focus { outline: none; } .cerrar:focus-visible, .atras:focus-visible { outline: 2px solid var(--y); }
  .hoja header .tit { display: flex; align-items: center; gap: 10px; }
  .hoja > section[hidden] { display: none; }
  .hoja .tit h2 { font-size: clamp(1.3rem, 5.6vw, 1.8rem); }
  .go.ancho { width: 100%; padding: 17px 24px; font-size: 1.15rem; }
  .go[disabled] { opacity: .4; box-shadow: none; transform: none; cursor: default; }
  /* los 30 días */
  .treinta { display: grid; grid-template-columns: repeat(30, 1fr); gap: 3px; }
  .treinta i { height: 12px; border-radius: 3px; background: rgba(255,210,63,.22); }
  .treinta i:first-child, .treinta i:last-child { background: var(--y); }
  .precio { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .precio b { font: 900 2.1rem/1 var(--head); }
  .precio span { font: 600 13.5px var(--sans); color: var(--mute); } .precio span b { font: inherit; color: var(--y); }
  .tira { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 0 calc(-1 * clamp(18px, 4vw, 30px)); padding: 2px clamp(18px, 4vw, 30px); scroll-snap-type: x proximity; }
  .tira::-webkit-scrollbar { display: none; }
  .tira button { flex: none; width: 54px; padding: 8px 0 9px; border: 0; border-radius: 14px; background: var(--bubble); color: var(--ink); cursor: pointer; scroll-snap-align: start;
    display: grid; gap: 1px; justify-items: center; font: 600 11px var(--sans); }
  .tira button small { color: var(--dim); font: inherit; text-transform: uppercase; letter-spacing: .06em; }
  .tira button b { font: 900 20px/1.05 var(--head); }
  .tira button.sel { background: var(--y); color: #111; } .tira button.sel small { color: rgba(0,0,0,.6); }
  .tira button:disabled { opacity: .3; cursor: default; text-decoration: line-through; }
  .horas { display: flex; gap: 6px; }
  .horas button { flex: 1; border: 0; border-radius: 12px; padding: 10px; background: var(--bubble); color: var(--ink); font: 600 14px var(--sans); cursor: pointer; }
  .horas button.sel { background: var(--ink); color: #111; }
  .quien { display: flex; align-items: center; gap: 4px; background: var(--bubble); border: 1px solid transparent; border-radius: 16px; padding: 0 14px; }
  .quien:focus-within { border-color: var(--y); }
  .quien span { color: var(--y); font: 800 18px var(--head); }
  .quien input { flex: 1; min-width: 0; background: none; border: 0; color: var(--ink); font: 600 17px/1 var(--sans); padding: 14px 0; outline: none; }
  .quien input::placeholder { color: var(--dim); font-weight: 500; }
  .quien.wa span { display: grid; place-items: center; } .quien.wa svg { width: 20px; height: 20px; fill: var(--wa); }
  .conectar { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 14px; border-radius: 16px; text-decoration: none;
    background: rgba(37,211,102,.12); color: var(--ink); font: 700 15.5px var(--sans); box-shadow: inset 0 0 0 1.5px rgba(37,211,102,.5); }
  .conectar svg { width: 20px; height: 20px; fill: var(--wa); flex: none; }
  .conectar.espera { box-shadow: inset 0 0 0 1.5px rgba(37,211,102,.25); color: var(--mute); }
  .yo.wa { background: rgba(37,211,102,.1); } .yo.wa .f { background: var(--wa); box-shadow: 0 0 0 2px var(--wa); color: #0c0b0a; }
  .yo { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 18px; background: rgba(255,210,63,.09); }
  .yo .f { width: 48px; height: 48px; flex: none; border-radius: 50%; overflow: hidden; background: var(--y); color: #111; display: grid; place-items: center; font: 900 20px var(--head); box-shadow: 0 0 0 2px var(--y); }
  .yo .f img { width: 100%; height: 100%; object-fit: cover; }
  .yo div { flex: 1; min-width: 0; }
  .yo b { display: block; font-weight: 700; font-size: 16px; }
  .yo small { display: block; color: var(--mute); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .yo button { flex: none; border: 0; background: none; color: var(--dim); font: 600 13px var(--sans); cursor: pointer; text-decoration: underline; }
  .resumen { font-size: 14px; color: var(--mute); min-height: 20px; } .resumen b { color: var(--ink); }
  .hoja .err { color: #ff8a7a; font-size: 14px; text-align: center; }
`;
  var HTML = `<dialog id="treinta" aria-labelledby="treinta-t">
  <div class="hoja" tabindex="-1" autofocus>
    <section id="paso1">
      <header><div><p class="kick">El Taller · 1:1</p><h2 id="treinta-t">Trabajar 1:1 con JP<br />durante 30 días</h2></div><button class="cerrar" type="button" data-cerrar aria-label="Cerrar">×</button></header>
      <div class="treinta" id="barra" aria-hidden="true"></div>
      <p>Entro a tu repo el día 1 y salgo el día 30: tú te quedas con todo. El día 1 es el kickoff, dos horas conmigo enfocados en tu negocio.</p>
      <div class="precio"><b id="precio">$1.500.000</b><span id="cupos2"></span></div>
      <button class="go ancho" type="button" id="elegir">Elegir mi día 1</button>
    </section>
    <section id="paso2" hidden>
      <header><div class="tit"><button class="atras" type="button" id="atras" aria-label="Volver">←</button><h2>¿Cuándo partimos?</h2></div><button class="cerrar" type="button" data-cerrar aria-label="Cerrar">×</button></header>
      <label class="quien" id="quien"><span>@</span><input id="ig" placeholder="el instagram de tu negocio (opcional)" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" enterkeyhint="done" aria-label="El Instagram de tu negocio" /></label>
      <div class="yo" id="yo" hidden><div class="f" id="yo-f"></div><div><b id="yo-h"></b><small id="yo-n"></small></div><button type="button" id="yo-x">cambiar</button></div>
      <p class="err" id="err" hidden></p>
      <a class="conectar" id="wa-btn" href="#" target="_blank" rel="noopener" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg><span id="wa-t">Conectar WhatsApp</span></a>
      <label class="quien wa" id="wa-campo" hidden><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span><input id="wa" placeholder="tu WhatsApp" inputmode="tel" autocomplete="tel" aria-label="Tu WhatsApp" /></label>
      <div class="yo wa" id="wa-ok" hidden><div class="f">✓</div><div><b id="wa-n"></b><small>WhatsApp conectado</small></div></div>
      <div class="tira" id="tira"></div>
      <div class="horas" id="horas"></div>
      <p class="resumen" id="resumen"></p>
      <button class="go ancho" type="button" id="pagar" disabled>Elige tu día 1</button>
      <p class="fine">Basta tu WhatsApp o tu Instagram: apenas pagues, te escribo y partimos.</p>
    </section>
  </div>
</dialog>
`;
  var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  document.body.insertAdjacentHTML("beforeend", HTML);
  function $(id) { return document.getElementById(id); }
  function hoja(id) { var d = $(id); if (!d.open) d.showModal(); return d; }
  var dlg = $("treinta");
  dlg.querySelectorAll("[data-cerrar]").forEach(function (b) { b.addEventListener("click", function () { dlg.close(); }); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", function () { if (location.hash) history.replaceState(null, "", location.href.split("#")[0]); });

    // los 30 días, aquí mismo: lo que es, el precio, y después el día 1, tus datos y pagar.
    // Si ya tiene su espacio, "30 días conmigo" y "Entrar" van directo a él.
    var adentro = false, A = null, elegido = null, hora = null, yo = null, wa = { c: "", k: "", numero: "" };
    fetch("/api/yo", { cache: "no-store", credentials: "include" }).then(function (r) {
      if (r.ok) adentro = true;
    }).catch(function () {});
    for (var k = 0; k < 30; k++) $("barra").appendChild(document.createElement("i"));
    function F(x) { return new Date(x + "T12:00:00Z"); }
    function sumar(x, n) { var d = F(x); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
    function fmt(x, o) { return new Intl.DateTimeFormat("es-CL", Object.assign({ timeZone: "UTC" }, o)).format(F(x)).replace(/\./g, ""); }
    function hasta(h) { var q = h.split(":"); return String(+q[0] + 2).padStart(2, "0") + ":" + q[1]; }
    function clp(n) { return "$" + n.toLocaleString("es-CL"); }
    var agenda = fetch("/api/agenda", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      A = d; hora = d.horas[0]; $("precio").textContent = clp(d.precio); return d;
    });
    function paso(n) { $("paso1").hidden = n !== 1; $("paso2").hidden = n !== 2; }
    function abrirMes(e) {
      if (adentro) return;  // tiene cuenta: el link sigue a su espacio
      if (e) e.preventDefault();
      paso(1); hoja("treinta");
    }
    // ¿lo está viendo dentro de Instagram? (su navegador lo dice en el user agent). Afuera no se paga: se manda a Instagram.
    if (location.hash === "#30dias") abrirMes();
    $("elegir").addEventListener("click", function () { agenda.then(function () { pintarDias(); pintarWA(); paso(2); }); });

    // tu WhatsApp: con el código (WhatsApp se abre con el mensaje escrito, lo mandas, y aquí aparece tu número) o, mientras
    // el número de El Taller no esté en la API, escrito a mano
    function verifica() { return A && A.wa && A.wa.verifica; }
    function waListo() { return verifica() ? !!wa.numero : $("wa").value.replace(/\D/g, "").length >= 8; }
    function bonito(n) { var d = n.replace(/\D/g, ""); return d.indexOf("569") === 0 && d.length === 11 ? "+56 9 " + d.slice(3, 7) + " " + d.slice(7) : "+" + d; }
    var sondeo = null;
    function pintarWA() {
      var v = verifica();
      $("wa-campo").hidden = v;
      $("wa-btn").hidden = !v || !!wa.numero;
      $("wa-ok").hidden = !wa.numero;
      if (wa.numero) $("wa-n").textContent = bonito(wa.numero);
      if (v && !wa.numero && !wa.c) pedirCodigo();
      boton();
    }
    function pedirCodigo() {
      try { var g = JSON.parse(sessionStorage.getItem("et-wa") || "null"); if (g && g.c) { wa.c = g.c; wa.k = g.k; $("wa-btn").href = g.link; esperar(); return; } } catch (e) {}
      fetch("/api/wa/codigo", { method: "POST", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d.c) return;
        wa.c = d.c; wa.k = d.k; $("wa-btn").href = d.link;
        try { sessionStorage.setItem("et-wa", JSON.stringify(d)); } catch (e) {}
        esperar();
      }).catch(function () {});
    }
    function esperar() {  // mira cada 2 segundos si el código ya llegó (al volver de WhatsApp, al tiro)
      clearInterval(sondeo);
      function mira() {
        if (document.hidden || !$("treinta").open) return;
        fetch("/api/wa/estado?c=" + encodeURIComponent(wa.c) + "&k=" + encodeURIComponent(wa.k), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
          if (d.numero) { wa.numero = d.numero; clearInterval(sondeo); try { sessionStorage.removeItem("et-wa"); } catch (e) {} pintarWA(); }
        }).catch(function () {});
      }
      sondeo = setInterval(mira, 2000);
      document.addEventListener("visibilitychange", mira);
    }
    $("wa-btn").addEventListener("click", function () { $("wa-btn").classList.add("espera"); $("wa-t").textContent = "Esperando tu mensaje…"; });
    $("wa").addEventListener("input", boton);
    $("atras").addEventListener("click", function () { paso(1); });
    function pintarDias() {
      var t = $("tira"); t.textContent = "";
      A.dias.forEach(function (d) {
        var b = document.createElement("button"); b.type = "button"; b.disabled = !d.libre;
        b.className = d.fecha === elegido ? "sel" : "";
        b.setAttribute("aria-label", fmt(d.fecha, { weekday: "long", day: "numeric", month: "long" }));
        var dia = +d.fecha.slice(8);
        b.innerHTML = "<small>" + fmt(d.fecha, { weekday: "short" }) + "</small><b>" + dia + "</b><small>" + fmt(d.fecha, { month: "short" }) + "</small>";
        b.addEventListener("click", function () { elegido = d.fecha; pintarDias(); });
        t.appendChild(b);
      });
      var h = $("horas"); h.textContent = "";
      A.horas.forEach(function (x) {
        var b = document.createElement("button"); b.type = "button"; b.className = x === hora ? "sel" : "";
        b.textContent = "Kickoff " + x + "–" + hasta(x);
        b.addEventListener("click", function () { hora = x; pintarDias(); });
        h.appendChild(b);
      });
      $("resumen").innerHTML = elegido
        ? "<b>Día 1</b> " + fmt(elegido, { weekday: "long", day: "numeric", month: "short" }) + " · <b>Día 30</b> " + fmt(sumar(elegido, 29), { weekday: "long", day: "numeric", month: "short" })
        : "Toca el día en que quieres partir. Puede ser mañana.";
      boton();
    }
    // se paga aquí mismo (JP, 2026-11-13): el día 1 y una forma de escribirle, su WhatsApp o su @ (uno basta)
    function igTxt() { return $("ig").value.trim().replace(/^@/, "").toLowerCase(); }
    function igOk() { return !!yo || /^[a-z0-9._]{2,30}$/.test(igTxt()); }
    function boton() {
      var p = $("pagar"), contacto = waListo() || igOk();
      p.disabled = !(contacto && elegido);
      p.textContent = !contacto ? "Tu WhatsApp o tu @" : !elegido ? "Elige tu día 1" : "Pagar " + (A ? clp(A.precio) : "");
    }
    // tu @: se busca mientras escribes; aparece tu foto y tu nombre. Si no es cuenta de empresa, se dice cómo cambiarla.
    var busca = 0;
    function pintarYo() {
      var err = $("err");
      $("quien").hidden = !!yo;
      $("yo").hidden = !yo;
      err.hidden = true;
      if (yo) {
        var f = $("yo-f"); f.textContent = "";
        if (yo.foto) { var im = document.createElement("img"); im.src = yo.foto; im.alt = ""; im.referrerPolicy = "no-referrer"; im.onerror = function () { f.textContent = yo.username.charAt(0).toUpperCase(); }; f.appendChild(im); }
        else f.textContent = yo.username.charAt(0).toUpperCase();
        $("yo-h").textContent = "@" + yo.username;
        $("yo-n").textContent = [yo.nombre, yo.seguidores ? yo.seguidores.toLocaleString("es-CL") + " seguidores" : ""].filter(Boolean).join(" · ");
      }
      boton();
    }
    $("ig").addEventListener("input", function () {
      var h = this.value.trim().replace(/^@/, "").toLowerCase(), n = ++busca;
      yo = null; pintarYo();
      if (!/^[a-z0-9._]{2,30}$/.test(h)) return;  // (el @ escrito ya cuenta; la búsqueda solo trae su foto y su nombre)
      setTimeout(function () {
        if (n !== busca) return;
        fetch("/api/ig?u=" + encodeURIComponent(h), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
          if (n !== busca || !d.estado) return;
          yo = d; pintarYo();
          try { localStorage.setItem("et-ig", d.username); } catch (e) {}
        }).catch(function () {});
      }, 450);
    });
    $("yo-x").addEventListener("click", function () { yo = null; $("ig").value = ""; pintarYo(); $("ig").focus(); });
    try { var guardado = localStorage.getItem("et-ig"); if (guardado) { $("ig").value = guardado; $("ig").dispatchEvent(new Event("input")); } } catch (e) {}
    $("pagar").addEventListener("click", function () {
      var err = $("err");
      if (!elegido || !(waListo() || igOk())) return;
      var c = { inicio: elegido, hora: hora, instagram: yo ? yo.username : igTxt() };
      if (verifica()) c.wa = { c: wa.c, k: wa.k }; else c.whatsapp = $("wa").value;
      // el secreto de este navegador: al volver de Mercado Pago, con el pago aprobado, entras (también queda en una cookie)
      var t = ""; crypto.getRandomValues(new Uint8Array(24)).forEach(function (x) { t += ("0" + x.toString(16)).slice(-2); });
      try { localStorage.setItem("et-pago", t); } catch (e) {}
      c.t = t;
      var b = $("pagar"); b.disabled = true; b.textContent = "Abriendo Mercado Pago…";
      fetch("/api/pagar", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(c) })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "Algo falló"); return d; }); })
        .then(function (d) { location.href = d.url; })
        .catch(function (e) { err.textContent = e.message; err.hidden = false; boton(); });
    });


  window.Treinta = { abrir: abrirMes, adentro: function () { return adentro; } };
})();
