// =================================================================
//  ALPENKETTE AM EMPFANG
//  Schemenhaft die Aussicht von Lohn-Ammannsegg nach Süden (Wunsch
//  Patrick 27. Oktober 2026: „im Hintergrund schemenhaft unsere
//  Aussicht an die Alpenkette“), ganz unten hinter den Dokumenten, nur
//  mit den Wetter-Effekten. Von links (Osten) nach rechts (Westen):
//  Pilatus, Titlis, Sustenhorn, Wetterhorn, Schreckhorn, Finsteraarhorn,
//  Eiger, Mönch, Jungfrau, Blüemlisalp, Doldenhorn, Balmhorn,
//  Wildstrubel, Wildhorn, Diablerets; davor Niesen und Stockhorn, ganz
//  vorne die sanften Hügel des Bucheggbergs. Gezeichnet, kein Foto.
//
//  Seit 1.244.0 realistischer (Wunsch Patrick 28. Oktober 2026: „die
//  Berge etwas realistischer“): einmal Punkt für Punkt auf eine
//  Leinwand gemalt statt als glatte Flächen. Grate mit Zacken in jeder
//  Grösse (Mittelpunkt-Verschiebung), Fels mit senkrechten Rinnen aus
//  Rauschen, Licht von links (Morgensonne im Osten), so dass rechts
//  jedes Gipfels die Flanke im Schatten liegt, Schnee nur oben und in
//  Flecken, und Dunst gegen unten, weil die Kette rund 80 km weit weg
//  ist. Gemalt in halber Auflösung: es soll ja schemenhaft bleiben, und
//  der Bildschirm am Empfang ist kein schneller Rechner.
// =================================================================

import { useEffect, useRef } from "react";

// [Lage 0…1 von links, Höhe 0…1] je Gipfel und Sattel
const HOCHALPEN = [
  [0, 0.18], [0.04, 0.3], [0.07, 0.46], [0.095, 0.36], [0.13, 0.55], [0.15, 0.68], [0.17, 0.52], [0.2, 0.63],
  [0.225, 0.58], [0.25, 0.66], [0.28, 0.6], [0.31, 0.78], [0.33, 0.7], [0.355, 0.9], [0.37, 0.8], [0.385, 0.97],
  [0.4, 0.82], [0.42, 0.93], [0.435, 0.84], [0.45, 0.98], [0.465, 0.86], [0.49, 1], [0.51, 0.84], [0.535, 0.76],
  [0.56, 0.86], [0.58, 0.8], [0.6, 0.85], [0.625, 0.74], [0.65, 0.84], [0.675, 0.72], [0.7, 0.66], [0.73, 0.73],
  [0.76, 0.62], [0.8, 0.7], [0.83, 0.58], [0.87, 0.66], [0.9, 0.52], [0.94, 0.48], [0.97, 0.36], [1, 0.28],
];
// Niesen als spitze Pyramide (0.6), daneben das Stockhorn mit seiner Kante
const VORALPEN = [
  [0, 0.12], [0.06, 0.2], [0.1, 0.16], [0.18, 0.24], [0.26, 0.2], [0.34, 0.27], [0.42, 0.22], [0.5, 0.26],
  [0.56, 0.3], [0.6, 0.5], [0.635, 0.3], [0.66, 0.36], [0.68, 0.42], [0.7, 0.34], [0.76, 0.3], [0.84, 0.26],
  [0.92, 0.22], [1, 0.16],
];

// Immer gleicher Zufall, damit die Berge bei jedem Laden gleich aussehen
function zufallMit(saat) {
  let s = saat;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// Feiner Grat: zwischen zwei Stützpunkten wird immer wieder die Mitte
// etwas verschoben, je kürzer das Stück, desto weniger. So entstehen
// grosse Schultern und kleine Zacken zugleich wie bei echtem Fels.
function kamm(anker, stufen, rauh, saat) {
  const zufall = zufallMit(saat);
  const aus = [anker[0]];
  for (let i = 0; i < anker.length - 1; i++) {
    let teil = [anker[i], anker[i + 1]];
    for (let s = 0; s < stufen; s++) {
      const neu = [teil[0]];
      for (let j = 0; j < teil.length - 1; j++) {
        const [x0, y0] = teil[j], [x1, y1] = teil[j + 1];
        const breite = x1 - x0;
        neu.push([(x0 + x1) / 2 + (zufall() - 0.5) * breite * 0.3, (y0 + y1) / 2 + (zufall() - 0.5) * breite * rauh], teil[j + 1]);
      }
      teil = neu;
    }
    aus.push(...teil.slice(1));
  }
  return aus;
}

// Rauschen in 2D: Zufallswert je Gitterpunkt, weich dazwischen
function hash(i, j) {
  let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function rausch(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// Grate und Rinnen: „gefaltetes“ Rauschen in mehreren Grössen
function fels(x, y) {
  let summe = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) {
    summe += (1 - Math.abs(rausch(x * f, y * f) * 2 - 1)) * amp;
    amp *= 0.5; f *= 2.03;
  }
  return summe;
}

// Gratlinie je Spalte aus den Stützpunkten (Bildpunkte von oben)
function linie(punkte, w, hh, unten) {
  const y = new Float32Array(w + 1);
  let k = 0;
  for (let x = 0; x <= w; x++) {
    const fx = x / w;
    while (k < punkte.length - 2 && punkte[k + 1][0] < fx) k++;
    const [x0, y0] = punkte[k], [x1, y1] = punkte[k + 1];
    const t = x1 > x0 ? Math.min(1, Math.max(0, (fx - x0) / (x1 - x0))) : 0;
    y[x] = unten - (y0 + (y1 - y0) * t) * hh;
  }
  return y;
}

const mix = (a, b, t) => a + (b - a) * t;
const klemm = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function malen(cv, w, h) {
  const g = cv.getContext("2d");
  if (!g) return;
  const bild = g.createImageData(w, h);
  const px = bild.data;
  const hhH = h * 0.72, untenH = h * 0.86;
  const hoch = linie(kamm(HOCHALPEN, 6, 1.6, 11), w, hhH, untenH);
  const vor = linie(kamm(VORALPEN, 5, 0.9, 23), w, h * 0.72, h * 0.93);
  const huegel = new Float32Array(w + 1);
  for (let x = 0; x <= w; x++) {
    const f = x / w;
    huegel[x] = h * (0.9 - 0.035 * Math.sin(f * 5.2 + 0.6) - 0.02 * Math.sin(f * 11.3 + 2) - 0.008 * Math.sin(f * 31));
  }
  // Neigung des Grats über ein Fenster: weiter unten zählt die grosse
  // Form des Bergs, oben die einzelne Zacke
  const neigung = (y, x, k) => (y[Math.min(w, x + k)] - y[Math.max(0, x - k)]) / (2 * k);
  const DUNST = [238, 241, 245];
  const s = 1 / (w / 960); // Rauschen gleich gross, egal wie breit gemalt wird

  // Farbe je Ebene an einem Punkt; ganz vorne die Hügel
  const farbeHuegel = (x, y) => {
    const n = rausch(x * 0.02 * s, y * 0.05 * s);
    const d = klemm(0.25 + (h - y) / h * 0.4);
    return [mix(168 + n * 10, DUNST[0], d), mix(184 + n * 10, DUNST[1], d), mix(164 + n * 8, DUNST[2], d)];
  };
  // Voralpen (Niesen, Stockhorn): Wald und Fels, ohne Schnee
  const farbeVor = (x, y) => {
    const tief = (y - vor[x]) / (h * 0.3);
    const k = 3 + Math.round(tief * 40);
    const licht = klemm(0.55 - neigung(vor, x, k) * 1.6 * (1 - klemm(tief)) + (fels(x * 0.05 * s, y * 0.03 * s) - 0.45) * 0.6);
    const d = klemm(0.2 + tief * 0.75, 0, 0.82);
    return [mix(mix(88, 140, licht), DUNST[0], d), mix(mix(104, 156, licht), DUNST[1], d), mix(mix(104, 150, licht), DUNST[2], d)];
  };
  // Hochalpen: Fels mit Rinnen, Schnee oben, Schatten rechts der Gipfel
  const farbeHoch = (x, y) => {
    const tief = (y - hoch[x]) / hhH;
    const hoehe = (untenH - y) / hhH;
    const k = 2 + Math.round(tief * 70);
    const n = fels(x * 0.05 * s, y * 0.035 * s);
    const nl = fels((x - 1) * 0.05 * s, y * 0.035 * s);
    const flanke = neigung(hoch, x, k) * 1.4 * (1 - klemm(tief * 1.6));
    const licht = klemm(0.62 - flanke + (n - nl) * 3 + (n - 0.5) * 0.25);
    const grenze = 0.5 + (rausch(x * 0.012 * s, 3.7) - 0.5) * 0.18;
    const flecken = fels(x * 0.04 * s, y * 0.045 * s);
    const schnee = klemm((hoehe - grenze) * 6 + (flecken - 0.55) * 2.6 - tief * 1.4);
    const fr = mix(88, 158, licht), fg = mix(98, 166, licht), fb = mix(116, 178, licht);
    const sr = mix(170, 252, licht), sg = mix(186, 253, licht), sb = mix(208, 255, licht);
    const d = klemm(0.08 + tief * 1.1, 0, 0.9);
    return [mix(mix(fr, sr, schnee), DUNST[0], d), mix(mix(fg, sg, schnee), DUNST[1], d), mix(mix(fb, sb, schnee), DUNST[2], d)];
  };
  const EBENEN = [[huegel, farbeHuegel], [vor, farbeVor], [hoch, farbeHoch]];

  for (let x = 0; x < w; x++) {
    for (let y = Math.floor(hoch[x]); y < h; y++) {
      // vorderste Ebene, die diesen Punkt deckt; am Rand halb gedeckt
      // mit der Ebene dahinter gemischt, damit keine Treppen entstehen
      let e = 0;
      while (e < EBENEN.length && y + 1 <= EBENEN[e][0][x]) e++;
      if (e >= EBENEN.length) continue;
      let c = EBENEN[e][1](x, y);
      let deck = klemm(y + 1 - EBENEN[e][0][x]);
      if (deck < 1 && e + 1 < EBENEN.length && y + 1 > EBENEN[e + 1][0][x]) {
        const hinten = EBENEN[e + 1][1](x, y);
        c = [mix(hinten[0], c[0], deck), mix(hinten[1], c[1], deck), mix(hinten[2], c[2], deck)];
        deck = klemm(y + 1 - EBENEN[e + 1][0][x]);
      }
      const i = (y * w + x) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = deck * 255;
    }
  }
  g.putImageData(bild, 0, 0);
}

export default function Alpen({ breite, hoehe, oben }) {
  // Die Kette steht unten auf der Tafel, etwa die halbe Höhe unter dem Kopf
  const h = Math.round((hoehe - oben) * 0.5);
  const ref = useRef(null);
  const w = Math.round(breite / 2), hh = Math.round(h / 2);
  useEffect(() => { if (ref.current) malen(ref.current, w, hh); }, [w, hh]);
  return (
    <canvas ref={ref} className="ib-alpen" data-ib="alpen" width={w} height={hh}
      style={{ top: hoehe - h, width: breite, height: h }} aria-hidden="true" />
  );
}
