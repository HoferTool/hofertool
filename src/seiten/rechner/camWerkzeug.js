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
  // Seit 1.559.0 (Patrick 16. November 2026: „Drehplatte mit 27°
  // Spitzenwinkel, steht 2° schräg, Freiwinkel dann 61°“, „nenne sie Utilis
  // Multidec“): Spitzenwinkel und Schräglage einstellbar, Vorgabe 27° / 2°
  { id: "U", name: "Utilis Multidec", winkel: 27, schraeg: 2, art: "frei", klinge: true },
  // Seit 1.564.0 (Patrick 16. November 2026: „eine Drehplatte, welche ich
  // anpassen kann, mit Spitzenwinkel, Neigung und Freiwinkel“): Rhombus mit
  // freien Winkeln; zwei der drei Winkel genügen, der dritte ergibt sich aus
  // Spitzenwinkel + Neigung + Freiwinkel = 90°
  { id: "F", name: "Freie Platte", winkel: 55, schraeg: 0, art: "frei", dreiWinkel: true },
];
const winkelZahl = (x) => { const t = String(x ?? "").trim().replace(",", "."); return /^-?(\d+(\.\d*)?|\.\d+)$/.test(t) ? Number(t) : null; };
// Spitzenwinkel und Schräglage der Utilis Multidec (leer = Vorgabe)
export function plattenWinkel(wz) {
  const f = plattenForm(wz.form);
  if (!f) return { winkel: 0, schraeg: 0 };
  if (f.art !== "frei") return { winkel: f.winkel, schraeg: 0 };
  if (f.dreiWinkel) {
    let w = winkelZahl(wz.winkel), n = winkelZahl(wz.schraeg);
    const fw = winkelZahl(wz.freiw);
    if (w === null && n !== null && fw !== null) w = 90 - n - fw;
    if (n === null && w !== null && fw !== null) n = 90 - w - fw;
    if (w === null && n === null && fw !== null) n = f.schraeg, w = 90 - n - fw;
    if (w === null || !(w > 0 && w < 90)) w = f.winkel;
    if (n === null) n = f.schraeg;
    return { winkel: w, schraeg: n };
  }
  const w = zahlOk(wz.winkel) && zahlV(wz.winkel) > 0 && zahlV(wz.winkel) < 90 ? zahlV(wz.winkel) : f.winkel;
  const sr = String(wz.schraeg ?? "").trim().replace(",", ".");
  const sg = /^-?(\d+(\.\d*)?|\.\d+)$/.test(sr) ? Number(sr) : f.schraeg;
  return { winkel: w, schraeg: sg };
}
// Freiwinkel = Winkel der Nebenschneide zur Drehachse: 90 − Schräg − Spitzenwinkel
export const freiWinkel = (wz) => { const { winkel, schraeg } = plattenWinkel(wz); return Math.round((90 - schraeg - winkel) * 100) / 100; };
export const FRAESER = [
  { id: "bohrer", name: "Bohrer" },
  { id: "schaft", name: "Schaftfräser" },
  { id: "kugel", name: "Kugelfräser" },
  { id: "eck", name: "Eckradiusfräser" },
  { id: "fase", name: "Fasen- / Zentrierfräser" },
  // Seit 1.600.0 (Wunsch Patrick 17. November 2026: „für alle angetriebenen
  // Werkzeuge auch noch einen Scheibenfräser (T-Nuten-Fräser)“)
  { id: "scheibe", name: "Scheibenfräser (T-Nut)" },
];
export const plattenForm = (id) => PLATTEN.find((p) => p.id === id) || null;
export const fraeserForm = (id) => FRAESER.find((p) => p.id === id) || null;

// Welche Werkzeugarten zu einer Bearbeitung passen: Drehwerkzeuge Kanal 1
// nur Drehen, angetriebene nur Bohren / Fräsen, feste Front- und stehende
// Kanal-2-Werkzeuge beides
export function wzArten(blockArt) {
  if (blockArt === "dreh" || blockArt === "k3dr") return ["dreh"];
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
    if (f.dreiWinkel) {
      const { winkel, schraeg } = plattenWinkel(wz);
      return [{ name: "r", text: "Radius", einheit: "mm" },
        { name: "winkel", text: "Spitzenwinkel", einheit: "Grad", frei: true, ph: String(winkel) },
        { name: "schraeg", text: "Neigung", einheit: "Grad", frei: true, ph: String(schraeg), minus: true },
        { name: "freiw", text: "Freiwinkel", einheit: "Grad", frei: true, ph: String(Math.round((90 - schraeg - winkel) * 100) / 100), minus: true }];
    }
    if (f.art === "frei") return [{ name: "r", text: "Radius", einheit: "mm" },
      { name: "winkel", text: "Spitzenwinkel", einheit: "Grad", frei: true, ph: "27" },
      { name: "schraeg", text: "Schräg", einheit: "Grad", frei: true, ph: "2", minus: true }];
    return [{ name: "r", text: "Radius", einheit: "mm" }];
  }
  const f = wz.form;
  if (!fraeserForm(f)) return [];
  if (f === "scheibe") return [{ name: "d", text: "Ø Scheibe", einheit: "mm" }, { name: "breite", text: "Schneidenbreite", einheit: "mm" },
    { name: "hals", text: "Hals-Ø", einheit: "mm" }, { name: "laenge", text: "Halslänge", einheit: "mm" }];
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
    if (fe.name === "freiw") { if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(String(x).trim().replace(",", ".")) || zahlV(x) <= -45 || zahlV(x) >= 90) f[fe.name] = "−45 bis 89"; continue; }
    if (fe.minus) { if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(String(x).trim().replace(",", ".")) || Math.abs(zahlV(x)) >= 45) f[fe.name] = "−45 bis 45"; continue; }
    if (!zahlOk(x)) { f[fe.name] = "Zahl"; continue; }
    const v = zahlV(x);
    if (art === "dreh" && fe.name === "winkel" && !(v > 0 && v < 90)) { f[fe.name] = "1 bis 89"; continue; }
    if (fe.name === "winkel" ? !(v > 0 && v < 180) : fe.name === "r" ? v < 0 : !(v > 0)) f[fe.name] = "ungültig";
  }
  if (art === "dreh" && plattenForm(wz.form)?.dreiWinkel && !f.winkel && !f.schraeg && !f.freiw) {
    // alle drei eingetragen: müssen zusammen 90° geben; sonst muss der
    // Spitzenwinkel, der sich ergibt, zwischen 0 und 90° liegen
    const w = winkelZahl(wz.winkel), n = winkelZahl(wz.schraeg), fw = winkelZahl(wz.freiw);
    if (w !== null && n !== null && fw !== null && Math.abs(w + n + fw - 90) > 0.01) f.freiw = "Summe muss 90° sein";
    else if (w === null && fw !== null) { const g = 90 - (n ?? 0) - fw; if (!(g > 0 && g < 90)) f.freiw = "Spitzenwinkel wäre " + g + "°"; }
  }
  if (art === "dreh" && plattenForm(wz.form)?.art !== "rund" && !wz.sl) f.sl = "fehlt";
  if (art === "fraes" && wz.form === "eck" && !f.r && !f.d && zahlV(wz.r) * 2 > zahlV(wz.d)) f.r = "grösser als Ø/2";
  if (art === "fraes" && wz.form === "scheibe" && !f.hals && !f.d && zahlV(wz.hals) >= zahlV(wz.d)) f.hals = "kleiner als Ø Scheibe";
  if (art === "fraes" && wz.form === "scheibe" && !f.laenge && !f.breite && zahlV(wz.laenge) <= zahlV(wz.breite)) f.laenge = "länger als Breite";
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
    const teile = [f.art === "einstech" ? "Einstechplatte" + (wz.breite ? " B" + wz.breite : "")
      : f.dreiWinkel ? f.name + " " + plattenWinkel(wz).winkel + "° Neigung " + plattenWinkel(wz).schraeg + "° frei " + freiWinkel(wz) + "°"
      : f.art === "frei" ? f.name + " " + plattenWinkel(wz).winkel + "° schräg " + plattenWinkel(wz).schraeg + "°" : f.name];
    if (wz.r) teile.push("R" + wz.r);
    const s = SPITZEN.find((x) => x.id === wz.sl);
    if (s) teile.push("Lage " + LAGE_NAME[s.id]);
    if (wz.step) teile.push("STEP");
    return teile.join(" · ");
  }
  const f = fraeserForm(wz.form);
  const teile = [f.name];
  if (wz.d) teile.push("Ø" + wz.d);
  if (wz.form === "eck" && wz.r) teile.push("R" + wz.r);
  if (wz.form === "scheibe") {
    if (wz.breite) teile.push("B" + wz.breite);
    if (wz.hals) teile.push("Hals Ø" + wz.hals);
  }
  if ((wz.form === "bohrer" || wz.form === "fase") && wz.winkel) teile.push(wz.winkel + "°");
  if (wz.laenge) teile.push("L" + wz.laenge);
  if (wz.step) teile.push("STEP");
  return teile.join(" · ");
}
// Namen wie an der Maschine gesehen (seit 1.558.3): Führungsbüchse links,
// Teil vorne rechts, +Z zeigt nach links. Gespeichert bleibt die Lage wie
// in HOFERCONTUR (Z nach rechts), darum sind links und rechts vertauscht.
// Patrick 16. November 2026: „dann würden auch die Schneidenlagen ändern“
export const LAGE_NAME = { ol: "oben rechts", o: "oben", or: "oben links", l: "rechts", m: "Mitte",
  r: "links", ul: "unten rechts", u: "unten", ur: "unten links" };
// Knöpfe der Schneidenlage in der Anordnung wie an der Maschine
export const LAGEN_MASCHINE = ["or", "o", "ol", "r", "m", "l", "ur", "u", "ul"];

// Umriss der Platte in mm, Z nach rechts, X nach oben, die gedachte
// Spitze im Nullpunkt. Die Schneidenlage gibt die Richtung, in die die
// Schneidenecke zeigt (Winkelhalbierende von der Platte weg zur Spitze);
// die Platte liegt auf der Gegenseite. Für Anzeige und später die
// Simulation. Rückgabe: Liste von Punkten {z, x} (geschlossen).
// Halter 93°: Hauptschneide 3° über die Senkrechte zur Achse hinaus
export const HALTER_NEIGUNG = 3;
export function plattenUmriss(wz, gross = 8) {
  const f = plattenForm(wz.form);
  if (!f) return [];
  let s = SPITZEN.find((x) => x.id === wz.sl) || { z: 1, r: -1 };
  // Seit 1.637.0 (Patrick 18. November 2026: „dass die Platte in der
  // Simulation die richtige Lage hat“): eine Gewindeplatte steht immer
  // senkrecht zur Achse, das Profil symmetrisch; von der Lage zählt nur
  // oben oder unten, die gedachte Spitze ist die Spitze des Profils
  if (f.art === "gewinde") s = s.r > 0 ? SPITZEN.find((x) => x.id === "o") : SPITZEN.find((x) => x.id === "u");
  const r = Math.max(0, zahlOk(wz.r) ? zahlV(wz.r) : 0);
  if (f.art === "rund") {
    const R = r > 0 ? r : gross / 2;
    // Mitte der Platte auf der Gegenseite der gedachten Spitze
    const n = Math.hypot(s.z, s.r) || 1;
    // Gedachte Spitze = Schnittpunkt der achsparallelen Tangenten (1.547.0)
    const mz = -s.z * R, mx = -s.r * R;
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
  let hb = Math.atan2(dx, dz) + Math.PI; // Richtung in die Platte hinein
  const { winkel, schraeg } = plattenWinkel(wz);
  const e = winkel * Math.PI / 180 / 2;
  const L = f.art === "gewinde" ? gross * 0.7 : gross;
  let a = { z: L * Math.cos(hb + e), x: L * Math.sin(hb + e) };
  let c = { z: L * Math.cos(hb - e), x: L * Math.sin(hb - e) };
  // Seit 1.620.0 (Entscheid Patrick 17. November 2026: „Wie Halter 93°“):
  // Rhombus und Dreieck stehen in schrägen Lagen wie im Halter mit 93°
  // Einstellwinkel: Hauptschneide 3° von der Stirn weg geneigt, Nebenschneide
  // um den Spitzenwinkel weiter; vorher symmetrisch zur Ecke, dann drückte
  // sich die Nebenschneide beim Wegfahren in X schräg in die Schulter ab
  if ((f.art === "rhombus" || f.art === "dreieck") && s.z !== 0 && s.r !== 0) {
    const sw = HALTER_NEIGUNG * Math.PI / 180, ew = winkel * Math.PI / 180;
    a = { z: -s.z * L * Math.sin(sw), x: -s.r * L * Math.cos(sw) };
    c = { z: -s.z * L * Math.sin(sw + ew), x: -s.r * L * Math.cos(sw + ew) };
    hb = Math.atan2(a.x + c.x, a.z + c.z);
  }
  if (f.art === "frei") {
    const sw = schraeg * Math.PI / 180, ew = winkel * Math.PI / 180;
    if (s.z !== 0 && s.r !== 0) {
      // Schräge Lage (etwa „ur“, an der Maschine unten links): Hauptschneide
      // von der Spitze quer zur Achse, um „Schräg“ von der Stirn weg
      // geneigt (Einstellwinkel 90° + Schräg), Nebenschneide um den
      // Spitzenwinkel weiter, sie steht im Freiwinkel zur Achse
      a = { z: -s.z * L * Math.sin(sw), x: -s.r * L * Math.cos(sw) };
      c = { z: -s.z * L * Math.sin(sw + ew), x: -s.r * L * Math.cos(sw + ew) };
      hb = Math.atan2(a.x + c.x, a.z + c.z);
    } else {
      // Gerade Lagen: Winkelhalbierende wie sonst, um „Schräg“ gedreht
      hb += sw;
      a = { z: L * Math.cos(hb + e), x: L * Math.sin(hb + e) };
      c = { z: L * Math.cos(hb - e), x: L * Math.sin(hb - e) };
    }
  }
  let p = f.art === "rhombus" || (f.art === "frei" && !f.klinge) ? [{ z: 0, x: 0 }, a, { z: a.z + c.z, x: a.x + c.x }, c] : [{ z: 0, x: 0 }, a, c];
  if (f.klinge) {
    // Seit 1.562.0 nach Patricks Zeichnung CUT-1317-12 (Utilis Multidec,
    // 16. November 2026): schmale Klinge in echten mm. Die Seite a läuft von
    // der Spitze 11 mm in die Platte, die Seite c geht im Spitzenwinkel bis
    // 5.5 mm hoch (dort rund 3 mm breit), dann parallel zu a bis 11 mm
    const la = Math.hypot(a.z, a.x) || 1, lc = Math.hypot(c.z, c.x) || 1;
    const ua = { z: a.z / la, x: a.x / la }, uc = { z: c.z / lc, x: c.x / lc };
    const ew = winkel * Math.PI / 180, H = 11, H1 = 5.5;
    const q1 = { z: ua.z * H, x: ua.x * H };
    const q2 = { z: uc.z * H1 / Math.cos(ew), x: uc.x * H1 / Math.cos(ew) };
    const q3 = { z: q2.z + ua.z * (H - H1), x: q2.x + ua.x * (H - H1) };
    p = [{ z: 0, x: 0 }, q1, q3, q2];
  }
  const rund = eckenRunden(p, r, [0]);
  // Seit 1.547.0: die gedachte Spitze ist der Schnittpunkt der Tangenten
  // parallel zu Z und X an den Schneidenradius (so rechnet die Maschine
  // ohne G41/G42 und so rechnet HOFERCONTUR). Die Platte wird so
  // verschoben, dass die Mitte des Radius bei −Lage · r liegt.
  if (!(r > 0) || s.id === "m") return rund;
  const mitte = { z: Math.cos(hb) * r / Math.sin(e), x: Math.sin(hb) * r / Math.sin(e) };
  const soll = { z: -s.z * r, x: -s.r * r };
  return rund.map((q) => ({ z: q.z + soll.z - mitte.z, x: q.x + soll.x - mitte.x }));
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
  if (wz.form === "scheibe") {
    // Scheibe unten (Spitze = Unterkante der Scheibe), darüber der dünnere
    // Hals bis zur Halslänge, dann der Schaft
    const B = zahlOk(wz.breite) && zahlV(wz.breite) > 0 ? zahlV(wz.breite) : Math.max(0.5, d / 6);
    const rh = Math.min(R * 0.95, zahlOk(wz.hals) && zahlV(wz.hals) > 0 ? zahlV(wz.hals) / 2 : R / 2);
    const Lh = Math.max(B + 0.1, zahlOk(wz.laenge) && zahlV(wz.laenge) > 0 ? zahlV(wz.laenge) : B + d);
    const rs = Math.min(R, rh * 1.6);
    return { schneide: [{ z: -R, x: 0 }, { z: R, x: 0 }, { z: R, x: B }, { z: rh, x: B }, { z: rh, x: Lh }, { z: -rh, x: Lh }, { z: -rh, x: B }, { z: -R, x: B }],
      schaft: [{ z: -rs, x: Lh }, { z: rs, x: Lh }, { z: rs, x: Lh + d * 0.8 }, { z: -rs, x: Lh + d * 0.8 }] };
  }
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
