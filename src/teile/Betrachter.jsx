// =================================================================
//  BETRACHTER
//  Zeigt ein PDF oder ein Bild in der App an, ohne Herunterladen:
//  Zeichnung, WBG, Einrichtblatt, Fotos. PDFs füllen die Breite.
//  Drucken, Speichern, in neuem Tab öffnen, Schliessen.
// =================================================================
import { useRef } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";

export function betrachter(adresse, titel, istPdf) {
  fensterOeffnen((zu) => <Betrachter adresse={adresse} titel={titel} istPdf={istPdf} zu={zu} />, null, "betrachter-huelle");
}

function Betrachter({ adresse, titel, istPdf, zu }) {
  const rahmen = useRef(null);

  // Drucken: bei einem PDF über das eingebettete Fenster. Liegt die
  // Datei auf einem anderen Server, verweigert der Browser den Zugriff
  // darauf; dann bleibt der neue Tab als Weg.
  const drucken = () => {
    if (istPdf) {
      try {
        rahmen.current.contentWindow.focus();
        rahmen.current.contentWindow.print();
        return;
      } catch (f) { /* andere Herkunft, also über den Umweg */ }
      const w = window.open(adresse, "_blank");
      if (!w) alt.meldung("Zum Drucken bitte über \"Neuer Tab\" öffnen.", "warn");
      return;
    }
    // Bild: in einem eigenen Fenster, sonst würde die ganze App
    // mitgedruckt
    const w = window.open("", "_blank");
    if (!w) { alt.meldung("Das Fenster wurde blockiert.", "warn"); return; }
    const esc = alt.esc;
    w.document.write('<!doctype html><html><head><meta charset="utf-8">'
      + "<title>" + esc(titel || "Bild") + "</title>"
      + "<style>@page{margin:10mm}body{margin:0}img{max-width:100%;height:auto;display:block}</style></head><body>"
      + '<img src="' + esc(adresse) + '" onload="window.print()"></body></html>');
    w.document.close();
  };

  // Speichern: erst versuchen, die Datei wirklich herunterzuladen.
  // Klappt das wegen der Herkunft nicht, öffnet sie sich stattdessen.
  const speichern = async () => {
    const name = (titel || "Datei").replace(/[^A-Za-z0-9._-]+/g, "_") + (istPdf ? ".pdf" : ".jpg");
    const laden = (href, extra) => {
      const a = document.createElement("a");
      a.href = href; a.download = name;
      Object.assign(a, extra || {});
      document.body.appendChild(a); a.click(); a.remove();
    };
    try {
      const antwort = await fetch(adresse);
      if (!antwort.ok) throw new Error("nicht erreichbar");
      const url = URL.createObjectURL(await antwort.blob());
      laden(url);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (f) {
      laden(adresse, { target: "_blank", rel: "noopener" });
    }
  };

  return (
    <div className="betrachter">
      <div className="betrachter__kopf">
        <span className="betrachter__titel">{titel || ""}</span>
        <div className="betrachter__knoepfe">
          <button className="knopf knopf--klein" data-drucken="" onClick={drucken}>Drucken</button>
          <button className="knopf knopf--klein" data-speichern="" onClick={speichern}>Speichern</button>
          <a className="knopf knopf--klein" href={adresse} target="_blank" rel="noopener">Neuer Tab</a>
          <button className="knopf knopf--klein" data-zu="" onClick={zu}>Schliessen</button>
        </div>
      </div>
      <div className="betrachter__buehne">
        {istPdf
          ? <>
              <iframe ref={rahmen} src={alt.pdfGanz(adresse)} title="Zeichnung" />
              {alt.isMobil() && <p className="betrachter__hinweis">Wird nichts angezeigt, öffne die Datei über
                "Neuer Tab". Manche Handys zeigen PDFs nicht direkt in der App an.</p>}
            </>
          : <img src={adresse} alt="Foto" />}
      </div>
    </div>
  );
}
