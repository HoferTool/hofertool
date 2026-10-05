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
import { useLayoutEffect, useRef } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import DokAbschnitt from "../../hoco/DokAbschnitt.jsx";

let ladeNr = 0;

async function senden(anfrage, gut, neuLaden) {
  const { error } = await anfrage;
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return false; }
  alt.meldung(gut);
  neuLaden();
  return true;
}

const zweimalFragen = (titel, text, letzte) => alt.doppeltNachfragen(
  { titel, text, bestaetigen: "Weiter zum Löschen", gefahr: true },
  { titel: "Wirklich endgültig löschen?", text: letzte || "Letzte Rückfrage.",
    bestaetigen: "Endgültig löschen", gefahr: true });

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
    if (typ) return <Aufbau typ={typ} darf={darf} geladen={geladen} neuLaden={neuLaden} />;
    prod.typOffen = null;
  }

  const oeffnen = (id) => { prod.typOffen = id; neuLaden(); };
  const neu = async () => {
    const w = await alt.dialogFelder({ titel: "Neuer Maschinentyp",
      felder: [
        { name: "name", label: "Name", pflicht: true, platzhalter: "z. B. Star SR-32J" },
        { name: "text", label: "Beschreibung", wert: "" }],
      bestaetigen: "Anlegen" });
    if (!w) return;
    senden(alt.db.from("machine_types").insert({ name: w.name, beschreibung: w.text || null }), "Typ angelegt.", neuLaden);
  };
  const bearbeiten = async (t) => {
    const w = await alt.dialogFelder({ titel: "Maschinentyp bearbeiten",
      felder: [
        { name: "name", label: "Name", wert: t.name, pflicht: true },
        { name: "text", label: "Beschreibung", wert: t.beschreibung || "" }] });
    if (!w) return;
    senden(alt.db.from("machine_types").update({ name: w.name, beschreibung: w.text || null }).eq("id", t.id),
      "Gespeichert.", neuLaden);
  };
  const loeschen = async (t) => {
    const ok = await zweimalFragen("Typ löschen",
      'Soll der Typ "' + t.name + '" gelöscht werden? Paths, Plätze und Werkzeuge gehen mit. '
      + "Maschinen mit diesem Typ bleiben erhalten, stehen danach aber ohne Typ da.",
      "Letzte Rückfrage. Danach ist der ganze Aufbau weg.");
    if (ok) senden(alt.db.from("machine_types").delete().eq("id", t.id), "Typ gelöscht.", neuLaden);
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
  const [paths, dokumente] = await Promise.all([alt.ladeTypAufbau(typ.id), alt.dokListe({ typId: typ.id })]);
  return { paths, dokumente, nr: ++ladeNr };
}

function Aufbau({ typ, darf, geladen, neuLaden }) {
  const prod = alt.prod;
  const { daten, fehler } = useDaten(() => aufbauLaden(typ), [typ.id, geladen.nr]);
  const db = alt.db;

  const zurueck = () => { prod.typOffen = null; neuLaden(); };
  const kopf = <button className="linkknopf" id="typ-zurueck" onClick={zurueck}>‹ alle Typen</button>;
  if (fehler && !daten) return <>{kopf}<div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div></>;
  if (!daten) return <>{kopf}<div className="laedt">Wird geladen …</div></>;
  const { paths, dokumente } = daten;

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
        <div className="karte__kopf"><h2>{typ.name}</h2>
          {darf && <div className="karte__aktionen">
            <button className="knopf knopf--klein" id="typ-blatt" onClick={blatt}>Einrichtblatt (Excel)</button>
            <button className="knopf knopf--klein" id="path-neu" onClick={pathNeu}>+ Path</button></div>}
        </div>
        {typ.beschreibung && <p className="klein">{typ.beschreibung}</p>}
        {!paths.length && <p className="hinweis">Noch kein Path angelegt. Die meisten Maschinen haben zwei oder drei.</p>}
      </section>
      {/* Neu aufgebaut bei jedem Laden: Das Ziehen der Plätze hängt
          sich an die Elemente und darf nicht doppelt hängen */}
      <Paths key={daten.nr} paths={paths} darf={darf} neuLaden={neuLaden} />
      {/* Weitere Dokumente am Typ — auch ohne Schreibrecht sichtbar */}
      <div id="typ-dokumente">
        <DokAbschnitt key={daten.nr} dokumente={dokumente} darf={darf}
          was={"zu " + (typ.name || "diesem Typ")} zuordnung={{ typId: typ.id }} nachher={neuLaden} />
      </div>
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
      .eq("id", p.id), "Gespeichert.", neuLaden);
  };
  const pathLoeschen = async (p) => {
    const ok = await zweimalFragen("Path löschen", '"' + p.name + '" löschen? Alle Plätze und Werkzeuge darauf gehen mit.');
    if (ok) senden(db.from("type_paths").delete().eq("id", p.id), "Path gelöscht.", neuLaden);
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
    if (nr) senden(db.from("type_slots").update({ tool_nr: nr, bezeichnung: nr }).eq("id", sl.id), "Gespeichert.", neuLaden);
  };
  const platzLoeschen = async (sl) => {
    const ok = await zweimalFragen("Werkzeugplatz löschen",
      "Soll dieser Werkzeugplatz gelöscht werden? Die Werkzeuge darauf gehen mit.");
    if (ok) senden(db.from("type_slots").delete().eq("id", sl.id), "Platz gelöscht.", neuLaden);
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
