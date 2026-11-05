// =================================================================
//  HOFER CAM: Programmkopf und Programmende je Maschinentyp
//  Seit 1.395.0, Schritt für Schritt nach Patricks Vorgaben (5. November
//  2026). Zuerst nur Star SB-20RG. Kanal 1 hat die Nummer O0001–O0999,
//  Kanal 2 dieselbe Nummer + 1000. Kopf und Ende stammen aus Patricks
//  Programm O0458 / O1458; „(Ende Kopf)“ und „(Start Ende)“ trennen sie
//  in beiden Kanälen. Die Bearbeitungen dazwischen kommen später.
// =================================================================

// Synchronisationsmarken der SB-20RG (Patrick 5. November 2026): M200
// bis M999, dazu M20, M40, M41, M82, M83. Vierstellige wie M1881 / M1891
// (Hochdruck ein / aus) sind keine.
const MARKEN_EINZELN = new Set([20, 40, 41, 82, 83]);
export function istMarkeNr(n) { return MARKEN_EINZELN.has(n) || (n >= 200 && n <= 999); }

// Marke einer Zeile oder null; Kommentare in Klammern zählen nicht
export function markeVon(zeile) {
  const ohne = String(zeile).replace(/\([^)]*\)?/g, "").toUpperCase();
  const re = /M(\d+)/g;
  let m;
  while ((m = re.exec(ohne))) {
    const n = Number(m[1]);
    if (m[1].length <= 3 && istMarkeNr(n)) return "M" + n;
  }
  return null;
}

// Zahl wie an der Steuerung: ohne Punkt getippt mit Punkt dahinter (17 → 17.),
// mit Punkt genau wie getippt (0.20 bleibt 0.20), Komma gilt als Punkt
export function zahl(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return t.includes(".") ? t : t + ".";
}

export const FELDER = [
  { gruppe: "Programm", felder: [
    { name: "nr", text: "Nr. Kanal 1", lang: "Programm-Nr. Kanal 1, 1 bis 999 (Kanal 2 = Nr. + 1000)", art: "nr" },
    { name: "hoco", text: "HOCO Nr.", art: "text" },
    { name: "datum", text: "Datum", lang: "Datum in G170", art: "text" },
    { name: "kuerzel", text: "Kürzel", lang: "Kürzel in G170", art: "text" },
  ] },
  { gruppe: "Grundvariablen G266", felder: [
    { name: "A", text: "A Material-Ø", lang: "A = #531 Materialdurchmesser" },
    { name: "W", text: "W Teilelänge", lang: "W = #530 Teilelänge" },
    { name: "S", text: "S Drehzahl", lang: "S = #529 Abstechdrehzahl", ganz: true },
    { name: "X", text: "X Abstechende", lang: "X = #524 Abstechendposition" },
    { name: "Z", text: "Z Start", lang: "Z = #525 Z-Achse Startposition, höchstens 200" },
    { name: "F", text: "F Vorschub", lang: "F = #522 Vorschub Abstechen" },
    { name: "B", text: "B Stahlbreite", lang: "B = #528 Breite des Abstechstahls" },
  ] },
  { gruppe: "Kanal 1", felder: [
    { name: "schlicht", text: "Schlichtzugabe Z", lang: "Kopf: G0Z…T0(SCHLICHTZUGABE)" },
    { name: "plan", text: "Zugabe Plan hinten W", lang: "Ende: G0W…(ZUGABE PLANDREHEN HINTEN)" },
  ] },
  { gruppe: "Kanal 2 Abgreifen", felder: [
    { name: "annaehern", text: "Annähern Z", lang: "Ende: G0Z…(EILGANG …MM VOR STUCK)" },
    { name: "ueber", text: "Über das Teil Z", lang: "Ende: G1G98Z…F5000.(…MM UBER DEM STUCK)" },
  ] },
];

function heute() {
  const d = new Date();
  const zz = (n) => String(n).padStart(2, "0");
  return zz(d.getDate()) + "." + zz(d.getMonth() + 1) + "." + zz(d.getFullYear() % 100);
}

// Vorgaben aus O0458 / O1458
export function vorgabe() {
  return { nr: "1", hoco: "", datum: heute(), kuerzel: "",
    A: "17", W: "15.125", S: "3000", X: "-0.8", Z: "167.85", F: "0.03", B: "1.5",
    schlicht: "-0.1", plan: "0.20", annaehern: "-10", ueber: "4", bloecke: [] };
}

// Fehler je Feld (Text) oder leer
export function pruefen(w) {
  const f = {};
  const nr = Number(w.nr);
  if (!/^\d{1,3}$/.test(String(w.nr).trim()) || nr < 1 || nr > 999) f.nr = "1 bis 999";
  for (const g of FELDER) for (const d of g.felder) {
    if (d.art) continue;
    if (zahl(w[d.name]) == null) f[d.name] = "Zahl fehlt";
    else if (d.ganz && !Number.isInteger(Number(String(w[d.name]).replace(",", ".")))) f[d.name] = "ganze Zahl";
  }
  if (!f.Z && Number(String(w.Z).replace(",", ".")) > 200) f.Z = "höchstens 200";
  return f;
}

const nr4 = (n) => String(n).padStart(4, "0");
const v = (w, n) => zahl(w[n]) ?? String(w[n] ?? "");
const ohneMinus = (t) => String(t).replace(/^-/, "").replace(/\.$/, "");

// Kanal 1: Kopf bis „(Ende Kopf)“, Ende ab „(Start Ende)“
function kanal1(w) {
  const nr = Number(w.nr) || 0;
  const kopfName = w.hoco ? "(" + w.hoco + ")" : "";
  const g170 = "G170(" + [w.datum, w.kuerzel].map((t) => String(t || "").trim()).filter(Boolean).join(" ") + ")";
  const kopf = [
    "%",
    "O" + nr4(nr) + kopfName,
    "G40G97M9G18",
    g170,
    "(GRUNDVARIABLEN DEFINIEREN)",
    "G266A" + v(w, "A") + "W" + v(w, "W") + "S" + String(w.S).trim() + "X" + v(w, "X") + "Z" + v(w, "Z") + "F" + v(w, "F") + "B" + v(w, "B"),
    "(A = #531 = MATERIALDURCHMESSER)",
    "(W = #530 = TEILELAENGE)",
    "(S = #529 = ABSTECHDREHZAHL)",
    "(X = #524 = ABSTECHENDPOSITION)",
    "(Z = #525 = Z-ACHSE STARTPOSITION 200MM.MAX)",
    "(F = #522 = VORSCHUB ABSTECHEN)",
    "(B = #528 = BREITE DES ABSTECHSTAHLS)",
    "#510=[#531+1.](#510 = WEG-/ANFAHRPOSITION)",
    "G300",
    "G125",
    "N1",
    "G18",
    "G170",
    "G40G97M9",
    "G99M3S500",
    "M11",
    "G4U0.1",
    "G125",
    "G0Z" + v(w, "schlicht") + "T0(SCHLICHTZUGABE)",
    "M10",
    "G4U0.1",
    "G1W-0.2F0.5",
    "M5",
    "N12",
    "M200",
    "M20",
    "M25",
    "M3S1000",
    "G0X[#531+4.]Z-12.",
    "M27",
    "M1",
    "(Ende Kopf)",
  ];
  const ende = [
    "(Start Ende)",
    "T100(ABSTECHEN)",
    "M25",
    "M1891(HD AUS)",
    "M1882D5",
    "N100",
    "M800",
    "G97M3S#529",
    "G00G99X#510Z[#530+#528]T1",
    "G0W" + v(w, "plan") + "(ZUGABE PLANDREHEN HINTEN)",
    "M82",
    "M40",
    "G96",
    "G50S4000",
    "M3S80",
    "G1X-0.5F#522",
    "M1894",
    "M1892",
    "M41",
    "G4",
    "M83",
    "M3S500",
    "M80(CONTROLLIERT STANGENENDE SIGNAL VOM LADER)",
    "/M98P7000",
    "M81(ENDE M80)",
    "M99P1(GEHEN AUF PROGRAMMANFANG POS N1)",
    "%",
  ];
  return { kopf, ende };
}

function kanal2(w) {
  const nr = (Number(w.nr) || 0) + 1000;
  const kopfName = w.hoco ? "(" + w.hoco + ")" : "";
  const kopf = [
    "%",
    "O" + nr4(nr) + kopfName,
    "G130",
    "G97G99G40",
    "G18",
    "M5",
    "G28W0",
    "T0",
    "T2000",
    "M200",
    "M20",
    "M5(SPINDEL STOP)",
    "(Ende Kopf)",
  ];
  const an = v(w, "annaehern"), ue = v(w, "ueber");
  const ende = [
    "(Start Ende)",
    "M75",
    "/T2900(AUSWERFEN)",
    "/M84",
    "/M4S200",
    "/G0Z38.",
    "/G4U1.",
    "/M11",
    "/G4U2.",
    "/G28W0.",
    "M1884D2",
    "M76",
    "T0",
    "M1",
    "T2000(ABGREIFEN)",
    "M11",
    "M14",
    "M5",
    "G900J50",
    "T2000",
    "M800",
    "M1894",
    "M1883D3(HD EIN)",
    "M82",
    "G131B0.",
    "M15",
    "G0Z" + an + "(EILGANG " + ohneMinus(an) + "MM VOR STUCK)",
    "M68",
    "G1G98Z" + ue + "F5000.(" + ohneMinus(ue) + "MM UBER DEM STUCK)",
    "M69",
    "M1893(HD AUS)",
    "M10",
    "G4U0.1",
    "G31",
    "M40",
    "M41",
    "M83",
    "M68",
    "M69",
    "G28W0",
    "G0T0",
    "G99",
    "M99",
    "%",
  ];
  return { kopf, ende };
}

// ---------- Bearbeitungen ----------
// Drehwerkzeuge Kanal 1 (Patrick 5. November 2026): T100 bis T600. Kopf
// der Bearbeitung: Aufruf, Hochdruck (M1881D…, nur T100–T600), Drehrichtung
// mit Drehzahl und Korrektur, Anfahren auf Rohmaterial + 1 mm. Dazwischen
// der NC-Code aus den Werkzeugen von NC-PRO. Ende: Wegfahren auf
// Rohmaterial + 0.2 mm (Winkel und Vorschub einstellbar, X30. fest),
// Hochdruck aus, Korrektur aus, M1.
export const DREH_PLAETZE = ["100", "200", "300", "400", "500", "600"];
export const HD_STUFEN = ["", "1", "2", "3", "4", "5", "6"];

// Seit 1.400.0: feste Frontwerkzeuge T1100–T1400 (Patricks Beispiel
// T1400 Bohren D6.8, 5. November 2026). Wahl Haupt- oder Gegenspindel;
// die Gegenspindel kommt erst mit Patricks Beispiel dazu.
export const FRONT_PLAETZE = ["1100", "1200", "1300", "1400"];

const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function neuerBlock(bloecke = [], art = "dreh") {
  const belegt = new Set(bloecke.map((b) => b.platz));
  if (art === "front") {
    const platz = FRONT_PLAETZE.find((p) => !belegt.has(p)) || "1100";
    return { id: neueId(), art: "front", spindel: "haupt", platz, bez: "", hd: "4", dreh: "3",
      S: "2500", anZ: "5.0", wegZ: "0", code: "" };
  }
  const platz = DREH_PLAETZE.find((p) => !belegt.has(p)) || "100";
  return { id: neueId(), art: "dreh",
    platz, bez: "", hd: "4", dreh: "3", S: "3000", anZ: "0", wegF: "0.05", wegA: "45", code: "" };
}

export function blockFehler(b) {
  const f = {};
  if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
  if (zahl(b.anZ) == null) f.anZ = "Zahl fehlt";
  if (b.art === "front") {
    if (zahl(b.wegZ) == null) f.wegZ = "Zahl fehlt";
    return f;
  }
  if (zahl(b.wegF) == null) f.wegF = "Zahl fehlt";
  if (String(b.wegA).trim() !== "" && zahl(b.wegA) == null) f.wegA = "Zahl oder leer";
  return f;
}

export function blockZeilen(b) {
  const t = Number(b.platz) / 100;
  const bez = String(b.bez || "").trim();
  if (b.art === "front") {
    // Nach Patricks T1400: Hochdruck der Front M1882D… / M1892, kein X,
    // nach der Bearbeitung mit Z zurück in sichere Richtung
    const code = String(b.code || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
    return [
      "T" + b.platz + (bez ? "(" + bez + ")" : ""),
      ...(b.hd ? ["M1882D" + b.hd] : []),
      "M" + (b.dreh === "4" ? 4 : 3) + "S" + String(b.S).trim() + "T" + t,
      "G0Z" + (zahl(b.anZ) ?? b.anZ),
      ...code,
      ...(b.hd ? ["M1892"] : []),
      "G0Z" + (zahl(b.wegZ) ?? b.wegZ),
      "T0",
      "M1",
    ];
  }
  const winkel = String(b.wegA).trim() === "" ? "" : ",A" + (zahl(b.wegA) ?? b.wegA);
  const code = String(b.code || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  return [
    "T" + b.platz + (bez ? "(" + bez + ")" : ""),
    ...(b.hd ? ["M1881D" + b.hd] : []),
    "M" + (b.dreh === "4" ? 4 : 3) + "S" + String(b.S).trim() + "T" + t,
    "G0X[#531+1.]Z" + (zahl(b.anZ) ?? b.anZ),
    ...code,
    "G1X[#531+0.2]" + winkel + "F" + (zahl(b.wegF) ?? b.wegF),
    "G0X30.",
    ...(b.hd ? ["M1891"] : []),
    "T0",
    "M1",
  ];
}

// Ganze Programme je Kanal; die Bearbeitungen stehen zwischen Kopf und Ende
export function programme(w) {
  const k1 = kanal1(w), k2 = kanal2(w);
  // Seit 1.398.0: je Block die Zeilen in Kanal 1 (von–bis, ab 1), damit
  // die Anzeige die angewählte Bearbeitung hervorheben kann
  const bereiche = {};
  let ab = k1.kopf.length;
  const bearb1 = (w.bloecke || []).flatMap((b) => {
    const z = blockZeilen(b);
    bereiche[b.id] = [ab + 1, ab + z.length];
    ab += z.length;
    return z;
  });
  return {
    bereiche,
    k1: [...k1.kopf, ...bearb1, ...k1.ende],
    k2: [...k2.kopf, ...k2.ende],
    nr1: nr4(Number(w.nr) || 0), nr2: nr4((Number(w.nr) || 0) + 1000),
  };
}

// Zwei Kanäle nebeneinander: gleiche Marken auf dieselbe Zeile, dazwischen
// Leerzeilen. Gepaart wird über die längste gemeinsame Folge der Marken;
// eine Marke ohne Gegenstück im anderen Kanal bleibt allein (fehler).
export function synchronisieren(z1, z2) {
  const m1 = [], m2 = [];
  z1.forEach((z, i) => { const m = markeVon(z); if (m) m1.push({ i, m }); });
  z2.forEach((z, i) => { const m = markeVon(z); if (m) m2.push({ i, m }); });
  // Längste gemeinsame Folge
  const L = Array.from({ length: m1.length + 1 }, () => new Array(m2.length + 1).fill(0));
  for (let a = m1.length - 1; a >= 0; a--) for (let b = m2.length - 1; b >= 0; b--) {
    L[a][b] = m1[a].m === m2[b].m ? L[a + 1][b + 1] + 1 : Math.max(L[a + 1][b], L[a][b + 1]);
  }
  const paare = [];
  for (let a = 0, b = 0; a < m1.length && b < m2.length;) {
    if (m1[a].m === m2[b].m) { paare.push([m1[a].i, m2[b].i]); a++; b++; }
    else if (L[a + 1][b] >= L[a][b + 1]) a++;
    else b++;
  }
  const gepaart1 = new Set(paare.map((p) => p[0])), gepaart2 = new Set(paare.map((p) => p[1]));
  const zelle = (zeilen, i, gepaart) => {
    const m = markeVon(zeilen[i]);
    return { text: zeilen[i], nr: i + 1, marke: m, fehler: !!m && !gepaart.has(i) };
  };
  const reihen = [];
  let p1 = 0, p2 = 0;
  const abschnitt = (bis1, bis2) => {
    const n = Math.max(bis1 - p1, bis2 - p2);
    for (let k = 0; k < n; k++) {
      const i1 = p1 + k, i2 = p2 + k;
      reihen.push({
        k1: i1 < bis1 ? zelle(z1, i1, gepaart1) : null,
        k2: i2 < bis2 ? zelle(z2, i2, gepaart2) : null,
      });
    }
    p1 = bis1; p2 = bis2;
  };
  for (const [i1, i2] of paare) {
    abschnitt(i1, i2);
    reihen.push({ sync: true, k1: zelle(z1, i1, gepaart1), k2: zelle(z2, i2, gepaart2) });
    p1 = i1 + 1; p2 = i2 + 1;
  }
  abschnitt(z1.length, z2.length);
  const fehler = reihen.reduce((n, r) => n + (r.k1?.fehler ? 1 : 0) + (r.k2?.fehler ? 1 : 0), 0);
  return { reihen, fehler };
}
