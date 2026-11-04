// =================================================================
//  HOFER-NC-PRO → BOHREN / FRÄSEN
//  Seit 1.384.0 (Wunsch Patrick 4. November 2026): Bohrungen und
//  einfache Fräsarbeiten mit angetriebenen Front- und Querwerkzeugen.
//  Links Stirn- und Seitenansicht, rechts die Masse, darunter der
//  NC-Code. Gerechnet wird in bohren.js; die Felder melden sich erst
//  beim Verlassen, wie bei der C-Achse.
// =================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { KopfFelder } from "./kopf.jsx";
import { NcAblage, NcStand } from "./NcAblage.jsx";
import {
  ARTEN, BF_VORGABE, ZYKLEN, antrieb, bfGcode, bfPruefen, cWinkel, flaecheBreite,
  frontLoecher, istFront, zLagen,
} from "./bohren.js";

const gemerkt = { ...BF_VORGABE };
// Für den Reiter Entgraten: er nimmt die Bearbeitung von hier
export const bfAktuell = () => ({ ...gemerkt });
export const bfSetzen = (neu) => Object.assign(gemerkt, { ...BF_VORGABE, ...neu });
let gespeichertBf = null;

// Befehle für den Werkzeugantrieb: je Person gemerkt wie der Vorspann
let antriebGeladen = false;
export function antriebLaden() {
  if (antriebGeladen) return;
  antriebGeladen = true;
  try {
    for (const k of Object.keys(antrieb)) antrieb[k] = alt.einstellungWert?.("bf" + k, "") || "";
  } catch (f) { /* ohne Einstellungen bleiben die Felder leer */ }
}

function FeldInnen({ name, text, wert, setze, schritt, art }) {
  const [eingabe, setEingabe] = useState(String(wert));
  const melden = () => setze(name, art === "text" ? eingabe : Number(String(eingabe).replace(",", ".")));
  return (
    <label className="feld"><span>{text}</span>
      <input type={art === "text" ? "text" : "number"} data-bf={name} step={schritt || "0.1"} value={eingabe}
        onChange={(e) => setEingabe(e.target.value)} onBlur={melden}
        onKeyDown={(e) => { if (e.key === "Enter") melden(); }} /></label>
  );
}
const Feld = (p) => <FeldInnen key={p.name + "|" + p.wert} {...p} />;

export default function BohrenFraesen() {
  antriebLaden();
  const [b, setB] = useState(gemerkt);
  const [stand, setStand] = useState(0);
  const aendern = (neu) => { const ganz = { ...b, ...neu }; Object.assign(gemerkt, ganz); setB(ganz); };
  const setze = (name, wert) => aendern({ [name]: wert });
  const [gespeichert, setGespeichertRoh] = useState(gespeichertBf);
  const setGespeichert = (z) => { gespeichertBf = z; setGespeichertRoh(z); };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gcode = useMemo(() => bfGcode(b), [b, stand]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const warnungen = useMemo(() => bfPruefen(b), [b, stand]);
  const bohren = b.art === "bohrenFront" || b.art === "bohrenQuer";
  const front = istFront(b.art);

  const kopieren = async () => {
    try { await navigator.clipboard.writeText(gcode); alt.meldung("NC-Code kopiert."); }
    catch (f) { alt.meldung("Kopieren ging nicht. Bitte von Hand markieren.", "warn"); }
  };

  return (
    <div className="karte">
      <div className="karte__kopf"><h2>Bohren / Fräsen</h2>
        <NcAblage art="bohren" kurz="bf" wort="Bohren / Fräsen" daten={b} nc={gcode}
          laden={(d) => { const ganz = { ...BF_VORGABE, ...d }; Object.assign(gemerkt, ganz); setB(ganz); }}
          gespeichert={gespeichert} setGespeichert={setGespeichert} /></div>
      <div className="moduswahl" id="bf-arten">
        {ARTEN.map(([w, t]) => (
          <button key={w} type="button" className={"moduswahl__knopf" + (b.art === w ? " aktiv" : "")}
            data-bfart={w} onClick={() => aendern({ art: w })}>{t}</button>
        ))}
      </div>
      <p className="klein bf-werkzeug">{front
        ? "Frontwerkzeug: arbeitet in Richtung Z auf die Stirnfläche."
        : "Querwerkzeug: arbeitet radial in Richtung X auf den Umfang."}</p>

      {bohren && (
        <div className="moduswahl bf-zyklen" id="bf-zyklen">
          {ZYKLEN.map(([w, t]) => (
            <button key={w} type="button" className={"moduswahl__knopf" + (b.zyklus === w ? " aktiv" : "")}
              data-bfzyklus={w} onClick={() => aendern({ zyklus: w })}>{t}</button>
          ))}
        </div>
      )}

      <div className="cax-raster bf-raster">
        <div className="cax-bildfeld bf-bilder">
          <Stirn b={b} />
          <Seite b={b} />
        </div>
        <div className="cax-felder">
          <Feld name="teilD" text="Teil-Ø" wert={b.teilD} setze={setze} />
          <Feld name="zStirn" text="Z an der Stirnfläche" wert={b.zStirn} setze={setze} />
          {b.art === "bohrenFront" && <>
            <Feld name="lochkreis" text="Lochkreis-Ø (0 = Mitte)" wert={b.lochkreis} setze={setze} />
            {b.lochkreis > 0 && <Feld name="anzahl" text="Anzahl Bohrungen" wert={b.anzahl} setze={setze} schritt="1" />}
          </>}
          {b.art === "bohrenQuer" && <>
            <Feld name="zPos" text="Z-Lagen (mehrere mit ;)" wert={b.zPos} setze={setze} art="text" />
            <Feld name="anzahl" text="Anzahl über den Umfang" wert={b.anzahl} setze={setze} schritt="1" />
          </>}
          {!(b.art === "bohrenFront" && !(b.lochkreis > 0))
            ? <Feld name="startC" text={b.art === "flaeche" ? "C der ersten Fläche" : bohren ? "C der ersten Bohrung" : "C der Nut"} wert={b.startC} setze={setze} schritt="1" />
            : null}
          {bohren && <>
            <Feld name="bohrD" text="Bohrer-Ø" wert={b.bohrD} setze={setze} />
            <Feld name="tiefe" text={b.art === "bohrenQuer" ? "Tiefe ab Umfang" : "Bohrtiefe"} wert={b.tiefe} setze={setze} />
            {b.zyklus === "tief" && <Feld name="q" text="Zustellung je Stoss" wert={b.q} setze={setze} />}
            {b.zyklus === "gewinde" && <Feld name="steigung" text="Steigung" wert={b.steigung} setze={setze} schritt="0.05" />}
            {b.zyklus !== "gewinde" && <Feld name="pause" text="Verweilen am Grund (s)" wert={b.pause} setze={setze} />}
          </>}
          {b.art === "nutFront" && <>
            <Feld name="nutLaenge" text="Länge (≥ Teil-Ø = durch)" wert={b.nutLaenge} setze={setze} />
            <Feld name="nutTiefe" text="Tiefe der Nut" wert={b.nutTiefe} setze={setze} />
          </>}
          {b.art === "nutQuer" && <>
            <Feld name="nutVon" text="Von Z (0 = offen)" wert={b.nutVon} setze={setze} />
            <Feld name="nutBis" text="Bis Z" wert={b.nutBis} setze={setze} />
            <Feld name="nutTiefe" text="Tiefe der Nut" wert={b.nutTiefe} setze={setze} />
          </>}
          {b.art === "flaeche" && <>
            <Feld name="sw" text="Schlüsselweite SW" wert={b.sw} setze={setze} />
            <Feld name="flaechen" text="Anzahl Flächen" wert={b.flaechen} setze={setze} schritt="1" />
            <Feld name="flVon" text="Von Z (0 = offen)" wert={b.flVon} setze={setze} />
            <Feld name="flBis" text="Bis Z" wert={b.flBis} setze={setze} />
            <label className="feld"><span>Y-Achse</span>
              <select data-bf="yAchse" value={b.yAchse ? "ja" : "nein"} onChange={(e) => setze("yAchse", e.target.value === "ja")}>
                <option value="nein">Ohne Y (ein Zug)</option>
                <option value="ja">Mit Y-Achse (Bahnen)</option>
              </select></label>
          </>}
          {!bohren && <>
            <Feld name="fraeser" text="Fräser-Ø" wert={b.fraeser} setze={setze} />
            <Feld name="zustellung" text="Zustellung je Schnitt" wert={b.zustellung} setze={setze} />
            <Feld name="vorschubZ" text="Vorschub Eintauchen mm/min" wert={b.vorschubZ} setze={setze} schritt="1" />
          </>}
          <Feld name="sicher" text="Sicherheitsabstand" wert={b.sicher} setze={setze} />
          <Feld name="drehzahl" text="Drehzahl Werkzeug" wert={b.drehzahl} setze={setze} schritt="50" />
          {!(bohren && b.zyklus === "gewinde") &&
            <Feld name="vorschub" text={bohren ? "Vorschub Bohren mm/min" : "Vorschub Fräsen mm/min"} wert={b.vorschub} setze={setze} schritt="1" />}
          {bohren && b.zyklus !== "gewinde" && (
            <label className="feld"><span>Ausgabe</span>
              <select data-bf="ausgabe" value={b.ausgabe} onChange={(e) => setze("ausgabe", e.target.value)}>
                <option value="zyklus">Als Zyklus ({b.art === "bohrenFront" ? "G83/G85" : "G87/G89"})</option>
                <option value="einzeln">Ausgeschrieben (G0/G1)</option>
              </select></label>
          )}
        </div>
      </div>

      <p className="klein">X ist im Durchmesser programmiert. Zyklen im Fanuc-Format: der Startpunkt ist der R-Punkt (R0.),
        Q in Mikrometern ohne Komma, P in Millisekunden. Gewinde mit M29 (starr), F = Drehzahl × Steigung.
        {b.art === "nutFront" || b.art === "nutQuer" ? " Die Nut wird so breit wie der Fräser." : ""}
        {b.art === "flaeche" ? " Die Fläche wird " + flaecheBreite(b).toFixed(2) + " mm breit." : ""}
        {" "}<strong>Vor dem ersten Einsatz an der Maschine im Einzelsatz prüfen.</strong></p>
      {warnungen.map((t) => <p key={t} className="karte karte--fehler cax-warnung bf-warnung">{t}</p>)}

      <Antrieb geaendert={() => setStand((n) => n + 1)} />
      <KopfFelder geaendert={() => setStand((n) => n + 1)} />
      <pre className="gcode" id="bf-code">{gcode}</pre>
      <NcStand kurz="bf" gespeichert={gespeichert} nc={gcode} />
      <button className="knopf knopf--klein" id="bf-kopieren" onClick={kopieren}>NC-Code kopieren</button>
    </div>
  );
}

// ---------- Werkzeugantrieb ----------

export function Antrieb({ geaendert }) {
  // Offen nur beim ersten Mal, solange nichts eingetragen ist
  const [offen] = useState(() => !antrieb.frontEin && !antrieb.querEin);
  const uhr = useRef(null);
  useEffect(() => () => clearTimeout(uhr.current), []);
  const merken = (k, wert) => {
    clearTimeout(uhr.current);
    if (wert === antrieb[k]) return;
    antrieb[k] = wert;
    alt.einstellungSetzenWert?.("bf" + k, wert);
    geaendert();
  };
  const feld = (k, text, platz) => (
    <label className="feld"><span>{text}</span>
      <textarea data-bfantrieb={k} rows={2} placeholder={platz} defaultValue={antrieb[k]}
        onChange={(e) => { const w = e.target.value; clearTimeout(uhr.current); uhr.current = setTimeout(() => merken(k, w), 600); }}
        onBlur={(e) => merken(k, e.target.value)} /></label>
  );
  return (
    <details className="gc-kopf" id="bf-antrieb" open={offen}>
      <summary>Werkzeugantrieb (Front und Quer)</summary>
      <p className="klein">Hier die Befehle eintragen, mit denen eure Maschine das angetriebene Werkzeug ein- und
        ausschaltet. <b>{"{S}"}</b> wird zur Drehzahl. Das bleibt für dich gespeichert.</p>
      <div className="bf-antrieb">
        {feld("frontEin", "Frontwerkzeug ein", "z. B. M80 S{S}")}
        {feld("frontAus", "Frontwerkzeug aus", "z. B. M81")}
        {feld("querEin", "Querwerkzeug ein", "z. B. M80 S{S}")}
        {feld("querAus", "Querwerkzeug aus", "z. B. M81")}
      </div>
    </details>
  );
}

// ---------- Zeichnungen ----------

// Stirnansicht: von vorne auf das Teil, C = 0 zeigt nach rechts
function Stirn({ b }) {
  const R = Math.max(1, b.teilD / 2);
  const s = 110 / R;
  const pol = (r, c) => [150 + r * s * Math.cos((c * Math.PI) / 180), 150 - r * s * Math.sin((c * Math.PI) / 180)];
  const teile = [];
  if (b.art === "bohrenFront") {
    frontLoecher(b).forEach((l, i) => {
      const [x, y] = pol(l.x / 2, l.c);
      teile.push(<circle key={i} cx={x} cy={y} r={Math.max(2, (b.bohrD / 2) * s)} className="bf-loch" />);
    });
    if (b.lochkreis > 0) teile.push(<circle key="lk" cx="150" cy="150" r={(b.lochkreis / 2) * s} className="cax-mass" fill="none" />);
  } else if (b.art === "bohrenQuer") {
    cWinkel(b).forEach((c, i) => {
      const [x1, y1] = pol(R, c), [x2, y2] = pol(Math.max(0, R - b.tiefe), c);
      const w = Math.max(3, b.bohrD * s);
      teile.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="bf-querloch" style={{ strokeWidth: w }} />);
    });
  } else if (b.art === "nutFront") {
    const l = Math.min(b.nutLaenge, b.teilD + b.fraeser) / 2 * s, h = (b.fraeser / 2) * s;
    teile.push(<rect key="n" x={150 - l} y={150 - h} width={2 * l} height={2 * h} rx={b.nutLaenge < b.teilD ? h : 0}
      className="bf-loch" transform={`rotate(${-b.startC} 150 150)`} />);
  } else if (b.art === "nutQuer") {
    const [x1, y1] = pol(R, b.startC), [x2, y2] = pol(R - b.nutTiefe, b.startC);
    teile.push(<line key="n" x1={x1} y1={y1} x2={x2} y2={y2} className="bf-querloch" style={{ strokeWidth: Math.max(3, b.fraeser * s) }} />);
  } else {
    const n = Math.max(1, Math.round(b.flaechen) || 1);
    const a = b.sw / 2;
    for (let i = 0; i < n; i++) {
      const c = b.startC + (360 * i) / n;
      if (a >= R) continue;
      const h = Math.sqrt(R * R - a * a);
      const [mx, my] = pol(a, c);
      const dx = -Math.sin((c * Math.PI) / 180) * h * s, dy = -Math.cos((c * Math.PI) / 180) * h * s;
      const [ax, ay] = pol(R + 2, c);
      teile.push(<polygon key={i} className="bf-weg"
        points={`${mx + dx},${my + dy} ${mx - dx},${my - dy} ${ax - dx},${ay - dy} ${ax + dx},${ay + dy}`} />);
    }
  }
  return (
    <svg viewBox="0 0 300 300" className="cax-bild" id="bf-stirn">
      <circle cx="150" cy="150" r={R * s} className="cax-teil" />
      {teile}
      <circle cx="150" cy="150" r="2" className="cax-mitte" />
      <text x="8" y="18" className="cax-legende">Stirnansicht · C0 →</text>
      <text x="292" y="292" className="cax-text" textAnchor="end">Ø{b.teilD}</text>
    </svg>
  );
}

// Seitenansicht: Stirn rechts, Z läuft nach links ins Teil
function Seite({ b }) {
  const R = Math.max(1, b.teilD / 2);
  let lang = 10;
  if (b.art === "bohrenFront") lang = b.tiefe;
  if (b.art === "bohrenQuer") lang = Math.max(0, ...zLagen(b)) + b.bohrD;
  if (b.art === "nutFront") lang = b.nutTiefe;
  if (b.art === "nutQuer") lang = b.nutBis;
  if (b.art === "flaeche") lang = b.flBis;
  lang = Math.max(lang * 1.3, b.teilD * 0.8, 6);
  const s = Math.min(240 / lang, 100 / R);
  const xs = 270, ym = 110;
  const zx = (zz) => xs - zz * s;              // zz = Tiefe ab Stirn
  const ry = (r) => ym - r * s;
  const teile = [];
  if (b.art === "bohrenFront") {
    const h = Math.max(1.5, (b.bohrD / 2) * s);
    const rr = b.lochkreis > 0 ? b.lochkreis / 2 : 0;
    const lagen = rr > 0 ? [rr, -rr] : [0];
    lagen.forEach((r, i) => teile.push(<rect key={i} x={zx(b.tiefe)} y={ry(r) - h} width={b.tiefe * s} height={2 * h} className="bf-loch" />));
  } else if (b.art === "bohrenQuer") {
    zLagen(b).forEach((zz, i) => {
      const w = Math.max(2, b.bohrD * s);
      teile.push(<rect key={i} x={zx(zz) - w / 2} y={ry(R)} width={w} height={Math.min(b.tiefe, b.teilD) * s} className="bf-loch" />);
    });
  } else if (b.art === "nutFront") {
    teile.push(<rect key="n" x={zx(b.nutTiefe)} y={ry(Math.min(R, b.nutLaenge / 2))} width={b.nutTiefe * s}
      height={Math.min(b.teilD, b.nutLaenge) * s} className="bf-loch" />);
  } else if (b.art === "nutQuer") {
    teile.push(<rect key="n" x={zx(b.nutBis)} y={ry(R)} width={(b.nutBis - (b.nutVon || 0)) * s} height={b.nutTiefe * s} className="bf-loch" />);
  } else {
    const t = Math.max(0, R - b.sw / 2);
    teile.push(<rect key="f" x={zx(b.flBis)} y={ry(R)} width={(b.flBis - (b.flVon || 0)) * s} height={t * s} className="bf-weg" />);
    if (Math.round(b.flaechen) % 2 === 0) {
      teile.push(<rect key="g" x={zx(b.flBis)} y={ry(-R) - t * s} width={(b.flBis - (b.flVon || 0)) * s} height={t * s} className="bf-weg" />);
    }
  }
  return (
    <svg viewBox="0 0 300 230" className="cax-bild" id="bf-seite">
      <rect x="10" y={ry(R)} width={xs - 10} height={2 * R * s} className="cax-teil" />
      {teile}
      <line x1="4" y1={ym} x2="296" y2={ym} className="cax-mass" />
      <text x="8" y="222" className="cax-legende">Seitenansicht · Stirn rechts, Z0 →</text>
    </svg>
  );
}
