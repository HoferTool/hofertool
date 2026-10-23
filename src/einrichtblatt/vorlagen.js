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
//    Revolver 1 weiss, 2 grün, 3 blau; links der Kopf, ohne Programm-Nr.
//    (Patrick: „Index hat keine Nr.“), dafür Festanschlag und Anschlag.
//  - SW-20: wie bisher, drei Paths in Orange, Blau und Grün und die
//    Geometriedaten.
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
  fa: { art: "kopf", feld: "fa_nr", label: "Fabrik.-Auftr. Nr.:" },
  bez: { art: "stamm", feld: "bezeichnung", label: "Artikel Bezeich:" },
  zeichnung: { art: "stamm", feld: "zeichnungs_nr", label: "Zeichnungs Nr:" },
  index: { art: "stamm", feld: "index_nr", label: "Index:" },
  autom: { art: "blatt", feld: "maschine_nr", label: "Autom.-Typ / Nr:", typVorne: true, platzhalter: "Nr." },
  material: { art: "stamm", feld: "material", label: "Material:" },
  zeit: { art: "typ", feld: "stueckzeit_s", label: "Prod.- Zeit:", zahl: true, einheit: "Sek./Stk." },
  wasch: { art: "stamm", feld: "waschgebinde", label: "Waschgebinde:", auswahl: "waschgebinde" },
  laufzeit: { art: "typ", feld: "abend_stk", label: "Masch.- Laufzeit:", zahl: true, einheit: "Stk. am Abend" },
  prgNr: { art: "prg", feld: "nr", label: "Programm Nr.:" },
  n1000: { art: "kopf", feld: "n1000", label: "N1000:" },
  geometrie: { art: "blatt", feld: "geometrie", label: "Geometriedaten:", farbe: "#FF0000" },
  festanschlag: { art: "kopf", feld: "festanschlag", label: "Festanschlag Länge:" },
  anschlag: { art: "kopf", feld: "anschlag_von", label: "Anschlag von:" },
};
const pfad = (n, farbe) => ({ art: "prg", feld: String(n), label: "Programm Path " + n + ":", farbe });

const T = (von, bis, schritt) => {
  const l = [];
  for (let n = von; n <= bis; n += schritt) l.push("T" + n);
  return l;
};
const vier = (l) => [null, null].concat(l, [null, null, null, null]).slice(0, 6);

// ---------------- Star ----------------
function star(name, { mitT700 = true, mitT3100 = true, mitT3400 = false } = {}) {
  const reihen = [T(100, 600, 100)];
  if (mitT700) reihen.push(vier(T(700, 1000, 100)));
  reihen.push(vier(T(1100, 1400, 100)));
  reihen.push(vier(T(2100, 2400, 100)));
  if (mitT3100) reihen.push(vier(T(3100, mitT3400 ? 3400 : 3300, 100)));
  return {
    art: "star", titel: "Werkzeug- Protokoll-" + name, spalten: 6, kopfBreite: 2, kopfAb: 1, reihen,
    felder: [F.prgNr, F.hoco, F.fa, F.bez, F.zeichnung, F.index, F.autom, F.material, F.n1000, F.zeit, F.wasch, F.laufzeit],
    prgNr: true,
  };
}

// ---------------- Index ----------------
const REVOLVER = [["1", "#FFFFFF"], ["2", "#92D050"], ["3", "#00B0F0"]];
function index(name) {
  const reihen = [];
  REVOLVER.forEach(([r]) => {
    reihen.push([null].concat(T(1, 5, 1).map((t) => "R" + r + "-" + t)));
    reihen.push([null].concat(T(6, 10, 1).map((t) => "R" + r + "-" + t)));
  });
  const farben = {};
  REVOLVER.forEach(([r, f]) => T(1, 10, 1).forEach((t) => { farben["R" + r + "-" + t] = f; }));
  return {
    art: "index", titel: "Werkzeug- Protokoll-" + name, spalten: 6, kopfBreite: 1, kopfAb: 0, reihen, farben,
    legende: REVOLVER.map(([r, f]) => ["Revolver " + r, f]),
    felder: [F.hoco, F.fa, F.bez, F.zeichnung, F.index, F.autom, F.material, F.zeit, F.wasch, F.laufzeit, F.festanschlag, F.anschlag],
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
    felder: [pfad(1, SW_FARBE[1]), pfad(2, SW_FARBE[2]), pfad(3, SW_FARBE[3]), F.geometrie, F.hoco, F.fa, F.bez, F.zeichnung,
      F.index, F.autom, F.material, F.zeit, F.wasch, F.laufzeit],
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
    felder: [F.prgNr, F.hoco, F.fa, F.bez, F.zeichnung, F.index, F.autom, F.material, F.zeit, F.wasch, F.laufzeit],
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
  if (/^sr32/.test(n)) return star(name, { mitT3100: false });
  if (/^sb20/.test(n)) return star(name, { mitT700: false, mitT3400: true });
  if (/^(sb|sr)\d/.test(n)) return star(name);
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
