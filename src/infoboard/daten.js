// =================================================================
//  INFOBOARD: DATEN
//  Der Aufbau des grossen Bildschirms (50 Zoll, hochkant; zuerst
//  war ein 43-Zoll-Bildschirm geplant) steht als eine Zeile in der Tabelle infoboard
//  (sql/infoboard.sql). Unter dem Kopf mit Logo und Solaranlage gibt
//  es drei Reihen; jede Reihe ist entweder zwei Felder nebeneinander
//  oder eines über die ganze Breite (Wunsch Patrick 20. Oktober 2026:
//  zuerst „A4 oder wenn doppelt A3“ in zwei Reihen, dann „drei Reihen
//  Dokumente, auch wenn es nicht ganz für A4 reicht“). Die Felder sind
//  darum etwas weniger hoch als A4; ein PDF wird ganz eingepasst.
//
//  aufbau = { reihen: [{ format: "a4" (zwei) | "a3" (eines breit), felder: [feld, feld] }, …] }
//  feld   = { id, art: "leer" | "datei" | "skizze",
//             datei: { url, pfad, name, typ: "pdf" | "bild" | "video" },
//             sekunden: Seitenwechsel bei PDFs mit mehreren Seiten }
//  Eine Reihe behält immer zwei Felder; breit zeigt sie nur das erste,
//  das zweite kommt zurück, wenn man wieder auf zwei schaltet.
// =================================================================
import { alt } from "../bruecke.jsx";

export const BOARD = "haupt";
// Das Blatt, auf dem gestaltet wird, in Punkten des Bildschirms hochkant
export const BREITE = 1080, HOEHE = 1920;
export const LUECKE = 12;
export const REIHEN = 3;
// Kopf mit Logo, Uhr, Wetter und Solaranlage
export const KOPF_H = 360;
// Ein Feld: halbe Breite, ein Drittel der Höhe unter dem Kopf
export const FELD_B = (BREITE - 3 * LUECKE) / 2;                               // 522
export const FELD_H = Math.floor((HOEHE - KOPF_H - REIHEN * LUECKE) / REIHEN); // 508
// Höhe durch Breite für die Zeichenfläche je Format („a4“ = halbe
// Breite, „a3“ = ganze Breite; die Namen bleiben wegen der gespeicherten Daten)
export const BLATT = { a4: FELD_H / FELD_B, a3: FELD_H / (BREITE - 2 * LUECKE) };
export const SEKUNDEN = 20;

export const neueId = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const leeresFeld = () => ({ id: neueId(), art: "leer" });

export function aufbauOrdnen(a) {
  const reihen = Array.isArray(a && a.reihen) ? a.reihen : [];
  return {
    reihen: Array.from({ length: REIHEN }, (_, i) => {
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
