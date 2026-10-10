// =================================================================
//  EINSTELLUNGEN · Planwand-Archiv (seit 1.22.0)
//  Jeden Tag eine Datei mit der ganzen Planwand in einem eigenen Ordner,
//  zum Öffnen im Browser und Nachschauen, wie es war (Wunsch Patrick,
//  10. Oktober 2026). Nicht zum Zurückspielen, dafür ist die Sicherung
//  da. Ablauf in src/teile/planwandArchiv.js.
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { Gruppe, Zeile } from "./teile.jsx";
import { kannOrdner, geraetId, geraetName, ordnerErlaubt, wannAusName } from "../teile/sicherung.js";
import {
  archivOrdnerHolen, archivOrdnerWaehlen, archivListe, archivKonfLaden, archivKonfSpeichern,
  archivSchreibenUndMelden, archivLaeuft,
} from "../teile/planwandArchiv.js";

function datumText(d) {
  if (!d || isNaN(d)) return "–";
  const z = (n) => String(n).padStart(2, "0");
  return z(d.getDate()) + "." + z(d.getMonth() + 1) + "." + d.getFullYear() + ", " + z(d.getHours()) + ":" + z(d.getMinutes()) + " Uhr";
}
const groesse = (kb) => (kb >= 1024 ? String(Math.round(kb / 102.4) / 10).replace(".", ",") + " MB" : (kb || 1) + " KB");

export default function PlanwandArchiv() {
  const [auffrischen, setAuffrischen] = useState(0);
  const { daten, fehler } = useDaten(archivKonfLaden, [auffrischen]);
  if (!daten) {
    return (
      <Gruppe titel="Planwand-Archiv" id="pa">
        {fehler ? <p className="hinweis">{alt.fehlertext(fehler)}</p> : <div className="laedt">Wird geladen …</div>}
      </Gruppe>
    );
  }
  return <Inhalt konf={daten.konf} status={daten.status} neu={() => setAuffrischen((n) => n + 1)} />;
}

function Inhalt({ konf, status, neu }) {
  const admin = alt.darfDokumenteUndSicherung();
  const [stunde, setStunde] = useState(konf.stunde ?? 18);
  const [behalten, setBehalten] = useState(konf.behalten || 90);
  const [griff, setGriff] = useState(null);
  const [erlaubt, setErlaubt] = useState("fehlt");
  const [liste, setListe] = useState(null);
  const [arbeit, setArbeit] = useState("");
  const [ergebnis, setErgebnis] = useState(null);
  const hier = konf.geraet && konf.geraet.id === geraetId();

  const ordnerLesen = async (h) => {
    const s = await ordnerErlaubt(h, false);
    setGriff(h); setErlaubt(s);
    if (s === "granted") { try { setListe(await archivListe(h)); } catch (f) { setListe(null); } }
  };
  useEffect(() => { if (kannOrdner) archivOrdnerHolen().then(ordnerLesen); }, []);

  const speichern = async (extra) => {
    const neuKonf = Object.assign({}, konf, { stunde: Number(stunde), behalten: Number(behalten) }, extra || {});
    await archivKonfSpeichern(neuKonf);
    return neuKonf;
  };

  // Ordner wählen macht dieses Gerät zum Archivgerät
  const ordnerNeu = async () => {
    let h;
    try { h = await archivOrdnerWaehlen(); } catch (f) { return null; }
    try { await speichern({ geraet: { id: geraetId(), name: geraetName(), ordner: h.name } }); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return null; }
    await ordnerLesen(h);
    alt.meldung("Ordner „" + h.name + "“ gewählt. Dieses Gerät schreibt jetzt jeden Tag die Planwand-Datei.", "gut");
    neu();
    return h;
  };

  const jetzt = async () => {
    if (archivLaeuft()) return;
    let h = griff;
    if (!h || (await ordnerErlaubt(h, true)) !== "granted") h = await ordnerNeu();
    if (!h) return;
    setErgebnis(null); setArbeit("Planwand wird gelesen …");
    try {
      const l = await archivSchreibenUndMelden(h, Number(behalten));
      setErgebnis({ ok: true, text: "Gespeichert: " + l.datei + " (" + groesse(l.kb) + ", " + alt.zahlText(l.auftraege) + " Aufträge)" });
    } catch (f) {
      setErgebnis({ ok: false, text: alt.fehlertext(f) });
    }
    setArbeit("");
    await ordnerLesen(h);
    neu();
  };

  // Eine Datei aus dem Ordner gleich hier ansehen
  const oeffnen = async (name) => {
    try {
      const f = await (await griff.getFileHandle(name)).getFile();
      const url = URL.createObjectURL(new Blob([await f.text()], { type: "text/html" }));
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  const l = status && status.letzte;
  const ordnerText = konf.geraet
    ? "Ordner „" + (konf.geraet.ordner || "?") + "“ auf " + (hier ? "diesem Gerät" : konf.geraet.name || "einem anderen Gerät")
    : "Noch kein Ordner gewählt";
  const zeilen = liste || (status && status.liste) || [];

  return (
    <Gruppe titel="Planwand-Archiv" id="pa"
      text={"Jeden Tag eine Datei mit der ganzen Planwand (alle Aufträge, Maschinen und Ferien, rund 2 MB) in einem eigenen Ordner. "
        + "Doppelklick auf die Datei öffnet sie im Browser, ohne Internet, genau wie der Reiter Planwand, zum Nachschauen, wie die Planwand "
        + "an diesem Tag aussah. Nur die Planwand, nur zum Ansehen, keine Zeichnungen und keine anderen Dateien. Zum Zurückspielen ist die "
        + "Sicherung oben da. Die App muss auf dem Gerät mit dem Ordner offen sein, mit einem Admin, dem Konto Planwand "
        + "oder dem Sicherungskonto angemeldet."}>
      <Zeile titel="Speicherort" text={ordnerText}>
        {kannOrdner
          ? admin && <button className="knopf knopf--klein" id="pa-ordner" onClick={ordnerNeu}>
              {griff && hier ? "Anderen Ordner wählen" : "Ordner wählen"}</button>
          : <span className="klein gedaempft">Ordner wählen geht nur in Chrome oder Edge am Computer.</span>}
      </Zeile>
      {hier && griff && erlaubt !== "granted" && <p className="hinweis klein" id="pa-freigabe">
        Der Browser braucht die Erlaubnis für den Ordner nochmals. Einmal auf „Jetzt speichern“ drücken und „Zulassen“ wählen,
        am besten „Bei jedem Besuch zulassen“.</p>}
      <Zeile titel="Täglich ab" text="Sobald die App nach dieser Uhrzeit offen ist.">
        <select id="pa-stunde" value={stunde} disabled={!admin} onChange={(e) => setStunde(e.target.value)}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00 Uhr</option>)}
        </select>
      </Zeile>
      <Zeile titel="Behalten" text="Ältere Dateien werden im Ordner gelöscht, die neuesten drei bleiben immer.">
        <select id="pa-behalten" value={behalten} disabled={!admin} onChange={(e) => setBehalten(e.target.value)}>
          {[7, 14, 30, 60, 90, 180, 365, 730, 1825].map((t) => <option key={t} value={t}>
            {t === 730 ? "2 Jahre" : t === 1825 ? "5 Jahre" : t + " Tage"}</option>)}
        </select>
      </Zeile>
      <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
        <div id="pa-stand" className="dokpfad-stand">
          <span className={"dokpfad-punkt " + (l && Date.now() - new Date(l.zeit).getTime() < 36 * 3600000 ? "dokpfad-punkt--gut" : "dokpfad-punkt--alt")} />
          {l ? "Letzte Datei " + datumText(new Date(l.zeit)) + " · " + alt.zahlText(l.auftraege || 0) + " Aufträge · " + groesse(l.kb)
            : "Noch keine Datei"}
          {status && status.fehler && <div className="klein si-fehler">{status.fehler}</div>}
        </div>
        {admin && kannOrdner && <button className="knopf knopf--klein" id="pa-jetzt" disabled={!!arbeit}
          onClick={jetzt}>Jetzt speichern</button>}
        {admin && <button className="knopf knopf--klein knopf--haupt" id="pa-speichern"
          onClick={async () => { try { await speichern(); alt.meldung("Gespeichert.", "gut"); neu(); }
            catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); } }}>Speichern</button>}
      </div>
      {arbeit && <div className="si-auftrag si-auftrag--laeuft" id="pa-auftrag">
        <span className="si-dreher" aria-hidden="true" />{arbeit}</div>}
      {!arbeit && ergebnis && <div className={"si-auftrag " + (ergebnis.ok ? "si-auftrag--gut" : "si-auftrag--fehler")} id="pa-auftrag">
        {ergebnis.ok ? "✓ " : "Nicht geklappt: "}{ergebnis.text}</div>}
      {zeilen.length > 0 && <div className="tabellenrolle"><table className="tabelle es-tabelle" id="pa-liste">
        <thead><tr><th>Planwand vom</th><th>Grösse</th><th /></tr></thead>
        <tbody>{zeilen.slice(0, 30).map((x) => (
          <tr key={x.d}>
            <td>{datumText(wannAusName(x.d, x.z))}</td>
            <td className="nowrap">{groesse(x.kb)}</td>
            <td className="si-knopfzelle">{liste && <button className="knopf knopf--klein" onClick={() => oeffnen(x.d)}>Ansehen</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>}
    </Gruppe>
  );
}
