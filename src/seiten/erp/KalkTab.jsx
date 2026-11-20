// Test ERP: aus einer Kalkulation Artikel (mit Index) und Arbeitsplan anlegen.
// Warum hier und nicht in der Kalkulation: die Kalkulation bleibt unverändert,
// das ERP liest sie nur. Ein zweites Mal übernehmen aktualisiert den Artikel.
import { useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { Tabelle, Suche, passt, tun } from "./teile.jsx";
import { einfuegen, aendern, chf, HOFER_NR } from "../../daten/erp.js";
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
  const st = (kd.staffeln || [])[0];
  const preis = st ? staffelRechnen(kd, st, maschinen).angebot : null;
  const arbeitsplan = (kd.ags || []).map((ag, i) => {
    const m = maschinen.find((x) => x.id === ag.masch);
    return { pos: (i + 1) * 10, bez: ag.bez || "", maschine: ag.art === "extern" ? ag.lieferant || "" : m ? m.name : "",
      te: ag.te || "", ruest: ag.erst || "", extern: ag.art === "extern", pruef: "",
      satz: m ? Math.round(stundensatz(m, ag.laufTag).eff * 100) / 100 : null };
  });
  const zeile = { art: "hofer", nr, idx, bezeichnung: kopf.bezeichnung || null, zeichnung: kopf.zeichnung || null,
    kunde_id: kunde ? kunde.id : null, preis: preis != null && Number.isFinite(preis) ? Math.round(preis * 10000) / 10000 : null,
    kalkulation_id: k.id, arbeitsplan, geaendert_am: new Date().toISOString(),
    daten: { kalkulation_nr: k.nr, material: (kd.material || {}).bez || "" } };
  const da = d.artikel.find((a) => a.art === "hofer" && a.nr === nr && a.idx === idx);
  if (da) await aendern("erp_artikel", da.id, { ...zeile, daten: { ...(da.daten || {}), ...zeile.daten } });
  else await einfuegen("erp_artikel", zeile);
  neu();
  return (da ? "Artikel " : "Neuer Artikel ") + nr + (idx ? " Ind. " + idx : "") + " mit " + arbeitsplan.length + " Arbeitsgängen"
    + (kunde ? "" : " (Kunde nicht gefunden, im Artikel setzen)") + ".";
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
      <p className="klein">Übernimmt Artikel-Code, Index, Zeichnung, Bezeichnung, Kunde, den Preis der ersten Staffel und die Arbeitsgänge als Arbeitsplan.</p>
      <div className="mat-kopf"><Suche wert={suche} setzen={setSuche} platzhalter="Kalkulation suchen …" /></div>
      <Tabelle kopf={["Nr.", "Kunde", "Artikel", "Index", "Bezeichnung", "Im ERP", ""]} leer="Keine Kalkulationen."
        zeilen={liste.map((k) => {
          const kopf = (k.daten || {}).kopf || {};
          const nr = String(kopf.artikel || k.artikel || "").trim();
          const da = d.artikel.find((a) => a.art === "hofer" && a.nr === nr && a.idx === indexVon(kopf.index));
          return { key: k.id, zellen: [<b>{k.nr}</b>, k.kunde || "", nr, indexVon(kopf.index) || "–", kopf.bezeichnung || "",
            da ? "ja" + (da.preis != null ? " · " + chf(da.preis) : "") : "",
            <button className="knopf knopf--klein" data-erp-kalk={k.nr}
              onClick={async () => { const r = await tun(() => uebernehmen(d, k, masch.daten, neu)); if (r) alt.meldung(r, "gut"); }}>
              {da ? "Aktualisieren" : "Artikel und Arbeitsplan anlegen"}</button>] };
        })} />
    </>
  );
}
