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
import { ZiehListe } from "../../teile/ZiehListe.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { NcAblage, NcStand } from "./NcAblage.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { inEigenesFenster } from "../../teile/eigenesFenster.js";
import { DREH_PLAETZE, FELDER, FRONT_PLAETZE, HD_STUFEN, K2_PLAETZE, QUER_PLAETZE, SEITE_PLAETZE, vorschubArt, blockFehler, drehzahl, handNeu, markenPaare, neuerBlock, programme, programmeMitHand, pruefen, synchronisieren, vorgabe } from "./hofercam.js";

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
  const prog = programmeMitHand(w);
  const bereich = prog.bereiche[aktivId];
  // Im Fenster rollt die markierte Bearbeitung von selbst ins Bild
  useEffect(() => {
    const d = document.querySelector(".cam-eigen-huelle");
    const el = d && d.querySelector(".cam-zeile--aktiv");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [aktivId, bereich && bereich[0]]);
  // Änderungen im eigenen Fenster gehen in „gemerkt“, der Reiter liest sie
  const handSetzen = (hand) => { gemerkt.hand = hand; melden(); };
  return <Kanaele prog={prog} sync={synchronisieren(prog.k1, prog.k2)} fehler={pruefen(w)} bereich={bereich} bereich2={prog.bereiche2[aktivId]}
    w={w} handSetzen={handSetzen} />;
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

// Seit 1.421.0 (Wunsch Patrick 5. November 2026): jede Zeile im
// Programmfenster ist bearbeitbar; Enter macht eine neue Zeile darunter,
// Rücktaste in einer leeren Zeile löscht sie. Was von Hand anders ist als
// erzeugt, ist gelb; die App setzt es nach jedem Neurechnen wieder ein
// (handAnwenden in hofercam.js).
let fokusNach = null;
function Kanaele({ prog, sync, fehler, bereich, bereich2, w, handSetzen }) {
  const kasten = useRef(null);
  const imBereich = (z, k) => {
    const b = k === 0 ? bereich : bereich2;
    return z && b && z.nr >= b[0] && z.nr <= b[1];
  };
  const zeilenVon = (k) => (k === 1 ? prog.k1 : prog.k2);
  const setzen = (k, zeilen) => handSetzen(handNeu(w, k, k === 1 ? prog.auto1 : prog.auto2, zeilen));
  useEffect(() => {
    if (!fokusNach || !kasten.current) return;
    const el = kasten.current.querySelector("[data-kanal='" + fokusNach.k + "'][data-nr='" + fokusNach.nr + "'] .cam-text");
    fokusNach = null;
    if (!el) return;
    el.focus();
    const d = el.ownerDocument, sel = d.getSelection(), r = d.createRange();
    r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
  });
  const zeileFertig = (k, nr, text) => {
    const z = [...zeilenVon(k)];
    if (z[nr - 1] === text) return;
    z[nr - 1] = text;
    setzen(k, z);
  };
  const taste = (e, k, nr) => {
    const text = e.currentTarget.textContent;
    if (e.key === "Enter") {
      e.preventDefault();
      const z = [...zeilenVon(k)];
      z[nr - 1] = text;
      z.splice(nr, 0, "");
      fokusNach = { k, nr: nr + 1 };
      setzen(k, z);
    } else if (e.key === "Backspace" && text === "" && zeilenVon(k).length > 1) {
      e.preventDefault();
      const z = [...zeilenVon(k)];
      z.splice(nr - 1, 1);
      fokusNach = { k, nr: Math.max(1, nr - 1) };
      setzen(k, z);
    } else if (e.key === "Escape") { e.preventDefault(); e.currentTarget.textContent = zeilenVon(k)[nr - 1]; e.currentTarget.blur(); }
  };
  const verwerfen = (k) => { const h = { ...(w.hand || {}) }; delete h["k" + k]; handSetzen(h); };
  const verloren = [[1, prog.verloren1], [2, prog.verloren2]].filter(([, v]) => v && v.length);
  const zuViel = Object.keys(fehler).length > 0;
  return (<>
      <div className="cam-stand" id="cam-stand">
        {(w.hand?.k1 || w.hand?.k2) && <span className="cam-stand--hand" id="cam-hand-stand">Gelb = von Hand geändert.
          {[1, 2].filter((k) => w.hand?.["k" + k]).map((k) => (
            <button key={k} className="knopf knopf--klein" data-cam-verwerfen={k} onClick={() => verwerfen(k)}>Kanal {k} wie erzeugt</button>))} </span>}
        {sync.fehler
          ? <span className="cam-stand--fehler">{sync.fehler === 1 ? "1 Marke hat" : sync.fehler + " Marken haben"} im anderen Kanal kein Gegenstück.</span>
          : <span>Alle Synchronisationsmarken sind gepaart.</span>}
        {zuViel && <span className="cam-stand--fehler"> Rot: {Object.entries(fehler).map(([n, t]) => n === "nr" ? "Nr. " + t : n + " " + t).join(", ")}.</span>}
      </div>
      {verloren.map(([k, v]) => (
        <div key={k} className="cam-verloren" data-cam-verloren={k}>
          <b>Kanal {k}: {v.length === 1 ? "1 Änderung findet" : v.length + " Änderungen finden"} ihre Stelle nicht mehr</b>
          {" "}(die erzeugten Zeilen dort haben sich geändert). Bitte von Hand neu eintragen:
          {v.map((x, i) => <pre key={i}>{x.zeilen.length ? x.zeilen.join("\n") : "(Zeilen gelöscht: " + x.war.join(" / ") + ")"}</pre>)}
          <button className="knopf knopf--klein" onClick={() => setzen(k, zeilenVon(k))}>Erledigt</button>
        </div>))}
      <div className="cam-kanaele" id="cam-kanaele" ref={kasten}>
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
            <div key={i + "-" + k} data-reihe={i} data-kanal={k + 1} data-nr={z ? z.nr : undefined}
              className={"cam-zeile" + (r.sync ? " cam-zeile--sync" : "") + (!z ? " cam-zeile--leer" : "")
                + (z && (k === 0 ? prog.gelb1 : prog.gelb2)?.has(z.nr - 1) ? " cam-zeile--hand" : "")
                + (z?.fehler ? " cam-zeile--fehler" : "") + (imBereich(z, k) ? " cam-zeile--aktiv" : "")}>
              <span className="cam-nr">{z ? z.nr : ""}</span>
              {z
                ? <span className="cam-text" key={z.nr + ":" + z.text} contentEditable suppressContentEditableWarning spellCheck={false}
                    onBlur={(e) => zeileFertig(k + 1, z.nr, e.currentTarget.textContent)}
                    onKeyDown={(e) => taste(e, k + 1, z.nr)}>{z.text}</span>
                : <span className="cam-text" />}
            </div>
          ))
        ))}
      </div>
      <p className="klein">Blau = Synchronisationsmarke, in beiden Kanälen auf derselben Zeile. Graue Zeilen füllt
        die App nur für die Anzeige ein, sie kommen nicht ins Programm. Jede Zeile lässt sich antippen und ändern,
        Enter gibt eine neue Zeile, Rücktaste in einer leeren Zeile löscht sie.</p>
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
  const prog = useMemo(() => programmeMitHand(w), [w]);
  // Änderungen aus dem eigenen Fenster kommen über „gemerkt“
  useEffect(() => {
    const f = () => setW((x) => (x.hand === gemerkt.hand ? x : { ...x, hand: gemerkt.hand }));
    hoerer.add(f); return () => { hoerer.delete(f); };
  }, []);
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
          {/* Seit 1.415.0: angetriebene T3421–T3423 an der Gegenspindel */}
          <button className="knopf knopf--klein" id="cam-neu-seite"
            onClick={() => { const nb = neuerBlock(bloecke, "seite"); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Querangetrieben T3100–T3400</button>
          <button className="knopf knopf--klein" id="cam-neu-quer"
            onClick={() => { const nb = neuerBlock(bloecke, "quer"); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Frontangetrieben T3421–T3423</button>
        </div>
        {/* Seit 1.425.3 (Wunsch Patrick 5. November 2026): Kanal 2 in einer
            eigenen Zeile darunter */}
        <div className="cam-bearb__kopf">
          <b>Bearbeitungen Kanal 2</b>
          {/* Seit 1.420.0: Drehwerkzeug nur in Kanal 2 */}
          <button className="knopf knopf--klein" id="cam-neu-k2"
            onClick={() => { const nb = neuerBlock(bloecke, "k2"); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Stehende Werkzeuge T2100–T2400</button>
          <button className="knopf knopf--klein" id="cam-neu-k2a"
            onClick={() => { const nb = neuerBlock(bloecke, "k2a"); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Angetrieben T2100–T2400</button>
        </div>
        {bloecke.length === 0 && <p className="klein">Noch keine Bearbeitung. Sie kommt zwischen „(Ende Kopf)“ und „(Start Ende)“.</p>}
        {/* Seit 1.405.0 (Wunsch Patrick 5. November 2026): Bearbeitungen am
            Griff ⠿ untereinander verschieben, statt Pfeilen */}
        <ZiehListe nurGriff darf={bloecke.length > 1} className="cam-zieh"
          ordnen={(ids) => setzeBloecke(ids.map((id) => bloecke.find((x) => x.id === id)).filter(Boolean))}
          eintraege={bloecke.map((b, i) => {
          const bf = blockFehler(b, w);
          const front = b.art === "front";
          const seite = b.art === "seite";
          const quer = b.art === "quer" || seite;
          const k2a = b.art === "k2a";
          const k2 = b.art === "k2" || k2a;
          // Kanal-2-Blöcke verhalten sich wie die Gegenspindel: NC-Code in
          // Kanal 2, Markenpaare geben ein Feld für Kanal 1
          const gegen = ((quer || front) && b.spindel === "gegen") || k2;
          const feld = (name, text, lang, breit, platzhalter) => (
            <label className={"cam-feld" + (bf[name] ? " cam-feld--fehler" : "")} title={lang + (bf[name] ? " – " + bf[name] : "")}>
              <span>{text}</span>
              <input data-camblock={name} value={b[name] ?? ""} style={breit ? { width: breit } : undefined}
                placeholder={platzhalter} inputMode={platzhalter ? "text" : "decimal"} onChange={(e) => blockAendern(b.id, name, e.target.value)} />
            </label>
          );
          return { key: b.id, inhalt: (
            <div key={b.id} className={"cam-block" + (b.id === aktiv ? " cam-block--aktiv" : "")} data-block={i}
              onFocusCapture={() => setAktiv(b.id)} onPointerDown={() => setAktiv(b.id)}>
              <div className="cam-block__zeile">
                {/* Seit 1.399.0 (Wunsch Patrick 5. November 2026): NC-Code mit
                    dem Pfeil ein- und ausklappen, gemerkt am Block (zu) */}
                <button className="cam-block__pfeil" data-camblock-pfeil={i} title={b.zu ? "NC-Code zeigen" : "NC-Code einklappen"}
                  aria-expanded={!b.zu} onClick={() => blockAendern(b.id, "zu", !b.zu)}>{b.zu ? "▸" : "▾"}</button>
                {(front || (quer && !seite)) && <label className="cam-feld" title="Hauptspindel oder Gegenspindel"><span>Spindel</span>
                  <select data-camblock="spindel" value={b.spindel || "haupt"} onChange={(e) => blockAendern(b.id, "spindel", e.target.value)}>
                    <option value="haupt">Hauptspindel</option>
                    <option value="gegen">Gegenspindel (Kanal 2 mit T2000)</option>
                  </select></label>}
                <label className="cam-feld" title={k2 ? "Werkzeugplatz Kanal 2" : quer ? "Werkzeugplatz (angetrieben, Weg mit der Gegenspindel)" : front ? "Werkzeugplatz (Frontwerkzeug fest)" : "Werkzeugplatz (Drehwerkzeug Kanal 1)"}><span>Platz</span>
                  <select data-camblock="platz" value={b.platz} onChange={(e) => blockAendern(b.id, "platz", e.target.value)}>
                    {(k2 ? K2_PLAETZE : seite ? SEITE_PLAETZE : quer ? QUER_PLAETZE : front ? FRONT_PLAETZE : DREH_PLAETZE).map((p) => <option key={p} value={p}>T{p}</option>)}
                  </select></label>
                <label className="cam-feld cam-feld--text" title="Steht in Klammern hinter dem Werkzeugaufruf"><span>Bezeichnung</span>
                  <input data-camblock="bez" value={b.bez} style={{ width: 190 }}
                    onChange={(e) => blockAendern(b.id, "bez", e.target.value.toUpperCase())} /></label>
                {<label className="cam-feld" title={k2 ? "Hochdruck M1884D… vor dem Werkzeugaufruf, am Ende M1894 aus" : quer ? "Hochdruck M1883D… ein, am Ende M1893 aus" : front ? "Hochdruck M1882D… ein, am Ende M1892 aus" : "Hochdruck M1881D… ein, am Ende M1891 aus"}><span>Hochdruck</span>
                  <select data-camblock="hd" value={b.hd} onChange={(e) => blockAendern(b.id, "hd", e.target.value)}>
                    {HD_STUFEN.map((h) => <option key={h} value={h}>{h ? "Stufe " + h : "kein"}</option>)}
                  </select></label>}
                <label className="cam-feld" title={"Vorschub je Umdrehung (G99) oder je Minute (G98)" + (gegen ? ", in Kanal 2" : "") + "; am Ende der Bearbeitung immer wieder G99"}><span>Vorschub</span>
                  <select data-camblock="vor" value={vorschubArt(b)} onChange={(e) => blockAendern(b.id, "vor", e.target.value)}>
                    <option value="99">G99 mm/U</option><option value="98">G98 mm/min</option>
                  </select></label>
                {b.hd && <label className="cam-feld cam-g96" title={"Am Ende der Bearbeitung den Hochdruck mit " + (k2 ? "M1894" : quer ? "M1893" : front ? "M1892" : "M1891") + " ausschalten"}>
                  <input type="checkbox" data-camblock="hdAus" checked={!b.hdAn}
                    onChange={(e) => blockAendern(b.id, "hdAn", !e.target.checked)} /><span>HD am Ende aus</span></label>}
                {k2a ? <>
                  {/* Seit 1.425.0: angetrieben in Kanal 2 */}
                  <label className="cam-feld" title="Angetriebenes Werkzeug: M36 Rechtslauf, M37 Linkslauf"><span>Richtung</span>
                    <select data-camblock="dreh" value={b.dreh === "36" ? "36" : "37"} onChange={(e) => blockAendern(b.id, "dreh", e.target.value)}>
                      <option value="36">M36</option><option value="37">M37</option>
                    </select></label>
                  {feld("S", "Drehzahl S", "Drehzahl des angetriebenen Werkzeugs (M36/M37 S…)")}
                  <label className="cam-feld cam-g96" title="Am Ende das angetriebene Werkzeug mit M38 ausschalten">
                    <input type="checkbox" data-camblock="m38" checked={!b.spAn}
                      onChange={(e) => blockAendern(b.id, "spAn", !e.target.checked)} /><span>M38 am Ende</span></label>
                </> : quer ? <>
                  <label className="cam-feld" title="Angetriebenes Werkzeug: M36 Rechtslauf, M37 Linkslauf"><span>Richtung</span>
                    <select data-camblock="dreh" value={b.dreh === "37" ? "37" : "36"} onChange={(e) => blockAendern(b.id, "dreh", e.target.value)}>
                      <option value="36">M36</option><option value="37">M37</option>
                    </select></label>
                  {feld("S", "Drehzahl S", "Drehzahl des angetriebenen Werkzeugs (M36/M37 S…)")}
                  <label className="cam-feld cam-g96" title={"Am Ende das angetriebene Werkzeug mit M38 ausschalten" + (gegen ? " (Kanal 2)" : "")}>
                    <input type="checkbox" data-camblock="m38" checked={!b.spAn}
                      onChange={(e) => blockAendern(b.id, "spAn", !e.target.checked)} /><span>M38 am Ende</span></label>
                  {gegen ? <>
                    {feld("X", "Position X", "Kanal 1: G0X…T21 zwischen Marke Start und Marke 2", 58)}
                    {feld("Y", "Position Y", "Kanal 1: G0X…Y…T21, leer = ohne Y", 58)}
                    {feld("anZ", "Anfahren Z", "Kanal 2: G0Z… der Gegenspindel, am Schluss G1Z…F2000 zurück, dann G0Z20.", 58)}
                    {feld("m1", "Marke Start", "Kanal 1 und 2 vor dem Positionieren in X, leer = von selbst", 58, prog.marken[b.id]?.m1)}
                    {feld("m2", "Marke 2", "X positioniert, danach die Bearbeitung in Kanal 2, leer = von selbst", 58, prog.marken[b.id]?.m2)}
                    {feld("m3", "Marke Ende", "Kanal 2 nach M1, Kanal 1 danach T0 und M1, leer = von selbst", 58, prog.marken[b.id]?.m3)}
                  </> : seite ? feld("anZ", "Anfahren Z", "G0X[#531+1.]Z…", 58) : <>
                    {feld("anZ", "Anfahren Z", "G0Z… vor dem Teil")}
                    {feld("wegZ", "Zurück Z", "Am Ende G0Z… zurück in sichere Richtung", 60)}
                  </>}
                </> : <>
                <label className="cam-feld" title="Drehrichtung"><span>Richtung</span>
                  <select data-camblock="dreh" value={b.dreh} onChange={(e) => blockAendern(b.id, "dreh", e.target.value)}>
                    <option value="3">M3</option><option value="4">M4</option>
                  </select></label>
                <label className="cam-feld" title="Drehzahl S direkt oder Schnittgeschwindigkeit Vc (die App rechnet S aus)"><span>Eingabe</span>
                  <select data-camblock="sArt" value={b.sArt || "S"} onChange={(e) => blockAendern(b.id, "sArt", e.target.value)}>
                    <option value="S">S U/min</option><option value="vc">Vc m/min</option>
                  </select></label>
                {b.sArt === "vc"
                  ? <>
                    {feld("vc", "Vc", "Schnittgeschwindigkeit in m/min", 54)}
                    <label className="cam-feld cam-g96" title="G96 konstante Schnittgeschwindigkeit: im Kopf der Bearbeitung G96 mit S = Vc, am Ende G97">
                      <input type="checkbox" data-camblock="g96" checked={!!b.g96}
                        onChange={(e) => blockAendern(b.id, "g96", e.target.checked)} /><span>G96</span></label>
                    {!b.g96 && feld("vcD", "Ø", front ? "Werkzeug-Ø in mm" : "Durchmesser in mm, leer = Material-Ø A aus G266", 54)}
                    <span className="cam-vc-s klein" data-camblock-s={i} title={b.g96 ? "Mit G96 steht Vc als S im Programm" : "Daraus gerechnete Drehzahl"}>
                      {b.g96 ? (drehzahl(b, w) ? "G96 S" + drehzahl(b, w) : "S –") : (drehzahl(b, w) ? "= S" + drehzahl(b, w) : "S –")}</span>
                  </>
                  : feld("S", "Drehzahl S", "Drehzahl")}
                {k2 ? <>
                    {/* Seit 1.420.0 nach Patricks T2100 (5. November 2026) */}
                    {feld("vorX", "Vorpos. X", "G0X… vor der Nullpunktverschiebung; am Ende G50Z…X… zurück", 58)}
                    {feld("vorZ", "Vorpos. Z", "G0Z… vor der Nullpunktverschiebung; am Ende G50Z…X… zurück", 58)}
                    {feld("nX", "G50 X", "Nullpunktverschiebung G50X…; am Ende G1X… auf denselben Wert", 58)}
                    {feld("nZ", "G50 Z", "Nullpunktverschiebung G50…Z…; am Ende G1Z…F0.5 auf denselben Wert", 58)}
                    <label className="cam-feld cam-g96" title="Nach M1 die Spindel mit M5 stoppen">
                      <input type="checkbox" data-camblock="m5" checked={!b.ohneM5}
                        onChange={(e) => blockAendern(b.id, "ohneM5", !e.target.checked)} /><span>M5 am Ende</span></label>
                  </> : front
                  ? <>
                    {feld("anZ", "Anfahren Z", b.spindel === "gegen" ? "Kanal 2: G0Z… der Gegenspindel vor dem Werkzeug" : "G0Z… vor dem Teil")}
                    {feld("wegZ", "Zurück Z", b.spindel === "gegen" ? "Kanal 2: am Ende G0Z… zurück, danach Marke Ende und G0G28W0." : "Am Ende G0Z… zurück in sichere Richtung", 60)}
                    {/* Seit 1.407.0 (Wunsch Patrick 5. November 2026): zwei
                        Wartemarken von Hand, leer = frei ab M300 */}
                    {b.spindel === "gegen" && feld("m1", "Marke Start", "Wartemarke vor der Bearbeitung an der Gegenspindel (Kanal 2 nach T2000), leer = von selbst", 58, prog.marken[b.id]?.m1)}
                    {b.spindel === "gegen" && feld("m2", "Marke Ende", "Wartemarke nach der Bearbeitung an der Gegenspindel (Kanal 2 vor G0G28W0.), leer = von selbst", 58, prog.marken[b.id]?.m2)}
                  </>
                  : <>
                    {feld("anZ", "Anfahren Z", "G0X[#531+1.]Z…")}
                    {feld("wegA", "Weg Winkel", "Wegfahren: G1X[#531+0.2],A…  leer = ohne Winkel", 54)}
                    {feld("wegF", "Weg F", "Wegfahren: Vorschub F", 60)}
                  </>}
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
                    placeholder={gegen ? "NC-Code für Kanal 2 (zwei Marken direkt nacheinander, z.B. M350 und M360, geben Platz für Kanal 1)" : "NC-Code der Bearbeitung hier einfügen (aus Kontur, Bohren / Fräsen …; zwei Marken direkt nacheinander geben Platz für Kanal 2)"}
                    value={b.code} onChange={(e) => blockAendern(b.id, "code", e.target.value)} />}
              {!b.zu && markenPaare(b).map(([x, y]) => {
                // Seit 1.416.0: an der Gegenspindel ist der NC-Code Kanal 2
                // und das Feld Kanal 1, sonst umgekehrt
                const fk = gegen ? "k1" : "k2", ander = gegen ? 1 : 2;
                return (
                <label key={x + "-" + y} className="cam-k1" data-camk1={x + "-" + y}>
                  <span className="klein">Kanal {ander} zwischen {x} und {y}</span>
                  <textarea className="cam-block__code" rows={3} spellCheck={false}
                    placeholder={"NC-Code für Kanal " + ander + ", während Kanal " + (3 - ander) + " zwischen " + x + " und " + y + " wartet"}
                    value={(b[fk] || {})[x + "-" + y] || ""}
                    onChange={(e) => blockAendern(b.id, fk, { ...(b[fk] || {}), [x + "-" + y]: e.target.value })} />
                </label>); })}
            </div>
          ) };
        })} />
      </div>

      {fensterZu
        ? <div className="cam-imfenster" id="cam-imfenster">Das NC-Programm ist im eigenen Fenster offen.
            {" "}<button className="knopf knopf--klein" id="cam-zurueck" onClick={() => fensterZu && fensterZu()}>Zurückholen</button></div>
        : <>
          <div className="cam-fensterleiste">
            <button className="knopf knopf--klein" id="cam-fenster" title="Kanäle in einem eigenen Browserfenster, auch auf einem anderen Bildschirm"
              onClick={programmFensterAuf}>⧉ Eigenes Fenster</button></div>
          <Kanaele prog={prog} sync={sync} fehler={fehler} bereich={prog.bereiche[aktiv]} bereich2={prog.bereiche2[aktiv]}
            w={w} handSetzen={(h) => setze("hand", h)} />
        </>}
    </div>
  );
}
