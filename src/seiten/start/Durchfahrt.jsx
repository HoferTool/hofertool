// =================================================================
//  TÄNZER MIT NOCCO-DOSEN, IM BAND OBEN
//  Geschichte (alles Wunsch Patrick): 1.130.0 bis 1.149.0 liefen hier
//  Hühner, 1.150.0 Ferrari und Mario, 1.151.0 bis 1.210.x Jiviano auf
//  dem Jetski, 1.211.0 bis 1.323.x zogen Hühner mit ihrem Stall um,
//  1.324.0 bis 1.441.x schlurften Zombies und Halloween-Kreaturen vorbei
//  (im Git-Verlauf, mit spukGaeste.js).
//  Seit 1.442.0 (6. November 2026: „Entferne die Zombies und das
//  Halloween Thema … eine Person auf einem Grossvater Mobil wie das im
//  Bild … eine Tennisballkanone drauf, vorne beim Korb … herumfahren und
//  Tennisbälle verschiessen. Die Bälle sollen über das ganze Infoboard
//  fliegen“): Ein Grossvater mit Mütze, Brille und Schnauz fährt auf
//  einem roten Elektromobil (vier Räder, schwarzer Sitz mit Kopfstütze,
//  Lenksäule mit Spiegeln, Drahtkorb vorne) über eine Strasse unten im
//  Band, mal nach links, mal nach rechts. Auf dem Korb sitzt die Kanone;
//  unterwegs und bei kurzen Halten schiesst sie Tennisbälle ab. Im
//  Infoboard fliegen die Bälle über die ganze Tafel und springen an den
//  Rändern ab, auf der Startseite nur im Band.
//  Seit 1.477.0 (10. November 2026: „lass die Tennisbälle auf dem
//  Infoboard nicht verschwinden, es soll sich mit Tennisbällen füllen,
//  wenn es voll ist, soll es überlaufen“) bleiben die Bälle in der Anzeige
//  des Infoboards liegen: sie rollen auf den Haufen und stapeln sich, bis
//  er oben ankommt. Danach gibt es oben keine Decke mehr und keine Wände
//  über dem Rand: neue Bälle kullern über den Haufen und fallen seitlich
//  aus der Tafel. Gezeichnet auf zwei Leinwänden: liegende Bälle einmal
//  auf eine feste (sie bewegen sich nie mehr), fliegende jedes Bild neu,
//  so bleibt es auch mit über tausend Bällen flüssig. In der Gestaltung
//  und auf der Startseite verschwinden die Bälle weiter, damit man dort
//  die Dokumente sieht. Neues Laden der Anzeige leert die Tafel.
//  Seit 1.481.0 (11. November 2026: „wenn es bis unter den Kalender
//  gefüllt ist, sollen die Tennisbälle abfliessen und neu füllen“) läuft
//  nichts mehr oben über: reicht der Haufen bis an die Unterkante des
//  Bands mit Geburtstagen und Terminen, öffnet sich der Boden, alle Bälle
//  rinnen von unten her aus der Tafel, und danach füllt sie sich neu.
//  Seit 1.495.0 (12. November 2026: „Nimm die Tennisballkanone raus und
//  lass ihn tanzend durchlaufen, er soll noch Nocco-Getränke werfen“)
//  statt Mobil und Kanone ein Tänzer (Foto nur in der Datenbank,
//  app_config.durchfahrt_taenzer; ohne Foto eine gezeichnete Figur): er
//  läuft hüpfend und schwingend durchs Band, dreht sich ab und zu um sich
//  selbst, Noten steigen von den Kopfhörern auf, und statt Tennisbällen
//  wirft er Nocco-Dosen, die im Infoboard genauso liegen bleiben, sich
//  stapeln und unter dem Kalender abfliessen.
//  Alles in einer Schleife mit requestAnimationFrame statt React-Zustand,
//  damit die Seite dafür nie neu zeichnet.
// =================================================================
import { useEffect, useRef } from "react";
import { alt } from "../../bruecke.jsx";

const zufall = (a, b) => a + Math.random() * (b - a);
const ganz = (a, b) => Math.floor(zufall(a, b + 1));

// Das Foto des Tänzers steht nur in der Datenbank (app_config,
// Schlüssel durchfahrt_taenzer, als data:-Bild), nie im Repository, weil
// das öffentlich ist. Einmal je Laden der App geholt.
let fotoHolen = null;
const taenzerFoto = () => {
  if (!fotoHolen) fotoHolen = (async () => {
    try {
      if (!alt.db) return null;
      const r = await alt.db.from("app_config").select("wert").eq("schluessel", "durchfahrt_taenzer").maybeSingle();
      const w = r && r.data && r.data.wert;
      return typeof w === "string" && w.startsWith("data:image/") ? w : null;
    } catch { return null; }
  })();
  return fotoHolen;
};

// Ohne Foto (Prüfstand, keine Verbindung): gezeichnete Figur mit
// Kopfhörern, dunklem Pulli und schwarzer Hose, gleiches Seitenverhältnis
// wie das Foto (102 × 300), Hand vorne rechts.
const FIGUR = `<svg viewBox="0 0 102 300" xmlns="http://www.w3.org/2000/svg">
  <path d="M30 196 L28 296 L50 296 L52 214 L56 296 L78 296 L76 196 Z" fill="#17181c"/>
  <path d="M22 84 C24 64 40 58 52 58 C66 58 80 64 84 84 L86 204 L20 204 Z" fill="#1f2a44"/>
  <path d="M40 66 L42 116 M64 66 L62 116" stroke="#e9eef4" stroke-width="2.5"/>
  <path d="M84 96 L94 140" stroke="#1f2a44" stroke-width="13" stroke-linecap="round"/>
  <circle cx="94" cy="142" r="7" fill="#e8b494"/>
  <path d="M24 98 L18 176" stroke="#1f2a44" stroke-width="13" stroke-linecap="round"/>
  <circle cx="19" cy="182" r="7" fill="#e8b494"/>
  <rect x="44" y="46" width="14" height="14" fill="#e3a98a"/>
  <circle cx="51" cy="32" r="17" fill="#f0c4a4"/>
  <path d="M36 40 C38 54 64 54 66 40 C62 50 40 50 36 40 Z" fill="#a8693a"/>
  <path d="M33 30 C33 8 69 8 69 30" stroke="#222" stroke-width="5" fill="none"/>
  <rect x="28" y="26" width="9" height="15" rx="4" fill="#2b2b2f"/><rect x="65" y="26" width="9" height="15" rx="4" fill="#2b2b2f"/>
</svg>`;
// Wo die Hand ist, in Anteilen des Bilds (Foto wie Zeichnung)
const HAND = { x: .89, y: .48 };

export default function Durchfahrt() {
  const ref = useRef(null);
  useEffect(() => {
    const band = ref.current;
    if (!band) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let aus = false;

    // Boden unten im Band
    const strasse = document.createElement("div");
    strasse.className = "gm-strasse";
    band.appendChild(strasse);

    // Wohin die Dosen fliegen: im Infoboard über die ganze Tafel (das
    // Blatt in Punkten der Tafel, als Ganzes skaliert), sonst im Band
    const tafel = band.closest("[data-ibtafel]");
    const raum = document.createElement("div");
    raum.className = "gm-baelle" + (tafel ? " gm-baelle--tafel" : "");
    (tafel || band).appendChild(raum);
    // Nur in der Anzeige des Infoboards bleiben die Dosen liegen
    const fuellen = !!tafel && !!band.closest(".ib-voll");
    const haufen = fuellen ? haufenAnlegen(raum) : null;

    // Der Tänzer: aussen nur Ort und Blickrichtung, innen das Tanzen
    const mobil = document.createElement("div");
    mobil.className = "gm-taenzer";
    mobil.style.visibility = "hidden";
    const koerper = document.createElement("div");
    koerper.className = "gm-koerper";
    koerper.innerHTML = FIGUR;
    const hand = document.createElement("i");
    hand.className = "gm-hand";
    hand.style.left = HAND.x * 100 + "%"; hand.style.top = HAND.y * 100 + "%";
    koerper.appendChild(hand);
    mobil.appendChild(koerper);
    band.appendChild(mobil);
    taenzerFoto().then((url) => {
      if (!url || aus) return;
      const img = new Image();
      img.alt = ""; img.draggable = false; img.src = url;
      img.onload = () => { if (!aus) koerper.replaceChild(img, koerper.querySelector("svg")); };
    });

    // Masse, neu bei jeder Runde (das Band ändert seine Grösse mit dem Fenster)
    let breit = 0, hoch = 0, H = 0, W = 0, boden = 0;
    const messen = () => {
      breit = band.clientWidth; hoch = band.clientHeight;
      boden = Math.max(3, hoch * .045);
      H = Math.max(46, Math.min(190, (hoch - boden) * .76));
      W = H * 102 / 300;
      mobil.style.width = W + "px";
      mobil.style.height = H + "px";
      mobil.style.bottom = boden + "px";
    };

    // Stelle auf dem Bildschirm → Punkt im Raum der Dosen
    const raumMass = () => {
      const r = raum.getBoundingClientRect();
      const k = raum.offsetWidth ? r.width / raum.offsetWidth : 1;
      return { r, k, w: raum.offsetWidth, h: raum.offsetHeight };
    };

    const dosen = [];
    let wurfAb = -9;
    const wurf = (tempoMobil, richtung, jetzt) => {
      if ((haufen ? haufen.fliegt.length > 70 : dosen.length > 40) || !raum.isConnected) return;
      const m = raumMass();
      if (!m.w || !m.h) return;
      const p = hand.getBoundingClientRect();
      const x = (p.left - m.r.left) / m.k;
      const y = (p.top - m.r.top) / m.k;
      // Grösse: im Band passend zur Hand, auf der Tafel gut sichtbar
      const bandK = band.offsetWidth ? band.getBoundingClientRect().width / band.offsetWidth : 1;
      const klein = H * .16 * bandK / m.k;
      const gross = tafel ? Math.max(klein * 1.6, m.w * .03) : klein;
      const a = zufall(25, 62) * Math.PI / 180;
      const g = tafel ? m.h * zufall(.5, .7) : Math.max(500, m.h * 3);
      const tempo = tafel ? m.w * zufall(.5, 1) : m.w * zufall(.28, .55);
      const vx = richtung * Math.cos(a) * tempo + tempoMobil * .5, vy = -Math.sin(a) * tempo;
      const sorte = ganz(0, SORTEN.length - 1);
      if (haufen) haufen.neu(x, y, klein, haufen.durchmesser(m.w), vx, vy, g, sorte);
      else {
        const el = document.createElement("div");
        el.className = "gm-dose";
        el.style.backgroundImage = `url(${dosenBild(64, sorte).url})`;
        raum.appendChild(el);
        dosen.push({ el, x, y, d: klein, ziel: gross, alt: 0, ende: 9, dreh: 0, spin: richtung * zufall(400, 900), sprung: 0, g, vx, vy });
      }
      wurfAb = jetzt / 1000;
    };

    // Musiknoten steigen von den Kopfhörern auf
    const note = () => {
      const r = koerper.getBoundingClientRect(), pr = band.getBoundingClientRect();
      const bandK = band.offsetWidth ? pr.width / band.offsetWidth : 1;
      if (!r.width) return;
      const n = document.createElement("div");
      n.className = "gm-note";
      n.textContent = Math.random() < .5 ? "♪" : "♫";
      const gr = H * zufall(.1, .16);
      n.style.cssText = `font-size:${gr}px;left:${(r.left + r.width * zufall(.2, .8) - pr.left) / bandK}px;top:${(r.top - pr.top) / bandK}px`;
      band.appendChild(n);
      const dx = zufall(-1, 1) * H * .3;
      n.animate([{ transform: "translate(0,0) rotate(-10deg)", opacity: 0 }, { opacity: 1, offset: .2 },
        { transform: `translate(${dx}px, ${-H * .45}px) rotate(12deg)`, opacity: 0 }],
        { duration: 1800, easing: "ease-out", fill: "forwards" }).onfinish = () => n.remove();
    };

    // Runde: pause → laufen (mit Halten zum Tanzen und Werfen) → pause …
    let phase = "pause", bis = performance.now() + zufall(800, 2000);
    let x = 0, dir = 1, v = 0, halte = [], salve = 0, naechsterWurf = 0, naechsterLaufwurf = 0;
    let drehAb = -9, naechsteDrehung = 0, naechsteNote = 0;
    const neueRunde = () => {
      messen();
      dir = Math.random() < .5 ? 1 : -1;
      x = dir > 0 ? -W - 20 : breit + 20;
      v = H * zufall(.55, .85);
      halte = [];
      for (let n = ganz(1, 2), i = 0; i < n; i++) halte.push(breit * zufall(.15, .85) - W / 2);
      halte.sort((a, b) => dir > 0 ? a - b : b - a);
      mobil.style.visibility = "";
      const jetzt = performance.now();
      naechsterLaufwurf = jetzt + zufall(1200, 2600);
      naechsteDrehung = jetzt + zufall(2500, 5000);
      phase = "laufen";
    };

    let vorher = performance.now();
    let rahmen = 0;
    const schritt = (jetzt) => {
      if (aus) return;
      const dt = Math.min(.05, (jetzt - vorher) / 1000);
      vorher = jetzt;
      const t = jetzt / 1000;

      if (phase === "pause" && jetzt > bis) neueRunde();
      else if (phase === "laufen") {
        x += dir * v * dt;
        if (halte.length && (dir > 0 ? x >= halte[0] : x <= halte[0])) {
          halte.shift();
          phase = "halt"; salve = haufen ? ganz(6, 11) : ganz(2, 5); naechsterWurf = jetzt + 600;
        } else if (jetzt > naechsterLaufwurf) {
          wurf(dir * v, dir, jetzt);
          naechsterLaufwurf = jetzt + (haufen ? zufall(450, 1000) : zufall(1500, 3200));
        }
        if (dir > 0 ? x > breit + 20 : x < -W - 20) {
          phase = "pause"; bis = jetzt + zufall(2500, 6000);
          mobil.style.visibility = "hidden";
        }
      } else if (phase === "halt" && jetzt > naechsterWurf) {
        if (salve > 0) {
          wurf(0, dir, jetzt); salve--;
          naechsterWurf = jetzt + (haufen ? zufall(220, 420) : zufall(380, 700));
        } else {
          phase = "laufen";
          naechsterLaufwurf = jetzt + zufall(1500, 3000);
        }
      }

      // Tanzen: hüpfen im Takt, Hüften schwingen, ab und zu eine
      // Drehung um sich selbst, beim Wurf nach vorne lehnen
      if (phase !== "pause") {
        const takt = t * Math.PI * (phase === "halt" ? 4.4 : 3.6);
        const hopp = Math.abs(Math.sin(takt));
        const stark = phase === "halt" ? 1.5 : 1;
        let drehX = 1;
        if (jetzt > naechsteDrehung) { drehAb = t; naechsteDrehung = jetzt + zufall(3500, 7000); }
        const dp = (t - drehAb) / .7;
        if (dp >= 0 && dp < 1) drehX = Math.cos(dp * Math.PI * 2);
        const wp = (t - wurfAb) / .32;
        const lehne = wp >= 0 && wp < 1 ? Math.sin(wp * Math.PI) * 15 : 0;
        const schwung = Math.sin(takt / 2) * 8 * stark + lehne;
        const tief = 1 - (1 - hopp) * .05;
        koerper.style.transform = `translateY(${(-hopp * H * .07 * stark).toFixed(1)}px) rotate(${schwung.toFixed(1)}deg)` +
          ` scale(${drehX.toFixed(3)}, ${tief.toFixed(3)})`;
        if (jetzt > naechsteNote) { note(); naechsteNote = jetzt + zufall(500, 1100); }
      }
      mobil.style.transform = `translateX(${x.toFixed(1)}px)` + (dir < 0 ? " scaleX(-1)" : "");

      if (haufen) haufen.schritt(dt);
      // Dosen: Wurf mit Schwerkraft, wirbeln, springen an allen Rändern ab
      if (dosen.length) {
        const w = raum.offsetWidth, h = raum.offsetHeight;
        for (let i = dosen.length - 1; i >= 0; i--) {
          const b = dosen[i];
          b.alt += dt;
          if (b.d < b.ziel) b.d = Math.min(b.ziel, b.d + (b.ziel - b.d) * dt * 6 + dt * 4);
          const r = b.d / 2;
          b.vy += b.g * dt;
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * .7; }
          if (b.x > w - r) { b.x = w - r; b.vx = -Math.abs(b.vx) * .7; }
          if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy) * .7; }
          if (b.y > h - r) {
            b.y = h - r; b.vy = -Math.abs(b.vy) * .5; b.vx *= .8; b.sprung++; b.spin *= .6;
            if (Math.abs(b.vy) < 60) b.vy = 0;
          }
          b.dreh += b.spin * dt;
          // Nach dem dritten Aufprall oder 9 Sekunden blendet sie aus
          if (b.sprung >= 3 && b.ende > b.alt + .6) b.ende = b.alt + .6;
          if (b.alt >= b.ende) { b.el.remove(); dosen.splice(i, 1); continue; }
          const sicht = Math.min(1, (b.ende - b.alt) / .6);
          const bw = b.d * 1.3, bh = bw; // Bild quadratisch, Dose darin
          const st = b.el.style;
          st.width = bw.toFixed(1) + "px"; st.height = bh.toFixed(1) + "px"; st.opacity = sicht.toFixed(2);
          st.transform = `translate(${(b.x - bw / 2).toFixed(1)}px,${(b.y - bh / 2).toFixed(1)}px) rotate(${b.dreh.toFixed(0)}deg)`;
        }
      }
      rahmen = requestAnimationFrame(schritt);
    };
    rahmen = requestAnimationFrame(schritt);
    // Nach einem versteckten Tab nicht auf einmal nachholen
    const sichtbar = () => { vorher = performance.now(); };
    document.addEventListener("visibilitychange", sichtbar);

    return () => {
      aus = true;
      cancelAnimationFrame(rahmen);
      document.removeEventListener("visibilitychange", sichtbar);
      raum.remove();
      band.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      band.replaceChildren();
    };
  }, []);
  return <div className="durchfahrt" ref={ref} aria-hidden="true" />;
}

// Nocco-Sorten: Farbe der Dose, Schrift, Streifen
const SORTEN = [
  { grund: "#ffd21f", hell: "#fff27a", schrift: "#1b3fae", band: "#1b3fae" },   // Caribbean
  { grund: "#ff4f9a", hell: "#ff9cc6", schrift: "#ffffff", band: "#ffd400" },   // Miami
  { grund: "#7ccf3c", hell: "#c3f08a", schrift: "#ffffff", band: "#1f6b22" },   // Limón
  { grund: "#ff7a1a", hell: "#ffb36b", schrift: "#ffffff", band: "#b8160f" },   // Blood Orange
  { grund: "#5cc8f2", hell: "#b5e9ff", schrift: "#ffffff", band: "#1d5fae" },   // Ice Soda
  { grund: "#26282e", hell: "#5a5e68", schrift: "#ffffff", band: "#e8c440" },   // Black
];

// Eine Nocco-Dose als Bild (stehend, Blechränder oben und unten,
// „NOCCO“ senkrecht), einmal je Sorte und Grösse gezeichnet. Das Bild ist
// quadratisch um die Mitte, damit es sich frei drehen lässt; px ist der
// Durchmesser des Kreises, mit dem die Dose im Haufen rechnet.
const dosenVorrat = new Map();
function dosenBild(px, sorte) {
  const k = px + ":" + sorte;
  if (dosenVorrat.has(k)) return dosenVorrat.get(k);
  const f = SORTEN[sorte] || SORTEN[0];
  const s = Math.ceil(px * 1.3);
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d"), m = s / 2;
  const bw = px * .56, bh = px * 1.1, x0 = m - bw / 2, y0 = m - bh / 2;
  const rund = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
  g.save();
  g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = px * .1; g.shadowOffsetY = px * .05;
  // Körper mit Licht von links (Zylinder)
  const lg = g.createLinearGradient(x0, 0, x0 + bw, 0);
  lg.addColorStop(0, f.grund); lg.addColorStop(.28, f.hell); lg.addColorStop(.55, f.grund); lg.addColorStop(1, shade(f.grund));
  g.fillStyle = lg; rund(x0, y0, bw, bh, bw * .14); g.fill();
  g.restore();
  // Blech oben und unten
  const blech = g.createLinearGradient(x0, 0, x0 + bw, 0);
  blech.addColorStop(0, "#9aa1a9"); blech.addColorStop(.3, "#f3f5f7"); blech.addColorStop(.6, "#b9c0c7"); blech.addColorStop(1, "#6d747c");
  g.fillStyle = blech;
  rund(x0 + bw * .04, y0, bw * .92, bh * .09, bw * .1); g.fill();
  rund(x0 + bw * .04, y0 + bh * .93, bw * .92, bh * .07, bw * .1); g.fill();
  // Streifen und Schrift
  g.fillStyle = f.band; g.fillRect(x0, y0 + bh * .8, bw, bh * .05);
  g.save();
  g.translate(m, m - bh * .02); g.rotate(-Math.PI / 2);
  g.fillStyle = f.schrift;
  g.font = `900 ${(bw * .52).toFixed(1)}px "Arial Black", Arial, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("NOCCO", 0, 0, bh * .66);
  g.restore();
  g.fillStyle = f.schrift; g.globalAlpha = .9;
  g.font = `700 ${(bw * .17).toFixed(1)}px Arial, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("BCAA", m, y0 + bh * .88);
  g.globalAlpha = 1;
  // Glanz
  g.fillStyle = "rgba(255,255,255,.28)";
  g.fillRect(x0 + bw * .16, y0 + bh * .1, bw * .08, bh * .68);
  const erg = { bild: c, faktor: s / px, url: c.toDataURL() };
  dosenVorrat.set(k, erg);
  return erg;
}
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const d = (v) => Math.round(v * .6).toString(16).padStart(2, "0");
  return "#" + d(n >> 16) + d((n >> 8) & 255) + d(n & 255);
}

// Tristan mit Schaufel und Tonne (seit 1.496.0). Ein Foto steht nur in
// der Datenbank (app_config, Schlüssel infoboard_tristan, als data:-Bild),
// nie im Repository; ohne Foto die gezeichnete Figur. Alles in einem SVG
// 340 × 300, nach rechts schauend: Tristan links, die Tonne rechts davor.
let tristanHolen = null;
const tristanFoto = () => {
  if (!tristanHolen) tristanHolen = (async () => {
    try {
      if (!alt.db) return null;
      const r = await alt.db.from("app_config").select("wert").eq("schluessel", "infoboard_tristan").maybeSingle();
      const w = r && r.data && r.data.wert;
      return typeof w === "string" && w.startsWith("data:image/") ? w : null;
    } catch { return null; }
  })();
  return tristanHolen;
};
const TRISTAN = `<svg viewBox="0 0 340 300" xmlns="http://www.w3.org/2000/svg">
  <g class="tr-figur">
    <g class="tr-bein tr-bein--hinten"><path d="M44 190 L42 280" stroke="#3a3f47" stroke-width="19" stroke-linecap="round"/>
      <path d="M32 282 h26 a8 8 0 0 1 0 14 h-26 z" fill="#15171b"/></g>
    <g class="tr-bein tr-bein--vorne"><path d="M60 190 L62 280" stroke="#454b55" stroke-width="19" stroke-linecap="round"/>
      <path d="M52 282 h26 a8 8 0 0 1 0 14 h-26 z" fill="#1d2025"/></g>
    <path d="M66 112 L148 152" stroke="#1a477f" stroke-width="15" stroke-linecap="round"/>
    <circle cx="149" cy="152" r="8" fill="#e8b494"/>
    <path d="M30 108 C32 92 44 88 56 88 C70 88 82 94 84 108 L86 200 L28 200 Z" fill="#1d4f91"/>
    <rect x="28" y="160" width="58" height="7" fill="#e8eef5" opacity=".9"/>
    <path d="M56 90 L56 200" stroke="#163d70" stroke-width="2"/>
    <rect x="50" y="76" width="13" height="14" fill="#e3a98a"/>
    <circle cx="58" cy="62" r="20" fill="#f0c4a4"/>
    <path d="M38 60 C36 38 56 32 70 38 C78 42 80 50 78 56 C70 50 54 50 40 64 Z" fill="#3b2a1e"/>
    <circle cx="70" cy="62" r="2.2" fill="#2a2a2a"/>
    <path d="M66 73 C70 75 74 74 76 71" stroke="#9c5b3e" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="46" cy="64" r="4" fill="#e3a98a"/>
  </g>
  <g class="tr-tonne">
    <rect x="166" y="276" width="10" height="6" fill="#2b2f35"/><rect x="276" y="276" width="10" height="6" fill="#2b2f35"/>
    <circle cx="172" cy="288" r="11" fill="#1c1f24"/><circle cx="172" cy="288" r="4" fill="#9aa1a9"/>
    <circle cx="280" cy="288" r="11" fill="#1c1f24"/><circle cx="280" cy="288" r="4" fill="#9aa1a9"/>
    <path d="M154 140 L298 140 L290 280 L162 280 Z" fill="#2f6f45"/>
    <path d="M154 140 L298 140 L294 200 L158 200 Z" fill="#ffffff" opacity=".07"/>
    <path d="M170 150 L176 272 M200 150 L202 272 M252 150 L250 272 M282 150 L276 272" stroke="#245a37" stroke-width="4"/>
    <rect x="148" y="130" width="156" height="14" rx="5" fill="#3e8a58"/>
    <path d="M140 150 L156 150" stroke="#2b2f35" stroke-width="6" stroke-linecap="round"/>
    <g class="tr-schild"><text x="226" y="222" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="24" fill="#ffffff">LEERGUT</text>
    <text x="226" y="252" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#d7f0df">♻</text></g>
  </g>
  <g class="tr-schaufel">
    <path d="M62 112 L104 150" stroke="#1d4f91" stroke-width="15" stroke-linecap="round"/>
    <path d="M100 146 L300 264" stroke="#a36a35" stroke-width="7" stroke-linecap="round"/>
    <path d="M88 132 L104 148" stroke="#2b2f35" stroke-width="9" stroke-linecap="round"/>
    <circle cx="106" cy="152" r="8" fill="#e8b494"/>
    <path d="M292 246 L338 262 L330 296 L282 282 Z" fill="#8f98a3" stroke="#5d6670" stroke-width="3" stroke-linejoin="round"/>
  </g>
</svg>`;
// Masse im SVG: Tonne von 154 bis 298, Rand oben bei 130
const TR = { breite: 340, hoehe: 300, tonneMitte: 226, tonneBreit: 144, tonneOben: 134 };

function tristanAnlegen(raum) {
  const el = document.createElement("div");
  el.className = "tr-tristan";
  el.style.visibility = "hidden";
  el.innerHTML = TRISTAN;
  raum.appendChild(el);
  tristanFoto().then((url) => {
    if (!url) return;
    const g = el.querySelector(".tr-figur");
    // Mit Foto ohne gezeichnete Beine und Arme; der Arm an der Tonne bleibt
    g.innerHTML = `<image href="${url}" x="0" y="20" width="120" height="280" preserveAspectRatio="xMidYMax meet"/>` +
      `<path d="M74 118 L148 152" stroke="#1a477f" stroke-width="13" stroke-linecap="round"/><circle cx="149" cy="152" r="8" fill="#e8b494"/>`;
    el.classList.add("tr-tristan--foto");
  });
  let an = false, x = 0, dir = 1, k = 1, tempo = 0, w = 0, h = 0, plopps = 0;
  const tonne = () => {
    if (!an) return null;
    const mitte = dir > 0 ? TR.tonneMitte : TR.breite - TR.tonneMitte;
    return { x: x + mitte * k, w: TR.tonneBreit * k, oben: h - (TR.hoehe - TR.tonneOben) * k, dir };
  };
  return {
    los(breite, hoehe) {
      w = breite; h = hoehe;
      k = h * .15 / TR.hoehe;
      el.style.width = TR.breite * k + "px"; el.style.height = TR.hoehe * k + "px";
      dir = Math.random() < .5 ? 1 : -1;
      x = dir > 0 ? -TR.breite * k : w;
      tempo = w / 13;
      el.classList.toggle("tr-links", dir < 0);
      el.style.visibility = ""; el.style.transform = `translateX(${x}px)` + (dir < 0 ? " scaleX(-1)" : "");
      an = true;
    },
    schritt(dt) {
      if (!an) return;
      x += dir * tempo * dt;
      el.style.transform = `translateX(${x.toFixed(1)}px)` + (dir < 0 ? " scaleX(-1)" : "");
      if (dir > 0 ? x > w + 4 : x < -TR.breite * k - 4) { an = false; el.style.visibility = "hidden"; }
    },
    tonne,
    unterwegs: () => an,
    // Die Tonne wackelt ab und zu, wenn Dosen hineinfallen
    plopp() {
      if (++plopps % 7) return;
      const t = el.querySelector(".tr-tonne");
      if (t && t.animate) t.animate([{ transform: "translateY(0)" }, { transform: "translateY(3px)" }, { transform: "translateY(0)" }], { duration: 220 });
    },
  };
}

// Der Haufen in der Anzeige des Infoboards: fliegende Dosen (im Haufen
// gerechnet als Kreise, darum der Name Bälle unten) mit
// Schwerkraft und Stössen untereinander; wer zur Ruhe kommt, bleibt für
// immer liegen (wird nur noch angestossen, bewegt sich aber nicht mehr),
// das hält den Stapel ruhig und die Rechnung klein.
function haufenAnlegen(raum) {
  const fest = document.createElement("canvas"), los = document.createElement("canvas");
  fest.className = los.className = "gm-leinwand";
  raum.append(fest, los);
  const gf = fest.getContext("2d"), gl = los.getContext("2d");
  let w = 0, h = 0, q = 1, sprites = new Map(), D = 0, zelle = 1;
  const fliegt = [], gitter = new Map();
  let liegen = 0, raus = 0, voll = false, runden = 0;
  // Beim Abfliessen fallen alle liegenden Bälle durch den offenen Boden,
  // die untersten zuerst; danach füllt sich die Tafel wieder
  let abfluss = [], grenze = 0, grenzeAm = 0;
  const schluessel = (x, y) => (Math.floor(x / zelle) + 1000) * 100000 + Math.floor(y / zelle) + 1000;

  const vorbereiten = () => {
    if (w) return true;
    w = raum.offsetWidth; h = raum.offsetHeight;
    if (!w || !h) { w = 0; return false; }
    const r = raum.getBoundingClientRect();
    q = Math.min(2, Math.max(1, (r.width / w) * (window.devicePixelRatio || 1)));
    for (const c of [fest, los]) { c.width = Math.round(w * q); c.height = Math.round(h * q); }
    gf.setTransform(q, 0, 0, q, 0, 0); gl.setTransform(q, 0, 0, q, 0, 0);
    return true;
  };
  const durchmesser = (breite) => Math.max(18, breite * .04);
  const zeichne = (g, b) => {
    let sp = sprites.get(b.s);
    if (!sp) { sp = dosenBild(Math.round(D * q), b.s); sprites.set(b.s, sp); }
    const s = b.d * sp.faktor;
    g.save(); g.translate(b.x, b.y); g.rotate(b.dreh);
    g.drawImage(sp.bild, -s / 2, -s / 2, s, s);
    g.restore();
  };
  // Bis wohin der Haufen wachsen darf: Unterkante des Bands mit
  // Geburtstagen und Terminen (wächst mit seinen Einträgen, darum alle
  // paar Sekunden neu gemessen); ohne Band 622 von 1920 Punkten
  const grenzeMessen = () => {
    const jetzt = performance.now();
    if (grenze && jetzt - grenzeAm < 3000) return grenze;
    grenzeAm = jetzt;
    const band = raum.parentElement && raum.parentElement.querySelector('[data-ib="band"]');
    const r = raum.getBoundingClientRect(), k = r.width / w || 1;
    const unten = band ? (band.getBoundingClientRect().bottom - r.top) / k : 0;
    grenze = unten > 0 && unten < h * .8 ? unten : h * 622 / 1920;
    return grenze;
  };
  // Seit 1.496.0 (12. November 2026: „unten im Infoboard noch Tristan
  // Ecker mit einer Schaufel, der die Nocco-Dosen wegwischt in eine
  // Tonne, die er vor sich hin schiebt“) fliesst der volle Haufen nicht
  // mehr einfach unten hinaus: Tristan kommt von einer Seite, schiebt die
  // Tonne quer über die Tafel, und wo sie hinkommt, fällt die ganze Säule
  // Dosen in die Tonne, die untersten schaufelt er hinein.
  const tristan = tristanAnlegen(raum);
  const abfliessen = () => {
    voll = true; runden++;
    abfluss = [];
    tristan.los(w, h);
  };
  // Alles, was die Tonne erreicht hat, fällt hinein
  const zurTonne = () => {
    const t = tristan.tonne();
    if (!t) return;
    let weg = false;
    for (const [k, l] of gitter) {
      for (let i = l.length - 1; i >= 0; i--) {
        const b = l[i];
        if ((b.x - t.x) * t.dir > t.w * .5 + D * .5) continue;
        l.splice(i, 1); liegen--; weg = true;
        // Untere zuerst, die Säule darüber rutscht nach
        b.warte = (h - b.y) / h * .7 + Math.random() * .08;
        b.zuX = (Math.random() - .5) * t.w * .5;
        b.vx = 0; b.vy = 0; b.inTonne = false;
        // Was unter dem Rand der Tonne liegt, fliegt mit der Schaufel hinein
        const steigen = b.y - (t.oben - D * 1.2);
        if (steigen > 0) b.vy = -Math.sqrt(2 * b.g * steigen) * zufall(1, 1.15);
        abfluss.push(b);
      }
      if (!l.length) gitter.delete(k);
    }
    if (weg) { gf.clearRect(0, 0, w, h); for (const l of gitter.values()) for (const b of l) zeichne(gf, b); }
  };
  const hinlegen = (b) => {
    const k = schluessel(b.x, b.y);
    const l = gitter.get(k);
    if (l) l.push(b); else gitter.set(k, [b]);
    liegen++;
    zeichne(gf, b);
    // Bis unter den Kalender gefüllt: am Ende des Schritts abfliessen
    if (!voll && b.y - b.d / 2 < grenzeMessen()) b.oben = true;
  };

  const neu = (x, y, d, ziel, vx, vy, g, sorte = ganz(0, SORTEN.length - 1)) => {
    if (!vorbereiten()) return;
    if (!D) { D = ziel; zelle = D * 1.05; }
    // Steckt die Mündung schon im Haufen, kommt der Ball oben auf ihm
    // heraus, statt zwischen liegenden Bällen festzuhängen
    while (y > -D && belegt(x, y)) y -= D * .5;
    fliegt.push({ x, y, d, ziel: D, vx, vy, g, s: sorte, dreh: Math.random() * 6.28, ruhe: 0, alt: 0 });
  };

  const belegt = (x, y) => {
    const cx = Math.floor(x / zelle), cy = Math.floor(y / zelle);
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
      const l = gitter.get((ix + 1000) * 100000 + iy + 1000);
      if (l) for (const o of l) if ((o.x - x) ** 2 + (o.y - y) ** 2 < D * D * .8) return true;
    }
    return false;
  };
  const stoss = (b, x, y, rs) => {
    const dx = b.x - x, dy = b.y - y, rr = b.d / 2 + rs;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return 0;
    let dist = Math.sqrt(d2), nx, ny;
    if (dist < .001) { nx = Math.random() - .5; ny = -1; dist = .001; } else { nx = dx / dist; ny = dy / dist; }
    const tief = rr - dist;
    b.x += nx * tief; b.y += ny * tief;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= 1.3 * vn * nx; b.vy -= 1.3 * vn * ny; }
    return ny < -.25 ? 2 : 1; // 2 = liegt auf etwas
  };

  const schritt = (dt) => {
    if ((!fliegt.length && !abfluss.length && !voll) || !D) return;
    let oben = false;
    const n = 3, t = dt / n;
    for (let s = 0; s < n; s++) {
      for (let i = fliegt.length - 1; i >= 0; i--) {
        const b = fliegt[i];
        if (b.d < b.ziel) b.d = Math.min(b.ziel, b.d + (b.ziel - b.d) * t * 6 + t * 4);
        const r = b.d / 2;
        b.vy += b.g * t;
        b.x += b.vx * t; b.y += b.vy * t;
        b.auf = false;
        if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * .5; }
        if (b.x > w - r) { b.x = w - r; b.vx = -Math.abs(b.vx) * .5; }
        if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy) * .6; }
        // Beim Abfliessen ist der Boden offen
        if (!voll && b.y > h - r) {
          b.y = h - r; b.vy = -Math.abs(b.vy) * .35; b.auf = true;
          if (Math.abs(b.vy) < 40) b.vy = 0;
        }
        // Stösse mit liegenden Bällen ringsum
        const cx = Math.floor(b.x / zelle), cy = Math.floor(b.y / zelle);
        for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
          const l = gitter.get((ix + 1000) * 100000 + iy + 1000);
          if (l) for (const o of l) if (stoss(b, o.x, o.y, o.d / 2) === 2) b.auf = true;
        }
        // Raus aus der Tafel: weg
        if (b.x < -r * 2 || b.x > w + r * 2 || b.y > h + r * 2) { fliegt.splice(i, 1); raus++; }
      }
      // Fliegende untereinander, beide weichen je zur Hälfte
      for (let i = 0; i < fliegt.length; i++) for (let j = i + 1; j < fliegt.length; j++) {
        const a = fliegt[i], b = fliegt[j];
        const dx = b.x - a.x, dy = b.y - a.y, rr = (a.d + b.d) / 2;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const dist = Math.sqrt(d2), nx = dx / dist, ny = dy / dist, tief = (rr - dist) / 2;
        a.x -= nx * tief; a.y -= ny * tief; b.x += nx * tief; b.y += ny * tief;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const j2 = -.65 * vn;
          a.vx -= j2 * nx; a.vy -= j2 * ny; b.vx += j2 * nx; b.vy += j2 * ny;
        }
        if (ny > .25) b.auf = true; else if (ny < -.25) a.auf = true;
      }
    }
    // Rollen bremst, auf einer Kuppe kippt er zur Seite; wer ruhig
    // liegt, bleibt liegen
    for (let i = fliegt.length - 1; i >= 0; i--) {
      const b = fliegt[i];
      if (b.auf) {
        b.vx *= Math.max(0, 1 - 2.2 * dt);
        if (Math.abs(b.vx) < 4) b.vx += (Math.random() - .5) * 30;
      }
      b.dreh += b.vx * dt / (b.d / 2);
      // Sicherung: wer nach 20 Sekunden noch nicht liegt, verschwindet
      b.alt += dt;
      if (b.alt > 20) { fliegt.splice(i, 1); continue; }
      // Zur Ruhe gekommen = liegt auf etwas und ist in 0.4 s kaum vom
      // Fleck gekommen (zwischen vielen Bällen zittert er sonst ewig)
      const frei = b.auf && b.d >= b.ziel * .99 && !voll;
      if (!frei) { b.ruhe = 0; b.rx = b.x; b.ry = b.y; }
      else {
        if (!b.ruhe) { b.rx = b.x; b.ry = b.y; }
        b.ruhe += dt;
        if (b.ruhe > .4) {
          if (Math.hypot(b.x - b.rx, b.y - b.ry) < D * .15) {
            fliegt.splice(i, 1); hinlegen(b);
            if (b.oben) oben = true;
            continue;
          }
          b.ruhe = 0;
        }
      }
    }
    if (oben) abfliessen();
    if (voll) { tristan.schritt(dt); zurTonne(); }
    // Die Dosen auf dem Weg in die Tonne: ohne Stösse, jede für sich,
    // sie ziehen zur Tonne hin und verschwinden hinter ihrem Rand
    const tn = tristan.tonne();
    for (let i = abfluss.length - 1; i >= 0; i--) {
      const b = abfluss[i];
      if (b.warte > 0) { b.warte -= dt; continue; }
      b.vy += b.g * dt; b.y += b.vy * dt;
      if (tn) b.x += (tn.x + b.zuX - b.x) * Math.min(1, dt * 3.5);
      else b.x += b.vx * dt;
      b.dreh += 3 * dt;
      const drin = tn && b.vy > 0 && b.y > tn.oben + D * .4 && Math.abs(b.x - tn.x) < tn.w * .5;
      if (drin || b.y > h + b.d) { abfluss.splice(i, 1); raus++; if (drin) tristan.plopp(); }
    }
    // Tristan ist durch und alles ist in der Tonne: die Tafel füllt sich wieder
    if (voll && !abfluss.length && !tristan.unterwegs()) voll = false;
    gl.clearRect(0, 0, w, h);
    for (const b of abfluss) zeichne(gl, b);
    for (const b of fliegt) zeichne(gl, b);
  };

  const haufen = { fliegt, neu, schritt, durchmesser, voll: () => voll, liegen: () => liegen, raus: () => raus,
    runden: () => runden, grenze: () => grenzeMessen(), abfluss: () => abfluss.length, tristan: () => tristan.unterwegs() };
  // Für den Prüfstand: viele Bälle auf einmal oben einwerfen
  if (window.TEST) window.TEST.dosen = window.TEST.tennis = Object.assign(haufen, {
    regen: (anzahl) => {
      if (!vorbereiten()) return;
      for (let i = 0; i < anzahl; i++) neu(w * (.3 + Math.random() * .4), D * (1 + Math.random() * 3), durchmesser(w), durchmesser(w),
        (Math.random() - .5) * 200, 0, h * .6);
    },
  });
  return haufen;
}
