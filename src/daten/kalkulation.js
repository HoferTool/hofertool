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
// Spezifisches Gewicht wie im Gewatec (Bild Patrick 27. Oktober 2026), kg/dm³
export const SPEZ_GEWICHT = [
  ["Stahl", "7.85"], ["Alu, legiert", "2.842"], ["Messing", "8.493"], ["Gusseisen", "7.269"], ["Alu, rein", "2.70"],
  ["Kupfer", "8.885"], ["Silber", "10.50"], ["Titan", "4.65"], ["Kunststoff", "1.41"], ["Profilmaterial SEA", "8.00"],
  ["POM-H", "1.43"], ["Neusilber Rohr", "8.70"],
];

// Körper wie in der Einsatzgewichtsberechnung des Gewatec (seit 1.856.0,
// Wunsch Patrick 26. November 2026: „brauche nur Rund, Vierkant, Sechskant
// und Rohr“): Querschnitt in mm²; leer = Rund.
export const MAT_FORMEN = [["rund", "Rund"], ["vierkant", "Vierkant"], ["sechskant", "Sechskant"], ["rohr", "Rohr"]];
export function querschnitt(mat) {
  const d = z(mat.d);
  if (mat.form === "vierkant") return d * (z(mat.b) || d);
  if (mat.form === "sechskant") return Math.sqrt(3) / 2 * d * d;
  if (mat.form === "rohr") { const i = Math.min(z(mat.di), d); return Math.PI / 4 * (d * d - i * i); }
  return Math.PI / 4 * d * d;
}

export function materialRechnen(mat, menge) {
  const dichte = z(mat.dichte) || 7.85;
  const kgJeM = querschnitt(mat) * dichte / 1000;
  const stange = z(mat.stange) || 3000;
  const ausschuss = Math.max(0, z(mat.ausschuss));
  const faktor = 1 + ausschuss / 100;
  let kg, stangen, meter;
  let jeStange = 0, einsatzKg = 0, restStange = 0, stangeKg = kgJeM * stange / 1000, kgOhneAusschuss;
  if (mat.modus === "rechnen") {
    // Genau wie im Gewatec: Stück je Stange = (Stange − Reststück) / (Länge Teil
    // + Abstechbreite + Plandrehzugabe), abgerundet; Rest je Stange = was übrig
    // bleibt; Einsatz je Stück = Stangengewicht / Stück je Stange × (1 + Ausschuss),
    // auf 4 Stellen gerundet; kg gesamt = Stück × Einsatz, Stangen = Stück /
    // Stück je Stange × (1 + Ausschuss).
    const lges = z(mat.laenge) + z(mat.abstich) + z(mat.plan);
    const nutzbar = stange - z(mat.rest);
    jeStange = lges > 0 ? Math.max(0, Math.floor(nutzbar / lges + 1e-9)) : 0;
    restStange = jeStange > 0 ? stange - jeStange * lges : 0;
    einsatzKg = jeStange > 0 ? Math.round(stangeKg / jeStange * faktor * 10000) / 10000 : 0;
    kg = menge * einsatzKg;
    kgOhneAusschuss = kg / faktor;
    stangen = jeStange > 0 ? menge / jeStange * faktor : 0;
    meter = stangen * stange / 1000;
  } else {
    kg = menge * z(mat.einsatz);
    meter = kgJeM > 0 ? kg / kgJeM : 0;
    stangen = meter / (stange / 1000);
    einsatzKg = z(mat.einsatz);
    // Ausschuss in % am Schluss auf kg, Meter und Stangen (wie seit 1.238.0)
    kgOhneAusschuss = kg;
    kg *= faktor; meter *= faktor; stangen *= faktor;
  }
  // Wie im Gewatec: Mat-Kosten = kg gesamt × Preis, dann Gemeinkosten in % und pauschal
  const roh = kg * z(mat.preis);
  const kosten = roh * (1 + z(mat.gk) / 100) + z(mat.gkPausch);
  return { kg, meter, stangen, kgJeM, jeStange, einsatzKg, restStange, stangeKg, roh, kosten, ausschuss, jeStk: menge > 0 ? kosten / menge : 0, kgJeStk: menge > 0 ? kg / menge : 0,
    // Gewicht je Gutteil ohne Ausschuss, für externe Arbeitsgänge je kg
    kgJeStkNetto: menge > 0 ? kgOhneAusschuss / menge : 0 };
}

// ---------- Ganze Kalkulation für eine Staffel ----------
export const WAEHRUNGEN = ["CHF", "EUR", "USD"];

// Aktueller Kurs: 1 CHF = kurs in der Zielwährung. Zuerst die Kurse der
// Europäischen Zentralbank (Frankfurter, täglich), sonst open.er-api.com.
export async function kursHolen(waehrung) {
  if (waehrung === "CHF") return { kurs: 1, datum: "" };
  try {
    const a = await fetch("https://api.frankfurter.dev/v1/latest?base=CHF&symbols=" + waehrung);
    const d = await a.json();
    if (d && d.rates && d.rates[waehrung]) return { kurs: d.rates[waehrung], datum: d.date, quelle: "EZB" };
  } catch (e) { /* weiter mit der zweiten Quelle */ }
  const a = await fetch("https://open.er-api.com/v6/latest/CHF");
  const d = await a.json();
  if (!d || !d.rates || !d.rates[waehrung]) throw new Error("Kein Wechselkurs erhalten.");
  return { kurs: d.rates[waehrung], datum: new Date((d.time_last_update_unix || 0) * 1000).toISOString().slice(0, 10), quelle: "open.er-api.com" };
}

// Externer Arbeitsgang wie im Gewatec (Bild Patrick 27. Oktober 2026):
// Kostensatz je Stück, 100 Stück, 1000 Stück oder kg; ein Postensatz
// (pauschal) gilt bis zum eingetragenen Gewicht statt des Satzes, ohne
// Gewicht immer. Dazu Rüst-, Werkzeug-, Verpackungs-, Transport- und
// Protokollkosten je Stück und pauschal; Rüsten und Werkzeug nur mit
// „Verrechnen“. Ohne Gewicht je Stück gilt der Materialeinsatz.
export const EXTERN_NEBEN = [
  ["ruest", "Rüstkosten", true], ["werkz", "Werkzeugkosten", true], ["verp", "Verpackungskosten", false],
  ["transp", "Transportkosten", false], ["prot", "Oberflächenprotokoll", false],
];
export const EXTERN_JE = { stk: 1, "100stk": 100, "1000stk": 1000 };

export function externRechnen(ag, menge, mat) {
  const kgStk = z(ag.kgStk) || mat.kgJeStkNetto;
  const gewicht = menge * kgStk;
  let satz = ag.je === "kg" ? gewicht * z(ag.extern) : menge / (EXTERN_JE[ag.je] || 1) * z(ag.extern);
  const posten = z(ag.posten) > 0 && (!(z(ag.postenBis) > 0) || gewicht <= z(ag.postenBis));
  if (posten) satz = z(ag.posten);
  let varK = posten ? 0 : satz, fixK = posten ? satz : 0, ruestChf = 0;
  const neben = EXTERN_NEBEN.map(([n, , verrechnen]) => {
    const pausch = n === "ruest" && ag.ruestPausch == null ? z(ag.externRuest) : z(ag[n + "Pausch"]);
    const wert = menge * z(ag[n + "Stk"]) + pausch;
    const zaehlt = !verrechnen || ag[n + "Verr"] !== false;
    if (zaehlt) { varK += menge * z(ag[n + "Stk"]); fixK += pausch; if (n === "ruest") ruestChf = wert; }
    return { n, wert, zaehlt };
  });
  const kosten = varK + fixK;
  return { ag, extern: true, kosten, var: varK, fix: fixK, ruestChf, laufH: 0, gewicht, kgStk, satz, posten, neben,
    einzel: menge > 0 ? kosten / menge : 0 };
}

// Multimaschinell wie im Gewatec (Wunsch Patrick 27. Oktober 2026): ein
// interner Arbeitsgang kann je Staffel eine andere Maschine, Stückzeit,
// Rüstzeit und FGK haben, etwa kleine Mengen auf der Index und grosse auf
// der Star. Die Werte liegen bei der Staffel (staffel.ag[Schlüssel des AG]),
// damit sie mit der Staffel verschwinden; leer = Wert des Arbeitsgangs.
// Alle Kosten oben im Reiter Preis lassen sich je Staffel anders setzen
// (Wunsch Patrick 27. Oktober 2026); leer gilt der Wert oben
export const PREIS_JE_STAFFEL = [
  ["sek", "Sondereinzelkosten Vertrieb", "CHF/Stk"], ["vwgk", "Vw/Vt-Gemeinkosten", "%"],
  ["zinsPct", "Verzinsung", "%"], ["zinsMonate", "Verzinsung über Monate", ""],
  ["gewinn", "Gewinn", "%"], ["prov", "Provision", "%"], ["skonto", "Skonto", "%"], ["rabatt", "Rabatt", "%"],
  ["transport", "Transportkosten", "CHF/Stk"], ["transPct", "Transport Zuschlag", "%"], ["transPausch", "Transport pauschal", "CHF je Lieferlos"],
  ["verpackung", "Verpackungskosten", "CHF/Stk"], ["verpPct", "Verpackung Zuschlag", "%"], ["verpPausch", "Verpackung pauschal", "CHF"],
];
export function preisFuerStaffel(preis, staffel) {
  const x = { ...(preis || {}) };
  const eigen = (staffel && staffel.preis) || {};
  for (const [n] of PREIS_JE_STAFFEL) if (String(eigen[n] ?? "").trim()) x[n] = eigen[n];
  return x;
}

// Seit 1.229.0 gibt es oben keine gemeinsamen Werte mehr, nur noch die
// Spalten je Staffel (Wunsch Patrick 27. Oktober 2026). Ältere Kalkulationen
// tragen ihre Werte von oben in jede noch leere Staffel ein.
export function preisInStaffeln(k) {
  const oben = k.preis || {};
  k.staffeln = (k.staffeln || []).map((st) => {
    const eigen = { ...(st.preis || {}) };
    for (const [n] of PREIS_JE_STAFFEL) if (!String(eigen[n] ?? "").trim() && String(oben[n] ?? "").trim()) eigen[n] = oben[n];
    return { ...st, preis: eigen };
  });
  k.preis = { ...oben };
  for (const [n] of PREIS_JE_STAFFEL) k.preis[n] = "";
  return k;
}

// Die Maschine bleibt für alle Staffeln dieselbe (Patrick 27. Oktober 2026:
// „innerhalb eines Teils immer mit derselben Maschine“)
export const AG_JE_STAFFEL = ["laufTag", "te", "erst", "folge", "fgk"];
// Beim externen Arbeitsgang hat das Gewatec immer einen Kostensatz je Staffel.
export function agFuerStaffel(ag, staffel, i) {
  const felder = ag.art === "extern" ? ["extern"] : ag.multi ? AG_JE_STAFFEL : [];
  if (!felder.length) return ag;
  const eigen = ((staffel && staffel.ag) || {})[ag.key || "ag" + i] || {};
  const x = { ...ag };
  for (const n of felder) if (String(eigen[n] ?? "").trim()) x[n] = eigen[n];
  return x;
}

export function staffelRechnen(k, staffel, maschinen) {
  const menge = z(staffel.menge), lose = Math.max(1, z(staffel.lose) || 1);
  // Materialpreis und Gemeinkosten können je Staffel anders sein wie im Gewatec
  // (Patrick 25. November 2026: Stichprobe gegen Gewatec); leer = Wert beim Material
  const matEigen = {};
  for (const [n, v] of Object.entries(staffel.mat || {})) if (String(v ?? "").trim()) matEigen[n] = v;
  const mat = materialRechnen({ ...(k.material || {}), ...matEigen }, menge);
  const ags = (k.ags || []).map((ag0, i) => {
    const ag = agFuerStaffel(ag0, staffel, i);
    if (ag.art === "extern") {
      // Je Stück oder je kg (Galvanik, Härten); ohne Gewicht gilt der Materialeinsatz
      return externRechnen(ag, menge, mat);
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
  const p = preisFuerStaffel(k.preis, staffel);
  const proStk = (x) => (menge > 0 ? x / menge : 0);
  const herstell = proStk(mat.kosten + intern + extern);
  // Preisermittlung wie im Gewatec: Sondereinzelkosten Vertrieb vor den
  // Vw/Vt-Gemeinkosten, dann Verzinsung über Monate auf die Selbstkosten
  const selbst = (herstell + z(p.sek)) * (1 + z(p.vwgk) / 100);
  const zins = selbst * z(p.zinsPct) / 100 * z(p.zinsMonate) / 12;
  const selbstVerz = selbst + zins;
  // Transportkostenberechnung: je Stück, Zuschlag % auf die verzinsten
  // Selbstkosten und ein Pauschalbetrag je Lieferlos
  const lieferlose = Math.max(1, Math.round(z(staffel.lieferlose)) || 1);
  const transport = z(p.transport) + selbstVerz * z(p.transPct) / 100 + proStk(z(p.transPausch) * lieferlose);
  // Verpackung genauso, Pauschal für die ganze Menge
  const verpackung = z(p.verpackung) + selbstVerz * z(p.verpPct) / 100 + proStk(z(p.verpPausch));
  const fracht = transport + verpackung;
  const abzug = (z(p.prov) + z(p.skonto) + z(p.rabatt)) / 100;
  let vk = (selbstVerz + fracht) * (1 + z(p.gewinn) / 100) / (abzug < 1 ? 1 - abzug : 1);
  // Den Eilzuschlag gibt es nicht mehr (Wunsch Patrick 25. November 2026),
  // ein gespeicherter Wert in älteren Kalkulationen zählt nicht
  const schritt = z(p.rundung) || 0.01;
  // Ein eingetragener Angebotspreis der Staffel gilt vor dem gerundeten VK
  // Ausgabe in CHF, EUR oder USD: gerechnet wird in CHF, das Angebot
  // geht in der gewählten Währung hinaus und wird dort gerundet
  // (Wunsch Patrick 27. Oktober 2026, „Währung (Ausgabe)“ im Gewatec)
  const waehrung = WAEHRUNGEN.includes(p.waehrung) ? p.waehrung : "CHF";
  const faktor = waehrung === "CHF" ? 1 : (z(p.kurs) || 1);
  // Preiseinheit: Preis pro 1, 100 oder 1000 Stk (Wunsch Patrick
  // 21. November 2026). Angebotspreis, Zielpreis und Rundung gelten für
  // die Preiseinheit, gerechnet wird weiter je Stück (angebotAus, angebot).
  const pe = peWert(p.pe);
  const angebotHand = z(staffel.angebot) > 0;
  const angebotPe = angebotHand ? z(staffel.angebot) : Math.round(vk * faktor * pe / schritt) * schritt;
  const angebotAus = angebotPe / pe;
  const angebot = angebotAus / faktor;
  const umsatz = angebot * menge;
  const zielPe = z(staffel.ziel);
  const ziel = zielPe / pe;
  return {
    menge, lose, lieferlose, mat, ags, waehrung, faktor, angebotAus, umsatzAus: angebotAus * menge, pe, angebotPe, zielPe,
    matStk: mat.jeStk, internStk: proStk(intern), externStk: proStk(extern), ruestStk: proStk(ruest),
    herstell, selbst, zins, selbstVerz, transport, verpackung, fracht, vk, angebot, angebotHand, umsatz, ziel,
    margeVk: (vk - selbstVerz - fracht) * menge,
    grenz: mat.jeStk + proStk(varFert) + fracht,
    db: angebot - selbstVerz, dbPct: angebot > 0 ? (angebot - selbstVerz) / angebot * 100 : 0,
    gewinnAuftrag: umsatz - (selbstVerz + fracht) * menge,
    laufH: ags.reduce((s, a) => s + (a.laufH || 0), 0),
  };
}

// Preiseinheit 1, 100 oder 1000 Stk, alles andere zählt als 1
export const PREISEINHEITEN = [1, 100, 1000];
export function peWert(x) {
  const n = Math.round(Number(x) || 1);
  return PREISEINHEITEN.includes(n) ? n : 1;
}
export function peText(pe) {
  const n = peWert(pe);
  return n === 1000 ? "1'000 Stk" : n === 100 ? "100 Stk" : "Stk";
}

// ---------- Adresse in einzelnen Feldern ----------
// Seit 1.800.0 Zusatz, Strasse, Land, PLZ und Ort einzeln (Wunsch Patrick
// 25. November 2026: „hier will ich einzelne Felder“). Ältere Kalkulationen
// haben nur den Block `adresse`; adresseTeilen liest ihn in die Felder.
export const ADRESS_FELDER = ["zusatz", "strasse", "land", "plz", "ort"];
export function adresseTeilen(text) {
  const zeilen = String(text || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const t = { zusatz: "", strasse: "", land: "", plz: "", ort: "" };
  let i = zeilen.length - 1;
  const m = i >= 0 ? zeilen[i].match(/^(?:([A-Za-z]{1,3})\s*[- ]\s*)?(\d{4,5})\s+(.+)$/) : null;
  if (m) { t.land = (m[1] || "").toUpperCase(); t.plz = m[2]; t.ort = m[3]; i--; }
  if (i >= 0 && /\d/.test(zeilen[i]) || i >= 0 && /(strasse|str\.|weg|gasse|platz|postfach)/i.test(zeilen[i])) { t.strasse = zeilen[i]; i--; }
  t.zusatz = zeilen.slice(0, i + 1).join("\n");
  return t;
}
// Die Felder der Adresse, aus den neuen Feldern oder aus dem alten Block
export function adresseVon(kopf) {
  const k = kopf || {};
  if (ADRESS_FELDER.some((n) => String(k[n] || "").trim())) {
    const t = {};
    ADRESS_FELDER.forEach((n) => { t[n] = k[n] || ""; });
    return t;
  }
  return adresseTeilen(k.adresse);
}
// Zeilen für Angebot und PDF
export function adresseZeilen(kopf) {
  const t = adresseVon(kopf);
  const ort = [t.land ? t.land + (t.plz ? "-" : " ") : "", t.plz, t.plz && t.ort ? " " : "", t.ort].join("").trim();
  return [...String(t.zusatz || "").split("\n"), t.strasse, ort].map((x) => String(x || "").trim()).filter(Boolean);
}

// ---------- Neue Kalkulation ----------
export function leereKalkulation() {
  return {
    kopf: { kunde: "", zusatz: "", strasse: "", land: "", plz: "", ort: "", artikel: "", zeichnung: "", index: "", ident: "", bezeichnung: "", anfrage: "", zeichen: "" },
    staffeln: [{ menge: "1000", lose: "1" }],
    material: { bez: "", nr: "", preis: "", gk: "", modus: "rechnen", einsatz: "", d: "", dichte: "7.85", stange: "3000", rest: "", laenge: "", abstich: "" },
    ags: [],
    preis: { sek: "", vwgk: "", zinsPct: "", zinsMonate: "", transport: "", transPct: "", transPausch: "", eil: "", eilArt: "pauschal", verpackung: "", verpPct: "", verpPausch: "", gewinn: "30", prov: "", skonto: "", rabatt: "", rundung: "0.01", waehrung: "CHF", kurs: "", kursDatum: "", kursQuelle: "" },
    angebot: { lieferzeit: "nach Absprache", lieferbed: "franko Domizil, inkl. Verpackung", versand: "", zahlung: "30 Tage netto", gueltig: "Offerte freibleibend, gültig 1 Monat ab Offertdatum. (Materialpreisveränderungen ausgenommen)" },
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

// Die Liste holt nur Kopf und Vorschau, nicht die ganzen Daten: seit dem Import aus
// WinKalk sind es über 7'000 Kalkulationen, ganz geladen wären das viele MB.
// Seitenweise je 1'000, weil die Datenbank nie mehr auf einmal liefert.
export async function kalkulationenLaden() {
  const alle = [];
  for (let ab = 0; ab < 200000; ab += 1000) {
    const teil = pruefen(await alt.zeitlimit(alt.db.from("kalkulationen")
      .select("id, nr, kunde, artikel, geaendert_am, kopf:daten->kopf, vorschau")
      .order("geaendert_am", { ascending: false }).order("id").range(ab, ab + 999), 20000, "Kalkulationen")) || [];
    alle.push(...teil);
    if (teil.length < 1000) break;
  }
  return alle;
}

// Eine Kalkulation ganz, erst beim Öffnen.
export async function kalkulationLaden(id) {
  return pruefen(await alt.zeitlimit(alt.db.from("kalkulationen")
    .select("id, nr, kunde, artikel, geaendert_am, daten, winkalk").eq("id", id).maybeSingle(), 15000, "Kalkulation"));
}

// Kurzfassung für die Liste: Mengen der Staffeln und Angebotspreis der ersten.
export function kalkVorschau(daten, rechnung) {
  const mengen = (daten.staffeln || []).map((s) => z(s.menge)).filter((m) => m > 0);
  const r = (rechnung || [])[0];
  return { mengen, preis: r ? r.angebotPe : null, waehrung: r ? r.waehrung : null, pe: r ? r.pe : null };
}

export async function maschinenLaden() {
  return pruefen(await alt.zeitlimit(alt.db.from("kalk_maschinen")
    .select("*").order("sort").order("name"), 10000, "Stundensätze")) || [];
}

export async function kalkulationSpeichern(k) {
  const zeile = { nr: k.nr || null, kunde: k.daten.kopf.kunde || null, artikel: k.daten.kopf.artikel || null,
    daten: k.daten, geaendert_am: new Date().toISOString(), geaendert_von: alt.meineProfilId() };
  if (k.vorschau) zeile.vorschau = k.vorschau;
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
export const FGK_DREHEN = "56";
export const START_MASCHINEN = ["Kontrolle", "Reinigungsanlage", "Spedition"];

// Kostenstelle aus dem Namen des Arbeitsgangs (Wunsch Patrick 25. November 2026): Waschen → Reinigungsanlage,
// Kontrolle → Kontrolle, Abpacken/Versand → Spedition. Bei einem Maschinen-AG wählt man selbst (null).
export function kostenstelleFuer(bez, maschinen) {
  const t = String(bez || "");
  const name = /wasch|reinig/i.test(t) ? "Reinigungsanlage"
    : /abpack|versand|einlager|spedition|verpack/i.test(t) ? "Spedition"
    : /kontroll|prüf|pruef/i.test(t) ? "Kontrolle" : "";
  if (!name) return null;
  return (maschinen.find((m) => String(m.name || "").startsWith(name)) || {}).id || null;
}

export function startArbeitsplan(maschinen) {
  const id = (name) => (maschinen.find((m) => m.name.startsWith(name)) || {}).id || "";
  const ag = (bez, masch, ruest, fgk = "") => ({ bez, art: "intern", masch, te: "0", erst: ruest, folge: ruest, fgk });
  return [
    ag("Material bereitstellen", "", "0"),
    ag("Maschine einrichten", "", "0"),
    ag("Erstteilprüfung", id("Kontrolle"), "0.5"),
    ag("Drehen komplett", "", "0", FGK_DREHEN),
    ag("Waschen fettfrei", id("Reinigungsanlage"), "0"),
    ag("Zwischenkontrolle", id("Kontrolle"), "0.5"),
    ag("Endkontrolle", id("Kontrolle"), "0.5"),
    ag("Versand/Einlagern", id("Spedition"), "0"),
  ];
}

export function beispielKalkulation(maschinen) {
  const id = (name) => (maschinen.find((m) => m.name.startsWith(name)) || {}).id || "";
  const k = leereKalkulation();
  k.kopf = { kunde: "Genge & Thoma AG", zusatz: "joysticks & sensors", strasse: "Bürenstrasse 10", land: "CH", plz: "2543", ort: "Lengnau",
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
