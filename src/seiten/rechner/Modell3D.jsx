// =================================================================
//  RECHNER → KONTUR: 3D-ANSICHT DES STEP-MODELLS
//  (seit 1.361.0, Wunsch Patrick 3. November 2026: „ich will nicht
//  eine Ansicht aus der Liste auswählen können, sondern grafisch
//  auswählen“)
//
//  Drahtmodell aus den Kanten der STEP-Datei, ohne 3D-Bibliothek:
//  jede Kante wird gedreht und flach aufs Bild gelegt. Ziehen dreht,
//  Mausrad zoomt. Ein Kreis antippen macht seine Mitte zur Drehachse.
//  Kreise um die gewählte Achse und die Achse selbst sind blau.
// =================================================================

import { useMemo, useRef, useState } from "react";

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const kreuz = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const einheit = (a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };

// Punkte eines Kreises (ganz, oder von a nach b gegen den Uhrzeigersinn um d)
function kreisPunkte(k) {
  const d = einheit(k.d);
  let u = k.x ? einheit(sub(k.x, { x: d.x * dot(k.x, d), y: d.y * dot(k.x, d), z: d.z * dot(k.x, d) })) : null;
  if (!u || !isFinite(u.x)) u = einheit(Math.abs(d.x) < 0.9 ? kreuz(d, { x: 1, y: 0, z: 0 }) : kreuz(d, { x: 0, y: 1, z: 0 }));
  const w = kreuz(d, u);
  const winkel = (p) => { const q = sub(p, k.o); return Math.atan2(dot(q, w), dot(q, u)); };
  let w0 = 0, w1 = Math.PI * 2;
  if (k.a && k.b && Math.hypot(k.a.x - k.b.x, k.a.y - k.b.y, k.a.z - k.b.z) > 1e-6) {
    w0 = winkel(k.a); w1 = winkel(k.b);
    while (w1 <= w0) w1 += Math.PI * 2;
  }
  const n = Math.max(8, Math.ceil((w1 - w0) / (Math.PI / 24)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = w0 + ((w1 - w0) * i) / n;
    const c = Math.cos(t) * k.R, s = Math.sin(t) * k.R;
    pts.push({ x: k.o.x + u.x * c + w.x * s, y: k.o.y + u.y * c + w.y * s, z: k.o.z + u.z * c + w.z * s });
  }
  return pts;
}

// Liegt der Kreis um die Achse (gleiche Richtung, Mitte auf der Achse)?
function umAchse(k, a) {
  if (!a) return false;
  const d = einheit(a.d), kd = einheit(k.d);
  if (Math.abs(Math.abs(dot(d, kd)) - 1) > 1e-6) return false;
  const q = sub(k.o, a.o); const t = dot(q, d);
  return Math.hypot(q.x - d.x * t, q.y - d.y * t, q.z - d.z * t) < 1e-3;
}

export default function Modell3D({ kanten, achse, waehlen }) {
  // Linienzüge einmal rechnen
  const zuege = useMemo(() => kanten.map((k) => (k.art === "kreis" ? { k, pts: kreisPunkte(k) } : { k, pts: k.art === "zug" ? k.pts : [k.a, k.b] })), [kanten]);
  const alle = zuege.flatMap((z) => z.pts);
  const mitte = useMemo(() => {
    const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of alle) for (const c of ["x", "y", "z"]) { min[c] = Math.min(min[c], p[c]); max[c] = Math.max(max[c], p[c]); }
    return { m: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }, gross: Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) || 1 };
  }, [zuege]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dreh, setDreh] = useState({ a: -0.6, b: 0.45 });
  const [zoom, setZoom] = useState(1);
  const ziehen = useRef(null);

  // Drehen um die senkrechte Achse (a), dann kippen (b)
  const proj = (p) => {
    const q = sub(p, mitte.m);
    const ca = Math.cos(dreh.a), sa = Math.sin(dreh.a), cb = Math.cos(dreh.b), sb = Math.sin(dreh.b);
    const x1 = q.x * ca - q.y * sa, y1 = q.x * sa + q.y * ca;
    const y2 = y1 * cb - q.z * sb;
    return { x: x1, y: -(y1 * sb + q.z * cb), t: y2 };
  };
  const h = mitte.gross / 2 / zoom;
  const box = `${-h * 1.4} ${-h} ${h * 2.8} ${h * 2}`;
  const linie = (pts) => pts.map((p, i) => { const q = proj(p); return (i ? "L" : "M") + q.x.toFixed(3) + " " + q.y.toFixed(3); }).join("");

  // Achse als lange Strichpunktlinie durch das Teil
  let achsLinie = null;
  if (achse) {
    const d = einheit(achse.d); const t = dot(sub(mitte.m, achse.o), d);
    const m = { x: achse.o.x + d.x * t, y: achse.o.y + d.y * t, z: achse.o.z + d.z * t };
    const l = mitte.gross * 0.65;
    achsLinie = linie([{ x: m.x - d.x * l, y: m.y - d.y * l, z: m.z - d.z * l }, { x: m.x + d.x * l, y: m.y + d.y * l, z: m.z + d.z * l }]);
  }

  return (
    <div className="kt-3d">
      <svg className="kt-3d__bild" viewBox={box} id="kt-modell-3d"
        onPointerDown={(e) => { ziehen.current = { x: e.clientX, y: e.clientY, d: dreh, weit: 0 }; }}
        onPointerMove={(e) => {
          const z = ziehen.current; if (!z) return;
          const dx = e.clientX - z.x, dy = e.clientY - z.y;
          z.weit = Math.max(z.weit, Math.abs(dx) + Math.abs(dy));
          if (z.weit > 4) { e.currentTarget.setPointerCapture?.(e.pointerId); setDreh({ a: z.d.a + dx * 0.01, b: Math.max(-1.55, Math.min(1.55, z.d.b + dy * 0.01)) }); }
        }}
        onPointerUp={() => { setTimeout(() => { ziehen.current = null; }, 0); }}
        onWheel={(e) => { e.preventDefault?.(); setZoom((z) => Math.max(0.3, Math.min(20, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))); }}>
        {zuege.map((z, i) => <path key={i} d={linie(z.pts)} className={"kt-3d__kante" + (z.k.art === "kreis" && umAchse(z.k, achse) ? " achse" : "")} />)}
        {achsLinie && <path d={achsLinie} className="kt-3d__achse" />}
        {/* Kreise antippbar, breit und unsichtbar darüber */}
        {zuege.map((z, i) => z.k.art === "kreis" && (
          <path key={"t" + i} d={linie(z.pts)} className="kt-3d__treffer" data-ktkreis={i}
            onClick={() => { if (ziehen.current && ziehen.current.weit > 4) return; waehlen({ o: z.k.o, d: einheit(z.k.d) }); }}>
            <title>Diesen Kreis als Drehachse</title>
          </path>
        ))}
      </svg>
      <div className="kt-3d__knoepfe">
        <button className="knopf knopf--klein" onClick={() => setDreh({ a: 0, b: 0 })}>Von vorne</button>
        <button className="knopf knopf--klein" onClick={() => setDreh({ a: 0, b: Math.PI / 2 - 0.001 })}>Von oben</button>
        <button className="knopf knopf--klein" onClick={() => setDreh({ a: Math.PI / 2, b: 0 })}>Von der Seite</button>
        <button className="knopf knopf--klein" onClick={() => { setDreh({ a: -0.6, b: 0.45 }); setZoom(1); }}>Schräg</button>
      </div>
    </div>
  );
}
