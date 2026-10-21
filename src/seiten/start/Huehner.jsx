// =================================================================
//  HÜHNER IM BAND OBEN
//  Wunsch Patrick 21. Oktober 2026: „dass es Federn verliert und mehr
//  als ein Huhn auf dem Balken, bis zu 20 Hühner, kann auch sein, dass
//  nur ein paar gerade zu sehen sind“. Statt eines einzigen Huhns aus
//  CSS (1.125.0 bis 1.126.1) lebt hier ein kleiner Hof: 20 Hühner, die
//  jedes für sich irgendwann hereinkommen, ein paar Dinge tun (gehen,
//  rennen, stehen, umdrehen, picken, Ei legen) und wieder gehen. So sind
//  meistens nur wenige gleichzeitig da. Wer rennt, verliert Federn, die
//  langsam zu Boden schweben. Eier bleiben liegen und verblassen.
//  Alles in der Lichtfarbe, schwach und ohne harte Kante (Masken in
//  stil.css). Gesteuert mit Zeitgebern und el.animate statt React-
//  Zustand, damit die Startseite dafür nie neu zeichnet.
// =================================================================
import { useEffect, useRef } from "react";

const MAX = 20;           // so viele Hühner gibt es auf dem Hof
const SICHTBAR_MAX = 6;   // mehr stehen nie gleichzeitig im Band

const zufall = (a, b) => a + Math.random() * (b - a);
const ganz = (a, b) => Math.floor(zufall(a, b + 1));

export default function Huehner() {
  const ref = useRef(null);
  useEffect(() => {
    const hof = ref.current;
    if (!hof) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let aus = false;
    let sichtbar = 0;
    const uhren = new Set();
    const warte = (ms) => new Promise((ok) => {
      const t = setTimeout(() => { uhren.delete(t); ok(); }, ms);
      uhren.add(t);
    });
    // Im versteckten Tab laufen keine Hühner los
    const wach = async () => { while (!aus && document.hidden) await warte(1000); };

    const ei = (x) => {
      const e = document.createElement("div");
      e.className = "huhn-ei";
      e.style.left = x - 19 + "px";
      hof.appendChild(e);
      const a = e.animate([
        { opacity: 0, transform: "scale(.2)" },
        { opacity: .45, transform: "scale(1.2)", offset: .03 },
        { opacity: .4, transform: "scale(1)", offset: .06 },
        { opacity: 0, transform: "scale(1)" },
      ], { duration: zufall(16000, 22000), easing: "linear", fill: "forwards" });
      a.onfinish = () => e.remove();
    };

    const feder = (x, y) => {
      const f = document.createElement("div");
      f.className = "huhn-feder";
      const g = zufall(14, 26);
      f.style.width = g * .4 + "px";
      f.style.height = g + "px";
      f.style.left = x + "px";
      f.style.bottom = y + "px";
      hof.appendChild(f);
      const dx = zufall(-60, 60), fall = y + zufall(0, 10), dr = zufall(-200, 200);
      const a = f.animate([
        { opacity: 0, transform: "translate(0,0) rotate(0deg)" },
        { opacity: .6, transform: `translate(${dx * .2}px,${-zufall(10, 30)}px) rotate(${dr * .2}deg)`, offset: .15 },
        { opacity: .5, transform: `translate(${dx * .6}px,${fall * .5}px) rotate(${dr * .6}deg)`, offset: .55 },
        { opacity: 0, transform: `translate(${dx}px,${fall}px) rotate(${dr}deg)` },
      ], { duration: zufall(3000, 5000), easing: "ease-out", fill: "forwards" });
      a.onfinish = () => f.remove();
    };

    // Ein Auftritt: hereinkommen, 2 bis 6 Dinge tun, hinausgehen
    const auftritt = async () => {
      const breit = hof.clientWidth, hoch = hof.clientHeight;
      if (!breit || !hoch) return;
      const gross = Math.random();
      const h = Math.min(hoch, 280) * (.6 + gross * .4);
      const w = h * 124 / 114;
      const huhn = document.createElement("div");
      huhn.className = "huhn";
      huhn.style.width = w + "px";
      huhn.style.height = h + "px";
      huhn.style.opacity = (.35 + gross * .25).toFixed(2);
      huhn.style.zIndex = String(Math.round(gross * 10));
      const dreh = document.createElement("div");
      dreh.className = "huhn__dreh";
      const koerper = document.createElement("div");
      koerper.className = "huhn__koerper";
      dreh.appendChild(koerper);
      huhn.appendChild(dreh);
      hof.appendChild(huhn);

      let rechts = Math.random() < .5;          // Blickrichtung
      let x = rechts ? -w : breit;              // linke Kante des Huhns
      const setzen = () => { huhn.style.transform = `translateX(${x}px)`; };
      const schauen = (r) => { rechts = r; dreh.style.transform = r ? "scaleX(1)" : "scaleX(-1)"; };
      schauen(rechts);
      setzen();

      const gehen = async (ziel, tempo, rennt) => {
        if (ziel !== x) schauen(ziel > x);
        await warte(120);
        const dauer = Math.abs(ziel - x) / tempo * 1000;
        if (rennt) koerper.classList.add("huhn__koerper--rennt");
        let federUhr = null;
        if (rennt) {
          const los = () => {
            if (aus) return;
            const r = huhn.getBoundingClientRect(), hr = hof.getBoundingClientRect();
            feder(r.left - hr.left + w * (rechts ? .25 : .75), h * zufall(.3, .6));
            federUhr = setTimeout(los, zufall(250, 700));
          };
          federUhr = setTimeout(los, zufall(100, 400));
        }
        const a = huhn.animate([{ transform: `translateX(${x}px)` }, { transform: `translateX(${ziel}px)` }],
          { duration: dauer, easing: rennt ? "ease-in-out" : "linear", fill: "forwards" });
        await warte(dauer);
        clearTimeout(federUhr);
        x = ziel;
        setzen();
        a.cancel();
        koerper.classList.remove("huhn__koerper--rennt");
      };
      const picken = async () => {
        for (let i = ganz(1, 3); i > 0 && !aus; i--) {
          koerper.classList.add("huhn__koerper--pickt");
          await warte(260);
          koerper.classList.remove("huhn__koerper--pickt");
          await warte(zufall(220, 500));
        }
      };
      const legen = async () => {
        await warte(zufall(600, 1400));
        ei(x + w * (rechts ? .12 : .88));
        await warte(zufall(800, 1600));
      };

      // Erst ein Stück hinein
      await gehen(zufall(breit * .05, breit * .8), zufall(35, 60), false);
      for (let n = ganz(2, 6); n > 0 && !aus; n--) {
        const wahl = Math.random();
        if (wahl < .3) await gehen(zufall(0, breit - w * .6), zufall(35, 60), false);
        else if (wahl < .5) await gehen(zufall(0, breit - w * .6), zufall(140, 220), true);
        else if (wahl < .62) await warte(zufall(800, 3000));
        else if (wahl < .74) { schauen(!rechts); await warte(zufall(500, 1200)); schauen(!rechts); await warte(zufall(300, 900)); }
        else if (wahl < .88) await picken();
        else await legen();
      }
      // Hinaus zur näheren Seite, meistens rennend
      const raus = x + w / 2 < breit / 2 ? -w - 10 : breit + 10;
      const rennt = Math.random() < .6;
      await gehen(raus, rennt ? zufall(140, 220) : zufall(40, 60), rennt);
      huhn.remove();
    };

    // Jedes Huhn lebt für sich: warten, auftreten, wieder warten
    const leben = async (i) => {
      // Das erste kommt gleich, die anderen nach und nach
      await warte(i === 0 ? zufall(300, 1500) : zufall(2000, 60000));
      while (!aus) {
        await wach();
        if (aus) return;
        if (sichtbar < SICHTBAR_MAX) {
          sichtbar++;
          try { await auftritt(); } finally { sichtbar--; }
        }
        await warte(zufall(30000, 150000));
      }
    };
    for (let i = 0; i < MAX; i++) leben(i);

    return () => {
      aus = true;
      uhren.forEach(clearTimeout);
      uhren.clear();
      hof.replaceChildren();
    };
  }, []);
  return <div className="huehner" ref={ref} aria-hidden="true" />;
}
