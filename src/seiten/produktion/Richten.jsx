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
//  Typ …“. Darunter seit 1.182.0 statt der Maschinen die zuletzt
//  bearbeiteten Blätter (Patrick: „an den Maschinen braucht es gar
//  nicht, die letzten“), nach Park und darin nach Typ, nur Typen aus
//  den eigenen Parks. Was die App nur aus dem Excel eingelesen hat und
//  niemand angefasst hat, zählt nicht als bearbeitet. Die Liste
//  „Noch nicht bestätigt“ ist weg: bestätigt wird erst, wenn der
//  Artikel auf eine Maschine kommt, und die Suche zeigt den Stand.
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

const JE_TYP = 6;

// Zuletzt bearbeitete Blätter. Das Einlesen im Hintergrund legt Blätter
// mit erstellt_am = geaendert_am an; erst ein Speichern von Hand oder
// „EB OK“ macht daraus ein bearbeitetes.
async function letzteLaden(typIds) {
  if (!typIds.length) return [];
  const r = await alt.db.from("einrichtblatt_app").select("hoco_nr,type_id,gut_am,erstellt_am,geaendert_am")
    .in("type_id", typIds).order("geaendert_am", { ascending: false }).range(0, 999);
  if (r.error) throw r.error;
  const bearbeitet = (b) => b.gut_am || !b.erstellt_am
    || new Date(b.geaendert_am) - new Date(b.erstellt_am) > 5000;
  return (r.data || []).filter(bearbeitet);
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

// Parks wie in der Produktion (nur die eigenen), darin die Typen ihrer
// Maschinen als Block in der Reihenfolge der Planwand
function parkTypen(parks, maschinen) {
  return parks.map((p) => {
    const typen = [];
    for (const m of maschinen) if (m.park_id === p.id && m.type_id && !typen.includes(m.type_id)) typen.push(m.type_id);
    return { id: p.id, name: p.name, typen };
  }).filter((p) => p.typen.length);
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

  const maschinen = prod.maschinen || [];
  const gruppen = parkTypen(prod.parks || [], maschinen);
  const typIds = [...new Set(gruppen.flatMap((p) => p.typen))];
  const { daten: letzte, neu } = useDaten(() => letzteLaden(typIds), [typIds.join(",")]);
  const q = roh(frage);
  const { daten: treffer, neu: sucheNeu, laedt: sucheLaedt } = useDaten(() => sucheLaden(frage), [frage]);

  // Nach dem Schliessen des Blatts die Listen neu holen
  const bearbeiten = async (h, t) => {
    await oeffnen(h, t);
    const takt = setInterval(() => {
      if (!document.querySelector(".eba-huelle")) { clearInterval(takt); neu(); sucheNeu(); }
    }, 800);
  };
  // Wo läuft eine HOCO Nr. gerade? Steht bei Treffern und Letzten dabei
  const anMaschine = (h, t) => maschinen.filter((m) => m.type_id === t && (auftragDran(m) || {}).job_number === h)
    .map((m) => m.machine_number || m.name).join(", ");

  return (
    <div className="ri" data-richten="">
      <div className="ri-suchkopf">
        <input ref={feld} type="search" inputMode="search" enterKeyHint="search" className="ri-eingabe ri-suchfeld"
          data-richten-suche="" placeholder="HOCO Nr. suchen, z. B. 10844-0049" value={suche}
          onChange={(e) => setSuche(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && suche) { e.preventDefault(); setSuche(""); } }} />
        {suche && <button className="ri-leeren" aria-label="Suche leeren" onClick={() => { setSuche(""); feld.current && feld.current.focus(); }}>✕</button>}
      </div>

      {q.length >= 2 ? (
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
      ) : (
        <div className="karte ri-karte" data-richten-letzte="">
          <h2>Zuletzt bearbeitet</h2>
          {!letzte && <p className="ri-leer">Wird geladen …</p>}
          {letzte && gruppen.map((p) => {
            const typenMit = p.typen.map((t) => ({ t, liste: letzte.filter((b) => b.type_id === t).slice(0, JE_TYP) }))
              .filter((x) => x.liste.length);
            if (!typenMit.length) return null;
            return (
              <div key={p.id} className="ri-park" data-richten-park={p.id}>
                <h3 className="ri-park__name">{p.name}</h3>
                {typenMit.map(({ t, liste }) => (
                  <div key={t} className="ri-typ" data-richten-typ-gruppe={t}>
                    <h4 className="ri-typ__name">{typName(t)}</h4>
                    <div className="ri-liste">{liste.map((b) => {
                      const wo = anMaschine(b.hoco_nr, t);
                      return (
                        <div key={b.hoco_nr} className="ri-zeile ri-zeile--letzte" data-richten-letzt={b.hoco_nr}>
                          <span className="ri-auftrag"><b>{b.hoco_nr}</b>{wo && <small>läuft auf {wo}</small>}</span>
                          <span><Stand app={b} /></span>
                          <span><small>{alt.datumZeitKurz(b.geaendert_am)}</small></span>
                          <span className="ri-knopf"><button className="knopf knopf--klein" data-richten-bearbeiten={b.hoco_nr}
                            onClick={() => bearbeiten(b.hoco_nr, t)}>{darf ? "Bearbeiten" : "Ansehen"}</button></span>
                        </div>
                      );
                    })}</div>
                  </div>
                ))}
              </div>
            );
          })}
          {letzte && !letzte.some((b) => typIds.includes(b.type_id)) &&
            <p className="ri-leer">Noch kein Blatt bearbeitet. Such oben nach der HOCO Nr.</p>}
        </div>
      )}

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
