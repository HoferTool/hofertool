// =================================================================
//  REKLAMATIONSMANAGEMENT, Reiter der Seite Qualitätssicherung
//  (seit 1.746.0, Wunsch Patrick 23. November 2026: „bei QS einen
//  weiteren Reiter, Reklamationsmanagement“).
//  Je Reklamation: von wem (Kunde, an Lieferant, intern), HOCO Nr.,
//  FA Nr., Teil, Mengen, Fehlerart und Beschreibung, Stand,
//  Verantwortlich, Termin und die Schritte wie im 8D-Bericht
//  (D1 Team bis D8 Wirksamkeit) zum Ankreuzen (`ACHT_D`, Spalte achtd), Kosten, Fotos und PDFs. Oben Zahlen, darunter die
//  Liste mit Filtern und Suche; „8D-Bericht“ macht ein PDF A4.
//  Tabelle reklamationen aus sql/reklamationen.sql (eingespielt), die
//  Nummer RKJJ-001 vergibt die Datenbank. Dateien in der Ablage
//  „zeichnungen“ unter reklamationen/<id>/. Nicht für Externe (die
//  sehen die Qualitätssicherung nicht, die Datenbank sperrt sie auch).
// =================================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { passtWoerter } from "../../teile/Suchfeld.jsx";
import { useSeitenSuche } from "../../teile/seitenSuche.js";
import { achtdVorschau } from "./achtdBlatt.js";
import { massnahmeVeroeffentlichen, quittungenFuerRk } from "../../planwand/QsMassnahmen.jsx";

export const ARTEN = [
  ["kunde", "Kundenreklamation"],
  ["lieferant", "Reklamation an Lieferant"],
  ["intern", "Interner Fehler"],
];
const ART_KURZ = { kunde: "Kunde", lieferant: "Lieferant", intern: "Intern" };
export const STAENDE = [
  ["offen", "Offen"],
  ["bearbeitung", "In Bearbeitung"],
  ["abgeschlossen", "Abgeschlossen"],
  ["abgelehnt", "Abgelehnt (nicht berechtigt)"],
];
const STAND_KURZ = { offen: "Offen", bearbeitung: "In Bearbeitung", abgeschlossen: "Abgeschlossen", abgelehnt: "Abgelehnt" };

// Die acht Schritte wie im klassischen 8D (seit 1.757.4 wieder so, Patrick
// 24. November 2026: „die 8D sollen wie vorher sein, nicht vom Doc, Team,
// Massnahmen“): D1 Team, D2 Problembeschreibung, D3 Sofortmassnahmen,
// D4 Ursache, D5 Abstellmassnahmen festlegen, D6 einführen, D7 Wiederholung
// verhindern, D8 Abschluss. Meist sind es dieselben Gründe und Massnahmen
// (Patrick: „viel mit Häkchen setzen“): je Schritt Punkte zum Ankreuzen,
// gespeichert in reklamationen.achtd[s], dazu das freie Feld „Anderes /
// Ergänzung“ (Spalte in `text`, sonst in kopf[`kopfText`]).
// Die festgelegten Massnahmen (D5) haben je ein Gegenstück für „eingeführt“
// (D6, MASSNAHMEN), damit „Wie geplant“ D6 in einem Zug ankreuzt.
// Dritter Wert: Gruppe zum Ankreuzen (seit 1.749.0, Patrick: „besser kategorisiert“)
export const MASSNAHMEN = [
  ["Teile müssen an der Maschine besser überwacht werden", "Teile werden in Zukunft besser überwacht", "Überwachung und Prüfung"],
  ["Endkontrolle verschärfen", "Endkontrolle wurde angepasst", "Überwachung und Prüfung"],
  ["Prüfintervall verkürzen", "Prüfintervall wurde verkürzt", "Überwachung und Prüfung"],
  ["Prüfplan ergänzen", "Prüfplan wurde ergänzt", "Überwachung und Prüfung"],
  ["Messmittel ersetzen / kalibrieren", "Messmittel wurde ersetzt / kalibriert", "Überwachung und Prüfung"],
  ["NC-Programm korrigieren", "NC-Programm wurde korrigiert", "Prozess und Maschine"],
  ["Werkzeug / Standzeit anpassen", "Werkzeug / Standzeit wurde angepasst", "Prozess und Maschine"],
  ["Maschine reparieren / einstellen", "Maschine wurde repariert / eingestellt", "Prozess und Maschine"],
  ["Dokumente anpassen", "Dokumente wurden angepasst", "Dokumente"],
  ["Einrichtblatt ergänzen", "Einrichtblatt wurde ergänzt", "Dokumente"],
  ["Verpackung anpassen", "Verpackung wurde angepasst", "Verpackung und Information"],
  ["Mitarbeiter informieren", "Alle nötigen Mitarbeiter wurden informiert", "Verpackung und Information"],
];
const massnahmenGruppen = (i) => {
  const g = [];
  for (const m of MASSNAHMEN) {
    let x = g.find((y) => y[0] === m[2]);
    if (!x) { x = [m[2], []]; g.push(x); }
    x[1].push(m[i]);
  }
  return g;
};
// Fehlerart und Fehlerort stehen in D2 zum Ankreuzen; die Fehlerart kommt
// auch in die Kachel oben im Bericht und in die Liste
export const FEHLERARTEN_8D = [
  ["Fehlerart: Mass und Form", ["Massfehler", "Form- / Lagefehler", "Gewindefehler"]],
  ["Fehlerart: Oberfläche", ["Oberflächenfehler / Kratzer / Schläge", "Grat", "Verschmutzung / Späne / Öl"]],
  ["Fehlerart: Teil und Menge", ["Falsches Material", "Teile vermischt / falsches Teil", "Mengenfehler"]],
  ["Fehlerart: Lieferung", ["Verpackungs- / Transportschaden", "Dokumente / Zeugnis fehlen"]],
];
// Fehlerart = Punkte der Gruppen in D2, deren Name mit „Fehlerart“ beginnt
// (aus der aktuellen, auch selbst bearbeiteten Liste)
const fehlerartPunkte = () => {
  const d2 = ACHT_D.find((d) => d.s === "d2");
  return new Set((d2 ? d2.gruppen : FEHLERARTEN_8D).filter((g) => /^fehlerart/i.test(g[0] || "")).flatMap((g) => g[1]));
};
export const fehlerartVon = (w) => {
  const fp = fehlerartPunkte();
  return ((w.achtd && Array.isArray(w.achtd.d2)) ? w.achtd.d2 : []).filter((p) => fp.has(p));
};
export const WIRKSAM = "Massnahmen wirksam";
// Je Schritt die Frage wie in einem Fragebogen (seit 1.749.0) und die Punkte
// in Gruppen; im Bericht stehen Gruppen nur, wo pdfGruppen gesetzt ist
export const ACHT_D = [
  { s: "d1", nr: 1, titel: "Team", kurz: "Team", kopfText: "team",
    frage: "Wer arbeitet an dieser Reklamation mit?", gruppen: [["", [
    "Geschäftsleitung", "Qualität", "Produktion / Mechaniker", "Einrichter", "AVOR / Programmierung",
    "Logistik / Versand", "Einkauf"]]] },
  { s: "d2", nr: 2, titel: "Problembeschreibung", kurz: "Problem", oben: "fehler", text: "fehlerart", pdfGruppen: true,
    frage: "Was genau ist das Problem, was für ein Fehler, und wo ist er entstanden?", gruppen: FEHLERARTEN_8D.concat([
    ["Fehlerort: Fertigung", ["Decolletage", "Nachbearbeitung", "Waschen / Reinigen"]],
    ["Fehlerort: Prüfung und Versand", ["Endkontrolle", "Verpackung / Versand", "Lager", "Transport"]],
    ["Fehlerort: Ausser Haus", ["Externe Bearbeitung (Härten, Beschichten …)", "Rohmaterial / Lieferant"]]]) },
  { s: "d3", nr: 3, titel: "Sofortmassnahmen", kurz: "Sofort", text: "sofort",
    frage: "Was wurde sofort gemacht, damit kein schlechtes Teil mehr zum Kunden geht?", gruppen: [
    ["Teile sichern", ["Lagerbestand gesperrt und geprüft", "Laufende Produktion gestoppt und geprüft",
      "Teile beim Kunden sortiert", "Teile zurückgenommen", "Ersatzlieferung", "Nacharbeit",
      "100 %-Kontrolle bis Ursache behoben", "Teile verschrottet"]],
    ["Informieren", ["Kunde informiert", "Lieferant informiert"]]] },
  { s: "d4", nr: 4, titel: "Ursache", kurz: "Ursache", text: "ursache", pdfGruppen: true,
    frage: "Warum ist der Fehler entstanden, und warum wurde er nicht entdeckt?", gruppen: [
    ["Maschine / Prozess", ["Drehfehler am Rohteil", "Werkzeugverschleiss", "Werkzeugbruch", "Spannzange / Führungsbüchse",
      "Maschine ungenau / Warmlauf", "Abstechen / Länge ungenau"]],
    ["Mensch", ["Falsch eingestellt / korrigiert", "Unachtsamkeit", "Fehlende Einweisung"]],
    ["Material", ["Rohmaterial fehlerhaft", "Falsches Material / Charge verwechselt"]],
    ["Methode", ["NC-Programm fehlerhaft", "Zeichnung oder Index falsch gelesen", "Einrichtblatt unvollständig"]],
    ["Messung", ["Messmittel ungeeignet", "Messmittel nicht kalibriert", "Messfehler"]],
    ["Umfeld", ["Späne / Verschmutzung", "Teile vermischt", "Verpackung ungeeignet"]],
    ["Nicht entdeckt", ["Überwachungsfehler an der Maschine", "Merkmal nicht im Prüfplan", "Prüfintervall zu gross",
      "Stichprobe zu klein", "Endkontrolle ungenügend"]]] },
  { s: "d5", nr: 5, titel: "Abstellmassnahmen festlegen", kurz: "Festlegen", text: "korrektur",
    frage: "Welche Massnahmen sollen die Ursache beheben?", gruppen: massnahmenGruppen(0) },
  { s: "d6", nr: 6, titel: "Abstellmassnahmen einführen", kurz: "Einführen", kopfText: "umsetzung",
    frage: "Was ist schon umgesetzt?", gruppen: massnahmenGruppen(1) },
  { s: "d7", nr: 7, titel: "Wiederholung verhindern", kurz: "Vorbeugen", text: "vorbeugung",
    frage: "Was verhindert, dass der Fehler hier oder bei ähnlichen Teilen wieder vorkommt?", gruppen: [["", [
    "Auf ähnliche Teile übertragen", "Hinweis im Einrichtblatt", "Standzeit im Werkzeugwechsel festgelegt",
    "Erstteilprüfung ergänzt", "Schulung im Team", "Vorrichtung / Lehre gebaut", "Prozess / QM-Dokument angepasst",
    "Risiko neu beurteilt"]]] },
  { s: "d8", nr: 8, titel: "Abschluss und Würdigung", kurz: "Abschluss 8D", text: "wirksamkeit",
    frage: "Sind die Massnahmen wirksam, und kann das Team abschliessen?", gruppen: [["", [
    "Nächste Lieferung geprüft, ohne Fehler", "Keine weitere Reklamation", "Kunde hat Massnahmen akzeptiert",
    WIRKSAM, "Team informiert und Arbeit gewürdigt"]]] },
];
// Eigene Punkte (seit 1.763.0, Patrick 24. November 2026: „eigene hinzufügen
// … allgemeine alle bearbeiten können … soll immer für alles übernommen
// werden“): je Schritt lässt sich die ganze Liste mit „✎ Liste bearbeiten“
// ändern, gespeichert für alle in app_config.rk_punkte {d1: [[Gruppe, [Punkte]]], …};
// was dort fehlt, nimmt die Vorgabe von oben. Schon angekreuzte Punkte, die
// nicht mehr in der Liste stehen, bleiben im Bericht und im Fragebogen.
const PUNKTE_KONFIG = "rk_punkte";
const PUNKTE_VORGABE = Object.fromEntries(ACHT_D.map((d) => [d.s, JSON.parse(JSON.stringify(d.gruppen))]));
let punkteGespeichert = {};
const gruppenGut = (g) => Array.isArray(g) && g.length > 0 && g.every((x) => Array.isArray(x) && typeof x[0] === "string" && Array.isArray(x[1]));
function punkteAnwenden(map) {
  punkteGespeichert = (map && typeof map === "object") ? map : {};
  for (const d of ACHT_D) {
    const g = punkteGespeichert[d.s];
    d.gruppen = gruppenGut(g) ? g.map(([n, p]) => [n, p.filter((x) => typeof x === "string" && x.trim())]) : PUNKTE_VORGABE[d.s];
  }
}
async function punkteLaden() {
  try {
    const r = await alt.zeitlimit(alt.db.from("app_config").select("wert").eq("schluessel", PUNKTE_KONFIG).maybeSingle(), 8000, "Listen 8D");
    if (r && !r.error) punkteAnwenden(r.data && r.data.wert ? JSON.parse(r.data.wert) : {});
  } catch (f) { /* Vorgabe bleibt */ }
}
async function punkteSpeichern(s, gruppen, text) {
  const vorher = await alt.rueckSichern("app_config", { schluessel: PUNKTE_KONFIG });
  const alle = { ...punkteGespeichert };
  if (gruppen) alle[s] = gruppen; else delete alle[s];
  const r = await alt.db.from("app_config").upsert([{ schluessel: PUNKTE_KONFIG, wert: JSON.stringify(alle) }], { onConflict: "schluessel" });
  if (r && r.error) throw r.error;
  alt.merkeSchritt(text, vorher.length
    ? alt.rueckRein("app_config", vorher, "schluessel")
    : alt.rueckWeg("app_config", { schluessel: PUNKTE_KONFIG }));
  punkteAnwenden(alle);
}

// Stammdaten aus den Berichten (seit 1.776.0, Wunsch Patrick 24. November 2026:
// „anhand dem Bericht die Stammdaten füttern … Kunde dann nur Name und der Rest
// kommt von selber“): beim Speichern merkt die App je Kunde/Lieferant Kontakt
// und Adresse, je HOCO Nr. Teil, Kunde, Kunden Art. Nr., Zeichnung und Index,
// in app_config.rk_stamm {partner: {"kunde:name": {...}}, hoco: {"10841-0009": {...}}}
const RK_STAMM = "rk_stamm";
let rkStamm = { partner: {}, hoco: {} };
const partnerSchluessel = (art, name) => art + ":" + String(name || "").trim().toLowerCase();
async function rkStammLaden() {
  try {
    const r = await alt.zeitlimit(alt.db.from("app_config").select("wert").eq("schluessel", RK_STAMM).maybeSingle(), 8000, "Stammdaten Reklamationen");
    if (r && !r.error) {
      const v = r.data && r.data.wert ? JSON.parse(r.data.wert) : {};
      rkStamm = { partner: (v && v.partner) || {}, hoco: (v && v.hoco) || {} };
    }
  } catch (f) { /* ohne gemerkte Stammdaten */ }
  return rkStamm;
}
// Nur ausgefüllte Werte überschreiben, Leeres lässt das Gemerkte stehen
async function rkStammMerken(d) {
  const neuP = {}, neuH = {};
  if (d.art !== "intern" && !leer(d.partner)) {
    const k = d.kopf || {};
    const e = { name: String(d.partner).trim() };
    if (!leer(d.kontakt)) e.kontakt = d.kontakt;
    if (!leer(k.adresse)) e.adresse = k.adresse;
    neuP[partnerSchluessel(d.art, d.partner)] = e;
  }
  if (!leer(d.hoco_nr)) {
    const k = d.kopf || {}, e = {};
    if (!leer(d.teil)) e.teil = d.teil;
    if (d.art !== "intern" && !leer(d.partner)) { e.partner = String(d.partner).trim(); e.art = d.art; }
    ["kunden_art", "zeichnung", "index"].forEach((f) => { if (!leer(k[f])) e[f] = k[f]; });
    if (Object.keys(e).length) neuH[String(d.hoco_nr).trim()] = e;
  }
  if (!Object.keys(neuP).length && !Object.keys(neuH).length) return;
  try {
    const st = await rkStammLaden();
    const am = new Date().toISOString();
    const partner = { ...st.partner }, hoco = { ...st.hoco };
    for (const [s, e] of Object.entries(neuP)) partner[s] = { ...(partner[s] || {}), ...e, am };
    for (const [s, e] of Object.entries(neuH)) hoco[s] = { ...(hoco[s] || {}), ...e, am };
    const r = await alt.db.from("app_config").upsert([{ schluessel: RK_STAMM, wert: JSON.stringify({ partner, hoco }) }], { onConflict: "schluessel" });
    if (r && !r.error) rkStamm = { partner, hoco };
  } catch (f) { alt.fehlerMerken && alt.fehlerMerken("Stammdaten Reklamationen", alt.fehlertext(f)); }
}
const gemerktPartner = (art, name) => (leer(name) ? null : rkStamm.partner[partnerSchluessel(art, name)] || null);
const gemerktHoco = (nr) => (leer(nr) ? null : rkStamm.hoco[String(nr).trim()] || null);

// Zu einer festgelegten Massnahme (D5) das „eingeführt“ in D6: das bekannte
// Paar, sonst der Punkt an derselben Stelle in D6, sonst derselbe Text
function gegenstueckD6(pk) {
  const m = MASSNAHMEN.find((x) => x[0] === pk);
  const d5 = ACHT_D.find((d) => d.s === "d5").gruppen;
  const d6 = ACHT_D.find((d) => d.s === "d6").gruppen;
  const alle6 = d6.flatMap((g) => g[1]);
  if (m && alle6.includes(m[1])) return m[1];
  for (let gi = 0; gi < d5.length; gi++) {
    const i = d5[gi][1].indexOf(pk);
    if (i >= 0 && d6[gi] && d6[gi][1][i] && (!m || d6[gi][0] === d5[gi][0])) return d6[gi][1][i];
  }
  return m ? m[1] : pk;
}

// Die Schritte des Fensters, einer nach dem anderen wie ein Fragebogen
// (seit 1.749.0, Patrick: „nicht alles auf einmal, sondern nacheinander“)
const SCHRITTE = [
  { id: "kopf", kurz: "Beanstandung", frage: "Wer reklamiert, und wer bearbeitet es bei uns?" },
  { id: "artikel", kurz: "Teil und Mengen", frage: "Um welches Teil geht es, und wie viele sind betroffen?" },
  ...ACHT_D.map((d) => ({ id: d.s, kurz: "D" + d.nr + " " + d.kurz, frage: d.frage })),
  { id: "abschluss", kurz: "Intern", frage: "Stand, Termin, Fotos und Dokumente. Das steht nicht im Bericht." },
];
// Welcher Teil der Vorschau zum Schritt gehört
const VORSCHAU_TEIL = { kopf: "kopf", artikel: "artikel",
  ...Object.fromEntries(ACHT_D.map((d) => [d.s, d.s])) };
// Kopf wie im Bericht, gespeichert in reklamationen.kopf
const KOPF = ["team", "umsetzung", "bearbeiter", "tel", "mail", "adresse", "berichtsdatum", "zeichnung", "index", "kunden_art",
  "bestellt", "retour", "gut", "lieferschein", "lieferdatum", "auftrag", "fertigung", "fertigung_text"];
// Für Bericht und Suche: was in einem Schritt angekreuzt ist
const angekreuzt = (w, s) => ((w.achtd && Array.isArray(w.achtd[s])) ? w.achtd[s] : []);

const leer = (v) => v == null || String(v).trim() === "";
const heute = () => alt.isoDatum(new Date());
const datum = (d) => {
  if (!d) return "";
  const t = alt.ausIso(String(d).slice(0, 10));
  return isNaN(t.getTime()) ? String(d) : String(t.getDate()).padStart(2, "0") + "." + String(t.getMonth() + 1).padStart(2, "0") + "." + t.getFullYear();
};
const ueberfaellig = (r) => r.termin && (r.status === "offen" || r.status === "bearbeitung") && r.termin < heute();
const fehltTabelle = (f) => /reklamationen/.test(String((f && (f.message || f.details)) || f || ""))
  && /(does not exist|schema cache|not find)/i.test(String((f && f.message) || f || ""));
const fehlerText = (f) => (fehltTabelle(f) ? "Die Datenbank kennt die Reklamationen noch nicht (sql/reklamationen.sql)." : alt.fehlertext(f));

async function laden() {
  const [r, p] = await Promise.all([
    alt.zeitlimit(alt.db.from("reklamationen").select("*").order("eingang", { ascending: false })
      .order("nr", { ascending: false }), 10000, "Reklamationen"),
    alt.zeitlimit(alt.db.from("profiles").select("id, full_name, email").eq("is_active", true), 8000, "Personen"),
    punkteLaden(),
    rkStammLaden(),
  ]);
  if (r.error) throw r.error;
  const personen = {};
  (p.data || []).forEach((x) => { personen[x.id] = alt.personName(x); mails[x.id] = x.email || ""; });
  // Kunden und Lieferanten aus den Stammdaten des Test ERP (seit 1.748.0): wer
  // dort nichts lesen darf oder noch nichts erfasst hat, tippt von Hand
  try {
    const s = await alt.zeitlimit(alt.db.from("erp_partner").select("id, art, nr, name, daten").eq("aktiv", true), 8000, "Stammdaten");
    stamm.length = 0;
    if (!s.error) (s.data || []).forEach((x) => stamm.push(x));
  } catch (f) { /* ohne Stammdaten */ }
  return { liste: r.data || [], personen };
}

// Mailadresse je Person, für den Bearbeiter im Kopf des Berichts
const mails = {};
// Kunden und Lieferanten aus den Stammdaten (erp_partner)
const stamm = [];
const stammArt = (art) => (art === "lieferant" ? "lieferant" : "kunde");
// Nach Nummer (10841, auch aus der HOCO Nr.) oder Name, ohne Gross/klein
function stammFinden(art, text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  const l = stamm.filter((p) => p.art === stammArt(art));
  return l.find((p) => String(p.nr) === t) || l.find((p) => String(p.name || "").trim().toLowerCase() === t) || null;
}
function stammAdresse(p) {
  const a = (p.daten && p.daten.adresse) || {};
  return [a.name2, a.strasse, [a.plz, a.ort].filter(Boolean).join(" "), a.land && a.land !== "CH" ? a.land : ""]
    .filter((x) => !leer(x)).join("\n");
}
function stammKontakt(p) {
  const k = ((p.daten && p.daten.kontakte) || [])[0];
  return k ? k.name || "" : "";
}
// Jüngste frühere Reklamation desselben Partners (Liste ist nach Eingang absteigend)
const gleich = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
function letzteVon(alle, art, partner, ohneId) {
  if (leer(partner)) return null;
  return (alle || []).find((x) => x.id !== ohneId && x.art === art && gleich(x.partner, partner)) || null;
}
// Vorschläge fürs Feld Kunde/Lieferant: Stammdaten und Namen aus früheren Reklamationen
function partnerVorschlaege(art, alle) {
  const raus = stamm.filter((p) => p.art === stammArt(art)).map((p) => ({ k: "s" + p.id, name: p.name, nr: p.nr }));
  Object.entries(rkStamm.partner).forEach(([s, e]) => {
    if (!s.startsWith(art + ":") || leer(e.name) || raus.some((y) => gleich(y.name, e.name))) return;
    raus.push({ k: "g" + s, name: e.name, nr: "gemerkt" });
  });
  (alle || []).forEach((x) => {
    if (x.art !== art || leer(x.partner) || raus.some((y) => gleich(y.name, x.partner))) return;
    raus.push({ k: "r" + x.id, name: String(x.partner).trim(), nr: "frühere Reklamation" });
  });
  return raus;
}
// Telefon aus Einstellungen → Mein Konto, früher je Gerät unter rk_tel gemerkt
const meinTelefon = () => String((alt.einstellungWert && (alt.einstellungWert("telefon", "") || alt.einstellungWert("rk_tel", ""))) || "");
const fehlerKurz = (r) => [...fehlerartVon(r), ...angekreuzt(r, "fa")].filter((x) => !leer(x)).join(", ");

// Gewählte Filter; bleiben beim Reiterwechsel
const filter = { stand: "offen", art: "", suche: "" };

export default function Reklamationen() {
  const { daten, fehler, neu } = useDaten(laden, []);
  const [, setF] = useState(0);
  const setze = (n, v) => { filter[n] = v; setF((x) => x + 1); };
  const darf = alt.darfSchreiben() && !alt.istExtern();

  useSeitenSuche({
    name: "Reklamationen", platzhalter: "Nr., Kunde, HOCO Nr., Fehler …",
    eintraege: () => ((daten && daten.liste) || []).map((r) => ({
      gruppe: "Reklamationen", zeichen: "⚠", titel: r.nr + " · " + (r.partner || ART_KURZ[r.art] || ""),
      zeile: [r.hoco_nr, STAND_KURZ[r.status], fehlerKurz(r) || r.fehler].filter(Boolean).join(" · "),
      such: [r.fa_nr, r.teil, r.ursache, r.verantwortlich].filter(Boolean).join(" "), r })),
    springen: (x) => reklamationOeffnen(x.r, neu, daten.personen, daten.liste),
  });

  if (!daten) return <p className="klein">{fehler ? fehlerText(fehler) : "Wird geladen …"}</p>;
  const { liste, personen } = daten;
  const jahr = String(new Date().getFullYear());
  const zahl = {
    offen: liste.filter((r) => r.status === "offen").length,
    bearbeitung: liste.filter((r) => r.status === "bearbeitung").length,
    spaet: liste.filter(ueberfaellig).length,
    jahr: liste.filter((r) => String(r.eingang || "").startsWith(jahr)).length,
  };
  const gezeigt = liste.filter((r) => {
    if (filter.stand === "offen" && !(r.status === "offen" || r.status === "bearbeitung")) return false;
    if (filter.stand === "zu" && !(r.status === "abgeschlossen" || r.status === "abgelehnt")) return false;
    if (filter.stand === "spaet" && !ueberfaellig(r)) return false;
    if (filter.art && r.art !== filter.art) return false;
    return passtWoerter(filter.suche, [r.nr, r.partner, r.kontakt, r.ref_partner, r.hoco_nr, r.fa_nr, r.teil,
      r.fehlerart, r.fehler, r.verantwortlich, r.ursache, r.fehlerort, r.bemerkung, Object.values(r.kopf || {}).join(" "), Object.values(r.achtd || {}).flat().join(" "), r.sofort, r.korrektur, r.vorbeugung, STAND_KURZ[r.status], ART_KURZ[r.art]]);
  });

  return (
    <div className="rk" id="rk">
      <div className="rk-zahlen">
        <button className={"rk-zahl" + (filter.stand === "offen" ? " aktiv" : "")} data-rkzahl="offen"
          onClick={() => setze("stand", "offen")}><b>{zahl.offen}</b><span>Offen</span></button>
        <button className={"rk-zahl" + (filter.stand === "offen" ? " aktiv" : "")} data-rkzahl="bearbeitung"
          onClick={() => setze("stand", "offen")}><b>{zahl.bearbeitung}</b><span>In Bearbeitung</span></button>
        <button className={"rk-zahl" + (zahl.spaet ? " rk-zahl--rot" : "") + (filter.stand === "spaet" ? " aktiv" : "")}
          data-rkzahl="spaet" onClick={() => setze("stand", "spaet")}><b>{zahl.spaet}</b><span>Termin überschritten</span></button>
        <button className={"rk-zahl" + (filter.stand === "alle" ? " aktiv" : "")} data-rkzahl="jahr"
          onClick={() => setze("stand", "alle")}><b>{zahl.jahr}</b><span>Im Jahr {jahr}</span></button>
        {darf && <button className="knopf knopf--haupt rk-neu" id="rk-neu"
          onClick={() => reklamationOeffnen(null, neu, personen, liste)}>+ Neue Reklamation</button>}
      </div>

      <div className="rk-filter">
        <div className="rk-wahl">
          {[["offen", "Offen"], ["spaet", "Überfällig"], ["zu", "Abgeschlossen"], ["alle", "Alle"]].map(([w, t]) => (
            <button key={w} className={"rk-chip" + (filter.stand === w ? " aktiv" : "")} data-rkstand={w}
              onClick={() => setze("stand", w)}>{t}</button>))}
        </div>
        <div className="rk-wahl">
          {[["", "Alle Arten"]].concat(ARTEN.map(([w]) => [w, ART_KURZ[w]])).map(([w, t]) => (
            <button key={w || "alle"} className={"rk-chip" + (filter.art === w ? " aktiv" : "")} data-rkart={w || "alle"}
              onClick={() => setze("art", w)}>{t}</button>))}
        </div>
        <input type="search" className="rk-suche" id="rk-suche" placeholder="Suchen: Nr., Kunde, HOCO Nr., Fehler …"
          value={filter.suche} onChange={(e) => setze("suche", e.target.value)} autoComplete="off" />
      </div>

      {!gezeigt.length
        ? <p className="hinweis" id="rk-leer">{liste.length ? "Keine Reklamation passt zum Filter." : "Noch keine Reklamation erfasst."}</p>
        : <div className="rk-liste" id="rk-liste">
            <div className="rk-zeile rk-zeile--kopf">
              <span>Nr.</span><span>Eingang</span><span>Von</span><span>HOCO Nr.</span><span>Fehler</span>
              <span>Verantwortlich</span><span>Termin</span><span>Stand</span>
            </div>
            {gezeigt.map((r) => (
              <button key={r.id} className={"rk-zeile" + (ueberfaellig(r) ? " rk-zeile--spaet" : "")} data-rk={r.nr}
                onClick={() => reklamationOeffnen(r, neu, personen, liste)}>
                <span className="rk-nr">{r.nr}</span>
                <span>{datum(r.eingang)}</span>
                <span><span className={"rk-art rk-art--" + r.art}>{ART_KURZ[r.art] || r.art}</span> {r.partner || ""}</span>
                <span>{r.hoco_nr || ""}{r.fa_nr ? <small> · FA {r.fa_nr}</small> : null}</span>
                <span className="rk-fehler">{fehlerKurz(r) ? <b>{fehlerKurz(r)}: </b> : null}{r.fehler || ""}</span>
                <span>{r.verantwortlich || ""}</span>
                <span className={ueberfaellig(r) ? "rk-rot" : ""}>{datum(r.termin)}</span>
                <span><span className={"rk-stand rk-stand--" + r.status}>{STAND_KURZ[r.status] || r.status}</span>
                  {(r.dateien || []).length ? <small className="rk-dateizahl"> 📎{r.dateien.length}</small> : null}</span>
              </button>))}
          </div>}
    </div>
  );
}

// ---------------------------------------------------------------
//  Fenster einer Reklamation
// ---------------------------------------------------------------
export function reklamationOeffnen(r, nachher, personen, alle) {
  fensterOeffnen((zu) => <RkFenster r={r} zu={zu} nachher={nachher} personen={personen || {}} alle={alle || []} />, null, "rk-huelle");
}

const FELDER_TEXT = ["art", "partner", "kontakt", "ref_partner", "eingang", "hoco_nr", "fa_nr", "teil", "fehlerart", "fehler",
  "status", "verantwortlich", "termin", "sofort", "ursache", "korrektur", "vorbeugung", "wirksamkeit", "fehlerort", "bemerkung"];
const FELDER_ZAHL = ["menge_geliefert", "menge_reklamiert", "kosten"];

// Angekreuzte Punkte, die nicht mehr in der Liste stehen (Liste geändert):
// bleiben sichtbar, damit man sie abwählen kann
function ausserListe(w, d) {
  const bekannt = new Set(d.gruppen.flatMap((g) => g[1]));
  const rest = angekreuzt(w, d.s).filter((p) => !bekannt.has(p));
  return rest.length ? [["Nicht mehr in der Liste", rest]] : [];
}

// Feld mit allen Punkten eines Schritts: umbenennen, löschen, eigene
// dazu, Gruppen dazu; gilt nach „Speichern“ für alle Reklamationen
// Bilder und Dateien zu einem einzelnen D-Punkt (seit 1.767.0, Wunsch Patrick
// 24. November 2026: „bei jedem D-Punkt eigene Notiz oder Bilder anfügen“).
// Sie liegen in derselben Liste `dateien` wie die übrigen, mit `d` = Punkt.
function DAnhang({ s, dateien, neu, darf, weg, dazu, neuWeg }) {
  const feld = useRef(null);
  const da = dateien.filter((x) => x.d === s);
  const offen = neu.filter((x) => x._d === s);
  if (!darf && !da.length) return null;
  return (
    <div className="rk-danhang" data-rkdanhang={s}>
      <span className="rk-gruppe__name">Bilder / Dateien zu diesem Punkt</span>
      <div className="lk-dateien">
        {da.map((d) => (
          <div key={d.pfad || d.url} className="lk-datei" data-rkdatei={d.name}>
            <button type="button" className="lk-datei__knopf" title={d.name}
              onClick={() => alt.betrachter(d.url, d.name, d.typ === "pdf")}>
              {d.typ === "bild" ? <img src={d.url} alt={d.name} loading="lazy" />
                : <span className="lk-datei__pdf"><small>{d.typ === "pdf" ? "PDF" : "Datei"}</small></span>}
              <span className="lk-datei__name">{d.name}</span>
            </button>
            {darf && <button type="button" className="lk-datei__weg" title="Löschen" onClick={() => weg(d)}>✕</button>}
          </div>))}
        {offen.map((d, i) => (
          <div key={"n" + i} className="lk-datei rk-datei--neu">
            <span className="lk-datei__knopf"><span className="lk-datei__pdf"><small>neu</small></span>
              <span className="lk-datei__name">{d.name}</span></span>
            <button type="button" className="lk-datei__weg" title="Weg" onClick={() => neuWeg(d)}>✕</button>
          </div>))}
        {darf && <>
          <button type="button" className="lk-datei lk-datei--neu" data-rkdneu={s}
            onClick={() => feld.current && feld.current.click()}><span className="klein">+ Bild / PDF</span></button>
          <input ref={feld} type="file" accept="application/pdf,.pdf,image/*" multiple hidden data-ablegen="direkt" data-rkdfeld={s}
            onChange={(e) => { const l0 = Array.from(e.target.files || []); e.target.value = ""; if (l0.length) dazu(l0); }} />
        </>}
      </div>
      {!!offen.length && <p className="feldhinweis">Wird beim Speichern hochgeladen.</p>}
    </div>
  );
}

function ListeBearbeiten({ d, fertig }) {
  const [g, setG] = useState(() => JSON.parse(JSON.stringify(d.gruppen)).map(([n, p]) => [n, p.concat("")]));
  const [speichert, setSpeichert] = useState(false);
  const mitGruppen = g.length > 1 || (g[0] && g[0][0]);
  const setze = (gi, i, v) => setG((x) => x.map((y, k) => (k !== gi ? y : [y[0], (() => {
    const p = y[1].slice(); p[i] = v;
    if (i === p.length - 1 && v.trim()) p.push(""); // immer ein leeres Feld für einen neuen Punkt
    return p;
  })()])));
  const weg = (gi, i) => setG((x) => x.map((y, k) => (k !== gi ? y : [y[0], y[1].filter((_, j) => j !== i)])));
  const name = (gi, v) => setG((x) => x.map((y, k) => (k !== gi ? y : [v, y[1]])));
  const gruppeWeg = (gi) => setG((x) => x.filter((_, k) => k !== gi));
  const sauber = () => g.map(([n, p]) => [String(n || "").trim(), Array.from(new Set(p.map((x) => x.trim()).filter(Boolean)))])
    .filter(([n, p]) => p.length || n);
  const speichern = async (vorgabe) => {
    const neu = vorgabe ? null : sauber().filter(([, p]) => p.length);
    if (neu && !neu.length) { alt.meldung("Mindestens ein Punkt muss bleiben.", "warn"); return; }
    setSpeichert(true);
    try {
      await punkteSpeichern(d.s, neu, "Liste D" + d.nr + " " + d.titel);
      alt.meldung("Liste D" + d.nr + " gespeichert, gilt für alle Reklamationen", "gut");
      fertig(true);
    } catch (f) {
      alt.meldung("Speichern ging nicht: " + ((f && f.message) || f), "fehler");
      setSpeichert(false);
    }
  };
  return (
    <div className="rk-liste" data-rkliste-feld={d.s}>
      <p className="klein">Punkte ändern, löschen oder unten im leeren Feld eigene dazuschreiben. Gilt nach „Speichern“ für alle Reklamationen.</p>
      {g.map(([n, p], gi) => (
        <div key={gi} className="rk-liste__gruppe">
          {mitGruppen && <div className="rk-liste__kopf">
            <input type="text" value={n} placeholder="Name der Gruppe" data-rkliste-gruppe={gi} onChange={(e) => name(gi, e.target.value)} />
            <button type="button" className="knopf knopf--klein" title="Gruppe löschen" onClick={() => gruppeWeg(gi)}>✕ Gruppe</button>
          </div>}
          {p.map((pk, i) => (
            <div key={i} className="rk-liste__zeile">
              <input type="text" value={pk} placeholder={i === p.length - 1 ? "+ Eigener Punkt …" : ""} data-rkliste-punkt={gi + "-" + i}
                onChange={(e) => setze(gi, i, e.target.value)} />
              {i < p.length - 1 && <button type="button" className="knopf knopf--klein" title="Punkt löschen" data-rkliste-weg={gi + "-" + i}
                onClick={() => weg(gi, i)}>✕</button>}
            </div>))}
        </div>))}
      <div className="rk-liste__knoepfe">
        <button type="button" className="knopf knopf--klein" data-rkliste-neugruppe onClick={() => setG((x) => x.concat([["Neue Gruppe", [""]]]))}>+ Gruppe</button>
        <button type="button" className="knopf knopf--klein" disabled={speichert} onClick={() => speichern(true)}>Wie am Anfang</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="knopf knopf--klein" disabled={speichert} onClick={() => fertig(false)}>Abbrechen</button>
        <button type="button" className="knopf knopf--haupt knopf--klein" disabled={speichert} data-rkliste-speichern onClick={() => speichern(false)}>Speichern</button>
      </div>
    </div>
  );
}

function RkFenster({ r, zu, nachher, personen, alle }) {
  const darf = alt.darfSchreiben() && !alt.istExtern();
  const [w, setW] = useState(() => {
    const ich = alt.meineProfilId && alt.meineProfilId();
    // Neue Reklamation: Bearbeiter ist, wer sie erfasst; Telefon merkt sich das Konto
    const kopf = (r && r.kopf && typeof r.kopf === "object") ? { ...r.kopf } : {
      bearbeiter: (ich && personen[ich]) || "", mail: (ich && mails[ich]) || "",
      tel: meinTelefon(),
    };
    return { art: "kunde", status: "offen", eingang: heute(), ...(r || {}), kopf };
  });
  const [neueDateien, setNeue] = useState([]); // vor dem Speichern gewählte Dateien
  const [speichert, setSpeichert] = useState(false);
  const [hinweis, setHinweis] = useState("");
  const feld = useRef(null);
  const [schritt, setSchritt] = useState("kopf");
  const [listeAuf, setListeAuf] = useState(null); // Schritt, dessen Liste gerade bearbeitet wird
  const [, setListeStand] = useState(0);
  const nr = Math.max(0, SCHRITTE.findIndex((x) => x.id === schritt));
  const [zeigVorschau, setZeigVorschau] = useState(false);
  const [zoomV, setZoomV] = useState(0.6);
  const linksRef = useRef(null);
  const vorschauRef = useRef(null);
  // Noch nicht gespeicherte Bilder eines D-Punkts zeigt die Vorschau schon (seit 1.767.0)
  const neuVorschau = useMemo(() => neueDateien.filter((f) => f._d).map((f) => ({ name: f.name, d: f._d,
    typ: /^image\//.test(f.type) ? "bild" : "datei", url: /^image\//.test(f.type) ? URL.createObjectURL(f) : "" })), [neueDateien]);
  useEffect(() => () => neuVorschau.forEach((x) => x.url && URL.revokeObjectURL(x.url)), [neuVorschau]);
  // Schritt wechseln, optional mit Fokus auf ein Feld darin
  const gehe = (id, fokus) => {
    setSchritt(id);
    setZeigVorschau(false);
    setTimeout(() => {
      if (linksRef.current) linksRef.current.scrollTop = 0;
      // Bei Schritten mit Text gleich ins erste Feld, bei den Häkchen nicht
      const f = fokus ? document.getElementById(fokus) : ["kopf", "artikel", "d2"].includes(id) && linksRef.current
        && linksRef.current.querySelector(".rk-abschnitt input:not([disabled]):not([type=date]), .rk-abschnitt textarea:not([disabled])");
      if (f && (fokus || !window.matchMedia("(pointer: coarse)").matches)) f.focus({ preventScroll: true });
    }, 30);
  };
  // A4 (794 Punkte) auf die Breite der Vorschau verkleinern
  useLayoutEffect(() => {
    const el = vorschauRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => { const b = el.clientWidth - 28; if (b > 50) setZoomV(Math.min(1, b / 794)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Vorschau rollt zum Teil des offenen Schritts
  useEffect(() => {
    const el = vorschauRef.current;
    const t = el && el.querySelector('section[data-s="' + (VORSCHAU_TEIL[schritt] || "") + '"]');
    if (!t) return;
    const oben = t.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 40;
    el.scrollTo({ top: Math.max(0, oben), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [schritt, zoomV]);
  const setze = (n, v) => setW((x) => ({ ...x, [n]: v }));
  const setzeKopf = (n, v) => setW((x) => ({ ...x, kopf: { ...(x.kopf || {}), [n]: v } }));
  // Punkt im 8D an- oder abkreuzen
  const kreuzen = (schritt, punkt) => setW((x) => {
    const a = { ...(x.achtd || {}) };
    const l = Array.isArray(a[schritt]) ? a[schritt] : [];
    a[schritt] = l.includes(punkt) ? l.filter((y) => y !== punkt) : l.concat(punkt);
    return { ...x, achtd: a };
  });
  const dateien = Array.isArray(w.dateien) ? w.dateien : [];
  const namen = Object.values(personen).sort((a, b) => a.localeCompare(b, "de"));

  // HOCO Nr. eingetippt: Teil, Kunde und FA Nr. aus dem jüngsten Auftrag vorschlagen
  // Name, Adresse und Kontakt aus den Stammdaten in leere Felder
  const stammEinsetzen = (n, p, gefuellt) => {
    if (leer(n.partner) || String(n.partner).trim() === String(p.nr)) { n.partner = p.name; gefuellt.push(n.art === "lieferant" ? "Lieferant" : "Kunde"); }
    const adr = stammAdresse(p);
    if (adr && leer((n.kopf || {}).adresse)) { n.kopf = { ...(n.kopf || {}), adresse: adr }; gefuellt.push("Adresse"); }
    const kt = stammKontakt(p);
    if (kt && leer(n.kontakt)) { n.kontakt = kt; gefuellt.push("Kontaktperson"); }
  };
  // Aus der jüngsten früheren Reklamation desselben Kunden (seit 1.752.0, Wunsch
  // Patrick: „nicht immer neu ausfüllen“): Kontakt, Adresse, Beanstandungs-Nr. bleibt
  const frueherEinsetzen = (n, gefuellt) => {
    // Zuerst das Gemerkte aus früheren Berichten (rk_stamm), dann die letzte Reklamation
    const g = gemerktPartner(n.art, n.partner);
    if (g) {
      if (!leer(g.name) && String(g.name).trim() !== String(n.partner).trim()) n.partner = g.name;
      if (leer(n.kontakt) && !leer(g.kontakt)) { n.kontakt = g.kontakt; gefuellt.push("Kontaktperson"); }
      if (leer((n.kopf || {}).adresse) && !leer(g.adresse)) { n.kopf = { ...(n.kopf || {}), adresse: g.adresse }; gefuellt.push("Adresse"); }
    }
    const v = letzteVon(alle, n.art, n.partner, r && r.id);
    if (!v) return;
    if (leer(n.kontakt) && !leer(v.kontakt)) { n.kontakt = v.kontakt; gefuellt.push("Kontaktperson"); }
    const vk = v.kopf || {};
    if (leer((n.kopf || {}).adresse) && !leer(vk.adresse)) { n.kopf = { ...(n.kopf || {}), adresse: vk.adresse }; gefuellt.push("Adresse"); }
  };
  const partnerNachschlagen = (text) => {
    const p = stammFinden(w.art, text);
    const g1 = [], g2 = [];
    setW((x) => {
      const n = { ...x };
      if (p) stammEinsetzen(n, p, g1);
      frueherEinsetzen(n, g2);
      return n;
    });
    setTimeout(() => {
      const t = [];
      if (g1.length) t.push("Aus den Stammdaten ausgefüllt: " + [...new Set(g1)].join(", ") + ".");
      if (g2.length) t.push("Aus der letzten Reklamation übernommen: " + [...new Set(g2)].join(", ") + ".");
      setHinweis(t.join(" "));
    }, 0);
  };
  const hocoNachschlagen = async (nr) => {
    nr = String(nr || "").trim();
    if (!nr) return;
    try {
      const [t, j] = await Promise.all([
        alt.db.from("hoco_parts").select("bezeichnung").eq("hoco_nr", nr).maybeSingle(),
        alt.db.from("jobs").select("job_number, fa_nr, customer_number, target_quantity, drawing_url, wbg_url").eq("job_number", nr)
          .order("planned_from", { ascending: false, nullsFirst: false }).limit(1),
      ]);
      const auftrag = (j.data || [])[0];
      const gefuellt = [];
      setW((x) => {
        const n = { ...x };
        if (leer(x.teil) && t.data && t.data.bezeichnung) { n.teil = t.data.bezeichnung; gefuellt.push("Teil"); }
        if (leer(x.fa_nr) && auftrag && auftrag.fa_nr) { n.fa_nr = auftrag.fa_nr; gefuellt.push("FA Nr."); }
        const gh = gemerktHoco(nr);
        if (gh) {
          if (leer(n.teil) && !leer(gh.teil)) { n.teil = gh.teil; gefuellt.push("Teil"); }
          if (leer(n.partner) && !leer(gh.partner) && (gh.art || "kunde") === x.art) { n.partner = gh.partner; gefuellt.push(x.art === "lieferant" ? "Lieferant" : "Kunde"); }
          const k = { ...(n.kopf || {}) };
          [["kunden_art", "Kunden Art. Nr."], ["zeichnung", "Zeichnungs-Nr."], ["index", "Index"]].forEach(([f, t]) => {
            if (leer(k[f]) && !leer(gh[f])) { k[f] = gh[f]; gefuellt.push(t); }
          });
          n.kopf = k;
        }
        if (leer(n.partner) && x.art === "kunde") {
          // Kundennummer aus dem Auftrag, sonst vorne aus der HOCO Nr. (10841-0009 → 10841)
          const knr = (auftrag && auftrag.customer_number) ? String(auftrag.customer_number) : (nr.match(/^(\d{5})-/) || [])[1];
          const p = knr && stammFinden("kunde", knr);
          if (p) { stammEinsetzen(n, p, gefuellt); }
          else if (auftrag && auftrag.customer_number) { n.partner = String(auftrag.customer_number); gefuellt.push("Kunde"); }
        }
        frueherEinsetzen(n, gefuellt);
        // Kunden Art. Nr., Zeichnung und Index aus der letzten Reklamation dieser HOCO Nr.
        const v = alle.find((y) => (!r || y.id !== r.id) && String(y.hoco_nr || "").trim() === nr);
        if (v) {
          const vk = v.kopf || {}, k = { ...(n.kopf || {}) };
          [["kunden_art", "Kunden Art. Nr."], ["zeichnung", "Zeichnungs-Nr."], ["index", "Index"]].forEach(([f, t]) => {
            if (leer(k[f]) && !leer(vk[f])) { k[f] = vk[f]; gefuellt.push(t); }
          });
          n.kopf = k;
        }
        return n;
      });
      // Zeichnungs-Nr. wie im Auftragsfenster (aus Dateiname oder WBG)
      if (auftrag) {
        try {
          const { zeichnungNrHolen } = await import("../../daten/zeichnungNr.js");
          const z = await zeichnungNrHolen(auftrag);
          if (z && !gefuellt.includes("Zeichnungs-Nr.")) {
            setW((x) => (leer((x.kopf || {}).zeichnung) ? { ...x, kopf: { ...(x.kopf || {}), zeichnung: z } } : x));
            gefuellt.push("Zeichnungs-Nr.");
          }
        } catch (f) { /* dann von Hand */ }
      }
      setHinweis(gefuellt.length ? "Vorgeschlagen aus Auftrag und früheren Reklamationen: " + [...new Set(gefuellt)].join(", ") + ". Bitte prüfen." : "");
    } catch (f) { /* dann eben von Hand */ }
  };

  const hochladen = async (id, liste) => {
    const raus = [];
    for (const d of liste) {
      const pdf = /pdf/i.test(d.type) || /\.pdf$/i.test(d.name);
      const endung = pdf ? "pdf" : ((d.name.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || "jpg").toLowerCase();
      const pfad = "reklamationen/" + id + "/" + crypto.randomUUID() + "." + endung;
      const up = await alt.db.storage.from("zeichnungen").upload(pfad, d,
        { contentType: d.type || (pdf ? "application/pdf" : "application/octet-stream"), upsert: false });
      if (up.error) throw up.error;
      raus.push({ name: d.name || ("Datei." + endung), url: alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl,
        pfad, typ: pdf ? "pdf" : /^image\//.test(d.type) ? "bild" : "datei", ...(d._d ? { d: d._d } : {}) });
    }
    return raus;
  };

  const speichern = async (schliessen = true) => {
    if (leer(w.fehler)) { alt.meldung("Bitte das Problem beschreiben.", "warn"); gehe("d2", "rk-f-fehler"); return null; }
    if (w.art !== "intern" && leer(w.partner)) {
      alt.meldung(w.art === "kunde" ? "Bitte den Kunden angeben." : "Bitte den Lieferanten angeben.", "warn");
      gehe("kopf", "rk-f-partner"); return null;
    }
    setSpeichert(true);
    try {
      const d = {};
      for (const f of FELDER_TEXT) d[f] = leer(w[f]) ? null : String(w[f]).trim();
      for (const f of FELDER_ZAHL) {
        const z = leer(w[f]) ? null : Number(String(w[f]).replace(/['\s]/g, "").replace(",", "."));
        d[f] = z == null || isNaN(z) ? null : z;
      }
      d.achtd = { ...(w.achtd && typeof w.achtd === "object" ? w.achtd : {}) };
      d.kopf = {};
      for (const f of KOPF) { const v = (w.kopf || {})[f]; if (!leer(v)) d.kopf[f] = String(v).trim(); }
      d.art = d.art || "kunde"; d.status = d.status || "offen"; d.eingang = d.eingang || heute();
      const zu0 = d.status === "abgeschlossen" || d.status === "abgelehnt";
      d.abgeschlossen_am = zu0 ? (r && r.abgeschlossen_am) || new Date().toISOString() : null;
      let id = r && r.id, nr = r && r.nr;
      let alleDateien = dateien;
      if (r) {
        d.geaendert_am = new Date().toISOString();
        d.geaendert_von = (await alt.db.auth.getUser()).data.user?.id || null;
        const vorher = await alt.rueckSichern("reklamationen", { id: r.id });
        const { error } = await alt.db.from("reklamationen").update(d).eq("id", r.id);
        if (error) throw error;
        alt.merkeSchritt("Ändern der Reklamation " + r.nr, alt.rueckRein("reklamationen", vorher));
      } else {
        const { data, error } = await alt.db.from("reklamationen").insert(d).select("id, nr").single();
        if (error) throw error;
        id = data.id; nr = data.nr;
        alt.merkeSchritt("Reklamation " + nr, alt.rueckWeg("reklamationen", { id }));
      }
      if (neueDateien.length) {
        const dazu = await hochladen(id, neueDateien);
        const liste = dateien.concat(dazu);
        const { error } = await alt.db.from("reklamationen").update({ dateien: liste }).eq("id", id);
        if (error) throw error;
        setW((x) => ({ ...x, dateien: liste })); setNeue([]);
        alleDateien = liste;
      }
      rkStammMerken(d);
      // D7 „In die Fertigung übernehmen“: Massnahme für die Maschinen dieser HOCO Nr.
      try { await massnahmeVeroeffentlichen({ id, nr, hoco_nr: d.hoco_nr, kopf: d.kopf, achtd: d.achtd }); }
      catch (f) { alt.meldung("Massnahme für die Fertigung nicht gespeichert: " + fehlerText(f), "warn"); }
      alt.meldung((r ? "Gespeichert: " : "Erfasst: ") + nr, "gut");
      if (nachher) nachher();
      if (schliessen) zu();
      return { id, nr, dateien: alleDateien };
    } catch (f) {
      alt.meldung(fehlerText(f), "fehler");
      return null;
    } finally { setSpeichert(false); }
  };

  const dateiWeg = async (d) => {
    const ok = await alt.nachfragen({ titel: "Datei löschen", text: "„" + d.name + "“ wird bei der Reklamation gelöscht.",
      bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const liste = dateien.filter((x) => x.pfad !== d.pfad);
    const vorher = await alt.rueckSichern("reklamationen", { id: r.id });
    const { error } = await alt.db.from("reklamationen").update({ dateien: liste }).eq("id", r.id);
    if (error) { alt.meldung(fehlerText(error), "fehler"); return; }
    alt.merkeSchritt("Löschen von „" + d.name + "“", alt.rueckRein("reklamationen", vorher));
    setW((x) => ({ ...x, dateien: liste }));
    if (nachher) nachher();
  };

  const loeschen = async () => {
    const ok = await alt.nachfragen({ titel: "Reklamation löschen", text: "Reklamation " + r.nr + " wird gelöscht.",
      bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const vorher = await alt.rueckSichern("reklamationen", { id: r.id });
    const { error } = await alt.db.from("reklamationen").delete().eq("id", r.id);
    if (error) { alt.meldung(fehlerText(error), "fehler"); return; }
    alt.merkeSchritt("Löschen der Reklamation " + r.nr, alt.rueckRein("reklamationen", vorher));
    alt.meldung("Gelöscht.");
    if (nachher) nachher();
    zu();
  };

  const bericht = async () => {
    // Zuerst speichern, damit der Bericht zeigt, was im Fenster steht
    const s = darf ? await speichern(false) : { nr: w.nr, dateien };
    if (!s) return;
    try {
      const { achtdPdf } = await import("./achtdPdf.js");
      const intern = w.art === "intern";
      const blob = await achtdPdf({ ...w, nr: s.nr, dateien: s.dateien || dateien }, (intern ? "Interne Reklamation " : "8D-Report ") + s.nr);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (intern ? "Interne Reklamation " : "8D-Bericht ") + s.nr + ".pdf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } catch (f) { alt.meldung("Bericht ging nicht: " + alt.fehlertext(f), "fehler"); }
  };

  const K = (n, label, extra = {}) => (
    <label className={"feld" + (extra.breit ? " rk-breit" : "")}>
      <span>{label}</span>
      {extra.zeilen
        ? <textarea id={"rk-k-" + n} rows={extra.zeilen} value={(w.kopf || {})[n] || ""} placeholder={extra.ph || ""} disabled={!darf}
            onChange={(e) => setzeKopf(n, e.target.value)} />
        : <input id={"rk-k-" + n} type={extra.typ || "text"} value={(w.kopf || {})[n] || ""} placeholder={extra.ph || ""}
            disabled={!darf} list={extra.liste} inputMode={extra.zahl ? "decimal" : undefined}
            onChange={(e) => setzeKopf(n, e.target.value)} />}
    </label>
  );
  const T = (n, label, extra = {}) => (
    <label className={"feld" + (extra.breit ? " rk-breit" : "")}>
      <span>{label}</span>
      {extra.zeilen
        ? <textarea id={"rk-f-" + n} rows={extra.zeilen} value={w[n] || ""} placeholder={extra.ph || ""} disabled={!darf}
            onChange={(e) => setze(n, e.target.value)} />
        : <input id={"rk-f-" + n} type={extra.typ || "text"} value={w[n] == null ? "" : w[n]} placeholder={extra.ph || ""}
            disabled={!darf} list={extra.liste} inputMode={extra.zahl ? "decimal" : undefined}
            data-fokus={extra.fokus ? "" : undefined} onBlur={extra.blur}
            onChange={(e) => setze(n, e.target.value)} />}
    </label>
  );
  // Frühere Reklamationen derselben HOCO Nr.: ihre Häkchen lassen sich übernehmen,
  // weil Ursache und Massnahmen meist dieselben sind
  const frueher = leer(w.hoco_nr) ? [] : alle.filter((x) => (!r || x.id !== r.id)
    && String(x.hoco_nr || "").trim() === String(w.hoco_nr).trim()).slice(0, 4);
  const uebernehmen = (x) => setW((y) => {
    const a = { ...(y.achtd || {}) };
    for (const d of ACHT_D) {
      const dazu = angekreuzt(x, d.s);
      a[d.s] = Array.from(new Set(angekreuzt(y, d.s).concat(dazu)));
    }
    alt.meldung("Häkchen von " + x.nr + " übernommen. Bitte prüfen.", "gut");
    return { ...y, achtd: a };
  });
  const wieGeplant = () => setW((y) => {
    const a = { ...(y.achtd || {}) };
    const dazu = angekreuzt(y, "d5").map(gegenstueckD6).filter(Boolean);
    a.d6 = Array.from(new Set(angekreuzt(y, "d6").concat(dazu)));
    return { ...y, achtd: a };
  });
  const wer = r && r.erstellt_von && personen[r.erstellt_von];
  // Häkchen in der Schrittleiste: dort ist schon etwas eingetragen
  const gefuellt = (id) => {
    if (id === "kopf") return w.art === "intern" || !leer(w.partner);
    if (id === "artikel") return !leer(w.hoco_nr) || !leer(w.teil);
    if (id === "d2" && !leer(w.fehler)) return true;
    if (id === "abschluss") return w.status !== "offen" || !leer(w.verantwortlich) || !leer(w.termin);
    const d = ACHT_D.find((x) => x.s === id);
    return !!d && (angekreuzt(w, id).length > 0 || (d.text ? !leer(w[d.text]) : !leer((w.kopf || {})[d.kopfText])));
  };

  return (
    <div className={"dialog dialog--breit rk-fenster" + (zeigVorschau ? " rk-fenster--vorschau-auf" : "")} role="dialog" aria-modal="true" id="rk-fenster">
      <div className="blatt__kopf">
        <h2>{r ? "Reklamation " + r.nr : "Neue Reklamation"}</h2>
        <button className="knopf knopf--still rk-vorschau-knopf" id="rk-vorschau-knopf" type="button"
          onClick={() => setZeigVorschau((v) => !v)}>{zeigVorschau ? "Zum Formular" : "Vorschau"}</button>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      <div className="rk-links" ref={linksRef}>
      {r && <p className="klein rk-wer">Erfasst {datum(r.erstellt_am)}{wer ? " von " + wer : ""}
        {r.geaendert_am ? " · zuletzt geändert " + datum(r.geaendert_am) + (personen[r.geaendert_von] ? " von " + personen[r.geaendert_von] : "") : ""}
        {r.abgeschlossen_am ? " · abgeschlossen " + datum(r.abgeschlossen_am) : ""}</p>}
            <datalist id="rk-personen">{namen.map((f) => <option key={f} value={f} />)}</datalist>

      <nav className="rk-schritte" aria-label="Schritte">
        {SCHRITTE.map((s, i) => (
          <button key={s.id} type="button" data-rkschritt={s.id}
            className={"rk-schritt-knopf" + (s.id === schritt ? " aktiv" : "") + (gefuellt(s.id) ? " fertig" : "")}
            aria-current={s.id === schritt ? "step" : undefined} onClick={() => gehe(s.id)}>
            <b>{gefuellt(s.id) && s.id !== schritt ? "✓" : i + 1}</b><span>{s.kurz}</span></button>))}
      </nav>
      <p className="rk-frage" id="rk-frage"><small>Schritt {nr + 1} von {SCHRITTE.length}</small>{SCHRITTE[nr].frage}</p>

      {schritt === "kopf" && <>
      <div className="rk-art-wahl">
        {ARTEN.map(([a, t]) => (
          <button key={a} type="button" className={"rk-chip" + (w.art === a ? " aktiv" : "")} data-rkfart={a}
            disabled={!darf} onClick={() => setze("art", a)}>{t}</button>))}
      </div>

      <section className="rk-abschnitt">
        <h3>Beanstandung</h3>
        <div className="rk-raster">
          {w.art !== "intern" && T("partner", w.art === "kunde" ? "Kunde *" : "Lieferant *", { fokus: !r, ph: w.art === "kunde" ? "Firma oder Kunden-Nr." : "Lieferant", liste: "rk-stamm", blur: (e) => partnerNachschlagen(e.target.value) })}
          <datalist id="rk-stamm">{partnerVorschlaege(w.art, alle).map((p) => <option key={p.k} value={p.name}>{p.nr}</option>)}</datalist>
          {w.art !== "intern" && T("kontakt", "Kontaktperson")}
          {w.art !== "intern" && T("ref_partner", w.art === "kunde" ? "Beanstand.-Nr. Kunde" : "Bestell-Nr. / Lieferschein")}
          {T("eingang", "Eröffnet am", { typ: "date" })}
          {w.art !== "intern" && K("adresse", "Adresse " + (w.art === "kunde" ? "Kunde" : "Lieferant"), { zeilen: 3, breit: true, ph: "Strasse\nPLZ Ort" })}
          {K("bearbeiter", "Bearbeiter", { liste: "rk-personen" })}
          {K("tel", "Tel. Bearbeiter")}
          {darf && !r && leer((w.kopf || {}).tel) && !meinTelefon() && <p className="feldhinweis rk-breit" id="rk-tel-fehlt">
            Dein Telefon fehlt noch: unter Einstellungen → Allgemein → Mein Konto eintragen, dann kommt es jedes Mal von selbst.</p>}
          {K("mail", "Mail Bearbeiter")}
          {K("berichtsdatum", "Berichtsdatum", { typ: "date" })}
        </div>
      </section>
      </>}

      {schritt === "artikel" && <>
      <section className="rk-abschnitt">
        <h3>Artikel und Mengen</h3>
        <div className="rk-raster">
          {T("hoco_nr", "Artikelnummer HOCO", { ph: "10841-0009", blur: (e) => hocoNachschlagen(e.target.value), fokus: !r && w.art === "intern" })}
          {T("teil", "Artikelbezeichnung", { breit: true })}
          {K("zeichnung", "Zeichnungs-Nr.")}
          {K("index", "Index")}
          {K("kunden_art", "Kunden Art. Nr.")}
          {K("bestellt", "Bestellte Menge", { zahl: true })}
          {T("menge_geliefert", "Gelieferte Menge", { zahl: true })}
          {T("menge_reklamiert", "Beanstandungsmenge", { zahl: true })}
          {K("retour", "Retournierte Menge", { zahl: true })}
          {K("gut", "Gutteile", { zahl: true })}
          {K("lieferschein", "Lieferschein Nr.")}
          {K("lieferdatum", "Lieferdatum", { typ: "date" })}
          {K("auftrag", "Auftrags Nr.")}
          {T("fa_nr", "Fabrikationsauftrag")}
        </div>
        {!!frueher.length && <div className="rk-frueher" id="rk-frueher">
          <span>Schon reklamiert:</span>
          {frueher.map((x) => <span key={x.id} className="rk-frueher__eintrag">
            <b>{x.nr}</b> {datum(x.eingang)} {fehlerKurz(x)}
            {darf && <button type="button" className="knopf knopf--klein" data-rkuebernehmen={x.nr}
              onClick={() => uebernehmen(x)}>Häkchen übernehmen</button>}
          </span>)}
        </div>}
      </section>
      </>}

      {ACHT_D.filter((d) => d.s === schritt).map((d) => (
        <section key={d.s} className="rk-abschnitt rk-8d" data-rk8d={d.s}>
          <h3>D{d.nr} · {d.titel}{angekreuzt(w, d.s).length ? <small className="rk-8d-zahl"> · {angekreuzt(w, d.s).length} angekreuzt</small> : null}
            {d.s === "d6" && darf && <button type="button" className="knopf knopf--klein rk-wiegeplant" id="rk-wiegeplant"
              disabled={!angekreuzt(w, "d5").length} onClick={wieGeplant}>Wie festgelegt ✓</button>}</h3>
          {d.oben && T(d.oben, "Was genau ist das Problem? *", { zeilen: 4, breit: true, ph: "Was hat der Kunde gefunden? Mass, Stelle, wie viele …" })}
          {listeAuf === d.s
            ? <ListeBearbeiten d={d} fertig={(gespeichert) => { setListeAuf(null); if (gespeichert) setListeStand((x) => x + 1); }} />
            : <>
          {d.gruppen.concat(ausserListe(w, d)).map(([g, punkte]) => (
            <div key={g || "x"} className="rk-gruppe">
              {g && <span className="rk-gruppe__name">{g}</span>}
              <div className="rk-haken">
                {punkte.map((pk) => {
                  const an = angekreuzt(w, d.s).includes(pk);
                  return <button key={pk} type="button" className={"rk-haken__punkt" + (an ? " an" : "")} disabled={!darf}
                    aria-pressed={an} data-rkhaken={pk} onClick={() => kreuzen(d.s, pk)}>
                    <span className="rk-haken__box">{an ? "✓" : ""}</span>{pk}</button>;
                })}
              </div>
            </div>))}
          {darf && <button type="button" className="knopf knopf--klein rk-liste-knopf" data-rkliste={d.s}
            onClick={() => setListeAuf(d.s)}>✎ Liste bearbeiten</button>}
            </>}
          {d.text && T(d.text, "Eigene Notiz", { zeilen: 2, breit: true, ph: "Was nicht in der Liste steht …" })}
          {d.kopfText && K(d.kopfText, d.s === "d1" ? "Namen / eigene Notiz" : "Eigene Notiz", { zeilen: 2, breit: true })}
          <DAnhang s={d.s} dateien={dateien} neu={neueDateien} darf={darf} weg={dateiWeg}
            dazu={(l0) => setNeue((l) => l.concat(l0.map((f) => { f._d = d.s; return f; })))}
            neuWeg={(f) => setNeue((l) => l.filter((x) => x !== f))} />
          {d.s === "d7" && <div className="rk-fertigung" id="rk-fertigung">
            <button type="button" className={"rk-haken__punkt" + (w.kopf?.fertigung === "ja" ? " an" : "")} disabled={!darf || !w.hoco_nr}
              id="rk-fertigung-haken" aria-pressed={w.kopf?.fertigung === "ja"}
              onClick={() => setzeKopf("fertigung", w.kopf?.fertigung === "ja" ? "" : "ja")}>
              <span className="rk-haken__box">{w.kopf?.fertigung === "ja" ? "✓" : ""}</span>In die Fertigung übernehmen</button>
            <small>{w.hoco_nr ? "Erscheint im Auftragsfenster unter „QS“ und muss an der Maschine beim Rüsten und Start quittiert werden (HOCO Nr. " + w.hoco_nr + ")."
              : "Zuerst eine HOCO Nr. eintragen."}</small>
            {w.kopf?.fertigung === "ja" && K("fertigung_text", "Text für die Maschine *", { zeilen: 2, breit: true })}
          </div>}
          {d.s === "d8" && <RkNachweis id={r && r.id} />}
          {d.s === "d8" && !leer(w.bemerkung) && T("bemerkung", "Bemerkung", { zeilen: 2, breit: true })}
        </section>))}

      {schritt === "abschluss" && <>
      <section className="rk-abschnitt">
        <h3>Bearbeitung (intern, nicht im Bericht)</h3>
        <div className="rk-raster">
          <label className="feld"><span>Stand</span>
            <select id="rk-f-status" value={w.status} disabled={!darf} onChange={(e) => setze("status", e.target.value)}>
              {STAENDE.map(([s, t]) => <option key={s} value={s}>{t}</option>)}
            </select></label>
          {T("verantwortlich", "Verantwortlich", { liste: "rk-personen" })}
          {T("termin", "Termin", { typ: "date" })}
          {T("kosten", "Kosten CHF", { zahl: true, ph: "Ersatz, Sortieren, Fracht …" })}
        </div>
      </section>

      <section className="rk-abschnitt">
        <h3>Fotos und Dokumente</h3>
        <div className="lk-dateien" id="rk-dateien">
          {dateien.filter((d) => !d.d).map((d) => (
            <div key={d.pfad || d.url} className="lk-datei" data-rkdatei={d.name}>
              <button type="button" className="lk-datei__knopf" title={d.name}
                onClick={() => alt.betrachter(d.url, d.name, d.typ === "pdf")}>
                {d.typ === "bild" ? <img src={d.url} alt={d.name} loading="lazy" />
                  : <span className="lk-datei__pdf"><small>{d.typ === "pdf" ? "PDF" : "Datei"}</small></span>}
                <span className="lk-datei__name">{d.name}</span>
              </button>
              {darf && <button type="button" className="lk-datei__weg" title="Löschen" onClick={() => dateiWeg(d)}>✕</button>}
            </div>))}
          {neueDateien.map((d, i) => d._d ? null : (
            <div key={"n" + i} className="lk-datei rk-datei--neu">
              <span className="lk-datei__knopf"><span className="lk-datei__pdf"><small>neu</small></span>
                <span className="lk-datei__name">{d.name}</span></span>
              <button type="button" className="lk-datei__weg" title="Weg"
                onClick={() => setNeue((l) => l.filter((_, j) => j !== i))}>✕</button>
            </div>))}
          {darf && <>
            <button type="button" className="lk-datei lk-datei--neu" id="rk-datei-neu"
              onClick={() => feld.current && feld.current.click()}><span className="klein">+ Foto / PDF</span></button>
            <input ref={feld} type="file" accept="application/pdf,.pdf,image/*" multiple hidden data-ablegen="direkt" id="rk-datei-feld"
              onChange={(e) => { const l0 = Array.from(e.target.files || []); e.target.value = ""; if (l0.length) setNeue((l) => l.concat(l0)); }} />
          </>}
        </div>
        {neueDateien.some((d) => !d._d) && <p className="feldhinweis">Neue Dateien werden beim Speichern hochgeladen.</p>}
      </section>
      </>}

      {hinweis && (schritt === "kopf" || schritt === "artikel") && <p className="feldhinweis" id="rk-hinweis">{hinweis}</p>}

      <div className="rk-weiter">
        <button type="button" className="knopf" id="rk-zurueck" disabled={nr === 0}
          onClick={() => gehe(SCHRITTE[nr - 1].id)}>← Zurück</button>
        {nr < SCHRITTE.length - 1 && <button type="button" className="knopf knopf--haupt" id="rk-weiter"
          onClick={() => gehe(SCHRITTE[nr + 1].id)}>Weiter: {SCHRITTE[nr + 1].kurz} →</button>}
      </div>

      <div className="dialog__knoepfe rk-knoepfe">
        {darf && <button className="knopf knopf--haupt" id="rk-speichern" disabled={speichert}
          onClick={() => speichern(true)}>{speichert ? "Wird gespeichert …" : "Speichern"}</button>}
        <button className="knopf" id="rk-bericht" disabled={speichert || (!r && !darf)} onClick={bericht}>{w.art === "intern" ? "Bericht (PDF)" : "8D-Report (PDF)"}</button>
        {darf && r && <button className="knopf knopf--gefahr" id="rk-loeschen" onClick={loeschen}>Löschen</button>}
      </div>
      </div>
      <aside className="rk-vorschau hell-bleibt" id="rk-vorschau" ref={vorschauRef} aria-label="Vorschau Bericht">
        <div className="rk-vorschau__titel">Vorschau {w.art === "intern" ? "Bericht" : "8D-Report"} <small>so sieht der Bericht aus</small></div>
        <div className="rk-vorschau__blatt" style={{ zoom: zoomV }}
          dangerouslySetInnerHTML={{ __html: achtdVorschau({ ...w, nr: (r && r.nr) || w.nr || "neu", dateien: dateien.concat(neuVorschau) }, VORSCHAU_TEIL[schritt] || "") }} />
      </aside>
    </div>
  );
}


// D8: Nachweis, wer die Massnahme an der Maschine quittiert hat
function RkNachweis({ id }) {
  const [l, setL] = useState(null);
  useEffect(() => { let ok = true; quittungenFuerRk(id).then((x) => ok && setL(x)); return () => { ok = false; }; }, [id]);
  if (!id || !l || !l.length) return null;
  return <div className="rk-nachweis" id="rk-nachweis">
    <span className="rk-gruppe__name">In der Fertigung umgesetzt</span>
    {l.map((q) => <div key={q.id} className="rk-nachweis__zeile">
      ✓ Umgesetzt am {alt.datumZeitKurz ? alt.datumZeitKurz(q.am) : new Date(q.am).toLocaleString("de-CH")} von <b>{q.kuerzel}</b>
      {q.fa_nr ? " · FA " + q.fa_nr : ""}{q.maschine ? " · " + q.maschine : ""} ({q.anlass === "laeuft" ? "Start" : "Rüsten"})</div>)}
  </div>;
}
