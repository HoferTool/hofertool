// =================================================================
//  HOFER-NC-PRO → ENTGRATEN
//  Seit 1.385.0 (Wunsch Patrick 4. November 2026). Die Kanten kommen
//  aus der Bearbeitung im Reiter Bohren / Fräsen; im 3D-Bild oder in
//  der Liste wählt man, welche entgratet werden. Werkzeug (Kugel,
//  Kopier, Zentrier), Front oder Quer, Haupt- oder Gegenspindel je mit
//  oder ohne Y-Achse, Fase in der Breite oder Tiefe. Gerechnet wird in
//  entgraten.js.
// =================================================================
import { useMemo, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { KopfFelder } from "./kopf.jsx";
import { ARTEN } from "./bohren.js";
import { Antrieb, antriebLaden, bfAktuell, bfSetzen } from "./BohrenFraesen.jsx";
import { EG_VORGABE, WERKZEUGE, egBahnen, egGcode, egPruefen, faseMasse } from "./entgraten.js";
import { NcAblage, NcStand } from "./NcAblage.jsx";

const gemerkt = { ...EG_VORGABE };
let gespeichertEg = null;

function FeldInnen({ name, text, wert, setze, schritt }) {
  const [eingabe, setEingabe] = useState(String(wert));
  const melden = () => setze(name, Number(String(eingabe).replace(",", ".")));
  return (
    <label className="feld"><span>{text}</span>
      <input type="number" data-eg={name} step={schritt || "0.1"} value={eingabe}
        onChange={(e) => setEingabe(e.target.value)} onBlur={melden}
        onKeyDown={(e) => { if (e.key === "Enter") melden(); }} /></label>
  );
}
const Feld = (p) => <FeldInnen key={p.name + "|" + p.wert} {...p} />;

export default function Entgraten() {
  antriebLaden();
  const [b, setB] = useState(bfAktuell);
  const [g, setG] = useState(gemerkt);
  const [stand, setStand] = useState(0);
  const [gespeichert, setGespeichertRoh] = useState(gespeichertEg);
  const setGespeichert = (z) => { gespeichertEg = z; setGespeichertRoh(z); };
  const aendern = (neu) => { const ganz = { ...g, ...neu }; Object.assign(gemerkt, ganz); setG(ganz); };
  const setze = (name, wert) => aendern({ [name]: wert });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { bahnen, kanten } = useMemo(() => egBahnen(b, g), [b, g]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gcode = useMemo(() => egGcode(b, g), [b, g, stand]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const warnungen = useMemo(() => egPruefen(b, g).liste, [b, g, stand]);
  const istGewaehlt = (id) => !g.wahl || g.wahl.includes(id);
  const umschalten = (id) => {
    const jetzt = g.wahl || kanten.map((k) => k.id);
    const neu = jetzt.includes(id) ? jetzt.filter((x) => x !== id) : [...jetzt, id];
    aendern({ wahl: neu.length === kanten.length ? null : neu });
  };
  const yKey = g.spindel === "gegen" ? "yGegen" : "yHaupt";
  const fm = faseMasse(g);
  const artName = (ARTEN.find(([k]) => k === b.art) || [, b.art])[1];

  const kopieren = async () => {
    try { await navigator.clipboard.writeText(gcode); alt.meldung("NC-Code kopiert."); }
    catch (f) { alt.meldung("Kopieren ging nicht. Bitte von Hand markieren.", "warn"); }
  };

  return (
    <div className="karte">
      <div className="karte__kopf"><h2>Entgraten</h2>
        <NcAblage art="entgraten" kurz="eg" wort="Entgraten" daten={{ bohren: b, entgraten: g }} nc={gcode}
          laden={(d) => {
            if (d.bohren) { bfSetzen(d.bohren); setB(bfAktuell()); }
            const ganz = { ...EG_VORGABE, ...(d.entgraten || {}) }; Object.assign(gemerkt, ganz); setG(ganz);
          }}
          gespeichert={gespeichert} setGespeichert={setGespeichert} /></div>
      <p className="klein" id="eg-quelle">Kanten aus <b>Bohren / Fräsen: {artName}</b> (Teil-Ø {b.teilD}).
        Andere Bohrung oder Nut dort einstellen. Kanten aus STEP-Dateien kommen später dazu.</p>

      <div className="eg-wahl">
      <div className="moduswahl" id="eg-werkzeuge">
        {WERKZEUGE.map(([w, t]) => (
          <button key={w} type="button" className={"moduswahl__knopf" + (g.werkzeug === w ? " aktiv" : "")}
            data-egwz={w} onClick={() => aendern({ werkzeug: w })}>{t}</button>
        ))}
      </div>
      <div className="moduswahl" id="eg-richtung">
        {[["front", "Frontwerkzeug"], ["quer", "Querwerkzeug"]].map(([w, t]) => (
          <button key={w} type="button" className={"moduswahl__knopf" + (g.richtung === w ? " aktiv" : "")}
            data-egri={w} onClick={() => aendern({ richtung: w })}>{t}</button>
        ))}
      </div>
      </div>

      <div className="cax-raster eg-raster">
        <div className="eg-links">
          <Bild3D b={b} kanten={kanten} bahnen={bahnen} istGewaehlt={istGewaehlt} umschalten={umschalten} />
          <div className="eg-liste" id="eg-liste">
            <div className="eg-liste__kopf"><b>Kanten</b>
              <button className="linkknopf" id="eg-alle" onClick={() => aendern({ wahl: null })}>Alle</button>
              <button className="linkknopf" id="eg-keine" onClick={() => aendern({ wahl: [] })}>Keine</button></div>
            {kanten.length === 0 && <p className="klein">Keine Kanten. In Bohren / Fräsen eine Bearbeitung einstellen.</p>}
            {kanten.map((k) => (
              <label key={k.id} className="eg-kante-zeile">
                <input type="checkbox" data-egkante={k.id} checked={istGewaehlt(k.id)} onChange={() => umschalten(k.id)} /> {k.name}
              </label>
            ))}
          </div>
        </div>
        <div className="cax-felder">
          <label className="feld"><span>Spindel</span>
            <select data-eg="spindel" value={g.spindel} onChange={(e) => setze("spindel", e.target.value)}>
              <option value="haupt">Hauptspindel</option>
              <option value="gegen">Gegenspindel (Rückseite)</option>
            </select></label>
          <label className="feld"><span>Y-Achse</span>
            <select data-eg="y" value={g[yKey] ? "ja" : "nein"} onChange={(e) => setze(yKey, e.target.value === "ja")}>
              <option value="nein">Ohne Y-Achse</option>
              <option value="ja">Mit Y-Achse</option>
            </select></label>
          {g.werkzeug === "kopier"
            ? <Feld name="radius" text="Schneidenradius R" wert={g.radius} setze={setze} schritt="0.05" />
            : <Feld name="durchmesser" text={g.werkzeug === "kugel" ? "Kugel-Ø" : "Grösster Ø des Fräsers"} wert={g.durchmesser} setze={setze} />}
          {g.werkzeug === "zentrier" && <>
            <Feld name="winkel" text="Spitzenwinkel °" wert={g.winkel} setze={setze} schritt="1" />
            <label className="feld"><span>Fase gemessen in</span>
              <select data-eg="fasenArt" value={g.fasenArt} onChange={(e) => setze("fasenArt", e.target.value)}>
                <option value="breite">Breite (auf der Fläche)</option>
                <option value="tiefe">Tiefe (in die Bohrung / Nut)</option>
              </select></label>
          </>}
          <Feld name="fase" text={g.werkzeug === "zentrier" ? (g.fasenArt === "tiefe" ? "Fase Tiefe" : "Fase Breite") : "Fase (Breite = Tiefe)"} wert={g.fase} setze={setze} schritt="0.05" />
          {g.werkzeug === "zentrier" && <Feld name="spitze" text="Spitze unter der Fase (entlang Kante)" wert={g.spitze} setze={setze} schritt="0.05" />}
          <Feld name="sicher" text="Sicherheitsabstand" wert={g.sicher} setze={setze} />
          <Feld name="drehzahl" text="Drehzahl Werkzeug" wert={g.drehzahl} setze={setze} schritt="100" />
          <Feld name="vorschub" text="Vorschub mm/min" wert={g.vorschub} setze={setze} schritt="1" />
          <Feld name="vorschubZ" text="Vorschub Anfahren mm/min" wert={g.vorschubZ} setze={setze} schritt="1" />
          <p className="klein" id="eg-fase">Fase {fm.breite.toFixed(2)} breit × {fm.tiefe.toFixed(2)} tief.</p>
        </div>
      </div>

      <p className="klein">Programmiert ist die Spitze des Werkzeugs, X im Durchmesser.
        {g.richtung === "front" && !g[yKey] ? " Frontwerkzeug ohne Y fährt mit Polarinterpolation G12.1 (X und C als Ebene)." : ""}
        {g.richtung === "quer" && !g[yKey] ? " Querwerkzeug ohne Y: das Teil dreht in C mit, das Werkzeug zeigt immer zur Mitte." : ""}
        {g[yKey] ? " Mit Y-Achse steht C je Kante fest, gefahren wird in X, Y und Z." : ""}
        {g.spindel === "gegen" ? " Gegenspindel: Z wie im Reiter Bohren / Fräsen, Achsnamen je nach Maschine anpassen." : ""}
        {" "}<strong>Vor dem ersten Einsatz an der Maschine im Einzelsatz prüfen.</strong></p>
      {warnungen.map((t) => <p key={t} className="karte karte--fehler cax-warnung eg-warnung">{t}</p>)}

      <Antrieb geaendert={() => setStand((n) => n + 1)} />
      <KopfFelder geaendert={() => setStand((n) => n + 1)} />
      <pre className="gcode" id="eg-code">{gcode}</pre>
      <NcStand kurz="eg" gespeichert={gespeichert} nc={gcode} />
      <button className="knopf knopf--klein" id="eg-kopieren" onClick={kopieren}>NC-Code kopieren</button>
    </div>
  );
}

// ---------- 3D-Bild ----------
// Drahtmodell ohne Bibliothek: Teil als Zylinder, die Kanten blau,
// gewählte orange, die Bahn der Werkzeugspitze grün gestrichelt.
// Ziehen dreht, Mausrad zoomt, eine Kante antippen wählt sie.
function Bild3D({ b, kanten, bahnen, istGewaehlt, umschalten }) {
  const [dreh, setDreh] = useState({ a: 0.5, b: -0.6 });
  const [zoom, setZoom] = useState(1);
  const ziehen = useRef(null);
  const R = Math.max(0.5, b.teilD / 2);
  // Wie weit das Teil nach hinten gezeichnet wird
  const tief = useMemo(() => {
    let t = 0;
    kanten.forEach((k) => k.punkte.forEach((p) => { t = Math.max(t, b.zStirn - p.E[2]); }));
    return Math.max(t * 1.3 + 2, b.teilD * 0.8, 6);
  }, [kanten, b.zStirn, b.teilD]);
  const zm = b.zStirn - tief / 2;
  const proj = (p) => {
    const ca = Math.cos(dreh.a), sa = Math.sin(dreh.a), cb = Math.cos(dreh.b), sb = Math.sin(dreh.b);
    const x1 = p[0] * ca - p[1] * sa, y1 = p[0] * sa + p[1] * ca, z = p[2] - zm;
    return [z * cb + y1 * sb, -x1];
  };
  const linie = (pts, zu) => {
    const t = pts.map((p, i) => { const [x, y] = proj(p); return (i ? "L" : "M") + x.toFixed(3) + " " + y.toFixed(3); }).join("");
    return zu ? t + "Z" : t;
  };
  const kreis = (zz) => {
    const pts = [];
    for (let i = 0; i < 64; i++) { const f = (2 * Math.PI * i) / 64; pts.push([R * Math.cos(f), R * Math.sin(f), zz]); }
    return linie(pts, true);
  };
  const umriss = [-dreh.a, Math.PI - dreh.a].map((f) => linie([[R * Math.cos(f), R * Math.sin(f), b.zStirn], [R * Math.cos(f), R * Math.sin(f), b.zStirn - tief]]));
  const gross = Math.hypot(tief, b.teilD) * 0.62 / zoom;
  const box = `${-gross * 1.4} ${-gross} ${gross * 2.8} ${gross * 2}`;
  return (
    <div className="eg-3d">
      <svg className="eg-3d__bild" viewBox={box} id="eg-3d"
        onPointerDown={(e) => { ziehen.current = { x: e.clientX, y: e.clientY, d: dreh, weit: 0 }; }}
        onPointerMove={(e) => {
          const z = ziehen.current; if (!z) return;
          const dx = e.clientX - z.x, dy = e.clientY - z.y;
          z.weit = Math.max(z.weit, Math.abs(dx) + Math.abs(dy));
          if (z.weit > 4) { e.currentTarget.setPointerCapture?.(e.pointerId); setDreh({ a: z.d.a + dy * 0.01, b: Math.max(-1.6, Math.min(1.6, z.d.b - dx * 0.01)) }); }
        }}
        onPointerUp={() => { setTimeout(() => { ziehen.current = null; }, 0); }}
        onWheel={(e) => setZoom((z) => Math.max(0.4, Math.min(20, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))}>
        <path d={kreis(b.zStirn)} className="eg-teil" />
        <path d={kreis(b.zStirn - tief)} className="eg-teil eg-teil--hinten" />
        {umriss.map((d, i) => <path key={i} d={d} className="eg-teil" />)}
        <path d={linie([[0, 0, b.zStirn + 2], [0, 0, b.zStirn - tief - 2]])} className="eg-achse" />
        {kanten.map((k) => <path key={k.id} d={linie(k.punkte.map((p) => p.E), k.geschlossen)}
          className={"eg-kante" + (istGewaehlt(k.id) ? " gewaehlt" : "")} />)}
        {bahnen.map((bn, i) => <path key={"b" + i} d={linie(bn.spitzen, bn.geschlossen)} className="eg-bahn" />)}
        {kanten.map((k) => (
          <path key={"t" + k.id} d={linie(k.punkte.map((p) => p.E), k.geschlossen)} className="eg-treffer" data-eg3d={k.id}
            onClick={() => { if (ziehen.current && ziehen.current.weit > 4) return; umschalten(k.id); }}>
            <title>{k.name}</title></path>
        ))}
      </svg>
      <div className="kt-3d__knoepfe">
        <button className="knopf knopf--klein" onClick={() => setDreh({ a: 0, b: -1.5707 })}>Von vorne</button>
        <button className="knopf knopf--klein" onClick={() => setDreh({ a: 0, b: 0 })}>Von der Seite</button>
        <button className="knopf knopf--klein" onClick={() => { setDreh({ a: 0.5, b: -0.6 }); setZoom(1); }}>Schräg</button>
        <span className="klein">ziehen dreht, Mausrad zoomt, Kante antippen = wählen</span>
      </div>
    </div>
  );
}
