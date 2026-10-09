// =================================================================
//  DRUCKEN ÜBER DEN POOL-RECHNER
//  iPad und Handy hängen am WLAN Hofer&Co und erreichen den Sharp-
//  Drucker im Firmennetz nicht. Statt das WLAN zu wechseln (das darf
//  eine Web-App nicht) legt die App einen Druckauftrag in die Daten-
//  bank: PDF-Seiten und Fotos als JPG-Bilder in die Ablage „druck“,
//  Excel nur mit der Adresse der Datei. Der Pool-Rechner (drucken.ps1)
//  schaut alle paar Sekunden nach, druckt auf den Drucker aus
//  Einstellungen → Dokumente und meldet „fertig“ oder den Fehler
//  zurück (Wunsch Patrick, 9. Oktober 2026, sql/drucken-pool.sql).
// =================================================================
import { alt } from "../bruecke.jsx";

// Drucker und Stand des Pool-Rechners, eine Minute zwischengespeichert,
// damit der Druckknopf ohne Warten weiss, ob es den Weg gibt.
let konfig = null, konfigZeit = 0, konfigLaedt = null;

function jsonOder(text) {
  try { return text ? (typeof text === "string" ? JSON.parse(text) : text) : null; } catch (f) { return null; }
}

export function poolDruckLaden(frisch) {
  if (!frisch && konfig && Date.now() - konfigZeit < 60000) return Promise.resolve(konfig);
  if (konfigLaedt) return konfigLaedt;
  konfigLaedt = (async () => {
    try {
      const r = await alt.zeitlimit(alt.db.from("app_config").select("schluessel, wert")
        .in("schluessel", ["druck", "druck_status"]), 6000, "Drucker");
      const w = {};
      ((r && r.data) || []).forEach((x) => { w[x.schluessel] = jsonOder(x.wert); });
      konfig = { einst: w.druck || {}, stand: w.druck_status || null };
      konfigZeit = Date.now();
    } catch (f) { konfig = konfig || { einst: {}, stand: null }; }
    konfigLaedt = null;
    return konfig;
  })();
  return konfigLaedt;
}

// Gibt es den Weg? Ein Drucker muss gewählt sein, Externe nie.
export function poolDruckerName(k) {
  k = k || konfig;
  if (!k || alt.istExtern()) return "";
  return (k.einst && k.einst.drucker) || "";
}

// Hat sich der Pool-Rechner in den letzten zwei Minuten gemeldet?
export function poolLebt(k) {
  k = k || konfig;
  const z = k && k.stand && k.stand.gesehen;
  return !!z && Date.now() - new Date(z).getTime() < 120000;
}

// Kann der Pool-Rechner Excel? (Excel-Dateien druckt er mit Excel)
export function poolKannExcel(k) {
  k = k || konfig;
  return !!(k && k.stand && k.stand.excel);
}

// Ein Bild (Blob) als JPG; Fotos in anderen Formaten (webp) kann
// Windows sonst nicht lesen.
async function alsJpg(blob) {
  if (blob.type === "image/jpeg") return blob;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((ok, nein) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = () => nein(new Error("Bild nicht lesbar")); i.src = url;
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0);
    return await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.92));
  } finally { URL.revokeObjectURL(url); }
}

// Seiten einer PDF als JPG-Blobs, 200 Punkte je Zoll: feine Linien
// einer Zeichnung bleiben scharf, eine A4-Seite ist rund ein halbes MB.
export async function pdfSeitenAlsJpg(lib, daten) {
  const aufgabe = lib.getDocument({ data: daten.slice(), isEvalSupported: false });
  const doc = await aufgabe.promise;
  const seiten = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const seite = await doc.getPage(i);
      const v = seite.getViewport({ scale: 200 / 72 });
      const c = document.createElement("canvas");
      c.width = Math.floor(v.width); c.height = Math.floor(v.height);
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await seite.render({ canvasContext: g, viewport: v, canvas: c }).promise;
      seiten.push({ blob: await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.9)), quer: v.width > v.height });
      c.width = c.height = 0; // Speicher auf dem iPad gleich wieder frei
    }
  } finally { aufgabe.destroy(); }
  return seiten;
}

// Druckauftrag ablegen und verfolgen.
//  art "bilder": bilder = [Blob, …] (je Seite eines)
//  art "excel":  quelle = Adresse der Datei, blatt = Name des Blatts
export async function poolDrucken({ art, bilder, quelle, blatt, titel, kopien }) {
  const k = await poolDruckLaden();
  const drucker = poolDruckerName(k);
  if (!drucker) throw new Error("Unter Einstellungen → Dokumente ist kein Drucker gewählt.");
  const id = (crypto.randomUUID && crypto.randomUUID())
    || "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
  let seiten = 0;
  if (art === "bilder") {
    for (const b of bilder) {
      const jpg = await alsJpg(b);
      seiten++;
      const r = await alt.zeitlimit(alt.db.storage.from("druck").upload(id + "/" + seiten + ".jpg", jpg,
        { contentType: "image/jpeg", upsert: true }), 60000, "Seite hochladen");
      if (r && r.error) throw r.error;
    }
  }
  const profil = alt.profil || {};
  const r = await alt.zeitlimit(alt.db.from("druckauftraege").insert([{
    id, erstellt_von: profil.id || null, wer: profil.full_name || profil.email || null,
    titel: titel || null, art, quelle: quelle || null, blatt: blatt || null, seiten,
    kopien: Math.max(1, Math.min(20, kopien || 1)), drucker,
  }]), 10000, "Druckauftrag");
  if (r && r.error) throw r.error;
  verfolgen(id, drucker, poolLebt(k));
  return id;
}

// Nachschauen, bis der Pool-Rechner fertig ist; die Meldung unten
// rechts sagt, wie es steht. Nach drei Minuten ohne Antwort aufgeben.
function verfolgen(id, drucker, lebt) {
  alt.meldung(lebt ? "Geht an " + drucker + " …"
    : "Druckauftrag liegt bereit. Der Pool-Rechner hat sich länger nicht gemeldet; er druckt, sobald er läuft.",
    lebt ? undefined : "warn");
  const start = Date.now();
  let gemeldet = "offen", gewarnt = false;
  const schritt = async () => {
    let a = null;
    try {
      const r = await alt.db.from("druckauftraege").select("zustand, meldung").eq("id", id).maybeSingle();
      a = r && r.data;
    } catch (f) { /* beim nächsten Mal */ }
    if (a && a.zustand === "fertig") { alt.meldung("Gedruckt auf " + drucker + ".", "gut"); return; }
    if (a && a.zustand === "fehler") { alt.meldung("Drucken ging nicht: " + (a.meldung || "unbekannter Fehler"), "fehler"); return; }
    if (a && a.zustand === "druckt" && gemeldet !== "druckt") { gemeldet = "druckt"; alt.meldung("Druckt auf " + drucker + " …"); }
    const vergangen = Date.now() - start;
    if (lebt && !gewarnt && a && a.zustand === "offen" && vergangen > 45000) {
      gewarnt = true;
      alt.meldung("Der Pool-Rechner hat den Auftrag noch nicht geholt. Er druckt, sobald er läuft.", "warn");
    }
    if (vergangen < 180000) setTimeout(schritt, vergangen < 30000 ? 2000 : 5000);
  };
  setTimeout(schritt, 2000);
}
