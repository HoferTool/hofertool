// =================================================================
//  MATERIAL-BESTELLUNG AUS DER NOTIZ LESEN
//  In der Notiz eines Auftrags steht oft, wann Material kommt, am
//  besten so:  „Mat BE: Metalix 2025007893 500kg 24.09.26“.
//  Daraus füllt die App „Menge“ und „Liefertermin“ im Auftrag.
//
//  Erkannt wird eine Zeile mit einer Bestellnummer (zehn Ziffern,
//  beginnt mit 20, also Jahr + Nummer). Menge und Termin dürfen in
//  derselben oder der nächsten Zeile stehen, in beliebiger Reihenfolge:
//    Menge:   500kg, 500 kg, 1'300kg, 200 Stk., 10 Stg.
//    Termin:  24.09.26, 24.09.2026, 17.09 oder KW41
//  Stehen mehrere Bestellungen in der Notiz, gilt die mit „Mat BE“,
//  sonst die neueste (höchste Bestellnummer) mit Mengenangabe.
//  FA Nummern stehen nie in Notizen, darum ist die zehnstellige Zahl
//  sicher eine Bestellung. Dasselbe macht sql/notiz-material.sql in
//  der Datenbank (infoBoard-Import); beides bitte gleich halten.
//
//  Was so in Menge und Liefertermin steht, nimmt
//  materialAusNotizEntfernen wieder aus der Notiz, damit nichts doppelt
//  dasteht (Wunsch Patrick 5. Oktober 2026). Gegenstück in der
//  Datenbank: sql/notiz-ohne-doppel.sql.
// =================================================================

// Ohne Rückblick in den Mustern („was steht davor?“): Das iPad an der
// Maschine (Safari 16.1) kennt ihn nicht und startet sonst die ganze App
// nicht. Stattdessen steht das Zeichen davor als eigene Gruppe im Muster.
const BE_NR = /(?:^|\D)(20\d{8})(?!\d)/;
const MENGE = /(^|[^\d.,'])(\d{1,3}(?:'\d{3})+|\d+(?:[.,]\d+)?)\s*(kg|stk|stück|stg|stangen)\b\.?/i;
const DATUM = /(^|[^\d.])(\d{1,2})\.(\d{1,2})\.?(\d{4}|\d{2})?(?![\d.,]|\s*(?:chf|fr|kg|mm))/i;
const KW = /\bKW\s*(\d{1,2})\b/i;
const MAT_BE = /\bmat\.?\s*be\b/i;
// Wörter, die vor dem Lieferanten stehen können, aber keiner sind
const KEIN_LIEFERANT = new Set(["mat", "be", "ab", "aus", "rahmen", "neuem", "neuer", "rohmaterial",
  "material", "ca", "von", "am", "für", "davon", "noch", "bestellt", "bei", "im", "an", "lager",
  "kg", "stk", "stg", "kw", "h", "nr", "restmenge", "ist"]);

const zwei = (n) => String(Number(n)).padStart(2, "0");
const EINHEIT = { kg: "kg", stk: "Stk.", "stück": "Stk.", stg: "Stg.", stangen: "Stg." };

function mengeIn(zeile) {
  const m = zeile.match(MENGE);
  if (!m) return "";
  return m[2].replace(",", ".") + " " + EINHEIT[m[3].toLowerCase()];
}

// Gibt { text, roh } zurück: „24.09.26“ und genau so, wie es dastand
function terminFinden(zeile, jahrDerBestellung) {
  // Datumsteile ohne die Bestellnummer suchen, damit nichts daraus
  // als Tag gelesen wird
  const ohne = zeile.replace(new RegExp(BE_NR.source, "g"), (t, nr) => t.slice(0, t.length - nr.length) + " ");
  // Alle Treffer prüfen: „1.4301“ ist ein Werkstoff, kein Datum
  for (const d of ohne.matchAll(new RegExp(DATUM.source, "gi"))) {
    const tag = Number(d[2]), monat = Number(d[3]);
    if (tag < 1 || tag > 31 || monat < 1 || monat > 12) continue;
    let jahr = d[4] || "";
    if (jahr.length === 4) jahr = jahr.slice(2);
    // Ohne Jahr („17.09“) gilt das Jahr der Bestellung
    if (!jahr && jahrDerBestellung) jahr = jahrDerBestellung.slice(2);
    return { text: zwei(tag) + "." + zwei(monat) + (jahr ? "." + jahr : ""), roh: d[0].slice(d[1].length) };
  }
  const k = ohne.match(KW);
  if (k && Number(k[1]) >= 1 && Number(k[1]) <= 53) return { text: "KW" + zwei(k[1]), roh: k[0] };
  return null;
}

function terminIn(zeile, jahrDerBestellung) {
  const t = terminFinden(zeile, jahrDerBestellung);
  return t ? t.text : "";
}

function lieferantIn(zeile) {
  const vor = zeile.replace(MAT_BE, " ").replace(/[:+()|,]/g, " ");
  const woerter = vor.split(/\s+/).filter(Boolean);
  for (const w of woerter) {
    const rein = w.replace(/\.$/, "");
    if (!/^[A-Za-zÄÖÜäöüé][A-Za-zÄÖÜäöüé\-]+$/.test(rein)) continue;
    if (KEIN_LIEFERANT.has(rein.toLowerCase())) continue;
    return rein;
  }
  return "";
}

// Gibt { nr, lieferant, menge, termin, mengeText } zurück oder null
export function materialBestellungLesen(notiz) {
  const zeilen = String(notiz || "").split(/\r?\n/);
  const kandidaten = [];
  zeilen.forEach((zeile, i) => {
    const nr = zeile.match(BE_NR);
    if (!nr) return;
    const jahr = nr[1].slice(0, 4);
    // Die nächste Zeile gehört dazu, wenn sie keine eigene Bestellung hat
    const naechste = zeilen[i + 1] && !BE_NR.test(zeilen[i + 1]) ? zeilen[i + 1] : "";
    const menge = mengeIn(zeile) || mengeIn(naechste);
    const termin = terminIn(zeile, jahr) || terminIn(naechste, jahr);
    if (!menge && !termin) return;
    kandidaten.push({ nr: nr[1], lieferant: lieferantIn(zeile), menge, termin,
      matBe: MAT_BE.test(zeile), zeile: i, jahr });
  });
  if (!kandidaten.length) return null;
  kandidaten.sort((a, b) => (b.matBe - a.matBe) || (!!b.menge - !!a.menge) || b.nr.localeCompare(a.nr));
  const k = kandidaten[0];
  // Ins Mengenfeld kommt auch, woher und mit welcher Bestellung
  const woher = [k.lieferant, k.nr].filter(Boolean).join(" ");
  k.mengeText = k.menge ? k.menge + " · " + woher : "";
  return k;
}


// Wörter, die allein keine Information sind: bleibt nach dem Herausnehmen
// nur so etwas übrig, fällt die ganze Zeile weg
const FUELLWORT = new Set(["mat", "be", "te", "ca", "ab", "am", "von", "bis", "für", "nr",
  "bestellt", "liefertermin", "termin", "menge", "kw"]);

function zeileAufraeumen(zeile) {
  const rest = zeile.replace(/\s+/g, " ").replace(/^[\s|:,;\-]+|[\s|:,;\-]+$/g, "");
  const woerter = rest.toLowerCase().split(/[^a-zäöüé0-9']+/).filter(Boolean);
  return woerter.every((w) => FUELLWORT.has(w)) ? null : rest;
}

// Nimmt aus der Notiz, was schon in Menge (menge) und Liefertermin
// (termin) des Auftrags steht: Menge, Bestellnummer und Lieferant nur,
// wenn das Mengenfeld diese Bestellung zeigt, das Datum nur, wenn es im
// Liefertermin steht. Was sonst in der Zeile steht (Werkstoff,
// „davon 1200kg“ …), bleibt. Gibt die Notiz unverändert zurück, wenn
// nichts doppelt ist.
export function materialAusNotizEntfernen(notiz, menge, termin) {
  const text = String(notiz || "");
  const k = materialBestellungLesen(text);
  if (!k) return text;
  const mengeFeld = String(menge || "").trim();
  const mengeDa = !!k.mengeText && (mengeFeld === k.mengeText || mengeFeld.includes(k.nr));
  const terminDa = !!k.termin && String(termin || "").trim() === k.termin;
  if (!mengeDa && !terminDa) return text;

  const zeilen = text.split(/\r?\n/);
  const i = k.zeile;
  const n = zeilen[i + 1] !== undefined && !BE_NR.test(zeilen[i + 1]) ? i + 1 : -1;
  const neu = { [i]: zeilen[i] };
  if (n >= 0) neu[n] = zeilen[n];
  if (mengeDa) {
    const z = mengeIn(neu[i]) ? i : n;
    neu[z] = neu[z].replace(MENGE, "$1 ");
    neu[i] = neu[i].replace(k.nr, " ").replace(MAT_BE, " ");
    if (k.lieferant) neu[i] = neu[i].replace(k.lieferant, " ");
  }
  if (terminDa) {
    const z = terminFinden(zeilen[i], k.jahr) ? i : n;
    const t = terminFinden(neu[z], k.jahr);
    if (t) neu[z] = neu[z].replace(t.roh, " ");
  }
  const raus = [];
  zeilen.forEach((zeile, j) => {
    if (!(j in neu)) { raus.push(zeile); return; }
    if (neu[j] === zeile) { raus.push(zeile); return; }
    const rest = zeileAufraeumen(neu[j]);
    if (rest !== null) raus.push(rest);
  });
  return raus.join("\n").replace(/\s+$/, "");
}
