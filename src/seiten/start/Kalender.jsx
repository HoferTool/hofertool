// =================================================================
//  STARTSEITE · KALENDER (seit 1.311.0, Wunsch Patrick 30. Oktober 2026:
//  „Kalender auf Start nach Probleme und die nächsten zwei Wochen
//  anzeigen, wöchentliche Tasks nur einmal, da es klar ist“)
//
//  Je Eintrag nur der nächste Tag in den nächsten 14 Tagen, so steht
//  die Kehrichtabfuhr jede Woche nur einmal da, mit „jede Woche“ dabei.
//  Ein Tipp auf die Karte öffnet das Fenster zum Verwalten, das früher
//  der Reiter Kalender war. Nicht für Externe und Dienst.
// =================================================================
import { alt, useDaten } from "../../bruecke.jsx";
import { kalenderLaden, naechsteTermine, wannText, kalenderZeichen,
  wiederholungText } from "../../daten/kalender.js";
import { kalenderOeffnen, kalenderDarf } from "../Kalender.jsx";

const TAGE = 14;
const keine = async () => [];
// „Jede Woche“ → „jede Woche“ mitten in der Zeile
const klein = (t) => t.charAt(0).toLowerCase() + t.slice(1);

export default function KalenderKarte({ auffrischen }) {
  const zeigen = kalenderDarf();
  const { daten, fehler, neu } = useDaten(zeigen ? kalenderLaden : keine, [auffrischen, zeigen]);
  // Fehlt die Tabelle oder ist nichts geladen, bleibt nur diese Karte weg
  if (!zeigen || (!daten && fehler)) return null;
  if (!daten) return <div id="db-kalender" />;

  const gesehen = new Set();
  const termine = naechsteTermine(daten, TAGE).filter((t) => {
    if (gesehen.has(t.eintrag.id)) return false;
    gesehen.add(t.eintrag.id); return true;
  });

  return (
    <div id="db-kalender">
      <section className="karte karte--klickbar" onClick={() => kalenderOeffnen(neu)}>
        <h2>Kalender{termine.length > 0 && <> <span className="marke">{termine.length}</span></>}
          <span className="klein kal-karte__zusatz"> nächste 2 Wochen</span></h2>
        {termine.length
          ? <div className="kal-liste">
              {termine.map((t) => (
                <div className={"kal-zeile" + (t.tage === 0 ? " kal-zeile--heute" : "")} key={t.eintrag.id}
                  data-kaltermin={t.eintrag.id}>
                  <span className="kal-zeile__wann">{wannText(t)}</span>
                  <span className="kal-zeile__zeichen">{kalenderZeichen(t.eintrag.titel)}</span>
                  <span className="kal-zeile__was">{t.eintrag.titel}
                    {t.eintrag.wiederholung !== "nie" &&
                      <span className="klein"> · {klein(wiederholungText(t.eintrag.wiederholung))}</span>}
                    {t.eintrag.notiz && <span className="klein"> · {t.eintrag.notiz}</span>}</span>
                </div>))}
            </div>
          : <p className="hinweis">Keine Termine in den nächsten zwei Wochen.</p>}
      </section>
    </div>
  );
}
