---
name: compartir
description: Abre o cierra el mes de trabajo con JP. "Abrir" sube esta carpeta a un repositorio PRIVADO en la cuenta de GitHub del dueño e invita a JP a trabajar ahí; "cerrar" (el día 30) le quita el acceso. Úsala cuando el dueño diga "empecemos el mes con JP", "comparte la carpeta con JP", "terminamos el mes", "sácale el acceso a JP".
when_to_use: '"hoy empezamos el mes con JP", "compártele la carpeta a JP", "abre nuestro taller", "terminó el mes, cierra el acceso de JP"'
argument-hint: "abrir | cerrar"
---

# Compartir la carpeta con JP (el mes juntos)

En el mes con JP trabajan los dos en **esta misma carpeta**: el dueño, tú (Claude) y JP. Para que JP pueda
trabajar desde su computador, la carpeta vive también en un repositorio **privado** de GitHub, **en la cuenta del
dueño**. El día 30, JP sale y todo queda del dueño: la carpeta, el historial, el trabajo del mes.

Si te pasaron algo como argumento, es esto: $ARGUMENTS (`abrir` o `cerrar`; si no está claro, pregunta).

El GitHub de JP es **`jpfraneto`**. No invites a nadie más con esta skill.

Habla simple: "repositorio" = "la copia de tu carpeta en internet, privada". Una cosa a la vez. Lo que el dueño tenga que
hacer en el navegador (crear su cuenta, autorizar), lo hace **él**: tú nunca escribes contraseñas ni códigos por él.

## Abrir (día 1)

### 1. Explica y pide el sí
Antes de tocar nada, dile en corto:
- Que vas a crear una copia **privada** de esta carpeta en su cuenta de GitHub, y que solo él y JP la van a ver.
- **Qué va a ver JP:** todo lo de esta carpeta (su memoria del negocio, sus decisiones, el código de sus apps). Si existe
  `negocio/clientes/` (conversaciones de clientes), díselo explícito y pregunta si JP puede verlas; si dice que no,
  agrega `negocio/clientes/` a `.gitignore` y sácalas del historial que se sube (`git rm -r --cached negocio/clientes`)
  antes del primer envío.
- Que el día 30 se cierra con `/compartir cerrar`.
Espera un **sí** explícito.

### 2. Revisa que no se suba nada secreto
- `git status` y `git ls-files`: no puede haber `.env`, `.dev.vars`, `*.key`, `*_key`, `config.json` con tokens, ni nada que
  parezca una contraseña o clave (busca con `git grep -nIiE "(api[_-]?key|secret|token|password|contraseña)\s*[:=]"`).
- Si encuentras algo, **para**: muéstraselo al dueño, sácalo del historial con su permiso y dile que cambie esa clave.
- Si hay cambios sin guardar, haz un commit primero ("Antes de compartir con JP").

### 3. La herramienta de GitHub (`gh`)
- Si `gh --version` funciona, sigue.
- Si no: en Mac, bájala sin pedir clave de administrador: la última versión de https://github.com/cli/cli/releases
  (`gh_<versión>_macOS_arm64.zip` o `_amd64.zip` según `uname -m`), descomprímela en `~/.eltaller/gh/` y usa
  `~/.eltaller/gh/bin/gh`. En Windows: `winget install --id GitHub.cli -e`. En Linux: muestra el comando de
  https://github.com/cli/cli#installation y pregunta antes de correrlo.

### 4. La cuenta del dueño
- `gh auth status`. Si ya está conectado, confirma con él que es **su** cuenta (muéstrale el usuario).
- Si no tiene cuenta: abre https://github.com/signup y que la cree él (con el correo del negocio). Espera.
- Conéctala: `gh auth login --hostname github.com --git-protocol https --web`. Le aparece un código de 8 letras y se abre
  el navegador: él lo pega y autoriza. Vuelve a revisar con `gh auth status`.

### 5. Crear la copia privada y subirla
- Nombre: el de esta carpeta (ej. `arbol-de-lilith`). Si ya existe en su cuenta, pregunta si es esa o usas otro nombre.
- `gh repo create <nombre> --private --source . --remote origin --push --description "El Taller · <negocio>"`
- Comprueba: `gh repo view --json visibility,url` tiene que decir `PRIVATE`. Si no dice PRIVATE, **para** y avísale.

### 6. Invitar a JP
- `gh api -X PUT "repos/<usuario>/<nombre>/collaborators/jpfraneto" -f permission=push`
- Dile al dueño que a JP le llega la invitación por correo, y que JP trabaja ahí todo el mes.

### 7. Anotar
- `negocio/cuentas.md`: una línea `- [x] GitHub · la copia privada de esta carpeta (<url>) · lista (AAAA-MM-DD)` (sin claves).
- `negocio/decisiones.md`: `AAAA-MM-DD · Compartimos esta carpeta con JP en un repositorio privado de <usuario> · para
  trabajar juntos el mes; el día 30 JP sale · <dueño>, con JP`.
- `negocio/tareas.md`: `- [ ] Día 30 (AAAA-MM-DD): cerrar el mes con JP (/compartir cerrar)`, con la fecha de hoy + 30 días.
- Commit ("El mes con JP: carpeta compartida") y `git push`.

## Durante el mes
- Antes de trabajar: `git pull`. Después de guardar algo importante: commit y `git push`, así JP lo ve.
- Si `git pull` trae cambios de JP, cuéntale al dueño en una línea qué hizo JP (`git log` desde la última vez).

## Cerrar (día 30)
1. Confirma con el dueño que termina el mes.
2. `gh api -X DELETE "repos/<usuario>/<nombre>/collaborators/jpfraneto"`. Si la invitación seguía pendiente, búscala con
   `gh api "repos/<usuario>/<nombre>/invitations"` y bórrala con `gh api -X DELETE "repos/<usuario>/<nombre>/invitations/<id>"`.
3. Comprueba que JP ya no está: `gh api "repos/<usuario>/<nombre>/collaborators" --jq '.[].login'`.
4. Anota en `negocio/decisiones.md` (`AAAA-MM-DD · Terminó el mes con JP; JP ya no tiene acceso · <dueño>`), marca la
   tarea del día 30 como lista, commit y push.
5. Dile al dueño: la carpeta, el historial y todo el trabajo del mes son suyos. El repositorio sigue privado en su cuenta.
   Puede volver a abrirlo con `/compartir abrir` cuando quiera.
