// =================================================================
//  SENIORENMOBIL MIT TENNISBALLKANONE, IM BAND OBEN
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
//  Alles in einer Schleife mit requestAnimationFrame statt React-Zustand,
//  damit die Seite dafür nie neu zeichnet.
// =================================================================
import { useEffect, useRef } from "react";

const zufall = (a, b) => a + Math.random() * (b - a);
const ganz = (a, b) => Math.floor(zufall(a, b + 1));

// Das Mobil mit Fahrer, Blick nach rechts, Raster 220 × 160, Räder
// stehen auf y 158. Drehpunkt der Kanone (172, 60); .gm-muendung ist die
// Stelle, an der die Bälle herauskommen.
const MOBIL = `<svg viewBox="0 0 220 160" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gm-rot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4a4a"/><stop offset=".35" stop-color="#d4141c"/><stop offset="1" stop-color="#7a0509"/></linearGradient>
    <linearGradient id="gm-sitz" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a5f68"/><stop offset=".5" stop-color="#2e3238"/><stop offset="1" stop-color="#15171b"/></linearGradient>
    <linearGradient id="gm-rohr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3e7ec"/><stop offset=".45" stop-color="#8d949c"/><stop offset="1" stop-color="#3d4248"/></linearGradient>
    <radialGradient id="gm-haut" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffe0c7"/><stop offset="1" stop-color="#e2a98a"/></radialGradient>
    <radialGradient id="gm-ball" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#f4fb7a"/><stop offset=".6" stop-color="#d3e12c"/><stop offset="1" stop-color="#9aab17"/></radialGradient>
  </defs>
  <ellipse cx="108" cy="158" rx="98" ry="4" fill="#000" opacity=".25"/>
  <g class="gm-wagen">
    <!-- Sitz: Rückenlehne, Kopfstütze, Armlehne (hinter dem Fahrer) -->
    <rect x="61" y="90" width="7" height="20" fill="#3b3f45"/>
    <path d="M30 92 L27 48 C27 41 31 38 38 38 L47 38 C52 38 54 42 54 47 L52 90 Z" fill="url(#gm-sitz)"/>
    <path d="M35 46 L36 86 M41 45 L42 86 M47 46 L47 86" stroke="#1b1d21" stroke-width="1"/>
    <rect x="29" y="20" width="23" height="16" rx="6" fill="url(#gm-sitz)"/>
    <rect x="38" y="35" width="4" height="5" fill="#2a2d32"/>
    <rect x="44" y="68" width="38" height="6" rx="3" fill="#25282d"/>
    <path d="M78 74 L80 90" stroke="#25282d" stroke-width="4"/>
    <!-- Grundkörper rot, Trittbrett, vordere Haube -->
    <path d="M18 136 C13 120 22 106 44 106 L110 106 C118 106 121 112 121 119 L121 136 Z" fill="url(#gm-rot)"/>
    <path d="M24 112 C40 108 90 108 114 110" stroke="#ff9a9a" stroke-width="2" fill="none" opacity=".7"/>
    <rect x="119" y="125" width="32" height="8" fill="#26282c"/>
    <rect x="117" y="131" width="35" height="6" rx="2" fill="url(#gm-rot)"/>
    <rect x="134" y="132" width="8" height="3" fill="#ff9d1c"/>
    <path d="M146 137 L146 118 C148 104 163 100 177 106 C189 111 193 123 191 137 Z" fill="url(#gm-rot)"/>
    <path d="M152 112 C158 105 170 104 178 108" stroke="#ff9a9a" stroke-width="2" fill="none" opacity=".7"/>
    <rect x="176" y="128" width="24" height="9" rx="4" fill="#1d1f23"/>
    <ellipse cx="180" cy="114" rx="6" ry="4.5" fill="#f4f4f0" stroke="#9a9a9a" stroke-width="1"/>
    <!-- Lenksäule mit Faltenbalg, Kopf mit Anzeige, Lenker, Spiegel, Blinker -->
    <path d="M148 110 L160 110 L158 104 L150 104 L158 100 L148 100 L156 96 L146 96 Z" fill="#1d1f23"/>
    <path d="M145 97 L157 97 L148 54 L136 54 Z" fill="url(#gm-rot)"/>
    <path d="M132 56 C130 46 136 40 144 40 C152 40 156 46 154 56 Z" fill="url(#gm-rot)"/>
    <ellipse cx="143" cy="49" rx="5" ry="4" fill="#1b2a3a"/>
    <path d="M128 52 L156 50" stroke="#1d1f23" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M136 50 L131 32 M152 49 L157 31" stroke="#2a2c30" stroke-width="2"/>
    <ellipse cx="130" cy="29" rx="4" ry="5.5" fill="#1d1f23"/><ellipse cx="158" cy="28" rx="4" ry="5.5" fill="#1d1f23"/>
    <rect x="131" y="55" width="5" height="3" rx="1" fill="#ff8a00"/><rect x="152" y="54" width="5" height="3" rx="1" fill="#ff8a00"/>
    <!-- Drahtkorb mit Tennisbällen -->
    <circle cx="164" cy="61" r="5" fill="url(#gm-ball)"/><circle cx="174" cy="60" r="5" fill="url(#gm-ball)"/><circle cx="183" cy="61" r="4.5" fill="url(#gm-ball)"/>
    <path d="M155 62 L190 60 L186 90 L159 92 Z" fill="#2b2d31" opacity=".35"/>
    <path d="M155 62 L190 60 L186 90 L159 92 Z M156 70 L189 68 M157 78 L188 76 M158 86 L187 84 M162 62 L165 92 M169 61.6 L171 91.5 M176 61.2 L177 91 M183 60.6 L182 90.6"
      stroke="#2b2d31" stroke-width="1.3" fill="none"/>
    <path d="M150 80 L158 80" stroke="#2b2d31" stroke-width="3"/>
    <!-- Fahrer: Grossvater mit Mütze, Brille, Schnauz und Schal -->
    <path d="M60 84 L104 86" stroke="#5b4a3a" stroke-width="13" stroke-linecap="round"/>
    <path d="M104 86 L113 118" stroke="#5b4a3a" stroke-width="11" stroke-linecap="round"/>
    <ellipse cx="119" cy="122" rx="10" ry="4.5" fill="#2a1c12"/>
    <path d="M47 86 C45 68 47 53 57 47 C66 42 75 46 77 55 L79 86 Z" fill="#c9b48a"/>
    <path d="M47 86 C46 72 47 60 51 54" stroke="#a8946b" stroke-width="2" fill="none"/>
    <circle cx="73" cy="62" r="1.3" fill="#6b5a3a"/><circle cx="74" cy="70" r="1.3" fill="#6b5a3a"/><circle cx="75" cy="78" r="1.3" fill="#6b5a3a"/>
    <g class="gm-schal"><path d="M60 46 C56 50 48 52 38 50 L36 56 C46 58 56 56 62 51 Z" fill="#c8202a"/>
      <path d="M38 50 l-4 1 M37 53 l-4 1 M36 56 l-4 1" stroke="#c8202a" stroke-width="1.5"/></g>
    <path d="M60 44 C64 48 72 48 76 44 L76 49 C72 53 64 53 60 49 Z" fill="#c8202a"/>
    <g class="gm-kopf">
      <rect x="65" y="38" width="7" height="8" fill="#e8b494"/>
      <circle cx="69" cy="31" r="11.5" fill="url(#gm-haut)"/>
      <path d="M58 28 C56 34 58 40 62 42 C60 36 61 31 63 29 Z" fill="#f2f2f2"/>
      <ellipse cx="63" cy="32" rx="2.3" ry="3.2" fill="#e2a98a"/>
      <path d="M80 29 C84 31 84 35 80.5 35.5" fill="#f0bf9d" stroke="#d29878" stroke-width=".8"/>
      <circle cx="75.5" cy="29.5" r="3.6" fill="#cfe4f2" fill-opacity=".45" stroke="#2b2b2b" stroke-width="1.2"/>
      <path d="M71.9 29 L64 29.5" stroke="#2b2b2b" stroke-width="1"/>
      <circle cx="76" cy="29.6" r="1" fill="#2b2b2b"/>
      <path d="M72.5 25 L78.5 24.5" stroke="#f4f4f4" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M73 37.5 C75 35 80 35 82.5 37.5 C80 39.5 76 39.5 73 37.5 Z" fill="#f6f6f6"/>
      <path d="M75 40.5 C77 41.5 79 41.3 80 40.5" stroke="#9a5a4a" stroke-width="1" fill="none"/>
      <path d="M57 26 C58 15 75 13 81 21 L89 23.5 C87 27 82 27.5 79 26.5 L57 28 Z" fill="#6b5a46"/>
      <path d="M60 22 C66 18 74 18 79 21" stroke="#8a7760" stroke-width="1.2" fill="none"/>
    </g>
    <path d="M66 55 L92 71" stroke="#c9b48a" stroke-width="9" stroke-linecap="round"/>
    <path d="M92 71 L127 52" stroke="#c9b48a" stroke-width="8" stroke-linecap="round"/>
    <circle cx="129" cy="51" r="4.6" fill="url(#gm-haut)"/>
    <!-- Kanone auf dem Korb: Sockel, Rohr mit Ring, Mündung -->
    <path d="M162 64 L184 63 L182 70 L164 71 Z" fill="#30343a"/>
    <g class="gm-kanone" transform="rotate(-25 172 60)">
      <g class="gm-rohr">
        <rect x="162" y="53" width="48" height="14" rx="4" fill="url(#gm-rohr)"/>
        <rect x="180" y="52" width="6" height="16" rx="1.5" fill="#d3e12c"/>
        <rect x="205" y="51" width="9" height="18" rx="3" fill="#3d4248"/>
        <ellipse cx="214" cy="60" rx="2.2" ry="6.5" fill="#111"/>
        <circle class="gm-muendung" cx="214" cy="60" r="1" fill="none"/>
      </g>
      <circle cx="172" cy="60" r="6" fill="#30343a"/><circle cx="172" cy="60" r="2.2" fill="#8d949c"/>
    </g>
  </g>
  <!-- Räder drehen um ihre Mitte -->
  <g class="gm-rad"><circle cx="48" cy="141" r="17" fill="#1b1b1d"/><circle cx="48" cy="141" r="9.5" fill="#a9afb6"/>
    <path d="M48 132 L48 150 M39.5 141 L56.5 141 M42 135 L54 147 M54 135 L42 147" stroke="#5d6369" stroke-width="2"/><circle cx="48" cy="141" r="3.5" fill="#3a3d42"/></g>
  <g class="gm-rad"><circle cx="168" cy="141" r="17" fill="#1b1b1d"/><circle cx="168" cy="141" r="9.5" fill="#a9afb6"/>
    <path d="M168 132 L168 150 M159.5 141 L176.5 141 M162 135 L174 147 M174 135 L162 147" stroke="#5d6369" stroke-width="2"/><circle cx="168" cy="141" r="3.5" fill="#3a3d42"/></g>
  <path d="M28 132 C30 120 40 115 50 115 C60 115 68 121 70 131" stroke="#7a0509" stroke-width="3" fill="none"/>
  <path d="M148 132 C150 120 160 115 170 115 C180 115 188 121 190 131" stroke="#7a0509" stroke-width="3" fill="none"/>
</svg>`;

export default function Durchfahrt() {
  const ref = useRef(null);
  useEffect(() => {
    const band = ref.current;
    if (!band) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let aus = false;

    // Strasse unten im Band
    const strasse = document.createElement("div");
    strasse.className = "gm-strasse";
    band.appendChild(strasse);

    // Wohin die Bälle fliegen: im Infoboard über die ganze Tafel (das
    // Blatt in Punkten der Tafel, als Ganzes skaliert), sonst im Band
    const tafel = band.closest("[data-ibtafel]");
    const raum = document.createElement("div");
    raum.className = "gm-baelle" + (tafel ? " gm-baelle--tafel" : "");
    (tafel || band).appendChild(raum);

    const mobil = document.createElement("div");
    mobil.className = "gm-mobil";
    mobil.innerHTML = MOBIL;
    mobil.style.visibility = "hidden";
    band.appendChild(mobil);
    const raeder = [...mobil.querySelectorAll(".gm-rad")];
    const kanone = mobil.querySelector(".gm-kanone");
    const rohr = mobil.querySelector(".gm-rohr");
    const muendung = mobil.querySelector(".gm-muendung");

    // Masse, neu bei jeder Fahrt (das Band ändert seine Grösse mit dem Fenster)
    let breit = 0, hoch = 0, H = 0, W = 0, boden = 0;
    const messen = () => {
      breit = band.clientWidth; hoch = band.clientHeight;
      H = Math.max(40, Math.min(150, hoch * .62));
      W = H * 220 / 160;
      boden = Math.max(3, hoch * .045);
      mobil.style.width = W + "px";
      mobil.style.height = H + "px";
      mobil.style.bottom = boden + "px";
    };

    // Stelle auf dem Bildschirm → Punkt im Raum der Bälle
    const raumMass = () => {
      const r = raum.getBoundingClientRect();
      const k = raum.offsetWidth ? r.width / raum.offsetWidth : 1;
      return { r, k, w: raum.offsetWidth, h: raum.offsetHeight };
    };

    const baelle = [];
    let winkel = 25;
    const schuss = (tempoMobil, richtung) => {
      if (baelle.length > 40 || !raum.isConnected) return;
      const m = raumMass();
      if (!m.w || !m.h) return;
      const p = muendung.getBoundingClientRect();
      const x = (p.left + p.width / 2 - m.r.left) / m.k;
      const y = (p.top + p.height / 2 - m.r.top) / m.k;
      // Grösse: im Band wie das Rohr, auf der Tafel gut sichtbar
      const bandK = band.offsetWidth ? band.getBoundingClientRect().width / band.offsetWidth : 1;
      const klein = H * .085 * bandK / m.k;
      const gross = tafel ? Math.max(klein * 1.6, m.w * .028) : klein;
      const a = winkel * Math.PI / 180;
      const g = tafel ? m.h * zufall(.5, .7) : Math.max(500, m.h * 3);
      const tempo = tafel ? m.w * zufall(.55, 1.05) : m.w * zufall(.3, .6);
      const el = document.createElement("div");
      el.className = "gm-ball";
      raum.appendChild(el);
      baelle.push({
        el, x, y, d: klein, ziel: gross, alt: 0, ende: 9, dreh: 0, sprung: 0, g,
        vx: richtung * Math.cos(a) * tempo + tempoMobil * .5,
        vy: -Math.sin(a) * tempo,
      });
      // Rückstoss und Rauch an der Mündung
      rohr.animate([{ transform: "translateX(0)" }, { transform: "translateX(-7px)" }, { transform: "translateX(0)" }],
        { duration: 260, easing: "ease-out" });
      const pr = band.getBoundingClientRect();
      const puff = document.createElement("div");
      puff.className = "gm-puff";
      const pd = H * .22;
      puff.style.cssText = `width:${pd}px;height:${pd}px;left:${(p.left - pr.left) / bandK - pd / 2}px;top:${(p.top - pr.top) / bandK - pd / 2}px`;
      band.appendChild(puff);
      puff.animate([{ transform: "scale(.3)", opacity: .9 }, { transform: `translate(${richtung * pd * .4}px, ${-pd * .5}px) scale(1.6)`, opacity: 0 }],
        { duration: 700, easing: "ease-out", fill: "forwards" }).onfinish = () => puff.remove();
    };
    const zielen = () => {
      winkel = zufall(12, 48);
      kanone.setAttribute("transform", `rotate(${-winkel.toFixed(1)} 172 60)`);
    };

    // Fahrt: Phasen pause → fahren (mit Halten zum Schiessen) → pause …
    let phase = "pause", bis = performance.now() + zufall(800, 2000);
    let x = 0, dir = 1, v = 0, halte = [], salve = 0, naechsterSchuss = 0, naechsterFahrschuss = 0;
    const raederTempo = (tempo) => {
      const umfang = 2 * Math.PI * 17 / 160 * H;
      raeder.forEach((r) => {
        r.style.animationDuration = tempo > 0 ? (umfang / tempo).toFixed(2) + "s" : "";
        r.style.animationPlayState = tempo > 0 ? "running" : "paused";
      });
    };
    const neueFahrt = () => {
      messen();
      dir = Math.random() < .5 ? 1 : -1;
      x = dir > 0 ? -W - 20 : breit + 20;
      v = H * zufall(1.3, 1.9);
      halte = [];
      for (let n = ganz(1, 2), i = 0; i < n; i++) halte.push(breit * zufall(.15, .85) - W / 2);
      halte.sort((a, b) => dir > 0 ? a - b : b - a);
      mobil.style.visibility = "";
      naechsterFahrschuss = performance.now() + zufall(1200, 2600);
      zielen();
      raederTempo(v);
      phase = "fahren";
    };

    let vorher = performance.now();
    let rahmen = 0;
    const schritt = (jetzt) => {
      if (aus) return;
      const dt = Math.min(.05, (jetzt - vorher) / 1000);
      vorher = jetzt;

      if (phase === "pause" && jetzt > bis) neueFahrt();
      else if (phase === "fahren") {
        x += dir * v * dt;
        if (halte.length && (dir > 0 ? x >= halte[0] : x <= halte[0])) {
          halte.shift();
          phase = "halt"; salve = ganz(2, 5); naechsterSchuss = jetzt + 450;
          raederTempo(0);
        } else if (jetzt > naechsterFahrschuss) {
          zielen(); schuss(dir * v, dir);
          naechsterFahrschuss = jetzt + zufall(1500, 3200);
        }
        if (dir > 0 ? x > breit + 20 : x < -W - 20) {
          phase = "pause"; bis = jetzt + zufall(2500, 6000);
          mobil.style.visibility = "hidden";
          raederTempo(0);
        }
      } else if (phase === "halt" && jetzt > naechsterSchuss) {
        if (salve > 0) {
          zielen(); schuss(0, dir); salve--;
          naechsterSchuss = jetzt + zufall(300, 650);
        } else {
          phase = "fahren"; raederTempo(v);
          naechsterFahrschuss = jetzt + zufall(1500, 3000);
        }
      }
      mobil.style.transform = `translateX(${x.toFixed(1)}px)` + (dir < 0 ? " scaleX(-1)" : "");

      // Bälle: Wurf mit Schwerkraft, springen an allen Rändern ab
      if (baelle.length) {
        const w = raum.offsetWidth, h = raum.offsetHeight;
        for (let i = baelle.length - 1; i >= 0; i--) {
          const b = baelle[i];
          b.alt += dt;
          if (b.d < b.ziel) b.d = Math.min(b.ziel, b.d + (b.ziel - b.d) * dt * 6 + dt * 4);
          const r = b.d / 2;
          b.vy += b.g * dt;
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * .82; }
          if (b.x > w - r) { b.x = w - r; b.vx = -Math.abs(b.vx) * .82; }
          if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy) * .8; }
          if (b.y > h - r) {
            b.y = h - r; b.vy = -Math.abs(b.vy) * .72; b.vx *= .9; b.sprung++;
            if (Math.abs(b.vy) < 60) b.vy = 0;
          }
          b.dreh += b.vx * dt / r * 57.3;
          // Nach dem vierten Aufprall oder 9 Sekunden blendet er aus
          if (b.sprung >= 4 && b.ende > b.alt + .6) b.ende = b.alt + .6;
          if (b.alt >= b.ende) { b.el.remove(); baelle.splice(i, 1); continue; }
          const sicht = Math.min(1, (b.ende - b.alt) / .6);
          b.el.style.cssText = `width:${b.d.toFixed(1)}px;height:${b.d.toFixed(1)}px;opacity:${sicht.toFixed(2)};` +
            `transform:translate(${(b.x - r).toFixed(1)}px,${(b.y - r).toFixed(1)}px) rotate(${b.dreh.toFixed(0)}deg)`;
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
