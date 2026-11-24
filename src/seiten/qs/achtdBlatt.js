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
.rkpdf .streifen { height: 1.6mm; background: linear-gradient(90deg, #003884 0, #2f6fd0 55%, #e8730c 100%); }
.rkpdf .inhalt { padding: 7mm 13mm 2mm; }
.rkpdf p { margin: 0 0 1mm; }
.rkpdf .titel { display: flex; justify-content: space-between; align-items: flex-end; gap: 4mm; margin-bottom: 5mm; }
.rkpdf .titel .klein { font-size: 7.5pt; letter-spacing: .18em; color: #6b7890; font-weight: 700; text-transform: uppercase; }
.rkpdf .titel h1 { margin: 0; font-size: 25pt; line-height: 1.05; color: #003884; letter-spacing: -.01em; }
.rkpdf .titel h1 b { color: #e8730c; }
.rkpdf .titel .unter { font-size: 10pt; color: #33405a; margin-top: 1mm; }
.rkpdf .chips { display: flex; gap: 1.5mm; justify-content: flex-end; margin-bottom: 2mm; }
.rkpdf .chip { font-size: 7.5pt; font-weight: 700; padding: 1mm 3mm; border-radius: 10mm; border: .6pt solid #c8d2e2; color: #8a93a3; white-space: nowrap; }
.rkpdf .chip.an { background: #003884; color: #fff; border-color: #003884; }
.rkpdf .chip.rot { background: #c8322a; color: #fff; border-color: #c8322a; }
.rkpdf .datum { text-align: right; font-size: 8pt; color: #6b7890; white-space: nowrap; }
.rkpdf .kacheln { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.5mm; margin-bottom: 4mm; }
.rkpdf .kachel { background: #f1f5fb; border-radius: 2.5mm; padding: 2.5mm 3mm; border-top: 1.2mm solid #003884; }
.rkpdf .kachel.rot { border-top-color: #c8322a; } .rkpdf .kachel.org { border-top-color: #e8730c; } .rkpdf .kachel.gr { border-top-color: #2f9e5b; }
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
.rkpdf .sk .nr { width: 7.5mm; height: 7.5mm; border-radius: 2mm; background: #003884; color: #fff; font-weight: 700; font-size: 10pt;
  display: flex; align-items: center; justify-content: center; flex: none; }
.rkpdf .sk h2 { margin: 0; font-size: 11pt; color: #003884; }
.rkpdf .karte { background: #f7f9fc; border-left: 1mm solid #003884; border-radius: 0 2.5mm 2.5mm 0; padding: 2.5mm 4mm; }
.rkpdf .ursache .nr { background: #e8730c; } .rkpdf .ursache .karte { border-left-color: #e8730c; background: #fff7f0; }
.rkpdf .ursache h2 { color: #b85a08; }
.rkpdf .gruppe { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #6b7890; margin: 1.2mm 0 .5mm; }
.rkpdf ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: .6mm 5mm; }
.rkpdf li { display: flex; gap: 2mm; align-items: flex-start; }
.rkpdf i.ok { flex: none; width: 3.8mm; height: 3.8mm; border-radius: 1mm; background: #003884; color: #fff; font-style: normal;
  font-size: 7pt; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-top: .4mm; }
.rkpdf .ursache i.ok { background: #e8730c; }
.rkpdf .frei { white-space: normal; }
.rkpdf ul + .frei, .rkpdf .gruppe ~ .frei { margin-top: 1.8mm; padding-top: 1.8mm; border-top: .5pt dashed #c8d2e2; }
.rkpdf .nichts { color: #8a93a3; font-style: italic; margin: 0; }
.rkpdf .wirk { display: flex; gap: 3mm; align-items: center; margin-top: 2mm; }
.rkpdf .stempel { border: 1pt solid #2f9e5b; color: #2f9e5b; font-weight: 700; border-radius: 1.5mm; padding: 1mm 3mm; font-size: 8.5pt; }
.rkpdf .unterschrift { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 9mm; }
.rkpdf .unterschrift div { border-top: .6pt solid #33405a; padding-top: 1mm; font-size: 7.5pt; color: #6b7890; }
`;

function briefkopf() {
  return '<div class="balken">'
    + '<img src="' + (alt.LOGO_BRIEF || "./logo-weiss.svg") + '" alt="Hofer + Co.">'
    + '<div class="adresse"><span class="firma">Hofer + Co. Präzisionsdrehteile</span><br>'
    + 'Alte Bernstrasse 24<br><span class="ort">CH-4573 Lohn-Ammannsegg</span></div>'
    + '<div class="kontakt2"><span>T</span>032 677 55 77<br><span>F</span>032 677 55 70<br>'
    + 'admin@hoferco.ch<br>www.hoferco.ch</div>'
    + (alt.SIEGEL_BRIEF ? '<img class="briefsiegel" src="' + alt.SIEGEL_BRIEF + '" alt="ISO 9001">' : "")
    + '</div><div class="streifen"></div>';
}

const haken = (p) => '<li><i class="ok">✓</i><span>' + esc(p) + "</span></li>";
const fakt = (b, w) => "<div><span>" + esc(b) + "</span>" + (leer(w) ? "–" : w) + "</div>";
const sek = (s, nr, titel, inhalt, extra) => '<section class="sek' + (extra ? " " + extra : "") + '" data-s="' + s + '">'
  + '<div class="sk"><span class="nr">' + nr + "</span><h2>" + esc(titel) + '</h2></div><div class="karte">' + inhalt + "</div></section>";
const angekreuzt = (w, s) => (w.achtd && Array.isArray(w.achtd[s])) ? w.achtd[s] : [];
const WIRKSAM = "Wirksamkeit bei der nächsten Lieferung geprüft";

// Ein Abschnitt 2 bis 7: angekreuzte Punkte je Gruppe, dann der freie Text
function abschnitt(w, a) {
  const l = angekreuzt(w, a.s);
  const bekannt = new Set();
  let h = "";
  for (const [g, punkte] of a.gruppen) {
    punkte.forEach((p) => bekannt.add(p));
    const da = punkte.filter((p) => l.includes(p) && !(a.s === "d7" && p === WIRKSAM));
    if (!da.length) continue;
    if (g && a.pdfGruppen) h += '<p class="gruppe">' + esc(g) + "</p>";
    h += "<ul>" + da.map(haken).join("") + "</ul>";
  }
  const rest = l.filter((p) => !bekannt.has(p));
  if (rest.length) h += "<ul>" + rest.map(haken).join("") + "</ul>";
  if (!leer(w[a.text])) h += '<p class="frei">' + zl(w[a.text]) + "</p>";
  if (a.s === "d7" && l.includes(WIRKSAM)) h += '<div class="wirk"><span class="stempel">✓ WIRKSAM</span><span>' + esc(WIRKSAM) + "</span></div>";
  return sek(a.s, a.nr, a.titel, h || '<p class="nichts">–</p>', a.s === "d4" ? "ursache" : "");
}

// Ob ein Punkt 1 bis 8 schon etwas enthält (für die Leiste oben)
function ausgefuellt(w, nr) {
  if (nr === 1) return !leer(w.fehler);
  if (nr === 8) return !leer(w.bemerkung);
  const a = ACHT_D.find((x) => x.nr === nr);
  return !!a && (angekreuzt(w, a.s).length > 0 || !leer(w[a.text]));
}

export function achtdHtml(w) {
  const k = w.kopf || {};
  const kunde = w.art !== "lieferant";
  const hofer = '<div class="t">' + (kunde ? "Lieferant" : "Kunde") + '</div><p class="name">Hofer + Co. Präzisionsdrehteile</p>'
    + "<p>Alte Bernstrasse 24, CH-4573 Lohn-Ammannsegg</p>"
    + ([k.bearbeiter, k.tel].some((x) => !leer(x)) ? "<p>" + [k.bearbeiter, k.tel].filter((x) => !leer(x)).map(esc).join(" · ") + "</p>" : "")
    + (leer(k.mail) ? "" : "<p>" + esc(k.mail) + "</p>");
  const andere = '<div class="t">' + (kunde ? "Kunde" : "Lieferant") + '</div><p class="name">'
    + esc(w.partner || (w.art === "intern" ? "Intern" : "–")) + "</p>"
    + (leer(k.adresse) ? "" : "<p>" + zl(k.adresse) + "</p>")
    + (leer(w.kontakt) ? "" : "<p>" + esc(w.kontakt) + "</p>");
  const zeichnung = [k.zeichnung, k.index].filter((x) => !leer(x)).join(" / ");
  const unter = [w.partner, w.teil, leer(w.hoco_nr) ? "" : "HOCO " + w.hoco_nr].filter((x) => !leer(x)).map(esc).join(" · ");
  const st = w.status || "offen";
  const chips = (st === "abgelehnt" ? [["abgelehnt", "Abgelehnt"]] : [])
    .concat([["offen", "Offen"], ["bearbeitung", "In Bearbeitung"], ["abgeschlossen", "Abgeschlossen"]])
    .map(([s, t]) => '<span class="chip' + (s === st ? (s === "abgelehnt" ? " rot" : " an") : "") + '">' + t + "</span>").join("");
  const fa = angekreuzt(w, "fa");
  const fehlerart = fa.length ? fa.join(", ") : (w.fehlerart || "");
  const kachel = (art, k1, wert, text) => '<div class="kachel ' + art + '"><div class="k">' + k1 + '</div><div class="w' + (text ? " text" : "") + '">' + wert + "</div></div>";
  const ablauf = [[1, "Problem"], [2, "Fehlerart"], [3, "Fehlerort"], [4, "Ursache"], [5, "Sofort"], [6, "Geplant"], [7, "Eingeführt"], [8, "Bemerkung"]]
    .map(([n, t], i, l) => '<div class="p' + (ausgefuellt(w, n) ? "" : " offen") + '"><i>' + n + "</i><span>" + t + "</span></div>"
      + (i < l.length - 1 ? '<div class="l' + (ausgefuellt(w, n) && ausgefuellt(w, l[i + 1][0]) ? " voll" : "") + '"></div>' : "")).join("");
  const ref = (leer(w.nr) ? "" : esc(w.nr)) + (leer(w.ref_partner) ? "" : " · " + (kunde ? "Kunde" : "Lieferant") + ": " + esc(w.ref_partner));
  let h = briefkopf() + '<div class="inhalt">'
    + '<section data-s="kopf"><div class="titel"><div><div class="klein">Reklamation ' + esc(w.nr || "") + '</div><h1>8D-Report<b>.</b></h1>'
    + (unter ? '<div class="unter">' + unter + "</div>" : "") + "</div>"
    + '<div><div class="chips">' + chips + '</div><div class="datum">Berichtsdatum ' + datum(k.berichtsdatum || alt.isoDatum(new Date()))
    + (leer(k.bearbeiter) ? "" : " · Bearbeiter " + esc(k.bearbeiter)) + "</div></div></div>"
    + '<div class="kacheln">'
    + kachel("rot", "Beanstandet", leer(w.menge_reklamiert) ? "–" : zahl(w.menge_reklamiert) + " <small>Stk</small>")
    + kachel("gr", "Gutteile", leer(k.gut) ? "–" : zahl(k.gut) + (leer(w.menge_geliefert) ? "" : " <small>von " + zahl(w.menge_geliefert) + "</small>"))
    + kachel("org", "Fehlerart", leer(fehlerart) ? "–" : esc(fehlerart), true)
    + kachel("", w.termin ? "Termin" : "Eröffnet am", datum(w.termin || w.eingang) || "–")
    + "</div>"
    + '<div class="ablauf">' + ablauf + "</div>"
    + '<div class="zwei"><div class="adr">' + (kunde ? hofer : andere) + '</div><div class="adr">' + (kunde ? andere : hofer) + "</div></div>"
    + '<div class="fakten">' + fakt("Beanstand.-Nr.", ref) + fakt("Eröffnet am", datum(w.eingang)) + fakt("Auftrags Nr.", esc(k.auftrag)) + "</div>"
    + "</section>"
    + '<section data-s="artikel"><div class="fakten">'
    + fakt("Artikelbezeichnung", esc(w.teil)) + fakt("Artikelnummer Hoco", esc(w.hoco_nr)) + fakt("Zeichnungs-Nr. / Index", esc(zeichnung))
    + fakt("Kunden Art. Nr.", esc(k.kunden_art)) + fakt("Bestellte Menge", zahl(k.bestellt)) + fakt("Gelieferte Menge", zahl(w.menge_geliefert))
    + fakt("Retournierte Menge", zahl(k.retour)) + fakt("Lieferschein Nr.", esc(k.lieferschein)) + fakt("Lieferdatum", datum(k.lieferdatum))
    + fakt("Fabrikationsauftrag", esc(w.fa_nr)) + fakt("Beanstandungsmenge", zahl(w.menge_reklamiert)) + fakt("Gutteile", zahl(k.gut))
    + "</div></section>"
    + sek("d1", 1, "Problembeschreibung", leer(w.fehler) ? '<p class="nichts">–</p>' : '<p class="frei">' + zl(w.fehler) + "</p>");
  for (const a of ACHT_D) h += abschnitt(w, a);
  h += sek("bem", 8, "Bemerkung", leer(w.bemerkung) ? '<p class="nichts">–</p>' : '<p class="frei">' + zl(w.bemerkung) + "</p>");
  h += '<div class="unterschrift"><div>Datum, Unterschrift Hofer + Co.</div><div>Datum, Unterschrift '
    + (w.art === "intern" ? "Verantwortlich" : (kunde ? "Kunde" : "Lieferant")) + "</div></div>";
  return h + "</div>";
}

// Vorschau neben dem Formular: der Teil des gerade offenen Schritts ist hervorgehoben
export function achtdVorschau(w, teil) {
  const hervor = teil ? '#rk-vorschau .rkpdf section[data-s="' + teil + '"] { background: #fff6cc; box-shadow: 0 0 0 2mm #fff6cc; border-radius: 2mm; }' : "";
  return '<div class="rkpdf"><style>' + STIL + hervor + "</style>" + achtdHtml(w) + "</div>";
}
