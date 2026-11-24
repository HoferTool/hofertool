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
// Seit 1.727.0 innen und aussen: innen liegt das Material oben, die Zähne
// zeigen zur Achse, X ist der Nenn-Ø und die Platte schneidet nach aussen.
function G76({ w }) {
  const innen = w?.lage === "innen";
  const zaehne = [];
  for (let i = 0; i < 6; i++) {
    const x = 20 + i * 26;
    zaehne.push(innen ? `L${x + 13} 56 L${x + 26} 78` : `L${x + 13} 66 L${x + 26} 44`);
  }
  if (innen) return (
    <svg viewBox="0 0 220 130">
      <Defs />
      <path d={`M20 78 ${zaehne.join(" ")} L176 14 L20 14 Z`} className="cam-vbild__teil" />
      <line x1="6" y1="122" x2="214" y2="122" className="cam-vbild__achse" />
      <Text x="98" y="108" cls="cam-vbild__klein">Bohrung</Text>
      {/* Platte im Gang, Spitze nach oben ins Material */}
      <path d="M85 60 L72 82 L98 82 Z" className="cam-vbild__wz" transform="translate(0 6)" />
      {[0, 1, 2, 3].map((k) => (
        <path key={k} d={`M${73 + k * 2} ${86 - k * 5} L${85 + k * 1} 66`} className="cam-vbild__stufe" />
      ))}
      <Pfeil x1="112" y1="104" x2="96" y2="78" cls="cam-vbild__weg" />
      <Text x="114" y="98" anker="start" cls="cam-vbild__klein">Zustellung nach aussen</Text>
      <Pfeil x1="20" y1="90" x2="46" y2="90" beide />
      <Text x="33" y="100">F</Text>
      <Pfeil x1="190" y1="56" x2="190" y2="78" beide />
      <line x1="176" y1="56" x2="196" y2="56" className="cam-vbild__hilf" />
      <line x1="176" y1="78" x2="196" y2="78" className="cam-vbild__hilf" />
      <Text x="200" y="71" anker="start">P</Text>
      <Text x="140" y="34" cls="cam-vbild__klein">Nenn-Ø X</Text>
      <Text x="60" y="34" cls="cam-vbild__klein">60°</Text>
    </svg>
  );
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

// X-Y Synchronsteuerung M50 (seit 1.726.0, Handbuch SW-20 8-14-19):
// oben Träger 1 mit dem führenden Werkzeug, unten Träger 3 mit dem
// folgenden; beide fahren in X denselben Weg, etwa beim Ausgleichsdrehen
function M50() {
  return (
    <svg viewBox="0 0 220 130">
      <Defs />
      <line x1="6" y1="65" x2="214" y2="65" className="cam-vbild__achse" />
      <rect x="14" y="47" width="116" height="36" className="cam-vbild__teil" />
      {/* Träger 1 oben, Träger 3 unten */}
      <rect x="66" y="6" width="44" height="18" rx="2" className="cam-vbild__t1" />
      <path d="M82 24 L94 24 L88 40 Z" className="cam-vbild__wz" />
      <rect x="66" y="106" width="44" height="18" rx="2" className="cam-vbild__t3" />
      <path d="M82 106 L94 106 L88 90 Z" className="cam-vbild__wz" />
      <Text x="70" y="19" anker="start" cls="cam-vbild__klein cam-vbild__hell">Kanal 1</Text>
      <Text x="70" y="119" anker="start" cls="cam-vbild__klein cam-vbild__hell">Kanal 3</Text>
      {/* gleicher Weg in X */}
      <Pfeil x1="120" y1="12" x2="120" y2="34" cls="cam-vbild__weg" />
      <Pfeil x1="120" y1="118" x2="120" y2="96" cls="cam-vbild__weg" />
      <Text x="126" y="27" anker="start">X1 führt</Text>
      <Text x="126" y="111" anker="start">X3 folgt</Text>
      <Text x="150" y="58" anker="start" cls="cam-vbild__klein">M50 X[13]</Text>
      <Text x="150" y="70" anker="start" cls="cam-vbild__klein">… gleicher Weg …</Text>
      <Text x="150" y="82" anker="start" cls="cam-vbild__klein">M51 aus</Text>
    </svg>
  );
}

// Superposition Z1-Z3 M142 (seit 1.726.0, Handbuch SW-20 8-14-22): das
// Material fährt in Z1 für das Drehwerkzeug, der Bohrer von Träger 3 an der
// Stirn fährt Z3 überlagert dazu, beide arbeiten gleichzeitig
function M142() {
  return (
    <svg viewBox="0 0 220 130">
      <Defs />
      <line x1="6" y1="62" x2="214" y2="62" className="cam-vbild__achse" />
      <rect x="14" y="44" width="106" height="36" className="cam-vbild__teil" />
      <rect x="96" y="56" width="24" height="12" className="cam-vbild__loch" />
      {/* Drehwerkzeug Kanal 1 von oben */}
      <rect x="60" y="6" width="34" height="16" rx="2" className="cam-vbild__t1" />
      <path d="M72 22 L84 22 L78 40 Z" className="cam-vbild__wz" />
      {/* Bohrer Kanal 3 an der Stirn */}
      <path d="M100 58 L106 58 L106 66 L100 66 L96 62 Z" className="cam-vbild__wz" />
      <rect x="106" y="58" width="44" height="8" className="cam-vbild__wz" />
      <rect x="150" y="50" width="40" height="24" rx="2" className="cam-vbild__t3" />
      <Text x="154" y="65" anker="start" cls="cam-vbild__klein cam-vbild__hell">Kanal 3</Text>
      <Text x="64" y="17" anker="start" cls="cam-vbild__klein cam-vbild__hell">Kanal 1</Text>
      {/* Wege */}
      <Pfeil x1="30" y1="96" x2="70" y2="96" cls="cam-vbild__weg" />
      <Text x="50" y="108">Z1 Material</Text>
      <Pfeil x1="200" y1="96" x2="150" y2="96" cls="cam-vbild__weg" />
      <Text x="176" y="108">Z3 + Z1</Text>
      <Text x="110" y="124" cls="cam-vbild__klein">M142 … M143: beide arbeiten gleichzeitig</Text>
    </svg>
  );
}

// Tieflochbohren mit Pilot (seit 1.764.0): anbohren, in die Pilotbohrung
// mit wenig Hochdruck, dann G83 mit viel Hochdruck, Eilgang gesenkt
function TiefPilot() {
  return (
    <svg viewBox="0 0 220 130">
      <Defs />
      <line x1="6" y1="62" x2="214" y2="62" className="cam-vbild__achse" />
      <rect x="14" y="22" width="126" height="80" className="cam-vbild__teil" />
      <rect x="40" y="55" width="100" height="14" className="cam-vbild__loch" />
      <line x1="118" y1="55" x2="118" y2="69" className="cam-vbild__stufe" />
      <path d="M40 55 L34 62 L40 69" className="cam-vbild__loch" />
      <path d="M160 56 L150 56 L145 62 L150 68 L160 68 Z" className="cam-vbild__wz" />
      <rect x="160" y="56" width="46" height="12" className="cam-vbild__wz" />
      <Pfeil x1="140" y1="110" x2="118" y2="110" beide />
      <Text x="129" y="124">Pilot</Text>
      <Pfeil x1="118" y1="110" x2="36" y2="110" beide />
      <Text x="77" y="124">Tiefe W (G83)</Text>
      <Text x="129" y="48" cls="cam-vbild__klein">HD D2</Text>
      <Text x="77" y="48" cls="cam-vbild__klein">HD D7</Text>
      <Text x="150" y="16" anker="middle" cls="cam-vbild__klein">Eilgang 15 → 35 m/min</Text>
    </svg>
  );
}

// Zähler (seit 1.764.0): Kästen ineinander, je Ebene Anzahl und Zähler,
// zeichnet sich nach den Feldern
function Zaehler({ w = {} }) {
  const n = Math.max(1, Math.min(3, Number(w.EB) || 1));
  const box = [];
  for (let k = 1; k <= n; k++) {
    const r = (k - 1) * 16;
    box.push(
      <g key={k}>
        <rect x={8 + r} y={8 + r * 0.9} width={204 - 2 * r} height={114 - 1.8 * r} rx="6" className={k === n ? "cam-vbild__wz" : "cam-vbild__teil"} />
        <Text x={14 + r} y={20 + r * 0.9} anker="start" cls="cam-vbild__klein">{"Ebene " + k + ": " + (w["N" + k] || "?") + " × (#" + String(w["V" + k] || "").replace(/^#/, "") + ")"}</Text>
        <path d={`M${206 - r} ${30 + r * 0.9} A 10 10 0 1 1 ${196 - r} ${22 + r * 0.9}`} className="cam-vbild__weg" markerEnd="url(#cvb-pfeil)" />
      </g>
    );
  }
  return (
    <svg viewBox="0 0 220 130">
      <Defs />
      {box}
      <Text x="110" y={74 + (n - 1) * 8} cls="cam-vbild__text">Code je Durchgang</Text>
    </svg>
  );
}

const BILDER = { g83: G83, zaehler: Zaehler, tiefpilot: TiefPilot, g87: G87, g76: G76, einstich: Einstich, m50: M50, m142: M142 };
export const VORLAGE_TEXT = {
  g83: "Bohren in Schritten mit Rückzug zum Spänebrechen, in der Mitte oder angetrieben auf Lochkreis oder X/Y",
  tiefpilot: "Anbohren, mit wenig Hochdruck in die Pilotbohrung, dann G83 mit viel Hochdruck, Eilgang dafür gesenkt (G10L52 N1420)",
  zaehler: "Code mehrmals wiederholen mit WHILE / DO, auch Zähler im Zähler bis 3 Ebenen, der Zähler lässt sich im Code brauchen",
  g87: "Bohrungen quer über den Umfang, gleich oder frei verteilt, wahlweise mit Z je Bohrung",
  g76: "Aussen- oder Innengewinde in mehreren Durchgängen an der Flanke",
  einstich: "Nut am Mantel, innen in der Bohrung oder an der Front, mit Fasen und Radien",
  m50: "X oder Y des anderen Trägers fährt den gleichen Weg mit, z. B. Ausgleichsdrehen mit Kanal 1 und 3 (nur SW-20)",
  m142: "Bohrer von Kanal 3 fährt in Z3 überlagert zum Material Z1, beide arbeiten gleichzeitig (nur SW-20, mit M131)",
};

export function VorlageBild({ id, w }) {
  const B = BILDER[id];
  return <div className="cam-vbild">{B ? <B w={w} /> : null}</div>;
}
