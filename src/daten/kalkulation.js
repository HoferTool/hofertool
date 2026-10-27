// =================================================================
//  KALKULATION (seit 1.214.0, Wunsch Patrick 27. Oktober 2026: wie das
//  Kalkulationsmodul im Gewatec, mit beliebig vielen Staffelmengen,
//  vorerst nur für Patrick; sql/kalkulation.sql)
//
//  Die Rechnung ist genau die des Gewatec, an der Kalkulation 20225174
//  auf den Rappen nachgerechnet (Notizen in den Projektdateien unter
//  erp/gewatec-kalkulation.md):
//
//  Stundensatz einer Maschine im Jahr:
//    Stunden = Arbeitstage × Laufzeit am Tag (beim Arbeitsgang wählbar)
//    fix     = Abschreibung + Zins auf die halbe Anschaffung + Raum
//              + Lohn (nur für die Arbeitszeit, nicht die Laufzeit)
//    variabel je Laufstunde = Strom + Hilfsstoffe + Werkzeug
//              + Instandhaltung (auf die Arbeitszeit ohne Auslastung)
//  Arbeitsgang je Staffel:
//    Rüsten  = (Erstrüsten + Folgerüsten × (Lose − 1)) × Rüstsatz
//    Kosten  = (Laufzeit × Stundensatz + Rüsten) × (1 + FGK)
//    variabel = Laufzeit × variabler Satz (ohne FGK), fix = der Rest
//  Preis: Herstellkosten × (1 + Vw/Vt-GK) + Transport + Verpackung,
//    × (1 + Gewinn), ÷ (1 − Provision − Skonto − Rabatt), gerundet.
// =================================================================
import { alt } from "../bruecke.jsx";

// Zahl aus einem Feld: Komma oder Punkt, Apostroph als Tausender
export function z(wert) {
  if (typeof wert === "number") return isFinite(wert) ? wert : 0;
  const t = String(wert == null ? "" : wert).replace(/['’\s]/g, "").replace(",", ".");
  const n = parseFloat(t);
  return isFinite(n) ? n : 0;
}

// Ausgabe mit Apostroph und festen Stellen (1'234.56)
export function chf(n, stellen = 2) {
  if (n == null || !isFinite(n)) return "–";
  const neg = n < 0;
  const [ganz, rest] = Math.abs(n).toFixed(stellen).split(".");
  const mit = ganz.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return (neg ? "−" : "") + mit + (rest ? "." + rest : "");
}

// ---------- Stundensatz ----------
// Im Gewatec gab es je Maschine mehrere „Schichtmodelle“ (15 h bis 19 h),
// nur um verschiedene Laufzeiten am Tag abzudecken (Patrick 27. Oktober
// 2026: „aufwendig“). Hier gibt es jede Maschine einmal; laufTag kommt
// vom Arbeitsgang, sonst gilt die Vorgabe der Maschine. Hilfsstoffe und
// Werkzeug stehen je Laufstunde da, dann gelten sie bei jeder Laufzeit
// (im Gewatec waren sie das ohnehin: 3'750 bei 15 h, 4'000 bei 16 h …).
export function stundensatz(m, laufTag) {
  const d = (m && m.daten) || {};
  if (d.modus === "hand") {
    const fix = z(d.fix), vari = z(d.var);
    return { fix, var: vari, eff: fix + vari, ruest: d.ruest !== "" && d.ruest != null ? z(d.ruest) : fix + vari, stunden: 0, teile: null };
  }
  const tage = z(d.tage), az = z(d.az);
  const lauf = z(laufTag) > 0 ? z(laufTag) : z(d.laufTag);
  const stunden = tage * lauf;
  const basis = tage * az;
  const wert = z(d.anschaffung) * (d.wbf === "" || d.wbf == null ? 1 : z(d.wbf));
  const teile = {
    abschreibung: z(d.nd) > 0 ? wert / z(d.nd) : 0,
    zins: wert / 2 * z(d.zins) / 100,
    raum: z(d.m2) * z(d.miete),
    lohn: z(d.lohn) * az * tage * (d.lohnAnteil === "" || d.lohnAnteil == null ? 1 : z(d.lohnAnteil) / 100),
    strom: z(d.kw) * z(d.strompreis),
    hilfs: z(d.hilfsH),
    werkzeug: z(d.werkzeugH),
    instand: basis > 0 ? wert * z(d.instand) / 100 / basis : 0,
  };
  const fixJahr = teile.abschreibung + teile.zins + teile.raum + teile.lohn;
  // Auf Rappen gerundet wie im Gewatec, sonst weicht der Preis in der
  // vierten Stelle ab
  const rp = (x) => Math.round(x * 100) / 100;
  const fix = stunden > 0 ? rp(fixJahr / stunden) : 0;
  const vari = rp(teile.strom + teile.hilfs + teile.werkzeug + teile.instand);
  const eff = fix + vari;
  const ruest = d.ruest !== "" && d.ruest != null ? z(d.ruest) : eff;
  return { fix, var: vari, eff, ruest, stunden, lauf, fixJahr, teile };
}

// ---------- Material ----------
// Entweder das Einsatzgewicht je Stück von Hand (wie im Gewatec), oder
// gerechnet aus Durchmesser, Länge je Teil und ganzen Stangen.
export function materialRechnen(mat, menge) {
  const d = z(mat.d), dichte = z(mat.dichte) || 7.85;
  const kgJeM = Math.PI / 4 * d * d * dichte / 1000;
  const stange = z(mat.stange) || 3000;
  let kg, stangen, meter;
  if (mat.modus === "rechnen") {
    const nutzbar = stange - z(mat.rest);
    const jeStange = z(mat.laenge) > 0 ? Math.floor(nutzbar / z(mat.laenge)) : 0;
    stangen = jeStange > 0 ? Math.ceil(menge / jeStange) : 0;
    meter = stangen * stange / 1000;
    kg = meter * kgJeM;
  } else {
    kg = menge * z(mat.einsatz);
    meter = kgJeM > 0 ? kg / kgJeM : 0;
    stangen = meter / (stange / 1000);
  }
  const kosten = kg * z(mat.preis) * (1 + z(mat.gk) / 100);
  return { kg, meter, stangen, kgJeM, kosten, jeStk: menge > 0 ? kosten / menge : 0, kgJeStk: menge > 0 ? kg / menge : 0 };
}

// ---------- Ganze Kalkulation für eine Staffel ----------
export function staffelRechnen(k, staffel, maschinen) {
  const menge = z(staffel.menge), lose = Math.max(1, z(staffel.lose) || 1);
  const mat = materialRechnen(k.material || {}, menge);
  const ags = (k.ags || []).map((ag) => {
    if (ag.art === "extern") {
      // Je Stück oder je kg (Galvanik, Härten); ohne Gewicht gilt der Materialeinsatz
      const jeStk = ag.je === "kg" ? z(ag.extern) * (z(ag.kgStk) || mat.kgJeStk) : z(ag.extern);
      const kosten = menge * jeStk + z(ag.externRuest);
      return { ag, extern: true, kosten, var: menge * jeStk, fix: z(ag.externRuest), ruestChf: z(ag.externRuest), laufH: 0 };
    }
    const m = maschinen.find((x) => x.id === ag.masch);
    const s = m ? stundensatz(m, ag.laufTag) : { fix: 0, var: 0, eff: 0, ruest: 0 };
    const laufH = menge * z(ag.te) / 3600;
    const ruestH = z(ag.erst) + z(ag.folge) * (lose - 1);
    const ruestChf = ruestH * s.ruest;
    const fgk = 1 + z(ag.fgk) / 100;
    const kosten = (laufH * s.eff + ruestChf) * fgk;
    const vari = laufH * s.var;
    return { ag, extern: false, laufH, ruestH, ruestChf, ruestMitFgk: ruestChf * fgk, kosten, var: vari, fix: kosten - vari, satz: s };
  });
  const intern = ags.filter((a) => !a.extern).reduce((s, a) => s + a.kosten, 0);
  const extern = ags.filter((a) => a.extern).reduce((s, a) => s + a.kosten, 0);
  const ruest = ags.filter((a) => !a.extern).reduce((s, a) => s + a.ruestChf, 0);
  const varFert = ags.reduce((s, a) => s + a.var, 0);
  const p = k.preis || {};
  const proStk = (x) => (menge > 0 ? x / menge : 0);
  const herstell = proStk(mat.kosten + intern + extern);
  const selbst = herstell * (1 + z(p.vwgk) / 100);
  const fracht = z(p.transport) + z(p.verpackung);
  const abzug = (z(p.prov) + z(p.skonto) + z(p.rabatt)) / 100;
  const vk = (selbst + fracht) * (1 + z(p.gewinn) / 100) / (abzug < 1 ? 1 - abzug : 1);
  const schritt = z(p.rundung) || 0.01;
  const angebot = Math.round(vk / schritt) * schritt;
  const umsatz = angebot * menge;
  return {
    menge, lose, mat, ags,
    matStk: mat.jeStk, internStk: proStk(intern), externStk: proStk(extern), ruestStk: proStk(ruest),
    herstell, selbst, fracht, vk, angebot, umsatz,
    grenz: mat.jeStk + proStk(varFert) + fracht,
    db: angebot - selbst, dbPct: angebot > 0 ? (angebot - selbst) / angebot * 100 : 0,
    gewinnAuftrag: umsatz - (selbst + fracht) * menge,
    laufH: ags.reduce((s, a) => s + (a.laufH || 0), 0),
  };
}

// ---------- Neue Kalkulation ----------
export function leereKalkulation() {
  return {
    kopf: { kunde: "", adresse: "", artikel: "", zeichnung: "", index: "", bezeichnung: "", anfrage: "", zeichen: "", sachbearbeiter: "" },
    staffeln: [{ menge: "1000", lose: "1" }],
    material: { bez: "", nr: "", preis: "", gk: "", modus: "hand", einsatz: "", d: "", dichte: "7.85", stange: "3000", rest: "", laenge: "" },
    ags: [],
    preis: { vwgk: "", transport: "", verpackung: "", gewinn: "30", prov: "", skonto: "", rabatt: "", rundung: "0.01" },
    angebot: { lieferzeit: "nach Absprache", lieferbed: "franko Domizil, inkl. Verpackung", zahlung: "30 Tage netto", gueltig: "Offerte freibleibend, gültig 1 Monat ab Offertdatum. (Materialpreisveränderungen ausgenommen)" },
  };
}

// ---------- Datenbank ----------
const FEHLT = "Die Kalkulation ist in der Datenbank noch nicht eingerichtet (sql/kalkulation.sql).";
function pruefen(r, was) {
  if (r.error) {
    if (/kalk/.test(r.error.message || "") && /exist|schema cache|find/i.test(r.error.message || "")) throw new Error(FEHLT);
    throw r.error;
  }
  return r.data;
}

export async function kalkulationenLaden() {
  return pruefen(await alt.zeitlimit(alt.db.from("kalkulationen")
    .select("id, nr, kunde, artikel, geaendert_am, daten").order("geaendert_am", { ascending: false }), 10000, "Kalkulationen")) || [];
}

export async function maschinenLaden() {
  return pruefen(await alt.zeitlimit(alt.db.from("kalk_maschinen")
    .select("*").order("sort").order("name"), 10000, "Stundensätze")) || [];
}

export async function kalkulationSpeichern(k) {
  const zeile = { nr: k.nr || null, kunde: k.daten.kopf.kunde || null, artikel: k.daten.kopf.artikel || null,
    daten: k.daten, geaendert_am: new Date().toISOString(), geaendert_von: alt.meineProfilId() };
  if (k.id) {
    const r = await alt.zeitlimit(alt.db.from("kalkulationen").update(zeile).eq("id", k.id).select("id").maybeSingle(), 10000, "Kalkulation");
    pruefen(r);
    return k.id;
  }
  const r = await alt.zeitlimit(alt.db.from("kalkulationen").insert(zeile).select("id").single(), 10000, "Kalkulation");
  return pruefen(r).id;
}

export async function maschineSpeichern(m) {
  const zeile = { name: m.name || "Ohne Namen", sort: m.sort || 0, daten: m.daten || {},
    geaendert_am: new Date().toISOString(), geaendert_von: alt.meineProfilId() };
  if (m.id) {
    pruefen(await alt.zeitlimit(alt.db.from("kalk_maschinen").update(zeile).eq("id", m.id).select("id").maybeSingle(), 10000, "Stundensatz"));
    return m.id;
  }
  return pruefen(await alt.zeitlimit(alt.db.from("kalk_maschinen").insert(zeile).select("id").single(), 10000, "Stundensatz")).id;
}

// Nächste freie Nummer wie im Gewatec: Jahr + laufende Nummer
export function naechsteNr(liste) {
  const jahr = String(new Date().getFullYear());
  const nrn = liste.map((k) => String(k.nr || "")).filter((n) => n.startsWith(jahr)).map((n) => parseInt(n.slice(4), 10) || 0);
  return jahr + String((nrn.length ? Math.max(...nrn) : 0) + 1).padStart(4, "0");
}

// ---------- Beispiel aus dem Gewatec ----------
// Damit Patrick sofort sieht, dass dieselben Zahlen herauskommen
// (Kalkulation 20225174: 8'000 Stk in 2 Losen → 3.80 CHF).
export const BEISPIEL_MASCHINEN = [
  { name: "SW-20", sort: 1, daten: { modus: "rechnen", anschaffung: "305900", wbf: "1", nd: "10", zins: "6.3",
      m2: "40", miete: "120", tage: "231", az: "10", laufTag: "16", lohn: "10.27", lohnAnteil: "100",
      kw: "2.81", strompreis: "0.23", hilfsH: "1.0823", werkzeugH: "2.03", instand: "1.03", ruest: "62" } },
  { name: "Kontrolle", sort: 2, daten: { modus: "hand", fix: "0", var: "0", ruest: "64" } },
  { name: "Reinigungsanlage", sort: 3, daten: { modus: "hand", fix: "0", var: "0", ruest: "14.88" } },
  { name: "Spedition", sort: 4, daten: { modus: "hand", fix: "0", var: "0", ruest: "0" } },
];

// Arbeitsplan, mit dem jede neue Kalkulation startet, wie Patricks
// Dummy im Gewatec (Wunsch Patrick 27. Oktober 2026). Drehen bekommt
// keine Maschine, die wählt man je Teil; Kontrolle, Waschen und Versand
// nehmen die Stundensätze gleichen Namens, wenn es sie gibt.
export const START_MASCHINEN = ["Kontrolle", "Reinigungsanlage", "Spedition"];

export function startArbeitsplan(maschinen) {
  const id = (name) => (maschinen.find((m) => m.name.startsWith(name)) || {}).id || "";
  const ag = (bez, masch, ruest) => ({ bez, art: "intern", masch, te: "0", erst: ruest, folge: ruest, fgk: "" });
  return [
    ag("Material bereitstellen", "", "0"),
    ag("Maschine einrichten", "", "0"),
    ag("Erstteilprüfung", id("Kontrolle"), "0.5"),
    ag("Drehen komplett", "", "0"),
    ag("Waschen fettfrei", id("Reinigungsanlage"), "0"),
    ag("Zwischenkontrolle", id("Kontrolle"), "0.5"),
    ag("Endkontrolle", id("Kontrolle"), "0.5"),
    ag("Versand/Einlagern", id("Spedition"), "0"),
  ];
}

export function beispielKalkulation(maschinen) {
  const id = (name) => (maschinen.find((m) => m.name.startsWith(name)) || {}).id || "";
  const k = leereKalkulation();
  k.kopf = { kunde: "Genge & Thoma AG", adresse: "joysticks & sensors\nBürenstrasse 10\nCH 2543 Lengnau",
    artikel: "10789-0055", zeichnung: "484-260", index: "-", bezeichnung: "Stange Ø 12.7 x 55 poliert",
    anfrage: "2022-04-06", zeichen: "Rohmat.", sachbearbeiter: "" };
  k.staffeln = [{ menge: "8000", lose: "2" }, { menge: "2500", lose: "1" }];
  k.material = { bez: "X10CrNiS18-9 rd 013 mm h8", nr: "1.4305", preis: "7.44", gk: "", modus: "hand", einsatz: "0.0684",
    d: "13", dichte: "7.85", stange: "3000", rest: "", laenge: "" };
  k.ags = [
    { bez: "Erstteilprüfung", art: "intern", masch: id("Kontrolle"), te: "0", erst: "1", folge: "1", fgk: "" },
    { bez: "Drehen komplett", art: "intern", masch: id("SW-20"), te: "190", erst: "5", folge: "5", fgk: "56", laufTag: "16" },
    { bez: "Waschen fettfrei", art: "intern", masch: id("Reinigungsanlage"), te: "0", erst: "1", folge: "1", fgk: "" },
    { bez: "Zwischenkontrolle", art: "intern", masch: id("Kontrolle"), te: "0", erst: "0.5", folge: "0.5", fgk: "" },
    { bez: "Polieren (Käser Biberist AG)", art: "extern", extern: "0.30", externRuest: "" },
    { bez: "Endkontrolle", art: "intern", masch: id("Kontrolle"), te: "0", erst: "0.5", folge: "0.5", fgk: "" },
    { bez: "Versand/Einlagern", art: "intern", masch: id("Spedition"), te: "0", erst: "0", folge: "0", fgk: "" },
  ];
  k.preis = { vwgk: "", transport: "0.0025", verpackung: "", gewinn: "30", prov: "", skonto: "", rabatt: "", rundung: "0.01" };
  return k;
}
