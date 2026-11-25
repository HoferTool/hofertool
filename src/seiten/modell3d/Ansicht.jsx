// =================================================================
//  3D-VIEWER FÜR SKETCHUP-MODELLE (seit 1.797.0, Wunsch Patrick
//  25. November 2026: „einen Viewer für ein SketchUp-Modell“)
//  Eine .skp-Datei kann der Browser nicht lesen (das Format ist nur mit
//  dem SketchUp-SDK für Windows/Mac lesbar). Darum nimmt der Viewer, was
//  SketchUp exportiert: .dae (Collada), .kmz, .glb/.gltf, .obj (+ .mtl),
//  .stl, .fbx, .3ds, .wrl, dazu .3mf und .ply. three.js liest sie im Gerät,
//  nichts geht auf einen Server. Mehrere Dateien auf einmal (gltf mit
//  Texturen, obj mit mtl und Bildern) gehen über Adressen im Speicher.
//  Bedienung wie im HOFER2DTO3D: Ziehen dreht frei (Trackball), Mausrad
//  oder zwei Finger zoomen, rechte Maustaste verschiebt, SpaceMouse.
// =================================================================
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { spaceMausVerbinden, spaceMausSuchen, spaceMausStand, spaceMausAnwenden } from "../hofer2dto3d/spaceMaus.js";

export const ENDUNGEN = ["dae", "kmz", "glb", "gltf", "obj", "stl", "fbx", "3ds", "wrl", "3mf", "ply"];
const ANSICHTEN = [["iso", "Iso"], ["vorne", "Vorne"], ["hinten", "Hinten"], ["links", "Links"], ["rechts", "Rechts"], ["oben", "Oben"]];
// Diese Formate rechnen in Metern (Collada, KMZ und glTF geben die Einheit
// mit, three.js rechnet sie in Meter um); die anderen haben keine Einheit
const IN_METERN = new Set(["dae", "kmz", "glb", "gltf", "fbx"]);

const endung = (n) => String(n || "").toLowerCase().split(".").pop();

// Liest die gewählten Dateien. Die Hauptdatei ist die erste mit bekannter
// Endung; die übrigen (Texturen, .mtl, .bin) findet der Loader über ihren Namen.
export async function modellLesen(dateien) {
  const liste = [...dateien];
  if (liste.some((d) => endung(d.name) === "skp") && !liste.some((d) => ENDUNGEN.includes(endung(d.name)))) {
    throw new Error("SKP");
  }
  const haupt = liste.find((d) => ["glb", "gltf", "dae", "kmz", "fbx", "3ds", "wrl", "3mf", "stl", "ply"].includes(endung(d.name)))
    || liste.find((d) => endung(d.name) === "obj");
  if (!haupt) throw new Error("FORMAT");
  const adressen = new Map(liste.map((d) => [d.name.toLowerCase(), URL.createObjectURL(d)]));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(blob:|data:)/.test(url)) return url;
    const name = decodeURIComponent(url.split(/[\\/]/).pop().split("?")[0]).toLowerCase();
    return adressen.get(name) || url;
  });
  const url = adressen.get(haupt.name.toLowerCase());
  const art = endung(haupt.name);
  try {
    let objekt;
    if (art === "glb" || art === "gltf") {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      objekt = (await new GLTFLoader(manager).loadAsync(url)).scene;
    } else if (art === "dae") {
      const { ColladaLoader } = await import("three/examples/jsm/loaders/ColladaLoader.js");
      objekt = (await new ColladaLoader(manager).loadAsync(url)).scene;
    } else if (art === "kmz") {
      const { KMZLoader } = await import("three/examples/jsm/loaders/KMZLoader.js");
      objekt = (await new KMZLoader(manager).loadAsync(url)).scene;
    } else if (art === "fbx") {
      const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
      objekt = await new FBXLoader(manager).loadAsync(url);
    } else if (art === "3ds") {
      const { TDSLoader } = await import("three/examples/jsm/loaders/TDSLoader.js");
      objekt = await new TDSLoader(manager).loadAsync(url);
    } else if (art === "wrl") {
      const { VRMLLoader } = await import("three/examples/jsm/loaders/VRMLLoader.js");
      objekt = await new VRMLLoader(manager).loadAsync(url);
    } else if (art === "3mf") {
      const { ThreeMFLoader } = await import("three/examples/jsm/loaders/3MFLoader.js");
      objekt = await new ThreeMFLoader(manager).loadAsync(url);
    } else if (art === "stl" || art === "ply") {
      const mod = art === "stl"
        ? await import("three/examples/jsm/loaders/STLLoader.js")
        : await import("three/examples/jsm/loaders/PLYLoader.js");
      const Lader = art === "stl" ? mod.STLLoader : mod.PLYLoader;
      const g = await new Lader(manager).loadAsync(url);
      const farbe = g.attributes.color ? { vertexColors: true } : { color: 0xb9c3cc };
      objekt = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ ...farbe, metalness: 0.2, roughness: 0.6 }));
      // STL und PLY sind fast immer mit Z nach oben gezeichnet
      objekt.rotation.x = -Math.PI / 2;
    } else {
      const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
      const lader = new OBJLoader(manager);
      const text = await haupt.text();
      const mtlName = (text.match(/^\s*mtllib\s+(.+?)\s*$/m) || [])[1];
      const mtl = mtlName && liste.find((d) => d.name.toLowerCase() === mtlName.split(/[\\/]/).pop().toLowerCase());
      if (mtl) {
        const { MTLLoader } = await import("three/examples/jsm/loaders/MTLLoader.js");
        const stoffe = new MTLLoader(manager).parse(await mtl.text(), "");
        stoffe.preload();
        lader.setMaterials(stoffe);
      }
      objekt = lader.parse(text);
    }
    return { objekt, art, name: haupt.name, adressen, meter: IN_METERN.has(art) };
  } catch (f) {
    for (const a of adressen.values()) URL.revokeObjectURL(a);
    throw f;
  }
}

export function fehlerText(f) {
  const m = (f && f.message) || String(f);
  if (m === "SKP") return "Eine .skp-Datei kann der Browser nicht direkt lesen. In SketchUp: Datei → Exportieren → 3D-Modell → als .dae (Collada) oder .glb speichern und diese Datei hier öffnen.";
  if (m === "FORMAT") return "Dieses Format kennt der Viewer nicht. Möglich: " + ENDUNGEN.map((e) => "." + e).join(", ") + ".";
  return "Das Modell lässt sich nicht lesen: " + m;
}

function wegraeumen(o) {
  o.traverse((x) => {
    if (x.geometry) x.geometry.dispose();
    const st = Array.isArray(x.material) ? x.material : x.material ? [x.material] : [];
    for (const s of st) { for (const k in s) if (s[k] && s[k].isTexture) s[k].dispose(); s.dispose(); }
  });
}

// Teile der ersten Ebene (SketchUp: Gruppen und Komponenten) zum Ein- und Ausblenden
function teileVon(objekt) {
  let wurzel = objekt;
  while (wurzel.children.length === 1 && !wurzel.isMesh) wurzel = wurzel.children[0];
  return wurzel.children.map((c, i) => ({ obj: c, name: c.name || (c.isMesh ? "Fläche " : "Teil ") + (i + 1) }));
}

export default function ModellAnsicht({ modell }) {
  const flaeche = useRef(null);
  const welt = useRef(null);
  const [info, setInfo] = useState(null);
  const [kanten, setKanten] = useState(true);
  const [draht, setDraht] = useState(false);
  const [teile, setTeile] = useState([]);
  const [, setNeu] = useState(0);
  const [maus, setMaus] = useState(spaceMausStand());

  useEffect(() => { spaceMausSuchen(setMaus); }, []);

  useEffect(() => {
    const el = flaeche.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const szene = new THREE.Scene();
    const kamera = new THREE.PerspectiveCamera(35, 1, 0.01, 100000);
    szene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.8));
    const licht = new THREE.DirectionalLight(0xffffff, 1.4);
    licht.position.set(1, 1.4, 2);
    kamera.add(licht);
    szene.add(kamera);
    const steuer = new TrackballControls(kamera, renderer.domElement);
    steuer.rotateSpeed = 3.2; steuer.zoomSpeed = 1.4; steuer.panSpeed = 0.9;
    steuer.staticMoving = true;
    steuer.keys = [];
    let lauf = 0;
    const malen = () => {
      lauf = requestAnimationFrame(malen);
      spaceMausAnwenden(kamera, steuer.target);
      steuer.update();
      renderer.render(szene, kamera);
    };
    malen();
    const groesse = () => {
      const b = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(b, h, false);
      renderer.domElement.style.width = b + "px";
      renderer.domElement.style.height = h + "px";
      kamera.aspect = b / h;
      kamera.updateProjectionMatrix();
      steuer.handleResize();
    };
    groesse();
    const ro = new ResizeObserver(groesse);
    ro.observe(el);
    welt.current = { renderer, szene, kamera, steuer, halter: null, kugel: 1 };
    return () => {
      cancelAnimationFrame(lauf);
      ro.disconnect();
      steuer.dispose();
      if (welt.current && welt.current.halter) wegraeumen(welt.current.halter);
      renderer.dispose();
      renderer.domElement.remove();
      welt.current = null;
    };
  }, []);

  // Modell in die Bühne: in einen Halter, der um die Mitte dreht
  useEffect(() => {
    const w = welt.current;
    if (!w || !modell) return;
    if (w.halter) { w.szene.remove(w.halter); wegraeumen(w.halter); }
    const halter = new THREE.Group();
    const innen = new THREE.Group();
    innen.add(modell.objekt);
    halter.add(innen);
    w.szene.add(halter);
    w.halter = halter; w.innen = innen;
    let dreiecke = 0;
    modell.objekt.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      // Ohne Normalen (oder alle 0, wie in manchen STL-Exporten) wäre das Modell schwarz
      const nm = g.attributes.normal;
      if (!nm || !nm.array.some((v) => v !== 0)) g.computeVertexNormals();
      dreiecke += (g.index ? g.index.count : g.attributes.position.count) / 3;
      const st = Array.isArray(o.material) ? o.material : [o.material];
      for (const s of st) if (s) { s.side = THREE.DoubleSide; s.polygonOffset = true; s.polygonOffsetFactor = 1; s.polygonOffsetUnits = 1; }
      // SketchUp zeigt Kanten schwarz; ab 300'000 Dreiecken nur auf Wunsch
      const k = new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), new THREE.LineBasicMaterial({ color: 0x1d2733 }));
      k.userData.kante = true;
      o.add(k);
    });
    if (dreiecke > 300000) setKanten(false);
    setTeile(teileVon(modell.objekt));
    zentrieren();
    ansicht("iso");
    const b = new THREE.Box3().setFromObject(innen).getSize(new THREE.Vector3());
    setInfo({ dreiecke: Math.round(dreiecke), masse: b });
  }, [modell]);

  useEffect(() => {
    const w = welt.current;
    if (!w || !w.halter) return;
    w.halter.traverse((o) => {
      if (o.userData.kante) o.visible = kanten;
      else if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((s) => { if (s) s.wireframe = draht; });
    });
  }, [kanten, draht, modell]);

  // Mitte in den Ursprung, Grösse für den Abstand der Kamera
  function zentrieren() {
    const w = welt.current;
    w.innen.position.set(0, 0, 0);
    w.halter.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(w.innen);
    const mitte = box.getCenter(new THREE.Vector3());
    w.innen.position.sub(mitte.applyMatrix4(new THREE.Matrix4().copy(w.halter.matrixWorld).invert()));
    w.kugel = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-3);
  }

  function ansicht(art) {
    const w = welt.current;
    if (!w || !w.halter) return;
    const r = w.kugel / Math.tan((w.kamera.fov / 2) * Math.PI / 180) * 1.15;
    // Y ist oben (so liefern glTF, Collada und KMZ ihre Modelle)
    const richtung = { iso: [1, 0.8, 1.2], vorne: [0, 0, 1], hinten: [0, 0, -1], links: [-1, 0, 0], rechts: [1, 0, 0], oben: [0, 1, 0] }[art];
    w.kamera.position.copy(new THREE.Vector3(...richtung).normalize().multiplyScalar(r));
    w.kamera.up.set(0, 1, 0);
    if (art === "oben") w.kamera.up.set(0, 0, -1);
    w.kamera.near = r / 1000; w.kamera.far = r * 100;
    w.kamera.updateProjectionMatrix();
    w.steuer.target.set(0, 0, 0);
    w.steuer.minDistance = r / 200; w.steuer.maxDistance = r * 20;
    w.steuer.update();
  }

  // Steht das Modell auf dem Kopf oder liegt es, um 90° kippen
  function kippen() {
    const w = welt.current;
    if (!w || !w.halter) return;
    w.halter.rotateX(-Math.PI / 2);
    zentrieren();
    ansicht("iso");
  }

  function teilUmschalten(t) {
    t.obj.visible = !t.obj.visible;
    setNeu((n) => n + 1);
  }
  function alleTeile(an) {
    for (const t of teile) t.obj.visible = an;
    setNeu((n) => n + 1);
  }

  const z = (n) => modell && modell.meter
    ? alt0((n * 1000).toFixed(n * 1000 >= 100 ? 0 : 1)) + " mm"
    : alt0(n.toFixed(2));
  return (
    <div className="m3d-ansicht">
      <div className="h3d-leiste">
        {ANSICHTEN.map(([a, t]) => (
          <button key={a} className="knopf knopf--klein" data-m3d-ansicht={a} disabled={!info} onClick={() => ansicht(a)}>{t}</button>))}
        <button className="knopf knopf--klein" data-m3d-kippen disabled={!info} title="Modell um 90° kippen, wenn es liegt oder auf dem Kopf steht" onClick={kippen}>↻ Kippen</button>
        <label className="h3d-haken"><input type="checkbox" data-m3d-kanten checked={kanten} onChange={(e) => setKanten(e.target.checked)} /> Kanten</label>
        <label className="h3d-haken"><input type="checkbox" data-m3d-draht checked={draht} onChange={(e) => setDraht(e.target.checked)} /> Drahtgitter</label>
        {maus.moeglich && (
          <button className={"knopf knopf--klein" + (maus.verbunden ? " knopf--primaer" : "")}
            onClick={() => spaceMausVerbinden(setMaus)}>{maus.verbunden ? "✓ SpaceMouse" : "SpaceMouse"}</button>)}
      </div>
      <div className="m3d-zwei">
        <div className="h3d-flaeche m3d-flaeche" ref={flaeche} data-m3d-flaeche />
        {teile.length > 1 && (
          <div className="karte m3d-teile" data-m3d-teile>
            <div className="m3d-teile-kopf"><b>Teile ({teile.length})</b>
              <span><button className="knopf knopf--klein" onClick={() => alleTeile(true)}>Alle</button>{" "}
                <button className="knopf knopf--klein" onClick={() => alleTeile(false)}>Keine</button></span></div>
            {teile.map((t, i) => (
              <label key={i} className="m3d-teil"><input type="checkbox" checked={t.obj.visible} onChange={() => teilUmschalten(t)} /> {t.name}</label>))}
          </div>)}
      </div>
      {info && (
        <div className="h3d-fuss klein" data-m3d-fertig>
          {modell.name} · Grösse {z(info.masse.x)} × {z(info.masse.y)} × {z(info.masse.z)}{modell.meter ? "" : " (Einheit der Datei)"} · {alt0(String(info.dreiecke))} Dreiecke
          · Ziehen dreht, Mausrad zoomt, rechte Maustaste verschiebt
        </div>)}
    </div>
  );
}

// Tausender mit Apostroph (1'200), wie zahlText im alten Programm
function alt0(s) {
  const [g, k] = String(s).split(".");
  return g.replace(/\B(?=(\d{3})+(?!\d))/g, "'") + (k ? "." + k : "");
}
