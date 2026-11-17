# El Taller · instalador (v0.6.0)

**Desde 2026-11-11 la línea es otra:** `os/install.sh` (→ `public/taller.sh`) baja un Python propio (python-build-standalone,
fijado con sha256), el servidor + panel (`servidor.tar.gz`), lo deja en launchd y abre `localhost:4747`. Todo lo que hacía el
instalador de abajo (carpeta, Claude, skills, cuentas) ahora pasa en el panel (`os/servidor/panel.html`), con botones. El panel
de antes quedó en `/avanzado`. El instalador por terminal de abajo se guardó como `os/install-terminal.sh` (no se publica; Windows
todavía usa su par, `install.ps1`). Versión nueva = subir `VERSION` en `taller.py` + una línea en `servidor/novedades.txt` +
`publicar.sh` + deploy: el panel de cada dueño muestra el aviso y se actualiza con un botón.

## Antes (v0.4.0): el instalador por terminal

## El modelo: Claude, sin personaje (JP, 2026-11-11)
La IA es **Claude** (o la que el dueño tenga en su computador; partimos con Claude). Sin nombre propio, sin voz
inventada, sin presentación: JP, 2026-11-11, "just call it claude. keep it extremely simple". Claude:
- trabaja para el negocio usando su carpeta como memoria;
- atiende también por **el WhatsApp del negocio** (un chip prepago nuevo, en un teléfono de la pega que se queda en el
  negocio; ahí no se instala WhatsApp: un número conectado a la WhatsApp Cloud API ya no se puede usar en la app, por eso
  nuevo, y se conecta desde el panel) y muestra lo que pasa en **la página de Instagram** del negocio;
- recibe del dueño un **plan** (`/plan`), y de ahí salen los proyectos.
Cliente cero: jpfraneto.com, el negocio de JP.

Lo que el dueño pega en una terminal el día 0, sentado con JP. Lo guía paso a paso, en español, esperando Enter,
y deja instalado *dentro de Claude* lo que El Taller es: la carpeta-memoria del negocio con sus skills.
La carpeta es autosuficiente: se puede mover, viaja en git, y entregarla es copiarla. Nada nuestro vive en `~/.claude`.

```
macOS / Linux:  curl -fsSL https://jpfraneto.com/taller.sh | bash
Windows:        irm https://jpfraneto.com/taller.ps1 | iex
```
(armado con `publicar.sh`, todavía **no** publicado).

## Qué hay aquí
- `install.sh`: macOS + Linux (bash 3.2+, el de macOS sirve). Lee las respuestas de `/dev/tty`, así funciona con `curl | bash`.
- `install.ps1`: Windows (PowerShell 5.1+). UTF-8 **con BOM**, para que 5.1 lea bien los acentos al correrlo como archivo.
- `taller.ps1`: arranque ASCII para `irm | iex`. Baja `install.ps1`, lo decodifica como UTF-8 y le quita el BOM antes de correrlo:
  servido directo, el BOM rompe `irm | iex` (la primera línea deja de ser un comentario) y 5.1 sin `charset` decodifica en Latin-1.
- `plantilla/`: lo que se copia a `~/ElTaller/<negocio>/`:
  - `CLAUDE.md` (Claude trabaja para este negocio con la carpeta como memoria, y cómo lo cuida) y `negocio/{amigo,identidad,decisiones,reglas,proyectos,tareas,preguntas,cuentas}.md`
    (con `{{NEGOCIO}}`, `{{DUENO}}`, `{{FECHA}}`). `amigo.md`: los canales del negocio (su WhatsApp, su Instagram, en qué estado están; el nombre del archivo es de antes).
  - `.claude/skills/{dia-cero,plan,recordar,mi-negocio,compartir,reels}/SKILL.md`: skills del proyecto. `/dia-cero` es la entrevista sobre el negocio
    (qué vende, a quién, cómo vende hoy, qué quiere) que llena `identidad.md`; `/plan` recibe el plan del dueño (o un prompt maestro), lo devuelve en corto, lo ordena en proyectos/tareas/
    decisiones con porqué, guarda el original en `negocio/planes/AAAA-MM-DD.md` y no ejecuta nada.
  - `gitignore` (se copia como `.gitignore`; sin punto aquí para no afectar este repo). Excluye secretos y `.claude/settings.local.json`,
    **no** `.claude/`: skills y settings entran al historial.
- `publicar.sh`: arma lo publicable en `public/` (ver abajo). No despliega.

## Qué hace (8 pasos, cada uno explicado antes y confirmado después)
0. Bienvenida. 1. Detecta el sistema. 2. Pide el nombre del negocio y del dueño, crea `~/ElTaller/<slug>/`.
3. Git: si falta, lo instala por la vía normal (macOS `xcode-select --install`; Windows `winget install --id Git.Git -e`;
   Linux muestra `sudo apt-get/dnf install git` y pregunta antes de correrlo). Hace `git init` ("el historial").
4. Claude Code: si falta, usa el instalador oficial (`curl -fsSL https://claude.ai/install.sh | bash` / `irm https://claude.ai/install.ps1 | iex`,
   en Windows en un proceso aparte porque el oficial termina con `exit`). Abre la página del plan Pro si no tiene cuenta, corre
   `claude auth login` (el dueño entra él mismo en el navegador) y lo verifica con `claude auth status`. Ofrece la app de escritorio.
5. Memoria: copia la plantilla **sin pisar nada que ya exista**.
6. Skills: las seis carpetas de `.claude/skills/` se **renuevan en cada corrida** (son de El Taller; otras skills del dueño no se tocan).
   Plugin oficial de Mercado Pago: `claude plugin marketplace add anthropics/claude-plugins-official` +
   `claude plugin install mercadopago@claude-plugins-official --scope project`. La CLI agrega `enabledPlugins` a `.claude/settings.json`
   sin borrar lo que ya tenga (probado con un `permissions` previo). Si falla y no hay settings, lo deja declarado y queda pendiente.
   La plantilla no trae `settings.json`, así que no hay nada que se pise.
7. Cuentas: abre las páginas oficiales de Mercado Pago (panel de desarrolladores, .cl), Meta Business y Cloudflare, explica cada
   una y anota "lista / todavía no" en `negocio/cuentas.md`. Después pregunta por el **chip prepago** del WhatsApp del negocio (sin página).
   Nunca pide contraseñas ni tokens.
8. Hace un commit y dice cómo abrir Claude en la carpeta y qué escribirle primero: "Hola, hagamos el día cero".

Cada paso queda en `<negocio>/.taller/instalacion.jsonl`. Volver a correrlo no rompe nada: salta lo hecho, no toca lo que
editó el dueño, y en las corridas siguientes el commit lleva solo lo del instalador (`.taller`, `.claude/settings.json`,
nuestras skills, `cuentas.md`), nunca cambios ni skills propias del dueño.

## Publicar (armar, no desplegar)
```
os/publicar.sh        # escribe solo si cambió; imprime qué escribió y el comando de deploy
npx wrangler deploy   # desde la raíz del repo, cuando JP lo decida
```
Escribe `public/taller.sh` (= `install.sh`), `public/taller.ps1` (= `taller.ps1`, el arranque), `public/taller/install.ps1`
(= `install.ps1` con BOM) y `public/taller/os.tar.gz` (`plantilla/`, con `.claude/skills`; gzip sin fecha, así el mismo contenido
da los mismos bytes). Antes chequea `bash -n`, el BOM, que el arranque sea ASCII y que el tar traiga las skills.
**Después de editar `install.sh`, `install.ps1` o la plantilla, hay que volver a correr `publicar.sh`.**

## Probar
```
bash os/install.sh --ensayo                    # explica todo y muestra qué haría; no cambia nada
# sin preguntas. OJO: sin --ensayo corre de verdad los `claude plugin …`, así que apunta CLAUDE_CONFIG_DIR a una carpeta temporal:
CLAUDE_CONFIG_DIR=/tmp/t/cfg TALLER_HOME=/tmp/t/home TALLER_AUTO=1 TALLER_NEGOCIO="Endémico" TALLER_DUENO="Seba" bash os/install.sh
# Windows:  $env:TALLER_ENSAYO=1; .\os\install.ps1    (o -Ensayo)   ·   mismas variables TALLER_* para el modo auto
# ¿Cargan las skills? Sin gastar nada (no hace falta sesión):
cd /tmp/t/home/<slug> && CLAUDE_CONFIG_DIR=/tmp/t/cfg claude -p hola --no-session-persistence --debug-file /tmp/t/d.log; grep 'unique skills' /tmp/t/d.log
```
En modo auto nunca instala programas, nunca abre el navegador y nunca inicia sesión. Otras variables: `TALLER_FUENTE=<carpeta con plantilla/>`,
`TALLER_URL=<os.tar.gz>`, `TALLER_PS1_URL=<install.ps1>` (para el arranque), `TALLER_FORZAR=1` (correr el .ps1 fuera de Windows, solo pruebas).

v0.4.0 (2026-11-10, los reels en el computador de cada dueño): skill `/reels` + `os/reels/` (`curl -fsSL
https://jpfraneto.com/taller/reels.sh | bash`, **todavía sin publicar**: `public/.assetsignore`). JP: "each nelson … should be
the social media manager of those businesses … N reels they want every day out of a RAW recording … on a format … that
nelson can also be the one that helps that person discover by themselves", y "this runs on each machine that each one of
these business owners run". El instalador deja en `~/ElTaller/.reels`: las herramientas de `footage/tools` (el pipeline
de JP, 124 KB), su Python (Pillow, numpy), la letra Inter (licencia libre: SF Pro de Apple solo sirve para maquetas de
interfaces de Apple, no para marcas) y el modelo de whisper (1,6 GB, sha256 verificado); con Homebrew instala solo lo que
falta (ffmpeg, whisper-cpp, uv, cloudflared, Chrome). Cada negocio tiene `redes/` en su carpeta: `estilo.json` (de
`reels/estilo-base.json`), `TASTE.md` (de `reels/TASTE-base.md`), `NARRATIVE.md`, sus días y `raw/`; sus credenciales de
Instagram en `~/.config/eltaller/<carpeta>.instagram.env`. `/reels formato` descubre con el dueño su formato; `/reels hoy`
corre el día; publicar solo con su sí. Probado (HOME temporal, paquete servido en local): instalación completa (6 ✓,
segunda corrida sin reinstalar nada) y, desde la copia instalada, un día de otro negocio de prueba con el plan real de
Claude (4 reels) → 4 borradores + 4 portadas en Inter con su color → revisión. **No probado:** un Mac sin Homebrew ni
herramientas de Apple; publicar de verdad desde la cuenta de un dueño.

v0.3.0 (2026-11-10, el mes juntos es un repositorio): skill `/compartir`. El mes con JP pasa en un repositorio **privado en la
cuenta de GitHub del dueño**, hecho desde su carpeta: `abrir` (pide el sí, revisa que no haya secretos, instala `gh` sin
admin si falta, el dueño conecta su cuenta en el navegador, `gh repo create --private --push`, invita a `jpfraneto`, anota en
cuentas/decisiones/tareas) y `cerrar` el día 30 (le quita el acceso a JP; todo queda del dueño). Probado: instalador en
modo auto con la plantilla nueva (5 skills copiadas) y Claude Code carga 5 skills del proyecto. **No probado:** el flujo
de GitHub de verdad (crear el repo, invitar, cerrar) con una cuenta de dueño. `install.ps1`: el texto cambió; no se corrió
el parser de PowerShell (no hay pwsh en este Mac). Falta correr `publicar.sh` para que `os.tar.gz` lleve la skill.

v0.2.0 (2026-11-10, la IA con nombre y voz propios; se sacó el 2026-11-11): shellcheck y parser de PowerShell sin avisos; auto con bash y con pwsh crean la misma
carpeta (16 archivos, `amigo.md` y `/plan` incluidos); Claude Code carga 4 skills del proyecto + 4 de Mercado Pago.

Probado en este Mac (2026-11-08, v0.1.0), siempre con `CLAUDE_CONFIG_DIR` temporal:
- `bash -n` y shellcheck 0.10 sin avisos (`install.sh`, `publicar.sh`).
- Ensayo (no crea nada). Auto dos veces seguidas: skills renovadas (una rota volvió a su versión), un `settings.json`
  previo conservado, una skill propia del dueño y sus ediciones quedan fuera del commit del instalador.
- `curl | bash` interactivo por pty contra los archivos que armó `publicar.sh`, servidos con `python3 -m http.server`.
- Claude Code 2.1.314 en la carpeta generada: `Loaded 3 unique skills (… project: 3)` y `Loaded 4 skills from plugin mercadopago`
  (con el debug log, sin sesión: cero uso de API).
- `install.ps1`: parser de PowerShell 7.4; ensayo y auto dos veces bajo pwsh en macOS, la primera por `irm …/taller.ps1 | iex`
  a través del arranque. Mismos archivos que la versión bash.
- `publicar.sh` dos veces: la segunda dice "sin cambios" en todo.

## Qué falta / no está hecho
- **Desplegar**: `npx wrangler deploy` no se corrió. Los content-types y la página `public/empezar/` los ve otra persona.
- **Windows no está probado en Windows de verdad.** Ni PowerShell 5.1, ni winget, ni el PATH después de instalar, ni el arranque
  en 5.1 (usa `Net.WebClient` y `[scriptblock]::Create`, que existen en 5.1). Hay que probarlo antes de un cliente con Windows.
- Linux: probado solo por lógica compartida con macOS; la instalación de git (apt/dnf) no se probó.
- La instalación real de git y de Claude Code, y `claude auth login`, no se ejecutaron (este Mac ya los tiene).
- El plugin de Mercado Pago necesita, en una máquina nueva, registrar el marketplace oficial de Anthropic a nivel usuario
  (lo mismo que hace Claude en su primera sesión). Instalado queda en el caché de plugins de Claude, no en la carpeta;
  al copiar la carpeta a otro computador, Claude avisa que falta instalarlo (o se vuelve a correr el instalador).
- La plantilla de memoria se copia una vez: si cambia después, las carpetas que ya existen no se actualizan (las skills sí).
- Mercado Pago apunta a `mercadopago.cl` (Chile). Otros países necesitan su dominio.
- Que la app de escritorio (pestaña Code) lea `.claude/skills` y los plugins del proyecto lo dice la documentación; no se probó a mano.
