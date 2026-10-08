// =================================================================
//  EINSTELLUNGEN → SYMBOLE (nur Admins)
//  Kleine Bilder mit einer Erklärung, zum Beispiel „Kack Teili“. Im
//  Auftragsfenster lassen sie sich einem Auftrag geben; sie stehen
//  dann auf dem Balken hinter der HOCO Nr., und wer darüberfährt,
//  sieht Bild und Erklärung (Wunsch Patrick 8. Oktober 2026).
//  Gespeichert in app_config.plan_symbole, siehe daten/symbole.js.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { zuschneiden } from "../teile/Zuschnitt.jsx";
import { symbole, symboleLaden, symboleSpeichern, symbolSpalte, symbolAnwendenStart } from "../daten/symbole.js";
import { Gruppe } from "./teile.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";

// Smiley-Knopf auf der Planwand (nur Admins, Wunsch Patrick 8. Oktober
// 2026): derselbe Inhalt wie der Reiter, als eigenes Fenster
export function symboleFensterOeffnen() {
  if (document.querySelector(".dialog--symbole")) return;
  alt.plan.imDialog = true;
  fensterOeffnen((zu) => (
    <div className="dialog dialog--breit dialog--symbole">
      {/* Anwenden: Fenster zu, dann den Balken anklicken */}
      <Symbole anwenden={(id) => { zu(); symbolAnwendenStart(id, alt.plan.behaelter); }} />
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" id="sym-zu" onClick={zu}>Schliessen</button>
      </div>
    </div>
  ), () => { alt.plan.imDialog = false; });
}

// Bild wählen und quadratisch zuschneiden, als kleine PNG-Adresse
async function bildWaehlen() {
  const eingabe = document.createElement("input");
  eingabe.type = "file";
  eingabe.accept = "image/*";
  const datei = await new Promise((fertig) => {
    eingabe.onchange = () => fertig((eingabe.files || [])[0] || null);
    eingabe.click();
  });
  if (!datei) return null;
  return zuschneiden(datei, { kante: 96, ganz: true, format: "image/png", alsText: true });
}

export default function Symbole({ anwenden }) {
  const [liste, setListe] = useState(null);
  const [neuText, setNeuText] = useState("");
  const [neuBild, setNeuBild] = useState(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);

  useEffect(() => { symboleLaden().then(() => setListe(symbole().slice())); }, []);

  const ablegen = async (neu, text) => {
    setBeschaeftigt(true);
    try {
      await symboleSpeichern(neu);
      setListe(neu.slice());
      if (text) alt.meldung(text, "gut");
      // Die Wand zeigt die Symbole gleich, ohne Neuladen
      if (document.getElementById("pw-inhalt") && alt.plan.behaelter) alt.neuZeichnen(alt.plan.behaelter);
      return true;
    } catch (f) {
      alt.meldung(alt.fehlertext(f), "fehler");
      return false;
    } finally { setBeschaeftigt(false); }
  };

  const anlegen = async () => {
    if (!neuBild) { alt.meldung("Bitte zuerst ein Bild wählen.", "warn"); return; }
    if (!neuText.trim()) { alt.meldung("Bitte eine Erklärung eintragen.", "warn"); return; }
    const s = { id: "s" + Date.now().toString(36), bild: neuBild, text: neuText.trim() };
    if (await ablegen([...(liste || []), s], "Symbol angelegt.")) { setNeuText(""); setNeuBild(null); }
  };

  if (!liste) return <div className="laedt">Wird geladen …</div>;
  return (
    <>
      <Gruppe titel="Symbole auf den Balken"
        text={"Ein Bild mit einer kurzen Erklärung. „Anwenden“ und dann den Auftrag auf der Planwand "
          + "anklicken: Das Symbol steht danach auf dem Balken hinter der HOCO Nr.; wer mit der Maus "
          + "darüberfährt, sieht Bild und Erklärung. Doppelklick auf das Symbol am Balken nimmt es wieder weg."}>
        {!symbolSpalte() && <p className="hinweis" id="sym-sql">Damit Aufträge ein Symbol bekommen
          können, muss einmal <b>sql/plan-symbole.sql</b> im Supabase SQL Editor laufen. Anlegen geht schon jetzt.</p>}
        <div className="sym-liste" id="sym-liste">
          {!liste.length && <p className="gedaempft">Noch keine Symbole angelegt.</p>}
          {liste.map((s, i) => <SymbolZeile key={s.id} s={s} beschaeftigt={beschaeftigt} anwenden={anwenden}
            aendern={(neu) => ablegen(liste.map((x, k) => (k === i ? { ...x, ...neu } : x)), "Gespeichert.")}
            loeschen={async () => {
              const ok = await alt.nachfragen({ titel: "Symbol löschen",
                text: "„" + s.text + "“ wird gelöscht und verschwindet von allen Balken.",
                bestaetigen: "Löschen", gefahr: true });
              if (ok) ablegen(liste.filter((x) => x.id !== s.id), "Symbol gelöscht.");
            }} />)}
        </div>
        <div className="sym-neu" id="sym-neu">
          <button type="button" className="sym-bild" id="sym-neu-bild" title="Bild wählen"
            onClick={async () => { const b = await bildWaehlen(); if (b) setNeuBild(b); }}>
            {neuBild ? <img src={neuBild} alt="" /> : <span>Bild wählen</span>}</button>
          <input type="text" id="sym-neu-text" maxLength={80} placeholder="Erklärung, z. B. Kack Teili"
            value={neuText} onChange={(e) => setNeuText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") anlegen(); }} />
          <button type="button" className="knopf knopf--haupt" id="sym-anlegen" disabled={beschaeftigt}
            onClick={anlegen}>Symbol anlegen</button>
        </div>
      </Gruppe>
    </>
  );
}

function SymbolZeile({ s, aendern, loeschen, beschaeftigt, anwenden }) {
  const [text, setText] = useState(s.text);
  const gemerkt = useRef(s.text);
  const textFest = () => {
    const t = text.trim();
    if (!t) { setText(gemerkt.current); return; }
    if (t === gemerkt.current) return;
    gemerkt.current = t;
    aendern({ text: t });
  };
  return (
    <div className="sym-zeile" data-symbol={s.id}>
      <button type="button" className="sym-bild" title="Anderes Bild wählen" disabled={beschaeftigt}
        onClick={async () => { const b = await bildWaehlen(); if (b) aendern({ bild: b }); }}>
        <img src={s.bild} alt="" /></button>
      <input type="text" maxLength={80} value={text} onChange={(e) => setText(e.target.value)}
        onBlur={textFest} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      {anwenden && <button type="button" className="knopf knopf--klein knopf--haupt" data-symanwenden={s.id}
        title="Dann den Auftrag auf der Planwand anklicken" disabled={beschaeftigt}
        onClick={() => anwenden(s.id)}>Anwenden</button>}
      <button type="button" className="knopf knopf--klein knopf--gefahr" title="Symbol löschen"
        disabled={beschaeftigt} onClick={loeschen}>Löschen</button>
    </div>
  );
}
