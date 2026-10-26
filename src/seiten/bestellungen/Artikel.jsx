// =================================================================
//  BESTELLUNGEN · Reiter „Artikel“
//  Suche fragt die Datenbank, kurz nachdem man aufgehört hat zu
//  tippen. Filter nach Bezeichnung und Lieferant als Auswahllisten.
// =================================================================
import { alt, useDaten, useVerzoegert, useSpeicherWert } from "../../bruecke.jsx";
import { artikelFotosOeffnen } from "./ArtikelFotos.jsx";
import { Leiste, NeuKnopf, Karte, Symbolknopf, Zeichen, Leer, Laedt, Fehler } from "./teile.jsx";

// spezial: nur die Spezialwerkzeuge, sonst nur die normalen Artikel (seit 1.142.0)
export default function Artikel({ auffrischen, behaelter, spezial }) {
  const best = alt.best;
  const [suche, setSuche] = useSpeicherWert(best, spezial ? "spezialArtikelSuche" : "artikelSuche", auffrischen);
  const [bez, setBez] = useSpeicherWert(best, spezial ? "spezialArtikelBez" : "artikelBez", auffrischen);
  const [lief, setLief] = useSpeicherWert(best, spezial ? "spezialArtikelLief" : "artikelLief", auffrischen);
  const ruhig = useVerzoegert(suche, 300);
  const schreiben = alt.darfSchreiben();

  const { daten: liste, fehler } = useDaten(() => alt.sucheArtikel(ruhig, { bez, lief, spezial: !!spezial }),
    [ruhig, bez, lief, auffrischen, spezial]);
  // Bezeichnungen und Lieferanten für die Filter; sie sind Beiwerk, ohne geht es auch
  const { daten: bezeichnungen } = useDaten(
    () => alt.ladeBezeichnungen().catch(() => []), [auffrischen]);
  const { daten: lieferanten } = useDaten(
    () => alt.ladeLieferanten().catch(() => []), [auffrischen]);

  // Auch hier filtern, falls die Datenbank den Filter nicht kennt
  const gefiltert = liste && liste.filter((a) =>
    (!bez || a.name === bez) && (!lief || a.supplier_name === lief));

  return (
    <>
      <Leiste suchId="ar-suche" suche={suche} setSuche={setSuche}
        platzhalter="Nummer, Bezeichnung oder Lieferant suchen"
        filter={<>
          <select id="ar-bez" className="auswahl bs-filter" value={bez} aria-label="Bezeichnung"
            onChange={(e) => { setBez(e.target.value); }}>
            <option value="">Alle Bezeichnungen</option>
            {(bezeichnungen || []).map((z) => <option key={z.name} value={z.name}>{z.name}</option>)}
            {/* Gewählt, aber (noch) nicht geladen: trotzdem anzeigen */}
            {bez && !(bezeichnungen || []).some((z) => z.name === bez) &&
              <option value={bez}>{bez}</option>}
          </select>
          <select id="ar-lief" className="auswahl bs-filter" value={lief} aria-label="Lieferant"
            onChange={(e) => { setLief(e.target.value); }}>
            <option value="">Alle Lieferanten</option>
            {(lieferanten || []).map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
            {lief && !(lieferanten || []).some((l) => l.name === lief) &&
              <option value={lief}>{lief}</option>}
          </select>
        </>}
        knopf={schreiben && <NeuKnopf id="ar-neu" text={spezial ? "Neues Spezialwerkzeug" : "Neuer Artikel"} onClick={async () => {
          const a = await alt.artikelSchnellAnlegen("", null, !!spezial);
          if (a) alt.seiteBestellungen(behaelter);
        }} />} />
      <div id="ar-liste">
        {fehler && !liste
          ? <Fehler fehler={fehler} />
          : !gefiltert
            ? <Laedt />
            : <Liste spezial={spezial} liste={gefiltert} sucht={!!suche || !!bez || !!lief} schreiben={schreiben} behaelter={behaelter} />}
      </div>
    </>
  );
}

function Liste({ liste, sucht, schreiben, behaelter, spezial }) {
  if (!liste.length) return <Leer text={sucht ? "Kein Artikel gefunden." : (spezial ? "Noch keine Spezialwerkzeuge angelegt." : "Noch keine Artikel angelegt.")} />;
  return (
    <Karte titel={spezial ? "Spezialwerkzeuge" : "Artikel"} zahl={liste.length}
      unter={liste.length >= 50 ? "Die ersten 50. Mit der Suche findest du jeden." : undefined}>
      {/* Wieder als Liste (Wunsch Patrick, 6. Oktober 2026: „Artikel wieder zu
          einer Liste“): je Artikel eine Zeile, Spalten Nummer, Bezeichnung,
          Lieferant. So lässt sich die Spalte mit dem Auge herunterlesen. */}
      <div className="bs-tabelle bs-tabelle--artikel">
        <div className="bs-tabelle__kopf">
          <span>Artikelnummer</span><span>Bezeichnung</span><span>Lieferant</span><span />
        </div>
        {liste.map((a) => (
          <div key={a.id} className={"bs-tabelle__zeile bs-artikel" + (a.is_active === false ? " bs-inaktiv" : "")}>
            <div className="bs-artikel__nr">
              <span className="bs-pos__nr">{a.article_number}</span>
              {a.is_active === false && <span className="bs-chip bs-chip--still">ausgeblendet</span>}
            </div>
            <div className="bs-artikel__text">
              <div className="bs-artikel__name">{a.name}
                {a.unit && a.unit !== "Stück" && <span className="bs-einheit">{a.unit}</span>}</div>
              {a.description && <div className="bs-pos__beschreibung">{a.description}</div>}
            </div>
            <div className="bs-artikel__lief">{a.supplier_name
              ? (a.supplier_website
                  ? <a className="lieferantlink" href={a.supplier_website} target="_blank"
                      rel="noopener">{a.supplier_name}<Zeichen name="aussen" groesse={12} /></a>
                  : a.supplier_name)
              : "–"}</div>
            <span className="bs-pos__aktionen">
              {schreiben && <>
                {/* Verpackung fotografieren, damit das Foto bei der neuen
                    Bestellposition den Artikel findet (seit 1.109.0) */}
                <Symbolknopf zeichen="kamera" data-arfoto={a.id}
                  text={a.foto_anzahl ? "Verpackung: " + a.foto_anzahl + " Fotos gelernt" : "Verpackung lernen"}
                  onClick={() => artikelFotosOeffnen(a, () => alt.seiteBestellungen(behaelter))} />
                {a.foto_anzahl > 0 && <span className="af-zahl" title="Gelernte Fotos der Verpackung">{a.foto_anzahl}</span>}
                <Symbolknopf zeichen="stift" text="Bearbeiten" data-arbearb={a.id}
                  onClick={() => alt.artikelBearbeiten(a, behaelter)} />
                {/* Kopieren: alles ausgefüllt, nur ändern, was anders ist
                    (Wunsch Patrick 26. Oktober 2026) */}
                <Symbolknopf zeichen="kopie" text="Kopieren" data-arkopie={a.id}
                  onClick={() => alt.artikelBearbeiten(a, behaelter, true)} />
                <Symbolknopf zeichen="muell" text="Löschen" gefahr data-arweg={a.id}
                  data-nr={a.article_number} onClick={() => loeschen(a, behaelter)} />
              </>}
            </span>
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
  const vorherArtikel = await alt.rueckSichern("articles", { id: a.id });
  const vorherPos = await alt.rueckSichern("order_items", { article_id: a.id });
  await db.from("order_items").delete().eq("article_id", a.id);
  const r = await db.from("articles").delete().eq("id", a.id).select();

  if (r.error) alt.meldung(alt.fehlertext(r.error), "fehler");
  else if ((r.data || []).length === 0)
    alt.meldung("Nichts gelöscht. Vermutlich fehlen die Rechte in der Datenbank.", "fehler");
  else {
    // Zurück erst der Artikel, dann die Positionen: sie zeigen auf ihn
    alt.merkeSchritt("Löschen von " + a.article_number, [
      alt.rueckRein("articles", vorherArtikel), alt.rueckRein("order_items", vorherPos)]);
    alt.meldung("Artikel gelöscht.");
  }
  alt.seiteBestellungen(behaelter);
}
