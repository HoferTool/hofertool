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
import { RASTER, materialStand, simAufbauen, umrissVon, plattenHuelle, bohrerHuelle, innenTiefe, huelleFuer } from "./camSim.js";
import { drehKoerper, abstechKoerper, fraeserKoerper, halterLage } from "./camKoerper.js";
import { stepFertig, stepHolen, stepLokal, stepDrehKoerper, stepRundKoerper } from "./camStep.js";
import { MASCHINE_SB20RG, GEGEN_SB20RG, platzLage, traegerQuader, gegenEinheit, gegenQuader, platzLageSw, traegerSwQuader, swGehaeuseVorne, MASCHINE_SW20, SW20_K2, swK2Quader, walzeTeil, SB20_K2, sbK2Quader } from "./camMaschine.js";

// Seit 1.558.3 wie an der Maschine: Führungsbüchse links, das Teil schaut
// nach rechts, schräg von vorne auf die Stirn (Patrick 16. November 2026:
// „um 180° drehen … sie steht links“). Aufgeschnitten wird immer das
// Viertel, das zum Betrachter schaut.
const SCHRAEG = { a: Math.PI - 0.55, b: 0.42 };
const SEITE = { a: Math.PI, b: 0 };
// Seit 1.675.1: bei der SW-20 stehen die Träger links und rechts der
// Spindel (Bild star-sw20.png), X waagrecht, Y senkrecht
const SW_BLICK = -Math.PI / 2;
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
// frame (seit 1.683.0): das Teil steht anders als die Maschine, Welt-z =
// z0 + s·z, Welt-X = X + xf, Welt-Y = s·Y + yf (s = −1: um X gedreht, so
// steht das Teil in der Gegenspindel wie im Bild)
function abbildung(W, H, { bereich, dreh, zoom, frame }) {
  const { zmin, zmax, rmax } = bereich;
  let zm = (zmin + zmax) / 2;
  const diag = bereich.diag || Math.hypot(zmax - zmin, 2 * rmax) || 1;
  const s = Math.min(W, H) / (diag * 1.1) * zoom;
  const ca = Math.cos(dreh.a), sa = Math.sin(dreh.a), cb = Math.cos(dreh.b), sb = Math.sin(dreh.b);
  // Zeilen der Drehung (Welt x = z − zm, y = +X, w = +Y)
  const r1 = [ca, 0, sa], r2 = [sa * sb, cb, -ca * sb], r3 = [-sa * cb, sb, ca * cb];
  // Seit 1.675.1: dreh.c dreht das Bild um die Drehachse (SW-20 um 90°,
  // Patrick 21. November 2026: „bei dieser Maschine 90 Grad verdreht“)
  const c = dreh.c || 0;
  if (c) {
    const cc = Math.cos(c), sc = Math.sin(c);
    for (const r of [r1, r2, r3]) { const a = r[1], b = r[2]; r[1] = a * cc + b * sc; r[2] = -a * sc + b * cc; }
  }
  let ox = W / 2 + (bereich.px || 0), oy = H / 2 + 10 + (bereich.py || 0);
  // Mitte der Ansicht neben der Drehachse (Maschine SW-20)
  const mx = bereich.mx || 0, my = bereich.my || 0;
  ox -= s * (r1[1] * mx + r1[2] * my); oy += s * (r2[1] * mx + r2[2] * my);
  if (frame) {
    ox += s * (r1[1] * frame.xf + r1[2] * frame.yf);
    oy -= s * (r2[1] * frame.xf + r2[2] * frame.yf);
    for (const r of [r1, r2, r3]) { r[0] *= frame.s; r[2] *= frame.s; }
    zm = frame.s * (zm - frame.z0);
  }
  return { zm, s, ox, oy, r1, r2, r3 };
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
// Maschine (seit 1.580.0): Farben wie im Bild der SB-20RG
const FARBE_MASCHINE = { platte: [46, 82, 178], halter: [74, 82, 96], schneide: [224, 161, 42], gehaeuse: [196, 202, 210], werkzeug: [150, 158, 170], kopf: [204, 209, 216],
  // seit 1.683.0 SW-20 wie im Bild star-sw20.png
  platte3: [184, 78, 44], antrieb: [232, 235, 239], fest: [222, 190, 84], gelb: [236, 204, 92], block: [218, 222, 228], gold: [214, 172, 62], buechse: [112, 124, 140], roh: FARBE_ROH,
  // seit 1.686.0: Schlitten grau wie Guss, Schrauben brüniert, Spannmuttern
  // Stahl, Antriebe dunkel, Gehäuse der Spindeln
  schlitten: [178, 184, 192], schlitten2: [146, 152, 162], schraube: [52, 56, 62], mutter: [128, 134, 142], motor: [64, 70, 80],
  wand: [198, 203, 210], dunkel: [44, 48, 54] };
const METALL = new Set(["mutter", "schraube", "werkzeug", "schneide", "halter", "buechse", "kopf", "wand"]);
function strahlenMalen(g, W, H, { st, vox, kanal2, Wt, bereich, dreh, zoom, schnitt, q, bu, roh, roll = 0, frame = null }) {
  // roll: das Teil steht um C gedreht (Maschine fest), y/w der Maschine → im Teil
  const rc = Math.cos(roll), rs = Math.sin(roll);
  const ab = abbildung(W, H, { bereich, dreh, zoom, frame });
  const { zm, s, ox, oy, r1, r2, r3 } = ab;
  const iw = Math.max(40, Math.round(W * q)), ih = Math.max(30, Math.round(H * q));
  const doc = g.canvas.ownerDocument;
  const bild = doc.createElement("canvas"); bild.width = iw; bild.height = ih;
  const bg = bild.getContext("2d");
  if (!bg) return;
  const img = bg.createImageData(iw, ih), px = img.data;
  const { aussen, innen, z0 } = st;
  const kA = st.kernA, kI = st.kernI; // seit 1.681.0: Kern (Nabe) in der Bohrung
  const nk = aussen.length;
  let Rb = 0, ka = nk, kb = -1;
  for (let k = 0; k < nk; k++) if (aussen[k] > innen[k] + 1e-6) { if (aussen[k] > Rb) Rb = aussen[k]; if (k < ka) ka = k; kb = k; }
  if (kb < 0) return;
  const xa = z0 + ka * RASTER - zm - RASTER, xb = z0 + kb * RASTER - zm + RASTER;
  Rb += 0.01;
  const vh = vox ? vox.h : 0;
  const hin = Math.cos(dreh.a) >= 0 ? 1 : -1; // +w zum Betrachter?
  const vc = Math.cos(dreh.c || 0), vs = Math.sin(dreh.c || 0);
  const fs = frame ? frame.s : 1;
  const offen = (y, w0) => { const w = fs * w0; return schnitt && y * vc - w * vs > 0 && (y * vs + w * vc) * hin > 0; };
  const dt = Math.max(0.015, Math.min(vox ? vh * 0.7 : Infinity, Rb / 140, (xb - xa) / 140));
  // Führungsbüchse: Rohr ri … ra von bu.z bis bu.z + L
  const inBu = (x, y, w) => {
    if (!bu) return false;
    const z = x + zm;
    if (z < bu.z || z > bu.z + bu.L) return false;
    const r2v = y * y + w * w;
    if (r2v < bu.ri * bu.ri || r2v > bu.ra * bu.ra) return false;
    return !offen(y, w);
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
    if (ri > 0 && r2v <= ri * ri) {
      if (!kA || !(kA[k] > 0) || r2v > kA[k] * kA[k]) return 2;
      if (kI[k] > 0 && r2v < kI[k] * kI[k]) return 2;
    }
    if (offen(y, w)) return 3;
    if (vf) {
      const yp = y * rc + w * rs, wp = -y * rs + w * rc;
      const z1 = kanal2 ? Wt - z : z, w1 = kanal2 ? -wp : wp;
      const iz = Math.floor((z1 - vz0) / vh), iu = Math.floor((yp + vR) / vh), iv = Math.floor((w1 + vR) / vh);
      if (iz >= 0 && iz < vnz && iu >= 0 && iu < vnu && iv >= 0 && iv < vnu && vf[(iz * vnu + iu) * vnu + iv]) return 4;
    }
    return 0;
  };
  const aw = (z) => { const k = Math.max(0, Math.min(nk - 1, Math.round((z - z0) / RASTER))); return aussen[k]; };
  const iwv = (z) => { const k = Math.max(0, Math.min(nk - 1, Math.round((z - z0) / RASTER))); return innen[k]; };
  const kwv = (f, z) => { const k = Math.max(0, Math.min(nk - 1, Math.round((z - z0) / RASTER))); return f[k]; };
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
      else if (warum === 2 && kA) {
        // die nächste der drei Innenflächen: Bohrung aussen, Kern aussen, Bohrung im Kern
        const fl = [[Math.abs(r - iwv(z)), 0], [Math.abs(r - kwv(kA, z)), 1], [Math.abs(r - kwv(kI, z)), 2]].sort((u, v) => u[0] - v[0])[0][1];
        n = fl === 1 ? [-(kwv(kA, z + e) - kwv(kA, z - e)) / (2 * e), y / r, w / r]
          : fl === 2 ? [(kwv(kI, z + e) - kwv(kI, z - e)) / (2 * e), -y / r, -w / r]
          : [(iwv(z + e) - iwv(z - e)) / (2 * e), -y / r, -w / r];
      }
      else if (warum === 2) n = [(iwv(z + e) - iwv(z - e)) / (2 * e), -y / r, -w / r];
      else if (warum === 3) n = Math.abs(y) < Math.abs(w) ? [0, 1, 0] : [0, 0, 1];
      else {
        // Raster: Richtung zu den weggenommenen Nachbarzellen
        const yp = y * rc + w * rs, wp = -y * rs + w * rc;
        const z1 = kanal2 ? Wt - z : z, w1 = kanal2 ? -wp : wp;
        let gz = 0, gu = 0, gw = 0;
        for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) for (let c = -1; c <= 1; c++) {
          if (belegt(z1 + a * vh, yp + b2 * vh, w1 + c * vh)) { gz += a; gu += b2; gw += c; }
        }
        if (kanal2) { gz = -gz; gw = -gw; }
        // zurück an die Maschine (um +C)
        n = gz || gu || gw ? [gz, gu * rc - gw * rs, gu * rs + gw * rc] : d3.map((c) => -c);
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

function malen(g, W, H, { umriss, strahl, bereich, dreh, zoom, schnitt, ueber, hinweis, roh, maschine, roll: rollT = 0, frame = null, zweit = null }) {
  g.clearRect(0, 0, W, H);
  const { zmin, zmax, rmax } = bereich;
  const zm = (zmin + zmax) / 2;
  const diag = bereich.diag || Math.hypot(zmax - zmin, 2 * rmax) || 1;
  const s = Math.min(W, H) / (diag * 1.1) * zoom;
  const ca = Math.cos(dreh.a), sa = Math.sin(dreh.a), cb = Math.cos(dreh.b), sb = Math.sin(dreh.b);
  const hin = ca >= 0; // +w zum Betrachter: dann ist das Viertel 0 … 90° offen, sonst −90 … 0°
  const vc = dreh.c || 0, vcc = Math.cos(vc), vss = Math.sin(vc);
  // f: Lage eines Teils an der Maschine (siehe abbildung), ohne f wie die Maschine
  const ansichtF = (f) => (z, r, phi) => {
    let x = z - zm, X = r * Math.cos(phi), Y = r * Math.sin(phi);
    if (f) { x = f.s * z + f.z0 - zm; X += f.xf; Y = f.s * Y + f.yf; }
    const y = X * vcc - Y * vss, w = X * vss + Y * vcc;
    const x1 = x * ca + w * sa, w1 = -x * sa + w * ca;
    return { x: x1, y: y * cb - w1 * sb, t: y * sb + w1 * cb };
  };
  const ansicht = ansichtF(frame);
  const L = [-0.45, 0.65, 0.62].map((c, _, v) => c / Math.hypot(...v));
  const L2 = [0.55, -0.6, 0.3].map((c, _, v) => c / Math.hypot(...v));
  const Hh = (() => { const v = [L[0], L[1], L[2] + 1]; const l = Math.hypot(...v); return v.map((c) => c / l); })();
  const liste = [];
  let ziel = liste;
  let ox = W / 2 + (bereich.px || 0), oy = H / 2 + 10 + (bereich.py || 0);
  if (bereich.mx || bereich.my) {
    const c0 = ansichtF({ s: 1, z0: 0, xf: bereich.mx || 0, yf: bereich.my || 0 })(zm, 0, 0);
    ox -= c0.x * s; oy += c0.y * s;
  }
  const P = (p) => ({ x: ox + p.x * s, y: oy - p.y * s });
  const achseT = (z) => ansichtF(frame ? { s: 1, z0: 0, xf: frame.xf, yf: frame.yf } : null)(z, 0, 0).t;
  const flaeche = (pts, art, zc) => {
    const a = pts[0], b = pts[1], c = pts[2], d = pts[3] || pts[2];
    const u1 = [c.x - a.x, c.y - a.y, c.t - a.t], u2 = pts.length === 3 ? [b.x - a.x, b.y - a.y, b.t - a.t] : [d.x - b.x, d.y - b.y, d.t - b.t];
    let n = [u1[1] * u2[2] - u1[2] * u2[1], u1[2] * u2[0] - u1[0] * u2[2], u1[0] * u2[1] - u1[1] * u2[0]];
    const l = Math.hypot(...n);
    if (l < 1e-12) return;
    n = n.map((q) => q / l);
    if (n[2] < 0) n = n.map((q) => -q);
    const diff = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
    const glanz = Math.pow(Math.max(0, n[0] * Hh[0] + n[1] * Hh[1] + n[2] * Hh[2]), 40);
    if (ziel !== liste) {
      // Maschine: was ganz neben dem Bild liegt, weglassen (spart Zeit beim Abspielen)
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { const q = P(p); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      if (x1 < -5 || x0 > W + 5 || y1 < -5 || y0 > H + 5) return;
    }
    // seit 1.686.0 an der Maschine ein zweites, schwaches Licht von hinten
    // unten, damit Schattenseiten nicht flach wirken
    const hell = ziel !== liste ? 0.4 + 0.62 * diff + 0.2 * Math.max(0, n[0] * L2[0] + n[1] * L2[1] + n[2] * L2[2]) : 0.5 + 0.6 * diff;
    ziel.push({ pts, art, zc, hell, glanz, tiefe: pts.reduce((m, p) => m + p.t, 0) / pts.length });
  };
  const zeichnen = (l) => {
    g.lineJoin = "round"; g.lineWidth = 0.7;
    for (const f of l) {
      const basis = Array.isArray(f.art) ? f.art : f.art === "schnitt" ? [226, 176, 120] : f.art === "buechse" ? [112, 124, 140] : f.art === "roh" ? FARBE_ROH : FARBE_MASCHINE[f.art] || FARBE_BEARB;
      // Metall glänzt stärker als lackierte Flächen (seit 1.686.0)
      const gl = METALL.has(f.art) ? 0.85 : 0.55;
      const c = `rgb(${basis.map((q) => Math.min(255, Math.round(q * f.hell + 255 * f.glanz * gl))).join(",")})`;
      g.beginPath();
      f.pts.forEach((p, i) => { const q = P(p); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
      g.closePath(); g.fillStyle = c; g.strokeStyle = c; g.fill(); g.stroke();
    }
  };
  // Maschine (seit 1.580.0): Werkzeugträger als Quader, Spindelstock als
  // Zylinder, beides an der Maschine (X und Y ohne Drehung in C)
  const mListe = [];
  if (maschine) {
    ziel = mListe;
    const am = (z, xm, ym) => {
      const x = xm * vcc - ym * vss, y = xm * vss + ym * vcc;
      const x0 = z - zm, x1 = x0 * ca + y * sa, w1 = -x0 * sa + y * ca;
      return { x: x1, y: x * cb - w1 * sb, t: x * sb + w1 * cb };
    };
    // grosse Flächen in Stücke, sonst sortiert der Maler sie falsch
    const teile = (l) => Math.max(1, Math.min(14, Math.ceil(l / (maschine.grob ? 16 : 8))));
    const rechteck = (a, u, v, art) => {
      const nu = teile(Math.hypot(...u)), nv = teile(Math.hypot(...v));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const pt = (fi, fj) => am(a[0] + u[0] * fi + v[0] * fj, a[1] + u[1] * fi + v[1] * fj, a[2] + u[2] * fi + v[2] * fj);
        flaeche([pt(i / nu, j / nv), pt((i + 1) / nu, j / nv), pt((i + 1) / nu, (j + 1) / nv), pt(i / nu, (j + 1) / nv)], art,
          a[0] + u[0] * (i + 0.5) / nu + v[0] * (j + 0.5) / nv);
      }
    };
    // Walzen (seit 1.686.0): Zylinder in Z, X oder Y für Spindeln,
    // Spannmuttern, Hülsen und Schrauben; r2 = Radius am Ende (Kegel)
    const walzeMalen = (b) => {
      const e = b.achse === "x" ? [0, 1, 0] : b.achse === "y" ? [0, 0, 1] : [1, 0, 0];
      const u = b.achse === "z" ? [0, 1, 0] : [1, 0, 0];
      const v = [e[1] * u[2] - e[2] * u[1], e[2] * u[0] - e[0] * u[2], e[0] * u[1] - e[1] * u[0]];
      const r1 = b.r, r2 = b.r2 != null ? b.r2 : b.r;
      const N = b.n || (maschine.grob ? 10 : Math.max(10, Math.min(28, Math.round(b.r * 1.6))));
      const st = teile(Math.abs(b.L));
      const pt = (t, r, f) => am(b.z + e[0] * t + r * (u[0] * Math.cos(f) + v[0] * Math.sin(f)),
        b.x + e[1] * t + r * (u[1] * Math.cos(f) + v[1] * Math.sin(f)),
        b.y + e[2] * t + r * (u[2] * Math.cos(f) + v[2] * Math.sin(f)));
      const zc = (t) => b.z + e[0] * t;
      for (let j = 0; j < N; j++) {
        const f0 = (2 * Math.PI * j) / N, f1 = (2 * Math.PI * (j + 1)) / N;
        for (let i = 0; i < st; i++) {
          const t0 = (b.L * i) / st, t1 = (b.L * (i + 1)) / st;
          const ra = r1 + ((r2 - r1) * i) / st, rb = r1 + ((r2 - r1) * (i + 1)) / st;
          flaeche([pt(t0, ra, f0), pt(t1, rb, f0), pt(t1, rb, f1), pt(t0, ra, f1)], b.art, zc((t0 + t1) / 2));
        }
        // Deckel als Tortenstücke, sonst sortiert der Maler grosse Scheiben falsch
        if (!b.offen) {
          if (r1 > 0.05) flaeche([pt(0, 0, 0), pt(0, r1, f0), pt(0, r1, f1)], b.deckel || b.art, zc(0));
          if (r2 > 0.05) flaeche([pt(b.L, 0, 0), pt(b.L, r2, f0), pt(b.L, r2, f1)], b.deckel || b.art, zc(b.L));
        }
      }
    };
    for (const b of maschine.quader) {
      if (b.achse) { walzeMalen(b); continue; }
      const dz = b.z1 - b.z0, dx = b.x1 - b.x0, dy = b.y1 - b.y0;
      for (const z of [b.z0, b.z1]) rechteck([z, b.x0, b.y0], [0, dx, 0], [0, 0, dy], b.art);
      for (const x of [b.x0, b.x1]) rechteck([b.z0, x, b.y0], [dz, 0, 0], [0, 0, dy], b.art);
      for (const y of [b.y0, b.y1]) rechteck([b.z0, b.x0, y], [dz, 0, 0], [0, dx, 0], b.art);
    }
    // Spindelstock und Gegenspindel (seit 1.583.0), dir −1 = Körper nach −z
    for (const k of maschine.koepfe || (maschine.kopf ? [maschine.kopf] : [])) {
      const d = k.dir || 1;
      // Köpfe stehen an der Maschine (seit 1.683.0 mit Versatz x/y und Farbe)
      const ansicht = ansichtF(k.x || k.y || frame ? { s: 1, z0: 0, xf: k.x || 0, yf: k.y || 0 } : null);
      const kart = k.art || "kopf";
      const N = maschine.grob ? 24 : 40;
      const rohr = (z1, z2, r) => {
        const st = teile(z2 - z1);
        for (let i = 0; i < st; i++) {
          const a1 = z1 + ((z2 - z1) * i) / st, a2 = z1 + ((z2 - z1) * (i + 1)) / st;
          for (let j = 0; j < N; j++) {
            const f0 = (2 * Math.PI * j) / N, f1 = (2 * Math.PI * (j + 1)) / N;
            flaeche([ansicht(a1, r, f0), ansicht(a2, r, f0), ansicht(a2, r, f1), ansicht(a1, r, f1)], kart, (a1 + a2) / 2);
          }
        }
      };
      const ring = (z, r1, r2) => {
        for (let j = 0; j < N; j++) {
          const f0 = (2 * Math.PI * j) / N, f1 = (2 * Math.PI * (j + 1)) / N;
          if (r2 - r1 > 1e-6) flaeche([ansicht(z, r1, f0), ansicht(z, r2, f0), ansicht(z, r2, f1), ansicht(z, r1, f1)], kart, z);
        }
      };
      ring(k.z, k.ri, k.nase);
      rohr(k.z, k.z + d * k.naseL, k.nase);
      if (k.ri > 0) rohr(k.z, k.z + d * k.naseL, k.ri);
      ring(k.z + d * k.naseL, k.nase, k.r);
      if (k.L > 0) rohr(k.z + d * k.naseL, k.z + d * (k.naseL + k.L), k.r);
      ring(k.z + d * (k.naseL + k.L), k.ri, k.r);
    }
    ziel = liste;
  }
  // Werkzeug als 3D-Körper (seit 1.621.0): im Teil gerechnet wie die Bahn,
  // dreht mit dem Teil in C; beim Strahlenbild wie die Maschine vor oder
  // hinter dem Teil, sonst mit dem Teil sortiert
  const koerper = ueber.koerper || [];
  if (koerper.length) {
    ziel = strahl ? mListe : liste;
    const pk = (q) => ansicht(q[0], Math.hypot(q[1], q[2]), Math.atan2(q[2], q[1]) + (rollT || 0));
    // Seit 1.686.1 (Patrick 21. November 2026: „warum steht der Bohrer
    // optisch neben dem Teil?“): beim Strahlenbild galt jede Fläche hinter
    // der Drehachse als „hinten“ und wurde vom Teil und der Büchse
    // übermalt, auch wenn sie ganz ausserhalb des Materials vor der Stirn
    // lag; so blieb vom Bohrer nur das Ende sichtbar. Flächen ganz
    // ausserhalb des Materials (vor der Stirn oder über dem Aussen-Ø,
    // nicht in einer Bohrung) kommen jetzt immer nach vorne.
    const st = strahl && strahl.st;
    let draussen = null;
    if (st && st.aussen) {
      const nk = st.aussen.length;
      let ka = nk;
      for (let k = 0; k < nk; k++) if (st.aussen[k] > st.innen[k] + 1e-6) { ka = k; break; }
      const zv = st.z0 + ka * RASTER;
      draussen = (q) => {
        if (q[0] < zv - 1e-6) return true;
        const k = Math.floor((q[0] - st.z0) / RASTER);
        if (k < 0 || k >= nk) return true;
        const r = Math.hypot(q[1], q[2]);
        if (r > st.aussen[k] - 0.05) return true;
        // seit 1.687.0 (Patrick: „die Stechplatte steht neben dem Teil“):
        // aufgeschnitten liegt ein Werkzeug in der leeren Bohrung (nicht im
        // Kern) vor dem Teil, sonst verdeckte es die Wand dahinter
        if (!schnitt || r > st.innen[k] + 0.05) return false;
        return !(st.kernA && st.kernA[k] > 0 && r < st.kernA[k] - 0.05);
      };
    }
    for (const f of koerper) {
      const n0 = ziel.length;
      flaeche(f.pts.map(pk), f.art, f.pts[0][0]);
      if (draussen && ziel.length > n0 && f.pts.every(draussen)) ziel[ziel.length - 1].vorn = true;
    }
    ziel = liste;
  }
  // Drehteil aus seinem Umriss (Aussen- und Innenlinie), seit 1.684.0 auch
  // ein zweites Teil in der Gegenspindel (simultan)
  const teilMalen = (umr, ans, fr, rohI) => {
    const { aussen, innen } = umr;
    const zug = [...aussen, ...innen.slice().reverse()];
    const lang = Math.max(0.8, (zmax - zmin) / 25);
    const N = 48;
    let von = (schnitt && hin ? Math.PI / 2 : 0) - vc, bis = (schnitt && !hin ? 1.5 * Math.PI : 2 * Math.PI) - vc;
    if (fr && fr.s < 0) [von, bis] = [-bis, -von];
    const schritte = schnitt ? Math.round(N * 0.75) : N;
    for (let i = 0; i < zug.length; i++) {
      const p = zug[i], q = zug[(i + 1) % zug.length];
      if (p.r < 1e-6 && q.r < 1e-6) continue;
      if (Math.hypot(p.z - q.z, p.r - q.r) < 1e-9) continue;
      // Rohmaterial: Aussen-Ø der Stange oder ihre Stirn vorne
      const istRoh = rohI && i < aussen.length - 1 && ((p.r >= rohI.R - 0.02 && q.r >= rohI.R - 0.02)
        || (rohI.vorne != null && Math.abs(p.z - rohI.vorne) < 0.03 && Math.abs(q.z - rohI.vorne) < 0.03));
      // lange Stücke (die Stange) unterteilen, sonst sortiert der Maler
      // sie falsch gegen die Führungsbüchse
      const teile = Math.max(1, Math.ceil(Math.abs(q.z - p.z) / lang));
      for (let t = 0; t < teile; t++) {
        const a = { z: p.z + ((q.z - p.z) * t) / teile, r: p.r + ((q.r - p.r) * t) / teile };
        const b = { z: p.z + ((q.z - p.z) * (t + 1)) / teile, r: p.r + ((q.r - p.r) * (t + 1)) / teile };
        for (let j = 0; j < schritte; j++) {
          const f0 = von + ((bis - von) * j) / schritte, f1 = von + ((bis - von) * (j + 1)) / schritte;
          flaeche([ans(a.z, a.r, f0), ans(b.z, b.r, f0), ans(b.z, b.r, f1), ans(a.z, a.r, f1)], istRoh ? "roh" : "mantel");
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
        for (const phi of [von, bis]) flaeche([ans(z1, i1, phi), ans(z2, i2, phi), ans(z2, o2, phi), ans(z1, o1, phi)], "schnitt");
      }
    }
    };
  // Simultan (seit 1.684.0): das Teil von Kanal 2 in der Gegenspindel
  // Seit 1.689.1 (Patrick 21. November 2026: „das Fertigteil hat keine
  // Löcher“): mit Bohrungen aus C/Y als Strahlenbild, sonst als Umriss
  const zweitStrahl = zweit && zweit.strahl;
  const achse2 = (z) => ansichtF({ s: 1, z0: 0, xf: zweit.frame.xf, yf: zweit.frame.yf })(z, 0, 0).t;
  const zweitMalen = () => strahlenMalen(g, W, H, { ...zweit.strahl, bereich, dreh, zoom, schnitt, bu: null, roh: null, roll: zweit.roll || 0, frame: zweit.frame });
  if (zweit && zweit.umriss && !zweitStrahl) {
    ziel = mListe;
    teilMalen(zweit.umriss, ansichtF(zweit.frame), zweit.frame, null);
    ziel = liste;
  }
  if (strahl) {
    // Strahlenbild deckt nur, wo Material ist: was hinter der Drehachse
    // liegt, vorher zeichnen, den Rest danach
    if (mListe.length) {
      const hinten = mListe.filter((f) => !f.vorn && f.tiefe < achseT(f.zc));
      hinten.sort((x, y) => x.tiefe - y.tiefe);
      zeichnen(hinten);
    }
    strahlenMalen(g, W, H, { ...strahl, bereich, dreh, zoom, schnitt, bu: ueber.buechse, roh, roll: rollT, frame });
    const vorne = mListe.filter((f) => f.vorn || !(f.tiefe < achseT(f.zc)));
    vorne.sort((x, y) => x.tiefe - y.tiefe);
    if (zweitStrahl) {
      const hinten2 = vorne.filter((f) => !f.vorn && f.tiefe < achse2(f.zc));
      zeichnen(hinten2);
      zweitMalen();
      const h2 = new Set(hinten2);
      zeichnen(vorne.filter((f) => !h2.has(f)));
    } else zeichnen(vorne);
  } else if (umriss) {
    teilMalen(umriss, ansicht, frame, roh);
  }
  // Seit 1.558.3 (Patrick 16. November 2026: „die Führungsbüchse soll als
  // 3D-Teil sichtbar sein, Aussendurchmesser 30 mm, das Loch entspricht
  // immer dem Rohmaterialdurchmesser“): Rohr aus Flächen, beim Aufschneiden
  // wie das Material ein Viertel offen
  const bu = ueber.buechse;
  if (bu && !strahl) {
    const N = 48, von = (schnitt && hin ? Math.PI / 2 : 0) - vc, bis = (schnitt && !hin ? 1.5 * Math.PI : 2 * Math.PI) - vc;
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
  if (!strahl) liste.push(...mListe);
  liste.sort((x, y) => x.tiefe - y.tiefe);
  if (zweitStrahl && !strahl) {
    // das zweite Teil liegt als Bild zwischen dem, was hinter und vor seiner Achse liegt
    const hinten = liste.filter((f) => !f.vorn && f.tiefe < achse2(f.zc));
    zeichnen(hinten);
    zweitMalen();
    const h2 = new Set(hinten);
    zeichnen(liste.filter((f) => !h2.has(f)));
  } else zeichnen(liste);
  // Mittellinie
  g.setLineDash([10, 4, 2, 4]); g.strokeStyle = "rgba(220,60,60,.7)"; g.lineWidth = 1;
  const welt = ansichtF(null);
  const m1 = P(frame ? welt(zmin - 2, 0, 0) : ansicht(zmin - 2, 0, 0)), m2 = P(frame ? welt(zmax + 2, 0, 0) : ansicht(zmax + 2, 0, 0));
  g.beginPath(); g.moveTo(m1.x, m1.y); g.lineTo(m2.x, m2.y); g.stroke(); g.setLineDash([]);
  // Bahn und Werkzeug in der Ebene oben (+X), vor dem Körper
  // Seit 1.580.0 mit Maschine: das Teil dreht in C, Bahn und Werkzeug
  // (im Teil gerechnet) drehen mit, die Maschine steht
  const roll = rollT || 0;
  const ebene = (z, r, phi) => P(ansicht(z, r, (phi || 0) + roll));
  const kart = (z, u, w) => P(ansicht(z, Math.hypot(u, w), Math.atan2(w, u) + roll));
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
  for (const t of koerper.length ? [] : ueber.werkzeuge) {
    g.beginPath();
    t.pts.forEach((p, i) => { const q = ebene(p.z, p.r, p.phi); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
    g.closePath(); g.fillStyle = t.farbe; g.strokeStyle = t.rand; g.lineWidth = 1.2; g.fill(); g.stroke();
  }
  for (const st of koerper.length ? [] : ueber.stangen || []) {
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
  if (zweit) {
    const an2 = ansichtF(zweit.frame), eb2 = (z, r, phi) => P(an2(z, r, (phi || 0) + (zweit.roll || 0)));
    if (zweit.bahn && zweit.bahn.length > 1) {
      g.strokeStyle = "#e67814"; g.lineWidth = 1.6; g.beginPath();
      zweit.bahn.forEach((p, i) => { const q = eb2(p.z, p.r, p.phi); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
      g.stroke();
    }
    if (zweit.spitze) {
      const q = eb2(zweit.spitze.z, zweit.spitze.r, zweit.spitze.phi);
      g.fillStyle = "#b3261e"; g.beginPath(); g.arc(q.x, q.y, 3, 0, 2 * Math.PI); g.fill();
    }
  }
  if (hinweis) {
    g.fillStyle = "#425466"; g.font = "14px system-ui, sans-serif"; g.textAlign = "center";
    g.fillText(hinweis, W / 2, H / 2);
  }
}

const STATUS = {
  fehlt: "Werkzeug fehlt, nur Bahn", nurBahn: "Drehwerkzeug an Front: nur Bahn", nurBahnA: "Drehplatte am angetriebenen Werkzeug: nur Bahn", leer: "keine Wege",
};

// Einzelsatz: Ende der NC-Zeile, zu der der nächste Punkt ab „ab“ gehört
// (alle Punkte einer Zeile tragen dieselbe Nummer nr)
// Seit 1.696.0 der Halter 12 × 12 zur Platte (camHalter.js), beim
// Ausdrehen eine Bohrstange: dafür das kleinste Loch, in dem sie schneidet,
// und wie tief sie eintaucht (aus den Vorschubzeilen der Bearbeitung)
function halterOpt(s, maschine) {
  const pk = s.punkte || [];
  let rb = Infinity, zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < pk.length; i++) {
    const q = pk[i];
    if (!q.vor) continue;
    zmin = Math.min(zmin, q.z); zmax = Math.max(zmax, q.z);
    if (i + 1 < pk.length && pk[i + 1].nr === q.nr) continue;
    if (q.r > 0.05 && q.r < rb) rb = q.r;
  }
  const p0 = pk[0];
  // radial im Stahlhalter (T100–T600, SW-20 T100–T400, T1100/T1200)
  const radial = s.art === "dreh" || s.art === "k3dr";
  if (!p0 || zmin === Infinity) return { maschine, radial };
  // aus dem Loch heraus: dorthin, wo die Bearbeitung anfängt
  const dir = p0.z <= (zmin + zmax) / 2 ? -1 : 1;
  const tiefe = Math.max(Math.abs(zmax - p0.z), Math.abs(zmin - p0.z));
  return { maschine, radial, innen: { rb: rb === Infinity ? 0 : rb, tiefe, dir } };
}

export function satzEnde(s, ab) {
  let k = Math.max(ab, s.von);
  if (k >= s.bis) return s.bis;
  const nr = s.punkte[k - s.von].nr;
  while (k + 1 < s.bis && s.punkte[k + 1 - s.von].nr === nr) k++;
  return k + 1;
}

function Simulation({ w, zu }) {
  const sim = useMemo(() => simAufbauen(w), [w]);
  const cache = useRef(new Map());
  // Seit 1.598.0 beginnt die Simulation immer beim Rohteil wie der Knopf
  // „⏮ Rohteil“ (Patrick 17. November 2026: „öffne die Simulation immer am Anfang“)
  // nT: Stand des Reglers; nacheinander gleich n, simultan die Zeit
  const [nT, setN] = useState(0);
  // Seit 1.684.0 (Wunsch Patrick 21. November 2026: „vorne und hinten
  // arbeiten ja dann simultan … ich will nacheinander oder simultan wählen
  // können“): simultan läuft Kanal 2 am vorigen Teil, während Kanal 1 und 3
  // das nächste bearbeiten; je Gerät gemerkt
  const [simultan, setSimultan] = useState(() => { try { return localStorage.getItem("hofer.camSim.simultan") === "1"; } catch { return false; } });
  const cache2 = useRef(new Map());
  const [laeuft, setLaeuft] = useState(false);
  const [tempo, setTempo] = useState("3");
  // Seit 1.560.0 (Patrick 16. November 2026: „Option, um nur Bearbeitung
  // für Bearbeitung laufen zu lassen“): hält am Ende jeder Bearbeitung an,
  // Abspielen fährt mit der nächsten weiter; je Gerät gemerkt
  const [einzeln, setEinzeln] = useState(() => { try { return localStorage.getItem("hofer.camSim.einzeln") === "1"; } catch { return false; } });
  // Seit 1.589.0 (Wunsch Patrick 17. November 2026: „die Simulation auch im
  // Einzelsatz machen können“): wie Einzelsatz an der Steuerung fährt
  // Abspielen nur die nächste NC-Zeile mit Bewegung und hält dann an
  const [satz, setSatz] = useState(() => { try { return localStorage.getItem("hofer.camSim.satz") === "1"; } catch { return false; } });
  const halten = (art, an) => {
    const paar = [["einzeln", setEinzeln], ["satz", setSatz]];
    for (const [k, f] of paar) {
      const wert = k === art ? an : false;
      if (k !== art && !an) continue;
      f(wert);
      try { localStorage.setItem("hofer.camSim." + k, wert ? "1" : "0"); } catch { /* egal */ }
    }
  };
  const ziel = useRef(0);
  const setNT = (x) => { setTeilAnsicht(false); setN(x); };
  // Seit 1.580.0: Maschine (Werkzeugträger Kanal 1, Spindelstock) zeigen, je Gerät gemerkt
  const [maschineWahl, setMaschineAn] = useState(() => { try { return localStorage.getItem("hofer.camSim.maschine") !== "0"; } catch { return true; } });
  // Seit 1.689.0 (Patrick 21. November 2026: „ich will es dann als 3D-Modell
  // betrachten können und drehen und schwenken“): „Fertigteil ansehen“ zeigt
  // nur das fertige Teil ohne Maschine, frei drehbar und zoombar
  const [teilAnsicht, setTeilAnsicht] = useState(false);
  const maschineAn = maschineWahl && !teilAnsicht;
  const [dreh, setDreh] = useState(SCHRAEG);
  const [zoom, setZoom] = useState(1);
  // Ansicht verschieben (seit 1.682.0): Shift, rechte oder mittlere Maustaste ziehen, zwei Finger
  const [schieb, setSchieb] = useState({ x: 0, y: 0 });
  const [schnitt, setSchnitt] = useState(true);
  // seit 1.621.0 Werkzeug als 3D-Körper (Patrick 18. November 2026), je Gerät gemerkt
  const [dreiD, setDreiD] = useState(() => { try { return localStorage.getItem("hofer.camSim.wz3d") !== "0"; } catch { return true; } });
  const [breite, setBreite] = useState(800);
  // fürs Zoomen mit dem Mausrad (Handler ohne neue Bindung je Bild)
  const zoomRef = useRef(1), schiebRef = useRef({ x: 0, y: 0 }), breiteRef = useRef(800);
  const rahmen = useRef(null), leinwand = useRef(null), ziehen = useRef(null), finger = useRef(new Map());
  const { gesamt, schritte } = sim;
  const abSchritt = schritte.find((s) => s.modus === "abstech");
  // seit 1.691.0 auch an der SB-20RG, ausser Kanal 2 braucht Werkzeuge von
  // Träger 1 (Front an der Gegenspindel), dann geht es nur nacheinander
  const simMoeglich = !!(sim.hatK2 && abSchritt && (sim.sw || !schritte.some((s) => s.kanal === 2 && (s.art === "front" || s.art === "quer"))));
  // Zeit simultan: bis Tm laufen Kanal 1/3 (bis vor dem Abstechen) und
  // Kanal 2 gleichzeitig, wer früher fertig ist, wartet; danach Abstechen
  // und Übergabe
  const zeit = useMemo(() => {
    if (!simultan || !simMoeglich) return null;
    const L1 = abSchritt.von, k2 = abSchritt.bis, L2 = gesamt - k2, Tm = Math.max(L1, L2);
    return {
      L1, k2, L2, Tm, T: Tm + (abSchritt.bis - abSchritt.von),
      a: (t) => (t <= Tm ? Math.min(t, L1) : abSchritt.von + (t - Tm)),
      b: (t) => k2 + Math.min(t, L2),
    };
  }, [simultan, simMoeglich, abSchritt, gesamt]);
  const n = teilAnsicht ? gesamt : zeit ? zeit.a(nT) : nT;
  const nB = !teilAnsicht && zeit && nT < zeit.Tm ? zeit.b(nT) : null;
  // Stand des Teils in der Gegenspindel (simultan); nach Kanal 2 bleibt es
  // fertig, auch wenn nB danach nicht mehr läuft (Ablage)
  const nBS = !teilAnsicht && zeit ? (nT < zeit.Tm ? zeit.b(nT) : gesamt) : null;
  const endeT = zeit ? zeit.T : gesamt;
  // Regler-Stand am Ende eines Schritts
  const tVon = (s) => (!zeit ? s.bis : s.kanal === 2 ? s.bis - zeit.k2 : s.modus === "abstech" ? zeit.T : s.bis);
  const grenzen = [...new Set([0, ...schritte.filter((s) => s.punkte.length).map(tVon), ...(zeit ? [zeit.Tm] : []), endeT])].sort((x, y) => x - y);

  // aktueller Schritt: der, in dem der letzte gezeigte Punkt liegt
  const jetzt = Math.max(0, n - 1);
  const akt = schritte.find((s) => s.von <= jetzt && jetzt < s.bis)
    || [...schritte].reverse().find((s) => s.bis <= n && s.punkte.length) || schritte[0];
  // STEP-Datei des Werkzeugs (seit 1.622.0): einmal lesen, dann neu zeichnen
  const stepUrl = dreiD && akt && akt.wz && akt.wz.step && akt.wz.step.url || "";
  const [stepStand, setStepStand] = useState({ url: "", fehler: "" });
  useEffect(() => {
    if (!stepUrl || stepFertig(stepUrl)) return;
    let weg = false;
    stepHolen(stepUrl).then(() => { if (!weg) setStepStand({ url: stepUrl, fehler: "" }); })
      .catch((f) => { if (!weg) setStepStand({ url: stepUrl, fehler: (f && f.message) || String(f) }); });
    return () => { weg = true; };
  }, [stepUrl]);
  const kanal = n >= gesamt && sim.hatK2 ? 2 : akt ? akt.kanal : 1;
  const stand = useMemo(() => materialStand(sim, n, cache.current), [sim, n]);
  const standB = useMemo(() => (nBS != null ? materialStand(sim, nBS, cache2.current) : null), [sim, nBS]);
  const aktB = nB != null ? schritte.find((s) => s.kanal === 2 && s.von < nB && nB <= s.bis) || null : null;
  // Spindelstock: fährt mit dem Material, steht also im Teil fest, hinter
  // der Führungsbüchse, auch wenn das Teil am weitesten draussen ist
  // Seit 1.587.0: beim versetzten Abstecher sitzt die Platte von T100 um
  // den wirksamen Versatz vor der Ebene der Drehwerkzeuge
  const lageVon = (platz) => {
    const l = sim.sw ? platzLageSw(platz, sim.swFront) : platzLage(platz);
    return l && Number(platz) === 100 && sim.abVersatz ? { ...l, dz: -sim.abVersatz } : l;
  };
  // SW-20 (seit 1.682.0, Patrick 21. November 2026: „die Werkzeuge auf
  // Kanal 1 und 3 sind auf einem festen Block montiert … wenn die Maschine
  // bewegt, fahren alle Werkzeuge pro Kanal mit … wenn Z3 fährt, bewegen
  // sich die Werkzeuge in Z, nicht das Material“): jeder Träger ist ein
  // starrer Block. Wie weit ein Werkzeug vorne aus seinem Träger steht,
  // gibt das Programm (Vorposition vor G50, „dzVorne“), fest je Platz.
  // Mit M133 steht Träger 3 in Z an einer festen Stelle zur Drehebene
  // (rel3), das Material fährt; mit M131 fährt Träger 3 als Ganzes in Z3.
  // rel3 so gewählt, dass die Werkzeuge im Mittel so weit vorstehen wie im
  // Bild und keines hinter seinem Gehäuse liegt.
  const swSpitzen = useMemo(() => {
    if (!sim.sw) return null;
    const lage = (pl) => platzLageSw(pl, sim.swFront);
    const k3 = sim.schritte.filter((x) => x.kanal === 1 && x.pfad === 3 && x.dzVorne != null && lage(x.platz));
    let rel3 = -2;
    if (k3.length) {
      const d = k3.map((x) => x.dzVorne - lage(x.platz).dz).sort((a, b) => a - b);
      rel3 = d[Math.floor(d.length / 2)];
      // kein Werkzeug hinter der Vorderkante seines Gehäuses
      for (const x of k3) rel3 = Math.min(rel3, x.dzVorne - swGehaeuseVorne(lage(x.platz), MASCHINE_SW20) - 5);
    }
    const dz = {};
    for (const x of sim.schritte) {
      if (x.kanal !== 1 || x.dzVorne == null || !lage(x.platz)) continue;
      if (dz[x.platz] != null) continue;
      dz[x.platz] = x.pfad === 3 ? x.dzVorne - rel3 : x.dzVorne;
    }
    return { rel3, dz };
  }, [sim]);
  const kopfZ = useMemo(() => {
    let z = sim.zMax + 2;
    for (const x of sim.schritte) {
      if (x.kanal !== 1 || x.zTraeger) continue;
      const l = lageVon(x.platz);
      if (l) for (const p of x.punkte) z = Math.max(z, p.z - (x.pfad === 3 ? x.dzVorne : x.dzVorne ?? l.dz) + 2);
    }
    return z + BUECHSE_L + MASCHINE_SB20RG.kopf.abstand;
  }, [sim]);

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
      // seit 1.598.1 auch bei angetriebenen Werkzeugen (C, Y): vorher blieb
      // dort das Teil stehen und Büchse und Werkzeug fuhren (Patrick
      // 17. November 2026: „beim Fräsen der Nuten bewegt sich die
      // Führungsbüchse und nicht das Material“)
      if (x.kanal !== kanal || x.von >= n || !x.punkte.length) continue;
      // SW-20 Kanal 3 mit M131: der Träger 3 fährt in Z, das Material steht,
      // darum bleibt die Ansicht am Anfang der Bearbeitung stehen
      wzJetzt = x.zTraeger ? x.punkte[0] : x.punkte[Math.min(n, x.bis) - x.von - 1];
    }
    const zMitte = (bereich0.zmin + bereich0.zmax) / 2;
    const dz = wzJetzt ? wzJetzt.z - zMitte : 0;
    let bereich = { ...bereich0, zmin: bereich0.zmin + dz, zmax: bereich0.zmax + dz, px: schieb.x, py: schieb.y };
    // Bahn und Werkzeug des aktuellen Schritts
    const ueber = { bahnen: [], werkzeuge: [], stangen: [], koerper: [], spitze: null, buechse: null };
    let halterSchieb = null;
    if (akt && akt.kanal === kanal && akt.punkte.length && n > akt.von) {
      const bis = Math.min(n, akt.bis) - akt.von;
      const pts = akt.punkte.slice(0, bis);
      const farbe = akt.status === "fehlt" ? "#d32f2f" : "#e67814";
      let lauf = [], vor = null;
      const fertig = () => { if (lauf.length > 1) ueber.bahnen.push({ pts: lauf, farbe: vor ? farbe : "rgba(90,105,120,.8)", strich: !vor, dick: vor ? 1.6 : 1 }); };
      for (const p of pts) {
        const zp = akt.modus === "bohr" || akt.art === "front" ? { z: p.z, r: p.r, phi: p.phi } : p;
        if (vor !== null && p.vor !== vor) { fertig(); lauf = [lauf[lauf.length - 1]]; }
        vor = p.vor; lauf.push(zp);
      }
      fertig();
      const p = pts[pts.length - 1];
      ueber.spitze = p;
      if (akt.wz && akt.modus === "dreh") {
        const h = huelleFuer(akt);
        if (h) ueber.werkzeuge.push({ pts: h.umriss.map((q) => ({ z: p.z + q.z, r: p.r + q.x, phi: p.phi })), farbe: "rgba(224,161,42,.92)", rand: "#7a5410" });
        // seit 1.621.0 als 3D-Körper, mit Maschine zeichnet der Träger den Schaft
        const netz = dreiD && akt.wz.step && stepFertig(akt.wz.step.url);
        const k0 = ueber.koerper.length;
        if (netz) ueber.koerper.push(...stepDrehKoerper(stepLokal(netz, akt.wz, false), p));
        else if (h && dreiD) {
          ueber.koerper.push(...drehKoerper(akt.wz, p, h.umriss, halterOpt(akt, maschineAn)));
          // Träger so, dass sein Schaft genau dort sitzt, wo der Halter die
          // Platte hält (Spanfläche = Oberkante, f1 nach ISO 5610)
          const hl = (akt.art === "dreh" || akt.art === "k3dr") ? halterLage(akt.wz, h.umriss) : null;
          if (hl) halterSchieb = { dz: (hl.z0 + hl.z1) / 2 + 6, dy: akt.pfad === 3 ? 6 : -6, platz: akt.platz };
        }
        // Kanal 3 der SW-20: Träger gegenüber, der Körper um die Achse gedreht
        if (akt.pfad === 3) for (let j = k0; j < ueber.koerper.length; j++) ueber.koerper[j] = { ...ueber.koerper[j], pts: ueber.koerper[j].pts.map((q) => [q[0], -q[1], -q[2]]) };
      } else if (akt.wz && akt.modus === "c") {
        // Achse in der Ansicht: Kanal 2 von hinten (z und w gespiegelt)
        const ax = kanal === 2 ? [-p.ax[0], p.ax[1], -p.ax[2]] : p.ax;
        const u = p.r * Math.cos(p.phi), ww = p.r * Math.sin(p.phi);
        const h = bohrerHuelle(akt.wz), Lc = Math.max(2, (h.rad.length - 1) * 0.02), d = 2 * h.R;
        const pkt = (a) => [p.z + ax[0] * a, u + ax[1] * a, ww + ax[2] * a];
        ueber.stangen.push({ a: pkt(0), b: pkt(Lc), d, farbe: "rgba(224,161,42,.92)", rand: "#7a5410" });
        ueber.stangen.push({ a: pkt(Lc), b: pkt(Lc + d * 1.5), d: d * 1.15, farbe: "rgba(180,190,200,.95)", rand: "#5b6875" });
        const netz = dreiD && akt.wz.step && stepFertig(akt.wz.step.url);
        if (netz) ueber.koerper.push(...stepRundKoerper(stepLokal(netz, akt.wz, true), pkt(0), ax, parseFloat(akt.wz.laenge)));
        else if (dreiD) ueber.koerper.push(...fraeserKoerper(akt.wz, pkt(0), ax));
      } else if (akt.modus === "abstech") {
        const Bw = akt.breite;
        ueber.werkzeuge.push({ pts: [{ z: p.z - Bw, r: p.r }, { z: p.z, r: p.r }, { z: p.z, r: p.r + A / 2 + 4 }, { z: p.z - Bw, r: p.r + A / 2 + 4 }],
          farbe: "rgba(224,161,42,.92)", rand: "#7a5410" });
        if (dreiD) ueber.koerper.push(...abstechKoerper(p, Bw, A / 2 + 4));
      } else if (akt.wz && akt.modus === "bohr") {
        const u = bohrerHuelle(akt.wz).umriss;
        const auf = (l) => l.map((q) => ({ z: p.z - q.x, r: p.r + q.z, phi: p.phi }));
        ueber.werkzeuge.push({ pts: auf(u.schaft), farbe: "rgba(180,190,200,.95)", rand: "#5b6875" });
        ueber.werkzeuge.push({ pts: auf(u.schneide), farbe: "rgba(224,161,42,.92)", rand: "#7a5410" });
        const netz = dreiD && akt.wz.step && stepFertig(akt.wz.step.url);
        if (netz) ueber.koerper.push(...stepRundKoerper(stepLokal(netz, akt.wz, true), [p.z, p.r, 0], [-1, 0, 0], parseFloat(akt.wz.laenge)));
        else if (dreiD) ueber.koerper.push(...fraeserKoerper(akt.wz, [p.z, p.r, 0], [-1, 0, 0]));
      }
    }
    // Seit 1.580.0: Werkzeugträger von Kanal 1 mit allen Werkzeugen, er
    // fährt in X und Y wie das Werkzeug, das gerade arbeitet; der Platz aus
    // camMaschine.js gibt die Lage am Träger
    let traeger = null, roll = 0, swLage = null;
    // SW-20 (seit 1.669.0): zwei Träger an der Hauptspindel. Kanal 1 fährt
    // das Material in Z (die Drehebene wandert im Teil), Träger 1 und 3 in
    // X und Y; Kanal 3 fährt mit M131 seinen Träger in Z3 (das Material
    // steht), mit M133 steuert Kanal 3 Z1 und das Material fährt
    // Lage der Träger bei Punkt nn (Kanal 1 und 3)
    // SB-20RG (seit 1.691.0): ein Träger, Drehebene aus dem Werkzeug, das
    // gerade arbeitet, G28 U fährt ihn in X zurück
    const sbLageBei = (nn) => {
      const A2 = A / 2;
      let zE = vorne, t1 = { z: vorne, x: A2 + 3, y: 0 }, sAkt = null, pAkt = null, zurueck = false;
      for (const x of sim.schritte) {
        if (x.kanal !== 1 || x.von >= nn || !x.punkte.length) continue;
        const q = x.punkte[Math.min(nn, x.bis) - x.von - 1];
        const l = lageVon(x.platz);
        sAkt = x; pAkt = q;
        if (!l) continue;
        const X = q.mx != null ? q.mx : q.r, Y = q.my != null ? q.my : 0;
        zE = q.z - (x.dzVorne ?? l.dz);
        t1 = { z: zE, x: X - l.x, y: Y - l.y };
        if (nn >= x.bis && (x.zeilen || []).some((z) => /G28\s*U/i.test(String(z)))) { t1 = { ...t1, x: A2 + 40 }; zurueck = true; } else zurueck = false;
      }
      return { zE, t1, t3: null, aktiv: sAkt && !zurueck ? sAkt.platz : 0, zurueck, pfad: 1, roll: pAkt ? ((pAkt.c || 0) * Math.PI) / 180 : 0 };
    };
    const swLageBei = (nn) => {
      if (!sim.sw) return sbLageBei(nn);
      const A2 = A / 2;
      let zE = vorne, t1 = { z: vorne, x: A2 + 3, y: 0 }, t3 = { x: -(A2 + 25), y: 0 }, rel3 = swSpitzen.rel3, sAkt = null, pAkt = null, zurueck = false;
      for (const x of sim.schritte) {
        if (x.kanal !== 1 || x.von >= nn || !x.punkte.length) continue;
        const q = x.punkte[Math.min(nn, x.bis) - x.von - 1];
        const l = lageVon(x.platz);
        sAkt = x; pAkt = q;
        if (!l) continue;
        if (x.pfad === 3) {
          const X = q.mx != null ? q.mx : -q.r, Y = q.my != null ? q.my : 0;
          const tip = swSpitzen.dz[x.platz] ?? l.dz;
          t3 = { x: X + l.x, y: Y - l.y }; // seit 1.680.0 Träger 3 in Y nicht mehr gespiegelt
          // M133: Kanal 3 fährt Z1, das Material; Träger 3 steht fest
          // M131/M142: Träger 3 fährt in Z3, das Material steht
          if (x.m133) { zE = q.z - x.dzVorne; rel3 = swSpitzen.rel3; } else rel3 = q.z - tip - zE;
        } else {
          const X = q.mx != null ? q.mx : q.r, Y = q.my != null ? q.my : 0;
          zE = q.z - (x.dzVorne ?? l.dz);
          t1 = { z: zE, x: X - l.x, y: Y - l.y };
        }
        // seit 1.683.0: G28 U0. am Ende der Bearbeitung fährt den Träger in X
        // zurück in die Grundstellung
        if (nn >= x.bis && (x.zeilen || []).some((z) => /G28\s*U/i.test(String(z)))) {
          if (x.pfad === 3) t3 = { ...t3, x: -(A2 + 40) }; else t1 = { ...t1, x: A2 + 40 };
          zurueck = x === sAkt;
        } else zurueck = false;
      }
      if (t1.z !== zE) t1 = { ...t1, z: zE };
      return { zE, t1, t3: { ...t3, z: zE + rel3 }, aktiv: sAkt && !zurueck ? sAkt.platz : 0, zurueck, pfad: sAkt ? sAkt.pfad : 1, roll: pAkt ? ((pAkt.c || 0) * Math.PI) / 180 : 0 };
    };
    if (sim.sw && kanal === 1) {
      swLage = swLageBei(n);
      roll = swLage.roll;
      // zurückgefahren: das Werkzeug steckt wieder im Träger
      if (swLage.zurueck && maschineAn) { ueber.koerper = []; ueber.werkzeuge = []; ueber.stangen = []; ueber.spitze = null; }
      if (maschineAn) traeger = { ...(swLage.pfad === 3 ? swLage.t3 : swLage.t1), aktiv: swLage.aktiv, pfad: swLage.pfad };
    } else if (maschineAn && kanal === 1) {
      let sAkt = null, pAkt = null;
      for (const x of sim.schritte) {
        if (x.kanal !== 1 || x.von >= n || !x.punkte.length) continue;
        sAkt = x; pAkt = x.punkte[Math.min(n, x.bis) - x.von - 1];
      }
      const l = sAkt ? lageVon(sAkt.platz) : null;
      if (l && pAkt) {
        const X = pAkt.mx != null ? pAkt.mx : pAkt.r, Y = pAkt.my != null ? pAkt.my : 0;
        traeger = { z: pAkt.z - (sAkt.dzVorne ?? l.dz), x: X - l.x, y: Y - l.y, aktiv: sAkt.platz };
        // Frontwerkzeug mit Spitze vor der Drehebene aus dem Programm: Halter
        // von der Bohreinheit bis hinter das gezeichnete Werkzeug
        if (sAkt.dzVorne != null && l.art === "front") {
          let L = 8;
          if (sAkt.wz && (sAkt.modus === "bohr" || sAkt.modus === "c")) {
            const u = bohrerHuelle(sAkt.wz).umriss;
            L = Math.max(...[...u.schaft, ...u.schneide].map((q) => q.x));
          }
          traeger.spitze = { dz: sAkt.dzVorne, L };
        }
        roll = ((pAkt.c || 0) * Math.PI) / 180;
      } else if (!sAkt) {
        // noch nichts gefahren: T100 über dem Rohteil an der Stirn
        traeger = { z: vorne, x: A / 2 + 3, y: 0, aktiv: 0 };
      }
      // feste Maschine (seit 1.691.0): Drehebene und G28 U wie bei der SW-20
      swLage = sbLageBei(n);
      if (swLage.zurueck && traeger) {
        traeger = { ...traeger, x: swLage.t1.x, aktiv: 0, spitze: null };
        ueber.koerper = []; ueber.werkzeuge = []; ueber.stangen = []; ueber.spitze = null;
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
        zb = q.z + 2 + (x.art === "seite" && x.wz ? bohrerHuelle(x.wz).R : 0) + (x.platz === 100 ? sim.abVersatz || 0 : 0);
        zDreh = q.z;
      }
      // Bei Front- und angetriebenen Werkzeugen fährt das Teil weiter durch
      // die feste Büchse: sie bleibt in der Ansicht stehen wie das Werkzeug
      if (wzJetzt && zDreh != null && akt && akt.kanal === 1 && akt.art !== "dreh" && akt.art !== "seite" && akt.modus !== "abstech") zb += wzJetzt.z - zDreh;
      // Seit 1.585.0: Spitze steht fest vor der Drehebene (Z aus dem Programm)
      if (wzJetzt && akt && akt.kanal === 1 && akt.dzVorne != null) zb = wzJetzt.z - akt.dzVorne + 2;
      // mit Maschine steht die Büchse fest am Träger, 2 mm hinter den Drehwerkzeugen
      if (traeger && !swLage) zb = traeger.z + 2;
      if (swLage) zb = swLage.zE + 2;
      ueber.buechse = { z: zb, ri: A / 2, ra: BUECHSE_R, L: BUECHSE_L };
    }
    // Seit 1.682.0 (Patrick 21. November 2026: „wenn Maschinenansicht
    // aktiviert ist, soll sich Bildzoom und Position der Ansicht nicht
    // ändern, ich will die Maschine arbeiten sehen und selber zoomen,
    // verschieben und drehen“): mit Maschine steht die Ansicht fest an der
    // Maschine (vorne an der Drehebene, die das Material durchfährt), der
    // Massstab ist für beide Kanäle derselbe
    // SW-20 (seit 1.683.0, Patrick 21. November 2026: „die Simulation
    // möglichst genau dem Maschinenbild nach … Gegenspindel und Werkzeugträger
    // immer sichtbar … wenn die Gegenspindel übernommen hat, ansichtsgetreu
    // auf dem Werkzeugträger von Kanal 2“): alles an der Maschine, gezählt
    // ab der Drehebene am Ende von Kanal 1; in Kanal 2 steht das Teil in der
    // Gegenspindel um X gedreht (frame), die Ansicht bleibt dieselbe
    const swMaschine = maschineAn;
    // Masse von Kanal 2 je Maschine
    const M2 = sim.sw ? SW20_K2 : SB20_K2;
    const swEnde = swMaschine && kanal === 2 ? swLageBei(abS ? abS.bis : gesamt) : null;
    const swEbene = swMaschine ? (kanal === 1 ? swLage.zE : swEnde.zE) : null;
    let frame = null, swK2 = null;
    // Lage von Teil und Block Kanal 2 an der Maschine bei Schritt nn
    const k2Bei = (nn, ebene) => {
      let sAkt = null, pAkt = null, r2 = null;
      for (const x of sim.schritte) {
        if (x.kanal !== 2 || x.von >= nn || !x.punkte.length) continue;
        sAkt = x; pAkt = x.punkte[Math.min(nn, x.bis) - x.von - 1];
      }
      const spitzeW = ebene + M2.spitze;
      if (!pAkt) return { frame: { s: -1, z0: spitzeW - 25, xf: 0, yf: 0 }, k2: { aktiv: 0, y: 0 }, roll: M2.x2InY ? -Math.PI / 2 : null, sAkt, pAkt, weg: false };
      const yM = pAkt.mx != null ? pAkt.mx : pAkt.r, wM = pAkt.my != null ? pAkt.my : 0;
      if (pAkt.phi != null && Math.hypot(yM, wM) > 1e-6) r2 = Math.atan2(wM, yM) - pAkt.phi;
      // SB-20RG: X2 liegt waagrecht (Welt-Y), das Teil ist darum um −90°
      // gedreht und die Gegenspindel fährt in Y statt in X
      const x2y = !!M2.x2InY;
      if (x2y) r2 = (r2 != null ? r2 : 0) - Math.PI / 2;
      const ph = (pAkt.phi || 0) + (r2 != null ? r2 : roll), r = pAkt.r || 0;
      const pX = r * Math.cos(ph), pY = r * Math.sin(ph);
      const [lx, ly] = M2.platz[sAkt.platz] || M2.platz[2100];
      let fr = x2y ? { s: -1, z0: spitzeW + pAkt.z, xf: lx - pX, yf: ly + pY } : { s: -1, z0: spitzeW + pAkt.z, xf: lx - pX, yf: 0 };
      let k2 = { aktiv: sAkt.platz, y: x2y ? 0 : -pY - ly }, weg = false;
      // SB-20RG: Werkzeuge der Bohreinheit von Träger 1 zur Gegenspindel,
      // Träger 1 steht mit dem Werkzeug auf der Achse, die Gegenspindel kommt
      if (!sim.sw && (sAkt.art === "front" || sAkt.art === "quer")) {
        const l = platzLage(sAkt.platz);
        fr = { s: -1, z0: ebene + M2.gegenSpitze + pAkt.z, xf: -pX, yf: pY };
        k2 = { aktiv: 0, y: 0, t1: l ? { z: ebene, x: -l.x, y: -l.y, aktiv: sAkt.platz } : null };
      }
      // G28 U / G28 W am Ende: Gegenspindel fährt in X bzw. Z in die Grundstellung
      if (nn >= sAkt.bis) {
        const zl = (sAkt.zeilen || []).map(String);
        const u = zl.some((z) => /G28\s*U/i.test(z)), wz = zl.some((z) => /G28\s*W/i.test(z));
        if (u) { fr.xf = 0; if (x2y) fr.yf = 0; }
        if (wz) fr.z0 = ebene + M2.gegenHeim + W - sim.greif;
        if (u || wz) { k2 = { aktiv: 0, y: 0 }; weg = true; }
      }
      return { frame: fr, k2, roll: r2, sAkt, pAkt, weg };
    };
    let zweit = null;
    const zweitStrahlVon = (sb) => {
      const v = sb.vox && sb.vox.weg > 0 ? sb.vox : null;
      return v || (sb.k2 && sb.k2.kernA) ? { st: sb.k2, vox: v, kanal2: true, Wt: W, q: laeuft ? 0.45 : 1 } : null;
    };
    // Seit 1.689.0 (Patrick 21. November 2026: „Fertigteil soll heissen, die
    // Gegenspindel hat übernommen und steht zurück auf Grundposition. Wenn
    // Kanal 2 fertig ist, muss die Spindel das Teil auswerfen, es soll links
    // neben dem Werkzeugkopf von Kanal 2 deponiert werden“): nach Kanal 2
    // steht die Gegenspindel leer in der Grundstellung, das Teil liegt in
    // einer Schale neben dem Block Kanal 2 (grösseres X, im Bild links)
    const ablage = swMaschine && sim.hatK2 ? {
      frame: sim.sw ? { s: -1, z0: swEbene + SW20_K2.spitze + W, xf: SW20_K2.versatz.x + 275, yf: 30 }
        : { s: -1, z0: swEbene + M2.spitze + W + (M2.ablage.dz || 0), xf: M2.ablage.x, yf: M2.ablage.y },
      schale: true,
    } : null;
    const abgelegt = !!ablage && !zeit && n >= gesamt;
    const abgelegtB = !!ablage && !!zeit && nT >= zeit.L2;
    if (abgelegt) {
      frame = ablage.frame; swK2 = { aktiv: 0, y: 0 }; roll = 0;
      ueber.bahnen = []; ueber.koerper = []; ueber.werkzeuge = []; ueber.stangen = []; ueber.spitze = null;
    } else if (abgelegtB && standB && standB.k2) {
      swK2 = { aktiv: 0, y: 0 };
      zweit = { umriss: umrissVon(standB.k2, W), strahl: zweitStrahlVon(standB), frame: ablage.frame, roll: 0, spitze: null, bahn: [], abgelegt: true };
    } else if (swMaschine && kanal === 2) {
      const l = k2Bei(n, swEbene);
      frame = l.frame; swK2 = l.k2;
      if (l.roll != null) roll = l.roll;
      if (l.weg) { ueber.koerper = []; ueber.werkzeuge = []; ueber.stangen = []; ueber.spitze = null; }
    } else if (swMaschine && nB != null && standB && standB.k2) {
      // simultan: Kanal 2 bearbeitet in der Gegenspindel das vorige Teil
      const l = k2Bei(nB, swEbene);
      swK2 = l.k2;
      const bahn = l.sAkt && !l.weg && nB > l.sAkt.von ? l.sAkt.punkte.slice(0, Math.min(nB, l.sAkt.bis) - l.sAkt.von).filter((p) => p.vor) : [];
      zweit = { umriss: umrissVon(standB.k2, W), strahl: zweitStrahlVon(standB), frame: l.frame, roll: l.roll || 0, spitze: l.weg ? null : l.pAkt, bahn };
    }
    if (swMaschine) {
      // ganze Maschine im Bild: Mitte 45 mm vor der Drehebene
      const halb = (bereich0.zmax - bereich0.zmin) / 2, mitte = swEbene - (sim.sw ? 45 : 95);
      bereich = sim.sw ? { ...bereich0, zmin: mitte - halb, zmax: mitte + halb, px: schieb.x, py: schieb.y, diag: 470, mx: 60, my: -70 }
        : { ...bereich0, zmin: mitte - halb, zmax: mitte + halb, px: schieb.x, py: schieb.y, diag: 520, mx: -40, my: 110 };
    } else if (maschineAn) {
      const ebene = kanal === 1 ? (swLage ? swLage.zE : traeger ? traeger.z : vorne) : null;
      const dzM = ebene != null ? ebene - (bereich0.zmin + bereich0.zmax) / 2 + 10 : dz;
      const diag = Math.hypot(sim.zMax - vorne + 8, 2 * Math.max(A / 2 + 2, BUECHSE_R + 1));
      bereich = { ...bereich0, zmin: bereich0.zmin + dzM, zmax: bereich0.zmax + dzM, px: schieb.x, py: schieb.y, diag };
    }
    // Mit Bohrungen und Fräsungen aus C und Y: Strahlen statt Maler
    const vx = stand.vox && stand.vox.weg > 0 ? stand.vox : null;
    const strahl = (vx || (st && st.kernA)) && umriss ? { st, vox: vx, kanal2: kanal === 2, Wt: W, q: laeuft ? 0.45 : 1 } : null;
    const k = MASCHINE_SB20RG.kopf, gs = GEGEN_SB20RG.spindel;
    let maschine = null, gegen = null;
    if (swMaschine) {
      const lg = kanal === 1 ? swLage : { ...swEnde, aktiv: 0 };
      // seit 1.696.0: Träger des arbeitenden Drehwerkzeugs um den Halter
      // versetzt, sein Schaft fehlt dort (zeichnet der Halter)
      const hs = kanal === 1 && halterSchieb && lg.aktiv === halterSchieb.platz ? halterSchieb : null;
      const mitHs = (o, pf) => (hs && o && (lg.pfad || 1) === pf ? { ...o, z: o.z + hs.dz, y: o.y + hs.dy } : o);
      const benutzt = new Set(sim.schritte.map((x) => x.platz));
      const zb = swEbene + 2;
      // SB-20RG: Träger 1 aus Kanal 1, in Kanal 2 wo Kanal 1 ihn liess
      // oder mit dem Werkzeug zur Gegenspindel auf der Achse
      const sbT1 = kanal === 1 ? traeger : swK2 && swK2.t1 ? swK2.t1 : { ...lg.t1, aktiv: 0 };
      const ab1 = { vor: A / 2 + 1, b: Math.max(0.5, sim.roh.B || 2), dz: -(sim.abVersatz || 0) };
      maschine = {
        quader: sim.sw ? [...traegerSwQuader(mitHs(lg.t1, 1), 1, lg.aktiv, sim.swFront, benutzt, MASCHINE_SW20, sim.swSchlitz, swSpitzen.dz, sim.swFest, !!hs && lg.pfad !== 3),
          ...traegerSwQuader(mitHs(lg.t3, 3), 3, lg.aktiv, sim.swFront, benutzt, MASCHINE_SW20, false, swSpitzen.dz, sim.swFest, !!hs && lg.pfad === 3),
          ...swK2Quader({ z: swEbene + SW20_K2.spitze, y: swK2 ? swK2.y : 0 }, swK2 ? swK2.aktiv : 0, benutzt)]
          : [...(sbT1 ? traegerQuader(mitHs(sbT1, 1), sbT1.aktiv, undefined, sim.t34, ab1, kanal === 1 ? sbT1.spitze : null, new Set(sim.schritte.filter((x) => x.kanal === 1).map((x) => x.platz)), !!hs) : []),
            ...sbK2Quader({ z: swEbene + M2.spitze }, swK2 ? swK2.aktiv : 0, benutzt)],
        roll, grob: laeuft, kopf: { z: kopfZ, ri: A / 2, nase: k.nase, naseL: k.naseL, r: k.r, L: k.L },
      };
      // Flansch der Führungsbüchse (C1 im Bild)
      maschine.koepfe = [maschine.kopf, { z: zb + 6, ri: BUECHSE_R, nase: 32, naseL: 6, r: 32, L: 0, art: "buechse" }];
      // seit 1.686.0: Gehäuse der Büchse hinter dem Flansch und sechs
      // Schrauben im Flansch wie im Bild (C1)
      maschine.koepfe.push({ z: zb + 12, ri: BUECHSE_R, nase: 26, naseL: 24, r: 26, L: 0, art: "wand" });
      // Spindelstock mit dunklem Band (Motor) und Spannmutter vorne
      maschine.koepfe.push({ z: kopfZ + k.naseL + 34, ri: k.r, nase: k.r + 2.5, naseL: 26, r: k.r + 2.5, L: 0, art: "motor" });
      maschine.quader.push(walzeTeil("z", kopfZ, 0, 0, 7, k.nase + 2.5, "mutter", k.nase + 1.5));
      for (let i = 0; i < 6; i++) {
        const f = (i * Math.PI) / 3;
        maschine.quader.push(walzeTeil("z", zb + 6, 25 * Math.cos(f), 25 * Math.sin(f), -1.6, 2.6, "schraube"));
      }
      // Gegenspindel gelb: in Grundstellung, bei der Übergabe am Teil, in Kanal 2 mit dem Teil
      const gGelb = (z, x, y = 0) => {
        const gk = { z, x, y, ri: A / 2, nase: Math.max(gs.nase, A / 2 + 4), naseL: gs.naseL, r: gs.r - 8, L: 40, dir: -1, art: "gelb" };
        maschine.koepfe.push(gk);
        const hz = z - gs.naseL - 40;
        maschine.quader.push({ z0: hz - 50, z1: hz, x0: x - 38, x1: x + 38, y0: y - 38, y1: y + 38, art: "gelb" });
        // seit 1.686.0: Spannmutter vorne, Schrauben an der Stirn des
        // Gehäuses, darunter der Schlitten X2/Z2
        maschine.quader.push(walzeTeil("z", z, x, y, -7, gk.nase + 3, "mutter", gk.nase + 2));
        for (let i = 0; i < 6; i++) {
          const f = (i * Math.PI) / 3 + Math.PI / 6;
          maschine.quader.push(walzeTeil("z", z - gs.naseL, x + (gk.r - 6) * Math.cos(f), y + (gk.r - 6) * Math.sin(f), 1.6, 2.4, "schraube"));
        }
        if (M2.x2InY) {
          // SB-20RG: Schlitten X2/Z2 unter der Gegenspindel, X2 waagrecht
          maschine.quader.push({ z0: hz - 62, z1: hz + 6, x0: x - 56, x1: x - 38, y0: y - 50, y1: y + 50, art: "schlitten" });
          maschine.quader.push({ z0: hz - 70, z1: hz + 14, x0: x - 66, x1: x - 56, y0: y - 40, y1: y + 40, art: "schlitten2" });
        } else {
          maschine.quader.push({ z0: hz - 62, z1: hz + 6, x0: x - 50, x1: x + 50, y0: -56, y1: -38, art: "schlitten" });
          maschine.quader.push({ z0: hz - 70, z1: hz + 14, x0: x - 40, x1: x + 40, y0: -66, y1: -56, art: "schlitten2" });
        }
        return gk;
      };
      if (kanal === 1) {
        if (abS && n > abS.von) {
          const pa = abS.punkte[Math.min(n, abS.bis) - abS.von - 1];
          gegen = gGelb((pa && pa.g != null ? pa.g : sim.greif) - wegZ, 0);
        } else if (zweit && !zweit.abgelegt) gegen = gGelb(zweit.frame.z0 - (W - sim.greif), zweit.frame.xf, M2.x2InY ? zweit.frame.yf : 0);
        else gegen = gGelb(swEbene + M2.gegenHeim, 0);
      } else {
        // Büchse und Rest der Stange bleiben an der Hauptspindel
        maschine.koepfe.push({ z: zb, ri: A / 2, nase: BUECHSE_R, naseL: BUECHSE_L, r: BUECHSE_R, L: 0, art: "buechse" });
        const rest = W + (abS ? abS.breite : 0);
        if (kopfZ > rest) maschine.koepfe.push({ z: rest, ri: 0, nase: A / 2, naseL: kopfZ - rest, r: A / 2, L: 0, art: "roh" });
        gegen = abgelegt ? gGelb(swEbene + M2.gegenHeim, 0) : gGelb(frame.z0 - (W - sim.greif), frame.xf, M2.x2InY ? frame.yf : 0);
      }
      // Schale für das ausgeworfene Teil neben dem Block Kanal 2
      if (ablage && (abgelegt || abgelegtB)) {
        const f = ablage.frame, zA = f.z0 - W - 6, zB = f.z0 + 6, y0 = f.yf - A / 2 - 4;
        if (M2.x2InY) {
          // SB-20RG: Boden unten in −X, Ränder in Y
          const x0 = f.xf - A / 2 - 4;
          maschine.quader.push({ z0: zA, z1: zB, x0, x1: x0 + 3, y0: f.yf - A / 2 - 8, y1: f.yf + A / 2 + 8, art: "schlitten" });
          maschine.quader.push({ z0: zA, z1: zB, x0, x1: x0 + 10, y0: f.yf - A / 2 - 8, y1: f.yf - A / 2 - 5, art: "schlitten" });
          maschine.quader.push({ z0: zA, z1: zB, x0, x1: x0 + 10, y0: f.yf + A / 2 + 5, y1: f.yf + A / 2 + 8, art: "schlitten" });
        } else {
        maschine.quader.push({ z0: zA, z1: zB, x0: f.xf - A / 2 - 8, x1: f.xf + A / 2 + 8, y0, y1: y0 + 3, art: "schlitten" });
        maschine.quader.push({ z0: zA, z1: zB, x0: f.xf - A / 2 - 8, x1: f.xf - A / 2 - 5, y0, y1: y0 + 10, art: "schlitten" });
        maschine.quader.push({ z0: zA, z1: zB, x0: f.xf + A / 2 + 5, x1: f.xf + A / 2 + 8, y0, y1: y0 + 10, art: "schlitten" });
        }
      }
    } else if (kanal === 1 && maschineAn) {
      maschine = {
        quader: traeger ? (() => {
          const hs = halterSchieb && traeger.aktiv === halterSchieb.platz ? halterSchieb : null;
          const o = hs ? { ...traeger, z: traeger.z + hs.dz, y: traeger.y + hs.dy } : traeger;
          return traegerQuader(o, traeger.aktiv, undefined, sim.t34, { vor: A / 2 + 1, b: Math.max(0.5, sim.roh.B || 2), dz: -(sim.abVersatz || 0) }, traeger.spitze, new Set(sim.schritte.filter((x) => x.kanal === 1).map((x) => x.platz)), !!hs);
        })() : [], roll, grob: laeuft,
        kopf: { z: kopfZ, ri: A / 2, nase: k.nase, naseL: k.naseL, r: k.r, L: k.L },
      };
      maschine.koepfe = [maschine.kopf];
      // Übergabe: die Gegenspindel greift vorne über das Teil und zieht es weg
      if (abS && n > abS.von) {
        const pa = abS.punkte[Math.min(n, abS.bis) - abS.von - 1];
        gegen = { z: (pa && pa.g != null ? pa.g : sim.greif) - wegZ, ri: A / 2, nase: Math.max(gs.nase, A / 2 + 4), naseL: gs.naseL, r: gs.r, L: gs.L, dir: -1 };
        maschine.koepfe.push(gegen);
      }
    } else if (kanal === 2 && maschineAn && !sim.sw) {
      // Seit 1.583.0: Gegenspindel fährt mit dem Teil (steht im Teil fest),
      // die Werkzeuge stehen; die Einheit des Werkzeugs, das gerade arbeitet
      gegen = { z: W - sim.greif, ri: A / 2, nase: Math.max(gs.nase, A / 2 + 4), naseL: gs.naseL, r: gs.r, L: gs.L, dir: 1 };
      let sAkt = null, pAkt = null;
      for (const x of sim.schritte) {
        if (x.kanal !== 2 || x.von >= n || !x.punkte.length) continue;
        sAkt = x; pAkt = x.punkte[Math.min(n, x.bis) - x.von - 1];
      }
      const e = sAkt ? gegenEinheit(sAkt.art, sAkt.platz) : null;
      let quader = [];
      if (e && pAkt) {
        // Lage an der Maschine: angetriebene aus X / Y, sonst über der Achse in +X
        const yM = pAkt.mx != null ? pAkt.mx : pAkt.r, wM = pAkt.my != null ? pAkt.my : 0;
        const rM = Math.hypot(yM, wM);
        if (pAkt.phi != null && rM > 1e-6) roll = Math.atan2(wM, yM) - pAkt.phi;
        const ph = (pAkt.phi || 0) + roll, r = pAkt.r || 0;
        traeger = { z: pAkt.z, x: r * Math.cos(ph), y: r * Math.sin(ph), aktiv: sAkt.platz };
        quader = gegenQuader(traeger, e);
      }
      maschine = { quader, roll, grob: laeuft, koepfe: [gegen] };
    }
    // Seit 1.593.0 dreht auch ohne „Maschine“ immer das Teil in C, die
    // Werkzeuge stehen (Patrick 17. November 2026: „in der Simulation soll
    // auch ohne Maschine immer das Material drehen und nicht die Werkzeuge
    // um das Material, beim Querbohren ist das jetzt nicht so“)
    if (!maschineAn) {
      let pAkt = null;
      for (const x of sim.schritte) {
        if (x.kanal !== kanal || x.von >= n || !x.punkte.length) continue;
        pAkt = x.punkte[Math.min(n, x.bis) - x.von - 1];
      }
      if (pAkt && kanal === 1) roll = ((pAkt.c || 0) * Math.PI) / 180;
      else if (pAkt) {
        const yM = pAkt.mx != null ? pAkt.mx : pAkt.r, wM = pAkt.my != null ? pAkt.my : 0;
        if (pAkt.phi != null && Math.hypot(yM, wM) > 1e-6) roll = Math.atan2(wM, yM) - pAkt.phi;
      }
    }
    if (teilAnsicht) { ueber.bahnen = []; ueber.koerper = []; ueber.werkzeuge = []; ueber.stangen = []; ueber.spitze = null; ueber.buechse = null; }
    cv.__ablage = abgelegt ? "teil" : abgelegtB ? "zweit" : null; cv.__teilAnsicht = teilAnsicht;
    cv.__sw = swLage;
    cv.__traeger = traeger; cv.__kopf = maschine ? maschine.kopf || null : null; cv.__roll = roll; cv.__gegen = gegen; cv.__quader = maschine ? maschine.quader : null;
    cv.__stand = stand; cv.__sim = sim; cv.__strahl = !!strahl; cv.__werkzeuge = ueber.werkzeuge; cv.__koerper = ueber.koerper.length; cv.__step = !!(stepUrl && stepFertig(stepUrl)); cv.__buechse = ueber.buechse; cv.__weg = wegZ; cv.__ansichtZ = dz; // für den Prüfstand
    // Rohmaterial: Stirn vorne nur vorne (Kanal 1), vor der Übergabe
    const roh = { R: A / 2, vorne: kanal === 1 && !wegZ ? vorne : null };
    cv.__frame = frame; cv.__k2 = swK2; cv.__zweit = zweit ? { frame: zweit.frame, nB } : null;
    malen(g, breite, HOCH, { umriss, strahl, bereich, dreh: sim && sim.sw ? { ...dreh, c: SW_BLICK } : dreh, zoom, schnitt, ueber, roh, maschine, roll, frame, zweit, hinweis: umriss ? "" : "Kein Material" });
  }, [sim, stand, standB, n, nB, nT, zeit, teilAnsicht, kanal, akt, dreh, zoom, schnitt, breite, laeuft, maschineAn, kopfZ, dreiD, stepStand, schieb, swSpitzen]);

  useEffect(() => {
    if (!laeuft) return undefined;
    let id;
    // Im eigenen Fenster mit dessen Takt, sonst steht es still, wenn das
    // Hauptfenster verdeckt ist
    const win = (leinwand.current && leinwand.current.ownerDocument.defaultView) || window;
    const weiter = () => {
      setN((x) => {
        // simultan sind Einzeln und Einzelsatz aus, auch wenn sie noch
        // angehakt gespeichert sind (seit 1.686.0, Patrick: „warum kann ich
        // mit Simultan nur einzeln fahren?“)
        const bis = (einzeln || satz) && !zeit && ziel.current > 0 ? Math.min(endeT, ziel.current) : endeT;
        const neu = Math.min(bis, x + Math.max(1, Math.round(Number(tempo) * 6)));
        if (neu >= bis) setLaeuft(false);
        return neu;
      });
      id = win.requestAnimationFrame(weiter);
    };
    id = win.requestAnimationFrame(weiter);
    return () => win.cancelAnimationFrame(id);
  }, [laeuft, tempo, endeT, einzeln, satz, zeit]);

  // Drehen und Zoomen wie in der 3D-Ansicht der Kontur
  const runter = (e) => {
    finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    ziehen.current = { x: e.clientX, y: e.clientY, d: dreh, z: zoom, abst: null, s: schieb, schieben: e.shiftKey || e.button === 1 || e.button === 2 };
    if (finger.current.size === 2) {
      const [p, q] = [...finger.current.values()];
      ziehen.current.abst = Math.hypot(p.x - q.x, p.y - q.y);
      ziehen.current.mitte = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    }
  };
  const bewegen = (e) => {
    const z = ziehen.current; if (!z) return;
    finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (finger.current.size === 2 && z.abst) {
      const [p, q] = [...finger.current.values()];
      setZoom(Math.max(0.3, Math.min(20, z.z * Math.hypot(p.x - q.x, p.y - q.y) / z.abst)));
      // zwei Finger verschieben dabei die Ansicht
      setSchieb({ x: z.s.x + (p.x + q.x) / 2 - z.mitte.x, y: z.s.y + (p.y + q.y) / 2 - z.mitte.y });
      return;
    }
    if (z.schieben) { setSchieb({ x: z.s.x + e.clientX - z.x, y: z.s.y + e.clientY - z.y }); return; }
    setDreh({ a: z.d.a + (e.clientX - z.x) * 0.01, b: Math.max(-1.5, Math.min(1.5, z.d.b + (e.clientY - z.y) * 0.01)) });
  };
  const hoch = (e) => { finger.current.delete(e.pointerId); if (!finger.current.size) ziehen.current = null; };
  useEffect(() => {
    const cv = leinwand.current; if (!cv) return undefined;
    // Seit 1.689.1 (Patrick 21. November 2026: „auf Kanal 2 sieht man keine
    // Werkzeuge, die das Teil bearbeiten“): das Mausrad zoomt dorthin, wo
    // die Maus steht, nicht mehr in die Mitte der Maschine
    const rad = (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const z = zoomRef.current, nz = Math.max(0.3, Math.min(20, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))), k = nz / z;
      if (r.width > 0 && r.height > 0) {
        const Wl = breiteRef.current, cx = ((e.clientX - r.left) * Wl) / r.width, cy = ((e.clientY - r.top) * HOCH) / r.height;
        const s0 = schiebRef.current;
        const ns = { x: cx - (cx - (Wl / 2 + s0.x)) * k - Wl / 2, y: cy - (cy - (HOCH / 2 + 10 + s0.y)) * k - HOCH / 2 - 10 };
        schiebRef.current = ns; setSchieb(ns);
      }
      zoomRef.current = nz; setZoom(nz);
    };
    cv.addEventListener("wheel", rad, { passive: false });
    return () => cv.removeEventListener("wheel", rad);
  }, []);

  zoomRef.current = zoom; schiebRef.current = schieb; breiteRef.current = breite;
  const p = akt && n > akt.von ? akt.punkte[Math.min(n, akt.bis) - akt.von - 1] : null;
  const zeile = p && akt.zeilen ? String(akt.zeilen[p.nr] || "").trim() : "";
  // Im Einzelsatz auch die Zeile, die als Nächste kommt
  const naechst = (() => {
    if (!satz || zeit || n >= gesamt) return "";
    const s = schritte.find((x) => x.von <= n && n < x.bis);
    const q = s && s.punkte[n - s.von];
    return q && s.zeilen ? String(s.zeilen[q.nr] || "").trim() : "";
  })();
  return (
    <div className="dialog cam-sim" id="cam-sim">
      <div className="cam-sim__kopf">
        <b>3D-Simulation</b>
        <span className="cam-sim__hinweis klein">{sim && sim.sw ? "Kanal 1 und Kanal 3 vorne an der Hauptspindel (Kanal 3 an der Stelle von M133), danach Kanal 2 an der Rückseite." : "Kanal 1 vorne an der Hauptspindel, danach Kanal 2 an der Rückseite."} Ziehen dreht, Mausrad zoomt, Shift oder rechte Maustaste ziehen verschiebt.</span>
        <button className="knopf knopf--klein" title="Schliessen" onClick={zu}>✕</button>
      </div>
      <div className="cam-sim__haupt">
        <div className="cam-sim__bildteil" ref={rahmen}>
          <div className="cam-sim__titel" id="cam-sim-titel">
            {kanal === 2 ? "Kanal 2 · Rückseite in der Gegenspindel" : akt && akt.pfad === 3 ? "Kanal 3 · an der Hauptspindel" + (akt.zTraeger ? ", Träger 3 fährt in Z" : ", Material fährt (M133)") : "Kanal 1 · Vorderseite"}
            {teilAnsicht ? " · Fertigteil als 3D-Modell (ziehen dreht und schwenkt, Mausrad zoomt)" : n >= gesamt && gesamt ? (maschineAn && sim.hatK2 ? " · Fertigteil ausgeworfen, liegt neben Kanal 2" : " · Fertigteil") : akt && n > akt.von && n <= akt.bis ? " · " + akt.titel : zeit && nT < zeit.Tm && n >= zeit.L1 ? " · wartet auf Kanal 2" : ""}
            {aktB && <span id="cam-sim-titel2">{" · gleichzeitig Kanal 2: " + aktB.titel}</span>}
            {zeit && nB != null && !aktB && nT > 0 && <span id="cam-sim-titel2">{" · Kanal 2 wartet"}</span>}
          </div>
          <canvas ref={leinwand} className="cam-sim__bild" id="cam-sim-bild" data-cam-sim-n={n} style={{ height: HOCH + "px", width: "100%" }}
            onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch} onContextMenu={(e) => e.preventDefault()} />
          <div className="cam-sim__knoepfe">
            <button className="knopf knopf--klein knopf--primaer" id="cam-sim-start" onClick={() => {
              if (laeuft) { setLaeuft(false); return; }
              const ab = nT >= endeT ? 0 : nT;
              if (nT >= endeT) setNT(0);
              // Ende der Bearbeitung, in der es weitergeht
              if (zeit) ziel.current = Math.min(endeT, ...grenzen.filter((g) => g > ab));
              else {
                const s = schritte.find((x) => x.punkte.length && x.bis > ab);
                ziel.current = s ? (satz ? satzEnde(s, ab) : s.bis) : gesamt;
              }
              setLaeuft(true);
            }}>
              {laeuft ? "⏸ Pause" : "▶ Abspielen"}</button>
            <button className="knopf knopf--klein" id="cam-sim-anfang" onClick={() => { setLaeuft(false); setNT(0); }}>⏮ Rohteil</button>
            {/* Eine Bearbeitung zurück / vor (Wunsch Patrick 18. November 2026): Grenzen
                sind Rohteil und das Ende jeder Bearbeitung mit Weg */}
            <button className="knopf knopf--klein" id="cam-sim-zurueck" title="Eine Bearbeitung zurück" disabled={nT <= 0}
              onClick={() => { setLaeuft(false); setNT(Math.max(0, ...grenzen.filter((g) => g < nT))); }}>◀ Bearbeitung</button>
            <button className="knopf knopf--klein" id="cam-sim-vor" title="Eine Bearbeitung vor" disabled={nT >= endeT}
              onClick={() => { setLaeuft(false); setNT(Math.min(endeT, ...grenzen.filter((g) => g > nT))); }}>Bearbeitung ▶</button>
            <button className="knopf knopf--klein" id="cam-sim-ende" onClick={() => { setLaeuft(false); setNT(endeT); }}>Fertigteil ⏭</button>
            {gesamt > 0 && <button className={"knopf knopf--klein" + (teilAnsicht ? " knopf--primaer" : "")} id="cam-sim-teil" title="Nur das fertige Teil als 3D-Modell: ziehen dreht und schwenkt, Mausrad zoomt"
              onClick={() => { setLaeuft(false); if (teilAnsicht) { setTeilAnsicht(false); } else { setTeilAnsicht(true); setDreh(SCHRAEG); setZoom(1); setSchieb({ x: 0, y: 0 }); } }}>
              {teilAnsicht ? "Zurück zur Maschine" : "🔍 Fertigteil ansehen"}</button>}
            <label className="cam-feld">Tempo
              <select value={tempo} onChange={(e) => setTempo(e.target.value)}>
                {TEMPI.map(([x, t]) => <option key={x} value={x}>{t}</option>)}
              </select></label>
            <label className="schalter" title="Abspielen hält am Ende jeder Bearbeitung an, nochmals Abspielen fährt die nächste"><input type="checkbox" id="cam-sim-einzeln" checked={einzeln && !zeit} disabled={!!zeit}
              onChange={(e) => halten("einzeln", e.target.checked)} /><span>Einzeln</span></label>
            <label className="schalter" title="Einzelsatz: Abspielen fährt nur die nächste NC-Zeile und hält dann an"><input type="checkbox" id="cam-sim-satz" checked={satz && !zeit} disabled={!!zeit}
              onChange={(e) => halten("satz", e.target.checked)} /><span>Einzelsatz</span></label>
            <label className="schalter" title="Werkzeugträger, Spindelstock und Gegenspindel zeigen"><input type="checkbox" id="cam-sim-maschine" checked={maschineWahl}
              onChange={(e) => { setTeilAnsicht(false); setMaschineAn(e.target.checked); try { localStorage.setItem("hofer.camSim.maschine", e.target.checked ? "1" : "0"); } catch { /* egal */ } }} /><span>Maschine</span></label>
            {simMoeglich && <label className="schalter" title="Ohne Häkchen nacheinander: Kanal 1 und 3, dann Kanal 2. Mit Häkchen simultan wie an der Maschine: Kanal 2 bearbeitet das vorige Teil, während Kanal 1 und 3 am nächsten arbeiten"><input type="checkbox" id="cam-sim-simultan" checked={simultan}
              onChange={(e) => { setLaeuft(false); setNT(0); setSimultan(e.target.checked); try { localStorage.setItem("hofer.camSim.simultan", e.target.checked ? "1" : "0"); } catch { /* egal */ } }} /><span>Simultan</span></label>}
            <label className="schalter" title="Werkzeug als 3D-Körper statt flach in der Ebene zeigen"><input type="checkbox" id="cam-sim-wz3d" checked={dreiD}
              onChange={(e) => { setDreiD(e.target.checked); try { localStorage.setItem("hofer.camSim.wz3d", e.target.checked ? "1" : "0"); } catch { /* egal */ } }} /><span>3D-Werkzeug</span></label>
            {stepUrl && !stepFertig(stepUrl) && <span className="klein" data-cam-sim-step>{stepStand.url === stepUrl && stepStand.fehler ? "STEP nicht lesbar: " + stepStand.fehler : "STEP wird gelesen …"}</span>}
            <label className="schalter"><input type="checkbox" id="cam-sim-schnitt" checked={schnitt} onChange={(e) => setSchnitt(e.target.checked)} /><span>Aufgeschnitten</span></label>
            <button className="knopf knopf--klein" onClick={() => { setDreh(SCHRAEG); setZoom(1); setSchieb({ x: 0, y: 0 }); }}>Schräg</button>
            <button className="knopf knopf--klein" onClick={() => setDreh(SEITE)}>Von der Seite</button>
            <input type="range" min={0} max={endeT} value={nT} className="cam-sim__regler" id="cam-sim-regler"
              onChange={(e) => { setLaeuft(false); setNT(Number(e.target.value)); }} />
          </div>
          <div className="cam-sim__zeile" id="cam-sim-zeile">{zeile ? "Zeile: " + zeile : " "}
            {naechst && <span className="cam-sim__naechst" id="cam-sim-naechst"> · als Nächstes: {naechst}</span>}</div>
        </div>
        <div className="cam-sim__liste">
          <b className="klein">Bearbeitungen</b>
          {!schritte.length && <p className="klein">Noch keine Bearbeitungen.</p>}
          {schritte.map((s) => {
            const aktiv = (akt === s && n > s.von && n <= s.bis) || aktB === s;
            return (
              <button key={s.id} data-cam-sim-schritt={s.i} className={"cam-sim__schritt" + (aktiv ? " aktiv" : "") + (s.status === "fehlt" ? " cam-sim__schritt--fehlt" : s.status ? " cam-sim__schritt--grau" : "")}
                disabled={!s.punkte.length} title="Bis ans Ende dieser Bearbeitung springen"
                onClick={() => { setLaeuft(false); setNT(tVon(s)); }}>
                <span className="cam-sim__k">K{s.pfad || s.kanal}</span>
                <span className="cam-sim__name">{s.titel}</span>
                {s.status && <small>{STATUS[s.status]}</small>}
              </button>);
          })}
          <p className="klein cam-sim__legende" data-cam-sim-legende><span className="cam-sim__farbe" style={{ background: `rgb(${FARBE_ROH})` }} />Rohmaterial
            <span className="cam-sim__farbe" style={{ background: `rgb(${FARBE_BEARB})` }} />bearbeitet</p>
          <p className="klein cam-sim__info">Ohne Kollisionsprüfung. Gerechnet wird das Programm, wie es im Programmfenster steht. Abgetragen wird nur mit der Schneide, das 3D-Werkzeug ist zum Ansehen.</p>
        </div>
      </div>
    </div>
  );
}
