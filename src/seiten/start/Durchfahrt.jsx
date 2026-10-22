// =================================================================
//  JETSKI IM BAND OBEN
//  Geschichte (alles Wunsch Patrick, 22. Oktober 2026): 1.130.0 bis
//  1.149.0 liefen hier Hühner, 1.150.0 abwechselnd ein Ferrari und
//  Super Mario mit Lasagne, 1.151.0 ein gezeichneter Jetski statt Mario,
//  1.151.1 Jiviano Ferrari auf seinem Jetski als Foto, 1.152.0 mit
//  Wasser im ganzen Band, Sprüngen und Sprechblase.
//  Seit 1.153.0 („kein Auto mehr, die Animation etwas realer, sieht so
//  komisch aus, Sprechblase weg“): nur noch Jiviano. Unten liegt immer
//  Wasser mit zwei Wellenschichten, und der Jetski fährt genau auf der
//  vorderen Welle: Höhe und Neigung rechnet jedes Bild aus der Wasser-
//  oberfläche unter Bug und Heck, mit etwas Trägheit. Wasser (seit
//  1.153.0, „die Wassereffekte vom Jetski besser“): Schaum am Rumpf,
//  Heckfontäne aus Tropfen und Nebel, Bugspritzer beim Eintauchen und
//  Kielwasser, das liegen bleibt und breit ausläuft. Das Foto steht nur
//  in der Datenbank (app_config „durchfahrt_bild“ als data:-Bild), nie
//  im öffentlichen Repository; fehlt es, gibt es nur die Wellen.
// =================================================================
import { useEffect, useRef } from "react";
import { alt } from "../../bruecke.jsx";

const zufall = (a, b) => a + Math.random() * (b - a);

// Das Foto aus der Datenbank, einmal je Seite
let fotoLaden = null;
const jetskiFoto = () => {
  if (!fotoLaden) {
    fotoLaden = (async () => {
      const r = await alt.db.from("app_config").select("wert").eq("schluessel", "durchfahrt_bild").maybeSingle();
      const url = r && r.data && r.data.wert;
      if (!url) return null;
      // Erst fahren lassen, wenn das Bild wirklich geht
      await new Promise((ok, nein) => { const i = new Image(); i.onload = ok; i.onerror = nein; i.src = url; });
      return url;
    })().catch(() => null);
  }
  return fotoLaden;
};

// Eine Wellenschicht als Sinus mit genauen Massen in Punkten, damit
// die Oberfläche an jeder Stelle rechenbar ist: Mitte c, Höhe A,
// Wellenlänge l, Schicht h hoch. Das Bild wiederholt sich alle l Punkte.
const welleBild = ({ l, h, c, A }, oben, unten, schaum) => {
  let d = `M0 ${c}`;
  for (let i = 1; i <= 48; i++) {
    const x = l * i / 48;
    d += ` L${x.toFixed(1)} ${(c - A * Math.sin(2 * Math.PI * x / l)).toFixed(2)}`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${l}' height='${h}' viewBox='0 0 ${l} ${h}'>` +
    `<defs><linearGradient id='g' x1='0' x2='0' y1='0' y2='1'><stop offset='0' stop-color='${oben}'/>` +
    `<stop offset='1' stop-color='${unten}'/></linearGradient></defs>` +
    `<path d='${d} V${h} H0 Z' fill='url(#g)'/>` +
    `<path d='${d}' fill='none' stroke='${schaum}' stroke-width='1.6'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

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

    // Wasser: zwei Schichten, hinten lang und ruhig, vorne kürzer. Beide
    // laufen langsam nach rechts, der Jetski fährt dagegen.
    const meer = document.createElement("div");
    meer.className = "fahrt-meer";
    band.appendChild(meer);
    let schichten = [];
    const meerBauen = () => {
      const hoch = band.clientHeight || 120;
      meer.replaceChildren();
      schichten.forEach((s) => s.anim.cancel());
      schichten = [
        { art: "hinten", l: Math.round(hoch * 3.2), h: Math.round(hoch * .3), A: hoch * .035, dauer: 9000,
          farben: ["rgba(120,185,240,.55)", "rgba(40,110,200,.55)", "rgba(255,255,255,.25)"] },
        { art: "vorne", l: Math.round(hoch * 2.3), h: Math.round(hoch * .2), A: hoch * .045, dauer: 6000,
          farben: ["rgba(80,160,230,.85)", "rgba(20,80,170,.95)", "rgba(255,255,255,.55)"] },
      ].map((s) => {
        s.c = s.A + 2;
        const el = document.createElement("div");
        el.className = "fahrt-meer__welle fahrt-meer__welle--" + s.art;
        el.style.height = s.h + "px";
        el.style.width = `calc(100% + ${s.l}px)`;
        el.style.left = -s.l + "px";
        el.style.backgroundSize = `${s.l}px ${s.h}px`;
        el.style.backgroundImage = welleBild(s, ...s.farben);
        meer.appendChild(el);
        s.anim = el.animate([{ transform: "translateX(0)" }, { transform: `translateX(${s.l}px)` }],
          { duration: s.dauer, iterations: Infinity });
        return s;
      });
    };
    meerBauen();
    // Ändert sich die Höhe des Bands, passen die Wellen sich an
    let hoeheVorher = band.clientHeight;
    const wo = new ResizeObserver(() => {
      if (band.clientHeight !== hoeheVorher) { hoeheVorher = band.clientHeight; meerBauen(); }
    });
    wo.observe(band);

    // Höhe der vorderen Wasseroberfläche über dem Bandboden an Stelle x
    const oberflaeche = (x) => {
      const s = schichten[1];
      const t = s.anim.currentTime || 0;
      const versatz = -s.l + s.l * ((t % s.dauer) / s.dauer);
      const u = x - versatz;
      return s.h - (s.c - s.A * Math.sin(2 * Math.PI * u / s.l));
    };

    // Gischt-Tropfen im Wurfbogen, fallen zurück ins Wasser
    const tropfen = (x, y, vx, vy, g, dauer = zufall(450, 800)) => {
      const t = document.createElement("div");
      t.className = "fahrt-tropfen";
      t.style.left = x + "px";
      t.style.bottom = y + "px";
      t.style.width = t.style.height = g + "px";
      band.appendChild(t);
      const frames = [];
      for (let k = 0; k <= 6; k++) {
        const s = k / 6 * dauer / 1000;
        frames.push({ transform: `translate(${(vx * s).toFixed(1)}px,${(-(vy * s - 320 * s * s)).toFixed(1)}px)`,
          opacity: k === 6 ? 0 : .9 - k * .08 });
      }
      const a = t.animate(frames, { duration: dauer, fill: "forwards" });
      a.onfinish = () => t.remove();
    };
    // Sprühnebel: weiche Wolke, die nach hinten weht, aufgeht und vergeht
    const nebel = (x, y, g, vx, vy) => {
      const n = document.createElement("div");
      n.className = "fahrt-nebel";
      n.style.left = x - g / 2 + "px";
      n.style.bottom = y - g / 2 + "px";
      n.style.width = n.style.height = g + "px";
      band.appendChild(n);
      const a = n.animate([
        { transform: "translate(0,0) scale(.35)", opacity: .75 },
        { transform: `translate(${vx * .5}px,${-vy * .5}px) scale(1.2)`, opacity: .45, offset: .45 },
        { transform: `translate(${vx}px,${-vy * .6}px) scale(2)`, opacity: 0 },
      ], { duration: zufall(700, 1100), easing: "ease-out", fill: "forwards" });
      a.onfinish = () => n.remove();
    };
    // Schaumspur: bleibt auf dem Wasser liegen, läuft breit und vergeht
    const schaum = (x, y, b) => {
      const f = document.createElement("div");
      f.className = "fahrt-schaum";
      f.style.left = x + "px";
      f.style.bottom = y + "px";
      f.style.width = b + "px";
      f.style.height = Math.max(3, b * .14) + "px";
      band.appendChild(f);
      const a = f.animate([{ opacity: .8, transform: "scale(.5,1)" }, { opacity: .35, transform: "scale(1.3,1.4)", offset: .4 },
        { opacity: 0, transform: "scale(1.9,1.8)" }],
        { duration: zufall(2000, 2800), easing: "ease-out", fill: "forwards" });
      a.onfinish = () => f.remove();
    };

    const fahren = async () => {
      const breit = band.clientWidth, hoch = band.clientHeight;
      if (!breit || !hoch) return;
      const foto = await jetskiFoto();
      if (aus || !foto) return;
      const h = Math.max(36, Math.min(130, hoch * .58));
      const w = h * 300 / 204;
      const el = document.createElement("div");
      el.className = "fahrt fahrt--foto";
      el.style.width = w + "px";
      el.style.height = h + "px";
      const reiter = document.createElement("div");
      reiter.className = "fahrt__reiter";
      const bild = document.createElement("img");
      bild.alt = "";
      bild.src = foto;
      reiter.appendChild(bild);
      el.appendChild(reiter);
      band.appendChild(el);
      // Mit der Spitze voran nach links, gleichmässig wie auf dem Wasser
      const von = breit + 20, bis = -w - 20;
      const dauer = zufall(7000, 9000) * Math.max(1, breit / 1400);
      const start = performance.now();
      // Bug und Heck im Foto (Anteil der Breite), Eintauchtiefe des Rumpfs
      const bug = .1, heck = .88, tief = h * .1;
      let y = null, dreh = 0, gischtNaechste = 0, nebelNaechste = 0, bugNaechste = 0, schaumNaechste = 0, bild2 = 0;
      const kontakt = document.createElement("div");
      kontakt.className = "fahrt-kontakt";
      kontakt.style.height = h * .14 + "px";
      band.appendChild(kontakt);
      await new Promise((fertig) => {
        const schritt = (jetzt) => {
          if (aus) return fertig();
          const p = Math.min(1, (jetzt - start) / dauer);
          const x = von + (bis - von) * p;
          const yb = oberflaeche(x + w * bug), yh = oberflaeche(x + w * heck);
          const ziel = (yb + yh) / 2 - tief;
          // Neigung aus der Oberfläche: steigt das Wasser am Bug, hebt
          // sich die Spitze; leicht verzögert, damit er Gewicht hat
          const zielDreh = Math.atan2(yb - yh, w * (heck - bug)) * 180 / Math.PI;
          y = y === null ? ziel : y + (ziel - y) * .18;
          dreh += (zielDreh - dreh) * .12;
          // Leichtes Zittern vom Motor
          const zittern = Math.sin(jetzt / 45) * .6;
          el.style.transform = `translate(${x.toFixed(1)}px, ${(-(y + zittern)).toFixed(1)}px)`;
          reiter.style.transform = `rotate(${dreh.toFixed(2)}deg)`;
          const sichtbar = x < breit + 10 && x + w > -10;
          // Weisser Schaum, wo der Rumpf das Wasser berührt
          const kx = x + w * .12, kb = w * .8;
          kontakt.style.transform = `translate(${kx.toFixed(1)}px, ${(-((yb + yh) / 2 - h * .07)).toFixed(1)}px)`;
          kontakt.style.width = kb + "px";
          kontakt.style.opacity = (.7 + Math.sin(jetzt / 70) * .15).toFixed(2);
          // Heckfontäne: der Wasserstrahl der Düse wirft einen Bogen aus
          // Tropfen und Nebel nach hinten oben
          if (sichtbar && jetzt > gischtNaechste) {
            const hx = x + w * heck, hy = yh - 1;
            for (let i = 0; i < 5; i++)
              tropfen(hx + zufall(-4, 8), hy + zufall(-2, 3), zufall(40, 230), zufall(70, 230), zufall(1.2, 3.6), zufall(500, 1000));
            gischtNaechste = jetzt + zufall(25, 45);
          }
          if (sichtbar && jetzt > nebelNaechste) {
            nebel(x + w * (heck + .04), yh + h * .08, h * zufall(.3, .45), zufall(70, 140), zufall(35, 70));
            nebelNaechste = jetzt + zufall(60, 110);
          }
          // Bugwelle: taucht die Spitze ins Wasser, spritzt es vorne
          if (sichtbar && jetzt > bugNaechste) {
            const n = zielDreh < -1.5 ? 6 : 2;
            for (let i = 0; i < n; i++)
              tropfen(x + w * (bug + zufall(.02, .12)), yb, zufall(-50, 30), zufall(50, zielDreh < -1.5 ? 170 : 90), zufall(1.5, 3));
            if (zielDreh < -1.5) nebel(x + w * (bug + .06), yb, h * .2, zufall(10, 40), zufall(10, 25));
            bugNaechste = jetzt + zufall(50, 110);
          }
          // Kielwasser: Schaum bleibt hinter ihm auf der Oberfläche liegen
          if (sichtbar && jetzt > schaumNaechste) {
            const sx = x + w * zufall(.7, .95);
            schaum(sx, oberflaeche(sx) - 2, w * zufall(.3, .5));
            schaumNaechste = jetzt + zufall(50, 90);
          }
          if (p >= 1) return fertig();
          bild2 = requestAnimationFrame(schritt);
        };
        bild2 = requestAnimationFrame(schritt);
        aufraeumen.add(() => cancelAnimationFrame(bild2));
      });
      el.remove();
      kontakt.remove();
    };
    const aufraeumen = new Set();

    (async () => {
      await warte(zufall(1500, 4000));
      while (!aus) {
        await wach();
        if (aus) return;
        await fahren();
        await warte(zufall(15000, 35000));
      }
    })();

    return () => {
      aus = true;
      uhren.forEach(clearTimeout);
      uhren.clear();
      aufraeumen.forEach((f) => f());
      wo.disconnect();
      schichten.forEach((s) => s.anim.cancel());
      band.replaceChildren();
    };
  }, []);
  return <div className="durchfahrt" ref={ref} aria-hidden="true" />;
}
