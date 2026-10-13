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

// Drehstahl, kurz nach der Platte abgeschnitten, Einstellwinkel 93°
// (Patrick: „Winkel egal, einfach so 93 Grad“). platte: Punkte der Platte.
function drehstahl(platte, loch) {
  return poly([[18, 118], [42, 118], [42, 30], [34, 14], [12, 12], [14, 30], [18, 34]], HALTER)
    + poly(platte, PLATTE)
    + (loch ? '<circle cx="' + loch[0].toFixed(1) + '" cy="' + loch[1].toFixed(1) + '" r="' + loch[2] + '" ' + LOCH + "/>" : "");
}
// Rhombische Platte mit Spitze links oben; winkel 55 (D) oder 35 (V)
function rhombus(winkel) {
  const tx = 6, ty = 8, lang = winkel > 45 ? 19 : 22;
  const w1 = (3 * Math.PI) / 180, w2 = ((3 + winkel) * Math.PI) / 180;
  const p1 = [tx + lang * Math.cos(w1), ty + lang * Math.sin(w1)];
  const p3 = [tx + lang * Math.cos(w2), ty + lang * Math.sin(w2)];
  const p2 = [p1[0] + p3[0] - tx, p1[1] + p3[1] - ty];
  return { punkte: [[tx, ty], p1, p2, p3], loch: [(tx + p2[0]) / 2, (ty + p2[1]) / 2, winkel > 45 ? 3 : 2.2] };
}
const D = rhombus(55), V = rhombus(35);
// Gewinde-Drehplatte 16 (Dreieck, liegend), Spitze 60° links oben
const GEWINDE = [[6, 7], [30, 12], [13, 30]];

// Bohrer quer, Spitze rechts: Schaft, Spannuten als dunkle Bänder
function bohrer(flach) {
  let s = '<rect x="3" y="21" width="44" height="18" ' + HELL + "/>"
    + '<path d="M47 21 H104 ' + (flach ? "V39" : "L112 30 L104 39") + ' H47 Z" ' + HELL + "/>";
  for (let x = 50; x < 98; x += 13) s += poly([[x, 39], [x + 6, 39], [x + 14, 21], [x + 8, 21]], NUT);
  if (flach) s += '<path ' + LINIE + ' d="M104 21 V39"/>';
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
// Schaftfräser: Schneiden als deutliche Zähne, Stirn mit Zähnen
function fraeser() {
  let s = '<rect x="3" y="20" width="50" height="20" ' + HELL + "/>"
    + '<rect x="53" y="16" width="57" height="28" ' + HELL + "/>";
  for (let x = 55; x < 104; x += 12) s += poly([[x, 44], [x + 6, 44], [x + 16, 16], [x + 10, 16]], NUT);
  s += poly([[110, 16], [116, 19], [110, 24]], HELL) + poly([[110, 27], [116, 30], [110, 33]], HELL)
    + poly([[110, 36], [116, 41], [110, 44]], HELL);
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
// Rändelstahl von oben: Gabel mit Rändelrad, Kreuzrändel
function raendel() {
  let muster = "";
  for (let y = -4; y < 42; y += 5) muster += '<path ' + LINIE + ' d="M21 ' + y + " L39 " + (y + 8) + " M21 " + (y + 8) + " L39 " + y + '"/>';
  return '<rect x="14" y="44" width="32" height="73" ' + HALTER + "/>"
    + poly([[14, 44], [14, 12], [21, 12], [21, 44]], HALTER) + poly([[39, 44], [39, 12], [46, 12], [46, 44]], HALTER)
    + '<rect x="21" y="6" width="18" height="38" ' + PLATTE + "/>"
    + '<defs><clipPath id="eb-rr"><rect x="21" y="6" width="18" height="38"/></clipPath></defs>'
    + '<g clip-path="url(#eb-rr)">' + muster + "</g>"
    + '<path ' + LINIE + ' d="M14 20 H46"/>';
}
// Stechhalter wie im Excel-Foto: Grundkörper, schmales Schwert, Platte oben
const stechen = '<rect x="10" y="62" width="34" height="55" ' + DUNKEL + "/>"
  + poly([[34, 62], [34, 14], [44, 10], [44, 62]], HALTER)
  + '<rect x="34" y="3" width="10" height="11" ' + PLATTE + "/>";
// Utilis-Stechplatte: lang und schmal, beide Enden schneidend
const utilis = poly([[24, 10], [30, 3], [36, 10], [36, 110], [30, 117], [24, 110]], PLATTE)
  + '<path ' + LINIE + ' d="M30 18 V102"/>' + '<circle cx="30" cy="60" r="3" ' + LOCH + "/>";
// Bohrstangen: Halter grau, Einsatz gelb (Horn Supermini), Ifanger und
// Gühring als ähnliche, eigene Formen
const horn = '<rect x="2" y="12" width="40" height="36" ' + HALTER + "/>"
  + '<path d="M42 16 H60 L64 22 V38 L60 44 H42 Z" ' + PLATTE + "/>"
  + '<path d="M64 31 H102 V39 H64 Z" ' + PLATTE + "/>"
  + '<path d="M102 39 V24 L110 22 L116 26 L112 39 Z" ' + PLATTE + "/>"
  + '<path ' + LINIE + ' d="M44 20 H58"/>';
const ifanger = '<rect x="2" y="14" width="44" height="32" ' + HALTER + "/>"
  + '<rect x="12" y="10" width="14" height="4" ' + HALTER + "/>"
  + '<path d="M46 25 H104 V35 H46 Z" fill="#8e969f" ' + L + "/>"
  + '<path d="M104 35 V22 L113 21 L116 25 L110 35 Z" ' + PLATTE + "/>";
const guehring = '<rect x="2" y="15" width="50" height="30" ' + HELL + "/>"
  + '<path d="M52 19 L60 24 V36 L52 41 Z" ' + HELL + "/>"
  + '<rect x="60" y="25" width="42" height="11" ' + HELL + "/>"
  + poly([[66, 36], [72, 36], [84, 25], [78, 25]], NUT) + poly([[84, 36], [90, 36], [102, 25], [96, 25]], NUT)
  + '<path d="M102 36 V22 L111 21 L115 26 L109 36 Z" ' + PLATTE + "/>";

// [Schlüssel, Name (nur als Hinweis beim Darüberfahren), Zeichnung, versteckt]
// Versteckte erscheinen nicht in der Auswahl, sondern über eine Rückfrage
// (Bohrer: normal oder flach, Wunsch Patrick 13. Oktober 2026).
export const BILDER = [
  ["drehen", "Drehstahl D-Platte", svg(HOCH, drehstahl(D.punkte, D.loch))],
  ["drehen_l", "Drehstahl D-Platte spiegelverkehrt", svg(HOCH, drehstahl(D.punkte, D.loch), true)],
  ["drehen_v", "Drehstahl V-Platte", svg(HOCH, drehstahl(V.punkte, V.loch))],
  ["drehen_v_l", "Drehstahl V-Platte spiegelverkehrt", svg(HOCH, drehstahl(V.punkte, V.loch), true)],
  ["gewindedrehen", "Gewinde-Drehstahl (Platte 16)", svg(HOCH, drehstahl(GEWINDE, [16.3, 16.3, 2.5]))],
  ["gewindedrehen_l", "Gewinde-Drehstahl spiegelverkehrt", svg(HOCH, drehstahl(GEWINDE, [16.3, 16.3, 2.5]), true)],
  ["stechen", "Abstechen / Einstechen", svg(HOCH, stechen)],
  ["stechen_l", "Abstechen / Einstechen spiegelverkehrt", svg(HOCH, stechen, true)],
  ["utilis", "Utilis-Platte schmal", svg(HOCH, utilis)],
  ["bohren", "Bohrer", svg(QUER, bohrer(false))],
  ["bohren_flach", "Flachbohrer", svg(QUER, bohrer(true)), true],
  ["zentrieren", "Zentrier- / Anbohrer", svg(QUER, zentrierer)],
  ["gewindebohren", "Gewindebohrer / -former", svg(QUER, gewindebohrer())],
  ["fraesen", "Schaftfräser", svg(QUER, fraeser())],
  ["scheibenfraeser", "Scheibenfräser", svg(RUND, scheibe())],
  ["raendeln", "Rändelstahl", svg(HOCH, raendel())],
  ["bohrstange_horn", "Bohrstange Horn Supermini", svg(QUER, horn)],
  ["bohrstange_ifanger", "Bohrstange Ifanger", svg(QUER, ifanger)],
  ["bohrstange_guehring", "Bohrstange Gühring", svg(QUER, guehring)],
];

// Bohrer fragen nach: normal oder flach
export const NACHFRAGE = {
  bohren: { titel: "Welcher Bohrer?", wahl: [["bohren", "Normal (mit Spitze)"], ["bohren_flach", "Flachbohrer (flach, ohne Spitzenwinkel)"]] },
};

// Frühere Schlüssel, falls sie schon irgendwo gespeichert sind
const ALIAS = { abstechen: "stechen", einstechen: "stechen", flachbohrer: "bohren_flach", senken: "zentrieren",
  tieflochbohren: "bohren", ausdrehen: "bohrstange_horn", reiben: "bohren" };

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
  [/fr(ä|ae)s/i, "fraesen"],
  [/r(ä|ae)ndel/i, "raendeln"],
  [/supermini|\bhorn\b/i, "bohrstange_horn"],
  [/ifanger|mtec/i, "bohrstange_ifanger"],
  [/g(ü|ue)hring/i, "bohrstange_guehring"],
  [/ausdreh|bohrstange/i, "bohrstange_horn"],
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
