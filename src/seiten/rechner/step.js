// =================================================================
//  RECHNER → KONTUR: SEITENKONTUR AUS EINEM STEP-MODELL
//  (seit 1.359.0, Wunsch Patrick 3. November 2026: „Platzierung eines
//  3D-Modells, daraus die Seitenkontur übernehmen?“ – „STEP“)
//
//  Ein Drehteil besteht aus Flächen, die um eine Achse laufen:
//  Zylinder, Planflächen, Kegel, Tori (Radien) und Kugeln. Jede solche
//  Fläche wird von Kreisen um die Achse begrenzt, und jeder Kreis ist
//  im Längsschnitt genau ein Punkt (Z, Radius). Zwei Punkte einer
//  Fläche geben ein Stück der Seitenkontur: Zylinder, Plan und Kegel
//  eine Gerade, Torus und Kugel einen Bogen mit genauem Radius. Die
//  Stücke werden zu einem Zug verbunden. Flächen, die nicht um die
//  Achse laufen (Schlüsselflächen, Querbohrungen), fallen weg.
//
//  Gelesen wird die STEP-Datei als Text (ISO 10303-21), ohne fremde
//  Bibliothek: es braucht nur wenige Arten von Einträgen.
// =================================================================

const EPS = 1e-4;

// --- Einträge lesen ---------------------------------------------------
function werteLesen(t) {
  let i = 0;
  const leer = () => { while (i < t.length && /\s/.test(t[i])) i++; };
  const wert = () => {
    leer();
    const c = t[i];
    if (c === "(") {
      i++; const liste = [];
      leer();
      if (t[i] === ")") { i++; return liste; }
      for (;;) { liste.push(wert()); leer(); if (t[i] === ",") { i++; continue; } if (t[i] === ")") { i++; break; } return liste; }
      return liste;
    }
    if (c === "'") {
      let s = ""; i++;
      while (i < t.length) { if (t[i] === "'") { if (t[i + 1] === "'") { s += "'"; i += 2; continue; } i++; break; } s += t[i++]; }
      return s;
    }
    if (c === "#") { i++; let n = ""; while (/\d/.test(t[i])) n += t[i++]; return { ref: +n }; }
    if (c === ".") { i++; let n = ""; while (t[i] !== ".") n += t[i++]; i++; return { enum: n }; }
    if (c === "$" || c === "*") { i++; return null; }
    // Zahl oder eingebetteter Typ wie LENGTH_MEASURE(1.)
    let n = "";
    while (i < t.length && !/[,()]/.test(t[i])) n += t[i++];
    n = n.trim();
    if (t[i] === "(" && /^[A-Z_]/.test(n)) { const inner = wert(); return { typ: n, werte: inner }; }
    return Number(n);
  };
  return wert();
}

export function stepLesen(text) {
  const daten = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const anfang = daten.indexOf("DATA;");
  const teil = anfang >= 0 ? daten.slice(anfang + 5) : daten;
  const e = new Map();
  // #12=NAME(…); über mehrere Zeilen. Zusammengesetzte (#12=(A()B());) bleiben weg.
  const muster = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*(\([\s\S]*?\))\s*;(?=\s*(?:#\d+\s*=|ENDSEC))/g;
  let m;
  while ((m = muster.exec(teil))) {
    try { e.set(+m[1], { typ: m[2], w: werteLesen(m[3]) }); } catch (f) { /* einzelner kaputter Eintrag */ }
  }
  const zoll = /CONVERSION_BASED_UNIT\s*\(\s*'INCH'/i.test(daten);
  return { e, faktor: zoll ? 25.4 : 1 };
}

// --- Geometrie --------------------------------------------------------
const v = (a, b, c) => ({ x: a, y: b, z: c });
const vMinus = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const vPlus = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const vMal = (a, k) => v(a.x * k, a.y * k, a.z * k);
const vSkalar = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const vLaenge = (a) => Math.sqrt(vSkalar(a, a));
const vEinheit = (a) => { const l = vLaenge(a); return l < 1e-12 ? v(0, 0, 1) : vMal(a, 1 / l); };

export function modell(text) {
  const { e, faktor } = stepLesen(text);
  const hol = (r) => (r && r.ref ? e.get(r.ref) : null);
  const punkt = (r) => { const p = hol(r); return p && p.typ === "CARTESIAN_POINT" ? vMal(v(...p.w[1].concat([0, 0, 0]).slice(0, 3)), faktor) : null; };
  const richtung = (r) => { const d = hol(r); return d && d.typ === "DIRECTION" ? vEinheit(v(...d.w[1].concat([0, 0, 0]).slice(0, 3))) : v(0, 0, 1); };
  const lage = (r) => { const a = hol(r); if (!a || a.typ !== "AXIS2_PLACEMENT_3D") return null; return { o: punkt(a.w[1]), d: richtung(a.w[2]) }; };

  const flaechen = [];
  for (const [, ein] of e) {
    if (ein.typ !== "ADVANCED_FACE" && ein.typ !== "FACE_SURFACE") continue;
    const s = hol(ein.w[2]);
    if (!s) continue;
    const art = s.typ;
    const f = { art, kreise: [], punkte: [], andere: 0 };
    if (art === "CYLINDRICAL_SURFACE") Object.assign(f, { lage: lage(s.w[1]), R: s.w[2] * faktor });
    else if (art === "CONICAL_SURFACE") Object.assign(f, { lage: lage(s.w[1]), R: s.w[2] * faktor });
    else if (art === "PLANE") Object.assign(f, { lage: lage(s.w[1]) });
    else if (art === "TOROIDAL_SURFACE") Object.assign(f, { lage: lage(s.w[1]), R: s.w[2] * faktor, r: s.w[3] * faktor });
    else if (art === "SPHERICAL_SURFACE") Object.assign(f, { lage: lage(s.w[1]), R: s.w[2] * faktor });
    else { flaechen.push({ art: "andere" }); continue; }
    if (!f.lage || !f.lage.o) continue;
    for (const b of ein.w[1] || []) {
      const bound = hol(b); const loop = bound && hol(bound.w[1]);
      if (!loop || loop.typ !== "EDGE_LOOP") continue;
      for (const oe of loop.w[1] || []) {
        const o = hol(oe); const kante = o && hol(o.w[3]);
        if (!kante || kante.typ !== "EDGE_CURVE") continue;
        let kurve = hol(kante.w[3]);
        // Kurve auf einer Fläche (SURFACE_CURVE, SEAM_CURVE) oder
        // beschnitten (TRIMMED_CURVE): die eigentliche Kurve steckt darin
        for (let n = 0; n < 3 && kurve && ["SURFACE_CURVE", "SEAM_CURVE", "TRIMMED_CURVE"].includes(kurve.typ); n++) kurve = hol(kurve.w[1]);
        const p1 = hol(kante.w[1]), p2 = hol(kante.w[2]);
        if (p1 && p1.typ === "VERTEX_POINT") f.punkte.push(punkt(p1.w[1]));
        if (p2 && p2.typ === "VERTEX_POINT") f.punkte.push(punkt(p2.w[1]));
        if (kurve && kurve.typ === "CIRCLE") {
          const l = lage(kurve.w[1]);
          if (l && l.o) f.kreise.push({ o: l.o, d: l.d, R: kurve.w[2] * faktor });
        } else f.andere++;
      }
    }
    flaechen.push(f);
  }
  return flaechen;
}

// Achse: die der meisten Zylinder (sonst Kegel, Tori)
function achseFinden(flaechen) {
  const kandidaten = [];
  for (const f of flaechen) {
    if (!["CYLINDRICAL_SURFACE", "CONICAL_SURFACE", "TOROIDAL_SURFACE"].includes(f.art)) continue;
    const g = f.art === "CYLINDRICAL_SURFACE" ? 3 : 1;
    const d = f.lage.d;
    const k = kandidaten.find((a) => Math.abs(Math.abs(vSkalar(a.d, d)) - 1) < 1e-6 && aufAchse(a, f.lage.o));
    if (k) k.n += g; else kandidaten.push({ o: f.lage.o, d, n: g });
  }
  kandidaten.sort((a, b) => b.n - a.n);
  return kandidaten[0] || null;
}
function aufAchse(a, p) {
  const w = vMinus(p, a.o);
  const quer = vMinus(w, vMal(a.d, vSkalar(w, a.d)));
  return vLaenge(quer) < 1e-3;
}
const parallel = (a, d) => Math.abs(Math.abs(vSkalar(a.d, d)) - 1) < 1e-6;
const zr = (a, p) => { const w = vMinus(p, a.o); const z = vSkalar(w, a.d); return { z, r: vLaenge(vMinus(w, vMal(a.d, z))) }; };

// --- Längsschnitt -----------------------------------------------------
// Ergebnis: { stuecke: [{ a, b, t: "L"|"A", c, R }], weg: Anzahl
// weggelassener Flächen, laenge } in Z und Radius
export function schnittAusStep(text) {
  const flaechen = modell(text);
  const achse = achseFinden(flaechen);
  if (!achse) return { fehler: "Keine Drehachse gefunden. Ist es ein Drehteil (mit Zylinderflächen)?" };
  const stuecke = [];
  let weg = 0;
  const gleich = (p, q) => Math.abs(p.z - q.z) < EPS && Math.abs(p.r - q.r) < EPS;
  for (const f of flaechen) {
    if (f.art === "andere" || !f.lage) { weg++; continue; }
    const koax = f.art === "PLANE" ? parallel(achse, f.lage.d) : parallel(achse, f.lage.d) && aufAchse(achse, f.lage.o);
    if (!koax) { weg++; continue; }
    // Die Kreise um die Achse sind die Punkte im Schnitt
    const pkt = [];
    for (const k of f.kreise) {
      if (!parallel(achse, k.d) || !aufAchse(achse, k.o)) continue;
      const p = { z: zr(achse, k.o).z, r: k.R };
      if (!pkt.some((q) => gleich(p, q))) pkt.push(p);
    }
    // Ecken auf der Achse (Spitze, Mitte einer Planfläche ohne Bohrung)
    for (const q of f.punkte) {
      if (!q) continue;
      const p = zr(achse, q);
      if (p.r < EPS && !pkt.some((x) => gleich({ z: p.z, r: 0 }, x))) pkt.push({ z: p.z, r: 0 });
    }
    // Planfläche mit nur einem Kreis: ganze Scheibe bis zur Mitte, aber
    // nur, wenn alle Ecken auf diesem Kreis liegen (sonst angeschnitten,
    // etwa am Ende einer Schlüsselfläche)
    if (f.art === "PLANE" && pkt.length === 1 && pkt[0].r > EPS && !f.andere
      && f.punkte.every((q) => !q || Math.abs(zr(achse, q).r - pkt[0].r) < 1e-3)) pkt.push({ z: pkt[0].z, r: 0 });
    if (pkt.length < 2) { weg++; continue; }
    // Angeschnittene Fläche (Querbohrung, Schlüsselfläche) hat mehr
    // Kreisstücke: die Fläche reicht von den beiden äussersten
    let a = pkt[0], b = pkt[1];
    for (let i = 0; i < pkt.length; i++) for (let j = i + 1; j < pkt.length; j++) {
      if (Math.hypot(pkt[i].z - pkt[j].z, pkt[i].r - pkt[j].r) > Math.hypot(a.z - b.z, a.r - b.r)) { a = pkt[i]; b = pkt[j]; }
    }
    if (f.art === "TOROIDAL_SURFACE" || f.art === "SPHERICAL_SURFACE") {
      const mz = zr(achse, f.lage.o).z;
      const c = f.art === "TOROIDAL_SURFACE" ? { z: mz, r: Math.abs(f.R) } : { z: mz, r: 0 };
      stuecke.push({ t: "A", a, b, c, R: f.art === "TOROIDAL_SURFACE" ? f.r : f.R });
    } else stuecke.push({ t: "L", a, b });
  }
  // Doppelte (halbe Flächen) weg
  const einmal = [];
  for (const s of stuecke) {
    if (einmal.some((x) => (gleich(x.a, s.a) && gleich(x.b, s.b)) || (gleich(x.a, s.b) && gleich(x.b, s.a)))) continue;
    einmal.push(s);
  }
  if (!einmal.length) return { fehler: "Keine Flächen um die Drehachse gefunden." };
  return { stuecke: einmal, weg };
}

// Zug aus den Stücken: aussen (über die Stirn) oder innen (die Bohrung)
export function konturAusSchnitt(schnitt, { innen = false, umdrehen = false } = {}) {
  const key = (p) => Math.round(p.z / EPS) + ":" + Math.round(p.r / EPS);
  let st = schnitt.stuecke.map((s) => ({ ...s }));
  if (umdrehen) {
    const zmax = Math.max(...st.flatMap((s) => [s.a.z, s.b.z]));
    const um = (p) => ({ z: zmax - p.z, r: p.r });
    st = st.map((s) => ({ ...s, a: um(s.a), b: um(s.b), ...(s.c ? { c: um(s.c) } : {}) }));
  }
  const zmin = Math.min(...st.flatMap((s) => [s.a.z, s.b.z]));
  st = st.map((s) => ({ ...s, a: { z: s.a.z - zmin, r: s.a.r }, b: { z: s.b.z - zmin, r: s.b.r }, ...(s.c ? { c: { z: s.c.z - zmin, r: s.c.r } } : {}) }));
  const nachbarn = new Map();
  st.forEach((s, i) => { [key(s.a), key(s.b)].forEach((k) => { if (!nachbarn.has(k)) nachbarn.set(k, []); nachbarn.get(k).push(i); }); });
  const punkte = st.flatMap((s) => [s.a, s.b]);
  // Anfang: vorne (kleinstes Z), dort der kleinste Radius
  const vorne = punkte.filter((p) => p.z < EPS).sort((a, b) => a.r - b.r);
  if (!vorne.length) return { fehler: "Keine Stirnfläche gefunden." };
  const start = vorne[0];
  const ersteWahl = (nachbarn.get(key(start)) || []).map((i) => st[i]);
  const anderes = (s, p) => (key(s.a) === key(p) ? s.b : s.a);
  // aussen: zuerst die Stirn hinauf, innen: zuerst die Bohrung entlang
  let erstes = ersteWahl.find((s) => { const q = anderes(s, start); return innen ? q.z > EPS : Math.abs(q.z) < EPS && q.r > start.r; });
  if (!erstes) {
    if (innen) return { fehler: start.r < EPS ? "Das Teil hat vorne keine Bohrung." : "Keine Innenkontur gefunden." };
    erstes = ersteWahl[0];
  }
  if (!erstes) return { fehler: "Kontur nicht zusammenhängend." };
  const zug = [];
  const benutzt = new Set();
  let p = start, s = erstes;
  for (let n = 0; s && n < 2000; n++) {
    const q = anderes(s, p);
    if (q.z < p.z - EPS && zug.length) break;   // geht zurück: Ende (Bohrung bzw. Aussenseite)
    benutzt.add(s);
    zug.push({ ...s, a: p, b: q });
    p = q;
    s = (nachbarn.get(key(p)) || []).map((i) => st[i]).find((x) => !benutzt.has(x));
    if (p.r < EPS && zug.length > 1) break;
  }
  // Innen: die Rückseite hinauf gehört nicht mehr zur Bohrung
  if (innen) {
    const zmax = Math.max(...punkte.map((q) => q.z));
    while (zug.length > 1) {
      const l = zug[zug.length - 1];
      if (Math.abs(l.a.z - zmax) < EPS && Math.abs(l.b.z - zmax) < EPS && l.b.r > l.a.r) zug.pop(); else break;
    }
  }
  return { start, zug };
}

// Zug → Elemente des Konturrechners
export function elementeAusZug({ start, zug }) {
  const zahl = (n) => String(Math.round(n * 1000) / 1000);
  const elemente = [];
  // Gleich gerichtete Geraden zusammen (geteilte Flächen)
  const geraden = [];
  for (const s of zug) {
    const l = geraden[geraden.length - 1];
    if (s.t === "L" && l && l.t === "L") {
      const d1 = { z: l.b.z - l.a.z, r: l.b.r - l.a.r }, d2 = { z: s.b.z - s.a.z, r: s.b.r - s.a.r };
      if (Math.abs(d1.z * d2.r - d1.r * d2.z) < 1e-6 && d1.z * d2.z + d1.r * d2.r > 0) { l.b = s.b; continue; }
    }
    geraden.push({ ...s });
  }
  let p = start;
  for (const s of geraden) {
    const el = { art: s.t === "A" ? "bogen" : "gerade", x: "", z: "", w: "", r: "", dreh: "cw", ueb: "", uw: "" };
    if (Math.abs(s.b.r - p.r) > EPS || s.t === "A") el.x = zahl(s.b.r * 2);
    if (Math.abs(s.b.z - p.z) > EPS || s.t === "A") el.z = zahl(s.b.z);
    if (s.t === "A") {
      el.r = zahl(s.R);
      const k = (s.a.z - s.c.z) * (s.b.r - s.c.r) - (s.a.r - s.c.r) * (s.b.z - s.c.z);
      el.dreh = k > 0 ? "ccw" : "cw";
    }
    elemente.push(el);
    p = s.b;
  }
  return { startX: zahl(start.r * 2), startZ: zahl(start.z), elemente };
}
