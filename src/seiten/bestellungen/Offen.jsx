// =================================================================
//  BESTELLUNGEN · Reiter „Offen“ und „Bestellt“
//  Positionen nach Lieferant gruppiert. In „Offen“ steht nur wirklich
//  Offenes; was bestellt oder teilweise geliefert ist, steht in
//  „Bestellt“. Die Suche filtert sofort, ohne neu zu laden.
// =================================================================
import { alt, useDaten, useSpeicherWert } from "../../bruecke.jsx";

const BLOECKE = {
  bestellt: [{ status: "bestellt", titel: "Bestellt" },
             { status: "teilweise_geliefert", titel: "Teilweise geliefert" }],
  offen: [{ status: "offen", titel: "Offen" }],
};

// Massgeblich ist der Lieferant, der heute am Artikel steht. Die
// Position selbst merkt sich den vom Tag der Erfassung — sonst bliebe
// sie nach einem Wechsel beim alten hängen.
const lieferantVon = (z) => (z.articles && z.articles.suppliers) || z.suppliers || null;

const mehrzahl = (n) => n + (n === 1 ? " Position" : " Positionen");

export default function Offen({ bereich, auffrischen, behaelter }) {
  const best = alt.best;
  const [suche, setSuche] = useSpeicherWert(best, "offenSuche", auffrischen);
  const { daten: liste, fehler, neu } = useDaten(() => {
    // Nach jeder Änderung frisch holen, nicht aus dem Gedächtnis
    alt.stammVergessen();
    return alt.ladeBestellungen(true);
  }, [auffrischen]);

  if (fehler && !liste) {
    return <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>;
  }
  if (!liste) return <div className="laedt">Wird geladen …</div>;

  const schreiben = alt.darfSchreiben();
  const sucht = suche.trim().toLowerCase();
  const gefiltert = !sucht ? liste : liste.filter((z) => {
    const a2 = z.articles || {};
    return [a2.article_number, a2.name, (z.suppliers && z.suppliers.name),
            z.note, z.ziel_text, alt.personName(z.profiles, "")]
      .map((x) => String(x || "").toLowerCase()).join(" ").includes(sucht);
  });

  return (
    <>
      <div className="suchleiste">
        <input type="search" id="bo-suche" placeholder="Suchen" value={suche}
          autoComplete="off" autoFocus={!!suche}
          onChange={(e) => { setSuche(e.target.value); }} />
      </div>
      {/* Neue Positionen entstehen im Reiter Offen. In Bestellt und
          Teilweise geliefert wäre der Knopf nur verwirrend. */}
      {schreiben && bereich === "offen" &&
        <button className="knopf knopf--haupt knopf--breit" id="b-neu"
          onClick={() => alt.positionDialog(behaelter)}>+ Neue Position</button>}

      {BLOECKE[bereich].map((bl) => (
        <Block key={bl.status} block={bl} posten={gefiltert.filter((z) => z.status === bl.status)}
          schreiben={schreiben} neu={neu} behaelter={behaelter} />
      ))}

      {!gefiltert.length &&
        <div className="karte karte--hinweis">
          <p>{sucht ? 'Nichts gefunden zu "' + suche + '".' : "Keine offenen Bestellpositionen."}</p>
        </div>}
    </>
  );
}

function Block({ block, posten, schreiben, neu, behaelter }) {
  if (!posten.length) return null;

  // Innerhalb des Blocks nach Lieferant gruppieren
  const gruppen = {};
  posten.forEach((z) => {
    const lief = lieferantVon(z);
    const name = (lief && lief.name) || "Ohne Lieferant";
    (gruppen[name] = gruppen[name] || { lief: null, website: null, posten: [] }).posten.push(z);
    if (lief && lief.website) gruppen[name].website = lief.website;
    if (lief && lief.bestellweg === "mail") gruppen[name].lief = lief;
  });

  return (
    <>
      <h2 className="blocktitel">{block.titel} <span className="marke">{posten.length}</span></h2>
      {Object.keys(gruppen).sort().map((name) => (
        <Lieferant key={name} name={name} gruppe={gruppen[name]} block={block.status}
          schreiben={schreiben} neu={neu} behaelter={behaelter} />
      ))}
    </>
  );
}

function Lieferant({ name, gruppe, block, schreiben, neu, behaelter }) {
  // Alle Positionen dieses Lieferanten auf einmal umstellen
  const sammelstatus = async () => {
    const posten = gruppe.posten;
    const wahl = await alt.auswahlDialog(mehrzahl(posten.length) + " von " + name,
      Object.keys(alt.BESTELLSTATUS).filter((w) => w !== block)
        .map((w) => ({ wert: w, text: alt.BESTELLSTATUS[w] })));
    if (!wahl) return;
    const ok = await alt.nachfragen({ titel: "Status für alle ändern",
      text: "Sollen alle " + posten.length + " Positionen von " + name
          + " auf \"" + (alt.BESTELLSTATUS[wahl] || wahl) + "\" gesetzt werden?",
      bestaetigen: "Ja, alle ändern" });
    if (!ok) return;

    let error = null;
    try {
      await alt.parallelSenden(posten.map((z) => () =>
        alt.aendernOhneUnbekannte("order_items", alt.statusDaten(wahl, z.status), "id", z.id)));
    } catch (f) { error = f; }
    if (error) alt.meldung(alt.fehlertext(error), "fehler");
    else { alt.meldung(mehrzahl(posten.length) + " geändert."); neu(); }
  };

  return (
    <section className="karte">
      <div className="karte__kopf">
        <h2>{gruppe.website
          ? <a className="lieferantlink" href={gruppe.website} target="_blank" rel="noopener">{name} ↗</a>
          : name}</h2>
        <div className="karte__kopfrechts">
          {/* Aufs PDF kommt genau, was in dieser Karte steht */}
          {gruppe.lief &&
            <button className="knopf knopf--klein" data-bestellpdf={name} data-block={block}
              onClick={() => alt.bestellungDrucken(gruppe.lief, gruppe.posten)}>PDF</button>}
          {schreiben &&
            <button className="knopf knopf--klein" data-sammelstatus={name} data-block={block}
              onClick={sammelstatus}>Status für alle</button>}
          <span className="klein">{mehrzahl(gruppe.posten.length)}</span>
        </div>
      </div>
      <table className="tabelle tabelle--bestellungen"><tbody>
        {gruppe.posten.map((z) => (
          <Zeile key={z.id} z={z} schreiben={schreiben} behaelter={behaelter} />
        ))}
      </tbody></table>
    </section>
  );
}

const KOPIERSYMBOL = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

function Zeile({ z, schreiben, behaelter }) {
  const a2 = z.articles || {};
  const heute = alt.isoDatum(new Date());
  const spaet = z.needed_by && z.needed_by < heute;
  const zeit = alt.statusZeit(z);

  const kopieren = async () => {
    const text = a2.article_number || "";
    if (!text) { alt.meldung("Nichts zu kopieren.", "warn"); return; }
    try { await navigator.clipboard.writeText(text); alt.meldung("Kopiert: " + text); }
    catch (f) { alt.meldung("Kopieren nicht möglich: " + text, "warn"); }
  };

  return (
    <tr className={spaet ? "bz-zeile--spaet" : undefined}>
      <td className="bz-artikel">
        <strong>{a2.article_number || "?"}</strong> {a2.name || ""}
        <button className="kopiersymbol" data-bkopie={a2.article_number || ""}
          title="Artikelnummer kopieren" onClick={kopieren}>{KOPIERSYMBOL}</button>
        {a2.description && <div className="klein bz-beschreibung">{a2.description}</div>}
        {/* Wohin die Ware nach dem Eintreffen soll — direkt am Artikel,
            damit man es beim Auspacken sofort sieht */}
        {z.ziel_text && <div className="bz-ziel">zu {alt.zielZeichen(z.ziel_art)} {z.ziel_text}</div>}
        <div className="klein">
          {z.needed_by && <span className={spaet ? "bz-spaet" : ""}>
            bis {alt.kurzDatum(z.needed_by)}{spaet ? " · überfällig" : ""}</span>}
          {z.note ? " · " + z.note : ""}
          {" · von " + alt.personName(z.profiles)}
        </div>
        {zeit && <div className="klein bz-zeit">{alt.statusZeitText(z)}</div>}
      </td>
      <td className="bz-menge stark">
        {alt.zahlText(z.quantity)}
        {z.status === "teilweise_geliefert" && !!z.geliefert_menge &&
          <div className="klein bz-teil">{alt.zahlText(z.geliefert_menge)} da ·{" "}
            {alt.zahlText(Math.max(0, z.quantity - z.geliefert_menge))} offen</div>}
      </td>
      {schreiben &&
        <td className="bz-aktionen">
          <button className="linkknopf" data-bearb-best={z.id}
            onClick={() => bearbeiten(z, behaelter)}>Bearbeiten</button>
          <button className="linkknopf" data-bstatus={z.id}
            onClick={() => alt.bestStatusDialog(z, behaelter)}>Status</button>
          <button className="linkknopf linkknopf--gefahr" data-bweg={z.id}
            data-nr={a2.article_number || ""} onClick={() => loeschen(z, behaelter)}>Löschen</button>
        </td>}
    </tr>
  );
}

// Bestellposition oder der Artikel selbst (Name, Nummer, Lieferant,
// Beschreibung) — beides ändert sich überall, wo er auftaucht.
async function bearbeiten(z, behaelter) {
  const best = alt.best;
  const wahl = await alt.auswahlDialog("Was bearbeiten?", [
    { wert: "position", text: "Diese Bestellung (Menge, Frist, Notiz)" },
    { wert: "artikel", text: "Der Artikel selbst (Name, Nummer, Lieferant, Beschreibung)" },
  ]);
  if (!wahl) return;
  if (wahl === "artikel") {
    await alt.artikelBearbeiten(z.articles ? { ...z.articles, id: z.article_id } : null, behaelter);
    return;
  }

  // Die Zuweisung steht als erstes Feld — sie ändert sich am
  // häufigsten, wenn eine Lieferung doch woanders hin soll.
  if (!(best.alleMaschinen || []).length) {
    try { best.alleMaschinen = await alt.ladeAlleMaschinen(); } catch (f) { /* ohne geht es auch */ }
  }
  const zielListe = [["lager::Lager", "Lager"]].concat(
    (best.alleMaschinen || []).map((m) => ["maschine::" + alt.maschineZielText(m),
      "Maschine: " + m.name + (m.machine_number ? " · " + m.machine_number : "")]));
  const jetzt = (z.ziel_art || "lager") + "::" + (z.ziel_text || "Lager");
  // Steht dort etwas anderes — eine Person oder freier Text —, bleibt
  // es als Möglichkeit erhalten, statt still zu verschwinden.
  if (!zielListe.some(([wert]) => wert === jetzt) && z.ziel_text) {
    zielListe.unshift([jetzt, z.ziel_text + "  (bisher)"]);
  }

  const w = await alt.dialogFelder({ titel: "Bestellung bearbeiten",
    felder: [
      { name: "ziel", label: "Zuweisung", auswahl: zielListe, wert: jetzt },
      { name: "menge", label: "Menge", typ: "number", wert: z.quantity, pflicht: true },
      { name: "frist", label: "Bis wann", typ: "date", wert: z.needed_by || "" },
      { name: "notiz", label: "Notiz", wert: z.note || "" },
    ], bestaetigen: "Speichern" });
  if (!w) return;

  const wert = String(w.ziel || jetzt);
  const trenn = wert.indexOf("::");
  const { error } = await alt.db.from("order_items").update({
    quantity: Math.max(1, Math.round(w.menge)),
    needed_by: w.frist || null,
    note: w.notiz || null,
    ziel_art: wert.slice(0, trenn),
    ziel_text: wert.slice(trenn + 2),
  }).eq("id", z.id);
  if (error) alt.meldung(alt.fehlertext(error), "fehler");
  else { alt.meldung("Gespeichert."); alt.seiteBestellungen(behaelter); }
}

async function loeschen(z, behaelter) {
  const nr = (z.articles && z.articles.article_number) || "";
  const ok = await alt.doppeltNachfragen(
    { titel: "Position löschen", text: "Soll die Position " + nr + " wirklich gelöscht werden?",
      bestaetigen: "Weiter zum Löschen", gefahr: true },
    { titel: "Wirklich endgültig löschen?", text: "Letzte Rückfrage. Danach ist die Position weg.",
      bestaetigen: "Endgültig löschen", gefahr: true });
  if (!ok) return;
  const db = alt.db;
  const sicherung = await db.from("order_items").select("*").eq("id", z.id).single();
  const { error } = await db.from("order_items").delete().eq("id", z.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  if (sicherung.data) alt.merkeSchritt("Löschen einer Bestellposition", async () => {
    await db.from("order_items").insert(sicherung.data);
    alt.seiteBestellungen(behaelter);
  });
  alt.meldung("Position gelöscht.");
  alt.seiteBestellungen(behaelter);
}
