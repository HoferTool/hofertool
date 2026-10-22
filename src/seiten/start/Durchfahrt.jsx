// =================================================================
//  FERRARI UND JETSKI IM BAND OBEN
//  Wunsch Patrick 22. Oktober 2026: „an Stelle der Hühner abwechslungs-
//  weise einen Ferrari und Super Mario mit einer Lasagne durch das Bild
//  fahren“. Die Hühner (1.130.0 bis 1.149.0) sind weg. Jetzt fährt
//  immer wieder einer durch: zuerst ein roter Sportwagen, flott und mit
//  Fahrtwind, dann ein Klempner mit roter Mütze im Go-Kart, der eine
//  dampfende Lasagne in den Händen hält, gemütlich und holpernd, mit
//  Rauchwölkchen hinten. Beide selbst gezeichnet (SVG), keine Bilder
//  von aussen. Gesteuert mit Zeitgebern und el.animate statt React-
//  Zustand, damit die Startseite dafür nie neu zeichnet.
//  Seit 1.151.0 (Wunsch Patrick 22. Oktober 2026: „Nimm den Mario weg
//  und ersetze ihn mit dem Jetski“) fährt statt Mario ein Jetski im
//  Ferrari-Kleid mit Jviano als Fahrer, schaukelnd auf einer Welle, mit Gischt.
// =================================================================
import { useEffect, useRef } from "react";

const zufall = (a, b) => a + Math.random() * (b - a);

// Rad mit Speichen; die Gruppe dreht sich in der CSS-Animation
const rad = (cx, cy, r) => `
  <g class="fahrt__rad" style="transform-origin:${cx}px ${cy}px">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#161616"/>
    <circle cx="${cx}" cy="${cy}" r="${r * .62}" fill="#c9ccd1"/>
    <circle cx="${cx}" cy="${cy}" r="${r * .5}" fill="#8d9299"/>
    ${[0, 72, 144, 216, 288].map((w) => `<rect x="${cx - 1.6}" y="${cy - r * .58}" width="3.2" height="${r * .58}" rx="1.4" fill="#e3e5e8" transform="rotate(${w} ${cx} ${cy})"/>`).join("")}
    <circle cx="${cx}" cy="${cy}" r="${r * .14}" fill="#e3e5e8"/>
  </g>`;

// Roter Sportwagen von der Seite, Front rechts
const FERRARI = `
<svg viewBox="0 0 250 84" xmlns="http://www.w3.org/2000/svg">
  <g class="fahrt__wind" stroke="#fff" stroke-linecap="round" opacity=".55">
    <line x1="-40" y1="30" x2="-6" y2="30" stroke-width="2.5"/>
    <line x1="-60" y1="44" x2="-14" y2="44" stroke-width="3"/>
    <line x1="-34" y1="58" x2="-4" y2="58" stroke-width="2.5"/>
  </g>
  <ellipse cx="125" cy="78" rx="112" ry="5" fill="#000" opacity=".25"/>
  <circle cx="58" cy="62" r="19" fill="#5e0a0a"/>
  <circle cx="196" cy="62" r="19" fill="#5e0a0a"/>
  <path d="M8 40 L8 31 L34 31 L36 37 Z" fill="#b30f0f"/>
  <path d="M10 54 C10 45 16 40 32 38 L74 34 C90 26 106 23 128 23 C148 23 162 27 176 34 L220 38
           C234 40 242 47 242 56 L242 62 C242 65 239 67 236 67 L216 67 A20 20 0 0 0 176 67 L78 67
           A20 20 0 0 0 38 67 L14 67 C11 67 10 65 10 62 Z" fill="#d81b1b"/>
  <path d="M26 46 C70 41 160 40 236 47" stroke="#ff6b5e" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M90 35 C100 29 110 27 124 27 L125 35 Z" fill="#1f2a36"/>
  <path d="M130 27 C146 27 156 30 166 35 L130 35 Z" fill="#1f2a36"/>
  <path d="M97 32 C103 30 108 29 114 28.5" stroke="#7fa6c9" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M96 50 L132 49 C126 55 112 58 98 57 Z" fill="#7a0c0c"/>
  <rect x="219" y="41" width="7" height="9" rx="1.6" fill="#ffd21f"/>
  <path d="M222.5 43 L221.2 48 L223.8 48 Z" fill="#111"/>
  <path d="M232 45 C237 46 240 49 241 52 L229 50 Z" fill="#fff4c2"/>
  <rect x="9" y="47" width="7" height="5" rx="1.5" fill="#5e0a0a"/>
  ${rad(58, 64, 15)}
  ${rad(196, 64, 15)}
</svg>`;

// Jetski im Kleid eines roten Ferrari (wie die Supercar-Jetskis aus
// Miami), Jviano fährt (Wunsch Patrick: „inkl. Jviano“), sein Name steht
// auf der Seite. Fahrt nach rechts, Front rechts
const JETSKI = `
<svg viewBox="0 0 250 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fahrt-wasser" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#7fc4f0" stop-opacity="0"/>
      <stop offset=".2" stop-color="#7fc4f0" stop-opacity=".85"/>
      <stop offset=".8" stop-color="#7fc4f0" stop-opacity=".85"/>
      <stop offset="1" stop-color="#7fc4f0" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g class="fahrt__gischt" fill="#fff">
    <path d="M30 100 C14 92 0 80 -14 66 C-2 84 -6 92 -26 96 C-6 100 10 104 30 104 Z" opacity=".75"/>
    <circle cx="-8" cy="62" r="3.5" opacity=".8"/>
    <circle cx="-26" cy="74" r="2.6" opacity=".7"/>
    <circle cx="4" cy="54" r="2.2" opacity=".7"/>
    <circle cx="-38" cy="86" r="3" opacity=".6"/>
  </g>
  <g class="fahrt__schaukeln">
    <g class="fahrt__fahrer">
      <path d="M96 54 C92 40 98 30 110 28 L118 28 C122 36 122 48 118 58 Z" fill="#111"/>
      <path d="M108 30 L136 46" stroke="#111" stroke-width="9" stroke-linecap="round"/>
      <path d="M104 56 L132 58 L138 72" stroke="#1f2a36" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <rect x="100" y="34" width="18" height="18" rx="4" fill="#ffd21f"/>
      <circle cx="114" cy="16" r="12" fill="#e8b48c"/>
      <path d="M102 15 C100 4 110 0 118 2 C124 3 127 7 126 11 L112 10 L106 18 Z" fill="#2a1a10"/>
      <path d="M113 13 L127 13 L126 17 L114 17 Z" fill="#111"/>
      <path d="M118 23 C121 24 124 23 125 21" stroke="#8a4a32" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    </g>
    <path d="M140 44 L150 40" stroke="#333" stroke-width="4" stroke-linecap="round"/>
    <path d="M134 50 L142 42" stroke="#333" stroke-width="4" stroke-linecap="round"/>
    <path d="M14 82 C14 74 20 70 34 68 L74 64 C88 56 104 54 124 54 C142 54 156 58 170 64 L222 70
             C236 72 244 78 246 86 L240 94 C200 100 80 102 26 98 C18 96 14 90 14 82 Z" fill="#d81b1b"/>
    <path d="M10 70 L10 62 L32 62 L34 68 Z" fill="#b30f0f"/>
    <path d="M28 76 C70 71 160 70 238 78" stroke="#ff6b5e" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M90 66 C120 64 150 66 166 70 L92 72 Z" fill="#7a0c0c"/>
    <rect x="214" y="72" width="7" height="9" rx="1.6" fill="#ffd21f"/>
    <path d="M217.5 74 L216.2 79 L218.8 79 Z" fill="#111"/>
    <path d="M232 76 C237 77 241 80 242 83 L229 81 Z" fill="#fff4c2"/>
    <text class="fahrt__name" x="150" y="92" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" font-weight="800" font-style="italic" fill="#fff">JVIANO</text>
    <path d="M26 98 C80 102 200 100 240 94 L236 100 C190 106 70 106 30 102 Z" fill="#5e0a0a"/>
  </g>
  <path class="fahrt__welle" d="M-40 104 Q-25 98 -10 104 T20 104 T50 104 T80 104 T110 104 T140 104 T170 104 T200 104 T230 104 T260 104 T290 104 L290 120 L-40 120 Z" fill="url(#fahrt-wasser)"/>
  <path d="M-40 110 Q-25 106 -10 110 T20 110 T50 110 T80 110 T110 110 T140 110 T170 110 T200 110 T230 110 T260 110 T290 110" stroke="url(#fahrt-wasser)" stroke-width="2" fill="none"/>
</svg>`;

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
    // Im versteckten Tab fährt niemand los
    const wach = async () => { while (!aus && document.hidden) await warte(1000); };

    const fahren = async (welcher) => {
      const breit = band.clientWidth, hoch = band.clientHeight;
      if (!breit || !hoch) return;
      const ferrari = welcher === "ferrari";
      // So hoch, dass er gut zu sehen ist, aber unten im Band bleibt
      const h = Math.max(36, Math.min(ferrari ? 100 : 120, hoch * (ferrari ? .5 : .56)));
      const w = h * (ferrari ? 250 / 84 : 250 / 120);
      const el = document.createElement("div");
      el.className = "fahrt fahrt--" + welcher;
      el.style.width = w + "px";
      el.style.height = h + "px";
      el.innerHTML = ferrari ? FERRARI : JETSKI;
      // Beide kommen mal von links, mal von rechts
      const nachRechts = Math.random() < .5;
      if (!nachRechts) el.classList.add("fahrt--links");
      band.appendChild(el);
      const von = nachRechts ? -w - 20 : breit + 20, bis = nachRechts ? breit + 20 : -w - 20;
      // Der Ferrari braust in gut 3 Sekunden durch, der Jetski etwas gemütlicher
      const dauer = (ferrari ? zufall(2600, 3600) : zufall(5000, 7000)) * Math.max(1, breit / 1400);
      const a = el.animate([{ transform: `translateX(${von}px)` }, { transform: `translateX(${bis}px)` }],
        { duration: dauer, easing: ferrari ? "cubic-bezier(.3,.05,.7,.95)" : "linear", fill: "forwards" });
      await warte(dauer);
      a.cancel();
      el.remove();
    };

    (async () => {
      // Abwechselnd, wer zuerst kommt, ist Zufall
      let ferrari = Math.random() < .5;
      await warte(zufall(1500, 4000));
      while (!aus) {
        await wach();
        if (aus) return;
        await fahren(ferrari ? "ferrari" : "jetski");
        ferrari = !ferrari;
        await warte(zufall(15000, 35000));
      }
    })();

    return () => {
      aus = true;
      uhren.forEach(clearTimeout);
      uhren.clear();
      band.replaceChildren();
    };
  }, []);
  return <div className="durchfahrt" ref={ref} aria-hidden="true" />;
}
