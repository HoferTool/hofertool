// =================================================================
//  BILDCHEN BEIM EIN- UND AUSKLAPPEN DER SEITENLEISTE
//  Wunsch Patrick 20. Oktober 2026: „baue was mit Spänen und Hühnern,
//  Eiern ein, soll jedes Mal abwechseln“, „entscheide dann nachher,
//  welches gut ist“. Darum laufen die drei der Reihe nach, je Gerät
//  gezählt: Späne fliegen vom Rand, ein Huhn rennt mit und legt ein Ei,
//  Eier kullern herunter. Alles liegt in einer Schicht über der Seite,
//  fängt keine Klicks und ist nach gut zwei Sekunden wieder weg.
// =================================================================

const ARTEN = ["spaene", "huhn", "eier"];
let schicht = null, uhr = 0;

function naechsteArt() {
  let n = 0;
  try { n = (parseInt(localStorage.getItem("hofer.klappFx"), 10) || 0) % ARTEN.length; } catch { /* ohne Speicher */ }
  try { localStorage.setItem("hofer.klappFx", String(n + 1)); } catch { /* ohne Speicher */ }
  return ARTEN[n];
}

const zufall = (a, b) => a + Math.random() * (b - a);

// Ein gerollter Span als flache Wendel, wie er von der Drehbank kommt
function spanPfad() {
  const pkt = [];
  const runden = zufall(1.6, 2.6), dicht = zufall(.9, 1.3);
  for (let t = 0; t <= runden * Math.PI * 2; t += .25) {
    const r = 1.5 + dicht * t;
    pkt.push((r * Math.cos(t)).toFixed(1) + "," + (r * Math.sin(t) * .62 + t * .9).toFixed(1));
  }
  return "M" + pkt.join(" L");
}

// Stahl, Messing und Kupfer, wie in der Werkstatt
const SPAN_FARBEN = [["#f4f7fb", "#8d99a8", "#d9dfe6"], ["#ffe9a6", "#b8892b", "#f1cf6b"], ["#ffc9a6", "#a8582c", "#e59368"]];

function spaene(s, x0, x1, hoehe) {
  let svg = '<svg width="0" height="0" style="position:absolute"><defs>';
  SPAN_FARBEN.forEach((f, i) => {
    svg += `<linearGradient id="kfx-span${i}" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${f[0]}"/><stop offset=".5" stop-color="${f[1]}"/><stop offset="1" stop-color="${f[2]}"/></linearGradient>`;
  });
  s.insertAdjacentHTML("beforeend", svg + "</defs></svg>");
  const richtung = x1 > x0 ? 1 : -1;
  for (let i = 0; i < 22; i++) {
    const anteil = i / 22;
    const span = document.createElement("div");
    span.className = "kfx-span";
    // Der Span löst sich dort, wo der Rand gerade ist
    span.style.left = (x0 + (x1 - x0) * Math.min(1, anteil * 1.3)) + "px";
    span.style.top = zufall(.08, .8) * hoehe + "px";
    span.style.setProperty("--warte", (anteil * 420) + "ms");
    span.style.setProperty("--dx", (richtung * zufall(40, 190)) + "px");
    span.style.setProperty("--hoch", -zufall(20, 90) + "px");
    span.style.setProperty("--fall", zufall(120, 320) + "px");
    span.style.setProperty("--dreh", (zufall(240, 720) * (Math.random() < .5 ? -1 : 1)) + "deg");
    const g = Math.floor(Math.random() * 10) < 6 ? 0 : (Math.random() < .6 ? 1 : 2);
    const gross = zufall(.9, 1.5);
    span.innerHTML = `<div class="kfx-span__y"><svg class="kfx-span__bild" viewBox="-12 -10 24 26" ` +
      `width="${(22 * gross).toFixed(0)}" height="${(24 * gross).toFixed(0)}"><path d="${spanPfad()}" fill="none" ` +
      `stroke="url(#kfx-span${g})" stroke-width="1.7" stroke-linecap="round"/></svg></div>`;
    s.appendChild(span);
  }
}

const HUHN = `<svg viewBox="0 0 64 60" width="86" height="80" class="kfx-huhn__bild">
  <g class="kfx-huhn__bein kfx-huhn__bein--a"><path d="M27 44 L25 55 M25 55 l-5 2 M25 55 l3 2" stroke="#e08a1e" stroke-width="2.6" stroke-linecap="round" fill="none"/></g>
  <g class="kfx-huhn__bein kfx-huhn__bein--b"><path d="M36 44 L38 55 M38 55 l-4 2 M38 55 l4 2" stroke="#e08a1e" stroke-width="2.6" stroke-linecap="round" fill="none"/></g>
  <path d="M10 26 C2 18 4 10 9 12 C10 6 16 8 15 14 Z" fill="#f4f1ea" stroke="#c9c2b3" stroke-width="1.2"/>
  <ellipse cx="30" cy="32" rx="20" ry="14" fill="#ffffff" stroke="#c9c2b3" stroke-width="1.4"/>
  <path d="M24 32 C30 26 38 28 40 34 C34 38 28 38 24 32 Z" fill="#ece6d9"/>
  <circle cx="46" cy="18" r="9" fill="#ffffff" stroke="#c9c2b3" stroke-width="1.4"/>
  <path d="M40 10 C41 4 45 5 45 8 C46 3 50 4 49 9 C52 6 54 9 51 12 Z" fill="#e5322d"/>
  <path d="M54 17 L62 20 L54 22 Z" fill="#f2a71b"/>
  <path d="M51 24 C53 28 49 30 48 26 Z" fill="#e5322d"/>
  <circle cx="49" cy="16" r="1.8" fill="#1b1b1b"/>
</svg>`;

function huhn(s, x0, x1, hoehe) {
  const richtung = x1 > x0 ? 1 : -1;
  const start = richtung > 0 ? x0 - 40 : x0 + 10;
  const ziel = richtung > 0 ? x1 + 30 : x1 - 90;
  const unten = hoehe - 94;
  const h = document.createElement("div");
  h.className = "kfx-huhn" + (richtung < 0 ? " kfx-huhn--links" : "");
  h.style.left = start + "px";
  h.style.top = unten + "px";
  h.style.setProperty("--weg", (ziel - start) + "px");
  h.innerHTML = `<div class="kfx-huhn__lauf">${HUHN}</div><div class="kfx-gack">Gack!</div>`;
  s.appendChild(h);
  // Das Ei bleibt dort liegen, wo das Huhn auf halbem Weg war
  const ei = document.createElement("div");
  ei.className = "kfx-ei kfx-ei--gelegt";
  ei.style.left = (start + (ziel - start) * .55 + 18) + "px";
  ei.style.top = (unten + 50) + "px";
  s.appendChild(ei);
}

function eier(s, x0, x1, hoehe) {
  const links = Math.min(x0, x1), rechts = Math.max(x0, x1);
  const n = 6, gold = Math.floor(Math.random() * 8);
  for (let i = 0; i < n; i++) {
    const ei = document.createElement("div");
    ei.className = "kfx-ei kfx-ei--faellt" + (i === gold ? " kfx-ei--gold" : "");
    ei.style.left = (links + 8 + (rechts - links - 4) * (i + .5) / n + zufall(-8, 8)) + "px";
    ei.style.top = "-40px";
    ei.style.setProperty("--boden", (hoehe - 36 + 40 - zufall(0, 10)) + "px");
    ei.style.setProperty("--warte", (i * 110 + zufall(0, 60)) + "ms");
    ei.style.setProperty("--roll", (zufall(-30, 30)) + "px");
    s.appendChild(ei);
  }
}

// schmal = true: die Leiste klappt zu
export function klappBildchen(schmal) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (schicht) { schicht.remove(); clearTimeout(uhr); }
  const kopf = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kopfhoehe")) ||
    (document.querySelector(".kopf")?.offsetHeight ?? 56);
  const hoehe = innerHeight - kopf;
  schicht = document.createElement("div");
  schicht.className = "kfx";
  schicht.style.top = kopf + "px";
  schicht.setAttribute("aria-hidden", "true");
  const x0 = schmal ? 208 : 62, x1 = schmal ? 62 : 208;
  const art = naechsteArt();
  schicht.dataset.art = art;
  ({ spaene, huhn, eier })[art](schicht, x0, x1, hoehe);
  document.body.appendChild(schicht);
  const weg = schicht;
  uhr = setTimeout(() => { weg.remove(); if (schicht === weg) schicht = null; }, 2800);
}
