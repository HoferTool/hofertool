// =================================================================
//  DIALOGE
//  Ersetzen die Browser-Abfragen durch eigene Fenster. Gleiche
//  Aufrufe wie bisher, jetzt in React:
//    nachfragen({ titel, text, bestaetigen, abbrechen, gefahr })
//      → true oder false
//    auswahlDialog(titel, [{ wert, text }]) → wert oder null
//    dialogFelder({ titel, text, felder, bestaetigen, gefahr })
//      felder: [{ name, label, typ, wert, platzhalter, pflicht,
//                 hinweis, auswahl: [[wert, text]], ziffern, fett }]
//      fett: true gibt einem Textfeld den Knopf „Fett“ und eine Vorschau
//      → Objekt mit den Werten oder null bei Abbruch
//    neueFarbeDialog(farben) → { farbe, material, kuerzel } oder null
// =================================================================
import { useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { FettText, fettUmschalten } from "./FettText.jsx";

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

export function auswahlDialog(titel, optionen) {
  return fensterMitWert(null, (fertig) => (
    <div className="dialog"><h2>{titel}</h2>
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

// Textfeld mit Fett-Knopf. Der Knopf reagiert schon beim Antippen
// (pointerdown) und verhindert dort das Wegnehmen des Fokus, sonst
// geht auf dem Tablet die Markierung verloren, bevor er sie liest.
function FettFeld({ f, id, erstes }) {
  const [text, setText] = useState(f.wert || "");
  const fett = (e) => {
    e.preventDefault();
    const feld = document.getElementById(id);
    if (feld && !fettUmschalten(feld)) alt.meldung("Erst ein Wort antippen oder markieren.", "warn");
  };
  return (
    <div className="feld feld--fett"><label htmlFor={id}>{f.label}</label>
      <div className="fettleiste">
        <button type="button" className="knopf fettknopf" data-fett="" aria-label="Fett"
          onPointerDown={fett} onClick={(e) => { if (e.detail === 0) fett(e); }}><b>B</b> Fett</button>
        <span className="feldhinweis">Wort antippen oder markieren, dann „Fett“.</span>
      </div>
      <textarea id={id} rows={6} placeholder={f.platzhalter || ""} defaultValue={f.wert || ""}
        onInput={(e) => setText(e.target.value)} data-fokus={erstes ? "" : undefined} />
      {/\*\*/.test(text) &&
        <div className="fettvorschau" data-fettvorschau=""><span className="feldhinweis">So sieht es aus:</span>
          <p><FettText text={text} /></p></div>}
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
        const wert = ((el && el.value) || "").trim();
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

// Neue Materialfarbe: Es gibt keinen freien Farbwähler, nur die
// Palette der App (Wunsch 5. Oktober 2026). Angeboten werden die
// Palettenfarben, die noch kein Material haben.
function NeueFarbe({ farben, fertig }) {
  const [farbe, setFarbe] = useState(null);
  const [material, setMaterial] = useState("");
  const [kuerzel, setKuerzel] = useState("");
  const absenden = (e) => {
    if (e) e.preventDefault();
    if (!farbe) { alt.meldung("Bitte eine Farbe wählen.", "warn"); return; }
    if (!material.trim()) { alt.meldung("Material wird benötigt.", "warn"); return; }
    fertig({ farbe, material: material.trim(), kuerzel: kuerzel.trim() });
  };
  const gewaehlt = farben.find((f) => f.wert === farbe);
  return (
    <div className="dialog" role="dialog" aria-modal="true">
      <h2>Neue Farbe</h2>
      <p>Farbe aus der Palette wählen und das Material dazu eintragen. Sie steht danach in jedem Auftrag zur Wahl.</p>
      <form onSubmit={absenden}>
        <div className="feld"><span className="feldlabel">Farbe{gewaehlt ? ": " + gewaehlt.name : ""}</span>
          <div className="farbwahl farbwahl--neu">
            {farben.map((f) => (
              <button key={f.wert} type="button" data-neufarbe={f.wert} title={f.name}
                aria-label={f.name} aria-pressed={farbe === f.wert}
                className={"farbknopf" + (farbe === f.wert ? " aktiv" : "")}
                style={{ background: f.hex, color: f.schrift }}
                onClick={() => setFarbe(f.wert)} />
            ))}
          </div></div>
        <div className="auf-zweier">
          <label className="feld"><span>Material</span>
            <input id="neufarbe-material" type="text" value={material} placeholder="z. B. Titan"
              data-fokus="" onChange={(e) => setMaterial(e.target.value)} /></label>
          <label className="feld"><span>Kürzel</span>
            <input id="neufarbe-kuerzel" type="text" value={kuerzel} placeholder="z. B. T"
              onChange={(e) => setKuerzel(e.target.value)} /></label>
        </div>
      </form>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" data-nein="" onClick={() => fertig(null)}>Abbrechen</button>
        <button className="knopf knopf--haupt" data-ja="" onClick={() => absenden()}>Farbe anlegen</button>
      </div>
    </div>
  );
}

export function neueFarbeDialog(farben) {
  return fensterMitWert(null, (fertig) => <NeueFarbe farben={farben} fertig={fertig} />);
}
