// =================================================================
//  HEUTE NOCH OFFEN (seit 1.186.0, Wunsch Patrick 26. Oktober 2026:
//  „auf welchen Maschinen am aktuellen Tag die Mengen noch nicht
//  gemeldet wurden, und die Stückzeit noch nicht hinterlegt ist“)
//
//  Dieselben zwei Mahnungen wie im Pad Mode an der Maschine, nur für
//  alle Maschinen der eigenen Parks zusammen:
//  - Stückzahl: Auftrag läuft, und heute ist für die Maschine noch
//    kein Zählerstand gemeldet (weder für heute noch heute geschrieben).
//    Samstag und Sonntag nicht.
//  - Stückzeit: Auftrag läuft oder wird gerüstet, die Maschine hat
//    einen Typ, und für HOCO Nr. und Typ ist keine Stückzeit da.
//  Steht nur da, wenn etwas fehlt. Ein Tipp auf die Maschine öffnet
//  ihr Dashboard im Pad Mode, wo beides eingetragen wird.
//  Seit 1.187.0 blinkt die Karte rot wie die Kacheln im Pad und zeigt
//  dieselben Bilder (Wunsch Patrick 26. Oktober 2026: „rot blinken und
//  Pablo anzeigen“); welche, steht nur in app_config.pad_mahnbilder.
//  Nicht für Externe und das Dienstkonto (Externe sehen die
//  Startseite ohnehin nicht).
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { mahnBilder } from "../../daten/mahnbilder.js";

const keine = async () => null;

export async function heuteOffenLaden() {
  // Parks zuerst: ohne ihre Namen weiss parkErlaubt nicht, welcher Park
  // zu Kurz- oder Langdrehern gehört
  await alt.ladeParks(false);
  const [maschinen, laufend] = await Promise.all([alt.ladeMaschinen(false), alt.ladeLaufendeAuftraege()]);
  // Maschinen externer Parks mahnt die Karte nicht (Wunsch Patrick 26. Oktober 2026)
  const zeilen = maschinen.filter((m) => laufend[m.id] && !alt.parkIstExtern(m.park_id)).map((m) => ({ m, j: laufend[m.id] }));
  if (!zeilen.length) return { stk: [], zeit: [] };

  const jetzt = new Date();
  const heute = alt.isoDatum(jetzt);
  const werktag = jetzt.getDay() !== 0 && jetzt.getDay() !== 6;

  // Stückzahl: was heute gemeldet wurde, auch für den Arbeitstag davor
  // („Wurde heute schon produziert? Nein“ legt den Stand auf gestern)
  let stk = [];
  const laeuft = zeilen.filter((z) => z.j.plan_status === "laeuft");
  if (werktag && laeuft.length) {
    const ab = alt.isoDatum(new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - 4));
    const r = await alt.zeitlimit(alt.db.from("production_records")
      .select("machine_id, record_date, created_at, updated_at")
      .in("machine_id", laeuft.map((z) => z.m.id)).gte("record_date", ab), 10000, "Stückzahlen");
    if (r.error) throw r.error;
    const gemeldet = new Set();
    (r.data || []).forEach((p) => {
      const zeit = p.updated_at || p.created_at;
      if (p.record_date === heute || (zeit && alt.isoDatum(new Date(zeit)) === heute)) gemeldet.add(p.machine_id);
    });
    stk = laeuft.filter((z) => !gemeldet.has(z.m.id));
  }

  // Stückzeit je HOCO Nr. und Typ
  let zeit = [];
  const mitTyp = zeilen.filter((z) => z.m.type_id && z.j.job_number);
  if (mitTyp.length) {
    const r = await alt.zeitlimit(alt.db.from("hoco_type_data")
      .select("hoco_nr, type_id, stueckzeit_s")
      .in("hoco_nr", [...new Set(mitTyp.map((z) => z.j.job_number))]), 10000, "Stückzeiten");
    if (r.error) throw r.error;
    const da = new Set((r.data || []).filter((d) => d.stueckzeit_s !== null && d.stueckzeit_s !== undefined
      && Number(d.stueckzeit_s) > 0).map((d) => d.hoco_nr + "|" + d.type_id));
    zeit = mitTyp.filter((z) => !da.has(z.j.job_number + "|" + z.m.type_id));
  }
  return { stk, zeit };
}

function padZeigen(m) {
  alt.padOeffnen({ wo: "maschine", parkId: m.park_id, typId: m.type_id || "__ohne",
    typUebersprungen: false, maschineId: m.id, reiter: "uebersicht" });
}

function Maschinen({ liste, art }) {
  return (
    <div className="heuteoffen__liste">
      {liste.map(({ m, j }) => (
        <button key={m.id} className="heuteoffen__maschine" data-heuteoffen={art} data-maschine={m.id}
          title="Im Pad Mode öffnen" onClick={() => padZeigen(m)}>
          <b>{m.machine_number || m.name}</b>
          {j.job_number && <span className="klein">{j.job_number}</span>}
        </button>))}
    </div>
  );
}

export default function HeuteOffen({ auffrischen }) {
  const zeigen = !alt.istExtern() && alt.meineRolle() !== "dienst";
  const { daten } = useDaten(zeigen ? heuteOffenLaden : keine, [auffrischen, zeigen]);
  const offen = !!(daten && (daten.stk.length || daten.zeit.length));
  // Bilder erst holen, wenn die Karte wirklich dasteht
  const [bilder, setBilder] = useState({});
  useEffect(() => {
    if (!offen) return;
    let weg = false;
    mahnBilder().then((b) => { if (!weg) setBilder(b || {}); });
    return () => { weg = true; };
  }, [offen]);
  if (!offen) return null;
  return (
    <section className="karte heuteoffen heuteoffen--nervt" id="db-heuteoffen">
      <h2>⚠ Heute noch offen</h2>
      {daten.stk.length > 0 && <div className="heuteoffen__gruppe" id="db-heuteoffen-stk">
        {bilder.stueckzahl && <img className="heuteoffen__foto" data-mahnbild="stueckzahl" src={bilder.stueckzahl} alt="" />}
        <div className="heuteoffen__titel">Noch keine Stückzahl gemeldet
          {" "}<span className="marke">{daten.stk.length}</span></div>
        <Maschinen liste={daten.stk} art="stk" />
      </div>}
      {daten.zeit.length > 0 && <div className="heuteoffen__gruppe" id="db-heuteoffen-zeit">
        {bilder.stueckzeit && <img className="heuteoffen__foto" data-mahnbild="stueckzeit" src={bilder.stueckzeit} alt="" />}
        <div className="heuteoffen__titel">Stückzeit nicht hinterlegt
          {" "}<span className="marke">{daten.zeit.length}</span></div>
        <Maschinen liste={daten.zeit} art="zeit" />
      </div>}
    </section>
  );
}
