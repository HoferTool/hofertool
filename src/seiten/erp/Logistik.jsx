// Test ERP → Logistik (seit 1.920.0, Wunsch Patrick 27. November 2026: „mach einen
// Logistik, dort brauche ich ein Dashboard für verschiedene Funktionen. Erste Funktion:
// Wareneingänge anlegen für Bestellungen ZA extern“, „mach schöne Kacheln im Dashboard“).
// Zweite Kachel „ZA extern anlegen“ seit 1.925.0 (Patrick 27. November 2026).
// Oben Kacheln je Funktion mit Zahl; ein Tipp öffnet die Funktion darunter.
// Weitere Funktionen kommen als neue Kachel in KACHELN dazu.
import { useState, useRef, useEffect } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { teilMerken } from "../../teile/wiederherstellen.js";
import { useGemerkt } from "../../bruecke.jsx";
import { Tabelle, Suche, passt } from "./teile.jsx";
import { briefBlatt } from "../../teile/briefkopf.js";
import { poolDruckLaden, poolWbgDrucker, poolDrucken, pdfSeitenAlsJpg } from "../../teile/poolDruck.js";
import { bestellArt, BelegListe, belegStand, planwandZelle, EingangFenster, FertigFenster, LieferscheinFenster, belegOeffnen, geliefert, chargenWahl } from "./Belege.jsx";
import { allesLaden, gebucht, zahl, mengeText, artikelText, partnerText, datumText, posIdx, lagerName } from "../../daten/erp.js";

// Beim Wechsel in den Reiter ist unten nichts offen (Wunsch Patrick 27. November 2026); nur nach
// dem Neuladen der Seite kommt die zuletzt offene Kachel wieder („Neuladen wie vorher“)
const gemerkt = { kachel: null };
let wiederhergestellt = false;
teilMerken("erp-logistik", () => ({ ...gemerkt }), (z) => { Object.assign(gemerkt, z); wiederhergestellt = true; });

const heute = () => new Date().toISOString().slice(0, 10);
const plusTage = (iso, n) => { const t = new Date(iso + "T12:00:00"); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };

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

// Offene FAs, deren Teile noch nicht ganz eingelagert (fertig gemeldet) sind (seit 1.927.0)
export function offeneEinlagern(d) {
  const z = [];
  d.belege.filter((b) => b.typ === "fertigung" && b.status !== "storniert" && b.status !== "abgeschlossen").forEach((b) => {
    (d.posJe.get(b.id) || []).filter((p) => p.artikel_id).forEach((p) => {
      const ein = gebucht(d, p.id, "fertig");
      const offen = Math.max(0, zahl(p.menge) - ein);
      if (offen > 0) z.push({ b, p, ein, offen, pw: (b.daten || {}).planwand || null });
    });
  });
  // Laufende und rüstende Aufträge der Planwand zuerst, dann neueste FA-Nr.
  const rang = (x) => (x.pw && /laeuft|ruesten/.test(x.pw.stand || "") ? 0 : 1);
  return z.sort((x, y) => rang(x) - rang(y) || String(y.b.nr).localeCompare(String(x.b.nr)));
}

// Offene FAs mit Auftrag auf der Planwand: dort hängt die WBG (jobs.wbg_url), seit 1.928.0
export function wbgFas(d) {
  return d.belege.filter((b) => b.typ === "fertigung" && b.status !== "storniert" && b.status !== "abgeschlossen"
    && (b.daten || {}).planwand && b.daten.planwand.job_id)
    .sort((x, y) => String(y.nr).localeCompare(String(x.nr)));
}

// Offene Auftragspositionen zum Liefern (seit 1.928.0): Fälligkeit aus dem Lieferplan
// (erste noch nicht gedeckte Fälligkeit), sonst der Termin der Position; dazu der Bestand
// desselben Artikels und Index, aus dem der Lieferschein liefern kann
export function offeneLieferungen(d) {
  const z = [];
  d.belege.filter((b) => b.typ === "auftrag" && b.status !== "storniert" && b.status !== "abgeschlossen").forEach((b) => {
    (d.posJe.get(b.id) || []).filter((p) => p.artikel_id).forEach((p) => {
      const g = geliefert(d, p);
      const offen = Math.max(0, zahl(p.menge) - g);
      if (!(offen > 0)) return;
      let kum = 0, faellig = p.termin || "";
      for (const x of ((p.daten || {}).abrufe || [])) { kum += zahl(x.menge); if (kum > g + 1e-9) { faellig = x.termin || faellig; break; } }
      const lager = chargenWahl(d, p.artikel_id, posIdx(d, p)).reduce((s2, c) => s2 + c[2].menge, 0);
      z.push({ b, p, offen, faellig, lager });
    });
  });
  return z.sort((x, y) => String(x.faellig || "9999").localeCompare(String(y.faellig || "9999")));
}

// Fällige Lieferungen im Zeitraum (seit 1.929.0, Patrick 27. November 2026 mit dem Blatt
// „Offene Lieferungen“ aus dem Gewatec): je Fälligkeit des Lieferplans der noch offene Teil
// (Lieferungen werden der Reihe nach angerechnet), ohne Lieferplan der Termin der Position
export function lieferplanListe(d, von, bis) {
  const z = [];
  d.belege.filter((b) => b.typ === "auftrag" && b.status !== "storniert" && b.status !== "abgeschlossen").forEach((b) => {
    (d.posJe.get(b.id) || []).filter((p) => p.artikel_id || p.text).forEach((p) => {
      let rest = geliefert(d, p);
      const abrufe = ((p.daten || {}).abrufe || []).filter((x) => zahl(x.menge) > 0);
      const faell = abrufe.length ? abrufe.map((x) => ({ termin: String(x.termin || "").slice(0, 10), menge: zahl(x.menge) }))
        : [{ termin: p.termin || "", menge: zahl(p.menge) }];
      faell.forEach((f) => {
        const ab = Math.min(rest, f.menge); rest -= ab;
        const offen = f.menge - ab;
        if (offen > 1e-9 && f.termin && f.termin >= von && f.termin <= bis) z.push({ b, p, termin: f.termin, offen });
      });
    });
  });
  const kunde = (x) => { const k = d.partnerMap.get(x.b.partner_id) || {}; return (k.nr || "") + " " + (k.name || ""); };
  return z.sort((x, y) => kunde(x).localeCompare(kunde(y)) || x.termin.localeCompare(y.termin) || String(x.b.nr).localeCompare(String(y.b.nr)));
}

// Lager eines Artikels mit Index: Plätze und Menge (wie „Lagerort“ und „Lag. Best.“ im Gewatec-Blatt)
function lagerVon(d, p) {
  if (!p.artikel_id) return { plaetze: "", menge: 0 };
  const e = chargenWahl(d, p.artikel_id, posIdx(d, p)).map((c) => c[2]);
  const plaetze = [...new Set(e.map((x) => { const l = d.lagerMap.get(x.lager_id); return l ? l.platz || lagerName(l) : ""; }).filter(Boolean))].join(", ");
  return { plaetze, menge: e.reduce((s2, x) => s2 + x.menge, 0) };
}

function lieferplanDrucken(d, liste, von, bis) {
  const esc = alt.esc;
  const jetzt = new Date();
  const gruppen = new Map();
  liste.forEach((x) => { const k = x.b.partner_id || ""; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(x); });
  const inhalt = [...gruppen.entries()].map(([kid, zeilen]) => {
    const k = d.partnerMap.get(kid) || {};
    return "<tbody class='gr'><tr class='kunde'><td colspan='10'>" + esc((k.nr || "") + "   " + (k.name || "ohne Kunde")) + "</td></tr>"
      + zeilen.map(({ b, p, termin, offen }) => {
        const a = d.artikelMap.get(p.artikel_id);
        const l = lagerVon(d, p);
        return "<tr><td>" + datumText(termin) + "</td><td>" + esc(b.nr + "-" + Math.round(p.pos / 10)) + "</td><td>" + esc(a ? (a.bezeichnung || a.nr) : p.text || "")
          + "</td><td>" + esc(a ? a.nr : "") + "</td><td class='lo'>" + esc(l.plaetze) + "</td><td class='r'>" + mengeText(l.menge) + "</td><td class='r'>" + mengeText(offen)
          + "</td><td><span class='linie'></span></td><td><span class='linie'></span></td></tr>";
      }).join("") + "</tbody>";
  }).join("");
  let roh = "<!doctype html><html><head><meta charset='utf-8'><title>Offene Lieferungen</title><style>"
    + "body{font:9pt Arial,sans-serif;margin:0;color:#111}h1{font-size:16pt;margin:0;font-weight:700}"
    + ".kopf{display:flex;align-items:baseline;gap:12mm;margin-bottom:4mm}.kopf b{font-size:11pt}.kopf .druck{margin-left:auto;font-size:8.5pt}"
    + "table.ol{width:100%;border-collapse:collapse}table.ol thead th{border-bottom:1.5px solid #111;text-align:left;padding:3px 4px;font-size:8.5pt}"
    + "table.ol td{padding:2px 4px;vertical-align:bottom}.r{text-align:right}th.r{text-align:right}.lo{max-width:28mm;overflow:hidden;white-space:nowrap}"
    + ".kunde td{font-weight:700;font-size:10pt;padding-top:9px}.gr{page-break-inside:avoid}"
    + ".linie{display:block;border-bottom:1px solid #111;height:12px;min-width:30mm}.test{color:#b00;font-weight:bold}@media print{.test{display:none}}"
    + "</style></head><body><!--INHALT--><p class='test'>TESTVERSION ERP</p>"
    + "<div class='kopf'><h1>Offene Lieferungen</h1><b>von " + datumText(von) + "</b><b>bis " + datumText(bis) + "</b>"
    + "<span class='druck'>Druck: " + datumText(jetzt.toISOString().slice(0, 10)) + " / " + jetzt.toTimeString().slice(0, 5) + "</span></div>"
    + "<table class='ol'><thead><tr><th>Termin</th><th>Auftr. Nr</th><th>Artikel</th><th>Art. Nr.</th><th>Lagerort</th><th class='r'>Lag. Best.</th>"
    + "<th class='r'>Menge</th><th>Rüstmenge</th><th>Verpackung</th></tr></thead>" + (inhalt || "<tbody><tr><td colspan='9'>Keine fälligen Lieferungen im Zeitraum.</td></tr></tbody>") + "</table>"
    + "<script>setTimeout(()=>print(),400)</script></body></html>";
  // Briefkopf wie bei allen Blättern, aber quer wie das Gewatec-Blatt (viele Spalten)
  roh = briefBlatt(roh).replace("@page{size:A4;", "@page{size:A4 landscape;");
  const w = window.open("", "_blank");
  if (!w) { alt.meldung("Das Fenster wurde vom Browser blockiert.", "warn"); return; }
  w.document.write(roh);
  w.document.close();
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
  { id: "einlagern", titel: "Fertigung einlagern", text: "Fertige Teile aus der Fertigung ins Lager buchen",
    zeichen: "🏭", zahl: (d) => offeneEinlagern(d).length, einheit: "offen" },
  { id: "wbg", titel: "WBG drucken", text: "Werkbegleitschein der offenen FAs auf dem Drucker der Spedition",
    zeichen: "🖨️", zahl: (d) => wbgFas(d).length, einheit: "FAs" },
  { id: "ls-neu", titel: "Lieferschein anlegen", text: "Offene Aufträge mit Teilen am Lager an den Kunden liefern",
    zeichen: "📄", zahl: (d) => offeneLieferungen(d).filter((x) => x.lager > 0).length, einheit: "lieferbar",
    warn: (d) => offeneLieferungen(d).filter((x) => x.faellig && x.faellig < heute()).length, warnText: "überfällig" },
  // FA Übersicht: dieselbe Liste wie im Reiter Fertigung, mit Häkchen je Stand (seit 1.928.0)
  { id: "fa", titel: "FA Übersicht", text: "Alle Fertigungsaufträge mit Stand und Planwand",
    zeichen: "📋", zahl: (d) => d.belege.filter((b) => b.typ === "fertigung" && b.status !== "storniert" && b.status !== "abgeschlossen").length, einheit: "offen" },
  { id: "lieferplan", titel: "Lieferplan Liste", text: "Fällige Lieferungen im Zeitraum, nach Kunde, zum Drucken",
    zeichen: "🗓️", zahl: (d) => lieferplanListe(d, heute(), plusTage(heute(), 14)).length, einheit: "in 14 Tagen" },
  // Seit 1.933.0 (Patrick 27. November 2026): ZA extern bucht nichts im Lager (das Lager EXT wird vorerst
  // nicht benutzt); was draussen ist, ergibt sich aus den offenen Bestellungen ZA extern minus Wareneingang
  { id: "extern", titel: "Aktuell extern", text: "Was ist wo und wie viel beim Lieferanten draussen",
    zeichen: "🧭", zahl: (d) => offeneZaPositionen(d).length, einheit: "Positionen" },
  { id: "za-neu", titel: "ZA extern anlegen", text: "Externe Arbeitsgänge offener FAs beim Lieferanten bestellen",
    zeichen: "🚚", zahl: (d) => offeneZaAnlegen(d).length, einheit: "zu bestellen" },
];

// Reihenfolge der Kacheln je Person (Patrick 27. November 2026: „die Kacheln will ich schieben können“)
const REIHE = "erpLogistikReihe";
function reiheLesen() {
  const r = String((alt.einstellungWert && alt.einstellungWert(REIHE, "")) || "").split(",").filter(Boolean);
  return r.filter((id) => KACHELN.some((k) => k.id === id)).concat(KACHELN.map((k) => k.id).filter((id) => !r.includes(id)));
}

export default function Logistik({ d, neu }) {
  const [kachel, setKachel] = useState(() => {
    const k = wiederhergestellt ? gemerkt.kachel : null;
    wiederhergestellt = false;
    return k;
  });
  const [reihe, setReihe] = useState(reiheLesen);
  useGemerkt(gemerkt, { kachel });
  // Ziehen mit Maus, Finger oder Stift: erst ab 8 Punkten Bewegung, sonst bleibt es ein Antippen
  const zug = useRef(null);
  const runter = (e, id) => {
    if (e.button > 0) return;
    zug.current = { id, x: e.clientX, y: e.clientY, aktiv: false, reihe: reihe.slice() };
    const bewegen = (ev) => {
      const z = zug.current; if (!z) return;
      if (!z.aktiv && Math.hypot(ev.clientX - z.x, ev.clientY - z.y) < 8) return;
      z.aktiv = true; document.body.classList.add("zieh-laeuft");
      const ziel = document.elementFromPoint(ev.clientX, ev.clientY);
      const k = ziel && ziel.closest("[data-logi-kachel]");
      const zid = k && k.getAttribute("data-logi-kachel");
      if (zid && zid !== z.id) {
        const r = z.reihe.filter((x) => x !== z.id);
        r.splice(z.reihe.indexOf(zid), 0, z.id);
        z.reihe = r; setReihe(r);
      }
    };
    const los = () => {
      const z = zug.current;
      window.removeEventListener("pointermove", bewegen); window.removeEventListener("pointerup", los); window.removeEventListener("pointercancel", los);
      document.body.classList.remove("zieh-laeuft");
      if (z && z.aktiv) {
        z.nachZug = true;
        try { alt.einstellungAblegen && alt.einstellungAblegen(REIHE, z.reihe.join(",")); } catch (_) { /* nur Komfort */ }
      }
      setTimeout(() => { zug.current = null; }, 0);
    };
    window.addEventListener("pointermove", bewegen); window.addEventListener("pointerup", los); window.addEventListener("pointercancel", los);
  };
  const tippen = (id) => {
    if (zug.current && zug.current.nachZug) return;
    setKachel(kachel === id ? null : id);
  };
  const liste = reihe.map((id) => KACHELN.find((k) => k.id === id)).filter(Boolean);
  return (
    <div className="erp-logistik">
      <div className="logi-kacheln">
        {liste.map((k) => {
          const n = k.zahl(d), w = k.warn ? k.warn(d) : 0;
          return (
            <button key={k.id} className={"logi-kachel" + (kachel === k.id ? " aktiv" : "")} data-logi-kachel={k.id}
              onPointerDown={(e) => runter(e, k.id)} onClick={() => tippen(k.id)}
              onDragStart={(e) => e.preventDefault()} title="Antippen öffnet, ziehen verschiebt">
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
      {kachel === "einlagern" && <Einlagern d={d} neu={neu} />}
      {kachel === "wbg" && <WbgDrucken d={d} neu={neu} />}
      {kachel === "ls-neu" && <LieferscheinAnlegen d={d} neu={neu} />}
      {kachel === "lieferplan" && <LieferplanListe d={d} neu={neu} />}
      {kachel === "extern" && <AktuellExtern d={d} neu={neu} />}
      {kachel === "fa" && <section className="logi-funktion" data-logi-funktion="fa">
        <h2 className="logi-funktion__titel">FA Übersicht</h2><BelegListe d={d} neu={neu} typ="fertigung" ohneNeu /></section>}
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

// Wunsch Patrick 27. November 2026: „eine Kachel für Teile aus Fertigung einlagern“
function Einlagern({ d, neu }) {
  const [suche, setSuche] = useState("");
  // Aktuelle Stückzahl je Planwand-Auftrag: letzter Zählerstand (production_records.quantity ist der
  // Gesamtzähler seit Auftragsbeginn), Wunsch Patrick 27. November 2026
  const [stk, setStk] = useState(null);
  const jobIds = [...new Set(offeneEinlagern(d).map((x) => x.pw && x.pw.job_id).filter(Boolean))];
  useEffect(() => {
    let weg = false;
    (async () => {
      const m = new Map();
      for (let i = 0; i < jobIds.length; i += 100) {
        const r = await alt.db.from("production_records").select("job_id, quantity, record_date")
          .in("job_id", jobIds.slice(i, i + 100)).order("record_date", { ascending: false });
        ((r && r.data) || []).forEach((x) => { if (!m.has(x.job_id)) m.set(x.job_id, Number(x.quantity) || 0); });
      }
      if (!weg) setStk(m);
    })().catch(() => { if (!weg) setStk(new Map()); });
    return () => { weg = true; };
  }, [jobIds.join(",")]);
  const liste = offeneEinlagern(d).filter(({ b, p, pw }) => {
    const k = d.partnerMap.get(b.partner_id) || {};
    return passt(suche, [b.nr, k.nr, k.name, artikelText(d.artikelMap.get(p.artikel_id)), pw && pw.maschine].join(" "));
  });
  const buchen = async (b) => {
    const n = await allesLaden();
    fensterOeffnen((zu) => <FertigFenster d={n} b={n.belegMap.get(b.id) || b} zu={zu} fertig={async () => { neu(); }} />);
  };
  return (
    <section className="logi-funktion" data-logi-funktion="einlagern">
      <div className="mat-kopf">
        <h2 className="logi-funktion__titel">Fertigung einlagern</h2>
        <Suche wert={suche} setzen={setSuche} platzhalter="FA, Kunde, Artikel, Maschine …" />
      </div>
      <p className="klein">Zeile antippen meldet Teile des FA fertig und lagert sie ein: Menge, Lagerart und Lagerplatz eingeben. Die FA-Nummer öffnet den FA.</p>
      <Tabelle kopf={["FA", "Kunde", "Artikel", "Stand", "Planwand", "Soll", "Stückzahl", "Eingelagert", "Offen"]}
        leer="Keine offenen Fertigungsaufträge."
        zeilen={liste.map(({ b, p, ein, offen, pw }) => ({
          key: p.id, klick: () => buchen(b),
          zellen: [<a href="#" data-logi-fa={b.nr} onClick={(e) => { e.preventDefault(); e.stopPropagation(); belegOeffnen(d, neu, b); }}>{b.nr}</a>,
            partnerText(d.partnerMap.get(b.partner_id)),
            artikelText(d.artikelMap.get(p.artikel_id)) + (posIdx(d, p) ? " · Index " + posIdx(d, p) : ""),
            belegStand(d, b)[0], planwandZelle(b) || "–",
            mengeText(p.menge), stk == null ? "…" : (pw && stk.has(pw.job_id) ? <span data-logi-stk="">{mengeText(stk.get(pw.job_id))}</span> : "–"),
            mengeText(ein), <b>{mengeText(offen)}</b>],
        }))} />
    </section>
  );
}

// Wunsch Patrick 27. November 2026: „eine Kachel WBG drucken auf den Spedi-Drucker“.
// Gedruckt wird wie mit „Spedition WBG“ im Betrachter: über den Pool-Rechner auf den zweiten
// WBG-Drucker (Einstellungen → Dokumente → „Drucker Spedition WBG“).
function WbgDrucken({ d, neu }) {
  const [suche, setSuche] = useState("");
  const [wbg, setWbg] = useState(null); // job_id → wbg_url
  const [spedi, setSpedi] = useState(undefined);
  const [druckt, setDruckt] = useState({});
  // Anzahl Kopien je FA (Patrick 27. November 2026: „beim WBG-Druck soll die Menge ausgewählt werden können“)
  const [kopien, setKopien] = useState({});
  const kop = (b) => Math.max(1, Math.min(20, Number(kopien[b.id]) || 1));
  const fas = wbgFas(d);
  const ids = fas.map((b) => b.daten.planwand.job_id);
  useEffect(() => {
    let weg = false;
    (async () => {
      const m = new Map();
      for (let i = 0; i < ids.length; i += 100) {
        const r = await alt.db.from("jobs").select("id, wbg_url").in("id", ids.slice(i, i + 100));
        ((r && r.data) || []).forEach((j) => { if (j.wbg_url) m.set(j.id, j.wbg_url); });
      }
      if (!weg) setWbg(m);
    })().catch(() => { if (!weg) setWbg(new Map()); });
    poolDruckLaden().then((k) => { if (!weg) setSpedi(poolWbgDrucker(k)[1] || ""); }).catch(() => { if (!weg) setSpedi(""); });
    return () => { weg = true; };
  }, [ids.join(",")]);
  const liste = fas.filter((b) => {
    const p = (d.posJe.get(b.id) || []).find((x) => x.artikel_id);
    const k = d.partnerMap.get(b.partner_id) || {};
    return passt(suche, [b.nr, k.nr, k.name, p && artikelText(d.artikelMap.get(p.artikel_id)), b.daten.planwand.maschine].join(" "));
  });
  const drucken = async (b, url) => {
    if (!spedi) { alt.meldung("Unter Einstellungen → Dokumente ist kein „Drucker Spedition WBG“ gewählt.", "warn"); return; }
    setDruckt((x) => ({ ...x, [b.id]: true }));
    try {
      const a = await fetch(url);
      if (!a.ok) throw new Error("WBG nicht erreichbar");
      const daten = new Uint8Array(await a.arrayBuffer());
      const { pdfjs } = await import("../../teile/PdfAnsicht.jsx");
      const seiten = await pdfSeitenAlsJpg(await pdfjs(), daten);
      await poolDrucken({ art: "bilder", bilder: seiten.map((x) => x.blob), titel: "WBG FA " + b.nr, kopien: kop(b), drucker: spedi });
    } catch (f) {
      alt.meldung("Drucken ging nicht: " + (alt.fehlertext ? alt.fehlertext(f) : String(f && f.message || f)), "fehler");
    } finally { setDruckt((x) => ({ ...x, [b.id]: false })); }
  };
  const ansehen = (b, url) => alt.betrachter && alt.betrachter(url, "WBG FA " + b.nr, true);
  return (
    <section className="logi-funktion" data-logi-funktion="wbg">
      <div className="mat-kopf">
        <h2 className="logi-funktion__titel">WBG drucken</h2>
        <Suche wert={suche} setzen={setSuche} platzhalter="FA, Kunde, Artikel, Maschine …" />
      </div>
      <p className="klein">Mit − und + die Anzahl wählen, „Drucken“ schickt die WBG sofort an den Drucker der Spedition. Zeile antippen zeigt die WBG zuerst an.
        {spedi === "" && <b className="erp-rot"> Kein Drucker Spedition gewählt (Einstellungen → Dokumente).</b>}</p>
      <Tabelle kopf={["FA", "Kunde", "Artikel", "Planwand", "WBG", "Anzahl / Drucken"]}
        leer="Keine offenen FAs mit Auftrag auf der Planwand."
        zeilen={liste.map((b) => {
          const p = (d.posJe.get(b.id) || []).find((x) => x.artikel_id);
          const pw = b.daten.planwand;
          const url = wbg && wbg.get(pw.job_id);
          return {
            key: b.id, klick: url ? () => ansehen(b, url) : undefined,
            zellen: [<a href="#" data-logi-fa={b.nr} onClick={(e) => { e.preventDefault(); e.stopPropagation(); belegOeffnen(d, neu, b); }}>{b.nr}</a>,
              partnerText(d.partnerMap.get(b.partner_id)),
              p ? artikelText(d.artikelMap.get(p.artikel_id)) + (posIdx(d, p) ? " · Index " + posIdx(d, p) : "") : "–",
              [pw.maschine, ({ geplant: "geplant", ruesten: "rüsten", laeuft: "läuft", fertig: "fertig" })[pw.stand] || pw.stand].filter(Boolean).join(" · "),
              wbg == null ? "…" : url ? "vorhanden" : <span className="erp-rot">keine WBG</span>,
              url ? <span className="logi-wbg-druck" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="knopf knopf--klein" aria-label="Weniger" disabled={kop(b) <= 1}
                  onClick={() => setKopien((x) => ({ ...x, [b.id]: kop(b) - 1 }))}>−</button>
                <b data-logi-wbg-kopien={b.nr} title="Anzahl">{kop(b)}</b>
                <button type="button" className="knopf knopf--klein" aria-label="Mehr" data-logi-wbg-mehr={b.nr} disabled={kop(b) >= 20}
                  onClick={() => setKopien((x) => ({ ...x, [b.id]: kop(b) + 1 }))}>+</button>
                <button type="button" className="knopf knopf--klein knopf--spedition" data-logi-wbg-drucken={b.nr} disabled={!!druckt[b.id]}
                  onClick={() => drucken(b, url)}>{druckt[b.id] ? "Druckt …" : "Drucken"}</button></span> : ""],
          };
        })} />
    </section>
  );
}

// Wunsch Patrick 27. November 2026: „eine Kachel Lieferschein anlegen“
function LieferscheinAnlegen({ d, neu }) {
  const [suche, setSuche] = useState("");
  const [alle, setAlle] = useState(false);
  const liste = offeneLieferungen(d).filter(({ b, p, lager }) => {
    if (!alle && !(lager > 0)) return false;
    const k = d.partnerMap.get(b.partner_id) || {};
    return passt(suche, [b.nr, k.nr, k.name, artikelText(d.artikelMap.get(p.artikel_id)), (b.daten || {}).ihre_bestellung].join(" "));
  });
  const liefern = async (b, p) => {
    const n = await allesLaden();
    fensterOeffnen((zu) => <LieferscheinFenster d={n} b={n.belegMap.get(b.id) || b} nurPos={p.id} zu={zu} fertig={async () => { neu(); }} />);
  };
  return (
    <section className="logi-funktion" data-logi-funktion="ls-neu">
      <div className="mat-kopf">
        <h2 className="logi-funktion__titel">Lieferschein anlegen</h2>
        <Suche wert={suche} setzen={setSuche} platzhalter="Auftrag, Kunde, Artikel …" />
        <label className="feld-haken" data-logi-ls-alle=""><input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} /> Auch ohne Lagerbestand</label>
      </div>
      <p className="klein">Zeile antippen erstellt den Lieferschein für diese Position: Menge und Charge wählen, speichern. Die Auftragsnummer öffnet den Auftrag.</p>
      <Tabelle kopf={["Fällig", "Auftrag", "Kunde", "Artikel", "Offen", "Am Lager"]}
        leer={alle ? "Keine offenen Auftragspositionen." : "Nichts lieferbar: keine offene Position mit Teilen am Lager."}
        zeilen={liste.map(({ b, p, offen, faellig, lager }) => ({
          key: p.id, klasse: faellig && faellig < heute() ? "erp-rot" : (lager > 0 ? "" : "erp-blass"),
          klick: lager > 0 ? () => liefern(b, p) : undefined, sort: [faellig || ""],
          zellen: [faellig ? datumText(faellig) : "–",
            <a href="#" data-logi-beleg={b.nr} onClick={(e) => { e.preventDefault(); e.stopPropagation(); belegOeffnen(d, neu, b); }}>{b.nr}</a>,
            partnerText(d.partnerMap.get(b.partner_id)),
            artikelText(d.artikelMap.get(p.artikel_id)) + (posIdx(d, p) ? " · Index " + posIdx(d, p) : ""),
            <b>{mengeText(offen)}</b>, mengeText(lager)],
        }))} />
    </section>
  );
}

const lpZeit = { von: "", bis: "" };
teilMerken("erp-logistik-lieferplan", () => ({ ...lpZeit }), (z) => { Object.assign(lpZeit, z); });

// Wunsch Patrick 27. November 2026: „Kachel Lieferplan Liste: alle fälligen Lieferungen für den
// gewünschten Zeitraum, sortiert nach Kunde, zum Drucken, nach dem angehängten Beispiel“
function LieferplanListe({ d, neu }) {
  const [von, setVon] = useState(lpZeit.von || heute());
  const [bis, setBis] = useState(lpZeit.bis || plusTage(heute(), 14));
  lpZeit.von = von; lpZeit.bis = bis;
  const liste = von && bis ? lieferplanListe(d, von, bis) : [];
  return (
    <section className="logi-funktion" data-logi-funktion="lieferplan">
      <div className="mat-kopf">
        <h2 className="logi-funktion__titel">Lieferplan Liste</h2>
        <label className="feld-inline">von <input type="date" value={von} data-logi-lp-von="" onChange={(e) => setVon(e.target.value)} /></label>
        <label className="feld-inline">bis <input type="date" value={bis} data-logi-lp-bis="" onChange={(e) => setBis(e.target.value)} /></label>
        <button type="button" className="knopf knopf--klein" data-logi-lp-drucken="" disabled={!von || !bis}
          onClick={() => lieferplanDrucken(d, liste, von, bis)}>Drucken</button>
      </div>
      <p className="klein">Alle Fälligkeiten aus den Lieferplänen der offenen Aufträge im Zeitraum, nach Kunde und Termin. Bereits Geliefertes ist abgezogen. Zeile antippen öffnet den Auftrag.</p>
      <Tabelle kopf={["Kunde", "Termin", "Auftr. Nr", "Artikel", "Art. Nr.", "Lagerort", "Lag. Best.", "Menge"]}
        leer="Keine fälligen Lieferungen im Zeitraum."
        zeilen={liste.map(({ b, p, termin, offen }, i) => {
          const a = d.artikelMap.get(p.artikel_id);
          const l = lagerVon(d, p);
          return { key: p.id + "|" + termin + "|" + i, klick: () => belegOeffnen(d, neu, b), sort: [null, termin],
            zellen: [partnerText(d.partnerMap.get(b.partner_id)), datumText(termin), b.nr + "-" + Math.round(p.pos / 10),
              a ? (a.bezeichnung || a.nr) : p.text || "", a ? a.nr : "", l.plaetze, mengeText(l.menge), <b>{mengeText(offen)}</b>] };
        })} />
    </section>
  );
}

function AktuellExtern({ d, neu }) {
  const [suche, setSuche] = useState("");
  const lief = (b) => partnerText(d.partnerMap.get(b.partner_id));
  const liste = offeneZaPositionen(d).filter(({ b, p }) =>
    passt(suche, [lief(b), b.nr, (b.daten || {}).fa_nr, artikelText(d.artikelMap.get(p.artikel_id)), p.text].join(" ")))
    .sort((x, y) => lief(x.b).localeCompare(lief(y.b)) || String(x.p.termin || "9999").localeCompare(String(y.p.termin || "9999")));
  const summe = new Map();
  liste.forEach(({ b, offen }) => summe.set(b.partner_id, (summe.get(b.partner_id) || 0) + offen));
  return (
    <section className="logi-funktion" data-logi-funktion="extern">
      <div className="mat-kopf">
        <h2 className="logi-funktion__titel">Aktuell extern</h2>
        <Suche wert={suche} setzen={setSuche} platzhalter="Lieferant, Bestellung, FA, Artikel …" />
      </div>
      <p className="klein">Teile bei Lieferanten für Zusatzarbeit (ZA extern): bestellt minus schon zurück. Im Lager wird dabei nichts gebucht. Zeile antippen öffnet die Bestellung.
        {summe.size > 0 && <> Total: {[...summe.entries()].map(([id, n]) => (d.partnerMap.get(id) || {}).name + " " + mengeText(n)).join(" · ")}</>}</p>
      <Tabelle kopf={["Lieferant", "Bestellung", "FA", "Artikel", "Arbeitsgang", "Draussen", "Seit", "Zurück erwartet"]}
        leer="Im Moment ist nichts extern."
        zeilen={liste.map(({ b, p, offen }) => ({
          key: p.id, klick: () => belegOeffnen(d, neu, b), klasse: p.termin && p.termin < heute() ? "erp-rot" : "", sort: [null, null, null, null, null, null, b.datum || "", p.termin || ""],
          zellen: [lief(b), b.nr, (b.daten || {}).fa_nr || "–",
            artikelText(d.artikelMap.get(p.artikel_id)) + (posIdx(d, p) ? " · Index " + posIdx(d, p) : ""),
            p.text || "", <b>{mengeText(offen)}</b>, b.datum ? datumText(b.datum) : "–", p.termin ? datumText(p.termin) : "–"],
        }))} />
    </section>
  );
}
