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
//  - artikelZuweisenOeffnen(artikel, fertig): HOCO Nummern und PDFs
//    eines beliebigen Artikels, aus Bestellungen → Artikel (seit 1.290.0).
//  Daten in src/daten/spezialwerkzeuge.js. Nicht für Externe.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { wiederOeffner } from "./wiederherstellen.js";
import { positionOeffnen } from "../seiten/bestellungen/PositionFenster.jsx";
import { ArtikelAngaben } from "../seiten/bestellungen/teile.jsx";
import { spezialLaden, spezialZuordnen, spezialEntfernen, hocoNormal, offenText,
  fehltTabelle, FEHLT_TEXT, spezialPdfHochladen, spezialPdfLoeschen, spezialPdfsLaden,
  artikelZuordnungen } from "../daten/spezialwerkzeuge.js";
import { betrachter } from "./Betrachter.jsx";

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
                bestellen={() => nachbestellen(z, maschine, laden)} entfernen={() => entfernen(z)} neuLaden={laden} />)}
            </ul>}
      </div>
    </div>
  );
}

export function SpezialZeile({ z, schreiben, bestellen, entfernen, mitHoco, neuLaden }) {
  const a = z.artikel;
  const unterwegs = offenText(z.offen);
  const [laedt, setLaedt] = useState(false);
  const datei = useRef(null);
  const pdfs = z.pdfs || [];
  const hochladen = async (dateien) => {
    if (!dateien.length) return;
    setLaedt(true);
    try {
      for (const d of dateien) await spezialPdfHochladen(a, d);
      alt.meldung(dateien.length === 1 ? "PDF hinterlegt." : dateien.length + " PDFs hinterlegt.", "gut");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    finally { setLaedt(false); if (neuLaden) neuLaden(); }
  };
  const pdfWeg = async (p) => {
    if (!(await alt.nachfragen({ titel: "PDF löschen", text: "„" + p.name + "“ bei " + a.article_number + " löschen?",
      bestaetigen: "Löschen", gefahr: true }))) return;
    try { await spezialPdfLoeschen(p); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    if (neuLaden) neuLaden();
  };
  return (
    <li className="spezial__zeile" data-spezial={z.id || z.article_id}>
      <div className="spezial__text">
        {mitHoco && <span className="spezial__hoco">{z.hoco_nr}</span>}
        <b>{a.article_number}</b> <span>{a.name}</span>
        {a.description && <span className="klein spezial__beschreibung">{a.description}</span>}
        <span className="klein">Lieferant: {a.supplier_name || "keiner hinterlegt"}
          {z.notiz ? " · " + z.notiz : ""}</span>
        {unterwegs && <span className="spezial__unterwegs" data-unterwegs="">Schon in Bestellung: {unterwegs}</span>}
        {/* PDFs zum Werkzeug (seit 1.288.0): antippen öffnet sie */}
        {(pdfs.length > 0 || (schreiben && neuLaden)) && <span className="spezial__pdfs">
          {pdfs.map((p) => <span key={p.id} className="spezial__pdf">
            <button className="knopf knopf--klein" data-spezial-pdf={p.id} title="PDF öffnen"
              onClick={() => betrachter(p.url, p.name + " · " + a.article_number, true)}>📄 {p.name}</button>
            {schreiben && neuLaden && <button className="linkknopf spezial__pdf-weg" data-spezial-pdf-weg={p.id}
              title="PDF löschen" onClick={() => pdfWeg(p)}>✕</button>}</span>)}
          {schreiben && neuLaden && <>
            <button className="knopf knopf--klein" data-spezial-pdf-neu={a.id} disabled={laedt}
              onClick={() => datei.current && datei.current.click()}>{laedt ? "Lädt …" : "+ PDF"}</button>
            <input ref={datei} type="file" accept="application/pdf,.pdf" multiple hidden data-spezial-pdf-datei={a.id}
              onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; hochladen(l); }} /></>}
        </span>}
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
      alt.meldung(n ? "Artikel zugeordnet." : "War schon zugeordnet.", "gut");
      zu();
      if (fertig) fertig();
    } catch (f) {
      alt.meldung(fehltTabelle(f) ? FEHLT_TEXT : alt.fehlertext(f), "fehler");
      setSpeichert(false);
    }
  };

  return (
    <div className="dialog" id="spezial-zuordnen"><h2>Artikel zuordnen</h2>
      <label className="feld"><span>HOCO Nr.</span>
        <input type="text" id="sz-hoco" value={nrs} placeholder="z.B. 10007-0440"
          data-fokus={hoco ? undefined : ""} onChange={(e) => setNrs(e.target.value)} />
        <span className="feldhinweis">Mehrere mit Komma trennen</span></label>
      <div className="feld"><span className="feldlabel">Artikel</span>
        {gewaehlt
          ? <div className="pd-gewaehlt" id="sz-gewaehlt">
              <ArtikelAngaben a={gewaehlt} />
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
                    <ArtikelAngaben a={a} />
                    {a.aehnlich && <span className="bs-aehnlich">ähnlich</span>}
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

// ---------- HOCO Nr. und PDFs eines Artikels ----------
// Aus Bestellungen → Artikel, für jeden Artikel, nicht nur
// Spezialwerkzeuge (seit 1.290.0, Wunsch Patrick 30. Oktober 2026:
// „Ich will das auch bei Bestellen zuweisen können … soll auch für
// alles offen sein“). Zuordnen ändert das Kennzeichen ★ nicht.

export function artikelZuweisenOeffnen(artikel, fertig) {
  fensterOeffnen((zu) => <ArtikelZuweisen a={artikel} zu={zu} fertig={fertig} />);
}

function ArtikelZuweisen({ a, zu, fertig }) {
  const [hocos, setHocos] = useState(null);
  const [pdfs, setPdfs] = useState(null);
  const [fehler, setFehler] = useState("");
  const [nrs, setNrs] = useState("");
  const [laedt, setLaedt] = useState(false);
  const geaendert = useRef(false);
  const datei = useRef(null);
  const schreiben = alt.darfSchreiben();

  const laden = async () => {
    try { setHocos(await artikelZuordnungen(a.id)); setFehler(""); }
    catch (f) { setFehler(fehltTabelle(f) ? FEHLT_TEXT : alt.fehlertext(f)); setHocos([]); }
    setPdfs((await spezialPdfsLaden([a.id]))[a.id] || []);
  };
  // Die Liste dahinter erst beim Schliessen auffrischen (auch mit Escape),
  // sonst springt sie
  useEffect(() => { laden(); return () => { if (geaendert.current && fertig) fertig(); }; }, []);
  const schliessen = zu;
  const nachher = () => { geaendert.current = true; laden(); };

  const liste = nrs.split(/[,;\n]+/).map((x) => hocoNormal(x)).filter(Boolean);
  const zuordnen = async () => {
    if (!liste.length || laedt) return;
    setLaedt(true);
    try {
      const n = await spezialZuordnen(a, liste, "");
      alt.meldung(n ? "Zugeordnet." : "War schon zugeordnet.", "gut");
      setNrs("");
    } catch (f) { alt.meldung(fehltTabelle(f) ? FEHLT_TEXT : alt.fehlertext(f), "fehler"); }
    setLaedt(false); nachher();
  };
  const entfernen = async (z) => {
    try { await spezialEntfernen(Object.assign({}, z, { artikel: a })); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    nachher();
  };
  const hochladen = async (dateien) => {
    if (!dateien.length) return;
    setLaedt(true);
    try {
      for (const d of dateien) await spezialPdfHochladen(a, d);
      alt.meldung(dateien.length === 1 ? "PDF hinterlegt." : dateien.length + " PDFs hinterlegt.", "gut");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    setLaedt(false); nachher();
  };
  const pdfWeg = async (p) => {
    if (!(await alt.nachfragen({ titel: "PDF löschen", text: "„" + p.name + "“ bei " + a.article_number + " löschen?",
      bestaetigen: "Löschen", gefahr: true }))) return;
    try { await spezialPdfLoeschen(p); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    nachher();
  };

  return (
    <div className="dialog" id="artikel-zuweisen">
      <h2>HOCO Nr. und PDFs</h2>
      <div className="pd-gewaehlt"><ArtikelAngaben a={a} /></div>
      {fehler && <p className="fehlertext">{fehler}</p>}
      <div className="feld"><span className="feldlabel">HOCO Nr.</span>
        {hocos === null ? <p className="klein">Lädt …</p>
          : !hocos.length ? <p className="klein">Noch keiner HOCO Nr. zugeordnet.</p>
          : <div className="az-liste">{hocos.map((z) => (
              <span key={z.id} className="az-hoco" data-az-hoco={z.hoco_nr}>{z.hoco_nr}
                {schreiben && <button className="linkknopf spezial__pdf-weg" data-az-hoco-weg={z.hoco_nr}
                  title="Zuordnung entfernen" onClick={() => entfernen(z)}>✕</button>}</span>))}</div>}
        {schreiben && <div className="az-neu">
          <input type="text" id="az-hoco" value={nrs} placeholder="z.B. 10007-0440, mehrere mit Komma"
            data-fokus="" onChange={(e) => setNrs(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); zuordnen(); } }} />
          <button className="knopf knopf--haupt" id="az-zuordnen" disabled={!liste.length || laedt}
            onClick={zuordnen}>Zuordnen</button></div>}
      </div>
      <div className="feld"><span className="feldlabel">PDFs</span>
        <div className="spezial__pdfs">
          {pdfs && !pdfs.length && !schreiben && <span className="klein">Keine PDFs hinterlegt.</span>}
          {(pdfs || []).map((p) => <span key={p.id} className="spezial__pdf">
            <button className="knopf knopf--klein" data-spezial-pdf={p.id} title="PDF öffnen"
              onClick={() => betrachter(p.url, p.name + " · " + a.article_number, true)}>📄 {p.name}</button>
            {schreiben && <button className="linkknopf spezial__pdf-weg" data-spezial-pdf-weg={p.id}
              title="PDF löschen" onClick={() => pdfWeg(p)}>✕</button>}</span>)}
          {schreiben && <>
            <button className="knopf knopf--klein" data-spezial-pdf-neu={a.id} disabled={laedt}
              onClick={() => datei.current && datei.current.click()}>{laedt ? "Lädt …" : "+ PDF"}</button>
            <input ref={datei} type="file" accept="application/pdf,.pdf" multiple hidden data-spezial-pdf-datei={a.id}
              onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; hochladen(l); }} /></>}
        </div>
      </div>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--haupt" data-zu="" onClick={schliessen}>Fertig</button>
      </div>
    </div>
  );
}
