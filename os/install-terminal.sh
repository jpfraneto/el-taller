#!/usr/bin/env bash
# El Taller · instalador del día 0 (macOS y Linux). Versión 0.4.0
#   curl -fsSL https://jpfraneto.com/taller.sh | bash
#   curl -fsSL https://jpfraneto.com/taller.sh | bash -s -- --ensayo     (muestra todo, no cambia nada)
# Pruebas: TALLER_AUTO=1 TALLER_NEGOCIO="Mi Negocio" [TALLER_DUENO=...] [TALLER_HOME=/tmp/x] bash install.sh
# Otras: TALLER_FUENTE=<carpeta con plantilla/>  TALLER_URL=<os.tar.gz>
# Todo va dentro de funciones y main se llama al final: una descarga cortada no ejecuta medio script.

TALLER_VERSION="0.4.0"
URL_PAQUETE_DEFECTO="https://jpfraneto.com/taller/os.tar.gz"

# ───────────────────────── ayudantes ─────────────────────────
colores() {
  if [ -t 1 ]; then B=$'\033[1m'; D=$'\033[2m'; V=$'\033[32m'; A=$'\033[33m'; C=$'\033[36m'; R=$'\033[0m'
  else B=""; D=""; V=""; A=""; C=""; R=""; fi
}
paso()  { printf '\n%s━━ Paso %s · %s%s\n' "$B$C" "$1" "$2" "$R"; }
di()    { local l; for l in "$@"; do printf '  %s\n' "$l"; done; }
ok()    { printf '  %s✓%s %s\n' "$V" "$R" "$1"; }
ojo()   { printf '  %s!%s %s\n' "$A" "$R" "$1"; }
cmd()   { printf '    %s%s%s\n' "$D" "$1" "$R"; }
ensayo() { [ "$ENSAYO" = 1 ]; }
auto()   { [ "$AUTO" = 1 ]; }

pausa() {
  auto && return 0
  printf '  %s[%s]%s ' "$D" "${1:-Enter para seguir}" "$R"; read -r _ </dev/tty || cortado
}
cortado() { printf '
'; ojo "Se cortó la entrada: salgo. Puedes volver a correr el comando cuando quieras."; exit 1; }
preguntar() {  # texto, defecto → RESP
  RESP="$2"; auto && return 0
  printf '  %s%s%s ' "$B" "$1" "$R"; [ -n "$2" ] && printf '%s(%s)%s ' "$D" "$2" "$R"
  read -r RESP </dev/tty || cortado; [ -z "$RESP" ] && RESP="$2"; return 0
}
si_no() {  # texto, defecto s|n → 0 si es sí
  preguntar "$1 [s/n]" "$2"
  case "$RESP" in s*|S*|y*|Y*) return 0 ;; *) return 1 ;; esac
}
hacer() {  # corre un comando, o en ensayo solo lo muestra
  if ensayo; then printf '    %s(ensayo) haría: %s%s\n' "$D" "$*" "$R"; return 0; fi
  "$@"
}
abrir() {  # abre una página oficial en el navegador
  printf '    %s→ %s%s\n' "$C" "$1" "$R"
  { ensayo || auto; } && return 0
  if [ "$SO" = mac ]; then open "$1" >/dev/null 2>&1
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 &
  else ojo "No pude abrir el navegador: copia el link de arriba."; fi
}
json_esc() { local s=$1; s=${s//\\/\\\\}; s=${s//\"/\\\"}; printf '%s' "$s"; }
registrar() {  # paso, estado (ok|pendiente|saltado), detalle → .taller/instalacion.jsonl
  REG="$REG$(printf '{"fecha":"%s","paso":"%s","estado":"%s","detalle":"%s","modo":"%s"}' \
    "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$1" "$2" "$(json_esc "$3")" "$MODO")"$'\n'
  [ "$2" = pendiente ] && PENDIENTES="$PENDIENTES  · $1: $3"$'\n'
  volcar
}
volcar() {
  ensayo && return 0
  [ -n "$DIR" ] && [ -d "$DIR/.taller" ] || return 0
  printf '%s' "$REG" >>"$DIR/.taller/instalacion.jsonl"; REG=""
}
hacer_slug() {  # minúsculas ASCII a propósito: los acentos se cambian antes
  # shellcheck disable=SC2018,SC2019
  printf '%s' "$1" | sed 's/á/a/g;s/Á/a/g;s/é/e/g;s/É/e/g;s/í/i/g;s/Í/i/g;s/ó/o/g;s/Ó/o/g;s/ú/u/g;s/Ú/u/g;s/ü/u/g;s/Ü/u/g;s/ñ/n/g;s/Ñ/n/g' \
    | LC_ALL=C tr 'A-Z' 'a-z' | LC_ALL=C tr -c 'a-z0-9' '-' | tr -s '-' | sed 's/^-//;s/-$//' | cut -c1-40
}
rellenar() {  # copia una plantilla reemplazando {{NEGOCIO}} {{DUENO}} {{FECHA}} (texto literal, sin regex)
  NEG="$NEGOCIO" DUE="$DUENO" FEC="$HOY" awk '
    function rep(s, t, r,   i, o) { o = ""; while ((i = index(s, t)) > 0) { o = o substr(s, 1, i - 1) r; s = substr(s, i + length(t)) } return o s }
    { s = rep($0, "{{NEGOCIO}}", ENVIRON["NEG"]); s = rep(s, "{{DUENO}}", ENVIRON["DUE"]); print rep(s, "{{FECHA}}", ENVIRON["FEC"]) }' "$1" >"$2"
}
cuenta_lista() { [ -f "$DIR/negocio/cuentas.md" ] && grep -q "^- \[x\] $1 ·" "$DIR/negocio/cuentas.md"; }
marcar_cuenta() {  # nombre, lista|pendiente → actualiza su línea en negocio/cuentas.md
  local f="$DIR/negocio/cuentas.md" m=" " t="todavía no (revisado $HOY)"
  [ "$2" = lista ] && { m="x"; t="lista ($HOY)"; }
  if ensayo || [ ! -f "$f" ]; then di "${D}(anotaría en cuentas.md: $1 → $t)$R"; return 0; fi
  N="$1 · " M="$m" X="$t" awk '{ p = substr($0, 1, 6); r = substr($0, 7)
    if ((p == "- [ ] " || p == "- [x] ") && index(r, ENVIRON["N"]) == 1) { split(r, a, " · "); $0 = "- [" ENVIRON["M"] "] " a[1] " · " a[2] " · " ENVIRON["X"] }
    print }' "$f" >"$f.tmp" && mv "$f.tmp" "$f"
}
git_ok() {
  if [ "$SO" = mac ] && [ "$(command -v git)" = /usr/bin/git ]; then xcode-select -p >/dev/null 2>&1 || return 1; fi
  git --version >/dev/null 2>&1
}
claude_ok() { command -v claude >/dev/null 2>&1 && claude --version >/dev/null 2>&1; }
claude_sesion() { claude auth status --json 2>/dev/null | grep -q '"loggedIn": *true'; }

# ───────────────────────── fuente: plantilla/ (con .claude/skills) ─────────────────────────
buscar_fuente() {
  local d=""
  if [ -n "$TALLER_FUENTE" ]; then SRC="$TALLER_FUENTE"; return 0; fi
  if [ -n "${BASH_SOURCE[0]}" ] && [ -f "${BASH_SOURCE[0]}" ]; then d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; fi
  if [ -n "$d" ] && [ -d "$d/plantilla/.claude/skills" ]; then SRC="$d"; return 0; fi
  SRC="$(mktemp -d "${TMPDIR:-/tmp}/eltaller.XXXXXX")"
  if curl -fsSL "${TALLER_URL:-$URL_PAQUETE_DEFECTO}" | tar -xzf - -C "$SRC" 2>/dev/null && [ -d "$SRC/plantilla/.claude/skills" ]; then return 0; fi
  ojo "No pude descargar los archivos de El Taller (${TALLER_URL:-$URL_PAQUETE_DEFECTO})."
  ensayo && { SRC=""; return 0; }
  di "Revisa tu internet y vuelve a correr el comando. Si sigue, avísale a JP."; exit 1
}

# ───────────────────────── pasos ─────────────────────────
paso_bienvenida() {
  printf '\n%s  El Taller · día 0%s %s(v%s%s)%s\n' "$B" "$R" "$D" "$TALLER_VERSION" "$(ensayo && printf ' · ensayo: no cambio nada')" "$R"
  di "" "Hoy dejamos a Claude (una inteligencia artificial) trabajando para tu negocio: se acuerda de lo que le cuentas" \
     "y te ayuda a pensar y a hacer. Vive en tu computador y, más adelante, también en el WhatsApp de tu negocio." \
     "" "Funciona sobre tres herramientas, todas a tu nombre:" \
     "Meta (WhatsApp + Instagram), Claude (el cerebro) y Mercado Pago (donde entra la plata)." \
     "Tú haces cada paso; yo te explico antes qué es y para qué sirve. Son 8 pasos, unos 30-45 minutos." \
     "Si algo no se entiende, pregúntale a JP: para eso está al lado tuyo."
  pausa "Enter para empezar"
}

paso_sistema() {
  paso 1 "Tu computador"
  local v=""
  # shellcheck disable=SC1091
  case "$(uname -s)" in
    Darwin) SO=mac; v="macOS $(sw_vers -productVersion 2>/dev/null)" ;;
    Linux)  SO=linux; v="$( (. /etc/os-release 2>/dev/null && printf '%s' "$PRETTY_NAME") || printf 'Linux')"
            grep -qi microsoft /proc/version 2>/dev/null && v="$v (dentro de Windows, WSL)" ;;
    MINGW*|MSYS*|CYGWIN*) ojo "Esto es Windows. Usa en PowerShell:"; cmd "irm https://jpfraneto.com/taller.ps1 | iex"; exit 1 ;;
    *) ojo "No conozco este sistema ($(uname -s)). Avísale a JP."; exit 1 ;;
  esac
  ARQ="$(uname -m)"
  di "Primero miro qué computador tienes, para instalar lo que corresponde."
  ok "Tienes $v, procesador $ARQ."
  if [ "$SO" = mac ] && [ "$(sw_vers -productVersion 2>/dev/null | cut -d. -f1)" -lt 13 ] 2>/dev/null; then
    ojo "Claude Code pide macOS 13 o más nuevo. Habla con JP antes de seguir."
  fi
  registrar sistema ok "$v $ARQ"
}

paso_carpeta() {
  paso 2 "La carpeta de tu negocio"
  di "Todo lo de tu negocio va a vivir en una carpeta de este computador: lo que Claude sabe de ti," \
     "tus reglas, tus decisiones. Es tuya: la puedes copiar, respaldar o llevarte a otro lado."
  NEGOCIO="${TALLER_NEGOCIO}"
  while [ -z "$NEGOCIO" ]; do preguntar "¿Cómo se llama tu negocio?" ""; NEGOCIO="$RESP"; auto && [ -z "$NEGOCIO" ] && { ojo "Falta TALLER_NEGOCIO"; exit 1; }; done
  preguntar "¿Y cómo te llamas tú?" "${TALLER_DUENO:-Dueño}"; DUENO="$RESP"
  SLUG="$(hacer_slug "$NEGOCIO")"; [ -z "$SLUG" ] && SLUG="mi-negocio"
  preguntar "La carpeta se va a llamar \"$SLUG\". Enter si está bien, o escribe otro nombre:" "$SLUG"
  SLUG="$(hacer_slug "$RESP")"; [ -z "$SLUG" ] && SLUG="mi-negocio"
  DIR="$BASE/$SLUG"
  if [ -d "$DIR" ]; then ok "La carpeta ya existe: $DIR. La uso tal cual, no borro nada."
  else hacer mkdir -p "$DIR"; ok "Carpeta lista: $DIR"; fi
  ensayo || mkdir -p "$DIR/.taller"
  registrar carpeta ok "$NEGOCIO → $DIR (dueño: $DUENO)"
}

paso_git() {
  paso 3 "El historial"
  di "Ahora el historial: todo cambio en tu carpeta queda guardado y se puede deshacer." \
     "Si Claude (o tú) se equivoca, volvemos atrás. La herramienta se llama git."
  if ! git_ok; then
    if [ "$SO" = mac ]; then
      di "Tu Mac no tiene git todavía. Apple lo trae en sus \"herramientas de línea de comandos\"." \
         "Se va a abrir una ventana de Apple: aprieta Instalar y espera (5-10 minutos)."
      if auto; then ojo "(modo prueba: no instalo nada)"; else pausa; hacer xcode-select --install; pausa "Enter cuando la ventana de Apple diga que terminó"; fi
    else
      local c="sudo apt-get install -y git"; command -v dnf >/dev/null 2>&1 && c="sudo dnf install -y git"
      di "Este computador no tiene git. Se instala con este comando (te pide tu contraseña del computador):"; cmd "$c"
      # shellcheck disable=SC2086
      if ! auto && si_no "¿Lo corro yo ahora?" s; then hacer $c; else di "Córrelo tú en otra ventana."; pausa "Enter cuando termine"; fi
    fi
  fi
  if ! git_ok && ! ensayo; then
    ojo "Git todavía no está. Seguimos igual; vuelve a correr este instalador después y lo dejo listo."
    registrar git pendiente "git no instalado"; return 0
  fi
  if [ -d "$DIR/.git" ]; then ok "El historial ya estaba activo."
  else hacer git -C "$DIR" init -q; ok "Historial activo en tu carpeta."; fi
  registrar git ok "$(git --version 2>/dev/null)"
}

paso_claude() {
  paso 4 "Claude, el cerebro"
  di "Claude es con quien vas a hablar de tu negocio: le preguntas, le pides cosas, y él usa tu carpeta" \
     "como memoria. Es la única herramienta que vas a tener que aprender." \
     "Necesitas una cuenta tuya con el plan Pro (US\$20 al mes, lo pagas tú, con tu tarjeta)."
  [ -x "$HOME/.local/bin/claude" ] && case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac
  if claude_ok; then ok "Claude Code ya está instalado ($(claude --version 2>/dev/null | head -1))."
  else
    di "Instalo Claude Code con el instalador oficial de Anthropic:"; cmd "curl -fsSL https://claude.ai/install.sh | bash"
    if auto; then ojo "(modo prueba: no instalo nada)"
    else pausa "Enter para instalar"; hacer bash -c 'curl -fsSL https://claude.ai/install.sh | bash'; export PATH="$HOME/.local/bin:$PATH"; fi
    if claude_ok; then ok "Claude Code instalado."; elif ! ensayo; then ojo "Claude Code no quedó instalado. JP te ayuda; después vuelve a correr esto."; fi
  fi
  if claude_ok && ! ensayo && ! auto && ! grep -qs '.local/bin' "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile" && [ -x "$HOME/.local/bin/claude" ]; then
    local rc="$HOME/.bashrc"; case "$SHELL" in *zsh) rc="$HOME/.zshrc" ;; esac
    di "Para que el comando \"claude\" funcione en cualquier ventana, hay que agregar una línea a $rc."
    # shellcheck disable=SC2016
    si_no "¿La agrego?" s && printf '\nexport PATH="$HOME/.local/bin:$PATH"  # Claude Code (El Taller)\n' >>"$rc" && ok "Agregada."
  fi
  if ! claude_ok; then registrar claude pendiente "Claude Code no instalado"; return 0; fi
  if claude_sesion; then ok "Ya tienes tu cuenta conectada en este computador."
  else
    if ! si_no "¿Ya tienes cuenta de Claude con plan Pro?" n; then
      di "Abro la página de planes: crea tu cuenta (con el correo del negocio) y elige Pro."; abrir "https://claude.com/pricing"
      pausa "Enter cuando tengas tu cuenta Pro"
    fi
    di "Ahora conectamos este computador con tu cuenta. Se abre el navegador: entras, autorizas y vuelves aquí."
    if auto; then ojo "(modo prueba: no inicio sesión)"; else pausa; hacer claude auth login </dev/tty; fi
    if claude_sesion; then ok "Listo: Claude te reconoce."; else ojo "Todavía no veo la sesión. Después: escribe claude en una terminal y entra."; fi
  fi
  di "Claude también tiene app de escritorio, más cómoda que la terminal para el día a día."
  if [ "$SO" = linux ]; then di "En Linux está en beta (Ubuntu/Debian): https://code.claude.com/docs/en/desktop-linux"
  elif si_no "¿Abro la página para descargarla?" s; then abrir "https://claude.com/download"; pausa "Enter cuando la tengas (o para seguir sin ella)"; fi
  if claude_sesion; then marcar_cuenta Claude lista; registrar claude ok "$(claude --version 2>/dev/null | head -1), sesión iniciada"
  else registrar claude pendiente "falta iniciar sesión (claude auth login)"; fi
}

paso_memoria() {
  paso 5 "La memoria de tu negocio"
  di "Ahora le armo a Claude su memoria: una carpeta \"negocio\" con lo que sabe de ti." \
     "Quién eres, tus reglas, tus decisiones (con su porqué), tus tareas y lo que falta saber." \
     "Son archivos de texto simples: los puedes leer y corregir tú."
  if [ -z "$SRC" ]; then ojo "(ensayo: sin archivos de plantilla a mano)"; registrar memoria saltado "sin fuente"; return 0; fi
  local f dst n=0 k=0
  for f in CLAUDE.md negocio/amigo.md negocio/identidad.md negocio/decisiones.md negocio/reglas.md negocio/proyectos.md negocio/tareas.md negocio/preguntas.md negocio/cuentas.md gitignore; do
    dst="$DIR/$f"; [ "$f" = gitignore ] && dst="$DIR/.gitignore"
    if [ -e "$dst" ]; then k=$((k + 1)); continue; fi
    if ensayo; then di "${D}(ensayo) crearía ${dst#"$DIR"/}$R"; else mkdir -p "$(dirname "$dst")"; rellenar "$SRC/plantilla/$f" "$dst"; CREADOS="$CREADOS ${dst#"$DIR"/}"; fi
    n=$((n + 1))
  done
  ok "Memoria lista: $n archivos nuevos$( [ $k -gt 0 ] && printf ', %s ya existían (no los toqué)' "$k")."
  registrar memoria ok "$n nuevos, $k existentes"
}

paso_skills() {
  paso 6 "Lo que Claude aprende de El Taller"
  di "Le enseño a Claude seis cosas (quedan dentro de tu carpeta, en .claude/skills):" \
     "  /dia-cero    te entrevista sobre tu negocio y lo anota en tu carpeta (lo hacemos al final)" \
     "  /plan        le mandas tu plan y lo ordena en proyectos, tareas y decisiones" \
     "  /recordar    guarda una decisión o regla, con fecha y porqué" \
     "  /mi-negocio  te resume cómo vas y qué falta" \
     "  /compartir   abre (y el día 30 cierra) el mes con JP: tu carpeta en un repositorio privado tuyo" \
     "  /reels       tu grabación del día → 1 a 5 reels que salen solos (la primera vez, descubren tu formato)" \
     "Y el plugin oficial de Mercado Pago, para que sepa cobrar con su documentación oficial."
  local s nom lista="" fallo=""
  if [ -n "$SRC" ]; then  # las skills son de El Taller: se renuevan siempre (las del dueño, si tiene otras, no se tocan)
    for s in "$SRC"/plantilla/.claude/skills/*/; do
      nom="$(basename "$s")"; lista="$lista /$nom"; NUESTRAS="$NUESTRAS .claude/skills/$nom"
      if ensayo; then di "${D}(ensayo) renovaría .claude/skills/$nom$R"
      else mkdir -p "$DIR/.claude/skills"; rm -rf "$DIR/.claude/skills/$nom"; cp -R "${s%/}" "$DIR/.claude/skills/$nom"; fi
    done
    ok "Skills al día:$lista"
  fi
  if ensayo; then
    di "${D}(ensayo) en $DIR correría:$R"
    cmd "claude plugin marketplace add anthropics/claude-plugins-official"; cmd "claude plugin install mercadopago@claude-plugins-official --scope project"
    registrar skills saltado "ensayo"; return 0
  fi
  if claude_ok; then
    ( cd "$DIR" || exit 1
      claude plugin marketplace add anthropics/claude-plugins-official >/dev/null || exit 1
      claude plugin install mercadopago@claude-plugins-official --scope project >/dev/null || exit 2
    ) 2>"$DIR/.taller/plugins.err" || fallo=$?
    [ -s "$DIR/.taller/plugins.err" ] || rm -f "$DIR/.taller/plugins.err"
  else fallo=sin-claude; fi
  if [ -z "$fallo" ]; then ok "Y conoce Mercado Pago."; registrar skills ok "dia-cero, plan, recordar, mi-negocio, compartir, reels + mercadopago@claude-plugins-official"; return 0; fi
  if [ ! -f "$DIR/.claude/settings.json" ]; then  # dejarlo declarado: Claude avisa que falta instalarlo
    mkdir -p "$DIR/.claude"
    printf '{\n  "enabledPlugins": {\n    "mercadopago@claude-plugins-official": true\n  }\n}\n' >"$DIR/.claude/settings.json"
  fi
  ojo "No pude instalar el plugin de Mercado Pago ($fallo). Quedó anotado; vuelve a correr esto cuando Claude esté listo."
  registrar skills pendiente "plugin de Mercado Pago no instalado ($fallo), ver .taller/plugins.err"
}

paso_cuentas() {
  paso 7 "Tus cuentas"
  di "Tres cuentas y un chip, todo a tu nombre. Las cuentas las creas tú; yo abro la página oficial y te explico." \
     "Nunca escribas aquí contraseñas ni claves: solo anoto si la cuenta existe o no."
  cuenta "Mercado Pago" "https://www.mercadopago.cl/developers/panel/app" \
    "Donde entra la plata. Necesitas tu cuenta de Mercado Pago de vendedor (si no tienes, la creas)." \
    "La página es el panel de desarrolladores: ahí después se conectan tus cobros. Hoy basta con entrar."
  cuenta "Meta Business" "https://business.facebook.com/" \
    "Donde están tus clientes: junta tu Instagram y tu WhatsApp Business en un solo lugar." \
    "Entra con tu Facebook o Instagram y crea (o elige) el portafolio de tu negocio."
  cuenta "Cloudflare" "https://dash.cloudflare.com/sign-up" \
    "Donde van a vivir las apps de tu negocio (reservas, pagos, tu página). El plan gratis basta." \
    "Crea la cuenta con el correo del negocio."
  cuenta "Chip prepago" "" \
    "El WhatsApp de tu negocio: un chip prepago nuevo (Entel, WOM, Movistar, Claro…), con una carga chica al mes (unos \$1.000)." \
    "Va en un teléfono de la pega, que se queda en el negocio. No le instales WhatsApp: el número se conecta desde el panel." \
    "¿Ya tienes el chip?"
}
cuenta() {  # nombre, url (vacía = no hay página), línea, línea, [pregunta]
  printf '\n  %s%s%s\n' "$B" "$1" "$R"; di "$3" "$4"
  if cuenta_lista "$1"; then ok "Ya estaba lista."; return 0; fi
  if [ -n "$2" ]; then
    if auto || si_no "¿Abro la página?" s; then abrir "$2"; fi
    if ! auto; then pausa "Enter cuando termines (o si lo dejas para después)"; fi
  fi
  if si_no "${5:-¿Quedó lista la cuenta de $1?}" n; then marcar_cuenta "$1" lista; ok "Anotado: $1 lista."; registrar "cuenta $1" ok "lista"
  else marcar_cuenta "$1" pendiente; di "Anotado como pendiente. Sin problema: se puede hacer después."; registrar "cuenta $1" pendiente "por crear"; fi
}

paso_final() {
  paso 8 "Listo"
  registrar final ok "fin$( [ -n "$PENDIENTES" ] && printf ' con pendientes')"
  if git_ok && [ -d "$DIR/.git" ] && ! ensayo; then
    local msg="Día 0: instalación de El Taller (v$TALLER_VERSION)"
    if git -C "$DIR" rev-parse -q --verify HEAD >/dev/null; then  # re-ejecución: solo lo del instalador, no los cambios del dueño
      msg="El Taller: instalador corrido de nuevo (v$TALLER_VERSION)"
      local p rutas=""; for p in .taller .claude/settings.json negocio/cuentas.md $NUESTRAS; do [ -e "$DIR/$p" ] && rutas="$rutas $p"; done
      # shellcheck disable=SC2086
      [ -n "$rutas" ] && git -C "$DIR" add -A -- $rutas
      # shellcheck disable=SC2086
      [ -n "$CREADOS" ] && git -C "$DIR" add -- $CREADOS
    else git -C "$DIR" add -A; fi
    if ! git -C "$DIR" diff --cached --quiet; then
      local who=(); git -C "$DIR" config user.name >/dev/null || who+=(-c "user.name=$DUENO")
      git -C "$DIR" config user.email >/dev/null || who+=(-c "user.email=$SLUG@eltaller.local")
      git -C "$DIR" "${who[@]}" commit -q -m "$msg" && ok "Guardé todo en el historial."
    fi
  fi
  di "Para hablar con Claude, de cualquiera de estas dos formas:" \
     "  • App de Claude: pestaña Code, y eliges la carpeta $DIR" \
     "  • Terminal:  cd \"$DIR\" && claude" \
     "La primera vez te pregunta si confías en la carpeta: di que sí. Y escríbele:" ""
  printf '      %s"Hola, hagamos el día cero"%s\n\n' "$B" "$R"
  [ -n "$PENDIENTES" ] && { di "Quedó pendiente (vuelve a correr este instalador cuando quieras, no rompe nada):"; printf '%s' "$PENDIENTES"; }
  if ensayo; then di "" "${D}Esto fue un ensayo: no cambié nada en tu computador.$R"; fi
}

main() {
  ENSAYO=0; AUTO="${TALLER_AUTO:-0}"; REG=""; PENDIENTES=""; DIR=""; SRC=""; SO=""; CREADOS=""; NUESTRAS=""
  local a; for a in "$@"; do case "$a" in
    --ensayo|--dry-run) ENSAYO=1 ;;
    -h|--help) echo "Uso: install.sh [--ensayo]   ·   pruebas: TALLER_AUTO=1 TALLER_NEGOCIO=... TALLER_HOME=..."; return 0 ;;
  esac; done
  MODO="normal"; ensayo && MODO="ensayo"; auto && MODO="$MODO+auto"
  colores; set -o pipefail
  if ! auto && ! { : </dev/tty; } 2>/dev/null; then echo "Necesito una terminal para conversar contigo (o TALLER_AUTO=1)." >&2; return 1; fi
  BASE="${TALLER_HOME:-$HOME/ElTaller}"; HOY="$(date +%Y-%m-%d)"
  paso_bienvenida; buscar_fuente
  paso_sistema; paso_carpeta; paso_git; paso_claude; paso_memoria; paso_skills; paso_cuentas; paso_final
  return 0
}

main "$@"
