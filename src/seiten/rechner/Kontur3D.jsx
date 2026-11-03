// =================================================================
//  RECHNER → KONTUR: 3D-ANSICHT DER ERZEUGTEN KONTUR
//  (seit 1.381.0, Wunsch Patrick 3. November 2026: „kannst du
//  zusätzlich eine 3D-Ansicht machen für die erzeugte Kontur“)
//
//  Die Fertigkontur wird um die Drehachse gedreht und als schattierter
//  Körper gezeichnet, ohne 3D-Bibliothek: Ringe aus kleinen Vierecken,
//  von hinten nach vorne gemalt (Maleralgorithmus), Licht von oben
//  links. „Aufgeschnitten“ lässt ein Viertel weg und zeigt die Schnitt-
//  fläche, so sieht man auch Bohrungen und Innenkonturen. Ziehen dreht,
//  Mausrad oder zwei Finger zoomen, ein Tipp auf den Körper wählt das
//  Element wie in der 2D-Grafik (gewählt = orange).
// =================================================================

import { useEffect, useRef, useState } from "react";
import { bogenWinkel } from "./kontur.js";

const EPS = 1e-6;

// Profil (z, r) aus den Segmenten, je Kante die Elementnummer
function profil(segmente) {
  const pts = [];
  const dazu = (p, nr) => {
    const l = pts[pts.length - 1];
    if (l && Math.hypot(l.z - p.z, l.r - p.r) < EPS) return;
    pts.push({ z: p.z, r: Math.max(0, p.r), nr });
  };
  segmente.forEach((s) => {
    dazu(s.a, null);
    if (s.t === "L") { dazu(s.b, s.nr); return; }
    const wa = Math.atan2(s.a.r - s.c.r, s.a.z - s.c.z);
    const weit = bogenWinkel(s);
    const n = Math.max(4, Math.min(48, Math.ceil(weit / (Math.PI / 30))));
    for (let i = 1; i <= n; i++) {
      const w = wa + (s.ccw ? 1 : -1) * weit * (i / n);
      dazu({ z: s.c.z + Math.cos(w) * s.R, r: s.c.r + Math.sin(w) * s.R }, s.nr);
    }
  });
  return pts;
}

// Geschlossener Umriss des Materials im Längsschnitt: aussen bis zur
// Mitte, innen bis zu einem gedachten Rohteil aussen herum (wie die
// graue Fläche in der 2D-Grafik).
function umriss(segmente, innen) {
  const p = profil(segmente);
  if (p.length < 2) return null;
  const rmax = Math.max(...p.map((q) => q.r));
  const rand = innen ? Math.max(rmax * 1.25, rmax + 2) : 0;
  const a = p[0], e = p[p.length - 1];
  const zug = [];
  if (Math.abs(a.r - rand) > EPS) zug.push({ z: a.z, r: rand, nr: null });
  p.forEach((q, i) => zug.push({ ...q, nr: i === 0 && zug.length ? null : q.nr }));
  if (Math.abs(e.r - rand) > EPS) zug.push({ z: e.z, r: rand, nr: null });
  return { zug, rand, rmax: Math.max(rmax, rand) };
}

// Dreiecke der Schnittfläche (Ohrenschneiden, genügt für einfache Umrisse)
function dreiecke(poly) {
  const p = poly.filter((q, i) => i === 0 || Math.hypot(q.z - poly[i - 1].z, q.r - poly[i - 1].r) > EPS);
  if (p.length > 2 && Math.hypot(p[0].z - p[p.length - 1].z, p[0].r - p[p.length - 1].r) < EPS) p.pop();
  if (p.length < 3) return [];
  let flaeche = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; flaeche += a.z * b.r - b.z * a.r; }
  const idx = p.map((_, i) => i);
  if (flaeche < 0) idx.reverse();
  const kr = (a, b, c) => (b.z - a.z) * (c.r - a.r) - (b.r - a.r) * (c.z - a.z);
  const drin = (q, a, b, c) => kr(a, b, q) > EPS && kr(b, c, q) > EPS && kr(c, a, q) > EPS;
  const aus = [];
  let schutz = idx.length * idx.length;
  while (idx.length > 3 && schutz-- > 0) {
    let fund = false;
    for (let i = 0; i < idx.length; i++) {
      const a = p[idx[(i + idx.length - 1) % idx.length]], b = p[idx[i]], c = p[idx[(i + 1) % idx.length]];
      if (kr(a, b, c) <= EPS) continue;
      if (idx.some((j) => { const q = p[j]; return q !== a && q !== b && q !== c && drin(q, a, b, c); })) continue;
      aus.push([a, b, c]); idx.splice(i, 1); fund = true; break;
    }
    if (!fund) break;
  }
  if (idx.length === 3) aus.push(idx.map((j) => p[j]));
  return aus;
}

// Grosse Dreiecke teilen, damit die Malreihenfolge stimmt
function teilen(t, max, aus) {
  const [a, b, c] = t;
  const l = Math.max(Math.hypot(a.z - b.z, a.r - b.r), Math.hypot(b.z - c.z, b.r - c.r), Math.hypot(c.z - a.z, c.r - a.r));
  if (l <= max || aus.length > 4000) { aus.push(t); return; }
  const m = (p, q) => ({ z: (p.z + q.z) / 2, r: (p.r + q.r) / 2 });
  const ab = m(a, b), bc = m(b, c), ca = m(c, a);
  [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]].forEach((n) => teilen(n, max, aus));
}

const SCHRAEG = { a: -0.55, b: 0.42 };

export default function Kontur3D({ segmente, innen, wahl, setWahl, hoehe = 300, gross }) {
  const rahmen = useRef(null);
  const leinwand = useRef(null);
  const [dreh, setDreh] = useState(SCHRAEG);
  const [zoom, setZoom] = useState(1);
  const [schnitt, setSchnitt] = useState(!!innen);
  const [breite, setBreite] = useState(600);
  const ziehen = useRef(null);
  const finger = useRef(new Map());
  const flaechen = useRef([]);

  useEffect(() => { setSchnitt(!!innen); }, [innen]);
  useEffect(() => {
    const el = rahmen.current;
    if (!el) return;
    const w = el.ownerDocument.defaultView || window;
    const messen = () => setBreite(Math.max(200, el.clientWidth));
    messen();
    if (!w.ResizeObserver) return;
    const ro = new w.ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zeichnen bei jeder Änderung
  useEffect(() => {
    const cv = leinwand.current;
    if (!cv) return;
    const win = cv.ownerDocument.defaultView || window;
    const dpr = Math.min(2, win.devicePixelRatio || 1);
    const W = breite, H = hoehe;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const u = umriss(segmente, innen);
    flaechen.current = [];
    if (!u) {
      g.fillStyle = "#8a96a3"; g.font = "14px sans-serif"; g.textAlign = "center";
      g.fillText("Noch keine Kontur", W / 2, H / 2);
      return;
    }
    const { zug, rmax } = u;
    const zmin = Math.min(...zug.map((q) => q.z)), zmax = Math.max(...zug.map((q) => q.z));
    const zm = (zmin + zmax) / 2;
    const diag = Math.hypot(zmax - zmin, 2 * rmax) || 1;
    const s = Math.min(W, H) / (diag * 1.08) * zoom;

    // Welt: x entlang der Achse, y nach oben, w zum Betrachter
    const ca = Math.cos(dreh.a), sa = Math.sin(dreh.a), cb = Math.cos(dreh.b), sb = Math.sin(dreh.b);
    const ansicht = (z, r, phi) => {
      const x = z - zm, y = r * Math.cos(phi), w = r * Math.sin(phi);
      const x1 = x * ca + w * sa, w1 = -x * sa + w * ca;
      const y2 = y * cb - w1 * sb, w2 = y * sb + w1 * cb;
      return { x: x1, y: y2, t: w2 };
    };
    const L = (() => { const v = [-0.45, 0.65, 0.62]; const l = Math.hypot(...v); return v.map((c) => c / l); })();
    const Hh = (() => { const v = [L[0], L[1], L[2] + 1]; const l = Math.hypot(...v); return v.map((c) => c / l); })();
    const liste = [];
    const flaeche = (pts, art, nr) => {
      // Normale aus zwei Diagonalen, beidseitig beleuchtet
      const a = pts[0], b = pts[1], c = pts[2], d = pts[3] || pts[2];
      const u1 = [c.x - a.x, c.y - a.y, c.t - a.t], u2 = [d.x - b.x, d.y - b.y, d.t - b.t];
      if (pts.length === 3) { u2[0] = b.x - a.x; u2[1] = b.y - a.y; u2[2] = b.t - a.t; }
      let n = [u1[1] * u2[2] - u1[2] * u2[1], u1[2] * u2[0] - u1[0] * u2[2], u1[0] * u2[1] - u1[1] * u2[0]];
      const l = Math.hypot(...n);
      if (l < 1e-12) return;
      n = n.map((c2) => c2 / l);
      if (n[2] < 0) n = n.map((c2) => -c2);
      const diff = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      const glanz = Math.pow(Math.max(0, n[0] * Hh[0] + n[1] * Hh[1] + n[2] * Hh[2]), 40);
      const tiefe = pts.reduce((m, p) => m + p.t, 0) / pts.length;
      liste.push({ pts, art, nr, hell: 0.5 + 0.6 * diff, glanz, tiefe });
    };

    // Mantel: jede Kante des Umrisses um die Achse gedreht
    const N = 64;
    const von = schnitt ? Math.PI / 2 : 0, bis = 2 * Math.PI;
    const schritte = schnitt ? Math.round(N * 0.75) : N;
    for (let i = 0; i < zug.length - 1 + (innen ? 1 : 0); i++) {
      const p = zug[i], q = zug[(i + 1) % zug.length];
      if (p.r < EPS && q.r < EPS) continue;
      const nr = (i + 1) < zug.length ? zug[i + 1].nr : null;
      for (let j = 0; j < schritte; j++) {
        const f0 = von + ((bis - von) * j) / schritte, f1 = von + ((bis - von) * (j + 1)) / schritte;
        flaeche([ansicht(p.z, p.r, f0), ansicht(q.z, q.r, f0), ansicht(q.z, q.r, f1), ansicht(p.z, p.r, f1)], "mantel", nr);
      }
    }
    // Schnittflächen bei 90° und 360°
    if (schnitt) {
      const tris = [];
      dreiecke(zug).forEach((t) => teilen(t, diag / 14, tris));
      [von, bis].forEach((phi) => tris.forEach((t) => flaeche(t.map((p) => ansicht(p.z, p.r, phi)), "schnitt", null)));
    }
    liste.sort((x, y) => x.tiefe - y.tiefe);

    const ox = W / 2, oy = H / 2;
    const farbe = (f) => {
      const basis = f.art === "schnitt" ? [226, 176, 120] : f.nr != null && f.nr - 1 === wahl ? [236, 140, 30] : [176, 190, 206];
      const k = f.hell;
      return `rgb(${basis.map((c) => Math.min(255, Math.round(c * k + 255 * f.glanz * 0.55))).join(",")})`;
    };
    g.lineJoin = "round";
    g.lineWidth = 0.7;
    for (const f of liste) {
      const pp = f.pts.map((p) => ({ x: ox + p.x * s, y: oy - p.y * s }));
      g.beginPath();
      pp.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      const c = farbe(f);
      g.fillStyle = c; g.strokeStyle = c;
      g.fill(); g.stroke();
      f.bild = pp;
    }
    // Mittellinie nur vor und hinter dem Teil, damit sie nicht durch den Körper scheint
    const strich = (z1, z2) => { const a1 = ansicht(z1, 0, 0), a2 = ansicht(z2, 0, 0); g.moveTo(ox + a1.x * s, oy - a1.y * s); g.lineTo(ox + a2.x * s, oy - a2.y * s); };
    g.setLineDash([10, 4, 2, 4]); g.strokeStyle = "rgba(220,60,60,.75)"; g.lineWidth = 1;
    g.beginPath(); strich(zmin - diag * 0.12, zmin); strich(zmax, zmax + diag * 0.12); g.stroke();
    g.setLineDash([]);
    flaechen.current = liste;
  }, [segmente, innen, wahl, dreh, zoom, schnitt, breite, hoehe]);

  // Tipp auf den Körper: oberste Fläche unter dem Finger
  const treffen = (e) => {
    const cv = leinwand.current; if (!cv || !setWahl) return;
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const l = flaechen.current;
    for (let i = l.length - 1; i >= 0; i--) {
      const pp = l[i].bild; if (!pp) continue;
      let drin = false;
      for (let a = 0, b = pp.length - 1; a < pp.length; b = a++) {
        if ((pp[a].y > y) !== (pp[b].y > y) && x < ((pp[b].x - pp[a].x) * (y - pp[a].y)) / (pp[b].y - pp[a].y) + pp[a].x) drin = !drin;
      }
      if (drin) { if (l[i].nr != null) setWahl(l[i].nr - 1); return; }
    }
  };

  const runter = (e) => {
    finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    ziehen.current = { x: e.clientX, y: e.clientY, d: dreh, z: zoom, weit: 0, abst: null };
    if (finger.current.size === 2) {
      const [p, q] = [...finger.current.values()];
      ziehen.current.abst = Math.hypot(p.x - q.x, p.y - q.y);
    }
  };
  const bewegen = (e) => {
    const z = ziehen.current; if (!z) return;
    finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (finger.current.size === 2 && z.abst) {
      const [p, q] = [...finger.current.values()];
      z.weit = 99;
      setZoom(Math.max(0.3, Math.min(12, z.z * Math.hypot(p.x - q.x, p.y - q.y) / z.abst)));
      return;
    }
    const dx = e.clientX - z.x, dy = e.clientY - z.y;
    z.weit = Math.max(z.weit, Math.abs(dx) + Math.abs(dy));
    if (z.weit > 4) setDreh({ a: z.d.a + dx * 0.01, b: Math.max(-1.5, Math.min(1.5, z.d.b + dy * 0.01)) });
  };
  const hoch = (e) => {
    finger.current.delete(e.pointerId);
    const z = ziehen.current;
    if (z && z.weit <= 4 && e.type === "pointerup") treffen(e);
    if (!finger.current.size) ziehen.current = null;
  };
  useEffect(() => {
    // Mausrad nicht passiv, sonst rollt die Seite mit
    const cv = leinwand.current; if (!cv) return;
    const rad = (e) => { e.preventDefault(); setZoom((z) => Math.max(0.3, Math.min(12, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))); };
    cv.addEventListener("wheel", rad, { passive: false });
    return () => cv.removeEventListener("wheel", rad);
  }, []);

  return (
    <div className={"kt-k3d" + (gross ? " kt-k3d--gross" : "")} ref={rahmen}>
      <canvas ref={leinwand} id={gross ? "kt-k3d-gross" : "kt-k3d"} className="kt-k3d__bild" style={{ height: hoehe + "px" }}
        onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch} />
      <div className="kt-k3d__knoepfe">
        <label className="schalter kt-k3d__schnitt"><input type="checkbox" id={gross ? "kt-k3d-schnitt-gross" : "kt-k3d-schnitt"}
          checked={schnitt} onChange={(e) => setSchnitt(e.target.checked)} /><span>Aufgeschnitten</span></label>
        <button className="knopf knopf--klein" onClick={() => { setDreh(SCHRAEG); setZoom(1); }}>Schräg</button>
        <button className="knopf knopf--klein" onClick={() => setDreh({ a: 0, b: 0 })}>Von der Seite</button>
        <button className="knopf knopf--klein" onClick={() => setDreh({ a: Math.PI / 2 - 0.0001, b: 0 })}>Von vorne</button>
        <button className="knopf knopf--klein" onClick={() => setZoom((z) => Math.min(12, z * 1.4))}>+</button>
        <button className="knopf knopf--klein" onClick={() => setZoom((z) => Math.max(0.3, z / 1.4))}>−</button>
      </div>
    </div>
  );
}
