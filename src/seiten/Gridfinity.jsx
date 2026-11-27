// =================================================================
//  SEITE GRIDFINITY (seit 1.895.0, Wunsch Patrick 27. November 2026:
//  „ein Tool, das Gridfinity als Basis funktioniert“, gewählt: Boxen und
//  Grundplatten). Unter Hilfsprogramme, alle ausser Externen und Dienst.
//  three.js und die Rechnung laden erst beim Öffnen der Seite.
// =================================================================
import { lazy, Suspense } from "react";

const Werkzeug = lazy(() => import("./gridfinity/Werkzeug.jsx"));

export default function Gridfinity() {
  return (
    <div className="gfn-seite">
      <h1 className="seitentitel">Gridfinity</h1>
      <Suspense fallback={<p className="leer">Wird geladen …</p>}><Werkzeug /></Suspense>
    </div>
  );
}
