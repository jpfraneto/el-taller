# arboldelilith.cl · 3 pasos

Tu página queda en **https://arboldelilith.cl**, en tu cuenta, a tu nombre. Tu dominio ya es tuyo (NIC Chile,
pagado hasta el 28 de marzo de 2028). Si algo no se ve como aquí dice, para y mándale una foto a JP.

## 1 · Cloudflare (gratis)
1. Crea tu cuenta en **https://dash.cloudflare.com/sign-up** y verifica tu correo.
2. Aprieta **Onboard a domain** (o **Add a domain**), escribe **arboldelilith.cl**, elige el plan **Free** y sigue
   con **Continue** hasta que aparezcan **dos nombres** terminados en **.ns.cloudflare.com**. Deja esa pestaña abierta.

## 2 · NIC Chile
1. Entra a **https://clientes.nic.cl** → **Mis dominios** → **arboldelilith.cl**.
2. En **Configuración técnica → Servidores DNS**, pon los dos nombres de Cloudflare y guarda. No toques DNSSEC.

Cloudflare te avisa por correo cuando está listo (de minutos a unas horas). No hace falta esperar para el paso 3.

## 3 · Tu computador
En el computador donde va a vivir tu Taller (el que tiene Claude): abre la **Terminal** (⌘ + espacio, escribe
*Terminal*, Enter), pega la línea que te mandó JP y aprieta Enter:

```
curl -fsSL https://jpfraneto.com/taller/s/<su-enlace>.sh | bash
```

Cuando se abra Cloudflare en el navegador, aprieta **Allow**. Al final aparece tu **link privado**: es la llave de tu
panel, guárdalo en tus Notas y no lo compartas. Si lo pierdes: `bash ~/ElTaller/arbol-de-lilith/sitio/publicar.sh --nuevo-link`.

Si tú o tu amigo cambian algo de la página, pega la misma línea otra vez para publicarlo.

---

**Lo que falta para recibir personas de verdad.** La página parte en modo prueba: el código para entrar se ve en
pantalla (en vez de llegar por WhatsApp) y los pagos no cobran. Se termina cuando tu amigo tenga su WhatsApp y
conectes tu Mercado Pago. Hasta entonces, compártela para mostrarla, no para inscribir.
