#!/bin/bash
# La semilla de un negocio de El Taller, en un .zip para mandarle al dueño (AirDrop o WhatsApp).
#
#   tools/semilla.sh ep04-endemico            → el-taller/semillas/endemico.zip
#   tools/semilla.sh ep04-endemico --carpeta  → además deja la carpeta armada al lado, para revisarla
#   tools/semilla.sh todas                    → una por cada episodio que tenga semilla/negocio/contexto-inicial.md
#
# Prototipo: <ep>/prototype, o la ruta en <ep>/semilla/sitio.txt (desde la raíz del repo, p. ej. webs/aubel).
# Qué lleva (el mismo molde que ep07-arboldelilith/semilla/armar.sh):
#   <slug>/LEEME.md                    cómo usarla: con El Taller o con el agente que el dueño ya tenga
#   <slug>/negocio/contexto-inicial.md la síntesis de quiénes son, como datos por confirmar (El Taller la lee el día 0)
#   <slug>/sitio/                      el prototipo (si hay), sin node_modules, sin secretos, sin base de datos local
# Si encuentra algo que parece una llave o un archivo de llaves del episodio, no deja el zip.
set -euo pipefail
TALLER="$(cd "$(dirname "$0")/../el-taller" && pwd)"
SALIDA="$TALLER/semillas"

armar() {
  local ep="${1%/}" carpeta="${2:-}"
  local EP="$TALLER/$ep"
  local CTX="$EP/semilla/negocio/contexto-inicial.md"
  [ -f "$CTX" ] || { echo "✗ $ep: falta semilla/negocio/contexto-inicial.md" >&2; return 1; }
  local slug; slug="$(cat "$EP/semilla/slug.txt" 2>/dev/null || echo "${ep#ep[0-9][0-9]-}")"
  # "# Lo que JP preparó sobre Endémico, antes de que…" → Endémico
  local nombre; nombre="$(head -1 "$CTX" | sed -E 's/^# Lo que JP preparó sobre (.*), antes de.*/\1/')"
  [ "$nombre" = "$(head -1 "$CTX")" ] && nombre="$slug"

  local T; T="$(mktemp -d)"
  local D="$T/$slug"
  mkdir -p "$D/negocio"
  cp "$CTX" "$D/negocio/contexto-inicial.md"
  # the prototype is <ep>/prototype, or the path in semilla/sitio.txt (relative to the repo root, e.g. webs/aubel)
  local PROTO="$EP/prototype"
  [ -f "$EP/semilla/sitio.txt" ] && PROTO="$TALLER/../../$(tr -d ' \n' < "$EP/semilla/sitio.txt")"
  local hay_sitio=0
  if [ -d "$PROTO" ]; then
    hay_sitio=1
    rsync -a \
      --exclude node_modules --exclude .wrangler --exclude '.dev.vars*' --exclude '.env*' --exclude .seed.sql \
      --exclude BRIEF.md --exclude '.*_key' --exclude 'wrangler.mio.jsonc' --exclude .DS_Store --exclude '*.sqlite*' \
      "$PROTO/" "$D/sitio/"
    [ -f "$EP/cosa.json" ] && cp "$EP/cosa.json" "$D/sitio/cosa.json"
  fi

  {
    printf '# %s · tu semilla de El Taller\n\n' "$nombre"
    printf 'Esta carpeta es lo que JP (El Taller, instagram.com/eltallerconjp) aprendió de tu negocio'
    [ "$hay_sitio" = 1 ] && printf ', y lo que te construyó' ; printf '. Es tuya.\n\n'
    printf -- '- `negocio/contexto-inicial.md`: quiénes son, cómo hablan, qué ofrecen, qué les cuesta. Son **datos por confirmar**:\n'
    printf '  lo armó JP mirando desde afuera. Corrige lo que no sea así.\n'
    [ "$hay_sitio" = 1 ] && printf -- '- `sitio/`: el código de la página que te hizo JP. Puedes usarlo tal cual, cambiarlo o publicarlo en tu propia\n  cuenta, sin pagarle nada a nadie.\n'
    printf '\n## Cómo usarla\n\n'
    printf '**Con tu agente** (Claude Code o el que uses): abre esta carpeta con él y escríbele:\n\n'
    printf '> Lee LEEME.md y negocio/contexto-inicial.md. Eso es mi negocio visto desde afuera. Pregúntame, de a una cosa,\n'
    printf '> lo que no esté claro, y después ayúdame a hacer lo primero que más me sirva.\n\n'
    printf '**Con El Taller:** pon esta carpeta en `~/ElTaller/%s`. Tu amigo la lee el día cero y ya te conoce.\n\n' "$slug"
    printf 'Si quieres hacerlo con JP, escríbele por Instagram: @eltallerconjp.\n'
    printf '\n---\n\n## Para el agente\n\n'
    printf 'Antes de cambiar nada, lee `negocio/contexto-inicial.md` completo. Nada de ahí es verdad hasta que el dueño lo confirme:\n'
    printf 'pregunta "¿Entendí bien que…?" en vez de preguntar desde cero.'
    [ "$hay_sitio" = 1 ] && printf ' Lo que necesita `sitio/` para quedar en las cuentas del dueño\nestá en `sitio/README.md` (y en `sitio/GUIA.md` si existe) y en la sección "Para dejarlo andando en sus cuentas". Las llaves (Mercado Pago, etc.) son\nsiempre las del dueño: pídeselas a él, nunca las escribas en un archivo que se suba.'
    printf '\n'
  } > "$D/LEEME.md"

  # Nada que parezca llave. Además, ningún valor de los archivos de llaves del episodio.
  local patron='APP_USR-[0-9]{6,}|TEST-[0-9]{6,}-|sk-ant-[A-Za-z0-9_-]{10,}|sk-or-[A-Za-z0-9_-]{10,}|EA[AG][A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY'
  if grep -rIlE "$patron" "$D" >/dev/null 2>&1; then
    echo "✗ $ep: algo parece una llave, no armo el zip:" >&2; grep -rIlE "$patron" "$D" >&2; rm -rf "$T"; return 1
  fi
  local f v
  for f in "$PROTO"/.*_key "$EP"/.*_key "$PROTO"/.dev.vars; do
    [ -f "$f" ] || continue
    while IFS= read -r v; do
      v="${v#*=}"; v="${v//\"/}"; [ "${#v}" -ge 8 ] || continue
      if grep -rqsF -- "$v" "$D"; then echo "✗ $ep: un valor de $(basename "$f") quedó adentro, no armo el zip." >&2; rm -rf "$T"; return 1; fi
    done < "$f"
  done

  mkdir -p "$SALIDA"
  local Z="$SALIDA/$slug.zip"
  rm -f "$Z"
  (cd "$T" && COPYFILE_DISABLE=1 zip -qr -X "$Z" "$slug" -x '*.DS_Store')
  local n; n="$(find "$D" -type f | wc -l | tr -d ' ')"
  if [ "$carpeta" = "--carpeta" ]; then rm -rf "${SALIDA:?}/$slug"; mv "$D" "$SALIDA/$slug"; fi
  rm -rf "$T"
  printf '✓ %-14s %s · %s archivos · %s%s\n' "$slug" "$nombre" "$n" "$(du -h "$Z" | cut -f1 | tr -d ' ')" \
    "$([ "$hay_sitio" = 1 ] && echo ' · con sitio/' || echo ' · solo contexto')"
}

[ $# -ge 1 ] || { sed -n 2,13p "$0"; exit 1; }
if [ "$1" = todas ]; then
  for c in "$TALLER"/ep*/semilla/negocio/contexto-inicial.md; do
    ep="${c#"$TALLER"/}"; armar "${ep%%/*}" "${2:-}" || true
  done
  echo "→ $SALIDA"
else
  armar "$1" "${2:-}"
  echo "→ $SALIDA"
fi
