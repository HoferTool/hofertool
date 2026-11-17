// =================================================================
//  ERKLÄRUNGSBILD ABSTECHER T100 (seit 1.591.0)
//  Wunsch Patrick 17. November 2026: „bei Versatz vom Abstecher soll für
//  die ausgewählte Variante ein Erklärungsbild erscheinen beim Auswählen“.
//  Ansicht wie an der Maschine: Büchse links, +Z nach links, Teil rechts.
//  Lage wie in der Simulation (camMaschine.js): Schaft 12 breit von der
//  Drehebene weg, normal Platte an der Seite zur Büchse, versetzt an der
//  anderen Seite um Versatz − B vor der Ebene.
// =================================================================
const M = 9; // Punkte je mm

export default function AbstecherBild({ art, versatz, b, abz }) {
  const vers = art === "versetzt";
  const zText = String(abz).includes(".") ? String(abz) : abz + "."; // wie im Programm, Z-10.
  const bZahl = Number(String(b ?? "").replace(",", ".")) || 0;
  const B = Math.max(0.5, Math.min(6, bZahl || 2));
  const V = Math.max(0, Math.min(30, Number(String(versatz).replace(",", ".")) || 10));
  const off = vers ? Math.max(0, Number(abz) || 0) : 0;   // Platte vor der Ebene, wie im Programm
  const breit = Math.max(12, V, off + B) + 22;
  const x0 = 70;                          // Drehebene in Punkten
  const zx = (mm) => x0 + mm * M;         // mm vor der Ebene → nach rechts
  const yStange = 140, rStange = 24;
  const W = Math.max(330, x0 + breit * M), H = 236;
  const pl = zx(off), schaftL = zx(0), schaftR = zx(12);
  return (
    <svg className="cam-abbild" data-cam-abbild={vers ? "versetzt" : "normal"} viewBox={`0 0 ${W} ${H}`} width={W} height={H}
      role="img" aria-label={vers ? "Abstecher versetzt" : "Abstecher normal"}>
      {/* Führungsbüchse und Stange */}
      <rect x={4} y={yStange - 40} width={x0 - 18} height={80} rx={4} className="cam-abbild__buechse" />
      <text x={(x0 - 14) / 2 + 2} y={yStange + 4} textAnchor="middle" className="cam-abbild__klein">Büchse</text>
      <rect x={x0 - 14} y={yStange - rStange} width={W - x0 + 10} height={rStange * 2} className="cam-abbild__stange" />
      {/* Drehebene */}
      <line x1={x0} y1={30} x2={x0} y2={H - 30} className="cam-abbild__ebene" />
      <text x={x0 - 4} y={42} textAnchor="end" className="cam-abbild__klein">Drehebene</text>
      <text x={x0 - 4} y={55} textAnchor="end" className="cam-abbild__klein">Z0</text>
      {/* Schaft 12 × 12 */}
      <rect x={schaftL} y={30} width={12 * M} height={yStange - rStange - 52} className="cam-abbild__schaft" />
      <text x={(schaftL + schaftR) / 2} y={54} textAnchor="middle" className="cam-abbild__klein">Schaft 12</text>
      {/* Platte bis Drehmitte */}
      <rect x={pl} y={yStange - rStange - 22} width={B * M} height={rStange + 22} className="cam-abbild__platte" />
      <line x1={pl} y1={yStange - rStange} x2={pl} y2={yStange + rStange} className="cam-abbild__schnitt" />
      {vers ? <>
        {/* Versatz von der Schaftseite zur Büchse bis zur Aussenkante der Platte */}
        <Mass x1={schaftL} x2={zx(V)} y={22} text={`Versatz ${V}`} />
        <Mass x1={pl} x2={pl + B * M} y={yStange + rStange + 16} text={bZahl ? `B ${bZahl}` : "B leer"} />
        <Mass x1={x0} x2={pl} y={yStange + rStange + 36} text={`Z-${zText}`} />
      </> : <>
        <Mass x1={x0} x2={x0 + B * M} y={yStange + rStange + 16} text={bZahl ? `B ${bZahl}` : "B"} />
      </>}
      <text x={6} y={H - 8} className="cam-abbild__titel">
        {vers ? `versetzt: Kopf fährt G0X[#531+4.]Z-${zText}` : "normal: Platte an der Ebene, Z-0."}</text>
    </svg>
  );
}

function Mass({ x1, x2, y, text }) {
  return (
    <g className="cam-abbild__mass">
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} />
      <text x={(x1 + x2) / 2} y={y - 4} textAnchor="middle">{text}</text>
    </g>
  );
}
