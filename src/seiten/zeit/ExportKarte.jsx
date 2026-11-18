// =================================================================
//  HOFERTIME → Auswertung: Karte für den täglichen Excel-Export auf den
//  Server (seit 1.627.0). Ordner wählen, Stand, Jetzt ablegen. Ablauf in
//  src/teile/zeitExport.js, aufgebaut wie der Notfallplan des QMS.
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { kannOrdner, geraetId, geraetName, ordnerErlaubt } from "../../teile/sicherung.js";
import {
  zeitOrdnerHolen, zeitOrdnerWaehlen, zeitKonfLaden, zeitKonfSpeichern, zeitExportUndMelden, zeitExportLaeuft, ZEIT_BEHALTEN,
} from "../../teile/zeitExport.js";

const zeitText = (z) => {
  const d = z ? new Date(z) : null;
  if (!d || isNaN(d)) return "–";
  const i = alt.isoDatum(d);
  return i.slice(8, 10) + "." + i.slice(5, 7) + "." + i.slice(0, 4) + ", " + d.toTimeString().slice(0, 5) + " Uhr";
};

export default function ExportKarte() {
  const [auffrischen, setAuffrischen] = useState(0);
  const { daten, fehler } = useDaten(zeitKonfLaden, [auffrischen]);
  return (
    <section className="karte ze-export" id="ze-export">
      <h3>Täglicher Excel-Export auf den Server</h3>
      <p className="klein">Jeden Tag kommt „HOFERTIME JJJJ-MM-TT.xlsx“ mit dem ganzen Jahr (Übersicht, alle Tage, Abteilungen, Monate)
        in einen Ordner, zum Beispiel auf dem Server. Die App muss dafür auf dem Gerät mit dem Ordner offen sein (Chrome oder Edge,
        mit einem Admin-Konto angemeldet); sie legt die Datei einmal am Tag ab 5 Uhr ab. Die Sicherung aller Zeiten steckt schon in
        der täglichen Sicherung des HoferTools (Einstellungen → Backup).</p>
      {!daten
        ? fehler ? <p className="klein">{alt.fehlertext(fehler)}</p> : <div className="laedt">Wird geladen …</div>
        : <Inhalt konf={daten.konf} status={daten.status} neu={() => setAuffrischen((n) => n + 1)} />}
    </section>
  );
}

function Inhalt({ konf, status, neu }) {
  const [griff, setGriff] = useState(null);
  const [erlaubt, setErlaubt] = useState("fehlt");
  const [arbeit, setArbeit] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);
  const hier = konf.geraet && konf.geraet.id === geraetId();
  const behalten = Number(konf.behalten) || ZEIT_BEHALTEN;

  const ordnerLesen = async (h) => { setGriff(h); setErlaubt(await ordnerErlaubt(h, false)); };
  useEffect(() => { if (kannOrdner) zeitOrdnerHolen().then(ordnerLesen); }, []);

  const ordnerNeu = async () => {
    let h;
    try { h = await zeitOrdnerWaehlen(); } catch (f) { return null; }
    try { await zeitKonfSpeichern({ ...konf, geraet: { id: geraetId(), name: geraetName(), ordner: h.name } }); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return null; }
    await ordnerLesen(h);
    alt.meldung("Ordner „" + h.name + "“ gewählt. Dieses Gerät legt jetzt jeden Tag den Excel-Export ab.", "gut");
    neu();
    return h;
  };

  const behaltenAendern = async () => {
    const w = await alt.dialogFelder({ titel: "Wie lange behalten?", felder: [{ name: "tage", label: "Tage", typ: "number", wert: behalten }], bestaetigen: "Speichern" });
    if (!w) return;
    const t = Math.max(3, Math.min(3650, Math.round(Number(w.tage) || ZEIT_BEHALTEN)));
    try { await zeitKonfSpeichern({ ...konf, behalten: t }); neu(); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  const jetzt = async () => {
    if (zeitExportLaeuft()) return;
    let h = griff;
    if (!h || (await ordnerErlaubt(h, true)) !== "granted") h = await ordnerNeu();
    if (!h) return;
    setErgebnis(null); setArbeit(true);
    try {
      const l = await zeitExportUndMelden(h, { behalten });
      setErgebnis({ ok: true, text: "„" + l.datei + "“ mit " + l.personen + " Personen abgelegt" });
    } catch (f) { setErgebnis({ ok: false, text: alt.fehlertext(f) }); }
    setArbeit(false);
    await ordnerLesen(h);
    neu();
  };

  const s = status || {};
  return (<>
    <div className="qma-notfall__zeile">
      <div id="ze-export-ort">
        <b>Speicherort:</b> {konf.geraet ? "„" + (konf.geraet.ordner || "?") + "“ auf " + (hier ? "diesem Gerät" : konf.geraet.name || "einem anderen Gerät") : "noch kein Ordner gewählt"}
        <div className="klein">Behalten: {behalten} Tage <button className="knopf knopf--klein" id="ze-export-behalten" onClick={behaltenAendern}>ändern</button></div>
      </div>
      {kannOrdner
        ? <div className="knopfreihe">
          <button className="knopf knopf--klein" id="ze-export-ordner" onClick={ordnerNeu}>{griff && hier ? "Anderen Ordner wählen" : "Ordner wählen"}</button>
          <button className="knopf knopf--klein knopf--haupt" id="ze-export-jetzt" disabled={arbeit} onClick={jetzt}>Jetzt ablegen</button>
        </div>
        : <span className="klein">Ordner wählen geht nur in Chrome oder Edge am Computer.</span>}
    </div>
    {hier && griff && erlaubt !== "granted" && <p className="klein">Der Browser braucht die Erlaubnis für den Ordner nochmals:
      einmal „Jetzt ablegen“ drücken und „Zulassen“ wählen, am besten „Bei jedem Besuch zulassen“.</p>}
    <div id="ze-export-stand" className="klein">
      {s.tag ? "Zuletzt " + zeitText(s.zeit) + ": „" + (s.datei || "") + "“" : "Noch kein Export abgelegt."}
      {s.fehler ? <div className="si-fehler">{s.fehler}</div> : null}
    </div>
    {arbeit && <div className="si-auftrag si-auftrag--laeuft"><span className="si-dreher" aria-hidden="true" />Excel wird erstellt …</div>}
    {!arbeit && ergebnis && <div className={"si-auftrag " + (ergebnis.ok ? "si-auftrag--gut" : "si-auftrag--fehler")} id="ze-export-auftrag">
      {ergebnis.ok ? "✓ " : "Nicht geklappt: "}{ergebnis.text}</div>}
  </>);
}
