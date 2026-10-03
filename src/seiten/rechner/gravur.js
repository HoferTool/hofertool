// =================================================================
//  GRAVUR: TEXT ALS G-CODE, Rechnen
//  Der Text wird mit der gewählten Schrift auf eine unsichtbare
//  Leinwand gezeichnet, die Umrisse werden daraus abgetastet und in
//  Bahnen umgerechnet. Dadurch lässt sich jede Schrift benutzen,
//  die auf dem Rechner installiert ist.
//
//  Stirnseite  → G12.1, X und C wie X und Y
//  Mantel      → G07.1, Z und C, C im Winkel über den Umfang
// =================================================================
import { kopfZeilen } from "./kopf.jsx";
import { vereinfachen, zugFlaeche, zugVersetzen } from "./geometrie.js";

export const GRAVUR_VORGABE = {
  text: "HOFER",
  schrift: "Arial",
  fett: false,
  kursiv: false,
  hoehe: 4,          // Zeichenhöhe in mm
  laufweite: 0,      // zusätzlicher Abstand je Zeichen
  flaeche: "stirn",  // stirn oder mantel
  dm: 20,            // Durchmesser des Teils
  radius: 8,         // Abstand der Textmitte von der Achse, Stirnseite
  winkel: 0,         // Drehung auf der Stirnseite
  zStart: 0,
  tiefe: 0.2,
  schnitte: 1,
  vorschub: 80,
  eilgang: 1,        // Abhebehöhe zwischen den Zügen
  drehzahl: 6000,
  werkzeug: 0.4,     // Spitzendurchmesser, nur für die Warnung
  glaetten: 0.02,    // Toleranz beim Vereinfachen in mm
  art: "stichel",    // stichel oder fraeser
  ausraeumen: false, // beim Fräser die Buchstaben ganz ausräumen
};

export const GRAVUR_SCHRIFTEN = [
  "Arial", "Arial Black", "Bahnschrift", "Calibri", "Cambria", "Candara",
  "Comic Sans MS", "Consolas", "Constantia", "Corbel", "Courier New",
  "Ebrima", "Franklin Gothic Medium", "Gabriola", "Georgia", "Impact",
  "Ink Free", "Lucida Console", "Lucida Sans Unicode", "Malgun Gothic",
  "Microsoft Sans Serif", "Palatino Linotype", "Segoe Print", "Segoe Script",
  "Segoe UI", "Sitka", "Sylfaen", "Tahoma", "Times New Roman",
  "Trebuchet MS", "Verdana",
];

// ---------- Umrisse aus der Schrift holen ----------

// Zeichnet den Text gross auf eine Leinwand und liest die Umrisse
// mit Marching Squares aus. Zurück kommen Linienzüge in Millimetern.
export function gravurKonturen(gv) {
  const text = (gv.text || "").trim();
  if (!text) return { zuege: [], breite: 0, hoehe: 0 };

  // Gross rendern, damit die Kanten fein genug werden
  const px = 220;                       // Zeichenhöhe auf der Leinwand
  const stil = (gv.kursiv ? "italic " : "") + (gv.fett ? "bold " : "");
  const schriftart = stil + px + 'px "' + gv.schrift + '", sans-serif';

  const mess = document.createElement("canvas").getContext("2d");
  mess.font = schriftart;
  const m = mess.measureText(text);
  const extra = gv.laufweite > 0
    ? (text.length - 1) * (gv.laufweite / gv.hoehe) * px : 0;
  const breitePx = Math.ceil(m.width + extra) + 20;
  const obenPx = Math.ceil(m.actualBoundingBoxAscent || px * 0.8);
  const untenPx = Math.ceil(m.actualBoundingBoxDescent || px * 0.25);
  const hoehePx = obenPx + untenPx + 20;

  const c = document.createElement("canvas");
  c.width = breitePx; c.height = hoehePx;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#000";
  g.font = schriftart;
  g.textBaseline = "alphabetic";

  if (extra > 0) {
    // Buchstabe für Buchstabe, damit die Laufweite wirkt
    let x = 10;
    for (const zeichen of text) {
      g.fillText(zeichen, x, obenPx + 10);
      x += g.measureText(zeichen).width + (gv.laufweite / gv.hoehe) * px;
    }
  } else {
    g.fillText(text, 10, obenPx + 10);
  }

  const bild = g.getImageData(0, 0, c.width, c.height).data;
  const dunkel = (x, y) => {
    if (x < 0 || y < 0 || x >= c.width || y >= c.height) return 0;
    return bild[(y * c.width + x) * 4] < 128 ? 1 : 0;
  };

  // Marching Squares: Kanten zwischen hell und dunkel einsammeln
  const kanten = new Map();
  const schluessel = (x, y) => x + "," + y;
  const merken = (a, b) => {
    const k = schluessel(a[0], a[1]);
    if (!kanten.has(k)) kanten.set(k, []);
    kanten.get(k).push(b);
  };

  for (let y = 0; y < c.height - 1; y++) {
    for (let x = 0; x < c.width - 1; x++) {
      const fall = dunkel(x, y) * 8 + dunkel(x + 1, y) * 4
        + dunkel(x + 1, y + 1) * 2 + dunkel(x, y + 1);
      if (fall === 0 || fall === 15) continue;
      const o = [x + 0.5, y], r = [x + 1, y + 0.5];
      const u = [x + 0.5, y + 1], l = [x, y + 0.5];
      const strich = {
        1: [[l, u]], 2: [[u, r]], 3: [[l, r]], 4: [[r, o]],
        5: [[l, o], [u, r]], 6: [[u, o]], 7: [[l, o]],
        8: [[o, l]], 9: [[o, u]], 10: [[o, r], [u, l]], 11: [[o, r]],
        12: [[r, l]], 13: [[r, u]], 14: [[u, l]],
      }[fall] || [];
      strich.forEach(([a, b]) => merken(a, b));
    }
  }

  // Kanten zu geschlossenen Zügen verketten
  const zuege = [];
  const offen = new Map(kanten);
  while (offen.size) {
    const start = offen.keys().next().value;
    let jetzt = start;
    const zug = [];
    let schutz = 0;
    while (offen.has(jetzt) && schutz++ < 200000) {
      const liste = offen.get(jetzt);
      const naechste = liste.pop();
      if (!liste.length) offen.delete(jetzt);
      zug.push(naechste);
      jetzt = schluessel(naechste[0], naechste[1]);
    }
    if (zug.length > 8) zuege.push(zug);
  }

  // In Millimeter umrechnen und vereinfachen
  const skala = gv.hoehe / px;
  const fein = zuege.map((z) => vereinfachen(
    z.map(([x, y]) => [x * skala, -y * skala]),
    Math.max(0.005, gv.glaetten)));

  // Auf die Mitte legen
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  fein.forEach((z) => z.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }));
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const mittig = fein.map((z) => z.map(([x, y]) => [x - mx, y - my]));

  return { zuege: mittig, breite: maxX - minX, hoehe: maxY - minY };
}

// Dünnste Stelle der Schrift grob schätzen: der kleinste Abstand
// zwischen zwei Punkten desselben Zugs, die nicht benachbart sind.
export function gravurDuennste(zuege) {
  let kleinster = Infinity;
  zuege.forEach((z) => {
    const schritt = Math.max(1, Math.floor(z.length / 60));
    for (let i = 0; i < z.length; i += schritt) {
      for (let k = i + 3; k < z.length; k += schritt) {
        if (Math.abs(i - k) < 4 || Math.abs(i - k) > z.length - 4) continue;
        const d = Math.hypot(z[i][0] - z[k][0], z[i][1] - z[k][1]);
        if (d < kleinster) kleinster = d;
      }
    }
  });
  return kleinster;
}

// roh: Ergebnis von gravurKonturen, damit die Schrift nicht für jede
// Ausgabe neu abgetastet wird
export function gravurGcode(gv, roh) {
  const zuege = gravurBahnen(gv, roh.zuege);
  if (!zuege.length) return "( Kein Text )";

  const z = [];
  const f = gv.vorschub;
  const mantel = gv.flaeche === "mantel";
  const rad = gv.dm / 2;

  z.push("( GRAVUR  " + gv.text + " )");
  z.push("( Schrift " + gv.schrift + (gv.fett ? " fett" : "")
    + (gv.kursiv ? " kursiv" : "") + ", Hoehe " + gv.hoehe + " mm )");
  z.push("( " + zuege.length + " Zuege, "
    + zuege.reduce((a, x) => a + x.length, 0) + " Punkte )");
  kopfZeilen().forEach((x) => z.push(x));
  if (!kopfZeilen().length) {
    z.push("M3S" + Math.round(gv.drehzahl) + "  ( Gravierstichel )");
  }

  // Auf der Stirnseite dreht der Text um die Achse, auf dem Mantel
  // wird die Breite in einen Winkel umgerechnet.
  const w = (gv.winkel * Math.PI) / 180;
  const lage = ([x, y]) => {
    if (!mantel) {
      const px = x * Math.cos(w) - y * Math.sin(w);
      const py = x * Math.sin(w) + y * Math.cos(w) + gv.radius;
      return { a: px, b: py };
    }
    // Mantel: x läuft um den Umfang, y in Z
    return { a: (x / (Math.PI * gv.dm)) * 360, b: y };
  };

  if (mantel) {
    z.push("G0Z" + (gv.zStart + 5).toFixed(3) + "C0.");
    z.push("G0X" + (gv.dm + 2 * gv.eilgang).toFixed(3));
    z.push("G07.1C" + rad.toFixed(3) + "  ( Zylinderinterpolation ein )");
  } else {
    z.push("G0X" + (gv.dm + 4).toFixed(3) + "C0.");
    z.push("G0Z" + (gv.zStart + gv.eilgang).toFixed(3));
    z.push("G12.1  ( Polarinterpolation ein )");
  }

  const schnitte = Math.max(1, Math.round(gv.schnitte));
  for (let s = 1; s <= schnitte; s++) {
    const tiefe = (gv.tiefe / schnitte) * s;
    z.push("( Schnitt " + s + " von " + schnitte + " )");

    zuege.forEach((zug, i) => {
      const erst = lage(zug[0]);
      if (mantel) {
        z.push("G0X" + (gv.dm + 2 * gv.eilgang).toFixed(3));
        z.push("G0C" + erst.a.toFixed(3) + "Z" + (gv.zStart + erst.b).toFixed(3));
        z.push("G1X" + (gv.dm - 2 * tiefe).toFixed(3) + "F" + f);
      } else {
        z.push("G0Z" + (gv.zStart + gv.eilgang).toFixed(3));
        z.push("G0X" + (erst.a * 2).toFixed(3) + "C" + erst.b.toFixed(3));
        z.push("G1Z" + (gv.zStart - tiefe).toFixed(3) + "F" + f);
      }

      zug.slice(1).forEach((p) => {
        const q = lage(p);
        z.push(mantel
          ? "G1C" + q.a.toFixed(3) + "Z" + (gv.zStart + q.b).toFixed(3)
          : "G1X" + (q.a * 2).toFixed(3) + "C" + q.b.toFixed(3));
      });

      // Zug schliessen
      const zurueck = lage(zug[0]);
      z.push(mantel
        ? "G1C" + zurueck.a.toFixed(3) + "Z" + (gv.zStart + zurueck.b).toFixed(3)
        : "G1X" + (zurueck.a * 2).toFixed(3) + "C" + zurueck.b.toFixed(3));
    });
  }

  if (mantel) {
    z.push("G0X" + (gv.dm + 2 * gv.eilgang).toFixed(3));
    // Zylinderinterpolation wird mit G07.1 C0 beendet. G13.1 gehört
    // zur Polarinterpolation und würde hier ins Leere laufen.
    z.push("G07.1C0  ( Zylinderinterpolation aus )");
  } else {
    z.push("G0Z" + (gv.zStart + gv.eilgang + 5).toFixed(3));
    z.push("G13.1  ( Polarinterpolation aus )");
  }
  z.push("M5");
  return z.join("\n");
}

// Aus den Umrissen die tatsächlichen Bahnen machen: beim Stichel
// die Kontur selbst, beim Schaftfräser um den Radius nach innen
// versetzt, auf Wunsch mit weiteren Bahnen zum Ausräumen.
export function gravurBahnen(gv, umrisse) {
  if (gv.art !== "fraeser" || !umrisse.length) return umrisse;
  const r = gv.werkzeug / 2;
  if (r < 1e-6) return umrisse;

  const bahnen = [];
  umrisse.forEach((zug) => {
    const erste = zugVersetzen(zug, r);
    if (erste.length > 2) bahnen.push(erste);

    if (gv.ausraeumen) {
      let jetzt = erste;
      const schritt = Math.max(0.05, gv.werkzeug * 0.6);
      for (let i = 0; i < 40; i++) {
        const naechste = zugVersetzen(jetzt, schritt);
        // Wird die Fläche zu klein oder kippt das Vorzeichen, ist
        // die Mitte erreicht und es geht nicht weiter hinein.
        const f = Math.abs(zugFlaeche(naechste));
        if (!naechste.length || f < gv.werkzeug * gv.werkzeug) break;
        if (Math.sign(zugFlaeche(naechste)) !== Math.sign(zugFlaeche(jetzt))) break;
        bahnen.push(naechste);
        jetzt = naechste;
      }
    }
  });
  return bahnen;
}
