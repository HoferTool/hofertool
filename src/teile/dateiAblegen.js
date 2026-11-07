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
//  KORBWURF (seit 1.447.0, Wunsch Patrick 7. November 2026, nach
//  einem Instagram-Reel: „nur so möglich mit Basketball, wenn man
//  nicht trifft, geht's nicht“; seit 1.448.0 genau wie im Reel, das
//  Patrick als Bildschirmaufnahme schickte: „etwa so, einfach
//  HoferTool-Style“)
//  Über der Stelle zum Ablegen hängt ein helles Korbbrett mit
//  „Datei hier hineinwerfen“, Ring und Netz. Die Datei hängt als
//  Blatt an der Maus, eine gepunktete Kurve zeigt die Flugbahn zum
//  Ring. Nur Loslassen im Ring lädt hoch: das Blatt fällt durchs
//  Netz, „+1“, unten ein Kärtchen mit Name, Grösse und Balken.
//  Daneben prallt es am Ring ab und es passiert nichts. Gilt auch
//  für Stellen mit eigenem Ablegen (Temp, Infoboard, Notizbuch …):
//  ein Fehlwurf wird schon in der Capture-Phase abgefangen, bevor sie
//  ihn sehen. Im Prüfstand nur mit TEST.korb.
// =================================================================
const RING = 104;           // Breite der Korböffnung in Punkten
const KORB_B = 190, KORB_H = 196, RING_Y = 122;  // Lage des Rings im Korb
let ball = null, korbHinten = null, korbVorne = null, bahn = null;
let zug = null;             // { stelle, start, eigen, x, y } Korb dieses Zugs
let letzteMaus = null, verstecken = null, landet = false, neigung = 0;

const korbAn = () => !(window.TEST && !window.TEST.korb);
const ruhig = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Schild auf dem Blatt nach der Art der Datei
function dateiArt(typ, name) {
  const t = String(typ || "").toLowerCase(), n = String(name || "").toLowerCase();
  if (t === "application/pdf" || n.endsWith(".pdf")) return ["PDF", "#e0393e"];
  if (t.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/.test(n)) return ["BILD", "#1f6fd1"];
  if (t.startsWith("video/") || /\.(mp4|mov|webm)$/.test(n)) return ["VIDEO", "#7a4fd0"];
  if (/sheet|excel/.test(t) || /\.(xlsx?|xlsm|csv|ods)$/.test(n)) return ["EXCEL", "#1e8a4c"];
  if (/word/.test(t) || /\.docx?$/.test(n)) return ["WORD", "#2b5fb8"];
  return ["DATEI", "#6b7686"];
}

const BLATT = `<span class="dz-blatt__ecke"></span><i></i><i></i><i></i><b class="dz-blatt__art"></b>`;

function bauen() {
  if (ball) return;
  bahn = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  bahn.setAttribute("class", "dz-bahn");
  bahn.innerHTML = `<path d=""/>`;
  ball = document.createElement("div");
  ball.className = "dz-ball";
  ball.innerHTML = `<div class="dz-blatt">${BLATT}</div><b class="dz-ball__zahl"></b>`;
  korbHinten = document.createElement("div");
  korbHinten.className = "dz-korb dz-korb--hinten";
  korbHinten.innerHTML = `<div class="dz-brett">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <b>Datei hier hineinwerfen</b><span>nur ein Treffer zählt</span><i></i></div>
    <div class="dz-ring-hinten"></div>`;
  korbVorne = document.createElement("div");
  korbVorne.className = "dz-korb dz-korb--vorne";
  korbVorne.innerHTML = `<svg class="dz-netz" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
    <g fill="none" stroke="#9aa3ae" stroke-width="1.3">
      <path d="M2 2 L18 56 M20 2 L30 56 M38 2 L42 56 M50 2 L50 56 M62 2 L58 56 M80 2 L70 56 M98 2 L82 56"/>
      <path d="M18 56 L36 2 M30 56 L50 2 M42 56 L62 2 M58 56 L80 2 M70 56 L98 2"/>
      <path d="M8 20 Q50 28 92 20 M13 38 Q50 46 87 38 M18 56 Q50 60 82 56"/>
    </g></svg><div class="dz-ring"></div><div class="dz-text"></div>`;
  document.body.append(bahn, korbHinten, ball, korbVorne);
}

function ballZeigen(x, y, items) {
  bauen();
  const dx = letzteMaus ? x - letzteMaus.x : 0;
  letzteMaus = { x, y };
  // Das Blatt neigt sich in Zugrichtung und richtet sich wieder auf
  neigung = Math.max(-22, Math.min(22, neigung * 0.7 + dx * 1.6));
  ball.style.transform = `translate(${x - 24}px, ${y - 30}px) rotate(${neigung}deg)`;
  const erste = items[0] || {};
  const [art, farbe] = dateiArt(erste.type, "");
  const s = ball.querySelector(".dz-blatt__art");
  s.textContent = art; s.style.background = farbe;
  ball.lastElementChild.textContent = items.length > 1 ? String(items.length) : "";
  ball.classList.add("dz-an");
  bahnZeichnen(x, y);
}

// Gepunktete Flugbahn von der Maus zum Ring, wie ein Wurf im Bogen
function bahnZeichnen(x, y) {
  if (!bahn) return;
  if (!zug || imKorb(x, y)) { bahn.classList.remove("dz-an"); return; }
  const zx = zug.x, zy = zug.y - 4;
  const hx = (x + zx) / 2, hy = Math.min(y, zy) - Math.max(60, Math.abs(zx - x) * 0.35);
  bahn.firstElementChild.setAttribute("d", `M${x} ${y - 20} Q${hx} ${hy} ${zx} ${zy}`);
  bahn.classList.add("dz-an");
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
  for (const k of [korbHinten, korbVorne]) k.classList.remove("dz-an", "dz-ueber", "dz-nah");
  bahn.classList.remove("dz-an");
}

function allesWeg() {
  if (landet) return;
  zug = null; letzteMaus = null; neigung = 0;
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
  return Math.abs(x - zug.x) <= RING / 2 + 6 && y >= zug.y - 50 && y <= zug.y + 50;
}

function stelleSetzen(stelle, start, eigen) {
  if (zug && zug.stelle === stelle) return;
  const { x, y } = korbLegen(stelle);
  zug = { stelle, start, eigen, x, y };
}

function groesseText(b) {
  if (!(b >= 0)) return "";
  if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + " KB";
  return (b / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
}

// Kärtchen unten wie im Reel: Name, Grösse, Balken läuft voll, Haken
function kaertchen(dateien) {
  if (!dateien.length) return;
  const d = dateien[0];
  const [art, farbe] = dateiArt(d.type, d.name);
  const k = document.createElement("div");
  k.className = "dz-karte";
  const name = dateien.length > 1 ? `${d.name} und ${dateien.length - 1} weitere` : d.name;
  const summe = dateien.reduce((s, x) => s + (x.size || 0), 0);
  k.innerHTML = `<div class="dz-blatt dz-blatt--klein">${BLATT}</div>
    <div class="dz-karte__mitte"><b></b><span>${groesseText(summe)}</span></div>
    <div class="dz-karte__stand"><span>Treffer! Wird übernommen …</span><i><u></u></i></div>
    <div class="dz-karte__haken">✓</div>`;
  k.querySelector(".dz-karte__mitte b").textContent = name;
  const s = k.querySelector(".dz-blatt__art"); s.textContent = art; s.style.background = farbe;
  document.body.appendChild(k);
  requestAnimationFrame(() => k.classList.add("dz-an"));
  setTimeout(() => { k.classList.add("dz-fertig"); k.querySelector(".dz-karte__stand span").textContent = "Im Korb"; }, ruhig() ? 50 : 1100);
  setTimeout(() => k.classList.remove("dz-an"), 3000);
  setTimeout(() => k.remove(), 3500);
}

// Wurf: Bogen vom Loslassen zum Ring, dann durchs Netz oder abprallen
function werfen(x0, y0, treffer, fertig) {
  const z = zug;
  landet = true;
  if (bahn) bahn.classList.remove("dz-an");
  const ende = () => { landet = false; allesWeg(); fertig && fertig(); };
  if (!ball || !z) { ende(); return; }
  const text = korbVorne.querySelector(".dz-text");
  text.textContent = treffer ? "+1" : "Daneben!";
  if (ruhig() || typeof ball.animate !== "function") {
    korbVorne.classList.add(treffer ? "dz-treffer" : "dz-daneben");
    setTimeout(() => { korbVorne.classList.remove("dz-treffer", "dz-daneben"); ende(); }, 700);
    return;
  }
  const p = (x, y, s = 1, w = 0) => `translate(${x - 24}px, ${y - 30}px) rotate(${w}deg) scale(${s})`;
  const hoch = Math.min(y0, z.y) - 80;
  let weg;
  if (treffer) {
    weg = [
      { transform: p(x0, y0, 1, neigung), offset: 0 },
      { transform: p((x0 + z.x) / 2, hoch, .9, 160), offset: .42 },
      { transform: p(z.x, z.y - 14, .62, 330), offset: .7 },
      { transform: p(z.x, z.y + 30, .5, 350), offset: .86 },
      { transform: p(z.x, z.y + 80, .45, 360), opacity: 0, offset: 1 },
    ];
  } else {
    // Prallt am Ring ab und fällt seitlich weg
    const seite = x0 < z.x ? -1 : 1;
    const rx = z.x + seite * (RING / 2), ry = z.y - 12;
    weg = [
      { transform: p(x0, y0, 1, neigung), offset: 0 },
      { transform: p((x0 + rx) / 2, Math.min(y0, ry) - 70, .9, -120), offset: .35 },
      { transform: p(rx, ry - 4, .8, -200), offset: .55 },
      { transform: p(rx + seite * 70, ry - 60, .8, -300), offset: .72 },
      { transform: p(rx + seite * 150, innerHeight + 80, .8, -480), opacity: .9, offset: 1 },
    ];
  }
  const a = ball.animate(weg, { duration: treffer ? 820 : 1050, easing: "cubic-bezier(.35,.1,.45,1)", fill: "forwards" });
  setTimeout(() => {
    korbVorne.classList.add(treffer ? "dz-treffer" : "dz-daneben");
    korbHinten.classList.add(treffer ? "dz-treffer" : "dz-daneben");
  }, treffer ? 570 : 540);
  a.onfinish = () => {
    setTimeout(() => {
      a.cancel();
      for (const k of [korbHinten, korbVorne]) k.classList.remove("dz-treffer", "dz-daneben");
      ende();
    }, treffer ? 350 : 350);
  };
}

window.addEventListener("dragover", (e) => {
  if (!hatDateien(e)) return;
  clearTimeout(verstecken);
  // Ohne neues dragover hat die Maus das Fenster verlassen oder abgebrochen
  verstecken = setTimeout(allesWeg, 260);
  const items = [...(e.dataTransfer.items || [])].filter((i) => i.kind === "file");
  // Sonst öffnet der Browser die Datei und die App ist weg
  if (e.defaultPrevented) {
    markieren(null);
    if (korbAn()) bauen();
    if (korbAn() && !imKorb(e.clientX, e.clientY) && !(zug && zug.eigen && zug.stelle.contains(e.target)))
      stelleSetzen(eigeneStelle(e.target), e.target, true);
  } else {
    e.preventDefault();
    const ziel = zielBeimZiehen(e);
    const gut = ziel && !ziel.passtNicht;
    markieren(gut ? ziel.stelle : null);
    if (korbAn()) bauen();
    // Ein Korb bleibt für den ganzen Zug hängen: jedes Loslassen ist ein
    // Wurf, daneben prallt das Blatt ab
    if (korbAn() && gut && !imKorb(e.clientX, e.clientY)) stelleSetzen(ziel.stelle, e.target, false);
    e.dataTransfer.dropEffect = gut || (korbAn() && zug) ? "copy" : "none";
  }
  if (korbAn()) {
    ballZeigen(e.clientX, e.clientY, items);
    const ueber = imKorb(e.clientX, e.clientY);
    const nah = !!zug && Math.hypot(e.clientX - zug.x, e.clientY - zug.y) < 260;
    for (const k of [korbVorne, korbHinten]) {
      k.classList.toggle("dz-ueber", ueber);
      k.classList.toggle("dz-nah", nah);
    }
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
  const dateien = [...(e.dataTransfer.files || [])];
  werfen(e.clientX, e.clientY, true);
  setTimeout(() => kaertchen(dateien), ruhig() ? 0 : 650);
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
