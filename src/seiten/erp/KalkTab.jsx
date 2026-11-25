// Test ERP: aus einer Kalkulation Artikel (mit Index) und Arbeitsplan anlegen.
// Warum hier und nicht in der Kalkulation: die Kalkulation bleibt unverändert,
// das ERP liest sie nur. Ein zweites Mal übernehmen aktualisiert den Artikel.
import { useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { Tabelle, Suche, passt, tun } from "./teile.jsx";
import { einfuegen, aendern, chf, peKurz, HOFER_NR } from "../../daten/erp.js";
import { indexVerlauf } from "./ArtikelFenster.jsx";
import { kalkulationenLaden, maschinenLaden, staffelRechnen, stundensatz } from "../../daten/kalkulation.js";

const indexVon = (x) => { const s = String(x || "").trim(); return s === "-" ? "" : s; };

async function uebernehmen(d, k, maschinen, neu) {
  const kd = k.daten || {};
  const kopf = kd.kopf || {};
  const nr = String(kopf.artikel || k.artikel || "").trim();
  if (!HOFER_NR.test(nr)) throw new Error("Artikel-Code „" + nr + "“ ist keine Hofer-Nr. (xxxxx-xxxx). In der Kalkulation eintragen.");
  const idx = indexVon(kopf.index);
  const kname = String(kopf.kunde || k.kunde || "").trim().toLowerCase();
  const kunde = kname && d.partner.find((p) => p.art === "kunde" && (p.name.toLowerCase() === kname || p.nr === kname
    || p.name.toLowerCase().includes(kname) || kname.includes(p.name.toLowerCase())));
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
  const glatt = (x) => String(x || "").trim().toLowerCase().replace(/\s+/g, " ");
  const roh = matBez ? d.artikel.find((a) => a.art === "rohmaterial" && glatt(a.nr) === glatt(matBez)) : null;
  const arbeitsplan = (kd.ags || []).map((ag, i) => {
    const m = maschinen.find((x) => x.id === ag.masch);
    return { pos: (i + 1) * 10, bez: ag.bez || "", maschine: ag.art === "extern" ? ag.lieferant || "" : m ? m.name : "",
      te: ag.te || "", ruest: ag.erst || "", extern: ag.art === "extern", pruef: "",
      satz: m ? Math.round(stundensatz(m, ag.laufTag).eff * 100) / 100 : null };
  });
  const zeile = { art: "hofer", nr, idx, bezeichnung: kopf.bezeichnung || null, zeichnung: kopf.zeichnung || null,
    kunde_id: kunde ? kunde.id : null, preis,
    kalkulation_id: k.id, arbeitsplan, geaendert_am: new Date().toISOString(),
    daten: { kalkulation_nr: k.nr, material: matBez, ...(roh ? { rohmaterial_id: roh.id } : {}), pe,
      preisliste: { kalkulation_id: k.id, kalkulation_nr: k.nr, uebernommen_am: new Date().toISOString(), pe, waehrung: "CHF",
        aus_waehrung: waehrung !== "CHF" ? waehrung : undefined, von_hand: false, staffeln: liste } } };
  // Pro HOCO Nr. nur ein Artikel: ein anderer Index ändert denselben Artikel, der alte kommt in seinen Verlauf.
  const da = d.artikel.find((a) => a.art === "hofer" && a.nr === nr);
  if (da) await aendern("erp_artikel", da.id, { ...zeile, daten: { ...indexVerlauf(da, idx, "aus Kalkulation " + k.nr), ...zeile.daten } });
  else await einfuegen("erp_artikel", { ...zeile, aktiv: true, einheit: "Stk" });
  neu();
  return (da ? "Artikel " : "Neuer Artikel ") + nr + (idx ? " Ind. " + idx : "") + " mit " + arbeitsplan.length + " Arbeitsgängen und "
    + liste.length + (liste.length === 1 ? " Preis" : " Staffelpreisen") + (waehrung !== "CHF" ? " (aus " + waehrung + " in CHF umgerechnet)" : "")
    + (kunde ? "" : " (Kunde nicht gefunden, im Artikel setzen)")
    + (matBez && !roh ? ". Rohmaterial „" + matBez + "“ gibt es noch nicht als Artikel, es steht nur als Text" : "") + ".";
}

export default function KalkTab({ d, neu }) {
  const [suche, setSuche] = useState("");
  const kalk = useDaten(kalkulationenLaden, []);
  const masch = useDaten(maschinenLaden, []);
  if (kalk.fehler) return <div className="karte karte--fehler"><p>{String(kalk.fehler.message || kalk.fehler)}</p></div>;
  if (!kalk.daten || !masch.daten) return <div className="laedt">Kalkulationen laden …</div>;
  const liste = kalk.daten.filter((k) => passt(suche, [k.nr, k.kunde, k.artikel, ((k.daten || {}).kopf || {}).bezeichnung].join(" ")));
  return (
    <>
      <p className="klein">Übernimmt Artikel-Code, Index, Zeichnung, Bezeichnung, Kunde, Rohmaterial (wenn es den Rohmaterial-Artikel schon gibt, sonst als Text), alle Staffelpreise als Preisliste (mit „Preis pro“ der Kalkulation) und die Arbeitsgänge als Arbeitsplan. Nochmals übernehmen ersetzt die Preisliste.</p>
      <div className="mat-kopf"><Suche wert={suche} setzen={setSuche} platzhalter="Kalkulation suchen …" /></div>
      <Tabelle kopf={["Nr.", "Kunde", "Artikel", "Index", "Bezeichnung", "Im ERP", ""]} leer="Keine Kalkulationen."
        zeilen={liste.map((k) => {
          const kopf = (k.daten || {}).kopf || {};
          const nr = String(kopf.artikel || k.artikel || "").trim();
          const da = d.artikel.find((a) => a.art === "hofer" && a.nr === nr);
          return { key: k.id, zellen: [<b>{k.nr}</b>, k.kunde || "", nr, indexVon(kopf.index) || "–", kopf.bezeichnung || "",
            da ? "ja" + (da.preis != null ? " · ab " + chf(da.preis) + " " + peKurz((da.daten || {}).pe) : "")
              + (((da.daten || {}).preisliste || {}).kalkulation_id === k.id ? "" : ((da.daten || {}).preisliste ? " (Preise aus anderer Kalkulation)" : "")) : "",
            <button className="knopf knopf--klein" data-erp-kalk={k.nr}
              onClick={async () => { const r = await tun(() => uebernehmen(d, k, masch.daten, neu)); if (r) alt.meldung(r, "gut"); }}>
              {da ? "Aktualisieren" : "Artikel und Arbeitsplan anlegen"}</button>] };
        })} />
    </>
  );
}
