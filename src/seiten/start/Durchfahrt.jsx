// =================================================================
//  FERRARI UND MARIO IM BAND OBEN
//  Wunsch Patrick 22. Oktober 2026: „an Stelle der Hühner abwechslungs-
//  weise einen Ferrari und Super Mario mit einer Lasagne durch das Bild
//  fahren“. Die Hühner (1.130.0 bis 1.149.0) sind weg. Jetzt fährt
//  immer wieder einer durch: zuerst ein roter Sportwagen, flott und mit
//  Fahrtwind, dann ein Klempner mit roter Mütze im Go-Kart, der eine
//  dampfende Lasagne in den Händen hält, gemütlich und holpernd, mit
//  Rauchwölkchen hinten. Beide selbst gezeichnet (SVG), keine Bilder
//  von aussen. Gesteuert mit Zeitgebern und el.animate statt React-
//  Zustand, damit die Startseite dafür nie neu zeichnet.
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

// Klempner im Go-Kart mit Lasagne, Fahrt nach rechts
const MARIO = `
<svg viewBox="0 0 220 160" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="108" cy="154" rx="92" ry="5" fill="#000" opacity=".25"/>
  <g class="fahrt__dampf" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7">
    <path d="M150 52 C144 44 156 38 150 30 C144 22 156 16 150 8"/>
    <path d="M168 54 C162 46 174 40 168 32 C162 24 174 18 168 10"/>
    <path d="M186 52 C180 44 192 38 186 30 C180 22 192 16 186 8"/>
  </g>
  <g class="fahrt__fahrer">
    <path d="M70 96 C70 80 80 74 96 74 C112 74 120 82 120 98 L120 118 L70 118 Z" fill="#1d4fd6"/>
    <circle cx="84" cy="88" r="3.4" fill="#ffd21f"/>
    <circle cx="108" cy="88" r="3.4" fill="#ffd21f"/>
    <path d="M78 76 C90 70 104 70 114 76 L112 84 L80 84 Z" fill="#e52521"/>
    <path d="M108 80 C122 78 134 72 144 66" stroke="#e52521" stroke-width="11" stroke-linecap="round" fill="none"/>
    <circle cx="96" cy="50" r="22" fill="#f6c49b"/>
    <path d="M74 50 C74 58 78 64 84 66 L86 54 Z" fill="#5a3418"/>
    <path d="M73 46 C72 28 84 20 98 20 C112 20 120 30 120 40 L74 44 Z" fill="#e52521"/>
    <path d="M110 40 C122 38 132 40 136 44 C130 46 120 46 110 45 Z" fill="#c01a17"/>
    <circle cx="97" cy="31" r="7.5" fill="#fff"/>
    <path d="M93 35 L93 27 L97 31.5 L101 27 L101 35" fill="none" stroke="#e52521" stroke-width="2.2" stroke-linejoin="round"/>
    <ellipse cx="108" cy="49" rx="2.4" ry="3.8" fill="#1a1a1a"/>
    <circle cx="117" cy="56" r="7" fill="#f2a97f"/>
    <path d="M100 62 C104 58 110 60 113 62 C117 60 123 59 126 63 C122 68 116 66 113 65 C109 68 103 67 100 62 Z" fill="#3b2412"/>
    <path d="M84 60 C82 63 82 66 85 68" stroke="#e8ab82" stroke-width="2" fill="none" stroke-linecap="round"/>
  </g>
  <g class="fahrt__lasagne">
    <path d="M136 60 L200 60 L196 80 L140 80 Z" fill="#9aa3ad"/>
    <rect x="140" y="64" width="56" height="5" fill="#f3cf6b"/>
    <rect x="140" y="69" width="56" height="4" fill="#c8361d"/>
    <rect x="140" y="73" width="56" height="4" fill="#f3cf6b"/>
    <path d="M139 64 C146 58 154 63 160 59 C168 56 174 62 182 58 C188 56 194 60 197 64 Z" fill="#f0a73a"/>
    <circle cx="152" cy="61" r="2" fill="#a8551b"/>
    <circle cx="172" cy="60" r="1.8" fill="#a8551b"/>
    <circle cx="186" cy="61" r="2" fill="#a8551b"/>
    <path d="M136 60 L200 60" stroke="#6f7781" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="140" cy="70" r="6.5" fill="#fff" stroke="#d9d9d9" stroke-width="1"/>
    <circle cx="198" cy="70" r="6.5" fill="#fff" stroke="#d9d9d9" stroke-width="1"/>
  </g>
  <path d="M18 112 L36 112 L42 120 L190 120 C200 120 206 124 206 130 L206 136 L18 136 Z" fill="#f2b705"/>
  <path d="M18 112 L30 112 L30 104 L18 104 Z" fill="#c78f00"/>
  <rect x="24" y="126" width="174" height="5" rx="2" fill="#c78f00"/>
  <path d="M196 120 L208 112" stroke="#555" stroke-width="4" stroke-linecap="round"/>
  ${rad(44, 138, 17)}
  ${rad(176, 138, 17)}
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

    // Rauchwölkchen hinter dem Kart, steigen auf und verblassen
    const woelkchen = (x, y, g) => {
      const w = document.createElement("div");
      w.className = "fahrt-rauch";
      w.style.left = x - g / 2 + "px";
      w.style.bottom = y + "px";
      w.style.width = w.style.height = g + "px";
      band.appendChild(w);
      const a = w.animate([
        { opacity: .55, transform: "translate(0,0) scale(.5)" },
        { opacity: 0, transform: `translate(${-zufall(20, 50)}px,${-zufall(15, 35)}px) scale(1.6)` },
      ], { duration: zufall(900, 1500), easing: "ease-out", fill: "forwards" });
      a.onfinish = () => w.remove();
    };

    const fahren = async (welcher) => {
      const breit = band.clientWidth, hoch = band.clientHeight;
      if (!breit || !hoch) return;
      const ferrari = welcher === "ferrari";
      // So hoch, dass er gut zu sehen ist, aber unten im Band bleibt
      const h = Math.max(36, Math.min(ferrari ? 100 : 140, hoch * (ferrari ? .5 : .62)));
      const w = h * (ferrari ? 250 / 84 : 220 / 160);
      const el = document.createElement("div");
      el.className = "fahrt fahrt--" + welcher;
      el.style.width = w + "px";
      el.style.height = h + "px";
      el.innerHTML = ferrari ? FERRARI : MARIO;
      // Der Ferrari kommt mal von links, mal von rechts, Mario immer von
      // links, sonst stünde das M auf der Mütze verkehrt
      const nachRechts = ferrari ? Math.random() < .5 : true;
      if (!nachRechts) el.classList.add("fahrt--links");
      band.appendChild(el);
      const von = nachRechts ? -w - 20 : breit + 20, bis = nachRechts ? breit + 20 : -w - 20;
      // Der Ferrari braust in gut 3 Sekunden durch, Mario lässt sich Zeit
      const dauer = ferrari ? zufall(2600, 3600) * Math.max(1, breit / 1400) : zufall(9000, 12000) * Math.max(1, breit / 1400);
      const a = el.animate([{ transform: `translateX(${von}px)` }, { transform: `translateX(${bis}px)` }],
        { duration: dauer, easing: ferrari ? "cubic-bezier(.3,.05,.7,.95)" : "linear", fill: "forwards" });
      let rauchUhr = null;
      if (!ferrari) {
        const rauch = () => {
          if (aus) return;
          const r = el.getBoundingClientRect(), br = band.getBoundingClientRect();
          woelkchen(r.left - br.left + w * .06, h * .2, h * zufall(.12, .2));
          rauchUhr = setTimeout(rauch, zufall(180, 420));
        };
        rauchUhr = setTimeout(rauch, 200);
      }
      await warte(dauer);
      clearTimeout(rauchUhr);
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
        await fahren(ferrari ? "ferrari" : "mario");
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
