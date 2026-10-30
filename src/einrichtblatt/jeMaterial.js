// =================================================================
//  EINRICHTBLATT JE MATERIALGRÖSSE (seit 1.272.0, Wunsch Patrick
//  29. Oktober 2026, SB-20C Nr. 120: „drei verschiedene Materialgrössen
//  und je nach Materialgrösse gibt es ein EB“)
//
//  Je Typ eine Liste in app_config.eb_je_material:
//    { "<typId>": [{ name: "Rohr 16.2 x 14.5", erkennen: ["16.2/14.5", "Ø16"] }] }
//  Jedes Blatt liegt als ganz normales Blatt in der App unter dem
//  Schlüssel „Material <name>“ statt einer HOCO Nr. Hat eine HOCO Nr.
//  auf diesem Typ weder ein eigenes Blatt noch ein eigenes Excel, gilt
//  das Blatt, dessen Merkmal im Material des Auftrags steht.
// =================================================================
import { alt } from "../bruecke.jsx";

const SCHLUESSEL = "eb_je_material";
export const VORSILBE = "Material ";
export const istMaterialBlatt = (hocoNr) => String(hocoNr || "").startsWith(VORSILBE);
export const blattSchluessel = (e) => VORSILBE + e.name;

let speicher = null;
export async function jeMaterialLaden(frisch) {
  if (speicher && !frisch && Date.now() - speicher.zeit < 60000) return speicher.wert;
  let wert = {};
  try {
    const r = await alt.zeitlimit(alt.db.from("app_config").select("wert")
      .eq("schluessel", SCHLUESSEL).maybeSingle(), 6000, "Einrichtblätter je Material");
    wert = (!r.error && r.data && r.data.wert) ? JSON.parse(r.data.wert) || {} : {};
  } catch (f) { wert = {}; }
  speicher = { zeit: Date.now(), wert };
  return wert;
}

export async function jeMaterialSpeichern(typId, liste) {
  const alle = Object.assign({}, await jeMaterialLaden(true));
  if (liste && liste.length) alle[typId] = liste; else delete alle[typId];
  const { error } = await alt.db.from("app_config").upsert({ schluessel: SCHLUESSEL, wert: JSON.stringify(alle) });
  if (error) throw error;
  speicher = { zeit: Date.now(), wert: alle };
}

// Gross, klein, Leerzeichen und Komma spielen keine Rolle
const flach = (t) => String(t || "").toLowerCase().replace(/,/g, ".").replace(/\s+/g, "");

export function passendesBlatt(material, liste) {
  const m = flach(material);
  if (!m) return null;
  return (liste || []).find((e) => (e.erkennen || []).some((k) => flach(k) && m.includes(flach(k)))) || null;
}

// Material der HOCO Nr.: vom jüngsten Auftrag, sonst aus den Stammdaten
async function materialVon(hocoNr) {
  try {
    const r = await alt.db.from("jobs").select("material_bez, created_at").eq("job_number", hocoNr)
      .order("created_at", { ascending: false }).limit(20);
    const m = ((r.data || []).find((j) => j.material_bez) || {}).material_bez;
    if (m) return m;
  } catch (f) { /* dann die Stammdaten */ }
  try {
    const r = await alt.db.from("hoco_parts").select("material").eq("hoco_nr", hocoNr).limit(1);
    return ((r.data || [])[0] || {}).material || "";
  } catch (f) { return ""; }
}

// Schlüssel des Blatts je Material für diese HOCO Nr. auf diesem Typ, oder null
export async function materialBlattFuer(hocoNr, typId) {
  if (!hocoNr || !typId || istMaterialBlatt(hocoNr)) return null;
  const liste = (await jeMaterialLaden())[typId];
  if (!liste || !liste.length) return null;
  const e = passendesBlatt(await materialVon(hocoNr), liste);
  return e ? blattSchluessel(e) : null;
}

// Im Blatt je Materialgrösse steht bei „Ho&Co. Nr“ die HOCO Nr. des
// Auftrags, bei „Artikel Bezeich“ „Gehäuse Ø<Aussen-Ø> x div.“, und
// Zeichnungs Nr., Index und N1000 fallen weg (seit 1.298.0, Wunsch
// Patrick 30. Oktober 2026, SB-20C Nr. 120)
export const MATERIAL_OHNE = ["zeichnungs_nr", "index_nr", "n1000"];
export function materialArtBez(schluessel) {
  const m = /(\d+(?:[.,]\d+)?)/.exec(String(schluessel || "").slice(VORSILBE.length));
  return "Gehäuse " + (m ? "Ø" + m[1].replace(",", ".") + " " : "") + "x div.";
}
