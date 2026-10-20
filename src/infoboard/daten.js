// =================================================================
//  INFOBOARD: DATEN
//  Der Aufbau des grossen Bildschirms (Samsung QM43B-T, 43 Zoll,
//  hochkant) steht als eine Zeile in der Tabelle infoboard
//  (sql/infoboard.sql). Unter dem Kopf mit Logo und Solaranlage gibt
//  es zwei Reihen; jede Reihe ist entweder zwei A4 hoch nebeneinander
//  oder ein A3 quer (Wunsch Patrick 20. Oktober 2026: „A4 oder wenn
//  doppelt A3“). Auf 1080 × 1920 passen genau zwei A4-Reihen unter
//  einen Kopf von gut 400 Punkten.
//
//  aufbau = { reihen: [{ format: "a4" | "a3", felder: [feld, feld] }, …] }
//  feld   = { id, art: "leer" | "datei" | "skizze",
//             datei: { url, pfad, name, typ: "pdf" | "bild" | "video" },
//             sekunden: Seitenwechsel bei PDFs mit mehreren Seiten }
//  Eine Reihe behält immer zwei Felder; bei A3 zeigt sie nur das erste,
//  das zweite kommt zurück, wenn man wieder auf zwei A4 schaltet.
// =================================================================
import { alt } from "../bruecke.jsx";

export const BOARD = "haupt";
// Das Blatt, auf dem gestaltet wird, in Punkten des Bildschirms hochkant
export const BREITE = 1080, HOEHE = 1920;
export const LUECKE = 12;
// A4 hoch: Breite aus zwei Feldern nebeneinander, Höhe im Verhältnis √2
export const A4_B = (BREITE - 3 * LUECKE) / 2;          // 522
export const A4_H = Math.round(A4_B * Math.SQRT2);      // 738
export const KOPF_H = HOEHE - 2 * A4_H - 3 * LUECKE;    // 408
// Höhe durch Breite für die Zeichenfläche je Format
export const BLATT = { a4: Math.SQRT2, a3: 1 / Math.SQRT2 };
export const SEKUNDEN = 20;

export const neueId = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const leeresFeld = () => ({ id: neueId(), art: "leer" });

export function aufbauOrdnen(a) {
  const reihen = Array.isArray(a && a.reihen) ? a.reihen : [];
  return {
    reihen: [0, 1].map((i) => {
      const r = reihen[i] || {};
      const felder = Array.isArray(r.felder) ? r.felder.slice(0, 2) : [];
      while (felder.length < 2) felder.push(leeresFeld());
      return { format: r.format === "a3" ? "a3" : "a4", felder: felder.map((f) => (f && f.id ? f : leeresFeld())) };
    }),
  };
}

export function fehltTabelle(e) {
  const t = String((e && (e.message || e.code)) || "");
  return /infoboard|PGRST205|42P01|does not exist|schema cache/i.test(t);
}

export async function aufbauLaden() {
  const r = await alt.zeitlimit(alt.db.from("infoboard").select("aufbau, geaendert_am")
    .eq("id", BOARD).maybeSingle(), 10000, "Infoboard");
  if (r.error) throw r.error;
  return { aufbau: aufbauOrdnen(r.data && r.data.aufbau), stand: String((r.data && r.data.geaendert_am) || "") };
}

export async function aufbauSpeichern(aufbau) {
  const jetzt = new Date().toISOString();
  const r = await alt.zeitlimit(alt.db.from("infoboard")
    .upsert({ id: BOARD, aufbau, geaendert_am: jetzt }, { onConflict: "id" }), 10000, "Infoboard speichern");
  if (r.error) throw r.error;
  return jetzt;
}

export function dateiTyp(name, mime) {
  const n = String(name || "").toLowerCase(), m = String(mime || "");
  if (m === "application/pdf" || /\.pdf$/.test(n)) return "pdf";
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(n)) return "bild";
  if (m.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/.test(n)) return "video";
  return "";
}

// Datei in die Ablage „zeichnungen“ unter infoboard/ legen. Der Name
// bekommt eine Zeit davor, damit eine neue Fassung derselben Datei den
// Bildschirm sicher frisch laden lässt.
export async function dateiHochladen(datei) {
  const typ = dateiTyp(datei.name, datei.type);
  if (!typ) throw new Error("Nur PDF, Bilder oder Videos.");
  const sauber = String(datei.name || "datei").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-80);
  const pfad = "infoboard/" + Date.now() + "-" + sauber;
  const up = await alt.db.storage.from("zeichnungen").upload(pfad, datei,
    { contentType: datei.type || "application/octet-stream", upsert: false });
  if (up.error) throw up.error;
  const url = alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
  return { url, pfad, name: datei.name, typ };
}

// Dieses Gerät ist der Bildschirm: nach dem Anmelden und nach jedem
// Neuladen geht das Infoboard von selbst über den ganzen Bildschirm auf
const GERAET = "hofer.infoboard.geraet";
export function istInfoboardGeraet() {
  try { return localStorage.getItem(GERAET) === "1"; } catch (f) { return false; }
}
export function infoboardGeraetSetzen(an) {
  try { if (an) localStorage.setItem(GERAET, "1"); else localStorage.removeItem(GERAET); } catch (f) { /* egal */ }
}
