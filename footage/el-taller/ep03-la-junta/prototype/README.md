# La Junta · plataforma web (prototipo)

App web pensada para el teléfono para La Junta, el centro de escalada de Puerto Varas. Es la propuesta de El Taller, Ep. 03, y se organiza en torno al lema de ellos:

| | Sección | Qué hace |
|---|---|---|
| **Escala** | Gimnasio | Recorrido 3D del gimnasio, hecho a partir de los renders del proyecto. Incluye el Muro de Socios Honorarios. |
| **Comparte** | Juntas | Compartir auto para ir a la roca, buscar compañero de cordada o entrenar con alguien. Avisa si el pronóstico da lluvia. Tiene una sección para escaladores que vienen de afuera, con convenios con hostales. |
| **Sé parte** | Socios | 100 socios honorarios a $100.000 por semestre, con pago adelantado, carnet numerado y su nombre en el muro. |

Además:
- **Entrar con WhatsApp**: sin contraseña ni correo.
- **Español e inglés**: la app se cambia sola a inglés si la persona dice que viene de afuera.

## Correrlo en local

```bash
npm install
npm run db:reset      # crea la base local con datos de demo (marcados is_demo = 1)
npm run dev           # http://localhost:8799 (también desde el teléfono en la misma red: http://<ip-del-mac>:8799)
```

**Login manual (así está hoy):** con `LOGIN_CODE` puesto en `wrangler.jsonc`, la persona escribe su número y aprieta **Abrir WhatsApp**. Se abre un chat con `WA_NUMBER` (hoy +56 9 8549 1126) con el mensaje "Quiero entrar a la app. ¿Me mandas mi código?". Alguien responde a mano con el código fijo (`888888`) y la persona lo escribe en la web. El número no se verifica, así que este modo solo crea cuentas nuevas: un número que ya tiene cuenta no puede entrar con el código fijo (hay que ayudarlo a mano o conectar la API de Meta). Sirve solo para el prototipo.

`/gym-test.html` abre el 3D a pantalla completa. Acepta parámetros, por ejemplo `?poi=muro-socios&names=Ana,Pedro&hl=Pedro`.

## Cómo funciona el login por WhatsApp (con la cuenta de Meta conectada)

1. La persona aprieta **Entrar con WhatsApp**. El servidor crea un código `JUNTA-XXXX` que dura 10 minutos y queda amarrado a una cookie de ese navegador.
2. Se abre WhatsApp con el mensaje ya escrito, y la persona lo envía.
3. El webhook recibe el mensaje, lo que verifica el número, y responde con un código de 6 dígitos que dura 5 minutos.
4. La persona escribe el código **en el mismo navegador** y queda adentro. La sesión dura 60 días.

Detalles de seguridad:
- El código de 6 dígitos solo sirve en el navegador que empezó el login. Así, si alguien manda un link de "envía esto a La Junta", no puede robar la cuenta de quien lo envíe.
- Si un segundo teléfono manda el mismo `JUNTA-XXXX`, se ignora.
- Hay máximo 5 intentos por código y un límite de intentos por IP.

Los códigos se guardan solo como hash.

**Costo:** como la persona escribe primero, la respuesta va dentro de la ventana de servicio de 24 horas de WhatsApp. Esos mensajes no se cobran, según los precios de Meta vigentes desde julio de 2025.

## Conectar el WhatsApp real (Meta Cloud API)

1. En [developers.facebook.com](https://developers.facebook.com), crea una app de tipo Business y agrégale el producto **WhatsApp**. Para probar, Meta da un número de prueba que sirve con hasta 5 teléfonos.
2. Guarda los secretos:
   ```bash
   npx wrangler secret put WA_TOKEN          # token de acceso (en producción, un System User token permanente)
   npx wrangler secret put WA_APP_SECRET     # App secret, para verificar la firma del webhook
   npx wrangler secret put WA_VERIFY_TOKEN   # cualquier texto; el mismo que pongas en Meta
   npx wrangler secret put WA_PHONE_NUMBER_ID
   ```
3. En `wrangler.jsonc`, deja `LOGIN_CODE` en `""` y pon el número de La Junta en `WA_NUMBER` (solo dígitos, por ejemplo `56912345678`).
4. En Meta, configura el webhook así:
   - URL: `https://<tu-dominio>/webhook/whatsapp`
   - Token de verificación: el mismo de `WA_VERIFY_TOKEN`
   - Suscripción: al campo `messages`

## Publicarlo (Cloudflare)

```bash
npx wrangler login
npx wrangler d1 create la-junta      # copia el database_id que imprime a wrangler.jsonc
npm run db:init:remote
npm run db:seed:remote               # opcional: datos de demo
npm run deploy
```

## Lo que falta para producción

- **Pagos reales:** hoy el pago está simulado. Falta usar Mercado Pago Checkout Pro o Flow, y crear al socio solo cuando llegue la confirmación del pago por webhook (ver `socioCheckout` en `src/worker.js`).
- **Contenido real:** cerrar convenios con hostales, confirmar los beneficios de los socios y sacar `DEMO` y los datos de demo.
- **3D fiel al edificio:** reemplazar el 3D aproximado por el modelo del arquitecto, exportado a glTF.

## Estructura

```
src/worker.js        API, login por WhatsApp, webhook de Meta, juntas, socios, pronóstico para las juntas
schema.sql           tablas (D1 / SQLite)
scripts/seed.mjs     datos de demo con fechas relativas a hoy
public/index.html    app (sin build: módulos ES)
public/js/app.js     vistas, navegación, login, simulador de WhatsApp
public/js/i18n.js    textos en español e inglés
public/js/gym3d.js   recorrido 3D (three.js)
public/css/app.css   estilos (marca La Junta: Space Grotesk, crema, naranjo, verde, azul)
```
