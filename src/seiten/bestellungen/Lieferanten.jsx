// =================================================================
//  BESTELLUNGEN · Reiter „Lieferanten“
//  Das Fenster zum Anpassen (Adresse, Bestellweg, Mail) ist noch im
//  alten Programm: lieferantDialog.
// =================================================================
import { alt, useDaten, useSpeicherWert } from "../../bruecke.jsx";
import { Suchfeld, passt } from "../../teile/Suchfeld.jsx";

export default function Lieferanten({ auffrischen, behaelter }) {
  const best = alt.best;
  const [suche, setSuche] = useSpeicherWert(best, "liefSuche", auffrischen);
  const schreiben = alt.darfSchreiben();
  const { daten: liste, fehler } = useDaten(() => alt.ladeLieferanten(), [auffrischen]);

  if (fehler && !liste) {
    return <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>;
  }
  if (!liste) return <div className="laedt">Wird geladen …</div>;
  const gefiltert = liste.filter((l) => passt(suche, [l.name]));

  return (
    <>
      <Suchfeld id="lf-suche" wert={suche} setzen={setSuche} />
      {schreiben &&
        <button className="knopf knopf--haupt knopf--breit" id="lf-neu"
          onClick={() => alt.lieferantDialog(null, behaelter)}>+ Neuer Lieferant</button>}
      <section className="karte">
        <h2>Lieferanten <span className="marke">{gefiltert.length}</span></h2>
        {gefiltert.length
          ? <table className="tabelle"><tbody>
              {gefiltert.map((l) => (
                <tr key={l.id}>
                  <td className="stark">{l.website
                    ? <a className="lieferantlink" href={l.website} target="_blank" rel="noopener">{l.name} ↗</a>
                    : l.name}</td>
                  {schreiben &&
                    <td className="rechts nowrap">
                      <button className="linkknopf" data-lf={l.id}
                        onClick={() => alt.lieferantDialog(l, behaelter)}>Anpassen</button>{" "}
                      <button className="linkknopf linkknopf--gefahr" data-lfweg={l.id}
                        data-name={l.name} onClick={() => loeschen(l, behaelter)}>Löschen</button>
                    </td>}
                </tr>
              ))}
            </tbody></table>
          : <p className="hinweis">{suche.trim()
              ? 'Nichts gefunden zu "' + suche + '".' : "Noch keine Lieferanten angelegt."}</p>}
      </section>
    </>
  );
}

async function loeschen(l, behaelter) {
  const ok = await alt.nachfragen({
    titel: "Lieferant löschen",
    text: '"' + l.name + '" wird gelöscht. Artikel und Bestellungen '
        + "bleiben, sie haben danach keinen Lieferanten mehr.",
    bestaetigen: "Löschen", gefahr: true });
  if (!ok) return;

  // Verweise lösen, damit das Löschen nicht scheitert
  const db = alt.db;
  await db.from("articles").update({ supplier_id: null }).eq("supplier_id", l.id);
  await db.from("order_items").update({ supplier_id: null }).eq("supplier_id", l.id);

  const r = await db.from("suppliers").delete().eq("id", l.id).select();
  if (r.error) alt.meldung(alt.fehlertext(r.error), "fehler");
  else if ((r.data || []).length === 0)
    alt.meldung("Nichts gelöscht. Vermutlich fehlen die Rechte in der Datenbank.", "fehler");
  else alt.meldung("Lieferant gelöscht.");
  alt.seiteBestellungen(behaelter);
}
