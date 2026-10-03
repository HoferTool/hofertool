// =================================================================
//  BETRACHTER
//  Zeigt ein PDF oder ein Bild in der App an, ohne Herunterladen:
//  Zeichnung, WBG, Einrichtblatt, Fotos. PDFs zeichnet PdfAnsicht
//  selbst und passt sie in die ganze Fläche ein; nur wenn das nicht
//  geht, kommt die Anzeige des Browsers.
//  Drucken, Speichern, in neuem Tab öffnen, Schliessen.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { PdfAnsicht } from "./PdfAnsicht.jsx";

export function betrachter(adresse, titel, istPdf) {
  fensterOeffnen((zu) => <Betrachter adresse={adresse} titel={titel} istPdf={istPdf} zu={zu} />, null, "betrachter-huelle");
}

function Betrachter({ adresse, titel, istPdf, zu }) {
  const rahmen = useRef(null);
  // PDF: einmal holen. „bereit“ = selbst zeichnen, „browser“ = die
  // Anzeige des Browsers als Rückfall.
  const [pdf, setPdf] = useState({ art: "laden" });
  useEffect(() => {
    if (!istPdf) return;
    let weg = false;
    fetch(adresse)
      .then((a) => { if (!a.ok) throw new Error("nicht erreichbar"); return a.blob(); })
      .then(async (blob) => {
        const daten = new Uint8Array(await blob.arrayBuffer());
        if (!weg) setPdf({ art: "bereit", blob, daten });
      })
      .catch(() => { if (!weg) setPdf({ art: "browser" }); });
    return () => { weg = true; };
  }, [adresse, istPdf]);

  // Drucken: bei einem PDF über ein unsichtbares Fenster mit der schon
  // geladenen Datei (gleiche Herkunft, also erlaubt). Sonst über das
  // eingebettete Fenster, und geht beides nicht, bleibt der neue Tab.
  const drucken = () => {
    if (istPdf) {
      if (pdf.blob) {
        const url = URL.createObjectURL(pdf.blob);
        const f = document.createElement("iframe");
        f.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;border:0;left:-10px;top:-10px";
        f.src = url;
        f.onload = () => {
          try { f.contentWindow.focus(); f.contentWindow.print(); }
          catch (e) { window.open(url, "_blank"); }
          setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 60000);
        };
        document.body.appendChild(f);
        return;
      }
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
      let blob = pdf.blob;
      if (!blob) {
        const antwort = await fetch(adresse);
        if (!antwort.ok) throw new Error("nicht erreichbar");
        blob = await antwort.blob();
      }
      const url = URL.createObjectURL(blob);
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
      <div className={"betrachter__buehne" + (istPdf && pdf.art !== "browser" ? " betrachter__buehne--pdf" : "")}>
        {istPdf && pdf.art === "laden" && <div className="pdfansicht__laden">PDF wird geladen …</div>}
        {istPdf && pdf.art === "bereit" &&
          <PdfAnsicht daten={pdf.daten} beiFehler={() => setPdf({ art: "browser" })} />}
        {istPdf
          ? pdf.art === "browser" && <>
              <iframe ref={rahmen} src={alt.pdfGanz(adresse)} title="Zeichnung" />
              {alt.isMobil() && <p className="betrachter__hinweis">Wird nichts angezeigt, öffne die Datei über
                "Neuer Tab". Manche Handys zeigen PDFs nicht direkt in der App an.</p>}
            </>
          : <img src={adresse} alt="Foto" />}
      </div>
    </div>
  );
}
