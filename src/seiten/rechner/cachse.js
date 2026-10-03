// =================================================================
//  C-ACHSE, POLARINTERPOLATION (Fanuc G12.1 / G13.1): Rechnen
//  Vierkant, Sechskant, Rechteck und Torx auf der Drehmaschine
//  fräsen. Gerechnet wird die Bahn der Fräsermitte — mit Polar-
//  interpolation ist die Schneidenradiuskorrektur meist gesperrt.
//  Alles hier sind reine Rechnungen auf den Angaben c.
// =================================================================
import { kopfZeilen, fussZeilen } from "./kopf.jsx";

export const CACHSE_VORGABE = {
  form: "vierkant",
  sw: 17,            // Schlüsselweite
  breite: 20,        // Rechteck
  hoehe: 12,
  torxA: 9.5,        // Torx aussen über die Spitzen
  torxB: 7.9,        // Torx über die Täler
  eckR: 0.4,         // Eckenradius
  fraeser: 8,        // Fräserdurchmesser
  tiefeZ: 6,         // Frästiefe in Z
  zustellung: 1.5,   // je Schnitt
  vorschub: 60,      // mm/min
  drehzahl: 2000,    // Fräser
  sicher: 2,         // Sicherheitsabstand
  zStart: 0,         // Stirnfläche
  richtung: "gleich",
};

// ---------- Geometrie ----------

// Punkte der Fräsermitte für ein regelmässiges Vieleck mit
// Schlüsselweite sw, n Ecken und Eckenradius rc, aussen gefräst.
function vieleck(n, sw, rc, rFraes) {
  const a = sw / 2;                      // Abstand Mitte zur Fläche
  const halb = Math.PI / n;
  // Mitte des Eckenradius, auf der Winkelhalbierenden
  const mEck = Math.max(0, (a - rc)) / Math.cos(halb);
  const stuecke = [];
  for (let i = 0; i < n; i++) {
    const w = (2 * Math.PI * i) / n + halb;   // Richtung zur Ecke
    stuecke.push({ art: "ecke", cx: mEck * Math.cos(w), cy: mEck * Math.sin(w), r: rc + rFraes });
  }
  return { stuecke, aussen: a + rFraes };
}

// Dasselbe für ein Rechteck, gegen den Uhrzeigersinn ab rechts oben
function rechteck(b, h, rc, rFraes) {
  const x = b / 2, y = h / 2;
  const stuecke = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => ({
    art: "ecke", cx: sx * Math.max(0, x - rc), cy: sy * Math.max(0, y - rc), r: rc + rFraes,
  }));
  return { stuecke, aussen: Math.hypot(x, y) + rFraes };
}

// Aus den Eckenkreisen die Bahn bauen: Tangente, Bogen, Tangente …
export function cachseBahn(c) {
  const rF = c.fraeser / 2;
  const rc = Math.max(0, c.eckR);
  let g;
  if (c.form === "vierkant") g = vieleck(4, c.sw, rc, rF);
  else if (c.form === "sechskant") g = vieleck(6, c.sw, rc, rF);
  else if (c.form === "rechteck") g = rechteck(c.breite, c.hoehe, rc, rF);
  else return torxBahn(c);

  const k = g.stuecke;
  const bahn = [];
  for (let i = 0; i < k.length; i++) {
    const a = k[i], b = k[(i + 1) % k.length];
    // Gemeinsame äussere Tangente zweier gleich grosser Kreise:
    // die Verbindung der Mitten, um den Radius nach aussen versetzt
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    const laenge = Math.hypot(dx, dy) || 1;
    // Nach aussen zeigt die Normale, die vom Mittelpunkt wegweist
    let nx = -dy / laenge, ny = dx / laenge;
    if (nx * (a.cx + b.cx) + ny * (a.cy + b.cy) < 0) { nx = -nx; ny = -ny; }
    bahn.push({ art: "gerade", von: [a.cx + nx * a.r, a.cy + ny * a.r], bis: [b.cx + nx * b.r, b.cy + ny * b.r] });
    bahn.push({ art: "bogen", mitte: [b.cx, b.cy], r: b.r });
  }
  return { bahn, aussen: g.aussen };
}

// Torx nur angenähert: sechs Lappen als weiche Kurve zwischen dem
// Kreis über die Spitzen und dem über die Täler. Kein Ersatz für
// eine geprüfte Lehre.
function torxBahn(c) {
  const rF = c.fraeser / 2;
  const gross = c.torxA / 2, klein = c.torxB / 2;
  const mitte = (gross + klein) / 2, welle = (gross - klein) / 2;
  const punkte = [];
  const schritte = 360;
  for (let i = 0; i <= schritte; i++) {
    const w = (2 * Math.PI * i) / schritte;
    const r = mitte + welle * Math.cos(6 * w);
    // Ableitung für die Normale, damit der Fräser sauber versetzt wird
    const dr = -6 * welle * Math.sin(6 * w);
    const px = r * Math.cos(w), py = r * Math.sin(w);
    const tx = dr * Math.cos(w) - r * Math.sin(w);
    const ty = dr * Math.sin(w) + r * Math.cos(w);
    const tl = Math.hypot(tx, ty) || 1;
    punkte.push([px + (ty / tl) * rF, py - (tx / tl) * rF]);
  }
  return { bahn: [{ art: "punkte", punkte }], aussen: gross + rF };
}

// Passt der Fräser überhaupt in die engste Innenecke? Bei zu grossem
// Werkzeug überschneidet sich die Bahn und es entstehen Schleifen,
// die Material wegnehmen würden, das stehen bleiben soll.
export function cachsePasst(c) {
  const rF = c.fraeser / 2;
  if (c.form === "torx") {
    const gross = c.torxA / 2, klein = c.torxB / 2;
    const m = (gross + klein) / 2, welle = (gross - klein) / 2;
    let engster = Infinity;
    for (let i = 0; i <= 360; i++) {
      const w = (Math.PI * i) / 180;
      const r = m + welle * Math.cos(6 * w);
      const r1 = -6 * welle * Math.sin(6 * w);
      const r2 = -36 * welle * Math.cos(6 * w);
      const oben = Math.pow(r * r + r1 * r1, 1.5);
      const unten = r * r + 2 * r1 * r1 - r * r2;
      if (unten > 0) engster = Math.min(engster, oben / unten);
    }
    if (rF > engster) {
      return { ok: false,
        text: "Der Fräser ist zu gross für die Täler. Dort sitzt ein Radius von "
          + engster.toFixed(2) + " mm, der Fräserradius misst " + rF.toFixed(2)
          + " mm. Höchstens Ø" + (engster * 2).toFixed(1)
          + " mm verwenden, sonst schneidet er die Lappen ab." };
    }
    return { ok: true };
  }
  const kurz = c.form === "rechteck" ? Math.min(c.breite, c.hoehe) : c.sw;
  if (c.fraeser > kurz) {
    return { ok: false,
      text: "Der Fräser ist breiter als die kürzeste Seite (" + kurz
        + " mm). Das geht nicht sauber — kleineres Werkzeug wählen." };
  }
  return { ok: true };
}

// ---------- G-Code ----------

export function cachseGcode(c) {
  const { bahn, aussen } = cachseBahn(c);
  const z = [];
  const f = c.vorschub;
  const anfahrt = aussen + c.sicher;
  const gegen = c.richtung === "gegen";

  z.push("( C-ACHSE " + c.form.toUpperCase() + " )");
  kopfZeilen().forEach((x) => z.push(x));
  z.push("( Fraeser D" + c.fraeser.toFixed(2) + "  Bahn = Fraesermitte, keine Radiuskorrektur )");
  // Steht ein eigener Vorspann da, gilt der — sonst wäre M3 auf der
  // Hauptspindel und damit auf einer Langdrehmaschine falsch.
  if (!kopfZeilen().length) z.push("M" + (gegen ? "4" : "3") + "S" + Math.round(c.drehzahl) + "  ( Fraeser )");
  z.push("G0X" + (anfahrt * 2).toFixed(3) + "C0.");
  z.push("G0Z" + (c.zStart + c.sicher).toFixed(3));
  z.push("G12.1  ( Polarinterpolation ein )");

  const schnitte = Math.max(1, Math.ceil(c.tiefeZ / Math.max(0.1, c.zustellung)));
  for (let s = 1; s <= schnitte; s++) {
    const tiefe = Math.min(c.tiefeZ, s * c.zustellung);
    z.push("( Schnitt " + s + " von " + schnitte + ", Z-" + tiefe.toFixed(2) + " )");
    z.push("G0Z" + (c.zStart - tiefe).toFixed(3));

    if (bahn[0].art === "punkte") {
      const p = bahn[0].punkte;
      z.push("G0X" + (p[0][0] * 2).toFixed(3) + "C" + p[0][1].toFixed(3));
      p.slice(1).forEach((q) => z.push("G1X" + (q[0] * 2).toFixed(3) + "C" + q[1].toFixed(3) + "F" + f));
    } else {
      const erst = bahn[0];
      z.push("G0X" + (erst.von[0] * 2).toFixed(3) + "C" + erst.von[1].toFixed(3));
      bahn.forEach((st, i) => {
        if (st.art === "gerade") {
          z.push("G1X" + (st.bis[0] * 2).toFixed(3) + "C" + st.bis[1].toFixed(3) + (i === 0 ? "F" + f : ""));
        } else {
          const naechste = bahn[(i + 1) % bahn.length];
          // Aussenecke: die Fräsermitte fährt einen Bogen um die Ecke
          if (naechste.art === "gerade") {
            z.push("G3X" + (naechste.von[0] * 2).toFixed(3) + "C" + naechste.von[1].toFixed(3) + "R" + st.r.toFixed(3));
          }
        }
      });
    }
  }

  z.push("G0X" + (anfahrt * 2).toFixed(3));
  z.push("G13.1  ( Polarinterpolation aus )");
  z.push("G0Z" + (c.zStart + c.sicher + 5).toFixed(3));
  fussZeilen().forEach((x) => z.push(x));
  if (!fussZeilen().length) z.push("M5");
  return z.join("\n");
}

// ---------- Für die Zeichnung ----------

// Die Bahn als durchgehende Punktfolge — daraus lässt sich der
// Fräser Schritt für Schritt durchschieben.
export function cachsePunkte(c) {
  const { bahn } = cachseBahn(c);
  if (!bahn.length) return [];
  if (bahn[0].art === "punkte") return bahn[0].punkte.slice();
  const punkte = [];
  bahn.forEach((st, i) => {
    if (st.art === "gerade") { punkte.push(st.von, st.bis); return; }
    // Aussenecke: den Bogen in kleine Schritte zerlegen
    const vorher = punkte[punkte.length - 1];
    const naechste = bahn[(i + 1) % bahn.length];
    const nach = naechste.art === "gerade" ? naechste.von : null;
    if (!vorher || !nach) return;
    const w1 = Math.atan2(vorher[1] - st.mitte[1], vorher[0] - st.mitte[0]);
    let w2 = Math.atan2(nach[1] - st.mitte[1], nach[0] - st.mitte[0]);
    while (w2 < w1) w2 += 2 * Math.PI;
    const n = Math.max(3, Math.round(((w2 - w1) * 180) / Math.PI / 6));
    for (let k = 1; k <= n; k++) {
      const w = w1 + ((w2 - w1) * k) / n;
      punkte.push([st.mitte[0] + st.r * Math.cos(w), st.mitte[1] + st.r * Math.sin(w)]);
    }
  });
  return punkte;
}

// Umriss des fertigen Teils, also ohne Fräserradius
export function cachseTeil(c) {
  if (c.form === "vierkant" || c.form === "sechskant") {
    const n = c.form === "vierkant" ? 4 : 6;
    const a = c.sw / 2, halb = Math.PI / n;
    const rEck = a / Math.cos(halb);
    const ecken = [];
    for (let i = 0; i < n; i++) {
      const w = (2 * Math.PI * i) / n + halb;
      ecken.push([rEck * Math.cos(w), rEck * Math.sin(w)]);
    }
    return { geschlossen: true, punkte: ecken };
  }
  if (c.form === "rechteck") {
    const x = c.breite / 2, y = c.hoehe / 2;
    return { geschlossen: true, punkte: [[x, y], [-x, y], [-x, -y], [x, -y]] };
  }
  const gross = c.torxA / 2, klein = c.torxB / 2;
  const m = (gross + klein) / 2, welle = (gross - klein) / 2;
  const punkte = [];
  for (let i = 0; i <= 240; i++) {
    const w = (2 * Math.PI * i) / 240;
    const r = m + welle * Math.cos(6 * w);
    punkte.push([r * Math.cos(w), r * Math.sin(w)]);
  }
  return { geschlossen: false, punkte };
}
