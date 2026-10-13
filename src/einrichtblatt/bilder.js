// =================================================================
//  BILDER-BIBLIOTHEK DER WERKZEUGE
//  Einfache, scharfe Zeichnungen statt der verpixelten Fotos aus den
//  Excel-Blättern (Wunsch Patrick, 13. Oktober 2026: „will nicht die
//  verpixelten Bilder, sondern dass du sie so einfach wie möglich
//  nachzeichnest“). Alle stehen senkrecht, Schneide unten, wie im Excel.
//
//  Das Bild hängt am Artikel (Tabelle artikel_bild): wer einem Artikel
//  einmal ein Bild gibt, bei dem kommt es auf jedem Blatt und jedem Typ
//  von selbst. Ohne Artikel merkt sich der Platz sein Bild selbst, und
//  ohne beides schlägt die App eines nach der Tätigkeit vor.
// =================================================================

const L = 'stroke="#222" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';
const SCHAFT = 'fill="#9aa3ad" ' + L;      // Halter, Schaft
const STAHL = 'fill="#c9ced4" ' + L;       // HSS, Hartmetall
const PLATTE = 'fill="#f2c230" ' + L;      // Wendeplatte
const LINIE = 'fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round"';

// Gezeichnet wird jedes Werkzeug senkrecht mit der Schneide unten
// (60 × 120). lage dreht es fürs Blatt (Wunsch Patrick, 13. Oktober
// 2026: „alles ist auf dem Kopf“, „bohrartige Werkzeuge quer, Spitze
// nach rechts“): "hoch" = Schneide oben, "quer" = Spitze rechts.
// spiegel zeichnet es spiegelverkehrt (linke Ausführung).
const svg = (inhalt, lage, spiegel, obenauf) => {
  const sp = spiegel ? '<g transform="translate(60 0) scale(-1 1)">' + inhalt + "</g>" : inhalt;
  const quer = lage === "quer";
  const g = quer ? '<g transform="translate(0 60) rotate(-90)">' + sp + "</g>"
    : '<g transform="rotate(180 30 60)">' + sp + "</g>";
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (quer ? "120 60" : "60 120")
    + '" preserveAspectRatio="xMidYMid meet">' + g + (obenauf || "") + "</svg>";
};
const HALTER = 'fill="#f2c230" ' + L;      // gelber Klemmhalter wie im Excel-Foto
const WSP = 'fill="#8e969f" ' + L;         // Wendeschneidplatte

// Klemmhalter mit rhombischer Platte: winkel 55 (D) oder 35 (V)
const drehhalter = (winkel) => {
  const tx = 12, ty = 115, ox = 33, oy = 94;
  const cx = (tx + ox) / 2, cy = (ty + oy) / 2;
  const halb = Math.hypot(ox - tx, oy - ty) / 2 * Math.tan((winkel / 2) * Math.PI / 180);
  const n = [ (oy - ty), -(ox - tx) ].map((v) => v / Math.hypot(ox - tx, oy - ty) * halb);
  const pt = (x, y) => x.toFixed(1) + " " + y.toFixed(1);
  return '<rect x="21" y="3" width="18" height="74" ' + HALTER + "/>"
    + '<path d="M21 77 H39 V92 L31 104 L18 100 L21 92 Z" ' + HALTER + "/>"
    + '<path d="M' + pt(tx, ty) + " L" + pt(cx + n[0], cy + n[1]) + " L" + pt(ox, oy) + " L" + pt(cx - n[0], cy - n[1]) + ' Z" ' + WSP + "/>"
    + '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (winkel > 45 ? 3 : 2.2) + '" fill="#f2c230" ' + L + "/>";
};

// Schraubenlinien eines Bohrers oder Fräsers zwischen y1 und y2
const wendel = (x1, x2, y1, y2, n) => {
  let s = "";
  const h = (y2 - y1) / n;
  for (let i = 0; i < n; i++) s += '<path ' + LINIE + ' d="M' + x1 + " " + (y1 + i * h + h * 0.9) + " L" + x2 + " " + (y1 + i * h) + '"/>';
  return s;
};

export const BILDER = [
  ["drehen", "Drehen D-Platte 55°", svg(drehhalter(55))],
  ["drehen_l", "Drehen D-Platte 55° spiegelverkehrt", svg(drehhalter(55), "hoch", true)],
  ["drehen_v", "Drehen V-Platte 35°", svg(drehhalter(35))],
  ["drehen_v_l", "Drehen V-Platte 35° spiegelverkehrt", svg(drehhalter(35), "hoch", true)],
  ["abstechen", "Abstechen", svg(
    '<rect x="17" y="3" width="26" height="58" ' + SCHAFT + "/>"
    + '<path d="M24 61 H43 V100 L32 112 H24 Z" ' + SCHAFT + "/>"
    + '<path d="M24 106 H32 V117 H24 Z" ' + PLATTE + "/>")],
  ["einstechen", "Einstechen", svg(
    '<rect x="17" y="3" width="26" height="62" ' + SCHAFT + "/>"
    + '<path d="M17 65 H43 V84 L35 94 H27 L17 84 Z" ' + SCHAFT + "/>"
    + '<path d="M27 94 H35 V117 H27 Z" ' + PLATTE + "/>")],
  ["rueckwaerts", "Rückwärts drehen (hinten)", svg(
    '<rect x="21" y="3" width="18" height="70" ' + SCHAFT + "/>"
    + '<path d="M21 73 H39 V112 L33 117 H27 V92 Z" ' + SCHAFT + "/>"
    + '<path d="M13 102 L27 92 V108 Z" ' + PLATTE + "/>")],
  ["ausdrehen", "Ausdrehen (Bohrstange)", svg(
    '<rect x="17" y="3" width="26" height="52" ' + SCHAFT + "/>"
    + '<rect x="25" y="55" width="10" height="58" ' + STAHL + "/>"
    + '<path d="M25 104 L17 111 L25 117 Z" ' + PLATTE + "/>", "quer")],
  ["gewindedrehen", "Gewinde drehen", svg(
    '<rect x="21" y="3" width="18" height="76" ' + SCHAFT + "/>"
    + '<path d="M21 79 H39 V98 L30 104 L21 98 Z" ' + SCHAFT + "/>"
    + '<path d="M18 100 H42 L30 118 Z" ' + PLATTE + "/>")],
  ["bohren", "Bohren (Spiralbohrer)", svg(
    '<rect x="22" y="3" width="16" height="48" ' + STAHL + "/>"
    + '<path d="M22 51 H38 V106 L30 117 L22 106 Z" ' + STAHL + "/>"
    + wendel(22, 38, 54, 106, 5), "quer")],
  ["flachbohrer", "Flachbohrer", svg(
    '<rect x="21" y="3" width="18" height="70" ' + SCHAFT + "/>"
    + '<path d="M24 73 H36 V92 H24 Z" ' + SCHAFT + "/>"
    + '<path d="M15 92 H45 V104 L30 117 L15 104 Z" ' + PLATTE + "/>", "quer")],
  ["tieflochbohren", "Tieflochbohren", svg(
    '<rect x="19" y="3" width="22" height="30" ' + SCHAFT + "/>"
    + '<rect x="26" y="33" width="8" height="74" ' + STAHL + "/>"
    + '<path d="M26 107 H34 L34 112 L29 117 L26 113 Z" ' + PLATTE + "/>"
    + '<path ' + LINIE + ' d="M30 36 V105"/>', "quer")],
  ["zentrieren", "Zentrieren / Anbohren", svg(
    '<rect x="20" y="3" width="20" height="88" ' + STAHL + "/>"
    + '<path d="M20 91 H40 L30 110 Z" ' + STAHL + "/>"
    + '<path ' + LINIE + ' d="M30 91 V108"/>', "quer")],
  ["senken", "Senken / Fasen", svg(
    '<rect x="23" y="3" width="14" height="66" ' + STAHL + "/>"
    + '<path d="M12 69 H48 L30 100 Z" ' + STAHL + "/>"
    + '<path ' + LINIE + ' d="M21 69 L30 98 M39 69 L30 98"/>', "quer")],
  ["reiben", "Reiben", svg(
    '<rect x="23" y="3" width="14" height="52" ' + STAHL + "/>"
    + '<path d="M22 55 H38 V113 L36 117 H24 L22 113 Z" ' + STAHL + "/>"
    + '<path ' + LINIE + ' d="M26.5 58 V114 M30 58 V115 M33.5 58 V114"/>', "quer")],
  ["gewindebohren", "Gewindebohren / -formen", svg(
    '<rect x="24" y="3" width="12" height="10" ' + STAHL + "/>"
    + '<rect x="22" y="13" width="16" height="45" ' + STAHL + "/>"
    + '<path d="M22 58 H38 V108 L34 116 H26 L22 108 Z" ' + STAHL + "/>"
    + [62, 69, 76, 83, 90, 97, 104].map((y) => '<path ' + LINIE + ' d="M22 ' + y + " L38 " + (y + 4) + '"/>').join(""), "quer")],
  ["fraesen", "Fräsen (Schaftfräser)", svg(
    '<rect x="22" y="3" width="16" height="56" ' + STAHL + "/>"
    + '<path d="M19 59 H41 V115 Q41 117 39 117 H21 Q19 117 19 115 Z" ' + STAHL + "/>"
    + wendel(19, 41, 61, 116, 5), "quer")],
  ["scheibenfraeser", "Scheibenfräser", svg(
    '<rect x="25" y="3" width="10" height="92" ' + STAHL + "/>"
    + '<rect x="6" y="95" width="48" height="10" ' + STAHL + "/>"
    + '<path ' + LINIE + ' d="M10 95 V105 M16 95 V105 M22 95 V105 M38 95 V105 M44 95 V105 M50 95 V105"/>')],
  ["raendeln", "Rändeln", svg(
    '<rect x="19" y="3" width="22" height="64" ' + SCHAFT + "/>"
    + '<path d="M19 67 H41 V84 H19 Z" ' + SCHAFT + "/>"
    + '<circle cx="30" cy="100" r="15" ' + STAHL + "/>"
    + '<circle cx="30" cy="100" r="3" fill="#fff" ' + L + "/>"
    + [0, 30, 60, 90, 120, 150].map((w) => {
        const a = (w * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
        return '<path ' + LINIE + ' d="M' + (30 + 6 * c).toFixed(1) + " " + (100 + 6 * s).toFixed(1) + " L" + (30 + 14 * c).toFixed(1) + " " + (100 + 14 * s).toFixed(1)
          + " M" + (30 - 6 * c).toFixed(1) + " " + (100 - 6 * s).toFixed(1) + " L" + (30 - 14 * c).toFixed(1) + " " + (100 - 14 * s).toFixed(1) + '"/>';
      }).join(""))],
  ["entgraten", "Entgraten", svg(
    '<rect x="24" y="3" width="12" height="80" ' + STAHL + "/>"
    + '<path d="M24 83 H36 L42 98 L30 116 L18 98 Z" ' + STAHL + "/>"
    + '<path ' + LINIE + ' d="M24 98 H36"/>', "quer")],
  ["stossen", "Nuten stossen", svg(
    '<rect x="20" y="3" width="20" height="74" ' + SCHAFT + "/>"
    + '<rect x="26" y="77" width="8" height="32" ' + STAHL + "/>"
    + '<path d="M26 109 H40 V117 H26 Z" ' + PLATTE + "/>")],
  ["polygon", "Polygon / Mehrkant", svg(
    '<rect x="25" y="3" width="10" height="70" ' + STAHL + "/>"
    + '<path d="M30 73 L45 82 V100 L30 109 L15 100 V82 Z" ' + STAHL + "/>"
    + '<path ' + LINIE + ' d="M30 73 V109 M15 82 L45 100 M45 82 L15 100"/>')],
  ["sonder", "Sonderwerkzeug", svg(
    '<rect x="20" y="3" width="20" height="70" ' + SCHAFT + "/>"
    + '<path d="M20 73 H40 V96 L30 116 L20 96 Z" ' + STAHL + "/>"
    , "hoch", false, '<text x="30" y="36" text-anchor="middle" font-family="Arial" font-weight="700" font-size="14" fill="#222">S</text>')],
];

const NACH_SCHLUESSEL = Object.fromEntries(BILDER.map(([k, name, s]) => [k, { name, svg: s }]));
export const bildDaten = (k) => NACH_SCHLUESSEL[k] || null;

// Vorschlag nach Tätigkeit und Werkzeugtext, erstes Stichwort gewinnt
const STICHWORTE = [
  [/abstech/i, "abstechen"],
  [/einstech/i, "einstechen"],
  [/gewinde.*(bohr|form)|(bohr|form).*gewinde|\bM\d/i, "gewindebohren"],
  [/gewinde/i, "gewindedrehen"],
  [/flachbohr/i, "flachbohrer"],
  [/tiefloch|einlippen/i, "tieflochbohren"],
  [/zentrier|anbohr|ansenk/i, "zentrieren"],
  [/senk|fase/i, "senken"],
  [/reib/i, "reiben"],
  [/scheibenfr/i, "scheibenfraeser"],
  [/fr(ä|ae)s/i, "fraesen"],
  [/r(ä|ae)ndel/i, "raendeln"],
  [/entgrat/i, "entgraten"],
  [/sto(ss|ß)/i, "stossen"],
  [/polygon|mehrkant|sechskant|vierkant/i, "polygon"],
  [/ausdreh|innen|bohrstange/i, "ausdrehen"],
  [/hinten|r(ü|ue)ckw|\bkb\b/i, "rueckwaerts"],
  [/bohr/i, "bohren"],
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
