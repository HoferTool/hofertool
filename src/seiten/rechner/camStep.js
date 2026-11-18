// =================================================================
//  HOFERCAM: STEP-Datei je Werkzeug für die 3D-Simulation (seit 1.622.0)
//  Entscheid Patrick 18. November 2026 „Beides“: gerechnet aus den
//  Massen als Vorgabe, eine hinterlegte STEP-Datei ersetzt den Körper.
//  Gelesen mit OpenCascade im Worker (stepLesen.js), vereinfacht auf
//  rund 2'500 Dreiecke, damit der Maler beim Abspielen mitkommt.
//  Abgetragen wird weiter nur mit der Schneide aus dem Fenster Werkzeug.
//
//  Lage: Drehwerkzeug STEP-X = Z, STEP-Y = X, STEP-Z = Y der Maschine,
//  die Spitze sucht die App selbst aus der Schneidenlage (äusserster
//  Punkt in Richtung der Lage, Spanfläche auf Drehmitte). Bohrer und
//  Fräser: STEP-Z ist die Achse, die Spitze ist das untere Ende, mittig.
//  Passt es nicht, drehen die Knöpfe um 90° und der Versatz schiebt.
// =================================================================

import { stepLaden } from "../hofer2dto3d/stepLesen.js";
import { SPITZEN } from "./kontur.js";
import { alt } from "../../bruecke.jsx";

const ZIEL = 2500;

// Ablegen in der Ablage zeichnungen unter hofercam/werkzeuge/
export async function stepHochladen(datei) {
  const name = (datei.name || "werkzeug.step").replace(/[^\w.\- ]+/g, "_");
  const pfad = `hofercam/werkzeuge/${Date.now().toString(36)}-${name}`;
  const ablage = alt.db.storage.from("zeichnungen");
  const r = await ablage.upload(pfad, datei, { upsert: true, contentType: "application/step" });
  if (r && r.error) throw r.error;
  const url = ablage.getPublicUrl(pfad).data.publicUrl;
  return { url, pfad, name: datei.name || name };
}

// Alle Dreiecke aus dem Ergebnis von occt, je mit Farbe der Fläche
function dreieckeAus(r) {
  const tri = [];
  for (const m of r.meshes || []) {
    const p = m.attributes.position.array;
    const idx = m.index ? m.index.array : null;
    const n = idx ? idx.length : p.length / 3;
    const farbe = m.color ? m.color.map((c) => Math.round(c * 255)) : null;
    for (let i = 0; i + 2 < n; i += 3) {
      const ecke = (k) => { const j = (idx ? idx[i + k] : i + k) * 3; return [p[j], p[j + 1], p[j + 2]]; };
      tri.push({ p: [ecke(0), ecke(1), ecke(2)], farbe });
    }
  }
  return tri;
}

// Vereinfachen: Punkte in ein Raster fassen, Dreiecke mit zwei gleichen
// Ecken fallen weg; Raster gröber, bis es unter ZIEL ist
function vereinfachen(tri) {
  if (tri.length <= ZIEL) return tri;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const t of tri) for (const q of t.p) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  let zelle = diag / 160, aus = tri;
  for (let runde = 0; runde < 12; runde++) {
    const summe = new Map();
    const key = (q) => Math.floor((q[0] - lo[0]) / zelle) + "," + Math.floor((q[1] - lo[1]) / zelle) + "," + Math.floor((q[2] - lo[2]) / zelle);
    for (const t of tri) for (const q of t.p) {
      const k = key(q); const s = summe.get(k);
      if (s) { s[0] += q[0]; s[1] += q[1]; s[2] += q[2]; s[3]++; } else summe.set(k, [q[0], q[1], q[2], 1]);
    }
    const gesehen = new Set();
    aus = [];
    for (const t of tri) {
      const ks = t.p.map(key);
      if (ks[0] === ks[1] || ks[1] === ks[2] || ks[0] === ks[2]) continue;
      const s = [...ks].sort().join("|");
      if (gesehen.has(s)) continue;
      gesehen.add(s);
      aus.push({ p: ks.map((k) => { const v = summe.get(k); return [v[0] / v[3], v[1] / v[3], v[2] / v[3]]; }), farbe: t.farbe });
    }
    if (aus.length <= ZIEL) break;
    zelle *= 1.35;
  }
  return aus;
}

// Gelesen und vereinfacht je Adresse
const netze = new Map();
export function stepNetz(url) {
  if (!netze.has(url)) {
    const p = stepLaden(url).then((r) => vereinfachen(dreieckeAus(r)));
    p.catch(() => netze.delete(url));
    netze.set(url, p);
  }
  return netze.get(url);
}
// schon fertig gelesen? (für das Zeichnen ohne Warten)
const fertig = new Map();
export function stepFertig(url) { return fertig.get(url) || null; }
export function stepHolen(url) {
  return stepNetz(url).then((t) => { fertig.set(url, t); return t; });
}

// 90° um eine Achse, so oft wie gezählt
function drehe(q, ax, mal) {
  let [x, y, z] = q;
  for (let i = 0; i < ((mal % 4) + 4) % 4; i++) {
    if (ax === 0) [y, z] = [-z, y];
    else if (ax === 1) [x, z] = [z, -x];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

function ausrichten(q, st) {
  let v = q;
  if (st.spiegel) v = [-v[0], v[1], v[2]];
  const d = st.dreh || [0, 0, 0];
  v = drehe(v, 0, d[0] || 0); v = drehe(v, 1, d[1] || 0); v = drehe(v, 2, d[2] || 0);
  return v;
}

const zahl = (x) => { const n = parseFloat(String(x ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

// Dreiecke im Werkzeug, Spitze im Ursprung.
// rund false: [z, u, w] wie die Bahn (u = +X, w = +Y), sonst [t1, t2, a]
// mit a längs der Achse ab der Spitze zum Schaft.
export function stepLokal(tri, wz, rund) {
  const st = (wz && wz.step) || {};
  const pts = tri.map((t) => ({ p: t.p.map((q) => ausrichten(q, st)), farbe: t.farbe }));
  const alle = pts.flatMap((t) => t.p);
  if (!alle.length) return [];
  const lo = [0, 1, 2].map((k) => Math.min(...alle.map((q) => q[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...alle.map((q) => q[k])));
  let o;
  if (rund) {
    o = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]];
  } else {
    // Spitze aus der Schneidenlage: in jede Richtung, in die die Lage zeigt,
    // der äusserste Punkt; quer dazu die Mitte der Punkte ganz vorne
    const s = SPITZEN.find((x) => x.id === wz.sl) || { z: 1, r: -1 };
    const ext = (k, sg) => (sg > 0 ? hi[k] : lo[k]);
    const nahe = (k, sg) => alle.filter((q) => Math.abs(q[k] - ext(k, sg)) < 0.3);
    const mitte = (l, k) => l.reduce((m, q) => m + q[k], 0) / (l.length || 1);
    let oz = s.z ? ext(0, s.z) : null, ou = s.r ? ext(1, s.r) : null;
    if (oz === null) oz = ou === null ? (lo[0] + hi[0]) / 2 : mitte(nahe(1, s.r), 0);
    if (ou === null) ou = s.z ? mitte(nahe(0, s.z), 1) : (lo[1] + hi[1]) / 2;
    // Spanfläche: Höhe der Punkte an der Spitze, die am weitesten oben liegen
    const vorne = alle.filter((q) => Math.hypot(q[0] - oz, q[1] - ou) < 1.5);
    const ow = vorne.length ? Math.max(...vorne.map((q) => q[2])) : hi[2];
    o = [oz, ou, ow];
  }
  const v = rund ? [zahl(st.dx), zahl(st.dy), zahl(st.dz)] : [zahl(st.dz), zahl(st.dx), zahl(st.dy)];
  return pts.map((t) => ({ p: t.p.map((q) => [q[0] - o[0] + v[0], q[1] - o[1] + v[1], q[2] - o[2] + v[2]]), farbe: t.farbe }));
}

// Farbe: Farbe aus der STEP-Datei, sonst nahe der Spitze die Schneide
function art(t, nah) {
  if (t.farbe && !(t.farbe[0] === t.farbe[1] && t.farbe[1] === t.farbe[2] && t.farbe[0] > 150)) return t.farbe;
  return nah ? "schneide" : "werkzeug";
}

// Drehwerkzeug an der Spitze p {z, r}
export function stepDrehKoerper(lokal, p) {
  return lokal.map((t) => ({
    pts: t.p.map((q) => [p.z + q[0], p.r + q[1], q[2]]),
    art: art(t, t.p.every((q) => Math.hypot(q[0], q[1]) < 4)),
  }));
}

// Bohrer / Fräser: Spitze im Teil, Achse ax von der Spitze zum Schaft
export function stepRundKoerper(lokal, spitze, ax, schneidL) {
  const l = Math.hypot(...ax) || 1;
  const A = ax.map((q) => q / l);
  const h = Math.abs(A[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let e1 = [A[1] * h[2] - A[2] * h[1], A[2] * h[0] - A[0] * h[2], A[0] * h[1] - A[1] * h[0]];
  const l1 = Math.hypot(...e1); e1 = e1.map((q) => q / l1);
  const e2 = [A[1] * e1[2] - A[2] * e1[1], A[2] * e1[0] - A[0] * e1[2], A[0] * e1[1] - A[1] * e1[0]];
  const L = schneidL > 0 ? schneidL : 6;
  return lokal.map((t) => ({
    pts: t.p.map((q) => [0, 1, 2].map((i) => spitze[i] + A[i] * q[2] + e1[i] * q[0] + e2[i] * q[1])),
    art: art(t, t.p.every((q) => q[2] <= L)),
  }));
}
