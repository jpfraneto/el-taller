#!/usr/bin/env bash
# Arma lo que se publica del instalador en public/ del sitio. No publica: imprime el comando para hacerlo.
#   public/taller.sh         = os/install.sh (la línea: Python propio + el panel, y lo abre en el navegador)
#   public/taller/version.json = la versión de taller.py + os/servidor/novedades.txt (el aviso "hay una versión nueva")
#   public/taller.ps1        = os/taller.ps1: arranque ASCII que baja y corre taller/install.ps1
#   public/taller/install.ps1 = os/install.ps1 (con su BOM UTF-8, para PowerShell 5.1)
#   public/taller/os.tar.gz  = os/plantilla/ (incluye .claude/skills)
#   public/taller/servidor.sh     = os/servidor/instalar.sh (el servidor del negocio, en un Mac viejo)
#   public/taller/servidor.tar.gz = servidor/ (taller.py, panel.html, panel-avanzado.html, maestro.md, plantilla/ con negocio/ y .claude/skills)
#   public/taller/reels.sh        = os/reels/instalar.sh (los reels en el computador de cada dueño)
#   public/taller/reels.tar.gz    = reels/tools/ (footage/tools: el pipeline de JP) + estilo-base.json + TASTE-base.md
# Idempotente: si nada cambió, no reescribe nada. Solo toca esos cuatro archivos de public/.
set -euo pipefail

main() {
  local os raiz pub f
  os="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; raiz="$(dirname "$os")"; pub="$raiz/public"; RAIZ="$raiz"
  [ -d "$pub" ] || { echo "No encuentro $pub" >&2; exit 1; }

  # Chequeos antes de publicar
  bash -n "$os/install.sh"
  [ "$(head -c 3 "$os/install.ps1" | od -An -tx1 | tr -d ' \n')" = "efbbbf" ] || { echo "install.ps1 perdió su BOM UTF-8 (PowerShell 5.1 leería mal los acentos)" >&2; exit 1; }
  if LC_ALL=C grep -q '[^[:print:][:space:]]' "$os/taller.ps1"; then echo "taller.ps1 tiene que ser ASCII puro" >&2; exit 1; fi
  for f in recordar mi-negocio dia-cero plan compartir reels; do [ -f "$os/plantilla/.claude/skills/$f/SKILL.md" ] || { echo "Falta la skill $f" >&2; exit 1; }; done

  TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT
  # tar sin metadatos de macOS, gzip sin fecha (-n): mismo contenido → mismos bytes
  COPYFILE_DISABLE=1 tar --exclude .DS_Store -cf - -C "$os" plantilla | gzip -n -9 >"$TMPD/os.tar.gz"
  tar -tzf "$TMPD/os.tar.gz" | grep -q '^plantilla/.claude/skills/dia-cero/SKILL.md$' || { echo "El tar no trae .claude/skills" >&2; exit 1; }

  # El servidor: su plantilla + la memoria negocio/ de os/plantilla
  mkdir -p "$TMPD/s/servidor/plantilla"
  cp "$os/servidor/taller.py" "$os/servidor/guardia.py" "$os/servidor/panel.html" "$os/servidor/panel-avanzado.html" "$os/servidor/maestro.md" "$os/servidor/atencion.md" "$os/servidor/instalar.sh" "$TMPD/s/servidor/"
  mkdir -p "$TMPD/s/servidor/pasarela"; cp "$os/servidor/pasarela/index.js" "$TMPD/s/servidor/pasarela/"
  cp -R "$os/servidor/plantilla/." "$TMPD/s/servidor/plantilla/"; cp -R "$os/plantilla/negocio" "$os/plantilla/.claude" "$TMPD/s/servidor/plantilla/"
  python3 -m py_compile "$TMPD/s/servidor/taller.py" "$TMPD/s/servidor/guardia.py"; rm -rf "$TMPD/s/servidor/__pycache__"; bash -n "$os/servidor/instalar.sh"
  find "$TMPD/s" -exec touch -t 202601010000 {} +   # fechas fijas: mismo contenido → mismos bytes
  COPYFILE_DISABLE=1 tar --exclude .DS_Store -cf - -C "$TMPD/s" servidor | gzip -n -9 >"$TMPD/servidor.tar.gz"

  # Los reels: las herramientas de footage/tools (sin su Python, sin caché, sin lo que solo usa JP) + las plantillas
  bash -n "$os/reels/instalar.sh"; python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$os/reels/estilo-base.json"
  local tools="$raiz/footage/tools"
  mkdir -p "$TMPD/r/reels/tools"
  rsync -a --exclude .venv --exclude __pycache__ --exclude '*.pyc' --exclude .DS_Store --exclude semilla.sh \
    --exclude longcut.py --exclude contact_sheet.py --exclude review_publish.py --exclude ig_mock.py \
    --exclude gymkit.py --exclude woodkit.py --exclude covers_fijados.py "$tools/" "$TMPD/r/reels/tools/"
  for f in episode.py plan_episode.py autoreel.py covers2.py estilo.py ingest.py; do python3 -m py_compile "$TMPD/r/reels/tools/$f"; done
  find "$TMPD/r" -name __pycache__ -prune -exec rm -rf {} +
  cp "$os/reels/estilo-base.json" "$os/reels/TASTE-base.md" "$TMPD/r/reels/"
  find "$TMPD/r" -exec touch -t 202601010000 {} +
  COPYFILE_DISABLE=1 tar --exclude .DS_Store -cf - -C "$TMPD/r" reels | gzip -n -9 >"$TMPD/reels.tar.gz"

  # La versión que ve el panel (aviso de actualización): la de taller.py + la primera línea de novedades.txt
  python3 - "$os/servidor/taller.py" "$os/servidor/novedades.txt" >"$TMPD/version.json" <<'PY'
import json, re, sys
v = re.search(r'^VERSION = "([^"]+)"', open(sys.argv[1]).read(), re.M).group(1)
try:
    notas = open(sys.argv[2]).read().strip().splitlines()[0]
except (OSError, IndexError):
    notas = ""
print(json.dumps({"version": v, "notas": notas}, ensure_ascii=False))
PY

  mkdir -p "$pub/taller"
  poner "$os/install.sh" "$pub/taller.sh"
  poner "$TMPD/version.json" "$pub/taller/version.json"
  poner "$os/taller.ps1" "$pub/taller.ps1"
  poner "$os/install.ps1" "$pub/taller/install.ps1"
  poner "$TMPD/os.tar.gz" "$pub/taller/os.tar.gz"
  poner "$os/servidor/instalar.sh" "$pub/taller/servidor.sh"
  poner "$TMPD/servidor.tar.gz" "$pub/taller/servidor.tar.gz"
  poner "$os/reels/instalar.sh" "$pub/taller/reels.sh"
  poner "$TMPD/reels.tar.gz" "$pub/taller/reels.tar.gz"

  echo
  echo "Para publicar (desde $raiz), cuando JP lo decida:"
  echo "  npx wrangler deploy"
  echo "Después:  curl -fsSL https://jpfraneto.com/taller.sh | bash -s -- --ensayo"
}

poner() {  # origen, destino: copia solo si cambió
  local rel="${2#"$RAIZ"/}"
  if [ -f "$2" ] && cmp -s "$1" "$2"; then echo "  sin cambios  $rel"; return 0; fi
  cp "$1" "$2"; echo "  escrito      $rel  ($(wc -c <"$2" | tr -d ' ') bytes, sha256 $(shasum -a 256 "$2" | cut -c1-12))"
}

main "$@"
