// The face of a Ruta 5 billboard (map, sponsor sheet, panel): the sponsor's own image, or the one we make from its link:
// the domain in big letters on a pair of colors picked from its name, so each brand always gets the same one.
// Uses esc() from app.js / panel.js.
const LETRERO_COLORES = [['#c8102e', '#fff'], ['#0b3d91', '#f6d55c'], ['#161616', '#f6d55c'], ['#1d6b3a', '#fff'], ['#f6d55c', '#161616'], ['#fff', '#c8102e']];

function caraLetrero(a) {
  if (a.img) return `<span class="cara"><img src="${esc(a.img)}" alt="${esc(a.empresa)}" loading="lazy"></span>`;
  const n = [...String(a.empresa || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const [fondo, tinta] = a.ong ? ['#eaf4e4', '#24401a'] : LETRERO_COLORES[n % LETRERO_COLORES.length];
  // --n: its length, so a long domain shrinks to fit the face in one line instead of breaking in half.
  return `<span class="cara" style="background:${fondo};color:${tinta};--n:${Math.max(8, String(a.empresa || '').length)}"><b>${esc(a.empresa)}</b>${a.bajada ? `<small>${esc(a.bajada)}</small>` : ''}</span>`;
}
