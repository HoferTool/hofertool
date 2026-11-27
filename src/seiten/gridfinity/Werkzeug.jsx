// =================================================================
//  GRIDFINITY-WERKZEUG (seit 1.889.0, Wunsch Patrick 27. November 2026)
//  Links die Einstellungen, rechts die 3D-Vorschau, unten der Export als
//  3MF oder STL. Die Einstellungen merkt sich das Gerät (localStorage
//  „hofer.gridfinity“), Strg + Z nimmt die letzte Änderung zurück.
// =================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { alt } from "../../bruecke.jsx";
import { useEntwurfZurueck } from "../../teile/lokalZurueck.js";
import {
  BOX_VORGABE, PLATTE_VORGABE, boxPruefen, plattePruefen, boxMasse, platteMasse,
  boxNetz, platteNetz, stlBinaer, dreiMF, GF,
} from "./geometrie.js";

const SPEICHER = "hofer.gridfinity";
const DRUCKBETT = 256;   // gängige Druckbetten (Bambu, Prusa MK4 ~250)

function laden() {
  try {
    const s = JSON.parse(localStorage.getItem(SPEICHER) || "null");
    if (s && typeof s === "object") return {
      art: s.art === "platte" ? "platte" : "box",
      box: { ...BOX_VORGABE, ...(s.box || {}) },
      platte: { ...PLATTE_VORGABE, ...(s.platte || {}) },
    };
  } catch { /* privates Fenster: Vorgabe */ }
  return { art: "box", box: { ...BOX_VORGABE }, platte: { ...PLATTE_VORGABE } };
}

const mm = (x) => (Math.round(x * 10) / 10).toString().replace(".", ",");

// Zahl mit − und + daneben: auf dem iPad leichter als Tippen
function Zahl({ titel, wert, setzen, min, max, schritt = 1, einheit, hinweis, name }) {
  const [text, setText] = useState(String(wert).replace(".", ","));
  useEffect(() => { setText(String(wert).replace(".", ",")); }, [wert]);
  const neu = (v) => {
    v = Math.round(Math.min(max, Math.max(min, v)) * 100) / 100;
    setzen(v);
  };
  const uebernehmen = () => {
    const v = parseFloat(String(text).replace(",", "."));
    if (Number.isFinite(v)) neu(v); else setText(String(wert).replace(".", ","));
  };
  return (
    <label className="gfn-zahl">
      <span className="gfn-zahl__titel">{titel}</span>
      <span className="gfn-zahl__reihe">
        <button type="button" className="gfn-zahl__knopf" aria-label={titel + " kleiner"} disabled={wert <= min}
          onClick={(e) => { e.preventDefault(); neu(wert - schritt); }}>−</button>
        <input inputMode="decimal" value={text} data-gf={name}
          onChange={(e) => setText(e.target.value)} onBlur={uebernehmen}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); uebernehmen(); } }} />
        <button type="button" className="gfn-zahl__knopf" aria-label={titel + " grösser"} disabled={wert >= max}
          onClick={(e) => { e.preventDefault(); neu(wert + schritt); }}>+</button>
        {einheit && <span className="gfn-zahl__einheit">{einheit}</span>}
      </span>
      {hinweis && <span className="gfn-zahl__hinweis">{hinweis}</span>}
    </label>
  );
}

function Schalter({ titel, an, setzen, name, text }) {
  return (
    <label className="gfn-schalter">
      <input type="checkbox" checked={an} data-gf={name} onChange={(e) => setzen(e.target.checked)} />
      <span><b>{titel}</b>{text && <small>{text}</small>}</span>
    </label>
  );
}

export default function Werkzeug() {
  const [stand, setStand] = useState(laden);
  useEntwurfZurueck(stand, setStand, true, alt.meldung);
  useEffect(() => { try { localStorage.setItem(SPEICHER, JSON.stringify(stand)); } catch { /* egal */ } }, [stand]);

  const box = boxPruefen(stand.box), platte = plattePruefen(stand.platte);
  const b = (k) => (v) => setStand((s) => ({ ...s, box: { ...s.box, [k]: v } }));
  const p = (k) => (v) => setStand((s) => ({ ...s, platte: { ...s.platte, [k]: v } }));

  const netz = useMemo(() => {
    try { return stand.art === "box" ? boxNetz(box) : platteNetz(platte); }
    catch (f) { alt.fehlerMerken && alt.fehlerMerken("Gridfinity", String(f)); return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stand.art, JSON.stringify(stand.art === "box" ? box : platte)]);

  const bm = boxMasse(box), pm = platteMasse(platte);
  const name = stand.art === "box"
    ? `gridfinity-box-${box.nx}x${box.ny}x${box.u}` + (box.fx * box.fy > 1 ? `-${box.fx}x${box.fy}faecher` : "")
    : `gridfinity-platte-${pm.nx}x${pm.ny}` + (platte.art === "schublade" ? `-${Math.round(pm.W)}x${Math.round(pm.D)}mm` : "");
  const breit = stand.art === "box" ? bm.W : pm.W, tief = stand.art === "box" ? bm.D : pm.D;
  const zuGross = Math.max(breit, tief) > DRUCKBETT;

  async function speichern(format) {
    if (!netz) return;
    const daten = format === "3mf" ? await dreiMF(netz, name) : stlBinaer(netz, name);
    const blob = new Blob([daten], { type: format === "3mf" ? "model/3mf" : "model/stl" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name + "." + format;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    alt.meldung(`${name}.${format} gespeichert.`, "gut");
  }

  return (
    <div className="gfn-werkzeug">
      <div className="gfn-wahl" role="tablist">
        {[["box", "Box"], ["platte", "Grundplatte"]].map(([w, t]) => (
          <button key={w} role="tab" aria-selected={stand.art === w} data-gf-art={w}
            className={"gfn-wahl__knopf" + (stand.art === w ? " aktiv" : "")}
            onClick={() => setStand((s) => ({ ...s, art: w }))}>{t}</button>
        ))}
      </div>

      <div className="gfn-raster">
        <div className="gfn-einstellungen">
          {stand.art === "box" ? <>
            <section className="gfn-gruppe">
              <h3>Grösse</h3>
              <Zahl titel="Breite" name="nx" wert={box.nx} setzen={b("nx")} min={1} max={10} einheit="Felder" hinweis={mm(bm.W) + " mm"} />
              <Zahl titel="Tiefe" name="ny" wert={box.ny} setzen={b("ny")} min={1} max={10} einheit="Felder" hinweis={mm(bm.D) + " mm"} />
              <Zahl titel="Höhe" name="u" wert={box.u} setzen={b("u")} min={1} max={30} einheit="× 7 mm" hinweis={mm(bm.H) + " mm" + (box.rand ? " + Stapelrand" : "")} />
            </section>
            <section className="gfn-gruppe">
              <h3>Fächer</h3>
              <Zahl titel="Nebeneinander" name="fx" wert={box.fx} setzen={b("fx")} min={1} max={20} />
              <Zahl titel="Hintereinander" name="fy" wert={box.fy} setzen={b("fy")} min={1} max={20} />
            </section>
            <section className="gfn-gruppe">
              <h3>Ausführung</h3>
              <Schalter titel="Stapelrand" name="rand" an={box.rand} setzen={b("rand")} text="Boxen lassen sich aufeinander stellen" />
              <Schalter titel="Beschriftungsleiste" name="leiste" an={box.leiste} setzen={b("leiste")} text="Schräge Leiste hinten in jedem Fach" />
              {box.leiste && <Zahl titel="Leiste tief" name="leisteB" wert={box.leisteB} setzen={b("leisteB")} min={6} max={30} einheit="mm" />}
              <Schalter titel="Magnetlöcher" name="magnete" an={box.magnete} setzen={b("magnete")} text="Für Magnete 6 × 2 mm, vier je Feld unten" />
              <Zahl titel="Wand" name="wand" wert={box.wand} setzen={b("wand")} min={0.8} max={3} schritt={0.2} einheit="mm" />
              <Zahl titel="Boden" name="boden" wert={box.boden} setzen={b("boden")} min={0.6} max={5} schritt={0.2} einheit="mm" />
            </section>
          </> : <>
            <section className="gfn-gruppe">
              <h3>Grösse</h3>
              <div className="gfn-wahl gfn-wahl--klein">
                {[["felder", "Anzahl Felder"], ["schublade", "Schublade ausmessen"]].map(([w, t]) => (
                  <button key={w} type="button" data-gf-platte={w}
                    className={"gfn-wahl__knopf" + (platte.art === w ? " aktiv" : "")} onClick={() => p("art")(w)}>{t}</button>
                ))}
              </div>
              {platte.art === "felder" ? <>
                <Zahl titel="Breite" name="pnx" wert={platte.nx} setzen={p("nx")} min={1} max={20} einheit="Felder" hinweis={mm(pm.W) + " mm"} />
                <Zahl titel="Tiefe" name="pny" wert={platte.ny} setzen={p("ny")} min={1} max={20} einheit="Felder" hinweis={mm(pm.D) + " mm"} />
              </> : <>
                <Zahl titel="Schublade innen breit" name="breite" wert={platte.breite} setzen={p("breite")} min={42} max={1000} schritt={1} einheit="mm" />
                <Zahl titel="Schublade innen tief" name="tiefe" wert={platte.tiefe} setzen={p("tiefe")} min={42} max={1000} schritt={1} einheit="mm" />
                <p className="gfn-text" data-gf-felder>
                  Passt {pm.nx} × {pm.ny} Felder, Rand ringsum {mm((pm.W - pm.nx * GF.raster) / 2)} / {mm((pm.D - pm.ny * GF.raster) / 2)} mm (0,5 mm Luft zur Schublade).
                </p>
              </>}
            </section>
            <section className="gfn-gruppe">
              <h3>Ausführung</h3>
              <Schalter titel="Magnetlöcher" name="pmagnete" an={platte.magnete} setzen={p("magnete")} text="Vier je Feld, Platte wird 7,6 statt 4,4 mm hoch" />
            </section>
          </>}
        </div>

        <div className="gfn-vorschau">
          <Vorschau netz={netz} />
          <div className="gfn-fuss">
            <div className="gfn-masse" data-gf-masse>
              <b>{mm(breit)} × {mm(tief)} × {mm(netz ? netz.max[2] - netz.min[2] : 0)} mm</b>
              {zuGross && <span className="gfn-warnung" data-gf-warnung>Grösser als {DRUCKBETT} mm: passt auf die meisten Drucker nicht, besser in Stücke teilen.</span>}
            </div>
            <div className="gfn-export">
              <button className="knopf knopf--haupt" data-gf-export="3mf" disabled={!netz} onClick={() => speichern("3mf")}>3MF speichern</button>
              <button className="knopf" data-gf-export="stl" disabled={!netz} onClick={() => speichern("stl")}>STL</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- 3D-Vorschau ----------
function Vorschau({ netz }) {
  const flaeche = useRef(null);
  const welt = useRef(null);
  const ersteAnsicht = useRef(true);

  useEffect(() => {
    const el = flaeche.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch { el.textContent = "3D-Ansicht geht auf diesem Gerät nicht. Speichern geht trotzdem."; return undefined; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.appendChild(renderer.domElement);
    const szene = new THREE.Scene();
    const kamera = new THREE.PerspectiveCamera(35, 1, 0.5, 20000);
    kamera.up.set(0, 0, 1);
    szene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6));
    const licht = new THREE.DirectionalLight(0xffffff, 1.6);
    licht.position.set(-1, -2, 3);
    kamera.add(licht); szene.add(kamera);
    const steuer = new OrbitControls(kamera, renderer.domElement);
    steuer.enableDamping = true;
    let lauf = 0;
    const malen = () => { lauf = requestAnimationFrame(malen); steuer.update(); renderer.render(szene, kamera); };
    malen();
    const groesse = () => {
      const b = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(b, h, false);
      renderer.domElement.style.width = b + "px"; renderer.domElement.style.height = h + "px";
      kamera.aspect = b / h; kamera.updateProjectionMatrix();
    };
    groesse();
    const ro = new ResizeObserver(groesse); ro.observe(el);
    welt.current = { renderer, szene, kamera, steuer, teil: null, raster: null };
    return () => {
      cancelAnimationFrame(lauf); ro.disconnect(); steuer.dispose();
      const w = welt.current;
      if (w && w.teil) { w.teil.geometry.dispose(); w.teil.material.dispose(); }
      renderer.dispose(); renderer.domElement.remove();
      welt.current = null;
    };
  }, []);

  useEffect(() => {
    const w = welt.current;
    if (!w) return;
    if (w.teil) { w.szene.remove(w.teil); w.teil.geometry.dispose(); w.teil.material.dispose(); w.teil = null; }
    if (w.raster) { w.szene.remove(w.raster); w.raster = null; }
    if (!netz) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(netz.pos, 3));
    g.setIndex(new THREE.BufferAttribute(netz.tri, 1));
    const flach = g.toNonIndexed(); g.dispose();
    flach.computeVertexNormals();
    const teil = new THREE.Mesh(flach, new THREE.MeshStandardMaterial({ color: 0x3f7fbf, roughness: 0.55, metalness: 0.05 }));
    teil.position.z = -netz.min[2];
    w.szene.add(teil); w.teil = teil;
    // Raster 42 mm als Boden, damit die Grösse sichtbar ist
    const gross = Math.max(netz.max[0] - netz.min[0], netz.max[1] - netz.min[1]);
    const felder = Math.ceil(gross / GF.raster) + 2;
    const raster = new THREE.GridHelper(felder * GF.raster, felder, 0x8a99a8, 0xc3ccd5);
    raster.rotation.x = Math.PI / 2; raster.position.z = -0.05;
    w.szene.add(raster); w.raster = raster;
    if (ersteAnsicht.current || w.groesse !== Math.round(gross)) {
      // Kamera schräg von vorne oben, ganzes Teil im Bild
      const h = netz.max[2] - netz.min[2];
      const d = Math.max(gross, h) * 1.45 + 30;
      w.kamera.position.set(d * 0.55, -d * 0.85, d * 0.75);
      w.steuer.target.set(0, 0, h / 3);
      w.steuer.update();
      ersteAnsicht.current = false; w.groesse = Math.round(gross);
    }
  }, [netz]);

  return <div className="gfn-3d" ref={flaeche} data-gf-3d />;
}
