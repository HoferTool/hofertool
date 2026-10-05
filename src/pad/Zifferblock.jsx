// =================================================================
//  ZIFFERBLOCK
//  Grosse Tasten statt Handytastatur: An der Maschine wird mit
//  Handschuhen oder öligen Fingern getippt. Liefert die Zahl oder null.
//  Mit einer echten Tastatur geht es auch (Ziffern, Rücktaste, Enter).
//  Mit tage (Liste aus { wert, text }) zeigt er oben Knöpfe für den
//  Tag, dem die Zahl gehört, und liefert { zahl, tag } statt der Zahl.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";

const TASTEN = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "C", "0", "⌫"];

export function zifferblock({ titel, hinweis, wert, schritte, tage }) {
  return new Promise((fertig) => {
    let ergebnis = null;
    // Abbrechen, Escape und Tippen daneben schliessen über das Fenster;
    // das Ergebnis steht dann noch auf null
    fensterOeffnen((zu) => (
      <Zifferblock titel={titel} hinweis={hinweis} wert={wert} schritte={schritte} tage={tage}
        fertig={(zahl, tag) => { ergebnis = zahl === null || !tage ? zahl : { zahl, tag }; zu(); }} zu={zu} />
    ), () => fertig(ergebnis));
  });
}

function Zifferblock({ titel, hinweis, wert, schritte, tage, fertig, zu }) {
  const [eingabe, setEingabe] = useState(String(wert == null ? "" : wert).replace(/\D/g, ""));
  const [tag, setTag] = useState(tage && tage.length ? tage[0].wert : null);
  const tippen = (t) => setEingabe((e) => {
    if (t === "C") return "";
    if (t === "⌫") return e.slice(0, -1);
    return e.length < 9 ? (e === "0" ? "" : e) + t : e;
  });
  const eintragen = (e) => fertig(e === "" ? null : Number(e), tagRef.current);

  // Die Tastatur hört im ganzen Dokument mit; die Eingabe liegt in
  // einem Ref, damit Enter immer den aktuellen Stand nimmt
  const stand = useRef(eingabe);
  stand.current = eingabe;
  const tagRef = useRef(tag);
  tagRef.current = tag;
  useEffect(() => {
    const taste = (e) => {
      if (/^\d$/.test(e.key)) tippen(e.key);
      else if (e.key === "Backspace") tippen("⌫");
      else if (e.key === "Enter") eintragen(stand.current);
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", taste, true);
    return () => document.removeEventListener("keydown", taste, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="dialog zifferblock">
      <h2>{titel}</h2>
      {hinweis && <p className="klein">{hinweis}</p>}
      {tage && tage.length > 1 && <div className="zb-tage" role="group" aria-label="Für welchen Tag">
        {tage.map((t) => (
          <button key={t.wert} type="button" data-zbtag={t.wert} aria-pressed={tag === t.wert}
            className={tag === t.wert ? "aktiv" : undefined} onClick={() => setTag(t.wert)}>{t.text}</button>
        ))}</div>}
      <div className={"zb-anzeige" + (eingabe ? "" : " zb-anzeige--leer")} id="zb-anzeige">
        {eingabe ? alt.zahlText(Number(eingabe)) : "0"}</div>
      {schritte && schritte.length > 0 && <div className="zb-schritte">{schritte.map((n) => (
        <button key={n} type="button" data-zbplus={n}
          onClick={() => setEingabe((e) => String((Number(e) || 0) + n))}>+{alt.zahlText(n)}</button>
      ))}</div>}
      <div className="zb-tasten">{TASTEN.map((t) => (
        <button key={t} type="button" data-zb={t} className={t === "C" || t === "⌫" ? "zb-taste--neben" : undefined}
          onClick={() => tippen(t)}>{t}</button>
      ))}</div>
      <div className="zb-knoepfe">
        <button type="button" className="knopf knopf--still" data-zbnein="" data-nein="" onClick={zu}>Abbrechen</button>
        <button type="button" className="knopf knopf--haupt" data-zbja="" onClick={() => eintragen(eingabe)}>Eintragen</button>
      </div>
    </div>
  );
}
