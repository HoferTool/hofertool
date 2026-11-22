// =================================================================
//  HOFERCAM: Skizze der Vorlage Einstich (seit 1.603.0, Wunsch Patrick
//  17. November 2026: „es soll alles über eine Grafik eingegeben werden
//  können“). Die Masse stehen an ihrer Stelle im Bild, wie im Fenster
//  Werkzeug. Ansicht wie an der Maschine: Stirn rechts, Büchse links.
//  Gerechnet wird in camEinstich.js.
// =================================================================
import { EINSTICH_FELDER, einstichHinweise, einstichUmriss, einstichWerte } from "./camEinstich.js";

const BW = 640, BH = 330;
const feldVon = (n) => EINSTICH_FELDER.find((f) => f.name === n);

function Feld({ n, w, setze, x, y, vor, art }) {
  const fe = feldVon(n);
  return (
    <label className="cam-mass__feld" style={{ left: x + "px", top: y + "px" }} title={fe.text + " [" + fe.einheit + "] – " + (fe.lang || "")}>
      <span className="cam-mass__name">{vor || fe.text}</span>
      {art && <select data-camein-art={art} value={w[art] || ""} onChange={(e) => setze(art, e.target.value)}>
        <option value="">scharf</option><option value="F">Fase</option><option value="R">Radius</option>
      </select>}
      {(!art || w[art]) && <input type="text" data-camein={n} value={w[n] ?? ""} inputMode="decimal" placeholder="mm"
        onChange={(e) => setze(n, e.target.value)} />}
      {(!art || w[art]) && <small className="cam-einheit">mm</small>}
    </label>);
}

function Mass({ a, b }) {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l, P = 6, Q = 2.5;
  const pfeil = (p, s) => `${p.x},${p.y} ${p.x + s * (ux * P - uy * Q)},${p.y + s * (uy * P + ux * Q)} ${p.x + s * (ux * P + uy * Q)},${p.y + s * (uy * P - ux * Q)}`;
  return (<g className="cam-mass__linie">
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
    <polygon points={pfeil(a, 1)} /><polygon points={pfeil(b, -1)} />
  </g>);
}
const Hilf = ({ a, b }) => <line className="cam-mass__hilf" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;

// Elemente (s, t) als Punkte, Bogen in kleinen Schritten
function punkte(el) {
  const out = [];
  for (const e of el) {
    if (e.t === "L") { out.push(e.a, e.b); continue; }
    const wa = Math.atan2(e.a[1] - e.c[1], e.a[0] - e.c[0]);
    let wb = Math.atan2(e.b[1] - e.c[1], e.b[0] - e.c[0]);
    const r = Math.hypot(e.a[0] - e.c[0], e.a[1] - e.c[1]);
    let d = wb - wa;
    if (e.ccw && d < 0) d += 2 * Math.PI;
    if (!e.ccw && d > 0) d -= 2 * Math.PI;
    for (let i = 0; i <= 12; i++) { const w = wa + (d * i) / 12; out.push([e.c[0] + r * Math.cos(w), e.c[1] + r * Math.sin(w)]); }
  }
  return out;
}

export function EinstichBild({ w, setze }) {
  const v = einstichWerte(w);
  const front = v.lage === "front", innen = v.lage === "innen";
  const B = v.B > 0 ? v.B : 3, T = v.T > 0 ? v.T : 2;
  const PB = v.PB > 0 ? Math.min(v.PB, B) : Math.min(2, B), PR = Math.max(0, Math.min(v.PR || 0, PB / 2));
  const k = Math.min(150 / B, 110 / T);
  const Lz = Math.min(v.PL > 0 ? v.PL : T * 1.5, T + 85 / k);     // so lang gezeichnet
  // (s, t) → Bild
  // Innen (seit 1.694.0): wie Mantel, Bohrung unten, Tiefe nach oben
  const M = front
    ? (s, t) => ({ x: 390 - t * k, y: 165 + (B / 2 - s) * k })
    : innen ? (s, t) => ({ x: 330 - (s - B / 2) * k, y: 230 - t * k })
      : (s, t) => ({ x: 330 - (s - B / 2) * k, y: 150 + t * k });
  const umriss = einstichUmriss({ ...w, B: String(B), T: String(T) }) || [];
  const nut = punkte(umriss).map((p) => M(p[0], p[1]));
  const pts = (l) => l.map((p) => p.x + "," + p.y).join(" ");
  // Material: Mantel unter der Oberfläche, Front links der Stirn
  const o0 = M(0, 0), oB = M(B, 0), g0 = M(0, T), gB = M(B, T);
  const material = front
    ? [{ x: 40, y: 30 }, { x: o0.x, y: 30 }, oB, ...nut.slice().reverse().slice(0, 0), { x: o0.x, y: oB.y }]
    : null;
  // Platte: programmierte Ecke an (B, T), Ecke zur Büchse bzw. aussen
  const platte = [];
  {
    const st = 10;
    // Viertelbogen von w0 nach w0 − 90°; t wächst nach unten, also liegt 90° unten
    const ecke = (cs, ct, w0) => { for (let i = 0; i <= st; i++) { const a = w0 - (Math.PI / 2) * (i / st); platte.push(M(cs + PR * Math.cos(a), ct + PR * Math.sin(a))); } };
    platte.push(M(B - PB, T - Lz));
    ecke(B - PB + PR, T - PR, Math.PI);          // Ecke zur Stirn bzw. innen
    ecke(B - PR, T - PR, Math.PI / 2);           // programmierte Ecke
    platte.push(M(B, T - Lz));
  }
  const spitze = M(B, T);
  const hinweise = einstichHinweise(w);
  const felder = [];
  const teile = [];

  if (innen) {
    // Innen: Material oben, Bohrung darunter, Stirn rechts
    const xStirn = Math.min(BW - 40, o0.x + 120);
    teile.push(<rect key="mat" className="cam-ein__mat" x="40" y="24" width={xStirn - 40} height={o0.y - 24} />);
    teile.push(<polygon key="nut" className="cam-ein__nut" points={pts([{ x: oB.x - 1, y: o0.y + 1 }, ...nut, { x: o0.x + 1, y: o0.y + 1 }])} />);
    teile.push(<line key="st" className="cam-ein__stirn" x1={xStirn} y1="24" x2={xStirn} y2={o0.y} />);
    teile.push(<text key="stt" className="cam-mass__notiz" x={xStirn + 4} y="36">Stirn</text>);
    teile.push(<text key="bu" className="cam-mass__notiz" x="44" y="36">← Büchse</text>);
    teile.push(<text key="bo" className="cam-mass__notiz" x={xStirn + 4} y={o0.y + 14}>Bohrung</text>);
    teile.push(<line key="mi" className="cam-mass__hilf" x1="40" y1={BH - 10} x2={BW - 20} y2={BH - 10} strokeDasharray="8 3 2 3" />);
    teile.push(<text key="mit" className="cam-mass__notiz" x={xStirn - 70} y={BH - 14}>Drehmitte</text>);
    // Z: Stirn bis Flanke, in der Bohrung
    teile.push(<Mass key="mz" a={{ x: xStirn, y: o0.y + 12 }} b={{ x: o0.x, y: o0.y + 12 }} />);
    felder.push(<Feld key="Z" n="Z" w={w} setze={setze} x={(xStirn + o0.x) / 2 + 10} y={o0.y + 30} vor="Z" />);
    // Breite über dem Grund
    const yb = g0.y - 26;
    teile.push(<Hilf key="hb1" a={g0} b={{ x: g0.x, y: yb - 4 }} />, <Hilf key="hb2" a={gB} b={{ x: gB.x, y: yb - 4 }} />);
    teile.push(<Mass key="mb" a={{ x: gB.x, y: yb }} b={{ x: g0.x, y: yb }} />);
    felder.push(<Feld key="B" n="B" w={w} setze={setze} x={(g0.x + gB.x) / 2} y={yb - 18} vor="Breite" />);
    // Tiefe rechts
    const xt = o0.x + 24;
    teile.push(<Hilf key="ht" a={g0} b={{ x: xt + 4, y: g0.y }} />);
    teile.push(<Mass key="mt" a={{ x: xt, y: o0.y }} b={{ x: xt, y: g0.y }} />);
    felder.push(<Feld key="T" n="T" w={w} setze={setze} x={xt + 52} y={(o0.y + g0.y) / 2 - 8} vor="Tiefe" />);
    felder.push(<Feld key="D" n="D" w={w} setze={setze} x={110} y={o0.y + 22} vor="Bohrungs-Ø" />);
    felder.push(<Feld key="eo" n="eo" art="eoArt" w={w} setze={setze} x={120} y={o0.y + 60} vor="oben" />);
    felder.push(<Feld key="eg" n="eg" art="egArt" w={w} setze={setze} x={g0.x + 90} y={g0.y - 20} vor="Grund" />);
  } else if (!front) {
    // Mantel: Oberfläche bei y von o0, Stirn rechts
    const xStirn = Math.min(BW - 40, o0.x + 120);
    teile.push(<rect key="mat" className="cam-ein__mat" x="40" y={o0.y} width={xStirn - 40} height={BH - 40 - o0.y} />);
    teile.push(<polygon key="nut" className="cam-ein__nut" points={pts([{ x: oB.x - 1, y: o0.y - 1 }, ...nut, { x: o0.x + 1, y: o0.y - 1 }])} />);
    teile.push(<line key="st" className="cam-ein__stirn" x1={xStirn} y1={o0.y} x2={xStirn} y2={BH - 40} />);
    teile.push(<text key="stt" className="cam-mass__notiz" x={xStirn + 4} y={BH - 44}>Stirn</text>);
    teile.push(<text key="bu" className="cam-mass__notiz" x="44" y={BH - 44}>← Büchse</text>);
    // Z: Stirn bis Flanke
    teile.push(<Mass key="mz" a={{ x: xStirn, y: o0.y - 12 }} b={{ x: o0.x, y: o0.y - 12 }} />);
    felder.push(<Feld key="Z" n="Z" w={w} setze={setze} x={(xStirn + o0.x) / 2 + 10} y={o0.y - 30} vor="Z" />);
    // Breite unter dem Grund
    const yb = g0.y + 26;
    teile.push(<Hilf key="hb1" a={g0} b={{ x: g0.x, y: yb + 4 }} />, <Hilf key="hb2" a={gB} b={{ x: gB.x, y: yb + 4 }} />);
    teile.push(<Mass key="mb" a={{ x: gB.x, y: yb }} b={{ x: g0.x, y: yb }} />);
    felder.push(<Feld key="B" n="B" w={w} setze={setze} x={(g0.x + gB.x) / 2} y={yb + 18} vor="Breite" />);
    // Tiefe rechts
    const xt = o0.x + 24;
    teile.push(<Hilf key="ht" a={g0} b={{ x: xt + 4, y: g0.y }} />);
    teile.push(<Mass key="mt" a={{ x: xt, y: o0.y }} b={{ x: xt, y: g0.y }} />);
    felder.push(<Feld key="T" n="T" w={w} setze={setze} x={xt + 52} y={(o0.y + g0.y) / 2 + 8} vor="Tiefe" />);
    // Ø oben links an der Oberfläche
    felder.push(<Feld key="D" n="D" w={w} setze={setze} x={110} y={o0.y + 22} vor="Ø oben" />);
    felder.push(<Feld key="eo" n="eo" art="eoArt" w={w} setze={setze} x={120} y={o0.y - 64} vor="oben" />);
    felder.push(<Feld key="eg" n="eg" art="egArt" w={w} setze={setze} x={g0.x + 90} y={g0.y + 4} vor="Grund" />);
  } else {
    // Front: Stirn senkrecht bei o0.x, Material links, Drehmitte unten
    const yAus = oB.y - 30, yUnten = BH - 46;
    teile.push(<rect key="mat" className="cam-ein__mat" x="40" y={yAus} width={o0.x - 40} height={yUnten - yAus} />);
    teile.push(<polygon key="nut" className="cam-ein__nut" points={pts([{ x: o0.x + 1, y: oB.y }, ...nut, { x: o0.x + 1, y: o0.y }])} />);
    teile.push(<line key="st" className="cam-ein__stirn" x1={o0.x} y1={yAus} x2={o0.x} y2={yUnten} />);
    teile.push(<text key="stt" className="cam-mass__notiz" x={o0.x + 4} y={yUnten + 12}>Stirn</text>);
    teile.push(<line key="mi" className="cam-mass__hilf" x1="40" y1={yUnten + 22} x2={BW - 20} y2={yUnten + 22} strokeDasharray="8 3 2 3" />);
    teile.push(<text key="mit" className="cam-mass__notiz" x="44" y={yUnten + 18}>Drehmitte (weiter unten)</text>);
    // Breite links im Material
    const xb = gB.x - 22;
    teile.push(<Mass key="mb" a={{ x: xb, y: gB.y }} b={{ x: xb, y: g0.y }} />);
    felder.push(<Feld key="B" n="B" w={w} setze={setze} x={xb - 56} y={(gB.y + g0.y) / 2} vor="Breite" />);
    // Tiefe unter dem Einstich
    const yt = g0.y + 22;
    teile.push(<Hilf key="ht" a={g0} b={{ x: g0.x, y: yt + 4 }} />);
    teile.push(<Mass key="mt" a={{ x: g0.x, y: yt }} b={{ x: o0.x, y: yt }} />);
    felder.push(<Feld key="T" n="T" w={w} setze={setze} x={(g0.x + o0.x) / 2} y={yt + 18} vor="Tiefe" />);
    felder.push(<Feld key="D" n="D" w={w} setze={setze} x={130} y={yAus - 16} vor="Aussen-Ø" />);
    felder.push(<Feld key="Z" n="Z" w={w} setze={setze} x={BW - 90} y={yAus - 16} vor="Z Stirn" />);
    felder.push(<Feld key="eo" n="eo" art="eoArt" w={w} setze={setze} x={o0.x + 90} y={o0.y + 22} vor="oben" />);
    felder.push(<Feld key="eg" n="eg" art="egArt" w={w} setze={setze} x={g0.x - 30} y={yt + 46} vor="Grund" />);
  }
  // Platte und ihre Masse
  const pAus = M(B, T - Lz), pIn = M(B - PB, T - Lz);
  felder.push(<Feld key="PB" n="PB" w={w} setze={setze} x={front ? pAus.x + 70 : (pAus.x + pIn.x) / 2} y={front ? (pAus.y + pIn.y) / 2 : innen ? pAus.y + 2 : pAus.y - 16} vor="Platte B" />);
  felder.push(<Feld key="PL" n="PL" w={w} setze={setze} x={front ? (pAus.x + spitze.x) / 2 + 10 : pAus.x - 80} y={front ? pAus.y - 18 : (pAus.y + spitze.y) / 2 - 20} vor="Länge" />);
  felder.push(<Feld key="PR" n="PR" w={w} setze={setze} x={front ? spitze.x - 95 : spitze.x - 70} y={front ? spitze.y - 10 : innen ? spitze.y - 26 : spitze.y + 4} vor="Eck-R" />);

  return (
    <div className="cam-ein" data-camein-bild>
      <div className="cam-mass" style={{ width: BW + "px", height: BH + "px" }}>
        <svg className="cam-wz__skizze" viewBox={`0 0 ${BW} ${BH}`} width={BW} height={BH} aria-label="Skizze Einstich">
          {teile}
          <polygon className="cam-ein__platte" points={pts(platte)} />
          <circle className="cam-wz__spitze" cx={spitze.x} cy={spitze.y} r="3.5" />
          <text className="cam-mass__notiz" x={BW - 8} y={BH - 8} textAnchor="end">● programmierte Ecke ({front ? "aussen" : "zur Büchse"})</text>
        </svg>
        {felder}
      </div>
      {hinweise.map((h) => <div key={h} className="cam-ein__hinweis klein">{h}</div>)}
    </div>
  );
}

// Schalter und übrige Felder unter der Skizze
export function EinstichSteuerung({ w, setze }) {
  const knopf = (name, wert, text) => (
    <button key={wert} type="button" className={"moduswahl__knopf" + ((w[name] || "") === wert ? " aktiv" : "")}
      data-camein-wahl={name + ":" + wert} onClick={() => setze(name, wert)}>{text}</button>);
  const rest = ["A", "UE", "Q", "RZ", "S", "FR", "FS"].filter((n) => !(w.strat === "schlichten" && ["A", "UE", "Q", "RZ", "FR"].includes(n))
    && !(w.strat === "schruppen" && n === "FS"));
  return (
    <div className="cam-ein__steuer">
      <div className="moduswahl">{knopf("lage", "mantel", "Mantel")}{knopf("lage", "innen", "Innen")}{knopf("lage", "front", "Front")}</div>
      <div className="moduswahl">{knopf("strat", "beide", "Schruppen + Schlichten")}{knopf("strat", "schruppen", "Nur Schruppen")}{knopf("strat", "schlichten", "Nur Schlichten")}</div>
      <div className="cam-vorlage__felder">
        {rest.map((n) => { const f = feldVon(n); return (
          <label key={n} className="cam-feld" title={f.lang}>
            <span>{f.text}<small className="cam-einheit"> [{f.einheit}]</small></span>
            <input data-camein={n} value={w[n] ?? ""} inputMode="decimal" style={{ width: 64 }} placeholder={f.einheit}
              onChange={(e) => setze(n, e.target.value)} />
          </label>); })}
      </div>
    </div>
  );
}
