// =================================================================
//  DXF: KONTUR WÄHLEN UND MIT G12.1 FRÄSEN, Rechnen
//  Gelesen wird DXF im Textformat — Linien, Bögen, Kreise und
//  Polylinien. Die Elemente werden zu geschlossenen Konturen
//  verkettet, eine davon wird gewählt, und daraus entsteht die
//  Bahn der Fräsermitte samt G-Code.
// =================================================================
import { kopfZeilen, fussZeilen } from "./kopf.jsx";
import { vereinfachen, zugFlaeche, zugVersetzen } from "./geometrie.js";

export const DXF_VORGABE = {
  seite: "aussen",   // aussen oder innen
  fraeser: 3,
  tiefeZ: 2,
  zustellung: 1,
  vorschub: 60,
  drehzahl: 3000,
  zStart: 0,
  sicher: 1,
  glaetten: 0.01,
  massstab: 100,     // Grösse in Prozent
};

// ---------- Einlesen ----------

// glaetten: Toleranz beim Vereinfachen in mm. Sie wirkt beim Einlesen.
export function dxfLesen(inhalt, glaetten) {
  const zeilen = inhalt.split(/\r\n|\r|\n/);
  const paare = [];
  for (let i = 0; i + 1 < zeilen.length; i += 2) {
    paare.push([Number(zeilen[i].trim()), zeilen[i + 1].trim()]);
  }

  const teile = [];
  let jetzt = null;
  let inEntities = false;

  const ablegen = () => { if (jetzt) teile.push(jetzt); jetzt = null; };

  for (let i = 0; i < paare.length; i++) {
    const [code, wert] = paare[i];

    if (code === 2 && wert === "ENTITIES") { inEntities = true; continue; }
    if (code === 0 && wert === "ENDSEC" && inEntities) { ablegen(); inEntities = false; }
    if (!inEntities) continue;

    if (code === 0) {
      ablegen();
      if (["LINE", "ARC", "CIRCLE", "LWPOLYLINE", "POLYLINE", "VERTEX", "SEQEND"]
          .indexOf(wert) !== -1) {
        jetzt = { art: wert, werte: {}, ecken: [] };
      }
      continue;
    }
    if (!jetzt) continue;

    // Polylinien liefern mehrere Punkte mit denselben Codes
    if (jetzt.art === "LWPOLYLINE" && code === 10) {
      jetzt.ecken.push([Number(wert), 0]);
      continue;
    }
    if (jetzt.art === "LWPOLYLINE" && code === 20 && jetzt.ecken.length) {
      jetzt.ecken[jetzt.ecken.length - 1][1] = Number(wert);
      continue;
    }
    jetzt.werte[code] = wert;
  }
  ablegen();

  // VERTEX-Punkte zur vorangehenden POLYLINE schlagen
  const sauber = [];
  teile.forEach((t) => {
    if (t.art === "VERTEX") {
      const letzte = sauber[sauber.length - 1];
      if (letzte && letzte.art === "POLYLINE") {
        letzte.ecken.push([Number(t.werte[10] || 0), Number(t.werte[20] || 0)]);
      }
      return;
    }
    if (t.art === "SEQEND") return;
    sauber.push(t);
  });

  // In Linienzüge umrechnen
  const stuecke = [];
  const bogen = (cx, cy, r, a1, a2, gegen) => {
    const punkte = [];
    let spanne = a2 - a1;
    while (spanne <= 0) spanne += 360;
    const n = Math.max(6, Math.ceil(spanne / 4));
    for (let i = 0; i <= n; i++) {
      const w = ((a1 + (spanne * i) / n) * Math.PI) / 180;
      punkte.push([cx + r * Math.cos(w), cy + r * Math.sin(w)]);
    }
    return punkte;
  };

  sauber.forEach((t) => {
    const z = (c) => Number(t.werte[c] || 0);
    if (t.art === "LINE") {
      stuecke.push({ punkte: [[z(10), z(20)], [z(11), z(21)]], geschlossen: false });
    } else if (t.art === "CIRCLE") {
      stuecke.push({ punkte: bogen(z(10), z(20), z(40), 0, 360), geschlossen: true });
    } else if (t.art === "ARC") {
      stuecke.push({ punkte: bogen(z(10), z(20), z(40), z(50), z(51)),
                     geschlossen: false });
    } else if (t.art === "LWPOLYLINE" || t.art === "POLYLINE") {
      const zu = (Number(t.werte[70] || 0) & 1) === 1;
      if (t.ecken.length > 1) {
        stuecke.push({ punkte: t.ecken.slice(), geschlossen: zu });
      }
    }
  });

  return verketten(stuecke, glaetten);
}

// Offene Stücke aneinanderhängen, bis eine Kontur geschlossen ist
function verketten(stuecke, glaetten) {
  const toleranz = 0.02;
  const nah = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < toleranz;

  const fertig = stuecke.filter((s) => s.geschlossen)
    .map((s) => ({ punkte: s.punkte, geschlossen: true }));
  const offen = stuecke.filter((s) => !s.geschlossen).map((s) => s.punkte.slice());

  while (offen.length) {
    let kette = offen.shift();
    let gefunden = true;
    while (gefunden) {
      gefunden = false;
      for (let i = 0; i < offen.length; i++) {
        const k = offen[i];
        const ende = kette[kette.length - 1], anfang = kette[0];
        if (nah(ende, k[0])) { kette = kette.concat(k.slice(1)); }
        else if (nah(ende, k[k.length - 1])) {
          kette = kette.concat(k.slice().reverse().slice(1));
        } else if (nah(anfang, k[k.length - 1])) {
          kette = k.slice(0, -1).concat(kette);
        } else if (nah(anfang, k[0])) {
          kette = k.slice().reverse().slice(0, -1).concat(kette);
        } else continue;
        offen.splice(i, 1);
        gefunden = true;
        break;
      }
    }
    fertig.push({ punkte: kette,
                  geschlossen: nah(kette[0], kette[kette.length - 1]) });
  }

  return fertig
    .map((k) => {
      let punkte = vereinfachen(k.punkte, glaetten);
      // Bei einer geschlossenen Kontur steht der Anfangspunkt am Ende
      // noch einmal. Bleibt er drin, knickt der Versatz an der Naht ab.
      if (k.geschlossen && punkte.length > 2
          && nah(punkte[0], punkte[punkte.length - 1])) {
        punkte = punkte.slice(0, -1);
      }
      return { punkte: punkte, geschlossen: k.geschlossen };
    })
    .filter((k) => k.punkte.length > 2)
    .sort((a, b) => Math.abs(zugFlaeche(b.punkte)) - Math.abs(zugFlaeche(a.punkte)));
}

// Die Konturen im gewählten Massstab. Die Werte aus der Datei
// bleiben unangetastet, damit mehrfaches Ändern nicht aufsummiert.
export function dxfSkalieren(roh, massstab) {
  const k = massstab / 100;
  return (roh || []).map((z) => ({
    punkte: z.punkte.map(([x, y]) => [x * k, y * k]),
    geschlossen: z.geschlossen,
  }));
}

// Grösse der gewählten Kontur (nr), sonst der ganzen Zeichnung
export function dxfMasse(konturen, nr) {
  const liste = (nr !== undefined && konturen[nr]) ? [konturen[nr]] : konturen;
  if (!liste.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  liste.forEach((k) => k.punkte.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }));
  return { breite: maxX - minX, hoehe: maxY - minY, minX, maxX, minY, maxY };
}

// ---------- Bahn und G-Code ----------

export function dxfBahn(d, kontur) {
  if (!kontur) return null;
  const r = d.fraeser / 2;
  // zugVersetzen versetzt nach innen; für aussen dreht das Vorzeichen
  return zugVersetzen(kontur.punkte, d.seite === "innen" ? r : -r);
}

export function dxfGcode(d, name, bahn) {
  if (!bahn) return "( Keine Kontur gewählt )";

  const z = [];
  const f = d.vorschub;
  const weit = Math.max(...bahn.map((p) => Math.hypot(p[0], p[1]))) + d.sicher;

  z.push("( DXF " + (name || "Kontur") + " )");
  z.push("( " + (d.seite === "innen" ? "innen" : "aussen") + ", Fraeser D" + d.fraeser.toFixed(2) + ", Bahn = Fraesermitte )");
  kopfZeilen().forEach((x) => z.push(x));
  if (!kopfZeilen().length) z.push("M3S" + Math.round(d.drehzahl));
  z.push("G0X" + (weit * 2).toFixed(3) + "C0.");
  z.push("G0Z" + (d.zStart + d.sicher).toFixed(3));
  z.push("G12.1  ( Polarinterpolation ein )");

  const schnitte = Math.max(1, Math.ceil(d.tiefeZ / Math.max(0.1, d.zustellung)));
  for (let s = 1; s <= schnitte; s++) {
    const tiefe = Math.min(d.tiefeZ, s * d.zustellung);
    z.push("( Schnitt " + s + " von " + schnitte + " )");
    z.push("G0X" + (bahn[0][0] * 2).toFixed(3) + "C" + bahn[0][1].toFixed(3));
    z.push("G1Z" + (d.zStart - tiefe).toFixed(3) + "F" + f);
    bahn.slice(1).forEach((p) => z.push("G1X" + (p[0] * 2).toFixed(3) + "C" + p[1].toFixed(3)));
    z.push("G1X" + (bahn[0][0] * 2).toFixed(3) + "C" + bahn[0][1].toFixed(3));
    z.push("G0Z" + (d.zStart + d.sicher).toFixed(3));
  }

  z.push("G13.1  ( Polarinterpolation aus )");
  z.push("G0X" + (weit * 2).toFixed(3));
  fussZeilen().forEach((x) => z.push(x));
  if (!fussZeilen().length) z.push("M5");
  return z.join("\n");
}
