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
// =================================================================

// [Lage 0…1 von links, Höhe 0…1] je Gipfel und Sattel
const HOCHALPEN = [
  [0, 0.18], [0.04, 0.3], [0.07, 0.46], [0.095, 0.36], [0.13, 0.55], [0.15, 0.68], [0.17, 0.52], [0.2, 0.63],
  [0.225, 0.58], [0.25, 0.66], [0.28, 0.6], [0.31, 0.78], [0.33, 0.7], [0.355, 0.9], [0.37, 0.8], [0.385, 0.97],
  [0.4, 0.82], [0.42, 0.93], [0.435, 0.84], [0.45, 0.98], [0.465, 0.86], [0.49, 1], [0.51, 0.84], [0.535, 0.76],
  [0.56, 0.86], [0.58, 0.8], [0.6, 0.85], [0.625, 0.74], [0.65, 0.84], [0.675, 0.72], [0.7, 0.66], [0.73, 0.73],
  [0.76, 0.62], [0.8, 0.7], [0.83, 0.58], [0.87, 0.66], [0.9, 0.52], [0.94, 0.48], [0.97, 0.36], [1, 0.28],
];
const VORALPEN = [
  [0, 0.12], [0.06, 0.2], [0.1, 0.16], [0.18, 0.24], [0.26, 0.2], [0.34, 0.27], [0.42, 0.22], [0.5, 0.26],
  [0.56, 0.3], [0.6, 0.5], [0.635, 0.3], [0.66, 0.36], [0.68, 0.42], [0.7, 0.34], [0.76, 0.3], [0.84, 0.26],
  [0.92, 0.22], [1, 0.16],
];

// Zackige Linie: zwischen den Stützpunkten kleine, immer gleiche Grate
function grat(punkte, b, h, unten, zacken) {
  let d = "M0 " + unten;
  let saat = 7;
  const zufall = () => { saat = (saat * 9301 + 49297) % 233280; return saat / 233280; };
  for (let i = 0; i < punkte.length - 1; i++) {
    const [x0, y0] = punkte[i], [x1, y1] = punkte[i + 1];
    const schritte = 4;
    for (let s = 0; s < schritte; s++) {
      const f = s / schritte;
      const x = (x0 + (x1 - x0) * f) * b;
      const y = y0 + (y1 - y0) * f + (s ? (zufall() - 0.5) * zacken : 0);
      d += " L" + x.toFixed(1) + " " + (unten - y * h).toFixed(1);
    }
  }
  const [xl, yl] = punkte[punkte.length - 1];
  return d + " L" + (xl * b).toFixed(1) + " " + (unten - yl * h).toFixed(1) + " L" + b + " " + unten + " Z";
}

export default function Alpen({ breite, hoehe, oben }) {
  // Die Kette steht unten auf der Tafel, etwa ein Drittel hoch
  const h = Math.round((hoehe - oben) * 0.5);
  const b = breite;
  return (
    <svg className="ib-alpen" data-ib="alpen" width={b} height={h} viewBox={"0 0 " + b + " " + h}
      style={{ top: hoehe - h }} aria-hidden="true">
      <defs>
        <linearGradient id="ib-alpen-schnee" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#dfe8f1" stopOpacity="0.8" />
          <stop offset="1" stopColor="#9fb4c8" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="ib-alpen-vorne" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8aa0b6" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8aa0b6" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={grat(HOCHALPEN, b, h * 0.72, h * 0.86, 0.05)} fill="url(#ib-alpen-schnee)"
        stroke="#7f97ae" strokeOpacity="0.55" strokeWidth="1.5" strokeLinejoin="round" />
      <path d={grat(VORALPEN, b, h * 0.72, h * 0.92, 0.03)} fill="url(#ib-alpen-vorne)" />
      <path d={"M0 " + h * 0.9 + " C" + b * 0.2 + " " + h * 0.8 + " " + b * 0.35 + " " + h * 0.95 + " " + b * 0.55 + " " + h * 0.86
        + " S" + b * 0.85 + " " + h * 0.8 + " " + b + " " + h * 0.88 + " L" + b + " " + h + " L0 " + h + " Z"}
        fill="#9fb09a" fillOpacity="0.28" />
    </svg>
  );
}
