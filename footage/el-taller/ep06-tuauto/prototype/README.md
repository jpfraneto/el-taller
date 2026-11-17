# TuAuto · prototipo (El Taller, Ep. 06)

**Publicado: https://tuauto.jpfraneto.com** (Cloudflare Worker `tuauto-app` + KV `tuauto-solicitudes` + Workers AI).
Local: `npm install && npm run dev` (usa `--remote`: la IA y el KV son los de Cloudflare) → http://localhost:8806 · Publicar: `npm run deploy`.

| Parte | Qué hace |
|---|---|
| **Portada (una pantalla)** | Estilo minimal oscuro. Fondo: sus fotos de estudio (web), una tras otra, cada una con su etiqueta de precio (click → ficha). Un botón principal: **Subir foto de mi auto**; uno sutil: **Quiero comprar un auto** → Comprar. Abajo: las marcas del stock (click → filtra). Arriba: Comprar · El Duelo · Nosotros. |
| **Nosotros** (`/#nosotros`) | Las personas, desde su Instagram: Patricio Vergara (CEO), Sergio Hueichaqueo (Operaciones y Adquisiciones), Rodrigo Chacón; tira "Del Instagram" con links a sus reels; dirección y horario. Fotos: `public/img/ig/` (capturas de sus portadas/reels). |
| **¿Cuánto vale tu auto?** (modal) | Foto → la IA reconoce marca, modelo, generación, color y cómo se ve (`POST /api/mirar`, no guarda nada) → la persona pone año y km → **"autos como el tuyo se publican entre $X y $Y"**, con el gráfico de los avisos y los autos de TuAuto del mismo modelo → elige *Te lo compramos hoy* o *Lo vendemos por ti* (sus dos caminos, con sus palabras) → **WhatsApp con el mensaje armado** + un código de 4 letras. "Probar con uno de ejemplo" usa una foto de su stock. |
| **La talla** (2026-11-09) | Después del rango: "Lo que dice tu auto", una talla sobre el modelo (te agarra pa'l hueveo) escrita por `anthropic/claude-sonnet-5.5` con lo que reconoció la foto (~1,2 s, respaldo: la frase del modelo de visión) + **Compartir mi tasación**: imagen 1080×1350 (foto, talla, rango, link) por el menú de compartir del teléfono o descarga. Es el mecanismo viral del que habla JP en el take. |
| **Parte de pago** | Debajo del rango: 3 autos del stock un poco más caros que el suyo, con la diferencia aproximada. |
| **Comprar** (`/#stock`, stock 1:1) | Los 53 autos de automotriztuauto.cl (fotos, precio con financiamiento, valor contado, pie, garantía, equipamiento), todos a la vista, filtros por tipo, búsqueda y orden. "¡Me interesa!" → su WhatsApp. |
| **El Duelo** (`/#duelo`) | Dos autos del stock corren 4 rondas (precio, km, año, motor). Link compartible `/#duelo=slugA,slugB`. |
| **/equipo** (la bandeja) | Cada "Mandar a TuAuto" llega como tarjeta: foto, modelo, año, km, rango, qué quiere, código. Asignar (Sergio / Patricio / Ventas) y estado (Nueva → Tomada → Revisión → Cerrada). Clave: `../.equipo_key`. |

**Archivos**
- `src/worker.js`: las APIs. Lector de fotos: **OpenRouter, `google/gemini-2.5-flash-lite`** (secreto `OPENROUTER_API_KEY`; ~US$0,21 por 1.000 fotos, 14/16 en la prueba del 2026-11-09), con `gemini-3.1-flash-lite` de respaldo y Workers AI si OpenRouter falla. Límite: 40 fotos por IP al día.
- `public/js/precio.js`: el cálculo del rango (en el navegador). `public/data/precios.json` = `../research/precios_referencia.json`.
- `public/js/tasar.js` (el flujo), `duelo.js`, `app.js` (stock y detalle), `equipo.js`.
- Stock y fotos: `../scrape_stock.py` (re-copiar: `python3 ../scrape_stock.py --fetch --images`).

**Cómo se calcula el rango** (`precio.js`): precios de avisos por año para ese modelo + los autos de TuAuto del mismo modelo →
precio al año pedido (interpolado; fuera de los datos, −9 %/año hacia atrás) → ajuste por km (±1,2 % cada 10.000 km sobre/bajo
15.000 km/año, tope −14 %/+6 %) y por cómo se ve (impecable +2 %, con detalles −5 %, para reparar −15 %) → ±6 % (±8–11 % si hay pocos datos).

**Por confirmar con TuAuto**
- El WhatsApp: usamos 56966492665 (botones de vender y de cada auto en su web). Hay otros dos números en su sitio.
- Nombres del equipo en /equipo (Sergio, Patricio, Ventas) y si quieren que la tarjeta pida el teléfono.
- Que el rango se muestre así ("se publican entre…", sin oferta). La oferta es de ellos.
- Las solicitudes llegan a su WhatsApp real: si el reel se mueve, les llegan personas de verdad.
