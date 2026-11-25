// =================================================================
//  SEITE LAGER (seit 1.791.0, Wunsch Patrick 24. November 2026:
//  „einbuchen aus Produktion, von externen Arbeitsschritten oder von
//  Kundenrückgaben, ausbuchen wegen externer Arbeitsschritte und
//  Auslieferung, Arten von Teilen (Halbfabrikat, Fertigteil),
//  jede HOCO Nr. nach Index, … externe Arbeitsschritte hinterlegen,
//  welche Firma und wie lange es normalerweise dauert, … in Stammdaten
//  angeben, was mit dem Artikel passiert, und je nachdem wird es
//  vorbereitet, weil gewisse Firmen eine Info brauchen“).
//  1.557.0 bis 1.700.x gab es ein einfaches Lager, 1.701.0 entfernt.
//  Daten: lager_buchungen, lager_extern, lager_ablauf, lager_avis
//  (sql/lager-teile.sql, sql/lager-logik.sql). Nur Admins, nie Externe.
//  Rechnung in lager/logik.js, Fenster in lager/Buchen.jsx und
//  lager/Stammdaten.jsx.
// =================================================================
import { useState } from "react";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import { useSeitenSuche, hinzeigen } from "../teile/seitenSuche.js";
import {
  bestandRechnen, linienMitBestand, externOffen, vorbereitenListe, avisText, artText, grundText,
  stufeText, naechsterSchritt, heute,
  tagText,
} from "./lager/logik.js";
import { buchenOeffnen, linieText } from "./lager/Buchen.jsx";
import Stammdaten, { ablaufOeffnen, ablaufText } from "./lager/Stammdaten.jsx";

const gemerkt = { suche: "", reiter: "bestand", offen: null };
const TAGE_ZURUECK = 90;

const fehltTabelle = (e) => /lager_|relation|schema cache|column/i.test(String((e && e.message) || ""));

async function laden() {
  const q = (t, ms) => alt.zeitlimit(t, ms || 15000, "Lager");
  const ab = new Date(Date.now() - TAGE_ZURUECK * 864e5).toISOString();
  const [rb, rx, ra, rv, rj, rp] = await Promise.all([
    q(alt.db.from("lager_buchungen").select("*").order("erstellt_am", { ascending: false })),
    q(alt.db.from("lager_extern").select("*").order("schritt")),
    q(alt.db.from("lager_ablauf").select("*")),
    q(alt.db.from("lager_avis").select("*")),
    q(alt.db.from("planwand").select("id, job_number, fa_nr, maschine, maschine_nr, plan_status, ended_at, target_quantity, stand, started_at, planned_from, planned_days, planned_to")
      .or("ended_at.is.null,ended_at.gte." + ab)).then((x) => x, () => ({ data: [] })),
    q(alt.db.from("profiles").select("id, full_name, email"), 8000).then((x) => x, () => ({ data: [] })),
  ]);
  for (const r of [rb, rx, ra, rv]) {
    if (r.error) { if (fehltTabelle(r.error)) return { fehlt: true }; throw r.error; }
  }
  const buchungen = rb.data || [];
  const ablaeufe = new Map((ra.data || []).map((a) => [a.hoco_nr, a]));
  const auftraege = (rj.data || []).filter((j) => j.job_number);
  const nummern = [...new Set(buchungen.map((b) => b.hoco_nr).concat([...ablaeufe.keys()], auftraege.map((j) => j.job_number)))];
  const teile = [];
  for (let i = 0; i < nummern.length; i += 300) {
    const r = await q(alt.db.from("hoco_parts").select("hoco_nr, bezeichnung, index_nr").in("hoco_nr", nummern.slice(i, i + 300)), 10000)
      .then((x) => x, () => ({ data: [] }));
    teile.push(...(r.data || []));
  }
  return {
    buchungen, ablaeufe, auftraege,
    extern: new Map((rx.data || []).map((x) => [x.id, x])),
    avis: new Map((rv.data || []).map((v) => [v.job_id + "|" + v.ext_id, v])),
    bezeichnung: new Map(teile.map((t) => [t.hoco_nr, t.bezeichnung || ""])),
    index: new Map(teile.map((t) => [t.hoco_nr, (t.index_nr || "").trim()])),
    personen: new Map((rp.data || []).map((u) => [u.id, alt.personName(u)])),
  };
}

// Kurz je HOCO Nr.: „Index B: 500 fertigteil, 200 halbfabrikat · Index A: 20 fertigteil“
function kurzBestand(e) {
  const je = new Map();
  linienMitBestand(e).forEach((l) => {
    const k = l.index_nr || "";
    const m = je.get(k) || new Map();
    m.set(l.art, (m.get(l.art) || 0) + l.menge);
    je.set(k, m);
  });
  return [...je.entries()].map(([i, m]) => (i ? "Index " + i : "ohne Index") + ": "
    + [...m.entries()].map(([a, n]) => alt.zahlText(n) + " " + artText(a).toLowerCase()).join(", ")).join(" · ");
}

export default function Lager({ auffrischen }) {
  const [suche, setSuche] = useState(gemerkt.suche);
  const [reiter, setReiter] = useState(gemerkt.reiter);
  const [offen, setOffen] = useState(gemerkt.offen);
  useGemerkt(gemerkt, { suche, reiter, offen });
  const { daten, fehler, neu } = useDaten(laden, [auffrischen]);
  const bereit = daten && !daten.fehlt;
  const bestand = bereit ? bestandRechnen(daten.buchungen) : [];
  const unterwegs = bereit ? externOffen(daten.buchungen) : [];
  const vorb = bereit ? vorbereitenListe(daten) : [];
  const vorbFaellig = vorb.filter((x) => !x.avis && x.infoBis <= heute()).length;
  const ueberfaellig = unterwegs.filter((x) => x.raus.zurueck_bis && x.raus.zurueck_bis < heute()).length;

  useSeitenSuche({
    name: "Lager", platzhalter: "HOCO Nr., Bezeichnung, Firma …",
    eintraege: () => bestand.map((e) => ({ gruppe: "Lager", zeichen: "▦", titel: e.hoco,
      zeile: [daten.bezeichnung.get(e.hoco), alt.zahlText(e.menge) + " Stk"].filter(Boolean).join(" · "), id: e.hoco })),
    springen: (x) => { setSuche(""); setReiter("bestand"); setOffen(x.id); hinzeigen('[data-lager="' + x.id + '"]'); },
  });

  const s = suche.trim().toLowerCase();
  const passt = (t) => !s || s.split(/\s+/).every((w) => String(t || "").toLowerCase().includes(w));
  const wer = (id) => (id && daten.personen.get(id)) || "";
  const extName = (id) => { const x = bereit && daten.extern.get(id); return x ? x.schritt + (x.firma ? " bei " + x.firma : "") : "extern"; };

  const REITER = [
    ["bestand", "Bestand"],
    ["extern", "Bei externen Firmen" + (unterwegs.length ? " (" + unterwegs.length + ")" : ""), ueberfaellig],
    ["vorbereiten", "Vorbereiten" + (vorb.filter((x) => !x.avis).length ? " (" + vorb.filter((x) => !x.avis).length + ")" : ""), vorbFaellig],
    ["buchungen", "Alle Buchungen"],
    ["stamm", "Stammdaten"],
  ];

  return (
    <>
      <h1 className="seitentitel">Lager</h1>
      <div className="mat-kopf">
        <button className="knopf knopf--haupt" id="lager-ein" disabled={!bereit}
          onClick={() => buchenOeffnen("ein", daten, bestand, null, neu)}>+ Einbuchen</button>
        <button className="knopf" id="lager-aus" disabled={!bereit}
          onClick={() => buchenOeffnen("aus", daten, bestand, null, neu)}>− Ausbuchen</button>
        <input className="mat-sucheingabe" id="lager-filter" type="search" value={suche}
          placeholder="Suchen: HOCO Nr., Index, Bezeichnung, Firma, Notiz" onChange={(e) => setSuche(e.target.value)} />
      </div>
      <div className="reiter lager-reiter">
        {REITER.map(([k, t, rot]) => (
          <button key={k} className={"reiter__knopf" + (reiter === k ? " aktiv" : "") + (rot ? " lager-reiter--rot" : "")}
            id={"lager-reiter-" + k} onClick={() => setReiter(k)}>{t}</button>))}
      </div>
      {fehler && !daten
        ? <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>
        : !daten
          ? <div className="laedt">Wird geladen …</div>
          : daten.fehlt
            ? <div className="karte karte--hinweis"><p>Das Lager ist in der Datenbank noch nicht eingerichtet (sql/lager-logik.sql).</p></div>
            : reiter === "bestand"
              ? <Bestand bestand={bestand.filter((e) => passt(e.hoco + " " + (daten.bezeichnung.get(e.hoco) || "") + " " + kurzBestand(e) + " " + linienMitBestand(e).map((l) => l.ort).join(" ")))}
                  daten={daten} offen={offen} setOffen={setOffen} neu={neu} alle={bestand} wer={wer} extName={extName}
                  unterwegs={unterwegs} leer={!bestand.length} />
              : reiter === "extern"
                ? <Unterwegs liste={unterwegs.filter((x) => passt([x.raus.hoco_nr, x.raus.index_nr, daten.bezeichnung.get(x.raus.hoco_nr), extName(x.raus.ext_id), x.raus.notiz].join(" ")))}
                    daten={daten} bestand={bestand} neu={neu} extName={extName} />
                : reiter === "vorbereiten"
                  ? <Vorbereiten liste={vorb.filter((x) => passt([x.job.job_number, x.job.fa_nr, daten.bezeichnung.get(x.job.job_number), x.ext.schritt, x.ext.firma].join(" ")))}
                      daten={daten} neu={neu} wer={wer} />
                  : reiter === "buchungen"
                    ? <Buchungen liste={daten.buchungen.filter((b) => passt([b.hoco_nr, b.index_nr, daten.bezeichnung.get(b.hoco_nr), b.ort, b.fa_nr, b.notiz, grundText(b.grund), b.ext_id ? extName(b.ext_id) : "", wer(b.erstellt_von)].join(" ")))}
                        daten={daten} neu={neu} wer={wer} extName={extName} mitHoco />
                    : <Stammdaten daten={daten} neu={neu} passt={passt} />}
    </>
  );
}

function Bestand({ bestand, daten, offen, setOffen, neu, alle, wer, extName, unterwegs, leer }) {
  if (!bestand.length) {
    return <div className="karte karte--hinweis"><p>{leer ? "Noch nichts an Lager. Mit „+ Einbuchen“ Teile aus der Produktion einbuchen." : "Nichts gefunden."}</p></div>;
  }
  return (
    <section className="karte lager-liste">
      <div className="lager-zeile lager-zeile--kopf klein">
        <span>HOCO Nr.</span><span>Bezeichnung</span><span className="lager-zahl">Bestand</span><span>Je Index</span><span>Letzte Buchung</span>
      </div>
      {bestand.map((e) => {
        const ext = unterwegs.filter((x) => x.raus.hoco_nr === e.hoco);
        const extStk = ext.reduce((n, x) => n + x.offen, 0);
        return (
          <div key={e.hoco} data-lager={e.hoco}>
            <button className={"lager-zeile" + (e.menge === 0 && !extStk ? " lager-zeile--leer" : "") + (e.menge < 0 ? " lager-zeile--minus" : "")}
              onClick={() => setOffen(offen === e.hoco ? null : e.hoco)} aria-expanded={offen === e.hoco}>
              <b>{offen === e.hoco ? "▾ " : "▸ "}{e.hoco}</b>
              <span>{daten.bezeichnung.get(e.hoco) || ""}</span>
              <b className="lager-zahl">{alt.zahlText(e.menge)} Stk</b>
              <span>{kurzBestand(e) || "–"}{extStk ? <span className="lager-schild">{alt.zahlText(extStk)} Stk extern</span> : null}</span>
              <span className="klein">{alt.datumZeitKurz(e.zuletzt)}</span>
            </button>
            {offen === e.hoco && (
              <div className="lager-offen">
                <div className="lager-kette klein">
                  Ablauf: {ablaufText(daten, e.hoco)}{" "}
                  <button className="knopf knopf--klein" data-ablauf-aendern={e.hoco} onClick={() => ablaufOeffnen(e.hoco, daten, neu)}>Ablauf ändern</button>
                  {daten.index.get(e.hoco) ? <span> · Index laut Stammdaten: <b>{daten.index.get(e.hoco)}</b></span> : null}
                </div>
                <div className="lager-linien">
                  {linienMitBestand(e).map((l) => {
                    const n = l.menge > 0 && l.art !== "fertig" ? naechsterSchritt(daten, l.hoco, l.stufe) : null;
                    const wert = l.schluessel + "@" + l.hoco;
                    const alterIndex = daten.index.get(e.hoco) && l.index_nr && l.index_nr !== daten.index.get(e.hoco);
                    return (
                      <div key={l.schluessel} className={"lager-linie" + (l.menge < 0 ? " lager-zeile--minus" : "")} data-linie={l.schluessel}>
                        <b>{l.index_nr ? "Index " + l.index_nr : "ohne Index"}</b>
                        <span>{artText(l.art)}{stufeText(daten, l.hoco, l.art, l.stufe) ? " " + stufeText(daten, l.hoco, l.art, l.stufe) : ""}
                          {alterIndex ? <span className="lager-schild lager-schild--warn">alter Index</span> : null}</span>
                        <span className="klein">{l.ort || "ohne Platz"}</span>
                        <b className="lager-zahl">{alt.zahlText(l.menge)} Stk</b>
                        <span className="lager-ablauf__knoepfe">
                          {n && <button className="knopf knopf--klein knopf--haupt" data-weiter={l.schluessel}
                            onClick={() => buchenOeffnen("aus", daten, alle, { hoco: e.hoco, linie: wert, grund: "extern_raus" }, neu)}>
                            → {n.schritt}{n.firma ? " (" + n.firma + ")" : ""}</button>}
                          {l.art === "fertig" && l.menge > 0 && <button className="knopf knopf--klein"
                            onClick={() => buchenOeffnen("aus", daten, alle, { hoco: e.hoco, linie: wert, grund: "auslieferung" }, neu)}>Ausliefern</button>}
                          {l.menge > 0 && <button className="knopf knopf--klein"
                            onClick={() => buchenOeffnen("aus", daten, alle, { hoco: e.hoco, linie: wert }, neu)}>− Ausbuchen</button>}
                        </span>
                      </div>);
                  })}
                  {ext.map((x) => (
                    <div key={x.raus.id} className="lager-linie lager-linie--extern">
                      <b>{x.raus.index_nr ? "Index " + x.raus.index_nr : "ohne Index"}</b>
                      <span>bei {extName(x.raus.ext_id)}</span>
                      <span className={"klein" + (x.raus.zurueck_bis && x.raus.zurueck_bis < heute() ? " lager-rot" : "")}>
                        {x.raus.zurueck_bis ? "zurück bis " + alt.kurzDatum(x.raus.zurueck_bis) : ""}</span>
                      <b className="lager-zahl">{alt.zahlText(x.offen)} Stk</b>
                      <span className="lager-ablauf__knoepfe">
                        <button className="knopf knopf--klein knopf--haupt"
                          onClick={() => buchenOeffnen("ein", daten, alle, { grund: "extern_zurueck", bezug: x.raus.id }, neu)}>Zurück einbuchen</button>
                      </span>
                    </div>))}
                </div>
                <div className="mat-kopf">
                  <button className="knopf knopf--klein knopf--haupt" onClick={() => buchenOeffnen("ein", daten, alle, { hoco: e.hoco }, neu)}>+ Einbuchen</button>
                </div>
                <Buchungen liste={e.buchungen} daten={daten} neu={neu} wer={wer} extName={extName} />
              </div>)}
          </div>);
      })}
    </section>
  );
}

async function abschliessen(x, neu) {
  const ok = await alt.nachfragen({ titel: "Lieferung abschliessen",
    text: "Die " + alt.zahlText(x.offen) + " Stk, die noch fehlen, werden nicht mehr erwartet (etwa Ausschuss bei der Firma). Abschliessen?",
    bestaetigen: "Abschliessen" });
  if (!ok) return;
  const r = await alt.db.from("lager_buchungen").update({ erledigt: true }).eq("id", x.raus.id);
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  alt.merkeSchritt("Lieferung abschliessen", alt.rueckSetz("lager_buchungen", { erledigt: false }, { id: x.raus.id }));
  neu();
}

function Unterwegs({ liste, daten, bestand, neu, extName }) {
  if (!liste.length) return <div className="karte karte--hinweis"><p>Zurzeit sind keine Teile bei externen Firmen.</p></div>;
  return (
    <section className="karte lager-liste">
      {liste.map((x) => {
        const spaet = x.raus.zurueck_bis && x.raus.zurueck_bis < heute();
        return (
          <div key={x.raus.id} className="lager-linie lager-linie--gross" data-unterwegs={x.raus.id}>
            <span><b>{x.raus.hoco_nr}</b>{x.raus.index_nr ? " · Index " + x.raus.index_nr : ""}
              <span className="klein"> {daten.bezeichnung.get(x.raus.hoco_nr) || ""}</span></span>
            <span><b>{extName(x.raus.ext_id)}</b><span className="klein"> · raus {tagText(x.raus.erstellt_am)}{x.raus.notiz ? " · " + x.raus.notiz : ""}</span></span>
            <span className={spaet ? "lager-rot" : ""}>{x.raus.zurueck_bis ? (spaet ? "überfällig seit " : "zurück bis ") + alt.kurzDatum(x.raus.zurueck_bis) : "ohne Termin"}</span>
            <b className="lager-zahl">{alt.zahlText(x.offen)} Stk{x.zurueck ? <span className="klein"> von {alt.zahlText(-x.raus.menge)}</span> : null}</b>
            <span className="lager-ablauf__knoepfe">
              <button className="knopf knopf--klein knopf--haupt"
                onClick={() => buchenOeffnen("ein", daten, bestand, { grund: "extern_zurueck", bezug: x.raus.id }, neu)}>Zurück einbuchen</button>
              <button className="knopf knopf--klein" onClick={() => abschliessen(x, neu)}>Abschliessen</button>
            </span>
          </div>);
      })}
    </section>
  );
}

async function avisSetzen(x, neu) {
  if (x.avis) {
    const vorher = await alt.rueckSichern("lager_avis", { id: x.avis.id });
    const r = await alt.db.from("lager_avis").delete().eq("id", x.avis.id);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    if (vorher.length) alt.merkeSchritt("Ankündigung zurücknehmen", alt.rueckRein("lager_avis", vorher));
  } else {
    const r = await alt.db.from("lager_avis").insert({ job_id: x.job.id, ext_id: x.ext.id }).select("id").single();
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    alt.merkeSchritt("Firma informiert", alt.rueckWeg("lager_avis", { id: r.data.id }));
  }
  neu();
}

function Vorbereiten({ liste, daten, neu, wer }) {
  if (!liste.length) {
    return <div className="karte karte--hinweis"><p>Nichts vorzubereiten. Hier erscheinen Aufträge der Planwand, deren HOCO Nr. einen Ablauf
      mit einem externen Schritt hat, der vorher eine Ankündigung braucht (Stammdaten).</p></div>;
  }
  return (
    <section className="karte lager-liste">
      <p className="klein lager-erklaerung">Raus geht es am Arbeitstag nach dem geplanten Ende auf der Planwand, danach je Schritt die übliche Dauer.</p>
      {liste.map((x) => {
        const faellig = !x.avis && x.infoBis <= heute();
        const mail = /\S+@\S+\.\S+/.exec(x.ext.kontakt || "");
        const text = avisText(x, daten.bezeichnung.get(x.job.job_number));
        return (
          <div key={x.job.id + x.ext.id} className={"lager-linie lager-linie--gross" + (x.avis ? " lager-zeile--leer" : "")} data-vorbereiten={x.job.id + "|" + x.ext.id}>
            <span className={faellig ? "lager-rot" : ""}><b>{x.avis ? "✓ informiert" : (faellig ? "jetzt informieren" : "informieren bis " + alt.kurzDatum(x.infoBis))}</b>
              {x.avis ? <span className="klein"> {tagText(x.avis.am)}{wer(x.avis.von) ? " · " + wer(x.avis.von) : ""}</span> : null}</span>
            <span><b>{x.ext.schritt}</b>{x.ext.firma ? " · " + x.ext.firma : ""}<span className="klein"> · Schritt {x.nr}</span></span>
            <span><b>{x.job.job_number}</b>{x.job.fa_nr ? " · FA " + x.job.fa_nr : ""}<span className="klein"> {daten.bezeichnung.get(x.job.job_number) || ""}</span></span>
            <span>ca. {alt.zahlText(x.job.target_quantity || 0)} Stk · KW {alt.kalenderwoche(x.raus)} ({alt.kurzDatum(x.raus)})</span>
            <span className="lager-ablauf__knoepfe">
              <button className="knopf knopf--klein" title="Text für die Firma kopieren"
                onClick={() => { alt.zwischenablageSetzen(text); alt.meldung("Text kopiert.", "gut"); }}>⧉ Text</button>
              {mail && <a className="knopf knopf--klein" href={"mailto:" + mail[0] + "?subject=" + encodeURIComponent("Ankündigung " + x.job.job_number + " " + x.ext.schritt) + "&body=" + encodeURIComponent(text)}>✉ Mail</a>}
              <button className={"knopf knopf--klein" + (x.avis ? "" : " knopf--haupt")} data-avis=""
                onClick={() => avisSetzen(x, neu)}>{x.avis ? "Zurücknehmen" : "✓ Informiert"}</button>
            </span>
          </div>);
      })}
    </section>
  );
}

async function buchungLoeschen(b, daten, neu) {
  const folgen = daten.buchungen.filter((x) => x.bezug_id === b.id).length;
  const ok = await alt.nachfragen({ titel: "Buchung löschen",
    text: b.hoco_nr + ", " + (b.menge > 0 ? "+" : "") + alt.zahlText(b.menge) + " Stk vom " + alt.datumZeitKurz(b.erstellt_am) + " löschen?"
      + (folgen ? " Zu dieser Lieferung gibt es " + folgen + " Rückbuchung(en), die bleiben stehen." : ""),
    bestaetigen: "Löschen", gefahr: true });
  if (!ok) return;
  const vorher = await alt.rueckSichern("lager_buchungen", { id: b.id });
  const r = await alt.db.from("lager_buchungen").delete().eq("id", b.id);
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  if (vorher.length) alt.merkeSchritt("Lagerbuchung löschen", alt.rueckRein("lager_buchungen", vorher));
  alt.meldung("Gelöscht.", "gut");
  neu();
}

function Buchungen({ liste, neu, wer, daten, extName, mitHoco }) {
  if (!liste.length) return <div className="karte karte--hinweis"><p>Keine Buchungen.</p></div>;
  return (
    <div className={mitHoco ? "karte lager-buchungen" : "lager-buchungen"}>
      {liste.map((b) => (
        <div key={b.id} className="lager-buchung" data-buchung={b.id}>
          <span className="klein">{alt.datumZeitKurz(b.erstellt_am)}</span>
          <b className={"lager-zahl " + (b.menge > 0 ? "lager-ein" : "lager-aus")}>{b.menge > 0 ? "+" : "−"}{alt.zahlText(Math.abs(b.menge))}</b>
          <span>
            {mitHoco && <b>{b.hoco_nr} </b>}
            {b.index_nr ? "Index " + b.index_nr + " · " : ""}{artText(b.art)}
            {b.grund ? " · " + grundText(b.grund) : ""}{b.ext_id ? " (" + extName(b.ext_id) + ")" : ""}
            {b.ort ? " · " + b.ort : ""}{b.fa_nr ? " · FA " + b.fa_nr : ""}{b.notiz ? " · " + b.notiz : ""}
            {wer(b.erstellt_von) ? <span className="klein"> · {wer(b.erstellt_von)}</span> : null}
          </span>
          <button className="knopf knopf--klein knopf--gefahr" title="Buchung löschen"
            onClick={() => buchungLoeschen(b, daten, neu)}>Löschen</button>
        </div>))}
    </div>
  );
}

export { linieText };
