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
import { alt } from "../../bruecke.jsx";

// Mehr Seiten macht die Mail zu schwer
const HOECHSTENS = 20;

// Jede Zeichnungsseite steht hochkant (seit 1.300.2, Wunsch Patrick
// 30. Oktober 2026: „nicht quer, sondern hoch, dass alles passt“):
// eine quere Zeichnung wird um 90° gedreht, Schriftfeld oben rechts wie
// beim Ablegen einer A3 im A4-Ordner, so füllt sie die ganze Seite.
async function hochkant(img) {
  if (img.decode) await img.decode().catch(() => {});
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || w <= h) return img.src;
  const c = document.createElement("canvas");
  c.width = h; c.height = w;
  const g = c.getContext("2d");
  g.translate(0, w);
  g.rotate(-Math.PI / 2);
  g.drawImage(img, 0, 0);
  return c.toDataURL("image/jpeg", 0.92);
}

export async function zeichnungenAnhaengen(fenster, posten) {
  const fertig = () => { try { fenster.zeichnungenDa && fenster.zeichnungenDa(); } catch (f) { /* zu */ } };
  // Kurz oben im Blatt sagen, was passiert ist (wird nicht gedruckt)
  const stand = (text) => {
    try { const h = fenster.document.getElementById("zeichnungstand"); if (h) h.textContent = text; } catch (f) { /* zu */ }
  };
  const fehler = [];
  try {
    const ids = [...new Set(posten.map((z) => z.article_id).filter(Boolean))];
    const je = await spezialPdfsLaden(ids);
    const liste = [];
    posten.forEach((z) => {
      (je[z.article_id] || []).forEach((p) => {
        if (!liste.some((x) => x.p.id === p.id)) liste.push({ p, a: z.articles || {} });
      });
    });
    if (!liste.length) { stand("Bei diesen Artikeln ist keine Zeichnung (PDF) hinterlegt."); return; }
    stand("Zeichnungen werden angehängt …");
    const lib = await pdfjs();
    let seiten = 0;
    for (const { p, a } of liste) {
      if (seiten >= HOECHSTENS || fenster.closed) break;
      let bilder;
      try {
        const antwort = await fetch(p.url);
        if (!antwort.ok) throw new Error(antwort.status);
        bilder = await pdfSeitenAlsBilder(lib, new Uint8Array(await antwort.arrayBuffer()));
      } catch (f) {
        fehler.push((p.name || "PDF") + ": " + (f && f.message ? f.message : f));
        continue;
      }
      const doc = fenster.document;
      const ziel = doc && doc.getElementById("zeichnungen");
      if (!ziel) return;
      const teil = bilder.slice(0, HOECHSTENS - seiten);
      const quellen = await Promise.all(teil.map(hochkant));
      teil.forEach((img, i) => {
        const blatt = doc.createElement("div");
        blatt.className = "blatt zeichnung";
        const kopf = doc.createElement("div");
        kopf.className = "zkopf";
        kopf.textContent = "Zeichnung zu Artikel " + (a.article_number || "") + " · " + (p.name || "")
          + (bilder.length > 1 ? " · Seite " + (i + 1) + " von " + bilder.length : "");
        const rahmen = doc.createElement("div");
        rahmen.className = "zbild";
        const bild = doc.createElement("img");
        bild.src = quellen[i];
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
    stand(seiten
      ? (seiten === 1 ? "1 Seite Zeichnung angehängt." : seiten + " Seiten Zeichnungen angehängt.")
        + (fehler.length ? " Nicht geladen: " + fehler.join("; ") : "")
      : "Die Zeichnung liess sich nicht laden: " + fehler.join("; "));
  } catch (f) {
    // ohne Zeichnung geht die Bestellung trotzdem
    stand("Die Zeichnungen liessen sich nicht laden: " + (f && f.message ? f.message : f));
  } finally {
    if (fehler.length) try { alt.fehlerMerken("Bestell-PDF Zeichnung", fehler.join("; ")); } catch (f) { /* egal */ }
    fertig();
  }
}
