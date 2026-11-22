// =================================================================
//  HOFERCAM: Bibliothek reale Werkzeuge (seit 1.695.0)
//
//  Wunsch Patrick 22. November 2026: „wenn du aus Werkzeugprotokollen
//  Platten und Spezialwerkzeuge erkannt hast, integriere sie auch in die
//  Werkzeugbibliothek für die Simulation, mit den Artikel-Nr.“, „eine
//  eigene Auswahlliste reale Werkzeuge“, „die Plattenhöhen müssen aber
//  stimmen, wenn etwas noch nicht erkannt ist, soll es ergänzt werden
//  können … du hast ja viele Artikel schon in der Datenbank“.
//
//  Die App liest aus den Werkzeug-Artikeln (Bestellungen → Artikel: Art
//  wie Wendeplatte, Bohrer …, Art.-Nr., Beschreibung) ein Werkzeug wie im
//  Fenster 🔧 Werkzeug (b.wz), dazu Kantenlänge l und Dicke aus dem
//  ISO-Code. Was sie nur schätzt, steht in „geschaetzt“. Von Hand
//  Ergänztes liegt in der Tabelle cam_werkzeuge und gilt vor dem
//  Erkannten. Dazu kommen Werkzeuge, die in den Einrichtblättern nur als
//  Text stehen (Schlüssel „t:…“), mit der Zahl, wie oft sie vorkommen.
// =================================================================

const zahl = (t) => Number(String(t).replace(",", "."));
const rund = (x) => String(Math.round(x * 1000) / 1000);

// Arten der Artikel, die Werkzeuge für die Simulation sind
export const DREH_KAT = ["Wendeplatte", "Stechplatte", "Gewindeplatte", "Ausdrehwerkzeug"];
export const FRAES_KAT = ["Bohrer", "Zentrierer", "Zentrierer / Ansenker", "Reibahle", "Gewindebohrer", "Gewindeformer",
  "Schaftfräser", "Kugelfräser", "Kegelfräser", "Kreissägeblätter"];
export const WZ_KAT = [...DREH_KAT, ...FRAES_KAT];

// Dicke aus dem ISO-Code (Stelle 6): 01 = 1.59 … 06 = 6.35 mm
const DICKE = { "01": 1.59, T0: 1.79, T1: 1.98, "02": 2.38, T2: 2.78, "03": 3.18, T3: 3.97, "04": 4.76, "05": 5.56, "06": 6.35, "07": 7.94 };
// Kantenlänge aus dem Code (Stelle 5) je Form: echte Länge der Schneide
const KANTE = {
  C: { "04": 4.3, "05": 5.6, "06": 6.4, "08": 8.1, "09": 9.7, "12": 12.9, "16": 16.1 },
  D: { "05": 5.6, "07": 7.75, "11": 11.6, "15": 15.5 },
  V: { "08": 8.1, "11": 11.1, "16": 16.6 },
  T: { "06": 6.9, "09": 9.6, "11": 11, "16": 16.5 },
  W: { "02": 3.8, "03": 5.4, "04": 6.5, "06": 9.7, "08": 12.9 },
  R: {},
};

export const normNr = (t) => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// ISO-Code einer Wendeplatte: DCGT11T302, DNMG 110408, VCGX 120302,
// DCGT11T3005 (R 0.05), CCGT-09T302 …
export function isoCode(t) {
  const m = /(?:^|[^A-Z])([CDVWTRSKX])([A-Z])([A-Z])([A-Z])[\s-]*(\d{2})[\s-]*(T\d|\d{2})(\d{2,3}|M0|00)(?!\d)/i.exec(String(t || "").toUpperCase());
  if (!m) return null;
  const roh = m[1];
  const form = { X: "C", S: "C", K: "D" }[roh] || roh;
  const rs = m[7];
  const r = /^\d+$/.test(rs) ? (rs.length === 3 ? Number(rs) / 100 : Number(rs) / 10) : 0;
  const dicke = DICKE[m[6]] ?? null;
  const k = KANTE[form] || {};
  const l = form === "R" ? null : k[m[5]] ?? (Number(m[5]) > 2 ? Number(m[5]) : null);
  return { form, ersatz: roh !== form, r, dicke, l, code: m[0].replace(/^[^A-Z]/, "") };
}

const RE_R = /(?:^|[\s(,;·-])R\s*=?\s*(\d(?:[.,]\d+)?)(?![\d.,]*\d{3})/i;
const RE_D = /(?:Ø|ø|⌀)\s*(\d+(?:[.,]\d+)?)/;
const RE_WINKEL = /(\d{2,3})\s*°/;

// Breite einer Einstechplatte aus Beschreibung oder Art.-Nr.
function stechBreite(nr, desc) {
  const t = nr + " " + desc;
  let m = /\bb\s*=?\s*(\d+(?:[.,]\d+)?)/i.exec(desc) || /\bb\s*=?\s*(\d+[.,]\d+)/i.exec(nr);
  if (m) return zahl(m[1]);
  m = /\bS(?:100|101|224|229)\.(\d{4})/i.exec(t);                 // Horn S100.0300 = 3.00
  if (m) return Number(m[1]) / 100;
  m = /\b[LR]?S274\.(\d{2})(\d{2})/i.exec(t);                     // Horn S274.1510 = 1.50
  if (m) return Number(m[1] + "." + m[2]);
  m = /PENTA\s*\d{2}\s*N\s*(\d{3})/i.exec(t);                    // Iscar PENTA 24N150 = 1.50
  if (m) return Number(m[1]) / 100;
  m = /\b(?:DGN|DGNC|DGR|DGL|GFN|GIP)\s*-?\s*(\d{2})(\d{2})/i.exec(t);  // DGN 2002 = b 2.0
  if (m) return Number(m[1]) / 10;
  m = /\bGIP\s*(\d+[.,]\d+)/i.exec(t);
  if (m) return zahl(m[1]);
  m = /\dRB\s*(\d[.,]\d+)(?!\d)/i.exec(t);                              // Bimu 869RB0.6
  if (m) return zahl(m[1]);
  m = /\b781-(\d+(?:[.,]\d+)?)/.exec(t);                          // Applitec 781-2.5
  if (m) return zahl(m[1]);
  m = /\b(?:16\d\d|30\d\d|50\d\d)[.-](\d+[.,]\d+)-/.exec(t);          // Utilis 1610-1.25-2.8, 5002-1.5-EN
  if (m) return zahl(m[1]);
  m = /\bSMI\s*(\d+(?:[.,]\d+)?)/i.exec(t);
  if (m) return zahl(m[1]);
  m = /\bSA\d{2}-(\d{2})(\d{2})/i.exec(t);                         // Arno SA24-1502 = 1.5
  if (m) return Number(m[1]) / 10;
  return null;
}
function stechRadius(nr, desc) {
  const t = nr + " " + desc;
  let m = RE_R.exec(desc) || /-R(\d+[.,]\d+)/i.exec(nr);
  if (m) return zahl(m[1]);
  m = /PENTA\s*\d{2}\s*N\s*\d{3}\s*[A-Z]?(\d{3})/i.exec(t);       // 24N178C018 = R0.18
  if (m) return Number(m[1]) / 100;
  m = /\b(?:DGN|DGNC|DGR|DGL|GFN)\s*-?\s*\d{2}(\d{2})/i.exec(t);   // 2002 = R0.2
  if (m) return Number(m[1]) / 10;
  m = /\bGIP\s*\d+[.,]\d+-(\d+[.,]\d+)/i.exec(t);
  if (m) return zahl(m[1]);
  return null;
}

// Ifanger MicroTurn MTNU (Einstechen innen), Katalog 2024 S. 26 und
// ifanger.com (Patrick 22. November 2026: „suche mit der Artikel-Nr. im Web“)
// D = kleinste Bohrung, S Schaft, L ganz, L1 Hals, L2 Auskragung,
// F Lage zur Mitte, T Einstechtiefe, B Breite
const MTNU = Object.fromEntries([
  ["42006", 2.0, 4, 31, 6, 15, 1.00, 0.5, 0.6], ["42508", 2.5, 4, 31, 8, 15, 1.25, 0.6, 0.8],
  ["43208", 3.2, 4, 31, 8, 15, 1.60, 0.8, 1.0], ["43212", 3.2, 4, 31, 12, 15, 1.60, 0.8, 1.0],
  ["43217", 3.2, 4, 36, 17, 20, 1.60, 0.8, 1.0], ["44010", 4.0, 4, 31, 10, 15, 1.95, 0.8, 1.0],
  ["44014", 4.0, 4, 31, 14, 15, 1.95, 0.8, 1.0], ["44019", 4.0, 4, 36, 19, 20, 1.95, 0.8, 1.0],
  ["64025", 4.0, 6, 48, 25, 29, 1.95, 0.8, 1.0], ["64030", 4.0, 6, 53, 30, 34, 1.95, 0.8, 1.0],
  ["65012", 5.0, 6, 35, 12, 16, 2.50, 1.5, 1.2], ["65017", 5.0, 6, 43, 17, 24, 2.50, 1.5, 1.2],
  ["65025", 5.0, 6, 48, 25, 29, 2.50, 1.5, 1.2], ["65032", 5.0, 6, 53, 32, 34, 2.50, 1.5, 1.2],
  ["65040", 5.0, 6, 61, 40, 42, 2.50, 1.5, 1.2], ["66012", 6.0, 6, 35, 12, 16, 2.95, 2.0, 1.5],
  ["66020", 6.0, 6, 43, 20, 24, 2.95, 2.0, 2.0], ["66030", 6.0, 6, 53, 30, 34, 2.95, 2.0, 2.0],
  ["66040", 6.0, 6, 61, 40, 42, 2.95, 2.0, 2.0],
].map(([k, D, S, L, L1, L2, F, T, B]) => [k, { D, S, L, L1, L2, F, T, B }]));

// Weitere Ifanger MicroTurn (Katalog 2024, über alouettetool.com und
// ifanger.com; Patrick 22. November 2026: „mach es bei jeder Artikel-Nr. so“).
// Spalten wie MTNU: D kleinste Bohrung, S Schaft, L, L1 Hals, L2 Auskragung,
// F Spitze bis Mitte Schaft; R = Radius der fünfstelligen Nummer (die
// sechsstellige: Endziffer 0 scharf, 5 = R0.05), T Tiefe, B Breite, M Gewinde
const tab = (zeilen, felder) => Object.fromEntries(zeilen.map(([k, ...w]) =>
  [k, Object.fromEntries(felder.map((f, i) => [f, w[i]]))]));
const MTE = tab([
  ["41003", 1.0, 4, 26, 3, 10, 0.5, 0.02], ["41005", 1.0, 4, 26, 5, 10, 0.5, 0.02],
  ["41204", 1.2, 4, 31, 4, 15, 0.6, 0.02], ["41207", 1.2, 4, 31, 7, 15, 0.6, 0.02],
  ["41505", 1.5, 4, 31, 5, 15, 0.75, 0.02], ["41508", 1.5, 4, 31, 8, 15, 0.75, 0.02],
  ["41805", 1.8, 4, 31, 5, 15, 0.9, 0.03], ["41809", 1.8, 4, 31, 9, 15, 0.9, 0.03],
  ["41814", 1.8, 4, 31, 14, 15, 0.9, 0.03], ["42206", 2.2, 4, 31, 6, 15, 1.1, 0.05],
  ["42210", 2.2, 4, 31, 10, 15, 1.1, 0.05], ["42214", 2.2, 4, 31, 14, 15, 1.1, 0.05],
  ["42506", 2.5, 4, 31, 6, 15, 1.25, 0.05], ["42508", 2.5, 4, 31, 8, 15, 1.25, 0.05],
  ["42510", 2.5, 4, 31, 10, 15, 1.25, 0.05], ["42514", 2.5, 4, 31, 14, 15, 1.25, 0.05],
  ["43208", 3.2, 4, 31, 8, 15, 1.6, 0.08], ["43212", 3.2, 4, 31, 12, 15, 1.6, 0.08],
  ["43217", 3.2, 4, 36, 17, 20, 1.6, 0.08], ["44010", 4.0, 4, 31, 10, 15, 1.95, 0.12],
  ["44014", 4.0, 4, 31, 14, 15, 1.95, 0.12], ["44019", 4.0, 4, 36, 19, 20, 1.95, 0.12],
  ["64025", 4.0, 6, 48, 25, 29, 1.95, 0.12], ["64030", 4.0, 6, 53, 30, 34, 1.95, 0.12],
  ["65012", 5.0, 6, 35, 12, 16, 2.5, 0.15], ["65017", 5.0, 6, 43, 17, 24, 2.5, 0.15],
  ["65025", 5.0, 6, 48, 25, 29, 2.5, 0.15], ["65032", 5.0, 6, 53, 32, 34, 2.5, 0.15],
  ["65040", 5.0, 6, 61, 40, 42, 2.5, 0.15], ["66012", 6.0, 6, 35, 12, 16, 2.95, 0.2],
  ["66020", 6.0, 6, 43, 20, 24, 2.95, 0.2], ["66030", 6.0, 6, 53, 30, 34, 2.95, 0.2],
  ["66040", 6.0, 6, 61, 40, 42, 2.95, 0.2], ["66050", 6.0, 6, 71, 50, 52, 2.95, 0.2],
], ["D", "S", "L", "L1", "L2", "F", "R"]);
// MTKH (Profil), MTKO gleich mit eigenem F/T
const MTK = tab([
  ["42004", 2.0, 4, 31, 4, 15, 1.0, 0.5, 0.05], ["42506", 2.5, 4, 31, 6, 15, 1.25, 0.5, 0.05],
  ["42510", 2.5, 4, 31, 10, 15, 1.25, 0.5, 0.05], ["43208", 3.2, 4, 31, 8, 15, 1.6, 0.6, 0.08],
  ["43212", 3.2, 4, 31, 12, 15, 1.6, 0.6, 0.08], ["43217", 3.2, 4, 36, 17, 20, 1.6, 0.6, 0.08],
  ["44010", 4.0, 4, 31, 10, 15, 1.95, 0.8, 0.12], ["44014", 4.0, 4, 31, 14, 15, 1.95, 0.8, 0.12],
  ["44019", 4.0, 4, 36, 19, 20, 1.95, 0.8, 0.12], ["64025", 4.0, 6, 48, 25, 29, 1.95, 0.8, 0.12],
  ["64030", 4.0, 6, 53, 30, 34, 1.95, 0.8, 0.12], ["65012", 5.0, 6, 35, 12, 16, 2.5, 1.2, 0.15],
  ["65017", 5.0, 6, 43, 17, 24, 2.5, 1.2, 0.15], ["65025", 5.0, 6, 48, 25, 29, 2.5, 1.2, 0.15],
  ["65032", 5.0, 6, 53, 32, 34, 2.5, 1.2, 0.15], ["65040", 5.0, 6, 61, 40, 42, 2.5, 1.2, 0.15],
  ["66012", 6.0, 6, 35, 12, 16, 2.95, 1.45, 0.2], ["66020", 6.0, 6, 43, 20, 24, 2.95, 1.45, 0.2],
  ["66030", 6.0, 6, 53, 30, 34, 2.95, 1.45, 0.2], ["66040", 6.0, 6, 61, 40, 42, 2.95, 1.45, 0.2],
  ["66050", 6.0, 6, 71, 50, 52, 2.95, 1.45, 0.2],
], ["D", "S", "L", "L1", "L2", "F", "T", "R"]);
const MTKO_FT = { "42": [1.0, 0.5], "425": [1.3, 0.6], "432": [1.6, 0.8], "440": [2.0, 0.8], "640": [2.0, 0.8], "650": [2.5, 1.2], "660": [3.0, 1.45] };
const MTGE = tab([
  ["41203", 1.2, 4, 26, 2.3, 10, 0.6, "M1.6", 0.3], ["41604", 1.6, 4, 26, 3.7, 10, 0.8, "M2", 0.4],
  ["42206", 2.2, 4, 31, 5.1, 15, 1.1, "M3", 0.6], ["43208", 3.2, 4, 31, 7.5, 15, 1.6, "M4", 1.0],
  ["44010", 4.0, 4, 31, 9.4, 15, 2.0, "M5", 0.95], ["44014", 4.0, 4, 31, 13.4, 15, 2.0, "M5", 0.95],
  ["65012", 5, 6, 35, 11.1, 16, 2.5, "M6", 1.5], ["65017", 5, 6, 43, 16.1, 24, 2.5, "M6", 1.5],
  ["66012", 6, 6, 35, 11.0, 16, 3.0, "M8", 1.5], ["66020", 6, 6, 43, 19.0, 24, 3.0, "M8", 1.5],
  ["66030", 6, 6, 53, 29.0, 34, 3.0, "M8", 1.5],
], ["D", "S", "L", "L1", "L2", "F", "M", "T"]);
const MTFA = tab([
  ["42006", 2, 4, 31, 5.4, 15, 1.0, 0.5], ["42508", 2.5, 4, 31, 7.3, 15, 1.25, 0.6],
  ["43212", 3.2, 4, 31, 11, 15, 1.6, 0.8], ["44014", 4, 4, 31, 13, 15, 1.95, 0.8],
  ["44019", 4, 4, 36, 18, 20, 1.95, 0.8], ["65017", 5, 6, 43, 15.4, 24, 2.5, 1.45],
  ["66020", 6, 6, 43, 18.4, 24, 2.95, 1.45], ["66030", 6, 6, 53, 28.4, 34, 2.95, 1.45],
], ["D", "S", "L", "L1", "L2", "F", "T"]);
const MTNX = tab([
  ["40710", 4, 4, 26, 3, 10, 1.95, 1.2, 0.7], ["41015", 6, 4, 26, 5, 10, 1.95, 1.5, 1.0],
  ["41520", 6, 4, 26, 7, 10, 1.95, 2.0, 1.5], ["61525", 6, 6, 35, 8, 16, 2.95, 2.5, 1.5],
  ["62030", 6, 6, 35, 10, 16, 2.95, 3.0, 2.0],
], ["D", "S", "L", "L1", "L2", "F", "T", "B"]);
const MTNY = tab([
  ["40710", 4, 4, 26, 6, 10, 1.2, 0.7], ["41015", 6, 4, 31, 8, 15, 1.5, 1.0],
  ["41520", 6, 4, 31, 12, 15, 2.0, 1.5], ["61525", 6, 6, 35, 14, 16, 2.5, 1.5],
  ["62030", 6, 6, 43, 20, 24, 3.0, 2.0],
], ["D", "S", "L", "L1", "L2", "T", "B"]);

// Ifanger-Werkzeug aus der Nummer (MTEC 650125-R …) oder null
function ifanger(t) {
  const m = /\bMT([A-Z]{2})\s*(\d{5})(\d?)/i.exec(t);
  if (!m) return null;
  const typ = m[1].toUpperCase(), k = m[2], sechs = m[3];
  let z = null, quelle = "";
  if (typ === "EC" || typ === "EN") z = MTE[k];
  else if (typ === "EE" && k === "41805") z = { D: 1.8, S: 4, L: 31, L1: 5, L2: 15, F: 0.95, R: 0.05 };
  else if (typ === "NN" && k === "42508") z = { D: 2.5, S: 4, L: 31, L1: 8, L2: 15, F: 1.25, R: 0.05 };
  else if (typ === "KH") z = MTK[k];
  else if (typ === "KO" && MTK[k]) {
    const ft = MTKO_FT[k.slice(0, 3)] || MTKO_FT[k.slice(0, 2)];
    z = { ...MTK[k], F: ft[0], T: ft[1] }; if (/^640/.test(k)) z.D = 5;
  }
  else if (typ === "GE") z = MTGE[k];
  else if (typ === "FA") z = MTFA[k];
  else if (typ === "NX") z = MTNX[k];
  else if (typ === "NY") z = MTNY[k];
  else if (typ === "NU") z = MTNU[k];
  if (!z) return null;
  quelle = `Ifanger MicroTurn MT${typ} ${k}${sechs}: Bohrung ab Ø${z.D}, Schaft Ø${z.S}, L ${z.L}, L1 ${z.L1}, L2 ${z.L2}` +
    (z.F ? `, F ${z.F}` : "") + (z.T ? `, T ${z.T}` : "") + (z.B ? `, B ${z.B}` : "") + (z.M ? `, ${z.M}` : "");
  const halter = { schaft: rund(z.S), auskrag: rund(z.L2), hals: rund(z.L1), dmin: rund(z.D), versatz: rund(z.F || z.D / 2) };
  const gesch = ["Dicke"];
  let wz;
  if (typ === "NU" || typ === "NX" || typ === "NY") {
    wz = { art: "dreh", form: "E", sl: "or", r: "0.05", breite: rund(z.B), l: rund(z.T) };
    gesch.push("Eckradius");
  } else if (typ === "GE") {
    wz = { art: "dreh", form: "G", sl: "or", r: "0.05", l: rund(Math.max(0.5, z.F)) };
    gesch.push("Radius");
  } else if (typ === "FA") {
    wz = { art: "dreh", form: "V", sl: "or", r: "0.05", l: rund(Math.max(0.5, z.T * 1.4)) };
    gesch.push("Radius");
  } else {
    // Radius: sechsstellig 0 = scharf, 5 = R0.05; fünfstellig der Katalogwert
    const r = sechs === "0" ? 0.01 : sechs === "5" ? 0.05 : z.R;
    wz = { art: "dreh", form: typ[0] === "K" ? "V" : "D", sl: "or", r: rund(r), l: rund(Math.max(0.5, z.T || z.F)) };
  }
  wz.dicke = rund(Math.max(0.3, (z.F || z.D / 2) * 0.5));
  Object.assign(wz, halter);
  return { art: "dreh", wz, status: "teilweise", geschaetzt: gesch, info: quelle };
}

// Horn Mini R105 (Ausdrehen): R105.<Typ><Grösse>.[Radius].<Länge>.<Dmin>.
// Genau aus dem Katalog nur die Zeilen in HORN105, sonst aus der Nummer:
// letzte Gruppe = kleinste Bohrung (15 = 1.5, HV4/H.7 = 4/7), Gruppe 005/01
// davor = Eckradius (ohne: 0.2, geschätzt), Länge aus der Längenstufe geschätzt
const HORN105 = {
  "R105.1033.2.6": { D: 6, l2: 15, d: 5.4, r: 0.2 },
  "R105.1033.005.4.6": { D: 6, l2: 25, d: 5.4, r: 0.05 },
  "R105.1813.01.0.15": { D: 1.5, l2: 6, d: 1.1, r: 0.1 },
};
function horn105(t) {
  const m = /\bR105\.(\d{4})((?:\.[0-9A-Z]+)+)/i.exec(t);
  if (!m) return null;
  const teile = m[2].split(".").filter(Boolean).map((s) => s.toUpperCase());
  const kurz = ("R105." + m[1] + "." + teile.join(".")).replace(/\.H\./, ".");
  const gesch = [];
  let D, r, l2, genau = HORN105[kurz];
  if (genau) ({ D, r, l2 } = genau);
  else {
    const letzt = teile[teile.length - 1].replace(/^H?V?/, "");
    D = letzt.length >= 2 ? Number(letzt) / 10 : Number(letzt);   // 15 = 1.5
    const zahlen = teile.slice(0, -1).filter((s) => /^\d+$/.test(s));
    const rG = zahlen.find((s) => /^0\d+$/.test(s) && s.length >= 2);
    r = rG ? Number("0." + rG.slice(1)) : 0.2;
    if (!rG) gesch.push("Eckradius");
    const stufe = Number(zahlen.filter((s) => s !== rG).pop() || 1);
    l2 = Math.max(3 * D, D * (5 + 5 * stufe) / 6);
    gesch.push("Länge");
  }
  if (!(D > 0)) return null;
  gesch.push("Dicke", "Lage zur Mitte", "Schaft");
  const wz = { art: "dreh", form: "D", sl: "or", r: rund(r), l: rund(Math.max(0.5, D * 0.35)),
    dicke: rund(Math.max(0.3, D * 0.2)), schaft: "6", dmin: rund(D), hals: rund(l2), auskrag: rund(l2), versatz: rund(D * 0.45) };
  return { art: "dreh", wz, status: "teilweise", geschaetzt: gesch,
    info: `Horn Mini R105: Bohrung ab Ø${D}, Eckradius ${r}, Ausspannlänge ${rund(l2)}` + (genau ? " (Katalog)" : " (aus der Nummer)") };
}

// Utilis Multidec 3004 / 1604 mit Schneide 29xyz (R = xyz/100): Form U,
// Spitzenwinkel 27°, Freiwinkel 61° (Katalog Utilis)
function utilisDec(t) {
  const m = /\b(3004|1604)-(\d+(?:[.,]\d+)?)-[\d.-]+\s+(F?[RL])\s+(?:SP)?29(\d{3})/i.exec(t);
  if (!m) return null;
  const r = Number(m[4]) / 100;
  const c = m[1] === "3004" ? 11 : 4.5;
  const wz = { art: "dreh", form: "U", sl: /L/i.test(m[3]) ? "ol" : "or", r: rund(r || 0.02), winkel: "27", schraeg: "2", l: rund(c),
    dicke: m[1] === "3004" ? "3" : "2" };
  return { art: "dreh", wz, status: "teilweise", geschaetzt: ["Dicke", "Lage"],
    info: `Utilis Multidec ${m[1]}, a ${zahl(m[2])}, R${r}, Spitzenwinkel 27°, Freiwinkel 61°` };
}

// Werkzeug aus einem Artikel: {art, wz, status, geschaetzt[]} oder null.
// innen: Lage oben (Bohrung), sonst aussen unten (wie camProtokoll.js)
export function artikelWerkzeug(kat, nr, desc) {
  nr = String(nr || ""); desc = String(desc || "");
  const t = nr + " " + desc;
  const gesch = [];
  const k = String(kat || "");
  const dreh = DREH_KAT.includes(k) || (!FRAES_KAT.includes(k) && (isoCode(t) || /platte|stech/i.test(t)));
  if (!WZ_KAT.includes(k) && !dreh && !RE_D.test(t)) return null;
  if (dreh) {
    const innen = /ausdreh|bohrstange|\bIR\b|innen|R105|MTE|MTG|MTK|MTN|MTF|GT10\d/i.test(k + " " + t);
    const sl = innen ? "or" : "ur";
    const iso = isoCode(t);
    const rText = RE_R.exec(desc) || /(?:^|[\s-])R(0[.,]\d+)(?!\d)/i.exec(nr);
    // Gewinde: 16ER 1.0 ISO, 11 IR 0.5 ISO, 16 AR 1.25 ISO
    const gew = /\b(\d{1,2})\s*([EIA])R\s*(\d+(?:[.,]\d+)?|A60|AG60)?/i.exec(nr) || (k === "Gewindeplatte" ? [] : null);
    if (gew && !iso) {
      const wz = { art: "dreh", form: "G", r: "0.05", sl: /I/i.test(gew[2] || "") ? "or" : "ur" };
      gesch.push("Radius");
      // Grösse der Platte: 11 → 6.6, 16 → 9.6, 22 → 13.2; Mini 2–4 etwa 2.5–4.5
      const g = Number(gew[1]);
      if (g) { wz.l = rund(g < 6 ? g + 0.5 : g * 0.6); gesch.push("Grösse"); } else { wz.l = "9.6"; gesch.push("Grösse"); }
      wz.dicke = g && g < 6 ? "2" : "3.5"; gesch.push("Dicke");
      const p = /\bP\s*(\d+(?:[.,]\d+)?)/i.exec(desc) || (gew[3] && /\d/.test(gew[3]) ? [0, gew[3]] : null);
      return { art: "dreh", wz, status: "teilweise", geschaetzt: gesch, info: p ? "Steigung " + zahl(p[1]) : "" };
    }
    const kat1 = ifanger(t) || horn105(t) || utilisDec(t);
    if (kat1) return kat1;
    // Ifanger Swiss-MicroTurn MTN.. (Einstechen innen, Vollhartmetall mit
    // Schaft; Patrick 22. November 2026: lag vorher als D-Platte da)
    const mtn = /\bMTN[A-Z]?\s*(\d{5})/i.exec(t);
    if (mtn || /\bMTN[A-Z]?\s*\d{4}/i.test(t)) {
      const m = mtn && MTNU[mtn[1]];
      if (m) {
        // Katalog Ifanger MicroTurn 2024 S. 26: Schneide ohne Radius, Dicke
        // = Hals (F etwas unter dem Schaftradius)
        const wz = { art: "dreh", form: "E", sl: "or", r: "0.05", breite: rund(m.B), l: rund(m.T), dicke: rund(Math.max(0.5, m.F * 0.5)),
          schaft: rund(m.S), auskrag: rund(m.L2) };
        return { art: "dreh", wz, status: "teilweise", geschaetzt: ["Dicke"],
          info: `Ifanger MicroTurn MTNU ${mtn[1]}: Bohrung ab Ø${m.D}, B ${m.B}, T ${m.T}, Schaft Ø${m.S}, L ${m.L}, L1 ${m.L1}, L2 ${m.L2}, F ${m.F}` };
      }
      const ab = /ab\s*Ø\s*(\d+(?:[.,]\d+)?)/i.exec(desc);
      const dmin = ab ? zahl(ab[1]) : null;
      const b = stechBreite(nr, desc);
      const wz = { art: "dreh", form: "E", sl: "or", r: "0.05" };
      gesch.push("Eckradius");
      if (b) wz.breite = rund(b); else { wz.breite = rund(dmin ? Math.min(1.5, Math.max(0.5, dmin * 0.25)) : 1); gesch.push("Breite"); }
      wz.l = rund(dmin ? Math.max(1, dmin * 0.4) : 2); gesch.push("Tiefe");
      wz.dicke = rund(dmin ? Math.max(0.6, dmin * 0.25) : 1); gesch.push("Dicke");
      return { art: "dreh", wz, status: "teilweise", geschaetzt: gesch, info: "Ifanger Swiss-MicroTurn, Einstechen innen" + (dmin ? ", Bohrung ab Ø" + dmin : "") };
    }
    const breite = stechBreite(nr, desc);
    if (k === "Stechplatte" || (breite && !iso) || /einstech|stechplatte/i.test(t)) {
      const wz = { art: "dreh", form: "E", sl };
      if (breite) wz.breite = rund(breite); else { wz.breite = "2"; gesch.push("Breite"); }
      const r = stechRadius(nr, desc);
      if (r !== null) wz.r = rund(r); else { wz.r = "0.05"; gesch.push("Eckradius"); }
      wz.dicke = "3"; gesch.push("Dicke");
      wz.l = rund(Math.max(8, (breite || 2) * 2.5)); gesch.push("Länge");
      return { art: "dreh", wz, status: breite ? "teilweise" : "teilweise", geschaetzt: gesch };
    }
    if (iso) {
      const wz = { art: "dreh", form: iso.form, sl };
      const r = rText ? zahl(rText[1]) : iso.r;
      if (iso.form === "R") { wz.r = rund(r || (iso.l || 6) / 2); delete wz.sl; }
      else wz.r = rund(r);
      if (iso.l) wz.l = rund(iso.l); else if (iso.form !== "R") gesch.push("Kantenlänge");
      if (iso.dicke) wz.dicke = rund(iso.dicke); else gesch.push("Dicke");
      if (innen) gesch.push("Lage innen");
      if (iso.ersatz) gesch.push("Form " + iso.code.slice(0, 1) + " als " + iso.form);
      return { art: "dreh", wz, status: gesch.length ? "teilweise" : "erkannt", geschaetzt: gesch };
    }
    // Ausdreher und andere ohne Code: Bohrstange mit kleiner D-Platte
    const ab = /ab\s*Ø\s*(\d+(?:[.,]\d+)?)/i.exec(desc) || RE_D.exec(desc);
    const dmin = ab ? zahl(ab[1]) : null;
    const r = rText ? zahl(rText[1]) : null;
    const wz = { art: "dreh", form: "D", sl: innen || k === "Ausdrehwerkzeug" ? "or" : sl, r: rund(r ?? 0.1) };
    if (r === null) gesch.push("Radius");
    wz.l = rund(dmin ? Math.max(1, Math.min(6, dmin * 0.45)) : 3); gesch.push("Grösse");
    wz.dicke = rund(dmin ? Math.max(0.6, Math.min(2.5, dmin * 0.25)) : 1.5); gesch.push("Dicke");
    gesch.push("Form");
    return { art: "dreh", wz, status: "teilweise", geschaetzt: gesch, info: dmin ? "Bohrung ab Ø" + dmin : "" };
  }

  // Bohr- und Fräswerkzeuge
  const dm = RE_D.exec(desc) || RE_D.exec(nr) || /(?:^|[^A-Z])(?:d|Dia)\s*(\d+[.,]\d+)/.exec(desc) || /(?:^|[^A-Z])(?:Dia|d)\s*(\d+(?:[.,]\d+)?)/.exec(nr);
  const mm = /\bM\s*(\d+(?:[.,]\d+)?)/.exec(desc) || /\bM\s*(\d+(?:[.,]\d+)?)/.exec(nr);
  let d = dm ? zahl(dm[1]) : null;
  if (/Gewinde/i.test(k) && mm) d = zahl(mm[1]);
  const wm = RE_WINKEL.exec(desc);
  if (/Kreissäge/i.test(k)) {
    // Ø25x1.25xØ8 oder Belet d15e0.50a5
    const s1 = /Ø?\s*(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*x/i.exec(t);
    const s2 = /d\s*(\d+(?:[.,]\d+)?)\s*e\s*(\d+(?:[.,]\d+)?)/i.exec(t);
    const s = s1 || s2;
    if (!s && !d) return { art: "fraes", wz: null, status: "nein", geschaetzt: [] };
    const D = s ? zahl(s[1]) : d, B = s ? zahl(s[2]) : 1;
    if (!s) gesch.push("Breite");
    gesch.push("Hals", "Halslänge");
    return { art: "fraes", wz: { art: "fraes", form: "scheibe", d: rund(D), breite: rund(B), hals: rund(Math.max(1, D * 0.35)), laenge: rund(Math.max(B + 1, D * 0.3)) },
      status: "teilweise", geschaetzt: gesch };
  }
  if (!d) {
    // Stufenbohrer „Ø3.4/Ø6.2“ in der Nummer, „Ø 2.75 x 1.0“
    const m = /Ø\s*(\d+(?:[.,]\d+)?)/.exec(nr);
    if (m) d = zahl(m[1]);
  }
  const rk0 = /R\s*(\d+(?:[.,]\d+)?)/i.exec(desc);
  if (!d && rk0 && /Kugel/i.test(k + desc)) d = zahl(rk0[1]) * 2;
  if (!d || !(d > 0)) return { art: "fraes", wz: null, status: "nein", geschaetzt: [] };
  const rk = /R\s*(\d+(?:[.,]\d+)?)/i.exec(desc);
  let form = "bohrer";
  if (/Kugel/i.test(k + desc)) form = "kugel";
  else if (/Eckradius/i.test(desc)) form = "eck";
  else if (/Kegel|Entgrat|Fase|Senk/i.test(k + " " + desc)) form = "fase";
  else if (/Schaftfräser/i.test(k)) form = "schaft";
  const wz = { art: "fraes", form, d: rund(d) };
  if (form === "kugel" && rk && !dm) wz.d = rund(zahl(rk[1]) * 2);
  if (form === "eck") { if (rk) wz.r = rund(zahl(rk[1])); else { wz.r = rund(d * 0.1); gesch.push("Eckradius"); } }
  if (form === "bohrer" || form === "fase") {
    if (wm) wz.winkel = wm[1];
    else if (/Zentr/i.test(k + desc)) { wz.winkel = "90"; gesch.push("Spitzenwinkel"); }
    else if (/Gewindebohr|Gewindeform|Reib/i.test(k)) { wz.winkel = "120"; gesch.push("Anschnitt"); }
    else if (form === "fase") { wz.winkel = "90"; gesch.push("Spitzenwinkel"); }
    else { wz.winkel = /HSS/i.test(t) ? "118" : "140"; gesch.push("Spitzenwinkel"); }
  }
  const xd = /(\d+)\s*[x×]\s*D/i.exec(desc);
  wz.laenge = rund(xd ? Math.max(3, d * (Number(xd[1]) + 1)) : Math.max(4, d * (form === "bohrer" ? 4 : 3)));
  gesch.push("Schneidenlänge");
  if (/Stufenbohrer/i.test(k + desc + nr)) gesch.push("Stufe nicht abgebildet");
  return { art: "fraes", wz, status: gesch.length > 1 ? "teilweise" : "erkannt", geschaetzt: gesch };
}

// Werkzeug aus einem Text im Einrichtblatt (ohne Artikel): Art raten
export function textWerkzeug(hersteller, werkzeug) {
  const t = [hersteller, werkzeug].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  let kat = "";
  if (isoCode(t)) kat = "Wendeplatte";
  else if (stechBreite(t, t) !== null || /stech/i.test(t)) kat = "Stechplatte";
  else if (/\b\d{1,2}\s*[EIA]R\b/i.test(t)) kat = "Gewindeplatte";
  else if (/zentr/i.test(t)) kat = "Zentrierer";
  else if (/kugel/i.test(t)) kat = "Kugelfräser";
  else if (/fräs|fraes/i.test(t)) kat = "Schaftfräser";
  else if (/bohr/i.test(t) || RE_D.test(t)) kat = "Bohrer";
  else return null;
  const e = artikelWerkzeug(kat, t, t);
  return e && e.wz ? { ...e, kat } : null;
}

// Für die Liste: was zu einer Bearbeitung passt (b.art → dreh / fraes)
export const STATUS_TEXT = { erkannt: "erkannt", teilweise: "teilweise geschätzt", nein: "nicht erkannt", hand: "von Hand ergänzt", kein: "kein Werkzeug" };

let vorrat = null, vorratZeit = 0;
export const bibliothekVergessen = () => { vorrat = null; };

// Alle realen Werkzeuge: Artikel, von Hand Ergänztes, Texte aus den
// Einrichtblättern; eine Minute gemerkt
export async function bibliothekLaden(db, frisch = false) {
  if (!frisch && vorrat && Date.now() - vorratZeit < 60000) return vorrat;
  const [a, l, h, n] = await Promise.all([
    db.from("articles").select("id, article_number, name, description, supplier_id, is_active").in("name", WZ_KAT),
    db.from("suppliers").select("id, name"),
    db.from("cam_werkzeuge").select("schluessel, article_id, text, wz, kein, geaendert_am"),
    db.rpc("cam_wz_nutzung"),
  ]);
  if (a.error) throw new Error(a.error.message);
  const lief = Object.fromEntries((l.data || []).map((x) => [x.id, x.name]));
  const hand = Object.fromEntries((h.error ? [] : h.data || []).map((x) => [x.schluessel, x]));
  const nutzung = n.error ? [] : n.data || [];
  const liste = [];
  const nachNr = [];
  for (const x of a.data || []) {
    if (x.is_active === false) continue;
    const e = artikelWerkzeug(x.name, x.article_number, x.description) || { art: DREH_KAT.includes(x.name) ? "dreh" : "fraes", wz: null, status: "nein", geschaetzt: [] };
    const eintrag = { schluessel: "a:" + x.id, article_id: x.id, nr: x.article_number || "", lief: lief[x.supplier_id] || "", kat: x.name,
      text: x.description || "", erkannt: e, anzahl: 0 };
    liste.push(eintrag);
    const nn = normNr(x.article_number);
    if (nn.length >= 5) nachNr.push([nn, eintrag]);
  }
  const nachId = Object.fromEntries(liste.map((e) => [e.article_id, e]));
  nachNr.sort((p, q) => q[0].length - p[0].length);
  const texte = {};
  for (const z of nutzung) {
    const roh = [z.hersteller, z.werkzeug].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    let e = z.article_id ? nachId[z.article_id] : null;
    if (!e) {
      const nt = normNr(roh);
      const t = nachNr.find(([nn]) => nt.includes(nn));
      if (t) e = t[1];
    }
    if (e) { e.anzahl += Number(z.anzahl) || 0; continue; }
    const s = "t:" + normNr(roh).slice(0, 80);
    if (s.length < 6) continue;
    if (!texte[s]) texte[s] = { schluessel: s, article_id: null, nr: "", lief: "", kat: "", text: roh, erkannt: null, anzahl: 0 };
    texte[s].anzahl += Number(z.anzahl) || 0;
  }
  for (const e of Object.values(texte)) {
    const w = textWerkzeug("", e.text);
    if (!w && !hand[e.schluessel]) continue;
    e.erkannt = w || { art: "dreh", wz: null, status: "nein", geschaetzt: [] };
    e.kat = w ? w.kat : "";
    e.nurText = true;
    liste.push(e);
  }
  for (const e of liste) {
    const hd = hand[e.schluessel];
    e.hand = hd || null;
    e.kein = !!(hd && hd.kein);
    e.wz = hd && hd.wz ? hd.wz : e.erkannt.wz;
    e.art = e.wz ? e.wz.art : e.erkannt.art;
    e.status = e.kein ? "kein" : hd && hd.wz ? "hand" : e.erkannt.wz ? e.erkannt.status : "nein";
    e.geschaetzt = hd && hd.wz ? [] : e.erkannt.geschaetzt || [];
    e.such = (e.nr + " " + e.lief + " " + e.kat + " " + e.text).toLowerCase();
  }
  liste.sort((p, q) => q.anzahl - p.anzahl || p.kat.localeCompare(q.kat) || p.nr.localeCompare(q.nr));
  vorrat = liste; vorratZeit = Date.now();
  return liste;
}

// Ergänztes speichern (wz null + kein = kein Werkzeug, beides leer = löschen)
export async function bibliothekSpeichern(db, e, wz, kein = false) {
  const zeile = { schluessel: e.schluessel, article_id: e.article_id || null, text: e.text || null, wz: wz || null, kein: !!kein, geaendert_am: new Date().toISOString() };
  const r = !wz && !kein ? await db.from("cam_werkzeuge").delete().eq("schluessel", e.schluessel)
    : await db.from("cam_werkzeuge").upsert(zeile, { onConflict: "schluessel" });
  if (r.error) throw new Error(r.error.message);
  bibliothekVergessen();
}

// Verweis am Werkzeug der Bearbeitung
export const artikelVerweis = (e) => ({ schluessel: e.schluessel, id: e.article_id || null, nr: e.nr || "", lief: e.lief || "", text: e.nurText ? e.text : e.text || e.kat });

// Für das Werkzeugprotokoll: Eintrag zu einem Platz (Artikel-Id oder
// Art.-Nr. im Text)
export function bibliothekFuerPlatz(liste, p) {
  if (!liste || !p) return null;
  if (p.article_id) { const e = liste.find((x) => x.article_id === p.article_id); if (e && e.wz) return e; }
  const nt = normNr([p.hersteller, p.werkzeug].filter(Boolean).join(" "));
  if (nt.length < 5) return null;
  let best = null;
  for (const e of liste) {
    if (!e.wz) continue;
    const nn = e.article_id ? normNr(e.nr) : e.schluessel.slice(2);
    if (nn.length >= 5 && nt.includes(nn) && (!best || nn.length > normNr(best.nr || best.schluessel).length)) best = e;
  }
  return best;
}

// Werkzeug für eine Bearbeitung: Lage aus dem Block behalten, wo sinnvoll
export function wzAusBibliothek(e, altWz) {
  const wz = { ...e.wz, artikel: artikelVerweis(e) };
  if (wz.art === "dreh" && altWz && altWz.art === "dreh" && altWz.sl && wz.form !== "R") wz.sl = altWz.sl;
  if (altWz && altWz.step) wz.step = altWz.step;
  return wz;
}
