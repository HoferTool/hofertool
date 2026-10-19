// =================================================================
//  MATERIAL AUS DEM FOTO EINER BESTELLUNG LESEN
//  Wunsch Patrick 19. Oktober 2026: „mit Foto Materialbezeichnung,
//  Gewicht und Durchmesser herauslesen, die Bestellungen haben alle
//  die gleiche Struktur“. Das Foto wird nur gelesen, nie gespeichert.
//
//  Texterkennung mit Tesseract direkt im Gerät: kostenlos, ohne Konto,
//  das Foto verlässt das Gerät nicht. Programm und Sprachdaten (Deutsch)
//  kommen beim ersten Mal von jsdelivr und bleiben dann im Gerät.
//  Die Bibliothek wird erst beim ersten Foto geladen, damit die App
//  dadurch nicht langsamer startet.
//
//  bestellungAuswerten(text) sucht im gelesenen Text:
//    Material   die Zeile mit Werkstoff (1.4305, X8CrNiS18-9 …) und
//               Mass (rd 24, Ø 24, 24 mm), daraus eine Bezeichnung wie
//               bei den Aufträgen: „X8CrNiS18-9 rd 24 mm h9“
//    Gewicht    Zahl vor „kg“, bevorzugt in einer Zeile mit Gewicht,
//               Netto, Menge oder Total, ohne Preise je kg
// =================================================================
import { werkstoffGenau, materialZerlegen } from "./material.js";

let worker = null;
let melden = null;

async function workerHolen() {
  if (worker) return worker;
  const { createWorker } = await import("tesseract.js");
  // Ein Worker für alle Fotos; die Fortschrittsmeldung geht an das
  // Fenster, das gerade liest
  worker = createWorker("deu", 1, {
    logger: (m) => { if (melden && m && typeof m.progress === "number") melden(m.status, m.progress); },
  }).catch((f) => { worker = null; throw f; });
  return worker;
}

// Handyfotos sind 12 Megapixel und mehr: auf höchstens 2400 Pixel
// verkleinern, das reicht für den Text und geht viel schneller
async function bildVorbereiten(datei) {
  const max = 2400;
  try {
    const bild = await createImageBitmap(datei);
    const f = Math.min(1, max / Math.max(bild.width, bild.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bild.width * f);
    c.height = Math.round(bild.height * f);
    const ctx = c.getContext("2d");
    // Graustufen mit etwas mehr Kontrast hilft bei Fotos mit Schatten
    ctx.filter = "grayscale(1) contrast(1.3)";
    ctx.drawImage(bild, 0, 0, c.width, c.height);
    if (bild.close) bild.close();
    return c;
  } catch (f) {
    return datei;
  }
}

// → { text, material, kg, d, werkstoff }
export async function bestellFotoLesen(datei, fortschritt) {
  melden = fortschritt || null;
  try {
    const w = await workerHolen();
    const bild = await bildVorbereiten(datei);
    const r = await w.recognize(bild);
    const text = (r && r.data && r.data.text) || "";
    return { text, ...bestellungAuswerten(text) };
  } finally {
    melden = null;
  }
}

// „1'234,5“, „1.234,50“, „245,000“, „12.5“ → Zahl. Apostroph und
// Leerzeichen trennen Tausender; mit Punkt und Komma ist das letzte
// das Komma.
export function zahlAusText(t) {
  let s = String(t || "").replace(/['’\s]/g, "");
  if (!s) return null;
  const punkt = s.lastIndexOf("."), komma = s.lastIndexOf(",");
  if (punkt >= 0 && komma >= 0) {
    s = punkt > komma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}

const ZAHL = "(\\d{1,3}(?:['’ ]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)";
const KG = new RegExp(ZAHL + "\\s*kg\\b(?!\\s*\\/\\s*m)", "gi");
const GEWICHT_WORT = /gewicht|netto|menge|total|liefermenge|bestellmenge|gesamt/i;
// Vor der Zahl ein Betrag: dann ist es ein Preis, kein Gewicht
const PREIS_DAVOR = /(chf|fr\.?|eur|€|preis)\s*:?\s*$/i;

function gewichtFinden(zeilen) {
  const kandidaten = [];
  zeilen.forEach((z, i) => {
    for (const m of z.matchAll(KG)) {
      const n = zahlAusText(m[1]);
      if (!(n > 0)) continue;
      if (PREIS_DAVOR.test(z.slice(Math.max(0, m.index - 8), m.index))) continue;
      // Gewichtswort in derselben Zeile zählt, in der Zeile darüber nur,
      // wenn dort selbst kein kg steht (Spaltenkopf); brutto weniger
      let punkte = 0;
      if (GEWICHT_WORT.test(z)) punkte += 2;
      if (i > 0 && GEWICHT_WORT.test(zeilen[i - 1]) && !/kg/i.test(zeilen[i - 1])) punkte += 1;
      if (/brutto/i.test(z)) punkte -= 2;
      kandidaten.push({ n, punkte });
    }
  });
  if (!kandidaten.length) return null;
  // Bei gleichen Punkten die grösste Zahl: Totale stehen meist unten
  kandidaten.sort((a, b) => b.punkte - a.punkte || b.n - a.n);
  return kandidaten[0].n;
}

// Mass in einer Zeile: „rd 24“, „Ø 24“, „Rund 24“, „Durchmesser 24“,
// „SW 12“ (Sechskant), sonst „24 mm“ → { form, d, innen }
function massFinden(z) {
  const k = z.toLowerCase().replace(/[⌀∅]/g, "ø");
  const sw = k.match(/\b(?:sw|6-?kt|sechskant)\.?\s*(\d+(?:[.,]\d+)?)/);
  if (sw) return { form: "6kt", d: zahlAusText(sw[1]) };
  const vk = k.match(/\b(?:4-?kt|vierkant|vk)\.?\s*(\d+(?:[.,]\d+)?)/);
  if (vk) return { form: "4kt", d: zahlAusText(vk[1]) };
  const rohr = k.match(/\brohr\b\D{0,6}(\d+(?:[.,]\d+)?)\s*(?:[x×\/]\s*(\d+(?:[.,]\d+)?))?/);
  if (rohr) return { form: "rohr", d: zahlAusText(rohr[1]), innen: rohr[2] ? zahlAusText(rohr[2]) : null };
  const rd = k.match(/(?:\b(?:rd|rund|durchmesser|dm)\b\.?|ø)\s*:?\s*(\d+(?:[.,]\d+)?)/);
  if (rd) return { form: "rd", d: zahlAusText(rd[1]) };
  const mm = k.match(/\b(\d+(?:[.,]\d+)?)\s*mm\b/);
  if (mm) return { form: "rd", d: zahlAusText(mm[1]) };
  return null;
}

function zahlKurz(n) { return String(Math.round(n * 100) / 100).replace(".", ","); }

export function bestellungAuswerten(text) {
  const zeilen = String(text || "").split(/\r?\n/).map((z) => z.replace(/\s+/g, " ").trim()).filter(Boolean);
  // Die Zeile mit dem Material: Werkstoff zählt am meisten, ein Mass
  // dazu, und Zeilen gleich darunter dürfen das Mass liefern (oft steht
  // die Abmessung auf der nächsten Zeile)
  let best = null;
  zeilen.forEach((z, i) => {
    const w = werkstoffGenau(z);
    if (!w) return;
    let mass = massFinden(z);
    if (!mass || !(mass.d > 0)) mass = (zeilen[i + 1] && massFinden(zeilen[i + 1])) || null;
    const punkte = 3 + (mass && mass.d > 0 ? 2 : 0) + (/\b[hgfk]\d{1,2}\b/i.test(z) ? 1 : 0);
    if (!best || punkte > best.punkte) best = { z, i, w, mass, punkte };
  });
  // Ohne bekannte Werkstoffnummer: Zeile mit Rund/Ø, damit wenigstens
  // der Durchmesser kommt
  let mass = best ? best.mass : null;
  if (!mass) {
    for (const z of zeilen) { const m = massFinden(z); if (m && m.d > 0 && !/kg/i.test(z)) { mass = m; break; } }
  }
  const kg = gewichtFinden(zeilen);

  let material = "";
  if (best) {
    // Name wie bei den Aufträgen (X8CrNiS18-9), sonst die Nummer
    const name = best.w.name || best.w.nr;
    const tolM = (best.z + " " + (zeilen[best.i + 1] || "")).match(/\b([hgfk]\d{1,2})\b/i);
    material = name;
    if (mass && mass.d > 0) {
      material += " " + mass.form + " " + zahlKurz(mass.d) + (mass.innen ? "/" + zahlKurz(mass.innen) : "") + " mm";
    }
    if (tolM) material += " " + tolM[1].toLowerCase();
    // Gegenprobe: so muss es die übrige App auch lesen können
    if (!materialZerlegen(material)) material = "";
  }
  return {
    material,
    werkstoff: best ? best.w : null,
    d: mass && mass.d > 0 ? mass.d : null,
    form: mass ? mass.form : null,
    kg,
  };
}
