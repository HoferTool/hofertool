// =================================================================
//  MATERIAL: WO EINSETZEN? (seit 1.104.0, Wunsch Patrick 19. Oktober
//  2026: „bei jedem Material das rote M anklicken können, und drin
//  sieht man, wo man es einsetzen könnte, bei Aufträgen, die geplant
//  sind und ein rotes M haben“)
//  Das rote M steht bei jedem Posten Restmaterial auf der Seite
//  Material, mit der Zahl passender Aufträge. Das Fenster listet sie
//  (auftraegeMitM in src/daten/material.js); die HOCO Nr. öffnet das
//  Auftragsfenster. Zugewiesen wird nichts. Nicht für Externe.
// =================================================================
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { auftraegeMitM, postenMengeText, matInfo } from "../daten/material.js";
import { M_SYMBOL } from "../daten/symbole.js";

// Das M wie auf dem Balken der Planwand, als Knopf mit der Anzahl
export function MKnopf({ p, auftraege, neu }) {
  const liste = auftraegeMitM(p, auftraege);
  return (
    <button type="button" className={"mat-m" + (liste.length ? "" : " mat-m--leer")} data-m={liste.length}
      title={liste.length ? "Wo einsetzen? " + liste.length + " geplante Aufträge mit rotem M" : "Kein geplanter Auftrag mit rotem M braucht das"}
      onClick={() => woEinsetzenOeffnen(p, liste, neu)}>
      <span className="mat-m__zeichen" dangerouslySetInnerHTML={{ __html: M_SYMBOL }} />
      <span className="mat-m__zahl">{liste.length}</span>
    </button>);
}

export function woEinsetzenOeffnen(p, liste, neu) {
  fensterOeffnen((zu) => (
    <div className="dialog dialog--breit mat-wo" id="mat-wo">
      <div className="blatt__kopf"><h2>Wo einsetzen?</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>
      <p className="mat-wo__posten"><b>{p.material}</b> · {postenMengeText(p)} · {p.ort || "ohne Ort"}</p>
      {liste.length
        ? <>
            <p className="klein">Geplante Aufträge mit rotem M und diesem Material. Die HOCO Nr. öffnet den Auftrag.</p>
            <div className="matausgabe-rolle"><table className="tabelle">
              <thead><tr><th>HOCO Nr.</th><th>Maschine</th><th>Start</th><th>Menge</th><th>Material</th></tr></thead>
              <tbody>{liste.map(({ auftrag: j, aehnlich }) => {
                const info = matInfo(j);
                return (
                  <tr key={j.id} data-wo={j.job_number}>
                    <td><button type="button" className="linkknopf mat-wo__nr"
                      onClick={() => { zu(); alt.planAuftragDialog(j, { nachPlanAenderung: neu }); }}>{j.job_number}</button></td>
                    <td>{[j.maschine, j.maschine_nr].filter(Boolean).join(" ") || "—"}</td>
                    <td className="nowrap">{j.planned_from ? alt.kurzDatum(j.planned_from) : "—"}</td>
                    <td className="nowrap">{j.target_quantity ? alt.zahlText(j.target_quantity) + " Stk." : "—"}
                      {info && info.kg !== undefined ? <div className="klein">{info.text}</div> : null}</td>
                    <td>{j.material_bez}{aehnlich ? <span className="imhaus-aehnlich"> · ähnlich, andere Toleranz</span> : null}</td>
                  </tr>);
              })}</tbody>
            </table></div>
          </>
        : <p className="klein">Kein geplanter Auftrag mit rotem M braucht dieses Material.</p>}
    </div>));
}
