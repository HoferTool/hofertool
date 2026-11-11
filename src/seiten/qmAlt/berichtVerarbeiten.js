// =================================================================
//  QMS: externen Auditbericht beim Zuordnen gleich verarbeiten (seit
//  1.482.0, Wunsch Patrick 11. November 2026: „wenn der nächste externe
//  Auditbericht zugeordnet wird, soll er automatisch verarbeitet werden“).
//
//  Gilt nur für externe Audits (Zertifizierung, Kunde) und PDFs mit Text.
//  Die App liest den Bericht (auditBericht.js), füllt leere Angaben am
//  Audit (Datum, Auditor, Norm, Ergebnis, Feststellungen), setzt es auf
//  „Durchgeführt“, legt jede Abweichung, Empfehlung und jeden Hinweis als
//  offenen Eintrag in die Liste Abweichungen (nur einmal je Audit, Merker
//  `uebertragen`) und terminiert das nächste Audit im Auditplan. Was schon
//  am Audit steht, bleibt.
// =================================================================
import { alt } from "../../bruecke.jsx";
import { pdfjs } from "../../teile/PdfAnsicht.jsx";
import { zeilenAusStuecken } from "../../daten/kreditoren.js";
import { berichtLesen, punktTitel } from "../../daten/auditBericht.js";
import { auditExtern, auditQuartal, eintragSpeichern, heute, plusTageIso } from "../../daten/qmAlt.js";

const leer = (x) => !String(x == null ? "" : x).trim();

export async function berichtZeilen(datei) {
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: new Uint8Array(await datei.arrayBuffer()), isEvalSupported: false }).promise;
  const zeilen = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 60); i++) {
    const s = await pdf.getPage(i);
    zeilen.push(...zeilenAusStuecken((await s.getTextContent()).items));
  }
  return zeilen;
}

export const istExternesAudit = (e) => ["zert", "kunde"].includes((e.daten || {}).art) || auditExtern(e);

// Gibt { daten, status, text } zurück oder null, wenn nichts zu lesen war
export async function externVerarbeiten(e, daten, datei, alle) {
  if (!istExternesAudit(e) || !/pdf$/i.test(datei.type || datei.name || "")) return null;
  let r;
  try { r = berichtLesen(await berichtZeilen(datei)); }
  catch (f) { alt.fehlerMerken && alt.fehlerMerken("Auditbericht lesen", String((f && f.message) || f)); return null; }
  if (!r.erkannt) return { daten, status: e.status, text: "Im Bericht war kein Text zu finden (eingescannt?), darum nur angehängt." };

  const d = { ...daten };
  if (leer(d.datum) && r.datum) d.datum = r.datum;
  if (leer(d.auditor) && r.auditor) d.auditor = r.auditor;
  if (leer(d.norm) && r.norm) d.norm = r.norm;
  if (leer(d.ergebnis) && r.ergebnis) d.ergebnis = r.ergebnis;
  const titel = r.punkte.map((p) => punktTitel(p, r.stelle));
  if (leer(d.feststellungen) && titel.length) d.feststellungen = titel.join("\n");
  d.bericht_gelesen = new Date().toISOString();
  const status = d.datum && d.datum <= heute() ? "durchgefuehrt" : e.status;

  // Feststellungen in die Liste Abweichungen, einmal je Audit
  let neu = 0;
  const bericht = "Auditbericht " + (e.titel || "") + (d.datum ? " " + d.datum.split("-").reverse().join(".") : "");
  let liste = [...alle];
  if (!d.uebertragen && r.punkte.length) {
    const vorNaechstem = r.naechstes && r.naechstes.datum && r.naechstes.datum > heute() ? plusTageIso(r.naechstes.datum, -30) : null;
    for (let i = 0; i < r.punkte.length; i++) {
      const p = r.punkte[i];
      const termin = p.art === "abweichung" ? plusTageIso(d.datum || heute(), 21) : (vorNaechstem && vorNaechstem > heute() ? vorNaechstem : plusTageIso(heute(), 90));
      const id = await eintragSpeichern("abweichung", null, {
        quelle: "audit", typ: p.art, datum: d.datum || heute(), titel: titel[i], termin,
        massnahme: titel[i].includes(p.text) ? null : "Laut Auditbericht: " + p.text,
        partner: r.auditor || null, herkunft: e.id, quelle_text: bericht }, "offen", liste);
      liste = [...liste, { art: "abweichung", nr: Math.max(0, ...liste.filter((x) => x.art === "abweichung").map((x) => x.nr || 0)) + 1, id }];
      neu++;
    }
    d.uebertragen = true;
  } else if (!r.punkte.length && !d.uebertragen) d.uebertragen = true;

  // Nächstes Audit im Plan terminieren
  let plan = "";
  if (r.naechstes && r.naechstes.datum && r.naechstes.datum > (d.datum || "")) {
    const q = auditQuartal({ daten: { datum: r.naechstes.datum } });
    const da = alle.find((x) => x.art === "audit" && x.id !== e.id && istExternesAudit(x) && (x.daten.art || "") === (d.art || "zert") && auditQuartal(x) === q);
    const wann = r.naechstes.datum.split("-").reverse().join(".");
    if (da) {
      if (leer(da.daten.datum)) {
        await eintragSpeichern("audit", da, { ...da.daten, datum: r.naechstes.datum }, da.status === "vorgesehen" ? "geplant" : da.status, liste);
        plan = "Nächstes Audit im Plan auf " + wann + " terminiert.";
      } else if (da.daten.datum === r.naechstes.datum) plan = "Nächstes Audit am " + wann + " steht schon im Plan.";
      else plan = "Laut Bericht ist das nächste Audit am " + wann + ", im Plan steht der " + da.daten.datum.split("-").reverse().join(".") + ".";
    } else {
      await eintragSpeichern("audit", null, {
        art: d.art || "zert", titel: (r.naechstes.typ || "Nächstes Audit") + (r.stelle ? " (" + r.stelle + ")" : ""), datum: r.naechstes.datum,
        quelle: "Aus " + bericht }, "geplant", liste);
      plan = "Nächstes Audit am " + wann + " im Plan eingetragen.";
    }
  }

  const text = ["Bericht gelesen.",
    neu ? neu + " Punkt(e) als offene Einträge in die Liste Abweichungen." : r.punkte.length ? "Feststellungen waren schon übertragen." : "Keine Feststellungen im Bericht.",
    plan].filter(Boolean).join(" ");
  return { daten: d, status, text };
}
