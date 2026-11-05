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
import { istModulFehler } from "../teile/modulFehler.js";
import { krOrdnerHolen, krOrdnerWaehlen, krSortieren, krLaeuft, zuordnenListe, zuordnenDatei, zuordnen, lieferantenLaden, zuordnenAlleLoeschen,
  abgelegtListe, abgelegtDatei, abgelegtKorrigieren, abgelegtStimmt, lieferantDateien }
  from "../teile/kreditorenAblage.js";

export default function Kreditoren() {
  const [griff, setGriff] = useState(null);
  const [erlaubt, setErlaubt] = useState("fehlt");
  const [arbeit, setArbeit] = useState("");
  const [ergebnis, setErgebnis] = useState(null);
  const [offen, setOffen] = useState([]);
  const [lieferanten, setLieferanten] = useState([]);
  const [zuletzt, setZuletzt] = useState([]);
  // Aufgeklappt, wenn etwas nur vermutet ist; danach bestimmt man selbst
  const [zuletztAuf, setZuletztAuf] = useState(false);
  useEffect(() => { if (zuletzt.some((e) => e.vermutet)) setZuletztAuf(true); }, [zuletzt.some((e) => e.vermutet)]);

  const lesen = async (h) => {
    setGriff(h);
    const e = await ordnerErlaubt(h, false);
    setErlaubt(e);
    if (h && e === "granted") {
      try {
        setOffen(await zuordnenListe(h));
        setZuletzt(await abgelegtListe(h));
        setLieferanten((await lieferantenLaden(h)).map((l) => l.name).sort((a, b) => a.localeCompare(b, "de")));
      } catch (f) { setErgebnis({ ok: false, text: alt.fehlertext(f) }); }
    }
  };
  useEffect(() => { if (kannOrdner) krOrdnerHolen().then(lesen); }, []);
  // Die Liste neu lesen, solange das Fenster offen ist: die Ablage im
  // Hintergrund (alle 2 Minuten) legt Rechnungen nach „_Zuordnen“, während
  // die Einstellungen schon offen sind (Patrick 29. Oktober 2026: „es liegt
  // eine drin und ich sehe Zum Zuordnen nicht“)
  useEffect(() => {
    if (!griff || erlaubt !== "granted") return undefined;
    const neu = () => { if (!document.hidden && !krLaeuft()) lesen(griff); };
    const t = setInterval(neu, 10000);
    window.addEventListener("focus", neu);
    return () => { clearInterval(t); window.removeEventListener("focus", neu); };
  }, [griff, erlaubt]);

  const freigeben = async () => {
    if (griff && (await ordnerErlaubt(griff, true)) === "granted") await lesen(griff);
  };

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
      setErgebnis(l.besetzt ? { ok: false, text: "Ein anderes Gerät legt gerade Rechnungen ab. In ein paar Minuten nochmals versuchen." }
        : { ok: !l.fehler.length, text: !l.stapel && !l.fehler.length
        ? "Keine neuen PDFs im Ordner."
        : alt.zahlText(l.abgelegt) + (l.abgelegt === 1 ? " Rechnung" : " Rechnungen") + " abgelegt"
          + (l.zuordnen ? ", " + l.zuordnen + " zum Zuordnen (unten)" : "")
          + (l.doppelt ? ", " + l.doppelt + " waren schon abgelegt" : "")
          + (l.fehler.length ? ". Nicht gegangen: " + l.fehler.join(" · ") : "") });
    } catch (f) {
      // Neue Fassung draussen, dieser Tab noch alt: gleich neu laden, die
      // Einstellungen kommen danach wieder (Patrick 2. November 2026)
      if (istModulFehler(f) && (await alt.fassungPruefen(true))) {
        setErgebnis({ ok: false, text: "Die App wurde inzwischen erneuert und lädt jetzt neu. Danach nochmals „Jetzt ablegen“ drücken." });
        setTimeout(() => location.reload(), 1500);
        return;
      }
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
        Der Browser braucht die Erlaubnis für den Ordner nochmals, erst dann sieht man auch „Zum Zuordnen“.{" "}
        <button className="knopf knopf--klein knopf--haupt" id="kred-freigeben" onClick={freigeben}>Ordner freigeben</button>{" "}
        und „Zulassen“ wählen, am besten „Bei jedem Besuch zulassen“.</p>}
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
        <div className="kred-kopf">
          <h3>Zum Zuordnen ({offen.length})</h3>
          <button className="knopf knopf--klein" id="kred-alle-weg" onClick={async () => {
            const ok = await alt.nachfragen({ titel: "Alle zum Zuordnen löschen?",
              text: "Die " + offen.length + " Rechnungen in „_Zuordnen“ werden gelöscht. Die gescannten Stapel bleiben in „_Originale“.",
              bestaetigen: "Löschen", gefahr: true });
            if (!ok) return;
            try { const n = await zuordnenAlleLoeschen(griff); alt.meldung(alt.zahlText(n) + " gelöscht.", "gut"); }
            catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
            await lesen(griff);
          }}>Alle löschen</button>
        </div>
        {offen.map((r) => <ZuordnenZeile key={r.name} r={r} griff={griff} fertig={() => lesen(griff)} />)}
      </div>}
      {lieferanten.length > 0 && <datalist id="kred-namen">{lieferanten.map((n) => <option key={n} value={n} />)}</datalist>}
      {zuletzt.length > 0 && <details className="kred-zuordnen" id="kred-zuletzt" open={zuletztAuf}>
        <summary onClick={(ev) => { ev.preventDefault(); setZuletztAuf(!zuletztAuf); }}><h3 style={{ display: "inline" }}>Zuletzt abgelegt ({zuletzt.length}
          {zuletzt.some((e) => e.vermutet) ? ", davon " + zuletzt.filter((e) => e.vermutet).length + " nur vermutet" : ""})</h3></summary>
        <p className="klein gedaempft">Liegt eine Rechnung beim falschen Lieferanten, den richtigen Namen eintippen und „Korrigieren“.
          Die App verschiebt sie und erkennt diesen Lieferanten danach richtig. „Stimmt“ nimmt sie aus der Liste.</p>
        {zuletzt.slice(0, 60).map((e) => <ZuletztZeile key={e.ordner + "/" + e.datei} e={e} griff={griff} fertig={() => lesen(griff)} />)}
      </details>}
      {griff && erlaubt === "granted" && lieferanten.length > 0 && <Durchsehen griff={griff} lieferanten={lieferanten} fertig={() => lesen(griff)} />}
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

// Alle Rechnungen eines Lieferanten zeigen, auch die von vor „Zuletzt
// abgelegt“ (Patrick 3. November 2026: „Elektro Andres AG Rechnungen waren
// bei Ausgleichskasse … ich sehe sie nicht mehr in der Liste“)
function Durchsehen({ griff, lieferanten, fertig }) {
  const [name, setName] = useState("");
  const [liste, setListe] = useState(null);
  const zeigen = async (n = name) => {
    const l = lieferanten.find((x) => x.toLowerCase() === n.trim().toLowerCase());
    if (!l) { alt.meldung("Diesen Lieferanten gibt es nicht. Bitte aus der Liste wählen.", "warn"); return; }
    try { setListe({ name: l, dateien: await lieferantDateien(griff, l) }); }
    catch (f) { setListe({ name: l, dateien: [] }); }
  };
  return (
    <details className="kred-zuordnen" id="kred-durchsehen">
      <summary><h3 style={{ display: "inline" }}>Lieferant durchsehen</h3></summary>
      <p className="klein gedaempft">Zeigt alle Rechnungen in einem Lieferanten-Ordner. Liegt dort eine falsche, den richtigen Namen eintippen und „Korrigieren“.</p>
      <div className="knopfreihe">
        <input className="feld kred-name" id="kred-durch-name" list="kred-namen" value={name} placeholder="Lieferant"
          onChange={(ev) => setName(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") zeigen(); }} />
        <button className="knopf knopf--klein knopf--haupt" id="kred-durch-zeigen" onClick={() => zeigen()}>Zeigen</button>
      </div>
      {liste && (liste.dateien.length
        ? liste.dateien.map((e) => <ZuletztZeile key={e.ordner + "/" + e.datei} e={e} griff={griff} ohneStimmt
            fertig={async () => { await fertig(); await zeigen(liste.name); }} />)
        : <p className="klein gedaempft">Keine Rechnungen bei „{liste.name}“.</p>)}
    </details>
  );
}

function ZuletztZeile({ e, griff, fertig, ohneStimmt }) {
  const [name, setName] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const ansehen = async () => {
    try { alt.dateiAnsehen(await abgelegtDatei(griff, e)); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  const tun = async (fn, gut) => {
    setLaeuft(true);
    try { const wo = await fn(); if (gut) alt.meldung(gut(wo), "gut"); await fertig(); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); setLaeuft(false); }
  };
  const korrigieren = () => {
    if (!name.trim()) { alt.meldung("Bitte den richtigen Lieferanten eingeben.", "warn"); return; }
    tun(() => abgelegtKorrigieren(griff, e, name), (wo) => "Verschoben nach „" + wo + "“.");
  };
  return (
    <div className="kred-zeile">
      <button className="knopf knopf--klein kred-datei" onClick={ansehen} title="Ansehen">{e.datei}</button>
      <span className="klein">bei <b>{e.ordner}</b>{e.vermutet ? <span className="kred-vermutet"> vermutet</span> : ""}</span>
      <input className="feld kred-name" list="kred-namen" value={name} placeholder="Richtiger Lieferant"
        onChange={(ev) => setName(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") korrigieren(); }} />
      <button className="knopf knopf--klein knopf--haupt kred-korr" disabled={laeuft} onClick={korrigieren}>Korrigieren</button>
      {!ohneStimmt && <button className="knopf knopf--klein kred-stimmt" disabled={laeuft} onClick={() => tun(() => abgelegtStimmt(griff, e))}>Stimmt</button>}
    </div>
  );
}
