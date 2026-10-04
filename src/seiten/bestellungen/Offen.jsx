// =================================================================
//  BESTELLUNGEN · Reiter „Offen“ und „Bestellt“
//  Positionen nach Lieferant gruppiert. In „Offen“ steht nur wirklich
//  Offenes; was bestellt oder teilweise geliefert ist, steht in
//  „Bestellt“. Die Suche filtert sofort, ohne neu zu laden.
// =================================================================
import { alt, useDaten, useSpeicherWert } from "../../bruecke.jsx";
import { positionOeffnen } from "./PositionFenster.jsx";
import { Leiste, NeuKnopf, Karte, Logo, Status, Ziel, Zeichen, Symbolknopf,
  Leer, Laedt, Fehler, mehrzahl } from "./teile.jsx";

const BLOECKE = {
  bestellt: [{ status: "bestellt", titel: "Bestellt" },
             { status: "teilweise_geliefert", titel: "Teilweise geliefert" }],
  offen: [{ status: "offen", titel: "Offen" }],
};

// Massgeblich ist der Lieferant, der heute am Artikel steht. Die
// Position selbst merkt sich den vom Tag der Erfassung — sonst bliebe
// sie nach einem Wechsel beim alten hängen.
const lieferantVon = (z) => (z.articles && z.articles.suppliers) || z.suppliers || null;

const positionen = (n) => mehrzahl(n, "Position", "Positionen");

// Frist: überfällig rot, in den nächsten drei Tagen gelb, sonst ruhig
function fristArt(z, heute) {
  if (!z.needed_by) return null;
  if (z.needed_by < heute) return "spaet";
  if (z.needed_by <= alt.plusTage(heute, 3)) return "bald";
  return "normal";
}

export default function Offen({ bereich, auffrischen, behaelter }) {
  const best = alt.best;
  const [suche, setSuche] = useSpeicherWert(best, "offenSuche", auffrischen);
  const { daten: liste, fehler, neu } = useDaten(() => {
    // Nach jeder Änderung frisch holen, nicht aus dem Gedächtnis
    alt.stammVergessen();
    return alt.ladeBestellungen(true);
  }, [auffrischen]);

  const schreiben = alt.darfSchreiben();
  // Neue Positionen entstehen im Reiter Offen. In Bestellt und
  // Teilweise geliefert wäre der Knopf nur verwirrend.
  const leiste = (
    <Leiste suchId="bo-suche" suche={suche} setSuche={setSuche}
      platzhalter="Artikel, Lieferant oder Person suchen"
      knopf={schreiben && bereich === "offen" &&
        <NeuKnopf id="b-neu" text="Neue Position" onClick={() => positionOeffnen(neu)} />} />
  );

  if (fehler && !liste) return <>{leiste}<Fehler fehler={fehler} /></>;
  if (!liste) return <>{leiste}<Laedt /></>;

  const sucht = suche.trim().toLowerCase();
  const gefiltert = !sucht ? liste : liste.filter((z) => {
    const a2 = z.articles || {};
    return [a2.article_number, a2.name, a2.description, (lieferantVon(z) || {}).name,
            z.note, z.ziel_text, alt.personName(z.profiles, "")]
      .map((x) => String(x || "").toLowerCase()).join(" ").includes(sucht);
  });

  const heute = alt.isoDatum(new Date());
  const imBereich = gefiltert.filter((z) => BLOECKE[bereich].some((bl) => bl.status === z.status));

  return (
    <>
      {leiste}

      {BLOECKE[bereich].map((bl) => (
        <Block key={bl.status} block={bl} posten={gefiltert.filter((z) => z.status === bl.status)}
          schreiben={schreiben} neu={neu} behaelter={behaelter} heute={heute}
          einziger={BLOECKE[bereich].length === 1} />
      ))}

      {!imBereich.length &&
        <Leer text={sucht ? 'Nichts gefunden zu "' + suche + '".'
          : bereich === "offen" ? "Keine offenen Bestellpositionen."
          : "Nichts bestellt, das noch aussteht."} />}
    </>
  );
}

function Block({ block, posten, schreiben, neu, behaelter, heute, einziger }) {
  if (!posten.length) return null;

  // Innerhalb des Blocks nach Lieferant gruppieren
  const gruppen = {};
  posten.forEach((z) => {
    const lief = lieferantVon(z);
    const name = (lief && lief.name) || "Ohne Lieferant";
    (gruppen[name] = gruppen[name] || { lief: null, lief0: lief, website: null, weg: null, posten: [] }).posten.push(z);
    if (lief && lief.website) gruppen[name].website = lief.website;
    if (lief && lief.bestellweg) gruppen[name].weg = lief.bestellweg;
    if (lief && lief.bestellweg === "mail") gruppen[name].lief = lief;
  });

  // Lieferanten mit Überfälligem zuerst, sonst nach Namen
  const spaet = (name) => gruppen[name].posten.some((z) => fristArt(z, heute) === "spaet") ? 0 : 1;
  const namen = Object.keys(gruppen).sort((a, c) => spaet(a) - spaet(c) || a.localeCompare(c, "de"));

  return (
    <>
      {!einziger && <h2 className="blocktitel bs-blocktitel">{block.titel}
        <span className="bs-zahl">{posten.length}</span></h2>}
      {namen.map((name) => (
        <Lieferant key={name} name={name} gruppe={gruppen[name]} block={block.status}
          schreiben={schreiben} neu={neu} behaelter={behaelter} heute={heute} />
      ))}
    </>
  );
}

const BESTELLWEG = { mail: "Bestellung per Mail", website: "Bestellung über Website" };

function Lieferant({ name, gruppe, block, schreiben, neu, behaelter, heute }) {
  // Alle Positionen dieses Lieferanten auf einmal umstellen
  const sammelstatus = async () => {
    const posten = gruppe.posten;
    const wahl = await alt.auswahlDialog(positionen(posten.length) + " von " + name,
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
    else { alt.meldung(positionen(posten.length) + " geändert."); neu(); }
  };

  const unter = [positionen(gruppe.posten.length), BESTELLWEG[gruppe.weg]].filter(Boolean).join(" · ");

  return (
    <Karte className="bs-lieferant" vorne={<Logo lief={gruppe.lief0} name={name} />}
      titel={gruppe.website
        ? <a className="lieferantlink" href={gruppe.website} target="_blank" rel="noopener">
            {name}<Zeichen name="aussen" groesse={14} /></a>
        : name}
      unter={unter}
      aktionen={<>
        {/* Aufs PDF kommt genau, was in dieser Karte steht */}
        {gruppe.lief &&
          <button className="knopf knopf--mini bs-knopf" data-bestellpdf={name} data-block={block}
            onClick={() => alt.bestellungDrucken(gruppe.lief, gruppe.posten)}>
            <Zeichen name="pdf" groesse={15} />PDF</button>}
        {schreiben &&
          <button className="knopf knopf--mini bs-knopf" data-sammelstatus={name} data-block={block}
            onClick={sammelstatus}>Status für alle</button>}
      </>}>
      <div className="bs-posliste">
        {gruppe.posten.map((z) => (
          <Zeile key={z.id} z={z} schreiben={schreiben} behaelter={behaelter} heute={heute} />
        ))}
      </div>
    </Karte>
  );
}

function Zeile({ z, schreiben, behaelter, heute }) {
  const a2 = z.articles || {};
  const frist = fristArt(z, heute);
  const zeit = alt.statusZeit(z);
  const einheit = a2.unit && a2.unit !== "Stück" ? a2.unit : "Stk";
  const teil = z.status === "teilweise_geliefert" && !!z.geliefert_menge;
  const anteil = teil ? Math.min(100, Math.round(100 * z.geliefert_menge / Math.max(1, z.quantity))) : 0;

  const kopieren = async () => {
    const text = a2.article_number || "";
    if (!text) { alt.meldung("Nichts zu kopieren.", "warn"); return; }
    try { await navigator.clipboard.writeText(text); alt.meldung("Kopiert: " + text); }
    catch (f) { alt.meldung("Kopieren nicht möglich: " + text, "warn"); }
  };

  return (
    <div className={"bs-pos" + (frist === "spaet" ? " bs-pos--spaet" : "") + (teil ? " bs-pos--teil" : "")}>
      <div className="bs-pos__artikel">
        <div className="bs-pos__titel">
          <span className="bs-pos__nr">{a2.article_number || "?"}</span>
          <button className="kopiersymbol bs-kopie" data-bkopie={a2.article_number || ""}
            title="Artikelnummer kopieren" aria-label="Artikelnummer kopieren" onClick={kopieren}>
            <Zeichen name="kopie" groesse={14} /></button>
          <span className="bs-pos__name">{a2.name || ""}</span>
          {a2.description && <span className="bs-pos__beschreibung">{a2.description}</span>}
        </div>
        {/* Alles Weitere in einer Zeile: Ziel, Frist, Notiz, wer und seit wann */}
        <div className="bs-pos__chips">
          <Ziel art={z.ziel_art} text={z.ziel_text} />
          {frist &&
            <span className={"bs-chip bs-chip--frist bs-chip--" + frist}>
              <Zeichen name="kalender" groesse={14} />
              {frist === "spaet" ? "überfällig seit " : "bis "}{alt.kurzDatum(z.needed_by)}</span>}
          {z.note && <span className="bs-chip bs-chip--notiz"><Zeichen name="notiz" groesse={14} />{z.note}</span>}
          <span className="bs-pos__wer">{alt.personName(z.profiles)}{zeit && <> · {alt.statusZeitText(z)}</>}</span>
        </div>
      </div>

      <div className="bs-pos__menge">
        <b>{alt.zahlText(z.quantity)}</b><span>{einheit}</span>
        {teil && <div className="bs-teil" title={alt.zahlText(z.geliefert_menge) + " von "
            + alt.zahlText(z.quantity) + " geliefert"}>
          <div className="bs-teil__balken"><i style={{ width: anteil + "%" }} /></div>
          <div className="bs-teil__text">{alt.zahlText(z.geliefert_menge)} da ·{" "}
            {alt.zahlText(Math.max(0, z.quantity - z.geliefert_menge))} offen</div>
        </div>}
      </div>

      <div className="bs-pos__status">
        <Status z={z} data-bstatus={schreiben ? z.id : undefined}
          onClick={schreiben ? () => alt.bestStatusDialog(z, behaelter) : undefined} />
      </div>

      {schreiben &&
        <div className="bs-pos__aktionen">
          <Symbolknopf zeichen="stift" text="Bearbeiten" data-bearb-best={z.id}
            onClick={() => bearbeiten(z, behaelter)} />
          <Symbolknopf zeichen="muell" text="Löschen" gefahr data-bweg={z.id}
            data-nr={a2.article_number || ""} onClick={() => loeschen(z, behaelter)} />
        </div>}
    </div>
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
