// =================================================================
//  HOCO-FENSTER
//  Die HOCO Nummern als grosses Fenster über der Planwand. Der Inhalt
//  (Liste, Suche, Blätter) ist noch die alte Ansicht ansichtHoco und
//  hängt über AltTeil darin.
// =================================================================
import { alt, AltTeil } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";

export function hocoFenster(b) {
  fensterOeffnen((zu) => (
    <div className="dialog dialog--voll">
      <div className="blatt__kopf"><h2>HOCO Nr.</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>
      <AltTeil className="hoco-fenster" id="hoco-fensterinhalt" zeichne={(inhalt) => {
        inhalt.innerHTML = '<div class="laedt">Wird geladen …</div>';
        alt.ansichtHoco(inhalt, b).catch((f) => {
          inhalt.innerHTML = '<p class="hinweis">' + alt.esc(alt.fehlertext(f)) + '</p>';
        });
      }} />
    </div>
  ));
}
