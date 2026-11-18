// =================================================================
//  AUSWERTUNG HOFERTIME (seit 1.627.0, Wunsch Patrick 18. November
//  2026: „ich will auch Auswertungen machen können“, „im App auswerten
//  mit graphischen Ansichten“, „Export ist gut“, „täglich ein Excel-
//  Export auf unserem Server“). Lädt alle Personen eines Zeitraums und
//  rechnet je Person Ist, Soll, Differenz, Gleitzeit, Ferien und Tage je
//  Abwesenheit, dazu je Monat und je Abteilung. Gerechnet mit denselben
//  Bausteinen wie die Seite einer Person (zeit.js), darum stimmen die
//  Zahlen mit dem überein, was jede Person bei sich sieht. Nur Admins
//  (die Datenbank gibt anderen nur die eigenen Zeilen). Daraus baut
//  excelMachen die Excel-Datei für den Knopf und den täglichen Export.
// =================================================================
import { alt } from "../bruecke.jsx";
import {
  paareRechnen, tageRechnen, stempelLaden, feiertageLaden, feiertageEintragen, abwesendeTage, sollTag, sollJeTag,
  freierTag, ferienStand, saldoRechnen, ferienStufenLaden, tagVon, uhrzeit,
} from "./zeit.js";

export const ABW_NAMEN = {
  feiertag: "Feiertag", ferien: "Ferien", kompensieren: "Kompensieren", militaer: "Militär/ZS", feuerwehr: "Feuerwehr",
  schule: "Schule", krankheit: "Krankheit", unfall: "Unfall",
};
export const ABW_FARBEN = {
  ferien: "#2e9e5b", kompensieren: "#2f6fd6", militaer: "#6b7a2e", feuerwehr: "#d23c3c", schule: "#8a5cd1",
  krankheit: "#e08a1e", unfall: "#b0306e", feiertag: "#8a96a3",
};
export const OHNE_ABTEILUNG = "Ohne Abteilung";

function erfasst(p) {
  return p && p.is_active !== false && p.role !== "extern" && p.role !== "dienst" && (!p.andere_nutzer || p.nur_zeit) && !p.zeit_terminal;
}

// von, bis: ISO-Tage, bis ausschliesslich
export async function auswertungLaden(von, bis) {
  const heute = alt.isoDatum(new Date());
  const jahrAnfang = heute.slice(0, 4) + "-01-01";
  const [leuteR, einstR, buchR, stufen] = await Promise.all([
    alt.zeitlimit(alt.db.from("profiles").select("id, full_name, email, role, is_active, andere_nutzer, nur_zeit, zeit_terminal"), 10000, "Personen"),
    alt.zeitlimit(alt.db.from("zeit_personen").select("*"), 8000, "Zeit Personen"),
    alt.zeitlimit(alt.db.from("zeit_buchungen").select("*").order("datum"), 8000, "Umbuchungen").then((x) => x, () => ({ data: [] })),
    ferienStufenLaden(),
    feiertageLaden(),
  ]);
  if (leuteR.error) throw leuteR.error;
  const einst = new Map((einstR.data || []).map((e) => [e.person_id, e]));
  const leute = (leuteR.data || []).filter(erfasst).sort((a, b) => alt.personName(a).localeCompare(alt.personName(b)));
  // Stempel ab dem frühesten Saldo-Start, damit die Gleitzeit stimmt
  let ab = [von, jahrAnfang].sort()[0];
  for (const p of leute) { const e = einst.get(p.id); if (e && e.saldo_start_tag && e.saldo_start_tag < ab) ab = e.saldo_start_tag; }
  const morgen = alt.plusTage(heute, 1);
  const stempel = await stempelLaden(null, new Date(ab + "T00:00").toISOString(), new Date((bis > morgen ? bis : morgen) + "T00:00").toISOString());
  if (stempel === null) return { fehlt: true };
  let ferienAb = alt.plusTage(ab, -30);
  for (const e of einst.values()) if (Number(e.ferien_jahr) && e.ferien_jahr + "-01-01" < ferienAb) ferienAb = e.ferien_jahr + "-01-01";
  const jahrEnde = String(Math.max(Number(heute.slice(0, 4)), Number(bis.slice(0, 4)))) + "-12-31";
  const ferien = await Promise.all(leute.map((p) => alt.zeitlimit(
    alt.db.rpc("zeit_abwesenheiten", { p_person: p.id, p_von: ferienAb, p_bis: jahrEnde }), 15000, "Ferien")
    .then((r) => r.data || [], () => [])));
  const buchungen = buchR.data || [];
  return {
    von, bis, heute, stufen,
    personen: leute.map((p, i) => ({
      p, einst: einst.get(p.id) || null, ferien: ferien[i],
      stempel: stempel.filter((s) => s.person_id === p.id),
      buchungen: buchungen.filter((b) => b.person_id === p.id),
    })),
  };
}

const monatVon = (d) => d.slice(0, 7);

// Rechnet die geladenen Daten. Ergebnis je Person:
// { id, name, abteilung, lohnart, ist, soll, diff, saldo, ferien, abw {art: Tage}, monate {JJJJ-MM: {ist, soll}}, tage [...] }
export function auswertungRechnen(d, filter) {
  const f = filter || {};
  const heute = d.heute;
  const ergebnis = [];
  for (const x of d.personen) {
    const abteilung = (x.einst && String(x.einst.abteilung || "").trim()) || OHNE_ABTEILUNG;
    if (f.abteilung && f.abteilung !== abteilung) continue;
    if (f.person && f.person !== x.p.id) continue;
    const tage = tageRechnen(paareRechnen(x.stempel), x.einst || null);
    const abw = feiertageEintragen(abwesendeTage(x.ferien), tage);
    const monatslohn = !!x.einst && x.einst.lohnart !== "stunde";
    // Soll erst ab Beginn der Erfassung (Saldo-Start, sonst erste
    // Stempelung), sonst stünde vor dem Start alles als Minus da
    const beginn = (x.einst && x.einst.saldo_start_tag) || (x.stempel[0] ? tagVon(x.stempel[0].zeit) : "9999");
    let ist = 0, soll = 0;
    const abwZahl = {}, monate = {}, liste = [];
    for (let t = d.von; t < d.bis; t = alt.plusTage(t, 1)) {
      const tg = tage.get(t);
      const im = tg ? tg.minuten : 0;
      const s = monatslohn && t < heute && t >= beginn ? sollTag(t, x.einst, abw) : 0;
      ist += im; soll += s;
      const a = abw.get(t);
      // Gezählt werden Abwesenheiten an Arbeitstagen (mit Soll, bei
      // Stundenlöhnern an jedem Arbeitstag)
      const zaehlt = a && !freierTag(t) && (!monatslohn || sollJeTag(x.einst, t) > 0);
      if (zaehlt) abwZahl[a] = (abwZahl[a] || 0) + 1;
      const m = monate[monatVon(t)] || (monate[monatVon(t)] = { ist: 0, soll: 0, abw: 0 });
      m.ist += im; m.soll += s; if (zaehlt) m.abw++;
      if (im || s || zaehlt) liste.push({
        tag: t, ist: im, soll: s, abw: zaehlt ? a : null, fehler: !!(tg && tg.fehler),
        paare: tg ? tg.paare.map((p) => (p.kommen ? uhrzeit(p.kommen.zeit) : "?") + "–" + (p.gehen ? uhrzeit(p.gehen.zeit) : (p.laeuft ? "jetzt" : "?"))).join(", ") : "",
      });
    }
    const name = alt.personName(x.p);
    const saldo = monatslohn ? saldoRechnen(x.einst, x.stempel, x.ferien, name, x.buchungen) : null;
    const jahr = Number(alt.plusTage(d.bis, -1).slice(0, 4));
    const fe = ferienStand(x.einst, abw, jahr, heute, { stufen: d.stufen, buchungen: x.buchungen });
    ergebnis.push({
      id: x.p.id, name, abteilung, lohnart: x.einst ? x.einst.lohnart : null, monatslohn,
      ist, soll, diff: monatslohn ? ist - soll : null, saldo: saldo ? saldo.min : null,
      ferien: fe, ferienJahr: jahr, abw: abwZahl, monate, tage: liste,
      ersterStempel: x.stempel[0] ? tagVon(x.stempel[0].zeit) : null,
    });
  }
  return ergebnis;
}

export function abteilungenVon(d) {
  return [...new Set(d.personen.map((x) => (x.einst && String(x.einst.abteilung || "").trim()) || OHNE_ABTEILUNG))].sort();
}

export function jeAbteilung(ergebnis) {
  const m = new Map();
  for (const r of ergebnis) {
    const a = m.get(r.abteilung) || { abteilung: r.abteilung, personen: 0, ist: 0, soll: 0, abw: {} };
    a.personen++; a.ist += r.ist; a.soll += r.soll;
    for (const [k, v] of Object.entries(r.abw)) a.abw[k] = (a.abw[k] || 0) + v;
    m.set(r.abteilung, a);
  }
  return [...m.values()].sort((x, y) => x.abteilung.localeCompare(y.abteilung));
}

export function jeMonat(ergebnis) {
  const m = new Map();
  for (const r of ergebnis) for (const [k, v] of Object.entries(r.monate)) {
    const x = m.get(k) || { monat: k, ist: 0, soll: 0, abw: 0 };
    x.ist += v.ist; x.soll += v.soll; x.abw += v.abw;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => a.monat.localeCompare(b.monat));
}

// ---------- Excel ----------
const h = (min) => (min === null || min === undefined ? null : Math.round(min / 60 * 100) / 100);
const datum = (iso) => (iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "");

export async function excelMachen(ergebnis, von, bis) {
  const m = await import("xlsx");
  const X = m.default && m.default.utils ? m.default : m;
  const arten = Object.keys(ABW_NAMEN);
  const bisZeig = alt.plusTage(bis, -1);
  const kopf = [["HOFERTIME Auswertung " + datum(von) + " – " + datum(bisZeig), "", "erstellt " + datum(alt.isoDatum(new Date())) + " " + new Date().toTimeString().slice(0, 5)], []];
  const ueb = kopf.concat([[
    "Person", "Abteilung", "Lohnart", "Ist (h)", "Soll (h)", "Differenz (h)", "Gleitzeit-Saldo heute (h)",
    "Ferien Anspruch", "Ferien bezogen", "Ferien geplant", "Ferien Rest", ...arten.map((a) => ABW_NAMEN[a] + " (Tage)"),
  ]]).concat(ergebnis.map((r) => [
    r.name, r.abteilung, r.lohnart === "stunde" ? "Stundenlohn" : r.lohnart ? "Monatslohn" : "nicht eingestellt",
    h(r.ist), r.monatslohn ? h(r.soll) : null, r.monatslohn ? h(r.diff) : null, h(r.saldo),
    r.ferien.anspruch, r.ferien.bezogen, r.ferien.geplant, r.ferien.rest, ...arten.map((a) => r.abw[a] || 0),
  ]));
  const tage = kopf.concat([["Datum", "Wochentag", "Person", "Abteilung", "Stempelungen", "Ist (h)", "Soll (h)", "Differenz (h)", "Abwesenheit", "Fehler"]]);
  const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  for (const r of ergebnis) for (const t of r.tage) tage.push([
    datum(t.tag), WT[alt.ausIso(t.tag).getDay()], r.name, r.abteilung, t.paare, h(t.ist),
    r.monatslohn ? h(t.soll) : null, r.monatslohn ? h(t.ist - t.soll) : null, t.abw ? ABW_NAMEN[t.abw] || t.abw : "", t.fehler ? "Stempelung fehlt" : "",
  ]);
  const abt = kopf.concat([["Abteilung", "Personen", "Ist (h)", "Soll (h)", "Differenz (h)", ...arten.map((a) => ABW_NAMEN[a] + " (Tage)")]])
    .concat(jeAbteilung(ergebnis).map((a) => [a.abteilung, a.personen, h(a.ist), h(a.soll), h(a.ist - a.soll), ...arten.map((k) => a.abw[k] || 0)]));
  const mon = kopf.concat([["Monat", "Ist (h)", "Soll (h)", "Differenz (h)", "Abwesenheiten (Tage)"]])
    .concat(jeMonat(ergebnis).map((x) => [x.monat.slice(5, 7) + "." + x.monat.slice(0, 4), h(x.ist), h(x.soll), h(x.ist - x.soll), x.abw]));
  const buch = X.utils.book_new();
  const blatt = (zeilen, breiten) => { const b = X.utils.aoa_to_sheet(zeilen); b["!cols"] = breiten.map((w) => ({ wch: w })); return b; };
  X.utils.book_append_sheet(buch, blatt(ueb, [24, 16, 13, 9, 9, 12, 14, 10, 10, 10, 10, 9, 9, 9, 9, 9, 9, 9, 9]), "Übersicht");
  X.utils.book_append_sheet(buch, blatt(tage, [11, 5, 24, 16, 30, 8, 8, 10, 14, 16]), "Tage");
  X.utils.book_append_sheet(buch, blatt(abt, [20, 9, 10, 10, 12, 9, 9, 9, 9, 9, 9, 9, 9]), "Abteilungen");
  X.utils.book_append_sheet(buch, blatt(mon, [10, 10, 10, 12, 14]), "Monate");
  const daten = X.write(buch, { type: "array", bookType: "xlsx" });
  return new Blob([daten], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
