#!/bin/bash
# Árbol de Lilith · publica tu página en TU cuenta de Cloudflare, en tu dominio (dominio.txt).
#   bash publicar.sh                # la primera vez y cada vez que quieras actualizarla
#   bash publicar.sh --nuevo-link   # otro link privado para tu panel (el anterior deja de servir)
#   bash publicar.sh --ensayo       # muestra qué haría, sin cambiar nada
# Lo único que pide: un Enter antes de abrir Cloudflare en el navegador (para "Allow"). macOS.
set -uo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"; cd "$AQUI" || exit 1
ESTADO="$HOME/.eltaller/arboldelilith-pagina"   # base de datos y fecha del link: nada secreto, fuera de la carpeta
CONFIG="$AQUI/wrangler.mio.jsonc"
NODO="$HOME/.eltaller/node"
DOMINIO="$(tr -d ' \n' < "$AQUI/dominio.txt" 2>/dev/null)"
ENSAYO=0; NUEVO_LINK=0
for a in "$@"; do case "$a" in --ensayo) ENSAYO=1 ;; --nuevo-link) NUEVO_LINK=1 ;; -h|--help) sed -n 2,6p "$0"; exit 0 ;; esac; done

if [ -t 1 ]; then B=$'\033[1m'; V=$'\033[32m'; R=$'\033[31m'; G=$'\033[2m'; N=$'\033[0m'; else B=; V=; R=; G=; N=; fi
ok()  { printf '%s✓%s %s\n' "$V" "$N" "$*"; }
mal() { printf '%s✗ %s%s\n' "$R" "$*" "$N"; exit 1; }
gris(){ printf '%s%s%s\n' "$G" "$*" "$N"; }
w()   { npx --yes wrangler "$@"; }
js()  { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const d=JSON.parse(s);$1}catch{}})" "${@:2}"; }
leer(){ [ -f "$ESTADO" ] && grep "^$1=" "$ESTADO" | tail -1 | cut -d= -f2-; }
guardar(){ [ "$ENSAYO" = 1 ] && return 0; mkdir -p "$(dirname "$ESTADO")"; { grep -v "^$1=" "$ESTADO" 2>/dev/null; printf '%s=%s\n' "$1" "$2"; } > "$ESTADO.tmp"; mv "$ESTADO.tmp" "$ESTADO"; }
[ "$ENSAYO" = 1 ] && gris "(ensayo: no cambio nada)"

[ "$(uname -s)" = Darwin ] || mal "Esto es para Mac."
[ -n "$DOMINIO" ] || mal "Falta dominio.txt."
curl -fsS -m 10 -o /dev/null https://www.cloudflare.com || mal "No hay internet."

# Node (portátil, verificado contra nodejs.org; sin clave de administradora)
[ -x "$NODO/bin/node" ] && export PATH="$NODO/bin:$PATH"
if ! { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; } 2>/dev/null; then
  if [ "$ENSAYO" = 1 ]; then gris "bajaría Node 22 de nodejs.org"; else
    ARQ="$(uname -m)"; [ "$ARQ" = x86_64 ] && ARQ=x64
    L="$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -E "darwin-${ARQ}\.tar\.gz$" | head -1)"
    F="${L##* }"; S="${L%% *}"; T="$(mktemp -d)"
    [ -n "$F" ] && curl -fsSL -o "$T/$F" "https://nodejs.org/dist/latest-v22.x/$F" || mal "No pude bajar Node."
    [ "$(shasum -a 256 "$T/$F" | cut -d' ' -f1)" = "$S" ] || mal "Node no coincide con el original."
    rm -rf "$NODO"; mkdir -p "$NODO"; tar -xzf "$T/$F" -C "$NODO" --strip-components 1; rm -rf "$T"
    export PATH="$NODO/bin:$PATH"
  fi
fi
[ "$ENSAYO" = 1 ] || [ -d node_modules/wrangler ] || npm install --no-audit --no-fund --loglevel=error >/dev/null || mal "No pude instalar la herramienta de Cloudflare."
ok "Herramientas"

# Cloudflare: tu cuenta
CUENTA=""
if [ "$ENSAYO" = 0 ]; then
  CUENTA="$(w whoami --json 2>/dev/null | js 'if(d.loggedIn&&d.accounts.length)process.stdout.write(d.accounts[0].id)')"
  if [ -z "$CUENTA" ]; then
    printf '\nSe abre Cloudflare en tu navegador: entra y aprieta %sAllow%s. Después vuelve aquí.\n%s[Enter]%s ' "$B" "$N" "$G" "$N"
    read -r _ </dev/tty; w login >/dev/null 2>&1
    CUENTA="$(w whoami --json 2>/dev/null | js 'if(d.loggedIn&&d.accounts.length)process.stdout.write(d.accounts[0].id)')"
    [ -n "$CUENTA" ] || mal "No se conectó con Cloudflare. Vuelve a correr esto."
  fi
fi
ok "Cloudflare"

# Tu dominio tiene que apuntar a Cloudflare (guía, pasos 1 y 2). Si todavía no, espero aquí.
apunta() { dig +short NS "$DOMINIO" @1.1.1.1 2>/dev/null | grep -qi 'ns\.cloudflare\.com'; }
if [ "$ENSAYO" = 0 ] && ! apunta; then
  printf 'Esperando que %s llegue a Cloudflare (guía, pasos 1 y 2). Puede tardar; no cierres esta ventana' "$DOMINIO"
  until apunta; do printf '.'; sleep 30; done; printf '\n'
fi
ok "$DOMINIO"

# Base de datos (tuya, en tu cuenta)
DB="arboldelilith"; DB_ID="$(leer DB_ID)"
buscar() { w d1 list --json 2>/dev/null | js 'const x=d.find(b=>b.name===process.argv[1]);if(x)process.stdout.write(x.uuid)' "$DB"; }
if [ "$ENSAYO" = 0 ] && [ -z "$DB_ID" ]; then
  DB_ID="$(buscar)"; [ -n "$DB_ID" ] || { w d1 create "$DB" </dev/null >/dev/null 2>&1; DB_ID="$(buscar)"; }
  [ -n "$DB_ID" ] || mal "No pude crear la base de datos. Vuelve a correr esto."
  guardar DB_ID "$DB_ID"
fi
if [ "$ENSAYO" = 0 ]; then
  cat > "$CONFIG" <<EOF
{
  // publicar.sh: tu página en tu cuenta. Para cambiarla, vuelve a correr publicar.sh.
  "name": "arboldelilith",
  "account_id": "$CUENTA",
  "main": "src/worker.js",
  "compatibility_date": "2025-10-01",
  "routes": [{ "pattern": "$DOMINIO", "custom_domain": true }, { "pattern": "www.$DOMINIO", "custom_domain": true }],
  "assets": { "directory": "./public", "binding": "ASSETS", "run_worker_first": true },
  "d1_databases": [{ "binding": "DB", "database_name": "$DB", "database_id": "$DB_ID" }],
  // Modo prueba (guía, "Lo que falta"): el código para entrar se ve en pantalla y los pagos no cobran.
  "vars": { "PUBLIC_URL": "https://$DOMINIO", "DEMO_OTP": "1", "DEMO": "1" }
}
EOF
  w d1 execute "$DB" --remote --file=schema.sql -y -c "$CONFIG" >/dev/null 2>&1 || mal "No pude preparar la base de datos. Vuelve a correr esto."
fi
ok "Base de datos"

# Publicar
if [ "$ENSAYO" = 0 ]; then
  LOG="$(mktemp)"
  if ! w deploy -c "$CONFIG" >"$LOG" 2>&1; then
    grep -qiE "zone|custom domain|hostname" "$LOG" && mal "Cloudflare todavía no activa $DOMINIO. En dash.cloudflare.com tiene que decir Active; espera y vuelve a correr esto."
    tail -5 "$LOG"; mal "No se pudo publicar. Vuelve a correr esto; si se repite, foto de esta ventana a JP."
  fi
  rm -f "$LOG"
fi
ok "Publicada: https://$DOMINIO"

# Tu link privado (la llave de tu panel). No queda guardado en ninguna parte: guárdalo tú.
LINK=""
if [ "$ENSAYO" = 0 ] && { [ -z "$(leer LINK)" ] || [ "$NUEVO_LINK" = 1 ]; }; then
  CLAVE="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"
  printf '%s' "$CLAVE" | w secret put PILI_KEY -c "$CONFIG" >/dev/null 2>&1 || mal "No pude crear tu link. Corre: bash publicar.sh --nuevo-link"
  guardar LINK "$(date +%Y-%m-%d)"; LINK="https://$DOMINIO/pili/entrar/$CLAVE"
fi

printf '\n%s🌿 Listo%s  https://%s\n' "$B" "$N" "$DOMINIO"
if [ -n "$LINK" ]; then
  printf '\nTu link privado (tu panel). Guárdalo en tus Notas y no lo compartas:\n%s%s%s\n' "$B" "$LINK" "$N"
  open "$LINK" 2>/dev/null
elif [ "$ENSAYO" = 0 ]; then
  open "https://$DOMINIO" 2>/dev/null
fi
