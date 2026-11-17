// =================================================================
//  QUALITÄTSSICHERUNG (seit 1.607.0, Wunsch Patrick 17. November 2026:
//  „soll wieder als Reiter kommen, Qualitätssicherung und darunter
//  Unterreiter Ausschussmeldungen und dann Prüfmittel, wie damals“).
//  Ausschussmeldungen ist die frühere Seite QS (1.77.0 bis 1.316.x),
//  Prüfmittel die Seite aus 1.558.0, die nur Admins sehen. Nicht für
//  Externe und Dienst (seiteSichtbar „qs“).
// =================================================================
import { useReducer } from "react";
import { alt } from "../bruecke.jsx";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import Ausschuss from "./qs/Ausschuss.jsx";
import Pruefmittel from "./Pruefmittel.jsx";

// Gewählter Reiter; bleibt beim Seitenwechsel, wird von #/pruefmittel gesetzt
export const qsZustand = { ansicht: "ausschuss" };

export function qsReiter() {
  const r = [["ausschuss", "Ausschussmeldungen"]];
  if (alt.seiteSichtbar("pruefmittel")) r.push(["pruefmittel", "Prüfmittel"]);
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
          {qsZustand.ansicht === "pruefmittel"
            ? <Pruefmittel auffrischen={auffrischen} behaelter={behaelter} eingebettet />
            : <Ausschuss auffrischen={auffrischen} behaelter={behaelter} />}
        </div>
      </Uebergang>
    </>
  );
}
