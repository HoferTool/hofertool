// =================================================================
//  ART DER ABWESENHEIT
//  Beim Eintragen in der Ferienzeile wählt man, warum jemand weg ist
//  (1.373.0, Wunsch Patrick 3. November 2026: „Ferien, Kompensieren,
//  Militär/Zivilschutz und Feuerwehr“). Gespeichert in
//  vacations.abwesenheit; alles von vorher und ohne Spalte gilt als
//  Ferien. kurz steht auf dem Balken der Planwand hinter dem Namen,
//  bei Ferien nichts, damit die Tafel aussieht wie bisher.
// =================================================================
export const ABWESENHEITEN = [
  { id: "ferien", name: "Ferien", kurz: "" },
  { id: "kompensieren", name: "Kompensieren", kurz: "Kompensieren" },
  { id: "militaer", name: "Militär/Zivilschutz", kurz: "Militär/ZS" },
  { id: "feuerwehr", name: "Feuerwehr", kurz: "Feuerwehr" },
  // Seit 1.626.0 (Wunsch Patrick 18. November 2026: „abwesend Schule /
  // Militär / Feuerwehr sind 100 % bezahlt“): in HOFERTIME ohne Soll
  { id: "schule", name: "Schule", kurz: "Schule" },
  { id: "krankheit", name: "Krankheit", kurz: "Krank" },
  { id: "unfall", name: "Unfall", kurz: "Unfall" },
];

export function abwesenheit(f) {
  const id = f && f.abwesenheit;
  return ABWESENHEITEN.find((a) => a.id === id) || ABWESENHEITEN[0];
}
