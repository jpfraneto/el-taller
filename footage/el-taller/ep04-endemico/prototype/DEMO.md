# Guion de demo (para el 3/3 y para mostrárselo a Seba)

Antes: `npm run db:reset` y `npm run dev`. Teléfono en la misma red → `http://<ip-del-mac>:8800`. Computador en `#/coach/planilla` con la sesión de Seba.

1. **La puerta.** Muestra el afiche (`#/puerta`, impreso o en pantalla). "Esto va en la puerta."
2. **El alumno llega.** Con tu teléfono escanea el QR → entra con tu número → código **888888** → pantalla verde **ADENTRO** y abajo **"Hoy te toca: Día 3"** con el Warmup, la Serie 1 y la Serie 2 (las vueltas, x4 / x3, arriba de cada una). La app sabe qué día te toca: tu 3ª clase de la semana es el Día 3.
3. **La planilla de Seba se llena sola.** En el computador, en la pestaña Asistencia, aparece tu fila al final (parpadea en verde). "Seba no tocó nada."
4. **Inicio.** Una sola pantalla: el día que te toca, el calendario del mes (verde = viniste) y una línea con "pagado hasta". **Agendar:** toca un día del calendario → eliges la hora → queda marcado con la hora. Seba ve en Hoy quién viene a cada hora. Historial: cada vez que viniste y tus pagos.
5. **Pagar.** En Inicio: "Pagar $100.000 con Mercado Pago" → checkout de Mercado Pago → vuelve a "PAGADO" → en la planilla (pestaña Pagos) aparece la fila "Mercado Pago". (Necesita `MP_ACCESS_TOKEN` de prueba en `.dev.vars`.)
6. **Seba, en su teléfono.** `#/coach`: quién vino hoy en vivo, la transferencia por confirmar (Ver → Confirmar), "no han venido en 10 días" con botón de WhatsApp. Pagos vencidos → **Link** → "Mandar por WhatsApp" con el link de Mercado Pago. Alumnos → Registrar pago: un toque (efectivo / transferencia / tarjeta).
7. **La pizarra.** Semana → Foto de la pizarra → "Leyendo la pizarra…" → la página de la semana. (Necesita `ANTHROPIC_API_KEY` en `.dev.vars`. Sin eso, muestra la semana de ejemplo.)
7b. **Comprar y agendar (Planes).** Sin sesión, pestaña Planes → "12 clases al mes · $100.000" → Entrar y pagar → número nuevo + nombre + 888888 → vuelve al plan → Pagar → Mercado Pago → **PAGADO · Tienes 12 clases hasta el …** → "¿Cuándo vienes?" → día → hora. En Inicio: "11 clases disponibles". En la planilla de Seba aparece el pago (columna Concepto) y en Hoy la hora agendada. ⚠️ En el sitio publicado Mercado Pago está con credenciales de producción: cobra de verdad.
8. **Venderlo afuera.** `#/semana` sin sesión: el Día 1 gratis, el selector Gimnasio / Mancuernas / Sin equipo, el resto bloqueado con "Pagar con Mercado Pago · $15.000 / 30 días".

Frase para cerrar: "No le agregué ni un minuto de trabajo a Seba. Él sigue escribiendo la pizarra. Los pagos se anotan solos."
