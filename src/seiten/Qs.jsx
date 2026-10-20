// =================================================================
//  SEITE QS (1.77.0, Wunsch Patrick 16. Oktober 2026)
//  Ersetzt den Zustand „QS Check“. Zu jedem Auftrag an einer Maschine
//  (läuft oder Rüsten) meldet man, dass Ausschussteile aussortiert
//  wurden: Stück, die man am Counter abziehen soll, und eine Notiz.
//  Oben stehen die offenen Meldungen zum Quittieren, darunter die
//  Maschinen mit ihrem Auftrag. Daten in src/daten/qs.js. Nicht für
//  Externe (seiteSichtbar).
//  Seit 1.85.0 nur die eigenen Parks (Wunsch Patrick 16. Oktober 2026:
//  „nur für seinen Park, ausser Admin“): Maschinen wie in der
//  Produktion (ladeMaschinen), Meldungen nur zu diesen Maschinen. Die
//  Datenbank prüft dasselbe (sql/qs-meldungen-park.sql), auch im Pad.
// =================================================================
import { alt, useDaten } from "../bruecke.jsx";
import { qsFenster } from "../teile/QsFenster.jsx";
import { qsMeldungenLaden, qsQuittieren, tabelleFehlt, wannText } from "../daten/qs.js";

const nachNummer = (a, b) => String(a.machine_number || "").localeCompare(
  String(b.machine_number || ""), "de", { numeric: true });

async function laden() {
  // Parks zuerst: ohne ihre Namen weiss parkErlaubt nicht, welcher Park
  // zu Kurz- oder Langdrehern gehört
  await alt.ladeParks(false);
  const [maschinen, laufend] = await Promise.all([alt.ladeMaschinen(false), alt.ladeLaufendeAuftraege()]);
  let meldungen = [], fehlt = false;
  try { meldungen = await qsMeldungenLaden(); }
  catch (f) { if (tabelleFehlt(f)) fehlt = true; else throw f; }
  const meine = new Set(maschinen.map((m) => m.id));
  if (!alt.istAdmin()) meldungen = meldungen.filter((me) => meine.has(me.machine_id));
  const zeilen = maschinen.filter((m) => laufend[m.id]).sort(nachNummer)
    .map((m) => ({ m, j: laufend[m.id] }));
  return { maschinen, zeilen, meldungen, fehlt };
}

export function maschinenName(m) {
  return m ? alt.maschineZielText(m) : "Maschine";
}

// Eine offene Meldung, so wie sie auch im Pad steht
export function MeldungKarte({ me, maschine, nachher }) {
  const quittieren = async () => { if (await qsQuittieren(me)) nachher && nachher(); };
  return (
    <div className="qs-meldung" data-qsmeldung={me.id}>
      <div className="qs-meldung__kopf">
        <span className="qs-meldung__wo">{maschinenName(maschine)}{me.hoco_nr ? " · " + me.hoco_nr : ""}</span>
        <span className="qs-meldung__wann">{wannText(me.erstellt_am)}{me.erstellt_name ? " · " + me.erstellt_name : ""}</span>
      </div>
      <div className="qs-meldung__zahl"><b>{alt.zahlText(me.stueck)}</b> Stk. am Counter abziehen</div>
      {me.notiz && <div className="qs-meldung__notiz">{me.notiz}</div>}
      <button className="knopf knopf--haupt qs-meldung__quittieren" data-qsquittieren={me.id}
        onClick={quittieren}>Quittieren</button>
    </div>
  );
}

// Stand „1'200 von 5'000“ mit Balken, wie im QS Check des Pad Mode
export function QsFortschritt({ j }) {
  const stand = Number(j.stand) || 0;
  const ziel = Number(j.target_quantity) || 0;
  const prozent = ziel ? Math.min(100, Math.round(stand / ziel * 100)) : 0;
  return (
    <span className="qs-fort__inhalt">
      <span className="qs-fort__zahl"><b>{alt.zahlText(stand)}</b> {ziel ? "von " + alt.zahlText(ziel) : "Stk"}</span>
      <span className="qs-fort__balken"><i style={{ width: prozent + "%" }} /></span>
    </span>
  );
}

export default function Qs({ auffrischen }) {
  const { daten, fehler, neu } = useDaten(laden, [auffrischen]);

  // Meldungen von anderen Geräten kommen über den laufenden Abgleich
  // (syncTabellen „qs“ in app.js)

  if (!daten) {
    return <><h1 className="seitentitel">Qualitätssicherung</h1>
      <p className="klein">{fehler ? alt.fehlertext(fehler) : "Wird geladen …"}</p></>;
  }
  const { maschinen, zeilen, meldungen, fehlt } = daten;
  const maschineVon = (id) => maschinen.find((m) => m.id === id) || null;
  const offenJe = {};
  meldungen.forEach((me) => { offenJe[me.machine_id] = (offenJe[me.machine_id] || 0) + 1; });

  return (
    <>
      <h1 className="seitentitel">Qualitätssicherung</h1>
      <p className="klein qs-erklaerung">Wurden Ausschussteile aussortiert, hier melden. Die Meldung steht im Pad Mode
        der Maschine anstelle des Wetters, bis jemand quittiert. Abgezogen wird nichts von selbst.</p>
      {fehlt && <p className="qs-fehlt">Die Datenbank kennt die Meldungen der Qualitätssicherung noch nicht. Bitte sql/qs-meldungen.sql ausführen.</p>}

      <h2 className="qs-titel">Offene Meldungen{meldungen.length ? " (" + meldungen.length + ")" : ""}</h2>
      {meldungen.length
        ? <div className="qs-meldungen" id="qs-meldungen">
            {meldungen.slice().reverse().map((me) => (
              <MeldungKarte key={me.id} me={me} maschine={maschineVon(me.machine_id)} nachher={neu} />))}
          </div>
        : <p className="klein qs-leer" id="qs-keine">Keine offenen Meldungen.</p>}

      <h2 className="qs-titel">Laufende Aufträge</h2>
      {zeilen.length
        ? <div className="qs-maschinen" id="qs-maschinen">
            {zeilen.map(({ m, j }) => {
              const f = alt.auftragFarbe(j, j.material_bez || "");
              return (
                <div key={m.id} className="qs-maschine" data-qsmaschine={m.id}>
                  <span className="qs-maschine__farbe" style={f ? { background: f.hex } : undefined} />
                  <div className="qs-maschine__text">
                    <b>{m.name}{m.machine_number ? <> <span className="qs-nb">{m.machine_number}</span></> : null}</b>
                    <span>{j.job_number || "ohne HOCO Nr."} · {(alt.PLANSTATUS[j.plan_status] || {}).name || ""}</span>
                    {!!offenJe[m.id] && <span className="qs-maschine__offen">
                      {offenJe[m.id] === 1 ? "1 offene Meldung" : offenJe[m.id] + " offene Meldungen"}</span>}
                  </div>
                  {/* Der Fortschritt ist der Knopf: er öffnet das grosse Fenster zum Auftrag (seit 1.78.0) */}
                  <button className="qs-fort" data-qsmelden={m.id} disabled={fehlt}
                    onClick={async () => { if (await qsFenster(j, m)) neu(); }}>
                    <QsFortschritt j={j} /><span className="qs-fort__text">Ausschuss melden</span></button>
                </div>
              );
            })}
          </div>
        : <p className="klein qs-leer">Gerade läuft auf keiner Maschine ein Auftrag.</p>}
    </>
  );
}
