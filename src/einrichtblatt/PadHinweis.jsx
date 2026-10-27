// =================================================================
//  HINWEIS IM PAD MODE: EINRICHTBLATT KONTROLLIEREN
//  Beginnt im Pad ein neuer Auftrag (Rüsten oder läuft, auch der
//  nächste, der beim Beenden auf Rüsten rückt), kommt die Meldung, am PC
//  das Einrichtblatt in der App zu kontrollieren und wenn nötig
//  anzupassen. Mit „EB OK“ dort ist das Excel gelöscht und wird
//  nicht mehr hochgeladen (Wunsch Patrick, 23. Oktober 2026). Ist das
//  Blatt schon als gut bestätigt, kommt nichts, ebenso wenn es weder ein
//  Excel noch ein Blatt in der App gibt (dann gibt es nichts zu prüfen).
//  Seit 1.236.0 geht das auch gleich hier im Pad: „Jetzt bearbeiten“
//  öffnet das Blatt zum Ändern, „EB OK“ steht dann darin (Wunsch Patrick
//  27. Oktober 2026: „Man soll im Pad Mode EB bearbeiten können“).
// =================================================================
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { blattSuchen } from "./daten.js";
import { einrichtblattAppOeffnen } from "./Blatt.jsx";

const START = ["ruesten", "laeuft"];

// j: der Auftrag, neu: sein neuer Zustand
export async function einrichtblattHinweis(j, neu) {
  if (!j || !START.includes(neu) || !j.job_number || !j.machine_id) return;
  if (alt.istExtern()) return;     // Externe: erst nach Patricks Entscheid
  let m;
  try {
    const r = await alt.db.from("machines").select("id, name, type_id").eq("id", j.machine_id).limit(1);
    m = (r.data || [])[0];
  } catch (f) { return; }
  if (!m || !m.type_id) return;
  const blatt = await blattSuchen(j.job_number, m.type_id);
  if (blatt && blatt.gut_am) return;
  if (!blatt) {
    let excel = null;
    try {
      const r = await alt.db.from("hoco_type_data").select("blatt_url").eq("hoco_nr", j.job_number).eq("type_id", m.type_id).limit(1);
      excel = ((r.data || [])[0] || {}).blatt_url || null;
    } catch (f) { /* dann keins */ }
    if (!excel) return;
  }
  let typName = "";
  try { typName = (((await alt.ladeTypen()) || []).find((t) => t.id === m.type_id) || {}).name || ""; } catch (f) { /* ohne Namen */ }
  const darf = alt.darfSchreiben();
  let bearbeiten = false;
  await new Promise((fertig) => fensterOeffnen((zu) => (
    <div className="dialog eba-padhinweis" role="dialog" aria-modal="true" data-eba-padhinweis="">
      <h2>Einrichtblatt kontrollieren</h2>
      <p><b>{j.job_number}</b> auf {m.name}{typName ? " (" + typName + ")" : ""} beginnt.</p>
      <p>Bitte das Einrichtblatt in der App kontrollieren und wenn nötig anpassen{darf ? ", gleich hier mit „Jetzt bearbeiten“ oder am PC" : ", am PC"}.</p>
      <p>Stimmt es, im Blatt <b>„EB OK“</b> drücken: Dann wird das alte Excel gelöscht und nicht mehr hochgeladen.</p>
      <div className="dialog__knoepfe">
        <button className={"knopf" + (darf ? "" : " knopf--haupt")} data-ja="" data-fokus={darf ? undefined : ""} onClick={zu}>{darf ? "Später" : "Verstanden"}</button>
        {darf && <button className="knopf knopf--haupt" data-eba-padbearbeiten="" data-fokus="" onClick={() => { bearbeiten = true; zu(); }}>Jetzt bearbeiten</button>}
      </div>
    </div>
  ), fertig));
  if (bearbeiten) await einrichtblattAppOeffnen(j.job_number, m.type_id, { bearbeiten: true });
}
