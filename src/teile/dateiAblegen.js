// =================================================================
//  DATEIEN ABLEGEN
//  Überall, wo man eine Datei auswählen kann, darf man sie auch vom
//  Computer hineinziehen (Wunsch Tristan, Patrick 26. Oktober 2026).
//  Statt jede Stelle einzeln umzubauen, sucht dieser eine Helfer beim
//  Ablegen das nächste Dateifeld (<input type="file">) um die Stelle
//  herum und gibt ihm die Dateien, als hätte man sie ausgewählt. Die
//  Stelle selbst merkt keinen Unterschied.
//
//  Knöpfe, die ihr Dateifeld erst beim Antippen bauen (etwa „Bild
//  wählen“ bei den Symbolen), tragen data-ablegen: Ablegen darauf
//  tippt den Knopf an, und das Feld, das er dann öffnen will, bekommt
//  die Dateien statt eines Auswahlfensters.
//  Ein Feld mit data-ablegen="direkt" nimmt nur Dateien, die genau auf
//  seinen Knopf fallen (etwa „Datei ansehen“ neben „Dateien hochladen“).
//
//  Stellen mit eigenem Ablegen (Temp, Notizbuch, Infoboard,
//  Dokumente-Ablage …) rufen preventDefault und bleiben unberührt.
// =================================================================
import { alt } from "../bruecke.jsx";

let warten = null;      // Dateien für einen Knopf mit data-ablegen
let markiert = null;    // gerade hervorgehobene Stelle

const hatDateien = (e) => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files"));

// Passt die Datei zu accept? (".pdf", "image/*", "application/pdf")
function passt(datei, accept) {
  const teile = String(accept || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!teile.length) return true;
  const name = String(datei.name || "").toLowerCase();
  const art = String(datei.type || "").toLowerCase();
  // Beim Ziehen ist der Name noch unbekannt: Endungen gelten dann als passend
  return teile.some((t) => t.startsWith(".") ? (!name || name.endsWith(t))
    : t.endsWith("/*") ? art.startsWith(t.slice(0, -1)) : art === t);
}

// Feld bekommt die Dateien, als wären sie ausgewählt
function fuellen(feld, dateien) {
  const dt = new DataTransfer();
  for (const d of (feld.multiple ? dateien : dateien.slice(0, 1))) dt.items.add(d);
  feld.files = dt.files;
  feld.dispatchEvent(new Event("change", { bubbles: true }));
}

// Oberstes offenes Fenster: Ablegen daneben soll nicht ein Feld der
// Seite darunter treffen
function grenze() {
  const fenster = document.querySelectorAll(".dialog-huelle");
  return fenster.length ? fenster[fenster.length - 1] : document.body;
}

// Wohin gehen die Dateien? { knopf } oder { feld, stelle } oder { passtNicht }
function zielSuchen(start, dateien) {
  if (!(start instanceof Element)) return null;
  const rahmen = grenze();
  if (!rahmen.contains(start)) start = rahmen;
  const knopf = start.closest("[data-ablegen]:not(input)");
  if (knopf && rahmen.contains(knopf) && !knopf.disabled) return { knopf, stelle: knopf };
  let passtNicht = false;
  for (let el = start; el; el = el.parentElement) {
    const felder = [...el.querySelectorAll("input[type=file]:not([disabled])")].filter((f) =>
      f.dataset.ablegen !== "direkt" || (f.closest("label") || f).contains(start));
    if (felder.length) {
      const gute = felder.filter((f) => dateien.every((d) => passt(d, f.accept)));
      // Kamera-Felder (capture) nur, wenn es kein anderes gibt
      const feld = gute.find((f) => !f.hasAttribute("capture")) || gute[0];
      if (feld) return { feld, stelle: el };
      passtNicht = true;
    }
    if (el === rahmen) break;
  }
  return passtNicht ? { passtNicht } : null;
}

function markieren(el) {
  if (markiert === el) return;
  if (markiert) markiert.classList.remove("datei-ablegen-ziel");
  markiert = el || null;
  if (markiert) markiert.classList.add("datei-ablegen-ziel");
}

// Beim Ziehen ist der Inhalt der Dateien noch unbekannt, nur ihre Art;
// darum zählt hier nur, ob es überhaupt ein Feld gibt
function zielBeimZiehen(e) {
  const arten = [...(e.dataTransfer.items || [])].filter((i) => i.kind === "file")
    .map((i) => ({ name: "", type: i.type }));
  // Ohne bekannte Art (etwa .dxf) jedes Feld zulassen
  const probe = arten.every((a) => a.type) ? arten : [];
  return zielSuchen(e.target, probe);
}

// =================================================================
//  BASKETBALL (seit 1.447.0, Wunsch Patrick 7. November 2026, nach
//  einem Instagram-Reel: „nur so möglich mit Basketball, wenn man
//  nicht trifft, geht's nicht“)
//  Beim Ziehen wird die Datei ein Basketball an der Maus, über der
//  Stelle zum Ablegen hängt ein Korb. Nur wer den Ball in den Korb
//  fallen lässt, lädt hoch; daneben prallt er ab und es passiert
//  nichts. Gilt auch für Stellen mit eigenem Ablegen (Temp, Infoboard,
//  Notizbuch …): ein Fehlwurf wird schon in der Capture-Phase
//  abgefangen, bevor sie ihn sehen. Im Prüfstand nur mit TEST.korb.
// =================================================================
const RING = 92;            // Breite der Korböffnung in Punkten
const KORB_B = 150, KORB_H = 170, RING_Y = 96;  // Lage des Rings im Korb
let ball = null, korbHinten = null, korbVorne = null;
let zug = null;             // { stelle, start, eigen, x, y } Korb dieses Zugs
let letzteMaus = null, verstecken = null, landet = false;

const korbAn = () => !(window.TEST && !window.TEST.korb);
const ruhig = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const BALL_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs><radialGradient id="dz-ball-g" cx="38%" cy="32%" r="70%">
    <stop offset="0" stop-color="#ffb066"/><stop offset=".55" stop-color="#f07a1a"/><stop offset="1" stop-color="#b44c08"/>
  </radialGradient></defs>
  <circle cx="32" cy="32" r="30" fill="url(#dz-ball-g)" stroke="#5a2604" stroke-width="2"/>
  <g fill="none" stroke="#3a1802" stroke-width="2.2" stroke-linecap="round">
    <path d="M32 2v60M2 32h60"/><path d="M11 10c9 8 9 36 0 44"/><path d="M53 10c-9 8-9 36 0 44"/>
  </g></svg>`;

function bauen() {
  if (ball) return;
  ball = document.createElement("div");
  ball.className = "dz-ball";
  ball.innerHTML = `<div class="dz-ball__dreh">${BALL_SVG}</div><b class="dz-ball__zahl"></b>`;
  korbHinten = document.createElement("div");
  korbHinten.className = "dz-korb dz-korb--hinten";
  korbHinten.innerHTML = `<div class="dz-brett"><i></i></div><div class="dz-ring-hinten"></div>
    <div class="dz-schild">Hier rein werfen</div>`;
  korbVorne = document.createElement("div");
  korbVorne.className = "dz-korb dz-korb--vorne";
  korbVorne.innerHTML = `<svg class="dz-netz" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
    <g fill="none" stroke="rgba(255,255,255,.95)" stroke-width="1.6">
      <path d="M2 2 L18 56 M20 2 L30 56 M38 2 L42 56 M50 2 L50 56 M62 2 L58 56 M80 2 L70 56 M98 2 L82 56"/>
      <path d="M18 56 L36 2 M30 56 L50 2 M42 56 L62 2 M58 56 L80 2 M70 56 L98 2"/>
      <path d="M2 2 L20 2 M82 56 L64 2 M18 56 L2 2"/>
      <path d="M8 20 Q50 28 92 20 M13 38 Q50 46 87 38"/>
    </g></svg><div class="dz-ring"></div><div class="dz-text"></div>`;
  document.body.append(korbHinten, ball, korbVorne);
}

function ballZeigen(x, y, anzahl) {
  bauen();
  const dx = letzteMaus ? x - letzteMaus.x : 0;
  letzteMaus = { x, y };
  ball.style.transform = `translate(${x - 26}px, ${y - 26}px)`;
  const dreh = ball.firstElementChild;
  dreh.style.transform = `rotate(${((parseFloat(dreh.dataset.w || 0) + dx * 4) % 360)}deg)`;
  dreh.dataset.w = (parseFloat(dreh.dataset.w || 0) + dx * 4) % 360;
  const z = ball.lastElementChild;
  z.textContent = anzahl > 1 ? String(anzahl) : "";
  if (!ball.classList.contains("dz-an")) ball.classList.add("dz-an");
}

// Sichtbarer Teil der Stelle, darin mittig der Korb (ganz im Bild)
function korbLegen(stelle) {
  const r = stelle === document.body
    ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
    : stelle.getBoundingClientRect();
  const l = Math.max(0, r.left), o = Math.max(0, r.top);
  const re = Math.min(innerWidth, r.right), u = Math.min(innerHeight, r.bottom);
  let x = (l + re) / 2, y = (o + u) / 2;
  x = Math.min(Math.max(x, KORB_B / 2 + 8), innerWidth - KORB_B / 2 - 8);
  // Der Ring liegt etwas über der Mitte, das Netz hängt darunter
  y = Math.min(Math.max(y, RING_Y + 8), innerHeight - (KORB_H - RING_Y) - 8);
  for (const k of [korbHinten, korbVorne]) {
    k.style.transform = `translate(${x - KORB_B / 2}px, ${y - RING_Y}px)`;
    k.classList.add("dz-an");
  }
  return { x, y };
}

function korbWeg() {
  if (!korbHinten) return;
  for (const k of [korbHinten, korbVorne]) k.classList.remove("dz-an", "dz-ueber");
}

function allesWeg() {
  if (landet) return;
  zug = null; letzteMaus = null;
  if (ball) ball.classList.remove("dz-an");
  korbWeg();
  markieren(null);
}

// Für Stellen mit eigenem Ablegen: das nächste ausreichend grosse
// Element um die Maus gilt als Ablagefläche
function eigeneStelle(start) {
  const rahmen = grenze();
  for (let el = start instanceof Element ? start : null; el; el = el.parentElement) {
    const r = el.getBoundingClientRect();
    if (r.width >= 200 && r.height >= 160) return el;
    if (el === rahmen) return el;
  }
  return document.body;
}

function imKorb(x, y) {
  if (!zug) return false;
  return Math.abs(x - zug.x) <= RING / 2 + 6 && y >= zug.y - 46 && y <= zug.y + 50;
}

function stelleSetzen(stelle, start, eigen) {
  if (zug && zug.stelle === stelle) return;
  const { x, y } = korbLegen(stelle);
  zug = { stelle, start, eigen, x, y };
}

// Wurf: Bogen vom Loslassen zum Ring, dann durchs Netz oder abprallen
function werfen(x0, y0, treffer, fertig) {
  const z = zug;
  landet = true;
  const ende = () => { landet = false; allesWeg(); fertig && fertig(); };
  if (!ball || !z) { ende(); return; }
  if (ruhig() || typeof ball.animate !== "function") {
    korbVorne.querySelector(".dz-text").textContent = treffer ? "Treffer!" : "Daneben!";
    korbVorne.classList.toggle("dz-treffer", treffer);
    korbVorne.classList.toggle("dz-daneben", !treffer);
    setTimeout(() => { korbVorne.classList.remove("dz-treffer", "dz-daneben"); ende(); }, 700);
    return;
  }
  const p = (x, y, s = 1, w = 0) => `translate(${x - 26}px, ${y - 26}px) scale(${s}) rotate(${w}deg)`;
  const hoch = Math.min(y0, z.y) - 90;
  let bahn;
  if (treffer) {
    bahn = [
      { transform: p(x0, y0), offset: 0 },
      { transform: p((x0 + z.x) / 2, hoch, .95, 120), offset: .45 },
      { transform: p(z.x, z.y - 8, .8, 220), offset: .72 },
      { transform: p(z.x, z.y + 40, .74, 260), offset: .9 },
      { transform: p(z.x, z.y + 90, .7, 290), opacity: 0, offset: 1 },
    ];
  } else {
    // Prallt am Ring ab und fällt seitlich weg
    const seite = x0 < z.x ? -1 : 1;
    const rx = z.x + seite * (RING / 2), ry = z.y - 10;
    bahn = [
      { transform: p(x0, y0), offset: 0 },
      { transform: p((x0 + rx) / 2, Math.min(y0, ry) - 70, .95, -90), offset: .35 },
      { transform: p(rx, ry - 6, .9, -160), offset: .55 },
      { transform: p(rx + seite * 70, ry - 60, .9, -260), offset: .72 },
      { transform: p(rx + seite * 150, innerHeight + 80, .9, -420), opacity: .9, offset: 1 },
    ];
  }
  const a = ball.animate(bahn, { duration: treffer ? 820 : 1050, easing: "cubic-bezier(.35,.1,.45,1)", fill: "forwards" });
  setTimeout(() => {
    korbVorne.querySelector(".dz-text").textContent = treffer ? "Treffer!" : "Daneben!";
    korbVorne.classList.add(treffer ? "dz-treffer" : "dz-daneben");
    korbHinten.classList.add(treffer ? "dz-treffer" : "dz-daneben");
  }, treffer ? 560 : 540);
  a.onfinish = () => {
    setTimeout(() => {
      a.cancel();
      for (const k of [korbHinten, korbVorne]) k.classList.remove("dz-treffer", "dz-daneben");
      ende();
    }, treffer ? 250 : 350);
  };
}

window.addEventListener("dragover", (e) => {
  if (!hatDateien(e)) return;
  clearTimeout(verstecken);
  // Ohne neues dragover hat die Maus das Fenster verlassen oder abgebrochen
  verstecken = setTimeout(allesWeg, 260);
  const anzahl = [...(e.dataTransfer.items || [])].filter((i) => i.kind === "file").length;
  if (korbAn()) ballZeigen(e.clientX, e.clientY, anzahl);
  // Sonst öffnet der Browser die Datei und die App ist weg
  if (e.defaultPrevented) {
    markieren(null);
    if (korbAn() && !imKorb(e.clientX, e.clientY) && !(zug && zug.eigen && zug.stelle.contains(e.target)))
      stelleSetzen(eigeneStelle(e.target), e.target, true);
  } else {
    e.preventDefault();
    const ziel = zielBeimZiehen(e);
    const gut = ziel && !ziel.passtNicht;
    markieren(gut ? ziel.stelle : null);
    // Ein Korb bleibt für den ganzen Zug hängen: jedes Loslassen ist ein
    // Wurf, daneben prallt der Ball ab
    if (korbAn() && gut && !imKorb(e.clientX, e.clientY)) stelleSetzen(ziel.stelle, e.target, false);
    e.dataTransfer.dropEffect = gut || (korbAn() && zug) ? "copy" : "none";
  }
  if (korbAn() && korbVorne) {
    const ueber = imKorb(e.clientX, e.clientY);
    korbVorne.classList.toggle("dz-ueber", ueber);
    korbHinten.classList.toggle("dz-ueber", ueber);
  }
});

window.addEventListener("dragleave", (e) => {
  // Maus hat das Fenster verlassen
  if (!e.relatedTarget) markieren(null);
});

// Zuerst, vor allen eigenen Ablagen: ein Fehlwurf kommt nirgends an
window.addEventListener("drop", (e) => {
  if (!hatDateien(e) || !korbAn()) return;
  clearTimeout(verstecken);
  if (!zug) return;   // kein Korb, dann wie bisher (Meldung unten)
  const treffer = imKorb(e.clientX, e.clientY);
  if (!treffer) {
    e.preventDefault();
    e.stopPropagation();
    markieren(null);
    werfen(e.clientX, e.clientY, false, () =>
      alt.meldung && alt.meldung("Daneben! Nur ein Treffer in den Korb lädt hoch.", "warn"));
    return;
  }
  e.zugStart = zug.start;
  werfen(e.clientX, e.clientY, true);
}, true);

window.addEventListener("drop", (e) => {
  markieren(null);
  if (!hatDateien(e) || e.defaultPrevented) return;
  e.preventDefault();
  const dateien = [...(e.dataTransfer.files || [])];
  if (!dateien.length) return;
  // Nach einem Treffer zählt die Stelle unter dem Korb, nicht die Maus
  const ziel = zielSuchen(e.zugStart || e.target, dateien);
  if (!ziel) { alt.meldung && alt.meldung("Hier kann man keine Datei ablegen.", "warn"); return; }
  if (ziel.passtNicht) { alt.meldung && alt.meldung("Diese Datei passt hier nicht.", "warn"); return; }
  if (ziel.feld) { fuellen(ziel.feld, dateien); return; }
  warten = { dateien, bis: Date.now() + 3000 };
  ziel.knopf.click();
});

window.addEventListener("dragend", () => markieren(null));

// Ein Knopf mit data-ablegen öffnet gleich sein Dateifeld: statt des
// Auswahlfensters bekommt es die abgelegten Dateien
const klickVorher = HTMLInputElement.prototype.click;
HTMLInputElement.prototype.click = function () {
  if (this.type === "file" && warten && Date.now() < warten.bis) {
    const { dateien } = warten;
    warten = null;
    const gute = dateien.filter((d) => passt(d, this.accept));
    if (!gute.length) { alt.meldung && alt.meldung("Diese Datei passt hier nicht.", "warn"); return; }
    queueMicrotask(() => fuellen(this, gute));
    return;
  }
  return klickVorher.call(this);
};
