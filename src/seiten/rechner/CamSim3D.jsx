// =================================================================
//  HOFERCAM: 3D-Simulation als Fenster (seit 1.547.0)
//  Schritt 2 nach Patricks Plan vom 14. November 2026: Drehen und Bohren
//  von vorne in 3D, Kanal 1 an der Hauptspindel, danach Kanal 2 an der
//  Rückseite. Gerechnet in camSim.js; gezeichnet ohne 3D-Bibliothek wie
//  die 3D-Ansicht der Kontur (Maleralgorithmus, Licht von oben links).
//  Seit 1.548.0 (Schritt 3) mit Bohrungen und Fräsungen aus C und Y:
//  dann je Bildpunkt ein Strahl durch Drehteil und Zellenraster.
//  Ziehen dreht, Mausrad oder zwei Finger zoomen, „Aufgeschnitten“ zeigt
//  die Bohrungen. Das Werkzeug steht in der Schnittebene oben (+X).
// =================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { RASTER, materialStand, simAufbauen, umrissVon, plattenHuelle, bohrerHuelle } from "./camSim.js";

const SCHRAEG = { a: -0.55, b: 0.42 };
const TEMPI = [["0.3", "⅓×"], ["1", "1×"], ["3", "3×"], ["10", "10×"], ["40", "40×"]];
const HOCH = 420;

let offenZu = null;
export function simulationOeffnen(w) {
  if (offenZu) offenZu();
  offenZu = fensterOeffnen((zu) => <Simulation w={w} zu={zu} />, () => { offenZu = null; }, "cam-sim-huelle");
}

// Wert einer Linie (z aufsteigend) bei z; bei senkrechten Kanten der
// Wert auf der Seite von „seite“ (−1 links, +1 rechts)
function wertBei(l, z, seite) {
  if (!l.length) return 0;
  if (z <= l[0].z) return l[0].r;
  for (let i = 1; i < l.length; i++) {
    const a = l[i - 1], b = l[i];
    if (z < b.z || (z === b.z && seite < 0)) {
      if (b.z - a.z < 1e-9) return seite < 0 ? a.r : b.r;
      return a.r + (b.r - a.r) * (z - a.z) / (b.z - a.z);
    }
  }
  return l[l.length - 1].r;
}

// Ansicht aus Lage und Drehung: dieselbe Abbildung wie im Maler
function abbildung(W, H, { bereich, dreh, zoom }) {
  const { zmin, zmax, rmax } = bereich;
  const zm = (zmin + zmax) / 2;
  const diag = Math.hypot(zmax - zmin, 2 * rmax) || 1;
  const s = Math.min(W, H) / (diag * 1.1) * zoom;
  const ca = Math.cos(dreh.a), sa = Math.sin(dreh.a), cb = Math.cos(dreh.b), sb = Math.sin(dreh.b);
  // Zeilen der Drehung (Welt x = z − zm, y = +X, w = +Y)
  const r1 = [ca, 0, sa], r2 = [sa * sb, cb, -ca * sb], r3 = [-sa * cb, sb, ca * cb];
  return { zm, s, ox: W / 2, oy: H / 2 + 10, r1, r2, r3 };
}
const LICHT = [-0.45, 0.65, 0.62].map((c, _, v) => c / Math.hypot(...v));
const GLANZ = (() => { const v = [LICHT[0], LICHT[1], LICHT[2] + 1]; const l = Math.hypot(...v); return v.map((c) => c / l); })();

// Körper mit Bohrungen und Fräsungen: je Bildpunkt ein Strahl durch das
// Material (Drehteil aus aussen/innen, dazu das Zellenraster). q = Bildpunkte
// je Punkt am Schirm (beim Abspielen gröber, damit es flüssig bleibt).
function strahlenMalen(g, W, H, { st, vox, kanal2, Wt, bereich, dreh, zoom, schnitt, q }) {
  const ab = abbildung(W, H, { bereich, dreh, zoom });
  const { zm, s, ox, oy, r1, r2, r3 } = ab;
  const iw = Math.max(40, Math.round(W * q)), ih = Math.max(30, Math.round(H * q));
  const doc = g.canvas.ownerDocument;
  const bild = doc.createElement("canvas"); bild.width = iw; bild.height = ih;
  const bg = bild.getContext("2d");
  if (!bg) return;
  const img = bg.createImageData(iw, ih), px = img.data;
  const { aussen, innen, z0 } = st;
  const nk = aussen.length;
  let Rb = 0, ka = nk, kb = -1;
  for (let k = 0; k < nk; k++) if (aussen[k] > innen[k] + 1e-6) { if (aussen[k] > Rb) Rb = aussen[k]; if (k < ka) ka = k; kb = k; }
  if (kb < 0) return;
  const xa = z0 + ka * RASTER - zm - RASTER, xb = z0 + kb * RASTER - zm + RASTER;
  Rb += 0.01;
  const vh = vox ? vox.h : 0;
  const dt = Math.max(0.015, Math.min(vox ? vh * 0.7 : Infinity, Rb / 140, (xb - xa) / 140));
  const vz0 = vox ? vox.z0 : 0, vR = vox ? vox.R : 0, vnz = vox ? vox.nz : 0, vnu = vox ? vox.nu : 0, vf = vox ? vox.feld : null;
  // 0 = Material; sonst der Grund, warum nicht: 1 aussen, 2 innen, 3 Schnitt, 4 Raster, 5 vor/hinter dem Teil
  const grund = (x, y, w) => {
    const z = x + zm;
    const k = Math.round((z - z0) / RASTER);
    if (k < 0 || k >= nk) return 5;
    const r2v = y * y + w * w, ra = aussen[k];
    if (r2v > ra * ra) return 1;
    const ri = innen[k];
    if (ri > 0 && r2v <= ri * ri) return 2;
    if (schnitt && y > 0 && w > 0) return 3;
    if (vf) {
      const z1 = kanal2 ? Wt - z : z, w1 = kanal2 ? -w : w;
      const iz = Math.floor((z1 - vz0) / vh), iu = Math.floor((y + vR) / vh), iv = Math.floor((w1 + vR) / vh);
      if (iz >= 0 && iz < vnz && iu >= 0 && iu < vnu && iv >= 0 && iv < vnu && vf[(iz * vnu + iu) * vnu + iv]) return 4;
    }
    return 0;
  };
  const aw = (z) => { const k = Math.max(0, Math.min(nk - 1, Math.round((z - z0) / RASTER))); return aussen[k]; };
  const iwv = (z) => { const k = Math.max(0, Math.min(nk - 1, Math.round((z - z0) / RASTER))); return innen[k]; };
  const belegt = (z1, u, w1) => {
    const iz = Math.floor((z1 - vz0) / vh), iu = Math.floor((u + vR) / vh), iv = Math.floor((w1 + vR) / vh);
    return iz >= 0 && iz < vnz && iu >= 0 && iu < vnu && iv >= 0 && iv < vnu ? vf[(iz * vnu + iu) * vnu + iv] : 0;
  };
  const d3 = [-r3[0], -r3[1], -r3[2]];
  const aa = r3[1] * r3[1] + r3[2] * r3[2];
  for (let j = 0; j < ih; j++) {
    const Y = (oy - (j + 0.5) / q) / s;
    for (let i = 0; i < iw; i++) {
      const X = ((i + 0.5) / q - ox) / s;
      const O = [X * r1[0] + Y * r2[0], X * r1[1] + Y * r2[1], X * r1[2] + Y * r2[2]];
      // Strahl p(t) = O + t·r3, gesucht vom grössten t (vorne) her
      let tlo = -1e9, thi = 1e9;
      if (aa > 1e-12) {
        const bq = 2 * (O[1] * r3[1] + O[2] * r3[2]), cq = O[1] * O[1] + O[2] * O[2] - Rb * Rb;
        const disk = bq * bq - 4 * aa * cq;
        if (disk < 0) continue;
        const wd = Math.sqrt(disk);
        tlo = (-bq - wd) / (2 * aa); thi = (-bq + wd) / (2 * aa);
      } else if (O[1] * O[1] + O[2] * O[2] > Rb * Rb) continue;
      if (Math.abs(r3[0]) > 1e-12) {
        let t1 = (xa - O[0]) / r3[0], t2 = (xb - O[0]) / r3[0];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tlo = Math.max(tlo, t1); thi = Math.min(thi, t2);
      } else if (O[0] < xa || O[0] > xb) continue;
      if (thi <= tlo) continue;
      let t = thi, vorher = thi, warum = 5, treffer = false;
      while (t >= tlo) {
        const x = O[0] + t * r3[0], y = O[1] + t * r3[1], w = O[2] + t * r3[2];
        const gr = grund(x, y, w);
        if (!gr) { treffer = true; break; }
        warum = gr; vorher = t; t -= dt;
      }
      if (!treffer) continue;
      // fein eingrenzen: t innen, vorher aussen
      let ti = t, ta = vorher;
      for (let b = 0; b < 7; b++) {
        const tm = (ti + ta) / 2;
        const gr = grund(O[0] + tm * r3[0], O[1] + tm * r3[1], O[2] + tm * r3[2]);
        if (gr) { ta = tm; warum = gr; } else ti = tm;
      }
      const x = O[0] + ti * r3[0], y = O[1] + ti * r3[1], w = O[2] + ti * r3[2], z = x + zm;
      const r = Math.hypot(y, w) || 1e-9;
      let n;
      const e = 0.04;
      if (warum === 1 || warum === 5) n = [-(aw(z + e) - aw(z - e)) / (2 * e), y / r, w / r];
      else if (warum === 2) n = [(iwv(z + e) - iwv(z - e)) / (2 * e), -y / r, -w / r];
      else if (warum === 3) n = Math.abs(y) < Math.abs(w) ? [0, 1, 0] : [0, 0, 1];
      else {
        // Raster: Richtung zu den weggenommenen Nachbarzellen
        const z1 = kanal2 ? Wt - z : z, w1 = kanal2 ? -w : w;
        let gz = 0, gu = 0, gw = 0;
        for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) for (let c = -1; c <= 1; c++) {
          if (belegt(z1 + a * vh, y + b2 * vh, w1 + c * vh)) { gz += a; gu += b2; gw += c; }
        }
        if (kanal2) { gz = -gz; gw = -gw; }
        n = gz || gu || gw ? [gz, gu, gw] : d3.map((c) => -c);
      }
      if (warum === 5) n = [z < (z0 + ka * RASTER + z0 + kb * RASTER) / 2 ? -1 : 1, 0, 0];
      const l = Math.hypot(...n) || 1;
      // in Blickrichtung: Bildschirm x, y und Tiefe
      let nv = [(n[0] * r1[0] + n[1] * r1[1] + n[2] * r1[2]) / l, (n[0] * r2[0] + n[1] * r2[1] + n[2] * r2[2]) / l, (n[0] * r3[0] + n[1] * r3[1] + n[2] * r3[2]) / l];
      if (nv[2] < 0) nv = nv.map((c) => -c);
      const diff = Math.max(0, nv[0] * LICHT[0] + nv[1] * LICHT[1] + nv[2] * LICHT[2]);
      const glanz = Math.pow(Math.max(0, nv[0] * GLANZ[0] + nv[1] * GLANZ[1] + nv[2] * GLANZ[2]), 40);
      const basis = warum === 3 ? [226, 176, 120] : warum === 4 ? [168, 186, 212] : [176, 190, 206];
      const hell = 0.5 + 0.6 * diff;
      const o = (j * iw + i) * 4;
      px[o] = Math.min(255, basis[0] * hell + 255 * glanz * 0.55);
      px[o + 1] = Math.min(255, basis[1] * hell + 255 * glanz * 0.55);
      px[o + 2] = Math.min(255, basis[2] * hell + 255 * glanz * 0.55);
      px[o + 3] = 255;
    }
  }
  bg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(bild, 0, 0, W, H);
}

function malen(g, W, H, { umriss, strahl, bereich, dreh, zoom, schnitt, ueber, hinweis }) {
  g.clearRect(0, 0, W, H);
  const { zmin, zmax, rmax } = bereich;
  const zm = (zmin + zmax) / 2;
  const diag = Math.hypot(zmax - zmin, 2 * rmax) || 1;
  const s = Math.min(W, H) / (diag * 1.1) * zoom;
  const ca = Math.cos(dreh.a), sa = Math.sin(dreh.a), cb = Math.cos(dreh.b), sb = Math.sin(dreh.b);
  const ansicht = (z, r, phi) => {
    const x = z - zm, y = r * Math.cos(phi), w = r * Math.sin(phi);
    const x1 = x * ca + w * sa, w1 = -x * sa + w * ca;
    return { x: x1, y: y * cb - w1 * sb, t: y * sb + w1 * cb };
  };
  const L = [-0.45, 0.65, 0.62].map((c, _, v) => c / Math.hypot(...v));
  const Hh = (() => { const v = [L[0], L[1], L[2] + 1]; const l = Math.hypot(...v); return v.map((c) => c / l); })();
  const liste = [];
  const flaeche = (pts, art) => {
    const a = pts[0], b = pts[1], c = pts[2], d = pts[3] || pts[2];
    const u1 = [c.x - a.x, c.y - a.y, c.t - a.t], u2 = pts.length === 3 ? [b.x - a.x, b.y - a.y, b.t - a.t] : [d.x - b.x, d.y - b.y, d.t - b.t];
    let n = [u1[1] * u2[2] - u1[2] * u2[1], u1[2] * u2[0] - u1[0] * u2[2], u1[0] * u2[1] - u1[1] * u2[0]];
    const l = Math.hypot(...n);
    if (l < 1e-12) return;
    n = n.map((q) => q / l);
    if (n[2] < 0) n = n.map((q) => -q);
    const diff = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
    const glanz = Math.pow(Math.max(0, n[0] * Hh[0] + n[1] * Hh[1] + n[2] * Hh[2]), 40);
    liste.push({ pts, art, hell: 0.5 + 0.6 * diff, glanz, tiefe: pts.reduce((m, p) => m + p.t, 0) / pts.length });
  };
  if (strahl) strahlenMalen(g, W, H, { ...strahl, bereich, dreh, zoom, schnitt });
  else if (umriss) {
    const { aussen, innen } = umriss;
    const zug = [...aussen, ...innen.slice().reverse()];
    const N = 48;
    const von = schnitt ? Math.PI / 2 : 0, bis = 2 * Math.PI;
    const schritte = schnitt ? Math.round(N * 0.75) : N;
    for (let i = 0; i < zug.length; i++) {
      const p = zug[i], q = zug[(i + 1) % zug.length];
      if (p.r < 1e-6 && q.r < 1e-6) continue;
      if (Math.hypot(p.z - q.z, p.r - q.r) < 1e-9) continue;
      for (let j = 0; j < schritte; j++) {
        const f0 = von + ((bis - von) * j) / schritte, f1 = von + ((bis - von) * (j + 1)) / schritte;
        flaeche([ansicht(p.z, p.r, f0), ansicht(q.z, q.r, f0), ansicht(q.z, q.r, f1), ansicht(p.z, p.r, f1)], "mantel");
      }
    }
    if (schnitt) {
      // Schnittfläche als Streifen zwischen Aussen- und Innenlinie
      const zs = [...new Set([...aussen, ...innen].map((p) => p.z))].sort((x, y) => x - y);
      const tz = (zmax - zmin) / 40;
      const fein = [];
      for (let i = 0; i < zs.length; i++) {
        fein.push(zs[i]);
        const nx = zs[i + 1];
        if (nx != null) for (let k = 1; (zs[i] + k * tz) < nx - 1e-9; k++) fein.push(zs[i] + k * tz);
      }
      for (let i = 0; i + 1 < fein.length; i++) {
        const z1 = fein[i], z2 = fein[i + 1];
        const o1 = wertBei(aussen, z1, 1), o2 = wertBei(aussen, z2, -1), i1 = wertBei(innen, z1, 1), i2 = wertBei(innen, z2, -1);
        if (o1 - i1 < 1e-6 && o2 - i2 < 1e-6) continue;
        for (const phi of [von, bis]) flaeche([ansicht(z1, i1, phi), ansicht(z2, i2, phi), ansicht(z2, o2, phi), ansicht(z1, o1, phi)], "schnitt");
      }
    }
  }
  liste.sort((x, y) => x.tiefe - y.tiefe);
  const ox = W / 2, oy = H / 2 + 10;
  const P = (p) => ({ x: ox + p.x * s, y: oy - p.y * s });
  g.lineJoin = "round"; g.lineWidth = 0.7;
  for (const f of liste) {
    const basis = f.art === "schnitt" ? [226, 176, 120] : [176, 190, 206];
    const c = `rgb(${basis.map((q) => Math.min(255, Math.round(q * f.hell + 255 * f.glanz * 0.55))).join(",")})`;
    g.beginPath();
    f.pts.forEach((p, i) => { const q = P(p); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
    g.closePath(); g.fillStyle = c; g.strokeStyle = c; g.fill(); g.stroke();
  }
  // Mittellinie
  g.setLineDash([10, 4, 2, 4]); g.strokeStyle = "rgba(220,60,60,.7)"; g.lineWidth = 1;
  const m1 = P(ansicht(zmin - 2, 0, 0)), m2 = P(ansicht(zmax + 2, 0, 0));
  g.beginPath(); g.moveTo(m1.x, m1.y); g.lineTo(m2.x, m2.y); g.stroke(); g.setLineDash([]);
  // Bahn und Werkzeug in der Ebene oben (+X), vor dem Körper
  const ebene = (z, r, phi) => P(ansicht(z, r, phi || 0));
  const kart = (z, u, w) => P(ansicht(z, Math.hypot(u, w), Math.atan2(w, u)));
  // Führungsbüchse vorne: Ring um das Material 2 mm hinter dem Drehwerkzeug
  if (ueber.buechse) {
    const { z: zb, r: rb } = ueber.buechse;
    for (const dz of [0, 3]) {
      g.beginPath();
      for (let k = 0; k <= 48; k++) { const q = ebene(zb + dz, rb, (k / 48) * 2 * Math.PI); if (k) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }
      g.strokeStyle = "rgba(70,85,100,.75)"; g.lineWidth = 1.3; g.stroke();
    }
    const a = ebene(zb, rb, 0), b = ebene(zb + 3, rb, 0);
    g.fillStyle = "#425466"; g.font = "11px system-ui, sans-serif"; g.textAlign = "left";
    g.fillText("Führungsbüchse", Math.max(a.x, b.x) + 4, Math.min(a.y, b.y) - 4);
  }
  for (const b of ueber.bahnen) {
    g.strokeStyle = b.farbe; g.lineWidth = b.dick || 1.4; g.setLineDash(b.strich ? [4, 3] : []);
    g.beginPath();
    b.pts.forEach((p, i) => { const q = ebene(p.z, p.r, p.phi); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
    g.stroke();
  }
  g.setLineDash([]);
  for (const t of ueber.werkzeuge) {
    g.beginPath();
    t.pts.forEach((p, i) => { const q = ebene(p.z, p.r); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
    g.closePath(); g.fillStyle = t.farbe; g.strokeStyle = t.rand; g.lineWidth = 1.2; g.fill(); g.stroke();
  }
  for (const st of ueber.stangen || []) {
    // angetriebenes Werkzeug als Stab von der Spitze zum Schaft
    const a = kart(...st.a), b = kart(...st.b);
    g.lineCap = "butt"; g.strokeStyle = st.rand; g.lineWidth = Math.max(3, st.d * s) + 2;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.strokeStyle = st.farbe; g.lineWidth = Math.max(2, st.d * s);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
  if (ueber.spitze) {
    const q = ebene(ueber.spitze.z, ueber.spitze.r, ueber.spitze.phi);
    g.fillStyle = "#b3261e"; g.beginPath(); g.arc(q.x, q.y, 3, 0, 2 * Math.PI); g.fill();
  }
  if (hinweis) {
    g.fillStyle = "#425466"; g.font = "14px system-ui, sans-serif"; g.textAlign = "center";
    g.fillText(hinweis, W / 2, H / 2);
  }
}

const STATUS = {
  fehlt: "Werkzeug fehlt, nur Bahn", nurBahn: "Drehwerkzeug an Front: nur Bahn", nurBahnA: "Drehplatte am angetriebenen Werkzeug: nur Bahn", leer: "keine Wege",
};

function Simulation({ w, zu }) {
  const sim = useMemo(() => simAufbauen(w), [w]);
  const cache = useRef(new Map());
  const [n, setN] = useState(sim.gesamt);
  const [laeuft, setLaeuft] = useState(false);
  const [tempo, setTempo] = useState("3");
  const [dreh, setDreh] = useState(SCHRAEG);
  const [zoom, setZoom] = useState(1);
  const [schnitt, setSchnitt] = useState(true);
  const [breite, setBreite] = useState(800);
  const rahmen = useRef(null), leinwand = useRef(null), ziehen = useRef(null), finger = useRef(new Map());
  const { gesamt, schritte } = sim;

  // aktueller Schritt: der, in dem der letzte gezeigte Punkt liegt
  const jetzt = Math.max(0, n - 1);
  const akt = schritte.find((s) => s.von <= jetzt && jetzt < s.bis)
    || [...schritte].reverse().find((s) => s.bis <= n && s.punkte.length) || schritte[0];
  const kanal = n >= gesamt && sim.hatK2 ? 2 : akt ? akt.kanal : 1;
  const stand = useMemo(() => materialStand(sim, n, cache.current), [sim, n]);

  useEffect(() => {
    const el = rahmen.current; if (!el) return undefined;
    const win = el.ownerDocument.defaultView || window;
    const messen = () => setBreite(Math.max(260, el.clientWidth));
    messen();
    if (!win.ResizeObserver) return undefined;
    const ro = new win.ResizeObserver(messen); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = leinwand.current; if (!cv) return;
    const win = cv.ownerDocument.defaultView || window;
    const dpr = Math.min(2, win.devicePixelRatio || 1);
    cv.width = Math.round(breite * dpr); cv.height = Math.round(HOCH * dpr);
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { A, W, vorne } = sim.roh;
    const st = kanal === 2 ? stand.k2 : stand.k1;
    const ende = kanal === 2 ? W : sim.zMax;
    const umriss = st ? umrissVon(st, ende) : null;
    const bereich = kanal === 2 ? { zmin: -3, zmax: W + 1, rmax: A / 2 + 2 } : { zmin: vorne - 4, zmax: sim.zMax, rmax: A / 2 + 2 };
    // Bahn und Werkzeug des aktuellen Schritts
    const ueber = { bahnen: [], werkzeuge: [], stangen: [], spitze: null, buechse: null };
    if (akt && akt.kanal === kanal && akt.punkte.length && n > akt.von) {
      const bis = Math.min(n, akt.bis) - akt.von;
      const pts = akt.punkte.slice(0, bis);
      const farbe = akt.status === "fehlt" ? "#d32f2f" : "#e67814";
      let lauf = [], vor = null;
      const fertig = () => { if (lauf.length > 1) ueber.bahnen.push({ pts: lauf, farbe: vor ? farbe : "rgba(90,105,120,.8)", strich: !vor, dick: vor ? 1.6 : 1 }); };
      for (const p of pts) {
        const zp = akt.modus === "bohr" || akt.art === "front" ? { z: p.z, r: p.r } : p;
        if (vor !== null && p.vor !== vor) { fertig(); lauf = [lauf[lauf.length - 1]]; }
        vor = p.vor; lauf.push(zp);
      }
      fertig();
      const p = pts[pts.length - 1];
      ueber.spitze = p;
      if (akt.wz && akt.modus === "dreh") {
        const h = plattenHuelle(akt.wz);
        if (h) ueber.werkzeuge.push({ pts: h.umriss.map((q) => ({ z: p.z + q.z, r: p.r + q.x })), farbe: "rgba(224,161,42,.92)", rand: "#7a5410" });
      } else if (akt.wz && akt.modus === "c") {
        // Achse in der Ansicht: Kanal 2 von hinten (z und w gespiegelt)
        const ax = kanal === 2 ? [-p.ax[0], p.ax[1], -p.ax[2]] : p.ax;
        const u = p.r * Math.cos(p.phi), ww = p.r * Math.sin(p.phi);
        const h = bohrerHuelle(akt.wz), Lc = Math.max(2, (h.rad.length - 1) * 0.02), d = 2 * h.R;
        const pkt = (a) => [p.z + ax[0] * a, u + ax[1] * a, ww + ax[2] * a];
        ueber.stangen.push({ a: pkt(0), b: pkt(Lc), d, farbe: "rgba(224,161,42,.92)", rand: "#7a5410" });
        ueber.stangen.push({ a: pkt(Lc), b: pkt(Lc + d * 1.5), d: d * 1.15, farbe: "rgba(180,190,200,.95)", rand: "#5b6875" });
      } else if (akt.wz && akt.modus === "bohr") {
        const u = bohrerHuelle(akt.wz).umriss;
        const auf = (l) => l.map((q) => ({ z: p.z - q.x, r: p.r + q.z }));
        ueber.werkzeuge.push({ pts: auf(u.schaft), farbe: "rgba(180,190,200,.95)", rand: "#5b6875" });
        ueber.werkzeuge.push({ pts: auf(u.schneide), farbe: "rgba(224,161,42,.92)", rand: "#7a5410" });
      }
    }
    // Vorne fährt das Material in Z durch die Führungsbüchse, rund 2 mm
    // hinter den Drehwerkzeugen (Patrick 14. November 2026)
    if (kanal === 1 && akt && akt.kanal === 1 && n > akt.von && n <= akt.bis && (akt.art === "dreh" || akt.art === "seite") && ueber.spitze) {
      ueber.buechse = { z: ueber.spitze.z + 2 + (akt.art === "seite" && akt.wz ? bohrerHuelle(akt.wz).R : 0), r: A / 2 + 0.6 };
    }
    // Mit Bohrungen und Fräsungen aus C und Y: Strahlen statt Maler
    const vx = stand.vox && stand.vox.weg > 0 ? stand.vox : null;
    const strahl = vx && umriss ? { st, vox: vx, kanal2: kanal === 2, Wt: W, q: laeuft ? 0.45 : 1 } : null;
    cv.__stand = stand; cv.__sim = sim; cv.__strahl = !!strahl; // für den Prüfstand
    malen(g, breite, HOCH, { umriss, strahl, bereich, dreh, zoom, schnitt, ueber, hinweis: umriss ? "" : "Kein Material" });
  }, [sim, stand, n, kanal, akt, dreh, zoom, schnitt, breite, laeuft]);

  useEffect(() => {
    if (!laeuft) return undefined;
    let id;
    const weiter = () => {
      setN((x) => {
        const neu = Math.min(gesamt, x + Math.max(1, Math.round(Number(tempo) * 6)));
        if (neu >= gesamt) setLaeuft(false);
        return neu;
      });
      id = requestAnimationFrame(weiter);
    };
    id = requestAnimationFrame(weiter);
    return () => cancelAnimationFrame(id);
  }, [laeuft, tempo, gesamt]);

  // Drehen und Zoomen wie in der 3D-Ansicht der Kontur
  const runter = (e) => {
    finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    ziehen.current = { x: e.clientX, y: e.clientY, d: dreh, z: zoom, abst: null };
    if (finger.current.size === 2) { const [p, q] = [...finger.current.values()]; ziehen.current.abst = Math.hypot(p.x - q.x, p.y - q.y); }
  };
  const bewegen = (e) => {
    const z = ziehen.current; if (!z) return;
    finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (finger.current.size === 2 && z.abst) {
      const [p, q] = [...finger.current.values()];
      setZoom(Math.max(0.3, Math.min(20, z.z * Math.hypot(p.x - q.x, p.y - q.y) / z.abst)));
      return;
    }
    setDreh({ a: z.d.a + (e.clientX - z.x) * 0.01, b: Math.max(-1.5, Math.min(1.5, z.d.b + (e.clientY - z.y) * 0.01)) });
  };
  const hoch = (e) => { finger.current.delete(e.pointerId); if (!finger.current.size) ziehen.current = null; };
  useEffect(() => {
    const cv = leinwand.current; if (!cv) return undefined;
    const rad = (e) => { e.preventDefault(); setZoom((z) => Math.max(0.3, Math.min(20, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))); };
    cv.addEventListener("wheel", rad, { passive: false });
    return () => cv.removeEventListener("wheel", rad);
  }, []);

  const p = akt && n > akt.von ? akt.punkte[Math.min(n, akt.bis) - akt.von - 1] : null;
  const zeile = p && akt.zeilen ? String(akt.zeilen[p.nr] || "").trim() : "";
  return (
    <div className="dialog cam-sim" id="cam-sim">
      <div className="cam-sim__kopf">
        <b>3D-Simulation</b>
        <span className="cam-sim__hinweis klein">Kanal 1 vorne an der Hauptspindel, danach Kanal 2 an der Rückseite. Ziehen dreht, Mausrad zoomt.</span>
        <button className="knopf knopf--klein" title="Schliessen" onClick={zu}>✕</button>
      </div>
      <div className="cam-sim__haupt">
        <div className="cam-sim__bildteil" ref={rahmen}>
          <div className="cam-sim__titel" id="cam-sim-titel">
            {kanal === 2 ? "Kanal 2 · Rückseite in der Gegenspindel" : "Kanal 1 · Vorderseite"}
            {n >= gesamt && gesamt ? " · Fertigteil" : akt && n > akt.von && n <= akt.bis ? " · " + akt.titel : ""}
          </div>
          <canvas ref={leinwand} className="cam-sim__bild" id="cam-sim-bild" data-cam-sim-n={n} style={{ height: HOCH + "px", width: "100%" }}
            onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch} />
          <div className="cam-sim__knoepfe">
            <button className="knopf knopf--klein knopf--primaer" id="cam-sim-start" onClick={() => { if (n >= gesamt) setN(0); setLaeuft(!laeuft); }}>
              {laeuft ? "⏸ Pause" : "▶ Abspielen"}</button>
            <button className="knopf knopf--klein" id="cam-sim-anfang" onClick={() => { setLaeuft(false); setN(0); }}>⏮ Rohteil</button>
            <button className="knopf knopf--klein" id="cam-sim-ende" onClick={() => { setLaeuft(false); setN(gesamt); }}>Fertigteil ⏭</button>
            <label className="cam-feld">Tempo
              <select value={tempo} onChange={(e) => setTempo(e.target.value)}>
                {TEMPI.map(([x, t]) => <option key={x} value={x}>{t}</option>)}
              </select></label>
            <label className="schalter"><input type="checkbox" id="cam-sim-schnitt" checked={schnitt} onChange={(e) => setSchnitt(e.target.checked)} /><span>Aufgeschnitten</span></label>
            <button className="knopf knopf--klein" onClick={() => { setDreh(SCHRAEG); setZoom(1); }}>Schräg</button>
            <button className="knopf knopf--klein" onClick={() => setDreh({ a: 0, b: 0 })}>Von der Seite</button>
            <input type="range" min={0} max={gesamt} value={n} className="cam-sim__regler" id="cam-sim-regler"
              onChange={(e) => { setLaeuft(false); setN(Number(e.target.value)); }} />
          </div>
          <div className="cam-sim__zeile" id="cam-sim-zeile">{zeile ? "Zeile: " + zeile : " "}</div>
        </div>
        <div className="cam-sim__liste">
          <b className="klein">Bearbeitungen</b>
          {!schritte.length && <p className="klein">Noch keine Bearbeitungen.</p>}
          {schritte.map((s) => {
            const aktiv = akt === s && n > s.von && n <= s.bis;
            return (
              <button key={s.id} data-cam-sim-schritt={s.i} className={"cam-sim__schritt" + (aktiv ? " aktiv" : "") + (s.status === "fehlt" ? " cam-sim__schritt--fehlt" : s.status ? " cam-sim__schritt--grau" : "")}
                disabled={!s.punkte.length} title="Bis ans Ende dieser Bearbeitung springen"
                onClick={() => { setLaeuft(false); setN(s.bis); }}>
                <span className="cam-sim__k">K{s.kanal}</span>
                <span className="cam-sim__name">{s.titel}</span>
                {s.status && <small>{STATUS[s.status]}</small>}
              </button>);
          })}
          <p className="klein cam-sim__info">Ohne Halter, ohne Kollisionsprüfung. Gerechnet wird das erzeugte Programm, ohne Änderungen von Hand im Programmfenster.</p>
        </div>
      </div>
    </div>
  );
}
