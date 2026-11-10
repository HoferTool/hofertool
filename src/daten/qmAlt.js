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

export const PROZESS_GRUPPEN = [
  ["fuehrung", "Führungsprozesse"],
  ["kern", "Kernprozesse (Wertschöpfung)"],
  ["unterstuetzung", "Unterstützungsprozesse"],
];
export const PROZESS_FELDER = [
  { k: "zweck", text: "Zweck" },
  { k: "verantwortlich", text: "Verantwortlich" },
  { k: "eingaben", text: "Auslöser / Eingaben" },
  { k: "ablauf", text: "Ablauf", lang: true },
  { k: "ergebnisse", text: "Ergebnis" },
  { k: "nachweis", text: "Nachweis (wo im HoferTool)", lang: true },
  { k: "kennzahl", text: "Kennzahl" },
  { k: "risiken", text: "Typische Risiken" },
];

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
    titel: "Risiken und Chancen", einzeln: "Risiko / Chance", norm: "6.1",
    hinweis: "Nur was uns wirklich treffen oder weiterbringen kann. Bewertung: Wahrscheinlichkeit × Auswirkung, je 1 bis 3. Ab 6 braucht es eine Massnahme. Einmal im Jahr durchsehen.",
    felder: [
      { k: "typ", text: "Art", auswahl: [["risiko", "Risiko"], ["chance", "Chance"]], vorgabe: "risiko" },
      { k: "titel", text: "Was", pflicht: true },
      { k: "prozess", text: "Bereich / Prozess" },
      { k: "folge", text: "Ursache und Folge", typ: "textarea" },
      { k: "w", text: "Wahrscheinlichkeit 1–3", auswahl: [["1", "1 selten"], ["2", "2 möglich"], ["3", "3 häufig"]], vorgabe: "2" },
      { k: "a", text: "Auswirkung 1–3", auswahl: [["1", "1 klein"], ["2", "2 spürbar"], ["3", "3 gross"]], vorgabe: "2" },
      { k: "massnahme", text: "Massnahme / Nutzen", typ: "textarea" },
      { k: "wer", text: "Wer" },
      { k: "pruef_am", text: "Wieder ansehen am", typ: "date", vorgabe: () => plusMonate(heute(), 12) },
    ],
    status: [S("beobachten", "Beobachten", "blau"), S("massnahme", "Massnahme läuft", "gelb"), S("erledigt", "Im Griff", "gruen")],
    zu: [],
    faellig: (d) => d.pruef_am || null,
    spalten: [["typ", "Art"], ["titel", "Was"], ["prozess", "Bereich"], ["wert", "W × A"], ["massnahme", "Massnahme"], ["wer", "Wer"], ["faellig", "Ansehen"], ["status", "Status"]],
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
    hinweis: "Interne Audits einmal im Jahr über alle Prozesse, verteilt wie es passt. Auch Kunden- und Zertifizierungsaudits hier ablegen. Feststellungen gehen mit einem Tipp in die Liste Abweichungen.",
    felder: [
      { k: "art", text: "Art", auswahl: [["intern", "Internes Audit"], ["zert", "Zertifizierung / Überwachung"], ["kunde", "Kundenaudit"], ["lieferant", "Lieferantenaudit (bei uns gemacht)"]], vorgabe: "intern" },
      { k: "titel", text: "Prozesse / Thema", pflicht: true, platzhalter: "Fertigung und Prüfen" },
      { k: "datum", text: "Datum", typ: "date" },
      { k: "auditor", text: "Auditor" },
      { k: "ergebnis", text: "Ergebnis, Stärken", typ: "textarea" },
      { k: "feststellungen", text: "Feststellungen (eine je Zeile)", typ: "textarea", zeilen: 4 },
    ],
    status: [S("geplant", "Geplant", "blau"), S("durchgefuehrt", "Durchgeführt", "gruen")],
    zu: ["durchgefuehrt"],
    // Durchgeführt ist es erst fertig, wenn die Feststellungen übertragen sind
    fertig: (e) => e.status === "durchgefuehrt" && (!String((e.daten || {}).feststellungen || "").trim() || !!(e.daten || {}).uebertragen),
    faellig: (d) => d.datum || null,
    spalten: [["datum", "Datum"], ["art", "Art"], ["titel", "Thema"], ["auditor", "Auditor"], ["feststellungen", "Feststellungen"], ["status", "Status"]],
  },
};

export const statusVon = (art, s) => (ARTEN[art] && ARTEN[art].status.find((x) => x.wert === s)) || { wert: s, text: s || "", ton: "grau" };
export const istZu = (e) => !ARTEN[e.art] ? e.status === "freigegeben"
  : ARTEN[e.art].fertig ? ARTEN[e.art].fertig(e) : ARTEN[e.art].zu.includes(e.status);
export const auswahlText = (art, k, w) => {
  const f = ARTEN[art] && ARTEN[art].felder.find((x) => x.k === k);
  const a = f && f.auswahl && f.auswahl.find((x) => x[0] === String(w ?? ""));
  return a ? a[1] : (w ?? "");
};

// Wert Risiko und Note Lieferant
export const risikoWert = (d) => Number(d.w || 0) * Number(d.a || 0);
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
    risiken: risiken.length, risikenHoch: risiken.filter((e) => e.daten.typ !== "chance" && risikoWert(e.daten) >= 6).length,
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
  const prozesse = Object.values(texte).filter((x) => String(x.schluessel).startsWith("prozess:"));
  const hatProzess = (wort) => prozesse.some((p) => new RegExp(wort, "i").test(p.titel || ""));
  const vorJahr = plusMonate(heute(), -12);
  const auditJ = von("audit").some((e) => e.daten.art === "intern" && e.status === "durchgefuehrt" && (e.daten.datum || "") >= vorJahr);
  const auditGeplant = von("audit").some((e) => e.daten.art === "intern" && e.status === "geplant");
  const bewertung = von("bewertung").some((e) => e.status === "freigegeben" && (e.daten.datum || "") >= plusMonate(heute(), -13));
  const bewertungEntwurf = von("bewertung").some((e) => e.status !== "freigegeben");
  const matrix = texte.matrix && texte.matrix.felder && (texte.matrix.felder.personen || []).length;
  const besser = von("abweichung").some((e) => (e.daten.quelle === "idee" || e.status === "wirksam") && (e.daten.datum || "") >= vorJahr);
  const z = (norm, titel, wo, stand, tipp) => ({ norm, titel, wo, stand, tipp });
  const zu = (b) => (b ? "ok" : "fehlt");
  const ohneUeber = (art, n) => !von(art).length ? "fehlt" : (n ? "warn" : "ok");
  return [
    z("4.1 · 4.2", "Kontext und interessierte Parteien", "Handbuch", t("kontext") && t("parteien") ? "ok" : "fehlt", "Abschnitte Kontext und Parteien ausfüllen"),
    z("4.3", "Geltungsbereich", "Handbuch", zu(t("geltungsbereich")), "Abschnitt Geltungsbereich ausfüllen"),
    z("4.4", "Prozesse", "Handbuch → Prozesse", prozesse.length >= 3 ? "ok" : "fehlt", "Prozesse beschreiben"),
    z("5.1", "Führung und Qualitätskultur", "Handbuch", zu(t("kultur")), "Abschnitt Qualitätskultur ausfüllen"),
    z("5.2", "Qualitätspolitik", "Handbuch", zu(t("politik")), "Politik schreiben und aushängen"),
    z("5.3", "Rollen und Verantwortung", "Handbuch", zu(t("organisation")), "Rollen festhalten"),
    z("6.1", "Risiken und Chancen", "Risiken und Chancen", ohneUeber("risiko", ueber("risiko")), "Risiken erfassen, Fällige durchsehen"),
    z("6.2", "Qualitätsziele", "Ziele", von("ziel").some((e) => String(e.daten.jahr) === String(jahr)) ? "ok" : "fehlt", "Ziele für " + jahr + " setzen"),
    z("6.3", "Planung von Änderungen", "Handbuch", zu(t("aenderungen")), "Abschnitt Änderungen ausfüllen"),
    z("7.1.3", "Infrastruktur, Instandhaltung", "HoferTool: Maschinen, Wartung, Backup-Batterien", "ok", ""),
    z("7.1.5", "Prüfmittel", "Prüfmittel", ohneUeber("pruefmittel", ueber("pruefmittel")), "Prüfmittel erfassen, Fällige prüfen"),
    z("7.1.6", "Wissen", "Handbuch · HoferTool: Einrichtblatt, Notizbücher, Unterlagen", zu(t("wissen")), "Abschnitt Wissen ausfüllen"),
    z("7.2 · 7.3", "Kompetenz und Bewusstsein", "Kompetenzen", matrix ? (ueber("schulung") ? "warn" : "ok") : "fehlt", "Kompetenzmatrix ausfüllen"),
    z("7.4", "Kommunikation", "Handbuch · HoferTool: Infoboard, Meldungen", zu(t("kommunikation")), "Abschnitt Kommunikation ausfüllen"),
    z("7.5", "Dokumentierte Information", "Handbuch · dieses QM im HoferTool", zu(t("dokumente")), "Abschnitt Dokumente ausfüllen"),
    z("8.1", "Betriebliche Planung", "HoferTool: Planwand, Material", "ok", ""),
    z("8.2", "Anforderungen an Produkte", "Prozess Anfrage und Offerte · Kalkulation", hatProzess("anfrage|offerte") ? "ok" : "fehlt", "Prozess Anfrage und Offerte beschreiben"),
    z("8.3", "Entwicklung", "Nicht anwendbar: reiner Lohnfertiger nach Kundenzeichnung", "na", ""),
    z("8.4", "Externe Anbieter", "Lieferantenbewertung · HoferTool: Bestellungen", ohneUeber("lieferant", ueber("lieferant")), "Lieferanten bewerten"),
    z("8.5.1", "Produktion beherrschen", "HoferTool: Einrichtblatt, Werkzeugwechsel, Stückzahlen, Pad Mode", "ok", ""),
    z("8.5.2–8.5.4", "Kennzeichnung, Kundeneigentum, Erhaltung", "Handbuch · HoferTool: FA Nr., WBG", zu(t("kennzeichnung")), "Abschnitt Kennzeichnung ausfüllen"),
    z("8.6", "Freigabe", "Prozess Prüfen · HoferTool: QS Check, Keyence Berichte", hatProzess("pr[üu]f") ? "ok" : "fehlt", "Prozess Prüfen und Versand beschreiben"),
    z("8.7", "Nichtkonforme Ergebnisse", "Abweichungen · HoferTool: QS-Meldungen", ueber("abweichung") ? "warn" : "ok", "Überfällige Abweichungen erledigen"),
    z("9.1", "Überwachung, Kundenzufriedenheit", "Ziele · Handbuch · HoferTool: Statistik", t("kundenzufriedenheit") ? "ok" : "fehlt", "Abschnitt Kundenzufriedenheit ausfüllen"),
    z("9.2", "Internes Audit", "Audits", auditJ ? "ok" : (auditGeplant ? "warn" : "fehlt"), "Internes Audit planen und durchführen"),
    z("9.3", "Managementbewertung", "Managementbewertung", bewertung ? "ok" : (bewertungEntwurf ? "warn" : "fehlt"), "Managementbewertung machen und freigeben"),
    z("10.2", "Korrekturmassnahmen", "Abweichungen", ueber("abweichung") ? "warn" : "ok", "Überfällige Massnahmen erledigen"),
    z("10.3", "Fortlaufende Verbesserung", "Abweichungen (Ideen, wirksame Massnahmen)", besser ? "ok" : "warn", "Verbesserungen festhalten"),
  ];
}
