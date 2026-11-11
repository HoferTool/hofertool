// =================================================================
//  PAD MODE: AUDIT (seit 1.470.0, Wunsch Patrick 10. November 2026: „für
//  das Audit mit dem iPad durch die Firma laufen können, Oberfläche im Pad
//  Mode fürs Audit“). Kachel „Audit“ auf dem Startbild, nur wer QM
//  alternativ sieht (Vermerk qmSehen, nie Externe). Zeigt je Bereich mit
//  Checkliste das offene Audit gross zum Antippen, darunter die zuletzt
//  abgeschlossenen; Antippen öffnet dieselbe Checkliste wie am PC
//  (src/seiten/qmAlt/Checkliste.jsx), mit Diktat in den Textfeldern.
// =================================================================
import { useState } from "react";
import { alt } from "../bruecke.jsx";
import { qmDatum, qmaLaden, checklisteFuer, auditQuartal, statusVon, heute, vorpunkteFuer } from "../daten/qmAlt.js";
import { checklisteOeffnen } from "../seiten/qmAlt/Checkliste.jsx";
import { berichtZeigen } from "../seiten/qmAlt/AuditPlan.jsx";

export async function auditLaden() {
  const d = await qmaLaden();
  return { art: "audit", texte: d.texte, eintraege: d.eintraege };
}

const wann = (e) => (e.daten.datum ? qmDatum(e.daten.datum) : (auditQuartal(e) || "").replace("-", " "));

export default function PadAudit({ d, Kopf, neu }) {
  const mitCk = d.eintraege.filter((e) => e.art === "audit" && checklisteFuer(d.texte, e));
  const offen = mitCk.filter((e) => e.status !== "durchgefuehrt" || (e.daten.checkliste && !e.daten.checkliste.abgeschlossen_am))
    .sort((a, b) => (a.daten.datum || (auditQuartal(a) || "9999") + "-99").localeCompare(b.daten.datum || (auditQuartal(b) || "9999") + "-99"));
  const fertig = mitCk.filter((e) => e.daten.checkliste && e.daten.checkliste.abgeschlossen_am)
    .sort((a, b) => String(b.daten.checkliste.abgeschlossen_am).localeCompare(a.daten.checkliste.abgeschlossen_am)).slice(0, 6);
  const oeffnen = (e) => checklisteOeffnen(e, d.texte, d.eintraege, neu);
  // Seit 1.473.0 hat jeder Bereich eine Checkliste: zuerst nur die vier nächsten
  const [alle, setAlle] = useState(false);
  const zeigen = alle ? offen : offen.slice(0, 4);
  return (
    <>
      <Kopf titel="Audit" zurueck />
      <div className="pad-audit" id="pad-audit">
        {!offen.length && <p className="pad-audit__leer">Kein offenes Audit mit Checkliste. Audits plant man am PC unter QMS → Audits.</p>}
        {zeigen.map((e) => {
          const ck = checklisteFuer(d.texte, e);
          const n = ck.fragen.length;
          const a = (e.daten.checkliste && e.daten.checkliste.antworten) || {};
          const beantwortet = ck.fragen.filter((f) => a[f.id] && a[f.id].b).length;
          const vor = (e.daten.checkliste && e.daten.checkliste.vorliste) || vorpunkteFuer(e, ck.bereich, d.eintraege);
          const spaet = e.faellig && e.faellig < heute();
          return (
            <button key={e.id} className="pad-audit__karte" data-padaudit={e.id} onClick={() => oeffnen(e)}>
              <span className="pad-audit__bereich">{ck.bereich}</span>
              {e.titel !== ck.bereich && <span className="pad-audit__titel">{e.titel}</span>}
              <span className="pad-audit__info">{wann(e)}{spaet ? " · überfällig" : ""} · {statusVon("audit", e.status).text}</span>
              <span className="pad-audit__balken"><i style={{ width: (n ? (100 * beantwortet) / n : 0) + "%" }} /></span>
              <span className="pad-audit__info">{beantwortet} von {n} Fragen{vor.length ? " · " + vor.length + " offene Punkte aus früheren Audits" : ""}</span>
              <span className="pad-audit__los">{beantwortet ? "Weiterführen ›" : "Audit starten ›"}</span>
            </button>
          );
        })}
        {offen.length > 4 && <button className="pad-audit__knopf pad-audit__mehr" id="pad-audit-mehr" onClick={() => setAlle(!alle)}>
          {alle ? "Nur die nächsten zeigen" : "Weitere " + (offen.length - 4) + " geplante Audits"}</button>}
        {fertig.length > 0 && <>
          <h3 className="pad-audit__zwischen">Abgeschlossen</h3>
          <div className="pad-audit__fertig">
            {fertig.map((e) => (
              <div key={e.id} className="pad-audit__zeile">
                <span><b>{checklisteFuer(d.texte, e).bereich}</b> · {e.titel} · {wann(e)}</span>
                {e.daten.bericht_url && <button className="pad-audit__knopf" onClick={() => berichtZeigen(e)}>📄 Bericht</button>}
                <button className="pad-audit__knopf" data-padauditfertig={e.id} onClick={() => oeffnen(e)}>Ansehen</button>
              </div>
            ))}
          </div>
        </>}
      </div>
    </>
  );
}
