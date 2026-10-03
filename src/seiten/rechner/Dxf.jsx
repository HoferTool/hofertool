// =================================================================
//  RECHNER → DXF
//  Eine DXF-Datei aus dem CAD einlesen, eine Kontur wählen (im Feld
//  oder direkt im Bild), Grösse und Seite festlegen, G-Code abholen.
//  Gerechnet wird in dxf.js.
// =================================================================
import { useEffect, useMemo, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { KopfFelder } from "./kopf.jsx";
import { DXF_VORGABE, dxfLesen, dxfSkalieren, dxfMasse, dxfBahn, dxfGcode } from "./dxf.js";

// Bleibt beim Wechsel auf einen anderen Reiter stehen, samt Datei
const gemerkt = { ...DXF_VORGABE, name: "", roh: [], gewaehlt: -1 };

// Zahlenfeld, das erst beim Verlassen oder mit Enter meldet
function FeldInnen({ name, id, text, wert, anzeige, setze, schritt, min, hinweis }) {
  const [eingabe, setEingabe] = useState(anzeige !== undefined ? anzeige : String(wert));
  const melden = () => setze(name, Number(eingabe));
  return (
    <label className="feld"><span>{text}</span>
      <input type="number" data-dxf={id ? undefined : name} id={id} step={schritt || "0.1"} min={min} value={eingabe}
        onChange={(e) => setEingabe(e.target.value)} onBlur={melden}
        onKeyDown={(e) => { if (e.key === "Enter") melden(); }} />
      {hinweis && <span className="feldhinweis">{hinweis}</span>}</label>
  );
}
const Feld = (p) => <FeldInnen key={p.name + "|" + (p.anzeige !== undefined ? p.anzeige : p.wert)} {...p} />;

export default function Dxf() {
  const [d, setD] = useState(gemerkt);
  const [schritt, setSchritt] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  const [kopfStand, setKopfStand] = useState(0);

  const aendern = (neu) => {
    const ganz = { ...d, ...neu };
    Object.assign(gemerkt, ganz);
    setD(ganz);
    setLaeuft(false);
    setSchritt(0);
  };

  useEffect(() => {
    if (!laeuft) return undefined;
    let bild = requestAnimationFrame(function weiter() {
      setSchritt((s) => (s + 0.004 > 1 ? 0 : s + 0.004));
      bild = requestAnimationFrame(weiter);
    });
    return () => cancelAnimationFrame(bild);
  }, [laeuft]);

  const konturen = useMemo(() => dxfSkalieren(d.roh, d.massstab), [d.roh, d.massstab]);
  const kontur = konturen[d.gewaehlt];
  const bahn = useMemo(() => dxfBahn(d, kontur), [d, kontur]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gcode = useMemo(() => dxfGcode(d, d.name, bahn), [d, bahn, kopfStand]);
  const bezug = dxfMasse(konturen, d.gewaehlt >= 0 ? d.gewaehlt : undefined) || { breite: 0 };

  const setze = (name, wert) => {
    if (name === "massstab") aendern({ massstab: Math.max(1, wert || 100) });
    else aendern({ [name]: wert });
  };

  // Statt am Massstab zu drehen, lässt sich die Breite direkt setzen
  const breiteSetzen = (name, soll) => {
    if (!bezug.breite || !soll || soll <= 0) return;
    aendern({ massstab: Math.max(1, (d.massstab * soll) / bezug.breite) });
  };

  const dateiLesen = async (e) => {
    const datei = (e.target.files || [])[0];
    if (!datei) return;
    try {
      const roh = dxfLesen(await datei.text(), d.glaetten);
      aendern({ roh, massstab: 100, name: datei.name, gewaehlt: roh.length ? 0 : -1 });
      if (!roh.length) {
        alt.meldung("In dieser Datei sind keine brauchbaren Konturen. Linien, Bögen, Kreise und Polylinien werden gelesen.", "warn");
      } else {
        alt.meldung(roh.length + " Konturen gelesen.");
      }
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    // Dieselbe Datei soll sich nach einer Änderung erneut wählen lassen
    e.target.value = "";
  };

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(gcode);
      alt.meldung("G-Code kopiert.");
    } catch (f) { alt.meldung("Kopieren ging nicht. Bitte von Hand markieren.", "warn"); }
  };

  return (
    <div className="karte">
      <div className="dxf-kopf">
        <label className="knopf knopf--klein bildknopf">DXF wählen
          <input type="file" id="dxf-datei" accept=".dxf,text/plain" hidden onChange={dateiLesen} /></label>
        <span className="klein">{d.name
          ? d.name + " · " + konturen.length + " Konturen"
          : "Aus dem CAD als DXF speichern, Linien, Bögen, Kreise und Polylinien"}</span>
      </div>

      <div className="cax-raster dxf-raster">
        <div className="cax-bildfeld">
          <Bild konturen={konturen} gewaehlt={d.gewaehlt} bahn={bahn} fraeser={d.fraeser} schritt={schritt}
            waehlen={(i) => aendern({ gewaehlt: i })} />
          {bahn && <div className="dxf-steuer">
            <button className="knopf knopf--klein" id="dxf-los" onClick={() => setLaeuft((l) => !l)}>
              {laeuft ? "Halt" : "Ablauf zeigen"}</button>
            <input type="range" id="dxf-schieber" min="0" max="1000" value={Math.round(schritt * 1000)}
              onChange={(e) => setSchritt(Number(e.target.value) / 1000)} />
          </div>}
        </div>
        <div className="cax-felder">
          {konturen.length > 0 && <>
            <Feld name="massstab" text="Massstab in Prozent" wert={d.massstab} anzeige={d.massstab.toFixed(1)}
              setze={setze} schritt="1" min="1" />
            <Feld name="zielbreite" id="dxf-zielbreite" text="oder Breite in mm" wert={bezug.breite}
              anzeige={bezug.breite.toFixed(2)} setze={breiteSetzen} hinweis="setzt den Massstab passend" />
            <label className="feld"><span>Kontur</span>
              <select data-dxf="gewaehlt" value={d.gewaehlt} onChange={(e) => aendern({ gewaehlt: Number(e.target.value) })}>
                <option value="-1">— wählen —</option>
                {konturen.map((k, i) => (
                  <option key={i} value={i}>Kontur {i + 1} · {k.punkte.length} Punkte{k.geschlossen ? "" : " · offen"}</option>
                ))}
              </select></label>
          </>}
          <label className="feld"><span>Seite</span>
            <select data-dxf="seite" value={d.seite} onChange={(e) => aendern({ seite: e.target.value })}>
              <option value="aussen">Aussen herum</option>
              <option value="innen">Innen, als Tasche</option>
            </select></label>
          <Feld name="fraeser" text="Fräserdurchmesser" wert={d.fraeser} setze={setze} />
          <Feld name="tiefeZ" text="Frästiefe in Z" wert={d.tiefeZ} setze={setze} />
          <Feld name="zustellung" text="Zustellung je Schnitt" wert={d.zustellung} setze={setze} />
          <Feld name="zStart" text="Z an der Fläche" wert={d.zStart} setze={setze} />
          <Feld name="sicher" text="Sicherheitsabstand" wert={d.sicher} setze={setze} />
          <Feld name="vorschub" text="Vorschub mm/min" wert={d.vorschub} setze={setze} schritt="1" />
          <Feld name="drehzahl" text="Drehzahl Fräser" wert={d.drehzahl} setze={setze} schritt="50" />
          <Feld name="glaetten" text="Glättung in mm" wert={d.glaetten} setze={setze} schritt="0.005" />
        </div>
      </div>

      <Masse konturen={konturen} gewaehlt={d.gewaehlt} bahn={bahn} />
      <p className="klein">Blau sind die Konturen aus der Datei, rot ist die Bahn der Fräsermitte. Eine Kontur lässt
        sich auch direkt im Bild antippen. X ist im Durchmesser programmiert, C entspricht Y.</p>
      <KopfFelder geaendert={() => setKopfStand((n) => n + 1)} />
      <pre className="gcode">{gcode}</pre>
      <button className="knopf knopf--klein" id="dxf-kopieren" onClick={kopieren}>G-Code kopieren</button>
    </div>
  );
}

function Masse({ konturen, gewaehlt, bahn }) {
  const ganz = dxfMasse(konturen);
  if (!ganz) return null;
  const eine = dxfMasse(konturen, gewaehlt >= 0 ? gewaehlt : undefined);
  let bm = "";
  if (bahn) {
    let a = Infinity, b = -Infinity, c = Infinity, e = -Infinity;
    bahn.forEach(([x, y]) => { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); e = Math.max(e, y); });
    bm = " · Bahn " + (b - a).toFixed(2) + " × " + (e - c).toFixed(2) + " mm, grösster Durchmesser "
      + (2 * Math.max(...bahn.map((q) => Math.hypot(q[0], q[1])))).toFixed(2) + " mm";
  }
  return (
    <p className="dxf-masse">Zeichnung {ganz.breite.toFixed(2)} × {ganz.hoehe.toFixed(2)} mm
      {eine && gewaehlt >= 0 ? " · gewählte Kontur " + eine.breite.toFixed(2) + " × " + eine.hoehe.toFixed(2) + " mm" : ""}
      {bm}</p>
  );
}

// ---------- Zeichnung ----------

function Bild({ konturen, gewaehlt, bahn, fraeser, schritt, waehlen }) {
  const fest = useMemo(() => {
    if (!konturen.length) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    konturen.forEach((k) => k.punkte.forEach(([x, y]) => {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }));
    const rand = Math.max(maxX - minX, maxY - minY) * 0.1 + 1;
    const s = Math.min(460 / (maxX - minX + rand * 2), 320 / (maxY - minY + rand * 2));
    const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    const p = ([x, y]) => (230 + (x - mx) * s).toFixed(1) + "," + (160 - (y - my) * s).toFixed(1);
    return { s, mx, my, p };
  }, [konturen]);

  if (!fest) {
    return (
      <svg viewBox="0 0 460 320" className="cax-bild">
        <text x="230" y="160" textAnchor="middle" className="cax-text">Noch keine Datei geladen</text></svg>
    );
  }
  const { s, mx, my, p } = fest;

  // Der Fräser an seiner Stelle auf der Bahn
  let werkzeug = null;
  if (bahn) {
    const i = Math.min(bahn.length - 1, Math.max(0, Math.round(schritt * (bahn.length - 1))));
    const [x, y] = bahn[i];
    werkzeug = <>
      <circle cx={(230 + (x - mx) * s).toFixed(1)} cy={(160 - (y - my) * s).toFixed(1)}
        r={Math.max(3, (fraeser / 2) * s).toFixed(1)} className="dxf-fraeser" />
      <polyline points={bahn.slice(0, i + 1).map(p).join(" ")} className="dxf-gefahren" />
    </>;
  }

  return (
    <svg viewBox="0 0 460 320" className="cax-bild" id="dxf-bild">
      {konturen.map((k, i) => (
        <polyline key={i} points={k.punkte.map(p).join(" ")} data-dxfk={i}
          className={"dxf-kontur" + (i === gewaehlt ? " dxf-kontur--an" : "")} onClick={() => waehlen(i)} />
      ))}
      {bahn && <polygon points={bahn.map(p).join(" ")} className="dxf-bahn" />}
      {werkzeug}
    </svg>
  );
}
