// =================================================================
//  HOCO-FENSTER
//  Die HOCO Nummern (src/hoco/) als grosses Fenster über der Planwand.
// =================================================================
import Hoco from "../hoco/Hoco.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";

export function hocoFenster() {
  fensterOeffnen((zu) => (
    <div className="dialog dialog--voll">
      <div className="blatt__kopf"><h2>HOCO Nr.</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>
      <div className="hoco-fenster" id="hoco-fensterinhalt"><Hoco /></div>
    </div>
  ));
}
