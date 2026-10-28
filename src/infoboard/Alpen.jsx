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
//  Seit 1.245.0 grafisch statt gemalt (Patrick 28. Oktober 2026: „gefällt
//  mir nicht … weniger markant und stilistischer“; 1.244.0 war ein
//  gemaltes Bild mit Fels, Schnee und Dunst): wenige flache Schichten in
//  sanften Tönen wie auf einem Plakat, gerade Kanten zwischen den
//  Gipfeln, Schneekappen mit einfachem Zickzack, unten ein weicher
//  Übergang in den Grund. Nichts davon soll vom Inhalt ablenken.
// =================================================================

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

// Gerade Kanten von Stützpunkt zu Stützpunkt, unten geschlossen
function flaeche(punkte, b, hh, unten, boden) {
  return "M0 " + boden + " L" + punkte.map(([x, y]) => (x * b).toFixed(1) + " " + (unten - y * hh).toFixed(1)).join(" L")
    + " L" + b + " " + boden + " Z";
}

// Schneekappe: alles über der Grenze, unten ein ruhiges Zickzack
function kappe(b, hh, unten, grenze, oben) {
  const schritt = 0.012;
  let d = "M0 " + (unten - oben * hh).toFixed(1);
  for (let x = 0, i = 0; x <= 1.0001; x += schritt, i++) {
    const y = grenze + (i % 2 ? 0.035 : -0.01);
    d += " L" + (x * b).toFixed(1) + " " + (unten - y * hh).toFixed(1);
  }
  return d + " L" + b + " " + (unten - oben * hh).toFixed(1) + " Z";
}

export default function Alpen({ breite, hoehe, oben }) {
  // Die Kette steht unten auf der Tafel, etwa die halbe Höhe unter dem Kopf
  const h = Math.round((hoehe - oben) * 0.5);
  const b = breite;
  const hhH = h * 0.62, untenH = h * 0.86;
  const hhV = h * 0.62, untenV = h * 0.93;
  const berg = flaeche(HOCHALPEN, b, hhH, untenH, h);
  return (
    <svg className="ib-alpen" data-ib="alpen" width={b} height={h} viewBox={"0 0 " + b + " " + h}
      style={{ top: hoehe - h }} aria-hidden="true">
      <defs>
        <clipPath id="ib-alpen-berg"><path d={berg} /></clipPath>
        {/* Unten verschwimmt alles in den Grund der Tafel */}
        <linearGradient id="ib-alpen-aus" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="ib-alpen-maske"><rect width={b} height={h} fill="url(#ib-alpen-aus)" /></mask>
      </defs>
      <g mask="url(#ib-alpen-maske)" opacity="0.6">
        <path d={berg} fill="#c3d0dc" />
        <g clipPath="url(#ib-alpen-berg)">
          <path d={kappe(b, hhH, untenH, 0.7, 1.2)} fill="#eef3f7" />
        </g>
        <path d={flaeche(VORALPEN, b, hhV, untenV, h)} fill="#b4c4c6" />
        <path d={"M0 " + h * 0.9 + " C" + b * 0.2 + " " + h * 0.82 + " " + b * 0.35 + " " + h * 0.95 + " " + b * 0.55 + " " + h * 0.87
          + " S" + b * 0.85 + " " + h * 0.82 + " " + b + " " + h * 0.89 + " L" + b + " " + h + " L0 " + h + " Z"}
          fill="#c9d5c4" />
      </g>
    </svg>
  );
}
