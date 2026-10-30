// =================================================================
//  BESTELLUNGEN · Fenster „Neue Bestellposition“
//  Artikel suchen (oder neu anlegen), Menge, Frist, wohin die Lieferung
//  soll, Notiz. Das Anlegen eines neuen Artikels ist eine Folge von
//  Fenstern (Nummer, Bezeichnung, Lieferant) und bleibt im alten
//  Programm (artikelSchnellAnlegen), weil auch das Einrichtblatt es
//  braucht.
//  Seit 1.109.0 auch per Foto der Verpackung (Wunsch Patrick
//  19. Oktober 2026): zuerst passende Artikel zeigen, sonst einen
//  neuen mit der gelesenen Nummer anlegen. Was man danach bestellt,
//  lernt die App für das nächste Foto (src/daten/artikelFoto.js).
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { ArtikelAngaben } from "./teile.jsx";
import { betrachter } from "../../teile/Betrachter.jsx";
import { spezialPdfsLaden } from "../../daten/spezialwerkzeuge.js";
import { artikelFotoLesen, artikelFuerFoto, artikelFinden, artikelLernen } from "../../daten/artikelFoto.js";

// fertig: wird nach dem Speichern aufgerufen, damit die Liste neu lädt.
// vorgabe: { artikel, maschine, notiz } schon eingetragen, etwa beim
// Nachbestellen eines Spezialwerkzeugs (seit 1.131.0).
// vorgabe.spezial: ein neu angelegter Artikel ist schon als
// Spezialwerkzeug angehakt. Gesucht wird seit 1.271.0 immer in allen
// Artikeln (Wunsch Patrick 29. Oktober 2026: „alles zusammen“).
export function positionOeffnen(fertig, vorgabe) {
  fensterOeffnen((zu) => <PositionFenster zu={zu} fertig={fertig} vorgabe={vorgabe || {}} />);
}

// Werkzeug fürs Einrichtblatt wählen: dasselbe Fenster wie beim
// Bestellen, nur ohne Menge und Ziel; seit 1.271.0 mit allen Artikeln
// zusammen, ohne Knopf „Spezialwerkzeuge“ (Wunsch Patrick, 23. Oktober 2026:
// „Werkzeuge nur auswählen, wenn nicht vorhanden erstellen wie bei
// bestellen, mit einem Button für Spezialwerkzeuge“). Gibt den Artikel
// aus artikel_uebersicht zurück oder null.
export function werkzeugWaehlen(vorgabe) {
  return new Promise((fertig) => {
    let erledigt = false;
    const ende = (a) => { if (!erledigt) { erledigt = true; fertig(a || null); } };
    fensterOeffnen((zu) => <PositionFenster zu={() => { ende(null); zu(); }} fertig={null}
      vorgabe={Object.assign({}, vorgabe || {}, { waehlen: (a) => { ende(a); zu(); } })} />, () => ende(null));
  });
}

const ZIELE = [["lager", "Lager"], ["maschine", "Maschine"], ["person", "Person"], ["andere", "Anderes"]];

function PositionFenster({ zu, fertig, vorgabe }) {
  const [suche, setSuche] = useState(vorgabe.suche || "");
  const [treffer, setTreffer] = useState(null);     // null: noch nichts gesucht
  const [sucht, setSucht] = useState(false);
  const [suchFehler, setSuchFehler] = useState(null);
  const [gewaehlt, setGewaehlt] = useState(vorgabe.artikel || null);
  const [menge, setMenge] = useState("1");
  const [frist, setFrist] = useState("");
  // Liefertermin für den Lieferanten (frei, etwa „KW23“), steht nur
  // auf dem Bestell-PDF, wenn etwas drin ist (seit 1.300.0)
  const [termin, setTermin] = useState("");
  const [notiz, setNotiz] = useState(vorgabe.notiz || "");
  // Lager ist der Normalfall und deshalb vorgewählt. Es wird nicht
  // verbucht, sondern steht wie jedes andere Ziel in der Historie.
  // Kommt die Bestellung von einer Maschine, geht sie dorthin
  const [zielArt, setZielArt] = useState(vorgabe.maschine ? "maschine" : "lager");
  const [zielWahl, setZielWahl] = useState(vorgabe.maschine ? alt.maschineZielText(vorgabe.maschine) : "");
  const [zielFrei, setZielFrei] = useState("");
  const [maschinen, setMaschinen] = useState(
    (alt.best.alleMaschinen && alt.best.alleMaschinen.length) ? alt.best.alleMaschinen : null);
  const [personen, setPersonen] = useState(null);
  const [speichert, setSpeichert] = useState(false);
  const taste = useRef(null);
  const mengeFeld = useRef(null);
  const freiFeld = useRef(null);
  const suchNr = useRef(0);
  // Foto: null, { liest, text }, { fehler } oder { lesung, treffer }
  const [foto, setFoto] = useState(null);
  const fotoFeld = useRef(null);
  // Offene und bestellte Positionen des gewählten Artikels, damit
  // niemand dasselbe zweimal aufschreibt (Wunsch Patrick 26. Oktober
  // 2026: „wenn schon bestellt, soll kurze Info kommen“). Nur ein
  // Hinweis, hinzufügen geht trotzdem.
  const [schonDa, setSchonDa] = useState(null);
  // PDFs, die beim gewählten Artikel hinterlegt sind (spezial_pdfs),
  // damit man das Werkzeug gleich ansehen kann (seit 1.299.0, Wunsch
  // Patrick 30. Oktober 2026: „Werkzeug ansehen“, auch aus dem Einrichtblatt)
  const [pdfs, setPdfs] = useState([]);

  useEffect(() => () => clearTimeout(taste.current), []);
  // Mit Vorgabe (etwa der Text aus dem alten Excel) gleich suchen
  useEffect(() => { if (vorgabe.suche) suchen(vorgabe.suche); }, []);
  // Maschinen für die Auswahl, wenn die Maschine schon vorgegeben ist
  useEffect(() => {
    if (!vorgabe.maschine || maschinen) return;
    alt.ladeAlleMaschinen().then((liste) => { alt.best.alleMaschinen = liste; setMaschinen(liste); }, () => {});
  }, []);

  const suchen = async (text) => {
    const t = text.trim();
    if (!t) { setTreffer(null); return; }
    const nr = ++suchNr.current;
    setSucht(true);
    try {
      const liste = await alt.sucheArtikel(t);
      // Nur das Ergebnis der letzten Suche zählt
      if (nr !== suchNr.current) return;
      setTreffer(liste); setSuchFehler(null);
    } catch (f) {
      if (nr === suchNr.current) setSuchFehler(alt.fehlertext(f));
    } finally {
      if (nr === suchNr.current) setSucht(false);
    }
  };

  const waehlen = (a) => {
    setGewaehlt(a);
    setTreffer(null);
    setSuche("");
    // Nach der Wahl gleich die Menge eintippen können
    setTimeout(() => mengeFeld.current && mengeFeld.current.focus(), 0);
  };

  const nurWaehlen = typeof vorgabe.waehlen === "function";

  useEffect(() => {
    setSchonDa(null);
    if (!gewaehlt || nurWaehlen) return;
    let weg = false;
    alt.db.from("order_items").select("id, quantity, status, status_am, ordered_at, created_at, ziel_text")
      .eq("article_id", gewaehlt.id).in("status", ["offen", "bestellt", "teilweise_geliefert"])
      .then(({ data }) => { if (!weg) setSchonDa((data || []).filter((z) => z.status !== "geliefert")); },
        () => {});
    return () => { weg = true; };
  }, [gewaehlt && gewaehlt.id]);
  useEffect(() => {
    setPdfs([]);
    if (!gewaehlt) return;
    let weg = false;
    spezialPdfsLaden([gewaehlt.id]).then((je) => { if (!weg) setPdfs(je[gewaehlt.id] || []); });
    return () => { weg = true; };
  }, [gewaehlt && gewaehlt.id]);
  const ansehen = pdfs.length > 0 && (
    <div className="pd-ansehen" id="pd-ansehen">
      {pdfs.map((p) => (
        <button key={p.id} type="button" className="knopf knopf--klein" data-pd-ansehen={p.id}
          onClick={() => betrachter(p.url, p.name + " · " + (gewaehlt.article_number || ""), true)}>
          📄 {pdfs.length === 1 ? "Werkzeug ansehen" : p.name}</button>
      ))}
    </div>
  );
  const spezial = !!vorgabe.spezial;
  const neuAnlegen = async (nummer) => {
    const a = await alt.artikelSchnellAnlegen(typeof nummer === "string" ? nummer : suche.trim(), null, !!spezial);
    if (a) waehlen(a);
  };

  const fotoGewaehlt = async (e) => {
    const datei = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!datei) return;
    setFoto({ liest: true, text: "Texterkennung wird geladen …" });
    try {
      const [lesung, artikel] = await Promise.all([
        artikelFotoLesen(datei, (status, anteil) => {
          const lesen = /recogniz/.test(status || "");
          setFoto({ liest: true, text: lesen ? "Foto wird gelesen … " + Math.round(anteil * 100) + " %"
            : "Texterkennung wird geladen …" });
        }),
        artikelFuerFoto(),
      ]);
      const treffer = artikelFinden(lesung, artikel);
      setFoto({ lesung, treffer });
      setTreffer(null);
      // Ein klarer Treffer ist gleich gewählt, prüfen muss man trotzdem
      if (treffer.length && treffer[0].sicher && !(treffer[1] && treffer[1].sicher)) waehlen(treffer[0].a);
    } catch (f) {
      setFoto({ fehler: "Das Foto liess sich nicht lesen. Ohne Internet geht es beim ersten Mal nicht. " + alt.fehlertext(f) });
    }
  };
  const fotoLesung = foto && foto.lesung;

  // Was die Zielauswahl braucht, erst laden, wenn sie gewählt wird
  const zielSetzen = async (art) => {
    setZielArt(art);
    setZielWahl("");
    if (art === "andere") setTimeout(() => freiFeld.current && freiFeld.current.focus(), 0);
    if (art === "maschine" && !maschinen) {
      try {
        const liste = await alt.ladeAlleMaschinen();
        alt.best.alleMaschinen = liste;
        setMaschinen(liste);
      } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    }
    if (art === "person" && !personen) {
      try {
        const a = await alt.db.from("profiles").select("full_name, email").eq("is_active", true).order("full_name");
        // Gespeichert wird die Mailadresse, angezeigt der Name. So
        // stimmt der Name auch nach einem Umbenennen noch.
        const namen = (a.data || []).map((u) => ({ wert: u.email || u.full_name, text: alt.personName(u) }));
        try {
          const c = await alt.db.from("people").select("name").order("name");
          (c.data || []).forEach((m) => namen.push({ wert: m.name, text: m.name }));
        } catch (f) { /* Tabelle gibt es vielleicht nicht */ }
        setPersonen(namen.sort((x, y) => x.text.localeCompare(y.text, "de")));
      } catch (f) { setPersonen(false); }
    }
  };

  const hinzufuegen = async () => {
    if (!gewaehlt || speichert) return;
    const m = Math.round(Number(menge));
    if (!Number.isFinite(m) || m < 1) { alt.meldung("Menge muss mindestens 1 sein.", "warn"); return; }
    const zielText = zielArt === "lager" ? "Lager" : zielArt === "andere" ? zielFrei.trim() : zielWahl;
    if (!zielText) { alt.meldung("Bitte noch angeben, wohin die Lieferung soll.", "warn"); return; }

    setSpeichert(true);
    const daten = {
      article_id: gewaehlt.id,
      supplier_id: gewaehlt.supplier_id || null,
      quantity: m,
      needed_by: frist || null,
      note: notiz.trim() || null,
      ziel_art: zielArt,
      ziel_text: zielText,
    };
    if (termin.trim()) daten.liefertermin = termin.trim();
    let { data, error } = await alt.db.from("order_items").insert(daten).select("id");
    // Kennt die Datenbank das Feld noch nicht (sql/bestellung-liefertermin.sql),
    // wird die Position ohne Termin gespeichert statt gar nicht
    if (error && daten.liefertermin && /liefertermin/.test(alt.fehlertext(error))) {
      delete daten.liefertermin;
      ({ data, error } = await alt.db.from("order_items").insert(daten).select("id"));
      if (!error) alt.meldung("Der Liefertermin liess sich noch nicht speichern (Datenbank).", "warn");
    }
    setSpeichert(false);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    // Nach einem Foto: die Verpackung gehört zu diesem Artikel
    if (fotoLesung) artikelLernen(gewaehlt.id, fotoLesung).catch(() => {});
    if (Array.isArray(data) && data[0]) alt.merkeSchritt("Neue Position " + (gewaehlt.article_number || ""),
      alt.rueckWeg("order_items", { id: data[0].id }));
    zu();
    alt.meldung("Position hinzugefügt.");
    if (fertig) fertig();
  };

  const schreiben = alt.darfSchreiben();

  return (
    <div className="dialog" data-werkzeugwahl={nurWaehlen ? "" : undefined}>
      <h2>{nurWaehlen ? "Werkzeug wählen" : "Neue Bestellposition"}</h2>
      <div className="suchleiste">
        <input type="text" id="pd-such" placeholder="Suchen" autoComplete="off" data-fokus="" value={suche}
          onChange={(e) => {
            const t = e.target.value;
            setSuche(t);
            clearTimeout(taste.current);
            taste.current = setTimeout(() => suchen(t), 300);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); clearTimeout(taste.current); suchen(suche); }
          }} />
      </div>
      {/* Aus dem Einrichtblatt ist der Artikel schon klar: kein Foto
          (Wunsch Patrick 30. Oktober 2026) */}
      {!vorgabe.ohneFoto && <div className="mat-foto pd-foto" id="pd-foto">
        <input ref={fotoFeld} type="file" accept="image/*" hidden id="pd-foto-datei" onChange={fotoGewaehlt} />
        <button type="button" className="knopf" id="pd-foto-knopf" disabled={!!(foto && foto.liest)}
          onClick={() => fotoFeld.current && fotoFeld.current.click()}>📷 Artikel fotografieren</button>
        {foto && foto.liest && <span className="klein" id="pd-foto-stand">{foto.text}</span>}
        {foto && foto.fehler && <span className="klein mat-foto__fehler">{foto.fehler}</span>}
        {fotoLesung && (
          <div className="mat-foto__ergebnis" id="pd-foto-ergebnis">
            {foto.treffer.length
              ? <>
                  <span className="klein"><b>{foto.treffer.length === 1 ? "Diesen Artikel gibt es schon:" : "Passende Artikel:"}</b></span>
                  {foto.treffer.map((t) => (
                    <button key={t.a.id} className={"pd-zeile" + (gewaehlt && gewaehlt.id === t.a.id ? " pd-zeile--gewaehlt" : "")}
                      data-fotow={t.a.id} data-punkte={t.punkte} onClick={() => waehlen(t.a)}>
                      <ArtikelAngaben a={t.a} />
                      <span className={"bs-chip" + (t.sicher ? "" : " bs-chip--still")}>
                        {t.sicher ? "passt" : "vielleicht"}</span></button>
                  ))}
                </>
              : <span className="klein" id="pd-foto-nichts"><b>Diesen Artikel gibt es noch nicht.</b>
                  {" "}Unten neu anlegen oder oben suchen, falls er doch schon da ist.</span>}
            {schreiben && !foto.treffer.some((t) => t.sicher) && (
              <div className="pd-foto__neu" id="pd-foto-neu">
                <span className="klein">Neu anlegen mit Nummer:</span>
                {fotoLesung.nummern.map((n) => (
                  <button key={n} type="button" className="knopf knopf--klein" data-fotonr={n}
                    onClick={() => neuAnlegen(n)}>{n}</button>
                ))}
                <button type="button" className="knopf knopf--klein knopf--still" data-fotonr=""
                  onClick={() => neuAnlegen("")}>andere</button>
              </div>
            )}
            <span className="klein">Beim Hinzufügen merkt sich die App die Verpackung für das nächste Foto.</span>
            {fotoLesung.codeTexte && fotoLesung.codeTexte.length > 0 &&
              <span className="klein" id="pd-foto-codes">Strichcode: {fotoLesung.codeTexte.join(", ")}</span>}
            <details><summary className="klein">Gelesener Text</summary>
              <pre className="mat-foto__text">{fotoLesung.text}</pre></details>
          </div>
        )}
      </div>}
      <div id="pd-treffer" className="pd-treffer">
        {sucht && !treffer && <div className="laedt">Wird gesucht …</div>}
        {suchFehler && <p className="hinweis">{suchFehler}</p>}
        {treffer && <>
          {treffer.length
            ? treffer.slice(0, 8).map((a) => (
                <button key={a.id} className="pd-zeile" data-w={a.id} onClick={() => waehlen(a)}>
                  <ArtikelAngaben a={a} />
                  {a.aehnlich && <span className="bs-aehnlich">ähnlich</span>}</button>
              ))
            : <p className="hinweis">Kein Artikel gefunden.</p>}
          {schreiben && suche.trim() &&
            <button className="pd-zeile pd-zeile--neu" data-neuartikel="" onClick={neuAnlegen}>
              + Artikel "{suche.trim()}" neu anlegen</button>}
        </>}
      </div>

      {gewaehlt && nurWaehlen && <div className="pd-gewaehlt" id="pd-gewaehlt">
        <ArtikelAngaben a={gewaehlt} />
        {ansehen}
      </div>}
      {gewaehlt && !nurWaehlen && <div id="pd-rest">
        <div className="pd-gewaehlt" id="pd-gewaehlt">
          <ArtikelAngaben a={gewaehlt} />
          {gewaehlt.gesamtbestand !== undefined && <div className="klein">Bestand {alt.zahlText(gewaehlt.gesamtbestand)}</div>}
          {ansehen}
        </div>
        {schonDa && schonDa.length > 0 && (
          <div className="pd-schonda" id="pd-schonda" role="status">
            <b>{schonDa.some((z) => z.status !== "offen")
              ? "Achtung: Dieser Artikel ist schon bestellt."
              : "Achtung: Dieser Artikel steht schon bei Offen."}</b>
            {schonDa.map((z) => (
              <div key={z.id} className="klein" data-schonda={z.status}>
                {alt.zahlText(z.quantity)} Stk. · {alt.statusZeitText(z) || ({ offen: "Offen", bestellt: "Bestellt",
                  teilweise_geliefert: "Teilweise geliefert" })[z.status]}{z.ziel_text ? " · " + z.ziel_text : ""}</div>
            ))}
          </div>
        )}
        <div className="zeitraumwahl">
          <label className="feld"><span>Menge</span>
            <input id="pd-menge" ref={mengeFeld} type="number" min="1" step="1" value={menge}
              onChange={(e) => setMenge(e.target.value)} /></label>
          <label className="feld"><span>Bis wann</span>
            <input id="pd-frist" type="date" value={frist} onChange={(e) => setFrist(e.target.value)} /></label>
        </div>
        <div className="feld"><span className="feldlabel">Wohin nach dem Eintreffen</span>
          <div className="moduswahl" id="pd-zielwahl">
            {ZIELE.map(([w, t]) => (
              <button key={w} type="button" className={"moduswahl__knopf" + (zielArt === w ? " aktiv" : "")}
                data-ziel={w} onClick={() => zielSetzen(w)}>{t}</button>
            ))}
          </div>
          {(zielArt === "maschine" || zielArt === "person") &&
            <select id="pd-zielauswahl" className="auswahl" value={zielWahl} onChange={(e) => setZielWahl(e.target.value)}>
              {zielArt === "maschine"
                ? <>
                    <option value="">{maschinen ? "Maschine wählen" : "Wird geladen …"}</option>
                    {(maschinen || []).map((m) => (
                      <option key={m.id} value={alt.maschineZielText(m)}>
                        {m.name}{m.machine_number ? " · " + m.machine_number : ""}</option>
                    ))}
                    {zielWahl && !(maschinen || []).some((m) => alt.maschineZielText(m) === zielWahl) &&
                      <option value={zielWahl}>{zielWahl}</option>}
                  </>
                : <>
                    <option value="">{personen === null ? "Wird geladen …"
                      : personen === false ? "Konnte nicht geladen werden" : "Person wählen"}</option>
                    {(personen || []).map((n, i) => <option key={n.wert + i} value={n.wert}>{n.text}</option>)}
                  </>}
            </select>}
          {zielArt === "andere" &&
            <input type="text" id="pd-zielfrei" ref={freiFeld} value={zielFrei} onChange={(e) => setZielFrei(e.target.value)} />}
        </div>
        <label className="feld"><span>Liefertermin fürs PDF (freiwillig)</span>
          <input type="text" id="pd-termin" placeholder="z. B. KW23 oder schnellstmöglich" value={termin}
            onChange={(e) => setTermin(e.target.value)} /></label>
        <label className="feld"><span>Notiz</span>
          <textarea id="pd-notiz" rows="2" value={notiz} onChange={(e) => setNotiz(e.target.value)} /></label>
      </div>}

      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" id="pd-nein" data-nein="" onClick={zu}>Abbrechen</button>
        {nurWaehlen
          ? <button className="knopf knopf--haupt" id="pd-ja" disabled={!gewaehlt}
              onClick={() => { if (fotoLesung) artikelLernen(gewaehlt.id, fotoLesung).catch(() => {});
                vorgabe.waehlen(gewaehlt); }}>Übernehmen</button>
          : <button className="knopf knopf--haupt" id="pd-ja" disabled={!gewaehlt || speichert} onClick={hinzufuegen}>
              Hinzufügen</button>}
      </div>
    </div>
  );
}
