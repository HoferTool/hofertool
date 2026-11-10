// =================================================================
//  Diktat (seit 1.470.0, Wunsch Patrick 10. November 2026: „für die
//  Textbereiche eine Spracherkennung, damit ich auf dem iPad nicht tippen
//  muss“). Knopf mit Mikrofon neben einem Textfeld: antippen hört zu und
//  schreibt das Gesprochene ans Ende des Felds, nochmals antippen hört auf.
//  Nur solange der Knopf rot ist, hört das Gerät zu (kein dauerndes
//  Mithören wie früher bei Pablo). Spracherkennung des Browsers (Safari
//  und Chrome, webkitSpeechRecognition); fehlt sie, gibt es keinen Knopf,
//  dann bleibt das Mikrofon auf der Tastatur des iPads.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";

const Erkennung = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const diktatMoeglich = () => !!(Erkennung || (window.TEST && window.TEST.diktat));

let laufend = null; // immer nur ein Feld hört zu

export function DiktatKnopf({ wert, setzen, gesperrt }) {
  const [an, setAn] = useState(false);
  const r = useRef(null);
  const zustand = useRef({ basis: "", fertig: "", aktiv: false });
  const wertJetzt = useRef(wert);
  wertJetzt.current = wert;
  const setzenJetzt = useRef(setzen);
  setzenJetzt.current = setzen;

  useEffect(() => () => stopp(), []);

  if (!diktatMoeglich()) return null;

  function zusammen(zwischen) {
    const z = zustand.current;
    const neu = [z.fertig, zwischen].filter((x) => x && x.trim()).join(" ").trim();
    const b = z.basis;
    return b && neu ? b.replace(/\s*$/, "") + (/[.!?:]$/.test(b.trim()) ? " " : " ") + neu : (b || "") + neu;
  }

  function stopp() {
    const z = zustand.current;
    z.aktiv = false;
    if (r.current) { try { r.current.stop(); } catch { /* schon aus */ } }
    r.current = null;
    if (laufend === stopp) laufend = null;
    setAn(false);
  }

  function start() {
    if (laufend) laufend();
    const z = zustand.current;
    z.basis = wertJetzt.current || ""; z.fertig = ""; z.aktiv = true;
    laufend = stopp;
    setAn(true);
    if (window.TEST && window.TEST.diktat) { window.TEST.diktatSagen = (t) => { z.fertig = [z.fertig, t].join(" ").trim(); setzenJetzt.current(zusammen("")); }; return; }
    const neu = () => {
      const e = new Erkennung();
      e.lang = "de-CH";
      e.continuous = true;
      e.interimResults = true;
      e.onresult = (ev) => {
        let zwischen = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) z.fertig = [z.fertig, t.trim()].join(" ").trim();
          else zwischen += t;
        }
        setzenJetzt.current(zusammen(zwischen));
      };
      e.onerror = (ev) => {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          alt.meldung("Mikrofon nicht erlaubt. In den Einstellungen des iPads unter Safari das Mikrofon erlauben, oder das Mikrofon auf der Tastatur nehmen.", "warn");
          stopp();
        } else if (ev.error === "language-not-supported") {
          e.lang = "de-DE";
        }
      };
      // Safari hört nach einer Pause von selbst auf: weiterhören, bis der Knopf gedrückt wird
      e.onend = () => {
        if (!z.aktiv) return;
        z.basis = zusammen(""); z.fertig = "";
        try { r.current = neu(); r.current.start(); } catch { stopp(); }
      };
      return e;
    };
    try { r.current = neu(); r.current.start(); }
    catch (f) { alt.meldung("Spracherkennung startet nicht: " + alt.fehlertext(f), "warn"); stopp(); }
  }

  return (
    <button type="button" className={"diktat" + (an ? " diktat--an" : "")} disabled={gesperrt} data-diktat={an ? "an" : "aus"}
      aria-label={an ? "Diktat beenden" : "Diktieren"} title={an ? "Diktat beenden" : "Diktieren: sprechen statt tippen"}
      onClick={() => (an ? stopp() : start())}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" /></svg>
      <span>{an ? "Stopp" : "Diktat"}</span>
    </button>
  );
}
