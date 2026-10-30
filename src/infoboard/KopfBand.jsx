// =================================================================
//  BAND UNTER DER SOLARANLAGE
//  Auf dem Infoboard unter der Solaranlage ein weiterer Kopfbereich
//  (Wunsch Patrick 28. Oktober 2026): links die nächsten Geburtstage wie
//  auf der Startseite, rechts die nächsten Termine aus dem Kalender
//  (Kehrichtabfuhr, Papiersammlung …). Lädt alle fünf Minuten neu und
//  rechnet nach Mitternacht von selbst den neuen Tag.
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { geburtstageLaden, geburtstageAufbereiten } from "../seiten/start/Karten.jsx";
import { kalenderLaden, naechsteTermine, wannText, kalenderZeichen } from "../daten/kalender.js";

const NEU_MS = 5 * 60 * 1000;
// Seit 1.243.0 bis zu acht je Seite: das Band wächst mit, die Dokumente
// darunter rutschen nach unten (Tafel.jsx, teileUnterBand)
const GEBURTSTAGE = 8;
const GEBURTSTAGE_TAGE = 30;
const TERMINE = 8;
const TERMINE_TAGE = 30;

// rechts: im Pausenraum neben dem Kopf, fest so hoch wie er (quer ist
// unten kein Platz zum Wachsen); was nicht hineinpasst, fällt weg
export default function KopfBand({ top, left, breite, hoehe, hoeheMelden, rechts }) {
  const band = useRef(null);
  const [leute, setLeute] = useState(null);
  const [kalender, setKalender] = useState(null);
  const [heute, setHeute] = useState(() => alt.isoDatum(new Date()));

  useEffect(() => {
    let gueltig = true;
    const holen = () => {
      geburtstageLaden().then((d) => { if (gueltig) setLeute(d); }, () => { if (gueltig) setLeute((l) => l || []); });
      kalenderLaden().then((d) => { if (gueltig) setKalender(d); }, () => { if (gueltig) setKalender((k) => k || []); });
    };
    holen();
    const t = setInterval(() => {
      setHeute(alt.isoDatum(new Date()));
      if (!document.hidden) holen();
    }, NEU_MS);
    // Der neue Tag soll nicht bis zu fünf Minuten auf sich warten lassen
    const tag = setInterval(() => setHeute(alt.isoDatum(new Date())), 30000);
    return () => { gueltig = false; clearInterval(t); clearInterval(tag); };
  }, []);

  // Nur die nächsten 30 Tage, auch wenn dann weniger dastehen
  // (Wunsch Patrick 28. Oktober 2026)
  const geb = geburtstageAufbereiten(leute).filter((m) => m.tage <= GEBURTSTAGE_TAGE).slice(0, GEBURTSTAGE);
  // Je Eintrag nur der nächste Tag, sonst füllt die wöchentliche
  // Kehrichtabfuhr allein die Liste
  const gesehen = new Set();
  const termine = naechsteTermine(kalender, TERMINE_TAGE, heute)
    .filter((t) => !gesehen.has(t.eintrag.id) && gesehen.add(t.eintrag.id)).slice(0, TERMINE);

  // Die Tafel muss wissen, wie hoch das Band gerade wirklich ist, damit
  // sie die Dokumente darunter schieben kann (Wunsch Patrick 28. Oktober
  // 2026: „sonst ist dieser von den Dokumenten verdeckt“)
  useLayoutEffect(() => {
    const el = band.current;
    if (!el || !hoeheMelden) return;
    const melden = () => hoeheMelden(el.offsetHeight);
    melden();
    const ro = new ResizeObserver(melden);
    ro.observe(el);
    return () => { ro.disconnect(); hoeheMelden(0); };
  }, [hoeheMelden, heute]);

  // Ohne feste Höhe: das Band wächst mit seinen Einträgen, hoehe ist nur
  // die Mindesthöhe, die beim Einbau für das Band vorgesehen war
  return (
    <section className={"ib-band" + (rechts ? " ib-band--rechts" : "")} data-ib="band" key={heute} ref={band}
      style={{ top, left, width: breite, ...(rechts ? { height: hoehe } : { minHeight: hoehe }) }}>
      <div className="ib-band__teil" data-ib="band-geburtstage">
        <h2 className="ib-band__titel">🎂 Geburtstage</h2>
        {leute && !geb.length && <p className="ib-band__leer">Keine Geburtstage in den nächsten {GEBURTSTAGE_TAGE} Tagen.</p>}
        {geb.map((m, i) => (
          <div className={"ib-band__zeile" + (m.tage === 0 ? " ib-band__zeile--heute" : "")} key={m.name + i}>
            {m.bild
              ? <img className="ib-band__bild" src={m.bild} alt="" />
              : <span className="ib-band__bild ib-band__bild--leer">{m.name.charAt(0).toUpperCase()}</span>}
            <span className="ib-band__was">{m.name} <span className="ib-band__klein">wird {m.alter}</span></span>
            <span className="ib-band__wann">{m.tage === 0 ? "Heute! 🎉" : m.tage === 1 ? "Morgen"
              : wannText({ datum: m.datum, tage: m.tage })}</span>
          </div>
        ))}
      </div>
      <div className="ib-band__teil" data-ib="band-termine">
        <h2 className="ib-band__titel">📅 Kommende Termine</h2>
        {kalender && !termine.length && <p className="ib-band__leer">Keine Termine in den nächsten {TERMINE_TAGE} Tagen.</p>}
        {termine.map((t) => (
          <div className={"ib-band__zeile" + (t.tage === 0 ? " ib-band__zeile--heute" : "")} key={t.eintrag.id + t.datum}>
            <span className="ib-band__zeichen">{kalenderZeichen(t.eintrag.titel)}</span>
            <span className="ib-band__was">{t.eintrag.titel}
              {t.eintrag.notiz && <span className="ib-band__klein"> · {t.eintrag.notiz}</span>}</span>
            <span className="ib-band__wann">{wannText(t)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
