// =================================================================
//  EINSTELLUNGEN → WARTUNG (seit 1.337.0)
//  Dieselbe Liste wie die Kachel „Wartung“ im Pad Mode, nur am
//  Computer bequemer, alles gross (Wunsch Patrick 2. November 2026:
//  „in Einstellungen soll ein weiterer Reiter kommen mit Wartung …
//  immer alles so gross wie möglich anzeigen“). Seit 1.338.0 je
//  Maschinentyp (Patrick: „nicht spezifisch Nr. sondern Typ“): oben
//  den Typ wählen, darunter die Backup-Batterien seiner Maschinen und
//  die Bilder und PDFs mit Termin und Wiederholung, je Plan an welchen
//  Maschinen er gerade fällig ist. Alle mit Schreibrecht ausser
//  Externen.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { WartungListe, faelligSeit } from "../pad/Wartung.jsx";
import { batterieHeuteFaellig } from "../daten/maschinenInfo.js";

let zuletzt = null; // gewählter Typ, solange die App offen ist

export default function Wartung() {
  const [typen, setTypen] = useState(null);
  const [maschinen, setMaschinen] = useState([]);
  const [wahl, setWahl] = useState(zuletzt);
  const [zahlen, setZahlen] = useState({});

  useEffect(() => {
    let weg = false;
    Promise.all([alt.db.from("machine_types").select("id, name").order("name"), alt.ladeMaschinen(false, true)])
      .then(async ([t, m]) => {
        if (weg) return;
        const ms = (m || []).filter((x) => x.type_id);
        setMaschinen(ms);
        // Nur Typen, die Maschinen haben
        const liste = (t.data || []).filter((x) => ms.some((y) => y.type_id === x.id));
        setTypen(liste);
        if (!zuletzt && liste.length === 1) { zuletzt = liste[0].id; setWahl(zuletzt); }
        // Wie viele Pläne je Typ und an wie vielen Maschinen etwas fällig
        const [p, e, i] = await Promise.all([alt.db.from("wartung_plan").select("*"),
          alt.db.from("wartung_erledigt").select("*"), alt.db.from("maschinen_info").select("*")]);
        if (weg) return;
        const z = {};
        liste.forEach((typ) => {
          const plaene = (p.data || []).filter((x) => x.type_id === typ.id);
          const faellig = ms.filter((x) => x.type_id === typ.id && (
            plaene.some((pl) => faelligSeit(pl, e.data || [], x.id))
            || batterieHeuteFaellig((i.data || []).find((y) => y.machine_id === x.id), typ.name))).length;
          z[typ.id] = { alle: plaene.length, faellig };
        });
        setZahlen(z);
      })
      .catch((f) => { if (!weg) { setTypen([]); alt.meldung(alt.fehlertext(f), "fehler"); } });
    return () => { weg = true; };
  }, [wahl]);

  const waehlen = (id) => { zuletzt = id; setWahl(id); };
  const typ = (typen || []).find((x) => x.id === wahl);
  if (typen === null) return <section className="karte"><p className="klein">Lädt …</p></section>;
  const ms = maschinen.filter((x) => x.type_id === wahl);

  return (
    <section className="karte es-wartung">
      <h2>Wartung im Pad Mode</h2>
      <p className="klein">Bilder oder PDFs je Maschinentyp ablegen, terminieren und auf Wunsch wiederholen. Ab dem
        Termin zeigt das Pad jeder Maschine des Typs es als Bildschirmschoner statt des Einrichtblatts, bis dort jemand
        unten in der Mitte „Erledigt“ tippt. Ebenso die Backup-Batterien am Tag, an dem sie fällig sind.</p>
      <div className="es-wartung__maschinen">
        {typen.map((x) => {
          const z = zahlen[x.id];
          const n = maschinen.filter((y) => y.type_id === x.id).length;
          return (
            <button key={x.id} data-wartung-typ={x.id}
              className={"knopf es-wartung__maschine" + (x.id === wahl ? " knopf--haupt" : "")
                + (z && z.faellig ? " es-wartung__maschine--faellig" : "")}
              onClick={() => waehlen(x.id)}>
              {x.name}
              <span className="es-wartung__zahl">{z && z.faellig ? z.faellig + " fällig"
                : n + (n === 1 ? " Maschine" : " Maschinen")}</span>
            </button>);
        })}
      </div>
      {typ ? <div className="wartung wartung--einstellungen">
          <WartungListe key={typ.id} typId={typ.id} typ={typ.name} maschinen={ms} /></div>
        : <p className="unterlagen__leer">Oben einen Maschinentyp wählen.</p>}
    </section>
  );
}
