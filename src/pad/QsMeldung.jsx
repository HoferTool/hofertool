// =================================================================
//  PAD MODE: QS-MELDUNG STATT WETTER (1.77.0, Wunsch Patrick
//  16. Oktober 2026)
//  Gibt es für die Maschine eine offene QS-Meldung (Ausschuss
//  aussortiert, so viele Stück am Counter abziehen), steht sie rechts
//  oben anstelle des Wetters, bis jemand quittiert; danach kommt das
//  Wetter zurück. Das Pad zeichnet sich sonst nicht von selbst neu,
//  darum holt sich dieser Teil die Meldungen selbst: sofort über
//  Realtime, sonst alle 30 Sekunden. Nicht für Externe.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { qsMeldungenLaden, qsQuittieren, qsBeobachten, wannText } from "../daten/qs.js";

// Alle offenen Meldungen, die diese Person sehen darf: Admins alle,
// sonst nur zu Maschinen der eigenen Parks wie früher auf der Seite
// Qualitätssicherung (seit 1.85.0; die Datenbank prüft dasselbe).
// Die Maschinen holen wir einmal je Ansicht, nicht alle 30 Sekunden.
let maschinenVorrat = null;
async function alleMeldungen() {
  if (!maschinenVorrat) {
    maschinenVorrat = (async () => {
      // Parks zuerst: ohne ihre Namen weiss parkErlaubt nicht, welcher
      // Park zu Kurz- oder Langdrehern gehört
      await alt.ladeParks(false);
      return alt.ladeMaschinen(false);
    })();
    maschinenVorrat.catch(() => { maschinenVorrat = null; });
    setTimeout(() => { maschinenVorrat = null; }, 60000);
  }
  const [maschinen, meldungen] = await Promise.all([maschinenVorrat, qsMeldungenLaden()]);
  const meine = new Set(maschinen.map((m) => m.id));
  return { maschinen, meldungen: alt.istAdmin() ? meldungen : meldungen.filter((me) => meine.has(me.machine_id)) };
}

// maschineId = "alle" holt alle sichtbaren Meldungen (Knopf oben im Pad)
export function useQsMeldungen(maschineId) {
  const [liste, setListe] = useState([]);
  useEffect(() => {
    if (!maschineId || alt.istExtern()) { setListe([]); return undefined; }
    let gueltig = true;
    const holen = () => (maschineId === "alle" ? alleMeldungen().then((x) => x.meldungen) : qsMeldungenLaden(maschineId))
      .then((l) => { if (gueltig) setListe(l); })
      .catch(() => { /* ohne Tabelle oder Netz: einfach Wetter */ });
    holen();
    const ab = qsBeobachten(holen);
    const t = setInterval(() => { if (!document.hidden) holen(); }, 30000);
    return () => { gueltig = false; ab(); clearInterval(t); };
  }, [maschineId]);
  const weg = (id) => setListe((l) => l.filter((x) => x.id !== id));
  return [liste, weg];
}

export function QsMeldungen({ liste, weg }) {
  return (
    <div className="pad-qsm" id="pad-qsmeldung">
      {liste.slice().reverse().map((me) => (
        <div key={me.id} className="pad-qsm__karte" data-padqsmeldung={me.id}>
          <div className="pad-qsm__titel">⚠ Ausschuss aussortiert</div>
          <div className="pad-qsm__zahl"><b>{alt.zahlText(me.stueck)}</b> Stk. am Counter abziehen</div>
          {me.notiz && <div className="pad-qsm__notiz">{me.notiz}</div>}
          <div className="pad-qsm__fuss">
            <span>{me.hoco_nr ? me.hoco_nr + " · " : ""}{wannText(me.erstellt_am)}{me.erstellt_name ? " · " + me.erstellt_name : ""}</span>
            <button className="pad-qsm__quittieren" data-padqsquittieren={me.id}
              onClick={async () => { if (await qsQuittieren(me)) weg(me.id); }}>✓ Quittieren</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// =================================================================
//  OFFENE MELDUNGEN OBEN IM PAD (1.317.0, Wunsch Patrick 30. Oktober
//  2026: „QS-Reiter brauchts nicht, Padmode reicht, offene Meldungen
//  Button oben im Balken, dass man alle sehen kann“)
//  Ersetzt die Übersicht der früheren Seite Qualitätssicherung: der
//  Knopf steht in jeder Kopfleiste des Pads, zeigt die Zahl der offenen
//  Meldungen (rot, wenn es welche gibt) und öffnet ein Fenster mit
//  allen zum Quittieren. Gemeldet wird weiter im QS Check des Pads.
//  Nicht für Externe.
// =================================================================
function MeldungenFenster({ zu }) {
  const [daten, setDaten] = useState(null);
  useEffect(() => {
    let gueltig = true;
    const holen = () => alleMeldungen().then((x) => { if (gueltig) setDaten(x); })
      .catch((f) => { if (gueltig) setDaten({ fehler: f, maschinen: [], meldungen: [] }); });
    holen();
    const ab = qsBeobachten(holen);
    return () => { gueltig = false; ab(); };
  }, []);
  const maschineVon = (id) => (daten ? daten.maschinen.find((m) => m.id === id) : null);
  const quittieren = async (me) => {
    if (await qsQuittieren(me)) setDaten((d) => ({ ...d, meldungen: d.meldungen.filter((x) => x.id !== me.id) }));
  };
  const liste = daten ? daten.meldungen.slice().reverse() : [];
  return (
    <div className="dialog qsof" role="dialog" aria-modal="true" id="qs-offen-fenster">
      <button className="qsf__zu" data-nein="" aria-label="Schliessen" onClick={zu}>✕</button>
      <h2 className="qsof__titel">Offene Meldungen{liste.length ? " (" + liste.length + ")" : ""}</h2>
      {!daten ? <p className="klein">Wird geladen …</p>
        : daten.fehler ? <p className="klein">{alt.fehlertext(daten.fehler)}</p>
        : liste.length
          ? <div className="qs-meldungen" id="qs-meldungen">
              {liste.map((me) => {
                const m = maschineVon(me.machine_id);
                return (
                  <div key={me.id} className="qs-meldung" data-qsmeldung={me.id}>
                    <div className="qs-meldung__kopf">
                      <span className="qs-meldung__wo">{m ? alt.maschineZielText(m) : "Maschine"}{me.hoco_nr ? " · " + me.hoco_nr : ""}</span>
                      <span className="qs-meldung__wann">{wannText(me.erstellt_am)}{me.erstellt_name ? " · " + me.erstellt_name : ""}</span>
                    </div>
                    <div className="qs-meldung__zahl"><b>{alt.zahlText(me.stueck)}</b> Stk. am Counter abziehen</div>
                    {me.notiz && <div className="qs-meldung__notiz">{me.notiz}</div>}
                    <button className="knopf knopf--haupt qs-meldung__quittieren" data-qsquittieren={me.id}
                      onClick={() => quittieren(me)}>Quittieren</button>
                  </div>);
              })}
            </div>
          : <p className="klein qs-leer" id="qs-keine">Keine offenen Meldungen.</p>}
      <p className="klein">Ausschuss melden: im Pad unter QS Check auf den Fortschritt der Maschine tippen.</p>
    </div>
  );
}

export function PadMeldungenKnopf() {
  const [liste] = useQsMeldungen(alt.istExtern() ? null : "alle");
  if (alt.istExtern()) return null;
  const n = liste.length;
  return (
    <button className={"pad__meldungen" + (n ? " pad__meldungen--offen" : "")} data-padmeldungen=""
      title="Offene Meldungen der Qualitätssicherung"
      onClick={() => fensterOeffnen((zu) => <MeldungenFenster zu={zu} />, null, "qsf-huelle")}>
      <span className="pad__meldungen-text">Offene Meldungen</span>
      <span className="pad__meldungen-zahl" data-padmeldungenzahl="">{n}</span>
    </button>
  );
}
