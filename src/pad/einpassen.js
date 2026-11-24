// =================================================================
//  PAD MODE: AUSWAHLSEITEN OHNE ROLLEN
//  Startbild, Parks, Typen und Maschinen sollen am iPad immer ganz auf
//  den Bildschirm passen (Wunsch Patrick 24. November 2026: „soll
//  überall nicht scrollen müssen“). Reicht der Platz nicht, wird zuerst
//  das Logo kleiner, dann nutzen die Kacheln die ganze Breite (mehr
//  nebeneinander), dann fällt das Logo weg, erst zuletzt werden die
//  Kacheln etwas verkleinert, aber nie unter ZOOM_MIN (seit 1.757.4,
//  Patrick: „die Buttons sind jetzt zu klein“; lieber etwas rollen als
//  winzige Knöpfe). Am Handy rollt das ganze Pad bewusst weiter; dort
//  steht der Bereich nicht über (overflow visible).
// =================================================================

const LOGO_MIN = 44;     // kleiner wird das Logo nicht
const ZOOM_MIN = 0.8;    // kleiner werden die Kacheln nicht (1.755.1 bis 1.757.3: 0.45, zu klein)

function steht(el) { return el.scrollHeight - el.clientHeight; }

function bereichEinpassen(el) {
  const logo = el.querySelector(":scope > .pad__wahllogo, :scope > .pad__logo");
  const kacheln = [...el.children].filter((k) => k !== logo);
  // Zuerst alles zurück, damit ein grösserer Bildschirm wieder grösser zeigt
  if (logo) { logo.style.removeProperty("height"); logo.style.removeProperty("display"); }
  for (const k of kacheln) {
    for (const e of ["zoom", "width", "max-width", "grid-template-columns"]) k.style.removeProperty(e);
  }
  el.style.removeProperty("gap");
  if (steht(el) <= 1) return;

  // 1. Weniger Abstand, Logo kleiner
  el.style.gap = "14px";
  if (logo && steht(el) > 1) {
    const h = logo.getBoundingClientRect().height;
    logo.style.height = Math.max(LOGO_MIN, Math.floor(h - steht(el))) + "px";
  }
  if (steht(el) <= 1) return;

  // 2. Ganze Breite nutzen: mehr Kacheln nebeneinander, gleich gross
  for (const k of kacheln) {
    k.style.maxWidth = "none"; k.style.width = "100%";
    // Raster (Parks): schmalere Spalten zulassen, damit eine Reihe mehr Platz hat
    if (getComputedStyle(k).display === "grid") k.style.gridTemplateColumns = "repeat(auto-fit, minmax(210px, 1fr))";
  }
  if (steht(el) <= 1) return;

  // 3. Logo weg, die Knöpfe sind wichtiger
  if (logo) logo.style.display = "none";
  if (steht(el) <= 1) return;

  // 4. Kacheln gemeinsam verkleinern; die Breite bleibt die volle,
  //    so passen kleinere Kacheln auch mehr nebeneinander
  // Breite in Punkten: Prozente rechnet der Browser mit zoom nicht verlässlich um
  const cs = getComputedStyle(el);
  const breit = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  let zoom = 1;
  for (let i = 0; i < 8 && steht(el) > 1 && zoom > ZOOM_MIN; i++) {
    const hoch = kacheln.reduce((s, k) => s + k.getBoundingClientRect().height, 0);
    if (!hoch) break;
    const ziel = Math.max(ZOOM_MIN, zoom * Math.max(0.5, (hoch - steht(el)) / hoch) - 0.01);
    zoom = Math.min(zoom - 0.02, ziel);
    for (const k of kacheln) {
      k.style.zoom = String(zoom);
      k.style.width = `${Math.floor(breit / zoom)}px`;
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
