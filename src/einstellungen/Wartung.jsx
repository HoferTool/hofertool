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
//  Externen.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { WartungListe, faelligSeit, zielVon } from "../pad/Wartung.jsx";
import { batterieHeuteFaellig } from "../daten/maschinenInfo.js";

// Gewählte Art und Wahl, solange die App offen ist
let merk = { art: "typ", id: null };

const ARTEN = [["typ", "Maschinentyp"], ["park", "Maschinenpark"], ["maschine", "Einzelne Maschine"]];

// Maschinen, an denen ein Ziel gilt
function betroffen(z, maschinen) {
  if (!z.id) return [];
  if (z.art === "maschine") return maschinen.filter((x) => x.id === z.id);
  if (z.art === "park") return maschinen.filter((x) => x.park_id === z.id);
  return maschinen.filter((x) => x.type_id === z.id);
}

export default function Wartung() {
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
          const plaene = (p.data || []).filter((x) => { const q = zielVon(x); return q.art === a && q.id === id; });
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

  const knopf = (id, name, n) => {
    const z = zahlen[art + ":" + id];
    return (
      <button key={id} data-wartung-wahl={id} data-wartung-typ={art === "typ" ? id : undefined}
        className={"knopf es-wartung__maschine" + (id === wahl ? " knopf--haupt" : "")
          + (z && z.faellig ? " es-wartung__maschine--faellig" : "")}
        onClick={() => waehlen(id)}>
        {name}
        <span className="es-wartung__zahl">{z && z.faellig ? z.faellig + " fällig"
          : z && z.alle ? z.alle + (z.alle === 1 ? " Wartung" : " Wartungen")
          : n != null ? n + (n === 1 ? " Maschine" : " Maschinen") : "–"}</span>
      </button>);
  };

  let wahlListe;
  if (art === "typ") {
    wahlListe = <div className="es-wartung__maschinen">
      {typen.map((x) => knopf(x.id, x.name, maschinen.filter((y) => y.type_id === x.id).length))}</div>;
  } else if (art === "park") {
    wahlListe = <div className="es-wartung__maschinen">
      {parks.map((x) => knopf(x.id, x.name, maschinen.filter((y) => y.park_id === x.id).length))}</div>;
  } else {
    // Maschinen nach Park, in der Reihenfolge der Planwand
    wahlListe = <div className="es-wartung__parks">
      {parks.map((pk) => (
        <div key={pk.id} className="es-wartung__park">
          <span className="es-wartung__parkname">{pk.name}</span>
          <div className="es-wartung__maschinen">
            {maschinen.filter((y) => y.park_id === pk.id).map((x) => knopf(x.id, x.machine_number || x.name, null))}
          </div>
        </div>))}</div>;
  }

  const name = art === "typ" ? (typen.find((x) => x.id === wahl) || {}).name
    : art === "park" ? (parks.find((x) => x.id === wahl) || {}).name
    : (() => { const x = maschinen.find((y) => y.id === wahl); return x && (x.machine_number || x.name); })();
  const ziel = name ? { art, id: wahl } : null;

  return (
    <section className="karte es-wartung">
      <h2>Wartung im Pad Mode</h2>
      <p className="klein">Bilder oder PDFs ablegen, terminieren und auf Wunsch wiederholen, für einen ganzen
        Maschinentyp, einen ganzen Park oder eine einzelne Maschine. Ab dem Termin zeigt das Pad jeder betroffenen
        Maschine es als Bildschirmschoner statt des Einrichtblatts, bis dort jemand unten in der Mitte „Erledigt“
        tippt. Ebenso die Backup-Batterien am Tag, an dem sie fällig sind.</p>
      <div className="es-wartung__art" role="tablist">
        <span className="es-wartung__art-titel">Gilt für</span>
        {ARTEN.map(([a, t]) => (
          <button key={a} role="tab" data-wartung-art={a} aria-selected={a === art}
            className={"knopf" + (a === art ? " knopf--haupt" : "")} onClick={() => artWaehlen(a)}>{t}</button>))}
      </div>
      {wahlListe}
      {ziel ? <div className="wartung wartung--einstellungen">
          <WartungListe key={art + wahl} ziel={ziel} maschinen={betroffen(ziel, maschinen)} /></div>
        : <p className="unterlagen__leer">Oben {art === "typ" ? "einen Maschinentyp" : art === "park" ? "einen Park"
          : "eine Maschine"} wählen.</p>}
    </section>
  );
}
