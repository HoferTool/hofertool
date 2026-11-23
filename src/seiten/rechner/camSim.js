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

import { blockZeilen, blockZeilen2, blockZeilen3, kanalZahl, swFrontVon, swFrontArt, bereichMitHand, bereichLage, k1Zeilen, markenPaare, markenVergeben, unterBlock, blockZeilenK, programme, programmeMitHand, zahl, abVersatz, t34Von } from "./hofercam.js";
import { wirksamB, wirksamW } from "./camTyp.js";
import { fraeserUmriss, plattenForm, plattenGross, plattenUmriss, wzArt, wzVollstaendig } from "./camWerkzeug.js";
import { SPITZEN } from "./kontur.js";

export const RASTER = 0.02; // mm je Zelle des Materials
const FEIN = 0.04, GROB = 0.5; // Abstand der Bahnpunkte bei Vorschub / Eilgang
const ANGETRIEBEN = new Set(["seite", "quer", "k2a"]); // Schritt 3: mit C und Y

const num = (t) => { const z = zahl(t); return z == null ? null : Number(z); };

// Seit 1.681.0: eine nicht gesetzte Variable #1–#999 ist wie an der
// Fanuc leer und zählt in Rechnungen als 0 (10844-0049: G1X[12.40+#606]
// mit einer Korrektur, die nur an der Maschine steht; vorher fiel die
// ganze Zeile weg und der Zapfen blieb zu dick)
function rechne(ausdruck, v) {
  const t = String(ausdruck).replace(/#(\d+)/g, (a, n) => (n in v ? "(" + v[n] + ")" : Number(n) < 1000 ? "0" : "NaN")).replace(/\[/g, "(").replace(/\]/g, ")");
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
  let modal = 0, g50 = 0, an = !mitG50, zyk = null, zTiefe = null, polar = false, yVorher = 0, g76 = null;
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

  // Ecke mit ,C (Fase) oder ,R (Radius), seit 1.596.0 aus HOFERCONTUR:
  // die Zeile fährt erst, wenn die nächste Gerade bekannt ist. Passt es
  // nicht (Bogen danach, Y oder C ändert, zu kurz), bleibt die Ecke spitz.
  let ecke = null;
  const eckeFertig = (nx, nz, linear) => {
    if (!ecke) return;
    const e = ecke; ecke = null;
    const spitz = () => nach(e.x, e.z, e.y, e.c, true, e.nr);
    if (!linear || nx == null || nz == null || x == null || z == null || polar) return spitz();
    const S = [z, x / 2], V = [e.z, e.x / 2], N = [nz, nx / 2];
    const d1 = [V[0] - S[0], V[1] - S[1]], d2 = [N[0] - V[0], N[1] - V[1]];
    const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
    if (l1 < 1e-9 || l2 < 1e-9) return spitz();
    const u1 = [d1[0] / l1, d1[1] / l1], u2 = [d2[0] / l2, d2[1] / l2];
    const kr = u1[0] * u2[1] - u1[1] * u2[0], th = Math.atan2(Math.abs(kr), u1[0] * u2[0] + u1[1] * u2[1]);
    if (th < 1e-6) return spitz();
    const t = e.art === "C" ? e.wert : e.wert * Math.tan(th / 2);
    if (!(t > 0) || t > l1 + 1e-6 || t > l2 + 1e-6) return spitz();
    const P1 = [V[0] - u1[0] * t, V[1] - u1[1] * t], P2 = [V[0] + u2[0] * t, V[1] + u2[1] * t];
    nach(2 * P1[1], P1[0], e.y, e.c, true, e.nr);
    if (e.art === "C") nach(2 * P2[1], P2[0], e.y, e.c, true, e.nr);
    else bogen({ x: 2 * P2[1], z: P2[0], y: e.y, c: e.c }, { R: e.wert }, kr < 0, e.nr);
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
    // SW-20 (1.669.0): M50 X[13] / M51 (Nachführen der Achsen) und
    // Z3= / W3= (Z3 aus Kanal 3) fahren hier nicht, simAufbauen rechnet M50
    if (/^M5[01](?!\d)/.test(s) || /[XYZUW]3\s*=/.test(s)) continue;
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
      eckeFertig(null, null, false);
      // Gewindezyklus G76 in zwei Zeilen wie an der Fanuc. Seit 1.637.0
      // (Patrick 18. November 2026: „es wird wie ein Durchmesser
      // weggedreht“, „ich will auch die Zustellungen in der Tiefe sehen“):
      // erste Zeile P<m><r><a> Q<kleinste Zustellung> R<Schlichtzugabe>
      // (µm), zweite Zeile X Z P<Gewindetiefe> Q<erste Zustellung> F<Steigung>;
      // daraus jeder Durchgang einzeln, Tiefe Q·√n, an der Flanke entlang
      // zugestellt (Winkel a), am Schluss m Schlichtdurchgänge
      const roh = s.match(/P(\d+)/);
      if (!("X" in a) || !("Z" in a)) {
        if (roh) {
          const pz = roh[1].padStart(6, "0");
          g76 = { m: Number(pz.slice(-6, -4)) || 1, a: Number(pz.slice(-2)), qmin: (a.Q || 0) / 1000, fein: (a.R || 0) / 1000 };
        }
        continue;
      }
      if (x == null || z == null) continue;
      const x0 = x, z0 = z, X = a.X, Z = a.Z, P = Math.abs(a.F || 0);
      const k = Math.abs(a.P || 0) / 1000, d1 = Math.abs(a.Q || 0) / 1000;
      const par = g76 || { m: 1, a: 60, qmin: 0, fein: 0 };
      const aussen = x0 > X, tw = Math.tan((par.a || 0) * Math.PI / 360);
      const zur = Z >= z0 ? -1 : 1; // zur Startseite hin
      const tiefen = [];
      if (k > 0 && d1 > 0) {
        const roh2 = Math.max(0, k - par.fein);
        let n = 1, vor = 0;
        while (tiefen.length < 60) {
          let t = d1 * Math.sqrt(n);
          if (t - vor < par.qmin) t = vor + par.qmin;
          if (t >= roh2 - 1e-9) { if (roh2 > vor + 1e-9) tiefen.push(roh2); break; }
          tiefen.push(t); vor = t; n++;
        }
        for (let i = 0; i < Math.max(1, par.m); i++) tiefen.push(k);
      } else tiefen.push(k);
      for (const t of tiefen) {
        const xt = aussen ? X + 2 * (k - t) : X - 2 * (k - t);
        const dz = zur * (k - t) * tw;
        nach(xt, z0 + dz, y, c, false, nr);
        const ab = punkte.length;
        nach(xt, Z + dz, y, c, true, nr);
        const gew = { rt: xt / 2, aussen, zA: z0 + dz, zE: Z + dz, P, tw: Math.tan((par.a || 60) * Math.PI / 360) };
        for (let j = Math.max(1, ab); j < punkte.length; j++) punkte[j].gew = gew;
        nach(x0, Z + dz, y, c, false, nr); nach(x0, z0, y, c, false, nr);
      }
      continue;
    }
    // Zeilen ohne Achse (G99, M1 …) fahren nicht
    if (!ACHSEN.some((k) => k in a)) continue;
    let y1 = y, c1 = c;
    if (polar) { if ("C" in a) y1 = a.C; if ("H" in a) y1 = y + a.H; }
    else { if ("Y" in a) y1 = a.Y; if ("C" in a) c1 = a.C; if ("H" in a) c1 = c + a.H; }
    if (zyk) {
      eckeFertig(null, null, false);
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
    // Wartet eine Ecke (,C / ,R), gilt ihr Ziel schon als Lage
    const bx = ecke ? ecke.x : x, bz = ecke ? ecke.z : z;
    let x1 = "X" in a ? a.X : bx, z1 = "Z" in a ? a.Z : bz;
    if ("U" in a) x1 = (bx ?? 0) + a.U;
    if ("W" in a) z1 = (bz ?? 0) + a.W;
    // ,A Winkel bei nur einer Achse: die andere aus dem Winkel
    const winkel = s.match(/,A\s*([-+]?\d*\.?\d+)/);
    if (winkel && bx != null && bz != null) {
      const w = Number(winkel[1]) * Math.PI / 180;
      // Winkel zur +Z-Achse im Gegenuhrzeigersinn, mit Vorzeichen (seit
      // 1.596.0, vorher immer Richtung +Z bei steigendem X; seit 1.596.0
      // auch nur Z mit ,A, wie es HOFERCONTUR bei flachen Kegeln schreibt)
      if ("X" in a && !("Z" in a) && Math.abs(Math.tan(w)) > 1e-6) z1 = bz + ((x1 - bx) / 2) / Math.tan(w);
      else if ("Z" in a && !("X" in a) && Math.abs(Math.cos(w)) > 1e-6) x1 = bx + 2 * (z1 - bz) * Math.tan(w);
    }
    if (x == null && z == null) { x = x1 ?? 0; z = z1 ?? 0; y = y1; c = c1; continue; }
    if (x1 == null) x1 = x ?? 0;
    if (z1 == null) z1 = z ?? 0;
    if (modal >= 2 && ("R" in a || "I" in a || "K" in a || "J" in a) && !/,R/.test(s)) {
      eckeFertig(null, null, false);
      bogen({ x: x1, z: z1, y: y1, c: c1 }, a, modal === 2, nr);
    } else {
      eckeFertig(x1, z1, modal === 1 && ecke && y1 === ecke.y && c1 === ecke.c);
      const ek = modal === 1 && !polar && s.match(/,([CR])\s*(\d*\.?\d+)/);
      if (ek) ecke = { x: x1, z: z1, y: y1, c: c1, art: ek[1], wert: Number(ek[2]), nr };
      else nach(x1, z1, y1, c1, modal !== 0, nr);
    }
  }
  eckeFertig(null, null, false);
  return punkte;
}

// Hülle der Drehplatte je Zelle in Z: tiefster und höchster Radius-
// versatz zur gedachten Spitze
// Seit 1.590.0 (Wunsch Patrick 17. November 2026: „verkleinere die
// Drehplatten bei Innenbearbeitungen grundsätzlich, damit sie in das Loch
// passen und theoretisch auf der Rückseite die Kontur nicht verschneiden“):
// mit tief > 0 reicht die Platte von der Spitze höchstens so weit zur
// Drehmitte hin. Zuerst kleiner gezeichnet (Schneidenradius bleibt), sonst
// um die Spitze verkleinert.
// Seit 1.681.0: Einstechplatten werden nie gestaucht, sonst änderte sich
// die Breite und damit der Einstich. Radial wird nur die Platte kürzer,
// axial (Planeinstich) liegt die Breite radial und bleibt, wie sie ist.
export function plattenHuelle(wz, tief, axial = false) {
  const einstech = plattenForm(wz.form)?.art === "einstech";
  const G = plattenGross(wz);
  let p = plattenUmriss(wz, G, einstech && axial);
  if (!p.length) return null;
  const tiefe = (q) => Math.max(0, ...q.map((x) => -x.x));
  if (einstech) {
    if (!axial && tief > 0 && tiefe(p) > tief) p = plattenUmriss(wz, G, false, tief);
  } else if (tief > 0 && tiefe(p) > tief) {
    const q = plattenUmriss(wz, Math.max(0.3, G * tief / tiefe(p)));
    if (q.length) p = q;
    const t = tiefe(p);
    if (t > tief) p = p.map((x) => ({ z: x.z * tief / t, x: x.x * tief / t }));
  }
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
// Seit 1.567.2 (Patrick 16. November 2026: „nimm nicht den Wert der
// Vorposition, sondern den Z-Wert der ersten nicht G0-Bewegung“): Lage der
// Stirn = Z am Ende der ersten Vorschubbewegung (Drehplatte am festen
// Frontwerkzeug); bei einem Bohrzyklus dort, wo er anfängt
function ersteVorZ(roh, zeilen) {
  const k = roh.findIndex((p) => p.vor && p.z != null);
  if (k < 0) return null;
  const nr = roh[k].nr;
  if (/G8[3-9]/i.test(String(zeilen[nr] || "")) && k > 0) return roh[k - 1].z;
  let j = k;
  while (j + 1 < roh.length && roh[j + 1].vor && roh[j + 1].nr === nr) j++;
  return roh[j].z;
}

// G50 mit Z: Wert, sonst null
function g50Z(roh) {
  const t = sauber(roh);
  if (!/G50/.test(t)) return null;
  const m = t.replace(/G50/, "").match(/Z\s*([-+]?\d*\.?\d+)/);
  return m ? Number(m[1]) : null;
}
// Abstand Vorposition − Nullpunkt beim ersten G50Z (Spitze vor der Stirn
// = vor der Drehebene, wie seit 1.585.0 bei den festen Frontwerkzeugen)
function vorG50(zeilen) {
  let z = null;
  for (const roh of zeilen) {
    const n = g50Z(roh);
    if (n != null) return z == null ? null : z - n;
    const t = sauber(roh);
    if (/^M|^T|G28/.test(t)) continue;
    const m = t.match(/Z\s*([-+]?\d*\.?\d+)/);
    if (m) z = Number(m[1]);
  }
  return null;
}

// Kanal 3 der SW-20 an der Hauptspindel (seit 1.669.0). Laut Handbuch
// (8-14-24 und M131/M133): mit M131 (Vorgabe) steuert Kanal 1 Z1, das
// Material; Kanal 3 fährt seinen Träger in Z3 → zTraeger, das Material
// steht. Mit M133 übernimmt Kanal 3 Z1, Spindel und Zange: der Träger 3
// steht in Z, das Material fährt (Patricks O3272: „M131(1) … G0Z0.0
// M133(1)“). M142 (Überlagerung Z1–Z3) bewegt ebenfalls den Träger 3.
// Träger 3 steht der Hauptspindel gegenüber (−X, gespiegelt).
function k3Schritt(s, b, zeilen, v, W, prog, wa) {
  // Modus: zuletzt M131 oder M133 vor der Bearbeitung in Kanal 3
  let modus = "M131";
  const k3 = prog.k3 || [];
  const lage = bereichLage(prog.auto3 || [], k3, prog.bereiche3 && prog.bereiche3[b.id]);
  const bis = lage ? lage[0] : 0;
  for (let k = 0; k < bis && k < k3.length; k++) { const t = sauber(k3[k]); if (/^M13[13](?!\d)/.test(t)) modus = t.slice(0, 4); }
  for (const z of zeilen) {
    const t = sauber(z);
    if (/^M13[13](?!\d)/.test(t)) modus = t.slice(0, 4);
    if (/^M142(?!\d)/.test(t)) modus = "M142";
    if (/G0?[01](?!\d)|^[XZUW]/.test(t) && /[XZUW]/.test(t.replace(/[GMST]\d+(\.\d)?/g, ""))) break;
  }
  s.m133 = modus === "M133";
  s.zTraeger = !s.m133;
  const mitG50 = zeilen.some((z) => g50Z(z) != null);
  let roh = m50Folgen(zeilen, v, prog, mitG50, !s.m133);
  s.zeilen = zeilen;
  const dreht = s.art === "k3f";
  if (s.art === "k3s") {
    // Querangetrieben Kanal 3 (1.678.0): wie Querangetrieben Kanal 1,
    // Z = Lage im Teil, Träger 3 gespiegelt (−X, −Y)
    s.achse = "quer";
    s.punkte = roh.map((p) => {
      const uM = -(p.x || 0) / 2, wM = -(p.y || 0);
      const { t, dreh } = imTeil(p, 1, uM, wM, p.z, W);
      return { z: t[0], r: Math.hypot(t[1], t[2]), phi: Math.atan2(t[2], t[1]), t, ax: [0, -dreh[0], -dreh[1]], vor: p.vor, nr: p.nr, mx: uM, my: wM, c: p.c || 0 };
    });
    s.modus = wa === "fraes" ? "c" : null;
    if (wa === "dreh") s.status = "nurBahnA";
    return;
  }
  let zT;
  if (s.art === "k3dr") {
    // Drehwerkzeug Kanal 3 (1.677.0): Z wie beim Drehwerkzeug Kanal 1
    zT = (p) => p.z;
  } else if (mitG50) {
    zT = (p) => p.z;
    const dz = vorG50(zeilen);
    s.dzVorne = dz == null ? -0.5 : -dz;
  } else {
    const erst = roh.find((p) => p.z != null);
    const an = num(b.anZ) ?? (erst ? erst.z : 0);
    zT = (p) => p.z - an - 0.5;
    s.dzVorne = -(an + 0.5);
  }
  s.punkte = roh.map((p) => {
    if (dreht) {
      const uM = -(p.x || 0) / 2, wM = -(p.y || 0);
      const { t } = imTeil(p, 1, uM, wM, zT(p), W);
      return { z: t[0], r: Math.hypot(t[1], t[2]), phi: Math.atan2(t[2], t[1]), t, ax: [-1, 0, 0], vor: p.vor, nr: p.nr, mx: uM, my: wM, c: p.c || 0 };
    }
    return { z: zT(p), r: Math.abs(p.x || 0) / 2, phi: Math.PI, vor: p.vor, nr: p.nr, mx: -Math.abs(p.x || 0) / 2, my: -(p.y || 0), c: p.c || 0 };
  });
  if (dreht) { s.achse = "laengs"; s.modus = wa === "fraes" ? "c" : null; if (wa === "dreh") s.status = "nurBahnA"; }
  else s.modus = wa === "fraes" ? "bohr" : wa === "dreh" ? "dreh" : null;
}

// M50 X[13] / Y[13] / Y[-13] … M51 (Handbuch 8-14-19): X3 bzw. Y3 fahren
// die Wege von X1 / Y1 aus Kanal 1 mit. Die Wege von Kanal 1 kommen aus
// dem Kanal-1-Programm zwischen derselben Wartemarke wie vor M50 in
// Kanal 3 und der nächsten Marke dort; ohne M133 fährt das Material dabei
// auch Z1, das zählt im Teil mit. M50 X[31] (Kanal 1 folgt Kanal 3) wird
// nur übergangen.
function m50Folgen(zeilen, v, prog, mitG50, mitZ) {
  const L = zeilen.map(sauber);
  const i50 = L.findIndex((t) => /^M50(?!\d)/.test(t) && /\[\s*-?13\s*\]/.test(t));
  if (i50 < 0) return bahnLesen(zeilen, { ...v }, { mitG50 });
  const t50 = L[i50];
  const fx = /X\s*\[\s*13\s*\]/.test(t50) ? 1 : 0;
  const fy = /Y\s*\[\s*13\s*\]/.test(t50) ? 1 : /Y\s*\[\s*-13\s*\]/.test(t50) ? -1 : 0;
  let marke = null;
  for (let k = i50 - 1; k >= 0; k--) { const m = L[k].match(/^(M\d{3}P\d+)/); if (m) { marke = m[1]; break; } }
  const vor = bahnLesen(zeilen.slice(0, i50 + 1), { ...v }, { mitG50 });
  const p0 = vor[vor.length - 1];
  const k1 = prog.k1 || [], S1 = k1.map(sauber);
  // Seit 1.726.0 (Vorlage Synchronsteuerung): ohne Wartemarke davor steht
  // M50 in beiden Kanälen, die Wege von Kanal 1 laufen bis M51
  let j = marke ? S1.findIndex((t) => t.startsWith(marke)) : -1;
  if (j < 0) j = S1.findIndex((t) => /^M50(?!\d)/.test(t));
  if (!p0 || j < 0) return bahnLesen(zeilen, { ...v }, { mitG50 });
  let j2 = S1.findIndex((t, k) => k > j && ((/^M\d{3}(?!\d)/.test(t) && /^M[2-9]\d\d/.test(t)) || /^M51(?!\d)/.test(t)));
  if (j2 < 0) j2 = S1.length;
  const vorher = bahnLesen(k1.slice(0, j + 1), { ...v });
  const s1 = vorher[vorher.length - 1] || null;
  const weg1 = bahnLesen(k1.slice(j + 1, j2), { ...v }, { start: s1 });
  const q0 = s1 || weg1[0];
  const folge = q0 ? weg1.map((q) => ({
    x: p0.x + fx * ((q.x ?? q0.x) - q0.x), z: p0.z + (mitZ ? (q.z ?? q0.z) - q0.z : 0),
    y: p0.y + fy * ((q.y || 0) - (q0.y || 0)), c: p0.c, vor: q.vor, nr: i50,
  })) : [];
  const p1 = folge[folge.length - 1] || p0;
  const rest = bahnLesen(zeilen.slice(i50 + 1), { ...v }, { mitG50: false, start: { x: p1.x, z: p1.z, y: p1.y, c: p1.c } })
    .map((p) => ({ ...p, nr: p.nr + i50 + 1 }));
  return [...vor, ...folge, ...rest];
}

export function simAufbauen(wRoh) {
  const w = wirksamW(wRoh);
  const A = num(w.A) || 10, W = num(w.W) || 10, B = num(w.B) || 0;
  const v = { 531: A, 530: W, 529: num(w.S) || 0, 524: num(w.X) || 0, 525: num(w.Z) || 0, 522: num(w.F) || 0, 528: B, 510: A + 1 };
  const prog = programmeMitHand(w);
  const marken = prog.marken || markenVergeben(w.bloecke || []);
  const vorne = -Math.abs(num(w.schlicht) || 0);
  // SW-20 (1.669.0): drei Kanäle, Kanal 3 arbeitet an der Hauptspindel
  const sw = kanalZahl() > 2;
  const schritte = [];
  let cZ = -Infinity, hatGew = false;
  // Seit 1.738.0 (Patrick 23. November 2026: „die Bearbeitung in Kanal 3
  // soll auch ein eigenes Werkzeug für die Simulation haben“): eine
  // Bearbeitung im Feld für den anderen Kanal (b.unter) wird ein eigener
  // Schritt gleich nach ihrer Bearbeitung, mit ihrem Werkzeug und den
  // Zeilen aus Kopf, Marke, Code, Marke, Ende ihrer Vorlage
  const bauen = (bRoh, i, fest) => {
    const b = wirksamB(bRoh);
    const platz = "T" + (b.platz || "");
    const titel = platz + (b.bez ? " " + b.bez : "");
    const art = b.art || "dreh";
    // Kanal 3 der SW-20: seit 1.669.0 in der Simulation (an der Hauptspindel)
    const k3 = sw && art.startsWith("k3");
    if (!sw && (art.startsWith("k3") || art === "k2b")) return;
    const gegen = (art === "front" || art === "quer") && b.spindel === "gegen";
    const kanal = art === "k2" || art === "k2a" || art === "k2b" || gegen ? 2 : 1;
    const wzOk = wzVollstaendig(bRoh);
    const wa = wzOk ? wzArt(bRoh) : null;
    const s = { i, id: b.id, unter: !!fest, block: bRoh, kanal, pfad: k3 ? 3 : kanal, titel, platz: Number(b.platz) || 0, art, gegen, wz: wzOk ? bRoh.wz : null, wzArt: wa, punkte: [], modus: null, status: "" };
    let zeilen = fest || (k3 ? blockZeilen3(b, w, marken[b.id]) : kanal === 2 ? blockZeilen2(b, marken[b.id], w) : blockZeilen(b, w, marken[b.id]));
    // Seit 1.618.1: genau so, wie es im Programmfenster steht (mit Handänderungen)
    const mitHand = fest ? null : k3 ? bereichMitHand(prog.auto3, prog.k3, prog.bereiche3[b.id])
      : kanal === 2 ? bereichMitHand(prog.auto2, prog.k2, prog.bereiche2[b.id]) : bereichMitHand(prog.auto1, prog.k1, prog.bereiche[b.id]);
    if (mitHand) zeilen = mitHand;
    if (sw && kanal === 1 && !k3) { const l = bereichLage(prog.auto1, prog.k1, prog.bereiche[b.id]); s.zeile1 = l ? l[0] : Infinity; }
    if (k3) {
      k3Schritt(s, b, zeilen, v, W, prog, wa);
      if (s.modus === "c") for (const p of s.punkte) if (p.vor) cZ = Math.max(cZ, p.t[0] + (num(bRoh.wz?.d) || 6) / 2 + 0.5);
    } else if (sw && art === "k1f") {
      // Seit 1.728.0: Frontbohrapparat angetrieben Kanal 1 (T500 / T600),
      // gebaut wie der in Kanal 3: Teil 0.5 mm vor „Anfahren Z“, tiefer =
      // grösseres Z, C dreht das Teil, Träger 1 nicht gespiegelt
      const roh = bahnLesen(zeilen, { ...v });
      s.zeilen = zeilen;
      const erst = roh.find((p) => p.z != null);
      const an = num(b.anZ) ?? (erst ? erst.z : 0);
      s.dzVorne = -(an + 0.5);
      s.punkte = roh.map((p) => {
        const uM = (p.x || 0) / 2, wM = p.y || 0;
        const { t } = imTeil(p, 1, uM, wM, p.z - an - 0.5, W);
        return { z: t[0], r: Math.hypot(t[1], t[2]), phi: Math.atan2(t[2], t[1]), t, ax: [-1, 0, 0], vor: p.vor, nr: p.nr, mx: uM, my: wM, c: p.c || 0 };
      });
      s.achse = "laengs"; s.modus = wa === "fraes" ? "c" : null; if (wa === "dreh") s.status = "nurBahnA";
      if (s.modus) for (const p of s.punkte) if (p.vor) cZ = Math.max(cZ, p.t[0] + (num(bRoh.wz?.d) || 6) / 2 + 0.5);
    } else if (sw && (art === "front" || art === "k2b") && zeilen.some((z) => g50Z(z) != null)) {
      // SW-20 Frontbohrapparat Kanal 1 (G50Z wie Patricks T600): Z nach
      // G50 ist die Lage im Teil, die Spitze steht Vorposition − Nullpunkt
      // vor der Drehebene
      const roh = bahnLesen(zeilen, { ...v }, { mitG50: true });
      s.zeilen = zeilen;
      s.punkte = roh.map((p) => ({ z: p.z, r: Math.abs(p.x || 0) / 2, vor: p.vor, nr: p.nr, mx: (p.x || 0) / 2, my: p.y || 0 }));
      const dz = vorG50(zeilen);
      if (kanal === 1 && dz != null) s.dzVorne = -dz;
      s.modus = wa === "fraes" ? "bohr" : wa === "dreh" ? "dreh" : null;
    } else if (ANGETRIEBEN.has(art)) {
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
        // Seit 1.585.0: Spitze vor der Drehebene, siehe unten bei den festen Frontwerkzeugen
        if (kanal === 1 && art === "quer" && sg === 1) s.dzVorne = -(an + 0.5);
      }
      s.punkte = roh.map((p) => {
        // Kanal 2: das Teil fährt in X, das Werkzeug steht → Lage im Teil −X
        const uM = kanal === 2 && art === "k2a" ? -(p.x || 0) / 2 : (p.x || 0) / 2;
        const { t, dreh } = imTeil(p, kanal, uM, p.y || 0, zTeil(p), W);
        // Achse zum Schaft hin: quer nach aussen (+X der Maschine), längs zur Spindel hin
        const ax = s.achse === "quer" ? [0, dreh[0], dreh[1]] : [kanal === 1 ? -1 : 1, 0, 0];
        const anz = kanal === 2 ? [W - t[0], t[1], -t[2]] : t;
        // mx, my, c: Lage an der Maschine (für den Werkzeugträger in der Ansicht)
        return { z: anz[0], r: Math.hypot(anz[1], anz[2]), phi: Math.atan2(anz[2], anz[1]), t, ax, vor: p.vor, nr: p.nr, mx: uM, my: p.y || 0, c: p.c || 0 };
      });
      s.modus = wa === "fraes" ? "c" : null;
      if (wa === "dreh") s.status = "nurBahnA";
      if (s.modus) for (const p of s.punkte) if (p.vor) cZ = Math.max(cZ, p.t[0] + (num(bRoh.wz?.d) || 6) / 2 + 0.5);
    } else {
      // Seit 1.561.0: Kanal 2 wie eingelesen ohne G50 (ältere Programme
      // bohren direkt mit der Gegenspindel) rechnet wie ein Frontwerkzeug
      // Seit 1.669.0 zählt nur G50 mit X oder Z (SW-20: G50S4000 ist die Drehzahlbegrenzung)
      const ohneG50 = art === "k2" && !zeilen.some((z) => /G50/i.test(z) && /[XZ]/i.test(String(z).replace(/\(.*?\)/g, "").replace(/G50/i, "")));
      const roh = bahnLesen(zeilen, { ...v }, { mitG50: art === "k2" && !ohneG50 });
      s.zeilen = zeilen;
      // Bohr- und Fräswerkzeuge an Front: Teil 0.5 mm vor „Anfahren Z“,
      // tiefer ins Teil = weg von „Zurück Z“
      if (art === "front" || ohneG50) {
        // Seit 1.567.1: an der Hauptspindel heisst tiefer immer grösseres Z
        // (das Teil fährt zum Werkzeug, Patrick 16. November 2026: bei T1200
        // mit Anfahren -0.5 und Zurück 0 fuhr es vom Teil weg); an der
        // Gegenspindel wie bisher weg von „Zurück Z“
        const an = num(b.anZ) ?? 0, weg = num(b.wegZ);
        const sg = kanal === 1 ? 1 : weg != null && weg > an ? -1 : 1;
        // nur Drehplatten: beim Bohren ist die erste Vorschubbewegung die Bohrung selbst
        const zErst = wa === "dreh" ? ersteVorZ(roh, zeilen) : null;
        const z0 = zErst ?? an, luft = zErst != null ? 0 : 0.5;
        s.punkte = roh.map((p) => ({ z: sg * (p.z - z0) - luft, r: Math.abs(p.x || 0) / 2, vor: p.vor, nr: p.nr }));
        // Seit 1.585.0 (Patrick 16. November 2026: „die Vorposition ist bei
        // Z5.0 programmiert, das Werkzeug wird bei Z5.0 mit einem Abstand von
        // 0.5 mm zum Werkstück montiert“): an der Hauptspindel ist Z die Lage
        // der Stirn vor der Drehebene, die Spitze steht also fest
        // z0 + Luft vor der Drehebene, nicht an der Bohreinheit geschätzt
        if (kanal === 1) s.dzVorne = -(z0 + luft);
        // Seit 1.567.0 (Patrick 16. November 2026: „bei T1200 Front
        // Innendrehen nur die Werkzeugbahn“): eine Drehplatte am festen
        // Frontwerkzeug dreht wie ein Drehwerkzeug, X aus dem Programm
        s.modus = wa === "fraes" ? "bohr" : wa === "dreh" ? "dreh" : null;
      } else if (sw && art === "k2b") {
        // Seit 1.681.0: Bohren stehend Kanal 2 der SW-20 ohne G50 (Patricks
        // T2700 / T2800 aus 10844-0049): Z wie programmiert ab der Rückseite,
        // vorher übersprang die Simulation diese Bohrungen
        s.punkte = roh.map((p) => ({ z: p.z, r: Math.abs(p.x || 0) / 2, vor: p.vor, nr: p.nr }));
        s.modus = wa === "fraes" ? "bohr" : wa === "dreh" ? "dreh" : null;
      } else if (art === "k2") {
        s.punkte = roh.map((p) => ({ z: p.z, r: Math.abs(p.x) / 2, vor: p.vor, nr: p.nr }));
        s.modus = wa === "fraes" ? "bohr" : wa === "dreh" ? "dreh" : null;
      } else {
        s.punkte = roh.map((p) => (p.gew ? { z: p.z, r: p.x / 2, vor: p.vor, nr: p.nr, gew: p.gew } : { z: p.z, r: p.x / 2, vor: p.vor, nr: p.nr }));
        s.modus = wa === "dreh" ? "dreh" : null;
        // Gewinde (G76): die Gänge kommen ins Zellenraster
        if (s.modus === "dreh") for (const p of s.punkte) if (p.gew) { hatGew = true; cZ = Math.max(cZ, Math.max(p.gew.zA, p.gew.zE) + p.gew.P + 0.5); }
      }
    }
    if (!wzOk) s.status = "fehlt";
    if (!s.punkte.length && !s.status) s.status = "leer";
    schritte.push(s);
  };
  (w.bloecke || []).forEach((bRoh, i) => {
    bauen(bRoh, i);
    if (!bRoh.unter) return;
    for (const [x, y, ziele, xt, yt] of markenPaare(bRoh)) for (const k of ziele) {
      const u = unterBlock(bRoh, k, x, y, [xt, ...k1Zeilen(bRoh, x, y, "k" + k), yt]);
      if (u) bauen(u, i, blockZeilenK(wirksamB(u), k, w));
    }
  });
  // Seit 1.558.3 (Patrick 16. November 2026: „beim Abstechen und Übergabe
  // sehe ich dann, dass das Werkstück vom Rest der 3 m langen Stange
  // abgetrennt wird“): nach Kanal 1 sticht das Ende ab wie im Programm,
  // G00X#510Z[#530+#528], G1X#524, die Gegenspindel zieht das Teil weg
  const greif = Math.max(1, Math.min(W - 0.5, num(w.ueber) || Math.max(2, W / 2)));
  const ab1 = abstechSchritt(A, W + Math.abs(num(w.plan) || 0), B, num(w.X) || 0, Math.abs(num(w.annaehern) ?? 10), greif);
  // Kanal 1 zuerst, dann Abstechen, dann Kanal 2, je in der Reihenfolge der Bearbeitungen
  // SW-20: Kanal 3 dort, wo Kanal 1 mit M133 auf Kanal 3 wartet (O1272:
  // „M131(1) M133(1) … M131(2)“), ohne M133 nach Kanal 1
  let vor1 = schritte.filter((s) => s.kanal === 1 && s.pfad !== 3), nach1 = [];
  if (sw) {
    const i133 = (prog.k1 || []).findIndex((z) => /^M133(?!\d)/.test(sauber(z)));
    if (i133 >= 0) { nach1 = vor1.filter((s) => s.zeile1 > i133); vor1 = vor1.filter((s) => !(s.zeile1 > i133)); }
  }
  const sortiert = [...vor1, ...schritte.filter((s) => s.pfad === 3), ...nach1, ab1, ...schritte.filter((s) => s.kanal === 2)];
  let ab = 0;
  sortiert.forEach((s) => { s.von = ab; ab += s.punkte.length; s.bis = ab; });
  const zMax = Math.min(300, Math.max(W + B + 3, ...sortiert.filter((s) => s.kanal === 1 && !s.achse).flatMap((s) => s.punkte.filter((p) => p.vor).map((p) => p.z + 1))));
  const hatC = sortiert.some((s) => s.modus === "c") || hatGew;
  // Stange: auf der Maschine 3 m lang; gezeichnet so lang, dass sie hinter
  // der Führungsbüchse aus dem Bild läuft
  const zStange = zMax + Math.max(80, 4 * (zMax - vorne + A));
  return {
    // Seit 1.692.0 für die Optimierung: Variablen #5xx wie oben
    vars: v,
    sw, swFront: sw ? swFrontVon(wRoh) : [], swFest: sw ? swFrontVon(wRoh).filter((p) => swFrontArt(wRoh, p) === "fest") : [], swSchlitz: sw && !!(wRoh && wRoh.swSchlitz),
    roh: { A, W, B, vorne }, schritte: sortiert, gesamt: ab, zMax, zStange, hatK2: sortiert.some((s) => s.kanal === 2),
    // Platz 34: T3400 oder T3421–T3423 montiert, die Simulation zeigt nur das Montierte
    t34: t34Von(wRoh),
    abVersatz: abVersatz(wRoh),
    // so weit greift die Gegenspindel über das Teil („Über das Teil Z“)
    greif,
    vox: hatC ? { z0: vorne - 0.5, z1: Math.min(zMax, Math.max(W + B + 1, cZ)) } : null,
  };
}

// Abstechen am Ende von Kanal 1: Stahl der Breite B, Bezugskante hinten
// bei Z = W + B (wie im Programm), schneidet von #510 bis #524; danach
// zieht die Gegenspindel das Teil 8 mm nach vorne weg (Übergabe)
const UEBERGABE = 8;
// Seit 1.586.0 (Patrick 16. November 2026: „kannst du das Übergeben mit
// Vorposition und Überfahren vor dem Abstechen auch simulieren?“): wie im
// Ende der Kanäle; Kanal 1 fährt den Abstecher vor (G00X#510Z[#530+#528]),
// die Gegenspindel kommt im Eilgang bis „Annähern Z“ vor die Stirn
// (G0Z-10.), fährt im Vorschub „Über das Teil Z“ darüber (G1G98Z…F5000.),
// spannt, dann sticht Kanal 1 ab und die Gegenspindel zieht das Teil weg.
// g = Lage der Spannzange der Gegenspindel im Teil (0 = Stirn)
function abstechSchritt(A, W, B, X, ann, greif) {
  const Bw = B > 0 ? B : 2;
  const z = W + Bw, r0 = (A + 1) / 2, r1 = Math.max(-0.5, X / 2);
  const gFern = -(ann + 40);
  const punkte = [{ z, r: r0, vor: false, nr: 0, g: gFern }];
  for (let k = 1; k <= 12; k++) punkte.push({ z, r: r0, vor: false, nr: 1, g: gFern + (-ann - gFern) * k / 12 });
  const n1 = Math.max(12, Math.ceil((greif + ann) / 1.5));
  for (let k = 1; k <= n1; k++) punkte.push({ z, r: r0, vor: false, nr: 2, g: -ann + (greif + ann) * k / n1 });
  const n = Math.max(20, Math.ceil((r0 - r1) / 0.05));
  for (let k = 1; k <= n; k++) punkte.push({ z, r: r0 + (r1 - r0) * k / n, vor: true, nr: 3, g: greif });
  for (let k = 1; k <= 24; k++) punkte.push({ z, r: r1, vor: false, nr: 4, ab: UEBERGABE * k / 24, g: greif });
  const zahl = (x) => (Number.isInteger(x) ? x + "." : String(x));
  return { i: "ab", id: "abstechen", kanal: 1, titel: "Abstechen und Übergabe", platz: 100, art: "abstech", modus: "abstech", wz: null,
    breite: Bw, punkte, status: "", zeilen: ["G00X#510Z[#530+#528]", "Kanal 2: G0Z-" + zahl(ann) + " (Gegenspindel vor die Stirn)",
      "Kanal 2: G1G98Z" + zahl(greif) + "F5000. (über das Teil)", "G1X#524F#522", "Übergabe an die Gegenspindel"] };
}
function abstechen(st, s, p) {
  if (!p.vor) return;
  const { aussen, innen, z0 } = st;
  const ka = Math.max(0, Math.round((p.z - s.breite - z0) / RASTER)), kb = Math.min(aussen.length - 1, Math.round((p.z - z0) / RASTER));
  const r = Math.max(0, p.r);
  for (let k = ka; k <= kb; k++) ringeSchneiden(st, k, r, Infinity);
}

// Seit 1.681.0 (Patrick 21. November 2026, 10844-0049: Ringnut in der
// Stirn mit Nabe in der Mitte): je Zelle bis zwei Ringe Material, aussen
// innen … aussen und darin der Kern kernI … kernA (kernA 0 = kein Kern).
// Vorher konnte ein Schnitt mitten im Material (Ringnut, Plattenkörper)
// nichts wegnehmen, und eine Nabe ging mit der Bohrung verloren.
export function kernVon(st) {
  if (!st.kernA) { st.kernA = new Float32Array(st.aussen.length); st.kernI = new Float32Array(st.aussen.length); }
  return st;
}
export function ringeSchneiden(st, k, lo, hi) {
  const { aussen, innen } = st;
  const ringe = [];
  if (aussen[k] > innen[k] + 1e-6) ringe.push([innen[k], aussen[k]]);
  if (st.kernA && st.kernA[k] > st.kernI[k] + 1e-6) ringe.push([st.kernI[k], st.kernA[k]]);
  if (!ringe.length || hi <= lo) return;
  const neu = [];
  let weg = 0;
  for (const [a, b] of ringe) {
    if (hi <= a || lo >= b) { neu.push([a, b]); continue; }
    weg += Math.min(b, hi) - Math.max(a, lo);
    if (lo > a + 1e-6) neu.push([a, lo]);
    if (hi < b - 1e-6) neu.push([hi, b]);
  }
  // Wie viel weg ist (mm je Zelle): daran erkennt die Optimierung, ob eine
  // Vorschubzeile wirklich schneidet (seit 1.718.0)
  if (weg > 0) st.weg = (st.weg || 0) + weg;
  neu.sort((x, y) => y[1] - x[1]);
  // Seit 1.690.2 (Patrick 21. November 2026, 10844-0049: „komische
  // Absätze“): mehr als zwei Ringe gehen nicht. Vorher fiel der innerste
  // weg, so verschwand bei Einstichen in Z nacheinander auf mehreren
  // Durchmessern (T2100: X14, X11, X8 bis Z0.8) eine ganze Scheibe.
  // Jetzt werden die zwei Ringe mit der kleinsten Lücke dazwischen
  // zusammengelegt: lieber kurz etwas Material zu viel als ein Loch.
  while (neu.length > 2) {
    let m = 1, luecke = Infinity;
    for (let i = 1; i < neu.length; i++) {
      const l = neu[i - 1][0] - neu[i][1];
      if (l < luecke) { luecke = l; m = i; }
    }
    neu.splice(m - 1, 2, [neu[m][0], neu[m - 1][1]]);
  }
  if (neu.length > 1 && !st.kernA) kernVon(st);
  const r0 = neu[0] || [0, 0];
  aussen[k] = Math.max(0, r0[1]); innen[k] = Math.max(0, r0[1] > 0 ? r0[0] : 0);
  if (st.kernA) { const r1 = neu[1] || [0, 0]; st.kernA[k] = r1[1]; st.kernI[k] = r1[0]; }
}

// Werkzeughüllen einmal je Simulation
// Innenbearbeitung: Lage der Schneidenspitze nach aussen (die Platte liegt
// zur Drehmitte hin). Die Platte darf dann höchstens 80 % des kleinsten
// Radius tief sein, auf dem sie in dieser Bearbeitung schneidet.
export function innenTiefe(s) {
  if (!s || s.modus !== "dreh" || !s.wz) return 0;
  const l = SPITZEN.find((x) => x.id === s.wz.sl);
  if (!l || !(l.r > 0)) return 0;
  // Nur die Endpunkte der Vorschubzeilen zählen: das Anfahren aus der
  // Drehmitte (Frontwerkzeug ohne X) ist kein Schneiden im Loch
  let r = Infinity;
  const pk = s.punkte || [];
  for (let i = 0; i < pk.length; i++) {
    const p = pk[i];
    if (!p.vor || (i + 1 < pk.length && pk[i + 1].nr === p.nr)) continue;
    if (p.r > 0.05 && p.r < r) r = p.r;
  }
  return r === Infinity ? 0 : Math.max(0.2, r * 0.8);
}

// Einstechplatte axial (Planeinstich)? Laut Bahn: fährt das Werkzeug im
// Vorschub weiter in Z als in X, sticht es in Z ein (10844-0049, T1900
// und T1600 in der Ringnut). Ein Feld am Werkzeug gibt es dafür nicht.
export function einstechAxial(s) {
  if (!s || s.modus !== "dreh" || !s.wz || plattenForm(s.wz.form)?.art !== "einstech") return false;
  let dz = 0, dr = 0;
  const pk = s.punkte || [];
  for (let i = 1; i < pk.length; i++) {
    if (!pk[i].vor) continue;
    dz += Math.abs(pk[i].z - pk[i - 1].z); dr += Math.abs(pk[i].r - pk[i - 1].r);
  }
  return dz > dr * 1.5;
}
export function huelleFuer(s) {
  return s.modus === "dreh" ? plattenHuelle(s.wz, innenTiefe(s), einstechAxial(s)) : bohrerHuelle(s.wz);
}

function huelleVon(s, cache) {
  if (!s.wz || !s.modus) return null;
  if (!cache.has(s.id)) {
    const h = huelleFuer(s);
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
      ringeSchneiden(st, k, p.r + h.lo[j], p.r + h.hi[j]);
    }
  } else if (s.modus === "bohr") {
    if (p.r > 0.05) return; // feste Werkzeuge nur auf der Drehmitte
    const kStirn = Math.round((0 - z0) / RASTER);
    for (let k = Math.max(0, kStirn); k <= Math.min(n - 1, k0); k++) {
      const a = k0 - k;
      if (a >= h.rad.length) continue;
      ringeSchneiden(st, k, -1, h.rad[a]);
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

// Gewinde (G76) im Zellenraster: je Durchgang schneidet das Profil der
// Platte (Flanken im halben Gewindewinkel ab der Spitze rt) eine Wendel mit
// der Steigung P. Eine Zelle bei Winkel θ liegt im Gang, dessen Mitte
// zc = zA − P·θ/2π + n·P ist; weggenommen wird, sobald die Platte zc
// erreicht hat. Gerechnet in Schritten von höchstens P/4.
function gewindeSchritt(lauf, s, i) {
  const vx = lauf.vox, p = s.punkte[i - s.von], g = p.gew;
  const vorher = s.punkte[i - s.von - 1];
  const letzter = !s.punkte[i - s.von + 1]?.gew || s.punkte[i - s.von + 1].gew !== g;
  if (!vorher || !vorher.gew || vorher.gew !== g) lauf.gewZ = g.zA;
  const zVon = lauf.gewZ ?? g.zA;
  if (!(g.P > 0) || (!letzter && Math.abs(p.z - zVon) < g.P / 4)) return;
  lauf.gewZ = p.z;
  const { h, z0, R, nz, nu, feld } = vx;
  if (!vx.spalten) {
    // alle Spalten im Rohteil einmal: Radius und Winkel
    const sp = [];
    for (let iu = 0; iu < nu; iu++) for (let iw = 0; iw < nu; iw++) {
      const uc = -R + (iu + 0.5) * h, wc = -R + (iw + 0.5) * h, r = Math.hypot(uc, wc);
      if (r <= R - 0.1) sp.push(iu * nu + iw, r, Math.atan2(wc, uc));
    }
    vx.spalten = Float64Array.from(sp);
  }
  const lo = Math.min(zVon, p.z), hi = Math.max(zVon, p.z) + (letzter ? 1e-6 : 0);
  const sp = vx.spalten, P = g.P;
  for (let k = 0; k < sp.length; k += 3) {
    const r = sp[k + 1];
    const tief = g.aussen ? r - g.rt : g.rt - r;
    if (tief < 0) continue;
    const hw = tief * g.tw + h * 0.35;
    const basis = g.zA - P * sp[k + 2] / (2 * Math.PI);
    let zc = basis + Math.ceil((lo - basis) / P) * P;
    for (; zc < hi; zc += P) {
      const a = Math.max(0, Math.floor((zc - hw - z0) / h)), b = Math.min(nz - 1, Math.floor((zc + hw - z0) / h));
      for (let iz = a; iz <= b; iz++) {
        const j = iz * nu * nu + sp[k];
        if (!feld[j]) { feld[j] = 1; vx.weg++; }
      }
    }
  }
}

// Stand des Materials nach den ersten n Bahnpunkten. Rechnet weiter, wo
// es zuletzt aufgehört hat; nur rückwärts fängt es von vorne an.
export function materialStand(sim, n, cache = new Map()) {
  const { A, W, vorne } = sim.roh;
  let lauf = cache.get("__lauf");
  if (!lauf || lauf.n > n) {
    const z0 = vorne - 1, zEnde = sim.zStange || sim.zMax, zellen = Math.ceil((zEnde - z0) / RASTER) + 1;
    const k1 = { z0, aussen: new Float32Array(zellen), innen: new Float32Array(zellen), ende: zEnde };
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
    for (let i = Math.max(s.von, lauf.n); i < bis; i++) punktAbtragen(lauf, st, s, i, h);
  }
  lauf.n = Math.max(lauf.n, n);
  return { k1: lauf.k1, k2: lauf.k2, vox: lauf.vox, n };
}

function punktAbtragen(lauf, st, s, i, h) {
  if (s.modus === "abstech") abstechen(st, s, s.punkte[i - s.von]);
  else if (s.modus === "c") voxelSchritt(lauf, s, i, h);
  else if (s.punkte[i - s.von].gew) { if (s.kanal === 1 && lauf.vox) gewindeSchritt(lauf, s, i); }
  else abtragen(st, s, s.punkte[i - s.von], h);
}

// Seit 1.718.0 (Patrick 23. November 2026: „du müsstest wissen, wo noch
// Rohmaterial vorhanden ist … manchmal fährt man anstelle von G0 mit G1,
// heisst aber nicht, dass dort bearbeitet wird“): rechnet das Material
// wie die 3D-Simulation durch und sagt je Bahnpunkt, ob er Material
// wegnimmt. true = schneidet, false = Luft, null = nicht bekannt (kein
// Werkzeug, Bohrer neben der Drehmitte, Gewinde ohne Raster): dort gilt
// weiter die alte Schätzung.
export function schnittJePunkt(sim) {
  const cache = new Map();
  materialStand(sim, 0, cache);
  const lauf = cache.get("__lauf");
  const aus = new Array(sim.gesamt || 0).fill(null);
  const summe = () => (lauf.k1.weg || 0) + (lauf.k2?.weg || 0) + (lauf.vox ? lauf.vox.weg * lauf.vox.h : 0);
  for (const s of sim.schritte) {
    if (s.kanal === 2 && !lauf.k2) lauf.k2 = rueckseite(lauf.k1, sim.roh.W);
    const st = s.kanal === 2 ? lauf.k2 : lauf.k1;
    const h = huelleVon(s, cache);
    lauf.letzt = null;
    let offen = [];
    for (let i = s.von; i < s.bis; i++) {
      const p = s.punkte[i - s.von];
      if (!p.vor) { aus[i] = false; offen = []; punktAbtragen(lauf, st, s, i, h); continue; }
      const bekannt = s.modus === "abstech" || (h && (s.modus === "c" || (s.modus === "dreh" && !p.gew) || (s.modus === "bohr" && !(p.r > 0.05))));
      if (!bekannt) { punktAbtragen(lauf, st, s, i, h); continue; }
      const vorher = summe(), letzt = lauf.letzt;
      punktAbtragen(lauf, st, s, i, h);
      // Raster: kurze Stücke rechnet es erst mit dem nächsten Punkt
      if (s.modus === "c" && lauf.letzt === letzt) { offen.push(i); continue; }
      const ja = summe() - vorher > 1e-4;
      aus[i] = ja;
      for (const j of offen) aus[j] = ja;
      offen = [];
    }
  }
  lauf.n = sim.gesamt || 0;
  return aus;
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
    if (k1.kernA) { kernVon(st); st.kernA[k] = k1.kernA[kk]; st.kernI[k] = k1.kernI[kk]; }
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
