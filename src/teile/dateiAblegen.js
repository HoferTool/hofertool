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

window.addEventListener("dragover", (e) => {
  if (!hatDateien(e)) return;
  // Sonst öffnet der Browser die Datei und die App ist weg
  if (e.defaultPrevented) { markieren(null); return; }
  e.preventDefault();
  const ziel = zielBeimZiehen(e);
  const gut = ziel && !ziel.passtNicht;
  e.dataTransfer.dropEffect = gut ? "copy" : "none";
  markieren(gut ? ziel.stelle : null);
});

window.addEventListener("dragleave", (e) => {
  // Maus hat das Fenster verlassen
  if (!e.relatedTarget) markieren(null);
});

window.addEventListener("drop", (e) => {
  markieren(null);
  if (!hatDateien(e) || e.defaultPrevented) return;
  e.preventDefault();
  const dateien = [...(e.dataTransfer.files || [])];
  if (!dateien.length) return;
  const ziel = zielSuchen(e.target, dateien);
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
