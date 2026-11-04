// =================================================================
//  BOHREN UND FRÄSEN MIT ANGETRIEBENEN WERKZEUGEN: Rechnen
//  Seit 1.384.0 (Wunsch Patrick 4. November 2026: „NC-Code-Generator
//  für Bohr- und Fräsbearbeitungen, wir haben Front- und Querbearbei-
//  tungswerkzeuge auf den Maschinen“).
//  Front = Werkzeug in Richtung Z auf die Stirnfläche, Quer = Werkzeug
//  radial in Richtung X auf den Umfang. X ist immer im Durchmesser.
//  Zyklen wie auf der Fanuc der Star: G83/G84/G85 stirnseitig,
//  G87/G88/G89 quer, G80 hebt auf. Der R-Punkt ist der Startpunkt
//  (R0.), damit es nicht darauf ankommt, ob die Maschine R absolut
//  oder schrittweise liest. Q (Zustellung) steht wie bei Fanuc ohne
//  Komma in Mikrometern, P (Verweilen) in Millisekunden.
//  Reine Rechnungen auf den Angaben b, die Felder stehen in
//  BohrenFraesen.jsx.
// =================================================================
import { kopfZeilen, fussZeilen } from "./kopf.jsx";

export const BF_VORGABE = {
  art: "bohrenFront",     // bohrenFront, bohrenQuer, nutFront, nutQuer, flaeche
  zyklus: "tief",         // tief, bohren, gewinde, reiben
  ausgabe: "zyklus",      // zyklus oder einzeln (ausgeschrieben mit G0/G1)
  teilD: 20,              // Durchmesser des Teils
  zStirn: 0,              // Z an der Stirnfläche
  sicher: 1,              // Sicherheitsabstand
  drehzahl: 2500,         // Werkzeugantrieb
  vorschub: 80,           // mm/min
  // Bohren
  bohrD: 4,               // nur für die Zeichnung und Prüfung
  tiefe: 8,               // Bohrtiefe (Quer: radial ab dem Umfang)
  q: 2,                   // Zustellung beim Tieflochbohren
  pause: 0,               // Verweilen am Grund in Sekunden
  steigung: 0.7,          // Gewinde
  lochkreis: 12,          // Front: Lochkreis-Ø, 0 = eine Bohrung in der Mitte
  anzahl: 4,              // Front und Quer: Anzahl über den Umfang
  startC: 0,              // Winkel der ersten Bohrung
  zPos: "5",              // Quer: Z-Lagen, mehrere mit ; getrennt
  // Fräsen
  fraeser: 4,
  zustellung: 0.5,        // je Schnitt in die Tiefe
  vorschubZ: 40,          // Eintauchen
  nutTiefe: 1.5,
  nutLaenge: 30,          // Front: Länge über die Stirn, ≥ Teil-Ø = durchgehend
  nutVon: 0,              // Quer: Nut von Z (0 = offen zur Stirn)
  nutBis: 12,             // Quer: bis Z
  sw: 16,                 // Fläche: Schlüsselweite
  flaechen: 2,            // Anzahl Flächen
  flVon: 0,               // Fläche von Z (0 = offen zur Stirn)
  flBis: 10,              // bis Z
  yAchse: false,          // Fläche: mit Y-Achse in Bahnen
};

export const ARTEN = [
  ["bohrenFront", "Bohren Front"], ["bohrenQuer", "Bohren Quer"],
  ["nutFront", "Nut Front"], ["nutQuer", "Nut Quer"], ["flaeche", "Fläche Quer"],
];
export const ZYKLEN = [
  ["tief", "Tieflochbohren"], ["bohren", "Bohren"], ["gewinde", "Gewinde"], ["reiben", "Reiben"],
];

export const istFront = (art) => art === "bohrenFront" || art === "nutFront";

// Feste Zahl mit Punkt, wie die Steuerung es braucht
const z3 = (n) => (Math.abs(n) < 0.0005 ? 0 : n).toFixed(3);
const wink = (w) => { let x = w % 360; if (x < 0) x += 360; return z3(x); };

// Werkzeugantrieb: Zeile aus dem Feld, {S} wird zur Drehzahl
export const antrieb = { frontEin: "", frontAus: "", querEin: "", querAus: "" };
const einsetzen = (t, b) => (t || "").split(/\r?\n/).filter((x) => x.trim())
  .map((x) => x.replace(/\{S\}/gi, String(Math.round(b.drehzahl))));

// ---------- Lagen ----------

export function zLagen(b) {
  return String(b.zPos || "").split(/[;,\s]+/).map((x) => Number(x.replace(",", ".")))
    .filter((x) => Number.isFinite(x));
}

export function cWinkel(b) {
  const n = Math.max(1, Math.round(b.anzahl) || 1);
  return Array.from({ length: n }, (_, i) => b.startC + (360 * i) / n);
}

// Front: X (Durchmesser) und C je Bohrung
export function frontLoecher(b) {
  if (!(b.lochkreis > 0)) return [{ x: 0, c: 0 }];
  return cWinkel(b).map((c) => ({ x: b.lochkreis, c }));
}

// Quer: Z und C je Bohrung, zuerst alle Winkel einer Z-Lage
export function querLoecher(b) {
  const out = [];
  zLagen(b).forEach((zz) => cWinkel(b).forEach((c) => out.push({ z: zz, c })));
  return out;
}

// Sehne der Fläche: so breit wird sie am Umfang
export const flaecheBreite = (b) => {
  const r = b.teilD / 2, a = b.sw / 2;
  return a >= r ? 0 : 2 * Math.sqrt(r * r - a * a);
};

// ---------- Prüfen ----------

export function bfPruefen(b) {
  const w = [];
  const front = istFront(b.art);
  const ein = front ? antrieb.frontEin : antrieb.querEin;
  if (!ein.trim()) {
    w.push("Für das " + (front ? "Frontwerkzeug" : "Querwerkzeug")
      + " ist noch kein Befehl für den Antrieb eingetragen (unten bei „Werkzeugantrieb“). Bis dahin steht nur ein Hinweis im Programm.");
  }
  if (b.art === "bohrenFront") {
    if (!(b.tiefe > 0)) w.push("Die Bohrtiefe muss grösser als 0 sein.");
    if (b.lochkreis / 2 + b.bohrD / 2 > b.teilD / 2) w.push("Die Bohrungen ragen über den Rand des Teils (Lochkreis + Bohrung grösser als der Teil-Ø).");
  }
  if (b.art === "bohrenQuer") {
    if (!(b.tiefe > 0)) w.push("Die Bohrtiefe muss grösser als 0 sein.");
    if (!zLagen(b).length) w.push("Mindestens eine Z-Lage eintragen, zum Beispiel 5 oder 5; 12.");
  }
  if ((b.art === "bohrenFront" || b.art === "bohrenQuer") && b.zyklus === "tief" && !(b.q > 0)) {
    w.push("Beim Tieflochbohren braucht es eine Zustellung grösser als 0.");
  }
  if ((b.art === "bohrenFront" || b.art === "bohrenQuer") && b.zyklus === "gewinde" && !(b.steigung > 0)) {
    w.push("Für das Gewinde die Steigung eintragen.");
  }
  if (b.art === "nutFront" || b.art === "nutQuer" || b.art === "flaeche") {
    if (!(b.fraeser > 0)) w.push("Den Fräserdurchmesser eintragen.");
    if (!(b.zustellung > 0)) w.push("Die Zustellung je Schnitt muss grösser als 0 sein.");
  }
  if (b.art === "nutFront" && b.nutLaenge < b.teilD && b.nutLaenge < b.fraeser) {
    w.push("Die Nut ist kürzer als der Fräser breit ist.");
  }
  if (b.art === "nutQuer" && b.nutBis - b.nutVon < (b.nutVon > 0 ? b.fraeser : b.fraeser / 2)) {
    w.push("Die Nut ist zu kurz für diesen Fräser.");
  }
  if (b.art === "flaeche") {
    const br = flaecheBreite(b);
    if (br <= 0) w.push("Die Schlüsselweite ist gleich gross oder grösser als der Teil-Ø, da gibt es nichts zu fräsen.");
    else if (!b.yAchse && b.fraeser < br) {
      w.push("Die Fläche wird " + br.toFixed(2) + " mm breit, der Fräser ist nur Ø" + b.fraeser
        + ". Ohne Y-Achse muss er mindestens so gross sein, sonst bleibt ein Steg stehen. Grösseren Fräser nehmen oder „Mit Y-Achse“ wählen.");
    }
    if (b.flVon > 0 && b.flBis - b.flVon < b.fraeser) w.push("Die Fläche ist kürzer als der Fräser breit ist.");
  }
  return w;
}

// ---------- G-Code ----------

export function bfGcode(b) {
  const z = [];
  const front = istFront(b.art);
  const name = (ARTEN.find(([w]) => w === b.art) || [, b.art])[1];
  z.push("( " + name.toUpperCase() + (b.art.startsWith("bohren") ? " - " + (ZYKLEN.find(([w]) => w === b.zyklus) || [, ""])[1].toUpperCase() : "") + " )");
  kopfZeilen().forEach((x) => z.push(x));
  z.push("G98  ( Vorschub in mm/min )");
  const ein = einsetzen(front ? antrieb.frontEin : antrieb.querEin, b);
  if (ein.length) ein.forEach((x) => z.push(x));
  else z.push("( " + (front ? "FRONT" : "QUER") + "WERKZEUG EIN S" + Math.round(b.drehzahl) + " - BEFEHL BEI WERKZEUGANTRIEB EINTRAGEN )");

  if (b.art === "bohrenFront") bohrenFront(b, z);
  else if (b.art === "bohrenQuer") bohrenQuer(b, z);
  else if (b.art === "nutFront") nutFront(b, z);
  else if (b.art === "nutQuer") nutQuer(b, z);
  else flaeche(b, z);

  const aus = einsetzen(front ? antrieb.frontAus : antrieb.querAus, b);
  if (aus.length) aus.forEach((x) => z.push(x));
  else z.push("( " + (front ? "FRONT" : "QUER") + "WERKZEUG AUS )");
  fussZeilen().forEach((x) => z.push(x));
  return z.join("\n");
}

// Zyklus-Zeile: Tiefe, Q, P und F nach Art der Bohrung
function zyklusTeile(b) {
  const q = Math.round(b.q * 1000);
  const p = Math.round((b.pause || 0) * 1000);
  if (b.zyklus === "gewinde") return { f: Math.round(b.drehzahl * b.steigung * 1000) / 1000, q: "", p: p ? "P" + p : "" };
  if (b.zyklus === "tief") return { f: b.vorschub, q: "Q" + q, p: p ? "P" + p : "" };
  return { f: b.vorschub, q: "", p: p ? "P" + p : "" };
}

const G_FRONT = { tief: "G83", bohren: "G83", gewinde: "G84", reiben: "G85" };
const G_QUER = { tief: "G87", bohren: "G87", gewinde: "G88", reiben: "G89" };

function gewindeVor(b, z) {
  if (b.zyklus !== "gewinde") return;
  z.push("( Gewinde M  Steigung " + b.steigung + "  F = S x Steigung )");
  z.push("M29S" + Math.round(b.drehzahl) + "  ( Starres Gewindebohren )");
}

function bohrenFront(b, z) {
  const loecher = frontLoecher(b);
  const zR = b.zStirn + b.sicher;
  const zT = b.zStirn - b.tiefe;
  z.push("( " + loecher.length + " Bohrung" + (loecher.length > 1 ? "en auf Lochkreis D" + b.lochkreis : " in der Mitte") + ", Tiefe " + b.tiefe + " )");
  z.push("G0X" + z3(loecher[0].x) + "C" + wink(loecher[0].c));
  z.push("G0Z" + z3(zR));
  if (b.ausgabe === "einzeln" && b.zyklus !== "gewinde") {
    loecher.forEach((l, i) => {
      if (i) z.push("G0X" + z3(l.x) + "C" + wink(l.c));
      einzelnBohren(b, z, "Z", zR, b.zStirn, zT, -1);
    });
  } else {
    gewindeVor(b, z);
    const t = zyklusTeile(b);
    loecher.forEach((l, i) => {
      if (!i) z.push(G_FRONT[b.zyklus] + "X" + z3(l.x) + "C" + wink(l.c) + "Z" + z3(zT) + "R0." + t.q + t.p + "F" + t.f);
      else z.push("X" + z3(l.x) + "C" + wink(l.c));
    });
    z.push("G80");
  }
  z.push("G0Z" + z3(zR + 5));
}

function bohrenQuer(b, z) {
  const loecher = querLoecher(b);
  if (!loecher.length) { z.push("( KEINE Z-LAGE )"); return; }
  const xR = b.teilD + 2 * b.sicher;
  const xT = b.teilD - 2 * b.tiefe;
  z.push("( " + loecher.length + " Querbohrung" + (loecher.length > 1 ? "en" : "") + ", Tiefe " + b.tiefe + " ab Umfang D" + b.teilD + " )");
  z.push("G0Z" + z3(loecher[0].z) + "C" + wink(loecher[0].c));
  z.push("G0X" + z3(xR));
  if (b.ausgabe === "einzeln" && b.zyklus !== "gewinde") {
    loecher.forEach((l, i) => {
      if (i) z.push("G0Z" + z3(l.z) + "C" + wink(l.c));
      // In X ist alles im Durchmesser, darum doppelte Wege
      einzelnBohren(b, z, "X", xR, b.teilD, xT, -2);
    });
  } else {
    gewindeVor(b, z);
    const t = zyklusTeile(b);
    loecher.forEach((l, i) => {
      if (!i) z.push(G_QUER[b.zyklus] + "Z" + z3(l.z) + "C" + wink(l.c) + "X" + z3(xT) + "R0." + t.q + t.p + "F" + t.f);
      else z.push("Z" + z3(l.z) + "C" + wink(l.c));
    });
    z.push("G80");
  }
  z.push("G0X" + z3(xR + 4));
}

// Ausgeschrieben: Tieflochbohren fährt nach jeder Zustellung ganz
// heraus und im Eilgang bis knapp vor den letzten Grund zurück.
// fak: -1 für Z (nach innen kleiner), -2 für X im Durchmesser.
function einzelnBohren(b, z, ach, startW, oberW, grundW, fak) {
  const tiefe = (grundW - oberW) / fak;
  const pause = b.pause > 0 ? "G4U" + (+b.pause).toFixed(1) : "";
  if (b.zyklus === "tief" && b.q > 0 && b.q < tiefe) {
    let erreicht = 0;
    while (erreicht < tiefe - 1e-6) {
      const neu = Math.min(tiefe, erreicht + b.q);
      if (erreicht > 0) z.push("G0" + ach + z3(oberW + fak * Math.max(0, erreicht - 0.3)));
      z.push("G1" + ach + z3(oberW + fak * neu) + "F" + b.vorschub);
      if (neu >= tiefe - 1e-6 && pause) z.push(pause);
      z.push("G0" + ach + z3(startW));
      erreicht = neu;
    }
    return;
  }
  z.push("G1" + ach + z3(grundW) + "F" + b.vorschub);
  if (pause) z.push(pause);
  // Reiben fährt im Vorschub heraus, damit die Bohrung sauber bleibt
  z.push((b.zyklus === "reiben" ? "G1" : "G0") + ach + z3(startW));
}

// Schnitte in die Tiefe: 0.5, 1.0, 1.5 … bis zur Tiefe
function schnitte(tiefe, zu) {
  const n = Math.max(1, Math.ceil(tiefe / Math.max(0.01, zu) - 1e-9));
  return Array.from({ length: n }, (_, i) => Math.min(tiefe, (i + 1) * zu));
}

function nutFront(b, z) {
  const r = b.fraeser / 2;
  const durch = b.nutLaenge >= b.teilD;
  // Fräsermitte in X (Durchmesser) von + nach −, quer über die Mitte
  const xA = durch ? b.teilD + 2 * (r + b.sicher) : Math.max(0, b.nutLaenge - b.fraeser);
  const zR = b.zStirn + b.sicher;
  z.push("( Nut auf der Stirn bei C" + wink(b.startC) + ", Breite = Fraeser D" + b.fraeser + ", Tiefe " + b.nutTiefe
    + (durch ? ", durchgehend" : ", Laenge " + b.nutLaenge) + " )");
  z.push("G0X" + z3(xA) + "C" + wink(b.startC));
  z.push("G0Z" + z3(zR));
  let hin = true;
  schnitte(b.nutTiefe, b.zustellung).forEach((t) => {
    // Durchgehend taucht er ausserhalb des Teils ein, sonst im Material
    // (Fräser muss über die Mitte schneiden)
    z.push("G1Z" + z3(b.zStirn - t) + "F" + b.vorschubZ);
    z.push("G1X" + z3(hin ? -xA : xA) + "F" + b.vorschub);
    hin = !hin;
  });
  z.push("G0Z" + z3(zR + 5));
}

function nutQuer(b, z) {
  const r = b.fraeser / 2;
  const offen = !(b.nutVon > 0);
  const zA = offen ? b.zStirn + r + b.sicher : b.zStirn - b.nutVon - r;
  const zE = b.zStirn - b.nutBis + r;
  const xR = b.teilD + 2 * b.sicher;
  z.push("( Laengsnut am Umfang bei C" + wink(b.startC) + ", Breite = Fraeser D" + b.fraeser + ", Tiefe " + b.nutTiefe
    + ", Z" + (offen ? " offen" : "-" + b.nutVon) + " bis Z-" + b.nutBis + " )");
  z.push("G0Z" + z3(zA) + "C" + wink(b.startC));
  z.push("G0X" + z3(xR));
  let hin = true;
  schnitte(b.nutTiefe, b.zustellung).forEach((t) => {
    z.push("G1X" + z3(b.teilD - 2 * t) + "F" + b.vorschubZ);
    z.push("G1Z" + z3(hin ? zE : zA) + "F" + b.vorschub);
    hin = !hin;
  });
  z.push("G0X" + z3(xR + 4));
}

function flaeche(b, z) {
  const r = b.fraeser / 2;
  const offen = !(b.flVon > 0);
  const zA = offen ? b.zStirn + r + b.sicher : b.zStirn - b.flVon - r;
  const zE = b.zStirn - b.flBis + r;
  const xR = b.teilD + 2 * b.sicher;
  const tiefe = Math.max(0, (b.teilD - b.sw) / 2);
  const n = Math.max(1, Math.round(b.flaechen) || 1);
  const br = flaecheBreite(b);
  // Bahnen in Y: nur mit Y-Achse, mit 70 % Überdeckung
  let bahnen = [null];
  if (b.yAchse && br > b.fraeser) {
    const rand = br / 2 - r + 0.2;
    const k = Math.max(1, Math.ceil((2 * rand) / (0.7 * b.fraeser)));
    bahnen = Array.from({ length: k + 1 }, (_, i) => -rand + (2 * rand * i) / k);
  }
  z.push("( " + n + " Flaeche" + (n > 1 ? "n" : "") + " SW" + b.sw + " an D" + b.teilD + ", Breite " + br.toFixed(2)
    + ", Z" + (offen ? " offen" : "-" + b.flVon) + " bis Z-" + b.flBis + ", Fraeser D" + b.fraeser + " )");
  for (let i = 0; i < n; i++) {
    const c = b.startC + (360 * i) / n;
    z.push("( Flaeche " + (i + 1) + " bei C" + wink(c) + " )");
    z.push("G0Z" + z3(zA) + "C" + wink(c) + (bahnen[0] !== null ? "Y" + z3(bahnen[0]) : ""));
    z.push("G0X" + z3(xR));
    schnitte(tiefe, b.zustellung).forEach((t) => {
      const x = b.teilD - 2 * t;
      let hin = true;
      bahnen.forEach((y, k) => {
        if (k === 0) z.push("G1X" + z3(x) + "F" + b.vorschubZ);
        else z.push("G1Y" + z3(y) + "F" + b.vorschub);
        z.push("G1Z" + z3(hin ? zE : zA) + "F" + b.vorschub);
        hin = !hin;
      });
      // Zurück an den Anfang für den nächsten Schnitt
      z.push("G0X" + z3(xR));
      if (!hin) z.push("G0Z" + z3(zA));
      if (bahnen[0] !== null && bahnen.length > 1) z.push("G0Y" + z3(bahnen[0]));
    });
    if (bahnen[0] !== null) z.push("G0Y0.");
  }
  z.push("G0X" + z3(xR + 4));
}
