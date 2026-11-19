// =================================================================
//  ERKLÄRUNGSBILD SCHNABELZANGE GEGENSPINDEL (seit 1.640.0)
//  Wunsch Patrick 19. November 2026: „mach mir davon auch ein graphisches
//  Bild zur Eingabe. Bei einer Schnabelzange steht die Zange um Wert B aus
//  der Überwurfmutter (Spindelnase) heraus.“ Ansicht wie an der Maschine
//  und in der Simulation: Teil links, Gegenspindel rechts.
// =================================================================
import { zahl } from "./hofercam.js";

const M = 8; // Punkte je mm

export default function SchnabelBild({ b }) {
  const bZahl = Number(zahl(b));
  const leer = zahl(b) == null;
  const B = Math.max(1, Math.min(20, leer ? 6 : bZahl || 0.5));
  const W = 420, H = 230, ym = 118;
  const nase = 270;                 // Stirn der Überwurfmutter
  const spitze = nase - B * M;      // Stirn der Zange
  const rTeil = 16, rZange = 26, rMutter = 46;
  return (
    <svg className="cam-abbild" data-cam-schnabelbild viewBox={`0 0 ${W} ${H}`} width={W} height={H}
      role="img" aria-label="Schnabelzange Gegenspindel">
      {/* Teil in der Zange */}
      <rect x={spitze - 70} y={ym - rTeil} width={nase - spitze + 110} height={rTeil * 2} className="cam-abbild__stange" />
      <text x={spitze - 66} y={ym + 4} className="cam-abbild__klein">Teil</text>
      {/* Spindelkörper */}
      <rect x={nase + 30} y={ym - 70} width={W - nase - 34} height={140} rx={4} className="cam-abbild__buechse" />
      <text x={(nase + 30 + W - 4) / 2} y={ym + 4} textAnchor="middle" className="cam-abbild__klein">Gegenspindel</text>
      {/* Überwurfmutter (Spindelnase) */}
      <rect x={nase} y={ym - rMutter} width={34} height={rMutter * 2} rx={3} className="cam-abbild__schaft" />
      <text x={nase + 17} y={ym - 76} textAnchor="middle" className="cam-abbild__klein">Überwurfmutter</text>
      {/* Schnabelzange: schlanke Nase, die aus der Mutter heraussteht */}
      <polygon className="cam-abbild__platte"
        points={`${spitze},${ym - rTeil - 6} ${nase + 34},${ym - rZange} ${nase + 34},${ym - rTeil} ${spitze + 6},${ym - rTeil}`} />
      <polygon className="cam-abbild__platte"
        points={`${spitze},${ym + rTeil + 6} ${nase + 34},${ym + rZange} ${nase + 34},${ym + rTeil} ${spitze + 6},${ym + rTeil}`} />
      <text x={spitze - 4} y={ym - rTeil - 12} textAnchor="end" className="cam-abbild__klein">Schnabelzange</text>
      {/* Stirn der Mutter und der Zange */}
      <line x1={nase} y1={ym + rMutter} x2={nase} y2={ym + rMutter + 26} className="cam-abbild__ebene" />
      <line x1={spitze} y1={ym + rTeil + 6} x2={spitze} y2={ym + rMutter + 26} className="cam-abbild__ebene" />
      <g className="cam-abbild__mass">
        <line x1={spitze} y1={ym + rMutter + 20} x2={nase} y2={ym + rMutter + 20} />
        <text x={(spitze + nase) / 2} y={ym + rMutter + 16} textAnchor="middle">{leer ? "B leer (B0.)" : `B ${bZahl}`}</text>
      </g>
      <text x={6} y={H - 8} className="cam-abbild__titel">{`Ende Kanal 2: G131B${zahl(b) ?? "0."}`}</text>
    </svg>
  );
}
