// =================================================================
//  EINSTELLUNGEN · Kreditorenrechnungen (seit 1.268.0)
//  Eingescannte Stapel im Ordner werden getrennt und je Lieferant in
//  einen Unterordner gelegt (Wunsch Patrick, 29. Oktober 2026). Ablauf
//  in src/teile/kreditorenAblage.js. Nur für Admins.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { Gruppe, Zeile } from "./teile.jsx";
import { kannOrdner, ordnerErlaubt } from "../teile/sicherung.js";
import { krOrdnerHolen, krOrdnerWaehlen, krSortieren, krLaeuft, zuordnenListe, zuordnenDatei, zuordnen, lieferantenLaden }
  from "../teile/kreditorenAblage.js";

export default function Kreditoren() {
  const [griff, setGriff] = useState(null);
  const [erlaubt, setErlaubt] = useState("fehlt");
  const [arbeit, setArbeit] = useState("");
  const [ergebnis, setErgebnis] = useState(null);
  const [offen, setOffen] = useState([]);
  const [lieferanten, setLieferanten] = useState([]);

  const lesen = async (h) => {
    setGriff(h);
    const e = await ordnerErlaubt(h, false);
    setErlaubt(e);
    if (h && e === "granted") {
      try {
        setOffen(await zuordnenListe(h));
        setLieferanten((await lieferantenLaden(h)).map((l) => l.name).sort((a, b) => a.localeCompare(b, "de")));
      } catch (f) { setErgebnis({ ok: false, text: alt.fehlertext(f) }); }
    }
  };
  useEffect(() => { if (kannOrdner) krOrdnerHolen().then(lesen); }, []);

  const ordnerNeu = async () => {
    let h;
    try { h = await krOrdnerWaehlen(); } catch (f) { return null; }
    await lesen(h);
    alt.meldung("Ordner „" + h.name + "“ gewählt. Dieses Gerät legt jetzt die Rechnungen ab.", "gut");
    return h;
  };

  const jetzt = async () => {
    if (krLaeuft()) return;
    let h = griff;
    if (!h || (await ordnerErlaubt(h, true)) !== "granted") h = await ordnerNeu();
    if (!h) return;
    setErgebnis(null); setArbeit("Ordner wird durchgesehen …");
    try {
      const l = await krSortieren(h, { sofort: true,
        fortschritt: (name, n, alle) => setArbeit("„" + name + "“ wird getrennt und abgelegt (" + (n + 1) + " von " + alle + ") …") });
      setErgebnis({ ok: !l.fehler.length, text: !l.stapel && !l.fehler.length
        ? "Keine neuen PDFs im Ordner."
        : alt.zahlText(l.abgelegt) + (l.abgelegt === 1 ? " Rechnung" : " Rechnungen") + " abgelegt"
          + (l.zuordnen ? ", " + l.zuordnen + " zum Zuordnen (unten)" : "")
          + (l.fehler.length ? ". Nicht gegangen: " + l.fehler.join(" · ") : "") });
    } catch (f) {
      setErgebnis({ ok: false, text: alt.fehlertext(f) });
    }
    setArbeit("");
    await lesen(h);
  };

  return (
    <Gruppe titel="Kreditorenrechnungen" id="kred"
      text={"Eingescannte Rechnungen als PDF direkt in den Ordner legen, auch ein ganzer Stapel in einer Datei. "
        + "Die App trennt den Stapel in einzelne Rechnungen und legt jede beim Lieferanten ab, zum Beispiel "
        + "„Würth AG\\2026-10-26 4062850536.pdf“. Den Stapel selbst verschiebt sie nach „_Originale“. "
        + "Erkennt sie einen Lieferanten nicht, kommt die Rechnung nach „_Zuordnen“: unten den Namen einmal eingeben, "
        + "danach erkennt sie ihn von selbst. Die App muss auf diesem Gerät offen sein (Admin oder Konto Planwand), "
        + "sie schaut alle 2 Minuten nach. Das PDF braucht Text (OCR beim Scannen einschalten)."}>
      <Zeile titel="Ordner" text={griff ? "„" + griff.name + "“ auf diesem Gerät" : "Noch kein Ordner gewählt, zum Beispiel G:\\Rechnungen Kreditoren"}>
        {kannOrdner
          ? <button className="knopf knopf--klein" id="kred-ordner" onClick={ordnerNeu}>{griff ? "Anderen Ordner wählen" : "Ordner wählen"}</button>
          : <span className="klein gedaempft">Ordner wählen geht nur in Chrome oder Edge am Computer.</span>}
      </Zeile>
      {griff && erlaubt !== "granted" && <p className="hinweis klein" id="kred-freigabe">
        Der Browser braucht die Erlaubnis für den Ordner nochmals. Einmal auf „Jetzt ablegen“ drücken und „Zulassen“ wählen,
        am besten „Bei jedem Besuch zulassen“.</p>}
      <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
        <div className="dokpfad-stand klein gedaempft">
          {lieferanten.length ? alt.zahlText(lieferanten.length) + " Lieferanten bekannt" : ""}
        </div>
        {kannOrdner && <button className="knopf knopf--klein knopf--haupt" id="kred-jetzt" disabled={!!arbeit}
          onClick={jetzt}>Jetzt ablegen</button>}
      </div>
      {arbeit && <div className="si-auftrag si-auftrag--laeuft" id="kred-auftrag">
        <span className="si-dreher" aria-hidden="true" />{arbeit}</div>}
      {!arbeit && ergebnis && <div className={"si-auftrag " + (ergebnis.ok ? "si-auftrag--gut" : "si-auftrag--fehler")} id="kred-auftrag">
        {ergebnis.ok ? "✓ " : "Nicht ganz geklappt: "}{ergebnis.text}</div>}
      {offen.length > 0 && <div className="kred-zuordnen" id="kred-zuordnen">
        <h3>Zum Zuordnen ({offen.length})</h3>
        <datalist id="kred-namen">{lieferanten.map((n) => <option key={n} value={n} />)}</datalist>
        {offen.map((r) => <ZuordnenZeile key={r.name} r={r} griff={griff} fertig={() => lesen(griff)} />)}
      </div>}
    </Gruppe>
  );
}

function ZuordnenZeile({ r, griff, fertig }) {
  const [name, setName] = useState(r.vorschlag || "");
  const [laeuft, setLaeuft] = useState(false);
  const ansehen = async () => {
    try { alt.dateiAnsehen(await zuordnenDatei(griff, r.name)); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  const ablegen = async () => {
    if (!name.trim()) { alt.meldung("Bitte den Lieferanten eingeben.", "warn"); return; }
    setLaeuft(true);
    try {
      const wo = await zuordnen(griff, r.name, name);
      alt.meldung("Abgelegt in „" + wo + "“.", "gut");
      await fertig();
    } catch (f) {
      alt.meldung(alt.fehlertext(f), "fehler");
      setLaeuft(false);
    }
  };
  return (
    <div className="kred-zeile">
      <button className="knopf knopf--klein kred-datei" onClick={ansehen} title="Ansehen">{r.name}</button>
      <span className="klein gedaempft">{r.aus ? r.aus + " " + (r.seiten || "") : ""}</span>
      <input className="feld kred-name" list="kred-namen" value={name} placeholder="Lieferant"
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ablegen(); }} />
      <button className="knopf knopf--klein knopf--haupt" disabled={laeuft} onClick={ablegen}>Ablegen</button>
    </div>
  );
}
