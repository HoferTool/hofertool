// Erklärungsbilder der Vorlagen in HOFERCAM (seit 1.693.0, Wunsch Patrick
// 22. November 2026: „für die Vorlagen in den Bearbeitungen nicht eine
// Liste, sondern ein Auswahlbild mit Erklärungsgrafiken der einzelnen
// Zyklen oder Bearbeitungen“). Reine Skizzen ohne Massstab, die Farben
// kommen aus CSS (.cam-vbild …), damit hell und dunkel passen.

const Pfeil = ({ x1, y1, x2, y2, beide, cls = "cam-vbild__mass" }) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} className={cls}
    markerEnd="url(#cvb-pfeil)" markerStart={beide ? "url(#cvb-pfeil)" : undefined} />
);
const Text = ({ x, y, children, anker = "middle", cls = "cam-vbild__text" }) => (
  <text x={x} y={y} textAnchor={anker} className={cls}>{children}</text>
);

function Defs() {
  return (
    <defs>
      <marker id="cvb-pfeil" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" className="cam-vbild__spitze" />
      </marker>
      <pattern id="cvb-schraff" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" className="cam-vbild__schraff" />
      </pattern>
    </defs>
  );
}

// Tieflochbohren: Bohrer kommt von vorne (rechts) auf der Drehachse,
// bohrt in Schritten Q bis zur Tiefe W und zieht dazwischen zurück
function G83() {
  return (
    <svg viewBox="0 0 220 130">
      <Defs />
      <line x1="6" y1="62" x2="214" y2="62" className="cam-vbild__achse" />
      <rect x="20" y="22" width="120" height="80" className="cam-vbild__teil" />
      <rect x="70" y="52" width="70" height="20" className="cam-vbild__loch" />
      {[115, 92].map((x) => <line key={x} x1={x} y1="52" x2={x} y2="72" className="cam-vbild__stufe" />)}
      <path d="M70 52 L62 62 L70 72" className="cam-vbild__loch" />
      {/* Bohrer */}
      <path d="M160 54 L148 54 L142 62 L148 70 L160 70 Z" className="cam-vbild__wz" />
      <rect x="160" y="54" width="44" height="16" className="cam-vbild__wz" />
      {/* Zustell- und Rückzugweg */}
      <path d="M150 40 L120 40 L120 34 L156 34" className="cam-vbild__weg" markerEnd="url(#cvb-pfeil)" />
      <Text x="160" y="38" anker="start">Q</Text>
      <Pfeil x1="140" y1="112" x2="64" y2="112" beide />
      <line x1="140" y1="102" x2="140" y2="116" className="cam-vbild__hilf" />
      <line x1="64" y1="72" x2="64" y2="116" className="cam-vbild__hilf" />
      <Text x="102" y="124">Tiefe W</Text>
      <Text x="190" y="90">F</Text>
      <Text x="30" y="16" anker="start" cls="cam-vbild__klein">Q je Schritt, dann rückziehen</Text>
    </svg>
  );
}

// Querbohren: Blick von vorne auf die Stirn, Bohrer quer von oben,
// C dreht weiter, N Bohrungen gleich verteilt
function G87() {
  const r = 40, cx = 82, cy = 70;
  const n = 6;
  return (
    <svg viewBox="0 0 220 130">
      <Defs />
      <circle cx={cx} cy={cy} r={r} className="cam-vbild__teil" />
      <circle cx={cx} cy={cy} r="2" className="cam-vbild__spitze" />
      {Array.from({ length: n }, (_, i) => {
        const a = (-90 + (360 / n) * i) * Math.PI / 180;
        const x1 = cx + Math.cos(a) * r, y1 = cy + Math.sin(a) * r;
        const x2 = cx + Math.cos(a) * (r - 16), y2 = cy + Math.sin(a) * (r - 16);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="cam-vbild__bohrung" />;
      })}
      {/* Bohrer von oben */}
      <path d={`M${cx - 5} 6 L${cx + 5} 6 L${cx + 5} 22 L${cx} 28 L${cx - 5} 22 Z`} className="cam-vbild__wz" />
      <path d="M128 40 A 52 52 0 0 1 128 100" className="cam-vbild__weg" markerEnd="url(#cvb-pfeil)" />
      <Text x="150" y="74" anker="start">C dreht</Text>
      <Text x="150" y="88" anker="start" cls="cam-vbild__klein">N Bohrungen</Text>
      <Pfeil x1={cx + 22} y1={cy} x2={cx + 22} y2={cy - r + 16} />
      <Text x={cx + 26} y={cy - 6} anker="start" cls="cam-vbild__klein">Tiefe X</Text>
      <Text x="150" y="24" anker="start" cls="cam-vbild__klein">Anfahren X,</Text>
      <Text x="150" y="36" anker="start" cls="cam-vbild__klein">bohren, zurück</Text>
    </svg>
  );
}

// Gewindestrählen: Gewindeprofil im Schnitt, Platte 60°, Zustellung an
// der Flanke, Tiefe P, Steigung F
function G76() {
  const zaehne = [];
  for (let i = 0; i < 6; i++) {
    const x = 20 + i * 26;
    zaehne.push(`L${x + 13} 66 L${x + 26} 44`);
  }
  return (
    <svg viewBox="0 0 220 130">
      <Defs />
      <path d={`M20 44 ${zaehne.join(" ")} L176 110 L20 110 Z`} className="cam-vbild__teil" />
      <line x1="6" y1="122" x2="214" y2="122" className="cam-vbild__achse" />
      {/* Platte im Gang */}
      <path d="M85 72 L72 50 L98 50 Z" className="cam-vbild__wz" transform="translate(0 -6)" />
      {/* Zustellungen entlang der Flanke */}
      {[0, 1, 2, 3].map((k) => (
        <path key={k} d={`M${73 + k * 2} ${46 + k * 5} L${85 + k * 1} ${66 + k * 0}`} className="cam-vbild__stufe" />
      ))}
      <Pfeil x1="110" y1="30" x2="96" y2="56" cls="cam-vbild__weg" />
      <Text x="112" y="26" anker="start" cls="cam-vbild__klein">Zustellung an der Flanke</Text>
      <Pfeil x1="20" y1="34" x2="46" y2="34" beide />
      <Text x="33" y="28">F</Text>
      <Pfeil x1="190" y1="44" x2="190" y2="66" beide />
      <line x1="176" y1="44" x2="196" y2="44" className="cam-vbild__hilf" />
      <line x1="176" y1="66" x2="196" y2="66" className="cam-vbild__hilf" />
      <Text x="200" y="59" anker="start">P</Text>
      <Text x="140" y="96" cls="cam-vbild__klein">Kern-Ø X</Text>
      <Text x="60" y="96" cls="cam-vbild__klein">60°</Text>
    </svg>
  );
}

// Einstich am Mantel: Breite B, Tiefe T, Fasen oben, Platte mit Breite
function Einstich() {
  return (
    <svg viewBox="0 0 220 130">
      <Defs />
      <path d="M14 40 L80 40 L84 44 L84 82 L136 82 L136 44 L140 40 L206 40 L206 112 L14 112 Z" className="cam-vbild__teil" />
      <line x1="6" y1="122" x2="214" y2="122" className="cam-vbild__achse" />
      <rect x="84" y="44" width="52" height="38" fill="url(#cvb-schraff)" className="cam-vbild__weg-flaeche" />
      {/* Platte */}
      <rect x="96" y="10" width="18" height="40" rx="2" className="cam-vbild__wz" />
      <Pfeil x1="84" y1="98" x2="136" y2="98" beide />
      <Text x="110" y="94">B</Text>
      <Pfeil x1="152" y1="40" x2="152" y2="82" beide />
      <line x1="136" y1="82" x2="158" y2="82" className="cam-vbild__hilf" />
      <Text x="160" y="66" anker="start">T</Text>
      <Text x="66" y="34" cls="cam-vbild__klein">Fase / R</Text>
      <Text x="40" y="70" cls="cam-vbild__klein">Mantel</Text>
      <Text x="110" y="64" cls="cam-vbild__klein">schruppen</Text>
      <Text x="110" y="74" cls="cam-vbild__klein">+ schlichten</Text>
    </svg>
  );
}

const BILDER = { g83: G83, g87: G87, g76: G76, einstich: Einstich };
export const VORLAGE_TEXT = {
  g83: "Bohren in Schritten mit Rückzug zum Spänebrechen",
  g87: "Bohrungen quer, gleich verteilt über den Umfang",
  g76: "Gewinde in mehreren Durchgängen an der Flanke",
  einstich: "Nut am Mantel oder an der Front, mit Fasen und Radien",
};

export function VorlageBild({ id }) {
  const B = BILDER[id];
  return <div className="cam-vbild">{B ? <B /> : null}</div>;
}
