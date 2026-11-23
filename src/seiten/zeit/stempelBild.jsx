// Animation nach dem Stempeln für bestimmte Personen (Wunsch Patrick 20. November 2026).
// Wer welche bekommt, steht nur in der Datenbank (app_config „zeit_stempel_bild“),
// die Bilder liegen unter hofertime/stempel/<name>-kommen.webp bzw. -gehen.webp.
// Seit 1.752.0: Animationen mit dem Foto einer Person stehen nur in der Datenbank
// (app_config „zeit_stempel_foto“, Funktion zeit_stempel_foto), nie im Repository;
// gibt es dort eine, gilt sie vor der Datei.
import { useEffect, useState } from "react";
import { alt } from "../../bruecke.jsx";

const fotos = new Map(); // "name-art" -> Promise<string|null>

function fotoHolen(name, art) {
  const k = name + "-" + art;
  if (!fotos.has(k)) {
    fotos.set(k, (async () => {
      try {
        const r = await alt.zeitlimit(alt.db.rpc("zeit_stempel_foto", { p_name: name, p_art: art }), 4000, "Stempelfoto");
        const d = r && !r.error && typeof r.data === "string" ? r.data : "";
        return d.startsWith("data:image/") ? d : null;
      } catch { fotos.delete(k); return null; }
    })());
  }
  return fotos.get(k);
}

export async function stempelBildHolen(personId) {
  if (!personId) return null;
  try {
    const r = await alt.zeitlimit(alt.db.rpc("zeit_stempel_bild", { p_person: personId }), 2500, "Stempelbild");
    const n = r && !r.error && typeof r.data === "string" ? r.data : "";
    if (!/^[a-z0-9-]+$/.test(n)) return null;
    // Gleich beide vorladen, damit die Animation ohne Warten kommt.
    fotoHolen(n, "kommen"); fotoHolen(n, "gehen");
    return n;
  } catch { return null; }
}

export function StempelBild({ name, art }) {
  const a = art === "gehen" ? "gehen" : "kommen";
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!name) return;
    let weg = false;
    const datei = "./hofertime/stempel/" + name + "-" + a + ".webp?2";
    // Höchstens kurz auf das Foto aus der Datenbank warten, sonst die Datei.
    const t = setTimeout(() => { if (!weg) setSrc((s) => s || datei); }, 1500);
    fotoHolen(name, a).then((d) => { if (!weg) setSrc(d || datei); });
    return () => { weg = true; clearTimeout(t); };
  }, [name, a]);
  if (!name || !src) return null;
  return <img className="ze-bestaetigt__bild" src={src} alt="" data-ze-stempelbild={name} />;
}
