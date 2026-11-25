// =================================================================
//  STÜCKZAHL KORRIGIEREN (seit 1.824.0, Wunsch Patrick 25. November 2026:
//  „10500 von 5000 stimmt nicht, wir haben noch gar nicht gestartet,
//  kann ich das anpassen?“)
//  Im Auftragsfenster: alle gemeldeten Zählerstände dieses Auftrags
//  (production_records) mit Datum und Menge. Jeder lässt sich ändern
//  oder löschen, „Alles auf 0 zurücksetzen“ löscht alle nach einer
//  Rückfrage. Der Stand auf der Planwand ist immer der jüngste Eintrag.
//  Alles mit Rückgängig. Rechte wie beim Erfassen (darf_schreiben,
//  in der Datenbank geprüft); Externe nicht (Entscheid offen).
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";

export function stueckzahlKorrigierenOeffnen(auftrag, b, nachher) {
  if (!auftrag || !auftrag.id) return;
  fensterOeffnen((zu) => <Fenster auftrag={auftrag} b={b} nachher={nachher} zu={zu} />, null, "stk-korr-huelle");
}

function datumText(d) {
  if (!d) return "";
  const [j, m, t] = String(d).slice(0, 10).split("-");
  return t + "." + m + "." + j;
}

function Fenster({ auftrag, b, nachher, zu }) {
  const [zeilen, setZeilen] = useState(null);
  const [werte, setWerte] = useState({});
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState("");

  async function laden() {
    const { data, error } = await alt.db.from("production_records")
      .select("*").eq("job_id", auftrag.id).order("record_date", { ascending: false });
    if (error) { setFehler("Konnte die Stückzahlen nicht laden: " + error.message); setZeilen([]); return; }
    setZeilen(data || []);
    const w = {};
    for (const z of data || []) w[z.id] = String(z.quantity ?? "");
    setWerte(w);
  }
  useEffect(() => { laden(); }, []);

  async function fertig(text) {
    alt.meldung(text, "gut");
    await laden();
    try { await alt.planAktualisieren(b); } catch (f) { /* Planwand frischt sonst beim Abgleich */ }
    if (nachher) nachher();
  }

  async function aendern(z) {
    const neu = parseInt(String(werte[z.id] || "").replace(/['\s]/g, ""), 10);
    if (!Number.isFinite(neu) || neu < 0) { alt.meldung("Bitte eine Zahl ab 0 eintippen.", "warn"); return; }
    if (neu === z.quantity) return;
    setLaeuft(true);
    try {
      const vorher = await alt.rueckSichern("production_records", { id: z.id });
      const { data, error } = await alt.db.from("production_records")
        .update({ quantity: neu }).eq("id", z.id).select();
      if (error) throw error;
      if (!data || !data.length) { alt.meldung("Ändern dürfen nur Personen mit Schreibrecht.", "fehler"); return; }
      alt.merkeSchritt("Stückzahl vom " + datumText(z.record_date) + " geändert",
        [alt.rueckRein("production_records", vorher)]);
      await fertig("Stückzahl vom " + datumText(z.record_date) + " auf " + alt.zahlText(neu) + " gesetzt.");
    } catch (f) {
      alt.meldung("Ändern ging nicht: " + (f.message || f), "fehler");
    } finally { setLaeuft(false); }
  }

  async function loeschen(liste, frage, text) {
    const ok = await alt.nachfragen({ titel: frage.titel, text: frage.text, bestaetigen: frage.knopf, gefahr: true });
    if (!ok) return;
    setLaeuft(true);
    try {
      const ids = liste.map((z) => z.id);
      const vorher = await alt.rueckSichern("production_records", { id: ids });
      const { data, error } = await alt.db.from("production_records").delete().in("id", ids).select();
      if (error) throw error;
      if (!data || !data.length) { alt.meldung("Löschen dürfen nur Personen mit Schreibrecht.", "fehler"); return; }
      alt.merkeSchritt(text, [alt.rueckRein("production_records", vorher)]);
      await fertig(text + ".");
    } catch (f) {
      alt.meldung("Löschen ging nicht: " + (f.message || f), "fehler");
    } finally { setLaeuft(false); }
  }

  const stand = zeilen && zeilen.length ? zeilen[0].quantity : 0;
  return (
    <div className="dialog stk-korr" role="dialog" aria-label="Stückzahl korrigieren">
      <div className="stk-korr__kopf">
        <h2>Stückzahl korrigieren</h2>
        <button type="button" className="dialog__schliessen-inline" data-zu="" aria-label="Schliessen" onClick={zu}>✕</button>
      </div>
      <p className="stk-korr__info">{auftrag.job_number}{auftrag.fa_nr ? " · FA " + auftrag.fa_nr : ""} · Stand jetzt <b>{alt.zahlText(stand)}</b>
        {auftrag.target_quantity ? " von " + alt.zahlText(auftrag.target_quantity) : ""}. Der Stand ist immer der jüngste Eintrag.</p>
      {fehler && <p className="stk-korr__fehler">{fehler}</p>}
      {zeilen === null ? <p>Wird geladen …</p>
        : zeilen.length === 0 ? <p id="stk-korr-leer">Für diesen Auftrag ist keine Stückzahl gemeldet.</p>
        : <table className="stk-korr__tabelle" id="stk-korr-liste">
            <thead><tr><th>Datum</th><th>Zählerstand</th><th></th></tr></thead>
            <tbody>{zeilen.map((z) => (
              <tr key={z.id} data-stk-zeile={z.id}>
                <td>{datumText(z.record_date)}</td>
                <td><input type="text" inputMode="numeric" className="feld stk-korr__feld" value={werte[z.id] ?? ""}
                  disabled={laeuft} data-ohne-datumtasten=""
                  onChange={(e) => setWerte({ ...werte, [z.id]: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aendern(z); } }} /></td>
                <td className="stk-korr__knoepfe">
                  <button type="button" className="knopf knopf--klein" data-stk-speichern={z.id} disabled={laeuft}
                    onClick={() => aendern(z)}>Speichern</button>
                  <button type="button" className="knopf knopf--klein knopf--gefahr" data-stk-weg={z.id} disabled={laeuft}
                    onClick={() => loeschen([z], { titel: "Eintrag löschen?", text: "Zählerstand " + alt.zahlText(z.quantity) + " vom " + datumText(z.record_date) + " löschen?", knopf: "Löschen" },
                      "Zählerstand vom " + datumText(z.record_date) + " gelöscht")}>Löschen</button>
                </td>
              </tr>))}</tbody>
          </table>}
      <div className="dialog__knoepfe">
        {zeilen && zeilen.length > 0 && <button type="button" className="knopf knopf--gefahr" id="stk-korr-null" disabled={laeuft}
          onClick={() => loeschen(zeilen, { titel: "Auf 0 zurücksetzen?", text: "Alle " + zeilen.length + " gemeldeten Stückzahlen dieses Auftrags löschen? Der Stand ist danach 0.", knopf: "Zurücksetzen" },
            "Stückzahl von " + auftrag.job_number + " auf 0 zurückgesetzt")}>Alles auf 0 zurücksetzen</button>}
        <button type="button" className="knopf" onClick={zu}>Schliessen</button>
      </div>
    </div>
  );
}
