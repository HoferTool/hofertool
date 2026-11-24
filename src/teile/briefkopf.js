// =================================================================
//  Hofer-Briefpapier für alle PDF, die die App erzeugt (seit 1.782.0,
//  Wunsch Patrick 24. November 2026: „das Hoferpapier soll überall, wo
//  man PDFs erstellt, als Hintergrund, also Vorlage“). Derselbe Kopf wie
//  die Bestellung (bestellungDrucken in app.js) und der 8D-Bericht:
//  blauer Balken #003884, 30 mm hoch, Logo, Adresse, Kontakt, ISO-Siegel.
//
//  - briefkopfHtml() / BRIEF_CSS für Blätter, die als HTML entstehen
//  - briefkopfBild() zeichnet den Balken einmal als Bild (210 × 30 mm),
//    das jsPDF oben auf jede Seite legt: briefkopfAufSeite(pdf, breite)
// =================================================================
import { alt } from "../bruecke.jsx";

export const BRIEF_HOEHE = 30; // mm

export const BRIEF_CSS = `
.hbrief { background: #003884; color: #fff; height: 30mm; padding: 0 9mm; box-sizing: border-box;
  display: flex; align-items: center; justify-content: space-between;
  font-family: Calibri, 'Segoe UI', system-ui, Arial, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.hbrief img { height: 21mm; width: auto; display: block; }
.hbrief img.briefsiegel { height: 22mm; width: 22mm; }
.hbrief .adresse, .hbrief .kontakt2 { font-size: 7.5pt; line-height: 1.5; white-space: nowrap; color: #fff; }
.hbrief .kontakt2 { border-left: .6pt solid rgba(255,255,255,.55); padding-left: 5mm; }
.hbrief .kontakt2 span { display: inline-block; width: 4mm; opacity: .7; }
.hbrief .firma, .hbrief .ort { font-weight: 700; }
.hbrief .firma { font-size: 8.5pt; }
`;

export function briefkopfHtml() {
  return '<div class="hbrief">'
    + '<img src="' + (alt.LOGO_BRIEF || "./logo-weiss.svg") + '" alt="Hofer + Co.">'
    + '<div class="adresse"><span class="firma">Hofer + Co. Präzisionsdrehteile</span><br>'
    + 'Alte Bernstrasse 24<br><span class="ort">CH-4573 Lohn-Ammannsegg</span></div>'
    + '<div class="kontakt2"><span>T</span>032 677 55 77<br><span>F</span>032 677 55 70<br>'
    + 'admin@hoferco.ch<br>www.hoferco.ch</div>'
    + (alt.SIEGEL_BRIEF ? '<img class="briefsiegel" src="' + alt.SIEGEL_BRIEF + '" alt="ISO 9001">' : "")
    + "</div>";
}

const MM = 96 / 25.4;
const bilder = {};

// Der Balken als Bild in der gewünschten Breite (mm), einmal je Breite
// gezeichnet und gemerkt. Quer (297 mm) bleiben Teile gleich gross,
// nur die Abstände wachsen.
export function briefkopfBild(breiteMm = 210) {
  if (bilder[breiteMm]) return bilder[breiteMm];
  bilder[breiteMm] = (async () => {
    const { default: html2canvas } = await import("html2canvas-pro");
    const huelle = document.createElement("div");
    huelle.setAttribute("aria-hidden", "true");
    huelle.className = "hell-bleibt";
    huelle.style.cssText = "position:fixed;left:-30000px;top:0;pointer-events:none;width:" + breiteMm * MM + "px";
    huelle.innerHTML = "<style>" + BRIEF_CSS + "</style>" + briefkopfHtml();
    document.body.appendChild(huelle);
    try {
      await Promise.all([...huelle.querySelectorAll("img")].map((b) => b.complete ? null
        : new Promise((ok) => { b.onload = ok; b.onerror = ok; setTimeout(ok, 5000); })));
      const el = huelle.querySelector(".hbrief");
      const bild = await html2canvas(el, { scale: 3, backgroundColor: "#003884", logging: false,
        width: breiteMm * MM, height: BRIEF_HOEHE * MM, windowWidth: Math.ceil(breiteMm * MM) + 40 });
      return bild.toDataURL("image/png");
    } finally {
      huelle.remove();
    }
  })().catch((e) => { delete bilder[breiteMm]; throw e; });
  return bilder[breiteMm];
}

// Legt den Balken oben auf die aktuelle Seite eines jsPDF
export async function briefkopfAufSeite(pdf, breiteMm = 210) {
  try {
    const bild = await briefkopfBild(breiteMm);
    pdf.addImage(bild, "PNG", 0, 0, breiteMm, BRIEF_HOEHE, "hbrief" + breiteMm, "FAST");
  } catch (e) {
    // Ohne Bild wenigstens ein blauer Balken
    pdf.setFillColor(0, 56, 132);
    pdf.rect(0, 0, breiteMm, BRIEF_HOEHE, "F");
  }
}

// Für Blätter, die im eigenen Fenster gedruckt werden (Drucken → „Als PDF
// speichern“): der Balken steht im Kopf einer Tabelle, so wiederholt ihn der
// Browser oben auf jeder gedruckten Seite. Ränder des Blatts kommen hier aus
// dem Inhalt, die Seite selbst hat keinen Rand, damit der Balken bis an die
// Kante reicht.
export function briefDruckHtml(inhalt, seitlich = "16mm") {
  return "<style>" + BRIEF_CSS
    + "@page{size:A4;margin:0}html,body{margin:0!important;padding:0!important}"
    + "table.hbrief-seite{width:100%;border-collapse:collapse;border:0;margin:0}"
    + "table.hbrief-seite>thead>tr>td,table.hbrief-seite>tbody>tr>td,table.hbrief-seite>tfoot>tr>td{padding:0!important;border:0!important;background:none!important;vertical-align:top}"
    + ".hbrief-inhalt{padding:8mm " + seitlich + " 0}.hbrief-fuss{height:12mm}</style>"
    + "<table class='hbrief-seite'><thead><tr><td>" + briefkopfHtml() + "</td></tr></thead>"
    + "<tbody><tr><td><div class='hbrief-inhalt'>" + inhalt + "</div></td></tr></tbody>"
    + "<tfoot><tr><td><div class='hbrief-fuss'></div></td></tr></tfoot></table>";
}

// Ganzes HTML-Dokument aufs Briefpapier legen: der Inhalt des body (ohne
// ein Skript am Schluss) kommt in briefDruckHtml
export function briefBlatt(doc) {
  const a = doc.indexOf("<body>");
  const z = doc.lastIndexOf("</body>");
  if (a < 0 || z < 0) return doc;
  let innen = doc.slice(a + 6, z).replace("<!--INHALT-->", "");
  let skript = "";
  const s = innen.lastIndexOf("<script>");
  if (s >= 0) { skript = innen.slice(s); innen = innen.slice(0, s); }
  return doc.slice(0, a + 6) + briefDruckHtml(innen) + skript + doc.slice(z);
}
