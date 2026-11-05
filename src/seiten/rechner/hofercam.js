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
    { name: "annaehern", text: "Annähern Z vor das Teil", lang: "Abstand vor dem Teil, positiv eingeben; im Programm mit Minus: G0Z-…(EILGANG …MM VOR STUCK)" },
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
    schlicht: "-0.1", plan: "0.20", annaehern: "10", ueber: "4", bloecke: [] };
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
    "G1X#524F#522",
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
  // Seit 1.419.1 (Wunsch Patrick 5. November 2026): Annähern positiv
  // eingeben, im Programm immer mit Minus (auch alte Werte mit Minus)
  const an = "-" + String(v(w, "annaehern")).replace(/^[-+]/, ""), ue = v(w, "ueber");
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
// seit 1.405.0 mit Gegenspindel: Kanal 1 nur Kopf und Ende ohne
// Verfahrwege und eine Wartemarke, Kanal 2 mit T2000 macht die Wege.
export const FRONT_PLAETZE = ["1100", "1200", "1300", "1400"];
// Seit 1.415.0: angetriebene Querwerkzeuge T3421–T3423 an der
// Gegenspindel (Patricks O0458 / O1458, 5. November 2026): Kanal 1
// positioniert X, Kanal 2 schaltet das Werkzeug mit M37 / M38 ein und
// macht mit T2000 den Weg in Z
export const QUER_PLAETZE = ["3421", "3422", "3423"];
// Seit 1.418.0: quer angetriebene T3100–T3400, nur Hauptspindel, nach
// Patricks T3100 aus O0458 (5. November 2026)
export const SEITE_PLAETZE = ["3100", "3200", "3300", "3400"];
// Seit 1.420.0: Drehwerkzeuge Kanal 2 nach Patricks T2100-Beispiel
// (5. November 2026); seit 1.423.0 T2100–T2400 gleich gebaut (Patrick:
// „kannst du identisch bauen“)
export const K2_PLAETZE = ["2100", "2200", "2300", "2400"];

const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function neuerBlock(bloecke = [], art = "dreh") {
  const belegt = new Set(bloecke.map((b) => b.platz));
  if (art === "k2") {
    const platz = K2_PLAETZE.find((p) => !belegt.has(p)) || "2100";
    return { id: neueId(), art: "k2", platz, bez: "", hd: "3", dreh: "4", S: "2500",
      vorX: "-45.4", vorZ: "61.40", nX: "-10", nZ: "-0.5", code: "" };
  }
  if (art === "seite") {
    const platz = SEITE_PLAETZE.find((p) => !belegt.has(p)) || "3100";
    return { id: neueId(), art: "seite", platz, bez: "", hd: "3", dreh: "36", S: "6000", anZ: "0", code: "" };
  }
  if (art === "quer") {
    const platz = QUER_PLAETZE.find((p) => !belegt.has(p)) || "3421";
    // Seit 1.417.0 wie T1100–T1400 zuerst an der Hauptspindel
    return { id: neueId(), art: "quer", spindel: "haupt", platz, bez: "", hd: "3", dreh: "36", S: "6000",
      X: "", anZ: "5.0", wegZ: "0", code: "" };
  }
  if (art === "front") {
    const platz = FRONT_PLAETZE.find((p) => !belegt.has(p)) || "1100";
    return { id: neueId(), art: "front", spindel: "haupt", platz, bez: "", hd: "4", dreh: "3",
      S: "2500", anZ: "5.0", wegZ: "0", code: "" };
  }
  const platz = DREH_PLAETZE.find((p) => !belegt.has(p)) || "100";
  return { id: neueId(), art: "dreh",
    platz, bez: "", hd: "4", dreh: "3", S: "3000", anZ: "0", wegF: "0.05", wegA: "45", code: "" };
}

// Seit 1.401.0 (Wunsch Patrick 5. November 2026: „generell und optional
// anstelle der Drehzahl die Schnittgeschwindigkeit eingeben“): je Block
// sArt "vc" mit vc (m/min) und vcD (Ø in mm); die App rechnet daraus die
// Drehzahl S = Vc · 1000 / (π · Ø), auf ganze Umdrehungen gerundet. Beim
// Drehwerkzeug gilt ohne Ø der Material-Ø A aus G266.
export function vcDurchmesser(b, w = {}) {
  const d = zahl(b.vcD);
  if (d != null) return Number(d);
  if (b.art !== "front" && b.art !== "k2") { const a = zahl(w.A); if (a != null) return Number(a); }
  return null;
}
export function drehzahl(b, w = {}) {
  if (b.sArt !== "vc") return /^\d+$/.test(String(b.S).trim()) && Number(b.S) > 0 ? String(b.S).trim() : null;
  const vc = zahl(b.vc), d = vcDurchmesser(b, w);
  // Seit 1.403.0: mit G96 hält die Maschine Vc selbst, S ist dann Vc
  if (b.g96) return vc != null && Number(vc) > 0 ? String(b.vc).trim().replace(",", ".") : null;
  if (vc == null || !(Number(vc) > 0) || !(d > 0)) return null;
  return String(Math.round(Number(vc) * 1000 / (Math.PI * d)));
}

export function blockFehler(b, w = {}) {
  const f = {};
  if (b.art === "k2") {
    if (b.sArt === "vc") {
      if (zahl(b.vc) == null || !(Number(zahl(b.vc)) > 0)) f.vc = "Zahl fehlt";
      if (!b.g96 && vcDurchmesser(b, w) == null) f.vcD = "Ø fehlt";
    } else if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
    for (const n of ["vorX", "vorZ", "nX", "nZ"]) if (zahl(b[n]) == null) f[n] = "Zahl fehlt";
    return f;
  }
  if (b.art === "seite") {
    if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
    if (zahl(b.anZ) == null) f.anZ = "Zahl fehlt";
    return f;
  }
  if (b.art === "quer") {
    if (!anGegenspindel(b)) {
      if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
      if (zahl(b.anZ) == null) f.anZ = "Zahl fehlt";
      if (zahl(b.wegZ) == null) f.wegZ = "Zahl fehlt";
      return f;
    }
    if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
    if (zahl(b.X) == null) f.X = "Zahl fehlt";
    if (String(b.Y ?? "").trim() !== "" && zahl(b.Y) == null) f.Y = "Zahl oder leer";
    if (zahl(b.anZ) == null) f.anZ = "Zahl fehlt";
    const ms = ["m1", "m2", "m3"].map((n) => [n, markeNorm(b[n])]);
    for (const [n, m] of ms) if (String(b[n] ?? "").trim() !== "" && !m) f[n] = "M200–M999 oder leer";
    ms.forEach(([n, m], i) => { if (m && ms.slice(0, i).some(([, x]) => x === m)) f[n] = "doppelt"; });
    return f;
  }
  if (b.sArt === "vc") {
    if (zahl(b.vc) == null || !(Number(zahl(b.vc)) > 0)) f.vc = "Zahl fehlt";
    if (String(b.vcD ?? "").trim() !== "" && zahl(b.vcD) == null) f.vcD = "Zahl oder leer";
    else if (!b.g96 && vcDurchmesser(b, w) == null) f.vcD = b.art === "front" ? "Ø fehlt" : "Ø fehlt (oder A oben)";
  } else if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
  if (zahl(b.anZ) == null) f.anZ = "Zahl fehlt";
  if (b.art === "front") {
    if (zahl(b.wegZ) == null) f.wegZ = "Zahl fehlt";
    if (anGegenspindel(b)) {
      // Seit 1.407.0: Wartemarken von Hand, leer = von selbst
      const m1 = markeNorm(b.m1), m2 = markeNorm(b.m2);
      if (String(b.m1 ?? "").trim() !== "" && !m1) f.m1 = "M200–M999 oder leer";
      if (String(b.m2 ?? "").trim() !== "" && !m2) f.m2 = "M200–M999 oder leer";
      if (m1 && m1 === m2) f.m2 = "gleich wie Start";
    }
    return f;
  }
  if (zahl(b.wegF) == null) f.wegF = "Zahl fehlt";
  if (String(b.wegA).trim() !== "" && zahl(b.wegA) == null) f.wegA = "Zahl oder leer";
  return f;
}

// Seit 1.407.0: eingetippte Wartemarke ("500", "M500") als "M500", sonst null
export function markeNorm(t) {
  const m = String(t ?? "").trim().match(/^[mM]?(\d{1,3})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return istMarkeNr(n) ? "M" + n : null;
}

// Seit 1.419.0 (Wunsch Patrick 5. November 2026: „G99 G98 soll generell
// ausgewählt werden können“, „generell am Schluss wieder G99“): je
// Bearbeitung G99 (mm/U) oder G98 (mm/min), Vorgabe wie bisher (G98 nur an
// der Gegenspindel); die Zeile steht nach der Drehzahl, am Ende der
// Bearbeitung immer G99
export const vorschubArt = (b) => (b.vor === "98" || b.vor === "99" ? b.vor : anGegenspindel(b) ? "98" : "99");
const vorZeile = (b) => "G" + vorschubArt(b);

export function blockZeilen(b, w = {}, marke) {
  // Kanal 2 allein: Kanal 1 bekommt nur die Markenpaare aus dem NC-Code
  // mit dem eigenen Code dazwischen
  if (b.art === "k2") return markenPaare(b).flatMap(([x, y]) => [x, ...k1Zeilen(b, x, y), y]);
  const S = drehzahl(b, w) ?? String(b.S).trim();
  // Seit 1.403.0 (Wunsch Patrick 5. November 2026): G96 im Kopf der
  // Bearbeitung ein, am Ende vor T0 mit G97 wieder aus
  const g96 = b.sArt === "vc" && !!b.g96;
  const t = Number(b.platz) / 100;
  const bez = String(b.bez || "").trim();
  // Seit 1.413.0 (Wunsch Patrick 5. November 2026: „generell auswählen, ob
  // nach einer Bearbeitung der Hochdruck wieder ausgeschaltet wird,
  // standardmässig ja“): `hdAn` am Block lässt M1891 / M1892 am Ende weg
  // Seit 1.417.0 (Patrick 5. November 2026): angetriebene Werkzeuge mit
  // M36 Rechtslauf, M37 Linkslauf, M38 aus, in beiden Kanälen; M38 am
  // Ende wahlweise (`spAn` am Block lässt es weg, Vorgabe aus)
  if (b.art === "seite") {
    // Seit 1.418.0 (Patrick 5. November 2026: „das selbe mit T3100–T3400,
    // dort gibt es keine Bearbeitung auf der Gegenspindel“), Aufbau wie
    // T3100 in O0458 (Patrick: „ja“), Hochdruck M1883D… / M1893 wie bei
    // T3421–T3423
    const code = String(b.code || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
    return [
      "T" + b.platz + (bez ? "(" + bez + ")" : ""),
      ...(b.hd ? ["M1883D" + b.hd] : []),
      "G0T" + t,
      "M" + (b.dreh === "37" ? 37 : 36) + "S" + String(b.S).trim(),
      "G0X[#531+1.]Z" + (zahl(b.anZ) ?? b.anZ),
      vorZeile(b), "M8", "M7", "G0", "G28H0.", "G1Y0.C0.F1.",
      ...code,
      "G0X30.",
      "G0Y0.",
      ...(b.hd && !b.hdAn ? ["M1893"] : []),
      "T0",
      ...(b.spAn ? [] : ["M38"]),
      "M9",
      "G99",
      "T0",
      "M1",
    ];
  }
  if (b.art === "quer" && !anGegenspindel(b)) {
    // Seit 1.417.0 (Wunsch Patrick 5. November 2026: „standardmässig für
    // die Hauptspindel in Kanal 1 … alles wie bei T1100–T1400“)
    const code = String(b.code || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
    return [
      "T" + b.platz + (bez ? "(" + bez + ")" : ""),
      ...(b.hd ? ["M1883D" + b.hd] : []),
      "M" + (b.dreh === "37" ? 37 : 36) + "S" + String(b.S).trim() + "T" + String(b.platz).slice(-2),
      vorZeile(b),
      "G0Z" + (zahl(b.anZ) ?? b.anZ),
      ...code,
      ...(b.hd && !b.hdAn ? ["M1893"] : []),
      "G0Z" + (zahl(b.wegZ) ?? b.wegZ),
      ...(b.spAn ? [] : ["M38"]),
      "G99",
      "T0",
      "M1",
    ];
  }
  if (b.art === "quer") {
    // Seit 1.415.0 (Patrick 5. November 2026): zwischen Marke Start und
    // Marke 2 positioniert Kanal 1 in X, zwischen Marke 2 und Marke Ende
    // macht Kanal 2 die Bearbeitung; freie Markenpaare im NC-Code von
    // Kanal 2 (etwa M312 / M314 zum Freifahren in X) wie bei T1400.
    // Hochdruck M1883D… / M1893 in Kanal 1 (Patrick: „ja M1883“); statt
    // G0T0 am Ende T0 und M1 wie bei den anderen (Patrick: „vergiss G0T0“)
    const mk = marke || { m1: "M300", m2: "M310", m3: "M320" };
    return [
      "T" + b.platz + "(" + mitGegen(bez) + ")",
      ...(b.hd ? ["M1883D" + b.hd] : []),
      mk.m1,
      // Seit 1.422.0 (Wunsch Patrick 5. November 2026): wahlweise auch Y
      "G0X" + (zahl(b.X) ?? b.X) + (zahl(b.Y) != null ? "Y" + zahl(b.Y) : "") + "T" + String(b.platz).slice(-2),
      mk.m2,
      ...markenPaare(b).flatMap(([x, y]) => [x, ...k1Zeilen(b, x, y), y]),
      mk.m3,
      ...(b.hd && !b.hdAn ? ["M1893"] : []),
      "T0",
      "M1",
    ];
  }
  if (b.art === "front" && b.spindel === "gegen") {
    // Seit 1.405.0 (Patrick 5. November 2026): an der Gegenspindel hält
    // Kanal 1 nur das Werkzeug bereit (Kopf und Ende ohne G0Z) und wartet
    // an der Marke, bis Kanal 2 mit T2000 die Bearbeitung fertig hat.
    // Seit 1.407.0 zwei Marken (Wunsch Patrick 5. November 2026: „2
    // Wartemarken, damit ich die Bearbeitung auf der Gegenspindel
    // dazwischen einfügen kann“): Start und Ende direkt nacheinander, in
    // Kanal 2 steht die Bearbeitung zwischen den beiden. Seit 1.408.0
    // (Patrick: „Drehzahl, Drehrichtung etc. auf Kanal 2, nicht auf
    // Kanal 1“): M3/M4 S (und G96/G97) stehen nur noch in Kanal 2
    const mk = marke || { m1: "M300", m2: "M310" };
    return [
      "T" + b.platz + "(" + mitGegen(bez) + ")",
      ...(b.hd ? ["M1882D" + b.hd] : []),
      // Seit 1.409.0: T14 bleibt in Kanal 1, weil dort die
      // Verschleisskorrektur erfolgt (Patrick 5. November 2026)
      "T" + t,
      mk.m1,
      // Seit 1.414.0: Markenpaare aus dem NC-Code von Kanal 2, dazwischen
      // der eigene NC-Code von Kanal 1
      ...markenPaare(b).flatMap(([x, y]) => [x, ...k1Zeilen(b, x, y), y]),
      mk.m2,
      ...(b.hd && !b.hdAn ? ["M1892"] : []),
      "T0",
      "M1",
    ];
  }
  if (b.art === "front") {
    // Nach Patricks T1400: Hochdruck der Front M1882D… / M1892, kein X,
    // nach der Bearbeitung mit Z zurück in sichere Richtung
    const code = String(b.code || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
    return [
      "T" + b.platz + (bez ? "(" + bez + ")" : ""),
      ...(b.hd ? ["M1882D" + b.hd] : []),
      (g96 ? "G96" : "") + "M" + (b.dreh === "4" ? 4 : 3) + "S" + S + "T" + t,
      vorZeile(b),
      "G0Z" + (zahl(b.anZ) ?? b.anZ),
      ...code,
      ...(b.hd && !b.hdAn ? ["M1892"] : []),
      "G0Z" + (zahl(b.wegZ) ?? b.wegZ),
      ...(g96 ? ["G97"] : []),
      "G99",
      "T0",
      "M1",
    ];
  }
  const winkel = String(b.wegA).trim() === "" ? "" : ",A" + (zahl(b.wegA) ?? b.wegA);
  const code = String(b.code || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  return [
    "T" + b.platz + (bez ? "(" + bez + ")" : ""),
    ...(b.hd ? ["M1881D" + b.hd] : []),
    (g96 ? "G96" : "") + "M" + (b.dreh === "4" ? 4 : 3) + "S" + S + "T" + t,
    vorZeile(b),
    "G0X[#531+1.]Z" + (zahl(b.anZ) ?? b.anZ),
    ...code,
    "G1X[#531+0.2]" + winkel + "F" + (zahl(b.wegF) ?? b.wegF),
    "G0X30.",
    ...(b.hd && !b.hdAn ? ["M1891"] : []),
    ...(g96 ? ["G97"] : []),
    "G99",
    "T0",
    "M1",
  ];
}

// Seit 1.405.0: Kanal 2 bei einem Frontwerkzeug an der Gegenspindel,
// nach Patricks O1458 (T2000, Wege in Z, G28W0.): die Gegenspindel fährt
// mit dem Teil an das feste Werkzeug, die Marke danach gibt Kanal 1 frei
// Seit 1.412.0 (Patrick 5. November 2026): an der Gegenspindel bekommt
// die Bezeichnung in beiden Kanälen „MIT GEGENSPINDEL“ angehängt
export const mitGegen = (bez) => (bez ? bez + " " : "") + "MIT GEGENSPINDEL";
export function blockZeilen2(b, marke, w = {}) {
  const bez = String(b.bez || "").trim();
  const S = drehzahl(b, w) ?? String(b.S).trim();
  const g96 = b.sArt === "vc" && !!b.g96;
  const code = String(b.code || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  // Seit 1.410.0 (Patrick 5. November 2026, nach O1458): zuerst immer M75,
  // dann jede Zeile der Bearbeitung mit „/“ davor; Marken und das Ende
  // (G0G28W0., T0, M1) ohne, damit beide Kanäle immer synchron bleiben
  const s = (z) => (markeVon(z) || z.startsWith("/") ? z : "/" + z);
  if (b.art === "k2") {
    // Seit 1.420.0 nach Patricks T2100 (5. November 2026): G23 schaltet die
    // Hubbegrenzung aus (am Ende G22 wieder ein), Vorpositionieren X und Z
    // (nur T2100, spezieller Drehhalter), Nullpunktverschiebung G50 X/Z,
    // am Ende zurück auf dieselben Werte; M5 am Ende wahlweise
    const g = (n) => zahl(b[n]) ?? String(b[n] ?? "");
    return [
      "M75",
      // Seit 1.424.0 (Patrick 5. November 2026: „brauchen auch Hochdruck
      // M1884“): wie T2200 in O1458 vor dem Werkzeugaufruf, aus nach M76
      ...(b.hd ? ["/M1884D" + b.hd] : []),
      s("T" + b.platz + (bez ? "(" + bez + ")" : "")),
      "/G23",
      s((g96 ? "G96" : "") + "M" + (b.dreh === "3" ? 3 : 4) + "S" + S + "T" + String(b.platz).slice(0, 2)),
      s(vorZeile(b)),
      s("G0X" + g("vorX")),
      s("G0Z" + g("vorZ")),
      s("G50X" + g("nX") + "Z" + g("nZ")),
      "/G1Z-1.F0.5",
      "/G1X-11.",
      ...code.map(s),
      s("G1Z" + g("nZ") + "F0.5"),
      s("G1X" + g("nX")),
      s("G50Z" + g("vorZ") + "X" + g("vorX")),
      "/G0Z20.0",
      "/G0X0.0",
      ...(g96 ? ["/G97"] : []),
      "/G99",
      "G28W0.0",
      "M76",
      ...(b.hd && !b.hdAn ? ["M1894"] : []),
      "G22",
      "T0",
      "M1",
      ...(b.ohneM5 ? [] : ["M5"]),
    ];
  }
  if (b.art === "quer") {
    // Seit 1.415.0 nach Patricks O1458: Kopf mit G98, Kühlmittel, C-Achse
    // auf 0 und M6 bei jeder Bearbeitung (Patrick: „kannst du immer
    // machen“), dann das angetriebene Werkzeug mit M37 / M38 S…, Anfahren
    // und Wegfahren auf derselben Z (Patrick: „der Wert 60 soll als
    // Anfahrposition der Gegenspindel definiert werden können“), fest
    // F2000 und G0Z20., M38 aus (wahlweise nicht); Marke Ende nach M1
    const z = zahl(b.anZ) ?? b.anZ;
    return [
      "M75",
      s("T2000(" + mitGegen(bez) + ")"),
      s(vorZeile(b)), "/M8", "/M7", "/G0", "/G28H0.", "/M6",
      marke.m1,
      marke.m2,
      s("M" + (b.dreh === "37" ? 37 : 36) + "S" + String(b.S).trim()),
      s("G0Z" + z),
      ...code.map(s),
      s("G1Z" + z + "F2000"),
      "/G0Z20.",
      ...(b.spAn ? [] : ["/M38"]),
      "/G99",
      "G0G28W0.",
      "T0",
      "M1",
      marke.m3,
    ];
  }
  return [
    "M75",
    s("T2000(" + mitGegen(bez) + ")"),
    marke.m1,
    s((g96 ? "G96" : "") + "M" + (b.dreh === "4" ? 4 : 3) + "S" + S),
    s(vorZeile(b)),
    s("G0Z" + (zahl(b.anZ) ?? b.anZ)),
    ...code.map(s),
    s("G0Z" + (zahl(b.wegZ) ?? b.wegZ)),
    ...(g96 ? [s("G97")] : []),
    "/G99",
    // Seit 1.411.0 (Patrick 5. November 2026): Marke Ende vor G0G28W0.,
    // wie in O1458; alles andere (etwa G1Z60.F2000) gehört in den NC-Code
    marke.m2,
    "G0G28W0.",
    "T0",
    "M1",
  ];
}
// Seit 1.414.0 (Wunsch Patrick 5. November 2026: „innerhalb der
// Bearbeitung Wartemarken setzen … auf Kanal 2 z.B. M350 und M360 direkt
// nacheinander, dann soll auf Kanal 1 innerhalb der Wartemarken
// programmiert werden können“): zwei Marken direkt nacheinander im NC-Code
// an der Gegenspindel sind ein Paar; Kanal 1 bekommt dieselben Marken und
// dazwischen den Code aus `k1["M350-M360"]` am Block
// Seit 1.416.0 (Wunsch Patrick 5. November 2026: „generell, wenn ich in
// einem Kanal Wartemarken innerhalb der freien Programmierung setze, soll
// für den anderen Kanal das Fenster aufgehen“): auch bei Bearbeitungen
// in Kanal 1; dann steht der Code des Felds in Kanal 2 (`k2` am Block)
export function markenPaare(b) {
  const m = String(b.code || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean).map(markeVon);
  const paare = [];
  for (let i = 0; i + 1 < m.length; i++) if (m[i] && m[i + 1] && m[i] !== m[i + 1]) { paare.push([m[i], m[i + 1]]); i++; }
  return paare;
}
export const k1Zeilen = (b, x, y, feld = "k1") =>
  String((b[feld] || {})[x + "-" + y] || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
export const anGegenspindel = (b) => (b.art === "front" || b.art === "quer") && b.spindel === "gegen";

// Je Block an der Gegenspindel zwei Wartemarken {m1, m2}: von Hand
// gesetzte gelten, leere bekommen freie ab M300 in Zehnerschritten, die
// weder in Kopf und Ende, im NC-Code noch bei anderen Blöcken vorkommen
export function markenVergeben(bloecke, belegtZeilen = []) {
  const belegt = new Set(belegtZeilen.map(markeVon).filter(Boolean));
  bloecke.forEach((b) => {
    String(b.code || "").split(/\r?\n/).forEach((z) => { const m = markeVon(z); if (m) belegt.add(m); });
    if (anGegenspindel(b)) [b.m1, b.m2, b.m3].map(markeNorm).filter(Boolean).forEach((m) => belegt.add(m));
    [...Object.values(b.k1 || {}), ...Object.values(b.k2 || {})].forEach((c) => String(c).split(/\r?\n/).forEach((z) => { const m = markeVon(z); if (m) belegt.add(m); }));
  });
  const marken = {};
  let n = 300;
  const frei = () => {
    while (belegt.has("M" + n) && n <= 999) n += 10;
    const m = "M" + n;
    belegt.add(m);
    n += 10;
    return m;
  };
  for (const b of bloecke) {
    if (!anGegenspindel(b)) continue;
    const m1 = markeNorm(b.m1) || frei();
    const m2 = markeNorm(b.m2) || frei();
    marken[b.id] = b.art === "quer" ? { m1, m2, m3: markeNorm(b.m3) || frei() } : { m1, m2 };
  }
  return marken;
}

// Ganze Programme je Kanal; die Bearbeitungen stehen zwischen Kopf und Ende
export function programme(w) {
  const k1 = kanal1(w), k2 = kanal2(w);
  // Seit 1.398.0: je Block die Zeilen in Kanal 1 (von–bis, ab 1), damit
  // die Anzeige die angewählte Bearbeitung hervorheben kann
  const bereiche = {}, bereiche2 = {};
  const bloecke = w.bloecke || [];
  const marken = markenVergeben(bloecke, [...k1.kopf, ...k1.ende, ...k2.kopf, ...k2.ende]);
  let ab = k1.kopf.length, ab2 = k2.kopf.length;
  const bearb2 = [];
  const bearb1 = bloecke.flatMap((b) => {
    const z = blockZeilen(b, w, marken[b.id]);
    bereiche[b.id] = [ab + 1, ab + z.length];
    ab += z.length;
    // Seit 1.416.0: Markenpaare im Code von Kanal 1 geben Kanal 2 die
    // Marken mit dem Code aus dem Feld dazwischen
    const z2 = marken[b.id] || b.art === "k2" ? blockZeilen2(b, marken[b.id], w)
      : markenPaare(b).flatMap(([x, y]) => [x, ...k1Zeilen(b, x, y, "k2"), y]);
    if (z2.length) {
      bereiche2[b.id] = [ab2 + 1, ab2 + z2.length];
      ab2 += z2.length;
      bearb2.push(...z2);
    }
    return z;
  });
  return {
    bereiche, bereiche2, marken,
    k1: [...k1.kopf, ...bearb1, ...k1.ende],
    k2: [...k2.kopf, ...bearb2, ...k2.ende],
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

// ---------- Von Hand geändert ----------
// Seit 1.421.0 (Wunsch Patrick 5. November 2026: „alles im CNC-Programm-
// fenster auch bearbeitbar, gelb hervorgehoben, was gegenüber der
// automatischen Erzeugung geändert wurde“). Gespeichert wird je Kanal das
// erzeugte Programm zur Zeit der letzten Änderung (basis) und das von
// Hand geänderte (hand). Rechnet die App neu, setzt sie die Änderungen
// zwischen basis und hand an derselben Stelle im neuen Programm wieder
// ein; findet sie die Stelle nicht mehr, geht die Änderung als
// „verloren“ zurück, damit die Anzeige sie rot nennen kann.

// Paare gleicher Zeilen (längste gemeinsame Folge), als [i in a, j in b]
function gleicheZeilen(a, b) {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const p = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { p.push([i, j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return p;
}

// Abschnitte, in denen hand von basis abweicht: basis[von, bis) → zeilen
function abschnitte(basis, hand) {
  const p = [...gleicheZeilen(basis, hand), [basis.length, hand.length]];
  const res = [];
  let i = 0, j = 0;
  for (const [pi, pj] of p) {
    if (pi > i || pj > j) res.push({ von: i, bis: pi, zeilen: hand.slice(j, pj) });
    i = pi + 1; j = pj + 1;
  }
  return res;
}

// Ergebnis: { zeilen, gelb: Set der Zeilen (ab 0) aus Handänderungen,
// verloren: [{ zeilen, war }] }
export function handAnwenden(neu, h) {
  if (!h || !Array.isArray(h.hand) || !Array.isArray(h.basis)) return { zeilen: neu, gelb: new Set(), verloren: [] };
  const { basis, hand } = h;
  const zu = new Map(gleicheZeilen(basis, neu));
  const ab = abschnitte(basis, hand);
  // Stelle im neuen Programm: Zeile vor dem Abschnitt und Zeile danach
  // müssen dort noch stehen und dazwischen genauso viele Zeilen wie vorher
  const ersetzen = [], verloren = [];
  for (const a of ab) {
    const vor = a.von === 0 ? -1 : zu.get(a.von - 1);
    const nach = a.bis === basis.length ? neu.length : zu.get(a.bis);
    if (vor === undefined || nach === undefined || nach <= vor || nach - vor - 1 !== a.bis - a.von) {
      verloren.push({ zeilen: a.zeilen, war: basis.slice(a.von, a.bis) });
      continue;
    }
    ersetzen.push({ von: vor + 1, bis: nach, zeilen: a.zeilen });
  }
  const zeilen = [], gelb = new Set();
  let i = 0;
  for (const e of ersetzen) {
    if (e.von < i) { verloren.push({ zeilen: e.zeilen, war: [] }); continue; }
    zeilen.push(...neu.slice(i, e.von));
    e.zeilen.forEach((z) => { gelb.add(zeilen.length); zeilen.push(z); });
    i = e.bis;
  }
  zeilen.push(...neu.slice(i));
  return { zeilen, gelb, verloren };
}

// Programme mit den Handänderungen (w.hand = { k1: {basis, hand}, k2: … })
export function programmeMitHand(w) {
  const p = programme(w);
  const h = w.hand || {};
  const r1 = handAnwenden(p.k1, h.k1), r2 = handAnwenden(p.k2, h.k2);
  return { ...p, auto1: p.k1, auto2: p.k2, k1: r1.zeilen, k2: r2.zeilen,
    gelb1: r1.gelb, gelb2: r2.gelb, verloren1: r1.verloren, verloren2: r2.verloren };
}

// Neue Handfassung eines Kanals: basis = jetzt erzeugt, hand = angezeigt
// und geändert; gleich wie erzeugt = keine Handänderung mehr
export function handNeu(w, kanal, auto, zeilen) {
  const hand = { ...(w.hand || {}) };
  if (zeilen.length === auto.length && zeilen.every((z, i) => z === auto[i])) delete hand["k" + kanal];
  else hand["k" + kanal] = { basis: auto, hand: zeilen };
  return hand;
}
