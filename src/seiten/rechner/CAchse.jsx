// =================================================================
//  RECHNER → C-ACHSE G12.1
//  Form wählen, Masse eintragen, G-Code der Fräsermitte abholen.
//  Die Vorschau zeigt Teil und Bahn; der Fräser lässt sich mit dem
//  Schieber oder als Ablauf um das Teil fahren. Gerechnet wird in
//  cachse.js, Felder melden sich beim Verlassen (wie bisher).
// =================================================================
import { useEffect, useMemo, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { KopfFelder } from "./kopf.jsx";
import { CACHSE_VORGABE, cachseBahn, cachseGcode, cachsePasst, cachsePunkte, cachseTeil } from "./cachse.js";

// Bleibt beim Wechsel auf einen anderen Reiter stehen
const gemerkt = { ...CACHSE_VORGABE };

const FORMEN = [["vierkant", "Vierkant"], ["sechskant", "Sechskant"], ["rechteck", "Rechteck"], ["torx", "Torx"]];

// Zahlenfeld, das erst beim Verlassen oder mit Enter meldet
function FeldInnen({ name, text, wert, setze, schritt }) {
  const [eingabe, setEingabe] = useState(String(wert));
  const melden = () => setze(name, Number(eingabe));
  return (
    <label className="feld"><span>{text}</span>
      <input type="number" data-cax={name} step={schritt || "0.1"} value={eingabe}
        onChange={(e) => setEingabe(e.target.value)} onBlur={melden}
        onKeyDown={(e) => { if (e.key === "Enter") melden(); }} /></label>
  );
}
const Feld = (p) => <FeldInnen key={p.name + "|" + p.wert} {...p} />;

export default function CAchse() {
  const [c, setC] = useState(gemerkt);
  const [schritt, setSchritt] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  // Vor- und Nachspann liegen ausserhalb; ändern sie sich, wird neu gerechnet
  const [kopfStand, setKopfStand] = useState(0);

  const aendern = (neu) => {
    const ganz = { ...c, ...neu };
    Object.assign(gemerkt, ganz);
    setC(ganz);
    setLaeuft(false);
    setSchritt(0);
  };
  const setze = (name, wert) => aendern({ [name]: wert });

  // Ablauf: der Fräser wandert einmal herum und beginnt von vorn
  useEffect(() => {
    if (!laeuft) return undefined;
    let bild = requestAnimationFrame(function weiter() {
      setSchritt((s) => (s + 0.004 > 1 ? 0 : s + 0.004));
      bild = requestAnimationFrame(weiter);
    });
    return () => cancelAnimationFrame(bild);
  }, [laeuft]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gcode = useMemo(() => cachseGcode(c), [c, kopfStand]);
  const pruef = cachsePasst(c);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(gcode);
      alt.meldung("G-Code kopiert.");
    } catch (f) { alt.meldung("Kopieren ging nicht. Bitte von Hand markieren.", "warn"); }
  };

  const formfelder = c.form === "rechteck"
    ? <><Feld name="breite" text="Breite in mm" wert={c.breite} setze={setze} />
        <Feld name="hoehe" text="Höhe in mm" wert={c.hoehe} setze={setze} /></>
    : c.form === "torx"
      ? <><Feld name="torxA" text="A über die Spitzen" wert={c.torxA} setze={setze} />
          <Feld name="torxB" text="B über die Täler" wert={c.torxB} setze={setze} /></>
      : <Feld name="sw" text="Schlüsselweite SW" wert={c.sw} setze={setze} />;

  return (
    <div className="karte">
      <div className="moduswahl" id="cax-formen">
        {FORMEN.map(([w, t]) => (
          <button key={w} type="button" className={"moduswahl__knopf" + (c.form === w ? " aktiv" : "")}
            data-caxform={w} onClick={() => aendern({ form: w })}>{t}</button>
        ))}
      </div>

      <div className="cax-raster">
        <div className="cax-bildfeld">
          <Bild c={c} schritt={schritt} />
          <div className="dxf-steuer">
            <button className="knopf knopf--klein" id="cax-los" onClick={() => setLaeuft((l) => !l)}>
              {laeuft ? "Halt" : "Ablauf zeigen"}</button>
            <input type="range" id="cax-schieber" min="0" max="1000" value={Math.round(schritt * 1000)}
              onChange={(e) => setSchritt(Number(e.target.value) / 1000)} />
          </div>
        </div>
        <div className="cax-felder">
          {formfelder}
          <Feld name="eckR" text="Eckenradius am Teil" wert={c.eckR} setze={setze} />
          <Feld name="fraeser" text="Fräserdurchmesser" wert={c.fraeser} setze={setze} />
          <Feld name="tiefeZ" text="Frästiefe in Z" wert={c.tiefeZ} setze={setze} />
          <Feld name="zustellung" text="Zustellung je Schnitt" wert={c.zustellung} setze={setze} />
          <Feld name="zStart" text="Z an der Stirnfläche" wert={c.zStart} setze={setze} />
          <Feld name="sicher" text="Sicherheitsabstand" wert={c.sicher} setze={setze} />
          <Feld name="vorschub" text="Vorschub mm/min" wert={c.vorschub} setze={setze} schritt="1" />
          <Feld name="drehzahl" text="Drehzahl Fräser" wert={c.drehzahl} setze={setze} schritt="50" />
          <label className="feld"><span>Fräsrichtung</span>
            <select data-cax="richtung" value={c.richtung} onChange={(e) => setze("richtung", e.target.value)}>
              <option value="gleich">Gleichlauf (M3)</option>
              <option value="gegen">Gegenlauf (M4)</option>
            </select></label>
        </div>
      </div>

      <p className="klein">Ausgegeben wird die Bahn der Fräsermitte in X und C. Bei Polarinterpolation ist die
        Radiuskorrektur auf den meisten Steuerungen gesperrt, deshalb steht der Fräserradius schon in den Werten.
        X ist im Durchmesser programmiert.
        {c.form === "torx" && <> <strong>Torx ist angenähert</strong> — sechs Lappen aus A und B, keine
          geprüfte Norm&shy;geometrie. Vor dem Einsatz an der Lehre prüfen.</>}</p>
      {!pruef.ok && <p className="karte karte--fehler cax-warnung">{pruef.text}</p>}
      <KopfFelder geaendert={() => setKopfStand((n) => n + 1)} />
      <pre className="gcode">{gcode}</pre>
      <button className="knopf knopf--klein" id="cax-kopieren" onClick={kopieren}>G-Code kopieren</button>
    </div>
  );
}

// ---------- Zeichnung ----------

function Bild({ c, schritt }) {
  // Teil, Bahn und Massangabe ändern sich nur mit den Angaben, nicht
  // mit jedem Schritt des Ablaufs
  const fest = useMemo(() => {
    const { bahn, aussen } = cachseBahn(c);
    const s = 150 / (Math.max(aussen, 1) * 1.25);      // Massstab auf 300 × 300
    const p = ([x, y]) => (150 + x * s).toFixed(1) + "," + (150 - y * s).toFixed(1);

    let form;
    if (c.form === "torx") {
      form = <polyline points={bahn[0].punkte.map(p).join(" ")} className="cax-bahn" />;
    } else {
      // Geraden, dazwischen die Ecken als Bögen
      let d = "";
      bahn.forEach((st, i) => {
        if (st.art !== "gerade") return;
        d += (i === 0 ? "M" : "L") + p(st.von) + " L" + p(st.bis) + " ";
        const bogen = bahn[i + 1];
        const naechste = bahn[(i + 2) % bahn.length];
        if (bogen && naechste) {
          d += "A" + (bogen.r * s).toFixed(1) + "," + (bogen.r * s).toFixed(1) + " 0 0 0 " + p(naechste.von) + " ";
        }
      });
      form = <path d={d + "Z"} className="cax-bahn" />;
    }

    const umriss = cachseTeil(c);
    const punkte = umriss.punkte.map(p).join(" ");
    const teil = umriss.geschlossen
      ? <polygon points={punkte} className="cax-teil" />
      : <polyline points={punkte} className="cax-teil" />;

    let mass;
    if (c.form === "vierkant" || c.form === "sechskant") {
      const y = (c.sw / 2) * s;
      mass = <><line x1="150" y1={150 - y} x2="150" y2={150 + y} className="cax-mass" />
        <text x="156" y="150" className="cax-text">SW {c.sw}</text></>;
    } else if (c.form === "rechteck") {
      mass = <text x="150" y={150 - (c.hoehe / 2) * s - 6} className="cax-text" textAnchor="middle">
        {c.breite} × {c.hoehe}</text>;
    } else {
      mass = <text x="150" y="16" className="cax-text" textAnchor="middle">A {c.torxA} · B {c.torxB}</text>;
    }
    return { s, p, form, teil, mass, folge: cachsePunkte(c) };
  }, [c]);

  // Fräser an seiner Stelle und der schon gefahrene Weg
  const { s, p, folge } = fest;
  let werkzeug = null;
  if (folge.length) {
    const i = Math.min(folge.length - 1, Math.max(0, Math.round(schritt * (folge.length - 1))));
    const [wx, wy] = folge[i];
    werkzeug = <>
      <polyline points={folge.slice(0, i + 1).map(p).join(" ")} className="dxf-gefahren" />
      <circle cx={(150 + wx * s).toFixed(1)} cy={(150 - wy * s).toFixed(1)}
        r={Math.max(2.5, (c.fraeser / 2) * s).toFixed(1)} className="dxf-fraeser" />
    </>;
  }

  return (
    <svg viewBox="0 0 300 300" className="cax-bild" id="cax-bild">
      <circle cx="150" cy="150" r="2" className="cax-mitte" />
      {fest.teil}{fest.form}{werkzeug}{fest.mass}
      <text x="8" y="292" className="cax-legende">— Teil</text>
      <text x="70" y="292" className="cax-legende cax-legende--bahn">— Fräsermitte</text>
    </svg>
  );
}
