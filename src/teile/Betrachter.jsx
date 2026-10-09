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
import { PdfAnsicht, pdfjs } from "./PdfAnsicht.jsx";
import { inDerAppDrucken, pdfSeitenAlsBilder } from "./drucken.js";
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
  const bild = useRef(null);
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

  // Drucken direkt aus der App (src/teile/drucken.js): Die PDF wird
  // Seite für Seite als Bild gezeichnet, ein Foto kommt als Bild, das
  // Excel-Blatt als Kopie. Vorher lief das über ein unsichtbares Fenster
  // oder einen verborgenen Rahmen; Safari auf dem iPad druckt beides
  // nicht, der Knopf tat dort nichts (Patrick, 9. Oktober 2026). Nur
  // wenn die PDF nicht selbst geladen werden konnte (Anzeige des
  // Browsers), bleibt der alte Weg über den Rahmen und den neuen Tab.
  const [druckt, setDruckt] = useState(false);
  const drucken = async () => {
    if (druckt) return;
    if (istXl) {
      if (!excelDrucken(wurzel.current, titel)) alt.meldung("Die Datei ist noch nicht geladen.", "warn");
      return;
    }
    if (istPdf) {
      if (pdf.art === "laden") { alt.meldung("Die Datei ist noch nicht geladen.", "warn"); return; }
      if (pdf.daten) {
        setDruckt(true);
        try {
          const bilder = await pdfSeitenAlsBilder(await pdfjs(), pdf.daten);
          const erste = bilder[0];
          inDerAppDrucken(bilder, { quer: !!erste && erste.classList.contains("druckdatei__seite--quer"), titel });
        } catch (f) {
          alt.meldung("Drucken ging nicht: " + alt.fehlertext(f), "fehler");
        } finally { setDruckt(false); }
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
    // Bild: als Seite, so gross wie das Papier erlaubt
    const img = document.createElement("img");
    img.src = adresse; img.alt = titel || "Bild";
    img.className = "druckdatei__seite";
    const quer = !!(bild.current && bild.current.naturalWidth > bild.current.naturalHeight);
    inDerAppDrucken([img], { quer, titel, rand: "10mm" });
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
          <button className="knopf knopf--klein" data-drucken="" onClick={drucken} disabled={druckt}>{druckt ? "Druckt …" : "Drucken"}</button>
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
          : <img ref={bild} src={adresse} alt="Foto" />}
      </div>
    </div>
  );
}
