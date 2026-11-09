// =================================================================
//  KREDITORENRECHNUNGEN ERKENNEN UND TRENNEN
//
//  Wunsch Patrick, 29. Oktober 2026: „ich möchte meine Kreditoren-
//  rechnungen digitalisieren und nach Lieferant in einem Ordner ablegen“.
//  Der Scanner legt einen ganzen Stapel in eine PDF (mit Text, OCR).
//  Hier steht nur das Lesen: aus dem Text jeder Seite den Lieferanten,
//  die Rechnungsnummer, das Datum und „Seite x von y“ holen, und daraus
//  den Stapel in einzelne Rechnungen teilen. Das Ablegen im Ordner macht
//  src/teile/kreditorenAblage.js.
//
//  Der Lieferant kommt, in dieser Reihenfolge, aus
//    1. gelernten Merkmalen (_Lieferanten.json im Ordner): UID-Nummer,
//       IBAN oder Name, wie sie auf seinen Rechnungen stehen,
//    2. dem Zahlteil der QR-Rechnung („Konto / Zahlbar an“, darunter
//       IBAN und Name), dort steht er immer gleich und sauber,
//    3. sonst gar nicht: die Rechnung kommt nach „_Zuordnen“, und der
//       Name, den man dort einmal eingibt, wird gelernt.
//  OCR verliest Buchstaben („Hafer“, „uTiis“), darum zählen UID und
//  IBAN vor dem Namen.
// =================================================================

// Die eigene UID und Namen, die auf jeder Rechnung als Empfänger stehen
const EIGENE_UID = ["313094963"];
const EIGENE = /hofer|hafer|präzisionsdrehteile|prazisionsdrehteile|lohn-ammannsegg|zurbrügg|zurbrugg/i;

// Klein, ohne Akzente und Satzzeichen, für Vergleiche trotz OCR
export function einfach(t) {
  return String(t || "").toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/[éèê]/g, "e").replace(/[àâ]/g, "a")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// Rechtsform und Füllwörter zählen beim Namen nicht
const RECHTSFORM = /\b(ag|gmbh|sa|sarl|s a r l|kg|ltd|inc|co|und|and|schweiz|suisse|switzerland)\b/g;
export function nameKern(name) {
  return einfach(name).replace(RECHTSFORM, " ").replace(/\s+/g, " ").trim();
}

// Zeichen, die Windows im Ordner- oder Dateinamen nicht mag
export function sauber(t) {
  return String(t || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
}

// UID-Nummern (CHE-123.456.789) als neun Ziffern, ohne die eigene
export function uidsIn(text) {
  const aus = new Set();
  const re = /CHE[\s\-–.·]*(\d{3})[\s.,·]*(\d{3})[\s.,·]*(\d{3})/gi;
  let m;
  while ((m = re.exec(text))) {
    const n = m[1] + m[2] + m[3];
    if (!EIGENE_UID.includes(n)) aus.add(n);
  }
  return [...aus];
}

// IBAN aus der Schweiz und Liechtenstein (CH/LI + 19 Zeichen), ohne Leerzeichen
export function ibansIn(text) {
  const aus = new Set();
  const re = /\b(CH|LI)\s?(\d{2})((?:\s?[0-9A-Z]){17})\b/g;
  let m;
  while ((m = re.exec(text))) aus.add((m[1] + m[2] + m[3]).replace(/\s/g, ""));
  return [...aus];
}

// Name im Zahlteil der QR-Rechnung: nach „Konto / Zahlbar an“ die
// erste Zeile nach der IBAN. Im Empfangsschein und im Zahlteil steht
// derselbe Name; der kürzere ohne angehängte Spalte gewinnt.
export function qrName(zeilen) {
  const namen = [];
  for (let i = 0; i < zeilen.length; i++) {
    if (!/konto\s*-?\s*\/?\s*zahlbar\s*an/i.test(zeilen[i])) continue;
    for (let j = i; j < Math.min(zeilen.length, i + 6); j++) {
      // In derselben Zeile können zwei Spalten stehen; nur was nach der IBAN kommt
      const rest = j === i ? zeilen[j].replace(/.*zahlbar\s*an/i, "") : zeilen[j];
      if (!ibansIn(rest.toUpperCase()).length) continue;
      for (let k = j + 1; k < Math.min(zeilen.length, j + 4); k++) {
        let z = zeilen[k].replace(/\s{2,}.*$/, "").trim();
        if (!z || ibansIn(z).length || /^\d|referenz|zahlbar|konto/i.test(z) || EIGENE.test(z)) continue;
        if (/[a-zäöü]{2}/i.test(z)) { namen.push(z); break; }
      }
      break;
    }
  }
  if (!namen.length) return null;
  return namen.sort((a, b) => a.length - b.length)[0].replace(/^(\S+?)(AG|GmbH)$/, "$1 $2");
}

// Ein Vorschlag, wenn nichts sicher ist: die erste Firma (… AG, GmbH)
// auf der Seite, die nicht wir selbst sind
export function firmaVorschlag(zeilen) {
  for (const z of zeilen) {
    const f = firmaInZeile(z);
    if (f) return f;
  }
  return null;
}

// Banken, Post und Zahlungsdienste stehen auf vielen Rechnungen, sind
// aber nie der Lieferant
const NIE_LIEFERANT = /\b(\w*bank|ubs|credit suisse|postfinance|post ch|die post|swiss post|raiffeisen|kantonalbank|valiant|migros bank|bank cler|zkb|bkb|bcv|twint|mastercard|visa)\b/i;
const FORM = "(?:AG|GmbH(?:\\s*&\\s*Co\\.?\\s*KG)?|SA|S\\.A\\.|Sàrl|S[àa]rl|Sagl|SAGL|KG|Ltd\\.?|Inc\\.?|e\\.K\\.|GmbH\\.)";
const FIRMA_RE = new RegExp("([A-ZÄÖÜ0-9][\\wÄÖÜäöüéèà&+.,\\-/'() ]{1,45}?\\s" + FORM + ")(?![\\wäöü])");

// Eine Firma mit Rechtsform in einer Zeile, nicht wir selbst und keine Bank
export function firmaInZeile(z) {
  // Jede Spalte für sich (zwei Leerzeichen = Lücke zwischen Spalten),
  // sonst wird aus der Fusszeile „Gühring (Schweiz) AG  Tel. …  Commerzbank
  // AG“ eine Firma „AG Tel. … Commerzbank AG“ (Patrick 9. November 2026)
  const teile = String(z || "").split(/\s{2,}/);
  if (teile.length > 1) {
    for (const t of teile) { const f = firmaInZeile(t); if (f) return f; }
    return null;
  }
  const m = FIRMA_RE.exec(String(z || ""));
  if (!m) return null;
  let f = m[1].replace(/^.*:\s*/, "").replace(/^(von|an|bei|durch|firma)\s+/i, "").replace(/[,.]+$/, "").trim();
  // Vorne angeklebte Zeilenreste („Rechnung Muster AG“) weg
  f = f.replace(/^.*\b(?:inhaber|holder)\s*/i, "");
  f = f.replace(/^(rechnung|faktura|lieferschein|gutschrift|offerte|auftragsbest[aä]tigung)\s+/i, "");
  if (EIGENE.test(f) || NIE_LIEFERANT.test(f) || nameKern(f).length < 3) return null;
  return f;
}

// Seit 1.346.0 (Patrick 2. November 2026: „das muss auf Anhieb besser
// funktionieren, alle sind OCR eingescannt“): ohne gelernte Liste und
// ohne QR-Zahlteil steht der Lieferant fast immer im Briefkopf oben
// und in der Fusszeile unten, meist mit Rechtsform, dazu seine Website
// oder Mailadresse. Die Firma, die dort am häufigsten vorkommt (oder zur
// Website passt), ist er. Nur eine Vermutung: sie trennt keinen Stapel,
// gilt aber für die Rechnung, wenn sonst nichts da ist, und danach
// lernt die App UID und IBAN dazu.
export function domainsIn(text) {
  const aus = [];
  const re = /(?:www\.|@)([a-z0-9][a-z0-9\-]{1,40})\.(?:ch|com|de|li|at|net|eu|fr|it|swiss)\b/gi;
  let m;
  while ((m = re.exec(text))) {
    const d = m[1].toLowerCase();
    if (!/hofer|hoferco|gmail|bluewin|gmx|hotmail|outlook|yahoo|sunrise|swisscom|postfinance|ubs|raiffeisen|admin|estv/.test(d) && !aus.includes(d)) aus.push(d);
  }
  return aus;
}

export function kopfFirma(zeilen) {
  const n = zeilen.length;
  if (!n) return null;
  const rand = (i) => i < 10 || i >= n - 10;
  const kandidaten = new Map();
  zeilen.forEach((z, i) => {
    // Unsere Adresse und Lieferadressen zählen nicht
    if (EIGENE.test(z) || /liefer(adresse|ung an)|rechnungsadresse|empf[aä]nger/i.test(z)) return;
    const f = firmaInZeile(z);
    if (!f) return;
    const k = nameKern(f);
    const alt = kandidaten.get(k) || { name: f, zahl: 0, erste: i };
    // Ränder (Briefkopf, Fusszeile) zählen doppelt
    alt.zahl += rand(i) ? 2 : 1;
    if (f.length < alt.name.length) alt.name = f;
    kandidaten.set(k, alt);
  });
  const domains = domainsIn(zeilen.join(" "));
  const zurDomain = (k) => domains.some((d) => k.replace(/\s/g, "").includes(d.replace(/-/g, "")) || d.replace(/-/g, "").includes(k.split(" ")[0]));
  const liste = [...kandidaten.entries()].map(([k, v]) => ({ ...v, wert: v.zahl + (zurDomain(k) ? 3 : 0) - v.erste / 100 }));
  if (liste.length) return liste.sort((a, b) => b.wert - a.wert)[0].name;
  // Ohne Rechtsform: der Name aus der Website („www.utilis.ch“ → „Utilis“)
  if (domains.length) return domains[0].split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return null;
}

// Zwei Rechnungsnummern sind verschieden, nicht nur anders gelesen: mehr
// als ein Zeichen anders (OCR verliest höchstens eines oder setzt ein
// Leerzeichen)
export function nummerAnders(a, b) {
  const x = einfach(a).replace(/\s/g, ""), y = einfach(b).replace(/\s/g, "");
  if (!x || !y || x === y || x.includes(y) || y.includes(x)) return false;
  if (Math.abs(x.length - y.length) > 1) return true;
  let vor = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const jetzt = [i];
    for (let j = 1; j <= y.length; j++) jetzt[j] = Math.min(vor[j] + 1, jetzt[j - 1] + 1, vor[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    vor = jetzt;
  }
  return vor[y.length] > 1;
}

// Gleicher Lieferant trotz OCR-Fehler und Schreibweise: „Muster Werkzeug AG“
// = „Muster Werkzeug“ = „Muster Werkzeuq AG“
export function gleicherName(a, b) {
  const x = nameKern(a).replace(/\s/g, ""), y = nameKern(b).replace(/\s/g, "");
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) < 5) return false;
  const grenze = Math.max(x.length, y.length) >= 10 ? 2 : 1;
  if (Math.abs(x.length - y.length) > grenze) return false;
  let vor = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const jetzt = [i];
    for (let j = 1; j <= y.length; j++) {
      jetzt[j] = Math.min(vor[j] + 1, jetzt[j - 1] + 1, vor[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    vor = jetzt;
  }
  return vor[y.length] <= grenze;
}

// Steht eine Firma in derselben Zeile wie ihre UID-Nummer (Fusszeile
// „Steeltec AG / … / UID-Nr. CHE-105.900.006“), ist sie es sicher
export function uidFirma(zeilen) {
  for (let i = 0; i < zeilen.length; i++) {
    if (!uidsIn(zeilen[i]).length || EIGENE.test(zeilen[i])) continue;
    // Zuerst dieselbe Zeile, dann die zwei darüber und darunter
    for (const j of [i, i - 1, i + 1, i - 2, i + 2]) {
      const z = zeilen[j];
      if (!z || EIGENE.test(z)) continue;
      const f = firmaInZeile(z);
      if (f) return f;
    }
  }
  return null;
}

// Ohne QR-Zahlteil: der Name direkt über der IBAN bei „Bankverbindung“
// („Bankverbindung: / Basel que si / IBAN CH61 …“). Bankname und Ort
// (UBS, Kantonalbank, „8098 Zürich“) zählen nicht.
export function bankName(zeilen) {
  for (let i = 0; i < zeilen.length; i++) {
    // Nur als Beschriftung, nicht mitten in einem Satz („Bitte beachten Sie,
    // dass sich unsere Bankverbindung geändert hat“ gab bei Gühring den
    // Lieferanten „Grundstrasse 11“, Patrick 9. November 2026)
    if (!/bankverbindung|kontoinhaber|zugunsten|zahlbar an/i.test(zeilen[i]) || zeilen[i].trim().split(/\s+/).length > 6) continue;
    for (let j = i + 1; j < Math.min(zeilen.length, i + 5); j++) {
      if (!ibansIn(zeilen[j].toUpperCase()).length) continue;
      const z = (zeilen[j - 1] || "").replace(/\s{2,}.*$/, "").trim();
      if (j - 1 > i && z && /[a-zäöü]{3}/i.test(z) && !/^\d|bank|ubs|credit|raiffeisen|postfinance|iban|konto|swift|bic/i.test(z)
        && !EIGENE.test(z) && !/(strasse|str\.|weg|gasse|platz|allee)\s*\d/i.test(z)) return z;
      break;
    }
  }
  return null;
}

// „Seite 2 von 3“, „Seite 2/2“, „Seite: 1“, „Seite 2 / 3“
export function seiteIn(text) {
  // (?!\d): „Seite“ als Spaltenkopf vor „400067086 …“ ist nicht Seite 40
  const m = /seite\s*:?\s*(\d{1,2})(?!\d)(?:\s*(?:von|\/|of)\s*(\d{1,2})(?!\d))?/i.exec(text);
  if (!m) return null;
  const n = +m[1], von = m[2] ? +m[2] : null;
  if (!n || (von && n > von)) return null;
  return { n, von };
}

// Ohne das Wort „Seite“: eine Zeile, auf der nur „1/3“ steht (Fusszeile
// bei Notz Metall, Patrick 29. Oktober 2026: „du hast daraus sieben gemacht“)
// Der Scanner liest dabei oft Striche als „1“ dazu („Seite 1“ im Kopf,
// eine Zeile „1  1“ dazwischen): darum bis drei Zeilen darunter suchen und
// diese Angabe vor „Seite 1“ im Fliesstext nehmen.
export function seiteKopf(zeilen) {
  for (let i = 0; i + 1 < zeilen.length; i++) {
    if (!/\bseite(?:\s+\S{1,2})?\s*$/i.test(zeilen[i])) continue;
    for (let j = i + 1; j <= i + 3 && j < zeilen.length; j++) {
      const m = /(?:^|\s)(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(zeilen[j]);
      if (m && +m[1] >= 1 && +m[1] <= +m[2] && +m[2] <= 20) return { n: +m[1], von: +m[2] };
    }
  }
  return null;
}

export function seiteZeile(zeilen) {
  // „Seite“ als letzte Spalte im Kopf, „1 / 3“ am Ende der Zeile darunter
  // (Gühring, Patrick 9. November 2026: „nur 7 Rechnungen, viele zusammengelegt“)
  const k = seiteKopf(zeilen);
  if (k) return k;
  for (const z of zeilen) {
    const m = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(z);
    if (m && +m[1] >= 1 && +m[1] <= +m[2] && +m[2] <= 20) return { n: +m[1], von: +m[2] };
  }
  return null;
}

// Rechnungsnummer
// Nummern, die keine Rechnungsnummer sind: Debitoren-, Kunden-Nr. (Patrick
// 6. November 2026: „bei Metalix die Debitoren-Nr. und nicht die
// Rechnungsnummer erfasst“). Steht eine davon dort, wo sonst die
// Rechnungsnummer gefunden würde, sucht die App weiter.
const FREMD_RE = /\b(?:debitor(?:en)?|kunden?|kd)\s*-?\s*(?:nr|nummer|no)?\.?\s*:?\s*([A-Z0-9][A-Z0-9\-/.]*\d)/gi;
const nrNorm = (x) => String(x || "").replace(/[\s.\-/]/g, "").toUpperCase();

// Kopfzeile einer Tabelle („Ihre USt-IdNr.  Debitorennr.  Belegdatum
// Rechnungsnr.“) mit den Werten in der Zeile darunter, Spalten durch
// grosse Lücken getrennt (zeilenAusStuecken setzt dort zwei Leerzeichen).
// Leere Felder fehlen in der Wertezeile, meist vorne (Ihre USt-IdNr.),
// darum von rechts zuordnen. Gibt Rechnungsnummer und fremde Nummern.
function nummerAusTabelle(zeilen) {
  const aus = { nr: null, fremd: [] };
  for (let i = 0; i + 1 < zeilen.length; i++) {
    const kopf = zeilen[i].trim().split(/\s{2,}/);
    const istRe = (k) => /^(rechnung|faktur|invoice|beleg)\w*\s*-?\s*(nr|nummer|no)\b/i.test(k);
    const istFremd = (k) => /^(debitor|deb\.|kunde|kd)/i.test(k);
    // Kopf mit nur einfachen Leerzeichen zwischen den Spalten (Gühring:
    // „Belegnummer Datum zahlbar bis  Seite“ über „400067086 01.04.2026 …“):
    // steht die Rechnungsnummer vorne, gilt der erste Wert darunter
    // (Patrick 9. November 2026).
    // Der Scanner setzt Striche als „1“ davor oder schiebt eine Zeile „1  1“
    // dazwischen: darum bis drei Zeilen darunter, die ersten zwei Werte,
    // mindestens fünf Ziffern, kein Datum
    if (!aus.nr && istRe(zeilen[i].trim())) {
      for (let j = i + 1; j <= i + 3 && j < zeilen.length && !aus.nr; j++) {
        const w = zeilen[j].trim().split(/\s+/).slice(0, 2)
          .find((x) => /\d{5}/.test(x.replace(/\D/g, "")) && /^[A-Z0-9][A-Z0-9\-/.]*$/i.test(x) && !/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(x));
        if (w) aus.nr = w.replace(/[.\-/]+$/, "");
      }
    }
    if (/\d/.test(zeilen[i])) continue;
    if (kopf.length < 2) continue;
    if (!kopf.some((k) => istRe(k) || istFremd(k))) continue;
    const werte = zeilen[i + 1].replace(/(\d)\s+([.,/])/g, "$1$2").replace(/([.,/])\s+(\d)/g, "$1$2")
      .trim().split(/\s{2,}/);
    if (!werte.length || werte.length > kopf.length) continue;
    const vers = kopf.length - werte.length;
    kopf.forEach((k, j) => {
      const w = werte[j - vers];
      if (!w || !/\d/.test(w) || !/^[A-Z0-9][A-Z0-9\-/.]*$/i.test(w)) return;
      if (istFremd(k)) aus.fremd.push(w);
      else if (istRe(k) && !aus.nr) aus.nr = w.replace(/[.\-/]+$/, "");
    });
  }
  return aus;
}

export function nummerIn(text, zeilen) {
  const fremd = new Set([...String(text).matchAll(FREMD_RE)].map((m) => nrNorm(m[1])));
  if (zeilen) {
    const t = nummerAusTabelle(zeilen);
    t.fremd.forEach((x) => fremd.add(nrNorm(x)));
    if (t.nr && !fremd.has(nrNorm(t.nr))) return t.nr;
  }
  const muster = [
    /rechnungs?\s*-?\s*(?:nr|nummer|no)\.?\s*:?\s*([A-Z0-9][A-Z0-9\-/.]*\d[A-Z0-9\-/]*)/gi,
    /rechnung\s*:?\s*(?:RG\s+)?([A-Z]{0,4}-?\d[A-Z0-9\-/]*\d)\b/gi,
    // Andere Wörter für die Rechnungsnummer (Faktura, Beleg, Invoice …)
    /(?:faktur(?:a|en)?|beleg|invoice|dokument)\s*-?\s*(?:nr|nummer|no)\.?\s*:?\s*([A-Z0-9][A-Z0-9\-/.]*\d[A-Z0-9\-/]*)/gi,
  ];
  for (const re of muster) {
    for (const m of String(text).matchAll(re)) {
      const n = m[1].replace(/[.\-/]+$/, "");
      if (!fremd.has(nrNorm(n))) return n;
    }
  }
  return null;
}

// Rechnungsdatum als JJJJ-MM-TT: zuerst ein Datum bei „Rechnung“ oder
// „Datum“, nicht Bestell-, Liefer- oder Verfalldatum. Nimmt alle üblichen
// Schreibweisen, nicht nur 28.10.2026 (Patrick 2. November 2026: „warum
// Brack immer ohne Datum? dort ist eindeutig ein Datum“): 28.10.26,
// 28/10/2026, 2026-10-28, 28. Oktober 2026, 28. Okt. 2026, Oct 28, 2026,
// und was OCR daraus macht (Leerzeichen, Komma statt Punkt, O statt 0).
const MONATE = [
  ["jan"], ["feb"], ["mär", "mar", "maer", "mrz"], ["apr"], ["mai", "may"], ["jun"],
  ["jul"], ["aug"], ["sep"], ["okt", "oct"], ["nov"], ["dez", "dec"],
];
const MONAT_RE = "(jan|feb|m(?:ä|ae|a)r|mrz|apr|mai|may|jun|jul|aug|sep|okt|oct|nov|dez|dec)[a-zäöü]*\\.?";
function monatNr(w) {
  w = w.toLowerCase();
  const i = MONATE.findIndex((l) => l.some((k) => w.startsWith(k)));
  return i < 0 ? 0 : i + 1;
}
function isoAus(j, mo, t) {
  j = +j; mo = +mo; t = +t;
  if (j < 100) j += 2000;
  if (j < 2000 || j > 2099 || mo < 1 || mo > 12 || t < 1 || t > 31) return null;
  return j + "-" + String(mo).padStart(2, "0") + "-" + String(t).padStart(2, "0");
}
// Alle Daten einer Zeile, in der Reihenfolge, in der sie dort stehen.
// kurz = auch zweistellige Jahre (nur bei „Datum“ oder „Rechnung“, sonst
// wären Werkstoffnummern oder Masse schnell ein Datum)
export function datenInZeile(zeile, kurz) {
  // Ohne Rückblick im Suchmuster (Safari 16 am iPad): davor steht dafür
  // eine Gruppe „Anfang oder kein Zahlzeichen“
  const z = String(zeile).replace(/(\d)[oO](?=\d|\b)/g, "$10").replace(/(\d)[oO](?=\d|\b)/g, "$10")
    .replace(/(\b\d{1,2})\s*([.,/])\s*(?=\d)/g, "$1$2");
  const aus = [];
  const dazu = (pos, d) => { if (d) aus.push({ pos, d }); };
  let m;
  const zahl = /(^|[^\d.,/\-])(\d{1,2})[.,/\-](\d{1,2})[.,/\-](20\d{2}|\d{2})(?![\d.,/\-]?\d)/g;
  while ((m = zahl.exec(z))) if (m[4].length === 4 || kurz) dazu(m.index, isoAus(m[4], m[3], m[2]));
  const leer = /(^|[^\d.,])(\d{1,2})\.?\s(\d{1,2})\.?\s(20\d{2})(?!\d)/g;
  while ((m = leer.exec(z))) dazu(m.index, isoAus(m[4], m[3], m[2]));
  const iso = /(^|\D)(20\d{2})[\-/.](\d{1,2})[\-/.](\d{1,2})(?!\d)/g;
  while ((m = iso.exec(z))) dazu(m.index, isoAus(m[2], m[3], m[4]));
  const wort = new RegExp("(^|\\D)(\\d{1,2})\\.?\\s*" + MONAT_RE + "\\s*(20\\d{2})(?!\\d)", "gi");
  while ((m = wort.exec(z))) dazu(m.index, isoAus(m[4], monatNr(m[3]), m[2]));
  const engl = new RegExp("\\b" + MONAT_RE + "\\s*(\\d{1,2}),?\\s*(20\\d{2})(?!\\d)", "gi");
  while ((m = engl.exec(z))) dazu(m.index, isoAus(m[3], monatNr(m[1]), m[2]));
  return aus.sort((x, y) => x.pos - y.pos).map((x) => x.d);
}

export function datumIn(zeilen) {
  const nicht = /bestell|liefer|verfall|auftrag|f[äa]llig|zahlbar bis|letzte|geburt|valuta/i;
  const marke = (z) => /rechnung|datum|date|\bden\b|\bvom\b|\bper\b/i.test(z);
  // Steht das Datum unter der Beschriftung (Spalte „Rechnungsdatum“, Wert
  // in der Zeile darunter), gehört die nächste Zeile dazu
  const stufen = [
    (z, i) => /rechnung/i.test(z) && !nicht.test(z) ? [z, (/datum|date/i.test(z) ? zeilen[i + 1] : "") || ""] : null,
    (z, i) => marke(z) && !nicht.test(z) ? [z, (/datum|date/i.test(z) ? zeilen[i + 1] : "") || ""] : null,
    (z) => !nicht.test(z) ? [z] : null,
    (z) => [z],
    (z) => [z],
  ];
  for (let s = 0; s < stufen.length; s++) {
    for (let i = 0; i < zeilen.length; i++) {
      const teile = stufen[s](zeilen[i], i);
      if (!teile) continue;
      for (const t of teile) {
        const d = datenInZeile(t, s < 2 || s === 4)[0];
        if (d) return d;
      }
    }
  }
  return null;
}

// Welcher gelernte Lieferant passt zur Seite? Zuerst UID, dann IBAN,
// dann der Name (als ganze Wörter, damit „Ades“ nicht in „Kades“ passt)
export function lieferantSuchen(text, liste) {
  const uids = uidsIn(text), ibans = ibansIn(text.toUpperCase());
  const einf = " " + einfach(text) + " ";
  for (const l of liste) if ((l.uid || []).some((u) => uids.includes(u))) return l;
  for (const l of liste) if ((l.iban || []).some((i) => ibans.includes(i))) return l;
  let best = null, laenge = 0;
  for (const l of liste) {
    // Ein Ordner mit unserem eigenen Namen passt auf jede Rechnung
    if (EIGENE.test(l.name)) continue;
    for (const w of [l.name, ...(l.text || [])]) {
      const k = nameKern(w);
      if (k.length < 4) continue;
      if (einf.includes(" " + k + " ") && k.length > laenge) { best = l; laenge = k.length; }
    }
  }
  return best;
}

// Ein bekannter Lieferant mit (fast) gleichem Namen, sonst der Name selbst
export function bekannterName(name, liste) {
  if (!name) return name;
  const l = liste.find((x) => einfach(x.name) === einfach(name)) || liste.find((x) => gleicherName(x.name, name));
  return l ? l.name : name;
}

// Merkmale einer Seite. zeilen = Textzeilen der Seite von oben nach unten
export function seiteLesen(zeilen, liste) {
  const text = zeilen.join("\n");
  const flach = zeilen.join(" ");
  const l = lieferantSuchen(text, liste);
  return {
    zeilen,
    lieferant: l ? l.name : null,
    qr: qrName(zeilen) || uidFirma(zeilen) || bankName(zeilen),
    vermutung: kopfFirma(zeilen),
    seite: seiteKopf(zeilen) || seiteIn(flach) || seiteZeile(zeilen),
    nummer: nummerIn(flach, zeilen),
    datum: datumIn(zeilen),
    uids: uidsIn(text),
    ibans: ibansIn(text.toUpperCase()),
    leer: einfach(text).length < 15,
    zahlteil: /zahlteil|empfangsschein/i.test(text),
    // Unsere Adresse steht im Adressfeld der ersten Seite einer Rechnung
    anUns: zeilen.some((z) => EIGENE.test(z)),
  };
}

// Liest alle Seiten eines Stapels. Namen aus dem QR-Zahlteil gelten
// schon im selben Stapel als gelernt, damit auch die Seiten davor
// (mit Logo oder UID) dem Lieferanten zugeordnet werden.
export function stapelLesen(seitenZeilen, liste) {
  let seiten = seitenZeilen.map((z) => seiteLesen(z, liste));
  const dazu = [];
  seiten.forEach((s) => {
    if (s.qr) s.qr = bekannterName(s.qr, liste.concat(dazu));
    if (s.lieferant || !s.qr || dazu.some((x) => gleicherName(x.name, s.qr))) return;
    dazu.push({ name: s.qr, uid: s.uids, iban: s.ibans, text: [], neu: true });
  });
  if (dazu.length) {
    const ganz = liste.concat(dazu);
    seiten = seitenZeilen.map((z) => seiteLesen(z, ganz));
    seiten.forEach((s) => { if (s.qr) s.qr = bekannterName(s.qr, ganz); });
  }
  seiten.forEach((s) => { if (s.vermutung) s.vermutung = bekannterName(s.vermutung, liste); });
  return seiten;
}

// Teilt einen Stapel in Rechnungen. Eine neue beginnt bei „Seite 1“,
// bei einem anderen Lieferanten, bei einer anderen Rechnungsnummer
// desselben Lieferanten, oder nach einer vollständigen Rechnung („2 von 2“),
// wenn die Seite nicht erkennbar zum selben Lieferanten gehört.
// Seiten ohne Text bleiben bei der Rechnung davor.
export function stapelTeilen(seiten) {
  const docs = [];
  let akt = null;
  const vorne = [];
  seiten.forEach((s, i) => {
    // Seiten ohne Text (leere Rückseiten beim beidseitigen Scannen, oder ein
    // Bild ohne OCR) trennen nicht, sonst zerfällt jede Rechnung in
    // Einzelseiten (Patrick 29. Oktober 2026). Sie bleiben bei der Rechnung
    // davor, damit nichts verloren geht.
    // Ganz weisse Rückseiten fallen weg
    if (s.leer && s.weiss) return;
    if (s.leer) { if (akt) akt.seiten.push(i); else vorne.push(i); return; }
    const lief = s.lieferant || s.qr;
    let neu = !akt;
    if (!neu && s.seite && s.seite.n === 1) neu = true;
    if (!neu && lief && akt.lieferant && einfach(lief) !== einfach(akt.lieferant)) neu = true;
    // Andere Rechnungsnummer: nur trennen, wenn nicht derselbe Lieferant und
    // kein Zahlteil. Der Scanner liest die Nummer auf Seite 2 oder im
    // Einzahlungsschein manchmal leicht anders (Patrick 29. Oktober 2026:
    // „bei Steeltec Seite 1 und 2 getrennt, bei Ades die Rechnung vom
    // Einzahlungsschein“)
    const gleicherLief = lief && akt && akt.lieferant && einfach(lief) === einfach(akt.lieferant);
    if (!neu && s.nummer && akt.nummer && einfach(s.nummer) !== einfach(akt.nummer)
      && !gleicherLief && !s.zahlteil && (!s.seite || s.seite.n === 1)) neu = true;
    // Ohne sicheren Lieferanten zählt der Briefkopf: steht oben eine andere
    // Firma als bei der Rechnung davor und ist es keine Folgeseite, beginnt
    // eine neue Rechnung. Sonst hängen sich ganze Rechnungen an die davor
    // (Patrick 3. November 2026: Elektro Andres AG landete bei der
    // Ausgleichskasse und bei AXA ARAG)
    const vorFirma = akt && (akt.lieferant || akt.vermutungen[0]);
    if (!neu && !lief && s.vermutung && vorFirma && einfach(s.vermutung) !== einfach(vorFirma)
      && !gleicherName(s.vermutung, vorFirma) && !(s.seite && s.seite.n > 1) && !s.zahlteil
      && !(s.nummer && akt.nummer && einfach(s.nummer) === einfach(akt.nummer))) neu = true;
    // Derselbe Lieferant mit einer klar anderen Nummer auf einer ersten Seite
    // ist die nächste Rechnung (Patrick 3. November 2026: „Brack hat nur eine
    // Rechnung, da müssen viele sein“). Nur leicht anders gelesen bleibt sie
    // zusammen (Steeltec, Ades).
    // Fortlaufende Nummern unterscheiden sich oft nur in einer Ziffer: dann
    // trennt ein anderes Datum oder unsere Adresse (erste Seite)
    const nr = (x) => einfach(x).replace(/\s/g, "");
    if (!neu && gleicherLief && s.nummer && akt.nummer && nr(s.nummer) !== nr(akt.nummer)
      && !s.zahlteil && (!s.seite || s.seite.n === 1)
      && (nummerAnders(s.nummer, akt.nummer) || s.anUns || (s.datum && akt.datum && s.datum !== akt.datum))) neu = true;
    // Der Zahlteil (QR-Rechnung) auf eigenem Blatt gehört zur Rechnung davor
    const gleich = lief && (!akt || !akt.lieferant || einfach(lief) === einfach(akt.lieferant));
    if (!neu && akt.fertig && !(gleich && (akt.lieferant || s.zahlteil))) neu = true;
    // Die nächste Folgeseite („Seite 2“ nach „Seite 1 von 2“) gehört immer zur
    // Rechnung davor, auch wenn der Lieferant dort anders gelesen wird
    if (neu && akt && s.seite && s.seite.n > 1 && !akt.fertig
      && (s.seite.n === akt.letzte + 1 || !(lief && akt.lieferant && einfach(lief) !== einfach(akt.lieferant)))) neu = false;
    // Ein Zahlteil ohne „Seite 1“ gehört zur Rechnung davor, ausser diese ist
    // fertig und von einem anderen Lieferanten
    if (neu && akt && s.zahlteil && !(s.seite && s.seite.n === 1)
      && (!akt.fertig || !lief || !akt.lieferant || einfach(lief) === einfach(akt.lieferant))) neu = false;
    if (neu) {
      akt = { seiten: [], letzte: 0, lieferant: null, gelernt: false, nummer: null, datum: null, fertig: false,
        uids: new Set(), ibans: new Set(), vorschlag: null, vermutungen: [], merkmale: [] };
      docs.push(akt);
    }
    if (vorne.length) akt.seiten.push(...vorne.splice(0));
    akt.seiten.push(i);
    if (s.lieferant) { akt.lieferant = s.lieferant; akt.gelernt = true; }
    else if (s.qr && !akt.gelernt) akt.lieferant = s.qr;
    if (!akt.nummer && s.nummer) akt.nummer = s.nummer;
    if (!akt.datum && s.datum) akt.datum = s.datum;
    s.uids.forEach((u) => akt.uids.add(u));
    s.ibans.forEach((x) => akt.ibans.add(x));
    akt.merkmale.push({ firma: s.lieferant || s.qr || s.vermutung, uids: s.uids, ibans: s.ibans });
    if (!akt.vorschlag) akt.vorschlag = firmaVorschlag(s.zeilen);
    if (s.vermutung) akt.vermutungen.push(s.vermutung);
    if (s.seite && s.seite.von) akt.fertig = s.seite.n === s.seite.von;
    akt.letzte = s.seite ? s.seite.n : akt.letzte;
  });
  return docs.map((d) => {
    // Ohne sicheren Lieferanten: die Firma, die auf den Seiten der Rechnung
    // am häufigsten im Briefkopf steht
    if (!d.lieferant && d.vermutungen.length) {
      const zahl = new Map();
      d.vermutungen.forEach((v) => {
        const k = [...zahl.keys()].find((x) => gleicherName(x, v)) || v;
        zahl.set(k, (zahl.get(k) || 0) + 1);
      });
      d.lieferant = [...zahl.entries()].sort((a, b) => b[1] - a[1])[0][0];
      d.vermutet = true;
    }
    if (!d.vorschlag && d.vermutungen.length) d.vorschlag = d.vermutungen[0];
    delete d.vermutungen;
    // Gelernt werden nur UID und IBAN von Seiten, die zu diesem Lieferanten
    // gehören. Rutscht eine fremde Rechnung mit in die Datei, bekäme der
    // Lieferant sonst deren UID und IBAN, und ab dann landet jede Rechnung
    // der fremden Firma bei ihm (Patrick 3. November 2026: „Elektro Andres
    // AG Rechnungen waren bei Ausgleichskasse“)
    if (d.lieferant) {
      const passt = (m) => !m.firma || einfach(m.firma) === einfach(d.lieferant) || gleicherName(m.firma, d.lieferant);
      d.uids = new Set(d.merkmale.filter(passt).flatMap((m) => m.uids));
      d.ibans = new Set(d.merkmale.filter(passt).flatMap((m) => m.ibans));
    }
    delete d.merkmale;
    return Object.assign(d, { uids: [...d.uids], ibans: [...d.ibans] });
  });
}

// Dateiname einer Rechnung: „2026-10-28 KR26-17717.pdf“
export function dateiName(d, stapel) {
  const teile = [d.datum || "ohne Datum", d.nummer ? d.nummer : null].filter(Boolean);
  if (!d.nummer) teile.push("aus " + stapel.replace(/\.pdf$/i, "") + " S" + (d.seiten[0] + 1));
  return sauber(teile.join(" ")) + ".pdf";
}

// Nach dem Ablegen lernen: UID und IBAN der Rechnung gehören ab jetzt
// zu diesem Lieferanten (nur solche, die nicht schon einem anderen gehören)
export function lernen(liste, name, d) {
  let l = liste.find((x) => einfach(x.name) === einfach(name));
  if (!l) { l = { name, uid: [], iban: [], text: [] }; liste.push(l); }
  const fremd = (art, wert) => liste.some((x) => x !== l && (x[art] || []).includes(wert));
  for (const u of d.uids || []) if (!l.uid.includes(u) && !fremd("uid", u)) l.uid.push(u);
  for (const i of d.ibans || []) if (!l.iban.includes(i) && !fremd("iban", i)) l.iban.push(i);
  return l;
}

// Aus den Textstücken von pdf.js die Zeilen bauen: gleiche Höhe auf dem
// Blatt ist eine Zeile, von oben nach unten, links nach rechts. Zwischen
// weit auseinander liegenden Stücken (zwei Spalten) stehen zwei Leerzeichen.
export function zeilenAusStuecken(stuecke) {
  const zeilen = [];
  for (const s of stuecke) {
    if (!s.str || !s.str.trim()) continue;
    const x = s.transform[4], y = s.transform[5];
    let z = zeilen.find((r) => Math.abs(r.y - y) < 4);
    if (!z) { z = { y, teile: [] }; zeilen.push(z); }
    z.teile.push({ x, ende: x + (s.width || 0), text: s.str.trim() });
  }
  return zeilen.sort((a, b) => b.y - a.y).map((z) => {
    const t = z.teile.sort((a, b) => a.x - b.x);
    let aus = "";
    t.forEach((s, i) => { aus += i === 0 ? s.text : (s.x - t[i - 1].ende > 40 ? "  " : " ") + s.text; });
    return aus;
  });
}
