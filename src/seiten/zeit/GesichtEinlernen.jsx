// =================================================================
//  GESICHT EINLERNEN (seit 1.632.0, Wunsch Patrick 18. November 2026:
//  „könnten wir auch Gesichtserkennung machen?“)
//  Die Person selbst oder der Admin von HOFERTIME öffnet das Fenster,
//  setzt das Häkchen Einverständnis und tippt „Aufnehmen“: die Kamera
//  nimmt in rund drei Sekunden 6 Muster auf (je 128 Zahlen, kein Foto),
//  gespeichert über zeit_gesicht_setzen. „Löschen“ entfernt alles.
//  Gerechnet wird nur im Gerät (gesicht.js).
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { gesichtLaden, gesichtLesen, kameraStarten, kameraMoeglich } from "./gesicht.js";

const ANZAHL = 6;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

function Fenster({ zu, personId, name }) {
  const video = useRef(null);
  const stopp = useRef(null);
  const [stand, setStand] = useState(null); // null = lädt, false = keins, {erstellt_am, anzahl}
  const [ja, setJa] = useState(false);
  const [kamera, setKamera] = useState("");
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const standLaden = () => alt.db.from("zeit_gesichter").select("erstellt_am, muster").eq("person_id", personId).maybeSingle()
    .then((r) => setStand(r.data ? { erstellt_am: r.data.erstellt_am, anzahl: (r.data.muster || []).length } : false),
      () => setStand(false));

  useEffect(() => {
    standLaden();
    let weg = false;
    if (!kameraMoeglich()) { setKamera("Dieses Gerät hat keine Kamera für den Browser."); return undefined; }
    kameraStarten(video.current).then((s) => { if (weg) s(); else stopp.current = s; },
      (f) => setKamera("Kamera nicht erlaubt: " + (f && f.message ? f.message : f)));
    gesichtLaden().catch((f) => setKamera("Gesichtserkennung lädt nicht: " + alt.fehlertext(f)));
    return () => { weg = true; if (stopp.current) stopp.current(); };
  }, []);

  async function aufnehmen() {
    setLaeuft(true);
    const muster = [];
    let versuche = 0;
    setText("Bitte gerade in die Kamera schauen …");
    try {
      await gesichtLaden();
      while (muster.length < ANZAHL && versuche < 40) {
        versuche++;
        const g = await gesichtLesen(video.current);
        if (!g) setText("Kein Gesicht zu sehen. Näher hin und gut beleuchtet.");
        else if (g.anzahl > 1) setText("Bitte nur eine Person vor der Kamera.");
        else if (g.gross < 0.18) setText("Etwas näher an die Kamera.");
        else { muster.push(g.muster); setText("Aufgenommen " + muster.length + " von " + ANZAHL + " … Kopf leicht bewegen."); }
        await warte(350);
      }
      if (muster.length < ANZAHL) { setText("Hat nicht geklappt. Nochmals versuchen, näher und mit mehr Licht."); return; }
      const r = await alt.db.rpc("zeit_gesicht_setzen", { p_person: personId, p_muster: muster });
      if (r.error) { setText(""); alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
      setText("");
      alt.meldung("Gesicht eingelernt.", "gut");
      standLaden();
    } catch (f) {
      setText("");
      alt.meldung("Gesichtserkennung: " + alt.fehlertext(f), "fehler");
    } finally {
      setLaeuft(false);
    }
  }

  async function loeschen() {
    const ok = await alt.nachfragen({ titel: "Gesicht löschen?", text: "Das gespeicherte Muster von " + name + " wird gelöscht. Am Panel tippt die Person dann wieder auf den Namen.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const r = await alt.db.rpc("zeit_gesicht_loeschen", { p_person: personId });
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    alt.meldung("Gelöscht.", "gut");
    standLaden();
  }

  return (
    <div className="dialog ze-gesicht" role="dialog" aria-modal="true" id="ze-gesicht">
      <button className="dialog__x" aria-label="Schliessen" onClick={zu}>✕</button>
      <h2>Gesicht für {name}</h2>
      <p className="klein">Am Stempel-Panel erkennt die Kamera die Person und wählt sie von selbst. Stempeln geht weiter
        nur mit Drücken auf Kommen oder Gehen. Gespeichert wird kein Foto, nur ein Zahlenmuster, aus dem sich kein Bild
        zurückrechnen lässt. Gerechnet wird nur auf dem Gerät.</p>
      <p id="ze-gesicht-stand">{stand === null ? "Wird geladen …"
        : stand ? "Eingelernt am " + alt.kurzDatum(alt.isoDatum(new Date(stand.erstellt_am))) + " (" + stand.anzahl + " Aufnahmen)."
        : "Noch nicht eingelernt."}</p>
      <div className="ze-gesicht__bild">
        <video ref={video} playsInline muted autoPlay />
        {kamera && <div className="ze-gesicht__hinweis">{kamera}</div>}
      </div>
      {text && <p className="ze-gesicht__text" id="ze-gesicht-text">{text}</p>}
      <label className="ze-gesicht__ja">
        <input type="checkbox" checked={ja} onChange={(e) => setJa(e.target.checked)} id="ze-gesicht-ja" />
        <span>{name} ist einverstanden, dass das Gesichtsmuster für die Zeiterfassung gespeichert wird.</span>
      </label>
      <div className="dialog__knoepfe">
        {stand && <button className="knopf knopf--gefahr" id="ze-gesicht-weg" onClick={loeschen} disabled={laeuft}>Löschen</button>}
        <button className="knopf" onClick={zu}>Schliessen</button>
        <button className="knopf knopf--haupt" id="ze-gesicht-auf" disabled={!ja || laeuft || !!kamera} onClick={aufnehmen}>
          {stand ? "Neu aufnehmen" : "Aufnehmen"}</button>
      </div>
    </div>);
}

export function gesichtOeffnen(personId, name) {
  fensterOeffnen((zu) => <Fenster zu={zu} personId={personId} name={name} />);
}
