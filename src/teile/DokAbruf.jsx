// =================================================================
//  WBG, ZEICHNUNG UND EINRICHTBLATT ANSEHEN
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

// art "wbg", "zeichnung" oder "einrichtblatt". Im Kopf steht „… entfernen“
// (Wunsch Patrick 8. und 9. Oktober 2026: passt die von der Aufgabe
// hochgeladene Datei nicht, nimmt man sie weg, und die Aufgabe lädt die
// nächste). Zeichnung und WBG entfernen nur Admins, das Einrichtblatt
// jeder ausser Externen (Patrick, 9. Oktober 2026: „nur Admins, egal wo,
// Zeichnungen und WBGs löschen; Einrichtblätter kann jeder löschen“):
// bei der Zeichnung mit HOCO Nr., bei der WBG mit auftragId, beim
// Einrichtblatt mit HOCO Nr. und typId (nur das eigene Blatt der
// Nummer, nicht die Vorlage vom Typ).
// neu(null) sagt dem Aufrufer, dass sie weg ist. fa nehmen die Aufrufer
// noch mit, es wird nicht mehr gebraucht.
export function dokZeigen({ art, titel, adresse, hoco, auftragId, typId, neu }) {
  const admin = !!adresse && !!(alt.istAdmin && alt.istAdmin());
  const jeder = !!adresse && !(alt.istExtern && alt.istExtern());
  const entfernen =
      art === "zeichnung" && hoco && admin ? { text: "Zeichnung entfernen", tu: () => alt.zeichnungEntfernen(hoco), weg: "Zeichnung entfernt." }
    : art === "wbg" && auftragId && admin ? { text: "WBG entfernen", tu: () => alt.wbgEntfernen(auftragId), weg: "WBG entfernt." }
    : art === "einrichtblatt" && hoco && typId && jeder ? { text: "Einrichtblatt entfernen", tu: () => alt.einrichtblattEntfernen(hoco, typId), weg: "Einrichtblatt entfernt." }
    : null;
  const name = art === "wbg" ? "Keine WBG vorhanden" : art === "einrichtblatt" ? "Kein Einrichtblatt vorhanden" : "Keine Zeichnung vorhanden";
  fensterOeffnen((zu) => adresse
    ? <Betrachter adresse={adresse} titel={titel} art={artDerDatei(adresse)} zu={zu}
        knoepfe={entfernen ? <button className="knopf knopf--klein knopf--gefahr" data-zeichnungweg={hoco || auftragId || ""} data-dokweg={art}
          onClick={async () => {
            try {
              if (!(await entfernen.tu())) return;
              alt.meldung(entfernen.weg, "gut");
              if (neu) neu(null);
              zu();
            } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
          }}>{entfernen.text}</button> : null} />
    : <Keines name={name} titel={titel} zu={zu} />, null, "betrachter-huelle");
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
        <div className="abruf-leer" data-abruf="keines"><b>{name}</b></div>
      </div>
    </div>
  );
}
