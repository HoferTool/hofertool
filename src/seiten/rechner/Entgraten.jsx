// =================================================================
//  HOFER-NC-PRO → ENTGRATEN
//  Seit 1.385.0 (Wunsch Patrick 4. November 2026). Die Kanten kommen
//  aus der Bearbeitung im Reiter Bohren / Fräsen; im 3D-Bild oder in
//  der Liste wählt man, welche entgratet werden. Werkzeug (Kugel,
//  Kopier, Zentrier), Front oder Quer, Haupt- oder Gegenspindel je mit
//  oder ohne Y-Achse, Fase in der Breite oder Tiefe. Gerechnet wird in
//  entgraten.js.
// =================================================================
import { ncMelden } from "./ncAktuell.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { KopfFelder } from "./kopf.jsx";
import { ARTEN } from "./bohren.js";
import { Antrieb, antriebLaden, bfAktuell, bfSetzen } from "./BohrenFraesen.jsx";
import { EG_VORGABE, WERKZEUGE, egBahnen, egGcode, egPruefen, faseMasse, zentrierOrt } from "./entgraten.js";
import { NcAblage, NcStand } from "./NcAblage.jsx";
import { kantenAusStep } from "./stepKanten.js";

// C-Drehung in der Simulation: dieselben Regeln wie im G-Code
const mitY = (g) => (g.spindel === "gegen" ? g.yGegen : g.yHaupt);
const grad = (w) => (w * Math.PI) / 180;

const gemerkt = { ...EG_VORGABE };
let gespeichertEg = null;
// Geladene STEP-Datei (seit 1.389.0): Name, Text (nur solange die App
// offen ist), Lage und die gefundenen Kanten
let stepZustand = null;

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
  const [st, setStRoh] = useState(stepZustand);
  const setSt = (z) => { stepZustand = z; setStRoh(z); };
  const [stLaedt, setStLaedt] = useState(false);
  const stepRechnen = (text, name, lage) => {
    setStLaedt(true);
    // kurz warten, damit „wird gelesen“ zu sehen ist; grosse Dateien brauchen eine Sekunde
    setTimeout(() => {
      let erg;
      try { erg = kantenAusStep(text, lage); } catch (f) { erg = { fehler: "Die STEP-Datei liess sich nicht lesen (" + (f.message || f) + ")." }; }
      setSt({ name, text, ...lage, erg });
      setStLaedt(false);
      aendern({ wahl: null, quelle: "step" });
    }, 30);
  };
  const stepB = useMemo(() => {
    const e = st && st.erg && !st.erg.fehler ? st.erg : null;
    return e ? { art: "step", teilD: e.teilD, zStirn: 0, laenge: e.laenge, draht: e.draht, step: { kanten: e.kanten, mitten: e.mitten } }
      : { art: "step", teilD: 20, zStirn: 0, step: null };
  }, [st]);
  const bE = g.quelle === "step" ? stepB : b;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { bahnen, kanten } = useMemo(() => egBahnen(bE, g), [bE, g]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gcode = useMemo(() => egGcode(bE, g), [bE, g, stand]);
  useEffect(() => { ncMelden("entgraten", gcode); }, [gcode]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const warnungen = useMemo(() => egPruefen(bE, g).liste, [bE, g, stand]);
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
        <NcAblage art="entgraten" kurz="eg" wort="Entgraten" daten={{ bohren: b, entgraten: g, step: st && st.erg && !st.erg.fehler
          ? { name: st.name, umdrehen: !!st.umdrehen, achse: st.achse || 0, erg: { ...st.erg, draht: undefined } } : null }} nc={gcode}
          laden={(d) => {
            if (d.bohren) { bfSetzen(d.bohren); setB(bfAktuell()); }
            if (d.step) setSt({ ...d.step, text: null });
            const ganz = { ...EG_VORGABE, ...(d.entgraten || {}) }; Object.assign(gemerkt, ganz); setG(ganz);
          }}
          gespeichert={gespeichert} setGespeichert={setGespeichert} /></div>
      <div className="eg-quelle">
        <span>Kanten aus</span>
        <div className="moduswahl" id="eg-quelle-wahl">
          {[["bohren", "Bohren / Fräsen"], ["step", "STEP-Datei"]].map(([w, t]) => (
            <button key={w} type="button" className={"moduswahl__knopf" + (g.quelle === w ? " aktiv" : "")}
              data-egquelle={w} onClick={() => aendern({ quelle: w, wahl: null })}>{t}</button>
          ))}
        </div>
        {g.quelle === "step" && <>
          <label className="knopf knopf--klein" data-ablegen>{st ? "Andere STEP-Datei …" : "STEP-Datei wählen …"}
            <input type="file" id="eg-step" accept=".stp,.step,.STP,.STEP" hidden onChange={async (e) => {
              const datei = e.target.files && e.target.files[0];
              e.target.value = "";
              if (!datei) return;
              const text = await datei.text();
              stepRechnen(text, datei.name.replace(/\.(stp|step)$/i, ""), { umdrehen: false, achse: 0 });
            }} /></label>
          {st && <label className="eg-haken"><input type="checkbox" id="eg-step-um" checked={!!st.umdrehen} disabled={!st.text}
            onChange={(e) => stepRechnen(st.text, st.name, { umdrehen: e.target.checked, achse: st.achse || 0 })} /> Andere Seite vorne</label>}
          {st && st.erg && st.erg.achsen > 1 && st.text && (
            <label className="eg-haken">Drehachse
              <select id="eg-step-achse" value={st.achse || 0} onChange={(e) => stepRechnen(st.text, st.name, { umdrehen: !!st.umdrehen, achse: Number(e.target.value) })}>
                {Array.from({ length: Math.min(st.erg.achsen, 6) }, (_, i) => <option key={i} value={i}>{i ? "Achse " + (i + 1) : "Hauptachse (gefunden)"}</option>)}
              </select></label>)}
        </>}
      </div>
      {g.quelle === "bohren"
        ? <p className="klein" id="eg-quelle">Kanten aus <b>Bohren / Fräsen: {artName}</b> (Teil-Ø {b.teilD}). Andere Bohrung oder Nut dort einstellen.</p>
        : <p className="klein" id="eg-quelle">{stLaedt ? "STEP-Datei wird gelesen …"
          : !st ? "STEP-Datei wählen (oder hierher ziehen). Die App sucht darin die scharfen Kanten von Bohrungen, Nuten und Flächen."
            : st.erg.fehler ? <span className="eg-fehler">{st.name}: {st.erg.fehler}</span>
              : <><b>{st.name}</b>: Teil-Ø {st.erg.teilD}, Länge {st.erg.laenge}, {st.erg.kanten.length} Kanten zum Entgraten.
                {" "}Weggelassen: {st.erg.weg.gedreht} Drehkanten (macht der Drehmeissel), {st.erg.weg.rund} Übergänge ohne Grat,
                {" "}{st.erg.weg.innen} Innenecken{st.erg.weg.abseits ? ", " + st.erg.weg.abseits + " von vorne und aussen nicht erreichbar (Rückseite: „Andere Seite vorne“)" : ""}.
                {!st.text && " Lage ändern: Datei nochmals wählen."}</>}</p>}

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
          <Bild3D b={bE} g={g} kanten={kanten} bahnen={bahnen} istGewaehlt={istGewaehlt} umschalten={umschalten}
            setWahl={(ids) => aendern({ wahl: ids })} />
          <div className="eg-liste" id="eg-liste">
            <div className="eg-liste__kopf"><b>Kanten</b>
              <button className="linkknopf" id="eg-alle" onClick={() => aendern({ wahl: null })}>Alle</button>
              <button className="linkknopf" id="eg-keine" onClick={() => aendern({ wahl: [] })}>Keine</button></div>
            {kanten.length === 0 && <p className="klein">{g.quelle === "step" ? "Keine Kanten. Oben eine STEP-Datei wählen." : "Keine Kanten. In Bohren / Fräsen eine Bearbeitung einstellen."}</p>}
            {kanten.map((k) => (
              <label key={k.id} className="eg-kante-zeile">
                <input type="checkbox" data-egkante={k.id} checked={istGewaehlt(k.id)} onChange={() => umschalten(k.id)} /> {k.name}
              </label>
            ))}
          </div>
        </div>
        <div className="eg-rechts">
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
          {g.werkzeug === "zentrier" && <>
            <label className="feld"><span>Fahren</span>
              <select data-eg="zentrierFahrt" value={g.zentrierFahrt || "auto"} onChange={(e) => setze("zentrierFahrt", e.target.value)}>
                <option value="auto">In der Mitte, wo es geht</option>
                <option value="kontur">Kontur abfahren (der Kante entlang)</option>
              </select></label>
            <Feld name="spitze" text="Spitze unter der Fase" wert={g.spitze} setze={setze} schritt="0.05" />
            <Feld name="ortD" text="Schneide-Ø an der Fasenoberkante" wert={Number((2 * (fm.breite + Math.max(0, g.spitze))).toFixed(3))}
              setze={(_, d) => setze("spitze", Math.max(0, Number((d / 2 - fm.breite).toFixed(3))))} schritt="0.1" />
          </>}
          <Feld name="sicher" text="Sicherheitsabstand" wert={g.sicher} setze={setze} />
          <Feld name="drehzahl" text="Drehzahl Werkzeug" wert={g.drehzahl} setze={setze} schritt="100" />
          <Feld name="vorschub" text="Vorschub mm/min" wert={g.vorschub} setze={setze} schritt="1" />
          <Feld name="vorschubZ" text="Vorschub Anfahren mm/min" wert={g.vorschubZ} setze={setze} schritt="1" />
          <p className="klein" id="eg-fase">Fase {fm.breite.toFixed(2)} breit × {fm.tiefe.toFixed(2)} tief.</p>
        </div>
        <Skizze g={g} setze={setze} />
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
function Bild3D({ b, g, kanten, bahnen, istGewaehlt, umschalten, setWahl }) {
  const [dreh, setDreh] = useState({ a: 0.5, b: -0.6 });
  // Rechteckauswahl (seit 1.527.0, Wunsch Patrick 13. November 2026: „alle
  // Kanten im Bereich vom Rechteck auswählen, den Rest nicht“): mit dem
  // Knopf „▭ Rechteck“ oder Shift + Ziehen zieht die Maus ein Rechteck statt
  // zu drehen. Gewählt sind danach genau die Kanten, die ganz im Rechteck
  // liegen. Der Knopf gilt auch für den Finger am iPad.
  const [rechteckModus, setRechteckModus] = useState(false);
  const [rechteck, setRechteck] = useState(null);
  const [zoom, setZoom] = useState(1);
  // Deckkraft des Modells (seit 1.390.0, Wunsch Patrick 4. November 2026:
  // „Transparenz vom 3D-Modell verstellen“), je Person gemerkt. Abgelegt
  // erst kurz nach dem letzten Schieben, nicht bei jedem Schritt.
  const [deckung, setDeckungRoh] = useState(() => {
    const w = Number(alt.einstellungWert?.("eg_deckung", "45"));
    return Number.isFinite(w) && w >= 0 && w <= 100 ? w : 45;
  });
  const deckWarten = useRef(null);
  const setDeckung = (w) => {
    setDeckungRoh(w);
    clearTimeout(deckWarten.current);
    deckWarten.current = setTimeout(() => alt.einstellungSetzenWert?.("eg_deckung", w), 600);
  };
  const deckStil = { opacity: deckung / 100 };
  const ziehen = useRef(null);
  // Mausrad zoomt nur das Bild: als eigener Zuhörer mit passive: false,
  // sonst rollt die Seite mit (Patrick 4. November 2026)
  const bildRef = useRef(null);
  useEffect(() => {
    const el = bildRef.current; if (!el) return undefined;
    const rad = (e) => { e.preventDefault(); setZoom((z) => Math.max(0.4, Math.min(20, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))); };
    el.addEventListener("wheel", rad, { passive: false });
    return () => el.removeEventListener("wheel", rad);
  }, []);
  const R = Math.max(0.5, b.teilD / 2);
  // Wie weit das Teil nach hinten gezeichnet wird
  const tief = useMemo(() => {
    if (b.laenge) return b.laenge + 1;
    let t = 0;
    kanten.forEach((k) => k.punkte.forEach((p) => { t = Math.max(t, b.zStirn - p.E[2]); }));
    return Math.max(t * 1.3 + 2, b.teilD * 0.8, 6);
  }, [kanten, b.zStirn, b.teilD, b.laenge]);
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
  const sim = useSimulation(bahnen, g);
  // Wie an der Maschine dreht in der Simulation das Teil (C-Achse), das
  // Werkzeug bleibt stehen: ohne Y liegt die Spitze immer auf der X-Achse
  // (G12.1 bzw. C folgt), mit Y steht C je Kante fest auf c0.
  const cLetzt = useRef(0);
  let cDreh = 0;
  if (sim.an && sim.jetzt) {
    const p = sim.jetzt.p;
    if (mitY(g)) cDreh = -grad(sim.jetzt.c0 || 0);
    else if (Math.hypot(p[0], p[1]) > 0.02) cDreh = -Math.atan2(p[1], p[0]);
    else cDreh = cLetzt.current;
    cLetzt.current = cDreh;
  }
  const cc = Math.cos(cDreh), cs = Math.sin(cDreh);
  const amTeil = (p) => [p[0] * cc - p[1] * cs, p[0] * cs + p[1] * cc, p[2]];
  const linieT = (pts, zu) => linie(pts.map(amTeil), zu);
  // Bildschirm x, y und Tiefe (gross = näher beim Betrachter), für das
  // Werkzeug als Körper
  const sicht = (p) => {
    const q = amTeil(p);
    const ca = Math.cos(dreh.a), sa = Math.sin(dreh.a), cb = Math.cos(dreh.b), sb = Math.sin(dreh.b);
    const x1 = q[0] * ca - q[1] * sa, y1 = q[0] * sa + q[1] * ca, z = q[2] - zm;
    return [z * cb + y1 * sb, -x1, y1 * cb - z * sb];
  };
  // Striche an der Stirn, damit man das Drehen des Teils sieht
  const marken = [];
  for (let i = 0; i < 12; i++) {
    const f = (2 * Math.PI * i) / 12, r0 = i === 0 ? R * 0.55 : R * 0.82;
    marken.push(linieT([[r0 * Math.cos(f), r0 * Math.sin(f), b.zStirn], [R * Math.cos(f), R * Math.sin(f), b.zStirn]]));
  }
  const cAnzeige = ((((-cDreh * 180) / Math.PI) % 360) + 360) % 360;
  const gross = Math.hypot(tief, b.teilD) * 0.62 / zoom;
  const box = `${-gross * 1.4} ${-gross} ${gross * 2.8} ${gross * 2}`;
  // Bildschirmpunkt in Einheiten des Bilds, damit das Rechteck mit den
  // gezeichneten Kanten vergleichbar ist, egal wie gezoomt
  const svgPunkt = (e) => {
    const el = bildRef.current, m = el?.getScreenCTM?.();
    if (!m) return [0, 0];
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [q.x, q.y];
  };
  const rechteckWaehlen = (a, c) => {
    const x0 = Math.min(a[0], c[0]), x1 = Math.max(a[0], c[0]), y0 = Math.min(a[1], c[1]), y1 = Math.max(a[1], c[1]);
    const drin = kanten.filter((k) => k.punkte.length && k.punkte.every((p) => {
      const [x, y] = proj(amTeil(p.E));
      return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    })).map((k) => k.id);
    setWahl?.(drin);
    alt.meldung?.(drin.length ? `${drin.length} ${drin.length === 1 ? "Kante" : "Kanten"} gewählt` : "Keine Kante ganz im Rechteck", drin.length ? "gut" : "warn");
  };
  return (
    <div className="eg-3d">
      <svg className="eg-3d__bild" viewBox={box} id="eg-3d"
        style={rechteckModus ? { touchAction: "none", cursor: "crosshair" } : undefined}
        onPointerDown={(e) => {
          const r = rechteckModus || e.shiftKey;
          ziehen.current = { x: e.clientX, y: e.clientY, d: dreh, weit: 0, r, a: r ? svgPunkt(e) : null };
        }}
        onPointerMove={(e) => {
          const z = ziehen.current; if (!z) return;
          const dx = e.clientX - z.x, dy = e.clientY - z.y;
          z.weit = Math.max(z.weit, Math.abs(dx) + Math.abs(dy));
          if (z.weit <= 4) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          if (z.r) { const p = svgPunkt(e); setRechteck({ x1: z.a[0], y1: z.a[1], x2: p[0], y2: p[1] }); }
          else setDreh({ a: z.d.a + dy * 0.01, b: Math.max(-1.6, Math.min(1.6, z.d.b - dx * 0.01)) });
        }}
        onPointerUp={(e) => {
          const z = ziehen.current;
          if (z && z.r && z.weit > 4) rechteckWaehlen(z.a, svgPunkt(e));
          setRechteck(null);
          setTimeout(() => { ziehen.current = null; }, 0);
        }}
        ref={bildRef}>
        {b.draht
          // STEP: das ganze Drahtmodell, dreht in der Simulation mit
          ? <path d={b.draht.map((pts) => linieT(pts)).join("")} className="eg-draht" id="eg-draht" style={deckStil} />
          : <g id="eg-teil" style={deckStil}>
            <path d={kreis(b.zStirn)} className="eg-teil" />
            <path d={kreis(b.zStirn - tief)} className="eg-teil eg-teil--hinten" />
            {umriss.map((d, i) => <path key={i} d={d} className="eg-teil" />)}
          </g>}
        {marken.map((d, i) => <path key={"m" + i} d={d} className={"eg-marke" + (i ? "" : " eg-marke--null")} />)}
        <path d={linie([[0, 0, b.zStirn + 2], [0, 0, b.zStirn - tief - 2]])} className="eg-achse" />
        {kanten.map((k) => <path key={k.id} d={linieT(k.punkte.map((p) => p.E), k.geschlossen)}
          className={"eg-kante" + (istGewaehlt(k.id) ? " gewaehlt" : "")} />)}
        {bahnen.map((bn, i) => <path key={"b" + i} d={linieT(bn.spitzen, bn.geschlossen)} className="eg-bahn" />)}
        {sim.an && sim.erledigt.map((pts, i) => pts.length > 1 && <path key={"e" + i} d={linieT(pts)} className="eg-bahn-fertig" />)}
        {sim.an && sim.jetzt && <WerkzeugBild sicht={sicht} g={g} spitze={sim.jetzt.p} achse={sim.jetzt.a} />}
        {kanten.map((k) => (
          <path key={"t" + k.id} d={linieT(k.punkte.map((p) => p.E), k.geschlossen)} className="eg-treffer" data-eg3d={k.id}
            onClick={() => { if (ziehen.current && (ziehen.current.weit > 4 || ziehen.current.r)) return; umschalten(k.id); }}>
            <title>{k.name}</title></path>
        ))}
        {rechteck && <rect className="eg-rechteck" id="eg-rechteck"
          x={Math.min(rechteck.x1, rechteck.x2)} y={Math.min(rechteck.y1, rechteck.y2)}
          width={Math.abs(rechteck.x2 - rechteck.x1)} height={Math.abs(rechteck.y2 - rechteck.y1)} />}
      </svg>
      <div className="kt-3d__knoepfe">
        <button className={"knopf knopf--klein" + (rechteckModus ? " eg-rechteck-an" : "")} id="eg-rechteck-knopf"
          title="Rechteck um Kanten ziehen: genau diese sind gewählt (auch Shift + Ziehen)"
          onClick={() => setRechteckModus((m) => !m)}>▭ Rechteck{rechteckModus ? " an" : ""}</button>
        <button className="knopf knopf--klein" onClick={() => setDreh({ a: 0, b: -1.5707 })}>Von vorne</button>
        <button className="knopf knopf--klein" onClick={() => setDreh({ a: 0, b: 0 })}>Von der Seite</button>
        <button className="knopf knopf--klein" onClick={() => { setDreh({ a: 0.5, b: -0.6 }); setZoom(1); }}>Schräg</button>
        <label className="eg-deckung klein" title="Wie kräftig das Modell gezeichnet wird">Modell
          <input type="range" id="eg-deckung" min="0" max="100" step="5" value={deckung}
            onChange={(e) => setDeckung(Number(e.target.value))} />
          <span>{deckung} %</span></label>
        <span className="klein">{rechteckModus ? "Rechteck um die Kanten ziehen = genau diese wählen" : "ziehen dreht, Shift + ziehen = Rechteck wählen, Mausrad zoomt, Kante antippen = wählen"}</span>
      </div>
      <SimLeiste sim={sim} c={cAnzeige} />
    </div>
  );
}

// ---------- Simulation ----------
// Das gewählte Werkzeug fährt die Bahnen der Spitze ab, mit dem
// eingestellten Vorschub (mal Tempo). Schon gefahrene Stücke werden rot.
function useSimulation(bahnen, g) {
  const [an, setAn] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [s, setS] = useState(0);
  const [tempo, setTempo] = useState(5);
  // Alle Bahnen hintereinander mit aufsummierter Länge
  const weg = useMemo(() => {
    const stuecke = [];
    let summe = 0;
    bahnen.forEach((bn, bi) => {
      const pk = bn.geschlossen ? [...bn.spitzen, bn.spitzen[0]] : bn.spitzen;
      const ak = bn.geschlossen ? [...bn.achsen, bn.achsen[0]] : bn.achsen;
      pk.forEach((p, i) => {
        if (i) { const q = pk[i - 1]; summe += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }
        stuecke.push({ p, a: ak[i] || [0, 0, 1], bahn: bi, c0: bn.c0, s: summe });
      });
    });
    return { stuecke, laenge: summe };
  }, [bahnen]);
  const uhr = useRef(null);
  useEffect(() => {
    if (!laeuft) return undefined;
    let zuletzt = performance.now();
    const schritt = (t) => {
      const dt = (t - zuletzt) / 1000; zuletzt = t;
      setS((alt) => {
        const neu = alt + dt * (Math.max(1, g.vorschub) / 60) * tempo;
        if (neu >= weg.laenge) { setLaeuft(false); return weg.laenge; }
        return neu;
      });
      uhr.current = requestAnimationFrame(schritt);
    };
    uhr.current = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(uhr.current);
  }, [laeuft, tempo, g.vorschub, weg.laenge]);
  useEffect(() => { setS((x) => Math.min(x, weg.laenge)); }, [weg.laenge]);

  // Stelle bei s: zwischen zwei Punkten derselben Bahn einpassen
  const st = weg.stuecke;
  let jetzt = null;
  const erledigt = [];
  if (st.length) {
    let i = 1;
    while (i < st.length && st[i].s < s) i++;
    const a = st[Math.min(i, st.length - 1) - 1] || st[0], b = st[Math.min(i, st.length - 1)];
    const f = b.s > a.s && b.bahn === a.bahn ? Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s))) : 1;
    const mix = (x, y) => [x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f];
    jetzt = { p: mix(a.p, b.p), a: b.bahn === a.bahn ? mix(a.a, b.a) : b.a, c0: b.c0 };
    st.forEach((x, k) => {
      if (k >= i) return;
      if (!erledigt[x.bahn]) erledigt[x.bahn] = [];
      erledigt[x.bahn].push(x.p);
    });
    if (erledigt[a.bahn] && b.bahn === a.bahn) erledigt[a.bahn].push(jetzt.p);
    if (s <= 0) jetzt = { p: st[0].p, a: st[0].a, c0: st[0].c0 };
  }
  return {
    an, laeuft, s, tempo, laenge: weg.laenge, jetzt, erledigt: erledigt.filter(Boolean),
    start: () => { setAn(true); if (s >= weg.laenge) setS(0); setLaeuft(true); },
    halt: () => setLaeuft(false),
    zurueck: () => { setLaeuft(false); setS(0); },
    aus: () => { setLaeuft(false); setAn(false); setS(0); },
    setzen: (x) => { setAn(true); setLaeuft(false); setS(x); },
    setTempo,
  };
}

function SimLeiste({ sim, c }) {
  if (!sim.laenge) return null;
  return (
    <div className="eg-sim" id="eg-sim">
      <b>Simulation</b>
      {sim.laeuft
        ? <button className="knopf knopf--klein" id="eg-sim-halt" onClick={sim.halt}>⏸ Anhalten</button>
        : <button className="knopf knopf--klein knopf--haupt" id="eg-sim-start" onClick={sim.start}>▶ {sim.an && sim.s > 0 && sim.s < sim.laenge ? "Weiter" : "Abspielen"}</button>}
      <button className="knopf knopf--klein" id="eg-sim-zurueck" onClick={sim.zurueck} title="An den Anfang">⏮</button>
      <input type="range" id="eg-sim-ort" min="0" max={sim.laenge} step={sim.laenge / 500 || 0.01} value={sim.s}
        onChange={(e) => sim.setzen(Number(e.target.value))} />
      <select id="eg-sim-tempo" value={sim.tempo} onChange={(e) => sim.setTempo(Number(e.target.value))} title="Tempo">
        {[1, 5, 20, 50].map((t) => <option key={t} value={t}>{t}×</option>)}
      </select>
      {sim.an && <span className="klein" id="eg-sim-c" title="Das Teil dreht, das Werkzeug bleibt stehen">C {c.toFixed(1)}°</span>}
      <span className="klein" id="eg-sim-stand">{sim.s.toFixed(1)} / {sim.laenge.toFixed(1)} mm</span>
      {sim.an && <button className="linkknopf" id="eg-sim-aus" onClick={sim.aus}>Ausblenden</button>}
    </div>
  );
}

// Werkzeug im 3D-Bild: Spitze am Bahnpunkt, Achse wie gerechnet.
// Kugel und Kopierfräser als Kugel mit Schaft, Zentrierfräser als Kegel.
function WerkzeugBild({ sicht, g, spitze, achse }) {
  // Seit 1.390.0 als Körper (Wunsch Patrick 4. November 2026: „das
  // Werkzeug 3-dimensional“): Drehkörper um die Werkzeugachse aus Ringen,
  // nur die zum Betrachter gewandten Flächen, hinten zuerst, hell und
  // dunkel nach dem Licht von vorne oben links.
  const zent = g.werkzeug === "zentrier";
  const R = zent ? g.durchmesser / 2 : (g.werkzeug === "kopier" ? g.radius : g.durchmesser / 2);
  if (!(R > 0)) return null;
  const tanH = Math.tan((Math.max(10, Math.min(170, g.winkel)) * Math.PI) / 360);
  const hKegel = zent ? R / tanH : R;          // bis zum vollen Ø bzw. Kugelmitte
  const L = Math.max(4 * R, 6);
  const la = Math.hypot(achse[0], achse[1], achse[2]) || 1;
  const a = achse.map((x) => x / la);
  // zwei Richtungen quer zur Achse
  const hilf = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const kreuz = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return v.map((x) => x / l); };
  const e1 = norm(kreuz(a, hilf)), e2 = kreuz(a, e1);
  // Profil von der Spitze nach oben: [Höhe entlang der Achse, Radius, schneidet]
  const profil = [];
  if (zent) { profil.push([0, 0, true], [hKegel, R, true]); }
  else for (let i = 0; i <= 8; i++) { const t = (Math.PI / 2) * (i / 8); profil.push([R - R * Math.cos(t), R * Math.sin(t), true]); }
  profil.push([hKegel, R, false], [hKegel + L, R, false]);
  const N = 28;
  const punkt = (h, r, f) => [0, 1, 2].map((k) => spitze[k] + a[k] * h + (e1[k] * Math.cos(f) + e2[k] * Math.sin(f)) * r);
  const s0 = sicht(spitze);
  const flaechen = [];
  const licht = norm([-0.35, -0.45, 1]);         // Bildschirm: links, oben, vorne
  const fuege = (pts, art) => {
    const q = pts.map(sicht);
    // Fläche im Bild: Normale aus zwei Kanten (Tiefe ist z)
    const u = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
    const v = [q[q.length - 1][0] - q[0][0], q[q.length - 1][1] - q[0][1], q[q.length - 1][2] - q[0][2]];
    let n = kreuz(u, v);
    const ln = Math.hypot(n[0], n[1], n[2]);
    if (ln < 1e-9) return;
    n = n.map((x) => x / ln);
    flaechen.push({ q, n, art, t: q.reduce((x, p) => x + p[2], 0) / q.length });
  };
  for (let j = 0; j + 1 < profil.length; j++) {
    const [h0, r0, sch] = profil[j], [h1, r1] = profil[j + 1];
    if (h0 === h1 && r0 === r1) continue;
    for (let i = 0; i < N; i++) {
      const f0 = (2 * Math.PI * i) / N, f1 = (2 * Math.PI * (i + 1)) / N;
      const pts = r0 < 1e-9
        ? [punkt(h0, 0, 0), punkt(h1, r1, f0), punkt(h1, r1, f1)]
        : [punkt(h0, r0, f0), punkt(h1, r1, f0), punkt(h1, r1, f1), punkt(h0, r0, f1)];
      fuege(pts, sch ? "schneide" : "schaft");
    }
  }
  // Deckel oben
  const deckel = [];
  for (let i = N; i > 0; i--) deckel.push(punkt(hKegel + L, R, (2 * Math.PI * i) / N));
  fuege(deckel, "schaft");
  // Richtung der Normalen nach aussen: Mitte des Körpers als Bezug
  const mitte = sicht(punkt(hKegel + L / 2, 0, 0));
  const sichtbar = flaechen.filter((fl) => {
    const c = fl.q.reduce((x, p) => [x[0] + p[0], x[1] + p[1], x[2] + p[2]], [0, 0, 0]).map((x) => x / fl.q.length);
    const aus = [c[0] - mitte[0], c[1] - mitte[1], c[2] - mitte[2]];
    if (aus[0] * fl.n[0] + aus[1] * fl.n[1] + aus[2] * fl.n[2] < 0) fl.n = fl.n.map((x) => -x);
    return fl.n[2] > -0.02;
  }).sort((x, y) => x.t - y.t);
  const farbe = (art, hell) => {
    const [r, gg, bb] = art === "schneide" ? [236, 160, 52] : [150, 160, 172];
    const k = 0.42 + 0.58 * hell;
    return `rgb(${Math.round(r * k)},${Math.round(gg * k)},${Math.round(bb * k)})`;
  };
  return (
    <g className="eg-wz" id="eg-sim-wz" pointerEvents="none">
      {sichtbar.map((fl, i) => {
        const hell = Math.max(0, fl.n[0] * licht[0] + fl.n[1] * licht[1] + fl.n[2] * licht[2]);
        const c = farbe(fl.art, hell);
        return <polygon key={i} points={fl.q.map((p) => p[0].toFixed(3) + "," + p[1].toFixed(3)).join(" ")}
          style={{ fill: c, stroke: c, strokeWidth: 0.6 }} vectorEffect="non-scaling-stroke" className={"eg-wz__" + fl.art} />;
      })}
      <circle cx={s0[0]} cy={s0[1]} r={Math.max(0.08, R * 0.12)} className="eg-wz__spitze" />
    </g>
  );
}

// ---------- Skizze: Werkzeug an der Fase ----------
// Schnitt quer zur Kante: Fläche A oben, Fläche B nach unten, die Fase
// dazwischen. Das Werkzeug steht so, wie die App es rechnet; der rote
// Punkt ist die programmierte Spitze. Masse in mm.
// Schieber: welche Stelle der Schneide die Fase macht, von ganz unten
// (nahe der Spitze) bis zum grössten Ø
function OrtRegler({ g, setze }) {
  const o = zentrierOrt(g);
  const min = Math.min(o.w + 0.01, o.rMax), max = Math.max(o.rMax, min);
  const mitte = g.zentrierFahrt !== "kontur";
  return (
    <div className="eg-ort" id="eg-ort">
      <span className="klein">Position an der Schneide: <b>Ø{(2 * o.r0).toFixed(2)}</b> oben bis <b>Ø{(2 * o.unten).toFixed(2)}</b> unten,
        Spitze {o.unten.toFixed(2)} unter der Fase</span>
      <div className="eg-ort__reihe"><span className="klein">Spitze</span>
        <input type="range" id="eg-ort-regler" min={min} max={max} step={(max - min) / 200 || 0.01} value={o.r0}
          onChange={(e) => setze("spitze", Number((Number(e.target.value) - o.w).toFixed(3)))} />
        <span className="klein">grösster Ø</span></div>
      {mitte && <span className="klein">Gilt beim Fahren der Kante entlang. Schmale Bohrungen und Nuten fährt er in der Mitte, dort ergibt sich die Stelle von selbst; für überall gleich „Kontur abfahren“ wählen.</span>}
    </div>
  );
}

function Skizze({ g, setze }) {
  const { breite: w, tiefe: t } = faseMasse(g);
  const zent = g.werkzeug === "zentrier";
  const R = zent ? g.durchmesser / 2 : (g.werkzeug === "kopier" ? g.radius : g.durchmesser / 2);
  if (!(R > 0) || !(w > 0)) return null;
  const tanH = Math.tan((Math.max(10, Math.min(170, g.winkel)) * Math.PI) / 360);
  const s = 60 / Math.max(R * 1.6, w * 3, t * 3);
  const Ex = 150, Ey = 128;                       // Kante in der Skizze
  const X = (x) => Ex + x * s, Y = (y) => Ey - y * s;   // y nach oben
  const A = [-w, 0], B = [0, -t];
  let werkzeug, spitze, rechts, masse = [];
  if (zent) {
    const r0 = zentrierOrt(g).r0;
    spitze = [r0 - w, -r0 / tanH];
    const hoch = R / tanH;
    const oben = spitze[1] + hoch;
    rechts = spitze[0] + R;
    werkzeug = <>
      <polygon className="eg-sk__wz" points={`${X(spitze[0])},${Y(spitze[1])} ${X(spitze[0] + R)},${Y(oben)} ${X(spitze[0] + R)},${Y(oben + R * 1.4)} ${X(spitze[0] - R)},${Y(oben + R * 1.4)} ${X(spitze[0] - R)},${Y(oben)}`} />
      <line className="eg-sk__achse" x1={X(spitze[0])} y1={Y(spitze[1] - 0.3 * R)} x2={X(spitze[0])} y2={Y(oben + R * 1.6)} />
    </>;
    masse.push(<text key="w" className="eg-sk__text" x={X(spitze[0]) + 8} y={Y(spitze[1]) + 2}>{g.winkel}°</text>);
    // genutzter Teil der Schneide: von Ø unten bis Ø oben an der Fase
    masse.push(<line key="sn" className="eg-sk__schneide" x1={X(A[0])} y1={Y(0)} x2={X(B[0])} y2={Y(B[1])} />);
    masse.push(<line key="om" className="eg-sk__mass eg-sk__hilf" x1={X(spitze[0])} y1={Y(0)} x2={X(-w)} y2={Y(0)} />);
    masse.push(<text key="od" className="eg-sk__text eg-sk__gruen" x={X(-w) - 6} y={Y(0) - 6} textAnchor="end" id="eg-sk-ort">Ø{(2 * r0).toFixed(2)} oben</text>);
    masse.push(<text key="d" className="eg-sk__text" x={X(spitze[0])} y={Y(oben + R * 1.4) - 5} textAnchor="middle">Ø{g.durchmesser}</text>);
  } else {
    // Kugel berührt die Fase in der Mitte, Mitte auf der Luftseite
    const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy);
    let n = [dy / l, -dx / l];
    if (n[0] * (0 - M[0]) + n[1] * (0 - M[1]) < 0) n = [-n[0], -n[1]];
    const C = [M[0] + n[0] * R, M[1] + n[1] * R];
    spitze = [C[0], C[1] - R];
    rechts = C[0] + R;
    werkzeug = <>
      <rect className="eg-sk__wz" x={X(C[0] - R)} y={Y(C[1] + R * 1.4)} width={2 * R * s} height={R * 1.4 * s} />
      <circle className="eg-sk__wz" cx={X(C[0])} cy={Y(C[1])} r={R * s} />
      <line className="eg-sk__achse" x1={X(C[0])} y1={Y(C[1] - R * 1.2)} x2={X(C[0])} y2={Y(C[1] + R * 1.6)} />
      <line className="eg-sk__mass" x1={X(C[0])} y1={Y(C[1])} x2={X(C[0] + R * 0.7071)} y2={Y(C[1] + R * 0.7071)} />
    </>;
    masse.push(<text key="r" className="eg-sk__text" x={X(C[0] + R * 0.75) + 3} y={Y(C[1] + R * 0.75)}>{g.werkzeug === "kopier" ? "R" + g.radius : "Ø" + g.durchmesser}</text>);
  }
  const xT = Math.min(232, Math.max(X(0) + 24, X(rechts) + 10));
  const mat = `${X(-6)},${Y(0)} ${X(A[0])},${Y(0)} ${X(B[0])},${Y(B[1])} ${X(0)},${Y(-6)} ${X(-6)},${Y(-6)}`;
  return (
    <>
    <svg viewBox="0 0 300 236" className="eg-skizze" id="eg-skizze">
      <text x="8" y="16" className="eg-sk__titel">Werkzeug an der Fase (Schnitt)</text>
      <polygon className="eg-sk__weg" points={`${X(A[0])},${Y(0)} ${X(0)},${Y(0)} ${X(B[0])},${Y(B[1])}`} />
      <polygon className="eg-sk__mat" points={mat} />
      <line className="eg-sk__fase" x1={X(A[0])} y1={Y(0)} x2={X(B[0])} y2={Y(B[1])} />
      {werkzeug}
      {/* Fasenmasse */}
      <line className="eg-sk__mass" x1={X(A[0])} y1={Y(0) + 0} x2={X(A[0])} y2={Y(-6) > 200 ? 200 : Y(0) + 40} />
      <line className="eg-sk__mass" x1={X(-w)} y1={Y(0) + 34} x2={X(0)} y2={Y(0) + 34} />
      <text className="eg-sk__text" x={X(-w) - 6} y={Y(0) + 38} textAnchor="end" id="eg-sk-breite">Breite {w.toFixed(2)}</text>
      <line className="eg-sk__mass" x1={xT} y1={Y(0)} x2={xT} y2={Y(-t)} />
      <line className="eg-sk__mass eg-sk__hilf" x1={X(0)} y1={Y(-t)} x2={xT} y2={Y(-t)} />
      <text className="eg-sk__text" x={xT + 4} y={Y(-t / 2) + 4} id="eg-sk-tiefe">Tiefe {t.toFixed(2)}</text>
      {masse}
      <circle className="eg-sk__spitze" cx={X(spitze[0])} cy={Y(spitze[1])} r="3.5" />
      {zent
        ? <text className="eg-sk__text eg-sk__rot" x={X(spitze[0])} y={Y(spitze[1]) + 18} textAnchor="middle">programmierter Punkt</text>
        : <text className="eg-sk__text eg-sk__rot" x={X(spitze[0]) - 8} y={Y(spitze[1]) - 6} textAnchor="end">programmierter Punkt</text>}
      <text className="eg-sk__klein" x="8" y="228">grau Werkstück · gelb Werkzeug · rot wird abgetragen</text>
    </svg>
    {zent && <OrtRegler g={g} setze={setze} />}
    </>
  );
}
