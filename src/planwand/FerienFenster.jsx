// =================================================================
//  FERIEN
//  Fenster zum Eintragen, Ändern, Bestätigen und Löschen von Ferien
//  in der Ferienzeile der Planwand. Wer nicht planen darf, stellt eine
//  Anfrage; Planer und Administratoren bestätigen sie hier.
// =================================================================
import { useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";

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
  const planer = alt.darfPlanen();
  const istAnfrage = !!eintrag && eintrag.genehmigt === false;
  const profil = alt.profil;

  const [person, setPerson] = useState(eintrag ? eintrag.person : ((profil && profil.full_name) || ""));
  const [von, setVon] = useState(start);
  const [bis, setBis] = useState(eintrag ? alt.letzterArbeitstag(eintrag.von, eintrag.tage || 1) : start);
  const [notiz, setNotiz] = useState(eintrag ? (eintrag.note || "") : "");

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
    if (!eintrag) daten.genehmigt = planer;
    const vorher = eintrag ? await alt.rueckSichern("vacations", { id: eintrag.id }) : [];
    const { data, error } = eintrag
      ? await alt.db.from("vacations").update(daten).eq("id", eintrag.id)
      : await alt.db.from("vacations").insert(daten).select("id");
    if (!error) {
      const neuId = !eintrag && Array.isArray(data) && data[0] && data[0].id;
      if (eintrag) alt.merkeSchritt("Ferien von " + eintrag.person, alt.rueckRein("vacations", vorher));
      else if (neuId) alt.merkeSchritt("Ferien von " + wer, alt.rueckWeg("vacations", { id: neuId }));
    }
    fertig(error, !eintrag && !planer ? "Anfrage gestellt." : "Gespeichert.");
  };

  const bestaetigen = async () => {
    const vorher = await alt.rueckSichern("vacations", { id: eintrag.id });
    const { error } = await alt.db.from("vacations").update({
      genehmigt: true,
      genehmigt_von: profil.id,
      genehmigt_am: new Date().toISOString(),
    }).eq("id", eintrag.id);
    if (!error) alt.merkeSchritt("Ferien bestätigen", alt.rueckRein("vacations", vorher));
    fertig(error, "Ferien bestätigt.");
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
  };

  return (
    <div className="dialog">
      <h2>{eintrag ? "Ferien" : (planer ? "Ferien eintragen" : "Ferien anfragen")}</h2>
      {eintrag && (istAnfrage
        ? <div className="problemkasten">
            <div className="problemkasten__kopf">Noch nicht bestätigt</div>
            <div className="klein">Diese Ferien warten auf den Administrator.</div>
          </div>
        : <div className="karte--ergebnis meldungszahl">
            <div className="ergebnis__titel">Bestätigt</div>
            <div>{(eintrag.genehmigt_von_name || "Administrator")
              + (eintrag.genehmigt_am ? " · " + alt.datumZeitKurz(eintrag.genehmigt_am) : "")}</div>
          </div>)}

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

      <div className="dialog__knoepfe">
        {eintrag && <button className="knopf knopf--gefahr" id="fd-weg" onClick={loeschen}>Ferien löschen</button>}
        {istAnfrage && planer && <button className="knopf knopf--haupt" id="fd-ok" onClick={bestaetigen}>Bestätigen</button>}
        <button className="knopf knopf--still" id="fd-nein" onClick={zu}>Abbrechen</button>
        <button className={"knopf " + (istAnfrage && planer ? "knopf--still" : "knopf--haupt")}
          id="fd-ja" onClick={speichern}>Speichern</button>
      </div>
    </div>
  );
}
