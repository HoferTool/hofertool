// =================================================================
//  Programmteil nicht mehr auf dem Server
//
//  Die App lädt grosse Teile (PDF-Leser, pdf-lib …) erst, wenn sie
//  gebraucht werden. Läuft ein Tab noch mit einer älteren Fassung und
//  wurde inzwischen eine neue ausgeliefert, gibt es dessen Dateien auf
//  GitHub Pages nicht mehr. Der Browser meldet dann „Failed to fetch
//  dynamically imported module“, und das sah bisher aus wie „Keine
//  Verbindung zum Server“ (Patrick 2. November 2026, Kreditorenrechnungen:
//  „0 Rechnungen abgelegt … WLAN prüfen“). Hilft nur Neuladen.
// =================================================================
const MUSTER = /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to load module script|Unable to preload CSS|Setting up fake worker failed/i;

export function istModulFehler(e) {
  if (!e) return false;
  return MUSTER.test(String((e && e.message) || e));
}
