// =================================================================
//  EINLAGEN GEN (created by Ecker)
//  Werkzeug-Konturscanner: Werkzeuge auf A4 fotografieren, Kontur
//  erkennen und korrigieren, daraus eine Einlage mit Taschen bauen und
//  als SVG oder STL für den 3D-Drucker speichern (Wunsch Patrick
//  30. Oktober 2026: „baue das als weiteren Reiter ein“).
//
//  Das Werkzeug ist eine eigene, fertige Seite (public/einlagen/) und
//  läuft hier unverändert in einem Rahmen. So bleibt es genau, wie Ecker
//  es gebaut und geprüft hat, und Fenster, Meldungen und Kamera darin
//  bleiben im Rahmen. Einstellungen und Einlage merkt es sich selbst im
//  Browser. Nicht für Externe.
// =================================================================
import { useEffect, useRef } from "react";
import { alt } from "../bruecke.jsx";

// Bedienung im Rahmen sieht die App nicht von selbst; ohne Weitergabe
// würde sie nach 5 Minuten mitten in der Arbeit abmelden
const BEDIENUNG = ["pointerdown", "keydown", "wheel", "touchstart", "input"];

export default function Einlagen() {
  const rahmen = useRef(null);

  // Der Rahmen reicht bis an den unteren Rand des Bildschirms; das
  // Werkzeug rollt in sich, weil es seine Fläche nach der Fensterhöhe misst
  useEffect(() => {
    const r = rahmen.current;
    const anpassen = () => {
      const oben = r.getBoundingClientRect().top + window.scrollY;
      const unten = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--navhoehe")) || 0;
      const handy = document.body.classList.contains("mobil") || window.innerWidth <= 640;
      r.style.height = Math.max(420, window.innerHeight - oben - (handy ? unten : 0) - 8) + "px";
    };
    anpassen();
    window.addEventListener("resize", anpassen);
    return () => window.removeEventListener("resize", anpassen);
  }, []);

  function geladen() {
    let doc;
    try { doc = rahmen.current.contentDocument; } catch { return; }
    if (!doc) return;
    const aktiv = () => { if (alt.leerlaufAktiv) alt.leerlaufAktiv(); };
    BEDIENUNG.forEach((art) => doc.addEventListener(art, aktiv, { capture: true, passive: true }));
  }

  return (
    <iframe ref={rahmen} className="einlagen-rahmen" title="Einlagen Gen"
      src={import.meta.env.BASE_URL + "einlagen/index.html"} onLoad={geladen}
      allow="camera" />
  );
}
