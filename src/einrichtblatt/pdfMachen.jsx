// =================================================================
//  EINRICHTBLATT ALS PDF
//  Zeichnet ein Blatt aus der App unsichtbar neben dem Bildschirm, genau
//  wie im Fenster, und macht daraus ein PDF: Seite 1 das Werkzeugblatt
//  (A4 quer), danach die weiteren Seiten hoch oder quer. Für die
//  Sicherung als PDF (src/teile/ebPdf.js). Eigenes Stück, damit die
//  Bibliotheken nur auf dem Sicherungsgerät geladen werden.
// =================================================================
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { BlattSeite, ZusatzSeite, seitenMass } from "./Blatt.jsx";
import { blattLaden } from "./daten.js";
import { istPdfSeite, pdfDaten } from "./PdfSeiten.jsx";
import { pdfjs } from "../teile/PdfAnsicht.jsx";

// Ein PDF als Seite des Blatts (seit 1.429.0): jede seiner Seiten als
// Canvas, 150 Punkte je Zoll wie beim Drucken
async function pdfSeitenZeichnen(url, jede) {
  const [lib, daten] = await Promise.all([pdfjs(), pdfDaten(url)]);
  const aufgabe = lib.getDocument({ data: daten.slice(), isEvalSupported: false });
  try {
    const doc = await aufgabe.promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const v = p.getViewport({ scale: 150 / 72 });
      const c = document.createElement("canvas");
      c.width = Math.floor(v.width); c.height = Math.floor(v.height);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: ctx, viewport: v, canvas: c, intent: "print" }).promise;
      await jede(c, v.width > v.height);
    }
  } finally { aufgabe.destroy(); }
}

// Bilder fertig laden, sonst fehlen sie im PDF; höchstens 8 Sekunden
function bilderFertig(el) {
  const bilder = [...el.querySelectorAll("img")].filter((b) => !b.complete);
  if (!bilder.length) return Promise.resolve();
  return Promise.race([
    Promise.all(bilder.map((b) => new Promise((ok) => { b.onload = ok; b.onerror = ok; }))),
    new Promise((ok) => setTimeout(ok, 8000)),
  ]);
}

// Stile in der Kopie sicher laden (1.452.1, Patrick 9. November 2026:
// vom iPad „Im Büro drucken“ kam das Blatt ohne jede Gestaltung aus dem
// Drucker, Times-Schrift, Farbbalken über die ganze Seite). html2canvas
// zeichnet eine Kopie der Seite in einem Rahmen; die Stildatei hängt es
// dort erst nach dem Schliessen des Rahmens ein, Safari meldet ihn aber
// sofort als fertig und zeichnet, bevor die Stile da sind. Darum hier
// jede Stildatei durch ihren Text ersetzen (Adressen wie die Schriften
// auf die Stildatei bezogen), so gilt sie sofort, ohne Laden.
function stileAlsText() {
  const map = new Map();
  for (const s of document.styleSheets) {
    if (!s.href) continue;
    try {
      const text = [...s.cssRules].map((r) => r.cssText).join("\n")
        .replace(/url\((["']?)([^"')]+)\1\)/g, (ganz, q, adr) => {
          if (/^(data:|blob:|#)/.test(adr)) return ganz;
          try { return "url(" + q + new URL(adr, s.href).href + q + ")"; } catch (f) { return ganz; }
        });
      map.set(s.href, text);
    } catch (f) { /* fremde Stildatei: bleibt verlinkt */ }
  }
  return map;
}
async function stileInKopie(doc, stile) {
  const warten = [];
  for (const l of doc.querySelectorAll('link[rel~="stylesheet"]')) {
    const text = stile.get(l.href);
    if (text != null) {
      const st = doc.createElement("style");
      st.textContent = text;
      l.replaceWith(st);
    } else if (!l.sheet) {
      warten.push(Promise.race([new Promise((ok) => { l.addEventListener("load", ok); l.addEventListener("error", ok); }),
        new Promise((ok) => setTimeout(ok, 5000))]));
    }
  }
  await Promise.all(warten);
  try { await doc.fonts.ready; } catch (f) { /* dann mit dem, was da ist */ }
}

// Zeichnet Seiten eines Blatts unsichtbar und gibt sie je als Canvas an
// „jede“ weiter. nur: undefined = alle Seiten, 0 = Werkzeugblatt,
// 1, 2 … = die weiteren Seiten.
async function seitenZeichnen(daten, { auftrag, nur } = {}, jede) {
  const seiten = Array.isArray(daten.blatt.seiten) ? daten.blatt.seiten : [];
  const huelle = document.createElement("div");
  huelle.className = "eb-pdf-buehne";
  huelle.setAttribute("aria-hidden", "true");
  // Neben dem Bildschirm, aber gezeichnet (display: none würde nichts messen)
  huelle.style.cssText = "position:fixed;left:-30000px;top:0;width:1200px;pointer-events:none;background:#fff;color:#000";
  document.body.appendChild(huelle);
  const wurzel = createRoot(huelle);
  const mit = (i) => nur === undefined || nur === i;
  try {
    flushSync(() => wurzel.render(
      <div>
        {mit(0) && <div data-pdf-seite="" data-quer="1" style={{ width: 1123, height: 794, overflow: "hidden", background: "#fff" }}>
          <BlattSeite typ={daten.typ} paths={daten.paths} teil={daten.teil} typDaten={daten.typDaten} blatt={daten.blatt}
            auftrag={auftrag} artikelBilder={daten.artikelBilder || {}} />
        </div>}
        {seiten.map((s, i) => {
          if (!mit(i + 1)) return null;
          if (istPdfSeite(s)) return <div key={i} data-pdf-seite="" data-pdf-url={s.url} />;
          const [w, h] = seitenMass(s);
          return <div key={i} data-pdf-seite="" data-quer={s.quer ? "1" : ""} style={{ width: w, height: h, overflow: "hidden", background: "#fff" }}>
            <ZusatzSeite seite={s} />
          </div>;
        })}
      </div>));
    await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 50)));
    try { await document.fonts.ready; } catch (f) { /* dann mit dem, was da ist */ }
    await bilderFertig(huelle);
    const stile = stileAlsText();
    for (const el of huelle.querySelectorAll("[data-pdf-seite]")) {
      if (el.dataset.pdfUrl) { await pdfSeitenZeichnen(el.dataset.pdfUrl, jede); continue; }
      const bild = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
        onclone: (doc) => stileInKopie(doc, stile) });
      await jede(bild, !!el.dataset.quer);
    }
  } finally {
    wurzel.unmount();
    huelle.remove();
  }
}

export async function blattPdf(hocoNr, typId) {
  const daten = await blattLaden(hocoNr, typId);
  if (!daten.blatt) throw new Error("Kein Einrichtblatt in der App");
  let pdf = null;
  await seitenZeichnen(daten, {}, (bild, quer) => {
    const [w, h] = quer ? [297, 210] : [210, 297];
    if (!pdf) pdf = new jsPDF({ unit: "mm", format: "a4", orientation: quer ? "landscape" : "portrait", compress: true });
    else pdf.addPage("a4", quer ? "landscape" : "portrait");
    pdf.addImage(bild.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, w, h);
  });
  pdf.setProperties({ title: "Einrichtblatt " + hocoNr + " " + (daten.typ.name || ""), creator: "HoferTool" });
  return { blob: pdf.output("blob"), typName: daten.typ.name || "" };
}

// Seiten als JPG für den Druck über den Pool-Rechner (Einrichtblatt vom
// iPad aus auf A4, Wunsch Patrick 30. Oktober 2026). daten wie im Fenster.
export async function blattJpgs(daten, optionen) {
  const blobs = [];
  await seitenZeichnen(daten, optionen, async (bild) => {
    blobs.push(await new Promise((ok) => bild.toBlob(ok, "image/jpeg", 0.9)));
    bild.width = bild.height = 0; // Speicher auf dem iPad gleich wieder frei
  });
  return blobs;
}
