// =================================================================
//  AUFTRAG SPEICHERN UND LÖSCHEN
//  Was beim Speichern im Auftragsfenster passiert: FA Nr. prüfen,
//  schreiben, Zustand über dieselbe Stelle wie Produktion und Pad
//  setzen, Stammdaten der HOCO Nr. nachziehen, Platz schaffen,
//  alte Dateien aufräumen und einen Schritt für Rückgängig merken.
//  b ist der Behälter der Planwand; planAktualisieren(b) zeichnet
//  sie neu (ausserhalb der Planwand frischt sich die Ansicht selbst
//  auf, siehe planAktualisieren).
// =================================================================
import { alt } from "../bruecke.jsx";

// Die FA Nr. gibt es genau einmal. Steht sie schon auf einem anderen
// Auftrag, wird abgebrochen, bevor die Datenbank es mit einer
// unverständlichen Meldung tut.
async function faNrFrei(faNr, auftrag) {
  if (!faNr) return true;
  try {
    const r = await alt.db.from("jobs").select("id, job_number, machine_id")
      .eq("fa_nr", faNr).limit(2);
    const fremd = (r.data || []).filter((x) => !auftrag || x.id !== auftrag.id);
    if (fremd.length) {
      alt.meldung("Die FA Nr. " + faNr + " ist schon bei " + fremd[0].job_number
        + " vergeben. Jede Nummer gibt es nur einmal.", "fehler");
      return false;
    }
  } catch (f) { /* dann greift die Datenbank */ }
  return true;
}

// Rückweg: Material und Zeichnung vom Auftrag in die Stammdaten der
// HOCO Nr. Gefüllt wird nur, was dort noch leer ist. Steht schon
// etwas anderes da, wird nachgefragt, statt still zu überschreiben.
async function stammdatenNachziehen(hocoNummer, daten) {
  const db = alt.db;
  try {
    const r = await db.from("hoco_parts").select("*").eq("hoco_nr", hocoNummer).limit(1);
    const teilJetzt = (r.data || [])[0];
    if (!teilJetzt) {
      await db.from("hoco_parts").upsert([{
        hoco_nr: hocoNummer,
        material: daten.material_bez || null,
        zeichnung_url: daten.drawing_url || null,
      }], { onConflict: "hoco_nr", ignoreDuplicates: true });
      return;
    }
    const nach = {};
    if (!teilJetzt.material && daten.material_bez) nach.material = daten.material_bez;
    if (!teilJetzt.zeichnung_url && daten.drawing_url) nach.zeichnung_url = daten.drawing_url;
    if (teilJetzt.material && daten.material_bez
        && teilJetzt.material.trim() !== daten.material_bez.trim()) {
      const uebernehmen = await alt.nachfragen({
        titel: "Material auch beim Teil ändern?",
        text: "Bei " + hocoNummer + " steht \"" + teilJetzt.material
            + "\". Am Auftrag hast du \"" + daten.material_bez
            + "\" eingetragen. Soll das Teil mitgeändert werden? "
            + "Es gilt dann für alle künftigen Aufträge.",
        bestaetigen: "Ja, beim Teil ändern",
        abbrechen: "Nein, nur dieser Auftrag" });
      if (uebernehmen) nach.material = daten.material_bez;
    }
    if (Object.keys(nach).length) await db.from("hoco_parts").update(nach).eq("hoco_nr", hocoNummer);
  } catch (f) { /* die Stammdaten holen es beim nächsten Öffnen nach */ }
}

// zu() schliesst das Fenster, sobald gespeichert ist. Scheitert etwas,
// bleibt es offen und behält die Eingaben.
export async function auftragSpeichern({ auftrag, daten, nr, b, zu }) {
  const db = alt.db, plan = alt.plan;
  if (!(await faNrFrei(daten.fa_nr, auftrag))) return;

  // Für Rückgängig: wie es vorher war — der Auftrag selbst und alle
  // Aufträge auf den betroffenen Maschinen, die nachrücken könnten
  const maschinenBetroffen = [daten.machine_id, auftrag && auftrag.machine_id].filter(Boolean);
  const vorherAndere = (plan.auftraege || [])
    .filter((x) => maschinenBetroffen.includes(x.machine_id) && (!auftrag || x.id !== auftrag.id))
    .map((x) => ({ id: x.id, planned_from: x.planned_from, planned_days: x.planned_days,
                   machine_id: x.machine_id }));
  let vorherSelbst = null;
  if (auftrag) {
    try {
      const r0 = await db.from("jobs").select("*").eq("id", auftrag.id).maybeSingle();
      // Als echte Kopie — sonst ändert sich der "alte" Stand mit
      vorherSelbst = (r0 && r0.data) ? JSON.parse(JSON.stringify(r0.data)) : null;
    } catch (f) { vorherSelbst = null; }
  }

  let fehler = null, festId = null;
  if (auftrag) {
    // Den Zustand nicht mit den übrigen Feldern schreiben, sondern
    // über dieselbe Stelle wie Produktion und Pad Mode — nur so
    // rückt beim Beenden der nächste nach und bleibt je Maschine
    // höchstens einer auf "läuft".
    const neuerZustand = daten.plan_status;
    delete daten.plan_status;
    try { await alt.aendernOhneUnbekannte("jobs", daten, "id", auftrag.id); }
    catch (f) { fehler = f; }
    if (!fehler && neuerZustand && neuerZustand !== auftrag.plan_status) {
      try {
        const rz = await alt.zustandSetzen(Object.assign({}, auftrag,
          { machine_id: daten.machine_id || auftrag.machine_id }), neuerZustand);
        if (rz.hinweis) alt.meldung(rz.hinweis);
      } catch (fz) { fehler = fz; }
    }
    if (!fehler) {
      // Örtlich nachziehen, damit das Aufräumen mit den neuen Werten rechnet
      auftrag.planned_from = daten.planned_from;
      auftrag.planned_days = daten.planned_days;
      auftrag.machine_id = daten.machine_id;
      festId = auftrag.id;
    }
  } else {
    if (!nr) { alt.meldung("HOCO Nr. wird benötigt.", "warn"); return; }
    daten.job_number = nr;
    // Ohne eigene Angabe hinter den letzten Auftrag dieser Maschine
    if (!daten.planned_from) daten.planned_from = alt.naechsterFreierTag(daten.machine_id);
    const r = await db.from("jobs").insert(daten).select();
    fehler = r.error;
    const neuerSatz = (r.data || [])[0];
    if (!fehler && neuerSatz) {
      plan.auftraege.push(Object.assign({}, daten, { id: neuerSatz.id,
        created_at: neuerSatz.created_at || new Date().toISOString() }));
      festId = neuerSatz.id;
      // Für eine neue HOCO Nr. gleich einen Stammdatenplatz anlegen,
      // sonst findet das Einrichtblatt nichts
      try {
        await db.from("hoco_parts").upsert([{
          hoco_nr: nr, material: daten.material_menge || null, zeichnung_url: daten.drawing_url || null,
        }], { onConflict: "hoco_nr", ignoreDuplicates: true });
      } catch (f) { /* kommt spätestens im HOCO-Reiter dazu */ }
    }
  }
  if (fehler) { alt.meldung(alt.fehlertext(fehler), "fehler"); return; }

  // Ein abgeschlossener Auftrag ändert die Stammdaten nicht mehr
  const hocoNummer = daten.job_number || (auftrag && auftrag.job_number);
  const istFertig = (daten.plan_status === "fertig")
    || (auftrag && (auftrag.ended_at || auftrag.plan_status === "fertig"));
  if (hocoNummer && !istFertig) await stammdatenNachziehen(hocoNummer, daten);

  // Der eingetragene Beginn gilt. Was ihm im Weg liegt, rückt nach hinten.
  const verschoben = festId ? await alt.planKonflikteLoesen(daten.machine_id, festId) : [];

  // Neue Zeichnung ersetzt die alte für die ganze Nummer, eine neue WBG
  // die alte — was nicht mehr gebraucht wird, verschwindet aus der Ablage
  if (festId) {
    const altZ = auftrag && auftrag.drawing_url, neuZ = daten.drawing_url;
    const altW = auftrag && auftrag.wbg_url, neuW = daten.wbg_url;
    try {
      if (neuZ && neuZ !== altZ && hocoNummer) await alt.zeichnungErsetzen(hocoNummer, neuZ, altZ);
      if (altW && altW !== neuW) await alt.ablageLoeschen([altW]);
    } catch (f) { /* die Datei bleibt eben liegen */ }

    // Rückgängig: neuer Auftrag wird wieder entfernt, ein geänderter
    // bekommt seine alten Werte, und was nachgerückt ist, kehrt zurück
    const nrText = hocoNummer || "Auftrag";
    const neuAngelegt = !auftrag;
    let alteWerte = null;
    if (vorherSelbst) {
      alteWerte = {};
      Object.keys(daten).concat(["plan_status", "started_at", "ended_at", "job_number"])
        .forEach((k) => { if (k in vorherSelbst) alteWerte[k] = vorherSelbst[k]; });
    }
    alt.merkeSchritt((neuAngelegt ? "Anlegen von " : "Ändern von ") + nrText, [
      neuAngelegt ? alt.rueckWeg("jobs", { id: festId })
        : (alteWerte ? alt.rueckSetz("jobs", alteWerte, { id: festId }) : null),
    ].concat(vorherAndere.map((x) => alt.rueckSetz("jobs", { planned_from: x.planned_from,
      planned_days: x.planned_days, machine_id: x.machine_id }, { id: x.id }))));
  }

  zu();
  alt.meldung(verschoben.length
    ? "Gespeichert. " + verschoben.length
      + (verschoben.length === 1 ? " Auftrag ist" : " Aufträge sind") + " nachgerückt."
    : "Gespeichert.");
  alt.planAktualisieren(b);
}

// Keine Rückfrage — die Frage nach der Lücke kommt ohnehin, und ein
// Versehen lässt sich mit Rückgängig zurücknehmen. zu() schliesst das
// Fenster, sobald gelöscht ist.
export async function auftragLoeschen(auftrag, b, zu) {
  const db = alt.db, plan = alt.plan;
  let nachruecken = false;
  if (auftrag.planned_from) {
    const eigenesEnde = alt.letzterArbeitstag(auftrag.planned_from, auftrag.planned_days || 1);
    const dahinter = (plan.auftraege || []).filter((x) =>
      x.id !== auftrag.id && x.machine_id === auftrag.machine_id
      && x.planned_from && x.planned_from > eigenesEnde && x.plan_status !== "fertig");
    if (dahinter.length) {
      nachruecken = await alt.nachfragen({
        titel: "Lücke schliessen?",
        text: "Der Auftrag wird gelöscht. Sollen die " + dahinter.length
            + " nachfolgenden Aufträge auf dieser Maschine bündig nachrücken?",
        bestaetigen: "Ja, nachrücken" });
    }
  }

  // Für das Zurücknehmen den ganzen Datensatz sichern — samt der
  // erfassten Stückzahlen
  const sicherung = await db.from("jobs").select("*").eq("id", auftrag.id).single();
  const zahlen = await db.from("production_records").select("*").eq("job_id", auftrag.id);
  await db.from("production_records").delete().eq("job_id", auftrag.id);
  const { error } = await db.from("jobs").delete().eq("id", auftrag.id);

  const vorherNachrueck = [];
  if (!error && nachruecken) {
    // Örtlich entfernen, damit das Aufrücken nicht mit ihm rechnet
    const i = (plan.auftraege || []).findIndex((x) => x.id === auftrag.id);
    if (i >= 0) plan.auftraege.splice(i, 1);
    const zurueck = await alt.planAufruecken(auftrag.machine_id, auftrag.planned_from, auftrag.id);
    zurueck.forEach((z) => vorherNachrueck.push(z));
  }

  zu();
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  const anzahl = (zahlen.data || []).length;
  if (sicherung.data) {
    // Erst der Auftrag, dann die Zahlen: sie zeigen auf ihn. Die Zahlen
    // als upsert, falls am selben Tag inzwischen ein anderer Eintrag steht.
    alt.merkeSchritt("Löschen von " + auftrag.job_number,
      vorherNachrueck.map((v) => alt.rueckSetz("jobs", { planned_from: v.von }, { id: v.id }))
        .concat([alt.rueckRein("jobs", sicherung.data),
          anzahl ? alt.rueckRein("production_records", zahlen.data,
            "machine_id,record_date,job_id|machine_id,record_date") : null]));
  }
  alt.meldung(anzahl
    ? "Auftrag und " + anzahl + " Stückzahleinträge gelöscht. Mit Strg+Z zurücknehmen."
    : "Auftrag gelöscht. Mit Strg+Z zurücknehmen.");
  alt.planAktualisieren(b);
}
