// =================================================================
//  EINSTELLUNGEN → WARTUNG (seit 1.337.0)
//  Dieselbe Liste wie die Kachel „Wartung“ im Pad Mode, nur am
//  Computer bequemer: oben die Maschine wählen (nach Park), darunter
//  ihre Bilder und PDFs gross (Wunsch Patrick 2. November 2026: „in
//  Einstellungen soll ein weiterer Reiter kommen mit Wartung … immer
//  alles so gross wie möglich anzeigen“). Alle mit Schreibrecht ausser
//  Externen.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { WartungListe, wartungenLaden, istFaellig } from "../pad/Wartung.jsx";

let zuletzt = null; // gewählte Maschine, solange die App offen ist

export default function Wartung() {
  const [parks, setParks] = useState(null);
  const [maschinen, setMaschinen] = useState([]);
  const [wahl, setWahl] = useState(zuletzt);
  const [zahlen, setZahlen] = useState({});

  useEffect(() => {
    let weg = false;
    Promise.all([alt.ladeParks(false, true), alt.ladeMaschinen(false, true)])
      .then(([p, m]) => {
        if (weg) return;
        setParks(p || []); setMaschinen(m || []);
        // Wie viele je Maschine und wie viele davon fällig, für die Knöpfe
        alt.db.from("pad_wartungen").select("machine_id, termin").then(({ data }) => {
          if (weg || !data) return;
          const z = {};
          data.forEach((w) => {
            const e = z[w.machine_id] || (z[w.machine_id] = { alle: 0, faellig: 0 });
            e.alle++; if (istFaellig(w)) e.faellig++;
          });
          setZahlen(z);
        });
      })
      .catch((f) => { if (!weg) { setParks([]); alt.meldung(alt.fehlertext(f), "fehler"); } });
    return () => { weg = true; };
  }, [wahl]);

  const waehlen = (id) => { zuletzt = id; setWahl(id); };
  const m = maschinen.find((x) => x.id === wahl);
  if (parks === null) return <section className="karte"><p className="klein">Lädt …</p></section>;

  return (
    <section className="karte es-wartung">
      <h2>Wartung im Pad Mode</h2>
      <p className="klein">Bilder oder PDFs je Maschine ablegen und terminieren. Ab dem Termin zeigt das Pad dieser
        Maschine es als Bildschirmschoner statt des Einrichtblatts, bis jemand unten in der Mitte „Erledigt“ tippt.</p>
      <div className="es-wartung__parks">
        {parks.map((p) => {
          const ms = maschinen.filter((x) => x.park_id === p.id);
          if (!ms.length) return null;
          return (
            <div key={p.id} className="es-wartung__park">
              <span className="es-wartung__parkname">{p.name}</span>
              <div className="es-wartung__maschinen">
                {ms.map((x) => {
                  const z = zahlen[x.id];
                  return (
                    <button key={x.id} data-wartung-maschine={x.id}
                      className={"knopf es-wartung__maschine" + (x.id === wahl ? " knopf--haupt" : "")
                        + (z && z.faellig ? " es-wartung__maschine--faellig" : "")}
                      onClick={() => waehlen(x.id)}>
                      {x.machine_number || x.name}
                      {z ? <span className="es-wartung__zahl">{z.faellig ? z.faellig + " fällig" : z.alle}</span> : null}
                    </button>);
                })}
              </div>
            </div>);
        })}
      </div>
      {m ? <div className="wartung wartung--einstellungen"><WartungListe key={m.id} m={m} /></div>
        : <p className="unterlagen__leer">Oben eine Maschine wählen.</p>}
    </section>
  );
}
