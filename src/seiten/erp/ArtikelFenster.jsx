// Test ERP: Fenster eines Hofer + Co Artikels mit Preisliste, Zeichnung und
// 3D-Modell (Wunsch Patrick 21. November 2026: „die Staffelpreise aus der
// Kalkulation in den Artikel … pro 1 / pro 100 / pro 1000 … anzeigen, aus
// welcher Kalkulation … pro Artikel wie eine Preisliste“, „in den Artikel
// kommt ein Fenster mit der Zeichnungsanzeige und dem 3D-Modell, wenn
// vorhanden“). Noch nichts von selbst geholt (Patrick: „noch nicht holen,
// wir brauchen dann ein Dokumentenmanagement für die Sachen“): die Flächen
// stehen bereit, die Dokumente kommen mit dem Dokumentenmanagement.
import { useState } from "react";
import { alt } from "../../bruecke.jsx";
import { Feld, tun } from "./teile.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { aendern, artikelText, chf, mengeText, datumText, preisliste, peKurz, peZahl, zahl, PE_AUSWAHL } from "../../daten/erp.js";

export function artikelFensterOeffnen(d, neu, a, aktionen) {
  fensterOeffnen((zu) => <ArtikelFenster d={d} neu={neu} start={a} aktionen={aktionen} zu={zu} />);
}

const PL_FELDER = [{ name: "ab", label: "Ab Menge (Stk)", typ: "zahl" }, { name: "preis", label: "Preis CHF", typ: "zahl" }];

function ArtikelFenster({ d, neu, start, aktionen, zu }) {
  const [a, setA] = useState(start);
  const [bearb, setBearb] = useState(false);
  const pl = preisliste(a);
  const [pe, setPe] = useState(String(pl.pe));
  const [zeilen, setZeilen] = useState(pl.staffeln.map((x) => ({ ab: String(x.ab), preis: String(x.preis) })));
  const kunde = d.partnerMap.get(a.kunde_id);
  const kalk = pl.kalkulation_nr;
  const roh = d.artikelMap.get((a.daten || {}).rohmaterial_id);

  const speichern = async () => {
    const st = zeilen.filter((x) => String(x.preis ?? "").trim() !== "")
      .map((x) => ({ ab: Math.max(0, Math.round(zahl(x.ab))), preis: zahl(x.preis) })).sort((x, y) => x.ab - y.ab);
    if (st.some((x, i) => i && x.ab === st[i - 1].ab)) throw new Error("Zwei Staffeln mit derselben Menge.");
    const neuPe = peZahl(pe);
    // Von Hand geändert: die Herkunft bleibt sichtbar, aber mit Vermerk
    const gleich = neuPe === pl.pe && st.length === pl.staffeln.length
      && st.every((x, i) => x.ab === pl.staffeln[i].ab && Math.abs(x.preis - pl.staffeln[i].preis) < 1e-9);
    const liste = { ...(a.daten && a.daten.preisliste || {}), pe: neuPe, waehrung: "CHF", staffeln: st,
      von_hand: gleich ? !!pl.von_hand : true, geaendert_am: gleich ? pl.geaendert_am : new Date().toISOString() };
    const zeile = { preis: st.length ? st[0].preis : null, geaendert_am: new Date().toISOString(),
      daten: { ...(a.daten || {}), pe: neuPe, preisliste: liste } };
    const r = await aendern("erp_artikel", a.id, zeile);
    setA({ ...a, ...zeile, ...(r || {}) });
    setBearb(false);
    neu();
    alt.meldung("Preisliste gespeichert.", "gut");
  };

  return (
    <div className="dialog erp-fenster erp-fenster--gross erp-artfenster" role="dialog" data-erp-artfenster={a.nr}>
      <div className="erp-artfenster__kopf">
        <h2>{artikelText(a)}</h2>
        <button className="knopf knopf--still" onClick={zu} aria-label="Schliessen">✕</button>
      </div>
      <div className="erp-artfenster__raster">
        <div className="erp-artfenster__links">
          <dl className="erp-dl">
            {a.bezeichnung && <><dt>Bezeichnung</dt><dd>{a.bezeichnung}</dd></>}
            {a.zeichnung && <><dt>Zeichnung</dt><dd>{a.zeichnung}{a.idx ? " · Index " + a.idx : ""}</dd></>}
            {kunde && <><dt>Kunde</dt><dd>{kunde.nr} {kunde.name}</dd></>}
            <dt>Rohmaterial</dt><dd data-erp-art-roh="">{roh ? roh.nr + (roh.bezeichnung && roh.bezeichnung !== roh.nr ? " · " + roh.bezeichnung : "")
              : (a.daten || {}).material ? <>{a.daten.material} <span className="klein">(nur Text, Rohmaterial-Artikel gibt es noch nicht)</span></> : "–"}</dd>
            {(a.daten || {}).kunden_nr && <><dt>Art.-Nr. Kunde</dt><dd>{a.daten.kunden_nr}</dd></>}
            <dt>Arbeitsplan</dt><dd>{(a.arbeitsplan || []).length ? (a.arbeitsplan || []).map((x) => x.bez).join(" → ") : "–"}</dd>
          </dl>
          <div className="mat-kopf">
            <button className="knopf knopf--klein" data-erp-art-bearbeiten="" onClick={() => { zu(); aktionen.bearbeiten(a); }}>Stammdaten ändern</button>
            <button className="knopf knopf--klein" onClick={() => { zu(); aktionen.index(a); }}>+ Index</button>
            <button className="knopf knopf--klein" onClick={() => { zu(); aktionen.arbeitsplan(a); }}>Arbeitsplan</button>
          </div>

          <section className="erp-preisliste" id="erp-preisliste">
            <h3>Preisliste</h3>
            <p className="klein" data-erp-pl-herkunft="">
              {kalk ? <>Preise aus Kalkulation <b>{kalk}</b>{pl.uebernommen_am ? " vom " + datumText(pl.uebernommen_am.slice(0, 10)) : ""}
                {pl.aus_waehrung ? " (aus " + pl.aus_waehrung + " in CHF umgerechnet)" : ""}
                {pl.von_hand ? <> · <b className="erp-rot">von Hand geändert{pl.geaendert_am ? " am " + datumText(pl.geaendert_am.slice(0, 10)) : ""}</b></> : ""}</>
                : pl.staffeln.length ? "Preise von Hand eingetragen." : "Noch keine Preisliste. In der Kalkulation „Artikel und Arbeitsplan anlegen“ oder hier eintragen."}
            </p>
            {!bearb ? <>
              {pl.staffeln.length > 0 &&
                <table className="tabelle erp-pl-tab">
                  <thead><tr><th className="rechts">Ab Menge</th><th className="rechts">Preis CHF {peKurz(pl.pe)}</th><th className="rechts">je Stk</th></tr></thead>
                  <tbody>{pl.staffeln.map((x, i) => <tr key={i} data-erp-pl-zeile={i}>
                    <td className="rechts">{mengeText(x.ab)} Stk</td><td className="rechts"><b>{chf(x.preis)}</b></td>
                    <td className="rechts klein">{(x.preis / pl.pe).toFixed(4)}</td></tr>)}</tbody>
                </table>}
              <div className="mat-kopf">
                <button className="knopf knopf--klein" data-erp-pl-bearbeiten="" onClick={() => setBearb(true)}>Preisliste ändern</button>
                {pl.staffeln.length > 0 && <button className="knopf knopf--klein" data-erp-pl-drucken="" onClick={() => preislisteDrucken(d, a)}>Preisliste drucken</button>}
              </div>
            </> : <>
              <Feld f={{ name: "pe", label: "Preis pro", auswahl: PE_AUSWAHL }} wert={pe} setzen={setPe} />
              <Feld f={{ name: "staffeln", label: "Staffeln", typ: "liste", felder: PL_FELDER, neu: "Staffel" }} wert={zeilen} setzen={setZeilen} />
              <div className="mat-kopf">
                <button className="knopf knopf--still" onClick={() => { setBearb(false); setPe(String(pl.pe)); setZeilen(pl.staffeln.map((x) => ({ ab: String(x.ab), preis: String(x.preis) }))); }}>Abbrechen</button>
                <button className="knopf knopf--haupt" data-erp-pl-speichern="" onClick={() => tun(speichern)}>Speichern</button>
              </div>
            </>}
          </section>
        </div>
        <div className="erp-artfenster__rechts">
          <div className="erp-art-zeichnung" data-erp-art-zeichnung="">
            <div className="h3d-hinweis"><b>Zeichnung</b><br />Kommt mit dem Dokumentenmanagement.</div>
          </div>
          <div className="erp-art-modell" data-erp-art-modell="">
            <div className="h3d-hinweis"><b>3D-Modell</b><br />Wird hier gezeigt, wenn eines vorhanden ist.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function preislisteDrucken(d, a) {
  const pl = preisliste(a);
  const esc = alt.esc;
  const kunde = d.partnerMap.get(a.kunde_id);
  const zeilen = pl.staffeln.map((x) => "<tr><td class='r'>" + mengeText(x.ab) + " Stk</td><td class='r'><b>" + chf(x.preis) + "</b></td></tr>").join("");
  const html = "<!doctype html><html><head><meta charset='utf-8'><title>Preisliste " + esc(artikelText(a)) + "</title><style>"
    + "body{font:11pt Arial,sans-serif;margin:18mm 16mm;color:#111}h1{font-size:16pt;margin:30px 0 4px}table{width:60%;border-collapse:collapse;margin-top:16px}"
    + "th,td{border-bottom:1px solid #ccc;padding:5px 4px;text-align:left}th{background:#eef2f7}.r{text-align:right}"
    + ".kopf{display:flex;justify-content:space-between}.test{color:#b00;font-weight:bold}small{color:#555}@media print{.test{display:none}}</style></head><body>"
    + "<div class='kopf'><img src='" + new URL("logo-empfang.png", location.href.split("#")[0]).href + "' style='height:46px'>"
    + "<div style='text-align:right'>Hofer + Co Präzisionsdrehteile<br>Lohn-Ammannsegg</div></div>"
    + "<p class='test'>TESTVERSION ERP</p>"
    + "<h1>Preisliste " + esc(artikelText(a)) + "</h1>"
    + "<div>" + esc(a.bezeichnung || "") + (a.zeichnung ? " · Zeichnung " + esc(a.zeichnung) + (a.idx ? " Index " + esc(a.idx) : "") : "")
    + (kunde ? "<br>Kunde " + esc(kunde.nr + " " + kunde.name) : "") + "</div>"
    + "<table><thead><tr><th class='r'>Ab Menge</th><th class='r'>Preis CHF pro " + (pl.pe === 1 ? "Stk" : mengeText(pl.pe) + " Stk") + "</th></tr></thead><tbody>" + zeilen + "</tbody></table>"
    + "<p><small>Preise exkl. MWST, Stand " + datumText(new Date().toISOString().slice(0, 10))
    + (pl.kalkulation_nr ? " · Kalkulation " + esc(pl.kalkulation_nr) : "") + "</small></p>"
    + "<script>setTimeout(()=>print(),300)</script></body></html>";
  const w = window.open("", "_blank");
  if (!w) { alt.meldung("Das Fenster wurde vom Browser blockiert.", "warn"); return; }
  w.document.write(html);
  w.document.close();
}
