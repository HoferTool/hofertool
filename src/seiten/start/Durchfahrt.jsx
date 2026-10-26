// =================================================================
//  HÜHNER ZIEHEN UM, IM BAND OBEN
//  Geschichte (alles Wunsch Patrick): 1.130.0 bis 1.149.0 liefen hier
//  Hühner, 1.150.0 Ferrari und Mario, 1.151.0 bis 1.210.x Jiviano auf
//  dem Jetski über Wellen im Ton der Themenfarbe.
//  Seit 1.211.0 (26. Oktober 2026: „an Stelle von Jiviano mit dem
//  Jetski Hühner, welche umziehen, vorbei laufen, sie sollen den
//  Hühnerstall hinter sich herziehen“): Unten liegt eine Wiese, und ab
//  und zu zieht ein Umzug vorbei, mal nach links, mal nach rechts.
//  Vorne laufen Hühner mit ihrem Hab und Gut auf dem Rücken (Karton,
//  Bündel, Koffer, Topfpflanze), dahinter ziehen zwei Hühner am Seil
//  den Stall auf Rädern, mit Gepäck auf dem Dach, Rauch aus dem Kamin
//  und Köpfen in Tür und Fenster; manchmal rennt hinten ein Küken nach.
//  Die Hühner sind die weissen Hühner des Infoboards (feste.js) und
//  tragen dieselbe Verkleidung je Fest und Jahreszeit; statt der
//  düsteren Halloween-Hühner der Nacht tragen sie am Tag einen Hexenhut.
//  Gesteuert mit Zeitgebern und el.animate statt React-Zustand, damit
//  die Startseite dafür nie neu zeichnet.
// =================================================================
import { useEffect, useRef } from "react";
import { festFuer, weissesHuhn, ZUSATZ, teilchen } from "../../infoboard/feste.js";

const zufall = (a, b) => a + Math.random() * (b - a);
const ganz = (a, b) => Math.floor(zufall(a, b + 1));
const eins = (liste) => liste[ganz(0, liste.length - 1)];

// Gefieder: Körper und Flügel (null = das weisse Huhn wie es ist)
const GEFIEDER = [null, null, ["#c47a3a", "#9a5a26"], ["#e8c27a", "#c99a4a"], ["#6b5a50", "#4a3d36"]];

// Was die Hühner tragen, im Raster des Huhns 124 × 100 (Rücken bei y 33)
const LADUNG = {
  karton: `<g transform="rotate(-6 42 26)"><rect x="27" y="12" width="32" height="24" rx="1.5" fill="#c8955a" stroke="#8a6234" stroke-width="1.4"/>
    <path d="M43 12 V36" stroke="#e8c48c" stroke-width="5"/><path d="M27 18 H59" stroke="#a87742" stroke-width="1"/></g>`,
  buendel: `<path d="M44 42 L16 6" stroke="#8a6a3a" stroke-width="3" stroke-linecap="round"/>
    <path d="M6 10 C4 -2 26 -4 26 8 C27 18 7 20 6 10 Z" fill="#d62828"/>
    <g fill="#fff"><circle cx="11" cy="6" r="1.6"/><circle cx="19" cy="4" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="22" cy="11" r="1.6"/></g>
    <path d="M14 1 L17 -4 L20 1" fill="#d62828"/>`,
  koffer: `<g transform="rotate(-4 44 26)"><path d="M37 14 V10 H51 V14" stroke="#4a2e14" stroke-width="2.4" fill="none"/>
    <rect x="28" y="14" width="32" height="21" rx="3" fill="#7b4a22" stroke="#4a2e14" stroke-width="1.4"/>
    <path d="M28 21 H60" stroke="#c9a14a" stroke-width="2"/><rect x="41" y="19" width="6" height="4" fill="#c9a14a"/></g>`,
  pflanze: `<path d="M34 34 L37 20 H53 L56 34 Z" fill="#c4622d" stroke="#8e4420" stroke-width="1.2"/>
    <g fill="#3f9b3a"><path d="M45 20 C40 6 30 4 26 0 C34 2 44 6 45 20 Z"/><path d="M45 20 C48 4 58 -2 64 -4 C58 4 50 8 45 20 Z"/>
    <path d="M45 20 C44 8 46 -2 46 -10 C50 -2 49 10 45 20 Z" fill="#57b84d"/></g>`,
};
// Geschirr der Zughühner, um die Brust
const GESCHIRR = `<path d="M56 38 C60 50 72 52 80 45" stroke="#7a4a20" stroke-width="3.4" fill="none" stroke-linecap="round"/>
  <path d="M47 36 C50 48 54 56 58 60" stroke="#7a4a20" stroke-width="3" fill="none" stroke-linecap="round"/>`;

// Ein Huhn mit Verkleidung des Tages, Gefieder und Ladung
const huhnSvg = (fest, gefieder, zusatz) => {
  let s = fest.name === "halloween" ? weissesHuhn(ZUSATZ.hexenhut) : fest.huhn;
  if (gefieder) s = s.replaceAll("#f4f1ea", gefieder[0]).replaceAll("#d9d3c5", gefieder[1]);
  return s.replace("</svg>", `${zusatz || ""}</svg>`);
};

// Der Stall auf Rädern, Deichsel nach rechts (viewBox 0 -24 215 174,
// Räder unten bei y 146). Gruppen mit Klassen, damit Räder drehen und
// der Kasten wackelt.
const STALL = `<svg viewBox="0 -24 215 174" xmlns="http://www.w3.org/2000/svg">
  <g class="umzug-stall__kasten">
    <path d="M185 112 L209 104" stroke="#5a3a1e" stroke-width="5" stroke-linecap="round"/>
    <circle cx="209" cy="104" r="4.5" fill="none" stroke="#3d3d3d" stroke-width="2.5"/>
    <rect x="12" y="106" width="176" height="11" rx="2" fill="#6e4524"/>
    <rect x="24" y="50" width="152" height="58" fill="#c98b4f"/>
    <g stroke="#a86d38" stroke-width="1.6"><path d="M24 64 H176 M24 79 H176 M24 94 H176"/></g>
    <rect x="24" y="50" width="152" height="58" fill="none" stroke="#7b4f28" stroke-width="2.4"/>
    <rect x="137" y="17" width="12" height="20" fill="#8c5a36" stroke="#5e3a20" stroke-width="1.5"/>
    <path d="M12 54 L100 8 L188 54 Z" fill="#b8322a" stroke="#7d1f19" stroke-width="2.4" stroke-linejoin="round"/>
    <g stroke="#962820" stroke-width="1.4"><path d="M41 39 L159 39 M65 26 L135 26"/></g>
    <g transform="rotate(-3 100 0)">
      <rect x="70" y="-14" width="34" height="22" rx="2" fill="#c8955a" stroke="#8a6234" stroke-width="1.5"/>
      <path d="M87 -14 V8" stroke="#e8c48c" stroke-width="4"/>
      <rect x="104" y="-6" width="30" height="14" rx="7" fill="#e9e2f5" stroke="#8d7fb0" stroke-width="1.4"/>
      <path d="M111 -6 V8 M119 -6 V8 M127 -6 V8" stroke="#b5a8d6" stroke-width="2"/>
      <path d="M66 4 C90 -6 120 -4 138 4" stroke="#7a5a2a" stroke-width="1.6" fill="none"/>
    </g>
    <circle cx="62" cy="77" r="13" fill="#3b2a1c" stroke="#7b4f28" stroke-width="2.4"/>
    <g class="umzug-stall__gucker">
      <circle cx="62" cy="80" r="8" fill="#f4f1ea"/>
      <circle cx="59" cy="71.5" r="2.6" fill="#e2463b"/><circle cx="63" cy="70.5" r="2.6" fill="#e2463b"/>
      <circle cx="64.5" cy="78" r="1.4" fill="#111"/><path d="M69 79 L74 81 L69 83 Z" fill="#f2b233"/>
    </g>
    <path d="M110 108 V80 C110 70 140 70 140 80 V108 Z" fill="#3b2a1c" stroke="#7b4f28" stroke-width="2.4"/>
    <g class="umzug-stall__kueken">
      <circle cx="125" cy="98" r="7" fill="#ffd84a"/>
      <circle cx="127.5" cy="96" r="1.2" fill="#111"/><path d="M131 97 L135 98.5 L131 100 Z" fill="#f08a24"/>
    </g>
    <path d="M140 108 L160 117" stroke="#8a6234" stroke-width="4" stroke-linecap="round"/>
  </g>
  <g class="umzug-stall__rad"><circle cx="48" cy="130" r="16" fill="#3a3a3a"/><circle cx="48" cy="130" r="10" fill="#8a8a8a"/>
    <path d="M48 120 V140 M38 130 H58 M41 123 L55 137 M55 123 L41 137" stroke="#3a3a3a" stroke-width="2.4"/><circle cx="48" cy="130" r="3" fill="#3a3a3a"/></g>
  <g class="umzug-stall__rad"><circle cx="152" cy="130" r="16" fill="#3a3a3a"/><circle cx="152" cy="130" r="10" fill="#8a8a8a"/>
    <path d="M152 120 V140 M142 130 H162 M145 123 L159 137 M159 123 L145 137" stroke="#3a3a3a" stroke-width="2.4"/><circle cx="152" cy="130" r="3" fill="#3a3a3a"/></g>
</svg>`;

// Küken, das hinterherrennt (viewBox 0 0 40 36, Blick nach rechts)
const KUEKEN = `<svg viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="18" cy="20" rx="12" ry="10" fill="#ffd84a"/><circle cx="27" cy="11" r="7.5" fill="#ffd84a"/>
  <circle cx="29.5" cy="9.5" r="1.4" fill="#111"/><path d="M34 11 L39 12.5 L34 14 Z" fill="#f08a24"/>
  <path d="M12 18 C16 14 22 16 22 20 C19 24 14 23 12 18 Z" fill="#f2c230"/>
  <g stroke="#f08a24" stroke-width="2" stroke-linecap="round" fill="none">
    <path class="huhn-bein" d="M15 29 L14 34 L11 35"/><path class="huhn-bein huhn-bein--2" d="M21 29 L21 34 L18 35"/>
  </g>
</svg>`;

// Gras am oberen Rand der Wiese
const GRAS = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='60' height='14' viewBox='0 0 60 14'>" +
  "<path d='M0 14 L3 5 L5 14 L8 2 L10 14 L14 6 L16 14 L19 3 L22 14 L26 7 L28 14 L31 1 L34 14 L37 6 L40 14 " +
  "L43 3 L46 14 L49 7 L51 14 L54 2 L57 14 L60 6 L60 14 Z' fill='#5fa83a'/></svg>")}")`;

export default function Durchfahrt() {
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
    // Im versteckten Tab zieht niemand um
    const wach = async () => { while (!aus && document.hidden) await warte(1000); };

    const wiese = document.createElement("div");
    wiese.className = "umzug-wiese";
    wiese.style.setProperty("--gras", GRAS);
    band.appendChild(wiese);
    const wieseHoch = () => Math.max(10, Math.round((band.clientHeight || 120) * .13));
    const wieseSetzen = () => { wiese.style.height = wieseHoch() + "px"; };
    wieseSetzen();
    const wo = new ResizeObserver(wieseSetzen);
    wo.observe(band);

    // Staub, wo die Räder rollen: bleibt stehen, geht auf und vergeht
    const staub = (x, y, g) => {
      const d = document.createElement("div");
      d.className = "umzug-staub";
      d.style.cssText = `left:${x - g / 2}px;bottom:${y}px;width:${g}px;height:${g * .6}px`;
      band.appendChild(d);
      const a = d.animate([{ opacity: .55, transform: "scale(.4)" }, { opacity: 0, transform: `translate(0,${-g * .4}px) scale(1.6)` }],
        { duration: zufall(700, 1100), easing: "ease-out", fill: "forwards" });
      a.onfinish = () => d.remove();
    };
    // Rauch aus dem Kamin: steigt und weht nach hinten
    const rauch = (x, y, g, nachHinten) => {
      const r = document.createElement("div");
      r.className = "umzug-rauch";
      r.style.cssText = `left:${x - g / 2}px;bottom:${y}px;width:${g}px;height:${g}px`;
      band.appendChild(r);
      const a = r.animate([{ opacity: .7, transform: "translate(0,0) scale(.5)" },
        { opacity: 0, transform: `translate(${nachHinten * zufall(20, 45)}px,${-zufall(25, 45)}px) scale(1.8)` }],
        { duration: zufall(1400, 2200), easing: "ease-out", fill: "forwards" });
      a.onfinish = () => r.remove();
    };
    // Eine Feder fällt bis ins Gras, liegt kurz und verblasst
    const feder = (x, y, boden, farbe) => {
      const g = zufall(8, 14);
      const t = teilchen("feder", farbe, g);
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

    const umzug = async () => {
      const breit = band.clientWidth, hoch = band.clientHeight;
      if (!breit || !hoch) return;
      const fest = festFuer(new Date());
      const H = Math.max(36, Math.min(140, hoch * .58));      // Stall bis zum Rad unten
      const hh = H * .56, hw = hh * 1.24;                      // Huhn
      const boden = wieseHoch() * .45;                        // dort stehen die Füsse
      const rechts = Math.random() < .5;                      // Laufrichtung

      const zug = document.createElement("div");
      zug.className = "umzug";
      zug.dataset.fest = fest.name;
      const hoehe = H * 174 / 150;
      // Alles in der Zeichnung nach rechts laufend, von links: Küken,
      // Stall, Seil, zwei Zughühner, vorne zwei bis vier mit Ladung
      const teile = [];
      const kueken = Math.random() < .45;
      let x = kueken ? hh * .9 : 0;
      const stallX = x;
      const stall = document.createElement("div");
      stall.className = "umzug-stall";
      stall.style.cssText = `left:${stallX}px;bottom:${-4 / 150 * H}px;width:${H * 215 / 150}px;height:${hoehe}px`;
      stall.innerHTML = STALL;
      const deichsel = { x: stallX + 209 / 150 * H, y: (150 - 104) / 150 * H };
      x = deichsel.x + H * .35;
      const huhn = (hx, klasse, gefieder, zusatz, tiefer) => {
        const el = document.createElement("div");
        el.className = "umzug-huhn " + klasse;
        const g = hh * (tiefer ? .92 : 1);
        el.style.cssText = `left:${hx}px;bottom:${-.13 * g + (tiefer ? hh * .1 : 0)}px;width:${g * 1.24}px;height:${g}px;` +
          `z-index:${tiefer ? 1 : 3};--schritt:${zufall(.3, .4).toFixed(2)}s;animation-delay:${-zufall(0, .5).toFixed(2)}s`;
        el.innerHTML = `<div class="umzug-huhn__koerper">${huhnSvg(fest, gefieder, zusatz)}</div>`;
        el.querySelectorAll(".huhn-bein").forEach((b) => { b.style.animationDelay = el.style.animationDelay; });
        teile.push({ el, x: hx, w: g * 1.24, farbe: gefieder ? gefieder[0] : "#f4f1ea" });
        return { el, g };
      };
      // Zwei ziehen am Seil, eines etwas weiter hinten im Bild
      const zieher = [];
      for (const tiefer of [true, false]) {
        const hx = x + (tiefer ? hw * .7 : 0);
        const { el, g } = huhn(hx, "umzug-huhn--zieht", eins(GEFIEDER), GESCHIRR, tiefer);
        zieher.push({ x: hx + 52 / 124 * g * 1.24, y: (tiefer ? hh * .1 : 0) - .13 * g + (100 - 50) / 100 * g, el });
      }
      x += hw * 1.85;
      for (let n = ganz(2, 4); n > 0; n--) {
        huhn(x, "", eins(GEFIEDER), LADUNG[eins(Object.keys(LADUNG))], false);
        x += hw * zufall(1.05, 1.35);
      }
      const lang = x + hw * .2;
      zug.style.cssText = `width:${lang}px;height:${hoehe + H * .2}px;bottom:${boden}px`;
      // Seile von der Deichsel zu den Geschirren, leicht durchhängend
      const zh = hoehe + H * .2;
      const seil = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      seil.setAttribute("class", "umzug-seil");
      seil.setAttribute("viewBox", `0 0 ${lang} ${zh}`);
      seil.innerHTML = zieher.map((z) => {
        const ax = deichsel.x, ay = zh - deichsel.y, bx = z.x, by = zh - z.y;
        return `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)} Q${((ax + bx) / 2).toFixed(1)} ${(Math.max(ay, by) + H * .06).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}"/>`;
      }).join("");
      zug.appendChild(seil);
      zug.appendChild(stall);
      teile.forEach((t) => zug.appendChild(t.el));
      if (kueken) {
        const k = document.createElement("div");
        k.className = "umzug-kueken";
        const kh = hh * .42;
        k.style.cssText = `left:0;bottom:0;width:${kh * 40 / 36}px;height:${kh}px`;
        k.innerHTML = KUEKEN;
        zug.appendChild(k);
      }
      // Die Räder drehen genau so schnell, wie der Zug rollt
      const dauer = zufall(15000, 20000) * Math.max(1, (breit + lang) / 1600);
      const tempo = (breit + lang + 40) / dauer * 1000;
      const umfang = 2 * Math.PI * 16 / 150 * H;
      zug.querySelectorAll(".umzug-stall__rad").forEach((r) => { r.style.animationDuration = (umfang / tempo).toFixed(2) + "s"; });
      band.appendChild(zug);

      const spiegel = rechts ? "" : " scaleX(-1)";
      const von = rechts ? -lang - 20 : breit + 20, bis = rechts ? breit + 20 : -lang - 20;
      const a = zug.animate([{ transform: `translateX(${von}px)${spiegel}` }, { transform: `translateX(${bis}px)${spiegel}` }],
        { duration: dauer, easing: "linear", fill: "forwards" });
      // Stelle im Band zu einer Stelle in der Zeichnung
      const imBand = (px) => {
        const p = Math.min(1, (a.currentTime || 0) / dauer);
        const zx = von + (bis - von) * p;
        return zx + (rechts ? px : lang - px);
      };
      const raeder = [stallX + 48 / 150 * H, stallX + 152 / 150 * H];
      const kamin = { x: stallX + 143 / 150 * H, y: boden + (150 - 16) / 150 * H };
      let naechsterStaub = 0, naechsterRauch = 0, naechsteFeder = performance.now() + zufall(800, 2500);
      const nebenbei = async () => {
        while (!aus && zug.isConnected) {
          await warte(90);
          if (aus || !zug.isConnected) return;
          const jetzt = performance.now();
          if (jetzt > naechsterStaub) {
            raeder.forEach((r) => { const bx = imBand(r); if (bx > -20 && bx < breit + 20) staub(bx + zufall(-4, 4), boden - 2, H * zufall(.14, .22)); });
            naechsterStaub = jetzt + zufall(160, 320);
          }
          if (jetzt > naechsterRauch) {
            const bx = imBand(kamin.x);
            if (bx > -20 && bx < breit + 20) rauch(bx, kamin.y, H * zufall(.1, .16), rechts ? -1 : 1);
            naechsterRauch = jetzt + zufall(350, 600);
          }
          if (jetzt > naechsteFeder) {
            const t = eins(teile);
            const bx = imBand(t.x + t.w / 2);
            if (bx > 0 && bx < breit) feder(bx, boden + hh * zufall(.35, .6), boden - 2, t.farbe);
            naechsteFeder = jetzt + zufall(1200, 3500);
          }
        }
      };
      nebenbei();
      await new Promise((ok) => { a.onfinish = ok; a.oncancel = ok; });
      zug.remove();
    };

    (async () => {
      await warte(zufall(1000, 2500));
      while (!aus) {
        await wach();
        if (aus) return;
        await umzug();
        // Kurze Pause, dann kommt der nächste Umzug
        await warte(zufall(5000, 10000));
      }
    })();

    return () => {
      aus = true;
      uhren.forEach(clearTimeout);
      uhren.clear();
      wo.disconnect();
      band.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      band.replaceChildren();
    };
  }, []);
  return <div className="durchfahrt" ref={ref} aria-hidden="true" />;
}
