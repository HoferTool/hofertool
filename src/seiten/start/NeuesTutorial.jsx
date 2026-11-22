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

// Seit 1.703.0 (Patrick 22. November 2026: SW-20-Tutorial „passt“): zwei
// Videos, SB-20RG und SW-20; der Knopf in HOFERCAM öffnet das Video zum
// gewählten Maschinentyp, oben lässt sich umschalten
const VIDEOS = [
  { id: "sb", name: "SB-20RG", titel: "HOFERCAM: ein ganzes Teil Schritt für Schritt", src: VIDEO },
  { id: "sw", name: "SW-20", titel: "HOFERCAM an der SW-20: drei Kanäle Schritt für Schritt", src: "hilfe/hofercam-sw20-tutorial.mp4" },
];

function TutorialFenster({ zu, start }) {
  const [id, setId] = useState(start);
  const v = VIDEOS.find((x) => x.id === id) || VIDEOS[0];
  return (
    <div className="dialog kt-tutorial" id="hc-tutorial">
      <div className="kt-tutorial__kopf"><h2>{v.titel}</h2>
        <div className="hc-tutorial-wahl">{VIDEOS.map((x) => (
          <button key={x.id} data-hc-tutorial={x.id} className={"knopf knopf--klein" + (x.id === id ? " knopf--haupt" : "")}
            onClick={() => setId(x.id)}>{x.name}</button>))}</div>
      </div>
      <video key={v.src} src={v.src} controls playsInline className="kt-tutorial__video"
        ref={(el) => { if (el && !el.dataset.los) { el.dataset.los = "1"; el.play().catch(() => { el.muted = true; el.play().catch(() => {}); }); } }} />
      <div className="kt-tutorial__fuss">
        <button className="knopf knopf--haupt" id="hc-tutorial-zu" onClick={zu}>Schliessen</button>
      </div>
    </div>
  );
}

export function hofercamTutorialOeffnen(typ) {
  const start = typeof typ === "string" && typ.includes("sw") ? "sw" : "sb";
  fensterOeffnen((zu) => <TutorialFenster zu={zu} start={start} />, null, "kt-tutorial-huelle");
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
