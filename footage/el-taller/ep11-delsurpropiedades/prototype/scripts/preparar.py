#!/usr/bin/env python3
"""After leer_delsur.py: a light photo per listing (the cards) + a point on the map (public/data/propiedades.json in place).

Photo: their first photo → public/fotos/<id>.webp (800 px). The listing itself keeps linking their originals.
Point: the place they give for "Ver en Google Maps" ("Sector La Laja, Puerto Varas") → OpenStreetMap (Nominatim,
1 request/s, cached in scripts/geo.json); if that fails or lands far away, the comuna's center. Either way it is
"ubicación referencial", as their own site says (`aprox`: 'lugar' | 'comuna').
usage: ../../../tools/.venv/bin/python scripts/preparar.py
"""
import io, json, math, os, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(AQUI, '..', 'public', 'data', 'propiedades.json')
FOTOS = os.path.join(AQUI, '..', 'public', 'fotos')
CACHE = os.path.join(AQUI, 'geo.json')
UA = 'ElTaller-DelSur-prototipo/1.0 (+https://jpfraneto.com)'


def bajar(url):
    req = urllib.request.Request(url, headers={'user-agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()


def foto(p):
    dest = os.path.join(FOTOS, f"{p['id']}.webp")
    if not os.path.exists(dest) and p.get('fotos'):
        try:
            im = Image.open(io.BytesIO(bajar(p['fotos'][0]))).convert('RGB')
            im.thumbnail((800, 800))
            im.save(dest, 'WEBP', quality=72)
        except Exception as e:
            print('  foto', p['id'], e, file=sys.stderr)
    if os.path.exists(dest):
        p['mini'] = f"/fotos/{p['id']}.webp"


cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}


def geo(q):
    if q in cache: return cache[q]
    time.sleep(1.1)
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(
        {'q': q, 'format': 'json', 'limit': 1, 'countrycodes': 'cl'})
    try:
        r = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={'user-agent': UA}), timeout=30).read())
        cache[q] = [float(r[0]['lat']), float(r[0]['lon'])] if r else None
    except Exception as e:
        print('  geo', q, e, file=sys.stderr); return None
    json.dump(cache, open(CACHE, 'w'), ensure_ascii=False, indent=0)
    return cache[q]


# Comunas outside Los Lagos that Nominatim pulls toward Puerto Montt with the region in the query (checked 2026-11-16).
FIJOS = {'Lago Ranco': [-40.3122, -72.4997], 'Panguipulli': [-39.6430, -72.3333], 'Coyhaique': [-45.5712, -72.0685],
         'Pucón': [-39.2820, -71.9545], 'La Unión': [-40.2930, -73.0820], 'Los Lagos': [-39.8563, -72.8146]}


def km(a, b):
    return math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 111 * math.cos(math.radians(a[0])))


def limpio(lugar):
    partes = list(dict.fromkeys(x.strip() for x in lugar.split(',') if x.strip()))
    return ', '.join(partes)


def main():
    d = json.load(open(DATA))
    os.makedirs(FOTOS, exist_ok=True)
    with ThreadPoolExecutor(6) as ex:  # their server is slow per photo, not per connection
        list(ex.map(foto, d['propiedades']))
    print('fotos listas', file=sys.stderr)
    for i, p in enumerate(d['propiedades']):
        centro = FIJOS.get(p['comuna']) or geo(f"{p['comuna']}, Los Lagos, Chile") or geo(f"{p['comuna']}, Chile")
        punto, aprox = None, 'comuna'
        if p.get('lugar'):
            q = limpio(p['lugar'])
            if q.lower() != p['comuna'].lower():
                punto = geo(f'{q}, Chile')
                if punto and centro and km(punto, centro) > 40: punto = None
                if punto: aprox = 'lugar'
        punto = punto or centro
        if punto:
            p['lat'], p['lng'], p['aprox'] = round(punto[0], 5), round(punto[1], 5), aprox
        if i % 25 == 0: print(i, p['id'], aprox, file=sys.stderr)
    json.dump(d, open(DATA, 'w'), ensure_ascii=False, indent=1)
    centros = {p['comuna']: [p['lat'], p['lng']] for p in d['propiedades'] if p.get('aprox') == 'comuna'}
    json.dump({**centros, **FIJOS}, open(os.path.join(AQUI, '..', 'public', 'data', 'comunas.json'), 'w'), ensure_ascii=False)
    n = sum(1 for p in d['propiedades'] if p.get('aprox') == 'lugar')
    print(f"{len(d['propiedades'])} propiedades · {n} con lugar · fotos {sum(1 for p in d['propiedades'] if p.get('mini'))}", file=sys.stderr)


if __name__ == '__main__':
    main()
