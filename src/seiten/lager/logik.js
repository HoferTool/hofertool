// =================================================================
//  LAGER: RECHNUNG (seit 1.791.0, Wunsch Patrick 24. November 2026)
//  Alles hier rechnet nur aus den geladenen Zeilen, schreibt nichts.
//  Bestand = Summe der Buchungen. Eine Lagerlinie ist HOCO Nr. + Index
//  + Art + Stufe + Lagerplatz: Teile mit verschiedenem Index werden nie
//  zusammengezählt, gehören aber zur selben HOCO Nr. (Patrick: „nicht
//  Teile mit verschiedenen Indexen zusammennehmen, gehört aber trotzdem
//  zusammen“). Stufe = wie viele Schritte des Ablaufs schon gemacht sind.
// =================================================================
import { alt } from "../../bruecke.jsx";

export const ARTEN = [
  ["roh", "Rohteil"],
  ["teil", "Teilfertig"],
  ["fertig", "Ganz fertig"],
];
export const artText = (a) => (ARTEN.find((x) => x[0] === a) || ARTEN[2])[1];

export const GRUENDE_EIN = [
  ["produktion", "Aus der Produktion"],
  ["extern_zurueck", "Zurück vom externen Arbeitsschritt"],
  ["kunde", "Rückgabe vom Kunden"],
  ["korr_plus", "Korrektur (mehr da)"],
];
export const GRUENDE_AUS = [
  ["extern_raus", "An externen Arbeitsschritt"],
  ["auslieferung", "Auslieferung an den Kunden"],
  ["korr_minus", "Korrektur (weniger da, Ausschuss)"],
];
export function grundText(g) {
  const x = GRUENDE_EIN.concat(GRUENDE_AUS).find((e) => e[0] === g);
  return x ? x[1] : (g || "");
}

const nr = (b) => (b.index_nr || "").trim();
export function linieSchluessel(b) {
  return [nr(b), b.art || "fertig", b.stufe == null ? 0 : b.stufe, (b.ort || "").trim()].join("|");
}

// Ablauf einer HOCO Nr. als Liste der externen Schritte (nur bekannte)
export function ablaufVon(daten, hoco) {
  const a = daten.ablaeufe.get(hoco);
  if (!a) return [];
  return (a.schritte || []).map((id) => daten.extern.get(id)).filter(Boolean);
}

export function stufeText(daten, hoco, art, stufe) {
  if (art !== "teil") return "";
  const schritte = ablaufVon(daten, hoco);
  if (!stufe) return schritte.length ? "vor " + schritte[0].schritt : "";
  const s = schritte[stufe - 1];
  return s ? "nach " + s.schritt : "";
}

// Welcher externe Schritt kommt für Teile auf dieser Stufe als Nächstes?
export function naechsterSchritt(daten, hoco, stufe) {
  return ablaufVon(daten, hoco)[stufe || 0] || null;
}

// Art nach dem Einbuchen: sind noch externe Schritte offen, teilfertig
export function artFuerStufe(daten, hoco, stufe) {
  const n = ablaufVon(daten, hoco).length;
  return (stufe || 0) < n ? "teil" : "fertig";
}

// Neue Stufe, wenn Teile von diesem Schritt zurückkommen
export function stufeNach(daten, hoco, extId, stufeVorher) {
  const a = daten.ablaeufe.get(hoco);
  const i = a ? (a.schritte || []).indexOf(extId) : -1;
  return i >= 0 ? Math.max(i + 1, stufeVorher || 0) : (stufeVorher || 0);
}

export function bestandRechnen(buchungen) {
  const je = new Map();
  buchungen.forEach((b) => {
    let e = je.get(b.hoco_nr);
    if (!e) { e = { hoco: b.hoco_nr, menge: 0, linien: new Map(), zuletzt: b.erstellt_am, buchungen: [] }; je.set(b.hoco_nr, e); }
    e.menge += b.menge;
    const k = linieSchluessel(b);
    let l = e.linien.get(k);
    if (!l) { l = { schluessel: k, hoco: b.hoco_nr, index_nr: nr(b), art: b.art || "fertig", stufe: b.stufe || 0, ort: (b.ort || "").trim(), menge: 0 }; e.linien.set(k, l); }
    l.menge += b.menge;
    if (b.erstellt_am > e.zuletzt) e.zuletzt = b.erstellt_am;
    e.buchungen.push(b);
  });
  return [...je.values()].sort((a, b) => a.hoco.localeCompare(b.hoco));
}

// Linien mit Bestand, nach Index, dann Art
export function linienMitBestand(e) {
  const ord = { roh: 0, teil: 1, fertig: 2 };
  return [...e.linien.values()].filter((l) => l.menge !== 0)
    .sort((a, b) => a.index_nr.localeCompare(b.index_nr) || ord[a.art] - ord[b.art] || a.stufe - b.stufe || a.ort.localeCompare(b.ort));
}

// Was ist gerade bei externen Firmen? Je Ausgang „extern raus“ die
// Stück, die noch nicht zurückgebucht sind, solange er nicht erledigt ist.
export function externOffen(buchungen) {
  const zurueck = new Map();
  buchungen.forEach((b) => {
    if (b.bezug_id && b.menge > 0) zurueck.set(b.bezug_id, (zurueck.get(b.bezug_id) || 0) + b.menge);
  });
  return buchungen.filter((b) => b.grund === "extern_raus" && b.menge < 0 && !b.erledigt)
    .map((b) => ({ raus: b, zurueck: zurueck.get(b.id) || 0, offen: -b.menge - (zurueck.get(b.id) || 0) }))
    .filter((x) => x.offen > 0)
    .sort((a, b) => String(a.raus.zurueck_bis || "9999").localeCompare(String(b.raus.zurueck_bis || "9999")));
}

export function heute() { return alt.isoDatum(new Date()); }

// n Arbeitstage nach einem Tag (der Tag selbst zählt nicht)
export function arbeitstageNach(iso, n) {
  if (!n || n < 1) return alt.naechsterArbeitstag(alt.plusTage(iso, 1));
  return alt.arbeitstagePlus(alt.plusTage(iso, 1), n);
}

// n Arbeitstage vor einem Tag
export function arbeitstageVor(iso, n) {
  let d = iso, z = 0;
  while (z < n) {
    d = alt.plusTage(d, -1);
    if (!alt.istWochenende(d)) z++;
  }
  return d;
}

function auftragEnde(j) {
  if (j.planned_to) return String(j.planned_to).slice(0, 10);
  if (j.planned_from) return alt.arbeitstagePlus(String(j.planned_from).slice(0, 10), j.planned_days || 1);
  return null;
}

// Vorbereiten: für jeden offenen Auftrag der Planwand mit Ablauf jeder
// externe Schritt, dessen Firma vorher Bescheid braucht. Raus geht es
// am Arbeitstag nach dem geplanten Ende, danach je Schritt die übliche
// Dauer. Informieren bis = so viele Arbeitstage vorher wie hinterlegt.
export function vorbereitenListe(daten) {
  const liste = [];
  (daten.auftraege || []).forEach((j) => {
    if (j.ended_at || !j.job_number) return;
    const schritte = ablaufVon(daten, j.job_number);
    if (!schritte.length) return;
    let ab = auftragEnde(j);
    if (!ab) return;
    schritte.forEach((ext, i) => {
      const raus = alt.naechsterArbeitstag(alt.plusTage(ab, 1));
      const zurueck = ext.dauer_tage ? alt.arbeitstagePlus(raus, ext.dauer_tage) : raus;
      if ((ext.vorlauf_tage || 0) > 0) {
        liste.push({
          job: j, ext, nr: i + 1, raus, zurueck,
          infoBis: arbeitstageVor(raus, ext.vorlauf_tage),
          avis: daten.avis.get(j.id + "|" + ext.id) || null,
        });
      }
      ab = zurueck;
    });
  });
  return liste.sort((a, b) => (a.avis ? 1 : 0) - (b.avis ? 1 : 0) || a.infoBis.localeCompare(b.infoBis));
}

export function avisText(x, bezeichnung) {
  const kw = alt.kalenderwoche(x.raus);
  return "Guten Tag\n\nWir möchten Sie informieren, dass wir Ihnen voraussichtlich in KW " + kw
    + " (ab " + alt.kurzDatum(x.raus) + ") Teile für " + x.ext.schritt + " senden:\n\n"
    + x.job.job_number + (bezeichnung ? " " + bezeichnung : "") + ", ca. "
    + alt.zahlText(x.job.target_quantity || 0) + " Stk" + (x.job.fa_nr ? " (FA " + x.job.fa_nr + ")" : "")
    + "\n\nFreundliche Grüsse\nHofer + Co. Präzisionsdrehteile";
}

export function ganzeZahl(w) {
  const n = Number(String(w || "").replace(/['’\s]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && Math.round(n) === n ? n : 0;
}

// Tag als 24.11. aus Datum oder Zeitstempel (kurzDatum kennt nur Datum)
export function tagText(ts) {
  if (!ts) return "";
  const s = String(ts);
  return alt.kurzDatum(s.length > 10 ? alt.isoDatum(new Date(s)) : s);
}
