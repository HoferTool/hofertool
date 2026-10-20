// =================================================================
//  INFOBOARD: DATEN
//  Der Aufbau des grossen Bildschirms (50 Zoll, hochkant; zuerst
//  war ein 43-Zoll-Bildschirm geplant) steht als eine Zeile in der Tabelle infoboard
//  (sql/infoboard.sql). Unter dem Kopf mit Logo und Solaranlage gibt
//  es drei Reihen mit je drei Feldern genau im Format A4 hochkant,
//  oder ein A3 quer (zwei Felder breit) und ein A4 daneben (Wunsch
//  Patrick 20. Oktober 2026: zuerst „A4 oder wenn doppelt A3“, dann
//  „drei Reihen Dokumente“, dann drei A4 nebeneinander „wäre mir
//  lieber“). Der Kopf nimmt, was über den drei Reihen frei bleibt.
//
//  aufbau = { reihen: [{ format: "a4" (drei A4) | "a3l" (A3 links, A4 rechts)
//                       | "a3r" (A4 links, A3 rechts), felder: [feld, feld, feld] }, …] }
//  feld   = { id, art: "leer" | "datei" | "text" | "skizze" (alt),
//             datei: { url, pfad, name, typ: "pdf" | "bild" | "video" | "excel" },
//             html (bei art "text": Text wie in Word, TextFeld.jsx),
//             sekunden: Seitenwechsel bei PDFs mit mehreren Seiten }
//  Eine Reihe behält immer drei Felder; mit A3 zeigt sie nur die ersten
//  zwei, das dritte kommt zurück, wenn man wieder auf drei A4 schaltet.
//  Das frühere „a3“ (eines über die ganze Breite) gilt als „a3l“.
// =================================================================
import { alt } from "../bruecke.jsx";

export const BOARD = "haupt";
// Das Blatt, auf dem gestaltet wird, in Punkten des Bildschirms hochkant
export const BREITE = 1080, HOEHE = 1920;
export const LUECKE = 12;
export const REIHEN = 3;
export const SPALTEN = 3;
// Ein Feld: ein Drittel der Breite, Höhe genau wie A4 (Wurzel 2)
export const FELD_B = (BREITE - (SPALTEN + 1) * LUECKE) / SPALTEN;   // 344
export const FELD_H = Math.round(FELD_B * Math.SQRT2);              // 486
// Kopf mit Logo, Uhr, Wetter und Solaranlage: der Rest oben
export const KOPF_H = HOEHE - REIHEN * (FELD_H + LUECKE);           // 426
// Höhe durch Breite für die Zeichenfläche: A4 hochkant, A3 quer
export const BLATT = { a4: FELD_H / FELD_B, a3: FELD_H / (2 * FELD_B + LUECKE) };
export const FORMATE = ["a4", "a3l", "a3r"];
export const SEKUNDEN = 20;

export const neueId = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const leeresFeld = () => ({ id: neueId(), art: "leer" });

export function aufbauOrdnen(a) {
  const reihen = Array.isArray(a && a.reihen) ? a.reihen : [];
  return {
    reihen: Array.from({ length: REIHEN }, (_, i) => {
      const r = reihen[i] || {};
      const felder = Array.isArray(r.felder) ? r.felder.slice(0, SPALTEN) : [];
      while (felder.length < SPALTEN) felder.push(leeresFeld());
      const format = r.format === "a3" ? "a3l" : FORMATE.includes(r.format) ? r.format : "a4";
      return { format, felder: felder.map((f) => (f && f.id ? f : leeresFeld())) };
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
  // Excel zeigt die Tafel als Blatt wie ausgedruckt; Word wird zu Text
  // (TextFeld.jsx), damit man ihn danach noch ändern kann
  if (/\.(xlsx|xlsm|xls|ods)$/.test(n) || /spreadsheet|ms-excel/.test(m)) return "excel";
  if (/\.docx$/.test(n) || /wordprocessingml/.test(m)) return "word";
  return "";
}

// Datei in die Ablage „zeichnungen“ unter infoboard/ legen. Der Name
// bekommt eine Zeit davor, damit eine neue Fassung derselben Datei den
// Bildschirm sicher frisch laden lässt.
export async function dateiHochladen(datei) {
  const typ = dateiTyp(datei.name, datei.type);
  if (!typ || typ === "word") throw new Error("Nur PDF, Bilder, Videos oder Excel.");
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
