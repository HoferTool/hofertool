// =================================================================
//  ENTGRATEN MIT ANGETRIEBENEN WERKZEUGEN: Rechnen
//  Seit 1.385.0 (Wunsch Patrick 4. November 2026: „NC-Code-Generator
//  zum Entgraten … mit Kopier-, Kugel- oder Zentrierfräser Kanten an
//  einem Drehteil entgraten … Kanten am 3D-Modell anwählen … Quer- oder
//  Frontwerkzeug … Fasengrösse in der Breite oder der Tiefe … keine
//  Schwenkachse“). Zuerst für die Kanten aus Bohren / Fräsen, später
//  auch aus STEP-Dateien.
//
//  Jede Kante ist eine Folge von Punkten E mit drei Richtungen:
//   nA  Normale der Fläche A (dort wird die Breite gemessen),
//   u   in Fläche A von der Kante weg,
//   vB  in Fläche B von der Kante weg (dort liegt die Tiefe).
//  Daraus ergibt sich die Fase im Schnitt quer zur Kante.
//   Kugel- und Kopierfräser: die Kugel berührt die Fase in der Mitte.
//     Eine Kugel ist in jeder Richtung gleich, darum geht sie mit
//     Front- und Querwerkzeug, mit und ohne Y-Achse.
//   Zentrierfräser: der Kegel sitzt mit seiner Achse senkrecht auf
//     Fläche A. Ist die Bohrung oder Nut schmal genug, fährt er in der
//     Mitte und bricht beide Seiten auf einmal; sonst entlang der Kante.
//  Programmiert wird immer die Spitze des Werkzeugs, X im Durchmesser.
// =================================================================
import { kopfZeilen, fussZeilen } from "./kopf.jsx";
import { antrieb, frontLoecher, querLoecher } from "./bohren.js";

export const EG_VORGABE = {
  werkzeug: "kugel",   // kugel, kopier, zentrier
  richtung: "front",   // front oder quer
  spindel: "haupt",    // haupt oder gegen
  yHaupt: false,       // Y-Achse an der Hauptspindel
  yGegen: false,       // Y-Achse bei der Rückseitenbearbeitung
  durchmesser: 3,      // Kugel-Ø oder grösster Ø des Zentrierfräsers
  radius: 0.5,         // Kopierfräser: Schneidenradius
  winkel: 90,          // Zentrierfräser: Spitzenwinkel
  fase: 0.3,
  fasenArt: "breite",  // breite oder tiefe (Zentrierfräser)
  spitze: 0.3,         // Zentrierfräser entlang der Kante: Spitze so weit unter der Fase
  zentrierFahrt: "auto", // auto = in der Mitte, wo es geht; kontur = immer der Kante entlang
  sicher: 1,
  drehzahl: 6000,
  vorschub: 300,
  vorschubZ: 100,
  wahl: null,          // null = alle Kanten, sonst die Kennungen
  quelle: "bohren",    // bohren oder step (seit 1.389.0)
};

export const WERKZEUGE = [["kugel", "Kugelfräser"], ["kopier", "Kopierfräser"], ["zentrier", "Zentrierfräser"]];

// ---------- Vektoren ----------
const v = (x, y, z) => [x, y, z];
const plus = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mal = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const punkt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const laenge = (a) => Math.hypot(a[0], a[1], a[2]);
const einheit = (a) => { const l = laenge(a) || 1; return mal(a, 1 / l); };
const grad = (w) => (w * Math.PI) / 180;
const radial = (w) => v(Math.cos(w), Math.sin(w), 0);
const tangential = (w) => v(-Math.sin(w), Math.cos(w), 0);
const Z = v(0, 0, 1);

// ---------- Kanten aus Bohren / Fräsen ----------
// Jede Kante: { id, name, merkmal, zentrier ("front"/"quer"), c0 (Grad),
// geschlossen, punkte: [{ E, u, nA, vB }] }. Dazu je Merkmal eine Mitte
// für den Zentrierfräser: { punkte: [Punkt auf Fläche A], nA, halb }.
export function kantenAusBohren(b) {
  // Kanten aus einer STEP-Datei (seit 1.389.0) kommen fertig mit
  if (b.art === "step") return b.step || { kanten: [], mitten: {} };
  const R = b.teilD / 2, z0 = b.zStirn;
  const kanten = [], mitten = {};
  const N = 72;

  if (b.art === "bohrenFront") {
    const rB = b.bohrD / 2;
    frontLoecher(b).forEach((l, i) => {
      const w = grad(l.c), m = mal(radial(w), l.x / 2);
      const hc = v(m[0], m[1], z0);
      const punkte = [];
      for (let k = 0; k < N; k++) {
        const f = (2 * Math.PI * k) / N, r = v(Math.cos(f), Math.sin(f), 0);
        punkte.push({ E: plus(hc, mal(r, rB)), u: r, nA: Z, vB: mal(Z, -1) });
      }
      const id = "loch" + i;
      kanten.push({ id, name: "Bohrung " + (i + 1) + " (Front)", merkmal: id, zentrier: "front", c0: l.c, geschlossen: true, punkte });
      mitten[id] = { punkte: [hc], nA: Z, halb: rB };
    });
  }

  if (b.art === "bohrenQuer") {
    const rB = Math.min(b.bohrD / 2, R * 0.98);
    querLoecher(b).forEach((l, i) => {
      const w = grad(l.c), e = radial(w), t = tangential(w);
      const punkte = [];
      for (let k = 0; k < N; k++) {
        const f = (2 * Math.PI * k) / N;
        const s = rB * Math.sin(f), a = rB * Math.cos(f);
        const h = Math.sqrt(R * R - s * s);
        const E = plus(plus(mal(e, h), mal(t, s)), v(0, 0, l.z + a));
        const nA = einheit(v(E[0], E[1], 0));
        // Weg von der Bohrung auf dem Zylinder: Abstand zur Bohrachse,
        // in die Tangentialebene gelegt
        const ab = plus(mal(t, s), v(0, 0, a));
        const u = einheit(minus(ab, mal(nA, punkt(ab, nA))));
        punkte.push({ E, u, nA, vB: mal(e, -1) });
      }
      const id = "quer" + i;
      kanten.push({ id, name: "Querbohrung " + (i + 1) + " (Z-" + l.ab + ", C" + Math.round(l.c) + ")", merkmal: id, zentrier: "quer", c0: l.c, geschlossen: true, punkte });
      mitten[id] = { punkte: [plus(mal(e, R), v(0, 0, l.z))], nA: e, halb: rB };
    });
  }

  if (b.art === "nutFront") {
    const w = grad(b.startC), d = radial(w), p = tangential(w);
    const h = b.fraeser / 2;
    const durch = b.nutLaenge >= b.teilD;
    if (durch) {
      const aus = Math.sqrt(Math.max(0, R * R - h * h));
      [1, -1].forEach((sg) => {
        const punkte = [-aus, aus].map((s) => ({
          E: plus(plus(mal(d, s), mal(p, sg * h)), v(0, 0, z0)), u: mal(p, sg), nA: Z, vB: mal(Z, -1),
        }));
        kanten.push({ id: "nut" + (sg > 0 ? "L" : "R"), name: "Nut Front, Seite " + (sg > 0 ? "links" : "rechts"), merkmal: "nut", zentrier: "front", c0: b.startC, geschlossen: false, punkte });
      });
      mitten.nut = { punkte: [-(R + h), R + h].map((s) => plus(mal(d, s), v(0, 0, z0))), nA: Z, halb: h };
    } else {
      const a = Math.max(0, b.nutLaenge / 2 - h);
      const punkte = langloch(a, h, (s, q) => plus(plus(mal(d, s), mal(p, q)), v(0, 0, z0)),
        (s, q) => einheit(plus(mal(d, s), mal(p, q))), () => Z, () => mal(Z, -1));
      kanten.push({ id: "nut", name: "Nut Front, ringsum", merkmal: "nut", zentrier: "front", c0: b.startC, geschlossen: true, punkte });
      mitten.nut = { punkte: [-a, a].map((s) => plus(mal(d, s), v(0, 0, z0))), nA: Z, halb: h };
    }
  }

  if (b.art === "nutQuer") {
    const w = grad(b.startC), e = radial(w), t = tangential(w);
    const h = b.fraeser / 2;
    const offen = !(b.nutVon > 0);
    const zEnde = z0 - b.nutBis + h;
    const zAnf = offen ? z0 : z0 - b.nutVon - h;
    // Auf dem Zylinder: Seite y, Länge z
    const auf = (y, zz) => plus(plus(mal(e, Math.sqrt(Math.max(0, R * R - y * y))), mal(t, y)), v(0, 0, zz));
    const richtungen = (y, zz, uy, uz) => {
      const x = Math.sqrt(Math.max(0, R * R - y * y));
      const nA = einheit(plus(mal(e, x), mal(t, y)));
      const ty = einheit(plus(mal(e, -y / (x || 1)), t));     // Zylinder in Richtung y
      return { E: auf(y, zz), u: einheit(plus(mal(ty, uy), v(0, 0, uz))), nA, vB: mal(e, -1) };
    };
    const punkte = [];
    if (offen) {
      punkte.push(richtungen(h, z0, 1, 0), richtungen(h, zEnde, 1, 0));
      for (let k = 1; k < 18; k++) {
        const f = (Math.PI * k) / 18;
        punkte.push(richtungen(h * Math.cos(f), zEnde - h * Math.sin(f), Math.cos(f), -Math.sin(f)));
      }
      punkte.push(richtungen(-h, zEnde, -1, 0), richtungen(-h, z0, -1, 0));
    } else {
      // Langloch in (z, y): Mittellinie von zAnf bis zEnde
      const mz = (zAnf + zEnde) / 2, a = Math.max(0, (zAnf - zEnde) / 2);
      langloch(a, h, (s, q) => ({ s, q }), () => null, () => null, () => null).forEach(({ E }) => {
        const zz = mz + E.s, y = E.q;
        const cz = Math.max(-a, Math.min(a, E.s));
        const ou = einheit([E.q, E.s - cz, 0]);
        punkte.push(richtungen(y, zz, ou[0], ou[1]));
      });
    }
    kanten.push({ id: "nut", name: "Nut Quer" + (offen ? ", offen zur Stirn" : ", ringsum"), merkmal: "nut", zentrier: "quer", c0: b.startC, geschlossen: !offen, punkte });
    const xm = Math.sqrt(Math.max(0, R * R - h * h));
    mitten.nut = { punkte: [offen ? z0 + h + b.fraeser : zAnf, zEnde].map((zz) => plus(mal(e, xm), v(0, 0, zz))), nA: e, halb: h };
  }

  if (b.art === "flaeche") {
    const n = Math.max(1, Math.round(b.flaechen) || 1);
    const a = b.sw / 2;
    if (a < R) {
      const hc = Math.sqrt(R * R - a * a);
      const zA = b.flVon > 0 ? z0 - b.flVon : z0;
      const zE = z0 - b.flBis;
      for (let i = 0; i < n; i++) {
        const c = b.startC + (360 * i) / n, w = grad(c), e = radial(w), t = tangential(w);
        [1, -1].forEach((sg) => {
          const vB = einheit(plus(mal(e, -sg * hc), mal(t, sg * a)));
          const punkte = [zA, zE].map((zz) => ({
            E: plus(plus(mal(e, a), mal(t, sg * hc)), v(0, 0, zz)), u: mal(t, -sg), nA: e, vB,
          }));
          kanten.push({ id: "fl" + i + (sg > 0 ? "a" : "b"), name: "Fläche " + (i + 1) + " (C" + Math.round(c) + "), Kante " + (sg > 0 ? "links" : "rechts"), merkmal: "fl" + i, zentrier: "quer", c0: c, geschlossen: false, punkte });
        });
      }
    }
  }
  return { kanten, mitten };
}

// Langloch mit Mittellinie −a … a (Richtung s) und halber Breite h
// (Richtung q), gegen den Uhrzeigersinn: Seite, Bogen, Seite, Bogen
function langloch(a, h, ort, uVon, nAVon, vBVon) {
  const roh = [];
  const n = 18;
  for (let k = 0; k <= 4; k++) roh.push([-a + (2 * a * k) / 4, -h]);
  for (let k = 1; k < n; k++) { const f = -Math.PI / 2 + (Math.PI * k) / n; roh.push([a + h * Math.cos(f), h * Math.sin(f)]); }
  for (let k = 0; k <= 4; k++) roh.push([a - (2 * a * k) / 4, h]);
  for (let k = 1; k < n; k++) { const f = Math.PI / 2 + (Math.PI * k) / n; roh.push([-a + h * Math.cos(f), h * Math.sin(f)]); }
  return roh.map(([s, q]) => {
    const cs = Math.max(-a, Math.min(a, s));
    return { E: ort(s, q), u: uVon(s - cs, q), nA: nAVon(), vB: vBVon() };
  });
}

// ---------- Fase ----------
export function faseMasse(g) {
  if (g.werkzeug !== "zentrier") return { breite: g.fase, tiefe: g.fase };
  const tan = Math.tan(grad(Math.max(10, Math.min(170, g.winkel)) / 2));
  return g.fasenArt === "tiefe" ? { breite: g.fase * tan, tiefe: g.fase } : { breite: g.fase, tiefe: g.fase / tan };
}

// Zentrierfräser entlang der Kante: welcher Teil der Schneide die Fase
// macht. r0 = Radius des Kegels an der Oberkante der Fase (auf Fläche A),
// die Spitze liegt r0 / tan(halber Winkel) unter Fläche A. Gewählt wird
// über den Abstand der Spitze unter der Fase (spitze = r0 − Breite).
export function zentrierOrt(g) {
  const { breite: w } = faseMasse(g);
  const tan = Math.tan(grad(Math.max(10, Math.min(170, g.winkel)) / 2));
  const rMax = g.durchmesser / 2 - 0.1;
  const gewuenscht = w + Math.max(0, g.spitze || 0);
  const r0 = Math.min(rMax, gewuenscht);
  return { w, tan, rMax, r0, unten: r0 - w, tiefe: r0 / tan, zuGross: gewuenscht > rMax + 1e-9 };
}

const mitY = (g) => (g.spindel === "gegen" ? g.yGegen : g.yHaupt);
const kugelR = (g) => (g.werkzeug === "kopier" ? g.radius : g.durchmesser / 2);

// ---------- Bahnen ----------
// Je Kante oder Merkmal eine Bahn: Spitzen-Punkte, Achse je Punkt,
// C-Winkel bei Y-Achse, geschlossen ja/nein.
export function egBahnen(b, g) {
  const { kanten, mitten } = kantenAusBohren(b);
  const gewaehlt = kanten.filter((k) => !g.wahl || g.wahl.includes(k.id));
  const bahnen = [], warnungen = [];
  const { breite: w, tiefe: t } = faseMasse(g);
  const front = g.richtung === "front";
  const y = mitY(g);

  if (g.werkzeug === "zentrier") {
    const tan = Math.tan(grad(Math.max(10, Math.min(170, g.winkel)) / 2));
    const rMax = g.durchmesser / 2 - 0.1;
    const erledigt = new Set();
    gewaehlt.forEach((k) => {
      if (k.zentrier !== g.richtung) {
        warnungen.push(k.name + ": Der Zentrierfräser steht hier nur als " + (k.zentrier === "front" ? "Frontwerkzeug" : "Querwerkzeug")
          + " senkrecht auf der Fläche. Andere Richtung wählen oder Kugelfräser nehmen.");
        return;
      }
      const m = mitten[k.merkmal];
      // Schmal genug: in der Mitte fahren und beide Seiten auf einmal brechen
      if (g.zentrierFahrt !== "kontur" && m && m.halb + w <= rMax) {
        if (erledigt.has(k.merkmal)) return;
        erledigt.add(k.merkmal);
        const r0 = m.halb + w;
        const spitzen = m.punkte.map((p) => plus(p, mal(m.nA, -r0 / tan)));
        bahnen.push({ name: k.name.replace(/, (Seite|Kante) .*$/, "") + " (Mitte)", spitzen, achsen: spitzen.map(() => m.nA), c0: k.c0, geschlossen: false });
        return;
      }
      const ort = zentrierOrt(g);
      const r0 = ort.r0;
      if (r0 <= w) { warnungen.push(k.name + ": Der Zentrierfräser ist zu klein für diese Fase."); return; }
      if (ort.zuGross && !warnungen.some((t) => t.startsWith("Schneidenposition")))
        warnungen.push("Schneidenposition: so weit oben hat der Fräser keine Schneide mehr. Gerechnet mit Ø" + (2 * r0).toFixed(2)
          + " an der Fasenoberkante (Spitze " + (r0 - w).toFixed(2) + " unter der Fase).");
      if (!front && !y) {
        // Querwerkzeug ohne Y (seit 1.391.1, Patrick 4. November 2026: „warum
        // kann der Zentrierfräser nicht ohne Y-Achse entgraten beim
        // Abfahren?“): die Werkzeugachse geht immer durch die Drehmitte, C
        // dreht das Teil darunter. Auf dem Mantel (Fläche A rund um die
        // Achse) steht der Fräser so überall senkrecht auf der Fläche: der
        // Punkt neben der Kante wird auf den Mantel gelegt, die Achse zeigt
        // dort radial. Auf einer ebenen Querfläche geht das nur, wo ihre
        // Senkrechte durch die Mitte zeigt, sonst braucht es Y.
        const spitzen = [], achsen = [];
        let schief = false;
        k.punkte.forEach((p) => {
          const rE = Math.hypot(p.E[0], p.E[1]);
          const Q = plus(p.E, mal(p.u, w - r0));
          const a = einheit(v(Q[0], Q[1], 0));
          const rad = einheit(v(p.E[0], p.E[1], 0));
          const mantel = punkt(p.nA, rad) > 0.999;
          if (!mantel && punkt(p.nA, a) < Math.cos(grad(3))) schief = true;
          const S = mantel ? v(a[0] * rE, a[1] * rE, Q[2]) : Q;
          spitzen.push(plus(S, mal(a, -r0 / tan)));
          achsen.push(a);
        });
        if (schief) {
          warnungen.push(k.name + ": Die Fläche ist eben und steht nicht senkrecht zur Drehmitte. Ohne Y-Achse kann der Zentrierfräser hier nicht senkrecht darauf stehen. Y-Achse einschalten oder Kugelfräser nehmen.");
          return;
        }
        bahnen.push({ name: k.name, spitzen, achsen, c0: k.c0, geschlossen: k.geschlossen });
        return;
      }
      const spitzen = k.punkte.map((p) => plus(plus(p.E, mal(p.u, w - r0)), mal(p.nA, -r0 / tan)));
      bahnen.push({ name: k.name, spitzen, achsen: k.punkte.map((p) => p.nA), c0: k.c0, geschlossen: k.geschlossen });
    });
  } else {
    const Rk = kugelR(g);
    if (!(Rk > 0)) warnungen.push("Den Durchmesser bzw. Radius des Fräsers eintragen.");
    gewaehlt.forEach((k) => {
      const spitzen = [], achsen = [];
      k.punkte.forEach((p) => {
        const A = plus(p.E, mal(p.u, w)), B = plus(p.E, mal(p.vB, t));
        const M = mal(plus(A, B), 0.5);
        const d = einheit(minus(B, A));
        let n = minus(p.E, M);
        n = einheit(minus(n, mal(d, punkt(n, d))));
        const mitte = plus(M, mal(n, Rk));
        // Achse vom Spitzenpunkt zum Schaft: Front immer +Z; Quer radial,
        // mit Y fest in Richtung C0, ohne Y durch die Drehmitte
        const achse = front ? Z : y ? radial(grad(k.c0)) : einheit(v(mitte[0], mitte[1], 0));
        spitzen.push(minus(mitte, mal(achse, Rk)));
        achsen.push(achse);
      });
      bahnen.push({ name: k.name, spitzen, achsen, c0: k.c0, geschlossen: k.geschlossen });
    });
  }
  return { bahnen, warnungen, kanten };
}

// ---------- Prüfen ----------
export function egPruefen(b, g) {
  const w = [];
  const { bahnen, warnungen, kanten } = egBahnen(b, g);
  if (!kanten.length) w.push(b.art === "step" ? (b.step ? "In der STEP-Datei wurden keine Kanten zum Entgraten gefunden. Vielleicht liegen sie auf der anderen Seite: „Andere Seite vorne“ versuchen." : "Oben eine STEP-Datei wählen.")
    : "In Bohren / Fräsen ist keine Bearbeitung mit Kanten eingestellt.");
  else if (g.wahl && !kanten.some((k) => g.wahl.includes(k.id))) w.push("Keine Kante gewählt. Im Bild oder in der Liste antippen.");
  if (!(g.fase > 0)) w.push("Die Fasengrösse muss grösser als 0 sein.");
  const ein = g.richtung === "front" ? antrieb.frontEin : antrieb.querEin;
  if (!ein.trim()) w.push("Für das " + (g.richtung === "front" ? "Frontwerkzeug" : "Querwerkzeug") + " ist noch kein Befehl für den Antrieb eingetragen (im Reiter Bohren / Fräsen oder hier unten).");
  return { liste: [...w, ...warnungen], bahnen };
}

// ---------- G-Code ----------
const z3 = (n) => (Math.abs(n) < 0.0005 ? 0 : n).toFixed(3);
const winkelGrad = (p) => (Math.atan2(p[1], p[0]) * 180) / Math.PI;

export function egGcode(b, g) {
  const { bahnen } = egBahnen(b, g);
  const z = [];
  const front = g.richtung === "front";
  const y = mitY(g);
  const { breite, tiefe } = faseMasse(g);
  const wz = (WERKZEUGE.find(([k]) => k === g.werkzeug) || [, ""])[1];
  const R = b.teilD / 2;
  z.push("( ENTGRATEN - " + wz.toUpperCase() + " ALS " + (front ? "FRONT" : "QUER") + "WERKZEUG"
    + (g.spindel === "gegen" ? ", GEGENSPINDEL" : "") + (y ? ", MIT Y" : ", OHNE Y") + " )");
  z.push("( Fase Breite " + breite.toFixed(2) + " / Tiefe " + tiefe.toFixed(2)
    + (g.werkzeug === "zentrier" ? ", Spitzenwinkel " + g.winkel : ", Fraeser " + (g.werkzeug === "kopier" ? "R" + g.radius : "D" + g.durchmesser))
    + "  Programmiert = Werkzeugspitze )");
  kopfZeilen().forEach((x) => z.push(x));
  z.push("G98  ( Vorschub in mm/min )");
  const s = Math.round(g.drehzahl);
  const ein = (front ? antrieb.frontEin : antrieb.querEin).split(/\r?\n/).filter((x) => x.trim()).map((x) => x.replace(/\{S\}/gi, String(s)));
  if (ein.length) ein.forEach((x) => z.push(x));
  else z.push("( " + (front ? "FRONT" : "QUER") + "WERKZEUG EIN S" + s + " - BEFEHL BEI WERKZEUGANTRIEB EINTRAGEN )");

  const zSicher = b.zStirn + g.sicher;
  const xSicher = b.teilD + 2 * g.sicher;
  const F = g.vorschub, FZ = g.vorschubZ;

  if (front && !y) {
    // Polarinterpolation: X (Durchmesser) und C als ebene Koordinaten
    z.push("G0Z" + z3(zSicher));
    z.push("G12.1  ( Polarinterpolation ein )");
    bahnen.forEach((bn) => {
      const pk = bn.geschlossen ? [...bn.spitzen, bn.spitzen[0]] : bn.spitzen;
      z.push("( " + bn.name + " )");
      z.push("G0X" + z3(pk[0][0] * 2) + "C" + z3(pk[0][1]));
      z.push("G1Z" + z3(pk[0][2]) + "F" + FZ);
      pk.slice(1).forEach((p, i) => z.push("G1X" + z3(p[0] * 2) + "C" + z3(p[1]) + "Z" + z3(p[2]) + (i === 0 ? "F" + F : "")));
      z.push("G0Z" + z3(zSicher));
    });
    z.push("G13.1  ( Polarinterpolation aus )");
  } else if (y) {
    // Mit Y-Achse: C bleibt je Kante stehen, gefahren wird in X, Y, Z
    let cJetzt = null;
    if (front) z.push("G0Z" + z3(zSicher)); else z.push("G0X" + z3(xSicher));
    bahnen.forEach((bn) => {
      const w = grad(bn.c0), e = radial(w), t = tangential(w);
      const pk = (bn.geschlossen ? [...bn.spitzen, bn.spitzen[0]] : bn.spitzen).map((p) => [punkt(p, e), punkt(p, t), p[2]]);
      z.push("( " + bn.name + " )");
      if (cJetzt !== bn.c0) { z.push("G0C" + z3(((bn.c0 % 360) + 360) % 360)); cJetzt = bn.c0; }
      if (front) {
        z.push("G0X" + z3(pk[0][0] * 2) + "Y" + z3(pk[0][1]));
        z.push("G1Z" + z3(pk[0][2]) + "F" + FZ);
      } else {
        z.push("G0Y" + z3(pk[0][1]) + "Z" + z3(pk[0][2]));
        z.push("G1X" + z3(pk[0][0] * 2) + "F" + FZ);
      }
      pk.slice(1).forEach((p, i) => z.push("G1X" + z3(p[0] * 2) + "Y" + z3(p[1]) + "Z" + z3(p[2]) + (i === 0 ? "F" + F : "")));
      z.push(front ? "G0Z" + z3(zSicher) : "G0X" + z3(xSicher));
    });
    z.push("G0Y0.");
  } else {
    // Querwerkzeug ohne Y: die Achse zeigt immer durch die Drehmitte,
    // C dreht das Teil unter das Werkzeug
    z.push("G0X" + z3(xSicher));
    bahnen.forEach((bn) => {
      const pk = bn.geschlossen ? [...bn.spitzen, bn.spitzen[0]] : bn.spitzen;
      let cAlt = null;
      const cVon = (p) => {
        let c = winkelGrad(p);
        if (cAlt !== null) { while (c - cAlt > 180) c -= 360; while (c - cAlt < -180) c += 360; }
        cAlt = c; return c;
      };
      z.push("( " + bn.name + " )");
      const c0 = cVon(pk[0]);
      z.push("G0Z" + z3(pk[0][2]) + "C" + z3(((c0 % 360) + 360) % 360));
      cAlt = ((c0 % 360) + 360) % 360;
      z.push("G1X" + z3(Math.hypot(pk[0][0], pk[0][1]) * 2) + "F" + FZ);
      pk.slice(1).forEach((p, i) => z.push("G1X" + z3(Math.hypot(p[0], p[1]) * 2) + "C" + z3(cVon(p)) + "Z" + z3(p[2]) + (i === 0 ? "F" + F : "")));
      z.push("G0X" + z3(xSicher));
    });
  }
  if (!bahnen.length) z.push("( KEINE KANTE )");
  z.push(front ? "G0Z" + z3(zSicher + 5) : "G0X" + z3(xSicher + 4));
  const aus = (front ? antrieb.frontAus : antrieb.querAus).split(/\r?\n/).filter((x) => x.trim()).map((x) => x.replace(/\{S\}/gi, String(s)));
  if (aus.length) aus.forEach((x) => z.push(x));
  else z.push("( " + (front ? "FRONT" : "QUER") + "WERKZEUG AUS )");
  fussZeilen().forEach((x) => z.push(x));
  void R;
  return z.join("\n");
}
