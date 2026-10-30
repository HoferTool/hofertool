// =================================================================
//  KALENDER
//  Termine wie Kehrichtabfuhr, Papiersammlung oder Papierkörbe leeren
//  (Wunsch Patrick 28. Oktober 2026). Von 1.240.0 bis 1.310.x eine eigene
//  Seite im Menü; seit 1.311.0 eine Karte auf der Startseite mit den
//  nächsten zwei Wochen, und ein Tipp darauf öffnet dieses Fenster zum
//  Verwalten (Wunsch Patrick 30. Oktober 2026: „Reiter selber brauchts
//  nicht“). Dieselben Termine stehen auf dem Infoboard unter der
//  Solaranlage. Nicht für Externe und Dienst.
// =================================================================
import { alt, useDaten } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { wiederOeffner } from "../teile/wiederherstellen.js";
import { kalenderLaden, kalenderZeichen, WIEDERHOLUNG,
  wiederholungText, fehltKalender } from "../daten/kalender.js";

// Eintragen dürfen alle ausser Externen und dem Dienstkonto, auch ohne
// Schreibrecht (Wunsch Patrick 28. Oktober 2026: „sollen alle bearbeiten
// können, ausser die Externen“)
export const kalenderDarf = () => !alt.istExtern() && alt.meineRolle() !== "dienst";

// fertig: die Karte auf der Startseite lädt danach neu
export function kalenderOeffnen(fertig) {
  fensterOeffnen((zu) => <KalenderFenster zu={zu} />, () => { if (fertig) fertig(); },
    "kalender-huelle", { art: "kalender" });
}
wiederOeffner("kalender", () => kalenderOeffnen());

function KalenderFenster({ zu }) {
  const { daten: liste, fehler, neu } = useDaten(kalenderLaden, []);
  const darf = kalenderDarf();
  return (
    <div className="dialog dialog--breit kalenderfenster" role="dialog" aria-modal="true" id="kal-fenster">
      <div className="blatt__kopf">
        <h2>Kalender</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      {/* Wunsch Patrick 28. Oktober 2026: sagen, wo die Termine sonst noch stehen */}
      <p className="hinweis" id="kal-info">ℹ️ Diese Termine erscheinen auf der Startseite und auf dem Infoboard bei der Stempeluhr.</p>
      {darf && <button className="knopf knopf--haupt knopf--breit" id="kal-neu" data-fokus=""
        onClick={() => eintragDialog(null, neu)}>+ Termin eintragen</button>}
      {fehler && !liste
        ? <p className="hinweis">{fehltKalender(fehler)
            ? "Der Kalender braucht noch die Datei kalender.sql in Supabase." : alt.fehlertext(fehler)}</p>
        : !liste ? <div className="laedt">Wird geladen …</div>
        : <section id="kal-alle">
            <div className="karte__kopf"><h3>Alle Einträge</h3><span className="klein">{liste.length}</span></div>
            {!liste.length
              ? <p className="hinweis">Noch nichts eingetragen.{darf ? " Mit „+ Termin eintragen“ oben, zum Beispiel die Kehrichtabfuhr jede Woche." : ""}</p>
              : <div className="notizen">
                  {liste.map((e) => <Eintrag key={e.id} e={e} darf={darf} neu={neu} />)}
                </div>}
          </section>}
    </div>
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
