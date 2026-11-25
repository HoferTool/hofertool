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

// Lage je Maschinen-Nr.: x/y = Ecke oben links des Gehäuses, art = Zeichnung.
// Seit 1.799.3 (Patrick 25. November 2026: „die Lader stehen nebeneinander,
// in der Mitte kein Weg, eine Maschine etwas höher, die andere tiefer“,
// „Lader 3 m bei allen“, „Index viel länger … vertikal“, „Räume links an
// der Wand“): Massstab rund 60 Punkte je Meter, jeder Lader 180 lang.
// lader = Richtung des Stangenladers (links, rechts, oben, unten).
const LADER = 180, LADER_B = 26;
const ZEILE = (i) => 40 + i * 106;
const SX = 870, SW = 150;                 // Star-Block: linkes Gehäuse, Gehäuselänge
const SR = SX + SW + LADER;               // rechtes Gehäuse, Lader liegen dazwischen nebeneinander
const VERSATZ = LADER_B + 4;              // rechte Maschine etwas tiefer
const paar = (i, l, r) => ({
  [l]: { art: "star", x: SX, y: ZEILE(i), lader: "rechts" },
  [r]: { art: "star", x: SR, y: ZEILE(i) + VERSATZ, lader: "links" },
});
// Seit 1.800.0 (Patrick 25. November 2026: „Index auch ähnlich mit Lader
// kreuzen, aber ein wenig mehr Lücke dazwischen als bei Star“): oben Lader
// nach unten, unten Lader nach oben, die Lader nebeneinander, die untere
// Maschine um IV nach rechts versetzt (14 Punkte Lücke statt 4).
const IH = 190, IO = 40, IU = IO + IH + LADER, IV = LADER_B + 14;
export const LAGE = {
  309: { art: "index", x: 40, y: IO + LADER, lader: "oben" },
  308: { art: "index", x: 210, y: IO, lader: "unten" },
  307: { art: "index", x: 210 + IV, y: IU, lader: "oben" },
  305: { art: "index", x: 420, y: IO, lader: "unten" },
  306: { art: "index", x: 420 + IV, y: IU, lader: "oben" },
  // Hanwha gekreuzt wie die Index (Patrick 25. November 2026)
  201: { art: "hanwha", x: 640, y: 30, lader: "unten" },
  202: { art: "hanwha", x: 640 + LADER_B + 14, y: 30 + 150 + LADER, lader: "oben" },
  ...paar(0, 121, 130), ...paar(1, 128, 129), ...paar(2, 127, 126),
  ...paar(3, 122, 123), ...paar(4, 111, 124), ...paar(5, 120, 125),
  ...paar(6, 119, 116), ...paar(7, 115, 113), ...paar(8, 114, 117),
  401: { art: "macodel", x: SX, y: ZEILE(8) + 122, lader: "rechts" },
};
const DX = 110, B = SR + SW + 40 + DX, DY = 110, HALLE = 1180 + DY, H = HALLE + 60;

// Maschinen ohne Eintrag in der Datenbank (Patrick 25. November 2026: „oben
// links soll noch Takamaz hin als kleines Viereck“, „an oberer Wand sind noch
// konventionelle Maschinen, oben rechts Fräse, dann links davon Fräse
// Fehlmann“). Ihre Prüfmittel findet die App am Text (Notiz, Ort, Bezeichnung).
// Rechts von der Takamaz die GDW-Drehmaschinen und zwei Werkbänke, alle etwa
// so gross wie eine Star („breite etwa wie Maschine CNC wie Star“).
export const EXTRA = [
  { id: "x:takamaz", name: "Takamaz", such: /takamaz/i, x: 22, y: 22, w: 64, h: 64 },
  { id: "x:gdw", name: "GDW", such: /gdw/i, x: 110 + DX, y: 22, w: SW, h: 64 },
  { id: "x:fehlmann", name: "Fräse Fehlmann", such: /fehlmann/i, x: B - 360, y: 22, w: SW, h: 64 },
  { id: "x:fraese", name: "Fräse", such: /fr(ä|ae)se/i, ohne: /fehlmann/i, x: B - 190, y: 22, w: SW, h: 64 },
];
// Werkbänke: nur zur Orientierung, ohne Prüfmittel und nicht anwählbar
const BAENKE = [{ x: 290 + DX, y: 22 }, { x: 460 + DX, y: 22 }];
export function extraVon(p) {
  const t = [p.notiz, p.ort_text, p.bezeichnung].filter(Boolean).join(" ");
  const e = EXTRA.find((x) => x.such.test(t) && !(x.ohne && x.ohne.test(t)));
  return e ? e.id : null;
}
const GROESSE = { star: [SW, 64], index: [120, IH], hanwha: [60, SW], macodel: [220, 110] };

export default function Halle({ maschinen, zahl, faellig, gewaehlt, waehlen }) {
  const nachNr = new Map((maschinen || []).map((m) => [String(m.machine_number || ""), m]));
  return (
    <div className="pm-halle">
      <svg viewBox={`0 0 ${B} ${H}`} className="pm-halle__bild" role="img" aria-label="Hallenplan">
        <Vorlagen />
        <rect x="0" y="0" width={B} height={HALLE} fill="url(#hl-boden)" />
        <rect x="6" y="6" width={B - 12} height={HALLE - 12} fill="none" stroke="#6b7076" strokeWidth="12" />
        {BAENKE.map((b, i) => <g key={"bank" + i} className="hl-bank">
          <rect x={b.x} y={b.y} width={SW} height={44} rx="3" fill="#b98a58" stroke="#7a5532" strokeWidth="2" />
          <text x={b.x + SW / 2} y={b.y + 28} textAnchor="middle" className="hl-typ" fill="#3d2a17">Werkbank</text>
        </g>)}
        {EXTRA.map((e) => <Extra key={e.id} e={e} n={zahl.get(e.id) || 0} warn={faellig.has(e.id)}
          an={gewaehlt === e.id} waehlen={waehlen} />)}
        <g transform={`translate(${DX} ${DY})`}>
        {Object.entries(LAGE).map(([nr, l]) => {
          const m = nachNr.get(nr);
          return <Maschine key={nr} nr={nr} l={l} m={m} n={m ? zahl.get(m.id) || 0 : 0}
            warn={m ? faellig.has(m.id) : false} an={!!m && gewaehlt === m.id} waehlen={waehlen} />;
        })}
        </g>
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

function Maschine({ nr, l, m, n, warn, an, waehlen }) {
  const [w, h] = GROESSE[l.art];
  const klick = m ? (e) => waehlen(an ? null : m.id, e && e.currentTarget) : undefined;
  return (
    <g className={"hl-maschine" + (m ? "" : " hl-maschine--fehlt") + (an ? " hl-maschine--an" : "") + (n ? " hl-maschine--voll" : "")}
      data-hlnr={nr} data-pmmaschine={m ? m.id : undefined} onClick={klick} role={m ? "button" : undefined}
      tabIndex={m ? 0 : undefined} onKeyDown={(e) => { if (m && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); klick(e); } }}>
      <g filter="url(#hl-schatten)">
        <Lader l={l} w={w} h={h} />
        {l.art === "star" && <Star x={l.x} y={l.y} w={w} h={h} spiegel={l.lader === "rechts"} />}
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

// Konventionelle Maschine bzw. Takamaz: schlichter Kasten mit Namen
function Extra({ e, n, warn, an, waehlen }) {
  const klick = (ev) => waehlen(an ? null : e.id, ev && ev.currentTarget);
  return (
    <g className={"hl-maschine hl-extra" + (an ? " hl-maschine--an" : "") + (n ? " hl-maschine--voll" : "")}
      data-hlnr={e.name} data-pmmaschine={e.id} onClick={klick} role="button" tabIndex={0}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); klick(ev); } }}>
      <rect x={e.x} y={e.y} width={e.w} height={e.h} rx="6" fill="url(#hl-blech)" stroke="#8d949b" strokeWidth="2" filter="url(#hl-schatten)" />
      {an && <rect x={e.x - 6} y={e.y - 6} width={e.w + 12} height={e.h + 12} rx="8" className="hl-rahmen" />}
      <text x={e.x + e.w / 2} y={e.y + e.h / 2 + 7} textAnchor="middle" className="hl-nr hl-nr--auf"
        style={{ fontSize: e.w < 100 ? 12 : e.name.length > 10 ? 16 : 20 }}>{e.name}</text>
      {n > 0 && <g className={"hl-zahl" + (warn ? " hl-zahl--warn" : "")}>
        <circle cx={e.x + e.w - 4} cy={e.y + 4} r="17" />
        <text x={e.x + e.w - 4} y={e.y + 10} textAnchor="middle">{n}</text>
      </g>}
    </g>);
}

function Schild({ l, w, h, nr, m }) {
  const typ = m ? kurzTyp(m.name) : "";
  const hoch = l.art === "index" || l.art === "hanwha";
  const cx = l.x + w / 2, cy = l.y + h / 2 + (hoch ? 0 : 2);
  return (
    <g className="hl-schild">
      <text x={cx} y={cy} textAnchor="middle" className="hl-nr hl-nr--auf">{nr}</text>
      {typ && !(l.art === "hanwha") && <text x={cx} y={cy + 18} textAnchor="middle" className="hl-typ hl-typ--auf">{typ}</text>}
    </g>);
}

function kurzTyp(name) {
  return String(name || "").replace(/^Star\s*/i, "").replace(/\s*Zurbrügg$/i, "").replace(/^W&M\s*/, "Macodel ").replace(/\s*X1000$/, "");
}

// Stangenlader 3 m, an der Seite des Gehäuses, die l.lader nennt
function Lader({ l, w, h }) {
  const quer = l.lader === "links" || l.lader === "rechts";
  const lx = l.lader === "links" ? l.x - LADER : l.lader === "rechts" ? l.x + w : l.x + w / 2 - LADER_B / 2;
  const ly = l.lader === "oben" ? l.y - LADER : l.lader === "unten" ? l.y + h : l.y + h / 2 - LADER_B / 2;
  const rw = quer ? LADER : LADER_B, rh = quer ? LADER_B : LADER;
  // Endstück mit Motor auf der Seite weg vom Gehäuse
  const ex = l.lader === "links" ? lx - 4 : l.lader === "rechts" ? lx + rw - 10 : lx - 4;
  const ey = l.lader === "oben" ? ly - 4 : l.lader === "unten" ? ly + rh - 10 : ly - 4;
  return (
    <g>
      <rect x={lx} y={ly} width={rw} height={rh} rx="4" fill="url(#hl-lader)" stroke="#8d949b" strokeWidth="1.5" />
      {[0.3, 0.5, 0.7].map((f) => quer
        ? <line key={f} x1={lx + 8} x2={lx + rw - 8} y1={ly + rh * f} y2={ly + rh * f} stroke="#9aa1a8" strokeWidth="1" />
        : <line key={f} y1={ly + 8} y2={ly + rh - 8} x1={lx + rw * f} x2={lx + rw * f} stroke="#9aa1a8" strokeWidth="1" />)}
      <rect x={ex} y={ey} width={quer ? 14 : rw + 8} height={quer ? rh + 8 : 14} rx="3" fill="url(#hl-dunkel)" />
    </g>
  );
}

// Langdreher Star: Gehäuse mit Haube, Tür mit Scheibe, Bedienpult zum Gang,
// Signalsäule, dahinter das lange Stangenlademagazin
function Star({ x, y, w, h, spiegel }) {
  return (
    <g transform={spiegel ? `translate(${2 * x + w} 0) scale(-1 1)` : undefined}>
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
