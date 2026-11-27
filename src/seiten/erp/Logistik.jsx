// Test ERP → Logistik (seit 1.920.0, Wunsch Patrick 27. November 2026: „mach einen
// Logistik, dort brauche ich ein Dashboard für verschiedene Funktionen. Erste Funktion:
// Wareneingänge anlegen für Bestellungen ZA extern“, „mach schöne Kacheln im Dashboard“).
// Oben Kacheln je Funktion mit Zahl; ein Tipp öffnet die Funktion darunter.
// Weitere Funktionen kommen als neue Kachel in KACHELN dazu.
import { useState } from "react";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { teilMerken } from "../../teile/wiederherstellen.js";
import { useGemerkt } from "../../bruecke.jsx";
import { Tabelle, Suche, passt } from "./teile.jsx";
import { bestellArt, EingangFenster, belegOeffnen } from "./Belege.jsx";
import { allesLaden, gebucht, zahl, mengeText, artikelText, partnerText, datumText, posIdx } from "../../daten/erp.js";

const gemerkt = { kachel: "we-za" };
teilMerken("erp-logistik", () => ({ ...gemerkt }), (z) => { Object.assign(gemerkt, z); });

const heute = () => new Date().toISOString().slice(0, 10);

// Offene Positionen der Bestellungen ZA extern (Zusatzarbeit extern): noch nicht ganz eingegangen
export function offeneZaPositionen(d) {
  const z = [];
  d.belege.filter((b) => b.typ === "bestellung" && b.status !== "storniert" && b.status !== "abgeschlossen"
    && bestellArt(d, b) === "za").forEach((b) => {
    (d.posJe.get(b.id) || []).filter((p) => p.artikel_id).forEach((p) => {
      const ein = gebucht(d, p.id, "eingang");
      const offen = Math.max(0, zahl(p.menge) - ein);
      if (offen > 0) z.push({ b, p, ein, offen });
    });
  });
  // Früheste Fälligkeit zuerst, ohne Termin hinten
  return z.sort((x, y) => String(x.p.termin || "9999").localeCompare(String(y.p.termin || "9999")));
}

const KACHELN = [
  { id: "we-za", titel: "Wareneingang ZA extern", text: "Teile von der Zusatzarbeit beim Lieferanten zurück einbuchen",
    zeichen: "📦", zahl: (d) => offeneZaPositionen(d).length, einheit: "offen",
    warn: (d) => offeneZaPositionen(d).filter((x) => x.p.termin && x.p.termin < heute()).length, warnText: "überfällig" },
];

export default function Logistik({ d, neu }) {
  const [kachel, setKachel] = useState(gemerkt.kachel);
  useGemerkt(gemerkt, { kachel });
  return (
    <div className="erp-logistik">
      <div className="logi-kacheln">
        {KACHELN.map((k) => {
          const n = k.zahl(d), w = k.warn ? k.warn(d) : 0;
          return (
            <button key={k.id} className={"logi-kachel" + (kachel === k.id ? " aktiv" : "")} data-logi-kachel={k.id}
              onClick={() => setKachel(kachel === k.id ? null : k.id)}>
              <span className="logi-kachel__zeichen" aria-hidden="true">{k.zeichen}</span>
              <span className="logi-kachel__titel">{k.titel}</span>
              <span className="logi-kachel__zahl"><b>{n}</b> {k.einheit}</span>
              {w > 0 && <span className="logi-kachel__warn">{w} {k.warnText}</span>}
              <span className="logi-kachel__text">{k.text}</span>
            </button>);
        })}
      </div>
      {kachel === "we-za" && <WareneingangZa d={d} neu={neu} />}
    </div>
  );
}

function WareneingangZa({ d, neu }) {
  const [suche, setSuche] = useState("");
  const liste = offeneZaPositionen(d).filter(({ b, p }) => {
    const l = d.partnerMap.get(b.partner_id) || {};
    return passt(suche, [b.nr, l.nr, l.name, artikelText(d.artikelMap.get(p.artikel_id)), p.text].join(" "));
  });
  // Frische Daten, damit kein Eingang doppelt gebucht wird
  const buchen = async (b) => {
    const n = await allesLaden();
    fensterOeffnen((zu) => <EingangFenster d={n} b={n.belegMap.get(b.id) || b} zu={zu} fertig={async () => { neu(); }} />);
  };
  return (
    <section className="logi-funktion" data-logi-funktion="we-za">
      <div className="mat-kopf">
        <h2 className="logi-funktion__titel">Wareneingang ZA extern</h2>
        <Suche wert={suche} setzen={setSuche} platzhalter="Bestellung, Lieferant, Artikel …" />
      </div>
      <p className="klein">Zeile antippen bucht den Wareneingang: Menge, Charge und Lagerplatz eingeben. Die Bestellnummer öffnet die Bestellung.</p>
      <Tabelle kopf={["Fällig", "Bestellung", "Lieferant", "Artikel", "Bestellt", "Eingegangen", "Offen"]}
        leer="Keine offenen Bestellungen ZA extern."
        zeilen={liste.map(({ b, p, ein, offen }) => ({
          key: p.id, klasse: p.termin && p.termin < heute() ? "erp-rot" : "", klick: () => buchen(b),
          sort: [p.termin || ""],
          zellen: [p.termin ? datumText(p.termin) : "–",
            <a href="#" data-logi-beleg={b.nr} onClick={(e) => { e.preventDefault(); e.stopPropagation(); belegOeffnen(d, neu, b); }}>{b.nr}</a>,
            partnerText(d.partnerMap.get(b.partner_id)),
            artikelText(d.artikelMap.get(p.artikel_id)) + (posIdx(d, p) ? " · Index " + posIdx(d, p) : ""),
            mengeText(p.menge), mengeText(ein), <b>{mengeText(offen)}</b>],
        }))} />
    </section>
  );
}
