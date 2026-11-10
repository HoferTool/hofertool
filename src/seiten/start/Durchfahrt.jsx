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
    // Nur in der Anzeige des Infoboards bleiben die Bälle liegen
    const fuellen = !!tafel && !!band.closest(".ib-voll");
    const haufen = fuellen ? haufenAnlegen(raum) : null;

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
      if ((haufen ? haufen.fliegt.length > 70 : baelle.length > 40) || !raum.isConnected) return;
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
      const vx = richtung * Math.cos(a) * tempo + tempoMobil * .5, vy = -Math.sin(a) * tempo;
      if (haufen) haufen.neu(x, y, klein, haufen.durchmesser(m.w), vx, vy, g);
      else {
        const el = document.createElement("div");
        el.className = "gm-ball";
        raum.appendChild(el);
        baelle.push({ el, x, y, d: klein, ziel: gross, alt: 0, ende: 9, dreh: 0, sprung: 0, g, vx, vy });
      }
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
          phase = "halt"; salve = haufen ? ganz(6, 11) : ganz(2, 5); naechsterSchuss = jetzt + 450;
          raederTempo(0);
        } else if (jetzt > naechsterFahrschuss) {
          zielen(); schuss(dir * v, dir);
          naechsterFahrschuss = jetzt + (haufen ? zufall(450, 1000) : zufall(1500, 3200));
        }
        if (dir > 0 ? x > breit + 20 : x < -W - 20) {
          phase = "pause"; bis = jetzt + zufall(2500, 6000);
          mobil.style.visibility = "hidden";
          raederTempo(0);
        }
      } else if (phase === "halt" && jetzt > naechsterSchuss) {
        if (salve > 0) {
          zielen(); schuss(0, dir); salve--;
          naechsterSchuss = jetzt + (haufen ? zufall(160, 320) : zufall(300, 650));
        } else {
          phase = "fahren"; raederTempo(v);
          naechsterFahrschuss = jetzt + zufall(1500, 3000);
        }
      }
      mobil.style.transform = `translateX(${x.toFixed(1)}px)` + (dir < 0 ? " scaleX(-1)" : "");

      if (haufen) haufen.schritt(dt);
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

// Ein Tennisball als Bild (Filz mit Verlauf, zwei weisse Nähte, Schatten),
// einmal gezeichnet und danach nur noch kopiert. Rand für den Schatten.
function ballBild(px) {
  const rand = Math.ceil(px * .25), s = px + 2 * rand;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d"), r = px / 2, m = s / 2;
  g.save();
  g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = px * .15; g.shadowOffsetY = px * .07;
  const f = g.createRadialGradient(m - r * .3, m - r * .4, r * .05, m, m, r * 1.05);
  f.addColorStop(0, "#f6fc86"); f.addColorStop(.6, "#d3e12c"); f.addColorStop(1, "#9aab17");
  g.fillStyle = f; g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
  g.restore();
  g.save();
  g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.clip();
  const k = px / 40, o = m - r;
  g.strokeStyle = "#fff"; g.lineWidth = 2.6 * k; g.lineCap = "round";
  g.beginPath(); g.moveTo(o + 6 * k, o + 7 * k); g.bezierCurveTo(o + 16 * k, o + 14 * k, o + 16 * k, o + 26 * k, o + 6 * k, o + 33 * k); g.stroke();
  g.beginPath(); g.moveTo(o + 34 * k, o + 7 * k); g.bezierCurveTo(o + 24 * k, o + 14 * k, o + 24 * k, o + 26 * k, o + 34 * k, o + 33 * k); g.stroke();
  g.restore();
  return { bild: c, faktor: s / px };
}

// Der Haufen in der Anzeige des Infoboards: fliegende Bälle mit
// Schwerkraft und Stössen untereinander; wer zur Ruhe kommt, bleibt für
// immer liegen (wird nur noch angestossen, bewegt sich aber nicht mehr),
// das hält den Stapel ruhig und die Rechnung klein.
function haufenAnlegen(raum) {
  const fest = document.createElement("canvas"), los = document.createElement("canvas");
  fest.className = los.className = "gm-leinwand";
  raum.append(fest, los);
  const gf = fest.getContext("2d"), gl = los.getContext("2d");
  let w = 0, h = 0, q = 1, sprite = null, D = 0, zelle = 1;
  const fliegt = [], gitter = new Map();
  let liegen = 0, raus = 0, voll = false;
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
  const durchmesser = (breite) => Math.max(18, breite * .036);
  const zeichne = (g, b) => {
    const s = b.d * sprite.faktor;
    g.save(); g.translate(b.x, b.y); g.rotate(b.dreh);
    g.drawImage(sprite.bild, -s / 2, -s / 2, s, s);
    g.restore();
  };
  const hinlegen = (b) => {
    const k = schluessel(b.x, b.y);
    const l = gitter.get(k);
    if (l) l.push(b); else gitter.set(k, [b]);
    liegen++;
    zeichne(gf, b);
    // Oben angekommen: ab jetzt läuft es über
    if (b.y - b.d / 2 < D * .35) voll = true;
  };

  const neu = (x, y, d, ziel, vx, vy, g) => {
    if (!vorbereiten()) return;
    if (!D) { D = ziel; zelle = D * 1.05; sprite = ballBild(Math.round(D * q)); }
    // Steckt die Mündung schon im Haufen, kommt der Ball oben auf ihm
    // heraus, statt zwischen liegenden Bällen festzuhängen
    while (y > -D && belegt(x, y)) y -= D * .5;
    fliegt.push({ x, y, d, ziel: D, vx, vy, g, dreh: Math.random() * 6.28, ruhe: 0, alt: 0 });
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
    if (!fliegt.length || !D) return;
    const n = 3, t = dt / n;
    for (let s = 0; s < n; s++) {
      for (let i = fliegt.length - 1; i >= 0; i--) {
        const b = fliegt[i];
        if (b.d < b.ziel) b.d = Math.min(b.ziel, b.d + (b.ziel - b.d) * t * 6 + t * 4);
        const r = b.d / 2;
        b.vy += b.g * t;
        b.x += b.vx * t; b.y += b.vy * t;
        b.auf = false;
        // Wände nur innerhalb der Tafel; ist sie voll, oben offen
        const wand = !voll || b.y > 0;
        if (wand && b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * .5; }
        if (wand && b.x > w - r) { b.x = w - r; b.vx = -Math.abs(b.vx) * .5; }
        if (!voll && b.y < r) { b.y = r; b.vy = Math.abs(b.vy) * .6; }
        if (b.y > h - r) {
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
    // Rollen bremst, auf einer Kuppe kippt er zur Seite, über dem Rand
    // rollt er nach aussen; wer ruhig liegt, bleibt liegen
    for (let i = fliegt.length - 1; i >= 0; i--) {
      const b = fliegt[i];
      if (b.auf) {
        if (voll && b.y < D * .3) b.vx += Math.sign(b.x - w / 2 || 1) * 1500 * dt;
        else {
          b.vx *= Math.max(0, 1 - 2.2 * dt);
          if (Math.abs(b.vx) < 4) b.vx += (Math.random() - .5) * 30;
        }
      }
      b.dreh += b.vx * dt / (b.d / 2);
      // Sicherung: wer nach 20 Sekunden noch nicht liegt, verschwindet
      b.alt += dt;
      if (b.alt > 20) { fliegt.splice(i, 1); continue; }
      // Zur Ruhe gekommen = liegt auf etwas und ist in 0.4 s kaum vom
      // Fleck gekommen (zwischen vielen Bällen zittert er sonst ewig)
      const frei = b.auf && b.d >= b.ziel * .99 && !(voll && b.y < 0);
      if (!frei) { b.ruhe = 0; b.rx = b.x; b.ry = b.y; }
      else {
        if (!b.ruhe) { b.rx = b.x; b.ry = b.y; }
        b.ruhe += dt;
        if (b.ruhe > .4) {
          if (Math.hypot(b.x - b.rx, b.y - b.ry) < D * .15) { fliegt.splice(i, 1); hinlegen(b); continue; }
          b.ruhe = 0;
        }
      }
    }
    gl.clearRect(0, 0, w, h);
    for (const b of fliegt) zeichne(gl, b);
  };

  const haufen = { fliegt, neu, schritt, durchmesser, voll: () => voll, liegen: () => liegen, raus: () => raus };
  // Für den Prüfstand: viele Bälle auf einmal oben einwerfen
  if (window.TEST) window.TEST.tennis = Object.assign(haufen, {
    regen: (anzahl) => {
      if (!vorbereiten()) return;
      for (let i = 0; i < anzahl; i++) neu(w * (.3 + Math.random() * .4), D * (1 + Math.random() * 3), durchmesser(w), durchmesser(w),
        (Math.random() - .5) * 200, 0, h * .6);
    },
  });
  return haufen;
}
