// Test ERP → Logistik (seit 1.920.0, Wunsch Patrick 27. November 2026: „mach einen
// Logistik, dort brauche ich ein Dashboard für verschiedene Funktionen. Erste Funktion:
// Wareneingänge anlegen für Bestellungen ZA extern“, „mach schöne Kacheln im Dashboard“).
// Zweite Kachel „ZA extern anlegen“ seit 1.925.0 (Patrick 27. November 2026).
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

// Externe Arbeitsgänge offener FAs, für die es noch keine Bestellung ZA extern gibt.
// Eine Bestellung gehört zum Arbeitsgang über daten.fa_id und daten.ag_pos.
export function offeneZaAnlegen(d) {
  const bestellt = new Set(d.belege.filter((b) => b.typ === "bestellung" && b.status !== "storniert" && (b.daten || {}).fa_id)
    .map((b) => b.daten.fa_id + "|" + b.daten.ag_pos));
  const z = [];
  d.belege.filter((b) => b.typ === "fertigung" && b.status !== "storniert" && b.status !== "abgeschlossen").forEach((fa) => {
    const p = (d.posJe.get(fa.id) || []).find((x) => x.artikel_id);
    ((fa.daten || {}).ap || []).forEach((ag, i) => {
      const pos = ag.pos || (i + 1) * 10;
      if (!ag.extern || ag.erledigt_am || bestellt.has(fa.id + "|" + pos)) return;
      const lief = ag.lieferant_nr ? d.partner.find((x) => x.art === "lieferant" && x.nr === String(ag.lieferant_nr)) : null;
      z.push({ fa, p, ag, pos, lief });
    });
  });
  return z.sort((x, y) => String(y.fa.nr).localeCompare(String(x.fa.nr)));
}

// Termin = heute + Pauschalzeit (Tage, bei Stunden aufgerundet auf ganze Tage)
function zaTermin(ag) {
  const n = Number(ag.pauschal) || 0;
  if (!n) return "";
  const tage = String(ag.pauschal_einheit || "Tag").startsWith("Std") ? Math.ceil(n / 24) : Math.ceil(n);
  const t = new Date(); t.setDate(t.getDate() + tage);
  return t.toISOString().slice(0, 10);
}

// Neue Bestellung ZA extern im gewohnten Belegfenster, vorausgefüllt aus FA und Arbeitsgang
export function zaVorlage(d, x) {
  const art = x && x.p ? d.artikelMap.get(x.p.artikel_id) : null;
  if (x && x.ohneFa) {
    return { typ: "bestellung", partner_id: x.lief ? x.lief.id : "",
      daten: { fremdleistung: true, ohne_fa: true, ag_pos: x.pos, ag_code: x.ag.code || x.ag.ag_code || "" },
      positionen: [{ artikel_id: x.a.id, text: [x.ag.code || x.ag.ag_code, x.ag.bez].filter(Boolean).join(" "), menge: "",
        einheit: x.a.einheit || "Stk", termin: zaTermin(x.ag), daten: { fremdleistung: true, idx: x.a.idx || "", ag_pos: x.pos } }] };
  }
  return { typ: "bestellung", partner_id: x.lief ? x.lief.id : "",
    daten: { fremdleistung: true, fa_id: x.fa.id, fa_nr: x.fa.nr, ag_pos: x.pos, ag_code: x.ag.code || x.ag.ag_code || "" },
    positionen: [{ artikel_id: art ? art.id : "", text: [x.ag.code || x.ag.ag_code, x.ag.bez].filter(Boolean).join(" "),
      menge: x.p ? x.p.menge : "", einheit: (x.p && x.p.einheit) || "Stk", termin: zaTermin(x.ag),
      daten: { fremdleistung: true, idx: x.p && x.p.daten ? x.p.daten.idx : undefined, fa_nr: x.fa.nr, ag_pos: x.pos } }] };
}

const KACHELN = [
  { id: "we-za", titel: "Wareneingang ZA extern", text: "Teile von der Zusatzarbeit beim Lieferanten zurück einbuchen",
    zeichen: "📦", zahl: (d) => offeneZaPositionen(d).length, einheit: "offen",
    warn: (d) => offeneZaPositionen(d).filter((x) => x.p.termin && x.p.termin < heute()).length, warnText: "überfällig" },
  { id: "za-neu", titel: "ZA extern anlegen", text: "Externe Arbeitsgänge offener FAs beim Lieferanten bestellen",
    zeichen: "🚚", zahl: (d) => offeneZaAnlegen(d).length, einheit: "zu bestellen" },
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
              <span className="logi-kachel__zahl"><b>{n}</b> {k.einheit}
                {w > 0 && <span className="logi-kachel__warn">{w} {k.warnText}</span>}</span>
              <span className="logi-kachel__text">{k.text}</span>
            </button>);
        })}
      </div>
      {kachel === "we-za" && <WareneingangZa d={d} neu={neu} />}
      {kachel === "za-neu" && <ZaAnlegen d={d} neu={neu} />}
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

function ZaAnlegen({ d, neu }) {
  const [suche, setSuche] = useState("");
  const liste = offeneZaAnlegen(d).filter(({ fa, p, ag, lief }) =>
    passt(suche, [fa.nr, p && artikelText(d.artikelMap.get(p.artikel_id)), ag.code, ag.ag_code, ag.bez, ag.maschine, lief && lief.name].join(" ")));
  return (
    <section className="logi-funktion" data-logi-funktion="za-neu">
      <div className="mat-kopf">
        <h2 className="logi-funktion__titel">ZA extern anlegen</h2>
        <Suche wert={suche} setzen={setSuche} platzhalter="FA, Artikel, Arbeitsgang, Lieferant …" />
        <button type="button" className="knopf knopf--klein" data-logi-za-ap=""
          onClick={() => fensterOeffnen((zu) => <ZaAusArbeitsplan d={d} neu={neu} zu={zu} />)}>Ohne FA: aus Arbeitsplan</button>
      </div>
      <p className="klein">Zeile antippen öffnet eine neue Bestellung ZA extern, ausgefüllt aus dem FA und dem Arbeitsplan: Lieferant, Artikel, Menge und Termin aus der Pauschalzeit. Prüfen und speichern. Die FA-Nummer öffnet den FA. Nur im Einzelfall ohne FA: „Ohne FA: aus Arbeitsplan“.</p>
      <Tabelle kopf={["FA", "Artikel", "Menge", "Arbeitsgang", "Lieferant", "Pauschal", "Termin"]}
        leer="Keine offenen externen Arbeitsgänge."
        zeilen={liste.map((x) => ({
          key: x.fa.id + "|" + x.pos, klick: () => belegOeffnen(d, neu, null, zaVorlage(d, x)),
          zellen: [<a href="#" data-logi-fa={x.fa.nr} onClick={(e) => { e.preventDefault(); e.stopPropagation(); belegOeffnen(d, neu, x.fa); }}>{x.fa.nr}</a>,
            x.p ? artikelText(d.artikelMap.get(x.p.artikel_id)) + (posIdx(d, x.p) ? " · Index " + posIdx(d, x.p) : "") : "–",
            x.p ? mengeText(x.p.menge) : "–",
            x.pos + " " + [x.ag.code || x.ag.ag_code, x.ag.bez].filter(Boolean).join(" "),
            x.lief ? partnerText(x.lief) : (x.ag.maschine || <span className="erp-rot">fehlt</span>),
            x.ag.pauschal ? x.ag.pauschal + " " + (x.ag.pauschal_einheit || "") : "–",
            zaTermin(x.ag) ? datumText(zaTermin(x.ag)) : "–"],
        }))} />
    </section>
  );
}

// Einzelfall ohne FA (Patrick 27. November 2026: „standardmässig über den FA, in Einzelfällen über
// den Arbeitsplan, wenn kein FA vorhanden ist“): Hofer-Artikel suchen, externen Arbeitsgang wählen
function ZaAusArbeitsplan({ d, neu, zu }) {
  const [suche, setSuche] = useState("");
  const z = [];
  if (suche.trim().length >= 2) {
    d.artikel.filter((a) => a.art === "hofer" && a.aktiv !== false && passt(suche, [a.nr, a.idx, a.bezeichnung].join(" "))).slice(0, 80).forEach((a) => {
      (Array.isArray(a.arbeitsplan) ? a.arbeitsplan : []).forEach((ag, i) => {
        if (!ag.extern) return;
        const lief = ag.lieferant_nr ? d.partner.find((x) => x.art === "lieferant" && x.nr === String(ag.lieferant_nr)) : null;
        z.push({ ohneFa: true, a, ag, pos: ag.pos || (i + 1) * 10, lief });
      });
    });
  }
  return (
    <div className="dialog erp-fenster erp-fenster--gross" data-logi-ap-fenster="">
      <h2>ZA extern ohne FA</h2>
      <p className="klein">Hofer-Artikel suchen (mindestens 2 Zeichen), dann den externen Arbeitsgang antippen. Die Menge trägst du in der Bestellung ein.</p>
      <Suche wert={suche} setzen={setSuche} platzhalter="Artikel-Nr. oder Bezeichnung …" fokus />
      <Tabelle kopf={["Artikel", "Arbeitsgang", "Lieferant", "Pauschal"]}
        leer={suche.trim().length >= 2 ? "Kein Artikel mit externem Arbeitsgang gefunden." : "Suchbegriff eingeben."}
        zeilen={z.map((x) => ({ key: x.a.id + "|" + x.pos, klick: () => { zu(); belegOeffnen(d, neu, null, zaVorlage(d, x)); },
          zellen: [artikelText(x.a), x.pos + " " + [x.ag.code || x.ag.ag_code, x.ag.bez].filter(Boolean).join(" "),
            x.lief ? partnerText(x.lief) : (x.ag.maschine || "–"), x.ag.pauschal ? x.ag.pauschal + " " + (x.ag.pauschal_einheit || "") : "–"] }))} />
      <div className="dialog-knoepfe"><button type="button" className="knopf knopf--still" onClick={zu}>Schliessen</button></div>
    </div>
  );
}
