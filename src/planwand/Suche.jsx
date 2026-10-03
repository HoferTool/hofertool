// =================================================================
//  SUCHE AUF DER PLANWAND
//  Das Fenster „Auf der Planwand suchen“ und die Leiste unten mit
//  Weiter, Zurück und „Suche beenden“, solange eine Suche läuft.
//  Welche Aufträge passen und wohin gesprungen wird, rechnet weiter
//  das alte Programm (sucheStarten, sucheZumTreffer).
// =================================================================
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";

const ZEITRAUM = [["alle", "Ganze Planung"], ["abheute", "Ab heute"],
                  ["vorher", "Vor heute"], ["datum", "Ab Datum"]];
const REIHE = [["neu", "Neuester Auftrag zuerst"], ["alt", "Ältester Auftrag zuerst"]];

export function sucheDialog(b) {
  fensterOeffnen((zu) => <SucheFenster b={b} zu={zu} />);
}

function SucheFenster({ b, zu }) {
  const plan = alt.plan;
  const [text, setText] = useState(plan.letzteSuche || "");
  const [zeit, setZeit] = useState("alle");
  const [datum, setDatum] = useState("");
  const [reihe, setReihe] = useState(plan.sucheReihe || "neu");

  const zeitWaehlen = (w) => {
    setZeit(w);
    if (w === "datum" && !datum) setDatum(alt.isoDatum(new Date()));
  };
  const suchen = async () => {
    const t = text.trim();
    if (!t) { alt.meldung("Bitte einen Suchbegriff eingeben.", "warn"); return; }
    zu();
    plan.sucheZeit = { art: zeit, datum: datum || null };
    plan.sucheReihe = reihe;
    plan.trefferNr = 0;
    await alt.sucheStarten(t, b);
  };

  return (
    <div className="dialog">
      <h2>Auf der Planwand suchen</h2>
      <p className="klein">Gesucht wird in allem: Nummer, Maschine, Notiz, Material,
        Menge, Farbe, Zustand, Problem, FA und Material vorhanden.</p>
      <label className="feld"><span>Suchbegriff</span>
        <input type="text" id="su-text" data-fokus="" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") suchen(); }} /></label>

      <div className="feld"><span className="feldlabel">Zeitraum</span>
        <div className="su-zeitgitter" id="su-zeitwahl">
          {ZEITRAUM.map(([w, t]) => (
            <button key={w} type="button" className={"wahlknopf" + (zeit === w ? " aktiv" : "")}
              data-suzeit={w} onClick={() => zeitWaehlen(w)}>{t}</button>
          ))}
        </div>
        {/* Nur bei „Ab Datum“. Mit hidden ging es nicht: display: flex
            aus dem Stil hat das Feld trotzdem gezeigt. */}
        {zeit === "datum" && <div className="su-datumsteil" id="su-datumsteil">
          <input type="date" id="su-datum" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </div>}
      </div>

      {/* In welcher Reihenfolge die Treffer kommen — weiter und zurück
          geht es danach in der Leiste unten */}
      <div className="feld"><span className="feldlabel">Reihenfolge</span>
        <div className="moduswahl" id="su-reihe">
          {REIHE.map(([w, t]) => (
            <button key={w} type="button" className={"moduswahl__knopf" + (reihe === w ? " aktiv" : "")}
              data-sureihe={w} onClick={() => setReihe(w)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" id="su-nein" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" id="su-ja" onClick={suchen}>Suchen</button>
      </div>
    </div>
  );
}

// ---------- Leiste unten, solange eine Suche läuft ----------

let leiste = null;   // { el, wurzel }

// Enter springt zum nächsten Treffer, Umschalt + Enter zurück. Gilt,
// solange die Suche läuft und kein Fenster offen ist.
let tasteDa = false;
function tasteAnmelden() {
  if (tasteDa) return;
  tasteDa = true;
  document.addEventListener("keydown", (e) => {
    const plan = alt.plan;
    if (e.key !== "Enter" || !plan.sucheAktiv) return;
    if (document.querySelector(".dialog-huelle")) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    e.preventDefault();
    alt.sucheZumTreffer(plan.trefferNr + (e.shiftKey ? -1 : 1), plan.behaelter);
  });
}

export function sucheLeisteZeigen(b, ziel) {
  tasteAnmelden();
  if (!leiste || !leiste.el.isConnected) {
    const el = document.createElement("div");
    el.id = "su-leiste";
    el.className = "su-leiste";
    document.body.appendChild(el);
    leiste = { el, wurzel: createRoot(el) };
  }
  flushSync(() => leiste.wurzel.render(<SuchLeiste b={b} ziel={ziel} />));
}

export function sucheLeisteWeg() {
  if (!leiste) return;
  const { el, wurzel } = leiste;
  leiste = null;
  el.remove();
  queueMicrotask(() => wurzel.unmount());
}

function SuchLeiste({ b, ziel }) {
  const plan = alt.plan;
  const anzahl = (plan.trefferListe || []).length;
  const reihe = (plan.sucheReihe || "neu") === "neu" ? "neuester zuerst" : "ältester zuerst";
  return (
    <>
      <span className="su-leiste__text">
        {plan.letzteSuche + " · " + reihe + " · Treffer " + (plan.trefferNr + 1) + " von " + anzahl
          + " · " + ziel.job_number}
      </span>
      {anzahl > 1 && <>
        <button type="button" className="knopf knopf--klein" id="su-zurueck" title="Umschalt + Enter"
          onClick={() => alt.sucheZumTreffer(plan.trefferNr - 1, b)}>‹ Zurück</button>
        <button type="button" className="knopf knopf--klein" id="su-weiter" title="Enter"
          onClick={() => alt.sucheZumTreffer(plan.trefferNr + 1, b)}>Weiter ›</button>
      </>}
      <button type="button" className="knopf knopf--klein" id="su-ende"
        onClick={() => alt.sucheBeenden()}>Suche beenden</button>
    </>
  );
}
