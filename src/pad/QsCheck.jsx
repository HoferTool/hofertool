// =================================================================
//  PAD MODE: ANLAGEN CHECK (früher QS Check, umbenannt in 1.16.1)
//  Alle Maschinen untereinander, je mit dem Auftrag, der gerade dran
//  ist, und am Ende der Zeile der Zustand zum direkten Wechseln
//  (Wunsch Patrick, 10. Oktober 2026). So geht man beim Rundgang
//  durch die Halle alle Maschinen an einem Tablet durch, ohne jede
//  einzeln zu öffnen.
//
//  „Dran“ ist, was läuft, gerüstet oder geprüft wird (dieselbe Wahl
//  wie im Dashboard). Steht nichts davon auf der Maschine, der
//  nächste geplante Auftrag — der kommt als Nächstes an die Reihe und
//  lässt sich so gleich auf Rüsten setzen. Gewechselt wird über
//  zustandSetzen, also mit denselben Regeln wie überall: Beenden
//  fragt nach und nach der Stückzeit, der nächste rückt auf Rüsten.
// =================================================================
import { alt } from "../bruecke.jsx";
import { PadKopf, padZeichnen } from "./Pad.jsx";

// Die Zustände in der Reihenfolge, in der ein Auftrag sie durchläuft
const ABLAUF = ["geplant", "ruesten", "qs", "laeuft", "fertig"];

export async function qsLaden() {
  const [parks, maschinen, laufend, offen] = await Promise.all([
    alt.ladeParks(false),
    alt.ladeMaschinen(false),
    alt.ladeLaufendeAuftraege(),
    alt.db.from("jobs").select("*").is("ended_at", null)
      .not("planned_from", "is", null).order("planned_from")
      .then((r) => (r && r.data) || []),
  ]);
  // Je Maschine der früheste noch geplante Auftrag
  const naechster = {};
  offen.forEach((j) => {
    if (!j.machine_id || !j.planned_from || j.ended_at || j.plan_status === "fertig") return;
    const da = naechster[j.machine_id];
    if (!da || String(j.planned_from) < String(da.planned_from)) naechster[j.machine_id] = j;
  });
  const gruppen = parks.map((park) => ({
    park,
    zeilen: maschinen.filter((m) => m.park_id === park.id)
      .map((m) => ({ m, j: laufend[m.id] || naechster[m.id] || null })),
  })).filter((g) => g.zeilen.length);
  return { art: "qs", gruppen };
}

async function wechseln(j, wahl) {
  if (!j || wahl === (j.plan_status || "geplant")) return;
  try {
    if (wahl === "fertig") {
      const ok = await alt.nachfragen({
        titel: "Auftrag beenden",
        text: "Auftrag " + j.job_number + " wird abgeschlossen. "
          + "Der nächste Auftrag auf dieser Maschine rückt nach und steht auf Rüsten.",
        bestaetigen: "Auftrag beenden",
      });
      if (!ok) return;
    }
    const r = await alt.zustandSetzen(j, wahl);
    alt.meldung(j.job_number + ": " + (wahl === "fertig" ? "beendet." : alt.PLANSTATUS[wahl].name + ".")
      + (r.hinweis ? " " + r.hinweis : ""), "gut");
    try { alt.prod.auftraege = await alt.ladeLaufendeAuftraege(); } catch (g) { /* egal */ }
    padZeichnen();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

export default function QsCheck({ gruppen }) {
  const darf = alt.darfSchreiben();
  return (
    <>
      <PadKopf titel="Anlagen Check" zurueck />
      <div className="pad-qs pad--wischen">
        {!gruppen.length && <p className="pad__leer">Keine Maschinen angelegt.</p>}
        {gruppen.map(({ park, zeilen }) => (
          <section key={park.id} className="pad-qs__park">
            {gruppen.length > 1 && <h2 className="pad-qs__parkname">{park.name}</h2>}
            {zeilen.map(({ m, j }) => {
              const st = j ? (j.plan_status || "geplant") : null;
              return (
                <div key={m.id} className="pad-qs__zeile" data-qsmaschine={m.id}>
                  <div className="pad-qs__maschine">
                    <span className="pad-qs__nr">{m.machine_number || ""}</span>
                    <span className="pad-qs__name">{m.name}</span>
                  </div>
                  <div className={"pad-qs__auftrag" + (j ? "" : " pad-qs__auftrag--leer")}>
                    {j
                      ? <>
                          <span className="pad-qs__hoco">{j.job_number}</span>
                          {!!j.target_quantity &&
                            <span className="pad-qs__menge">
                              {alt.zahlText(j.stand || 0)} / {alt.zahlText(j.target_quantity)} Stk.
                            </span>}
                        </>
                      : "kein Auftrag"}
                  </div>
                  <div className="pad-qs__zustaende">
                    {j && ABLAUF.map((k) => (
                      <button key={k} data-qszustand={k} disabled={!darf}
                        className={"pad-qs__knopf" + (k === st ? " pad-qs__knopf--an pad-zustand--" + k : "")}
                        onClick={() => wechseln(j, k)}>
                        <span className="pad-qs__zeichen">{alt.PLANSTATUS[k].zeichen}</span>
                        <span>{alt.PLANSTATUS[k].name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}
