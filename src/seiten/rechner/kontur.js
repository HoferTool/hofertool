// =================================================================
//  RECHNER → KONTUR: RECHNUNG
//  Aus den eingegebenen Elementen (Gerade, Bogen, dazwischen Radius
//  oder Fase) entsteht die Fertigkontur. Daraus rechnet die App die
//  Bahn der Schneide mit eingerechnetem Schneidenradius: die Bahn der
//  Schneidenmitte liegt im Abstand des Radius neben der Kontur
//  (äquidistant), an äusseren Ecken rollt die Schneide um die Ecke,
//  an inneren Ecken schneiden sich die verschobenen Elemente. Danach
//  wird die Bahn um den Abstand Schneidenmitte → gedachte Schneiden-
//  spitze verschoben, weil die Maschine auf die gedachte Spitze
//  vermessen ist. So braucht das Programm kein G41/G42.
//
//  Gerechnet wird in z und r (Radius), ausgegeben X als Durchmesser.
//  Blickrichtung wie in der Grafik: Z nach rechts, X nach oben.
// =================================================================

const EPS = 1e-7;
const P = (z, r) => ({ z, r });
const plus = (a, b) => P(a.z + b.z, a.r + b.r);
const minus = (a, b) => P(a.z - b.z, a.r - b.r);
const mal = (a, k) => P(a.z * k, a.r * k);
const laenge = (a) => Math.hypot(a.z, a.r);
const einheit = (a) => { const l = laenge(a); return l < EPS ? P(0, 0) : mal(a, 1 / l); };
const links = (d) => P(-d.r, d.z);              // Normale links der Fahrrichtung
const kreuz = (a, b) => a.z * b.r - a.r * b.z;
const skalar = (a, b) => a.z * b.z + a.r * b.r;
const abstand = (a, b) => laenge(minus(a, b));
const grad = (w) => (w * Math.PI) / 180;

// Richtung am Anfang und am Ende eines Elements
function tangente(s, p) {
  if (s.t === "L") return einheit(minus(s.b, s.a));
  const v = einheit(minus(p, s.c));
  return s.ccw ? P(-v.r, v.z) : P(v.r, -v.z);
}
const tAnfang = (s) => tangente(s, s.a);
const tEnde = (s) => tangente(s, s.b);

// Überstrichener Winkel eines Bogens in Fahrrichtung (0 … 2π)
export function bogenWinkel(s) {
  const wa = Math.atan2(s.a.r - s.c.r, s.a.z - s.c.z);
  const wb = Math.atan2(s.b.r - s.c.r, s.b.z - s.c.z);
  let d = s.ccw ? wb - wa : wa - wb;
  while (d < -EPS) d += 2 * Math.PI;
  return d;
}

// Schnittpunkte der Träger (Gerade unendlich, Bogen als ganzer Kreis)
function schnitte(s1, s2) {
  if (s1.t === "L" && s2.t === "L") {
    const d1 = minus(s1.b, s1.a), d2 = minus(s2.b, s2.a);
    const n = kreuz(d1, d2);
    if (Math.abs(n) < EPS) return [];
    const t = kreuz(minus(s2.a, s1.a), d2) / n;
    return [plus(s1.a, mal(d1, t))];
  }
  if (s1.t === "A" && s2.t === "L") return schnitte(s2, s1);
  if (s1.t === "L") {
    const d = einheit(minus(s1.b, s1.a));
    const f = plus(s1.a, mal(d, skalar(minus(s2.c, s1.a), d)));
    const h = abstand(f, s2.c);
    if (h > s2.R + 1e-6) return [];
    const k = Math.sqrt(Math.max(0, s2.R * s2.R - h * h));
    return [plus(f, mal(d, k)), plus(f, mal(d, -k))];
  }
  const d = abstand(s1.c, s2.c);
  if (d < EPS || d > s1.R + s2.R + 1e-6 || d < Math.abs(s1.R - s2.R) - 1e-6) return [];
  const a = (s1.R * s1.R - s2.R * s2.R + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, s1.R * s1.R - a * a));
  const e = einheit(minus(s2.c, s1.c));
  const m = plus(s1.c, mal(e, a));
  return [plus(m, mal(links(e), h)), plus(m, mal(links(e), -h))];
}
const naechster = (punkte, ziel) =>
  punkte.reduce((best, p) => (!best || abstand(p, ziel) < abstand(best, ziel) ? p : best), null);

// Nächster Punkt auf dem Träger
function lot(s, p) {
  if (s.t === "L") {
    const d = einheit(minus(s.b, s.a));
    return plus(s.a, mal(d, skalar(minus(p, s.a), d)));
  }
  return plus(s.c, mal(einheit(minus(p, s.c)), s.R));
}

// Element um d nach links verschieben (rechts = negativ)
function versetzt(s, d) {
  if (s.t === "L") {
    const n = mal(links(einheit(minus(s.b, s.a))), d);
    return { ...s, a: plus(s.a, n), b: plus(s.b, n) };
  }
  const R = s.ccw ? s.R - d : s.R + d;
  if (R < 1e-6) return null;
  const auf = (p) => plus(s.c, mal(einheit(minus(p, s.c)), R));
  return { ...s, R, a: auf(s.a), b: auf(s.b) };
}

// -----------------------------------------------------------------
//  Freistiche (seit 1.358.0, Wunsch Patrick 3. November 2026: „ISO-
//  Elemente wie Freistiche“): in der Ecke zwischen einem Zylinder und
//  einer Planfläche, wie im ShopTurn als Übergang am Ende eines
//  Elements. Die Masse kommen aus der Tabelle der Norm und lassen sich
//  von Hand ändern.
//    t  Tiefe in den Zylinder (Radius), f  Breite auf der Oberfläche,
//    r  Radius im Grund, t2 Tiefe in die Planfläche (nur DIN 509 F,
//       am tiefsten Punkt gemessen),
//    wa Winkel der Schräge zum Zylinder (zur Achse),
//    wi Winkel der Wand zur Planfläche (DIN 509 F: 8°)
// -----------------------------------------------------------------
export const FREISTICHE = {
  FE: { name: "Freistich DIN 509 E", wa: 15, wi: 0, masse: [
    ["E0.2×0.1", 0.2, 0.1, 1], ["E0.4×0.2", 0.4, 0.2, 2], ["E0.6×0.2", 0.6, 0.2, 2], ["E0.6×0.3", 0.6, 0.3, 2.5],
    ["E0.8×0.3", 0.8, 0.3, 2.5], ["E1×0.2", 1, 0.2, 2.5], ["E1×0.4", 1, 0.4, 4], ["E1.2×0.2", 1.2, 0.2, 2.5],
    ["E1.2×0.4", 1.2, 0.4, 4], ["E1.6×0.3", 1.6, 0.3, 4], ["E2.5×0.4", 2.5, 0.4, 5], ["E4×0.5", 4, 0.5, 7]] },
  FF: { name: "Freistich DIN 509 F", wa: 15, wi: 8, masse: [
    ["F0.2×0.1", 0.2, 0.1, 1, 0.1], ["F0.4×0.2", 0.4, 0.2, 2, 0.1], ["F0.6×0.2", 0.6, 0.2, 2, 0.1], ["F0.6×0.3", 0.6, 0.3, 2.5, 0.2],
    ["F0.8×0.3", 0.8, 0.3, 2.5, 0.2], ["F1×0.2", 1, 0.2, 2.5, 0.1], ["F1×0.4", 1, 0.4, 4, 0.3], ["F1.2×0.2", 1.2, 0.2, 2.5, 0.1],
    ["F1.2×0.4", 1.2, 0.4, 4, 0.3], ["F1.6×0.3", 1.6, 0.3, 4, 0.2], ["F2.5×0.4", 2.5, 0.4, 5, 0.3], ["F4×0.5", 4, 0.5, 7, 0.3]] },
  // DIN 76 Form A, Aussengewinde: Tiefe = (d − dg) / 2, Breite = g2
  FG: { name: "Gewindefreistich DIN 76", wa: 30, wi: 0, masse: [
    ["P 0.5", 0.2, 0.4, 1.75], ["P 0.7", 0.4, 0.55, 2.45], ["P 0.75", 0.4, 0.6, 2.6], ["P 0.8", 0.4, 0.65, 2.8],
    ["P 1", 0.6, 0.8, 3.5], ["P 1.25", 0.6, 1, 4.4], ["P 1.5", 0.8, 1.15, 5.2], ["P 1.75", 1, 1.3, 6.1],
    ["P 2", 1, 1.5, 7], ["P 2.5", 1.2, 1.8, 8.7], ["P 3", 1.6, 2.2, 10.5]] },
};
// Felder eines Masses aus der Tabelle: { fs, fr, ft, ff, ft2 }
export function freistichMasse(art, name) {
  const m = (FREISTICHE[art] && FREISTICHE[art].masse.find((x) => x[0] === name)) || FREISTICHE[art].masse[0];
  return { fs: m[0], fr: String(m[1]), ft: String(m[2]), ff: String(m[3]), ft2: m[4] !== undefined ? String(m[4]) : "" };
}
export const istFreistich = (ueb) => !!FREISTICHE[ueb];

// Segmente des Freistichs in der Ecke von s1 → s2, oder ein Fehlertext
function freistich(s1, s2, el) {
  const def = FREISTICHE[el.ueb];
  const zahl = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
  const t = zahl(el.ft), f = zahl(el.ff), r = zahl(el.fr), t2 = el.ueb === "FF" ? zahl(el.ft2) || 0 : 0;
  if (!(t > 0) || !(f > 0) || !(r > 0)) return "Tiefe, Breite und Radius eingeben";
  if (s1.t !== "L" || s2.t !== "L") return "nur zwischen zwei Geraden";
  const d1 = tEnde(s1), d2 = tAnfang(s2);
  const achs = (d) => Math.abs(d.r) < 1e-6 ? "z" : Math.abs(d.z) < 1e-6 ? "r" : "";
  let dz, fr, umgekehrt;
  if (achs(d1) === "z" && achs(d2) === "r") { dz = d1; fr = d2; umgekehrt = false; }
  else if (achs(d1) === "r" && achs(d2) === "z") { dz = mal(d2, -1); fr = mal(d1, -1); umgekehrt = true; }
  else return "nur in der Ecke zwischen Zylinder und Planfläche";
  const ecke = s1.b;
  const G = (a, b) => plus(ecke, plus(mal(dz, a), mal(fr, b)));
  const wa = grad(def.wa), wi = grad(def.wi);
  // In Koordinaten a (über die Ecke hinaus in die Planfläche) und b
  // (von der Zylinderlinie die Planfläche hinauf)
  const S = [-f, 0];
  const Q = [-f + t / Math.tan(wa), -t];
  // Die Wand steht so, dass der Freistich genau t2 tief in die
  // Planfläche geht (am Berührpunkt des Radius, dort am tiefsten)
  const x0 = wi > 0 ? t2 + (r * (1 + Math.sin(wi))) / Math.cos(wi) - r * Math.cos(wi) : 0;
  const ca = x0 - (r * (1 + Math.sin(wi))) / Math.cos(wi);
  const T1 = [ca, -t];
  const T2 = [ca + r * Math.cos(wi), -t + r + r * Math.sin(wi)];
  const C = [ca, -t + r];
  const W = wi > 0 ? [0, -t + x0 / Math.tan(wi)] : null;
  if (ca < Q[0] - 1e-9) return "Breite zu klein für Tiefe und Radius";
  const zyl = umgekehrt ? s2 : s1, plan = umgekehrt ? s1 : s2;
  if (f > abstand(zyl.a, zyl.b) + 1e-9) return `Breite ${f} länger als der Zylinder`;
  const oben = W ? W[1] : T2[1];
  if (oben > abstand(plan.a, plan.b) - 1e-9) return "höher als die Planfläche";
  const tiefPunkt = G(0, -t);
  if (tiefPunkt.r < -1e-9) return "tiefer als die Drehmitte";
  // Reihenfolge Zylinder → Planfläche
  const pS = G(...S), pQ = G(...Q), pT1 = G(...T1), pT2 = G(...T2), pC = G(...C);
  const ende = W ? G(...W) : pT2;
  const ccw = kreuz(minus(pT1, pC), dz) > 0;
  const teile = [{ t: "L", a: pS, b: pQ }, { t: "L", a: pQ, b: pT1 },
    { t: "A", a: pT1, b: pT2, c: pC, R: r, ccw }];
  if (W) teile.push({ t: "L", a: pT2, b: ende });
  const liste = umgekehrt
    ? teile.reverse().map((x) => ({ ...x, a: x.b, b: x.a, ...(x.t === "A" ? { ccw: !x.ccw } : {}) }))
    : teile;
  return { teile: liste.filter((x) => x.t === "A" || abstand(x.a, x.b) > 1e-9),
    anfang: umgekehrt ? ende : pS, schluss: umgekehrt ? pS : ende };
}

const zahlVon = (t) => {
  if (t === undefined || t === null || String(t).trim() === "") return null;
  const n = Number(String(t).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

// -----------------------------------------------------------------
//  1. Eingabe → Fertigkontur
// -----------------------------------------------------------------
export function konturRechnen(k) {
  const fehler = [];
  const x0 = zahlVon(k.startX), z0 = zahlVon(k.startZ);
  if (x0 === null || z0 === null || Number.isNaN(x0) || Number.isNaN(z0)) {
    return { segmente: [], fehler: ["Startpunkt X und Z eingeben."], ecken: [] };
  }
  let p = P(z0, x0 / 2);
  const roh = [];        // je Element ein Segment, Index = Elementnummer
  (k.elemente || []).forEach((el, i) => {
    const nr = i + 1;
    const x = zahlVon(el.x), z = zahlVon(el.z);
    if (Number.isNaN(x) || Number.isNaN(z)) { fehler.push(`Element ${nr}: Zahl nicht lesbar.`); roh.push(null); return; }
    let ziel;
    if (el.art === "bogen") {
      ziel = P(z === null ? p.z : z, x === null ? p.r : x / 2);
      const R = zahlVon(el.r);
      if (!R || R <= 0) { fehler.push(`Element ${nr}: Radius eingeben.`); roh.push(null); return; }
      const sehne = minus(ziel, p);
      const h = laenge(sehne) / 2;
      if (h < EPS) { fehler.push(`Element ${nr}: Endpunkt gleich Anfangspunkt.`); roh.push(null); return; }
      if (R < h - 1e-6) { fehler.push(`Element ${nr}: Radius ${R} zu klein für diesen Endpunkt (mind. ${(h).toFixed(3)}).`); roh.push(null); return; }
      const ccw = el.dreh === "ccw";
      const m = plus(p, mal(sehne, 0.5));
      const tief = Math.sqrt(Math.max(0, R * R - h * h));
      const c = plus(m, mal(links(einheit(sehne)), ccw ? tief : -tief));
      roh.push({ t: "A", a: p, b: ziel, c, R, ccw, nr });
    } else {
      const w = zahlVon(el.w);
      if (w !== null && !Number.isNaN(w) && (x === null) !== (z === null)) {
        // Winkel zur Z-Achse: 0° nach rechts (+Z), 90° nach oben (+X)
        const d = P(Math.cos(grad(w)), Math.sin(grad(w)));
        let t;
        if (x !== null) t = Math.abs(d.r) < 1e-9 ? NaN : (x / 2 - p.r) / d.r;
        else t = Math.abs(d.z) < 1e-9 ? NaN : (z - p.z) / d.z;
        if (!(t > EPS)) { fehler.push(`Element ${nr}: Winkel passt nicht zum Endpunkt.`); roh.push(null); return; }
        ziel = plus(p, mal(d, t));
      } else {
        ziel = P(z === null ? p.z : z, x === null ? p.r : x / 2);
      }
      if (abstand(ziel, p) < EPS) { fehler.push(`Element ${nr}: Endpunkt gleich Anfangspunkt.`); roh.push(null); return; }
      roh.push({ t: "L", a: p, b: ziel, nr });
    }
    p = ziel;
  });

  // Übergänge (Radius oder Fase) am Ende eines Elements zum nächsten
  const seg = roh.map((s) => (s ? { ...s } : null));
  const einfuegen = [];  // [nach Index, Segment]
  const ecken = [];
  for (let i = 0; i < seg.length - 1; i++) {
    const s1 = seg[i], s2 = seg[i + 1];
    const el = k.elemente[i];
    if (s1 && s2 && istFreistich(el.ueb)) {
      const fs = freistich(s1, s2, el);
      if (typeof fs === "string") { fehler.push(`Element ${i + 1}: ${FREISTICHE[el.ueb].name}: ${fs}.`); continue; }
      ecken.push(s1.b);
      s1.b = fs.anfang; s2.a = fs.schluss;
      fs.teile.forEach((n) => einfuegen.push([i, { ...n, nr: i + 1, uebergang: true }]));
      continue;
    }
    const wert = zahlVon(el.uw);
    if (!s1 || !s2 || !el.ueb || !wert || wert <= 0) continue;
    const t1 = tEnde(s1), t2 = tAnfang(s2);
    const dreh = kreuz(t1, t2);
    if (Math.abs(dreh) < 1e-6) continue;  // tangent: braucht keinen Übergang
    const ecke = s1.b;
    let T1, T2, neu;
    if (el.ueb === "R") {
      const seite = dreh > 0 ? 1 : -1;
      const o1 = versetzt(s1, seite * wert), o2 = versetzt(s2, seite * wert);
      const C = o1 && o2 ? naechster(schnitte(o1, o2), ecke) : null;
      if (!C) { fehler.push(`Element ${i + 1}: Radius ${wert} passt nicht in die Ecke.`); continue; }
      T1 = lot(s1, C); T2 = lot(s2, C);
      neu = { t: "A", a: T1, b: T2, c: C, R: wert, ccw: seite > 0, nr: i + 1, uebergang: true };
    } else {
      const k1 = s1.t === "L" ? [plus(ecke, mal(t1, -wert))] : schnitte(s1, { t: "A", c: ecke, R: wert });
      const k2 = s2.t === "L" ? [plus(ecke, mal(t2, wert))] : schnitte(s2, { t: "A", c: ecke, R: wert });
      T1 = naechster(k1, plus(ecke, mal(t1, -wert)));
      T2 = naechster(k2, plus(ecke, mal(t2, wert)));
      if (!T1 || !T2) { fehler.push(`Element ${i + 1}: Fase ${wert} passt nicht.`); continue; }
      neu = { t: "L", a: T1, b: T2, nr: i + 1, uebergang: true };
    }
    // Der Übergang darf nicht über das Element hinausreichen
    const zuLang = (s, a, b, T) => (s.t === "L" ? skalar(minus(T, a), minus(b, a)) < -1e-9 || abstand(T, a) > abstand(b, a) + 1e-9 : false);
    if (zuLang(s1, s1.a, s1.b, T1) || zuLang(s2, s2.a, s2.b, T2)
      || abstand(T1, ecke) > abstand(s1.a, ecke) + 1e-9 || abstand(T2, ecke) > abstand(s2.b, ecke) + 1e-9) {
      fehler.push(`Element ${i + 1}: ${el.ueb === "R" ? "Radius" : "Fase"} ${wert} ist grösser als das Element.`);
      continue;
    }
    s1.b = T1; s2.a = T2;
    einfuegen.push([i, neu]);
    ecken.push(ecke);
  }
  const segmente = [];
  seg.forEach((s, i) => {
    if (s) segmente.push(s);
    einfuegen.filter(([j]) => j === i).forEach(([, n]) => segmente.push(n));
  });
  return { segmente: segmente.filter((s) => s.t === "L" ? abstand(s.a, s.b) > EPS : true), fehler, ecken };
}

// -----------------------------------------------------------------
//  2. Fertigkontur → Bahn der gedachten Schneidenspitze
//  seite: +1 Material rechts der Fahrrichtung (Aussenkontur, von der
//  Stirn nach hinten gefahren), -1 links (Innenkontur).
//  spitze: Lage der gedachten Spitze zur Schneidenmitte in Vielfachen
//  des Radius, {z, r} je -1, 0 oder 1.
// -----------------------------------------------------------------
export function bahnRechnen(segmente, rn, seite, spitze) {
  const fehler = [];
  if (!segmente.length) return { bahn: [], mitte: [], fehler };
  if (!(rn > 0)) {
    return { bahn: segmente.map((s) => ({ ...s })), mitte: segmente.map((s) => ({ ...s })), fehler };
  }
  const off = [];
  for (const s of segmente) {
    const o = versetzt(s, seite * rn);
    if (!o) {
      fehler.push(`Element ${s.nr}: Bogen R${s.R} ist kleiner als der Schneidenradius ${rn}, die Schneide kommt nicht hinein.`);
      return { bahn: [], mitte: [], fehler };
    }
    off.push(o);
  }
  const mitte = [];
  off.forEach((o, i) => {
    if (i > 0) {
      const vor = mitte[mitte.length - 1];
      const ecke = segmente[i].a;
      if (abstand(vor.b, o.a) > 1e-6) {
        const dreh = kreuz(tEnde(segmente[i - 1]), tAnfang(segmente[i]));
        const innen = dreh * seite > 0;
        if (innen) {
          const X = naechster(schnitte(vor, o), ecke);
          if (!X) { fehler.push(`Element ${o.nr}: innere Ecke für den Schneidenradius nicht lösbar.`); }
          else { vor.b = X; o.a = X; }
        } else {
          mitte.push({ t: "A", a: vor.b, b: o.a, c: ecke, R: rn, ccw: seite < 0, nr: o.nr, ecke: true });
        }
      }
    }
    mitte.push(o);
  });
  // Ist ein Element kürzer als der Schneidenradius verlangt, dreht sich
  // die verschobene Gerade um: dann würde die Schneide die Kontur verletzen.
  mitte.forEach((m, i) => {
    if (m.t !== "L" || m.ecke) return;
    const s = segmente.find((x) => x.nr === m.nr && x.t === "L" && Math.abs(kreuz(einheit(minus(x.b, x.a)), einheit(minus(m.b, m.a)))) < 1e-6);
    if (s && skalar(minus(m.b, m.a), minus(s.b, s.a)) < -1e-9) {
      fehler.push(`Element ${m.nr}: zu kurz für den Schneidenradius ${rn}, die Schneide verletzt hier die Kontur.`);
    }
    if (abstand(m.a, m.b) < 1e-6) mitte[i].leer = true;
  });
  const v = P(spitze.z * rn, spitze.r * rn);
  const bahn = mitte.filter((m) => !m.leer).map((m) => ({
    ...m, a: plus(m.a, v), b: plus(m.b, v), ...(m.t === "A" ? { c: plus(m.c, v) } : {}),
  }));
  return { bahn, mitte: mitte.filter((m) => !m.leer), fehler };
}

// -----------------------------------------------------------------
//  3. NC-Programm (Fanuc-Schreibweise wie an den Star, X im Durchmesser)
// -----------------------------------------------------------------
const z3 = (n) => { const t = (Math.round(n * 1000) / 1000).toFixed(3); return t === "-0.000" ? "0.000" : t; };

export function ncProgramm(k, bahn) {
  return ncProgrammZeilen(k, bahn).zeilen.join("\n");
}

// Wie ncProgramm, dazu je Zeile die Nummer des Elements (0 = keines),
// damit die App die Zeilen des gewählten Elements markieren kann
// (seit 1.365.0, Wunsch Patrick 3. November 2026: „im NC-Code die Zeilen
// markieren, wenn ich in der Grafik oder in der Liste auf ein Element
// klicke“)
export function ncProgrammZeilen(k, bahn) {
  if (!bahn.length) return { zeilen: ["( Noch keine gültige Kontur )"], nrs: [0] };
  const nrs = [];
  const rn = zahlVon(k.rn) || 0;
  const f = zahlVon(k.f);
  const ab = zahlVon(k.abstand) ?? 0.5;
  const tausch = !!k.g2g3Tauschen;
  const zeilen = [];
  zeilen.push(`( KONTUR AUS DEM HOFERTOOL )`);
  zeilen.push(rn > 0
    ? `( SCHNEIDENRADIUS ${z3(rn)} EINGERECHNET, OHNE G41/G42 )`
    : `( OHNE SCHNEIDENRADIUS )`);
  const erst = bahn[0].a;
  zeilen.push(`G0X${z3(erst.r * 2)}Z${z3(erst.z - ab)}`);
  zeilen.push(`G1Z${z3(erst.z)}${f ? "F" + f : ""}`);
  nrs.push(0, 0, 0, 0);
  // Vorschub je Element (seit 1.359.0, Wunsch Patrick 3. November 2026:
  // „Grundvorschub für alles, dann die einzelnen Elemente ändern“): leer
  // = Grundvorschub; F steht nur, wo er wechselt. Pause G4 am Ende des
  // Elements, in Sekunden mit U wie bei Fanuc-Drehmaschinen.
  const el = (nr) => (k.elemente || [])[nr - 1] || {};
  const fVon = (nr) => { const e = zahlVon(el(nr).f); return e && e > 0 ? e : f; };
  let fJetzt = f;
  let p = erst;
  bahn.forEach((s, i) => {
    const xz = (q) => (Math.abs(q.r - p.r) > 5e-7 ? `X${z3(q.r * 2)}` : "") + (Math.abs(q.z - p.z) > 5e-7 ? `Z${z3(q.z)}` : "");
    const fs = fVon(s.nr);
    const fText = fs && fs !== fJetzt ? "F" + fs : "";
    let zeile = "";
    if (s.t === "L") {
      const t = xz(s.b);
      if (t) zeile = `G1${t}`;
    } else {
      let g = s.ccw ? 3 : 2;
      if (tausch) g = g === 2 ? 3 : 2;
      const t = `X${z3(s.b.r * 2)}Z${z3(s.b.z)}`;
      // Über 180° ist R nicht eindeutig: Mittelpunkt mit I (Radius) und K
      zeile = bogenWinkel(s) > Math.PI - 1e-6
        ? `G${g}${t}I${z3(s.c.r - s.a.r)}K${z3(s.c.z - s.a.z)}`
        : `G${g}${t}R${z3(s.R)}`;
    }
    if (zeile) { zeilen.push(zeile + fText); nrs.push(s.nr || 0); if (fText) fJetzt = fs; }
    p = s.b;
    const naechste = bahn[i + 1];
    const pause = zahlVon(el(s.nr).pause);
    if (pause > 0 && (!naechste || naechste.nr !== s.nr)) { zeilen.push(`G4U${pause}`); nrs.push(s.nr || 0); }
  });
  zeilen.push(`G0X${z3(p.r * 2 + 2 * ab)}`);
  nrs.push(0);
  return { zeilen, nrs };
}

export const SPITZEN = [
  // Lage der gedachten Schneidenspitze, von der Schneidenmitte aus
  { id: "ol", z: -1, r: 1 }, { id: "o", z: 0, r: 1 }, { id: "or", z: 1, r: 1 },
  { id: "l", z: -1, r: 0 }, { id: "m", z: 0, r: 0 }, { id: "r", z: 1, r: 0 },
  { id: "ul", z: -1, r: -1 }, { id: "u", z: 0, r: -1 }, { id: "ur", z: 1, r: -1 },
];
