// =================================================================
//  REITER CAM unter Rechner (seit 1.224.0, Wunsch Patrick 27. Oktober 2026)
//
//  Grundgerüst für ein CAM, das Programme im Stil von Hofer schreibt.
//  Vorerst nur für die SW-Maschinen. Oben wählt man Typ oder Maschine:
//   - Typ: Aufbau (Paths, Werkzeugplätze, M-Befehle) und eure Programme
//     als Vorlage (hochladen, ansehen, was die App darin findet)
//   - Maschine: was dort anders ist als beim Typ
//  Darunter der Ablauf für ein neues Programm (Ausrichtung → Werkzeuge
//  → Auswahl → Programm). Er wird gebaut, sobald Programme da sind.
// =================================================================
import { useRef, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { TypAufbau, MaschineAnders } from "./Aufbau.jsx";
import { istCamTyp, programmeLaden, programmInhalt, programmHochladen, programmLesen,
  fehltSql, SQL_FEHLT } from "./daten.js";

// Gewählter Typ oder Maschine bleibt beim Seitenwechsel stehen
const gemerkt = { typId: null, maschineId: null };

async function camLaden() {
  const [typen, maschinen] = await Promise.all([alt.ladeTypen(), alt.ladeMaschinen(false, true)]);
  const cam = typen.filter(istCamTyp);
  return cam.map((t) => ({ ...t, maschinen: maschinen.filter((m) => m.type_id === t.id) }));
}

export default function Cam() {
  const stand = useDaten(camLaden, []);
  const [wahl, setWahl] = useState({ ...gemerkt });
  const waehlen = (w) => { Object.assign(gemerkt, w); setWahl({ ...w }); };

  if (stand.fehler && !stand.daten) return <div className="karte karte--fehler"><p>{alt.fehlertext(stand.fehler)}</p></div>;
  if (!stand.daten) return <div className="laedt">Wird geladen …</div>;
  const typen = stand.daten;
  if (!typen.length) return <p className="hinweis">Es gibt noch keinen SW-Typ. CAM gibt es vorerst nur für die SW-Maschinen.</p>;
  const typ = typen.find((t) => t.id === wahl.typId) || typen[0];
  const masch = wahl.maschineId && typ.maschinen.find((m) => m.id === wahl.maschineId);

  return (
    <div className="cam" id="cam">
      <section className="karte">
        <h2>Maschine</h2>
        <p className="klein">CAM gibt es vorerst für die SW-Maschinen. Alles, was beim Typ steht, gilt für jede seiner Maschinen,
          ausser es ist bei der Maschine anders eingetragen.</p>
        {typen.map((t) => (
          <div key={t.id} className="cam-wahl">
            <button className={"wahlknopf" + (t.id === typ.id && !masch ? " aktiv" : "")} data-cam-typ={t.id}
              onClick={() => waehlen({ typId: t.id, maschineId: null })}>Typ {t.name}</button>
            {t.maschinen.map((m) => (
              <button key={m.id} className={"wahlknopf" + (masch && masch.id === m.id ? " aktiv" : "")} data-cam-maschine={m.machine_number || m.id}
                onClick={() => waehlen({ typId: t.id, maschineId: m.id })}>{m.machine_number || m.name}</button>))}
          </div>))}
      </section>

      {masch
        ? <MaschineAnders key={masch.id} m={masch} typId={typ.id} typName={typ.name} />
        : <>
            <TypAufbau key={typ.id} typ={typ} />
            <Programme key={"p" + typ.id} typ={typ} />
          </>}
      <Ablauf typ={typ} />
    </div>
  );
}

// ---------- Programme als Vorlage ----------

function Programme({ typ }) {
  const darf = alt.darfSchreiben();
  const stand = useDaten(() => programmeLaden(typ.id), [typ.id]);
  const wahl = useRef(null);
  const [laedt, setLaedt] = useState(false);

  const hoch = async (dateien) => {
    if (!dateien.length) return;
    setLaedt(true);
    let gut = 0;
    const neu = [];
    for (const d of dateien) {
      try { const x = await programmHochladen(d, { typId: typ.id }); gut++; if (x) neu.push(x.id); }
      catch (f) { alt.meldung(fehltSql(f) ? SQL_FEHLT : alt.fehlertext(f), "fehler"); }
    }
    setLaedt(false);
    if (neu.length) alt.merkeSchritt("Programme hochladen", alt.rueckWeg("cam_programme", { id: neu }));
    if (gut) alt.meldung(gut === 1 ? "Programm hochgeladen." : gut + " Programme hochgeladen.", "gut");
    stand.neu();
  };
  const weg = async (p) => {
    if (!await alt.nachfragen({ titel: "Programm löschen?", text: p.name + " wird gelöscht.", bestaetigen: "Löschen", gefahr: true })) return;
    const vorher = await alt.rueckSichern("cam_programme", { id: p.id });
    const r = await alt.db.from("cam_programme").delete().eq("id", p.id);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    alt.merkeSchritt("Programm " + p.name + " gelöscht", alt.rueckRein("cam_programme", vorher));
    alt.meldung("Gelöscht.");
    stand.neu();
  };

  const liste = stand.daten || [];
  return (
    <section className="karte cam-programme" id="cam-programme">
      <div className="karte__kopf"><h2>Eure Programme ({liste.length})</h2>
        {darf && <div className="karte__aktionen">
          <button className="knopf knopf--klein" id="cam-programm-hoch" disabled={laedt}
            onClick={() => wahl.current && wahl.current.click()}>{laedt ? "Lädt hoch …" : "+ Programme hochladen"}</button>
          <input ref={wahl} type="file" multiple hidden id="cam-programm-datei" data-ablegen="direkt"
            onChange={(e) => { const d = [...e.target.files]; e.target.value = ""; hoch(d); }} /></div>}
      </div>
      <p className="klein">Programme, die ihr für eine {typ.name} geschrieben habt, als Textdatei (alle drei Paths in einer Datei
        oder je Path eine). Daraus lernt die App euren Stil und die M-Befehle.</p>
      {stand.fehler && <p className="hinweis">{fehltSql(stand.fehler) ? SQL_FEHLT : alt.fehlertext(stand.fehler)}</p>}
      {!stand.fehler && !stand.daten && <div className="laedt">Wird geladen …</div>}
      {stand.daten && !liste.length && <p className="hinweis">Noch keine Programme.</p>}
      {liste.length > 0 && <ul className="cam-liste">
        {liste.map((p) => (
          <li key={p.id} data-programm={p.id}>
            <button className="linkknopf cam-liste__name" onClick={() => programmZeigen(p)}>{p.name}</button>
            <span className="klein">{[p.hoco_nr, alt.datumZeitKurz(p.erstellt_am)].filter(Boolean).join(" · ")}</span>
            {darf && <button className="linkknopf" title="Löschen" onClick={() => weg(p)}>✕</button>}
          </li>))}
      </ul>}
    </section>
  );
}

function programmZeigen(p) {
  fensterOeffnen((zu) => <ProgrammFenster p={p} zu={zu} />);
}

function ProgrammFenster({ p, zu }) {
  const stand = useDaten(() => programmInhalt(p.id), [p.id]);
  const text = stand.daten || "";
  const l = stand.daten !== null ? programmLesen(text) : null;
  return (
    <div className="dialog dialog--breit cam-programm" id="cam-programm-fenster">
      <div className="dialog__kopfzeile">
        <h2>{p.name}</h2>
        <button type="button" className="dialog__schliessen-inline" title="Schliessen" aria-label="Schliessen" data-zu="" onClick={zu}>✕</button>
      </div>
      {stand.fehler && <p className="hinweis">{alt.fehlertext(stand.fehler)}</p>}
      {!l && !stand.fehler && <div className="laedt">Wird geladen …</div>}
      {l && <>
        <dl className="cam-gelesen" id="cam-gelesen">
          <dt>Zeilen</dt><dd>{alt.zahlText(l.zeilen)}</dd>
          <dt>Paths</dt><dd>{l.paths.length ? l.paths.map((x) => "$" + x).join(", ") : "keine $-Zeichen gefunden"}</dd>
          <dt>Werkzeuge</dt><dd>{l.werkzeuge.map(([t]) => t).join(", ") || "—"}</dd>
          <dt>M-Befehle</dt><dd>{l.mbefehle.map(([m, n]) => m + (n > 1 ? " ×" + n : "")).join(", ") || "—"}</dd>
        </dl>
        <pre className="cam-text">{text}</pre>
      </>}
    </div>
  );
}

// ---------- Ablauf für ein neues Programm ----------

const SCHRITTE = [
  ["Zeichnung", "HOCO Nr. wählen; die App nimmt Zeichnung, Material und Mass."],
  ["Ausrichtung", "Die App schlägt vor, wie das Teil liegt: was vorne an der Hauptspindel, was hinten an der Gegenspindel gemacht wird."],
  ["Werkzeuge", "Die App schlägt Werkzeuge und ihre Plätze vor (T100 …), passend zum Aufbau oben."],
  ["Auswahl", "Ihr streicht, was es nicht braucht, und ändert Plätze."],
  ["Programm", "Die App schreibt das Programm im Stil eurer Programme, mit den M-Befehlen der gewählten Maschine."],
];

function Ablauf({ typ }) {
  return (
    <section className="karte cam-ablauf" id="cam-ablauf">
      <h2>Neues Programm</h2>
      <ol className="cam-schritte">
        {SCHRITTE.map(([t, x], i) => <li key={t}><b>{i + 1}. {t}</b><span className="klein">{x}</span></li>)}
      </ol>
      <p className="hinweis">Dieser Ablauf kommt, sobald der Aufbau der {typ.name} steht und ein paar eurer
        Programme hochgeladen sind.</p>
    </section>
  );
}
