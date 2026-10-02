// =================================================================
//  RECHNER FÜR DIE WERKSTATT
//  Erster Bereich, der in React neu gebaut ist: die Reiter und die
//  Drehzahl. Winkel, G-Code, C-Achse, Gravur und DXF laufen noch
//  im alten Programm und hängen über <AltTeil> darin.
// =================================================================
import { useLayoutEffect, useRef, useState } from "react";
import { alt, AltTeil, useGemerkt } from "../bruecke.jsx";
import { WERKSTOFFE } from "../daten/schnittwerte.js";

const REITER = [
  ["drehzahl", "Drehzahl"], ["winkel", "Winkel und Fase"], ["gcode", "G-Code"],
  ["cachse", "C-Achse G12.1"], ["gravur", "Gravur"], ["dxf", "DXF"],
];

// Was jemand eingetippt hat, bleibt beim Wechsel auf eine andere
// Seite stehen, bis die App neu geladen wird.
const gemerkt = {
  ansicht: "drehzahl",
  werkstoff: 0,
  schneidstoff: "hm",
  eigenerVc: "",
  durchmesser: "",
  zaehne: "",
  fz: "",
};

const zahl = (n) => Math.round(n).toLocaleString("de-CH");

export default function Rechner() {
  const [ansicht, setAnsicht] = useState(gemerkt.ansicht);
  useGemerkt(gemerkt, { ansicht });

  // Die alten Reiter zeichnen in ein Feld mit dieser Kennung und
  // suchen es teils selbst wieder (DXF nach dem Einlesen).
  const alteZeichner = {
    winkel: alt.rechnerWinkel,
    gcode: alt.rechnerGcode,
    cachse: alt.rechnerCachse,
    gravur: alt.rechnerGravur,
    dxf: alt.rechnerDxf,
  };

  return (
    <>
      <h1 className="seitentitel">Rechner</h1>
      <div className="reiter">
        {REITER.map(([wert, text]) => (
          <button key={wert} className={"reiter__knopf" + (ansicht === wert ? " aktiv" : "")}
            data-rech={wert} onClick={() => setAnsicht(wert)}>{text}</button>
        ))}
      </div>
      <Uebergang key={ansicht}>
        {alteZeichner[ansicht]
          ? <AltTeil id="rech-inhalt" zeichne={alteZeichner[ansicht]} />
          : <div id="rech-inhalt"><Drehzahl /></div>}
      </Uebergang>
    </>
  );
}

// Derselbe sanfte Eintritt wie bei den alten Reitern
function Uebergang({ children }) {
  const ref = useRef(null);
  useLayoutEffect(() => { alt.reiterUebergang(ref.current); }, []);
  return <div ref={ref}>{children}</div>;
}

function Drehzahl() {
  const [werkstoff, setWerkstoff] = useState(gemerkt.werkstoff);
  const [schneidstoff, setSchneidstoff] = useState(gemerkt.schneidstoff);
  const [eigenerVc, setEigenerVc] = useState(gemerkt.eigenerVc);
  const [durchmesser, setDurchmesser] = useState(gemerkt.durchmesser);
  const [zaehne, setZaehne] = useState(gemerkt.zaehne);
  const [fz, setFz] = useState(gemerkt.fz);
  useGemerkt(gemerkt, { werkstoff, schneidstoff, eigenerVc, durchmesser, zaehne, fz });

  const w = WERKSTOFFE[werkstoff];
  const vcVorschlag = schneidstoff === "hss" ? w.hss : w.hm;
  const vc = eigenerVc !== "" ? Number(eigenerVc) : vcVorschlag;
  const d = Number(durchmesser);
  const n = (d > 0 && vc > 0) ? (vc * 1000) / (Math.PI * d) : null;
  const vf = (n && Number(zaehne) > 0 && Number(fz) > 0) ? n * Number(zaehne) * Number(fz) : null;

  return (
    <>
      <section className="karte">
        <h2>Werkstoff</h2>
        <div className="wahlgitter">
          {WERKSTOFFE.map((m, i) => (
            <button key={m.name} className={"wahlknopf" + (i === werkstoff ? " aktiv" : "")}
              data-werkstoff={i} onClick={() => setWerkstoff(i)}>{m.name}</button>
          ))}
        </div>

        <h2 className="untertitel">Schneidstoff</h2>
        <div className="moduswahl">
          {[["hss", "HSS"], ["hm", "Hartmetall"]].map(([wert, text]) => (
            <button key={wert} className={"moduswahl__knopf" + (schneidstoff === wert ? " aktiv" : "")}
              data-schneid={wert} onClick={() => setSchneidstoff(wert)}>{text}</button>
          ))}
        </div>

        <label className="feld feld--abstand">
          <span>Schnittgeschwindigkeit Vc in m/min</span>
          <input type="number" id="r-vc" inputMode="decimal" step="1" value={eigenerVc}
            placeholder={vcVorschlag + " (Richtwert)"} onChange={(e) => setEigenerVc(e.target.value)} />
          <span className="feldhinweis">Leer lassen, um den Richtwert zu verwenden.
            {" "}Eigenen Wert eintragen, wenn du bessere Daten hast.</span>
        </label>
      </section>

      <section className="karte">
        <h2>Werkzeug</h2>
        <label className="feld"><span>Durchmesser in mm</span>
          <input type="number" id="r-d" inputMode="decimal" step="0.1" value={durchmesser}
            onChange={(e) => setDurchmesser(e.target.value)} />
        </label>
        <div className="zeitraumwahl">
          <label className="feld"><span>Zähne</span>
            <input type="number" id="r-z" inputMode="numeric" step="1" value={zaehne}
              onChange={(e) => setZaehne(e.target.value)} />
          </label>
          <label className="feld"><span>fz in mm</span>
            <input type="number" id="r-fz" inputMode="decimal" step="0.01" value={fz}
              onChange={(e) => setFz(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="karte karte--ergebnis">
        <div className="ergebnis">
          <div className="ergebnis__titel">Drehzahl</div>
          <div className="ergebnis__wert">{n ? zahl(n) : "–"}<span>1/min</span></div>
        </div>
        {vf && (
          <div className="ergebnis">
            <div className="ergebnis__titel">Vorschub</div>
            <div className="ergebnis__wert">{zahl(vf)}<span>mm/min</span></div>
          </div>
        )}
        <p className="hinweis">
          Gerechnet mit Vc = {zahl(vc)} m/min. n = Vc · 1000 / (π · d){vf ? ", Vf = n · z · fz" : ""}
        </p>
      </section>

      <p className="hinweis">Die Vc-Werte sind grobe Startwerte aus der Praxis.
        {" "}Was der Werkzeughersteller angibt, hat immer Vorrang.
        {" "}Bei dünnen Werkzeugen, langen Auskragungen oder schlechter Kühlung eher weniger nehmen.</p>
    </>
  );
}
