// =================================================================
//  DRUCKFORMULARE WIE IM GEWATEC (seit 1.935.0)
//  Wunsch Patrick 27. November 2026: Rechnung, Lieferschein,
//  Auftragsbestätigung, Angebot und Bestellung (vier Arten) sollen
//  genau so aussehen wie die Formulare aus dem Gewatec. Die Masse
//  stammen aus seinen Muster-PDF und sind darum in pt angegeben
//  (A4 = 595 × 842 pt, linker Rand 57 pt, Schrift Arial 10 pt,
//  Zeilenabstand 12 pt), so lassen sie sich direkt nachmessen.
//
//  Aufbau jedes Blatts: Hofer-Briefkopf und Formularkopf (Titel,
//  Strichcode, Angaben links, Anschrift rechts, Spaltenköpfe) stehen
//  im Kopf einer Tabelle, so wiederholt sie der Browser auf jeder
//  Seite wie das Gewatec. Die Seitenzahl steht unten rechts im
//  Seitenrand, weil der Browser sie nur dort zählen kann.
// =================================================================
import { alt } from "../../bruecke.jsx";
import { briefkopfHtml, BRIEF_CSS } from "../../teile/briefkopf.js";
import { adresseText, chf, datumText, mengeText, terminText, belegSumme, artikelIdxText, posIdx, posPe,
  posBetrag, kwText, folgePositionen, BELEGTYP } from "../../daten/erp.js";

const esc = (t) => alt.esc(t == null ? "" : String(t));
const n = (v) => { const m = /-?\d[\d']*(?:[.,]\d+)?/.exec(String(v ?? "")); return m ? Number(m[0].replace(/'/g, "").replace(",", ".")) || 0 : 0; };
const ADRESSE_HOFER = "Hofer + Co. Präzisionsdrehteile, Alte Bernstrasse 24, 4573 Lohn- Ammannsegg";
const UID = "CHE-313.094.963  MWST";
const FAX = "0041 32 677 55 70";
const BANK = "<div class='bank'><table><tr><td>Bankverbindung:</td><td>CHF-Kto.:</td><td>UBS AG, CH-4500 Solothurn, Kto-Nr. 486946.08T, IBAN: CH20 0026 2262 4869 4608T, Clearing-Nr. 262</td></tr>"
  + "<tr><td></td><td>EURO-Kto.:</td><td>UBS AG, CH-4500 Solothurn, Kto-Nr. 486946.60V, IBAN: CH22 0026 2262 4869 4660V, Clearing-Nr. 262</td></tr></table></div>";

// Wer das Blatt druckt, steht als Sachbearbeiter im Kopf
function sachbearbeiter() {
  const ew = (k) => String((alt.einstellungWert && alt.einstellungWert(k, "")) || "");
  return {
    name: (alt.meinName && alt.meinName()) || "",
    tel: ew("telefon") || ew("rk_tel") || "0041 32 677 55 77",
    fax: FAX,
    mail: (alt.meineMail && alt.meineMail()) || "admin@hoferco.ch",
  };
}

// ---------- Strichcode Code 39 ----------
// Wie die Schrift „Code-39-30“ im Gewatec: Nummer mit Sternen als
// Start- und Stoppzeichen. Schmaler Strich 0.6 pt, breiter 1.5 pt.
const CODE39 = {
  0: "nnnwwnwnn", 1: "wnnwnnnnw", 2: "nnwwnnnnw", 3: "wnwwnnnnn", 4: "nnnwwnnnw",
  5: "wnnwwnnnn", 6: "nnwwwnnnn", 7: "nnnwnnwnw", 8: "wnnwnnwnn", 9: "nnwwnnwnn",
  "-": "nwnnnnwnw", "*": "nwnnwnwnn",
};
export function code39Svg(text, hoehe = 22) {
  const t = String(text || "");
  if (!t || !/^[0-9-]+$/.test(t)) return "";
  const S = 0.6, B = 1.5;
  let x = 0;
  const balken = [];
  for (const z of "*" + t + "*") {
    [...CODE39[z]].forEach((m, i) => {
      const w = m === "w" ? B : S;
      if (i % 2 === 0) balken.push("<rect x='" + x.toFixed(2) + "' y='0' width='" + w + "' height='" + hoehe + "'/>");
      x += w;
    });
    x += S;
  }
  return "<svg class='code39' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + x.toFixed(2) + " " + hoehe + "' style='width:" + x.toFixed(2) + "pt;height:" + hoehe + "pt'>" + balken.join("") + "</svg>";
}

// ---------- Bausteine ----------
const CSS = BRIEF_CSS + `
@page{size:A4;margin:0 0 9mm 0;@bottom-right{content:"Seite " counter(page) " / " counter(pages);font:8pt Arial,Helvetica,sans-serif;color:#000;margin-right:57pt;vertical-align:top}}
html,body{margin:0;padding:0;background:#fff}
body{font:10pt/12pt Arial,Helvetica,sans-serif;color:#000}
table{border-collapse:collapse}
td,th{padding:0;vertical-align:top;text-align:left;font-weight:400}
b,.b,.b td,.b th{font-weight:700}
table.seite{width:100%}
table.seite>thead>tr>td,table.seite>tbody>tr>td,table.seite>tfoot>tr>td{padding:0}
.innen{padding:0 57pt}
.kopf{position:relative;box-sizing:border-box}
.titel{font-size:16pt;line-height:20pt;position:relative;height:20pt;margin-bottom:3pt}
.codes{position:absolute;top:-2pt;display:flex;gap:8pt}
.code39{display:block}
.kv td{white-space:nowrap}
.adr{white-space:pre-line}
.rechts{position:absolute}
.nach{position:absolute;left:0;right:0}
.r{text-align:right}
.nw{white-space:nowrap}
table.sp{width:100%;table-layout:fixed}
table.sp th{font-weight:700}
.sp9 th{font-size:9pt}
.linie{border-top:1.2pt solid #000}
.strich{border-top:.8pt dashed #000}
.pos{page-break-inside:avoid;break-inside:avoid}
table.det td{white-space:nowrap}
table.det td.w{white-space:normal}
.lpt{font-weight:700;text-decoration:underline;font-size:9pt}
table.lp th{font-weight:700;font-size:9pt}
.gruss{page-break-inside:avoid;break-inside:avoid}
.bank{position:fixed;left:24pt;right:20pt;bottom:6pt;font-size:8pt;line-height:11pt}
.bank td{padding-right:6pt;white-space:nowrap}
.bank td:first-child{width:66pt}.bank td:nth-child(2){width:46pt}
.unten{position:fixed;left:57pt;right:57pt;bottom:4pt}
.test{color:#b00;font-weight:bold;position:absolute;right:57pt;top:0}
@media print{.test{display:none}}
@media screen{body{background:#e9edf2}table.seite{width:210mm;margin:0 auto;background:#fff;box-shadow:0 0 6px rgba(0,0,0,.25)}.bank,.unten{position:static;padding:8pt 0}}
`;

// Tabelle Bezeichnung : Wert (Doppelpunkt in eigener Spalte wie im Gewatec)
function det(zeilen, l = 63, c = 18, fett) {
  const z = zeilen.filter((x) => x && (x[1] || x[2]));
  if (!z.length) return "";
  return "<table class='det'>" + z.map(([a, w, immer]) => "<tr" + (fett ? " class='b'" : "") + "><td style='width:" + l + "pt'>" + esc(a)
    + "</td><td style='width:" + c + "pt'>:</td><td class='w'>" + (immer === "html" ? w : esc(w)) + "</td></tr>").join("") + "</table>";
}
const colgroup = (breiten) => "<colgroup>" + breiten.map((b) => "<col style='width:" + b + "pt'>").join("") + "</colgroup>";

// Kopf: Titel (mit Strichcodes daneben), Angaben links, Anschrift
// rechts (oben bündig mit dem Titel), darunter rechte Angaben.
function kopfHtml(k) {
  const links = k.links.filter((x) => x && x[1]);
  return "<div class='kopf' style='padding-top:" + k.oben + "pt;height:" + k.hoehe + "pt'>"
    + "<div class='titel'>" + esc(k.titel)
    + (k.codes && k.codes.length ? "<span class='codes' style='left:" + (k.codeX || 96) + "pt'>" + k.codes.map((c) => code39Svg(c)).join("") + "</span>" : "") + "</div>"
    + "<table class='kv'>" + links.map(([a, w, fett]) => "<tr" + (fett === true ? " class='b'" : "") + "><td style='width:" + k.kl + "pt'>" + esc(a) + "</td><td style='width:" + k.kc + "pt'>"
      + (a ? ":" : "") + "</td><td" + (fett === "wert" ? " class='b'" : "") + ">" + esc(w) + "</td></tr>").join("") + "</table>"
    + "<div class='rechts' style='left:" + (k.rechtsX || 291) + "pt;top:" + (k.oben + (k.adrOben || 0)) + "pt;right:0'>"
    + "<div class='adr'>" + esc(k.adresse) + "</div>"
    + (k.rechts && k.rechts.some((x) => x && x[1]) ? "<table class='kv' style='position:absolute;top:" + k.rechtsOben + "pt'>"
      + k.rechts.filter((x) => x && x[1]).map(([a, w]) => "<tr><td style='width:" + (k.rl || 85) + "pt'>" + esc(a) + "</td><td style='width:" + (k.rc || 11) + "pt'>:</td><td>" + esc(w) + "</td></tr>").join("")
      + (k.rechtsCodes ? "<tr><td colspan='3' style='padding-top:3pt'><span style='display:flex;gap:8pt'>" + k.rechtsCodes.map((c) => code39Svg(c)).join("") + "</span></td></tr>" : "")
      + "</table>" : "")
    + "</div>"
    + (k.nach ? "<div class='nach' style='top:" + k.nach.y + "pt'>" + k.nach.html + "</div>" : "")
    + "</div>";
}

// Druckfenster sofort beim Klick öffnen (sonst kann der Browser es als
// ungefragtes Fenster sperren) und jeden Fehler beim Zusammensetzen im
// Fenster und als Meldung zeigen, statt dass still nichts passiert
// (1.935.1, Patrick 27. November 2026: „wenn ich drucken drücke passiert nichts“)
let vorbereitet = null;
function sicher(fn) {
  return (...args) => {
    const w = window.open("", "_blank");
    if (!w) { alt.meldung("Das Druckfenster wurde vom Browser blockiert. Bitte Popups für das HoferTool erlauben.", "warn"); return null; }
    try { w.document.write("<p style='font:14px Arial;padding:20px'>Formular wird erstellt …</p>"); } catch (e) { /* leer lassen */ }
    const los = () => {
      vorbereitet = w;
      try { return fn(...args); }
      catch (e) { return fehler(e); }
      finally { vorbereitet = null; }
    };
    const fehler = (e) => {
      const text = (e && e.message) || String(e);
      try { w.document.open(); w.document.write("<p style='font:14px Arial;padding:20px;color:#b00'>Fehler beim Erstellen des Formulars: " + esc(text) + "</p>"); w.document.close(); } catch (f) { /* egal */ }
      alt.meldung("Drucken fehlgeschlagen: " + text, "fehler");
      if (alt.fehlerMerken) alt.fehlerMerken("Drucken", text, e && e.stack ? String(e.stack).split("\n").slice(0, 3).join(" | ") : "");
      return null;
    };
    // Die Einstellungen aus dem Designer kommen einmal aus der Datenbank;
    // ohne Verbindung druckt das Formular mit den Standardtexten
    return formularEinstellungenLaden().then(los, los);
  };
}

// Ganzes Blatt zusammensetzen und im eigenen Fenster öffnen
function blattOeffnen({ titel, kopf, spalten, inhalt, fuss, fussHoehe = 0, form }) {
  const sg = Number(einst(form).schrift) || 10;
  const html = "<!doctype html><html><head><meta charset='utf-8'><title>" + esc(titel) + "</title><style>" + CSS
    + (sg !== 10 ? "body{font-size:" + sg + "pt;line-height:" + (sg * 1.2).toFixed(1) + "pt}" : "") + "</style></head><body>"
    + "<table class='seite'><thead><tr><td>" + briefkopfHtml() + "</td></tr></thead>"
    + "<tbody><tr><td><div class='innen' style='position:relative'><p class='test'>TESTVERSION ERP</p>" + kopfHtml(kopf)
    // Spaltenköpfe im eigenen Tabellenkopf: der Browser wiederholt sie auf
    // jeder Folgeseite (der ganze Formularkopf ist dafür zu hoch, Chrome
    // wiederholt nur niedrige Tabellenköpfe)
    + (spalten ? "<table style='width:100%;margin-top:-8pt'><thead><tr><td style='padding-top:8pt'>" + spalten + "</td></tr></thead><tbody><tr><td>" + inhalt + "</td></tr></tbody></table>" : inhalt)
    + "</div></td></tr></tbody>"
    + "<tfoot><tr><td><div style='height:" + (fussHoehe + 10) + "pt'></div></td></tr></tfoot></table>"
    + (fuss || "")
    + (vorschau ? "" : "<script>setTimeout(()=>print(),400)</script>") + "</body></html>";
  if (vorschau) return html;
  const w = vorbereitet || window.open("", "_blank");
  if (!w) { alt.meldung("Das Fenster wurde vom Browser blockiert.", "warn"); return null; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  return w;
}

// =================================================================
//  DESIGNER (seit 1.936.0, Wunsch Patrick 27. November 2026: „Designer
//  für Formulare zum Anpassen“; die Texte hat er im Gewatec über
//  Crystal Reports gesteuert). Je Formular: feste Texte ändern oder
//  ausschalten, Schriftgrösse, Strichcode und Bankverbindung ein/aus.
//  Gespeichert in app_config.formulare (nur Admin schreibt).
//  Platzhalter in den Texten: {nr} {datum} {name} {kunde}
// =================================================================
export const FORMULARE = [["re", "Rechnung"], ["ls", "Lieferschein"], ["ab", "Auftragsbestätigung"], ["be", "Bestellung"], ["an", "Angebot"]];
const URSPRUNG = "Der Ausführer der Waren, auf die sich dieses Handelspapier bezieht, erklärt, dass diese Waren, soweit nicht anders angegeben, präferenzbegünstigte Schweizer Ursprungswaren sind.\nKeine Kumulation angewendet (no cumulation applied)";
const ORT = "Lohn - Ammannsegg , den {datum}      {name}";
const GRUSS = "Mit freundlichen Grüssen\nHOFER + CO";
export const TEXTE = {
  re: [["ursprung", "Ursprungserklärung", URSPRUNG], ["ort", "Ort, Datum, Name", ORT], ["firma", "Firmenzeile am Schluss", "Hofer + Co Präzisionsdrehteile AG"]],
  ls: [["intro", "Satz über der Tabelle", "Wir senden Ihnen aufgrund der unten aufgeführten Liefer- und Zahlungsbedingungen:"],
    ["ursprung", "Ursprungserklärung", URSPRUNG], ["ort", "Ort, Datum, Name", ORT], ["quittung", "Ware erhalten (unten)", "Ware erhalten"]],
  ab: [["ursprung", "Ursprungserklärung", URSPRUNG], ["ort", "Ort, Datum, Name", ORT], ["gruss", "Gruss", GRUSS]],
  be: [["zertifikat", "Hinweis oben (nur Rohmaterial)", "Materialzertifikat  beilegen !"],
    ["hinweis", "Hinweis unten", "Bitte Teilen Sie uns eventuelle Lieferverzögerungen umgehend mit.\nWichtig! Unbedingt die Bestellnummer {nr} auf allen Korrespondenzen vermerken."],
    ["ab_bitte", "Bitte um Auftragsbestätigung (Rohmaterial, ZA)", "Bitte senden Sie uns eine Auftragsbestätigung!"],
    ["lieferadresse", "Lieferadresse (nur Rohmaterial)", "Lieferadresse:  " + ADRESSE_HOFER], ["gruss", "Gruss", GRUSS]],
  an: [["schluss", "Schlusstext", "Ihrem Auftrag, dem wir unsere volle Aufmerksamkeit schenken werden, sehen wir gerne entgegen.\nFür allfällige weitere Fragen stehen wir Ihnen jederzeit zur Verfügung."],
    ["gruss", "Gruss", GRUSS]],
};
// Schalter je Formular: [Name, Bezeichnung, Standard]
export const SCHALTER = {
  re: [["codes", "Strichcode", true], ["bank", "Bankverbindung unten", true]],
  ls: [["codes", "Strichcode", true]], ab: [["codes", "Strichcode", true]], be: [["codes", "Strichcode (Rohmaterial)", true]], an: [],
};
export const FORMULAR_SCHLUESSEL = "formulare";
let einstellungen = {};
let geladenAm = 0;
let platz = {}; // Platzhalter des Blatts, das gerade gezeichnet wird
let vorschau = null; // Entwurf aus dem Designer, solange er eine Vorschau zeichnet
export async function formularEinstellungenLaden(neu) {
  if (!neu && Date.now() - geladenAm < 60000) return einstellungen;
  const r = await alt.zeitlimit(alt.db.from("app_config").select("wert").eq("schluessel", FORMULAR_SCHLUESSEL).limit(1), 5000, "Formulare");
  if (r.error) throw r.error;
  const z = (r.data || [])[0];
  try { einstellungen = z && z.wert ? (typeof z.wert === "string" ? JSON.parse(z.wert) : z.wert) : {}; } catch (e) { einstellungen = {}; }
  geladenAm = Date.now();
  return einstellungen;
}
export async function formularEinstellungenSpeichern(neu) {
  const vorher = await alt.rueckSichern("app_config", { schluessel: FORMULAR_SCHLUESSEL });
  const r = await alt.db.from("app_config").upsert([{ schluessel: FORMULAR_SCHLUESSEL, wert: JSON.stringify(neu) }], { onConflict: "schluessel" });
  if (r.error) throw r.error;
  alt.merkeSchritt("Formulare ändern", vorher.length ? alt.rueckRein("app_config", vorher, "schluessel")
    : alt.rueckWeg("app_config", { schluessel: FORMULAR_SCHLUESSEL }));
  einstellungen = neu; geladenAm = Date.now();
}
const einst = (form) => ((vorschau || einstellungen) || {})[form] || {};
const schalter = (form, name) => { const w = (einst(form).schalter || {})[name]; return w == null ? true : !!w; };
// Text eines Formulars als HTML; null, wenn er ausgeschaltet ist
function text(form, id, werte = {}) {
  const std = (TEXTE[form] || []).find((x) => x[0] === id);
  const e = (einst(form).texte || {})[id] || {};
  if (e.aus) return null;
  const roh = e.text != null && String(e.text).trim() !== "" ? String(e.text) : (std ? std[2] : "");
  return esc(roh.replace(/\{(nr|datum|name|kunde)\}/g, (m, k) => ({ ...platz, ...werte })[k] ?? "")).replace(/\n/g, "<br>").replace(/ {2,}/g, (x) => "&nbsp;".repeat(x.length));
}

// Ursprungserklärung mit Ort, Datum und Sachbearbeiter, wie auf der
// Gewatec-Rechnung; seit 1.935.5 auch auf Lieferschein und Auftrags-
// bestätigung (Patrick 27. November 2026: „bring diesen überall“)
const absatz = (h, rand) => (h ? "<p style='margin:" + rand + "pt 0 0'>" + h + "</p>" : "");
const ursprung = (form, datum, name) => absatz(text(form, "ursprung"), 12) + absatz(text(form, "ort", { datum: datumText(datum), name }), 11);
const gruss = (form, x, name, oben = 30) => { const g = text(form, "gruss"); return g == null ? "" : "<div class='gruss' style='margin:" + oben + "pt 0 0 " + x + "pt'>" + g + "<br><br>" + esc(name) + "</div>"; };

// Werkstoff, Werkstoffnummer usw. eines Artikels
function artikelInfo(d, a, x) {
  const ad = (a && a.daten) || {};
  const ix = x ? posIdx(d, x) : (a && a.idx) || "";
  const roh = ad.rohmaterial_id && d.artikelMap.get(ad.rohmaterial_id);
  const werkstoff = (roh && roh.bezeichnung) || ad.material || "";
  const wid = (q) => (/\b(1\.\d{4}|CW\d{3}[A-Z])\b/.exec(q || "") || [])[1] || "";
  return {
    ad, ix, werkstoff, wnr: wid(werkstoff) || wid(a && a.bezeichnung),
    titel: a ? (a.bezeichnung || artikelIdxText(a, ix)) : (x && x.text) || "",
    zeichnung: a && (a.zeichnung || ix) ? (a.zeichnung || "") + " / Index: " + (ix || "--") : "",
    ident: ad.kunden_nr || ad.ident || "", code: a ? a.nr : "", zoll: ad.zolltarif || "",
  };
}
const peZahl = (x) => String(posPe(x));
const bedText = (d, id) => (d.bedingungen.find((x) => x.id === id) || {}).text || "";

// Liefer-, Versand- und Zahlungsbedingung: zuerst vom Beleg selbst, sonst
// vom Beleg, aus dem er entstand (Lieferschein → Auftrag, Rechnung →
// Lieferschein → Auftrag), sonst vom Kunden. Aus dem Gewatec übernommene
// Belege haben diese Felder oft leer (Patrick 27. November 2026: „hier fehlen
// die Versandbedingungen etc.“).
function bedingungen(d, b) {
  const kette = [];
  let x = b;
  for (let i = 0; x && i < 4; i++) { kette.push(x.daten || {}); x = x.bezug_id && d.belegMap.get(x.bezug_id); }
  const pd = ((d.partnerMap.get(b.partner_id) || {}).daten) || {};
  kette.push(pd);
  const erst = (k) => { for (const z of kette) if (z[k]) return z[k]; return ""; };
  return { liefer: bedText(d, erst("liefer")), zahlung: bedText(d, erst("zahlung")), versand: erst("versand") };
}

// Partner: Anschrift, Telefon, Fax, Ansprechpartner
function partnerInfo(d, b, anschrift) {
  const p = d.partnerMap.get(b.partner_id) || {};
  const pd = p.daten || {};
  const kontakt = (pd.kontakte || [])[0] || {};
  return { p, pd, an: anschrift || { name: p.name, ...(pd.adresse || {}) }, tel: pd.telefon || kontakt.telefon || "", fax: pd.fax || "", kontakt };
}

// Lieferplan einer Position (Abrufe oder der eine Termin)
function lieferplan(x, { datum, fettZeilen } = {}) {
  const xd = x.daten || {};
  const ein = esc(x.einheit || "Stk");
  const abrufe = (xd.abrufe || []).filter((r) => r.termin || r.kw || r.menge || r.abruf);
  const zeilen = abrufe.length
    ? abrufe.map((r) => [r.abruf ? "auf Abruf" : datum && r.termin ? datumText(r.termin) : r.kw ? "KW " + r.kw : r.termin ? "KW " + kwText(r.termin) : "auf Abruf", r.menge, r.bemerkung || ""])
    : [[datum && x.termin ? datumText(x.termin) : terminText(x) || "auf Abruf", x.menge, xd.lp_bemerkung || ""]];
  return "<div class='lpt' style='margin-top:9pt'>LIEFERPLAN:</div>"
    + "<table class='lp' style='margin:6pt 0 4pt'>" + colgroup([90, 51, 12, 200])
    + "<tr><th>Termin(e)</th><th class='r'>" + (datum ? "MENGE" : "Menge") + "</th><th></th><th>" + (datum ? "BEMERKUNG" : "Bemerkung") + "</th></tr>"
    + zeilen.map(([t, m, bem]) => "<tr" + (fettZeilen ? " class='b'" : "") + "><td>" + esc(t) + "</td><td class='r nw'>" + mengeText(m) + " " + ein + "</td><td></td><td>" + esc(bem) + "</td></tr>").join("")
    + "</table>";
}

// =================================================================
//  RECHNUNG (auch Gutschrift und Proforma)
// =================================================================
const SP_RE = [18, 58, 5, 207, 40, 6, 57, 90];
export const reDrucken = sicher(reDruckenBlatt);
function reDruckenBlatt(d, b) {
  const bd = b.daten || {};
  const t = BELEGTYP[b.typ] || BELEGTYP.rechnung;
  const { p, an } = partnerInfo(d, b, bd.anschrift || bd.rechnung_an);
  const sb = sachbearbeiter();
  platz = { nr: b.nr, datum: datumText(b.datum), name: sb.name, kunde: (d.partnerMap.get(b.partner_id) || {}).name || "" };
  const pos = d.posJe.get(b.id) || [];
  const s = belegSumme(d, b);
  const lsGesehen = new Set();
  let ersterLs = null;
  const bloecke = pos.map((x, i) => {
    const a = d.artikelMap.get(x.artikel_id);
    const ai = artikelInfo(d, a, x);
    const lp = x.bezug_id && d.posMap.get(x.bezug_id);
    const ls = lp && d.belegMap.get(lp.beleg_id);
    const ap = lp && lp.bezug_id && d.posMap.get(lp.bezug_id);
    const ab = ap && d.belegMap.get(ap.beleg_id);
    const abd = (ab && ab.daten) || {};
    const lsd = (ls && ls.daten) || {};
    if (ls && !ersterLs) ersterLs = ls;
    const ihre = abd.ihre_nr || lsd.ihre_nr || (!ls && bd.ihre_nr);
    const ihreDat = abd.ihre_datum || lsd.ihre_datum;
    const bem = x.text && a ? x.text : (lp && lp.text) || "";
    const neuLs = ls && !lsGesehen.has(ls.id);
    if (ls) lsGesehen.add(ls.id);
    const verp = neuLs ? n(lsd.verp_kosten) : 0;
    const porto = neuLs ? n(lsd.porto) : 0;
    const neben = (l, w) => "<tr><td></td><td colspan='6' style='padding:2pt 0 0 15pt'>" + det([[l, " ", ""]], 137, 18) + "</td><td class='r'>" + chf(w) + "</td></tr>";
    return "<table class='sp pos" + (i ? " strich" : "") + "'>" + colgroup(SP_RE)
      + "<tr><td style='padding:3pt 0 0 3pt'>" + (i + 1) + ".0</td><td colspan='7' style='padding:3pt 0 0 15pt'>"
      + (ihre ? "Ihre Bestellung " + esc(ihre) + (ihreDat ? " v. " + datumText(ihreDat) : "") + (abd.zeichen ? "  " + esc(abd.zeichen) : "") + "<br>" : "")
      + (bem ? "Bemerkung:<span style='display:inline-block;width:12pt'></span>" + esc(bem) + "<br>" : "")
      + (ab || ls ? "<b>" + [ab ? "Unsere AB " + esc(ab.nr) : "", ls ? "Lieferschein " + esc(ls.nr) + " vom " + datumText(ls.datum) : ""].filter(Boolean).join(" / ") + "</b>" : "")
      + "</td></tr>"
      + "<tr><td></td><td class='r b nw' style='padding-top:8pt'>" + mengeText(x.menge) + " " + esc(x.einheit || "Stk") + "</td><td></td>"
      + "<td style='padding-top:8pt'>" + esc(ai.titel) + "</td><td class='r nw' style='padding-top:8pt'>" + chf(x.preis).replace(".", ",") + "</td><td></td>"
      + "<td style='padding:8pt 0 0 2pt'>" + peZahl(x) + "</td><td class='r' style='padding-top:8pt'>" + chf(posBetrag(x)) + "</td></tr>"
      + "<tr><td colspan='2'></td><td></td><td colspan='5' style='padding:2pt 0 0'>"
      + det([["Zeichnung", ai.zeichnung], ["Ident-Nr.", ai.ident], ["Artikel-Code", ai.code], ["Material", ai.werkstoff], ["Werkst. Nr.", ai.wnr],
        ["Zolltarif-Nr.", ai.zoll], x.daten && x.daten.charge ? ["Charge", x.daten.charge] : null])
      + "</td></tr>"
      + (verp ? neben("Verpackung", verp) : "") + (porto ? neben("Porto", porto) : "")
      + "<tr><td colspan='8' style='height:4pt'></td></tr></table>";
  }).join("");
  const sz = (l, w, fett) => "<tr" + (fett ? " class='b'" : "") + "><td class='r'>" + l + "</td><td style='width:14pt;text-align:center'>:</td><td class='r' style='width:80pt'>" + w + "</td></tr>";
  const satz = (Number(s.satz) || 0).toFixed(2);
  const lsd = (ersterLs && ersterLs.daten) || {};
  const liefAdr = adresseText(lsd.anschrift || an).split("\n");
  const summen = "<div class='linie' style='margin-top:2pt'></div><div class='gruss'>"
    + "<table style='margin:4pt 0 0 auto;width:270pt'>"
    + (s.neben ? sz("Summe Porto u. Verpackung", chf(s.neben)) : "")
    + sz("gesamt netto", chf(s.netto)) + sz("zzgl. " + satz + " %  MwSt", chf(s.steuer))
    + "<tr><td colspan='3' style='padding-top:3pt'><div style='border-top:.6pt solid #000;border-bottom:.6pt solid #000;height:2pt'></div></td></tr>"
    + sz("Rechnungsbetrag in  CHF", chf(s.brutto), true) + "</table>"
    + "<div style='margin-top:8pt'>" + det([
      ["Lieferadresse", [liefAdr[0], liefAdr[1]].filter(Boolean).join(", ") + (liefAdr.length > 2 ? ",\n" + liefAdr.slice(2).join(", ") : ""), ""],
      ["Lieferbedingung", bedingungen(d, ersterLs || b).liefer], ["Versandbedingung", bedingungen(d, ersterLs || b).versand], ["Zahlungsbedingung", bedText(d, bd.zahlung) || bedingungen(d, b).zahlung],
    ].map((z) => z && [z[0], z[1]]), 144, 18).replace(/class='w'>([^<]*)\n/g, "class='w' style='white-space:pre-line'>$1\n") + "</div>"
    + (bd.text ? "<p style='white-space:pre-line;margin:8pt 0 0'>" + esc(bd.text) + "</p>" : "")
    + ursprung("re", b.datum, sb.name)
    + absatz(text("re", "firma"), 13) + "</div>";
  const spalten = "<table class='sp'>" + colgroup(SP_RE) + "<tr><th>POS</th><th style='padding-left:11pt'>MENGE</th><th></th><th style='padding-left:16pt'>BENENNUNG</th>"
    + "<th class='nw'>E-PREIS</th><th></th><th>PRO</th><th class='r'>BETRAG (CHF)</th></tr></table><div class='linie' style='margin-top:3pt'></div>";
  return blattOeffnen({
    titel: t.name + " " + b.nr,
    kopf: {
      titel: t.name, codes: schalter("re", "codes") ? [b.nr, p.nr] : null, codeX: 96, oben: 34, hoehe: 156, kl: 84, kc: 13,
      links: [[t.name + " Nr", b.nr, "wert"], ["Datum", datumText(b.datum)], ["Sachbearbeiter", sb.name], ["Telefon", sb.tel], ["Telefax", sb.fax],
        ["E-Mail", sb.mail], ["Unsere UID Nr.", UID, true], ["", "Knd. Nr:  " + (p.nr || "")]],
      adresse: adresseText(an), adrOben: 41,
    },
    spalten, inhalt: bloecke + summen, fuss: schalter("re", "bank") ? BANK : "", fussHoehe: schalter("re", "bank") ? 26 : 0, form: "re",
  });
}

// =================================================================
//  LIEFERSCHEIN
// =================================================================
const SP_LS = [18, 58, 5, 288, 112];
export const lsDrucken = sicher(lsDruckenBlatt);
function lsDruckenBlatt(d, b) {
  const bd = b.daten || {};
  const { p, an, tel, fax } = partnerInfo(d, b, bd.anschrift || bd.rechnung_an);
  const sb = sachbearbeiter();
  platz = { nr: b.nr, datum: datumText(b.datum), name: sb.name, kunde: (d.partnerMap.get(b.partner_id) || {}).name || "" };
  const pos = d.posJe.get(b.id) || [];
  // Bis zu diesem Lieferschein geliefert: frühere Lieferscheine derselben Auftragsposition und dieser
  const vorher = (lb) => lb.id === b.id || String(lb.datum || "") < String(b.datum || "")
    || (String(lb.datum || "") === String(b.datum || "") && String(lb.nr || "") <= String(b.nr || ""));
  let netto = 0;
  const bloecke = pos.map((x, i) => {
    const a = d.artikelMap.get(x.artikel_id);
    const ai = artikelInfo(d, a, x);
    const ap = x.bezug_id && d.posMap.get(x.bezug_id);
    const ab = ap && d.belegMap.get(ap.beleg_id);
    const abd = (ab && ab.daten) || {};
    const gesamt = ap ? n(ap.menge) : 0;
    const gel = ap ? folgePositionen(d, ap.id, "lieferschein")
      .filter((y) => { const lb = d.belegMap.get(y.beleg_id); return lb && lb.status !== "storniert" && vorher(lb); })
      .reduce((s2, y) => s2 + n(y.menge), 0) : n(x.menge);
    const kg = ai.ad.gewicht ? n(ai.ad.gewicht) * n(x.menge) : 0;
    netto += kg;
    const ein = esc(x.einheit || "Stk");
    const ihreNr = abd.ihre_nr || bd.ihre_nr;
    const ihreDat = abd.ihre_datum || bd.ihre_datum;
    const zeichen = abd.zeichen || bd.zeichen;
    const mz = (l, w) => "<tr class='b'><td style='width:140pt'>" + l + "</td><td style='width:10pt'>:</td><td class='r' style='width:56pt'>" + mengeText(w) + "</td><td style='padding-left:4pt'>" + ein + "</td></tr>";
    return "<table class='sp pos" + (i ? " strich" : "") + "'>" + colgroup(SP_LS)
      + "<tr><td colspan='5' style='padding:4pt 0 0 6pt' class='b'>" + (i + 1) + ".00</td></tr>"
      + "<tr><td colspan='5' style='padding:3pt 0 0 3pt'>"
      + (ab ? "Auftragsbestätigung: " + esc(ab.nr) + " vom " + datumText(ab.datum) + "<br>" : "")
      + (ihreNr ? "Ihre Bestellung " + esc(ihreNr) + (ihreDat ? " vom " + datumText(ihreDat) : "") + (x.text && a ? " Abruf: " + esc(x.text) : "")
        + (zeichen ? " Zeichen: " + esc(zeichen) : "") : "") + "</td></tr>"
      + "<tr><td></td><td class='r b nw' style='padding-top:15pt'>" + mengeText(x.menge) + " " + ein + "</td><td></td>"
      + "<td class='b' style='padding-top:15pt'>" + esc(ai.titel) + "</td><td style='padding-top:15pt'>" + (kg ? kg.toFixed(2).replace(".", ",") + " kg" : "") + "</td></tr>"
      + "<tr><td colspan='2'></td><td></td><td colspan='2' style='padding-top:3pt'>"
      + det([["Werkstoff", ai.werkstoff], ["Werkst. ID", ai.wnr], ["Zeichnung", ai.zeichnung], ["Ident - Nr.", ai.ident], ["Artikel-Code", ai.code],
        ["Zolltarif-Nr.", ai.zoll], x.daten && x.daten.charge ? ["Charge", x.daten.charge] : null], 61, 17)
      + "<table style='margin:6pt 0 4pt -1pt'>" + (ap ? mz("Gesamtmenge", gesamt) : "") + mz("Gelieferte Menge", gel) + "</table>"
      + "</td></tr></table>";
  }).join("");
  const bed = bedingungen(d, b);
  const gw = bd.gewatec || {};
  // Aus dem Gewatec übernommen: Gewicht und Summen stehen im Rohsatz
  if (!netto) netto = n(bd.gewicht) || n(gw.GewichtNetto);
  const brutto = n(bd.gewicht_brutto) || (n(gw.GewichtBrutto) !== netto ? n(gw.GewichtBrutto) : 0);
  const verpK = n(bd.verp_kosten) || n(gw.SummeVerpackung);
  const portoK = n(bd.porto) || n(gw.SummePorto);
  const gewicht = [brutto ? brutto.toFixed(1) + " kg brutto" : "", netto ? netto.toFixed(1) + " kg netto" : ""].filter(Boolean).join(" / ");
  const schluss = "<div class='linie' style='margin-top:2pt;padding-top:3pt'></div>"
    + det([["Verpackung", bd.verpackung || " "], ["Verpackungskosten", verpK ? "CHF    " + chf(verpK) : " "],
      ["Porto", portoK ? "CHF    " + chf(portoK) : " "], ["Gesamtgewicht", gewicht || " "],
      ["Versandbedingung", bed.versand || " "], ["Lieferbedingung", bed.liefer || " "]], 142, 17)
    + ursprung("ls", b.datum, sb.name)
    + (bd.text ? "<p style='white-space:pre-line;margin:8pt 0 0'>" + esc(bd.text) + "</p>" : "");
  const quittung = text("ls", "quittung");
  const unten = quittung == null ? "" : "<div class='unten'><table>" + colgroup([105, 162, 162])
    + "<tr><td>" + quittung + "</td><td>____________________________</td><td>____________________________</td></tr>"
    + "<tr><td></td><td>Datum:</td><td>Unterschrift:</td></tr></table></div>";
  const spalten = "<div class='linie'></div><table class='sp' style='margin:3pt 0'>" + colgroup(SP_LS) + "<tr><th style='padding-left:3pt'>POS</th><th style='padding-left:14pt'>MENGE</th><th></th>"
    + "<th>BENENNUNG</th><th>NETTO</th></tr></table><div class='linie'></div>";
  return blattOeffnen({
    titel: "Lieferschein " + b.nr,
    kopf: {
      titel: "Lieferschein", codes: schalter("ls", "codes") ? [b.nr, p.nr] : null, codeX: 105, oben: 77, hoehe: 222, kl: 97, kc: 12,
      links: [["Lieferschein-Nr.", b.nr, "wert"], ["Datum", datumText(b.datum)], ["Sachbearbeiter", sb.name], ["Telefon", sb.tel], ["Telefax", sb.fax], ["E-Mail", sb.mail]],
      adresse: adresseText(an), rechtsOben: 82, rl: 85, rc: 11,
      rechts: [["Kundennummer", p.nr], ["Telefon", tel], ["Telefax", fax]],
      nach: { y: 204, html: text("ls", "intro") || "" },
    },
    spalten, inhalt: bloecke + schluss, fuss: unten, fussHoehe: quittung == null ? 0 : 30, form: "ls",
  });
}

// =================================================================
//  AUFTRAGSBESTÄTIGUNG
// =================================================================
const SP_AB = [18, 58, 5, 217, 36, 57, 90];
export const abDrucken = sicher(abDruckenBlatt);
function abDruckenBlatt(d, b) {
  const bd = b.daten || {};
  const { p, an, tel, fax, kontakt } = partnerInfo(d, b, bd.rechnung_an);
  const liefer = bd.anschrift || null;
  const sb = sachbearbeiter();
  platz = { nr: b.nr, datum: datumText(b.datum), name: sb.name, kunde: (d.partnerMap.get(b.partner_id) || {}).name || "" };
  const pos = d.posJe.get(b.id) || [];
  const s = belegSumme(d, b);
  const bloecke = pos.map((x, i) => {
    const a = d.artikelMap.get(x.artikel_id);
    const ai = artikelInfo(d, a, x);
    return "<table class='sp pos" + (i ? " strich" : "") + "'>" + colgroup(SP_AB)
      + "<tr><td class='b' style='padding-top:5pt'>" + (i + 1) + ".0</td><td colspan='2'></td><td colspan='4' class='b' style='padding-top:5pt'>"
      + (bd.ihre_nr ? "Ihre Bestellung " + esc(bd.ihre_nr) + (bd.ihre_datum ? " vom " + datumText(bd.ihre_datum) : "") : "") + "</td></tr>"
      + "<tr><td></td><td class='r nw' style='padding-top:6pt'>" + mengeText(x.menge) + " " + esc(x.einheit || "Stk") + "</td><td></td>"
      + "<td style='padding-top:6pt'>" + esc(ai.titel) + "</td><td class='nw' style='padding-top:6pt'>" + chf(x.preis).replace(".", ",") + "</td>"
      + "<td style='padding:6pt 0 0 4pt'>" + peZahl(x) + "</td><td class='r' style='padding-top:6pt'>" + chf(posBetrag(x)) + "</td></tr>"
      + "<tr><td colspan='2'></td><td></td><td colspan='4' style='padding-top:6pt'>"
      + det([["Werkstoff", ai.werkstoff], ["Werkst. ID", ai.wnr], ["Zeichnung", ai.zeichnung], ["Ident-Nr.", ai.ident], ["Artikel-Code", ai.code],
        ["Zolltarif-Nr.", ai.zoll], x.text && a ? ["Bemerkung", x.text] : null], 62, 16)
      + lieferplan(x) + "</td></tr></table>";
  }).join("");
  const schluss = "<div class='linie' style='margin-top:2pt'></div>"
    + "<table style='margin:4pt 0 0 auto' class='b'><tr><td>Netto-Warenwert in CHF :</td><td class='r' style='width:90pt'>" + chf(s.netto) + "</td></tr></table>"
    + "<div style='margin-top:12pt'>" + det([
      liefer ? ["Versandanschrift", "<span class='adr'>" + esc(adresseText(liefer)) + "</span>", "html"] : null,
      ["Versandbedingung", bedingungen(d, b).versand], ["Lieferbedingung", bedingungen(d, b).liefer], ["Zahlungsbedingung", bedingungen(d, b).zahlung]], 143, 16) + "</div>"
    + (bd.text ? "<p style='white-space:pre-line;margin:8pt 0 0'>" + esc(bd.text) + "</p>" : "")
    + ursprung("ab", b.datum, sb.name)
    + gruss("ab", 320, sb.name, 30);
  const spalten = "<div class='linie'></div><table class='sp' style='margin:3pt 0'>" + colgroup(SP_AB)
    + "<tr><th>POS</th><th style='padding-left:11pt'>MENGE</th><th></th><th style='padding-left:-3pt'>Bezeichnung</th><th>PREIS</th><th>PRO</th><th class='r'>BETRAG(CHF)</th></tr></table><div class='linie'></div>";
  return blattOeffnen({
    titel: "Auftragsbestätigung " + b.nr,
    kopf: {
      titel: "Auftragsbestätigung", oben: 75, hoehe: 228, kl: 88, kc: 12,
      links: [["Bestätigungs-Nr.", b.nr, "wert"], ["Datum", datumText(b.datum)], ["Sachbearbeiter", sb.name], ["Telefon", sb.tel], ["Telefax", sb.fax], ["E-Mail", sb.mail]],
      adresse: adresseText(an), rechtsX: 297, rechtsOben: 65, rl: 85, rc: 11,
      rechts: [["Ihr Zeichen", bd.zeichen || kontakt.name || ""], ["Kundennummer", p.nr], ["Telefon", tel], ["Telefax", fax]],
      rechtsCodes: schalter("ab", "codes") ? [b.nr, p.nr] : null,
    },
    spalten, inhalt: bloecke + schluss, form: "ab",
  });
}

// =================================================================
//  BESTELLUNG (vier Arten wie im Gewatec, von Patrick bestätigt
//  27. November 2026)
// =================================================================
export const BESTELLARTEN = [
  ["rohmaterial", "Bestellung Rohmaterial"],
  ["za", "Bestellung Zusatzarbeit extern"],
  ["auftrag_ls", "Auftrag / Lieferschein an Lieferant"],
  ["ls_bestellung", "Lieferschein zu Bestellung"],
];
export function bestellart(d, b) {
  const a = (b.daten || {}).bestellart;
  if (a) return a;
  const erste = (d.posJe.get(b.id) || []).map((x) => d.artikelMap.get(x.artikel_id)).find(Boolean);
  return erste && erste.art === "rohmaterial" ? "rohmaterial" : "za";
}
const SP_BE = [18, 58, 5, 207, 40, 6, 57, 90];
export const beDrucken = sicher(beDruckenBlatt);
function beDruckenBlatt(d, b) {
  const bd = b.daten || {};
  const art = bestellart(d, b);
  const mitPreis = art === "rohmaterial" || art === "za";
  const { an, tel, fax } = partnerInfo(d, b, bd.anschrift);
  const sb = sachbearbeiter();
  platz = { nr: b.nr, datum: datumText(b.datum), name: sb.name, kunde: (d.partnerMap.get(b.partner_id) || {}).name || "" };
  const pos = d.posJe.get(b.id) || [];
  const s = belegSumme(d, b);
  const heute = datumText(new Date().toISOString().slice(0, 10));
  const bloecke = pos.map((x, i) => {
    const a = d.artikelMap.get(x.artikel_id);
    const ai = artikelInfo(d, a, x);
    const xd = x.daten || {};
    const vorschrift = xd.vorschrift || bd.vorschrift || "";
    const zusatz = [((a && a.daten) || {}).text, x.text && a ? x.text : ""].filter(Boolean).join("\n");
    const pt = "padding-top:6pt";
    const preisZellen = mitPreis
      ? "<td class='r nw' style='" + pt + "'>" + chf(x.preis).replace(".", ",") + "</td><td></td><td style='" + pt + ";padding-left:12pt'>" + peZahl(x)
        + "</td><td class='r' style='" + pt + "'>" + chf(posBetrag(x)) + "</td>"
      : "<td></td><td></td><td></td><td></td>";
    const angaben = art === "rohmaterial"
      ? (zusatz ? "<div style='white-space:pre-line'>" + esc(zusatz) + "</div>" : "")
        + det([["Werkst. Nr.", ai.wnr], ["Ausführung", xd.ausfuehrung || ""], ["Komm. Nr.", xd.komm || ""]], 63, 16)
      : det([["Werkstoff", ai.werkstoff], ["Zeichnung", ai.zeichnung], ["Ident-Nr.", ai.ident], ["Artikel-Code", ai.code]], 63, 16)
        + (zusatz ? "<div style='white-space:pre-line'>" + esc(zusatz) + "</div>" : "");
    const vor = vorschrift ? (art === "za"
      ? "<tr><td colspan='3'></td><td colspan='5'><div class='strich' style='margin-top:6pt;padding-top:3pt'><b>Bearbeitungsvorschrift:</b></div>"
        + "<div style='white-space:pre-line'>" + esc(vorschrift) + "</div><div class='strich' style='margin-top:9pt'></div></td></tr>"
      : "<tr><td colspan='8'><div class='strich' style='margin-top:9pt;padding-top:3pt'><b>Bearbeitungsvorschrift:</b></div>"
        + "<div style='white-space:pre-line;margin-top:2pt'>" + esc(vorschrift) + "</div><div class='strich' style='margin:9pt 0 0 0;width:72%'></div></td></tr>") : "";
    return "<table class='sp pos" + (i ? " strich" : "") + "'>" + colgroup(SP_BE)
      + "<tr><td colspan='8' style='padding:5pt 0 0 2pt'>" + (i + 1) + "</td></tr>"
      + "<tr><td colspan='2' class='nw' style='padding:6pt 0 0 2pt'>" + mengeText(x.menge) + " " + esc(x.einheit || "Stk") + "</td><td></td>"
      + "<td style='padding-top:6pt'>" + esc(ai.titel) + "</td>" + preisZellen + "</tr>"
      + "<tr><td colspan='3'></td><td colspan='5' style='padding-top:2pt'>" + angaben + "</td></tr>"
      + vor
      + "<tr><td colspan='3'></td><td colspan='5'>" + lieferplan(x, { datum: true, fettZeilen: art === "rohmaterial" }) + "</td></tr></table>";
  }).join("");
  const schluss = "<div class='linie' style='margin-top:2pt'></div>"
    + (art !== "auftrag_ls" ? "<table style='margin:4pt 0 0 auto' class='b'><tr><td>" + (art === "ls_bestellung" ? "" : "Netto-Warenwert in CHF") + "</td><td>:</td>"
      + "<td class='r' style='width:80pt'>" + (mitPreis ? chf(s.netto) : "") + "</td></tr></table>" : "")
    + absatz(text("be", "hinweis", { nr: b.nr }), art === "auftrag_ls" || art === "ls_bestellung" ? 36 : 12)
    + (mitPreis ? absatz(text("be", "ab_bitte"), 11) : "")
    + (art === "rohmaterial" && text("be", "lieferadresse") ? "<p class='b' style='margin:9pt 0 0'>" + text("be", "lieferadresse") + "</p>" : "")
    + (bd.text ? "<p style='white-space:pre-line;margin:8pt 0 0'>" + esc(bd.text) + "</p>" : "")
    + gruss("be", art === "auftrag_ls" || art === "ls_bestellung" ? 320 : 291, sb.name, 18);
  const titel = { rohmaterial: "Bestellung", za: "Bestellung", auftrag_ls: "Auftrag / Lieferschein", ls_bestellung: "Lieferschein zu Bestellung" }[art];
  const spalten = "<div class='linie'></div><table class='sp sp9' style='margin:3pt 0'>" + colgroup(SP_BE) + "<tr><th>POS</th><th style='padding-left:17pt'>MENGE</th><th></th>"
    + "<th style='padding-left:-1pt'>BENENNUNG</th>" + (mitPreis ? "<th class='nw'>E-PREIS</th><th></th><th>PRO</th><th class='r'>BETRAG (CHF)</th>" : "<th></th><th></th><th></th><th></th>")
    + "</tr></table><div class='linie'></div>";
  const roh = art === "rohmaterial";
  const zert = roh ? text("be", "zertifikat") : null;
  return blattOeffnen({
    titel: titel + " " + b.nr,
    kopf: {
      titel, codes: roh && schalter("be", "codes") ? [b.nr] : null, codeX: 93, oben: roh ? 28 : 67, hoehe: roh ? 161 : 201, kl: 88, kc: 8,
      links: [["Bestell-Nr", b.nr, "wert"], [mitPreis ? "Bestelldatum" : "Datum", datumText(b.datum)], ["Sachbearbeiter", sb.name], ["Telefon", sb.tel],
        ["Telefax", sb.fax], ["E-Mail", sb.mail], mitPreis ? ["Druckdatum", heute] : null],
      adresse: adresseText(an), rechtsOben: 83, rl: 72, rc: 12,
      rechts: [["Telefon", tel], ["Telefax", fax]],
      nach: zert ? { y: 144, html: "<b style='font-size:11pt'>" + zert + "</b>" } : null,
    },
    spalten, inhalt: bloecke + schluss, form: "be",
  });
}

// =================================================================
//  ANGEBOT (aus der Kalkulation)
//  k = Kalkulation, nr = Angebots-Nr., zeilen = [{ menge, preis, waehrung, pe }]
// =================================================================
const SP_AN = [42, 51, 8, 42, 102, 6, 59, 20, 151];
export const angebotDrucken = sicher(angebotDruckenBlatt);
function angebotDruckenBlatt({ k, nr, zeilen, adresse, datumText: dt }) {
  const sb = sachbearbeiter();
  const kopf = k.kopf || {};
  platz = { nr: nr || "", datum: dt(new Date().toISOString().slice(0, 10)), name: sb.name, kunde: String(adresse || "").split("\n")[0] };
  const ag = k.angebot || {};
  const zeichnung = (kopf.zeichnung || "") + (kopf.index ? " / Index: " + kopf.index : "");
  const teil = det([["Bezeichnung", kopf.bezeichnung, true], ["Werkstoff", (k.material || {}).bez, true], ["Artikel-Code", kopf.artikel, true],
    ["Ident - Nr.", kopf.ident || " ", true], ["Zeichnung", zeichnung, true]], 89, 12);
  const preise = "<table class='sp'>" + colgroup(SP_AN)
    + zeilen.map((r, i) => "<tr style='height:25.5pt'><td>" + (i + 1) + "</td><td class='r'>" + esc(r.menge) + "</td><td></td><td>Stk</td>"
      + "<td class='r'>" + esc(r.preis) + "</td><td></td><td>" + esc(r.waehrung) + "</td><td class='r'>" + esc(r.pe) + "</td><td></td></tr>").join("")
    + "</table>";
  const inhalt = (kopf.anfrage ? "<p class='b' style='margin:0 0 15pt'>Ihre Anfrage vom " + esc(dt(kopf.anfrage)) + "</p>" : "<div style='height:27pt'></div>")
    + "<div class='linie'></div><div style='padding:6pt 0 4pt'>" + teil + "</div><div class='linie'></div>"
    + "<table class='sp sp9' style='margin:2pt 0'>" + colgroup(SP_AN) + "<tr><th>POS</th><th class='r'>MENGE</th><th></th><th>ME</th>"
    + "<th colspan='3' style='padding-left:44pt'>Preis (exkl. MwSt.)</th><th>PRO</th><th></th></tr></table><div class='linie'></div>"
    + "<div style='padding-top:3pt'>" + preise + "</div><div class='linie' style='margin-top:4pt'></div>"
    + "<div style='margin-top:30pt'>" + det([["Lieferfrist", ag.lieferzeit], ["Lieferbedingung", ag.lieferbed], ["Versandbedingung", ag.versand], ["Zahlungsbedingung", ag.zahlung]], 89, 12) + "</div>"
    + (ag.gueltig ? "<p style='white-space:pre-line;margin:12pt 0 0'>" + esc(ag.gueltig) + "</p>" : "")
    + absatz(text("an", "schluss"), 7)
    + gruss("an", 291, sb.name, 72);
  return blattOeffnen({
    titel: "Angebot " + (nr || ""),
    kopf: {
      titel: "Angebot", oben: 75, hoehe: 199, kl: 89, kc: 12,
      links: [["Angebots-Nr.", nr || "", "wert"], ["Datum", dt(new Date().toISOString().slice(0, 10))], ["Sachbearbeiter", sb.name], ["Telefon", sb.tel],
        ["Telefax", sb.fax], ["E-Mail", sb.mail]],
      adresse: adresse, rechtsX: 291, rechtsOben: 59, rl: 83, rc: 11,
      rechts: [["Ihr Zeichen", kopf.zeichen], ["Kundennummer", kopf.kundencode], ["Telefon", kopf.telefon], ["Telefax", kopf.fax]],
    },
    inhalt, form: "an",
  });
}


// =================================================================
//  VORSCHAU für den Designer: zeichnet ein Formular mit Beispieldaten
//  und dem Entwurf (noch nicht gespeichert) und gibt das HTML zurück
// =================================================================
export function formularVorschau(form, entwurf, bestellartWahl = "rohmaterial") {
  const heute = new Date().toISOString().slice(0, 10);
  const kunde = { id: "vk", nr: "10001", name: "Muster AG", daten: { adresse: { strasse: "Musterstrasse 1", plz: "4500", ort: "Solothurn" }, telefon: "032 000 00 00", versand: "Post" } };
  const artikel = { id: "va", nr: "A-1000", bezeichnung: "Musterteil Ø 12 x 40", art: form === "be" ? "rohmaterial" : "teil", daten: { material: "1.4305", gewicht: 0.02 } };
  const ab = { id: "vab", typ: "auftrag", nr: "2026000001", datum: heute, partner_id: "vk", daten: {} };
  const ls = { id: "vls", typ: "lieferschein", nr: "2026000002", datum: heute, partner_id: "vk", bezug_id: "vab", daten: { verpackung: "Karton" } };
  const re = { id: "vre", typ: "rechnung", nr: "2026000003", datum: heute, partner_id: "vk", bezug_id: "vls", daten: {} };
  const be = { id: "vbe", typ: "bestellung", nr: "2026000004", datum: heute, partner_id: "vk", daten: { bestellart: bestellartWahl } };
  const pab = { id: "pab", beleg_id: "vab", artikel_id: "va", menge: 1000, einheit: "Stk", preis: 0.85, termin: heute, daten: {} };
  const pls = { id: "pls", beleg_id: "vls", artikel_id: "va", menge: 1000, einheit: "Stk", preis: 0.85, bezug_id: "pab", daten: {} };
  const pre = { id: "pre", beleg_id: "vre", artikel_id: "va", menge: 1000, einheit: "Stk", preis: 0.85, bezug_id: "pls", daten: {} };
  const pbe = { id: "pbe", beleg_id: "vbe", artikel_id: "va", menge: 50, einheit: "m", preis: 12.4, termin: heute, daten: {} };
  const belege = [ab, ls, re, be];
  const positionen = [pab, pls, pre, pbe];
  const d = {
    partnerMap: new Map([["vk", kunde]]), artikelMap: new Map([["va", artikel]]),
    belegMap: new Map(belege.map((b) => [b.id, b])), posMap: new Map(positionen.map((p) => [p.id, p])),
    posJe: new Map(belege.map((b) => [b.id, positionen.filter((p) => p.beleg_id === b.id)])),
    positionen, belege, bedingungen: [],
  };
  vorschau = entwurf || {};
  try {
    if (form === "re") return reDruckenBlatt(d, re);
    if (form === "ls") return lsDruckenBlatt(d, ls);
    if (form === "ab") return abDruckenBlatt(d, ab);
    if (form === "be") return beDruckenBlatt(d, be);
    return angebotDruckenBlatt({
      k: { kopf: { bezeichnung: "Musterteil Ø 12 x 40", artikel: "A-1000", zeichnung: "Z-123" }, material: { bez: "1.4305" }, angebot: { lieferzeit: "4 Wochen" } },
      nr: "20260001", adresse: "Muster AG\nMusterstrasse 1\n4500 Solothurn", datumText,
      zeilen: [{ menge: "1'000", preis: "0.85", waehrung: "CHF", pe: "1" }],
    });
  } catch (e) {
    return "<p style='font:14px Arial;padding:20px;color:#b00'>Vorschau nicht möglich: " + esc((e && e.message) || String(e)) + "</p>";
  } finally { vorschau = null; }
}
