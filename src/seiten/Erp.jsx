// Test ERP (seit 1.672.0, Wunsch Patrick 20. November 2026, nur mit Vermerk
// erpSehen). Lädt erst beim Öffnen, damit die App sonst nicht schwerer wird.
import { lazy, Suspense } from "react";

const Inhalt = lazy(() => import("./erp/ErpInhalt.jsx"));

export default function Erp(props) {
  return (
    <Suspense fallback={<div className="laedt">Test ERP lädt …</div>}>
      <Inhalt {...props} />
    </Suspense>
  );
}
