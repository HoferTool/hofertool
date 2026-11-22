// =================================================================
//  HOFERCAM: kleines 3D-Bild eines Werkzeugs (seit 1.695.0)
//  Wunsch Patrick 22. November 2026: „kannst du die Werkzeuge dann auch
//  gerade in einem kleinen 3D-Bild anzeigen?“ Dieselben Körper wie in der
//  Simulation (camKoerper.js), gezeichnet mit dem Maleralgorithmus auf
//  einer kleinen Leinwand. Steht still schräg; mit der Maus darüber oder
//  beim Antippen dreht es sich, so laufen in langen Listen nicht dutzende
//  Bilder zugleich.
// =================================================================

import { useEffect, useMemo, useRef } from "react";
import { drehKoerper, fraeserKoerper } from "./camKoerper.js";
import { plattenUmriss } from "./camWerkzeug.js";

function koerperVon(wz) {
  if (!wz || !wz.form) return [];
  try {
    // Seit 1.696.1 mit dem Halter wie in der Simulation, Ausdreher als
    // Bohrstange mit Hals und Schaft aus dem Katalog (Patrick 22. November
    // 2026: „das wäre ja ein Ausdreher, du hast gesagt du baust sie richtig nach“)
    if (wz.art === "dreh") {
      const n = (v) => { const x = Number(String(v ?? "").replace(",", ".")); return x > 0 ? x : 0; };
      const rb = n(wz.dmin) ? n(wz.dmin) / 2 : 2;
      return drehKoerper(wz, { z: 0, r: 0 }, plattenUmriss(wz), { innen: { rb, tiefe: n(wz.hals) || 6, dir: -1 } });
    }
    return fraeserKoerper(wz, [0, 0, 0], [0, 1, 0]);
  } catch (f) { return []; }
}

const FARBE = { schneide: [214, 166, 64], werkzeug: [150, 160, 172], halter: [70, 84, 102] };

function malen(cv, flaechen, a, t) {
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  if (!flaechen.length) return;
  const alle = flaechen.flatMap((f) => f.pts);
  const mitte = [0, 1, 2].map((i) => (Math.min(...alle.map((p) => p[i])) + Math.max(...alle.map((p) => p[i]))) / 2);
  const gross = Math.max(0.001, ...alle.map((p) => Math.hypot(p[0] - mitte[0], p[1] - mitte[1], p[2] - mitte[2])));
  const s = (Math.min(W, H) * 0.46) / gross;
  const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(t), st = Math.sin(t);
  const dreh = (p) => {
    const x = p[0] - mitte[0], y = p[1] - mitte[1], z = p[2] - mitte[2];
    const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
    return [x1, y * ct - z1 * st, y * st + z1 * ct];
  };
  const licht = [0.35, 0.55, 0.76];
  const liste = flaechen.map((f) => {
    const q = f.pts.map(dreh);
    let n = [0, 0, 0];
    for (let i = 0; i < q.length; i++) {
      const p0 = q[i], p1 = q[(i + 1) % q.length];
      n = [n[0] + (p0[1] - p1[1]) * (p0[2] + p1[2]), n[1] + (p0[2] - p1[2]) * (p0[0] + p1[0]), n[2] + (p0[0] - p1[0]) * (p0[1] + p1[1])];
    }
    const l = Math.hypot(...n) || 1;
    const hell = 0.35 + 0.65 * Math.abs((n[0] * licht[0] + n[1] * licht[1] + n[2] * licht[2]) / l);
    return { q, tief: q.reduce((x, p) => x + p[2], 0) / q.length, hell, art: f.art };
  });
  liste.sort((p, r) => p.tief - r.tief);
  for (const f of liste) {
    const c = FARBE[f.art] || FARBE.werkzeug;
    ctx.beginPath();
    f.q.forEach((p, i) => { const x = W / 2 + p[0] * s, y = H / 2 - p[1] * s; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath();
    ctx.fillStyle = "rgb(" + c.map((v) => Math.round(v * f.hell)).join(",") + ")";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

export function WzMini3D({ wz, gross = 72 }) {
  const ref = useRef(null);
  const lauf = useRef(null);
  const winkel = useRef(0.7);
  const schluessel = JSON.stringify(wz || null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flaechen = useMemo(() => koerperVon(wz), [schluessel]);
  const zeichnen = () => { if (ref.current) malen(ref.current, flaechen, winkel.current, 0.5); };
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(gross * dpr); cv.height = Math.round(gross * dpr);
    zeichnen();
    return () => { if (lauf.current) cancelAnimationFrame(lauf.current); lauf.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flaechen, gross]);
  const start = () => {
    if (lauf.current) return;
    let vorher = performance.now();
    const schritt = (jetzt) => {
      winkel.current += (jetzt - vorher) / 1000 * 1.4;
      vorher = jetzt;
      zeichnen();
      lauf.current = requestAnimationFrame(schritt);
    };
    lauf.current = requestAnimationFrame(schritt);
  };
  const halt = () => { if (lauf.current) cancelAnimationFrame(lauf.current); lauf.current = null; };
  if (!flaechen.length) return <span className="cam-mini3d cam-mini3d--leer" style={{ width: gross, height: gross }} data-cam-mini3d="leer">?</span>;
  return <canvas ref={ref} className="cam-mini3d" data-cam-mini3d={flaechen.length} style={{ width: gross, height: gross }}
    onMouseEnter={start} onMouseLeave={halt} onPointerDown={() => (lauf.current ? halt() : start())}
    title="Maus darüber dreht das Werkzeug" />;
}
