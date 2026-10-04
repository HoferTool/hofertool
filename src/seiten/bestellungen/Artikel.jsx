// =================================================================
//  BESTELLUNGEN · Reiter „Artikel“
//  Suche fragt die Datenbank, kurz nachdem man aufgehört hat zu
//  tippen. Der Filter nach Bezeichnung wirkt sofort.
// =================================================================
import { alt, useDaten, useVerzoegert, useSpeicherWert } from "../../bruecke.jsx";
import { Leiste, NeuKnopf, Karte, Symbolknopf, Zeichen, Leer, Laedt, Fehler } from "./teile.jsx";

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
      <Leiste suchId="ar-suche" suche={suche} setSuche={setSuche}
        platzhalter="Nummer, Bezeichnung oder Lieferant suchen"
        filter={
          <select id="ar-bez" className="auswahl bs-filter" value={bez} aria-label="Bezeichnung"
            onChange={(e) => { setBez(e.target.value); }}>
            <option value="">Alle Bezeichnungen</option>
            {(bezeichnungen || []).map((z) => <option key={z.name} value={z.name}>{z.name}</option>)}
            {/* Gewählt, aber (noch) nicht geladen: trotzdem anzeigen */}
            {bez && !(bezeichnungen || []).some((z) => z.name === bez) &&
              <option value={bez}>{bez}</option>}
          </select>}
        knopf={schreiben && <NeuKnopf id="ar-neu" text="Neuer Artikel" onClick={async () => {
          const a = await alt.artikelSchnellAnlegen("");
          if (a) alt.seiteBestellungen(behaelter);
        }} />} />
      <div id="ar-liste">
        {fehler && !liste
          ? <Fehler fehler={fehler} />
          : !gefiltert
            ? <Laedt />
            : <Liste liste={gefiltert} sucht={!!suche || !!bez} schreiben={schreiben} behaelter={behaelter} />}
      </div>
    </>
  );
}

function Liste({ liste, sucht, schreiben, behaelter }) {
  if (!liste.length) return <Leer text={sucht ? "Kein Artikel gefunden." : "Noch keine Artikel angelegt."} />;
  return (
    <Karte titel="Artikel" zahl={liste.length}
      unter={liste.length >= 50 ? "Die ersten 50. Mit der Suche findest du jeden." : undefined}>
      {/* Kacheln im Raster wie bei den Bezeichnungen (Wunsch 4. Oktober 2026) */}
      <div className="bs-raster bs-raster--artikel">
        {liste.map((a) => (
          <div key={a.id} className={"bs-raster__eintrag bs-artikel" + (a.is_active === false ? " bs-inaktiv" : "")}>
            <div className="bs-artikel__text">
              <div className="bs-artikel__nr">
                <span className="bs-pos__nr">{a.article_number}</span>
                {a.is_active === false && <span className="bs-chip bs-chip--still">ausgeblendet</span>}
              </div>
              <div className="bs-artikel__name">{a.name}
                {a.unit && a.unit !== "Stück" && <span className="bs-einheit">{a.unit}</span>}</div>
              {a.description && <div className="bs-pos__beschreibung">{a.description}</div>}
              {a.supplier_name &&
                <div className="bs-artikel__lief">{a.supplier_website
                  ? <a className="lieferantlink" href={a.supplier_website} target="_blank"
                      rel="noopener">{a.supplier_name}<Zeichen name="aussen" groesse={12} /></a>
                  : a.supplier_name}</div>}
            </div>
            {schreiben &&
              <span className="bs-pos__aktionen">
                <Symbolknopf zeichen="stift" text="Bearbeiten" data-arbearb={a.id}
                  onClick={() => alt.artikelBearbeiten(a, behaelter)} />
                <Symbolknopf zeichen="muell" text="Löschen" gefahr data-arweg={a.id}
                  data-nr={a.article_number} onClick={() => loeschen(a, behaelter)} />
              </span>}
          </div>
        ))}
      </div>
    </Karte>
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
