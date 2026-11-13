// =================================================================
//  NC-PRO → 508 WERKZEUGE
//  Werkzeugtabelle der Willemin-Macodel 508MT2-X1000 aus der Werkzeug-
//  liste von InventorCAM füllen (seit 1.494.0, Wunsch Patrick
//  12. November 2026). Rechnen und Schreiben in wz508.js.
// =================================================================
import { useMemo, useState } from "react";
import { alt } from "../../bruecke.jsx";
import Magazin508 from "./Magazin508.jsx";
import { TYPEN, datLesen, csvLesen, tlmLesen, istTlm, vorschlagen, datSchreiben, dateiText, wirdGeschrieben, fachGeschuetzt } from "./wz508.js";

// Bleibt beim Reiterwechsel stehen, samt Dateien; im Pad eigener Stand
const leer = () => ({ dat: null, datName: "", csv: null, csvName: "", aenderung: {}, wahl: {}, marken: {} });
const gemerkt = leer();
const gemerktPad = leer();

const AKTION = {
  neu: ["Neu", "wz5-neu"], aendern: ["Ändern", "wz5-aendern"],
  belegt: ["Fach belegt", "wz5-fehler"], fehlt: ["Fach fehlt", "wz5-fehler"],
  dreh: ["Bleibt", "wz5-dreh"], drehFehlt: ["Fehlt", "wz5-fehler"],
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

// pad (seit 1.495.0): im Pad Mode wählt man je Werkzeug das Magazinfach und
// die Marke (3D-gedruckter Clip mit 6 Ziffern, Wunsch Patrick 12. November
// 2026); nach dem Herunterladen meldet onGeschrieben, was wohin kam.
// marken: alle Komplettwerkzeuge aus wz508_werkzeuge, waehleMarke(ausser)
// öffnet die Auswahl und gibt die Marke zurück.
export default function Werkzeuge508({ pad = false, marken = [], waehleMarke, onGeschrieben, MarkeZeigen }) {
  const speicher = pad ? gemerktPad : gemerkt;
  const [z, setZ] = useState(speicher);
  const neu = (teil) => { const g = { ...z, ...teil }; Object.assign(speicher, g); setZ(g); };

  const lesen = (art) => async (e) => {
    const datei = (e.target.files || [])[0];
    e.target.value = "";
    if (!datei) return;
    try {
      const text = dateiText(new Uint8Array(await datei.arrayBuffer()));
      if (art === "dat") neu({ dat: datLesen(text), datName: datei.name, aenderung: {} });
      else neu({ csv: istTlm(text) ? tlmLesen(text) : csvLesen(text), csvName: datei.name, aenderung: {}, wahl: {}, marken: {} });
    } catch (f) { alt.meldung(f.message || String(f), "warn"); }
  };

  const zeilen = useMemo(() => {
    if (!z.dat || !z.csv) return [];
    return vorschlagen(z.dat, z.csv, z.wahl).map((v) => {
      const a = { ...v, ...(z.aenderung[v.nr] || {}) };
      if (!pad) return a;
      // Marke: gewählt, sonst die, die laut Liste schon in diesem Fach steckt
      if (z.marken[v.nr] !== undefined) a.marke = z.marken[v.nr];
      else if (v.aktion === "aendern") {
        const da = marken.find((m) => m.ort === "maschine" && m.fach === v.fach && m.nr === v.nr);
        a.marke = da ? da.marke : "";
      } else a.marke = "";
      return a;
    });
  }, [z.dat, z.csv, z.aenderung, z.wahl, z.marken, pad, marken]);
  const setze = (nr, teil) => neu({ aenderung: { ...z.aenderung, [nr]: { ...(z.aenderung[nr] || {}), ...teil } } });

  const machbar = zeilen.filter((v) => v.aktion === "neu" || v.aktion === "aendern");
  const drehFehlt = zeilen.filter((v) => v.aktion === "drehFehlt");
  const aktiv = zeilen.filter(wirdGeschrieben);
  const fehlerS = aktiv.filter((v) => !(v.smax > 0));
  const doppelt = aktiv.filter((v) => v.doppelt);
  const text = z.dat && aktiv.length && !fehlerS.length && !doppelt.length ? datSchreiben(z.dat, zeilen) : "";

  // Fächer zur Wahl: Inhalt laut eingelesener Tabelle
  const fachText = (b) => b.fach + " · " + (b.leer ? "leer" : b.name);
  const markeWaehlen = async (v) => {
    if (!waehleMarke) return;
    const vergeben = zeilen.filter((x) => x.nr !== v.nr && x.marke).map((x) => x.marke);
    const m = await waehleMarke(vergeben, v);
    if (m !== undefined && m !== null) neu({ marken: { ...z.marken, [v.nr]: m } });
  };
  // Aus der Grafik: Werkzeug auf ein Fach gelegt. Liegt dort schon ein
  // anderes aus dem CAM, tauschen die beiden; fach null = wieder Fach = Nr.
  const aufFach = (v, fach) => {
    const w = { ...z.wahl };
    if (fach == null) { delete w[v.nr]; neu({ wahl: w }); return; }
    const b = z.dat.find((x) => x.fach === fach);
    if (fachGeschuetzt(b)) { alt.meldung("Fach " + fach + " hat „" + b.name + "“, das bleibt immer so.", "warn"); return; }
    const anderes = zeilen.find((x) => x.nr !== v.nr && wirdGeschrieben(x) && x.fach === fach);
    if (anderes) w[anderes.nr] = v.fach;
    w[v.nr] = fach;
    neu({ wahl: w });
  };
  const laden = (e) => {
    herunterladen(e, text);
    if (onGeschrieben) onGeschrieben(aktiv);
  };

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
        <li><b>Werkzeuge aus InventorCAM:</b> den Werkzeugsatz (.TLM oder .TLS) wählen, dann sind auch Drehstähle und Greifer dabei; oder die Werkzeugtabelle als CSV (nur Fräser und Bohrer).
          <label className="knopf knopf--klein wz5-datei">Datei wählen
            <input type="file" accept=".csv,.CSV,.tlm,.TLM,.tls,.TLS" id="wz5-csv" data-ablegen="direkt" hidden onChange={lesen("csv")} /></label>
          {z.csv && <span className="wz5-ok" id="wz5-csv-ok">✓ {z.csvName}: {z.csv.length} Werkzeuge{z.csv.some((w) => w.dreh) ? ", davon " + z.csv.filter((w) => w.dreh).length + " Drehstähle / Greifer (nur geprüft)" : ""}</span>}</li>
        <li><b>Prüfen</b> und GESTOUTI.DAT herunterladen, dann an der Maschine einlesen.</li>
      </ol>

      {zeilen.length > 0 && (
        <>
          {/* seit 1.503.0 auch im Reiter von NC-PRO, dort ohne Marken (Wunsch Patrick 12. November 2026) */}
          <Magazin508 bloecke={z.dat} zeilen={zeilen.filter((v) => !v.dreh)} marken={pad ? marken : []} onFach={aufFach}
            onMarke={pad ? markeWaehlen : undefined} MarkeZeigen={MarkeZeigen} />
          <div className="tabellenrolle">
            <table className="tabelle wz5-tabelle" id="wz5-tabelle">
              <thead><tr><th /><th>Nr. / Fach</th>{pad && <th>Marke</th>}<th /><th>Name auf der Maschine</th><th>Typ</th><th>S max</th>
                <th>Zähne</th><th>Winkel</th><th>Radius</th><th title="Zustand 6 = Zu vermessen: das Programm misst das Werkzeug am Anfang (G850/G851)">Neu messen</th></tr></thead>
              <tbody>{zeilen.map((v) => {
                const geht = v.aktion === "neu" || v.aktion === "aendern";
                const [wort, klasse] = AKTION[v.aktion];
                const aus = !geht || v.mit === false;
                return (
                  <tr key={v.nr} data-wz5={v.nr} className={aus ? "wz5-aus" : ""}>
                    <td>{geht && <input type="checkbox" checked={v.mit !== false} title="Übernehmen"
                      onChange={(e) => setze(v.nr, { mit: e.target.checked })} />}</td>
                    <td><div className="wz5-nr">T{v.nr}</div>
                      {v.dreh ? (v.alt ? <div className="wz5-vorher">Fach {v.fach}</div> : null) : <select className={"wz5-fach" + (v.doppelt ? " wz5-warn" : "")} value={v.fach} data-wz5-fach={v.nr}
                        onChange={(e) => neu({ wahl: { ...z.wahl, [v.nr]: Number(e.target.value) } })}>
                        {z.dat.map((b) => <option key={b.fach} value={b.fach}>{fachText(b)}</option>)}</select>}
                      {v.doppelt && <div className="wz5-fehlertext">Fach doppelt</div>}</td>
                    {pad && <td>{geht && !aus ? <button className="wz5-marke" data-wz5-marke={v.nr} onClick={() => markeWaehlen(v)}>
                      {v.marke ? (MarkeZeigen ? <MarkeZeigen marke={v.marke} /> : v.marke) : "Marke wählen"}</button> : null}</td>}
                    <td><span className={"wz5-schild " + klasse}>{wort}</span></td>
                    {geht ? <>
                      <td><input className="wz5-name" value={v.name} maxLength={32} disabled={aus}
                        onChange={(e) => setze(v.nr, { name: e.target.value.replace(/[()]/g, "") })} />
                        {v.alt && !v.alt.leer && v.alt.name !== v.name && <div className="wz5-vorher">vorher: {v.alt.name}</div>}
                        <div className="wz5-vorher">CAM: {v.cam.art.toLowerCase()} Ø{v.cam.d}</div>
                        {v.ersetzt && <div className="wz5-hinweis">raus: „{v.ersetzt.name}“ (Nr. {v.ersetzt.nr})</div>}
                        {v.leeren && <div className="wz5-hinweis">Fach {v.leeren.fach} („{v.leeren.name}“) wird geleert</div>}</td>
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
          <p className="wz5-hilfe">Neue Werkzeuge bekommen als Länge den Wert aus dem CAM (H-Länge; aus .TLM und .TLS aus Halter und Ausspannlänge gerechnet, fehlt sie dort, 999.9999) und Zustand 6 „Zu vermessen“;
            das Programm misst sie am Anfang selbst. Bei vorhandenen Werkzeugen bleiben Länge und Abnutzung, der Radius
            ändert nur, wenn der Durchmesser anders ist. Leere Fächer im CAM bleiben auf der Maschine, wie sie sind.</p>
          {drehFehlt.length > 0 && <p className="karte karte--fehler" id="wz5-dreh-fehlt">Nicht auf der Maschine: {drehFehlt.map((v) => "T" + v.nr + " " + v.name).join(", ")}. Drehstähle und Greifer richtet man an der Maschine von Hand ein.</p>}
          {doppelt.length > 0 && <p className="karte karte--fehler" id="wz5-doppelt">Zwei Werkzeuge im selben Fach ({[...new Set(doppelt.map((v) => v.fach))].join(", ")}). Bitte ein anderes Fach wählen.</p>}
          {fehlerS.length > 0 && <p className="karte karte--fehler" id="wz5-smax-fehlt">S max fehlt bei Fach {fehlerS.map((v) => v.nr).join(", ")}. Bitte eintragen.</p>}
          <div className="wz5-fuss">
            <button className="knopf" id="wz5-laden" disabled={!text} onClick={laden}>GESTOUTI.DAT herunterladen</button>
            <span>{aktiv.length} von {machbar.length} Werkzeugen werden übernommen</span>
          </div>
        </>
      )}
    </div>
  );
}
