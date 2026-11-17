# Refugio Bruma · prototipo para Umbral Sur (El Taller, Ep. 05)

**Publicado: https://umbralsur.jpfraneto.com** (Cloudflare Worker `umbral-sur-app`, solo archivos estáticos, sin base de datos).
Local: `npm install && npm run dev` → http://localhost:8805 · Publicar: `npm run deploy`.

Una página para el teléfono que responde lo que la web de ellos deja abierto:

| Sección | Qué resuelve |
|---|---|
| **Portada** | Una casa, un precio, una frase: "92 millones, llave en mano." Lo construye Iván, desde Villarrica. |
| **Recórrelo** | "¿Cómo la experimento?": sus renders en el orden en que caminarías la casa (Llegas → salón → doble altura → cocina → baño de visitas → baño → altillo → de noche), cada uno con lo que trae, sacado de sus partidas. |
| **El muro** | "¿Por qué refugio y no casa?": un corte del muro; tocas cada capa (madera termotratada, panel SIP, aislación de eucalipto de Aislacor, eucalipto australiano, termopanel, radier aislado) y te explica para qué está. |
| **Tres formas de tenerlo** | En vez de 9 casillas: Amoblado $92M · Terminado sin amoblar $79,6M · A tu medida (se conversa). Debajo, "¿Dónde van los 92 millones?": sus 9 partidas en orden de obra, en palabras simples. |
| **Cupos de obra** | "Pocos, a propósito": los refugios que Iván construye al año (4 = cifra de ejemplo, marcada en la página; confirmar). El primero es el real: Refugio Niebla, Coyhaique, vendido. Tocas un cupo libre y entra en el mensaje de WhatsApp. |
| **Iván** | Su cara, su oficio, la oficina (Pedro Montt 365, of. 01), "¿Tienes terreno?" y WhatsApp con el mensaje armado ("Me interesa la versión amoblada (92 millones). Estoy buscando terreno…"). |

Todo el contenido está en `public/js/app.js` (FACTS, ROOMS, LAYERS, STAGES, OPTIONS). Imágenes: renders de umbralsur.com (`public/img/`, desde `../assets/site/`).

**Por confirmar con Iván** (marcado "confirmar" en el código):
- El número de WhatsApp: usamos el de su página Contacto (+56 9 6554 6992); el botón del pie de su web va a …6229.
- m² y dormitorios: "50 m² + 10 m² de terraza, 2 dormitorios, 1 baño" son los valores por defecto de su propio formulario.
- Tabiquería: $22M (su calculadora, suma 92 = el precio de la portada); la tarjeta dice $12M.
- El orden de las capas del muro es referencial.

Grabaciones para el reel 3/3: `../record_prototype.py` → `../assets/rec/` (portada, recorrido, muro, precio, cupos, ivan).
