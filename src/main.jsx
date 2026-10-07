// Einstieg der App. Lädt die Gestaltung und das Programm.
//
// Das bisherige Programm aus der einen grossen index.html liegt in
// src/alt/ und läuft dort unverändert weiter. Bereiche, die schon
// in React neu gebaut sind, liegen in src/seiten/ und werden über
// src/bruecke.jsx in die alte Hülle eingehängt.
import "./alt/stil.css";
import "./alt/app.js";
// Profilbilder grau, sehr helle mässig umgekehrt
import "./teile/profilbilder.js";
// Mehr Bewegung: gleitende Markierungen, Licht, Welle, Seitenwechsel
import "./effekte/effekte.css";
import "./effekte/effekte.js";
