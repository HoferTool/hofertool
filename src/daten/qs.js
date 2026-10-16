// =================================================================
//  QS-MELDUNGEN (1.77.0, Wunsch Patrick 16. Oktober 2026)
//  Wurden bei einem laufenden Auftrag Ausschussteile aussortiert,
//  meldet man das auf der Seite QS: wie viele Stück man am Counter
//  abziehen soll und eine Notiz. Bewusst nichts automatisch (Wunsch
//  Patrick: „es soll nichts automatisch sein“): die App zieht nichts
//  ab und rechnet nichts um, sie zeigt die Meldung nur im Pad der
//  Maschine anstelle des Wetters, bis jemand quittiert. Quittieren
//  darf jeder und löscht die Meldung (mit Rückgängig).
//  Tabelle qs_meldungen aus sql/qs-meldungen.sql, nicht für Externe.
// =================================================================
import { alt } from "../bruecke.jsx";

const TABELLE = "qs_meldungen";

// Fehlt die Tabelle noch, soll die Seite das sagen und nicht abstürzen
export const tabelleFehlt = (f) => /qs_meldungen|does not exist|schema cache|PGRST205|42P01/i
  .test(String((f && (f.message || f.code)) || f || ""));

// Alle offenen Meldungen, älteste zuerst; mit maschineId nur die einer Maschine
export async function qsMeldungenLaden(maschineId) {
  let q = alt.db.from(TABELLE).select("*");
  if (maschineId) q = q.eq("machine_id", maschineId);
  const r = await alt.zeitlimit(q.order("erstellt_am"), 10000, "QS-Meldungen");
  if (r.error) throw r.error;
  return r.data || [];
}

// Fenster zum Melden. Gibt true zurück, wenn gespeichert wurde.
export async function qsMelden(j, m) {
  const name = alt.maschineZielText(m);
  const w = await alt.dialogFelder({
    titel: "Ausschuss melden",
    text: (j.job_number || "Auftrag") + " auf " + name
      + ". Die Meldung erscheint im Pad Mode dieser Maschine, bis jemand quittiert. Abgezogen wird nichts von selbst.",
    felder: [
      { name: "stueck", label: "Stück am Counter abziehen", ziffern: true, pflicht: true },
      { name: "notiz", label: "Notiz", typ: "textarea", pflicht: true,
        hinweis: "Was wurde aussortiert und warum?" }],
    bestaetigen: "Melden" });
  if (!w) return false;
  const stueck = parseInt(String(w.stueck).replace(/[^0-9]/g, ""), 10);
  if (!(stueck > 0)) { alt.meldung("Bitte eine Stückzahl grösser als 0 eintragen.", "warn"); return false; }
  const zeile = { job_id: j.id, machine_id: m.id, hoco_nr: j.job_number || null, stueck,
    notiz: String(w.notiz || "").trim(), erstellt_von: alt.profil && alt.profil.id,
    erstellt_name: alt.personName(alt.profil, "") || null };
  const { data, error } = await alt.db.from(TABELLE).insert(zeile).select("id");
  if (error) {
    alt.meldung(tabelleFehlt(error) ? "Die Datenbank kennt die QS-Meldungen noch nicht (sql/qs-meldungen.sql)."
      : alt.fehlertext(error), "fehler");
    return false;
  }
  if (Array.isArray(data) && data[0]) alt.merkeSchritt("Ausschuss melden", alt.rueckWeg(TABELLE, { id: data[0].id }));
  alt.meldung("Gemeldet. Steht jetzt im Pad Mode von " + name + ".", "gut");
  return true;
}

// Quittieren = löschen, ohne Rückfrage: es ist ein Abhaken, und
// Rückgängig holt die Meldung zurück
export async function qsQuittieren(meldung) {
  const { error } = await alt.db.from(TABELLE).delete().eq("id", meldung.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return false; }
  alt.merkeSchritt("QS-Meldung quittieren", alt.rueckRein(TABELLE, meldung));
  alt.meldung("Quittiert.", "gut");
  return true;
}

// Bei jeder Änderung an den Meldungen, über Realtime; null, wenn es
// das nicht gibt. Gibt eine Funktion zum Abmelden zurück.
export function qsBeobachten(rueckruf) {
  const db = alt.db;
  if (!db || typeof db.channel !== "function") return () => {};
  let entpreller = null;
  const kanal = db.channel("qs-" + Date.now() + "-" + Math.random().toString(36).slice(2))
    .on("postgres_changes", { event: "*", schema: "public", table: TABELLE }, () => {
      clearTimeout(entpreller);
      entpreller = setTimeout(rueckruf, 300);
    });
  kanal.subscribe();
  return () => { clearTimeout(entpreller); try { db.removeChannel(kanal); } catch (f) { /* egal */ } };
}

export function wannText(iso) {
  return iso ? alt.datumZeitKurz(iso) : "";
}
