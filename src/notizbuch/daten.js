// =================================================================
//  NOTIZBÜCHER · Daten
//  Bücher, Seiten und die Ablage für eingefügte Bilder und PDFs
//  (sql/notizbuecher.sql). Solange das SQL fehlt, meldet fehltTabelle
//  das, und das Fenster zeigt einen Hinweis statt abzustürzen.
// =================================================================
import { alt } from "../bruecke.jsx";
import { pdfjs } from "../teile/PdfAnsicht.jsx";

export const ABLAGE = "notizbuecher";
export const BUECHER = "notizbuecher";
export const SEITEN = "notizbuch_seiten";

// Farben für den Rücken der Bücher, wie die Reiter in OneNote
export const BUCHFARBEN = [["#1f5fbf", "Blau"], ["#7b3fb3", "Violett"], ["#c2185b", "Rosa"],
  ["#d84315", "Orange"], ["#2e7d32", "Grün"], ["#00838f", "Türkis"], ["#6d4c41", "Braun"],
  ["#455a64", "Grau"]];

export function fehltTabelle(e) {
  const t = String((e && (e.message || e.code)) || "");
  return /notizbu|PGRST205|42P01|does not exist|schema cache/i.test(t);
}

async function antwort(abfrage, was) {
  const r = await alt.zeitlimit(abfrage, 10000, was);
  if (r && r.error) throw r.error;
  return r ? r.data : null;
}

export const buecherLaden = () => antwort(alt.db.from(BUECHER)
  // Alle Spalten: gesperrt gibt es erst mit sql/notizbuch-passwort.sql
  .select("*")
  .order("reihenfolge", { ascending: true }).order("erstellt_am", { ascending: true }), "Notizbücher");

export const seitenLaden = (buchId) => antwort(alt.db.from(SEITEN)
  .select("id, buch_id, titel, reihenfolge, erstellt_am, geaendert_am").eq("buch_id", buchId)
  .order("reihenfolge", { ascending: true }).order("erstellt_am", { ascending: true }), "Seiten");

export const seiteLaden = (id) => antwort(alt.db.from(SEITEN)
  .select("id, titel, inhalt").eq("id", id).maybeSingle(), "Seite");

// ---------- Passwort (sql/notizbuch-passwort.sql) ----------
// Die Datenbank prüft das Passwort und gibt die Seiten erst danach
// heraus; die App merkt sich nur, welche Bücher gerade offen sind.
export function fehltFunktion(e) {
  const t = String((e && (e.message || e.code)) || "");
  return /PGRST202|42883|notizbuch_(oeffnen|passwort|passwort_admin|zu)|could not find the function/i.test(t);
}
async function rpc(name, werte) {
  const r = await alt.zeitlimit(alt.db.rpc(name, werte), 10000, "Notizbuch");
  if (r && r.error) throw r.error;
  return r ? r.data : null;
}
export const buchOeffnen = (id, passwort) => rpc("notizbuch_oeffnen", { p_buch: id, p_passwort: passwort });
export const passwortSetzen = (id, alt0, neu) => rpc("notizbuch_passwort", { p_buch: id, p_alt: alt0, p_neu: neu });
// Nur Admins, unter Einstellungen → Notizbücher: ohne das alte Passwort
export const passwortAdmin = (id, neu) => rpc("notizbuch_passwort_admin", { p_buch: id, p_neu: neu });
// Alle offenen Bücher wieder zu, wenn das Fenster zugeht
export function buecherZu() {
  try {
    Promise.resolve(alt.db.rpc("notizbuch_zu", { p_buch: null })).catch(() => { /* ohne SQL: egal */ });
  } catch (f) { /* egal */ }
}
// Antwort der Datenbank als Satz für die Person
export function passwortText(r) {
  const s = String(r || "");
  if (s === "falsch") return "Falsches Passwort.";
  if (s === "kurz") return "Das Passwort braucht mindestens 4 Zeichen.";
  if (s === "fehlt") return "Das Notizbuch gibt es nicht mehr.";
  const m = /^warten:(\d+)/.exec(s);
  if (m) return "Zu viele falsche Versuche. Bitte " + m[1] + (m[1] === "1" ? " Minute" : " Minuten") + " warten.";
  return "";
}

export async function seiteSpeichern(id, daten) {
  return antwort(alt.db.from(SEITEN)
    .update(Object.assign({}, daten, { geaendert_am: new Date().toISOString() })).eq("id", id),
  "Seite speichern");
}

// Zufälliger Dateiname, der sich nicht erraten lässt (die Ablage ist
// öffentlich lesbar wie die der Zeichnungen)
function zufall() {
  const z = new Uint8Array(12);
  crypto.getRandomValues(z);
  return Array.from(z, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hochladen(blob, endung, typ) {
  const pfad = new Date().getFullYear() + "/" + zufall() + "." + endung;
  const r = await alt.db.storage.from(ABLAGE).upload(pfad, blob, { contentType: typ, upsert: false });
  if (r && r.error) {
    if (/bucket/i.test(String(r.error.message || ""))) {
      throw new Error("Die Ablage für Notizbücher fehlt noch (Datei notizbuecher.sql in Supabase ausführen).");
    }
    throw r.error;
  }
  return alt.db.storage.from(ABLAGE).getPublicUrl(pfad).data.publicUrl;
}

// Zeichenfläche als JPEG; weisser Grund, damit durchsichtige PNG nicht schwarz werden
function alsJpeg(quelle, b, h) {
  const c = document.createElement("canvas");
  c.width = b; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, b, h);
  g.drawImage(quelle, 0, 0, b, h);
  return new Promise((fertig, fehler) => c.toBlob((blob) => blob ? fertig(blob)
    : fehler(new Error("Bild nicht lesbar")), "image/jpeg", 0.86));
}

function bildLesen(datei) {
  return new Promise((fertig, fehler) => {
    const url = URL.createObjectURL(datei);
    const bild = new Image();
    bild.onload = () => { fertig(bild); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    bild.onerror = () => { URL.revokeObjectURL(url); fehler(new Error(datei.name + " ist kein lesbares Bild")); };
    bild.src = url;
  });
}

const MAX_KANTE = 2000;
const MAX_PDF_SEITEN = 40;

// Bild verkleinern und hochladen → { u, v: Höhe/Breite, px: Breite }
export async function bildEinfuegen(datei) {
  const bild = await bildLesen(datei);
  let b = bild.naturalWidth, h = bild.naturalHeight;
  if (!b || !h) throw new Error(datei.name + " ist kein lesbares Bild");
  const f = Math.min(1, MAX_KANTE / Math.max(b, h));
  b = Math.round(b * f); h = Math.round(h * f);
  const u = await hochladen(await alsJpeg(bild, b, h), "jpg", "image/jpeg");
  return { u, v: h / b, px: b };
}

// PDF: das Original kommt in die Ablage (zum Öffnen), jede Seite als
// Bild auf die Notizbuch-Seite, wie ein „Ausdruck“ in OneNote. So kann
// man darauf zeichnen und schreiben.
export async function pdfEinfuegen(datei, fortschritt) {
  const daten = new Uint8Array(await datei.arrayBuffer());
  const lib = await pdfjs();
  const aufgabe = lib.getDocument({ data: daten.slice(), isEvalSupported: false });
  const doc = await aufgabe.promise;
  try {
    const q = await hochladen(new Blob([daten], { type: "application/pdf" }), "pdf", "application/pdf");
    const n = Math.min(doc.numPages, MAX_PDF_SEITEN);
    const seiten = [];
    for (let i = 1; i <= n; i++) {
      if (fortschritt) fortschritt(i, n);
      const seite = await doc.getPage(i);
      const v1 = seite.getViewport({ scale: 1 });
      const massstab = Math.min(4, 1600 / v1.width);
      const v = seite.getViewport({ scale: massstab });
      const c = document.createElement("canvas");
      c.width = Math.round(v.width); c.height = Math.round(v.height);
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await seite.render({ canvasContext: g, viewport: v }).promise;
      const u = await hochladen(await alsJpeg(c, c.width, c.height), "jpg", "image/jpeg");
      seiten.push({ u, v: c.height / c.width, q, s: i });
      c.width = 1; c.height = 1;   // Speicher gleich freigeben (iPad)
    }
    return { seiten, alle: doc.numPages };
  } finally {
    aufgabe.destroy();
  }
}

export const istPdf = (d) => /pdf$/i.test(d.type || "") || /\.pdf$/i.test(d.name || "");
export const istBild = (d) => /^image\//i.test(d.type || "") || /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(d.name || "");
