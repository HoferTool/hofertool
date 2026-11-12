// =================================================================
//  KOMPLETTWERKZEUGE DER 508 MIT MARKE (seit 1.495.0)
//  Wunsch Patrick 12. November 2026: jedes vorbereitete Komplett-
//  werkzeug bekommt einen 3D-gedruckten Clip mit 6 Ziffern. Im Pad
//  macht man ein Foto von Werkzeug und Clip, beim Bestücken der
//  Maschine weist man die Marke einem Fach zu, und die App führt die
//  Liste: was steckt in der Maschine, was liegt im Werkzeugschrank.
//  Tabelle wz508_werkzeuge (sql/wz508-marken.sql), Fotos in der Ablage
//  „zeichnungen“ unter wz508/<marke>/.
// =================================================================
import { alt } from "../bruecke.jsx";

const T = "wz508_werkzeuge";
export const ORTE = { vorbereitet: "Vorbereitet", maschine: "In der Maschine", schrank: "Im Werkzeugschrank" };
export const markeGut = (m) => /^[0-9]{6}$/.test(String(m || ""));

const fehltTabelle = (f) => /wz508_werkzeuge|does not exist|schema cache|PGRST205|42P01/i.test(alt.fehlertext(f) || "");
export const SQL_FEHLT = "Die Liste der Werkzeuge fehlt noch in der Datenbank (sql/wz508-marken.sql).";

export async function markenLaden() {
  const r = await alt.db.from(T).select("*").order("marke");
  if (r.error) {
    if (fehltTabelle(r.error)) return { fehlt: true, liste: [] };
    throw r.error;
  }
  return { fehlt: false, liste: r.data || [] };
}

function werfen(error) {
  if (!error) return;
  throw new Error(fehltTabelle(error) ? SQL_FEHLT : alt.fehlertext(error));
}

// Foto von Werkzeug und Clip ablegen, Marke anlegen oder auffrischen.
// Ein Werkzeug aus dem Schrank wird wieder „vorbereitet“, eines, das
// schon in der Maschine steckt, bleibt dort.
export async function vorbereiten({ marke, name, notiz, datei }, liste) {
  if (!markeGut(marke)) throw new Error("Die Marke hat genau 6 Ziffern.");
  const vorher = liste.find((w) => w.marke === marke);
  const daten = { marke, name: (name || "").trim() || (vorher && vorher.name) || null, notiz: (notiz || "").trim() || null,
    ort: vorher && vorher.ort === "maschine" ? "maschine" : "vorbereitet" };
  if (datei) {
    const blob = await alt.bildVerkleinern(datei, 1600);
    const pfad = "wz508/" + marke + "/" + Date.now() + ".jpg";
    const up = await alt.db.storage.from("zeichnungen").upload(pfad, blob, { contentType: "image/jpeg", upsert: false });
    if (up.error) throw up.error;
    daten.foto_pfad = pfad;
    daten.foto_url = alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
  }
  const alt0 = vorher ? await alt.rueckSichern(T, { marke }) : [];
  const { error } = await alt.db.from(T).upsert(daten, { onConflict: "marke" });
  werfen(error);
  alt.merkeSchritt("Werkzeug " + marke + " vorbereitet",
    alt0.length ? alt.rueckRein(T, alt0, "marke") : alt.rueckWeg(T, { marke }));
}

export async function aendern(w, daten, text) {
  const vorher = await alt.rueckSichern(T, { marke: w.marke });
  const { error } = await alt.db.from(T).update(daten).eq("marke", w.marke);
  werfen(error);
  alt.merkeSchritt(text, alt.rueckRein(T, vorher, "marke"));
}

// Das Foto bleibt in der Ablage, damit Rückgängig es zurückbringt
export async function loeschen(w) {
  const vorher = await alt.rueckSichern(T, { marke: w.marke });
  const { error } = await alt.db.from(T).delete().eq("marke", w.marke);
  werfen(error);
  alt.merkeSchritt("Werkzeug " + w.marke + " gelöscht", alt.rueckRein(T, vorher, "marke"));
}

// Nach dem Herunterladen der GESTOUTI.DAT: die zugewiesenen Marken
// stecken jetzt in ihrem Fach, was vorher in einem dieser Fächer
// steckte (oder in einem geleerten), liegt jetzt im Werkzeugschrank.
export function nachDemSchreibenRechnen(aktiv, liste) {
  const rein = aktiv.filter((v) => markeGut(v.marke)).map((v) => ({
    marke: v.marke, ort: "maschine", fach: v.fach, nr: v.nr, name: v.name || null,
    typ: v.typ || null, d: isFinite(v.cam && v.cam.d) ? v.cam.d : null }));
  const faecher = new Set();
  aktiv.forEach((v) => { faecher.add(v.fach); if (v.leeren) faecher.add(v.leeren.fach); });
  const neuMarken = new Set(rein.map((r) => r.marke));
  const raus = liste.filter((w) => w.ort === "maschine" && faecher.has(w.fach) && !neuMarken.has(w.marke))
    .map((w) => w.marke);
  return { rein, raus };
}

// zerlegt: Marken der herausgenommenen Werkzeuge, die Patrick zerlegt
// hat; ihr Eintrag fällt weg, die Marke ist wieder frei (Wunsch Patrick
// 12. November 2026: „evtl. werde ich das Fräswerkzeug demontieren und
// die Marke entfernen“). Die übrigen kommen in den Werkzeugschrank.
export async function nachDemSchreiben(aktiv, liste, zerlegt = []) {
  const r0 = nachDemSchreibenRechnen(aktiv, liste);
  const rein = r0.rein;
  const weg = r0.raus.filter((m) => zerlegt.includes(m));
  const raus = r0.raus.filter((m) => !zerlegt.includes(m));
  if (!rein.length && !raus.length && !weg.length) return { rein: 0, raus: 0, weg: 0 };
  const alle = [...rein.map((r) => r.marke), ...raus, ...weg];
  const vorher = await alt.rueckSichern(T, { marke: alle });
  const schritte = [];
  if (rein.length) {
    const { error } = await alt.db.from(T).upsert(rein, { onConflict: "marke" });
    werfen(error);
  }
  if (raus.length) {
    const { error } = await alt.db.from(T).update({ ort: "schrank", fach: null }).in("marke", raus);
    werfen(error);
  }
  if (weg.length) {
    const { error } = await alt.db.from(T).delete().in("marke", weg);
    werfen(error);
  }
  if (vorher.length) schritte.push(alt.rueckRein(T, vorher, "marke"));
  const neu = rein.map((r) => r.marke).filter((m) => !vorher.some((v) => v.marke === m));
  if (neu.length) schritte.push(alt.rueckWeg(T, { marke: neu }));
  alt.merkeSchritt("508 bestückt", schritte);
  return { rein: rein.length, raus: raus.length, weg: weg.length };
}
