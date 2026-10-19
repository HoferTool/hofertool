// =================================================================
//  NOTIZBÜCHER · Daten
//  Bücher, Seiten und die Ablage für eingefügte Bilder und PDFs
//  (sql/notizbuecher.sql). Solange das SQL fehlt, meldet fehltTabelle
//  das, und das Fenster zeigt einen Hinweis statt abzustürzen.
// =================================================================
import { alt } from "../bruecke.jsx";
import { pdfjs, seitenLinks } from "../teile/PdfAnsicht.jsx";

export const ABLAGE = "notizbuecher";
export const BUECHER = "notizbuecher";
export const SEITEN = "notizbuch_seiten";
// Abschnitte wie in OneNote: Buch → Abschnitt → Seite (sql/notizbuch-abschnitte.sql)
export const ABSCHNITTE = "notizbuch_abschnitte";

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

const SEITEN_SPALTEN = "id, buch_id, titel, reihenfolge, erstellt_am, geaendert_am";
// Ohne Inhalt (der kommt erst mit der einzelnen Seite). abschnitt_id gibt
// es erst mit sql/notizbuch-abschnitte.sql; fehlt sie, ohne
export async function seitenLaden(buchId) {
  const laden = (spalten) => antwort(alt.db.from(SEITEN).select(spalten).eq("buch_id", buchId)
    .order("reihenfolge", { ascending: true }).order("erstellt_am", { ascending: true }), "Seiten");
  try {
    return await laden(SEITEN_SPALTEN + ", abschnitt_id");
  } catch (e) {
    if (/abschnitt_id|42703|PGRST204/i.test(String((e && (e.message || e.code)) || ""))) return laden(SEITEN_SPALTEN);
    throw e;
  }
}

// Abschnitte eines Buchs; null, solange das SQL fehlt (dann ohne Abschnitte)
export async function abschnitteLaden(buchId) {
  try {
    return (await antwort(alt.db.from(ABSCHNITTE).select("*").eq("buch_id", buchId)
      .order("reihenfolge", { ascending: true }).order("erstellt_am", { ascending: true }), "Abschnitte")) || [];
  } catch (e) {
    if (fehltTabelle(e)) return null;
    throw e;
  }
}

// Pad Mode mit Abschnitten: null, solange das SQL fehlt
export async function padAbschnitteLaden(buchId, parkId) {
  try {
    const ab = await rpc("notizbuch_pad_abschnitte", { p_buch: buchId, p_park: parkId });
    const s = ab ? await rpc("notizbuch_pad_seiten_ab", { p_buch: buchId, p_park: parkId }) : null;
    return ab && s ? { abschnitte: ab, seiten: s } : null;
  } catch (e) {
    return null;
  }
}

// Pad Mode: Seiten eines dem Park zugewiesenen Buchs samt Inhalt, nur
// zum Lesen und ohne Passwort (sql/notizbuch-pad-lesen.sql)
export const padSeitenLaden = (buchId, parkId) => rpc("notizbuch_pad_seiten", { p_buch: buchId, p_park: parkId });

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

// Eine Seite eines geöffneten PDFs als Bild in die Ablage
// → { u, v: Höhe/Breite, q: Adresse des PDFs, s: Seitennummer, l: Verweise }
export async function pdfSeiteHochladen(doc, i, q) {
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
  // Verweise (Inhaltsverzeichnis) springen später zur Seite im Ausdruck
  const l = await seitenLinks(doc, seite).catch(() => []);
  const aus = Object.assign({ u, v: c.height / c.width, q, s: i }, l.length ? { l } : {});
  c.width = 1; c.height = 1;   // Speicher gleich freigeben (iPad)
  seite.cleanup();
  return aus;
}

export const pdfHochladen = (daten) => hochladen(new Blob([daten], { type: "application/pdf" }), "pdf", "application/pdf");

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
      seiten.push(await pdfSeiteHochladen(doc, i, q));
    }
    return { seiten, alle: doc.numPages };
  } finally {
    aufgabe.destroy();
  }
}

// Verweise für schon eingefügte Ausdrucke nachholen: lädt das Original
// aus der Ablage, gibt je Seitennummer die Verweise zurück (auch leer)
export async function pdfLinksHolen(url, nummern) {
  const antwort = await fetch(url);
  if (!antwort.ok) throw new Error("PDF nicht gefunden");
  const daten = new Uint8Array(await antwort.arrayBuffer());
  const lib = await pdfjs();
  const aufgabe = lib.getDocument({ data: daten, isEvalSupported: false });
  const doc = await aufgabe.promise;
  try {
    const aus = new Map();
    for (const nr of new Set(nummern)) {
      if (nr < 1 || nr > doc.numPages) continue;
      aus.set(nr, await seitenLinks(doc, await doc.getPage(nr)).catch(() => []));
    }
    return aus;
  } finally {
    aufgabe.destroy();
  }
}

// PDF als Datei: das Original in die Ablage, dazu die erste Seite als
// kleines Vorschaubild. Antippen öffnet es im Betrachter (Wunsch
// Patrick 15. Oktober 2026: „fragen, ob Ausdruck oder Datei“).
export async function pdfAlsDatei(datei) {
  const daten = new Uint8Array(await datei.arrayBuffer());
  const lib = await pdfjs();
  const aufgabe = lib.getDocument({ data: daten.slice(), isEvalSupported: false });
  const doc = await aufgabe.promise;
  try {
    const q = await hochladen(new Blob([daten], { type: "application/pdf" }), "pdf", "application/pdf");
    const seite = await doc.getPage(1);
    const v1 = seite.getViewport({ scale: 1 });
    const v = seite.getViewport({ scale: Math.min(3, 700 / v1.width) });
    const c = document.createElement("canvas");
    c.width = Math.round(v.width); c.height = Math.round(v.height);
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    await seite.render({ canvasContext: g, viewport: v }).promise;
    const u = await hochladen(await alsJpeg(c, c.width, c.height), "jpg", "image/jpeg");
    const v0 = c.height / c.width;
    c.width = 1; c.height = 1;
    return { u, q, v: v0, alle: doc.numPages };
  } finally {
    aufgabe.destroy();
  }
}

export const istPdf = (d) => /pdf$/i.test(d.type || "") || /\.pdf$/i.test(d.name || "");
export const istBild = (d) => /^image\//i.test(d.type || "") || /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(d.name || "");
