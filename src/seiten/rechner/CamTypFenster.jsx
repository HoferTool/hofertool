// =================================================================
//  HOFERCAM → Fenster „⚙ Maschinentyp“
//  Seit 1.441.0 (Wunsch Patrick 6. November 2026: „pro Maschinentyp eine
//  Konfigurationsoberfläche, bei welcher ich selber Änderungen vornehmen
//  kann“, „ich will alles, was du gemacht hast, ändern können“): Kopf und
//  Ende beider Kanäle, je Bearbeitungsart die Zeilen in Kanal 1 und 2,
//  Werkzeugplätze, Vorgaben der Felder und neuer Bearbeitungen und die
//  Wartemarken. Vorlagen und Rechnen in camTyp.js, gespeichert nur die
//  Abweichungen in app_config.hofercam_typen. Ändern nur Admins.
// =================================================================
import { useMemo, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { inEigenesFenster } from "../../teile/eigenesFenster.js";
import { Reiter } from "../../teile/Reiter.jsx";
import {
  ARTEN, BEDINGUNGEN, BLOCK_FELDER, CONFIG_SCHLUESSEL, FELD_ARTEN, FELD_ORTE, PLATZ_GRUPPEN, PLATZHALTER_BLOCK, PLATZHALTER_KOPF,
  TYP, TYP_NAME, eigeneFehler, eigeneNamen, eigeneVorgaben, eingebauteFelder, mitTyp, typ, typAbweichungen, typMischen, typSetzen,
  vorgabeTyp, vorlageFehler,
} from "./camTyp.js";
import { FELDER, neuerBlock, programme } from "./hofercam.js";

const kopie = (t) => JSON.parse(JSON.stringify(t));

// Gespeicherte Einstellungen einmal je Laden der App holen
let geladen = null;
async function alleLesen() {
  const r = await alt.zeitlimit(alt.db.from("app_config").select("wert").eq("schluessel", CONFIG_SCHLUESSEL).maybeSingle(), 6000, "HOFERCAM-Typen");
  if (r && r.error) throw r.error;
  const text = r && r.data && r.data.wert;
  if (!text) return {};
  try { const o = typeof text === "string" ? JSON.parse(text) : text; return o && typeof o === "object" ? o : {}; } catch (f) { return {}; }
}
export function camTypLaden() {
  if (!geladen) geladen = alleLesen().then((alle) => { typSetzen(typMischen(alle[TYP] || {})); }).catch((f) => {
    geladen = null;
    alt.fehlerMerken && alt.fehlerMerken("HOFERCAM-Typen laden", String((f && f.message) || f));
  });
  return geladen;
}

const KOPF_TEILE = [
  ["k1kopf", "Kanal 1 Kopf"], ["k1ende", "Kanal 1 Ende"], ["k2kopf", "Kanal 2 Kopf"], ["k2ende", "Kanal 2 Ende"],
];

// Beispiel für die Vorschau: Kopf und Ende mit einer Bearbeitung der gewählten Art
function beispiel(t, artId) {
  return mitTyp(t, () => {
    const a = ARTEN.find((x) => x.id === artId) || ARTEN[0];
    const grund = a.id.replace("Gegen", "");
    const b = { ...neuerBlock([], grund), id: "beispiel", bez: "BEISPIEL", code: "G1X5.F0.1\nG0Z2." };
    if (a.id.endsWith("Gegen")) b.spindel = "gegen";
    const w = { ...vorgabeWerte(t), eigen: eigeneVorgaben("kopf"), nr: "458", hoco: "10841-0009", datum: "06.11.26", kuerzel: "PR", bloecke: [b] };
    return programme(w);
  });
}
const vorgabeWerte = (t) => ({ ...t.vorgaben });

function Hilfe({ liste, titel }) {
  return (
    <details className="camtyp-hilfe">
      <summary>{titel}</summary>
      <table><tbody>{liste.map(([n, t]) => <tr key={n}><td><code>{n}</code></td><td>{t}</td></tr>)}</tbody></table>
    </details>
  );
}

function Vorlage({ wert, vorgabe, setze, block, darf, name, extra }) {
  const fehler = vorlageFehler(wert, block, extra);
  return (
    <div className="camtyp-vorlage">
      <div className="camtyp-vorlage__kopf">
        <b>{name}</b>
        {wert !== vorgabe && <span className="camtyp-geaendert">geändert</span>}
        {darf && wert !== vorgabe && <button className="knopf knopf--klein" data-camtyp-wie onClick={() => setze(vorgabe)}>Wie Vorgabe</button>}
      </div>
      <textarea data-camtyp-text={name} value={wert} readOnly={!darf} spellCheck={false}
        rows={Math.min(28, Math.max(6, wert.split("\n").length + 1))} onChange={(e) => setze(e.target.value)} />
      {fehler.length > 0 && <p className="camtyp-fehler klein">Unbekannt, bleibt so im Programm stehen: {fehler.join(", ")}</p>}
    </div>
  );
}

const eigeneHilfe = (x) => x.liste.map((f) => [f.ph, f.text + " (eigenes Feld" + (f.ort === "kopf" ? ", oben" : "") + ")"]);
const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Beschriftung eines eingebauten Felds
const feldText = (ort, k) => (ort === "kopf" ? (FELDER.flatMap((g) => g.felder).find((d) => d.name === k) || { text: k }).text : BLOCK_FELDER[k] || k);
// Platzhalter aus dem Namen vorschlagen: „Kühlmittel“ → KUEHLMITTEL
const phAus = (text) => String(text).toUpperCase().replace(/Ä/g, "AE").replace(/Ö/g, "OE").replace(/Ü/g, "UE")
  .replace(/[^A-Z0-9]+/g, "_").replace(/^[_0-9]+|_+$/g, "").slice(0, 20);

// Seit 1.450.0 (Wunsch Patrick 7. November 2026): eigene Eingabefelder
// anlegen, eingebaute ausblenden
function Eingabefelder({ t, aendern, darf, ort, setOrt }) {
  const fehler = eigeneFehler(t);
  const eigene = t.felder.eigene.filter((f) => f.ort === ort);
  const eingebaut = eingebauteFelder(t, ort);
  const aus = t.felder.aus[ort] || [];
  const feldSetzen = (id, was) => aendern((n) => { const f = n.felder.eigene.find((x) => x.id === id); if (f) Object.assign(f, was); });
  const loeschen = async (f) => {
    if (!(await alt.nachfragen({ titel: "Feld löschen", text: "„" + (f.text || f.ph) + "“ löschen? Steht {" + f.ph + "} noch in einer Vorlage, bleibt es dort unverändert stehen.", bestaetigen: "Löschen", gefahr: true }))) return;
    aendern((n) => { n.felder.eigene = n.felder.eigene.filter((x) => x.id !== f.id); });
  };
  const neu = () => aendern((n) => { n.felder.eigene.push({ id: neueId(), ort, text: "", ph: "", art: "zahl", vorgabe: "", liste: [], aus: false }); });
  const vorgabeFeld = (f) => {
    const dis = !darf;
    if (f.art === "haken") return <label className="cam-feld cam-g96"><input type="checkbox" data-camtyp-eigen-vorgabe={f.id} disabled={dis}
      checked={f.vorgabe === "1"} onChange={(e) => feldSetzen(f.id, { vorgabe: e.target.checked ? "1" : "" })} /><span>Vorgabe an</span></label>;
    if (f.art === "liste") return <label className="cam-feld"><span>Vorgabe</span><select data-camtyp-eigen-vorgabe={f.id} disabled={dis} value={f.vorgabe}
      onChange={(e) => feldSetzen(f.id, { vorgabe: e.target.value })}><option value="">–</option>{f.liste.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>;
    return <label className="cam-feld"><span>Vorgabe</span><input data-camtyp-eigen-vorgabe={f.id} readOnly={dis} value={f.vorgabe} style={{ width: 90 }}
      onChange={(e) => feldSetzen(f.id, { vorgabe: e.target.value })} /></label>;
  };
  return (
    <div className="camtyp-werte" id="camtyp-felder">
      <label className="cam-feld camtyp-art"><span>Wo</span>
        <select data-camtyp-ort value={ort} onChange={(e) => setOrt(e.target.value)}>
          {FELD_ORTE.map(([o, x]) => <option key={o} value={o}>{x}{(t.felder.aus[o] || []).length || t.felder.eigene.some((f) => f.ort === o) ? " •" : ""}</option>)}
        </select></label>
      <fieldset className="cam-gruppe camtyp-felder"><legend>Eingebaute Felder</legend>
        {eingebaut.map((k) => (
          <label key={k} className="cam-feld cam-g96" title={aus.includes(k) ? "Ausgeblendet: im Programm steht fest die Vorgabe" : "Wird angezeigt"}>
            <input type="checkbox" data-camtyp-an={ort + "." + k} disabled={!darf} checked={!aus.includes(k)}
              onChange={(e) => aendern((n) => {
                const l = new Set(n.felder.aus[ort] || []);
                if (e.target.checked) l.delete(k); else l.add(k);
                n.felder.aus[ort] = [...l];
              })} />
            <span>{feldText(ort, k)}{aus.includes(k) ? <span className="klein"> (fest: {(ort === "kopf" ? t.vorgaben[k] : t.bloecke[ort][k]) || "leer"})</span> : null}</span></label>
        ))}
      </fieldset>
      <fieldset className="cam-gruppe camtyp-eigene"><legend>Eigene Felder</legend>
        {eigene.length === 0 && <p className="klein">Noch keine.</p>}
        {eigene.map((f) => (
          <div key={f.id} className={"camtyp-eigen" + (fehler[f.id] ? " camtyp-eigen--fehler" : "")} data-camtyp-eigen={f.id}>
            <label className="cam-feld cam-g96" title="Im Formular anzeigen; ausgeblendet gilt die Vorgabe">
              <input type="checkbox" data-camtyp-eigen-an={f.id} disabled={!darf} checked={!f.aus} onChange={(e) => feldSetzen(f.id, { aus: !e.target.checked })} /><span>an</span></label>
            <label className="cam-feld cam-feld--text"><span>Name</span>
              <input data-camtyp-eigen-text={f.id} readOnly={!darf} value={f.text} style={{ width: 150 }}
                onChange={(e) => { const text = e.target.value; feldSetzen(f.id, f.ph === "" || f.ph === phAus(f.text) ? { text, ph: phAus(text) } : { text }); }} /></label>
            <label className="cam-feld"><span>Platzhalter</span>
              <input data-camtyp-eigen-ph={f.id} readOnly={!darf} value={f.ph} style={{ width: 120 }}
                onChange={(e) => feldSetzen(f.id, { ph: e.target.value.toUpperCase().replace(/[{}\s]/g, "") })} /></label>
            <label className="cam-feld"><span>Art</span>
              <select data-camtyp-eigen-art={f.id} disabled={!darf} value={f.art}
                onChange={(e) => feldSetzen(f.id, { art: e.target.value, vorgabe: e.target.value === "haken" ? "" : f.vorgabe })}>
                {FELD_ARTEN.map(([a, x]) => <option key={a} value={a}>{x}</option>)}
              </select></label>
            {f.art === "liste" && <label className="cam-feld cam-feld--text" title="Einträge mit Strichpunkt trennen"><span>Einträge</span>
              <input data-camtyp-eigen-liste={f.id} readOnly={!darf} defaultValue={f.liste.join("; ")} style={{ width: 200 }} placeholder="M8; M7; M9"
                onBlur={(e) => { const l = [...new Set(e.target.value.split(";").map((x) => x.trim()).filter(Boolean))];
                  feldSetzen(f.id, { liste: l, vorgabe: l.includes(f.vorgabe) ? f.vorgabe : "" }); }} /></label>}
            {vorgabeFeld(f)}
            {darf && <button className="knopf knopf--klein" title="Feld löschen" data-camtyp-eigen-weg={f.id} onClick={() => loeschen(f)}>✕</button>}
            {f.ph && !fehler[f.id] && <span className="klein camtyp-eigen__ph">{"{" + f.ph + "}"} · [{f.ph.toLowerCase()}]</span>}
            {fehler[f.id] && <span className="klein camtyp-fehler">{fehler[f.id]}</span>}
          </div>
        ))}
        {darf && <button className="knopf knopf--klein" id="camtyp-eigen-neu" onClick={neu}>+ Eigenes Feld</button>}
      </fieldset>
      <p className="klein">Ein eigenes Feld setzt du in den Vorlagen mit <code>{"{PLATZHALTER}"}</code> ein. <code>[platzhalter] …</code> am Anfang
        einer Zeile lässt die Zeile nur stehen, wenn das Feld ausgefüllt bzw. das Häkchen an ist, <code>[!platzhalter]</code> nur, wenn nicht.
        Felder oben gelten auch in allen Bearbeitungen. Zahlen ohne Punkt bekommen einen Punkt dahinter (17 → 17.).
        Ausgeblendete eingebaute Felder nehmen fest die Vorgabe aus „Plätze, Vorgaben, Marken“.</p>
    </div>
  );
}

function Fenster({ zu }) {
  const darf = !!(alt.istAdmin && alt.istAdmin());
  const [t, setT] = useState(() => kopie(typ()));
  const v = useMemo(() => vorgabeTyp(), []);
  const [reiter, setReiter] = useState("kopf");
  const [kopfTeil, setKopfTeil] = useState("k1kopf");
  const [art, setArt] = useState("dreh");
  const [feldOrt, setFeldOrt] = useState("kopf");
  const [speichert, setSpeichert] = useState(false);
  const aendern = (f) => setT((x) => { const n = kopie(x); f(n); return n; });
  const vorlage = (k, text) => aendern((n) => { n.vorlagen[k] = text; });

  const vorschauArt = reiter === "felder" && feldOrt !== "kopf" ? feldOrt : art;
  const prog = useMemo(() => beispiel(t, vorschauArt), [t, vorschauArt]);
  const feldFehler = eigeneFehler(t);
  const geaendert = JSON.stringify(typAbweichungen(t)) !== JSON.stringify(typAbweichungen(typ()));

  const speichern = async () => {
    setSpeichert(true);
    try {
      const vorher = await alt.rueckSichern("app_config", { schluessel: CONFIG_SCHLUESSEL });
      const alle = await alleLesen();
      const ab = typAbweichungen(t);
      if (Object.keys(ab).length) alle[TYP] = ab; else delete alle[TYP];
      const r = await alt.db.from("app_config").upsert([{ schluessel: CONFIG_SCHLUESSEL, wert: JSON.stringify(alle) }], { onConflict: "schluessel" });
      if (r && r.error) throw r.error;
      alt.merkeSchritt("HOFERCAM " + TYP_NAME, vorher.length
        ? alt.rueckRein("app_config", vorher, "schluessel")
        : alt.rueckWeg("app_config", { schluessel: CONFIG_SCHLUESSEL }));
      typSetzen(typMischen(ab));
      alt.meldung("Einstellungen " + TYP_NAME + " gespeichert", "gut");
      zu();
    } catch (f) {
      alt.meldung("Speichern ging nicht: " + ((f && f.message) || f), "fehler");
    } finally { setSpeichert(false); }
  };

  const ausschnitt = (zeilen, ber) => (ber ? zeilen.slice(ber[0] - 1, ber[1]) : []);
  // Im Reiter Eingabefelder zeigt die Vorschau eine Bearbeitung der gewählten Art
  const vorschau = reiter === "bearb" || (reiter === "felder" && feldOrt !== "kopf")
    ? [ausschnitt(prog.k1, prog.bereiche.beispiel), ausschnitt(prog.k2, prog.bereiche2.beispiel)]
    : [prog.k1, prog.k2];

  return (
    <div className="dialog camtyp" id="camtyp">
      <div className="camtyp__kopf">
        <h3>HOFERCAM · Maschinentyp {TYP_NAME}</h3>
        <button className="knopf knopf--klein" id="camtyp-zu" onClick={zu}>✕</button>
      </div>
      {!darf && <p className="klein camtyp-nur">Nur Admins können hier etwas ändern.</p>}
      <Reiter merkmal="camtyp-reiter" aktiv={reiter} waehlen={setReiter}
        reiter={[["kopf", "Kopf und Ende"], ["bearb", "Bearbeitungen"], ["felder", "Eingabefelder"], ["werte", "Plätze, Vorgaben, Marken"]]} />
      <div className="camtyp__inhalt">
        <div className="camtyp__links">
          {reiter === "kopf" && <>
            <div className="camtyp-wahl">
              {KOPF_TEILE.map(([k, text]) => (
                <button key={k} data-camtyp-teil={k} className={"knopf knopf--klein" + (kopfTeil === k ? " knopf--primaer" : "")}
                  onClick={() => setKopfTeil(k)}>{text}{t.vorlagen[k] !== v.vorlagen[k] ? " •" : ""}</button>
              ))}
            </div>
            <Vorlage name={KOPF_TEILE.find(([k]) => k === kopfTeil)[1]} wert={t.vorlagen[kopfTeil]} vorgabe={v.vorlagen[kopfTeil]}
              setze={(x) => vorlage(kopfTeil, x)} darf={darf} extra={eigeneNamen(t)} />
            <p className="klein">„(Ende Kopf)“ und „(Start Ende)“ bitte stehen lassen: dazwischen kommen die Bearbeitungen.</p>
            <Hilfe titel="Platzhalter für Kopf und Ende" liste={[...PLATZHALTER_KOPF, ...eigeneHilfe(eigeneNamen(t))].map(([n, x]) => ["{" + n + "}", x])} />
          </>}
          {reiter === "bearb" && <>
            <label className="cam-feld camtyp-art"><span>Bearbeitung</span>
              <select data-camtyp-art value={art} onChange={(e) => setArt(e.target.value)}>
                {ARTEN.map((a) => <option key={a.id} value={a.id}>{a.text}
                  {t.vorlagen[a.id + ".k1"] !== v.vorlagen[a.id + ".k1"] || t.vorlagen[a.id + ".k2"] !== v.vorlagen[a.id + ".k2"] ? " •" : ""}</option>)}
              </select></label>
            <div className="camtyp-zwei">
              {["k1", "k2"].map((k) => (
                <Vorlage key={art + k} name={"Kanal " + k.slice(1)} wert={t.vorlagen[art + "." + k]} vorgabe={v.vorlagen[art + "." + k]}
                  setze={(x) => vorlage(art + "." + k, x)} block darf={darf} extra={eigeneNamen(t, art)} />
              ))}
            </div>
            <p className="klein">Eine Programmzeile je Zeile. <code>[hd] …</code> steht nur, wenn die Bedingung gilt,
              <code>[!hd] …</code> nur, wenn nicht. <code>{"{CODE}"}</code> allein auf einer Zeile setzt den NC-Code
              der Bearbeitung ein, <code>{"/{CODE}"}</code> mit „/“ vor jeder Zeile. Leere Zeilen fallen weg.</p>
            <Hilfe titel="Platzhalter der Bearbeitung" liste={[...PLATZHALTER_BLOCK, ...eigeneHilfe(eigeneNamen(t, art))].map(([n, x]) => ["{" + n + "}", x])} />
            <Hilfe titel="Bedingungen" liste={[...BEDINGUNGEN, ...eigeneNamen(t, art).liste.map((f) => [f.ph.toLowerCase(), f.text + (f.art === "haken" ? " ist an" : " ist ausgefüllt") + " (eigenes Feld)"])].map(([n, x]) => ["[" + n + "]", x])} />
          </>}
          {reiter === "felder" && <Eingabefelder t={t} aendern={aendern} darf={darf} ort={feldOrt} setOrt={setFeldOrt} />}
          {reiter === "werte" && <div className="camtyp-werte">
            <fieldset className="cam-gruppe"><legend>Werkzeugplätze (mit Komma)</legend>
              {PLATZ_GRUPPEN.map((g) => (
                <label key={g.id} className="cam-feld cam-feld--text camtyp-breit"><span>{g.text}</span>
                  <input data-camtyp-plaetze={g.id} readOnly={!darf} defaultValue={t.plaetze[g.id].join(", ")}
                    onBlur={(e) => {
                      const l = e.target.value.split(/[,;\s]+/).map((x) => x.replace(/^T/i, "").trim()).filter((x) => /^\d{2,5}$/.test(x));
                      aendern((n) => { n.plaetze[g.id] = l.length ? l : [...v.plaetze[g.id]]; });
                      e.target.value = (l.length ? l : v.plaetze[g.id]).join(", ");
                    }} /></label>
              ))}
            </fieldset>
            <fieldset className="cam-gruppe"><legend>Vorgaben der Felder oben (neue Programme)</legend>
              {FELDER.flatMap((g) => g.felder).filter((d) => d.name in t.vorgaben).map((d) => (
                <label key={d.name} className="cam-feld" title={d.lang || d.text}><span>{d.text}</span>
                  <input data-camtyp-vorgabe={d.name} readOnly={!darf} value={t.vorgaben[d.name]}
                    onChange={(e) => aendern((n) => { n.vorgaben[d.name] = e.target.value; })} /></label>
              ))}
            </fieldset>
            {Object.entries(t.bloecke).map(([a, o]) => (
              <fieldset key={a} className="cam-gruppe"><legend>Neue Bearbeitung: {(ARTEN.find((x) => x.id === a) || { text: a }).text.replace(", Hauptspindel", "")}</legend>
                {Object.keys(o).map((k) => (
                  <label key={k} className="cam-feld" title={BLOCK_FELDER[k] || k}><span>{BLOCK_FELDER[k] || k}</span>
                    <input data-camtyp-block={a + "." + k} readOnly={!darf} value={o[k]}
                      onChange={(e) => aendern((n) => { n.bloecke[a][k] = e.target.value; })} /></label>
                ))}
              </fieldset>
            ))}
            <fieldset className="cam-gruppe"><legend>Wartemarken von selbst</legend>
              <label className="cam-feld"><span>Ab M</span>
                <input data-camtyp-marke="ab" readOnly={!darf} type="number" min="200" max="999" value={t.marken.ab}
                  onChange={(e) => aendern((n) => { n.marken.ab = Math.max(200, Math.min(999, Number(e.target.value) || 300)); })} /></label>
              <label className="cam-feld"><span>Schritt</span>
                <input data-camtyp-marke="schritt" readOnly={!darf} type="number" min="1" max="100" value={t.marken.schritt}
                  onChange={(e) => aendern((n) => { n.marken.schritt = Math.max(1, Math.min(100, Number(e.target.value) || 10)); })} /></label>
            </fieldset>
            <p className="klein">Hochdruck-Befehle (M1881D…, M1891 …) stehen in den Vorlagen der Bearbeitungen und lassen sich dort ändern.</p>
          </div>}
        </div>
        <div className="camtyp__rechts">
          <b>Vorschau {vorschau.length && (reiter === "bearb" || (reiter === "felder" && feldOrt !== "kopf")) ? "dieser Bearbeitung" : "(Beispiel mit einer Bearbeitung)"}</b>
          <div className="camtyp-vorschau">
            {vorschau.map((z, i) => (
              <div key={i}><span className="klein">Kanal {i + 1}</span>
                <pre data-camtyp-vorschau={i + 1}>{z.length ? z.join("\n") : "(keine Zeilen)"}</pre></div>
            ))}
          </div>
        </div>
      </div>
      <div className="camtyp__fuss">
        {darf && <button className="knopf" data-camtyp-allevorgabe onClick={() => setT(vorgabeTyp())}>Alles wie Vorgabe</button>}
        <span className="camtyp__luecke" />
        <button className="knopf" onClick={zu}>{darf ? "Abbrechen" : "Schliessen"}</button>
        {darf && <button className="knopf knopf--primaer" id="camtyp-speichern" disabled={speichert || !geaendert || Object.keys(feldFehler).length > 0}
          title={Object.keys(feldFehler).length ? "Zuerst die roten Eingabefelder korrigieren" : undefined} onClick={speichern}>
          {speichert ? "Speichert …" : "Speichern"}</button>}
      </div>
    </div>
  );
}

// Seit 1.444.3 (Patrick 7. November 2026: „Maschinentypen sollen auch in
// eigenem Tab geöffnet werden“): am Computer mit Maus geht das Fenster
// gleich in einem eigenen Browserfenster auf, wie die Kanäle; lässt der
// Browser es nicht zu, bleibt es still in der App. Im Prüfstand nur mit
// TEST.eigenesFenster, die übrigen Tests suchen es in der Seite
let offenZu = null;
const eigenMoeglich = () => !(window.TEST && !window.TEST.eigenesFenster)
  && !alt.isMobil() && !document.body.classList.contains("pad-offen")
  && window.matchMedia("(pointer: fine)").matches;
export function camTypFensterOeffnen() {
  if (offenZu || document.getElementById("camtyp")) return;
  const zu = fensterOeffnen((zu) => <Fenster zu={zu} />, () => { offenZu = null; }, "camtyp-huelle");
  offenZu = zu;
  if (!eigenMoeglich()) return;
  const huellen = document.querySelectorAll(".camtyp-huelle");
  const huelle = huellen[huellen.length - 1];
  if (huelle) inEigenesFenster(huelle, zu, { titel: "HOFERCAM · Maschinentyp " + TYP_NAME, still: true,
    lage: { x: window.screenX + 60, y: window.screenY + 60 } });
}
