// =================================================================
//  INFOBOARD: BILDSCHIRMSCHONER IN DER NACHT
//  Wunsch Patrick 25. Oktober 2026: „von 23:00 bis 05:30 Uhr … der
//  Rest schwarz, dort sollen Hühner herumfliegen“, „auch am Sonntag“
//  und „Kopf soll bleiben wie er war, nur der Dokumentenbereich soll
//  ausgeblendet werden und mit Hühnern ersetzt“. Sonntags gilt er darum
//  den ganzen Tag (Samstag 23:00 bis Montag 05:30 am Stück).
//
//  Der Kopf der Tafel (Uhr, Logo, Wetter, Solaranlage) bleibt; unter
//  ihm ist statt der Dokumente alles schwarz, und dort fliegen Hühner,
//  verschieden gross, mit schlagenden Flügeln, und verlieren ab und zu
//  eine Feder. Gesteuert mit Zeitgebern und el.animate statt React-
//  Zustand, damit die Tafel dafür nie neu zeichnet.
// =================================================================
import { useEffect, useRef } from "react";
import { BREITE, HOEHE, KOPF_H } from "./daten.js";

// Die Fläche unter dem Kopf, in Punkten der Tafel
const FLAECHE_H = HOEHE - KOPF_H;

// Nacht: 23:00 bis 05:30, sonntags den ganzen Tag
export function istNacht(d = new Date()) {
  if (d.getDay() === 0) return true;
  const min = d.getHours() * 60 + d.getMinutes();
  return min >= 23 * 60 || min < 5 * 60 + 30;
}

// Ein Halloween-Huhn von der Seite, Blick nach rechts (Wunsch Patrick
// 25. Oktober 2026: „Halloween-Versionen, etwas düster und furcht-
// erregend“): schwarz-zerzaust mit Rippen, glühenden Augen, Reisszähnen,
// tropfendem Kamm, Krallen und Fledermausflügel. Der Flügel ist eine
// eigene Gruppe, damit er schlagen kann.
const HUHN = `<svg viewBox="0 0 124 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="ibAuge"><stop offset="0" stop-color="#fff6c0"/><stop offset=".35" stop-color="#ff3b1f"/><stop offset="1" stop-color="#ff3b1f" stop-opacity="0"/></radialGradient>
    <linearGradient id="ibLeib" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3340"/><stop offset="1" stop-color="#141117"/></linearGradient>
  </defs>
  <g fill="url(#ibLeib)" stroke="#5b2a6e" stroke-width="1.2" stroke-linejoin="round">
    <path d="M24 50 L2 20 L14 30 L6 8 L22 28 L20 4 L30 30 L34 14 L36 40 Z"/>
    <path d="M18 56 C18 38 34 32 50 33 C62 34 74 40 76 52 C78 66 66 76 50 76 L46 82 L43 75 L36 80 L35 73 L27 76 L28 69 C21 66 18 62 18 56 Z"/>
    <path d="M58 44 C56 34 60 24 64 18 C70 12 80 14 84 22 C86 30 82 38 78 44 C74 52 62 54 58 44 Z"/>
  </g>
  <g stroke="#cfc6b4" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".75">
    <path d="M36 46 C40 54 40 62 36 70"/><path d="M43 44 C47 53 47 63 43 72"/><path d="M50 44 C54 53 54 63 50 72"/><path d="M57 46 C60 54 60 62 57 69"/>
  </g>
  <g fill="#7a0d12">
    <path d="M66 18 L64 6 L70 13 L72 2 L76 12 L81 4 L80 16 Z"/>
    <path d="M67 14 L67 22 C67 25 65 25 65 22 Z"/><path d="M76 14 L76 19 C76 21 74.5 21 74.5 19 Z"/>
    <path d="M80 40 C84 42 84 50 81 54 C79 51 78 46 80 40 Z"/>
    <path d="M82 52 L82 58 C82 60 80.5 60 80.5 58 Z"/>
  </g>
  <path d="M83 24 L100 26 L86 30 L99 34 L83 36 Z" fill="#2b2620" stroke="#8a7a52" stroke-width="1"/>
  <path d="M86 30 L88 33 L90 30 M92 30 L94 33 L96 30" stroke="#f3eee0" stroke-width="1.2" fill="none" stroke-linejoin="round"/>
  <circle cx="75" cy="25" r="7" fill="url(#ibAuge)"/>
  <circle cx="75" cy="25" r="1.6" fill="#fff6c0"/>
  <path d="M68 18 L82 22" stroke="#141117" stroke-width="3" stroke-linecap="round"/>
  <g stroke="#3d3a33" stroke-width="2.6" stroke-linecap="round" fill="none">
    <path d="M40 76 L37 88 M37 88 L29 92 M37 88 L37 95 M37 88 L43 93"/>
    <path d="M52 76 L51 88 M51 88 L43 92 M51 88 L51 95 M51 88 L57 93"/>
  </g>
  <g fill="#e8dfc8">
    <path d="M29 92 L26 94 L29 94 Z"/><path d="M37 95 L36 98 L38 96 Z"/><path d="M43 93 L45 96 L44 93 Z"/>
    <path d="M43 92 L40 94 L43 94 Z"/><path d="M51 95 L50 98 L52 96 Z"/><path d="M57 93 L59 96 L58 93 Z"/>
  </g>
  <g class="ib-huhn__fluegel">
    <path d="M62 46 L28 4 L34 22 L20 12 L28 32 L12 28 L26 44 L14 48 L36 54 Z" fill="#1d1622" stroke="#6b2f80" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M62 46 L28 4 M62 46 L20 12 M62 46 L12 28 M62 46 L14 48" stroke="#4a3d52" stroke-width="1.6" fill="none"/>
  </g>
</svg>`;

const zufall = (a, b) => a + Math.random() * (b - a);
const ganz = (a, b) => Math.floor(zufall(a, b + 1));
const GLEICHZEITIG = 6;

export default function Huehnerhimmel() {
  const himmel = useRef(null);

  useEffect(() => {
    const hof = himmel.current;
    if (!hof) return undefined;
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

      const y0 = zufall(20, FLAECHE_H - h - 20);
      const y1 = Math.min(FLAECHE_H - h - 20, Math.max(20, y0 + zufall(-500, 500)));
      const xa = rechts ? -w - 20 : BREITE + 20, xe = rechts ? BREITE + 20 : -w - 20;
      const wellen = ganz(1, 3), hub = Math.min(zufall(30, 110), y0 - 10, FLAECHE_H - h - y0 - 10, y1 - 10, FLAECHE_H - h - y1 - 10);
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
  }, []);

  return <div className="ib-nacht" ref={himmel} data-ib="nacht" aria-hidden="true"
    style={{ top: KOPF_H, height: FLAECHE_H }} />;
}
