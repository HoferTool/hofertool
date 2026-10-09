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
import { inDerAppDrucken, pdfSeitenAlsBilder, perTeilenDrucken } from "./drucken.js";
import { ExcelAnsicht, excelDrucken } from "./ExcelAnsicht.jsx";
import { istExcel } from "./excelLesen.js";
import { usePfad, pfadKopieren } from "../daten/zeichnungPfad.jsx";
import { wiederOeffner } from "./wiederherstellen.js";
import { poolDruckLaden, poolDruckerName, poolKannExcel, poolDrucken, pdfSeitenAlsJpg } from "./poolDruck.js";

// „art“ nur, wenn die Adresse nichts verrät (Datei vom Gerät): "pdf",
// "excel" oder "bild". Sonst entscheidet die Endung, und Excel gewinnt
// auch dort, wo ein Aufrufer „PDF“ annimmt (Einrichtblatt, Dokumente).
export function betrachter(adresse, titel, istPdf, art, endung) {
  art = art || (istExcel(adresse) ? "excel" : istPdf ? "pdf" : "bild");
  // Nach dem Neuladen wieder offen, ausser bei einer Datei vom Gerät:
  // deren Adresse gilt nur, solange die Seite steht
  const merken = /^(blob|data):/.test(String(adresse)) ? null
    : { art: "betrachter", daten: { adresse, titel, art, endung } };
  fensterOeffnen((zu) => <Betrachter adresse={adresse} titel={titel} art={art} endung={endung} zu={zu} />,
    null, "betrachter-huelle", merken);
}
wiederOeffner("betrachter", (d) => betrachter(d.adresse, d.titel, d.art === "pdf", d.art, d.endung));

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
  // Zeichnung vom Laufwerk des Pool-Rechners: „Pfad“ statt „Neuer Tab“
  const pfad = usePfad(adresse);
  const rahmen = useRef(null);
  const wurzel = useRef(null);
  const bild = useRef(null);
  // PDF: einmal holen. „bereit“ = selbst zeichnen, „browser“ = die
  // Anzeige des Browsers als Rückfall. Excel: „fehler“, wenn sie sich
  // nicht lesen lässt.
  const [pdf, setPdf] = useState({ art: "laden" });
  // Ein Bild wird vom Browser selbst gezeigt; geholt wird es trotzdem,
  // damit „Drucken“ auf dem iPad die Datei sofort ins Teilen-Fenster
  // geben kann.
  useEffect(() => {
    let weg = false;
    fetch(adresse)
      .then((a) => { if (!a.ok) throw new Error("nicht erreichbar"); return a.blob(); })
      .then(async (blob) => {
        const daten = (istPdf || istXl) ? new Uint8Array(await blob.arrayBuffer()) : null;
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
  const dateiName = () => (titel || "Datei").replace(/[^A-Za-z0-9._-]+/g, "_") + "."
    + (endung || (String(adresse).split(/[?#]/)[0].match(/\.([A-Za-z0-9]{2,5})$/) || [])[1]
       || (istPdf ? "pdf" : istXl ? "xlsx" : "jpg")).toLowerCase();
  // Drucken über den Pool-Rechner (src/teile/poolDruck.js): Ist unter
  // Einstellungen → Dokumente ein Drucker gewählt, fragt „Drucken“ erst,
  // wohin. iPad und Handy am WLAN Hofer&Co erreichen den Sharp im
  // Firmennetz nicht, der Pool-Rechner schon (Wunsch Patrick, 9. Oktober 2026).
  const [pool, setPool] = useState(null);      // { drucker, excel } oder null
  const [wahl, setWahl] = useState(false);     // Auswahl offen?
  // Der Knopf heisst nur „Planbüro“: der volle Name des Druckers
  // (\\hof-chso-fs01\SHARP … Planbüro) machte die Auswahl so breit, dass
  // sie im Pad über den Rand ragte. Kopien stehen bei jedem Öffnen der
  // Auswahl wieder auf 1, mehr nur, wenn man hochzählt (Wunsch Patrick,
  // 9. Oktober 2026).
  const [kopien, setKopien] = useState(1);
  useEffect(() => {
    let weg = false;
    poolDruckLaden().then((k) => {
      if (!weg) setPool(poolDruckerName(k) ? { drucker: poolDruckerName(k), excel: poolKannExcel(k) } : null);
    });
    return () => { weg = true; };
  }, []);
  // Tipp daneben schliesst die Auswahl
  useEffect(() => {
    if (!wahl) return undefined;
    const weg = (e) => { if (!e.target.closest(".druckwahl-huelle")) setWahl(false); };
    document.addEventListener("pointerdown", weg, true);
    return () => document.removeEventListener("pointerdown", weg, true);
  }, [wahl]);
  // Excel druckt der Pool-Rechner aus der Datei selbst, die muss also
  // in der Ablage liegen (nicht eine Datei nur auf diesem Gerät)
  const poolGeht = !!pool && (istXl ? pool.excel && /^https?:/i.test(adresse) : true);
  const knopfDrucken = () => {
    if (druckt) return;
    if (poolGeht) { if (!wahl) setKopien(1); setWahl((w) => !w); return; }
    drucken();
  };
  const anPool = async () => {
    setWahl(false);
    if (pdf.art === "laden") { alt.meldung("Die Datei ist noch nicht geladen.", "warn"); return; }
    setDruckt(true);
    try {
      if (istXl) {
        const reiter = wurzel.current && wurzel.current.querySelector("[data-blattreiter][aria-selected='true']");
        await poolDrucken({ art: "excel", quelle: adresse, blatt: reiter ? reiter.textContent : null, titel, kopien });
      } else if (istPdf) {
        if (!pdf.daten) throw new Error("Die PDF liess sich nicht laden.");
        const seiten = await pdfSeitenAlsJpg(await pdfjs(), pdf.daten);
        await poolDrucken({ art: "bilder", bilder: seiten.map((x) => x.blob), titel, kopien });
      } else {
        if (!pdf.blob) throw new Error("Das Bild liess sich nicht laden.");
        await poolDrucken({ art: "bilder", bilder: [pdf.blob], titel, kopien });
      }
    } catch (f) {
      alt.meldung("Drucken ging nicht: " + alt.fehlertext(f), "fehler");
    } finally { setDruckt(false); }
  };

  const drucken = async () => {
    setWahl(false);
    if (druckt) return;
    // iPad und iPhone: window.print() öffnet dort in der App auf dem
    // Startbildschirm nichts. Die Datei geht ins Teilen-Fenster, dort
    // tippt man „Drucken“ (Patrick, 9. Oktober 2026). Ohne Warten, sonst
    // gilt der Tipp nicht mehr als Berührung.
    if (pdf.blob && perTeilenDrucken(pdf.blob, dateiName(), titel)) return;
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
    const name = dateiName();
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
          <span className="druckwahl-huelle">
            <button className="knopf knopf--klein" data-drucken="" onClick={knopfDrucken} disabled={druckt}
              aria-expanded={poolGeht ? wahl : undefined}>{druckt ? "Druckt …" : "Drucken"}</button>
            {wahl && <div className="druckwahl" data-druckwahl="" role="menu">
              <button className="knopf knopf--haupt" data-pooldruck="" onClick={anPool}>Planbüro</button>
              <div className="druckwahl__kopien">
                <span>Kopien</span>
                <button className="knopf knopf--klein" aria-label="Weniger" data-kopienweniger=""
                  onClick={() => setKopien((n) => Math.max(1, n - 1))} disabled={kopien <= 1}>−</button>
                <b data-kopien="">{kopien}</b>
                <button className="knopf knopf--klein" aria-label="Mehr" data-kopienmehr=""
                  onClick={() => setKopien((n) => Math.min(20, n + 1))} disabled={kopien >= 20}>+</button>
              </div>
              <button className="knopf" data-geraetdruck="" onClick={drucken}>Auf diesem Gerät drucken</button>
            </div>}
          </span>
          <button className="knopf knopf--klein" data-speichern="" onClick={speichern}>Speichern</button>
          {pfad
            ? <button className="knopf knopf--klein" data-pfad="" title={pfad} onClick={() => pfadKopieren(pfad)}>Pfad</button>
            : <a className="knopf knopf--klein" href={adresse} target="_blank" rel="noopener">Neuer Tab</a>}
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
