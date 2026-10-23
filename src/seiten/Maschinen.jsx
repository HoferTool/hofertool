// =================================================================
//  MASCHINEN (seit 1.134.0, Wunsch Patrick 21. Oktober 2026: „nimm aus
//  Produktion Maschinen und Typen raus und mach einen Reiter dafür“)
//
//  Eigene Seite mit zwei Reitern:
//   - Maschinen: zuerst den Park, darin die Typen als Ordner mit ihren
//     Maschinen, dann die Seite der Maschine. Man sieht nur die eigenen
//     Parks (wie in der Produktion; Admins und Planwand alle). Die
//     Reihenfolge ist dieselbe wie überall (sort_order der Maschinen)
//     und lässt sich hier durch Ziehen ändern: Typen als Block,
//     Maschinen innerhalb ihres Typs. Seit 1.161.0 steckt hier auch,
//     was der Reiter Parks war: Parks und Maschinen anlegen, umbenennen,
//     ein- und ausschalten, löschen.
//   - Typen: die Maschinentypen mit dem Werkzeugaufbau.
//  Die Seite einer Maschine ist in src/seiten/maschinen/Maschine.jsx.
//  Nicht für Externe (Entscheid offen, Patrick gefragt).
// =================================================================
import { useReducer } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import { teilMerken } from "../teile/wiederherstellen.js";
import Verwalten, { aktion } from "./produktion/Maschinen.jsx";
import MaschineSeite from "./maschinen/Maschine.jsx";
import { ZiehListe } from "../teile/ZiehListe.jsx";

// Den Reiter Parks gibt es seit 1.161.0 nicht mehr, er steckt in
// Maschinen; ein gemerktes „verwalten“ landet dort
export const REITER = [["uebersicht", "Maschinen"], ["typen", "Typen"]];

// Wo man gerade ist; übersteht Neuladen wie die anderen Seiten
// zu: die zugeklappten Typ-Ordner
export const ms = { ansicht: "uebersicht", parkId: null, typId: null, maschineId: null, zu: [] };
const FELDER = ["ansicht", "parkId", "typId", "maschineId", "zu"];
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
  else if (ms.maschineId) { ms.maschineId = null; ms.typId = null; }
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
function gruppieren(maschinen, parkId, auchAus) {
  const eigene = maschinen.filter((m) => m.park_id === parkId && (auchAus || m.is_active !== false))
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

// Ein Typ als Ordner mit seinen Maschinen darin. Die Maschinen lassen
// sich innerhalb des Ordners umsortieren; der Ordner selbst wird in der
// äusseren Liste als Ganzes gezogen.
function TypOrdner({ k, name, liste, darf, offen, umschalten, oeffnen, ordnen, neuLaden }) {
  return (
    <div className={"mseite-ordner" + (offen ? " mseite-ordner--offen" : "")} data-mtyp={k}>
      <button className="mseite-ordner__kopf" data-mtyp-auf={k} aria-expanded={offen} onClick={umschalten}>
        <span className="mseite-ordner__pfeil" aria-hidden="true">▸</span>
        <span className="mseite-ordner__symbol" aria-hidden="true">{offen ? "📂" : "📁"}</span>
        <b>{name}</b>
        <span className="mseite-ordner__zahl">{liste.length} {liste.length === 1 ? "Maschine" : "Maschinen"}
          {!offen && <> · {liste.map((m) => m.machine_number || m.name).join(", ")}</>}</span>
      </button>
      {offen &&
        // Mit der Maus im Ordner zieht nur die innere Liste, nicht der Ordner
        <div className="mseite-ordner__inhalt" onPointerDown={(e) => e.stopPropagation()}>
          <ZiehListe id={"mseite-maschinen-" + k} className="mseite-liste" darf={darf} ordnen={ordnen}
            eintraege={liste.map((x) => ({ key: x.id, inhalt:
              <div className={"mseite-mzeile" + (x.is_active === false ? " mseite-mzeile--aus" : "")}>
                <button className="mseite-kachel mseite-kachel--zeile" data-mmaschine={x.id} onClick={() => oeffnen(x)}>
                  <b>{x.machine_number || x.name}{x.is_active === false && <> <span className="marke">aus</span></>}</b>
                  <span>{x.machine_number ? x.name : ""}</span>
                </button>
                {darf && <div className="mseite-mzeile__knoepfe">
                  <button className="knopf knopf--klein" data-masch-um={x.id}
                    onClick={() => aktion.maschineBearbeiten(x, neuLaden)}>Bearbeiten</button>
                  <button className="knopf knopf--klein" data-masch-aktiv={x.id}
                    onClick={() => aktion.maschineAktiv(x, neuLaden)}>{x.is_active === false ? "Ein" : "Aus"}</button>
                  <button className="knopf knopf--klein knopf--gefahr-leise" data-masch-weg={x.id}
                    onClick={() => aktion.maschineLoeschen(x, neuLaden)}>Löschen</button>
                </div>}
              </div> }))} />
        </div>}
    </div>
  );
}

// Seit 1.161.0 Parks und Maschinen in einem (Wunsch Patrick 23. Oktober
// 2026: „zuerst Park wählen, dann darunter die Maschinen, dort die
// Reihenfolge regeln, zuerst nach Typ, dann einzelne Maschinen, je
// Unterordner“). Im Park stehen die Typen als Ordner mit ihren
// Maschinen; wer schreiben darf, legt hier auch Parks und Maschinen an.
function Uebersicht({ geladen, zeichnen, neuLaden }) {
  const { parks, maschinen, typen } = geladen;
  const darf = alt.darfSchreiben();
  // Wer verwalten darf, sieht auch ausgeschaltete Parks und Maschinen
  const sichtbareParks = parks.filter((p) => darf || p.is_active !== false);
  nurEinPark = !darf && sichtbareParks.length === 1;
  if (nurEinPark) ms.parkId = sichtbareParks[0].id;
  if (ms.parkId && !sichtbareParks.some((p) => p.id === ms.parkId)) { ms.parkId = null; ms.typId = null; ms.maschineId = null; }

  const gehe = (z) => () => { Object.assign(ms, z); zeichnen(); };
  const typName = (k) => k === OHNE ? "Ohne Typ" : ((typen.find((t) => t.id === k) || {}).name || "Typ");

  if (!ms.parkId) {
    return (
      <>
        <h2 className="mseite-frage">Welcher Park?</h2>
        {!sichtbareParks.length && <p className="hinweis">Dir ist kein Maschinenpark zugewiesen.</p>}
        <div className="mseite-kacheln">
          {sichtbareParks.map((p) => {
            const n = maschinen.filter((m) => m.park_id === p.id && m.is_active !== false).length;
            return (
              <button key={p.id} className={"mseite-kachel" + (p.is_active === false ? " mseite-kachel--aus" : "")}
                data-mpark={p.id} onClick={gehe({ parkId: p.id, typId: null, maschineId: null })}>
                <b>{p.name}{p.is_active === false && <> <span className="marke">inaktiv</span></>}</b>
                <span>{n} {n === 1 ? "Maschine" : "Maschinen"}</span>
              </button>);
          })}
        </div>
        {darf && <button className="knopf knopf--haupt" id="park-neu"
          onClick={() => aktion.parkNeu(neuLaden)}>+ Maschinenpark</button>}
      </>
    );
  }

  const park = sichtbareParks.find((p) => p.id === ms.parkId);
  const { eigene, reihe, je } = gruppieren(maschinen, ms.parkId, darf);
  const pfad = [];
  if (!nurEinPark) pfad.push(["Parks", gehe({ parkId: null, typId: null, maschineId: null })]);
  pfad.push([park.name, ms.maschineId ? gehe({ typId: null, maschineId: null }) : null]);
  const m = ms.maschineId && eigene.find((x) => x.id === ms.maschineId);
  if (ms.maschineId && !m) ms.maschineId = null;

  if (m) {
    pfad.push([m.machine_number || m.name, null]);
    return (
      <>
        <Pfad teile={pfad} />
        <MaschineSeite key={m.id} m={m} typ={m.type_id ? typName(m.type_id) : ""} park={park} />
      </>
    );
  }

  const zu = new Set(ms.zu || []);
  const umschalten = (k) => () => {
    if (zu.has(k)) zu.delete(k); else zu.add(k);
    ms.zu = [...zu]; zeichnen();
  };
  const ordnenIn = (k) => (keys) => {
    const neuJe = { ...je, [k]: keys.map((id) => je[k].find((x) => x.id === id)) };
    reihenfolgeSchreiben(eigene, reihe, neuJe, neuLaden);
  };
  const anzahl = maschinen.filter((x) => x.park_id === park.id).length;
  return (
    <>
      <Pfad teile={pfad} />
      <div className="mseite-parkkopf">
        <h2>{park.name}{park.is_active === false && <> <span className="marke">inaktiv</span></>}</h2>
        {darf && <div className="mseite-parkkopf__knoepfe">
          <button className="knopf knopf--klein" data-park-um={park.id}
            onClick={() => aktion.parkUmbenennen(park, neuLaden)}>Umbenennen</button>
          <button className="knopf knopf--klein" data-park-aktiv={park.id}
            onClick={() => aktion.parkAktiv(park, neuLaden)}>{park.is_active === false ? "Aktivieren" : "Deaktivieren"}</button>
          <button className="knopf knopf--klein knopf--gefahr-leise" data-park-weg={park.id}
            onClick={() => aktion.parkLoeschen(park, anzahl, neuLaden)}>Löschen</button>
        </div>}
      </div>
      {!reihe.length && <p className="hinweis">Noch keine Maschine in diesem Park.</p>}
      <ZiehListe id="mseite-typen" className="mseite-liste mseite-baum" darf={darf}
        ordnen={(neu) => reihenfolgeSchreiben(eigene, neu, je, neuLaden)}
        eintraege={reihe.map((k) => ({ key: k, inhalt:
          <TypOrdner k={k} name={typName(k)} liste={je[k]} darf={darf} offen={!zu.has(k)}
            umschalten={umschalten(k)} oeffnen={(x) => gehe({ typId: typSchluessel(x), maschineId: x.id })()}
            ordnen={ordnenIn(k)} neuLaden={neuLaden} /> }))} />
      {darf && <button className="knopf knopf--klein mseite-neu" data-masch-neu={park.id}
        onClick={() => aktion.maschineNeu(park.id, neuLaden, eigene)}>+ Maschine</button>}
      {darf && reihe.length > 0 &&
        <p className="klein">Ordner (Typen) und Maschinen darin zum Umsortieren ziehen. Die Reihenfolge gilt
          überall in der App, auch auf der Planwand.</p>}
    </>
  );
}

export default function Maschinen({ auffrischen, behaelter }) {
  const [, zeichnen] = useReducer((x) => x + 1, 0);
  zeichnenAussen = zeichnen;
  if (!REITER.some(([w]) => w === ms.ansicht)) ms.ansicht = "uebersicht";
  const verwalten = ms.ansicht !== "uebersicht";
  // Wer schreiben darf, verwaltet auch ausgeschaltete Parks und Maschinen
  const auchInaktive = verwalten || alt.darfSchreiben();
  const { daten: geladen, fehler, neu } = useDaten(() => grunddatenLaden(auchInaktive), [auchInaktive, auffrischen]);
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
                ? <Verwalten geladen={geladen} behaelter={behaelter} neuLaden={neuLaden} nur="typen" />
                : <Uebersicht geladen={geladen} zeichnen={zeichnen} neuLaden={neuLaden} />}
        </div>
      </Uebergang>
    </>
  );
}
