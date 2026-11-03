// =================================================================
//  VISITENKARTE LESEN
//  Wunsch Patrick 3. November 2026: Kontaktpersonen bei den Lieferanten
//  „am besten mit Erkennung der Visitenkarte“. Kostenlos und ohne
//  Konto: dieselbe Texterkennung im Gerät wie beim Foto der Bestellung
//  (Tesseract, src/daten/bestellFoto.js). Das Foto verlässt das Gerät
//  für die Erkennung nicht.
//
//  karteLesen(datei, fortschritt) → { text, name, funktion, telefon,
//    mobil, email, website }
//  karteAuswerten(text, firma) macht dasselbe aus fertigem Text; firma
//  (Name des Lieferanten) hilft, die Firmenzeile nicht für den Namen
//  der Person zu halten.
// =================================================================
// Erst beim ersten Foto laden, damit die Texterkennung den Start nicht bremst
const texterkennung = () => import("./bestellFoto.js");

// Bild für die Erkennung vorbereiten (Patrick 3. November 2026: „die
// Erkennung der Visitenkarte funktioniert nicht“). Die erste Fassung
// las nur Karten, die genau waagrecht im Bild lagen; mit dem Handy
// hochkant fotografiert steht die Karte aber meist quer im Bild, und
// dann las die Erkennung nur Zeichensalat. Darum jetzt:
//  1. auf höchstens 2400 Pixel bringen (kleine Bilder bis 2,5-fach
//     vergrössern), grau machen;
//  2. das Licht ausgleichen: jeden Punkt durch die Helligkeit seiner
//     Umgebung teilen, so verschwinden Schatten, Glanz und ein dunkler
//     Tisch um die Karte, die Schrift bleibt;
//  3. helle Schrift auf dunkler Karte umkehren;
//  4. die Lage suchen (0, 90, 270, 180 Grad, siehe karteLesen) und
//     eine leichte Schräglage gerade drehen.
function grauBild(bild) {
  const lang = Math.max(bild.width, bild.height);
  const f = Math.min(2.5, 2400 / lang);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bild.width * f));
  c.height = Math.max(1, Math.round(bild.height * f));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bild, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  const g = new Float32Array(c.width * c.height);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) g[j] = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
  return { c, ctx, d, g, w: c.width, h: c.height };
}

// Mittelwert in einem Fenster um jeden Punkt (Summenbild, schnell)
function umgebung(g, w, h, r) {
  const s = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let zeile = 0;
    for (let x = 0; x < w; x++) {
      zeile += g[y * w + x];
      s[(y + 1) * (w + 1) + x + 1] = s[y * (w + 1) + x + 1] + zeile;
    }
  }
  const m = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = s[y1 * (w + 1) + x1] - s[y0 * (w + 1) + x1] - s[y1 * (w + 1) + x0] + s[y0 * (w + 1) + x0];
      m[y * w + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return m;
}

export function lichtAusgleichen(g, w, h) {
  // Ist das Bild grösstenteils dunkel (dunkle Karte mit heller Schrift),
  // erst umkehren; ein dunkler Tisch allein reicht dafür nicht, darum
  // zählt nur die Mitte des Bildes, wo die Karte liegt
  let summe = 0, n = 0;
  for (let y = Math.round(h * 0.3); y < h * 0.7; y += 2)
    for (let x = Math.round(w * 0.3); x < w * 0.7; x += 2) { summe += g[y * w + x]; n++; }
  const umkehren = n && summe / n < 100;
  if (umkehren) for (let i = 0; i < g.length; i++) g[i] = 255 - g[i];
  // Hintergrund = etwas aufgehellter Mittelwert der Umgebung, so gross,
  // dass ein Buchstabe ihn kaum verändert
  const r = Math.max(15, Math.round(Math.max(w, h) / 40));
  const m = umgebung(g, w, h, r);
  const aus = new Uint8ClampedArray(g.length);
  for (let i = 0; i < g.length; i++) {
    const bg = Math.max(30, m[i] * 1.08);
    const v = (g[i] / bg) * 255;
    // weich: alles nahe am Hintergrund weiss, Schrift kräftig dunkel
    aus[i] = v >= 235 ? 255 : Math.max(0, (v - 40) * 255 / 195);
  }
  return { aus, umkehren };
}

function vorbereiten(bild) {
  const b = grauBild(bild);
  const { aus, umkehren } = lichtAusgleichen(b.g, b.w, b.h);
  const px = b.d.data;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) { px[i] = px[i + 1] = px[i + 2] = aus[j]; px[i + 3] = 255; }
  b.ctx.putImageData(b.d, 0, 0);
  return { c: b.c, px, w: b.w, h: b.h, umkehren };
}

// Um ein Vielfaches von 90 Grad drehen, dazu fein um „fein“ Grad
function drehen(c, viertel, fein) {
  const grad = viertel * 90 + (fein || 0);
  if (!grad) return c;
  const rad = (grad * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
  const g = document.createElement("canvas");
  g.width = Math.round(c.width * cos + c.height * sin);
  g.height = Math.round(c.width * sin + c.height * cos);
  const ctx = g.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, g.width, g.height);
  ctx.translate(g.width / 2, g.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(c, -c.width / 2, -c.height / 2);
  return g;
}

// Liegen die Zeilen eher waagrecht oder senkrecht? Dunkle Punkte je
// Zeile und je Spalte zählen und über etwa eine Schrifthöhe glätten:
// Quer zu den Textzeilen wechseln sich Zeilen und Lücken ab (starke
// Schwankung), längs verwischen die einzelnen Buchstaben zu einer
// gleichmässigen Kurve.
export function eherSenkrecht(px, w, h) {
  const zeilen = new Float64Array(h), spalten = new Float64Array(w);
  const schritt = Math.max(1, Math.round(Math.max(w, h) / 1200));
  for (let y = 0; y < h; y += schritt)
    for (let x = 0; x < w; x += schritt)
      if (px[(y * w + x) * 4] < 128) { zeilen[y]++; spalten[x]++; }
  const k = Math.max(3, Math.round(Math.max(w, h) / 150));
  const schwankung = (a) => {
    const glatt = [];
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i];
      if (i >= k) sum -= a[i - k];
      if (i >= k - 1) glatt.push(sum / k);
    }
    const mitText = glatt.filter((x) => x > 0);
    if (mitText.length < 10) return 0;
    const m = mitText.reduce((x, y) => x + y, 0) / mitText.length;
    const v = mitText.reduce((x, y) => x + (y - m) * (y - m), 0) / mitText.length;
    return Math.sqrt(v) / Math.max(1e-9, m);
  };
  const quer = schwankung(zeilen), laengs = schwankung(spalten);
  return laengs > quer * 1.1;
}

// Wie gut ist ein Ergebnis? Erkannte Felder zählen viel, dazu die
// Sicherheit der Erkennung und wie viele echte Wörter darin stehen
function punkte(r, e) {
  const conf = (r && r.data && r.data.confidence) || 0;
  const text = (r && r.data && r.data.text) || "";
  const woerter = (text.match(/[A-Za-zÄÖÜäöüéè]{3,}/g) || []).length;
  return (e.email ? 30 : 0) + (e.telefon ? 20 : 0) + (e.mobil ? 20 : 0) + (e.name ? 20 : 0)
    + (e.funktion ? 10 : 0) + conf * 0.6 + Math.min(woerter, 25);
}
const gutGenug = (r, e) => ((r && r.data && r.data.confidence) || 0) >= 60 && (e.email || e.telefon || e.mobil) && e.name;

export async function karteLesen(datei, fortschritt, firma) {
  const { mitTexterkennung } = await texterkennung();
  return mitTexterkennung(fortschritt, async (w) => {
    let bild;
    try {
      bild = await createImageBitmap(datei);
    } catch (f) {
      // Ohne createImageBitmap (alte Browser) das Bild direkt lesen
      const r = await w.recognize(datei);
      const text = (r && r.data && r.data.text) || "";
      return { text, ...karteAuswerten(text, firma) };
    }
    const v = vorbereiten(bild);
    if (bild.close) bild.close();
    // Reihenfolge der Lagen: zuerst die, in der die Zeilen waagrecht
    // liegen; hochkant gedreht ist 90 Grad (Handy im Uhrzeigersinn
    // gedreht) häufiger als 270
    const senk = eherSenkrecht(v.px, v.w, v.h);
    const lagen = senk ? [1, 3, 0, 2] : [0, 2, 1, 3];
    const { schraegeSchaetzen } = await texterkennung();
    let bestes = null;
    for (const viertel of lagen) {
      let c = drehen(v.c, viertel, 0);
      // leichte Schräglage gerade drehen (nicht mehr als 15 Grad)
      try {
        const ctx = c.getContext("2d", { willReadFrequently: true });
        const p = ctx.getImageData(0, 0, c.width, c.height).data;
        const fein = (schraegeSchaetzen(p, c.width, c.height) || [0])[0] || 0;
        if (Math.abs(fein) >= 1.5 && Math.abs(fein) <= 15) c = drehen(c, 0, -fein);
      } catch (f) { /* ohne Feindrehung */ }
      const r = await w.recognize(c);
      const text = (r && r.data && r.data.text) || "";
      const e = karteAuswerten(text, firma);
      const wert = punkte(r, e);
      if (!bestes || wert > bestes.wert) bestes = { wert, e: { text, ...e } };
      if (window.HOFER_KARTE_PROBE) window.HOFER_KARTE_PROBE({ viertel, conf: r && r.data && r.data.confidence, wert });
      if (gutGenug(r, e)) break;
    }
    return bestes.e;
  });
}

// Kleines Foto der Karte zum Ablegen: höchstens 1200 Pixel, JPEG
export async function karteVerkleinern(datei) {
  try {
    const bild = await createImageBitmap(datei);
    const f = Math.min(1, 1200 / Math.max(bild.width, bild.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bild.width * f);
    c.height = Math.round(bild.height * f);
    c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
    if (bild.close) bild.close();
    return await new Promise((ok) => c.toBlob((b) => ok(b || datei), "image/jpeg", 0.85));
  } catch (f) {
    return datei;
  }
}

// ---------- Auswerten ----------

const MAIL = /[A-Za-z0-9._%+-]+\s?@\s?[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const WEB = /\b(?:https?:\/\/)?(?:www\.)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/i;
// Telefon: +41 32 123 45 67, 032 123 45 67, +49 (0)7123 456-78 …
const TEL = /(?:\+|00)?\d[\d\s/().-]{7,}\d/g;
const MOBIL_WORT = /\b(mobil|mobile|natel|handy|cell|m\.?)\s*[:.]?\s*$/i;
const FAX_WORT = /\b(fax|f\.?)\s*[:.]?\s*$/i;

// Wörter, die auf eine Funktion hinweisen
const FUNKTION = /(verkauf|vertrieb|aussendienst|aussendienst|innendienst|berater|beratung|leiter|leitung|gesch(ä|a)ftsf(ü|u)hr|inhaber|manager|sales|key\s?account|account|technik|techniker|ingenieur|engineer|anwendungs|applikation|einkauf|support|service|kundendienst|director|direktor|head|prokurist|projekt|area|gebietsverkaufs|repr(ä|a)sentant|consultant|spezialist|specialist|vertreter|ceo|cto|coo|cfo|dipl\.?|meister)/i;
// Zeilen, die sicher kein Personenname sind
const KEIN_NAME = /(\bag\b|\bgmbh\b|\bsa\b|\bsarl\b|\bkg\b|\bltd\b|\binc\b|\bco\b\.?|strasse|str\.|weg\b|gasse|platz|\bch-|\bd-|postfach|schweiz|switzerland|deutschland|germany|tools?\b|werkzeug|technik|systems?|group|\d)/i;

function nummerSauber(s) {
  return String(s || "").replace(/[^\d+()/ .-]/g, "").replace(/\s+/g, " ").trim();
}

function istSchweizMobil(n) {
  const d = n.replace(/\D/g, "").replace(/^0041/, "41").replace(/^0(?=7)/, "417");
  return /^417[5-9]\d{7}$/.test(d) || /^49(15|16|17)\d{8,9}$/.test(d.replace(/^0049/, "49"));
}

// Grossbuchstaben am Anfang jedes Wortes: „Hans Muster“, „Anna-Lena von Arx“
function siehtAusWieName(z) {
  if (z.length < 4 || z.length > 40 || KEIN_NAME.test(z) || MAIL.test(z) || FUNKTION.test(z)) return false;
  const woerter = z.split(/\s+/).filter(Boolean);
  if (woerter.length < 2 || woerter.length > 4) return false;
  const klein = new Set(["von", "van", "de", "der", "di", "da", "le", "la", "du"]);
  return woerter.every((w) => klein.has(w.toLowerCase())
    || /^[A-ZÄÖÜÉÈ][a-zäöüéèàçß'’-]+\.?$/.test(w) || /^[A-ZÄÖÜ]{2,}(-[A-ZÄÖÜ]{2,})?$/.test(w)
    || /^[A-ZÄÖÜ][a-zäöü]+-[A-ZÄÖÜ][a-zäöü]+$/.test(w) || /^[A-ZÄÖÜ]\.$/.test(w));
}

function grossKlein(z) {
  // „HANS MUSTER“ → „Hans Muster“
  if (z !== z.toUpperCase()) return z;
  return z.toLowerCase().replace(/(^|[\s-])([a-zäöü])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/ (Von|Van|De|Der|Di|Da|Du) /g, (m) => m.toLowerCase());
}

export function karteAuswerten(text, firma) {
  const zeilen = String(text || "").split(/\r?\n/).map((z) => z.replace(/[|_~«»]/g, " ").replace(/\s+/g, " ").trim()
    // „name(at)firma.ch“, „name [at] firma.ch“ und © statt @ aus der Erkennung
    .replace(/\s*(?:\(at\)|\[at\]|©)\s*/gi, "@")
    // Krümel am Zeilenanfang (Rand der Karte, Logo): „4 SANDRA KELLER“
    .replace(/^(?:[^A-Za-zÄÖÜäöü+(\d\s]+\s|[^\s.]\s(?=[A-ZÄÖÜ][A-Za-zÄÖÜäöü]{2,}\s[A-ZÄÖÜ]))+/, "")
    .replace(/^\d\s(?=[A-ZÄÖÜ]{2,}\s[A-ZÄÖÜ]{2,})/, ""))
    .filter((z) => z.length > 1);
  const e = { name: "", funktion: "", telefon: "", mobil: "", email: "", website: "" };

  // Mail und Website
  for (const z of zeilen) {
    const m = z.match(MAIL);
    if (m && !e.email) e.email = m[0].replace(/\s/g, "").replace(/[.,;]$/, "");
    const w = z.match(WEB);
    if (w && !e.website && !(m && m[0].includes(w[0]))) e.website = w[0];
  }

  // Telefonnummern mit dem Wort davor (Tel, Mobil, Fax …)
  const nummern = [];
  for (const z of zeilen) {
    if (MAIL.test(z) && !/\d{3}\s?\d{2}/.test(z.replace(MAIL, ""))) continue;
    let m;
    TEL.lastIndex = 0;
    while ((m = TEL.exec(z))) {
      const roh = m[0];
      const ziffern = roh.replace(/\D/g, "");
      if (ziffern.length < 9 || ziffern.length > 15) continue;
      // Postleitzahl mit Ort oder Datum sind keine Nummer
      if (/^\d{4,5}\s+[A-Za-zÄÖÜ]/.test(z.slice(m.index)) && ziffern.length < 9) continue;
      const davor = z.slice(0, m.index);
      nummern.push({ nr: nummerSauber(roh), mobilWort: MOBIL_WORT.test(davor) || /mobil|natel|handy|cell/i.test(davor),
        fax: FAX_WORT.test(davor) || /fax/i.test(davor) });
    }
  }
  for (const n of nummern) {
    if (n.fax) continue;
    const mobil = n.mobilWort || istSchweizMobil(n.nr);
    if (mobil && !e.mobil) e.mobil = n.nr;
    else if (!mobil && !e.telefon) e.telefon = n.nr;
  }

  // Name: die erste Zeile, die wie ein Personenname aussieht und nicht
  // der Lieferant ist; Funktion: eine Zeile mit Funktionswort in der Nähe
  const firmaKlein = String(firma || "").toLowerCase().replace(/\s+(ag|gmbh|sa)$/i, "").trim();
  const istFirma = (z) => firmaKlein && firmaKlein.length > 2 && z.toLowerCase().includes(firmaKlein);
  let nameIdx = -1;
  for (let i = 0; i < zeilen.length; i++) {
    let z = zeilen[i].replace(/^(herr|frau|mr\.?|mrs\.?|ms\.?)\s+/i, "");
    // „Hans Muster, Verkaufsberater“
    const teil = z.split(/\s*[,|–-]\s+/);
    if (teil.length > 1 && siehtAusWieName(teil[0])) {
      e.name = grossKlein(teil[0]);
      if (FUNKTION.test(teil.slice(1).join(" "))) e.funktion = teil.slice(1).join(", ");
      nameIdx = i; break;
    }
    // Titel davor: „Dipl. Ing. Hans Muster“
    z = z.replace(/^((dipl\.?|ing\.?|dr\.?|prof\.?)\s*)+/i, "");
    if (!istFirma(z) && siehtAusWieName(z)) { e.name = grossKlein(z); nameIdx = i; break; }
  }
  if (!e.funktion) {
    const kandidaten = zeilen.map((z, i) => ({ z, i }))
      .filter(({ z, i }) => i !== nameIdx && FUNKTION.test(z) && !MAIL.test(z) && !/\d{3}/.test(z) && !istFirma(z) && z.length < 60);
    if (kandidaten.length) {
      kandidaten.sort((a, b) => Math.abs(a.i - nameIdx) - Math.abs(b.i - nameIdx));
      e.funktion = kandidaten[0].z;
    }
  }
  // Ohne erkennbaren Namen: aus der Mailadresse „hans.muster@…“
  if (!e.name && e.email) {
    const vorn = e.email.split("@")[0];
    const t = vorn.split(/[._-]/).filter((x) => x.length > 1 && !/\d/.test(x));
    if (t.length >= 2 && t.length <= 3 && !/^(info|verkauf|sales|office|kontakt|contact|mail|admin|service)$/i.test(t[0]))
      e.name = t.map((x) => x[0].toUpperCase() + x.slice(1).toLowerCase()).join(" ");
  }
  return e;
}
