// =================================================================
//  SEITE LEHRLINGE (1.148.0, Wunsch Patrick 22. Oktober 2026)
//  Eine KI für Polymechaniker und Produktionsmechaniker in Ausbildung:
//  Grundausbildung, CNC mit G- und M-Code (Star mit Fanuc und andere),
//  Werkstofftechnik, Mathematik, Zeichnungstechnik, Maschinentechnik,
//  Schule. Sie ersetzt keinen Ausbildner, sie hilft, wenn gerade niemand
//  da ist; das steht gut sichtbar oben. Fotos (Zeichnung, Aufgabe,
//  Werkstück) gehen mit. Nicht für Externe und Dienst (seiteSichtbar).
//  Daten und Darstellung in src/daten/lehrlinge.js.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { gespraechLaden, gespraechMerken, bildVorbereiten, kiFragen, antwortHtml } from "../daten/lehrlinge.js";

const THEMEN = [
  { titel: "Grundausbildung", frage: "Worauf muss ich beim Reiben einer Bohrung H7 achten? Welches Vorbohrmass nehme ich bei Ø 8 H7?" },
  { titel: "Gewinde", frage: "Wie gross muss das Kernloch für ein Gewinde M6 sein, und warum?" },
  { titel: "Drehen und Fräsen", frage: "Wie berechne ich die Drehzahl für Ø 20 mm in V2A mit einer Schnittgeschwindigkeit von 120 m/min?" },
  { titel: "CNC und G-Code", frage: "Erkläre mir den Unterschied zwischen G00, G01, G02 und G03 an einem kurzen Fanuc-Beispiel." },
  { titel: "Star Langdreher", frage: "Wie funktionieren Führungsbuchse, Haupt- und Gegenspindel auf einem Star-Langdreher?" },
  { titel: "M-Codes", frage: "Welche M-Codes brauche ich am häufigsten auf einer Fanuc-Drehmaschine und was machen sie?" },
  { titel: "Werkstofftechnik", frage: "Was ist der Unterschied zwischen 1.4305 und 1.4404, und wie zerspanen sie sich?" },
  { titel: "Mathematik", frage: "Wie rechne ich mit dem Sinus einen Fasenwinkel aus? Bitte Schritt für Schritt." },
  { titel: "Zeichnungstechnik", frage: "Was bedeutet die Passung 10 H7/g6 und wie lese ich die Abmasse ab?" },
  { titel: "Maschinentechnik", frage: "Wie ist ein Kugelgewindetrieb aufgebaut und warum braucht man ihn an CNC-Maschinen?" },
  { titel: "Schule und QV", frage: "Wie bereite ich mich am besten auf das Qualifikationsverfahren vor?" },
];

export default function Lehrlinge() {
  const [liste, setListe] = useState(gespraechLaden);
  const [text, setText] = useState("");
  const [bild, setBild] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState("");
  const unten = useRef(null), feld = useRef(null), wahl = useRef(null), abbruch = useRef(null);

  useEffect(() => { gespraechMerken(liste); }, [liste]);
  useEffect(() => { unten.current && unten.current.scrollIntoView({ block: "end", behavior: "smooth" }); },
    [liste.length, laeuft]);
  // Beim Verlassen der Seite eine laufende Antwort abbrechen
  useEffect(() => () => abbruch.current && abbruch.current.abort(), []);

  async function senden(vorgabe) {
    const frage = (vorgabe != null ? vorgabe : text).trim();
    if ((!frage && !bild) || laeuft) return;
    setFehler("");
    const neu = [...liste, { rolle: "ich", text: frage, bild: bild || undefined }];
    setListe([...neu, { rolle: "ki", text: "" }]);
    setText(""); setBild(null);
    setLaeuft(true);
    const ab = new AbortController();
    abbruch.current = ab;
    let antwort = "";
    try {
      await kiFragen(neu, (stueck) => {
        antwort += stueck;
        setListe([...neu, { rolle: "ki", text: antwort }]);
      }, ab.signal);
    } catch (e) {
      if (e.name !== "AbortError") {
        setFehler(e.message || String(e));
        if (!antwort) setListe(neu.map((n, i) => i === neu.length - 1 ? { ...n, fehlgeschlagen: true } : n));
      }
    } finally {
      if (ab.signal.aborted && antwort) setListe([...neu, { rolle: "ki", text: antwort + "\n\n… (abgebrochen)" }]);
      else if (ab.signal.aborted) setListe(neu);
      setLaeuft(false);
      abbruch.current = null;
      feld.current && feld.current.focus();
    }
  }

  async function fotoGewaehlt(e) {
    const datei = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!datei) return;
    try { setBild(await bildVorbereiten(datei)); }
    catch (f) { alt.meldung("Bild nicht lesbar", "fehler"); }
  }

  async function neuesGespraech() {
    if (!liste.length) return;
    const ok = await alt.nachfragen({ titel: "Neues Gespräch", text: "Das bisherige Gespräch wird gelöscht.",
      bestaetigen: "Neu beginnen", gefahr: true });
    if (ok) { setListe([]); setFehler(""); }
  }

  return (
    <div className="lehr">
      <div className="lehr__kopf">
        <h1 className="seitentitel">Lehrlinge</h1>
        {liste.length > 0 && <button className="knopf" onClick={neuesGespraech} disabled={laeuft}>Neues Gespräch</button>}
      </div>
      <div className="lehr__hinweis">
        <b>KI-Lernhilfe für Polymechaniker und Produktionsmechaniker.</b> Sie ersetzt deinen Ausbildner nicht,
        sie hilft dir, wenn gerade niemand da ist. Sie kann sich irren: Prüfe wichtige Werte und frag bei
        Sicherheit, Programmen für die Maschine und Unklarem immer zuerst deinen Ausbildner.
      </div>

      <div className="lehr__verlauf">
        {!liste.length && (
          <div className="lehr__leer">
            <p>Stell eine Frage zur Ausbildung, zur Schule oder zur CNC. Du kannst auch ein Foto von einer
              Aufgabe oder Zeichnung mitschicken. Zum Beispiel:</p>
            <div className="lehr__themen">
              {THEMEN.map((t) => (
                <button key={t.titel} className="lehr__thema" onClick={() => senden(t.frage)}>
                  <b>{t.titel}</b><span>{t.frage}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {liste.map((n, i) => n.rolle === "ich" ? (
          <div key={i} className={"lehr__ich" + (n.fehlgeschlagen ? " lehr__ich--fehler" : "")}>
            {n.bild && <img src={n.bild.vorschau} alt="" className="lehr__bild" />}
            {!n.bild && n.hatteBild && <div className="lehr__bildweg">(Foto)</div>}
            {n.text}
          </div>
        ) : (
          <div key={i} className="lehr__ki">
            {n.text
              ? <div className="lehr__text" dangerouslySetInnerHTML={{ __html: antwortHtml(n.text) }} />
              : <div className="lehr__denkt"><i /><i /><i /></div>}
          </div>
        ))}
        {fehler && <div className="lehr__fehler">{fehler}</div>}
        <div ref={unten} />
      </div>

      <div className="lehr__eingabe">
        {bild && (
          <div className="lehr__anhang">
            <img src={bild.vorschau} alt="" />
            <button className="knopf" onClick={() => setBild(null)}>Foto weg</button>
          </div>
        )}
        <div className="lehr__zeile">
          <button className="knopf lehr__foto" title="Foto mitschicken" onClick={() => wahl.current.click()} disabled={laeuft}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
              <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13.2" r="3.4" /></svg>
          </button>
          <input ref={wahl} type="file" accept="image/*" hidden onChange={fotoGewaehlt} />
          <textarea ref={feld} className="lehr__feld" rows={2} value={text} placeholder="Deine Frage … (Shift + Enter für neue Zeile)"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); senden(); } }} />
          {laeuft
            ? <button className="knopf" onClick={() => abbruch.current && abbruch.current.abort()}>Stopp</button>
            : <button className="knopf knopf--haupt" onClick={() => senden()} disabled={!text.trim() && !bild}>Fragen</button>}
        </div>
      </div>
    </div>
  );
}
