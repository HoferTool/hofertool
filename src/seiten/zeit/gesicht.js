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
export async function gesichtLesen(video) {
  const api = await gesichtLaden();
  if (!video || video.readyState < 2) return null;
  const erg = await api.detectAllFaces(video, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks().withFaceDescriptors();
  if (!erg || !erg.length) return null;
  const g = erg.sort((a, b) => b.detection.box.area - a.detection.box.area)[0];
  const b = g.detection.box;
  return {
    muster: Array.from(g.descriptor, (x) => Math.round(x * 10000) / 10000),
    gross: b.width / (video.videoWidth || 1),
    sicher: g.detection.score,
    anzahl: erg.length,
  };
}

function abstand(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

// Unter 0.45 gilt als dieselbe Person (face-api nennt 0.6 als Grenze,
// wir sind strenger, damit nie für jemand anderen gestempelt wird).
// Und der Zweitbeste muss deutlich weiter weg sein.
export const GRENZE = 0.45;
export function personFinden(muster, gesichter) {
  const je = [];
  for (const g of gesichter || []) {
    let best = Infinity;
    for (const m of g.muster || []) if (Array.isArray(m) && m.length === muster.length) best = Math.min(best, abstand(muster, m));
    if (best < Infinity) je.push({ id: g.person_id, d: best });
  }
  je.sort((a, b) => a.d - b.d);
  const [erst, zweit] = je;
  if (!erst || erst.d >= GRENZE) return null;
  if (zweit && zweit.d - erst.d < 0.06) return null;
  return erst;
}

export async function kameraStarten(video) {
  const s = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
  });
  video.srcObject = s;
  video.setAttribute("playsinline", "");
  video.muted = true;
  await video.play().catch(() => {});
  return () => s.getTracks().forEach((t) => t.stop());
}

export function kameraMoeglich() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}
