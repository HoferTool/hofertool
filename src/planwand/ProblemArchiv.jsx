// =================================================================
//  ARCHIV DER ERLEDIGTEN PROBLEME (seit 1.634.0, Wunsch Patrick
//  18. November 2026: „gibt es ein Archiv für erledigte Probleme?“ –
//  „bitte einbauen, Externe nicht“)
//  „✓ Erledigt“ löscht das Problem am Auftrag. Die Datenbank schreibt
//  vorher von selbst eine Zeile in problem_archiv (Auslöser
//  jobs_problem_archiv, sql/problem-archiv.sql), hier wird nur gelesen.
//  Knopf im Planer unter „Abgeschlossen“ (bis 1.644.x oben auf der
//  Planwand), im Auftragsfenster „Frühere Probleme“
//  für die HOCO Nr. Nicht für Externe, nicht im Archiv der Planwand.
// =================================================================
import { useMemo, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { passtWoerter } from "../teile/Suchfeld.jsx";

const TABELLE = "problem_archiv";

export const problemArchivSichtbar = () => !alt.istExtern()
  && !(alt.istArchiv && alt.istArchiv()) && alt.meineRolle() !== "dienst";

// Datum mit Jahr, das Archiv reicht über den Jahreswechsel
function wann(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear()
    + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

// Dauer zwischen Meldung und Erledigt, grob lesbar
function dauer(von, bis) {
  const ms = new Date(bis) - new Date(von);
  if (!von || !(ms > 0)) return "";
  const h = ms / 3600000;
  if (h < 1) return Math.max(1, Math.round(ms / 60000)) + " Min.";
  if (h < 48) return Math.round(h) + " Std.";
  return Math.round(h / 24) + " Tage";
}

async function laden(hoco) {
  let q = alt.db.from(TABELLE).select("*").order("erledigt_am", { ascending: false }).limit(1000);
  if (hoco) q = q.eq("job_number", hoco);
  const { data, error } = await alt.zeitlimit(q, 10000, "Erledigte Probleme");
  if (error) throw error;
  return data || [];
}

async function maschinenNamen() {
  const m = new Map();
  try {
    const { data } = await alt.zeitlimit(
      alt.db.from("machines").select("id, name, machine_number"), 10000, "Maschinen");
    for (const x of data || []) m.set(x.id, x.name || x.machine_number || "");
  } catch (f) { /* ohne Namen geht es auch */ }
  return m;
}

// Wie viele erledigte Probleme hatte diese HOCO Nr. schon? Für den
// Hinweis im Auftragsfenster; Fehler (Tabelle fehlt) gelten als 0.
export async function fruehereProblemeZahl(hoco) {
  if (!hoco || !problemArchivSichtbar()) return 0;
  try {
    const { data, error } = await alt.db.from(TABELLE)
      .select("id").eq("job_number", hoco).limit(1000);
    if (error) return 0;
    return (data || []).length;
  } catch (f) { return 0; }
}

function Archiv({ zu, start, maschinen, hoco, hinzeigen }) {
  const [liste, setListe] = useState(start);
  const [suche, setSuche] = useState("");
  const admin = alt.istAdmin();

  const treffer = useMemo(() => liste.filter((z) => passtWoerter(suche, [
    z.problem, z.job_number, z.fa_nr, z.gemeldet_name, z.erledigt_name,
    maschinen.get(z.machine_id), wann(z.erledigt_am), wann(z.gemeldet_am),
  ])), [liste, suche, maschinen]);

  const zeigen = (z) => {
    if (!z.job_id) { alt.meldung("Dieser Auftrag ist gelöscht.", "warn"); return; }
    zu();
    if (hinzeigen) hinzeigen({ id: z.job_id, job_number: z.job_number });
    else alt.balkenZeigen(z.job_id, true);
  };

  const weg = async (z) => {
    const ok = await alt.nachfragen({ titel: "Eintrag löschen?",
      text: "„" + z.problem + "“ aus dem Archiv löschen?", bestaetigen: "Löschen" });
    if (!ok) return;
    const vorher = await alt.rueckSichern(TABELLE, { id: z.id });
    const { error } = await alt.db.from(TABELLE).delete().eq("id", z.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Löschen aus dem Problem-Archiv", alt.rueckRein(TABELLE, vorher));
    setListe((l) => l.filter((x) => x.id !== z.id));
  };

  return (
    <div className="dialog dialog--breit problemarchiv" id="problem-archiv">
      <div className="blatt__kopf"><h2>Erledigte Probleme{hoco ? " · " + hoco : ""}</h2>
        <span className="klein">{treffer.length === liste.length
          ? liste.length + " Einträge" : treffer.length + " von " + liste.length}</span>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>
      <input type="text" className="problemarchiv__suche" id="problem-archiv-suche"
        placeholder="Suchen: HOCO Nr., FA Nr., Text, Person, Maschine …" value={suche}
        onChange={(e) => setSuche(e.target.value)} autoFocus />
      {liste.length
        ? <div className="matausgabe-rolle problemarchiv__rolle"><table className="tabelle">
            <thead><tr><th>Erledigt</th><th>Problem</th><th>Auftrag</th><th>Maschine</th><th>Gemeldet</th><th></th></tr></thead>
            <tbody>{treffer.map((z) => (
              <tr key={z.id} data-problemarchiv={z.id}>
                <td className="klein">{wann(z.erledigt_am)}<div>{z.erledigt_name || "—"}</div>
                  {z.ersetzt && <div className="problemarchiv__ersetzt">durch neue Meldung ersetzt</div>}</td>
                <td className="problemarchiv__text">⚠ {z.problem}</td>
                <td><button type="button" className="knopf knopf--klein" data-problemarchiv-zeigen=""
                  title="Auf der Planwand zeigen" onClick={() => zeigen(z)}>{z.job_number || "—"}</button>
                  {z.fa_nr && <div className="klein">FA {z.fa_nr}</div>}</td>
                <td>{maschinen.get(z.machine_id) || "—"}</td>
                <td className="klein">{wann(z.gemeldet_am) || "—"}<div>{z.gemeldet_name || ""}</div>
                  {dauer(z.gemeldet_am, z.erledigt_am) && <div>offen {dauer(z.gemeldet_am, z.erledigt_am)}</div>}</td>
                <td>{admin && <button type="button" className="knopf knopf--klein knopf--still"
                  title="Aus dem Archiv löschen" aria-label="Löschen" data-problemarchiv-weg=""
                  onClick={() => weg(z)}>✕</button>}</td>
              </tr>))}</tbody>
          </table></div>
        : <p className="klein">Noch keine erledigten Probleme. Ab jetzt kommt jedes Problem hierher,
            sobald jemand auf „✓ Erledigt“ tippt.</p>}
    </div>);
}

export async function problemArchivOeffnen(hoco, hinzeigen) {
  let start, maschinen;
  try {
    [start, maschinen] = await Promise.all([laden(hoco), maschinenNamen()]);
  } catch (f) {
    const t = alt.fehlertext(f);
    alt.meldung(/problem_archiv/.test(t)
      ? "Das Archiv ist in der Datenbank noch nicht eingerichtet (sql/problem-archiv.sql)." : t, "fehler");
    return;
  }
  fensterOeffnen((zu) => <Archiv zu={zu} start={start} maschinen={maschinen} hoco={hoco} hinzeigen={hinzeigen} />);
}
