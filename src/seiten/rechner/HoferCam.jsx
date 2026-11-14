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
import { NC_QUELLEN, hatSpann, ncAktuell, ncZeilen } from "./ncAktuell.js";
import { TYP_NAME, eigeneFelder, eigenWert, feldAus, typBeobachten, wirksamB, wirksamW } from "./camTyp.js";
import { camTypFensterOeffnen, camTypLaden } from "./CamTypFenster.jsx";
import { VORLAGEN, feldWert, vorlageStart, vorlageVon, vorlageZeilen, zeilenEinsetzen } from "./camVorlagen.js";
import { FELDER, HD_STUFEN, plaetzeVon, vorschubArt, bildBereich, blockFehler, drehzahl, handNeu, markenPaare, programmLesen, neuerBlock, programme, programmeMitHand, pruefen, synchronisieren, vorgabe } from "./hofercam.js";

// Seit 1.427.0 (Wunsch Patrick 5. November 2026: „vordefinierte
// Bearbeitungen aus einer Liste einfügen … in eine bestehende
// Bearbeitung“): Vorlage wählen, Werte tippen, „Einfügen“ setzt die
// Zeilen nach der Zeile mit der Schreibmarke im NC-Code ein (ohne Marke
// ans Ende). Rechnen in camVorlagen.js.
function VorlageFeld({ code, pos, einsetzen, zu }) {
  const [id, setId] = useState(VORLAGEN[0].id);
  const [werte, setWerte] = useState(() => ({ [VORLAGEN[0].id]: vorlageStart(VORLAGEN[0].id) }));
  const v = vorlageVon(id);
  const w = werte[id] || vorlageStart(id);
  const setze = (n, x) => setWerte({ ...werte, [id]: { ...w, [n]: x } });
  const erg = vorlageZeilen(id, w);
  return (
    <div className="cam-vorlage" data-camvorlage>
      <div className="cam-vorlage__kopf">
        <b>Vorlage</b>
        <select data-camvorlage-wahl value={id} onChange={(e) => { setId(e.target.value);
          if (!werte[e.target.value]) setWerte({ ...werte, [e.target.value]: vorlageStart(e.target.value) }); }}>
          {VORLAGEN.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <button className="knopf knopf--klein" title="Schliessen" onClick={zu}>✕</button>
      </div>
      <div className="cam-vorlage__felder">
        {v.felder.map((f) => f.typ === "haken"
          ? <label key={f.name} className="cam-feld cam-feld--haken" title={f.lang}>
              <input type="checkbox" data-camvorlage-feld={f.name} checked={feldWert(v, w, f)} onChange={(e) => setze(f.name, e.target.checked)} />
              <span>{f.text}</span></label>
          : <label key={f.name} className="cam-feld" title={f.lang}>
              <span>{f.text}</span>
              <input data-camvorlage-feld={f.name} value={w[f.name] ?? ""} inputMode="decimal" style={{ width: 64 }}
                placeholder={f.vorgabe ? f.vorgabe(w) : ""} onChange={(e) => setze(f.name, e.target.value)} />
            </label>)}
      </div>
      <div className="cam-vorlage__fuss">
        {erg.fehler
          ? <span className="cam-vorlage__fehler klein">{erg.fehler}</span>
          : <code className="cam-vorlage__vorschau" data-camvorlage-vorschau>{erg.zeilen.join("\n")}</code>}
        <button className="knopf knopf--klein knopf--primaer" data-camvorlage-einfuegen disabled={!!erg.fehler}
          onClick={() => { einsetzen(zeilenEinsetzen(code, erg.zeilen, pos)); zu(); }}>Einfügen</button>
      </div>
    </div>
  );
}

// Seit 1.436.0 (Wunsch Patrick 6. November 2026): den gerade erzeugten
// NC-Code aus Bohren / Fräsen, Entgraten, C-Achse, Gravur oder DXF in die
// Bearbeitung übernehmen, eingesetzt wie eine Vorlage nach der Zeile mit
// der Schreibmarke. Den Code melden die Reiter in ncAktuell.js.
function ModulFeld({ code, pos, einsetzen, zu }) {
  const da = NC_QUELLEN.filter(([k]) => ncAktuell(k)?.text);
  const [id, setId] = useState(da.length ? da.slice().sort((x, y) => ncAktuell(y[0]).zeit - ncAktuell(x[0]).zeit)[0][0] : "");
  const [ohne, setOhne] = useState(true);
  const quelle = id ? ncAktuell(id) : null;
  const zeilen = quelle ? ncZeilen(quelle.text, ohne) : [];
  return (
    <div className="cam-vorlage" data-cammodul>
      <div className="cam-vorlage__kopf">
        <b>Aus Modul</b>
        <select data-cammodul-wahl value={id} onChange={(e) => setId(e.target.value)}>
          {!da.length && <option value="">– kein Modul offen gewesen –</option>}
          {NC_QUELLEN.map(([k, n]) => <option key={k} value={k} disabled={!ncAktuell(k)?.text}>
            {n}{ncAktuell(k)?.text ? "" : " (noch nicht geöffnet)"}</option>)}
        </select>
        {hatSpann() && <label className="cam-feld cam-feld--haken" title="Vor- und Nachspann für die Maschine aus den Modulen weglassen">
          <input type="checkbox" data-cammodul-ohne checked={ohne} onChange={(e) => setOhne(e.target.checked)} />
          <span>ohne Vor- und Nachspann</span></label>}
        <button className="knopf knopf--klein" title="Schliessen" onClick={zu}>✕</button>
      </div>
      <div className="cam-vorlage__fuss">
        {zeilen.length
          ? <code className="cam-vorlage__vorschau cam-modul__vorschau" data-cammodul-vorschau>{zeilen.join("\n")}</code>
          : <span className="cam-vorlage__fehler klein">Zuerst den Reiter des Moduls öffnen und dort den Code erzeugen, dann hier übernehmen.</span>}
        <button className="knopf knopf--klein knopf--primaer" data-cammodul-einfuegen disabled={!zeilen.length}
          onClick={() => { einsetzen(zeilenEinsetzen(code, zeilen, pos)); zu(); }}>Übernehmen</button>
      </div>
    </div>
  );
}

// Knopf „+ …“ mit der Spanne der Plätze, etwa „T100–T600“
function spanne(gruppe) {
  const l = plaetzeVon(gruppe);
  return l.length ? "T" + l[0] + (l.length > 1 ? "–T" + l[l.length - 1] : "") : "";
}

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
      <div className="cam-eigen__kopf"><b>HOFERCAM · NC-Programm</b>
        <button className="knopf knopf--klein" id="cam-eigen-zu" onClick={zu}>Zurück ins HoferTool</button></div>
      <ImFenster />
    </div>
  ), () => { fensterZu = null; melden(); }, "cam-eigen-huelle");
  const huellen = document.querySelectorAll(".cam-eigen-huelle");
  const huelle = huellen[huellen.length - 1];
  fensterZu = zu;
  melden();
  if (!huelle || !inEigenesFenster(huelle, zu, { titel: "HOFERCAM · O" + programme(gemerkt).nr1,
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

// Seit 1.426.5 (Patrick: „die Markierung soll schon wechseln, wenn ich in
// der Auswahl über die Werkzeuge fahre“): eigene Auswahl für den Platz,
// weil die Liste einer normalen Auswahl keine Mausbewegung meldet
function PlatzWahl({ wert, plaetze, waehlen, vorschau }) {
  const [auf, setAuf] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!auf) return;
    const d = ref.current.ownerDocument;
    const zu = (e) => { if (!ref.current?.contains(e.target)) { setAuf(false); vorschau(null); } };
    const taste = (e) => { if (e.key === "Escape") { e.preventDefault(); setAuf(false); vorschau(null); } };
    d.addEventListener("pointerdown", zu); d.addEventListener("keydown", taste, true);
    return () => { d.removeEventListener("pointerdown", zu); d.removeEventListener("keydown", taste, true); };
  }, [auf]);
  return (
    <span className="cam-wahl" ref={ref} data-camblock="platz" data-wert={wert}>
      <button type="button" className="cam-wahl__knopf" onClick={() => { setAuf(!auf); if (auf) vorschau(null); }}>T{wert} ▾</button>
      {auf && <span className="cam-wahl__liste" onPointerLeave={() => vorschau(null)}>
        {plaetze.map((p) => (
          <button type="button" key={p} data-platz={p} className={"cam-wahl__punkt" + (p === wert ? " cam-wahl__punkt--an" : "")}
            onPointerEnter={() => vorschau(p)} onFocus={() => vorschau(p)}
            onClick={() => { waehlen(p); setAuf(false); vorschau(null); }}>T{p}</button>))}
      </span>}
    </span>
  );
}

// Seit 1.426.0: Bild der Maschine oben rechts, solange die Maus über
// einer Bearbeitung steht, mit dem Bereich ihres Werkzeugs markiert
function MaschinenBild({ block }) {
  // Fährt die Maus darunter, wird es fast durchsichtig, damit
  // die Felder dahinter lesbar und bedienbar bleiben (Klicks gehen durch)
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current?.ownerDocument;
    if (!d) return;
    const f = (e) => {
      const el = ref.current; if (!el) return;
      const b = el.getBoundingClientRect();
      el.classList.toggle("cam-bild--unter", e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom);
    };
    d.addEventListener("pointermove", f);
    return () => d.removeEventListener("pointermove", f);
  }, [!!block]);
  // Seit 1.426.7 (Patrick: „möglichst gross, soll aber nicht T3421–T3423
  // überdecken“): Grösse aus dem Platz rechts neben bzw. über den Knöpfen
  // der Bearbeitungen, neu bei Rollen und Fenstergrösse
  const [mass, setMass] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const d = el.ownerDocument, win = d.defaultView;
    const rechnen = () => {
      // Seit 1.427.3 (Patrick: „Bild kleiner, dass es den Bearbeitungsreiter
      // nicht überdeckt“): frei bleiben die Knöpfe der Bearbeitungen und
      // alle Felder der Bearbeitung unter der Maus; gesucht ist die grösste
      // Breite, bei der das Bild oben rechts nichts davon berührt
      const sel = ".cam-bearb__kopf .knopf" + (block ? `, .cam-block[data-blockid="${block.id}"] :is(input, select, textarea, button, .cam-vorlage)` : "");
      const k = [...d.querySelectorAll(sel)].map((x) => x.getBoundingClientRect()).filter((x) => x.width && x.height);
      const vw = win.innerWidth, vh = win.innerHeight, oben = 70, rand = 16, text = 44;
      const hoechst = Math.min(900, vw - 2 * rand - 12, vh - oben - text - rand);
      const frei = (s) => {
        const l = vw - rand - s - 12, u = oben + s + 12 + text;
        return !k.some((x) => x.right > l && x.left < vw - rand && x.bottom > oben && x.top < u);
      };
      let s = hoechst;
      while (s > 120 && !frei(s)) s -= 10;
      setMass(Math.max(120, s));
    };
    rechnen();
    win.addEventListener("resize", rechnen); win.addEventListener("scroll", rechnen, true);
    return () => { win.removeEventListener("resize", rechnen); win.removeEventListener("scroll", rechnen, true); };
  }, [block?.id]);
  if (!block) return null;
  const r = bildBereich(block);
  // Seit 1.426.3 (Patrick: „soll gut lesbar sein“): grösser, Rest des
  // Bilds abgedunkelt, Platz als Schild mit Grund über dem Werkzeug
  const t = "T" + block.platz;
  const sb = t.length * 19 + 20, sh = 40;
  const sx = Math.max(4, Math.min(512 - sb - 4, r.x + r.w / 2 - sb / 2));
  const sy = r.y - sh - 8 > 4 ? r.y - sh - 8 : r.y + r.h + 8;
  return (
    <div className="cam-bild" id="cam-bild" data-bereich={r.text} ref={ref} style={mass ? { width: mass + 12 } : undefined}>
      <svg viewBox="0 0 512 512">
        <defs><mask id="cam-bild-maske">
          <rect x="0" y="0" width="512" height="512" fill="#fff" />
          <rect x={r.x - 3} y={r.y - 3} width={r.w + 6} height={r.h + 6} rx="6" fill="#000" />
        </mask></defs>
        <image href={import.meta.env.BASE_URL + "hilfe/star-sb20rg.png"} x="0" y="0" width="512" height="512" />
        <rect x="0" y="0" width="512" height="512" fill="rgba(20,30,45,.45)" mask="url(#cam-bild-maske)" />
        <rect className={"cam-bild__rahmen" + (r.verdeckt ? " cam-bild__rahmen--verdeckt" : "")} x={r.x} y={r.y} width={r.w} height={r.h} rx="5" />
        <rect className="cam-bild__schildgrund" x={sx} y={sy} width={sb} height={sh} rx="8" />
        <text className="cam-bild__schild" x={sx + sb / 2} y={sy + sh / 2 + 11} textAnchor="middle">{t}</text>
      </svg>
      <div className="cam-bild__text">{t} · {r.text}</div>
    </div>
  );
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
  const leerF = Object.keys(fehler).filter((n) => fehler[n] === "leer");
  fehler = Object.fromEntries(Object.entries(fehler).filter(([, t]) => t !== "leer"));
  const zuViel = Object.keys(fehler).length > 0;
  return (<>
      <div className="cam-stand" id="cam-stand">
        {(prog.ein1?.size > 0 || prog.ein2?.size > 0) && <span className="cam-stand--ein" id="cam-ein-stand">Violett = eingelesen, anders als der Standard.</span>}
        {(w.hand?.k1 || w.hand?.k2) && <span className="cam-stand--hand" id="cam-hand-stand">Gelb = von Hand geändert.
          {[1, 2].filter((k) => w.hand?.["k" + k]).map((k) => (
            <button key={k} className="knopf knopf--klein" data-cam-verwerfen={k} onClick={() => verwerfen(k)}>Kanal {k} wie erzeugt</button>))} </span>}
        {sync.fehler
          ? <span className="cam-stand--fehler">{sync.fehler === 1 ? "1 Marke hat" : sync.fehler + " Marken haben"} im anderen Kanal kein Gegenstück.</span>
          : <span>Alle Synchronisationsmarken sind gepaart.</span>}
        {leerF.length > 0 && <span className="cam-stand--leer" id="cam-leer-stand"> Noch leer: {leerF.map((n) => n === "nr" ? "Nr." : (FELDER.flatMap((g) => g.felder).find((d) => d.name === n)?.text || n)).join(", ")}.</span>}
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
                + (z && (k === 0 ? prog.ein1 : prog.ein2)?.has(z.nr - 1) ? " cam-zeile--ein" : "")
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

// Seit 1.450.0: eigenes Eingabefeld aus den Einstellungen des Maschinentyps
// (Zahl, Text, Häkchen oder Auswahlliste); der Wert steht unter eigen[PH]
function EigenFeld({ f, o, setze, merkmal }) {
  const wert = eigenWert(f, o);
  const titel = f.text + " → {" + f.ph + "}";
  const attr = { [merkmal]: f.ph };
  if (f.art === "haken") return (
    <label className="cam-feld cam-g96" title={titel}>
      <input type="checkbox" {...attr} checked={wert === "1"} onChange={(e) => setze(f.ph, e.target.checked ? "1" : "")} /><span>{f.text}</span></label>);
  if (f.art === "liste") return (
    <label className="cam-feld" title={titel}><span>{f.text}</span>
      <select {...attr} value={wert} onChange={(e) => setze(f.ph, e.target.value)}>
        {!f.liste.includes(wert) && <option value={wert}>{wert || "–"}</option>}
        {f.liste.map((x) => <option key={x} value={x}>{x}</option>)}
      </select></label>);
  const falsch = f.art === "zahl" && wert.trim() !== "" && !/^[-+]?(\d+[.,]?\d*|[.,]\d+)$/.test(wert.trim());
  return (
    <label className={"cam-feld" + (falsch ? " cam-feld--fehler" : "") + (f.art === "text" ? " cam-feld--text" : "")} title={titel + (falsch ? " – Zahl" : "")}>
      <span>{f.text}</span>
      <input {...attr} value={wert} inputMode={f.art === "zahl" ? "decimal" : "text"} onChange={(e) => setze(f.ph, e.target.value)} />
    </label>);
}

export default function HoferCam() {
  const [w, setW] = useState(gemerkt);
  const [aktiv, setAktivRoh] = useState(aktivId);
  const [ueber, setUeber] = useState(null);
  // Platz, über dem die Maus in der offenen Auswahl steht: { id, platz }
  const [vorPlatz, setVorPlatz] = useState(null);
  // Offene Vorlage je Bearbeitung und Schreibmarke im NC-Code (1.427.0)
  const [vorlageBei, setVorlageBei] = useState(null);
  const marke = useRef({});
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
  // Seit 1.441.0: Einstellungen des Maschinentyps laden und nach dem
  // Speichern neu rechnen
  const [typStand, setTypStand] = useState(0);
  useEffect(() => { camTypLaden(); return typBeobachten(() => { setTypStand((n) => n + 1); melden(); }); }, []);
  const prog = useMemo(() => programmeMitHand(w), [w, typStand]);
  // Änderungen aus dem eigenen Fenster kommen über „gemerkt“
  useEffect(() => {
    const f = () => setW((x) => (x.hand === gemerkt.hand ? x : { ...x, hand: gemerkt.hand }));
    hoerer.add(f); return () => { hoerer.delete(f); };
  }, []);
  const sync = useMemo(() => synchronisieren(prog.k1, prog.k2), [prog]);

  const ncBeide = text(prog.k1) + text(prog.k2);

  // Seit 1.541.0: bestehendes Programm einlesen. Die Felder oben kommen
  // aus Kanal 1 (Nr., HOCO Nr., G170, G266), der Text wird wie eine
  // Handänderung gespeichert, mit dem Eingelesenen als „ein“
  const einlesen = async (dateien) => {
    const gelesen = [];
    for (const d of [...(dateien || [])]) {
      const r = programmLesen(await d.text());
      if (r.fehler) { alt.meldung(d.name + ": " + r.fehler, "fehler"); continue; }
      gelesen.push(r);
    }
    if (!gelesen.length) return;
    gelesen.sort((a, b) => a.kanal - b.kanal);
    let neu = { ...w };
    for (const r of gelesen) neu = { ...neu, ...r.felder };
    const p = programme(neu);
    let hand = { ...(neu.hand || {}) };
    for (const r of gelesen) {
      const auto = r.kanal === 1 ? p.k1 : p.k2;
      delete hand["k" + r.kanal];
      hand = handNeu({ hand }, r.kanal, auto, r.zeilen);
      if (hand["k" + r.kanal]) hand["k" + r.kanal].ein = r.zeilen;
    }
    neu.hand = hand;
    Object.assign(gemerkt, neu);
    setW(neu);
    melden();
    alt.meldung("Eingelesen: " + gelesen.map((r) => "Kanal " + r.kanal + " (O" + String(r.kanal === 2 ? r.nr + 1000 : r.nr).padStart(4, "0") + ")").join(", ")
      + ". Violett = anders als der Standard.", "gut");
  };

  return (
    <div className="karte cam">
      <div className="cam-kopf">
        <h2 className="karte__titel">HOFERCAM</h2>
        <span className="cam-typ">Maschinentyp: <b>{TYP_NAME}</b></span>
        {/* Seit 1.441.0: Einstellungen des Typs, ändern nur Admins */}
        {alt.istAdmin && alt.istAdmin() && <button className="knopf knopf--klein" id="cam-typ-einst" title="Kopf, Ende, Bearbeitungen, Plätze und Vorgaben dieses Maschinentyps einstellen"
          onClick={camTypFensterOeffnen}>⚙ Maschinentyp</button>}
        <NcAblage art="cam" kurz="camab" wort="HOFERCAM" daten={w} nc={ncBeide} laden={laden}
          gespeichert={gespeichert} setGespeichert={setGespeichert} />
      </div>
      <NcStand kurz="camab" gespeichert={gespeichert} nc={ncBeide} />

      <div className="cam-gruppen">
        {FELDER.map((g) => ({ ...g, felder: g.felder.filter((d) => !feldAus("kopf", d.name)) })).filter((g) => g.felder.length).map((g) => (
          <fieldset key={g.gruppe} className="cam-gruppe">
            <legend>{g.gruppe}</legend>
            {g.felder.map((d) => (
              <label key={d.name} title={(d.lang || d.text) + (fehler[d.name] ? " – " + fehler[d.name] : "")}
                className={"cam-feld" + (fehler[d.name] && fehler[d.name] !== "leer" ? " cam-feld--fehler" : "") + (d.art === "text" ? " cam-feld--text" : "")}>
                <span>{d.text}{d.einheit && /^[a-zA-Z/]+$/.test(d.einheit) && <small className="cam-einheit"> [{d.einheit}]</small>}</span>
                <input data-cam={d.name} value={w[d.name] ?? ""} placeholder={d.einheit || ""} inputMode={d.art === "text" ? "text" : "decimal"}
                  onChange={(e) => setze(d.name, e.target.value)} />
              </label>
            ))}
          </fieldset>
        ))}
        {eigeneFelder("kopf").length > 0 && <fieldset className="cam-gruppe" id="cam-eigene">
          <legend>Eigene Felder</legend>
          {eigeneFelder("kopf").map((f) => <EigenFeld key={f.id} f={f} o={w} merkmal="data-cam-eigen"
            setze={(ph, x) => setze("eigen", { ...(w.eigen || {}), [ph]: x })} />)}
        </fieldset>}
      </div>

      {(() => {
        // Seit 1.426.6 wieder nur, solange die Maus über einer Bearbeitung ist
        // (Patrick: „doch nicht eingeblendet bleiben“)
        const bb = bloecke.find((x) => x.id === ueber);
        return <MaschinenBild block={bb && vorPlatz && vorPlatz.id === bb.id ? { ...bb, platz: vorPlatz.platz } : bb} />;
      })()}
      <div className="cam-bearb" id="cam-bearb">
        <div className="cam-bearb__kopf">
          <b>Bearbeitungen Kanal 1</b>
          <button className="knopf knopf--klein" id="cam-neu-dreh"
            onClick={() => { const nb = neuerBlock(bloecke); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Drehwerkzeug {spanne("dreh")}</button>
          <button className="knopf knopf--klein" id="cam-neu-front"
            onClick={() => { const nb = neuerBlock(bloecke, "front"); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Frontwerkzeug {spanne("front")}</button>
          {/* Seit 1.415.0: angetriebene T3421–T3423 an der Gegenspindel */}
          <button className="knopf knopf--klein" id="cam-neu-seite"
            onClick={() => { const nb = neuerBlock(bloecke, "seite"); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Querangetrieben {spanne("seite")}</button>
          <button className="knopf knopf--klein" id="cam-neu-quer"
            onClick={() => { const nb = neuerBlock(bloecke, "quer"); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Frontangetrieben {spanne("quer")}</button>
        </div>
        {/* Seit 1.425.3 (Wunsch Patrick 5. November 2026): Kanal 2 in einer
            eigenen Zeile darunter */}
        <div className="cam-bearb__kopf">
          <b>Bearbeitungen Kanal 2</b>
          {/* Seit 1.420.0: Drehwerkzeug nur in Kanal 2 */}
          <button className="knopf knopf--klein" id="cam-neu-k2"
            onClick={() => { const nb = neuerBlock(bloecke, "k2"); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Stehende Werkzeuge {spanne("k2")}</button>
          <button className="knopf knopf--klein" id="cam-neu-k2a"
            onClick={() => { const nb = neuerBlock(bloecke, "k2a"); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Angetrieben {spanne("k2")}</button>
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
          // Seit 1.450.0: im Maschinentyp deaktivierte Felder fehlen hier
          const aus = (name) => feldAus(b.art, name);
          const be = wirksamB(b);
          const feld = (name, text, lang, breit, platzhalter) => aus(name) ? null : (
            <label className={"cam-feld" + (bf[name] ? " cam-feld--fehler" : "")} title={lang + (bf[name] ? " – " + bf[name] : "")}>
              <span>{text}</span>
              <input data-camblock={name} value={b[name] ?? ""} style={breit ? { width: breit } : undefined}
                placeholder={platzhalter} inputMode={platzhalter ? "text" : "decimal"} onChange={(e) => blockAendern(b.id, name, e.target.value)} />
            </label>
          );
          return { key: b.id, inhalt: (
            <div key={b.id} className={"cam-block" + (b.id === aktiv ? " cam-block--aktiv" : "")} data-block={i} data-blockid={b.id}
              onFocusCapture={() => setAktiv(b.id)} onPointerDown={() => setAktiv(b.id)}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") setUeber(b.id); }}
              onPointerLeave={(e) => {
                // Seit 1.426.2: solange die Auswahl Platz / Spindel offen
                // ist (die Liste liegt ausserhalb), bleibt das Bild stehen
                const a = e.currentTarget.ownerDocument.activeElement;
                if (a && a.tagName === "SELECT" && e.currentTarget.contains(a)) return;
                setUeber((x) => (x === b.id ? null : x));
              }}
              onBlurCapture={(e) => { if (e.target.tagName === "SELECT" && !e.currentTarget.matches(":hover")) setUeber((x) => (x === b.id ? null : x)); }}>
              <div className="cam-block__zeile">
                {/* Seit 1.399.0 (Wunsch Patrick 5. November 2026): NC-Code mit
                    dem Pfeil ein- und ausklappen, gemerkt am Block (zu) */}
                <button className="cam-block__pfeil" data-camblock-pfeil={i} title={b.zu ? "NC-Code zeigen" : "NC-Code einklappen"}
                  aria-expanded={!b.zu} onClick={() => blockAendern(b.id, "zu", !b.zu)}>{b.zu ? "▸" : "▾"}</button>
                {(front || (quer && !seite)) && <label className="cam-feld" title="Hauptspindel oder Gegenspindel"><span>Spindel</span>
                  <select data-camblock="spindel" value={b.spindel || "haupt"} onChange={(e) => { blockAendern(b.id, "spindel", e.target.value); setUeber(b.id); }}>
                    <option value="haupt">Hauptspindel</option>
                    <option value="gegen">Gegenspindel (Kanal 2 mit T2000)</option>
                  </select></label>}
                <label className="cam-feld" title={k2 ? "Werkzeugplatz Kanal 2" : quer ? "Werkzeugplatz (angetrieben, Weg mit der Gegenspindel)" : front ? "Werkzeugplatz (Frontwerkzeug fest)" : "Werkzeugplatz (Drehwerkzeug Kanal 1)"}><span>Platz</span>
                  <PlatzWahl wert={b.platz} plaetze={plaetzeVon(k2 ? "k2" : seite ? "seite" : quer ? "quer" : front ? "front" : "dreh")}
                    waehlen={(p) => { blockAendern(b.id, "platz", p); setUeber(b.id); }}
                    vorschau={(p) => { setVorPlatz(p ? { id: b.id, platz: p } : null); if (p) setUeber(b.id); }} /></label>
                <label className="cam-feld cam-feld--text" title="Steht in Klammern hinter dem Werkzeugaufruf"><span>Bezeichnung</span>
                  <input data-camblock="bez" value={b.bez} style={{ width: 190 }}
                    onChange={(e) => blockAendern(b.id, "bez", e.target.value.toUpperCase())} /></label>
                {!aus("hd") && <label className="cam-feld" title={k2 ? "Hochdruck M1884D… vor dem Werkzeugaufruf, am Ende M1894 aus" : quer ? "Hochdruck M1883D… ein, am Ende M1893 aus" : front ? "Hochdruck M1882D… ein, am Ende M1892 aus" : "Hochdruck M1881D… ein, am Ende M1891 aus"}><span>Hochdruck</span>
                  <select data-camblock="hd" value={b.hd} onChange={(e) => blockAendern(b.id, "hd", e.target.value)}>
                    {(HD_STUFEN.includes(b.hd || "") ? HD_STUFEN : [...HD_STUFEN, b.hd]).map((h) => <option key={h} value={h}>{h ? "Stufe " + h : "kein"}</option>)}
                  </select></label>}
                {!aus("vor") && <label className="cam-feld" title={"Vorschub je Umdrehung (G99) oder je Minute (G98)" + (gegen ? ", in Kanal 2" : "") + "; am Ende der Bearbeitung immer wieder G99"}><span>Vorschub</span>
                  <select data-camblock="vor" value={vorschubArt(b)} onChange={(e) => blockAendern(b.id, "vor", e.target.value)}>
                    <option value="99">G99 mm/U</option><option value="98">G98 mm/min</option>
                  </select></label>}
                {be.hd && <label className="cam-feld cam-g96" title={"Am Ende der Bearbeitung den Hochdruck mit " + (k2 ? "M1894" : quer ? "M1893" : front ? "M1892" : "M1891") + " ausschalten"}>
                  <input type="checkbox" data-camblock="hdAus" checked={!b.hdAn}
                    onChange={(e) => blockAendern(b.id, "hdAn", !e.target.checked)} /><span>HD am Ende aus</span></label>}
                {k2a ? <>
                  {/* Seit 1.425.0: angetrieben in Kanal 2 */}
                  {!aus("dreh") && <label className="cam-feld" title="Angetriebenes Werkzeug: M36 Rechtslauf, M37 Linkslauf"><span>Richtung</span>
                    <select data-camblock="dreh" value={b.dreh === "36" ? "36" : "37"} onChange={(e) => blockAendern(b.id, "dreh", e.target.value)}>
                      <option value="36">M36</option><option value="37">M37</option>
                    </select></label>}
                  {feld("S", "Drehzahl S", "Drehzahl des angetriebenen Werkzeugs (M36/M37 S…)")}
                  <label className="cam-feld cam-g96" title="Am Ende das angetriebene Werkzeug mit M38 ausschalten">
                    <input type="checkbox" data-camblock="m38" checked={!b.spAn}
                      onChange={(e) => blockAendern(b.id, "spAn", !e.target.checked)} /><span>M38 am Ende</span></label>
                </> : quer ? <>
                  {!aus("dreh") && <label className="cam-feld" title="Angetriebenes Werkzeug: M36 Rechtslauf, M37 Linkslauf"><span>Richtung</span>
                    <select data-camblock="dreh" value={b.dreh === "37" ? "37" : "36"} onChange={(e) => blockAendern(b.id, "dreh", e.target.value)}>
                      <option value="36">M36</option><option value="37">M37</option>
                    </select></label>}
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
                {!aus("dreh") && <label className="cam-feld" title="Drehrichtung"><span>Richtung</span>
                  <select data-camblock="dreh" value={b.dreh} onChange={(e) => blockAendern(b.id, "dreh", e.target.value)}>
                    <option value="3">M3</option><option value="4">M4</option>
                  </select></label>}
                {!aus("S") && <><label className="cam-feld" title="Drehzahl S direkt oder Schnittgeschwindigkeit Vc (die App rechnet S aus)"><span>Eingabe</span>
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
                      {b.g96 ? (drehzahl(b, wirksamW(w)) ? "G96 S" + drehzahl(b, wirksamW(w)) : "S –") : (drehzahl(b, wirksamW(w)) ? "= S" + drehzahl(b, wirksamW(w)) : "S –")}</span>
                  </>
                  : feld("S", "Drehzahl S", "Drehzahl")}</>}
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
                {eigeneFelder(b.art).map((f) => <EigenFeld key={f.id} f={f} o={b} merkmal="data-camblock-eigen"
                  setze={(ph, x) => blockAendern(b.id, "eigen", { ...(b.eigen || {}), [ph]: x })} />)}
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
                : <>
                  <div className="cam-block__vorlageknopf">
                    <button className="knopf knopf--klein" data-camvorlage-auf={i}
                      title="Gewindestrählen, Tieflochbohren … aus einer Liste in den NC-Code einfügen"
                      onClick={() => setVorlageBei(vorlageBei === b.id ? null : b.id)}>+ Vorlage</button>
                    <button className="knopf knopf--klein" data-cammodul-auf={i}
                      title="Den aktuellen NC-Code aus Bohren / Fräsen, Entgraten, C-Achse, Gravur oder DXF übernehmen"
                      onClick={() => setVorlageBei(vorlageBei === "m" + b.id ? null : "m" + b.id)}>+ Aus Modul</button>
                  </div>
                  {vorlageBei === b.id && <VorlageFeld code={b.code} pos={marke.current[b.id]}
                    einsetzen={(t) => blockAendern(b.id, "code", t)} zu={() => setVorlageBei(null)} />}
                  {vorlageBei === "m" + b.id && <ModulFeld code={b.code} pos={marke.current[b.id]}
                    einsetzen={(t) => blockAendern(b.id, "code", t)} zu={() => setVorlageBei(null)} />}
                  <textarea className="cam-block__code" data-camblock="code" rows={4} spellCheck={false}
                    onSelect={(e) => { marke.current[b.id] = e.target.selectionStart; }}
                    placeholder={gegen ? "NC-Code für Kanal 2 (zwei Marken direkt nacheinander, z.B. M350 und M360, geben Platz für Kanal 1)" : "NC-Code der Bearbeitung hier einfügen (aus Kontur, Bohren / Fräsen …; zwei Marken direkt nacheinander geben Platz für Kanal 2)"}
                    value={b.code} onChange={(e) => { marke.current[b.id] = e.target.selectionStart; blockAendern(b.id, "code", e.target.value); }} />
                </>}
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
              onClick={programmFensterAuf}>⧉ Eigenes Fenster</button>
            <label className="knopf knopf--klein" id="cam-einlesen" title="Bestehendes Programm (Kanal 1 und / oder Kanal 2) einlesen, Abweichungen zum Standard violett">
              📂 Programm einlesen
              <input type="file" multiple hidden data-ablegen="direkt" onChange={(e) => { einlesen(e.target.files); e.target.value = ""; }} />
            </label></div>
          <Kanaele prog={prog} sync={sync} fehler={fehler} bereich={prog.bereiche[aktiv]} bereich2={prog.bereiche2[aktiv]}
            w={w} handSetzen={(h) => setze("hand", h)} />
        </>}
    </div>
  );
}
