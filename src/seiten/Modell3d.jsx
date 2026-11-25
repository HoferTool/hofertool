// =================================================================
//  SEITE 3D-VIEWER (seit 1.797.0, Wunsch Patrick 25. November 2026:
//  „kannst du mir im hofertool einen viewer machen für ein sketchup
//  modell?“). Unter Hilfsprogramme, alle ausser Externen und Dienst.
//  Die Datei bleibt im Gerät: nichts wird hochgeladen oder gespeichert.
//  three.js lädt erst, wenn ein Modell geöffnet wird.
// =================================================================
import { lazy, Suspense, useEffect, useRef, useState } from "react";

const Ansicht = lazy(() => import("./modell3d/Ansicht.jsx"));
const ANNEHMEN = ".dae,.kmz,.glb,.gltf,.bin,.obj,.mtl,.stl,.fbx,.3ds,.wrl,.3mf,.ply,.skp,.png,.jpg,.jpeg,.webp,.bmp,.tga";

export default function Modell3d() {
  const [modell, setModell] = useState(null);
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(false);
  const feld = useRef(null);
  const altes = useRef(null);

  // Adressen im Speicher wieder freigeben (Texturen des vorigen Modells)
  const freigeben = (m) => { if (m && m.adressen) for (const a of m.adressen.values()) URL.revokeObjectURL(a); };
  useEffect(() => () => freigeben(altes.current), []);

  async function oeffnen(dateien) {
    if (!dateien || !dateien.length) return;
    setFehler(""); setLaedt(true);
    const mod = await import("./modell3d/Ansicht.jsx");
    try {
      const m = await mod.modellLesen(dateien);
      freigeben(altes.current);
      altes.current = m;
      setModell(m);
    } catch (f) {
      setFehler(mod.fehlerText(f));
    } finally {
      setLaedt(false);
      if (feld.current) feld.current.value = "";
    }
  }

  return (
    // Hineinziehen geht über den gemeinsamen Helfer (dateiAblegen.js), der
    // das Dateifeld unten füllt
    <div className="m3d-seite">
      <div className="m3d-kopf">
        <h1 className="seitentitel">3D-Viewer</h1>
        <button className="knopf knopf--primaer" data-m3d-oeffnen onClick={() => feld.current && feld.current.click()} disabled={laedt}>
          {laedt ? "Wird gelesen …" : modell ? "Anderes Modell öffnen" : "Modell öffnen"}</button>
        <input ref={feld} type="file" multiple accept={ANNEHMEN} hidden data-m3d-datei
          onChange={(e) => oeffnen(e.target.files)} />
      </div>
      {fehler && <div className="m3d-fehler" data-m3d-fehler>{fehler}</div>}
      {modell ? (
        <Suspense fallback={<div className="h3d-flaeche"><div className="h3d-hinweis">3D-Ansicht wird geladen …</div></div>}>
          <Ansicht modell={modell} />
        </Suspense>
      ) : (
        <div className="karte m3d-leer" data-m3d-leer>
          <h2>SketchUp-Modell ansehen</h2>
          <p>Eine <b>.skp</b>-Datei kann der Browser nicht direkt lesen. So geht es:</p>
          <ol>
            <li>In SketchUp das Modell öffnen.</li>
            <li><b>Datei → Exportieren → 3D-Modell …</b></li>
            <li>Dateityp <b>COLLADA (*.dae)</b> wählen (oder .glb, .kmz, .obj, .stl) und speichern.</li>
            <li>Hier auf <b>Modell öffnen</b> tippen oder die Datei in dieses Fenster ziehen.</li>
          </ol>
          <p className="klein">Bei .dae speichert SketchUp die Texturen in einen Ordner daneben: diese Bilder einfach mit auswählen. Die Datei bleibt auf diesem Gerät, es wird nichts hochgeladen.</p>
        </div>
      )}
    </div>
  );
}
