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

// Der Server gibt je Abfrage höchstens 1'000 Zeilen zurück, egal welches limit.
// Mit 1'000 Werkzeugen fehlten so die meisten Hofer + Co Artikel (Patrick
// 25. November 2026: „warum sehe ich nur 9 Artikel?“). Darum seitenweise holen.
const SEITE = 1000;
async function alleZeilen(t) {
  const alle = [];
  for (let ab = 0; ab < 200000; ab += SEITE) {
    const teil = pruefen(await alt.zeitlimit(alt.db.from(t).select("*").order("id").range(ab, ab + SEITE - 1), 15000, t)) || [];
    alle.push(...teil);
    if (teil.length < SEITE) break;
  }
  return alle;
}

export async function allesLaden() {
  const teile = await Promise.all(TABELLEN.map((t) => alleZeilen(t)));
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
  d.nummern = await nummernLaden().catch(() => ({}));
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

// Belege: Jahr und laufende Nr., z.B. 20260099 (seit 1.810.0, Wunsch Patrick
// 25. November 2026: alle Belegarten im gleichen Format; vorher AU26-0001).
// Jede Art zählt für sich, eine Bestellung darf dieselbe Nr. haben wie ein
// Auftrag (unique je typ + nr). Fortlaufend je Typ über die Jahre, beim
// Jahreswechsel ändert nur das Jahr vorne (seit 1.820.0).
// Startwerte (Wunsch Patrick 25. November 2026, für den Wechsel vom alten
// ERP): app_config.erp_nummern {typ: {jahr: start}}, die nächste Nummer ist
// nie kleiner als der Startwert und nie kleiner als die höchste + 1.
export const NUMMERN_KONFIG = "erp_nummern";
export const NUMMERNKREISE = [
  // Fertigungsaufträge mit 6 Stellen wie die FA Nr. der WBGs (2026008598): seit 1.907.0
  // stehen die FAs der Planwand im Test ERP, neue zählen dort weiter (Wunsch Patrick 27. November 2026)
  ...Object.entries(BELEGTYP).map(([typ, t]) => ({ typ, name: t.mehr, muster: (j) => String(j), stellen: typ === "fertigung" ? 6 : 4 })),
  { typ: "kalkulation", name: "Kalkulationen", muster: (j) => String(j), stellen: 4 },
];
export const nummerText = (kreis, jahr, n) => kreis.muster(jahr) + String(n).padStart(kreis.stellen, "0");
export const startWert = (nummern, typ, jahr) => {
  const n = parseInt((nummern || {})[typ]?.[jahr], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};
// vorhandene: alle vorhandenen Nummern dieses Kreises (Text).
// Seit 1.820.0 (Wunsch Patrick 25. November 2026: „beim Startwert fürs
// nächste Jahr soll nur das Jahr ändern, die fortlaufende Nr. geht weiter,
// wo im letzten Jahr aufgehört wurde“): die laufende Nr. zählt über die
// Jahre weiter, beim Jahreswechsel wechselt nur das Jahr vorne
// (20260145 → 20270146). Startwerte früherer Jahre gelten weiter.
export function naechsteNummer(nummern, typ, vorhandene, jahr = new Date().getFullYear()) {
  const kreis = NUMMERNKREISE.find((k) => k.typ === typ);
  let hoch = 0;
  vorhandene.forEach((n) => {
    const m = /^(20\d\d)(\d+)$/.exec(String(n || ""));
    if (m && Number(m[1]) <= jahr) hoch = Math.max(hoch, parseInt(m[2], 10) || 0);
  });
  let start = 1;
  Object.keys((nummern || {})[typ] || {}).forEach((j) => { if (Number(j) <= jahr) start = Math.max(start, startWert(nummern, typ, j)); });
  return nummerText(kreis, jahr, Math.max(hoch + 1, start));
}
export function naechsteBelegNr(d, typ) {
  return naechsteNummer(d.nummern, typ, d.belege.filter((b) => b.typ === typ).map((b) => b.nr));
}
export async function nummernLaden() {
  const r = await alt.zeitlimit(alt.db.from("app_config").select("wert").eq("schluessel", NUMMERN_KONFIG).maybeSingle(), 8000, "Nummernkreise");
  if (r.error) throw r.error;
  try { return r.data?.wert ? (typeof r.data.wert === "string" ? JSON.parse(r.data.wert) : r.data.wert) : {}; } catch { return {}; }
}
export async function nummernSpeichern(nummern) {
  const vorher = await alt.rueckSichern("app_config", { schluessel: NUMMERN_KONFIG });
  const r = await alt.db.from("app_config").upsert([{ schluessel: NUMMERN_KONFIG, wert: JSON.stringify(nummern) }], { onConflict: "schluessel" });
  if (r.error) throw r.error;
  alt.merkeSchritt("Nummernkreise ändern", vorher.length ? alt.rueckRein("app_config", vorher, "schluessel")
    : alt.rueckWeg("app_config", { schluessel: NUMMERN_KONFIG }));
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
// Artikel mit einem bestimmten Index (Position, Bestand), nicht dem aktuellen
export function artikelIdxText(a, idx) {
  if (!a) return "–";
  return artikelText({ ...a, idx: idx == null ? a.idx : idx });
}
export function partnerText(p) { return p ? p.nr + " " + p.name : "–"; }
export function datumText(iso) {
  if (!iso) return "";
  const [j, m, t] = String(iso).slice(0, 10).split("-");
  return t + "." + m + "." + j;
}
// Kalenderwoche nach ISO wie im Gewatec: „25/27“, im laufenden Jahr nur „25“
// (Wunsch Patrick 25. November 2026: im aktuellen Jahr ohne Zusatz /JJ)
function kwUndJahr(iso) {
  const t = new Date(String(iso).slice(0, 10) + "T12:00:00");
  if (isNaN(t)) return null;
  const tag = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - tag + 3);
  const jahr = t.getFullYear();
  const erster = new Date(jahr, 0, 4, 12);
  const kw = 1 + Math.round(((t - erster) / 86400000 - 3 + ((erster.getDay() + 6) % 7)) / 7);
  return { kw, jahr };
}
export function kwText(iso, heute = new Date()) {
  if (!iso) return "";
  const k = kwUndJahr(iso);
  if (!k) return "";
  const nr = String(k.kw).padStart(2, "0");
  return k.jahr === heute.getFullYear() ? nr : nr + "/" + String(k.jahr).slice(2);
}
// Umgekehrt: „48“ (dieses Jahr), „KW 48“, „05/27“ oder „05/2027“ → ISO-Datum
// dieser Woche, sonst "". tag: 0 = Montag (Bestellungen), 4 = Freitag (Aufträge),
// Wunsch Patrick 25. November 2026
export function kwZuDatum(text, heute = new Date(), tag = 0) {
  const m = /^\s*(?:kw\s*)?(\d{1,2})\s*(?:[/.\-\s]\s*(\d{2}|\d{4}))?\s*$/i.exec(String(text || ""));
  if (!m) return "";
  const kw = +m[1];
  let jahr = m[2] ? +m[2] : heute.getFullYear();
  if (jahr < 100) jahr += 2000;
  if (kw < 1 || kw > 53) return "";
  // 4. Januar liegt immer in KW 1
  const vier = new Date(jahr, 0, 4, 12);
  const d = new Date(vier);
  d.setDate(vier.getDate() - ((vier.getDay() + 6) % 7) + (kw - 1) * 7);
  const iso = (x) => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  // KW 53 gibt es nicht in jedem Jahr
  const k = kwUndJahr(iso(d));
  if (!k || k.kw !== kw || k.jahr !== jahr) return "";
  d.setDate(d.getDate() + tag);
  return iso(d);
}
// Wochentag für eine KW: Aufträge Freitag, Bestellungen Montag
export function kwTag(typ) { return typ === "auftrag" ? 4 : 0; }
export function terminText(p) {
  // Aus dem Datum gerechnet, damit „48“ nächstes Jahr wieder „48/26“ heisst
  if (p.termin_kw) return "KW " + (p.termin ? kwText(p.termin) : p.termin_kw);
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
// Pro HOCO Nr. gibt es nur einen Artikel (Patrick 25. November 2026). Der Index
// steht darum an der Position (daten.idx) und an jeder Bewegung (idx); so bleibt
// der Bestand je Index getrennt, auch wenn der Artikel einen neuen Index bekommt.
export function posIdx(d, p) {
  if (p && p.daten && p.daten.idx != null) return p.daten.idx;
  const a = p && d.artikelMap.get(p.artikel_id);
  return a ? a.idx || "" : "";
}
export function bewIdx(d, b) {
  if (b.idx != null) return b.idx;
  const a = d.artikelMap.get(b.artikel_id);
  return a ? a.idx || "" : "";
}

export function bestand(d, artikelId) {
  const je = new Map();
  d.bewegungen.forEach((b) => {
    if (artikelId && b.artikel_id !== artikelId) return;
    const idx = bewIdx(d, b);
    const k = b.artikel_id + "|" + idx + "|" + b.charge + "|" + (b.lager_id || "");
    const e = je.get(k) || { artikel_id: b.artikel_id, idx, charge: b.charge, lager_id: b.lager_id, menge: 0 };
    e.menge += Number(b.menge) || 0;
    je.set(k, e);
  });
  return [...je.values()].filter((e) => Math.abs(e.menge) > 1e-9);
}

export async function buchen(zeile) {
  try { return await einfuegen("erp_bewegungen", zeile); }
  catch (e) {
    // Ohne sql/erp-artikel-je-hoco.sql kennt die Datenbank die Spalte idx noch nicht
    if ("idx" in zeile && /idx/.test(String(e && e.message))) { const { idx, ...ohne } = zeile; return einfuegen("erp_bewegungen", ohne); }
    throw e;
  }
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

// Verpackung und Porto der Lieferscheine, aus denen eine Rechnung
// entstand (seit 1.935.0, wie im Gewatec „Summe Porto u. Verpackung“).
// Jeder Lieferschein zählt einmal, auch wenn er mehrere Positionen hat.
export function belegNebenkosten(d, beleg) {
  if (!beleg || (beleg.typ !== "rechnung" && beleg.typ !== "gutschrift" && beleg.typ !== "proforma")) return 0;
  const betrag = (v) => { const m = /-?\d[\d']*(?:[.,]\d+)?/.exec(String(v ?? "")); return m ? Number(m[0].replace(/'/g, "").replace(",", ".")) || 0 : 0; };
  const ls = new Map();
  (d.posJe.get(beleg.id) || []).forEach((p) => {
    const lp = p.bezug_id && d.posMap && d.posMap.get(p.bezug_id);
    const l = lp && d.belegMap.get(lp.beleg_id);
    if (l && l.typ === "lieferschein") ls.set(l.id, l);
  });
  let summe = 0;
  ls.forEach((l) => { summe += betrag((l.daten || {}).verp_kosten) + betrag((l.daten || {}).porto); });
  return Math.round(summe * 100) / 100;
}

export function belegSumme(d, beleg) {
  const pos = d.posJe.get(beleg.id) || [];
  const waren = pos.reduce((s, p) => s + posBetrag(p), 0);
  const neben = belegNebenkosten(d, beleg);
  const netto = waren + neben;
  const satz = beleg.daten && beleg.daten.mwst != null && beleg.daten.mwst !== "" ? zahl(beleg.daten.mwst) : MWST;
  const steuer = Math.round(netto * satz) / 100;
  return { netto, satz, steuer, brutto: netto + steuer, waren, neben };
}

// ---------- Rückverfolgung ----------
// Zu einer Charge: woher sie kam (Wareneingang mit Lieferant oder
// Fertigungsauftrag mit verbrauchtem Material) und wohin sie ging.
export function chargeVerfolgen(d, charge, artikelId) {
  const bew = d.bewegungen.filter((b) => b.charge === charge && (!artikelId || b.artikel_id === artikelId))
    .sort((a, b) => String(a.am).localeCompare(String(b.am)));
  const herkunft = bew.filter((b) => b.menge > 0 && b.art !== "korrektur" && b.art !== "umbuchung");
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
