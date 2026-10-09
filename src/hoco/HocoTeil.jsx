// =================================================================
//  EIN HOCO-TEIL
//  Stammdaten mit Zeichnung, je Maschinentyp Einrichtblatt und Stückzeit („Produktionsanlage“) und die FA Nummern
//  mit ihren Anhängen (WBG, Zeichnung, Werkzeugwechsel).
// =================================================================
import { useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { teilLaden, pdfHochladen } from "./daten.js";
import { dokZeigen } from "../teile/DokAbruf.jsx";
import { stueckzeitText, stueckzeitFragen, stueckzeitSetzen } from "../daten/stueckzahl.js";

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
  const { faListe, vomAuftrag, typenGenutzt } = daten;

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
  // Stückzeit in Sekunden je Maschinentyp (Wunsch 8. Oktober 2026)
  const zeitBearbeiten = async (e) => {
    const s = await stueckzeitFragen("Stückzeit " + e.name, "Sekunden pro Stück für " + t.hoco_nr + ":", e.zeit);
    if (s === null) return;
    try { await stueckzeitSetzen(t.hoco_nr, e.typId, s || null); meldung(s ? "Stückzeit gespeichert." : "Stückzeit entfernt."); neu(); }
    catch (f) { fehler(f); }
  };
  // Eine Rückfrage, mit Rückgängig; die Aufgabe holt beim nächsten
  // Durchlauf die nächste Excel-Datei aus dem Ordner, wenn es eine gibt
  const blattEntfernen = async (typId) => {
    try { if (await alt.einrichtblattEntfernen(t.hoco_nr, typId)) fertig("Einrichtblatt entfernt."); }
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
          {/* Die Artikelbezeichnung ebenso (Wunsch 8. Oktober 2026) */}
          {[["Material", t.material]].map(([k, v]) => (
            <tr key={k}><td className="klein">{k}</td><td>{v || leer}</td></tr>
          ))}
        </tbody></table>
        <div className="pdfreihe">
          {/* Schaut dabei im Zeichnungs-Ordner nach Neuerem, auch ohne Zeichnung */}
          <button className="knopf knopf--klein" data-zeichnung={t.zeichnung_url || ""}
            onClick={() => dokZeigen({ art: "zeichnung", titel: "Zeichnung " + t.hoco_nr, adresse: t.zeichnung_url,
              hoco: t.hoco_nr, neu: () => nachAenderung() })}>Zeichnung ansehen</button>
          {darf && <label className="knopf knopf--klein bildknopf">
            {t.zeichnung_url ? "Zeichnung ersetzen" : "Zeichnung wählen"}
            <input type="file" id="hoco-pdf" accept="application/pdf" hidden onChange={zeichnungWaehlen} /></label>}
          {darf && !t.zeichnung_url && vomAuftrag && <button className="knopf knopf--klein"
            data-zvonauftrag={vomAuftrag} onClick={zeichnungVomAuftrag}>Zeichnung vom Auftrag übernehmen</button>}
        </div>
        {darf && <span className="feldhinweis" id="hoco-pdfstand">{pdfStand}</span>}
      </section>

      <section className="karte">
        <div className="karte__kopf"><h2>Produktionsanlage</h2><span className="klein">je Maschinentyp</span></div>
        {typenGenutzt.length
          ? <table className="tabelle">
              <thead><tr><th>Maschinentyp</th><th>Maschinen</th><th>Einrichtblatt</th><th>Stückzeit</th><th /></tr></thead>
              <tbody>{typenGenutzt.map((e) => (
                <tr key={e.typId}>
                  <td><strong>{e.name}</strong></td>
                  <td className="klein">{e.maschinen.join(", ") || "—"}</td>
                  <td className="klein">{e.eigenes ? "eigenes hinterlegt"
                    : (e.vorlage ? "Vorlage vom Typ" : <span className="gedaempft">noch keines</span>)}</td>
                  <td className="nowrap">{darf
                    ? <button className="linkknopf" data-stueckzeit={e.typId} onClick={() => zeitBearbeiten(e)}>
                        {e.zeit ? stueckzeitText(e.zeit) : "eintragen"}</button>
                    : (e.zeit ? stueckzeitText(e.zeit) : leer)}</td>
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

      {/* „Gelaufen auf“ ist weg (Wunsch 8. Oktober 2026) */}
      {faListe.length > 0 && <section className="karte">
        <div className="karte__kopf"><h2>FA Nummern</h2><span className="marke">{faListe.length}</span></div>
        <table className="tabelle"><tbody>{faListe.map((x) => (
          <tr key={x.id}>
            <td><strong>{x.fa_nr}</strong></td>
            <td className="klein">{x.planned_from ? alt.kurzDatum(x.planned_from) : ""}</td>
            {/* Die Anhänge des Auftrags: das Warenbegleitblatt gehört zum
                Durchlauf, ist also je FA Nr. ein anderes */}
            <td className="nowrap">
              <button className="linkknopf" data-fadatei={x.wbg_url || ""}
                onClick={() => dokZeigen({ art: "wbg", titel: "WBG " + x.fa_nr, adresse: x.wbg_url, hoco: t.hoco_nr,
                  auftragId: x.id, fa: x.fa_nr, neu: () => neu() })}>WBG</button>
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
            </td>
            <td className="klein rechts">{(alt.PLANSTATUS[x.plan_status || "geplant"] || {}).name || ""}</td>
          </tr>
        ))}</tbody></table>
      </section>}
    </>
  );
}
