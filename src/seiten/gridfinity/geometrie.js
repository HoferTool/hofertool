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
export const BOX_VORGABE = { nx: 2, ny: 1, u: 3, wand: 1.2, boden: 1.2, fx: 2, fy: 1, rand: true, magnete: false, magD: 6.5, magH: 2.4, leiste: true, leisteB: 12 };

export function boxPruefen(b) {
  const z = (v, min, max, std) => { v = Number(v); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : std; };
  return {
    nx: Math.round(z(b.nx, 1, 10, 2)), ny: Math.round(z(b.ny, 1, 10, 1)), u: Math.round(z(b.u, 1, 30, 3)),
    wand: z(b.wand, 0.8, 3, 1.2), boden: z(b.boden, 0.6, 5, 1.2),
    fx: Math.round(z(b.fx, 1, 20, 1)), fy: Math.round(z(b.fy, 1, 20, 1)),
    rand: !!b.rand, magnete: !!b.magnete, magD: z(b.magD, 3, 7, 6.5), magH: z(b.magH, 1, 4, 2.4), leiste: !!b.leiste, leisteB: z(b.leisteB, 6, 30, 12),
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
  // Oberkante der Fächerwände und der Leiste: mit Stapelrand 1 mm tiefer,
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

  // Fächer: Trennwände von Wand zu Wand (ragen 0.1 mm in die Wand)
  const iw = W - 2 * t, id = D - 2 * t, tw = Math.max(0.8, t);
  for (let k = 1; k < b.fx; k++) {
    const x = -iw / 2 + (k * iw) / b.fx;
    quader(n, x - tw / 2, -id / 2 - 0.1, boden - 0.1, x + tw / 2, id / 2 + 0.1, oben);
  }
  for (let k = 1; k < b.fy; k++) {
    const y = -id / 2 + (k * id) / b.fy;
    quader(n, -iw / 2 - 0.1, y - tw / 2, boden - 0.1, iw / 2 + 0.1, y + tw / 2, oben);
  }

  // Beschriftungsleiste hinten in jeder Fächerreihe: Dreieck, unten 45°,
  // damit sie ohne Stützen druckt
  if (b.leiste) {
    const tief = Math.min(b.leisteB, id / b.fy - 2, oben - boden - 1);
    if (tief >= 4) for (let k = 1; k <= b.fy; k++) {
      const yb = -id / 2 + (k * id) / b.fy - (k < b.fy ? tw / 2 - 0.05 : -0.1);
      // Profil in (y, z), gegen den Uhrzeigersinn, entlang x gezogen
      const prof = [[yb - tief, oben], [yb, oben - tief], [yb, oben]];
      const ring = (x) => prof.map(([y, z]) => [x, y, z]);
      const x0 = -iw / 2 - 0.1, x1 = iw / 2 + 0.1;
      // Wände: Ringe von x0 nach x1 (Profil im Gegenuhrzeigersinn in y-z
      // zeigt mit +x nach aussen, gleich wie oben mit +z)
      const a = ring(x0), e = ring(x1);
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        dreieck(n, a[i], a[j], e[j]); dreieck(n, a[i], e[j], e[i]);
      }
      dreieck(n, a[0], a[2], a[1]);
      dreieck(n, e[0], e[1], e[2]);
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
export const PLATTE_VORGABE = { art: "felder", nx: 4, ny: 3, breite: 300, tiefe: 200, magnete: false, magD: 6.5, magH: 2.4, anschluss: false, distanz: false };

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
const DRUCK_MAX = 240;
export function distanzTeile(eingabe) {
  const p = plattePruefen(eingabe);
  const m = platteMasse(p);
  if (p.art !== "schublade" || !p.distanz) return [];
  const t = [];
  const teilen = (lang) => { const k = Math.max(1, Math.ceil(lang / DRUCK_MAX)); return Array.from({ length: k }, (_, i) => [i * lang / k, (i + 1) * lang / k]); };
  // 0.2 mm Luft zwischen Leiste und Platte, damit alles leicht hineingeht
  const gx = m.gx - 0.2, gy = m.gy - 0.2;
  if (gx >= 1) for (const sx of [-1, 1]) for (const [a, b] of teilen(m.innenT)) {
    const x0 = sx < 0 ? -m.innenB / 2 : m.innenB / 2 - gx;
    t.push({ x0, x1: x0 + gx, y0: -m.innenT / 2 + a, y1: -m.innenT / 2 + b, lang: b - a, breit: gx });
  }
  const links = gx >= 1 ? -m.innenB / 2 + gx : -m.innenB / 2, rechts = -links;
  if (gy >= 1) for (const sy of [-1, 1]) for (const [a, b] of teilen(rechts - links)) {
    const y0 = sy < 0 ? -m.innenT / 2 : m.innenT / 2 - gy;
    t.push({ x0: links + a, x1: links + b, y0, y1: y0 + gy, lang: b - a, breit: gy });
  }
  return t.map((s) => ({ ...s, h: m.H }));
}
// druck=true: alle Stücke flach nebeneinander zum Drucken, sonst an ihrem Platz in der Schublade
export function distanzNetz(eingabe, druck = true) {
  const teile = distanzTeile(eingabe);
  if (!teile.length) return null;
  const n = neuesNetz();
  let y = 0;
  for (const s of teile) {
    if (druck) { quader(n, 0, y, 0, s.lang, y + s.breit, s.h); y += s.breit + 5; }
    else quader(n, s.x0, s.y0, 0, s.x1, s.y1, s.h);
  }
  return fertig(n, { distanz: true, anzahl: teile.length });
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
  const { pos, tri, min } = netz;
  const v = [], t = [];
  const z = (x) => Number(x.toFixed(4));
  for (let i = 0; i < pos.length; i += 3) v.push(`<vertex x="${z(pos[i] - min[0])}" y="${z(pos[i + 1] - min[1])}" z="${z(pos[i + 2] - min[2])}"/>`);
  for (let i = 0; i < tri.length; i += 3) t.push(`<triangle v1="${tri[i]}" v2="${tri[i + 1]}" v3="${tri[i + 2]}"/>`);
  const nameXml = String(name).replace(/[<>&"]/g, "");
  const modell = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="de-CH" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${nameXml}</metadata><metadata name="Application">HoferTool</metadata>
<resources><object id="1" type="model" name="${nameXml}"><mesh><vertices>${v.join("")}</vertices><triangles>${t.join("")}</triangles></mesh></object></resources>
<build><item objectid="1"/></build></model>`;
  const typen = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  return zipSync({ "[Content_Types].xml": strToU8(typen), "_rels/.rels": strToU8(rels), "3D/3dmodel.model": strToU8(modell) });
}
