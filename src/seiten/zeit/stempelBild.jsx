// Animation nach dem Stempeln für bestimmte Personen (Wunsch Patrick 20. November 2026).
// Wer welche bekommt, steht nur in der Datenbank (app_config „zeit_stempel_bild“),
// die Bilder liegen unter hofertime/stempel/<name>-kommen.webp bzw. -gehen.webp.
import { alt } from "../../bruecke.jsx";

export async function stempelBildHolen(personId) {
  if (!personId) return null;
  try {
    const r = await alt.zeitlimit(alt.db.rpc("zeit_stempel_bild", { p_person: personId }), 2500, "Stempelbild");
    const n = r && !r.error && typeof r.data === "string" ? r.data : "";
    return /^[a-z0-9-]+$/.test(n) ? n : null;
  } catch { return null; }
}

export function StempelBild({ name, art }) {
  if (!name) return null;
  const src = "./hofertime/stempel/" + name + "-" + (art === "gehen" ? "gehen" : "kommen") + ".webp?2";
  return <img className="ze-bestaetigt__bild" src={src} alt="" data-ze-stempelbild={name} />;
}
