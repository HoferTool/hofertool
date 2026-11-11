// =================================================================
//  QMS-Cockpit: Notfallplan (seit 1.484.0). Ordner wählen, Stand, Jetzt
//  ablegen. Ablauf in src/teile/qmsPdf.js, Inhalt in notfallInhalt.js.
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { kannOrdner, geraetId, geraetName, ordnerErlaubt } from "../../teile/sicherung.js";
import { qmsOrdnerHolen, qmsOrdnerWaehlen, qmsKonfLaden, qmsKonfSpeichern, qmsAblegenUndMelden, qmsLaeuft, QMS_BEHALTEN } from "../../teile/qmsPdf.js";

const zeitText = (z) => {
  const d = z ? new Date(z) : null;
  if (!d || isNaN(d)) return "–";
  const i = alt.isoDatum(d);
  return i.slice(8, 10) + "." + i.slice(5, 7) + "." + i.slice(0, 4) + ", " + d.toTimeString().slice(0, 5) + " Uhr";
};

export default function Notfallplan() {
  const [auffrischen, setAuffrischen] = useState(0);
  const { daten, fehler } = useDaten(qmsKonfLaden, [auffrischen]);
  return (
    <section className="karte" id="qma-notfall">
      <div className="karte__kopf"><h2>Notfallplan: tägliche PDF-Kopie</h2></div>
      <p className="hinweis">Jeden Tag kommt das ganze QMS als PDF in einen Ordner, zum Beispiel auf dem Server: Handbuch und Prozesse,
        alle Listen, Kompetenzen, Auditplan mit allen Berichten und Checklisten, Managementbewertungen und Lieferantenbewertungen,
        je Tag ein Ordner „QMS JJJJ-MM-TT“ mit Unterordnern. Die App muss dafür auf dem Gerät mit dem Ordner offen sein
        (Chrome oder Edge, mit deinem Konto angemeldet); sie legt die Kopie einmal am Tag ab 5 Uhr ab.</p>
      {!daten
        ? fehler ? <p className="hinweis">{alt.fehlertext(fehler)}</p> : <div className="laedt">Wird geladen …</div>
        : <Inhalt konf={daten.konf} status={daten.status} neu={() => setAuffrischen((n) => n + 1)} />}
    </section>
  );
}

function Inhalt({ konf, status, neu }) {
  const [griff, setGriff] = useState(null);
  const [erlaubt, setErlaubt] = useState("fehlt");
  const [arbeit, setArbeit] = useState("");
  const [ergebnis, setErgebnis] = useState(null);
  const hier = konf.geraet && konf.geraet.id === geraetId();
  const behalten = Number(konf.behalten) || QMS_BEHALTEN;

  const ordnerLesen = async (h) => { setGriff(h); setErlaubt(await ordnerErlaubt(h, false)); };
  useEffect(() => { if (kannOrdner) qmsOrdnerHolen().then(ordnerLesen); }, []);

  const ordnerNeu = async () => {
    let h;
    try { h = await qmsOrdnerWaehlen(); } catch (f) { return null; }
    try { await qmsKonfSpeichern({ ...konf, geraet: { id: geraetId(), name: geraetName(), ordner: h.name } }); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return null; }
    await ordnerLesen(h);
    alt.meldung("Ordner „" + h.name + "“ gewählt. Dieses Gerät legt jetzt jeden Tag die PDF-Kopie des QMS ab.", "gut");
    neu();
    return h;
  };

  const behaltenAendern = async () => {
    const w = await alt.dialogFelder({ titel: "Wie lange behalten?", felder: [{ name: "tage", label: "Tage", typ: "number", wert: behalten }], bestaetigen: "Speichern" });
    if (!w) return;
    const t = Math.max(3, Math.min(365, Math.round(Number(w.tage) || QMS_BEHALTEN)));
    try { await qmsKonfSpeichern({ ...konf, behalten: t }); neu(); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  const jetzt = async () => {
    if (qmsLaeuft()) return;
    let h = griff;
    if (!h || (await ordnerErlaubt(h, true)) !== "granted") h = await ordnerNeu();
    if (!h) return;
    setErgebnis(null); setArbeit("QMS wird gelesen …");
    try {
      const l = await qmsAblegenUndMelden(h, { behalten,
        fortschritt: (n, alle) => setArbeit("PDF " + (n + 1) + " von " + alle + " wird abgelegt …") });
      setErgebnis({ ok: !l.fehler.length, text: l.dateien + " PDF im Ordner „" + l.ordner + "“" + (l.fehler.length ? ", " + l.fehler.length + " gingen nicht: " + l.fehler.slice(0, 2).join(" · ") : "") });
    } catch (f) {
      setErgebnis({ ok: false, text: alt.fehlertext(f) });
    }
    setArbeit("");
    await ordnerLesen(h);
    neu();
  };

  const s = status || {};
  return (<>
    <div className="qma-notfall__zeile">
      <div id="qma-notfall-ort">
        <b>Speicherort:</b> {konf.geraet ? "„" + (konf.geraet.ordner || "?") + "“ auf " + (hier ? "diesem Gerät" : konf.geraet.name || "einem anderen Gerät") : "noch kein Ordner gewählt"}
        <div className="klein">Behalten: {behalten} Tage <button className="knopf knopf--klein" id="qma-notfall-behalten" onClick={behaltenAendern}>ändern</button></div>
      </div>
      {kannOrdner
        ? <div className="knopfreihe">
            <button className="knopf knopf--klein" id="qma-notfall-ordner" onClick={ordnerNeu}>{griff && hier ? "Anderen Ordner wählen" : "Ordner wählen"}</button>
            <button className="knopf knopf--klein knopf--haupt" id="qma-notfall-jetzt" disabled={!!arbeit} onClick={jetzt}>Jetzt ablegen</button>
          </div>
        : <span className="klein">Ordner wählen geht nur in Chrome oder Edge am Computer.</span>}
    </div>
    {hier && griff && erlaubt !== "granted" && <p className="hinweis klein">Der Browser braucht die Erlaubnis für den Ordner nochmals:
      einmal „Jetzt ablegen“ drücken und „Zulassen“ wählen, am besten „Bei jedem Besuch zulassen“.</p>}
    <div id="qma-notfall-stand" className="klein">
      {s.tag ? "Zuletzt " + zeitText(s.zeit) + ": " + (s.dateien || 0) + " PDF in „" + (s.ordner || "") + "“" : "Noch keine Kopie abgelegt."}
      {s.fehler && s.fehler.length ? <div className="si-fehler">{s.fehler.slice(0, 3).join(" · ")}</div> : null}
    </div>
    {arbeit && <div className="si-auftrag si-auftrag--laeuft" id="qma-notfall-auftrag"><span className="si-dreher" aria-hidden="true" />{arbeit}</div>}
    {!arbeit && ergebnis && <div className={"si-auftrag " + (ergebnis.ok ? "si-auftrag--gut" : "si-auftrag--fehler")} id="qma-notfall-auftrag">
      {ergebnis.ok ? "✓ " : "Nicht ganz geklappt: "}{ergebnis.text}</div>}
  </>);
}
