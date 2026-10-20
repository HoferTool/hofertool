// =================================================================
//  WIRKUNG BEIM EIN- UND AUSKLAPPEN DER SEITENLEISTE
//  Wunsch Patrick 20. Oktober 2026: „mehr Emotionen“, „smooth, kein Hin
//  und Her, kein Spiegeleffekt“, „soll jedes Mal abwechseln“, „entscheide
//  dann nachher, welches gut ist“. Späne, Huhn und Eier (1.116.0) waren
//  nichts („mach was Neues“). Darum seit 1.117.0 zwei ruhige Varianten,
//  je Gerät der Reihe nach:
//  - welle:   Der Rand der Leiste wölbt sich beim Ziehen weich wie ein
//             Vorhang und wird beim Anhalten wieder gerade; die Punkte
//             klappen nacheinander wie Karten herein.
//  - schrift: Die Namen bauen sich auf wie auf der Anzeige einer
//             Maschine, Zeichen für Zeichen von links nach rechts.
//  Der echte Text bleibt unangetastet (React gehört er), die laufenden
//  Zeichen stehen nur in data-fx und werden per CSS darübergelegt.
// =================================================================

const ARTEN = ["welle", "schrift"];
let welleSchicht = null, welleBild = 0, schriftBild = 0;

function naechsteArt() {
  let n = 0;
  try { n = (parseInt(localStorage.getItem("hofer.klappFx"), 10) || 0) % ARTEN.length; } catch { /* ohne Speicher */ }
  try { localStorage.setItem("hofer.klappFx", String(n + 1)); } catch { /* ohne Speicher */ }
  return ARTEN[n];
}

// ---------- Welle ----------
// Eine Fläche in der Farbe der Leiste, die ihrem Rand folgt. Wie weit
// sie sich wölbt, hängt davon ab, wie schnell der Rand gerade wandert:
// in voller Fahrt am meisten, beim Anhalten gleitet sie gerade zurück.
function welle(nav) {
  const stil = getComputedStyle(nav);
  const grund = stil.backgroundColor, linie = stil.borderRightColor;
  const kopf = nav.getBoundingClientRect().top;
  const hoehe = innerHeight - kopf;
  const s = document.createElement("div");
  s.className = "kfx-welle";
  s.style.top = kopf + "px";
  s.style.height = hoehe + "px";
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = `<svg width="90" height="${hoehe}" viewBox="0 0 90 ${hoehe}" preserveAspectRatio="none">` +
    `<path class="kfx-welle__flaeche" fill="${grund}"/><path class="kfx-welle__rand" fill="none" stroke="${linie}" stroke-width="1"/></svg>`;
  document.body.appendChild(s);
  welleSchicht = s;
  const flaeche = s.querySelector(".kfx-welle__flaeche"), rand = s.querySelector(".kfx-welle__rand");
  // Die Wölbung sitzt oben, beim Knopf ☰, und läuft nach unten weich aus
  const mitte = hoehe * .22, breite = hoehe * .55;
  let letztX = nav.getBoundingClientRect().right, bogen = 0, ruhe = 0;
  const start = performance.now();
  const schritt = (jetzt) => {
    if (welleSchicht !== s) return;
    const x = nav.getBoundingClientRect().right;
    const tempo = x - letztX; // Pixel je Bild
    letztX = x;
    // Die Wölbung zeigt immer nach aussen: beim Aufziehen eilt die Mitte
    // voraus, beim Zuziehen bleibt sie zurück wie ein Vorhang. Sie folgt
    // weich, ohne Überschwingen.
    bogen += (Math.min(80, Math.abs(tempo) * 6) - bogen) * .25;
    s.style.left = (x - 1) + "px";
    const pkt = [];
    for (let y = 0; y <= hoehe; y += 12) {
      const d = (y - mitte) / breite;
      pkt.push([Math.max(0, bogen * Math.exp(-d * d * 2.2)), y]);
    }
    pkt.push([0, hoehe]);
    const linieD = "M" + pkt.map((p) => p[0].toFixed(1) + "," + p[1]).join(" L");
    rand.setAttribute("d", linieD);
    flaeche.setAttribute("d", "M0,0 L" + pkt.map((p) => p[0].toFixed(1) + "," + p[1]).join(" L") + " L0," + hoehe + " Z");
    ruhe = Math.abs(bogen) < .3 && Math.abs(tempo) < .1 ? ruhe + 1 : 0;
    if (ruhe > 8 || jetzt - start > 2000) { s.remove(); if (welleSchicht === s) welleSchicht = null; return; }
    welleBild = requestAnimationFrame(schritt);
  };
  welleBild = requestAnimationFrame(schritt);
}

// ---------- Maschinenschrift ----------
const ZEICHEN = "0123456789ABCDEFGHKLMNPRSTXZ#%&/+";
function schrift(nav, schmal) {
  if (schmal) return; // beim Zuklappen blenden die Namen nur aus
  const texte = [...nav.querySelectorAll(".nav__punkt .nav__text")];
  const plan = texte.map((el, i) => ({ el, ziel: el.textContent, beginn: 120 + i * 55 }));
  plan.forEach((p) => p.el.setAttribute("data-fx", ""));
  const start = performance.now();
  const schritt = (jetzt) => {
    const t = jetzt - start;
    let fertig = true;
    for (const p of plan) {
      const lauf = t - p.beginn;
      if (lauf < 0) { fertig = false; continue; }
      // Je Zeichen 28 ms bis es steht, davor wechselt es zufällig
      const stehen = Math.floor(lauf / 28);
      if (stehen >= p.ziel.length) { if (p.el.hasAttribute("data-fx")) p.el.removeAttribute("data-fx"); continue; }
      fertig = false;
      let txt = p.ziel.slice(0, stehen);
      for (let k = stehen; k < Math.min(p.ziel.length, stehen + 6); k++) {
        txt += p.ziel[k] === " " ? " " : ZEICHEN[(Math.random() * ZEICHEN.length) | 0];
      }
      p.el.setAttribute("data-fx", txt);
    }
    if (!fertig) schriftBild = requestAnimationFrame(schritt);
  };
  schriftBild = requestAnimationFrame(schritt);
}

function aufraeumen() {
  cancelAnimationFrame(welleBild);
  cancelAnimationFrame(schriftBild);
  if (welleSchicht) { welleSchicht.remove(); welleSchicht = null; }
  document.querySelectorAll(".nav__text[data-fx]").forEach((el) => el.removeAttribute("data-fx"));
}

// schmal = true: die Leiste klappt zu. Gibt die Art zurück, damit die
// CSS-Bewegung der Punkte dazu passt.
export function klappBildchen(schmal) {
  aufraeumen();
  const nav = document.querySelector(".nav");
  if (!nav || matchMedia("(prefers-reduced-motion: reduce)").matches) return "";
  const art = naechsteArt();
  document.body.dataset.klappArt = art;
  if (art === "welle") welle(nav);
  else schrift(nav, schmal);
  return art;
}
