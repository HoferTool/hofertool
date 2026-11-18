// STEP lesen ohne three.js (seit 1.622.0 aus Step3D.jsx herausgelöst),
// damit HOFERCAM die Werkzeug-STEP lesen kann, ohne three.js zu laden.
// OpenCascade (occt-import-js) läuft als WebAssembly im Worker aus occt/.

// Gelesene Modelle je Adresse, damit ein Wechsel hin und her nicht jedes
// Mal neu rechnet (höchstens vier)
const vorrat = new Map();

export function occtLesen(puffer) {
  return new Promise((gut, schlecht) => {
    let w;
    try { w = new Worker("./occt/occt-import-js-worker.js"); } catch (f) { schlecht(f); return; }
    const uhr = setTimeout(() => { w.terminate(); schlecht(new Error("Zeit abgelaufen")); }, 120000);
    w.onmessage = (e) => { clearTimeout(uhr); w.terminate(); gut(e.data); };
    w.onerror = (e) => { clearTimeout(uhr); w.terminate(); schlecht(new Error(e.message || "Worker")); };
    w.postMessage({ format: "step", buffer: puffer, params: { linearUnit: "millimeter", linearDeflectionType: "bounding_box_ratio", linearDeflection: 0.0005, angularDeflection: 0.3 } });
  });
}

export function stepLaden(url) {
  if (!vorrat.has(url)) {
    const p = (window.TEST && window.TEST.stepLesen
      ? Promise.resolve(window.TEST.stepLesen(url))
      : fetch(url).then((a) => { if (!a.ok) throw new Error("STEP-Datei nicht erreichbar"); return a.arrayBuffer(); })
        .then((b) => occtLesen(new Uint8Array(b))))
      .then((r) => {
        if (!r || !r.success || !(r.meshes || []).length) throw new Error("Die STEP-Datei enthält keinen Körper, der sich zeichnen lässt.");
        return r;
      });
    p.catch(() => vorrat.delete(url));
    if (vorrat.size > 3) vorrat.delete(vorrat.keys().next().value);
    vorrat.set(url, p);
  }
  return vorrat.get(url);
}

