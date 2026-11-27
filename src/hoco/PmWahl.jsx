// =================================================================
//  PRÜFMITTEL/HINWEIS JE MASS (seit 1.897.0, Wunsch Patrick 27. November 2026:
//  „soll prüfmittel/hinweis heissen, und wenn man drauf klickt soll kurz ein
//  Fenster kommen, ob ein Hinweis oder Prüfmittel, und dann soll man das richtige
//  Mittel wählen können, oder bei Prüfstiften sagen, welche gebraucht werden“).
//  Ergebnis: Text in z.pm (für Druck, Checkliste und Ausbuchen wie bisher) und
//  dazu z.pm_art ("hinweis" | "pruefmittel" | "stift"), z.pm_id bzw. z.pm_ids,
//  damit die Checkliste genau das gewählte Mittel findet.
// =================================================================
import { useEffect, useMemo, useState } from "react";
import { wertFenster } from "../teile/Dialoge.jsx";
import { pruefmittelAlleLaden, pruefmittelFuer, toleranz } from "../daten/pruefbericht.js";

const LEHRE = /lehr|dorn|ring|rachen|gewinde|kaliber/i;
const zahlen = (t) => (String(t || "").match(/\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(",", ".")));

const STIFT = /prüfstift|pruefstift|\bstifte?\b/i;
const istStift = (p) => p.art === "pruefstift" || STIFT.test((p.typ || "") + " " + (p.bezeichnung || ""));
let vorrat = null;
const laden = () => (vorrat = vorrat || pruefmittelAlleLaden().then((l) => (l || []).filter((p) => (p.status || "aktiv") !== "weg"), () => []));

export const pmText = (p) => [p.bezeichnung || p.typ || "", p.nennmass || p.mass || ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
const zeile = (p) => (p.nr ? p.nr + " · " : "") + pmText(p) + (p.status === "gesperrt" ? " (gesperrt)" : "");
const passt = (p, s) => !s || s.toLowerCase().split(/\s+/).every((w) => ((p.nr || "") + " " + pmText(p) + " " + (p.hoco || "")).toLowerCase().includes(w));

function Wahl({ z, hoco, fertig }) {
  const [art, setArt] = useState(z.pm_art || (z.pm && STIFT.test(z.pm) ? "stift" : z.pm_id ? "pruefmittel" : z.pm ? "hinweis" : "pruefmittel"));
  const [hinweis, setHinweis] = useState(z.pm_art === "hinweis" || !z.pm_art ? z.pm || "" : "");
  const [liste, setListe] = useState(null);
  const [suche, setSuche] = useState("");
  const [id, setId] = useState(z.pm_id || null);
  const [ids, setIds] = useState(new Set(z.pm_ids || []));
  useEffect(() => { let weg = false; laden().then((l) => { if (!weg) setListe(l); }); return () => { weg = true; }; }, []);
  // Vorschläge: was nach Soll und HOCO Nr. passt, steht zuoberst
  const mittel = useMemo(() => {
    if (!liste) return [];
    const alle = liste.filter((p) => !istStift(p));
    let vor = [];
    try { vor = pruefmittelFuer({ name: z.pm || "Lehre", soll: z.soll, mass: "" }, alle.map((p) => ({ ...p, status: "aktiv" })), hoco).map((p) => p.id); } catch (_) { /* ohne Vorschlag */ }
    // Vorschläge nach dem Soll (Patrick 27. November 2026: „warum keine Grenzlehrdorne oder
    // sonstiges vorgeschlagen“): Lehren, deren Masse die Grenzen oder das Nennmass treffen,
    // stehen zuoberst, danach die übrigen Lehren, erst dann Messmittel.
    const t = toleranz(z.soll);
    const nenn = zahlen(String(z.soll || "").replace(/^\s*Ø\s*/, ""))[0];
    const wert = (p) => {
      if (p.id === id) return 1000;
      let w = vor.includes(p.id) ? 50 : 0;
      const txt = (p.typ || "") + " " + (p.bezeichnung || "");
      const lehre = LEHRE.test(txt);
      const z2 = zahlen((p.nennmass || "") + " " + (p.mass || "") + " " + (p.bezeichnung || ""));
      const nahe = (v, d) => v !== null && v !== undefined && z2.some((x) => Math.abs(x - v) <= d);
      if (t && t.min !== null && nahe(t.min, 0.003)) w += 20;
      if (t && nahe(t.max, 0.003)) w += 20;
      if (nenn !== undefined && nahe(nenn, 0.0005)) w += lehre ? 8 : 2;
      if (lehre) w += 5;
      if (p.status === "gesperrt") w -= 3;
      return w;
    };
    const ws = new Map(alle.map((p) => [p.id, wert(p)]));
    return alle.filter((p) => passt(p, suche)).sort((a, b) => ws.get(b.id) - ws.get(a.id) || String(a.nr || "").localeCompare(String(b.nr || ""), "de", { numeric: true }))
      .map((p) => ({ ...p, _vorschlag: ws.get(p.id) >= 13 }));
  }, [liste, suche, id]);
  const stifte = useMemo(() => (liste || []).filter(istStift).filter((p) => passt(p, suche))
    .sort((a, b) => (ids.has(b.id) - ids.has(a.id)) || String(a.nr || "").localeCompare(String(b.nr || ""), "de", { numeric: true })), [liste, suche]);
  const umschalten = (x) => setIds((s) => { const n = new Set(s); n.has(x) ? n.delete(x) : n.add(x); return n; });

  const uebernehmen = () => {
    if (art === "hinweis") return fertig({ pm: hinweis.trim(), pm_art: hinweis.trim() ? "hinweis" : null, pm_id: null, pm_ids: null });
    if (art === "pruefmittel") {
      const p = (liste || []).find((x) => x.id === id);
      return fertig(p ? { pm: pmText(p), pm_art: "pruefmittel", pm_id: p.id, pm_ids: null } : null);
    }
    const g = (liste || []).filter((x) => ids.has(x.id));
    if (!g.length) return fertig(null);
    const masse = g.map((p) => p.nennmass || p.mass || p.nr || "").filter(Boolean);
    return fertig({ pm: "Prüfstift " + masse.join(" / "), pm_art: "stift", pm_id: null, pm_ids: g.map((p) => p.id) });
  };
  const kannUebernehmen = art === "hinweis" || (art === "pruefmittel" ? !!id : ids.size > 0);
  const tasten = [["pruefmittel", "Prüfmittel"], ["stift", "Prüfstifte"], ["hinweis", "Hinweis"]];
  return (
    <div className="dialog pmw" data-pmwahl="">
      <h2>Prüfmittel/Hinweis{z.nr ? " · Mass " + z.nr : ""}</h2>
      {z.soll ? <p className="dialog__text klein">Soll: {z.soll}</p> : null}
      <div className="pmw-arten">
        {tasten.map(([a, t]) => <button key={a} type="button" data-pmwart={a}
          className={"knopf knopf--klein" + (art === a ? " knopf--haupt" : "")} onClick={() => setArt(a)}>{t}</button>)}
      </div>
      {art === "hinweis" ? (
        <label className="feld">Hinweis (z. B. Messschieber, Sichtprüfung)
          <input autoFocus data-pmwhinweis="" value={hinweis} onChange={(e) => setHinweis(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); uebernehmen(); } }} /></label>
      ) : (
        <>
          <input className="pmw-suche" autoFocus placeholder="Suchen: Nr., Bezeichnung, Mass" value={suche} onChange={(e) => setSuche(e.target.value)} data-pmwsuche="" />
          <div className="pmw-liste">
            {!liste ? <p className="klein">Prüfmittel werden gelesen …</p>
              : art === "pruefmittel" ? (mittel.length ? mittel.slice(0, 80).map((p) => (
                <label key={p.id} className={"pmw-zeile" + (p.id === id ? " pmw-zeile--an" : "")}>
                  <input type="radio" name="pmw" checked={p.id === id} onChange={() => setId(p.id)} data-pmwid={p.nr || p.id} />
                  <span>{zeile(p)}</span>{p._vorschlag ? <small className="pmw-vorschlag">passt</small> : null}</label>)) : <p className="klein">Nichts gefunden.</p>)
              : (stifte.length ? stifte.slice(0, 120).map((p) => (
                <label key={p.id} className={"pmw-zeile" + (ids.has(p.id) ? " pmw-zeile--an" : "")}>
                  <input type="checkbox" checked={ids.has(p.id)} onChange={() => umschalten(p.id)} data-pmwstift={p.nr || p.id} />
                  <span>{zeile(p)}</span></label>)) : <p className="klein">Keine Prüfstifte gefunden.</p>)}
          </div>
          {art === "stift" && ids.size ? <p className="klein">{ids.size} Prüfstift{ids.size > 1 ? "e" : ""} gewählt</p> : null}
        </>
      )}
      <div className="dialog__knoepfe">
        <button type="button" className="knopf knopf--still" data-nein="" onClick={() => fertig(null)}>Abbrechen</button>
        {z.pm ? <button type="button" className="knopf" data-pmwleer="" onClick={() => fertig({ pm: "", pm_art: null, pm_id: null, pm_ids: null })}>Leeren</button> : null}
        <button type="button" className="knopf knopf--haupt" data-pmwok="" disabled={!kannUebernehmen} onClick={uebernehmen}>Übernehmen</button>
      </div>
    </div>
  );
}

// Öffnet das Fenster; gibt die neuen Felder zurück oder null bei Abbruch
export function pmWaehlen(z, hoco) {
  return wertFenster(null, (fertig) => <Wahl z={z} hoco={hoco} fertig={fertig} />);
}
