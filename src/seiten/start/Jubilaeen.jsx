// =================================================================
//  DIENSTJUBILÄEN (seit 1.626.0, Wunsch Patrick 18. November 2026:
//  „5 Jahres Jubiläen sollen mir angezeigt werden“, „alle 5 Jahre ist
//  ein Dienstjubiläum“). Nur Admins, nur wenn eins in den nächsten
//  45 Tagen kommt oder in der letzten Woche war. Eintritt steht im
//  Profil der Person in HOFERTIME.
// =================================================================
import { alt, useDaten } from "../../bruecke.jsx";
import { jubilaeenLaden } from "../../daten/zeit.js";

const keine = async () => [];

export default function Jubilaeen({ auffrischen }) {
  const zeigen = alt.istAdmin();
  const heute = alt.isoDatum(new Date());
  const { daten } = useDaten(zeigen ? () => jubilaeenLaden(heute, 45, 7) : keine, [auffrischen, zeigen, heute]);
  if (!daten || !daten.length) return null;
  return (
    <section className="karte jubikarte" id="db-jubilaeen">
      <h2>🎉 Dienstjubiläen</h2>
      <ul className="jubikarte__liste">
        {daten.map((x) => (
          <li key={x.person_id + x.datum} data-jubilaeum={x.person_id}>
            <b>{x.name}</b> <span>{x.jahre} Jahre</span>{" "}
            <span className="klein">{x.datum === heute ? "heute" : x.datum < heute ? "war am " + alt.kurzDatum(x.datum) : "am " + alt.kurzDatum(x.datum)}
              {" · seit " + alt.kurzDatum(x.eintritt) + String(x.eintritt).slice(0, 4)}</span>
          </li>))}
      </ul>
    </section>
  );
}
