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
//
//  Seit 1.132.0 ohne Raster (Wunsch Patrick 21. Oktober 2026: „Dokumente
//  reinziehen und selber frei positionieren, Grösse über die Ecke, frei
//  drehen“): aufbau = { frei: true, teile: [teil, …] }, hinten zuerst,
//  teil = feld + { x, y, w, h, drehung } in Punkten der Tafel (oben links
//  vor dem Drehen, gedreht wird um die Mitte, in Grad). Ein Aufbau mit
//  Reihen wird beim Laden umgewandelt: jedes gefüllte Feld wird ein Teil
//  an seinem bisherigen Platz; gespeichert wird er so beim nächsten Ändern.
// =================================================================
import { createContext, useContext } from "react";
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

// Die Bildschirme: das Infoboard im Gang (hochkant) und seit 1.201.0 der
// Bildschirm am Empfang (quer, Wunsch Patrick 26. Oktober 2026). Jeder hat
// seine Zeile in der Tabelle infoboard. Der Empfang ist genau 1920 × 1080
// Punkte gross, weil der Browser der Samsung-Bildschirme höchstens Full HD
// zeichnet: so ist jeder Punkt ein Pixel und nichts wird unscharf verkleinert.
export const TAFELN = {
  haupt: { id: "haupt", name: "Infoboard", seite: "infoboard", breite: BREITE, hoehe: HOEHE, kopf: KOPF_H,
    geraet: "hofer.infoboard.geraet", grund: "#0b1626" },
  // ruhig: eigener heller Kopf ohne Wellen und Jetski, nachts keine Hühner
  // (Wunsch Patrick 26. Oktober 2026: „keine durchlaufenden Animationen“)
  empfang: { id: "empfang", name: "Empfang", seite: "empfang", breite: 1920, hoehe: 1080, kopf: 330,
    geraet: "hofer.empfang.geraet", ruhig: true, grund: "#fffdf9", kopfFarbe: "#f4efe7" },
};

// Farben der Tafel: am Empfang stellt sie der Admin selbst ein (Wunsch
// Patrick 26. Oktober 2026: „ich möchte es einstellen können“), gespeichert
// im Aufbau unter farben; leer = Vorgabe
export function tafelFarben(mass, aufbau) {
  const f = (aufbau && aufbau.farben) || {};
  return { grund: f.grund || mass.grund, kopf: f.kopf || mass.kopfFarbe };
}
export const TafelMass = createContext(TAFELN.haupt);
export const useTafelMass = () => useContext(TafelMass);

export const neueId = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const leeresFeld = () => ({ id: neueId(), art: "leer" });

// Welche Spalten jedes Feld einer Reihe belegt: [erste Spalte, Breite]
const SPALTEN_JE_FORMAT = { a4: [[0, 1], [1, 1], [2, 1]], a3l: [[0, 2], [2, 1]], a3r: [[0, 1], [1, 2]] };

// Lage jedes sichtbaren Felds eines alten Aufbaus mit Reihen
export function felderLage(aufbau) {
  const aus = [];
  aufbau.reihen.forEach((r, ri) => {
    const top = KOPF_H + ri * (FELD_H + LUECKE);
    (SPALTEN_JE_FORMAT[r.format] || SPALTEN_JE_FORMAT.a4).forEach(([sp, breit], pi) => {
      aus.push({ feld: r.felder[pi], reihe: ri, platz: pi, spalte: sp, breit, format: breit === 2 ? "a3" : "a4",
        left: LUECKE + sp * (FELD_B + LUECKE), top, width: breit * FELD_B + (breit - 1) * LUECKE, height: FELD_H });
    });
  });
  return aus;
}

export const MIN_GROESSE = 60;
const zahl = (v, standard) => (Number.isFinite(Number(v)) ? Number(v) : standard);

function teilOrdnen(t) {
  const w = Math.max(MIN_GROESSE, zahl(t.w, FELD_B)), h = Math.max(MIN_GROESSE, zahl(t.h, FELD_H));
  return { ...t, x: zahl(t.x, LUECKE), y: zahl(t.y, KOPF_H), w, h, drehung: zahl(t.drehung, 0) };
}

export function aufbauOrdnen(a) {
  if (a && a.frei && Array.isArray(a.teile)) {
    return { frei: true, teile: a.teile.filter((t) => t && t.id && t.art && t.art !== "leer").map(teilOrdnen),
      ...(a.farben ? { farben: a.farben } : {}) };
  }
  const reihen = reihenOrdnen(a);
  return { frei: true, teile: felderLage(reihen).filter((l) => l.feld.art !== "leer")
    .map((l) => teilOrdnen({ ...l.feld, x: l.left, y: l.top, w: l.width, h: l.height, drehung: 0 })) };
}

// Höhe durch Breite des Inhalts, damit ein neues Teil gleich passt:
// Bild und Video wie sie sind, PDF wie die erste Seite, sonst A4 hochkant
export async function verhaeltnisLesen(datei, typ) {
  const mitFrist = (p) => Promise.race([p, new Promise((_, nein) => setTimeout(() => nein(new Error("Zeit")), 6000))]);
  try {
    if (typ === "bild") {
      const b = await mitFrist(createImageBitmap(datei));
      const v = b.height / b.width; b.close && b.close();
      if (v > 0) return v;
    }
    if (typ === "video") {
      const url = URL.createObjectURL(datei);
      try {
        const v = await mitFrist(new Promise((ja, nein) => {
          const el = document.createElement("video");
          el.preload = "metadata"; el.muted = true;
          el.onloadedmetadata = () => ja(el.videoHeight / el.videoWidth);
          el.onerror = nein; el.src = url;
        }));
        if (v > 0) return v;
      } finally { URL.revokeObjectURL(url); }
    }
    if (typ === "pdf") {
      const { pdfjs } = await import("../teile/PdfAnsicht.jsx");
      const lib = await pdfjs();
      const doc = await mitFrist(lib.getDocument({ data: new Uint8Array(await datei.arrayBuffer()), isEvalSupported: false }).promise);
      const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
      doc.destroy();
      if (vp.width > 0) return vp.height / vp.width;
    }
  } catch (f) { /* dann eben A4 */ }
  return Math.SQRT2;
}

// Ein neues Teil: so breit wie ein A4-Feld (quer wie ein A3), höchstens
// so hoch wie zwei Felder, mit der Mitte an der gewünschten Stelle
export function neuesTeil(feld, verhaeltnis, mitte, mass = TAFELN.haupt) {
  // Quer ist unter dem Kopf weniger hoch: dort höchstens so hoch wie der Platz
  const hMax = Math.min(2 * FELD_H, mass.hoehe - mass.kopf - 2 * LUECKE);
  let w = verhaeltnis < 1 ? 2 * FELD_B + LUECKE : FELD_B;
  let h = w * verhaeltnis;
  if (h > hMax) { h = hMax; w = h / verhaeltnis; }
  const m = mitte || { x: mass.breite / 2, y: mass.kopf + (mass.hoehe - mass.kopf) / 2 };
  const x = Math.min(Math.max(m.x - w / 2, 0), mass.breite - w), y = Math.min(Math.max(m.y - h / 2, 0), mass.hoehe - h);
  return { ...feld, id: feld.id || neueId(), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), drehung: 0 };
}

function reihenOrdnen(a) {
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

export async function aufbauLaden(board = BOARD) {
  const r = await alt.zeitlimit(alt.db.from("infoboard").select("aufbau, geaendert_am")
    .eq("id", board).maybeSingle(), 10000, "Infoboard");
  if (r.error) throw r.error;
  return { aufbau: aufbauOrdnen(r.data && r.data.aufbau), stand: String((r.data && r.data.geaendert_am) || "") };
}

export async function aufbauSpeichern(aufbau, board = BOARD) {
  const jetzt = new Date().toISOString();
  const r = await alt.zeitlimit(alt.db.from("infoboard")
    .upsert({ id: board, aufbau, geaendert_am: jetzt }, { onConflict: "id" }), 10000, "Infoboard speichern");
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
export function istInfoboardGeraet(mass = TAFELN.haupt) {
  try { return localStorage.getItem(mass.geraet) === "1"; } catch (f) { return false; }
}
export function infoboardGeraetSetzen(an, mass = TAFELN.haupt) {
  try { if (an) localStorage.setItem(mass.geraet, "1"); else localStorage.removeItem(mass.geraet); } catch (f) { /* egal */ }
}
// Welcher Bildschirm dieses Gerät ist. Der Empfang geht vor: das App-Paket
// für Samsung öffnet die App mit ?bildschirm=empfang (siehe
// public/samsung/), dann merkt sich das Gerät das von selbst, ohne Häkchen.
export function bildschirmDiesesGeraets() {
  try {
    const w = new URLSearchParams(location.search).get("bildschirm");
    if (w && TAFELN[w === "infoboard" ? "haupt" : w]) {
      for (const t of Object.values(TAFELN)) localStorage.removeItem(t.geraet);
      localStorage.setItem(TAFELN[w === "infoboard" ? "haupt" : w].geraet, "1");
    }
  } catch (f) { /* ohne Speicher eben nicht */ }
  if (istInfoboardGeraet(TAFELN.empfang)) return TAFELN.empfang;
  if (istInfoboardGeraet(TAFELN.haupt)) return TAFELN.haupt;
  return null;
}
