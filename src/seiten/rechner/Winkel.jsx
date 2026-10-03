// =================================================================
//  RECHNER → WINKEL UND FASE
//  Rechtwinkliges Dreieck aus zwei Werten, Fase an einer Bohrung und
//  eine Tabelle häufiger Fasen. Gerechnet wird beim Verlassen eines
//  Felds (wie bisher), damit beim Tippen nichts herumspringt.
// =================================================================
import { useState } from "react";

// Bleibt beim Wechsel auf einen anderen Reiter stehen
const gemerkt = { a: "", g: "", h: "", winkel: "", fd: "", fb: "1", fw: "45" };

const bogen = (grad) => grad * Math.PI / 180;
const grad = (x) => x * 180 / Math.PI;
const leer = (x) => x === undefined || x === null || isNaN(x);
// Ergebnis mit drei Stellen, in der Zeichnung mit zwei
const z3 = (x) => (leer(x) ? "–" : (Math.round(x * 1000) / 1000).toLocaleString("de-CH"));
const z2 = (x, e) => (leer(x) ? e : (Math.round(x * 100) / 100).toLocaleString("de-CH"));

export function dreieckRechnen(a, g, h, w) {
  const da = !isNaN(a), dg = !isNaN(g), dh = !isNaN(h), dw = !isNaN(w);
  if (da && dg) return { a, g, h: Math.sqrt(a * a + g * g), w: grad(Math.atan(g / a)) };
  if (da && dh && h > a) return { a, h, g: Math.sqrt(h * h - a * a), w: grad(Math.acos(a / h)) };
  if (dg && dh && h > g) return { g, h, a: Math.sqrt(h * h - g * g), w: grad(Math.asin(g / h)) };
  if (dw && da) return { a, w, g: a * Math.tan(bogen(w)), h: a / Math.cos(bogen(w)) };
  if (dw && dg) return { g, w, a: g / Math.tan(bogen(w)), h: g / Math.sin(bogen(w)) };
  if (dw && dh) return { h, w, a: h * Math.cos(bogen(w)), g: h * Math.sin(bogen(w)) };
  return { a: NaN, g: NaN, h: NaN, w: NaN };
}

// Zahlenfeld, das erst beim Verlassen oder mit Enter meldet. Ändert
// sich der Wert von aussen (Zurücksetzen), beginnt es neu (key).
function FeldInnen({ id, label, wert, setze, step }) {
  const [text, setText] = useState(wert);
  return (
    <label className="feld"><span>{label}</span>
      <input type="number" id={id} inputMode="decimal" step={step} value={text}
        onChange={(e) => setText(e.target.value)} onBlur={() => setze(text)}
        onKeyDown={(e) => { if (e.key === "Enter") setze(text); }} /></label>
  );
}
const Feld = (p) => <FeldInnen key={p.wert} {...p} />;

export default function Winkel() {
  const [w, setW] = useState(gemerkt);
  const setze = (feld) => (wert) => {
    const neu = { ...w, [feld]: wert };
    Object.assign(gemerkt, neu);
    setW(neu);
  };

  const r = dreieckRechnen(parseFloat(w.a), parseFloat(w.g), parseFloat(w.h), parseFloat(w.winkel));

  // Fase an der Bohrung
  const fd = parseFloat(w.fd), fb = parseFloat(w.fb), fw = parseFloat(w.fw);
  const ft = (!isNaN(fb) && !isNaN(fw) && fw > 0 && fw < 90) ? fb / Math.tan(bogen(fw)) : NaN;
  const fdAussen = (!isNaN(fd) && !isNaN(fb)) ? fd + 2 * fb : NaN;
  const fs = (!isNaN(fb) && !isNaN(ft)) ? Math.sqrt(fb * fb + ft * ft) : NaN;

  const ergebnis = (titel, wert, einheit) => (
    <div className="ergebnis"><div className="ergebnis__titel">{titel}</div>
      <div className="ergebnis__wert ergebnis__wert--klein">{z3(wert)}<span>{einheit}</span></div></div>
  );

  return (
    <>
      <section className="karte"><h2>Rechtwinkliges Dreieck</h2>
        <BildDreieck a={r.a} g={r.g} h={r.h} w={r.w} />
        <p className="hinweis">Zwei Werte eingeben, die anderen werden berechnet.</p>
        <div className="zeitraumwahl">
          <Feld id="w-a" label="Ankathete a in mm" wert={w.a} setze={setze("a")} step="0.01" />
          <Feld id="w-g" label="Gegenkathete b in mm" wert={w.g} setze={setze("g")} step="0.01" />
        </div>
        <div className="zeitraumwahl">
          <Feld id="w-h" label="Hypotenuse c in mm" wert={w.h} setze={setze("h")} step="0.01" />
          <Feld id="w-w" label="Winkel β in Grad" wert={w.winkel} setze={setze("winkel")} step="0.1" />
        </div>
        <button className="linkknopf" id="w-leer" onClick={() => {
          const neu = { ...w, a: "", g: "", h: "", winkel: "" };
          Object.assign(gemerkt, neu); setW(neu);
        }}>Alles zurücksetzen</button>
      </section>

      <section className="karte karte--ergebnis"><div className="ergebnisreihe">
        {ergebnis("a", r.a, "mm")}{ergebnis("b", r.g, "mm")}{ergebnis("c", r.h, "mm")}{ergebnis("Winkel β", r.w, "°")}
      </div></section>

      <section className="karte"><h2>Fase an einer Bohrung</h2>
        <BildBohrung d={fd} b={fb} w={fw} t={ft} />
        <p className="hinweis">b ist die Fasenbreite am Rand, t die Tiefe in Achsrichtung. β ist der Winkel
          zwischen Fase und Stirnfläche. Bei 45° sind b und t gleich gross.</p>
        <div className="zeitraumwahl">
          <Feld id="f-d" label="Bohrung Ø in mm" wert={w.fd} setze={setze("fd")} step="0.1" />
          <Feld id="f-b" label="Fasenbreite b in mm" wert={w.fb} setze={setze("fb")} step="0.05" />
        </div>
        <Feld id="f-w" label="Winkel β in Grad" wert={w.fw} setze={setze("fw")} step="1" />
        <div className="wahlgitter">{[30, 45, 60, 90].map((gr) => (
          <button key={gr} className={"wahlknopf" + (Number(w.fw) === gr ? " aktiv" : "")} data-fwinkel={gr}
            onClick={() => setze("fw")(String(gr))}>{gr}°</button>
        ))}</div>
      </section>

      <section className="karte karte--ergebnis"><div className="ergebnisreihe">
        {ergebnis("Tiefe t", ft, "mm")}{ergebnis("Fasen Ø aussen", fdAussen, "mm")}{ergebnis("Fasenlänge", fs, "mm")}
      </div>
        <p className="hinweis">Auf so viel Durchmesser musst du senken. Die Fasenlänge ist die schräge Strecke,
          also der Weg des Werkzeugs.</p>
      </section>

      <section className="karte"><h2>Häufige Fasen</h2><table className="tabelle">
        <thead><tr><th>Angabe</th><th className="mitte">b</th><th className="mitte">t</th><th className="mitte">Länge</th></tr></thead>
        <tbody>{[[0.2, 45], [0.3, 45], [0.5, 45], [1, 45], [1.5, 45], [2, 45], [0.5, 30], [1, 30], [1, 60]].map(([m, gr]) => {
          const tt = m / Math.tan(bogen(gr));
          const ss = Math.sqrt(m * m + tt * tt);
          return (
            <tr key={m + "x" + gr}><td className="stark">{m} × {gr}°</td><td className="mitte">{m}</td>
              <td className="mitte">{Math.round(tt * 100) / 100}</td><td className="mitte">{Math.round(ss * 100) / 100}</td></tr>
          );
        })}</tbody>
      </table></section>
    </>
  );
}

// ---------- Zeichnungen ----------

function BildDreieck({ a, g, h, w }) {
  return (
    <svg viewBox="0 0 300 190" className="zeichnung" role="img"
      aria-label="Rechtwinkliges Dreieck mit Ankathete a, Gegenkathete b, Hypotenuse c und Winkel">
      <polygon points="40,150 250,150 250,45" fill="var(--marke-hell)" stroke="var(--marke)" strokeWidth="2.5" />
      {/* rechter Winkel */}
      <path d="M250,132 L233,132 L233,150" fill="none" stroke="var(--marke)" strokeWidth="1.5" />
      {/* Winkelbogen unten links */}
      <path d="M78,150 A38,38 0 0,0 74,133" fill="none" stroke="var(--tinte)" strokeWidth="2" />
      <text x="84" y="141" className="zbeschriftung">{z2(w, "β")}°</text>
      <text x="145" y="170" className="zbeschriftung" textAnchor="middle">a = {z2(a, "a")}</text>
      <text x="262" y="102" className="zbeschriftung">b = {z2(g, "b")}</text>
      <text x="130" y="88" className="zbeschriftung" textAnchor="middle">c = {z2(h, "c")}</text>
    </svg>
  );
}

// Fase an einer Bohrung, im Schnitt
function BildBohrung({ d, b, w, t }) {
  const marke = "var(--marke)";
  return (
    <svg viewBox="0 0 300 190" className="zeichnung" role="img" aria-label="Fase an einer Bohrung im Schnitt">
      {/* Werkstück links und rechts, dazwischen die Bohrung */}
      <path d="M20,40 L110,40 L140,70 L140,170 L20,170 Z" fill="var(--grund)" stroke="var(--tinte)" strokeWidth="2" />
      <path d="M280,40 L190,40 L160,70 L160,170 L280,170 Z" fill="var(--grund)" stroke="var(--tinte)" strokeWidth="2" />
      {/* Schraffur andeuten */}
      <g stroke="var(--linie-stark)" strokeWidth="1">
        <line x1="30" y1="170" x2="80" y2="120" /><line x1="50" y1="170" x2="100" y2="120" />
        <line x1="70" y1="170" x2="120" y2="120" /><line x1="200" y1="170" x2="250" y2="120" />
        <line x1="220" y1="170" x2="270" y2="120" /><line x1="240" y1="170" x2="280" y2="130" />
      </g>
      {/* Fasenflächen hervorheben */}
      <line x1="110" y1="40" x2="140" y2="70" stroke={marke} strokeWidth="3" />
      <line x1="190" y1="40" x2="160" y2="70" stroke={marke} strokeWidth="3" />
      {/* Massangabe b (Fasenbreite, radial) */}
      <line x1="160" y1="26" x2="190" y2="26" stroke={marke} strokeWidth="1.5" />
      <line x1="160" y1="20" x2="160" y2="46" stroke={marke} strokeWidth="1" />
      <line x1="190" y1="20" x2="190" y2="46" stroke={marke} strokeWidth="1" />
      <text x="175" y="17" className="zbeschriftung" textAnchor="middle">b = {z2(b, "b")}</text>
      {/* Massangabe t (Tiefe, axial) */}
      <line x1="205" y1="40" x2="205" y2="70" stroke={marke} strokeWidth="1.5" />
      <line x1="196" y1="40" x2="214" y2="40" stroke={marke} strokeWidth="1" />
      <line x1="196" y1="70" x2="214" y2="70" stroke={marke} strokeWidth="1" />
      <text x="219" y="60" className="zbeschriftung">t = {z2(t, "t")}</text>
      {/* Winkel */}
      <path d="M126,40 A16,16 0 0,0 121,51" fill="none" stroke="var(--tinte)" strokeWidth="1.5" />
      <text x="130" y="57" className="zbeschriftung">{z2(w, "β")}°</text>
      {/* Bohrungsdurchmesser */}
      <line x1="140" y1="150" x2="160" y2="150" stroke="var(--tinte)" strokeWidth="1.5" />
      <text x="150" y="186" className="zbeschriftung" textAnchor="middle">Ø {z2(d, "d")}</text>
    </svg>
  );
}
