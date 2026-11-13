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
import WartungVorlagen from "./WartungVorlagen.jsx";

// Gewählte Art und Wahl, solange die App offen ist
let merk = { art: "typ", id: null };
let merkTeil = "vorlagen";

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
        const [p, e] = await Promise.all([alt.db.from("wartung_plan").select("*"),
          alt.db.from("wartung_erledigt").select("*")]);
        if (weg) return;
        const z = {};
        const zaehlen = (a, id) => {
          // Bei einer Maschine zählt alles, was dort gilt (auch vom Typ und Park)
          const mm = a === "maschine" && maschinen.find((y) => y.id === id);
          const plaene = (p.data || []).filter((x) => {
            if (mm) return giltFuer(x, mm);
            const q = zielVon(x); return q.art === a && q.id === id; });
          const faellig = betroffen({ art: a, id }, maschinen).filter((x) =>
            plaene.some((pl) => faelligSeit(pl, e.data || [], x.id))).length;
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

  // Seit 1.536.0 mit den Bausteinen des restlichen Tools: „Gilt für“ als
  // Reiter wie „Vorlagen / Zuteilen“, die Wahl als Knöpfe wie die
  // Typwahl der Produktion, alles oben auf einmal sichtbar, darunter das
  // Gewählte über die ganze Breite (Wunsch Patrick 13. November 2026:
  // „ohne Scrollen alles sehen … nichts Neues machen“)
  const knopf = (id, name) => {
    const z = zahlen[art + ":" + id];
    return (
      <button key={id} type="button" data-wartung-wahl={id} data-wartung-typ={art === "typ" ? id : undefined}
        aria-pressed={id === wahl}
        className={"typwahl__knopf" + (id === wahl ? " aktiv" : "") + (z && z.faellig ? " es-wartung__faellig" : "")}
        title={z && z.faellig ? z.faellig + " fällig" : undefined}
        onClick={() => waehlen(id)}>
        {name}
        {z && z.alle ? <span className="typwahl__zahl">{z.alle}</span> : null}
      </button>);
  };

  let wahlListe;
  if (art === "typ") wahlListe = <div className="typwahl">{typen.map((x) => knopf(x.id, x.name))}</div>;
  else if (art === "park") wahlListe = <div className="typwahl">{parks.map((x) => knopf(x.id, x.name))}</div>;
  else {
    // Maschinen nach Park, in der Reihenfolge der Planwand
    wahlListe = parks.map((pk) => (
      <div key={pk.id} className="es-wartung__gruppe">
        <span className="es-wartung__parkname klein">{pk.name}</span>
        <div className="typwahl">{maschinen.filter((y) => y.park_id === pk.id)
          .map((x) => knopf(x.id, x.machine_number || x.name))}</div>
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
      <div className="reiter es-wartung__art" role="tablist" aria-label="Gilt für">
        {ARTEN.map(([a, t]) => (
          <button key={a} type="button" role="tab" data-wartung-art={a} aria-selected={a === art}
            className={"reiter__knopf" + (a === art ? " aktiv" : "")} onClick={() => artWaehlen(a)}>{t}</button>))}
      </div>
      <div className="es-wartung__wahl">{wahlListe}</div>
      {ziel ? <div className="wartung wartung--einstellungen">
          {/* Bei einer einzelnen Maschine alles, was dort gilt, auch vom Typ
              und vom Park, wie im Pad (Wunsch Patrick 2. November 2026) */}
          {art === "maschine"
            ? <WartungListe key={art + wahl} m={maschinen.find((x) => x.id === wahl)}
                vorgabe={{ art: "maschine", id: wahl }} ohneBatterie />
            : <WartungListe key={art + wahl} ziel={ziel} maschinen={betroffen(ziel, maschinen)} ohneBatterie />}</div>
        : <p className="unterlagen__leer">{art === "typ" ? "Einen Maschinentyp" : art === "park" ? "Einen Park"
          : "Eine Maschine"} wählen.</p>}
    </section>
  );
}
