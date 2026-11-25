// =================================================================
//  LAGER: STAMMDATEN (seit 1.791.0)
//  Externe Arbeitsschritte (welche Firma, wie lange es normalerweise
//  dauert, wie viele Arbeitstage vorher sie Bescheid braucht) und je
//  HOCO Nr. der Ablauf: welche externen Schritte die Teile nach der
//  Produktion der Reihe nach durchlaufen.
// =================================================================
import { useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";

const zahlOderNull = (t) => {
  const n = parseInt(String(t || "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

export async function externBearbeiten(x, neu) {
  const w = await alt.dialogFelder({
    titel: x ? "Externer Arbeitsschritt" : "Neuer externer Arbeitsschritt",
    felder: [
      { name: "schritt", label: "Arbeitsschritt", wert: x ? x.schritt : "", pflicht: true, platzhalter: "z.B. Härten, Vernickeln, Gleitschleifen" },
      { name: "firma", label: "Firma", wert: x ? x.firma : "" },
      { name: "dauer", label: "Dauer normalerweise (Arbeitstage)", wert: x && x.dauer_tage != null ? String(x.dauer_tage) : "", ziffern: true },
      { name: "vorlauf", label: "Vorher informieren (Arbeitstage)", wert: x && x.vorlauf_tage != null ? String(x.vorlauf_tage) : "", ziffern: true,
        hinweis: "Leer = die Firma braucht keine Ankündigung. Sonst erscheint der Auftrag unter „Vorbereiten“." },
      { name: "kontakt", label: "Kontakt (Mail, Telefon)", wert: x ? x.kontakt : "" },
      { name: "notiz", label: "Notiz", wert: x ? x.notiz : "", typ: "textarea" },
    ],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  const daten = { schritt: w.schritt, firma: w.firma || null, dauer_tage: zahlOderNull(w.dauer), vorlauf_tage: zahlOderNull(w.vorlauf),
    kontakt: w.kontakt || null, notiz: w.notiz || null, geaendert_am: new Date().toISOString() };
  if (x) {
    const vorher = await alt.rueckSichern("lager_extern", { id: x.id });
    const r = await alt.db.from("lager_extern").update(daten).eq("id", x.id);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    if (vorher.length) alt.merkeSchritt("Arbeitsschritt ändern", alt.rueckRein("lager_extern", vorher));
  } else {
    const r = await alt.db.from("lager_extern").insert(daten).select("id").single();
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    alt.merkeSchritt("Arbeitsschritt anlegen", alt.rueckWeg("lager_extern", { id: r.data.id }));
  }
  alt.meldung("Gespeichert.", "gut");
  neu();
}

async function externLoeschen(x, neu) {
  const ok = await alt.nachfragen({ titel: "Arbeitsschritt löschen",
    text: x.schritt + (x.firma ? " bei " + x.firma : "") + " löschen? In den Abläufen fällt er weg.", bestaetigen: "Löschen", gefahr: true });
  if (!ok) return;
  const vorher = await alt.rueckSichern("lager_extern", { id: x.id });
  const r = await alt.db.from("lager_extern").delete().eq("id", x.id);
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  if (vorher.length) alt.merkeSchritt("Arbeitsschritt löschen", alt.rueckRein("lager_extern", vorher));
  neu();
}

export function ablaufOeffnen(hoco, daten, neu) {
  fensterOeffnen((zu) => <AblaufFenster hoco={hoco} daten={daten} zu={zu} neu={neu} />, null, "lager-huelle");
}

async function neuerAblauf(daten, neu) {
  const w = await alt.dialogFelder({ titel: "Ablauf für HOCO Nr.", felder: [
    { name: "hoco", label: "HOCO Nr.", pflicht: true, platzhalter: "z.B. 10841-0009" }], bestaetigen: "Weiter" });
  if (w) ablaufOeffnen(w.hoco.trim(), daten, neu);
}

function AblaufFenster({ hoco, daten, zu, neu }) {
  const a = daten.ablaeufe.get(hoco);
  const [schritte, setSchritte] = useState(() => (a ? a.schritte || [] : []).filter((id) => daten.extern.has(id)));
  const [notiz, setNotiz] = useState(a ? a.notiz || "" : "");
  const [wahl, setWahl] = useState("");
  const liste = [...daten.extern.values()];
  const schieben = (i, d) => setSchritte((s) => {
    const n = s.slice(); const j = i + d;
    if (j < 0 || j >= n.length) return s;
    [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  async function speichern() {
    const vorher = await alt.rueckSichern("lager_ablauf", { hoco_nr: hoco });
    const r = await alt.db.from("lager_ablauf").upsert({ hoco_nr: hoco, schritte, notiz: notiz.trim() || null, geaendert_am: new Date().toISOString() }, { onConflict: "hoco_nr" });
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    alt.merkeSchritt("Ablauf " + hoco, vorher.length ? alt.rueckRein("lager_ablauf", vorher) : alt.rueckWeg("lager_ablauf", { hoco_nr: hoco }));
    alt.meldung("Ablauf gespeichert.", "gut");
    zu(); neu();
  }
  async function loeschen() {
    const vorher = await alt.rueckSichern("lager_ablauf", { hoco_nr: hoco });
    const r = await alt.db.from("lager_ablauf").delete().eq("hoco_nr", hoco);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    if (vorher.length) alt.merkeSchritt("Ablauf " + hoco + " löschen", alt.rueckRein("lager_ablauf", vorher));
    zu(); neu();
  }

  return (
    <div className="dialog lager-dialog" role="dialog" aria-modal="true" data-lager-ablauf={hoco}>
      <h2>Ablauf {hoco}</h2>
      <p className="klein">{daten.bezeichnung.get(hoco) || ""}{daten.index.get(hoco) ? " · Index " + daten.index.get(hoco) : ""}</p>
      <ol className="lager-ablauf">
        <li className="lager-ablauf__fest">Produktion</li>
        {schritte.map((id, i) => {
          const x = daten.extern.get(id);
          return (
            <li key={id + i} data-schritt={id}>
              <b>{x.schritt}</b>{x.firma ? " · " + x.firma : ""}{x.dauer_tage ? " · ca. " + x.dauer_tage + " AT" : ""}
              {x.vorlauf_tage ? <span className="lager-schild">{x.vorlauf_tage} AT vorher informieren</span> : null}
              <span className="lager-ablauf__knoepfe">
                <button className="knopf knopf--klein" title="nach oben" onClick={() => schieben(i, -1)}>↑</button>
                <button className="knopf knopf--klein" title="nach unten" onClick={() => schieben(i, 1)}>↓</button>
                <button className="knopf knopf--klein knopf--gefahr" title="entfernen"
                  onClick={() => setSchritte((s) => s.filter((_, k) => k !== i))}>✕</button>
              </span>
            </li>);
        })}
        <li className="lager-ablauf__fest">Fertigteil, Auslieferung</li>
      </ol>
      {liste.length
        ? <div className="lager-zwei">
            <select id="la-wahl" value={wahl} onChange={(e) => setWahl(e.target.value)}>
              <option value="">— externen Schritt wählen —</option>
              {liste.map((x) => <option key={x.id} value={x.id}>{x.schritt + (x.firma ? " · " + x.firma : "")}</option>)}
            </select>
            <button className="knopf" id="la-dazu" disabled={!wahl}
              onClick={() => { setSchritte((s) => s.concat(wahl)); setWahl(""); }}>+ Schritt dazu</button>
          </div>
        : <p className="feldhinweis">Zuerst unter „Externe Arbeitsschritte“ einen Schritt anlegen.</p>}
      <label className="feld"><span>Notiz zum Ablauf</span>
        <textarea rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} /></label>
      <div className="dialog__knoepfe">
        {a && <button className="knopf knopf--still knopf--gefahr" onClick={loeschen}>Ablauf löschen</button>}
        <button className="knopf knopf--still" data-nein="" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" data-ja="" onClick={speichern}>Speichern</button>
      </div>
    </div>
  );
}

export function ablaufText(daten, hoco) {
  const a = daten.ablaeufe.get(hoco);
  const s = (a ? a.schritte || [] : []).map((id) => daten.extern.get(id)).filter(Boolean);
  return ["Produktion"].concat(s.map((x) => x.schritt + (x.firma ? " (" + x.firma + ")" : ""))).concat("Fertigteil").join(" → ");
}

export default function Stammdaten({ daten, neu, passt }) {
  const extern = [...daten.extern.values()];
  const ablaeufe = [...daten.ablaeufe.values()].filter((a) => passt(a.hoco_nr + " " + (daten.bezeichnung.get(a.hoco_nr) || "") + " " + ablaufText(daten, a.hoco_nr)))
    .sort((a, b) => a.hoco_nr.localeCompare(b.hoco_nr));
  return (
    <>
      <section className="karte lager-karte">
        <div className="lager-karte__kopf">
          <h2>Externe Arbeitsschritte</h2>
          <button className="knopf knopf--haupt knopf--klein" id="lager-ext-neu" onClick={() => externBearbeiten(null, neu)}>+ Arbeitsschritt</button>
        </div>
        {!extern.length
          ? <p className="klein">Noch keine. Zum Beispiel „Härten“ bei der Firma, die das macht, mit der üblichen Dauer.</p>
          : <div className="lager-tabelle">
              <div className="lager-reihe lager-reihe--kopf klein"><span>Arbeitsschritt</span><span>Firma</span><span>Dauer</span><span>Ankündigung</span><span>Kontakt</span><span /></div>
              {extern.map((x) => (
                <div key={x.id} className="lager-reihe" data-ext={x.id}>
                  <b>{x.schritt}</b><span>{x.firma || "–"}</span>
                  <span>{x.dauer_tage ? "ca. " + x.dauer_tage + " AT" : "–"}</span>
                  <span>{x.vorlauf_tage ? x.vorlauf_tage + " AT vorher" : "keine"}</span>
                  <span className="klein">{x.kontakt || ""}</span>
                  <span className="lager-ablauf__knoepfe">
                    <button className="knopf knopf--klein" onClick={() => externBearbeiten(x, neu)}>Ändern</button>
                    <button className="knopf knopf--klein knopf--gefahr" onClick={() => externLoeschen(x, neu)}>Löschen</button>
                  </span>
                </div>))}
            </div>}
      </section>
      <section className="karte lager-karte">
        <div className="lager-karte__kopf">
          <h2>Ablauf je HOCO Nr.</h2>
          <button className="knopf knopf--haupt knopf--klein" id="lager-ablauf-neu" onClick={() => neuerAblauf(daten, neu)}>+ Ablauf</button>
        </div>
        <p className="klein">Was nach der Produktion mit den Teilen passiert. Danach schlägt das Lager beim Ausbuchen den nächsten Schritt vor
          und zeigt unter „Vorbereiten“, wann welche Firma Bescheid braucht. Ohne Ablauf sind Teile aus der Produktion gleich Fertigteile.</p>
        {!ablaeufe.length
          ? <p className="klein">Noch kein Ablauf hinterlegt.</p>
          : ablaeufe.map((a) => (
            <button key={a.hoco_nr} className="lager-reihe lager-reihe--knopf" data-ablauf={a.hoco_nr}
              onClick={() => ablaufOeffnen(a.hoco_nr, daten, neu)}>
              <b>{a.hoco_nr}</b><span>{daten.bezeichnung.get(a.hoco_nr) || ""}</span>
              <span className="lager-kette">{ablaufText(daten, a.hoco_nr)}</span>
            </button>))}
      </section>
    </>
  );
}
