// =================================================================
//  BESTELLUNGEN
//  Ganz in React. Die Reiter liegen in src/seiten/bestellungen/.
//  Einige Fenster (Status, neue Position, Artikel und Lieferant
//  bearbeiten) und die Bestellmail sind noch im alten Programm.
//
//  Das alte Programm ruft nach jeder Änderung seiteBestellungen(b)
//  auf. Das kommt hier als „auffrischen“ an und lädt den Reiter
//  still neu, ohne die Seite neu aufzubauen.
// =================================================================
import { useReducer } from "react";
import { alt } from "../bruecke.jsx";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import Offen from "./bestellungen/Offen.jsx";
import Historie from "./bestellungen/Historie.jsx";
import Artikel from "./bestellungen/Artikel.jsx";
import Bezeichnungen from "./bestellungen/Bezeichnungen.jsx";
import Lieferanten from "./bestellungen/Lieferanten.jsx";

export const REITER = [
  ["offen", "Offen"], ["bestellt", "Bestellt"], ["historie", "Historie"],
  ["artikel", "Artikel"], ["bezeichnungen", "Bezeichnungen"], ["lieferanten", "Lieferanten"],
];

export default function Bestellungen({ auffrischen, behaelter }) {
  // Der gewählte Reiter steht in best.ansicht im alten Programm, weil
  // auch die Suche und die Taste Zurück ihn setzen.
  const best = alt.best;
  const [, zeichnen] = useReducer((x) => x + 1, 0);
  const waehlen = (wert) => { best.ansicht = wert; zeichnen(); };

  return (
    <>
      <h1 className="seitentitel">Bestellungen</h1>
      <Reiter reiter={REITER} aktiv={best.ansicht} waehlen={waehlen} merkmal="best" seite="bestellungen" />
      {!alt.darfSchreiben() &&
        <div className="nurlesen">Du kannst hier alles ansehen, aber nichts ändern.</div>}
      <Uebergang key={best.ansicht}>
        <div id="best-inhalt">
          <Inhalt ansicht={best.ansicht} auffrischen={auffrischen} behaelter={behaelter} />
        </div>
      </Uebergang>
    </>
  );
}

function Inhalt({ ansicht, ...weiter }) {
  if (ansicht === "historie") return <Historie {...weiter} />;
  if (ansicht === "artikel") return <Artikel {...weiter} />;
  if (ansicht === "bezeichnungen") return <Bezeichnungen {...weiter} />;
  if (ansicht === "lieferanten") return <Lieferanten {...weiter} />;
  return <Offen bereich={ansicht === "bestellt" ? "bestellt" : "offen"} {...weiter} />;
}
