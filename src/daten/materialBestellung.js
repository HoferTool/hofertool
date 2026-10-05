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
// =================================================================

const BE_NR = /(?<!\d)(20\d{8})(?!\d)/;
const MENGE = /(?<![\d.,'])(\d{1,3}(?:'\d{3})+|\d+(?:[.,]\d+)?)\s*(kg|stk|stück|stg|stangen)\b\.?/i;
const DATUM = /(?<![\d.])(\d{1,2})\.(\d{1,2})\.?(\d{4}|\d{2})?(?![\d.,]|\s*(?:chf|fr|kg|mm))/i;
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
  return m[1].replace(",", ".") + " " + EINHEIT[m[2].toLowerCase()];
}

function terminIn(zeile, jahrDerBestellung) {
  // Datumsteile ohne die Bestellnummer suchen, damit nichts daraus
  // als Tag gelesen wird
  const ohne = zeile.replace(new RegExp(BE_NR.source, "g"), " ");
  // Alle Treffer prüfen: „1.4301“ ist ein Werkstoff, kein Datum
  for (const d of ohne.matchAll(new RegExp(DATUM.source, "gi"))) {
    const tag = Number(d[1]), monat = Number(d[2]);
    if (tag < 1 || tag > 31 || monat < 1 || monat > 12) continue;
    let jahr = d[3] || "";
    if (jahr.length === 4) jahr = jahr.slice(2);
    // Ohne Jahr („17.09“) gilt das Jahr der Bestellung
    if (!jahr && jahrDerBestellung) jahr = jahrDerBestellung.slice(2);
    return zwei(tag) + "." + zwei(monat) + (jahr ? "." + jahr : "");
  }
  const k = ohne.match(KW);
  if (k && Number(k[1]) >= 1 && Number(k[1]) <= 53) return "KW" + zwei(k[1]);
  return "";
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
      matBe: MAT_BE.test(zeile) });
  });
  if (!kandidaten.length) return null;
  kandidaten.sort((a, b) => (b.matBe - a.matBe) || (!!b.menge - !!a.menge) || b.nr.localeCompare(a.nr));
  const k = kandidaten[0];
  // Ins Mengenfeld kommt auch, woher und mit welcher Bestellung
  const woher = [k.lieferant, k.nr].filter(Boolean).join(" ");
  k.mengeText = k.menge ? k.menge + " · " + woher : "";
  return k;
}
