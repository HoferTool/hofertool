// =================================================================
//  TEXT FÜR BESTELLMAILS
//  Eigenes Fenster statt eines Textfelds mitten in den Einstellungen
//  (Wunsch Patrick, 7. Oktober 2026: „soll nicht gleich anzeigen, ein
//  Button Text bearbeiten, dann soll ein Fenster aufgehen und es mit
//  allem anzeigen, auch Bilder mit Hyperlink“).
//
//  Das Fenster zeigt die Mail so, wie sie beim Lieferanten ankommt:
//  dieselbe HTML-Mail wie beim Bestellen (bestellmailHtml), mit den
//  beiden Logos samt Link. „Bearbeiten“ stellt Textfeld und Vorschau
//  nebeneinander, die Vorschau folgt beim Tippen. Gespeichert wird wie
//  bisher als schlichter Text in app_config.bestellmail_text.
// =================================================================
import { useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";

const PLATZHALTER = [["{datum}", "Datum"], ["{name}", "Mein Name"], ["{lieferant}", "Lieferant"]];
// In der Vorschau steht statt {lieferant} ein Beispiel, damit man sieht, wo er hinkommt
const BEISPIEL_LIEFERANT = "Muster AG";

export function bestellmailOeffnen() {
  fensterOeffnen((zu) => <BestellmailFenster zu={zu} />);
}

function Vorschau({ text }) {
  const { html, betreff } = alt.bestellmailVorschau(text, BEISPIEL_LIEFERANT);
  // Die Höhe passt sich dem Inhalt an, damit nur das Fenster rollt
  const anpassen = (e) => {
    try {
      const d = e.currentTarget.contentDocument;
      // Am Inhalt messen, nicht am Rahmen: sonst wird er nie wieder kleiner
      if (d && d.body) e.currentTarget.style.height = Math.ceil(d.body.getBoundingClientRect().height + 2) + "px";
    } catch (f) { /* bleibt bei der festen Höhe */ }
  };
  return (
    <div className="bm-mail">
      <div className="bm-kopf">
        <div><span>An</span>E-Mail-Adresse des Lieferanten</div>
        <div><span>Betreff</span>{betreff}</div>
        <div><span>Anhang</span>Bestellung als PDF</div>
      </div>
      <iframe className="bm-blatt" id="bestellmail-vorschau" title="Vorschau der Bestellmail"
        srcDoc={html} onLoad={anpassen} />
    </div>
  );
}

function BestellmailFenster({ zu }) {
  const [gespeichert, setGespeichert] = useState(alt.bestellmailText());
  const [text, setText] = useState(gespeichert);
  const [bearbeiten, setBearbeiten] = useState(false);
  const feld = useRef(null);

  const speichern = async () => {
    const wert = text.trim();
    const { error } = await alt.db.from("app_config")
      .upsert({ schluessel: "bestellmail_text", wert: wert || alt.BESTELLMAIL_VORGABE });
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.bestellmailSetzen(wert);
    const neu = alt.bestellmailText();
    setGespeichert(neu); setText(neu); setBearbeiten(false);
    alt.meldung("Text gespeichert.");
  };
  const abbrechen = () => { setText(gespeichert); setBearbeiten(false); };

  // Platzhalter dort einsetzen, wo die Schreibmarke steht
  const einsetzen = (p) => {
    const f = feld.current;
    const a = f ? f.selectionStart : text.length, b = f ? f.selectionEnd : text.length;
    setText(text.slice(0, a) + p + text.slice(b));
    requestAnimationFrame(() => { if (f) { f.focus(); f.setSelectionRange(a + p.length, a + p.length); } });
  };

  return (
    <div className={"dialog dialog--bestellmail" + (bearbeiten ? " bm--bearbeiten" : "")}>
      <h2>Text für Bestellmails</h2>
      <div className="bm-inhalt">
        {bearbeiten && (
          <div className="bm-schreiben">
            <textarea id="bestellmail-feld" ref={feld} aria-label="Text für Bestellmails" data-fokus=""
              value={text} onChange={(e) => setText(e.target.value)} />
            <div className="bm-platzhalter">
              <span>Wird beim Bestellen ersetzt:</span>
              {PLATZHALTER.map(([p, wort]) => (
                <button key={p} type="button" className="bm-chip" data-platzhalter={p}
                  title={wort + " einsetzen"} onClick={() => einsetzen(p)}>{p}</button>
              ))}
            </div>
            <button type="button" className="linkknopf" id="bestellmail-vorgabe"
              onClick={() => setText(alt.BESTELLMAIL_VORGABE)}>Vorgabe wiederherstellen</button>
          </div>
        )}
        <Vorschau text={text} />
      </div>
      <p className="bm-hinweis">
        Beispiel mit heutigem Datum, deinem Namen und „{BEISPIEL_LIEFERANT}“. Die Logos führen auf hoferco.ch und salt-pepper.ch.
      </p>
      <div className="dialog__knoepfe">
        {bearbeiten ? <>
          <button className="knopf knopf--still" id="bestellmail-abbrechen" onClick={abbrechen}>Abbrechen</button>
          <button className="knopf knopf--haupt" id="bestellmail-speichern" onClick={speichern}>Speichern</button>
        </> : <>
          <button className="knopf knopf--still" data-nein="" onClick={zu}>Schliessen</button>
          <button className="knopf knopf--haupt" id="bestellmail-bearbeiten" data-fokus=""
            onClick={() => { setBearbeiten(true); requestAnimationFrame(() => feld.current && feld.current.focus()); }}>Bearbeiten</button>
        </>}
      </div>
    </div>
  );
}
