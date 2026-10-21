// =================================================================
//  BACKUP-BATTERIEN WECHSELN (seit 1.134.0, Wunsch Patrick
//  21. Oktober 2026: „soll wenn es notwendig ist wie Probleme bei Start
//  kommen, für alle sichtbar, auch ausschaltbar“)
//
//  Steht nur da, wenn bei einer Maschine der Wechsel in den nächsten
//  30 Tagen fällig oder überfällig ist und der Hinweis dort an ist
//  (Seite Maschinen → Maschine → Backup-Batterien). Für alle ausser
//  Externen und dem Dienstkonto. Seit 1.135.0 nur die Anzahl und der
//  Knopf „Liste“, die Maschinen stehen im Fenster (Wunsch Patrick:
//  „nicht alle als Balken, sondern Anzahl, dann Liste“).
// =================================================================
import { alt, useDaten } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { faelligeBatterien, batterieText, batterienText, tageBis } from "../../daten/maschinenInfo.js";
import { maschineZeigen } from "../Maschinen.jsx";

const keine = async () => [];

function listeOeffnen(daten) {
  fensterOeffnen((zu) => (
    <div className="dialog dialog--breit batteriefenster" role="dialog" aria-modal="true" id="batterie-fenster">
      <div className="blatt__kopf">
        <h2>Backup-Batterien wechseln</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      <ul className="batteriefenster__liste">
        {daten.map((x) => (
          <li key={x.machine_id}>
            <button className="batteriefenster__zeile" data-batterie={x.machine_id}
              onClick={() => { zu(); maschineZeigen(x.m); }}>
              <span className="batteriefenster__name">
                <b>{x.m.machine_number || x.m.name}</b>
                {x.m.machine_number && x.m.name !== x.m.machine_number && <span className="klein"> {x.m.name}</span>}
              </span>
              <span className={tageBis(x.batterie_faellig) < 0 ? "mseite-rot" : ""}>{batterieText(x)}</span>
              <span className="klein">{batterienText(x) || "Batterien nicht angegeben"}
                {x.batterie_gewechselt ? " · zuletzt " + alt.kurzDatum(x.batterie_gewechselt) + x.batterie_gewechselt.slice(0, 4) : ""}</span>
            </button>
          </li>))}
      </ul>
    </div>
  ), null, "batterie-huelle");
}

export default function Batterien({ auffrischen }) {
  const zeigen = !alt.istExtern() && alt.meineRolle() !== "dienst";
  const { daten } = useDaten(zeigen ? faelligeBatterien : keine, [auffrischen, zeigen]);
  if (!daten || !daten.length) return null;
  const ueber = daten.filter((x) => tageBis(x.batterie_faellig) < 0).length;
  const n = daten.length;
  return (
    <section className={"karte karte--warnung batteriekarte" + (ueber ? " batteriekarte--ueber" : "")} id="db-batterien">
      <div className="batteriekarte__zeile">
        <h2>⚠ Backup-Batterien wechseln</h2>
        <span className="batteriekarte__anzahl" id="db-batterien-anzahl">
          {n} {n === 1 ? "Maschine" : "Maschinen"}{ueber ? " · " + ueber + " überfällig" : ""}</span>
        <button className="knopf" id="db-batterien-liste" onClick={() => listeOeffnen(daten)}>Liste</button>
      </div>
    </section>
  );
}
