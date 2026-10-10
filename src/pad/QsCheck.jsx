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
//
//  Seit 1.18.0 wie bei „Maschinen“ zuerst der Park, dann die Liste nur
//  dieses Parks, und je Zeile Zeichnung und WBG (Wunsch Patrick,
//  10. Oktober 2026). Gibt es nur einen Park, entfällt die Wahl.
import { alt } from "../bruecke.jsx";
import { PadKopf, padZeichnen } from "./Pad.jsx";
import { dokZeigen } from "../teile/DokAbruf.jsx";

const gehe = (aendern) => { aendern(alt.pad); padZeichnen(); };

// Die Zustände in der Reihenfolge, in der ein Auftrag sie durchläuft
const ABLAUF = ["geplant", "ruesten", "qs", "laeuft", "fertig"];

export async function qsLaden(p) {
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
  if (p.wo === "qsparks") {
    if (gruppen.length > 1) return { art: "qsparks", gruppen };
    p.qsPark = gruppen.length ? gruppen[0].park.id : null;
    p.qsParkUebersprungen = true;
    p.wo = "qs";
  } else p.qsParkUebersprungen = gruppen.length <= 1;
  const g = gruppen.find((x) => x.park.id === p.qsPark) || gruppen[0] || null;
  if (!g) return { art: "qs", park: null, zeilen: [], zeichnungen: {} };
  p.qsPark = g.park.id;

  // Zeichnung am Auftrag, sonst die der HOCO Nr. — wie im Dashboard
  const nummern = [...new Set(g.zeilen.map((z) => z.j && z.j.job_number).filter(Boolean))];
  const zeichnungen = {};
  if (nummern.length) {
    try {
      const r = await alt.db.from("hoco_parts").select("hoco_nr, zeichnung_url").in("hoco_nr", nummern);
      ((r && r.data) || []).forEach((t) => { if (t.zeichnung_url) zeichnungen[t.hoco_nr] = t.zeichnung_url; });
    } catch (f) { /* Beiwerk */ }
  }
  return { art: "qs", park: g.park, zeilen: g.zeilen, zeichnungen };
}

// Parkwahl wie bei „Maschinen“
export function QsParks({ gruppen }) {
  return (
    <>
      <PadKopf titel="Anlagen Check" zurueck />
      <div className="pad__wahl">
        <img className="pad__wahllogo" src={alt.LOGO_WEISS} alt="Hofer + Co." />
        <div className="pad__kacheln pad__kacheln--parks"
          style={{ "--pad-spalten": Math.min(gruppen.length, 3) }}>
          {gruppen.map(({ park, zeilen }) => (
            <button key={park.id} className="pad-kachel" data-qspark={park.id}
              onClick={() => gehe((p) => { p.qsPark = park.id; p.wo = "qs"; })}>
              <span>{park.name}</span>
              <span className="pad-kachel__nr">{zeilen.length + (zeilen.length === 1 ? " Maschine" : " Maschinen")}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// Zeichnung und WBG im selben Betrachter wie im Dashboard
function dokOeffnen(art, j, adresse) {
  const istWbg = art === "wbg";
  dokZeigen({ art, titel: (istWbg ? "WBG " : "Zeichnung ") + (j.job_number || ""),
    adresse, hoco: j.job_number, auftragId: j.id, fa: j.fa_nr,
    neu: (a) => { if (istWbg) j.wbg_url = a; else j.drawing_url = a; padZeichnen(); } });
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

// Kompakt (Wunsch Patrick, 10. Oktober 2026: „jeden Status sehen ist
// gut, aber kleiner, dass man alles auf einem sehen kann“): bei vielen
// Maschinen auf dem iPad quer in zwei Spalten, die Zustände als
// kleine Tasten, davor Zeichnung und WBG.
export default function QsCheck({ park, zeilen, zeichnungen }) {
  const darf = alt.darfSchreiben();
  return (
    <>
      <PadKopf titel={"Anlagen Check" + (park ? " · " + park.name : "")} zurueck />
      <div className={"pad-qs pad--wischen" + (zeilen.length > 8 ? " pad-qs--zwei" : "")}>
        {!zeilen.length && <p className="pad__leer">Keine Maschinen in diesem Park.</p>}
        {zeilen.map(({ m, j }) => {
          const st = j ? (j.plan_status || "geplant") : null;
          const zeichnung = j ? (j.drawing_url || zeichnungen[j.job_number] || "") : "";
          const wbg = j ? (j.wbg_url || "") : "";
          return (
            <div key={m.id} className="pad-qs__zeile" data-qsmaschine={m.id}>
              <div className="pad-qs__maschine">
                <span className="pad-qs__name">{m.name}</span>
                <span className="pad-qs__nr">{m.machine_number || ""}</span>
              </div>
              <div className={"pad-qs__auftrag" + (j ? "" : " pad-qs__auftrag--leer")}>
                {j ? <span className="pad-qs__hoco">{j.job_number}</span> : "kein Auftrag"}
              </div>
              <div className="pad-qs__doks">
                {j && [["zeichnung", "Zeichnung", zeichnung], ["wbg", "WBG", wbg]].map(([art, text, adresse]) => (
                  <button key={art} data-qsdok={art} onClick={() => dokOeffnen(art, j, adresse)}
                    className={"pad-qs__dok pad-knopf--" + art + (adresse ? "" : " pad-qs__dok--leer")}>{text}</button>
                ))}
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
      </div>
    </>
  );
}
