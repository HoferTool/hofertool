// =================================================================
//  BESTELLUNGEN · Fenster „Neue Bestellposition“
//  Artikel suchen (oder neu anlegen), Menge, Frist, wohin die Lieferung
//  soll, Notiz. Das Anlegen eines neuen Artikels ist eine Folge von
//  Fenstern (Nummer, Bezeichnung, Lieferant) und bleibt im alten
//  Programm (artikelSchnellAnlegen), weil auch das Einrichtblatt es
//  braucht.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";

// fertig: wird nach dem Speichern aufgerufen, damit die Liste neu lädt
export function positionOeffnen(fertig) {
  fensterOeffnen((zu) => <PositionFenster zu={zu} fertig={fertig} />);
}

const ZIELE = [["lager", "Lager"], ["maschine", "Maschine"], ["person", "Person"], ["andere", "Anderes"]];

function PositionFenster({ zu, fertig }) {
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState(null);     // null: noch nichts gesucht
  const [sucht, setSucht] = useState(false);
  const [suchFehler, setSuchFehler] = useState(null);
  const [gewaehlt, setGewaehlt] = useState(null);
  const [menge, setMenge] = useState("1");
  const [frist, setFrist] = useState("");
  const [notiz, setNotiz] = useState("");
  // Lager ist der Normalfall und deshalb vorgewählt. Es wird nicht
  // verbucht, sondern steht wie jedes andere Ziel in der Historie.
  const [zielArt, setZielArt] = useState("lager");
  const [zielWahl, setZielWahl] = useState("");
  const [zielFrei, setZielFrei] = useState("");
  const [maschinen, setMaschinen] = useState(
    (alt.best.alleMaschinen && alt.best.alleMaschinen.length) ? alt.best.alleMaschinen : null);
  const [personen, setPersonen] = useState(null);
  const [speichert, setSpeichert] = useState(false);
  const taste = useRef(null);
  const mengeFeld = useRef(null);
  const freiFeld = useRef(null);
  const suchNr = useRef(0);

  useEffect(() => () => clearTimeout(taste.current), []);

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

  const neuAnlegen = async () => {
    const a = await alt.artikelSchnellAnlegen(suche.trim());
    if (a) waehlen(a);
  };

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
    const { error } = await alt.db.from("order_items").insert({
      article_id: gewaehlt.id,
      supplier_id: gewaehlt.supplier_id || null,
      quantity: m,
      needed_by: frist || null,
      note: notiz.trim() || null,
      ziel_art: zielArt,
      ziel_text: zielText,
    });
    setSpeichert(false);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    zu();
    alt.meldung("Position hinzugefügt.");
    if (fertig) fertig();
  };

  const schreiben = alt.darfSchreiben();

  return (
    <div className="dialog"><h2>Neue Bestellposition</h2>
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
      <div id="pd-treffer" className="pd-treffer">
        {sucht && !treffer && <div className="laedt">Wird gesucht …</div>}
        {suchFehler && <p className="hinweis">{suchFehler}</p>}
        {treffer && <>
          {treffer.length
            ? treffer.slice(0, 8).map((a) => (
                <button key={a.id} className="pd-zeile" data-w={a.id} onClick={() => waehlen(a)}>
                  <strong>{a.article_number}</strong> {a.name}
                  <span className="klein"> {a.supplier_name || "ohne Lieferant"}</span></button>
              ))
            : <p className="hinweis">Kein Artikel gefunden.</p>}
          {schreiben && suche.trim() &&
            <button className="pd-zeile pd-zeile--neu" data-neuartikel="" onClick={neuAnlegen}>
              + Artikel "{suche.trim()}" neu anlegen</button>}
        </>}
      </div>

      {gewaehlt && <div id="pd-rest">
        <div className="pd-gewaehlt" id="pd-gewaehlt">
          <strong>{gewaehlt.article_number}</strong> {gewaehlt.name}
          <div className="klein">Lieferant: {gewaehlt.supplier_name || "keiner hinterlegt"}
            {gewaehlt.gesamtbestand !== undefined && <> · Bestand {alt.zahlText(gewaehlt.gesamtbestand)}</>}</div>
        </div>
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
        <label className="feld"><span>Notiz</span>
          <textarea id="pd-notiz" rows="2" value={notiz} onChange={(e) => setNotiz(e.target.value)} /></label>
      </div>}

      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" id="pd-nein" data-nein="" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" id="pd-ja" disabled={!gewaehlt || speichert} onClick={hinzufuegen}>
          Hinzufügen</button>
      </div>
    </div>
  );
}
