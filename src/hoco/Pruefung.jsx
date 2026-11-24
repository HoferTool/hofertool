// =================================================================
//  PRÜFUNG IN DEN STAMMDATEN EINER HOCO NR. (seit 1.779.0, Wunsch Patrick
//  24. November 2026: „was wo gemacht werden muss, wird bei Stammdaten
//  definiert“, „Excel hochladen nur per Stammdaten, neue sollen dort
//  gleich ausgefüllt werden“).
//  Welche Prüfungen nötig sind (Erstteil, Endkontrolle, AQL, LL), die
//  AQL-Vorgabe und die Masse mit Soll und Prüfmittel. Ein Excel-Prüfbericht
//  füllt die Masse nur einmal (im Gerät gelesen, nicht abgelegt), danach
//  gilt, was hier steht. Gespeichert in pruef_stamm (sql/pruef-stamm.sql).
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import {
  ARTEN, AQL_WERTE, stammMitMassen, stammSpeichern, excelMasse, zeilenId, toleranz, toleranzText, fehltTabelle, lehrenAus,
} from "../daten/pruefbericht.js";

const KOPF = [["bezeichnung", "Artikel"], ["zeichnung", "Zeichnung"], ["index", "Index"], ["alltol", "Allg. Toleranz"]];

export default function Pruefung({ hoco, darf }) {
  const [st, setSt] = useState(null);      // gespeicherter bzw. geladener Stand
  const [w, setW] = useState(null);        // Arbeitsstand
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const datei = useRef(null);
  const schreibt = darf && alt.darfSchreiben() && !alt.istExtern();

  const laden = () => stammMitMassen(hoco).then((s) => {
    const x = s || { hoco_nr: hoco, arten: [], aql: null, niveau: null, zeilen: [], kopf: {}, aus: "neu" };
    setSt(x); setW({ arten: x.arten || [], aql: x.aql ?? "", niveau: x.niveau || "", zeilen: x.zeilen || [], kopf: x.kopf || {} });
    setFehler("");
  }, (f) => setFehler(fehltTabelle(f) ? "Die Datenbank kennt die Prüfung noch nicht (sql/pruef-stamm.sql fehlt)." : alt.fehlertext(f)));
  useEffect(() => { laden(); }, [hoco]);

  if (alt.istExtern()) return null;
  if (fehler) return <section className="karte hocoteil__karte"><div className="karte__kopf"><h2>Prüfung</h2></div><p className="hinweis">{fehler}</p></section>;
  if (!w) return <section className="karte hocoteil__karte"><div className="karte__kopf"><h2>Prüfung</h2></div><p className="klein">Wird geladen …</p></section>;

  const geaendert = JSON.stringify(w) !== JSON.stringify({ arten: st.arten || [], aql: st.aql ?? "", niveau: st.niveau || "", zeilen: st.zeilen || [], kopf: st.kopf || {} })
    || st.aus === "excel";
  const artUm = (id) => setW((x) => ({ ...x, arten: x.arten.includes(id) ? x.arten.filter((a) => a !== id) : ARTEN.map((a) => a.id).filter((a) => a === id || x.arten.includes(a)) }));
  const zeileSetzen = (id, n, v) => setW((x) => ({ ...x, zeilen: x.zeilen.map((z) => (z.id === id ? { ...z, [n]: v } : z)) }));
  const zeileWeg = (id) => setW((x) => ({ ...x, zeilen: x.zeilen.filter((z) => z.id !== id) }));
  const zeileDazu = (abschnitt) => setW((x) => {
    const nrn = x.zeilen.map((z) => parseInt(z.nr, 10)).filter((v) => !isNaN(v));
    const z = abschnitt ? { abschnitt: "Neuer Abschnitt" } : { nr: String((nrn.length ? Math.max(...nrn) : 0) + 1), soll: "", pm: "" };
    return { ...x, zeilen: [...x.zeilen, { ...z, id: zeilenId(x.zeilen, z) }] };
  });
  const schieben = (i, d) => setW((x) => {
    const z = [...x.zeilen]; const j = i + d;
    if (j < 0 || j >= z.length) return x;
    [z[i], z[j]] = [z[j], z[i]];
    return { ...x, zeilen: z };
  });

  const excelEinlesen = async (liste) => {
    if (!liste.length) return;
    if (w.zeilen.length) {
      const ok = await alt.nachfragen({ titel: "Masse ersetzen?", text: "Die " + w.zeilen.length + " Zeilen hier werden durch die Masse aus dem Excel ersetzt.", bestaetigen: "Ersetzen" });
      if (!ok) return;
    }
    setLaeuft(true);
    try {
      const v = await excelMasse(liste);
      if (!v.zeilen.length) { alt.meldung("Im Excel keine Masse gefunden (Zeile „Nr. | Soll“ fehlt).", "warn"); return; }
      setW((x) => ({ ...x, zeilen: v.zeilen, kopf: { ...v.kopf, ...Object.fromEntries(Object.entries(x.kopf).filter(([, y]) => y)) } }));
      alt.meldung(v.zeilen.filter((z) => !z.abschnitt).length + " Masse eingelesen. Bitte prüfen und speichern.", "gut");
    } catch (f) { alt.meldung("Excel nicht lesbar: " + alt.fehlertext(f), "fehler"); }
    finally { setLaeuft(false); }
  };

  const speichern = async () => {
    setLaeuft(true);
    try {
      const felder = { arten: w.arten, aql: w.aql === "" ? null : Number(w.aql), niveau: w.niveau || null, zeilen: w.zeilen, kopf: w.kopf };
      await stammSpeichern(hoco, felder);
      alt.meldung("Prüfung gespeichert", "gut");
      setSt({ ...st, ...felder, aus: "stamm" });
      setW({ ...w, aql: felder.aql ?? "", niveau: felder.niveau || "" });
    } catch (f) { alt.meldung(fehltTabelle(f) ? "sql/pruef-stamm.sql fehlt noch." : alt.fehlertext(f), "fehler"); }
    finally { setLaeuft(false); }
  };

  const lehren = lehrenAus({ zeilen: w.zeilen });
  return (
    <section className="karte hocoteil__karte pst" id="pst">
      <div className="karte__kopf"><h2>Prüfung</h2>
        <span className="klein">{w.zeilen.filter((z) => !z.abschnitt).length} Masse · gilt für die Prüfprotokolle unter Qualitätssicherung</span></div>

      <div className="pst-arten">
        <b>Nötig bei jedem Auftrag:</b>
        {ARTEN.map((a) => (
          <label key={a.id} className={"pb-wahl" + (w.arten.includes(a.id) ? " pb-wahl--an" : "")} data-pstart={a.id}>
            <input type="checkbox" checked={w.arten.includes(a.id)} disabled={!schreibt} onChange={() => artUm(a.id)} /> {a.name}
          </label>
        ))}
      </div>
      {w.arten.includes("aql") ? (
        <div className="pst-zeile">
          <label>AQL<select value={String(w.aql === "" ? "" : w.aql)} disabled={!schreibt} onChange={(e) => setW({ ...w, aql: e.target.value === "" ? "" : Number(e.target.value) })}>
            <option value="">1.0 (Vorgabe)</option>{AQL_WERTE.map((a) => <option key={a} value={String(a)}>{a}</option>)}</select></label>
          <label>Prüfniveau<select value={w.niveau} disabled={!schreibt} onChange={(e) => setW({ ...w, niveau: e.target.value })}>
            <option value="">II (Vorgabe)</option><option>I</option><option>II</option><option>III</option></select></label>
        </div>
      ) : null}

      <div className="pst-zeile">
        {KOPF.map(([n, t]) => (
          <label key={n}>{t}<input value={w.kopf[n] || ""} disabled={!schreibt} onChange={(e) => setW({ ...w, kopf: { ...w.kopf, [n]: e.target.value } })} /></label>
        ))}
      </div>

      {st.aus === "excel" ? <p className="hinweis">Diese Masse kommen aus einem früher abgelegten Excel. Bitte prüfen und speichern, danach gilt nur noch, was hier steht.</p> : null}
      {!w.zeilen.length ? <p className="hinweis">Noch keine Masse. Trage sie unten ein oder lies einen Excel-Prüfbericht ein.</p> : (
        <div className="pst-huelle">
          <table className="tabelle pst-tabelle" id="pst-masse">
            <thead><tr><th>Nr.</th><th>Soll</th><th>Toleranz</th><th>Prüfmittel</th><th title="Kommt auf die Langläufer-Liste">LL</th><th /></tr></thead>
            <tbody>
              {w.zeilen.map((z, i) => z.abschnitt ? (
                <tr key={z.id} className="pst-abschnitt">
                  <td colSpan={5}><input value={z.abschnitt} disabled={!schreibt} onChange={(e) => zeileSetzen(z.id, "abschnitt", e.target.value)} /></td>
                  <td className="nowrap">{schreibt ? <Knoepfe i={i} schieben={schieben} weg={() => zeileWeg(z.id)} /> : null}</td>
                </tr>
              ) : (
                <tr key={z.id} data-pstzeile={z.id}>
                  <td><input className="pst-nr" value={z.nr || ""} disabled={!schreibt} onChange={(e) => zeileSetzen(z.id, "nr", e.target.value)} /></td>
                  <td><input className="pst-soll" value={z.soll || ""} disabled={!schreibt} placeholder="z.B. Ø 6.00 ±0.02" onChange={(e) => zeileSetzen(z.id, "soll", e.target.value)} /></td>
                  <td className="klein nowrap">{(() => { const t = toleranz(z.soll); return t ? toleranzText(t) : "—"; })()}</td>
                  <td><input value={z.pm || ""} disabled={!schreibt} onChange={(e) => zeileSetzen(z.id, "pm", e.target.value)} /></td>
                  <td><input type="checkbox" checked={!!z.ll} disabled={!schreibt} onChange={() => zeileSetzen(z.id, "ll", !z.ll)} /></td>
                  <td className="nowrap">{schreibt ? <Knoepfe i={i} schieben={schieben} weg={() => zeileWeg(z.id)} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lehren.lehren.length ? <p className="klein">Benötigte Lehren: {lehren.lehren.map((l) => l.name + " " + l.mass).join(" · ")}</p> : null}

      {schreibt ? (
        <div className="pst-knoepfe">
          <button type="button" className="knopf knopf--klein" id="pst-mass-neu" onClick={() => zeileDazu(false)}>+ Mass</button>
          <button type="button" className="knopf knopf--klein" onClick={() => zeileDazu(true)}>+ Abschnitt</button>
          <button type="button" className="knopf knopf--klein" id="pst-excel" disabled={laeuft} onClick={() => datei.current && datei.current.click()}>📥 Excel-Prüfbericht einlesen</button>
          <input ref={datei} type="file" multiple accept=".xlsx,.xlsm,.xls" hidden id="pst-excel-datei" data-ablegen="direkt"
            onChange={(e) => { const l = [...e.target.files]; e.target.value = ""; excelEinlesen(l); }} />
          <span className="pst-platz" />
          {geaendert ? <span className="klein pb-rot">Noch nicht gespeichert</span> : null}
          <button type="button" className="knopf knopf--haupt" id="pst-speichern" disabled={laeuft || !geaendert} onClick={speichern}>Speichern</button>
        </div>
      ) : null}
    </section>
  );
}

function Knoepfe({ i, schieben, weg }) {
  return <>
    <button type="button" className="knopf knopf--klein" title="Nach oben" onClick={() => schieben(i, -1)}>↑</button>
    <button type="button" className="knopf knopf--klein" title="Nach unten" onClick={() => schieben(i, 1)}>↓</button>
    <button type="button" className="knopf knopf--klein knopf--gefahr-leise" title="Zeile löschen" data-pstweg="" onClick={weg}>✕</button>
  </>;
}
