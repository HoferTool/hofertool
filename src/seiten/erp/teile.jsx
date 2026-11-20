// Test ERP: gemeinsame Bausteine (Formularfenster, Listen in Formularen, Druckblatt)
import { useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { adresseText, chf, datumText, mengeText, terminText, belegSumme, BELEGTYP, artikelText } from "../../daten/erp.js";

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
export function formular({ titel, felder, wert, speichern, loeschen, breit }) {
  fensterOeffnen((zu) => <Formular titel={titel} felder={felder} wert={wert || {}} speichern={speichern}
    loeschen={loeschen} zu={zu} breit={breit} />);
}

function Formular({ titel, felder, wert, speichern, loeschen, zu, breit }) {
  const [w, setW] = useState(wert);
  const [laeuft, setLaeuft] = useState(false);
  const los = async () => {
    setLaeuft(true);
    try { await speichern(w); zu(); } catch (e) { alt.meldung(alt.fehlertext(e), "fehler"); setLaeuft(false); }
  };
  return (
    <div className={"dialog erp-fenster" + (breit ? " erp-fenster--breit" : "")} role="dialog">
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
export function Tabelle({ kopf, zeilen, leer }) {
  if (!zeilen.length) return <div className="karte karte--hinweis"><p>{leer || "Noch keine Einträge."}</p></div>;
  return (
    <div className="erp-tabelle-huelle">
      <table className="erp-tabelle">
        <thead><tr>{kopf.map((k, i) => <th key={i}>{k}</th>)}</tr></thead>
        <tbody>{zeilen.map((z) => (
          <tr key={z.key} className={(z.klick ? "erp-klick" : "") + (z.klasse ? " " + z.klasse : "")}
            onClick={z.klick} data-erp-zeile={z.key}>
            {z.zellen.map((c, i) => <td key={i}>{c}</td>)}</tr>))}</tbody>
      </table>
    </div>
  );
}

export function Suche({ wert, setzen, platzhalter }) {
  return <input className="mat-sucheingabe erp-suche" type="search" value={wert} placeholder={platzhalter || "Suchen …"}
    onChange={(e) => setzen(e.target.value)} />;
}

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
    const text = a ? esc(artikelText(a)) + (a.zeichnung ? "<br><small>Zeichnung " + esc(a.zeichnung) + (a.idx ? " Index " + esc(a.idx) : "") + "</small>" : "") : esc(x.text || "");
    return "<tr><td>" + x.pos + "</td><td>" + text
      + (x.daten && x.daten.charge ? "<br><small>Charge " + esc(x.daten.charge) + "</small>" : "")
      + (x.text && a ? "<br><small>" + esc(x.text) + "</small>" : "") + "</td><td class='r'>" + mengeText(x.menge) + " " + esc(x.einheit || "")
      + "</td><td>" + esc(terminText(x)) + "</td>"
      + (mitPreis ? "<td class='r'>" + chf(x.preis) + "</td><td class='r'>" + chf((Number(x.menge) || 0) * (Number(x.preis) || 0)) + "</td>" : "") + "</tr>";
  }).join("");
  const html = "<!doctype html><html><head><meta charset='utf-8'><title>" + esc(t.name + " " + b.nr) + "</title><style>"
    + "body{font:11pt Arial,sans-serif;margin:18mm 16mm;color:#111}h1{font-size:16pt;margin:30px 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}"
    + "th,td{border-bottom:1px solid #ccc;padding:5px 4px;vertical-align:top;text-align:left}th{background:#eef2f7}.r{text-align:right}"
    + ".kopf{display:flex;justify-content:space-between}.adr{white-space:pre-line;margin-top:24px}.summe{margin-left:auto;width:260px;margin-top:10px}"
    + ".summe div{display:flex;justify-content:space-between}.test{color:#b00;font-weight:bold}small{color:#555}@media print{.test{display:none}}</style></head><body>"
    + "<div class='kopf'><img src='" + new URL("logo-empfang.png", location.href.split("#")[0]).href + "' style='height:46px'>"
    + "<div style='text-align:right'>Hofer + Co Präzisionsdrehteile<br>Lohn-Ammannsegg</div></div>"
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
  const w = window.open("", "_blank");
  if (!w) { alt.meldung("Das Fenster wurde vom Browser blockiert.", "warn"); return; }
  w.document.write(html);
  w.document.close();
}
