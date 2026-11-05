// =================================================================
//  NC-PRO → HOFER CAM
//  Seit 1.395.0 (Wunsch Patrick 5. November 2026): Programmkopf und
//  Programmende für die Star SB-20RG mit Eingabefeldern, darunter beide
//  Kanäle nebeneinander. Gleiche Synchronisationsmarken stehen auf
//  derselben Zeile, die App füllt dazwischen Leerzeilen; eine Marke ohne
//  Gegenstück ist rot. Rechnen in hofercam.js. Patrick gibt die Schritte
//  vor, darum hier bewusst nur Kopf, Ende und seit 1.396.0 Blöcke für
//  Drehwerkzeuge T100–T600 (weitere Plätze kommen nach seinen Vorgaben).
// =================================================================
import { useEffect, useMemo, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { NcAblage, NcStand } from "./NcAblage.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { inEigenesFenster } from "../../teile/eigenesFenster.js";
import { DREH_PLAETZE, FELDER, FRONT_PLAETZE, HD_STUFEN, blockFehler, neuerBlock, programme, pruefen, synchronisieren, vorgabe } from "./hofercam.js";

// Bleibt beim Wechsel auf einen anderen Reiter stehen
const gemerkt = vorgabe();
// Seit 1.397.0 (Wunsch Patrick 5. November 2026: „muss auch abgespeichert
// und wieder geöffnet werden können“): wie Bohren / Fräsen in
// nc_programme mit art "cam", NC = beide Kanäle hintereinander.
let gespeichertCam = null;

// Seit 1.398.0 (Wunsch Patrick 5. November 2026: „das erzeugte NC-Programm
// soll in einem separaten Tab geöffnet werden können und auch auf einen
// anderen Bildschirm verschoben werden“): die beiden Kanäle ziehen wie
// der NC-PRO-Rechner in ein eigenes Browserfenster und rechnen dort live
// aus „gemerkt“ mit. Der Reiter zeigt so lange nur „Zurückholen“.
const hoerer = new Set();
const melden = () => hoerer.forEach((f) => f());
let fensterZu = null;
// Angewählte Bearbeitung (Wunsch Patrick 5. November 2026: „der NC-Code-
// Bereich soll für die aktuell angewählte Bearbeitung hervorgehoben
// werden“), auch im eigenen Fenster
let aktivId = null;
function useGemerkt() {
  const [, neu] = useState(0);
  useEffect(() => { const f = () => neu((n) => n + 1); hoerer.add(f); return () => { hoerer.delete(f); }; }, []);
}
function programmFensterAuf() {
  if (fensterZu) return;
  const zu = fensterOeffnen((zu) => (
    <div className="dialog cam-eigen">
      <div className="cam-eigen__kopf"><b>Hofer Cam · NC-Programm</b>
        <button className="knopf knopf--klein" id="cam-eigen-zu" onClick={zu}>Zurück ins HoferTool</button></div>
      <ImFenster />
    </div>
  ), () => { fensterZu = null; melden(); }, "cam-eigen-huelle");
  const huellen = document.querySelectorAll(".cam-eigen-huelle");
  const huelle = huellen[huellen.length - 1];
  fensterZu = zu;
  melden();
  if (!huelle || !inEigenesFenster(huelle, zu, { titel: "Hofer Cam · O" + programme(gemerkt).nr1,
    lage: { x: window.screenX + 80, y: window.screenY + 80 } })) zu();
}
function ImFenster() {
  useGemerkt();
  const w = { ...gemerkt };
  const prog = programme(w);
  const bereich = prog.bereiche[aktivId];
  // Im Fenster rollt die markierte Bearbeitung von selbst ins Bild
  useEffect(() => {
    const d = document.querySelector(".cam-eigen-huelle");
    const el = d && d.querySelector(".cam-zeile--aktiv");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [aktivId, bereich && bereich[0]]);
  return <Kanaele prog={prog} sync={synchronisieren(prog.k1, prog.k2)} fehler={pruefen(w)} bereich={bereich} />;
}

const text = (zeilen) => zeilen.join("\r\n") + "\r\n";
// Kopieren und Herunterladen im Dokument des Knopfs, damit es auch im
// eigenen Fenster geht (dort hat das Hauptfenster keinen Fokus)
async function kopieren(e, zeilen, kanal) {
  const nav = (e.currentTarget.ownerDocument.defaultView || window).navigator;
  try {
    await nav.clipboard.writeText(text(zeilen));
    alt.meldung("Kanal " + kanal + " kopiert.", "gut");
  } catch (f) { alt.meldung("Kopieren ging nicht. Bitte von Hand markieren.", "warn"); }
}
function herunterladen(e, zeilen, nr) {
  const d = e.currentTarget.ownerDocument;
  const url = URL.createObjectURL(new Blob([text(zeilen)], { type: "text/plain" }));
  const a = d.createElement("a");
  a.href = url; a.download = nr + ".nc";
  d.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function Kanaele({ prog, sync, fehler, bereich }) {
  const imBereich = (z, k) => k === 0 && z && bereich && z.nr >= bereich[0] && z.nr <= bereich[1];
  const zuViel = Object.keys(fehler).length > 0;
  return (<>
      <div className="cam-stand" id="cam-stand">
        {sync.fehler
          ? <span className="cam-stand--fehler">{sync.fehler === 1 ? "1 Marke hat" : sync.fehler + " Marken haben"} im anderen Kanal kein Gegenstück.</span>
          : <span>Alle Synchronisationsmarken sind gepaart.</span>}
        {zuViel && <span className="cam-stand--fehler"> Rot: {Object.entries(fehler).map(([n, t]) => n === "nr" ? "Nr. " + t : n + " " + t).join(", ")}.</span>}
      </div>
      <div className="cam-kanaele" id="cam-kanaele">
        <div className="cam-spalte cam-spalte--kopf">
          <b>Kanal 1 · O{prog.nr1}</b>
          <span>
            <button className="knopf knopf--klein" data-cam-kopieren="1" onClick={(e) => kopieren(e, prog.k1, 1)}>Kopieren</button>
            <button className="knopf knopf--klein" data-cam-laden="1" onClick={(e) => herunterladen(e, prog.k1, prog.nr1)}>Herunterladen</button>
          </span>
        </div>
        <div className="cam-spalte cam-spalte--kopf">
          <b>Kanal 2 · O{prog.nr2}</b>
          <span>
            <button className="knopf knopf--klein" data-cam-kopieren="2" onClick={(e) => kopieren(e, prog.k2, 2)}>Kopieren</button>
            <button className="knopf knopf--klein" data-cam-laden="2" onClick={(e) => herunterladen(e, prog.k2, prog.nr2)}>Herunterladen</button>
          </span>
        </div>
        {sync.reihen.map((r, i) => (
          [r.k1, r.k2].map((z, k) => (
            <div key={i + "-" + k} data-reihe={i} data-kanal={k + 1}
              className={"cam-zeile" + (r.sync ? " cam-zeile--sync" : "") + (!z ? " cam-zeile--leer" : "")
                + (z?.fehler ? " cam-zeile--fehler" : "") + (imBereich(z, k) ? " cam-zeile--aktiv" : "")}>
              <span className="cam-nr">{z ? z.nr : ""}</span>
              <span className="cam-text">{z ? z.text : ""}</span>
            </div>
          ))
        ))}
      </div>
      <p className="klein">Blau = Synchronisationsmarke, in beiden Kanälen auf derselben Zeile. Graue Zeilen füllt
        die App nur für die Anzeige ein, sie kommen nicht ins Programm.</p>
  </>);
}

export default function HoferCam() {
  const [w, setW] = useState(gemerkt);
  const [aktiv, setAktivRoh] = useState(aktivId);
  const setAktiv = (id) => { if (id === aktivId) return; aktivId = id; setAktivRoh(id); melden(); };
  useGemerkt();
  const [gespeichert, setGespeichertRoh] = useState(gespeichertCam);
  const setGespeichert = (z) => { gespeichertCam = z; setGespeichertRoh(z); };
  const laden = (d) => {
    // Felder, die es beim Speichern noch nicht gab, bekommen die Vorgabe
    const neu = { ...vorgabe(), ...d, bloecke: Array.isArray(d.bloecke) ? d.bloecke : [] };
    Object.keys(gemerkt).forEach((k) => delete gemerkt[k]);
    Object.assign(gemerkt, neu);
    setW({ ...neu });
    melden();
  };
  const setze = (name, wert) => {
    const neu = { ...w, [name]: wert };
    Object.assign(gemerkt, neu);
    setW(neu);
    melden();
  };
  const bloecke = w.bloecke || [];
  const setzeBloecke = (neu) => setze("bloecke", neu);
  const blockAendern = (id, feld, wert) => setzeBloecke(bloecke.map((b) => (b.id === id ? { ...b, [feld]: wert } : b)));
  const blockSchieben = (i, um) => {
    const j = i + um;
    if (j < 0 || j >= bloecke.length) return;
    const neu = [...bloecke];
    [neu[i], neu[j]] = [neu[j], neu[i]];
    setzeBloecke(neu);
  };
  const fehler = pruefen(w);
  const prog = useMemo(() => programme(w), [w]);
  const sync = useMemo(() => synchronisieren(prog.k1, prog.k2), [prog]);

  const ncBeide = text(prog.k1) + text(prog.k2);

  return (
    <div className="karte cam">
      <div className="cam-kopf">
        <h2 className="karte__titel">Hofer Cam</h2>
        <span className="cam-typ">Maschinentyp: <b>Star SB-20RG</b></span>
        <NcAblage art="cam" kurz="camab" wort="Hofer Cam" daten={w} nc={ncBeide} laden={laden}
          gespeichert={gespeichert} setGespeichert={setGespeichert} />
      </div>
      <NcStand kurz="camab" gespeichert={gespeichert} nc={ncBeide} />

      <div className="cam-gruppen">
        {FELDER.map((g) => (
          <fieldset key={g.gruppe} className="cam-gruppe">
            <legend>{g.gruppe}</legend>
            {g.felder.map((d) => (
              <label key={d.name} title={(d.lang || d.text) + (fehler[d.name] ? " – " + fehler[d.name] : "")}
                className={"cam-feld" + (fehler[d.name] ? " cam-feld--fehler" : "") + (d.art === "text" ? " cam-feld--text" : "")}>
                <span>{d.text}</span>
                <input data-cam={d.name} value={w[d.name]} inputMode={d.art === "text" ? "text" : "decimal"}
                  onChange={(e) => setze(d.name, e.target.value)} />
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <div className="cam-bearb" id="cam-bearb">
        <div className="cam-bearb__kopf">
          <b>Bearbeitungen Kanal 1</b>
          <button className="knopf knopf--klein" id="cam-neu-dreh"
            onClick={() => { const nb = neuerBlock(bloecke); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Drehwerkzeug T100–T600</button>
          <button className="knopf knopf--klein" id="cam-neu-front"
            onClick={() => { const nb = neuerBlock(bloecke, "front"); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Frontwerkzeug T1100–T1400</button>
        </div>
        {bloecke.length === 0 && <p className="klein">Noch keine Bearbeitung. Sie kommt zwischen „(Ende Kopf)“ und „(Start Ende)“.</p>}
        {bloecke.map((b, i) => {
          const bf = blockFehler(b);
          const front = b.art === "front";
          const feld = (name, text, lang, breit) => (
            <label className={"cam-feld" + (bf[name] ? " cam-feld--fehler" : "")} title={lang + (bf[name] ? " – " + bf[name] : "")}>
              <span>{text}</span>
              <input data-camblock={name} value={b[name]} style={breit ? { width: breit } : undefined}
                inputMode="decimal" onChange={(e) => blockAendern(b.id, name, e.target.value)} />
            </label>
          );
          return (
            <div key={b.id} className={"cam-block" + (b.id === aktiv ? " cam-block--aktiv" : "")} data-block={i}
              onFocusCapture={() => setAktiv(b.id)} onPointerDown={() => setAktiv(b.id)}>
              <div className="cam-block__zeile">
                {/* Seit 1.399.0 (Wunsch Patrick 5. November 2026): NC-Code mit
                    dem Pfeil ein- und ausklappen, gemerkt am Block (zu) */}
                <button className="cam-block__pfeil" data-camblock-pfeil={i} title={b.zu ? "NC-Code zeigen" : "NC-Code einklappen"}
                  aria-expanded={!b.zu} onClick={() => blockAendern(b.id, "zu", !b.zu)}>{b.zu ? "▸" : "▾"}</button>
                {front && <label className="cam-feld" title="Hauptspindel oder Gegenspindel"><span>Spindel</span>
                  <select data-camblock="spindel" value={b.spindel || "haupt"} onChange={(e) => blockAendern(b.id, "spindel", e.target.value)}>
                    <option value="haupt">Hauptspindel</option>
                    <option value="gegen" disabled>Gegenspindel (folgt)</option>
                  </select></label>}
                <label className="cam-feld" title={front ? "Werkzeugplatz (Frontwerkzeug fest)" : "Werkzeugplatz (Drehwerkzeug Kanal 1)"}><span>Platz</span>
                  <select data-camblock="platz" value={b.platz} onChange={(e) => blockAendern(b.id, "platz", e.target.value)}>
                    {(front ? FRONT_PLAETZE : DREH_PLAETZE).map((p) => <option key={p} value={p}>T{p}</option>)}
                  </select></label>
                <label className="cam-feld cam-feld--text" title="Steht in Klammern hinter dem Werkzeugaufruf"><span>Bezeichnung</span>
                  <input data-camblock="bez" value={b.bez} style={{ width: 190 }}
                    onChange={(e) => blockAendern(b.id, "bez", e.target.value.toUpperCase())} /></label>
                <label className="cam-feld" title={front ? "Hochdruck M1882D… ein, am Ende M1892 aus" : "Hochdruck M1881D… ein, am Ende M1891 aus"}><span>Hochdruck</span>
                  <select data-camblock="hd" value={b.hd} onChange={(e) => blockAendern(b.id, "hd", e.target.value)}>
                    {HD_STUFEN.map((h) => <option key={h} value={h}>{h ? "Stufe " + h : "kein"}</option>)}
                  </select></label>
                <label className="cam-feld" title="Drehrichtung"><span>Richtung</span>
                  <select data-camblock="dreh" value={b.dreh} onChange={(e) => blockAendern(b.id, "dreh", e.target.value)}>
                    <option value="3">M3</option><option value="4">M4</option>
                  </select></label>
                {feld("S", "Drehzahl S", "Drehzahl")}
                {front
                  ? <>
                    {feld("anZ", "Anfahren Z", "G0Z… vor dem Teil")}
                    {feld("wegZ", "Zurück Z", "Am Ende G0Z… zurück in sichere Richtung", 60)}
                  </>
                  : <>
                    {feld("anZ", "Anfahren Z", "G0X[#531+1.]Z…")}
                    {feld("wegA", "Weg Winkel", "Wegfahren: G1X[#531+0.2],A…  leer = ohne Winkel", 54)}
                    {feld("wegF", "Weg F", "Wegfahren: Vorschub F", 60)}
                  </>}
                <span className="cam-block__knoepfe">
                  <button className="knopf knopf--klein" title="Nach oben" disabled={i === 0} onClick={() => blockSchieben(i, -1)}>↑</button>
                  <button className="knopf knopf--klein" title="Nach unten" disabled={i === bloecke.length - 1} onClick={() => blockSchieben(i, 1)}>↓</button>
                  <button className="knopf knopf--klein" title="Bearbeitung entfernen" data-camblock-weg={i}
                    onClick={() => setzeBloecke(bloecke.filter((x) => x.id !== b.id))}>✕</button>
                </span>
              </div>
              {b.zu
                ? <button className="cam-block__zu klein" data-camblock-auf={i} onClick={() => blockAendern(b.id, "zu", false)}>
                    NC-Code: {String(b.code || "").split(/\r?\n/).filter((x) => x.trim()).length} Zeilen (aufklappen)</button>
                : <textarea className="cam-block__code" data-camblock="code" rows={4} spellCheck={false}
                    placeholder="NC-Code der Bearbeitung hier einfügen (aus Kontur, Bohren / Fräsen …)"
                    value={b.code} onChange={(e) => blockAendern(b.id, "code", e.target.value)} />}
            </div>
          );
        })}
      </div>

      {fensterZu
        ? <div className="cam-imfenster" id="cam-imfenster">Das NC-Programm ist im eigenen Fenster offen.
            {" "}<button className="knopf knopf--klein" id="cam-zurueck" onClick={() => fensterZu && fensterZu()}>Zurückholen</button></div>
        : <>
          <div className="cam-fensterleiste">
            <button className="knopf knopf--klein" id="cam-fenster" title="Kanäle in einem eigenen Browserfenster, auch auf einem anderen Bildschirm"
              onClick={programmFensterAuf}>⧉ Eigenes Fenster</button></div>
          <Kanaele prog={prog} sync={sync} fehler={fehler} bereich={prog.bereiche[aktiv]} />
        </>}
    </div>
  );
}
