// =================================================================
//  HOFERCAM: Werkzeug festlegen mit Grafik (seit 1.546.0)
//  Wunsch Patrick 14. November 2026: „kannst du mir für die Auswahl oder
//  Festlegung der Werkzeuge Grafiken machen, wo ich die Werte eingeben
//  kann?“ Die Form wählt man aus Bildern, die Masse tippt man direkt im
//  Massbild an der Stelle ein, wo sie am Werkzeug sind (Radius an der
//  Ecke, Breite an der Schneide, Ø quer, Schneidenlänge der Länge nach,
//  Spitzenwinkel an der Spitze). Die Zeichnung folgt den Werten live.
// =================================================================

import { FRAESER, LAGE_NAME, PLATTEN, SPITZEN, fraeserUmriss, plattenForm, plattenUmriss, wzArt, wzArten, wzFehler, wzFelder } from "./camWerkzeug.js";

const BW = 340, BH = 240; // Massbild in Punkten (1 Punkt = 1 Pixel)

const punkte = (l, tz, tx) => l.map((q) => tz(q.z).toFixed(1) + "," + tx(q.x).toFixed(1)).join(" ");

// Kleines Bild je Form für die Auswahl
function FormBild({ art, id }) {
  const W = 48, H = 38;
  let teile;
  if (art === "dreh") {
    const p = plattenUmriss({ form: id, sl: "ul", r: id === "R" ? "4" : "0.6", breite: "2.4" });
    teile = [{ p, k: "cam-wz__platte" }];
  } else {
    const u = fraeserUmriss({ form: id, d: "6", laenge: "9", r: "1.2", winkel: id === "fase" ? "90" : "118" });
    teile = [{ p: u.schaft, k: "cam-wz__schaft" }, { p: u.schneide, k: "cam-wz__platte" }];
  }
  const alle = teile.flatMap((t) => t.p);
  const zs = alle.map((q) => q.z), xs = alle.map((q) => q.x);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs), minX = Math.min(...xs), maxX = Math.max(...xs);
  const m = Math.min((W - 8) / (maxZ - minZ || 1), (H - 8) / (maxX - minX || 1));
  const tz = (z) => 4 + (z - minZ) * m + ((W - 8) - (maxZ - minZ) * m) / 2;
  const tx = (x) => 4 + (maxX - x) * m + ((H - 8) - (maxX - minX) * m) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      {teile.map((t, i) => <polygon key={i} className={t.k} points={punkte(t.p, tz, tx)} />)}
    </svg>);
}

// Eingabefeld im Massbild, mittig an (x, y)
function MassFeld({ fe, wz, f, aendern, x, y, vor = "" }) {
  return (
    <label className={"cam-mass__feld" + (f[fe.name] ? " cam-feld--fehler" : "")} style={{ left: x + "px", top: y + "px" }}
      title={fe.text + " [" + fe.einheit + "]" + (fe.frei ? " (freiwillig)" : "") + (f[fe.name] ? " – " + f[fe.name] : "")}>
      <span className="cam-mass__name">{vor || fe.text}</span>
      <input type="text" data-camwz={fe.name} value={wz[fe.name] ?? ""} inputMode="decimal"
        placeholder={fe.frei ? "frei" : fe.einheit === "Grad" ? "°" : "mm"} onChange={(e) => aendern(fe.name, e.target.value)} />
      <small className="cam-einheit">{fe.einheit === "Grad" ? "°" : "mm"}</small>
    </label>);
}

// Masslinie mit Pfeilen von a nach b
function Mass({ a, b }) {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l, P = 6, Q = 2.5;
  const pfeil = (p, s) => `${p.x},${p.y} ${p.x + s * (ux * P - uy * Q)},${p.y + s * (uy * P + ux * Q)} ${p.x + s * (ux * P + uy * Q)},${p.y + s * (uy * P - ux * Q)}`;
  return (<g className="cam-mass__linie">
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
    <polygon points={pfeil(a, 1)} /><polygon points={pfeil(b, -1)} />
  </g>);
}
const Hilfslinie = ({ a, b }) => <line className="cam-mass__hilf" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;

function DrehBild({ wz, f, aendern, felder }) {
  const form = plattenForm(wz.form);
  const p = plattenUmriss(wz);
  if (!p.length) return null;
  const zs = p.map((q) => q.z), xs = p.map((q) => q.x);
  const minZ = Math.min(...zs, 0), maxZ = Math.max(...zs, 0), minX = Math.min(...xs, 0), maxX = Math.max(...xs, 0);
  // Platte in der Mitte, rundherum Platz für die Felder
  const RAND = 50;
  const m = Math.min((BW - 2 * RAND) / (maxZ - minZ || 1), (BH - 2 * RAND) / (maxX - minX || 1));
  const tz = (z) => RAND + (z - minZ) * m + ((BW - 2 * RAND) - (maxZ - minZ) * m) / 2;
  const tx = (x) => RAND + (maxX - x) * m + ((BH - 2 * RAND) - (maxX - minX) * m) / 2;
  const s = SPITZEN.find((x) => x.id === wz.sl) || { id: "ul", z: -1, r: -1 };
  const n = Math.hypot(s.z, s.r) || 1;
  // Richtung von der Platte zur Spitze in Bildpunkten (y nach unten)
  const dir = s.id === "m" ? { x: 0.7, y: 0.7 } : { x: s.z / n, y: -s.r / n };
  const spitze = { x: tz(0), y: tx(0) };
  const feld = (name) => felder.find((x) => x.name === name);
  const klemm = (q) => ({ x: Math.max(58, Math.min(BW - 58, q.x)), y: Math.max(22, Math.min(BH - 22, q.y)) });
  const teile = [];
  const eingaben = [];
  if (form.art === "rund") {
    const mz = p.reduce((a, q) => a + q.z, 0) / p.length, mx = p.reduce((a, q) => a + q.x, 0) / p.length;
    const mitte = { x: tz(mz), y: tx(mx) };
    const R = (Math.max(...p.map((q) => q.z)) - Math.min(...p.map((q) => q.z))) / 2;
    const rand = { x: mitte.x + R * m * 0.707, y: mitte.y - R * m * 0.707 };
    teile.push(<Mass key="r" a={mitte} b={rand} />, <circle key="m" cx={mitte.x} cy={mitte.y} r="2" className="cam-mass__punkt" />);
    eingaben.push(<MassFeld key="r" fe={feld("r")} wz={wz} f={f} aendern={aendern} {...klemm({ x: rand.x + 42, y: rand.y - 22 })} vor="R" />);
  } else if (form.art === "einstech") {
    // Breite parallel zur Schneide, etwas ausserhalb
    const inX = s.r !== 0 || s.z === 0;
    const q = p.map((v) => ({ x: tz(v.z), y: tx(v.x) }));
    const aus = 18;
    let a, b;
    if (inX) {
      const yy = s.r < 0 || (s.r === 0 && s.z === 0) ? Math.max(...q.map((v) => v.y)) : Math.min(...q.map((v) => v.y));
      const sg = s.r < 0 || (s.r === 0 && s.z === 0) ? 1 : -1;
      const x1 = Math.min(...q.map((v) => v.x)), x2 = Math.max(...q.map((v) => v.x));
      a = { x: x1, y: yy + sg * aus }; b = { x: x2, y: yy + sg * aus };
      teile.push(<Hilfslinie key="h1" a={{ x: x1, y: yy }} b={a} />, <Hilfslinie key="h2" a={{ x: x2, y: yy }} b={b} />);
      eingaben.push(<MassFeld key="b" fe={feld("breite")} wz={wz} f={f} aendern={aendern} {...klemm({ x: (x1 + x2) / 2, y: yy + sg * (aus + 22) })} vor="Breite" />);
    } else {
      const xx = s.z > 0 ? Math.max(...q.map((v) => v.x)) : Math.min(...q.map((v) => v.x));
      const sg = s.z > 0 ? 1 : -1;
      const y1 = Math.min(...q.map((v) => v.y)), y2 = Math.max(...q.map((v) => v.y));
      a = { x: xx + sg * aus, y: y1 }; b = { x: xx + sg * aus, y: y2 };
      teile.push(<Hilfslinie key="h1" a={{ x: xx, y: y1 }} b={a} />, <Hilfslinie key="h2" a={{ x: xx, y: y2 }} b={b} />);
      eingaben.push(<MassFeld key="b" fe={feld("breite")} wz={wz} f={f} aendern={aendern} {...klemm({ x: xx + sg * (aus + 44), y: (y1 + y2) / 2 })} vor="Breite" />);
    }
    teile.push(<Mass key="b" a={a} b={b} />);
    // Eckradius an der Spitze, schräg weg
    // neben die Breite, damit sich die Felder nicht decken
    const ziel = inX ? klemm({ x: spitze.x + (dir.x >= 0 ? 1 : -1) * 92, y: spitze.y - 14 })
      : klemm({ x: spitze.x + (dir.x || 0.7) * 30, y: spitze.y + (dir.y >= 0 ? 1 : -1) * 62 });
    teile.push(<line key="l" className="cam-mass__hilf" x1={spitze.x} y1={spitze.y} x2={ziel.x} y2={ziel.y} />);
    eingaben.push(<MassFeld key="r" fe={feld("r")} wz={wz} f={f} aendern={aendern} {...ziel} vor="R" />);
  } else {
    // Radius an der Ecke: Hinweislinie von der Spitze weg
    const ziel = klemm({ x: spitze.x + dir.x * 60, y: spitze.y + dir.y * 60 });
    teile.push(<line key="l" className="cam-mass__hilf" x1={spitze.x} y1={spitze.y} x2={ziel.x} y2={ziel.y} />);
    eingaben.push(<MassFeld key="r" fe={feld("r")} wz={wz} f={f} aendern={aendern} {...ziel} vor="R" />);
  }
  return (
    <div className="cam-mass" data-camwz-massbild style={{ width: BW + "px", height: BH + "px" }}>
      <svg className="cam-wz__skizze" data-camwz-skizze viewBox={`0 0 ${BW} ${BH}`} width={BW} height={BH} aria-label="Massbild der Platte">
        <polygon className="cam-wz__platte" points={punkte(p, tz, tx)} />
        {teile}
        <circle className="cam-wz__spitze" cx={spitze.x} cy={spitze.y} r="3.5" />
        <g className="cam-mass__achsen"><line x1="12" y1={BH - 12} x2="40" y2={BH - 12} /><line x1="12" y1={BH - 12} x2="12" y2={BH - 40} />
          <text x="44" y={BH - 9}>Z</text><text x="8" y={BH - 44}>X</text></g>
        {form.art !== "rund" && <text className="cam-mass__notiz" x={BW - 8} y={BH - 8} textAnchor="end">● gedachte Spitze</text>}
      </svg>
      {eingaben}
    </div>);
}

function FraesBild({ wz, f, aendern, felder }) {
  // Schematisch gezeichnet: Ø immer gut sichtbar, Länge im Verhältnis
  // begrenzt; Spitzenwinkel und Eckradius im Verhältnis zum Ø stimmen
  const zv = (x) => Number(String(x ?? "").replace(",", "."));
  const d = zv(wz.d) > 0 ? zv(wz.d) : 6, l = zv(wz.laenge) > 0 ? zv(wz.laenge) : 2 * d;
  const D = 6;
  const u = fraeserUmriss({ ...wz, d: String(D), laenge: String(Math.max(5, Math.min(13, l / d * D))), r: zv(wz.r) > 0 ? String(zv(wz.r) / d * D) : wz.r });
  const alle = [...u.schneide, ...u.schaft];
  const R = Math.max(...u.schneide.map((q) => q.z));
  const L = Math.max(...u.schneide.map((q) => q.x));
  const top = Math.max(...alle.map((q) => q.x));
  // Werkzeug senkrecht, Spitze unten; links und rechts Platz für Felder
  const oben = 46, unten = 46;
  const m = Math.min(110 / (2 * R || 1), (BH - oben - unten) / (top || 1));
  const tz = (z) => BW / 2 - 20 + z * m, tx = (x) => BH - unten - x * m;
  const feld = (name) => felder.find((x) => x.name === name);
  const teile = [], eingaben = [];
  // Ø quer über dem Schaft
  const yd = tx(top) - 12;
  teile.push(<Hilfslinie key="d1" a={{ x: tz(-R), y: tx(top) }} b={{ x: tz(-R), y: yd - 4 }} />,
    <Hilfslinie key="d2" a={{ x: tz(R), y: tx(top) }} b={{ x: tz(R), y: yd - 4 }} />,
    <Mass key="d" a={{ x: tz(-R), y: yd }} b={{ x: tz(R), y: yd }} />);
  eingaben.push(<MassFeld key="d" fe={feld("d")} wz={wz} f={f} aendern={aendern} x={tz(0)} y={Math.max(18, yd - 20)} vor="Ø" />);
  // Schneidenlänge rechts der Länge nach
  const xl = tz(R) + 22;
  teile.push(<Hilfslinie key="l1" a={{ x: tz(R) + 2, y: tx(0) }} b={{ x: xl + 4, y: tx(0) }} />,
    <Hilfslinie key="l2" a={{ x: tz(R) + 2, y: tx(L) }} b={{ x: xl + 4, y: tx(L) }} />,
    <Mass key="l" a={{ x: xl, y: tx(L) }} b={{ x: xl, y: tx(0) }} />);
  eingaben.push(<MassFeld key="l" fe={feld("laenge")} wz={wz} f={f} aendern={aendern} x={Math.min(BW - 60, xl + 62)} y={(tx(0) + tx(L)) / 2} vor="Länge" />);
  if (feld("winkel")) {
    // Bogen zwischen den Flanken an der Spitze
    const w = Number(String(wz.winkel ?? "").replace(",", "."));
    const halb = (w > 0 && w < 180 ? w : wz.form === "bohrer" ? 118 : 90) * Math.PI / 360;
    const r0 = Math.min(26, R * m * 0.9), sp = { x: tz(0), y: tx(0) };
    const a = { x: sp.x - Math.sin(halb) * r0, y: sp.y - Math.cos(halb) * r0 }, b = { x: sp.x + Math.sin(halb) * r0, y: sp.y - Math.cos(halb) * r0 };
    teile.push(<path key="w" className="cam-mass__bogen" d={`M${a.x},${a.y} A${r0},${r0} 0 0 1 ${b.x},${b.y}`} />);
    eingaben.push(<MassFeld key="w" fe={feld("winkel")} wz={wz} f={f} aendern={aendern} x={sp.x} y={Math.min(BH - 18, sp.y + 24)} vor="Winkel" />);
  }
  if (feld("r")) {
    const r = Math.min(R, Number(String(wz.r ?? "").replace(",", ".")) || 0);
    const ecke = { x: tz(-R + r * 0.3), y: tx(r * 0.3) };
    const ziel = { x: Math.max(68, ecke.x - 50), y: Math.min(BH - 18, ecke.y + 28) };
    teile.push(<line key="r" className="cam-mass__hilf" x1={ecke.x} y1={ecke.y} x2={ziel.x + 30} y2={ziel.y - 8} />);
    eingaben.push(<MassFeld key="r" fe={feld("r")} wz={wz} f={f} aendern={aendern} {...ziel} vor="R" />);
  }
  return (
    <div className="cam-mass" data-camwz-massbild style={{ width: BW + "px", height: BH + "px" }}>
      <svg className="cam-wz__skizze" data-camwz-skizze viewBox={`0 0 ${BW} ${BH}`} width={BW} height={BH} aria-label="Massbild des Werkzeugs">
        <polygon className="cam-wz__schaft" points={punkte(u.schaft, tz, tx)} />
        <polygon className="cam-wz__platte" points={punkte(u.schneide, tz, tx)} />
        <line className="cam-mass__achse" x1={tz(0)} y1={tx(top) + 4} x2={tz(0)} y2={tx(0) + 8} />
        {teile}
      </svg>
      {eingaben}
    </div>);
}

export function WerkzeugFeld({ b, setze, zu }) {
  const arten = wzArten(b.art);
  const art = wzArt(b);
  const wz = { ...(b.wz || {}), art };
  const f = wzFehler({ ...b, wz });
  const aendern = (n, x) => setze({ ...wz, [n]: x });
  const form = art === "dreh" ? plattenForm(wz.form) : null;
  const felder = wz.form ? wzFelder(wz, art) : [];
  return (
    <div className="cam-vorlage cam-wz" data-camwz>
      <div className="cam-vorlage__kopf">
        <b>Werkzeug</b>
        {arten.length > 1 && <div className="cam-wz__arten" role="group" aria-label="Werkzeugart">
          {arten.map((a) => <button key={a} data-camwz-art={a} className={"knopf knopf--klein" + (a === art ? " aktiv" : "")}
            onClick={() => a !== art && setze({ art: a })}>{a === "dreh" ? "Drehwerkzeug" : "Bohr- / Fräswerkzeug"}</button>)}
        </div>}
        {wz.form && <button className="knopf knopf--klein" data-camwz-weg title="Werkzeugangaben entfernen" onClick={() => setze(null)}>Entfernen</button>}
        <button className="knopf knopf--klein" title="Schliessen" onClick={zu}>✕</button>
      </div>
      <div className="cam-wz__formen" role="group" aria-label="Form">
        {(art === "dreh" ? PLATTEN : FRAESER).map((x) => (
          <button key={x.id} data-camwz-form={x.id} className={"cam-wz__form" + (wz.form === x.id ? " aktiv" : "")}
            title={x.name} onClick={() => aendern("form", x.id)}>
            <FormBild art={art} id={x.id} /><span>{x.name}</span>
          </button>))}
      </div>
      {wz.form && <div className="cam-wz__inhalt">
        {art === "dreh" ? <DrehBild wz={wz} f={f} aendern={aendern} felder={felder} /> : <FraesBild wz={wz} f={f} aendern={aendern} felder={felder} />}
        {art === "dreh" && form && form.art !== "rund" && <div className={"cam-wz__lage" + (f.sl ? " cam-feld--fehler" : "")}>
          <span className="klein">Schneidenlage{wz.sl ? ": " + LAGE_NAME[wz.sl] : " wählen"}</span>
          <div className="kt-lage" role="group" aria-label="Schneidenlage">
            {SPITZEN.map((s) => (
              <button key={s.id} data-camwz-sl={s.id} className={"kt-lage__knopf" + (wz.sl === s.id ? " aktiv" : "")}
                title={LAGE_NAME[s.id]} onClick={() => aendern("sl", s.id)}>
                <svg viewBox="-12 -12 24 24" width="30" height="30" aria-hidden="true">
                  <circle r="6" className="kt-lage__platte" />
                  <circle cx={s.z * 6} cy={-s.r * 6} r="2.6" className="kt-lage__punkt" />
                </svg>
              </button>))}
          </div>
          <span className="klein cam-wz__lagetext">Punkt = Lage der gedachten Spitze zur Schneidenmitte. Die Platte dreht sich im Bild mit.</span>
        </div>}
      </div>}
      {!wz.form && <p className="klein cam-wz__hinweis">Form antippen, dann die Masse direkt im Bild eintragen.</p>}
      <p className="klein cam-wz__hinweis">{art === "dreh"
        ? "Freiwillig, für die Simulation. Rot = fehlt noch."
        : "Freiwillig, für die Simulation. Das Teil steht in Z 0.5 mm vor „Anfahren Z“ (Querwerkzeuge auf der programmierten Lage). Rot = fehlt noch."}</p>
    </div>
  );
}
