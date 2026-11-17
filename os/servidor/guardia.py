#!/usr/bin/env python3
"""El Taller · la guardia: lo que Ruben no hace sin el sí del dueño por WhatsApp.

Ruben trabaja sin pedir permiso dentro de la carpeta del negocio. Pero publicar, desplegar, borrar en serio, pagar,
pautar o escribirle a otros (cosas que ve el mundo o que cuestan plata) esperan un "sí" del dueño. El servidor
(taller.py) pone ELTALLER_CONFIRMADO=1 solo en el turno que sigue a ese sí; sin eso, estos comandos se frenan.

Es una baranda, no una jaula: un comando disfrazado (un script que llama a la API) no se ve aquí. La regla de verdad
está en maestro.md; esto atrapa los caminos normales y le recuerda a Ruben cómo pedir el sí.

Uso:  necesita_si(comando) → razón o ""   ·   como hook de Claude Code (PreToolUse, Bash): lee el JSON por stdin,
      sale con 2 y explica por stderr si hay que frenar. Otro agente puede llamar a necesita_si() igual.
"""
import json
import os
import re
import sys

REGLAS = [
    (r"\bwrangler\b[^|;&]*\b(deploy|publish|delete|rollback|secret\s+(put|delete|bulk)|versions\s+deploy|pages\s+deploy)\b", "publicar en internet"),
    (r"\bwrangler\b[^|;&]*\b(kv|r2)\b[^|;&]*\b(put|delete)\b", "cambiar datos publicados"),
    (r"\bwrangler\b[^|;&]*\bd1\b[^|;&]*\bexecute\b[^|;&]*--remote\b", "cambiar datos publicados"),
    (r"\bgit\s+push\b", "publicar el código"),
    (r"\bgit\s+(reset\s+--hard|clean\s+-\w*f|branch\s+-D|filter-(branch|repo))\b", "borrar historia"),
    (r"\bgh\s+(repo\s+(create|delete|edit|rename)|release\s+create|pr\s+merge|secret\s+set)\b", "publicar en GitHub"),
    (r"\b(npm|pnpm|yarn|bun)\s+publish\b", "publicar un paquete"),
    (r"\b(vercel|netlify)\b[^|;&]*\b(deploy|--prod)\b", "publicar en internet"),
    (r"\b(publish_ig|review_publish)\.py\b|\bepisode\.py\b[^|;&]*\bpublish\b", "publicar en Instagram"),
    (r"\brm\s+(-\w*r\w*f|-\w*f\w*r|-r\s+-f|-f\s+-r)\b|\bfind\b[^|;&]*\s-delete\b", "borrar archivos de a muchos"),
    (r"(graph\.facebook\.com|graph\.instagram\.com)[^|;&]*(-X\s*(POST|DELETE)|--data|\s-d\s|\s-F\s|--form)"
     r"|(-X\s*(POST|DELETE)|--data|\s-d\s|\s-F\s|--form)[^|;&]*(graph\.facebook\.com|graph\.instagram\.com)", "escribirle a otros o pautar en Meta"),
    (r"api\.mercadopago\.com|api\.mercadolibre\.com", "mover plata"),
]
REGLAS = [(re.compile(p, re.I), r) for p, r in REGLAS]

MENSAJE = ("El Taller: esto necesita el sí del dueño ({razon}). No lo hagas todavía. Prepara todo lo que puedas sin "
           "hacerlo, cuéntale en una o dos frases qué vas a hacer y qué puede salir mal, y termina tu respuesta con una "
           "línea sola: >> CONFIRMAR: <lo que harás, en una frase>. Cuando él diga que sí, lo haces.")


def necesita_si(comando):
    for patron, razon in REGLAS:
        if patron.search(comando or ""):
            return razon
    return ""


def main():
    try:
        d = json.load(sys.stdin)
    except ValueError:
        return 0
    if d.get("tool_name") != "Bash" or os.environ.get("ELTALLER_CONFIRMADO") == "1":
        return 0
    razon = necesita_si((d.get("tool_input") or {}).get("command", ""))
    if not razon:
        return 0
    print(MENSAJE.format(razon=razon), file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
