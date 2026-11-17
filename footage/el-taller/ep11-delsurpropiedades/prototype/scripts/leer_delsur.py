#!/usr/bin/env python3
"""Read every listing Del Sur Propiedades publishes on its own site → public/data/propiedades.json.

Only what they publish (their site has no robots.txt): title, code, comuna, price, m², rooms, description, their photos
(linked, not copied), the "Ver en Google Maps" text they give as the place. One request at a time, 1 s apart.
usage: python3 scripts/leer_delsur.py            (≈10 min for ~530 listings)
"""
import html, json, os, re, sys, time, urllib.parse, urllib.request
from http.cookiejar import CookieJar

WEB = 'https://www.delsurpropiedades.cl'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data', 'propiedades.json')
jar = CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def get(url, data=None, headers=None):
    for intento in range(3):
        try:
            req = urllib.request.Request(url, data=data, headers={'user-agent': UA, **(headers or {})})
            with op.open(req, timeout=30) as r:
                return r.read().decode('utf-8', 'ignore')
        except Exception as e:
            print('  retry', url, e, file=sys.stderr); time.sleep(3)
    return ''


def texto(s):
    s = re.sub(r'<br\s*/?>', '\n', s or '')
    s = re.sub(r'</p>\s*', '\n\n', s)
    s = html.unescape(re.sub(r'<[^>]+>', '', s)).replace('\xa0', ' ')
    return re.sub(r'\n{3,}', '\n\n', re.sub(r'[ \t]+', ' ', s)).strip()


def numero(s):
    s = (s or '').replace('.', '').replace(',', '.')
    m = re.search(r'[\d.]+', s)
    try: return float(m.group()) if m else None
    except ValueError: return None


def ids_de(modo, tipo):
    """modo 'sales'|'rents' → (category name, [ids]) following the site's own 'load more'."""
    url = f'{WEB}/propertytypes/{modo}/{tipo}'
    h = get(url)
    nombre = texto((re.search(r'id="rents">.*?<h2[^>]*>(.*?)</h2>', h, re.S) or [None, ''])[1])
    ids = list(dict.fromkeys(re.findall(r'data-url="[^"]*/properties/view/(\d+)"', h)))
    for page in range(2, 80):
        time.sleep(1)
        body = urllib.parse.urlencode({'propertytype': tipo, 'page': page, 'type': 'recents',
                                       'modalitytype_id': 1 if modo == 'sales' else 2, 'moneda': 'uf'}).encode()
        r = get(f'{WEB}/propertytypes/loadpage', body, {'x-requested-with': 'XMLHttpRequest', 'referer': url,
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'})
        nuevos = [i for i in dict.fromkeys(re.findall(r'data-url="[^"]*/properties/view/(\d+)"', r)) if i not in ids]
        if not nuevos: break
        ids += nuevos
    return nombre, ids


def ficha(pid):
    h = get(f'{WEB}/properties/view/{pid}')
    if 'title-property' not in h: return None
    bloque = h[h.find('<h3 class="title-property">'):]
    titulo = texto(re.search(r'<h3 class="title-property">(.*?)</h3>', bloque, re.S).group(1))
    h4 = (re.search(r'<h4>(.*?)</h4>', bloque, re.S) or [None, ''])[1]
    comuna = texto(h4.split('<br')[0])
    uf = re.search(r'UF\s?([\d.,]+)', h4); clp = re.search(r'\$\s?([\d.]{4,})', h4)
    datos = {texto(k): texto(v) for k, v in re.findall(r'<h5>(.*?)</h5>\s*<h6>(.*?)</h6>', bloque.split('</ul>')[0], re.S)}
    desc = re.search(r'<p class="description">(.*?)</p>\s*(?:<a|</div>)', bloque, re.S)
    fotos = list(dict.fromkeys(u for u in re.findall(r'src="(https://delsurpropiedades\.cl/img/properties/[^"]+)"', h)))
    lugar = re.search(r'google\.com/maps\?q=([^"&]+)', h)
    return {
        'id': pid, 'titulo': titulo, 'comuna': comuna,
        'uf': numero(uf.group(1)) if uf else None, 'clp': numero(clp.group(1)) if clp else None,
        'construido': numero(datos.get('Construido')), 'terreno': numero(datos.get('Terreno')),
        'dormitorios': numero(datos.get('Dormitorios')), 'banos': numero(datos.get('Baños')),
        'descripcion': texto(desc.group(1)) if desc else '',
        'fotos': [urllib.parse.quote(f, safe=':/') for f in fotos],
        'lugar': html.unescape(urllib.parse.unquote(lugar.group(1))).strip() if lugar else '',
        'url': f'{WEB}/properties/view/{pid}',
    }


def main():
    cats = [('sales', t) for t in (1, 2, 3, 4, 5, 6, 7, 12)] + [('rents', t) for t in (1, 2, 6, 7, 12)]
    vistos, props = {}, []
    for modo, tipo in cats:
        nombre, ids = ids_de(modo, tipo)
        print(f'{modo}/{tipo} {nombre}: {len(ids)}', file=sys.stderr)
        for pid in ids:
            if pid in vistos: continue
            time.sleep(1)
            p = ficha(pid)
            if not p: continue
            p.update(operacion='venta' if modo == 'sales' else 'arriendo', tipo=nombre)
            vistos[pid] = p; props.append(p)
        json.dump({'leido': time.strftime('%Y-%m-%d'), 'fuente': WEB, 'propiedades': props},
                  open(OUT, 'w'), ensure_ascii=False, indent=1)
    print(len(props), 'propiedades →', OUT, file=sys.stderr)


if __name__ == '__main__':
    if len(sys.argv) > 1: print(json.dumps(ficha(sys.argv[1]), ensure_ascii=False, indent=1))
    else: main()
