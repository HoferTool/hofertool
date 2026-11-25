// =================================================================
//  TEST ERP: Daten (seit 1.672.0, Wunsch Patrick 20. November 2026,
//  Pflichtenheft im Thread „Test ERP System“). Lohnfertigung von
//  Präzisionsteilen, durchgängig vom Stamm bis zur Rechnung.
//  Tabellen aus sql/erp-test.sql, nur mit Vermerk erpSehen.
//  Für die Testversion lädt die Seite alles auf einmal (wenige Zeilen),
//  Bestand und Rückverfolgung rechnet die App aus erp_bewegungen.
// =================================================================
import { alt } from "../bruecke.jsx";

export const TABELLEN = ["erp_partner", "erp_bedingungen", "erp_lager", "erp_artikel",
  "erp_belege", "erp_positionen", "erp_bewegungen"];

export const BELEGTYP = {
  auftrag: { name: "Auftrag", mehr: "Aufträge", kurz: "AU", partner: "kunde" },
  bestellung: { name: "Bestellung", mehr: "Bestellungen", kurz: "BE", partner: "lieferant" },
  fertigung: { name: "Fertigungsauftrag", mehr: "Fertigungsaufträge", kurz: "FA", partner: "kunde" },
  lieferschein: { name: "Lieferschein", mehr: "Lieferscheine", kurz: "LS", partner: "kunde" },
  rechnung: { name: "Rechnung", mehr: "Rechnungen", kurz: "RE", partner: "kunde" },
  gutschrift: { name: "Gutschrift", mehr: "Gutschriften", kurz: "GS", partner: "kunde" },
  proforma: { name: "Proformarechnung", mehr: "Proformarechnungen", kurz: "PR", partner: "kunde" },
};

export const ARTIKELART = { hofer: "Hofer + Co Artikel", rohmaterial: "Rohmaterial", werkzeug: "Werkzeug" };
// Lagerarten (Wunsch Patrick 25. November 2026): die vier für Hofer + Co
// Artikel, dazu Rohmaterial und Werkzeuge, damit die übrigen Artikel auch
// einen Platz haben. „je“ sagt, für welche Artikelart sie gelten.
export const LAGERARTEN = [
  { code: "FL", text: "Fertigteile", je: "hofer" },
  { code: "HFL", text: "Halbfertigteile", je: "hofer" },
  { code: "EXT", text: "Teile in Zusatzbearbeitung extern", je: "hofer" },
  { code: "SPL", text: "Sperrlager", je: "hofer" },
  { code: "RM", text: "Rohmaterial", je: "rohmaterial" },
  { code: "WZ", text: "Werkzeuge", je: "werkzeug" },
];
export const lagerartText = (code) => { const a = LAGERARTEN.find((x) => x.code === code); return a ? a.text : ""; };
// Lagerplatz kurz, etwa „FL Allgemein“
export const lagerName = (l) => (l ? l.lagerart + " " + l.platz : "–");
export const istHoferLager = (code) => LAGERARTEN.some((x) => x.code === code && x.je === "hofer");
export const HOFER_LAGERARTEN = LAGERARTEN.filter((x) => x.je === "hofer");

// Lagerplätze für Hofer + Co Artikel sind keine Stammdaten (Patrick
// 25. November 2026): man wählt die Lagerart und tippt den Platz frei ein.
// Die Zeile in erp_lager legt die App beim Buchen still selbst an, ohne
// eigenen Rückgängig-Schritt, damit Strg + Z die Buchung zurücknimmt.
export async function lagerplatzId(d, lagerart, platz) {
  const p = String(platz || "").trim();
  if (!lagerart) throw new Error("Lagerart fehlt.");
  if (!p) throw new Error("Lagerplatz fehlt (" + lagerart + ").");
  const da = d.lager.find((l) => l.lagerart === lagerart && l.platz.toLowerCase() === p.toLowerCase());
  if (da) return da.id;
  const r = await alt.zeitlimit(alt.db.from("erp_lager").insert({ lagerart, platz: p }).select("*").single(), 10000, "erp_lager");
  if (r.error) throw r.error;
  d.lager.push(r.data); d.lagerMap.set(r.data.id, r.data);
  return r.data.id;
}

// Lagerplätze, die zu einer Artikelart passen; ohne Treffer alle
export const lagerFuer = (lager, art) => {
  const codes = LAGERARTEN.filter((x) => x.je === art).map((x) => x.code);
  const r = lager.filter((l) => codes.includes(l.lagerart));
  return (r.length ? r : lager).slice().sort((a, b) => (codes.indexOf(a.lagerart) - codes.indexOf(b.lagerart)) || a.platz.localeCompare(b.platz));
};
export const HOFER_NR = /^\d{5}-\d{4}$/;
export const MWST = 8.1;

const FEHLT = "Das Test ERP ist in der Datenbank noch nicht eingerichtet (sql/erp-test.sql).";

function pruefen(r) {
  if (r.error) {
    if (/erp_/.test(r.error.message || "") && /exist|schema cache|find/i.test(r.error.message || "")) throw new Error(FEHLT);
    throw r.error;
  }
  return r.data;
}

export async function allesLaden() {
  const teile = await Promise.all(TABELLEN.map((t) =>
    alt.zeitlimit(alt.db.from(t).select("*").limit(10000), 15000, t).then(pruefen)));
  const d = {};
  TABELLEN.forEach((t, i) => { d[t.slice(4)] = teile[i] || []; });
  d.partnerMap = new Map(d.partner.map((p) => [p.id, p]));
  d.artikelMap = new Map(d.artikel.map((a) => [a.id, a]));
  d.belegMap = new Map(d.belege.map((b) => [b.id, b]));
  d.lagerMap = new Map(d.lager.map((l) => [l.id, l]));
  d.posJe = new Map();
  d.positionen.sort((a, b) => a.pos - b.pos).forEach((p) => {
    if (!d.posJe.has(p.beleg_id)) d.posJe.set(p.beleg_id, []);
    d.posJe.get(p.beleg_id).push(p);
  });
  d.posMap = new Map(d.positionen.map((p) => [p.id, p]));
  d.belege.sort((a, b) => String(b.nr).localeCompare(String(a.nr)));
  return d;
}

// ---------- Schreiben ----------
export async function einfuegen(tabelle, zeile) {
  const r = await alt.zeitlimit(alt.db.from(tabelle).insert(zeile).select("*").single(), 10000, tabelle);
  if (r.error) throw r.error;
  alt.merkeSchritt("ERP anlegen", alt.rueckWeg(tabelle, { id: r.data.id }));
  return r.data;
}

export async function aendern(tabelle, id, werte) {
  const vorher = await alt.rueckSichern(tabelle, { id });
  const r = await alt.zeitlimit(alt.db.from(tabelle).update(werte).eq("id", id).select("*").maybeSingle(), 10000, tabelle);
  if (r.error) throw r.error;
  if (vorher.length) alt.merkeSchritt("ERP ändern", alt.rueckSetz(tabelle, vorher[0], { id }));
  return r.data;
}

export async function loeschen(tabelle, id) {
  const vorher = await alt.rueckSichern(tabelle, { id });
  const r = await alt.zeitlimit(alt.db.from(tabelle).delete().eq("id", id), 10000, tabelle);
  if (r.error) throw r.error;
  if (vorher.length) alt.merkeSchritt("ERP löschen", alt.rueckRein(tabelle, vorher));
}

// ---------- Nummern ----------
// Partner: 5-stellig, Lieferanten ab 70000, Kunden ab 10000 (wie im Gewatec üblich)
export function naechstePartnerNr(d, art) {
  const start = art === "lieferant" ? 70000 : 10000;
  const nrn = d.partner.filter((p) => p.art === art).map((p) => parseInt(p.nr, 10)).filter((n) => n >= start && n < start + 60000);
  return String(nrn.length ? Math.max(...nrn) + 1 : start + 1);
}

// Belege: Kürzel, Jahr, laufende Nr., z.B. AU26-0001
export function naechsteBelegNr(d, typ) {
  const vor = BELEGTYP[typ].kurz + String(new Date().getFullYear()).slice(2) + "-";
  const nrn = d.belege.filter((b) => b.typ === typ && b.nr.startsWith(vor)).map((b) => parseInt(b.nr.slice(vor.length), 10) || 0);
  return vor + String((nrn.length ? Math.max(...nrn) : 0) + 1).padStart(4, "0");
}

// ---------- Texte ----------
export const zahl = (w) => {
  const n = Number(String(w ?? "").replace(/['’\s]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
export const chf = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
export const mengeText = (n) => alt.zahlText(Math.round((Number(n) || 0) * 1000) / 1000);

export function artikelText(a) {
  if (!a) return "–";
  return a.nr + (a.idx ? " Ind. " + a.idx : "") + (a.bezeichnung ? " · " + a.bezeichnung : "");
}
export function partnerText(p) { return p ? p.nr + " " + p.name : "–"; }
export function datumText(iso) {
  if (!iso) return "";
  const [j, m, t] = String(iso).slice(0, 10).split("-");
  return t + "." + m + "." + j;
}
// Kalenderwoche nach ISO wie im Gewatec: „25/26“
export function kwText(iso) {
  if (!iso) return "";
  const t = new Date(String(iso).slice(0, 10) + "T12:00:00");
  if (isNaN(t)) return "";
  const tag = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - tag + 3);
  const jahr = t.getFullYear();
  const erster = new Date(jahr, 0, 4, 12);
  const kw = 1 + Math.round(((t - erster) / 86400000 - 3 + ((erster.getDay() + 6) % 7)) / 7);
  return String(kw).padStart(2, "0") + "/" + String(jahr).slice(2);
}
export function terminText(p) {
  if (p.termin_kw) return "KW " + p.termin_kw;
  return p.termin ? datumText(p.termin) : "";
}

export function adresseText(a) {
  if (!a) return "";
  return [a.name, a.zusatz, a.strasse, [a.plz, a.ort].filter(Boolean).join(" "), a.land && a.land !== "CH" ? a.land : ""]
    .filter(Boolean).join("\n");
}
export function mapsLink(a) {
  const q = [a.strasse, a.plz, a.ort, a.land].filter(Boolean).join(", ");
  return q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q) : "";
}

// ---------- Lager ----------
// Bestand je Artikel (samt Index), Charge und Lagerplatz
export function bestand(d, artikelId) {
  const je = new Map();
  d.bewegungen.forEach((b) => {
    if (artikelId && b.artikel_id !== artikelId) return;
    const k = b.artikel_id + "|" + b.charge + "|" + (b.lager_id || "");
    const e = je.get(k) || { artikel_id: b.artikel_id, charge: b.charge, lager_id: b.lager_id, menge: 0 };
    e.menge += Number(b.menge) || 0;
    je.set(k, e);
  });
  return [...je.values()].filter((e) => Math.abs(e.menge) > 1e-9);
}

export async function buchen(zeile) {
  return einfuegen("erp_bewegungen", zeile);
}

// Wie viel einer Position schon gebucht ist (Lieferung, Wareneingang, Fertigmeldung)
export function gebucht(d, positionId, art) {
  return d.bewegungen.filter((b) => b.position_id === positionId && (!art || b.art === art))
    .reduce((s, b) => s + Math.abs(Number(b.menge) || 0), 0);
}

// Positionen, die auf eine andere zeigen (Lieferscheinpositionen eines Auftrags …)
export function folgePositionen(d, positionId, typ) {
  return d.positionen.filter((p) => p.bezug_id === positionId && (!typ || (d.belegMap.get(p.beleg_id) || {}).typ === typ));
}

// ---------- Preise mit Preiseinheit und Preisliste ----------
// Ein Preis gilt pro 1, 100 oder 1000 Stk (Wunsch Patrick 21. November 2026).
// Am Artikel steht die Preisliste in daten.preisliste = { pe, waehrung,
// kalkulation_id, kalkulation_nr, uebernommen_am, von_hand, staffeln: [{ab, preis}] },
// an der Position die Preiseinheit in daten.pe (fehlt = 1, wie bisher).
export const PE_AUSWAHL = [["1", "pro Stk"], ["100", "pro 100 Stk"], ["1000", "pro 1'000 Stk"]];
export function peZahl(x) {
  const n = Math.round(Number(x) || 1);
  return n === 100 || n === 1000 ? n : 1;
}
export function peKurz(pe) {
  const n = peZahl(pe);
  return n === 1 ? "/Stk" : n === 100 ? "/100" : "/1'000";
}
export function posPe(p) { return peZahl(p && p.daten && p.daten.pe); }
// Betrag einer Position: Menge × Preis / Preiseinheit, oder pauschal der
// Preis; dazu Teuerungszuschlag TZ %, Rabatt % und Porto wie in der
// Gewatec-Auftragsposition (seit 1.686.0). Fehlt etwas, zählt es nicht.
export function posBetrag(p) {
  const pd = (p && p.daten) || {};
  const grund = pd.pauschal ? zahl(p.preis) : zahl(p.menge) * zahl(p.preis) / posPe(p);
  return grund * (1 + zahl(pd.tz) / 100) * (1 - zahl(pd.rabatt) / 100) + zahl(pd.porto);
}
export function preisliste(a) {
  const pl = a && a.daten && a.daten.preisliste;
  const staffeln = ((pl && pl.staffeln) || []).filter((x) => x && String(x.preis ?? "").trim() !== "")
    .map((x) => ({ ab: zahl(x.ab), preis: zahl(x.preis) })).sort((x, y) => x.ab - y.ab);
  return { ...(pl || {}), pe: peZahl(pl ? pl.pe : 1), staffeln };
}
// Preis für eine Menge: grösste Staffel „ab“ bis zur Menge, darunter die
// kleinste. Ohne Preisliste der Preis am Artikel (pro Stk).
export function preisFuerMenge(a, menge) {
  if (!a) return null;
  const pl = preisliste(a);
  if (pl.staffeln.length) {
    const m = zahl(menge);
    let st = pl.staffeln[0];
    for (const x of pl.staffeln) if (x.ab <= m) st = x;
    return { preis: st.preis, pe: pl.pe, ab: st.ab };
  }
  return a.preis != null ? { preis: Number(a.preis), pe: 1, ab: 0 } : null;
}

export function belegSumme(d, beleg) {
  const pos = d.posJe.get(beleg.id) || [];
  const netto = pos.reduce((s, p) => s + posBetrag(p), 0);
  const satz = beleg.daten && beleg.daten.mwst != null && beleg.daten.mwst !== "" ? zahl(beleg.daten.mwst) : MWST;
  const steuer = Math.round(netto * satz) / 100;
  return { netto, satz, steuer, brutto: netto + steuer };
}

// ---------- Rückverfolgung ----------
// Zu einer Charge: woher sie kam (Wareneingang mit Lieferant oder
// Fertigungsauftrag mit verbrauchtem Material) und wohin sie ging.
export function chargeVerfolgen(d, charge, artikelId) {
  const bew = d.bewegungen.filter((b) => b.charge === charge && (!artikelId || b.artikel_id === artikelId))
    .sort((a, b) => String(a.am).localeCompare(String(b.am)));
  const herkunft = bew.filter((b) => b.menge > 0 && b.art !== "korrektur");
  const verwendung = bew.filter((b) => b.menge < 0);
  // Material des Fertigungsauftrags, aus dem die Charge stammt
  const material = [];
  herkunft.forEach((h) => {
    const beleg = d.belegMap.get(h.beleg_id);
    if (beleg && beleg.typ === "fertigung") {
      d.bewegungen.filter((b) => b.beleg_id === beleg.id && b.art === "entnahme").forEach((m) => material.push(m));
    }
  });
  return { bewegungen: bew, herkunft, verwendung, material };
}

// ---------- Fibu-Export ----------
// Die Vorlage für Infoniqa fehlt noch (Patrick hat ein Textfile): bis
// dahin ein Satz je Rechnung/Gutschrift mit Semikolon.
export function fibuText(d, belege) {
  const kopf = ["Belegart", "BelegNr", "Datum", "Faellig", "KundenNr", "Kunde", "Netto", "MWST_Satz", "MWST", "Brutto", "Waehrung", "Text"];
  const zeilen = belege.map((b) => {
    const p = d.partnerMap.get(b.partner_id) || {};
    const s = belegSumme(d, b);
    const vz = b.typ === "gutschrift" ? -1 : 1;
    const tage = zahl(((d.bedingungen.find((x) => x.id === (b.daten || {}).zahlung) || {}).tage) || 30);
    const faellig = new Date(b.datum + "T12:00:00"); faellig.setDate(faellig.getDate() + tage);
    const f = (n) => (vz * n).toFixed(2);
    return [b.typ === "gutschrift" ? "GS" : "RE", b.nr, datumText(b.datum), datumText(faellig.toISOString()),
      p.nr || "", (p.name || "").replace(/;/g, ","), f(s.netto), s.satz.toFixed(1), f(s.steuer), f(s.brutto), "CHF",
      String((b.daten || {}).text || "").replace(/[;\r\n]+/g, " ")].join(";");
  });
  return [kopf.join(";")].concat(zeilen).join("\r\n") + "\r\n";
}
