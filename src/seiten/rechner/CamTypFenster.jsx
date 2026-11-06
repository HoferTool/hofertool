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
import { Reiter } from "../../teile/Reiter.jsx";
import {
  ARTEN, BEDINGUNGEN, BLOCK_FELDER, CONFIG_SCHLUESSEL, PLATZ_GRUPPEN, PLATZHALTER_BLOCK, PLATZHALTER_KOPF,
  TYP, TYP_NAME, mitTyp, typ, typAbweichungen, typMischen, typSetzen, vorgabeTyp, vorlageFehler,
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
    const w = { ...vorgabeWerte(t), nr: "458", hoco: "10841-0009", datum: "06.11.26", kuerzel: "PR", bloecke: [b] };
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

function Vorlage({ wert, vorgabe, setze, block, darf, name }) {
  const fehler = vorlageFehler(wert, block);
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

function Fenster({ zu }) {
  const darf = !!(alt.istAdmin && alt.istAdmin());
  const [t, setT] = useState(() => kopie(typ()));
  const v = useMemo(() => vorgabeTyp(), []);
  const [reiter, setReiter] = useState("kopf");
  const [kopfTeil, setKopfTeil] = useState("k1kopf");
  const [art, setArt] = useState("dreh");
  const [speichert, setSpeichert] = useState(false);
  const aendern = (f) => setT((x) => { const n = kopie(x); f(n); return n; });
  const vorlage = (k, text) => aendern((n) => { n.vorlagen[k] = text; });

  const prog = useMemo(() => beispiel(t, art), [t, art]);
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
  const vorschau = reiter === "bearb"
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
        reiter={[["kopf", "Kopf und Ende"], ["bearb", "Bearbeitungen"], ["werte", "Plätze, Vorgaben, Marken"]]} />
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
              setze={(x) => vorlage(kopfTeil, x)} darf={darf} />
            <p className="klein">„(Ende Kopf)“ und „(Start Ende)“ bitte stehen lassen: dazwischen kommen die Bearbeitungen.</p>
            <Hilfe titel="Platzhalter für Kopf und Ende" liste={PLATZHALTER_KOPF.map(([n, x]) => ["{" + n + "}", x])} />
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
                  setze={(x) => vorlage(art + "." + k, x)} block darf={darf} />
              ))}
            </div>
            <p className="klein">Eine Programmzeile je Zeile. <code>[hd] …</code> steht nur, wenn die Bedingung gilt,
              <code>[!hd] …</code> nur, wenn nicht. <code>{"{CODE}"}</code> allein auf einer Zeile setzt den NC-Code
              der Bearbeitung ein, <code>{"/{CODE}"}</code> mit „/“ vor jeder Zeile. Leere Zeilen fallen weg.</p>
            <Hilfe titel="Platzhalter der Bearbeitung" liste={PLATZHALTER_BLOCK.map(([n, x]) => ["{" + n + "}", x])} />
            <Hilfe titel="Bedingungen" liste={BEDINGUNGEN.map(([n, x]) => ["[" + n + "]", x])} />
          </>}
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
          <b>Vorschau {reiter === "bearb" ? "dieser Bearbeitung" : "(Beispiel mit einer Bearbeitung)"}</b>
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
        {darf && <button className="knopf knopf--primaer" id="camtyp-speichern" disabled={speichert || !geaendert} onClick={speichern}>
          {speichert ? "Speichert …" : "Speichern"}</button>}
      </div>
    </div>
  );
}

export function camTypFensterOeffnen() {
  if (document.getElementById("camtyp")) return;
  fensterOeffnen((zu) => <Fenster zu={zu} />, null, "camtyp-huelle");
}
