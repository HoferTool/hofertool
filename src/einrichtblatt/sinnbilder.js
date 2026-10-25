// =================================================================
//  SINNBILDER DER WERKZEUGE (Norm)
//  Ein einheitlicher Satz Zeichnungen für das Werkzeugfeld (Wunsch
//  Patrick, 25. Oktober 2026: „die Bilder aus allen EB auf der
//  Datenbank lesen und so zusammenfassen, dass wir eine Norm haben“).
//  Grundlage: 1'409 Excel-Einrichtblätter, darin 1'167 Werkzeugbilder
//  (ohne die Skizzenleiste der Star-Vorlage) mit 138 verschiedenen
//  Bildern, fast alle aus den SW-20-Blättern. Sie lassen sich auf die
//  Arten unten zurückführen; VORBILDER nennt je Art die Bilder aus den
//  Excel-Blättern (Anfang der SHA-1-Prüfsumme), damit das Einlesen das
//  passende Sinnbild setzen kann.
//
//  Regeln der Norm, so wie die Bilder in den Blättern meistens stehen:
//  Dreh- und Stechwerkzeuge senkrecht, Schneide oben links; Bohrer,
//  Bohrstangen und Fräser quer, Spitze links. Halter dunkelgrau,
//  Wendeplatten gold, Hartmetall und HSS hellgrau, eine Strichstärke.
// =================================================================

const L = 'stroke="#1d232a" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"';
const HALTER = 'fill="#4a5560" ' + L;      // Halter dunkelgrau
const HM = 'fill="#c9d0d7" ' + L;          // Hartmetall, HSS
const NUT = 'fill="#6b7682" stroke="#1d232a" stroke-width="1" stroke-linejoin="round"';
const PLATTE = 'fill="#f2c230" ' + L;      // Wendeplatte, beschichtet: gold
const LINIE = 'fill="none" stroke="#1d232a" stroke-width="1.2" stroke-linecap="round"';
const LOCH = 'fill="#fff" ' + L;

const HOCH = "0 0 60 90", QUER = "0 0 120 48";
const pt = (x, y) => x.toFixed(1) + " " + y.toFixed(1);
const poly = (punkte, art) => '<path d="M' + punkte.map(([x, y]) => pt(x, y)).join(" L") + ' Z" ' + art + "/>";
const kreis = (x, y, r, art) => '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '" ' + (art || LOCH) + "/>";
const svg = (box, inhalt, spiegel) => {
  const b = box.split(" ").map(Number);
  const g = spiegel ? '<g transform="translate(' + b[2] + ' 0) scale(-1 1)">' + inhalt + "</g>" : inhalt;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + box + '" preserveAspectRatio="xMidYMid meet">' + g + "</svg>";
};

// ---------- senkrecht, Schneide oben links ----------

// Klemmhalter für rhombische Platten: Schaft, oben rechts abgeschrägt
const drehHalter = poly([[12, 88], [48, 88], [48, 48], [34, 28], [12, 28]], HALTER);
// Rhombische Platte, Spitze oben links, lange Diagonale schräg in den Halter
function rhombus(winkel) {
  const tx = 10, ty = 3, lang = winkel > 45 ? 33 : 41;
  const w1 = Math.PI / 2, w2 = ((90 - winkel) * Math.PI) / 180;
  const p1 = [tx + lang * Math.cos(w1), ty + lang * Math.sin(w1)];
  const p3 = [tx + lang * Math.cos(w2), ty + lang * Math.sin(w2)];
  const p2 = [p1[0] + p3[0] - tx, p1[1] + p3[1] - ty];
  return poly([[tx, ty], p1, p2, p3], PLATTE) + kreis((tx + p2[0]) / 2, (ty + p2[1]) / 2, winkel > 45 ? 4.5 : 3.8);
}
// Gewindeplatte (Vollprofil, liegend, Grösse 16): Dreieck mit Loch, an
// jeder Ecke ein schmaler 60°-Zahn, die Schneide oben links
function gewindeplatte() {
  const m = [28, 30], R = 25;
  const ecke = (w) => [m[0] + R * Math.cos((w * Math.PI) / 180), m[1] + R * Math.sin((w * Math.PI) / 180)];
  const zw = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const e = [ecke(-130), ecke(-10), ecke(110)];
  const punkte = [];
  for (let i = 0; i < 3; i++) {
    const v = e[i], n = e[(i + 1) % 3];
    // Zahn an der Ecke: schmal herausstehend, dann Schulter, dann Kante
    const a = zw(v, n, 0.16), b = zw(v, n, 0.84);
    punkte.push(v, zw(a, m, 0.1), a, b, zw(b, m, 0.1));
  }
  return poly(punkte, PLATTE) + kreis(m[0], m[1], 6.5);
}
const gewinde = poly([[12, 88], [48, 88], [48, 46], [44, 30], [28, 22], [12, 26]], HALTER) + gewindeplatte();

// Abstechen: hoher schmaler Stechhalter, Platte mit schräger Schneide
const abstechen = poly([[24, 88], [46, 88], [46, 34], [24, 34]], HALTER)
  + poly([[14, 6], [24, 2], [24, 60], [14, 60]], PLATTE)
  + '<path ' + LINIE + ' d="M14 12 L24 8"/>'
  + poly([[24, 60], [24, 22], [34, 26], [34, 60]], HALTER);
// Einstechen, Vorstechen: gerade, schmalere Schneide mit Absatz
const einstechen = poly([[24, 88], [46, 88], [46, 34], [24, 34]], HALTER)
  + poly([[15, 3], [21, 3], [21, 12], [24, 15], [24, 60], [14, 60], [14, 15], [15, 12]], PLATTE)
  + poly([[24, 60], [24, 22], [34, 26], [34, 60]], HALTER);
// Kleinstdrehstahl aus Hartmetall (Utilis, Multiturn): schlanker Stab,
// oben die kleine Schneide nach links; für Drehen hinten, Kugel, Kanten
const kleinst = poly([[22, 88], [34, 88], [34, 20], [30, 10], [24, 4], [18, 8], [22, 14]], HM)
  + '<path ' + LINIE + ' d="M22 14 L28 18 L34 20"/>'
  + poly([[22, 88], [34, 88], [34, 58], [22, 58]], 'fill="#9aa4ae" ' + L);
// Formstahl, breit planen: breite HM-Schneide mit Radius links oben
const formstahl = poly([[16, 88], [44, 88], [44, 40], [16, 40]], HALTER)
  + '<path d="M12 40 V14 Q12 4 22 4 H36 V40 Z" ' + HM + "/>"
  + '<path ' + LINIE + ' d="M36 4 L44 12 V40"/>';
// Rändelstahl von oben: Gabel mit Rändelrad
function raendeln() {
  let muster = "";
  for (let y = -10; y < 46; y += 6) muster += '<path ' + LINIE + ' d="M16 ' + y + " L44 " + (y + 14) + " M16 " + (y + 14) + " L44 " + y + '"/>';
  return '<rect x="14" y="50" width="32" height="38" ' + HALTER + "/>"
    + poly([[8, 50], [8, 16], [14, 16], [14, 50]], HALTER) + poly([[46, 50], [46, 16], [52, 16], [52, 50]], HALTER)
    + '<rect x="15" y="5" width="30" height="40" rx="3" ' + PLATTE + "/>"
    + '<defs><clipPath id="sb-rr"><rect x="15" y="5" width="30" height="40" rx="3"/></clipPath></defs>'
    + '<g clip-path="url(#sb-rr)">' + muster + "</g>"
    + '<path stroke="#1d232a" stroke-width="3" stroke-linecap="round" d="M5 25 H55"/>';
}

// ---------- quer, Spitze links ----------

// Spiralbohrer: Schaft rechts, Spannuten, 118°-Spitze links
function bohrer() {
  let s = '<rect x="78" y="16" width="38" height="16" ' + HM + "/>"
    + '<path d="M78 16 H18 L6 24 L18 32 H78 Z" ' + HM + "/>";
  for (let x = 22; x < 72; x += 12)
    s += '<path d="M' + x + " 32 Q" + (x + 7) + " 24 " + (x + 10) + " 16 H" + (x + 15) + " Q" + (x + 12) + " 24 " + (x + 5) + ' 32 Z" ' + NUT + "/>";
  return s + '<path ' + LINIE + ' d="M18 16 L12 24 L18 32"/>';
}
// Zentrierbohrer: dick, kurz, gold beschichtet, 90°-Spitze, zweiseitig
const zentrieren = '<path d="M20 12 H100 V36 H20 Z" ' + PLATTE + "/>"
  + '<path d="M20 18 H12 L4 24 L12 30 H20 Z" ' + PLATTE + "/>"
  + '<path d="M100 18 H108 L116 24 L108 30 H100 Z" ' + PLATTE + "/>"
  + '<path d="M22 36 Q30 26 34 12 H42 Q38 26 30 36 Z" ' + NUT + "/>"
  + '<path d="M98 36 Q90 26 86 12 H78 Q82 26 90 36 Z" ' + NUT + "/>"
  + '<rect x="46" y="12" width="28" height="24" fill="#c9d0d7" stroke="#1d232a" stroke-width="1.4"/>';
// Senker, Fase innen und aussen (kb innen, ansenken, hintersenken)
const senken = '<rect x="44" y="16" width="72" height="16" ' + HM + "/>"
  + '<path d="M44 8 V40 H30 L14 24 L30 8 Z" ' + HM + "/>"
  + '<path ' + LINIE + ' d="M30 8 L30 40 M38 8 L38 40"/>';
// Bohrstange, Ausdrehen: Schaft rechts, dünner Hals, Schneide nach unten
const ausdrehen = '<rect x="64" y="12" width="52" height="24" ' + HM + "/>"
  + '<path ' + LINIE + ' d="M70 12 V36"/>'
  + '<path d="M64 18 H16 V30 H64 Z" ' + HM + "/>"
  + poly([[16, 18], [6, 18], [4, 36], [12, 36], [16, 30]], PLATTE);
// Einstechen innen, Freistich: Bohrstange mit rechteckiger Stechschneide
const einstechenInnen = '<rect x="64" y="12" width="52" height="24" ' + HM + "/>"
  + '<path ' + LINIE + ' d="M70 12 V36"/>'
  + '<path d="M64 18 H16 V30 H64 Z" ' + HM + "/>"
  + poly([[16, 18], [6, 18], [6, 40], [12, 40], [12, 30], [16, 30]], PLATTE);
// Schaftfräser und Kugelfräser: Schneidteil links, steile Schneiden
function fraeser(kugel) {
  const stirn = kugel ? "M60 10 H24 A14 14 0 0 0 24 38 H60 Z" : "M60 10 H8 V38 H60 Z";
  let s = '<rect x="60" y="14" width="56" height="20" ' + HM + "/>" + '<path d="' + stirn + '" fill="#8a96a2" ' + L + "/>";
  for (let x = kugel ? 26 : 14; x < 54; x += 8) s += '<path ' + LINIE + ' d="M' + (x + 8) + " 10 L" + x + ' 38"/>';
  return s;
}
// Gewindebohrer, -former: Gewindezähne oben und unten
function gewindebohrer() {
  const oben = [], unten = [];
  for (let x = 14; x < 66; x += 6) { oben.push([x, 15], [x + 3, 10]); unten.push([x, 33], [x + 3, 38]); }
  const umriss = [[6, 20], [10, 16]].concat(oben, [[66, 15], [66, 33]], unten.reverse(), [[10, 32], [6, 28]]);
  return '<rect x="66" y="15" width="42" height="18" ' + HM + "/>"
    + '<rect x="108" y="18" width="8" height="12" ' + HM + "/>"
    + poly(umriss, HM) + '<rect x="12" y="21" width="54" height="6" fill="#6b7682"/>';
}

// [Schlüssel, Name, Zeichnung, Wofür (Stichworte aus den Blättern)]
// Die *_l sind spiegelverkehrt für Werkzeuge, die rechts schneiden.
export const SINNBILDER = [
  ["drehen_v", "Drehen, V-Platte 35°", svg(HOCH, drehHalter + rhombus(35)), "Drehen, Planieren, Schlichten, Kopieren"],
  ["drehen_d", "Drehen, D-Platte 55°", svg(HOCH, drehHalter + rhombus(55)), "Schruppen, Drehen, Planen"],
  ["kleinst", "Kleinstdrehstahl (Utilis)", svg(HOCH, kleinst), "Drehen hinten, KB hinten, Kugel, Einstich klein"],
  ["abstechen", "Abstechen", svg(HOCH, abstechen), "Abstechen"],
  ["einstechen", "Einstechen, Vorstechen", svg(HOCH, einstechen), "Vorstechen, Einstich, Freistich aussen"],
  ["gewinde", "Gewinde drehen", svg(HOCH, gewinde), "Gewinde M…, G…"],
  ["formstahl", "Formstahl, breit planen", svg(HOCH, formstahl), "Planen/Drehen, alles drehen, Radius"],
  ["raendeln", "Rändeln", svg(HOCH, raendeln()), "Rändeln, Rändel fräsen"],
  ["bohren", "Bohren", svg(QUER, bohrer()), "Bohren, Querbohrung, Kernloch"],
  ["zentrieren", "Zentrieren", svg(QUER, zentrieren), "Zentrieren, vorzentrieren, anbohren"],
  ["senken", "Senken, Fase", svg(QUER, senken), "KB innen, ansenken, hintersenken"],
  ["ausdrehen", "Ausdrehen (Bohrstange)", svg(QUER, ausdrehen), "Ausdrehen, vordrehen innen"],
  ["einstechen_innen", "Einstechen innen", svg(QUER, einstechenInnen), "Einstich innen, Freistich innen"],
  ["gewindebohren", "Gewindebohren, -formen", svg(QUER, gewindebohrer()), "Gew. formen, Gewindebohren"],
  ["fraesen", "Fräsen", svg(QUER, fraeser(false)), "Fräsen, Schlitz, Fläche"],
  ["kugelfraeser", "Kugelfräsen", svg(QUER, fraeser(true)), "Fräsen Radius, Kugel"],
  ["drehen_v_l", "Drehen, V-Platte 35°, spiegelverkehrt", svg(HOCH, drehHalter + rhombus(35), true), ""],
  ["drehen_d_l", "Drehen, D-Platte 55°, spiegelverkehrt", svg(HOCH, drehHalter + rhombus(55), true), ""],
  ["kleinst_l", "Kleinstdrehstahl, spiegelverkehrt", svg(HOCH, kleinst, true), ""],
  ["abstechen_l", "Abstechen, spiegelverkehrt", svg(HOCH, abstechen, true), ""],
  ["einstechen_l", "Einstechen, spiegelverkehrt", svg(HOCH, einstechen, true), ""],
  ["gewinde_l", "Gewinde drehen, spiegelverkehrt", svg(HOCH, gewinde, true), ""],
];

// Bilder aus den Excel-Blättern → Sinnbild (Anfang der SHA-1-Prüfsumme der
// Bilddatei). Aus der Auswertung vom 25. Oktober 2026, die häufigsten.
export const VORBILDER = {
  drehen_v: ["d3d100777987", "ee8436033383", "a4d3897b582b", "372cebecb708", "b79221e0a58b"],
  drehen_d: ["3c60318f9014"],
  abstechen: ["bd3dded04cd0", "98306268aef8"],
  einstechen: ["1615364697d9", "c76a0c0c1a02", "41aecf96d117"],
  kleinst: ["28ecc6d2be5b", "d71bd69cbc33"],
  gewinde: ["6a6ab541a096", "8087b7b9fba1", "c66b1d385298"],
  gewindebohren: ["dfef81c56dd9"],
  formstahl: ["292c1ff0976d", "bb5e310b5833", "2bd86c362bfc", "471ed1a47583"],
  bohren: ["39056c4c55ef", "5018817543e7", "a2e3937ef05b", "65caf8547e75"],
  zentrieren: ["033cca77e1ad", "921ab185199c", "216199c82fcb", "3d36383f23a3", "2ca791d2d1b2"],
  senken: ["a84fd58cd4b9", "81db41685c9c"],
  ausdrehen: ["1f251a048d3e", "21bb5d07a32d", "6d8c926db2b7", "b2c4be6ecbb6"],
  einstechen_innen: ["c606919651e1"],
  raendeln: ["64b4b47296c6"],
};

const VON_BILD = Object.fromEntries(Object.entries(VORBILDER).flatMap(([k, l]) => l.map((h) => [h, k])));
// Welches Sinnbild ersetzt dieses Bild aus dem Excel? null, wenn keins
export async function sinnbildFuerBild(bytes) {
  try {
    const h = await crypto.subtle.digest("SHA-1", bytes);
    const hex = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
    return VON_BILD[hex] || null;
  } catch (f) { return null; }
}
