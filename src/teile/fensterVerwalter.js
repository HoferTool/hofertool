// =================================================================
//  FENSTERVERWALTER (seit 1.820.0)
//  Wunsch Patrick 25. November 2026: „sämtliche geöffneten Fenster
//  sollen verschiebbar sein, auch ausserhalb vom Test ERP“, „mehrere
//  Fenster gleichzeitig geöffnet“, „oben ein Bereich Fenster, wo ich
//  sehe, welche geöffnet sind“, „Alle schliessen“, „über die
//  Fensterleiste geöffnete Fenster in den Vordergrund holen“.
//
//  Jedes Fenster (.dialog-huelle direkt am Seitenkörper) lässt sich am
//  Titel oder am oberen Rand mit der Maus ziehen. Ein verschobenes
//  Fenster wird „frei“: ohne dunklen Grund, die Seite und andere
//  Fenster dahinter bleiben bedienbar, ein Klick daneben schliesst es
//  nicht mehr. Nicht verschobene Fenster und Rückfragen bleiben wie
//  bisher. Ein Klick in ein Fenster holt es nach vorne, Escape schliesst
//  dann genau dieses zuerst (alt.fensterStapelVorne).
//  Oben in der Mitte die Fensterleiste mit einem Knopf je Fenster und
//  „Alle schliessen“, nur am Computer (ab 780 Punkten) und nicht im Pad.
// =================================================================
import { alt } from "../bruecke.jsx";
import { inEigenesFenster, eigeneFensterListe, eigeneFensterOffen } from "./eigenesFenster.js";

const ordnung = [];
let leiste = null;
let vorne = null;

const istFenster = (n) => n && n.nodeType === 1 && n.classList
  && n.classList.contains("dialog-huelle")
  && !n.classList.contains("dialog-huelle--eigen")
  && n.parentNode === document.body;

// Das eigentliche Fenster in der Hülle
function fensterVon(h) {
  const d = h.querySelector(":scope > .dialog");
  if (d) return d;
  for (const k of h.children) {
    if (k.tagName !== "STYLE" && k.tagName !== "SCRIPT") return k;
  }
  return null;
}

function titelVon(h) {
  const f = fensterVon(h);
  if (!f) return "Fenster";
  const t = f.querySelector(".gf-titel, h1, h2, h3, .dialog__titel, [data-fenstertitel]");
  let text = (t ? t.textContent : "") || h.getAttribute("aria-label") || "";
  text = text.replace(/\s+/g, " ").trim();
  if (!text) text = "Fenster";
  return text.length > 40 ? text.slice(0, 39) + "…" : text;
}

function neuOrdnen() {
  let z = 0;
  ordnung.forEach((h) => {
    z = Math.max(h.__zBasis || 80, z + 1);
    h.style.zIndex = String(z);
  });
}

function aufnehmen(h) {
  if (ordnung.includes(h)) return;
  if (h.__zBasis == null) {
    h.__zBasis = parseInt(getComputedStyle(h).zIndex, 10) || 80;
  }
  ordnung.push(h);
  vorne = h;
  neuOrdnen();
}

function entfernen(h) {
  const i = ordnung.indexOf(h);
  if (i !== -1) ordnung.splice(i, 1);
  if (vorne === h) vorne = ordnung[ordnung.length - 1] || null;
}

export function nachVorne(h) {
  if (!ordnung.includes(h)) return;
  if (ordnung[ordnung.length - 1] !== h) {
    entfernen(h);
    ordnung.push(h);
    neuOrdnen();
  }
  vorne = h;
  if (alt.fensterStapelVorne) alt.fensterStapelVorne(h);
  leisteZeichnen();
}

function freiMachen(h) {
  if (!h.classList.contains("dialog-huelle--frei")) {
    h.classList.add("dialog-huelle--frei");
    leisteZeichnen();
  }
}

// ---------- Ziehen ----------
const NICHT_ZIEHEN = "button, a, input, select, textarea, label, option, [contenteditable=''],"
  + " [contenteditable='true'], .auf-kopf--ziehbar, [data-nicht-ziehen], canvas, video";
const ZIEH_ZONE = ".gf-titel, h1, h2, h3, .dialog__kopfzeile, .dialog__kopf, [data-ziehgriff]";

let zug = null;

function verschiebung(f) {
  const v = (f.dataset.verschoben || "0,0").split(",").map(Number);
  return { x: v[0] || 0, y: v[1] || 0 };
}

function setzen(f, x, y) {
  f.style.transform = (x || y) ? `translate(${x}px, ${y}px)` : "";
  f.dataset.verschoben = `${Math.round(x)},${Math.round(y)}`;
}

document.addEventListener("pointerdown", (e) => {
  const h = e.target.closest && e.target.closest(".dialog-huelle");
  if (!h || !istFenster(h)) return;
  if (!ordnung.includes(h)) aufnehmen(h);
  const f = fensterVon(h);
  if (!f || !f.contains(e.target)) return;
  nachVorne(h);
  if (e.button !== 0) return;
  if (e.target.closest(NICHT_ZIEHEN)) return;
  const r = f.getBoundingClientRect();
  const zone = e.target.closest(ZIEH_ZONE);
  const oben = e.clientY - r.top < 44;
  // Mit dem Finger nur am Titel ziehen, sonst rollt der Inhalt nicht mehr
  // (Patrick 26. November 2026: „auf dem handy … kann nicht verschieben“)
  const touch = e.pointerType === "touch";
  if (touch && !(zone && f.contains(zone))) return;
  if (!(zone && f.contains(zone)) && !oben) return;
  // Fenster über den ganzen Bildschirm lassen sich nicht sinnvoll ziehen
  if (r.width >= innerWidth - 4 && r.height >= innerHeight - 4) return;
  const v = verschiebung(f);
  zug = { h, f, x0: e.clientX, y0: e.clientY, vx: v.x, vy: v.y, r, los: false, pid: e.pointerId };
}, true);

// Über den Rand des Browsers hinaus gezogen: das Fenster zieht in ein
// eigenes Browserfenster um, das man auf jeden Bildschirm stellen kann
// (Wunsch Patrick 26. November 2026: „die geöffneten Fenster auch aus dem
// HoferTool ziehen“). Wie beim Auftragsfenster nur am Computer mit Maus,
// nicht im Pad, im Archiv und für Externe.
const herausMoeglich = () => window.matchMedia("(pointer: fine)").matches
  && !document.body.classList.contains("pad-offen")
  && !(alt.istArchiv && alt.istArchiv())
  && !(alt.istExtern && alt.istExtern())
  && !(alt.isMobil && alt.isMobil());

function zuFuer(h) {
  return () => {
    if (typeof h.__hoferZu === "function") { try { h.__hoferZu(); return; } catch (f) { /* weiter */ } }
    const knopf = h.querySelector("[data-nein], .gf-zu, [data-zu], .dialog__knoepfe .knopf--still");
    if (knopf) knopf.click();
    else if (h.isConnected) h.remove();
  };
}

// Ohne Pointer Capture meldet der Browser keine Bewegung mehr, sobald die Maus
// das Fenster verlässt: der Rand wurde bei schnellem Ziehen nie erreicht
// (Patrick 27. November 2026: „kann die Fenster noch immer nicht aus dem
// HoferTool heraus bewegen“).
function fangLos(z) {
  try { if (z && z.f.hasPointerCapture && z.f.hasPointerCapture(z.pid)) z.f.releasePointerCapture(z.pid); } catch (f) { /* egal */ }
}

function herausziehen(z, e) {
  const { h, f, x0, y0, r } = z;
  fangLos(z);
  zug = null;
  document.body.classList.remove("fenster-zieht");
  const griff = { x: x0 - r.left, y: y0 - r.top };
  setzen(f, 0, 0);
  entfernen(h);
  const ok = inEigenesFenster(h, zuFuer(h), {
    titel: titelVon(h) + " – HoferTool",
    lage: { x: e.screenX - griff.x, y: e.screenY - griff.y - 30 },
  });
  if (!ok) aufnehmen(h);
  leisteZeichnen();
}

document.addEventListener("pointermove", (e) => {
  if (!zug) return;
  const dx = e.clientX - zug.x0, dy = e.clientY - zug.y0;
  if (!zug.los) {
    if (Math.abs(dx) + Math.abs(dy) < 5) return;
    zug.los = true;
    document.body.classList.add("fenster-zieht");
    freiMachen(zug.h);
    try { zug.f.setPointerCapture(zug.pid); } catch (f) { /* egal */ }
  }
  const draussen = e.clientX <= 3 || e.clientY <= 3
    || e.clientX >= innerWidth - 4 || e.clientY >= innerHeight - 4;
  if (draussen && herausMoeglich()) { herausziehen(zug, e); e.preventDefault(); return; }
  // Der Titel bleibt immer erreichbar: oben nicht über den Rand,
  // seitlich und unten mindestens 80 Punkte sichtbar
  const { r } = zug;
  const mx = Math.min(Math.max(dx, 80 - r.right), innerWidth - 80 - r.left);
  const my = Math.min(Math.max(dy, -r.top), innerHeight - 50 - r.top);
  setzen(zug.f, zug.vx + mx, zug.vy + my);
  e.preventDefault();
}, true);

const zugEnde = (e) => {
  // Losgelassen ausserhalb (die letzte Bewegung kam nicht mehr an)
  if (zug && zug.los && e && e.type === "pointerup" && herausMoeglich()
    && (e.clientX < 0 || e.clientY < 0 || e.clientX > innerWidth || e.clientY > innerHeight)) {
    herausziehen(zug, e); return;
  }
  fangLos(zug);
  if (zug && zug.los) {
    document.body.classList.remove("fenster-zieht");
    // Der Klick nach dem Loslassen soll nichts auslösen
    const schlucken = (k) => { k.stopPropagation(); k.preventDefault(); };
    window.addEventListener("click", schlucken, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", schlucken, true), 0);
  }
  zug = null;
  // Das Auftragsfenster zieht selbst; danach ist es ebenso frei
  ordnung.forEach((h) => {
    const f = fensterVon(h);
    if (f && f.dataset.verschoben && f.dataset.verschoben !== "0,0") freiMachen(h);
  });
};
document.addEventListener("pointerup", zugEnde, true);
document.addEventListener("pointercancel", zugEnde, true);

// ---------- Fensterleiste ----------
function leisteSichtbar() {
  if (innerWidth < 780) return false;
  const b = document.body;
  if (b.classList.contains("pad-offen") || b.classList.contains("ib-anzeige")) return false;
  if (document.getElementById("pad")) return false;
  // Blätter über den ganzen Bildschirm (Masse-Blatt der Prüfung) haben oben
  // ihre eigene Leiste, die Fensterleiste läge sonst über deren Knöpfen
  if (document.querySelector("[data-pstblatt]")) return false;
  // Auch Fenster in einem eigenen Browserfenster zählen (Patrick 27. November
  // 2026: „sobald es im eigenen Fenster läuft, verschwindet die Fensterübersicht“)
  return ordnung.length + eigeneFensterListe().length > 0;
}

function schliessen(h) {
  if (!document.body.contains(h)) return;
  if (typeof h.__hoferZu === "function") { h.__hoferZu(); return; }
  const knopf = h.querySelector("[data-nein], .gf-zu, [data-zu], .dialog__knoepfe .knopf--still");
  if (knopf) knopf.click();
  if (document.body.contains(h) && !knopf) h.remove();
}

function aufblitzen(f) {
  f.classList.remove("fenster-blitz");
  void f.offsetWidth;
  f.classList.add("fenster-blitz");
  setTimeout(() => f.classList.remove("fenster-blitz"), 700);
}

let geplant = false;
function leisteZeichnen() {
  if (geplant) return;
  geplant = true;
  requestAnimationFrame(() => { geplant = false; leisteJetzt(); });
}

function leisteJetzt() {
  // Weggefallene austragen
  for (let i = ordnung.length - 1; i >= 0; i--) {
    if (!document.body.contains(ordnung[i]) || !istFenster(ordnung[i])) entfernen(ordnung[i]);
  }
  if (!leisteSichtbar()) {
    if (leiste) { leiste.remove(); leiste = null; }
    return;
  }
  if (!leiste) {
    leiste = document.createElement("div");
    leiste.className = "fensterleiste";
    leiste.setAttribute("data-fensterleiste", "");
    leiste.addEventListener("click", (e) => {
      const alle = e.target.closest("[data-fenster-alle]");
      if (alle) {
        [...ordnung].reverse().forEach(schliessen);
        eigeneFensterListe().forEach((e) => { try { e.schliessen(); } catch (f) { /* schon zu */ } });
        leisteZeichnen();
        return;
      }
      const ext = e.target.closest("[data-fenster-ext]");
      if (ext) {
        const ef = eigeneFensterListe()[Number(ext.dataset.fensterExt)];
        if (ef) { try { ef.w.focus(); } catch (f) { /* gesperrt */ } }
        return;
      }
      const chip = e.target.closest("[data-fenster-nr]");
      if (!chip) return;
      const h = ordnung[Number(chip.dataset.fensterNr)];
      if (!h) return;
      const f = fensterVon(h);
      if (f) {
        const r = f.getBoundingClientRect();
        if (r.bottom < 40 || r.top > innerHeight - 40 || r.right < 40 || r.left > innerWidth - 40) setzen(f, 0, 0);
        aufblitzen(f);
      }
      nachVorne(h);
    });
  }
  if (leiste.parentNode !== document.body || document.body.lastElementChild !== leiste) {
    document.body.appendChild(leiste);
  }
  const html = ordnung.map((h, i) => {
    const t = titelVon(h);
    const aktiv = h === vorne ? " fensterleiste__chip--vorne" : "";
    const frei = h.classList.contains("dialog-huelle--frei") ? "" : " fensterleiste__chip--fest";
    return `<button type="button" class="fensterleiste__chip${aktiv}${frei}" data-fenster-nr="${i}" title="${esc(t)}">`
      + `<span>${esc(t)}</span></button>`;
  }).join("")
    + eigeneFensterListe().map((e, i) => {
      const t = e.titel() || "Fenster";
      return `<button type="button" class="fensterleiste__chip fensterleiste__chip--aussen" data-fenster-ext="${i}" title="${esc(t)} (eigenes Fenster, antippen holt es nach vorne)">`
        + `<span>⧉ ${esc(t)}</span></button>`;
    }).join("")
    + `<button type="button" class="fensterleiste__alle" data-fenster-alle title="Alle Fenster schliessen">✕ Alle schliessen</button>`;
  if (leiste.__html !== html) { leiste.innerHTML = html; leiste.__html = html; }
}

function esc(t) {
  return String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Grosse Fenster (Test ERP, Kalkulation) gehen gleich als eigenes Browserfenster
// auf, nicht erst nach dem Hinausziehen (Wunsch Patrick 27. November 2026:
// „mach von anfang an einen eigenen tab daraus“). Kleine Rückfragen bleiben in
// der App. Sperrt der Browser das Fenster, bleibt es still in der App. Im
// Prüfstand nur mit TEST.eigenesFenster.
const GROSS_SEL = ":scope > .gf, :scope > .erp-fenster--gross, :scope > .kalk-fenster";
function gleichHeraus(h) {
  if (window.TEST && !window.TEST.eigenesFenster) return false;
  if (!herausMoeglich()) return false;
  let gross = null;
  try { gross = h.querySelector(GROSS_SEL); } catch (f) { return false; }
  if (!gross) return false;
  const ok = inEigenesFenster(h, zuFuer(h), { titel: titelVon(h) + " – HoferTool", still: true });
  if (ok) { leisteZeichnen(); return true; }
  return false;
}

// ---------- Beobachten ----------
new MutationObserver((meldungen) => {
  let neu = false;
  meldungen.forEach((m) => {
    m.addedNodes.forEach((n) => {
      if (!istFenster(n)) return;
      if (gleichHeraus(n)) return;
      aufnehmen(n); neu = true;
    });
    m.removedNodes.forEach((n) => { if (ordnung.includes(n)) { entfernen(n); neu = true; } });
  });
  if (neu) leisteZeichnen();
}).observe(document.body, { childList: true });

// Titel kommen in React oft erst etwas später, Grösse ändert sich
setInterval(() => { if (ordnung.length || leiste || eigeneFensterOffen()) leisteJetzt(); }, 1000);
addEventListener("resize", leisteZeichnen);
document.querySelectorAll("body > .dialog-huelle").forEach((h) => { if (istFenster(h)) aufnehmen(h); });
