// =================================================================
//  RECHNER → G-CODE FÜR FASE UND RADIUS
//  Eine Fase mit oder ohne Verrundung, von der Stirn zum Durchmesser
//  oder umgekehrt, in Fanuc-Schreibweise. Wahlweise mit A- und
//  R-Programmierung oder mit allen Punkten ausgerechnet.
//
//  Die Zeichnung ist ein fester Plan als SVG-Text, in dem sich nur
//  die Zahlen ändern; sie enthält keine eingegebenen Texte.
// =================================================================
import { useState } from "react";
import { alt } from "../../bruecke.jsx";

const bogen = (grad) => grad * Math.PI / 180;

// Bleibt beim Wechsel auf einen anderen Reiter stehen
const gcode = {
  richtung: "stirn",     // stirn = von der Fläche auf den Durchmesser
  dm: "20",              // Enddurchmesser
  zStart: "0",           // Z am Anfang
  fase: "1",             // Fasenbreite
  winkel: "45",
  radius: "0.2",
  radienAn: true,
  ohneA: false,
  vorschub: "0.03",
  vorschubFein: "0.02",
  ueberlauf: "0.5",
  laenge: "2",
};

// Zeichnung: zeigt, was das Programm macht
// Feste Zeichnung, nur die Zahlen ändern sich.
// Links das Rohteil im Schnitt, oben die Mittellinie, dazu die
// Startstellung des Drehstahls.
function bildGcode(g) {
  const dm = parseFloat(g.dm) || 20;
  const fase = parseFloat(g.fase) || 1;
  const winkel = parseFloat(g.winkel) || 45;
  const rad = g.radienAn ? (parseFloat(g.radius) || 0) : 0;
  const z0 = parseFloat(g.zStart) || 0;
  const stirn = g.richtung === "stirn";

  const z = (x) => (Math.round(x * 100) / 100).toLocaleString("de-CH");

  // Feste Geometrie in der Zeichnung, unabhängig von den Werten
  const links = 120, rechts = 400, mitte = 200;
  const oben = 120;                 // Aussendurchmesser
  const fb = 26;                    // Fasenbreite in der Zeichnung
  const ft = 26;                    // Fasentiefe in der Zeichnung

  const kontur = stirn
    ? 'M' + links + ',' + mitte
      + ' L' + links + ',' + (oben + fb)
      + ' L' + (links + ft) + ',' + oben
      + ' L' + rechts + ',' + oben
      + ' L' + rechts + ',' + mitte + ' Z'
    : 'M' + links + ',' + mitte
      + ' L' + links + ',' + oben
      + ' L' + (rechts - ft) + ',' + oben
      + ' L' + rechts + ',' + (oben + fb)
      + ' L' + rechts + ',' + mitte + ' Z';

  const fasenLinie = stirn
    ? '<line x1="' + links + '" y1="' + (oben + fb) + '" x2="' + (links + ft)
      + '" y2="' + oben + '" stroke="var(--gefahr)" stroke-width="3"/>'
    : '<line x1="' + (rechts - ft) + '" y1="' + oben + '" x2="' + rechts
      + '" y2="' + (oben + fb) + '" stroke="var(--gefahr)" stroke-width="3"/>';

  // Startstellung des Werkzeugs: über dem Material, vor der Stirnfläche
  const wx = stirn ? links - 34 : rechts + 34;
  const wy = oben - 46;

  return '<svg viewBox="0 0 520 260" class="zeichnung" role="img"'
    + ' aria-label="Drehteil mit Fase und Startstellung des Werkzeugs">'

    // Mittellinie
    + '<line x1="60" y1="' + mitte + '" x2="470" y2="' + mitte + '"'
    + ' stroke="var(--linie-stark)" stroke-width="1" stroke-dasharray="10 4 2 4"/>'
    + '<text x="474" y="' + (mitte + 4) + '" class="zbeschriftung">Mitte</text>'

    // Werkstück
    + '<path d="' + kontur + '" fill="var(--marke-hell)"'
    + ' stroke="var(--marke)" stroke-width="2.5"/>'
    + fasenLinie

    // Durchmesser links
    + '<line x1="88" y1="' + oben + '" x2="88" y2="' + mitte + '"'
    + ' stroke="var(--tinte)" stroke-width="1"/>'
    + '<line x1="82" y1="' + oben + '" x2="94" y2="' + oben + '"'
    + ' stroke="var(--tinte)" stroke-width="1"/>'
    + '<line x1="82" y1="' + mitte + '" x2="94" y2="' + mitte + '"'
    + ' stroke="var(--tinte)" stroke-width="1"/>'
    + '<text x="78" y="' + (oben + 34) + '" class="zbeschriftung" text-anchor="end">Ø'
    + z(dm) + '</text>'

    // Fasenmass oben
    + '<text x="' + (links + ft + 14) + '" y="' + (oben - 12) + '" class="zbeschriftung">'
    + z(fase) + ' × ' + z(winkel) + '°' + (rad > 0 ? '   R' + z(rad) : "") + '</text>'

    // Z-Angabe
    + '<text x="' + links + '" y="' + (mitte + 26) + '" class="zbeschriftung"'
    + ' text-anchor="middle">Z' + z(z0) + '</text>'

    // Werkzeug in Startstellung
    + '<polygon points="' + wx + ',' + wy + ' ' + (wx - 14) + ',' + (wy - 24)
    + ' ' + (wx + 14) + ',' + (wy - 24) + '" fill="var(--gedaempft)"/>'
    + '<line x1="' + wx + '" y1="' + wy + '" x2="' + wx + '" y2="' + (oben - 6) + '"'
    + ' stroke="var(--gedaempft)" stroke-width="1" stroke-dasharray="4 3"/>'
    + '<text x="' + (wx + (stirn ? -20 : 20)) + '" y="' + (wy - 32) + '"'
    + ' class="zbeschriftung" text-anchor="' + (stirn ? "end" : "start") + '">Start</text>'

    // Bewegungsrichtung
    + '<text x="260" y="242" class="zbeschriftung" text-anchor="middle">'
    + (stirn ? "von der Stirnfläche auf den Durchmesser"
             : "vom Durchmesser auf die Stirnfläche") + '</text>'
    + '</svg>';
}

export function baueGcode(g) {
  const dm = parseFloat(g.dm) || 0;
  const z0 = parseFloat(g.zStart) || 0;
  const fase = parseFloat(g.fase) || 0;
  const winkel = parseFloat(g.winkel) || 45;
  const rad = g.radienAn ? (parseFloat(g.radius) || 0) : 0;
  const f = (parseFloat(g.vorschub) || 0.03).toFixed(2);
  const ff = (parseFloat(g.vorschubFein) || 0.02).toFixed(2);
  const ueber = parseFloat(g.ueberlauf) || 0.5;
  const laenge = parseFloat(g.laenge) || 2;

  const anfahrDm = (dm + 2).toFixed(2);
  const tiefe = fase / Math.tan(bogen(winkel));
  const zEnde = (z0 + tiefe).toFixed(3);
  const dmNachFase = (dm - 2 * fase).toFixed(3);

  const zeilen = [];

  if (g.richtung === "stirn") {
    // Von der Stirnfläche auf den Durchmesser
    zeilen.push("G0X" + anfahrDm + "Z" + z0.toFixed(2));
    zeilen.push("G1X-0.5F" + f);
    zeilen.push("G1X0.00");
    zeilen.push("G1,A90.," + (rad > 0 ? "R" + rad.toFixed(2) : "R0") + "F" + ff);
    zeilen.push(",A" + winkel.toFixed(0) + ".X" + dmNachFase + "Z" + zEnde
      + (rad > 0 ? ",R" + rad.toFixed(2) : "") + "F" + ff);
    zeilen.push("G1X" + dm.toFixed(3) + "Z" + (z0 + laenge).toFixed(2) + "F" + f);
  } else {
    // Vom Durchmesser auf die Stirnfläche, also Kantenbruch aussen
    zeilen.push("G0X" + anfahrDm + "Z" + (z0 + laenge).toFixed(2));
    zeilen.push("G1X" + dm.toFixed(3) + "F" + f);
    zeilen.push("G1Z" + zEnde + "F" + f);
    zeilen.push("G1,A" + (180 - winkel).toFixed(0) + ".X" + dmNachFase + "Z" + z0.toFixed(3)
      + (rad > 0 ? ",R" + rad.toFixed(2) : "") + "F" + ff);
    zeilen.push("G1X-0.5F" + ff);
    zeilen.push("G0X" + anfahrDm);
  }

  zeilen.push("G0X" + (dm + 4).toFixed(2) + "Z" + (z0 + laenge + ueber).toFixed(2));
  return zeilen.join("\n");
}

// Dieselbe Kontur, aber ohne A-Programmierung: jeder Punkt ist
// ausgerechnet. Ein Radius wird dabei in einen G2-Bogen aufgelöst.
// Steuerungen, die ",A" und ",R" nicht kennen, fahren damit gleich.
export function baueGcodeEinfach(g) {
  const dm = parseFloat(g.dm) || 0;
  const z0 = parseFloat(g.zStart) || 0;
  const fase = parseFloat(g.fase) || 0;
  const winkel = parseFloat(g.winkel) || 45;
  const rad = g.radienAn ? (parseFloat(g.radius) || 0) : 0;
  const f = (parseFloat(g.vorschub) || 0.03).toFixed(2);
  const ff = (parseFloat(g.vorschubFein) || 0.02).toFixed(2);
  const ueber = parseFloat(g.ueberlauf) || 0.5;
  const laenge = parseFloat(g.laenge) || 2;

  const anfahrDm = (dm + 2).toFixed(2);
  const tiefe = fase / Math.tan(bogen(winkel));
  const dmNachFase = dm - 2 * fase;

  // Der Radius sitzt am Übergang von der Stirnfläche in die Fase.
  // Sein Anfang liegt auf der Stirnfläche, sein Ende auf der Fase.
  const halb = bogen(winkel) / 2;
  const abstand = rad > 0 ? rad * Math.tan(halb) : 0;
  const zeilen = [];

  if (g.richtung === "stirn") {
    const zRadEnde = z0 + abstand * Math.sin(bogen(winkel));
    const dmRadEnde = dmNachFase - 2 * (tiefe - abstand * Math.cos(bogen(winkel)))
      * Math.tan(bogen(winkel));

    zeilen.push("G0X" + anfahrDm + "Z" + z0.toFixed(3));
    zeilen.push("G1X-0.500F" + f);
    zeilen.push("G1X0.000");
    if (rad > 0) {
      zeilen.push("G1X" + (2 * abstand).toFixed(3) + "F" + ff);
      zeilen.push("G3X" + (2 * (abstand + rad * Math.sin(bogen(winkel)))).toFixed(3)
        + "Z" + (z0 + rad * (1 - Math.cos(bogen(winkel)))).toFixed(3)
        + "R" + rad.toFixed(3) + "F" + ff);
    }
    zeilen.push("G1X" + dmNachFase.toFixed(3) + "Z" + (z0 + tiefe).toFixed(3) + "F" + ff);
    zeilen.push("G1X" + dm.toFixed(3) + "Z" + (z0 + tiefe).toFixed(3) + "F" + f);
    zeilen.push("G1Z" + (z0 + laenge).toFixed(3) + "F" + f);
  } else {
    zeilen.push("G0X" + anfahrDm + "Z" + (z0 + laenge).toFixed(3));
    zeilen.push("G1X" + dm.toFixed(3) + "F" + f);
    zeilen.push("G1Z" + (z0 + tiefe).toFixed(3) + "F" + f);
    zeilen.push("G1X" + dmNachFase.toFixed(3) + "Z" + z0.toFixed(3) + "F" + ff);
    if (rad > 0) {
      zeilen.push("G2X" + Math.max(0, dmNachFase - 2 * abstand).toFixed(3)
        + "Z" + z0.toFixed(3) + "R" + rad.toFixed(3) + "F" + ff);
    }
    zeilen.push("G1X-0.500F" + ff);
    zeilen.push("G0X" + anfahrDm);
  }

  zeilen.push("G0X" + (dm + 4).toFixed(2) + "Z" + (z0 + laenge + ueber).toFixed(3));
  return zeilen.join("\n");
}


// Zahlenfeld, das erst beim Verlassen oder mit Enter meldet
function FeldInnen({ id, label, wert, setze, step }) {
  const [text, setText] = useState(wert);
  return (
    <label className="feld"><span>{label}</span>
      <input type="number" id={id} step={step} value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => setze(text)} onKeyDown={(e) => { if (e.key === "Enter") setze(text); }} /></label>
  );
}
const Feld = (p) => <FeldInnen key={p.wert} {...p} />;

export default function GCode() {
  const [g, setG] = useState({ ...gcode });
  const setze = (feld) => (wert) => { gcode[feld] = wert; setG({ ...gcode }); };

  const text = g.ohneA ? baueGcodeEinfach(g) : baueGcode(g);
  const fassung = g.ohneA
    ? "Alle Punkte ausgerechnet — läuft auf jeder Steuerung"
    : "Mit A- und R-Programmierung — kurz, braucht eine Steuerung, die das kennt";
  const kopieren = async () => {
    try { await navigator.clipboard.writeText(text); alt.meldung("Programm kopiert."); }
    catch (f) { alt.meldung("Kopieren nicht möglich. Bitte von Hand markieren.", "warn"); }
  };

  return (
    <>
      <section className="karte"><h2>Was soll gedreht werden?</h2>
        <div dangerouslySetInnerHTML={{ __html: bildGcode(g) }} />
        <div className="moduswahl">
          {[["stirn", "Stirn zum Durchmesser"], ["aussen", "Durchmesser zur Stirn"]].map(([w, t]) => (
            <button key={w} className={"moduswahl__knopf" + (g.richtung === w ? " aktiv" : "")} data-gr={w}
              onClick={() => setze("richtung")(w)}>{t}</button>
          ))}
        </div>
        <div className="zeitraumwahl">
          <Feld id="g-dm" label="Durchmesser in mm" wert={g.dm} setze={setze("dm")} step="0.01" />
          <Feld id="g-z" label="Z am Anfang" wert={g.zStart} setze={setze("zStart")} step="0.01" />
        </div>
        <div className="zeitraumwahl">
          <Feld id="g-fase" label="Fasenbreite in mm" wert={g.fase} setze={setze("fase")} step="0.05" />
          <Feld id="g-winkel" label="Winkel in Grad" wert={g.winkel} setze={setze("winkel")} step="1" />
        </div>
        <label className="schalter"><input type="checkbox" id="g-radan" checked={g.radienAn}
          onChange={(e) => setze("radienAn")(e.target.checked)} /><span>Übergänge verrunden</span></label>
        {/* Manche Steuerungen kennen ",A" und ",R" nicht. Dann rechnet
            die App jeden Punkt aus und gibt reine G1- und G2-Sätze aus. */}
        <label className="schalter"><input type="checkbox" id="g-ohnea" checked={g.ohneA}
          onChange={(e) => setze("ohneA")(e.target.checked)} /><span>Ohne A-Programmierung, alle Punkte ausgerechnet</span></label>
        {g.radienAn && <Feld id="g-radius" label="Radius in mm" wert={g.radius} setze={setze("radius")} step="0.05" />}
        <div className="zeitraumwahl">
          <Feld id="g-f" label="Vorschub grob" wert={g.vorschub} setze={setze("vorschub")} step="0.005" />
          <Feld id="g-ff" label="Vorschub fein" wert={g.vorschubFein} setze={setze("vorschubFein")} step="0.005" />
        </div>
        <Feld id="g-laenge" label="Länge des Zylinders in mm" wert={g.laenge} setze={setze("laenge")} step="0.1" />
      </section>

      <section className="karte"><div className="karte__kopf"><h2>Programm</h2>
        <button className="linkknopf" id="g-kopieren" onClick={kopieren}>Kopieren</button></div>
        <p className="klein">{fassung}</p>
        <pre className="gcode">{text}</pre>
        <p className="hinweis">Fanuc-Schreibweise mit Winkel- und Radiusangaben. Bitte vor dem ersten Lauf am
          Simulator prüfen. Werkzeugaufruf, Drehzahl und Kühlung fehlen bewusst, die stehen bei euch im
          Rahmenprogramm.</p>
      </section>
    </>
  );
}
