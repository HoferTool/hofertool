// =================================================================
//  HOFERCAM: 3D-Simulation Drehen und Bohren von vorne (seit 1.547.0)
//  Schritt 2 nach Patricks Plan vom 14. November 2026: je Bearbeitung
//  mit festgelegtem Werkzeug (b.wz, camWerkzeug.js) trägt die App das
//  Material ab, Kanal 1 vorne an der Hauptspindel, danach Kanal 2 an
//  der Rückseite des abgestochenen Teils in der Gegenspindel.
//
//  Regeln laut Patrick:
//  - Z im Teil: 0 an der Stirn, positiv ins Material (Richtung Führungs-
//    büchse); das Material fährt, nicht das Werkzeug.
//  - Bohr- und Fräswerkzeuge: das Teil steht in Z 0.5 mm vor „Anfahren Z“,
//    auch in Kanal 2 an der Gegenspindel.
//  - Stehende Werkzeuge in Kanal 2 rechnen nach G50 im Teil: Z0 an der
//    Rückseite, X negativ (Ø = |X|).
//  - Ohne Werkzeug wird die Bearbeitung nur als Bahn gezeigt (rot).
//  - Querbearbeitungen und Fräsen mit C folgen in Schritt 3.
//  Kein Halter, keine Kollisionsprüfung. Gerechnet wird das erzeugte
//  Programm je Bearbeitung (ohne Handänderungen im Programmfenster).
// =================================================================

import { blockZeilen, blockZeilen2, markenVergeben, programme, zahl } from "./hofercam.js";
import { wirksamB, wirksamW } from "./camTyp.js";
import { fraeserUmriss, plattenUmriss, wzArt, wzVollstaendig } from "./camWerkzeug.js";

export const RASTER = 0.02; // mm je Zelle des Materials
const FEIN = 0.04, GROB = 0.5; // Abstand der Bahnpunkte bei Vorschub / Eilgang
const ZU_SPAETER = new Set(["seite", "quer", "k2a"]); // Schritt 3

const num = (t) => { const z = zahl(t); return z == null ? null : Number(z); };

function rechne(ausdruck, v) {
  const t = String(ausdruck).replace(/#(\d+)/g, (a, n) => (n in v ? "(" + v[n] + ")" : "NaN")).replace(/\[/g, "(").replace(/\]/g, ")");
  if (!/^[-+*/().\d\sNa]+$/.test(t)) return NaN;
  try { return Number(Function("return (" + t + ")")()); } catch (e) { return NaN; }
}
function adressen(rest, v) {
  const a = {};
  const re = /([A-Z])\s*(\[[^\]]*\]|#\d+|[-+]?\d*\.?\d*)/gi;
  let m;
  while ((m = re.exec(rest))) {
    if (m[2] === "") continue;
    const w = m[2].startsWith("[") || m[2].startsWith("#") ? rechne(m[2], v) : Number(m[2]);
    const k = m[1].toUpperCase();
    if (!(k in a) && Number.isFinite(w)) a[k] = w;
  }
  return a;
}

// NC-Zeilen einer Bearbeitung → Bahn in Maschinenwerten {x (Ø), z, vor,
// nr}. mitG50: erst nach dem ersten G50 zählen die Wege (Kanal 2
// stehend), das zweite G50 stellt zurück.
export function bahnLesen(zeilen, v, { mitG50 = false } = {}) {
  let x = null, z = null, modal = 0, g50 = 0, an = !mitG50;
  const punkte = [];
  const nach = (x1, z1, vor, nr) => {
    if (x == null) x = x1;
    if (z == null) z = z1;
    if (an) {
      const lang = Math.hypot((x1 - x) / 2, z1 - z);
      const n = Math.max(1, Math.ceil(lang / (vor ? FEIN : GROB)));
      if (!punkte.length) punkte.push({ x, z, vor: false, nr });
      for (let i = 1; i <= n; i++) punkte.push({ x: x + (x1 - x) * i / n, z: z + (z1 - z) * i / n, vor, nr });
    }
    x = x1; z = z1;
  };
  const bogen = (x1, z1, a, cw, nr) => {
    // Ebene: waagrecht z, senkrecht Radius; G2 im Uhrzeigersinn
    const p0 = [z, x / 2], p1 = [z1, x1 / 2];
    let c, r;
    if ("I" in a || "K" in a) {
      c = [z + (a.K || 0), x / 2 + (a.I || 0)];
      r = Math.hypot(p0[0] - c[0], p0[1] - c[1]);
    } else {
      r = a.R;
      const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (!(r > 0) || d === 0 || d > 2 * r + 1e-6) { nach(x1, z1, true, nr); return; }
      const h = Math.sqrt(Math.max(0, r * r - d * d / 4));
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      const ux = -(p1[1] - p0[1]) / d, uy = (p1[0] - p0[0]) / d;
      c = cw ? [mx - ux * h, my - uy * h] : [mx + ux * h, my + uy * h];
    }
    let a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]), a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
    if (cw) { while (a1 > a0) a1 -= 2 * Math.PI; } else { while (a1 < a0) a1 += 2 * Math.PI; }
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / FEIN));
    if (an) for (let i = 1; i <= n; i++) {
      const w = a0 + (a1 - a0) * i / n;
      punkte.push({ x: 2 * (c[1] + r * Math.sin(w)), z: c[0] + r * Math.cos(w), vor: true, nr });
    }
    x = x1; z = z1;
  };
  zeilen.forEach((roh, nr) => {
    const s = String(roh || "").trim().replace(/^\//, "").replace(/\([^)]*\)?/g, "").replace(/^N\d+\s*/i, "").trim().toUpperCase();
    if (!s || s === "%") return;
    const zuw = s.match(/^#(\d+)\s*=\s*(.+)$/);
    if (zuw) { v[zuw[1]] = rechne(zuw[2], v); return; }
    if (/G50/.test(s) && /[XZ]/.test(s.replace(/G50/, ""))) {
      const a = adressen(s.replace(/G\d+/g, ""), v);
      if ("X" in a) x = a.X;
      if ("Z" in a) z = a.Z;
      if (mitG50) { g50++; an = g50 % 2 === 1; }
      return;
    }
    if (/^T\d/.test(s) || /G28|G4(?!\d)|G04|G80|G23|G22/.test(s)) return;
    const g = [...s.matchAll(/G(\d+)/g)].map((m) => Number(m[1]));
    for (const n of g) if (n <= 3) modal = n;
    const zyklus = g.find((n) => [81, 82, 83, 84, 85, 86, 89].includes(n));
    const ohneWinkel = s.replace(/,[ACR].*$/, "");
    const a = adressen(ohneWinkel.replace(/G\d+|M\d+|S\d+|T\d+/g, ""), v);
    if (g.includes(76)) {
      // Gewindezyklus: die erste Zeile (P…Q…R) hat keinen Weg; die zweite
      // fährt auf Kern-Ø X bis Z und wieder zurück
      if (!("X" in a) || !("Z" in a) || x == null || z == null) return;
      const x0 = x, z0 = z;
      nach(a.X, z0, true, nr); nach(a.X, a.Z, true, nr); nach(x0, a.Z, false, nr); nach(x0, z0, false, nr);
      return;
    }
    // Zeilen ohne Achse (G99, M1 …) fahren nicht
    if (!["X", "Z", "U", "W"].some((k) => k in a)) return;
    let x1 = "X" in a ? a.X : x, z1 = "Z" in a ? a.Z : z;
    if ("U" in a) x1 = (x ?? 0) + a.U;
    if ("W" in a && !zyklus) z1 = (z ?? 0) + a.W;
    if (zyklus) {
      // Bohrzyklus in Z: hin mit Vorschub, zurück im Eilgang
      const ziel = "Z" in a ? a.Z : (z ?? 0) + (a.W ?? 0);
      const start = z ?? 0;
      nach(x1 ?? x ?? 0, ziel, true, nr);
      nach(x1 ?? x ?? 0, start, false, nr);
      return;
    }
    if (x1 == null && z1 == null) return;
    // ,A Winkel bei nur einer Achse: die andere aus dem Winkel
    const winkel = s.match(/,A\s*([-+]?\d*\.?\d+)/);
    if (winkel && "X" in a && !("Z" in a) && x != null && z != null) {
      const w = Number(winkel[1]) * Math.PI / 180;
      if (Math.abs(Math.tan(w)) > 1e-6) z1 = z + Math.abs((x1 - x) / 2) / Math.tan(w);
    }
    if (x == null && z == null) { x = x1 ?? 0; z = z1 ?? 0; return; }
    if (x1 == null) x1 = x;
    if (z1 == null) z1 = z;
    if (modal >= 2 && ("R" in a || "I" in a || "K" in a) && !/,R/.test(s)) bogen(x1, z1, a, modal === 2, nr);
    else nach(x1, z1, modal !== 0, nr);
  });
  return punkte;
}

// Hülle der Drehplatte je Zelle in Z: tiefster und höchster Radius-
// versatz zur gedachten Spitze
export function plattenHuelle(wz) {
  const p = plattenUmriss(wz);
  if (!p.length) return null;
  const zs = p.map((q) => q.z);
  const j0 = Math.floor(Math.min(...zs) / RASTER), j1 = Math.ceil(Math.max(...zs) / RASTER);
  const lo = [], hi = [];
  for (let j = j0; j <= j1; j++) {
    const zz = j * RASTER;
    let a = Infinity, b = -Infinity;
    for (let i = 0; i < p.length; i++) {
      const u = p[i], w = p[(i + 1) % p.length];
      if ((u.z - zz) * (w.z - zz) > 0 || u.z === w.z && u.z !== zz) continue;
      if (u.z === w.z) { a = Math.min(a, u.x, w.x); b = Math.max(b, u.x, w.x); continue; }
      const x = u.x + (w.x - u.x) * (zz - u.z) / (w.z - u.z);
      a = Math.min(a, x); b = Math.max(b, x);
    }
    lo.push(a); hi.push(b);
  }
  return { j0, lo, hi, umriss: p };
}

// Radius des Bohr- / Fräswerkzeugs je Abstand von der Spitze (Zellen)
export function bohrerHuelle(wz) {
  const u = fraeserUmriss(wz);
  const p = u.schneide;
  const R = Math.max(...p.map((q) => q.z));
  const L = Math.max(...p.map((q) => q.x));
  const rad = [];
  const n = Math.ceil(L / RASTER);
  for (let k = 0; k <= n; k++) {
    const xx = k * RASTER;
    let b = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length];
      if ((a.x - xx) * (c.x - xx) > 0 || a.x === c.x) continue;
      b = Math.max(b, Math.abs(a.z + (c.z - a.z) * (xx - a.x) / (c.x - a.x)));
    }
    rad.push(Math.min(R, b));
  }
  return { rad, R, umriss: u };
}

// Alles für die Ansicht: Rohteil und je Bearbeitung die Bahn im Teil
export function simAufbauen(wRoh) {
  const w = wirksamW(wRoh);
  const A = num(w.A) || 10, W = num(w.W) || 10, B = num(w.B) || 0;
  const v = { 531: A, 530: W, 529: num(w.S) || 0, 524: num(w.X) || 0, 525: num(w.Z) || 0, 522: num(w.F) || 0, 528: B, 510: A + 1 };
  const prog = programme(w);
  const marken = prog.marken || markenVergeben(w.bloecke || []);
  const vorne = -Math.abs(num(w.schlicht) || 0);
  const schritte = [];
  (w.bloecke || []).forEach((bRoh, i) => {
    const b = wirksamB(bRoh);
    const platz = "T" + (b.platz || "");
    const titel = platz + (b.bez ? " " + b.bez : "");
    const art = b.art || "dreh";
    const gegen = (art === "front" || art === "quer") && b.spindel === "gegen";
    const kanal = art === "k2" || art === "k2a" || gegen ? 2 : 1;
    const wzOk = wzVollstaendig(bRoh);
    const wa = wzOk ? wzArt(bRoh) : null;
    const s = { i, id: b.id, kanal, titel, art, gegen, wz: wzOk ? bRoh.wz : null, wzArt: wa, punkte: [], modus: null, status: "" };
    if (ZU_SPAETER.has(art) || (art === "quer" && gegen)) { s.status = "spaeter"; schritte.push(s); return; }
    const zeilen = kanal === 2 ? blockZeilen2(b, marken[b.id], w) : blockZeilen(b, w, marken[b.id]);
    const roh = bahnLesen(zeilen, { ...v }, { mitG50: art === "k2" });
    s.zeilen = zeilen;
    // Bohr- und Fräswerkzeuge an Front: Teil 0.5 mm vor „Anfahren Z“,
    // tiefer ins Teil = weg von „Zurück Z“
    if (art === "front") {
      const an = num(b.anZ) ?? 0, weg = num(b.wegZ);
      const sg = weg != null && weg > an ? -1 : 1;
      s.punkte = roh.map((p) => ({ z: sg * (p.z - an) - 0.5, r: Math.abs(p.x || 0) / 2, vor: p.vor, nr: p.nr }));
      s.modus = wa === "fraes" ? "bohr" : null;
      if (wa === "dreh") s.status = "nurBahn";
    } else if (art === "k2") {
      s.punkte = roh.map((p) => ({ z: p.z, r: Math.abs(p.x) / 2, vor: p.vor, nr: p.nr }));
      s.modus = wa === "fraes" ? "bohr" : wa === "dreh" ? "dreh" : null;
    } else {
      s.punkte = roh.map((p) => ({ z: p.z, r: p.x / 2, vor: p.vor, nr: p.nr }));
      s.modus = wa === "dreh" ? "dreh" : null;
    }
    if (!wzOk) s.status = "fehlt";
    if (!s.punkte.length && !s.status) s.status = "leer";
    schritte.push(s);
  });
  // Kanal 1 zuerst, dann Kanal 2, je in der Reihenfolge der Bearbeitungen
  const sortiert = [...schritte.filter((s) => s.kanal === 1), ...schritte.filter((s) => s.kanal === 2)];
  let ab = 0;
  sortiert.forEach((s) => { s.von = ab; ab += s.punkte.length; s.bis = ab; });
  const zMax = Math.min(300, Math.max(W + B + 3, ...sortiert.filter((s) => s.kanal === 1).flatMap((s) => s.punkte.filter((p) => p.vor).map((p) => p.z + 1))));
  return { roh: { A, W, B, vorne }, schritte: sortiert, gesamt: ab, zMax, hatK2: sortiert.some((s) => s.kanal === 2) };
}

// Werkzeughüllen einmal je Simulation
function huelleVon(s, cache) {
  if (!s.wz || !s.modus) return null;
  if (!cache.has(s.id)) cache.set(s.id, s.modus === "dreh" ? plattenHuelle(s.wz) : bohrerHuelle(s.wz));
  return cache.get(s.id);
}

// Ein Bahnpunkt nimmt Material weg
function abtragen(st, s, p, h) {
  if (!h || !p.vor) return;
  const { aussen, innen, z0 } = st;
  const n = aussen.length;
  const k0 = Math.round((p.z - z0) / RASTER);
  if (s.modus === "dreh") {
    for (let j = 0; j < h.lo.length; j++) {
      const k = k0 + h.j0 + j;
      if (k < 0 || k >= n || h.lo[j] === Infinity) continue;
      const lo = p.r + h.lo[j], hi = p.r + h.hi[j];
      if (hi >= aussen[k] - 1e-6) { if (lo < aussen[k]) aussen[k] = Math.max(lo, innen[k], 0); }
      else if (lo <= innen[k] + 1e-6) { if (hi > innen[k]) innen[k] = hi; }
    }
  } else if (s.modus === "bohr") {
    if (p.r > 0.05) return; // nur auf der Drehmitte, ausserhalb der Mitte folgt mit C
    const kStirn = Math.round((0 - z0) / RASTER);
    for (let k = Math.max(0, kStirn); k <= Math.min(n - 1, k0); k++) {
      const a = k0 - k;
      if (a >= h.rad.length) continue;
      const r = Math.min(h.rad[a], aussen[k]);
      if (r > innen[k]) innen[k] = r;
    }
  }
}

// Stand des Materials nach den ersten n Bahnpunkten
export function materialStand(sim, n, cache = new Map()) {
  const { A, W, vorne } = sim.roh;
  const z0 = vorne - 1, zellen = Math.ceil((sim.zMax - z0) / RASTER) + 1;
  const k1 = { z0, aussen: new Float32Array(zellen), innen: new Float32Array(zellen), ende: sim.zMax };
  for (let k = 0; k < zellen; k++) k1.aussen[k] = z0 + k * RASTER < vorne - 1e-9 ? 0 : A / 2;
  let k2 = null;
  for (const s of sim.schritte) {
    if (s.von >= n) break;
    if (s.kanal === 2 && !k2) k2 = rueckseite(k1, W);
    const st = s.kanal === 2 ? k2 : k1;
    const h = huelleVon(s, cache);
    const bis = Math.min(n, s.bis);
    for (let i = s.von; i < bis; i++) abtragen(st, s, s.punkte[i - s.von], h);
  }
  return { k1, k2 };
}

// Das abgestochene Teil (0 … W) von hinten gesehen: z2 = W − z
function rueckseite(k1, W) {
  const z0 = -1, zellen = Math.ceil((W + 1) / RASTER) + 1;
  const st = { z0, aussen: new Float32Array(zellen), innen: new Float32Array(zellen), ende: W };
  for (let k = 0; k < zellen; k++) {
    const z2 = z0 + k * RASTER;
    if (z2 < 0 || z2 > W) continue;
    const kk = Math.round((W - z2 - k1.z0) / RASTER);
    if (kk < 0 || kk >= k1.aussen.length) continue;
    st.aussen[k] = k1.aussen[kk]; st.innen[k] = k1.innen[kk];
  }
  return st;
}

// Linie vereinfachen (Douglas-Peucker), Toleranz in mm
function vereinfachen(l, tol) {
  if (l.length < 3) return l;
  const behalten = new Uint8Array(l.length); behalten[0] = behalten[l.length - 1] = 1;
  const stapel = [[0, l.length - 1]];
  while (stapel.length) {
    const [a, b] = stapel.pop();
    const p = l[a], q = l[b];
    const dz = q.z - p.z, dr = q.r - p.r, len = Math.hypot(dz, dr) || 1e-12;
    let max = -1, wo = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dz * (l[i].r - p.r) - dr * (l[i].z - p.z)) / len;
      if (d > max) { max = d; wo = i; }
    }
    if (max > tol) { behalten[wo] = 1; stapel.push([a, wo], [wo, b]); }
  }
  return l.filter((_, i) => behalten[i]);
}

// Umriss des Materials im Längsschnitt: Aussen- und Innenlinie (z
// aufsteigend), vereinfacht; null, wenn nichts da ist
export function umrissVon(st, zBis, tol = 0.004) {
  const { aussen, innen, z0 } = st;
  const n = Math.min(aussen.length, Math.round((zBis - z0) / RASTER) + 1);
  let a = 0; while (a < n && aussen[a] <= innen[a] + 1e-6) a++;
  let e = n - 1; while (e > a && aussen[e] <= innen[e] + 1e-6) e--;
  if (e <= a) return null;
  const linie = (feld) => {
    const l = [];
    for (let k = a; k <= e; k++) {
      const r = Math.max(0, feld[k]), z = z0 + k * RASTER;
      const v = l[l.length - 1];
      // Sprung: senkrechte Kante genau an der Zelle
      if (v && Math.abs(v.r - r) > RASTER * 1.5) l.push({ z, r: v.r });
      l.push({ z, r });
    }
    return vereinfachen(l, tol);
  };
  return { aussen: linie(aussen), innen: linie(innen) };
}
