// =================================================================
//  8D-Report als PDF (seit 1.748.0), aufgebaut wie Patricks Bericht
//  vom 23. November 2026: Briefkopf der Firma (blauer Balken wie das
//  Bestellblatt), Lieferant und Kunde, Beanstandung, Artikel und
//  Mengen, dann die Punkte 1 bis 8. Angekreuzte Punkte stehen als
//  Zeilen da, darunter der freie Text. Das Blatt als HTML, für das PDF
//  und seit 1.749.0 für die Vorschau neben dem Formular.
// =================================================================
import { alt } from "../../bruecke.jsx";
import { ACHT_D, WIRKSAM, fehlerartVon } from "./Reklamationen.jsx";

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
.rkpdf { font: 9.2pt/1.45 Aptos, "Segoe UI", Arial, sans-serif; color: #1a1f29; background: #fff; }
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
.rkpdf .inhalt { padding: 7mm 13mm 2mm; }
.rkpdf p { margin: 0 0 1mm; }
.rkpdf .titel { display: flex; justify-content: space-between; align-items: flex-end; gap: 4mm; margin-bottom: 5mm; }
.rkpdf .titel .klein { font-size: 7.5pt; letter-spacing: .18em; color: #6b7890; font-weight: 700; text-transform: uppercase; }
.rkpdf .titel h1 { margin: 0; font-size: 25pt; line-height: 1.05; color: #003884; letter-spacing: -.01em; }
.rkpdf .titel h1 b { color: #003884; }
.rkpdf .titel .unter { font-size: 10pt; color: #33405a; margin-top: 1mm; }
.rkpdf .chips { display: flex; gap: 1.5mm; justify-content: flex-end; margin-bottom: 2mm; }
.rkpdf .chip { font-size: 7.5pt; font-weight: 700; padding: 1mm 3mm; border-radius: 10mm; border: .6pt solid #c8d2e2; color: #8a93a3; white-space: nowrap; }
.rkpdf .chip.an { background: #003884; color: #fff; border-color: #003884; }
.rkpdf .chip.rot { background: #c8322a; color: #fff; border-color: #c8322a; }
.rkpdf .datum { text-align: right; font-size: 8pt; color: #6b7890; white-space: nowrap; }
.rkpdf .kacheln { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.5mm; margin-bottom: 4mm; }
.rkpdf .kachel { background: #f1f5fb; border-radius: 2.5mm; padding: 2.5mm 3mm; border: .5pt solid #dfe5ee; }
.rkpdf .kachel .k { font-size: 6.8pt; text-transform: uppercase; letter-spacing: .08em; color: #6b7890; font-weight: 700; }
.rkpdf .kachel .w { font-size: 14pt; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
.rkpdf .kachel .w.text { font-size: 10.5pt; }
.rkpdf .kachel .w small { font-size: 8pt; font-weight: 600; color: #6b7890; }
.rkpdf .ablauf { display: flex; align-items: flex-start; margin: 0 0 5mm; }
.rkpdf .ablauf .p { display: flex; flex-direction: column; align-items: center; width: 15mm; flex: none; }
.rkpdf .ablauf .p i { width: 7mm; height: 7mm; border-radius: 50%; background: #003884; color: #fff; font-style: normal;
  font-weight: 700; font-size: 8pt; display: flex; align-items: center; justify-content: center; }
.rkpdf .ablauf .p.offen i { background: #fff; color: #8a93a3; border: .8pt solid #c8d2e2; }
.rkpdf .ablauf .p span { font-size: 6.5pt; color: #33405a; margin-top: .8mm; text-align: center; line-height: 1.15; }
.rkpdf .ablauf .l { flex: 1; height: .8mm; background: #dbe2ee; margin-top: 3.1mm; }
.rkpdf .ablauf .l.voll { background: #003884; }
.rkpdf .zwei { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-bottom: 4mm; }
.rkpdf .adr { border: .5pt solid #d6deea; border-radius: 2.5mm; padding: 2.5mm 3.5mm; }
.rkpdf .adr .t { font-size: 7pt; font-weight: 700; letter-spacing: .1em; color: #003884; text-transform: uppercase; margin-bottom: 1mm; }
.rkpdf .adr .name { font-size: 10pt; font-weight: 700; }
.rkpdf .fakten { display: grid; grid-template-columns: repeat(3, 1fr); border: .5pt solid #d6deea; border-radius: 2.5mm; overflow: hidden; margin-bottom: 5mm; }
.rkpdf .fakten > div { padding: 1.8mm 3mm; border-right: .5pt solid #e4eaf3; border-bottom: .5pt solid #e4eaf3; overflow-wrap: anywhere; }
.rkpdf .fakten > div:nth-child(3n) { border-right: 0; }
.rkpdf .fakten span { display: block; font-size: 6.8pt; color: #6b7890; text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }
.rkpdf .sek { margin-bottom: 3.5mm; }
.rkpdf .sk { display: flex; align-items: center; gap: 2.5mm; margin-bottom: 1.5mm; }
.rkpdf .sk .nr { width: 7.5mm; height: 7.5mm; border-radius: 2mm; background: #003884; color: #fff; font-weight: 700; font-size: 8.5pt;
  display: flex; align-items: center; justify-content: center; flex: none; }
.rkpdf .sk h2 { margin: 0; font-size: 11pt; color: #003884; }
.rkpdf .karte { background: #f7f9fc; border: .5pt solid #e4eaf3; border-radius: 2.5mm; padding: 2.5mm 4mm; }
.rkpdf .gruppe { font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .09em; color: #6b7890;
  margin: 0 0 1mm; padding-bottom: .8mm; border-bottom: .5pt solid #dfe5ef; }
/* Angekreuztes als ruhige Aufzählung (seit 1.776.0, Wunsch Patrick: „wie Auflistung im PDF … professionell, elegant“):
   kleiner blauer Punkt, ab vier Punkten in zwei Spalten, Gruppen nebeneinander */
.rkpdf ul.auf { list-style: none; margin: 0; padding: 0; }
.rkpdf ul.auf.spalten { column-count: 2; column-gap: 7mm; }
.rkpdf ul.auf li { position: relative; padding: .45mm 0 .45mm 4mm; line-height: 1.35; break-inside: avoid; }
.rkpdf ul.auf li i.pk { position: absolute; left: .6mm; top: 2.05mm; width: 1.5mm; height: 1.5mm; border-radius: 50%; background: #003884; }
.rkpdf .gruppen { display: grid; grid-template-columns: repeat(auto-fit, minmax(52mm, 1fr)); gap: 2.5mm 7mm; }
.rkpdf .gruppen > div { min-width: 0; }
.rkpdf .frei { white-space: normal; }
.rkpdf .dbilder { display: flex; flex-wrap: wrap; gap: 2.5mm; margin-top: 2mm; }
.rkpdf .dbilder figure { margin: 0; width: 52mm; }
.rkpdf .dbilder img { display: block; width: 52mm; max-height: 42mm; object-fit: contain; background: #fff; border: .5pt solid #d6deea; border-radius: 1.5mm; }
.rkpdf .dbilder figcaption { font-size: 6.5pt; color: #6b7a90; margin-top: .6mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rkpdf .danh { font-size: 8pt; color: #4a5a72; margin-top: 1.5mm; }
.rkpdf ul + .frei, .rkpdf .gruppen + .frei { margin-top: 1.8mm; padding-top: 1.8mm; border-top: .5pt dashed #c8d2e2; }
.rkpdf .nichts { color: #8a93a3; font-style: italic; margin: 0; }
.rkpdf .wirk { display: flex; gap: 3mm; align-items: center; margin-top: 2mm; }
.rkpdf .stempel { border: 1pt solid #2f9e5b; color: #2f9e5b; font-weight: 700; border-radius: 1.5mm; padding: 1mm 3mm; font-size: 8.5pt; }
.rkpdf .schluss { margin-top: 6mm; padding-top: 1.5mm; border-top: .6pt solid #33405a; font-size: 9pt; color: #1d2b45; }
.rkpdf .unterschrift { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 6mm; }
.rkpdf .unterschrift .linie { border-top: .6pt solid #33405a; padding-top: 1mm; font-size: 7.5pt; color: #6b7890; }
.rkpdf .unterschrift .sig { height: 12mm; display: flex; align-items: flex-end; justify-content: space-between; gap: 4mm; padding: 0 1mm .6mm; }
.rkpdf .unterschrift .sig-datum { font-size: 9pt; color: #1d2b45; padding-bottom: .8mm; }
.rkpdf .unterschrift .sig-name { font-family: "Alex Brush", "Segoe Script", "Brush Script MT", cursive; font-size: 24pt; line-height: 1; color: #10306e; white-space: nowrap; }
`;

// Briefkopf nach Hofer-Briefpapier (CLAUDE.md), auch für die Prüfprotokolle
export function briefkopf() {
  return '<div class="balken">'
    + '<img src="' + (alt.LOGO_BRIEF || "./logo-weiss.svg") + '" alt="Hofer + Co.">'
    + '<div class="adresse"><span class="firma">Hofer + Co. Präzisionsdrehteile</span><br>'
    + 'Alte Bernstrasse 24<br><span class="ort">CH-4573 Lohn-Ammannsegg</span></div>'
    + '<div class="kontakt2"><span>T</span>032 677 55 77<br><span>F</span>032 677 55 70<br>'
    + 'admin@hoferco.ch<br>www.hoferco.ch</div>'
    + (alt.SIEGEL_BRIEF ? '<img class="briefsiegel" src="' + alt.SIEGEL_BRIEF + '" alt="ISO 9001">' : "")
    + '</div>';
}

const haken = (p) => '<li><i class="pk"></i>' + esc(p) + "</li>";
const auflistung = (l, spalten) => '<ul class="auf' + (spalten && l.length >= 4 ? " spalten" : "") + '">' + l.map(haken).join("") + "</ul>";
const fakt = (b, w) => "<div><span>" + esc(b) + "</span>" + (leer(w) ? "–" : w) + "</div>";
const sek = (s, nr, titel, inhalt, extra) => '<section class="sek' + (extra ? " " + extra : "") + '" data-s="' + s + '">'
  + '<div class="sk"><span class="nr">' + nr + "</span><h2>" + esc(titel) + '</h2></div><div class="karte">' + inhalt + "</div></section>";
const angekreuzt = (w, s) => (w.achtd && Array.isArray(w.achtd[s])) ? w.achtd[s] : [];

// Ein Abschnitt D1 bis D8: angekreuzte Punkte je Gruppe, dann der freie Text
function abschnitt(w, a) {
  const l = angekreuzt(w, a.s);
  const bekannt = new Set();
  let h = a.oben && !leer(w[a.oben]) ? '<p class="frei">' + zl(w[a.oben]) + "</p>" : "";
  const teile = [];
  for (const [g, punkte] of a.gruppen) {
    punkte.forEach((p) => bekannt.add(p));
    const da = punkte.filter((p) => l.includes(p) && !(a.s === "d8" && p === WIRKSAM));
    if (da.length) teile.push([a.pdfGruppen ? g : "", da]);
  }
  const rest = l.filter((p) => !bekannt.has(p) && p !== WIRKSAM);
  if (rest.length) teile.push([teile.some((t) => t[0]) ? "Weitere" : "", rest]);
  if (teile.some((t) => t[0])) {
    // Gruppen nebeneinander, je mit Überschrift
    h += '<div class="gruppen">' + teile.map(([g, da]) => "<div>" + (g ? '<p class="gruppe">' + esc(g) + "</p>" : "")
      + auflistung(da, false) + "</div>").join("") + "</div>";
  } else if (teile.length) {
    h += auflistung(teile.flatMap((t) => t[1]), true);
  }
  const frei = a.text ? w[a.text] : (w.kopf || {})[a.kopfText];
  if (!leer(frei)) h += '<p class="frei">' + zl(frei) + "</p>";
  // Bilder und Dateien, die zu diesem Punkt angehängt sind (seit 1.767.0)
  const anh = (Array.isArray(w.dateien) ? w.dateien : []).filter((x) => x && x.d === a.s);
  const bilder = anh.filter((x) => x.typ === "bild" && x.url);
  const andere = anh.filter((x) => !(x.typ === "bild" && x.url));
  if (bilder.length) h += '<div class="dbilder">' + bilder.map((x) => '<figure><img src="' + esc(x.url) + '" crossorigin="anonymous" alt=""><figcaption>'
    + esc(x.name || "") + "</figcaption></figure>").join("") + "</div>";
  if (andere.length) h += '<p class="danh">Beilage: ' + andere.map((x) => esc(x.name || "Datei")).join(", ") + "</p>";
  if (a.s === "d8" && !leer(w.bemerkung)) h += '<p class="frei"><b>Bemerkung:</b> ' + zl(w.bemerkung) + "</p>";
  if (a.s === "d8" && l.includes(WIRKSAM)) h += '<div class="wirk"><span class="stempel">✓ WIRKSAM</span><span>' + esc(WIRKSAM) + "</span></div>";
  return sek(a.s, "D" + a.nr, a.titel, h || '<p class="nichts">–</p>', a.s === "d4" ? "ursache" : "");
}

// Ob ein Punkt 1 bis 8 schon etwas enthält (für die Leiste oben)
function ausgefuellt(w, nr) {
  const a = ACHT_D.find((x) => x.nr === nr);
  if (!a) return false;
  if (a.oben && !leer(w[a.oben])) return true;
  return angekreuzt(w, a.s).length > 0 || !leer(a.text ? w[a.text] : (w.kopf || {})[a.kopfText])
    || (Array.isArray(w.dateien) ? w.dateien : []).some((x) => x && x.d === a.s);
}

export function achtdHtml(w) {
  const k = w.kopf || {};
  const kunde = w.art !== "lieferant";
  const intern = w.art === "intern";
  const hofer = '<div class="t">' + (intern ? "Firma" : kunde ? "Lieferant" : "Kunde") + '</div><p class="name">Hofer + Co. Präzisionsdrehteile</p>'
    + "<p>Alte Bernstrasse 24, CH-4573 Lohn-Ammannsegg</p>"
    + ([k.bearbeiter, k.tel].some((x) => !leer(x)) ? "<p>" + [k.bearbeiter, k.tel].filter((x) => !leer(x)).map(esc).join(" · ") + "</p>" : "")
    + (leer(k.mail) ? "" : "<p>" + esc(k.mail) + "</p>");
  const andere = '<div class="t">' + (intern ? "Bereich" : kunde ? "Kunde" : "Lieferant") + '</div><p class="name">'
    + esc(w.partner || (w.art === "intern" ? "Intern" : "–")) + "</p>"
    + (leer(k.adresse) ? "" : "<p>" + zl(k.adresse) + "</p>")
    + (leer(w.kontakt) ? "" : "<p>" + esc(w.kontakt) + "</p>");
  const zeichnung = [k.zeichnung, k.index].filter((x) => !leer(x)).join(" / ");
  const unter = [w.partner, w.teil, leer(w.hoco_nr) ? "" : "HOCO " + w.hoco_nr].filter((x) => !leer(x)).map(esc).join(" · ");
  const st = w.status || "offen";
  const chips = (st === "abgelehnt" ? [["abgelehnt", "Abgelehnt"]] : [])
    .concat([["offen", "Offen"], ["bearbeitung", "In Bearbeitung"], ["abgeschlossen", "Abgeschlossen"]])
    .map(([s, t]) => '<span class="chip' + (s === st ? (s === "abgelehnt" ? " rot" : " an") : "") + '">' + t + "</span>").join("");
  const fa = fehlerartVon(w).concat(angekreuzt(w, "fa"));
  const fehlerart = fa.length ? fa.join(", ") : (w.fehlerart || "");
  const kachel = (art, k1, wert, text) => '<div class="kachel ' + art + '"><div class="k">' + k1 + '</div><div class="w' + (text ? " text" : "") + '">' + wert + "</div></div>";
  const ref = (leer(w.nr) ? "" : esc(w.nr)) + (leer(w.ref_partner) ? "" : " · " + (kunde ? "Kunde" : "Lieferant") + ": " + esc(w.ref_partner));
  let h = briefkopf() + '<div class="inhalt">'
    + '<section data-s="kopf"><div class="titel"><div><div class="klein">Reklamation ' + esc(w.nr || "") + '</div><h1>' + (w.art === "intern" ? "Interne Reklamation" : "8D-Report") + '<b>.</b></h1>'
    + (unter ? '<div class="unter">' + unter + "</div>" : "") + "</div>"
    + '<div><div class="chips">' + chips + '</div><div class="datum">Berichtsdatum ' + datum(k.berichtsdatum || alt.isoDatum(new Date()))
    + (leer(k.bearbeiter) ? "" : " · Bearbeiter " + esc(k.bearbeiter)) + "</div></div></div>"
    + '<div class="kacheln">'
    + kachel("rot", "Beanstandet", leer(w.menge_reklamiert) ? "–" : zahl(w.menge_reklamiert) + " <small>Stk</small>")
    + kachel("gr", "Gutteile", leer(k.gut) ? "–" : zahl(k.gut) + (leer(w.menge_geliefert) ? "" : " <small>von " + zahl(w.menge_geliefert) + "</small>"))
    + kachel("org", "Fehlerart", leer(fehlerart) ? "–" : esc(fehlerart), true)
    + kachel("", w.termin ? "Termin" : "Eröffnet am", datum(w.termin || w.eingang) || "–")
    + "</div>"
    + '<div class="zwei"><div class="adr">' + (kunde ? hofer : andere) + '</div><div class="adr">' + (kunde ? andere : hofer) + "</div></div>"
    + '<div class="fakten">' + fakt("Beanstand.-Nr.", ref) + fakt("Eröffnet am", datum(w.eingang)) + fakt("Auftrags Nr.", esc(k.auftrag)) + "</div>"
    + "</section>"
    + '<section data-s="artikel"><div class="fakten">'
    + fakt("Artikelbezeichnung", esc(w.teil)) + fakt("Artikelnummer Hoco", esc(w.hoco_nr)) + fakt("Zeichnungs-Nr. / Index", esc(zeichnung))
    + fakt("Kunden Art. Nr.", esc(k.kunden_art)) + fakt("Bestellte Menge", zahl(k.bestellt)) + fakt("Gelieferte Menge", zahl(w.menge_geliefert))
    + fakt("Retournierte Menge", zahl(k.retour)) + fakt("Lieferschein Nr.", esc(k.lieferschein)) + fakt("Lieferdatum", datum(k.lieferdatum))
    + fakt("Fabrikationsauftrag", esc(w.fa_nr)) + fakt("Beanstandungsmenge", zahl(w.menge_reklamiert)) + fakt("Gutteile", zahl(k.gut))
    + "</div></section>";
  for (const a of ACHT_D) h += abschnitt(w, a);
  // Schluss (seit 1.825.0, Wunsch Patrick 25. November 2026: „ganz am
  // Schluss nur Name und Datum normal von uns, keine zweite Linie für den
  // Kunden“): eine Zeile Hofer + Co., Name und Datum in normaler Schrift
  h += '<div class="schluss"><b>Hofer + Co.</b>' + (leer(k.bearbeiter) ? "" : " · " + esc(k.bearbeiter))
    + " · " + datum(k.berichtsdatum || alt.isoDatum(new Date())) + "</div>";
  return h + "</div>";
}

// Vorschau neben dem Formular: der Teil des gerade offenen Schritts ist hervorgehoben
export function achtdVorschau(w, teil) {
  const hervor = teil ? '#rk-vorschau .rkpdf section[data-s="' + teil + '"] { background: #fff6cc; box-shadow: 0 0 0 2mm #fff6cc; border-radius: 2mm; }' : "";
  return '<div class="rkpdf"><style>' + STIL + hervor + "</style>" + achtdHtml(w) + "</div>";
}

// Schreibschrift für die Unterschrift einmal laden (Google Fonts wie im
// Bestellblatt); das PDF wartet höchstens vier Sekunden darauf
export async function unterschriftSchrift() {
  if (!document.getElementById("schrift-alexbrush")) {
    const l = document.createElement("link");
    l.id = "schrift-alexbrush"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap";
    document.head.appendChild(l);
  }
  try {
    await Promise.race([document.fonts.load('24pt "Alex Brush"'), new Promise((ok) => setTimeout(ok, 4000))]);
  } catch (f) { /* dann eine andere Schreibschrift */ }
}
