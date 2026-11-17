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
import { dateiBeobachten, dateiFehler, dateiNeuWaehlen, dateienFuerName, dateienLaden, dateienSchreiben, dateienWaehlen, dateiMerken, dateiVergessen, dateiVon, kannSchreiben, schreibrechtHolen } from "./camDatei.js";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { inEigenesFenster } from "../../teile/eigenesFenster.js";
import { ModulWahl, modulEmpfaenger } from "./modulTab.jsx";
import { TYP_NAME, eigeneFelder, eigenWert, feldAus, typBeobachten, wirksamB, wirksamW } from "./camTyp.js";
import { camTypFensterOeffnen, camTypLaden } from "./CamTypFenster.jsx";
import { bloeckeLesen, kopfLesen } from "./camLesen.js";
import { wzFehler, wzText } from "./camWerkzeug.js";
import { WerkzeugFeld } from "./CamWerkzeugBild.jsx";
import { simulationOeffnen } from "./CamSim3D.jsx";
import { VORLAGEN, feldWert, vorlageStart, vorlageVon, vorlageZeilen, zeilenEinsetzen } from "./camVorlagen.js";
import AbstecherBild from "./AbstecherBild.jsx";
import { FELDER, HD_STUFEN, abVersatz, AB_VERSATZ_VORGABE, plaetzeVon, montiert, t34Von, vorschubArt, bildBereich, blockFehler, drehzahl, handNeu, markenPaare, markenOrdnen, freieMarken, wartemarkenEinsetzen, programmLesen, neuerBlock, programme, programmeMitHand, pruefen, synchronisieren, vorgabe } from "./hofercam.js";

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
              {/* Seit 1.542.0 mit Einheit wie bei den Kopfdaten (Wunsch Patrick 14. November 2026) */}
              <span>{f.text}{f.einheit && <small className="cam-einheit"> [{f.einheit}]</small>}</span>
              <input data-camvorlage-feld={f.name} value={w[f.name] ?? ""} inputMode="decimal" style={{ width: 64 }}
                placeholder={(f.vorgabe && f.vorgabe(w)) || f.einheit || ""} onChange={(e) => setze(f.name, e.target.value)} />
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

// Seit 1.545.0: Werkzeug je Bearbeitung wahlweise festlegen; seit 1.546.0
// mit Bildern zur Wahl und Massbild zum Eintippen (CamWerkzeugBild.jsx).

// „+ Aus Modul“: seit 1.436.0 der zuletzt erzeugte Code der Reiter, seit
// 1.588.0 das Modul leer in einem eigenen Tab (modulTab.jsx, Wunsch Patrick
// 17. November 2026). Der Tab setzt seinen Code über diese Stelle ein, auch
// wenn HOFERCAM gerade nicht der offene Reiter ist.
modulEmpfaenger((id, zeilen, pos) => {
  const bl = gemerkt.bloecke || [];
  const i = bl.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, text: "Diese Bearbeitung gibt es in HOFERCAM nicht mehr (anderes Programm geöffnet oder gelöscht)." };
  if (!zeilen.length) return { ok: false, text: "Kein NC-Code zum Einfügen." };
  const neu = bl.slice();
  neu[i] = { ...bl[i], code: zeilenEinsetzen(bl[i].code, zeilen, pos) };
  gemerkt.bloecke = neu;
  melden();
  return { ok: true, text: zeilen.length + " Zeilen in HOFERCAM eingefügt." };
});

// Knopf „+ …“ mit der Spanne der Plätze, etwa „T100–T600“
function spanne(gruppe, w) {
  const l = w ? montiert(gruppe, w) : plaetzeVon(gruppe);
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
// Seit 1.548.1 (Patrick 16. November 2026: „wenn ich den NC-Code ins eigene
// Fenster nehme, sind die Knöpfe 3D-Simulation und Programm einlesen nicht
// mehr vorhanden“): das Einlesen gehört dem Reiter, das eigene Fenster ruft
// es über diesen Verweis auf
let einlesenJetzt = null;
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
  const einlesen = (dateien, k) => einlesenJetzt && einlesenJetzt(dateien, k);
  return (<>
    <FensterKnoepfe w={w} einlesen={einlesen} />
    <Kanaele prog={prog} sync={synchronisieren(prog.k1, prog.k2)} fehler={pruefen(w)} bereich={bereich} bereich2={prog.bereiche2[aktivId]}
      w={w} handSetzen={handSetzen} einlesen={einlesen} />
  </>);
}

// Seit 1.562.0: in Chrome und Edge öffnet „Einlesen“ die Dateiwahl des
// Browsers, damit „Speichern“ die Datei später wieder beschreiben kann
// (camDatei.js); sonst wie bisher das Dateifeld. Hineinziehen geht weiter
// über das Dateifeld, dann ohne Zurückschreiben.
function EinlesenKnopf({ id, kanal, merkmal, einlesen, title, children }) {
  return (
    <label className="knopf knopf--klein" id={id} {...merkmal} title={title}
      onClick={(e) => {
        const f = e.currentTarget.ownerDocument.defaultView || window;
        if (!kannSchreiben(f) || e.target.tagName === "INPUT") return;
        e.preventDefault();
        dateienWaehlen(f, !kanal).then((liste) => liste.length && einlesen(liste, kanal))
          .catch((x) => alt.meldung("Datei öffnen ging nicht: " + (x && x.message ? x.message : x), "fehler"));
      }}>
      {children}
      <input type="file" multiple={!kanal} hidden data-ablegen="direkt" onChange={(e) => { einlesen(e.target.files, kanal); e.target.value = ""; }} />
    </label>
  );
}
// Welche Datei „Speichern“ für diesen Kanal aktualisiert
function DateiSchild({ k }) {
  const [, neu] = useState(0);
  useEffect(() => { dateienLaden(); return dateiBeobachten(() => neu((n) => n + 1)); }, []);
  const d = dateiVon(k);
  if (!d) return null;
  const grund = dateiFehler(k);
  // Seit 1.565.1: ging das Schreiben schief, steht der Grund hier, und
  // „Jetzt schreiben“ versucht es mit einem frischen Klick nochmals
  const jetzt = async () => {
    const recht = await schreibrechtHolen();
    const { gut, fehler } = await dateienSchreiben(programmeMitHand(gemerkt), null, recht);
    if (gut.length) alt.meldung("Datei aktualisiert: " + gut.join(", ") + ".", "gut");
    if (fehler.length && alt.fehlerMerken) alt.fehlerMerken("HOFERCAM Datei schreiben", fehler.join("; "), navigator.userAgent);
  };
  return (<>
    <span className={"cam-datei" + (grund ? " cam-datei--fehler" : "")} data-cam-datei={k} title={"„Speichern“ schreibt Kanal " + k + " auch in die Datei " + d.name + ", aus der er eingelesen wurde"}>
      ↻ {d.name}
      <button className="linkknopf" data-cam-datei-weg={k} title="Datei nicht mehr aktualisieren" onClick={() => dateiVergessen(k)}>✕</button>
    </span>
    {grund && <span className="cam-datei-grund" data-cam-datei-grund={k}>Nicht aktualisiert: {grund}
      {" "}<button className="knopf knopf--klein" data-cam-datei-jetzt={k} onClick={jetzt}>Jetzt in Datei schreiben</button>
      {" "}<button className="knopf knopf--klein" data-cam-datei-neu={k} title="Speichern-Fenster des Browsers: dieselbe Datei wählen und Ersetzen bestätigen"
        onClick={async (e) => {
          try { if (await dateiNeuWaehlen(k, e.currentTarget.ownerDocument.defaultView)) await jetzt(); }
          catch (x) { alt.meldung("Speichern-Fenster ging nicht: " + (x && x.message ? x.message : x), "fehler"); }
        }}>Datei neu wählen und schreiben</button></span>}
  </>);
}

// 3D-Simulation und Programm einlesen, im Reiter und im eigenen Fenster
function FensterKnoepfe({ w, einlesen, eigen }) {
  return (<>
    {/* Seit 1.547.0: 3D-Simulation Drehen und Bohren von vorne (Patrick 14. November 2026, Schritt 2) */}
    <button className="knopf knopf--klein" id={eigen ? "cam-sim-auf" : "cam-sim-auf-fenster"} data-cam-sim="1"
      title="Drehen, Bohren und Fräsen in 3D, Kanal 1 und Kanal 2, mit den Werkzeugen der Bearbeitungen"
      onClick={() => simulationOeffnen(w)}>🧊 3D-Simulation</button>
    <EinlesenKnopf id={eigen ? "cam-einlesen" : "cam-einlesen-fenster"} merkmal={{ "data-cam-einlesen-alle": "1" }} einlesen={einlesen}
      title="Bestehendes Programm (Kanal 1 und / oder Kanal 2) einlesen, Abweichungen zum Standard violett">📂 Programm einlesen</EinlesenKnopf>
  </>);
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
function MaschinenBild({ block, t34 }) {
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
  // der Bearbeitungen.
  // Seit 1.565.0 (Patrick 16. November 2026: „immer gleich gross, wie wenn
  // ich zuoberst stehe und die erste Bearbeitung anwähle“): gerechnet wird
  // immer so, als stünde die Seite ganz oben und die Maus über der ersten
  // Bearbeitung; neu nur bei anderer Fenstergrösse, nicht beim Rollen und
  // nicht je Bearbeitung
  const [mass, setMass] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const d = el.ownerDocument, win = d.defaultView;
    const rechnen = () => {
      const erster = d.querySelector(".cam-block[data-blockid]");
      const sel = ".cam-bearb__kopf .knopf" + (erster ? `, .cam-block[data-blockid="${erster.getAttribute("data-blockid")}"] :is(input, select, textarea, button)` : "");
      // Gerollte Strecke aller Vorfahren: Lage wie ganz oben gerollt
      const kopf = d.querySelector(".cam-bearb__kopf") || erster;
      let gerollt = 0;
      for (let x = kopf && kopf.parentElement; x; x = x.parentElement) gerollt += x.scrollTop || 0;
      const k = [...d.querySelectorAll(sel)].map((x) => x.getBoundingClientRect()).filter((x) => x.width && x.height)
        .map((x) => ({ left: x.left, right: x.right, top: x.top + gerollt, bottom: x.bottom + gerollt }));
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
    win.addEventListener("resize", rechnen);
    return () => { win.removeEventListener("resize", rechnen); };
  }, [!!block]);
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
        {/* Seit 1.584.0 (Patrick 16. November 2026: „im Werkzeug-Auswahlbild nur die Einheit anzeigen,
            welche montiert ist“): mit T3400 ein Bild ohne T3421–T3423 */}
        <image href={import.meta.env.BASE_URL + (t34 === "3400" ? "hilfe/star-sb20rg-t3400.png" : "hilfe/star-sb20rg.png")} x="0" y="0" width="512" height="512" />
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
// Einheiten der Felder in den Bearbeitungen (Marken haben keine)
const BLOCK_EINHEIT = { S: "U/min", vc: "m/min", vcD: "mm", X: "mm", Y: "mm", anZ: "mm", wegZ: "mm", wegA: "Grad",
  vorX: "mm", vorZ: "mm", nX: "mm", nZ: "mm" };
let fokusNach = null;
function Kanaele({ prog, sync, fehler, bereich, bereich2, w, handSetzen, einlesen }) {
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
            {/* Seit 1.542.0: jeder Kanal für sich, die Dateien liegen oft in verschiedenen Ordnern */}
            {einlesen && <EinlesenKnopf kanal={1} merkmal={{ "data-cam-einlesen": "1" }} einlesen={einlesen}
              title="Programm für Kanal 1 aus einer Datei einlesen, der andere Kanal bleibt">📂 Einlesen</EinlesenKnopf>}
            <DateiSchild k={1} />
          </span>
        </div>
        <div className="cam-spalte cam-spalte--kopf">
          <b>Kanal 2 · O{prog.nr2}</b>
          <span>
            <button className="knopf knopf--klein" data-cam-kopieren="2" onClick={(e) => kopieren(e, prog.k2, 2)}>Kopieren</button>
            <button className="knopf knopf--klein" data-cam-laden="2" onClick={(e) => herunterladen(e, prog.k2, prog.nr2)}>Herunterladen</button>
            {/* Seit 1.542.0: jeder Kanal für sich, die Dateien liegen oft in verschiedenen Ordnern */}
            {einlesen && <EinlesenKnopf kanal={2} merkmal={{ "data-cam-einlesen": "2" }} einlesen={einlesen}
              title="Programm für Kanal 2 aus einer Datei einlesen, der andere Kanal bleibt">📂 Einlesen</EinlesenKnopf>}
            <DateiSchild k={2} />
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
  // Erklärungsbild zum Abstecher, solange Maus oder Schreibmarke dort sind (seit 1.591.0)
  const [abBild, setAbBild] = useState({});
  const [kopfZu, setKopfZu] = useState(() => { try { return localStorage.getItem("hofer.cam.kopfZu") === "1"; } catch { return false; } });
  const setGespeichert = (z) => { gespeichertCam = z; setGespeichertRoh(z); };
  const laden = (d) => {
    // Felder, die es beim Speichern noch nicht gab, bekommen die Vorgabe
    const neu = { ...vorgabe(), ...d, bloecke: Array.isArray(d.bloecke) ? d.bloecke : [] };
    // Seit 1.591.0 ist T3400 Vorgabe: ältere Programme ohne Wahl, die T3421–T3423
    // brauchen, behalten die frontangetriebenen
    if (!d.t34 && neu.bloecke.some((b) => /^342[1-3]$/.test(String(b.platz)))) neu.t34 = "3421";
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
    setzeBloecke(markenOrdnen({ ...w, bloecke: neu }));
  };
  // Seit 1.579.0: nach jedem Umstellen die Wartemarken der Reihe nach neu
  const ordnenMitMarken = (neu) => setzeBloecke(markenOrdnen({ ...w, bloecke: neu }));
  const frei = freieMarken(w);
  const fehler = pruefen(w);
  // Seit 1.441.0: Einstellungen des Maschinentyps laden und nach dem
  // Speichern neu rechnen
  const [typStand, setTypStand] = useState(0);
  useEffect(() => { camTypLaden(); return typBeobachten(() => { setTypStand((n) => n + 1); melden(); }); }, []);
  const prog = useMemo(() => programmeMitHand(w), [w, typStand]);
  // Änderungen aus dem eigenen Fenster kommen über „gemerkt“
  useEffect(() => {
    // seit 1.588.0 auch die Bearbeitungen, wenn ein Modul-Tab Code einfügt
    const f = () => setW((x) => (x.hand === gemerkt.hand && x.bloecke === gemerkt.bloecke ? x : { ...x, hand: gemerkt.hand, bloecke: gemerkt.bloecke }));
    hoerer.add(f); return () => { hoerer.delete(f); };
  }, []);
  const sync = useMemo(() => synchronisieren(prog.k1, prog.k2), [prog]);

  const ncBeide = text(prog.k1) + text(prog.k2);

  // Seit 1.541.0: bestehendes Programm einlesen. Die Felder oben kommen
  // aus Kanal 1 (Nr., HOCO Nr., G170, G266), der Text wird wie eine
  // Handänderung gespeichert, mit dem Eingelesenen als „ein“
  // Seit 1.542.0 mit kanalVorgabe (Knopf am Kanal): die Datei gilt für
  // diesen Kanal, egal welche O-Nummer sie trägt; der andere Kanal bleibt
  const einlesen = async (dateien, kanalVorgabe) => {
    const gelesen = [];
    // Einträge sind Dateien (Dateifeld) oder {datei, griff} (Dateiwahl des Browsers)
    for (const x of [...(dateien || [])].slice(0, kanalVorgabe ? 1 : undefined)) {
      const d = x.datei || x;
      const roh = await d.text();
      let r = programmLesen(roh);
      if (r.fehler) { alt.meldung(d.name + ": " + r.fehler, "fehler"); continue; }
      r = { ...r, griff: x.griff || null, roh, o: r.kanal === 2 ? r.nr + 1000 : r.nr };
      if (kanalVorgabe && r.kanal !== kanalVorgabe) r = { ...r, kanal: kanalVorgabe, felder: w.nr ? {} : { nr: r.felder.nr } };
      gelesen.push(r);
    }
    if (!gelesen.length) return;
    for (const r of gelesen) await dateiMerken(r.kanal, r.griff, r.roh, r.o);
    gelesen.sort((a, b) => a.kanal - b.kanal);
    // Seit 1.542.0 (Wunsch Patrick 14. November 2026: „es soll die Kopf-
    // und Enddaten der Bearbeitungen sowie die Werkzeuge auch erkennen“):
    // aus beiden Kanälen zusammen werden die Felder oben und die
    // Bearbeitungen gelesen (camLesen.js). Für einen Kanal, der nicht in
    // dieser Wahl ist, gilt das angezeigte Programm (samt allem, was seither
    // geändert wurde), damit Kanal 1 und Kanal 2 nacheinander gehen; die
    // Felder oben kommen nur aus den eingelesenen Kanälen
    const vorher = programmeMitHand(w);
    const zeilen = { 1: vorher.k1, 2: vorher.k2 };
    for (const r of gelesen) zeilen[r.kanal] = r.zeilen;
    const nur = (k) => (gelesen.some((r) => r.kanal === k) ? zeilen[k] : null);
    const kopf = kopfLesen(nur(1), nur(2));
    const { bloecke, unklar } = bloeckeLesen(zeilen[1], zeilen[2]);
    let neu = { ...w, ...kopf };
    for (const r of gelesen) neu = { ...neu, ...r.felder };
    neu.bloecke = bloecke;
    // Seit 1.582.0: Bestückung von Platz 34 aus dem Programm
    if (bloecke.some((b) => String(b.platz) === "3400")) neu.t34 = "3400";
    else if (bloecke.some((b) => /^342[1-3]$/.test(String(b.platz)))) neu.t34 = "3421";
    const p = programme(neu);
    let hand = { ...(w.hand || {}) };
    for (const k of [1, 2]) {
      const r = gelesen.find((x) => x.kanal === k);
      // Angezeigt bleibt genau, was eingelesen bzw. vorher zu sehen war;
      // was nicht dem Standard entspricht, ist violett
      // Ein Kanal ohne Handänderung wird einfach neu erzeugt (sonst blieben
      // Nr. und Kopf von vorher stehen)
      if (r) delete hand["k" + k];
      else if (!hand["k" + k]) continue;
      hand = handNeu({ hand }, k, k === 1 ? p.k1 : p.k2, r ? r.zeilen : vorher["k" + k]);
      if (r && hand["k" + k]) hand["k" + k].ein = r.zeilen;
    }
    neu.hand = hand;
    Object.assign(gemerkt, neu);
    setW(neu);
    melden();
    alt.meldung("Eingelesen: " + gelesen.map((r) => "Kanal " + r.kanal + " (O" + String(r.kanal === 2 ? r.nr + 1000 : r.nr).padStart(4, "0") + ")").join(", ")
      + ", " + (bloecke.length === 1 ? "1 Bearbeitung" : bloecke.length + " Bearbeitungen") + " erkannt"
      + (unklar.length ? ", nicht erkannt: " + unklar.join(", ") + " (stehen nur im Programm)" : "")
      + ". Violett = anders als der Standard."
      + (gelesen.some((r) => r.griff) ? " „Speichern“ aktualisiert auch die Datei." : ""), unklar.length ? "warn" : "gut");
  };
  einlesenJetzt = einlesen;

  return (
    <div className="karte cam">
      <div className="cam-kopf">
        <h2 className="karte__titel">HOFERCAM</h2>
        <span className="cam-typ">Maschinentyp: <b>{TYP_NAME}</b></span>
        {/* Seit 1.441.0: Einstellungen des Typs, ändern nur Admins */}
        {alt.istAdmin && alt.istAdmin() && <button className="knopf knopf--klein" id="cam-typ-einst" title="Kopf, Ende, Bearbeitungen, Plätze und Vorgaben dieses Maschinentyps einstellen"
          onClick={camTypFensterOeffnen}>⚙ Maschinentyp</button>}
        <NcAblage art="cam" kurz="camab" wort="HOFERCAM" daten={w} nc={ncBeide} laden={laden}
          gespeichert={gespeichert} setGespeichert={setGespeichert}
          vorSpeichern={schreibrechtHolen} nachSpeichern={async (name, recht) => {
            // Seit 1.562.0: auch die eingelesenen Dateien aktualisieren
            const { gut, fehler: nicht } = await dateienSchreiben(programmeMitHand(gemerkt), name, recht);
            if (gut.length) alt.meldung("Datei aktualisiert: " + gut.join(", ") + ".", "gut");
            if (nicht.length) {
              alt.meldung("Nicht aktualisiert: " + nicht.join(", ") + ".", "warn");
              if (alt.fehlerMerken) alt.fehlerMerken("HOFERCAM Datei schreiben", nicht.join("; "), navigator.userAgent);
            }
          }}
          nachOeffnen={(z) => dateienFuerName(z.name)} />
        {/* Seit 1.577.0 (Wunsch Patrick 16. November 2026: „einen Button
            Schliessen, damit das aktuelle geschlossen wird und die
            Grundmaske wieder erscheint“): leert alles wie beim ersten
            Öffnen; nicht Gespeichertes fragt einmal nach */}
        <button className="linkknopf" id="camab-schliessen" title="Aktuelles Programm schliessen, leere Maske zeigen"
          onClick={async () => {
            const leer = JSON.stringify(w) === JSON.stringify(vorgabe());
            const offen = !leer && !(gespeichert && gespeichert.nc === ncBeide);
            if (offen && !(await alt.nachfragen({ titel: "Schliessen",
              text: "Das Programm ist nicht gespeichert. Trotzdem schliessen? Die Eingaben gehen verloren.",
              bestaetigen: "Schliessen", gefahr: true }))) return;
            setGespeichert(null);
            setAktiv(null);
            await Promise.all([dateiVergessen(1), dateiVergessen(2)]);
            laden(vorgabe());
          }}>Schliessen</button>
      </div>
      <NcStand kurz="camab" gespeichert={gespeichert} nc={ncBeide} />

      {/* Seit 1.581.0 (Wunsch Patrick 16. November 2026: „den Eingabebereich
          für die Kopfdaten soll auch eingeklappt werden können“): Pfeil
          klappt die Felder ein, eingeklappt steht eine Zeile mit den
          Werten; gemerkt je Gerät */}
      <div className="cam-kopfdaten">
        <button className="linkknopf cam-kopfdaten__knopf" id="cam-kopf-zu" aria-expanded={!kopfZu}
          onClick={() => { const z = !kopfZu; setKopfZu(z); try { localStorage.setItem("hofer.cam.kopfZu", z ? "1" : "0"); } catch { /* egal */ } }}>
          {kopfZu ? "▸" : "▾"} Kopfdaten</button>
        {kopfZu && <span className="cam-kopfdaten__werte klein" id="cam-kopf-werte">
          {FELDER.flatMap((g) => g.felder).filter((d) => !feldAus("kopf", d.name) && String(w[d.name] ?? "").trim() !== "")
            .map((d) => d.text + " " + w[d.name]).concat(t34Von(w) === "3400" ? "T3400 montiert" : "T3421–T3423 montiert")
            .concat(w.abArt === "versetzt" ? "Abstecher versetzt " + (String(w.abVersatz ?? "").trim() || AB_VERSATZ_VORGABE) : "Abstecher normal").join(" · ")}</span>}
      </div>
      {!kopfZu && <div className="cam-gruppen">
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
        <fieldset className="cam-gruppe">
          <legend>Bestückung</legend>
          <label className="cam-feld" title="Auf Platz 34 ist entweder das Querwerkzeug T3400 oder die Einheit mit T3421–T3423 montiert, beides geht nicht">
            <span>Platz 34</span>
            <select data-cam="t34" value={t34Von(w)} onChange={(e) => setze("t34", e.target.value)}>
              <option value="3421">T3421–T3423 (frontangetrieben)</option>
              <option value="3400">T3400 (querangetrieben)</option>
            </select></label>
          <span className="cam-ab" onMouseEnter={() => setAbBild((a) => ({ ...a, maus: true }))} onMouseLeave={() => setAbBild((a) => ({ ...a, maus: false }))}
            onFocus={() => setAbBild((a) => ({ ...a, fokus: true }))} onBlur={() => setAbBild((a) => ({ ...a, fokus: false }))}>
          <label className="cam-feld" title="Versetzter Abstecher: die Platte sitzt rechts am Schaft, um den Versatz minus Abstechbreite B weiter vorne. Der Kopf fährt dann mit G0X[#531+4.]Z-… um diesen Wert vor, beim normalen Z-0.">
            <span>Abstecher T100</span>
            <select data-cam="abArt" value={w.abArt === "versetzt" ? "versetzt" : "normal"} onChange={(e) => setze("abArt", e.target.value)}>
              <option value="normal">normal</option>
              <option value="versetzt">versetzt</option>
            </select></label>
          {w.abArt === "versetzt" && <label className="cam-feld" title="Versatz der Platte zum Schaft, wirksam im Programm ist Versatz minus Abstechbreite B">
            <span>Versatz <span className="cam-einheit">[mm]</span></span>
            <input data-cam="abVersatz" value={w.abVersatz ?? ""} placeholder={String(AB_VERSATZ_VORGABE)} inputMode="decimal" style={{ width: 70 }}
              onChange={(e) => setze("abVersatz", e.target.value)} />
            <span className="klein" data-cam="abWirksam">wirksam Z-{abVersatz(w)}</span></label>}
          {(abBild.maus || abBild.fokus) && <div className="cam-ab__bild" data-cam-abbild-feld>
            <AbstecherBild art={w.abArt} versatz={String(w.abVersatz ?? "").trim() || AB_VERSATZ_VORGABE} b={w.B} abz={abVersatz(w)} /></div>}
          </span>
        </fieldset>
        {eigeneFelder("kopf").length > 0 && <fieldset className="cam-gruppe" id="cam-eigene">
          <legend>Eigene Felder</legend>
          {eigeneFelder("kopf").map((f) => <EigenFeld key={f.id} f={f} o={w} merkmal="data-cam-eigen"
            setze={(ph, x) => setze("eigen", { ...(w.eigen || {}), [ph]: x })} />)}
        </fieldset>}
      </div>}

      {(() => {
        // Seit 1.426.6 wieder nur, solange die Maus über einer Bearbeitung ist
        // (Patrick: „doch nicht eingeblendet bleiben“)
        const bb = bloecke.find((x) => x.id === ueber);
        return <MaschinenBild t34={t34Von(w)} block={bb && vorPlatz && vorPlatz.id === bb.id ? { ...bb, platz: vorPlatz.platz } : bb} />;
      })()}
      <div className="cam-bearb" id="cam-bearb">
        <div className="cam-bearb__kopf">
          <b>Bearbeitungen Kanal 1</b>
          <button className="knopf knopf--klein" id="cam-neu-dreh"
            onClick={() => { const nb = neuerBlock(bloecke, "dreh", w); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Drehwerkzeug {spanne("dreh")}</button>
          <button className="knopf knopf--klein" id="cam-neu-front"
            onClick={() => { const nb = neuerBlock(bloecke, "front", w); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Frontwerkzeug {spanne("front")}</button>
          {/* Seit 1.415.0: angetriebene T3421–T3423 an der Gegenspindel */}
          <button className="knopf knopf--klein" id="cam-neu-seite"
            onClick={() => { const nb = neuerBlock(bloecke, "seite", w); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Querangetrieben {spanne("seite", w)}</button>
          {/* Seit 1.582.0 nur, wenn T3421–T3423 montiert sind */}
          {t34Von(w) !== "3400" && <button className="knopf knopf--klein" id="cam-neu-quer"
            onClick={() => { const nb = neuerBlock(bloecke, "quer", w); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Frontangetrieben {spanne("quer", w)}</button>}
        </div>
        {/* Seit 1.425.3 (Wunsch Patrick 5. November 2026): Kanal 2 in einer
            eigenen Zeile darunter */}
        <div className="cam-bearb__kopf">
          <b>Bearbeitungen Kanal 2</b>
          {/* Seit 1.420.0: Drehwerkzeug nur in Kanal 2 */}
          <button className="knopf knopf--klein" id="cam-neu-k2"
            onClick={() => { const nb = neuerBlock(bloecke, "k2", w); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Stehende Werkzeuge {spanne("k2")}</button>
          <button className="knopf knopf--klein" id="cam-neu-k2a"
            onClick={() => { const nb = neuerBlock(bloecke, "k2a", w); setzeBloecke([...bloecke, nb]); setAktiv(nb.id); }}>+ Angetrieben {spanne("k2")}</button>
        </div>
        {bloecke.length === 0 && <p className="klein">Noch keine Bearbeitung. Sie kommt zwischen „(Ende Kopf)“ und „(Start Ende)“.</p>}
        {/* Seit 1.405.0 (Wunsch Patrick 5. November 2026): Bearbeitungen am
            Griff ⠿ untereinander verschieben, statt Pfeilen */}
        <ZiehListe nurGriff darf={bloecke.length > 1} className="cam-zieh"
          ordnen={(ids) => ordnenMitMarken(ids.map((id) => bloecke.find((x) => x.id === id)).filter(Boolean))}
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
          // Seit 1.542.0 mit Einheit wie bei den Kopfdaten (Wunsch Patrick
          // 14. November 2026: „bei den Vorlagen für Bearbeitungen soll auch
          // angezeigt werden, welche Einheiten eingegeben werden müssen“)
          const einheit = (name) => BLOCK_EINHEIT[name] || (name === "wegF" ? (vorschubArt(b) === "98" ? "mm/min" : "mm/U") : "");
          const feld = (name, text, lang, breit, platzhalter) => aus(name) ? null : (
            <label className={"cam-feld" + (bf[name] ? " cam-feld--fehler" : "")} title={lang + (bf[name] ? " – " + bf[name] : "")}>
              <span>{text}{einheit(name) && <small className="cam-einheit"> [{einheit(name)}]</small>}</span>
              <input data-camblock={name} value={b[name] ?? ""} style={breit ? { width: breit } : undefined}
                placeholder={platzhalter || einheit(name)} inputMode={platzhalter ? "text" : "decimal"} onChange={(e) => blockAendern(b.id, name, e.target.value)} />
            </label>
          );
          return { key: b.id, inhalt: (
            <div key={b.id} className={"cam-block" + (b.id === aktiv ? " cam-block--aktiv" : "")} data-block={i} data-blockid={b.id}
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
                {/* Seit 1.566.0 (Patrick 16. November 2026: „nur wenn ich wirklich
                    mit der Maus auf das Feld Platz fahre“): das Maschinenbild
                    kommt nur über dem Feld Platz samt seiner offenen Liste */}
                <label className={"cam-feld" + (bf.platz ? " cam-feld--fehler" : "")} data-camblock-platzfeld={i}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") setUeber(b.id); }}
                  onPointerLeave={() => setUeber((x) => (x === b.id ? null : x))}
                  title={k2 ? "Werkzeugplatz Kanal 2" : quer ? "Werkzeugplatz (angetrieben, Weg mit der Gegenspindel)" : front ? "Werkzeugplatz (Frontwerkzeug fest)" : "Werkzeugplatz (Drehwerkzeug Kanal 1)"}><span>Platz</span>
                  <PlatzWahl wert={b.platz} plaetze={montiert(k2 ? "k2" : seite ? "seite" : quer ? "quer" : front ? "front" : "dreh", w)}
                    waehlen={(p) => { blockAendern(b.id, "platz", p); setUeber(b.id); }}
                    vorschau={(p) => { setVorPlatz(p ? { id: b.id, platz: p } : null); if (p) setUeber(b.id); }} />
                  {bf.platz && <small className="cam-fehltext" data-camblock-nichtmontiert={i}>nicht montiert</small>}</label>
                {/* Seit 1.561.0: Bearbeitung wie eingelesen, ohne Vorlage */}
                {b.frei ? <span className="cam-frei klein" data-camblock-frei={i}
                  title="Diese Bearbeitung passt zu keiner Vorlage des Maschinentyps (etwa ein älteres Programm). Ihr NC-Code steht unverändert im Programm, die Felder der Vorlage wirken nicht.">
                  Wie eingelesen{b.bez ? ": " + b.bez : ""}
                  <button className="knopf knopf--klein" data-camblock-standard={i}
                    title="Felder der Vorlage einschalten; der Code bleibt im NC-Feld und wird in die Vorlage eingebaut"
                    onClick={() => blockAendern(b.id, "frei", false)}>Mit Vorlage aufbauen</button></span> : <>
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
                </>}
                {eigeneFelder(b.art).map((f) => <EigenFeld key={f.id} f={f} o={b} merkmal="data-camblock-eigen"
                  setze={(ph, x) => blockAendern(b.id, "eigen", { ...(b.eigen || {}), [ph]: x })} />)}
                <span className="cam-block__knoepfe">
                  <button className="knopf knopf--klein" title="Nach oben" disabled={i === 0} onClick={() => blockSchieben(i, -1)}>↑</button>
                  <button className="knopf knopf--klein" title="Nach unten" disabled={i === bloecke.length - 1} onClick={() => blockSchieben(i, 1)}>↓</button>
                  <button className="knopf knopf--klein" title="Bearbeitung entfernen" data-camblock-weg={i}
                    onClick={() => ordnenMitMarken(bloecke.filter((x) => x.id !== b.id))}>✕</button>
                </span>
              </div>
              {b.zu
                ? <button className="cam-block__zu klein" data-camblock-auf={i} onClick={() => blockAendern(b.id, "zu", false)}>
                    NC-Code: {String(b.code || "").split(/\r?\n/).filter((x) => x.trim()).length} Zeilen (aufklappen)</button>
                : <>
                  <div className="cam-block__vorlageknopf">
                    <button className={"knopf knopf--klein cam-wz-knopf" + (b.wz && b.wz.form ? (Object.keys(wzFehler(b)).length ? " cam-wz-knopf--fehler" : " cam-wz-knopf--gesetzt") : "")}
                      data-camwz-auf={i} title="Werkzeug festlegen (freiwillig, für die Simulation)"
                      onClick={() => setVorlageBei(vorlageBei === "w" + b.id ? null : "w" + b.id)}>🔧 {wzText(b) || "Werkzeug"}</button>
                    <button className="knopf knopf--klein" data-camvorlage-auf={i}
                      title="Gewindestrählen, Tieflochbohren … aus einer Liste in den NC-Code einfügen"
                      onClick={() => setVorlageBei(vorlageBei === b.id ? null : b.id)}>+ Vorlage</button>
                    <button className="knopf knopf--klein" data-cammodul-auf={i}
                      title="Den aktuellen NC-Code aus Bohren / Fräsen, Entgraten, C-Achse, Gravur oder DXF übernehmen"
                      onClick={() => setVorlageBei(vorlageBei === "m" + b.id ? null : "m" + b.id)}>+ Aus Modul</button>
                    {!b.frei && <button className="knopf knopf--klein" data-cammarken-auf={i} disabled={frei.length < 2}
                      title={"Zwei freie Wartemarken nach der Zeile mit der Schreibmarke einsetzen; alle Marken der Bearbeitungen werden der Reihe nach neu vergeben (Kopf und Ende bleiben). Frei: " + (frei.join(", ") || "keine")}
                      onClick={() => { const nb = wartemarkenEinsetzen(w, b.id, marke.current[b.id], zeilenEinsetzen); if (nb) setzeBloecke(nb); }}>+ Wartemarken</button>}
                    {!b.frei && <span className="klein cam-marken-frei" data-cammarken-frei title={frei.join(", ")}>
                      {frei.length ? "frei ab " + frei[0] + " · noch " + frei.length : "keine Marke mehr frei"}</span>}
                  </div>
                  {vorlageBei === "w" + b.id && <WerkzeugFeld b={b} setze={(wz) => blockAendern(b.id, "wz", wz)} zu={() => setVorlageBei(null)} />}
                  {vorlageBei === b.id && <VorlageFeld code={b.code} pos={marke.current[b.id]}
                    einsetzen={(t) => blockAendern(b.id, "code", t)} zu={() => setVorlageBei(null)} />}
                  {vorlageBei === "m" + b.id && <ModulWahl blockId={b.id} pos={() => marke.current[b.id]} zu={() => setVorlageBei(null)} />}
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
            {" "}<button className="knopf knopf--klein" id="cam-zurueck" onClick={() => fensterZu && fensterZu()}>Zurückholen</button>
            {" "}<FensterKnoepfe w={w} einlesen={einlesen} eigen /></div>
        : <>
          <div className="cam-fensterleiste">
            <button className="knopf knopf--klein" id="cam-fenster" title="Kanäle in einem eigenen Browserfenster, auch auf einem anderen Bildschirm"
              onClick={programmFensterAuf}>⧉ Eigenes Fenster</button>
            <FensterKnoepfe w={w} einlesen={einlesen} eigen /></div>
          <Kanaele prog={prog} sync={sync} fehler={fehler} bereich={prog.bereiche[aktiv]} bereich2={prog.bereiche2[aktiv]}
            w={w} handSetzen={(h) => setze("hand", h)} einlesen={einlesen} />
        </>}
    </div>
  );
}
