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
const mitTexterkennung = async (...a) => (await import("./bestellFoto.js")).mitTexterkennung(...a);

// Visitenkarten sind klein und oft glänzend: auf 2000 Pixel bringen,
// grau machen und den Kontrast strecken
async function bildVorbereiten(datei) {
  try {
    const bild = await createImageBitmap(datei);
    const lang = Math.max(bild.width, bild.height);
    const f = Math.min(2.5, 2000 / lang);
    const c = document.createElement("canvas");
    c.width = Math.round(bild.width * f);
    c.height = Math.round(bild.height * f);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bild, 0, 0, c.width, c.height);
    if (bild.close) bild.close();
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const px = d.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) {
      const g = Math.round(px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11);
      px[i] = g; hist[g]++;
    }
    const n = px.length / 4;
    let lo = 0, hi = 255, s = 0;
    while (lo < 255 && (s += hist[lo]) < n * 0.01) lo++;
    s = 0;
    while (hi > 0 && (s += hist[hi]) < n * 0.01) hi--;
    const spanne = Math.max(1, hi - lo);
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / spanne));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  } catch (f) {
    return datei;
  }
}

export async function karteLesen(datei, fortschritt, firma) {
  return mitTexterkennung(fortschritt, async (w) => {
    const bild = await bildVorbereiten(datei);
    const r = await w.recognize(bild);
    const text = (r && r.data && r.data.text) || "";
    return { text, ...karteAuswerten(text, firma) };
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
    || /^[A-ZÄÖÜ][a-zäöü]+-[A-ZÄÖÜ][a-zäöü]+$/.test(w));
}

function grossKlein(z) {
  // „HANS MUSTER“ → „Hans Muster“
  if (z !== z.toUpperCase()) return z;
  return z.toLowerCase().replace(/(^|[\s-])([a-zäöü])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/ (Von|Van|De|Der|Di|Da|Du) /g, (m) => m.toLowerCase());
}

export function karteAuswerten(text, firma) {
  const zeilen = String(text || "").split(/\r?\n/).map((z) => z.replace(/[|_~«»]/g, " ").replace(/\s+/g, " ").trim())
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
