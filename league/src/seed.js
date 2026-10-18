// Carga inicial de datos desde `public/data.json`, el archivo que genera la app con
// Datos → Descargar. Se aplica una sola vez por navegador (se recuerda con un sello), así
// que después cada uno guarda lo suyo en localStorage y el archivo no lo pisa. Si cambias
// el archivo, cambia el sello y se vuelve a fusionar encima, sin borrar lo añadido.
const P = "kikudes:";
const STAMP = P + "seed-stamp";

export async function seedFromFile() {
  let payload;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data.json`, { cache: "no-store" });
    if (!res.ok) return;                                   // no hay archivo: la app arranca vacía
    payload = await res.json();
  } catch (e) { return; }
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  if (!data || typeof data !== "object") return;
  const stamp = payload?.saved || JSON.stringify(Object.keys(data)).length + "";
  if (localStorage.getItem(STAMP) === stamp) return;      // ya aplicado

  const byId = (mine, theirs) => {
    const m = {};
    (mine || []).forEach((x) => { if (x && x.archiveId) m[x.archiveId] = x; });
    (theirs || []).forEach((x) => { if (x && x.archiveId) m[x.archiveId] = x; });   // el archivo gana
    return Object.values(m).sort((a, b) => (a.savedAt || a.at || 0) - (b.savedAt || b.at || 0));
  };
  Object.keys(data).forEach((k) => {
    const key = k.startsWith(P) ? k : P + "shared:" + k;
    const incoming = typeof data[k] === "string" ? data[k] : JSON.stringify(data[k]);
    const current = localStorage.getItem(key);
    if (current === null) { localStorage.setItem(key, incoming); return; }
    const short = key.replace(P + "shared:", "");
    try {
      const a = JSON.parse(current), b = JSON.parse(incoming);
      if (["tournament-archive", "league-archive", "league-trades"].includes(short)) {
        localStorage.setItem(key, JSON.stringify(byId(a, b)));
      } else if (short === "tournament-seasons") {
        localStorage.setItem(key, JSON.stringify([...new Set([...(a || []), ...(b || [])])]));
      } else if (short === "teams-data") {
        const t = {}; (a || []).forEach((x) => { if (x?.id) t[x.id] = x; });
        (b || []).forEach((x) => { if (x?.id) t[x.id] = { ...(t[x.id] || {}), ...x }; });
        localStorage.setItem(key, JSON.stringify(Object.values(t)));
      } else {
        localStorage.setItem(key, incoming);
      }
    } catch (e) { localStorage.setItem(key, incoming); }
  });
  localStorage.setItem(STAMP, stamp);
}
