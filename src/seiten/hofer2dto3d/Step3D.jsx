// =================================================================
//  3D-ANSICHT EINER STEP-DATEI (HOFER2DTO3D)
//  Die STEP-Datei liest OpenCascade (occt-import-js, WebAssembly) in
//  einem eigenen Worker zu Dreiecken; three.js zeichnet sie. Programm
//  und WebAssembly kommen aus occt/ der eigenen Website (vite.config.js),
//  nicht von einem fremden Server, weil Brave und Werbeblocker das
//  Nachladen von dort gern sperren (wie bei der Texterkennung).
//  Ziehen dreht, Mausrad oder zwei Finger zoomen, rechte Maustaste
//  oder Shift + Ziehen verschiebt.
// =================================================================
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Gelesene Modelle je Adresse, damit ein Wechsel hin und her nicht jedes
// Mal neu rechnet (höchstens vier)
const vorrat = new Map();

function occtLesen(puffer) {
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

const ANSICHTEN = [
  ["iso", "Iso"], ["vorne", "Vorne"], ["oben", "Oben"], ["seite", "Seite"],
];

export default function Step3D({ url }) {
  const flaeche = useRef(null);
  const welt = useRef(null);
  const [stand, setStand] = useState({ art: "laden" });
  const [kanten, setKanten] = useState(true);
  const [schnitt, setSchnitt] = useState(false);

  // Bühne einmal aufbauen
  useEffect(() => {
    const el = flaeche.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.localClippingEnabled = true;
    el.appendChild(renderer.domElement);
    const szene = new THREE.Scene();
    const kamera = new THREE.PerspectiveCamera(35, 1, 0.1, 100000);
    szene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6));
    const licht = new THREE.DirectionalLight(0xffffff, 1.6);
    licht.position.set(1, 1.4, 2);
    kamera.add(licht);
    szene.add(kamera);
    const steuer = new OrbitControls(kamera, renderer.domElement);
    steuer.enableDamping = true;
    steuer.dampingFactor = 0.12;
    steuer.screenSpacePanning = true;
    let lauf = 0;
    const malen = () => { lauf = requestAnimationFrame(malen); steuer.update(); renderer.render(szene, kamera); };
    malen();
    const groesse = () => {
      const b = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(b, h, false);
      renderer.domElement.style.width = b + "px";
      renderer.domElement.style.height = h + "px";
      kamera.aspect = b / h;
      kamera.updateProjectionMatrix();
    };
    groesse();
    const ro = new ResizeObserver(groesse);
    ro.observe(el);
    welt.current = { renderer, szene, kamera, steuer, gruppe: null, kugel: null, ebene: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0) };
    return () => {
      cancelAnimationFrame(lauf);
      ro.disconnect();
      steuer.dispose();
      szene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      renderer.dispose();
      renderer.domElement.remove();
      welt.current = null;
    };
  }, []);

  // Modell laden
  useEffect(() => {
    let weg = false;
    setStand({ art: "laden" });
    stepLaden(url).then((r) => {
      if (weg || !welt.current) return;
      const w = welt.current;
      if (w.gruppe) {
        w.szene.remove(w.gruppe);
        w.gruppe.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      }
      const gruppe = new THREE.Group();
      let dreiecke = 0;
      for (const m of r.meshes) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
        if (m.attributes.normal) g.setAttribute("normal", new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
        if (m.index) g.setIndex(m.index.array);
        if (!m.attributes.normal) g.computeVertexNormals();
        dreiecke += (m.index ? m.index.array.length : m.attributes.position.array.length / 3) / 3;
        const farbe = m.color ? new THREE.Color(m.color[0], m.color[1], m.color[2]) : new THREE.Color(0xb9c3cc);
        const stoff = new THREE.MeshStandardMaterial({ color: farbe, metalness: 0.35, roughness: 0.45,
          side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
          clippingPlanes: [w.ebene] });
        gruppe.add(new THREE.Mesh(g, stoff));
        const k = new THREE.LineSegments(new THREE.EdgesGeometry(g, 28),
          new THREE.LineBasicMaterial({ color: 0x1d2733, clippingPlanes: [w.ebene] }));
        k.userData.kante = true;
        gruppe.add(k);
      }
      // Mitte des Modells in den Ursprung, damit Drehen um das Teil geht
      const box = new THREE.Box3().setFromObject(gruppe);
      const mitte = box.getCenter(new THREE.Vector3());
      gruppe.position.sub(mitte);
      w.szene.add(gruppe);
      w.gruppe = gruppe;
      const masse = box.getSize(new THREE.Vector3());
      w.kugel = Math.max(masse.length() / 2, 1);
      ansicht("iso");
      setStand({ art: "fertig", masse, dreiecke: Math.round(dreiecke) });
    }).catch((f) => { if (!weg) setStand({ art: "fehler", text: (f && f.message) || String(f) }); });
    return () => { weg = true; };
  }, [url]);

  useEffect(() => {
    const w = welt.current;
    if (w && w.gruppe) w.gruppe.traverse((o) => { if (o.userData.kante) o.visible = kanten; });
  }, [kanten, stand]);

  // Schnitt längs durch die Mitte (Ebene XZ des Modells), zeigt Bohrungen
  useEffect(() => {
    const w = welt.current;
    if (!w) return;
    w.ebene.constant = schnitt ? 0 : 1e9;
  }, [schnitt, stand]);

  function ansicht(art) {
    const w = welt.current;
    if (!w || !w.kugel) return;
    const r = w.kugel / Math.tan((w.kamera.fov / 2) * Math.PI / 180) * 1.15;
    const richtung = { iso: [1, -1.2, 0.9], vorne: [0, -1, 0], oben: [0, 0, 1], seite: [1, 0, 0] }[art] || [1, -1, 1];
    const v = new THREE.Vector3(...richtung).normalize().multiplyScalar(r);
    w.kamera.up.set(0, 0, 1);
    if (art === "oben") w.kamera.up.set(0, 1, 0);
    w.kamera.position.copy(v);
    w.kamera.near = r / 100;
    w.kamera.far = r * 100;
    w.kamera.updateProjectionMatrix();
    w.steuer.target.set(0, 0, 0);
    w.steuer.update();
  }

  const z = (n) => (Math.round(n * 100) / 100).toFixed(2);
  return (
    <div className="h3d-ansicht">
      <div className="h3d-leiste">
        {ANSICHTEN.map(([a, t]) => (
          <button key={a} className="knopf knopf--klein" data-h3d-ansicht={a} disabled={stand.art !== "fertig"} onClick={() => ansicht(a)}>{t}</button>))}
        <label className="h3d-haken"><input type="checkbox" checked={kanten} onChange={(e) => setKanten(e.target.checked)} /> Kanten</label>
        <label className="h3d-haken"><input type="checkbox" data-h3d-schnitt checked={schnitt} onChange={(e) => setSchnitt(e.target.checked)} /> Schnitt</label>
      </div>
      <div className="h3d-flaeche" ref={flaeche} data-h3d-flaeche>
        {stand.art === "laden" && <div className="h3d-hinweis">3D-Modell wird gelesen …</div>}
        {stand.art === "fehler" && <div className="h3d-hinweis h3d-hinweis--fehler">Das 3D-Modell lässt sich nicht anzeigen: {stand.text}
          <br />Herunterladen geht trotzdem.</div>}
      </div>
      {stand.art === "fertig" && (
        <div className="h3d-fuss klein" data-h3d-fertig>
          Grösse {z(stand.masse.x)} × {z(stand.masse.y)} × {z(stand.masse.z)} mm · Ziehen dreht, Mausrad zoomt, rechte Maustaste verschiebt
        </div>)}
    </div>
  );
}
