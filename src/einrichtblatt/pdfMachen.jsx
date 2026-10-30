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

// Bilder fertig laden, sonst fehlen sie im PDF; höchstens 8 Sekunden
function bilderFertig(el) {
  const bilder = [...el.querySelectorAll("img")].filter((b) => !b.complete);
  if (!bilder.length) return Promise.resolve();
  return Promise.race([
    Promise.all(bilder.map((b) => new Promise((ok) => { b.onload = ok; b.onerror = ok; }))),
    new Promise((ok) => setTimeout(ok, 8000)),
  ]);
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
          const [w, h] = seitenMass(s);
          return <div key={i} data-pdf-seite="" data-quer={s.quer ? "1" : ""} style={{ width: w, height: h, overflow: "hidden", background: "#fff" }}>
            <ZusatzSeite seite={s} />
          </div>;
        })}
      </div>));
    await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 50)));
    try { await document.fonts.ready; } catch (f) { /* dann mit dem, was da ist */ }
    await bilderFertig(huelle);
    for (const el of huelle.querySelectorAll("[data-pdf-seite]")) {
      const bild = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
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
