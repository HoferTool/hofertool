// =================================================================
//  BESTELLUNGEN · Reiter „Lieferanten“
//  Das Fenster zum Anpassen (Adresse, Bestellweg, Mail) ist noch im
//  alten Programm: lieferantDialog.
// =================================================================
import { alt, useDaten, useSpeicherWert } from "../../bruecke.jsx";
import { passt } from "../../teile/Suchfeld.jsx";
import { Leiste, NeuKnopf, Karte, Logo, Symbolknopf, Zeichen, Leer, Laedt, Fehler } from "./teile.jsx";
import { logoOeffnen } from "./LogoFenster.jsx";

export default function Lieferanten({ auffrischen, behaelter }) {
  const best = alt.best;
  const [suche, setSuche] = useSpeicherWert(best, "liefSuche", auffrischen);
  const schreiben = alt.darfSchreiben();
  const { daten: liste, fehler, neu } = useDaten(() => alt.ladeLieferanten(), [auffrischen]);

  const leiste = <Leiste suchId="lf-suche" suche={suche} setSuche={setSuche}
    platzhalter="Lieferant suchen"
    knopf={schreiben && <NeuKnopf id="lf-neu" text="Neuer Lieferant"
      onClick={() => alt.lieferantDialog(null, behaelter)} />} />;
  if (fehler && !liste) return <>{leiste}<Fehler fehler={fehler} /></>;
  if (!liste) return <>{leiste}<Laedt /></>;
  const gefiltert = liste.filter((l) => passt(suche, [l.name, l.email, l.adresse]));

  return (
    <>
      {leiste}
      <Karte titel="Lieferanten" zahl={gefiltert.length}>
        {gefiltert.length
          ? <div className="bs-liefliste">
              {gefiltert.map((l) => (
                <div key={l.id} className="bs-lief">
                  {/* Tipp aufs Logo: automatisch, eigenes Bild oder keins */}
                  <Logo lief={l} name={l.name} onClick={schreiben ? () => logoOeffnen(l, neu) : undefined} />
                  <div className="bs-lief__text">
                    <div className="bs-lief__name">{l.website
                      ? <a className="lieferantlink" href={l.website} target="_blank" rel="noopener">
                          {l.name}<Zeichen name="aussen" groesse={13} /></a>
                      : l.name}</div>
                    <div className="bs-lief__info">
                      {l.email && <a href={"mailto:" + l.email}><Zeichen name="mail" groesse={13} />{l.email}</a>}
                      {l.adresse && <span>{String(l.adresse).replace(/\s*\n\s*/g, ", ")}</span>}
                    </div>
                  </div>
                  <span className={"bs-chip " + (l.bestellweg === "mail" ? "bs-chip--mail" : "bs-chip--still")}>
                    {l.bestellweg === "mail" ? "Bestellung per Mail" : "Über Website"}</span>
                  {schreiben &&
                    <div className="bs-pos__aktionen">
                      <Symbolknopf zeichen="stift" text="Anpassen" data-lf={l.id}
                        onClick={() => alt.lieferantDialog(l, behaelter)} />
                      <Symbolknopf zeichen="muell" text="Löschen" gefahr data-lfweg={l.id}
                        data-name={l.name} onClick={() => loeschen(l, behaelter)} />
                    </div>}
                </div>
              ))}
            </div>
          : <Leer text={suche.trim()
              ? 'Nichts gefunden zu "' + suche + '".' : "Noch keine Lieferanten angelegt."} />}
      </Karte>
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
  const vorher = await alt.rueckSichern("suppliers", { id: l.id });
  const artikel = (await alt.rueckSichern("articles", { supplier_id: l.id })).map((x) => x.id);
  const positionen = (await alt.rueckSichern("order_items", { supplier_id: l.id })).map((x) => x.id);
  await db.from("articles").update({ supplier_id: null }).eq("supplier_id", l.id);
  await db.from("order_items").update({ supplier_id: null }).eq("supplier_id", l.id);

  const r = await db.from("suppliers").delete().eq("id", l.id).select();
  if (r.error) alt.meldung(alt.fehlertext(r.error), "fehler");
  else if ((r.data || []).length === 0)
    alt.meldung("Nichts gelöscht. Vermutlich fehlen die Rechte in der Datenbank.", "fehler");
  else {
    // Zurück: erst der Lieferant, dann die Verweise wieder auf ihn
    alt.merkeSchritt("Löschen von " + l.name, [alt.rueckRein("suppliers", vorher)]
      .concat([alt.rueckSetz("articles", { supplier_id: l.id }, { id: artikel }),
        alt.rueckSetz("order_items", { supplier_id: l.id }, { id: positionen })]));
    alt.meldung("Lieferant gelöscht.");
  }
  alt.seiteBestellungen(behaelter);
}
