// =================================================================
//  KALENDER
//  Eigene Seite im Menü für wichtige Termine wie Kehrichtabfuhr,
//  Papiersammlung oder Papierkörbe leeren (Wunsch Patrick 28. Oktober
//  2026). Oben die nächsten Termine samt Geburtstagen, darunter alle
//  Einträge zum Ändern. Dieselben Termine stehen auf dem Infoboard unter
//  der Solaranlage. Nicht für Externe.
// =================================================================
import { alt, useDaten } from "../bruecke.jsx";
import { kalenderLaden, naechsteTermine, wannText, kalenderZeichen, WIEDERHOLUNG,
  wiederholungText, fehltKalender } from "../daten/kalender.js";
import { geburtstageLaden, geburtstageAufbereiten } from "./start/Karten.jsx";
import { useSeitenSuche, hinzeigen } from "../teile/seitenSuche.js";

const TAGE = 60;

export default function Kalender({ auffrischen }) {
  const { daten: liste, fehler, neu } = useDaten(kalenderLaden, [auffrischen]);
  const geb = useDaten(geburtstageLaden, [auffrischen]);
  // Eintragen dürfen alle ausser Externen und dem Dienstkonto, auch ohne
  // Schreibrecht (Wunsch Patrick 28. Oktober 2026: „sollen alle bearbeiten
  // können, ausser die Externen“)
  const darf = !alt.istExtern() && alt.meineRolle() !== "dienst";

  useSeitenSuche({
    name: "Kalender", platzhalter: "Termin …",
    eintraege: () => (liste || []).map((e) => ({
      gruppe: "Termine", zeichen: kalenderZeichen(e.titel), titel: e.titel,
      zeile: wiederholungText(e.wiederholung) + " · ab " + alt.langDatum(e.datum), id: e.id })),
    springen: (x) => hinzeigen('[data-kal="' + x.id + '"]'),
  });

  // Termine und Geburtstage der nächsten 60 Tage zusammen, nach Datum
  const termine = liste ? naechsteTermine(liste, TAGE).map((t) => ({
    datum: t.datum, tage: t.tage, zeichen: kalenderZeichen(t.eintrag.titel),
    titel: t.eintrag.titel, notiz: t.eintrag.notiz, schluessel: t.eintrag.id + t.datum })) : [];
  geburtstageAufbereiten(geb.daten).filter((m) => m.tage <= TAGE).forEach((m) => termine.push({
    datum: m.datum, tage: m.tage, zeichen: "🎂", titel: m.name + " wird " + m.alter,
    schluessel: "g" + m.name + m.datum, geburtstag: true }));
  termine.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));

  return (
    <>
      <h1 className="seitentitel">Kalender</h1>
      {darf && <button className="knopf knopf--haupt knopf--breit" id="kal-neu"
        onClick={() => eintragDialog(null, neu)}>+ Termin eintragen</button>}
      {fehler && !liste
        ? <div className="karte karte--fehler"><p>{fehltKalender(fehler)
            ? "Der Kalender braucht noch die Datei kalender.sql in Supabase." : alt.fehlertext(fehler)}</p></div>
        : !liste ? <div className="laedt">Wird geladen …</div>
        : <>
            <section className="karte" id="kal-naechste">
              <div className="karte__kopf"><h2>Die nächsten {TAGE} Tage</h2></div>
              {!termine.length
                ? <p className="hinweis">Keine Termine in den nächsten {TAGE} Tagen.</p>
                : <div className="kal-liste">
                    {termine.map((t) => (
                      <div className={"kal-zeile" + (t.tage === 0 ? " kal-zeile--heute" : "")} key={t.schluessel}>
                        <span className="kal-zeile__wann">{wannText(t)}</span>
                        <span className="kal-zeile__zeichen">{t.zeichen}</span>
                        <span className="kal-zeile__was">{t.titel}
                          {t.notiz && <span className="klein"> · {t.notiz}</span>}</span>
                      </div>
                    ))}
                  </div>}
            </section>
            <section className="karte" id="kal-alle">
              <div className="karte__kopf"><h2>Alle Einträge</h2><span className="klein">{liste.length}</span></div>
              {!liste.length
                ? <p className="hinweis">Noch nichts eingetragen.{darf ? " Mit „+ Termin eintragen“ oben, zum Beispiel die Kehrichtabfuhr jede Woche." : ""}</p>
                : <div className="notizen">
                    {liste.map((e) => <Eintrag key={e.id} e={e} darf={darf} neu={neu} />)}
                  </div>}
            </section>
          </>}
    </>
  );
}

function Eintrag({ e, darf, neu }) {
  const loeschen = async () => {
    const ok = await alt.nachfragen({ titel: "Termin löschen",
      text: "„" + e.titel + "“ verschwindet aus dem Kalender und vom Infoboard.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const vorher = await alt.rueckSichern("kalender", { id: e.id });
    const { error } = await alt.db.from("kalender").delete().eq("id", e.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Löschen von " + e.titel, alt.rueckRein("kalender", vorher));
    alt.meldung("Gelöscht."); neu();
  };
  return (
    <div className="notiz" data-kal={e.id}>
      <span className="kal-zeile__zeichen">{kalenderZeichen(e.titel)}</span>
      <span className="notiz__text">
        {e.titel}
        <div className="klein">{wiederholungText(e.wiederholung)}
          {e.wiederholung === "nie" ? " am " : " ab "}{alt.langDatum(e.datum)}
          {e.notiz ? " · " + e.notiz : ""}</div>
      </span>
      {darf && <>
        <button className="chipweg chipweg--bearb" data-kalbearb={e.id} title="bearbeiten"
          onClick={() => eintragDialog(e, neu)}>✎</button>
        <button className="chipweg" data-kalweg={e.id} title="löschen" onClick={loeschen}>×</button>
      </>}
    </div>
  );
}

async function eintragDialog(e, neu) {
  const w = await alt.dialogFelder({
    titel: e ? "Termin ändern" : "Neuer Termin",
    felder: [
      { name: "titel", label: "Was", pflicht: true, wert: e ? e.titel : "",
        platzhalter: "Kehrichtabfuhr, Papiersammlung, Papierkörbe leeren …" },
      { name: "datum", label: "Wann (bei Wiederholung das erste Mal)",
        typ: "date", pflicht: true, wert: e ? e.datum : alt.isoDatum(new Date()) },
      { name: "wiederholung", label: "Wie oft", auswahl: WIEDERHOLUNG.map((x) => [x.wert, x.text]),
        wert: e ? e.wiederholung : "nie" },
      { name: "notiz", label: "Notiz", wert: e ? (e.notiz || "") : "", platzhalter: "kann leer bleiben" },
    ],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w.datum || "")) { alt.meldung("Bitte ein Datum wählen.", "warn"); return; }
  const wdh = WIEDERHOLUNG.some((x) => x.wert === w.wiederholung) ? w.wiederholung : "nie";

  const daten = { titel: w.titel.trim(), datum: w.datum, wiederholung: wdh, notiz: (w.notiz || "").trim() || null };
  if (e) daten.geaendert_am = new Date().toISOString();
  const vorher = e ? await alt.rueckSichern("kalender", { id: e.id }) : [];
  const { data, error } = e
    ? await alt.db.from("kalender").update(daten).eq("id", e.id)
    : await alt.db.from("kalender").insert(daten).select("id");
  if (error) {
    alt.meldung(fehltKalender(error) ? "Der Kalender braucht noch die Datei kalender.sql in Supabase." : alt.fehlertext(error), "fehler");
    return;
  }
  const neuId = !e && Array.isArray(data) && data[0] && data[0].id;
  if (e) alt.merkeSchritt("Ändern von " + e.titel, alt.rueckRein("kalender", vorher));
  else if (neuId) alt.merkeSchritt("Termin " + daten.titel, alt.rueckWeg("kalender", { id: neuId }));
  alt.meldung(e ? "Gespeichert." : "Eingetragen."); neu();
}
