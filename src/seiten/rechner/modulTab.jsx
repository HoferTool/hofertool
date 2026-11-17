// =================================================================
//  MODUL IM EIGENEN TAB FÜR HOFERCAM
//  Seit 1.588.0 (Wunsch Patrick 17. November 2026: „wenn der Button
//  gedrückt wird, eine Auswahl der Module … ein eigener Tab mit einer
//  leeren Vorlage aus dem Modul … dort einfügen drücken können, um den
//  Code zu übernehmen … unabhängig von den aktuellen Arbeiten in den
//  Modulen, welche ich über den Reiter anwähle“).
//
//  „+ Aus Modul“ in einer Bearbeitung von HOFERCAM zeigt die Module zur
//  Wahl; die Wahl öffnet #/nc/modul/<art>?z=<Kennung> in einem neuen Tab.
//  Der Tab ist eine eigene Seite mit eigenem Speicher: das Modul startet
//  leer (die Werte der Module liegen je Tab im Programm, die Kontur liest
//  und schreibt dort nicht am Konto), und was er erzeugt, meldet er nicht
//  in den Speicher der Reiter. „Einfügen in HOFERCAM“ ruft über
//  window.opener den Tab mit HOFERCAM auf, der den Code in genau die
//  Bearbeitung nach der Zeile mit der Schreibmarke setzt.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { NC_QUELLEN, hatSpann, ncAktuell, ncBeobachten, ncZeilen } from "./ncAktuell.js";

const RE = /^#\/?nc\/modul\/([a-z0-9]+)(?:\?z=([\w-]+))?/i;
export const istModulTab = () => RE.test(location.hash);
export const modulTabArt = () => { const m = location.hash.match(RE); return m ? m[1] : null; };
const kennung = () => { const m = location.hash.match(RE); return m ? m[2] || "" : ""; };
export const modulName = (art) => (NC_QUELLEN.find(([k]) => k === art) || [, art])[1];

// ---- Seite mit HOFERCAM: Ziele der offenen Tabs --------------------
// Kennung → { blockId, pos() }. Bleibt, solange der Tab mit HOFERCAM
// offen ist, auch wenn man dort den Reiter wechselt.
const ziele = {};
let empfaenger = null;
// HoferCam.jsx meldet hier, wie Zeilen in eine Bearbeitung kommen
export function modulEmpfaenger(fn) { empfaenger = fn; }
window.hoferCamModulEinfuegen = (z, zeilen) => {
  const ziel = ziele[z];
  if (!ziel || !empfaenger) return { ok: false, text: "HOFERCAM kennt diesen Tab nicht mehr. Bitte dort „+ Aus Modul“ nochmals wählen." };
  return empfaenger(ziel.blockId, zeilen.map(String), ziel.pos());
};

export function modulTabOeffnen(art, blockId, pos) {
  const z = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  ziele[z] = { blockId, pos };
  const basis = location.href.split("#")[0].replace(/([?&])fassung=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const w = window.open(basis + "#/nc/modul/" + art + "?z=" + z, "hofer-nc-modul-" + z);
  if (w) { try { w.focus(); } catch (f) { /* egal */ } return true; }
  delete ziele[z];
  alt.meldung("Der Browser hat den Tab gesperrt. Bitte Pop-ups für das HoferTool erlauben.", "warn");
  return false;
}

// Auswahl der Module beim Knopf „+ Aus Modul“
export function ModulWahl({ blockId, pos, zu }) {
  return (
    <div className="cam-vorlage" data-cammodul>
      <div className="cam-vorlage__kopf">
        <b>Aus Modul</b>
        <span className="klein">Öffnet das Modul leer in einem eigenen Tab. Dort „Einfügen in HOFERCAM“ setzt den Code nach der Zeile mit der Schreibmarke ein.</span>
        <button className="knopf knopf--klein" title="Schliessen" onClick={zu}>✕</button>
      </div>
      <div className="cam-modul__wahl">
        {NC_QUELLEN.map(([k, n]) => (
          <button key={k} className="knopf knopf--klein" data-cammodul-wahl={k}
            onClick={() => { if (modulTabOeffnen(k, blockId, pos)) zu(); }}>{n} ↗</button>))}
      </div>
    </div>
  );
}

// ---- Der Tab selbst -------------------------------------------------
export function ModulTabKopf({ art }) {
  const [, neu] = useState(0);
  useEffect(() => ncBeobachten(() => neu((n) => n + 1)), []);
  const [ohne, setOhne] = useState(true);
  const zeilen = ncZeilen(ncAktuell(art)?.text || "", ohne && hatSpann());
  const einfuegen = () => {
    const op = window.opener;
    let erg;
    try {
      erg = op && !op.closed && op.hoferCamModulEinfuegen ? op.hoferCamModulEinfuegen(kennung(), zeilen) : null;
    } catch (f) { erg = null; }
    if (!erg) { alt.meldung("HOFERCAM ist nicht mehr offen. Den Code kann man hier im Modul kopieren.", "fehler"); return; }
    if (!erg.ok) { alt.meldung(erg.text, "fehler"); return; }
    alt.meldung(erg.text, "gut");
    // Fertig: zurück zu HOFERCAM, dieser Tab geht zu
    setTimeout(() => { try { op.focus(); } catch (f) { /* egal */ } window.close(); }, 600);
  };
  return (
    <header className="ncpro-kopf nc-modultab" id="ncpro-kopf" data-ncmodultab={art}>
      <h1 className="seitentitel ncpro-titel"><span className="ncpro-text"><b>NC-PRO</b></span> · {modulName(art)}
        <span className="klein nc-modultab__hinweis"> für HOFERCAM</span></h1>
      <div className="nc-modultab__knoepfe">
        {hatSpann() && <label className="cam-feld cam-feld--haken" title="Vor- und Nachspann für die Maschine weglassen, sie stehen in HOFERCAM schon im Kopf und Ende">
          <input type="checkbox" data-ncmodultab-ohne checked={ohne} onChange={(e) => setOhne(e.target.checked)} />
          <span>ohne Vor- und Nachspann</span></label>}
        <span className="klein" data-ncmodultab-zeilen>{zeilen.length ? zeilen.length + " Zeilen" : "noch kein Code"}</span>
        <button className="knopf knopf--primaer" data-ncmodultab-einfuegen disabled={!zeilen.length} onClick={einfuegen}>
          ⤴ Einfügen in HOFERCAM</button>
        <button className="knopf knopf--klein" data-ncmodultab-zu onClick={() => window.close()}>Schliessen</button>
      </div>
      <div className="ncpro-kopf__rechts" id="ncpro-kopf-rechts" />
    </header>
  );
}

// Escape ganz am Schluss: Tab schliessen nach einer Rückfrage
let fragt = false;
export async function modulTabVerlassenFragen() {
  if (fragt) return;
  fragt = true;
  try {
    const ja = await alt.nachfragen({ titel: "Tab schliessen?", text: "Was hier nicht eingefügt ist, geht verloren. Enter schliesst, Escape bleibt hier.", bestaetigen: "Schliessen" });
    if (ja) window.close();
  } finally { fragt = false; }
}
