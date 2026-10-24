// =================================================================
//  MASCHINENTYPEN
//  Liste der Typen und der Aufbau eines Typs: Paths mit ihren
//  Werkzeugplätzen, so wie sie später auf dem Werkzeugblatt stehen,
//  dazu das Einrichtblatt (Excel) als Vorlage und weitere Dokumente.
//
//  Welcher Typ offen ist, steht in prod.typOffen (Escape geht von dort
//  eine Ebene zurück). Nach jeder Änderung lädt die Produktion still
//  neu und zeichnet diese Ansicht mit (neuLaden kommt von Maschinen).
// =================================================================
import { useLayoutEffect, useReducer, useRef } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { alleEinlesen } from "../../einrichtblatt/Einlesen.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";

let ladeNr = 0;

// rueck: optional der Schritt für Rückgängig, [Text, Schritte]
async function senden(anfrage, gut, neuLaden, rueck) {
  const { error } = await anfrage;
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return false; }
  if (rueck) alt.merkeSchritt(rueck[0], rueck[1]);
  alt.meldung(gut);
  neuLaden();
  return true;
}

// Für Rückgängig alles sichern, was mit einem Path oder Typ verschwindet
// oder seinen Verweis verliert (Paths, Plätze, Daten je HOCO Nr.,
// Dokumente; Maschinen und Einrichtblätter verlieren nur den Verweis).
async function pathTeile(pfadIds) {
  const slots = await alt.rueckSichern("type_slots", { path_id: pfadIds });
  const slotIds = slots.map((x) => x.id);
  const blattPfade = (await alt.rueckSichern("setup_sheet_paths", { path_id: pfadIds }));
  const blattSlots = (await alt.rueckSichern("setup_sheet_slots", { slot_id: slotIds }));
  return { slots, schritte: [alt.rueckRein("type_slots", slots)]
    .concat(blattPfade.map((x) => alt.rueckSetz("setup_sheet_paths", { path_id: x.path_id }, { id: x.id })))
    .concat(blattSlots.map((x) => alt.rueckSetz("setup_sheet_slots", { slot_id: x.slot_id }, { id: x.id }))) };
}

async function pathSichern(p) {
  const pfad = await alt.rueckSichern("type_paths", { id: p.id });
  const teile = await pathTeile([p.id]);
  return ["Löschen von " + p.name, [alt.rueckRein("type_paths", pfad)].concat(teile.schritte)];
}

async function typSichern(t) {
  const typ = await alt.rueckSichern("machine_types", { id: t.id });
  const pfade = await alt.rueckSichern("type_paths", { type_id: t.id });
  const teile = await pathTeile(pfade.map((x) => x.id));
  const daten = await alt.rueckSichern("hoco_type_data", { type_id: t.id });
  const doks = await alt.rueckSichern("dokumente", { type_id: t.id });
  const ids = async (tab) => (await alt.rueckSichern(tab, { type_id: t.id })).map((x) => x.id);
  const maschinen = await ids("machines");
  const blaetter = await ids("setup_sheets");
  const schnapp = await ids("setup_snapshots");
  return ["Löschen von " + t.name, [alt.rueckRein("machine_types", typ), alt.rueckRein("type_paths", pfade)]
    .concat(teile.schritte)
    .concat([alt.rueckRein("hoco_type_data", daten), alt.rueckRein("dokumente", doks),
      alt.rueckSetz("machines", { type_id: t.id }, { id: maschinen }),
      alt.rueckSetz("setup_sheets", { type_id: t.id }, { id: blaetter }),
      alt.rueckSetz("setup_snapshots", { type_id: t.id }, { id: schnapp })])];
}

// Aufbau eines anderen Typs übernehmen (Wunsch Patrick 12. Oktober 2026):
// Paths und Plätze werden als Kopie an den Typ gehängt, danach passt man
// an, was anders ist. Die Vorlage selbst bleibt unverändert. Alle Spalten
// ausser den Kennungen werden mitgenommen, so kommen auch spätere neue
// Spalten von selbst mit.
async function aufbauKopieren(vonId, nachId, abSortierung) {
  const quelle = await alt.ladeTypAufbau(vonId);
  const neu = [];
  let plaetze = 0;
  for (let i = 0; i < quelle.length; i++) {
    const { id, type_id, type_slots, ...pfad } = quelle[i];
    const r = await alt.db.from("type_paths")
      .insert({ ...pfad, type_id: nachId, sortierung: abSortierung + i + 1 }).select();
    if (r.error) throw r.error;
    const angelegt = (r.data || [])[0];
    if (!angelegt) continue;
    neu.push(angelegt.id);
    const slots = (type_slots || []).map(({ id: _i, path_id, ...sl }) => ({ ...sl, path_id: angelegt.id }));
    if (slots.length) {
      const rs = await alt.db.from("type_slots").insert(slots);
      if (rs.error) throw rs.error;
      plaetze += slots.length;
    }
  }
  return { neu, pfade: neu.length, plaetze };
}

const aufbauText = (k) => (k.pfade === 1 ? "1 Path" : k.pfade + " Paths") + " mit "
  + (k.plaetze === 1 ? "1 Platz" : k.plaetze + " Plätzen") + " übernommen.";

// Eine Rückfrage, dann wird gelöscht (Wunsch 6. Oktober 2026: nur einmal fragen)
const einmalFragen = (titel, text) => alt.nachfragen(
  { titel, text, bestaetigen: "Löschen", gefahr: true });

export default function Typen({ geladen, neuLaden: aussen }) {
  const prod = alt.prod;
  const darf = alt.darfSchreiben();
  const neuLaden = () => { prod.typen = null; aussen(); };
  const { daten: typen, fehler } = useDaten(() => alt.ladeTypen(), [geladen.nr]);

  if (fehler && !typen) {
    return (
      <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p>
        <p className="klein">Wurde das SQL für die Einrichtblätter schon ausgeführt?</p></div>
    );
  }
  if (!typen) return <div className="laedt">Wird geladen …</div>;

  if (prod.typOffen) {
    const typ = typen.find((x) => x.id === prod.typOffen);
    if (typ) return <Aufbau typ={typ} typen={typen} darf={darf} geladen={geladen} neuLaden={neuLaden} />;
    prod.typOffen = null;
  }

  const oeffnen = (id) => { prod.typOffen = id; neuLaden(); };
  const neu = async () => {
    const w = await alt.dialogFelder({ titel: "Neuer Maschinentyp",
      felder: [
        { name: "name", label: "Name", pflicht: true, platzhalter: "z. B. Star SR-32J" },
        { name: "text", label: "Beschreibung", wert: "" }]
        .concat(typen.length ? [{ name: "vorlage", label: "Aufbau übernehmen von", wert: "",
          auswahl: [["", "— leer anfangen —"]].concat(typen.map((t) => [t.id, t.name])),
          hinweis: "Paths und Werkzeugplätze werden kopiert, danach anpassen, was anders ist" }] : []),
      bestaetigen: "Anlegen" });
    if (!w) return;
    const r = await alt.db.from("machine_types").insert({ name: w.name, beschreibung: w.text || null }).select();
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    const angelegt = (r.data || [])[0];
    if (w.vorlage && angelegt) {
      try {
        const k = await aufbauKopieren(w.vorlage, angelegt.id, 0);
        alt.meldung("Typ angelegt. " + aufbauText(k));
      } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    } else alt.meldung("Typ angelegt.");
    if (angelegt) alt.merkeSchritt("Neuer Typ " + w.name, alt.rueckWeg("machine_types", { id: angelegt.id }));
    neuLaden();
  };
  const bearbeiten = async (t) => {
    const w = await alt.dialogFelder({ titel: "Maschinentyp bearbeiten",
      felder: [
        { name: "name", label: "Name", wert: t.name, pflicht: true },
        { name: "text", label: "Beschreibung", wert: t.beschreibung || "" }]
        // Für die Mindestmenge in der Material-Übersicht (seit 1.67.0,
        // Wunsch Patrick: „rechne mit 250 mm Rest-Stumpen, soll bei Typ
        // definiert werden“). Erst da, wenn die Datenbank die Spalten kennt.
        .concat("stangen_mm" in t ? [
          { name: "stange", label: "Stangenlänge in mm", wert: t.stangen_mm, ziffern: true },
          { name: "stumpen", label: "Rest-Stumpen in mm", wert: t.stumpen_mm, ziffern: true }] : [])
        // Abstecherbreite (seit 1.69.0, Wunsch Patrick 15. Oktober 2026),
        // nur für die Materialmenge: je Teil Länge + Abstecher + 0,5 mm
        .concat("abstecher_mm" in t ? [
          { name: "abstecher", label: "Abstecherbreite in mm", wert: t.abstecher_mm ?? "", dezimal: true,
            hinweis: "Nur für die Materialmenge: je Teil Länge + Abstecher + 0,5 mm fürs Planieren." }] : []) });
    if (!w) return;
    const daten = { name: w.name, beschreibung: w.text || null };
    const vorher = { name: t.name, beschreibung: t.beschreibung || null };
    if ("stangen_mm" in t) {
      daten.stangen_mm = Number(w.stange) > 0 ? Math.round(Number(w.stange)) : 3000;
      daten.stumpen_mm = Number(w.stumpen) >= 0 && w.stumpen !== "" ? Math.round(Number(w.stumpen)) : 250;
      vorher.stangen_mm = t.stangen_mm; vorher.stumpen_mm = t.stumpen_mm;
    }
    if ("abstecher_mm" in t) {
      const ab = Number(String(w.abstecher || "").replace(",", "."));
      daten.abstecher_mm = w.abstecher !== "" && ab >= 0 && ab < 50 ? ab : null;
      vorher.abstecher_mm = t.abstecher_mm;
    }
    senden(alt.db.from("machine_types").update(daten).eq("id", t.id),
      "Gespeichert.", neuLaden, ["Ändern von " + t.name,
        alt.rueckSetz("machine_types", vorher, { id: t.id })]);
  };
  const loeschen = async (t) => {
    const ok = await einmalFragen("Typ löschen",
      'Soll der Typ "' + t.name + '" gelöscht werden? Paths, Plätze und Werkzeuge gehen mit. '
      + "Maschinen mit diesem Typ bleiben erhalten, stehen danach aber ohne Typ da.");
    if (!ok) return;
    const rueck = await typSichern(t);
    senden(alt.db.from("machine_types").delete().eq("id", t.id), "Typ gelöscht.", neuLaden, rueck);
  };

  return (
    <section className="karte">
      <div className="karte__kopf"><h2>Maschinentypen</h2></div>
      {typen.length
        ? <div className="tkarten">{typen.map((t) => {
            const anzahl = (prod.maschinen || []).filter((m) => m.type_id === t.id).length;
            return (
              <article key={t.id} className="tkarte">
                <div className="tkarte__kopf">
                  <strong className="tkarte__name">{t.name}</strong>
                  <span className="tkarte__zahl">{anzahl === 1 ? "1 Maschine" : anzahl + " Maschinen"}</span>
                </div>
                <p className="tkarte__text">{t.beschreibung || "\u00a0"}</p>
                {"stangen_mm" in t && <p className="tkarte__text klein">Stange {alt.zahlText(t.stangen_mm)} mm, Rest {alt.zahlText(t.stumpen_mm)} mm
                  {"abstecher_mm" in t && (t.abstecher_mm ? ", Abstecher " + String(t.abstecher_mm).replace(".", ",") + " mm" : ", Abstecher fehlt")}</p>}
                <div className="tkarte__knoepfe">
                  <button className="knopf knopf--klein knopf--haupt" data-typ-auf={t.id}
                    onClick={() => oeffnen(t.id)}>Aufbau</button>
                  {darf && <>
                    <button className="knopf knopf--klein" data-typ-um={t.id} onClick={() => bearbeiten(t)}>Bearbeiten</button>
                    <button className="knopf knopf--klein knopf--gefahr-leise" data-typ-weg={t.id} data-name={t.name}
                      onClick={() => loeschen(t)}>Löschen</button>
                  </>}
                </div>
              </article>
            );
          })}</div>
        : <p className="hinweis">Noch kein Typ angelegt.</p>}
      {darf && <button className="knopf knopf--klein" id="typ-neu" onClick={neu}>+ Maschinentyp</button>}
    </section>
  );
}

async function aufbauLaden(typ) {
  const paths = await alt.ladeTypAufbau(typ.id);
  return { paths, nr: ++ladeNr };
}

// Einstellungen eines Typs als Fenster, vom Typ-Ordner auf der Seite
// Maschinen aus (1.167.0, Wunsch Patrick 24. Oktober 2026: „Typ-
// Einstellungen als Button beim Typ, der als Fenster aufgeht“). Dasselbe
// wie der Typ im Reiter Typen, nur ohne „‹ alle Typen“.
export function typFensterOeffnen(typId, nachher) {
  fensterOeffnen((zu) => <TypFenster typId={typId} zu={zu} />, () => { if (nachher) nachher(); });
}

function TypFenster({ typId, zu }) {
  const [nr, neu] = useReducer((x) => x + 1, 0);
  const neuLaden = () => { alt.prod.typen = null; alt.stammVergessen(); neu(); };
  const { daten: typen, fehler } = useDaten(() => alt.ladeTypen(), [nr]);
  const typ = typen && typen.find((x) => x.id === typId);
  return (
    <div className="dialog dialog--breit dialog--typ" id="typ-fenster">
      <div className="dialog__kopfzeile">
        <h2>{typ ? typ.name : "Maschinentyp"}</h2>
        <button type="button" className="dialog__schliessen-inline" id="typ-fenster-zu" title="Schliessen" aria-label="Schliessen" data-zu="" onClick={zu}>✕</button>
      </div>
      <div className="dialog--typ__inhalt">
        {fehler && !typen ? <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>
          : !typen ? <div className="laedt">Wird geladen …</div>
            : !typ ? <p className="hinweis">Diesen Typ gibt es nicht mehr.</p>
              : <Aufbau typ={typ} typen={typen} darf={alt.darfSchreiben()} geladen={{ nr }} neuLaden={neuLaden} imFenster />}
      </div>
    </div>
  );
}

function Aufbau({ typ, darf, geladen, neuLaden, typen, imFenster }) {
  const prod = alt.prod;
  const { daten, fehler } = useDaten(() => aufbauLaden(typ), [typ.id, geladen.nr]);
  const db = alt.db;

  const zurueck = () => { prod.typOffen = null; neuLaden(); };
  const kopf = imFenster ? null : <button className="linkknopf" id="typ-zurueck" onClick={zurueck}>‹ alle Typen</button>;
  if (fehler && !daten) return <>{kopf}<div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div></>;
  if (!daten) return <>{kopf}<div className="laedt">Wird geladen …</div></>;
  const { paths } = daten;

  const pathNeu = async () => {
    const w = await alt.dialogFelder({ titel: "Neuer Path",
      felder: [
        { name: "name", label: "Name", pflicht: true, wert: "Path " + (paths.length + 1) },
        { name: "nummer", label: "Nummer", typ: "number", wert: paths.length + 1, hinweis: "nur für die Reihenfolge" }],
      bestaetigen: "Anlegen" });
    if (!w) return;
    senden(db.from("type_paths").insert({ type_id: typ.id, name: w.name,
      nummer: Math.max(1, Math.round(Number(w.nummer) || 1)), sortierung: paths.length + 1 }),
    "Path angelegt.", neuLaden);
  };

  // Aufbau eines anderen Typs übernehmen. Hat dieser Typ schon Paths,
  // fragt die App, ob sie dazukommen oder die bisherigen ersetzen.
  const uebernehmen = async () => {
    const andere = (typen || []).filter((t) => t.id !== typ.id);
    if (!andere.length) { alt.meldung("Es gibt noch keinen anderen Typ.", "warn"); return; }
    const von = await alt.auswahlDialog("Aufbau übernehmen",
      andere.map((t) => ({ wert: t.id, text: t.name })),
      "Von welchem Typ? Paths und Werkzeugplätze werden kopiert, danach kannst du anpassen, was anders ist.");
    if (!von) return;
    let ersetzen = false;
    if (paths.length) {
      const wie = await alt.auswahlDialog("Bisheriger Aufbau",
        [{ wert: "dazu", text: "➕  Dazunehmen, bisherige Paths bleiben" },
          { wert: "ersetzen", text: "↻  Ersetzen, bisherige Paths löschen" }],
        typ.name + " hat schon " + (paths.length === 1 ? "1 Path" : paths.length + " Paths") + ".");
      if (!wie) return;
      ersetzen = wie === "ersetzen";
    }
    try {
      let schritte = [];
      if (ersetzen) {
        const ids = paths.map((p) => p.id);
        const alte = await alt.rueckSichern("type_paths", { id: ids });
        const teile = await pathTeile(ids);
        schritte = [alt.rueckRein("type_paths", alte)].concat(teile.schritte);
        const r = await db.from("type_paths").delete().in("id", ids);
        if (r.error) throw r.error;
      }
      const ab = ersetzen ? 0 : paths.reduce((m, p) => Math.max(m, p.sortierung || 0), 0);
      const k = await aufbauKopieren(von, typ.id, ab);
      // Rückgängig: zuerst die Kopie weg, dann das Ersetzte zurück
      alt.merkeSchritt("Aufbau übernehmen", [alt.rueckWeg("type_paths", { id: k.neu })].concat(schritte));
      alt.meldung(aufbauText(k), "gut");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    neuLaden();
  };

  // Einrichtblatt (Excel) am Maschinentyp — die Vorlage für alle Teile,
  // die auf diesem Typ laufen
  const blatt = async () => {
    let jetzt = null;
    try {
      const r = await db.from("machine_types").select("blatt_url").eq("id", typ.id).limit(1);
      jetzt = ((r.data || [])[0] || {}).blatt_url || null;
    } catch (f) { /* dann eben ohne */ }
    const titel = "Einrichtblatt " + (typ.name || "");
    const wahl = await alt.auswahlDialog(titel,
      [{ wert: "neu", text: jetzt ? "📄  Andere Datei hinterlegen (Excel)" : "📄  Datei hinterlegen (Excel)" }]
        .concat(jetzt ? [{ wert: "auf", text: "👁  Ansehen" }, { wert: "weg", text: "✕  Entfernen" }] : []));
    if (!wahl) return;
    if (wahl === "auf") { alt.betrachter(jetzt, titel, true); return; }
    try {
      if (wahl === "weg") { await alt.blattPdfAmTyp(typ.id, null); alt.meldung("Entfernt."); return; }
      const adresse = await alt.blattPdfWaehlen();
      if (!adresse) return;
      await alt.blattPdfAmTyp(typ.id, adresse);
      alt.meldung("Einrichtblatt hinterlegt.");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  return (
    <>
      {kopf}
      <section className="karte">
        <div className="karte__kopf">{imFenster ? <span /> : <h2>{typ.name}</h2>}
          {darf && <div className="karte__aktionen">
            <button className="knopf knopf--klein" id="typ-uebernehmen" onClick={uebernehmen}>Aufbau übernehmen</button>
            <button className="knopf knopf--klein" id="typ-blatt" onClick={blatt}>Einrichtblatt (Excel)</button>
            {alt.istAdmin() && <button className="knopf knopf--klein" id="typ-blaetter-einlesen"
              onClick={() => alleEinlesen(typ).catch((f) => alt.meldung(alt.fehlertext(f), "fehler"))}>Einrichtblätter einlesen</button>}
            <button className="knopf knopf--klein" id="path-neu" onClick={pathNeu}>+ Path</button></div>}
        </div>
        {typ.beschreibung && <p className="klein">{typ.beschreibung}</p>}
        {!paths.length && <p className="hinweis">Noch kein Path angelegt. Die meisten Maschinen haben zwei oder drei.
          {darf && " Mit „Aufbau übernehmen“ kopierst du den Aufbau eines anderen Typs."}</p>}
      </section>
      {/* Neu aufgebaut bei jedem Laden: Das Ziehen der Plätze hängt
          sich an die Elemente und darf nicht doppelt hängen */}
      <Paths key={daten.nr} paths={paths} darf={darf} neuLaden={neuLaden} />
    </>
  );
}

function Paths({ paths, darf, neuLaden }) {
  const ref = useRef(null);
  const db = alt.db;

  // Werkzeugplätze verschieben: mit der Maus sofort, mit dem Finger
  // nach kurzem Halten. Ziehen auf einen anderen Platz setzt davor oder
  // dahinter, auf einen leeren Path hängt hinten an. Das Ziehen selbst
  // ist noch das alte platzVerschieben; es ändert nur die Datenbank
  // und lädt danach neu.
  useLayoutEffect(() => {
    if (darf) alt.platzVerschieben(ref.current, neuLaden);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pathBearbeiten = async (p) => {
    const w = await alt.dialogFelder({ titel: "Path bearbeiten",
      felder: [
        { name: "name", label: "Name", wert: p.name, pflicht: true },
        { name: "nummer", label: "Nummer", typ: "number", wert: p.nummer || 1 }] });
    if (!w) return;
    senden(db.from("type_paths").update({ name: w.name, nummer: Math.max(1, Math.round(Number(w.nummer) || 1)) })
      .eq("id", p.id), "Gespeichert.", neuLaden, ["Ändern von " + p.name,
        alt.rueckSetz("type_paths", { name: p.name, nummer: p.nummer || 1 }, { id: p.id })]);
  };
  const pathLoeschen = async (p) => {
    const ok = await einmalFragen("Path löschen", '"' + p.name + '" löschen? Alle Plätze und Werkzeuge darauf gehen mit.');
    if (!ok) return;
    const rueck = await pathSichern(p);
    senden(db.from("type_paths").delete().eq("id", p.id), "Path gelöscht.", neuLaden, rueck);
  };

  // Ein neuer Platz braucht nur seine Toolnummer. Wie sie geschrieben
  // wird, ist frei — eingereiht wird er dort, wo die Nummer hingehört.
  const platzNeu = async (p) => {
    const w = await alt.dialogFelder({ titel: "Neuer Werkzeugplatz",
      felder: [{ name: "tool", label: "Toolnummer", pflicht: true, platzhalter: "z. B. T11, T1100, 21" }],
      bestaetigen: "Anlegen" });
    if (!w) return;
    const nr = String(w.tool || "").trim();
    if (!nr) return;
    const r = await db.from("type_slots").insert({
      path_id: p.id, tool_nr: nr, bezeichnung: nr, werkzeuge: 1, platz_nr: 999, sortierung: 999 }).select();
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    const angelegt = (r.data || [])[0];
    try { if (angelegt) await alt.platzEinreihen(p.id, angelegt.id, nr); } catch (f) { /* steht dann am Ende */ }
    alt.meldung("Platz " + nr + " angelegt.");
    neuLaden();
  };
  // Die Reihenfolge bleibt beim Umbenennen: Sie kann von Hand gesetzt worden sein
  const platzAendern = async (sl) => {
    const w = await alt.dialogFelder({ titel: "Werkzeugplatz ändern",
      felder: [{ name: "tool", label: "Toolnummer", wert: sl.tool_nr || "", pflicht: true }] });
    if (!w) return;
    const nr = String(w.tool || "").trim();
    if (nr) senden(db.from("type_slots").update({ tool_nr: nr, bezeichnung: nr }).eq("id", sl.id), "Gespeichert.", neuLaden,
      ["Ändern von Platz " + (sl.tool_nr || ""), alt.rueckSetz("type_slots",
        { tool_nr: sl.tool_nr || null, bezeichnung: sl.bezeichnung || null }, { id: sl.id })]);
  };
  const platzLoeschen = async (sl) => {
    const ok = await einmalFragen("Werkzeugplatz löschen",
      "Soll dieser Werkzeugplatz gelöscht werden? Die Werkzeuge darauf gehen mit.");
    if (!ok) return;
    const slots = await alt.rueckSichern("type_slots", { id: sl.id });
    const blatt = (await alt.rueckSichern("setup_sheet_slots", { slot_id: sl.id })).map((x) => x.id);
    senden(db.from("type_slots").delete().eq("id", sl.id), "Platz gelöscht.", neuLaden,
      ["Löschen von Platz " + (sl.tool_nr || ""), [alt.rueckRein("type_slots", slots),
        alt.rueckSetz("setup_sheet_slots", { slot_id: sl.id }, { id: blatt })]]);
  };

  return (
    <div ref={ref} className="react-seite">
      {paths.map((p, pi) => {
        const plaetze = (p.type_slots || []).slice()
          .sort((a, c) => ((a.sortierung || 0) - (c.sortierung || 0)) || alt.toolVergleich(a.tool_nr, c.tool_nr));
        return (
          <section className="karte" key={p.id}>
            <div className="karte__kopf"><h2>{p.name} <span className="klein">Nr. {p.nummer || 1}</span></h2>
              {darf && <div className="karte__aktionen">
                <button className="linkknopf" data-path-um={p.id} onClick={() => pathBearbeiten(p)}>Bearbeiten</button>
                <button className="linkknopf linkknopf--gefahr" data-path-weg={p.id} data-name={p.name}
                  onClick={() => pathLoeschen(p)}>Löschen</button></div>}
            </div>
            {plaetze.length
              // Die Plätze sehen hier genauso aus wie später auf dem
              // Werkzeugblatt — samt Farbe des Paths und Beispieltext
              ? <div className="platzliste eb-karten" data-pathliste={p.id}>
                  {plaetze.map((sl) => (
                    <div key={sl.id} className={"eb-karte" + (darf ? " platz--fassbar" : "")} data-platz={sl.id} data-path={p.id}>
                      <div className="eb-karte__kopf platz__tool" style={{ background: alt.pathFarbe(pi) }}>{sl.tool_nr || "—"}</div>
                      <div className="eb-karte__bild" />
                      <div className="eb-karte__zeile eb-karte__beispiel">Lieferant</div>
                      <div className="eb-karte__zeile eb-karte__zeile--letzte eb-karte__beispiel">Art.-Nr.</div>
                      {darf && <span className="eb-karte__werkzeuge">
                        <button className="eb-karte__knopf" data-platz-um={sl.id} title="Toolnummer ändern"
                          onClick={() => platzAendern(sl)}>✎</button>
                        <button className="eb-karte__knopf eb-karte__knopf--weg" data-platz-weg={sl.id} title="Platz löschen"
                          onClick={() => platzLoeschen(sl)}>✕</button></span>}
                    </div>
                  ))}
                </div>
              : <div className="platzliste platzliste--leer" data-pathliste={p.id}>
                  <p className="hinweis">Noch kein Werkzeugplatz. Einen von einem anderen Path hierher ziehen oder unten anlegen.</p></div>}
            {darf && <button className="knopf knopf--klein" data-platz-neu={p.id} onClick={() => platzNeu(p)}>+ Werkzeugplatz</button>}
          </section>
        );
      })}
    </div>
  );
}
