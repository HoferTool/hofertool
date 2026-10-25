// =================================================================
//  INFOBOARD: BILDSCHIRMSCHONER IN DER NACHT
//  Wunsch Patrick 25. Oktober 2026: „von 23:00 bis 05:30 Uhr nur der
//  Solarbereich sichtbar und der Rest schwarz, dort sollen Hühner
//  herumfliegen“ und „auch am Sonntag“. Sonntags gilt er darum den
//  ganzen Tag (Samstag 23:00 bis Montag 05:30 am Stück).
//
//  Die Solaranlage steht in der Mitte der Tafel, wie im Kopf der
//  Startseite. Die Hühner fliegen frei über die schwarze Fläche,
//  verschieden gross, mit schlagenden Flügeln, und verlieren ab und zu
//  eine Feder. Gesteuert mit Zeitgebern und el.animate statt React-
//  Zustand, damit die Solaranlage nie neu gezeichnet wird.
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Solaranlage } from "../seiten/Start.jsx";
import { BREITE, HOEHE, LUECKE } from "./daten.js";

// Nacht: 23:00 bis 05:30, sonntags den ganzen Tag
export function istNacht(d = new Date()) {
  if (d.getDay() === 0) return true;
  const min = d.getHours() * 60 + d.getMinutes();
  return min >= 23 * 60 || min < 5 * 60 + 30;
}

// Ein Huhn von der Seite, Blick nach rechts; der Flügel ist eine eigene
// Gruppe, damit er schlagen kann
const HUHN = `<svg viewBox="0 0 124 100" xmlns="http://www.w3.org/2000/svg">
  <g fill="#f4f1ea">
    <path d="M22 50 L5 24 L15 33 L11 15 L23 32 L24 17 L31 38 Z"/>
    <ellipse cx="46" cy="54" rx="30" ry="21"/>
    <ellipse cx="67" cy="40" rx="11" ry="15"/>
    <circle cx="72" cy="28" r="12"/>
  </g>
  <g fill="#e2463b">
    <circle cx="67" cy="15" r="4.5"/><circle cx="73.5" cy="13.5" r="4.5"/><circle cx="79.5" cy="16.5" r="4"/>
    <ellipse cx="80" cy="40" rx="3.2" ry="5.5"/>
  </g>
  <path d="M82 25 L96 30 L82 35 Z" fill="#f2b233"/>
  <circle cx="75" cy="26" r="2.6" fill="#111"/>
  <g stroke="#f2b233" stroke-width="3" stroke-linecap="round" fill="none">
    <path d="M40 72 L36 84 M36 84 L30 86 M36 84 L40 87"/>
    <path d="M52 72 L50 84 M50 84 L44 86 M50 84 L54 87"/>
  </g>
  <g class="ib-huhn__fluegel"><path d="M30 50 C38 20 62 18 66 46 C56 60 40 62 30 50 Z" fill="#d9d3c5"/></g>
</svg>`;

const zufall = (a, b) => a + Math.random() * (b - a);
const ganz = (a, b) => Math.floor(zufall(a, b + 1));
const GLEICHZEITIG = 6;

export default function Nacht() {
  const rahmen = useRef(null);
  const himmel = useRef(null);
  const [k, setK] = useState(0);

  // Die Tafel passt sich ganz in den Bildschirm ein wie das Infoboard
  useLayoutEffect(() => {
    const el = rahmen.current;
    if (!el) return;
    const rechnen = () => {
      const w = el.clientWidth, h = el.clientHeight;
      setK(w && h ? Math.min(w / BREITE, h / HOEHE) : 0);
    };
    rechnen();
    const ro = new ResizeObserver(rechnen);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const hof = himmel.current;
    if (!hof || !k) return undefined;
    let aus = false;
    const uhren = new Set();
    const warte = (ms) => new Promise((ok) => {
      const t = setTimeout(() => { uhren.delete(t); ok(); }, ms);
      uhren.add(t);
    });

    // Eine Feder trudelt langsam nach unten und verblasst
    const feder = (x, y) => {
      const f = document.createElement("div");
      f.className = "ib-huhn-feder";
      const g = zufall(18, 32);
      f.style.width = g * 0.4 + "px";
      f.style.height = g + "px";
      f.style.left = x + "px";
      f.style.top = y + "px";
      hof.appendChild(f);
      const dx = zufall(-80, 80), fall = zufall(160, 380);
      const a = f.animate([
        { opacity: 0, transform: "translate(0,0) rotate(0deg)" },
        { opacity: 0.8, transform: `translate(${dx * 0.3}px,${fall * 0.2}px) rotate(${zufall(-60, 60)}deg)`, offset: 0.15 },
        { opacity: 0.6, transform: `translate(${dx * 0.7}px,${fall * 0.6}px) rotate(${zufall(-120, 120)}deg)`, offset: 0.6 },
        { opacity: 0, transform: `translate(${dx}px,${fall}px) rotate(${zufall(-180, 180)}deg)` },
      ], { duration: zufall(4000, 7000), easing: "ease-in-out", fill: "forwards" });
      a.onfinish = () => f.remove();
    };

    // Ein Flug quer über die Tafel, in Wellen auf und ab
    const flug = async () => {
      const gross = Math.random();
      const w = 90 + gross * 150, h = w * 100 / 124;
      const rechts = Math.random() < 0.5;
      const huhn = document.createElement("div");
      huhn.className = "ib-huhn";
      huhn.innerHTML = HUHN;
      huhn.style.width = w + "px";
      huhn.style.height = h + "px";
      huhn.style.zIndex = String(Math.round(gross * 10));
      // Kleinere (weiter weg) sind etwas dunkler
      huhn.style.opacity = (0.55 + gross * 0.45).toFixed(2);
      const schlag = huhn.querySelector(".ib-huhn__fluegel");
      if (schlag) schlag.style.animationDuration = zufall(0.18, 0.32).toFixed(2) + "s";
      hof.appendChild(huhn);

      const y0 = zufall(40, HOEHE - h - 40);
      const y1 = Math.min(HOEHE - h - 20, Math.max(20, y0 + zufall(-500, 500)));
      const xa = rechts ? -w - 20 : BREITE + 20, xe = rechts ? BREITE + 20 : -w - 20;
      const wellen = ganz(1, 3), hub = zufall(30, 110);
      const dreh = rechts ? "" : " scaleX(-1)";
      const bilder = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const x = xa + (xe - xa) * t;
        const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI * 2 * wellen) * hub;
        const neig = Math.cos(t * Math.PI * 2 * wellen) * (rechts ? -8 : 8);
        bilder.push({ transform: `translate(${x}px,${y}px) rotate(${neig}deg)${dreh}` });
      }
      const dauer = zufall(9000, 18000) * (1.3 - gross * 0.5);
      const a = huhn.animate(bilder, { duration: dauer, easing: "linear", fill: "forwards" });
      // Unterwegs ab und zu eine Feder
      const federn = async () => {
        while (!aus && huhn.isConnected) {
          await warte(zufall(1200, 4000));
          if (aus || !huhn.isConnected) return;
          const m = new DOMMatrixReadOnly(getComputedStyle(huhn).transform);
          if (m.m41 > 0 && m.m41 < BREITE) feder(m.m41 + w / 2, m.m42 + h * 0.6);
        }
      };
      federn();
      await new Promise((ok) => { a.onfinish = ok; a.oncancel = ok; });
      huhn.remove();
    };

    // Ein paar Hühner leben je für sich: fliegen, Pause, wieder fliegen
    const leben = async (i) => {
      await warte(i === 0 ? 300 : zufall(1500, 15000));
      while (!aus) {
        await flug();
        if (aus) return;
        await warte(zufall(2000, 12000));
      }
    };
    for (let i = 0; i < GLEICHZEITIG; i++) leben(i);
    return () => {
      aus = true;
      uhren.forEach(clearTimeout);
      uhren.clear();
      hof.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      hof.replaceChildren();
    };
  }, [k]);

  const breite = BREITE - 2 * LUECKE;
  return (
    <div className="ib-rahmen ib-nacht" ref={rahmen} data-ib="nacht">
      {k > 0 &&
      <div className="ib-blatt ib-nacht__blatt"
        style={{ width: BREITE, height: HOEHE, transform: "translate(-50%, -50%) scale(" + k + ")" }}>
        {/* Wie im Kopf der Tafel, damit sie genau gleich aussieht */}
        <div className="ib-kopf ib-nacht__solar" style={{ left: LUECKE, width: breite }}>
          <div className="ib-kopf__innen" style={{ position: "static", width: breite }}>
            <Solaranlage ohneId />
          </div>
        </div>
        <div className="ib-nacht__himmel" ref={himmel} aria-hidden="true" />
      </div>}
    </div>
  );
}
