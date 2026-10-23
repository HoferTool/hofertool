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

// Speichert eine Meldung; das grosse Fenster dazu ist src/teile/QsFenster.jsx.
// Gibt true zurück, wenn gespeichert wurde.
export async function qsSpeichern(j, m, stueckRoh, notizRoh) {
  const name = alt.maschineZielText(m);
  const stueck = parseInt(String(stueckRoh || "").replace(/[^0-9]/g, ""), 10);
  if (!(stueck > 0)) { alt.meldung("Bitte eine Stückzahl grösser als 0 eintragen.", "warn"); return false; }
  const notiz = String(notizRoh || "").trim();
  if (!notiz) { alt.meldung("Notiz wird benötigt.", "warn"); return false; }
  const zeile = { job_id: j.id, machine_id: m.id, hoco_nr: j.job_number || null, stueck,
    notiz, erstellt_von: alt.profil && alt.profil.id,
    erstellt_name: alt.personName(alt.profil, "") || null };
  const { data, error } = await alt.db.from(TABELLE).insert(zeile).select("id");
  if (error) {
    alt.meldung(tabelleFehlt(error) ? "Die Datenbank kennt die Meldungen der Qualitätssicherung noch nicht (sql/qs-meldungen.sql)."
      : alt.fehlertext(error), "fehler");
    return false;
  }
  if (Array.isArray(data) && data[0]) alt.merkeSchritt("Ausschuss melden", alt.rueckWeg(TABELLE, { id: data[0].id }));
  alt.meldung("Gemeldet. Steht jetzt im Pad Mode von " + name + ".", "gut");
  return true;
}

// Quittieren = löschen, ohne Rückfrage: es ist ein Abhaken, und
// Rückgängig holt die Meldung zurück. Vorher quittiert_am setzen: so
// bleibt die Menge in qs_ausschuss für die Statistik (seit 1.159.0,
// sql/qs-ausschuss.sql); ein Löschen ohne das ist ein Rückgängig und
// nimmt sie auch dort weg. Fehlt die Spalte noch, geht es ohne.
export async function qsQuittieren(meldung) {
  await alt.db.from(TABELLE).update({ quittiert_am: new Date().toISOString() }).eq("id", meldung.id);
  const { error } = await alt.db.from(TABELLE).delete().eq("id", meldung.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return false; }
  alt.merkeSchritt("Meldung der Qualitätssicherung quittieren", alt.rueckRein(TABELLE, meldung));
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
