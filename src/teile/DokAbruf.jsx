// =================================================================
//  WBG UND ZEICHNUNG ANSEHEN
//
//  Die Aufgabe „HoferTool“ auf dem Pool-Rechner lädt alle fünf Minuten
//  neue oder geänderte WBGs und Zeichnungen hoch (Wunsch Patrick
//  8. Oktober 2026, statt Abruf beim Öffnen). Die App zeigt darum
//  einfach, was da ist, und sonst „Keine WBG vorhanden“ in einem
//  Fenster statt einer Meldung unten rechts.
// =================================================================
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { Betrachter } from "./Betrachter.jsx";
import { istExcel } from "./excelLesen.js";

const istBild = (a) => /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(String(a || ""));
const artDerDatei = (a) => (istExcel(a) ? "excel" : istBild(a) ? "bild" : "pdf");

// art "wbg" oder "zeichnung". Bei einer Zeichnung mit HOCO Nr. steht im
// Kopf „Zeichnung entfernen“ (Wunsch Patrick 8. Oktober 2026: passt die
// von der Aufgabe hochgeladene Zeichnung nicht, löscht er sie, und die
// Aufgabe lädt die nächste Datei hoch); neu(null) sagt dem Aufrufer, dass
// sie weg ist. auftragId und fa nehmen die Aufrufer noch mit, sie
// werden nicht mehr gebraucht.
export function dokZeigen({ art, titel, adresse, hoco, neu }) {
  const entfernbar = art === "zeichnung" && !!hoco && !!adresse && alt.darfSchreiben && alt.darfSchreiben();
  fensterOeffnen((zu) => adresse
    ? <Betrachter adresse={adresse} titel={titel} art={artDerDatei(adresse)} zu={zu}
        knoepfe={entfernbar ? <button className="knopf knopf--klein knopf--gefahr" data-zeichnungweg={hoco}
          onClick={async () => {
            try {
              if (!(await alt.zeichnungEntfernen(hoco))) return;
              alt.meldung("Zeichnung entfernt.", "gut");
              if (neu) neu(null);
              zu();
            } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
          }}>Zeichnung entfernen</button> : null} />
    : <Keines name={art === "wbg" ? "WBG" : "Zeichnung"} titel={titel} zu={zu} />, null, "betrachter-huelle");
}

function Keines({ name, titel, zu }) {
  return (
    <div className="betrachter">
      <div className="betrachter__kopf">
        <span className="betrachter__titel">{titel || ""}</span>
        <div className="betrachter__knoepfe">
          <button className="knopf knopf--klein" data-zu="" onClick={zu}>Schliessen</button>
        </div>
      </div>
      <div className="betrachter__buehne">
        <div className="abruf-leer" data-abruf="keines"><b>Keine {name} vorhanden</b></div>
      </div>
    </div>
  );
}
