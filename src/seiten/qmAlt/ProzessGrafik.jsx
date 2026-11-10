// =================================================================
//  QMS: grafische Ansicht eines Prozessblatts (seit 1.480.0, Wunsch
//  Patrick 10. November 2026: „zu jedem Prozessbeschrieb auch eine
//  graphische Ansicht“, „soll zur Prozesslandkarte und dem HoferTool
//  passen“). Dieselbe blaue Fläche mit Glas-Kärtchen wie die Landkarte:
//  links was hineinkommt, in der Mitte der Ablauf Schritt für Schritt,
//  rechts das Ergebnis, darunter Kennzahl, Risiken und Nachweise.
//  Gelesen wird nur das bestehende Prozessblatt (ablaufSchritte), ändern
//  geht wie bisher über „Bearbeiten“.
// =================================================================
import { useEffect, useState } from "react";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { PROZESS_GRUPPEN, ebeneVon, prozessNr, ablaufSchritte, aufzaehlung, normListe } from "../../daten/qmAlt.js";

export function prozessAnsicht(p, prozesse, bearbeiten) {
  fensterOeffnen((zu) => <ProzessFenster start={p} prozesse={prozesse} bearbeiten={bearbeiten} zu={zu} />,
    null, "qma-pa-huelle");
}

const Chips = ({ text, leer }) => {
  const teile = aufzaehlung(text);
  if (!teile.length) return <span className="qma-pa__leer">{leer}</span>;
  return teile.map((x, i) => <span key={i} className="qma-pa__chip" style={{ animationDelay: 120 + i * 50 + "ms" }}>{x}</span>);
};

function ProzessFenster({ start, prozesse, bearbeiten, zu }) {
  const liste = prozesse.length ? prozesse : [start];
  const [i, setI] = useState(() => Math.max(0, liste.findIndex((x) => x.schluessel === start.schluessel)));
  const p = liste[i] || start;
  const f = p.felder || {};
  const schritte = ablaufSchritte(f.ablauf);
  const ebene = (PROZESS_GRUPPEN.find((g) => g[0] === ebeneVon(p)) || [])[1] || "";
  const gehe = (d) => setI((x) => (x + d + liste.length) % liste.length);

  // Pfeiltasten blättern durch die Prozesse, ausser beim Tippen in einem Feld.
  useEffect(() => {
    const taste = (e) => {
      if (e.defaultPrevented || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "")) return;
      if (e.key === "ArrowRight") { gehe(1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { gehe(-1); e.preventDefault(); }
    };
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, [liste.length]);

  const unten = [["Kennzahl", f.kennzahl], ["Typische Risiken", f.risiken], ["Nachweis im HoferTool", f.nachweis], ["Mitgeltende Dokumente", f.dokumente]]
    .filter((x) => String(x[1] || "").trim());

  return (
    <div className="dialog dialog--breit qma-pa" id="qma-pa" data-qmapa={p.schluessel}>
      <div className="qma-pa__flaeche" key={p.schluessel}>
        <span className="qma-wellen" aria-hidden="true"><i /><i /><i /></span>
        <div className="qma-pa__kopf">
          <img className="qma-pa__logo" src="./logo-weiss.svg" alt="Hofer + Co" />
          <div className="qma-pa__titel">
            <div className="qma-pa__ebene">{ebene}{prozessNr(p) ? " · " + prozessNr(p) : ""}</div>
            <h2>{p.titel}</h2>
          </div>
          <div className="qma-pa__knoepfe">
            {liste.length > 1 && <>
              <button className="qma-pa__knopf" id="qma-pa-zurueck" title="Vorheriger Prozess (←)" onClick={() => gehe(-1)}>‹</button>
              <span className="qma-pa__zaehler">{i + 1} / {liste.length}</span>
              <button className="qma-pa__knopf" id="qma-pa-weiter" title="Nächster Prozess (→)" onClick={() => gehe(1)}>›</button>
            </>}
            {bearbeiten && <button className="qma-pa__knopf qma-pa__knopf--text" id="qma-pa-bearbeiten" onClick={() => { zu(); bearbeiten(p); }}>Bearbeiten</button>}
            <button className="qma-pa__knopf qma-pa__knopf--text" data-zu="" onClick={zu}>Schliessen</button>
          </div>
        </div>

        <div className="qma-pa__info">
          {f.zweck ? <p className="qma-pa__zweck">{f.zweck}</p> : null}
          <div className="qma-pa__marken">
            {f.verantwortlich ? <span className="qma-pa__pille"><b>Verantwortlich</b> {f.verantwortlich}</span> : null}
            {normListe(p.norm).map((n) => <span key={n} className="qma-pa__pille qma-pa__pille--norm">ISO {n}</span>)}
          </div>
        </div>

        <div className="qma-pa__fluss">
          <div className="qma-pa__spalte qma-pa__spalte--ein" id="qma-pa-ein">
            <div className="qma-pa__spaltentitel">Auslöser / Eingaben</div>
            <Chips text={f.eingaben} leer="noch nichts eingetragen" />
          </div>
          <div className="qma-pa__pfeil" aria-hidden="true" />
          <ol className="qma-pa__ablauf" id="qma-pa-ablauf">
            {schritte.length ? schritte.map((s, k) => (
              <li key={k} className="qma-pa__schritt" style={{ animationDelay: 200 + k * 90 + "ms" }} data-qmaschritt={k + 1}>
                <span className="qma-pa__nr">{k + 1}</span>
                <div className="qma-pa__karte">
                  {s.kopf ? <div className="qma-pa__kopfzeile">{s.kopf}</div> : null}
                  {s.kette ? (
                    <div className="qma-pa__kette">
                      {s.punkte.map((x, j) => <span key={j} className="qma-pa__glied">{x.text}</span>)}
                    </div>
                  ) : s.punkte.length > 1 ? (
                    <ul className="qma-pa__punkte">
                      {s.punkte.map((x, j) => <li key={j} className={x.name ? "qma-pa__entscheid" : ""}>
                        {x.name ? <b className="qma-pa__wenn">{x.name}</b> : null}{x.text}</li>)}
                    </ul>
                  ) : <div>{s.punkte[0] ? <>{s.punkte[0].name ? <b className="qma-pa__wenn">{s.punkte[0].name}</b> : null}{s.punkte[0].text}</> : null}</div>}
                </div>
              </li>)) : <li className="qma-pa__leer">Noch kein Ablauf beschrieben. „Bearbeiten“ antippen.</li>}
          </ol>
          <div className="qma-pa__pfeil" aria-hidden="true" />
          <div className="qma-pa__spalte qma-pa__spalte--aus" id="qma-pa-aus">
            <div className="qma-pa__spaltentitel">Ergebnis</div>
            <Chips text={f.ergebnisse} leer="noch nichts eingetragen" />
          </div>
        </div>

        {unten.length ? <div className="qma-pa__unten">
          {unten.map(([t, x]) => <div key={t} className="qma-pa__kasten"><div className="qma-pa__spaltentitel">{t}</div><div className="qm-umbruch">{x}</div></div>)}
        </div> : null}
      </div>
    </div>);
}
