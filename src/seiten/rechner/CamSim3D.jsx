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

// Seit 1.558.3 wie an der Maschine: Führungsbüchse links, das Teil schaut
// nach rechts, schräg von vorne auf die Stirn (Patrick 16. November 2026:
// „um 180° drehen … sie steht links“). Aufgeschnitten wird immer das
// Viertel, das zum Betrachter schaut.
const SCHRAEG = { a: Math.PI - 0.55, b: 0.42 };
const SEITE = { a: Math.PI, b: 0 };
const TEMPI = [["0.3", "⅓×"], ["1", "1×"], ["3", "3×"], ["10", "10×"], ["40", "40×"]];
const HOCH = 420;
// Führungsbüchse: aussen Ø30 (Patrick 16. November 2026), Loch = Material-Ø
const BUECHSE_R = 15, BUECHSE_L = 30;

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
// Seit 1.560.0 (Patrick 16. November 2026: „das Rohteil in einer anderen
// Farbe als das Fertigteil“): noch unbearbeitete Flächen des Rohmaterials
// (Aussen-Ø der Stange, Stirn der Stange vorne) erdig, alles Bearbeitete
// hell metallisch
const FARBE_ROH = [160, 146, 120], FARBE_BEARB = [176, 190, 206];
function strahlenMalen(g, W, H, { st, vox, kanal2, Wt, bereich, dreh, zoom, schnitt, q, bu, roh }) {
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
  const hin = Math.cos(dreh.a) >= 0 ? 1 : -1; // +w zum Betrachter?
  const dt = Math.max(0.015, Math.min(vox ? vh * 0.7 : Infinity, Rb / 140, (xb - xa) / 140));
  // Führungsbüchse: Rohr ri … ra von bu.z bis bu.z + L
  const inBu = (x, y, w) => {
    if (!bu) return false;
    const z = x + zm;
    if (z < bu.z || z > bu.z + bu.L) return false;
    const r2v = y * y + w * w;
    if (r2v < bu.ri * bu.ri || r2v > bu.ra * bu.ra) return false;
    return !(schnitt && y > 0 && w * hin > 0);
  };
  let RR = Rb, XA = xa, XB = xb;
  if (bu) { RR = Math.max(Rb, bu.ra + 0.01); XA = Math.min(xa, bu.z - zm - 0.1); XB = Math.max(xb, bu.z + bu.L - zm + 0.1); }
  const vz0 = vox ? vox.z0 : 0, vR = vox ? vox.R : 0, vnz = vox ? vox.nz : 0, vnu = vox ? vox.nu : 0, vf = vox ? vox.feld : null;
  // 0 = Material; sonst der Grund, warum nicht: 1 aussen, 2 innen, 3 Schnitt, 4 Raster, 5 vor/hinter dem Teil
  const grund = (x, y, w) => {
    if (inBu(x, y, w)) return 0;
    const z = x + zm;
    const k = Math.round((z - z0) / RASTER);
    if (k < 0 || k >= nk) return 5;
    const r2v = y * y + w * w, ra = aussen[k];
    if (r2v > ra * ra) return 1;
    const ri = innen[k];
    if (ri > 0 && r2v <= ri * ri) return 2;
    if (schnitt && y > 0 && w * hin > 0) return 3;
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
        const bq = 2 * (O[1] * r3[1] + O[2] * r3[2]), cq = O[1] * O[1] + O[2] * O[2] - RR * RR;
        const disk = bq * bq - 4 * aa * cq;
        if (disk < 0) continue;
        const wd = Math.sqrt(disk);
        tlo = (-bq - wd) / (2 * aa); thi = (-bq + wd) / (2 * aa);
      } else if (O[1] * O[1] + O[2] * O[2] > RR * RR) continue;
      if (Math.abs(r3[0]) > 1e-12) {
        let t1 = (XA - O[0]) / r3[0], t2 = (XB - O[0]) / r3[0];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tlo = Math.max(tlo, t1); thi = Math.min(thi, t2);
      } else if (O[0] < XA || O[0] > XB) continue;
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
      const buechse = inBu(x, y, w);
      if (buechse) {
        // nächste Fläche der Büchse: Stirn vorne / hinten, aussen, innen, Schnitt
        const ab = [[Math.abs(z - bu.z), [-1, 0, 0]], [Math.abs(z - bu.z - bu.L), [1, 0, 0]], [Math.abs(r - bu.ra), [0, y / r, w / r]],
          [Math.abs(r - bu.ri), [0, -y / r, -w / r]]];
        if (schnitt) ab.push([Math.abs(y), [0, 1, 0]], [Math.abs(w), [0, 0, 1]]);
        n = ab.sort((u, v) => u[0] - v[0])[0][1];
      } else if (warum === 1 || warum === 5) n = [-(aw(z + e) - aw(z - e)) / (2 * e), y / r, w / r];
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
      if (warum === 5 && !buechse) n = [z < (z0 + ka * RASTER + z0 + kb * RASTER) / 2 ? -1 : 1, 0, 0];
      const l = Math.hypot(...n) || 1;
      // in Blickrichtung: Bildschirm x, y und Tiefe
      let nv = [(n[0] * r1[0] + n[1] * r1[1] + n[2] * r1[2]) / l, (n[0] * r2[0] + n[1] * r2[1] + n[2] * r2[2]) / l, (n[0] * r3[0] + n[1] * r3[1] + n[2] * r3[2]) / l];
      if (nv[2] < 0) nv = nv.map((c) => -c);
      const diff = Math.max(0, nv[0] * LICHT[0] + nv[1] * LICHT[1] + nv[2] * LICHT[2]);
      const glanz = Math.pow(Math.max(0, nv[0] * GLANZ[0] + nv[1] * GLANZ[1] + nv[2] * GLANZ[2]), 40);
      const istRoh = roh && !buechse && ((warum === 1 && aw(z) >= roh.R - 0.02)
        || (warum === 5 && roh.vorne != null && Math.abs(z - roh.vorne) < 2 * RASTER));
      const basis = buechse ? [112, 124, 140] : warum === 3 ? [226, 176, 120] : warum === 4 ? [168, 186, 212] : istRoh ? FARBE_ROH : FARBE_BEARB;
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

function malen(g, W, H, { umriss, strahl, bereich, dreh, zoom, schnitt, ueber, hinweis, roh }) {
  g.clearRect(0, 0, W, H);
  const { zmin, zmax, rmax } = bereich;
  const zm = (zmin + zmax) / 2;
  const diag = Math.hypot(zmax - zmin, 2 * rmax) || 1;
  const s = Math.min(W, H) / (diag * 1.1) * zoom;
  const ca = Math.cos(dreh.a), sa = Math.sin(dreh.a), cb = Math.cos(dreh.b), sb = Math.sin(dreh.b);
  const hin = ca >= 0; // +w zum Betrachter: dann ist das Viertel 0 … 90° offen, sonst −90 … 0°
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
  if (strahl) strahlenMalen(g, W, H, { ...strahl, bereich, dreh, zoom, schnitt, bu: ueber.buechse, roh });
  else if (umriss) {
    const { aussen, innen } = umriss;
    const zug = [...aussen, ...innen.slice().reverse()];
    const lang = Math.max(0.8, (zmax - zmin) / 25);
    const N = 48;
    const von = schnitt && hin ? Math.PI / 2 : 0, bis = schnitt && !hin ? 1.5 * Math.PI : 2 * Math.PI;
    const schritte = schnitt ? Math.round(N * 0.75) : N;
    for (let i = 0; i < zug.length; i++) {
      const p = zug[i], q = zug[(i + 1) % zug.length];
      if (p.r < 1e-6 && q.r < 1e-6) continue;
      if (Math.hypot(p.z - q.z, p.r - q.r) < 1e-9) continue;
      // Rohmaterial: Aussen-Ø der Stange oder ihre Stirn vorne
      const istRoh = roh && i < aussen.length - 1 && ((p.r >= roh.R - 0.02 && q.r >= roh.R - 0.02)
        || (roh.vorne != null && Math.abs(p.z - roh.vorne) < 0.03 && Math.abs(q.z - roh.vorne) < 0.03));
      // lange Stücke (die Stange) unterteilen, sonst sortiert der Maler
      // sie falsch gegen die Führungsbüchse
      const teile = Math.max(1, Math.ceil(Math.abs(q.z - p.z) / lang));
      for (let t = 0; t < teile; t++) {
        const a = { z: p.z + ((q.z - p.z) * t) / teile, r: p.r + ((q.r - p.r) * t) / teile };
        const b = { z: p.z + ((q.z - p.z) * (t + 1)) / teile, r: p.r + ((q.r - p.r) * (t + 1)) / teile };
        for (let j = 0; j < schritte; j++) {
          const f0 = von + ((bis - von) * j) / schritte, f1 = von + ((bis - von) * (j + 1)) / schritte;
          flaeche([ansicht(a.z, a.r, f0), ansicht(b.z, b.r, f0), ansicht(b.z, b.r, f1), ansicht(a.z, a.r, f1)], istRoh ? "roh" : "mantel");
        }
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
  // Seit 1.558.3 (Patrick 16. November 2026: „die Führungsbüchse soll als
  // 3D-Teil sichtbar sein, Aussendurchmesser 30 mm, das Loch entspricht
  // immer dem Rohmaterialdurchmesser“): Rohr aus Flächen, beim Aufschneiden
  // wie das Material ein Viertel offen
  const bu = ueber.buechse;
  if (bu && !strahl) {
    const N = 48, von = schnitt && hin ? Math.PI / 2 : 0, bis = schnitt && !hin ? 1.5 * Math.PI : 2 * Math.PI;
    const sch = schnitt ? Math.round(N * 0.75) : N;
    const teile = 12, dz = bu.L / teile;
    for (let k = 0; k < teile; k++) {
      const z1 = bu.z + k * dz, z2 = z1 + dz;
      for (let j = 0; j < sch; j++) {
        const f0 = von + ((bis - von) * j) / sch, f1 = von + ((bis - von) * (j + 1)) / sch;
        flaeche([ansicht(z1, bu.ra, f0), ansicht(z2, bu.ra, f0), ansicht(z2, bu.ra, f1), ansicht(z1, bu.ra, f1)], "buechse");
      }
      if (schnitt) for (const phi of [von, bis]) flaeche([ansicht(z1, bu.ri, phi), ansicht(z2, bu.ri, phi), ansicht(z2, bu.ra, phi), ansicht(z1, bu.ra, phi)], "buechse");
    }
    const ringe = 4;
    for (const zr of [bu.z, bu.z + bu.L]) for (let i = 0; i < ringe; i++) {
      const r1 = bu.ri + ((bu.ra - bu.ri) * i) / ringe, r2 = bu.ri + ((bu.ra - bu.ri) * (i + 1)) / ringe;
      for (let j = 0; j < sch; j++) {
        const f0 = von + ((bis - von) * j) / sch, f1 = von + ((bis - von) * (j + 1)) / sch;
        flaeche([ansicht(zr, r1, f0), ansicht(zr, r2, f0), ansicht(zr, r2, f1), ansicht(zr, r1, f1)], "buechse");
      }
    }
  }
  liste.sort((x, y) => x.tiefe - y.tiefe);
  const ox = W / 2, oy = H / 2 + 10;
  const P = (p) => ({ x: ox + p.x * s, y: oy - p.y * s });
  g.lineJoin = "round"; g.lineWidth = 0.7;
  for (const f of liste) {
    const basis = f.art === "schnitt" ? [226, 176, 120] : f.art === "buechse" ? [112, 124, 140] : f.art === "roh" ? FARBE_ROH : FARBE_BEARB;
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
  // Name der Führungsbüchse oben an ihrer Stirn
  if (bu) {
    const a = ebene(bu.z + bu.L / 2, bu.ra + 2.5, 0);
    g.fillStyle = "#425466"; g.font = "11px system-ui, sans-serif"; g.textAlign = "center";
    g.fillText("Führungsbüchse", a.x, a.y - 8);
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
  // Seit 1.560.0 (Patrick 16. November 2026: „Option, um nur Bearbeitung
  // für Bearbeitung laufen zu lassen“): hält am Ende jeder Bearbeitung an,
  // Abspielen fährt mit der nächsten weiter; je Gerät gemerkt
  const [einzeln, setEinzeln] = useState(() => { try { return localStorage.getItem("hofer.camSim.einzeln") === "1"; } catch { return false; } });
  const ziel = useRef(0);
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
    const ende = kanal === 2 ? W : sim.zStange;
    let umriss = st ? umrissVon(st, ende) : null;
    // Übergabe: die Gegenspindel zieht das abgestochene Teil nach vorne weg
    const abS = sim.schritte.find((x) => x.modus === "abstech");
    let wegZ = 0;
    if (kanal === 1 && abS && n > abS.von) wegZ = abS.punkte[Math.min(n, abS.bis) - abS.von - 1].ab || 0;
    if (umriss && wegZ) {
      const grenze = W + abS.breite / 2;
      const schieb = (l) => l.map((p) => (p.z < grenze ? { z: p.z - wegZ, r: p.r } : p));
      umriss = { aussen: schieb(umriss.aussen), innen: schieb(umriss.innen) };
    }
    const bereich0 = kanal === 2 ? { zmin: -3, zmax: W + 1, rmax: A / 2 + 2 } : { zmin: vorne - 4, zmax: sim.zMax + 4, rmax: Math.max(A / 2 + 2, BUECHSE_R + 1) };
    // Seit 1.567.1 (Patrick 16. November 2026: „es muss sich immer das
    // Werkstück bewegen in Z, nicht das Werkzeug“): die Ansicht folgt dem
    // Werkzeug in Z, es steht in der Mitte still, das Teil fährt
    let wzJetzt = null;
    for (const x of sim.schritte) {
      if (x.kanal !== kanal || x.von >= n || !x.punkte.length || x.achse) continue;
      wzJetzt = x.punkte[Math.min(n, x.bis) - x.von - 1];
    }
    const zMitte = (bereich0.zmin + bereich0.zmax) / 2;
    const dz = wzJetzt ? wzJetzt.z - zMitte : 0;
    const bereich = { ...bereich0, zmin: bereich0.zmin + dz, zmax: bereich0.zmax + dz };
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
      } else if (akt.modus === "abstech") {
        const Bw = akt.breite;
        ueber.werkzeuge.push({ pts: [{ z: p.z - Bw, r: p.r }, { z: p.z, r: p.r }, { z: p.z, r: p.r + 9 }, { z: p.z - Bw, r: p.r + 9 }],
          farbe: "rgba(224,161,42,.92)", rand: "#7a5410" });
      } else if (akt.wz && akt.modus === "bohr") {
        const u = bohrerHuelle(akt.wz).umriss;
        const auf = (l) => l.map((q) => ({ z: p.z - q.x, r: p.r + q.z }));
        ueber.werkzeuge.push({ pts: auf(u.schaft), farbe: "rgba(180,190,200,.95)", rand: "#5b6875" });
        ueber.werkzeuge.push({ pts: auf(u.schneide), farbe: "rgba(224,161,42,.92)", rand: "#7a5410" });
      }
    }
    // Vorne fährt das Material in Z durch die Führungsbüchse, rund 2 mm
    // hinter den Drehwerkzeugen (Patrick 14. November 2026). Sie steht im
    // Teil dort, wo sie beim letzten Drehwerkzeug war, am Anfang 2 mm
    // hinter der Stirn des Rohteils.
    if (kanal === 1) {
      let zb = vorne + 2, zDreh = null;
      for (const x of sim.schritte) {
        if (x.kanal !== 1 || x.von >= n || !x.punkte.length) continue;
        if (x.art !== "dreh" && x.art !== "seite" && x.modus !== "abstech") continue;
        const q = x.punkte[Math.min(n, x.bis) - x.von - 1];
        zb = q.z + 2 + (x.art === "seite" && x.wz ? bohrerHuelle(x.wz).R : 0);
        zDreh = q.z;
      }
      // Bei Front- und angetriebenen Werkzeugen fährt das Teil weiter durch
      // die feste Büchse: sie bleibt in der Ansicht stehen wie das Werkzeug
      if (wzJetzt && zDreh != null && akt && akt.kanal === 1 && akt.art !== "dreh" && akt.art !== "seite" && akt.modus !== "abstech" && !akt.achse) zb += wzJetzt.z - zDreh;
      ueber.buechse = { z: zb, ri: A / 2, ra: BUECHSE_R, L: BUECHSE_L };
    }
    // Mit Bohrungen und Fräsungen aus C und Y: Strahlen statt Maler
    const vx = stand.vox && stand.vox.weg > 0 ? stand.vox : null;
    const strahl = vx && umriss ? { st, vox: vx, kanal2: kanal === 2, Wt: W, q: laeuft ? 0.45 : 1 } : null;
    cv.__stand = stand; cv.__sim = sim; cv.__strahl = !!strahl; cv.__buechse = ueber.buechse; cv.__weg = wegZ; // für den Prüfstand
    // Rohmaterial: Stirn vorne nur vorne (Kanal 1), vor der Übergabe
    const roh = { R: A / 2, vorne: kanal === 1 && !wegZ ? vorne : null };
    malen(g, breite, HOCH, { umriss, strahl, bereich, dreh, zoom, schnitt, ueber, roh, hinweis: umriss ? "" : "Kein Material" });
  }, [sim, stand, n, kanal, akt, dreh, zoom, schnitt, breite, laeuft]);

  useEffect(() => {
    if (!laeuft) return undefined;
    let id;
    // Im eigenen Fenster mit dessen Takt, sonst steht es still, wenn das
    // Hauptfenster verdeckt ist
    const win = (leinwand.current && leinwand.current.ownerDocument.defaultView) || window;
    const weiter = () => {
      setN((x) => {
        const bis = einzeln && ziel.current > 0 ? Math.min(gesamt, ziel.current) : gesamt;
        const neu = Math.min(bis, x + Math.max(1, Math.round(Number(tempo) * 6)));
        if (neu >= bis) setLaeuft(false);
        return neu;
      });
      id = win.requestAnimationFrame(weiter);
    };
    id = win.requestAnimationFrame(weiter);
    return () => win.cancelAnimationFrame(id);
  }, [laeuft, tempo, gesamt, einzeln]);

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
            <button className="knopf knopf--klein knopf--primaer" id="cam-sim-start" onClick={() => {
              if (laeuft) { setLaeuft(false); return; }
              const ab = n >= gesamt ? 0 : n;
              if (n >= gesamt) setN(0);
              // Ende der Bearbeitung, in der es weitergeht
              const s = schritte.find((x) => x.punkte.length && x.bis > ab);
              ziel.current = s ? s.bis : gesamt;
              setLaeuft(true);
            }}>
              {laeuft ? "⏸ Pause" : "▶ Abspielen"}</button>
            <button className="knopf knopf--klein" id="cam-sim-anfang" onClick={() => { setLaeuft(false); setN(0); }}>⏮ Rohteil</button>
            <button className="knopf knopf--klein" id="cam-sim-ende" onClick={() => { setLaeuft(false); setN(gesamt); }}>Fertigteil ⏭</button>
            <label className="cam-feld">Tempo
              <select value={tempo} onChange={(e) => setTempo(e.target.value)}>
                {TEMPI.map(([x, t]) => <option key={x} value={x}>{t}</option>)}
              </select></label>
            <label className="schalter" title="Abspielen hält am Ende jeder Bearbeitung an, nochmals Abspielen fährt die nächste"><input type="checkbox" id="cam-sim-einzeln" checked={einzeln}
              onChange={(e) => { setEinzeln(e.target.checked); try { localStorage.setItem("hofer.camSim.einzeln", e.target.checked ? "1" : "0"); } catch { /* egal */ } }} /><span>Einzeln</span></label>
            <label className="schalter"><input type="checkbox" id="cam-sim-schnitt" checked={schnitt} onChange={(e) => setSchnitt(e.target.checked)} /><span>Aufgeschnitten</span></label>
            <button className="knopf knopf--klein" onClick={() => { setDreh(SCHRAEG); setZoom(1); }}>Schräg</button>
            <button className="knopf knopf--klein" onClick={() => setDreh(SEITE)}>Von der Seite</button>
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
          <p className="klein cam-sim__legende" data-cam-sim-legende><span className="cam-sim__farbe" style={{ background: `rgb(${FARBE_ROH})` }} />Rohmaterial
            <span className="cam-sim__farbe" style={{ background: `rgb(${FARBE_BEARB})` }} />bearbeitet</p>
          <p className="klein cam-sim__info">Ohne Halter, ohne Kollisionsprüfung. Gerechnet wird das erzeugte Programm, ohne Änderungen von Hand im Programmfenster.</p>
        </div>
      </div>
    </div>
  );
}
