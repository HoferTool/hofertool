// =================================================================
//  MENÜPLAN (TSCHANZ)
//  Das Menü je Tag als Text (Wunsch Patrick 12. November 2026: „Tschanz
//  menuplan soll bearbeitbar sein … auflisten, was das heutige Menü ist“).
//  Eigene Zeile `menueplan` in der Tabelle infoboard, aufbau =
//  { tage: { "2026-11-12": "Text" } }, damit das Bearbeiten im Pausenraum
//  nicht den ganzen Aufbau der Tafel mitschreiben muss
//  (sql/menueplan.sql). Lesen und ändern alle ausser Externen und Dienst.
// =================================================================
import { alt } from "../bruecke.jsx";

export const MENUE_ID = "menueplan";

export const tagSchluessel = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
};

export async function menueLaden() {
  const r = await alt.zeitlimit(alt.db.from("infoboard").select("aufbau").eq("id", MENUE_ID).maybeSingle(), 10000, "Menüplan laden");
  if (r.error) throw r.error;
  const a = (r.data && r.data.aufbau) || {};
  return a.tage && typeof a.tage === "object" ? { ...a.tage } : {};
}

// Nur die geänderten Tage in den neusten Stand einsetzen, damit zwei
// Geräte einander nicht andere Tage überschreiben. Leerer Text = Tag weg.
// Tage älter als ein Jahr fallen weg, damit die Zeile nicht ewig wächst.
export async function menueSpeichern(aenderungen) {
  const tage = await menueLaden();
  for (const [k, v] of Object.entries(aenderungen)) {
    const t = String(v || "").replace(/\s+$/, "");
    if (t.trim()) tage[k] = t; else delete tage[k];
  }
  const grenze = tagSchluessel(new Date(Date.now() - 366 * 864e5));
  for (const k of Object.keys(tage)) if (k < grenze) delete tage[k];
  const r = await alt.zeitlimit(alt.db.from("infoboard").upsert({ id: MENUE_ID, aufbau: { tage } }, { onConflict: "id" }),
    10000, "Menüplan speichern");
  if (r.error) throw r.error;
  return tage;
}
