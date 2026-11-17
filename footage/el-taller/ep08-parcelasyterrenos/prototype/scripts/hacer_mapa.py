# Natural Earth 1:10m (public domain, via world-atlas@2.0.2) → Chile + neighbours as simplified SVG paths for the map.
import json, math, sys
d = json.load(open('countries-10m.json'))
sc, tr = d['transform']['scale'], d['transform']['translate']
arcs = []
for a in d['arcs']:
    x = y = 0; pts = []
    for dx, dy in a:
        x += dx; y += dy; pts.append((x * sc[0] + tr[0], y * sc[1] + tr[1]))
    arcs.append(pts)
def ring(idx):
    out = []
    for i in idx:
        p = arcs[i] if i >= 0 else arcs[~i][::-1]
        out += p[1:] if out else p
    return out
def polys(g):
    if g['type'] == 'Polygon': return [[ring(r) for r in g['arcs']]]
    return [[ring(r) for r in p] for p in g['arcs']]

LAT_TOP, LON_LEFT, K = -17.0, -77.0, 100.0          # 100 units per degree of latitude
COS = math.cos(math.radians(37))
def proj(lon, lat): return ((lon - LON_LEFT) * K * COS, (LAT_TOP - lat) * K)

def dp(pts, tol):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dmax, idx = 0, 0
    ax, ay = a; bx, by = b; L = math.hypot(bx - ax, by - ay) or 1e-9
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        dist = abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / L
        if dist > dmax: dmax, idx = dist, i
    if dmax > tol: return dp(pts[:idx + 1], tol)[:-1] + dp(pts[idx:], tol)
    return [a, b]
def area(p): return abs(sum(p[i][0] * p[i - 1][1] - p[i - 1][0] * p[i][1] for i in range(len(p)))) / 2

def path(geom, tol, min_area, keep=lambda pts: True):
    out = []
    for poly in polys(geom):
        outer = poly[0]
        if not keep(outer): continue
        pts = [proj(*q) for q in outer]
        if area(pts) < min_area: continue
        h = len(pts) // 2                       # a closed ring: simplify its two halves (dp needs two distinct ends)
        s = dp(pts[:h + 1], tol)[:-1] + dp(pts[h:], tol)
        if len(s) < 4: continue
        out.append('M' + 'L'.join(f'{x:.0f},{y:.0f}' for x, y in s) + 'Z')
    return ''.join(out)

geoms = {g['properties']['name']: g for g in d['objects']['countries']['geometries']}
tol = float(sys.argv[1]) if len(sys.argv) > 1 else 3
chile = path(geoms['Chile'], tol, 2500, keep=lambda pts: min(p[0] for p in pts) > -77)   # no Rapa Nui / Juan Fernández
vec = {n: path(geoms[n], tol * 2, 400) for n in ('Argentina', 'Bolivia', 'Peru')}
W, H = round((-64.0 - LON_LEFT) * K * COS), round((LAT_TOP - (-56.2)) * K)
# Zoomed in, the coast needs more detail (loaded only then) and the lakes (Llanquihue, Ranco, Villarrica…).
chile_fino = path(geoms['Chile'], 0.5, 6, keep=lambda pts: min(p[0] for p in pts) > -77)
lagos = []
try:                                               # Natural Earth 1:10m lakes (public domain): ne_10m_lakes.geojson
    for ft in json.load(open('ne_10m_lakes.geojson'))['features']:
        g = ft['geometry']
        for poly in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]):
            outer = poly[0]
            if not all(-76 < x < -67 and -56 < y < -17 for x, y in outer): continue
            pts = [proj(x, y) for x, y in outer]
            if area(pts) < 3: continue
            h = len(pts) // 2
            s_ = dp(pts[:h + 1], 0.4)[:-1] + dp(pts[h:], 0.4)
            lagos.append('M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in s_) + 'Z')
except FileNotFoundError:
    print('sin ne_10m_lakes.geojson: el mapa queda sin lagos')
out = {'_fuente': 'Natural Earth 1:10m (dominio público), vía world-atlas@2.0.2 y ne_10m_lakes. Generado por hacer_mapa.py.',
       'proy': {'lat_top': LAT_TOP, 'lon_left': LON_LEFT, 'k': K, 'cos': COS}, 'w': W, 'h': H, 'chile': chile, 'vecinos': vec,
       'lagos': ''.join(lagos)}
json.dump({'chile': chile_fino, 'vecinos': {n: path(geoms[n], 1, 20) for n in ('Argentina', 'Bolivia', 'Peru')}},
          open('chile-fino.json', 'w'))
json.dump(out, open('chile.json', 'w'))
print('w,h', W, H, 'chile chars', len(chile), {k: len(v) for k, v in vec.items()}, 'fino', len(chile_fino), 'lagos', len(lagos))
