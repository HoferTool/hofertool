// =================================================================
//  ENTGRATEN: KANTEN AUS EINER STEP-DATEI
//  Seit 1.389.0 (Wunsch Patrick 4. November 2026: „Ich will aus Bohren /
//  Fräsen entgraten können, aber auch ab STEP-Datei“).
//
//  Eine STEP-Datei beschreibt den Körper mit Flächen, die an Kanten
//  aneinanderstossen. Jede Kante gehört zu genau zwei Flächen. Für das
//  Entgraten zählen nur die scharfen, nach aussen stehenden Kanten
//  (konvex), die nicht schon an der Drehbank entstehen:
//   - Kanten zwischen zwei Drehflächen um die Hauptachse (Stirn,
//     Aussendurchmesser, Einstiche …) macht der Drehmeissel, weg damit.
//   - Tangentiale Übergänge (Radien) haben keinen Grat.
//   - Innenecken (konkav) haben keinen Grat.
//  Übrig bleiben die Ränder von Bohrungen, Nuten, Flächen.
//
//  Für jeden Punkt E auf der Kante braucht das Entgraten die Normale
//  der Fläche A (nA), die Richtung in Fläche A von der Kante weg (u)
//  und in Fläche B (vB), genau wie bei den Kanten aus Bohren / Fräsen.
//  Die Richtung „in die Fläche hinein“ ergibt sich aus der Laufrichtung
//  der Kante in der Fläche: STEP läuft die Ränder so, dass die Fläche
//  links liegt, von aussen gesehen (Normale × Laufrichtung).
//
//  Fläche A ist die, auf der das Werkzeug steht: eine Planfläche zur
//  Stirn (Frontwerkzeug) oder eine Fläche, deren Normale von der Achse
//  weg zeigt (Querwerkzeug).
//
//  Koordinaten wie in Bohren / Fräsen: Drehachse = Z, die Stirn bei Z0,
//  das Teil liegt in −Z. „Andere Seite vorne“ dreht das Teil um.
// =================================================================
import { stepLesen, modell, achsenFinden } from "./step.js";

const plus = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mal = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const punkt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const kreuz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const laenge = (a) => Math.hypot(a[0], a[1], a[2]);
const einheit = (a) => { const l = laenge(a); return l < 1e-12 ? [0, 0, 1] : mal(a, 1 / l); };
const Z = [0, 0, 1];
const runden = (x) => Math.round(x * 1e4) / 1e4;

// B-Spline (auch rational) als Funktion t ∈ [0, 1] → Punkt
function bspline(grad, pts, mults, knoten, gewichte) {
  const U = [];
  knoten.forEach((k, i) => { for (let j = 0; j < (mults[i] || 1); j++) U.push(k); });
  const n = pts.length;
  if (U.length !== n + grad + 1 || n <= grad) return null;
  const a = U[grad], b = U[n];
  return (t) => {
    const x = a + (b - a) * Math.max(0, Math.min(1, t));
    let k = grad;
    while (k < n - 1 && x >= U[k + 1]) k++;
    const d = [];
    for (let j = 0; j <= grad; j++) {
      const P = pts[k - grad + j], w = gewichte ? gewichte[k - grad + j] : 1;
      d.push([P[0] * w, P[1] * w, P[2] * w, w]);
    }
    for (let r = 1; r <= grad; r++) {
      for (let j = grad; j >= r; j--) {
        const i = k - grad + j;
        const nenner = U[i + grad - r + 1] - U[i];
        const al = nenner ? (x - U[i]) / nenner : 0;
        d[j] = d[j].map((wert, q) => (1 - al) * d[j - 1][q] + al * wert);
      }
    }
    const r = d[grad];
    return [r[0] / r[3], r[1] / r[3], r[2] / r[3]];
  };
}

// Achse wählen: Liste der möglichen Achsen (wie bei der Kontur)
export function stepAchsen(text) {
  return achsenFinden(modell(text));
}

export function kantenAusStep(text, { achse: achseNr = 0, umdrehen = false } = {}) {
  const { e, faktor, gradWinkel } = stepLesen(text);
  const achsen = stepAchsen(text);
  const ax = achsen[achseNr] || achsen[0];
  if (!ax) return { fehler: "Keine Drehachse gefunden. Ist es ein Drehteil (mit Zylinderflächen)?" };

  // Neues System: Z entlang der Achse, X irgendwo senkrecht dazu
  let dZ = [ax.d.x, ax.d.y, ax.d.z];
  if (umdrehen) dZ = mal(dZ, -1);
  const o = [ax.o.x, ax.o.y, ax.o.z];
  let dX = Math.abs(dZ[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  dX = einheit(minus(dX, mal(dZ, punkt(dX, dZ))));
  const dY = kreuz(dZ, dX);
  const dreh = (r) => [punkt(r, dX), punkt(r, dY), punkt(r, dZ)];
  let zMax = 0;   // nach dem Lesen der Ecken: Stirn auf Z0 schieben
  const roh = (r) => dreh(minus(r, o));

  const hol = (r) => (r && r.ref ? e.get(r.ref) : null);
  const vek = (w) => [Number(w[0]) || 0, Number(w[1]) || 0, Number(w[2]) || 0];
  const pkt = (r) => { const p = hol(r); return p && p.typ === "CARTESIAN_POINT" ? roh(mal(vek(p.w[1]), faktor)) : null; };
  const ri = (r) => { const d = hol(r); return d && d.typ === "DIRECTION" ? einheit(dreh(vek(d.w[1]))) : null; };
  const lage = (r) => {
    const a = hol(r);
    if (!a || a.typ !== "AXIS2_PLACEMENT_3D") return null;
    const p = pkt(a.w[1]); if (!p) return null;
    const d = ri(a.w[2]) || dreh([0, 0, 1]);
    let x = ri(a.w[3]);
    if (!x || Math.abs(punkt(x, d)) > 0.99) x = einheit(kreuz(d, Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    else x = einheit(minus(x, mal(d, punkt(x, d))));
    return { o: p, d, x, y: kreuz(d, x) };
  };
  const istWahr = (w) => !(w && w.enum === "F");

  // ---------- Flächen ----------
  const flaechen = new Map();
  const nutzung = new Map();   // Kante → [{ f, s }]
  for (const [id, ein] of e) {
    if (ein.typ !== "ADVANCED_FACE" && ein.typ !== "FACE_SURFACE") continue;
    const s = hol(ein.w[2]);
    const f = { id, sinn: istWahr(ein.w[3]) ? 1 : -1, art: s ? s.typ : "?" };
    if (s && ["PLANE", "CYLINDRICAL_SURFACE", "CONICAL_SURFACE", "TOROIDAL_SURFACE", "SPHERICAL_SURFACE"].includes(s.typ)) {
      f.lage = lage(s.w[1]);
      if (s.typ !== "PLANE") f.R = Number(s.w[2]) * faktor;
      if (s.typ === "TOROIDAL_SURFACE") f.r = Number(s.w[3]) * faktor;
      if (s.typ === "CONICAL_SURFACE") {
        const w = Number(s.w[3]);
        f.winkel = gradWinkel || w > Math.PI / 2 + 1e-6 ? (w * Math.PI) / 180 : w;
      }
    }
    else if (s) {
      // Freiformfläche (B-Spline, auch rational): Normale über die Fläche selbst
      let bs = null;
      if (s.typ === "B_SPLINE_SURFACE_WITH_KNOTS") bs = { gu: s.w[1], gv: s.w[2], pts: s.w[3], um: s.w[8], vm: s.w[9], uk: s.w[10], vk: s.w[11] };
      else if (s.typ === "KOMPLEX" && s.teile.B_SPLINE_SURFACE && s.teile.B_SPLINE_SURFACE_WITH_KNOTS) {
        const t = s.teile, k = t.B_SPLINE_SURFACE_WITH_KNOTS;
        bs = { gu: t.B_SPLINE_SURFACE[0], gv: t.B_SPLINE_SURFACE[1], pts: t.B_SPLINE_SURFACE[2], um: k[0], vm: k[1], uk: k[2], vk: k[3],
          gew: t.RATIONAL_B_SPLINE_SURFACE ? t.RATIONAL_B_SPLINE_SURFACE[0] : null };
      }
      if (bs) {
        const gitter = (bs.pts || []).map((reihe) => (reihe || []).map((r) => roh(mal(vek(hol(r) ? hol(r).w[1] : [0, 0, 0]), faktor))));
        f.frei = nurbsFlaeche(Number(bs.gu), Number(bs.gv), gitter, bs.um.map(Number), bs.vm.map(Number), bs.uk.map(Number), bs.vk.map(Number), bs.gew);
      }
    }
    flaechen.set(id, f);
    for (const b of ein.w[1] || []) {
      const bound = hol(b); const loop = bound && hol(bound.w[1]);
      if (!loop || loop.typ !== "EDGE_LOOP") continue;
      const sb = istWahr(bound.w[2]) ? 1 : -1;
      for (const oe of loop.w[1] || []) {
        const o2 = hol(oe);
        if (!o2 || !o2.w[3] || !o2.w[3].ref) continue;
        const s2 = istWahr(o2.w[4]) ? 1 : -1;
        const liste = nutzung.get(o2.w[3].ref) || [];
        liste.push({ f, s: sb * s2 });
        nutzung.set(o2.w[3].ref, liste);
      }
    }
  }

  // Normale einer Fläche (nach aussen) im Punkt p
  const normale = (f, p) => {
    if (f.frei) return f.frei.normale(p, f.sinn);
    const L = f.lage;
    if (!L) return null;
    let n;
    const w = minus(p, L.o), z = punkt(w, L.d), rv = minus(w, mal(L.d, z));
    const rl = laenge(rv), rh = rl > 1e-9 ? mal(rv, 1 / rl) : L.x;
    if (f.art === "PLANE") n = L.d;
    else if (f.art === "CYLINDRICAL_SURFACE") n = rh;
    else if (f.art === "CONICAL_SURFACE") n = einheit(minus(rh, mal(L.d, Math.tan(f.winkel))));
    else if (f.art === "TOROIDAL_SURFACE") n = einheit(minus(p, plus(L.o, mal(rh, f.R))));
    else if (f.art === "SPHERICAL_SURFACE") n = einheit(w);
    else return null;
    return mal(n, f.sinn);
  };
  // Drehfläche um die Hauptachse (macht die Drehbank)
  const umAchse = (f) => {
    const L = f.lage;
    if (!L) return false;
    const aufAchse = (q) => Math.hypot(q[0], q[1]) < 1e-3;
    if (f.art === "PLANE") return Math.abs(L.d[2]) > 0.9999;
    if (f.art === "SPHERICAL_SURFACE") return aufAchse(L.o);
    return Math.abs(L.d[2]) > 0.9999 && aufAchse(L.o);
  };

  // ---------- Kanten abtasten ----------
  const kurveVon = (k) => {
    let c = hol(k);
    for (let n = 0; n < 3 && c && ["SURFACE_CURVE", "SEAM_CURVE", "TRIMMED_CURVE", "PCURVE"].includes(c.typ); n++) c = hol(c.w[1]);
    return c;
  };
  // Kurve als Funktion t ∈ [0, 1] (bei Kreis und Ellipse eine Umdrehung)
  const kurveFn = (c) => {
    if (!c) return null;
    if (c.typ === "CIRCLE" || c.typ === "ELLIPSE") {
      const L = lage(c.w[1]); if (!L) return null;
      const a = Number(c.w[2]) * faktor, b = c.typ === "ELLIPSE" ? Number(c.w[3]) * faktor : a;
      return { zu: true, f: (t) => plus(L.o, plus(mal(L.x, a * Math.cos(2 * Math.PI * t)), mal(L.y, b * Math.sin(2 * Math.PI * t)))) };
    }
    let bs = null;
    if (c.typ === "B_SPLINE_CURVE_WITH_KNOTS") bs = { grad: c.w[1], pts: c.w[2], mults: c.w[6], knoten: c.w[7] };
    else if (c.typ === "KOMPLEX" && c.teile.B_SPLINE_CURVE && c.teile.B_SPLINE_CURVE_WITH_KNOTS) {
      const t = c.teile;
      bs = { grad: t.B_SPLINE_CURVE[0], pts: t.B_SPLINE_CURVE[1], mults: t.B_SPLINE_CURVE_WITH_KNOTS[0], knoten: t.B_SPLINE_CURVE_WITH_KNOTS[1],
        gewichte: t.RATIONAL_B_SPLINE_CURVE ? t.RATIONAL_B_SPLINE_CURVE[0] : null };
    }
    if (bs) {
      const pts = (bs.pts || []).map(pkt);
      if (pts.some((p) => !p)) return null;
      const f = bspline(Number(bs.grad), pts, (bs.mults || []).map(Number), (bs.knoten || []).map(Number), bs.gewichte ? bs.gewichte.map(Number) : null);
      return f ? { zu: false, f } : null;
    }
    return null;
  };
  // Parameter des Punkts p auf der Kurve (grob gesucht, dann verfeinert)
  const paramVon = (k, p) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= 200; i++) { const t = i / 200, d = laenge(minus(k.f(t), p)); if (d < bd) { bd = d; best = t; } }
    let schritt = 1 / 200;
    for (let n = 0; n < 20; n++) {
      schritt /= 2;
      for (const t of [best - schritt, best + schritt]) {
        const tt = k.zu ? ((t % 1) + 1) % 1 : Math.max(0, Math.min(1, t));
        const d = laenge(minus(k.f(tt), p)); if (d < bd) { bd = d; best = tt; }
      }
    }
    return best;
  };

  const kantenRoh = [];
  const draht = [];
  for (const [id, ein] of e) {
    if (ein.typ !== "EDGE_CURVE") continue;
    const v1 = hol(ein.w[1]), v2 = hol(ein.w[2]);
    const a = v1 && v1.typ === "VERTEX_POINT" ? pkt(v1.w[1]) : null;
    const b = v2 && v2.typ === "VERTEX_POINT" ? pkt(v2.w[1]) : null;
    const c = kurveVon(ein.w[3]);
    const sinn = istWahr(ein.w[4]);
    let pts = null;
    if (c && c.typ === "LINE" && a && b) pts = [a, b];
    else {
      const k = kurveFn(c);
      if (k && a && b) {
        let ta = paramVon(k, a), tb = paramVon(k, b);
        const gleich = laenge(minus(a, b)) < 1e-6;
        if (k.zu) {
          if (sinn) { while (tb <= ta + (gleich ? 0.5 : 1e-9)) tb += 1; }
          else { while (tb >= ta - (gleich ? 0.5 : 1e-9)) tb -= 1; }
        }
        const n = Math.max(4, Math.min(96, Math.ceil(Math.abs(tb - ta) * (k.zu ? 72 : 32))));
        pts = [];
        for (let i = 0; i <= n; i++) { const t = ta + ((tb - ta) * i) / n; pts.push(k.f(k.zu ? ((t % 1) + 1) % 1 : t)); }
        pts[0] = a; pts[pts.length - 1] = b;
      } else if (a && b) pts = [a, b];
    }
    if (!pts) continue;
    draht.push(pts);
    kantenRoh.push({ id, pts, v1: ein.w[1] && ein.w[1].ref, v2: ein.w[2] && ein.w[2].ref, kurve: c ? c.typ : "?" });
  }
  // Stirn auf Z0: höchstes Z aller Kantenpunkte
  zMax = -Infinity;
  let rMax = 0, zMin = Infinity;
  draht.forEach((pts) => pts.forEach((p) => { zMax = Math.max(zMax, p[2]); zMin = Math.min(zMin, p[2]); rMax = Math.max(rMax, Math.hypot(p[0], p[1])); }));
  if (!isFinite(zMax)) return { fehler: "In der STEP-Datei wurden keine Kanten gefunden." };
  const schieb = (p) => [p[0], p[1], p[2] - zMax];
  for (const f of flaechen.values()) { if (f.lage) f.lage.o = schieb(f.lage.o); if (f.frei) f.frei.versatz = zMax; }
  draht.forEach((pts, i) => { draht[i] = pts.map(schieb); });
  kantenRoh.forEach((k) => { k.pts = k.pts.map(schieb); });

  // ---------- Kanten prüfen ----------
  const gefunden = [];
  let gedreht = 0, rund = 0, innen = 0, unbekannt = 0, abseits = 0;
  for (const k of kantenRoh) {
    const nz = nutzung.get(k.id) || [];
    if (nz.length !== 2 || nz[0].f === nz[1].f) continue;   // Naht eines Zylinders
    const [F1, F2] = nz;
    if (umAchse(F1.f) && umAchse(F2.f)) { gedreht++; continue; }
    const pts = k.pts;
    const tangente = (i) => einheit(minus(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
    const info = pts.map((E, i) => {
      const T = tangente(i);
      const n1 = normale(F1.f, E), n2 = normale(F2.f, E);
      if (!n1 || !n2) return null;
      const u1 = einheit(kreuz(n1, mal(T, F1.s))), u2 = einheit(kreuz(n2, mal(T, F2.s)));
      return { E, n1, n2, u1, u2 };
    });
    if (info.some((x) => !x)) { unbekannt++; continue; }
    const m = info[Math.floor(info.length / 2)];
    if (punkt(m.n1, m.n2) > Math.cos((15 * Math.PI) / 180)) { rund++; continue; }
    if (!(punkt(m.u1, m.n2) < -0.02 && punkt(m.u2, m.n1) < -0.02)) { innen++; continue; }
    // Fläche A: Stirnseitig (Frontwerkzeug) oder von der Achse weg (Querwerkzeug)
    // Die Art muss an allen Punkten der Kante gelten (eine gewölbte
    // Bohrungswand zeigt nur stellenweise nach aussen)
    const artBei = (n, E) => {
      const radial = einheit([E[0], E[1], 0]);
      return n[2] > 0.98 ? "front" : Math.abs(n[2]) < 0.05 && punkt(n, radial) > 0.3 ? "quer" : null;
    };
    const art = (welche) => {
      const a0 = artBei(info[0][welche], info[0].E);
      return a0 && info.every((x) => artBei(x[welche], x.E) === a0) ? a0 : null;
    };
    const a1 = art("n1"), a2 = art("n2");
    let erst = 1, zentrier = a1;
    if (!a1 && a2) { erst = 2; zentrier = a2; }
    else if (a1 === "quer" && a2 === "front") { erst = 2; zentrier = "front"; }
    if (!zentrier) {
      // Weder stirnseitig noch von aussen gerade: nur, wenn eine Fläche
      // zum Frontwerkzeug schaut (Kugelfräser), sonst nicht erreichbar
      if (Math.max(m.n1[2], m.n2[2]) > 0.3) erst = m.n1[2] >= m.n2[2] ? 1 : 2;
      else { abseits++; continue; }
    }
    const A = erst === 1 ? F1.f : F2.f, B = erst === 1 ? F2.f : F1.f;
    const punkte = info.map((x) => (erst === 1
      ? { E: x.E, u: x.u1, nA: x.n1, vB: x.u2 } : { E: x.E, u: x.u2, nA: x.n2, vB: x.u1 }));
    gefunden.push({ id: k.id, v1: k.v1, v2: k.v2, A, B, zentrier, punkte });
  }

  // ---------- Zu Zügen verbinden ----------
  // Kanten mit derselben Fläche A, die sich an einer Ecke treffen und
  // ohne Knick weiterlaufen, werden eine Kante (etwa die zwei Hälften
  // eines Bohrungsrands oder Seite, Bogen, Seite einer Nut)
  const frei = new Set(gefunden);
  const ende = (g, vorne) => (vorne ? g.v1 : g.v2);
  const umkehren = (g) => ({ ...g, v1: g.v2, v2: g.v1, punkte: [...g.punkte].reverse() });
  const richtungAm = (pk, amEnde) => (amEnde
    ? einheit(minus(pk[pk.length - 1].E, pk[pk.length - 2].E)) : einheit(minus(pk[1].E, pk[0].E)));
  const zuege = [];
  for (const start of gefunden) {
    if (!frei.has(start)) continue;
    frei.delete(start);
    let zug = { ...start, teile: [start] };
    for (const vorwaerts of [true, false]) {
      for (;;) {
        const ecke = vorwaerts ? zug.v2 : zug.v1;
        if (!vorwaerts && zug.v1 === zug.v2) break;
        if (vorwaerts && zug.v1 === zug.v2 && zug.teile.length > 1) break;
        const kandidaten = [...frei].filter((g) => g.A === zug.A && (g.v1 === ecke || g.v2 === ecke));
        let passt = null;
        for (const g0 of kandidaten) {
          let g = g0;
          if (vorwaerts && g.v1 !== ecke) g = umkehren(g);
          if (!vorwaerts && g.v2 !== ecke) g = umkehren(g);
          const r1 = vorwaerts ? richtungAm(zug.punkte, true) : richtungAm(g.punkte, true);
          const r2 = vorwaerts ? richtungAm(g.punkte, false) : richtungAm(zug.punkte, false);
          if (punkt(r1, r2) > Math.cos((40 * Math.PI) / 180)) { passt = { g0, g }; break; }
        }
        if (!passt) break;
        frei.delete(passt.g0);
        const g = passt.g;
        zug = vorwaerts
          ? { ...zug, v2: g.v2, punkte: [...zug.punkte, ...g.punkte.slice(1)], teile: [...zug.teile, g] }
          : { ...zug, v1: g.v1, punkte: [...g.punkte.slice(0, -1), ...zug.punkte], teile: [g, ...zug.teile] };
        if (zug.v1 === zug.v2) break;
      }
    }
    zug.geschlossen = zug.v1 === zug.v2;
    if (zug.geschlossen && zug.punkte.length > 2) zug.punkte = zug.punkte.slice(0, -1);
    zuege.push(zug);
  }

  // ---------- Namen, C-Winkel, Mitten ----------
  const kanten = [], mitten = {};
  const zaehler = {};
  zuege.sort((a, b) => (b.punkte[0].E[2] - a.punkte[0].E[2]) || (Math.atan2(a.punkte[0].E[1], a.punkte[0].E[0]) - Math.atan2(b.punkte[0].E[1], b.punkte[0].E[0])));
  zuege.forEach((zg, i) => {
    const pk = zg.punkte;
    const mitteP = mal(pk.reduce((s, p) => plus(s, p.E), [0, 0, 0]), 1 / pk.length);
    const nMitte = einheit(pk.reduce((s, p) => plus(s, p.nA), [0, 0, 0]));
    const B = zg.teile.every((t) => t.B.art === "CYLINDRICAL_SURFACE") ? zg.teile[0].B : null;
    const bohrung = zg.geschlossen && B && B.lage && zg.teile.every((t) => t.B.lage && Math.abs(Math.abs(punkt(t.B.lage.d, B.lage.d)) - 1) < 1e-4)
      && Math.abs(punkt(B.lage.d, nMitte)) > 0.99;
    const ort = zg.zentrier === "front" ? "Front" : zg.zentrier === "quer" ? "Quer" : "schräg";
    const was = bohrung ? "Bohrung Ø" + zahl(2 * B.R) : zg.geschlossen ? "Rand" : "Kante";
    zaehler[was] = (zaehler[was] || 0) + 1;
    const c0 = zg.zentrier === "quer"
      ? (Math.atan2(nMitte[1], nMitte[0]) * 180) / Math.PI
      : Math.hypot(mitteP[0], mitteP[1]) > 0.01 ? (Math.atan2(mitteP[1], mitteP[0]) * 180) / Math.PI : 0;
    const id = "st" + i;
    kanten.push({
      id, name: was + " (" + ort + ", Z" + zahl(mitteP[2]) + ", C" + Math.round(((c0 % 360) + 360) % 360) + ")",
      merkmal: id, zentrier: zg.zentrier, c0: runden(c0), geschlossen: zg.geschlossen,
      punkte: pk.map((p) => ({ E: p.E.map(runden), u: p.u.map(runden), nA: p.nA.map(runden), vB: p.vB.map(runden) })),
    });
    if (bohrung) {
      // Mitte für den Zentrierfräser: Bohrungsachse auf der Höhe des Rands
      const d = einheit(mal(B.lage.d, punkt(B.lage.d, nMitte) < 0 ? -1 : 1));
      const auf = plus(B.lage.o, mal(d, punkt(minus(mitteP, B.lage.o), d)));
      mitten[id] = { punkte: [auf.map(runden)], nA: d.map(runden), halb: runden(B.R) };
    }
  });

  return {
    kanten, mitten,
    teilD: runden(2 * rMax), laenge: runden(zMax - zMin),
    draht: draht.map((pts) => (pts.length > 24 ? pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1) : pts).map((p) => p.map((x) => Math.round(x * 1000) / 1000))),
    achsen: achsen.length,
    weg: { gedreht, rund, innen, unbekannt, abseits },
  };
}

// Basisfunktionen einer B-Spline (Cox–de Boor) an der Stelle x
function basis(U, grad, n, x) {
  let N = [];
  for (let i = 0; i < U.length - 1; i++) N.push(x >= U[i] && x < U[i + 1] ? 1 : 0);
  // rechter Rand gehört zum letzten Stück
  if (x >= U[U.length - 1]) { for (let i = U.length - 2; i >= 0; i--) if (U[i] < U[i + 1]) { N[i] = 1; break; } }
  for (let p = 1; p <= grad; p++) {
    const M = [];
    for (let i = 0; i < U.length - 1 - p; i++) {
      const a = U[i + p] - U[i], b = U[i + p + 1] - U[i + 1];
      M.push((a ? ((x - U[i]) / a) * N[i] : 0) + (b ? ((U[i + p + 1] - x) / b) * N[i + 1] : 0));
    }
    N = M;
  }
  return N.slice(0, n);
}
const knotenListe = (mults, knoten) => { const U = []; knoten.forEach((k, i) => { for (let j = 0; j < (mults[i] || 1); j++) U.push(k); }); return U; };

// Freiformfläche: Punkt S(u, v) und Normale beim nächsten Punkt zu p
function nurbsFlaeche(gu, gv, gitter, um, vm, uk, vk, gew) {
  const U = knotenListe(um, uk), V = knotenListe(vm, vk);
  const nu = gitter.length, nv = gitter[0] ? gitter[0].length : 0;
  if (!nu || !nv || U.length !== nu + gu + 1 || V.length !== nv + gv + 1) return null;
  const u0 = U[gu], u1 = U[nu], v0 = V[gv], v1 = V[nv];
  const S = (s, t) => {
    const Nu = basis(U, gu, nu, u0 + (u1 - u0) * Math.max(0, Math.min(1, s)));
    const Nv = basis(V, gv, nv, v0 + (v1 - v0) * Math.max(0, Math.min(1, t)));
    let x = 0, y = 0, z = 0, w = 0;
    for (let i = 0; i < nu; i++) {
      if (!Nu[i]) continue;
      for (let j = 0; j < nv; j++) {
        if (!Nv[j]) continue;
        const g = Nu[i] * Nv[j] * (gew ? Number(gew[i][j]) : 1), P = gitter[i][j];
        x += g * P[0]; y += g * P[1]; z += g * P[2]; w += g;
      }
    }
    return w ? [x / w, y / w, z / w] : [0, 0, 0];
  };
  // Grobes Raster einmal, dann je Punkt fein suchen
  const R = 24, raster = [];
  for (let i = 0; i <= R; i++) for (let j = 0; j <= R; j++) raster.push([i / R, j / R, S(i / R, j / R)]);
  const fl = {
    versatz: 0,
    normale(p0, sinn) {
      const p = [p0[0], p0[1], p0[2] + fl.versatz];
      let best = raster[0], bd = Infinity;
      for (const r of raster) { const d = laenge(minus(r[2], p)); if (d < bd) { bd = d; best = r; } }
      let [s, t] = best, h = 1 / R;
      for (let n = 0; n < 30; n++) {
        let besser = false;
        for (const [ds, dt] of [[h, 0], [-h, 0], [0, h], [0, -h]]) {
          const s2 = Math.max(0, Math.min(1, s + ds)), t2 = Math.max(0, Math.min(1, t + dt));
          const d = laenge(minus(S(s2, t2), p));
          if (d < bd) { bd = d; s = s2; t = t2; besser = true; }
        }
        if (!besser) h /= 2;
        if (h < 1e-6) break;
      }
      const e = 1e-4;
      const sa = Math.max(0, s - e), sb = Math.min(1, s + e), ta = Math.max(0, t - e), tb = Math.min(1, t + e);
      const n = kreuz(minus(S(sb, t), S(sa, t)), minus(S(s, tb), S(s, ta)));
      if (laenge(n) < 1e-14) return null;
      return mal(einheit(n), sinn);
    },
  };
  return fl;
}

function zahl(x) { return String(Math.round(x * 100) / 100).replace(/^-0$/, "0"); }
