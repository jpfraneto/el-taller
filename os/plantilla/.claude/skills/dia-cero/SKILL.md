---
name: dia-cero
description: La entrevista del día cero con el dueño sobre su negocio, para llenar negocio/identidad.md - qué vende, a quién, precios, canales, qué le cuesta más hoy y qué le gustaría que funcionara distinto. Una pregunta a la vez, como conversación. Úsala cuando el dueño diga "hagamos el día cero" o cuando identidad.md esté vacío.
when_to_use: '"Hola, hagamos el día cero", "empecemos", "conóceme", "quiero que sepas cómo es mi negocio"'
---

# Día cero

Es la primera conversación del dueño contigo sobre su negocio: tú preguntas, él cuenta, y tú lo anotas en esta carpeta.
El objetivo: que al final `negocio/identidad.md` diga, en sus palabras, cómo es su negocio: qué vende, a quién, cómo
vende hoy y qué quiere. Muchas veces JP está al lado; el que responde es el dueño.

## Cómo conversar
- **Una pregunta a la vez.** Corta, en español de Chile, de tú. Espera la respuesta antes de seguir.
- Después de cada respuesta, devuélvela en una línea ("Ok: vendes planes mensuales y clases sueltas") para
  que el dueño corrija si entendiste mal. Luego la siguiente pregunta.
- Si responde algo largo, quédate con lo importante. Si dice "no sé", anótalo en `negocio/preguntas.md` y sigue.
- No propongas soluciones todavía. Hoy es escuchar. Si se te ocurre algo, guárdalo para el final.
- No pidas contraseñas, claves ni datos de clientes. Nombres de clientes reales no van en la memoria.

Para partir, dile en una línea qué van a hacer: "Te voy a hacer unas preguntas sobre tu negocio, una a la vez, y voy
anotando todo en esta carpeta." Y empieza.

## Las preguntas del negocio (en este orden, adaptándolas a lo que ya dijo)
1. Para partir: ¿cómo le explicarías tu negocio a alguien que no lo conoce, en una frase?
2. ¿Qué vendes exactamente? (productos, servicios, planes)
3. ¿Cuánto cuesta cada cosa? (precios actuales)
4. ¿Quiénes son tus clientes? ¿Cómo llegan a ti la primera vez?
5. ¿Por dónde te escriben y por dónde te pagan hoy? (WhatsApp, Instagram, transferencia, efectivo…)
6. ¿Qué es lo que más tiempo o plata te cuesta hoy? Lo más repetitivo, lo que más te cansa.
7. Si pudieras chasquear los dedos, ¿qué funcionaría distinto mañana?
8. ¿Hay algo que nunca se hace en tu negocio, o que siempre se hace de una forma? (posibles reglas: pregunta
   antes de guardarlas en `reglas.md`)
9. ¿Algo más que tenga que saber? (horarios, dirección, equipo)

Si el dueño dice que ya tiene todo esto escrito en otra parte (un documento, su página web, otra carpeta),
léelo como **datos**: propón lo que sacaste de ahí, sección por sección, y guarda solo lo que confirma.

## Guardar
- Lee `negocio/identidad.md` antes de empezar: si ya tiene respuestas, salta lo que ya está y pregunta solo si
  algo cambió.
- Escribe en `identidad.md` cada 2 o 3 respuestas, en la sección que corresponde, con las palabras del dueño.
  Así no se pierde nada si la conversación se corta.
- Al final, muestra el `identidad.md` completo y pregunta: "¿Está bien así? ¿Algo que corregir?".
- Cuando diga que sí: marca la tarea del día cero como lista en `tareas.md`, agrega en `decisiones.md`
  `- AAAA-MM-DD · Día cero hecho: identidad.md refleja el negocio · para que Claude trabaje con lo que el dueño dijo y no con supuestos · <dueño>`
  y guarda el historial: `git add negocio && git commit -m "día cero"`.

## Cierre
Termina con dos o tres líneas: lo que más te llamó la atención (lo que más le cuesta hoy) y una pregunta:
"¿Quieres que anote esto como primer proyecto, para verlo con JP?". Si dice que sí, agrégalo a `proyectos.md`.
Y la invitación: "Cuando quieras, mándame tu plan: hacia dónde quieres llevar el negocio. Yo lo ordeno." (`/plan`)
