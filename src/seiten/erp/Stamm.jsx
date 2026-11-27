// Test ERP: gemeinsamer Aufbau der Fenster wie im Gewatec, im Stil des
// HoferTools (Wunsch Patrick 21. November 2026: „kannst du alles eher so
// bauen, aber moderner mit HoferTool-Stil“): oben ein Kopf mit den
// wichtigsten Feldern (rechts wahlweise ein Bild), darunter Reiter, unten
// eine Knopfleiste. Felder haben die Beschriftung links wie im Gewatec.
// Blau unterstrichene Beschriftungen öffnen mit Rechtsklick (am iPad mit
// langem Drücken, auch mit Antippen) ein Menü mit passenden Sprüngen
// (Patrick: „alles was blau und unterstrichen ist, kann ich mit rechts
// klicken und es zeigt dann logische Schnittstellen“).
import { createContext, useContext, useRef, useState, useEffect } from "react";
import { speichernFragen } from "../../teile/Dialoge.jsx";
import { useSortierung, sortiert } from "../../teile/sortieren.js";
import { SortKopf, sortText } from "./teile.jsx";

const MenueKontext = createContext(null);

// Fenster: titel, kopf (Felder oben), bild (rechts im Kopf), reiter [[wert, text]],
// aktiv/setAktiv, fuss (Knöpfe), zu, daten (data-Attribute)
export function GFenster({ titel, kopf, bild, reiter, aktiv, setAktiv, fuss, zu, children, klasse, attr, zuText }) {
  const ref = useRef(null);
  const [menue, setMenue] = useState(null);
  const oeffnen = (e, eintraege) => {
    if (!eintraege || !eintraege.length) return;
    e.preventDefault();
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX ?? r.left) - r.left, y = (e.clientY ?? r.top) - r.top;
    setMenue({ x: Math.min(x, r.width - 240), y, eintraege });
  };
  useEffect(() => {
    if (!menue) return;
    const weg = (e) => { if (!e.target.closest || !e.target.closest(".gf-menue")) setMenue(null); };
    const taste = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMenue(null); } };
    document.addEventListener("pointerdown", weg, true);
    document.addEventListener("keydown", taste, true);
    return () => { document.removeEventListener("pointerdown", weg, true); document.removeEventListener("keydown", taste, true); };
  }, [menue]);
  return (
    <MenueKontext.Provider value={oeffnen}>
      <div ref={ref} className={"dialog erp-fenster erp-fenster--gross gf" + (klasse ? " " + klasse : "")} role="dialog" {...(attr || {})}>
        <div className="gf-titel">
          <h2>{titel}</h2>
          <button className="knopf knopf--still gf-zu" onClick={zu} aria-label="Schliessen" title={zuText || "Schliessen"}>✕</button>
        </div>
        {kopf && <div className={"gf-kopf" + (bild ? " gf-kopf--bild" : "")}>
          <div className="gf-kopf__felder">{kopf}</div>
          {bild && <div className="gf-kopf__bild">{bild}</div>}
        </div>}
        {reiter && <div className="reiter gf-reiter">
          {reiter.filter(Boolean).map(([w, t]) => <button key={w} type="button" className={"reiter__knopf" + (aktiv === w ? " aktiv" : "")}
            data-gf-reiter={w} onClick={() => setAktiv(w)}>{t}</button>)}
        </div>}
        <div className="gf-inhalt">{children}</div>
        {fuss && <div className="gf-fuss">{fuss}</div>}
        {menue && <div className="gf-menue" style={{ left: menue.x, top: menue.y }} role="menu">
          {menue.eintraege.filter(Boolean).map(([t, fn], i) => <button key={i} type="button" role="menuitem" data-gf-menue={t}
            onClick={() => { setMenue(null); fn(); }}>{t}</button>)}
        </div>}
      </div>
    </MenueKontext.Provider>
  );
}

// Beschriftung mit Sprüngen: blau unterstrichen, Rechtsklick / langes Drücken / Antippen
export function Verweis({ text, menue, children }) {
  const oeffnen = useContext(MenueKontext);
  const uhr = useRef(null);
  const aktiv = menue && menue.filter(Boolean).length && oeffnen;
  if (!aktiv) return <span className="gf-l">{text}{children}</span>;
  return (
    <span className="gf-l gf-l--link" tabIndex={0} data-gf-verweis={text}
      onContextMenu={(e) => oeffnen(e, menue)}
      onClick={(e) => oeffnen(e, menue)}
      onKeyDown={(e) => { if (e.key === "Enter") { const r = e.currentTarget.getBoundingClientRect(); oeffnen({ preventDefault() {}, clientX: r.left, clientY: r.bottom }, menue); } }}
      onPointerDown={(e) => {
        if (e.pointerType !== "touch") return;
        const x = e.clientX, y = e.clientY;
        uhr.current = setTimeout(() => oeffnen({ preventDefault() {}, clientX: x, clientY: y }, menue), 550);
      }}
      onPointerUp={() => clearTimeout(uhr.current)} onPointerLeave={() => clearTimeout(uhr.current)}>{text}{children}</span>
  );
}

// Feld mit Beschriftung links. typ: text|zahl|datum|textarea|haken; auswahl [[w, t]];
// nurLesen zeigt den Wert als graues Feld; rechts: Wert rechtsbündig
export function KF({ label, wert, setzen, typ, auswahl, menue, nurLesen, breit, name, platzhalter, rechts, zeilen, liste, klasse }) {
  const v = wert ?? "";
  let eingabe;
  if (typ === "haken") {
    return <label className={"gf-f gf-f--haken" + (klasse ? " " + klasse : "")}>
      <input type="checkbox" checked={!!wert} disabled={nurLesen} data-erp-feld={name} onChange={(e) => setzen(e.target.checked)} />
      {menue ? <Verweis text={label} menue={menue} /> : <span className="gf-l">{label}</span>}</label>;
  }
  if (nurLesen || !setzen) {
    const anzeige = auswahl ? ((auswahl.find(([w]) => String(w) === String(v)) || [])[1] ?? v) : v;
    eingabe = <div className={"gf-wert" + (rechts ? " gf-wert--rechts" : "") + (typ === "textarea" ? " gf-wert--lang" : "")} data-erp-wert={name}>{anzeige}</div>;
  } else if (auswahl) {
    eingabe = <select value={String(v)} data-erp-feld={name} onChange={(e) => setzen(e.target.value)}>
      {auswahl.map(([w, t]) => <option key={w} value={w}>{t}</option>)}</select>;
  } else if (typ === "textarea") {
    eingabe = <textarea rows={zeilen || 4} value={v} data-erp-feld={name} placeholder={platzhalter || ""} onChange={(e) => setzen(e.target.value)} />;
  } else {
    eingabe = <input type={typ === "datum" ? "date" : "text"} value={v} data-erp-feld={name} placeholder={platzhalter || ""} list={liste}
      inputMode={typ === "zahl" ? "decimal" : undefined} className={rechts ? "gf-rechts" : ""} onChange={(e) => setzen(e.target.value)} />;
  }
  return (
    <label className={"gf-f" + (breit ? " gf-f--breit" : "") + (typ === "textarea" ? " gf-f--lang" : "") + (klasse ? " " + klasse : "")}>
      {menue ? <Verweis text={label} menue={menue} /> : <span className="gf-l">{label}</span>}
      {eingabe}
    </label>
  );
}

// Gruppe mit Rahmen und Titel wie „Hausanschrift“ oder „Workflow“
export function Gruppe({ titel, children, klasse }) {
  return <fieldset className={"gf-gruppe" + (klasse ? " " + klasse : "")}>{titel && <legend>{titel}</legend>}{children}</fieldset>;
}

// Kleine Tabelle in einem Reiter, Zeilen anwählbar
// Spaltenkopf antippen sortiert (seit 1.897.0)
export function GTabelle({ kopf, zeilen, leer, wahl, setWahl, rechts }) {
  const [sort, sortKlick] = useSortierung();
  const reihe = sortiert(zeilen, sort, sortText);
  return (
    <div className="gf-tab-huelle">
      <table className="gf-tab">
        <thead><tr>{kopf.map((k, i) => <SortKopf key={i} k={k} i={i} sort={sort} klick={sortKlick} className={rechts && rechts.includes(i) ? "rechts" : ""} />)}</tr></thead>
        <tbody>
          {!zeilen.length && <tr><td colSpan={kopf.length} className="gf-tab__leer">{leer || "Keine Einträge."}</td></tr>}
          {reihe.map((z) => (
            <tr key={z.key} className={(wahl === z.key ? "gewaehlt " : "") + (z.klasse || "") + (z.klick || setWahl ? " erp-klick" : "")}
              data-erp-zeile={z.key}
              onClick={() => { if (setWahl) setWahl(z.key); if (z.klick && !setWahl) z.klick(); }}
              onDoubleClick={z.klick && setWahl ? z.klick : undefined}>
              {z.zellen.map((c, i) => <td key={i} className={rechts && rechts.includes(i) ? "rechts" : ""}>{c}</td>)}</tr>))}
        </tbody>
      </table>
    </div>
  );
}

// Zeichnungs- bzw. Bildfläche, solange es kein Dokumentenmanagement gibt
export function BildFlaeche({ text, attr }) {
  return <div className="gf-bildflaeche" {...(attr || {})}><span>{text || "Bild"}</span><small>kommt mit dem Dokumentenmanagement</small></div>;
}

// Vor dem Schliessen mit Änderungen einmal nachfragen: Speichern,
// Verwerfen oder Abbrechen. → true (zu, nicht gespeichert),
// "gespeichert" (gespeichert, speichern hat evtl. selbst geschlossen)
// oder false (offen lassen)
export async function schliessenFragen(geaendert, alt, speichern) {
  if (!geaendert) return true;
  if (!speichern) return alt.nachfragen({ titel: "Nicht gespeichert", text: "Änderungen verwerfen?", bestaetigen: "Verwerfen", gefahr: true });
  const w = await speichernFragen();
  if (w === "verwerfen") return true;
  if (w !== "speichern") return false;
  try { await speichern(); return "gespeichert"; }
  catch (e) { alt.meldung(e?.message || String(e), "fehler"); return false; }
}
