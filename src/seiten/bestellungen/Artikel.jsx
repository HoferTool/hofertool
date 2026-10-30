// =================================================================
//  BESTELLUNGEN · Reiter „Artikel“
//  Suche fragt die Datenbank, kurz nachdem man aufgehört hat zu
//  tippen. Filter nach Bezeichnung und Lieferant als Auswahllisten.
// =================================================================
import { useState, useEffect } from "react";
import { alt, useDaten, useVerzoegert, useSpeicherWert } from "../../bruecke.jsx";
import { artikelZuweisenOeffnen } from "../../teile/Spezialwerkzeuge.jsx";
import { spezialPdfsLaden } from "../../daten/spezialwerkzeuge.js";
import { Leiste, NeuKnopf, Karte, Symbolknopf, Zeichen, Leer, Laedt, Fehler, Stern } from "./teile.jsx";

// Alle Artikel zusammen, Spezialwerkzeuge mit Kennzeichen (seit 1.271.0,
// Wunsch Patrick 29. Oktober 2026; 1.142.0 bis 1.270.x ein eigener Bereich)
export default function Artikel({ auffrischen, behaelter }) {
  const best = alt.best;
  const [suche, setSuche] = useSpeicherWert(best, "artikelSuche", auffrischen);
  const [bez, setBez] = useSpeicherWert(best, "artikelBez", auffrischen);
  const [lief, setLief] = useSpeicherWert(best, "artikelLief", auffrischen);
  const ruhig = useVerzoegert(suche, 300);
  const schreiben = alt.darfSchreiben();

  // Je 50 mehr mit „Mehr laden“; neue Suche oder Filter fängt wieder bei 50 an
  const [anzahl, setAnzahl] = useState(50);
  useEffect(() => { setAnzahl(50); }, [ruhig, bez, lief]);
  const { daten: liste, fehler } = useDaten(() => alt.sucheArtikel(ruhig, { bez, lief, anzahl }),
    [ruhig, bez, lief, anzahl, auffrischen]);
  // Wie viele Artikel es gibt (mit Suche und Filter: wie viele passen),
  // Wunsch Patrick 30. Oktober 2026; ohne Zahl geht es auch
  const { daten: gesamt } = useDaten(
    () => alt.sucheArtikel(ruhig, { bez, lief, zaehlen: true }).catch(() => null),
    [ruhig, bez, lief, auffrischen]);
  // Bezeichnungen und Lieferanten für die Filter; sie sind Beiwerk, ohne geht es auch
  const { daten: bezeichnungen } = useDaten(
    () => alt.ladeBezeichnungen().catch(() => []), [auffrischen]);
  const { daten: lieferanten } = useDaten(
    () => alt.ladeLieferanten().catch(() => []), [auffrischen]);
  // Zu welcher HOCO Nr. ein Spezialwerkzeug gehört (Tabelle spezialwerkzeuge,
  // Wunsch Patrick 30. Oktober 2026); ohne Tabelle bleibt die Spalte leer
  const { daten: hocoJe } = useDaten(() => hocoJeArtikel(), [auffrischen]);

  // Auch hier filtern, falls die Datenbank den Filter nicht kennt
  const gefiltert = liste && liste.filter((a) =>
    (!bez || a.name === bez) && (!lief || a.supplier_name === lief));

  return (
    <>
      <Leiste suchId="ar-suche" suche={suche} setSuche={setSuche}
        platzhalter="Nummer, Bezeichnung, Lieferant oder HOCO Nr. suchen"
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
        knopf={schreiben && <NeuKnopf id="ar-neu" text="Neuer Artikel" onClick={async () => {
          const a = await alt.artikelSchnellAnlegen("", null);
          if (a) alt.seiteBestellungen(behaelter);
        }} />} />
      <div id="ar-liste">
        {fehler && !liste
          ? <Fehler fehler={fehler} />
          : !gefiltert
            ? <Laedt />
            : <Liste liste={gefiltert} sucht={!!suche || !!bez || !!lief} schreiben={schreiben}
                behaelter={behaelter} anzahl={anzahl} gesamt={gesamt} hocoJe={hocoJe || {}} auffrischen={auffrischen}
                mehr={() => setAnzahl((n) => n + 50)} />}
      </div>
    </>
  );
}

// Frisch geholt, damit eine neue Zuordnung gleich dasteht
const hocoJeArtikel = () => alt.hocoJeArtikel(true);

function Liste({ liste, sucht, schreiben, behaelter, anzahl, gesamt, mehr, hocoJe, auffrischen }) {
  // PDFs der sichtbaren Artikel (seit 1.290.0); ohne Tabelle keine
  const ids = liste.map((a) => a.id);
  const { daten: pdfJe } = useDaten(() => spezialPdfsLaden(ids), [ids.join(","), auffrischen]);
  const zuweisen = (a) => artikelZuweisenOeffnen(a, () => alt.seiteBestellungen(behaelter));
  if (!liste.length) return <Leer text={sucht ? "Kein Artikel gefunden." : "Noch keine Artikel angelegt."} />;
  const genau = liste.filter((a) => !a.aehnlich).length;
  const bekannt = typeof gesamt === "number";
  // Mehr gibt es, wenn die Zahl grösser ist, oder ohne Zahl, wenn die Seite voll war
  const nochMehr = bekannt ? genau < gesamt : genau >= anzahl;
  return (
    <Karte titel="Artikel" zahl={bekannt ? alt.zahlText(gesamt) : liste.length}
      unter={bekannt
        ? (genau < gesamt ? alt.zahlText(genau) + " von " + alt.zahlText(gesamt) + " geladen" : undefined)
        : (nochMehr ? "Die ersten " + alt.zahlText(genau) + "." : undefined)}>
      {/* Wieder als Liste (Wunsch Patrick, 6. Oktober 2026: „Artikel wieder zu
          einer Liste“): je Artikel eine Zeile, Spalten Nummer, Bezeichnung,
          Lieferant. So lässt sich die Spalte mit dem Auge herunterlesen. */}
      <div className="bs-tabelle bs-tabelle--artikel">
        <div className="bs-tabelle__kopf">
          <span>Artikelnummer</span><span>Bezeichnung</span><span>Lieferant</span><span>HOCO Nr.</span><span />
        </div>
        {liste.map((a) => (
          <div key={a.id} className={"bs-tabelle__zeile bs-artikel" + (a.is_active === false ? " bs-inaktiv" : "")}>
            <div className="bs-artikel__nr">
              <span className="bs-pos__nr">{a.article_number}</span>
              {a.is_active === false && <span className="bs-chip bs-chip--still">ausgeblendet</span>}
              {a.aehnlich && <span className="bs-aehnlich">ähnlich</span>}
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
              : "–"}<Stern an={a.spezial} /></div>
            {/* HOCO Nr. und PDFs für jeden Artikel (seit 1.290.0, Wunsch Patrick
                30. Oktober 2026: „auch bei Bestellen zuweisen können“): antippen
                öffnet das Fenster zum Zuordnen und Hinterlegen */}
            <div className="bs-artikel__hoco" data-arhoco={a.id}>
              {(hocoJe[a.id] || []).map((h) => <span key={h} className="bs-artikel__hoco-nr">{h}</span>)}
              {((pdfJe || {})[a.id] || []).length > 0 && <span className="bs-artikel__pdfzahl" data-arpdfzahl={a.id}
                title="Hinterlegte PDFs">📄 {pdfJe[a.id].length}</span>}
              {(schreiben || (hocoJe[a.id] || []).length || ((pdfJe || {})[a.id] || []).length)
                ? <button type="button" className="linkknopf bs-artikel__zuweisen" data-arzuweisen={a.id}
                    onClick={() => zuweisen(a)}>
                    {schreiben ? ((hocoJe[a.id] || []).length || ((pdfJe || {})[a.id] || []).length ? "ändern" : "+ zuweisen") : "ansehen"}
                  </button>
                : null}
            </div>
            <span className="bs-pos__aktionen">
              {schreiben && <>
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
      {nochMehr && (
        <div className="bs-mehr">
          <button type="button" className="knopf" id="ar-mehr" onClick={mehr}>
            Mehr laden ({bekannt ? alt.zahlText(Math.min(50, gesamt - genau)) : 50} weitere)
          </button>
        </div>
      )}
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
