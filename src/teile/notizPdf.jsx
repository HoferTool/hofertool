// =================================================================
//  EIGENE MASCHINEN-NOTIZ ALS PDF (seit 1.221.0)
//  Der Text aus dem Editor des Infoboards wird unsichtbar neben dem
//  Bildschirm als A4-Blatt gezeichnet und Seite für Seite in ein PDF
//  gelegt. Seitenwechsel möglichst zwischen zwei Zeilen oder Bildern,
//  nicht mitten durch die Schrift. Eigenes Stück, damit html2canvas und
//  jsPDF erst beim Speichern geladen werden.
// =================================================================
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { sauber, RAND_MM, SEITE_INHALT_MM, STANDARD_PT } from "../infoboard/TextFeld.jsx";

const MM = 96 / 25.4;

function bilderFertig(el) {
  const bilder = [...el.querySelectorAll("img")].filter((b) => !b.complete);
  if (!bilder.length) return Promise.resolve();
  return Promise.race([
    Promise.all(bilder.map((b) => new Promise((ok) => { b.onload = ok; b.onerror = ok; }))),
    new Promise((ok) => setTimeout(ok, 8000)),
  ]);
}

// Stellen, an denen eine Seite enden darf: unter jeder Textzeile und
// jedem Bild. Zeilen liefern die Rechtecke der Textstücke.
function trennstellen(blatt) {
  const oben = blatt.getBoundingClientRect().top;
  const stellen = new Set();
  const lauf = document.createTreeWalker(blatt, NodeFilter.SHOW_TEXT);
  const r = document.createRange();
  for (let k = lauf.nextNode(); k; k = lauf.nextNode()) {
    if (!k.nodeValue.trim()) continue;
    r.selectNodeContents(k);
    for (const q of r.getClientRects()) stellen.add(Math.ceil(q.bottom - oben) + 1);
  }
  blatt.querySelectorAll("img, tr, li, p, h1, h2, h3, h4, br").forEach((e) => {
    const q = e.getBoundingClientRect();
    if (q.height) stellen.add(Math.ceil(q.bottom - oben) + 1);
  });
  return [...stellen].sort((a, b) => a - b);
}

export async function notizPdf(html, titel) {
  const seite = SEITE_INHALT_MM * MM;
  const breite = 210 * MM;
  const huelle = document.createElement("div");
  huelle.setAttribute("aria-hidden", "true");
  huelle.style.cssText = "position:fixed;left:-30000px;top:0;pointer-events:none;background:#fff;overflow:hidden;width:"
    + breite + "px";
  // Dieselbe Klasse wie im Editor, damit Schrift und Abstände gleich sind;
  // oben und unten kein Rand, den setzt jede PDF-Seite selbst
  const blatt = document.createElement("div");
  blatt.className = "ib-text__blatt";
  blatt.style.cssText = "position:relative;transform:none;height:auto;overflow:visible;width:" + breite
    + "px;padding:0 " + RAND_MM * MM + "px;font-size:" + STANDARD_PT + "pt";
  blatt.innerHTML = sauber(html);
  huelle.appendChild(blatt);
  document.body.appendChild(huelle);
  try {
    try { await document.fonts.ready; } catch (f) { /* dann mit dem, was da ist */ }
    await bilderFertig(huelle);
    const gesamt = Math.max(1, blatt.offsetHeight);
    const stellen = trennstellen(blatt);
    // Seitenenden wählen: die letzte Trennstelle vor dem Seitenende, aber
    // nicht so früh, dass die Seite halb leer bleibt; sonst hart schneiden
    const enden = [];
    let ab = 0;
    while (ab < gesamt - 1) {
      const grenze = ab + seite;
      if (grenze >= gesamt) { enden.push([ab, gesamt]); break; }
      const passend = stellen.filter((s) => s > ab + seite * 0.5 && s <= grenze);
      const ende = passend.length ? passend[passend.length - 1] : Math.floor(grenze);
      enden.push([ab, ende]);
      ab = ende;
    }
    if (!enden.length) enden.push([0, gesamt]);
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    for (let i = 0; i < enden.length; i++) {
      const [von, bis] = enden[i];
      const h = Math.max(1, bis - von);
      // Fenster auf genau dieses Stück: Hülle so hoch, Blatt nach oben verschoben
      huelle.style.height = h + "px";
      blatt.style.marginTop = -von + "px";
      const bild = await html2canvas(huelle, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
        width: breite, height: h, windowWidth: Math.ceil(breite) + 40 });
      if (i) pdf.addPage("a4", "portrait");
      pdf.addImage(bild.toDataURL("image/jpeg", 0.9), "JPEG", 0, RAND_MM, 210, h / MM);
      // Fuss: Titel und Seite, klein und grau
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(130);
      pdf.text(String(titel || ""), RAND_MM, 297 - 6);
      pdf.text("Seite " + (i + 1) + " von " + enden.length, 210 - RAND_MM, 297 - 6, { align: "right" });
    }
    pdf.setProperties({ title: String(titel || "Maschinen-Notiz"), creator: "HoferTool" });
    return pdf.output("blob");
  } finally {
    huelle.remove();
  }
}
