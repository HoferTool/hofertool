// =================================================================
//  QM alternativ: Daten und Regeln (seit 1.463.0, Wunsch Patrick
//  10. November 2026: „unternehmensbezogenes QM-System, mindestens für
//  eine Zertifizierung, ISO 9001:2026 kompatibel … praxisbezogen, alles
//  soll unsere Effizienz steigern“)
//
//  Unabhängig vom Reiter QM. Zwei Tabellen aus sql/qm-alternativ.sql,
//  lesbar nur mit dem Vermerk qmSehen (qm_darf()):
//    qma_texte     – das schlanke Handbuch: Abschnitte und Prozesse
//    qma_eintraege – alle Listen in einer Tabelle, je Zeile eine "art"
//  Inhalte stehen nur in der Datenbank. Hier steht nur der Aufbau: welche
//  Listen es gibt, welche Felder sie haben und wann etwas fällig ist.
//
//  Grundsatz (Patrick: „ich bin ein Pragmatiker“): nur was die Norm
//  verlangt oder im Alltag hilft. Was das HoferTool schon führt (Planwand,
//  Einrichtblatt, Werkzeugwechsel, Wartung, Bestellungen, QS-Meldungen,
//  Keyence), wird nicht doppelt geführt, sondern als Nachweis genannt.
//  8.3 Entwicklung ist nicht anwendbar (reiner Lohnfertiger).
// =================================================================
import { alt } from "../bruecke.jsx";

export const heute = () => alt.isoDatum(new Date());
export function plusMonate(iso, n) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso) || !n) return null;
  const [j, m, t] = iso.slice(0, 10).split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1 + Number(n), 1));
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(t, letzter));
  return d.toISOString().slice(0, 10);
}
export function plusTageIso(iso, n) {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const datumOk = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || "") ? x : null);

// ---------- Handbuch ----------
// Die Abschnitte stehen fest im Aufbau, ihr Text nur in der Datenbank.
export const ABSCHNITTE = [
  { k: "unternehmen", titel: "Unternehmen", norm: "4.1", hilfe: "Wer wir sind, was wir können, wohin wir wollen." },
  { k: "geltungsbereich", titel: "Geltungsbereich", norm: "4.3", hilfe: "Was das QM-System umfasst und was nicht anwendbar ist (8.3 Entwicklung)." },
  { k: "kontext", titel: "Kontext: interne und externe Themen", norm: "4.1", hilfe: "Was uns beeinflusst: Markt, Kunden, Personal, Technik, Energie, Klimawandel." },
  { k: "parteien", titel: "Interessierte Parteien", norm: "4.2", hilfe: "Wer etwas von uns erwartet und was. Eine Zeile je Partei." },
  { k: "kultur", titel: "Führung, Qualitätskultur und ethisches Verhalten", norm: "5.1", hilfe: "Wie die Geschäftsleitung Qualität vorlebt. Neu in ISO 9001:2026." },
  { k: "politik", titel: "Qualitätspolitik", norm: "5.2", hilfe: "Kurz, ehrlich, an der Wand verständlich." },
  { k: "organisation", titel: "Rollen und Verantwortung", norm: "5.3", hilfe: "Wer entscheidet was. Kein Organigramm-Theater." },
  { k: "aenderungen", titel: "Planung von Änderungen", norm: "6.3", hilfe: "Wie wir grössere Änderungen (neue Maschine, neues Programm, neue Abläufe) planen." },
  { k: "ressourcen", titel: "Ressourcen, Infrastruktur, Umgebung", norm: "7.1", hilfe: "Maschinen, Gebäude, IT, Klima in der Halle." },
  { k: "wissen", titel: "Wissen der Organisation", norm: "7.1.6", hilfe: "Wo unser Wissen steckt, damit es nicht mit einer Person geht." },
  { k: "kommunikation", titel: "Kommunikation", norm: "7.4", hilfe: "Was, wann, mit wem, wie." },
  { k: "dokumente", titel: "Dokumentierte Information", norm: "7.5", hilfe: "Wo was abgelegt ist und wie lange." },
  { k: "kennzeichnung", titel: "Kennzeichnung, Kundeneigentum, Verpackung", norm: "8.5.2–8.5.4", hilfe: "Rückverfolgbarkeit über FA Nr., Umgang mit Kundenmaterial, Schutz beim Versand." },
  { k: "kundenzufriedenheit", titel: "Kundenzufriedenheit", norm: "9.1.2", hilfe: "Wie wir wissen, ob Kunden zufrieden sind, ohne Fragebogen-Leerlauf." },
];

// Ebenen wie Patricks Landkarte „Hofer + Co Management-System“ (Ellipse):
// 01 Führung in der Mitte, 02 Prozesse im Ring darum, 03 QM-System,
// 04 Hofer + Co im Kontext (interessierte Parteien) aussen.
export const PROZESS_GRUPPEN = [
  ["fuehrung", "Ebene 01 Führung"],
  ["kern", "Ebene 02 Prozesse"],
];
export const ebeneVon = (p) => ((p && p.gruppe) === "fuehrung" ? "fuehrung" : "kern");
// Ebene 03: Teile des QM-Systems, die hier eigene Reiter sind.
export const QM_SYSTEM = [
  { reiter: "bewertung", text: "Management-Bewertung", norm: "9.3" },
  { reiter: "risiko", text: "Risiko / Massnahmen", norm: "6.1 · 10.2" },
  { reiter: "ziel", text: "Ziele", norm: "6.2" },
  { reiter: "audit", text: "Audits", norm: "9.2" },
  { reiter: "handbuch", text: "Dokumente - Daten", norm: "7.5", abschnitt: "dokumente" },
];
// Ebene 04: Vorgabe, solange in qma_texte „landkarte“ nichts steht.
export const PARTEIEN_VORGABE = ["Kunden", "Bank", "Gesetze, Richtlinien", "Gesellschaft", "Lieferanten",
  "Gem. nütz. Org.", "Kapitalgeber, Inhaber", "Mitarbeiter"];
// Stufen E und A wie im Kontext-Blatt (1 gering, 3 mittel, 5 hoch, dazwischen 2 und 4)
export const EA_STUFEN = [["1", "1 gering"], ["2", "2"], ["3", "3 mittel"], ["4", "4"], ["5", "5 hoch"]];
// Anspruchsgruppen = Parteien der Landkarte, dazu allgemeine und interne Themen.
// qmaLaden hält die Liste aktuell, damit das Fenster sie ohne Umweg kennt.
export const PARTEI_WEITERE = ["Allgemeine Themen", "Intern / Prozesse"];
let parteienJetzt = PARTEIEN_VORGABE;
export const parteienVon = (texte) => (texte && texte.landkarte && texte.landkarte.felder && texte.landkarte.felder.parteien) || PARTEIEN_VORGABE;
export const parteiListe = () => [...parteienJetzt, ...PARTEI_WEITERE];
export const parteiAuswahl = () => parteiListe().map((x) => [x, x]);
export const PROZESS_FELDER = [
  { k: "zweck", text: "Zweck" },
  { k: "verantwortlich", text: "Verantwortlich" },
  { k: "eingaben", text: "Auslöser / Eingaben" },
  { k: "ablauf", text: "Ablauf", lang: true },
  { k: "ergebnisse", text: "Ergebnis" },
  { k: "nachweis", text: "Nachweis (wo im HoferTool)", lang: true },
  { k: "kennzahl", text: "Kennzahl" },
  { k: "risiken", text: "Typische Risiken" },
  { k: "dokumente", text: "Mitgeltende Dokumente", lang: true },
];

// ---------- Normkorrelation ----------
// Kapitel aus einem Text wie "8.5.1 · 8.6, 8.7" oder "8.5.2–8.5.4" (Bereich:
// Anfang und Ende genügen, weil Prozesse meist das Oberkapitel nennen).
export function normListe(s) {
  return String(s || "").split(/[·,;\s–-]+/).map((x) => x.trim()).filter((x) => /^\d+(\.\d+)*$/.test(x));
}
// Deckt ein Prozess mit diesen Kapiteln das Kapitel ab? 8.5 deckt 8.5.1, und
// ein Prozess mit 9.1.2 zählt für die Zeile 9.1.
const passt = (p, k) => p === k || p.startsWith(k + ".") || k.startsWith(p + ".");
export function deckt(prozessNorm, kapitel) {
  const ps = normListe(prozessNorm), ks = normListe(kapitel);
  return ps.some((p) => ks.some((k) => passt(p, k)));
}
export const prozessNr = (p) => (p && p.felder && p.felder.nr) || "";
export const prozesseSortiert = (texte) => Object.values(texte).filter((t) => String(t.schluessel).startsWith("prozess:"))
  .sort((a, b) => (a.sort || 0) - (b.sort || 0));

// ---------- Auditplan (FO_03_05_03_01_00) ----------
// Zeilen wie in Patricks Plan; änderbar in qma_texte „auditplan“ (felder.bereiche).
export const AUDIT_BEREICHE_VORGABE = ["Verkauf", "AVOR", "Beschaffung", "Produktion", "Logistik", "Produktionsmittel", "Prüfmittel",
  "Produktüberwachung / QS", "Abweichungsbehandlung", "Infrastruktur", "EDV / Daten", "Finanzen", "Organisation", "Personal",
  "Strategie / Leitbild", "Hofer + Co Kontext / Risiken", "Arbeitssicherheit"];
let auditBereicheJetzt = AUDIT_BEREICHE_VORGABE;
export const auditBereicheVon = (texte) => (texte && texte.auditplan && texte.auditplan.felder && texte.auditplan.felder.bereiche) || AUDIT_BEREICHE_VORGABE;
export const auditBereiche = () => auditBereicheJetzt;
// „2027-Q2“, „Q2/27“, „2027 Q2“ → „2027-Q2“; sonst null
export function quartalNorm(x) {
  const t = String(x || "").trim().toUpperCase();
  let m = t.match(/^(\d{4})\s*[-/ ]?\s*Q([1-4])$/);
  if (m) return m[1] + "-Q" + m[2];
  m = t.match(/^Q([1-4])\s*[-/ ]\s*(\d{2,4})$/);
  if (m) return (m[2].length === 2 ? "20" + m[2] : m[2]) + "-Q" + m[1];
  return null;
}
export const quartalVonDatum = (iso) => (/^\d{4}-\d{2}/.test(iso || "") ? iso.slice(0, 4) + "-Q" + (Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1) : null);
export function quartalEnde(q) {
  const n = quartalNorm(q);
  if (!n) return null;
  const j = Number(n.slice(0, 4)), k = Number(n.slice(-1));
  return [j + "-03-31", j + "-06-30", j + "-09-30", j + "-12-31"][k - 1];
}
// Wo ein Audit im Plan steht: Quartal aus dem Datum, sonst aus dem Feld Quartal
export const auditQuartal = (e) => quartalVonDatum((e.daten || {}).datum) || quartalNorm((e.daten || {}).quartal);
export const auditBereicheVonEintrag = (e) => {
  const d = e.daten || {};
  return [d.bereich, ...String(d.weitere || "").split(/[,;]/)].map((x) => String(x || "").trim()).filter(Boolean);
};
// Externe Audits ohne Bereich (Zertifizierung, Kunde) bekommen eine eigene Zeile
// Berichtsdateien den Audits zuteilen (seit 1.468.0): zuerst gleicher
// Dateiname wie beim Audit vermerkt (bericht_datei), sonst gleiches Datum im
// Namen und die meisten gleichen Wörter mit Titel und Bereich. Jedes Audit
// höchstens einmal. Gibt je Datei das Audit oder null zurück.
const berichtNorm = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\.(pdf|png|jpe?g)$/, "");
const berichtWoerter = (t) => berichtNorm(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w) &&
  !["internes", "intenes", "audit", "visiert", "pdf"].includes(w));
const berichtDatum = (t) => { const m = String(t || "").match(/(20\d\d)[-._ ](\d\d)[-._ ](\d\d)/); return m ? m[1] + "-" + m[2] + "-" + m[3] : ""; };
export function berichteZuteilen(namen, audits) {
  const vergeben = new Set();
  const ergebnis = namen.map(() => null);
  const gleich = (a, b) => berichtNorm(a).replace(/[^a-z0-9]/g, "") === berichtNorm(b).replace(/[^a-z0-9]/g, "");
  namen.forEach((n, i) => {
    const e = audits.find((a) => !vergeben.has(a.id) && a.daten && a.daten.bericht_datei && gleich(a.daten.bericht_datei, n));
    if (e) { ergebnis[i] = e; vergeben.add(e.id); }
  });
  namen.forEach((n, i) => {
    if (ergebnis[i]) return;
    const dat = berichtDatum(n);
    if (!dat) return;
    const w = berichtWoerter(n);
    let best = null, punkte = -1;
    for (const a of audits) {
      if (vergeben.has(a.id) || (a.daten || {}).datum !== dat) continue;
      const text = berichtNorm([a.titel, a.daten.bereich, a.daten.bericht_datei, a.daten.weitere].join(" "));
      const p = w.filter((x) => text.includes(x.slice(0, 5))).length;
      if (p > punkte) { best = a; punkte = p; }
    }
    if (best) { ergebnis[i] = best; vergeben.add(best.id); }
  });
  return ergebnis;
}

export const auditExtern = (e) => ["zert", "kunde"].includes((e.daten || {}).art) && !auditBereicheVonEintrag(e).length;

// ---------- Listen ----------
// Je Art: Felder für das Fenster, Spalten für die Tabelle, Status und wann
// etwas fällig ist. offen(e) = gehört noch auf das Cockpit.
const S = (wert, text, ton) => ({ wert, text, ton });

export const ARTEN = {
  abweichung: {
    titel: "Abweichungen und Verbesserungen", einzeln: "Eintrag", norm: "8.7 · 10.2 · 10.3",
    hinweis: "Eine Liste für alles, was schiefging oder besser werden kann: Kundenreklamation, Lieferantenfehler, interner Fehler, Auditfeststellung, Idee. Fertig ist ein Eintrag erst, wenn die Wirkung geprüft ist.",
    felder: [
      { k: "quelle", text: "Art", auswahl: [["kunde", "Kundenreklamation"], ["lieferant", "Lieferantenfehler"], ["intern", "Interner Fehler"],
        ["audit", "Auditfeststellung"], ["idee", "Verbesserungsidee"], ["risiko", "Aus Risiko / Chance"], ["bewertung", "Aus Managementbewertung"]], vorgabe: "intern" },
      { k: "datum", text: "Datum", typ: "date", vorgabe: () => heute() },
      { k: "titel", text: "Was ist passiert / Idee", pflicht: true },
      { k: "hoco", text: "HOCO Nr. / FA Nr.", platzhalter: "falls ein Teil betroffen ist" },
      { k: "partner", text: "Kunde / Lieferant" },
      { k: "menge", text: "Betroffene Stück", typ: "number" },
      { k: "sofort", text: "Sofortmassnahme (Teile sperren, sortieren, nacharbeiten, Kunde informieren)", typ: "textarea" },
      { k: "ursache", text: "Ursache (5 × Warum)", typ: "textarea" },
      { k: "massnahme", text: "Massnahme gegen die Ursache", typ: "textarea" },
      { k: "wer", text: "Wer" },
      { k: "termin", text: "Bis wann", typ: "date" },
      { k: "kosten", text: "Fehlerkosten CHF (geschätzt)", typ: "number", platzhalter: "zeigt, wo es sich lohnt" },
      { k: "pruef_am", text: "Wirksamkeit prüfen am", typ: "date" },
      { k: "wirksamkeit", text: "Wirksamkeit: wie geprüft, Ergebnis", typ: "textarea" },
    ],
    status: [S("offen", "Offen", "rot"), S("laeuft", "In Arbeit", "blau"), S("umgesetzt", "Umgesetzt, Wirkung prüfen", "gelb"),
      S("wirksam", "Wirksam, abgeschlossen", "gruen"), S("unwirksam", "Nicht wirksam", "rot"), S("keine", "Keine Massnahme nötig", "grau")],
    zu: ["wirksam", "keine"],
    faellig: (d, s) => s === "umgesetzt" ? (d.pruef_am || plusTageIso(d.termin || heute(), 30)) : (["offen", "laeuft", "unwirksam"].includes(s) ? d.termin || null : null),
    spalten: [["nr", "Nr."], ["datum", "Datum"], ["quelle", "Art"], ["titel", "Was"], ["massnahme", "Massnahme"], ["wer", "Wer"], ["faellig", "Fällig"], ["status", "Status"]],
  },
  ziel: {
    titel: "Qualitätsziele", einzeln: "Ziel", norm: "6.2",
    hinweis: "Wenige Ziele, die messbar sind und uns weiterbringen. Je Ziel: woran wir es messen, was wir dafür tun, wer, bis wann.",
    felder: [
      { k: "jahr", text: "Jahr", typ: "number", vorgabe: () => new Date().getFullYear() },
      { k: "titel", text: "Ziel", pflicht: true, platzhalter: "Kundenreklamationen halbieren" },
      { k: "messung", text: "Woran gemessen" },
      { k: "zielwert", text: "Zielwert" },
      { k: "ist", text: "Ist" },
      { k: "plan", text: "Was wir dafür tun", typ: "textarea" },
      { k: "wer", text: "Wer" },
      { k: "termin", text: "Bis wann", typ: "date" },
    ],
    status: [S("offen", "Offen", "blau"), S("laeuft", "Auf Kurs", "gelb"), S("erreicht", "Erreicht", "gruen"), S("verfehlt", "Verfehlt", "rot")],
    zu: ["erreicht", "verfehlt"],
    faellig: (d) => d.termin || null,
    spalten: [["jahr", "Jahr"], ["titel", "Ziel"], ["messung", "Messung"], ["zielwert", "Ziel"], ["ist", "Ist"], ["wer", "Wer"], ["faellig", "Bis"], ["status", "Status"]],
  },
  risiko: {
    titel: "Kontext, Risiken und Chancen", einzeln: "Thema", norm: "4.1 · 4.2 · 6.1",
    hinweis: "Wie das Blatt „Kontext der Organisation“ (04_01_00): je Anspruchsgruppe die Themen, Risiko (R) oder Chance (C). E = Wahrscheinlichkeit der Entwicklung, A = Einfluss auf Hofer + Co, je 1 gering, 3 mittel, 5 hoch; R = E × A. Grün bis 4 kein Handlungsbedarf, gelb 5 bis 9 beobachten, rot ab 10 Handlungsbedarf. Einmal im Jahr neu beurteilen.",
    felder: [
      { k: "partei", text: "Anspruchsgruppe", auswahl: () => parteiAuswahl(), vorgabe: "Intern / Prozesse" },
      { k: "titel", text: "Thema", pflicht: true },
      { k: "anspruch", text: "Anspruch / Einfluss", typ: "textarea", zeilen: 2 },
      { k: "typ", text: "Risiko / Chance", auswahl: [["risiko", "R Risiko"], ["chance", "C Chance"], ["beides", "R/C beides"]], vorgabe: "risiko" },
      { k: "prozess", text: "Bereich / Prozess" },
      { k: "folge", text: "Ursache und Folge", typ: "textarea", zeilen: 2 },
      { k: "aufnahme", text: "Aufgenommen am", typ: "date", vorgabe: () => heute() },
      { k: "w", text: "Erstbeurteilung E (Wahrscheinlichkeit)", auswahl: EA_STUFEN, vorgabe: "3" },
      { k: "a", text: "Erstbeurteilung A (Einfluss)", auswahl: EA_STUFEN, vorgabe: "3" },
      { k: "massnahme", text: "Massnahmenansatz", typ: "textarea" },
      { k: "wer", text: "Verantwortlich" },
      { k: "termin", text: "Termin (Datum oder „laufend“)" },
      { k: "fortschritt", text: "Stand der Massnahme", auswahl: [["", "–"], ["0", "0 %"], ["25", "25 %"], ["50", "50 %"], ["75", "75 %"], ["100", "100 %"]], vorgabe: "" },
      { k: "begruendung", text: "Neubeurteilung: Begründung", typ: "textarea" },
      { k: "neu_w", text: "Neubeurteilung E", auswahl: [["", "–"], ...EA_STUFEN], vorgabe: "" },
      { k: "neu_a", text: "Neubeurteilung A", auswahl: [["", "–"], ...EA_STUFEN], vorgabe: "" },
      { k: "pruef_am", text: "Nächste Neubeurteilung", typ: "date", vorgabe: () => plusMonate(heute(), 12) },
    ],
    status: [S("beobachten", "Beobachten", "blau"), S("massnahme", "Massnahme läuft", "gelb"), S("erledigt", "Im Griff", "gruen")],
    zu: [],
    faellig: (d) => d.pruef_am || null,
    spalten: [["typ", "R/C"], ["titel", "Thema"], ["erst", "Erst"], ["wert", "Neu"], ["massnahme", "Massnahme"], ["wer", "Wer"], ["fortschritt", "Stand"], ["faellig", "Neu beurteilen"], ["status", "Status"]],
  },
  pruefmittel: {
    titel: "Prüfmittel", einzeln: "Prüfmittel", norm: "7.1.5",
    hinweis: "Alle Prüfmittel, mit denen Teile freigegeben werden. „Heute geprüft“ setzt die letzte Prüfung und rechnet die nächste.",
    felder: [
      { k: "inventar", text: "Inventar-Nr.", platzhalter: "PM-012" },
      { k: "titel", text: "Bezeichnung", pflicht: true, platzhalter: "Bügelmessschraube 0–25" },
      { k: "art", text: "Art", auswahl: [["messschieber", "Messschieber"], ["mikrometer", "Mikrometer / Bügelmessschraube"], ["lehre", "Lehre (Dorn, Ring, Gewinde)"],
        ["uhr", "Messuhr / Fühlhebel"], ["hoehe", "Höhenmessgerät"], ["optisch", "Optisch (Keyence, Profilprojektor)"], ["rauheit", "Rauheit"], ["anderes", "Anderes"]], vorgabe: "messschieber" },
      { k: "ort", text: "Standort / Maschine" },
      { k: "intervall", text: "Intervall in Monaten", typ: "number", vorgabe: 12 },
      { k: "letzte", text: "Letzte Prüfung", typ: "date" },
      { k: "durch", text: "Geprüft durch", auswahl: [["intern", "Intern mit Normal"], ["extern", "Externe Kalibrierstelle"]], vorgabe: "intern" },
      { k: "ergebnis", text: "Ergebnis / Notiz" },
    ],
    status: [S("aktiv", "In Gebrauch", "gruen"), S("gesperrt", "Gesperrt", "rot"), S("weg", "Ausgeschieden", "grau")],
    zu: ["gesperrt", "weg"],
    faellig: (d) => plusMonate(d.letzte || null, d.intervall || 12) || (d.letzte ? null : heute()),
    spalten: [["inventar", "Nr."], ["titel", "Bezeichnung"], ["ort", "Standort"], ["intervall", "Monate"], ["letzte", "Zuletzt"], ["faellig", "Nächste"], ["status", "Status"]],
    schnell: { text: "Heute geprüft", setzen: () => ({ letzte: heute() }) },
  },
  lieferant: {
    titel: "Lieferantenbewertung", einzeln: "Lieferant", norm: "8.4",
    hinweis: "Nur Lieferanten mit Einfluss auf die Qualität der Teile (Material, Werkzeug, Härten, Beschichten, Messen). Einmal im Jahr: Qualität, Termin, Zusammenarbeit je 1 (schlecht) bis 3 (gut). A = gut, B = beobachten, C = Gespräch oder Wechsel.",
    felder: [
      { k: "titel", text: "Lieferant", pflicht: true, liste: "lieferanten" },
      { k: "was", text: "Liefert", platzhalter: "Stangenmaterial V2A" },
      { k: "letzte", text: "Bewertet am", typ: "date", vorgabe: () => heute() },
      { k: "q", text: "Qualität 1–3", auswahl: [["3", "3 gut"], ["2", "2 genügend"], ["1", "1 schlecht"]], vorgabe: "3" },
      { k: "t", text: "Termintreue 1–3", auswahl: [["3", "3 gut"], ["2", "2 genügend"], ["1", "1 schlecht"]], vorgabe: "3" },
      { k: "z", text: "Zusammenarbeit / Preis 1–3", auswahl: [["3", "3 gut"], ["2", "2 genügend"], ["1", "1 schlecht"]], vorgabe: "3" },
      { k: "zeugnis", text: "Werkstoffzeugnisse / Zertifikat", auswahl: [["", "–"], ["ja", "Liegen vor"], ["nein", "Fehlen"]], vorgabe: "" },
      { k: "bemerkung", text: "Bemerkung / Massnahme", typ: "textarea" },
    ],
    status: [S("freigegeben", "Freigegeben", "gruen"), S("beobachten", "Beobachten", "gelb"), S("gesperrt", "Gesperrt", "rot")],
    zu: ["gesperrt"],
    faellig: (d) => plusMonate(d.letzte || null, 12) || heute(),
    spalten: [["titel", "Lieferant"], ["was", "Liefert"], ["note", "Note"], ["letzte", "Bewertet"], ["faellig", "Nächste"], ["status", "Status"]],
    schnell: { text: "Neu bewerten", dialog: true },
  },
  schulung: {
    titel: "Schulungen und Unterweisungen", einzeln: "Schulung", norm: "7.2 · 7.3",
    hinweis: "Was gelernt wurde und ob es gewirkt hat. Auch Einarbeitung neuer Leute und kurze Unterweisungen an der Maschine zählen.",
    felder: [
      { k: "titel", text: "Thema", pflicht: true },
      { k: "personen", text: "Wer hat teilgenommen" },
      { k: "art", text: "Art", auswahl: [["intern", "Intern"], ["extern", "Extern (Kurs, Lieferant)"], ["einarbeitung", "Einarbeitung"], ["unterweisung", "Unterweisung / Sicherheit"]], vorgabe: "intern" },
      { k: "datum", text: "Datum", typ: "date", vorgabe: () => heute() },
      { k: "pruef_am", text: "Wirkung prüfen am", typ: "date" },
      { k: "wirksamkeit", text: "Wirkung: wie geprüft, Ergebnis", typ: "textarea", platzhalter: "kann es selbständig, Einrichtblatt ohne Fehler …" },
    ],
    status: [S("geplant", "Geplant", "blau"), S("durchgefuehrt", "Durchgeführt, Wirkung prüfen", "gelb"), S("wirksam", "Wirksam", "gruen")],
    zu: ["wirksam"],
    faellig: (d, s) => s === "geplant" ? d.datum || null : (d.pruef_am || plusTageIso(d.datum || heute(), 60)),
    spalten: [["datum", "Datum"], ["titel", "Thema"], ["personen", "Wer"], ["art", "Art"], ["faellig", "Fällig"], ["status", "Status"]],
  },
  audit: {
    titel: "Audits", einzeln: "Audit", norm: "9.2",
    hinweis: "Alle Audits nach dem Auditplan: intern, Arbeitssicherheit, Zertifizierung und Kunden. Im Plan oben ein Feld antippen, um ein Audit vorzusehen oder zu öffnen. Feststellungen gehen mit einem Tipp in die Liste Abweichungen.",
    felder: [
      { k: "art", text: "Art", auswahl: [["intern", "Internes Audit"], ["as", "Arbeitssicherheit (Betriebsrundgang)"], ["zert", "Zertifizierung / Überwachung (SSC)"],
        ["kunde", "Kundenaudit"], ["lieferant", "Lieferantenaudit (bei uns gemacht)"]], vorgabe: "intern" },
      { k: "titel", text: "Prozesse / Thema", pflicht: true, platzhalter: "Fertigung und Prüfen" },
      { k: "bereich", text: "Bereich im Auditplan", auswahl: () => [["", "(keiner, ganze Firma)"], ...auditBereiche().map((x) => [x, x])], vorgabe: "" },
      { k: "weitere", text: "Weitere Bereiche im Plan (mit Komma)", platzhalter: "AVOR, Beschaffung" },
      { k: "quartal", text: "Quartal im Plan (ohne Datum)", platzhalter: "2027-Q2" },
      { k: "datum", text: "Datum", typ: "date" },
      { k: "auditor", text: "Auditor" },
      { k: "auditiert", text: "Auditierte Personen" },
      { k: "norm", text: "Normkapitel" },
      { k: "ergebnis", text: "Ergebnis, Stärken", typ: "textarea" },
      { k: "feststellungen", text: "Feststellungen / Massnahmen (eine je Zeile)", typ: "textarea", zeilen: 4 },
    ],
    status: [S("vorgesehen", "Vorgesehen", "rot"), S("geplant", "Terminiert", "blau"), S("durchgefuehrt", "Durchgeführt", "gruen")],
    zu: ["durchgefuehrt"],
    // Durchgeführt ist es erst fertig, wenn die Feststellungen übertragen sind
    fertig: (e) => e.status === "durchgefuehrt" && (!String((e.daten || {}).feststellungen || "").trim() || !!(e.daten || {}).uebertragen),
    faellig: (d, s) => (s === "vorgesehen" && !d.datum ? quartalEnde(d.quartal) : d.datum || quartalEnde(d.quartal)),
    spalten: [["datum", "Datum"], ["art", "Art"], ["titel", "Thema"], ["auditor", "Auditor"], ["feststellungen", "Feststellungen"], ["status", "Status"]],
  },
};

export const statusVon = (art, s) => (ARTEN[art] && ARTEN[art].status.find((x) => x.wert === s)) || { wert: s, text: s || "", ton: "grau" };
export const istZu = (e) => !ARTEN[e.art] ? e.status === "freigegeben"
  : ARTEN[e.art].fertig ? ARTEN[e.art].fertig(e) : ARTEN[e.art].zu.includes(e.status);
export const auswahlVon = (f) => (typeof f.auswahl === "function" ? f.auswahl() : f.auswahl);
export const auswahlText = (art, k, w) => {
  const f = ARTEN[art] && ARTEN[art].felder.find((x) => x.k === k);
  const a = f && f.auswahl && auswahlVon(f).find((x) => x[0] === String(w ?? ""));
  return a ? a[1] : (w ?? "");
};

// Wert Risiko und Note Lieferant
// R = E × A; gilt die Neubeurteilung, sobald beide Werte da sind.
export const risikoErst = (d) => Number(d.w || 0) * Number(d.a || 0);
export const hatNeu = (d) => Number(d.neu_w) > 0 && Number(d.neu_a) > 0;
export const risikoWert = (d) => (hatNeu(d) ? Number(d.neu_w) * Number(d.neu_a) : risikoErst(d));
// Ampel wie im Kontext-Blatt: grün kein Handlungsbedarf, gelb beobachten, rot Handlungsbedarf
export const risikoTon = (w) => (w >= 10 ? "rot" : w >= 5 ? "gelb" : "gruen");
export function lieferantNote(d) {
  const n = [d.q, d.t, d.z].map(Number).filter((x) => x > 0);
  if (!n.length) return "";
  if (n.includes(1)) return "C";
  return n.reduce((a, b) => a + b, 0) / n.length >= 2.67 ? "A" : "B";
}

// Ampel für das Fälligkeitsdatum: rot vorbei, gelb in 30 Tagen
export function faelligTon(e) {
  if (!e.faellig || istZu(e)) return null;
  const h = heute();
  if (e.faellig < h) return "rot";
  if (e.faellig <= plusTageIso(h, 30)) return "gelb";
  return null;
}

// ---------- Laden und Speichern ----------
export async function qmaLaden() {
  const [t, e] = await Promise.all([
    alt.db.from("qma_texte").select("*").order("sort", { ascending: true }),
    alt.db.from("qma_eintraege").select("*").order("erstellt_am", { ascending: true }),
  ]);
  const f = t.error || e.error;
  if (f) throw f;
  const texte = {};
  for (const z of t.data || []) texte[z.schluessel] = z;
  parteienJetzt = parteienVon(texte);
  auditBereicheJetzt = auditBereicheVon(texte);
  return { texte, eintraege: e.data || [] };
}
export const fehltQma = (f) => /qma_|does not exist|schema cache|42P01|PGRST20/i.test(String((f && (f.message || f.code)) || f || ""));

export async function textSpeichern(schluessel, zeile, rueckText) {
  const vorher = await alt.rueckSichern("qma_texte", { schluessel });
  const daten = { schluessel, ...zeile, geaendert_am: new Date().toISOString() };
  const { error } = await alt.db.from("qma_texte").upsert(daten, { onConflict: "schluessel" });
  if (error) throw error;
  alt.merkeSchritt(rueckText || "Ändern im Handbuch",
    vorher.length ? alt.rueckRein("qma_texte", vorher, "schluessel") : alt.rueckWeg("qma_texte", { schluessel }));
}

export async function textLoeschen(schluessel, rueckText) {
  const vorher = await alt.rueckSichern("qma_texte", { schluessel });
  const { error } = await alt.db.from("qma_texte").delete().eq("schluessel", schluessel);
  if (error) throw error;
  alt.merkeSchritt(rueckText || "Löschen im Handbuch", alt.rueckRein("qma_texte", vorher, "schluessel"));
}

// Fälligkeit und Titel aus den Feldern, dann speichern (mit Rückgängig)
export async function eintragSpeichern(art, alt_, daten, status, alle) {
  const cfg = ARTEN[art];
  const faellig = cfg ? datumOk(cfg.faellig(daten, status)) : null;
  const zeile = { art, titel: String(daten.titel || "").trim(), status, faellig, daten, geaendert_am: new Date().toISOString() };
  if (alt_) {
    const vorher = await alt.rueckSichern("qma_eintraege", { id: alt_.id });
    const { error } = await alt.db.from("qma_eintraege").update(zeile).eq("id", alt_.id);
    if (error) throw error;
    alt.merkeSchritt("Ändern: " + zeile.titel, alt.rueckRein("qma_eintraege", vorher));
    return alt_.id;
  }
  zeile.nr = Math.max(0, ...(alle || []).filter((x) => x.art === art).map((x) => x.nr || 0)) + 1;
  const { data, error } = await alt.db.from("qma_eintraege").insert(zeile).select("id");
  if (error) throw error;
  const id = Array.isArray(data) && data[0] && data[0].id;
  if (id) alt.merkeSchritt("Neu: " + zeile.titel, alt.rueckWeg("qma_eintraege", { id }));
  return id;
}

export async function eintragLoeschen(e) {
  const vorher = await alt.rueckSichern("qma_eintraege", { id: e.id });
  const { error } = await alt.db.from("qma_eintraege").delete().eq("id", e.id);
  if (error) throw error;
  alt.merkeSchritt("Löschen: " + (e.titel || ""), alt.rueckRein("qma_eintraege", vorher));
}

// ---------- Auswertung je Jahr (für Cockpit und Managementbewertung) ----------
const imJahr = (iso, j) => !!iso && String(iso).slice(0, 4) === String(j);
export function jahresBild(eintraege, jahr) {
  const von = (art) => eintraege.filter((e) => e.art === art);
  const abw = von("abweichung").filter((e) => imJahr(e.daten.datum || e.erstellt_am, jahr));
  const jeQuelle = {};
  for (const e of abw) jeQuelle[e.daten.quelle || "intern"] = (jeQuelle[e.daten.quelle || "intern"] || 0) + 1;
  const kosten = abw.reduce((s, e) => s + (Number(e.daten.kosten) || 0), 0);
  const ziele = von("ziel").filter((e) => String(e.daten.jahr) === String(jahr));
  const audits = von("audit").filter((e) => imJahr(e.daten.datum, jahr));
  const lief = von("lieferant").filter((e) => e.status !== "gesperrt" || imJahr(e.daten.letzte, jahr));
  const noten = { A: 0, B: 0, C: 0 };
  for (const e of lief) { const n = lieferantNote(e.daten); if (n) noten[n]++; }
  const risiken = von("risiko");
  const pm = von("pruefmittel").filter((e) => e.status === "aktiv" || !e.status);
  const schul = von("schulung").filter((e) => imJahr(e.daten.datum, jahr) && e.status !== "geplant");
  const h = heute();
  return {
    abweichungen: abw.length, jeQuelle, kosten,
    offen: von("abweichung").filter((e) => !istZu(e)).length,
    ueberfaellig: von("abweichung").filter((e) => !istZu(e) && e.faellig && e.faellig < h).length,
    wirksam: abw.filter((e) => e.status === "wirksam").length,
    ideen: abw.filter((e) => e.daten.quelle === "idee").length,
    ziele: ziele.length, zieleErreicht: ziele.filter((e) => e.status === "erreicht").length,
    zieleVerfehlt: ziele.filter((e) => e.status === "verfehlt").length, zieleListe: ziele,
    audits: audits.filter((e) => e.status === "durchgefuehrt").length,
    feststellungen: audits.reduce((s, e) => s + String(e.daten.feststellungen || "").split("\n").filter((z) => z.trim()).length, 0),
    lieferanten: lief.length, noten,
    lieferantenBewertet: lief.filter((e) => imJahr(e.daten.letzte, jahr)).length,
    risiken: risiken.length, risikenHoch: risiken.filter((e) => e.daten.typ !== "chance" && risikoWert(e.daten) >= 10).length,
    chancen: risiken.filter((e) => e.daten.typ === "chance").length,
    pruefmittel: pm.length, pruefmittelFaellig: pm.filter((e) => e.faellig && e.faellig < h).length,
    schulungen: schul.length,
  };
}

// ---------- Normabdeckung ----------
// Je Kapitel: wo wir es erfüllen und ob es gerade stimmt. ok / warn / fehlt / na
export function normPruefen(texte, eintraege) {
  const t = (k) => !!(texte[k] && String(texte[k].inhalt || "").trim());
  const von = (art) => eintraege.filter((e) => e.art === art);
  const ueber = (art) => von(art).filter((e) => !istZu(e) && e.faellig && e.faellig < heute()).length;
  const jahr = new Date().getFullYear();
  const prozesse = prozesseSortiert(texte);
  const fuer = (norm) => prozesse.filter((p) => deckt(p.norm, norm));
  const vorJahr = plusMonate(heute(), -12);
  const auditJ = von("audit").some((e) => e.daten.art === "intern" && e.status === "durchgefuehrt" && (e.daten.datum || "") >= vorJahr);
  const auditGeplant = von("audit").some((e) => e.daten.art === "intern" && ["geplant", "vorgesehen"].includes(e.status));
  const bewertung = von("bewertung").some((e) => e.status === "freigegeben" && (e.daten.datum || "") >= plusMonate(heute(), -13));
  const bewertungEntwurf = von("bewertung").some((e) => e.status !== "freigegeben");
  const matrix = texte.matrix && texte.matrix.felder && (texte.matrix.felder.personen || []).length;
  const besser = von("abweichung").some((e) => (e.daten.quelle === "idee" || e.status === "wirksam") && (e.daten.datum || "") >= vorJahr);
  // Jede Zeile nennt die Prozesse, die das Kapitel laut Normbezug abdecken.
  const z = (norm, titel, wo, stand, tipp) => ({ norm, titel, wo, stand, tipp, prozesse: norm === "8.3" ? [] : fuer(norm) });
  const zu = (b) => (b ? "ok" : "fehlt");
  const ohneUeber = (art, n) => !von(art).length ? "fehlt" : (n ? "warn" : "ok");
  return [
    z("4.1 · 4.2", "Kontext und interessierte Parteien", "Kontext und Risiken (je Anspruchsgruppe), Handbuch",
      von("risiko").some((e) => e.daten.partei && e.daten.partei !== "Intern / Prozesse") || (t("kontext") && t("parteien")) ? "ok" : "fehlt",
      "Themen je Anspruchsgruppe erfassen"),
    z("4.3", "Geltungsbereich", "Handbuch", zu(t("geltungsbereich")), "Abschnitt Geltungsbereich ausfüllen"),
    z("4.4", "Prozesse", "Handbuch → Prozesse", prozesse.length >= 3 ? "ok" : "fehlt", "Prozesse beschreiben"),
    z("5.1", "Führung und Qualitätskultur", "Handbuch", zu(t("kultur")), "Abschnitt Qualitätskultur ausfüllen"),
    z("5.2", "Qualitätspolitik", "Handbuch", zu(t("politik")), "Politik schreiben und aushängen"),
    z("5.3", "Rollen und Verantwortung", "Handbuch", zu(t("organisation")), "Rollen festhalten"),
    z("6.1", "Risiken und Chancen", "Kontext und Risiken", ohneUeber("risiko", ueber("risiko")), "Risiken erfassen, Fällige durchsehen"),
    z("6.2", "Qualitätsziele", "Ziele", von("ziel").some((e) => String(e.daten.jahr) === String(jahr)) ? "ok" : "fehlt", "Ziele für " + jahr + " setzen"),
    z("6.3", "Planung von Änderungen", "Handbuch", zu(t("aenderungen")), "Abschnitt Änderungen ausfüllen"),
    z("7.1.1", "Ressourcen allgemein", "Handbuch (Ressourcen) · Prozess Finanzen", zu(t("ressourcen") || fuer("7.1.1").length), "Abschnitt Ressourcen ausfüllen"),
    z("7.1.2", "Personen", "Prozess Personal", zu(fuer("7.1.2").length), "Prozess mit Normbezug 7.1.2 beschreiben"),
    z("7.1.3", "Infrastruktur, Instandhaltung", "HoferTool: Maschinen, Wartung, Backup-Batterien", "ok", ""),
    z("7.1.4", "Umgebung für die Prozesse", "Prozesse Produktion, Infrastruktur", zu(fuer("7.1.4").length), "Prozess mit Normbezug 7.1.4 beschreiben"),
    z("7.1.5", "Prüfmittel", "Prüfmittel", ohneUeber("pruefmittel", ueber("pruefmittel")), "Prüfmittel erfassen, Fällige prüfen"),
    z("7.1.6", "Wissen", "Handbuch · HoferTool: Einrichtblatt, Notizbücher, Unterlagen", zu(t("wissen")), "Abschnitt Wissen ausfüllen"),
    z("7.2 · 7.3", "Kompetenz und Bewusstsein", "Kompetenzen", matrix ? (ueber("schulung") ? "warn" : "ok") : "fehlt", "Kompetenzmatrix ausfüllen"),
    z("7.4", "Kommunikation", "Handbuch · HoferTool: Infoboard, Meldungen", zu(t("kommunikation")), "Abschnitt Kommunikation ausfüllen"),
    z("7.5", "Dokumentierte Information", "Handbuch · dieses QM im HoferTool", zu(t("dokumente")), "Abschnitt Dokumente ausfüllen"),
    z("8.1", "Betriebliche Planung", "HoferTool: Planwand, Material", "ok", ""),
    z("8.2", "Anforderungen an Produkte", "Prozess Verkauf · HoferTool: Kalkulation", fuer("8.2").length ? "ok" : "fehlt", "Prozess mit Normbezug 8.2 beschreiben"),
    z("8.3", "Entwicklung", "Nicht anwendbar: reiner Lohnfertiger nach Kundenzeichnung", "na", ""),
    z("8.4", "Externe Anbieter", "Lieferantenbewertung · HoferTool: Bestellungen", ohneUeber("lieferant", ueber("lieferant")), "Lieferanten bewerten"),
    z("8.5.1", "Produktion beherrschen", "HoferTool: Einrichtblatt, Werkzeugwechsel, Stückzahlen, Pad Mode", "ok", ""),
    z("8.5.2–8.5.4", "Kennzeichnung, Kundeneigentum, Erhaltung", "Handbuch · HoferTool: FA Nr., WBG", zu(t("kennzeichnung")), "Abschnitt Kennzeichnung ausfüllen"),
    z("8.5.5", "Tätigkeiten nach der Lieferung", "Prozess Logistik", zu(fuer("8.5.5").length), "Prozess mit Normbezug 8.5.5 beschreiben"),
    z("8.5.6", "Überwachung von Änderungen", "Prozess Produktion", zu(fuer("8.5.6").length), "Prozess mit Normbezug 8.5.6 beschreiben"),
    z("8.6", "Freigabe", "HoferTool: QS Check, Keyence Berichte", fuer("8.6").length ? "ok" : "fehlt", "Prozess mit Normbezug 8.6 beschreiben"),
    z("8.7", "Nichtkonforme Ergebnisse", "Abweichungen · HoferTool: QS-Meldungen", ueber("abweichung") ? "warn" : "ok", "Überfällige Abweichungen erledigen"),
    z("9.1", "Überwachung, Kundenzufriedenheit", "Ziele · Handbuch · HoferTool: Statistik", t("kundenzufriedenheit") ? "ok" : "fehlt", "Abschnitt Kundenzufriedenheit ausfüllen"),
    z("9.1.3", "Analyse und Bewertung", "Prozess Finanzen · Managementbewertung", zu(fuer("9.1.3").length || t("kundenzufriedenheit")), "Prozess mit Normbezug 9.1.3 beschreiben"),
    z("9.2", "Internes Audit", "Audits", auditJ ? "ok" : (auditGeplant ? "warn" : "fehlt"), "Internes Audit planen und durchführen"),
    z("9.3", "Managementbewertung", "Managementbewertung", bewertung ? "ok" : (bewertungEntwurf ? "warn" : "fehlt"), "Managementbewertung machen und freigeben"),
    z("10.2", "Korrekturmassnahmen", "Abweichungen", ueber("abweichung") ? "warn" : "ok", "Überfällige Massnahmen erledigen"),
    z("10.3", "Fortlaufende Verbesserung", "Abweichungen (Ideen, wirksame Massnahmen)", besser ? "ok" : "warn", "Verbesserungen festhalten"),
  ];
}
