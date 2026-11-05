// =================================================================
//  NC-PRO → HOFER CAM
//  Seit 1.394.0 (Wunsch Patrick 5. November 2026: „im NC Pro einen
//  Bereich Hofer Cam, maschinenspezifische NC-Codes erzeugen:
//  Programmkopf, Ende und Start und Ende der Bearbeitungen, dort die
//  NC-Codes aus den einzelnen Tools einfügen“).
//
//  Zwei Ansichten:
//   - Programm: Maschine wählen, Bearbeitungen der Reihe nach (Code aus
//     den anderen Reitern geholt, aus gespeicherten Programmen oder von
//     Hand), daraus das ganze Programm mit Kopf, Start-/Ende-Block je
//     Bearbeitung und Programmende der Maschine.
//   - Vorlagen: je Maschine Programmkopf, Programmende und je Art der
//     Bearbeitung ein Start- und ein Ende-Block, mit Platzhaltern.
//  Vorlagen in der Tabelle cam_vorlagen (sql/hofer-cam.sql), fertige
//  Programme in nc_programme mit art „cam“. Nicht für Externe (die
//  Seite NC-PRO sehen sie nicht).
// =================================================================
import { useEffect, useMemo, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { NcAblage, NcStand } from "./NcAblage.jsx";
import { CAM_ARTEN, aktuell, artName, camProgramm, neueId } from "./camKorb.jsx";

const TABELLE = "cam_vorlagen";
const ohneTabelle = (e) => e && /cam_vorlagen|relation|schema cache|PGRST205|42P01/i.test((e.message || "") + (e.code || ""));
const KONTO = "cam_vorlagen";

export const PLATZHALTER = [
  ["{PRG}", "Programm-Nr."], ["{NAME}", "Name des Programms"], ["{HOCO}", "HOCO Nr."],
  ["{MASCHINE}", "Maschine"], ["{DATUM}", "heutiges Datum"],
  ["{NR}", "Nummer der Bearbeitung"], ["{TITEL}", "Bezeichnung der Bearbeitung"],
  ["{T}", "Werkzeug der Bearbeitung"], ["{S}", "Drehzahl der Bearbeitung"],
];

const zeilen = (t) => String(t || "").replace(/\r/g, "").split("\n").map((z) => z.replace(/\s+$/, ""));
const ohneLeerRand = (l) => { let a = 0, b = l.length; while (a < b && !l[a].trim()) a++; while (b > a && !l[b - 1].trim()) b--; return l.slice(a, b); };

function ersetzen(text, werte) {
  return String(text || "").replace(/\{([A-Z]+)\}/g, (ganz, n) => (n in werte ? werte[n] : ganz));
}

// Setzt das ganze Programm zusammen. Leere Zeilen am Rand eines Blocks
// fallen weg, damit keine Lücken entstehen, wo eine Vorlage leer ist.
export function camZusammensetzen(p, vorlage, maschinenName) {
  const v = vorlage || {};
  const d = new Date();
  const grund = {
    PRG: p.prg || "", NAME: p.name || "", HOCO: p.hoco || "", MASCHINE: maschinenName || "",
    DATUM: String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear(),
  };
  const aus = [];
  const block = (text, werte) => ohneLeerRand(zeilen(ersetzen(text, werte))).forEach((z) => aus.push(z));
  block(v.kopf, grund);
  (p.bearb || []).forEach((b, i) => {
    const werte = { ...grund, NR: String(i + 1), TITEL: b.titel || artName(b.art), T: b.t || "", S: b.s || "" };
    const a = (v.arten || {})[b.art] || {};
    block(a.start, werte);
    block(b.nc, werte);
    block(a.ende, werte);
  });
  block(v.ende, grund);
  return aus.join("\n");
}

const vorlageLeer = (v) => !v || (!String(v.kopf || "").trim() && !String(v.ende || "").trim()
  && !Object.values(v.arten || {}).some((a) => String(a.start || "").trim() || String(a.ende || "").trim()));

// ---------- Daten ----------
let vorrat = null; // { maschinen, parks, vorlagen: {machineId: {daten, …}}, konto }
async function laden(neu) {
  if (vorrat && !neu) return vorrat;
  const [parks, maschinen] = await Promise.all([alt.ladeParks(false, true), alt.ladeMaschinen(false, true)]);
  let typen = [];
  try { typen = await alt.ladeTypen(); } catch (f) { /* ohne Typen */ }
  const vorlagen = {};
  let konto = false;
  const { data, error } = await alt.db.from(TABELLE).select("id, machine_id, daten, geaendert_am, geaendert_von");
  if (error) {
    if (!ohneTabelle(error)) throw error;
    konto = true;
    try { Object.assign(vorlagen, JSON.parse(alt.einstellungWert(KONTO, "{}")) || {}); } catch (f) { /* leer */ }
  } else {
    (data || []).forEach((z) => { vorlagen[z.machine_id] = z; });
  }
  vorrat = { parks, maschinen, typen, vorlagen, konto };
  return vorrat;
}

async function vorlageSpeichern(maschinenIds, daten) {
  if (vorrat.konto) {
    maschinenIds.forEach((id) => { vorrat.vorlagen[id] = { machine_id: id, daten, geaendert_am: new Date().toISOString() }; });
    alt.einstellungSetzenWert(KONTO, JSON.stringify(vorrat.vorlagen));
    return null;
  }
  const r = await alt.db.from(TABELLE).upsert(maschinenIds.map((id) => ({ machine_id: id, daten })), { onConflict: "machine_id" })
    .select("id, machine_id, daten, geaendert_am, geaendert_von");
  if (r.error) return r.error;
  (r.data || []).forEach((z) => { vorrat.vorlagen[z.machine_id] = z; });
  return null;
}

const mName = (m) => (m ? (m.machine_number ? m.machine_number + (m.name && m.name !== m.machine_number ? " · " + m.name : "") : m.name) : "");

function MaschinenWahl({ v, wert, setze, id, mitVorlage }) {
  return (
    <select id={id} value={wert || ""} onChange={(e) => setze(e.target.value)}>
      <option value="">– Maschine wählen –</option>
      {v.parks.map((p) => {
        const liste = v.maschinen.filter((m) => m.park_id === p.id);
        if (!liste.length) return null;
        return (
          <optgroup key={p.id} label={p.name}>
            {liste.map((m) => <option key={m.id} value={m.id}>{mName(m)}{mitVorlage && !vorlageLeer(v.vorlagen[m.id]?.daten) ? " ✓" : ""}</option>)}
          </optgroup>
        );
      })}
    </select>
  );
}

// ---------- Hauptteil ----------
const gemerkt = { ansicht: "programm" };
let gespeichertCam = null;

export default function HoferCam() {
  const [v, setV] = useState(vorrat);
  const [fehler, setFehler] = useState("");
  const [ansicht, setAnsichtRoh] = useState(gemerkt.ansicht);
  const setAnsicht = (a) => { gemerkt.ansicht = a; setAnsichtRoh(a); };
  useEffect(() => {
    let weg = false;
    laden().then((x) => { if (!weg) setV({ ...x }); })
      .catch((e) => { if (!weg) setFehler("Laden ging nicht: " + (e.message || e)); });
    return () => { weg = true; };
  }, []);
  if (fehler) return <div className="karte"><p className="kt-fehler">{fehler}</p></div>;
  if (!v) return <div className="karte"><p className="klein">Wird geladen …</p></div>;
  return (
    <div className="cam">
      <div className="moduswahl" id="cam-ansicht">
        <button className={"moduswahl__knopf" + (ansicht === "programm" ? " aktiv" : "")} data-camansicht="programm"
          onClick={() => setAnsicht("programm")}>Programm</button>
        <button className={"moduswahl__knopf" + (ansicht === "vorlagen" ? " aktiv" : "")} data-camansicht="vorlagen"
          onClick={() => setAnsicht("vorlagen")}>Vorlagen der Maschinen</button>
      </div>
      {v.konto && <p className="hinweis">Die Tabelle für Hofer Cam fehlt noch in der Datenbank. Vorlagen bleiben vorerst an deinem Konto.</p>}
      {ansicht === "programm"
        ? <Programm v={v} zuVorlagen={() => setAnsicht("vorlagen")} />
        : <Vorlagen v={v} neu={() => setV({ ...vorrat })} />}
    </div>
  );
}

// ---------- Programm ----------
function Programm({ v, zuVorlagen }) {
  const [p, setP] = useState(() => ({ ...camProgramm, bearb: [...(camProgramm.bearb || [])] }));
  const [gespeichert, setGespeichertRoh] = useState(gespeichertCam);
  const setGespeichert = (z) => { gespeichertCam = z; setGespeichertRoh(z); };
  const aendern = (neu) => { const ganz = { ...p, ...neu }; Object.assign(camProgramm, ganz); setP(ganz); };
  const bearbAendern = (i, neu) => aendern({ bearb: p.bearb.map((b, j) => (j === i ? { ...b, ...neu } : b)) });
  const schieben = (i, um) => {
    const l = [...p.bearb]; const j = i + um;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]]; aendern({ bearb: l });
  };

  const maschine = v.maschinen.find((m) => m.id === p.maschine);
  const vorlage = v.vorlagen[p.maschine]?.daten;
  const nc = useMemo(() => camZusammensetzen(p, vorlage, mName(maschine)), [p, vorlage, maschine]);

  const neueBearbeitung = (art) => {
    const a = aktuell[art];
    aendern({ bearb: [...p.bearb, { id: neueId(), art, titel: (a && a.titel) || "", t: "", s: "", nc: (a && a.nc) || "" }] });
  };
  const hinzu = async () => {
    const w = await alt.auswahlDialog("Bearbeitung hinzufügen", CAM_ARTEN.map(([wert, text]) => ({
      wert, text: text + (aktuell[wert] ? " ✓" : ""),
    })), "Mit ✓: das Programm, das gerade in diesem Reiter steht, kommt gleich mit. Sonst bleibt der Code leer zum Holen oder Einfügen.");
    if (w) neueBearbeitung(w);
  };

  const kopieren = async () => {
    try { await navigator.clipboard.writeText(nc); alt.meldung("NC-Programm kopiert."); }
    catch (f) { alt.meldung("Kopieren ging nicht. Bitte von Hand markieren.", "warn"); }
  };
  const herunterladen = () => {
    const name = (p.prg ? "O" + String(p.prg).replace(/^O/i, "") : (p.name || "programm")).replace(/[^\w.-]+/g, "_");
    const url = URL.createObjectURL(new Blob([nc.replace(/\n/g, "\r\n") + "\r\n"], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = name + ".nc"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="cam-raster">
      <div className="cam-links">
        <section className="karte">
          <div className="karte__kopf"><h2>Programm</h2>
            <NcAblage art="cam" kurz="cam" wort="Hofer-Cam-Programm" daten={p} nc={nc}
              laden={(d) => { const ganz = { maschine: "", prg: "", name: "", hoco: "", ...d, bearb: (d.bearb || []).map((b) => ({ ...b, id: b.id || neueId() })) }; Object.assign(camProgramm, ganz); setP(ganz); }}
              gespeichert={gespeichert} setGespeichert={setGespeichert} /></div>
          <div className="cam-kopffelder">
            <label className="feld"><span>Maschine</span>
              <MaschinenWahl v={v} id="cam-maschine" wert={p.maschine} setze={(m) => aendern({ maschine: m })} mitVorlage /></label>
            <label className="feld"><span>Programm-Nr. {"{PRG}"}</span>
              <input type="text" data-cam="prg" value={p.prg} onChange={(e) => aendern({ prg: e.target.value })} placeholder="z. B. 1234" /></label>
            <label className="feld"><span>HOCO Nr. {"{HOCO}"}</span>
              <input type="text" data-cam="hoco" value={p.hoco} onChange={(e) => aendern({ hoco: e.target.value })} /></label>
            <label className="feld"><span>Name {"{NAME}"}</span>
              <input type="text" data-cam="name" value={p.name} onChange={(e) => aendern({ name: e.target.value })} /></label>
          </div>
          {p.maschine && vorlageLeer(vorlage) && <p className="hinweis" id="cam-ohne-vorlage">Für diese Maschine sind noch keine Vorlagen hinterlegt.{" "}
            <button className="linkknopf" onClick={zuVorlagen}>Jetzt anlegen</button></p>}
          {!p.maschine && <p className="hinweis">Zuerst die Maschine wählen, dann kommen Programmkopf, Start- und Ende-Blöcke und Programmende aus ihren Vorlagen.</p>}
        </section>
        {p.bearb.map((b, i) => (
          <Bearbeitung key={b.id} b={b} nr={i + 1} anzahl={p.bearb.length} aendern={(neu) => bearbAendern(i, neu)}
            schieben={(um) => schieben(i, um)}
            weg={() => aendern({ bearb: p.bearb.filter((_, j) => j !== i) })} />
        ))}
        <div className="cam-hinzu">
          <button className="knopf" id="cam-hinzu" onClick={hinzu}>+ Bearbeitung</button>
          <span className="klein">oder in einem Reiter „➜ In Hofer Cam“ antippen</span>
        </div>
      </div>
      <section className="karte cam-ausgabe">
        <div className="karte__kopf"><h2>NC-Programm{maschine ? " · " + mName(maschine) : ""}</h2>
          <span className="kt-dateien">
            <button className="linkknopf" id="cam-datei" onClick={herunterladen}>Als Datei</button>
            <button className="linkknopf" id="cam-kopieren" onClick={kopieren}>Kopieren</button></span></div>
        <NcStand kurz="cam" gespeichert={gespeichert} nc={nc} />
        <pre className="gcode cam-code" id="cam-code">{nc || "( Noch leer )"}</pre>
      </section>
    </div>
  );
}

function Bearbeitung({ b, nr, anzahl, aendern, schieben, weg }) {
  const holbar = !!aktuell[b.art];
  const ablage = b.art === "kontur" ? "konturen" : (b.art === "bohren" || b.art === "entgraten") ? "nc_programme" : null;
  const holen = () => {
    const a = aktuell[b.art];
    if (!a) return;
    aendern({ nc: a.nc, titel: b.titel || a.titel || "" });
    alt.meldung("Code aus „" + artName(b.art) + "“ geholt.", "gut");
  };
  const gespeichertHolen = async () => {
    let q = alt.db.from(ablage).select("id, name, nc, geaendert_am").order("geaendert_am", { ascending: false }).limit(300);
    if (ablage === "nc_programme") q = q.eq("art", b.art);
    const { data, error } = await q;
    if (error) { alt.meldung("Laden ging nicht: " + (error.message || error), "fehler"); return; }
    if (!data || !data.length) { alt.meldung("Noch nichts gespeichert.", "warn"); return; }
    fensterOeffnen((zu) => <GespeichertWahl titel={"Gespeichert: " + artName(b.art)} liste={data} zu={zu}
      waehlen={(z) => { aendern({ nc: z.nc || "", titel: b.titel || z.name }); zu(); }} />);
  };
  return (
    <section className="karte cam-bearb" data-cambearb={nr}>
      <div className="cam-bearb__kopf">
        <b className="cam-bearb__nr">{nr}</b>
        <select data-camfeld="art" value={b.art} onChange={(e) => aendern({ art: e.target.value })}>
          {CAM_ARTEN.map(([w, t]) => <option key={w} value={w}>{t}</option>)}
        </select>
        <input type="text" data-camfeld="titel" className="cam-bearb__titel" placeholder="Bezeichnung {TITEL}" value={b.titel}
          onChange={(e) => aendern({ titel: e.target.value })} />
        <label className="cam-klein"><span>T</span><input type="text" data-camfeld="t" value={b.t} placeholder="0101"
          onChange={(e) => aendern({ t: e.target.value })} /></label>
        <label className="cam-klein"><span>S</span><input type="text" data-camfeld="s" value={b.s} placeholder="2500"
          onChange={(e) => aendern({ s: e.target.value })} /></label>
        <span className="cam-bearb__knoepfe">
          <button className="knopf knopf--klein knopf--still" title="Nach oben" disabled={nr === 1} onClick={() => schieben(-1)}>↑</button>
          <button className="knopf knopf--klein knopf--still" title="Nach unten" disabled={nr === anzahl} onClick={() => schieben(1)}>↓</button>
          <button className="kt-weg" title="Bearbeitung entfernen" data-camweg={nr} onClick={weg}>✕</button>
        </span>
      </div>
      <textarea className="cam-bearb__code" data-camfeld="nc" rows={Math.min(12, Math.max(4, zeilen(b.nc).length + 1))}
        spellCheck={false} placeholder="NC-Code dieser Bearbeitung: holen oder hier einfügen" value={b.nc}
        onChange={(e) => aendern({ nc: e.target.value })} />
      {b.art !== "frei" && <div className="cam-bearb__holen">
        <button className="linkknopf" data-camholen={nr} disabled={!holbar} onClick={holen}
          title={holbar ? "" : "Zuerst im Reiter „" + artName(b.art) + "“ etwas erzeugen"}>Aus Reiter „{artName(b.art)}“ holen</button>
        {ablage && <button className="linkknopf" data-camgesp={nr} onClick={gespeichertHolen}>Gespeichertes holen …</button>}
      </div>}
    </section>
  );
}

function GespeichertWahl({ titel, liste, zu, waehlen }) {
  const [suche, setSuche] = useState("");
  const w = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const passend = liste.filter((z) => w.every((x) => String(z.name || "").toLowerCase().includes(x)));
  return (
    <div className="dialog kt-liste-fenster"><h2>{titel}</h2>
      <input type="text" data-fokus placeholder="Suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      <div className="kt-gespeichert">
        {passend.length === 0 && <p className="klein">Nichts gefunden.</p>}
        {passend.map((z) => (
          <div key={z.id} className="kt-gesp">
            <button className="kt-gesp__name" data-camgespwahl={z.name} onClick={() => waehlen(z)}>
              <b>{z.name}</b><span className="klein">{z.geaendert_am ? alt.datumZeitKurz(z.geaendert_am) : ""}</span></button>
          </div>
        ))}
      </div>
      <div className="dialog__knoepfe"><button className="knopf knopf--still" onClick={zu}>Schliessen</button></div>
    </div>
  );
}

// ---------- Vorlagen ----------
const vorlageLeerNeu = () => ({ kopf: "", ende: "", arten: {} });

function Vorlagen({ v, neu }) {
  const [maschine, setMaschine] = useState(camProgramm.maschine || "");
  const gesp = v.vorlagen[maschine];
  const [daten, setDaten] = useState(() => ({ ...vorlageLeerNeu(), ...(gesp?.daten || {}) }));
  const [geaendert, setGeaendert] = useState(false);
  const schreiben = alt.darfSchreiben();
  const m = v.maschinen.find((x) => x.id === maschine);

  const wechseln = async (id) => {
    if (geaendert && !(await alt.nachfragen({ titel: "Nicht gespeichert", text: "Die Änderungen an den Vorlagen sind noch nicht gespeichert. Trotzdem wechseln?", bestaetigen: "Wechseln" }))) return;
    setMaschine(id);
    setDaten({ ...vorlageLeerNeu(), ...(v.vorlagen[id]?.daten || {}) });
    setGeaendert(false);
  };
  const setze = (neuD) => { setDaten((d) => ({ ...d, ...neuD })); setGeaendert(true); };
  const setzeArt = (art, teil, wert) => {
    setDaten((d) => ({ ...d, arten: { ...(d.arten || {}), [art]: { ...((d.arten || {})[art] || {}), [teil]: wert } } }));
    setGeaendert(true);
  };

  const speichern = async (ids, text) => {
    const f = await vorlageSpeichern(ids, daten);
    if (f) { alt.meldung("Speichern ging nicht: " + (f.message || f), "fehler"); return; }
    setGeaendert(false); neu();
    alt.meldung(text, "gut");
  };
  const fuerTyp = async () => {
    if (!m || !m.type_id) { alt.meldung("Diese Maschine hat keinen Typ.", "warn"); return; }
    const gleiche = v.maschinen.filter((x) => x.type_id === m.type_id);
    const typ = (v.typen || []).find((t) => t.id === m.type_id);
    if (!(await alt.nachfragen({ titel: "Für alle des Typs",
      text: "Diese Vorlagen für alle " + gleiche.length + " Maschinen" + (typ ? " vom Typ " + typ.name : " dieses Typs") + " speichern ("
        + gleiche.map(mName).join(", ") + ")? Ihre bisherigen Vorlagen werden ersetzt.", bestaetigen: "Für alle speichern" }))) return;
    speichern(gleiche.map((x) => x.id), "Vorlagen für " + gleiche.length + " Maschinen gespeichert.");
  };
  const uebernehmen = async () => {
    const mit = v.maschinen.filter((x) => x.id !== maschine && !vorlageLeer(v.vorlagen[x.id]?.daten));
    if (!mit.length) { alt.meldung("Noch keine andere Maschine hat Vorlagen.", "warn"); return; }
    const w = await alt.auswahlDialog("Von welcher Maschine übernehmen?", mit.map((x) => ({ wert: x.id, text: mName(x) })),
      "Alle Felder werden mit den Vorlagen dieser Maschine gefüllt. Gespeichert wird erst mit „Speichern“.");
    if (!w) return;
    setDaten({ ...vorlageLeerNeu(), ...JSON.parse(JSON.stringify(v.vorlagen[w].daten || {})) });
    setGeaendert(true);
  };

  return (
    <div className="cam-vorlagen">
      <section className="karte">
        <div className="karte__kopf"><h2>Vorlagen der Maschine</h2></div>
        <div className="cam-kopffelder">
          <label className="feld"><span>Maschine</span>
            <MaschinenWahl v={v} id="cam-v-maschine" wert={maschine} setze={wechseln} mitVorlage /></label>
          {maschine && <div className="cam-v-knoepfe">
            {schreiben && <button className="knopf" id="cam-v-speichern" disabled={!geaendert}
              onClick={() => speichern([maschine], "Vorlagen für " + mName(m) + " gespeichert.")}>Speichern</button>}
            {schreiben && <button className="knopf knopf--still" id="cam-v-typ" onClick={fuerTyp}>Für alle Maschinen des Typs speichern</button>}
            {schreiben && <button className="knopf knopf--still" id="cam-v-von" onClick={uebernehmen}>Von anderer Maschine übernehmen</button>}
            {geaendert && <span className="kt-fehler">Noch nicht gespeichert</span>}
            {!geaendert && gesp?.geaendert_am && <span className="klein">Gespeichert am {alt.datumZeitKurz(gesp.geaendert_am)}</span>}
          </div>}
        </div>
        <p className="klein">Platzhalter werden beim Zusammensetzen ersetzt: {PLATZHALTER.map(([p, t]) => <span key={p} className="cam-ph"><code>{p}</code> {t}</span>)}</p>
      </section>
      {maschine && <>
        <section className="karte cam-v-zwei">
          <VorlageFeld label="Programmkopf" name="kopf" wert={daten.kopf} setze={(w) => setze({ kopf: w })} lesen={!schreiben}
            platzhalter={"%\nO{PRG} ( {NAME} {HOCO} )\nG50 S5000\n…"} />
          <VorlageFeld label="Programmende" name="ende" wert={daten.ende} setze={(w) => setze({ ende: w })} lesen={!schreiben}
            platzhalter={"M9\nG28 U0 W0\nM30\n%"} />
        </section>
        <h3 className="cam-v-titel">Start und Ende je Bearbeitung</h3>
        {CAM_ARTEN.map(([art, text]) => {
          const a = (daten.arten || {})[art] || {};
          return (
            <section key={art} className="karte cam-v-zwei" data-camvart={art}>
              <h3 className="cam-v-art">{text}</h3>
              <VorlageFeld label="Start" name={art + "-start"} wert={a.start} setze={(w) => setzeArt(art, "start", w)} lesen={!schreiben}
                platzhalter={"( {NR} {TITEL} )\nT{T}\nM3 S{S}"} />
              <VorlageFeld label="Ende" name={art + "-ende"} wert={a.ende} setze={(w) => setzeArt(art, "ende", w)} lesen={!schreiben}
                platzhalter={"G0 X50.\nM5"} />
            </section>
          );
        })}
      </>}
    </div>
  );
}

function VorlageFeld({ label, name, wert, setze, lesen, platzhalter }) {
  return (
    <label className="feld cam-v-feld"><span>{label}</span>
      <textarea data-camvorlage={name} rows={Math.min(14, Math.max(4, zeilen(wert).length + 1))} spellCheck={false}
        readOnly={lesen} placeholder={platzhalter} value={wert || ""} onChange={(e) => setze(e.target.value)} /></label>
  );
}
