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
import { useMemo, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { NcAblage, NcStand } from "./NcAblage.jsx";
import { DREH_PLAETZE, FELDER, HD_STUFEN, blockFehler, neuerBlock, programme, pruefen, synchronisieren, vorgabe } from "./hofercam.js";

// Bleibt beim Wechsel auf einen anderen Reiter stehen
const gemerkt = vorgabe();
// Seit 1.397.0 (Wunsch Patrick 5. November 2026: „muss auch abgespeichert
// und wieder geöffnet werden können“): wie Bohren / Fräsen in
// nc_programme mit art "cam", NC = beide Kanäle hintereinander.
let gespeichertCam = null;

export default function HoferCam() {
  const [w, setW] = useState(gemerkt);
  const [gespeichert, setGespeichertRoh] = useState(gespeichertCam);
  const setGespeichert = (z) => { gespeichertCam = z; setGespeichertRoh(z); };
  const laden = (d) => {
    // Felder, die es beim Speichern noch nicht gab, bekommen die Vorgabe
    const neu = { ...vorgabe(), ...d, bloecke: Array.isArray(d.bloecke) ? d.bloecke : [] };
    Object.keys(gemerkt).forEach((k) => delete gemerkt[k]);
    Object.assign(gemerkt, neu);
    setW({ ...neu });
  };
  const setze = (name, wert) => {
    const neu = { ...w, [name]: wert };
    Object.assign(gemerkt, neu);
    setW(neu);
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

  const text = (zeilen) => zeilen.join("\r\n") + "\r\n";
  const kopieren = async (zeilen, kanal) => {
    try {
      await navigator.clipboard.writeText(text(zeilen));
      alt.meldung("Kanal " + kanal + " kopiert.", "gut");
    } catch (f) { alt.meldung("Kopieren ging nicht. Bitte von Hand markieren.", "warn"); }
  };
  const herunterladen = (zeilen, nr) => {
    const url = URL.createObjectURL(new Blob([text(zeilen)], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = nr + ".nc";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const zuViel = Object.keys(fehler).length > 0;
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
            onClick={() => setzeBloecke([...bloecke, neuerBlock(bloecke)])}>+ Drehwerkzeug T100–T600</button>
        </div>
        {bloecke.length === 0 && <p className="klein">Noch keine Bearbeitung. Sie kommt zwischen „(Ende Kopf)“ und „(Start Ende)“.</p>}
        {bloecke.map((b, i) => {
          const bf = blockFehler(b);
          const feld = (name, text, lang, breit) => (
            <label className={"cam-feld" + (bf[name] ? " cam-feld--fehler" : "")} title={lang + (bf[name] ? " – " + bf[name] : "")}>
              <span>{text}</span>
              <input data-camblock={name} value={b[name]} style={breit ? { width: breit } : undefined}
                inputMode="decimal" onChange={(e) => blockAendern(b.id, name, e.target.value)} />
            </label>
          );
          return (
            <div key={b.id} className="cam-block" data-block={i}>
              <div className="cam-block__zeile">
                <label className="cam-feld" title="Werkzeugplatz (Drehwerkzeug Kanal 1)"><span>Platz</span>
                  <select data-camblock="platz" value={b.platz} onChange={(e) => blockAendern(b.id, "platz", e.target.value)}>
                    {DREH_PLAETZE.map((p) => <option key={p} value={p}>T{p}</option>)}
                  </select></label>
                <label className="cam-feld cam-feld--text" title="Steht in Klammern hinter dem Werkzeugaufruf"><span>Bezeichnung</span>
                  <input data-camblock="bez" value={b.bez} style={{ width: 190 }}
                    onChange={(e) => blockAendern(b.id, "bez", e.target.value.toUpperCase())} /></label>
                <label className="cam-feld" title="Hochdruck M1881D… ein, am Ende M1891 aus"><span>Hochdruck</span>
                  <select data-camblock="hd" value={b.hd} onChange={(e) => blockAendern(b.id, "hd", e.target.value)}>
                    {HD_STUFEN.map((h) => <option key={h} value={h}>{h ? "Stufe " + h : "kein"}</option>)}
                  </select></label>
                <label className="cam-feld" title="Drehrichtung"><span>Richtung</span>
                  <select data-camblock="dreh" value={b.dreh} onChange={(e) => blockAendern(b.id, "dreh", e.target.value)}>
                    <option value="3">M3</option><option value="4">M4</option>
                  </select></label>
                {feld("S", "Drehzahl S", "Drehzahl")}
                {feld("anZ", "Anfahren Z", "G0X[#531+1.]Z…")}
                {feld("wegA", "Weg Winkel", "Wegfahren: G1X[#531+0.2],A…  leer = ohne Winkel", 54)}
                {feld("wegF", "Weg F", "Wegfahren: Vorschub F", 60)}
                <span className="cam-block__knoepfe">
                  <button className="knopf knopf--klein" title="Nach oben" disabled={i === 0} onClick={() => blockSchieben(i, -1)}>↑</button>
                  <button className="knopf knopf--klein" title="Nach unten" disabled={i === bloecke.length - 1} onClick={() => blockSchieben(i, 1)}>↓</button>
                  <button className="knopf knopf--klein" title="Bearbeitung entfernen" data-camblock-weg={i}
                    onClick={() => setzeBloecke(bloecke.filter((x) => x.id !== b.id))}>✕</button>
                </span>
              </div>
              <textarea className="cam-block__code" data-camblock="code" rows={4} spellCheck={false}
                placeholder="NC-Code der Bearbeitung hier einfügen (aus Kontur, Bohren / Fräsen …)"
                value={b.code} onChange={(e) => blockAendern(b.id, "code", e.target.value)} />
            </div>
          );
        })}
      </div>

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
            <button className="knopf knopf--klein" data-cam-kopieren="1" onClick={() => kopieren(prog.k1, 1)}>Kopieren</button>
            <button className="knopf knopf--klein" data-cam-laden="1" onClick={() => herunterladen(prog.k1, prog.nr1)}>Herunterladen</button>
          </span>
        </div>
        <div className="cam-spalte cam-spalte--kopf">
          <b>Kanal 2 · O{prog.nr2}</b>
          <span>
            <button className="knopf knopf--klein" data-cam-kopieren="2" onClick={() => kopieren(prog.k2, 2)}>Kopieren</button>
            <button className="knopf knopf--klein" data-cam-laden="2" onClick={() => herunterladen(prog.k2, prog.nr2)}>Herunterladen</button>
          </span>
        </div>
        {sync.reihen.map((r, i) => (
          [r.k1, r.k2].map((z, k) => (
            <div key={i + "-" + k} data-reihe={i} data-kanal={k + 1}
              className={"cam-zeile" + (r.sync ? " cam-zeile--sync" : "") + (!z ? " cam-zeile--leer" : "")
                + (z?.fehler ? " cam-zeile--fehler" : "")}>
              <span className="cam-nr">{z ? z.nr : ""}</span>
              <span className="cam-text">{z ? z.text : ""}</span>
            </div>
          ))
        ))}
      </div>
      <p className="klein">Blau = Synchronisationsmarke, in beiden Kanälen auf derselben Zeile. Graue Zeilen füllt
        die App nur für die Anzeige ein, sie kommen nicht ins Programm.</p>
    </div>
  );
}
