// =================================================================
//  INFOS ZUM RICHTEN
//  Reiter der Produktion, um Einrichtblätter in der App zu ändern
//  (Wunsch Patrick, 24. Oktober 2026: „noch eine Option zum
//  Bearbeiten“). Im Pad Mode ist das Blatt nur zum Lesen, hier
//  bearbeitet man es.
//
//  Seit 1.181.0 (Wunsch Patrick 25. Oktober 2026: „ganz oben soll die
//  Suche hin, die meisten werden nach HOCO Nr. suchen“): oben ein
//  grosses Suchfeld. Es findet jede HOCO Nr. mit allen Typen, für die
//  es ein Blatt in der App oder ein Excel gibt, und daneben „Neu für
//  Typ …“; die Maschinen darunter schrumpfen auf die passenden. Ohne
//  Suche stehen die Maschinen nach Park, darin nach Typ, mit dem
//  Auftrag, der dran ist (läuft oder Rüsten, sonst der nächste
//  geplante), und wie es um sein Blatt steht. Die Liste „Noch nicht
//  bestätigt“ ist weg: bestätigt wird erst, wenn der Artikel auf eine
//  Maschine kommt, und die Suche zeigt den Stand ohnehin.
//  Gibt es noch kein Blatt in der App, aber ein Excel, wird das zuerst
//  eingelesen. Nicht für Externe.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt, useDaten, useVerzoegert } from "../../bruecke.jsx";
import { einrichtblattAppOeffnen } from "../../einrichtblatt/Blatt.jsx";

const gemerkt = { suche: "" };

// Was an der Maschine dran ist
function auftragDran(m) {
  const j = ((alt.prod.auftraege || {})[m.id]);
  if (j) return j;
  const naechste = (alt.plan.auftraege || [])
    .filter((a) => a.machine_id === m.id && a.plan_status === "geplant" && a.job_number)
    .sort((x, y) => String(x.planned_from || "").localeCompare(String(y.planned_from || "")));
  return naechste[0] || null;
}

const schl = (h, t) => h + "|" + t;
// Zum Vergleichen: nur Buchstaben und Ziffern, „10844 49“ = „10844-49“
const roh = (s) => String(s || "").toLowerCase().replace(/[^0-9a-z]/g, "");

// Was man tippt, als Muster für die Datenbank: „108440049“ und
// „10844 0049“ werden zu „10844-0049“, sonst Leerzeichen als Joker
function muster(q) {
  const t = q.trim();
  const m = t.match(/^(\d{5})[\s\-–_.\/]*(\d{1,4})$/);
  const kern = m ? m[1] + "-" + m[2] : t.replace(/[%_]/g, "").replace(/\s+/g, "%");
  return "%" + kern + "%";
}

async function staendeLaden(paare) {
  const db = alt.db;
  const nummern = [...new Set(paare.map((p) => p.hoco))];
  if (!nummern.length) return { apps: new Map(), excel: new Map() };
  const [app, typ] = await Promise.all([
    db.from("einrichtblatt_app").select("hoco_nr,type_id,gut_am").in("hoco_nr", nummern),
    db.from("hoco_type_data").select("hoco_nr,type_id,blatt_url").in("hoco_nr", nummern),
  ]);
  return {
    apps: new Map((app.data || []).map((b) => [schl(b.hoco_nr, b.type_id), b])),
    excel: new Map((typ.data || []).filter((x) => x.blatt_url).map((x) => [schl(x.hoco_nr, x.type_id), x.blatt_url])),
  };
}

// HOCO Nummern zur Suche, je mit allen Typen, die ein Blatt haben
async function sucheLaden(q) {
  if (q.trim().length < 2) return null;
  const db = alt.db;
  const mu = muster(q);
  const [app, typ, teile] = await Promise.all([
    db.from("einrichtblatt_app").select("hoco_nr,type_id,gut_am").ilike("hoco_nr", mu).limit(300),
    db.from("hoco_type_data").select("hoco_nr,type_id,blatt_url").ilike("hoco_nr", mu).limit(300),
    db.from("hoco_parts").select("hoco_nr,bezeichnung").ilike("hoco_nr", mu).limit(60),
  ]);
  const nr = new Map();
  const holen = (h) => { if (!nr.has(h)) nr.set(h, { hoco: h, bez: "", typen: new Map() }); return nr.get(h); };
  for (const p of teile.data || []) holen(p.hoco_nr).bez = p.bezeichnung || "";
  for (const x of typ.data || []) if (x.blatt_url) {
    const e = holen(x.hoco_nr); const t = e.typen.get(x.type_id) || {}; t.excel = x.blatt_url; e.typen.set(x.type_id, t);
  }
  for (const b of app.data || []) {
    const e = holen(b.hoco_nr); const t = e.typen.get(b.type_id) || {}; t.app = b; e.typen.set(b.type_id, t);
  }
  // Genau getroffen zuerst, sonst nach Nummer
  const ziel = roh(q);
  return [...nr.values()].sort((a, b) => (roh(b.hoco) === ziel) - (roh(a.hoco) === ziel)
    || a.hoco.localeCompare(b.hoco, "de", { numeric: true })).slice(0, 40);
}

function Stand({ app, excel }) {
  if (app && app.gut_am) return <span className="ri-stand ri-stand--gut">In der App, bestätigt</span>;
  if (app) return <span className="ri-stand ri-stand--offen">In der App, noch nicht bestätigt</span>;
  if (excel) return <span className="ri-stand">Nur Excel</span>;
  return <span className="ri-stand ri-stand--keins">Kein Einrichtblatt</span>;
}

const knopfText = (darf, app, excel) => !darf ? "Ansehen" : app ? "Bearbeiten" : excel ? "Excel einlesen" : "Neu anlegen";

// Öffnen zum Bearbeiten; ohne Blatt in der App liest es sich dort selbst
// aus dem Excel vor (seit 1.178.0)
async function oeffnen(hoco, typId) {
  if (!hoco || !typId) return;
  try { await einrichtblattAppOeffnen(hoco, typId, { bearbeiten: true }); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

// Maschinen nach Park (Reihenfolge wie in der Produktion), darin nach
// Typ als Block in der Reihenfolge der Planwand
function gruppieren(zeilen, parks, typName) {
  const ergebnis = [];
  const parkReihe = [...parks.map((p) => p.id), null];
  for (const pid of parkReihe) {
    const inPark = zeilen.filter((z) => (pid === null ? !parks.some((p) => p.id === z.m.park_id) : z.m.park_id === pid));
    if (!inPark.length) continue;
    const typen = [];
    for (const z of inPark) {
      let t = typen.find((x) => x.id === (z.m.type_id || ""));
      if (!t) { t = { id: z.m.type_id || "", name: typName(z.m.type_id) || "Ohne Typ", zeilen: [] }; typen.push(t); }
      t.zeilen.push(z);
    }
    const park = parks.find((p) => p.id === pid);
    ergebnis.push({ id: pid || "ohne", name: park ? park.name : "Ohne Park", typen });
  }
  return ergebnis;
}

export default function Richten() {
  const prod = alt.prod;
  const [suche, setSuche] = useState(gemerkt.suche);
  const frage = useVerzoegert(suche, 250);
  const feld = useRef(null);
  useEffect(() => { gemerkt.suche = suche; }, [suche]);
  // Am Computer gleich ins Suchfeld tippen; am Tablet nicht, sonst
  // springt die Tastatur auf
  useEffect(() => { if (feld.current && matchMedia("(pointer: fine)").matches) feld.current.focus(); }, []);
  const typen = prod.typen || [];
  const typName = (id) => ((typen.find((t) => t.id === id) || {}).name || "");
  const darf = alt.darfSchreiben();

  const alle = (prod.maschinen || []).map((m) => ({ m, j: auftragDran(m) }));
  const q = roh(frage);
  const zeilen = !q ? alle : alle.filter(({ m, j }) =>
    roh([m.name, m.machine_number].join(" ")).includes(q) || (j && roh(j.job_number).includes(q))
    || roh(typName(m.type_id)).includes(q));
  const paare = alle.filter((z) => z.j && z.m.type_id).map((z) => ({ hoco: z.j.job_number, typ: z.m.type_id }));
  const schluessel = paare.map((p) => p.hoco + p.typ).join(",");
  const { daten: st, neu } = useDaten(() => staendeLaden(paare), [schluessel]);
  const { daten: treffer, neu: sucheNeu, laedt: sucheLaedt } = useDaten(() => sucheLaden(frage), [frage]);

  // Nach dem Schliessen des Blatts den Stand neu holen
  const bearbeiten = async (h, t) => {
    await oeffnen(h, t);
    const takt = setInterval(() => {
      if (!document.querySelector(".eba-huelle")) { clearInterval(takt); neu(); sucheNeu(); }
    }, 800);
  };
  const st0 = st || { apps: new Map(), excel: new Map() };
  const gruppen = gruppieren(zeilen, prod.parks || [], typName);
  // Wo läuft eine HOCO Nr. gerade? Steht bei den Treffern dabei
  const anMaschine = (h, t) => alle.filter((z) => z.j && z.j.job_number === h && z.m.type_id === t)
    .map((z) => z.m.machine_number || z.m.name).join(", ");

  const maschinenZeile = ({ m, j }) => {
    const k = j && m.type_id ? schl(j.job_number, m.type_id) : null;
    const app = k ? st0.apps.get(k) : null;
    const excel = k ? st0.excel.get(k) : null;
    return (
      <div key={m.id} className="ri-zeile" data-richten-maschine={m.id}>
        <span className="ri-maschine"><b>{m.name}</b> {m.machine_number || ""}</span>
        <span className="ri-auftrag">{j ? <><b>{j.job_number}</b>
          <small>{j.plan_status === "geplant" ? "als Nächstes" : j.plan_status === "ruesten" ? "Rüsten" : "läuft"}</small></>
          : <small>kein Auftrag</small>}</span>
        <span>{j && m.type_id && (st ? <Stand app={app} excel={excel} /> : <small>…</small>)}</span>
        <span className="ri-knopf">{j && m.type_id && (app || darf) &&
          <button className="knopf knopf--klein" data-richten-bearbeiten={j.job_number}
            onClick={() => bearbeiten(j.job_number, m.type_id)}>{knopfText(darf, app, excel)}</button>}</span>
      </div>
    );
  };

  return (
    <div className="ri" data-richten="">
      <div className="ri-suchkopf">
        <input ref={feld} type="search" inputMode="search" enterKeyHint="search" className="ri-eingabe ri-suchfeld"
          data-richten-suche="" placeholder="HOCO Nr. suchen, z. B. 10844-0049" value={suche}
          onChange={(e) => setSuche(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && suche) { e.preventDefault(); setSuche(""); } }} />
        {suche && <button className="ri-leeren" aria-label="Suche leeren" onClick={() => { setSuche(""); feld.current && feld.current.focus(); }}>✕</button>}
      </div>

      {q.length >= 2 && (
        <div className="karte ri-karte" data-richten-treffer="">
          <h2>HOCO Nr.</h2>
          <div className="ri-liste">
            {(treffer || []).map((t) => <Treffer key={t.hoco} t={t} typen={typen} typName={typName} darf={darf}
              anMaschine={anMaschine} bearbeiten={bearbeiten} />)}
            {treffer && !treffer.length && !sucheLaedt && <p className="ri-leer">Keine HOCO Nr. gefunden.
              {darf && /^\d{5}-?\d{4}$/.test(frage.trim()) && <> Neu anlegen: <NeuFuerTyp hoco={frage.trim().replace(/^(\d{5})-?/, "$1-")}
                typen={typen} vorhanden={new Map()} bearbeiten={bearbeiten} /></>}</p>}
            {!treffer && <p className="ri-leer">Wird gesucht …</p>}
          </div>
        </div>
      )}

      {(!q || gruppen.length > 0) && <div className="karte ri-karte">
        <h2>{q ? "Passende Maschinen" : "An den Maschinen"}</h2>
        {gruppen.map((p) => (
          <div key={p.id} className="ri-park" data-richten-park={p.id}>
            <h3 className="ri-park__name">{p.name}</h3>
            {p.typen.map((t) => (
              <div key={t.id} className="ri-typ" data-richten-typ-gruppe={t.id}>
                <h4 className="ri-typ__name">{t.name}</h4>
                <div className="ri-liste">{t.zeilen.map(maschinenZeile)}</div>
              </div>
            ))}
          </div>
        ))}
        {!gruppen.length && <p className="ri-leer">Keine Maschinen.</p>}
      </div>}

      <p className="ri-erklaerung">Hier änderst du die Einrichtblätter in der App. Im Pad Mode sind sie nur zum Lesen
        und erscheinen dort erst, wenn jemand „EB OK“ gedrückt hat.</p>
    </div>
  );
}

// Eine HOCO Nr. mit allen ihren Blättern
function Treffer({ t, typen, typName, darf, anMaschine, bearbeiten }) {
  const liste = [...t.typen.entries()].sort((a, b) => typName(a[0]).localeCompare(typName(b[0]), "de"));
  return (
    <div className="ri-treffer" data-richten-hoco-treffer={t.hoco}>
      <div className="ri-treffer__kopf"><b>{t.hoco}</b>{t.bez && <small>{t.bez}</small>}</div>
      {liste.map(([typId, x]) => {
        const wo = anMaschine(t.hoco, typId);
        return (
          <div key={typId} className="ri-zeile ri-zeile--treffer" data-richten-treffer-typ={typId}>
            <span className="ri-maschine">{typName(typId) || "Unbekannter Typ"}{wo && <small>läuft auf {wo}</small>}</span>
            <span><Stand app={x.app} excel={x.excel} /></span>
            <span className="ri-knopf">{(x.app || darf) &&
              <button className="knopf knopf--klein" data-richten-bearbeiten={t.hoco}
                onClick={() => bearbeiten(t.hoco, typId)}>{knopfText(darf, x.app, x.excel)}</button>}</span>
          </div>
        );
      })}
      {!liste.length && <p className="ri-leer">Noch kein Einrichtblatt.</p>}
      {darf && <div className="ri-treffer__neu"><NeuFuerTyp hoco={t.hoco} typen={typen} vorhanden={t.typen} bearbeiten={bearbeiten} /></div>}
    </div>
  );
}

// Blatt für einen Typ, der bei dieser HOCO Nr. noch keins hat
function NeuFuerTyp({ hoco, typen, vorhanden, bearbeiten }) {
  const frei = typen.filter((x) => !vorhanden.has(x.id));
  if (!frei.length) return null;
  return (
    <select className="ri-eingabe" data-richten-neu={hoco} value="" onChange={(e) => e.target.value && bearbeiten(hoco, e.target.value)}>
      <option value="">+ Blatt für anderen Typ …</option>
      {frei.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
  );
}
