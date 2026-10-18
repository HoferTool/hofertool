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
import { qsMeldungenLaden, qsQuittieren, qsBeobachten, wannText } from "../daten/qs.js";

export function useQsMeldungen(maschineId) {
  const [liste, setListe] = useState([]);
  useEffect(() => {
    if (!maschineId || alt.istExtern()) { setListe([]); return undefined; }
    let gueltig = true;
    const holen = () => qsMeldungenLaden(maschineId)
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
