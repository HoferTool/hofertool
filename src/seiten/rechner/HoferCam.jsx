// =================================================================
//  NC-PRO → HOFER CAM
//  Seit 1.395.0 (Wunsch Patrick 5. November 2026): Programmkopf und
//  Programmende für die Star SB-20RG mit Eingabefeldern, darunter beide
//  Kanäle nebeneinander. Gleiche Synchronisationsmarken stehen auf
//  derselben Zeile, die App füllt dazwischen Leerzeilen; eine Marke ohne
//  Gegenstück ist rot. Rechnen in hofercam.js. Patrick gibt die Schritte
//  vor, darum hier bewusst nur Kopf und Ende (Werkzeugplätze und
//  Bearbeitungen kommen als Nächstes).
// =================================================================
import { useMemo, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { FELDER, programme, pruefen, synchronisieren, vorgabe } from "./hofercam.js";

// Bleibt beim Wechsel auf einen anderen Reiter stehen
const gemerkt = vorgabe();

export default function HoferCam() {
  const [w, setW] = useState(gemerkt);
  const setze = (name, wert) => {
    const neu = { ...w, [name]: wert };
    Object.assign(gemerkt, neu);
    setW(neu);
  };
  const fehler = pruefen(w);
  const prog = useMemo(() => programme(w), [w]);
  const sync = useMemo(() => synchronisieren(prog.k1, prog.k2), [prog]);

  const text = (zeilen) => zeilen.join("\r\n") + "\r\n";
  const kopieren = async (zeilen, kanal) => {
    try {
      await navigator.clipboard.writeText(text(zeilen));
      alt.meldung("Kanal " + kanal + " kopiert.", "gut");
    } catch (f) { alt.meldung("Kopieren ging nicht. Bitte von Hand markieren.", "warn"); }
  };
  const laden = (zeilen, nr) => {
    const url = URL.createObjectURL(new Blob([text(zeilen)], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = nr + ".nc";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const zuViel = Object.keys(fehler).length > 0;

  return (
    <div className="karte cam">
      <div className="cam-kopf">
        <h2 className="karte__titel">Hofer Cam</h2>
        <span className="cam-typ">Maschinentyp: <b>Star SB-20RG</b></span>
      </div>

      <div className="cam-gruppen">
        {FELDER.map((g) => (
          <fieldset key={g.gruppe} className="cam-gruppe">
            <legend>{g.gruppe}</legend>
            {g.felder.map((d) => (
              <label key={d.name} className={"feld cam-feld" + (fehler[d.name] ? " cam-feld--fehler" : "")}>
                <span>{d.text}</span>
                <input data-cam={d.name} value={w[d.name]} inputMode={d.art === "text" ? "text" : "decimal"}
                  onChange={(e) => setze(d.name, e.target.value)} />
                {fehler[d.name] && <small className="cam-fehler">{fehler[d.name]}</small>}
                {d.name === "nr" && !fehler.nr && <small className="klein">Kanal 2: O{prog.nr2}</small>}
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <div className="cam-stand" id="cam-stand">
        {sync.fehler
          ? <span className="cam-stand--fehler">{sync.fehler === 1 ? "1 Marke hat" : sync.fehler + " Marken haben"} im anderen Kanal kein Gegenstück.</span>
          : <span>Alle Synchronisationsmarken sind gepaart.</span>}
        {zuViel && <span className="cam-stand--fehler"> Bitte die rot markierten Felder prüfen.</span>}
      </div>

      <div className="cam-kanaele" id="cam-kanaele">
        <div className="cam-spalte cam-spalte--kopf">
          <b>Kanal 1 · O{prog.nr1}</b>
          <span>
            <button className="knopf knopf--klein" data-cam-kopieren="1" onClick={() => kopieren(prog.k1, 1)}>Kopieren</button>
            <button className="knopf knopf--klein" data-cam-laden="1" onClick={() => laden(prog.k1, prog.nr1)}>Herunterladen</button>
          </span>
        </div>
        <div className="cam-spalte cam-spalte--kopf">
          <b>Kanal 2 · O{prog.nr2}</b>
          <span>
            <button className="knopf knopf--klein" data-cam-kopieren="2" onClick={() => kopieren(prog.k2, 2)}>Kopieren</button>
            <button className="knopf knopf--klein" data-cam-laden="2" onClick={() => laden(prog.k2, prog.nr2)}>Herunterladen</button>
          </span>
        </div>
        {sync.reihen.map((r, i) => (
          [r.k1, r.k2].map((z, k) => (
            <div key={i + "-" + k} data-reihe={i} data-kanal={k + 1}
              className={"cam-zeile" + (r.sync ? " cam-zeile--sync" : "") + (!z ? " cam-zeile--leer" : "")
                + (z?.fehler ? " cam-zeile--fehler" : "")}>
              <span className="cam-nr">{z ? z.nr : ""}</span>
              <span className="cam-text">{z ? z.text : ""}</span>
            </div>
          ))
        ))}
      </div>
      <p className="klein">Blau = Synchronisationsmarke, in beiden Kanälen auf derselben Zeile. Graue Zeilen füllt
        die App nur für die Anzeige ein, sie kommen nicht ins Programm.</p>
    </div>
  );
}
