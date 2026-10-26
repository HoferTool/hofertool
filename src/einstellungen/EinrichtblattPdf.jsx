// =================================================================
//  EINSTELLUNGEN · Einrichtblätter als PDF (seit 1.200.0)
//  Jedes Einrichtblatt aus der App als PDF in einem Ordner, damit noch
//  Blätter da sind, wenn alles andere weg wäre (Wunsch Patrick,
//  26. Oktober 2026). Ablauf in src/teile/ebPdf.js.
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { Gruppe, Zeile } from "./teile.jsx";
import { kannOrdner, geraetId, geraetName, ordnerErlaubt } from "../teile/sicherung.js";
import { ebOrdnerHolen, ebOrdnerWaehlen, ebKonfLaden, ebKonfSpeichern, ebSichernUndMelden, ebLaeuft } from "../teile/ebPdf.js";

function datumText(d) {
  if (!d || isNaN(d)) return "–";
  const z = (n) => String(n).padStart(2, "0");
  return z(d.getDate()) + "." + z(d.getMonth() + 1) + "." + d.getFullYear() + ", " + z(d.getHours()) + ":" + z(d.getMinutes()) + " Uhr";
}

export default function EinrichtblattPdf() {
  const [auffrischen, setAuffrischen] = useState(0);
  const { daten, fehler } = useDaten(ebKonfLaden, [auffrischen]);
  if (!daten) {
    return (
      <Gruppe titel="Einrichtblätter als PDF" id="ebp">
        {fehler ? <p className="hinweis">{alt.fehlertext(fehler)}</p> : <div className="laedt">Wird geladen …</div>}
      </Gruppe>
    );
  }
  return <Inhalt konf={daten.konf} status={daten.status} neu={() => setAuffrischen((n) => n + 1)} />;
}

function Inhalt({ konf, status, neu }) {
  const admin = alt.darfDokumenteUndSicherung();
  const [griff, setGriff] = useState(null);
  const [erlaubt, setErlaubt] = useState("fehlt");
  const [arbeit, setArbeit] = useState("");
  const [ergebnis, setErgebnis] = useState(null);
  const hier = konf.geraet && konf.geraet.id === geraetId();

  const ordnerLesen = async (h) => { setGriff(h); setErlaubt(await ordnerErlaubt(h, false)); };
  useEffect(() => { if (kannOrdner) ebOrdnerHolen().then(ordnerLesen); }, []);

  // Ordner wählen macht dieses Gerät zum EB-Gerät
  const ordnerNeu = async () => {
    let h;
    try { h = await ebOrdnerWaehlen(); } catch (f) { return null; }
    try { await ebKonfSpeichern(Object.assign({}, konf, { geraet: { id: geraetId(), name: geraetName(), ordner: h.name } })); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return null; }
    await ordnerLesen(h);
    alt.meldung("Ordner „" + h.name + "“ gewählt. Dieses Gerät sichert jetzt die Einrichtblätter als PDF.", "gut");
    neu();
    return h;
  };

  const jetzt = async () => {
    if (ebLaeuft()) return;
    let h = griff;
    if (!h || (await ordnerErlaubt(h, true)) !== "granted") h = await ordnerNeu();
    if (!h) return;
    setErgebnis(null); setArbeit("Einrichtblätter werden gelesen …");
    try {
      const l = await ebSichernUndMelden(h, { hoechstens: 0,
        fortschritt: (n, offen) => setArbeit("PDF " + alt.zahlText(n + 1) + " von " + alt.zahlText(offen) + " wird geschrieben …") });
      setErgebnis({ ok: !l.fehler.length, text: l.geschrieben
        ? alt.zahlText(l.geschrieben) + " Einrichtblätter als PDF gespeichert" + (l.fehler.length ? ", " + l.fehler.length + " gingen nicht" : "")
        : l.fehler.length ? l.fehler.length + " gingen nicht" : "Alle Einrichtblätter sind schon aktuell im Ordner." });
    } catch (f) {
      setErgebnis({ ok: false, text: alt.fehlertext(f) });
    }
    setArbeit("");
    await ordnerLesen(h);
    neu();
  };

  const ordnerText = konf.geraet
    ? "Ordner „" + (konf.geraet.ordner || "?") + "“ auf " + (hier ? "diesem Gerät" : konf.geraet.name || "einem anderen Gerät")
    : "Noch kein Ordner gewählt";
  const s = status || {};
  const fertig = s.gesamt && !s.offen;

  return (
    <Gruppe titel="Einrichtblätter als PDF" id="ebp"
      text={"Jedes Einrichtblatt aus der App mit „EB OK“ kommt als PDF in einen eigenen Ordner, je Maschinentyp ein Unterordner, zum Beispiel "
        + "„Star SB-20\\10841-0009 Star SB-20.pdf“. Ändert sich ein Blatt, wird sein PDF überschrieben; ist die Datei gerade offen "
        + "und lässt sich nicht überschreiben, kommt daneben eine neue mit V-Nummer („… V2.pdf“). Gelöschte Blätter bleiben im Ordner. "
        + "Die App muss auf dem Gerät mit dem Ordner offen sein, mit einem Admin, dem Konto Planwand oder dem Sicherungskonto "
        + "angemeldet; sie schaut alle 5 Minuten nach und schreibt je Durchgang bis zu 40 Blätter."}>
      <Zeile titel="Speicherort" text={ordnerText}>
        {kannOrdner
          ? admin && <button className="knopf knopf--klein" id="ebp-ordner" onClick={ordnerNeu}>
              {griff && hier ? "Anderen Ordner wählen" : "Ordner wählen"}</button>
          : <span className="klein gedaempft">Ordner wählen geht nur in Chrome oder Edge am Computer.</span>}
      </Zeile>
      {hier && griff && erlaubt !== "granted" && <p className="hinweis klein" id="ebp-freigabe">
        Der Browser braucht die Erlaubnis für den Ordner nochmals. Einmal auf „Jetzt sichern“ drücken und „Zulassen“ wählen,
        am besten „Bei jedem Besuch zulassen“.</p>}
      <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
        <div id="ebp-stand" className="dokpfad-stand">
          <span className={"dokpfad-punkt " + (fertig ? "dokpfad-punkt--gut" : "dokpfad-punkt--alt")} />
          {s.gesamt
            ? alt.zahlText(s.gesichert || 0) + " von " + alt.zahlText(s.gesamt) + " bestätigten Einrichtblättern im Ordner"
              + (s.offen ? " · " + alt.zahlText(s.offen) + " noch offen" : "")
            : "Noch nichts gesichert"}
          {s.letzte && <div className="klein gedaempft">Zuletzt {s.letzte.datei} · {datumText(new Date(s.letzte.zeit))}</div>}
          {s.fehler && s.fehler.length > 0 && <div className="klein si-fehler">{s.fehler.slice(0, 3).join(" · ")}
            {s.fehler.length > 3 ? " · und " + (s.fehler.length - 3) + " weitere" : ""}</div>}
        </div>
        {admin && kannOrdner && <button className="knopf knopf--klein knopf--haupt" id="ebp-jetzt" disabled={!!arbeit}
          onClick={jetzt}>Jetzt sichern</button>}
      </div>
      {arbeit && <div className="si-auftrag si-auftrag--laeuft" id="ebp-auftrag">
        <span className="si-dreher" aria-hidden="true" />{arbeit}</div>}
      {!arbeit && ergebnis && <div className={"si-auftrag " + (ergebnis.ok ? "si-auftrag--gut" : "si-auftrag--fehler")} id="ebp-auftrag">
        {ergebnis.ok ? "✓ " : "Nicht ganz geklappt: "}{ergebnis.text}</div>}
    </Gruppe>
  );
}
