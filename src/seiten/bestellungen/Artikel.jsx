// =================================================================
//  BESTELLUNGEN · Reiter „Artikel“
//  Suche fragt die Datenbank, kurz nachdem man aufgehört hat zu
//  tippen. Der Filter nach Bezeichnung wirkt sofort.
// =================================================================
import { alt, useDaten, useVerzoegert, useSpeicherWert } from "../../bruecke.jsx";

export default function Artikel({ auffrischen, behaelter }) {
  const best = alt.best;
  const [suche, setSuche] = useSpeicherWert(best, "artikelSuche", auffrischen);
  const [bez, setBez] = useSpeicherWert(best, "artikelBez", auffrischen);
  const ruhig = useVerzoegert(suche, 300);
  const schreiben = alt.darfSchreiben();

  const { daten: liste, fehler } = useDaten(() => alt.sucheArtikel(ruhig), [ruhig, auffrischen]);
  // Bezeichnungen für den Filter; der Filter ist Beiwerk, ohne geht es auch
  const { daten: bezeichnungen } = useDaten(
    () => alt.ladeBezeichnungen().catch(() => []), [auffrischen]);

  const gefiltert = liste && (bez ? liste.filter((a) => a.name === bez) : liste);

  return (
    <>
      <div className="suchleiste">
        <input type="search" id="ar-suche" placeholder="Suchen" value={suche} autoComplete="off"
          autoFocus={!!suche}
          onChange={(e) => { setSuche(e.target.value); }} />
        <select id="ar-bez" className="auswahl" value={bez}
          onChange={(e) => { setBez(e.target.value); }}>
          <option value="">Alle Bezeichnungen</option>
          {(bezeichnungen || []).map((z) => <option key={z.name} value={z.name}>{z.name}</option>)}
          {/* Gewählt, aber (noch) nicht geladen: trotzdem anzeigen */}
          {bez && !(bezeichnungen || []).some((z) => z.name === bez) &&
            <option value={bez}>{bez}</option>}
        </select>
      </div>
      {schreiben &&
        <button className="knopf knopf--haupt knopf--breit" id="ar-neu" onClick={async () => {
          const a = await alt.artikelSchnellAnlegen("");
          if (a) alt.seiteBestellungen(behaelter);
        }}>+ Neuer Artikel</button>}
      <div id="ar-liste">
        {fehler && !liste
          ? <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>
          : !gefiltert
            ? <div className="laedt">Wird geladen …</div>
            : <Liste liste={gefiltert} sucht={!!suche} schreiben={schreiben} behaelter={behaelter} />}
      </div>
    </>
  );
}

function Liste({ liste, sucht, schreiben, behaelter }) {
  return (
    <section className="karte">
      <h2>Artikel <span className="marke">{liste.length}</span></h2>
      {liste.length
        ? <table className="tabelle">
            <thead><tr><th>Nummer</th><th>Bezeichnung</th><th>Lieferant</th>
              {schreiben && <th></th>}</tr></thead>
            <tbody>
              {liste.map((a) => (
                <tr key={a.id} className={a.is_active === false ? "zeile--inaktiv" : undefined}>
                  <td className="stark">{a.article_number}
                    {a.is_active === false && <> <span className="klein">ausgeblendet</span></>}
                    {a.description && <div className="klein artikel__beschreibung">{a.description}</div>}
                  </td>
                  <td>{a.name}
                    {a.unit && a.unit !== "Stück" && <div className="klein">{a.unit}</div>}</td>
                  <td className="klein">{a.supplier_name
                    ? (a.supplier_website
                        ? <a className="lieferantlink" href={a.supplier_website} target="_blank"
                            rel="noopener">{a.supplier_name} ↗</a>
                        : a.supplier_name)
                    : "–"}</td>
                  {schreiben &&
                    <td className="rechts nowrap">
                      <button className="linkknopf" data-arbearb={a.id}
                        onClick={() => alt.artikelBearbeiten(a, behaelter)}>Bearbeiten</button>
                      <button className="linkknopf linkknopf--gefahr" data-arweg={a.id}
                        data-nr={a.article_number} onClick={() => loeschen(a, behaelter)}>Löschen</button>
                    </td>}
                </tr>
              ))}
            </tbody>
          </table>
        : <p className="hinweis">{sucht ? "Kein Artikel gefunden." : "Noch keine Artikel angelegt."}</p>}
    </section>
  );
}

async function loeschen(a, behaelter) {
  const ok = await alt.nachfragen({
    titel: "Artikel löschen",
    text: '"' + a.article_number + '" wird gelöscht. Bestellpositionen, die '
        + "daran hängen, verschwinden mit.",
    bestaetigen: "Löschen", gefahr: true });
  if (!ok) return;

  // Erst die Abhängigkeiten, dann den Artikel. So klappt es immer.
  const db = alt.db;
  await db.from("order_items").delete().eq("article_id", a.id);
  const r = await db.from("articles").delete().eq("id", a.id).select();

  if (r.error) alt.meldung(alt.fehlertext(r.error), "fehler");
  else if ((r.data || []).length === 0)
    alt.meldung("Nichts gelöscht. Vermutlich fehlen die Rechte in der Datenbank.", "fehler");
  else alt.meldung("Artikel gelöscht.");
  alt.seiteBestellungen(behaelter);
}
