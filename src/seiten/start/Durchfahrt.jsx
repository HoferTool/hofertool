// =================================================================
//  HÜHNER IM BAND OBEN, JE JAHRESZEIT
//  Wunsch Patrick 16. November 2026: „fertig lustig, es soll wieder
//  da kommen wie ganz am Anfang mit Hühnern, die herumlaufen und Eier
//  legen und Federn verlieren, so weisslich, und je nach Jahreszeit
//  sollen Schneeflocken oder Blätter herunterfallen, im Sommer ein
//  Wasserball immer wieder und so kleine Blümchen, die von unten
//  kommen und dann wieder weg sind“.
//
//  Die Hühner sind die aus 1.130.x (start/Huehner.jsx im Git-Verlauf):
//  ein kleiner Hof mit bis zu 20 Hühnern, die jedes für sich irgendwann
//  hereinkommen, ein paar Dinge tun (gehen, rennen, stehen, umdrehen,
//  picken, Ei legen) und wieder gehen, meistens nur wenige zugleich.
//  Wer rennt, verliert Federn. Neu nur: weisslich statt in der
//  Lichtfarbe, und dazu je Jahreszeit (`jahreszeit`):
//    Winter (15. Oktober bis Ende März, wie seit 1.212.0, Patrick:
//      „es ist aber Winter“): Schneeflocken
//    Herbst (September bis 14. Oktober): fallende Blätter
//    Frühling (April, Mai): fallende Blüten und ab und zu ein Blümchen
//    Sommer (Juni bis August): Blümchen wachsen von unten und gehen
//      wieder, und immer wieder hüpft ein Wasserball durch
//  Alles mit Zeitgebern und el.animate statt React-Zustand, damit die
//  Startseite dafür nie neu zeichnet. Läuft im Band der Startseite und
//  im Kopf des Infoboards (`tief`, dort vor Kopf und Solaranlage).
// =================================================================
import { useEffect, useRef } from "react";

const MAX = 20;           // so viele Hühner gibt es auf dem Hof
const SICHTBAR_MAX = 6;   // mehr stehen nie gleichzeitig im Band

const zufall = (a, b) => a + Math.random() * (b - a);
const ganz = (a, b) => Math.floor(zufall(a, b + 1));
const wahl = (liste) => liste[Math.floor(Math.random() * liste.length)];

// Welche Jahreszeit? Im Prüfstand mit TEST.jahreszeit festzulegen.
export function jahreszeit(d = new Date()) {
  const test = typeof window !== "undefined" && window.TEST && window.TEST.jahreszeit;
  if (test) return test;
  const x = (d.getMonth() + 1) * 100 + d.getDate();
  if (x >= 1015 || x <= 331) return "winter";
  if (x >= 901) return "herbst";
  if (x <= 531) return "fruehling";
  return "sommer";
}
// Für alte Aufrufer: Schnee liegt im Winter
export const schneeZeit = (d = new Date()) => jahreszeit(d) === "winter";

const svg = (inhalt, vb) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%">${inhalt}</svg>`;

// Blatt in Herbstfarben
const BLATT_FARBEN = ["#e07a1f", "#c8471d", "#e8a93a", "#a8521d", "#d9622b", "#b8862f"];
const blattSvg = (f) => svg(
  `<path d="M20 2 C31 9 36 20 32 30 C29 37 24 40 20 46 C16 40 11 37 8 30 C4 20 9 9 20 2 Z" fill="${f}"/>` +
  `<path d="M20 6 L20 48 M20 18 L13 13 M20 18 L27 13 M20 28 L11 22 M20 28 L29 22" stroke="rgba(80,40,10,.45)" stroke-width="1.4" fill="none"/>`,
  "0 0 40 50");
// Blüte für den Frühling
const BLUETE_FARBEN = ["#ffd1dc", "#ffffff", "#ffc2d6", "#fde2ee"];
const blueteSvg = (f) => svg(
  [0, 72, 144, 216, 288].map((w) => `<ellipse cx="20" cy="10" rx="6.5" ry="9" fill="${f}" transform="rotate(${w} 20 20)"/>`).join("") +
  `<circle cx="20" cy="20" r="4" fill="#f6c64a"/>`, "0 0 40 40");
// Blümchen mit Stiel, wächst von unten
const BLUMEN = [["#ffd23f", "#ff7a00"], ["#ffffff", "#f6c64a"], ["#ff6fa3", "#ffe066"], ["#7fb8ff", "#ffffff"], ["#ff5a5f", "#ffd23f"], ["#c99bff", "#fff2a8"]];
const blumeSvg = ([blatt, mitte]) => svg(
  `<path d="M20 30 C19 42 21 50 20 60" stroke="#3f8f2e" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
  `<path d="M20 47 C13 44 9 46 7 49 C12 51 16 50 20 47 Z" fill="#4fa83a"/>` +
  `<path d="M20 41 C27 38 31 40 33 43 C28 45 24 44 20 41 Z" fill="#4fa83a"/>` +
  [0, 60, 120, 180, 240, 300].map((w) => `<ellipse cx="20" cy="12" rx="5" ry="8" fill="${blatt}" transform="rotate(${w} 20 20)"/>`).join("") +
  `<circle cx="20" cy="20" r="5" fill="${mitte}"/>`, "0 0 40 60");
// Wasserball mit Streifen, die Streifen drehen sich, der Glanz bleibt oben
const BALL_STREIFEN = ["#e63946", "#ffffff", "#ffd23f", "#ffffff", "#2a7de1", "#ffffff"];
const ballSvg = () => svg(
  `<g class="hof-ball__dreh">` +
  BALL_STREIFEN.map((f, i) => {
    const a = (i * 60 - 90) * Math.PI / 180, b = ((i + 1) * 60 - 90) * Math.PI / 180;
    return `<path d="M50 50 L${50 + 48 * Math.cos(a)} ${50 + 48 * Math.sin(a)} A48 48 0 0 1 ${50 + 48 * Math.cos(b)} ${50 + 48 * Math.sin(b)} Z" fill="${f}"/>`;
  }).join("") +
  `<circle cx="50" cy="50" r="9" fill="#ffffff" stroke="#d0d6de" stroke-width="1.5"/></g>` +
  `<circle cx="50" cy="50" r="48" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="2"/>` +
  `<ellipse cx="35" cy="28" rx="14" ry="8" fill="rgba(255,255,255,.55)" transform="rotate(-30 35 28)"/>`,
  "0 0 100 100");

export default function Durchfahrt({ tief = false } = {}) {
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
    // Im versteckten Tab läuft nichts los
    const wach = async () => { while (!aus && document.hidden) await warte(1000); };
    // Im Infoboard ist alles grösser zu sehen
    const mass = tief ? 1.8 : 1;

    const ei = (x, boden) => {
      const e = document.createElement("div");
      e.className = "huhn-ei";
      e.style.left = x - 19 + "px";
      hof.appendChild(e);
      // Das Ei kommt am Schwanz heraus, fällt auf den Boden, hüpft kurz
      // und bleibt dort liegen, bis es verblasst ist
      const dauer = zufall(16000, 22000), t = (ms) => Math.min(.5, ms / dauer);
      const hoch = `translateY(${-boden}px)`;
      const a = e.animate([
        { opacity: 0, transform: `${hoch} scale(.2)` },
        { opacity: .7, transform: `${hoch} scale(1.2)`, offset: t(300) },
        { opacity: .7, transform: `${hoch} scale(1)`, offset: t(500) },
        { opacity: .7, transform: "translateY(0) scale(1.1,.9)", offset: t(500 + Math.sqrt(boden) * 45), easing: "ease-out" },
        { opacity: .68, transform: `translateY(${-Math.min(14, boden * .2)}px) scale(1)`, offset: t(650 + Math.sqrt(boden) * 45), easing: "ease-in" },
        { opacity: .65, transform: "translateY(0) scale(1)", offset: t(800 + Math.sqrt(boden) * 45) },
        { opacity: 0, transform: "translateY(0) scale(1)" },
      ], { duration: dauer, easing: "ease-in", fill: "forwards" });
      a.onfinish = () => e.remove();
    };

    // Schwebt hin und her bis auf den Boden, bleibt kurz flach liegen und verblasst
    const feder = (x, y) => {
      const f = document.createElement("div");
      f.className = "huhn-feder";
      const g = zufall(14, 26) * (tief ? 1.4 : 1);
      f.style.width = g * .4 + "px";
      f.style.height = g + "px";
      f.style.left = x + "px";
      f.style.bottom = y + "px";
      hof.appendChild(f);
      const dx = zufall(-60, 60), fall = y + g * .3 - 1;
      const liegt = (Math.random() < .5 ? 90 : -90) + zufall(-12, 12);
      const a = f.animate([
        { opacity: 0, transform: "translate(0,0) rotate(0deg)" },
        { opacity: .8, transform: `translate(${dx * .2}px,${-zufall(10, 30)}px) rotate(${zufall(-40, 40)}deg)`, offset: .12 },
        { opacity: .75, transform: `translate(${dx * .6}px,${fall * .45}px) rotate(${liegt * .4 + zufall(-50, 50)}deg)`, offset: .4 },
        { opacity: .7, transform: `translate(${dx}px,${fall}px) rotate(${liegt}deg)`, offset: .65 },
        { opacity: .6, transform: `translate(${dx}px,${fall}px) rotate(${liegt}deg)`, offset: .82 },
        { opacity: 0, transform: `translate(${dx}px,${fall}px) rotate(${liegt}deg)` },
      ], { duration: zufall(5000, 8000), easing: "ease-in-out", fill: "forwards" });
      a.onfinish = () => f.remove();
    };

    // Ein Auftritt: hereinkommen, 2 bis 6 Dinge tun, hinausgehen
    const auftritt = async () => {
      const breit = hof.clientWidth, hoch = hof.clientHeight;
      if (!breit || !hoch) return;
      const gross = Math.random();
      // Verschieden gross und auf verschiedener Höhe, nie abgeschnitten.
      // Im Infoboard bleiben sie unten, damit die Solaranlage lesbar bleibt.
      const h = tief ? Math.min(hoch * .5, 220) * (.55 + gross * .45) : Math.min(hoch, 280) * (.45 + gross * .45);
      const w = h * 124 / 114;
      const boden = tief ? zufall(0, Math.min(24, hoch * .05)) : zufall(0, Math.max(0, hoch - h - 6));
      const huhn = document.createElement("div");
      huhn.className = "huhn";
      huhn.style.width = w + "px";
      huhn.style.height = h + "px";
      huhn.style.bottom = boden + "px";
      huhn.style.opacity = (.45 + gross * .3).toFixed(2);
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
      const federn = (n) => {
        const r = huhn.getBoundingClientRect(), hr = hof.getBoundingClientRect();
        for (let i = 0; i < n; i++)
          feder(r.left - hr.left + w * zufall(.2, .8), boden + h * zufall(.25, .65));
      };

      const gehen = async (ziel, tempo, rennt) => {
        tempo *= mass;
        if (ziel !== x) schauen(ziel > x);
        await warte(120);
        const dauer = Math.abs(ziel - x) / tempo * 1000;
        if (rennt) koerper.classList.add("huhn__koerper--rennt");
        let federUhr = null;
        // Rennend dauernd Federn, gehend ab und zu eine
        const los = () => {
          if (aus) return;
          federn(rennt ? ganz(1, 3) : 1);
          federUhr = setTimeout(los, rennt ? zufall(120, 350) : zufall(1200, 3500));
        };
        federUhr = setTimeout(los, rennt ? zufall(80, 250) : zufall(600, 2500));
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
          if (Math.random() < .4) federn(1);
          await warte(260);
          koerper.classList.remove("huhn__koerper--pickt");
          await warte(zufall(220, 500));
        }
      };
      const legen = async () => {
        await warte(zufall(600, 1400));
        ei(x + w * (rechts ? .12 : .88), boden);
        federn(ganz(2, 4));
        await warte(zufall(800, 1600));
      };

      await gehen(zufall(breit * .05, breit * .8), zufall(35, 60), false);
      for (let n = ganz(2, 6); n > 0 && !aus; n--) {
        const w8 = Math.random();
        if (w8 < .3) await gehen(zufall(0, breit - w * .6), zufall(35, 60), false);
        else if (w8 < .5) await gehen(zufall(0, breit - w * .6), zufall(140, 220), true);
        else if (w8 < .62) await warte(zufall(800, 3000));
        else if (w8 < .74) { federn(ganz(1, 2)); schauen(!rechts); await warte(zufall(500, 1200)); schauen(!rechts); await warte(zufall(300, 900)); }
        else if (w8 < .88) await picken();
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
      // Die ersten zwei kommen gleich, die anderen nach und nach
      await warte(i < 2 ? zufall(300, 2500) : zufall(2000, 60000));
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

    // ---------- Was von oben fällt: Schnee, Blätter, Blüten ----------
    const fallen = (art) => {
      const breit = hof.clientWidth, hoch = hof.clientHeight;
      if (!breit || !hoch) return;
      const t = document.createElement("div");
      t.className = "hof-fall hof-fall--" + art;
      let g;
      if (art === "schnee") g = zufall(3, 8) * mass;
      else if (art === "blatt") { g = zufall(14, 24) * mass; t.innerHTML = blattSvg(wahl(BLATT_FARBEN)); }
      else { g = zufall(9, 15) * mass; t.innerHTML = blueteSvg(wahl(BLUETE_FARBEN)); }
      t.style.width = g + "px";
      t.style.height = (art === "blatt" ? g * 1.25 : g) + "px";
      const x0 = zufall(-20, breit + 20);
      t.style.left = x0 + "px";
      hof.appendChild(t);
      const tiefe = hoch + g * 2;
      const schwung = art === "schnee" ? zufall(10, 30) : zufall(25, 70);
      const wind = zufall(-40, 40);
      const drehen = art === "schnee" ? 0 : zufall(-540, 540);
      const dauer = (art === "schnee" ? zufall(5000, 9000) : zufall(6000, 11000)) * Math.max(.6, hoch / 160) ** .5;
      const bilder = [];
      for (let i = 0; i <= 6; i++) {
        const p = i / 6;
        bilder.push({
          transform: `translate(${wind * p + Math.sin(p * Math.PI * 3) * schwung}px, ${tiefe * p}px) rotate(${drehen * p}deg)` +
            (art === "blatt" ? ` rotateX(${Math.sin(p * Math.PI * 4) * 60}deg)` : ""),
          opacity: i === 0 ? 0 : i === 6 ? 0 : art === "schnee" ? .9 : .95,
        });
      }
      const a = t.animate(bilder, { duration: dauer, easing: "linear", fill: "forwards" });
      a.onfinish = () => t.remove();
    };

    // ---------- Blümchen wachsen von unten und gehen wieder ----------
    let blumen = 0;
    const bluemchen = () => {
      const breit = hof.clientWidth;
      if (!breit || blumen >= (tief ? 10 : 7)) return;
      blumen++;
      const b = document.createElement("div");
      b.className = "hof-blume";
      const g = zufall(18, 30) * mass;
      b.style.width = g + "px";
      b.style.height = g * 1.5 + "px";
      b.style.left = zufall(0, breit - g) + "px";
      b.innerHTML = blumeSvg(wahl(BLUMEN));
      hof.appendChild(b);
      const stehen = zufall(3000, 7000), auf = 900, ab = 800, d = auf + stehen + ab;
      const neig = zufall(4, 9);
      const a = b.animate([
        { transform: "translateY(100%) scale(.4) rotate(0deg)", opacity: 0 },
        { transform: "translateY(-4%) scale(1.08) rotate(0deg)", opacity: 1, offset: auf * .75 / d, easing: "ease-out" },
        { transform: `translateY(0) scale(1) rotate(${-neig}deg)`, opacity: 1, offset: auf / d },
        { transform: `translateY(0) scale(1) rotate(${neig}deg)`, opacity: 1, offset: (auf + stehen * .5) / d },
        { transform: `translateY(0) scale(1) rotate(${-neig * .6}deg)`, opacity: 1, offset: (auf + stehen) / d, easing: "ease-in" },
        { transform: "translateY(100%) scale(.5) rotate(0deg)", opacity: 0 },
      ], { duration: d, easing: "ease-in-out", fill: "forwards" });
      a.onfinish = () => { b.remove(); blumen--; };
    };

    // ---------- Der Wasserball hüpft durchs Band ----------
    const wasserball = async () => {
      const breit = hof.clientWidth, hoch = hof.clientHeight;
      if (!breit || !hoch) return;
      const g = Math.max(26, Math.min(tief ? 110 : 64, hoch * (tief ? .22 : .38)));
      const ball = document.createElement("div");
      ball.className = "hof-ball";
      ball.style.width = ball.style.height = g + "px";
      ball.innerHTML = ballSvg();
      hof.appendChild(ball);
      const rechts = Math.random() < .5;
      const von = rechts ? -g - 10 : breit + 10, bis = rechts ? breit + 10 : -g - 10;
      const spruenge = Math.max(3, Math.round(breit / zufall(160, 280) / (tief ? 1.4 : 1)));
      const sprungHoch = Math.min(hoch - g - 4, zufall(.45, .85) * (hoch - g)), dauer = spruenge * zufall(900, 1300);
      const bilder = [];
      // Jeder Sprung ein Bogen, unten kurz platt gedrückt
      for (let i = 0; i <= spruenge * 8; i++) {
        const p = i / (spruenge * 8), s = (i % 8) / 8;
        const hNow = sprungHoch * Math.pow(.88, Math.floor(i / 8)) * 4 * s * (1 - s);
        const platt = i % 8 === 0;
        bilder.push({
          transform: `translate(${von + (bis - von) * p}px, ${-hNow}px) scale(${platt ? 1.12 : 1}, ${platt ? .86 : 1})`,
        });
      }
      const a = ball.animate(bilder, { duration: dauer, easing: "linear", fill: "forwards" });
      const dreh = ball.querySelector(".hof-ball__dreh");
      const d = dreh && dreh.animate([{ transform: "rotate(0deg)" }, { transform: `rotate(${rechts ? 1 : -1}turn)` }],
        { duration: zufall(1200, 1800), iterations: Infinity });
      await warte(dauer);
      if (d) d.cancel();
      a.cancel();
      ball.remove();
    };

    // Die Jahreszeit fragt jede Runde neu, so wechselt sie von selbst
    const himmel = async () => {
      await warte(400);
      while (!aus) {
        await wach();
        if (aus) return;
        const zeit = jahreszeit();
        hof.dataset.jahreszeit = zeit;
        const breit = hof.clientWidth || 1000, dicht = Math.max(.4, Math.min(2.5, breit / 1000));
        if (zeit === "winter") { fallen("schnee"); await warte(zufall(160, 380) / dicht); }
        else if (zeit === "herbst") { fallen("blatt"); await warte(zufall(700, 1600) / dicht); }
        else if (zeit === "fruehling") { fallen("bluete"); await warte(zufall(900, 2000) / dicht); }
        else await warte(2000);
      }
    };
    const garten = async () => {
      await warte(zufall(500, 1500));
      while (!aus) {
        await wach();
        if (aus) return;
        const zeit = jahreszeit();
        if (zeit === "sommer") { bluemchen(); await warte(zufall(900, 2600)); }
        else if (zeit === "fruehling") { if (Math.random() < .35) bluemchen(); await warte(zufall(2500, 5000)); }
        else await warte(5000);
      }
    };
    const strand = async () => {
      await warte(zufall(1500, 4000));
      while (!aus) {
        await wach();
        if (aus) return;
        if (jahreszeit() === "sommer") { await wasserball(); await warte(zufall(6000, 16000)); }
        else await warte(10000);
      }
    };
    himmel();
    garten();
    strand();

    return () => {
      aus = true;
      uhren.forEach(clearTimeout);
      uhren.clear();
      hof.replaceChildren();
    };
  }, [tief]);
  return <div className={"durchfahrt" + (tief ? " durchfahrt--tief" : "")} ref={ref} aria-hidden="true" />;
}
