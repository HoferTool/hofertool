// =================================================================
//  MASCHINEN (seit 1.134.0, Wunsch Patrick 21. Oktober 2026: „nimm aus
//  Produktion Maschinen und Typen raus und mach einen Reiter dafür“)
//
//  Eigene Seite mit drei Reitern:
//   - Maschinen: zuerst den Park, dann den Typ, dann die Maschine.
//     Man sieht nur die eigenen Parks (wie in der Produktion; Admins und
//     Planwand alle). Die Reihenfolge ist dieselbe wie auf der Planwand
//     (sort_order der Maschinen) und lässt sich hier durch Ziehen
//     ändern: Typen als Block, Maschinen innerhalb ihres Typs.
//   - Parks und Typen: das bisherige „Maschinen und Typen“ aus der
//     Produktion, seit 1.136.0 als zwei eigene Reiter (Wunsch Patrick
//     21. Oktober 2026: „Parks und Typen splitten“): Parks mit ihren
//     Maschinen anlegen und bearbeiten, Typen mit dem Werkzeugaufbau.
//  Die Seite einer Maschine ist in src/seiten/maschinen/Maschine.jsx.
//  Nicht für Externe (Entscheid offen, Patrick gefragt).
// =================================================================
import { useReducer } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import { teilMerken } from "../teile/wiederherstellen.js";
import Verwalten from "./produktion/Maschinen.jsx";
import MaschineSeite from "./maschinen/Maschine.jsx";
import { ZiehListe } from "../teile/ZiehListe.jsx";

// „verwalten“ heisst seit der Trennung nur noch Parks; der Schlüssel
// bleibt, damit gemerkte Stände und der Sprung aus der Produktion gehen
export const REITER = [["uebersicht", "Maschinen"], ["verwalten", "Parks"], ["typen", "Typen"]];

// Wo man gerade ist; übersteht Neuladen wie die anderen Seiten
export const ms = { ansicht: "uebersicht", parkId: null, typId: null, maschineId: null };
const FELDER = ["ansicht", "parkId", "typId", "maschineId"];
teilMerken("maschinen", () => Object.fromEntries(FELDER.map((k) => [k, ms[k]])),
  (z) => FELDER.forEach((k) => { if (k in z) ms[k] = z[k]; }));

// Von aussen hinspringen, etwa vom Hinweis der Batterien auf der Startseite
export function maschineZeigen(m) {
  Object.assign(ms, { ansicht: "uebersicht", parkId: m.park_id, typId: m.type_id || "__ohne", maschineId: m.id });
  if (location.hash === "#/maschinen") alt.zeichneSeite(); else location.hash = "#/maschinen";
}

// Escape geht eine Ebene zurück (aus app.js gerufen). true = erledigt.
let zeichnenAussen = null;
export function maschinenZurueck() {
  if (alt.prod.typOffen) return false;  // das erledigt app.js
  if (ms.ansicht !== "uebersicht") { ms.ansicht = "uebersicht"; }
  else if (ms.maschineId) ms.maschineId = null;
  else if (ms.typId) ms.typId = null;
  else if (ms.parkId && !nurEinPark) ms.parkId = null;
  else return false;
  if (zeichnenAussen) zeichnenAussen(); else alt.zeichneSeite();
  return true;
}
let nurEinPark = false;

let ladeNr = 0;
async function grunddatenLaden(auchInaktive) {
  const prod = alt.prod;
  // Für „Parks und Typen“ wie bisher in prod.*, damit die alten Teile
  // (Typen, Dokumentenerkennung) weiter dieselben Listen sehen
  const [parks, maschinen] = await Promise.all([alt.ladeParks(auchInaktive), alt.ladeMaschinen(auchInaktive)]);
  let typen = [];
  try { typen = await alt.ladeTypen(); } catch (f) { /* geht auch ohne */ }
  prod.parks = parks; prod.maschinen = maschinen; prod.typen = typen;
  return { nr: ++ladeNr, parks, maschinen, typen };
}

const OHNE = "__ohne";
const typSchluessel = (m) => m.type_id || OHNE;

// Die Maschinen eines Parks in der Reihenfolge der Planwand, gruppiert
// nach Typ; ein Typ steht dort, wo seine erste Maschine steht
function gruppieren(maschinen, parkId) {
  const eigene = maschinen.filter((m) => m.park_id === parkId && m.is_active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)
      || String(a.name).localeCompare(String(b.name), "de", { numeric: true }));
  const reihe = [], je = {};
  eigene.forEach((m) => {
    const k = typSchluessel(m);
    if (!je[k]) { je[k] = []; reihe.push(k); }
    je[k].push(m);
  });
  return { eigene, reihe, je };
}

// Neue Reihenfolge schreiben: Typen als Blöcke hintereinander, wie sie
// hier stehen. Schreibt nur, was sich ändert. Mit Rückgängig.
async function reihenfolgeSchreiben(eigene, reihe, je, neuLaden) {
  const neu = reihe.flatMap((k) => je[k]);
  const geaendert = neu.map((m, i) => [m, i + 1]).filter(([m, nr]) => m.sort_order !== nr);
  if (!geaendert.length) return;
  const schritte = geaendert.map(([m]) => alt.rueckSetz("machines", { sort_order: m.sort_order ?? null }, { id: m.id }));
  for (const [m, nr] of geaendert) {
    const { error } = await alt.db.from("machines").update({ sort_order: nr }).eq("id", m.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); neuLaden(); return; }
    m.sort_order = nr;
  }
  alt.merkeSchritt("Reihenfolge der Maschinen", schritte);
  alt.meldung("Reihenfolge geändert, auch auf der Planwand.");
  neuLaden();
}

function Pfad({ teile }) {
  return (
    <nav className="mseite-pfad" aria-label="Wo bin ich">
      {teile.map(([text, gehe], i) => (
        <span key={i}>
          {i > 0 && <span className="mseite-pfad__trenn">›</span>}
          {gehe ? <button className="linkknopf" data-pfad={i} onClick={gehe}>{text}</button> : <b>{text}</b>}
        </span>
      ))}
    </nav>
  );
}

function Uebersicht({ geladen, zeichnen, neuLaden }) {
  const { parks, maschinen, typen } = geladen;
  const darf = alt.darfSchreiben();
  const aktiveParks = parks.filter((p) => p.is_active !== false);
  nurEinPark = aktiveParks.length === 1;
  if (nurEinPark) ms.parkId = aktiveParks[0].id;
  if (ms.parkId && !aktiveParks.some((p) => p.id === ms.parkId)) { ms.parkId = null; ms.typId = null; ms.maschineId = null; }

  const gehe = (z) => () => { Object.assign(ms, z); zeichnen(); };
  const typName = (k) => k === OHNE ? "Ohne Typ" : ((typen.find((t) => t.id === k) || {}).name || "Typ");

  if (!ms.parkId) {
    if (!aktiveParks.length) return <p className="hinweis">Dir ist kein Maschinenpark zugewiesen.</p>;
    return (
      <>
        <h2 className="mseite-frage">Welcher Park?</h2>
        <div className="mseite-kacheln">
          {aktiveParks.map((p) => {
            const n = maschinen.filter((m) => m.park_id === p.id && m.is_active !== false).length;
            return (
              <button key={p.id} className="mseite-kachel" data-mpark={p.id}
                onClick={gehe({ parkId: p.id, typId: null, maschineId: null })}>
                <b>{p.name}</b><span>{n} {n === 1 ? "Maschine" : "Maschinen"}</span>
              </button>);
          })}
        </div>
      </>
    );
  }

  const park = aktiveParks.find((p) => p.id === ms.parkId);
  const { eigene, reihe, je } = gruppieren(maschinen, ms.parkId);
  if (ms.typId && !je[ms.typId]) { ms.typId = null; ms.maschineId = null; }
  const pfad = [];
  if (!nurEinPark) pfad.push(["Parks", gehe({ parkId: null, typId: null, maschineId: null })]);
  pfad.push([park.name, ms.typId ? gehe({ typId: null, maschineId: null }) : null]);

  if (!ms.typId) {
    return (
      <>
        <Pfad teile={pfad} />
        <h2 className="mseite-frage">Welcher Typ?</h2>
        {!reihe.length && <p className="hinweis">Noch keine Maschine in diesem Park.</p>}
        <ZiehListe id="mseite-typen" className="mseite-liste" darf={darf}
          ordnen={(neu) => reihenfolgeSchreiben(eigene, neu, je, neuLaden)}
          eintraege={reihe.map((k) => ({ key: k, inhalt:
            <button className="mseite-kachel mseite-kachel--zeile" data-mtyp={k}
              onClick={gehe({ typId: k, maschineId: null })}>
              <b>{typName(k)}</b>
              <span>{je[k].length} {je[k].length === 1 ? "Maschine" : "Maschinen"}
                {" · "}{je[k].map((m) => m.machine_number || m.name).join(", ")}</span>
            </button> }))} />
        {darf && reihe.length > 1 && <p className="klein">Zum Umsortieren ziehen. Die Reihenfolge gilt auch auf der Planwand.</p>}
      </>
    );
  }

  const liste = je[ms.typId];
  pfad.push([typName(ms.typId), ms.maschineId ? gehe({ maschineId: null }) : null]);
  const m = ms.maschineId && liste.find((x) => x.id === ms.maschineId);
  if (ms.maschineId && !m) ms.maschineId = null;

  if (m) {
    pfad.push([m.machine_number || m.name, null]);
    return (
      <>
        <Pfad teile={pfad} />
        <MaschineSeite key={m.id} m={m} typ={ms.typId === OHNE ? "" : typName(ms.typId)} park={park} />
      </>
    );
  }

  const ordnen = (keys) => {
    const neuJe = { ...je, [ms.typId]: keys.map((k) => liste.find((x) => x.id === k)) };
    reihenfolgeSchreiben(eigene, reihe, neuJe, neuLaden);
  };
  return (
    <>
      <Pfad teile={pfad} />
      <h2 className="mseite-frage">Welche Maschine?</h2>
      <ZiehListe id="mseite-maschinen" className="mseite-liste" darf={darf} ordnen={ordnen}
        eintraege={liste.map((x) => ({ key: x.id, inhalt:
          <button className="mseite-kachel mseite-kachel--zeile" data-mmaschine={x.id}
            onClick={gehe({ maschineId: x.id })}>
            <b>{x.machine_number || x.name}</b>
            <span>{x.machine_number ? x.name : ""}</span>
          </button> }))} />
      {darf && liste.length > 1 && <p className="klein">Zum Umsortieren ziehen. Die Reihenfolge gilt auch auf der Planwand.</p>}
    </>
  );
}

export default function Maschinen({ auffrischen, behaelter }) {
  const [, zeichnen] = useReducer((x) => x + 1, 0);
  zeichnenAussen = zeichnen;
  if (!REITER.some(([w]) => w === ms.ansicht)) ms.ansicht = "uebersicht";
  const verwalten = ms.ansicht !== "uebersicht";
  const { daten: geladen, fehler, neu } = useDaten(() => grunddatenLaden(verwalten), [verwalten, auffrischen]);
  const neuLaden = () => { alt.stammVergessen(); neu(); };
  // Ein offener Typ gehört zum Reiter Typen und schliesst beim Wechsel
  const waehlen = (w) => { ms.ansicht = w; alt.prod.typOffen = null; zeichnen(); };

  return (
    <>
      <h1 className="seitentitel">Maschinen</h1>
      <Reiter reiter={REITER} aktiv={ms.ansicht} waehlen={waehlen} merkmal="mansicht" seite="maschinen" />
      <Uebergang key={ms.ansicht}>
        <div id="mseite">
          {fehler && !geladen
            ? <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>
            : !geladen
              ? <div className="laedt">Wird geladen …</div>
              : verwalten
                ? <Verwalten geladen={geladen} behaelter={behaelter} neuLaden={neuLaden}
                    nur={ms.ansicht === "typen" ? "typen" : "parks"} />
                : <Uebersicht geladen={geladen} zeichnen={zeichnen} neuLaden={neuLaden} />}
        </div>
      </Uebergang>
    </>
  );
}
