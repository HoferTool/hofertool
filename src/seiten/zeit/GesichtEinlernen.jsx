// =================================================================
//  GESICHT EINLERNEN (seit 1.632.0, Wunsch Patrick 18. November 2026:
//  „könnten wir auch Gesichtserkennung machen?“)
//  Die Person selbst oder der Admin von HOFERTIME öffnet das Fenster,
//  setzt das Häkchen Einverständnis und nimmt Foto für Foto auf (seit
//  1.659.0 je mit Knopf, je 128 Zahlen, kein Foto wird gespeichert),
//  gespeichert über zeit_gesicht_setzen. „Löschen“ entfernt alles.
//  Gerechnet wird nur im Gerät (gesicht.js).
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { gesichtLaden, gesichtLesen, kameraStarten, kameraMoeglich, lichtHinweis, abstandZu } from "./gesicht.js";

// Seit 1.659.0 Foto für Foto mit Knopf (Patrick 20. November 2026: „man
// weiss nicht, wann er Fotos macht, könnte man die 8 Fotos einzeln
// aufnehmen?“). Die Kamera prüft dauernd, ob ein Gesicht gut zu sehen ist
// (Rahmen grün, sonst rot mit Grund, auch zum Licht), und erst dann geht
// der Knopf. Je Foto eine andere Kopfhaltung, damit das Panel die Person
// auch schräg und aus anderer Entfernung kennt.
const FOTOS = [
  "Gerade in die Kamera schauen",
  "Gerade, nochmals",
  "Kopf leicht nach links drehen",
  "Kopf leicht nach rechts drehen",
  "Kinn leicht hoch",
  "Kinn leicht runter",
  "Einen Schritt zurück, gerade schauen",
  "So, wie du sonst vor dem Panel stehst",
];
const ANZAHL = FOTOS.length;

function Fenster({ zu, personId, name }) {
  const video = useRef(null);
  const stopp = useRef(null);
  const [stand, setStand] = useState(null); // null = lädt, false = keins, {erstellt_am, anzahl}
  const [ja, setJa] = useState(false);
  const [kamera, setKamera] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [muster, setMuster] = useState([]);
  const [live, setLive] = useState({ ok: false, text: "Kamera und Erkennung starten …" });
  const [blitz, setBlitz] = useState(0);
  const letztes = useRef(null);

  const standLaden = () => alt.db.from("zeit_gesichter").select("erstellt_am, muster").eq("person_id", personId).maybeSingle()
    .then((r) => setStand(r.data ? { erstellt_am: r.data.erstellt_am, anzahl: (r.data.muster || []).length } : false),
      () => setStand(false));

  useEffect(() => {
    standLaden();
    let weg = false;
    let timer = null;
    if (!kameraMoeglich()) { setKamera("Dieses Gerät hat keine Kamera für den Browser."); return undefined; }
    kameraStarten(video.current).then((s) => { if (weg) s(); else stopp.current = s; },
      (f) => setKamera("Kamera nicht erlaubt: " + (f && f.message ? f.message : f)));
    // Dauernd prüfen, ob das Gesicht gut zu sehen ist
    const runde = async () => {
      if (weg) return;
      try {
        await gesichtLaden();
        const g = await gesichtLesen(video.current);
        letztes.current = null;
        if (!g) setLive({ ok: false, text: "Kein Gesicht zu sehen. Gerade vor die Kamera, mit Licht von vorne." });
        else if (g.anzahl > 1) setLive({ ok: false, text: "Bitte nur eine Person vor der Kamera." });
        else if (g.gross < 0.12) setLive({ ok: false, text: "Etwas näher an die Kamera." });
        else if (lichtHinweis(g.licht)) setLive({ ok: false, text: lichtHinweis(g.licht) });
        else if (g.sicher < 0.6) setLive({ ok: false, text: "Gesicht undeutlich. Ruhig halten, gerade schauen." });
        else { letztes.current = g; setLive({ ok: true, text: "Gesicht gut zu sehen." }); }
      } catch (f) {
        setKamera("Gesichtserkennung lädt nicht: " + alt.fehlertext(f));
        return;
      }
      if (!weg) timer = setTimeout(runde, 300);
    };
    runde();
    return () => { weg = true; clearTimeout(timer); if (stopp.current) stopp.current(); };
  }, []);

  function foto() {
    const g = letztes.current;
    if (!g) return;
    // Passt die neue Aufnahme gar nicht zu den bisherigen, ist es wohl
    // jemand anders oder ein Fehlbild
    if (muster.length && abstandZu(g.muster, muster) > 0.6) {
      alt.meldung("Dieses Foto passt nicht zu den anderen. Nochmals, gleiche Person allein vor der Kamera.", "warn");
      return;
    }
    setMuster((m) => [...m, g.muster]);
    setBlitz((b) => b + 1);
  }

  async function speichern() {
    setLaeuft(true);
    try {
      const r = await alt.db.rpc("zeit_gesicht_setzen", { p_person: personId, p_muster: muster });
      if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
      alt.meldung("Gesicht eingelernt.", "gut");
      setMuster([]);
      standLaden();
    } catch (f) {
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
      <div className="ze-gesicht__fotos" id="ze-gesicht-fotos">
        {FOTOS.map((t, i) => <span key={i} title={t} className={"ze-gesicht__punkt" + (i < muster.length ? " ze-gesicht__punkt--da" : i === muster.length ? " ze-gesicht__punkt--jetzt" : "")}>{i < muster.length ? "✓" : i + 1}</span>)}
      </div>
      {muster.length < ANZAHL
        ? <p className="ze-gesicht__auftrag" id="ze-gesicht-auftrag"><b>Foto {muster.length + 1} von {ANZAHL}:</b> {FOTOS[muster.length]}</p>
        : <p className="ze-gesicht__auftrag" id="ze-gesicht-auftrag"><b>Alle {ANZAHL} Fotos aufgenommen.</b> Jetzt speichern.</p>}
      <div className={"ze-gesicht__bild" + (kamera ? "" : live.ok ? " ze-gesicht__bild--ok" : " ze-gesicht__bild--nein")}>
        <video ref={video} playsInline muted autoPlay />
        {blitz > 0 && <span key={blitz} className="ze-gesicht__blitz" />}
        {kamera && <div className="ze-gesicht__hinweis">{kamera}</div>}
      </div>
      {!kamera && <p className={"ze-gesicht__text" + (live.ok ? " ze-gesicht__text--ok" : "")} id="ze-gesicht-text">{live.text}</p>}
      <label className="ze-gesicht__ja">
        <input type="checkbox" checked={ja} onChange={(e) => setJa(e.target.checked)} id="ze-gesicht-ja" />
        <span>{name} ist einverstanden, dass das Gesichtsmuster für die Zeiterfassung gespeichert wird.</span>
      </label>
      <div className="dialog__knoepfe">
        {stand && !muster.length && <button className="knopf knopf--gefahr" id="ze-gesicht-weg" onClick={loeschen} disabled={laeuft}>Löschen</button>}
        {muster.length > 0 && <button className="knopf" id="ze-gesicht-neu" onClick={() => setMuster([])} disabled={laeuft}>Von vorne</button>}
        {muster.length > 0 && muster.length < ANZAHL && <button className="knopf" id="ze-gesicht-zurueck" onClick={() => setMuster((m) => m.slice(0, -1))} disabled={laeuft}>Letztes weg</button>}
        <button className="knopf" onClick={zu}>Schliessen</button>
        {muster.length < ANZAHL
          ? <button className="knopf knopf--haupt" id="ze-gesicht-auf" disabled={!ja || laeuft || !!kamera || !live.ok} onClick={foto}>
            📸 Foto {muster.length + 1} aufnehmen</button>
          : <button className="knopf knopf--haupt" id="ze-gesicht-speichern" disabled={!ja || laeuft} onClick={speichern}>Speichern</button>}
      </div>
    </div>);
}

export function gesichtOeffnen(personId, name) {
  fensterOeffnen((zu) => <Fenster zu={zu} personId={personId} name={name} />);
}
