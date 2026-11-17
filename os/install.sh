#!/bin/bash
# El Taller · una línea que deja todo andando y abre el panel en el navegador (Mac).
#   curl -fsSL https://jpfraneto.com/taller.sh | bash                 (empieza de cero)
#   curl -fsSL https://jpfraneto.com/taller.sh | bash -s K7P2-QX9M    (con el código de su espacio: empieza con su negocio)
# Baja su propio Python (no hace falta nada instalado), el panel, lo deja arrancando solo y lo abre.
# Todo lo demás (Claude, el negocio, WhatsApp) se hace en el panel, con botones. Volver a correrla actualiza.
# Pruebas: TALLER_HOME=<carpeta> · TALLER_URL=<servidor.tar.gz> · TALLER_SIN_ARRANQUE=1 (sin launchd) · TALLER_NO_ABRIR=1
# (El instalador de antes, por terminal y con preguntas, quedó en os/install-terminal.sh: no se publica.)
set -euo pipefail

main() {
  local B="" V="" R=""
  if [ -t 1 ]; then B=$'\033[1m'; V=$'\033[32m'; R=$'\033[0m'; fi
  printf '\n%sEl Taller%s · dejando todo listo en este computador (menos de un minuto)…\n' "$B" "$R"

  if [ "$(uname -s)" != Darwin ]; then
    printf '\nPor ahora El Taller se instala en Mac. Para Windows o Linux, escríbele a JP: +56 9 8549 1126\n\n'; exit 1
  fi

  # Python propio (python-build-standalone 20261026, CPython 3.12.16): no depende de las herramientas de Apple
  local arq py url sum
  case "$(uname -m)" in
    arm64) arq=aarch64; sum=353d5f1b4fd2715e7053f12f068435d5bbad16b91e057006b5d01e0925709a7e ;;
    *)     arq=x86_64;  sum=37c38fda76fec1fbf310adcbafb7f0d96af13b5511bf8ea954c3aa8eec185734 ;;
  esac
  url="https://github.com/astral-sh/python-build-standalone/releases/download/20261026/cpython-3.12.16%2B20261026-${arq}-apple-darwin-install_only_stripped.tar.gz"
  local base="${TALLER_HOME:-$HOME/ElTaller}"
  py="$base/.python/bin/python3"
  mkdir -p "$base"
  local tmp; tmp="$(mktemp -d)"; trap "rm -rf '$tmp'" EXIT

  if ! "$py" -c 'import ssl, sqlite3' >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$tmp/py.tgz"
    if [ "$(shasum -a 256 "$tmp/py.tgz" | cut -d' ' -f1)" != "$sum" ]; then
      printf '\nLa descarga llegó dañada. Vuelve a intentarlo en un rato.\n\n'; exit 1
    fi
    tar -xzf "$tmp/py.tgz" -C "$tmp"
    rm -rf "$base/.python"; mv "$tmp/python" "$base/.python"
  fi
  printf '  %s✓%s Python\n' "$V" "$R"

  # El panel y el programa que atiende tu WhatsApp
  curl -fsSL "${TALLER_URL:-https://jpfraneto.com/taller/servidor.tar.gz}" -o "$tmp/s.tgz"
  tar -xzf "$tmp/s.tgz" -C "$tmp"
  mkdir -p "$base/.servidor"
  cp -R "$tmp/servidor/." "$base/.servidor/"
  printf '  %s✓%s El Taller\n' "$V" "$R"

  # ¿Vino con código? (curl … | bash -s K7P2-QX9M): el panel lo toma y baja el negocio desde su espacio en El Taller
  local codigo="${1:-${TALLER_CODIGO:-}}"
  if [ -n "$codigo" ]; then
    local priv="$HOME/Library/Application Support/ElTaller"
    mkdir -p "$priv"; chmod 700 "$priv"
    printf '%s' "$codigo" >"$priv/codigo-pendiente"; chmod 600 "$priv/codigo-pendiente"
    printf '  %s✓%s Tu código: %s\n' "$V" "$R" "$codigo"
  fi

  # Que arranque solo (al prender el computador, y si se cae se levanta)
  # (si otro programa ya usa el puerto 4747, El Taller elige otro libre y lo dice en la línea "PANEL …")
  local panel="" salida=""
  if [ "${TALLER_SIN_ARRANQUE:-0}" = 1 ]; then
    (nohup "$py" "$base/.servidor/taller.py" >"$base/.servidor/prueba.log" 2>&1 &)
  else
    salida="$("$py" "$base/.servidor/taller.py" --arranque)"
    panel="$(printf '%s\n' "$salida" | sed -n 's/^PANEL //p' | tail -1)"
  fi
  panel="${panel:-http://localhost:${TALLER_PANEL_PORT:-4747}}"
  local vivo=0
  for _ in $(seq 1 30); do curl -fs -m 2 -o /dev/null "$panel/" && { vivo=1; break; }; sleep 1; done
  if [ "$vivo" != 1 ]; then
    printf '\nEl panel no respondió en %s.\nMándale a JP lo que dice este archivo: ~/Library/Application Support/ElTaller/servidor.log\n\n' "$panel"; exit 1
  fi
  printf '  %s✓%s Arranca solo\n' "$V" "$R"

  [ "${TALLER_NO_ABRIR:-0}" = 1 ] || open "$panel/"
  printf '\n%sListo.%s El Taller se abrió en tu navegador (%s).\nPuedes cerrar esta ventana: todo lo demás se hace ahí.\n\n' "$B" "$R" "$panel"
}

main "$@"
