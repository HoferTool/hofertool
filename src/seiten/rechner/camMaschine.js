// =================================================================
//  HOFERCAM: Maschine in der 3D-Simulation (seit 1.580.0)
//  Wunsch Patrick 16. November 2026: „dass bei der 3D-Simulation die
//  Maschine mitfährt … die Spanneinheit hinter den Werkzeugen von Kanal 1
//  soll mit dem Material mitfahren … T100–T600, T1100–T1400, T3100–T3400,
//  T3421–T3423 sind alle starr auf dem Werkzeugträger von Kanal 1 montiert,
//  sie machen alle Bewegungen in X und Y mit“.
//  Masse aus dem Star-Handbuch, Kapitel 8-4 Koordinatensystem (Bilder von
//  Patrick, 16. November 2026): 6-fach Stahlhalter 12 mm [0M103] je 25 mm,
//  4-Spindel-Querbohrapparat ER11/16 [0M152] mit Abstand B 36.5 nach T600 und
//  je 31 mm, Bohreinheit 11–14 [0M112] bei A = 297.5 ab T100, je 25 mm in X;
//  in Z (Ansicht C-C) Querwerkzeuge 9 mm vor der Führungsbüchse, Bohreinheit
//  75 mm weiter, 50 breit. Geschätzt: T3421–T3423 an der Stelle von T3400,
//  Spitzen der Frontwerkzeuge 30 mm vor der Bohreinheit. Alle Masse in mm.
//
//  Lage je Platz = Spitze des Werkzeugs, wenn der Träger in seiner Null
//  steht: dz längs zum Teil (+ = zur Führungsbüchse hin), x = +X der
//  Maschine (oben), y = +Y (zur Beschriftung Y1 hin, also Richtung T600).
//  dz 0 ist die Ebene der Drehwerkzeuge, die Führungsbüchse beginnt 2 mm
//  dahinter.
// =================================================================

export const MASCHINE_SB20RG = {
  dreh: { teilung: 25 },              // T100 … T600 je 25 mm in Y
  quer: { y0: 161.5, teilung: 31, dz: -7 }, // T3100 … T3400, Achse 9 mm vor der Büchse
  front: { dz: -52, teilungX: 25, block: 50, schaft: 30 }, // Bohreinheit 75 mm vor den Querwerkzeugen
  t342y: 254.5,                        // T3421 … T3423 an der Stelle von T3400
  t1100y: 297.5,                       // T1100 … T1400: Bohreinheit 11–14
  kopf: { abstand: 20, r: 38, L: 110, nase: 22, naseL: 22 }, // Spindelstock hinter der Büchse
};

// Platz → Lage der Spitze am Träger und Art des Werkzeugs
export function platzLage(platz, m = MASCHINE_SB20RG) {
  const t = Number(platz) || 0;
  if (t >= 100 && t <= 600 && t % 100 === 0) return { art: "dreh", dz: 0, x: 0, y: (t / 100 - 1) * m.dreh.teilung };
  if (t >= 3100 && t <= 3400 && t % 100 === 0) return { art: "quer", dz: m.quer.dz, x: 0, y: m.quer.y0 + (t / 100 - 31) * m.quer.teilung };
  if (t >= 3421 && t <= 3423) return { art: "front", dz: m.front.dz, x: -(t - 3421) * m.front.teilungX, y: m.t342y };
  if (t >= 1100 && t <= 1400 && t % 100 === 0) return { art: "front", dz: m.front.dz, x: -(t / 100 - 11) * m.front.teilungX, y: m.t1100y };
  return null;
}

export const TRAEGER_PLAETZE = [100, 200, 300, 400, 500, 600, 3100, 3200, 3300, 3400, 3421, 3422, 3423, 1100, 1200, 1300, 1400];

// Quader des Trägers, verschoben um o = Lage der Null des Trägers
// {z, x, y}. Rückgabe: [{z0, z1, x0, x1, y0, y1, art}] in Teil-Z und Maschinen-X/Y.
// aktiv = Platz, der gerade arbeitet: seine Schneide zeichnet die Simulation selbst
export function traegerQuader(o, aktiv, m = MASCHINE_SB20RG) {
  const q = [];
  const box = (z0, z1, x0, x1, y0, y1, art) => q.push({ z0: o.z + z0, z1: o.z + z1, x0: o.x + x0, x1: o.x + x1, y0: o.y + y0, y1: o.y + y1, art });
  for (let k = 0; k < 6; k++) {
    const y = k * m.dreh.teilung, t = (k + 1) * 100;
    box(-24, 0, 14, 80, y - 5, y + 5, "platte");         // Halteplatte
    box(-12, 0, 1.6, 40, y - 6, y + 6, "halter");        // Schaft 12 × 12 (Patrick)
    if (t !== aktiv) box(-3, 0, 0, 1.6, y - 3, y + 1, "schneide");
  }
  // Querangetrieben: Gehäuse oben, Werkzeug senkrecht nach unten
  for (let k = 0; k < 4; k++) {
    const y = m.quer.y0 + k * m.quer.teilung, t = 3100 + k * 100, dz = m.quer.dz;
    box(dz - 8, dz + 8, 24, 70, y - 9, y + 9, "gehaeuse");
    if (t !== aktiv) box(dz - 2.5, dz + 2.5, 0, 24, y - 2.5, y + 2.5, "werkzeug");
  }
  // Block mit den Frontwerkzeugen: Spitzen bei dz, Schäfte nach vorne weg
  const dz = m.front.dz, sch = m.front.schaft, xu = -3 * m.front.teilungX - 14;
  box(dz - sch - m.front.block, dz - sch, xu, 16, m.t342y - 14, m.t1100y + 16, "gehaeuse");
  for (let k = 0; k < 7; k++) {
    const t = k < 3 ? 3421 + k : 1100 + (k - 3) * 100;
    if (t === aktiv) continue;
    const l = platzLage(t, m);
    box(dz - sch, dz, l.x - 3, l.x + 3, l.y - 3, l.y + 3, "werkzeug");
  }
  return q;
}
