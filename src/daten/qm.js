// =================================================================
//  QM: Daten und Rechnungen (seit 1.459.0, Etappe 1, Wunsch Patrick
//  10. November 2026: QM-Tool nach ISO 9001 mit dem KVP im Zentrum)
//
//  Drei Tabellen aus sql/qm-grundlage.sql, lesbar nur mit dem Vermerk
//  qmSehen (qm_darf() in der Datenbank):
//    qm_massnahmen  – die eine KVP-Liste für das ganze QM-Tool
//    qm_messgroessen – Katalog der Kennzahlen mit Ziel und Ampel
//    qm_jahreswerte  – Zahlen je Jahr und Schlüssel. Die Wirtschafts-
//                      zahlen stehen nur dort, nie im Repository.
//  Werte von Messgrössen, die von Hand kommen, liegen ebenfalls in
//  qm_jahreswerte, unter dem Schlüssel "mg:<id der Messgrösse>".
// =================================================================
import { alt } from "../bruecke.jsx";

// Eingaben der Wirtschaftszahlen, einmal im Jahr (Liste aus dem Vorschlag,
// Entscheid Patrick 10. November 2026: „mach mal mit der aktuellen Liste“)
export const EINGABEN = [
  { k: "umsatz", text: "Umsatz", einheit: "CHF" },
  { k: "bruttoumsatz", text: "Bruttoumsatz", einheit: "CHF" },
  { k: "ebit", text: "EBIT", einheit: "CHF" },
  { k: "personal", text: "Personalaufwand", einheit: "CHF" },
  { k: "material", text: "Materialaufwand", einheit: "CHF" },
  { k: "investitionen", text: "Investitionen", einheit: "CHF" },
  { k: "energie", text: "Energiekosten", einheit: "CHF" },
  { k: "mitarbeitende", text: "Mitarbeitende", einheit: "Anzahl" },
  { k: "vollzeit", text: "Vollzeitstellen", einheit: "Anzahl" },
  { k: "kapazitaet_h", text: "Kapazität", einheit: "h", hinweis: "Anlagen × Arbeitstage × 24 h; später von selbst" },
  { k: "umsatzziel", text: "Umsatzziel", einheit: "CHF" },
];

// Was daraus gerechnet wird. „auchEingabe“: für Jahre ohne Franken (etwa
// 2019 bis 2024 aus der Bewertung 2025, dort nur in Prozent) lässt sich
// der Wert direkt eintippen; ein eingetippter Wert gilt vor dem gerechneten.
export const GERECHNET = [
  { k: "ebit_marge_pct", text: "EBIT-Marge", einheit: "%", auchEingabe: true },
  { k: "ebit_marge_vj", text: "EBIT-Marge zum Vorjahr", einheit: "Pp." },
  { k: "personal_pct", text: "Personalkosten vom Umsatz", einheit: "%", auchEingabe: true },
  { k: "material_pct", text: "Materialaufwand vom Umsatz", einheit: "%" },
  { k: "umsatz_vj_pct", text: "Umsatz zum Vorjahr", einheit: "%" },
  { k: "umsatz_erst_pct", text: "Umsatz zum ersten Jahr", einheit: "%" },
  { k: "umsatz_je_vz", text: "Umsatz je Vollzeitstelle", einheit: "CHF" },
  { k: "umsatz_je_h", text: "Umsatz je Kapazitätsstunde", einheit: "CHF" },
  { k: "brutto_je_h", text: "Bruttoumsatz je Kapazitätsstunde", einheit: "CHF" },
  { k: "personal_je_h", text: "Personalaufwand je Kapazitätsstunde", einheit: "CHF" },
  { k: "umsatzziel_pct", text: "Umsatzziel erreicht", einheit: "%" },
];

export const SCHLUESSEL = [...EINGABEN, ...GERECHNET];
export const schluesselText = (k) => (SCHLUESSEL.find((x) => x.k === k) || {}).text || k || "";

export const QUELLEN = [
  ["jahr", "Wirtschaftszahl"],
  ["hand", "Von Hand je Jahr"],
  ["auto", "HoferTool (von selbst, folgt; bis dahin von Hand)"],
];
export const quelleText = (q) => (QUELLEN.find((x) => x[0] === q) || ["", q || ""])[1];

export const STATUS = [
  ["offen", "Offen"], ["laeuft", "In Arbeit"], ["erledigt", "Erledigt, Wirksamkeit prüfen"],
  ["wirksam", "Wirksam"], ["unwirksam", "Nicht wirksam"],
];
export const statusText = (s) => (STATUS.find((x) => x[0] === s) || ["", s || ""])[1];
// Offen im Sinn des KVP: alles, was noch nicht als wirksam abgeschlossen ist
export const istOffen = (m) => m.status !== "wirksam";

// ---------- Zahlen ----------
// Liest 1'200.50, 1 200,5, 13.5 % oder CHF 4.2 Mio. nicht: nur Ziffern
export function zahlLesen(t) {
  if (t == null) return null;
  let s = String(t).replace(/[’'\s]/g, "").replace(/chf|%|h$/gi, "");
  if (!s) return null;
  // Komma als Dezimalzeichen, wenn kein Punkt da ist
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function zahlZeigen(n, einheit) {
  if (n == null || !Number.isFinite(n)) return "";
  const nach = einheit === "%" || einheit === "Pp." ? 1 : (Math.abs(n) >= 100 ? 0 : (Number.isInteger(n) ? 0 : 1));
  const r = Math.round(n * 10 ** nach) / 10 ** nach;
  const [ganz, rest] = Math.abs(r).toFixed(nach).split(".");
  const mitTrenn = ganz.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return (r < 0 ? "−" : "") + mitTrenn + (rest && Number(rest) ? "." + rest : "");
}

// ---------- Rechnen ----------
// werte: { jahr: { schluessel: zahl } } aus der Tabelle. Gibt je Jahr alle
// Eingaben und gerechneten Werte zurück (eingetippt vor gerechnet).
export function jahreRechnen(werte) {
  const jahre = Object.keys(werte).map(Number).sort((a, b) => a - b);
  const ersterUmsatz = jahre.map((j) => werte[j].umsatz).find((x) => x != null);
  const aus = {};
  const teil = (a, b, f = 1) => (a != null && b ? (a / b) * f : null);
  for (const j of jahre) {
    const w = werte[j] || {};
    const v = aus[j - 1] || {};
    const r = { ...w };
    r.ebit_marge_pct = w.ebit_marge_pct ?? teil(w.ebit, w.umsatz, 100);
    r.personal_pct = w.personal_pct ?? teil(w.personal, w.umsatz, 100);
    r.material_pct = teil(w.material, w.umsatz, 100);
    r.ebit_marge_vj = r.ebit_marge_pct != null && v.ebit_marge_pct != null ? r.ebit_marge_pct - v.ebit_marge_pct : null;
    r.umsatz_vj_pct = w.umsatz != null && v.umsatz ? (w.umsatz / v.umsatz - 1) * 100 : null;
    r.umsatz_erst_pct = w.umsatz != null && ersterUmsatz ? (w.umsatz / ersterUmsatz - 1) * 100 : null;
    r.umsatz_je_vz = teil(w.umsatz, w.vollzeit);
    r.umsatz_je_h = teil(w.umsatz, w.kapazitaet_h);
    r.brutto_je_h = teil(w.bruttoumsatz, w.kapazitaet_h);
    r.personal_je_h = teil(w.personal, w.kapazitaet_h);
    r.umsatzziel_pct = teil(w.umsatz, w.umsatzziel, 100);
    aus[j] = r;
  }
  return aus;
}

// Wert einer Messgrösse in einem Jahr
export function messwert(m, jahr, gerechnet) {
  const r = gerechnet[jahr] || {};
  if (m.quelle === "jahr") return r[m.schluessel] ?? null;
  return r["mg:" + m.id] ?? null;
}

// Ampel: grün = Ziel erreicht; gelb = verfehlt, aber noch nicht über die
// Grenze „rot ab“; rot = darüber hinaus (ohne Grenze gleich rot)
export function ampel(m, ist) {
  if (ist == null || m.ziel == null) return null;
  const hoch = m.richtung !== "tief";
  if (hoch ? ist >= m.ziel : ist <= m.ziel) return "gruen";
  if (m.gelb != null && (hoch ? ist >= m.gelb : ist <= m.gelb)) return "gelb";
  return "rot";
}

// ---------- Laden und Speichern ----------
export async function qmLaden() {
  const [mn, mg, jw] = await Promise.all([
    alt.db.from("qm_massnahmen").select("*").order("nr", { ascending: true }),
    alt.db.from("qm_messgroessen").select("*").order("sort", { ascending: true }),
    alt.db.from("qm_jahreswerte").select("jahr, schluessel, wert, notiz"),
  ]);
  const f = mn.error || mg.error || jw.error;
  if (f) throw f;
  const werte = {};
  for (const z of jw.data || []) {
    if (z.wert == null) continue;
    (werte[z.jahr] = werte[z.jahr] || {})[z.schluessel] = Number(z.wert);
  }
  return { massnahmen: mn.data || [], messgroessen: mg.data || [], werte };
}

export const fehltQm = (f) => /qm_|does not exist|schema cache|42P01|PGRST20/i.test(String((f && (f.message || f.code)) || f || ""));

// Einen Jahreswert setzen oder (leer) entfernen, mit Rückgängig
export async function jahreswertSetzen(jahr, schluessel, wert) {
  const wo = { jahr, schluessel };
  const vorher = await alt.rueckSichern("qm_jahreswerte", wo);
  const { error } = wert == null
    ? await alt.db.from("qm_jahreswerte").delete().eq("jahr", jahr).eq("schluessel", schluessel)
    : await alt.db.from("qm_jahreswerte").upsert({ jahr, schluessel, wert, geaendert_am: new Date().toISOString() }, { onConflict: "jahr,schluessel" });
  if (error) throw error;
  const text = schluessel.startsWith("mg:") ? "Messwert " + jahr : schluesselText(schluessel) + " " + jahr;
  alt.merkeSchritt("Ändern von " + text,
    vorher.length ? alt.rueckRein("qm_jahreswerte", vorher, "jahr,schluessel") : alt.rueckWeg("qm_jahreswerte", wo));
}

// Vorschlag für den Katalog, wenn er noch leer ist. Ziele setzt Patrick.
export const VORSCHLAG_MESSGROESSEN = [
  { name: "Umsatz", einheit: "CHF", quelle: "jahr", schluessel: "umsatz", richtung: "hoch", norm: "9.1.3" },
  { name: "Umsatzziel erreicht", einheit: "%", quelle: "jahr", schluessel: "umsatzziel_pct", richtung: "hoch", ziel: 100, norm: "9.1.3" },
  { name: "EBIT-Marge", einheit: "%", quelle: "jahr", schluessel: "ebit_marge_pct", richtung: "hoch", norm: "9.1.3" },
  { name: "Personalkosten vom Umsatz", einheit: "%", quelle: "jahr", schluessel: "personal_pct", richtung: "tief", norm: "9.1.3" },
  { name: "Materialaufwand vom Umsatz", einheit: "%", quelle: "jahr", schluessel: "material_pct", richtung: "tief", norm: "9.1.3" },
  { name: "Umsatz je Vollzeitstelle", einheit: "CHF", quelle: "jahr", schluessel: "umsatz_je_vz", richtung: "hoch", norm: "9.1.3" },
  { name: "Umsatz je Kapazitätsstunde", einheit: "CHF", quelle: "jahr", schluessel: "umsatz_je_h", richtung: "hoch", norm: "9.1.3" },
  { name: "Auslastung der Anlagen", einheit: "%", quelle: "auto", schluessel: "auslastung_pct", richtung: "hoch", norm: "9.1.3" },
  { name: "Ausschussquote", einheit: "%", quelle: "auto", schluessel: "ausschuss_pct", richtung: "tief", norm: "8.7" },
  { name: "Rüst- und Übergangszeit Ø je Wechsel", einheit: "h", quelle: "auto", schluessel: "ruesten_h", richtung: "tief", norm: "9.1.3" },
  { name: "Werkzeugkosten", einheit: "CHF", quelle: "auto", schluessel: "werkzeug_chf", richtung: "tief", norm: "9.1.3" },
  { name: "Liefertreue Lieferanten", einheit: "%", quelle: "auto", schluessel: "liefertreue_pct", richtung: "hoch", norm: "8.4" },
  { name: "Eigenproduktion Strom", einheit: "%", quelle: "auto", schluessel: "solar_pct", richtung: "hoch", norm: "7.1" },
  { name: "Kundenreklamationen", einheit: "Anzahl", quelle: "hand", richtung: "tief", norm: "9.1.2" },
  { name: "Lieferantenreklamationen", einheit: "Anzahl", quelle: "hand", richtung: "tief", norm: "8.4" },
  { name: "Angebote: Erfolgsquote", einheit: "%", quelle: "hand", richtung: "hoch", norm: "8.2", notiz: "aus dem Gewatec, von Hand" },
  { name: "Angebote: Durchlaufzeit bis Angebot", einheit: "Tage", quelle: "hand", richtung: "tief", norm: "8.2", notiz: "aus dem Gewatec, von Hand" },
];
