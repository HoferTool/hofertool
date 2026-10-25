// =================================================================
//  MASCHINEN UND TYPEN
//  Seit 1.134.0 auf der Seite Maschinen (src/seiten/Maschinen.jsx),
//  nicht mehr in der Produktion. Seit 1.177.0 nur noch die Aktionen
//  für Parks und Maschinen (`aktion`); den Reiter Typen gibt es nicht
//  mehr, die Typen stecken im Fenster „⚙ Typ“ (Typen.jsx).
//
//  Die Grunddaten kommen aus der Produktion (prod.parks und
//  prod.maschinen, hier auch die ausgeblendeten). Nach jeder
//  Änderung wird das Stammdaten-Gedächtnis verworfen und neu geladen.
// =================================================================
import { alt } from "../../bruecke.jsx";

// Was die Datenbank meldet, kommt als Meldung unten rechts
// rueck: optional der Schritt für Rückgängig, [Text, Schritte]
async function senden(anfrage, gut, neuLaden, rueck) {
  const { error } = await anfrage;
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return false; }
  if (rueck) alt.merkeSchritt(rueck[0], rueck[1]);
  if (gut) alt.meldung(gut);
  neuLaden();
  return true;
}

// Eine Rückfrage, dann wird gelöscht (Wunsch 6. Oktober 2026: nur einmal fragen)
function loeschenFragen(titel, name, warnung, was) {
  return alt.nachfragen({ titel,
    text: "Soll " + name + " gelöscht werden? " + (warnung ? warnung + " " : "")
      + "Danach ist " + was + " weg. Deaktivieren wäre der sichere Weg.",
    bestaetigen: "Löschen", gefahr: true });
}

// Lehnt die Datenbank ab (es hängen noch Zahlen daran), dürfen
// Administratoren alles samt Anhang löschen.
async function hartLoeschen(error, verlust, rpc, argumente, neuLaden) {
  if (!alt.istAdmin()) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  const hart = await alt.nachfragen({
    titel: "Löschen wurde abgelehnt",
    text: alt.fehlertext(error) + " Als Administrator kannst du trotzdem löschen. "
      + "Dabei gehen " + verlust + " unwiderruflich verloren.",
    bestaetigen: "Trotzdem alles löschen", gefahr: true });
  if (!hart) return;
  const r = await alt.db.rpc(rpc, argumente);
  if (r.error) alt.meldung(alt.fehlertext(r.error), "fehler");
  else { alt.meldung(r.data || "Gelöscht."); neuLaden(); }
}

async function deaktivierenFragen(titel, was) {
  return alt.nachfragen({ titel,
    text: was + " verschwindet aus der Erfassung. Alle Zahlen bleiben erhalten.",
    bestaetigen: "Deaktivieren", gefahr: true });
}

export const aktion = {
  async parkNeu(neuLaden) {
    const w = await alt.dialogFelder({ titel: "Neuer Maschinenpark",
      felder: [{ name: "name", label: "Name", pflicht: true, platzhalter: "z. B. Langdreherpark" }],
      bestaetigen: "Anlegen" });
    if (w) senden(alt.db.from("machine_parks").insert({ name: w.name }), "Maschinenpark angelegt.", neuLaden);
  },

  async parkUmbenennen(p, neuLaden) {
    const w = await alt.dialogFelder({ titel: "Maschinenpark umbenennen",
      felder: [{ name: "name", label: "Name", wert: p.name, pflicht: true }] });
    if (!w || w.name === p.name) return;
    senden(alt.db.from("machine_parks").update({ name: w.name }).eq("id", p.id), "Umbenannt.", neuLaden,
      ["Umbenennen von " + p.name, alt.rueckSetz("machine_parks", { name: p.name }, { id: p.id })]);
  },

  async parkAktiv(p, neuLaden) {
    const ein = !p.is_active;
    if (!ein && !(await deaktivierenFragen("Maschinenpark deaktivieren", "Der Park"))) return;
    senden(alt.db.from("machine_parks").update({ is_active: ein }).eq("id", p.id), null, neuLaden,
      [(ein ? "Aktivieren von " : "Deaktivieren von ") + p.name,
        alt.rueckSetz("machine_parks", { is_active: !ein }, { id: p.id })]);
  },

  async parkLoeschen(p, anzahl, neuLaden) {
    const ok = await loeschenFragen("Maschinenpark löschen", '"' + p.name + '"',
      anzahl > 0 ? "Achtung: " + anzahl + " Maschinen sind noch zugeordnet." : "", "der Park");
    if (!ok) return;
    const vorher = await alt.rueckSichern("machine_parks", { id: p.id });
    const { error } = await alt.db.from("machine_parks").delete().eq("id", p.id);
    if (!error) {
      alt.merkeSchritt("Löschen von " + p.name, alt.rueckRein("machine_parks", vorher));
      alt.meldung("Maschinenpark gelöscht."); neuLaden(); return;
    }
    hartLoeschen(error, "ALLE Maschinen, Stückzahlen, Aufträge und Kontrollmeldungen dieses Parks",
      "park_hart_loeschen", { p_park_id: p.id }, neuLaden);
  },

  // imPark: die Maschinen des Parks; die neue kommt hinter die letzte
  // ihres Typs, damit die Typen als Block zusammenbleiben
  async maschineNeu(parkId, neuLaden, imPark) {
    let typen = [];
    try { typen = await alt.ladeTypen(); } catch (f) { /* geht auch ohne */ }
    const w = await alt.dialogFelder({ titel: "Neue Maschine",
      felder: [
        { name: "name", label: "Name", pflicht: true, platzhalter: "z. B. Maschine 01" },
        { name: "nummer", label: "Maschinennummer", platzhalter: "kann leer bleiben" },
        { name: "typ", label: "Typ", auswahl: [["", "kein Typ"]].concat(typen.map((t) => [t.id, t.name])), wert: "" }],
      bestaetigen: "Anlegen" });
    if (!w) return;
    const neu = { park_id: parkId, name: w.name, machine_number: w.nummer || null, type_id: w.typ || null };
    if (imPark && imPark.length) {
      const gleiche = imPark.filter((m) => (m.type_id || null) === neu.type_id);
      const nach = gleiche.length ? gleiche[gleiche.length - 1] : imPark[imPark.length - 1];
      const nr = (nach.sort_order || 0) + 1;
      // Was dahinter steht, rückt eins weiter
      for (const m of imPark.filter((x) => (x.sort_order || 0) >= nr)) {
        await alt.db.from("machines").update({ sort_order: (m.sort_order || 0) + 1 }).eq("id", m.id);
      }
      neu.sort_order = nr;
    }
    senden(alt.db.from("machines").insert(neu), "Maschine angelegt.", neuLaden);
  },

  async maschineBearbeiten(m, neuLaden) {
    // Der Typ bestimmt den ganzen Werkzeugaufbau. Gibt es noch
    // keinen, bleibt das Feld einfach leer.
    let typen = [];
    try { typen = await alt.ladeTypen(); } catch (f) { /* geht auch ohne */ }
    const w = await alt.dialogFelder({ titel: "Maschine bearbeiten",
      felder: [
        { name: "name", label: "Name", wert: m.name, pflicht: true },
        { name: "nummer", label: "Maschinennummer", wert: m.machine_number || "" },
        { name: "typ", label: "Typ", auswahl: [["", "kein Typ"]].concat(typen.map((t) => [t.id, t.name])),
          wert: m.type_id || "", hinweis: "Legt fest, welche Werkzeugplätze die Maschine hat" }] });
    if (!w) return;
    senden(alt.db.from("machines").update({ name: w.name, machine_number: w.nummer || null,
      type_id: w.typ || null }).eq("id", m.id), "Gespeichert.", neuLaden,
      ["Ändern von " + m.name, alt.rueckSetz("machines", { name: m.name,
        machine_number: m.machine_number || null, type_id: m.type_id || null }, { id: m.id })]);
  },

  async maschineAktiv(m, neuLaden) {
    const ein = !m.is_active;
    if (!ein && !(await deaktivierenFragen("Maschine deaktivieren", "Die Maschine"))) return;
    senden(alt.db.from("machines").update({ is_active: ein }).eq("id", m.id), null, neuLaden,
      [(ein ? "Aktivieren von " : "Deaktivieren von ") + m.name,
        alt.rueckSetz("machines", { is_active: !ein }, { id: m.id })]);
  },

  async maschineLoeschen(m, neuLaden) {
    if (!(await loeschenFragen("Maschine löschen", '"' + m.name + '"', "", "die Maschine"))) return;
    // Werkzeugwechsel gehen mit der Maschine, darum beide sichern
    const vorher = await alt.rueckSichern("machines", { id: m.id });
    const wechsel = await alt.rueckSichern("tool_changes", { machine_id: m.id });
    const { error } = await alt.db.from("machines").delete().eq("id", m.id);
    if (!error) {
      alt.merkeSchritt("Löschen von " + m.name,
        [alt.rueckRein("machines", vorher), alt.rueckRein("tool_changes", wechsel)]);
      alt.meldung("Maschine gelöscht."); neuLaden(); return;
    }
    hartLoeschen(error, "alle Stückzahlen, Aufträge und Kontrollmeldungen dieser Maschine",
      "maschine_hart_loeschen", { p_machine_id: m.id }, neuLaden);
  },
};
