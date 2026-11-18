// =================================================================
//  Z an der Front inkremental mit W (seit 1.623.0)
//  Patrick 18. November 2026: „bei den Frontbearbeitungen fahren wir
//  z.B. auf eine Vorposition in Z von 5.0, dann stellen wir das Werkzeug
//  0.5 mm davor ein. Das heisst, du musst die Z-Zustellung aus den Modulen
//  inkremental programmieren mit Berücksichtigung der 0.5 mm Luft“, dazu
//  „bitte auch bei G12, Gravur etc.“
//  Die Module rechnen weiter mit Z wie bisher (ins Teil grösser), erst
//  hier wird daraus W ab der Vorposition. Das Anfahren in Z fällt weg,
//  das macht der Kopf der Bearbeitung. Wegfahren in Z bleibt (als W),
//  sonst führe z.B. G0X nach dem letzten Schnitt in der Tiefe heraus.
// =================================================================

export const LUFT = 0.5;

const z3 = (n) => (Math.abs(n) < 0.0005 ? 0 : n).toFixed(3);
const NUR_G0Z = /^\s*G0+Z-?\d*\.?\d+\s*$/i;
// Z ausserhalb von Klammern (Kommentare bleiben unberührt)
const teile = (zeile) => zeile.split(/(\([^)]*\))/);
const hatZ = (zeile) => teile(zeile).some((t, i) => i % 2 === 0 && /Z-?\d*\.?\d/i.test(t));
const istEil = (zeile) => /^\s*G0+(?!\d)/i.test(zeile);

// zeilen: Programmteil der Bearbeitung (ohne Vor- und Nachspann),
// zStirn: Z der Stirnfläche, wie das Modul es rechnet
export function zZuW(zeilen, zStirn) {
  const erstVor = zeilen.findIndex((l) => hatZ(l) && !istEil(l));
  const aus = [];
  let jetzt = zStirn - LUFT;
  zeilen.forEach((l, i) => {
    if (NUR_G0Z.test(l) && (erstVor < 0 || i < erstVor)) return;
    if (!hatZ(l)) { aus.push(l); return; }
    aus.push(teile(l).map((t, k) => (k % 2 ? t : t.replace(/Z(-?\d*\.?\d+)/gi, (_, v) => {
      const w = "W" + z3(+v - jetzt); jetzt = +v; return w;
    }))).join(""));
  });
  return aus;
}

// Ersetzt im fertigen Programm die Zeilen von a bis vor b
export function zZuWAb(z, a, b, zStirn) {
  const neu = zZuW(z.slice(a, b), zStirn);
  z.splice(a, b - a, "( Z inkremental ab Vorposition, Werkzeug " + LUFT + " vor der Stirn )", ...neu);
}
