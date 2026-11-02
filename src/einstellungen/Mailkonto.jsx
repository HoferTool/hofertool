// =================================================================
//  EINSTELLUNGEN → ALLGEMEIN → MAILKONTO (seit 1.323.0, nur Admins)
//  Wunsch Patrick 31. Oktober 2026. Hier stehen die Angaben der App-
//  Anmeldung bei Microsoft (Entra): Verzeichnis-ID, Anwendungs-ID und
//  der geheime Clientschlüssel, dazu der Absender. Der Schlüssel geht
//  nur hinein, nie heraus (src/daten/mailkonto.js, sql/mailkonto.sql).
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { Gruppe } from "./teile.jsx";
import { kontoLesen, kontoSetzen, mailSenden } from "../daten/mailkonto.js";

const VORGABE_ABSENDER = "1.programmierung@hoferco.ch";

export function Mailkonto() {
  const [konto, setKonto] = useState(null);
  const [fehlt, setFehlt] = useState(false);
  const [f, setF] = useState({ mandant: "", clientId: "", geheimnis: "", absender: VORGABE_ABSENDER, name: "Hofer + Co. Präzisionsdrehteile" });
  const [geaendert, setGeaendert] = useState(false);
  const [laeuft, setLaeuft] = useState("");

  const laden = async () => {
    try {
      const k = await kontoLesen();
      setKonto(k || {});
      if (k) setF({ mandant: k.mandant || "", clientId: k.client_id || "", geheimnis: "",
        absender: k.absender || VORGABE_ABSENDER, name: k.name || "" });
    } catch (e) { setFehlt(true); }
  };
  useEffect(() => { laden(); }, []);

  const setze = (n) => (e) => { setF({ ...f, [n]: e.target.value }); setGeaendert(true); };

  const speichern = async () => {
    if (!f.mandant.trim() || !f.clientId.trim() || !f.absender.trim()) {
      alt.meldung("Bitte Verzeichnis-ID, Anwendungs-ID und Absender ausfüllen.", "warn"); return;
    }
    if (!f.geheimnis.trim() && !(konto && konto.hat_geheimnis)) {
      alt.meldung("Bitte den geheimen Clientschlüssel eintragen.", "warn"); return;
    }
    setLaeuft("speichern");
    try {
      await kontoSetzen(f);
      setGeaendert(false);
      await laden();
      alt.meldung("Gespeichert. Jetzt mit „Probe-Mail“ ausprobieren.", "gut");
    } catch (e) { alt.meldung(alt.fehlertext(e), "fehler"); }
    setLaeuft("");
  };

  const probe = async () => {
    setLaeuft("probe");
    try {
      const r = await mailSenden({ art: "pruefen" });
      alt.meldung("Probe-Mail an " + r.an + " gesendet. Schau dort im Posteingang nach.", "gut");
    } catch (e) { alt.meldung("Probe ging nicht: " + e.message, "fehler"); }
    await laden();
    setLaeuft("");
  };

  if (fehlt) return (
    <Gruppe titel="Mailkonto" text="Die Datenbank kennt das Mailkonto noch nicht (sql/mailkonto.sql)." />
  );

  const eingerichtet = konto && konto.mandant && konto.client_id && konto.hat_geheimnis;
  const zustand = !eingerichtet ? <span className="klein">Noch nicht eingerichtet. Ferien und Bestellungen gehen wie bisher als Entwurf für Outlook.</span>
    : konto.fehler ? <span className="mk-rot">✗ {konto.fehler}</span>
    : konto.geprueft_am ? <span className="mk-gut">✔ Funktioniert, zuletzt geprüft {alt.datumZeitKurz(konto.geprueft_am)}</span>
    : <span className="klein">Gespeichert, noch nicht geprüft. Drück auf „Probe-Mail“.</span>;

  return (
    <Gruppe titel="Mailkonto (direkt senden)" id="es-mailkonto"
      text="Von diesem Konto in Microsoft 365 schickt die App Ferientermine (direkt in die Outlook-Kalender des Ferien-Verteilers) und Bestellungen mit PDF. Der geheime Schlüssel liegt nur auf dem Server, niemand kann ihn in der App wieder lesen.">
      <div className="mk-raster">
        <label htmlFor="mk-absender">Absender</label>
        <input id="mk-absender" type="email" value={f.absender} onChange={setze("absender")} placeholder={VORGABE_ABSENDER} />
        <label htmlFor="mk-name">Name in der Mail</label>
        <input id="mk-name" type="text" value={f.name} onChange={setze("name")} placeholder="Hofer + Co. Präzisionsdrehteile" />
        <label htmlFor="mk-mandant">Verzeichnis-ID (Mandant)</label>
        <input id="mk-mandant" type="text" value={f.mandant} onChange={setze("mandant")} placeholder="z. B. 1a2b3c4d-…" autoComplete="off" spellCheck={false} />
        <label htmlFor="mk-client">Anwendungs-ID (Client)</label>
        <input id="mk-client" type="text" value={f.clientId} onChange={setze("clientId")} placeholder="z. B. 9f8e7d6c-…" autoComplete="off" spellCheck={false} />
        <label htmlFor="mk-geheim">Geheimer Clientschlüssel</label>
        <input id="mk-geheim" type="password" value={f.geheimnis} onChange={setze("geheimnis")} autoComplete="new-password"
          placeholder={konto && konto.hat_geheimnis ? "hinterlegt (leer lassen = behalten)" : "Wert aus „Zertifikate & Geheimnisse“"} />
        <span>Stand</span>
        <div id="mk-stand">{zustand}</div>
      </div>
      <div className="mk-knoepfe">
        <button className="knopf knopf--klein knopf--haupt" id="mk-speichern" disabled={!geaendert || !!laeuft} onClick={speichern}>
          {laeuft === "speichern" ? "Speichert …" : "Speichern"}</button>
        <button className="knopf knopf--klein" id="mk-probe" disabled={!eingerichtet || geaendert || !!laeuft} onClick={probe}>
          {laeuft === "probe" ? "Sendet …" : "Probe-Mail"}</button>
      </div>
    </Gruppe>
  );
}
