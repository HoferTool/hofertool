// =================================================================
//  PDF „Tagessummen“ für den gewählten Zeitraum (seit 1.628.0, Wunsch
//  Patrick 18. November 2026: „ich brauche noch einen PDF-Export für den
//  angewählten Zeitraum“, mit Bild des Blatts aus dem bisherigen System).
//  Je Person eine Seite (oder mehr): Tag für Tag Soll, Ist, Differenz,
//  Gleitzeit-Stand am Abend, Ferien übrig und Stempelungen, darunter
//  Total, Saldo am Tag vor dem Zeitraum und am letzten Tag und Summen je
//  Art (Anwesend, Abwesend Krankheit …). Neuester Tag oben wie im Vorbild.
//  Gerechnet mit denselben Bausteinen wie die Seite einer Person.
// =================================================================
import { alt } from "../../bruecke.jsx";
import {
  paareRechnen, tageRechnen, feiertageEintragen, abwesendeTage, sollTag, sollJeTag, freierTag, ferienStand, tagVon, uhrzeit,
  minutenJeFerientag, stempelartName, sollBisher,
} from "../../daten/zeit.js";
import { ABW_NAMEN } from "../../daten/zeitAuswertung.js";

const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const e = (t) => String(t ?? "").replace(/[&<>"']/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[z]));
const d8 = (iso) => iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(2, 4);
const d10 = (iso) => iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4);
// Minuten als 8:34, mit Vorzeichen auf Wunsch
function hm(min, zeichen) {
  if (min === null || min === undefined) return "";
  const m = Math.round(min);
  const v = m < 0 ? "-" : (zeichen && m > 0 ? "+" : "");
  const a = Math.abs(m);
  return v + Math.floor(a / 60) + ":" + String(a % 60).padStart(2, "0");
}
const tg = (n) => alt.zahlText(Math.round(n * 10) / 10);

// x: { name, abteilung, einst, stempel, ferien, buchungen }; von, bis: ISO, bis ausschliesslich
export function tagessummen(x, von, bis, stufen) {
  const heute = alt.isoDatum(new Date());
  const einst = x.einst;
  const monat = !!einst && einst.lohnart !== "stunde";
  const tage = tageRechnen(paareRechnen(x.stempel || []), x.einst || null);
  const abw = feiertageEintragen(abwesendeTage(x.ferien || []), tage);
  const erster = (einst && einst.saldo_start_tag) || (x.stempel && x.stempel[0] ? tagVon(x.stempel[0].zeit) : null);
  const ende = [alt.plusTage(bis, -1), heute].sort()[0];
  const buch = x.buchungen || [];

  // Gleitzeit am Abend jedes Tags, ab Beginn der Erfassung (wie saldoRechnen)
  const gz = new Map();
  if (monat && erster) {
    let min = Number(einst.saldo_start_min) || 0;
    for (let d = erster; d <= ende; d = alt.plusTage(d, 1)) {
      for (const b of buch) if (b.datum === d) min += Number(b.minuten) || 0;
      const ist = tage.get(d) ? tage.get(d).minuten : 0;
      min += ist - sollBisher(d, heute, einst, abw, ist);
      gz.set(d, min);
    }
  }
  const gzVor = (d) => (gz.has(d) ? gz.get(d) : (monat && erster && d < erster ? Number(einst.saldo_start_min) || 0 : null));
  // Ferien übrig am Abend (Anspruch minus bis dahin bezogen, ohne Geplantes)
  const ferienAm = (d) => {
    const f = ferienStand(einst, abw, Number(d.slice(0, 4)), d, { stufen, buchungen: buch });
    return Math.round((f.anspruch - f.bezogen) * 10) / 10;
  };

  const zeilen = [];
  let sIst = 0, sSoll = 0, ferienBezug = 0;
  const arten = {};
  const stempelArten = {};
  for (let d = von; d <= ende; d = alt.plusTage(d, 1)) {
    const t = tage.get(d);
    const ist = t ? t.minuten : 0;
    const soll = monat && d < heute && erster && d >= erster ? sollTag(d, einst, abw) : 0;
    const a = abw.get(d);
    const zaehlt = a && !freierTag(d) && (!monat || sollJeTag(einst, d) > 0);
    if (zaehlt) {
      const tagMin = sollJeTag(einst, d) || minutenJeFerientag(einst);
      arten[a] = arten[a] || { tage: 0, min: 0 };
      arten[a].tage++; arten[a].min += tagMin;
      if (a === "ferien") ferienBezug++;
    }
    sIst += ist; sSoll += soll;
    const paare = t ? t.paare.map((p) => (p.kommen ? uhrzeit(p.kommen.zeit) : "?") + "-" + (p.gehen ? uhrzeit(p.gehen.zeit) : (p.laeuft ? "jetzt" : "?"))
      + (p.stempelart ? " " + stempelartName(p.stempelart) : "")).join(", ") : "";
    // Stunden mit Stempelart (Rest vom Tag krank …) als eigene Buchungsart
    if (t && t.arten) Object.entries(t.arten).forEach(([sa, m]) => {
      const k = "stempel:" + sa;
      stempelArten[k] = stempelArten[k] || { name: stempelartName(sa), min: 0 };
      stempelArten[k].min += m;
    });
    zeilen.push({
      tag: d, wt: WT[alt.ausIso(d).getDay()], frei: freierTag(d), soll, ist,
      diff: soll || ist ? ist - soll : null, gz: gzVor(d), ferien: ferienAm(d),
      bem: [paare, t && t.gutschrift ? "Spätschicht +" + hm(t.gutschrift) : "", zaehlt ? ABW_NAMEN[a] || a : (a === "feiertag" ? "Feiertag" : "")].filter(Boolean).join(", "),
      fehler: !!(t && t.fehler),
    });
  }
  const vorTag = alt.plusTage(von, -1);
  return {
    name: x.name, abteilung: x.abteilung, monat, von, bis: alt.plusTage(bis, -1), ende,
    zeilen: zeilen.reverse(), ist: sIst, soll: sSoll, ferienBezug, arten, stempelArten,
    gzVor: gzVor(vorTag), gzEnde: gzVor(ende), ferienVor: ferienAm(vorTag), ferienEnde: ferienAm(ende),
    tagMin: minutenJeFerientag(einst),
  };
}

const STIL = `
.ts h1{font-size:17pt;font-weight:normal;margin:0 0 8px}
.ts .ts-kopf{font-weight:bold;margin:2px 0}
.ts .ts-zr{display:flex;gap:40px;font-weight:bold;margin:4px 0 8px}
.ts table{border-collapse:collapse;width:100%;margin:0}
.ts th,.ts td{border:none;padding:1.5px 4px;font-size:8.5pt;vertical-align:top;text-align:left}
.ts thead th{border-bottom:1.5px solid #333;font-weight:bold}
.ts tbody tr:nth-child(even) td{background:#f1f3f5}
.ts .r{text-align:right;white-space:nowrap}
.ts .frei td{color:#777}
.ts .fehler td{color:#b00020}
.ts .ts-total td{border-top:1.5px solid #333;font-weight:bold;padding-top:5px;background:#fff!important}
.ts .ts-saldo{margin-top:10px;border-top:1.5px solid #333}
.ts .ts-saldo td,.ts .ts-saldo th{background:#fff!important}
.ts h3{font-size:10pt;margin:14px 0 3px;border-bottom:1.5px solid #333;padding-bottom:2px}
`;

function blattHtml(t, erstes) {
  const ftxt = (n) => tg(n) + " T";
  let vorGz = null, vorFe = null;
  // Gleiche Werte wie in der Zeile darunter (Vortag) als ″ wie im Vorbild
  const rows = t.zeilen.map((z, i) => {
    const naechste = t.zeilen[i + 1];
    const gzT = z.gz === null ? "" : (naechste && naechste.gz === z.gz ? "″" : hm(z.gz));
    const feT = naechste && naechste.ferien === z.ferien ? "″" : ftxt(z.ferien);
    vorGz = z.gz; vorFe = z.ferien;
    return "<tr class='" + (z.fehler ? "fehler" : z.frei ? "frei" : "") + "'><td>" + z.wt + "</td><td>" + d8(z.tag) + "</td>"
      + "<td class='r'>" + (t.monat && z.soll ? hm(z.soll) : "") + "</td><td class='r'>" + (z.ist ? hm(z.ist) : "") + "</td>"
      + "<td class='r'>" + (t.monat && z.diff !== null ? hm(z.diff, true) : "") + "</td>"
      + "<td class='r'>" + (t.monat ? gzT : "") + "</td><td class='r'>" + feT + "</td><td>" + e(z.bem) + (z.fehler ? " (Stempelung fehlt)" : "") + "</td></tr>";
  }).join("");
  const arten = Object.entries(t.arten).sort((a, b) => b[1].tage - a[1].tage);
  return "<div class='ts" + (erstes ? "" : " pdf-neue-seite") + "'>"
    + "<div class='ck-titel'><h1>Tagessummen</h1></div>"
    + "<div class='ts-kopf'>" + e(t.name) + (t.abteilung ? " (" + e(t.abteilung) + ")" : "") + "</div>"
    + "<div class='ts-zr'><span>Zeitraum</span><span>" + WT[alt.ausIso(t.von).getDay()] + ", " + d8(t.von) + " - " + WT[alt.ausIso(t.bis).getDay()] + ", " + d8(t.bis) + "</span></div>"
    + "<table><thead><tr><th colspan='2'>Datum</th><th class='r'>Soll</th><th class='r'>Ist</th><th class='r'>Diff.</th><th class='r'>GZ</th><th class='r'>Ferien</th><th>Bemerkungen</th></tr></thead><tbody>"
    + (rows || "<tr><td colspan='8'>Keine Tage im Zeitraum.</td></tr>")
    + "<tr class='ts-total'><td colspan='2'>Total:</td><td class='r'>" + (t.monat ? hm(t.soll) : "") + "</td><td class='r'>" + hm(t.ist) + "</td><td class='r'>"
    + (t.monat ? hm(t.ist - t.soll, true) : "") + "</td><td></td><td class='r' colspan='2'>Ferienbezug: " + tg(t.ferienBezug) + " Tage</td></tr>"
    + "</tbody></table>"
    + "<table class='ts-saldo'><thead><tr><th>Saldo per</th><th class='r'>" + d10(alt.plusTage(t.von, -1)) + "</th><th class='r'>" + d10(t.ende) + "</th><th class='r'>Differenz</th></tr></thead><tbody>"
    + (t.monat ? "<tr><td>Gleitzeit (GZ)</td><td class='r'>" + hm(t.gzVor) + "</td><td class='r'>" + hm(t.gzEnde) + "</td><td class='r'>"
      + (t.gzVor !== null && t.gzEnde !== null ? hm(t.gzEnde - t.gzVor, true) : "") + "</td></tr>" : "")
    + "<tr><td>Ferien (Tage übrig)</td><td class='r'>" + tg(t.ferienVor) + "</td><td class='r'>" + tg(t.ferienEnde) + "</td><td class='r'>" + tg(t.ferienEnde - t.ferienVor) + "</td></tr>"
    + "</tbody></table>"
    + "<h3>Summen pro Buchungsart</h3><table><tbody>"
    + arten.map(([a, v]) => "<tr><td>Abwesend " + e(ABW_NAMEN[a] || a) + "</td><td class='r'>" + v.tage + (v.tage === 1 ? " Tag" : " Tage") + "</td><td class='r'>" + hm(v.min) + "</td></tr>").join("")
    + Object.values(t.stempelArten || {}).map((v) => "<tr><td>Gestempelt " + e(v.name) + "</td><td></td><td class='r'>" + hm(v.min) + "</td></tr>").join("")
    + "<tr><td>Anwesend</td><td></td><td class='r'>" + hm(t.ist) + "</td></tr>"
    + "</tbody></table></div>";
}

// liste: Personen wie für tagessummen; lädt das PDF herunter
export async function tagessummenPdf(liste, von, bis, stufen) {
  const { pdfAusHtml } = await import("../qmAlt/checklistePdf.js");
  const blaetter = liste.map((x) => tagessummen(x, von, bis, stufen));
  const html = "<style>" + STIL + "</style>" + blaetter.map((t, i) => blattHtml(t, i === 0)).join("");
  const titel = "HOFERTIME Tagessummen " + d10(von) + " - " + d10(alt.plusTage(bis, -1));
  const blob = await pdfAusHtml(html, titel);
  const name = (liste.length === 1 ? "Tagessummen " + liste[0].name : "HOFERTIME Tagessummen") + " " + von + " bis " + alt.plusTage(bis, -1) + ".pdf";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name.replace(/[\\/:*?"<>|]/g, "");
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return blob;
}
