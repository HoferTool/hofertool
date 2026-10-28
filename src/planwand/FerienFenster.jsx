// =================================================================
//  FERIEN
//  Fenster zum Eintragen, Ändern und Löschen von Ferien in der
//  Ferienzeile der Planwand. Eine Bestätigung braucht es nicht mehr
//  (Wunsch Patrick, 9. Oktober 2026): alles Eingetragene gilt sofort.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { adressenAus, ferienAktualisieren, ferienTerminSenden, verteilerLaden } from "../teile/ferienTermin.js";

// freieZeile(von, tage, ausserId) sucht die erste Ferienzeile ohne
// Überschneidung; sie bleibt im alten Programm bei der Planwand.
export function ferienDialog(eintrag, zeile, datum, b) {
  alt.plan.imDialog = true;
  fensterOeffnen((zu) => <FerienFenster eintrag={eintrag} zeile={zeile} datum={datum} b={b} zu={zu} />,
    () => { alt.plan.imDialog = false; });
}

function FerienFenster({ eintrag, zeile, datum, b, zu }) {
  const start = eintrag ? eintrag.von
    : (datum || alt.naechsterArbeitstag(alt.isoDatum(new Date())));
  const profil = alt.profil;

  const [person, setPerson] = useState(eintrag ? eintrag.person : ((profil && profil.full_name) || ""));
  const [von, setVon] = useState(start);
  const [bis, setBis] = useState(eintrag ? alt.letzterArbeitstag(eintrag.von, eintrag.tage || 1) : start);
  const [notiz, setNotiz] = useState(eintrag ? (eintrag.note || "") : "");
  // Outlook-Termin an den Verteiler (1.235.0, Wunsch Patrick 27. Oktober 2026):
  // nur, wenn unter Einstellungen Empfänger stehen; seit 1.239.0 auch
  // beim Ändern eingeschaltet, dann als Aktualisierung.
  const [verteiler, setVerteiler] = useState("");
  const [termin, setTermin] = useState(true);
  useEffect(() => { let weg = false; verteilerLaden().then((v) => { if (!weg) setVerteiler(v); }); return () => { weg = true; }; }, []);
  const empfaenger = adressenAus(verteiler);

  const fertig = (error, text) => {
    zu();
    if (error) alt.meldung(alt.fehlertext(error), "fehler");
    else { alt.meldung(text); alt.planAktualisieren(b); }
  };

  const speichern = async () => {
    const wer = person.trim();
    if (!wer) { alt.meldung("Bitte einen Namen eintragen.", "warn"); return; }
    const erster = von || start;
    const letzter = bis || erster;
    if (letzter < erster) { alt.meldung("Der letzte Tag liegt vor dem ersten.", "warn"); return; }

    const tage = alt.arbeitstageZwischen(erster, letzter);
    const daten = {
      person: wer,
      zeile: zeile || alt.freieFerienZeile(erster, tage, eintrag ? eintrag.id : null),
      von: erster, tage,
      note: notiz.trim() || null,
    };
    if (!eintrag) daten.genehmigt = true;
    const vorher = eintrag ? await alt.rueckSichern("vacations", { id: eintrag.id }) : [];
    const { data, error } = eintrag
      ? await alt.db.from("vacations").update(daten).eq("id", eintrag.id)
      : await alt.db.from("vacations").insert(daten).select("id");
    let neuId = null;
    if (!error) {
      neuId = !eintrag && Array.isArray(data) && data[0] && data[0].id;
      if (eintrag) alt.merkeSchritt("Ferien von " + eintrag.person, alt.rueckRein("vacations", vorher));
      else if (neuId) alt.merkeSchritt("Ferien von " + wer, alt.rueckWeg("vacations", { id: neuId }));
    }
    fertig(error, "Gespeichert.");
    if (!error && termin && empfaenger.length) {
      ferienTerminSenden({ id: eintrag ? eintrag.id : neuId, person: wer, von: erster,
        bis: alt.letzterArbeitstag(erster, tage), tage, notiz: notiz.trim(),
        art: eintrag ? "geaendert" : undefined,
        vorher: eintrag && (eintrag.von !== erster || (eintrag.tage || 1) !== tage)
          ? { von: eintrag.von, bis: alt.letzterArbeitstag(eintrag.von, eintrag.tage || 1) } : undefined }, verteiler)
        .catch((f) => alt.meldung("Termin liess sich nicht erstellen: " + (f && f.message), "fehler"));
    }
  };

  const loeschen = async () => {
    const sicher = await alt.nachfragen({
      titel: "Ferien löschen",
      text: "Soll der Eintrag für " + eintrag.person + " gelöscht werden?",
      bestaetigen: "Löschen", gefahr: true });
    if (!sicher) return;
    const vorher = await alt.rueckSichern("vacations", { id: eintrag.id });
    const { error } = await alt.db.from("vacations").delete().eq("id", eintrag.id);
    if (!error) alt.merkeSchritt("Löschen der Ferien von " + eintrag.person, alt.rueckRein("vacations", vorher));
    fertig(error, "Gelöscht.");
    if (!error) ferienAktualisieren(eintrag, "abgesagt");
  };

  return (
    <div className="dialog">
      <h2>{eintrag ? "Ferien" : "Ferien eintragen"}</h2>

      <label className="feld"><span>Wer</span>
        <input id="fd-person" type="text" placeholder="Name" data-fokus="" value={person}
          onChange={(e) => setPerson(e.target.value)} /></label>
      <div className="zeitraumwahl">
        <label className="feld"><span>Erster Tag</span>
          <input id="fd-von" type="date" value={von} onChange={(e) => setVon(e.target.value)} /></label>
        <label className="feld"><span>Letzter Tag</span>
          <input id="fd-bis" type="date" value={bis} onChange={(e) => setBis(e.target.value)} /></label>
      </div>
      <label className="feld"><span>Notiz</span>
        <input id="fd-notiz" type="text" value={notiz} onChange={(e) => setNotiz(e.target.value)} /></label>
      {empfaenger.length > 0 && (
        <label className="fd-termin" title={empfaenger.join(", ")}>
          <input type="checkbox" id="fd-termin" checked={termin} onChange={(e) => setTermin(e.target.checked)} />
          <span>Outlook-Termin an {empfaenger.length === 1 ? empfaenger[0] : empfaenger.length + " Empfänger"} senden</span>
        </label>
      )}

      <div className="dialog__knoepfe">
        {eintrag && <button className="knopf knopf--gefahr" id="fd-weg" onClick={loeschen}>Ferien löschen</button>}
        <button className="knopf knopf--still" id="fd-nein" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt"
          id="fd-ja" onClick={speichern}>Speichern</button>
      </div>
    </div>
  );
}
