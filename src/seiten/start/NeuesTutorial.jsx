// =================================================================
//  NEUES TUTORIAL (seit 1.600.0, Wunsch Patrick 17. November 2026:
//  „zeig im Startfenster an, dass es ein neues Tutorial gibt, fordere
//  auf, es anzuschauen, mit dem Kopf von Pablo“)
//
//  Karte auf der Startseite für alle, die HOFERCAM sehen (ohne
//  Externe), bis die Person das Video geöffnet oder „Nicht mehr
//  zeigen“ gewählt hat (Vermerk hofercam_tutorial_gesehen am Konto).
//  Der Kopf ist das Mahnbild „stueckzahl“ aus app_config.pad_mahnbilder,
//  wie in „Heute noch offen“, nie im Repository. Das Video liegt in
//  public/hilfe/, ausserhalb des Offline-Vorrats.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { mahnBilder } from "../../daten/mahnbilder.js";

const GESEHEN = "hofercam_tutorial_gesehen";
const VIDEO = "hilfe/hofercam-tutorial.mp4";

export function hofercamTutorialOeffnen() {
  fensterOeffnen((zu) => (
    <div className="dialog kt-tutorial" id="hc-tutorial">
      <div className="kt-tutorial__kopf"><h2>HOFERCAM: ein ganzes Teil Schritt für Schritt</h2></div>
      <video src={VIDEO} controls playsInline className="kt-tutorial__video"
        ref={(v) => { if (v && !v.dataset.los) { v.dataset.los = "1"; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); } }} />
      <div className="kt-tutorial__fuss">
        <button className="knopf knopf--haupt" id="hc-tutorial-zu" onClick={zu}>Schliessen</button>
      </div>
    </div>
  ), null, "kt-tutorial-huelle");
}

export default function NeuesTutorial() {
  const zeigen = alt.camSehen && alt.camSehen() && alt.meineRolle() !== "dienst";
  const [gesehen, setGesehen] = useState(() => (alt.einstellungWert ? alt.einstellungWert(GESEHEN, "") === "1" : false));
  const [kopf, setKopf] = useState(null);
  useEffect(() => {
    if (!zeigen || gesehen) return;
    let weg = false;
    mahnBilder().then((b) => { if (!weg) setKopf((b && b.stueckzahl) || null); });
    return () => { weg = true; };
  }, [zeigen, gesehen]);
  if (!zeigen || gesehen) return null;
  const merken = () => { setGesehen(true); alt.einstellungSetzenWert && alt.einstellungSetzenWert(GESEHEN, "1"); };
  return (
    <section className="karte neues-tutorial" id="db-tutorial">
      {kopf && <img className="neues-tutorial__kopf" data-tutorial-kopf src={kopf} alt="" />}
      <div className="neues-tutorial__text">
        <h2>Neues Tutorial: HOFERCAM</h2>
        <p>Schau es dir an! In rund 15 Minuten programmieren wir ein ganzes Teil, von den Kopfdaten über Kontur,
          Nuten und Entgraten bis zur 3D-Simulation.</p>
        <div className="neues-tutorial__knoepfe">
          <button className="knopf knopf--haupt" id="db-tutorial-los" onClick={() => { merken(); hofercamTutorialOeffnen(); }}>▶ Jetzt anschauen</button>
          <button className="knopf" id="db-tutorial-weg" onClick={merken}>Nicht mehr zeigen</button>
        </div>
      </div>
    </section>
  );
}
