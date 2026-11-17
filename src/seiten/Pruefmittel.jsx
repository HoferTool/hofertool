// =================================================================
//  SEITE PRÜFMITTEL (provisorisch, seit 1.558.0, Wunsch Patrick
//  15. November 2026: „Prüfmittelverwaltung … bisher über Gewatec …
//  eine bessere Übersicht, wo was ist, dass man sagen kann, dieser
//  Prüfstift oder diese Lehre ist auf der Maschine“).
//  Reiter „Wo ist was“ (Schrank, Maschinen nach Park, Personen, extern)
//  und „Liste“. Ein Tipp auf ein Prüfmittel öffnet sein Fenster mit
//  Austragen, Zurück, Heute geprüft, Bearbeiten und Verlauf.
//  Nur Admins, nie Externe (seiteSichtbar in app.js, Regeln in der
//  Datenbank). Daten in src/daten/pruefmittel.js.
// =================================================================
import { useState } from "react";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { useSeitenSuche, hinzeigen } from "../teile/seitenSuche.js";
import { pruefmittelLaden, verlaufLaden, ARTEN, artText, ORTE, STATUS, fehltTabelle,
  maschineText, naechstePruefung, istFaellig, ortText, suchText, zeilenLesen } from "../daten/pruefmittel.js";

const gemerkt = { reiter: "wo", suche: "", filter: "" };
const T = "pruefmittel";

export default function Pruefmittel({ auffrischen, eingebettet }) {
  const [reiter, setReiter] = useState(gemerkt.reiter);
  const [suche, setSuche] = useState(gemerkt.suche);
  const [filter, setFilter] = useState(gemerkt.filter);
  useGemerkt(gemerkt, { reiter, suche, filter });
  const { daten, fehler, neu } = useDaten(pruefmittelLaden, [auffrischen]);

  useSeitenSuche({
    name: "Prüfmittel", platzhalter: "Nr., Bezeichnung, Mass, Maschine …",
    eintraege: () => ((daten && daten.liste) || []).map((p) => ({
      gruppe: "Prüfmittel", zeichen: "📏", titel: [p.nr, p.bezeichnung].filter(Boolean).join(" · "),
      zeile: [p.mass, ortText(p, daten.maschinen)].filter(Boolean).join(" · "),
      such: suchText(p, daten.maschinen), p })),
    springen: (x) => pmFenster(x.p, daten, neu),
  });

  if (fehler && !daten) {
    return (<>
      {!eingebettet && <h1 className="seitentitel">Prüfmittel</h1>}
      <div className="karte karte--fehler"><p>{fehltTabelle(fehler)
        ? "Die Prüfmittel brauchen noch sql/pruefmittel.sql in Supabase." : alt.fehlertext(fehler)}</p></div>
    </>);
  }
  if (!daten) return (<>{!eingebettet && <h1 className="seitentitel">Prüfmittel</h1>}<div className="laedt">Wird geladen …</div></>);

  const s = suche.trim().toLowerCase();
  const passt = (p) => (!s || s.split(/\s+/).every((w) => suchText(p, daten.maschinen).includes(w)))
    && (!filter || (filter === "faellig" ? istFaellig(p) : p.ort_art === filter))
    && (filter || p.status !== "weg");
  const liste = daten.liste.filter(passt);
  const aktive = daten.liste.filter((p) => p.status !== "weg");
  const zahl = (o) => aktive.filter((p) => p.ort_art === o).length;

  return (
    <>
      {!eingebettet && <h1 className="seitentitel">Prüfmittel</h1>}
      <p className="klein pm-erklaerung">Provisorisch, nur für Admins. Jedes Prüfmittel mit Nr. und Mass, und wo es gerade ist:
        im Schrank, an einer Maschine, bei einer Person oder extern. Antippen öffnet es zum Austragen, Zurückgeben oder Ändern.</p>
      <div className="pm-kacheln">
        <Kachel wert="" text="Alle" zahl={aktive.length} filter={filter} setFilter={setFilter} />
        {ORTE.map(([o, text, z]) => <Kachel key={o} wert={o} text={z + " " + text} zahl={zahl(o)} filter={filter} setFilter={setFilter} />)}
        <Kachel wert="faellig" text="⏰ Prüfung fällig" zahl={aktive.filter(istFaellig).length} filter={filter} setFilter={setFilter} warn />
      </div>
      <div className="mat-kopf">
        <button className="knopf knopf--haupt" id="pm-neu" onClick={() => bearbeiten(null, daten, neu)}>+ Prüfmittel</button>
        <input className="mat-sucheingabe" id="pm-suche" type="search" value={suche}
          placeholder="Suchen: Nr., Bezeichnung, Mass, Maschine, Person" onChange={(e) => setSuche(e.target.value)} />
        <button className="knopf" id="pm-einfuegen" onClick={() => einfuegen(neu)}>Aus Gewatec / Excel einfügen</button>
      </div>
      <Reiter reiter={[["wo", "Wo ist was"], ["liste", "Liste"]]} aktiv={reiter} waehlen={setReiter} merkmal="pmreiter" seite="pruefmittel" />
      <Uebergang key={reiter}>
        {!daten.liste.length
          ? <div className="karte karte--hinweis"><p>Noch keine Prüfmittel erfasst. Mit „+ Prüfmittel“ einzeln oder mit
              „Aus Gewatec / Excel einfügen“ viele auf einmal.</p></div>
          : !liste.length ? <div className="karte karte--hinweis"><p>Nichts gefunden.</p></div>
          : reiter === "liste" ? <Liste liste={liste} d={daten} neu={neu} />
          : <WoIstWas liste={liste} d={daten} neu={neu} />}
      </Uebergang>
    </>
  );
}

function Kachel({ wert, text, zahl, filter, setFilter, warn }) {
  return (
    <button className={"pm-kachel" + (filter === wert ? " aktiv" : "") + (warn && zahl ? " pm-kachel--warn" : "")}
      data-pmfilter={wert || "alle"} onClick={() => setFilter(filter === wert ? "" : wert)}>
      <b>{zahl}</b><span>{text}</span>
    </button>);
}

// ---------- Wo ist was ----------

function WoIstWas({ liste, d, neu }) {
  const von = (o) => liste.filter((p) => p.ort_art === o);
  const anMaschinen = von("maschine");
  const jeMaschine = new Map();
  anMaschinen.forEach((p) => {
    if (!jeMaschine.has(p.machine_id)) jeMaschine.set(p.machine_id, []);
    jeMaschine.get(p.machine_id).push(p);
  });
  const reihe = (id) => { const i = d.maschinen.findIndex((m) => m.id === id); return i < 0 ? 9999 : i; };
  const jePark = new Map();
  [...jeMaschine.keys()].sort((a, b) => reihe(a) - reihe(b)).forEach((id) => {
    const m = d.maschinen.find((x) => x.id === id);
    const park = m && d.parks.find((x) => x.id === m.park_id);
    const k = park ? park.name : "Ohne Park";
    if (!jePark.has(k)) jePark.set(k, []);
    jePark.get(k).push([m, jeMaschine.get(id)]);
  });
  const nachPerson = new Map();
  von("person").forEach((p) => {
    const k = p.ort_text || "?";
    if (!nachPerson.has(k)) nachPerson.set(k, []);
    nachPerson.get(k).push(p);
  });
  return (
    <div className="pm-wo">
      {anMaschinen.length > 0 && <section className="karte" data-pmort="maschine">
        <div className="karte__kopf"><h2>⚙️ An Maschinen</h2><span className="klein">{anMaschinen.length}</span></div>
        {[...jePark.entries()].map(([park, ms]) => (
          <div key={park} className="pm-park">
            <h3 className="pm-park__titel">{park}</h3>
            <div className="pm-maschinen">
              {ms.map(([m, pms]) => (
                <div key={m ? m.id : "?"} className="pm-maschine" data-pmmaschine={m ? m.id : ""}>
                  <div className="pm-maschine__kopf">{maschineText(m)}</div>
                  {pms.map((p) => <Zeile key={p.id} p={p} d={d} neu={neu} ohneOrt />)}
                </div>))}
            </div>
          </div>))}
      </section>}
      {von("schrank").length > 0 && <Gruppe titel="🗄️ Prüfmittelschrank" ort="schrank" liste={von("schrank")} d={d} neu={neu} />}
      {nachPerson.size > 0 && <section className="karte" data-pmort="person">
        <div className="karte__kopf"><h2>👤 Bei Personen</h2><span className="klein">{von("person").length}</span></div>
        <div className="pm-maschinen">
          {[...nachPerson.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([wer, pms]) => (
            <div key={wer} className="pm-maschine">
              <div className="pm-maschine__kopf">{wer}</div>
              {pms.map((p) => <Zeile key={p.id} p={p} d={d} neu={neu} ohneOrt />)}
            </div>))}
        </div>
      </section>}
      {von("extern").length > 0 && <Gruppe titel="🚚 Extern / Kalibrierung" ort="extern" liste={von("extern")} d={d} neu={neu} />}
    </div>);
}

function Gruppe({ titel, ort, liste, d, neu }) {
  return (
    <section className="karte" data-pmort={ort}>
      <div className="karte__kopf"><h2>{titel}</h2><span className="klein">{liste.length}</span></div>
      {liste.map((p) => <Zeile key={p.id} p={p} d={d} neu={neu} />)}
    </section>);
}

function Zeile({ p, d, neu, ohneOrt }) {
  const faellig = istFaellig(p);
  return (
    <button className={"pm-zeile" + (p.status !== "aktiv" ? " pm-zeile--aus" : "")} data-pm={p.id}
      onClick={() => pmFenster(p, d, neu)}>
      <span className="pm-zeile__nr">{p.nr || "–"}</span>
      <span className="pm-zeile__was">
        <b>{p.bezeichnung}</b>{p.mass ? " " + p.mass : ""}
        <span className="klein">
          {[p.ort_text && (ohneOrt ? p.ort_art === "maschine" : p.ort_art !== "person") ? p.ort_text : null,
            p.hoco ? "für " + p.hoco : null,
            p.ort_art !== "schrank" && p.seit ? "seit " + alt.kurzDatum(p.seit) : null].filter(Boolean).join(" · ")}
        </span>
      </span>
      {faellig && <span className="pm-schild pm-schild--warn">Prüfung fällig</span>}
      {p.status === "gesperrt" && <span className="pm-schild pm-schild--rot">Gesperrt</span>}
      {p.status === "weg" && <span className="pm-schild">Ausgeschieden</span>}
    </button>);
}

// ---------- Liste ----------

function Liste({ liste, d, neu }) {
  return (
    <div className="karte pm-tabelle-karte">
      <table className="pm-tabelle">
        <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Art</th><th>Mass</th><th>Wo</th><th>Nächste Prüfung</th><th>Status</th></tr></thead>
        <tbody>
          {liste.map((p) => {
            const n = naechstePruefung(p);
            return (
              <tr key={p.id} data-pm={p.id} onClick={() => pmFenster(p, d, neu)}>
                <td>{p.nr || "–"}</td><td><b>{p.bezeichnung}</b>{p.hoco ? <div className="klein">für {p.hoco}</div> : null}</td>
                <td>{artText(p.art)}</td><td>{p.mass || ""}</td><td>{ortText(p, d.maschinen)}</td>
                <td className={istFaellig(p) ? "pm-rot" : ""}>{n ? alt.kurzDatum(n) : "–"}</td>
                <td>{(STATUS.find((x) => x[0] === p.status) || [0, p.status])[1]}</td>
              </tr>);
          })}
        </tbody>
      </table>
    </div>);
}

// ---------- Fenster eines Prüfmittels ----------

function pmFenster(p, d, neu) {
  fensterOeffnen((zu) => <PmFenster p={p} d={d} zu={zu} neu={neu} />, null, "pm-huelle");
}

function PmFenster({ p, d, zu, neu }) {
  const { daten: verlauf } = useDaten(() => verlaufLaden(p.id), []);
  const n = naechstePruefung(p);
  const fertig = () => { zu(); neu(); };
  return (
    <div className="dialog dialog--breit pm-fenster" role="dialog" aria-modal="true" id="pm-fenster">
      <div className="blatt__kopf">
        <h2>{[p.nr, p.bezeichnung].filter(Boolean).join(" · ")}</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      <div className="pm-wo-jetzt" id="pm-wo-jetzt">
        <span className="klein">Ist jetzt</span>
        <b>{ortText(p, d.maschinen)}</b>
        {p.ort_art !== "schrank" && p.seit ? <span className="klein">seit {alt.datumZeitKurz(p.seit)}</span> : null}
      </div>
      <div className="pm-knoepfe">
        <button className="knopf knopf--haupt" id="pm-austragen" data-fokus=""
          onClick={() => { zu(); austragen(p, d, neu); }}>Austragen / Ort ändern</button>
        {p.ort_art !== "schrank" && <button className="knopf" id="pm-zurueck"
          onClick={async () => { if (await ortSetzen(p, { ort_art: "schrank", machine_id: null, ort_text: null }, "Zurück in den Schrank")) fertig(); }}>
          Zurück in den Schrank</button>}
        <button className="knopf" id="pm-geprueft" onClick={async () => {
          if (await aendern(p, { letzte_pruefung: alt.isoDatum(new Date()) }, "Prüfung " + p.bezeichnung)) fertig();
        }}>Heute geprüft</button>
        <button className="knopf" id="pm-bearbeiten" onClick={() => { zu(); bearbeiten(p, d, neu); }}>Bearbeiten</button>
        <button className="knopf knopf--gefahr" id="pm-loeschen" onClick={async () => { if (await loeschen(p)) fertig(); }}>Löschen</button>
      </div>
      <dl className="pm-angaben">
        <dt>Art</dt><dd>{artText(p.art) || "–"}</dd>
        <dt>Mass</dt><dd>{p.mass || "–"}</dd>
        <dt>Für HOCO Nr.</dt><dd>{p.hoco || "–"}</dd>
        <dt>Prüfintervall</dt><dd>{p.intervall_monate ? p.intervall_monate + " Monate" : "–"}</dd>
        <dt>Zuletzt geprüft</dt><dd>{p.letzte_pruefung ? alt.langDatum(p.letzte_pruefung) : "–"}</dd>
        <dt>Nächste Prüfung</dt><dd className={istFaellig(p) ? "pm-rot" : ""}>{n ? alt.langDatum(n) : "–"}</dd>
        <dt>Status</dt><dd>{(STATUS.find((x) => x[0] === p.status) || [0, p.status])[1]}</dd>
        {p.notiz ? <><dt>Notiz</dt><dd>{p.notiz}</dd></> : null}
      </dl>
      <h3>Verlauf</h3>
      {!verlauf ? <div className="laedt">Wird geladen …</div>
        : !verlauf.length ? <p className="hinweis">Noch nichts.</p>
        : <ul className="pm-verlauf" id="pm-verlauf">
            {verlauf.map((v) => (
              <li key={v.id}><span className="klein">{alt.datumZeitKurz(v.am)}</span>
                <b>{{ erfasst: "Erfasst", "zurück": "Zurück", ausgetragen: "Ausgetragen", "geprüft": "Geprüft", status: "Status" }[v.was] || v.was}</b>
                <span>{v.was === "status" ? (STATUS.find((x) => x[0] === v.nach) || [0, v.nach])[1] : v.nach}</span>
                <span className="klein">{d.personen.get(v.von) || alt.SYSTEM_NAME}</span></li>))}
          </ul>}
    </div>);
}

// ---------- Austragen: wohin? ----------

function austragen(p, d, neu) {
  fensterOeffnen((zu) => <Austragen p={p} d={d} zu={zu} neu={neu} />, null, "pm-huelle");
}

function Austragen({ p, d, zu, neu }) {
  const [art, setArt] = useState(p.ort_art === "schrank" ? "maschine" : p.ort_art);
  const [maschine, setMaschine] = useState(p.ort_art === "maschine" ? p.machine_id : null);
  const [text, setText] = useState(p.ort_text || "");
  const jePark = d.parks.map((park) => [park, d.maschinen.filter((m) => m.park_id === park.id)]).filter(([, ms]) => ms.length);
  const speichern = async () => {
    if (art === "maschine" && !maschine) { alt.meldung("Bitte eine Maschine wählen.", "warn"); return; }
    if (art === "person" && !text.trim()) { alt.meldung("Bitte die Person eintragen.", "warn"); return; }
    const ok = await ortSetzen(p, { ort_art: art, machine_id: art === "maschine" ? maschine : null,
      ort_text: text.trim() || null }, "Austragen " + p.bezeichnung);
    if (ok) { zu(); neu(); }
  };
  return (
    <div className="dialog dialog--breit pm-fenster" role="dialog" aria-modal="true" id="pm-austragen-fenster">
      <div className="blatt__kopf">
        <h2>Wohin kommt {p.nr ? p.nr + " " : ""}{p.bezeichnung}?</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Abbrechen</button>
      </div>
      <div className="pm-ortwahl">
        {ORTE.map(([o, t, z]) => (
          <button key={o} className={"pm-ortknopf" + (art === o ? " aktiv" : "")} data-pmortwahl={o}
            onClick={() => { setArt(o); if (o !== p.ort_art) setText(""); }}>{z}<span>{t}</span></button>))}
      </div>
      {art === "maschine" && <div className="pm-maschinenwahl">
        {jePark.map(([park, ms]) => (
          <div key={park.id}>
            <h3 className="pm-park__titel">{park.name}</h3>
            <div className="typwahl">
              {ms.map((m) => (
                <button key={m.id} className={"typwahl__knopf" + (maschine === m.id ? " aktiv" : "")}
                  data-pmwahlmaschine={m.id} onClick={() => setMaschine(m.id)}>{maschineText(m)}</button>))}
            </div>
          </div>))}
      </div>}
      <label className="feld pm-ortfeld">
        <span>{art === "person" ? "Person" : art === "extern" ? "Firma / Grund (freiwillig)" : art === "schrank" ? "Fach (freiwillig)" : "Notiz (freiwillig)"}</span>
        <input id="pm-orttext" type="text" value={text} list={art === "person" ? "pm-namen" : undefined}
          placeholder={art === "person" ? "Name" : art === "extern" ? "z.B. Kalibrierung bei …" : ""}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") speichern(); }} />
        <datalist id="pm-namen">{d.namen.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--haupt" id="pm-austragen-ok" onClick={speichern}>Speichern</button>
      </div>
    </div>);
}

// ---------- Speichern ----------

async function aendern(p, daten, schritt) {
  const vorher = await alt.rueckSichern(T, { id: p.id });
  const { error } = await alt.db.from(T).update(daten).eq("id", p.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return false; }
  alt.merkeSchritt(schritt, alt.rueckRein(T, vorher));
  alt.meldung("Gespeichert.", "gut");
  return true;
}
const ortSetzen = (p, ort, schritt) => aendern(p, ort, schritt);

async function loeschen(p) {
  const ok = await alt.nachfragen({ titel: "Prüfmittel löschen",
    text: "„" + p.bezeichnung + "“ samt Verlauf löschen? Ausgeschiedene besser unter Bearbeiten → Status „Ausgeschieden“.",
    bestaetigen: "Löschen", gefahr: true });
  if (!ok) return false;
  const vorher = await alt.rueckSichern(T, { id: p.id });
  const { error } = await alt.db.from(T).delete().eq("id", p.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return false; }
  alt.merkeSchritt("Löschen von " + p.bezeichnung, alt.rueckRein(T, vorher));
  alt.meldung("Gelöscht.", "gut");
  return true;
}

async function bearbeiten(p, d, neu) {
  const w = await alt.dialogFelder({
    titel: p ? "Prüfmittel ändern" : "Neues Prüfmittel",
    felder: [
      { name: "nr", label: "Nr. (wie in Gewatec)", wert: p ? p.nr || "" : "", platzhalter: "PM-0123" },
      { name: "bezeichnung", label: "Bezeichnung", pflicht: true, wert: p ? p.bezeichnung : "", platzhalter: "Grenzlehrdorn, Prüfstift …" },
      { name: "art", label: "Art", auswahl: [["", "–"], ...ARTEN], wert: p ? p.art || "" : "" },
      { name: "mass", label: "Mass", wert: p ? p.mass || "" : "", platzhalter: "Ø 4.000 H7, M6 6H …" },
      { name: "hoco", label: "Für HOCO Nr. (freiwillig)", wert: p ? p.hoco || "" : "", platzhalter: "10841-0009" },
      { name: "intervall", label: "Prüfintervall in Monaten (leer = keins)", typ: "number", wert: p && p.intervall_monate ? p.intervall_monate : "" },
      { name: "letzte", label: "Zuletzt geprüft", typ: "date", wert: p ? p.letzte_pruefung || "" : "" },
      { name: "status", label: "Status", auswahl: STATUS, wert: p ? p.status : "aktiv" },
      { name: "notiz", label: "Notiz", typ: "textarea", wert: p ? p.notiz || "" : "" },
    ],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  const daten = {
    nr: (w.nr || "").trim() || null, bezeichnung: w.bezeichnung.trim(), art: w.art || null,
    mass: (w.mass || "").trim() || null, hoco: (w.hoco || "").trim() || null,
    intervall_monate: Number(w.intervall) > 0 ? Math.round(Number(w.intervall)) : null,
    letzte_pruefung: /^\d{4}-\d{2}-\d{2}$/.test(w.letzte || "") ? w.letzte : null,
    status: w.status || "aktiv", notiz: (w.notiz || "").trim() || null,
  };
  if (p) {
    if (await aendern(p, daten, "Ändern von " + daten.bezeichnung)) neu();
    return;
  }
  const { data, error } = await alt.db.from(T).insert({ ...daten, ort_art: "schrank" }).select("id");
  if (error) { alt.meldung(fehltTabelle(error) ? "Die Prüfmittel brauchen noch sql/pruefmittel.sql in Supabase." : alt.fehlertext(error), "fehler"); return; }
  const id = Array.isArray(data) && data[0] && data[0].id;
  if (id) alt.merkeSchritt("Prüfmittel " + daten.bezeichnung, alt.rueckWeg(T, { id }));
  alt.meldung("Erfasst. Es steht im Prüfmittelschrank.", "gut");
  neu();
  if (id) setTimeout(() => hinzeigen('[data-pm="' + id + '"]'), 300);
}

async function einfuegen(neu) {
  const w = await alt.dialogFelder({
    titel: "Prüfmittel einfügen",
    text: "Aus Gewatec oder Excel kopieren und hier einfügen. Eine Zeile je Prüfmittel, Spalten mit Tab oder Semikolon:"
      + " Nr; Bezeichnung; Mass; Art; Intervall in Monaten. Nur die Bezeichnung ist Pflicht. Alle kommen in den Prüfmittelschrank.",
    felder: [{ name: "text", label: "Zeilen", typ: "textarea", wert: "", platzhalter: "PM-001\tGrenzlehrdorn\tØ 4.000 H7\tGrenzlehrdorn\t12" }],
    bestaetigen: "Einfügen",
  });
  if (!w) return;
  const zeilen = zeilenLesen(w.text);
  if (!zeilen.length) { alt.meldung("Keine Zeilen erkannt.", "warn"); return; }
  const { data, error } = await alt.db.from(T).insert(zeilen).select("id");
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  const ids = (data || []).map((x) => x.id);
  if (ids.length) alt.merkeSchritt(ids.length + " Prüfmittel eingefügt", ids.map((id) => alt.rueckWeg(T, { id })).flat());
  alt.meldung(zahlText(ids.length) + " Prüfmittel eingefügt.", "gut");
  neu();
}
const zahlText = (n) => alt.zahlText ? alt.zahlText(n) : String(n);
