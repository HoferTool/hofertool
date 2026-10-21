// =================================================================
//  BACKUP-BATTERIEN WECHSELN (seit 1.134.0, Wunsch Patrick
//  21. Oktober 2026: „soll wenn es notwendig ist wie Probleme bei Start
//  kommen, für alle sichtbar, auch ausschaltbar“)
//
//  Steht nur da, wenn bei einer Maschine der Wechsel in den nächsten
//  30 Tagen fällig oder überfällig ist und der Hinweis dort an ist
//  (Seite Maschinen → Maschine → Backup-Batterien). Für alle ausser
//  Externen und dem Dienstkonto.
// =================================================================
import { alt, useDaten } from "../../bruecke.jsx";
import { faelligeBatterien, batterieText, tageBis } from "../../daten/maschinenInfo.js";
import { maschineZeigen } from "../Maschinen.jsx";

const keine = async () => [];

export default function Batterien({ auffrischen }) {
  const zeigen = !alt.istExtern() && alt.meineRolle() !== "dienst";
  const { daten } = useDaten(zeigen ? faelligeBatterien : keine, [auffrischen, zeigen]);
  if (!daten || !daten.length) return null;
  const ueber = daten.some((x) => tageBis(x.batterie_faellig) < 0);
  return (
    <section className={"karte karte--warnung batteriekarte" + (ueber ? " batteriekarte--ueber" : "")} id="db-batterien">
      <h2>⚠ Backup-Batterien wechseln <span className="marke">{daten.length}</span></h2>
      {daten.map((x) => (
        <div className="problemzeile" key={x.machine_id}>
          <span className="problemzeile__zeichen">🔋</span>
          <div className="problemzeile__inhalt">
            <button className="problemzeile__nr problemzeile__nr--klick" data-batterie={x.machine_id}
              onClick={() => maschineZeigen(x.m)}>
              {x.m.machine_number || x.m.name}
              {x.m.machine_number && x.m.name !== x.m.machine_number && <> <span className="klein">{x.m.name}</span></>}
            </button>
            <div className={tageBis(x.batterie_faellig) < 0 ? "mseite-rot" : ""}>{batterieText(x)}</div>
            {x.batterie_gewechselt && <div className="klein">zuletzt gewechselt {alt.kurzDatum(x.batterie_gewechselt)}{x.batterie_gewechselt.slice(0, 4)}</div>}
          </div>
        </div>))}
    </section>
  );
}
