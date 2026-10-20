// =================================================================
//  MATERIAL: HISTORIE (seit 1.88.0, Wunsch Patrick 16. Oktober 2026:
//  „Historie von den letzten 100 Sachen als Button, dann in einem
//  Fenster anzeigen“)
//  Die Zeilen schreibt die Datenbank selbst bei jeder Änderung am
//  Restmaterial (Tabelle material_verlauf, sql/material-verlauf.sql);
//  hier wird nur gelesen. Nicht für Externe.
// =================================================================
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { postenMengeText } from "../daten/material.js";

const WAS = { erfasst: "Erfasst", geaendert: "Geändert", aufgebraucht: "Aufgebraucht",
  zurueck: "Zurückgeholt", geloescht: "Gelöscht" };

// Datum mit Jahr, die Historie reicht über den Jahreswechsel
function wann(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + String(d.getFullYear()).slice(2)
    + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

export async function materialHistorieOeffnen(personen) {
  let liste;
  try {
    const { data, error } = await alt.zeitlimit(
      alt.db.from("material_verlauf").select("*").order("am", { ascending: false }).limit(100),
      10000, "Material Historie");
    if (error) throw error;
    liste = data || [];
  } catch (f) {
    const t = alt.fehlertext(f);
    alt.meldung(/material_verlauf/.test(t) ? "Die Historie ist in der Datenbank noch nicht eingerichtet (sql/material-verlauf.sql)." : t, "fehler");
    return;
  }
  const wer = (id) => (id && personen && personen.get(id)) || "—";
  fensterOeffnen((zu) => (
    <div className="dialog dialog--breit matausgabe-historie" id="mat-historie">
      <div className="blatt__kopf"><h2>Material · Historie</h2>
        <span className="klein">die letzten {liste.length}</span>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>
      {liste.length
        ? <div className="matausgabe-rolle"><table className="tabelle">
            <thead><tr><th>Wann</th><th>Was</th><th>Material</th><th>Menge</th><th>Ort</th><th>Wer</th></tr></thead>
            <tbody>{liste.map((z) => (
              <tr key={z.id} data-was={z.was}>
                <td className="klein nowrap">{wann(z.am)}</td>
                <td><b>{WAS[z.was] || z.was}</b>{z.vorher ? <div className="klein">vorher: {z.vorher}</div> : null}</td>
                <td>{z.material}</td>
                <td className="nowrap">{postenMengeText(z)}</td>
                <td>{z.ort || "—"}</td>
                <td className="klein">{wer(z.wer)}</td>
              </tr>))}</tbody>
          </table></div>
        : <p className="klein">Noch nichts geändert.</p>}
    </div>));
}
