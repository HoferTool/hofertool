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
window.hoferCamModulEinfuegen = (z, zeilen, zustand) => {
  const ziel = ziele[z];
  if (!ziel || !empfaenger) return { ok: false, text: "HOFERCAM kennt diesen Tab nicht mehr. Bitte dort „+ Aus Modul“ nochmals wählen." };
  if (zustand) window.hoferCamModulMerken(z, zustand);
  return empfaenger(ziel.blockId, zeilen.map(String), ziel.pos());
};

// Einstellungen des Moduls je Bearbeitung (seit 1.617.0, Wunsch Patrick
// 17. November 2026: „wenn ich in der selben Bearbeitung wieder ins Modul
// springe, die Einstellungen noch haben, damit ich anpassen kann“).
// HOFERCAM hebt sie am Block auf (b.modul[art]); der Tab holt sie beim
// Start über window.opener und gibt sie beim Einfügen und beim Zugehen
// zurück. Daten als JSON, damit nichts zwischen den Fenstern geteilt wird.
let zustandAblage = null;
export function modulZustandAblage(a) { zustandAblage = a; }
window.hoferCamModulZustand = (z) => {
  const ziel = ziele[z];
  if (!ziel || !zustandAblage) return null;
  const x = zustandAblage.lesen(ziel.blockId, ziel.art);
  return x ? JSON.stringify(x) : null;
};
window.hoferCamModulMerken = (z, text) => {
  const ziel = ziele[z];
  if (!ziel || !zustandAblage || !text) return;
  try { zustandAblage.merken(ziel.blockId, ziel.art, JSON.parse(text)); } catch (f) { /* kaputt: nichts merken */ }
};

// Im Tab: jedes Modul meldet, wie man seine Einstellungen liest; der Start
// mit den gemerkten Werten kommt aus modulStart (nur in diesem Tab und nur
// für das eigene Modul).
const anmeldung = {};
export function modulZustandAnmelden(art, lesen) { anmeldung[art] = lesen; }
let startGeholt = null;
export function modulStart(art) {
  if (!istModulTab() || modulTabArt() !== art) return null;
  if (startGeholt === null) {
    startGeholt = false;
    try {
      const op = window.opener;
      const t = op && !op.closed && op.hoferCamModulZustand ? op.hoferCamModulZustand(kennung()) : null;
      if (t) startGeholt = JSON.parse(t);
    } catch (f) { startGeholt = false; }
  }
  return startGeholt || null;
}
const zustandText = (art) => {
  try { return anmeldung[art] ? JSON.stringify(anmeldung[art]()) : null; } catch (f) { return null; }
};
// Beim Zugehen des Tabs (auch mit dem Kreuz des Browsers) die Werte zurück
if (istModulTab()) {
  window.addEventListener("pagehide", () => {
    const art = modulTabArt(), t = zustandText(art);
    try { const op = window.opener; if (t && op && !op.closed && op.hoferCamModulMerken) op.hoferCamModulMerken(kennung(), t); } catch (f) { /* egal */ }
  });
}

export function modulTabOeffnen(art, blockId, pos) {
  const z = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  ziele[z] = { blockId, pos, art };
  const basis = location.href.split("#")[0].replace(/([?&])fassung=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const w = window.open(basis + "#/nc/modul/" + art + "?z=" + z, "hofer-nc-modul-" + z);
  if (w) { try { w.focus(); } catch (f) { /* egal */ } return true; }
  delete ziele[z];
  alt.meldung("Der Browser hat den Tab gesperrt. Bitte Pop-ups für das HoferTool erlauben.", "warn");
  return false;
}

// Auswahl der Module beim Knopf „+ Aus Modul“. Seit 1.594.0 mit der Wahl,
// woher der Code kommt (Wunsch Patrick 17. November 2026: „ob der aktuelle
// NC-Code aus den Reiter-Modulen kommt, oder ob ein neues Fenster mit einer
// leeren Vorlage aufgemacht werden soll“): „Aktueller Code aus dem Reiter“
// nimmt, was der Reiter zuletzt erzeugt hat (ncAktuell.js), mit Vorschau;
// „Leer im neuen Tab“ wie seit 1.588.0. Die Wahl merkt das Gerät.
const QUELLE = "hofer.cam.modulQuelle";
export function ModulWahl({ blockId, pos, zu }) {
  const [quelle, setQuelleRoh] = useState(() => { try { return localStorage.getItem(QUELLE) === "aktuell" ? "aktuell" : "tab"; } catch { return "tab"; } });
  const setQuelle = (q) => { setQuelleRoh(q); try { localStorage.setItem(QUELLE, q); } catch { /* egal */ } };
  const [, neu] = useState(0);
  useEffect(() => ncBeobachten(() => neu((n) => n + 1)), []);
  // vorgewählt das zuletzt geänderte Modul mit Code
  const [art, setArt] = useState(() => {
    const mit = NC_QUELLEN.map(([k]) => [k, ncAktuell(k)]).filter(([, a]) => a && a.text.trim());
    mit.sort((a, b) => (b[1].zeit || 0) - (a[1].zeit || 0));
    return mit.length ? mit[0][0] : null;
  });
  const [ohne, setOhne] = useState(true);
  const zeilen = art ? ncZeilen(ncAktuell(art)?.text || "", ohne && hatSpann()) : [];
  const uebernehmen = () => {
    if (!empfaenger) return;
    const erg = empfaenger(blockId, zeilen.map(String), pos());
    alt.meldung(erg.text, erg.ok ? "gut" : "fehler");
    if (erg.ok) zu();
  };
  return (
    <div className="cam-vorlage" data-cammodul>
      <div className="cam-vorlage__kopf">
        <b>Aus Modul</b>
        <span className="cam-modul__quelle">
          <button className={"knopf knopf--klein" + (quelle === "aktuell" ? " cam-modul--an" : "")} data-cammodul-quelle="aktuell"
            onClick={() => setQuelle("aktuell")}>Aktueller Code aus dem Reiter</button>
          <button className={"knopf knopf--klein" + (quelle === "tab" ? " cam-modul--an" : "")} data-cammodul-quelle="tab"
            onClick={() => setQuelle("tab")}>Leere Vorlage im neuen Tab ↗</button>
        </span>
        <button className="knopf knopf--klein" title="Schliessen" onClick={zu}>✕</button>
      </div>
      {quelle === "tab" ? <>
        <span className="klein">Öffnet das Modul in einem eigenen Tab, beim ersten Mal leer, danach mit den Einstellungen, die in dieser Bearbeitung zuletzt galten. Dort „Einfügen in HOFERCAM“ setzt den Code nach der Zeile mit der Schreibmarke ein.</span>
        <div className="cam-modul__wahl">
          {NC_QUELLEN.map(([k, n]) => (
            <button key={k} className="knopf knopf--klein" data-cammodul-wahl={k}
              onClick={() => { if (modulTabOeffnen(k, blockId, pos)) zu(); }}>{n} ↗</button>))}
        </div>
      </> : <>
        <span className="klein">Nimmt den Code, den der Reiter des Moduls zuletzt erzeugt hat. „Einfügen“ setzt ihn nach der Zeile mit der Schreibmarke ein.</span>
        <div className="cam-modul__wahl">
          {NC_QUELLEN.map(([k, n]) => {
            const a = ncAktuell(k), da = !!(a && a.text.trim());
            return <button key={k} className={"knopf knopf--klein" + (art === k ? " cam-modul--an" : "")} data-cammodul-aktuell={k} disabled={!da}
              title={da ? "" : "Dieser Reiter war noch nicht offen oder hat noch keinen Code"} onClick={() => setArt(k)}>{n}</button>;
          })}
        </div>
        {art ? <div className="cam-modul__aktuell">
          {hatSpann() && <label className="cam-feld cam-feld--haken" title="Vor- und Nachspann für die Maschine weglassen, sie stehen in HOFERCAM schon im Kopf und Ende">
            <input type="checkbox" data-cammodul-ohne checked={ohne} onChange={(e) => setOhne(e.target.checked)} />
            <span>ohne Vor- und Nachspann</span></label>}
          <pre className="cam-modul__vorschau" data-cammodul-vorschau>{zeilen.join("\n") || "(kein Code)"}</pre>
          <button className="knopf knopf--klein cam-modul--an" data-cammodul-einfuegen disabled={!zeilen.length} onClick={uebernehmen}>
            Einfügen ({zeilen.length} Zeilen)</button>
        </div> : <span className="klein">Noch kein Modul hat Code erzeugt. Öffne zuerst einen Reiter wie Bohren / Fräsen oder nimm „Leere Vorlage im neuen Tab“.</span>}
      </>}
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
      erg = op && !op.closed && op.hoferCamModulEinfuegen ? op.hoferCamModulEinfuegen(kennung(), zeilen, zustandText(art)) : null;
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
