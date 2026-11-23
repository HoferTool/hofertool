// =================================================================
//  QUALITÄTSSICHERUNG (seit 1.607.0, Wunsch Patrick 17. November 2026:
//  „soll wieder als Reiter kommen, Qualitätssicherung und darunter
//  Unterreiter Ausschussmeldungen und dann Prüfmittel, wie damals“).
//  Ausschussmeldungen ist die frühere Seite QS (1.77.0 bis 1.316.x),
//  Prüfmittel (1.558.0 bis 1.701.x) ist seit 1.702.0 entfernt. Nicht für
//  Externe und Dienst (seiteSichtbar „qs“). Seit 1.744.0 Reiter
//  Reklamationsmanagement (qs/Reklamationen.jsx).
// =================================================================
import { useReducer } from "react";
import { alt } from "../bruecke.jsx";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import Ausschuss from "./qs/Ausschuss.jsx";
import Reklamationen from "./qs/Reklamationen.jsx";

// Gewählter Reiter; bleibt beim Seitenwechsel
export const qsZustand = { ansicht: "ausschuss" };

export function qsReiter() {
  const r = [["ausschuss", "Ausschussmeldungen"]];
  // Reklamationsmanagement nur für Admins (seit 1.748.0, Wunsch Patrick 23. November 2026)
  if (alt.istAdmin()) r.push(["reklamationen", "Reklamationsmanagement"]);
  // Den Reiter Prüfmittel gibt es seit 1.702.0 nicht mehr (Wunsch Patrick 22. November 2026)
  return r;
}

export default function Qs({ auffrischen, behaelter }) {
  const [, zeichnen] = useReducer((x) => x + 1, 0);
  const reiter = qsReiter();
  if (!reiter.some(([w]) => w === qsZustand.ansicht)) qsZustand.ansicht = "ausschuss";
  const waehlen = (w) => { qsZustand.ansicht = w; zeichnen(); };
  return (
    <>
      <h1 className="seitentitel">Qualitätssicherung</h1>
      <Reiter reiter={reiter} aktiv={qsZustand.ansicht} waehlen={waehlen} merkmal="qs" seite="qs" />
      <Uebergang key={qsZustand.ansicht}>
        <div id="qs-inhalt">
          {qsZustand.ansicht === "reklamationen" ? <Reklamationen />
            : <Ausschuss auffrischen={auffrischen} behaelter={behaelter} />}
        </div>
      </Uebergang>
    </>
  );
}
