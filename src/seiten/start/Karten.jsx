// =================================================================
//  STARTSEITE · die kleinen Karten
//  Probleme, Vorbereitung, Einkauf, Bestellungen und Geburtstage.
//  Jede lädt für sich; fehlt eine Tabelle, bleibt nur ihre Karte weg.
// =================================================================
import { alt, useDaten } from "../../bruecke.jsx";
import { PRIO } from "../../daten/einkauf.js";
import { KlickKarte } from "./Karte.jsx";

async function abfrage(anfrage, ms, name) {
  const { data, error } = await alt.zeitlimit(anfrage, ms, name);
  if (error) throw error;
  return data || [];
}

// ---------- Gemeldete Probleme von der Planwand ----------

export function Probleme({ auffrischen }) {
  const { daten: liste, neu } = useDaten(() => abfrage(
    alt.db.from("planwand").select("*").not("problem", "is", null)
      .order("problem_at", { ascending: false }), 10000, "Probleme"), [auffrischen]);
  const darf = alt.darfSchreiben() || alt.darfPlanen();

  return (
    <div id="db-probleme">
      {liste && liste.length > 0 &&
        <section className="karte karte--warnung">
          <h2>⚠ Gemeldete Probleme <span className="marke">{liste.length}</span></h2>
          {liste.map((j) => (
            <div className="problemzeile" key={j.id}>
              <span className="problemzeile__zeichen">⚠</span>
              <div className="problemzeile__inhalt">
                {/* Führt genau zu diesem Balken — über den Auftrag selbst, nicht
                    über die Nummer, die bei mehreren Aufträgen gleich sein kann */}
                <button className="problemzeile__nr problemzeile__nr--klick" data-zeigen={j.id}
                  onClick={() => alt.balkenZeigen(j.id)}>
                  {j.job_number}
                  {j.fa_nr && <> <span className="klein">FA {j.fa_nr}</span></>}
                  {j.maschine && <> <span className="klein">· {j.maschine}</span></>}
                </button>
                <div>{j.problem}</div>
                <div className="klein">{j.problem_von || ""}
                  {j.problem_at ? " · " + alt.datumZeitKurz(j.problem_at) : ""}</div>
              </div>
              {darf &&
                <button className="linkknopf" data-probweg={j.id}
                  onClick={() => alt.problemQuittieren(j, null, neu)}>Erledigt</button>}
            </div>
          ))}
        </section>}
    </div>
  );
}

// ---------- Vorbereitung ----------

function Statuszeile({ anzahl, text, art, knopf, ansehen }) {
  return (
    <div className={"statuszeile statuszeile--" + art}>
      <span className="statuszeile__zahl">{alt.zahlText(anzahl)}</span>
      <span>{text}</span>
      {knopf && <button className="statuszeile__knopf" data-vorb={knopf}
        onClick={(e) => { e.stopPropagation(); ansehen(); }}>Ansehen</button>}
    </div>
  );
}

export function Vorbereitung({ auffrischen }) {
  const { daten: liste } = useDaten(async () => {
    const data = await abfrage(alt.db.from("planwand").select("*").is("ended_at", null)
      .not("planned_from", "is", null).order("planned_from"), 10000, "Vorbereitung");
    // Nur, was wirklich ansteht: noch geplant (läuft nicht schon, wird
    // nicht schon gerüstet) und Beginn in den nächsten zwei Wochen.
    // Ohne diese Grenze zählte die Karte jeden offenen Auftrag bis weit
    // in die Zukunft — 170 "ohne FA" sagen niemandem etwas.
    const grenze = alt.arbeitstagePlus(alt.isoDatum(new Date()), 10);
    return data.filter((j) => (j.plan_status || "geplant") === "geplant" && j.planned_from <= grenze);
  }, [auffrischen]);

  if (!liste) return <div id="db-vorbereitung" />;
  // FA da = FA Nr. eingetragen, Material da = Menge eingetragen
  const ohneFa = liste.filter((j) => !String(j.fa_nr || "").trim());
  const ohneMaterial = liste.filter((j) => !String(j.material_menge || "").trim());

  return (
    <div id="db-vorbereitung">
      <section className="karte">
        <h2>Vorbereitung</h2>
        <div className="statusliste">
          <Statuszeile anzahl={ohneFa.length} text="ohne FA in den nächsten 2 Wochen"
            art={ohneFa.length ? "warn" : "gut"} knopf={ohneFa.length ? "fa" : ""}
            ansehen={() => alt.vorbereitungFenster(ohneFa, "Aufträge ohne FA")} />
          <Statuszeile anzahl={ohneMaterial.length} text="ohne Material in den nächsten 2 Wochen"
            art={ohneMaterial.length ? "warn" : "gut"} knopf={ohneMaterial.length ? "material" : ""}
            ansehen={() => alt.vorbereitungFenster(ohneMaterial, "Aufträge ohne Material")} />
        </div>
        {!ohneFa.length && !ohneMaterial.length && <p className="hinweis">Alles vorbereitet.</p>}
      </section>
    </div>
  );
}

// ---------- Kurzfassung der Einkaufsliste ----------

export function EinkaufKurz({ auffrischen }) {
  const { daten: liste } = useDaten(() => abfrage(
    alt.db.from("shopping_items").select("*").eq("is_done", false)
      .order("prio").order("created_at").limit(12), 8000, "Einkauf"), [auffrischen]);
  if (!liste) return <div id="db-einkauf" />;
  return (
    <div id="db-einkauf">
      <KlickKarte zu="einkauf">
        <h2>Einkaufsliste{liste.length > 0 && <> <span className="marke">{liste.length}</span></>}</h2>
        {liste.length
          ? <div className="notizen">
              {liste.map((z) => (
                <div className="notiz" key={z.id}>
                  <span className={"priopunkt " + (PRIO[z.prio] || PRIO[3]).farbe}></span>
                  <span className="notiz__text">{z.text}
                    {z.menge && <> <span className="klein">{z.menge}</span></>}</span>
                </div>
              ))}
            </div>
          : <p className="hinweis">Nichts einzukaufen.</p>}
      </KlickKarte>
    </div>
  );
}

// ---------- Offene Bestellungen ----------

export function Bestellstand({ auffrischen }) {
  const { daten } = useDaten(() => abfrage(
    alt.db.from("order_items").select("status, needed_by")
      .in("status", ["offen", "bestellt", "teilweise_geliefert"]), 9000, "Bestellungen")
    .catch(() => []), [auffrischen]);
  if (!daten) return <div id="db-status" />;

  // Zusammenfassung statt langer Liste: wie viele in welchem Zustand
  const heute = alt.isoDatum(new Date());
  const zaehler = { offen: 0, bestellt: 0, teilweise_geliefert: 0 };
  let ueberfaellig = 0, spaeteste = null;
  daten.forEach((z) => {
    if (zaehler[z.status] !== undefined) zaehler[z.status]++;
    if (z.needed_by && z.needed_by < heute) {
      ueberfaellig++;
      if (!spaeteste || z.needed_by < spaeteste) spaeteste = z.needed_by;
    }
  });
  const gesamt = zaehler.offen + zaehler.bestellt + zaehler.teilweise_geliefert;

  return (
    <div id="db-status">
      <KlickKarte zu="bestellungen">
        <h2>Bestellungen{gesamt > 0 && <> <span className="marke">{gesamt}</span></>}</h2>
        {gesamt
          ? <>
              <div className="db-bestellzahlen">
                {[["offen", "offen"], ["bestellt", "bestellt"], ["teilweise_geliefert", "teilweise da"]]
                  .map(([st, text]) => (
                    <div className="db-bestellzahl" key={st}><strong>{zaehler[st]}</strong><span>{text}</span></div>
                  ))}
              </div>
              {ueberfaellig > 0 &&
                <p className="hinweis minus stark">{ueberfaellig}
                  {ueberfaellig === 1 ? " Position ist" : " Positionen sind"} über der Frist
                  {spaeteste ? ", seit " + alt.kurzDatum(spaeteste) : ""}.</p>}
            </>
          : <p className="hinweis">Keine offenen Bestellungen.</p>}
      </KlickKarte>
    </div>
  );
}

// ---------- Geburtstage ----------

// Die Startseite lädt einmal und gibt die Liste an die Karte und an das
// blaue Band oben weiter (dort erscheint am Geburtstag die Person).
export async function geburtstageLaden() {
  const leute = await abfrage(alt.db.from("profiles").select("full_name, email, geburtstag, bild_url")
    .not("geburtstag", "is", null).eq("is_active", true), 8000, "Geburtstage");
  // Personen ohne Login zählen genauso
  try {
    const r = await alt.zeitlimit(alt.db.from("people").select("name, geburtstag, bild_url")
      .not("geburtstag", "is", null), 8000, "Personen");
    if (!r.error) {
      (r.data || []).forEach((m) => leute.push({
        full_name: m.name, email: m.name, geburtstag: m.geburtstag, bild_url: m.bild_url }));
    }
  } catch (f) { /* Tabelle gibt es vielleicht noch nicht */ }
  return leute;
}

// Nächster Geburtstag, Tage bis dahin und das neue Alter je Person,
// sortiert nach dem nächsten. Zeilen ohne gültiges Datum fallen weg,
// statt dass die ganze Liste abbricht.
export function geburtstageAufbereiten(leute) {
  const heute = new Date();
  const heuteNur = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
  return (leute || []).filter((m) => {
    if (!m.geburtstag) return false;
    const d = alt.ausIso(m.geburtstag);
    return d && !isNaN(d.getTime());
  }).map((m) => {
    const g = alt.ausIso(m.geburtstag);
    let naechster = new Date(heute.getFullYear(), g.getMonth(), g.getDate());
    if (naechster < heuteNur) naechster = new Date(heute.getFullYear() + 1, g.getMonth(), g.getDate());
    return {
      name: m.full_name || m.email,
      bild: m.bild_url,
      geboren: m.geburtstag,
      datum: alt.isoDatum(naechster),
      tage: Math.round((naechster - heuteNur) / 86400000),
      alter: naechster.getFullYear() - g.getFullYear(),
    };
  }).sort((a, c) => a.tage - c.tage);
}

export function Geburtstage({ leute, fehler }) {

  // Fehlt die Spalte in der Datenbank, sagen wir das offen, statt den
  // Bereich still verschwinden zu lassen.
  if (fehler && !leute) {
    return (
      <div id="db-geburtstage"><section className="karte"><h2>Geburtstage</h2>
        <p className="hinweis">Noch nicht verfügbar: {alt.fehlertext(fehler)}</p></section></div>
    );
  }
  if (!leute) return <div id="db-geburtstage" />;
  if (!leute.length) {
    return (
      <div id="db-geburtstage"><section className="karte"><h2>Geburtstage</h2>
        <p className="hinweis">Noch kein Geburtstag hinterlegt.
          {" "}Jeder trägt seinen unter Einstellungen ein.</p></section></div>
    );
  }

  const alle = geburtstageAufbereiten(leute);

  // Alle innerhalb von 30 Tagen, höchstens fünf. Sind es weniger als
  // fünf, wird mit den nächstfolgenden aufgefüllt.
  let liste = alle.filter((m) => m.tage <= 30).slice(0, 5);
  if (liste.length < 5) liste = alle.slice(0, 5);

  return (
    <div id="db-geburtstage">
      <section className="karte"><h2>Geburtstage</h2>
        {liste.map((m, i) => (
          <div className="gebzeile" key={m.name + i}>
            {m.bild
              ? <img className="kopf__bild" src={m.bild} alt="" />
              : <span className="kopf__bild kopf__bild--leer">{m.name.charAt(0).toUpperCase()}</span>}
            <div className="problemzeile__inhalt">
              <div className="problemzeile__nr">{m.name} <span className="klein">wird {m.alter}</span></div>
              <div className="klein">
                {m.tage === 0 ? "Heute!" : m.tage === 1 ? "Morgen"
                  : "in " + m.tage + (m.tage > 30 ? " Tagen, also später" : " Tagen")}
                {" · " + alt.langDatum(m.datum)}
              </div>
            </div>
            {m.tage === 0 && <span className="gebtorte">🎂</span>}
          </div>
        ))}
      </section>
    </div>
  );
}
