// =================================================================
//  PLANWAND ALS FENSTER IM PAD
//  Tipp auf die HOCO Nr. im Pad (Dashboard der Maschine und QS Check)
//  öffnet die Planwand als Fenster über dem Pad. Der Balken des
//  Auftrags steht in der Mitte und ist angewählt, das Auftragsfenster
//  geht aber nicht auf (Wunsch Patrick 29. Oktober 2026: „Planwand
//  soll aufgehen als Fenster, aber Balken nur angewählt, nicht
//  geöffnet“). X, Escape oder Zurück schliessen nur dieses Fenster.
//
//  Darin läuft dieselbe Seite wie im Menü (src/seiten/Planwand.jsx).
//  Das geht, weil das Pad die Seite darunter leert (padOeffnen): So
//  gibt es die Tafel nur einmal im Dokument.
// =================================================================
import { useLayoutEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import Planwand from "../seiten/Planwand.jsx";
import { padZeichnen } from "./Pad.jsx";

function Inhalt({ zu }) {
  const buehne = useRef(null);
  const [b, setB] = useState(null);
  // Die Seite braucht ihren Behälter schon beim ersten Zeichnen
  useLayoutEffect(() => { setB(buehne.current); }, []);
  return (
    <div className="dialog pad-pw">
      <div className="pad-pw__kopf">
        <h2>Planwand</h2>
        <button className="pad-pw__zu" type="button" aria-label="Schliessen" data-nein="" onClick={zu}>✕</button>
      </div>
      <div className="pad-pw__buehne" ref={buehne}>
        {b && <Planwand behaelter={b} />}
      </div>
    </div>
  );
}

export function planwandFensterOeffnen(auftrag) {
  if (!auftrag || !auftrag.id) return;
  // Wie balkenZeigen, nur ohne Seitenwechsel: zeichnePlanwand führt
  // den Balken hin, markiert ihn und lässt das Auftragsfenster zu
  alt.plan.zeigeAuftrag = auftrag.id;
  alt.plan.zeigeOhneFenster = true;
  document.body.classList.add("pad-pw-offen");
  fensterOeffnen((zu) => <Inhalt zu={zu} />, () => {
    document.body.classList.remove("pad-pw-offen");
    alt.plan.zeigeAuftrag = null;
    // Das kleine Infofenster eines Balkens hängt am Seitenende
    document.querySelectorAll(".pw-info, .pw-symbolinfo").forEach((x) => x.remove());
    // Auf der Planwand kann sich der Zustand geändert haben
    if (document.getElementById("pad")) padZeichnen();
  }, "pad-pw-huelle");
}
