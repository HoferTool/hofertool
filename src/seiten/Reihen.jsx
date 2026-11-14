// 1×1 Rider: Reihen lernen auf Tempo (seit 1.546.0, Wunsch Patrick
// 14. November 2026, nur für ihn). Das Spiel mit three.js lädt erst,
// wenn man die Seite öffnet, damit die App sonst nicht schwerer wird.
import { lazy, Suspense } from "react";

const Spiel = lazy(() => import("./reihen/Spiel.jsx"));

export default function Reihen() {
  return (
    <Suspense fallback={<div className="leer" style={{ padding: 40 }}>Beser Reihen lernen lädt …</div>}>
      <Spiel />
    </Suspense>
  );
}
