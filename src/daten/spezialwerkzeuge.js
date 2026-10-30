// =================================================================
//  SPEZIALWERKZEUGE (seit 1.131.0, Wunsch Patrick 21. Oktober 2026)
//
//  Ein Spezialwerkzeug ist ein ganz normaler Artikel der Bestellungen
//  (Nummer, Bezeichnung, Lieferant). Die Tabelle spezialwerkzeuge
//  ordnet ihn einer oder mehreren HOCO Nummern zu, damit man es im
//  Auftrag und im Pad sieht und gleich nachbestellen kann. Bestellt
//  wird wie jede andere Position (order_items), mit Lieferant.
//  Datenbank: sql/spezialwerkzeuge.sql. Nicht für Externe.
//
//  Seit 1.142.0 (Wunsch Patrick 22. Oktober 2026: „dort alles
//  separat“) sind Spezialwerkzeuge Artikel mit articles.spezial. Sie
//  und ihre Bestellungen stehen nur unter Bestellungen →
//  Spezialwerkzeuge, die Lieferanten bleiben gemeinsam
//  (sql/spezialwerkzeuge-getrennt.sql).
// =================================================================
import { alt } from "../bruecke.jsx";

// „100070440“, „10007 0440“ oder „10007-440“ werden zu „10007-0440“
export function hocoNormal(text) {
  const t = String(text || "").trim();
  const m = t.match(/^(\d{5})\s*[-–. ]?\s*(\d{1,4})$/);
  return m ? m[1] + "-" + m[2].padStart(4, "0") : t;
}

export const fehltTabelle = (f) => /spezialwerkzeuge/.test(alt.fehlertext(f));
export const FEHLT_TEXT = "Die Spezialwerkzeuge sind in der Datenbank noch nicht eingerichtet (sql/spezialwerkzeuge.sql).";

// Offene Bestellungen je Artikel: was schon unterwegs ist, soll man
// vor dem Nachbestellen sehen
async function offeneBestellungen(ids) {
  if (!ids.length) return {};
  try {
    const r = await alt.zeitlimit(alt.db.from("order_items").select("id, article_id, quantity, status, status_am, created_at")
      .in("article_id", ids), 10000, "Bestellungen");
    if (r.error) return {};
    const je = {};
    (r.data || []).filter((p) => ["offen", "bestellt", "teilweise_geliefert"].includes(p.status))
      .forEach((p) => { (je[p.article_id] = je[p.article_id] || []).push(p); });
    return je;
  } catch (f) { return {}; }
}

// Zuordnungen samt Artikel (aus artikel_uebersicht, mit Lieferant).
// hoco leer = alle Spezialwerkzeuge
export async function spezialLaden(hoco) {
  let abfrage = alt.db.from("spezialwerkzeuge").select("*");
  if (hoco) abfrage = abfrage.eq("hoco_nr", hocoNormal(hoco));
  const r = await alt.zeitlimit(abfrage.order("hoco_nr"), 10000, "Spezialwerkzeuge");
  if (r.error) throw r.error;
  const zeilen = r.data || [];
  const ids = [...new Set(zeilen.map((z) => z.article_id))];
  let artikel = [];
  if (ids.length) {
    const a = await alt.zeitlimit(alt.db.from("artikel_uebersicht").select("*").in("id", ids), 10000, "Artikel");
    if (a.error) throw a.error;
    artikel = a.data || [];
  }
  // Ohne HOCO Nr.: auch Spezialwerkzeuge, die noch keiner zugeordnet sind
  let frei = [];
  if (!hoco) {
    const f = await alt.zeitlimit(alt.db.from("artikel_uebersicht").select("*").eq("spezial", true), 10000, "Artikel");
    if (!f.error) frei = (f.data || []).filter((a) => !ids.includes(a.id));
  }
  const alleIds = ids.concat(frei.map((a) => a.id));
  const [offen, pdfs] = await Promise.all([offeneBestellungen(alleIds), spezialPdfsLaden(alleIds)]);
  return zeilen.map((z) => Object.assign({}, z, {
    artikel: artikel.find((a) => a.id === z.article_id) || null,
    offen: offen[z.article_id] || [], pdfs: pdfs[z.article_id] || [],
  })).concat(frei.map((a) => ({ id: null, article_id: a.id, hoco_nr: "", notiz: null,
    artikel: a, offen: offen[a.id] || [], pdfs: pdfs[a.id] || [] })))
    .filter((z) => z.artikel)
    // Ohne HOCO Nr. ganz unten
    .sort((x, y) => (!x.hoco_nr) - (!y.hoco_nr) || String(x.hoco_nr).localeCompare(String(y.hoco_nr), "de", { numeric: true })
      || String(x.artikel.article_number).localeCompare(String(y.artikel.article_number), "de", { numeric: true }));
}

// Wie viele Spezialwerkzeuge eine HOCO Nr. hat (für die Zahl am Knopf).
// Fehlt die Tabelle noch, einfach 0.
export async function spezialAnzahl(hoco) {
  if (!hoco) return 0;
  try {
    const r = await alt.db.from("spezialwerkzeuge").select("id").eq("hoco_nr", hocoNormal(hoco));
    return r.error ? 0 : (r.data || []).length;
  } catch (f) { return 0; }
}

// Einen Artikel einer oder mehreren HOCO Nummern zuordnen, mit Rückgängig
export async function spezialZuordnen(artikel, hocoNrs, notiz) {
  const nrs = [...new Set(hocoNrs.map(hocoNormal).filter(Boolean))];
  if (!nrs.length) return 0;
  const vorhanden = await alt.db.from("spezialwerkzeuge").select("hoco_nr").eq("article_id", artikel.id);
  if (vorhanden.error) throw vorhanden.error;
  const schon = new Set((vorhanden.data || []).map((z) => z.hoco_nr));
  const neu = nrs.filter((n) => !schon.has(n));
  // Ein normaler Artikel wird damit zum Spezialwerkzeug und verschwindet
  // samt seinen Bestellungen aus den normalen Bestellungen
  const zurueck = [];
  if (!artikel.spezial) {
    const u = await alt.db.from("articles").update({ spezial: true }).eq("id", artikel.id);
    if (u.error && !/spezial/.test(alt.fehlertext(u.error))) throw u.error;
    if (!u.error) zurueck.push(alt.rueckSetz("articles", { spezial: false }, { id: artikel.id }));
    artikel.spezial = true;
  }
  if (!neu.length) {
    if (zurueck.length) alt.merkeSchritt("Artikel " + (artikel.article_number || "") + " zu den Spezialwerkzeugen", zurueck);
    return 0;
  }
  const r = await alt.db.from("spezialwerkzeuge")
    .insert(neu.map((n) => ({ article_id: artikel.id, hoco_nr: n, notiz: (notiz || "").trim() || null })))
    .select("id");
  if (r.error) throw r.error;
  const ids = (r.data || []).map((z) => z.id);
  if (ids.length || zurueck.length) alt.merkeSchritt("Spezialwerkzeug " + (artikel.article_number || "") + " zuordnen",
    ids.map((id) => alt.rueckWeg("spezialwerkzeuge", { id })).concat(zurueck));
  return neu.length;
}

export async function spezialEntfernen(z) {
  const vorher = await alt.rueckSichern("spezialwerkzeuge", { id: z.id });
  const { error } = await alt.db.from("spezialwerkzeuge").delete().eq("id", z.id);
  if (error) throw error;
  alt.merkeSchritt("Spezialwerkzeug " + ((z.artikel && z.artikel.article_number) || "") + " bei "
    + z.hoco_nr + " entfernen", alt.rueckRein("spezialwerkzeuge", vorher));
}

// ---------- PDFs zum Spezialwerkzeug ----------
// Zeichnung, Datenblatt … je Artikel, gelten bei jeder HOCO Nr. (seit
// 1.287.0, Wunsch Patrick 30. Oktober 2026: „Bei den Spezialwerkzeugen
// sollen PDF hinterlegt werden können“, sql/spezialwerkzeug-pdf.sql).
// Fehlt die Tabelle, gibt es eben keine.
export const PDF_FEHLT = "Die PDFs zu den Spezialwerkzeugen sind in der Datenbank noch nicht eingerichtet (sql/spezialwerkzeug-pdf.sql).";

async function spezialPdfsLaden(ids) {
  if (!ids.length) return {};
  try {
    const r = await alt.zeitlimit(alt.db.from("spezial_pdfs").select("*").in("article_id", ids).order("erstellt_am"), 10000, "PDFs");
    if (r.error) return {};
    const je = {};
    (r.data || []).forEach((p) => { (je[p.article_id] = je[p.article_id] || []).push(p); });
    return je;
  } catch (f) { return {}; }
}

export async function spezialPdfHochladen(artikel, datei) {
  if (!/pdf$/i.test(datei.type || "") && !/\.pdf$/i.test(datei.name || "")) throw new Error("Nur PDF-Dateien lassen sich hinterlegen.");
  const sauber = String(datei.name || "datei.pdf").replace(/[^A-Za-z0-9._-]+/g, "_");
  const pfad = "spezialwerkzeuge/" + artikel.id + "/" + Date.now().toString(36) + "-" + sauber;
  const ablage = alt.db.storage.from("zeichnungen");
  const up = await ablage.upload(pfad, datei, { upsert: false, contentType: "application/pdf" });
  if (up.error) throw up.error;
  const url = ablage.getPublicUrl(pfad).data.publicUrl;
  const r = await alt.db.from("spezial_pdfs").insert([{ article_id: artikel.id,
    name: String(datei.name || "PDF").replace(/\.pdf$/i, ""), url, pfad }]).select("id");
  if (r.error) {
    if (/spezial_pdfs/.test(alt.fehlertext(r.error))) throw new Error(PDF_FEHLT);
    throw r.error;
  }
  const id = ((r.data || [])[0] || {}).id;
  if (id) alt.merkeSchritt("PDF zu " + (artikel.article_number || "Spezialwerkzeug"), [alt.rueckWeg("spezial_pdfs", { id })]);
}

// Löschen lässt die Datei liegen, damit Rückgängig geht
export async function spezialPdfLoeschen(p) {
  const vorher = await alt.rueckSichern("spezial_pdfs", { id: p.id });
  const r = await alt.db.from("spezial_pdfs").delete().eq("id", p.id);
  if (r.error) throw r.error;
  alt.merkeSchritt("PDF „" + p.name + "“ löschen", [alt.rueckRein("spezial_pdfs", vorher)]);
}

export const STATUS_TEXT = { offen: "offen", bestellt: "bestellt", teilweise_geliefert: "teilweise geliefert" };

export function offenText(liste) {
  if (!liste || !liste.length) return "";
  return liste.map((p) => alt.zahlText(p.quantity) + " Stk. " + (STATUS_TEXT[p.status] || p.status)).join(", ");
}
