// =================================================================
//  DIALOGE
//  Ersetzen die Browser-Abfragen durch eigene Fenster. Gleiche
//  Aufrufe wie bisher, jetzt in React:
//    nachfragen({ titel, text, bestaetigen, abbrechen, gefahr })
//      → true oder false
//    auswahlDialog(titel, [{ wert, text }], text?) → wert oder null
//    dialogFelder({ titel, text, felder, bestaetigen, gefahr })
//      felder: [{ name, label, typ, wert, platzhalter, pflicht,
//                 hinweis, auswahl: [[wert, text]], ziffern, fett }]
//      fett: true gibt einem Textfeld die Knöpfe Fett, Kursiv, Unterstrichen,
//      durch: true dazu Durchgestrichen
//      → Objekt mit den Werten oder null bei Abbruch
// =================================================================
import { useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { TextMitStil, stilWert } from "./FettText.jsx";

// Öffnet ein Fenster, das mit einem Wert endet. Schliessen über
// Escape, Zurück oder daneben klicken ergibt den Abbruchwert.
function fensterMitWert(abbruch, zeichne) {
  return new Promise((fertig) => {
    let erledigt = false;
    const ende = (wert) => { if (!erledigt) { erledigt = true; fertig(wert); } };
    let zu = null;
    zu = fensterOeffnen(() => zeichne((wert) => { ende(wert); zu(); }), () => ende(abbruch));
  });
}

const knopfArt = (gefahr) => "knopf " + (gefahr ? "knopf--gefahr" : "knopf--haupt");

export function nachfragen(o) {
  return fensterMitWert(false, (fertig) => (
    <div className="dialog" role="dialog" aria-modal="true">
      <h2>{o.titel}</h2><p>{o.text}</p>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" data-nein="" onClick={() => fertig(false)}>
          {o.abbrechen || "Abbrechen"}</button>
        <button className={knopfArt(o.gefahr)} data-ja="" data-fokus="" onClick={() => fertig(true)}>
          {o.bestaetigen || "Ja, ausführen"}</button>
      </div>
    </div>
  ));
}

export function auswahlDialog(titel, optionen, text) {
  return fensterMitWert(null, (fertig) => (
    <div className="dialog"><h2>{titel}</h2>
      {text && <p className="dialog__text">{text}</p>}
      <div className="statuswahl">
        {optionen.map((o) => (
          <button key={o.wert} className="knopf" data-w={o.wert} onClick={() => fertig(String(o.wert))}>
            {o.text}</button>
        ))}
      </div>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" data-nein="" onClick={() => fertig(null)}>Abbrechen</button>
      </div>
    </div>
  ));
}

// Eigene Nummer je Dialog, damit sich zwei offene Fenster niemals
// dieselben Kennungen teilen
let dialogZaehler = 0;

function Feld({ f, id, erstes }) {
  const leer = (x) => (x === null || x === undefined ? "" : x);
  const hinweis = f.hinweis && <span className="feldhinweis">{f.hinweis}</span>;
  if (f.auswahl) {
    return (
      <label className="feld"><span>{f.label}</span>
        <select id={id} defaultValue={String(leer(f.wert))}>
          {f.auswahl.map(([wert, text]) => <option key={wert} value={wert}>{text}</option>)}
        </select>{hinweis}</label>
    );
  }
  if (f.typ === "textarea" && f.fett) return <FettFeld f={f} id={id} erstes={erstes} />;
  if (f.typ === "textarea") {
    return (
      <label className="feld"><span>{f.label}</span>
        <textarea id={id} rows={3} placeholder={f.platzhalter || ""} defaultValue={f.wert || ""}
          data-fokus={erstes ? "" : undefined} />{hinweis}</label>
    );
  }
  const zahl = f.typ === "number";
  return (
    <label className="feld"><span>{f.label}</span>
      <input id={id} type={f.typ || "text"} defaultValue={leer(f.wert)} placeholder={f.platzhalter || ""}
        inputMode={zahl || f.ziffern ? "numeric" : undefined}
        min={zahl ? 0 : undefined} step={zahl ? 1 : undefined}
        pattern={f.ziffern ? "[0-9]*" : undefined} autoComplete={f.ziffern ? "off" : undefined}
        data-fokus={erstes ? "" : undefined} />{hinweis}</label>
  );
}

// Textfeld mit Knöpfen für Fett, Kursiv und Unterstrichen
function FettFeld({ f, id, erstes }) {
  return (
    <div className="feld feld--fett"><span>{f.label}</span>
      <TextMitStil id={id} wert={f.wert} platzhalter={f.platzhalter} erstes={erstes}
        durch={!!f.durch} />
      {f.hinweis && <span className="feldhinweis">{f.hinweis}</span>}
    </div>
  );
}

export function dialogFelder(o) {
  const nr = "d" + (++dialogZaehler) + "-";
  const felder = o.felder || [];
  // Das erste Eingabefeld bekommt den Fokus (keine Auswahlliste)
  const erstesFeld = felder.find((f) => !f.auswahl);

  return fensterMitWert(null, (fertig) => {
    const absenden = (e) => {
      if (e) e.preventDefault();
      const ergebnis = {};
      for (const f of felder) {
        const el = document.getElementById(nr + f.name);
        const wert = el && el.dataset.stilfeld !== undefined ? stilWert(el)
          : ((el && el.value) || "").trim();
        if (f.pflicht && !wert) {
          el.focus();
          el.classList.add("menge--fehler");
          alt.meldung(f.label + " wird benötigt.", "warn");
          return;
        }
        ergebnis[f.name] = f.typ === "number" ? (wert === "" ? 0 : Number(wert)) : wert;
      }
      fertig(ergebnis);
    };
    return (
      <div className="dialog" role="dialog" aria-modal="true">
        <h2>{o.titel}</h2>
        {o.text && <p>{o.text}</p>}
        <form onSubmit={absenden}>
          {felder.map((f) => <Feld key={f.name} f={f} id={nr + f.name} erstes={f === erstesFeld} />)}
        </form>
        <div className="dialog__knoepfe">
          <button className="knopf knopf--still" data-nein="" onClick={() => fertig(null)}>Abbrechen</button>
          <button className={knopfArt(o.gefahr)} data-ja="" onClick={() => absenden()}>
            {o.bestaetigen || "Speichern"}</button>
        </div>
      </div>
    );
  });
}

