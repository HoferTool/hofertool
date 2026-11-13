// =================================================================
//  EINSTELLUNGEN → WARTUNG (seit 1.337.0)
//  Dieselbe Liste wie die Kachel „Wartung“ im Pad Mode, nur am
//  Computer bequemer, alles gross (Wunsch Patrick 2. November 2026:
//  „in Einstellungen soll ein weiterer Reiter kommen mit Wartung …
//  immer alles so gross wie möglich anzeigen“). Seit 1.338.0 je
//  Maschinentyp (Patrick: „nicht spezifisch Nr. sondern Typ“), seit
//  1.339.0 wahlweise auch je Park oder je einzelne Maschine (Patrick:
//  „Wartungen sollen auch einzeln pro Maschine und Park zugeteilt
//  werden können“): oben „Gilt für“ Typ, Park oder Maschine, dann die
//  Wahl, darunter die Backup-Batterien der betroffenen Maschinen und
//  die Bilder und PDFs mit Termin und Wiederholung, je Plan an welchen
//  Maschinen er gerade fällig ist. Alle mit Schreibrecht ausser
//  Externen. Seit 1.340.0 zeigt eine einzelne Maschine auch, was vom
//  Typ und vom Park her gilt, und „Vorhandene wählen“ teilt eine schon
//  abgelegte Datei neu zu, ohne Hochladen. Seit 1.353.0 oben zwei
//  Reiter: „Vorlagen“ (Ablage nach Langdreher, Kurzdreher, Extern,
//  WartungVorlagen.jsx) und „Zuteilen“ (das Bisherige).
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { WartungListe, faelligSeit, zielVon, giltFuer } from "../pad/Wartung.jsx";
import { batterieHeuteFaellig } from "../daten/maschinenInfo.js";
import WartungVorlagen from "./WartungVorlagen.jsx";

// Gewählte Art und Wahl, solange die App offen ist
let merk = { art: "typ", id: null };
let merkTeil = "vorlagen";

const KURZ = { typ: "Typ", park: "Park", maschine: "Maschine" };
const ARTEN = [["typ", "Maschinentyp"], ["park", "Maschinenpark"], ["maschine", "Einzelne Maschine"]];

// Maschinen, an denen ein Ziel gilt
function betroffen(z, maschinen) {
  if (!z.id) return [];
  if (z.art === "maschine") return maschinen.filter((x) => x.id === z.id);
  if (z.art === "park") return maschinen.filter((x) => x.park_id === z.id);
  return maschinen.filter((x) => x.type_id === z.id);
}

export default function Wartung() {
  const [teil, setTeil] = useState(merkTeil);
  const teilWaehlen = (t) => { merkTeil = t; setTeil(t); };
  const reiter = (
    <div className="reiter es-wartung__teil" role="tablist">
      {[["vorlagen", "Vorlagen"], ["zuteilen", "Zuteilen"]].map(([k, t]) => (
        <button key={k} role="tab" aria-selected={k === teil} data-wartung-teil={k}
          className={"reiter__knopf" + (k === teil ? " aktiv" : "")} onClick={() => teilWaehlen(k)}>{t}</button>))}
    </div>);
  if (teil === "vorlagen") {
    return (
      <section className="karte es-wartung">
        <h2>Wartung im Pad Mode</h2>
        {reiter}
        <WartungVorlagen />
      </section>);
  }
  return <WartungZuteilen reiter={reiter} />;
}

function WartungZuteilen({ reiter }) {
  const [stamm, setStamm] = useState(null); // { typen, parks, maschinen }
  const [art, setArt] = useState(merk.art);
  const [wahl, setWahl] = useState(merk.id);
  const [zahlen, setZahlen] = useState({});

  useEffect(() => {
    let weg = false;
    Promise.all([alt.db.from("machine_types").select("id, name").order("name"), alt.ladeParks(false, true),
      alt.ladeMaschinen(false, true)])
      .then(async ([t, parks, m]) => {
        if (weg) return;
        const maschinen = m || [];
        // Nur Typen und Parks, die Maschinen haben
        const typen = (t.data || []).filter((x) => maschinen.some((y) => y.type_id === x.id));
        const ps = (parks || []).filter((x) => maschinen.some((y) => y.park_id === x.id));
        setStamm({ typen, parks: ps, maschinen });
        // Je Ziel: wie viele Pläne, an wie vielen Maschinen etwas fällig
        const [p, e, i] = await Promise.all([alt.db.from("wartung_plan").select("*"),
          alt.db.from("wartung_erledigt").select("*"), alt.db.from("maschinen_info").select("*")]);
        if (weg) return;
        const typName = (x) => (typen.find((y) => y.id === x.type_id) || {}).name || "";
        const z = {};
        const zaehlen = (a, id) => {
          // Bei einer Maschine zählt alles, was dort gilt (auch vom Typ und Park)
          const mm = a === "maschine" && maschinen.find((y) => y.id === id);
          const plaene = (p.data || []).filter((x) => {
            if (mm) return giltFuer(x, mm);
            const q = zielVon(x); return q.art === a && q.id === id; });
          const faellig = betroffen({ art: a, id }, maschinen).filter((x) =>
            plaene.some((pl) => faelligSeit(pl, e.data || [], x.id))
            || batterieHeuteFaellig((i.data || []).find((y) => y.machine_id === x.id), typName(x))).length;
          z[a + ":" + id] = { alle: plaene.length, faellig };
        };
        typen.forEach((x) => zaehlen("typ", x.id));
        ps.forEach((x) => zaehlen("park", x.id));
        maschinen.forEach((x) => zaehlen("maschine", x.id));
        setZahlen(z);
      })
      .catch((f) => { if (!weg) { setStamm({ typen: [], parks: [], maschinen: [] }); alt.meldung(alt.fehlertext(f), "fehler"); } });
    return () => { weg = true; };
  }, [art, wahl]);

  const artWaehlen = (a) => { merk = { art: a, id: null }; setArt(a); setWahl(null); };
  const waehlen = (id) => { merk = { art, id }; setWahl(id); };
  if (stamm === null) return <section className="karte"><p className="klein">Lädt …</p></section>;
  const { typen, parks, maschinen } = stamm;

  // Seit 1.534.0 links eine schmale Liste statt Knopfreihen, rechts das
  // Gewählte (Wunsch Patrick 13. November 2026: „das ist auch nicht
  // übersichtlich, passe es an“)
  const knopf = (id, name, n) => {
    const z = zahlen[art + ":" + id];
    return (
      <button key={id} type="button" data-wartung-wahl={id} data-wartung-typ={art === "typ" ? id : undefined}
        aria-current={id === wahl ? "true" : undefined}
        className={"es-wartung__eintrag" + (id === wahl ? " aktiv" : "")
          + (z && z.faellig ? " es-wartung__eintrag--faellig" : "")}
        onClick={() => waehlen(id)}>
        <span className="es-wartung__eintrag-name">{name}</span>
        {z && z.faellig ? <span className="es-wartung__zahl es-wartung__zahl--faellig">{z.faellig} fällig</span>
          : z && z.alle ? <span className="es-wartung__zahl">{z.alle} {z.alle === 1 ? "Wartung" : "Wartungen"}</span>
          : null}
        {n != null && <span className="es-wartung__eintrag-n klein">{n} {n === 1 ? "Maschine" : "Maschinen"}</span>}
      </button>);
  };

  let wahlListe;
  if (art === "typ") {
    wahlListe = typen.map((x) => knopf(x.id, x.name, maschinen.filter((y) => y.type_id === x.id).length));
  } else if (art === "park") {
    wahlListe = parks.map((x) => knopf(x.id, x.name, maschinen.filter((y) => y.park_id === x.id).length));
  } else {
    // Maschinen nach Park, in der Reihenfolge der Planwand
    wahlListe = parks.map((pk) => (
      <div key={pk.id} className="es-wartung__gruppe">
        <span className="es-wartung__parkname">{pk.name}</span>
        {maschinen.filter((y) => y.park_id === pk.id).map((x) => knopf(x.id, x.machine_number || x.name, null))}
      </div>));
  }

  const name = art === "typ" ? (typen.find((x) => x.id === wahl) || {}).name
    : art === "park" ? (parks.find((x) => x.id === wahl) || {}).name
    : (() => { const x = maschinen.find((y) => y.id === wahl); return x && (x.machine_number || x.name); })();
  const ziel = name ? { art, id: wahl } : null;

  return (
    <section className="karte es-wartung">
      <h2>Wartung im Pad Mode</h2>
      {reiter}
      <p className="klein es-wartung__kurz">Links wählen, wofür es gilt. Rechts Bild, PDF oder Text ablegen und
        terminieren: ab dem Termin zeigt das Pad es an der Maschine, bis dort jemand „Erledigt“ tippt.</p>
      <div className="es-wartung__zuteilen">
        <nav className="es-wartung__links">
          <div className="es-wartung__art" role="tablist" aria-label="Gilt für">
            {ARTEN.map(([a, t]) => (
              <button key={a} type="button" role="tab" data-wartung-art={a} aria-selected={a === art}
                className={a === art ? "aktiv" : ""} onClick={() => artWaehlen(a)}>{KURZ[a]}</button>))}
          </div>
          <div className="es-wartung__wahl">{wahlListe}</div>
        </nav>
        <div className="es-wartung__inhalt">
          {ziel ? <div className="wartung wartung--einstellungen">
              {/* Bei einer einzelnen Maschine alles, was dort gilt, auch vom Typ
                  und vom Park, wie im Pad (Wunsch Patrick 2. November 2026) */}
              {art === "maschine"
                ? <WartungListe key={art + wahl} m={maschinen.find((x) => x.id === wahl)}
                    vorgabe={{ art: "maschine", id: wahl }} />
                : <WartungListe key={art + wahl} ziel={ziel} maschinen={betroffen(ziel, maschinen)} />}</div>
            : <p className="unterlagen__leer es-wartung__leer">Links {art === "typ" ? "einen Maschinentyp" : art === "park" ? "einen Park"
              : "eine Maschine"} wählen.</p>}
        </div>
      </div>
    </section>
  );
}
