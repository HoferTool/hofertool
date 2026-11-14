// =================================================================
//  HOFERCAM: Bearbeitungssimulation Kanal 1 (seit 1.543.0)
//  Wunsch Patrick 14. November 2026: „eine Bearbeitungssimulation
//  graphisch … die Rohteilangaben hast du ja vom G266. Bedenke, dass hier
//  im Z immer das Material fährt und nicht das Werkzeug. Die Führungs-
//  büchse steht ca. 2 mm von den Drehwerkzeugen weg.“
//  Hier nur die Rechnung: NC-Zeilen → Bahnpunkte, und daraus der Stand
//  des Materials (Aussen- und Innenradius je Z-Schritt). Z im Teil: 0 an
//  der Stirn, positiv nach hinten Richtung Führungsbüchse.
// =================================================================

export const BUECHSE_MM = 2; // Führungsbüchse vor den Drehwerkzeugen
export const RASTER = 0.02; // mm je Zelle des Materials

// Werkzeugart aus dem Platz: Drehwerkzeuge radial von aussen, Front-
// werkzeuge axial, angetriebene quer / front nur als Bahn ohne Abtrag
export function werkzeugArt(platz) {
  const n = Number(platz);
  if (n >= 100 && n <= 900 && n % 100 === 0) return "dreh";
  if (n >= 1100 && n <= 1400) return "front";
  if (n >= 3421 && n <= 3429) return "frontAngetrieben";
  if (n >= 3100 && n <= 3400) return "quer";
  return "anderes";
}

function rechne(ausdruck, v) {
  let t = String(ausdruck).replace(/#(\d+)/g, (a, n) => (n in v ? "(" + v[n] + ")" : "NaN")).replace(/\[/g, "(").replace(/\]/g, ")");
  if (!/^[-+*/().\d\sNa]+$/.test(t)) return NaN;
  try { return Number(Function("return (" + t + ")")()); } catch (e) { return NaN; }
}

// Adresse → Wert, mit [ … ] und #-Variablen
function adressen(rest, v) {
  const a = {};
  const re = /([A-Z])\s*(\[[^\]]*\]|#\d+|[-+]?\d*\.?\d*)/gi;
  let m;
  while ((m = re.exec(rest))) {
    if (m[2] === "") continue;
    const w = m[2].startsWith("[") || m[2].startsWith("#") ? rechne(m[2], v) : Number(m[2]);
    const k = m[1].toUpperCase();
    if (!(k in a)) a[k] = w;
  }
  return a;
}

// NC-Zeilen Kanal 1 → Bahn. Jeder Punkt: {x (Ø), z, vor (Vorschub),
// t (Platz), nr (Zeile ab 0)}. G0 grob, Vorschub fein unterteilt.
// Kanal 2 (Gegenspindel, Rückseite): Wege zählen erst nach „G50“ (setzt
// das Teil-Koordinatensystem, Z0 = Rückseite, X negativ), bis das zweite
// G50 zurückstellt; im Teil ist dann z = W − Z und Ø = |X|.
export function bahnRechnen(zeilen, { kanal = 1, roh: rohVorher } = {}) {
  const v = {};
  const roh = rohVorher ? { ...rohVorher } : { A: null, W: null, B: null };
  let koord = kanal === 1, g50 = 0;
  const pkt = (x, z, vor, t, nr) => (kanal === 1 ? { x, z, vor, t, nr, w: tName }
    : { x: Math.abs(x), z: (roh.W ?? 0) - z, vor: vor && koord, t, nr, w: tName, kanal: 2 });
  let x = null, z = null, modal = 0, t = 0, tName = "";
  const punkte = [];
  const namen = {};
  let ende = false;
  const nach = (x1, z1, vor, nr) => {
    if (x == null) x = x1;
    if (z == null) z = z1;
    const lang = Math.hypot((x1 - x) / 2, z1 - z);
    const n = Math.max(1, Math.ceil(lang / (vor ? 0.015 : 0.5)));
    if (kanal === 2 && !koord) { x = x1; z = z1; return; }
    for (let i = 1; i <= n; i++) punkte.push(pkt(x + (x1 - x) * i / n, z + (z1 - z) * i / n, vor, t, nr));
    x = x1; z = z1;
  };
  const bogen = (x1, z1, r, im, nr) => {
    // Ebene: waagrecht z, senkrecht Radius x/2; G2 im Uhrzeigersinn
    const p0 = [z, x / 2], p1 = [z1, x1 / 2];
    const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (!(r > 0) || d === 0 || d > 2 * r + 1e-6) { nach(x1, z1, true, nr); return; }
    const h = Math.sqrt(Math.max(0, r * r - d * d / 4));
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    const ux = -(p1[1] - p0[1]) / d, uy = (p1[0] - p0[0]) / d;
    // Mitte so wählen, dass die Drehrichtung stimmt (kleiner Bogen)
    const c = im ? [mx + ux * h, my + uy * h] : [mx - ux * h, my - uy * h];
    let a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]), a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
    if (im) { while (a1 > a0) a1 -= 2 * Math.PI; } else { while (a1 < a0) a1 += 2 * Math.PI; }
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / 0.015));
    for (let i = 1; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      if (kanal === 1 || koord) punkte.push(pkt(2 * (c[1] + r * Math.sin(a)), c[0] + r * Math.cos(a), true, t, nr));
    }
    x = x1; z = z1;
  };
  zeilen.forEach((roheZeile, nr) => {
    if (ende) return;
    let s = String(roheZeile || "").trim().replace(/^\//, "").replace(/\([^)]*\)/g, "").replace(/^N\d+\s*/i, "").trim().toUpperCase();
    if (!s) return;
    if (s === "%" && nr > 0) { ende = punkte.length > 0; return; }
    if (/^M(99|30|02|2)(?!\d)/.test(s)) { ende = true; return; }
    const zuw = s.match(/^#(\d+)\s*=\s*(.+)$/);
    if (zuw) { v[zuw[1]] = rechne(zuw[2], v); return; }
    if (/^G266/.test(s)) {
      const a = adressen(s.slice(4), v);
      const map = { A: 531, W: 530, S: 529, X: 524, Z: 525, F: 522, B: 528 };
      for (const [k, n] of Object.entries(map)) if (k in a) v[n] = a[k];
      roh.A = a.A ?? roh.A; roh.W = a.W ?? roh.W; roh.B = a.B ?? roh.B;
      return;
    }
    // Werkzeugwechsel: T mit drei oder vier Ziffern am Anfang, T0 = keins
    const tw = String(roheZeile).trim().replace(/^\//, "").match(/^T(\d{3,4})\s*(\(([^)]*)\))?/i);
    if (tw) { t = Number(tw[1]); tName = (tw[3] || "").trim(); namen[t] = namen[t] || tName; return; }
    if (/(^|[^0-9])T0+$/.test(s) || /^G0+T0+$/.test(s)) t = 0;
    if (kanal === 2 && /^M75/.test(s)) { koord = false; g50 = 0; return; }
    if (kanal === 2 && /G50/.test(s) && /[XZ]/.test(s.replace(/G50/, ""))) {
      const a = adressen(s.replace(/G\d+/g, ""), v);
      g50++; koord = g50 % 2 === 1;
      if ("X" in a) x = a.X;
      if ("Z" in a) z = a.Z;
      return;
    }
    // Nur Weg-Befehle; G28, G50, Gewindezyklus G76 und andere ohne Weg
    if (/G28|G50|G76|G4(?!\d)|G04/.test(s)) return;
    const g = [...s.matchAll(/G(\d+)/g)].map((m) => Number(m[1]));
    for (const n of g) if (n <= 3) modal = n;
    const zyklus = g.find((n) => [83, 84, 85, 86, 89].includes(n));
    const ohneWinkel = s.replace(/,[AC R].*$/, "");
    const a = adressen(ohneWinkel.replace(/G\d+|M\d+|S\d+|T\d+/g, ""), v);
    let x1 = "X" in a ? a.X : x, z1 = "Z" in a ? a.Z : z;
    if ("U" in a) x1 = (x ?? 0) + a.U;
    if ("W" in a && !zyklus) z1 = (z ?? 0) + a.W;
    if (zyklus) {
      // Bohrzyklus in Z: hin mit Vorschub, zurück im Eilgang
      const ziel = "Z" in a ? a.Z : (z ?? 0) + (a.W ?? 0);
      const start = z;
      nach(x1 ?? x ?? 0, ziel, true, nr);
      nach(x, start, false, nr);
      return;
    }
    if (x1 == null && z1 == null) return;
    // ,A Winkel bei nur einer Achse: die andere aus dem Winkel
    const winkel = s.match(/,A\s*([-+]?\d*\.?\d+)/);
    if (winkel && "X" in a && !("Z" in a) && x != null && z != null) {
      const w = Number(winkel[1]) * Math.PI / 180;
      if (Math.abs(Math.tan(w)) > 1e-6) z1 = z + Math.abs((x1 - x) / 2) / Math.tan(w);
    }
    if (x == null && z == null) { x = x1 ?? 0; z = z1 ?? 0; return; }
    if (x1 == null) x1 = x;
    if (z1 == null) z1 = z;
    if (modal >= 2 && "R" in a && !/,R/.test(s)) bogen(x1, z1, a.R, modal === 2, nr);
    else nach(x1, z1, modal !== 0, nr);
  });
  return { punkte, roh, namen };
}

// Beide Kanäle nacheinander am selben Teil: zuerst Kanal 1 vorne bis zum
// Abstechen, dann Kanal 2 die Rückseite an der Gegenspindel
export function simulieren(k1, k2) {
  const b1 = bahnRechnen(k1 || []);
  const b2 = k2 && k2.length ? bahnRechnen(k2, { kanal: 2, roh: b1.roh }) : { punkte: [], namen: {} };
  return { punkte: [...b1.punkte, ...b2.punkte], roh: b1.roh, namen: { ...b1.namen, ...b2.namen },
    wechsel: b1.punkte.length, zeilen: { 1: k1 || [], 2: k2 || [] } };
}
// Kanal 2 innen oder aussen? Innen, wenn der Name es sagt oder die Bahn
// im Teil tief zur Mitte geht (unter 60 % des Rohteil-Radius)
export function k2Innen(bahn, t) {
  bahn.innen2 ||= {};
  if (t in bahn.innen2) return bahn.innen2[t];
  const W = bahn.roh.W ?? 0, R = (bahn.roh.A || 10) / 2;
  let min = Infinity;
  for (const p of bahn.punkte) if (p.kanal === 2 && p.t === t && p.vor && p.z < W - 0.05) min = Math.min(min, p.x / 2);
  return (bahn.innen2[t] = /INNEN|BOHR|ZENTR/i.test(bahn.namen[t] || "") || min < 0.6 * R);
}

// Stand des Materials nach den ersten n Punkten
export function materialStand(bahn, n) {
  const A = bahn.roh.A || 10, W = bahn.roh.W || 10, B = bahn.roh.B || 0;
  bahn.laenge ??= bahn.punkte.reduce((m, p) => Math.max(m, p.z + 5), W + B + 10);
  const laenge = bahn.laenge;
  const zellen = Math.ceil(laenge / RASTER) + 1;
  const aussen = new Float32Array(zellen).fill(A / 2), innen = new Float32Array(zellen).fill(0);
  const zelle = (z) => Math.round(z / RASTER);
  const breite = Math.max(0, Math.round((B || 0) / RASTER));
  let ab = null; // Z, an der ein Teil abgestochen wurde
  let rueck = false; // Kanal 2 hat die Rückseite bearbeitet
  for (let i = 0; i < Math.min(n, bahn.punkte.length); i++) {
    const p = bahn.punkte[i];
    if (!p.vor || !p.t || p.z < -0.001) continue;
    const k = zelle(p.z);
    if (k < 0 || k >= zellen) continue;
    if (p.kanal === 2) {
      // Rückseite: stehende Werkzeuge T2100–T2400, nur innerhalb des Teils
      if (p.t < 2100 || p.t > 2499 || p.z > (W ?? 0) + 0.001) continue;
      const r = p.x / 2;
      if (k2Innen(bahn, p.t)) { if (r < aussen[k] - 0.05 && r > innen[k]) innen[k] = r; }
      else if (r > innen[k] + 0.01 && r < aussen[k]) aussen[k] = r;
      rueck = true;
      continue;
    }
    const art = werkzeugArt(p.t);
    if (art === "dreh") {
      const r = Math.max(0, p.x / 2);
      // Abstechen: Z ist die hintere Kante (Z = W + B), der Stahl ist B breit
      const ab2 = /ABSTECH/i.test(p.w || "");
      const von = ab2 ? Math.max(0, k - breite) : k;
      for (let j = von; j <= k; j++) if (r < aussen[j]) aussen[j] = r;
      if (r <= 0.01 && ab == null) ab = Math.max(0, p.z - (ab2 ? B : 0));
    } else if (art === "front") {
      const name = p.w || "";
      const d = name.match(/D\s*(\d+(?:\.\d+)?)/i);
      const r = p.x > 0.01 ? p.x / 2 : d ? Number(d[1]) / 2 : 0.5;
      // Ein X ausserhalb des Materials ist ein Anfahrweg, kein Innendrehen
      if (r >= aussen[k] - 0.05) continue;
      // Nur an der Spitze; was sie auf dem Weg überfährt, kommt Schritt für Schritt
      if (r > innen[k]) innen[k] = r;
    }
  }
  // Fertigteil: nach Kanal 2 bis zur geplanten Rückseite W, sonst bis zum Abstich
  const laengeFertig = ab == null ? null : rueck ? Math.min(ab, W) : ab;
  return { aussen, innen, zellen, ab, A, W, B, rueck, laengeFertig };
}
