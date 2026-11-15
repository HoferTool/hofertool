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
//  Fahrt hält er an und sagt in einer Sprechblase einen Spruch (SPRUECHE).
//  Das Bild steht nur in der Datenbank (app_config, Schlüssel
//  durchfahrt_person, als data:-Bild, freigestellt, sonst unverändert),
//  nie im Repository, weil das öffentlich ist. Die App zeigt es dreimal
//  übereinander, je zugeschnitten auf Oberkörper, linkes und rechtes
//  Bein, damit die Beine im Gehen schwingen. Es wird nie gespiegelt:
//  fährt der Schlitten nach links, dreht sich nur die Zeichnung um.
//  Die Hühner tragen die Verkleidung des Tages aus feste.js. Vom
//  15. Oktober bis Ende März im Schnee, sonst auf der Wiese.
//  Gesteuert mit Zeitgebern und el.animate statt React-Zustand, damit
//  die Seite dafür nie neu zeichnet.
// =================================================================
import { useEffect, useRef } from "react";
import { alt } from "../../bruecke.jsx";
import { festFuer, teilchen } from "../../infoboard/feste.js";

const zufall = (a, b) => a + Math.random() * (b - a);
const ganz = (a, b) => Math.floor(zufall(a, b + 1));
const eins = (liste) => liste[ganz(0, liste.length - 1)];

// Was er sagt, wenn er anhält: Zerspanen und Crossfit
export const SPRUECHE = [
  "Sled Pull mit drei Hühnern. HYROX-Station erledigt!",
  "Rentiere? Zu teuer. Ich hab die bessere Stückzeit.",
  "WOD heute: 21 Kamine, 15 Säcke, 9 Burpees. For Time!",
  "Wer brav war, kriegt neue Wendeplatten. Wer nicht: Späne.",
  "Mein Sixpack? Plangedreht, Ra 0,4.",
  "Kettlebell-Swing mit dem Geschenksack. 24 Kilo Messing, bleifrei!",
  "Hühner, ihr könntet auch mal mitziehen! F0.2, nicht F0.0!",
  "Box Jump aufs Dach, Wall Ball durch den Kamin. Lieferung fertig.",
  "Toleranz ±0,01. Beim Drehteil und beim Körperfett.",
  "Erst rüsten, dann läuft, dann Sled Pull.",
  "Mehr Späne, mehr Gains!",
  "No pain, no gain. No Span, no Plan.",
  "Klimmzüge? Ich zieh lieber am Spannzangenhebel. 500 Wiederholungen.",
  "Der Schlitten läuft auf Hartmetallkufen. Standzeit: bis Ostern.",
  "Kühlschmierstoff im Proteinshake? Nur für die Hühner.",
  "Double Unders mit dem Zugseil. Die Hühner finden's weniger lustig.",
  "Muskelkater? Nein, das ist nur das Gewinde M8x1.",
  "Bizeps wie ein Spannfutter: hält alles, rutscht nix.",
  "Die Hühner sitzen, ich ziehe. Das nennt man Leistungsträger.",
  "Cardio ist, wenn die Maschine Störung hat und ich hinrenne.",
  "Mein Puls ist wie die Spindel: 8'000, und noch Luft nach oben.",
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
// Einteilung im Bild (Anteile von Breite und Höhe): Oberkörper bis 64 %,
// Beine ab 61.5 %, getrennt bei 48.4 %, Hüftgelenke, Kopf, Seil an der Hüfte
const BILD = { b: 537, h: 1252 };
const TEIL = { oberBis: 800 / 1252, beinAb: 770 / 1252, mitte: 260 / 537,
  huefteL: [170 / 537, 780 / 1252], huefteR: [360 / 537, 780 / 1252],
  kopf: [262 / 537, 110 / 1252], seil: [268 / 537, 600 / 1252] };

// Schlitten mit Kufen und Deichsel nach rechts, viewBox 0 -20 240 220.
// Hinten: Lehne und Sack mit Geschenk, Drehteil und Kettlebell.
const HINTEN = `<svg viewBox="0 -20 240 220" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 120 C4 88 12 62 30 56 C42 52 50 62 48 78 L50 120 Z" fill="#a31c25" stroke="#6e1218" stroke-width="2.2"/>
  <path d="M14 112 C10 90 16 70 30 64" stroke="#f2c230" stroke-width="2.4" fill="none"/>
  <g transform="rotate(-8 50 60)">
    <rect x="28" y="30" width="22" height="20" rx="2" fill="#2a8f4a" stroke="#1d6634" stroke-width="1.4"/>
    <path d="M39 30 V50 M28 40 H50" stroke="#f2c230" stroke-width="3"/>
    <path d="M39 30 C33 22 30 28 39 30 C48 22 45 28 39 30 Z" fill="#f2c230"/>
  </g>
  <g transform="rotate(-32 22 44)">
    <rect x="4" y="38" width="26" height="12" rx="1.5" fill="#cfd5dd" stroke="#7d8692" stroke-width="1.2"/>
    <rect x="30" y="40.5" width="11" height="7" fill="#b4bbc5" stroke="#7d8692" stroke-width="1.2"/>
    <rect x="41" y="42" width="7" height="4" fill="#9aa2ad" stroke="#7d8692" stroke-width="1"/>
    <path d="M10 38 V50 M16 38 V50 M22 38 V50" stroke="#e9edf2" stroke-width="1.2"/>
  </g>
  <path d="M52 40 C52 28 70 28 70 40" stroke="#2b2b2f" stroke-width="4.5" fill="none"/>
  <circle cx="61" cy="50" r="11" fill="#2b2b2f"/><path d="M55 46 C57 43 61 42 64 43" stroke="#6a6a72" stroke-width="2" fill="none"/>
  <path d="M22 116 C12 86 24 56 46 54 C66 52 82 66 84 88 L86 116 Z" fill="#8a5a2b" stroke="#5e3b1a" stroke-width="2"/>
  <path d="M30 60 C40 66 56 66 70 60" stroke="#5e3b1a" stroke-width="2.4" fill="none"/>
  <path d="M40 80 C46 92 44 104 38 112 M62 76 C70 88 70 102 66 112" stroke="#6e4522" stroke-width="1.4" fill="none" opacity=".7"/>
</svg>`;
// Vorne: Schlittenwand, Kufen, Ring an der Deichsel
const VORNE = `<svg viewBox="0 -20 240 220" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#7a7f88" stroke-width="5" stroke-linecap="round"><path d="M34 174 V188 M88 174 V188 M150 174 V188 M196 170 V186"/></g>
  <path d="M4 190 H198 C220 190 232 178 230 164 C229 155 221 152 217 159" stroke="#d9a520" stroke-width="5.5" fill="none" stroke-linecap="round"/>
  <path d="M6 112 L188 112 C204 112 214 122 216 136 L218 150 C212 166 198 176 178 176 L28 176 C14 176 6 168 6 154 Z" fill="#c8202b" stroke="#7d1219" stroke-width="2.4"/>
  <path d="M14 121 H186 C198 121 206 128 208 140" stroke="#f2c230" stroke-width="3" fill="none"/>
  <path d="M14 167 H170" stroke="#f2c230" stroke-width="2" fill="none"/>
  <path d="M20 140 C26 130 38 132 36 142 C34 150 24 148 26 142" stroke="#f2c230" stroke-width="2.2" fill="none"/>
  <path d="M200 156 C194 148 202 140 208 146" stroke="#f2c230" stroke-width="2.2" fill="none"/>
  <g class="wm-schrift"><text x="112" y="152" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="800" fill="#f2c230" letter-spacing="1">HOFER + CO</text></g>
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
      let x = rechts ? kopfX + kopfB * .62 : kopfX - kopfB * .62 - w;
      x = Math.max(4, Math.min(breit - w - 4, x));
      let y = kopfY - h * .35;                       // Unterkante über dem Boden
      y = Math.max(2, Math.min(hoch - h - 2, y));
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
      person.appendChild(bild);

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
      seil.innerHTML = `<path style="stroke-width:${Math.max(1.6, H * .018).toFixed(1)}px" d="M${ax.toFixed(1)} ${ay.toFixed(1)} Q${((ax + bx) / 2).toFixed(1)} ${(Math.max(ay, by) + H * .03).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}"/>`;
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
        const kopfY = boden + P * (1 - TEIL.kopf[1]);
        const blase = sprechen(naechsterSpruch(), imBand(kopfPos), kopfY, P * .16, rechts, H);
        await warte(halt - 600);
        const weg = blase.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.85)" }], { duration: 220, fill: "forwards" });
        weg.onfinish = () => { blase.remove(); blasen.delete(blase); };
        await warte(250);
        zug.classList.remove("wm-steht");
      })();

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
