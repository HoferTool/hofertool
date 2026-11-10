// =================================================================
//  QM: Managementbewertung (seit 1.460.0, Etappe 2, Wunsch Patrick
//  10. November 2026)
//
//  Eine Bewertung je Jahr und Fassung in qm_bewertungen
//  (sql/qm-bewertung.sql). Der Inhalt steht als JSON in „inhalt“, nur in
//  der Datenbank. Aufbau wie die bisherige Word-Vorlage
//  „Managementbewertung für das Jahr …“, Eingaben und Ergebnisse nach
//  ISO 9001 Kapitel 9.3.
//
//  KVP im Zentrum: Die Tabellen mit Massnahmen in der Bewertung sind
//  keine eigenen Listen, sondern die KVP-Massnahmen selbst:
//    Status vorangegangene Periode = alles aus früheren Perioden, das zu
//      Beginn des Jahres noch nicht abgeschlossen war, dazu was von Hand
//      mit Abschnitt „status“ für dieses Jahr erfasst ist
//    Veränderungen / Jahresziele = Massnahmen mit diesem Abschnitt und
//      dieser Periode
//  Bei der Freigabe friert die App alles ein, was gerechnet oder aus
//  dem KVP gelesen ist (inhalt.schnapp). Danach sperrt die Datenbank die
//  Zeile; Ändern geht nur als neue Fassung.
// =================================================================
import { alt } from "../bruecke.jsx";
import { jahreRechnen, messwert, ampel } from "./qm.js";

export const ABSCHNITTE = [
  ["", "kein Teil der Bewertung"],
  ["status", "Status vorangegangene Periode"],
  ["veraenderung", "Veränderungen mit Auswirkung aufs QMS"],
  ["jahresziel", "Jahresziele / Verbesserung"],
];

// Leere Bewertung. Organisation und Ort als Vorgabe, alles andere leer.
export function leererInhalt() {
  const nk = () => ({ total: "", arbeit: "", erledigt: "", offen: "", kosten: "", massnahmen: "", bemerkung: "" });
  const rm = () => ({ anzahl: "", positiv: "", negativ: "", art: "", massnahmen: "", bemerkung: "" });
  const au = () => ({ geplant: "", realisiert: "", kritisch: "", feststellungen: "", erledigt: "", erreicht: "", massnahmen: "", bemerkung: "" });
  return {
    kopf: { organisation: "Hofer + Co Präzisionsteile AG", ort: "Lohn-Ammannsegg", gl: "", norm: "ISO 9001:2015",
      ceo: "", ceo_datum: "", ersteller: "", ersteller_datum: "" },
    verlauf: { allgemein: "", positiv: "", negativ: "", fazit: "" },
    rueckmeldungen: { kunden: rm(), mitarbeitende: rm(), parteien: rm() },
    leistung: Object.fromEntries(LEISTUNG.map(([k]) => [k, { text: "", massnahmen: "" }])),
    nk: { lieferanten: nk(), intern: nk(), kunden: nk() },
    audits: { intern: au(), lieferant: au(), kunde: au(), extern: au() },
    ergebnis: { verbesserung: "", aenderung: "", ressourcen: "" },
  };
}

// Themen „Leistung und Wirksamkeit des QMS“ (9.3.2 c bis f)
export const LEISTUNG = [
  ["risiken", "Umgang mit Risiken und Chancen", "Wirksamkeit der Massnahmen, Anzahl Risiken und Chancen"],
  ["prozess", "Prozessleistung und Konformität von Produkten und Dienstleistungen", "Rechtsfälle, Gesetzesliste"],
  ["kpi", "Strategische Zielvorgaben und Kennzahlen", "die Kennzahlen oben gehören hierher"],
  ["ueberwachung", "Ergebnisse aus Überwachungen und Messungen", ""],
  ["extern", "Leistungen von externen Anbietern", ""],
  ["ressourcen", "Angemessenheit von Ressourcen", "Standort, Anlagen, Ausbildung"],
  ["wirksamkeit", "Wirksamkeit des Managementsystems", ""],
  ["fazit", "Fazit / Bemerkungen", ""],
];

export const RUECKMELDUNGEN = [
  ["kunden", "Kunden"], ["mitarbeitende", "Mitarbeitende"], ["parteien", "Interessierte Parteien"],
];
export const NK = [
  ["lieferanten", "Beanstandungen an Lieferanten"], ["intern", "Interne Beanstandungen"], ["kunden", "Beanstandungen von Kunden"],
];
export const AUDITS = [
  ["intern", "Internes Audit"], ["lieferant", "Lieferanten-Audit"], ["kunde", "Kunden-Audit"], ["extern", "Zertifizierungs-Gesellschaft"],
];

// Fehlende Teile (ältere Fassung, eingespielte Daten) mit leeren füllen
export function inhaltVoll(i) {
  const leer = leererInhalt();
  const x = i && typeof i === "object" ? i : {};
  const aus = { ...x };
  for (const [k, v] of Object.entries(leer)) {
    const ist = x[k] && typeof x[k] === "object" ? x[k] : {};
    aus[k] = { ...v, ...ist };
    for (const [k2, v2] of Object.entries(v)) {
      if (v2 && typeof v2 === "object") aus[k][k2] = { ...v2, ...(ist[k2] && typeof ist[k2] === "object" ? ist[k2] : {}) };
    }
  }
  return aus;
}

// ---------- Laden und Speichern ----------
export async function bewertungenLaden() {
  const r = await alt.db.from("qm_bewertungen").select("*").order("jahr", { ascending: false }).order("fassung", { ascending: false });
  if (r.error) throw r.error;
  return r.data || [];
}

export async function bewertungSpeichern(b, inhalt) {
  const { schnapp, ...ohne } = inhalt;
  const r = await alt.db.from("qm_bewertungen").update({ inhalt: ohne, geaendert_am: new Date().toISOString() }).eq("id", b.id);
  if (r.error) throw r.error;
}

// Neue Bewertung für ein Jahr: Kopf vom letzten Jahr übernehmen
export async function bewertungAnlegen(jahr, alle) {
  if (alle.some((b) => b.jahr === jahr)) throw new Error("Für " + jahr + " gibt es schon eine Bewertung.");
  const vorher = alle.filter((b) => b.jahr < jahr).sort((a, b) => b.jahr - a.jahr || b.fassung - a.fassung)[0];
  const inhalt = leererInhalt();
  if (vorher) inhalt.kopf = { ...inhalt.kopf, ...inhaltVoll(vorher.inhalt).kopf, ceo_datum: "", ersteller_datum: "" };
  const r = await alt.db.from("qm_bewertungen").insert({ jahr, fassung: 1, status: "entwurf", von: jahr + "-01-01", bis: jahr + "-12-31", inhalt })
    .select("id");
  if (r.error) throw r.error;
  const id = Array.isArray(r.data) && r.data[0] && r.data[0].id;
  if (id) alt.merkeSchritt("Managementbewertung " + jahr, alt.rueckWeg("qm_bewertungen", { id }));
  return id;
}

export async function neueFassung(b, alle) {
  const fassung = Math.max(...alle.filter((x) => x.jahr === b.jahr).map((x) => x.fassung || 1)) + 1;
  const { schnapp, ...inhalt } = inhaltVoll(b.inhalt);
  const r = await alt.db.from("qm_bewertungen").insert({ jahr: b.jahr, fassung, status: "entwurf", von: b.von, bis: b.bis, inhalt })
    .select("id");
  if (r.error) throw r.error;
  const id = Array.isArray(r.data) && r.data[0] && r.data[0].id;
  if (id) alt.merkeSchritt("Fassung " + fassung + " der Bewertung " + b.jahr, alt.rueckWeg("qm_bewertungen", { id }));
  return id;
}

export async function bewertungLoeschen(b) {
  const vorher = await alt.rueckSichern("qm_bewertungen", { id: b.id });
  const r = await alt.db.from("qm_bewertungen").delete().eq("id", b.id);
  if (r.error) throw r.error;
  alt.merkeSchritt("Löschen der Bewertung " + b.jahr, alt.rueckRein("qm_bewertungen", vorher));
}

// Freigabe: alles Gerechnete einfrieren. Kein Rückgängig, die Datenbank
// sperrt die Zeile danach (gewollt: Änderungen nur als neue Fassung).
export async function freigeben(b, inhalt, ansicht) {
  const name = alt.personName(alt.profil, "");
  const neu = { ...inhalt, schnapp: { ...ansicht, eingefroren: new Date().toISOString() } };
  const r = await alt.db.from("qm_bewertungen").update({
    inhalt: neu, status: "freigegeben", freigegeben_am: new Date().toISOString(),
    freigegeben_name: name || null, geaendert_am: new Date().toISOString(),
  }).eq("id", b.id);
  if (r.error) throw r.error;
}

// ---------- Massnahmen je Abschnitt ----------
const ZEIGEN = ["id", "nr", "thema", "massnahme", "beschreibung", "wer", "termin", "messgroesse", "ziel", "ist",
  "status", "wirksamkeit", "abschnitt", "periode"];

export function massnahmenFuer(jahr, massnahmen, messgroessen) {
  const anfang = jahr + "-01-01";
  const name = (id) => ((messgroessen || []).find((m) => m.id === id) || {}).name || "";
  const knapp = (m) => Object.fromEntries(ZEIGEN.map((k) => [k, k === "messgroesse" ? name(m.messgroesse_id) : m[k] ?? null]));
  const status = massnahmen.filter((m) =>
    (m.periode === jahr && m.abschnitt === "status")
    || (m.periode != null && m.periode < jahr && (!m.abgeschlossen_am ? !["wirksam", "unwirksam"].includes(m.status) : m.abgeschlossen_am >= anfang)));
  return {
    status: status.map(knapp),
    veraenderung: massnahmen.filter((m) => m.periode === jahr && m.abschnitt === "veraenderung").map(knapp),
    jahresziel: massnahmen.filter((m) => m.periode === jahr && m.abschnitt === "jahresziel").map(knapp),
  };
}

// 2025-12-31 → 31.12.2025 (kurzDatum lässt das Jahr weg)
export const datumVoll = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || "")); return m ? m[3] + "." + m[2] + "." + m[1] : ""; };

// „Erreicht?“ in der Bewertung aus dem Status der Massnahme
export function erreichtText(s) {
  return { wirksam: "Ja", unwirksam: "Nein", erledigt: "erledigt, Wirksamkeit prüfen", laeuft: "in Arbeit", offen: "offen" }[s] || "";
}

// ---------- Kennzahlen aus dem HoferTool ----------
// Die Statistik zählt erst ab 26. Oktober 2026 (STATISTIK_AB), der
// heutige Tag nie. Werte ohne Grundlage bleiben leer.
export const STATISTIK_AB = "2026-10-26";

export async function kennzahlenLaden(von, bis, massnahmen) {
  const gestern = alt.plusTage(alt.isoDatum(new Date()), -1);
  const aus = { von, bis, statistikVon: null, statistikBis: null, werte: {}, hinweise: [] };
  const sv = von < STATISTIK_AB ? STATISTIK_AB : von;
  const sb = bis > gestern ? gestern : bis;
  const st = await import("./statistik.js");
  if (sv <= sb) {
    try {
      const r = st.statistikRechnen(await st.statistikLaden(sv, sb));
      const g = r.gesamt;
      aus.statistikVon = sv; aus.statistikBis = sb;
      aus.werte.ausstoss_stk = g.stk;
      aus.werte.produktion_h = g.h;
      aus.werte.auslastung_pct = Number.isFinite(g.auslastung) ? g.auslastung * 100 : null;
      aus.werte.ausschuss_stk = g.ausschuss;
      aus.werte.ausschuss_pct = Number.isFinite(g.ausschussQuote) ? g.ausschussQuote * 100 : null;
      aus.werte.ausschuss_meldungen = (g.ausschussMeldungen || []).length;
      aus.werte.ruesten_h = Number.isFinite(g.uebergangMittel) ? g.uebergangMittel / 3600000 : null;
      aus.werte.wechsel = (g.uebergaenge || []).length;
      aus.werte.auftraege = g.auftraege;
      aus.werte.maschinen = (g.maschinen || []).length;
    } catch (f) { aus.hinweise.push("Produktion: " + alt.fehlertext(f)); }
  } else aus.hinweise.push("Die Produktionszahlen zählt das HoferTool erst ab 26.10.2026.");
  try {
    const w = await st.werkzeugLaden(von, bis > gestern ? gestern : bis);
    aus.werte.werkzeug_pos = w.positionen.length;
  } catch (f) { aus.hinweise.push("Bestellungen: " + alt.fehlertext(f)); }
  try {
    const r = await alt.db.rpc("qm_solar", { von, bis });
    const z = Array.isArray(r.data) ? r.data[0] : r.data;
    if (!r.error && z && z.tage) {
      const eigen = Number(z.ertrag_kwh || 0) - Number(z.eingespeist_kwh || 0);
      const verbrauch = eigen + Number(z.bezug_kwh || 0);
      aus.werte.solar_kwh = Number(z.ertrag_kwh || 0);
      aus.werte.solar_pct = verbrauch > 0 ? eigen / verbrauch * 100 : null;
      aus.werte.solar_tage = z.tage;
    }
  } catch (f) { /* ohne Solar geht es auch */ }
  // KVP
  const imJahr = (d) => d && d >= von && d <= bis;
  const jahr = Number(String(von).slice(0, 4));
  const heute = alt.isoDatum(new Date());
  aus.werte.kvp_neu = massnahmen.filter((m) => m.periode === jahr || imJahr(String(m.erstellt_am || "").slice(0, 10))).length;
  aus.werte.kvp_abgeschlossen = massnahmen.filter((m) => imJahr(m.abgeschlossen_am)).length;
  aus.werte.kvp_wirksam = massnahmen.filter((m) => m.status === "wirksam" && imJahr(m.abgeschlossen_am)).length;
  aus.werte.kvp_offen = massnahmen.filter((m) => !["wirksam", "unwirksam"].includes(m.status)).length;
  aus.werte.kvp_spaet = massnahmen.filter((m) => m.termin && m.termin < heute && ["offen", "laeuft"].includes(m.status)).length;
  return aus;
}

export const AUTO_ZEILEN = [
  ["auslastung_pct", "Auslastung der Anlagen", "%", "10 h je Arbeitstag = 100 %, nur Tage mit Stückzahl"],
  ["produktion_h", "Produktionszeit", "h", "Stück × Stückzeit"],
  ["ausstoss_stk", "Ausstoss", "Stück", ""],
  ["ausschuss_pct", "Ausschussquote", "%", "aus den QS-Meldungen"],
  ["ausschuss_meldungen", "QS-Meldungen Ausschuss", "Anzahl", ""],
  ["ruesten_h", "Rüst- und Übergangszeit Ø je Wechsel", "h", ""],
  ["wechsel", "Auftragswechsel", "Anzahl", ""],
  ["werkzeug_pos", "Bestellpositionen", "Anzahl", "ganzes Jahr"],
  ["solar_pct", "Eigenstrom vom Verbrauch", "%", "nur Tage mit Solardaten (90 Tage Vorrat)"],
  ["kvp_neu", "KVP: neue Massnahmen", "Anzahl", ""],
  ["kvp_abgeschlossen", "KVP: abgeschlossen", "Anzahl", ""],
  ["kvp_wirksam", "KVP: davon wirksam", "Anzahl", ""],
  ["kvp_offen", "KVP: jetzt offen", "Anzahl", "Stand heute"],
  ["kvp_spaet", "KVP: Termin überschritten", "Anzahl", "Stand heute"],
];

// ---------- Was die Bewertung zeigt (live oder eingefroren) ----------
// Wirtschaftszahlen der letzten sieben Jahre, Messgrössen mit Vorjahr,
// Ist und Ampel (auto-Werte aus dem HoferTool, wo von Hand nichts steht)
export const WIRTSCHAFT_ZEILEN = [
  ["umsatz", "Umsatz", "CHF"], ["umsatzziel_pct", "Umsatzziel erreicht", "%"],
  ["ebit_marge_pct", "EBIT-Marge", "%"], ["ebit_marge_vj", "EBIT-Marge zum Vorjahr", "Pp."],
  ["personal_pct", "Personalkosten vom Umsatz", "%"], ["material_pct", "Materialaufwand vom Umsatz", "%"],
  ["umsatz_je_vz", "Umsatz je Vollzeitstelle", "CHF"], ["umsatz_je_h", "Umsatz je Kapazitätsstunde", "CHF"],
];

export function ansichtRechnen(jahr, daten, auto) {
  const gerechnet = jahreRechnen(daten.werte);
  const jahre = [];
  for (let j = jahr - 6; j <= jahr; j++) jahre.push(j);
  const wirtschaft = {
    jahre,
    zeilen: WIRTSCHAFT_ZEILEN.map(([k, text, einheit]) => ({ k, text, einheit, werte: jahre.map((j) => (gerechnet[j] || {})[k] ?? null) }))
      .filter((z) => z.werte.some((w) => w != null)),
  };
  const autoJahr = auto ? { [jahr]: auto.werte } : {};
  const mit = (m, j) => {
    const v = messwert(m, j, gerechnet);
    if (v != null || m.quelle !== "auto") return v;
    return (autoJahr[j] || {})[m.schluessel] ?? null;
  };
  const kennzahlen = daten.messgroessen.filter((m) => m.aktiv !== false).map((m) => {
    const ist = mit(m, jahr), vj = mit(m, jahr - 1);
    return { id: m.id, name: m.name, einheit: m.einheit, ziel: m.ziel != null ? Number(m.ziel) : null, richtung: m.richtung,
      gelb: m.gelb != null ? Number(m.gelb) : null, norm: m.norm, vorjahr: vj, ist, ampel: ampel(m, ist),
      trend: ist != null && vj != null ? (ist > vj ? "↗" : ist < vj ? "↘" : "→") : "" };
  });
  return { jahr, wirtschaft, kennzahlen, auto: auto || null, massnahmen: massnahmenFuer(jahr, daten.massnahmen, daten.messgroessen) };
}
