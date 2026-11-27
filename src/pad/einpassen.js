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

//  Ist Platz übrig, werden die Kacheln seit 1.893.0 grösser, bis sie den
//  freien Platz füllen (Wunsch Patrick 27. November 2026: „diese felder
//  dürfen schon etwas grösser sein“, ohne Rollen). Dafür wird die Zahl
//  der Spalten gewählt, bei der die Kacheln am grössten werden (6
//  Maschinen am PC also 3 + 3 statt 6 kleine in einer Reihe).

const LOGO_MIN = 44;     // kleiner wird das Logo nicht
const ZOOM_MAX = 2.6;    // grösser werden die Kacheln nicht (sonst wirken sie am grossen Bildschirm plump)
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
  if (steht(el) <= 1) { vergroessern(el, kacheln); return; }

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

// Spaltenzahlen, bei denen die letzte Reihe höchstens eine Kachel weniger
// hat (7 Kacheln: 4 + 3 oder 7, nicht 3 + 3 + 1)
function spaltenWahl(n) {
  const r = [];
  for (let c = 1; c <= Math.min(n, 8); c++) {
    const reihen = Math.ceil(n / c);
    if (reihen === 1 || n - (reihen - 1) * c >= c - 1) r.push(c);
  }
  return r;
}

// Freien Platz füllen: je Spaltenzahl den grössten Zoom suchen, der noch
// ohne Rollen passt, und die beste Spaltenzahl nehmen
function vergroessern(el, alle) {
  if (el.classList.contains("pad-geraet")) return; // Geräte-Wahl hat Text und Gruppen
  if (window.innerWidth <= 640 || window.innerHeight <= 500) return; // Handy hat eigene feste Regeln
  const kacheln = alle.filter((k) => k.classList.contains("pad__kacheln"));
  if (!kacheln.length) return;
  const cs = getComputedStyle(el);
  const breit = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
  const plaene = kacheln.map((k) => {
    const knoepfe = [...k.children].filter((b) => b.tagName === "BUTTON");
    if (!knoepfe.length) return null;
    const r = knoepfe[0].getBoundingClientRect();
    const kcs = getComputedStyle(k);
    const luecke = parseFloat(kcs.columnGap) || 0;
    const raster = kcs.display === "grid";
    const untereinander = k.classList.contains("pad__kacheln--einzeln") || kcs.flexDirection === "column";
    return { k, n: knoepfe.length, w: Math.ceil(r.width), luecke, raster, untereinander };
  });
  if (plaene.some((p) => !p)) return;
  const setzen = (p, c, zoom) => {
    const w = c * p.w + (c - 1) * p.luecke;
    p.k.style.maxWidth = "none";
    p.k.style.width = (w + (p.raster ? 0 : 1)) + "px";
    if (p.raster) p.k.style.gridTemplateColumns = `repeat(${c}, ${p.w}px)`;
    p.k.style.zoom = String(zoom);
    return w;
  };
  // Gilt für alle Kachelgruppen der Seite gemeinsam (meist ist es nur eine)
  const versuch = (spalten) => {
    let wmax = 0;
    plaene.forEach((p, i) => { wmax = Math.max(wmax, setzen(p, spalten[i], 1)); });
    let unten = 1, oben = Math.min(ZOOM_MAX, breit / wmax);
    if (oben <= 1) return 1;
    for (let i = 0; i < 9; i++) {
      const mitte = (unten + oben) / 2;
      plaene.forEach((p) => { p.k.style.zoom = String(mitte); });
      if (steht(el) <= 1) unten = mitte; else oben = mitte;
    }
    return unten;
  };
  // Nur die erste Gruppe darf die Spaltenzahl wählen, weitere bleiben wie sie sind
  const p0 = plaene[0];
  const fest = plaene.map((p) => (p.untereinander ? 1 : Math.max(1, Math.round((p.k.getBoundingClientRect().width + p.luecke) / (p.w + p.luecke)))));
  const wahl = p0.untereinander ? [1] : spaltenWahl(p0.n);
  let best = null;
  for (const c of wahl) {
    const sp = [c, ...fest.slice(1)];
    const z = versuch(sp);
    if (!best || z > best.z * 1.01) best = { z, sp };
  }
  if (!best || best.z <= 1.02) {
    for (const p of plaene) for (const e of ["zoom", "width", "max-width", "grid-template-columns"]) p.k.style.removeProperty(e);
    return;
  }
  plaene.forEach((p, i) => setzen(p, best.sp[i], Math.floor(best.z * 100) / 100));
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
