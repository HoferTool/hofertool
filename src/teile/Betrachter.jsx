// =================================================================
//  BETRACHTER
//  Zeigt ein PDF oder ein Bild in der App an, ohne Herunterladen:
//  Zeichnung, WBG, Einrichtblatt, Fotos. PDFs zeichnet PdfAnsicht
//  selbst und passt sie in die ganze Fläche ein; nur wenn das nicht
//  geht, kommt die Anzeige des Browsers. Excel-Dateien (.xlsx, .xls)
//  zeichnet ExcelAnsicht, erkannt an der Endung der Adresse.
//  Drucken, Speichern, in neuem Tab öffnen, Schliessen.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { PdfAnsicht } from "./PdfAnsicht.jsx";
import { ExcelAnsicht, excelDrucken } from "./ExcelAnsicht.jsx";
import { istExcel } from "./excelLesen.js";

// „art“ nur, wenn die Adresse nichts verrät (Datei vom Gerät): "pdf",
// "excel" oder "bild". Sonst entscheidet die Endung, und Excel gewinnt
// auch dort, wo ein Aufrufer „PDF“ annimmt (Einrichtblatt, Dokumente).
export function betrachter(adresse, titel, istPdf, art, endung) {
  art = art || (istExcel(adresse) ? "excel" : istPdf ? "pdf" : "bild");
  fensterOeffnen((zu) => <Betrachter adresse={adresse} titel={titel} art={art} endung={endung} zu={zu} />,
    null, "betrachter-huelle");
}

// Eine Datei vom Gerät ansehen, ohne sie hochzuladen
export function dateiAnsehen(datei) {
  if (!datei) return;
  const name = datei.name || "Datei";
  const art = istExcel(name) ? "excel" : /\.pdf$/i.test(name) || datei.type === "application/pdf" ? "pdf" : "bild";
  const endung = (name.match(/\.([A-Za-z0-9]+)$/) || [])[1];
  betrachter(URL.createObjectURL(datei), name.replace(/\.[^.]+$/, ""), art === "pdf", art, endung);
}

// Auch für dokZeigen (DokAbruf.jsx): „hinweis“ steht klein neben dem Titel
// knoepfe: weitere Knöpfe im Kopf, vor „Schliessen“ (etwa „Zeichnung entfernen“)
export function Betrachter({ adresse, titel, art, endung, zu, hinweis, knoepfe }) {
  const istPdf = art === "pdf", istXl = art === "excel";
  const rahmen = useRef(null);
  const wurzel = useRef(null);
  // PDF: einmal holen. „bereit“ = selbst zeichnen, „browser“ = die
  // Anzeige des Browsers als Rückfall. Excel: „fehler“, wenn sie sich
  // nicht lesen lässt.
  const [pdf, setPdf] = useState({ art: "laden" });
  useEffect(() => {
    if (!istPdf && !istXl) return;
    let weg = false;
    fetch(adresse)
      .then((a) => { if (!a.ok) throw new Error("nicht erreichbar"); return a.blob(); })
      .then(async (blob) => {
        const daten = new Uint8Array(await blob.arrayBuffer());
        if (!weg) setPdf({ art: "bereit", blob, daten });
      })
      .catch(() => { if (!weg) setPdf({ art: istXl ? "fehler" : "browser" }); });
    return () => { weg = true; };
  }, [adresse, art]);

  // Drucken: bei einem PDF über ein unsichtbares Fenster mit der schon
  // geladenen Datei (gleiche Herkunft, also erlaubt). Sonst über das
  // eingebettete Fenster, und geht beides nicht, bleibt der neue Tab.
  const drucken = () => {
    if (istXl) {
      if (!excelDrucken(wurzel.current, titel, alt.meldung)) alt.meldung("Die Datei ist noch nicht geladen.", "warn");
      return;
    }
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
    const e = endung || (String(adresse).split(/[?#]/)[0].match(/\.([A-Za-z0-9]{2,5})$/) || [])[1]
      || (istPdf ? "pdf" : istXl ? "xlsx" : "jpg");
    const name = (titel || "Datei").replace(/[^A-Za-z0-9._-]+/g, "_") + "." + e.toLowerCase();
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
    <div className="betrachter" ref={wurzel}>
      <div className="betrachter__kopf">
        <span className="betrachter__titel">{titel || ""}</span>
        {hinweis && <span className="betrachter__abruf" data-abrufhinweis="">{hinweis}</span>}
        <div className="betrachter__knoepfe">
          <button className="knopf knopf--klein" data-drucken="" onClick={drucken}>Drucken</button>
          <button className="knopf knopf--klein" data-speichern="" onClick={speichern}>Speichern</button>
          <a className="knopf knopf--klein" href={adresse} target="_blank" rel="noopener">Neuer Tab</a>
          {knoepfe || null}
          <button className="knopf knopf--klein" data-zu="" onClick={zu}>Schliessen</button>
        </div>
      </div>
      <div className={"betrachter__buehne" + ((istPdf && pdf.art !== "browser") || istXl ? " betrachter__buehne--pdf" : "")}>
        {istXl && pdf.art === "laden" && <div className="pdfansicht__laden">Excel wird geladen …</div>}
        {istXl && pdf.art === "bereit" &&
          <ExcelAnsicht daten={pdf.daten} beiFehler={() => setPdf({ art: "fehler" })} />}
        {istXl && pdf.art === "fehler" && <div className="pdfansicht__laden excelansicht__fehler">
          Diese Excel-Datei lässt sich hier nicht anzeigen. Über „Speichern“ kann man sie herunterladen
          und in Excel öffnen.</div>}
        {istPdf && pdf.art === "laden" && <div className="pdfansicht__laden">PDF wird geladen …</div>}
        {istPdf && pdf.art === "bereit" &&
          <PdfAnsicht daten={pdf.daten} beiFehler={() => setPdf({ art: "browser" })} />}
        {istXl ? null : istPdf
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
