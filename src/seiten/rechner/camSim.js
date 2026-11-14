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
//  - Seit Schritt 3 (1.548.0) auch Querbohren und Fräsen mit C und Y
//    für die angetriebenen Werkzeuge, im Zellenraster (voxelAbtragen).
//  Kein Halter, keine Kollisionsprüfung. Gerechnet wird das erzeugte
//  Programm je Bearbeitung (ohne Handänderungen im Programmfenster).
// =================================================================

import { blockZeilen, blockZeilen2, k1Zeilen, markenPaare, markenVergeben, programme, zahl } from "./hofercam.js";
import { wirksamB, wirksamW } from "./camTyp.js";
import { fraeserUmriss, plattenUmriss, wzArt, wzVollstaendig } from "./camWerkzeug.js";

export const RASTER = 0.02; // mm je Zelle des Materials
const FEIN = 0.04, GROB = 0.5; // Abstand der Bahnpunkte bei Vorschub / Eilgang
const ANGETRIEBEN = new Set(["seite", "quer", "k2a"]); // Schritt 3: mit C und Y

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

// Bedingung wie WHILE[#102GE#0]: GE, GT, LE, LT, EQ, NE, AND, OR
function bedingung(t, v) {
  const s = String(t).replace(/#(\d+)/g, (a, n) => (n in v ? "(" + v[n] + ")" : "NaN")).replace(/\[/g, "(").replace(/\]/g, ")")
    .replace(/GE/g, ">=").replace(/GT/g, ">").replace(/LE/g, "<=").replace(/LT/g, "<").replace(/EQ/g, "==").replace(/NE/g, "!=")
    .replace(/AND/g, "&&").replace(/OR/g, "||");
  if (!/^[-+*/().\d\s<>=!&|Na]+$/.test(s)) return false;
  try { return !!Function("return (" + s + ")")(); } catch (e) { return false; }
}

const ACHSEN = ["X", "Z", "U", "W", "Y", "C", "H"];
const ZYKLUS_Z = [81, 82, 83, 84, 85, 86], ZYKLUS_X = [87, 88, 89];

// Arbeitszeile ohne Satznummer, Kommentar und „/“
const sauber = (roh) => String(roh || "").trim().replace(/^\//, "").replace(/\([^)]*\)?/g, "").replace(/^N\d+\s*/i, "").trim().toUpperCase();

// NC-Zeilen einer Bearbeitung → Bahn in Maschinenwerten {x (Ø), z, y,
// c (Grad), vor, nr}. mitG50: erst nach dem ersten G50 zählen die Wege
// (Kanal 2 stehend), das zweite G50 stellt zurück. start: Lage vor der
// ersten Zeile. Seit Schritt 3 auch Y, C, H (C schrittweise), G12.1
// (Polarinterpolation: C ist dann ein Weg in mm, gerechnet wie Y),
// Bohrzyklen modal bis G80 (G83–G86 in Z, G87–G89 in X) und Schleifen
// WHILE[…]DOn … ENDn, IF[…]GOTOn, GOTOn.
export function bahnLesen(zeilen, v, { mitG50 = false, start = null } = {}) {
  if (!(0 in v)) v[0] = 0; // #0 ist leer, in Vergleichen 0
  let x = start?.x ?? null, z = start?.z ?? null, y = start?.y ?? 0, c = start?.c ?? 0;
  let modal = 0, g50 = 0, an = !mitG50, zyk = null, zTiefe = null, polar = false, yVorher = 0;
  const punkte = [];
  const nach = (x1, z1, y1, c1, vor, nr) => {
    if (x == null) x = x1;
    if (z == null) z = z1;
    if (an) {
      const rr = Math.max(1, Math.abs(x), Math.abs(x1)) / 2;
      const lang = Math.hypot((x1 - x) / 2, z1 - z, y1 - y, (c1 - c) * Math.PI / 180 * rr);
      const n = Math.min(4000, Math.max(1, Math.ceil(lang / (vor ? FEIN : GROB))));
      if (!punkte.length) punkte.push({ x, z, y, c, vor: false, nr });
      for (let i = 1; i <= n; i++) {
        const f = i / n;
        punkte.push({ x: x + (x1 - x) * f, z: z + (z1 - z) * f, y: y + (y1 - y) * f, c: c + (c1 - c) * f, vor, nr });
      }
    }
    x = x1; z = z1; y = y1; c = c1;
  };
  // Bogen in der Ebene Z / Radius, mit G12.1 in der Ebene X / C
  const bogen = (ziel, a, cw, nr) => {
    const P = polar ? (q) => [q.x / 2, q.y] : (q) => [q.z, q.x / 2];
    const Q = polar ? (h, w) => ({ x: 2 * h, z: ziel.z, y: w, c: ziel.c }) : (h, w) => ({ x: 2 * w, z: h, y: ziel.y, c: ziel.c });
    const p0 = P({ x, z, y }), p1 = P(ziel);
    let m, r;
    const ih = polar ? a.I : a.K, iv = polar ? a.J : a.I;
    if (ih != null || iv != null) {
      m = [p0[0] + (ih || 0), p0[1] + (iv || 0)];
      r = Math.hypot(p0[0] - m[0], p0[1] - m[1]);
    } else {
      r = a.R;
      const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (!(r > 0) || d === 0 || d > 2 * r + 1e-6) { nach(ziel.x, ziel.z, ziel.y, ziel.c, true, nr); return; }
      const h = Math.sqrt(Math.max(0, r * r - d * d / 4));
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      const ux = -(p1[1] - p0[1]) / d, uy = (p1[0] - p0[0]) / d;
      m = cw ? [mx - ux * h, my - uy * h] : [mx + ux * h, my + uy * h];
    }
    let a0 = Math.atan2(p0[1] - m[1], p0[0] - m[0]), a1 = Math.atan2(p1[1] - m[1], p1[0] - m[0]);
    if (cw) { while (a1 > a0) a1 -= 2 * Math.PI; } else { while (a1 < a0) a1 += 2 * Math.PI; }
    const n = Math.min(4000, Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / FEIN)));
    if (an) {
      if (!punkte.length) punkte.push({ x, z, y, c, vor: false, nr });
      for (let i = 1; i <= n; i++) {
        const w = a0 + (a1 - a0) * i / n;
        punkte.push({ ...Q(m[0] + r * Math.cos(w), m[1] + r * Math.sin(w)), vor: true, nr });
      }
    }
    x = ziel.x; z = ziel.z; y = ziel.y; c = ziel.c;
  };

  // Schleifen und Sprünge vorbereiten
  const L = zeilen.map(sauber);
  const marke = {};
  zeilen.forEach((roh, i) => { const m = String(roh || "").trim().replace(/^\//, "").match(/^N(\d+)/i); if (m) marke[m[1]] = i; });
  const zuEnde = {}, zuAnfang = {}, offen = {};
  L.forEach((s, i) => {
    const w = s.match(/^WHILE\s*\[(.*)\]\s*DO\s*(\d+)/);
    if (w) { (offen[w[2]] = offen[w[2]] || []).push(i); return; }
    const e = s.match(/^END\s*(\d+)/);
    if (e && offen[e[1]]?.length) { const a = offen[e[1]].pop(); zuEnde[a] = i; zuAnfang[i] = a; }
  });

  let pc = 0, schritte = 0;
  while (pc < L.length && schritte++ < 60000) {
    const nr = pc, s = L[pc];
    pc++;
    if (!s || s === "%") continue;
    const wh = s.match(/^WHILE\s*\[(.*)\]\s*DO\s*(\d+)/);
    if (wh) { if (!bedingung(wh[1], v)) pc = (zuEnde[nr] ?? L.length - 1) + 1; continue; }
    if (/^END\s*\d+/.test(s)) { if (nr in zuAnfang) pc = zuAnfang[nr]; continue; }
    const wenn = s.match(/^IF\s*\[(.*)\]\s*GOTO\s*(\d+)/);
    if (wenn) { if (bedingung(wenn[1], v) && wenn[2] in marke) pc = marke[wenn[2]]; continue; }
    const geh = s.match(/^GOTO\s*(\d+)/);
    if (geh) { if (geh[1] in marke) pc = marke[geh[1]]; continue; }
    const zuw = s.match(/^#(\d+)\s*=\s*(.+)$/);
    if (zuw) { v[zuw[1]] = rechne(zuw[2], v); continue; }
    if (/G12\.1|G112/.test(s)) { if (!polar) { polar = true; yVorher = y; y = 0; } continue; }
    if (/G13\.1|G113/.test(s)) { if (polar) { polar = false; y = yVorher; } continue; }
    if (/G0?7\.1/.test(s)) continue; // Zylinderinterpolation: C bleibt in Grad
    if (/G50/.test(s) && /[XZ]/.test(s.replace(/G50/, ""))) {
      const a = adressen(s.replace(/G\d+/g, ""), v);
      if ("X" in a) x = a.X;
      if ("Z" in a) z = a.Z;
      if (mitG50) { g50++; an = g50 % 2 === 1; }
      continue;
    }
    if (/G28/.test(s)) { if (/[HC]/.test(s.replace(/G28/, "")) && !polar) c = 0; continue; }
    if (/G80/.test(s)) { zyk = null; continue; }
    if (/^T\d/.test(s) || /G4(?!\d)|G04|G23|G22/.test(s)) continue;
    const g = [...s.matchAll(/G(\d+)/g)].map((m) => Number(m[1]));
    for (const n of g) if (n <= 3) { modal = n; zyk = null; }
    const neuZyk = g.find((n) => ZYKLUS_Z.includes(n) || ZYKLUS_X.includes(n));
    if (neuZyk) { zyk = neuZyk; zTiefe = null; }
    const ohneWinkel = s.replace(/,[ACR].*$/, "");
    const a = adressen(ohneWinkel.replace(/G\d+(\.\d)?|M\d+|S\d+|T\d+/g, ""), v);
    if (g.includes(76)) {
      // Gewindezyklus: die erste Zeile (P…Q…R) hat keinen Weg; die zweite
      // fährt auf Kern-Ø X bis Z und wieder zurück
      if (!("X" in a) || !("Z" in a) || x == null || z == null) continue;
      const x0 = x, z0 = z;
      nach(a.X, z0, y, c, true, nr); nach(a.X, a.Z, y, c, true, nr); nach(x0, a.Z, y, c, false, nr); nach(x0, z0, y, c, false, nr);
      continue;
    }
    // Zeilen ohne Achse (G99, M1 …) fahren nicht
    if (!ACHSEN.some((k) => k in a)) continue;
    let y1 = y, c1 = c;
    if (polar) { if ("C" in a) y1 = a.C; if ("H" in a) y1 = y + a.H; }
    else { if ("Y" in a) y1 = a.Y; if ("C" in a) c1 = a.C; if ("H" in a) c1 = c + a.H; }
    if (zyk) {
      // Bohrzyklus: zuerst im Eilgang auf die Lage, dann bohren und zurück
      if (x == null) x = 0;
      if (z == null) z = 0;
      if (ZYKLUS_Z.includes(zyk)) {
        const x1 = "X" in a ? a.X : "U" in a ? x + a.U : x;
        if ("Z" in a) zTiefe = { abs: a.Z }; else if ("W" in a) zTiefe = { inc: a.W };
        nach(x1, z, y1, c1, false, nr);
        if (!zTiefe) continue;
        const z0 = z, ziel = zTiefe.abs ?? z0 + zTiefe.inc;
        nach(x1, ziel, y1, c1, true, nr); nach(x1, z0, y1, c1, false, nr);
      } else {
        const z1 = "Z" in a ? a.Z : "W" in a ? z + a.W : z;
        if ("X" in a) zTiefe = { abs: a.X }; else if ("U" in a) zTiefe = { inc: a.U };
        nach(x, z1, y1, c1, false, nr);
        if (!zTiefe) continue;
        const x0 = x, ziel = zTiefe.abs ?? x0 + zTiefe.inc;
        nach(ziel, z1, y1, c1, true, nr); nach(x0, z1, y1, c1, false, nr);
      }
      continue;
    }
    let x1 = "X" in a ? a.X : x, z1 = "Z" in a ? a.Z : z;
    if ("U" in a) x1 = (x ?? 0) + a.U;
    if ("W" in a) z1 = (z ?? 0) + a.W;
    // ,A Winkel bei nur einer Achse: die andere aus dem Winkel
    const winkel = s.match(/,A\s*([-+]?\d*\.?\d+)/);
    if (winkel && "X" in a && !("Z" in a) && x != null && z != null) {
      const w = Number(winkel[1]) * Math.PI / 180;
      if (Math.abs(Math.tan(w)) > 1e-6) z1 = z + Math.abs((x1 - x) / 2) / Math.tan(w);
    }
    if (x == null && z == null) { x = x1 ?? 0; z = z1 ?? 0; y = y1; c = c1; continue; }
    if (x1 == null) x1 = x ?? 0;
    if (z1 == null) z1 = z ?? 0;
    if (modal >= 2 && ("R" in a || "I" in a || "K" in a || "J" in a) && !/,R/.test(s)) bogen({ x: x1, z: z1, y: y1, c: c1 }, a, modal === 2, nr);
    else nach(x1, z1, y1, c1, modal !== 0, nr);
  }
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

// Angetriebene Werkzeuge (Schritt 3): Spitze und Achse im Teil, immer
// in den Massen von Kanal 1 (z an der Stirn, u nach +X, w nach +Y wie im
// Bild der Maschine). Vorne fährt das Material in Z, die Werkzeuge in X
// und Y; an der Gegenspindel fährt die Gegenspindel mit dem Teil in Z
// und X, die Werkzeuge stehen. Für das Abtragen zählt nur die Lage
// zueinander, darum rechnet die App alles im Teil.
// C laut Patrick: +C im Uhrzeigersinn von vorne auf die Spindel, C0 bei
// +X; C2 gleich, von vorne auf die Spannzange der Gegenspindel geschaut,
// also von der Rückseite des Teils her.
function imTeil(p, kanal, uMasch, wMasch, zTeil, W) {
  const c = (p.c || 0) * Math.PI / 180;
  const cs = Math.cos(c), sn = Math.sin(c);
  if (kanal === 1) {
    // Teil um +C gedreht → Werkzeug im Teil um −C
    return { t: [zTeil, uMasch * cs + wMasch * sn, -uMasch * sn + wMasch * cs], dreh: [cs, -sn] };
  }
  // Rückseite: von hinten gesehen dreht +C2 von vorne gesehen gegen den Uhrzeigersinn
  return { t: [W - zTeil, uMasch * cs - wMasch * sn, uMasch * sn + wMasch * cs], dreh: [cs, sn] };
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
  let cZ = -Infinity;
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
    let zeilen = kanal === 2 ? blockZeilen2(b, marken[b.id], w) : blockZeilen(b, w, marken[b.id]);
    if (ANGETRIEBEN.has(art)) {
      // Frontangetrieben an der Gegenspindel: X und Y stehen in Kanal 1,
      // dazu der Kanal-1-Code zwischen den Markenpaaren an ihrer Stelle
      if (art === "quer" && gegen) {
        const neu = [];
        const paare = new Map(markenPaare(b).map(([x, y]) => [x, y]));
        for (let k = 0; k < zeilen.length; k++) {
          neu.push(zeilen[k]);
          const m = String(zeilen[k] || "").replace(/^\//, "").trim().toUpperCase();
          const y = paare.get(m);
          if (y && String(zeilen[k + 1] || "").replace(/^\//, "").trim().toUpperCase() === y) neu.push(...k1Zeilen(b, m, y));
        }
        zeilen = neu;
      }
      const start = art === "quer" && gegen ? { x: num(b.X) || 0, y: num(b.Y) || 0 } : art === "quer" ? { x: 0 } : art === "k2a" ? { x: 0 } : null;
      const roh = bahnLesen(zeilen, { ...v }, { start });
      s.zeilen = zeilen;
      s.achse = art === "seite" ? "quer" : "laengs";
      // Lage in Z: Querwerkzeuge auf der programmierten Lage im Teil, die
      // anderen 0.5 mm vor „Anfahren Z“ (tiefer = weg von „Zurück Z“)
      let zTeil;
      if (art === "seite") zTeil = (p) => p.z;
      else {
        let an = num(b.anZ), weg = num(b.wegZ);
        if (art === "quer" && gegen) weg = 20; // dort fährt die Gegenspindel mit G0Z20. zurück
        if (art === "k2a") {
          // ohne Felder: erste Lage = Anfahren, tiefer = Richtung des ersten Vorschubs in Z
          const erst = roh.find((p) => p.z != null);
          an = erst ? erst.z : 0;
          const vor = roh.find((p, k) => k && p.vor && Math.abs(p.z - roh[k - 1].z) > 1e-6);
          weg = vor && vor.z < an ? an + 1 : an - 1;
        }
        an = an ?? 0;
        const sg = weg != null && weg > an ? -1 : 1;
        zTeil = (p) => sg * (p.z - an) - 0.5;
      }
      s.punkte = roh.map((p) => {
        // Kanal 2: das Teil fährt in X, das Werkzeug steht → Lage im Teil −X
        const uM = kanal === 2 && art === "k2a" ? -(p.x || 0) / 2 : (p.x || 0) / 2;
        const { t, dreh } = imTeil(p, kanal, uM, p.y || 0, zTeil(p), W);
        // Achse zum Schaft hin: quer nach aussen (+X der Maschine), längs zur Spindel hin
        const ax = s.achse === "quer" ? [0, dreh[0], dreh[1]] : [kanal === 1 ? -1 : 1, 0, 0];
        const anz = kanal === 2 ? [W - t[0], t[1], -t[2]] : t;
        return { z: anz[0], r: Math.hypot(anz[1], anz[2]), phi: Math.atan2(anz[2], anz[1]), t, ax, vor: p.vor, nr: p.nr };
      });
      s.modus = wa === "fraes" ? "c" : null;
      if (wa === "dreh") s.status = "nurBahnA";
      if (s.modus) for (const p of s.punkte) if (p.vor) cZ = Math.max(cZ, p.t[0] + (num(bRoh.wz?.d) || 6) / 2 + 0.5);
    } else {
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
    }
    if (!wzOk) s.status = "fehlt";
    if (!s.punkte.length && !s.status) s.status = "leer";
    schritte.push(s);
  });
  // Kanal 1 zuerst, dann Kanal 2, je in der Reihenfolge der Bearbeitungen
  const sortiert = [...schritte.filter((s) => s.kanal === 1), ...schritte.filter((s) => s.kanal === 2)];
  let ab = 0;
  sortiert.forEach((s) => { s.von = ab; ab += s.punkte.length; s.bis = ab; });
  const zMax = Math.min(300, Math.max(W + B + 3, ...sortiert.filter((s) => s.kanal === 1 && !s.achse).flatMap((s) => s.punkte.filter((p) => p.vor).map((p) => p.z + 1))));
  const hatC = sortiert.some((s) => s.modus === "c");
  return {
    roh: { A, W, B, vorne }, schritte: sortiert, gesamt: ab, zMax, hatK2: sortiert.some((s) => s.kanal === 2),
    vox: hatC ? { z0: vorne - 0.5, z1: Math.min(zMax, Math.max(W + B + 1, cZ)) } : null,
  };
}

// Werkzeughüllen einmal je Simulation
function huelleVon(s, cache) {
  if (!s.wz || !s.modus) return null;
  if (!cache.has(s.id)) {
    const h = s.modus === "dreh" ? plattenHuelle(s.wz) : bohrerHuelle(s.wz);
    if (h && h.rad) {
      // Länge der Spitze: bis der volle Radius erreicht ist
      let k = 0; while (k < h.rad.length - 1 && h.rad[k] < h.R - 1e-6) k++;
      h.spitze = k * RASTER;
    }
    cache.set(s.id, h);
  }
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
    if (p.r > 0.05) return; // feste Werkzeuge nur auf der Drehmitte
    const kStirn = Math.round((0 - z0) / RASTER);
    for (let k = Math.max(0, kStirn); k <= Math.min(n - 1, k0); k++) {
      const a = k0 - k;
      if (a >= h.rad.length) continue;
      const r = Math.min(h.rad[a], aussen[k]);
      if (r > innen[k]) innen[k] = r;
    }
  }
}

// Raster für Bohrungen und Fräsungen mit C und Y: je Zelle 1 = weg.
// Gerechnet im Teil wie Kanal 1; Zellen so gross, dass höchstens rund
// 3.5 Mio. Zellen nötig sind.
export const VOX_ZELLEN = 3.5e6;
function voxelNeu(sim) {
  const { A } = sim.roh;
  const R = A / 2 + 0.1, z0 = sim.vox.z0, L = Math.max(1, sim.vox.z1 - z0);
  const h = Math.max(0.04, Math.cbrt((4 * R * R * L) / VOX_ZELLEN));
  const nz = Math.ceil(L / h), nu = Math.ceil((2 * R) / h);
  return { h, z0, R, nz, nu, feld: new Uint8Array(nz * nu * nu), weg: 0 };
}

// Werkzeug an der Spitze t (Teil, Kanal 1), Achse ax zum Schaft, nimmt
// alle Zellen in seinem Umriss weg; aMax begrenzt die Länge ab der Spitze
function voxelAbtragen(vx, t, ax, hl, aMax) {
  const { h, z0, R, nz, nu, feld } = vx;
  const rad = hl.rad, Rw = hl.R;
  const L = Math.min(aMax, (rad.length - 1) * RASTER);
  const e = [t[0] + ax[0] * L, t[1] + ax[1] * L, t[2] + ax[2] * L];
  const lo = (i) => Math.min(t[i], e[i]) - Rw, hi = (i) => Math.max(t[i], e[i]) + Rw;
  const iz0 = Math.max(0, Math.floor((lo(0) - z0) / h)), iz1 = Math.min(nz - 1, Math.floor((hi(0) - z0) / h));
  const iu0 = Math.max(0, Math.floor((lo(1) + R) / h)), iu1 = Math.min(nu - 1, Math.floor((hi(1) + R) / h));
  const iw0 = Math.max(0, Math.floor((lo(2) + R) / h)), iw1 = Math.min(nu - 1, Math.floor((hi(2) + R) / h));
  const RR = (R - 0.1) * (R - 0.1) + 1e-9;
  for (let iz = iz0; iz <= iz1; iz++) {
    const rz = z0 + (iz + 0.5) * h - t[0];
    for (let iu = iu0; iu <= iu1; iu++) {
      const uc = -R + (iu + 0.5) * h, ru = uc - t[1];
      const basis = (iz * nu + iu) * nu;
      for (let iw = iw0; iw <= iw1; iw++) {
        const wc = -R + (iw + 0.5) * h;
        if (uc * uc + wc * wc > RR) continue; // ausserhalb des Rohteils
        const i = basis + iw;
        if (feld[i]) continue;
        const rw = wc - t[2];
        const a = rz * ax[0] + ru * ax[1] + rw * ax[2];
        if (a < -h * 0.5 || a > L) continue;
        const lz = rz - a * ax[0], lu = ru - a * ax[1], lw = rw - a * ax[2];
        const rr = rad[Math.max(0, Math.min(rad.length - 1, Math.round(a / RASTER)))];
        if (lz * lz + lu * lu + lw * lw <= rr * rr) { feld[i] = 1; vx.weg++; }
      }
    }
  }
}

function voxelSchritt(lauf, s, i, hl) {
  const p = s.punkte[i - s.von];
  if (!p.vor || !hl) { lauf.letzt = null; return; }
  const vx = lauf.vox, q = lauf.letzt;
  const letzter = i === s.bis - 1 || !s.punkte[i - s.von + 1]?.vor;
  let aMax = Infinity;
  if (q) {
    const m = [p.t[0] - q.t[0], p.t[1] - q.t[1], p.t[2] - q.t[2]];
    const lang = Math.hypot(...m);
    if (lang < vx.h * 0.5 && !letzter) return;
    const par = m[0] * p.ax[0] + m[1] * p.ax[1] + m[2] * p.ax[2];
    // Eintauchen längs der Achse: nur die Spitze schneidet Neues
    if (Math.sqrt(Math.max(0, lang * lang - par * par)) < vx.h * 0.25) aMax = hl.spitze + lang + 2 * vx.h;
  }
  voxelAbtragen(vx, p.t, p.ax, hl, aMax);
  lauf.letzt = p;
}

// Stand des Materials nach den ersten n Bahnpunkten. Rechnet weiter, wo
// es zuletzt aufgehört hat; nur rückwärts fängt es von vorne an.
export function materialStand(sim, n, cache = new Map()) {
  const { A, W, vorne } = sim.roh;
  let lauf = cache.get("__lauf");
  if (!lauf || lauf.n > n) {
    const z0 = vorne - 1, zellen = Math.ceil((sim.zMax - z0) / RASTER) + 1;
    const k1 = { z0, aussen: new Float32Array(zellen), innen: new Float32Array(zellen), ende: sim.zMax };
    for (let k = 0; k < zellen; k++) k1.aussen[k] = z0 + k * RASTER < vorne - 1e-9 ? 0 : A / 2;
    lauf = { n: 0, k1, k2: null, vox: sim.vox ? voxelNeu(sim) : null, letzt: null };
    cache.set("__lauf", lauf);
  }
  for (const s of sim.schritte) {
    if (s.von >= n) break;
    if (s.bis <= lauf.n) continue;
    if (s.kanal === 2 && !lauf.k2) lauf.k2 = rueckseite(lauf.k1, W);
    const st = s.kanal === 2 ? lauf.k2 : lauf.k1;
    const h = huelleVon(s, cache);
    const bis = Math.min(n, s.bis);
    if (s.von >= lauf.n) lauf.letzt = null;
    for (let i = Math.max(s.von, lauf.n); i < bis; i++) {
      if (s.modus === "c") voxelSchritt(lauf, s, i, h);
      else abtragen(st, s, s.punkte[i - s.von], h);
    }
  }
  lauf.n = Math.max(lauf.n, n);
  return { k1: lauf.k1, k2: lauf.k2, vox: lauf.vox, n };
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
