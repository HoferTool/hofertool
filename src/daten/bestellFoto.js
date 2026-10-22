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
// verkleinern, das reicht für den Text und geht viel schneller.
// Dann nur den Rotanteil nehmen und den Kontrast strecken: Der rosa
// oder gelbe Leuchtstift auf der Bestellung wird damit fast weiss,
// die schwarze Schrift bleibt schwarz (mit Graustufen las die Erkennung
// „X90CrMoV18“ unter rosa Leuchtstift als „WXSGEMOVIE1d“).
// Liegt der Zettel schräg, wird das Bild gerade gedreht.
async function bildVorbereiten(datei) {
  const max = 2400;
  try {
    const bild = await createImageBitmap(datei);
    const f = Math.min(1, max / Math.max(bild.width, bild.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bild.width * f);
    c.height = Math.round(bild.height * f);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bild, 0, 0, c.width, c.height);
    if (bild.close) bild.close();
    const daten = ctx.getImageData(0, 0, c.width, c.height);
    const px = daten.data;
    // Kontrast: die dunkelsten und hellsten 0,5 % als Schwarz und Weiss;
    // bei einem fast leeren weissen Blatt nicht übertreiben
    const hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) hist[px[i]]++;
    const n = px.length / 4;
    let lo = 0, hi = 255, summe = 0;
    while (lo < 255 && (summe += hist[lo]) < n * 0.005) lo++;
    summe = 0;
    while (hi > 0 && (summe += hist[hi]) < n * 0.005) hi--;
    lo = Math.min(lo, 80);
    hi = Math.max(hi, 170);
    const spanne = Math.max(1, hi - lo);
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / spanne));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(daten, 0, 0);
    const winkel = schraegeSchaetzen(px, c.width, c.height);
    if (window.HOFER_FOTO_PROBE) window.HOFER_FOTO_PROBE({ winkel, lo, hi });
    return { winkel, drehen: (w) => gedreht(c, w) };
  } catch (f) {
    return { winkel: [0], drehen: () => datei };
  }
}

// Gerade drehen, Rand weiss; unter 2 Grad lohnt es nicht
function gedreht(c, winkel) {
  if (Math.abs(winkel) < 2) return c;
  const rad = (-winkel * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
  const g = document.createElement("canvas");
  g.width = Math.round(c.width * cos + c.height * sin);
  g.height = Math.round(c.width * sin + c.height * cos);
  const gtx = g.getContext("2d");
  gtx.fillStyle = "#fff";
  gtx.fillRect(0, 0, g.width, g.height);
  gtx.translate(g.width / 2, g.height / 2);
  gtx.rotate(rad);
  gtx.drawImage(c, -c.width / 2, -c.height / 2);
  return g;
}

// Schräglage der Textzeilen in Grad (−50 bis 50), bis zu vier
// Möglichkeiten, die wahrscheinlichste zuerst: An jedem Übergang von
// dunkel zu hell (Kanten der Buchstaben; grosse dunkle Flächen zählen
// so nur am Rand) einen Punkt nehmen und für jeden Winkel schauen, wie
// stark sich die Punkte auf wenige Zeilen häufen. Beim richtigen Winkel
// liegen sie genau auf den Textzeilen. Mehrere, weil auch Stangen im
// Hintergrund solche Linien bilden.
export function schraegeSchaetzen(px, breite, hoehe) {
  const schritt = Math.max(1, Math.round(Math.max(breite, hoehe) / 900));
  const xs = [], ys = [];
  for (let y = 0; y < hoehe; y += schritt) {
    for (let x = 0; x + schritt < breite; x += schritt) {
      const i = (y * breite + x) * 4;
      // Nur dünne dunkle Striche (Buchstaben), nicht breite Schatten
      const v = px[i], hell = v + 50;
      if (v < 150 && px[i + schritt * 4] > hell && x >= 3 * schritt
        && (px[i - schritt * 4] > hell || px[i - schritt * 8] > hell || px[i - schritt * 12] > hell)) {
        xs.push(x / schritt); ys.push(y / schritt);
      }
    }
  }
  if (xs.length < 200) return [0];
  const diag = Math.ceil(Math.hypot(breite, hoehe) / schritt) + 2;
  const zeilen = new Float64Array(diag * 2);
  const wert = (grad) => {
    const r = (grad * Math.PI) / 180, s = Math.sin(r), k = Math.cos(r);
    zeilen.fill(0);
    for (let j = 0; j < xs.length; j++) zeilen[Math.round(ys[j] * k - xs[j] * s) + diag]++;
    let w = 0;
    for (let j = 0; j < zeilen.length; j++) w += zeilen[j] * zeilen[j];
    return w;
  };
  const kurve = [];
  for (let g = -50; g <= 50; g += 1) kurve.push([g, wert(g)]);
  // Spitzen der Kurve, mindestens 8 Grad auseinander
  const spitzen = kurve.filter(([, w], i) => (i === 0 || w >= kurve[i - 1][1]) && (i === kurve.length - 1 || w >= kurve[i + 1][1]))
    .sort((a, b) => b[1] - a[1]);
  const gewaehlt = [];
  for (const [g] of spitzen) {
    if (gewaehlt.every((x) => Math.abs(x - g) >= 8)) gewaehlt.push(g);
    if (gewaehlt.length === 4) break;
  }
  // Fein auf einen Viertelgrad
  return gewaehlt.map((grob) => {
    let best = grob, bestWert = -1;
    for (let g = grob - 1; g <= grob + 1; g += 0.25) { const w = wert(g); if (w > bestWert) { bestWert = w; best = g; } }
    return best;
  });
}

// Für andere Fotos (Artikel, seit 1.109.0): dieselbe Texterkennung,
// fn bekommt den Worker
export async function mitTexterkennung(fortschritt, fn) {
  melden = fortschritt || null;
  try {
    return await fn(await workerHolen());
  } finally {
    melden = null;
  }
}

// → { text, material, kg, d, werkstoff }
export async function bestellFotoLesen(datei, fortschritt) {
  melden = fortschritt || null;
  try {
    const w = await workerHolen();
    const bild = await bildVorbereiten(datei);
    // Die wahrscheinlichste Schräglage zuerst; findet sich dort keine
    // Benennung mit Mass, die nächste (höchstens vier Versuche)
    let erstes = null;
    for (const winkel of bild.winkel) {
      const r = await w.recognize(bild.drehen(winkel));
      const text = (r && r.data && r.data.text) || "";
      const e = { text, ...bestellungAuswerten(text) };
      if (e.material && e.d) return e;
      if (!erstes) erstes = e;
    }
    return erstes;
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

// Tausender nur mit Apostroph, nicht mit Leerzeichen, und nie mitten
// in einer Zahl beginnen: Aus „Termin 11.11.2024 100,0000 kg“ las die
// Erkennung sonst „024 100,0000“ = 24'100 kg, aus dem Datum also die
// Menge (Patrick 22. Oktober 2026). Ebenso „1 100.0000 kg“ (Position 1).
// (ohne Rückblick ?<!, den Safari 16 nicht kennt: das Zeichen davor
// wird mitgenommen, die Zahl bleibt die erste Klammer)
const ZAHL = "(?:^|[^\\d.,'’])(\\d{1,3}(?:['’]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)";
const KG = new RegExp(ZAHL + "\\s*kg\\b(?!\\s*\\/\\s*m)", "gi");
// Datum (07.11.2024, 7.11.24, 07/11/2024) und Uhrzeit (06:52) vor der
// Suche nach kg entfernen, damit sie nie als Menge gelten
const DATUM = /\b\d{1,2}[./]\d{1,2}[./](?:\d{4}|\d{2})\b|\b\d{1,2}:\d{2}\b/g;
const GEWICHT_WORT = /gewicht|netto|menge|total|liefermenge|bestellmenge|gesamt/i;
// Vor der Zahl ein Betrag: dann ist es ein Preis, kein Gewicht
const PREIS_DAVOR = /(chf|fr\.?|eur|€|preis)\s*:?\s*$/i;

function gewichtFinden(zeilen) {
  const kandidaten = [];
  zeilen.forEach((roh, i) => {
    const z = roh.replace(DATUM, " ");
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
      kandidaten.push({ n, punkte, zeile: roh });
    }
  });
  if (!kandidaten.length) return { n: null, zeile: null };
  // Bei gleichen Punkten die grösste Zahl: Totale stehen meist unten
  kandidaten.sort((a, b) => b.punkte - a.punkte || b.n - a.n);
  return kandidaten[0];
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

// Die Bestellungen von Hofer + Co. (Fotos von Patrick, 19. Oktober
// 2026) haben unter „BENENNUNG“ eine Zeile genau wie bei den Aufträgen:
// „7.2500 kg X30CrMoN15-1 rd 007 mm h6“, darunter „Stangenlänge
// 3000 mm“ und „Werkst. Nr. : 1.4108“. Diese Zeile wird übernommen,
// mit dem Werkstoff in richtiger Schreibweise und dem Mass, wie es
// dasteht (007), damit sie zu den Aufträgen passt.
const MASS_ZEILE = /\b(rd|rund|6-?kt|sw|sechskant|4-?kt|vk|vierkant|rohr)\b\.?\s*ø?\s*([\dOo]{1,4}(?:[.,]\d+)?)\s*(?:[x×\/]\s*([\dOo]{1,4}(?:[.,]\d+)?)\s*)?mm\b\s*(\S+)?/i;
const FORM_KURZ = { rund: "rd", sw: "6kt", sechskant: "6kt", "6-kt": "6kt", vk: "4kt", vierkant: "4kt", "4-kt": "4kt" };
// Toleranz nach „mm“: „h6“, von der Erkennung oft als „16“ oder „lı9“
// gelesen
function toleranzLesen(t) {
  const m = String(t || "").match(/^([hgfkHGFK]|[1lI|])(\d{1,2})\b/);
  if (!m) return "";
  return (/[hgfk]/i.test(m[1]) ? m[1].toLowerCase() : "h") + m[2];
}
const ziffern = (t) => String(t || "").replace(/[Oo]/g, "0");

export function bestellungAuswerten(text) {
  const zeilen = String(text || "").split(/\r?\n/).map((z) => z.replace(/\s+/g, " ").trim()).filter(Boolean);
  // Die Zeilen, aus denen gelesen wurde, zeigt das Fenster markiert
  // (Wunsch Patrick 22. Oktober 2026: „besser sehen, was es gelesen hat“)
  const gew = gewichtFinden(zeilen);
  const kg = gew.n, zeileKg = gew.zeile;

  // 1. Die Benennung mit Form und Mass in mm (nicht die Stangenlänge)
  const mi = zeilen.findIndex((z) => MASS_ZEILE.test(z) && !/stangenl|länge|laenge/i.test(z));
  if (mi >= 0) {
    const z = zeilen[mi];
    const m = z.match(MASS_ZEILE);
    const form = FORM_KURZ[m[1].toLowerCase()] || m[1].toLowerCase();
    const aussen = ziffern(m[2]), innen = m[3] ? ziffern(m[3]) : "";
    // Werkstoff aus der Zeile, sonst aus „Werkst. Nr.“, sonst irgendwo
    const w = werkstoffGenau(z.slice(0, m.index))
      || zeilen.slice(mi + 1, mi + 6).map((x) => (/werkst/i.test(x) ? werkstoffGenau(x) : null)).find(Boolean)
      || zeilen.map((x) => werkstoffGenau(x)).find(Boolean) || null;
    // Ohne erkannten Werkstoff das Wort vor dem Mass, wie es dasteht
    const vorher = z.slice(0, m.index).replace(/^.*?\bkg\b/i, "").trim().split(" ").pop() || "";
    const name = w ? w.name || w.nr : vorher;
    const tol = toleranzLesen(m[4]);
    const d = zahlAusText(aussen);
    if (d > 0) {
      const material = [name, form, aussen + (innen ? "/" + innen : ""), "mm", tol].filter(Boolean).join(" ");
      return { material: materialZerlegen(material) ? material : "", werkstoff: w, d, form,
        kg, werkstoffUnsicher: !w, zeileMaterial: z, zeileKg };
    }
  }

  // 2. Sonst: irgendeine Zeile mit Werkstoff, das Mass dort oder darunter
  let best = null;
  zeilen.forEach((z, i) => {
    const w = werkstoffGenau(z);
    if (!w) return;
    let mass = massFinden(z);
    if (!mass || !(mass.d > 0)) mass = (zeilen[i + 1] && !/stangenl|länge/i.test(zeilen[i + 1]) && massFinden(zeilen[i + 1])) || null;
    const punkte = 3 + (mass && mass.d > 0 ? 2 : 0) + (/\b[hgfk]\d{1,2}\b/i.test(z) ? 1 : 0);
    if (!best || punkte > best.punkte) best = { z, i, w, mass, punkte };
  });
  // Ohne bekannte Werkstoffnummer: Zeile mit Rund/Ø, damit wenigstens
  // der Durchmesser kommt
  let mass = best ? best.mass : null;
  if (!mass) {
    for (const z of zeilen) {
      const m = massFinden(z);
      if (m && m.d > 0 && !/kg|stangenl|länge/i.test(z)) { mass = m; break; }
    }
  }

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
    zeileMaterial: best ? best.z : null,
    zeileKg,
  };
}
