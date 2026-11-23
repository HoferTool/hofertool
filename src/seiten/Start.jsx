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
import { Probleme, problemeLaden, EinkaufKurz, Bestellstand, BestellKurz, Geburtstage,
  geburtstageLaden, geburtstageAufbereiten } from "./start/Karten.jsx";
import { GeburtstagMitte, Konfetti } from "./start/Geburtstag.jsx";
import Notizen from "./start/Notizen.jsx";
import Materialausgabe from "./start/Materialausgabe.jsx";
import { Ziffern } from "../effekte/Ziffern.jsx";
import Durchfahrt from "./start/Durchfahrt.jsx";
import Batterien from "./start/Batterien.jsx";
import Jubilaeen from "./start/Jubilaeen.jsx";
import HeuteOffen from "./start/HeuteOffen.jsx";
import OhneWbg from "./start/OhneWbg.jsx";
import KalenderKarte from "./start/Kalender.jsx";
import Systemzustand from "./start/Systemzustand.jsx";
import NeuesTutorial from "./start/NeuesTutorial.jsx";
import Umfragen from "./start/Umfragen.jsx";

// Externe und Dienst fragen gar nicht erst nach Problemen
const keineProbleme = async () => [];

export default function Start({ auffrischen, module }) {
  const profil = alt.profil;
  const name = (profil && (profil.full_name || profil.email.split("@")[0])) || "";
  // Einmal laden, für die Karte unten und für das Band oben
  const geb = useDaten(geburtstageLaden, [auffrischen]);
  const kinder = geburtstageAufbereiten(geb.daten).filter((m) => m.tage === 0);
  const fest = kinder.length > 0;
  // Statt der Vorbereitung steht hier immer die Problemkarte (Wunsch
  // 4. Oktober 2026), meistens mit „Keine Probleme gemeldet“. Seit
  // 1.111.0 nur noch für Admins (Wunsch Patrick 20. Oktober 2026), alle
  // anderen sehen die Probleme weiter auf der Planwand am Balken.
  // Seit 1.445.0 wieder für alle ausser Externen und Dienst, gefiltert nach
  // dem eigenen Maschinentyp (Wunsch Patrick 7. November 2026)
  const admin = alt.istAdmin();
  const r = alt.meineRolle();
  const probSehen = r !== "extern" && r !== "dienst";
  const prob = useDaten(probSehen ? problemeLaden : keineProbleme, [auffrischen, probSehen]);
  // Neuer Look (nur mit Vermerk neuerLook, seit 1.716.0, Wunsch Patrick
  // 23. November 2026): oben Gruss mit Uhr und Wetter in der Ecke statt
  // des blauen Bands mit Logo, darunter Solaranlage und Bestellungen
  // nebeneinander, dann zwei Spalten: links die Probleme, rechts Kalender,
  // Heute noch offen und Materialausgabe Extern
  if (!module && document.documentElement.classList.contains("ohne-kopf")) {
    return (
      <div className="sn2">
        <div className="sn2-kopf">
          <p className="gruss">{alt.begruessung()}{name ? ", " + name : ""}</p>
          <div className="sn2-ecke"><Uhr /><Wetter /></div>
        </div>
        {/* Oben Solaranlage und Geburtstage (seit 1.717.0, Wunsch Patrick
            23. November 2026); hat jemand Geburtstag, füllt das Fest die ganze Karte */}
        <div className="sn2-oben">
          <Solaranlage />
          {fest
            ? <section className="kopfkarte kopfkarte--geburtstag sn2-fest" id="db-geburtstage"><Konfetti /><GeburtstagMitte kinder={kinder} /></section>
            : <Geburtstage leute={geb.daten} fehler={geb.fehler} />}
        </div>
        {admin && <Systemzustand auffrischen={auffrischen} />}
        <NeuesTutorial />
        <div className="sn2-spalten">
          <div className="sn2-spalte">
            {probSehen && <Probleme liste={prob.daten} fehler={prob.fehler} neu={prob.neu} />}
            <OhneWbg auffrischen={auffrischen} />
            <Jubilaeen auffrischen={auffrischen} />
            <Batterien auffrischen={auffrischen} />
            <Notizen auffrischen={auffrischen} />
          </div>
          <div className="sn2-spalte">
            <KalenderKarte auffrischen={auffrischen} />
            <HeuteOffen auffrischen={auffrischen} />
            <BestellKurz auffrischen={auffrischen} />
            <Materialausgabe auffrischen={auffrischen} />
            <Umfragen auffrischen={auffrischen} />
            <EinkaufKurz auffrischen={auffrischen} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <>
      <section className={"kopfkarte" + (fest ? " kopfkarte--geburtstag" : "")}>
        {fest ? <Konfetti /> : <Durchfahrt />}
        <Uhr />
        {fest
          ? <GeburtstagMitte kinder={kinder} />
          : <img className="kopfkarte__logo" src={alt.LOGO_WEISS} alt="Hofer + Co." />}
        <Wetter />
      </section>
      {/* Mit Modulen (Vorschau #/startneu, seit 1.670.0) stehen Gruss und
          Module gleich unter dem Kopf, die Solaranlage danach */}
      {!module && <Solaranlage />}
      <p className="gruss">{alt.begruessung()}{name ? ", " + name : ""}</p>
      {module}
      {module && <h2 className="sm-heute">Heute</h2>}
      {/* Sicherung, Pool-Rechner, Drucker, Solar: nur wenn etwas nicht
          stimmt, nur Admins (Wunsch Patrick 3. November 2026) */}
      {admin && <Systemzustand auffrischen={auffrischen} />}
      {/* Hinweis aufs neue HOFERCAM-Tutorial (Wunsch Patrick 17. November 2026) */}
      <NeuesTutorial />
      {probSehen && <Probleme liste={prob.daten} fehler={prob.fehler} neu={prob.neu} />}
      {/* Termine der nächsten zwei Wochen, statt des Reiters Kalender
          (Wunsch Patrick 30. Oktober 2026) */}
      <KalenderKarte auffrischen={auffrischen} />
      {/* Dienstjubiläen alle 5 Jahre, nur Admins (Wunsch Patrick 18. November 2026) */}
      <Jubilaeen auffrischen={auffrischen} />
      {/* Umfragen mit Abstimmen per Name (Wunsch Patrick 17. November 2026) */}
      <Umfragen auffrischen={auffrischen} />
      {/* Maschinen ohne Stückzahl von heute oder ohne Stückzeit
          (Wunsch Patrick 26. Oktober 2026) */}
      <HeuteOffen auffrischen={auffrischen} />
      {/* Laufende Aufträge ohne WBG (Wunsch Patrick 28. Oktober 2026) */}
      <OhneWbg auffrischen={auffrischen} />
      {/* Fällige Backup-Batterien für alle (Wunsch Patrick 21. Oktober 2026) */}
      <Batterien auffrischen={auffrischen} />
      {/* Reihenfolge nach Wunsch 4. Oktober 2026: Probleme, Bestellungen,
          Notizen, Einkaufsliste, am Schluss die Geburtstage. Über den
          Notizen die Materialausgabe Extern (Wunsch 8. Oktober 2026). */}
      <Bestellstand auffrischen={auffrischen} />
      <Materialausgabe auffrischen={auffrischen} />
      <Notizen auffrischen={auffrischen} />
      <EinkaufKurz auffrischen={auffrischen} />
      <Geburtstage leute={geb.daten} fehler={geb.fehler} />
      {module && <Solaranlage />}
    </>
  );
}

// Uhr, Wetter und Solaranlage stehen auch oben auf dem Infoboard;
// dort ohne die ids, die die Startseite darunter schon trägt
export function Uhr({ ohneId }) {
  const [jetzt, setJetzt] = useState(() => new Date());
  useEffect(() => {
    const takt = setInterval(() => setJetzt(new Date()), 20000);
    return () => clearInterval(takt);
  }, []);
  const p = (n) => String(n).padStart(2, "0");
  return (
    <div className="kopfkarte__zeit">
      <div className="uhr" id={ohneId ? undefined : "uhr"}><Ziffern text={p(jetzt.getHours()) + ":" + p(jetzt.getMinutes())} /></div>
      <div className="kopfkarte__datum" id={ohneId ? undefined : "datum"}>{jetzt.toLocaleDateString("de-CH",
        { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
    </div>
  );
}

export function Wetter({ ohneId }) {
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
    <div className="kopfkarte__wetter" id={ohneId ? undefined : "wetter"}>
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
export function Solaranlage({ ohneId }) {
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
  return <div id={ohneId ? undefined : "db-solar"} className="kopfkarte__solar" ref={ref} />;
}
