// =================================================================
//  HOFERCAM: Werkzeuge als 3D-Körper für die Simulation (seit 1.621.0)
//  Wunsch Patrick 18. November 2026: „kannst du für die Simulation 3D-
//  Werkzeuge verwenden?“, Entscheid „Beides“: gerechnet aus den Massen
//  im Fenster Werkzeug, eine hinterlegte STEP-Datei ersetzt es (folgt).
//  Die Platte liegt von der Spanfläche (w = 0, Drehmitte) nach −Y, der
//  Schaft ohne Maschine dahinter nach +Y.
//  Abgetragen wird weiter nur mit der Schneide (plattenHuelle,
//  bohrerHuelle in camSim.js), die Körper sind nur zum Ansehen.
//  Alle Punkte im Teil wie die Bahn: [z, u, w], u nach +X, w nach +Y.
// =================================================================

import { plattenForm, fraeserUmriss } from "./camWerkzeug.js";
import { SPITZEN } from "./kontur.js";

// Flächen eines Prismas: Umriss in der Ebene (z, u), von w0 bis w1
function prisma(pts, w0, w1, art, aus) {
  const n = pts.length;
  if (n < 3) return;
  aus.push({ pts: pts.map((p) => [p.z, p.u, w1]), art });
  aus.push({ pts: pts.map((p) => [p.z, p.u, w0]), art });
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    aus.push({ pts: [[a.z, a.u, w0], [b.z, b.u, w0], [b.z, b.u, w1], [a.z, a.u, w1]], art });
  }
}

function quader(z0, z1, u0, u1, w0, w1, art, aus) {
  prisma([{ z: z0, u: u0 }, { z: z1, u: u0 }, { z: z1, u: u1 }, { z: z0, u: u1 }], w0, w1, art, aus);
}

// Dicke der Platte: kleine Platten 3.18, sonst 4.76 (ISO 06 / 11 / 16)
function plattenDicke(f) {
  if (!f) return 3;
  if (f.art === "einstech") return 3;
  if (f.art === "gewinde") return 3.5;
  return 3.97;
}

// Drehplatte an der Spitze p {z, r}, Umriss aus plattenHuelle (relativ
// zur Spitze, {z, x}); mitHalter zeichnet den Schaft 12 × 12 darunter,
// nur aussen (Lage nach unten), innen wäre es eine Bohrstange
export function drehKoerper(wz, p, umriss, mitHalter) {
  const aus = [];
  if (!umriss || umriss.length < 3) return aus;
  const f = plattenForm(wz && wz.form);
  const d = plattenDicke(f);
  const pts = umriss.map((q) => ({ z: p.z + q.z, u: p.r + q.x }));
  prisma(pts, -d, 0, "schneide", aus);
  const s = SPITZEN.find((x) => x.id === (wz && wz.sl)) || { z: 1, r: -1 };
  if (mitHalter && s.r < 0) {
    const xs = umriss.map((q) => q.x), zs = umriss.map((q) => q.z);
    const xmax = Math.max(...xs), zmin = Math.min(...zs), zmax = Math.max(...zs);
    // Schaft 12 breit in Z, bündig mit der Seite der Spitze
    const z0 = s.z > 0 ? zmax - 12 : s.z < 0 ? zmin : (zmin + zmax) / 2 - 6;
    // hinter der Platte (Seite +Y), damit die Platte vorne sichtbar bleibt
    quader(p.z + z0, p.z + z0 + 12, p.r + xmax * 0.35, p.r + xmax + 40, 0, 12, "werkzeug", aus);
  }
  return aus;
}

// Abstecher: Platte Breite B, Klinge nach aussen
export function abstechKoerper(p, B, hoehe) {
  const aus = [];
  quader(p.z - B, p.z, p.r, p.r + 3, -3, 0, "schneide", aus);
  quader(p.z - B * 0.85, p.z - B * 0.15, p.r + 3, p.r + hoehe, -3, 0, "werkzeug", aus);
  return aus;
}

// Drehkörper um eine Achse aus einem Umriss {z: quer, x: längs ab der
// Spitze}: je Höhe der grösste Abstand zur Achse
function drehProfil(poly) {
  const xs = poly.map((q) => q.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const stellen = new Set(xs.map((x) => +x.toFixed(4)));
  const n = Math.max(2, Math.ceil((x1 - x0) / Math.max(0.2, (x1 - x0) / 24)));
  for (let k = 0; k <= n; k++) stellen.add(+(x0 + ((x1 - x0) * k) / n).toFixed(4));
  const liste = [...stellen].sort((a, b) => a - b);
  const prof = [];
  for (const x of liste) {
    let r = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i + 1) % poly.length];
      if ((a.x - x) * (c.x - x) > 0) continue;
      if (Math.abs(c.x - a.x) < 1e-9) { r = Math.max(r, Math.abs(a.z), Math.abs(c.z)); continue; }
      r = Math.max(r, Math.abs(a.z + ((c.z - a.z) * (x - a.x)) / (c.x - a.x)));
    }
    prof.push({ x, r });
  }
  return prof;
}

function drehen(prof, spitze, ax, art, aus, N = 20) {
  const l = Math.hypot(...ax) || 1;
  const A = ax.map((q) => q / l);
  // zwei Richtungen quer zur Achse
  const h = Math.abs(A[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let e1 = [A[1] * h[2] - A[2] * h[1], A[2] * h[0] - A[0] * h[2], A[0] * h[1] - A[1] * h[0]];
  const l1 = Math.hypot(...e1); e1 = e1.map((q) => q / l1);
  const e2 = [A[1] * e1[2] - A[2] * e1[1], A[2] * e1[0] - A[0] * e1[2], A[0] * e1[1] - A[1] * e1[0]];
  const pkt = (x, r, f) => [0, 1, 2].map((i) => spitze[i] + A[i] * x + r * (Math.cos(f) * e1[i] + Math.sin(f) * e2[i]));
  for (let k = 0; k + 1 < prof.length; k++) {
    const a = prof[k], b = prof[k + 1];
    if (a.r < 1e-6 && b.r < 1e-6) continue;
    for (let j = 0; j < N; j++) {
      const f0 = (2 * Math.PI * j) / N, f1 = (2 * Math.PI * (j + 1)) / N;
      aus.push({ pts: [pkt(a.x, a.r, f0), pkt(b.x, b.r, f0), pkt(b.x, b.r, f1), pkt(a.x, a.r, f1)], art });
    }
  }
  // Deckel oben (unten läuft die Spitze meist zu)
  for (const e of [prof[0], prof[prof.length - 1]]) {
    if (e.r < 1e-6) continue;
    aus.push({ pts: Array.from({ length: N }, (_, j) => pkt(e.x, e.r, (2 * Math.PI * j) / N)), art });
  }
}

// Bohrer und Fräser: Spitze, Achse von der Spitze zum Schaft
export function fraeserKoerper(wz, spitze, ax) {
  const aus = [];
  const u = fraeserUmriss(wz || {});
  drehen(drehProfil(u.schneide), spitze, ax, "schneide", aus);
  drehen(drehProfil(u.schaft), spitze, ax, "werkzeug", aus);
  return aus;
}
