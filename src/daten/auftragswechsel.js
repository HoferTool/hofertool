// =================================================================
//  AUFTRAGSWECHSEL
//  Wann kam auf einer Maschine ein neuer Auftrag? Die Produktion
//  zeigt das als Hinweis am Tag (Wunsch 5. Oktober 2026), damit man
//  sieht, warum die Tagesleistung an so einem Tag anders aussieht.
//
//  Ein Wechsel ist der Start eines Auftrags (started_at). Nur Aufträge,
//  die wirklich liefen, zählen: Bei geplanten steht in started_at der
//  geplante Beginn, nicht ein echter Start. Der Vorgänger ist der
//  Auftrag derselben Maschine, der kurz davor beendet wurde.
// =================================================================
import { alt } from "../bruecke.jsx";

const TAG = 86400000;
// Echte Starts: läuft, QS oder fertig. Rüsten setzt kein started_at.
const GELAUFEN = ["laeuft", "qs", "fertig"];

const zweistellig = (n) => String(n).padStart(2, "0");
// Uhrzeit in der Zeit des Geräts, nicht in UTC wie in der Datenbank
export const uhrzeit = (zeit) => {
  const d = new Date(zeit);
  return isNaN(d) ? "" : zweistellig(d.getHours()) + ":" + zweistellig(d.getMinutes());
};

// Liefert { "maschinenId|2026-10-05": [{ zeit, uhr, neu, vorher }] }.
// von und bis sind Kalendertage (JJJJ-MM-TT); gezählt wird von 00:00
// des ersten bis 00:00 nach dem letzten Tag, in der Zeit des Geräts.
export async function auftragswechselLaden(maschinenIds, von, bis) {
  if (!maschinenIds.length) return {};
  const ab = alt.ausIso(von);
  const bisEnde = alt.ausIso(alt.plusTage(bis, 1));
  const jetzt = new Date();
  const ende = bisEnde < jetzt ? bisEnde : jetzt;

  const felder = "id, job_number, machine_id, plan_status, started_at, ended_at";
  const [gestartet, beendet] = await Promise.all([
    alt.db.from("jobs").select(felder).in("machine_id", maschinenIds)
      .gte("started_at", ab.toISOString()).lt("started_at", ende.toISOString()),
    // Vorgänger: bis drei Tage vor dem ersten Tag beendet
    alt.db.from("jobs").select(felder).in("machine_id", maschinenIds)
      .gte("ended_at", new Date(ab.getTime() - 3 * TAG).toISOString())
      .lt("ended_at", bisEnde.toISOString()),
  ]);
  if (gestartet.error) throw gestartet.error;
  const starts = (gestartet.data || []).filter((j) => GELAUFEN.includes(j.plan_status));
  const enden = (beendet.data || []).filter((j) => j.ended_at);

  const raus = {};
  starts.forEach((j) => {
    const start = new Date(j.started_at);
    // Der Vorgänger endet beim Wechsel, also höchstens wenige Minuten
    // nach dem Start des neuen (Zeitstempel aus zwei Schritten)
    let vorher = null;
    enden.forEach((x) => {
      if (x.id === j.id || x.machine_id !== j.machine_id) return;
      const e = new Date(x.ended_at);
      if (e - start > 10 * 60000 || start - e > 3 * TAG) return;
      if (!vorher || e > new Date(vorher.ended_at)) vorher = x;
    });
    const k = j.machine_id + "|" + alt.isoDatum(start);
    (raus[k] = raus[k] || []).push({ zeit: j.started_at, uhr: uhrzeit(j.started_at),
      neu: j.job_number || "", vorher: vorher ? vorher.job_number || "" : "" });
  });
  Object.values(raus).forEach((l) => l.sort((a, b) => String(a.zeit).localeCompare(String(b.zeit))));
  return raus;
}

// Ein Satz für den Hinweis, etwa „09:15 10007-0381 → 10844-0049“
export function wechselText(w) {
  return w.uhr + " " + (w.vorher ? w.vorher + " → " : "neu ") + w.neu;
}
