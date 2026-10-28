// =================================================================
//  LAUFEND OHNE WBG (seit 1.246.0, Wunsch Patrick 28. Oktober 2026:
//  „welche laufenden Aufträge noch keinen WBG haben“)
//
//  Aufträge, die an einer Maschine der eigenen Parks auf „läuft“
//  stehen und keine WBG haben (jobs.wbg_url leer), genau wie
//  „Keine WBG vorhanden“ im Auftragsfenster. Steht nur da, wenn es
//  welche gibt. Ein Tipp auf den Auftrag öffnet sein Auftragsfenster,
//  dort lässt sich die WBG hochladen. Externe Parks wie bei „Heute
//  noch offen“ nicht; Externe und das Dienstkonto sehen die
//  Startseite ohnehin nicht.
// =================================================================
import { alt, useDaten } from "../../bruecke.jsx";

const keine = async () => null;

export async function ohneWbgLaden() {
  // Parks zuerst, sonst weiss parkErlaubt nicht, welcher Park wem gehört
  await alt.ladeParks(false);
  const [maschinen, laufend] = await Promise.all([alt.ladeMaschinen(false), alt.ladeLaufendeAuftraege()]);
  return maschinen
    .filter((m) => !alt.parkIstExtern(m.park_id))
    .map((m) => ({ m, j: laufend[m.id] }))
    .filter(({ j }) => j && j.plan_status === "laeuft" && !j.wbg_url);
}

// Das Auftragsfenster nimmt seine Maschinenliste aus prod.maschinen; auf
// der Startseite ist die oft noch leer, dann stünde die Maschine leer da
async function auftragOeffnen(j) {
  if (!(alt.prod.maschinen || []).length) {
    try { alt.prod.maschinen = await alt.ladeMaschinen(false, true); } catch { /* Fenster geht trotzdem auf */ }
  }
  alt.planAuftragDialog(j, {});
}

export default function OhneWbg({ auffrischen }) {
  const zeigen = !alt.istExtern() && alt.meineRolle() !== "dienst";
  const { daten } = useDaten(zeigen ? ohneWbgLaden : keine, [auffrischen, zeigen]);
  if (!daten || !daten.length) return null;
  return (
    <section className="karte ohnewbg" id="db-ohnewbg">
      <h2>Laufend ohne WBG <span className="marke">{daten.length}</span></h2>
      <div className="heuteoffen__liste">
        {daten.map(({ m, j }) => (
          <button key={j.id} className="heuteoffen__maschine" data-ohnewbg={j.id}
            title="Auftrag öffnen" onClick={() => auftragOeffnen(j)}>
            <b>{m.machine_number || m.name}</b>
            <span className="klein">{j.job_number || "ohne HOCO Nr."}{j.fa_nr ? " · FA " + j.fa_nr : ""}</span>
          </button>))}
      </div>
    </section>
  );
}
