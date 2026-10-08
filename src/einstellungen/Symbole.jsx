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
import { symbole, symboleLaden, symboleSpeichern, symbolSpalte } from "../daten/symbole.js";
import { Gruppe } from "./teile.jsx";

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

export default function Symbole() {
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
        text={"Ein Bild mit einer kurzen Erklärung. Im Auftragsfenster unter „Symbol auf dem Balken“ "
          + "lässt es sich einem Auftrag geben. Es steht dann auf dem Balken hinter der HOCO Nr.; "
          + "wer mit der Maus darüberfährt, sieht Bild und Erklärung."}>
        {!symbolSpalte() && <p className="hinweis" id="sym-sql">Damit Aufträge ein Symbol bekommen
          können, muss einmal <b>sql/plan-symbole.sql</b> im Supabase SQL Editor laufen. Anlegen geht schon jetzt.</p>}
        <div className="sym-liste" id="sym-liste">
          {!liste.length && <p className="gedaempft">Noch keine Symbole angelegt.</p>}
          {liste.map((s, i) => <SymbolZeile key={s.id} s={s} beschaeftigt={beschaeftigt}
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

function SymbolZeile({ s, aendern, loeschen, beschaeftigt }) {
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
      <button type="button" className="knopf knopf--klein knopf--gefahr" title="Symbol löschen"
        disabled={beschaeftigt} onClick={loeschen}>Löschen</button>
    </div>
  );
}
