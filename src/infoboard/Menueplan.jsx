// =================================================================
//  MENÜPLAN IM PAUSENRAUM
//  Kachel-Inhalt { art: "menu" } (Wunsch Patrick 12. November 2026:
//  „Tschanz menuplan soll bearbeitbar sein. Man soll auflisten können,
//  was das heutige Menü ist, als Text, und wenn man draufklickt, soll man
//  es sehen. Zum Bearbeiten draufklicken, dann oben links ein Knopf zum
//  Bearbeiten, soll schön aussehen“).
//  Die Kachel zeigt unter ihrem Titel das Menü von heute. Antippen zeigt
//  die ganze Woche Mo–Fr gross, heute hervorgehoben; oben links
//  „Bearbeiten“ macht aus jedem Tag ein Textfeld. Gespeichert wird nur,
//  was geändert wurde (src/daten/menueplan.js).
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { menueLaden, menueSpeichern, tagSchluessel } from "../daten/menueplan.js";

const TAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
const MONATE = ["Jan.", "Feb.", "März", "April", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
const NEU_MS = 5 * 60 * 1000;

// Gemeinsamer Stand für Kachel und grosse Ansicht: nach dem Speichern
// zeigt die Kachel sofort das neue Menü
let stand = null;
const hoerer = new Set();
function melden(t) { stand = t; hoerer.forEach((f) => f(t)); }
async function neuLaden() {
  try { melden(await menueLaden()); } catch (e) { if (!stand) melden({}); }
}

function useMenue() {
  const [tage, setTage] = useState(stand);
  useEffect(() => {
    hoerer.add(setTage);
    neuLaden();
    const t = setInterval(neuLaden, NEU_MS);
    return () => { hoerer.delete(setTage); clearInterval(t); };
  }, []);
  return tage;
}

function montag(d, wochen) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wt = (x.getDay() + 6) % 7;
  // Am Wochenende gleich die nächste Woche
  x.setDate(x.getDate() - wt + (wt >= 5 ? 7 : 0) + 7 * (wochen || 0));
  return x;
}
const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const datumKurz = (d) => d.getDate() + ". " + MONATE[d.getMonth()];

// Der Text auf der Kachel unter dem Titel
export function MenueHeute() {
  const tage = useMenue();
  const heute = new Date();
  const wt = heute.getDay();
  let text = tage ? tage[tagSchluessel(heute)] : "";
  if (!tage) text = "";
  else if (!text) text = wt === 0 || wt === 6 ? "Heute kein Menü" : "Noch kein Menü eingetragen";
  return <span className="ib-menue-heute" data-menue="heute">{text}</span>;
}

export function MenueGross({ feld, zu, aktiv }) {
  const tage = useMenue();
  const [woche, setWoche] = useState(0);
  const [entwurf, setEntwurf] = useState(null);   // { schluessel: text } beim Bearbeiten
  const [speichert, setSpeichert] = useState(false);
  const erstesFeld = useRef(null);
  const start = montag(new Date(), woche);
  const tageDerWoche = TAGE.map((name, i) => { const d = plus(start, i); return { name, d, k: tagSchluessel(d) }; });
  const heute = tagSchluessel(new Date());

  useEffect(() => { if (entwurf && erstesFeld.current) erstesFeld.current.focus(); }, [!!entwurf]);

  const bearbeiten = () => {
    const e = {};
    for (const t of tageDerWoche) e[t.k] = (tage && tage[t.k]) || "";
    setEntwurf(e);
  };
  const wechseln = (n) => {
    if (entwurf) return;
    setWoche((w) => w + n);
  };
  const speichern = async () => {
    const aend = {};
    for (const [k, v] of Object.entries(entwurf)) if ((v || "").trim() !== ((tage && tage[k]) || "").trim()) aend[k] = v;
    if (!Object.keys(aend).length) { setEntwurf(null); return; }
    setSpeichert(true);
    try { melden(await menueSpeichern(aend)); setEntwurf(null); alt.meldung("Menüplan gespeichert.", "gut"); }
    catch (e) { alt.meldung("Menüplan nicht gespeichert: " + (alt.fehlertext ? alt.fehlertext(e) : e.message), "fehler"); }
    finally { setSpeichert(false); }
  };

  const ende = plus(start, 4);
  const wocheText = woche === 0 ? "Diese Woche" : woche === 1 ? "Nächste Woche" : woche === -1 ? "Letzte Woche" : "Woche";
  return (
    <>
      <div className="ib-gross__kopf">
        {entwurf
          ? <>
              <button type="button" className="ib-menue-knopf ib-menue-knopf--gut" data-menue="speichern" disabled={speichert}
                onClick={speichern}><span aria-hidden="true">✓</span> {speichert ? "Speichert …" : "Speichern"}</button>
              <button type="button" className="ib-menue-knopf ib-menue-knopf--still" data-menue="abbrechen" disabled={speichert}
                onClick={() => setEntwurf(null)}>Abbrechen</button>
            </>
          : <button type="button" className="ib-menue-knopf" data-menue="bearbeiten" onClick={bearbeiten}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M14 6l4 4" /></svg>
              Bearbeiten</button>}
        <span className="ib-gross__titel">{feld.zeichen ? feld.zeichen + " " : ""}{feld.titel}</span>
        <button type="button" className="ib-gross__zu" data-ib="gross-zu" onClick={zu}>✕ Schliessen</button>
      </div>
      <div className="ib-menue" data-menue="woche" onKeyDown={aktiv} onInput={aktiv}>
        <div className="ib-menue__leiste">
          <button type="button" className="ib-menue__pfeil" data-menue="zurueck" disabled={!!entwurf}
            onClick={() => wechseln(-1)} aria-label="Woche davor">‹</button>
          <div className="ib-menue__woche">
            <b>{wocheText}</b>
            <span>{datumKurz(start)} – {datumKurz(ende)} {ende.getFullYear()}</span>
          </div>
          <button type="button" className="ib-menue__pfeil" data-menue="vor" disabled={!!entwurf}
            onClick={() => wechseln(1)} aria-label="Woche danach">›</button>
        </div>
        <div className="ib-menue__tage">
          {tageDerWoche.map((t, i) => {
            const text = (tage && tage[t.k]) || "";
            const istHeute = t.k === heute;
            return (
              <div key={t.k} className={"ib-menue__tag" + (istHeute ? " ib-menue__tag--heute" : "") + (entwurf ? " ib-menue__tag--edit" : "")}
                data-menuetag={t.k}>
                <div className="ib-menue__tagkopf">
                  <span className="ib-menue__tagname">{t.name}</span>
                  <span className="ib-menue__datum">{datumKurz(t.d)}</span>
                  {istHeute && <span className="ib-menue__heute">Heute</span>}
                </div>
                {entwurf
                  ? <textarea ref={i === 0 ? erstesFeld : null} className="ib-menue__feld" value={entwurf[t.k] || ""}
                      placeholder="Menü eintippen …" data-ohne-leiste=""
                      onChange={(e) => setEntwurf((x) => ({ ...x, [t.k]: e.target.value }))} />
                  : <div className={"ib-menue__text" + (text ? "" : " ib-menue__text--leer")}>
                      {text || (tage ? "Kein Menü eingetragen" : "Lädt …")}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
