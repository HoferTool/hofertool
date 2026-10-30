// =================================================================
//  BESTELLUNGEN · Zeichnungen aufs Bestell-PDF
//  Die PDFs, die beim Artikel hinterlegt sind (spezial_pdfs), kommen
//  als weitere Seiten hinter die Bestellung (seit 1.300.0, Wunsch
//  Patrick 30. Oktober 2026: „zusätzlich soll als zweite Seite die
//  Zeichnung, welche beim Artikel hinterlegt ist, mitgegeben werden“).
//  Gezeichnet in der App mit pdf.js, ins Bestellblatt als Bilder;
//  das Blatt wartet beim Drucken und bei der Mail darauf.
// =================================================================
import { pdfjs } from "../../teile/PdfAnsicht.jsx";
import { pdfSeitenAlsBilder } from "../../teile/drucken.js";
import { spezialPdfsLaden } from "../../daten/spezialwerkzeuge.js";

// Mehr Seiten macht die Mail zu schwer
const HOECHSTENS = 20;

export async function zeichnungenAnhaengen(fenster, posten) {
  const fertig = () => { try { fenster.zeichnungenDa && fenster.zeichnungenDa(); } catch (f) { /* zu */ } };
  try {
    const ids = [...new Set(posten.map((z) => z.article_id).filter(Boolean))];
    const je = await spezialPdfsLaden(ids);
    const liste = [];
    posten.forEach((z) => {
      (je[z.article_id] || []).forEach((p) => {
        if (!liste.some((x) => x.p.id === p.id)) liste.push({ p, a: z.articles || {} });
      });
    });
    if (!liste.length) return;
    const lib = await pdfjs();
    let seiten = 0;
    for (const { p, a } of liste) {
      if (seiten >= HOECHSTENS || fenster.closed) break;
      let bilder;
      try {
        const antwort = await fetch(p.url);
        if (!antwort.ok) throw new Error(antwort.status);
        bilder = await pdfSeitenAlsBilder(lib, new Uint8Array(await antwort.arrayBuffer()));
      } catch (f) { continue; }
      const doc = fenster.document;
      const ziel = doc && doc.getElementById("zeichnungen");
      if (!ziel) return;
      bilder.slice(0, HOECHSTENS - seiten).forEach((img, i) => {
        const blatt = doc.createElement("div");
        blatt.className = "blatt zeichnung" + (/--quer/.test(img.className) ? " quer" : "");
        const kopf = doc.createElement("div");
        kopf.className = "zkopf";
        kopf.textContent = "Zeichnung zu Artikel " + (a.article_number || "") + " · " + (p.name || "")
          + (bilder.length > 1 ? " · Seite " + (i + 1) + " von " + bilder.length : "");
        const rahmen = doc.createElement("div");
        rahmen.className = "zbild";
        const bild = doc.createElement("img");
        bild.src = img.src;
        bild.alt = kopf.textContent;
        rahmen.appendChild(bild);
        blatt.append(kopf, rahmen);
        ziel.appendChild(blatt);
        seiten++;
      });
    }
    // Bilder fertig dekodiert, damit die Mail ihre Grösse kennt
    const doc = fenster.document;
    await Promise.all([...doc.querySelectorAll(".blatt.zeichnung img")].map((b) =>
      b.decode ? b.decode().catch(() => {}) : null));
  } catch (f) {
    /* ohne Zeichnung geht die Bestellung trotzdem */
  } finally { fertig(); }
}
