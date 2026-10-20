// =================================================================
//  BESTELLUNGEN · Verpackung eines Artikels lernen (seit 1.109.0)
//  Wunsch Patrick 19. Oktober 2026: „werde später von den Herstellern
//  mehrere Verpackungen hochladen zum Lernen“. Hier fotografiert man
//  die Verpackung eines Artikels, auch mehrmals. Die App merkt sich,
//  was darauf steht, und findet den Artikel beim nächsten Foto unter
//  „Neue Bestellposition“ (src/daten/artikelFoto.js).
// =================================================================
import { useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { betrachter } from "../../teile/Betrachter.jsx";
import { artikelFotoLesen, artikelLernen, artikelFotoWeg } from "../../daten/artikelFoto.js";

export function artikelFotosOeffnen(a, fertig) {
  fensterOeffnen((zu) => <ArtikelFotos a={a} zu={zu} />, fertig);
}

function ArtikelFotos({ a, zu }) {
  const [bilder, setBilder] = useState(null);
  const [stand, setStand] = useState(null);
  const [gelesen, setGelesen] = useState(null);
  const feld = useRef(null);
  const geladen = useRef(false);

  const laden = async () => {
    const r = await alt.db.from("articles").select("foto_bilder, foto_merkmale").eq("id", a.id).maybeSingle();
    if (r.error) { setStand({ fehler: alt.fehlertext(r.error) }); setBilder([]); return; }
    setBilder((r.data && r.data.foto_bilder) || []);
  };
  if (!geladen.current) { geladen.current = true; laden(); }

  const gewaehlt = async (e) => {
    const dateien = [...(e.target.files || [])];
    e.target.value = "";
    let nr = 0;
    for (const datei of dateien) {
      nr++;
      const vor = dateien.length > 1 ? "Foto " + nr + " von " + dateien.length + ": " : "";
      setStand({ text: vor + "Texterkennung wird geladen …" });
      try {
        const lesung = await artikelFotoLesen(datei, (status, anteil) => {
          if (/recogniz/.test(status || "")) setStand({ text: vor + "wird gelesen … " + Math.round(anteil * 100) + " %" });
        });
        const ok = await artikelLernen(a.id, lesung);
        if (!ok) throw new Error("Speichern ging nicht. Ist sql/artikel-foto.sql eingespielt?");
        setGelesen(lesung);
      } catch (f) {
        setStand({ fehler: alt.fehlertext(f) });
        await laden();
        return;
      }
    }
    setStand(null);
    await laden();
    alt.meldung(dateien.length > 1 ? dateien.length + " Fotos gelernt." : "Foto gelernt.", "gut");
  };

  const weg = async (b) => {
    const ok = await alt.nachfragen({ titel: "Foto löschen", text: "Dieses Beispielfoto wird gelöscht.",
      bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    try {
      // Mit dem letzten Foto geht auch das Gelernte weg
      setBilder(await artikelFotoWeg(a.id, b, bilder.length <= 1));
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  return (
    <div className="dialog af-dialog" role="dialog" aria-modal="true">
      <h2>Verpackung lernen</h2>
      <p className="dialog__text"><strong>{a.article_number}</strong> {a.name}
        {a.supplier_name ? " · " + a.supplier_name : ""}</p>
      <p className="klein">Fotografiere die Verpackung so, dass Nummern und Codes gut lesbar sind.
        Mehrere Fotos helfen, etwa von verschiedenen Seiten. Danach erkennt die App den Artikel
        beim Foto unter „Neue Bestellposition“.</p>
      <input ref={feld} type="file" accept="image/*" multiple hidden id="af-datei" onChange={gewaehlt} />
      <button type="button" className="knopf knopf--haupt" id="af-knopf" disabled={!!(stand && stand.text)}
        onClick={() => feld.current && feld.current.click()}>📷 Foto hinzufügen</button>
      {stand && stand.text && <p className="klein" id="af-stand">{stand.text}</p>}
      {stand && stand.fehler && <p className="klein mat-foto__fehler">{stand.fehler}</p>}
      {gelesen && <details className="af-gelesen"><summary className="klein">Gelesen auf dem letzten Foto</summary>
        <pre className="mat-foto__text">{gelesen.text}</pre></details>}
      <div className="af-bilder" id="af-bilder">
        {bilder === null ? <div className="laedt">Wird geladen …</div>
          : !bilder.length ? <p className="hinweis">Noch keine Fotos.</p>
          : bilder.map((b) => (
              <div key={b.pfad} className="af-bild">
                <button type="button" className="af-bild__knopf" onClick={() => betrachter(b.url, a.article_number, false)}>
                  <img src={b.url} alt="" loading="lazy" /></button>
                <span className="klein">{b.am ? alt.kurzDatum(b.am.slice(0, 10)) : ""}</span>
                <button type="button" className="knopf knopf--klein knopf--still" data-afweg={b.pfad}
                  onClick={() => weg(b)}>Löschen</button>
              </div>
            ))}
      </div>
      <div className="dialog__knoepfe">
        <button className="knopf" id="af-zu" onClick={zu}>Schliessen</button>
      </div>
    </div>
  );
}
