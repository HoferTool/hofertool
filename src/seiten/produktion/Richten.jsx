// =================================================================
//  INFOS ZUM RICHTEN
//  Reiter der Produktion, um Einrichtblätter in der App zu ändern
//  (Wunsch Patrick, 24. Oktober 2026: „noch eine Option zum
//  Bearbeiten“). Im Pad Mode ist das Blatt nur zum Lesen, hier
//  bearbeitet man es.
//
//  Oben jede Maschine mit dem Auftrag, der dran ist (läuft oder Rüsten,
//  sonst der nächste geplante), und wie es um sein Blatt steht. Darunter
//  ein Feld für jede andere HOCO Nr. und die Blätter, die noch niemand
//  mit „Blatt ist gut“ bestätigt hat. Gibt es noch kein Blatt in der
//  App, aber ein Excel, wird das zuerst eingelesen.
//  Nicht für Externe.
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { ausExcelEinlesen } from "../../einrichtblatt/daten.js";
import { einrichtblattAppOeffnen } from "../../einrichtblatt/Blatt.jsx";

const gemerkt = { park: "alle", hoco: "", typ: "" };

// Was an der Maschine dran ist
function auftragDran(m) {
  const j = ((alt.prod.auftraege || {})[m.id]);
  if (j) return j;
  const naechste = (alt.plan.auftraege || [])
    .filter((a) => a.machine_id === m.id && a.plan_status === "geplant" && a.job_number)
    .sort((x, y) => String(x.planned_from || "").localeCompare(String(y.planned_from || "")));
  return naechste[0] || null;
}

async function staendeLaden(paare) {
  const db = alt.db;
  const nummern = [...new Set(paare.map((p) => p.hoco))];
  const [app, typ] = await Promise.all([
    db.from("einrichtblatt_app").select("hoco_nr,type_id,gut_am,geaendert_am").limit(5000),
    nummern.length ? db.from("hoco_type_data").select("hoco_nr,type_id,blatt_url").in("hoco_nr", nummern) : { data: [] },
  ]);
  const schl = (h, t) => h + "|" + t;
  const apps = new Map((app.data || []).map((b) => [schl(b.hoco_nr, b.type_id), b]));
  const excel = new Map((typ.data || []).filter((x) => x.blatt_url).map((x) => [schl(x.hoco_nr, x.type_id), x.blatt_url]));
  return { apps, excel, offen: (app.data || []).filter((b) => !b.gut_am), schl };
}

function Stand({ app, excel }) {
  if (app && app.gut_am) return <span className="ri-stand ri-stand--gut">In der App, bestätigt</span>;
  if (app) return <span className="ri-stand ri-stand--offen">In der App, noch nicht bestätigt</span>;
  if (excel) return <span className="ri-stand">Nur Excel</span>;
  return <span className="ri-stand ri-stand--keins">Kein Einrichtblatt</span>;
}

// Öffnen zum Bearbeiten; ohne Blatt in der App vorher das Excel einlesen
async function oeffnen(hoco, typId, excel) {
  if (!hoco || !typId) return;
  try {
    const da = await alt.db.from("einrichtblatt_app").select("id").eq("hoco_nr", hoco).eq("type_id", typId).limit(1);
    if (!(da.data || []).length && excel && alt.darfSchreiben()) {
      const typ = ((await alt.ladeTypen()) || []).find((t) => t.id === typId) || { id: typId, name: "" };
      alt.meldung("Das Excel wird eingelesen …");
      const e = await ausExcelEinlesen(hoco, typ, excel);
      if (e.hinweise && e.hinweise.length) alt.meldung("Eingelesen. Bitte prüfen: " + e.hinweise.join(" · "), "warn");
    }
    await einrichtblattAppOeffnen(hoco, typId, { bearbeiten: true });
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

export default function Richten() {
  const prod = alt.prod;
  const [park, setPark] = useState(gemerkt.park);
  const [hoco, setHoco] = useState(gemerkt.hoco);
  const [typ, setTyp] = useState(gemerkt.typ);
  useEffect(() => { Object.assign(gemerkt, { park, hoco, typ }); }, [park, hoco, typ]);
  const typen = prod.typen || [];
  const typName = (id) => ((typen.find((t) => t.id === id) || {}).name || "");

  const zeilen = (prod.maschinen || [])
    .filter((m) => park === "alle" || m.park_id === park)
    .map((m) => ({ m, j: auftragDran(m) }));
  const paare = zeilen.filter((z) => z.j && z.m.type_id).map((z) => ({ hoco: z.j.job_number, typ: z.m.type_id }));
  const schluessel = paare.map((p) => p.hoco + p.typ).join(",");
  const { daten: st, neu } = useDaten(() => staendeLaden(paare), [schluessel]);

  // Nach dem Schliessen des Blatts den Stand neu holen
  const bearbeiten = async (h, t, excel) => {
    await oeffnen(h, t, excel);
    const takt = setInterval(() => {
      if (!document.querySelector(".eba-huelle")) { clearInterval(takt); neu(); }
    }, 800);
  };
  const st0 = st || { apps: new Map(), excel: new Map(), offen: [], schl: (h, t) => h + "|" + t };
  const parks = prod.parks || [];
  const hocoSauber = hoco.trim();
  const darf = alt.darfSchreiben();

  return (
    <div className="ri" data-richten="">
      <p className="ri-erklaerung">Hier änderst du die Einrichtblätter in der App. Im Pad Mode sind sie nur zum Lesen
        und erscheinen dort erst, wenn jemand „Blatt ist gut“ gedrückt hat.</p>

      <div className="karte ri-karte">
        <div className="ri-kopf">
          <h2>An den Maschinen</h2>
          {parks.length > 1 && <select className="ri-eingabe" data-richten-park="" value={park} onChange={(e) => setPark(e.target.value)}>
            <option value="alle">Alle Parks</option>
            {parks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>}
        </div>
        <div className="ri-liste">
          {zeilen.map(({ m, j }) => {
            const k = j && m.type_id ? st0.schl(j.job_number, m.type_id) : null;
            const app = k ? st0.apps.get(k) : null;
            const excel = k ? st0.excel.get(k) : null;
            return (
              <div key={m.id} className="ri-zeile" data-richten-maschine={m.id}>
                <span className="ri-maschine"><b>{m.name}</b> {m.machine_number || ""}
                  <small>{typName(m.type_id) || "kein Typ"}</small></span>
                <span className="ri-auftrag">{j ? <><b>{j.job_number}</b>
                  <small>{j.plan_status === "geplant" ? "als Nächstes" : j.plan_status === "ruesten" ? "Rüsten" : "läuft"}</small></>
                  : <small>kein Auftrag</small>}</span>
                <span>{j && m.type_id && (st ? <Stand app={app} excel={excel} /> : <small>…</small>)}</span>
                <span className="ri-knopf">{j && m.type_id && (app || darf) &&
                  <button className="knopf knopf--klein" data-richten-bearbeiten={j.job_number}
                    onClick={() => bearbeiten(j.job_number, m.type_id, excel)}>
                    {!darf ? "Ansehen" : app ? "Bearbeiten" : excel ? "Excel einlesen" : "Neu anlegen"}</button>}</span>
              </div>
            );
          })}
          {!zeilen.length && <p className="ri-leer">Keine Maschinen.</p>}
        </div>
      </div>

      <div className="karte ri-karte">
        <h2>Andere HOCO Nr.</h2>
        <div className="ri-suche">
          <input className="ri-eingabe" data-richten-hoco="" placeholder="HOCO Nr., z. B. 10844-0049" value={hoco}
            onChange={(e) => setHoco(e.target.value)} />
          <select className="ri-eingabe" data-richten-typ="" value={typ} onChange={(e) => setTyp(e.target.value)}>
            <option value="">Maschinentyp wählen</option>
            {typen.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="knopf knopf--haupt" data-richten-oeffnen="" disabled={!hocoSauber || !typ}
            onClick={async () => {
              let excel = null;
              try {
                const r = await alt.db.from("hoco_type_data").select("blatt_url").eq("hoco_nr", hocoSauber).eq("type_id", typ).limit(1);
                excel = ((r.data || [])[0] || {}).blatt_url || null;
              } catch (f) { /* ohne Excel ein leeres Blatt */ }
              bearbeiten(hocoSauber, typ, excel);
            }}>Öffnen</button>
        </div>
      </div>

      <div className="karte ri-karte">
        <h2>Noch nicht bestätigt</h2>
        <div className="ri-liste">
          {(st ? st0.offen : []).map((b) => (
            <div key={b.hoco_nr + b.type_id} className="ri-zeile ri-zeile--kurz" data-richten-offen={b.hoco_nr}>
              <span className="ri-auftrag"><b>{b.hoco_nr}</b> <small>{typName(b.type_id)}</small></span>
              <span><small>geändert {b.geaendert_am ? alt.datumZeitKurz(b.geaendert_am) : ""}</small></span>
              <span className="ri-knopf"><button className="knopf knopf--klein"
                onClick={() => bearbeiten(b.hoco_nr, b.type_id, null)}>{darf ? "Bearbeiten" : "Ansehen"}</button></span>
            </div>))}
          {st && !st0.offen.length && <p className="ri-leer">Alle Blätter in der App sind bestätigt.</p>}
        </div>
      </div>
    </div>
  );
}
