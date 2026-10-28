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
import Materialausgabe from "./start/Materialausgabe.jsx";
import { Ziffern } from "../effekte/Ziffern.jsx";
import Durchfahrt from "./start/Durchfahrt.jsx";
import Batterien from "./start/Batterien.jsx";
import HeuteOffen from "./start/HeuteOffen.jsx";
import OhneWbg from "./start/OhneWbg.jsx";

// Ohne Adminrecht wird gar nicht erst nach Problemen gefragt
const keineProbleme = async () => [];

export default function Start({ auffrischen }) {
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
  const admin = alt.istAdmin();
  const prob = useDaten(admin ? problemeLaden : keineProbleme, [auffrischen, admin]);
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
      <Solaranlage />
      <p className="gruss">{alt.begruessung()}{name ? ", " + name : ""}</p>
      {admin && <Probleme liste={prob.daten} fehler={prob.fehler} neu={prob.neu} />}
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
