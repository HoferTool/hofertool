// =================================================================
//  GÄSTE DER MONSTER-HORDE: HORROR-CLOWN UND MANN IN ZWANGSJACKE
//  Seit 1.326.0 (Wunsch Patrick 1. November 2026: „ES soll auch drin
//  sein, und Hannibal Lector und Pennywise“): eigene, angelehnte Figuren,
//  keine Originalnamen oder Filmbilder.
//  - Ab und zu öffnet sich ein Gully im Boden, ein roter Ballon steigt
//    heraus, dann der Clown mit Halskrause, gelben Augen und blutigem
//    Grinsen; er schnellt noch einmal hoch und verschwindet blitzschnell,
//    der Ballon schwebt davon.
//  - Zwischen zwei Horden kommt manchmal ein eigener Zug: der Clown
//    schlurft mit seinem Ballon hinter einem Zombie-Pfleger her, der
//    einen Mann in Zwangsjacke mit Beissmaske auf einer Sackkarre schiebt.
//  Eigene Datei, damit sie Durchfahrt.jsx kaum berührt; dort nur
//  gaesteStarten, gaeste.zug() in der Horden-Schleife und gaeste.stopp().
// =================================================================
import "./spukGaeste.css";

const zufall = (a, b) => a + Math.random() * (b - a);

// Clown im Raster 80 × 120 wie die anderen Kreaturen, Füsse bei y 118,
// Ballon oberhalb (negative y, die Zeichnung ragt darüber hinaus).
const CLOWN = (mitBallon = true) => `<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg">
  <g class="spuk-bein"><path d="M31 86 L28 110" stroke="#7d828b" stroke-width="12" stroke-linecap="round"/>
    <path d="M22 110 C20 104 30 104 34 108 C38 112 38 118 30 118 L18 118 C14 118 14 112 22 110 Z" fill="#14121a"/></g>
  <g class="spuk-bein spuk-bein--2"><path d="M50 86 L53 110" stroke="#8b9099" stroke-width="12" stroke-linecap="round"/>
    <path d="M48 110 C46 104 56 104 60 106 C66 108 70 114 66 118 L50 118 C44 118 44 112 48 110 Z" fill="#1c1a22"/></g>
  <path class="spuk-arm spuk-arm--2" d="M26 58 L18 72 L21 84" stroke="#7d828b" stroke-width="7" stroke-linecap="round" fill="none"/>
  <circle cx="21" cy="86" r="4.2" fill="#ece8de"/><path d="M18 88 L16 93 M21 90 L21 95 M24 88 L26 93" stroke="#ece8de" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M23 52 C15 64 17 82 24 92 L58 92 C65 82 67 64 59 52 Z" fill="#8b9099"/>
  <path d="M28 60 C26 72 27 82 30 90 M52 60 C55 72 54 82 51 90" stroke="#6c7079" stroke-width="1.4" fill="none"/>
  <path d="M22 90 Q26 85 30 90 Q34 85 38 90 Q42 85 46 90 Q50 85 54 90 Q58 85 60 90 L58 94 L24 94 Z" fill="#dcd7cc"/>
  <circle cx="41" cy="64" r="3.6" fill="#b3121a"/><circle cx="41" cy="76" r="3.6" fill="#b3121a"/>
  <path d="M46 66 C51 66 54 72 50 76 C48 78 47 74 46 72 C45 76 43 74 44 70 Z" fill="#6e0909"/>
  <path d="M30 80 C33 82 33 87 30 88 Z" fill="#6e0909"/>
  <path d="M17 50 Q21 42 26 49 Q30 41 35 48 Q39 40 43 48 Q47 40 51 48 Q56 41 60 49 Q65 42 67 50 Q60 58 42 58 Q24 58 17 50 Z" fill="#e8e4da" stroke="#a5a196" stroke-width=".8"/>
  <path d="M22 52 Q26 49 30 53 M36 53 Q40 49 44 53 M50 53 Q54 49 58 52" stroke="#b8b4a8" stroke-width=".8" fill="none"/>
  <g class="spuk-kopf">
    <path d="M24 22 C10 10 8 30 14 36 C8 40 16 48 26 38 Z" fill="#c8461c"/>
    <path d="M60 22 C74 10 76 30 70 36 C76 40 68 48 58 38 Z" fill="#c8461c"/>
    <path d="M20 26 C14 22 14 32 19 33 M64 26 C70 22 70 32 65 33" stroke="#8e2c10" stroke-width="1.4" fill="none"/>
    <path d="M25 24 C23 0 61 0 59 24 C59 38 52 48 42 49 C32 48 25 38 25 24 Z" fill="#efeadf"/>
    <path d="M32 9 Q42 5 52 9 M34 13 Q42 10 50 13" stroke="#d3ccbc" stroke-width="1" fill="none"/>
    <path d="M34 22 L33 10 M50 22 L51 10" stroke="#b8121a" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M28 18 L37 22 M56 18 L47 22" stroke="#5a0c0c" stroke-width="2.2" stroke-linecap="round"/>
    <ellipse cx="34" cy="25" rx="4" ry="3" fill="#1a0c06"/><ellipse cx="50" cy="25" rx="4" ry="3" fill="#1a0c06"/>
    <circle class="spuk-auge spuk-auge--gelb" cx="32.8" cy="25" r="1.8" fill="#ffd21a"/>
    <circle class="spuk-auge spuk-auge--gelb" cx="51.4" cy="25.3" r="1.8" fill="#ffd21a"/>
    <circle cx="32.8" cy="25" r=".6" fill="#2a0a00"/><circle cx="51.4" cy="25.3" r=".6" fill="#2a0a00"/>
    <path d="M29 37 C26 32 27 29 30 27 M55 37 C58 32 57 29 54 27" stroke="#b8121a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <circle cx="42" cy="31" r="3.3" fill="#d40f1a"/><circle cx="41" cy="30" r="1" fill="#ff8a8a" opacity=".7"/>
    <path d="M28 37 C33 47 51 47 56 37 C52 51 32 51 28 37 Z" fill="#b8121a"/>
    <path d="M31 39 C35 46 49 46 53 39 C49 48 35 48 31 39 Z" fill="#160303"/>
    <path d="M31.5 39.4 L33.2 42.8 L34.8 40.6 L36.4 44 L38 41.3 L39.7 44.6 L41.3 41.5 L43 44.6 L44.6 41.3 L46.3 44 L47.9 40.6 L49.6 42.8 L52.5 39.4 Z" fill="#f2ead2"/>
    <path d="M36 45.5 L37.6 43 L39 46 Z M45 46 L46.4 43 L48 45.5 Z" fill="#f2ead2"/>
    <path d="M38 47 L38 53 C38 55.6 40.6 55.6 40.6 53 L40.6 47 Z" fill="#8e0a0a"/>
    <path class="spuk-tropfen" d="M47 47 L47 51 C47 53 49 53 49 51 L49 47 Z" fill="#8e0a0a"/>
  </g>
  <!-- erhobene Hand mit dem Ballon vor den Haaren -->
  <path d="M56 58 L69 47 L72 37" stroke="#8b9099" stroke-width="7" stroke-linecap="round" fill="none"/>
  <path d="M67 42 Q72 38 77 42 L72 45 Z" fill="#dcd7cc"/>
  <circle cx="72" cy="33" r="4.6" fill="#ece8de"/>
  <path d="M69 31 C68 27 70 25 72 26 M75 31 C76 27 74 25 72 26" stroke="#c9c3b6" stroke-width="1" fill="none"/>
  ${mitBallon ? BALLON_IM_CLOWN : ""}
</svg>`;

const BALLON_IM_CLOWN = `<g class="spuk-ballon">
    <path d="M72 30 C69 14 76 0 72 -16" stroke="#d8d4cc" stroke-width=".7" fill="none"/>
    <ellipse cx="72" cy="-31" rx="11" ry="13.5" fill="#c8101a"/>
    <path d="M70 -18 L74 -18 L72 -15 Z" fill="#a00c14"/>
    <ellipse cx="67.5" cy="-36" rx="3" ry="4.6" fill="#fff" opacity=".3"/>
  </g>`;

// Einzelner Ballon für den Gully, Schnur unten bei y 70
const BALLON = `<svg viewBox="0 0 24 70" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 26 C9 40 15 54 12 70" stroke="#d8d4cc" stroke-width=".7" fill="none"/>
  <ellipse cx="12" cy="13.5" rx="11" ry="13.5" fill="#c8101a"/>
  <path d="M10 26.5 L14 26.5 L12 29 Z" fill="#a00c14"/>
  <ellipse cx="7.5" cy="8.5" rx="3" ry="4.6" fill="#fff" opacity=".3"/>
</svg>`;

// Gully im Boden: dunkles Loch mit Gitter und rotem Schein von unten
const LOCH = `<svg viewBox="0 0 100 24" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="50" cy="12" rx="49" ry="11" fill="#2a2a2e"/>
  <ellipse cx="50" cy="12" rx="44" ry="8.6" fill="#050304"/>
  <ellipse class="spuk-gully__glut" cx="50" cy="12" rx="34" ry="6" fill="#5a0606"/>
  <path d="M10 20 Q50 30 90 20" stroke="#3a3a40" stroke-width="2.4" fill="none"/>
  <path d="M74 15 C78 18 80 22 76 23 C73 22 72 18 74 15 Z" fill="#7d0b0b"/>
</svg>`;

// Zombie-Pfleger (links, Arme vorne an den Griffen) und Sackkarre mit dem
// Mann in Zwangsjacke und Beissmaske. viewBox 0 0 170 130, Boden bei 128.
const KARRE = `<svg viewBox="0 0 170 130" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(0 8)">
    <path class="spuk-arm spuk-arm--2" d="M44 44 L60 50 L74 40" stroke="#bdb9ad" stroke-width="5.5" stroke-linecap="round" fill="none"/>
    <circle cx="74.5" cy="40" r="3" fill="#6f8a5e"/>
    <g class="spuk-bein"><path d="M33 74 L29 97 L31 115" stroke="#23262d" stroke-width="9" stroke-linecap="round" fill="none"/>
      <path d="M24 118 C24 113 34 113 38 117 Z" fill="#111" stroke="#111" stroke-width="2"/></g>
    <g class="spuk-bein spuk-bein--2"><path d="M42 74 L46 96 L45 115" stroke="#2c3038" stroke-width="9" stroke-linecap="round" fill="none"/>
      <path d="M40 118 C40 113 50 113 54 117 Z" fill="#161616" stroke="#161616" stroke-width="2"/></g>
    <path d="M28 38 C23 54 24 76 26 88 L52 88 C55 74 55 52 51 38 C45 33 34 33 28 38 Z" fill="#d6d2c4"/>
    <path d="M30 88 L33 82 L37 88 L41 81 L45 88" fill="#d6d2c4" stroke="#bdb8a8" stroke-width=".8"/>
    <path d="M40 40 L40 86" stroke="#b3ae9e" stroke-width="1"/>
    <path d="M34 48 C40 46 46 52 44 60 C42 66 36 70 32 64 C29 58 30 50 34 48 Z" fill="#7d0b0b" opacity=".9"/>
    <path d="M44 62 L44 74 C44 76 46 76 46 74 L46 62 Z M30 70 C33 72 34 78 31 80 Z" fill="#6a0808"/>
    <path d="M46 42 L62 48 L75 41" stroke="#d6d2c4" stroke-width="6.5" stroke-linecap="round" fill="none"/>
    <circle cx="76" cy="41" r="3.4" fill="#8aa676"/>
    <g class="spuk-kopf">
      <path d="M37 14 C37 3 56 1 58 13 L58 27 C56 33 46 35 40 31 C37 27 37 20 37 14 Z" fill="#8aa676"/>
      <path d="M36 12 C38 2 56 0 59 10 C54 6 44 6 36 12 Z" fill="#cfd8d6"/>
      <path d="M38 12 L37 22 M42 10 L41 19" stroke="#3b3a2c" stroke-width="1.2"/>
      <ellipse cx="52" cy="17" rx="3.4" ry="3" fill="#120c0a"/><circle class="spuk-auge" cx="52.6" cy="17" r="1.6" fill="#ff2a14"/>
      <ellipse cx="45" cy="17.5" rx="2.6" ry="2.6" fill="#120c0a"/><circle class="spuk-auge" cx="45.4" cy="17.5" r="1.2" fill="#ff2a14"/>
      <path d="M44 25 C46 31 54 31 57 25 L56 30 C53 34 47 34 45 30 Z" fill="#1a0505"/>
      <path d="M46 25.5 L47 28 L48.2 25.8 L49.4 28.4 L50.6 25.8 L51.8 28.2 L53 25.6 L54.4 27.6 L55.6 25.4" stroke="#e6dfc5" stroke-width=".9" fill="none"/>
      <path d="M40 28 L36 34 L44 34 Z" fill="#9fb3c2" opacity=".85"/>
      <path d="M49 32 L49 38 C49 40 51 40 51 38 L51 32 Z" fill="#8e0a0a"/>
    </g>
  </g>
  <circle class="spuk-karre__rad" cx="101" cy="119" r="9" fill="#1c1a1a"/>
  <g class="spuk-karre__rad"><circle cx="101" cy="119" r="5.5" fill="#4d4642"/><path d="M101 113.5 V124.5 M95.5 119 H106.5" stroke="#2a2626" stroke-width="1.4"/></g>
  <g transform="translate(61 0) rotate(-12 40 119)">
    <path d="M33 118 L33 48 L28 44" stroke="#3d4046" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M37 120 L37 48 L28 44" stroke="#62656c" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M35 120 L68 120" stroke="#4b4e55" stroke-width="4" stroke-linecap="round"/>
    <path d="M37 78 L42 78 M37 98 L42 98" stroke="#62656c" stroke-width="2.4"/>
    <g transform="translate(6 21) scale(.83)">
      <path d="M43 86 L43 115 M59 86 L59 115" stroke="#26262e" stroke-width="9" stroke-linecap="round"/>
      <ellipse cx="46" cy="117" rx="7" ry="3" fill="#0e0e12"/><ellipse cx="62" cy="117" rx="7" ry="3" fill="#0e0e12"/>
      <path d="M38 38 C35 50 37 78 40 90 L63 90 C66 76 67 50 63 38 C57 33 44 33 38 38 Z" fill="#e3dcc8" stroke="#b9b09a" stroke-width=".8"/>
      <path d="M38 50 C46 60 58 60 66 50" stroke="#d3cbb4" stroke-width="8" fill="none" stroke-linecap="round"/>
      <path d="M37 62 C46 56 56 58 66 64" stroke="#d9d2bc" stroke-width="8" fill="none" stroke-linecap="round"/>
      <path d="M30 55 L68 55 M30 72 L68 72 M32 86 L66 86" stroke="#3b2a1c" stroke-width="3.4"/>
      <rect x="47" y="52.5" width="5" height="5" fill="none" stroke="#b7b7bd" stroke-width="1.2"/>
      <rect x="52" y="69.5" width="5" height="5" fill="none" stroke="#b7b7bd" stroke-width="1.2"/>
      <rect x="44" y="83.5" width="5" height="5" fill="none" stroke="#b7b7bd" stroke-width="1.2"/>
      <path d="M52 40 C57 40 59 46 56 50 C54 52 53 48 52 46 C51 50 48 48 49 44 Z" fill="#7d0b0b"/>
      <path d="M58 60 L58 68 C58 70 60 70 60 68 L60 60 Z M45 76 C49 77 50 82 46 83 Z" fill="#6a0808"/>
      <path d="M46 34 L46 40 L56 40 L56 34" fill="#d1bea4"/>
      <g class="spuk-kopf spuk-kopf--langsam">
        <path d="M41 12 C41 2 59 2 60 12 L60 26 C60 33 55 37 50 37 C45 37 41 33 41 26 Z" fill="#d6c3aa"/>
        <path d="M40 13 C39 0 61 -2 61 11 C56 5 47 5 40 13 Z" fill="#241c16"/>
        <path d="M41 16 C38 16 38 23 41 23" fill="#c9b49a"/>
        <path d="M44 15.5 L49 16.5 M52 16.5 L57 15.5" stroke="#3a2a20" stroke-width="1.3" stroke-linecap="round"/>
        <ellipse cx="47" cy="19.5" rx="2.6" ry="1.9" fill="#1a0e0a"/><ellipse cx="55" cy="19.5" rx="2.6" ry="1.9" fill="#1a0e0a"/>
        <circle class="spuk-auge" cx="47.4" cy="19.5" r="1" fill="#ff3a1a"/><circle class="spuk-auge" cx="55.4" cy="19.5" r="1" fill="#ff3a1a"/>
        <path d="M43 24 L58.5 24 L57.5 35 L44 35 Z" fill="rgba(18,14,12,.6)" stroke="#d2ccbd" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M46.6 24 V35 M50.5 24 V35 M54.3 24 V35" stroke="#d2ccbd" stroke-width="1"/>
        <path d="M45.5 29.6 H56.5" stroke="#d2ccbd" stroke-width="1.3"/>
        <path d="M43 26 L40.5 22 M43.5 32 L40.5 30" stroke="#3b2a1c" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M50 35 L50 41 C50 43.4 52.4 43.4 52.4 41 L52.4 35 Z" fill="#8e0a0a"/>
      </g>
    </g>
  </g>
</svg>`;

export function gaesteStarten(band, erdeHoch) {
  let aus = false;
  const uhren = new Set();
  const warte = (ms) => new Promise((ok) => {
    const t = setTimeout(() => { uhren.delete(t); ok(); }, ms);
    uhren.add(t);
  });
  const wach = async () => { while (!aus && document.hidden) await warte(1000); };
  const boden = () => erdeHoch() * .45;

  // Blutstropfen, der vom Zug auf den Boden fällt und dort verläuft
  const tropfen = (x, y, b) => {
    const d = document.createElement("div");
    d.className = "spuk-blut";
    const g = zufall(3, 5);
    d.style.cssText = `left:${x}px;bottom:${y}px;width:${g}px;height:${g * 1.4}px`;
    band.appendChild(d);
    const fall = Math.max(0, y - b);
    const a = d.animate([
      { transform: "translateY(0)" },
      { transform: `translateY(${fall}px)`, offset: .45, easing: "ease-in" },
      { transform: `translateY(${fall}px) scale(3,.5)`, opacity: 1, offset: .55 },
      { transform: `translateY(${fall}px) scale(3,.5)`, opacity: 0 },
    ], { duration: 2600, fill: "forwards" });
    a.onfinish = () => d.remove();
  };

  // Der Clown steigt aus dem Gully
  const gully = async () => {
    const breit = band.clientWidth, hoch = band.clientHeight;
    if (!breit || !hoch) return;
    const kh = Math.max(34, Math.min(130, hoch * .56)), kw = kh * 80 / 120;
    const b = boden();
    const x = zufall(breit * .08, Math.max(breit * .1, breit * .92 - kw));
    const lochB = kw * 1.35;
    const loch = document.createElement("div");
    loch.className = "spuk-gully__loch";
    loch.style.cssText = `left:${x + kw / 2 - lochB / 2}px;bottom:${b - lochB * .12}px;width:${lochB}px;height:${lochB * .24}px`;
    loch.innerHTML = LOCH;
    const schacht = document.createElement("div");
    schacht.className = "spuk-gully";
    schacht.style.cssText = `left:${x - kw * .2}px;bottom:${b}px;width:${kw * 1.6}px;height:${hoch}px`;
    const clown = document.createElement("div");
    clown.className = "spuk-gully__clown";
    clown.style.cssText = `left:${kw * .2}px;width:${kw}px;height:${kh}px;--schritt:.9s`;
    clown.innerHTML = CLOWN(false);
    const bw = kh * .24, bh = kh * .7;
    const ballon = document.createElement("div");
    ballon.className = "spuk-gully__ballon";
    // Schnur unten genau an der Hand, wenn der Clown oben ist (72 % sichtbar)
    const handHoch = (120 - 33) / 120 * kh - .28 * kh;
    ballon.style.cssText = `left:${kw * .2 + 72 / 80 * kw - bw / 2}px;bottom:${handHoch}px;width:${bw}px;height:${bh}px`;
    ballon.innerHTML = BALLON;
    schacht.appendChild(ballon);
    schacht.appendChild(clown);
    band.appendChild(loch);
    band.appendChild(schacht);

    const T = zufall(8500, 10500);
    loch.animate([{ opacity: 0, transform: "scaleX(.3)" }, { opacity: 1, transform: "scaleX(1)", offset: .06 },
      { opacity: 1, transform: "scaleX(1)", offset: .9 }, { opacity: 0, transform: "scaleX(.3)" }], { duration: T, fill: "forwards" });
    const unten = handHoch + bh + 4;
    const ba = ballon.animate([
      { transform: `translateY(${unten}px)` },
      { transform: `translateY(${unten}px)`, offset: .06 },
      { transform: "translateY(0)", offset: .3, easing: "ease-out" },
      { transform: `translateY(${-kh * .04}px) rotate(-4deg)`, offset: .5 },
      { transform: "translateY(0) rotate(3deg)", offset: .7 },
      { transform: `translateY(${-kh * .1}px)`, offset: .83 },
      { transform: `translateY(${-hoch - bh}px) rotate(-10deg)`, easing: "ease-in" },
    ], { duration: T, fill: "forwards" });
    clown.animate([
      { transform: "translateY(100%)" },
      { transform: "translateY(100%)", offset: .14 },
      { transform: "translateY(28%)", offset: .36, easing: "ease-out" },
      { transform: "translateY(29%) rotate(-3deg)", offset: .5 },
      { transform: "translateY(28%) rotate(4deg)", offset: .66 },
      { transform: "translateY(26%) rotate(0deg)", offset: .74 },
      { transform: "translateY(12%) scale(1.12)", offset: .8, easing: "ease-out" },
      { transform: "translateY(14%) scale(1.12)", offset: .84 },
      { transform: "translateY(100%)", offset: .87, easing: "ease-in" },
      { transform: "translateY(100%)" },
    ], { duration: T, fill: "forwards" });
    // Blut aus dem Mund, solange er oben ist
    const ende = performance.now() + T;
    await warte(T * .4);
    while (!aus && performance.now() < ende - T * .2) {
      tropfen(x + kw * .5 + zufall(-2, 2), b + kh * .45, b - 2);
      await warte(zufall(500, 1100));
    }
    await new Promise((ok) => { ba.onfinish = ok; ba.oncancel = ok; });
    loch.remove();
    schacht.remove();
  };

  (async () => {
    await warte(zufall(7000, 14000));
    while (!aus) {
      await wach();
      if (aus) return;
      await gully();
      await warte(zufall(20000, 40000));
    }
  })();

  // Eigener Zug: Clown mit Ballon hinter dem Pfleger mit der Sackkarre
  const zug = async () => {
    if (aus) return;
    const breit = band.clientWidth, hoch = band.clientHeight;
    if (!breit || !hoch) return;
    const H = Math.max(36, Math.min(140, hoch * .58));
    const kh = H * .9, kw = kh * 80 / 120;
    const b = boden();
    const rechts = Math.random() < .5;
    const zugEl = document.createElement("div");
    zugEl.className = "spuk spuk-gaeste";
    const schritt = zufall(.6, .8).toFixed(2);
    const clown = document.createElement("div");
    clown.className = "spuk-kreatur";
    clown.style.cssText = `left:0;bottom:${-.02 * kh}px;width:${kw}px;height:${kh}px;z-index:3;--schritt:${schritt}s`;
    clown.innerHTML = `<div class="spuk-kreatur__koerper">${CLOWN(true)}</div>`;
    const kH = kh * 130 / 120, kW = kH * 170 / 130;
    const karreX = kw * 1.25;
    const karre = document.createElement("div");
    karre.className = "spuk-karre";
    karre.style.cssText = `left:${karreX}px;bottom:${-2 / 130 * kH}px;width:${kW}px;height:${kH}px;--schritt:${schritt}s`;
    karre.innerHTML = KARRE;
    const lang = karreX + kW + 10;
    zugEl.style.cssText = `width:${lang}px;height:${kH + kh * .4}px;bottom:${b}px`;
    zugEl.appendChild(clown);
    zugEl.appendChild(karre);
    const dauer = zufall(21000, 26000) * Math.max(1, (breit + lang) / 1600);
    const tempo = (breit + lang + 40) / dauer * 1000;
    const umfang = 2 * Math.PI * 9 / 130 * kH;
    zugEl.querySelectorAll(".spuk-karre__rad").forEach((r) => { r.style.animationDuration = (umfang / tempo).toFixed(2) + "s"; });
    band.appendChild(zugEl);
    const spiegel = rechts ? "" : " scaleX(-1)";
    const von = rechts ? -lang - 20 : breit + 20, bis = rechts ? breit + 20 : -lang - 20;
    const a = zugEl.animate([{ transform: `translateX(${von}px)${spiegel}` }, { transform: `translateX(${bis}px)${spiegel}` }],
      { duration: dauer, easing: "linear", fill: "forwards" });
    const imBand = (px) => {
      const p = Math.min(1, (a.currentTime || 0) / dauer);
      return von + (bis - von) * p + (rechts ? px : lang - px);
    };
    (async () => {
      while (!aus && zugEl.isConnected) {
        await warte(zufall(600, 1500));
        if (aus || !zugEl.isConnected) return;
        const wer = Math.random() < .6
          ? { x: karreX + kW * .74, y: kH * .45 }
          : { x: kw * .5, y: kh * .55 };
        const bx = imBand(wer.x);
        if (bx > 0 && bx < breit) tropfen(bx, b + wer.y, b - 2);
      }
    })();
    await new Promise((ok) => { a.onfinish = ok; a.oncancel = ok; });
    zugEl.remove();
  };

  return {
    zug,
    stopp() {
      aus = true;
      uhren.forEach(clearTimeout);
      uhren.clear();
    },
  };
}
