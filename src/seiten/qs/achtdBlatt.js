// =================================================================
//  8D-Report als PDF (seit 1.748.0), aufgebaut wie Patricks Bericht
//  vom 23. November 2026: Briefkopf der Firma (blauer Balken wie das
//  Bestellblatt), Lieferant und Kunde, Beanstandung, Artikel und
//  Mengen, dann die Punkte 1 bis 8. Angekreuzte Punkte stehen als
//  Zeilen da, darunter der freie Text. Das Blatt als HTML, für das PDF
//  und seit 1.749.0 für die Vorschau neben dem Formular.
// =================================================================
import { alt } from "../../bruecke.jsx";
import { ACHT_D } from "./Reklamationen.jsx";

const esc = (t) => alt.esc(t == null ? "" : String(t));
const leer = (v) => v == null || String(v).trim() === "";
const zl = (t) => esc(t).replace(/\n/g, "<br>");
const datum = (d) => {
  if (!d) return "";
  const t = alt.ausIso(String(d).slice(0, 10));
  return isNaN(t.getTime()) ? String(d) : String(t.getDate()).padStart(2, "0") + "." + String(t.getMonth() + 1).padStart(2, "0") + "." + t.getFullYear();
};
const zahl = (v) => (leer(v) ? "" : (isNaN(Number(v)) ? String(v) : alt.zahlText(Number(v))));

const HOFER = "Hofer + Co. Präzisionsdrehteile\nAlte Bernstrasse 24\nCH-4573 Lohn-Ammannsegg";

export const STIL = `
.rkpdf { font: 9.5pt/1.4 Aptos, "Segoe UI", Arial, sans-serif; color: #1a1f29; background: #fff; }
.rkpdf * { box-sizing: border-box; }
.rkpdf .balken { background: #003884; color: #fff; height: 30mm; padding: 0 9mm;
  display: flex; align-items: center; justify-content: space-between; }
.rkpdf .balken img { height: 21mm; width: auto; display: block; }
.rkpdf .balken img.briefsiegel { height: 22mm; width: 22mm; }
.rkpdf .balken .adresse, .rkpdf .balken .kontakt2 { font-size: 7.5pt; line-height: 1.5; white-space: nowrap; color: #fff; }
.rkpdf .balken .kontakt2 { border-left: .6pt solid rgba(255,255,255,.55); padding-left: 5mm; }
.rkpdf .balken .kontakt2 span { display: inline-block; width: 4mm; opacity: .7; }
.rkpdf .balken .firma, .rkpdf .balken .ort { font-weight: 700; }
.rkpdf .balken .firma { font-size: 8.5pt; }
.rkpdf .inhalt { padding: 8mm 14mm 0; }
.rkpdf h1 { font-size: 20pt; color: #003884; margin: 0 0 4mm; letter-spacing: .02em; }
.rkpdf h2 { font-size: 11pt; color: #003884; margin: 5mm 0 1.5mm; padding-bottom: 1mm; border-bottom: .8pt solid #003884; }
.rkpdf table { width: 100%; border-collapse: collapse; }
.rkpdf td { border: .5pt solid #b9c3d1; padding: 1.4mm 2mm; vertical-align: top; }
.rkpdf td.b { background: #eef2f8; font-weight: 600; width: 38mm; color: #33405a; }
.rkpdf .zwei { display: flex; gap: 4mm; }
.rkpdf .zwei > div { flex: 1; border: .5pt solid #b9c3d1; padding: 2mm 3mm; }
.rkpdf .zwei .titel { font-size: 8pt; font-weight: 700; color: #003884; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 1mm; }
.rkpdf p { margin: 0 0 1mm; }
.rkpdf ul { margin: 0 0 1mm; padding-left: 5mm; }
.rkpdf li { margin: 0 0 .5mm; }
.rkpdf .gruppe { font-weight: 700; margin-top: 1mm; }
.rkpdf .frei { white-space: normal; }
.rkpdf .nichts { color: #8a93a3; font-style: italic; }
`;

function briefkopf() {
  return '<div class="balken">'
    + '<img src="' + (alt.LOGO_BRIEF || "./logo-weiss.svg") + '" alt="Hofer + Co.">'
    + '<div class="adresse"><span class="firma">Hofer + Co. Präzisionsdrehteile</span><br>'
    + 'Alte Bernstrasse 24<br><span class="ort">CH-4573 Lohn-Ammannsegg</span></div>'
    + '<div class="kontakt2"><span>T</span>032 677 55 77<br><span>F</span>032 677 55 70<br>'
    + 'admin@hoferco.ch<br>www.hoferco.ch</div>'
    + (alt.SIEGEL_BRIEF ? '<img class="briefsiegel" src="' + alt.SIEGEL_BRIEF + '" alt="ISO 9001">' : "")
    + '</div>';
}

const zeile = (b, w) => '<tr><td class="b">' + esc(b) + "</td><td>" + (w || "") + "</td></tr>";

// Ein Abschnitt 2 bis 7: angekreuzte Punkte je Gruppe, dann der freie Text
function abschnitt(w, a) {
  const l = (w.achtd && Array.isArray(w.achtd[a.s])) ? w.achtd[a.s] : [];
  const bekannt = new Set();
  let h = "";
  for (const [g, punkte] of a.gruppen) {
    punkte.forEach((p) => bekannt.add(p));
    const da = punkte.filter((p) => l.includes(p));
    if (!da.length) continue;
    if (g && a.pdfGruppen) h += '<p class="gruppe">' + esc(g) + "</p>";
    h += "<ul>" + da.map((p) => "<li>" + esc(p) + "</li>").join("") + "</ul>";
  }
  const rest = l.filter((p) => !bekannt.has(p));
  if (rest.length) h += "<ul>" + rest.map((p) => "<li>" + esc(p) + "</li>").join("") + "</ul>";
  if (!leer(w[a.text])) h += '<p class="frei">' + zl(w[a.text]) + "</p>";
  return '<section data-s="' + a.s + '"><h2>' + a.nr + " · " + esc(a.titel) + "</h2>" + (h || '<p class="nichts">–</p>') + "</section>";
}

export function achtdHtml(w) {
  const k = w.kopf || {};
  const kunde = w.art !== "lieferant";
  const hofer = '<div class="titel">' + (kunde ? "Lieferant" : "Kunde") + "</div><p>" + zl(HOFER) + "</p>"
    + (leer(k.bearbeiter) ? "" : "<p>Bearbeiter: <b>" + esc(k.bearbeiter) + "</b></p>")
    + (leer(k.tel) ? "" : "<p>Tel.: " + esc(k.tel) + "</p>")
    + (leer(k.mail) ? "" : "<p>Mail: " + esc(k.mail) + "</p>");
  const andere = '<div class="titel">' + (kunde ? "Kunde" : "Lieferant") + "</div>"
    + "<p><b>" + esc(w.partner || (w.art === "intern" ? "Intern" : "")) + "</b></p>"
    + (leer(k.adresse) ? "" : "<p>" + zl(k.adresse) + "</p>")
    + (leer(w.kontakt) ? "" : "<p>Kontakt: " + esc(w.kontakt) + "</p>");
  const zeichnung = [k.zeichnung, k.index].filter((x) => !leer(x)).join(" / ");
  let h = briefkopf() + '<div class="inhalt"><h1>8D-Report</h1>'
    + '<section data-s="kopf"><div class="zwei"><div>' + (kunde ? hofer : andere) + "</div><div>" + (kunde ? andere : hofer) + "</div></div>"
    + "<h2>Beanstandung</h2><table>"
    + zeile("Beanstand.-Nr.", "Intern: <b>" + esc(w.nr || "") + "</b>" + (leer(w.ref_partner) ? "" : " · " + (kunde ? "Kunde" : "Lieferant") + ": <b>" + esc(w.ref_partner) + "</b>"))
    + zeile("Eröffnet am", datum(w.eingang))
    + zeile("Berichtsdatum", datum(k.berichtsdatum || alt.isoDatum(new Date())))
    + "</table></section><section data-s=\"artikel\"><h2>Artikel und Mengen</h2><table>"
    + zeile("Artikelbezeichnung", esc(w.teil))
    + zeile("Artikelnummer Hoco", esc(w.hoco_nr))
    + zeile("Zeichnungs-Nr. / Index", esc(zeichnung))
    + zeile("Kunden Art. Nr.", esc(k.kunden_art))
    + zeile("Bestellte Menge", zahl(k.bestellt))
    + zeile("Gelieferte Menge", zahl(w.menge_geliefert))
    + zeile("Beanstandungsmenge", zahl(w.menge_reklamiert))
    + zeile("Retournierte Menge", zahl(k.retour))
    + zeile("Gutteile", zahl(k.gut))
    + zeile("Lieferschein Nr.", esc(k.lieferschein))
    + zeile("Lieferdatum", datum(k.lieferdatum))
    + zeile("Auftrags Nr.", esc(k.auftrag))
    + zeile("Fabrikationsauftrag", esc(w.fa_nr))
    + "</table></section>"
    + '<section data-s="d1"><h2>1 · Problembeschreibung</h2>' + (leer(w.fehler) ? '<p class="nichts">–</p>' : '<p class="frei">' + zl(w.fehler) + "</p>") + "</section>";
  for (const a of ACHT_D) h += abschnitt(w, a);
  h += '<section data-s="bem"><h2>8 · Bemerkung</h2>' + (leer(w.bemerkung) ? '<p class="nichts">–</p>' : '<p class="frei">' + zl(w.bemerkung) + "</p>") + "</section>";
  return h + "</div>";
}

// Vorschau neben dem Formular: der Teil des gerade offenen Schritts ist hervorgehoben
export function achtdVorschau(w, teil) {
  const hervor = teil ? '.rkpdf section[data-s="' + teil + '"] { background: #fff6cc; box-shadow: 0 0 0 2mm #fff6cc; border-radius: 1mm; }' : "";
  return '<div class="rkpdf"><style>' + STIL + hervor + "</style>" + achtdHtml(w) + "</div>";
}
