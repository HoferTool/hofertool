// =================================================================
//  GESICHTSERKENNUNG FÜR HOFERTIME (seit 1.631.0, Wunsch Patrick
//  18. November 2026: „könnten wir auch Gesichtserkennung machen?“)
//  Gerechnet wird nur im Gerät mit face-api (TensorFlow im Browser),
//  kein Bild geht weg und keins wird gespeichert. In der Datenbank
//  (zeit_gesichter) steht je Person nur das Zahlenmuster: je Aufnahme
//  128 Zahlen, aus denen sich kein Gesicht zurückrechnen lässt.
//  Die Modelle (7 MB) liegen auf der eigenen Website unter faceapi/
//  (vite.config.js) und laden erst, wenn die Kamera gebraucht wird.
// =================================================================

let fa = null;
let laden = null;

export function gesichtLaden() {
  if (fa) return Promise.resolve(fa);
  if (!laden) {
    laden = (async () => {
      const m = await import("@vladmandic/face-api");
      const api = m.default || m;
      const pfad = new URL("faceapi/", document.baseURI).href;
      await api.tf.ready();
      await Promise.all([
        api.nets.tinyFaceDetector.loadFromUri(pfad),
        api.nets.faceLandmark68Net.loadFromUri(pfad),
        api.nets.faceRecognitionNet.loadFromUri(pfad),
      ]);
      fa = api;
      return api;
    })();
    laden.catch(() => { laden = null; });
  }
  return laden;
}

// Ein Gesicht im Bild: { muster: Array(128), gross, mitte } oder null.
// Bei mehreren Gesichtern zählt das grösste (wer vor dem Panel steht).
// Seit 1.658.0 (Patrick 20. November 2026: „funktioniert schlecht auf dem
// iPad“) mit feinerem Raster 416, und findet es nichts, nochmals mit 608:
// so kommen auch Gesichter weiter weg oder schräg von unten dazu.
export async function gesichtLesen(video) {
  const api = await gesichtLaden();
  if (!video || video.readyState < 2) return null;
  const lesen = (gr) => api.detectAllFaces(video, new api.TinyFaceDetectorOptions({ inputSize: gr, scoreThreshold: 0.4 }))
    .withFaceLandmarks().withFaceDescriptors();
  let erg = await lesen(416);
  if (!erg || !erg.length) erg = await lesen(608);
  if (!erg || !erg.length) return null;
  const g = erg.sort((a, b) => b.detection.box.area - a.detection.box.area)[0];
  const b = g.detection.box;
  return {
    muster: Array.from(g.descriptor, (x) => Math.round(x * 10000) / 10000),
    gross: b.width / (video.videoWidth || 1),
    sicher: g.detection.score,
    anzahl: erg.length,
    licht: lichtMessen(video, b),
  };
}

// Licht am Gesicht (seit 1.659.0, Patrick 20. November 2026: „liegt es
// evtl. am Licht?“): mittlere Helligkeit 0–255 im Gesicht und im ganzen
// Bild, auf einem kleinen Bild gerechnet. Daraus ein Hinweis, wenn es
// zu dunkel ist oder das Licht von hinten kommt (Fenster im Rücken).
let leinwand = null;
function lichtMessen(video, box) {
  try {
    const w = 80, h = Math.round(80 * (video.videoHeight || 3) / (video.videoWidth || 4));
    if (!leinwand) leinwand = document.createElement("canvas");
    leinwand.width = w; leinwand.height = h;
    const c = leinwand.getContext("2d", { willReadFrequently: true });
    c.drawImage(video, 0, 0, w, h);
    const d = c.getImageData(0, 0, w, h).data;
    const fx = w / (video.videoWidth || 1), fy = h / (video.videoHeight || 1);
    const x0 = Math.max(0, Math.floor(box.x * fx)), x1 = Math.min(w, Math.ceil((box.x + box.width) * fx));
    const y0 = Math.max(0, Math.floor(box.y * fy)), y1 = Math.min(h, Math.ceil((box.y + box.height) * fy));
    let alle = 0, n = 0, ges = 0, m = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      alle += l; n++;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) { ges += l; m++; }
    }
    return { gesicht: m ? ges / m : null, bild: n ? alle / n : null };
  } catch { return null; }
}

// Was am Licht nicht stimmt, als Text für die Person, sonst ""
export function lichtHinweis(licht) {
  if (!licht || licht.gesicht == null) return "";
  if (licht.gesicht < 55) return "Zu dunkel im Gesicht. Mehr Licht von vorne.";
  if (licht.bild - licht.gesicht > 45) return "Gegenlicht: das Licht kommt von hinten. Anders hinstellen.";
  if (licht.gesicht > 225) return "Zu hell im Gesicht.";
  return "";
}

// Abstand eines Musters zum Mittelwert anderer (fürs Einlernen: passt
// die neue Aufnahme zu den bisherigen?)
export function abstandZu(muster, liste) {
  const mi = liste && liste.length === 1 ? liste[0] : mittel(liste);
  return mi ? abstand(muster, mi) : 0;
}

function abstand(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

// Mittelwert aller Aufnahmen einer Person: liegt näher an „ihrem“
// Gesicht als jede einzelne Aufnahme mit Licht und Kopfhaltung von dort.
function mittel(liste) {
  const ok = (liste || []).filter((m) => Array.isArray(m) && m.length === 128);
  if (ok.length < 2) return null;
  const s = new Array(128).fill(0);
  for (const m of ok) for (let i = 0; i < 128; i++) s[i] += m[i];
  return s.map((x) => x / ok.length);
}

// Unter GRENZE gilt als dieselbe Person (face-api nennt 0.6 als Grenze,
// wir bleiben strenger, damit nie für jemand anderen gewählt wird), und
// der Zweitbeste muss deutlich weiter weg sein. Seit 1.658.0 0.5 statt
// 0.45 und Vorsprung 0.05 statt 0.06, dafür muss das Panel die Person in
// 2 von 3 Bildern finden (Panel.jsx).
export const GRENZE = 0.5;
export const VORSPRUNG = 0.05;
export function personFinden(muster, gesichter) {
  const je = [];
  for (const g of gesichter || []) {
    let best = Infinity;
    const alle = (g.muster || []).filter((m) => Array.isArray(m) && m.length === muster.length);
    const mi = mittel(alle);
    if (mi) alle.push(mi);
    for (const m of alle) best = Math.min(best, abstand(muster, m));
    if (best < Infinity) je.push({ id: g.person_id, d: best });
  }
  je.sort((a, b) => a.d - b.d);
  const [erst, zweit] = je;
  if (!erst || erst.d >= GRENZE) return null;
  if (zweit && zweit.d - erst.d < VORSPRUNG) return null;
  return erst;
}

// Seit 1.721.0 (Patrick 23. November 2026: „es war nicht die Frontkamera“):
// facingMode "user" ist nur ein Wunsch, Safari am iPad nahm mit 1280 × 720
// teils die Rückkamera. Darum zuerst die Frontkamera als Pflicht, dann prüfen,
// was wirklich läuft, und sonst die Kamera mit „Front“/„Vorder“ im Namen
// genau wählen. Die gefundene merkt das Gerät.
const FRONT_KEY = "hofer.zeit.frontkamera";
const FRONT_RE = /front|vorder|user|facetime|frontal/i;
const HINTEN_RE = /back|rück|rueck|environment|rear|arrière/i;

function istFront(s) {
  const t = s && s.getVideoTracks ? s.getVideoTracks()[0] : null;
  if (!t) return false;
  const st = t.getSettings ? t.getSettings() : {};
  if (st.facingMode) return st.facingMode === "user";
  if (HINTEN_RE.test(t.label || "")) return false;
  return true;
}

async function frontHolen() {
  const mass = { width: { ideal: 1280 }, height: { ideal: 720 } };
  let gemerkt = null;
  try { gemerkt = localStorage.getItem(FRONT_KEY); } catch { /* egal */ }
  if (gemerkt) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: gemerkt }, ...mass }, audio: false });
      if (istFront(s)) return s;
      s.getTracks().forEach((t) => t.stop());
    } catch { /* gemerkte gibt es nicht mehr */ }
  }
  let s = null;
  try {
    s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: "user" }, ...mass }, audio: false });
  } catch {
    s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  }
  if (istFront(s)) { merken(s); return s; }
  // Falsche Kamera: nach Namen suchen (Namen gibt es erst nach der Erlaubnis)
  let geraete = [];
  try { geraete = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput"); } catch { /* egal */ }
  const vorne = geraete.find((d) => FRONT_RE.test(d.label || "")) || geraete.find((d) => d.label && !HINTEN_RE.test(d.label));
  if (vorne) {
    s.getTracks().forEach((t) => t.stop());
    s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: vorne.deviceId }, ...mass }, audio: false });
    merken(s);
  }
  return s;
}

function merken(s) {
  const t = s.getVideoTracks()[0];
  const id = t && t.getSettings ? t.getSettings().deviceId : null;
  if (id) { try { localStorage.setItem(FRONT_KEY, id); } catch { /* egal */ } }
}

export async function kameraStarten(video) {
  const s = await frontHolen();
  video.srcObject = s;
  video.setAttribute("playsinline", "");
  video.muted = true;
  await video.play().catch(() => {});
  return () => s.getTracks().forEach((t) => t.stop());
}

export function kameraMoeglich() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}
