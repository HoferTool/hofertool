// =================================================================
//  HOFERCAM: Werkzeug gross in 3D ansehen und messen (seit 1.710.0)
//  Wunsch Patrick 22. November 2026: „ich will die 3D-Modelle der realen
//  Werkzeuge anklicken und gross betrachten können, und schwenken und
//  drehen und messen“. Antippen des kleinen Bilds in „📚 Reale Werkzeuge“
//  öffnet dieses Fenster. Dieselben Körper wie das kleine Bild und die
//  Simulation (koerperVon), gezeichnet mit dem Maleralgorithmus.
//  Ziehen dreht, Shift / rechte / mittlere Taste oder zwei Finger
//  verschieben, Mausrad und Zwei-Finger-Zoom zoomen dorthin, wo man zeigt.
//  Messen: zwei Punkte antippen, die App rastet auf Ecken und Kantenmitten
//  ein und zeigt Abstand und dX / dY / dZ in mm.
// =================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { wzText } from "./camWerkzeug.js";
import { FARBE, koerperVon } from "./CamWzMini3D.jsx";

const ANSICHTEN = [["iso", "Iso", 0.7, 0.5], ["vorne", "Vorne", 0, 0], ["oben", "Oben", 0, Math.PI / 2], ["seite", "Seite", Math.PI / 2, 0]];
const FANG_PX = 18;
const zahl = (v) => (Math.round(v * 1000) / 1000).toFixed(3).replace(/\.?0+$/, "") || "0";

let offenZu = null;
export function werkzeugGrossOeffnen(e) {
  if (offenZu) offenZu();
  offenZu = fensterOeffnen((zu) => <WzGross e={e} zu={zu} />, () => { offenZu = null; }, "cam-wzg-huelle");
}

// Ecken und Kantenmitten zum Einrasten, doppelte zusammengefasst
function fangPunkte(flaechen) {
  const m = new Map();
  const dazu = (p) => { const k = p.map((v) => Math.round(v * 1000)).join(","); if (!m.has(k)) m.set(k, p); };
  for (const f of flaechen) {
    f.pts.forEach((p, i) => {
      dazu(p);
      const q = f.pts[(i + 1) % f.pts.length];
      dazu([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]);
    });
  }
  return [...m.values()];
}

function WzGross({ e, zu }) {
  const wz = e.wz;
  const schluessel = JSON.stringify(wz || null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flaechen = useMemo(() => koerperVon(wz), [schluessel]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fang = useMemo(() => fangPunkte(flaechen), [flaechen]);
  const box = useMemo(() => {
    const alle = flaechen.flatMap((f) => f.pts);
    if (!alle.length) return null;
    const lo = [0, 1, 2].map((i) => Math.min(...alle.map((p) => p[i])));
    const hi = [0, 1, 2].map((i) => Math.max(...alle.map((p) => p[i])));
    const mitte = lo.map((v, i) => (v + hi[i]) / 2);
    const r = Math.max(0.001, ...alle.map((p) => Math.hypot(p[0] - mitte[0], p[1] - mitte[1], p[2] - mitte[2])));
    return { lo, hi, mitte, r };
  }, [flaechen]);

  const flaeche = useRef(null);
  const cvRef = useRef(null);
  const sicht = useRef({ a: 0.7, t: 0.5, zoom: 1, px: 0, py: 0 });
  const [, neu] = useState(0);
  const [messen, setMessen] = useState(false);
  const [punkte, setPunkte] = useState([]);
  const [zeiger, setZeiger] = useState(null);
  const groesse = useRef({ w: 800, h: 560, dpr: 1 });

  // Projektion: Modell (mm) → Bildschirm (CSS-Pixel), z grösser = vorne
  const proj = () => {
    const { a, t, zoom, px, py } = sicht.current;
    const { w, h } = groesse.current;
    const s = (Math.min(w, h) * 0.44 / (box ? box.r : 1)) * zoom;
    const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(t), st = Math.sin(t);
    const m = box ? box.mitte : [0, 0, 0];
    return (p) => {
      const x = p[0] - m[0], y = p[1] - m[1], z = p[2] - m[2];
      const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      return [w / 2 + px + x1 * s, h / 2 + py - y2 * s, z2, s];
    };
  };

  const zeichnen = () => {
    const cv = cvRef.current;
    if (!cv) return;
    const { w, h, dpr } = groesse.current;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!flaechen.length) return;
    const P = proj();
    const licht = [0.35, 0.55, 0.76];
    const liste = flaechen.map((f) => {
      const q = f.pts.map(P);
      // Normale im gedrehten Raum (y nach oben, wie im kleinen Bild)
      const r = q.map((p) => [p[0], -p[1], p[2]]);
      let n = [0, 0, 0];
      for (let i = 0; i < r.length; i++) {
        const p0 = r[i], p1 = r[(i + 1) % r.length];
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
      f.q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fillStyle = "rgb(" + c.map((v) => Math.round(v * f.hell)).join(",") + ")";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.16)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    // Achsenkreuz unten links, damit dX / dY / dZ zu sehen sind
    const { a, t } = sicht.current;
    const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(t), st = Math.sin(t);
    const achse = (v) => { const x1 = v[0] * ca + v[2] * sa, z1 = -v[0] * sa + v[2] * ca; return [x1, v[1] * ct - z1 * st]; };
    const o = [46, h - 46];
    [["X", [1, 0, 0], "#d84343"], ["Y", [0, 1, 0], "#2e9d4a"], ["Z", [0, 0, 1], "#2f6fd6"]].forEach(([n, v, farbe]) => {
      const [dx, dy] = achse(v);
      ctx.strokeStyle = farbe; ctx.fillStyle = farbe; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(o[0] + dx * 30, o[1] - dy * 30); ctx.stroke();
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillText(n, o[0] + dx * 38 - 4, o[1] - dy * 38 + 5);
    });
    // Messpunkte und Linie
    const pp = punkte.map(P);
    if (pp.length === 2) {
      ctx.strokeStyle = "#ff7a00"; ctx.lineWidth = 2.5; ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.moveTo(pp[0][0], pp[0][1]); ctx.lineTo(pp[1][0], pp[1][1]); ctx.stroke();
      ctx.setLineDash([]);
    }
    pp.forEach((p, i) => {
      ctx.fillStyle = "#ff7a00"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#111"; ctx.font = "bold 12px system-ui, sans-serif";
      ctx.fillText(String(i + 1), p[0] + 9, p[1] - 8);
    });
    if (messen && zeiger) {
      const p = P(zeiger);
      ctx.strokeStyle = "#ff7a00"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, Math.PI * 2); ctx.stroke();
    }
  };

  // Grösse der Leinwand folgt dem Fenster
  useEffect(() => {
    const el = flaeche.current, cv = cvRef.current;
    if (!el || !cv) return undefined;
    const anpassen = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      groesse.current = { w: Math.max(200, r.width), h: Math.max(200, r.height), dpr };
      cv.width = Math.round(groesse.current.w * dpr); cv.height = Math.round(groesse.current.h * dpr);
      zeichnen();
    };
    anpassen();
    const ro = new ResizeObserver(anpassen);
    ro.observe(el);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flaechen]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { zeichnen(); });

  // nächster Fangpunkt zur Bildschirmstelle; bei fast gleich weit gewinnt der vordere
  const fangen = (x, y) => {
    const P = proj();
    let best = null;
    for (const p of fang) {
      const q = P(p);
      const d = Math.hypot(q[0] - x, q[1] - y);
      if (d > FANG_PX) continue;
      if (!best || d < best.d - 4 || (Math.abs(d - best.d) <= 4 && q[2] > best.z)) best = { p, d, z: q[2] };
    }
    return best ? best.p : null;
  };

  // Ziehen, Verschieben, Zoom mit Maus und Fingern
  const zeiger2 = useRef(new Map());
  const zug = useRef(null);
  const lage = (ev) => { const r = cvRef.current.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  const zoomAn = (fak, x, y) => {
    const v = sicht.current;
    const z2 = Math.min(60, Math.max(0.2, v.zoom * fak));
    const f = z2 / v.zoom;
    const { w, h } = groesse.current;
    v.px = (x - w / 2) - (x - w / 2 - v.px) * f;
    v.py = (y - h / 2) - (y - h / 2 - v.py) * f;
    v.zoom = z2;
    neu((n) => n + 1);
  };
  const runter = (ev) => {
    ev.preventDefault();
    cvRef.current.setPointerCapture(ev.pointerId);
    const [x, y] = lage(ev);
    zeiger2.current.set(ev.pointerId, [x, y]);
    const schieben = ev.shiftKey || ev.button === 1 || ev.button === 2;
    zug.current = { x0: x, y0: y, x, y, schieben, bewegt: false, zwei: zeiger2.current.size >= 2 ? abstandMitte() : null };
  };
  const abstandMitte = () => {
    const [p, q] = [...zeiger2.current.values()];
    return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), mx: (p[0] + q[0]) / 2, my: (p[1] + q[1]) / 2 };
  };
  const bewegen = (ev) => {
    const [x, y] = lage(ev);
    if (!zug.current) { if (messen) setZeiger(fangen(x, y)); return; }
    zeiger2.current.set(ev.pointerId, [x, y]);
    const z = zug.current;
    const v = sicht.current;
    if (zeiger2.current.size >= 2) {
      const jetzt = abstandMitte();
      if (z.zwei) {
        zoomAn(jetzt.d / (z.zwei.d || 1), jetzt.mx, jetzt.my);
        v.px += jetzt.mx - z.zwei.mx; v.py += jetzt.my - z.zwei.my;
      }
      z.zwei = jetzt; z.bewegt = true;
      neu((n) => n + 1);
      return;
    }
    const dx = x - z.x, dy = y - z.y;
    z.x = x; z.y = y;
    if (Math.hypot(x - z.x0, y - z.y0) > 4) z.bewegt = true;
    if (!z.bewegt) return;
    if (z.schieben) { v.px += dx; v.py += dy; } else {
      v.a += dx * 0.01;
      v.t = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, v.t + dy * 0.01));
    }
    neu((n) => n + 1);
  };
  const hoch = (ev) => {
    zeiger2.current.delete(ev.pointerId);
    const z = zug.current;
    if (zeiger2.current.size) { if (z) z.zwei = null; return; }
    zug.current = null;
    if (z && !z.bewegt && messen) {
      const p = fangen(...lage(ev));
      if (p) setPunkte((alt) => (alt.length >= 2 ? [p] : [...alt, p]));
    }
  };
  const rad = (ev) => { ev.preventDefault(); const [x, y] = lage(ev); zoomAn(Math.exp(-ev.deltaY * 0.0015), x, y); };
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return undefined;
    cv.addEventListener("wheel", rad, { passive: false });
    return () => cv.removeEventListener("wheel", rad);
  });

  const ansicht = (a, t) => { sicht.current = { a, t, zoom: 1, px: 0, py: 0 }; neu((n) => n + 1); };
  const mass = punkte.length === 2 ? punkte[1].map((v, i) => v - punkte[0][i]) : null;
  const titel = (e.nr || "Werkzeug") + (e.lief ? " · " + e.lief : "");

  return (<div className="dialog cam-wzg" data-cam-wzg="fenster" role="dialog" aria-label={"3D " + titel}>
    <div className="cam-wzg__kopf">
      <div className="cam-wzg__titel">
        <h2>{titel}</h2>
        <div className="klein" data-cam-wzg-wz>{wz ? wzText({ art: "k2", wz }) : ""}</div>
        {box && <div className="klein" data-cam-wzg-huelle>Aussenmasse: X {zahl(box.hi[0] - box.lo[0])} · Y {zahl(box.hi[1] - box.lo[1])} · Z {zahl(box.hi[2] - box.lo[2])} mm</div>}
      </div>
      <button className="knopf knopf--klein" data-cam-wzg-zu onClick={zu}>✕</button>
    </div>
    <div className="cam-wzg__leiste">
      {ANSICHTEN.map(([id, text, a, t]) => <button key={id} className="knopf knopf--klein" data-cam-wzg-ansicht={id} onClick={() => ansicht(a, t)}>{text}</button>)}
      <button className="knopf knopf--klein" data-cam-wzg-alles onClick={() => { const v = sicht.current; v.zoom = 1; v.px = 0; v.py = 0; neu((n) => n + 1); }}>Alles zeigen</button>
      <span className="cam-wzg__luecke" />
      <button className={"knopf knopf--klein" + (messen ? " aktiv" : "")} data-cam-wzg-messen
        onClick={() => { setMessen(!messen); setPunkte([]); setZeiger(null); }}>📏 {messen ? "Messen aus" : "Messen"}</button>
      {punkte.length > 0 && <button className="knopf knopf--klein" data-cam-wzg-leeren onClick={() => setPunkte([])}>Punkte löschen</button>}
    </div>
    <div className="cam-wzg__flaeche" ref={flaeche}>
      {!flaechen.length && <p className="klein cam-wzg__leer">Für dieses Werkzeug gibt es kein 3D-Bild.</p>}
      <canvas ref={cvRef} className={"cam-wzg__cv" + (messen ? " cam-wzg__cv--messen" : "")} data-cam-wzg-cv={flaechen.length}
        onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch}
        onPointerLeave={() => setZeiger(null)} onContextMenu={(ev) => ev.preventDefault()} />
      {messen && <div className="cam-wzg__mass" data-cam-wzg-mass={mass ? zahl(Math.hypot(...mass)) : ""}>
        {mass ? (<>
          <b>Abstand {zahl(Math.hypot(...mass))} mm</b>
          <span>dX {zahl(Math.abs(mass[0]))} · dY {zahl(Math.abs(mass[1]))} · dZ {zahl(Math.abs(mass[2]))} mm</span>
        </>) : <span>{punkte.length ? "Zweiten Punkt antippen" : "Ersten Punkt antippen (rastet auf Ecken und Kantenmitten ein)"}</span>}
      </div>}
    </div>
    <p className="klein cam-wzg__hilfe">Ziehen dreht · Shift, rechte Maustaste oder zwei Finger verschieben · Mausrad oder zwei Finger zoomen</p>
  </div>);
}
