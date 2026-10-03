// =================================================================
//  EFFEKTE
//  Der Teil der Bewegung, den CSS allein nicht kann. Gestaltung und
//  Begründung stehen in effekte.css.
//
//  - Gleitende Markierung: Navigation und Reiterleisten bekommen eine
//    Markierung, die zum gewählten Punkt gleitet, statt zu springen.
//  - Licht unter der Maus: auf Karten und Knöpfen.
//  - Welle beim Antippen: an der Stelle des Fingers oder der Maus.
//  - Seitenwechsel: Lichtstreifen über die Kopfzeile, Teile der Seite
//    kommen kurz nacheinander.
//
//  Alles hängt an wenigen Ereignissen auf document. Nichts davon läuft
//  auf der Planwand bei jedem Neuzeichnen: Dort gibt es keine Reiter,
//  und der Beobachter schaut nur nach, wenn sich etwas ausserhalb der
//  Tafel ändert.
// =================================================================

const ruhig = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Gleitende Markierung ----------
// Liest die Lage des aktiven Punkts und gibt sie dem Behälter als
// Variablen. Der Behälter zeichnet die Markierung als ::before.
function gleiten(behaelter, aktiv) {
  if (!behaelter) return;
  if (!behaelter.classList.contains("fx-gleit")) behaelter.classList.add("fx-gleit");
  const s = behaelter.style;
  if (!aktiv || !aktiv.offsetParent) {
    s.setProperty("--fx-sicht", "0");
    return;
  }
  // offsetLeft/Top zählen ab dem Behälter, weil er positioniert ist;
  // rollt die Leiste seitlich, wandert die Markierung einfach mit.
  const x = aktiv.offsetLeft, y = aktiv.offsetTop;
  const b = aktiv.offsetWidth, h = aktiv.offsetHeight;
  const alt = behaelter.__fx;
  if (alt && alt.x === x && alt.y === y && alt.b === b && alt.h === h) return;
  behaelter.__fx = { x, y, b, h };
  s.setProperty("--fx-x", x + "px");
  s.setProperty("--fx-y", y + "px");
  s.setProperty("--fx-b", b + "px");
  s.setProperty("--fx-h", h + "px");
  s.setProperty("--fx-sicht", "1");
  // Beim ersten Mal ohne Gleiten an den Platz, erst danach weich
  if (!behaelter.classList.contains("fx-gleit--bereit")) {
    requestAnimationFrame(() => requestAnimationFrame(() => behaelter.classList.add("fx-gleit--bereit")));
  }
}

function markierungenSetzen() {
  const nav = document.querySelector(".nav");
  if (nav) gleiten(nav, nav.querySelector(".nav__punkt.aktiv"));
  if (document.body.classList.contains("pw-seite")) return;
  document.querySelectorAll(".reiter").forEach((r) => {
    if (r.closest("#pad")) return;
    gleiten(r, r.querySelector(":scope > .reiter__knopf.aktiv"));
  });
}

let geplant = false;
function spaeter() {
  if (geplant) return;
  geplant = true;
  requestAnimationFrame(() => { geplant = false; markierungenSetzen(); });
}

// ---------- Licht unter der Maus ----------
const LICHT = ".knopf, .karte--klickbar, .parkwahl__knopf, .moduswahl__knopf, .pad-kachel";
let lichtZiel = null, lichtX = 0, lichtY = 0, lichtGeplant = false;
function lichtSetzen() {
  lichtGeplant = false;
  if (!lichtZiel || !lichtZiel.isConnected) return;
  const r = lichtZiel.getBoundingClientRect();
  lichtZiel.style.setProperty("--fx-mx", (lichtX - r.left) + "px");
  lichtZiel.style.setProperty("--fx-my", (lichtY - r.top) + "px");
}
function mausBewegt(e) {
  if (e.pointerType !== "mouse") return;
  const ziel = e.target.closest ? e.target.closest(LICHT) : null;
  lichtZiel = ziel;
  if (!ziel) return;
  lichtX = e.clientX; lichtY = e.clientY;
  if (!lichtGeplant) { lichtGeplant = true; requestAnimationFrame(lichtSetzen); }
}

// ---------- Welle beim Antippen ----------
const WELLE = ".knopf, .pad-kachel, .pad-knopf, .pad-start, .nav__punkt, .reiter__knopf, "
  + ".parkwahl__knopf, .moduswahl__knopf, .pad-sprung, .kachel, .kopf__suche";
function welle(e) {
  if (e.button !== 0 || ruhig()) return;
  const el = e.target.closest ? e.target.closest(WELLE) : null;
  if (!el || el.disabled || el.closest(".pw-tafel")) return;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  // Nur wo die Welle Platz hat, ohne die Lage des Knopfs zu ändern
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  const groesse = Math.hypot(Math.max(e.clientX - r.left, r.right - e.clientX),
                             Math.max(e.clientY - r.top, r.bottom - e.clientY)) * 2;
  const huelle = document.createElement("span");
  huelle.className = "fx-welle";
  huelle.setAttribute("aria-hidden", "true");
  const kreis = document.createElement("i");
  kreis.style.width = kreis.style.height = groesse + "px";
  kreis.style.left = (e.clientX - r.left - groesse / 2) + "px";
  kreis.style.top = (e.clientY - r.top - groesse / 2) + "px";
  huelle.appendChild(kreis);
  el.appendChild(huelle);
  const a = kreis.animate(
    [{ transform: "scale(0)", opacity: .22 }, { transform: "scale(1)", opacity: 0 }],
    { duration: 620, easing: "cubic-bezier(.16,1,.3,1)" });
  const weg = () => huelle.remove();
  a.onfinish = weg; a.oncancel = weg;
  setTimeout(weg, 900);
}

// ---------- Seitenwechsel ----------
let seiteTakt = 0, glanzTakt = 0;
function seiteGewechselt() {
  const inhalt = document.getElementById("inhalt");
  const kopf = document.querySelector(".kopf");
  if (kopf && !ruhig()) {
    kopf.classList.remove("fx-glanz");
    void kopf.offsetWidth;
    kopf.classList.add("fx-glanz");
    clearTimeout(glanzTakt);
    glanzTakt = setTimeout(() => kopf.classList.remove("fx-glanz"), 1000);
  }
  if (inhalt) {
    inhalt.classList.remove("fx-seite");
    void inhalt.offsetWidth;
    inhalt.classList.add("fx-seite");
    clearTimeout(seiteTakt);
    seiteTakt = setTimeout(() => inhalt.classList.remove("fx-seite"), 900);
  }
  spaeter();
}

// ---------- Beobachter ----------
// Erst wenn das Gerüst steht, gibt es Navigation und #inhalt. Der
// Beobachter auf body schaut nur auf direkte Kinder (Anmeldung ↔
// Gerüst); der auf #inhalt meldet neue Reiter. Auf der Planwand
// reagiert er nicht, damit das Zeichnen der Tafel nichts kostet.
let inhaltBeobachtet = null;
const inhaltWache = new MutationObserver(() => {
  if (!document.body.classList.contains("pw-seite")) spaeter();
});
function geruestPruefen() {
  const inhalt = document.getElementById("inhalt");
  if (inhalt && inhalt !== inhaltBeobachtet) {
    inhaltBeobachtet = inhalt;
    inhaltWache.disconnect();
    inhaltWache.observe(inhalt, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    seiteGewechselt();
  }
  spaeter();
}

function vorschauSchild() {
  if (!/\/vorschau\//.test(location.pathname)) return;
  // main.jsx setzt vielleicht schon ein eigenes Schild; dann nur den Text
  const da = document.querySelector(".vorschau-schild, .fx-schild");
  if (da) { da.textContent = "Vorschau · Effekte"; return; }
  const schild = document.createElement("div");
  schild.className = "fx-schild";
  schild.textContent = "Vorschau · Effekte";
  document.body.appendChild(schild);
}

function starten() {
  // Erst nach main.jsx, das sein Schild nach dem Laden dieser Datei setzt
  setTimeout(vorschauSchild, 0);
  new MutationObserver(geruestPruefen).observe(document.body, { childList: true, subtree: false });
  // Das Gerüst hängt in einem Behälter unter body; einmal genau hinsehen
  new MutationObserver(geruestPruefen).observe(document.getElementById("root") || document.body,
    { childList: true, subtree: false });
  geruestPruefen();
  window.addEventListener("hashchange", seiteGewechselt);
  window.addEventListener("resize", () => {
    document.querySelectorAll(".fx-gleit").forEach((g) => { g.__fx = null; });
    spaeter();
  }, { passive: true });
  // Klicks auf Reiter und Navigation: gleich danach die Markierung
  document.addEventListener("click", spaeter, true);
  document.addEventListener("pointermove", mausBewegt, { passive: true });
  document.addEventListener("pointerdown", welle, { passive: true });
  // Das Ausklappen der Navigation ändert die Breite der Punkte
  document.addEventListener("transitionend", (e) => {
    if (e.target.classList && e.target.classList.contains("nav")) spaeter();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", starten);
else starten();
