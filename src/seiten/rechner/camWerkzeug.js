// HOFERCAM: Werkzeug je Bearbeitung (seit 1.545.0)
//
// Wunsch Patrick 14. November 2026, als Grundlage für eine spätere
// 3D-Simulation: je Bearbeitung wahlweise das Werkzeug festlegen.
// Drehwerkzeuge: Plattenform, Radius, Schneidenlage, dazu Einstechplatten
// mit Breite und Schneidenlage (Patrick: „müsste ich noch Einstechplatten
// haben mit Breite und Schneidenlage“). Die Ausrichtung der Platte ergibt
// sich aus der Schneidenlage (Patrick: „die Orientierung muss aufgrund der
// Schneidenlage erkannt werden“). Bohr- und Fräswerkzeuge: Ø,
// Schneidenform, Schneidenlänge, Spitzenwinkel.
// Fürs spätere Rechnen gilt: bei Bohr- und Fräswerkzeugen steht das Teil
// in Z 0.5 mm vor „Anfahren Z“ (auch in Kanal 2); Querwerkzeuge liegen in
// Z werkstückbezogen auf der programmierten Lage.
//
// Gespeichert am Block unter wz: { art: "dreh" | "fraes", form, r, sl,
// breite, d, laenge, winkel }. Schneidenlage wie bei HOFERCONTUR (SPITZEN:
// ol, o, or, l, m, r, ul, u, ur = Lage der gedachten Spitze zur
// Schneidenmitte, Z nach rechts, X nach oben).

import { SPITZEN } from "./kontur.js";
export { SPITZEN };

// Plattenformen mit Eckenwinkel (ε), wie die ISO-Kennbuchstaben
export const PLATTEN = [
  { id: "C", name: "C 80° Rhombus", winkel: 80, art: "rhombus" },
  { id: "D", name: "D 55° Rhombus", winkel: 55, art: "rhombus" },
  { id: "V", name: "V 35° Rhombus", winkel: 35, art: "rhombus" },
  { id: "W", name: "W 80° Trigon", winkel: 80, art: "dreieck" },
  { id: "T", name: "T 60° Dreieck", winkel: 60, art: "dreieck" },
  { id: "R", name: "R rund", winkel: 180, art: "rund" },
  { id: "G", name: "Gewindeplatte 60°", winkel: 60, art: "gewinde" },
  { id: "E", name: "Einstechplatte", winkel: 90, art: "einstech" },
];
export const FRAESER = [
  { id: "bohrer", name: "Bohrer" },
  { id: "schaft", name: "Schaftfräser" },
  { id: "kugel", name: "Kugelfräser" },
  { id: "eck", name: "Eckradiusfräser" },
  { id: "fase", name: "Fasen- / Zentrierfräser" },
];
export const plattenForm = (id) => PLATTEN.find((p) => p.id === id) || null;
export const fraeserForm = (id) => FRAESER.find((p) => p.id === id) || null;

// Welche Werkzeugarten zu einer Bearbeitung passen: Drehwerkzeuge Kanal 1
// nur Drehen, angetriebene nur Bohren / Fräsen, feste Front- und stehende
// Kanal-2-Werkzeuge beides
export function wzArten(blockArt) {
  if (blockArt === "dreh") return ["dreh"];
  if (blockArt === "front") return ["fraes", "dreh"];
  if (blockArt === "k2") return ["dreh", "fraes"];
  return ["fraes"];
}
export function wzArt(b) {
  const arten = wzArten(b.art);
  return b.wz && arten.includes(b.wz.art) ? b.wz.art : arten[0];
}

// Felder je Form, mit Einheit
export function wzFelder(wz, art) {
  if (art === "dreh") {
    const f = plattenForm(wz.form);
    if (!f) return [];
    if (f.art === "einstech") return [{ name: "breite", text: "Breite", einheit: "mm" }, { name: "r", text: "Eckradius", einheit: "mm", frei: true }];
    if (f.art === "rund") return [{ name: "r", text: "Radius", einheit: "mm" }];
    if (f.art === "gewinde") return [{ name: "r", text: "Radius", einheit: "mm", frei: true }];
    return [{ name: "r", text: "Radius", einheit: "mm" }];
  }
  const f = wz.form;
  if (!fraeserForm(f)) return [];
  const l = [{ name: "d", text: "Ø", einheit: "mm" }];
  if (f === "eck") l.push({ name: "r", text: "Eckradius", einheit: "mm" });
  if (f === "bohrer" || f === "fase") l.push({ name: "winkel", text: "Spitzenwinkel", einheit: "Grad" });
  l.push({ name: "laenge", text: "Schneidenlänge", einheit: "mm" });
  return l;
}

const zahlOk = (x) => /^\d+(\.\d*)?$|^\.\d+$/.test(String(x ?? "").trim().replace(",", "."));
const zahlV = (x) => Number(String(x).trim().replace(",", "."));

// Fehler je Feld; ein ganz leeres Werkzeug ist kein Fehler (optional)
export function wzFehler(b) {
  const wz = b.wz || {};
  const f = {};
  if (!wz.form) return f;
  const art = wzArt(b);
  for (const fe of wzFelder(wz, art)) {
    const x = wz[fe.name];
    if (String(x ?? "").trim() === "") { if (!fe.frei) f[fe.name] = "fehlt"; continue; }
    if (!zahlOk(x)) { f[fe.name] = "Zahl"; continue; }
    const v = zahlV(x);
    if (fe.name === "winkel" ? !(v > 0 && v < 180) : fe.name === "r" ? v < 0 : !(v > 0)) f[fe.name] = "ungültig";
  }
  if (art === "dreh" && plattenForm(wz.form)?.art !== "rund" && !wz.sl) f.sl = "fehlt";
  if (art === "fraes" && wz.form === "eck" && !f.r && !f.d && zahlV(wz.r) * 2 > zahlV(wz.d)) f.r = "grösser als Ø/2";
  return f;
}
export const wzVollstaendig = (b) => !!(b.wz && b.wz.form) && Object.keys(wzFehler(b)).length === 0;

// Kurzer Text für die Zeile über dem NC-Code
export function wzText(b) {
  const wz = b.wz || {};
  if (!wz.form) return "";
  const art = wzArt(b);
  if (art === "dreh") {
    const f = plattenForm(wz.form);
    const teile = [f.art === "einstech" ? "Einstechplatte" + (wz.breite ? " B" + wz.breite : "") : f.name];
    if (wz.r) teile.push("R" + wz.r);
    const s = SPITZEN.find((x) => x.id === wz.sl);
    if (s) teile.push("Lage " + LAGE_NAME[s.id]);
    return teile.join(" · ");
  }
  const f = fraeserForm(wz.form);
  const teile = [f.name];
  if (wz.d) teile.push("Ø" + wz.d);
  if (wz.form === "eck" && wz.r) teile.push("R" + wz.r);
  if ((wz.form === "bohrer" || wz.form === "fase") && wz.winkel) teile.push(wz.winkel + "°");
  if (wz.laenge) teile.push("L" + wz.laenge);
  return teile.join(" · ");
}
export const LAGE_NAME = { ol: "oben links", o: "oben", or: "oben rechts", l: "links", m: "Mitte",
  r: "rechts", ul: "unten links", u: "unten", ur: "unten rechts" };

// Umriss der Platte in mm, Z nach rechts, X nach oben, die gedachte
// Spitze im Nullpunkt. Die Schneidenlage gibt die Richtung, in die die
// Schneidenecke zeigt (Winkelhalbierende von der Platte weg zur Spitze);
// die Platte liegt auf der Gegenseite. Für Anzeige und später die
// Simulation. Rückgabe: Liste von Punkten {z, x} (geschlossen).
export function plattenUmriss(wz, gross = 8) {
  const f = plattenForm(wz.form);
  if (!f) return [];
  const s = SPITZEN.find((x) => x.id === wz.sl) || { z: 1, r: -1 };
  const r = Math.max(0, zahlOk(wz.r) ? zahlV(wz.r) : 0);
  if (f.art === "rund") {
    const R = r > 0 ? r : gross / 2;
    // Mitte der Platte auf der Gegenseite der gedachten Spitze
    const n = Math.hypot(s.z, s.r) || 1;
    const mz = s.id === "m" ? 0 : -s.z / n * R, mx = s.id === "m" ? 0 : -s.r / n * R;
    return Array.from({ length: 48 }, (_, i) => ({ z: mz + R * Math.cos(i * Math.PI / 24), x: mx + R * Math.sin(i * Math.PI / 24) }));
  }
  if (f.art === "einstech") {
    const B = zahlOk(wz.breite) && zahlV(wz.breite) > 0 ? zahlV(wz.breite) : 2;
    const H = Math.max(gross, B * 2.5);
    // Schneide zeigt in X (oben / unten) oder in Z (links / rechts);
    // Ecken der Schneide: diagonale Lage = diese Ecke, sonst Mitte
    const inX = s.r !== 0 || s.z === 0;
    const sx = s.r === 0 && s.z === 0 ? -1 : s.r;
    let p;
    if (inX) {
      const z0 = s.z > 0 ? -B : s.z < 0 ? 0 : -B / 2;
      const zu = sx < 0 ? 1 : -1; // Platte liegt auf der Gegenseite der Schneide
      p = [{ z: z0, x: 0 }, { z: z0 + B, x: 0 }, { z: z0 + B, x: zu * H }, { z: z0, x: zu * H }];
    } else {
      const x0 = -B / 2;
      const zu = s.z < 0 ? 1 : -1;
      p = [{ z: 0, x: x0 }, { z: 0, x: x0 + B }, { z: zu * H, x: x0 + B }, { z: zu * H, x: x0 }];
    }
    return eckenRunden(p, r);
  }
  // Rhombus, Dreieck, Gewinde: Ecke im Nullpunkt, Winkelhalbierende zeigt
  // von der Platte zur Spitze
  const n = Math.hypot(s.z, s.r) || 1;
  const dz = s.id === "m" ? 1 : s.z / n, dx = s.id === "m" ? -1 : s.r / n;
  const hb = Math.atan2(dx, dz) + Math.PI; // Richtung in die Platte hinein
  const e = f.winkel * Math.PI / 180 / 2;
  const L = f.art === "gewinde" ? gross * 0.7 : gross;
  const a = { z: L * Math.cos(hb + e), x: L * Math.sin(hb + e) };
  const c = { z: L * Math.cos(hb - e), x: L * Math.sin(hb - e) };
  const p = f.art === "rhombus" ? [{ z: 0, x: 0 }, a, { z: a.z + c.z, x: a.x + c.x }, c] : [{ z: 0, x: 0 }, a, c];
  return eckenRunden(p, r, f.art === "rhombus" || f.art === "dreieck" ? [0] : [0]);
}

// Ecken eines Vielecks mit Radius r runden (nur die genannten Ecken,
// sonst alle), als Punktfolge
function eckenRunden(p, r, nur) {
  if (!(r > 0)) return p;
  const aus = [];
  p.forEach((q, i) => {
    if (nur && !nur.includes(i)) { aus.push(q); return; }
    const v = p[(i + p.length - 1) % p.length], w = p[(i + 1) % p.length];
    const u1 = einh(v.z - q.z, v.x - q.x), u2 = einh(w.z - q.z, w.x - q.x);
    const halb = Math.acos(Math.max(-1, Math.min(1, u1.z * u2.z + u1.x * u2.x))) / 2;
    const t = Math.min(r / Math.tan(halb), Math.hypot(v.z - q.z, v.x - q.x) / 2, Math.hypot(w.z - q.z, w.x - q.x) / 2);
    const rr = t * Math.tan(halb);
    const bi = einh(u1.z + u2.z, u1.x + u2.x);
    const m = { z: q.z + bi.z * rr / Math.sin(halb), x: q.x + bi.x * rr / Math.sin(halb) };
    const a = { z: q.z + u1.z * t, x: q.x + u1.x * t }, b = { z: q.z + u2.z * t, x: q.x + u2.x * t };
    let wa = Math.atan2(a.x - m.x, a.z - m.z), wb = Math.atan2(b.x - m.x, b.z - m.z);
    let dw = wb - wa; while (dw > Math.PI) dw -= 2 * Math.PI; while (dw < -Math.PI) dw += 2 * Math.PI;
    for (let k = 0; k <= 8; k++) aus.push({ z: m.z + rr * Math.cos(wa + dw * k / 8), x: m.x + rr * Math.sin(wa + dw * k / 8) });
  });
  return aus;
}
function einh(z, x) { const n = Math.hypot(z, x) || 1; return { z: z / n, x: x / n }; }

// Seitenansicht eines Bohr- oder Fräswerkzeugs, Spitze im Nullpunkt,
// Werkzeug nach oben (Achse senkrecht), in mm
export function fraeserUmriss(wz) {
  const d = zahlOk(wz.d) && zahlV(wz.d) > 0 ? zahlV(wz.d) : 6;
  const L = zahlOk(wz.laenge) && zahlV(wz.laenge) > 0 ? zahlV(wz.laenge) : d * 2;
  const R = d / 2;
  const unten = [];
  if (wz.form === "bohrer" || wz.form === "fase") {
    const w = zahlOk(wz.winkel) && zahlV(wz.winkel) > 0 && zahlV(wz.winkel) < 180 ? zahlV(wz.winkel) : (wz.form === "bohrer" ? 118 : 90);
    const h = R / Math.tan(w * Math.PI / 360);
    unten.push({ z: -R, x: h }, { z: 0, x: 0 }, { z: R, x: h });
  } else if (wz.form === "kugel") {
    for (let k = 0; k <= 16; k++) { const a = Math.PI + k * Math.PI / 16; unten.push({ z: R * Math.cos(a), x: R + R * Math.sin(a) }); }
  } else if (wz.form === "eck") {
    const r = Math.min(R, zahlOk(wz.r) ? zahlV(wz.r) : 0);
    for (let k = 0; k <= 8; k++) { const a = Math.PI + k * Math.PI / 16; unten.push({ z: -R + r + r * Math.cos(a), x: r + r * Math.sin(a) }); }
    for (let k = 8; k <= 16; k++) { const a = Math.PI + k * Math.PI / 16; unten.push({ z: R - r + r * Math.cos(a), x: r + r * Math.sin(a) }); }
  } else unten.push({ z: -R, x: 0 }, { z: R, x: 0 });
  const zu = unten[unten.length - 1], an = unten[0];
  return { schneide: [...unten, { z: zu.z, x: L }, { z: an.z, x: L }], schaft: [{ z: -R, x: L }, { z: R, x: L }, { z: R, x: L + d * 1.2 }, { z: -R, x: L + d * 1.2 }] };
}
