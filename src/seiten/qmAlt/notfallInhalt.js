// =================================================================
//  QMS-Notfallplan (seit 1.484.0): was in die tägliche PDF-Kopie kommt.
//
//  Wunsch Patrick 11. November 2026: „Notfallplan für das QM System …
//  alles in PDF-Form abgelegt, im Falle eines Datenverlusts … täglich
//  ablegen inkl. Ordnerstruktur, damit ich diese auf dem Server als Kopie
//  habe“.
//
//  Gibt eine Liste von Dateien zurück: { pfad: [Ordner…, Datei], html }
//  zum Zeichnen (pdfAusHtml) oder { pfad, url } zum Kopieren (Berichte,
//  die schon als PDF in der Ablage liegen). Ablegen: src/teile/qmsPdf.js.
// =================================================================
import { alt } from "../../bruecke.jsx";
import {
  ARTEN, ABSCHNITTE, PROZESS_GRUPPEN, PROZESS_FELDER, QM_SYSTEM, ebeneVon, prozessNr, prozesseSortiert, normPruefen, deckt,
  statusVon, auswahlText, risikoErst, risikoWert, hatNeu, checklistenVon, abwTyp, abwHerkunft, auditBereiche,
} from "../../daten/qmAlt.js";
import { lbHtml } from "./Lieferanten.jsx";

const e = (t) => alt.esc(t == null ? "" : String(t));
const zeilen = (t) => e(t).replace(/\n/g, "<br>");
const datum = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || "") ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : iso || "");
// Zeichen, die Windows im Dateinamen nicht mag
export const dateiName = (t) => String(t || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 120) || "ohne Name";

const kopf = (titel, unter, stand) => "<div class='ck-titel'><div><h1>" + e(titel) + "</h1><div class='ck-unter'>" + e(unter || "")
  + "</div></div><div class='ck-firma'>Hofer + Co<br>Präzisionsdrehteile</div></div>"
  + "<p class='ck-klein'>Notfallkopie aus dem HoferTool, Stand " + e(stand) + ". Massgebend ist das HoferTool; dieses Blatt gilt nur, wenn es nicht erreichbar ist.</p>";

// Wert eines Felds als Text, wie in der Liste
function feldText(art, f, d) {
  const w = d[f.k];
  if (w == null || w === "") return "";
  if (f.auswahl) return auswahlText(art, f.k, w);
  if (f.typ === "date") return datum(w);
  if (f.typ === "haken") return w ? "ja" : "nein";
  return String(w);
}

// Eine Liste: oben die Übersicht, darunter jeder Eintrag mit allen Feldern
function listeHtml(art, eintraege, alle, stand) {
  const cfg = ARTEN[art];
  const liste = eintraege.filter((x) => x.art === art).sort((a, b) => (a.nr || 0) - (b.nr || 0));
  let h = kopf(cfg.titel, "ISO 9001 " + cfg.norm + " · " + liste.length + " Einträge", stand);
  if (!liste.length) return h + "<p>Keine Einträge.</p>";
  h += "<h2>Übersicht</h2><table><thead><tr><th>Nr.</th><th>Titel</th><th>Status</th><th>Fällig</th></tr></thead><tbody>"
    + liste.map((x) => "<tr><td class='ck-nw'>" + e(x.nr || "") + "</td><td>" + e(x.titel) + "</td><td>" + e(statusVon(art, x.status).text)
      + "</td><td class='ck-nw'>" + e(datum(x.faellig)) + "</td></tr>").join("") + "</tbody></table>";
  for (const x of liste) {
    const d = x.daten || {};
    h += "<h3>" + e((x.nr ? x.nr + ". " : "") + (x.titel || "ohne Titel")) + "</h3><table><tbody>";
    h += "<tr><th style='width:28%'>Status</th><td>" + e(statusVon(art, x.status).text) + (x.faellig ? " · fällig " + e(datum(x.faellig)) : "") + "</td></tr>";
    if (art === "abweichung") { const hk = abwHerkunft(x, alle); h += "<tr><th>Herkunft</th><td>" + e([hk.modul, hk.text].filter(Boolean).join(": ")) + " · " + e(auswahlText("abweichung", "typ", abwTyp(x))) + "</td></tr>"; }
    if (art === "risiko") h += "<tr><th>Bewertung</th><td>Erst " + e(risikoErst(d) || "–") + (hatNeu(d) ? " · neu " + e(risikoWert(d)) : "") + "</td></tr>";
    for (const f of cfg.felder) {
      const t = feldText(art, f, d);
      if (t && f.k !== "titel") h += "<tr><th>" + e(f.text) + "</th><td>" + zeilen(t) + "</td></tr>";
    }
    if (art === "lieferant" && d.verlauf) {
      for (const j of Object.keys(d.verlauf).sort()) {
        const v = d.verlauf[j] || {};
        h += "<tr><th>Bewertung " + e(j) + "</th><td>" + e(v.punkte || "–") + " Punkte" + (v.bemerkung ? " · " + zeilen(v.bemerkung) : "") + "</td></tr>";
      }
    }
    if (d.bericht_name || d.bericht_url) h += "<tr><th>Bericht</th><td>" + e(d.bericht_name || "PDF") + " (im Ordner Audits bzw. Managementbewertung)</td></tr>";
    h += "</tbody></table>";
  }
  return h;
}

function handbuchHtml(texte, stand) {
  let h = kopf("Managementhandbuch", "ISO 9001:2026", stand);
  for (const a of ABSCHNITTE) {
    const t = texte[a.k];
    h += "<h2>" + e(a.titel) + " <span class='ck-klein'>ISO " + e(a.norm) + "</span></h2><p>" + (zeilen(t && t.inhalt) || "–") + "</p>";
  }
  const land = (texte.landkarte && texte.landkarte.felder) || {};
  if (land.parteien) h += "<h2>Interessierte Parteien (Landkarte)</h2><p>" + e(land.parteien.join(", ")) + "</p>";
  h += "<h2>Normkorrelation <span class='ck-klein'>ISO 4.4</span></h2><table><thead><tr><th>Kapitel</th><th>Thema</th><th>Prozesse</th><th>QM-System</th></tr></thead><tbody>";
  for (const z of normPruefen(texte, [])) {
    const qm = QM_SYSTEM.filter((q) => deckt(q.norm, z.norm)).map((q) => q.text).join(", ");
    h += "<tr><td class='ck-nw'>" + e(z.norm) + "</td><td>" + e(z.titel) + "</td><td>" + (z.norm === "8.3" ? "nicht anwendbar"
      : e(z.prozesse.map((p) => (prozessNr(p) ? prozessNr(p) + " " : "") + p.titel).join(", ") || "–")) + "</td><td>" + e(qm || "–") + "</td></tr>";
  }
  return h + "</tbody></table>";
}

function prozessHtml(p, stand) {
  let h = kopf((prozessNr(p) ? prozessNr(p) + " " : "") + p.titel, "Prozessblatt" + (p.norm ? " · ISO " + p.norm : ""), stand);
  h += "<table><tbody>";
  for (const x of PROZESS_FELDER) h += "<tr><th style='width:26%'>" + e(x.text) + "</th><td>" + (zeilen((p.felder || {})[x.k]) || "–") + "</td></tr>";
  return h + "</tbody></table>";
}

function organigrammHtml(texte, stand) {
  const f = (texte.organigramm && texte.organigramm.felder) || {};
  const leute = f.personen || [];
  let h = kopf("Organigramm", "ISO 5.3" + (f.stand ? " · " + f.stand : ""), stand);
  if (!leute.length) return h + "<p>Kein Organigramm erfasst.</p>";
  h += "<table><thead><tr><th>Bereich</th><th>Name</th><th>Rolle</th><th>Mail</th><th>Telefon</th><th>Stv.</th></tr></thead><tbody>"
    + leute.map((x) => "<tr>" + ["bereich", "name", "rolle", "mail", "tel", "stv"].map((k) => "<td>" + e(x[k] || "") + "</td>").join("") + "</tr>").join("");
  return h + "</tbody></table>";
}

function matrixHtml(texte, eintraege, stand) {
  const m = (texte.matrix && texte.matrix.felder) || {};
  const pers = m.personen || [], faeh = m.faehigkeiten || [], w = m.werte || {};
  let h = kopf("Kompetenzmatrix", "ISO 7.2 · – keine, ◔ lernt, ◑ selbständig, ● kann schulen", stand);
  if (pers.length && faeh.length) {
    h += "<table class='ck-zahlen'><thead><tr><th>Fähigkeit</th>" + pers.map((p) => "<th>" + e(p.name) + "</th>").join("") + "</tr></thead><tbody>"
      + faeh.map((f) => "<tr><th>" + e(f.name) + "</th>" + pers.map((p) => "<td>" + ["–", "◔", "◑", "●"][w[p.id + "|" + f.id] || 0] + "</td>").join("") + "</tr>").join("")
      + "</tbody></table>";
  } else h += "<p>Keine Matrix erfasst.</p>";
  return h + listeHtml("schulung", eintraege, eintraege, stand).replace(/^[\s\S]*?<\/p>/, "<h2>Schulungen</h2>");
}

function auditplanHtml(eintraege, stand) {
  const audits = eintraege.filter((x) => x.art === "audit")
    .sort((a, b) => String(a.daten.datum || a.daten.quartal || "").localeCompare(String(b.daten.datum || b.daten.quartal || "")));
  let h = kopf("Auditplan", "ISO 9.2 · Bereiche: " + auditBereiche().join(", "), stand);
  h += "<table><thead><tr><th>Datum / Quartal</th><th>Art</th><th>Bereich</th><th>Thema</th><th>Auditor</th><th>Status</th></tr></thead><tbody>"
    + audits.map((x) => "<tr><td class='ck-nw'>" + e(datum(x.daten.datum) || x.daten.quartal || "") + "</td><td>" + e(auswahlText("audit", "art", x.daten.art))
      + "</td><td>" + e([x.daten.bereich, x.daten.weitere].filter(Boolean).join(", ")) + "</td><td>" + e(x.titel) + "</td><td>" + e(x.daten.auditor || "")
      + "</td><td>" + e(statusVon("audit", x.status).text) + "</td></tr>").join("");
  return h + "</tbody></table>";
}

function checklisteHtml(c, stand) {
  const fragen = (c.felder && c.felder.fragen) || [];
  let h = kopf("Auditcheckliste " + (c.titel || ""), fragen.length + " Fragen, je Frage mit den wechselnden Fassungen", stand);
  h += "<table><thead><tr><th>Norm</th><th>Thema</th><th>Frage</th><th>Nachweis</th></tr></thead><tbody>";
  for (const f of fragen) {
    h += "<tr><td class='ck-nw'>" + e(f.norm || "") + "</td><td>" + e(f.thema || "") + "</td><td>" + zeilen(f.frage || "") + "</td><td>" + zeilen(f.nachweis || "") + "</td></tr>";
    for (const v of f.varianten || []) h += "<tr><td></td><td class='ck-klein'>andere Fassung</td><td>" + zeilen(v.frage || "") + "</td><td>" + zeilen(v.nachweis || "") + "</td></tr>";
  }
  return h + "</tbody></table>";
}

function lieferantenJahr(texte, eintraege, jahr) {
  const liste = (texte["lieferanten:" + jahr] || {}).felder || {};
  const z = eintraege.filter((x) => x.art === "lieferant" && (x.daten.verlauf || {})[jahr]).map((x) => {
    const y = (liste.liste || []).find((l) => l.nr === String(x.daten.nr || "")) || {};
    return { titel: x.titel, nr: x.daten.nr, anteil: y.anteil, v: x.daten.verlauf[jahr] };
  }).sort((a, b) => (b.anteil || 0) - (a.anteil || 0));
  return lbHtml(jahr, z, liste);
}

function inhaltHtml(dateien, stand) {
  let h = kopf("QMS Notfallplan", "Inhalt dieser Kopie und Vorgehen bei Datenverlust", stand);
  h += "<h2>Wenn das HoferTool nicht erreichbar ist</h2><table><tbody>"
    + "<tr><th style='width:26%'>1. Nachsehen</th><td>Alle Inhalte des QMS stehen hier als PDF: Handbuch und Prozesse, alle Listen, Auditplan und Berichte, Managementbewertungen, Lieferantenbewertungen, Checklisten. Diese Kopie wird jeden Tag neu abgelegt, die Ordner der letzten Tage bleiben.</td></tr>"
    + "<tr><th>2. Weiterarbeiten</th><td>Neue Abweichungen, Massnahmen und Prüfungen bis zur Wiederherstellung auf Papier oder in einer Liste festhalten und danach im HoferTool nachtragen.</td></tr>"
    + "<tr><th>3. Wiederherstellen</th><td>Die tägliche Sicherung des HoferTools zurückspielen (Einstellungen → Backup → Zurückspielen). Fehlt auch sie, die Inhalte aus diesen PDFs neu erfassen.</td></tr>"
    + "<tr><th>4. Audit</th><td>Einem Auditor können diese PDFs als Nachweis gezeigt werden, wenn das HoferTool nicht läuft.</td></tr>"
    + "</tbody></table><h2>Dateien</h2><table><thead><tr><th>Ordner</th><th>Datei</th></tr></thead><tbody>"
    + dateien.map((d) => "<tr><td>" + e(d.pfad.slice(0, -1).join(" \\ ")) + "</td><td>" + e(d.pfad[d.pfad.length - 1]) + "</td></tr>").join("");
  return h + "</tbody></table>";
}

export function notfallDateien(daten, stand) {
  const { texte, eintraege } = daten;
  const aus = [];
  const html = (pfad, h, fuss) => aus.push({ pfad, html: h, fuss });
  // 01 Handbuch
  html(["01 Handbuch", "Managementhandbuch.pdf"], handbuchHtml(texte, stand), "Managementhandbuch");
  html(["01 Handbuch", "Organigramm.pdf"], organigrammHtml(texte, stand), "Organigramm");
  for (const p of prozesseSortiert(texte)) {
    const g = (PROZESS_GRUPPEN.find(([k]) => k === ebeneVon(p)) || [, "Prozesse"])[1];
    html(["01 Handbuch", "Prozesse", dateiName(g), dateiName((prozessNr(p) ? prozessNr(p) + " " : "") + p.titel) + ".pdf"], prozessHtml(p, stand), "Prozess " + (prozessNr(p) || p.titel));
  }
  // 02 Listen
  ["abweichung", "ziel", "risiko", "pruefmittel"].forEach((art, i) =>
    html(["02 Listen", dateiName(String(i + 1).padStart(2, "0") + " " + ARTEN[art].titel) + ".pdf"], listeHtml(art, eintraege, eintraege, stand), ARTEN[art].titel));
  // 03 Kompetenzen
  html(["03 Kompetenzen", "Kompetenzmatrix und Schulungen.pdf"], matrixHtml(texte, eintraege, stand), "Kompetenzen");
  // 04 Audits: Plan, Liste, je Jahr die Berichte, Checklisten
  html(["04 Audits", "Auditplan.pdf"], auditplanHtml(eintraege, stand), "Auditplan");
  html(["04 Audits", "Audits mit Feststellungen.pdf"], listeHtml("audit", eintraege, eintraege, stand), "Audits");
  for (const x of eintraege.filter((y) => y.art === "audit" && y.daten.bericht_url)) {
    const j = String(x.daten.datum || x.daten.quartal || "ohne Jahr").slice(0, 4);
    aus.push({ pfad: ["04 Audits", "Berichte " + j, dateiName((x.daten.datum || "") + " " + auswahlText("audit", "art", x.daten.art) + " " + x.titel) + ".pdf"], url: x.daten.bericht_url });
  }
  for (const c of checklistenVon(texte)) html(["04 Audits", "Checklisten", dateiName(c.titel || c.schluessel) + ".pdf"], checklisteHtml(c, stand), "Checkliste " + (c.titel || ""));
  // 05 Managementbewertung
  for (const x of eintraege.filter((y) => y.art === "bewertung" && y.daten.bericht_url)) {
    aus.push({ pfad: ["05 Managementbewertung", dateiName("Managementbewertung " + (x.daten.jahr || "")) + ".pdf"], url: x.daten.bericht_url });
  }
  // 06 Lieferanten
  html(["06 Lieferanten", "Lieferanten.pdf"], listeHtml("lieferant", eintraege, eintraege, stand), "Lieferanten");
  const jahre = new Set();
  Object.keys(texte).forEach((k) => { if (/^lieferanten:\d{4}$/.test(k)) jahre.add(k.slice(12)); });
  eintraege.forEach((x) => { if (x.art === "lieferant") Object.keys(x.daten.verlauf || {}).forEach((j) => jahre.add(j)); });
  for (const j of [...jahre].sort()) html(["06 Lieferanten", "Lieferantenbewertung " + j + ".pdf"], lieferantenJahr(texte, eintraege, j), "Lieferantenbewertung " + j);
  // Inhalt zuerst
  aus.unshift({ pfad: ["00 Notfallplan und Inhalt.pdf"], html: inhaltHtml(aus, stand), fuss: "QMS Notfallplan" });
  return aus;
}
