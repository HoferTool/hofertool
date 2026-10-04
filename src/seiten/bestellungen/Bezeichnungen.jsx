// =================================================================
//  BESTELLUNGEN · Reiter „Bezeichnungen“
//  Die Liste, die beim Anlegen und Bearbeiten von Artikeln erscheint.
//  Als Zeilen wie die Lieferanten, ohne Bild (Wunsch 4. Oktober 2026).
// =================================================================
import { alt, useDaten, useSpeicherWert } from "../../bruecke.jsx";
import { passt } from "../../teile/Suchfeld.jsx";
import { Leiste, NeuKnopf, Karte, Symbolknopf, Leer, Laedt, Fehler } from "./teile.jsx";

export default function Bezeichnungen({ auffrischen }) {
  const best = alt.best;
  const [suche, setSuche] = useSpeicherWert(best, "bezSuche", auffrischen);
  const schreiben = alt.darfSchreiben();
  const { daten: liste, fehler, neu } = useDaten(() => alt.ladeBezeichnungen(), [auffrischen]);
  const gefiltert = liste && liste.filter((z) => passt(suche, [z.name]));

  return (
    <>
      <Leiste suchId="bz-suche" suche={suche} setSuche={setSuche} platzhalter="Bezeichnung suchen"
        knopf={schreiben && <NeuKnopf id="bz-neu" text="Neue Bezeichnung"
          onClick={() => bezeichnungDialog(null, neu)} />} />
      <div id="bz-liste">
        {fehler && !liste
          ? <Fehler fehler={fehler} />
          : !gefiltert
            ? <Laedt />
            : <Karte titel="Bezeichnungen" zahl={gefiltert.length}
                unter="Diese Liste erscheint beim Anlegen und Bearbeiten von Artikeln. So heisst dasselbe Werkzeug überall gleich.">
                {gefiltert.length
                  ? <div className="bs-liefliste">
                      {gefiltert.map((z) => (
                        <div key={z.id} className="bs-lief bs-lief--ohnebild">
                          <div className="bs-lief__text"><div className="bs-lief__name">{z.name}</div></div>
                          {schreiben &&
                            <div className="bs-pos__aktionen">
                              <Symbolknopf zeichen="stift" text="Bearbeiten" data-bzb={z.id}
                                onClick={() => bezeichnungDialog(z, neu)} />
                              <Symbolknopf zeichen="muell" text="Löschen" gefahr data-bzw={z.id}
                                data-name={z.name} onClick={() => loeschen(z, neu)} />
                            </div>}
                        </div>
                      ))}
                    </div>
                  : <Leer text={suche.trim()
                      ? 'Nichts gefunden zu "' + suche + '".' : "Noch keine Bezeichnung angelegt."} />}
              </Karte>}
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
