// =================================================================
//  BESTELLUNGEN · Reiter „Spezialwerkzeuge“ (seit 1.131.0, Wunsch
//  Patrick 21. Oktober 2026)
//  Alle Spezialwerkzeuge nach HOCO Nr. Ein Spezialwerkzeug ist ein
//  normaler Artikel mit Lieferant; nachbestellt wird wie jede andere
//  Position. Zuordnen und Fenster in src/teile/Spezialwerkzeuge.jsx.
// =================================================================
import { alt, useDaten, useVerzoegert, useSpeicherWert } from "../../bruecke.jsx";
import { spezialLaden, spezialEntfernen, fehltTabelle, FEHLT_TEXT } from "../../daten/spezialwerkzeuge.js";
import { zuordnenOeffnen, nachbestellen, SpezialZeile } from "../../teile/Spezialwerkzeuge.jsx";
import { Leiste, NeuKnopf, Karte, Leer, Laedt } from "./teile.jsx";

export default function Spezialwerkzeuge({ auffrischen, behaelter }) {
  const best = alt.best;
  const [suche, setSuche] = useSpeicherWert(best, "spezialSuche", auffrischen);
  const ruhig = useVerzoegert(suche, 200);
  const schreiben = alt.darfSchreiben();
  const neu = () => alt.seiteBestellungen(behaelter);

  const { daten: liste, fehler } = useDaten(() => spezialLaden(), [auffrischen]);

  const t = ruhig.trim().toLowerCase();
  const gefiltert = liste && liste.filter((z) => !t || [z.hoco_nr, z.artikel.article_number, z.artikel.name,
    z.artikel.supplier_name, z.notiz].some((x) => String(x || "").toLowerCase().includes(t)));
  // Nach HOCO Nr. gruppiert, wie man sie im Auftrag sucht
  const gruppen = [];
  (gefiltert || []).forEach((z) => {
    const g = gruppen[gruppen.length - 1];
    if (g && g.hoco === z.hoco_nr) g.zeilen.push(z); else gruppen.push({ hoco: z.hoco_nr, zeilen: [z] });
  });

  const entfernen = async (z) => {
    const ja = await alt.nachfragen({ titel: "Spezialwerkzeug entfernen",
      text: "„" + z.artikel.article_number + "“ gehört dann nicht mehr zu " + z.hoco_nr
        + ". Der Artikel selbst bleibt.", bestaetigen: "Entfernen", gefahr: true });
    if (!ja) return;
    try { await spezialEntfernen(z); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    neu();
  };

  return (
    <>
      <Leiste suchId="sw-suche" suche={suche} setSuche={setSuche}
        platzhalter="HOCO Nr., Artikelnummer, Bezeichnung oder Lieferant"
        knopf={schreiben && <NeuKnopf id="sw-neu" text="Spezialwerkzeug zuordnen"
          onClick={() => zuordnenOeffnen(/^\d{5}-\d{4}$/.test(suche.trim()) ? suche.trim() : "", neu)} />} />
      <div id="sw-liste">
        {fehler && !liste
          ? <p className="fehlertext">{fehltTabelle(fehler) ? FEHLT_TEXT : alt.fehlertext(fehler)}</p>
          : !gefiltert
            ? <Laedt />
            : !gruppen.length
              ? <Leer text={t ? "Nichts gefunden." : "Noch keine Spezialwerkzeuge zugeordnet. Mit „Spezialwerkzeug zuordnen“ einen Artikel einer HOCO Nr. zuordnen."} />
              : gruppen.map((g) => (
                  <Karte key={g.hoco} titel={g.hoco} zahl={g.zeilen.length} className="spezial-karte"
                    aktionen={schreiben && <button className="knopf knopf--klein" data-sw-plus={g.hoco}
                      onClick={() => zuordnenOeffnen(g.hoco, neu)}>+ Werkzeug</button>}>
                    <ul className="spezial__liste">
                      {g.zeilen.map((z) => <SpezialZeile key={z.id} z={z} schreiben={schreiben}
                        bestellen={() => nachbestellen(z, null, neu)} entfernen={() => entfernen(z)} />)}
                    </ul>
                  </Karte>))}
      </div>
    </>
  );
}
