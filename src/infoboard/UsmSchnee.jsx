// USM-Kugeln schneien über das Infoboard (seit 1.660.0, Wunsch Patrick 20. November 2026:
// „lass usm kugeln übers infoboard schneien“, Vorbild: verchromte Kugel mit Gewindebohrungen).
// Eine Leinwand ohne Klicks; die Kugel wird einmal als Bild gerechnet (Chrom mit Horizont,
// Glanzpunkt, drei Gewindebohrungen) und danach nur noch gedreht und verkleinert gezeichnet,
// damit der Infoboard-PC kaum rechnet. Die Hülle trägt die Klasse „durchfahrt“, so übergehen
// die MutationObserver (effekte.js, fokusHalten) jede Bewegung, und mit „weniger Bewegung“
// am Gerät ist sie wie der übrige Schnee aus.
import { useEffect, useRef } from "react";

const BILD_R = 96; // Radius der vorgerechneten Kugel in Pixeln

// Eine Bohrung auf der Kugel: Richtung d (Einheitsvektor, z zum Betrachter, y nach unten),
// Öffnungswinkel a. Der Rand ist ein Kreis auf der Kugel, von vorne gesehen eine Ellipse.
function bohrung(g, R, d, a) {
  if (d[2] <= 0.05) return;
  const cx = d[0] * Math.cos(a) * R, cy = d[1] * Math.cos(a) * R;
  const gross = Math.sin(a) * R, klein = gross * d[2];
  const winkel = Math.atan2(d[1], d[0]) + Math.PI / 2; // grosse Achse quer zur Richtung
  const ell = (x, y, s) => { g.beginPath(); g.ellipse(x, y, gross * s, klein * s, winkel, 0, Math.PI * 2); };
  // Fase: heller Ring um die Bohrung
  ell(cx, cy, 1.12);
  g.fillStyle = "rgba(235,235,235,0.9)"; g.fill();
  ell(cx, cy, 1.0);
  const tief = g.createLinearGradient(cx - d[0] * gross, cy - d[1] * gross, cx + d[0] * gross, cy + d[1] * gross);
  tief.addColorStop(0, "#8d8d8d"); tief.addColorStop(0.5, "#3c3c3c"); tief.addColorStop(1, "#101010");
  g.fillStyle = tief; g.fill();
  // Gewindegänge: Ellipsen, die nach innen kleiner werden und gegen die Mitte der Kugel rutschen
  g.save(); ell(cx, cy, 1.0); g.clip();
  for (let i = 0; i < 7; i++) {
    const s = 1 - i * 0.075, sx = -d[0] * gross * i * 0.13, sy = -d[1] * gross * i * 0.13;
    ell(cx + sx, cy + sy, s);
    g.lineWidth = Math.max(1, R * 0.022);
    g.strokeStyle = i % 2 ? "rgba(20,20,20,0.85)" : "rgba(200,200,200,0.75)";
    g.stroke();
  }
  // Grund der Bohrung dunkel
  ell(cx - d[0] * gross * 0.95, cy - d[1] * gross * 0.95, 0.42);
  g.fillStyle = "#050505"; g.fill();
  g.restore();
}

function kugelBild() {
  const R = BILD_R, c = document.createElement("canvas");
  c.width = c.height = R * 2 + 8;
  const g = c.getContext("2d");
  g.translate(c.width / 2, c.height / 2);
  // Chrom: oben heller Himmel, in der Mitte der dunkle Horizont, unten der Boden gespiegelt
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2);
  const chrom = g.createLinearGradient(0, -R, 0, R);
  chrom.addColorStop(0, "#fbfbfb"); chrom.addColorStop(0.36, "#d4d4d4"); chrom.addColorStop(0.5, "#7a7a7a");
  chrom.addColorStop(0.56, "#262626"); chrom.addColorStop(0.74, "#3b3b3b"); chrom.addColorStop(1, "#b9b9b9");
  g.fillStyle = chrom; g.fill();
  // Rundung: Rand dunkler
  const rand = g.createRadialGradient(-R * 0.2, -R * 0.25, R * 0.3, 0, 0, R);
  rand.addColorStop(0, "rgba(255,255,255,0)"); rand.addColorStop(0.8, "rgba(0,0,0,0.08)"); rand.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = rand; g.fill();
  g.save(); g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.clip();
  const n = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
  bohrung(g, R, n(0, -1, 0.42), 0.36);
  bohrung(g, R, n(-0.78, 0.32, 0.55), 0.36);
  bohrung(g, R, n(0.78, 0.32, 0.55), 0.36);
  g.restore();
  // Glanzpunkt oben links
  const glanz = g.createRadialGradient(-R * 0.38, -R * 0.45, 0, -R * 0.38, -R * 0.45, R * 0.42);
  glanz.addColorStop(0, "rgba(255,255,255,0.95)"); glanz.addColorStop(1, "rgba(255,255,255,0)");
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fillStyle = glanz; g.fill();
  return c;
}

function neueKugel(B, H, oben) {
  const tiefe = Math.random(); // 0 = weit hinten, 1 = ganz vorne
  const r = 9 + tiefe * tiefe * 34;
  return {
    x: Math.random() * B,
    y: oben ? -r * 2 - Math.random() * H * 0.3 : Math.random() * H,
    r,
    v: 35 + tiefe * 85,                 // Punkte je Sekunde
    alpha: 0.55 + tiefe * 0.45,
    pendel: 10 + Math.random() * 30, phase: Math.random() * Math.PI * 2, takt: 0.4 + Math.random() * 0.7,
    // nur leicht kippen, sonst kippt auch der Horizont im Chrom
    dreh: (Math.random() - 0.5) * 0.7, wackel: 0.15 + Math.random() * 0.2,
  };
}

export default function UsmSchnee({ anzahl = 34 }) {
  const huelle = useRef(null), leinwand = useRef(null);

  useEffect(() => {
    const el = huelle.current, cv = leinwand.current;
    if (!el || !cv) return undefined;
    const bild = kugelBild();
    const g = cv.getContext("2d");
    let B = 0, H = 0, kugeln = [], zuletzt = 0, lauf = 0;

    const groesse = () => {
      B = el.clientWidth; H = el.clientHeight;
      const r = el.getBoundingClientRect();
      const k = (B ? r.width / B : 1) * (window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(B * k)); cv.height = Math.max(1, Math.round(H * k));
      g.setTransform(k, 0, 0, k, 0, 0);
      if (!kugeln.length && B && H) kugeln = Array.from({ length: anzahl }, () => neueKugel(B, H, false)).sort((a, b) => a.r - b.r);
    };
    groesse();
    const ro = new ResizeObserver(groesse); ro.observe(el);

    const schritt = (t) => {
      lauf = requestAnimationFrame(schritt);
      if (document.hidden) { zuletzt = 0; return; }
      const dt = zuletzt ? Math.min(0.05, (t - zuletzt) / 1000) : 0;
      zuletzt = t;
      g.clearRect(0, 0, B, H);
      for (let i = 0; i < kugeln.length; i++) {
        const k = kugeln[i];
        k.y += k.v * dt; k.phase += k.takt * dt; 
        if (k.y - k.r > H) { kugeln[i] = neueKugel(B, H, true); continue; }
        const x = k.x + Math.sin(k.phase) * k.pendel;
        g.save();
        g.globalAlpha = k.alpha;
        g.translate(x, k.y); g.rotate(k.dreh + Math.sin(k.phase * 1.3) * k.wackel);
        const s = (k.r * 2) * (bild.width / (BILD_R * 2));
        g.drawImage(bild, -s / 2, -s / 2, s, s);
        g.restore();
      }
    };
    lauf = requestAnimationFrame(schritt);
    return () => { cancelAnimationFrame(lauf); ro.disconnect(); };
  }, [anzahl]);

  return (
    <div ref={huelle} className="durchfahrt durchfahrt--tief durchfahrt--himmel usm-schnee" data-ib="usm-schnee" aria-hidden="true">
      <canvas ref={leinwand} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
