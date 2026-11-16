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
  front: { dz: -45, teilungX: 25, block: 50, schaft: 30 }, // Bohreinheit 75 bis 125 mm vor der Drehebene (Handbuch 4-Spindel-Bohreinheit)
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
// t34 = "3400": T3400 querangetrieben montiert, sonst die Einheit T3421–T3423
// ab: Abstecher T100 (seit 1.584.2, Patrick 16. November 2026: „die Platte
// muss mindestens 1 mm mehr als die Hälfte vom Rohmaterialdurchmesser aus
// dem Halter vorstehen“), {vor: Vorstand = A/2 + 1, b: Breite B aus G266}
export function traegerQuader(o, aktiv, m = MASCHINE_SB20RG, t34 = "3421", ab = null) {
  const q = [];
  const box = (z0, z1, x0, x1, y0, y1, art) => q.push({ z0: o.z + z0, z1: o.z + z1, x0: o.x + x0, x1: o.x + x1, y0: o.y + y0, y1: o.y + y1, art });
  // Seit 1.584.1 (Patrick 16. November 2026): die Schäfte 12 × 12 stecken
  // in Y zwischen den blauen Halteplatten (7 Platten je zwischen zwei
  // Plätzen), die Schneidplatte steht in X zur Hälfte aus dem Schaft
  const pl = 6;                                           // Schneidplatte in X, zur Hälfte im Schaft
  for (let k = 0; k <= 6; k++) {
    const y = (k - 0.5) * m.dreh.teilung;
    box(-12, 0, 12, 80, y - 6.4, y + 6.4, "platte");      // Halteplatte zwischen den Schäften, 12 mm in Z wie der Schaft, Schäfte ragen unten heraus
  }
  for (let k = 0; k < 6; k++) {
    const y = k * m.dreh.teilung, t = (k + 1) * 100;
    if (k === 0 && ab) {
      // Abstecher: Platte steht A/2 + 1 aus dem Halter, Breite B, 3 mm im Halter
      box(-12, 0, ab.vor, ab.vor + 40, y - 6, y + 6, "halter");
      if (t !== aktiv) box(-ab.b, 0, 0, ab.vor + 3, y - 3, y + 3, "schneide");
      continue;
    }
    box(-12, 0, pl / 2, 40, y - 6, y + 6, "halter");      // Schaft 12 × 12 (Patrick)
    if (t !== aktiv) box(-5, 0, 0, pl, y - 3, y + 3, "schneide");
  }
  // Querangetrieben: nur das Gehäuse; Werkzeuge ausser T100–T600 zeichnet
  // die Simulation nur, wenn sie arbeiten (Patrick 16. November 2026)
  const nQuer = t34 === "3400" ? 4 : 3;
  for (let k = 0; k < nQuer; k++) {
    const y = m.quer.y0 + k * m.quer.teilung, dz = m.quer.dz;
    box(dz - 8, dz + 8, 24, 70, y - 9, y + 9, "gehaeuse");
  }
  // Bohreinheit der Frontwerkzeuge, Spitzen bei dz
  const dz = m.front.dz, sch = m.front.schaft, xu = -3 * m.front.teilungX - 14;
  if (t34 !== "3400") box(dz - sch - m.front.block, dz - sch, xu, 16, m.t342y - 12, m.t342y + 12, "gehaeuse");
  box(dz - sch - m.front.block, dz - sch, xu, 16, m.t1100y - 16, m.t1100y + 16, "gehaeuse");
  return q;
}

// =================================================================
//  Gegenspindel (seit 1.583.0, Wunsch Patrick 16. November 2026: „mach
//  jetzt noch die Gegenspindel für die Simulation“). Masse aus dem
//  Star-Handbuch: 4-Spindel-Rückseiteneinheit T2100–T2400 mit Abstand der
//  Achsen 36, 33, 33 (ab T2100), Werkzeuge ohne Schäfte (Patrick: die Lage
//  gibt die Regel 0.5 mm vor dem Teil), Gehäuse 30 mm hinter der Spitze.
//  Die Gegenspindel fährt mit dem Teil in Z2 und X2, die Werkzeuge stehen.
// =================================================================
export const GEGEN_SB20RG = {
  spindel: { nase: 16, naseL: 20, r: 42, L: 110 },
  hinten: { achsen: [0, 36, 69, 102], abstand: 30, tiefe: 37, breite: 44 }, // T2100 … T2400
  front: { achsen: [0, 25, 50, 75], abstand: 30, tiefe: 50, breite: 32 },  // T1100 … T1400 zur Gegenspindel
  quer: { achsen: [0, 25, 50], abstand: 30, tiefe: 50, breite: 28 },       // T3421 … T3423 zur Gegenspindel
};

// Einheit, an der das Werkzeug eines Schritts in Kanal 2 sitzt
export function gegenEinheit(art, platz, g = GEGEN_SB20RG) {
  const t = Number(platz) || 0;
  let e, k;
  if (art === "k2" || art === "k2a") { e = g.hinten; k = Math.floor(t / 100) - 21; }
  else if (art === "front") { e = g.front; k = Math.floor(t / 100) - 11; }
  else if (art === "quer") { e = g.quer; k = t - 3421; }
  else return null;
  return { ...e, k: Math.max(0, Math.min(e.achsen.length - 1, k || 0)) };
}

// Gehäuse der Einheit: Spitze des aktiven Werkzeugs bei z (Werkzeug zeigt
// nach +z ins Teil), Achse bei x / y; die anderen Achsen weiter nach +x
export function gegenQuader(o, e) {
  if (!e) return [];
  const a0 = e.achsen[0] - e.achsen[e.k], a1 = e.achsen[e.achsen.length - 1] - e.achsen[e.k];
  return [{ z0: o.z - e.abstand - e.tiefe, z1: o.z - e.abstand, x0: o.x + a0 - 16, x1: o.x + a1 + 18,
    y0: o.y - e.breite / 2, y1: o.y + e.breite / 2, art: "gehaeuse" }];
}
