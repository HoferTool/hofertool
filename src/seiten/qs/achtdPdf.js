// =================================================================
//  8D-Report als PDF (seit 1.748.0). Das Blatt selbst steht in
//  achtdBlatt.js (auch für die Vorschau); hier nur das Zerlegen in
//  A4-Seiten. Lädt erst beim Erstellen.
// =================================================================
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { STIL, achtdHtml } from "./achtdBlatt.js";

export { achtdHtml };
const MM = 96 / 25.4;
const BREITE = 210, HOEHE = 297, OBEN = 12, UNTEN = 14;

function trennstellen(blatt) {
  const oben = blatt.getBoundingClientRect().top;
  const s = new Set();
  blatt.querySelectorAll("p, li, ul, .zwei, .kacheln, .ablauf, .titel, .fakten > div, .karte, .wirk, .dbilder figure, .unterschrift").forEach((x) => {
    const q = x.getBoundingClientRect();
    if (q.height) s.add(Math.ceil(q.bottom - oben) + 1);
  });
  blatt.querySelectorAll(".sk").forEach((x) => s.add(Math.floor(x.getBoundingClientRect().top - oben) - 2));
  return [...s].filter((x) => x > 0).sort((a, b) => a - b);
}

export async function achtdPdf(w, fuss) {
  const breite = BREITE * MM;
  const huelle = document.createElement("div");
  huelle.setAttribute("aria-hidden", "true");
  huelle.className = "hell-bleibt";
  huelle.style.cssText = "position:fixed;left:-30000px;top:0;pointer-events:none;background:#fff;overflow:hidden;width:" + breite + "px";
  const blatt = document.createElement("div");
  blatt.className = "rkpdf";
  blatt.style.cssText = "width:" + breite + "px";
  blatt.innerHTML = "<style>" + STIL + "</style>" + achtdHtml(w);
  huelle.appendChild(blatt);
  document.body.appendChild(huelle);
  try {
    try { await document.fonts.ready; } catch (f) { /* dann so */ }
    await Promise.all([...blatt.querySelectorAll("img")].map((b) => b.complete ? null
      : new Promise((ok) => { b.onload = ok; b.onerror = ok; setTimeout(ok, 5000); })));
    const gesamt = Math.max(1, blatt.offsetHeight);
    const stellen = trennstellen(blatt);
    // Seite 1 beginnt ganz oben mit dem Balken, die weiteren mit Rand oben
    const enden = [];
    let ab = 0;
    while (ab < gesamt - 1) {
      const seite = (HOEHE - UNTEN - (enden.length ? OBEN : 0)) * MM;
      const grenze = ab + seite;
      if (grenze >= gesamt) { enden.push([ab, gesamt]); break; }
      const passend = stellen.filter((s) => s > ab + seite * 0.4 && s <= grenze);
      const ende = passend.length ? passend[passend.length - 1] : Math.floor(grenze);
      enden.push([ab, ende]);
      ab = ende;
    }
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    for (let n = 0; n < enden.length; n++) {
      const [von, bis] = enden[n];
      const h = Math.max(1, bis - von);
      huelle.style.height = h + "px";
      blatt.style.marginTop = -von + "px";
      const bild = await html2canvas(huelle, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
        width: breite, height: h, windowWidth: Math.ceil(breite) + 40 });
      if (n) pdf.addPage("a4", "portrait");
      pdf.addImage(bild.toDataURL("image/jpeg", 0.9), "JPEG", 0, n ? OBEN : 0, BREITE, h / MM);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(130);
      pdf.text(fuss, 14, HOEHE - 7);
      pdf.text("Seite " + (n + 1) + " von " + enden.length, BREITE - 14, HOEHE - 7, { align: "right" });
    }
    pdf.setProperties({ title: fuss, creator: "HoferTool" });
    return pdf.output("blob");
  } finally {
    huelle.remove();
  }
}
