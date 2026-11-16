// =================================================================
//  HYROX-ZIEHER MIT SCHLITTEN VOLLER HÜHNER, IM BAND OBEN
//  Geschichte (alles Wunsch Patrick): 1.130.0 bis 1.149.0 liefen hier
//  Hühner, 1.150.0 Ferrari und Mario, 1.151.0 bis 1.210.x Jiviano auf
//  dem Jetski, 1.211.0 bis 1.323.x zogen Hühner mit ihrem Stall um,
//  1.324.0 bis 1.441.x schlurften Zombies vorbei, 1.442.0 bis 1.494.x
//  fuhr ein Grossvater mit Tennisballkanone, 1.495.0 bis 1.554.x tanzte
//  ein Tänzer mit Nocco-Dosen durch, und im Infoboard räumte Tristan den
//  Haufen Dosen weg (alles im Git-Verlauf).
//  Seit 1.555.0 (15. November 2026: „Nimm den Dosenwerfer und den Dosen-
//  aufsammler wieder weg … Lass ihn lustige Sachen zum Thema Zerspanen
//  und Crossfit sagen. Wenn er anhält, sagt er das.“, dann „Mache es
//  umgekehrt: die Person zieht den Schlitten und die Hühner sitzen drin.
//  Die Person sieht wie auf dem Bild aus.“): Die Person aus Patricks
//  Bild (HYROX-Shirt) zieht am Seil um die Hüfte einen roten Schlitten,
//  in dem drei Hühner sitzen, mal nach links, mal nach rechts. Einmal je
//  Fahrt hält er an und sagt in einer Sprechblase einen Spruch (SPRUECHE,
//  seit 1.568.0 zu Personal, Zerspanen und Hühnern; die Blase steht neben
//  dem Mund und zeigt mit der Spitze darauf).
//  Das Bild steht nur in der Datenbank (app_config, Schlüssel
//  durchfahrt_person, als data:-Bild, freigestellt, sonst unverändert),
//  nie im Repository, weil das öffentlich ist. Die App zeigt es dreimal
//  übereinander, je zugeschnitten auf Oberkörper, linkes und rechtes
//  Bein, damit die Beine im Gehen schwingen. Es wird nie gespiegelt:
//  fährt der Schlitten nach links, dreht sich nur die Zeichnung um.
//  Die Hühner tragen die Verkleidung des Tages aus feste.js. Vom
//  15. Oktober bis Ende März im Schnee, sonst auf der Wiese.
//  Seit 1.556.0 („Mach das ganze weihnachtlicher, die Person braucht noch
//  eine Weihnachtsmütze, der Schlitten muss auch weihnachtlicher aussehen,
//  mach die Bewegungen natürlicher“): Mütze über dem Bild (MUETZE),
//  Schlitten mit Tannengirlande, Kugeln, Lichterkette, Stern, Zuckerstange,
//  Geschenken und Schnee, Glocken am Seil, Atem im Winter; beim Ziehen
//  lehnt er sich nach vorne, wippt im Schritt, die Beine heben sich
//  abwechselnd, beim Halt steht er gerade wie auf dem Bild.
//  Gesteuert mit Zeitgebern und el.animate statt React-Zustand, damit
//  die Seite dafür nie neu zeichnet.
// =================================================================
import { useEffect, useRef } from "react";
import { alt } from "../../bruecke.jsx";
import { festFuer, teilchen } from "../../infoboard/feste.js";

const zufall = (a, b) => a + Math.random() * (b - a);
const ganz = (a, b) => Math.floor(zufall(a, b + 1));
const eins = (liste) => liste[ganz(0, liste.length - 1)];

// Was er sagt, wenn er anhält: Personal, Zerspanen und Hühner
// (seit 1.568.0, Wunsch Patrick 16. November 2026; vorher Crossfit)
export const SPRUECHE = [
  "Personalplanung: drei Hühner im Schlitten, einer zieht. Passt.",
  "Die Hühner sind in der Pause. Seit 7 Uhr.",
  "Wer zuletzt stempelt, legt das erste Ei.",
  "Teamsitzung: Gack. Gack. Gack. Protokoll folgt.",
  "Neue Lernende? Die Hühner zeigen ihnen das Picken.",
  "Ferienantrag der Hühner: KW 52 und 53. Genehmigt!",
  "Sag nie zu einem Dreher, die Maschine läuft von allein.",
  "Mitarbeiter des Monats: das Huhn mit der Schutzbrille.",
  "Ich bin nicht müde, ich bin im Einrichtmodus.",
  "Toleranz ±0,01. Bei den Hühnern ±1 Ei.",
  "Späne sind kein Abfall. Das ist Konfetti für Dreher.",
  "Stückzeit 12 Sekunden. Das Huhn braucht 24 Stunden pro Ei.",
  "Plattenwechsel gemacht, Hühnerstall gemistet. Gleiche Handgriffe.",
  "Ein Dreher ohne Späne im Socken ist kein Dreher.",
  "Wenn die Maschine piepst, ist es Störung. Wenn das Huhn piepst, Kaffeepause.",
  "Ra 0,4 auf dem Teil. Ra 400 auf dem Hühnerstall.",
  "Kühlschmierstoff? Die Hühner nennen's Wellness.",
  "Das Ei ist rund, das Teil ist rund. Ich bin zuständig.",
  "Die Hühner wollten Homeoffice. Jetzt sitzen sie im Schlitten.",
  "Qualitätskontrolle: jedes Ei mit dem Messschieber geprüft.",
  "Rüsten dauert. Hühner zum Schlitten bringen dauert länger.",
  "Wer hat das letzte Werkzeug verbraucht? Gack!",
];

// Das Bild steht nur in der Datenbank, einmal je Laden der App geholt
let personHolen = null;
const personFoto = () => {
  if (!personHolen) personHolen = (async () => {
    try {
      if (!alt.db) return null;
      const r = await alt.db.from("app_config").select("wert").eq("schluessel", "durchfahrt_person").maybeSingle();
      const w = r && r.data && r.data.wert;
      return typeof w === "string" && w.startsWith("data:image/") ? w : null;
    } catch { return null; }
  })();
  return personHolen;
};

// Ohne Bild (Prüfstand, keine Verbindung): eine gezeichnete Figur im
// selben Seitenverhältnis wie das Bild (537 × 1252), gleich eingeteilt.
const FIGUR = "data:image/svg+xml," + encodeURIComponent(`<svg viewBox="0 0 537 1252" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#1a1a1a" stroke-width="8">
  <path d="M120 790 L110 1160 L190 1160 L230 790 Z M300 790 L360 1160 L440 1160 L420 790 Z" fill="#e0a070"/>
  <path d="M100 1150 H200 V1220 H40 C40 1180 70 1160 100 1150 Z M350 1150 H450 C490 1170 510 1200 510 1240 H350 Z" fill="#1f1f1f"/>
  <path d="M90 590 H440 L430 790 H275 L265 760 L255 790 H100 Z" fill="#1f1f1f"/>
  <path d="M60 300 C40 380 40 480 120 560 L160 540 C110 470 120 400 140 330 Z M470 300 C500 380 500 480 420 560 L380 540 C430 470 420 400 400 330 Z" fill="#e0a070"/>
  <path d="M140 230 C200 200 340 200 400 230 L420 600 H120 Z" fill="#1f1f1f"/>
  <ellipse cx="268" cy="110" rx="78" ry="100" fill="#e0a070"/>
  <path d="M190 90 C190 20 350 20 346 90 C330 50 210 50 190 90 Z" fill="#2a2018"/></g>
  <text x="268" y="360" text-anchor="middle" font-family="Arial" font-weight="700" font-size="60" fill="#fff" letter-spacing="10">HYROX</text>
</svg>`);
// Weihnachtsmütze in Koordinaten des Bilds (537 × 1252): Pelzrand über
// der Stirn, Zipfel hängt nach hinten (zum Schlitten), weisser Bommel.
// Sie liegt nicht in der Gegenspiegelung des Bilds, darum hängt der
// Zipfel in beiden Richtungen hinten.
const MUETZE = `<svg viewBox="0 0 537 1252" xmlns="http://www.w3.org/2000/svg" overflow="visible"><g transform="translate(-5 0)">
  <path d="M334 34 C344 -22 312 -62 268 -60 C218 -56 170 -30 140 8 C124 28 112 50 106 70 C132 56 166 42 198 34 Z" fill="#d42230" stroke="#7d1219" stroke-width="5" stroke-linejoin="round"/>
  <path d="M300 -40 C270 -36 220 -14 186 20" stroke="#a5141f" stroke-width="10" fill="none" stroke-linecap="round" opacity=".55"/>
  <path d="M318 -30 C326 -14 328 8 324 30" stroke="#ff6b74" stroke-width="7" fill="none" stroke-linecap="round" opacity=".45"/>
  <path d="M176 38 C218 16 300 14 346 36 C352 46 352 58 346 66 C300 48 222 48 176 68 C168 58 168 46 176 38 Z" fill="#fbfbfb" stroke="#c9d0d8" stroke-width="4"/>
  <g fill="#e3e8ee"><circle cx="200" cy="50" r="6"/><circle cx="236" cy="40" r="5"/><circle cx="276" cy="38" r="6"/><circle cx="316" cy="44" r="5"/><circle cx="336" cy="54" r="4"/></g>
  <circle cx="104" cy="78" r="27" fill="#fbfbfb" stroke="#c9d0d8" stroke-width="4"/>
  <circle cx="96" cy="70" r="8" fill="#fff"/>
</g></svg>`;

// Einteilung im Bild (Anteile von Breite und Höhe): Oberkörper bis 64 %,
// Beine ab 61.5 %, getrennt bei 48.4 %, Hüftgelenke, Kopf, Seil an der Hüfte
const BILD = { b: 537, h: 1252 };
const MUND = [268 / 537, 192 / 1252];
const TEIL = { oberBis: 800 / 1252, beinAb: 770 / 1252, mitte: 260 / 537,
  huefteL: [170 / 537, 780 / 1252], huefteR: [360 / 537, 780 / 1252],
  kopf: [262 / 537, 110 / 1252], seil: [268 / 537, 600 / 1252] };

// Schlitten mit Kufen und Deichsel nach rechts, viewBox 0 -20 240 220.
// Hinten: Stern, Lehne und Sack mit Geschenken, Zuckerstange, Drehteil
// und Kettlebell, Schnee auf Lehne und Sack.
const HINTEN = `<svg viewBox="0 -20 240 220" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(-6 62 40)">
    <path d="M62 -14 L66 -4 L77 -4 L68 3 L72 14 L62 7 L52 14 L56 3 L47 -4 L58 -4 Z" fill="#ffd94a" stroke="#c99a10" stroke-width="1.4"/>
    <rect x="61" y="12" width="2.4" height="26" fill="#6e4522"/>
  </g>
  <path d="M8 120 C4 88 12 62 30 56 C42 52 50 62 48 78 L50 120 Z" fill="#a31c25" stroke="#6e1218" stroke-width="2.2"/>
  <path d="M14 112 C10 90 16 70 30 64" stroke="#f2c230" stroke-width="2.4" fill="none"/>
  <path d="M26 55 C30 50 40 50 46 56 C44 60 32 60 26 55 Z" fill="#fff"/>
  <g transform="rotate(-8 50 60)">
    <rect x="28" y="30" width="22" height="20" rx="2" fill="#2a8f4a" stroke="#1d6634" stroke-width="1.4"/>
    <path d="M39 30 V50 M28 40 H50" stroke="#f2c230" stroke-width="3"/>
    <path d="M39 30 C33 22 30 28 39 30 C48 22 45 28 39 30 Z" fill="#f2c230"/>
  </g>
  <g transform="rotate(10 84 50)">
    <rect x="72" y="36" width="24" height="22" rx="2" fill="#2c5fb8" stroke="#1c3f7d" stroke-width="1.4"/>
    <path d="M84 36 V58 M72 47 H96" stroke="#fff" stroke-width="3"/>
    <path d="M84 36 C77 28 74 34 84 36 C94 28 91 34 84 36 Z" fill="#fff"/>
    <path d="M76 40 l2 2 M90 52 l2 2 M78 54 l2 -2" stroke="#9fc2ff" stroke-width="1.2"/>
  </g>
  <g transform="rotate(-32 22 44)">
    <rect x="4" y="38" width="26" height="12" rx="1.5" fill="#cfd5dd" stroke="#7d8692" stroke-width="1.2"/>
    <rect x="30" y="40.5" width="11" height="7" fill="#b4bbc5" stroke="#7d8692" stroke-width="1.2"/>
    <rect x="41" y="42" width="7" height="4" fill="#9aa2ad" stroke="#7d8692" stroke-width="1"/>
    <path d="M10 38 V50 M16 38 V50 M22 38 V50" stroke="#e9edf2" stroke-width="1.2"/>
  </g>
  <path d="M52 40 C52 28 70 28 70 40" stroke="#2b2b2f" stroke-width="4.5" fill="none"/>
  <circle cx="61" cy="50" r="11" fill="#2b2b2f"/><path d="M55 46 C57 43 61 42 64 43" stroke="#6a6a72" stroke-width="2" fill="none"/>
  <g transform="rotate(14 98 70)">
    <path d="M98 112 V62 C98 52 112 52 112 62 V66" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M98 112 V62 C98 52 112 52 112 62 V66" stroke="#d6202c" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="4 5"/>
  </g>
  <path d="M22 116 C12 86 24 56 46 54 C66 52 82 66 84 88 L86 116 Z" fill="#8a5a2b" stroke="#5e3b1a" stroke-width="2"/>
  <path d="M30 60 C40 66 56 66 70 60" stroke="#5e3b1a" stroke-width="2.4" fill="none"/>
  <path d="M28 59 C34 52 44 54 50 58 C56 52 66 54 72 59 C66 64 36 65 28 59 Z" fill="#fff"/>
  <path d="M40 80 C46 92 44 104 38 112 M62 76 C70 88 70 102 66 112" stroke="#6e4522" stroke-width="1.4" fill="none" opacity=".7"/>
</svg>`;
// Vorne: Schlittenwand mit Tannengirlande, Kugeln, Lichterkette und
// Schnee, Kufen, Ring an der Deichsel
const VORNE = `<svg viewBox="0 -20 240 220" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#7a7f88" stroke-width="5" stroke-linecap="round"><path d="M34 174 V188 M88 174 V188 M150 174 V188 M196 170 V186"/></g>
  <path d="M4 190 H198 C220 190 232 178 230 164 C229 155 221 152 217 159" stroke="#d9a520" stroke-width="5.5" fill="none" stroke-linecap="round"/>
  <path d="M6 187 C40 183 80 185 120 184 C160 183 190 185 204 186" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9"/>
  <path d="M6 112 L188 112 C204 112 214 122 216 136 L218 150 C212 166 198 176 178 176 L28 176 C14 176 6 168 6 154 Z" fill="#c8202b" stroke="#7d1219" stroke-width="2.4"/>
  <path d="M14 121 H186 C198 121 206 128 208 140" stroke="#f2c230" stroke-width="3" fill="none"/>
  <path d="M14 167 H170" stroke="#f2c230" stroke-width="2" fill="none"/>
  <path d="M20 140 C26 130 38 132 36 142 C34 150 24 148 26 142" stroke="#f2c230" stroke-width="2.2" fill="none"/>
  <path d="M200 156 C194 148 202 140 208 146" stroke="#f2c230" stroke-width="2.2" fill="none"/>
  <g class="wm-schrift"><text x="112" y="152" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="800" fill="#f2c230" letter-spacing="1">HOFER + CO</text></g>
  <g fill="#fff" opacity=".95"><path d="M24 158 l1.6 -4 1.6 4 4 -1.6 -4 1.6 4 1.6 -4 -1.6 -1.6 4 -1.6 -4 -4 1.6 4 -1.6 -4 -1.6 Z" opacity=".75"/>
    <path d="M190 128 l1.4 -3.4 1.4 3.4 3.4 -1.4 -3.4 1.4 3.4 1.4 -3.4 -1.4 -1.4 3.4 -1.4 -3.4 -3.4 1.4 3.4 -1.4 -3.4 -1.4 Z" opacity=".75"/></g>
  <path d="M6 112 C30 118 50 118 70 112 C90 118 110 118 130 112 C150 118 170 118 192 112" stroke="#1f5e2c" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M6 112 C30 118 50 118 70 112 C90 118 110 118 130 112 C150 118 170 118 192 112" stroke="#3f9a4e" stroke-width="5" fill="none" stroke-dasharray="2 2.5" stroke-linecap="round"/>
  <path d="M4 110 C10 104 22 106 28 109 C40 105 52 107 58 110 C70 105 84 107 92 109 C106 104 122 106 130 109 C144 105 160 107 168 110 C178 105 190 106 196 110 C188 113 12 113 4 110 Z" fill="#fff"/>
  <g stroke="#7a1a10" stroke-width=".8"><circle cx="38" cy="119" r="2.4" fill="#e3242b"/><circle cx="42" cy="118" r="2.4" fill="#e3242b"/>
    <circle cx="100" cy="119" r="2.4" fill="#e3242b"/><circle cx="104" cy="118" r="2.4" fill="#e3242b"/>
    <circle cx="160" cy="119" r="2.4" fill="#e3242b"/><circle cx="164" cy="118" r="2.4" fill="#e3242b"/></g>
  <g stroke="#b5891a" stroke-width="1"><path d="M70 113 V118 M130 113 V118" stroke="#b5891a"/>
    <circle cx="70" cy="123" r="5" fill="#f2c230"/><circle cx="130" cy="123" r="5" fill="#2c7be5" stroke="#1c4f99"/>
    <circle cx="68.5" cy="121.5" r="1.4" fill="#fff" stroke="none" opacity=".8"/><circle cx="128.5" cy="121.5" r="1.4" fill="#fff" stroke="none" opacity=".8"/></g>
  <path d="M10 172 Q60 177 110 172 T206 166" stroke="#2a2a2a" stroke-width="1" fill="none"/>
  <circle class="wm-licht" style="animation-delay:0.00s" cx="18" cy="173" r="3.4" fill="#ff4d4d"/><circle class="wm-licht" style="animation-delay:0.83s" cx="39" cy="171" r="3.4" fill="#ffd94a"/><circle class="wm-licht" style="animation-delay:0.46s" cx="60" cy="173" r="3.4" fill="#4dd96b"/><circle class="wm-licht" style="animation-delay:0.09s" cx="81" cy="171" r="3.4" fill="#5aa8ff"/><circle class="wm-licht" style="animation-delay:0.92s" cx="102" cy="173" r="3.4" fill="#ff4d4d"/><circle class="wm-licht" style="animation-delay:0.55s" cx="123" cy="171" r="3.4" fill="#ffd94a"/><circle class="wm-licht" style="animation-delay:0.18s" cx="144" cy="173" r="3.4" fill="#4dd96b"/><circle class="wm-licht" style="animation-delay:1.01s" cx="165" cy="171" r="3.4" fill="#5aa8ff"/><circle class="wm-licht" style="animation-delay:0.64s" cx="186" cy="173" r="3.4" fill="#ff4d4d"/>
  <circle cx="232" cy="152" r="4.5" fill="none" stroke="#3d3d3d" stroke-width="2.5"/>
  <g class="wm-glocke"><circle cx="214" cy="150" r="5" fill="#f2c230" stroke="#b5891a" stroke-width="1.2"/><circle cx="214" cy="153" r="1.4" fill="#7a5a10"/></g>
</svg>`;
const VB = { x0: 0, y0: -20, b: 240, h: 220 };
// Wo die Hühner sitzen (Mitte x, Unterkante y in Einheiten der viewBox)
const SITZE = [{ x: 104, y: 120, g: .9 }, { x: 186, y: 119, g: .85 }, { x: 146, y: 126, g: 1 }];

// Gefieder: Körper und Flügel (null = das weisse Huhn wie es ist)
const GEFIEDER = [null, null, ["#c47a3a", "#9a5a26"], ["#e8c27a", "#c99a4a"], ["#6b5a50", "#4a3d36"]];
const huhnSvg = (fest, gefieder) => {
  let s = fest.huhn;
  if (gefieder) s = s.replaceAll("#f4f1ea", gefieder[0]).replaceAll("#d9d3c5", gefieder[1]);
  return s;
};

// Schnee liegt vom 15. Oktober bis Ende März (Wunsch Patrick: „es ist aber Winter“)
export const schneeZeit = (d = new Date()) => {
  const x = (d.getMonth() + 1) * 100 + d.getDate();
  return x >= 1015 || x <= 331;
};
const WEHEN = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='14' viewBox='0 0 120 14'>" +
  "<path d='M0 14 L0 9 C10 2 22 3 30 8 C38 12 46 4 58 5 C70 6 74 12 86 9 C96 6 104 2 114 6 L120 9 L120 14 Z' fill='#f7fbff'/></svg>")}")`;
const GRAS = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='60' height='14' viewBox='0 0 60 14'>" +
  "<path d='M0 14 L3 5 L5 14 L8 2 L10 14 L14 6 L16 14 L19 3 L22 14 L26 7 L28 14 L31 1 L34 14 L37 6 L40 14 " +
  "L43 3 L46 14 L49 7 L51 14 L54 2 L57 14 L60 6 L60 14 Z' fill='#5fa83a'/></svg>")}")`;

// Sprüche der Reihe nach gemischt, damit keiner gleich wiederkommt
let stapel = [];
const naechsterSpruch = () => {
  if (!stapel.length) stapel = [...SPRUECHE].sort(() => Math.random() - .5);
  return stapel.pop();
};

export default function Durchfahrt({ tief = false } = {}) {
  const ref = useRef(null);
  useEffect(() => {
    const band = ref.current;
    if (!band) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let aus = false;
    const uhren = new Set();
    const warte = (ms) => new Promise((ok) => {
      const t = setTimeout(() => { uhren.delete(t); ok(); }, ms);
      uhren.add(t);
    });
    const wach = async () => { while (!aus && document.hidden) await warte(1000); };
    let foto = null;
    const blasen = new Set();
    personFoto().then((u) => { foto = u; });

    // Boden: auf der Startseite Schnee oder Wiese, im Infoboard keiner
    // (dort fährt er über Kopf und Solaranlage, Kufen über dem Kalender)
    const schnee = schneeZeit();
    const wiese = document.createElement("div");
    wiese.className = "umzug-wiese" + (schnee ? " umzug-wiese--schnee" : "");
    wiese.style.setProperty("--gras", schnee ? WEHEN : GRAS);
    const wieseHoch = () => tief ? 0 : Math.max(10, Math.round((band.clientHeight || 120) * .13));
    const wieseSetzen = () => { wiese.style.height = wieseHoch() + "px"; };
    if (!tief) band.appendChild(wiese);
    wieseSetzen();
    const wo = new ResizeObserver(wieseSetzen);
    wo.observe(band);

    // Pulverschnee (oder Staub), wo die Kufen gleiten
    const staub = (x, y, g) => {
      const d = document.createElement("div");
      d.className = "umzug-staub" + (schnee ? " umzug-staub--schnee" : "");
      d.style.cssText = `left:${x - g / 2}px;bottom:${y}px;width:${g}px;height:${g * .6}px`;
      band.appendChild(d);
      const a = d.animate([{ opacity: .6, transform: "scale(.4)" }, { opacity: 0, transform: `translate(0,${-g * .4}px) scale(1.7)` }],
        { duration: zufall(700, 1100), easing: "ease-out", fill: "forwards" });
      a.onfinish = () => d.remove();
    };
    // Eine Feder fällt bis auf den Boden, liegt kurz und verblasst
    const feder = (x, y, boden, farbe) => {
      const t = teilchen("feder", farbe, zufall(8, 14) * (tief ? 2 : 1));
      const f = document.createElement("div");
      f.className = "umzug-feder";
      f.style.cssText = `width:${t.w}px;height:${t.h}px;left:${x}px;bottom:${y}px;${t.stil || ""}`;
      band.appendChild(f);
      const fall = Math.max(0, y - boden), dx = zufall(-30, 30), liegt = (Math.random() < .5 ? 90 : -90) + zufall(-15, 15);
      const a = f.animate([
        { opacity: 0, transform: "translate(0,0) rotate(0deg)" },
        { opacity: .9, transform: `translate(${dx * .3}px,${-zufall(4, 12)}px) rotate(${zufall(-40, 40)}deg)`, offset: .12 },
        { opacity: .85, transform: `translate(${dx}px,${fall}px) rotate(${liegt}deg)`, offset: .7 },
        { opacity: 0, transform: `translate(${dx}px,${fall}px) rotate(${liegt}deg)` },
      ], { duration: zufall(3500, 5500), easing: "ease-in-out", fill: "forwards" });
      a.onfinish = () => f.remove();
    };
    // Schneeflocken über das ganze Band
    const flocke = () => {
      const breit = band.clientWidth, hoch = band.clientHeight;
      if (!breit || !hoch) return;
      const g = zufall(2.5, 6.5) * (tief ? 1.8 : 1);
      const f = document.createElement("div");
      f.className = "umzug-flocke";
      f.style.cssText = `left:${zufall(-20, breit + 20)}px;top:${-g}px;width:${g}px;height:${g}px;opacity:${zufall(.55, .95).toFixed(2)}`;
      band.appendChild(f);
      const weit = hoch - wieseHoch() * zufall(.3, .9);
      const wind = zufall(-40, 10), wackeln = zufall(6, 16);
      const a = f.animate([
        { transform: "translate(0,0)" },
        { transform: `translate(${wind * .33 + wackeln}px,${weit * .33}px)` },
        { transform: `translate(${wind * .66 - wackeln}px,${weit * .66}px)` },
        { transform: `translate(${wind}px,${weit}px)`, opacity: 0 },
      ], { duration: zufall(5000, 9000) * Math.max(.6, hoch / 160), easing: "linear", fill: "forwards" });
      a.onfinish = () => f.remove();
    };
    if (schnee) (async () => {
      while (!aus) {
        await wach();
        if (aus) return;
        flocke();
        await warte(zufall(110, 260) * (tief ? 2 : 1) * Math.max(.4, 1200 / Math.max(300, band.clientWidth || 1200)));
      }
    })();

    // Sprechblase beim Halt, im Band ausserhalb des gespiegelten Zugs
    const sprechen = (text, kopfX, kopfY, kopfB, rechts, H) => {
      const breit = band.clientWidth, hoch = band.clientHeight;
      const b = document.createElement("div");
      b.className = "wm-blase " + (rechts ? "wm-blase--rechts" : "wm-blase--links");
      b.textContent = text;
      const schrift = Math.max(12, Math.min(28, H * .085));
      b.style.fontSize = schrift + "px";
      b.style.maxWidth = Math.max(140, Math.min(breit * .6, schrift * 22)) + "px";
      // Die Blase liegt über dem Inhalt (Logo, Uhr), nicht dahinter wie
      // der Zug: darum neben das Band in dessen Eltern, gleiche Lage
      const ziel = band.parentElement || band;
      b.style.marginLeft = (ziel === band ? 0 : band.offsetLeft) + "px";
      b.style.marginBottom = (ziel === band ? 0 : ziel.clientHeight - band.offsetTop - band.offsetHeight) + "px";
      ziel.appendChild(b);
      blasen.add(b);
      const w = b.offsetWidth, h = b.offsetHeight;
      // Seit 1.568.0 neben dem Mund statt über dem Kopf: die Spitze zeigt
      // seitlich genau auf den Mund (Patrick: „Sprechblase stimmt nicht
      // ganz zum Mund“)
      const spitze = Math.max(9, schrift * .9);
      // Rand lassen: beim Erscheinen wächst die Blase kurz über 100 %
      const rx = 4 + w * .05, ry = 2 + h * .05;
      // Passt sie vorne nicht ins Band, steht sie auf der anderen Seite,
      // sonst deckte sie das Gesicht zu
      const xR = kopfX + kopfB + spitze, xL = kopfX - kopfB - spitze - w;
      let seiteR = rechts;
      if (seiteR && xR > breit - w - rx && xL >= rx) seiteR = false;
      else if (!seiteR && xL < rx && xR <= breit - w - rx) seiteR = true;
      b.className = "wm-blase " + (seiteR ? "wm-blase--rechts" : "wm-blase--links");
      let x = seiteR ? xR : xL;
      x = Math.max(rx, Math.min(breit - w - rx, x));
      let y = kopfY - h * .5;
      y = Math.max(ry, Math.min(hoch - h - ry, y));
      // Höhe der Spitze an der Blase (von unten), so dass sie auf den Mund zeigt
      const sy = Math.max(schrift * .5, Math.min(h - schrift * .5, kopfY - y));
      b.style.setProperty("--spitze-y", sy + "px");
      b.style.setProperty("--spitze", spitze + "px");
      b.style.left = x + "px"; b.style.bottom = y + "px";
      b.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)" }],
        { duration: 260, easing: "cubic-bezier(.3,1.4,.5,1)", fill: "forwards" });
      return b;
    };

    const fahrt = async () => {
      const breit = band.clientWidth, hoch = band.clientHeight;
      if (!breit || !hoch) return;
      const fest = festFuer(new Date());
      // H = Höhe der viewBox des Schlittens; die Person ist etwas grösser
      const H = tief ? Math.max(70, Math.min(300, hoch * .62)) : Math.max(42, Math.min(150, hoch * .64));
      const k = H / VB.h;                                  // Punkte je Einheit
      const P = H * 1.08, Pb = P * BILD.b / BILD.h;        // Person
      const boden = tief ? 2 : wieseHoch() * .45;          // dort stehen Füsse und Kufen
      const rechts = Math.random() < .5;

      const zug = document.createElement("div");
      zug.className = "umzug wm-zug" + (rechts ? "" : " wm-links");
      zug.dataset.fest = fest.name;

      // Schlitten: hinten Lehne und Sack, dann die Hühner, vorne die Wand
      const schlitten = document.createElement("div");
      schlitten.className = "wm-schlitten";
      const sb = VB.b * k, sh = VB.h * k;
      schlitten.style.cssText = `left:0;bottom:${-8 * k}px;width:${sb}px;height:${sh}px`;
      schlitten.innerHTML = `<div class="wm-ebene">${HINTEN}</div>`;
      const teile = [];
      SITZE.forEach((sitz) => {
        const gef = eins(GEFIEDER);
        const ch = 80 * sitz.g, cb = ch * 1.24;            // Einheiten der viewBox
        const el = document.createElement("div");
        el.className = "umzug-huhn wm-huhn";
        el.style.cssText = `left:${(sitz.x - cb / 2 - VB.x0) / VB.b * 100}%;top:${(sitz.y - ch * .75 - VB.y0) / VB.h * 100}%;` +
          `width:${cb / VB.b * 100}%;height:${ch / VB.h * 100}%;--schritt:${zufall(.45, .7).toFixed(2)}s;animation-delay:${-zufall(0, .6).toFixed(2)}s`;
        el.innerHTML = `<div class="umzug-huhn__koerper">${huhnSvg(fest, gef)}</div>`;
        schlitten.appendChild(el);
        teile.push({ x: (sitz.x - VB.x0) * k, farbe: gef ? gef[0] : "#f4f1ea" });
      });
      const vorne = document.createElement("div");
      vorne.className = "wm-ebene";
      vorne.innerHTML = VORNE;
      schlitten.appendChild(vorne);
      zug.appendChild(schlitten);

      // Die Person vor dem Schlitten, dreimal das Bild: Beine und Oberkörper
      const px = sb + H * .32;
      const person = document.createElement("div");
      person.className = "wm-person";
      person.style.cssText = `left:${px}px;bottom:0;width:${Pb}px;height:${P}px`;
      // Hülle fürs Gehen (Wippen und Wiegen), darin das Bild (gegengespiegelt)
      // und die Mütze (dreht mit dem Zug, Zipfel immer hinten)
      const gang = document.createElement("div");
      gang.className = "wm-gang";
      const bild = document.createElement("div");
      bild.className = "wm-person__bild";
      const quelle = foto || FIGUR;
      const pct = (v) => (v * 100).toFixed(2) + "%";
      const stueck = (klasse, clip, ursprung) => {
        const img = new Image();
        img.alt = ""; img.draggable = false; img.src = quelle;
        img.className = klasse;
        img.style.clipPath = clip;
        if (ursprung) img.style.transformOrigin = `${pct(ursprung[0])} ${pct(ursprung[1])}`;
        bild.appendChild(img);
      };
      stueck("wm-bein", `inset(${pct(TEIL.beinAb)} ${pct(1 - TEIL.mitte)} 0 0)`, TEIL.huefteL);
      stueck("wm-bein wm-bein--2", `inset(${pct(TEIL.beinAb)} 0 0 ${pct(TEIL.mitte)})`, TEIL.huefteR);
      stueck("wm-ober", `inset(0 0 ${pct(1 - TEIL.oberBis)} 0)`);
      const muetze = document.createElement("div");
      muetze.className = "wm-muetze";
      muetze.innerHTML = MUETZE;
      gang.appendChild(bild);
      gang.appendChild(muetze);
      person.appendChild(gang);

      const lang = px + Pb + H * .05;
      const zh = Math.max(sh, P) + 4;
      zug.style.cssText = `width:${lang}px;height:${zh}px;bottom:${boden}px`;
      // Seil vom Ring an der Deichsel zur Hüfte (hinter der Person)
      const ring = { x: 232 * k, y: (200 - 152) * k - 8 * k };
      const huefte = { x: px + TEIL.seil[0] * Pb, y: P * (1 - TEIL.seil[1]) };
      const seil = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      seil.setAttribute("class", "umzug-seil wm-seil");
      seil.setAttribute("viewBox", `0 0 ${lang} ${zh}`);
      const ax = ring.x, ay = zh - ring.y, bx = huefte.x, by = zh - huefte.y;
      const qx = (ax + bx) / 2, qy = Math.max(ay, by) + H * .03;
      const aufSeil = (t) => [(1 - t) ** 2 * ax + 2 * (1 - t) * t * qx + t * t * bx, (1 - t) ** 2 * ay + 2 * (1 - t) * t * qy + t * t * by];
      const gr = Math.max(2.2, H * .022);
      const glocken = [.33, .66].map((t, i) => {
        const [gx, gy] = aufSeil(t);
        return `<g class="wm-glocke" style="animation-delay:${-i * .2}s"><circle cx="${gx.toFixed(1)}" cy="${(gy + gr).toFixed(1)}" r="${gr.toFixed(1)}" fill="#f2c230" stroke="#b5891a" stroke-width="${(gr * .25).toFixed(1)}"/>` +
          `<circle cx="${gx.toFixed(1)}" cy="${(gy + gr * 1.6).toFixed(1)}" r="${(gr * .3).toFixed(1)}" fill="#7a5a10"/></g>`;
      }).join("");
      seil.innerHTML = `<path style="stroke-width:${Math.max(1.6, H * .018).toFixed(1)}px" d="M${ax.toFixed(1)} ${ay.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}"/>` + glocken;
      zug.appendChild(seil);
      zug.appendChild(person);
      band.appendChild(zug);

      // Weg: hinein bis zum Halt, stehen und sprechen, weiter hinaus
      const von = rechts ? -lang - 20 : breit + 20, bis = rechts ? breit + 20 : -lang - 20;
      const kopfPos = px + TEIL.kopf[0] * Pb;                       // im Zug von links
      const kopfImZug = rechts ? kopfPos : lang - kopfPos;
      const haltX = breit * zufall(.3, .6) - kopfImZug;
      const tempo = (breit + lang) / (zufall(14000, 18000) * Math.max(1, (breit + lang) / 1700)); // Punkte je ms
      const t1 = Math.abs(haltX - von) / tempo * 1.3, t2 = Math.abs(bis - haltX) / tempo * 1.3;
      const halt = 5200;
      const dauer = t1 + halt + t2;
      const spiegel = rechts ? "" : " scaleX(-1)";
      const a = zug.animate([
        { transform: `translateX(${von}px)${spiegel}`, easing: "cubic-bezier(.3,.55,.45,1)" },
        { transform: `translateX(${haltX}px)${spiegel}`, offset: t1 / dauer },
        { transform: `translateX(${haltX}px)${spiegel}`, offset: (t1 + halt) / dauer, easing: "cubic-bezier(.55,0,.7,.45)" },
        { transform: `translateX(${bis}px)${spiegel}` },
      ], { duration: dauer, easing: "linear", fill: "forwards" });
      const imBand = (x) => {
        const m = new DOMMatrix(getComputedStyle(zug).transform);
        return m.e + (rechts ? x : lang - x);
      };

      // Halt: er steht wie auf dem Bild und sagt etwas
      (async () => {
        // an der Uhr der Bewegung warten, nicht an einem langen Zeitgeber
        while (!aus && zug.isConnected && (a.currentTime || 0) < t1) await warte(80);
        if (aus || !zug.isConnected) return;
        zug.classList.add("wm-steht");
        await warte(250);
        if (aus || !zug.isConnected) return;
        // Mund im Bild (stehend, nie gespiegelt): Mitte des Gesichts, unter der Nase
        const mundY = boden + P * (1 - MUND[1]);
        const blase = sprechen(naechsterSpruch(), imBand(px + MUND[0] * Pb), mundY, Pb * .13, rechts, H);
        await warte(halt - 600);
        const weg = blase.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.85)" }], { duration: 220, fill: "forwards" });
        weg.onfinish = () => { blase.remove(); blasen.delete(blase); };
        await warte(250);
        zug.classList.remove("wm-steht");
      })();

      // Im Winter sieht man seinen Atem, beim Ziehen alle gut 1 Sekunde
      const mund = { x: px + (rechts ? 255 : 282) / 537 * Pb + P * .1, y: boden + P * (1 - 140 / 1252) };
      const atem = () => {
        const x = imBand(mund.x) + (rechts ? 1 : -1) * Pb * .06, g = H * zufall(.07, .1);
        const d = document.createElement("div");
        d.className = "wm-atem";
        d.style.cssText = `left:${x - g / 2}px;bottom:${mund.y - g / 2}px;width:${g}px;height:${g * .7}px`;
        band.appendChild(d);
        const dx = (rechts ? 1 : -1) * H * zufall(.08, .14);
        const a2 = d.animate([{ opacity: 0, transform: "scale(.3)" }, { opacity: .75, transform: `translate(${dx * .4}px,${-g * .2}px) scale(1)`, offset: .25 },
          { opacity: 0, transform: `translate(${dx}px,${-g * .9}px) scale(2.2)` }], { duration: zufall(900, 1300), easing: "ease-out", fill: "forwards" });
        a2.onfinish = () => d.remove();
      };
      let naechsterAtem = performance.now() + 600;

      const spuren = [30 * k, 120 * k, 200 * k, px + Pb * .3, px + Pb * .75];
      let naechsterStaub = 0, naechsteFeder = performance.now() + zufall(800, 2500);
      const nebenbei = async () => {
        while (!aus && zug.isConnected) {
          await warte(90);
          if (aus || !zug.isConnected) return;
          if (zug.classList.contains("wm-steht")) continue;
          const jetzt = performance.now();
          if (jetzt > naechsterStaub) {
            spuren.forEach((r) => { const x = imBand(r); if (x > -20 && x < breit + 20) staub(x + zufall(-4, 4), boden - 2, H * zufall(.1, .17)); });
            naechsterStaub = jetzt + zufall(160, 320);
          }
          if (schnee && jetzt > naechsterAtem) { atem(); naechsterAtem = jetzt + zufall(1000, 1500); }
          if (jetzt > naechsteFeder) {
            const t = eins(teile);
            const x = imBand(t.x);
            if (x > 0 && x < breit) feder(x, boden + H * zufall(.45, .6), boden - 2, t.farbe);
            naechsteFeder = jetzt + zufall(1500, 4000);
          }
        }
      };
      nebenbei();
      await new Promise((ok) => { a.onfinish = ok; a.oncancel = ok; });
      zug.remove();
    };

    (async () => {
      await warte(zufall(800, 2000));
      while (!aus) {
        await wach();
        if (aus) return;
        await fahrt();
        await warte(zufall(4000, 9000));
      }
    })();

    if (window.TEST) window.TEST.weihnachtsmann = { SPRUECHE };

    return () => {
      aus = true;
      uhren.forEach(clearTimeout);
      uhren.clear();
      wo.disconnect();
      band.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      band.replaceChildren();
      blasen.forEach((b) => b.remove());
    };
  }, [tief]);
  return <div className={"durchfahrt" + (tief ? " durchfahrt--tief" : "")} ref={ref} aria-hidden="true" />;
}
