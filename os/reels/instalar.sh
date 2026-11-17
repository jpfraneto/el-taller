#!/bin/bash
# El Taller · los reels en este computador: una grabación al día → 1 a 5 reels que salen solos a su hora.
#   curl -fsSL https://jpfraneto.com/taller/reels.sh | bash
#   … | bash -s -- --ensayo     (muestra qué haría, sin cambiar nada)
#   … | bash -s -- --jp         (JP: El Taller mismo. Clona su repo privado en ~/code/jpfraneto.com y prepara
#                                footage/tools ahí; sus episodios, su estilo y su historia vienen con el repo)
# Deja todo en ~/ElTaller/.reels (herramientas, Python, fuentes Inter) y ~/models/whisper (el modelo que transcribe).
# Cada negocio usa su carpeta redes/ (su formato, sus días); la skill /reels (en Claude) lo guía. macOS.
# Volver a correrlo actualiza las herramientas y no toca nada de los negocios.
set -uo pipefail

R="$HOME/ElTaller/.reels"
URL="${REELS_URL:-https://jpfraneto.com/taller/reels.tar.gz}"
INTER_URL="https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip"
INTER_SHA="9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e"
MODEL="$HOME/models/whisper/ggml-large-v3-turbo.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"
MODEL_SHA="1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69"
ENSAYO=0; JP=0; for a in "$@"; do [ "$a" = --ensayo ] && ENSAYO=1; [ "$a" = --jp ] && JP=1; done
REPO="${JP_REPO:-$HOME/code/jpfraneto.com}"

if [ -t 1 ]; then B=$'\033[1m'; V=$'\033[32m'; Rj=$'\033[31m'; G=$'\033[2m'; N=$'\033[0m'; else B=; V=; Rj=; G=; N=; fi
ok()  { printf '%s✓%s %s\n' "$V" "$N" "$*"; }
mal() { printf '%s✗ %s%s\n' "$Rj" "$*" "$N"; exit 1; }
gris(){ printf '%s%s%s\n' "$G" "$*" "$N"; }
hacer(){ if [ "$ENSAYO" = 1 ]; then gris "  (ensayo) $*"; return 0; fi; "$@"; }
sha() { shasum -a 256 "$1" | cut -d' ' -f1; }

main() {
  printf '\n%s🎬 Los reels de El Taller%s\n\n' "$B" "$N"
  [ "$ENSAYO" = 1 ] && gris "(ensayo: no cambio nada)"
  [ "$(uname -s)" = Darwin ] || mal "Esto es para Mac."
  curl -fsS -m 10 -o /dev/null https://jpfraneto.com || mal "No hay internet."

  # Herramientas de Apple (compilan los dos ayudantes que encuentran tu cara y te recortan para las portadas)
  if ! xcode-select -p >/dev/null 2>&1; then
    printf 'Se abre una ventana de Apple: aprieta %sInstalar%s y espera. Después vuelve a pegar la línea.\n' "$B" "$N"
    hacer xcode-select --install; exit 0
  fi
  ok "Herramientas de Apple"

  # Homebrew (lo que trae ffmpeg, el transcriptor, uv y el túnel para publicar). Pide la clave de tu Mac una vez.
  [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
  [ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
  if ! command -v brew >/dev/null; then
    printf 'Instalo Homebrew (el instalador oficial, brew.sh). Te va a pedir la %sclave de tu Mac%s: escríbela (no se ve) y Enter.\n' "$B" "$N"
    hacer /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/tty || mal "Homebrew no se instaló."
    [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
    [ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
  fi
  ok "Homebrew"
  export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ENV_HINTS=1 HOMEBREW_NO_INSTALL_CLEANUP=1
  [ -x "$HOME/.local/bin/uv" ] && export PATH="$HOME/.local/bin:$PATH"
  local falta=()                              # only what's missing: never a second copy of something already there
  command -v ffmpeg >/dev/null || falta+=(ffmpeg)
  command -v whisper-cli >/dev/null || falta+=(whisper-cpp)
  command -v uv >/dev/null || falta+=(uv)
  command -v cloudflared >/dev/null || falta+=(cloudflared)
  [ ${#falta[@]} -eq 0 ] || hacer brew install --quiet "${falta[@]}" >/dev/null || mal "No pude instalar: ${falta[*]}"
  if [ ! -d "/Applications/Google Chrome.app" ]; then
    hacer brew install --quiet --cask google-chrome >/dev/null || mal "No pude instalar Google Chrome (lo usan las portadas)."
  fi
  ok "ffmpeg · transcriptor · uv · túnel · Chrome"

  # JP: su repo (privado) trae las herramientas, su estilo, sus episodios. Se entra a GitHub en el navegador.
  if [ "$JP" = 1 ]; then
    command -v gh >/dev/null || hacer brew install --quiet gh >/dev/null || mal "No pude instalar gh (GitHub)."
    if [ ! -d "$REPO/.git" ]; then
      if [ "$ENSAYO" = 0 ] && ! gh auth status >/dev/null 2>&1; then
        printf 'Entra a GitHub (se abre el navegador; copia el código de 8 letras que aparece aquí).\n'
        gh auth login --hostname github.com --git-protocol https --web </dev/tty || mal "No se conectó GitHub."
      fi
      hacer mkdir -p "$(dirname "$REPO")"
      hacer gh repo clone jpfraneto/jpfraneto.com "$REPO" -- --quiet || mal "No pude clonar jpfraneto/jpfraneto.com."
    else
      hacer git -C "$REPO" pull --ff-only --quiet || mal "Tu copia del repo tiene cambios sin subir: resuélvelo y vuelve a correr esto."
    fi
    if [ "$ENSAYO" = 0 ]; then
      [ -d "$REPO/footage/tools/.venv" ] || uv venv -q --python 3.12 "$REPO/footage/tools/.venv" || mal "No pude crear el Python."
      uv pip install -q --python "$REPO/footage/tools/.venv/bin/python" pillow numpy || mal "No pude instalar Pillow y numpy."
    fi
    ok "Repo de El Taller: $REPO"
  fi

  # Las herramientas de los reels (las mismas que usa JP), en ~/ElTaller/.reels/tools
  if [ "$ENSAYO" = 0 ] && [ "$JP" = 0 ]; then
    local t; t="$(mktemp -d)"
    curl -fsSL "$URL" -o "$t/reels.tgz" || mal "No pude bajar las herramientas."
    tar -xzf "$t/reels.tgz" -C "$t" || mal "El paquete llegó roto."
    mkdir -p "$R"; rm -rf "$R/tools"; mv "$t/reels/tools" "$R/tools"
    cp "$t/reels/estilo-base.json" "$t/reels/TASTE-base.md" "$R/"; rm -rf "$t"
    [ -d "$R/.venv" ] || uv venv -q --python 3.12 "$R/.venv" || mal "No pude crear el Python de los reels."
    uv pip install -q --python "$R/.venv/bin/python" pillow numpy || mal "No pude instalar Pillow y numpy."
  fi
  [ "$JP" = 0 ] && ok "Herramientas de los reels"

  # Inter: la letra de las portadas y los subtítulos (licencia libre; SF Pro de Apple no se puede usar en marcas)
  if [ "$ENSAYO" = 0 ] && [ ! -f "$R/fuentes/Inter-Black.otf" ]; then
    local t; t="$(mktemp -d)"
    curl -fsSL "$INTER_URL" -o "$t/inter.zip" || mal "No pude bajar la letra Inter."
    [ "$(sha "$t/inter.zip")" = "$INTER_SHA" ] || mal "La letra Inter llegó distinta a la original."
    mkdir -p "$R/fuentes"
    unzip -q -j -o "$t/inter.zip" extras/otf/Inter-Black.otf extras/otf/Inter-ExtraBold.otf extras/otf/Inter-Bold.otf \
      extras/otf/Inter-SemiBold.otf extras/otf/Inter-Medium.otf LICENSE.txt -d "$R/fuentes" || mal "No pude abrir la letra Inter."
    rm -rf "$t"
  fi
  ok "Letra Inter"

  # El modelo que transcribe (1,6 GB, una vez)
  if [ "$ENSAYO" = 0 ] && { [ ! -f "$MODEL" ] || [ "$(sha "$MODEL")" != "$MODEL_SHA" ]; }; then
    printf 'Bajo el modelo que transcribe tu voz (1,6 GB, una sola vez). Puede tardar.\n'
    mkdir -p "$(dirname "$MODEL")"
    curl -fL --progress-bar -o "$MODEL.part" "$MODEL_URL" || mal "La descarga del modelo se cortó. Vuelve a pegar la línea."
    [ "$(sha "$MODEL.part")" = "$MODEL_SHA" ] || { rm -f "$MODEL.part"; mal "El modelo llegó distinto al original."; }
    mv "$MODEL.part" "$MODEL"
  fi
  ok "Transcriptor (whisper large-v3-turbo)"

  # Revisión final: que todo esté donde las herramientas lo buscan
  [ -x "$HOME/.local/bin/claude" ] && export PATH="$HOME/.local/bin:$PATH"
  if [ "$ENSAYO" = 0 ]; then
    command -v whisper-cli ffmpeg ffprobe uv cloudflared >/dev/null || mal "Falta algo de Homebrew."
    local py="$R/.venv/bin/python" tl="$R/tools"
    [ "$JP" = 1 ] && py="$REPO/footage/tools/.venv/bin/python" tl="$REPO/footage/tools"
    "$py" -c "import sys; sys.path.insert(0, '$tl'); import estilo, episode; print(estilo.fuente('Black'))" >/dev/null \
      || mal "Las herramientas no arrancan."
    case "$("$py" -c "import sys; sys.path.insert(0, '$tl'); import estilo; print(estilo.fuente('Black'))")" in
      *SF-Pro*) ok "Letra de las portadas: SF Pro" ;;
      *) ok "Letra de las portadas: Inter (SF Pro no está en este Mac)" ;;
    esac
  fi
  local pendiente=""
  command -v claude >/dev/null || pendiente="$pendiente\n  · Claude Code (planea los reels): curl -fsSL https://jpfraneto.com/taller.sh | bash   (o https://claude.ai/install.sh) y entra."
  if [ "$JP" = 1 ] && [ ! -f "$HOME/.config/eltaller/instagram.env" ]; then
    pendiente="$pendiente\n  · Tus credenciales de Instagram: desde el otro Mac, AirDrop de ~/.config/eltaller/instagram.env (en Finder: ⌘⇧G y pega esa ruta),\n    y aquí: mkdir -p ~/.config/eltaller && mv ~/Downloads/instagram.env ~/.config/eltaller/"
  fi
  [ -n "$pendiente" ] && printf '\n%sFalta:%s%b\n' "$B" "$N" "$pendiente"
  if [ "$JP" = 1 ]; then
    printf '\n%s🎬 Listo.%s Para el episodio de hoy:\n' "$B" "$N"
    printf '  cd %s/footage\n' "$REPO"
    printf '  tools/.venv/bin/python tools/new_episode.py <NN> <slug> "<Nombre>"\n'
    printf '  tools/.venv/bin/python tools/episode.py watch      %s(y AirDrop de la grabación a este Mac)%s\n' "$G" "$N"
    [ "$ENSAYO" = 0 ] && (cd "$REPO/footage" && tools/.venv/bin/python tools/episode.py 2>/dev/null | tail -4)
  else
    printf '\n%s🎬 Listo.%s Pídele a Claude: %s"hagamos mis reels"%s (la primera vez descubren juntos tu formato).\n' "$B" "$N" "$B" "$N"
  fi
}

main "$@"
