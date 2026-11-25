// =================================================================
//  HALLENKARTE (seit 1.797.0, Wunsch Patrick 25. November 2026: „eine
//  Draufsicht mit den Maschinen so wie sie auf dem Bild notiert sind …
//  unterhalb von 114 steht noch eine Macodel … etwas links davon von 114
//  ist die Treppe, die dann aus dem Raum geht … eine Draufsicht von der
//  QS-Seite her … so real gezeichnet“, dazu „305–307 sind vertikal und
//  bei 305 stehen noch die zwei Hanwhas, auch vertikal“, „309 ganz links“).
//  Gezeichnet als SVG in groben Massen, Lage nach Patricks Blatt. Jede
//  Maschine ist antippbar, das Abzeichen zeigt die Prüfmittel daran.
//  Steht eine Maschine nicht im Plan (LAGE), kommt sie unter die Karte.
// =================================================================

// Lage je Maschinen-Nr.: x/y = Ecke oben links des Gehäuses, art = Zeichnung,
// spiegel = Lademagazin nach rechts statt nach links
const ZEILE = (i) => 70 + i * 112;
const LINKS = 905, RECHTS = 1355;
export const LAGE = {
  309: { art: "index", x: 40, y: 30 },
  308: { art: "index", x: 230, y: 30 },
  307: { art: "index", x: 230, y: 270 },
  305: { art: "index", x: 420, y: 30 },
  306: { art: "index", x: 420, y: 270 },
  201: { art: "hanwha", x: 575, y: 60 },
  202: { art: "hanwha", x: 665, y: 60 },
  121: { art: "star", x: LINKS, y: ZEILE(0) }, 130: { art: "star", x: RECHTS, y: ZEILE(0), spiegel: true },
  128: { art: "star", x: LINKS, y: ZEILE(1) }, 129: { art: "star", x: RECHTS, y: ZEILE(1), spiegel: true },
  127: { art: "star", x: LINKS, y: ZEILE(2) }, 126: { art: "star", x: RECHTS, y: ZEILE(2), spiegel: true },
  122: { art: "star", x: LINKS, y: ZEILE(3) }, 123: { art: "star", x: RECHTS, y: ZEILE(3), spiegel: true },
  111: { art: "star", x: LINKS, y: ZEILE(4) }, 124: { art: "star", x: RECHTS, y: ZEILE(4), spiegel: true },
  120: { art: "star", x: LINKS, y: ZEILE(5) }, 125: { art: "star", x: RECHTS, y: ZEILE(5), spiegel: true },
  119: { art: "star", x: LINKS, y: ZEILE(6) }, 116: { art: "star", x: RECHTS, y: ZEILE(6), spiegel: true },
  115: { art: "star", x: LINKS, y: ZEILE(7) }, 113: { art: "star", x: RECHTS, y: ZEILE(7), spiegel: true },
  114: { art: "star", x: LINKS, y: ZEILE(8) }, 117: { art: "star", x: RECHTS, y: ZEILE(8), spiegel: true },
  401: { art: "macodel", x: LINKS, y: ZEILE(8) + 100 },
};
// Unter der Halle die Räume, links nach rechts wie auf Patricks Skizze (25. November 2026)
const B = 1700, HALLE = 1250, H = 1470;
const RAEUME = ["Schleuderei", "Wäscherei", "Lager", "Programmierzimmer"];
const GROESSE = { star: [170, 72], index: [130, 200], hanwha: [70, 130], macodel: [270, 120] };

export default function Halle({ maschinen, zahl, faellig, gewaehlt, waehlen }) {
  const nachNr = new Map((maschinen || []).map((m) => [String(m.machine_number || ""), m]));
  return (
    <div className="pm-halle">
      <svg viewBox={`0 0 ${B} ${H}`} className="pm-halle__bild" role="img" aria-label="Hallenplan">
        <Vorlagen />
        <rect x="0" y="0" width={B} height={HALLE} fill="url(#hl-boden)" />
        {/* Gehweg zwischen den Star-Reihen, gelb markiert wie in der Halle */}
        <rect x="1085" y="10" width="260" height={HALLE - 20} fill="#ebe7de" />
        <line x1="1085" y1="10" x2="1085" y2={HALLE - 10} className="hl-gelb" />
        <line x1="1345" y1="10" x2="1345" y2={HALLE - 10} className="hl-gelb" />
        <rect x="6" y="6" width={B - 12} height={HALLE - 12} fill="none" stroke="#6b7076" strokeWidth="12" />
        <Raeume />
        <Treppe />
        {Object.entries(LAGE).map(([nr, l]) => {
          const m = nachNr.get(nr);
          return <Maschine key={nr} nr={nr} l={l} m={m} n={m ? zahl.get(m.id) || 0 : 0}
            warn={m ? faellig.has(m.id) : false} an={!!m && gewaehlt === m.id} waehlen={waehlen} />;
        })}
        <text x={B / 2} y={H - 22} textAnchor="middle" className="hl-qs">▼ Blick von der QS ▼</text>
      </svg>
    </div>
  );
}

// Farbverläufe und Bodenmuster, einmal je Karte
function Vorlagen() {
  return (
    <defs>
      <pattern id="hl-boden" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="#f2efe8" />
        <path d="M40 0H0V40" fill="none" stroke="#e2ddd2" strokeWidth="1.5" />
      </pattern>
      <linearGradient id="hl-blech" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fbfcfd" /><stop offset=".55" stopColor="#e3e7eb" /><stop offset="1" stopColor="#c7cdd3" />
      </linearGradient>
      <linearGradient id="hl-dunkel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#59636d" /><stop offset="1" stopColor="#353c43" />
      </linearGradient>
      <linearGradient id="hl-glas" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#b9d0e0" /><stop offset=".5" stopColor="#7d9ab0" /><stop offset="1" stopColor="#56718a" />
      </linearGradient>
      <linearGradient id="hl-lader" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#eef0f2" /><stop offset="1" stopColor="#b9bfc5" />
      </linearGradient>
      <filter id="hl-schatten" x="-10%" y="-10%" width="130%" height="140%">
        <feDropShadow dx="4" dy="6" stdDeviation="4" floodColor="#000" floodOpacity=".28" />
      </filter>
    </defs>
  );
}

function Raeume() {
  const y = HALLE - 6, h = H - 60 - y, w = (B - 12) / RAEUME.length;
  return (
    <g className="hl-raeume">
      {RAEUME.map((name, i) => {
        const x = 6 + i * w;
        return (
          <g key={name}>
            <rect x={x} y={y} width={w} height={h} fill="#e4e7ea" stroke="#6b7076" strokeWidth="12" />
            {/* Türe zur Halle */}
            <rect x={x + w / 2 - 45} y={y - 7} width="90" height="14" fill="#e4e7ea" />
            <path d={`M${x + w / 2 - 45} ${y + 6} a90 90 0 0 1 90 0`} fill="none" stroke="#9aa1a8" strokeWidth="2" strokeDasharray="6 5" />
            <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" className="hl-raum">{name}</text>
          </g>
        );
      })}
    </g>
  );
}

function Treppe() {
  const x = 620, y = 930, w = 150, h = 220, stufen = 11;
  return (
    <g className="hl-treppe">
      <rect x={x} y={y} width={w} height={h} fill="#cfd3d6" stroke="#7b8187" strokeWidth="2" />
      {Array.from({ length: stufen }, (_, i) => (
        <rect key={i} x={x + 4} y={y + 4 + i * ((h - 8) / stufen)} width={w - 8} height={(h - 8) / stufen - 3}
          fill={`hsl(210 6% ${86 - i * 3}%)`} />))}
      <rect x={x - 6} y={y} width="6" height={h} fill="#8a6d3b" />
      <rect x={x + w} y={y} width="6" height={h} fill="#8a6d3b" />
      <path d={`M${x + w / 2} ${y + 40} v${h - 80} m-16 -18 l16 18 l16 -18`} fill="none" stroke="#3b4148" strokeWidth="5" strokeLinecap="round" />
      <text x={x + w / 2} y={y - 12} textAnchor="middle" className="hl-schrift">Treppe hinaus</text>
    </g>
  );
}

function Maschine({ nr, l, m, n, warn, an, waehlen }) {
  const [w, h] = GROESSE[l.art];
  const klick = m ? () => waehlen(an ? null : m.id) : undefined;
  return (
    <g className={"hl-maschine" + (m ? "" : " hl-maschine--fehlt") + (an ? " hl-maschine--an" : "") + (n ? " hl-maschine--voll" : "")}
      data-hlnr={nr} data-pmmaschine={m ? m.id : undefined} onClick={klick} role={m ? "button" : undefined}
      tabIndex={m ? 0 : undefined} onKeyDown={(e) => { if (m && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); klick(); } }}>
      <g filter="url(#hl-schatten)">
        {l.art === "star" && <Star x={l.x} y={l.y} w={w} h={h} spiegel={l.spiegel} />}
        {l.art === "index" && <Index x={l.x} y={l.y} w={w} h={h} />}
        {l.art === "hanwha" && <Hanwha x={l.x} y={l.y} w={w} h={h} />}
        {l.art === "macodel" && <Macodel x={l.x} y={l.y} w={w} h={h} />}
      </g>
      {an && <rect x={l.x - 6} y={l.y - 6} width={w + 12} height={h + 12} rx="8" className="hl-rahmen" />}
      <Schild l={l} w={w} h={h} nr={nr} m={m} />
      {n > 0 && <g className={"hl-zahl" + (warn ? " hl-zahl--warn" : "")}>
        <circle cx={l.x + w - 4} cy={l.y + 4} r="17" />
        <text x={l.x + w - 4} y={l.y + 10} textAnchor="middle">{n}</text>
      </g>}
    </g>
  );
}

function Schild({ l, w, h, nr, m }) {
  const typ = m ? kurzTyp(m.name) : "";
  if (l.art === "index" || l.art === "hanwha") {
    return (
      <g className="hl-schild" transform={`translate(${l.x + w / 2} ${l.y + h + 22})`}>
        <text textAnchor="middle" className="hl-nr">{nr}</text>
        {typ && <text textAnchor="middle" y="20" className="hl-typ">{typ}</text>}
      </g>);
  }
  const mx = l.x + (l.art === "star" ? (l.spiegel ? 36 : w - 36) : w / 2);
  return (
    <g className="hl-schild">
      <text x={l.art === "star" ? l.x + w / 2 : mx} y={l.y + h / 2 + 2} textAnchor="middle" className="hl-nr hl-nr--auf">{nr}</text>
      {typ && <text x={l.art === "star" ? l.x + w / 2 : mx} y={l.y + h / 2 + 20} textAnchor="middle" className="hl-typ hl-typ--auf">{typ}</text>}
    </g>);
}

function kurzTyp(name) {
  return String(name || "").replace(/^Star\s*/i, "").replace(/\s*Zurbrügg$/i, "").replace(/^W&M\s*/, "Macodel ").replace(/\s*X1000$/, "");
}

// Langdreher Star: Gehäuse mit Haube, Tür mit Scheibe, Bedienpult zum Gang,
// Signalsäule, dahinter das lange Stangenlademagazin
function Star({ x, y, w, h, spiegel }) {
  const lw = 132, lh = 28;
  return (
    <g transform={spiegel ? `translate(${2 * x + w} 0) scale(-1 1)` : undefined}>
      <rect x={x - lw} y={y + h / 2 - lh / 2} width={lw} height={lh} rx="4" fill="url(#hl-lader)" stroke="#8d949b" strokeWidth="1.5" />
      {[0.3, 0.5, 0.7].map((f) => <line key={f} x1={x - lw + 8} x2={x - 4} y1={y + h / 2 - lh / 2 + lh * f} y2={y + h / 2 - lh / 2 + lh * f} stroke="#9aa1a8" strokeWidth="1" />)}
      <rect x={x - lw - 6} y={y + h / 2 - lh / 2 - 4} width="14" height={lh + 8} rx="3" fill="url(#hl-dunkel)" />
      <rect x={x} y={y} width={w} height={h} rx="6" fill="url(#hl-blech)" stroke="#7f878f" strokeWidth="1.5" />
      <rect x={x + 4} y={y + 4} width={w - 8} height="13" rx="3" fill="url(#hl-dunkel)" />
      <rect x={x + 6} y={y + 17} width={w - 12} height="4" fill="#0b5cab" />
      <rect x={x + 34} y={y + 27} width={w - 82} height={h - 36} rx="4" fill="url(#hl-glas)" stroke="#5d6b78" strokeWidth="1" opacity=".92" />
      <line x1={x + 40} y1={y + 32} x2={x + 60} y2={y + h - 14} stroke="#fff" strokeOpacity=".35" strokeWidth="4" />
      <rect x={x + w - 40} y={y + 26} width="30" height={h - 34} rx="3" fill="#2a3138" />
      <rect x={x + w - 36} y={y + 30} width="22" height="16" rx="2" fill="#5fb0ea" />
      {[0, 1, 2, 3].map((i) => <circle key={i} cx={x + w - 31 + (i % 2) * 12} cy={y + 52 + Math.floor(i / 2) * 7} r="2" fill="#9aa3ab" />)}
      <circle cx={x + 12} cy={y + 10} r="5" fill="#2ecc71" stroke="#1d2a22" strokeWidth="1" />
      <rect x={x + 8} y={y + h - 12} width="22" height="8" rx="2" fill="#7a8590" />
    </g>
  );
}

// Index C100 hochkant: grosses Gehäuse, Scheibe vorne, Pult, Späneförderer
function Index({ x, y, w, h }) {
  return (
    <g>
      <rect x={x + w / 2 - 14} y={y - 24} width="28" height="26" rx="3" fill="#8f979e" stroke="#6b737a" />
      <rect x={x} y={y} width={w} height={h} rx="8" fill="url(#hl-blech)" stroke="#7a828a" strokeWidth="1.5" />
      <rect x={x + 5} y={y + 5} width={w - 10} height="26" rx="4" fill="url(#hl-dunkel)" />
      <text x={x + w / 2} y={y + 23} textAnchor="middle" className="hl-marke">INDEX</text>
      <rect x={x + 16} y={y + 44} width={w - 52} height={h - 70} rx="5" fill="url(#hl-glas)" stroke="#5d6b78" opacity=".92" />
      <line x1={x + 24} y1={y + 52} x2={x + 44} y2={y + h - 34} stroke="#fff" strokeOpacity=".35" strokeWidth="5" />
      <rect x={x + w - 30} y={y + 44} width="22" height="62" rx="3" fill="#2a3138" />
      <rect x={x + w - 27} y={y + 48} width="16" height="18" rx="2" fill="#5fb0ea" />
      <rect x={x + 8} y={y + h - 18} width={w - 16} height="10" rx="3" fill="#f39c12" opacity=".85" />
      <circle cx={x + w - 14} cy={y + 18} r="5" fill="#2ecc71" stroke="#1d2a22" />
    </g>
  );
}

// Hanwha XP-16S hochkant: schmaler Langdreher mit Lademagazin nach oben
function Hanwha({ x, y, w, h }) {
  return (
    <g>
      <rect x={x + w / 2 - 12} y={y - 50} width="24" height="52" rx="4" fill="url(#hl-lader)" stroke="#8d949b" />
      <rect x={x} y={y} width={w} height={h} rx="6" fill="url(#hl-blech)" stroke="#7a828a" strokeWidth="1.5" />
      <rect x={x + 4} y={y + 4} width={w - 8} height="14" rx="3" fill="#c0392b" />
      <rect x={x + 10} y={y + 26} width={w - 20} height={h - 66} rx="4" fill="url(#hl-glas)" stroke="#5d6b78" opacity=".92" />
      <rect x={x + 12} y={y + h - 34} width={w - 24} height="24" rx="3" fill="#2a3138" />
      <rect x={x + 16} y={y + h - 30} width="18" height="12" rx="2" fill="#5fb0ea" />
    </g>
  );
}

// Willemin-Macodel 508MT2: kastenförmig, rundes Werkzeugmagazin, Scheibe
function Macodel({ x, y, w, h }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="10" fill="url(#hl-blech)" stroke="#7a828a" strokeWidth="1.5" />
      <rect x={x + 6} y={y + 6} width={w - 12} height="18" rx="4" fill="#b3202a" />
      <circle cx={x + 52} cy={y + 70} r="34" fill="#cfd4d9" stroke="#7a828a" strokeWidth="2" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <circle key={i} cx={x + 52 + Math.cos(a) * 24} cy={y + 70 + Math.sin(a) * 24} r="4" fill="#5d6770" />;
      })}
      <rect x={x + 100} y={y + 34} width={w - 160} height={h - 46} rx="5" fill="url(#hl-glas)" stroke="#5d6b78" opacity=".92" />
      <rect x={x + w - 50} y={y + 34} width="38" height="56" rx="3" fill="#2a3138" />
      <rect x={x + w - 46} y={y + 38} width="30" height="20" rx="2" fill="#5fb0ea" />
    </g>
  );
}
