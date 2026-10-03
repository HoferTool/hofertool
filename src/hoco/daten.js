// =================================================================
//  HOCO: Daten holen
//  Die Stammdaten (hoco_parts) und die Nummern auf der Planwand merkt
//  sich das alte Programm kurz (stammGemerkt); gesucht wird im Gerät.
// =================================================================
import { alt } from "../bruecke.jsx";

// Alle Nummern samt denen, die bisher nur auf der Planwand stehen.
// Wer schreiben darf, trägt fehlende Nummern gleich in die Stammdaten
// ein; Grösse und Zeichnung kommen aus dem jüngsten Auftrag.
export async function hocoLaden(darf) {
  let teile = await alt.ladeHoco("");
  let ausPlan = {};
  try {
    ausPlan = await alt.ladeHocoAusAuftraegen();
    const fehlen = Object.keys(ausPlan).filter((nr) => !teile.some((t) => t.hoco_nr === nr));
    if (fehlen.length && darf) {
      const neuZeilen = fehlen.map((nr) => ({
        hoco_nr: nr,
        material: alt.groesseAusAuftrag(ausPlan[nr]) || null,
        zeichnung_url: ausPlan[nr].drawing_url || null,
      }));
      const r = await alt.db.from("hoco_parts")
        .upsert(neuZeilen, { onConflict: "hoco_nr", ignoreDuplicates: true });
      // Gedächtnis verwerfen, sonst fehlen dieselben Nummern beim
      // nächsten Laden wieder und werden erneut nachgetragen.
      if (!r.error) { alt.stammVergessen(); teile = await alt.ladeHoco(""); }
    }
  } catch (f) { /* geht auch ohne */ }
  return { teile, ausPlan };
}

// Alles zu einer Nummer: FA Nummern, wo sie lief, Einrichtblätter je
// Maschinentyp und weitere Dokumente
export async function teilLaden(t, darf) {
  const db = alt.db;
  // Die FA Nummern stehen an den Aufträgen. Hier werden sie zum Teil
  // zusammengetragen, damit man sieht, wann es gelaufen ist.
  let faListe = [], vomAuftrag = null;
  try {
    const r = await db.from("jobs")
      .select("id, fa_nr, planned_from, plan_status, drawing_url, wbg_url, wz_historie_url")
      .eq("job_number", t.hoco_nr)
      .order("planned_from", { ascending: false }).limit(50);
    faListe = (r.data || []).filter((x) => x.fa_nr);

    // Aufträge, die noch nicht laufen, bekommen die Zeichnung aus den
    // Stammdaten. Laufende und abgeschlossene bleiben, wie sie sind —
    // dort soll sich rückwirkend nichts ändern.
    if (t.zeichnung_url && darf) {
      const offen = (r.data || []).filter((x) => !x.drawing_url
        && ["geplant", "ruesten"].indexOf(x.plan_status || "geplant") !== -1);
      if (offen.length) {
        const u = await db.from("jobs").update({ drawing_url: t.zeichnung_url })
          .in("id", offen.map((x) => x.id));
        if (!u.error) {
          offen.forEach((x) => { x.drawing_url = t.zeichnung_url; });
          alt.meldung("Zeichnung auf " + offen.length
            + (offen.length === 1 ? " geplanten Auftrag" : " geplante Aufträge") + " übertragen.");
        }
      }
    }
    const mitZeichnung = (r.data || []).find((x) => x.drawing_url);
    if (mitZeichnung) vomAuftrag = mitZeichnung.drawing_url;
  } catch (f) { /* Beiwerk */ }

  // Auf welchen Maschinen lief das Teil — je Maschine nur der jüngste
  // Auftrag, neueste oben. So sieht man auf einen Blick, wann von einer
  // Maschine auf eine andere gewechselt wurde.
  const maschinenlauf = [];
  try {
    const h = await db.from("jobs")
      .select("id, fa_nr, machine_id, planned_from, ended_at, plan_status,"
        + " target_quantity, stand, machines(name, machine_number)")
      .eq("job_number", t.hoco_nr)
      .order("planned_from", { ascending: false })
      .limit(400);
    if (!h.error) {
      const gesehen = {};
      (h.data || []).forEach((j) => {
        const k = j.machine_id || "ohne";
        if (gesehen[k]) return;
        gesehen[k] = true;
        maschinenlauf.push(j);
      });
    }
  } catch (f) { /* Beiwerk */ }

  // Auf welchen Maschinentypen die Nummer gelaufen ist — dazu je Typ
  // das Einrichtblatt: eines für genau diese HOCO Nr. oder die Vorlage
  // am Maschinentyp.
  let typenGenutzt = [];
  try {
    const [maschinen, typen, sheets] = await Promise.all([
      alt.ladeMaschinen(true), alt.ladeTypen(),
      db.from("hoco_type_data").select("type_id, blatt_url").eq("hoco_nr", t.hoco_nr),
    ]);
    const namen = {};
    (typen || []).forEach((x) => { namen[x.id] = x.name; });
    const sammlung = {};
    const dazu = (typId) => {
      if (!typId) return null;
      if (!sammlung[typId]) {
        sammlung[typId] = { typId, name: namen[typId] || "ohne Typ", maschinen: [], eigenes: null, vorlage: null };
      }
      return sammlung[typId];
    };
    maschinenlauf.forEach((j) => {
      const m = (maschinen || []).find((x) => x.id === j.machine_id);
      const e = m && dazu(m.type_id);
      if (!e) return;
      const bez = (m.machine_number ? m.machine_number + " " : "") + (m.name || "");
      if (e.maschinen.indexOf(bez) === -1) e.maschinen.push(bez);
    });
    (typen || []).forEach((t2) => { const e = sammlung[t2.id]; if (e) e.vorlage = t2.blatt_url || null; });
    ((sheets && sheets.data) || []).forEach((s) => { const e = dazu(s.type_id); if (e) e.eigenes = s.blatt_url || null; });
    typenGenutzt = Object.keys(sammlung).map((k) => sammlung[k])
      .sort((a, c) => String(a.name).localeCompare(String(c.name)));
  } catch (f) { /* dann eben ohne */ }

  let dokumente = [];
  try { dokumente = await alt.dokListe({ hoco: t.hoco_nr }); } catch (f) { /* ohne */ }

  return { faListe, vomAuftrag, maschinenlauf, typenGenutzt, dokumente };
}

// Ein PDF in die Ablage „zeichnungen“ laden und die Adresse liefern
export async function pdfHochladen(pfad, datei) {
  const db = alt.db;
  const r = await db.storage.from("zeichnungen").upload(pfad, datei, { contentType: "application/pdf" });
  if (r.error) throw r.error;
  return db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
}

// Die HOCO Nr. ist aufgebaut als Kunde-Teil, etwa 10007-0381. Die
// ersten fünf Stellen sind die Kundennummer; daraus ergeben sich die
// beiden Ordnerebenen Nummernbereich (je 100) und Kunde.
export function kundeVon(nr) {
  const teil = String(nr || "").split("-")[0].replace(/\D/g, "");
  return teil || "?";
}
export function bereichVon(kunde) {
  const z = parseInt(kunde, 10);
  if (isNaN(z)) return null;
  return Math.floor(z / 100) * 100;
}
