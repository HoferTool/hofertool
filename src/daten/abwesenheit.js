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
];

export function abwesenheit(f) {
  const id = f && f.abwesenheit;
  return ABWESENHEITEN.find((a) => a.id === id) || ABWESENHEITEN[0];
}
