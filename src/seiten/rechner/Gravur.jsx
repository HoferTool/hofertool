// =================================================================
//  RECHNER → GRAVUR
//  Text, Schrift und Werkzeug wählen, die Vorschau zeigt die Bahnen,
//  darunter steht der G-Code. Gerechnet wird in gravur.js. Das
//  Abtasten der Schrift ist aufwendig und läuft darum nur, wenn sich
//  Text oder Schrift ändern, nicht bei jedem Schritt der Vorschau.
// =================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { KopfFelder } from "./kopf.jsx";
import { GRAVUR_VORGABE, GRAVUR_SCHRIFTEN, gravurKonturen, gravurBahnen, gravurGcode, gravurDuennste } from "./gravur.js";

// Bleibt beim Wechsel auf einen anderen Reiter stehen
const gemerkt = { ...GRAVUR_VORGABE };

// Zahlenfeld, das erst beim Verlassen oder mit Enter meldet
function FeldInnen({ name, text, wert, setze, schritt }) {
  const [eingabe, setEingabe] = useState(String(wert));
  const melden = () => setze(name, Number(eingabe));
  return (
    <label className="feld"><span>{text}</span>
      <input type="number" data-grav={name} step={schritt || "0.1"} value={eingabe}
        onChange={(e) => setEingabe(e.target.value)} onBlur={melden}
        onKeyDown={(e) => { if (e.key === "Enter") melden(); }} /></label>
  );
}
const Feld = (p) => <FeldInnen key={p.name + "|" + p.wert} {...p} />;

// Der Text wird erst übernommen, wenn eine halbe Sekunde nicht mehr
// getippt wurde
function TextFeld({ wert, setze }) {
  const [eingabe, setEingabe] = useState(wert);
  const taste = useRef(null);
  useEffect(() => () => clearTimeout(taste.current), []);
  return (
    <label className="feld"><span>Text</span>
      <input type="text" data-grav="text" value={eingabe} onChange={(e) => {
        const neu = e.target.value;
        setEingabe(neu);
        clearTimeout(taste.current);
        taste.current = setTimeout(() => setze("text", neu), 500);
      }} /></label>
  );
}

export default function Gravur() {
  const [g, setG] = useState(gemerkt);
  const [schritt, setSchritt] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  const [kopfStand, setKopfStand] = useState(0);

  const setze = (name, wert) => {
    const ganz = { ...g, [name]: wert };
    Object.assign(gemerkt, ganz);
    setG(ganz);
    setLaeuft(false);
    setSchritt(0);
  };

  useEffect(() => {
    if (!laeuft) return undefined;
    let bild = requestAnimationFrame(function weiter() {
      setSchritt((s) => (s + 0.003 > 1 ? 0 : s + 0.003));
      bild = requestAnimationFrame(weiter);
    });
    return () => cancelAnimationFrame(bild);
  }, [laeuft]);

  const roh = useMemo(() => gravurKonturen(g),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g.text, g.schrift, g.fett, g.kursiv, g.hoehe, g.laufweite, g.glaetten]);
  const zuege = useMemo(() => gravurBahnen(g, roh.zuege), [g, roh]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gcode = useMemo(() => gravurGcode(g, roh), [g, roh, kopfStand]);

  const mantel = g.flaeche === "mantel";
  const fraeser = g.art === "fraeser";

  // Zu dicker Fräser: an der dünnsten Stelle bliebe nichts stehen
  const duenn = useMemo(() => (fraeser ? gravurDuennste(roh.zuege) : Infinity), [fraeser, roh]);
  const zuDick = fraeser && isFinite(duenn) && g.werkzeug > duenn;

  // Ist die Schrift auf diesem Rechner überhaupt da?
  let schriftDa = true;
  try { schriftDa = document.fonts.check('16px "' + g.schrift + '"'); } catch (f) { schriftDa = true; }

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(gcode);
      alt.meldung("G-Code kopiert.");
    } catch (f) { alt.meldung("Kopieren ging nicht. Bitte von Hand markieren.", "warn"); }
  };

  return (
    <div className="karte">
      <TextFeld wert={g.text} setze={setze} />

      <div className="cax-raster">
        <div className="cax-bildfeld">
          <Bild roh={roh} zuege={zuege} werkzeug={g.werkzeug} schritt={schritt} />
          <div className="dxf-steuer">
            <button className="knopf knopf--klein" id="grav-los" onClick={() => setLaeuft((l) => !l)}>
              {laeuft ? "Halt" : "Ablauf zeigen"}</button>
            <input type="range" id="grav-schieber" min="0" max="1000" value={Math.round(schritt * 1000)}
              onChange={(e) => setSchritt(Number(e.target.value) / 1000)} />
          </div>
        </div>
        <div className="cax-felder">
          <label className="feld"><span>Schrift</span>
            <select data-grav="schrift" value={g.schrift} onChange={(e) => setze("schrift", e.target.value)}>
              {GRAVUR_SCHRIFTEN.map((sn) => <option key={sn} value={sn}>{sn}</option>)}
            </select>
            <span className="feldhinweis" id="grav-vorhanden">{schriftDa ? ""
              : "Diese Schrift ist hier nicht installiert — es wird ersatzweise eine andere gezeichnet."}</span></label>
          <div className="feld"><span className="feldlabel">Schnitt</span>
            <label className="schalter schalter--eng"><input type="checkbox" data-grav="fett" checked={g.fett}
              onChange={(e) => setze("fett", e.target.checked)} /><span>Fett</span></label>
            <label className="schalter schalter--eng"><input type="checkbox" data-grav="kursiv" checked={g.kursiv}
              onChange={(e) => setze("kursiv", e.target.checked)} /><span>Kursiv</span></label></div>
          <Feld name="hoehe" text="Zeichenhöhe in mm" wert={g.hoehe} setze={setze} />
          <Feld name="laufweite" text="Laufweite in mm" wert={g.laufweite} setze={setze} schritt="0.05" />
          <label className="feld"><span>Fläche</span>
            <select data-grav="flaeche" value={g.flaeche} onChange={(e) => setze("flaeche", e.target.value)}>
              <option value="stirn">Stirnseite (G12.1)</option>
              <option value="mantel">Mantel (G07.1)</option>
            </select></label>
          <Feld name="dm" text="Durchmesser des Teils" wert={g.dm} setze={setze} />
          {!mantel && <>
            <Feld name="radius" text="Abstand von der Achse" wert={g.radius} setze={setze} />
            <Feld name="winkel" text="Drehung in Grad" wert={g.winkel} setze={setze} schritt="1" />
          </>}
          <Feld name="zStart" text="Z an der Fläche" wert={g.zStart} setze={setze} />
          <Feld name="tiefe" text="Gravurtiefe" wert={g.tiefe} setze={setze} schritt="0.05" />
          <Feld name="schnitte" text="Schnitte" wert={g.schnitte} setze={setze} schritt="1" />
          <Feld name="vorschub" text="Vorschub mm/min" wert={g.vorschub} setze={setze} schritt="1" />
          <Feld name="drehzahl" text="Drehzahl Stichel" wert={g.drehzahl} setze={setze} schritt="100" />
          <Feld name="eilgang" text="Abhebehöhe" wert={g.eilgang} setze={setze} schritt="0.5" />
          <label className="feld"><span>Werkzeug</span>
            <select data-grav="art" value={g.art} onChange={(e) => setze("art", e.target.value)}>
              <option value="stichel">Gravierstichel, auf der Linie</option>
              <option value="fraeser">Schaftfräser, versetzt</option>
            </select></label>
          <Feld name="werkzeug" text={fraeser ? "Fräser Ø" : "Stichelspitze Ø"} wert={g.werkzeug} setze={setze} schritt="0.05" />
          {fraeser && <div className="feld"><span className="feldlabel">Fräsen</span>
            <label className="schalter schalter--eng"><input type="checkbox" data-grav="ausraeumen" checked={g.ausraeumen}
              onChange={(e) => setze("ausraeumen", e.target.checked)} /><span>Buchstaben ausräumen</span></label></div>}
          <Feld name="glaetten" text="Glättung in mm" wert={g.glaetten} setze={setze} schritt="0.005" />
        </div>
      </div>

      <p className="klein">Die Umrisse werden aus der gewählten Schrift abgetastet, darum steht jede Schrift zur
        Verfügung, die auf diesem Rechner installiert ist. {fraeser
          ? "Die Bahn ist um den Fräserradius nach innen versetzt, damit die Buchstaben ihre Kontur behalten."
          : "Gefahren wird auf der Kontur, nicht versetzt — mit einem Gravierstichel ist das richtig."} X ist im
        Durchmesser programmiert. {mantel
          ? "Auf dem Mantel läuft die Breite über den Umfang, C ist der Winkel."
          : "Auf der Stirnseite sind X und C wie X und Y zu lesen."} Grössere Glättung bedeutet weniger Zeilen,
        aber eckigere Rundungen.</p>
      {zuDick && <p className="karte karte--fehler cax-warnung">Der Fräser ist zu dick: die dünnste Stelle der
        Schrift misst etwa {duenn.toFixed(2)} mm, der Fräser Ø{g.werkzeug.toFixed(2)} mm. Dort bleibt nichts
        stehen. Kleineres Werkzeug, grössere Zeichenhöhe oder eine fettere Schrift wählen.</p>}
      <KopfFelder geaendert={() => setKopfStand((n) => n + 1)} />
      <pre className="gcode">{gcode}</pre>
      <button className="knopf knopf--klein" id="grav-kopieren" onClick={kopieren}>G-Code kopieren</button>
    </div>
  );
}

// ---------- Zeichnung ----------

function Bild({ roh, zuege, werkzeug, schritt }) {
  const { breite, hoehe } = roh;
  // Massstab und alle Punkte hintereinander, damit sich das Werkzeug
  // durchschieben lässt
  const fest = useMemo(() => {
    const rand = Math.max(breite, hoehe) * 0.12 + 1;
    const s2 = Math.min(400 / (breite + rand * 2), 170 / (hoehe + rand * 2));
    const p = ([x, y]) => (200 + x * s2).toFixed(1) + "," + (90 - y * s2).toFixed(1);
    const alle = [];
    zuege.forEach((z, nr) => z.forEach((q) => alle.push({ p: q, zug: nr })));
    const umrisse = zuege.map((z, nr) => <polygon key={nr} points={z.map(p).join(" ")} className="grav-zug" />);
    return { s2, p, alle, umrisse };
  }, [zuege, breite, hoehe]);

  if (!zuege.length) {
    return (
      <svg viewBox="0 0 400 200" className="cax-bild" id="grav-bild">
        <text x="200" y="100" textAnchor="middle" className="cax-text">Kein Text</text></svg>
    );
  }

  const { s2, p, alle } = fest;
  const i = Math.min(alle.length - 1, Math.max(0, Math.round(schritt * (alle.length - 1))));
  const jetzt = alle[i];
  const rW = Math.max(1.5, (werkzeug / 2) * s2);

  // Schon gefahren: ganze Züge davor, im laufenden bis hierher
  let gezaehlt = 0;
  const gefahren = zuege.map((z, nr) => {
    const start = gezaehlt;
    gezaehlt += z.length;
    if (nr > jetzt.zug) return null;
    const bis = nr < jetzt.zug ? z.length : (i - start + 1);
    if (bis < 2) return null;
    return <polyline key={nr} points={z.slice(0, bis).map(p).join(" ")} className="grav-gefahren" />;
  });

  return (
    <svg viewBox="0 0 400 200" className="cax-bild" id="grav-bild">
      {fest.umrisse}
      {gefahren}
      <circle cx={(200 + jetzt.p[0] * s2).toFixed(1)} cy={(90 - jetzt.p[1] * s2).toFixed(1)} r={rW.toFixed(1)}
        className="grav-werkzeug" />
      <text x="200" y="192" textAnchor="middle" className="cax-legende">
        {breite.toFixed(2)} × {hoehe.toFixed(2)} mm · {zuege.length} Züge</text>
    </svg>
  );
}
