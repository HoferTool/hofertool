// =================================================================
//  FORTSCHRITT
//  Wie stehen die Aufträge zeitlich? Für jeden laufenden Auftrag
//  wird verglichen, wie viel bis heute hätte fertig sein sollen und
//  wie viel es wirklich ist (alt.fortschrittRechnen, das auch der
//  Pad Mode braucht). Die Abweichung in Stück wird über die
//  Tagesleistung in Tage umgerechnet.
//
//  Aufträge und Parks kommen aus den Grunddaten der Produktion
//  (plan.auftraege, prod.parks), damit nichts doppelt geladen wird.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt, useGemerkt } from "../../bruecke.jsx";

// Die Auswahl bleibt beim Seitenwechsel stehen
const gemerkt = { park: "alle", nur: "alle" };

const NUR = [["alle", "Alle Aufträge"], ["verzug", "Nur im Verzug"], ["vorsprung", "Nur voraus"]];

const tagText = (t) => (t > 0 ? "+" : "") + t.toFixed(1).replace(".", ",") + " Tage";

function Balken({ tage, schlimmste }) {
  const breite = (Math.min(1, Math.abs(tage) / schlimmste) * 100).toFixed(1) + "%";
  const minus = tage < 0;
  return (
    <div className="fo-balken">
      <div className="fo-balken__links">
        {minus && <span className="fo-stab fo-stab--minus" style={{ width: breite }} />}
      </div>
      <div className="fo-balken__mitte" />
      <div className="fo-balken__rechts">
        {!minus && <span className="fo-stab fo-stab--plus" style={{ width: breite }} />}
      </div>
    </div>
  );
}

export default function Fortschritt({ neuLaden }) {
  const [park, setPark] = useState(gemerkt.park);
  const [nur, setNur] = useState(gemerkt.nur);
  useGemerkt(gemerkt, { park, nur });

  // Das Auftragsfenster frischt nach dem Speichern sonst die Planwand
  // auf. Hier soll stattdessen der Fortschritt neu laden.
  const ziel = useRef(null);
  useEffect(() => {
    const el = ziel.current;
    if (el) el.nachPlanAenderung = () => { if (el.isConnected) neuLaden(); };
  }, [neuLaden]);

  const auftraege = alt.plan.auftraege || [];
  const parks = alt.prod.parks || [];
  const parkPlatz = (id) => (parks.findIndex((p) => p.id === id) + 1) || 99;

  const liste = auftraege
    .filter((j) => park === "alle" || j.park_id === park)
    .map((j) => ({ j, r: alt.fortschrittRechnen(j) }))
    .filter((x) => x.r)
    .filter((x) => nur === "alle"
      || (nur === "verzug" && x.r.tage < -0.5)
      || (nur === "vorsprung" && x.r.tage > 0.5))
    // Dieselbe Reihenfolge wie auf der Planwand: erst der Park, dann
    // die Maschine in ihrer dortigen Anordnung, dann der Starttag.
    .sort((a, c) => (parkPlatz(a.j.park_id) - parkPlatz(c.j.park_id))
      || ((a.j.maschine_reihenfolge || 0) - (c.j.maschine_reihenfolge || 0))
      || String(a.j.planned_from || "").localeCompare(String(c.j.planned_from || "")));

  const schlimmste = Math.max(2, ...liste.map((x) => Math.abs(x.r.tage)));
  const imVerzug = liste.filter((x) => x.r.tage < -0.5).length;
  const imPlan = liste.filter((x) => Math.abs(x.r.tage) <= 0.5).length;
  const voraus = liste.filter((x) => x.r.tage > 0.5).length;

  return (
    <div ref={ziel} className="react-seite">
      <div className="fo-zahlen">
        <div className="fo-zahl fo-zahl--minus"><span>{imVerzug}</span>im Verzug</div>
        <div className="fo-zahl"><span>{imPlan}</span>im Plan</div>
        <div className="fo-zahl fo-zahl--plus"><span>{voraus}</span>voraus</div>
      </div>

      <div className="fo-filter">
        <select id="fo-park" value={park} onChange={(e) => setPark(e.target.value)}>
          <option value="alle">Alle Parks</option>
          {parks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select id="fo-nur" value={nur} onChange={(e) => setNur(e.target.value)}>
          {NUR.map(([w, t]) => <option key={w} value={w}>{t}</option>)}
        </select>
      </div>

      {liste.length
        ? <section className="karte">
            <div className="fo-kopf"><span>Auftrag</span>
              <span className="fo-kopf__mitte">Verzug ← im Plan → Vorsprung</span>
              <span className="rechts">Tage</span></div>
            {liste.map(({ j, r }) => (
              <div key={j.id} className="fo-zeile" data-fojob={j.id}
                onClick={() => alt.planAuftragDialog(j, ziel.current)}>
                <div className="fo-wer">
                  <strong>{j.job_number || ""}</strong>
                  <span className="klein">
                    {j.maschine_nr && <><b className="fo-mnr">{j.maschine_nr}</b> </>}
                    {j.maschine || ""}
                    {r.art === "nichtgestartet"
                      ? " · noch nicht gestartet"
                      : " · " + alt.zahlText(j.stand || 0) + " von "
                        + alt.zahlText(j.target_quantity || 0) + " Stück"}
                  </span>
                </div>
                <Balken tage={r.tage} schlimmste={schlimmste} />
                <div className={"fo-tage" + (r.tage < -0.5 ? " fo-tage--minus"
                  : (r.tage > 0.5 ? " fo-tage--plus" : ""))}>
                  {tagText(r.tage)}
                  {r.art === "laeuft" && !!r.stueck &&
                    <span className="klein">{(r.stueck > 0 ? "+" : "") + alt.zahlText(r.stueck)} Stk</span>}
                </div>
              </div>
            ))}
          </section>
        : <p className="hinweis">Keine laufenden Aufträge mit einer Fertigungsmenge.
            Gerechnet wird nur für Aufträge, die laufen und eine Stückzahl haben.</p>}

      <p className="klein">Gerechnet wird aus Fertigungsmenge und geplanten Tagen die
        Tagesleistung. Daraus ergibt sich, wie viele Stück bis heute fertig sein
        sollten. Die Abweichung wird über dieselbe Tagesleistung in Tage
        umgerechnet. Aufträge, die überfällig sind und noch nicht laufen, zählen
        mit den vergangenen Arbeitstagen als Verzug.</p>
    </div>
  );
}
