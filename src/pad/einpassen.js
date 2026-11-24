// =================================================================
//  PAD MODE: AUSWAHLSEITEN OHNE ROLLEN
//  Startbild, Parks, Typen und Maschinen sollen am iPad immer ganz auf
//  den Bildschirm passen (Wunsch Patrick 24. November 2026: „soll
//  überall nicht scrollen müssen“). Reicht der Platz nicht, wird zuerst
//  das Logo kleiner, dann werden die Kacheln gemeinsam verkleinert
//  (zoom), bis nichts mehr übersteht. Am Handy rollt das ganze Pad
//  bewusst weiter; dort steht der Bereich nicht über (overflow visible).
// =================================================================

const LOGO_MIN = 44;     // kleiner wird das Logo nicht
const ZOOM_MIN = 0.45;   // kleiner werden die Kacheln nicht

function steht(el) { return el.scrollHeight - el.clientHeight; }

function bereichEinpassen(el) {
  const logo = el.querySelector(":scope > .pad__wahllogo, :scope > .pad__logo");
  const kacheln = [...el.children].filter((k) => k !== logo);
  // Zuerst alles zurück, damit ein grösserer Bildschirm wieder grösser zeigt
  if (logo) logo.style.removeProperty("height");
  for (const k of kacheln) { k.style.removeProperty("zoom"); k.style.removeProperty("width"); }
  el.style.removeProperty("gap");
  if (steht(el) <= 1) return;

  // 1. Weniger Abstand, Logo kleiner
  el.style.gap = "14px";
  if (logo && steht(el) > 1) {
    const h = logo.getBoundingClientRect().height;
    logo.style.height = Math.max(LOGO_MIN, Math.floor(h - steht(el))) + "px";
  }
  if (steht(el) <= 1) return;

  // 2. Kacheln gemeinsam verkleinern; die Breite bleibt die volle,
  //    so passen kleinere Kacheln auch mehr nebeneinander
  let zoom = 1;
  for (let i = 0; i < 8 && steht(el) > 1 && zoom > ZOOM_MIN; i++) {
    const hoch = kacheln.reduce((s, k) => s + k.getBoundingClientRect().height, 0);
    if (!hoch) break;
    const ziel = Math.max(ZOOM_MIN, zoom * Math.max(0.5, (hoch - steht(el)) / hoch) - 0.01);
    zoom = Math.min(zoom - 0.02, ziel);
    for (const k of kacheln) {
      k.style.zoom = String(zoom);
      k.style.width = `min(${Math.round(1180 / zoom)}px, ${(100 / zoom).toFixed(2)}%)`;
    }
  }
}

export function padEinpassen(h) {
  if (!h) return;
  for (const el of h.querySelectorAll(".pad__start, .pad__wahl")) {
    // Nur wo der Bereich selbst rollen würde (nicht am Handy)
    if (getComputedStyle(el).overflowY === "visible") continue;
    bereichEinpassen(el);
  }
}

// Bei jeder Grössenänderung (iPad drehen, Fenster ziehen) neu einpassen
const beobachtet = new WeakSet();
export function padEinpassenBeobachten(h) {
  if (!h || beobachtet.has(h) || typeof ResizeObserver === "undefined") return;
  beobachtet.add(h);
  let warte = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(warte);
    warte = requestAnimationFrame(() => padEinpassen(h));
  }).observe(h);
}
