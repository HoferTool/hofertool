// =================================================================
//  EIN HOCO-TEIL
//  Stammdaten mit Zeichnung, Einrichtblätter je Maschinentyp, auf welchen Maschinen es lief und die FA Nummern mit
//  ihren Anhängen (WBG, Zeichnung, Werkzeugwechsel).
// =================================================================
import { useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { teilLaden, pdfHochladen } from "./daten.js";

const sicher = (name) => name.replace(/[^A-Za-z0-9.\-]/g, "_");

export default function HocoTeil({ t, darf, zurueck, nachAenderung }) {
  const { daten, neu } = useDaten(() => teilLaden(t, darf), [t]);
  const [pdfStand, setPdfStand] = useState("");
  const { meldung, fehlertext } = alt;
  const db = alt.db;
  // Nach einer Änderung an den Stammdaten die ganze Liste frisch. Das
  // Teil kommt dabei als neues Objekt und lädt sich darum selbst neu.
  const fertig = (text) => { meldung(text); nachAenderung(); };
  const fehler = (f) => meldung(fehlertext(f), "fehler");

  if (!daten) return <div className="laedt">Wird geladen …</div>;
  const { faListe, vomAuftrag, maschinenlauf, typenGenutzt } = daten;

  const zeichnungWaehlen = async (e) => {
    const datei = (e.target.files || [])[0];
    if (!datei) return;
    setPdfStand("Zeichnung wird hochgeladen …");
    try {
      const adresse = await pdfHochladen("hoco/" + sicher(t.hoco_nr) + "-" + Date.now() + ".pdf", datei);
      const u = await db.from("hoco_parts").update({ zeichnung_url: adresse }).eq("hoco_nr", t.hoco_nr);
      if (u.error) throw u.error;
      setPdfStand("");
      fertig("Zeichnung hinterlegt.");
    } catch (f) { setPdfStand("Hochladen fehlgeschlagen: " + (f.message || f)); }
  };

  // Hängt an einem Auftrag schon eine Zeichnung, lässt sie sich mit
  // einem Klick übernehmen, statt sie neu zu suchen
  const zeichnungVomAuftrag = async () => {
    const { error } = await db.from("hoco_parts").update({ zeichnung_url: vomAuftrag }).eq("hoco_nr", t.hoco_nr);
    if (error) fehler(error); else fertig("Zeichnung übernommen.");
  };

  const blattAnsehen = async (typId) => {
    try { await alt.einrichtblattPdfOeffnen(t.hoco_nr, typId, t.hoco_nr); } catch (f) { fehler(f); }
  };
  const blattHinterlegen = async (typId) => {
    const adresse = await alt.blattPdfWaehlen();
    if (!adresse) return;
    try { await alt.blattPdfAnHoco(t.hoco_nr, typId, adresse); fertig("Einrichtblatt für " + t.hoco_nr + " hinterlegt."); }
    catch (f) { fehler(f); }
  };
  const blattEntfernen = async (typId) => {
    try { await alt.blattPdfAnHoco(t.hoco_nr, typId, null); fertig("Entfernt. Es gilt wieder die Vorlage vom Typ."); }
    catch (f) { fehler(f); }
  };

  // Das Warenbegleitblatt gehört zum einzelnen Durchlauf, also je FA Nr. ein eigenes
  const wbgWaehlen = async (auftragId, e) => {
    const datei = (e.target.files || [])[0];
    if (!datei) return;
    meldung("WBG wird hochgeladen …");
    try {
      const adresse = await pdfHochladen("wbg/" + Date.now() + "-" + datei.name.replace(/[^a-zA-Z0-9.\-]/g, "_"), datei);
      const u = await db.from("jobs").update({ wbg_url: adresse }).eq("id", auftragId);
      if (u.error) throw u.error;
      meldung("WBG hinterlegt.");
      neu();
    } catch (f) { fehler(f); }
  };

  const bearbeiten = async () => { if (await alt.hocoDialog(t)) nachAenderung(); };
  const ansehen = (url, titel) => alt.betrachter(url, titel, true);
  const leer = <span className="gedaempft">—</span>;

  return (
    <>
      <button className="linkknopf" id="hoco-zurueck" onClick={zurueck}>‹ alle HOCO Nr.</button>
      <section className="karte">
        <div className="karte__kopf"><h2 className="hoco-teilnr">{t.hoco_nr}</h2>
          {darf && <div className="karte__aktionen">
            <button className="linkknopf" id="hoco-bearb" onClick={bearbeiten}>Bearbeiten</button></div>}
        </div>
        <table className="tabelle"><tbody>
          {/* „Allgemeine Infos“ ist weg (Wunsch 5. Oktober 2026), die Spalte bleibt */}
          {[["Artikelbezeichnung", t.bezeichnung], ["Material", t.material]].map(([k, v]) => (
            <tr key={k}><td className="klein">{k}</td><td>{v || leer}</td></tr>
          ))}
        </tbody></table>
        <div className="pdfreihe">
          {t.zeichnung_url && <button className="knopf knopf--klein" data-zeichnung={t.zeichnung_url}
            onClick={() => ansehen(t.zeichnung_url, "Zeichnung " + t.hoco_nr)}>Zeichnung ansehen</button>}
          {darf && <label className="knopf knopf--klein bildknopf">
            {t.zeichnung_url ? "Zeichnung ersetzen" : "Zeichnung wählen"}
            <input type="file" id="hoco-pdf" accept="application/pdf" hidden onChange={zeichnungWaehlen} /></label>}
          {darf && !t.zeichnung_url && vomAuftrag && <button className="knopf knopf--klein"
            data-zvonauftrag={vomAuftrag} onClick={zeichnungVomAuftrag}>Zeichnung vom Auftrag übernehmen</button>}
        </div>
        {darf && <span className="feldhinweis" id="hoco-pdfstand">{pdfStand}</span>}
      </section>

      <section className="karte">
        <div className="karte__kopf"><h2>Einrichtblätter</h2><span className="klein">je Maschinentyp eines</span></div>
        {typenGenutzt.length
          ? <table className="tabelle">
              <thead><tr><th>Maschinentyp</th><th>Maschinen</th><th>Blatt</th><th /></tr></thead>
              <tbody>{typenGenutzt.map((e) => (
                <tr key={e.typId}>
                  <td><strong>{e.name}</strong></td>
                  <td className="klein">{e.maschinen.join(", ") || "—"}</td>
                  <td className="klein">{e.eigenes ? "eigenes hinterlegt"
                    : (e.vorlage ? "Vorlage vom Typ" : <span className="gedaempft">noch keines</span>)}</td>
                  <td className="rechts nowrap">
                    {(e.eigenes || e.vorlage) && <><button className="knopf knopf--klein" data-blatt-typ={e.typId}
                      onClick={() => blattAnsehen(e.typId)}>Ansehen</button>{" "}</>}
                    {darf && <button className="linkknopf" data-blatt-pdf={e.typId}
                      onClick={() => blattHinterlegen(e.typId)}>{e.eigenes ? "Ersetzen" : "Datei hinterlegen"}</button>}
                    {darf && e.eigenes && <>{" "}<button className="linkknopf linkknopf--gefahr" data-blatt-weg={e.typId}
                      onClick={() => blattEntfernen(e.typId)}>Entfernen</button></>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          : <p className="hinweis">Diese Nummer ist noch auf keiner Maschine gelaufen. Ein Einrichtblatt
              hinterlegst du je Maschinentyp — entweder als Vorlage beim Typ oder hier für genau dieses Teil.</p>}
      </section>

      <section className="karte">
        <div className="karte__kopf"><h2>Gelaufen auf</h2><span className="klein">je Maschine der letzte Auftrag</span></div>
        {maschinenlauf.length
          ? <table className="tabelle">
              <thead><tr><th>Maschine</th><th>Zuletzt</th><th>FA Nr.</th><th>Stück</th></tr></thead>
              <tbody>{maschinenlauf.map((j, i) => {
                // Kommt die Maschine nicht mit der Abfrage, wird sie aus
                // der geladenen Liste nachgeschlagen
                const m = j.machines || (alt.prod.maschinen || []).find((x) => x.id === j.machine_id) || {};
                const nr = m.machine_number || m.machine_nr;
                return (
                  <tr key={j.id} className={i === 0 ? "hl-jetzt" : undefined}>
                    <td>{nr && <><b>{nr}</b> </>}{m.name || "unbekannt"}
                      {i === 0 && <> <span className="hl-marke">zuletzt</span></>}</td>
                    <td className="nowrap">{alt.kurzDatum(j.planned_from)
                      + (j.planned_from ? " " + String(j.planned_from).slice(0, 4) : "")}</td>
                    <td>{j.fa_nr || leer}</td>
                    <td className="nowrap">{alt.zahlText(j.stand || 0)
                      + (j.target_quantity ? " / " + alt.zahlText(j.target_quantity) : "")}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          : <p className="hinweis">Noch kein Auftrag auf dieser Nummer.</p>}
      </section>

      {faListe.length > 0 && <section className="karte">
        <div className="karte__kopf"><h2>FA Nummern</h2><span className="marke">{faListe.length}</span></div>
        <table className="tabelle"><tbody>{faListe.map((x) => (
          <tr key={x.id}>
            <td><strong>{x.fa_nr}</strong></td>
            <td className="klein">{x.planned_from ? alt.kurzDatum(x.planned_from) : ""}</td>
            {/* Die Anhänge des Auftrags: das Warenbegleitblatt gehört zum
                Durchlauf, ist also je FA Nr. ein anderes */}
            <td className="nowrap">
              {x.wbg_url && <button className="linkknopf" data-fadatei={x.wbg_url}
                onClick={() => ansehen(x.wbg_url, "WBG " + x.fa_nr)}>WBG</button>}
              {x.drawing_url && <>{" "}<button className="linkknopf" data-fadatei={x.drawing_url}
                onClick={() => ansehen(x.drawing_url, "Zeichnung " + x.fa_nr)}>Zeichnung</button></>}
              {x.wz_historie_url && <>{" "}<button className="linkknopf" data-fadatei={x.wz_historie_url}
                onClick={() => ansehen(x.wz_historie_url, "Werkzeugwechsel " + x.fa_nr)}>Wechsel</button></>}
              {darf && <>{" "}<label className="linkknopf bildknopf">{x.wbg_url ? "WBG ersetzen" : "WBG wählen"}
                <input type="file" accept="application/pdf" hidden data-wbgauftrag={x.id}
                  onChange={(e) => wbgWaehlen(x.id, e)} /></label></>}
              {/* Hier stand ein zweiter Knopf „Wechsel“ für ein Blatt aller
                  Werkzeugwechsel der FA. Die Funktion dahinter gab es nie, der
                  Klick lief ins Leere. Kommt mit der Auswertung der Standzeiten. */}
              {!x.wbg_url && !x.drawing_url && !darf && <span className="gedaempft klein">ohne Anhang</span>}
            </td>
            <td className="klein rechts">{(alt.PLANSTATUS[x.plan_status || "geplant"] || {}).name || ""}</td>
          </tr>
        ))}</tbody></table>
      </section>}
    </>
  );
}
