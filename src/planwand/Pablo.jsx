// =================================================================
//  PABLO: SPRACHASSISTENT AUF DER PLANWAND (seit 1.362.0)
//  Wunsch Patrick 3. November 2026: „ein JARVIS … das mir Auskunft gibt,
//  was im Auftrag steht, auch Auslastung und so, es soll Pablo heissen,
//  wäre sogar cool, wenn es auf Pablo Escobar automatisch reagieren
//  könnte“ und „ohne Button für Aktivieren, aber man soll sehen, dass
//  er zuhört, mit einer kleinen Einblendung und Animation“.
//
//  Solange jemand angemeldet ist (Wunsch Patrick: „soll überall gehen“,
//  auch im Pad Mode und auf den Bildschirmen), hört Pablo mit (Spracherkennung des
//  Browsers) und reagiert nur, wenn jemand „Pablo“ sagt. Unten links
//  zeigt ein kleines Zeichen, dass er zuhört. Hört er seinen Namen,
//  geht die Einblendung auf: was er versteht, dann die Antwort als Text,
//  ohne Stimme (seit 1.368.0). Ein Tipp aufs Zeichen
//  öffnet sie zum Eintippen. Die Antworten kommen aus src/daten/pablo.js,
//  ohne KI und ohne Kosten (Entscheid Patrick 3. November 2026).
//  Nicht für Externe (Entscheid Patrick 3. November 2026: „Externe nicht“)
//  und nicht im Archiv.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { alt } from "../bruecke.jsx";
import { antworten } from "../daten/pablo.js";

const Erkennung = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
const ZU_NACH_MS = 25000;       // Einblendung geht nach der Antwort von selbst zu

// ---------- Weckwort ----------
// Patrick 3. November 2026: „es reagiert nicht auf Pablo“. Die Erkennung
// schreibt den Namen oft anders (Bablo, Paolo, Pablu …), darum zählt
// jedes Wort, das „Pablo“ bis auf einen Buchstaben gleicht, und jede
// Lesart, die der Browser vorschlägt, nicht nur die erste.
function abstand(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let vor = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, vor + (a[i - 1] === b[j - 1] ? 0 : 1));
      vor = tmp;
    }
  }
  return d[b.length];
}
const PABLO_WOERTER = new Set(["pablo", "pablos", "pablow", "paplo", "bablo", "pablu", "pavlo", "pabblo", "paolo", "paulo", "pablito", "pabelo", "pablò", "pabl"]);
const norm = (w) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export function istPablo(w) {
  const n = norm(w);
  if (PABLO_WOERTER.has(n)) return true;
  if (n.length >= 4 && n.length <= 7 && /^[pb]/.test(n) && abstand(n, "pablo") <= 1) return true;
  return istEscobar(n);
}
const istEscobar = (n) => n.length >= 6 && n.length <= 9 && abstand(norm(n), "escobar") <= 2;
// Was nach „Pablo (Escobar)“ kommt, oder null ohne Weckwort
export function nachWeckwort(t) {
  t = String(t || "");
  const re = /[\p{L}]+/gu;
  let m;
  while ((m = re.exec(t))) {
    if (!istPablo(m[0])) continue;
    let rest = t.slice(m.index + m[0].length).replace(/^[\s,.:!?]+/, "");
    const n = rest.match(/^[\p{L}]+/u);
    if (n && istEscobar(norm(n[0]))) rest = rest.slice(n[0].length).replace(/^[\s,.:!?]+/, "");
    return rest.trim();
  }
  return null;
}

// Keine Sprachausgabe (Patrick 3. November 2026: „will dann ohne Stimme,
// soll einfach als Textfeld aufpoppen“): die Antwort steht nur in der
// Einblendung. 1.365.0 hatte kurz ElevenLabs und die Gerätestimme.

export function pabloSichtbar() {
  return !alt.istExtern() && !(alt.istArchiv && alt.istArchiv());
}

// Pablo hat eine eigene Wurzel im body, damit er beim Neuzeichnen einer
// Seite (balkenZeigen, Seitenwechsel) nicht mitten im Satz verstummt.
// Seit Wunsch Patrick 3. November 2026 („soll überall gehen“) ist er auf
// allen Seiten da, auch im Pad Mode und auf den Bildschirmen, solange
// jemand angemeldet ist.
const toolOffen = () => !!document.getElementById("inhalt") && !!alt.profil
  && (alt.meineRolle ? alt.meineRolle() !== "dienst" : true) && pabloSichtbar();
let wurzel = null;
export function pabloStarten() {
  if (wurzel || typeof document === "undefined") return;
  const huelle = document.createElement("div");
  huelle.id = "pablo-wurzel";
  document.body.appendChild(huelle);
  wurzel = createRoot(huelle);
  wurzel.render(<PabloHuelle />);
}
function PabloHuelle() {
  const [da, setDa] = useState(toolOffen);
  useEffect(() => {
    const pruefen = () => setDa(toolOffen());
    const takt = setInterval(pruefen, 1000);
    window.addEventListener("hashchange", pruefen);
    return () => { clearInterval(takt); window.removeEventListener("hashchange", pruefen); };
  }, []);
  return da ? <Pablo /> : null;
}

function Pablo() {
  const [offen, setOffen] = useState(false);
  // "aus" (kein Mikrofon), "lauscht" (wartet auf „Pablo“), "hoert" (Frage),
  // "denkt", "spricht"
  const [zustand, setZustandRoh] = useState(Erkennung ? "lauscht" : "aus");
  const [gehoert, setGehoert] = useState("");
  const [frage, setFrage] = useState("");
  const [antwort, setAntwort] = useState(null);
  const [eingabe, setEingabe] = useState("");
  const zustandRef = useRef(zustand);
  const setZustand = (z) => { zustandRef.current = z; setZustandRoh(z); };
  const erk = useRef(null);
  const aktiv = useRef(!!Erkennung);
  const wartetBis = useRef(0);
  const besetzt = useRef(false);
  const zuTakt = useRef(null);
  const neuStart = useRef(null);
  const fehlerZahl = useRef(0);
  const offenRef = useRef(false);
  const sprache = useRef("de-CH");
  const [verstanden, setVerstanden] = useState("");   // was der Browser zuletzt gehört hat
  // Brave hat die Spracherkennung zwar, aber keinen Server dahinter: sie meldet immer "network" (Patrick 3. November 2026).
  const istBrave = typeof navigator !== "undefined" && !!navigator.brave;
  const [grund, setGrund] = useState(istBrave ? "Brave kann nicht zuhören. Öffne das HoferTool in Chrome oder Edge." : Erkennung ? "" : "Dieser Browser kann nicht zuhören. Am besten Chrome oder Edge nehmen.");
  offenRef.current = offen;

  const zuPlanen = () => {
    clearTimeout(zuTakt.current);
    zuTakt.current = setTimeout(() => {
      if (document.activeElement && document.activeElement.id === "pablo-eingabe") return;
      setOffen(false);
    }, ZU_NACH_MS);
  };

  // ---------- Sprechen ----------

  // ---------- Fragen ----------
  const fragen = async (text) => {
    const t = String(text || "").trim();
    if (!t || besetzt.current) return;
    besetzt.current = true;
    clearTimeout(zuTakt.current);
    stopp();
    setOffen(true); setFrage(t); setGehoert(""); setAntwort(null);
    setZustand("denkt");
    let a;
    try { a = await antworten(t); }
    catch (e) { a = { text: "Das hat nicht geklappt: " + (e && e.message ? e.message : e), fehler: true }; }
    setAntwort(a);
    if (a.aktion) { try { await a.aktion(); } catch (e) { alt.meldung(alt.fehlertext ? alt.fehlertext(e) : String(e), "fehler"); } }
    besetzt.current = false;
    setZustand(aktiv.current ? "lauscht" : "aus");
    // Hat Pablo etwas geöffnet, steht die Einblendung nicht im Weg
    if (a.aktion) setOffen(false); else zuPlanen();
    zuhoeren();
  };

  // ---------- Zuhören ----------
  function stopp() {
    clearTimeout(neuStart.current);
    const r = erk.current;
    erk.current = null;
    if (r) { r.onend = null; r.onresult = null; r.onerror = null; try { r.abort(); } catch (f) { /* egal */ } }
  }

  function zuhoeren() {
    if (!Erkennung || !aktiv.current || erk.current || besetzt.current || document.hidden) return;
    const r = new Erkennung();
    r.lang = sprache.current; r.interimResults = true; r.continuous = true; r.maxAlternatives = 4;
    r.onresult = (e) => {
      fehlerZahl.current = 0;
      setGrund((g) => (g ? "" : g));
      for (let i = e.resultIndex; i < e.results.length; i++) {
        // Jede Lesart prüfen: oft steht „Pablo“ erst in der zweiten
        const lesarten = Array.from(e.results[i]).map((x) => String(x.transcript || "").trim()).filter(Boolean);
        if (!lesarten.length) continue;
        const t = lesarten.find((x) => nachWeckwort(x) !== null) || lesarten[0];
        if (e.results[i].isFinal) setVerstanden(t);
        const rest = nachWeckwort(t);
        const wartet = Date.now() < wartetBis.current;
        if (!e.results[i].isFinal) {
          // Schon beim ersten „Pablo“ aufgehen, dann live mitschreiben
          if (rest !== null || wartet) {
            if (zustandRef.current !== "hoert") { setZustand("hoert"); setOffen(true); setFrage(""); setAntwort(null); clearTimeout(zuTakt.current); }
            setGehoert(rest !== null ? rest : t);
          }
          continue;
        }
        if (rest !== null) {
          if (rest.split(/\s+/).filter(Boolean).length >= 2) { wartetBis.current = 0; fragen(rest); return; }
          // Nur „Pablo“: die nächste Aussage ist die Frage
          wartetBis.current = Date.now() + 9000;
          setZustand("hoert"); setOffen(true); setGehoert(""); setFrage(""); setAntwort(null);
          clearTimeout(zuTakt.current);
          setTimeout(() => {
            if (zustandRef.current === "hoert" && Date.now() >= wartetBis.current && !besetzt.current) {
              wartetBis.current = 0; setZustand("lauscht"); setOffen(false);
            }
          }, 9200);
          continue;
        }
        if (wartet) { wartetBis.current = 0; fragen(t); return; }
      }
    };
    r.onerror = (e) => {
      // Kein Mikrofon oder gesperrt: still aus, bis die Planwand neu aufgeht
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
        aktiv.current = false; setZustand("aus");
        setGrund(e.error === "audio-capture" ? "Kein Mikrofon gefunden." : "Das Mikrofon ist für diese Seite gesperrt. Oben links in der Adresszeile beim Schloss das Mikrofon erlauben, dann hier antippen.");
      } else if (e.error === "language-not-supported" && sprache.current !== "de-DE") sprache.current = "de-DE";
      else if (e.error === "network") { fehlerZahl.current++; if (fehlerZahl.current >= 3) setGrund(istBrave ? "Brave kann nicht zuhören. Öffne das HoferTool in Chrome oder Edge." : "Die Spracherkennung des Browsers erreicht ihren Server nicht."); }
    };
    r.onend = () => {
      if (erk.current !== r) return;
      erk.current = null;
      if (zustandRef.current === "hoert" && !wartetBis.current && !besetzt.current) setZustand("lauscht");
      // Der Browser beendet das Zuhören nach einer Weile von selbst; bei
      // Netzfehlern immer länger warten
      if (aktiv.current) neuStart.current = setTimeout(zuhoeren, Math.min(30000, 300 + fehlerZahl.current * fehlerZahl.current * 1000));
    };
    erk.current = r;
    try { r.start(); } catch (f) { erk.current = null; }
  }

  useEffect(() => {
    if (aktiv.current) neuStart.current = setTimeout(zuhoeren, 1200);
    const sicht = () => { if (document.hidden) stopp(); else if (aktiv.current) zuhoeren(); };
    document.addEventListener("visibilitychange", sicht);
    return () => { aktiv.current = false; document.removeEventListener("visibilitychange", sicht); stopp(); clearTimeout(zuTakt.current); };
  }, []);

  // Escape schliesst nur die Einblendung
  useEffect(() => {
    if (!offen) return undefined;
    const taste = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".dialog-huelle")) return;
      e.preventDefault();
      schliessen();
    };
    // Vor dem zentralen Escape (Schritt zurück bis zum Abmelden)
    window.addEventListener("keydown", taste, true);
    return () => window.removeEventListener("keydown", taste, true);
  }, [offen]);

  const schliessen = () => {
    clearTimeout(zuTakt.current);
    wartetBis.current = 0;
    setOffen(false);
    if (!besetzt.current) setZustand(aktiv.current ? "lauscht" : "aus");
  };

  const STATUS = {
    lauscht: "Sag „Pablo“ und deine Frage", hoert: "Ich höre …", denkt: "Ich schaue nach …",
    spricht: "", aus: "Zum Fragen eintippen",
  };

  return (
    <>
      <button type="button" className={"pablo-zeichen pablo-zeichen--" + zustand + (offen ? " pablo-zeichen--offen" : "")} id="pablo-zeichen"
        title={zustand === "aus" ? "Pablo fragen (eintippen)" : "Pablo hört zu: sag „Pablo“ und deine Frage"}
        aria-label="Pablo" onClick={() => {
          // Nach gesperrtem Mikrofon: ein Tipp versucht es neu (mit Tipp erlauben manche Browser erst)
          if (Erkennung && !aktiv.current) { aktiv.current = true; setGrund(""); setZustand("lauscht"); zuhoeren(); }
          if (offen) schliessen();
          else { if (!besetzt.current) { setFrage(""); setGehoert(""); setAntwort(null); } setOffen(true); clearTimeout(zuTakt.current); }
        }}>
        <span className="pablo-zeichen__ring" />
        <span className="pablo-zeichen__wellen"><i /><i /><i /><i /></span>
        <span className="pablo-zeichen__name">Pablo</span>
      </button>
      {offen && (
        <div className={"pablo pablo--" + zustand} id="pablo" role="dialog" aria-label="Pablo"
          onMouseEnter={() => clearTimeout(zuTakt.current)} onMouseLeave={() => { if (antwort && !besetzt.current) zuPlanen(); }}>
          <div className="pablo__kopf">
            <span className="pablo__wellen" aria-hidden="true"><i /><i /><i /><i /><i /></span>
            <b>Pablo</b>
            <span className="pablo__status">{STATUS[zustand] || ""}</span>
            <button className="pablo__x" aria-label="Schliessen" title="Schliessen (Esc)" onClick={schliessen}>✕</button>
          </div>
          <div className="pablo__inhalt">
            {(frage || gehoert) && <div className="pablo__frage" id="pablo-frage">„{frage || gehoert}“</div>}
            {grund && !antwort && <div className="pablo__grund" id="pablo-grund">{grund}</div>}
            {!frage && !gehoert && !antwort && !grund && zustand === "lauscht" && (
              <div className="pablo__verstanden" id="pablo-verstanden">
                {verstanden ? <>Zuletzt verstanden: „{verstanden}“</> : "Noch nichts gehört. Sag deutlich „Pablo“ und dann die Frage."}
              </div>
            )}
            {zustand === "denkt" && <div className="pablo__punkte"><i /><i /><i /></div>}
            {antwort && <div className={"pablo__antwort" + (antwort.fehler || antwort.unklar ? " pablo__antwort--unklar" : "")} id="pablo-antwort">{antwort.text}</div>}
            {antwort && (
              <div className="pablo__knoepfe">
                {antwort.auftragId && !antwort.aktion && <button className="knopf knopf--klein" id="pablo-zeigen"
                  onClick={() => alt.balkenZeigen(antwort.auftragId, true)}>Auf der Planwand zeigen</button>}
              </div>
            )}
          </div>
          <form className="pablo__eingabe" onSubmit={(e) => { e.preventDefault(); const t = eingabe; setEingabe(""); fragen(t); }}>
            <input id="pablo-eingabe" type="text" value={eingabe} onChange={(e) => setEingabe(e.target.value)}
              onFocus={() => clearTimeout(zuTakt.current)} placeholder="Oder hier eintippen …" autoComplete="off" />
            <button className="knopf knopf--klein knopf--haupt" type="submit" disabled={!eingabe.trim()}>Fragen</button>
          </form>
        </div>
      )}
    </>
  );
}
