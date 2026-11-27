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
import { pruefmittelAlleLaden, pruefmittelFuer, tolVon } from "../daten/pruefbericht.js";

const LEHRE = /lehr|dorn|ring|rachen|gewinde|kaliber/i;
const zahlen = (t) => (String(t || "").match(/\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(",", ".")));

const STIFT = /prüfstift|pruefstift|\bstifte?\b/i;
const istStift = (p) => p.art === "pruefstift" || STIFT.test((p.typ || "") + " " + (p.bezeichnung || ""));
let vorrat = null;
// Einmal je Sitzung; ein leeres Ergebnis (z. B. Netz weg) wird beim nächsten Öffnen neu geholt
const laden = () => (vorrat = vorrat || pruefmittelAlleLaden().then((l) => { if (!l || !l.length) vorrat = null; return l || []; }, () => { vorrat = null; return []; }));

export const pmText = (p) => [p.bezeichnung || p.typ || "", p.nennmass || p.mass || ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
const zeile = (p) => (p.nr ? p.nr + " · " : "") + pmText(p) + (p.status === "gesperrt" ? " (gesperrt)" : p.status === "weg" ? " (ausgeschieden)" : "");
const passt = (p, s) => !s || s.toLowerCase().split(/\s+/).every((w) => ((p.nr || "") + " " + pmText(p) + " " + (p.hoco || "")).toLowerCase().includes(w));

// Passende Mittel nach Name im Feld (z. B. Hinweis „Grenzlehrdorn“) und Mass, ähnlich gesucht
// (Patrick 27. November 2026: „wenn Grenzlehrdorn als Hinweis drin ist, soll mit dem Mass
// zusammen das richtige Prüfmittel aus der Verwaltung herausgesucht werden“)
function vorschlaege(liste, z, hoco) {
  if (!liste) return [];
  const t = tolVon(z);
  const mass = t && t.min !== null && t.max !== Infinity ? t.min + " / " + t.max : "";
  try {
    return pruefmittelFuer({ name: z.pm_art === "pruefmittel" ? "" : z.pm || "Lehre", soll: z.soll, mass },
      liste.map((p) => ({ ...p, status: "aktiv" })), hoco).map((p) => p.id);
  } catch (_) { return []; }
}
const LEHRE_NAME = /lehr|dorn|ring|rachen|kaliber/i;

function Wahl({ z, hoco, fertig }) {
  const lehreHinweis = !z.pm_id && z.pm && LEHRE_NAME.test(z.pm) && !STIFT.test(z.pm);
  const [art, setArt] = useState(lehreHinweis ? "pruefmittel" : z.pm_art || (z.pm && STIFT.test(z.pm) ? "stift" : z.pm_id ? "pruefmittel" : z.pm ? "hinweis" : "pruefmittel"));
  const [hinweis, setHinweis] = useState(z.pm_art === "hinweis" || !z.pm_art ? z.pm || "" : "");
  const [liste, setListe] = useState(null);
  const [suche, setSuche] = useState("");
  const [id, setId] = useState(z.pm_id || null);
  const [ids, setIds] = useState(new Set(z.pm_ids || []));
  useEffect(() => { let weg = false; laden().then((l) => {
    if (weg) return;
    setListe(l);
    // Steht nur „Grenzlehrdorn“ o. ä. als Text da, das passende Mittel gleich vorwählen
    if (lehreHinweis) { const v = vorschlaege(l, z, hoco)[0]; if (v) setId(v); }
  }); return () => { weg = true; }; }, []);
  // Vorschläge: was nach Soll und HOCO Nr. passt, steht zuoberst
  const mittel = useMemo(() => {
    if (!liste) return [];
    // alle aus der Verwaltung, auch Prüfstifte (Patrick 27. November 2026: „kann immer noch
    // nicht alle Sachen von der Verwaltung auswählen“); vorher nur 80 und ohne Stifte
    const alle = liste;
    let vor = [];
    vor = vorschlaege(liste, z, hoco);
    // Vorschläge nach dem Soll (Patrick 27. November 2026: „warum keine Grenzlehrdorne oder
    // sonstiges vorgeschlagen“): Lehren, deren Masse die Grenzen oder das Nennmass treffen,
    // stehen zuoberst, danach die übrigen Lehren, erst dann Messmittel.
    const t = tolVon(z);
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
      if (p.status === "weg") w -= 100;
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
    if (art === "hinweis") return fertig({ pm: hinweis.trim(), pm_art: hinweis.trim() ? "hinweis" : null, pm_id: null, pm_ids: null, pm_nr: null });
    if (art === "pruefmittel") {
      const p = (liste || []).find((x) => x.id === id);
      return fertig(p ? { pm: pmText(p), pm_art: "pruefmittel", pm_id: p.id, pm_ids: null, pm_nr: p.nr || null } : null);
    }
    const g = (liste || []).filter((x) => ids.has(x.id));
    if (!g.length) return fertig(null);
    const masse = g.map((p) => p.nennmass || p.mass || p.nr || "").filter(Boolean);
    return fertig({ pm: "Prüfstift " + masse.join(" / "), pm_art: "stift", pm_id: null, pm_ids: g.map((p) => p.id), pm_nr: g.map((p) => p.nr).filter(Boolean).join(", ") || null });
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
              : art === "pruefmittel" ? (mittel.length ? mittel.map((p) => (
                <label key={p.id} className={"pmw-zeile" + (p.id === id ? " pmw-zeile--an" : "")}>
                  <input type="radio" name="pmw" checked={p.id === id} onChange={() => setId(p.id)} data-pmwid={p.nr || p.id} />
                  <span>{zeile(p)}</span>{p._vorschlag ? <small className="pmw-vorschlag">passt</small> : null}</label>)) : <p className="klein">Nichts gefunden.</p>)
              : (stifte.length ? stifte.map((p) => (
                <label key={p.id} className={"pmw-zeile" + (ids.has(p.id) ? " pmw-zeile--an" : "")}>
                  <input type="checkbox" checked={ids.has(p.id)} onChange={() => umschalten(p.id)} data-pmwstift={p.nr || p.id} />
                  <span>{zeile(p)}</span></label>)) : <p className="klein">Keine Prüfstifte gefunden.</p>)}
          </div>
          {liste ? <p className="klein">{(art === "stift" ? stifte : mittel).length} von {liste.length} aus der Prüfmittelverwaltung</p> : null}
          {art === "stift" && ids.size ? <p className="klein">{ids.size} Prüfstift{ids.size > 1 ? "e" : ""} gewählt</p> : null}
        </>
      )}
      <div className="dialog__knoepfe">
        <button type="button" className="knopf knopf--still" data-nein="" onClick={() => fertig(null)}>Abbrechen</button>
        {z.pm ? <button type="button" className="knopf" data-pmwleer="" onClick={() => fertig({ pm: "", pm_art: null, pm_id: null, pm_ids: null, pm_nr: null })}>Leeren</button> : null}
        <button type="button" className="knopf knopf--haupt" data-pmwok="" disabled={!kannUebernehmen} onClick={uebernehmen}>Übernehmen</button>
      </div>
    </div>
  );
}

// Automatisch wählen (Patrick 27. November 2026: „es soll den Grenzlehrdorn gleich automatisch
// auswählen, wenn es nicht passt, wird es manuell eingetragen“): Zeilen mit einer Lehre als
// Text, aber ohne gewähltes Mittel, bekommen das erste passende aktive Mittel der Verwaltung.
// Gibt [{ id, felder }] zurück.
export async function pmAutomatisch(zeilen, hoco) {
  const offen = (zeilen || []).filter((z) => z && !("abschnitt" in z) && !z.pm_id && z.pm && LEHRE_NAME.test(z.pm) && !STIFT.test(z.pm));
  if (!offen.length) return [];
  const liste = (await laden()).filter((p) => (p.status || "aktiv") === "aktiv" && !istStift(p));
  const aus = [];
  for (const z of offen) {
    const t = tolVon(z);
    const mass = t && t.min !== null && t.max !== Infinity ? t.min + " / " + t.max : "";
    let p = null;
    try { p = pruefmittelFuer({ name: z.pm, soll: z.soll, mass }, liste, hoco)[0]; } catch (_) { /* keins */ }
    if (p) aus.push({ id: z.id, felder: { pm: pmText(p), pm_art: "pruefmittel", pm_id: p.id, pm_ids: null, pm_nr: p.nr || null } });
  }
  return aus;
}

// Öffnet das Fenster; gibt die neuen Felder zurück oder null bei Abbruch
export function pmWaehlen(z, hoco) {
  return wertFenster(null, (fertig) => <Wahl z={z} hoco={hoco} fertig={fertig} />);
}
