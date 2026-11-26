// Test ERP: aus der offenen Kalkulation Artikel (mit Index), Preisliste und
// Arbeitsplan übernehmen. Seit 1.848.0 ein Knopf in der Kalkulation selbst statt
// eines eigenen Reiters (Wunsch Patrick 25. November 2026). Die Kalkulation
// bleibt unverändert, das ERP liest sie nur. Gibt es den Artikel schon, fragt
// die App, ob Index, Preisliste und Arbeitsplan ersetzt werden sollen.
import { alt } from "../../bruecke.jsx";
import { einfuegen, aendern, HOFER_NR } from "../../daten/erp.js";
import { indexVerlauf } from "./ArtikelFenster.jsx";
import { staffelRechnen, stundensatz } from "../../daten/kalkulation.js";

const indexVon = (x) => { const s = String(x || "").trim(); return s === "-" ? "" : s; };

export async function artikelAusKalkulation(k, maschinen) {
  const kd = k.daten || {};
  const kopf = kd.kopf || {};
  const nr = String(kopf.artikel || "").trim();
  if (!HOFER_NR.test(nr)) throw new Error("Artikel-Code „" + nr + "“ ist keine Hofer-Nr. (xxxxx-xxxx). Zuerst in den Kopfdaten eintragen.");
  const idx = indexVon(kopf.index);
  const db = alt.db;
  const [rp, ra] = await Promise.all([
    alt.zeitlimit(db.from("erp_partner").select("id,art,nr,name").eq("art", "kunde"), 10000, "erp_partner"),
    alt.zeitlimit(db.from("erp_artikel").select("id,art,nr,idx,daten,arbeitsplan,preis").eq("art", "hofer").eq("nr", nr).limit(1), 10000, "erp_artikel"),
  ]);
  if (rp.error) throw rp.error;
  if (ra.error) throw ra.error;
  const partner = rp.data || [];
  const da = (ra.data || [])[0] || null;
  // Kunde zuerst über den Kunden-Code, sonst über den Namen
  const kcode = String(kopf.kundencode || "").trim();
  const kname = String(kopf.kunde || "").trim().toLowerCase();
  const kunde = (kcode && partner.find((p) => String(p.nr) === kcode))
    || (kname && partner.find((p) => (p.name || "").toLowerCase() === kname))
    || (kname && partner.find((p) => { const n = (p.name || "").toLowerCase(); return n && (n.includes(kname) || kname.includes(n)); }));
  // Alle Staffeln als Preisliste des Artikels (Wunsch Patrick 21. November
  // 2026), je Staffel der Angebotspreis pro Preiseinheit. Das ERP rechnet in
  // CHF: ein Angebot in EUR/USD wird mit dem Kurs der Kalkulation umgerechnet.
  const staffeln = (kd.staffeln || []).filter((x) => Number(String(x.menge || "").replace(/'/g, "")) > 0)
    .map((x) => staffelRechnen(kd, x, maschinen)).sort((x, y) => x.menge - y.menge);
  const pe = staffeln.length ? staffeln[0].pe : 1;
  const waehrung = staffeln.length ? staffeln[0].waehrung : "CHF";
  const rund = (n) => Math.round(n * 10000) / 10000;
  const liste = staffeln.map((r) => ({ ab: r.menge, preis: rund(waehrung === "CHF" ? r.angebotPe : r.angebot * pe) }))
    .filter((x) => Number.isFinite(x.preis));
  const preis = liste.length ? liste[0].preis : null;
  // Rohmaterial: nur zuweisen, wenn der Rohmaterial-Artikel schon besteht, sonst
  // bleibt die Bezeichnung als Text (Wunsch Patrick 21. November 2026: „soll
  // aus der Kalkulation nicht erstellt werden, dann steht nur ein Text“)
  const matBez = String((kd.material || {}).bez || "").trim();
  let roh = null;
  if (matBez) {
    const rr = await alt.zeitlimit(db.from("erp_artikel").select("id,nr").eq("art", "rohmaterial").ilike("nr", matBez).limit(1), 10000, "erp_artikel");
    if (!rr.error) roh = (rr.data || [])[0] || null;
  }
  const arbeitsplan = (kd.ags || []).map((ag, i) => {
    const m = maschinen.find((x) => x.id === ag.masch);
    return { pos: (i + 1) * 10, bez: ag.bez || "", maschine: ag.art === "extern" ? ag.lieferant || "" : m ? m.name : "",
      te: ag.te || "", ruest: ag.erst || "", extern: ag.art === "extern", pruef: "",
      satz: m ? Math.round(stundensatz(m, ag.laufTag).eff * 100) / 100 : null };
  });
  const preisliste = { kalkulation_id: k.id, kalkulation_nr: k.nr, uebernommen_am: new Date().toISOString(), pe, waehrung: "CHF",
    aus_waehrung: waehrung !== "CHF" ? waehrung : undefined, von_hand: false, staffeln: liste };
  const grund = { bezeichnung: kopf.bezeichnung || null, zeichnung: kopf.zeichnung || null,
    kalkulation_id: k.id, geaendert_am: new Date().toISOString() };
  if (kunde) grund.kunde_id = kunde.id;
  const matDaten = { kalkulation_nr: k.nr, material: matBez, ...(roh ? { rohmaterial_id: roh.id } : {}) };

  let teile = { idx: true, preise: true, ap: true };
  if (da) {
    // Pro HOCO Nr. nur ein Artikel: fragen, was ersetzt werden soll.
    const w = await alt.dialogFelder({
      titel: "Artikel " + nr + " gibt es schon",
      text: "Bezeichnung, Zeichnung, Kunde und Material kommen aus der Kalkulation. Was soll sonst ersetzt werden?",
      bestaetigen: "Übernehmen",
      felder: [
        { name: "idx", label: "Index übernehmen (bisher „" + (da.idx || "–") + "“, neu „" + (idx || "–") + "“)", typ: "haken", wert: (da.idx || "") !== idx },
        { name: "preise", label: "Preisliste ersetzen (" + liste.length + (liste.length === 1 ? " Preis)" : " Staffelpreise)"), typ: "haken", wert: true },
        { name: "ap", label: "Arbeitsplan ersetzen (" + arbeitsplan.length + " Arbeitsgänge, bisher " + ((da.arbeitsplan || []).length) + ")", typ: "haken", wert: true },
      ],
    });
    if (!w) return null;
    teile = w;
  }
  const zeile = { ...grund };
  let daten = { ...((da && da.daten) || {}), ...matDaten };
  if (teile.idx) { zeile.idx = idx; if (da) daten = { ...indexVerlauf(da, idx, "aus Kalkulation " + k.nr), ...matDaten }; }
  if (teile.preise) { zeile.preis = preis; daten.pe = pe; daten.preisliste = preisliste; }
  if (teile.ap) zeile.arbeitsplan = arbeitsplan;
  zeile.daten = daten;
  if (da) await aendern("erp_artikel", da.id, zeile);
  else await einfuegen("erp_artikel", { art: "hofer", nr, ...zeile, aktiv: true, einheit: "Stk" });
  const was = [teile.idx && (idx ? "Ind. " + idx : "ohne Index"), teile.ap && arbeitsplan.length + " Arbeitsgänge",
    teile.preise && liste.length + (liste.length === 1 ? " Preis" : " Staffelpreise") + (waehrung !== "CHF" ? " (aus " + waehrung + " in CHF)" : "")]
    .filter(Boolean);
  return (da ? "Artikel " + nr + " aktualisiert" : "Neuer Artikel " + nr) + (was.length ? ": " + was.join(", ") : "")
    + (kunde ? "" : " (Kunde nicht gefunden, im Artikel setzen)")
    + (matBez && !roh ? ". Rohmaterial „" + matBez + "“ gibt es noch nicht als Artikel, es steht nur als Text" : "") + ".";
}
