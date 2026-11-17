"""Photos of each place in Chile, from Wikimedia Commons (free licences only, author + licence kept for the credit).
The site is an invitation to discover Chile: the reels (render_earth.py) show these photos as the flight passes each
place, and the pages can use the same ones.

  uv run --with pillow python scripts/fotos_lugares.py buscar <lugar> "<búsqueda>" ["<otra>" …]
      → candidates with a free licence, as a numbered contact sheet (.cache-fotos/<lugar>.jpg) + the list
  uv run --with pillow python scripts/fotos_lugares.py agregar <lugar> "File:…" ["qué se ve"]
      → public/img/lugares/<lugar>/NN.jpg (1600 px) + an entry in public/data/lugares.json
  uv run --with pillow python scripts/fotos_lugares.py quitar <lugar> <n>

<lugar> is a comuna, a region or a zone as the index writes it ("Porvenir", "Magallanes", "Patagonia").
Free = CC0, public domain, CC BY, CC BY-SA (each photo shows author + licence wherever it appears).
"""
import html, io, json, os, re, subprocess, sys, unicodedata
from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(AQUI, 'public', 'data', 'lugares.json')
IMG = os.path.join(AQUI, 'public', 'img', 'lugares')
CACHE = os.path.join(AQUI, '.cache-fotos')
API = 'https://commons.wikimedia.org/w/api.php'
UA = 'parcelasyterrenos/1.0 (jpfraneto@gmail.com)'
LIBRES = re.compile(r'^(CC0|Public domain|PD|CC BY(-SA)? \d(\.\d)?)', re.I)


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def curl(url, *datos):
    args = ['curl', '-sfL', '-m', '90', '-A', UA, '-G', url] + [x for d in datos for x in ('--data-urlencode', d)]
    return subprocess.run(args, check=True, capture_output=True).stdout


def info(**q):
    base = ['action=query', 'format=json', 'prop=imageinfo', 'iiprop=url|extmetadata|size',
            'iiextmetadatafilter=LicenseShortName|Artist|ImageDescription', 'iiurlwidth=1600']
    paginas = json.loads(curl(API, *base, *[f'{k}={v}' for k, v in q.items()])).get('query', {}).get('pages', {})
    return sorted(paginas.values(), key=lambda p: p.get('index', 0))


def limpio(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s or ''))).strip()


def ficha(p):
    ii = p['imageinfo'][0]; m = ii.get('extmetadata', {})
    return {'titulo': p['title'], 'licencia': m.get('LicenseShortName', {}).get('value', ''),
            'autor': limpio(m.get('Artist', {}).get('value', ''))[:80] or 'Wikimedia Commons',
            'fuente': ii['descriptionurl'], 'url': ii.get('thumburl') or ii['url'], 'ancho': ii['width'], 'alto': ii['height']}


def leer_datos():
    return json.load(open(DATOS)) if os.path.exists(DATOS) else {}


def buscar(lugar, consultas):
    vistos, out = set(), []
    for q in consultas:
        for p in info(generator='search', gsrsearch=f'{q} filetype:bitmap', gsrnamespace='6', gsrlimit='40'):
            if p['title'] in vistos or not p.get('imageinfo'):
                continue
            vistos.add(p['title'])
            f = ficha(p)
            if LIBRES.match(f['licencia']) and min(f['ancho'], f['alto']) >= 900:
                out.append(f)
    os.makedirs(CACHE, exist_ok=True)
    lado, cols = 300, 6
    hoja = Image.new('RGB', (lado * cols, lado * ((len(out) + cols - 1) // cols or 1)), 'white')
    for i, f in enumerate(out):
        try:
            im = Image.open(io.BytesIO(subprocess.run(['curl', '-sfL', '-m', '60', '-A', UA, f['url'].replace('/1600px-', '/400px-')],
                                                      check=True, capture_output=True).stdout)).convert('RGB')
        except Exception:
            continue
        im.thumbnail((lado - 8, lado - 30))
        x, y = (i % cols) * lado, (i // cols) * lado
        hoja.paste(im, (x + 4, y + 4))
        ImageDraw.Draw(hoja).text((x + 6, y + lado - 22), f'{i}  {f["licencia"]}', fill='black')
        print(f'{i:3d}  {f["titulo"][5:90]}  ·  {f["licencia"]}  ·  {f["autor"][:40]}')
    ruta = os.path.join(CACHE, f'{slug(lugar)}.jpg')
    hoja.save(ruta, quality=85)
    json.dump(out, open(ruta[:-4] + '.json', 'w'), ensure_ascii=False, indent=1)
    print('hoja:', ruta)


def agregar(lugar, titulo, que=''):
    p = info(titles=titulo)
    if not p or not p[0].get('imageinfo'):
        raise SystemExit(f'{titulo}: no está en Commons')
    f = ficha(p[0])
    if not LIBRES.match(f['licencia']):
        raise SystemExit(f'{titulo}: licencia {f["licencia"]!r} no es libre')
    d = leer_datos()
    lista = d.setdefault(lugar, [])
    if any(x['titulo'] == f['titulo'] for x in lista):
        print('ya estaba:', titulo); return
    carpeta = os.path.join(IMG, slug(lugar)); os.makedirs(carpeta, exist_ok=True)
    n = max([int(re.sub(r'\D', '', x['archivo'].split('/')[-1]) or 0) for x in lista] + [0]) + 1
    im = Image.open(io.BytesIO(subprocess.run(['curl', '-sfL', '-m', '90', '-A', UA, f['url']], check=True, capture_output=True).stdout)).convert('RGB')
    im.thumbnail((1600, 1600))
    archivo = f'/img/lugares/{slug(lugar)}/{n:02d}.jpg'
    im.save(os.path.join(AQUI, 'public', archivo.lstrip('/')), quality=86, optimize=True)
    lista.append({'archivo': archivo, 'que': que, 'autor': f['autor'], 'licencia': f['licencia'], 'titulo': f['titulo'], 'fuente': f['fuente']})
    json.dump(d, open(DATOS, 'w'), ensure_ascii=False, indent=1)
    print(f'{lugar} #{n}: {archivo} · {f["autor"]} · {f["licencia"]}')


def quitar(lugar, n):
    d = leer_datos()
    x = d.get(lugar, []).pop(int(n) - 1)
    ruta = os.path.join(AQUI, 'public', x['archivo'].lstrip('/'))
    if os.path.exists(ruta):
        os.remove(ruta)
    json.dump(d, open(DATOS, 'w'), ensure_ascii=False, indent=1)
    print('quitada:', x['titulo'])


if __name__ == '__main__':
    orden, *resto = sys.argv[1:] or ['?']
    if orden == 'buscar' and len(resto) >= 2:
        buscar(resto[0], resto[1:])
    elif orden == 'agregar' and len(resto) >= 2:
        agregar(*resto[:3])
    elif orden == 'quitar' and len(resto) == 2:
        quitar(*resto)
    else:
        print(__doc__)
