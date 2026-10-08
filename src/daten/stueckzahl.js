// =================================================================
//  STÜCKZAHL UND STÜCKZEIT
//  Gemeinsam für Pad Mode, Produktion, Planwand und Auftragsfenster.
//
//  Heute schon produziert? (Wunsch Patrick 8. Oktober 2026): Manche
//  tragen den Zähler am Morgen ein, andere mehrmals am Tag. Bei der
//  ersten Eingabe eines Auftrags an einem Tag fragt die App darum
//  nach. „Nein“ heisst, die Zunahme ist das Tagewerk des letzten
//  Arbeitstags: Der Stand wird dort abgelegt. „Ja“ legt ihn auf heute.
//  Jeder weitere Stand am selben Tag gehört dann zu heute. Nach einem
//  „Nein“ fragt die nächste Eingabe wieder, weil es dann noch keinen
//  Stand von heute gibt.
//
//  Stückzeit (Sekunden, je HOCO Nr. und Maschinentyp in
//  hoco_type_data.stueckzeit_s): Ohne sie lässt sich ab dem 8. Oktober
//  2026 kein Auftrag mehr beenden. Fehlt sie beim Beenden, fragt die
//  App gleich danach; ohne Eingabe bleibt der Auftrag offen.
// =================================================================
import { alt } from "../bruecke.jsx";
import { auswahlDialog } from "../teile/Dialoge.jsx";
import { zifferblock } from "../pad/Zifferblock.jsx";

const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// Der Arbeitstag (Mo–Fr) vor einem Tag: am Montag der Freitag
export function vorigerArbeitstag(tag) {
  const d = alt.ausIso(tag);
  do d.setDate(d.getDate() - 1); while (d.getDay() === 0 || d.getDay() === 6);
  return alt.isoDatum(d);
}

const tagText = (tag) => WT[alt.ausIso(tag).getDay()] + " " + alt.kurzDatum(tag);

// Auf welchen Tag ein Stand gehört, der für `datum` eingetippt wird.
// Fragt nur, wenn für heute eingetragen wird, der Auftrag nicht erst
// heute begonnen hat und für ihn heute noch kein Stand da ist.
// Liefert den Tag oder null, wenn abgebrochen wurde.
export async function standTagWaehlen(auftrag, datum) {
  const heute = alt.isoDatum(new Date());
  if (datum !== heute || !auftrag || !auftrag.id) return datum;
  if (auftrag.started_at && alt.isoDatum(new Date(auftrag.started_at)) === heute) return heute;
  try {
    const r = await alt.db.from("production_records").select("record_date")
      .eq("job_id", auftrag.id).eq("record_date", heute).limit(1);
    if (!r.error && (r.data || []).length) return heute;
  } catch (f) { /* lieber fragen */ }
  const gestern = vorigerArbeitstag(heute);
  const wahl = await auswahlDialog("Wurde heute schon produziert?", [
    { wert: "ja", text: "Ja · die Stück zählen für heute" },
    { wert: "nein", text: "Nein · die Stück zählen für " + tagText(gestern) },
  ], "Erste Stückzahl heute für " + (auftrag.job_number || "diesen Auftrag") + ".");
  if (wahl === "ja") return heute;
  if (wahl === "nein") return gestern;
  return null;
}

// Hinweis nach dem Speichern, wenn der Stand auf einen anderen Tag ging
export function standTagHinweis(tag) {
  return tag === alt.isoDatum(new Date()) ? "" : " Gezählt für " + tagText(tag) + ".";
}

// ---------- Stückzeit ----------

// Sekunden als Text, etwa „45 s“ oder „12,5 s“
export function stueckzeitText(s) {
  if (s === null || s === undefined || s === "") return "";
  return String(Number(s)).replace(".", ",") + " s";
}

export async function stueckzeitLaden(hocoNr, typId) {
  const r = await alt.db.from("hoco_type_data").select("stueckzeit_s")
    .eq("hoco_nr", hocoNr).eq("type_id", typId).limit(1);
  if (r.error) throw r.error;
  const z = (r.data || [])[0];
  return z && z.stueckzeit_s !== null && z.stueckzeit_s !== undefined ? Number(z.stueckzeit_s) : null;
}

export async function stueckzeitSetzen(hocoNr, typId, sekunden) {
  const { error } = await alt.db.from("hoco_type_data").upsert(
    { hoco_nr: hocoNr, type_id: typId, stueckzeit_s: sekunden },
    { onConflict: "hoco_nr,type_id" });
  if (error) throw error;
}

// Zifferblock für die Stückzeit. Liefert die Sekunden, 0 zum Leeren
// oder null bei Abbruch.
export async function stueckzeitFragen(titel, hinweis, wert) {
  const zahl = await zifferblock({ titel, hinweis, wert: wert ? Math.round(wert) : "" });
  if (zahl === null) return null;
  return Math.max(0, Math.round(zahl));
}

// Vor dem Beenden: Ist die Stückzeit für HOCO Nr. und Maschinentyp
// da? Sonst danach fragen. Wirft einen Fehler mit verständlichem
// Text, wenn sie fehlt; dann wird der Auftrag nicht beendet.
// Maschinen ohne Typ (die externen) haben keinen Platz dafür und
// werden darum nicht aufgehalten.
export async function stueckzeitVorDemBeenden(j) {
  if (!j || !j.job_number || !j.machine_id) return;
  const m = await alt.db.from("machines").select("type_id, name").eq("id", j.machine_id).limit(1);
  const maschine = ((m && m.data) || [])[0];
  if (!maschine || !maschine.type_id) return;
  let da = null;
  try { da = await stueckzeitLaden(j.job_number, maschine.type_id); }
  catch (f) {
    // Ohne Spalte in der Datenbank nicht aufhalten
    if (/stueckzeit_s/.test(f.message || "")) return;
    throw f;
  }
  if (da > 0) return;
  const s = await stueckzeitFragen("Stückzeit fehlt",
    "Ohne Stückzeit lässt sich " + j.job_number + " nicht beenden. Sekunden pro Stück auf "
      + (maschine.name || "dieser Maschine") + ":", "");
  if (!s) throw new Error("Ohne Stückzeit kann der Auftrag nicht beendet werden.");
  await stueckzeitSetzen(j.job_number, maschine.type_id, s);
}
