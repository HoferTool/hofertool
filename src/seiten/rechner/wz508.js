// =================================================================
//  508 WERKZEUGE (Willemin-Macodel 508MT2-X1000, Fanuc 31)
//  Seit 1.494.0, Wunsch Patrick 12. November 2026: „auf der 508 die
//  Werkzeugdaten aus dem Inventor CAM für einen Auftrag in die
//  Werkzeugliste der Maschine eintragen“. Ein NC-Programm kann dort
//  kein Werkzeug anlegen (G953 überschreibt nur Werte), die Maschine
//  liest aber die ganze Werkzeugtabelle als Datei GESTOUTI.DAT ein.
//  Darum: aktuelle GESTOUTI.DAT der Maschine + Werkzeug-CSV aus
//  InventorCAM (SolidCAM, Werkzeugtabelle des Teils → Exportieren)
//  → neue GESTOUTI.DAT. Alles, was nicht aus dem CAM kommt, bleibt
//  Zeichen für Zeichen gleich (gemessene Längen, Taster, Greifer …).
//
//  Aufbau der GESTOUTI.DAT je Fach (entschlüsselt an Patricks Datei):
//    N3 D1 (FRAESER VHM D1.5)   Wzg-Nr., Duplo, Name   (leer: N0)
//    G3                         Fach
//    T1 E0 F1 P1 R0 Q110        Grösse, Zustand, fester Platz,
//                               Option (indexiert), ?, Werkzeugtyp
//    I9 J3600 K3600             Standzeit Art, Ursprung, Rest
//    A-2 S30000 T3 I180.0000 …  S max, Zähne, Spitzenwinkel …
//    A-3 / A-4                  Anwender-Bytes
//    A1 … A5                    Korrektor H11 … H15 (X Länge,
//                               U Abnutzung, S, R Radius; Drehstahl
//                               dazu Y V Z W Q)
//  Zustand E6 = „Zu vermessen“: das Programm aus InventorCAM misst
//  am Anfang mit G850/G851 jedes Werkzeug mit Zustand 6.
// =================================================================

// Werkzeugtypen der Maschine (Q), aus der Tabelle der 508
export const TYPEN = [
  [110, "Fräser"], [130, "Kopierfräser"], [160, "Bohrer / Anbohrer"], [180, "Gewindebohrer"],
  [210, "Scheibenfräser"], [500, "Drehstahl"], [510, "Gewinde-Drehstahl"], [520, "Einstechen / Abstechen"],
];

// Werkzeugart aus InventorCAM (Spalte ToolType) → Typ der Maschine
const CAM_TYP = {
  "DRILL": 160, "SPOT DRILL": 160, "CENTER DRILL": 160, "REAMER": 160,
  "END MILL": 110, "BULL NOSE MILL": 110, "FACE MILL": 110, "CHAMFER MILL": 110, "TAPER MILL": 110,
  "BALL NOSE MILL": 130, "LOLLIPOP MILL": 130,
  "TAP": 180,
  "SLOT MILL": 210, "T-SLOT MILL": 210,
};

export const FAECHER = 48;
const NAME_MAX = 32;

// ---------- Hilfen ----------
const zahl = (t) => { const z = parseFloat(String(t == null ? "" : t).replace(",", ".")); return isFinite(z) ? z : NaN; };
const f4 = (z) => (Math.round(z * 10000) / 10000).toFixed(4);
const ganz = (z) => String(Math.round(z));

// Die Steuerung kennt keine Umlaute; Klammern würden den Kommentar beenden
export function maschinenName(t) {
  return String(t || "").trim()
    .replace(/Ä/g, "AE").replace(/Ö/g, "OE").replace(/Ü/g, "UE")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[()]/g, " ").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim()
    .slice(0, NAME_MAX);
}

// Dateien vom Windows-PC sind meist ANSI (Windows-1252), nicht UTF-8
export function dateiText(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch (e) { return new TextDecoder("windows-1252").decode(bytes); }
}

// Zeile wie „T1 E0 F1 P1 R0 Q110“ → [["T","1"],["E","0"],…]
const paare = (zeile) => (zeile.trim().match(/[A-Z]-?[0-9.+-]*/g) || [])
  .map((w) => [w[0], w.slice(1)]);
const zeileAus = (kopf, p) => [kopf, ...p.map(([k, v]) => k + v)].filter(Boolean).join(" ");
const wert = (p, k) => { const x = p.find(([a]) => a === k); return x ? x[1] : undefined; };
const setzen = (p, k, v) => { const x = p.find(([a]) => a === k); if (x) x[1] = v; else p.push([k, v]); };

// ---------- GESTOUTI.DAT lesen ----------
export function datLesen(text) {
  const zeilen = String(text || "").replace(/\r/g, "").split("\n");
  const bloecke = [];
  let akt = null;
  for (const z of zeilen) {
    if (/^N\d/.test(z)) { akt = { zeilen: [z] }; bloecke.push(akt); }
    else if (akt && z.trim() && z.trim() !== "%") akt.zeilen.push(z);
  }
  for (const b of bloecke) {
    const m = b.zeilen[0].match(/^N(\d+)(?:\s+D(\d+))?(?:\s*\((.*)\))?/);
    b.nr = Number(m[1]);
    b.duplo = m[2] ? Number(m[2]) : 1;
    b.name = (m[3] || "").trim();
    const g = b.zeilen.find((z) => /^G\d/.test(z));
    b.fach = g ? Number(g.slice(1)) : 0;
    b.leer = b.nr === 0;
  }
  if (!bloecke.length || bloecke.some((b) => !b.fach)) throw new Error("Das ist keine Werkzeugtabelle der 508 (GESTOUTI.DAT).");
  return bloecke;
}

// Teile eines belegten Fachs als Paare, damit wir einzelne Werte ändern können
function zerlegen(b) {
  const t = {};
  for (const z of b.zeilen.slice(1)) {
    const k = z.trim().match(/^(G\d+|A-?\d|T|I)/);
    if (!k) continue;
    if (k[1][0] === "G") continue;
    if (k[1] === "T" || k[1] === "I") t[k[1]] = paare(z);
    else t[k[1]] = paare(z.trim().slice(k[1].length));
  }
  return t;
}

// ---------- CSV aus InventorCAM lesen ----------
function csvZeile(z) {
  const aus = []; let feld = ""; let inQ = false;
  for (let i = 0; i < z.length; i++) {
    const c = z[i];
    if (inQ) { if (c === '"' && z[i + 1] === '"') { feld += '"'; i++; } else if (c === '"') inQ = false; else feld += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { aus.push(feld); feld = ""; }
    else feld += c;
  }
  aus.push(feld);
  return aus.map((s) => s.trim());
}

export function csvLesen(text) {
  const zeilen = String(text || "").replace(/\r/g, "").split("\n");
  const kopf = csvZeile(zeilen[0] || "");
  const sp = (n) => kopf.indexOf(n);
  if (sp("Tool") < 0 || sp("Diameter") < 0) throw new Error("Das ist keine Werkzeugliste aus InventorCAM (Spalten Tool und Diameter fehlen).");
  const wz = [];
  for (const z of zeilen.slice(1)) {
    if (!z.trim()) continue;
    if (/^(Shapes|Holders)\b/.test(z)) break;
    const f = csvZeile(z);
    const nr = Math.round(zahl(f[sp("Tool")]));
    if (!(nr > 0)) continue;
    const g = (n) => (sp(n) >= 0 ? f[sp(n)] : "");
    wz.push({
      nr,
      art: g("ToolType").toUpperCase(),
      text: g("Description") || g("ToolName") || g("ToolUserType"),
      d: zahl(g("Diameter")),
      winkel: zahl(g("Angle")),
      eckR: zahl(g("Radius")),
      zaehne: zahl(g("NumTeeth")),
      laenge: zahl(g("HLength")),
      smax: zahl(g("SpinLimit")),
    });
  }
  if (!wz.length) throw new Error("In der CSV steht kein Werkzeug. In InventorCAM vor dem Exportieren alle Werkzeuge markieren.");
  return wz;
}

// Typen, die die App nie überschreibt (Drehstähle 500–599, Taster 900, Etalon 910, Dummy 930, Greifer 940)
const SCHUTZ = (q) => (q >= 500 && q < 600) || q >= 900;

// ---------- Vorschlag je Werkzeug ----------
// Liefert je CAM-Werkzeug eine Zeile, die man in der Ansicht noch ändern kann.
// wahl: { CAM-Nr.: Fach } – seit 1.495.0 wählt man im Pad Mode das
// Magazinfach selbst (Wunsch Patrick 12. November 2026). Ohne Wahl gilt
// wie bisher Fach = CAM-Nr. Die Werkzeugnummer (N, im Programm T…)
// bleibt immer die CAM-Nr., nur das Fach (G) wechselt.
export function vorschlagen(bloecke, wz, wahl = {}) {
  const zeilen = wz.slice().sort((a, b) => a.nr - b.nr).map((w) => {
    const gewaehlt = wahl[w.nr] != null && wahl[w.nr] !== "";
    const fach = gewaehlt ? Number(wahl[w.nr]) : w.nr;
    const b = bloecke.find((x) => x.fach === fach);
    const typ = CAM_TYP[w.art] || null;
    const radius = isFinite(w.d) ? w.d / 2 : NaN;
    const winkel = isFinite(w.winkel) && w.winkel > 0 ? w.winkel : 180;
    const z = { nr: w.nr, fach, cam: w, name: maschinenName(w.text), radius: w.art === "TAP" ? 0 : radius, winkel,
      zaehne: isFinite(w.zaehne) ? w.zaehne : 0, typ, laenge: w.laenge };
    if (!b) return { ...z, aktion: "fehlt", text: "Fach " + fach + " gibt es auf der Maschine nicht (1–" + bloecke.length + ")." };
    const qVon = (x) => Number(wert(zerlegen(x).T || [], "Q"));
    // Dieselbe Werkzeugnummer in einem anderen Fach: dort leeren, sonst
    // stünde die Nummer zweimal in der Tabelle (das Werkzeug kommt raus)
    const anderes = bloecke.find((x) => !x.leer && x.nr === w.nr && x.fach !== fach);
    if (anderes && SCHUTZ(qVon(anderes))) return { ...z, aktion: "belegt", alt: b, text: "Nr. " + w.nr + " ist auf der Maschine „" + anderes.name + "“ in Fach " + anderes.fach + ", das bleibt immer so." };
    if (anderes) z.leeren = { fach: anderes.fach, nr: anderes.nr, name: anderes.name };
    const neuesWz = (extra) => ({ ...z, aktion: "neu", messen: true,
      smax: w.smax > 0 ? w.smax : (w.d > 10 ? 0 : 30000),
      typ: typ || 110, typUnsicher: !typ, ...extra });
    if (!b.leer && b.nr !== w.nr) {
      // Im Pad gewählt: das Werkzeug im Fach kommt heraus (ausser Taster, Greifer …)
      if (gewaehlt && !SCHUTZ(qVon(b))) return neuesWz({ alt: b, ersetzt: { fach, nr: b.nr, name: b.name } });
      return { ...z, aktion: "belegt", alt: b, text: "Fach " + fach + " ist mit „" + b.name + "“ (Nr. " + b.nr + ") belegt, bleibt so." };
    }
    if (b.leer) return neuesWz({});
    const t = zerlegen(b);
    const altR = zahl(wert(t.A1 || [], "R"));
    const altQ = Number(wert(t.T || [], "Q"));
    // Taster, Etalon, Dummy, Greifer und Drehstähle kommen nie aus dem CAM:
    // auch bei gleicher Nummer nicht anfassen
    if (SCHUTZ(altQ)) return { ...z, aktion: "belegt", alt: b, text: "Fach " + fach + " hat „" + b.name + "“ (Typ " + altQ + "), das bleibt immer so." };
    // Radius auf der Maschine ist oft von Hand gemessen (D2 → R0.98):
    // nur ersetzen, wenn der Durchmesser wirklich ein anderer ist
    // Gewindebohrer fahren ohne Radiuskorrektur, dort steht R0 und bleibt so
    const rAnders = w.art !== "TAP" && isFinite(radius) && !(Math.abs(altR - radius) < 0.05);
    const nameAnders = z.name.toUpperCase() !== b.name.toUpperCase();
    return { ...z, aktion: "aendern", alt: b, altR, altQ,
      radius: rAnders ? radius : altR, rAnders,
      smax: w.smax > 0 ? w.smax : Number(wert(t["A-2"] || [], "S")) || 0,
      typ: typ || altQ, typUnsicher: !typ,
      // anderes Werkzeug im selben Fach → neu messen lassen
      messen: rAnders, nameAnders };
  });
  // Zwei Werkzeuge im selben Fach geht nicht
  const zahlFach = {};
  zeilen.forEach((v) => { if (v.aktion === "neu" || v.aktion === "aendern") zahlFach[v.fach] = (zahlFach[v.fach] || 0) + 1; });
  zeilen.forEach((v) => { if (zahlFach[v.fach] > 1) v.doppelt = true; });
  return zeilen;
}

// Für die Grafik des Magazins: steckt im Fach ein Werkzeug, das nie
// angefasst wird (Taster, Etalon, Dummy, Greifer, Drehstahl)?
export const fachGeschuetzt = (b) => !!b && !b.leer && SCHUTZ(fachTyp(b));
// Werkzeugtyp (Q) eines belegten Fachs, für die Liste unter dem Magazin
export const fachTyp = (b) => (!b || b.leer ? 0 : Number(wert(zerlegen(b).T || [], "Q")) || 0);

// Was beim Schreiben wirklich übernommen wird
export const wirdGeschrieben = (v) => v.mit !== false && (v.aktion === "neu" || v.aktion === "aendern");

// ---------- Neue Datei schreiben ----------
function neuerBlock(v) {
  const l = isFinite(v.laenge) && v.laenge > 0 ? v.laenge : 999.9999;
  const k = (x) => "X" + f4(x) + " U0.0000 S0.0000 R" + f4(v.radius || 0);
  return [
    "N" + v.nr + " D1 (" + v.name + ")",
    "G" + v.fach,
    "T1 E6 F1 P0 R0 Q" + v.typ,
    "I9 J3600 K3600",
    "A-2 S" + ganz(v.smax || 0) + " T" + ganz(v.zaehne || 0) + " I" + f4(v.winkel) + " J0.0000 K0.0000 F0 Q0 R0 B0.0",
    "A-3 I0 J0 K0 L0",
    "A-4 I0.0000 J0.0000 K0 L0",
    "A1 " + k(l), "A2 " + k(l), "A3 " + k(l), "A4 " + k(l),
    "A5 X999.9999 U0.0000 S0.0000 R0.0000",
  ];
}

function geaenderterBlock(b, v) {
  const t = zerlegen(b);
  const out = [];
  for (const z of b.zeilen) {
    const s = z.trim();
    if (/^N\d/.test(s)) { out.push("N" + b.nr + " D" + b.duplo + " (" + v.name + ")"); continue; }
    if (/^T/.test(s)) {
      const p = t.T; setzen(p, "Q", ganz(v.typ)); if (v.messen) setzen(p, "E", "6");
      out.push(zeileAus("", p)); continue;
    }
    if (/^A-2\b/.test(s)) {
      const p = t["A-2"]; setzen(p, "S", ganz(v.smax || 0)); setzen(p, "T", ganz(v.zaehne || 0)); setzen(p, "I", f4(v.winkel));
      out.push(zeileAus("A-2", p)); continue;
    }
    const a = s.match(/^A([1-4])\b/);
    if (a && v.rAnders) {
      const p = t["A" + a[1]];
      // nur Korrektoren, die belegt sind (Länge nicht 999.9999)
      if (zahl(wert(p, "X")) < 999) setzen(p, "R", f4(v.radius));
      out.push(zeileAus("A" + a[1], p)); continue;
    }
    out.push(z);
  }
  return out;
}

export function datSchreiben(bloecke, vorschlaege) {
  const aktiv = vorschlaege.filter(wirdGeschrieben);
  const zeilen = ["%"];
  for (const b of bloecke) {
    const v = aktiv.find((x) => x.fach === b.fach);
    const leer = aktiv.some((x) => x.leeren && x.leeren.fach === b.fach);
    if (v && v.aktion === "neu") zeilen.push(...neuerBlock(v));
    else if (v) zeilen.push(...geaenderterBlock(b, v));
    else if (leer) zeilen.push("N0", "G" + b.fach);
    else zeilen.push(...b.zeilen);
  }
  zeilen.push("%");
  return zeilen.join("\r\n") + "\r\n";
}
