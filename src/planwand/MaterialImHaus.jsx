// =================================================================
//  MATERIAL IM HAUS (eingeblendet über der Zeichnung im Auftragsfenster)
//  Wunsch Patrick 17. Oktober 2026: Geht ein Auftrag mit dem roten M
//  auf und liegt passendes Restmaterial im Haus, steht über der
//  Zeichnung ein GIF (Cartoon mit Kopf, der nein schüttelt, und
//  schwenkendem Mittelfinger), daneben „Hey, wir haben noch Material im
//  Haus“ und die Frage, ob man es nutzen will. Kein eigenes Fenster:
//  Man kann im Auftrag weiterarbeiten, ohne dass es stört.
//  „Ja, nutzen“ trägt es bei „Menge vorhanden oder bestellt“ ein
//  (gespeichert wird erst mit Speichern im Auftrag).
//  Das GIF steht nur in der Ablage und in app_config.pad_mahnbilder
//  (Art „material“, Einstellungen → Symbole), nicht im Repository.
// =================================================================
import { postenMengeText } from "../daten/material.js";

// Text fürs Feld „Menge vorhanden oder bestellt“
export function imHausText(treffer) {
  return treffer.map(({ posten: p }) => postenMengeText(p) + (p.ort ? " " + p.ort : "")
    + (p.platz ? ", " + p.platz : "")).join(" + ") + " (Restmaterial)";
}

export function ImHausEinblendung({ treffer, bild, nutzen, weg }) {
  return (
    <div className="imhaus" id="imhaus" role="status">
      {bild ? <img className="imhaus__gif" src={bild} alt="" />
        : <span className="imhaus__ersatz" aria-hidden="true">🤨</span>}
      <div className="imhaus__text">
        <b className="imhaus__titel">Hey, wir haben noch Material im Haus</b>
        <ul className="imhaus-liste" id="imhaus-liste">
          {treffer.map(({ posten: p, aehnlich }) => (
            <li key={p.id}>
              <b>{postenMengeText(p)}</b> · {p.ort || "ohne Ort"}{p.platz ? ", " + p.platz : ""}
              {aehnlich && <span className="imhaus-aehnlich"> · ähnlich: {p.material}</span>}
            </li>
          ))}
        </ul>
        <span className="imhaus__frage">Wollt ihr es nutzen?</span>
        <div className="imhaus__knoepfe">
          {nutzen && <button type="button" className="knopf knopf--klein knopf--haupt" id="imhaus-ja"
            onClick={() => { nutzen(imHausText(treffer)); weg(); }}>Ja, nutzen</button>}
          <button type="button" className="knopf knopf--klein" id="imhaus-nein" onClick={weg}>
            {nutzen ? "Nein" : "Alles klar"}</button>
        </div>
      </div>
    </div>
  );
}
