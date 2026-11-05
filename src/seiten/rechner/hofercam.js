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

// Zahl wie an der Steuerung: ganze Zahlen mit Punkt (17.), sonst wie getippt
export function zahl(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Number.isInteger(n) ? n + "." : String(n);
}

export const FELDER = [
  { gruppe: "Programm", felder: [
    { name: "nr", text: "Programm-Nr. Kanal 1 (1–999)", art: "nr" },
    { name: "hoco", text: "HOCO Nr.", art: "text" },
    { name: "datum", text: "Datum (G170)", art: "text" },
    { name: "kuerzel", text: "Kürzel (G170)", art: "text" },
  ] },
  { gruppe: "Grundvariablen G266", felder: [
    { name: "A", text: "A = #531 Materialdurchmesser" },
    { name: "W", text: "W = #530 Teilelänge" },
    { name: "S", text: "S = #529 Abstechdrehzahl", ganz: true },
    { name: "X", text: "X = #524 Abstechendposition" },
    { name: "Z", text: "Z = #525 Z-Startposition (max. 200)" },
    { name: "F", text: "F = #522 Vorschub Abstechen" },
    { name: "B", text: "B = #528 Breite Abstechstahl" },
  ] },
  { gruppe: "Kanal 1 Kopf", felder: [
    { name: "schlicht", text: "Schlichtzugabe Z" },
  ] },
  { gruppe: "Kanal 2 Ende (Abgreifen)", felder: [
    { name: "annaehern", text: "Annähern Z" },
    { name: "ueber", text: "Über das Teil fahren Z" },
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
    schlicht: "-0.1", annaehern: "-10", ueber: "4" };
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
    "G0W0.20(ZUGABE PLANDREHEN HINTEN)",
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

// Ganze Programme je Kanal; die Bearbeitungen dazwischen kommen später
export function programme(w) {
  const k1 = kanal1(w), k2 = kanal2(w);
  return {
    k1: [...k1.kopf, ...k1.ende],
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
