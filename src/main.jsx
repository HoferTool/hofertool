// Einstieg der App. Lädt die Gestaltung und das Programm.
//
// Das bisherige Programm aus der einen grossen index.html liegt in
// src/alt/ und läuft dort unverändert weiter. Bereiche, die schon
// in React neu gebaut sind, liegen in src/seiten/ und werden über
// src/bruecke.jsx in die alte Hülle eingehängt.
import "./alt/stil.css";
import "./alt/app.js";
// Mehr Bewegung: gleitende Markierungen, Licht, Welle, Seitenwechsel
import "./effekte/effekte.css";
import "./effekte/effekte.js";

// Unter .../vorschau/ läuft die Fassung aus dem Umbau, mit echten
// Daten. Ein Schild oben links, damit niemand sie mit der Live-App
// verwechselt.
if (/\/vorschau\//.test(location.pathname)) {
  const schild = document.createElement("div");
  schild.className = "vorschau-schild";
  schild.textContent = "Vorschau";
  document.body.appendChild(schild);
}
