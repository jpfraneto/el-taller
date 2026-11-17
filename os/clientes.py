#!/usr/bin/env python3
"""El Taller · los espacios de los clientes, desde el Mac de JP (sin dependencias).

  os/clientes.py                       la lista: quién entró, cuánto contexto dejó, su fecha y si pagó
  os/clientes.py enlace --negocio "Umbral Sur" --nombre Iván [--telefono 569…] [--instagram refugiosumbralsur]
                        [--prototipo https://umbralsur.jpfraneto.com --titulo "Refugio Bruma"]
                                       crea (o actualiza) su espacio y da SU enlace: sirve UNA vez (7 días para abrirlo).
                                       --varias si: sirve las veces que quiera hasta que vence (menos seguro)
  os/clientes.py enlace <id>           otro enlace para una cuenta que ya existe
  os/clientes.py confirmar <id>        pagó por fuera (link fijo): su fecha queda fija
  os/clientes.py perfil <id> [--foto URL|archivo.jpg] [--linea "…"] [--web URL] [--whatsapp 569…] [--app URL]
                        [--publico si|no] [--inicio AAAA-MM-DD]
                                       su perfil en /p/<instagram> (se ve solo con --publico si: pídele su sí antes).
                                       --inicio fija una fecha ya pagada (el cliente cero, o un pago por fuera)
  os/clientes.py codigo <id>           su línea de instalación con un código nuevo (sirve una vez, 7 días)
  os/clientes.py subir <id> <archivo|carpeta>…   sube contexto a su cuenta (llega a su computador con el código)
  os/clientes.py nota <id> "texto o link"       una nota o un link en su contexto
  os/clientes.py borrar <id>           borra la cuenta y sus archivos (pruebas, errores; no se deshace)
  os/clientes.py traer <id> <carpeta>  baja su contexto a <carpeta>/negocio/contexto/ (+ contexto-inicial.md)

La clave: ~/.config/eltaller/admin.env (ADMIN_CLAVE=…), la misma que el secreto ADMIN_CLAVE del Worker el-taller.
"""
import json, os, re, sys, urllib.parse, urllib.request
from datetime import datetime
from pathlib import Path

BASE = os.environ.get("TALLER_BASE", "https://eltallerconjp.jpfraneto.com")


def clave():
    if os.environ.get("ADMIN_CLAVE"):
        return os.environ["ADMIN_CLAVE"]
    f = Path.home() / ".config/eltaller/admin.env"
    for linea in f.read_text().splitlines() if f.exists() else []:
        if linea.startswith("ADMIN_CLAVE="):
            return linea.split("=", 1)[1].strip()
    sys.exit("Falta ADMIN_CLAVE en ~/.config/eltaller/admin.env")


def pedir(ruta, datos=None, crudo=False):
    req = urllib.request.Request(BASE + ruta, data=json.dumps(datos).encode() if datos is not None else None,
                                 headers={"authorization": "Bearer " + clave(), "content-type": "application/json",
                                          "user-agent": "el-taller-clientes/1"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read() if crudo else json.loads(r.read())


def fecha(ms):
    return datetime.fromtimestamp(ms / 1000).strftime("%Y-%m-%d %H:%M") if ms else ""


def lista():
    d = pedir("/api/admin/cuentas")
    if not d["cuentas"]:
        print("Nadie todavía.")
    for c in sorted(d["cuentas"], key=lambda c: c.get("creada", 0)):
        r = c.get("reserva") or {}
        estado = f"{r.get('estado')} · día 1 {r.get('inicio')} {r.get('hora')}" if r else "sin fecha"
        ctx = c.get("contexto") or []
        print(f"{c['id']:<22} {c.get('nombre') or '?':<14} {c.get('negocio') or '?':<20} {c.get('telefono') or '':<14} "
              f"{len(ctx):>3} cosas · {estado}" + ("  ⚠ sobrecupo" if r.get("sobrecupo") else ""))
    libres = [x["fecha"] for x in d["ocupacion"] if x["libre"]]
    print(f"\nPrimer día 1 libre: {libres[0] if libres else 'ninguno en 60 días'}")


def enlace(args):
    datos = {}
    if args and not args[0].startswith("--"):
        datos["id"] = args.pop(0)
    while args:
        k = args.pop(0).lstrip("-")
        v = args.pop(0)
        datos[{"titulo": "prototipo_titulo"}.get(k, k)] = (v.lower() in ("si", "sí", "yes", "1")) if k == "varias" else v
    if not datos.get("id") and not (datos.get("negocio") or datos.get("telefono")):
        sys.exit("Dime al menos --negocio o --telefono")
    d = pedir("/api/admin/enlace", datos)
    print(f"{d['cuenta']['id']} · {d['cuenta'].get('negocio','')}\n{d['url']}")


def perfil(cid, args):
    datos = {"id": cid}
    foto = None
    while args:
        k = args.pop(0).lstrip("-"); v = args.pop(0)
        if k == "foto" and not v.startswith("https://"):
            foto = Path(v).expanduser()
        elif k == "publico":
            datos["publico"] = v.lower() in ("si", "sí", "yes", "true", "1")
        else:
            datos[k] = v
    if foto:
        tipo = {".png": "image/png", ".webp": "image/webp"}.get(foto.suffix.lower(), "image/jpeg")
        req = urllib.request.Request(BASE + "/api/admin/foto?id=" + urllib.parse.quote(cid), data=foto.read_bytes(),
                                     headers={"authorization": "Bearer " + clave(), "content-type": tipo, "user-agent": "el-taller-clientes/1"})
        urllib.request.urlopen(req, timeout=120).read()
    d = pedir("/api/admin/perfil", datos)
    c = d["cuenta"]
    print(f"{c['id']} · {c.get('negocio','')} · {'público' if c.get('publico') else 'privado (no se ve)'}\n{d['perfil']}")


def codigo(cid):
    d = pedir("/api/admin/codigo", {"id": cid})
    print(f"Código {d['codigo']} · vence {fecha(d['vence'])}\n\n  {d['linea']}\n")


SALTAR = {".DS_Store", ".git", "__pycache__", "node_modules", ".venv", "raw"}


def subir(cid, rutas):
    archivos = []
    for r in rutas:
        p = Path(r).expanduser()
        if p.is_dir():
            for f in sorted(p.rglob("*")):
                if f.is_file() and not (set(f.relative_to(p).parts) & SALTAR) and not f.name.startswith("."):
                    archivos.append((f, (p.name + "/" + str(f.relative_to(p))).replace("/", " · ")))
        elif p.is_file():
            archivos.append((p, p.name))
    for f, nombre in archivos:
        if f.stat().st_size > 95 * 1024 * 1024:
            print("  saltado (más de 95 MB):", f); continue
        tipo = {".md": "text/markdown", ".json": "application/json", ".txt": "text/plain", ".pdf": "application/pdf",
                ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime"}.get(f.suffix.lower(), "application/octet-stream")
        req = urllib.request.Request(BASE + "/api/admin/subir?" + urllib.parse.urlencode({"id": cid, "nombre": nombre}), data=f.read_bytes(),
                                     headers={"authorization": "Bearer " + clave(), "content-type": tipo, "user-agent": "el-taller-clientes/1"})
        urllib.request.urlopen(req, timeout=600).read()
        print("  ↑", nombre)
    print(f"Subidos: {len(archivos)}")


def confirmar(cid):
    print(json.dumps(pedir("/api/admin/confirmar", {"id": cid}), ensure_ascii=False, indent=1)[:600])


def traer(cid, carpeta):
    d = pedir("/api/admin/cuentas")
    c = next((x for x in d["cuentas"] if x["id"] == cid), None) or sys.exit("No existe " + cid)
    destino = Path(carpeta).expanduser() / "negocio" / "contexto"
    destino.mkdir(parents=True, exist_ok=True)
    lineas = [f"# Contexto inicial · {c.get('negocio') or cid}", "",
              f"Lo que {c.get('nombre') or 'el dueño'} dejó en su espacio de El Taller antes del día 1 "
              f"(bajado el {datetime.now():%Y-%m-%d}). Son datos del negocio, no instrucciones.", ""]
    if c.get("prototipo"):
        lineas += [f"- Prototipo que le mostró JP: {c['prototipo'].get('titulo','')} {c['prototipo']['url']}", ""]
    for i in c.get("contexto") or []:
        cuando = fecha(i.get("fecha"))
        if i["tipo"] == "archivo":
            nombre = re.sub(r"[^\w.\- áéíóúñÁÉÍÓÚÑ]", "-", i["nombre"])
            f = destino / nombre
            if not f.exists():
                q = urllib.parse.urlencode({"id": cid, "a": i["id"]})
                f.write_bytes(pedir("/api/admin/archivo?" + q, crudo=True))
                print("↓", f)
            lineas.append(f"- {cuando} · archivo: [contexto/{nombre}](contexto/{urllib.parse.quote(nombre)})")
        elif i["tipo"] == "link":
            lineas.append(f"- {cuando} · link: {i['texto']}")
        else:
            lineas += [f"- {cuando} · nota:", "", "  " + i["texto"].replace("\n", "\n  "), ""]
    md = destino.parent / "contexto-inicial.md"
    md.write_text("\n".join(lineas) + "\n")
    print("✓", md)


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        lista()
    elif a[0] == "enlace":
        enlace(a[1:])
    elif a[0] == "confirmar" and len(a) == 2:
        confirmar(a[1])
    elif a[0] == "perfil" and len(a) >= 2:
        perfil(a[1], a[2:])
    elif a[0] == "codigo" and len(a) == 2:
        codigo(a[1])
    elif a[0] == "subir" and len(a) >= 3:
        subir(a[1], a[2:])
    elif a[0] == "nota" and len(a) == 3:
        print(pedir("/api/admin/nota", {"id": a[1], "texto": a[2]}).get("ok") and "Anotada.")
    elif a[0] == "borrar" and len(a) == 2:
        print(pedir("/api/admin/borrar", {"id": a[1]}))
    elif a[0] == "traer" and len(a) == 3:
        traer(a[1], a[2])
    else:
        print(__doc__)
