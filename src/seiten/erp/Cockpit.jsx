// Test ERP: Artikel-Cockpit wie im Gewatec, schlank (Wunsch Patrick
// 21. November 2026: „es geht nur um die Grundfunktionalität“). Auf einen
// Blick, was mit einem Artikel läuft: offene Aufträge, Bestellungen,
// Fertigungsaufträge und der Lagerbestand. Alles gerechnet aus Belegen und
// Bewegungen, nichts gespeichert. Ein Doppelklick öffnet den Beleg.
import { useState } from "react";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { GFenster, KF, GTabelle } from "./Stamm.jsx";
import { zahl, mengeText, datumText, artikelText, partnerText, bestand, folgePositionen, gebucht, BELEGTYP } from "../../daten/erp.js";
import { belegOeffnen } from "./Belege.jsx";
import { artikelFensterOeffnen } from "./ArtikelFenster.jsx";

export function cockpitOeffnen(d, aussen, a) {
  if (!a) return;
  fensterOeffnen((zu) => <Cockpit d={d} aussen={aussen} a={a} zu={zu} />);
}

// Erledigte Menge je Belegart: geliefert, eingegangen, fertig gemeldet
function erledigt(d, typ, p) {
  if (typ === "auftrag") return folgePositionen(d, p.id, "lieferschein").reduce((s, x) => s + zahl(x.menge), 0);
  if (typ === "bestellung") return gebucht(d, p.id, "eingang");
  if (typ === "fertigung") return gebucht(d, p.id, "fertig");
  return 0;
}

const ABSCHNITTE = [["auftrag", "Aufträge", "Geliefert"], ["bestellung", "Bestellungen", "Eingegangen"], ["fertigung", "Fertigungsaufträge", "Fertig"]];

function Cockpit({ d, aussen, a, zu }) {
  const [mitErledigt, setMitErledigt] = useState(false);
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [wahl, setWahl] = useState(null);
  const lager = bestand(d, a.id);
  const lagerSumme = lager.reduce((s, e) => s + e.menge, 0);

  const zeilenFuer = (typ) => d.positionen.filter((p) => p.artikel_id === a.id).map((p) => ({ p, b: d.belegMap.get(p.beleg_id) }))
    .filter(({ b }) => b && b.typ === typ && b.status !== "storniert")
    .filter(({ b }) => (!von || (b.datum || "") >= von) && (!bis || (b.datum || "") <= bis))
    .map(({ p, b }) => ({ p, b, ist: erledigt(d, typ, p), soll: zahl(p.menge) }))
    .filter((x) => mitErledigt || (x.b.status !== "abgeschlossen" && x.ist < x.soll - 1e-9))
    .sort((x, y) => (x.b.datum || "").localeCompare(y.b.datum || ""));

  const kopf = <>
    <KF label="Artikel" nurLesen wert={artikelText(a)} menue={[["Artikel öffnen", () => artikelFensterOeffnen(d, aussen, a)]]} />
    <KF label="Matchcode" nurLesen wert={a.bezeichnung || ""} breit />
    <KF label="Datum von" typ="datum" name="von" wert={von} setzen={setVon} />
    <KF label="bis" typ="datum" name="bis" wert={bis} setzen={setBis} />
    <KF label="Auch erledigte" typ="haken" name="erledigt" wert={mitErledigt} setzen={setMitErledigt} />
    <KF label="Lagerbestand" nurLesen rechts wert={mengeText(lagerSumme) + " " + (a.einheit || "")} />
  </>;

  return (
    <GFenster titel={"Artikel-Cockpit " + artikelText(a)} kopf={kopf} zu={zu} attr={{ "data-erp-cockpit": a.nr }}
      fuss={<><span className="gf-fuss__luecke" /><button className="knopf knopf--still" data-nein="" onClick={zu}>Beenden</button></>}>
      {ABSCHNITTE.map(([typ, name, istText]) => {
        const z = zeilenFuer(typ);
        const offen = z.reduce((s, x) => s + Math.max(0, x.soll - x.ist), 0);
        return <section key={typ} className="gf-abschnitt" data-erp-cockpit-teil={typ}>
          <h3>{name} <small>{z.length} {mitErledigt ? "" : "offen"} · offene Menge {mengeText(offen)}</small></h3>
          <GTabelle kopf={[BELEGTYP[typ].name, "Pos", "Datum", BELEGTYP[typ].partner === "lieferant" ? "Lieferant" : "Kunde", "Ihre Nr.", "Termin", "Menge", istText, "Offen"]}
            rechts={[6, 7, 8]} leer="Nichts." wahl={wahl} setWahl={setWahl}
            zeilen={z.map(({ p, b, ist, soll }) => ({ key: p.id, klick: () => belegOeffnen(d, aussen, b),
              zellen: [<b>{b.nr}</b>, p.pos, datumText(b.datum), partnerText(d.partnerMap.get(b.partner_id)), (b.daten || {}).ihre_nr || "",
                p.termin ? datumText(p.termin) : "", mengeText(soll), mengeText(ist), mengeText(Math.max(0, soll - ist))] }))} />
        </section>;
      })}
      <section className="gf-abschnitt" data-erp-cockpit-teil="lager">
        <h3>Lagerbestand <small>{mengeText(lagerSumme)} {a.einheit}</small></h3>
        <GTabelle kopf={["Index", "Charge", "Lagerart", "Lagerplatz", "Menge"]} rechts={[4]} leer="Kein Bestand."
          zeilen={lager.map((e) => { const l = d.lagerMap.get(e.lager_id);
            return { key: e.charge + e.lager_id + (e.idx || ""), zellen: [e.idx || "–", e.charge, l ? l.lagerart : "–", l ? l.platz : "–", mengeText(e.menge)] }; })} />
      </section>
    </GFenster>
  );
}
