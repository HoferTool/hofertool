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
//
//  Seit 1.180.0 verkleiden sich die Hühner je nach Fest und Jahreszeit
//  von selbst (feste.js): Weihnachten, Silvester, Fasnacht,
//  Valentinstag, Ostern, 1. August, sonst Frühling, Sommer, Herbst, Winter.
// =================================================================
import { useEffect, useRef } from "react";
import { useTafelMass } from "./daten.js";
import { festFuer, teilchen } from "./feste.js";

// Die Fläche unter dem Kopf, in Punkten der Tafel

// Nacht: 23:00 bis 05:30, sonntags den ganzen Tag
export function istNacht(d = new Date()) {
  if (d.getDay() === 0) return true;
  const min = d.getHours() * 60 + d.getMinutes();
  return min >= 23 * 60 || min < 5 * 60 + 30;
}

// Empfang: von 18:00 bis 06:00 nur Schwarz, jeden Tag (Wunsch Patrick
// 29. Oktober 2026: „zwischen 18.00 und 06.00 einen schwarzen Bildschirm“)
export function istEmpfangDunkel(d = new Date()) {
  const h = d.getHours();
  return h >= 18 || h < 6;
}

// Das Huhn kommt immer aus feste.js, verkleidet je Fest und Jahreszeit.
// Das düstere Halloween-Huhn (1.179.1 bis 1.441.x) ist seit 1.442.0 weg
// (Wunsch Patrick 6. November 2026: „Entferne … das Halloween Thema“).

const zufall = (a, b) => a + Math.random() * (b - a);
const ganz = (a, b) => Math.floor(zufall(a, b + 1));
const GLEICHZEITIG = 6;

export default function Huehnerhimmel() {
  const himmel = useRef(null);
  // Fläche unter dem Kopf, je nach Bildschirm hochkant oder quer
  const mass = useTafelMass();
  const BREITE = mass.breite, FLAECHE_H = mass.hoehe - mass.kopf;

  useEffect(() => {
    const hof = himmel.current;
    if (!hof) return undefined;
    let aus = false;
    const uhren = new Set();
    const warte = (ms) => new Promise((ok) => {
      const t = setTimeout(() => { uhren.delete(t); ok(); }, ms);
      uhren.add(t);
    });

    // Das Fest des Tages; vor jedem Flug neu, damit es um Mitternacht wechselt
    let jetzt = null;
    const festHolen = () => {
      const f = festFuer(new Date());
      if (!jetzt || jetzt.name !== f.name) {
        hof.style.background = f.himmel;
        hof.dataset.fest = f.name;
      }
      jetzt = f;
      return f;
    };
    festHolen();

    // Ein Teilchen (Feder, Schneeflocke, Ei …) trudelt nach unten und verblasst
    const fallen = (art, x, y, fall, dauer, g) => {
      const farbe = jetzt.farben[ganz(0, jetzt.farben.length - 1)];
      const t = teilchen(art, farbe, g);
      const f = document.createElement("div");
      f.className = "ib-huhn-feder";
      f.style.cssText = `width:${t.w}px;height:${t.h}px;left:${x}px;top:${y}px;${t.stil || ""}`;
      f.innerHTML = t.html;
      hof.appendChild(f);
      const dx = zufall(-80, 80);
      const a = f.animate([
        { opacity: 0, transform: "translate(0,0) rotate(0deg)" },
        { opacity: 0.85, transform: `translate(${dx * 0.3}px,${fall * 0.2}px) rotate(${zufall(-60, 60)}deg)`, offset: 0.15 },
        { opacity: 0.65, transform: `translate(${dx * 0.7}px,${fall * 0.6}px) rotate(${zufall(-120, 120)}deg)`, offset: 0.6 },
        { opacity: 0, transform: `translate(${dx}px,${fall}px) rotate(${zufall(-180, 180)}deg)` },
      ], { duration: dauer, easing: "ease-in-out", fill: "forwards" });
      a.onfinish = () => f.remove();
    };
    const feder = (x, y) => fallen(jetzt.faellt, x, y, zufall(160, 380), zufall(4000, 7000), zufall(18, 32));

    // Ein Flug quer über die Tafel, in Wellen auf und ab
    const flug = async () => {
      const gross = Math.random();
      const w = 90 + gross * 150, h = w * 100 / 124;
      const rechts = Math.random() < 0.5;
      const huhn = document.createElement("div");
      huhn.className = "ib-huhn";
      const fest = festHolen();
      huhn.innerHTML = fest.huhn;
      huhn.style.filter = fest.leuchten;
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
    // Dazu fällt je nach Fest leise etwas vom Himmel (Schnee, Blüten …)
    const regen = async () => {
      while (!aus) {
        await warte(zufall(500, 1100));
        if (aus) return;
        const art = festHolen().regen;
        if (art) fallen(art, zufall(0, BREITE), zufall(-30, FLAECHE_H * 0.4), zufall(500, 900), zufall(9000, 15000), zufall(12, 26));
      }
    };
    regen();
    return () => {
      aus = true;
      uhren.forEach(clearTimeout);
      uhren.clear();
      hof.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      hof.replaceChildren();
    };
  }, [BREITE, FLAECHE_H]);

  return <div className="ib-nacht" ref={himmel} data-ib="nacht" aria-hidden="true"
    style={{ top: mass.kopf, height: FLAECHE_H }} />;
}
