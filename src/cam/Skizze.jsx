// =================================================================
//  CAM: SKIZZE DES AUFBAUS (seit 1.224.0)
//
//  Zeigt, wie die App die Maschine sieht: links die Hauptspindel mit
//  Führungsbüchse und Stange, darüber und darunter die Supports (Paths
//  ausser 2) mit ihren Plätzen, rechts die Gegenspindel mit der Rückseite
//  (Path 2), deren Werkzeuge von oben nach unten schauen (Patrick).
//  Querwerkzeuge zeigen auf die Stange, Frontwerkzeuge auf das Ende der
//  Stange. Ein Platz zum Anklicken ändert seine Ausführung (klick).
// =================================================================
import { alt } from "../bruecke.jsx";
import { istRueckseite, istFront, istAngetrieben, platzArtText } from "./daten.js";

const KW = 54, KH = 100, ABST = 8;           // Kachel eines Platzes
const STANGE_Y = 230;                       // Mitte der Stange (Z-Achse)
const LINKS_X = 270;                        // erste Kachel links
const RUECK_X0 = 900;                       // Beginn der Rückseite

// Werkzeug, gezeichnet mit der Spitze nach unten (0, +24)
function Werkzeug({ art }) {
  const motor = istAngetrieben(art) && (
    <g className="cam-sk-motor">
      <rect x="-11" y="-30" width="22" height="16" rx="3" />
      <path d="M -7 -34 A 9 5 0 1 1 7 -34" fill="none" />
      <path d="M 7 -34 l -4 -3 m 4 3 l -4 3" fill="none" />
    </g>);
  if (art === "drehstahl") return (
    <g><rect x="-6" y="-26" width="12" height="38" className="cam-sk-schaft" />
      <path d="M -8 12 L 8 12 L 0 26 Z" className="cam-sk-platte" /></g>);
  if (art === "ang_front3") return (
    <g>{motor}{[-9, 0, 9].map((x) => <g key={x} transform={`translate(${x},0)`}>
      <rect x="-3" y="-14" width="6" height="30" className="cam-sk-schaft" /><path d="M -3 16 L 3 16 L 0 23 Z" className="cam-sk-platte" /></g>)}</g>);
  if (art === "leer") return <path d="M -10 -10 L 10 10 M 10 -10 L -10 10" className="cam-sk-leer" />;
  if (!art) return <text y="6" textAnchor="middle" className="cam-sk-frage">?</text>;
  // Bohrhalter und angetriebene: Halter mit Bohrer
  return (
    <g>{motor}<rect x="-9" y="-14" width="18" height="12" className="cam-sk-halter" />
      <rect x="-3" y="-2" width="6" height="20" className="cam-sk-schaft" />
      <path d="M -3 18 L 3 18 L 0 26 Z" className="cam-sk-platte" /></g>);
}

function Platz({ s, x, y, richtung, farbe, art, vorschlag, klick }) {
  const winkel = richtung === "hoch" ? 180 : richtung === "links" ? 90 : 0;
  return (
    <g className={"cam-sk-platz" + (vorschlag ? " cam-sk-platz--vorschlag" : "") + (klick ? " cam-sk-platz--klick" : "")}
      transform={`translate(${x},${y})`} data-sk-platz={s.nr} onClick={klick ? () => klick(s.nr) : undefined}>
      <title>{s.nr}: {platzArtText(art) || "offen"}{vorschlag ? " (Vorschlag)" : ""}</title>
      <rect width={KW} height={KH} rx="5" className="cam-sk-kachel" />
      <rect width={KW} height="17" rx="5" fill={farbe} />
      <rect y="10" width={KW} height="7" fill={farbe} />
      <text x={KW / 2} y="13" textAnchor="middle" className="cam-sk-nr">{s.nr}</text>
      <g transform={`translate(${KW / 2},${KH / 2 + 12}) rotate(${winkel})`}><Werkzeug art={art} /></g>
    </g>);
}

// Kürzel unter der Skizze
const KURZ = { drehstahl: "Drehstahl", bohrhalter: "Bohrhalter", ang_front: "Angetr. Front",
  ang_quer: "Angetr. Quer", ang_front3: "3-fach Front", leer: "nicht belegt" };

export default function AufbauSkizze({ paths, artVon, klick }) {
  const vorne = paths.filter((p) => !istRueckseite(p));
  const rueck = paths.filter(istRueckseite);
  const reihen = [];
  // Erster Support über der Stange, der nächste darunter, weitere wieder oben
  vorne.forEach((p, i) => reihen.push({ p, oben: i % 2 === 0, stufe: Math.floor(i / 2), i: paths.indexOf(p) }));
  const breiteVorne = Math.max(1, ...vorne.map((p) => p.type_slots.length)) * (KW + ABST);
  const rx0 = Math.max(RUECK_X0, LINKS_X + breiteVorne + 40);
  const breiteRueck = Math.max(0, ...rueck.map((p) => p.type_slots.length)) * (KW + ABST);
  const gx = rx0 + Math.max(breiteRueck, 200) + 30;      // Gegenspindel
  const W = gx + 150, H = 490;
  const stangeEnde = LINKS_X - 30;

  const platzLage = (r, j) => {
    const y = r.oben ? STANGE_Y - 60 - KH - r.stufe * (KH + 20) : STANGE_Y + 60 + r.stufe * (KH + 20);
    return { x: LINKS_X + j * (KW + ABST), y };
  };

  return (
    <svg className="cam-skizze" id="cam-skizze" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Skizze des Aufbaus">
      {/* Hauptspindel, Führungsbüchse, Stange */}
      <rect x="20" y={STANGE_Y - 55} width="120" height="110" rx="8" className="cam-sk-spindel" />
      <text x="80" y={STANGE_Y + 75} textAnchor="middle" className="cam-sk-titel">Hauptspindel</text>
      <rect x="140" y={STANGE_Y - 28} width="30" height="56" className="cam-sk-buechse" />
      <text x="145" y={STANGE_Y + 48} className="cam-sk-klein">Führungsbüchse</text>
      <rect x="40" y={STANGE_Y - 12} width={stangeEnde - 40} height="24" className="cam-sk-stange" />
      <line x1="10" y1={STANGE_Y} x2={stangeEnde + 15} y2={STANGE_Y} className="cam-sk-achse" />
      <text x={stangeEnde + 18} y={STANGE_Y + 4} className="cam-sk-klein">Z</text>

      {reihen.map((r) => {
        const farbe = alt.pathFarbe ? alt.pathFarbe(r.i) : "#003884";
        const ly = platzLage(r, 0).y;
        return (
          <g key={r.p.id} data-sk-path={r.p.id}>
            <text x={LINKS_X} y={r.oben ? ly - 8 : ly + KH + 18} className="cam-sk-titel" fill={farbe}>
              {r.p.name}{r.oben ? " · über der Stange" : " · unter der Stange"}</text>
            {r.p.type_slots.map((s, j) => {
              const nr = s.tool_nr || s.bezeichnung;
              const a = artVon(nr);
              const { x, y } = platzLage(r, j);
              const richtung = istFront(a.art) ? "links" : r.oben ? "runter" : "hoch";
              return <Platz key={s.id} s={{ nr }} x={x} y={y} richtung={richtung} farbe={farbe} art={a.art} vorschlag={a.vorschlag} klick={klick} />;
            })}
          </g>);
      })}

      {/* Rückseite: Gegenspindel rechts, Werkzeuge von oben nach unten */}
      {rueck.length > 0 && <line x1={rx0 - 20} y1="20" x2={rx0 - 20} y2={H - 20} className="cam-sk-trenn" />}
      <rect x={gx} y={STANGE_Y - 45} width="120" height="90" rx="8" className="cam-sk-spindel" />
      <rect x={gx - 45} y={STANGE_Y - 10} width="45" height="20" className="cam-sk-stange" />
      <text x={gx + 60} y={STANGE_Y + 65} textAnchor="middle" className="cam-sk-titel">Gegenspindel</text>
      {rueck.map((p, k) => {
        const farbe = alt.pathFarbe ? alt.pathFarbe(paths.indexOf(p)) : "#1c6b42";
        const y = STANGE_Y - 60 - KH - k * (KH + 30);
        return (
          <g key={p.id} data-sk-path={p.id}>
            <text x={rx0} y={y - 8} className="cam-sk-titel" fill={farbe}>{p.name} · Rückseite, Blick von oben</text>
            {p.type_slots.map((s, j) => {
              const nr = s.tool_nr || s.bezeichnung;
              const a = artVon(nr);
              return <Platz key={s.id} s={{ nr }} x={rx0 + j * (KW + ABST)} y={y} richtung="runter" farbe={farbe}
                art={a.art} vorschlag={a.vorschlag} klick={klick} />;
            })}
          </g>);
      })}

      {/* Legende */}
      <g transform={`translate(20, ${H - 26})`} className="cam-sk-legende">
        {Object.entries(KURZ).map(([k, t], i) => (
          <g key={k} transform={`translate(${i * 150}, 0)`}>
            <g transform="translate(10, 0) scale(.45)"><Werkzeug art={k} /></g>
            <text x="26" y="5" className="cam-sk-klein">{t}</text>
          </g>))}
      </g>
    </svg>
  );
}
