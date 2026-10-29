// =================================================================
//  ZEICHNUNG DREHEN (seit 1.252.0, Wunsch Patrick 29. Oktober 2026:
//  „Möglichkeit PDF-Zeichnung zu drehen, es soll es gleich so
//  abspeichern, dass es immer so anzeigt, egal wo“)
//
//  Gedreht wird die Datei selbst (/Rotate jeder Seite mit pdf-lib),
//  nicht nur die Anzeige: so steht sie überall richtig, auch in der
//  Vorschau des Auftragsfensters, im neuen Tab, gedruckt und auf jedem
//  Gerät. Die gedrehte Datei kommt neu in die Ablage, ihre Adresse an
//  jede Stelle, die die alte hatte (HOCO Nr., Aufträge, Dokumente). Die
//  alte Datei bleibt liegen, damit Rückgängig geht.
//
//  hoco_parts.zeichnung_drehung = { grad, url, von, pfad } merkt sich
//  die Drehung (sql/zeichnung-drehung.sql):
//   - zeichnungen.ps1 nimmt die gedrehte Datei als seine eigene, wenn
//     „von“ seine Adresse ist; sie gilt also nicht als Master, und eine
//     neue Fassung im Ordner ersetzt sie weiter.
//   - Kommt so eine neue Fassung derselben Datei („pfad“), dreht die
//     App sie von selbst wieder gleich (drehungWaechter).
// =================================================================
import { alt } from "../bruecke.jsx";

const ABLAGE = "zeichnungen";
const TAKT_MS = 5 * 60 * 1000;

async function pdfLib() { return import("pdf-lib"); }

// Alle Seiten um grad (90, 180, 270) im Uhrzeigersinn weiterdrehen
export async function pdfDrehen(daten, grad) {
  const { PDFDocument, degrees } = await pdfLib();
  const doc = await PDFDocument.load(daten, { ignoreEncryption: true, updateMetadata: false });
  doc.getPages().forEach((s) => {
    const jetzt = (s.getRotation().angle || 0) % 360;
    s.setRotation(degrees((jetzt + grad + 360) % 360));
  });
  return doc.save({ useObjectStreams: false });
}

// Ist diese Adresse eine Zeichnung (HOCO Nr. oder Auftrag)? Nur dann
// zeigt der Betrachter „Drehen“.
const bekannt = new Map();
export async function istZeichnung(adresse) {
  if (!adresse || !/^https?:/i.test(adresse) || !alt.db) return false;
  if (bekannt.has(adresse)) return bekannt.get(adresse);
  let ja = false;
  try {
    const [t, j] = await Promise.all([
      alt.db.from("hoco_parts").select("hoco_nr").eq("zeichnung_url", adresse).limit(1),
      alt.db.from("jobs").select("id").eq("drawing_url", adresse).limit(1)]);
    ja = !!((t.data && t.data.length) || (j.data && j.data.length));
  } catch (f) { ja = false; }
  bekannt.set(adresse, ja);
  return ja;
}

export function darfDrehen() {
  return !!(alt.darfSchreiben && alt.darfSchreiben() && !(alt.istExtern && alt.istExtern()));
}

async function hochladen(bytes) {
  const name = "zeichnung/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "-gedreht.pdf";
  const ablage = alt.db.storage.from(ABLAGE);
  const r = await ablage.upload(name, new Blob([bytes], { type: "application/pdf" }), { contentType: "application/pdf" });
  if (r.error) throw r.error;
  return ablage.getPublicUrl(name).data.publicUrl;
}

// Die Adresse überall von alt auf neu umstellen. teile: Zeilen aus
// hoco_parts mit der alten Adresse, drehung(t) gibt den neuen Vermerk.
async function umstellen(altUrl, neuUrl, teile, drehung) {
  for (const t of teile) {
    const q = t.zeichnung_quelle;
    const satz = { zeichnung_url: neuUrl, zeichnung_drehung: drehung(t) };
    if (q && q.url === altUrl) satz.zeichnung_quelle = Object.assign({}, q, { url: neuUrl });
    const r = await alt.aendernOhneUnbekannte("hoco_parts", satz, "hoco_nr", t.hoco_nr);
    if (r && r.ok === false) throw new Error(r.fehler || "HOCO Nr. " + t.hoco_nr + " liess sich nicht ändern.");
  }
  const r2 = await alt.db.from("jobs").update({ drawing_url: neuUrl }).eq("drawing_url", altUrl);
  if (r2.error) throw r2.error;
  try { await alt.db.from("dokumente").update({ datei_url: neuUrl }).eq("datei_url", altUrl); } catch (f) { /* dann bleibt der Eintrag */ }
  bekannt.set(neuUrl, true);
  try { window.dispatchEvent(new CustomEvent("hofer:zeichnung", { detail: { alt: altUrl, neu: neuUrl } })); } catch (f) { /* egal */ }
}

// Gedreht speichern: daten = die Datei, wie sie unter adresse liegt,
// grad = wie weit weiterdrehen. Gibt die neue Adresse.
export async function drehungSpeichern(adresse, daten, grad) {
  grad = ((grad % 360) + 360) % 360;
  if (!grad) return adresse;
  const bytes = await pdfDrehen(daten, grad);
  const neu = await hochladen(bytes);
  const teile = await alt.rueckSichern("hoco_parts", { zeichnung_url: adresse });
  const auftraege = await alt.rueckSichern("jobs", { drawing_url: adresse });
  const doks = await alt.rueckSichern("dokumente", { datei_url: adresse });
  await umstellen(adresse, neu, teile, (t) => {
    const d = t.zeichnung_drehung && t.zeichnung_drehung.url === adresse ? t.zeichnung_drehung : null;
    const q = t.zeichnung_quelle && t.zeichnung_quelle.url === adresse ? t.zeichnung_quelle : null;
    const summe = ((d ? Number(d.grad) || 0 : 0) + grad) % 360;
    return { grad: summe, url: neu, von: d ? d.von : adresse, pfad: d ? d.pfad || null : q ? q.pfad || null : null };
  });
  alt.merkeSchritt("Zeichnung gedreht",
    teile.map((t) => alt.rueckSetz("hoco_parts", { zeichnung_url: t.zeichnung_url,
      zeichnung_drehung: t.zeichnung_drehung || null, zeichnung_quelle: t.zeichnung_quelle || null }, { hoco_nr: t.hoco_nr }))
      .concat(auftraege.map((j) => alt.rueckSetz("jobs", { drawing_url: j.drawing_url }, { id: j.id })))
      .concat(doks.map((d) => alt.rueckSetz("dokumente", { datei_url: d.datei_url }, { id: d.id }))));
  return neu;
}

// Neue Fassung derselben Datei aus dem Ordner: wieder gleich drehen.
// Erkannt daran, dass die Aufgabe eine neue Adresse eingetragen hat
// (zeichnung_url ≠ drehung.url, zeichnung_quelle.url = zeichnung_url)
// und die Datei im Ordner dieselbe ist (pfad).
let laeuft = false;
export async function drehungNachholen() {
  if (laeuft || !alt.db || !alt.profil || !darfDrehen()) return 0;
  laeuft = true;
  let gemacht = 0;
  try {
    const r = await alt.db.from("hoco_parts").select("hoco_nr, zeichnung_url, zeichnung_quelle, zeichnung_drehung")
      .not("zeichnung_drehung", "is", null);
    if (r.error) return 0;
    for (const t of r.data || []) {
      const d = t.zeichnung_drehung, q = t.zeichnung_quelle;
      if (!d || !t.zeichnung_url || t.zeichnung_url === d.url) continue;
      const grad = (Number(d.grad) || 0) % 360;
      if (!grad || !d.pfad || !q || q.url !== t.zeichnung_url || q.pfad !== d.pfad) continue;
      if (!/\.pdf(\?|#|$)/i.test(t.zeichnung_url)) continue;
      try {
        const a = await fetch(t.zeichnung_url);
        if (!a.ok) continue;
        const bytes = await pdfDrehen(new Uint8Array(await a.arrayBuffer()), grad);
        const neu = await hochladen(bytes);
        await umstellen(t.zeichnung_url, neu, [t], () => ({ grad, url: neu, von: t.zeichnung_url, pfad: d.pfad }));
        gemacht++;
      } catch (f) { console.warn("Zeichnung wieder drehen:", t.hoco_nr, f); }
    }
  } catch (f) {
    console.warn("Zeichnungen drehen:", f);
  } finally { laeuft = false; }
  return gemacht;
}

let takt = null;
export function drehungWaechter() {
  if (takt) return;
  if (window.TEST) { window.TEST.drehungNachholen = () => drehungNachholen(); return; }
  takt = setInterval(() => { drehungNachholen().catch(() => {}); }, TAKT_MS);
  setTimeout(() => { drehungNachholen().catch(() => {}); }, 60000);
}
