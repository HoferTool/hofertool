// Test ERP: gemeinsame Bausteine (Formularfenster, Listen in Formularen, Druckblatt)
import { useState } from "react";
import { useSortierung, sortiert, zellText, sortPfeil } from "../../teile/sortieren.js";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { briefBlatt } from "../../teile/briefkopf.js";
import { adresseText, chf, datumText, mengeText, terminText, belegSumme, BELEGTYP, artikelText, artikelIdxText, posIdx, posPe, posBetrag, peKurz, kwText, folgePositionen,
  HOFER_LAGERARTEN, istHoferLager, lagerFuer, lagerName, lagerplatzId, bestand } from "../../daten/erp.js";

// Felder eines Arbeitsgangs (Arbeitsplan beim Artikel und Fenster Arbeitsplan)
export const AG_FELDER = [
  { name: "bez", label: "Arbeitsgang" }, { name: "maschine", label: "Betriebsmittel / Lieferant" },
  { name: "te", label: "te s/Stk" }, { name: "ruest", label: "Rüsten h" },
  { name: "extern", label: "extern", typ: "haken" }, { name: "pruef", label: "Prüfung / Hinweis" },
];

// Ein Feld nach Beschreibung: { name, label, typ (text|zahl|datum|textarea|haken|liste),
//   auswahl: [[wert, text]], felder (bei liste), breit, hinweis }
export function Feld({ f, wert, setzen }) {
  const v = wert ?? "";
  if (f.typ === "haken") {
    return <label className="feld-haken erp-feld"><input type="checkbox" checked={!!wert}
      onChange={(e) => setzen(e.target.checked)} /><span>{f.label}</span></label>;
  }
  if (f.typ === "liste") return <Liste f={f} wert={wert || []} setzen={setzen} />;
  let eingabe;
  if (f.auswahl) {
    eingabe = <select value={String(v)} onChange={(e) => setzen(e.target.value)} data-erp-feld={f.name}>
      {f.auswahl.map(([w, t]) => <option key={w} value={w}>{t}</option>)}</select>;
  } else if (f.typ === "textarea") {
    eingabe = <textarea rows={f.zeilen || 3} value={v} onChange={(e) => setzen(e.target.value)} data-erp-feld={f.name} />;
  } else {
    eingabe = <input type={f.typ === "datum" ? "date" : "text"} value={v} placeholder={f.platzhalter || ""}
      inputMode={f.typ === "zahl" ? "decimal" : undefined} data-erp-feld={f.name}
      onChange={(e) => setzen(e.target.value)} />;
  }
  return <label className={"feld erp-feld" + (f.breit ? " erp-feld--breit" : "")}><span>{f.label}</span>{eingabe}
    {f.hinweis && <span className="feldhinweis">{f.hinweis}</span>}</label>;
}

// ---------- Lager beim Buchen ----------
// Hofer + Co Artikel: Lagerart (FL, HFL, EXT, SPL) wählen und Platz frei
// eintippen, ohne Stammdaten (Patrick 25. November 2026). Rohmaterial und
// Werkzeug: Lagerplatz aus den Stammdaten wie bisher.
const istHofer = (artikel) => !artikel || artikel.art === "hofer";

// Der Platz gehört zur Einbuchung und bleibt, solange aus ihr Teile am Lager
// sind (Patrick 25. November 2026): Bestand je Charge und Platz. Ist alles weg,
// erscheint der Platz nirgends mehr, auch nicht als Vorschlag.
const plaetzeMitBestand = (d, lart, artikelId) => {
  const ids = new Set(bestand(d).filter((e) => e.menge > 0 && (!artikelId || e.artikel_id === artikelId)).map((e) => e.lager_id));
  return [...new Set(d.lager.filter((l) => ids.has(l.id) && l.lagerart === lart).map((l) => l.platz))].sort();
};

export function lagerStart(d, artikel) {
  if (istHofer(artikel)) {
    // Vorschlag: FL-Platz, an dem dieser Artikel schon liegt, sonst leer
    const da = artikel ? plaetzeMitBestand(d, "FL", artikel.id) : [];
    return { lart: "FL", lplatz: da[0] || "", lager: "" };
  }
  const l = lagerFuer(d.lager.filter((x) => !istHoferLager(x.lagerart)), artikel.art)[0];
  return { lart: "", lplatz: "", lager: l ? l.id : "" };
}

export async function lagerAus(d, artikel, w) {
  if (istHofer(artikel)) return lagerplatzId(d, w.lart, w.lplatz);
  return w.lager || null;
}

export function LagerEingabe({ d, artikel, w, setzen, id }) {
  if (istHofer(artikel)) {
    const liste = "erp-lplaetze-" + (id || "x");
    const plaetze = plaetzeMitBestand(d, w.lart);
    return (
      <>
        <Feld f={{ name: "lart", label: "Lagerart", auswahl: HOFER_LAGERARTEN.map((a) => [a.code, a.code + " · " + a.text]) }}
          wert={w.lart} setzen={(v) => setzen("lart", v)} />
        <label className="feld erp-feld"><span>Lagerplatz</span>
          <input type="text" value={w.lplatz || ""} list={liste} data-erp-feld="lplatz" placeholder="frei eintippen"
            onChange={(e) => setzen("lplatz", e.target.value)} />
          <datalist id={liste}>{plaetze.map((p) => <option key={p} value={p} />)}</datalist></label>
      </>
    );
  }
  const wahl = lagerFuer(d.lager.filter((x) => !istHoferLager(x.lagerart)), artikel.art)
    .map((l) => [l.id, lagerName(l) + (l.bezeichnung ? " · " + l.bezeichnung : "")]);
  return <Feld f={{ name: "lager", label: "Lager", auswahl: [["", "—"]].concat(wahl) }} wert={w.lager} setzen={(v) => setzen("lager", v)} />;
}

function Liste({ f, wert, setzen }) {
  const neu = () => setzen(wert.concat([Object.fromEntries(f.felder.map((x) => [x.name, x.vorgabe ?? ""]))]));
  return (
    <fieldset className="erp-liste erp-feld--breit"><legend>{f.label}</legend>
      {wert.map((z, i) => (
        <div key={i} className="erp-liste__zeile">
          {f.felder.map((x) => <Feld key={x.name} f={x} wert={z[x.name]}
            setzen={(w) => setzen(wert.map((y, j) => (j === i ? { ...y, [x.name]: w } : y)))} />)}
          <button type="button" className="knopf knopf--klein knopf--gefahr" title="Entfernen"
            onClick={() => setzen(wert.filter((_, j) => j !== i))}>✕</button>
        </div>))}
      <button type="button" className="knopf knopf--klein" onClick={neu}>+ {f.neu || "Zeile"}</button>
    </fieldset>
  );
}

// Fenster mit Formular. speichern(werte) wirft bei Fehler, sonst schliesst es.
// gross: Stammdaten-Fenster mit viel Platz für die Übersicht (Wunsch Patrick
// 21. November 2026: „gross mit viel Platz für die Übersicht“)
export function formular({ titel, felder, wert, speichern, loeschen, breit, gross }) {
  fensterOeffnen((zu) => <Formular titel={titel} felder={felder} wert={wert || {}} speichern={speichern}
    loeschen={loeschen} zu={zu} breit={breit} gross={gross} />);
}

function Formular({ titel, felder, wert, speichern, loeschen, zu, breit, gross }) {
  const [w, setW] = useState(wert);
  const [laeuft, setLaeuft] = useState(false);
  const los = async () => {
    setLaeuft(true);
    try { await speichern(w); zu(); } catch (e) { alt.meldung(alt.fehlertext(e), "fehler"); setLaeuft(false); }
  };
  return (
    <div className={"dialog erp-fenster" + (gross ? " erp-fenster--gross" : breit ? " erp-fenster--breit" : "")} role="dialog">
      <h2>{titel}</h2>
      <div className="erp-formular">
        {felder.filter(Boolean).map((f) => f.titel
          ? <h3 key={f.titel} className="erp-formular__titel">{f.titel}</h3>
          : <Feld key={f.name} f={f} wert={w[f.name]} setzen={(x) => setW((a) => ({ ...a, [f.name]: x }))} />)}
      </div>
      <div className="dialog__knoepfe">
        {loeschen && <button className="knopf knopf--gefahr" onClick={async () => {
          if (await alt.nachfragen({ titel: "Löschen", text: titel + " löschen?", bestaetigen: "Löschen", gefahr: true })) {
            try { await loeschen(); zu(); } catch (e) { alt.meldung(alt.fehlertext(e), "fehler"); }
          }
        }}>Löschen</button>}
        <button className="knopf knopf--still" data-nein="" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" disabled={laeuft} data-erp-speichern="" onClick={los}>Speichern</button>
      </div>
    </div>
  );
}

// Tabelle mit Kopf; zeilen: [{ key, zellen: [...], klick }]
// Ein Tipp auf den Spaltenkopf sortiert (seit 1.898.0, src/teile/sortieren.js);
// z.sort[i] gibt bei Bedarf einen eigenen Sortierwert für Spalte i.
export function Tabelle({ kopf, zeilen, leer }) {
  const [sort, sortKlick] = useSortierung();
  if (!zeilen.length) return <div className="karte karte--hinweis"><p>{leer || "Noch keine Einträge."}</p></div>;
  const reihe = sortiert(zeilen, sort, sortText);
  return (
    <div className="erp-tabelle-huelle">
      <table className="erp-tabelle">
        <thead><tr>{kopf.map((k, i) => <SortKopf key={i} k={k} i={i} sort={sort} klick={sortKlick} />)}</tr></thead>
        <tbody>{reihe.map((z) => (
          <tr key={z.key} className={(z.klick ? "erp-klick" : "") + (z.klasse ? " " + z.klasse : "")}
            onClick={z.klick} data-erp-zeile={z.key}>
            {z.zellen.map((c, i) => <td key={i}>{c}</td>)}</tr>))}</tbody>
      </table>
    </div>
  );
}

// Text einer Zelle zum Sortieren
export const sortText = (z, i) => (z.sort && z.sort[i] != null ? String(z.sort[i]) : zellText(z.zellen[i]));

// Spaltenkopf zum Antippen; ohne Titel (z. B. Häkchen-Spalte) nicht sortierbar
export function SortKopf({ k, i, sort, klick, className }) {
  if (!zellText(k).trim()) return <th className={className}>{k}</th>;
  return <th className={(className ? className + " " : "") + "erp-sortkopf" + (sort && sort.spalte === i ? " erp-sortkopf--an" : "")}
    data-erp-sort={i} title="Antippen sortiert" onClick={() => klick(i)}>{k}{sortPfeil(sort, i)}</th>;
}

export function Suche({ wert, setzen, platzhalter, fokus }) {
  return <input className="mat-sucheingabe erp-suche" type="search" value={wert} placeholder={platzhalter || "Suchen …"}
    autoFocus={!!fokus} onChange={(e) => setzen(e.target.value)} />;
}

// Listen zeigen erst mit Suchbegriff etwas (Wunsch Patrick 26. November 2026:
// „mach das überall so im test erp, nicht nur in der kalk“), damit die Seite
// nicht erst Tausende Zeilen zeichnen muss.
// Im Prüfstand zeigt TEST.erpAlle alles wie vorher, damit die Abläufe nicht
// überall erst suchen müssen.
export const ohneSuche = (s) => !(window.TEST && window.TEST.erpAlle) && !String(s || "").trim();
export const sucheLeer = (was) => "Suchbegriff eintippen, dann erscheinen die " + was + ".";

export const passt = (suche, text) => {
  const s = suche.trim().toLowerCase();
  return !s || s.split(/\s+/).every((x) => String(text).toLowerCase().includes(x));
};

export async function tun(fn, gut) {
  try { const r = await fn(); if (gut) alt.meldung(gut, "gut"); return r; }
  catch (e) { alt.meldung(alt.fehlertext(e), "fehler"); return null; }
}

// ---------- Druckblatt eines Belegs ----------
export function belegDrucken(d, b) {
  const t = BELEGTYP[b.typ];
  const p = d.partnerMap.get(b.partner_id) || {};
  const pd = p.daten || {};
  const an = (b.daten && b.daten.anschrift) || { name: p.name, ...(pd.adresse || {}) };
  const pos = d.posJe.get(b.id) || [];
  const mitPreis = b.typ !== "lieferschein" && b.typ !== "fertigung";
  const s = belegSumme(d, b);
  const esc = alt.esc;
  const bed = (id) => (d.bedingungen.find((x) => x.id === id) || {}).text || "";
  const zeilen = pos.map((x) => {
    const a = d.artikelMap.get(x.artikel_id);
    const ix = posIdx(d, x);
    const text = a ? esc(artikelIdxText(a, ix)) + (a.zeichnung ? "<br><small>Zeichnung " + esc(a.zeichnung) + (ix ? " Index " + esc(ix) : "") + "</small>" : "") : esc(x.text || "");
    return "<tr><td>" + x.pos + "</td><td>" + text
      + (x.daten && x.daten.charge ? "<br><small>Charge " + esc(x.daten.charge) + "</small>" : "")
      + (x.text && a ? "<br><small>" + esc(x.text) + "</small>" : "") + "</td><td class='r'>" + mengeText(x.menge) + " " + esc(x.einheit || "")
      + "</td><td>" + esc(terminText(x)) + "</td>"
      + (mitPreis ? "<td class='r'>" + chf(x.preis) + (posPe(x) > 1 ? " " + peKurz(posPe(x)) : "") + "</td><td class='r'>" + chf(posBetrag(x)) + "</td>" : "") + "</tr>";
  }).join("");
  const roh = "<!doctype html><html><head><meta charset='utf-8'><title>" + esc(t.name + " " + b.nr) + "</title><style>"
    + "body{font:11pt Arial,sans-serif;margin:18mm 16mm;color:#111}h1{font-size:16pt;margin:30px 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}"
    + "th,td{border-bottom:1px solid #ccc;padding:5px 4px;vertical-align:top;text-align:left}th{background:#eef2f7}.r{text-align:right}"
    + ".kopf{display:flex;justify-content:space-between}.adr{white-space:pre-line;margin-top:24px}.summe{margin-left:auto;width:260px;margin-top:10px}"
    + ".summe div{display:flex;justify-content:space-between}.test{color:#b00;font-weight:bold}small{color:#555}@media print{.test{display:none}}</style></head><body>"
    + "<!--INHALT-->"
    + "<p class='test'>TESTVERSION ERP</p>"
    + "<div class='adr'>" + esc(adresseText(an)) + "</div>"
    + "<h1>" + esc(t.name) + " " + esc(b.nr) + "</h1>"
    + "<div>Datum " + datumText(b.datum) + " · Kunde/Lieferant " + esc(p.nr || "")
    + (b.daten && b.daten.ihre_nr ? " · Ihre Bestellung " + esc(b.daten.ihre_nr) : "")
    + (b.art === "rahmen" ? " · Rahmenauftrag" : "") + "</div>"
    + "<table><thead><tr><th>Pos</th><th>Artikel</th><th class='r'>Menge</th><th>Termin</th>"
    + (mitPreis ? "<th class='r'>Preis CHF</th><th class='r'>Betrag CHF</th>" : "") + "</tr></thead><tbody>" + zeilen + "</tbody></table>"
    + (mitPreis ? "<div class='summe'><div><span>Netto</span><b>" + chf(s.netto) + "</b></div><div><span>MWST " + s.satz + " %</span><span>"
      + chf(s.steuer) + "</span></div><div><span>Total CHF</span><b>" + chf(s.brutto) + "</b></div></div>" : "")
    + "<p>" + esc([bed(b.daten && b.daten.liefer), bed(b.daten && b.daten.zahlung)].filter(Boolean).join(" · ")) + "</p>"
    + (b.daten && b.daten.text ? "<p style='white-space:pre-line'>" + esc(b.daten.text) + "</p>" : "")
    + "<script>setTimeout(()=>print(),300)</script></body></html>";
  const html = briefBlatt(roh);
  const w = window.open("", "_blank");
  if (!w) { alt.meldung("Das Fenster wurde vom Browser blockiert.", "warn"); return; }
  w.document.write(html);
  w.document.close();
}

// ---------- Auftragsbestätigung (seit 1.818.0) ----------
// Wunsch Patrick 25. November 2026: „aus dem Auftrag direkt die
// Auftragsbestätigung drucken“, aufgebaut wie die AB aus dem Gewatec:
// Kopf mit Bestätigungs-Nr. und Kundenadresse samt Strichcode, je Position
// Ihre Bestellung, Werkstoff, Zeichnung/Index, Ident-Nr. und Lieferplan.
const CODE39 = {
  0: "nnnwwnwnn", 1: "wnnwnnnnw", 2: "nnwwnnnnw", 3: "wnwwnnnnn", 4: "nnnwwnnnw",
  5: "wnnwwnnnn", 6: "nnwwwnnnn", 7: "nnnwnnwnw", 8: "wnnwnnwnn", 9: "nnwwnnwnn",
  "-": "nwnnnnwnw", "*": "nwnnwnwnn",
};
export function code39Svg(text, hoehe = 34) {
  const t = String(text || "");
  if (!t || !/^[0-9-]+$/.test(t)) return "";
  let x = 0;
  const balken = [];
  for (const z of "*" + t + "*") {
    [...CODE39[z]].forEach((m, i) => {
      const w = m === "w" ? 2.5 : 1;
      if (i % 2 === 0) balken.push("<rect x='" + x + "' y='0' width='" + w + "' height='" + hoehe + "'/>");
      x += w;
    });
    x += 1;
  }
  return "<svg class='code39' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + x + " " + hoehe + "' width='" + (x * 1.1) + "' height='" + hoehe + "' preserveAspectRatio='none'>" + balken.join("") + "</svg>";
}

export function abDrucken(d, b) {
  const esc = alt.esc;
  const p = d.partnerMap.get(b.partner_id) || {};
  const pd = p.daten || {};
  const bd = b.daten || {};
  const an = bd.rechnung_an || { name: p.name, ...(pd.adresse || {}) };
  const liefer = bd.anschrift || null;
  const pos = d.posJe.get(b.id) || [];
  const s = belegSumme(d, b);
  const bed = (id) => (d.bedingungen.find((x) => x.id === id) || {}).text || "";
  const name = (alt.meinName && alt.meinName()) || "";
  const mail = (alt.meineMail && alt.meineMail()) || "admin@hoferco.ch";
  const tel = String((alt.einstellungWert && (alt.einstellungWert("telefon", "") || alt.einstellungWert("rk_tel", ""))) || "") || "032 677 55 77";
  const kontakt = (pd.kontakte || [])[0] || {};
  const z = (l, w) => (w ? "<tr><td class='l'>" + esc(l) + "</td><td>" + esc(w) + "</td></tr>" : "");
  const zeilen = pos.map((x, i) => {
    const a = d.artikelMap.get(x.artikel_id);
    const ad = (a && a.daten) || {};
    const xd = x.daten || {};
    const ix = posIdx(d, x);
    const roh = ad.rohmaterial_id && d.artikelMap.get(ad.rohmaterial_id);
    const werkstoff = (roh && roh.bezeichnung) || ad.material || "";
    const wid = (/\b1\.\d{4}\b/.exec(werkstoff) || [])[0] || "";
    const titel = a ? (a.bezeichnung || artikelIdxText(a, ix)) : (x.text || "");
    const pe = posPe(x);
    const abrufe = (xd.abrufe || []).filter((r) => r.termin || r.kw || r.menge || r.abruf);
    const lp = abrufe.length
      ? abrufe.map((r) => "<tr><td>" + esc(r.abruf ? "auf Abruf" : r.kw ? "KW " + r.kw : (r.termin ? "KW " + kwText(r.termin) : "")) + "</td><td class='r'>"
        + mengeText(r.menge) + " " + esc(x.einheit || "Stk") + "</td><td>" + esc(r.bemerkung || "") + "</td></tr>").join("")
      : "<tr><td>" + esc(terminText(x)) + "</td><td class='r'>" + mengeText(x.menge) + " " + esc(x.einheit || "Stk") + "</td><td></td></tr>";
    return "<tbody class='pos'>"
      + (bd.ihre_nr ? "<tr class='ihre'><td>" + (i + 1) + ".0</td><td colspan='5'>Ihre Bestellung " + esc(bd.ihre_nr)
        + (bd.ihre_datum ? " vom " + datumText(bd.ihre_datum) : "") + "</td></tr>" : "")
      + "<tr class='haupt'><td>" + esc(x.pos) + "</td><td class='r'>" + mengeText(x.menge) + " " + esc(x.einheit || "Stk") + "</td><td><b>" + esc(titel) + "</b></td>"
      + "<td class='r'>" + chf(x.preis) + "</td><td class='r'>" + esc(pe > 1 ? peKurz(pe) : "1 Stk") + "</td><td class='r'>" + chf(posBetrag(x)) + "</td></tr>"
      + "<tr><td></td><td></td><td colspan='4'><table class='det'>"
      + z("Werkstoff", werkstoff) + z("Werkst. ID", wid)
      + (a && (a.zeichnung || ix) ? z("Zeichnung", (a.zeichnung || "") + (ix ? " / Index: " + ix : "")) : "")
      + z("Ident-Nr.", ad.kunden_nr || ad.ident || "") + z("Artikel-Code", a ? a.nr : "") + z("Zolltarif-Nr.", ad.zolltarif || "")
      + (x.text && a ? z("Bemerkung", x.text) : "")
      + "</table><div class='lpt'>LIEFERPLAN:</div><table class='lp'><thead><tr><th>Termin(e)</th><th class='r'>Menge</th><th>Bemerkung</th></tr></thead><tbody>"
      + lp + "</tbody></table></td></tr></tbody>";
  }).join("");
  const roh = "<!doctype html><html><head><meta charset='utf-8'><title>" + esc("Auftragsbestätigung " + b.nr) + "</title><style>"
    + "body{font:10pt Arial,sans-serif;margin:0;color:#111}h1{font-size:17pt;margin:0 0 12px;font-weight:700}"
    + ".kopf{display:flex;justify-content:space-between;gap:10mm;margin-bottom:8mm}.kopf table td{padding:1px 6px 1px 0;vertical-align:top}"
    + ".l{color:#444;white-space:nowrap;padding-right:8px}.adr{white-space:pre-line;font-size:11pt;margin-bottom:8px}"
    + ".code39{display:block;margin:4px 0 6px}.cz{font-size:8pt;color:#444}"
    + "table.ab{width:100%;border-collapse:collapse}table.ab>thead th{border-bottom:1.5px solid #003884;color:#003884;text-align:left;padding:4px;font-size:9pt}"
    + "table.ab td{padding:2px 4px;vertical-align:top}.r{text-align:right}.pos{border-bottom:1px solid #ccc;page-break-inside:avoid}"
    + ".ihre td{padding-top:8px;color:#333}.haupt td{padding-top:4px}.det td{padding:0 8px 0 0;font-size:9pt}"
    + ".lpt{font-weight:700;font-size:9pt;margin-top:6px}.lp{border-collapse:collapse;margin-bottom:8px;font-size:9pt}.lp th{text-align:left;font-weight:400;color:#444;padding:0 14px 0 0;border-bottom:1px solid #ddd}"
    + ".lp td{padding:0 14px 0 0}.netto{display:flex;justify-content:flex-end;gap:16mm;font-weight:700;margin:6px 4px 10mm;font-size:11pt}"
    + ".fuss td{padding:2px 10px 2px 0;vertical-align:top}.gruss{margin-top:10mm}.test{color:#b00;font-weight:bold}@media print{.test{display:none}}"
    + "</style></head><body><!--INHALT-->"
    + "<p class='test'>TESTVERSION ERP</p>"
    + "<h1>Auftragsbestätigung</h1>"
    + "<div class='kopf'><table>"
    + z("Bestätigungs-Nr.", b.nr) + z("Datum", datumText(b.datum)) + z("Sachbearbeiter", name) + z("Telefon", tel)
    + z("Telefax", "0041 32 677 55 70") + z("E-Mail", mail)
    + "</table><div><div class='adr'>" + esc(adresseText(an)) + "</div><table>"
    + z("Ihr Zeichen", bd.zeichen || kontakt.name || "") + z("Kundennummer", p.nr || "") + z("Telefon", pd.telefon || kontakt.telefon || "")
    + z("Telefax", pd.fax || "")
    + "</table>" + code39Svg(b.nr) + code39Svg(p.nr) + "</div></div>"
    + "<table class='ab'><thead><tr><th>POS</th><th class='r'>MENGE</th><th>Bezeichnung</th><th class='r'>PREIS</th><th class='r'>PRO</th><th class='r'>BETRAG(CHF)</th></tr></thead>"
    + zeilen + "</table>"
    + "<div class='netto'><span>Netto-Warenwert in CHF</span><span>" + chf(s.netto) + "</span></div>"
    + "<table class='fuss'>"
    + (liefer ? "<tr><td class='l'>Versandanschrift</td><td style='white-space:pre-line'>" + esc(adresseText(liefer)) + "</td></tr>" : "")
    + z("Lieferbedingung", bed(bd.liefer)) + z("Zahlungsbedingung", bed(bd.zahlung)) + "</table>"
    + (bd.text ? "<p style='white-space:pre-line'>" + esc(bd.text) + "</p>" : "")
    + "<div class='gruss'>Mit freundlichen Grüssen<br><br><b>HOFER + CO</b><br>" + esc(name) + "</div>"
    + "<script>setTimeout(()=>print(),400)</script></body></html>";
  const w = window.open("", "_blank");
  if (!w) { alt.meldung("Das Fenster wurde vom Browser blockiert.", "warn"); return; }
  w.document.write(briefBlatt(roh));
  w.document.close();
}

// Lieferschein im Aufbau wie im Gewatec (seit 1.818.0, Patricks Muster
// vom 25. November 2026): je Position die Auftragsbestätigung, Ihre
// Bestellung, Werkstoff, Zeichnung, Gesamtmenge und die bis zu diesem
// Lieferschein gelieferte Menge.
export function lsDrucken(d, b) {
  const esc = alt.esc;
  const p = d.partnerMap.get(b.partner_id) || {};
  const pd = p.daten || {};
  const bd = b.daten || {};
  const an = bd.anschrift || bd.rechnung_an || { name: p.name, ...(pd.adresse || {}) };
  const pos = d.posJe.get(b.id) || [];
  const bed = (id) => (d.bedingungen.find((x) => x.id === id) || {}).text || "";
  const name = (alt.meinName && alt.meinName()) || "";
  const mail = (alt.meineMail && alt.meineMail()) || "admin@hoferco.ch";
  const tel = "0041 32 677 55 77";
  const kontakt = (pd.kontakte || [])[0] || {};
  const z = (l, w) => (w ? "<tr><td class='l'>" + esc(l) + "</td><td>" + esc(w) + "</td></tr>" : "");
  const n = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
  // Bis zu diesem Lieferschein geliefert: frühere Lieferscheine derselben Auftragsposition und dieser
  const vorher = (lb) => lb.id === b.id || String(lb.datum || "") < String(b.datum || "")
    || (String(lb.datum || "") === String(b.datum || "") && String(lb.nr || "") <= String(b.nr || ""));
  let netto = 0;
  const zeilen = pos.map((x) => {
    const a = d.artikelMap.get(x.artikel_id);
    const ad = (a && a.daten) || {};
    const ix = posIdx(d, x);
    const roh = ad.rohmaterial_id && d.artikelMap.get(ad.rohmaterial_id);
    const werkstoff = (roh && roh.bezeichnung) || ad.material || "";
    const wid = (/\b1\.\d{4}\b/.exec(werkstoff) || [])[0] || "";
    const titel = a ? (a.bezeichnung || artikelIdxText(a, ix)) : (x.text || "");
    const ap = x.bezug_id && d.posMap.get(x.bezug_id);
    const ab = ap && d.belegMap.get(ap.beleg_id);
    const abd = (ab && ab.daten) || {};
    const gesamt = ap ? n(ap.menge) : 0;
    const gel = ap ? folgePositionen(d, ap.id, "lieferschein")
      .filter((y) => { const lb = d.belegMap.get(y.beleg_id); return lb && lb.status !== "storniert" && vorher(lb); })
      .reduce((s2, y) => s2 + n(y.menge), 0) : n(x.menge);
    const kg = ad.gewicht ? n(ad.gewicht) * n(x.menge) : 0;
    netto += kg;
    const ein = esc(x.einheit || "Stk");
    const ihreNr = abd.ihre_nr || bd.ihre_nr;
    const ihreDat = abd.ihre_datum || bd.ihre_datum;
    const zeichen = abd.zeichen || bd.zeichen;
    return "<tbody class='pos'>"
      + (ab ? "<tr class='ref'><td></td><td colspan='3'>Auftragsbestätigung: " + esc(ab.nr) + " vom " + datumText(ab.datum) + "</td></tr>" : "")
      + (ihreNr ? "<tr class='ref'><td></td><td colspan='3'>Ihre Bestellung " + esc(ihreNr) + (ihreDat ? " vom " + datumText(ihreDat) : "")
        + (zeichen ? " &nbsp; Zeichen: " + esc(zeichen) : "") + "</td></tr>" : "")
      + "<tr class='haupt'><td>" + esc(x.pos) + "</td><td class='r'>" + mengeText(x.menge) + " " + ein + "</td><td><b>" + esc(titel) + "</b></td>"
      + "<td class='r'>" + (kg ? kg.toFixed(1) : "") + "</td></tr>"
      + "<tr><td></td><td></td><td colspan='2'><table class='det'>"
      + z("Werkstoff", werkstoff) + z("Werkst. ID", wid)
      + (a && (a.zeichnung || ix) ? z("Zeichnung / Index", (a.zeichnung || "") + (ix ? " / " + ix : "")) : "")
      + z("Ident-Nr.", ad.kunden_nr || ad.ident || "") + z("Artikel-Code", a ? a.nr : "") + z("Zolltarif-Nr.", ad.zolltarif || "")
      + (x.text && a ? z("Bemerkung", x.text) : "")
      + (ap ? z("Gesamtmenge", ": " + mengeText(gesamt) + " " + ein) : "")
      + z("Gelieferte Menge", ": " + mengeText(gel) + " " + ein)
      + "</table></td></tr></tbody>";
  }).join("");
  const brutto = n(bd.gewicht_brutto);
  const gewicht = (brutto ? brutto.toFixed(1) + " kg brutto" : "") + (brutto && netto ? " / " : "") + (netto ? netto.toFixed(1) + " kg netto" : "");
  const roh = "<!doctype html><html><head><meta charset='utf-8'><title>" + esc("Lieferschein " + b.nr) + "</title><style>"
    + "body{font:10pt Arial,sans-serif;margin:0;color:#111}h1{font-size:17pt;margin:0 0 12px;font-weight:700}"
    + ".kopf{display:flex;justify-content:space-between;gap:10mm;margin-bottom:6mm}.kopf table td{padding:1px 6px 1px 0;vertical-align:top}"
    + ".l{color:#444;white-space:nowrap;padding-right:8px}.adr{white-space:pre-line;font-size:11pt;margin-bottom:8px}"
    + ".code39{display:block;margin:4px 0 6px}.intro{margin:0 0 4mm}"
    + "table.ls{width:100%;border-collapse:collapse}table.ls>thead th{border-bottom:1.5px solid #003884;color:#003884;text-align:left;padding:4px;font-size:9pt}"
    + "table.ls td{padding:2px 4px;vertical-align:top}.r{text-align:right}.pos{border-bottom:1px dashed #999;page-break-inside:avoid}"
    + ".ref td{padding-top:6px;color:#333;font-size:9pt}.haupt td{padding-top:4px}.det td{padding:0 8px 0 0;font-size:9pt}.det{margin-bottom:6px}"
    + ".fuss{margin-top:8mm}.fuss td{padding:2px 10px 2px 0;vertical-align:top}.test{color:#b00;font-weight:bold}@media print{.test{display:none}}"
    + "</style></head><body><!--INHALT-->"
    + "<p class='test'>TESTVERSION ERP</p>"
    + "<h1>Lieferschein</h1>"
    + "<div class='kopf'><div><table>"
    + z("Lieferschein-Nr.", b.nr) + z("Datum", datumText(b.datum)) + z("Sachbearbeiter", name) + z("Telefon", tel)
    + z("Telefax", "0041 32 677 55 70") + z("E-Mail", mail)
    + "</table>" + code39Svg(b.nr) + "</div><div><div class='adr'>" + esc(adresseText(an)) + "</div><table>"
    + z("Kundennummer", p.nr || "") + z("Telefon", pd.telefon || kontakt.telefon || "") + z("Telefax", pd.fax || "")
    + "</table>" + code39Svg(p.nr) + "</div></div>"
    + "<p class='intro'>Wir senden Ihnen aufgrund der unten aufgeführten Liefer- und Zahlungsbedingungen:</p>"
    + "<table class='ls'><thead><tr><th>POS</th><th class='r'>MENGE</th><th>BENENNUNG</th><th class='r'>NETTO (kg)</th></tr></thead>"
    + zeilen + "</table>"
    + "<table class='fuss'>"
    + z("Verpackung", bd.verpackung || "") + z("Verpackungskosten", bd.verp_kosten || "") + z("Porto", bd.porto || "")
    + z("Gesamtgewicht", gewicht) + z("Versandbedingung", bd.versand || "") + z("Lieferbedingung", bed(bd.liefer)) + "</table>"
    + (bd.text ? "<p style='white-space:pre-line'>" + esc(bd.text) + "</p>" : "")
    + "<script>setTimeout(()=>print(),400)</script></body></html>";
  const w = window.open("", "_blank");
  if (!w) { alt.meldung("Das Fenster wurde vom Browser blockiert.", "warn"); return; }
  w.document.write(briefBlatt(roh));
  w.document.close();
}
