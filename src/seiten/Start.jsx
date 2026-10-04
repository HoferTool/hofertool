// =================================================================
//  STARTSEITE
//  Kopfkarte (Uhr, Logo, Wetter), Solaranlage, Gruss, dann die Teile,
//  die sich mit dem Betrieb ändern. Der laufende Abgleich kommt als
//  „auffrischen“ an: Jede Karte lädt still nach, und React tauscht
//  nur aus, was sich wirklich geändert hat. Uhr, Wetter und Solar-
//  anlage bleiben dabei stehen. Die Seite flackert nicht.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { Probleme, problemeLaden, EinkaufKurz, Bestellstand, Geburtstage,
  geburtstageLaden, geburtstageAufbereiten } from "./start/Karten.jsx";
import { GeburtstagMitte, Konfetti } from "./start/Geburtstag.jsx";
import Notizen from "./start/Notizen.jsx";
import { Ziffern } from "../effekte/Ziffern.jsx";

export default function Start({ auffrischen }) {
  const profil = alt.profil;
  const name = (profil && (profil.full_name || profil.email.split("@")[0])) || "";
  // Einmal laden, für die Karte unten und für das Band oben
  const geb = useDaten(geburtstageLaden, [auffrischen]);
  const kinder = geburtstageAufbereiten(geb.daten).filter((m) => m.tage === 0);
  const fest = kinder.length > 0;
  // Statt der Vorbereitung steht hier immer die Problemkarte (Wunsch
  // 4. Oktober 2026), meistens mit „Keine Probleme gemeldet“.
  const prob = useDaten(problemeLaden, [auffrischen]);
  return (
    <>
      <section className={"kopfkarte" + (fest ? " kopfkarte--geburtstag" : "")}>
        {fest && <Konfetti />}
        <Uhr />
        {fest
          ? <GeburtstagMitte kinder={kinder} />
          : <img className="kopfkarte__logo" src={alt.LOGO_WEISS} alt="Hofer + Co." />}
        <Wetter />
      </section>
      <Solaranlage />
      <p className="gruss">{alt.begruessung()}{name ? ", " + name : ""}</p>
      <Probleme liste={prob.daten} fehler={prob.fehler} neu={prob.neu} />
      {/* Reihenfolge nach Wunsch 4. Oktober 2026: Probleme, Bestellungen,
          Notizen, Einkaufsliste, am Schluss die Geburtstage. */}
      <Bestellstand auffrischen={auffrischen} />
      <Notizen auffrischen={auffrischen} />
      <EinkaufKurz auffrischen={auffrischen} />
      <Geburtstage leute={geb.daten} fehler={geb.fehler} />
    </>
  );
}

function Uhr() {
  const [jetzt, setJetzt] = useState(() => new Date());
  useEffect(() => {
    const takt = setInterval(() => setJetzt(new Date()), 20000);
    return () => clearInterval(takt);
  }, []);
  const p = (n) => String(n).padStart(2, "0");
  return (
    <div className="kopfkarte__zeit">
      <div className="uhr" id="uhr"><Ziffern text={p(jetzt.getHours()) + ":" + p(jetzt.getMinutes())} /></div>
      <div className="kopfkarte__datum" id="datum">{jetzt.toLocaleDateString("de-CH",
        { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
    </div>
  );
}

function Wetter() {
  const [wetter, setWetter] = useState(null);   // null = lädt, false = nicht verfügbar
  useEffect(() => {
    let gueltig = true;
    alt.holeWetter().then((w) => gueltig && setWetter(w), () => gueltig && setWetter(false));
    return () => { gueltig = false; };
  }, []);

  const fei = alt.naechsterFeiertag();
  const feiText = fei
    ? (fei.tage === 0 ? "Heute ist " + fei.name
      : fei.tage === 1 ? "Morgen ist " + fei.name
      : fei.name + " in " + fei.tage + " Tagen")
    : "";
  const feiertag = feiText && <div className="wetter__feiertag">{feiText}</div>;

  return (
    <div className="kopfkarte__wetter" id="wetter">
      {wetter === null && <span className="klein">Wetter wird geladen …</span>}
      {wetter === false && <><span className="klein">Wetter nicht verfügbar</span>{feiertag}</>}
      {wetter && <>
        <div className="wetter__grad">{wetter.temperatur}°</div>
        <div className="wetter__text">{wetter.text}</div>
        <div className="wetter__rand">{alt.ORT.name} · {wetter.tief}° bis {wetter.hoch}°</div>
        {feiertag}
      </>}
    </div>
  );
}

// Die Kachel der Solaranlage zeichnet noch das alte Programm. Die
// Werte ändern sich laufend, darum jede Minute neu, ausser während
// ein Fenster offen ist. Stört den Rest nicht, wenn es sie nicht gibt.
function Solaranlage() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const zeigen = () => alt.solarKachel(el).catch((f) => {
      el.innerHTML = '<section class="karte"><h2>Solaranlage</h2>'
        + '<p class="hinweis">' + alt.esc(alt.fehlertext(f)) + '</p></section>';
    });
    zeigen();
    const takt = setInterval(() => {
      if (document.querySelector(".dialog-huelle")) return;
      zeigen();
    }, 60000);
    return () => clearInterval(takt);
  }, []);
  return <div id="db-solar" className="kopfkarte__solar" ref={ref} />;
}
