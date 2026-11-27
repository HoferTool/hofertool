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
//  27. November 2026 mit Bild: „die Magnetlöcher sollen so aussehen“)
//  bleibt das Feld offen, in jeder Ecke sitzt unten ein Sockel mit dem
//  Loch, darüber 0.5 mm Luft, weil der Fuss der Box etwas unter das
//  Profil ragt. „Anschliessbar“ schneidet unten an jedem Stoss zweier
//  Felder am Rand eine Schwalbenschwanz-Kerbe ein; zwei Platten hält ein
//  Verbinder (eigene Datei), der von unten in beide Kerben gesteckt wird.
// =================================================================
export const PLATTE_VORGABE = { art: "felder", nx: 4, ny: 3, breite: 300, tiefe: 200, magnete: false, magD: 6.5, magH: 2.4, anschluss: false };

// Kerbe: Breite an der Kante 2·a, innen 2·b, Tiefe d
const KERBE = { a: 3, b: 5, d: 5, spiel: 0.15 };
const SOCKEL_H = 3;     // Höhe unten, wenn nur anschliessbar

export function plattePruefen(p) {
  const z = (v, min, max, std) => { v = Number(v); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : std; };
  return {
    art: p.art === "schublade" ? "schublade" : "felder",
    nx: Math.round(z(p.nx, 1, 20, 4)), ny: Math.round(z(p.ny, 1, 20, 3)),
    breite: z(p.breite, 42, 1000, 300), tiefe: z(p.tiefe, 42, 1000, 200),
    magnete: !!p.magnete, magD: z(p.magD, 3, 7, 6.5), magH: z(p.magH, 1, 4, 2.4),
    anschluss: !!p.anschluss,
  };
}

// Höhe des Sockels unten (0 = kein Sockel, Feld bis unten offen)
function sockelHoehe(p) {
  return Math.max(p.anschluss ? SOCKEL_H : 0, p.magnete ? p.magH + 0.6 : 0);
}

// Felder und Aussenmasse. Bei „Schublade“ füllt die Platte die Schublade
// (0.5 mm Luft), der Rest wird gleichmässig als Rand verteilt.
export function platteMasse(p) {
  const zs = sockelHoehe(p);
  const H = 4.4 + (zs > 0 ? zs + 0.5 : 0);
  if (p.art === "schublade") {
    const W = p.breite - 0.5, D = p.tiefe - 0.5;
    const nx = Math.max(1, Math.floor(W / GF.raster)), ny = Math.max(1, Math.floor(D / GF.raster));
    return { nx, ny, W: Math.max(W, nx * GF.raster), D: Math.max(D, ny * GF.raster), H, zs };
  }
  return { nx: p.nx, ny: p.ny, W: p.nx * GF.raster, D: p.ny * GF.raster, H, zs };
}

// Öffnung eines Felds unten: das Feld (Einzug 2.85) ohne die vier
// Eck-Sockel, Sockel gerundet um das Magnetloch. Viertel q gehört zur Ecke
// (q + 1) % 4 von rring (q = 0: oben rechts).
function sockelMasse(magD) {
  const e = GF.raster / 2 - 2.85, a = GF.mag.a;
  const R = Math.min(magD / 2 + 1.6, e - a - 0.05);
  return { e, a, R, pc: a - R };
}
const dreh = (cx, cy, q, x, y, z) => {
  const c = Math.round(Math.cos(q * Math.PI / 2)), s = Math.round(Math.sin(q * Math.PI / 2));
  return [cx + x * c - y * s, cy + x * s + y * c, z];
};
function viertelInnen(cx, cy, magD, z, q) {
  const { e, a, R, pc } = sockelMasse(magD);
  const v = [[e, pc], [a, pc]];
  for (let i = 1; i < 8; i++) {
    const w = -Math.PI / 2 - (i / 8) * Math.PI / 2;
    v.push([a + R * Math.cos(w), a + R * Math.sin(w)]);
  }
  v.push([pc, a], [pc, e]);
  return v.map(([x, y]) => dreh(cx, cy, q, x, y, z));
}
function feldUnten(cx, cy, magD, z) {
  return [0, 1, 2, 3].flatMap((q) => viertelInnen(cx, cy, magD, z, q));
}
// Ecke k eines abgerundeten Rechtecks, genau wie in rring
function eckBogen(cx, cy, w, h, r, z, k) {
  r = Math.max(0.2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  const [x, y, a0] = [[cx + w / 2 - r, cy - h / 2 + r, -Math.PI / 2], [cx + w / 2 - r, cy + h / 2 - r, 0],
    [cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2], [cx - w / 2 + r, cy - h / 2 + r, Math.PI]][k];
  const p = [];
  for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * Math.PI / 2; p.push([x + r * Math.cos(a), y + r * Math.sin(a), z]); }
  return p;
}
// Feld-Ring mit Zusatzpunkten auf den Kanten bei ±pc, damit die Sockel
// ohne offene Kanten an den Ring anschliessen
function feldRingX(cx, cy, e, pc, z) {
  const s = GF.raster - 2 * e, r = GF.platteR - e, p = [];
  for (let k = 0; k < 4; k++) {
    p.push(...eckBogen(cx, cy, s, s, r, z, k));
    // Kante nach Ecke k, im Gegenuhrzeigersinn: −pc, dann +pc in Laufrichtung
    p.push(dreh(cx, cy, k, s / 2, -pc, z), dreh(cx, cy, k, s / 2, pc, z));
  }
  return p;
}
// Oberseite eines Eck-Sockels (Viertel q)
function sockelOben(cx, cy, magD, z, q) {
  const { e, pc } = sockelMasse(magD);
  const innen = viertelInnen(cx, cy, magD, z, q);
  const s = GF.raster - 2 * 2.85;
  return [dreh(cx, cy, q, e, pc, z), ...eckBogen(cx, cy, s, s, GF.platteR - 2.85, z, (q + 1) % 4),
    dreh(cx, cy, q, pc, e, z), ...innen.slice(1, -1).reverse()];
}

// Stösse der Felder am Rand: Lage entlang der Kante (Felder nebeneinander)
function stoesse(nx, ny) {
  const sx = [], sy = [];
  for (let i = 1; i < nx; i++) sx.push((i - nx / 2) * GF.raster);
  for (let j = 1; j < ny; j++) sy.push((j - ny / 2) * GF.raster);
  return { sx, sy };
}

// Umriss mit Kerben (kerben=true) oder nur mit den Punkten der Kerbenmündung
// (gleiche Punkte auf der Kante, damit die Flächen sauber anschliessen)
function umriss(W, D, z, st, kerben) {
  const r = GF.platteR, E = 6;
  const ecken = [[W / 2 - r, -D / 2 + r, -Math.PI / 2], [W / 2 - r, D / 2 - r, 0], [-W / 2 + r, D / 2 - r, Math.PI / 2], [-W / 2 + r, -D / 2 + r, Math.PI]];
  // Kanten nach den Ecken: rechts (+y), oben (−x), links (−y), unten (+x)
  const kanten = [
    { lage: st.sy, punkt: (s, t) => [W / 2 - t, s] },
    { lage: st.sx.map((x) => -x), punkt: (s, t) => [-s, D / 2 - t] },
    { lage: st.sy.map((y) => -y), punkt: (s, t) => [-W / 2 + t, -s] },
    { lage: st.sx, punkt: (s, t) => [s, -D / 2 + t] },
  ];
  const p = [];
  ecken.forEach(([x, y, a0], k) => {
    for (let i = 0; i <= E; i++) { const a = a0 + (i / E) * Math.PI / 2; p.push([x + r * Math.cos(a), y + r * Math.sin(a), z]); }
    const kt = kanten[k];
    for (const s of [...kt.lage].sort((u, v) => u - v)) {
      const { a, b, d } = KERBE;
      p.push([...kt.punkt(s - a, 0), z]);
      if (kerben) p.push([...kt.punkt(s - b, d), z], [...kt.punkt(s + b, d), z]);
      p.push([...kt.punkt(s + a, 0), z]);
    }
  });
  return { p, kerben: kanten.flatMap((kt) => kt.lage.map((s) => [[s - KERBE.a, 0], [s - KERBE.b, KERBE.d], [s + KERBE.b, KERBE.d], [s + KERBE.a, 0]].map(([u, t]) => [...kt.punkt(u, t), z]))) };
}

export function platteNetz(eingabe) {
  const p = plattePruefen(eingabe);
  const n = neuesNetz();
  const { nx, ny, W, D, H, zs } = platteMasse(p);
  const zt = H, zb = H - 4.4;           // Oberkante, unteres Ende des Profils
  const st = p.anschluss ? stoesse(nx, ny) : { sx: [], sy: [] };
  // Feld-Ringe von oben nach unten (abwärts = Fläche zeigt ins Feld).
  // Oben 0.25 mm eingezogen, sonst stossen Nachbarfelder mit Wandstärke 0
  // aneinander.
  const pcS = sockelMasse(p.magD).pc;
  const feldRinge = (cx, cy) => zs > 0
    ? [[0.25, zt], [2.15, zt - 1.9], [2.15, zt - 3.7], [2.85, zb], [2.85, zs]].map(([e, z]) => feldRingX(cx, cy, e, pcS, z))
    : [[0.25, zt], [2.15, zt - 1.9], [2.15, zt - 3.7], [2.85, zb]]
      .map(([e, z]) => rring(cx, cy, GF.raster - 2 * e, GF.raster - 2 * e, GF.platteR - e, z));
  const felder = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++)
    felder.push([(i - (nx - 1) / 2) * GF.raster, (j - (ny - 1) / 2) * GF.raster]);
  const ringe = felder.map(([x, y]) => feldRinge(x, y));

  if (zs > 0) {
    // Aussen: unten mit Kerben bis zur Sockelhöhe, darüber glatt
    const unten0 = umriss(W, D, 0, st, true), untenS = umriss(W, D, zs, st, true);
    const obenS = umriss(W, D, zs, st, false), obenT = umriss(W, D, zt, st, false);
    verbinden(n, [unten0.p, untenS.p]);
    verbinden(n, [obenS.p, obenT.p]);
    for (const k of untenS.kerben) deckel(n, k, [], false);
    deckel(n, obenT.p, ringe.map((r) => r[0]), true);
    const loecher = felder.map(([x, y]) => feldUnten(x, y, p.magD, 0));
    felder.forEach(([x, y], k) => {
      verbinden(n, ringe[k]);
      const offen = feldUnten(x, y, p.magD, zs);
      // Oberseite der Sockel, mit den Magnetlöchern (Viertel q ↔ Magnet q)
      for (let q = 0; q < 4; q++) {
        const m = dreh(x, y, q, GF.mag.a, GF.mag.a, zs);
        deckel(n, sockelOben(x, y, p.magD, zs, q), p.magnete ? [kreis(m[0], m[1], p.magD, zs)] : [], true);
        if (p.magnete) magnetLoch(n, m[0], m[1], zs, -1, p.magD, p.magH);
      }
      verbinden(n, [offen, loecher[k]]);
    });
    deckel(n, unten0.p, loecher, false);
  } else {
    const aussen = (z) => rring(0, 0, W, D, GF.platteR, z);
    verbinden(n, [aussen(0), aussen(zt)]);
    deckel(n, aussen(zt), ringe.map((r) => r[0]), true);
    for (const r of ringe) verbinden(n, r);
    deckel(n, aussen(0), ringe.map((r) => r[3]), false);
  }
  return fertig(n, { ...p, nx, ny, W, D, H });
}

// Anzahl Verbinder, um Platten gleicher Grösse aneinander zu reihen: je Stoss
export function verbinderJeKante(p) {
  const { nx, ny } = platteMasse(plattePruefen(p));
  return { breit: nx - 1, tief: ny - 1 };
}

// Verbinder: zwei Schwalbenschwänze Rücken an Rücken, etwas kleiner als
// die Kerben, flacher als der Sockel
export function verbinderNetz(eingabe) {
  const p = plattePruefen(eingabe);
  const { zs } = platteMasse({ ...p, anschluss: true });
  const n = neuesNetz();
  const { a, b, d, spiel: c } = KERBE;
  const h = Math.max(1.5, zs - 0.4);
  const form = (z) => [[-(b - c), -(d - c)], [b - c, -(d - c)], [a - c, 0], [b - c, d - c], [-(b - c), d - c], [-(a - c), 0]].map(([x, y]) => [x, y, z]);
  verbinden(n, [form(0), form(h)]);
  deckel(n, form(0), [], false);
  deckel(n, form(h), [], true);
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
