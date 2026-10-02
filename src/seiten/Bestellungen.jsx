// =================================================================
//  BESTELLUNGEN
//  Die Hülle der Seite (Titel, Reiter, Hinweis) ist in React. Die
//  Reiter selbst laufen noch im alten Programm und werden nach und
//  nach umgebaut.
//
//  Das alte Programm ruft nach jeder Änderung seiteBestellungen(b)
//  auf. Das kommt hier als „auffrischen“ an und zeichnet den Reiter
//  neu, ohne die Hülle neu aufzubauen.
// =================================================================
import { useReducer } from "react";
import { alt, AltTeil } from "../bruecke.jsx";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";

const REITER = [
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
      <Reiter reiter={REITER} aktiv={best.ansicht} waehlen={waehlen} merkmal="best" />
      {!alt.darfSchreiben() &&
        <div className="nurlesen">Du kannst hier alles ansehen, aber nichts ändern.</div>}
      <Uebergang key={best.ansicht}>
        <AltTeil key={auffrischen} id="best-inhalt"
          zeichne={(el) => {
            el.innerHTML = '<div class="laedt">Wird geladen …</div>';
            alt.bestReiterZeichnen(el, behaelter);
          }} />
      </Uebergang>
    </>
  );
}
