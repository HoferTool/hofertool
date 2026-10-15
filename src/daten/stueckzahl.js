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
//  2026 kein Auftrag mehr beenden. Beim Beenden fragt die App jedes Mal
//  danach (bestätigen oder neu); ohne Eingabe bleibt der Auftrag offen.
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

// ---------- Letzte Stückzahl beim Auftragswechsel ----------

// Wird ein Auftrag beendet oder von einem neuen auf derselben Maschine
// abgelöst, fragt die App noch einmal nach dem Zählerstand (Wunsch
// Patrick 12. Oktober 2026: „nochmal die Chance, eine Stückzahl
// einzugeben, wenn man am gleichen Tag den nächsten anfängt“). Sonst
// fehlt, was der alte Auftrag bis zum Wechsel noch gemacht hat: Am
// nächsten Morgen läuft im Pad und in der Produktion schon der neue.
// Gefragt wird nur, wenn der Auftrag lief oder schon Zahlen hat.
// „Überspringen“ lässt alles, wie es ist, und hält den Wechsel nie auf.
export async function letzteStueckzahlFragen(j) {
  if (!j || !j.id || !j.machine_id) return;
  let bisher = null;
  try {
    const r = await alt.db.from("production_records").select("record_date, quantity")
      .eq("job_id", j.id).order("record_date", { ascending: false }).limit(1);
    const z = ((r && r.data) || [])[0];
    if (z) bisher = Number(z.quantity) || 0;
  } catch (f) { /* dann eben ohne „bisher“ */ }
  if (bisher === null && j.plan_status !== "laeuft") return;

  const zahl = await zifferblock({ titel: "Letzte Stückzahl · " + (j.job_number || "Auftrag"),
    hinweis: "Auftragswechsel: Zählerstand von " + (j.job_number || "diesem Auftrag")
      + ", gesamt seit Auftragsbeginn · bisher " + alt.zahlText(bisher || 0)
      + ". Ohne Änderung „Überspringen“.",
    wert: "", abbrechen: "Überspringen" });
  if (zahl === null) return;
  const neu = Math.max(0, Math.round(zahl));
  const tag = await standTagWaehlen(j, alt.isoDatum(new Date()));
  if (!tag) return;
  let vorher = null;
  try {
    const r = await alt.db.from("production_records").select("quantity")
      .eq("job_id", j.id).eq("record_date", tag).limit(1);
    const z = ((r && r.data) || [])[0];
    if (z) vorher = z.quantity;
  } catch (f) { /* Rückgängig löscht dann die Zeile */ }
  await alt.speichereStand(j.machine_id, tag, neu, j.id);
  alt.merkeSchritt("Letzte Stückzahl " + (j.job_number || ""), vorher === null
    ? alt.rueckWeg("production_records", { machine_id: j.machine_id, record_date: tag, job_id: j.id })
    : alt.rueckStand(j.machine_id, tag, vorher, j.id));
  alt.meldung("Stückzahl " + alt.zahlText(neu) + " für " + (j.job_number || "den Auftrag")
    + " eingetragen." + standTagHinweis(tag));
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
// oder null bei Abbruch. Ein vorhandener Wert steht da und lässt sich
// mit „Eintragen“ übernehmen, die erste Ziffer ersetzt ihn.
// mitLoeschen: Ist schon eine Stückzeit da, gibt es den Knopf
// „Stückzeit löschen“; dann kommt "loeschen" zurück.
export async function stueckzeitFragen(titel, hinweis, wert, mitLoeschen) {
  const zahl = await zifferblock({ titel, hinweis, wert: wert ? Math.round(wert) : "", ersetzen: true,
    loeschen: mitLoeschen && wert ? "Stückzeit löschen" : undefined });
  if (zahl === null || zahl === "loeschen") return zahl;
  return Math.max(0, Math.round(zahl));
}

// ---------- Art. Info: Stückzeit und Länge ----------
// (Wunsch Patrick 15. Oktober 2026) Die Kachel im Pad heisst „Art. Info“
// und öffnet ein Fenster mit Stückzeit und Länge des Fertigteils. Die
// Länge gehört zur HOCO Nr. (hoco_parts.teil_laenge_mm), die Stückzeit
// zu HOCO Nr. und Maschinentyp. Der Durchmesser kommt vom Material
// (Aussendurchmesser der Stange), darum fragt hier niemand danach.

// Millimeter als Text, etwa „7 mm“ oder „12,5 mm“
export function laengeText(mm) {
  if (mm === null || mm === undefined || mm === "" || !Number(mm)) return "";
  return String(Math.round(Number(mm) * 100) / 100).replace(".", ",") + " mm";
}

// Zahl aus der Eingabe, Komma wie Punkt; leer → 0, Unsinn → NaN
function eingabeZahl(s) {
  const t = String(s || "").trim().replace(/\s|’|'/g, "").replace(",", ".");
  if (!t) return 0;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

// Länge und ob sie bestätigt ist. null, wenn die Spalte fehlt
// (sql/material-uebersicht.sql noch nicht ausgeführt).
export async function laengeLaden(hocoNr) {
  const r = await alt.db.from("hoco_parts").select("teil_laenge_mm, teil_mass_bestaetigt")
    .eq("hoco_nr", hocoNr).limit(1);
  if (r.error) {
    if (/teil_laenge_mm|teil_mass/.test(r.error.message || "")) return null;
    throw r.error;
  }
  const z = (r.data || [])[0] || {};
  const mm = z.teil_laenge_mm !== null && z.teil_laenge_mm !== undefined ? Number(z.teil_laenge_mm) : null;
  return { mm, sicher: !!z.teil_mass_bestaetigt };
}

// Wer die Länge hier eintippt, hat sie geprüft: sie gilt als bestätigt
export async function laengeSetzen(hocoNr, mm, quelle) {
  const r = await alt.db.from("hoco_parts").update({ teil_laenge_mm: mm,
    teil_mass_bestaetigt: !!mm, teil_mass_quelle: mm ? (quelle || "Pad") : null })
    .eq("hoco_nr", hocoNr).select("hoco_nr");
  if (r.error) throw r.error;
  if (!(r.data || []).length) {
    const n = await alt.db.from("hoco_parts").insert({ hoco_nr: hocoNr, teil_laenge_mm: mm,
      teil_mass_bestaetigt: !!mm, teil_mass_quelle: mm ? (quelle || "Pad") : null });
    if (n.error) throw n.error;
  }
}

// Das Fenster. o: { titel, text, hoco, auf, zeit, laenge ({mm, sicher}
// oder null ohne Spalte), mitZeit, mitLaenge, pflicht }
// → { zeit, laenge } (0 = leer) oder null bei Abbruch
export async function artInfoFragen(o) {
  const felder = [];
  if (o.mitZeit) felder.push({ name: "zeit", label: "Stückzeit in Sekunden", dezimal: true,
    wert: o.zeit ? String(o.zeit).replace(".", ",") : "", pflicht: !!o.pflicht,
    hinweis: "pro Stück auf " + (o.auf || "dieser Maschine") });
  const l = o.laenge;
  if (o.mitLaenge && l) felder.push({ name: "laenge", label: "Länge des Teils in mm", dezimal: true,
    wert: l.mm ? String(l.mm).replace(".", ",") : "", pflicht: !!o.pflicht,
    hinweis: l.mm && !l.sicher ? "Aus dem Einrichtblatt gelesen, bitte prüfen."
      : "Länge des fertigen Teils. Den Durchmesser nimmt die App vom Material." });
  if (!felder.length) return { zeit: 0, laenge: 0 };
  for (;;) {
    const w = await alt.dialogFelder({ titel: o.titel, text: o.text, felder,
      bestaetigen: o.pflicht ? "Stimmt so" : "Speichern" });
    if (!w) return null;
    const zeit = o.mitZeit ? eingabeZahl(w.zeit) : 0;
    const laenge = o.mitLaenge && l ? eingabeZahl(w.laenge) : 0;
    if (Number.isNaN(zeit) || Number.isNaN(laenge) || laenge > 3000) {
      alt.meldung("Bitte nur Zahlen eintragen, etwa 45 oder 7,5.", "warn");
      felder.forEach((f) => { f.wert = w[f.name]; });
      continue;
    }
    return { zeit: Math.round(zeit * 10) / 10, laenge: Math.round(laenge * 100) / 100 };
  }
}

// Vor dem Beenden fragt die App jedes Mal nach Stückzeit und Länge,
// auch wenn die HOCO Nr. wiederkommt (Wunsch Patrick 8. und
// 15. Oktober 2026: prüfen, ob es sich verändert hat, damit immer
// aktuell ist, wie lange es geht). Was da ist, steht schon im Fenster:
// „Stimmt so“ bestätigt, neue Zahlen ersetzen. Ohne Stückzeit oder
// Länge oder bei Abbruch wirft sie einen Fehler mit verständlichem
// Text; dann wird der Auftrag nicht beendet.
// Maschinen ohne Typ (die externen) haben keinen Platz dafür und
// werden darum nicht aufgehalten; Externe sehen die Länge nicht
// (Material ist nichts für sie, Entscheid Patrick 15. Oktober 2026).
export async function stueckzeitVorDemBeenden(j) {
  if (!j || !j.job_number || !j.machine_id) return;
  const m = await alt.db.from("machines").select("type_id, name").eq("id", j.machine_id).limit(1);
  const maschine = ((m && m.data) || [])[0];
  if (!maschine || !maschine.type_id) return;
  let da = null, mitZeit = true;
  try { da = await stueckzeitLaden(j.job_number, maschine.type_id); }
  catch (f) {
    // Ohne Spalte in der Datenbank nicht aufhalten
    if (!/stueckzeit_s/.test(f.message || "")) throw f;
    mitZeit = false;
  }
  let laenge = null;
  if (!alt.istExtern()) { try { laenge = await laengeLaden(j.job_number); } catch (f) { laenge = null; } }
  const mitLaenge = !!laenge;
  if (!mitZeit && !mitLaenge) return;
  const auf = (maschine.name || "dieser Maschine");
  const vollstaendig = (!mitZeit || da > 0) && (!mitLaenge || (laenge.mm > 0 && laenge.sicher));
  const w = await artInfoFragen({ hoco: j.job_number, auf, zeit: da, laenge, mitZeit, mitLaenge, pflicht: true,
    titel: vollstaendig ? "Art. Info bestätigen" : "Art. Info fehlt",
    text: vollstaendig
      ? "Stimmt das für " + j.job_number + " auf " + auf + " noch? Sonst die neue Zahl eintragen."
      : "Ohne " + (mitLaenge ? "Stückzeit und Länge" : "Stückzeit") + " lässt sich " + j.job_number
        + " nicht beenden." });
  if (!w) throw new Error("Ohne " + (mitLaenge ? "Stückzeit und Länge" : "Stückzeit")
    + " kann der Auftrag nicht beendet werden.");
  if (mitZeit && !w.zeit) throw new Error("Ohne Stückzeit kann der Auftrag nicht beendet werden.");
  if (mitLaenge && !w.laenge) throw new Error("Ohne Länge kann der Auftrag nicht beendet werden.");
  if (mitZeit && w.zeit !== Number(da || 0)) await stueckzeitSetzen(j.job_number, maschine.type_id, w.zeit);
  if (mitLaenge && (w.laenge !== Number(laenge.mm || 0) || !laenge.sicher)) await laengeSetzen(j.job_number, w.laenge);
}
