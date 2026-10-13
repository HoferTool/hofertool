// =================================================================
//  BILDER-BIBLIOTHEK DER WERKZEUGE
//  Einfache, scharfe Zeichnungen statt der verpixelten Fotos aus den
//  Excel-Blättern (Wunsch Patrick, 13. Oktober 2026: „will nicht die
//  verpixelten Bilder, sondern dass du sie so einfach wie möglich
//  nachzeichnest“). Gezeichnet so, wie sie auf dem Blatt stehen: Dreh-
//  und Stechwerkzeuge senkrecht mit der Schneide oben, bohrartige quer
//  mit der Spitze nach rechts. Halter grau, Platten gelb. In der
//  Auswahl ohne Beschriftung, nur das Bild.
//
//  Dazu eigene Bilder, die man in der App hochlädt (Tabelle eb_bilder,
//  Schlüssel „eigen:<id>“).
//
//  Das Bild hängt am Artikel (Tabelle artikel_bild): wer einem Artikel
//  einmal ein Bild gibt, bei dem kommt es auf jedem Blatt und jedem Typ
//  von selbst. Ohne Artikel merkt sich der Platz sein Bild selbst, und
//  ohne beides schlägt die App eines nach der Tätigkeit vor.
// =================================================================

const L = 'stroke="#222" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"';
const HALTER = 'fill="#9aa3ad" ' + L;      // Halter grau
const DUNKEL = 'fill="#6f7883" ' + L;      // Grundkörper Stechhalter
const HELL = 'fill="#dfe3e8" ' + L;        // HSS, Hartmetall: hellgrau
const NUT = 'fill="#5d656e" stroke="#222" stroke-width="1" stroke-linejoin="round"';  // Spannuten
const PLATTE = 'fill="#f2c230" ' + L;      // Wendeplatte gelb
const LINIE = 'fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round"';
const LOCH = 'fill="#fff" ' + L;

const HOCH = "0 0 60 120", QUER = "0 0 120 60", RUND = "0 0 60 60";
const svg = (box, inhalt, spiegel) => {
  const b = box.split(" ").map(Number);
  const g = spiegel ? '<g transform="translate(' + b[2] + ' 0) scale(-1 1)">' + inhalt + "</g>" : inhalt;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + box + '" preserveAspectRatio="xMidYMid meet">' + g + "</svg>";
};
const pt = (x, y) => x.toFixed(1) + " " + y.toFixed(1);
const poly = (punkte, art) => '<path d="M' + punkte.map(([x, y]) => pt(x, y)).join(" L") + ' Z" ' + art + "/>";

// Drehstahl wie das Bild von Patrick: nur der Kopf mit wenig Halter
// (Wunsch 13. Oktober 2026: „weniger Halter“). Einstellwinkel 93° „so
// mässig normal“: die Hauptschneide läuft fast senkrecht am Halter
// herunter, 3° frei, die Spitze links oben.
const KURZ = "0 0 60 72";
const halterKopf = poly([[18, 71], [46, 71], [46, 32], [38, 12], [21, 7], [13, 38], [18, 46]], HALTER);
const loch = (l) => '<circle cx="' + l[0].toFixed(1) + '" cy="' + l[1].toFixed(1) + '" r="' + l[2] + '" ' + LOCH + "/>";
// Rhombische Platte: winkel 55 (D) oder 35 (V)
function rhombus(winkel) {
  const tx = 9, ty = 6, lang = winkel > 45 ? 24 : 27;
  const w1 = (87 * Math.PI) / 180, w2 = ((87 - winkel) * Math.PI) / 180;
  const p1 = [tx + lang * Math.cos(w1), ty + lang * Math.sin(w1)];
  const p3 = [tx + lang * Math.cos(w2), ty + lang * Math.sin(w2)];
  const p2 = [p1[0] + p3[0] - tx, p1[1] + p3[1] - ty];
  return poly([[tx, ty], p1, p2, p3], PLATTE) + loch([(tx + p2[0]) / 2, (ty + p2[1]) / 2, winkel > 45 ? 3.4 : 2.6]);
}
const drehstahl = (winkel) => halterKopf + rhombus(winkel);
// Gewinde: liegende Vollprofilplatte 16 mit drei Schneidecken, jede
// Ecke ein 60°-Profil mit gerundeter Kuppe (Wunsch 13. Oktober 2026).
function gewindeplatte() {
  const m = [27, 25], r = 14;
  let d = "";
  for (let i = 0; i < 3; i++) {
    const w = ((-125 + i * 120) * Math.PI) / 180;      // erste Ecke zeigt nach links oben
    const ecke = (dw, rr) => pt(m[0] + rr * Math.cos(w + dw), m[1] + rr * Math.sin(w + dw));
    d += (i ? " L" : "M") + ecke(-0.5, r * 0.62) + " L" + ecke(-0.2, r * 0.82) + " L" + ecke(0, r * 1.3)
      + " L" + ecke(0.2, r * 0.82) + " L" + ecke(0.5, r * 0.62);
  }
  return '<path d="' + d + ' Z" ' + PLATTE + "/>" + loch([m[0], m[1], 3.2]);
}
const gewindestahl = halterKopf + gewindeplatte();

// Bohrer quer, Spitze rechts: schlank, gebogene Spannuten und deutliche
// 118°-Spitze mit Schneidkanten, damit er nicht wie ein Fräser aussieht
function bohrer(flach) {
  let s = '<rect x="3" y="22" width="40" height="16" ' + HELL + "/>"
    + '<path d="M43 22 H101 ' + (flach ? "V38" : "L113 30 L101 38") + ' H43 Z" ' + HELL + "/>";
  for (let x = 46; x < 90; x += 12)
    s += '<path d="M' + x + " 38 Q" + (x + 7) + " 30 " + (x + 10) + " 22 H" + (x + 15) + " Q" + (x + 12) + " 30 " + (x + 5) + ' 38 Z" ' + NUT + "/>";
  if (!flach) s += '<path ' + LINIE + ' d="M101 22 L107 30 L101 38"/>';
  return s;
}
// Zentrier- und Anbohrer: kurzer dicker Körper mit 90°-Spitze
const zentrierer = '<rect x="3" y="15" width="78" height="30" ' + HELL + "/>"
  + '<path d="M81 15 L96 30 L81 45 Z" ' + HELL + "/>"
  + poly([[62, 45], [70, 45], [88, 22], [81, 15], [78, 15]], NUT);
// Gewindebohrer und -former: Gewinde als Zähne oben und unten
function gewindebohrer() {
  const oben = [], unten = [];
  for (let x = 50; x < 104; x += 6) { oben.push([x, 20], [x + 3, 15]); unten.push([x, 40], [x + 3, 45]); }
  const umriss = oben.concat([[104, 20], [110, 23], [113, 30], [110, 37], [104, 40]], unten.reverse());
  return '<rect x="3" y="24" width="8" height="12" ' + HELL + "/>"
    + '<rect x="11" y="21" width="39" height="18" ' + HELL + "/>"
    + poly(umriss, HELL)
    + '<rect x="50" y="27" width="56" height="6" fill="#5d656e"/>';
}
// Schaftfräser: dick, kurzer Schneidteil, dunkel (Hartmetall), viele
// steile Schneiden und gerade Stirn mit Ecken. kugel: runde Stirn.
const FRAES = 'fill="#7c8691" ' + L;
function fraeser(kugel) {
  const ende = kugel ? "A14 14 0 0 1 96 44" : "V44";
  let s = '<rect x="3" y="20" width="52" height="20" ' + HELL + "/>"
    + '<path d="M55 16 H96 ' + ende + ' H55 Z" ' + FRAES + "/>";
  for (let x = 56; x < 86; x += 8) s += '<path ' + LINIE + ' d="M' + x + " 44 L" + (x + 10) + ' 16"/>';
  return s;
}
// Scheibenfräser: nur die Scheibe mit Zähnen
function scheibe() {
  let z = "";
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI, b = ((i + 0.6) / n) * 2 * Math.PI;
    const p = (w, r) => pt(30 + r * Math.cos(w), 30 + r * Math.sin(w));
    z += (i ? " L" : "M") + p(a, 22) + " L" + p(a, 28) + " L" + p(b, 22);
  }
  return '<path d="' + z + ' Z" ' + HELL + "/>"
    + '<circle cx="30" cy="30" r="8" ' + LOCH + "/>"
    + '<rect x="28" y="20" width="4" height="4" fill="#fff" stroke="#222" stroke-width="1"/>';
}
// Rändelstahl von oben: Gabel mit grossem Rändelrad, Kreuzrändel, Achse
function raendel() {
  let muster = "";
  for (let y = -10; y < 40; y += 6) muster += '<path ' + LINIE + ' d="M16 ' + y + " L44 " + (y + 14) + " M16 " + (y + 14) + " L44 " + y + '"/>';
  return '<rect x="14" y="42" width="32" height="29" ' + HALTER + "/>"
    + poly([[8, 42], [8, 14], [14, 14], [14, 42]], HALTER) + poly([[46, 42], [46, 14], [52, 14], [52, 42]], HALTER)
    + '<rect x="15" y="5" width="30" height="34" rx="3" ' + PLATTE + "/>"
    + '<defs><clipPath id="eb-rr"><rect x="15" y="5" width="30" height="34" rx="3"/></clipPath></defs>'
    + '<g clip-path="url(#eb-rr)">' + muster + "</g>"
    + '<path stroke="#222" stroke-width="3" stroke-linecap="round" d="M5 22 H55"/>';
}
// Stechhalter wie im Excel-Foto: Grundkörper, schmales Schwert, Platte oben
const stechen = '<rect x="10" y="62" width="34" height="55" ' + DUNKEL + "/>"
  + poly([[34, 62], [34, 14], [44, 10], [44, 62]], HALTER)
  + '<rect x="34" y="3" width="10" height="11" ' + PLATTE + "/>";
// Utilis-Stechplatte: lang und schmal, beide Enden schneidend
const utilis = poly([[24, 10], [30, 3], [36, 10], [36, 110], [30, 117], [24, 110]], PLATTE)
  + '<path ' + LINIE + ' d="M30 18 V102"/>' + '<circle cx="30" cy="60" r="3" ' + LOCH + "/>";

// [Schlüssel, Name (nur als Hinweis beim Darüberfahren), Zeichnung, versteckt]
// Versteckte erscheinen nicht in der Auswahl, sondern über eine Rückfrage
// (Bohrer: normal oder flach, Wunsch Patrick 13. Oktober 2026).
export const BILDER = [
  ["drehen", "Drehstahl D-Platte", svg(KURZ, drehstahl(55))],
  ["drehen_l", "Drehstahl D-Platte spiegelverkehrt", svg(KURZ, drehstahl(55), true)],
  ["drehen_v", "Drehstahl V-Platte", svg(KURZ, drehstahl(35))],
  ["drehen_v_l", "Drehstahl V-Platte spiegelverkehrt", svg(KURZ, drehstahl(35), true)],
  ["gewindedrehen", "Gewinde-Drehstahl (Vollprofilplatte 16)", svg(KURZ, gewindestahl)],
  ["gewindedrehen_l", "Gewinde-Drehstahl spiegelverkehrt", svg(KURZ, gewindestahl, true)],
  ["stechen", "Abstechen / Einstechen", svg(HOCH, stechen)],
  ["stechen_l", "Abstechen / Einstechen spiegelverkehrt", svg(HOCH, stechen, true)],
  ["utilis", "Utilis-Platte schmal", svg(HOCH, utilis)],
  ["bohren", "Bohrer", svg(QUER, bohrer(false))],
  ["bohren_flach", "Flachbohrer", svg(QUER, bohrer(true)), true],
  ["zentrieren", "Zentrier- / Anbohrer", svg(QUER, zentrierer)],
  ["gewindebohren", "Gewindebohrer / -former", svg(QUER, gewindebohrer())],
  ["fraesen", "Schaftfräser", svg(QUER, fraeser(false))],
  ["kugelfraeser", "Kugelfräser", svg(QUER, fraeser(true))],
  ["scheibenfraeser", "Scheibenfräser", svg(RUND, scheibe())],
  ["raendeln", "Rändelstahl", svg(KURZ, raendel())],
];

// Bohrer fragen nach: normal oder flach
export const NACHFRAGE = {
  bohren: { titel: "Welcher Bohrer?", wahl: [["bohren", "Normal (mit Spitze)"], ["bohren_flach", "Flachbohrer (flach, ohne Spitzenwinkel)"]] },
};

// Frühere Schlüssel, falls sie schon irgendwo gespeichert sind
// Die Bohrstangen sind wieder weg (Patrick 13. Oktober 2026: „nimm sie raus“).
const ALIAS = { abstechen: "stechen", einstechen: "stechen", flachbohrer: "bohren_flach", senken: "zentrieren",
  tieflochbohren: "bohren", reiben: "bohren" };

const NACH_SCHLUESSEL = Object.fromEntries(BILDER.map(([k, name, s]) => [k, { name, svg: s }]));
let EIGENE = {};
// Die hochgeladenen Bilder: [{ id, name, url }]
export function eigeneBilderSetzen(liste) {
  EIGENE = Object.fromEntries((liste || []).map((b) => ["eigen:" + b.id, { name: b.name || "Eigenes Bild", url: b.url, id: b.id }]));
}
export const eigeneBilder = () => Object.entries(EIGENE).map(([k, b]) => Object.assign({ schluessel: k }, b));
export const bildDaten = (k) => NACH_SCHLUESSEL[k] || NACH_SCHLUESSEL[ALIAS[k]] || EIGENE[k] || null;

// Vorschlag nach Tätigkeit und Werkzeugtext, erstes Stichwort gewinnt
const STICHWORTE = [
  [/stech/i, "stechen"],
  [/gewinde.*(bohr|form|schneid)|(bohr|form).*gewinde|\bM\d/i, "gewindebohren"],
  [/gewinde/i, "gewindedrehen"],
  [/flachbohr/i, "bohren_flach"],
  [/zentrier|anbohr|ansenk|senk|fase/i, "zentrieren"],
  [/scheibenfr/i, "scheibenfraeser"],
  [/kugel|radius.*fr|fr.*radius/i, "kugelfraeser"],
  [/fr(ä|ae)s/i, "fraesen"],
  [/r(ä|ae)ndel/i, "raendeln"],
  [/bohr|reib/i, "bohren"],
  [/\bV[A-Z]{2}[A-Z]?[-\s]?\d/, "drehen_v"],   // Plattenbezeichnung VCGT-…, VBMT-…
  [/dreh|plan|kopier|schlicht|schrupp|\bD[A-Z]{2}[A-Z]?[-\s]?\d/i, "drehen"],
];
export function bildVorschlag(p) {
  const text = [p.taetigkeit, p.werkzeug].filter(Boolean).join(" ");
  if (!text) return null;
  const t = STICHWORTE.find(([re]) => re.test(text));
  return t ? t[1] : null;
}

// Welches Bild der Platz zeigt: das des Artikels, sonst das eigene,
// sonst den Vorschlag. art sagt, woher es kommt.
export function platzBild(p, artikelBilder) {
  if (!p) return null;
  const a = p.article_id && artikelBilder && artikelBilder[p.article_id];
  if (a && bildDaten(a)) return { schluessel: a, art: "artikel" };
  if (p.bild && bildDaten(p.bild)) return { schluessel: p.bild, art: "platz" };
  const v = bildVorschlag(p);
  return v ? { schluessel: v, art: "vorschlag" } : null;
}
