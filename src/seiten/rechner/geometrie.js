// =================================================================
//  GEOMETRIE FÜR GRAVUR UND DXF
//  Linienzüge vereinfachen, ihre Drehrichtung bestimmen und sie für
//  einen Fräser nach innen versetzen. Reine Rechnungen.
// =================================================================

// Douglas-Peucker: entfernt Punkte, die kaum von der Linie abweichen
export function vereinfachen(punkte, toleranz) {
  if (punkte.length < 3) return punkte;
  const abstand = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = dx * dx + dy * dy;
    if (!l) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const lauf = (von, bis) => {
    let weit = 0, wo = von;
    for (let i = von + 1; i < bis; i++) {
      const d = abstand(punkte[i], punkte[von], punkte[bis]);
      if (d > weit) { weit = d; wo = i; }
    }
    if (weit > toleranz) {
      return lauf(von, wo).slice(0, -1).concat(lauf(wo, bis));
    }
    return [punkte[von], punkte[bis]];
  };
  return lauf(0, punkte.length - 1);
}

// Fläche mit Vorzeichen: sagt, ob ein Zug gegen oder im Uhrzeigersinn
// läuft. Daran erkennt man Aussenkontur und Loch — etwa im O.
export function zugFlaeche(zug) {
  let a = 0;
  for (let i = 0; i < zug.length; i++) {
    const [x1, y1] = zug[i], [x2, y2] = zug[(i + 1) % zug.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

// Versetzt einen geschlossenen Zug um abstand nach innen. Die Kanten
// werden parallel verschoben und an den Ecken geschnitten.
export function zugVersetzen(zug, abstand) {
  const n = zug.length;
  if (n < 3 || Math.abs(abstand) < 1e-6) return zug;
  const innen = zugFlaeche(zug) > 0 ? 1 : -1;
  const raus = [];

  for (let i = 0; i < n; i++) {
    const p0 = zug[(i - 1 + n) % n], p1 = zug[i], p2 = zug[(i + 1) % n];

    const kante = (a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const nx = (dy / l) * innen * -1, ny = (-dx / l) * innen * -1;
      return { a: [a[0] + nx * abstand, a[1] + ny * abstand],
               b: [b[0] + nx * abstand, b[1] + ny * abstand] };
    };

    const e1 = kante(p0, p1), e2 = kante(p1, p2);
    const d1 = [e1.b[0] - e1.a[0], e1.b[1] - e1.a[1]];
    const d2 = [e2.b[0] - e2.a[0], e2.b[1] - e2.a[1]];
    const nenner = d1[0] * d2[1] - d1[1] * d2[0];

    if (Math.abs(nenner) < 1e-9) { raus.push(e1.b); continue; }
    const t = ((e2.a[0] - e1.a[0]) * d2[1] - (e2.a[1] - e1.a[1]) * d2[0]) / nenner;
    const punkt = [e1.a[0] + d1[0] * t, e1.a[1] + d1[1] * t];

    // Spitze Ecken nicht ins Unendliche laufen lassen
    const weit = Math.hypot(punkt[0] - p1[0], punkt[1] - p1[1]);
    const grenze = Math.abs(abstand) * 2.5;
    raus.push(weit > grenze ? e1.b : punkt);
  }
  return raus;
}
