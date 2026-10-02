// =================================================================
//  BESTELLUNGEN · Reiter „Historie“
//  Abgeschlossene Positionen, die zuletzt gelieferte zuoberst. Wer
//  aus Versehen auf geliefert gesetzt hat, kann es hier zurücksetzen.
// =================================================================
import { alt, useDaten, useSpeicherWert } from "../../bruecke.jsx";
import { Suchfeld, passt } from "../../teile/Suchfeld.jsx";

const lieferzeit = (z) => String(z.delivered_at || z.completed_at || z.created_at || "");

export default function Historie({ auffrischen, behaelter }) {
  const best = alt.best;
  const [suche, setSuche] = useSpeicherWert(best, "historieSuche", auffrischen);
  const { daten: liste, fehler } = useDaten(() => {
    alt.stammVergessen();
    return alt.ladeBestellungen(false);
  }, [auffrischen]);

  if (fehler && !liste) {
    return <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>;
  }
  if (!liste) return <div className="laedt">Wird geladen …</div>;

  const schreiben = alt.darfSchreiben();
  const fertige = liste.filter((z) => z.status === "geliefert")
    .sort((a, c) => lieferzeit(c).localeCompare(lieferzeit(a)))
    .filter((z) => {
      const a = z.articles || {};
      return passt(suche, [a.article_number, a.name, (z.suppliers && z.suppliers.name),
                           alt.personName(z.profiles, ""), z.ziel_text]);
    });

  return (
    <>
      <Suchfeld id="bh-suche" wert={suche}
        setzen={setSuche} />
      <section className="karte">
        <h2>Abgeschlossene Bestellungen
          {fertige.length > 0 && <> <span className="marke">{fertige.length}</span></>}</h2>
        {fertige.length
          ? <table className="tabelle">
              <thead><tr><th>Geliefert</th><th>Artikel</th><th className="mitte">Menge</th>
                <th>Wer</th>{schreiben && <th></th>}</tr></thead>
              <tbody>
                {fertige.map((z) => {
                  const a = z.articles || {};
                  const wann = alt.statusZeit(z);
                  return (
                    <tr key={z.id}>
                      <td className="klein nowrap">{wann
                        ? <>{alt.langDatum(wann.slice(0, 10))}
                            <div className="gedaempft">{alt.datumZeitKurz(wann).split(" ")[1] || ""} Uhr</div></>
                        : "–"}</td>
                      <td><strong>{a.article_number || "?"}</strong> {a.name || ""}
                        <div className="klein">{(z.suppliers && z.suppliers.name) || ""}</div></td>
                      <td className="mitte stark">{alt.zahlText(z.quantity)}</td>
                      <td className="klein">{alt.personName(z.profiles, "–")}
                        {z.ziel_text && <div>{alt.zielZeichen(z.ziel_art)} {z.ziel_text}</div>}</td>
                      {schreiben &&
                        <td className="bz-aktionen">
                          <button className="linkknopf" data-hstatus={z.id}
                            onClick={() => alt.bestStatusDialog(z, behaelter)}>Status</button>
                        </td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          : <p className="hinweis">{suche.trim()
              ? 'Nichts gefunden zu "' + suche + '".' : "Noch nichts abgeschlossen."}</p>}
      </section>
    </>
  );
}
