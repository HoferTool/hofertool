// =================================================================
//  HOFERCAM: Vorlage Einstich am Mantel und an der Front
//  Seit 1.603.0 (Wunsch Patrick 17. November 2026: „in den Vorlagen
//  Einstiche für Mantel und Front, Breite, Tiefe, Ausräumstrategie
//  Schruppen und Schlichtzug, Radius und Fase im Grund und oben,
//  Plattenbreite, Länge und Eckradius, alles über eine Grafik“).
//  Entscheide Patrick: alles mit G0/G1/G2/G3 ausgeschrieben (kein
//  Beispiel vorhanden, „mach was sinnvoll ist“), programmiert ist immer
//  die Ecke der Platte, die zur Führungsbüchse steht (an der Front die
//  äussere Ecke, weil dort beide gleich weit von der Büchse sind),
//  Schruppen sticht nebeneinander ein, Schlichten fährt beide Flanken
//  von oben nach unten und den Grund zur Mitte, die Platte wird bei der
//  Vorlage abgefragt (nicht aus „Werkzeug“, das oft leer ist).
//
//  Gerechnet wird in einem eigenen Rahmen (s, t): s quer über den
//  Einstich von 0 bis B (0 = Seite zur Stirn bzw. innen an der Front),
//  t die Tiefe ab der Oberfläche (0 oben, T am Grund). Die Bahn der
//  Mitte des Eckradius ist um den Eckradius versetzt (ohne G41/G42),
//  ins Programm kommt die gedachte Ecke (Schnittpunkt der Tangenten).
//  Bogen: G2 = im Uhrzeigersinn in der Ebene Z nach rechts, Radius nach
//  oben, wie die 3D-Simulation (camSim.js) sie liest.
// =================================================================

const num = (t) => {
  const n = parseFloat(String(t ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
// Zahl wie die Steuerung sie will: höchstens 3 Stellen, immer mit Punkt
export const nc = (n) => {
  let x = Math.round(n * 1000) / 1000;
  if (Object.is(x, -0) || Math.abs(x) < 0.0005) x = 0;
  const t = String(x);
  return t.includes(".") ? t : t + ".";
};

// Felder: Masse stehen in der Skizze (EinstichBild in CamEinstichBild.jsx)
export const EINSTICH_FELDER = [
  { name: "D", text: "Ø oben", einheit: "mm", pflicht: true, lang: "Mantel: Ø der Oberfläche (X oben). Front: Aussen-Ø des Einstichs" },
  { name: "Z", text: "Z", einheit: "mm", pflicht: true, lang: "Mantel: Z der Flanke zur Stirn. Front: Z der Stirnfläche" },
  { name: "B", text: "Breite", einheit: "mm", pflicht: true, lang: "Breite des Einstichs (an der Front radial)" },
  { name: "T", text: "Tiefe", einheit: "mm", pflicht: true, lang: "Tiefe ab der Oberfläche (Mantel radial, Front in Z)" },
  { name: "eo", text: "oben", einheit: "mm", lang: "Fase oder Radius oben an beiden Kanten, leer = scharf" },
  { name: "eg", text: "Grund", einheit: "mm", lang: "Fase oder Radius im Grund an beiden Ecken, leer = scharf" },
  { name: "PB", text: "Plattenbreite", einheit: "mm", pflicht: true, lang: "Breite der Einstechplatte" },
  { name: "PL", text: "Plattenlänge", einheit: "mm", pflicht: true, lang: "Wie tief die Platte höchstens stechen kann" },
  { name: "PR", text: "Eckradius", einheit: "mm", lang: "Eckradius der Platte, leer = 0" },
  { name: "A", text: "Schlichtzugabe", einheit: "mm", lang: "Bleibt beim Schruppen an Flanken und Grund stehen", start: "0.05" },
  { name: "UE", text: "Überlappung", einheit: "mm", lang: "Überlappung der Stiche beim Schruppen, leer = 10 % der Plattenbreite" },
  { name: "Q", text: "Spanbruch alle", einheit: "mm", lang: "Beim Schruppen nach so viel Tiefe kurz zurück, leer = in einem Zug" },
  { name: "RZ", text: "Rückzug", einheit: "mm", lang: "So weit zurück beim Spanbruch", start: "0.2" },
  { name: "S", text: "Sicherheitsabstand", einheit: "mm", lang: "Abstand über der Oberfläche beim Anfahren und zwischen den Stichen", start: "0.5" },
  { name: "FR", text: "Vorschub Schruppen", einheit: "mm/U", pflicht: true, start: "0.03" },
  { name: "FS", text: "Vorschub Schlichten", einheit: "mm/U", pflicht: true, start: "0.02" },
];

export const EINSTICH_START = {
  lage: "mantel", strat: "beide", eoArt: "", egArt: "",
  ...Object.fromEntries(EINSTICH_FELDER.filter((f) => f.start !== undefined).map((f) => [f.name, f.start])),
};

// ---------- Vektoren in (s, t) ----------
const P = (s, t) => [s, t];
const plus = (a, b) => [a[0] + b[0], a[1] + b[1]];
const minus = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mal = (a, k) => [a[0] * k, a[1] * k];
const lang = (a) => Math.hypot(a[0], a[1]);
const einh = (a) => { const l = lang(a) || 1; return [a[0] / l, a[1] / l]; };
const kreuz = (a, b) => a[0] * b[1] - a[1] * b[0];
const skal = (a, b) => a[0] * b[0] + a[1] * b[1];
const gleich = (a, b) => lang(minus(a, b)) < 1e-7;

// Richtung eines Elements an einem Ende
function richtung(e, amAnfang) {
  if (e.t === "L") return einh(minus(e.b, e.a));
  const p = amAnfang ? e.a : e.b;
  const u = einh(minus(p, e.c));
  return e.ccw ? [-u[1], u[0]] : [u[1], -u[0]];
}
// Bogen von a nach b um c, Drehsinn aus der Richtung am Anfang
const bogen = (a, b, c, d0) => ({ t: "A", a, b, c, ccw: kreuz(minus(a, c), d0) > 0 });
const linie = (a, b) => ({ t: "L", a, b });

// Schnitt zweier Geraden (Punkt + Richtung)
function schnitt(p, d, q, e) {
  const k = kreuz(d, e);
  if (Math.abs(k) < 1e-12) return null;
  return plus(p, mal(d, kreuz(minus(q, p), e) / k));
}

// Bahn um r versetzt, zur Seite „seite“ (+1 = links der Fahrtrichtung
// mit t nach unten gezählt, siehe normale). Konvexe Ecken bekommen einen
// Bogen um die Ecke, konkave werden geschnitten; ein zu kleiner Radius
// in einer Innenecke fällt weg (die Ecke bekommt dann den Eckradius).
function versetzen(elemente, r, seite) {
  const nrm = (d) => mal([d[1], -d[0]], seite);
  if (!(r > 0)) return elemente.map((e) => ({ ...e }));
  let o = [];
  for (const e of elemente) {
    if (e.t === "L") {
      const n = nrm(richtung(e, true));
      o.push({ ...linie(plus(e.a, mal(n, r)), plus(e.b, mal(n, r))), roh: e });
    } else {
      const na = nrm(richtung(e, true)), nb = nrm(richtung(e, false));
      const a = plus(e.a, mal(na, r)), b = plus(e.b, mal(nb, r));
      const innen = skal(na, minus(e.a, e.c)) < 0;   // Versatz Richtung Mitte
      const R = lang(minus(e.a, e.c));
      if (innen && R <= r + 1e-9) continue;        // Innenradius kleiner als Eckradius
      o.push({ ...e, a, b, roh: e });
    }
  }
  // Übergänge
  const neu = [];
  for (let i = 0; i < o.length; i++) {
    const e = o[i];
    if (!neu.length) { neu.push(e); continue; }
    const v = neu[neu.length - 1];
    if (gleich(v.b, e.a)) { neu.push(e); continue; }
    const d1 = richtung(v, false), d2 = richtung(e, true);
    const konkav = skal(d2, nrm(d1)) > 1e-9;
    if (!konkav) {
      // Bogen um die gemeinsame Ecke der Rohbahn
      const ecke = v.roh.b;
      neu.push(bogen(v.b, e.a, ecke, d1));
      neu.push(e);
    } else if (v.t === "L" && e.t === "L") {
      const x = schnitt(v.a, d1, e.a, d2);
      if (x) { neu[neu.length - 1] = { ...v, b: x }; neu.push({ ...e, a: x }); }
      else neu.push(e);
    } else {
      neu.push(linie(v.b, e.a), e);
    }
  }
  // Linien, die durch das Schneiden rückwärts laufen, fallen weg
  for (let lauf = 0; lauf < 5; lauf++) {
    const i = neu.findIndex((e, k) => e.t === "L" && e.roh && k > 0 && k < neu.length - 1
      && skal(minus(e.b, e.a), minus(e.roh.b, e.roh.a)) < -1e-9);
    if (i < 0) break;
    const v = neu[i - 1], n = neu[i + 1];
    if (v.t !== "L" || n.t !== "L") break;
    const x = schnitt(v.a, richtung(v, false), n.a, richtung(n, true));
    if (!x) break;
    neu.splice(i - 1, 3, { ...v, b: x }, { ...n, a: x });
  }
  return neu.filter((e) => !gleich(e.a, e.b));
}

// Kontur einer Flanke von oben zur Mitte, für die Seite s = 0.
// eo / eg: { art: "F" | "R" | "", w }
function flankenKontur(T, eo, eg, sEnde, vor) {
  const el = [];
  const o = eo.art && eo.w > 0 ? eo.w : 0;
  const g = eg.art && eg.w > 0 ? eg.w : 0;
  const start = P(-o - vor, 0);
  const oA = P(-o, 0), oB = P(0, o);
  el.push(linie(start, oA));
  if (o) el.push(eo.art === "R" ? bogen(oA, oB, P(-o, o), [1, 0]) : linie(oA, oB));
  const gA = P(0, T - g), gB = P(g, T);
  el.push(linie(oB, gA));
  if (g) el.push(eg.art === "R" ? bogen(gA, gB, P(g, T - g), [0, 1]) : linie(gA, gB));
  if (sEnde > g + 1e-9) el.push(linie(gB, P(sEnde, T)));
  return el.filter((e) => !gleich(e.a, e.b));
}

const spiegeln = (B) => (p) => P(B - p[0], p[1]);
function konturSpiegeln(el, B) {
  const m = spiegeln(B);
  return el.map((e) => (e.t === "L" ? linie(m(e.a), m(e.b)) : { ...e, a: m(e.a), b: m(e.b), c: m(e.c), ccw: !e.ccw }));
}

// Werte lesen und prüfen
export function einstichWerte(w) {
  const g = (n) => num(w[n]);
  const v = {
    lage: w.lage === "front" ? "front" : "mantel",
    strat: ["schruppen", "schlichten"].includes(w.strat) ? w.strat : "beide",
    D: g("D"), Z: g("Z"), B: g("B"), T: g("T"),
    eo: { art: w.eoArt || "", w: g("eo") || 0 }, eg: { art: w.egArt || "", w: g("eg") || 0 },
    PB: g("PB"), PL: g("PL"), PR: g("PR") || 0,
    A: g("A") ?? 0, Q: g("Q"), RZ: g("RZ") ?? 0.2, S: g("S") ?? 0.5,
    FR: w.FR, FS: w.FS,
  };
  v.UE = g("UE") ?? (v.PB ? Math.round(v.PB * 100) / 1000 : 0);
  if (v.strat === "schlichten") v.A = 0;
  return v;
}

export function einstichFehler(w) {
  const v = einstichWerte(w);
  const fehlt = EINSTICH_FELDER.filter((f) => f.pflicht && num(w[f.name]) == null).map((f) => f.text);
  if (fehlt.length) return "Fehlt: " + fehlt.join(", ");
  if (!(v.B > 0) || !(v.T > 0)) return "Breite und Tiefe müssen grösser als 0 sein.";
  if (!(v.PB > 0)) return "Die Plattenbreite muss grösser als 0 sein.";
  if (v.PB > v.B + 1e-9) return "Die Platte ist breiter als der Einstich.";
  if (v.PL < v.T - 1e-9) return "Die Platte ist zu kurz für diese Tiefe (Länge " + v.PL + ", Tiefe " + v.T + ").";
  if (v.PR * 2 > v.PB + 1e-9) return "Der Eckradius ist grösser als die halbe Plattenbreite.";
  if (v.strat !== "schlichten" && v.PB > v.B - 2 * v.A + 1e-9) return "Zum Schruppen muss die Platte schmaler sein als Breite − 2 × Schlichtzugabe.";
  if (v.A < 0 || v.A * 1 >= v.T) return "Die Schlichtzugabe passt nicht zur Tiefe.";
  if (v.eo.w + v.eg.w > v.T + 1e-9) return "Fase / Radius oben und im Grund zusammen sind grösser als die Tiefe.";
  if (2 * Math.max(v.eg.w, 0) > v.B + 1e-9) return "Fase / Radius im Grund ist grösser als die halbe Breite.";
  if (v.lage === "front" && v.D / 2 - v.B < -1e-9) return "Der Einstich ist breiter als der halbe Aussen-Ø.";
  if (v.lage === "mantel" && v.D / 2 - v.T < -1e-9) return "Der Einstich ist tiefer als der halbe Ø.";
  if (v.Q != null && v.Q > 0 && !(v.RZ > 0)) return "Für den Spanbruch einen Rückzug grösser als 0 eintragen.";
  return null;
}

// Hinweise, die das Programm nicht verhindern
export function einstichHinweise(w) {
  const v = einstichWerte(w);
  const h = [];
  if (v.eg.art === "R" && v.eg.w > 0 && v.eg.w < v.PR) h.push("Der Radius im Grund ist kleiner als der Eckradius der Platte, dort entsteht der Eckradius.");
  if (v.eo.w > 0 && v.strat === "schruppen") h.push("Fase / Radius oben macht erst das Schlichten.");
  return h;
}

// (s, t) → Maschine: X im Durchmesser
function abbildung(v) {
  if (v.lage === "front") {
    const ri = v.D / 2 - v.B;
    return (p) => ({ x: 2 * (ri + p[0]), z: v.Z + p[1] });
  }
  return (p) => ({ x: v.D - 2 * p[1], z: v.Z + p[0] });
}

export function einstichZeilen(w) {
  const f = einstichFehler(w);
  if (f) return { fehler: f };
  const v = einstichWerte(w);
  const M = abbildung(v);
  const z = [];
  const xz = (p, nur) => {
    const m = M(p);
    if (nur === "x") return "X" + nc(m.x);
    if (nur === "z") return "Z" + nc(m.z);
    return "X" + nc(m.x) + "Z" + nc(m.z);
  };
  // Achse der Tiefe: Mantel X, Front Z
  const tief = v.lage === "front" ? "z" : "x";
  const quer = v.lage === "front" ? "x" : "z";
  const front = v.lage === "front";
  const rand = (e) => (e.art === "F" ? "F" : e.art === "R" ? "R" : "") + (e.art && e.w ? nc(e.w) : "");
  z.push("(EINSTICH " + (front ? "FRONT DA" + nc(v.D) : "MANTEL D" + nc(v.D)) + " Z" + nc(v.Z)
    + " B" + nc(v.B) + " T" + nc(v.T)
    + (v.eo.art && v.eo.w ? " OBEN " + rand(v.eo) : "") + (v.eg.art && v.eg.w ? " GRUND " + rand(v.eg) : "") + ")");
  z.push("(PLATTE B" + nc(v.PB) + " L" + nc(v.PL) + " R" + nc(v.PR) + ", PROGRAMMIERT ECKE " + (front ? "AUSSEN" : "ZUR BUECHSE") + ")");

  // ---------- Schruppen ----------
  if (v.strat !== "schlichten") {
    z.push("(SCHRUPPEN)");
    // Programmiert ist die Ecke bei s (rechte Seite der Platte)
    const sMax = v.B - v.A, sMin = v.A + v.PB;
    const schritt = Math.max(0.001, v.PB - Math.max(0, v.UE));
    // Gleich verteilt, damit kein letzter Stich nur ein paar Hundertstel nimmt
    const n = sMax - sMin > 1e-6 ? Math.ceil((sMax - sMin) / schritt - 1e-9) : 0;
    const lagen = Array.from({ length: n + 1 }, (_, i) => (n ? sMax - ((sMax - sMin) * i) / n : sMax));
    const tEnde = v.T - v.A;
    const oben = -v.S;
    z.push("G0" + xz(P(lagen[0], oben)));
    lagen.forEach((s, i) => {
      if (i) z.push("G0" + xz(P(s, oben), quer));
      if (v.Q > 0) {
        let t = 0;
        while (t < tEnde - 1e-6) {
          const neu = Math.min(tEnde, t + v.Q);
          z.push("G1" + xz(P(s, neu), tief) + (t === 0 && i === 0 ? "F" + v.FR : ""));
          if (neu < tEnde - 1e-6) z.push("G0" + xz(P(s, neu - v.RZ), tief));
          t = neu;
        }
      } else {
        z.push("G1" + xz(P(s, tEnde), tief) + (i === 0 ? "F" + v.FR : ""));
      }
      z.push("G0" + xz(P(s, oben), tief));
    });
  }

  // ---------- Schlichten ----------
  if (v.strat !== "schruppen") {
    const r = v.PR;
    const gL = v.eg.art && v.eg.w > 0 ? v.eg.w : 0;
    // Seite zur Stirn (s = 0) mit der Ecke dort: Grund bis höchstens dahin,
    // wo die Platte die andere Flanke (noch mit Zugabe) berührt
    const sL = Math.max(gL, Math.min(v.B / 2, v.B - v.A - v.PB));
    // Seite zur Büchse: Grund bis zur Mitte, die Platte bleibt weg von der
    // fertigen Fase / dem Radius im Grund der ersten Seite
    const sR = Math.min(v.B - gL, Math.max(v.B / 2, v.PB + gL));
    const vor = Math.max(0.5, r);
    const links = flankenKontur(v.T, v.eo, v.eg, sL, vor);
    const rechts = konturSpiegeln(flankenKontur(v.T, v.eo, v.eg, v.B - sR, vor), v.B);
    // Mitte des Eckradius → programmierte Ecke (rechte Ecke der Platte)
    const durchgang = (el, seite, versatz, titel) => {
      z.push("(SCHLICHTEN " + titel + ")");
      const bahn = versetzen(el, r, seite).map((e) => ({
        ...e, a: plus(e.a, versatz), b: plus(e.b, versatz), ...(e.c ? { c: plus(e.c, versatz) } : {}),
      }));
      if (!bahn.length) return;
      const a0 = bahn[0].a;
      z.push("G0" + xz(P(a0[0], Math.min(-v.S, a0[1] - v.S))));
      z.push("G1" + xz(a0, tief) + "F" + v.FS);
      for (const e of bahn) {
        if (e.t === "L") { z.push("G1" + xz(e.b)); continue; }
        // Drehsinn in der Maschine: Ebene Z nach rechts, Radius nach oben
        const m = (p) => { const q = M(p); return [q.z, q.x / 2]; };
        const ma = m(e.a), mb = m(e.b), mc = m(e.c);
        const kz = kreuz(minus(ma, mc), minus(mb, mc));
        // Bogen unter 180°: Vorzeichen des Kreuzprodukts = Drehsinn
        z.push((kz > 0 ? "G3" : "G2") + xz(e.b) + "R" + nc(lang(minus(e.a, e.c))));
      }
      const ende = bahn[bahn.length - 1].b;
      z.push("G0" + xz(P(ende[0], -v.S), tief));
    };
    // Flanke s = 0: Mitte (r, -r) von der linken Ecke, programmiert wird
    // die rechte Ecke = linke Ecke + Plattenbreite
    durchgang(links, 1, P(v.PB - r, r), front ? "INNEN" : "ZUR STIRN");
    durchgang(rechts, -1, P(r, r), front ? "AUSSEN" : "ZUR BUECHSE");
  }
  return { zeilen: z };
}

// Für die Skizze: Umriss des fertigen Einstichs in (s, t)
export function einstichUmriss(w) {
  const v = einstichWerte(w);
  if (!(v.B > 0) || !(v.T > 0)) return null;
  const el = [...flankenKontur(v.T, v.eo, v.eg, v.B / 2, 0)];
  const re = konturSpiegeln(flankenKontur(v.T, v.eo, v.eg, v.B / 2, 0), v.B).reverse()
    .map((e) => (e.t === "L" ? linie(e.b, e.a) : { ...e, a: e.b, b: e.a, ccw: !e.ccw }));
  return [...el, ...re];
}
