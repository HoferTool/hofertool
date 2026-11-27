// =================================================================
//  GRIDFINITY: Boxen und Grundplatten als 3D-Netz (seit 1.895.0)
//  Wunsch Patrick 27. November 2026: „ein Tool, das Gridfinity als Basis
//  funktioniert“, Wahl „Boxen und Grundplatten“.
//  Masse nach der offenen Gridfinity-Norm (Raster 42 mm, Höhe 7 mm je
//  Einheit, Füsse 4.75 mm, Stapelrand 4.4 mm, Magnete 6.5 × 2.4 mm).
//  Jedes Teil ist ein geschlossener Körper; sie dürfen sich überlappen,
//  der Slicer vereinigt sie (so bleibt die Rechnung einfach und schnell).
//  Ohne three.js bis auf die Flächenzerlegung, damit der Prüfstand die
//  Masse direkt nachrechnen kann.
// =================================================================
import { ShapeUtils, Vector2 } from "three";

export const GF = {
  raster: 42,
  einheit: 7,
  spiel: 0.5,          // Box ist 0.5 mm kleiner als das Raster
  fussH: 4.75,
  // Fuss der Box von unten: [Höhe, Kantenlänge, Eckradius]
  fuss: [[0, 35.6, 0.8], [0.8, 37.2, 1.6], [2.6, 37.2, 1.6], [4.75, 41.5, 3.75]],
  boxR: 3.75,
  mag: { d: 6.5, t: 2.4, a: 13 },
  // Grundplatte: Einzug ab Rasterkante je Höhe unter der Oberkante
  platteR: 4,
};

// ---------- Netz mit gemeinsamen Punkten ----------
export function neuesNetz() {
  return { pos: [], tri: [], idx: new Map() };
}
function punkt(n, p) {
  const k = Math.round(p[0] * 1e4) + "," + Math.round(p[1] * 1e4) + "," + Math.round(p[2] * 1e4);
  let i = n.idx.get(k);
  if (i === undefined) { i = n.pos.length / 3; n.pos.push(p[0], p[1], p[2]); n.idx.set(k, i); }
  return i;
}
function dreieck(n, a, b, c) {
  const i = punkt(n, a), j = punkt(n, b), k = punkt(n, c);
  if (i === j || j === k || i === k) return;   // ausgeartete weglassen
  n.tri.push(i, j, k);
}

// Abgerundetes Rechteck, im Gegenuhrzeigersinn, immer gleich viele Punkte,
// damit Ringe verschiedener Grösse sich verbinden lassen.
const ECK = 6;
export function rring(cx, cy, w, h, r, z) {
  r = Math.max(0.2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  const ecken = [[cx + w / 2 - r, cy - h / 2 + r, -Math.PI / 2], [cx + w / 2 - r, cy + h / 2 - r, 0],
    [cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2], [cx - w / 2 + r, cy - h / 2 + r, Math.PI]];
  const p = [];
  for (const [x, y, a0] of ecken)
    for (let i = 0; i <= ECK; i++) {
      const a = a0 + (i / ECK) * Math.PI / 2;
      p.push([x + r * Math.cos(a), y + r * Math.sin(a), z]);
    }
  return p;
}
export function kreis(cx, cy, d, z, n = 24) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push([cx + d / 2 * Math.cos(a), cy + d / 2 * Math.sin(a), z]); }
  return p;
}
const aufZ = (ring, z) => ring.map((q) => [q[0], q[1], z]);

// Ringe der Reihe nach verbinden. Alle Ringe im Gegenuhrzeigersinn:
// aufwärts zeigt die Fläche nach aussen, abwärts nach innen. So ergibt
// ein Profil „aussen hoch, oben rüber, innen runter“ richtige Seiten.
export function verbinden(n, ringe, zu = false) {
  const m = ringe[0].length;
  const last = zu ? ringe.length : ringe.length - 1;
  for (let k = 0; k < last; k++) {
    const a = ringe[k], b = ringe[(k + 1) % ringe.length];
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      dreieck(n, a[i], a[j], b[j]);
      dreieck(n, a[i], b[j], b[i]);
    }
  }
}

// Ebene Fläche mit Löchern, nach oben (oben=true) oder unten zeigend
export function deckel(n, aussen, loecher = [], oben = true) {
  // Mit winzigem Zittern zerlegen: die Zerlegung lässt Punkte weg, die
  // genau auf einer Linie liegen, das gäbe offene Kanten (T-Stösse)
  let zz = 12345;
  const zit = () => { zz = (zz * 16807) % 2147483647; return (zz / 2147483647 - 0.5) * 2e-5; };
  const v = (r) => r.map((q) => new Vector2(q[0] + zit(), q[1] + zit()));
  const alle = [aussen, ...loecher].flat();
  const va = v(aussen), vl = loecher.map(v);
  const zw = [va, ...vl].flat();   // Richtung aus den gezitterten Punkten: flache Dreiecke bleiben stimmig
  const faces = ShapeUtils.triangulateShape(va, vl);
  for (const [a, b, c] of faces) {
    const A = alle[a], B = alle[b], C = alle[c];
    const f = (zw[b].x - zw[a].x) * (zw[c].y - zw[a].y) - (zw[b].y - zw[a].y) * (zw[c].x - zw[a].x);
    if ((f > 0) === oben) dreieck(n, A, B, C); else dreieck(n, A, C, B);
  }
}

// Quader von (x0,y0,z0) bis (x1,y1,z1)
function quader(n, x0, y0, z0, x1, y1, z1) {
  const r = (z) => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
  verbinden(n, [r(z0), r(z1)]);
  deckel(n, r(z0), [], false);
  deckel(n, r(z1), [], true);
}

// Gerades Prisma aus einem Umriss (x,y), Richtung wird selbst geprüft
function prisma(n, umr, z0, z1) {
  let f = 0;
  for (let i = 0; i < umr.length; i++) { const a = umr[i], b = umr[(i + 1) % umr.length]; f += a[0] * b[1] - b[0] * a[1]; }
  const u = f < 0 ? [...umr].reverse() : umr;
  const r = (z) => u.map((q) => [q[0], q[1], z]);
  verbinden(n, [r(z0), r(z1)]);
  deckel(n, r(z0), [], false);
  deckel(n, r(z1), [], true);
}

// Magnetlöcher: Wand zur Lochmitte, Boden des Lochs.
// richtung +1: Loch geht von z nach oben (Box-Fuss), −1: nach unten (Platte)
function magnetLoch(n, cx, cy, z, richtung, d = GF.mag.d, t = GF.mag.t) {
  const unten = kreis(cx, cy, d, richtung > 0 ? z : z - t), obenR = kreis(cx, cy, d, richtung > 0 ? z + t : z);
  verbinden(n, [obenR, unten]);                       // abwärts = nach innen
  if (richtung > 0) deckel(n, obenR, [], false); else deckel(n, unten, [], true);
}
const magnetPunkte = (cx, cy) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [cx + a * GF.mag.a, cy + b * GF.mag.a]);

// =================================================================
//  BOX
// =================================================================
export const BOX_VORGABE = { nx: 2, ny: 1, u: 3, wand: 1.2, boden: 1.2, fx: 2, fy: 1, rand: true, magnete: false, magD: 6.5, magH: 2.4 };

// Fächer-Elemente frei (seit 1.907.0, Patrick: „Wände für die Fächer wie
// bei Gridfinity mit Drag and Drop“, Bild mit „Hinzufügen: Wand, Leiste,
// Scoop“): jedes Element { typ: "wand" | "leiste" | "scoop", a, p, von,
// bis, s }. a "x" = an fester x-Stelle (läuft nach hinten), a "y" = an
// fester y-Stelle (läuft quer). p, von, bis als Anteil 0..1 der Innenmasse,
// damit die Aufteilung beim Ändern der Boxgrösse mitwächst. s (+1/−1) ist
// die Seite, auf der Leiste oder Scoop an ihrer Linie hängt.
export function elementeRaster(fx, fy, scoop = true) {
  const w = [];
  for (let k = 1; k < fx; k++) w.push({ typ: "wand", a: "x", p: k / fx, von: 0, bis: 1, s: 1 });
  for (let k = 1; k < fy; k++) w.push({ typ: "wand", a: "y", p: k / fy, von: 0, bis: 1, s: 1 });
  if (scoop) for (let k = 0; k < fy; k++) w.push({ typ: "scoop", a: "y", p: k / fy, von: 0, bis: 1, s: 1 });
  return w;
}
function elementePruefen(liste, fx, fy) {
  if (!Array.isArray(liste)) return elementeRaster(fx, fy);
  const z = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));
  return liste.slice(0, 80).filter((w) => w && (w.a === "x" || w.a === "y")).map((w) => {
    const typ = ["wand", "leiste", "scoop"].includes(w.typ) ? w.typ : "wand";
    let von = z(w.von, 0, 1), bis = z(w.bis, 0, 1);
    if (von > bis) [von, bis] = [bis, von];
    if (bis - von < 0.02) { bis = Math.min(1, von + 0.02); von = bis - 0.02; }
    // Wände nur innen, Leiste und Scoop dürfen an der Aussenwand hängen
    const p = typ === "wand" ? z(w.p, 0.005, 0.995) : z(w.p, 0, 1);
    return { typ, a: w.a, p, von, bis, s: w.s < 0 ? -1 : 1 };
  });
}

// Wo die Elemente in der Box liegen (für Anklicken und Ziehen in der
// Vorschau): Innenmasse und je Element ein Kasten in mm, Boxmitte = 0,
// Boden der Füsse = 0
export function elementeLage(eingabe) {
  const b = boxPruefen(eingabe);
  const { W, D, H } = boxMasse(b);
  const t = b.wand, tw = Math.max(0.8, t), iw = W - 2 * t, id = D - 2 * t;
  const boden = Math.min(GF.fussH + b.boden, H - 1), oben = b.rand ? H - 1 : H;
  const teile = b.elemente.map((w) => {
    const L = w.a === "x" ? id : iw, Q = w.a === "x" ? iw : id;
    const q = -Q / 2 + w.p * Q, u0 = -L / 2 + w.von * L, u1 = -L / 2 + w.bis * L;
    const breit = w.typ === "wand" ? tw / 2 : w.typ === "scoop" ? Math.min(20, (oben - boden) * 0.6) : 12;
    const v0 = w.typ === "wand" ? q - breit : w.s > 0 ? q : q - breit, v1 = w.typ === "wand" ? q + breit : w.s > 0 ? q + breit : q;
    const z0 = w.typ === "leiste" ? oben - 12 : boden, z1 = w.typ === "scoop" ? boden + breit : oben;
    return w.a === "x" ? { a: w.a, x0: v0, x1: v1, y0: u0, y1: u1, z0, z1 } : { a: w.a, x0: u0, x1: u1, y0: v0, y1: v1, z0, z1 };
  });
  return { iw, id, tw, boden, oben, teile, elemente: b.elemente };
}

export function boxPruefen(b) {
  const z = (v, min, max, std) => { v = Number(v); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : std; };
  return {
    nx: Math.round(z(b.nx, 1, 10, 2)), ny: Math.round(z(b.ny, 1, 10, 1)), u: Math.round(z(b.u, 1, 30, 3)),
    wand: z(b.wand, 0.8, 3, 1.2), boden: z(b.boden, 0.6, 5, 1.2),
    fx: Math.round(z(b.fx, 1, 20, 1)), fy: Math.round(z(b.fy, 1, 20, 1)),
    rand: !!b.rand, magnete: !!b.magnete, magD: z(b.magD, 3, 7, 6.5), magH: z(b.magH, 1, 4, 2.4),
    elemente: elementePruefen(b.elemente, Math.round(z(b.fx, 1, 20, 1)), Math.round(z(b.fy, 1, 20, 1))),
  };
}

export function boxMasse(b) {
  const W = b.nx * GF.raster - GF.spiel, D = b.ny * GF.raster - GF.spiel, H = b.u * GF.einheit;
  return { W, D, H, gesamt: H + (b.rand ? 3.9 : 0) };
}

export function boxNetz(eingabe) {
  const b = boxPruefen(eingabe);
  const n = neuesNetz();
  const { W, D, H } = boxMasse(b);
  const R = GF.boxR, t = b.wand;
  const boden = Math.min(GF.fussH + b.boden, H - 1);
  // Oberkante der Fächerwände: mit Stapelrand 1 mm tiefer,
  // sonst stossen die Füsse der oberen Box daran
  const oben = b.rand ? H - 1 : H;

  // Füsse, einer je Rasterfeld
  for (let i = 0; i < b.nx; i++) for (let j = 0; j < b.ny; j++) {
    const cx = (i - (b.nx - 1) / 2) * GF.raster, cy = (j - (b.ny - 1) / 2) * GF.raster;
    const ringe = GF.fuss.map(([h, s, r]) => rring(cx, cy, s, s, r, h));
    const top = GF.fuss[GF.fuss.length - 1];
    ringe.push(rring(cx, cy, top[1], top[1], top[2], GF.fussH + 0.3));   // in den Körper hinein
    verbinden(n, ringe);
    const loecher = b.magnete ? magnetPunkte(cx, cy).map(([x, y]) => kreis(x, y, b.magD, 0)) : [];
    deckel(n, ringe[0], loecher, false);
    deckel(n, ringe[ringe.length - 1], [], true);
    if (b.magnete) for (const [x, y] of magnetPunkte(cx, cy)) magnetLoch(n, x, y, 0, 1, b.magD, b.magH);
  }

  // Körper als Becher: aussen hoch, oben rüber, innen runter, Boden
  const innen = (z) => rring(0, 0, W - 2 * t, D - 2 * t, R - t, z);
  const aussen = (z) => rring(0, 0, W, D, R, z);
  // 0.05 mm unter der Fussoberkante, damit Fuss und Körper keine Kante teilen
  const becher = [aussen(GF.fussH - 0.05), aussen(H), innen(H), innen(boden)];
  verbinden(n, becher);
  deckel(n, becher[0], [], false);
  deckel(n, becher[3], [], true);

  // Elemente in örtlichen Koordinaten (u längs, v quer zur Linie, z):
  // a "y": x = u, y = v; a "x": x = v, y = u (spiegelt, darum Dreiecke
  // umdrehen); Seite s = −1 spiegelt v nochmals.
  const iw = W - 2 * t, id = D - 2 * t, tw = Math.max(0.8, t);
  const hoehe = oben - boden;
  const lage = (w) => {
    const L = w.a === "x" ? id : iw, Q = w.a === "x" ? iw : id;
    // ein Ende am Rand ragt 0.1 mm in die Aussenwand, eines im Innern um
    // eine halbe Wanddicke weiter (trifft die Querwand ganz)
    const ende = (u) => (u <= 0.001 || u >= 0.999 ? 0.1 : tw / 2);
    const q = -Q / 2 + w.p * Q;
    const innen = w.p > 0.001 && w.p < 0.999;
    return {
      L, Q, q, innen,
      a0: -L / 2 + w.von * L - ende(w.von), a1: -L / 2 + w.bis * L + ende(w.bis),
      // Fläche, an der Leiste oder Scoop hängt
      // innen: an der Wandfläche (0.05 hinein); aussen: 0.1 in die Aussenwand
      v0: innen ? q + w.s * (tw / 2 - 0.05) : q - w.s * 0.1,
    };
  };
  const zuXY = (w, u, v, z) => (w.a === "y" ? [u, v, z] : [v, u, z]);
  // Profil (v, z) im Gegenuhrzeigersinn für Seite +1, entlang u gezogen
  const ziehen = (w, prof, u0, u1) => {
    const kehr = (w.a === "x") !== (w.s < 0);
    const d3 = (A, B, C) => (kehr ? dreieck(n, A, C, B) : dreieck(n, A, B, C));
    const a = prof.map(([v, z]) => zuXY(w, u0, v, z)), e = prof.map(([v, z]) => zuXY(w, u1, v, z)), m = prof.length;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      d3(a[i], a[j], e[j]); d3(a[i], e[j], e[i]);
    }
    // Stirnseiten als Fächer vom ersten Punkt aus (Fläche ist von dort ganz sichtbar)
    for (let i = 1; i < m - 1; i++) { d3(a[0], a[i + 1], a[i]); d3(e[0], e[i], e[i + 1]); }
  };
  // freier Platz vor der Linie (bis zur nächsten parallelen Wand)
  const platz = (w) => {
    const { Q } = lage(w);
    const gegen = b.elemente.filter((o) => o.typ === "wand" && o.a === w.a && o.von < w.bis - 0.01 && o.bis > w.von + 0.01
      && (w.s > 0 ? o.p > w.p + 0.001 : o.p < w.p - 0.001)).map((o) => Math.abs(o.p - w.p));
    return Math.min(w.s > 0 ? 1 - w.p : w.p, ...gegen) * Q - (lage(w).innen ? tw / 2 : 0) - tw / 2;
  };
  // Gleiche Elemente an gleicher Stelle (z. B. Wand auf Wand gezogen)
  // zu einem zusammenfassen, sonst liegen Flächen doppelt aufeinander
  const zusammen = [];
  for (const w of b.elemente) {
    const g = zusammen.find((o) => o.typ === w.typ && o.a === w.a && o.s === w.s && Math.abs(o.p - w.p) < 1e-4 && o.von <= w.bis && w.von <= o.bis);
    if (g) { g.von = Math.min(g.von, w.von); g.bis = Math.max(g.bis, w.bis); } else zusammen.push({ ...w });
  }
  for (const w of zusammen) {
    const { q, a0, a1, v0 } = lage(w);
    const sv = (v) => v0 + w.s * v;   // v ab der Fläche in Richtung s
    if (w.typ === "wand") {
      if (w.a === "x") quader(n, q - tw / 2, a0, boden - 0.1, q + tw / 2, a1, oben);
      else quader(n, a0, q - tw / 2, boden - 0.1, a1, q + tw / 2, oben);
    } else if (w.typ === "scoop") {
      // Griffmulde (Gridfinity „scoop“): Hohlkehle vom Boden zur Wand
      const r = Math.min(20, hoehe * 0.6, platz(w) / 2);
      if (r < 3 || a1 - a0 < 5) continue;
      const zf = boden - 0.1, st = 12;
      const prof = [[0, zf], [r + 0.1, zf]];
      for (let i = 0; i <= st; i++) {
        const g = (i / st) * Math.PI / 2;
        prof.push([0.1 + r - r * Math.sin(g), zf + 0.1 + r - r * Math.cos(g)]);
      }
      prof.push([0, zf + r + 0.1]);
      ziehen(w, prof.map(([v, z]) => [sv(v), z]), a0, a1);
    } else {
      // Beschriftungsleiste: Dreieck oben an der Wand, unten 45°, druckt ohne Stützen
      const tief = Math.min(12, hoehe - 1, platz(w) - 2);
      if (tief < 4 || a1 - a0 < 5) continue;
      ziehen(w, [[0, oben], [0, oben - tief], [tief, oben]].map(([v, z]) => [sv(v), z]), a0, a1);
    }
  }

  // Stapelrand oben: Gegenstück zum Fuss, damit die nächste Box hält
  if (b.rand) {
    const stuetze = Math.max(0, 2.6 - t);
    const z0 = H - stuetze - 0.3;
    const ring = (e, z) => rring(0, 0, W - 2 * e, D - 2 * e, R - e, z);
    const profil = [ring(0, z0), ring(0, H + 3.9), ring(0.5, H + 3.9), ring(1.9, H + 2.5), ring(1.9, H + 0.7)];
    if (t < 2.6) profil.push(ring(2.6, H), ring(t, H - stuetze));
    profil.push(ring(t, z0));
    verbinden(n, profil, true);
  }
  return fertig(n, b);
}

// =================================================================
//  GRUNDPLATTE
//  Offener Rahmen (leicht). Mit Magneten (seit 1.899.0, Wunsch Patrick
//  27. November 2026 mit Bild) bleibt das Feld offen, in jeder Ecke sitzt
//  unten ein Sockel mit dem Loch, darüber 0.5 mm Luft, weil der Fuss der Box
//  etwas unter das Profil ragt.
//  „Anschliessbar“ (seit 1.900.0, nach Patricks STL aus dem Gridfinity-
//  Generator, „das anschliessbar sollte von gridfinity sein“): in der Mitte
//  jedes Randfelds fehlt auf 20 mm die Wand; unten bleibt eine 2 mm hohe
//  Schiene mit Hinterschnitt. Zwei Platten nebeneinander hält eine
//  Klammer (Λ-Form, 19.6 mm lang), die von oben über beide Schienen
//  schnappt. Masse genau aus der STL.
// =================================================================
export const PLATTE_VORGABE = { art: "felder", nx: 4, ny: 3, breite: 300, tiefe: 200, magnete: false, magD: 6.5, magH: 2.4, anschluss: false, distanz: false, distanzArt: "ecken", schenkel: 40 };

const BUCHT = 10;   // halbe Länge der Aussparung am Rand (20 mm)
// Schiene: [Höhe, Abstand der Innenkante vom Plattenrand]
const SCHIENE = [[0.7, 1.0], [1.1, 1.0], [1.5, 1.3], [2.0, 1.3]];

export function plattePruefen(p) {
  const z = (v, min, max, std) => { v = Number(v); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : std; };
  return {
    art: p.art === "schublade" ? "schublade" : "felder",
    nx: Math.round(z(p.nx, 1, 20, 4)), ny: Math.round(z(p.ny, 1, 20, 3)),
    breite: z(p.breite, 42, 1000, 300), tiefe: z(p.tiefe, 42, 1000, 200),
    magnete: !!p.magnete, magD: z(p.magD, 3, 7, 6.5), magH: z(p.magH, 1, 4, 2.4),
    anschluss: !!p.anschluss, distanz: !!p.distanz,
    distanzArt: p.distanzArt === "rand" ? "rand" : "ecken", schenkel: z(p.schenkel, 20, 400, 40),
  };
}

// Felder und Aussenmasse. Bei „Schublade“ füllt die Platte die Schublade
// (0.5 mm Luft), der Rest wird gleichmässig als Rand verteilt; dort geht
// „Anschliessbar“ nicht, weil der Rand zwischen den Platten läge.
export function platteMasse(p) {
  const zs = p.magnete ? p.magH + 0.6 : 0;
  const H = 4.4 + (zs > 0 ? zs + 0.5 : 0);
  if (p.art === "schublade") {
    const W = p.breite - 0.5, D = p.tiefe - 0.5;
    const nx = Math.max(1, Math.floor(W / GF.raster)), ny = Math.max(1, Math.floor(D / GF.raster));
    // Mit Distanzstücken (seit 1.901.0) hat die Platte keinen Rand, den
    // Rest füllen lose Leisten; dann geht auch „Anschliessbar“
    if (p.distanz) {
      const gx = Math.max(0, (W - nx * GF.raster) / 2), gy = Math.max(0, (D - ny * GF.raster) / 2);
      return { nx, ny, W: nx * GF.raster, D: ny * GF.raster, H, zs, anschluss: p.anschluss, gx, gy, innenB: W, innenT: D };
    }
    return { nx, ny, W: Math.max(W, nx * GF.raster), D: Math.max(D, ny * GF.raster), H, zs, anschluss: false };
  }
  return { nx: p.nx, ny: p.ny, W: p.nx * GF.raster, D: p.ny * GF.raster, H, zs, anschluss: p.anschluss };
}

// Einzug der Feldwand ab Feldrand je Höhe (Profil von unten nach oben)
function stufen(zs, zt) {
  const zb = zt - 4.4;
  return zs > 0
    ? [[0, 2.85], [zb, 2.85], [zb + 0.7, 2.15], [zt - 1.9, 2.15], [zt, 0.25]]
    : [[0, 2.85], [0.7, 2.15], [zt - 1.9, 2.15], [zt, 0.25]];
}
function einzugBei(L, z) {
  for (let i = 0; i < L.length - 1; i++) {
    const [z0, e0] = L[i], [z1, e1] = L[i + 1];
    if (z <= z1 + 1e-9) return z1 - z0 < 1e-9 ? e1 : e0 + (e1 - e0) * (z - z0) / (z1 - z0);
  }
  return L[L.length - 1][1];
}

const dreh = (cx, cy, q, x, y, z) => {
  const c = Math.round(Math.cos(q * Math.PI / 2)), s = Math.round(Math.sin(q * Math.PI / 2));
  return [cx + x * c - y * s, cy + x * s + y * c, z];
};
// Ecke k eines abgerundeten Rechtecks, genau wie in rring
function eckBogen(cx, cy, w, h, r, z, k) {
  r = Math.max(0.2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  const [x, y, a0] = [[cx + w / 2 - r, cy - h / 2 + r, -Math.PI / 2], [cx + w / 2 - r, cy + h / 2 - r, 0],
    [cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2], [cx - w / 2 + r, cy - h / 2 + r, Math.PI]][k];
  const p = [];
  for (let i = 0; i <= ECK; i++) { const a = a0 + (i / ECK) * Math.PI / 2; p.push([x + r * Math.cos(a), y + r * Math.sin(a), z]); }
  return p;
}
const ringPlain = (cx, cy, e, z) => rring(cx, cy, GF.raster - 2 * e, GF.raster - 2 * e, GF.platteR - e, z);

// Feld-Ring mit Bucht zur Schiene an den Randseiten (bd = Abstand der
// Buchtkante vom Feldrand). Seite k folgt auf Ecke k: rechts, oben, links, unten.
function ringBucht(cx, cy, e, z, rand, bd) {
  const s = GF.raster - 2 * e, p = [];
  for (let k = 0; k < 4; k++) {
    p.push(...eckBogen(cx, cy, s, s, GF.platteR - e, z, k));
    if (rand[k]) {
      const xr = GF.raster / 2 - e, xb = GF.raster / 2 - bd;
      p.push(dreh(cx, cy, k, xr, -BUCHT, z), dreh(cx, cy, k, xb, -BUCHT, z), dreh(cx, cy, k, xb, BUCHT, z), dreh(cx, cy, k, xr, BUCHT, z));
    }
  }
  return p;
}
// Feld-Ring mit Marken an den Buchten (Index von −BUCHT und +BUCHT je Seite)
function ringMarken(cx, cy, e, z, rand) {
  const s = GF.raster - 2 * e, p = [], m = {};
  for (let k = 0; k < 4; k++) {
    p.push(...eckBogen(cx, cy, s, s, GF.platteR - e, z, k));
    if (rand[k]) {
      m[k] = [p.length, p.length + 1];
      p.push(dreh(cx, cy, k, GF.raster / 2 - e, -BUCHT, z), dreh(cx, cy, k, GF.raster / 2 - e, BUCHT, z));
    }
  }
  return { p, m };
}
// Aussenrand eines Felds: an Plattenecken gerundet, zu Nachbarn 0.05 mm
// überlappend, an den Randseiten Marken für die Buchten
function feldAussen(cx, cy, z, rand, ecke) {
  const h = GF.raster / 2, ex = rand.map((r) => (r ? 0 : 0.05));
  const spitz = [[cx + h + ex[0], cy - h - ex[3]], [cx + h + ex[0], cy + h + ex[1]], [cx - h - ex[2], cy + h + ex[1]], [cx - h - ex[2], cy - h - ex[3]]];
  const p = [], m = {};
  for (let k = 0; k < 4; k++) {
    if (ecke[k]) p.push(...eckBogen(cx, cy, GF.raster, GF.raster, GF.platteR, z, k));
    else p.push([spitz[k][0], spitz[k][1], z]);
    if (rand[k]) {
      m[k] = [p.length, p.length + 1];
      p.push(dreh(cx, cy, k, h, -BUCHT, z), dreh(cx, cy, k, h, BUCHT, z));
    }
  }
  return { p, m };
}
// zyklisch vorwärts bzw. rückwärts von a bis b (beide inklusive)
function vor(arr, a, b) { const r = [], n = arr.length; for (let i = a; ; i = (i + 1) % n) { r.push(arr[i]); if (i === b) break; } return r; }
function zurueck(arr, a, b) { const r = [], n = arr.length; for (let i = a; ; i = (i - 1 + n) % n) { r.push(arr[i]); if (i === b) break; } return r; }

// Eck-Sockel mit Magnetloch als eigener Körper (ragt 0.05 mm in die Wand)
function sockel(n, cx, cy, q, zs, p) {
  const e = GF.raster / 2 - 2.85 + 0.05, a = GF.mag.a;
  const R = Math.min(p.magD / 2 + 1.6, e - a - 0.1), pc = a - R;
  const v = [[a, pc], [e, pc], [e, e], [pc, e], [pc, a]];
  for (let i = 1; i < 8; i++) { const w = Math.PI + (i / 8) * Math.PI / 2; v.push([a + R * Math.cos(w), a + R * Math.sin(w)]); }
  const form = (z) => v.map(([x, y]) => dreh(cx, cy, q, x, y, z));
  const m = dreh(cx, cy, q, a, a, zs);
  verbinden(n, [form(0), form(zs)]);
  deckel(n, form(0), [], false);
  deckel(n, form(zs), [kreis(m[0], m[1], p.magD, zs)], true);
  magnetLoch(n, m[0], m[1], zs, -1, p.magD, p.magH);
}

export function platteNetz(eingabe) {
  const p = plattePruefen(eingabe);
  const n = neuesNetz();
  const { nx, ny, W, D, H, zs, anschluss } = platteMasse(p);
  const zt = H, L = stufen(zs, zt);
  const aussen = (z) => rring(0, 0, W, D, GF.platteR, z);
  const felder = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const rand = [i === nx - 1, j === ny - 1, i === 0, j === 0];
    const ecke = [rand[0] && rand[3], rand[0] && rand[1], rand[2] && rand[1], rand[2] && rand[3]];
    felder.push({ x: (i - (nx - 1) / 2) * GF.raster, y: (j - (ny - 1) / 2) * GF.raster, rand, ecke });
  }

  if (!anschluss) {
    // Ein Körper: Rand, Deckel mit den Feldöffnungen, Felder als Trichter
    const hoehen = L.map(([z]) => z).reverse();
    const ringe = felder.map((f) => hoehen.map((z) => ringPlain(f.x, f.y, einzugBei(L, z), z)));
    verbinden(n, [aussen(0), aussen(zt)]);
    deckel(n, aussen(zt), ringe.map((r) => r[0]), true);
    for (const r of ringe) verbinden(n, r);
    deckel(n, aussen(0), ringe.map((r) => r[r.length - 1]), false);
  } else {
    // Unten (0 … 2 mm): ganze Platte, an den Randseiten die Schiene
    const unten = [[0, null], [0.7, null], ...SCHIENE];
    const loecher = felder.map((f) => {
      const randFeld = f.rand.some(Boolean);
      const st = randFeld ? unten : [[0, null], [0.7, null], [2.0, null]];
      return st.slice().reverse().map(([z, bd]) => {
        const e = einzugBei(L, z);
        return randFeld ? ringBucht(f.x, f.y, e, z, f.rand, bd === null ? e - 0.01 : bd) : ringPlain(f.x, f.y, e, z);
      });
    });
    verbinden(n, [aussen(0), aussen(2.0)]);
    deckel(n, aussen(2.0), loecher.map((r) => r[0]), true);
    for (const r of loecher) verbinden(n, r);
    deckel(n, aussen(0), loecher.map((r) => r[r.length - 1]), false);

    // Oben (ab 1.9 mm): je Feld ein Rahmen, an den Randseiten unterbrochen
    const z0 = 1.9;
    const hoehen = [z0, ...L.map(([z]) => z).filter((z) => z > z0 + 1e-6)];
    for (const f of felder) {
      const buchten = [0, 1, 2, 3].filter((k) => f.rand[k]);
      if (!buchten.length) {
        const Q = (z) => feldAussen(f.x, f.y, z, f.rand, f.ecke).p;
        const R = hoehen.map((z) => ringPlain(f.x, f.y, einzugBei(L, z), z)).reverse();
        verbinden(n, [Q(z0), Q(zt)]);
        verbinden(n, R);
        deckel(n, Q(zt), [R[0]], true);
        deckel(n, Q(z0), [R[R.length - 1]], false);
        continue;
      }
      buchten.forEach((i, t) => {
        const j = buchten[(t + 1) % buchten.length];
        const kontur = (z) => {
          const Q = feldAussen(f.x, f.y, z, f.rand, f.ecke), R = ringMarken(f.x, f.y, einzugBei(L, z), z, f.rand);
          return [...vor(Q.p, Q.m[i][1], Q.m[j][0]), ...zurueck(R.p, R.m[j][0], R.m[i][1])];
        };
        const K = hoehen.map(kontur);
        verbinden(n, K);
        deckel(n, K[0], [], false);
        deckel(n, K[K.length - 1], [], true);
      });
    }
  }
  if (p.magnete) for (const f of felder) for (let q = 0; q < 4; q++) sockel(n, f.x, f.y, q, zs, p);
  return fertig(n, { ...p, nx, ny, W, D, H });
}

// =================================================================
//  DISTANZSTÜCKE (seit 1.901.0, Wunsch Patrick 27. November 2026: „wenn
//  die Schublade nicht aufgeht, z.B. 430 × 309, noch Rändchen machen, damit
//  das System beim Auf- und Zumachen nicht herumgeworfen wird; sie sollen
//  als Distanz dienen und nicht angeschlossen sein“)
//  Lose Leisten so hoch wie die Platte: links und rechts über die ganze
//  Tiefe der Schublade, vorne und hinten zwischen diesen. Länger als
//  DRUCK_MAX wird in gleiche Stücke geteilt. Schmaler als 1 mm fällt weg.
// =================================================================
// Seit 1.902.0 einzelne Klötze statt langer Leisten (Patrick: „die
// Distanzhalter wird man so nicht drucken können, mach einzelne Elemente“):
// je Randfeld ein Klotz, 40 mm lang, mittig zum Feld, jeder ein eigenes Teil.
// Seit 1.903.0 nur noch Winkel an den vier Ecken (Patrick: „müssen nicht
// über die ganze Länge sein, es reicht an den Ecken“): jeder Winkel hat
// zwei Schenkel, 40 mm über die Plattenecke hinaus, so dick wie der Spalt.
// Ist ein Spalt unter 1 mm, bleibt nur der andere Schenkel.
// Seit 1.904.0 wählbar (Patrick: „Option ob ganzer Rand oder nur Ecken,
// die Randstücke dürfen länger sein als 40 mm, einfach so, dass es noch
// druckbar ist“): Schenkellänge einstellbar, begrenzt durch das Druckbett
// und die halbe Schubladenseite; „ganzer Rand“ füllt zwischen den Winkeln
// mit geraden Leisten, jede höchstens so lang, wie das Bett hergibt.
// Gibt { teile, schenkel, schenkelMax, leisteMax } zurück.
export function distanzPlan(eingabe, druckerId = "x1c") {
  const p = plattePruefen(eingabe);
  const m = platteMasse(p);
  const leer = { teile: [], schenkel: 0, schenkelMax: 0, leisteMax: 0 };
  if (p.art !== "schublade" || !p.distanz) return leer;
  // 0.2 mm Luft zwischen Teil und Platte, damit alles leicht hineingeht
  let gx = m.gx - 0.2, gy = m.gy - 0.2;
  if (gx < 1) gx = 0; if (gy < 1) gy = 0;
  if (!gx && !gy) return leer;
  const bett = DRUCKER[druckerId] || DRUCKER.x1c;
  const B = m.innenB / 2, T = m.innenT / 2;
  // Winkel muss aufs Bett passen (Rand 2 mm schon abgezogen) und darf die
  // Seitenmitte nicht erreichen, sonst stossen zwei Winkel zusammen
  const schenkelMax = Math.floor(Math.max(10, Math.min(
    Math.min(bett.a, bett.b) - Math.max(gx, gy),
    (gx ? T - gy : Infinity) - 1, (gy ? B - gx : Infinity) - 1)));
  const L = Math.min(p.schenkel, schenkelMax);
  const leisteMax = Math.floor(bett.a - 4);
  const spiegeln = (sx, sy, [a, b]) => [sx < 0 ? -B + a : B - a, sy < 0 ? -T + b : T - b];
  const rechteck = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const teile = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    // in der Ecke (-B, -T) gerechnet, dann gespiegelt
    // Ein Körper in L-Form (Slicer „in Objekte teilen“ trennt ihn nicht)
    const roh = gx && gy ? [[0, 0], [gx + L, 0], [gx + L, gy], [gx, gy], [gx, gy + L], [0, gy + L]]
      : gx ? rechteck(0, 0, gx, L) : rechteck(0, 0, L, gy);
    teile.push({ art: "winkel", umriss: roh.map((q) => spiegeln(sx, sy, q)), h: m.H });
  }
  if (p.distanzArt === "rand") {
    const luft = 0.5;
    // Leisten zwischen den Winkeln, gleich lang, je höchstens leisteMax
    const reihe = (von, bis, mache) => {
      const len = bis - von;
      if (len < 5) return;
      const k = Math.ceil((len + luft) / (leisteMax + luft)), l = (len - (k - 1) * luft) / k;
      for (let i = 0; i < k; i++) mache(von + i * (l + luft), von + i * (l + luft) + l, l);
    };
    if (gx) for (const sx of [-1, 1]) reihe(-T + gy + L + luft, T - gy - L - luft, (a, b, l) => {
      const x0 = sx < 0 ? -B : B - gx;
      teile.push({ art: "leiste", umriss: rechteck(x0, a, x0 + gx, b), h: m.H, lang: l, breit: gx });
    });
    if (gy) for (const sy of [-1, 1]) reihe(-B + gx + L + luft, B - gx - L - luft, (a, b, l) => {
      const y0 = sy < 0 ? -T : T - gy;
      teile.push({ art: "leiste", umriss: rechteck(a, y0, b, y0 + gy), h: m.H, lang: l, breit: gy });
    });
  }
  return { teile, schenkel: L, schenkelMax, leisteMax, gx, gy };
}
export function distanzTeile(eingabe, druckerId) { return distanzPlan(eingabe, druckerId).teile; }
const umriss = (s) => [Math.min(...s.umriss.map((q) => q[0])), Math.min(...s.umriss.map((q) => q[1])),
  Math.max(...s.umriss.map((q) => q[0])), Math.max(...s.umriss.map((q) => q[1]))];
// An ihrem Platz in der Schublade, als ein Netz (für die Vorschau)
// t (Aufteilung): Winkel rücken mit dem Stück daneben mit, wie in stueckeVorschau
export function distanzNetz(eingabe, t = null, druckerId) {
  const teile = distanzTeile(eingabe, druckerId);
  if (!teile.length) return null;
  const { nx, ny } = platteMasse(plattePruefen(eingabe));
  const verschub = (c, n, liste) => {
    if (!t) return 0;
    const feld = Math.min(n - 1, Math.max(0, Math.floor(c / GF.raster + n / 2)));
    let k = 0, summe = liste[0];
    while (feld >= summe) summe += liste[++k];
    return (k - (liste.length - 1) / 2) * STUECK_LUECKE;
  };
  const n = neuesNetz();
  for (const s of teile) {
    const [x0, y0, x1, y1] = umriss(s);
    const dx = verschub((x0 + x1) / 2, nx, t ? t.xs : []), dy = verschub((y0 + y1) / 2, ny, t ? t.ys : []);
    prisma(n, s.umriss.map((q) => [q[0] + dx, q[1] + dy]), 0, s.h);
  }
  return fertig(n, { distanz: true, anzahl: teile.length });
}
// Zum Drucken: jedes Teil ein eigenes Netz, Leisten längs gelegt, in
// Reihen so breit wie das Druckbett (5 mm Abstand)
export function distanzDruck(eingabe, druckerId) {
  const bett = DRUCKER[druckerId] || DRUCKER.x1c;
  let x = 0, y = 0, reiheT = 0;
  return distanzTeile(eingabe, druckerId).map((s) => {
    const [x0, y0, x1, y1] = umriss(s);
    const drehen = s.art === "leiste" && y1 - y0 > x1 - x0;
    const w = drehen ? y1 - y0 : x1 - x0, d = drehen ? x1 - x0 : y1 - y0;
    if (x > 0 && x + w > bett.a) { x = 0; y += reiheT + 5; reiheT = 0; }
    const n = neuesNetz();
    prisma(n, s.umriss.map((q) => {
      const a = [q[0] - x0, q[1] - y0], b = drehen ? [a[1], a[0]] : a;
      return [b[0] + x, b[1] + y];
    }), 0, s.h);
    x += w + 5; reiheT = Math.max(reiheT, d);
    return fertig(n, {});
  });
}

// =================================================================
//  AUFTEILEN NACH DRUCKER (seit 1.902.0, Wunsch Patrick 27. November 2026:
//  „zwei verschiedene Drucker, ein Projekt, das zu gross ist, bestmöglich
//  aufteilen; vom Druckbett nicht die ganze Fläche nutzbar“)
//  Nutzbare Fläche mit 2 mm Rand: X1 Carbon 256 × 256, vorne links
//  18 × 28 mm gesperrt (Messerhebel), also 252 × 224; H2D Pro mit einer
//  Düse 325 × 320, also 321 × 316. Die Platte wird in möglichst wenige,
//  möglichst gleich grosse Stücke geteilt; die Stücke bekommen die
//  Schienen von „Anschliessbar“ und werden mit Klammern verbunden.
// =================================================================
export const DRUCKER = {
  x1c: { name: "Bambu Lab X1 Carbon", a: 252, b: 224 },
  h2d: { name: "Bambu Lab H2D Pro", a: 321, b: 316 },
};
function verteilen(n, k) {
  const b = Math.floor(n / k), r = n % k;
  return Array.from({ length: k }, (_, i) => b + (i < r ? 1 : 0));
}
export function aufteilen(nx, ny, druckerId) {
  const d = DRUCKER[druckerId] || DRUCKER.x1c;
  const A = Math.floor(d.a / GF.raster), B = Math.floor(d.b / GF.raster);
  let best = null;
  for (const [ax, by] of [[A, B], [B, A]]) {
    const kx = Math.ceil(nx / ax), ky = Math.ceil(ny / by);
    const xs = verteilen(nx, kx), ys = verteilen(ny, ky);
    // weniger Stücke zuerst, dann gleichmässigere
    const wert = kx * ky * 1000 + (Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys));
    if (!best || wert < best.wert) best = { xs, ys, wert };
  }
  const stuecke = [];
  let x0 = 0;
  best.xs.forEach((a, i) => {
    let y0 = 0;
    best.ys.forEach((b, j) => { stuecke.push({ i, j, nx: a, ny: b, x0, y0 }); y0 += b; });
    x0 += a;
  });
  return { xs: best.xs, ys: best.ys, stuecke, geteilt: stuecke.length > 1 };
}
// Gleiche Stücke zusammengefasst: [{nx, ny, anzahl}]
export function stueckArten(t) {
  const g = new Map();
  for (const s of t.stuecke) { const k = Math.max(s.nx, s.ny) + "x" + Math.min(s.nx, s.ny); const e = g.get(k) || { nx: s.nx, ny: s.ny, anzahl: 0 }; e.anzahl++; g.set(k, e); }
  return [...g.values()];
}
// Alle Stücke an ihrem Platz, gut sichtbar auseinander gezogen (Vorschau)
export const STUECK_LUECKE = 10;
export function stueckeVorschau(eingabe, t) {
  const p = plattePruefen(eingabe);
  const { nx, ny } = platteMasse(p);
  const n = { pos: [], tri: [] };
  const cache = new Map();
  for (const s of t.stuecke) {
    const k = s.nx + "x" + s.ny;
    if (!cache.has(k)) cache.set(k, platteNetz({ ...p, art: "felder", nx: s.nx, ny: s.ny, anschluss: true }));
    const st = cache.get(k), off = n.pos.length / 3;
    const dx = (s.x0 + s.nx / 2 - nx / 2) * GF.raster + (s.i - (t.xs.length - 1) / 2) * STUECK_LUECKE;
    const dy = (s.y0 + s.ny / 2 - ny / 2) * GF.raster + (s.j - (t.ys.length - 1) / 2) * STUECK_LUECKE;
    for (let q = 0; q < st.pos.length; q += 3) n.pos.push(st.pos[q] + dx, st.pos[q + 1] + dy, st.pos[q + 2]);
    for (const v of st.tri) n.tri.push(v + off);
  }
  return fertig(n, {});
}

// Klammern: eine je Feld entlang des Stosses
export function verbinderJeKante(p) {
  const { nx, ny } = platteMasse(plattePruefen(p));
  return { breit: nx, tief: ny };
}

// Klammer im Querschnitt (Breite quer zum Stoss, Höhe), aus der STL des
// Gridfinity-Generators: Λ-Dach mit runder Spitze, zwei Beine mit Nase
// nach innen, die unter den Hinterschnitt der Schienen greift.
const KLAMMER = [[2.15, 0], [2.15, 1.65], [0.212, 3.588], [0.16, 3.63], [0.099, 3.659], [0.034, 3.674],
  [-0.034, 3.674], [-0.099, 3.659], [-0.16, 3.63], [-0.212, 3.588], [-2.15, 1.65], [-2.15, 0], [-1.05, 0],
  [-1.05, 0.25], [-1.45, 0.783], [-1.45, 1.35], [1.45, 1.35], [1.45, 0.783], [1.05, 0.25], [1.05, 0]];
export function verbinderNetz() {
  const n = neuesNetz();
  const form = (z) => KLAMMER.map(([x, y]) => [x, y, z]);
  verbinden(n, [form(0), form(19.6)]);
  deckel(n, form(0), [], false);
  deckel(n, form(19.6), [], true);
  return fertig(n, { verbinder: true });
}

// ---------- Abschluss ----------
function fertig(n, info) {
  const pos = new Float32Array(n.pos), tri = new Uint32Array(n.tri);
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3)
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
  return { pos, tri, min, max, info };
}

// Jede Kante muss genau zweimal vorkommen, einmal je Richtung
// (für den Prüfstand und als Sicherheit vor dem Export)
export function offeneKanten(netz) {
  const m = new Map();
  const t = netz.tri;
  for (let i = 0; i < t.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const a = t[i + k], b = t[i + (k + 1) % 3];
      const key = a + ">" + b;
      m.set(key, (m.get(key) || 0) + 1);
    }
  let fehler = 0;
  for (const [key, c] of m) {
    const [a, b] = key.split(">");
    if (c !== 1 || m.get(b + ">" + a) !== 1) fehler++;
  }
  return fehler;
}

// ---------- Export ----------
// Mehrere Netze zu einem (Teile bleiben getrennte Körper)
export function netzeVereinen(liste) {
  const n = { pos: [], tri: [] };
  for (const m of liste) {
    const off = n.pos.length / 3;
    for (const x of m.pos) n.pos.push(x);
    for (const v of m.tri) n.tri.push(v + off);
  }
  return fertig(n, {});
}
export function stlBinaer(netz, name = "gridfinity") {
  const { pos, tri } = netz;
  const anz = tri.length / 3;
  const buf = new ArrayBuffer(84 + anz * 50), dv = new DataView(buf);
  const kopf = ("HoferTool " + name).slice(0, 79);
  for (let i = 0; i < kopf.length; i++) dv.setUint8(i, kopf.charCodeAt(i) & 0x7f);
  dv.setUint32(80, anz, true);
  let o = 84;
  for (let f = 0; f < anz; f++) {
    const p = [0, 1, 2].map((k) => tri[f * 3 + k] * 3);
    const u = [0, 1, 2].map((k) => pos[p[1] + k] - pos[p[0] + k]);
    const v = [0, 1, 2].map((k) => pos[p[2] + k] - pos[p[0] + k]);
    let nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...nn) || 1; nn = nn.map((x) => x / l);
    for (const x of nn) { dv.setFloat32(o, x, true); o += 4; }
    for (const q of p) for (let k = 0; k < 3; k++) { dv.setFloat32(o, pos[q + k] - netz.min[k] * (k === 2 ? 1 : 0), true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}

export async function dreiMF(netz, name = "Gridfinity") {
  const { zipSync, strToU8 } = await import("fflate");
  // Mehrere Netze = mehrere Teile in einer Datei (Slicer zeigt sie einzeln)
  const liste = Array.isArray(netz) ? netz : [netz];
  const min = [0, 1, 2].map((k) => Math.min(...liste.map((m) => m.min[k])));
  const z = (x) => Number(x.toFixed(4));
  const objekte = liste.map((m, o) => {
    const v = [], t = [];
    for (let i = 0; i < m.pos.length; i += 3) v.push(`<vertex x="${z(m.pos[i] - min[0])}" y="${z(m.pos[i + 1] - min[1])}" z="${z(m.pos[i + 2] - min[2])}"/>`);
    for (let i = 0; i < m.tri.length; i += 3) t.push(`<triangle v1="${m.tri[i]}" v2="${m.tri[i + 1]}" v3="${m.tri[i + 2]}"/>`);
    return { id: o + 1, v: v.join(""), t: t.join("") };
  });
  const nameXml = String(name).replace(/[<>&"]/g, "");
  const modell = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="de-CH" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${nameXml}</metadata><metadata name="Application">HoferTool</metadata>
<resources>${objekte.map((o) => `<object id="${o.id}" type="model" name="${nameXml}${liste.length > 1 ? " " + o.id : ""}"><mesh><vertices>${o.v}</vertices><triangles>${o.t}</triangles></mesh></object>`).join("")}</resources>
<build>${objekte.map((o) => `<item objectid="${o.id}"/>`).join("")}</build></model>`;
  const typen = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  return zipSync({ "[Content_Types].xml": strToU8(typen), "_rels/.rels": strToU8(rels), "3D/3dmodel.model": strToU8(modell) });
}
