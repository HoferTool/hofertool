// =================================================================
//  BESTELLUNGEN · Reiter „Historie“
//  Abgeschlossene Positionen, die zuletzt gelieferte zuoberst. Wer
//  aus Versehen auf geliefert gesetzt hat, kann es hier zurücksetzen.
// =================================================================
import { alt, useDaten, useSpeicherWert } from "../../bruecke.jsx";
import { passt } from "../../teile/Suchfeld.jsx";
import { Leiste, Karte, Status, Ziel, Leer, Laedt, Fehler } from "./teile.jsx";

const lieferzeit = (z) => String(z.delivered_at || z.completed_at || z.created_at || "");

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
                "August", "September", "Oktober", "November", "Dezember"];
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export default function Historie({ auffrischen, behaelter }) {
  const best = alt.best;
  const [suche, setSuche] = useSpeicherWert(best, "historieSuche", auffrischen);
  const { daten: liste, fehler } = useDaten(() => {
    alt.stammVergessen();
    return alt.ladeBestellungen(false);
  }, [auffrischen]);

  const leiste = <Leiste suchId="bh-suche" suche={suche} setSuche={setSuche}
    platzhalter="Artikel, Lieferant, Person oder Ziel suchen" />;
  if (fehler && !liste) return <>{leiste}<Fehler fehler={fehler} /></>;
  if (!liste) return <>{leiste}<Laedt /></>;

  const schreiben = alt.darfSchreiben();
  const fertige = liste.filter((z) => z.status === "geliefert")
    .sort((a, c) => lieferzeit(c).localeCompare(lieferzeit(a)))
    .filter((z) => {
      const a = z.articles || {};
      return passt(suche, [a.article_number, a.name, (z.suppliers && z.suppliers.name),
                           alt.personName(z.profiles, ""), z.ziel_text, z.ziel_anzeige]);
    });

  // Nach Monat der Lieferung gruppiert, der jüngste zuoberst
  const monate = [];
  fertige.forEach((z) => {
    const wann = alt.statusZeit(z);
    const d = wann ? new Date(wann) : null;
    const titel = d ? MONATE[d.getMonth()] + " " + d.getFullYear() : "Ohne Datum";
    let m = monate[monate.length - 1];
    if (!m || m.titel !== titel) monate.push(m = { titel, posten: [] });
    m.posten.push(z);
  });

  return (
    <>
      {leiste}
      {fertige.length
        ? monate.map((m) => (
            <Karte key={m.titel} titel={m.titel} zahl={m.posten.length} className="bs-monat">
              {/* Spalten über die ganze Breite statt links gequetscht und in
                  der Mitte leer (Wunsch Patrick, 6. Oktober 2026) */}
              <div className="bs-tabelle bs-tabelle--historie">
                <div className="bs-tabelle__kopf bs-hz">
                  <span>Geliefert</span><span>Artikel</span><span>Wohin</span>
                  <span>Lieferant</span><span>Bestellt von</span>
                  <span className="bs-hz__rechts">Menge</span><span>Status</span>
                </div>
                {m.posten.map((z) => (
                  <Zeile key={z.id} z={z} schreiben={schreiben} behaelter={behaelter} />
                ))}
              </div>
            </Karte>
          ))
        : <Leer text={suche.trim() ? 'Nichts gefunden zu "' + suche + '".' : "Noch nichts abgeschlossen."} />}
    </>
  );
}

function Zeile({ z, schreiben, behaelter }) {
  const a = z.articles || {};
  const wann = alt.statusZeit(z);
  const d = wann ? new Date(wann) : null;
  const einheit = a.unit && a.unit !== "Stück" ? a.unit : "Stk";
  const lieferant = (z.suppliers && z.suppliers.name) || "Ohne Lieferant";
  const wer = alt.personName(z.profiles, "–");
  return (
    <div className="bs-tabelle__zeile bs-hz">
      <div className="bs-hz__wann" title={wann ? alt.langDatum(wann.slice(0, 10)) : ""}>
        {d ? <><b>{WT[d.getDay()]} {d.getDate()}.{d.getMonth() + 1}.</b>
               <small>{alt.datumZeitKurz(wann).split(" ")[1] || ""}</small></>
           : <b>–</b>}
      </div>
      <div className="bs-hz__artikel">
        <span className="bs-pos__nr">{a.article_number || "?"}</span>
        {a.name && <span className="bs-pos__name">{a.name}</span>}
      </div>
      <div className="bs-hz__ziel"><Ziel art={z.ziel_art} text={z.ziel_anzeige || z.ziel_text} /></div>
      <div className="bs-hz__klein bs-hz__lief">{lieferant}</div>
      <div className="bs-hz__klein bs-hz__wer"><span className="bs-hz__vor">von </span>{wer}</div>
      <div className="bs-pos__menge bs-hz__menge"><b>{alt.zahlText(z.quantity)}</b><span>{einheit}</span></div>
      <div className="bs-pos__status">
        <Status z={z} data-hstatus={schreiben ? z.id : undefined}
          onClick={schreiben ? () => alt.bestStatusDialog(z, behaelter) : undefined} />
      </div>
    </div>
  );
}
