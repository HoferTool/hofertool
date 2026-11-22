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

import { plattenForm, plattenUmriss, fraeserUmriss } from "./camWerkzeug.js";
import { SPITZEN } from "./kontur.js";
import { halterFuer } from "./camHalter.js";
import { schaftAusBohrung } from "./camArtikel.js";

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

// Übliche Dicke der Platte (ISO), drehKoerper nimmt höchstens diese
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
  // Seit 1.686.1 (Patrick 21. November 2026: „verändere auch die Dicke
  // der Drehplatten im Verhältnis zu der Grösse, bei Innenbearbeitungen
  // z.B. Ø5 ist sie viel zu dick“): die Dicke folgt der Grösse des Umrisses
  // (bei Innenplatten schon verkleinert, innenTiefe), etwa 0.4 × der
  // kleineren Seite, höchstens die übliche Dicke, mindestens 0.5 mm
  const us = umriss.map((q) => q.x), zs0 = umriss.map((q) => q.z);
  const bx = Math.max(...us) - Math.min(...us), bz = Math.max(...zs0) - Math.min(...zs0);
  // Einstechplatten sind schmal, dort zählt die Länge
  const klein = f && f.art === "einstech" ? 0.6 * Math.max(bx, bz) : Math.min(bx, bz);
  // Seit 1.695.0: Dicke aus der Bibliothek reale Werkzeuge (ISO-Code oder
  // von Hand), wenn eingetragen
  const dw = Number(String((wz && wz.dicke) ?? "").replace(",", "."));
  // (bei Innenplatten, die die Simulation verkleinert hat, im selben Mass)
  let massstab = 1;
  if (dw > 0) {
    const voll = plattenUmriss(wz);
    const ausd = (q) => Math.max(Math.max(...q.map((x) => x.x)) - Math.min(...q.map((x) => x.x)), Math.max(...q.map((x) => x.z)) - Math.min(...q.map((x) => x.z)));
    if (voll.length) massstab = Math.min(1, ausd(umriss) / Math.max(0.001, ausd(voll)));
  }
  const d = dw > 0 && dw < 30 ? Math.max(0.3, dw * massstab) : Math.max(0.5, Math.min(plattenDicke(f), 0.4 * klein));
  const pts = umriss.map((q) => ({ z: p.z + q.z, u: p.r + q.x }));
  prisma(pts, -d, 0, "schneide", aus);
  // Seit 1.696.0 der passende Halter 12 × 12 (camHalter.js) statt eines
  // blossen Schafts; opt.innen = {rb, tiefe, dir} beim Ausdrehen,
  // opt.maschine: Schaft nur kurz, den Rest hält der Träger
  const opt = mitHalter === true ? {} : mitHalter;
  if (opt) halterKoerper(wz, p, umriss, d, opt, aus);
  return aus;
}

// Lage des Schafts zur Spitze (z quer zur Schaftachse, w Höhe), für den
// Träger der Maschine; null ohne radialen Halter
export function halterLage(wz, umriss) {
  const s = SPITZEN.find((x) => x.id === (wz && wz.sl)) || { z: 1, r: -1 };
  if (!umriss || umriss.length < 3 || !(s.r < 0)) return null;
  const h = halterFuer(wz, false);
  if (!h || h.typ === "bohrstange") return null;
  const [z0, z1] = schaftZ(h, s, umriss);
  return { z0, z1, w0: -h.h, w1: 0, halter: h };
}

// Schaft quer zur Achse: Spitze f1 vor der Rückseite des Schafts; bei
// neutralen Haltern (f1 = b/2) oder gerader Lage mittig zur Spitze
function schaftZ(h, s, umriss) {
  const b = h.b || 12, f1 = h.f1 ?? 16;
  if (h.typ === "klinge" && !s.z) {
    const zs = umriss.map((q) => q.z), zc = (Math.min(...zs) + Math.max(...zs)) / 2;
    return [zc - b / 2, zc + b / 2];
  }
  if (!s.z || Math.abs(f1 - b / 2) < 0.01) return [-b / 2, b / 2];
  // Spitze auf der +Z-Seite der Platte: Schaft liegt auf −Z
  return s.z > 0 ? [-f1, -f1 + b] : [f1 - b, f1];
}

// Stange entlang Z mit Querschnitt pts [{u, w}]
function stangeZ(quer, z0, z1, art, aus) {
  const n = quer.length;
  aus.push({ pts: quer.map((q) => [z0, q.u, q.w]), art });
  aus.push({ pts: quer.map((q) => [z1, q.u, q.w]), art });
  for (let i = 0; i < n; i++) {
    const a = quer[i], b = quer[(i + 1) % n];
    aus.push({ pts: [[z0, a.u, a.w], [z0, b.u, b.w], [z1, b.u, b.w], [z1, a.u, a.w]], art });
  }
}

// Kreis um (u, w) mit Radius r, oben bei wMax abgeflacht (Spanfläche)
function kreisFlach(u, w, r, wMax, N = 18) {
  const p = [];
  for (let j = 0; j < N; j++) {
    const f = (2 * Math.PI * j) / N;
    p.push({ u: u + r * Math.cos(f), w: Math.min(wMax, w + r * Math.sin(f)) });
  }
  return p;
}

// Konvexe Hülle (z, u)
function huelle(pts) {
  const p = [...pts].sort((a, b) => a.z - b.z || a.u - b.u);
  if (p.length < 3) return p;
  const kreuz = (o, a, b) => (a.z - o.z) * (b.u - o.u) - (a.u - o.u) * (b.z - o.z);
  const unten = [], oben = [];
  for (const q of p) { while (unten.length >= 2 && kreuz(unten[unten.length - 2], unten[unten.length - 1], q) <= 0) unten.pop(); unten.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (oben.length >= 2 && kreuz(oben[oben.length - 2], oben[oben.length - 1], q) <= 0) oben.pop(); oben.push(q); }
  return unten.slice(0, -1).concat(oben.slice(0, -1));
}

function halterKoerper(wz, p, umriss, d, opt, aus) {
  const s = SPITZEN.find((x) => x.id === (wz && wz.sl)) || { z: 1, r: -1 };
  const innen = s.r > 0;
  const h = halterFuer(wz, innen);
  if (!h) return;
  const xs = umriss.map((q) => q.x), zs = umriss.map((q) => q.z);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), zmin = Math.min(...zs), zmax = Math.max(...zs);
  const zc = (zmin + zmax) / 2;
  if (h.typ === "bohrstange") {
    // Ausdrehen: Hals so dick, dass er im kleinsten Loch Platz hat, die
    // Spitze steht aussen am Hals, die Spanfläche auf Drehmitte
    const inn = opt.innen || {};
    const rb = Math.max(0.6, inn.rb || p.r || 2);
    // Masse aus dem Katalog des Herstellers (camArtikel.js: dmin kleinste
    // Bohrung, versatz Spitze bis Mitte Schaft, hals Länge des Halses),
    // sonst geschätzt aus dem kleinsten Radius der Bearbeitung
    const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return n > 0 ? n : null; };
    const dmin = num(wz.dmin), ver = num(wz.versatz), hals = num(wz.hals);
    const Rn = dmin ? Math.max(0.15, 0.4 * dmin) : Math.max(0.3, 0.42 * rb);
    const e = ver || 0.5 * rb;
    const dir = inn.dir || -1;
    const uc = p.r - e, wc = -0.3 * Rn;
    const Ls = hals || Math.max(3, (inn.tiefe || 5) + 3);
    const z0 = p.z + zc, z1 = z0 + dir * Ls;
    // Hals rund wie bei Ifanger: nur vorne bei der Platte die Spanfläche
    // angeschliffen, dahinter ganz rund (Patrick 22. November 2026)
    const Lf = Math.min(Ls, Math.max(1.5, 2.5 * Rn));
    const zf = z0 + dir * Lf;
    stangeZ(kreisFlach(uc, wc, Rn, 0, 32), Math.min(z0, zf), Math.max(z0, zf), "werkzeug", aus);
    if (Ls > Lf) stangeZ(kreisFlach(uc, wc, Rn, Infinity, 32), Math.min(zf, z1), Math.max(zf, z1), "werkzeug", aus);
    const Rs = (num(wz.schaft) || (dmin && schaftAusBohrung(dmin, hals)) || h.schaft || 6) / 2;
    const z2 = z1 + dir * 2, z3 = z2 + dir * (opt.maschine ? 10 : 36);
    if (Rs > Rn) stangeZ(kreisFlach(uc, wc, (Rn + Rs) / 2, Infinity, 32), Math.min(z1, z2), Math.max(z1, z2), "werkzeug", aus);
    stangeZ(kreisFlach(uc, wc, Math.max(Rn, Rs), wc + Rs - 0.6, 32), Math.min(z2, z3), Math.max(z2, z3), "halter", aus);
    // Bohrstangen sind immer rund und freigeschliffen (Ifanger, Horn,
    // Utilis …), kein eckiger Block hinten (Patrick 22. November 2026)
    return;
  }
  // Frontwerkzeuge (Bohreinheit, Kanal 2) haben keinen radialen Halter
  if (innen || opt.radial === false) return;
  const hh = h.h || 12;
  const [sz0, sz1] = schaftZ(h, s, umriss);
  const uP = p.r, zP = p.z;
  const lang = opt.maschine ? 14 : 45;
  if (h.typ === "klinge") {
    // Einstechen: Klinge etwas schmaler als die Platte, untere Backe stützt,
    // obere Backe klemmt den hinteren Teil der Platte
    const hw = Math.max(0.4, (zmax - zmin) / 2 - 0.15);
    const L = xmax;
    const uKe = uP + L + 3, uS = uP + L + 8;
    quader(zP + zc - hw, zP + zc + hw, uP + Math.max(0.6, 0.28 * L), uKe, -hh, -d, "halter", aus);
    quader(zP + zc - hw, zP + zc + hw, uP + 0.55 * L, uKe, 0, 2.2, "halter", aus);
    const ueber = huelle([
      { z: zP + zc - hw, u: uKe }, { z: zP + zc + hw, u: uKe },
      { z: zP + sz0, u: uS }, { z: zP + sz1, u: uS },
    ]);
    prisma(ueber, -hh, 0, "halter", aus);
    quader(zP + sz0, zP + sz1, uS, uS + lang, -hh, 0, "halter", aus);
    return;
  }
  // Klemmhalter mit Schraube: Sitz unter der Platte, Anlage an den
  // hinteren Kanten, Schaft dahinter
  const cz = umriss.reduce((a, q) => a + q.z, 0) / umriss.length, cx = umriss.reduce((a, q) => a + q.x, 0) / umriss.length;
  const sitz = umriss.map((q) => ({ z: zP + cz + (q.z - cz) * 0.9, u: uP + cx + (q.x - cx) * 0.9 }));
  const uS = uP + xmax + 1.5;
  const kopf = huelle([...sitz, { z: zP + sz0, u: uS }, { z: zP + sz1, u: uS }, { z: zP + sz0, u: uS + 3 }, { z: zP + sz1, u: uS + 3 }]);
  prisma(kopf, -hh, -d, "halter", aus);
  // Anlagewände an den Kanten weit weg von der Spitze
  const dist = umriss.map((q) => Math.hypot(q.z, q.x));
  const dmax = Math.max(...dist);
  const n = umriss.length;
  for (let i = 0; i < n; i++) {
    const a = umriss[i], b = umriss[(i + 1) % n];
    if (Math.hypot(a.z, a.x) < 0.55 * dmax || Math.hypot(b.z, b.x) < 0.55 * dmax) continue;
    // nach aussen (weg von der Mitte der Platte)
    let nz = b.x - a.x, nx = -(b.z - a.z);
    const l = Math.hypot(nz, nx) || 1; nz /= l; nx /= l;
    const mz = (a.z + b.z) / 2 - cz, mx = (a.x + b.x) / 2 - cx;
    if (nz * mz + nx * mx < 0) { nz = -nz; nx = -nx; }
    const t = 1.2;
    prisma([
      { z: zP + a.z, u: uP + a.x }, { z: zP + b.z, u: uP + b.x },
      { z: zP + b.z + nz * t, u: uP + b.x + nx * t }, { z: zP + a.z + nz * t, u: uP + a.x + nx * t },
    ], -d, -0.15 * d, "halter", aus);
  }
  // Schaft
  quader(zP + sz0, zP + sz1, uS, uS + lang, -hh, 0, "halter", aus);
  // Schraube in der Senkung der Platte (nicht bei Rundplatten mit Pratze)
  const kl = Math.min(xmax - xmin, zmax - zmin);
  const rS = Math.max(0.5, Math.min(2.2, 0.16 * kl));
  const kreis = Array.from({ length: 14 }, (_, j) => { const f = (2 * Math.PI * j) / 14; return { z: zP + cz + rS * Math.cos(f), u: uP + cx + rS * Math.sin(f) }; });
  prisma(kreis, -0.05, 0.12, "schraube", aus);
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
