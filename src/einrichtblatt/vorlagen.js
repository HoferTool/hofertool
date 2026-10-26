// =================================================================
//  EINRICHTBLATT IN DER APP: Vorlagen je Maschinentyp
//  Die Hofer-Version jedes Typs, abgeleitet aus seinen bisherigen
//  Excel-Blättern (Wunsch Patrick, 23. Oktober 2026: „baue die Testseite
//  für alle Maschinen, nicht nur SW-20 … solltest du selber sehen, wenn
//  du ihre Excel liest“). Ausgewertet wurden je Typ 20 bis 45 Blätter:
//  wo welche Platz-Nummer steht und welche Felder im Kopf.
//
//  - Star (SB-16C, SB-16D, SB-16E, SB-20, SR-10, SR-32): oben T100 bis
//    T600, darunter links der Kopf, rechts T700–T1000, T1100–T1400,
//    T2100–T2400 und, wo vorhanden, T3100–T3400. Kopf mit
//    „Programm Nr.“ und „N1000“.
//  - Index: drei Revolver mit je T1 bis T10 in zwei Reihen zu fünf,
//    Revolver 1 olivbraun, 2 grün, 3 blau; links der Kopf, ohne Programm-Nr.
//    (Patrick: „Index hat keine Nr.“), dafür die Festanschlag-Länge.
//  - SW-20: wie bisher, drei Paths in Orange, Blau und Grün und die
//    Geometriedaten.
//
//  Autom.-Nr. und FA Nr. stehen nicht mehr im Blatt (Wunsch Patrick,
//  24. Oktober 2026): das Blatt gilt für HOCO Nr. und Typ, nicht für
//  eine Maschine oder einen Auftrag.
//
//  Ein Feld im Kopf gehört entweder zur HOCO Nr. (Stammdaten, gilt auf
//  allen Typen), zu HOCO Nr. und Typ (Stückzeit, Laufzeit) oder nur zu
//  diesem Blatt.
// =================================================================

// Wo ein Feld gespeichert ist:
//  stamm  hoco_parts.<feld>, gilt für die HOCO Nr. auf allen Typen
//  typ    hoco_type_data.<feld>, je HOCO Nr. und Typ
//  prg    einrichtblatt_app.programme[<feld>]
//  blatt  einrichtblatt_app.<feld>
//  kopf   einrichtblatt_app.kopf[<feld>]
//  fest   nur angezeigt (HOCO Nr., Typ)
const F = {
  hoco: { art: "fest", feld: "hoco", label: "Ho&Co. Nr:" },
  bez: { art: "stamm", feld: "bezeichnung", label: "Artikel Bezeich:" },
  zeichnung: { art: "stamm", feld: "zeichnungs_nr", label: "Zeichnungs Nr:" },
  index: { art: "stamm", feld: "index_nr", label: "Index:" },
  material: { art: "stamm", feld: "material", label: "Material:" },
  zeit: { art: "typ", feld: "stueckzeit_s", label: "Prod.- Zeit:", zahl: true, einheit: "Sek./Stk." },
  wasch: { art: "stamm", feld: "waschgebinde", label: "Waschgebinde:", auswahl: "waschgebinde" },
  laufzeit: { art: "typ", feld: "abend_stk", label: "Masch.- Laufzeit:", zahl: true, einheit: "Stk. am Abend" },
  // Bei allen ausser Index heisst das Programm „Path 1“ (Wunsch Patrick,
  // 24. Oktober 2026)
  prgNr: { art: "prg", feld: "nr", label: "Path 1:" },
  n1000: { art: "kopf", feld: "n1000", label: "N1000:" },
  geometrie: { art: "blatt", feld: "geometrie", label: "Geometriedaten:", farbe: "#FF0000" },
  festanschlag: { art: "kopf", feld: "festanschlag", label: "Festanschlag Länge:" },
};
const pfad = (n, farbe) => ({ art: "prg", feld: String(n), label: "Path " + n + ":", farbe });

const T = (von, bis, schritt) => {
  const l = [];
  for (let n = von; n <= bis; n += schritt) l.push("T" + n);
  return l;
};
const vier = (l) => [null, null].concat(l, [null, null, null, null]).slice(0, 6);

// ---------------- Star ----------------
// Abgleich mit je 25 Excel-Blättern je Typ (25. Oktober 2026): Die
// Plätze in Gebrauch haben im Excel eine Farbe je Typ, keine je Path
// (SB-16C blau, SB-16D, SB-16E und SB-20 grün, SR-32 hellgrün, SR-10
// gelb), leere Plätze keine. Die zweite Reihe im Excel trägt je nach
// Blatt T700–T1000 oder T3100–T3300, darum stehen die beiden Reihen hier
// nebeneinander; beim SB-20 steht T3100–T3400 an zweiter Stelle.
const STAR_FARBE = { sb16c: "#00B0F0", sb16d: "#92D050", sb16e: "#92D050", sb20: "#92D050", sr32: "#99CC00", sr10: "#FFFF00" };
function star(name, art, { mitT700 = true, mitT3100 = true, mitT3400 = false } = {}) {
  const reihen = [T(100, 600, 100)];
  const t3100 = vier(T(3100, mitT3400 ? 3400 : 3300, 100));
  if (mitT700) reihen.push(vier(T(700, 1000, 100)));
  if (mitT3100) reihen.push(t3100);
  reihen.push(vier(T(1100, 1400, 100)));
  reihen.push(vier(T(2100, 2400, 100)));
  return {
    art: "star", titel: "Werkzeug- Protokoll-" + name, spalten: 6, kopfBreite: 2, kopfAb: 1, reihen,
    typFarbe: STAR_FARBE[art] || null,
    felder: [F.prgNr, F.hoco, F.bez, F.zeichnung, F.index, F.material, F.n1000, F.zeit, F.wasch, F.laufzeit],
    prgNr: true,
  };
}

// ---------------- Index ----------------
// Revolver 1 im Excel olivbraun (Designfarbe „Hintergrund 2, dunkler 50 %“),
// die Platznummern darauf schwarz (seit 1.210.1, Wunsch Patrick 26. Oktober 2026)
const REVOLVER = [["1", "#948A54"], ["2", "#92D050"], ["3", "#00B0F0"]];
function index(name) {
  const reihen = [];
  REVOLVER.forEach(([r]) => {
    reihen.push([null].concat(T(1, 5, 1).map((t) => "R" + r + "-" + t)));
    reihen.push([null].concat(T(6, 10, 1).map((t) => "R" + r + "-" + t)));
  });
  const farben = {};
  REVOLVER.forEach(([r, f]) => T(1, 10, 1).forEach((t) => { farben["R" + r + "-" + t] = f; }));
  return {
    art: "index", titel: "Werkzeug- Protokoll-" + name + " C100", spalten: 6, kopfBreite: 1, kopfAb: 0, reihen, farben,
    schrift: "#000000",
    // Im Excel ist der Kopf etwas breiter als ein Platz
    breiten: "1.3fr repeat(5, minmax(0, 1fr))",
    legende: REVOLVER.map(([r, f]) => ["Revolver " + r, f]),
    // Im Excel kein „Masch.- Laufzeit“; es bleibt, weil Stück am Abend
    // dieselbe Zahl wie im Pad ist. „Anschlag Länge“ und „Festanschlag
    // Länge“ sind im Excel dasselbe Feld
    felder: [F.hoco, F.bez, F.zeichnung, F.index, F.material, F.zeit, F.wasch, F.laufzeit, F.festanschlag],
    prgNr: false,
  };
}

// ---------------- SW-20 ----------------
const SW_FARBE = { 1: "#FFC000", 2: "#00B0F0", 3: "#00B050" };
function sw(name) {
  const reihen = [
    ["T100", "T200", "T300", "T400", "T1100", "T1200"],
    ["T500", "T600", "T700", "T1300", "T1400", "T1500"],
    [null, null, "T1600", "T1700", "T1800", "T1900"],
    [null, null, "T2100", "T2200", "T2300", "T2400"],
    [null, null, "T2500", "T2600", "T2700", "T2800"],
  ];
  const farben = {};
  reihen.flat().filter(Boolean).forEach((t) => {
    const n = Number(t.slice(1));
    farben[t] = n < 1000 ? SW_FARBE[1] : n < 2000 ? SW_FARBE[3] : SW_FARBE[2];
  });
  return {
    art: "sw", titel: "Werkzeug- Protokoll-" + name.replace(/-/g, ""), spalten: 6, kopfBreite: 2, kopfAb: 2, reihen, farben,
    felder: [pfad(1, SW_FARBE[1]), pfad(2, SW_FARBE[2]), pfad(3, SW_FARBE[3]), F.geometrie, F.hoco, F.bez, F.zeichnung,
      F.index, F.material, F.zeit, F.wasch, F.laufzeit],
    prgNr: true,
  };
}

// Für Typen ohne eigene Excel-Vorlage (Hanwha, Macodel): wie Star, aber
// die Plätze aus dem Aufbau des Typs (Produktion → Maschinentypen)
function allgemein(name, paths) {
  const alle = [];
  [...(paths || [])].sort((a, b) => (a.nummer || 0) - (b.nummer || 0) || (a.sortierung || 0) - (b.sortierung || 0))
    .forEach((p) => (p.type_slots || []).forEach((s) => { if (s.tool_nr && !alle.includes(s.tool_nr)) alle.push(s.tool_nr); }));
  const reihen = [alle.splice(0, 6)];
  while (alle.length) reihen.push(vier(alle.splice(0, 4)));
  while (reihen.length < 5) reihen.push(vier([]));
  return {
    art: "allgemein", titel: "Werkzeug- Protokoll-" + name, spalten: 6, kopfBreite: 2, kopfAb: 1, reihen: reihen.map((r) => r.concat([]).slice(0, 6)),
    felder: [F.prgNr, F.hoco, F.bez, F.zeichnung, F.index, F.material, F.zeit, F.wasch, F.laufzeit],
    prgNr: true,
  };
}

const kurz = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Die Vorlage für einen Typ
// Die Typen heissen etwa „SB-16C_113“ (mit Maschinen-Nr.) oder im
// Prüfstand „Star SR-32J“: beides gehört zur Vorlage des Star
export function vorlageFuer(typ, paths) {
  const name = String((typ && typ.name) || "").replace(/_\d+$/, "");
  const n = kurz(name).replace(/^star/, "");
  if (/^sw/.test(n)) return sw(name);
  if (/^index/.test(n)) return index(name);
  const st = (/^(sb16[cde]|sb20|sr32|sr10)/.exec(n) || [])[1];
  if (st === "sr32") return star(name, st, { mitT3100: false });
  if (st === "sb20") return star(name, st, { mitT700: false, mitT3400: true });
  if (/^(sb|sr)\d/.test(n)) return star(name, st);
  return allgemein(name, paths);
}

// Die Reihen des Blatts mit allem, was im Blatt sonst noch steht (etwa
// ein seltener Platz T3421 aus dem Excel): das kommt in Reihen dahinter
export function reihenMitRest(vorlage, plaetze) {
  const reihen = vorlage.reihen.map((r) => r.slice());
  const drin = new Set(reihen.flat().filter(Boolean));
  const rest = Object.keys(plaetze || {}).filter((k) => !drin.has(k)).sort(platzSort);
  const frei = vorlage.spalten - vorlage.kopfBreite;
  while (rest.length) {
    const r = Array.from({ length: vorlage.kopfBreite }, () => null)
      .concat(Array.from({ length: frei }, () => rest.shift() || null));
    reihen.push(r);
  }
  return reihen;
}

// „R2-T7“ → Revolver 2, T7; „T1100“ bleibt
export function platzName(key) {
  const m = /^R(\d)-(T\d+)$/.exec(key || "");
  return m ? m[2] : key;
}
export function platzGruppe(key) {
  const m = /^R(\d)-/.exec(key || "");
  return m ? "Revolver " + m[1] : "";
}
function platzSort(a, b) {
  const z = (k) => { const m = /^(?:R(\d)-)?T(\d+)$/.exec(k) || []; return [Number(m[1] || 0), Number(m[2] || 0)]; };
  const x = z(a), y = z(b);
  return x[0] - y[0] || x[1] - y[1] || String(a).localeCompare(String(b));
}
