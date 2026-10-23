// =================================================================
//  SPEZIALWERKZEUGE · Fenster (seit 1.131.0, Wunsch Patrick
//  21. Oktober 2026: „erforderliche Spezialwerkzeuge für die Aufträge
//  schnell nachbestellen“)
//
//  - spezialwerkzeugeOeffnen({ hoco, maschine }): die Spezialwerkzeuge
//    einer HOCO Nr., geöffnet aus dem Auftragsfenster der Planwand und
//    im Pad Mode an der Maschine. „Nachbestellen“ öffnet dasselbe
//    Fenster wie „Neue Bestellposition“, mit Artikel und Maschine
//    schon eingetragen.
//  - zuordnenOeffnen(hoco, fertig): einen Artikel (oder neu angelegten)
//    einer oder mehreren HOCO Nummern zuordnen. Auch aus dem Reiter
//    Bestellungen → Spezialwerkzeuge.
//  Daten in src/daten/spezialwerkzeuge.js. Nicht für Externe.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { wiederOeffner } from "./wiederherstellen.js";
import { positionOeffnen } from "../seiten/bestellungen/PositionFenster.jsx";
import { spezialLaden, spezialZuordnen, spezialEntfernen, hocoNormal, offenText,
  fehltTabelle, FEHLT_TEXT } from "../daten/spezialwerkzeuge.js";

const maschineKurz = (m) => m ? { id: m.id, name: m.name, machine_number: m.machine_number } : null;

export function spezialwerkzeugeOeffnen({ hoco, maschine }) {
  if (!hoco) return;
  fensterOeffnen((zu) => <SpezialFenster hoco={hocoNormal(hoco)} maschine={maschine} zu={zu} />,
    null, "unterlagen-huelle",
    { art: "spezialwerkzeuge", daten: { hoco: hocoNormal(hoco), maschine: maschineKurz(maschine) } });
}
wiederOeffner("spezialwerkzeuge", (d) => spezialwerkzeugeOeffnen(d));

// Nachbestellen wie jede andere Bestellposition, Artikel schon gewählt
export function nachbestellen(z, maschine, fertig) {
  positionOeffnen(fertig, {
    artikel: z.artikel,
    maschine: maschine || null,
    notiz: z.hoco_nr ? "Spezialwerkzeug für " + z.hoco_nr : "",
    spezial: true,
  });
}

function SpezialFenster({ hoco, maschine, zu }) {
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState("");
  const schreiben = alt.darfSchreiben();

  const laden = async () => {
    try { setListe(await spezialLaden(hoco)); setFehler(""); }
    catch (f) { setFehler(fehltTabelle(f) ? FEHLT_TEXT : alt.fehlertext(f)); setListe([]); }
  };
  useEffect(() => { laden(); }, []);

  const entfernen = async (z) => {
    const ja = await alt.nachfragen({ titel: "Spezialwerkzeug entfernen",
      text: "„" + z.artikel.article_number + "“ gehört dann nicht mehr zu " + z.hoco_nr
        + ". Der Artikel selbst bleibt in den Bestellungen.",
      bestaetigen: "Entfernen", gefahr: true });
    if (!ja) return;
    try { await spezialEntfernen(z); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    laden();
  };

  return (
    <div className="dialog dialog--breit unterlagen spezial" id="spezialwerkzeuge">
      <div className="blatt__kopf">
        <h2>Spezialwerkzeuge · {hoco}</h2>
        {maschine && <span className="klein">{maschine.name}{maschine.machine_number ? " " + maschine.machine_number : ""}</span>}
        {schreiben && <button className="knopf knopf--haupt" id="spezial-neu"
          onClick={() => zuordnenOeffnen(hoco, laden)}>+ Spezialwerkzeug</button>}
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      {fehler && <p className="fehlertext">{fehler}</p>}
      <div className="unterlagen__rolle">
        {liste === null
          ? <p className="klein">Lädt …</p>
          : !liste.length
          ? <p className="unterlagen__leer">Für {hoco} sind keine Spezialwerkzeuge hinterlegt.
              {schreiben ? " Mit „+ Spezialwerkzeug“ einen Artikel zuordnen." : ""}</p>
          : <ul className="spezial__liste">
              {liste.map((z) => <SpezialZeile key={z.id} z={z} schreiben={schreiben}
                bestellen={() => nachbestellen(z, maschine, laden)} entfernen={() => entfernen(z)} />)}
            </ul>}
      </div>
    </div>
  );
}

export function SpezialZeile({ z, schreiben, bestellen, entfernen, mitHoco }) {
  const a = z.artikel;
  const unterwegs = offenText(z.offen);
  return (
    <li className="spezial__zeile" data-spezial={z.id || z.article_id}>
      <div className="spezial__text">
        {mitHoco && <span className="spezial__hoco">{z.hoco_nr}</span>}
        <b>{a.article_number}</b> <span>{a.name}</span>
        {a.description && <span className="klein spezial__beschreibung">{a.description}</span>}
        <span className="klein">Lieferant: {a.supplier_name || "keiner hinterlegt"}
          {z.notiz ? " · " + z.notiz : ""}</span>
        {unterwegs && <span className="spezial__unterwegs" data-unterwegs="">Schon in Bestellung: {unterwegs}</span>}
      </div>
      <div className="unterlagen__knoepfe">
        {schreiben && <button className="knopf knopf--haupt" data-spezial-bestellen={z.id}
          onClick={bestellen}>Nachbestellen</button>}
        {schreiben && z.id && <button className="knopf knopf--klein knopf--gefahr-leise" data-spezial-weg={z.id}
          onClick={entfernen}>Entfernen</button>}
      </div>
    </li>
  );
}

// ---------- Zuordnen ----------

export function zuordnenOeffnen(hoco, fertig) {
  fensterOeffnen((zu) => <ZuordnenFenster hoco={hoco || ""} zu={zu} fertig={fertig} />);
}

function ZuordnenFenster({ hoco, zu, fertig }) {
  const [nrs, setNrs] = useState(hoco);
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState(null);
  const [gewaehlt, setGewaehlt] = useState(null);
  const [notiz, setNotiz] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const taste = useRef(null);
  const suchNr = useRef(0);
  useEffect(() => () => clearTimeout(taste.current), []);

  const suchen = async (text) => {
    const t = text.trim();
    if (!t) { setTreffer(null); return; }
    const nr = ++suchNr.current;
    try {
      const l = await alt.sucheArtikel(t);
      if (nr === suchNr.current) setTreffer(l);
    } catch (f) { if (nr === suchNr.current) setTreffer([]); }
  };

  const neuAnlegen = async () => {
    const a = await alt.artikelSchnellAnlegen(suche.trim(), null, true);
    if (a) { setGewaehlt(a); setTreffer(null); setSuche(""); }
  };

  const liste = nrs.split(/[,;\n]+/).map((x) => hocoNormal(x)).filter(Boolean);

  const zuordnen = async () => {
    if (!gewaehlt || !liste.length || speichert) return;
    setSpeichert(true);
    try {
      const n = await spezialZuordnen(gewaehlt, liste, notiz);
      alt.meldung(n ? "Spezialwerkzeug zugeordnet." : "War schon zugeordnet.", "gut");
      zu();
      if (fertig) fertig();
    } catch (f) {
      alt.meldung(fehltTabelle(f) ? FEHLT_TEXT : alt.fehlertext(f), "fehler");
      setSpeichert(false);
    }
  };

  return (
    <div className="dialog" id="spezial-zuordnen"><h2>Spezialwerkzeug zuordnen</h2>
      <label className="feld"><span>HOCO Nr.</span>
        <input type="text" id="sz-hoco" value={nrs} placeholder="z.B. 10007-0440"
          data-fokus={hoco ? undefined : ""} onChange={(e) => setNrs(e.target.value)} />
        <span className="feldhinweis">Mehrere mit Komma trennen</span></label>
      <div className="feld"><span className="feldlabel">Artikel</span>
        {gewaehlt
          ? <div className="pd-gewaehlt" id="sz-gewaehlt">
              <strong>{gewaehlt.article_number}</strong> {gewaehlt.name}
              <div className="klein">Lieferant: {gewaehlt.supplier_name || "keiner hinterlegt"}</div>
              {gewaehlt.spezial === false && <div className="klein spezial__wandert">Dieser Artikel und seine Bestellungen
                stehen danach nur noch bei den Spezialwerkzeugen.</div>}
              <button type="button" className="knopf knopf--klein knopf--still" onClick={() => setGewaehlt(null)}>
                Anderen wählen</button>
            </div>
          : <>
              <div className="suchleiste">
                <input type="text" id="sz-such" placeholder="Artikelnummer oder Bezeichnung suchen" autoComplete="off"
                  data-fokus={hoco ? "" : undefined} value={suche}
                  onChange={(e) => {
                    const t = e.target.value; setSuche(t);
                    clearTimeout(taste.current); taste.current = setTimeout(() => suchen(t), 300);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(taste.current); suchen(suche); } }} />
              </div>
              <div className="pd-treffer" id="sz-treffer">
                {treffer && treffer.slice(0, 8).map((a) => (
                  <button key={a.id} className="pd-zeile" data-w={a.id}
                    onClick={() => { setGewaehlt(a); setTreffer(null); setSuche(""); }}>
                    <strong>{a.article_number}</strong> {a.name}
                    <span className="klein"> {a.supplier_name || "ohne Lieferant"}</span>
                    {/* Ein normaler Artikel wandert beim Zuordnen zu den Spezialwerkzeugen */}
                    {a.spezial === false && <span className="klein spezial__wandert"> · kommt aus den Bestellungen hierher</span>}
                  </button>))}
                {treffer && !treffer.length && <p className="hinweis">Kein Artikel gefunden.</p>}
                <button className="pd-zeile pd-zeile--neu" data-neuartikel="" onClick={neuAnlegen}>
                  + {suche.trim() ? "Artikel „" + suche.trim() + "“ neu anlegen" : "Neuen Artikel anlegen"}</button>
              </div>
            </>}
      </div>
      <label className="feld"><span>Notiz</span>
        <input type="text" id="sz-notiz" value={notiz} placeholder="z.B. Platz 3, nur für Typ SR-20"
          onChange={(e) => setNotiz(e.target.value)} /></label>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" data-nein="" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" id="sz-ja" disabled={!gewaehlt || !liste.length || speichert}
          onClick={zuordnen}>Zuordnen</button>
      </div>
    </div>
  );
}
