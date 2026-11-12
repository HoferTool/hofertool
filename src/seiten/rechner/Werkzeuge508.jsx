// =================================================================
//  NC-PRO → 508 WERKZEUGE
//  Werkzeugtabelle der Willemin-Macodel 508MT2-X1000 aus der Werkzeug-
//  liste von InventorCAM füllen (seit 1.494.0, Wunsch Patrick
//  12. November 2026). Rechnen und Schreiben in wz508.js.
// =================================================================
import { useMemo, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { TYPEN, datLesen, csvLesen, vorschlagen, datSchreiben, dateiText } from "./wz508.js";

// Bleibt beim Reiterwechsel stehen, samt Dateien
const gemerkt = { dat: null, datName: "", csv: null, csvName: "", aenderung: {} };

const AKTION = {
  neu: ["Neu", "wz5-neu"], aendern: ["Ändern", "wz5-aendern"],
  belegt: ["Fach belegt", "wz5-fehler"], fehlt: ["Fach fehlt", "wz5-fehler"],
};

function herunterladen(e, text) {
  const d = e.currentTarget.ownerDocument;
  // Die Steuerung liest nur reine ASCII-Zeichen; maschinenName sorgt dafür
  const url = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
  const a = d.createElement("a");
  a.href = url; a.download = "GESTOUTI.DAT";
  d.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function Werkzeuge508() {
  const [z, setZ] = useState(gemerkt);
  const neu = (teil) => { const g = { ...z, ...teil }; Object.assign(gemerkt, g); setZ(g); };

  const lesen = (art) => async (e) => {
    const datei = (e.target.files || [])[0];
    e.target.value = "";
    if (!datei) return;
    try {
      const text = dateiText(new Uint8Array(await datei.arrayBuffer()));
      if (art === "dat") neu({ dat: datLesen(text), datName: datei.name, aenderung: {} });
      else neu({ csv: csvLesen(text), csvName: datei.name, aenderung: {} });
    } catch (f) { alt.meldung(f.message || String(f), "warn"); }
  };

  const zeilen = useMemo(() => {
    if (!z.dat || !z.csv) return [];
    return vorschlagen(z.dat, z.csv).map((v) => ({ ...v, ...(z.aenderung[v.nr] || {}) }));
  }, [z.dat, z.csv, z.aenderung]);
  const setze = (nr, teil) => neu({ aenderung: { ...z.aenderung, [nr]: { ...(z.aenderung[nr] || {}), ...teil } } });

  const machbar = zeilen.filter((v) => v.aktion === "neu" || v.aktion === "aendern");
  const aktiv = machbar.filter((v) => v.mit !== false);
  const fehlerS = aktiv.filter((v) => !(v.smax > 0));
  const text = z.dat && aktiv.length && !fehlerS.length ? datSchreiben(z.dat, zeilen) : "";

  return (
    <div className="karte wz5" id="wz5">
      <div className="karte__kopf"><h2>Werkzeuge für die 508MT2-X1000</h2></div>
      <p className="wz5-hilfe">Trägt die Werkzeuge eines Auftrags aus InventorCAM in die Werkzeugtabelle der Maschine ein.
        Was nicht aus dem CAM kommt, bleibt genau wie auf der Maschine: gemessene Längen, Abnutzung, Taster, Greifer, Drehstähle.</p>

      <ol className="wz5-schritte">
        <li><b>Tabelle der Maschine:</b> an der 508 die Werkzeugtabelle ausgeben (GESTOUTI.DAT) und hier wählen.
          <label className="knopf knopf--klein wz5-datei">Datei wählen
            <input type="file" accept=".dat,.DAT,.txt" id="wz5-dat" data-ablegen="direkt" hidden onChange={lesen("dat")} /></label>
          {z.dat && <span className="wz5-ok" id="wz5-dat-ok">✓ {z.datName}: {z.dat.length} Fächer, {z.dat.filter((b) => !b.leer).length} belegt</span>}</li>
        <li><b>Werkzeuge aus InventorCAM:</b> Werkzeugtabelle des Teils öffnen, alle Werkzeuge markieren, als CSV exportieren und hier wählen.
          <label className="knopf knopf--klein wz5-datei">Datei wählen
            <input type="file" accept=".csv,.CSV" id="wz5-csv" data-ablegen="direkt" hidden onChange={lesen("csv")} /></label>
          {z.csv && <span className="wz5-ok" id="wz5-csv-ok">✓ {z.csvName}: {z.csv.length} Werkzeuge</span>}</li>
        <li><b>Prüfen</b> und GESTOUTI.DAT herunterladen, dann an der Maschine einlesen.</li>
      </ol>

      {zeilen.length > 0 && (
        <>
          <div className="tabellenrolle">
            <table className="tabelle wz5-tabelle" id="wz5-tabelle">
              <thead><tr><th /><th>Fach</th><th /><th>Name auf der Maschine</th><th>Typ</th><th>S max</th>
                <th>Zähne</th><th>Winkel</th><th>Radius</th><th title="Zustand 6 = Zu vermessen: das Programm misst das Werkzeug am Anfang (G850/G851)">Neu messen</th></tr></thead>
              <tbody>{zeilen.map((v) => {
                const geht = v.aktion === "neu" || v.aktion === "aendern";
                const [wort, klasse] = AKTION[v.aktion];
                const aus = !geht || v.mit === false;
                return (
                  <tr key={v.nr} data-wz5={v.nr} className={aus ? "wz5-aus" : ""}>
                    <td>{geht && <input type="checkbox" checked={v.mit !== false} title="Übernehmen"
                      onChange={(e) => setze(v.nr, { mit: e.target.checked })} />}</td>
                    <td className="mitte"><b>{v.nr}</b></td>
                    <td><span className={"wz5-schild " + klasse}>{wort}</span></td>
                    {geht ? <>
                      <td><input className="wz5-name" value={v.name} maxLength={32} disabled={aus}
                        onChange={(e) => setze(v.nr, { name: e.target.value.replace(/[()]/g, "") })} />
                        {v.alt && !v.alt.leer && v.alt.name !== v.name && <div className="wz5-vorher">vorher: {v.alt.name}</div>}
                        <div className="wz5-vorher">CAM: {v.cam.art.toLowerCase()} Ø{v.cam.d}</div></td>
                      <td><select value={v.typ} disabled={aus} className={v.typUnsicher ? "wz5-warn" : ""}
                        onChange={(e) => setze(v.nr, { typ: Number(e.target.value), typUnsicher: false })}>
                        {!TYPEN.some(([q]) => q === v.typ) && <option value={v.typ}>{v.typ}</option>}
                        {TYPEN.map(([q, t]) => <option key={q} value={q}>{q} {t}</option>)}</select></td>
                      <td><input type="number" className={"wz5-zahl" + (v.smax > 0 ? "" : " wz5-warn")} value={v.smax || ""} disabled={aus}
                        data-wz5-smax onChange={(e) => setze(v.nr, { smax: Number(e.target.value) })} /></td>
                      <td><input type="number" className="wz5-zahl wz5-klein" value={v.zaehne} disabled={aus}
                        onChange={(e) => setze(v.nr, { zaehne: Number(e.target.value) })} /></td>
                      <td><input type="number" className="wz5-zahl wz5-klein" value={v.winkel} disabled={aus}
                        onChange={(e) => setze(v.nr, { winkel: Number(e.target.value) })} /></td>
                      <td className="rechts">{v.radius ? v.radius.toFixed(4) : "0"}
                        {v.aktion === "aendern" && !v.rAnders && <div className="wz5-vorher">bleibt</div>}
                        {v.aktion === "aendern" && v.rAnders && <div className="wz5-vorher">vorher {isFinite(v.altR) ? v.altR.toFixed(4) : "–"}</div>}</td>
                      <td className="mitte"><input type="checkbox" checked={!!v.messen} disabled={aus || v.aktion === "neu"}
                        title={v.aktion === "neu" ? "Ein neues Werkzeug wird immer gemessen" : "Zustand auf 6 = Zu vermessen setzen"}
                        onChange={(e) => setze(v.nr, { messen: e.target.checked })} /></td>
                    </> : <td colSpan={7} className="wz5-fehlertext">{v.name} – {v.text}</td>}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <p className="wz5-hilfe">Neue Werkzeuge bekommen als Länge den Wert aus dem CAM (H-Länge) und Zustand 6 „Zu vermessen“;
            das Programm misst sie am Anfang selbst. Bei vorhandenen Werkzeugen bleiben Länge und Abnutzung, der Radius
            ändert nur, wenn der Durchmesser anders ist. Leere Fächer im CAM bleiben auf der Maschine, wie sie sind.</p>
          {fehlerS.length > 0 && <p className="karte karte--fehler" id="wz5-smax-fehlt">S max fehlt bei Fach {fehlerS.map((v) => v.nr).join(", ")}. Bitte eintragen.</p>}
          <div className="wz5-fuss">
            <button className="knopf" id="wz5-laden" disabled={!text} onClick={(e) => herunterladen(e, text)}>GESTOUTI.DAT herunterladen</button>
            <span>{aktiv.length} von {machbar.length} Werkzeugen werden übernommen</span>
          </div>
        </>
      )}
    </div>
  );
}
