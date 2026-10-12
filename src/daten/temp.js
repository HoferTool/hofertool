// =================================================================
//  TEMP-ORDNER (1.38.0, Wunsch Patrick 12. Oktober 2026)
//  Jede Person hat in der Ablage „temp“ einen eigenen Ordner
//  <Konto-Kennung>/…, um Dateien, Fotos und Videos vom Handy auf den
//  Computer zu bringen. Nur die Person selbst darf ihn lesen und
//  ändern, das prüft die Datenbank (sql/temp-ordner.sql). Nach
//  TEMP_TAGE löscht die Server-Funktion „temp-aufraeumen“ alles.
//  Nicht in der Sicherung (src/teile/sicherung.js).
// =================================================================
import { alt } from "../bruecke.jsx";

export const ABLAGE = "temp";
export const TEMP_TAGE = 7;
// Grenze der Ablage und von Supabase Free je Datei
export const TEMP_MAX = 50 * 1024 * 1024;

const ordner = () => alt.profil && alt.profil.id;

// Speichername: Zeit vorne, damit gleiche Namen sich nicht überschreiben;
// nur Zeichen, die die Ablage sicher annimmt (Umlaute umgeschrieben)
export function speicherName(name) {
  const sauber = String(name || "Datei")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(-120) || "Datei";
  return Date.now() + "-" + sauber;
}

// Anzeigename ohne die Zeit vorne
export const anzeigeName = (n) => String(n).replace(/^\d{10,}-/, "");

export async function tempListe() {
  const id = ordner();
  if (!id) return [];
  const r = await alt.zeitlimit(alt.db.storage.from(ABLAGE).list(id,
    { limit: 1000, sortBy: { column: "created_at", order: "desc" } }), 15000, "Temp-Ordner");
  if (r.error) throw r.error;
  const liste = (r.data || []).filter((d) => d && d.id && d.name !== ".emptyFolderPlaceholder")
    .map((d) => ({
      pfad: id + "/" + d.name, name: anzeigeName(d.name),
      groesse: (d.metadata && d.metadata.size) || 0,
      typ: (d.metadata && d.metadata.mimetype) || "",
      am: d.created_at,
    }));
  liste.sort((a, b) => String(b.am).localeCompare(String(a.am)));
  return liste;
}

export async function tempHochladen(datei) {
  const id = ordner();
  if (!id) throw new Error("Nicht angemeldet.");
  if (datei.size > TEMP_MAX) throw new Error(datei.name + " ist grösser als 50 MB.");
  const r = await alt.db.storage.from(ABLAGE).upload(id + "/" + speicherName(datei.name), datei,
    { contentType: datei.type || "application/octet-stream", upsert: false });
  if (r.error) throw r.error;
}

export async function tempLoeschen(pfade) {
  const r = await alt.db.storage.from(ABLAGE).remove(pfade);
  if (r.error) throw r.error;
}

// Kurz gültige Adresse zum Ansehen oder (mit name) Herunterladen
export async function tempAdresse(pfad, name) {
  const r = await alt.db.storage.from(ABLAGE).createSignedUrl(pfad, 3600, name ? { download: name } : undefined);
  if (r.error) throw r.error;
  return r.data.signedUrl;
}

// Vorschaubilder in einem Zug
export async function tempVorschauen(pfade) {
  if (!pfade.length) return {};
  const r = await alt.db.storage.from(ABLAGE).createSignedUrls(pfade, 3600);
  const aus = {};
  (r.data || []).forEach((x) => { if (x && x.signedUrl && x.path) aus[x.path] = x.signedUrl; });
  return aus;
}

// Einmal am Tag je Gerät die Server-Funktion anstossen, die
// Abgelaufenes bei allen löscht. Fehler sind egal: dann eben morgen.
export function tempAufraeumenTaeglich() {
  const heute = new Date().toISOString().slice(0, 10);
  try { if (localStorage.getItem("hofer.tempAufgeraeumt") === heute) return; } catch (f) { /* egal */ }
  setTimeout(() => {
    alt.db.functions.invoke("temp-aufraeumen", { body: {} }).then((r) => {
      if (r && !r.error) { try { localStorage.setItem("hofer.tempAufgeraeumt", heute); } catch (f) { /* egal */ } }
    }).catch(() => {});
  }, 8000);
}
