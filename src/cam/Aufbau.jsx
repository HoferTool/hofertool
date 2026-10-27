// =================================================================
//  CAM: AUFBAU EINES TYPS UND ABWEICHUNGEN EINER MASCHINE
//
//  TypAufbau steht im Fenster „⚙ Typ“ auf der Seite Maschinen und im
//  Reiter CAM: Steuerung, Aufgabe der Paths, Art der Werkzeugplätze und
//  die M-Befehle. MaschineAnders steht auf der Seite der Maschine und
//  im Reiter CAM: je M-Befehl „Hier anders“ mit dem eigenen Code (Wunsch
//  Patrick 27. Oktober 2026: „121 ist anders, aber nur bei Hochdruck“).
//  Gespeichert wird beim Verlassen eines Felds, mit Rückgängig.
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import AufbauSkizze from "./Skizze.jsx";
import { typAufbauLaden, maschineLaden, aufbauSpeichern, fehltSql, SQL_FEHLT,
  PATH_AUFGABEN, PLATZ_ARTEN, platzArtText, platzVorschlag, mbefehleFuerMaschine } from "./daten.js";

// Textfeld, das erst beim Verlassen oder mit Enter meldet
function Feld({ wert, setzen, darf, platzhalter, breit, id, liste }) {
  const [text, setText] = useState(wert || "");
  useEffect(() => { if (document.activeElement?.dataset?.camFeld !== id) setText(wert || ""); }, [wert, id]);
  if (!darf) return <span className={wert ? "" : "klein"}>{wert || "—"}</span>;
  const fertig = () => { if (text.trim() !== (wert || "")) setzen(text.trim()); };
  return <input className={"cam-feld" + (breit ? " cam-feld--breit" : "")} data-cam-feld={id} value={text}
    placeholder={platzhalter || ""} list={liste} onChange={(e) => setText(e.target.value)} onBlur={fertig}
    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

function Fehler({ fehler }) {
  return <div className="karte karte--fehler"><p>{fehltSql(fehler) ? SQL_FEHLT : alt.fehlertext(fehler)}</p></div>;
}

// ---------- Typ ----------

export function TypAufbau({ typ, imFenster }) {
  const darf = alt.darfSchreiben();
  const stand = useDaten(() => Promise.all([typAufbauLaden(typ.id), alt.ladeTypAufbau(typ.id)]), [typ.id]);
  if (stand.fehler && !stand.daten) return <Fehler fehler={stand.fehler} />;
  if (!stand.daten) return <div className="laedt">Wird geladen …</div>;
  return <TypInhalt typ={typ} imFenster={imFenster} darf={darf} geladen={stand.daten[0].daten} paths={stand.daten[1]} neu={stand.neu} />;
}

// Zeigt eine Änderung sofort, gespeichert wird dahinter
function useLokal(geladen) {
  const [lokal, setLokal] = useState(null);
  useEffect(() => setLokal(null), [geladen]);
  return [lokal || geladen, setLokal];
}

function TypInhalt({ typ, imFenster, darf, geladen, paths, neu: neuLaden }) {
  const [daten, setLokal] = useLokal(geladen);
  const speichern = async (neu, text) => {
    setLokal(neu);
    try { await aufbauSpeichern("type_id", typ.id, neu, text + " (CAM " + typ.name + ")"); }
    catch (f) { alt.meldung(fehltSql(f) ? SQL_FEHLT : alt.fehlertext(f), "fehler"); }
    neuLaden();
  };
  const setzen = (teil, text) => speichern({ ...daten, ...teil }, text);
  const pathSetzen = (p, feld, w) => setzen({ paths: { ...daten.paths, [p.id]: { ...(daten.paths[p.id] || {}), [feld]: w } } }, p.name);
  const platzSetzen = (nr, feld, w) => setzen({ plaetze: { ...daten.plaetze, [nr]: { ...(daten.plaetze[nr] || {}), [feld]: w } } }, nr);
  // Ausführung eines Platzes: gewählt, sonst Vorschlag
  const artVon = (nr) => {
    const x = daten.plaetze[nr];
    return x && x.art ? { art: x.art, vorschlag: false } : { art: platzVorschlag(nr), vorschlag: true };
  };
  const platzWaehlen = async (nr) => {
    const jetzt = artVon(nr);
    const x = daten.plaetze[nr] || {};
    const w = await alt.auswahlDialog(nr,
      PLATZ_ARTEN.map(([wert, text]) => ({ wert, text: (wert === jetzt.art ? "● " : "") + text }))
        .concat([{ wert: "_hinweis", text: "✎  Hinweis" + (x.hinweis ? ": " + x.hinweis : "") }]),
      "Was steckt auf " + nr + "?" + (jetzt.vorschlag && jetzt.art ? " Vorschlag: " + platzArtText(jetzt.art) + "." : ""));
    if (!w) return;
    if (w !== "_hinweis") { platzSetzen(nr, "art", w); return; }
    const h = await alt.dialogFelder({ titel: "Hinweis zu " + nr,
      felder: [{ name: "h", label: "Hinweis", wert: x.hinweis || "", platzhalter: "z. B. Halter, Spannzange, Richtung" }],
      bestaetigen: "Speichern" });
    if (h) setzen({ plaetze: { ...daten.plaetze, [nr]: { ...x, art: x.art || jetzt.art, hinweis: h.h || "" } } }, nr);
  };
  const mSetzen = (i, feld, w) => setzen({ mbefehle: daten.mbefehle.map((m, j) => j === i ? { ...m, [feld]: w } : m) }, "M-Befehl");
  const mNeu = async () => {
    const w = await alt.dialogFelder({ titel: "Neuer M-Befehl",
      felder: [{ name: "funktion", label: "Was tut er?", pflicht: true, platzhalter: "z. B. Späneförderer ein" },
        { name: "code", label: "Code", platzhalter: "z. B. M51" }],
      bestaetigen: "Hinzufügen" });
    if (!w) return;
    setzen({ mbefehle: daten.mbefehle.concat([{ id: "eigen_" + Date.now().toString(36), funktion: w.funktion, code: w.code || "" }]) },
      "M-Befehl " + w.funktion);
  };
  const mWeg = (i) => setzen({ mbefehle: daten.mbefehle.filter((_, j) => j !== i) }, "M-Befehl entfernt");
  const offen = daten.mbefehle.filter((m) => !m.code).length;

  return (
    <section className="karte cam-aufbau" id="cam-aufbau" data-typ={typ.id}>
      <div className="karte__kopf"><h2>{imFenster ? "CAM" : "Aufbau " + typ.name}</h2></div>
      <p className="klein">Was das CAM über diesen Typ wissen muss. Abweichungen einzelner Maschinen
        stehen auf der Seite der Maschine unter „CAM: Hier ist das anders“.</p>

      <div className="cam-zeile"><span className="cam-zeile__titel">Steuerung</span>
        <Feld id="steuerung" wert={daten.steuerung} darf={darf} platzhalter="z. B. Fanuc 31i-B"
          setzen={(w) => setzen({ steuerung: w }, "Steuerung")} /></div>

      <h3 className="cam-titel">Paths</h3>
      {!paths.length && <p className="hinweis">Dieser Typ hat noch keine Paths. Sie kommen oben unter „+ Path“ dazu.</p>}
      <datalist id="cam-path-aufgaben">{PATH_AUFGABEN.map((a) => <option key={a} value={a} />)}</datalist>
      {paths.length > 0 && <table className="cam-tabelle" id="cam-paths"><tbody>
        {paths.map((p) => (
          <tr key={p.id} data-path={p.id}>
            <th>{p.name}</th>
            <td><Feld id={"pa-" + p.id} wert={(daten.paths[p.id] || {}).aufgabe} darf={darf} liste="cam-path-aufgaben"
              platzhalter="Aufgabe, z. B. Kammsupport vorne" breit setzen={(w) => pathSetzen(p, "aufgabe", w)} /></td>
          </tr>))}
      </tbody></table>}

      {paths.length > 0 && <>
        <h3 className="cam-titel">Werkzeugplätze</h3>
        <p className="klein">{darf ? "Platz anklicken, um seine Ausführung zu wählen. " : ""}
          Gestrichelt ist ein Vorschlag aus euren Einrichtblättern, bis jemand ihn bestätigt.</p>
        <div className="cam-skizze-huelle"><AufbauSkizze paths={paths} artVon={artVon} klick={darf ? platzWaehlen : null} /></div>
        {Object.entries(daten.plaetze).some(([, x]) => x.hinweis) && <ul className="cam-hinweise klein">
          {Object.entries(daten.plaetze).filter(([, x]) => x.hinweis).map(([nr, x]) => <li key={nr}><b>{nr}</b> {x.hinweis}</li>)}</ul>}
      </>}

      <div className="karte__kopf cam-titel"><h3>M-Befehle</h3>
        {darf && <button className="knopf knopf--klein" id="cam-m-neu" onClick={mNeu}>+ M-Befehl</button>}</div>
      {offen > 0 && <p className="klein">{offen === 1 ? "1 Befehl ist" : offen + " Befehle sind"} noch offen.
        {" "}Sie lassen sich aus euren Programmen ablesen (Reiter CAM unter Rechner).</p>}
      <table className="cam-tabelle" id="cam-mbefehle"><tbody>
        {daten.mbefehle.map((m, i) => (
          <tr key={m.id} data-m={m.id} className={m.code ? "" : "cam-offen"}>
            <th>{m.funktion}</th>
            <td className="cam-code"><Feld id={"mc-" + m.id} wert={m.code} darf={darf} platzhalter="M…" setzen={(w) => mSetzen(i, "code", w)} /></td>
            <td><Feld id={"mh-" + m.id} wert={m.hinweis} darf={darf} platzhalter="Hinweis" setzen={(w) => mSetzen(i, "hinweis", w)} /></td>
            {darf && <td className="cam-weg"><button className="linkknopf" title="Entfernen" onClick={() => mWeg(i)}>✕</button></td>}
          </tr>))}
      </tbody></table>

      <h3 className="cam-titel">Sonst noch wichtig</h3>
      <NotizFeld wert={daten.notiz} darf={darf} id="cam-notiz"
        platzhalter="z. B. Optionen, Zyklen, Eigenheiten dieses Typs"
        setzen={(w) => setzen({ notiz: w }, "Notiz")} />
    </section>
  );
}

function NotizFeld({ wert, setzen, darf, id, platzhalter }) {
  const [text, setText] = useState(wert || "");
  useEffect(() => { if (document.activeElement?.id !== id) setText(wert || ""); }, [wert, id]);
  if (!darf) return <p className="cam-notiz">{wert || <span className="klein">—</span>}</p>;
  return <textarea id={id} className="cam-notiz" rows={3} value={text} placeholder={platzhalter}
    onChange={(e) => setText(e.target.value)} onBlur={() => { if (text.trim() !== (wert || "")) setzen(text.trim()); }} />;
}

// ---------- Maschine ----------

export function MaschineAnders({ m, typId, typName }) {
  const darf = alt.darfSchreiben();
  const stand = useDaten(() => Promise.all([typAufbauLaden(typId), maschineLaden(m.id)]), [typId, m.id]);
  if (stand.fehler && !stand.daten) return <Fehler fehler={stand.fehler} />;
  if (!stand.daten) return <div className="laedt">Wird geladen …</div>;
  return <MaschineInhalt m={m} typName={typName} darf={darf} typ={stand.daten[0].daten} geladen={stand.daten[1].daten} neu={stand.neu} />;
}

function MaschineInhalt({ m, typName, darf, typ, geladen, neu: neuLaden }) {
  const [daten, setLokal] = useLokal(geladen);
  const masch = { daten };
  const wer = m.machine_number || m.name;
  const liste = mbefehleFuerMaschine(typ, daten);
  const anzahl = Object.keys(daten.anders).length;

  const speichern = async (neu, text) => {
    setLokal(neu);
    try { await aufbauSpeichern("machine_id", m.id, neu, text + " " + wer); }
    catch (f) { alt.meldung(fehltSql(f) ? SQL_FEHLT : alt.fehlertext(f), "fehler"); }
    neuLaden();
  };
  const andersSetzen = (id, wert) => {
    const anders = { ...masch.daten.anders };
    if (wert === null) delete anders[id]; else anders[id] = wert;
    speichern({ ...masch.daten, anders }, wert === null ? "Wie der Typ" : "Hier anders");
  };

  return (
    <section className="karte cam-aufbau cam-maschine" id="cam-maschine" data-maschine={m.id}>
      <div className="karte__kopf"><h2>CAM: Hier ist das anders</h2></div>
      <p className="klein">Alles gilt wie beim Typ {typName}. Wo diese Maschine abweicht,
        „Hier anders“ ankreuzen und eintragen, was hier gilt.
        {anzahl ? " " + (anzahl === 1 ? "1 Abweichung." : anzahl + " Abweichungen.") : ""}</p>
      <table className="cam-tabelle" id="cam-anders"><thead><tr>
        <th>M-Befehl</th><th>Typ {typName}</th><th>Hier anders</th><th>An der {wer}</th></tr></thead><tbody>
        {liste.map((x) => {
          const a = masch.daten.anders[x.id];
          return (
            <tr key={x.id} data-m={x.id} className={a ? "cam-anders" : ""}>
              <th>{x.funktion}</th>
              <td className="cam-code">{(a ? x.typCode : x.code) || <span className="klein">offen</span>}</td>
              <td className="cam-haken"><input type="checkbox" checked={!!a} disabled={!darf} data-anders={x.id}
                onChange={(e) => andersSetzen(x.id, e.target.checked ? { code: x.code || "", hinweis: "" } : null)} /></td>
              <td>{a && <div className="cam-anders__felder">
                <Feld id={"ac-" + x.id} wert={a.code} darf={darf} platzhalter="Code hier"
                  setzen={(w) => andersSetzen(x.id, { ...a, code: w })} />
                <Feld id={"ah-" + x.id} wert={a.hinweis} darf={darf} platzhalter="Was genau ist anders?" breit
                  setzen={(w) => andersSetzen(x.id, { ...a, hinweis: w })} /></div>}</td>
            </tr>);
        })}
      </tbody></table>
      <h3 className="cam-titel">Sonst noch anders an dieser Maschine</h3>
      <NotizFeld wert={masch.daten.notiz} darf={darf} id="cam-maschine-notiz" platzhalter="z. B. anderer Halter auf T2300"
        setzen={(w) => speichern({ ...masch.daten, notiz: w }, "Notiz")} />
    </section>
  );
}
