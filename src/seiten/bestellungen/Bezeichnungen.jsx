// =================================================================
//  BESTELLUNGEN · Reiter „Bezeichnungen“
//  Die Liste, die beim Anlegen und Bearbeiten von Artikeln erscheint.
// =================================================================
import { alt, useDaten, useSpeicherWert } from "../../bruecke.jsx";
import { Suchfeld, passt } from "../../teile/Suchfeld.jsx";

export default function Bezeichnungen({ auffrischen }) {
  const best = alt.best;
  const [suche, setSuche] = useSpeicherWert(best, "bezSuche", auffrischen);
  const schreiben = alt.darfSchreiben();
  const { daten: liste, fehler, neu } = useDaten(() => alt.ladeBezeichnungen(), [auffrischen]);
  const gefiltert = liste && liste.filter((z) => passt(suche, [z.name]));

  return (
    <>
      <Suchfeld id="bz-suche" wert={suche} setzen={setSuche} />
      {schreiben &&
        <button className="knopf knopf--haupt knopf--breit" id="bz-neu"
          onClick={() => bezeichnungDialog(null, neu)}>+ Neue Bezeichnung</button>}
      <div id="bz-liste">
        {fehler && !liste
          ? <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>
          : !gefiltert
            ? <div className="laedt">Wird geladen …</div>
            : <section className="karte">
                <h2>Bezeichnungen <span className="marke">{gefiltert.length}</span></h2>
                <p className="hinweis">Diese Liste erscheint beim Anlegen und Bearbeiten
                  {" "}von Artikeln. So heisst dasselbe Werkzeug überall gleich.</p>
                {gefiltert.length
                  ? <table className="tabelle"><tbody>
                      {gefiltert.map((z) => (
                        <tr key={z.id}>
                          <td className="stark">{z.name}</td>
                          {schreiben &&
                            <td className="rechts nowrap">
                              <button className="linkknopf" data-bzb={z.id}
                                onClick={() => bezeichnungDialog(z, neu)}>Bearbeiten</button>
                              <button className="linkknopf linkknopf--gefahr" data-bzw={z.id}
                                data-name={z.name} onClick={() => loeschen(z, neu)}>Löschen</button>
                            </td>}
                        </tr>
                      ))}
                    </tbody></table>
                  : <p className="hinweis">{suche.trim()
                      ? 'Nichts gefunden zu "' + suche + '".' : "Noch keine Bezeichnung angelegt."}</p>}
              </section>}
      </div>
    </>
  );
}

async function loeschen(z, neu) {
  const ok = await alt.nachfragen({ titel: "Bezeichnung löschen",
    text: '"' + z.name + '" wird aus der Liste entfernt. '
        + "Artikel, die sie tragen, behalten ihren Namen.",
    bestaetigen: "Löschen", gefahr: true });
  if (!ok) return;
  const { error } = await alt.db.from("designations").delete().eq("id", z.id);
  if (error) alt.meldung(alt.fehlertext(error), "fehler");
  else { alt.meldung("Gelöscht."); neu(); }
}

async function bezeichnungDialog(eintrag, neu) {
  const w = await alt.dialogFelder({
    titel: eintrag ? "Bezeichnung ändern" : "Neue Bezeichnung",
    felder: [{ name: "name", label: "Bezeichnung", pflicht: true, wert: eintrag ? eintrag.name : "" }],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  const db = alt.db;
  const { error } = eintrag
    ? await db.from("designations").update({ name: w.name }).eq("id", eintrag.id)
    : await db.from("designations").insert({ name: w.name });
  if (error) alt.meldung(alt.fehlertext(error), "fehler");
  else { alt.meldung("Gespeichert."); neu(); }
}
