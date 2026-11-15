// =================================================================
//  SEITE LAGER (seit 1.557.0, Wunsch Patrick 15. November 2026:
//  „provisorisch, nur für Admins sehbar, einen Lagerbestand für Teile
//  von uns … Teile einbuchen und ausbuchen, sind meist die Teile von der
//  Planwand, haben das bisher auf Gewatec gemacht“)
//  Jede Buchung ist eine Zeile in lager_buchungen (sql/lager-teile.sql):
//  menge positiv = eingebucht, negativ = ausgebucht. Den Bestand je
//  HOCO Nr. und Ort rechnet die App. Einbuchen nimmt HOCO Nr. und FA Nr.
//  wahlweise von einem Auftrag der Planwand. Nur Admins, nie Externe.
// =================================================================
import { useState } from "react";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import { useSeitenSuche, hinzeigen } from "../teile/seitenSuche.js";

const gemerkt = { suche: "", reiter: "bestand", offen: null };
const TAGE_ZURUECK = 90;

async function laden() {
  const r = await alt.zeitlimit(alt.db.from("lager_buchungen").select("*")
    .order("erstellt_am", { ascending: false }), 15000, "Lager");
  if (r.error) {
    // Tabelle noch nicht da: verständlicher Hinweis statt Absturz
    if (/lager_buchungen|relation|schema cache/i.test(String(r.error.message || ""))) return { fehlt: true };
    throw r.error;
  }
  const buchungen = r.data || [];
  const nummern = [...new Set(buchungen.map((b) => b.hoco_nr))];
  const [teile, leute] = await Promise.all([
    nummern.length
      ? alt.zeitlimit(alt.db.from("hoco_parts").select("hoco_nr, bezeichnung").in("hoco_nr", nummern), 8000, "HOCO")
        .then((x) => x.data || [], () => [])
      : Promise.resolve([]),
    alt.zeitlimit(alt.db.from("profiles").select("id, full_name, email"), 8000, "Personen")
      .then((x) => x.data || [], () => []),
  ]);
  return {
    buchungen,
    bezeichnung: new Map(teile.map((t) => [t.hoco_nr, t.bezeichnung || ""])),
    personen: new Map(leute.map((u) => [u.id, alt.personName(u)])),
  };
}

// Bestand je HOCO Nr., darin je Ort
function bestandRechnen(buchungen) {
  const je = new Map();
  buchungen.forEach((b) => {
    let e = je.get(b.hoco_nr);
    if (!e) { e = { hoco: b.hoco_nr, menge: 0, orte: new Map(), zuletzt: b.erstellt_am, buchungen: [] }; je.set(b.hoco_nr, e); }
    e.menge += b.menge;
    const o = b.ort || "";
    e.orte.set(o, (e.orte.get(o) || 0) + b.menge);
    if (b.erstellt_am > e.zuletzt) e.zuletzt = b.erstellt_am;
    e.buchungen.push(b);
  });
  return [...je.values()].sort((a, b) => a.hoco.localeCompare(b.hoco));
}

function ortText(orte) {
  const l = [...orte.entries()].filter(([, m]) => m !== 0);
  // Nur ein Ort: die Menge steht schon daneben
  if (l.length === 1) return l[0][0] || "ohne Ort";
  return l.map(([o, m]) => (o || "ohne Ort") + " " + alt.zahlText(m)).join(" · ");
}

// Aufträge der Planwand zur Wahl: was läuft oder rüstet, und was in den
// letzten 90 Tagen fertig wurde; neueste zuerst
async function auftraegeLaden(hoco) {
  const ab = new Date(Date.now() - TAGE_ZURUECK * 864e5).toISOString();
  let q = alt.db.from("planwand").select("id, job_number, fa_nr, maschine, maschine_nr, plan_status, ended_at, target_quantity, stand, started_at")
    .or("ended_at.is.null,ended_at.gte." + ab);
  if (hoco) q = q.eq("job_number", hoco);
  const r = await alt.zeitlimit(q, 10000, "Aufträge").then((x) => x, () => ({ data: [] }));
  return (r.data || []).filter((j) => j.job_number && (j.ended_at || j.plan_status === "laeuft" || j.plan_status === "ruesten" || j.started_at))
    .sort((a, b) => String(b.ended_at || "9999").localeCompare(String(a.ended_at || "9999")))
    .slice(0, 150);
}

function auftragText(j) {
  const wann = j.ended_at ? "fertig " + alt.kurzDatum(j.ended_at) : (j.plan_status === "laeuft" ? "läuft" : j.plan_status || "");
  return j.job_number + (j.fa_nr ? " · FA " + j.fa_nr : "") + " · " + (j.maschine_nr || j.maschine || "")
    + " · " + wann + (j.stand ? " · " + alt.zahlText(j.stand) + " Stk" : "");
}

function ganzeZahl(w) {
  const n = Number(String(w || "").replace(/['’\s]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && Math.round(n) === n ? n : 0;
}

async function einbuchen(vorgabe, neu) {
  const auftraege = await auftraegeLaden(vorgabe && vorgabe.hoco);
  const w = await alt.dialogFelder({
    titel: "Teile einbuchen",
    text: "Auftrag wählen, dann kommen HOCO Nr. und FA Nr. von dort. Ohne Auftrag die HOCO Nr. eintippen.",
    felder: [
      { name: "job", label: "Auftrag von der Planwand", wert: "",
        auswahl: [["", "— ohne Auftrag —"]].concat(auftraege.map((j) => [j.id, auftragText(j)])) },
      { name: "hoco", label: "HOCO Nr. (nur ohne Auftrag)", wert: (vorgabe && vorgabe.hoco) || "", platzhalter: "z.B. 10007-0589" },
      { name: "menge", label: "Stück", ziffern: true, pflicht: true },
      { name: "ort", label: "Lagerort (freiwillig)", wert: (vorgabe && vorgabe.ort) || "" },
      { name: "notiz", label: "Notiz (freiwillig)" },
    ],
    bestaetigen: "Einbuchen",
  });
  if (!w) return;
  const j = auftraege.find((a) => a.id === w.job);
  const hoco = j ? j.job_number : w.hoco.trim();
  const menge = ganzeZahl(w.menge);
  if (!hoco) { alt.meldung("HOCO Nr. oder Auftrag wird benötigt.", "warn"); return; }
  if (!menge) { alt.meldung("Stück als ganze Zahl über 0 eintippen.", "warn"); return; }
  await buchen({ hoco_nr: hoco, menge, ort: w.ort.trim() || null, job_id: j ? j.id : null,
    fa_nr: j ? j.fa_nr || null : null, notiz: w.notiz || null }, "eingebucht", neu);
}

async function ausbuchen(eintrag, bestand, neu) {
  const mitBestand = bestand.filter((e) => e.menge > 0);
  if (!eintrag && !mitBestand.length) { alt.meldung("Es ist nichts an Lager.", "warn"); return; }
  const orte = eintrag ? [...eintrag.orte.entries()].filter(([, m]) => m > 0) : [];
  const w = await alt.dialogFelder({
    titel: "Teile ausbuchen",
    text: eintrag ? eintrag.hoco + ": " + alt.zahlText(eintrag.menge) + " Stk an Lager." : "",
    felder: [
      eintrag ? null : { name: "hoco", label: "HOCO Nr.", wert: mitBestand[0].hoco,
        auswahl: mitBestand.map((e) => [e.hoco, e.hoco + " · " + alt.zahlText(e.menge) + " Stk"]) },
      orte.length > 1 ? { name: "ort", label: "Von Lagerort", wert: orte[0][0],
        auswahl: orte.map(([o, m]) => [o, (o || "ohne Ort") + " · " + alt.zahlText(m) + " Stk"]) } : null,
      { name: "menge", label: "Stück", ziffern: true, pflicht: true },
      { name: "notiz", label: "Wohin / Lieferschein (freiwillig)" },
    ].filter(Boolean),
    bestaetigen: "Ausbuchen", gefahr: true,
  });
  if (!w) return;
  const e = eintrag || bestand.find((x) => x.hoco === w.hoco);
  const menge = ganzeZahl(w.menge);
  if (!e) return;
  if (!menge) { alt.meldung("Stück als ganze Zahl über 0 eintippen.", "warn"); return; }
  const ort = w.ort !== undefined ? w.ort : (orte.length === 1 ? orte[0][0] : "");
  if (menge > e.menge) {
    const ok = await alt.nachfragen({ titel: "Mehr als an Lager",
      text: "An Lager sind nur " + alt.zahlText(e.menge) + " Stk. Trotzdem " + alt.zahlText(menge) + " ausbuchen?",
      bestaetigen: "Trotzdem ausbuchen", gefahr: true });
    if (!ok) return;
  }
  await buchen({ hoco_nr: e.hoco, menge: -menge, ort: ort || null, notiz: w.notiz || null }, "ausgebucht", neu);
}

async function buchen(zeile, was, neu) {
  const r = await alt.db.from("lager_buchungen").insert(zeile).select("id").single();
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  alt.merkeSchritt("Lager " + was, alt.rueckWeg("lager_buchungen", { id: r.data.id }));
  alt.meldung(alt.zahlText(Math.abs(zeile.menge)) + " Stk " + zeile.hoco_nr + " " + was + ".", "gut");
  neu();
}

async function buchungLoeschen(b, neu) {
  const ok = await alt.nachfragen({ titel: "Buchung löschen",
    text: b.hoco_nr + ", " + (b.menge > 0 ? "+" : "") + alt.zahlText(b.menge) + " Stk vom " + alt.datumZeitKurz(b.erstellt_am) + " löschen?",
    bestaetigen: "Löschen", gefahr: true });
  if (!ok) return;
  const vorher = await alt.rueckSichern("lager_buchungen", { id: b.id });
  const r = await alt.db.from("lager_buchungen").delete().eq("id", b.id);
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  if (vorher.length) alt.merkeSchritt("Lagerbuchung löschen", alt.rueckRein("lager_buchungen", vorher));
  alt.meldung("Gelöscht.", "gut");
  neu();
}

export default function Lager({ auffrischen }) {
  const [suche, setSuche] = useState(gemerkt.suche);
  const [reiter, setReiter] = useState(gemerkt.reiter);
  const [offen, setOffen] = useState(gemerkt.offen);
  useGemerkt(gemerkt, { suche, reiter, offen });
  const { daten, fehler, neu } = useDaten(laden, [auffrischen]);
  const bestand = daten && !daten.fehlt ? bestandRechnen(daten.buchungen) : [];

  useSeitenSuche({
    name: "Lager", platzhalter: "HOCO Nr., Bezeichnung, Ort …",
    eintraege: () => bestand.map((e) => ({ gruppe: "Lager", zeichen: "▦", titel: e.hoco,
      zeile: [daten.bezeichnung.get(e.hoco), alt.zahlText(e.menge) + " Stk", ortText(e.orte)].filter(Boolean).join(" · "),
      id: e.hoco })),
    springen: (x) => { setSuche(""); setReiter("bestand"); setOffen(x.id); hinzeigen('[data-lager="' + x.id + '"]'); },
  });

  const s = suche.trim().toLowerCase();
  const passt = (t) => !s || s.split(/\s+/).every((w) => t.toLowerCase().includes(w));
  const wer = (id) => (id && daten.personen.get(id)) || "";

  return (
    <>
      <h1 className="seitentitel">Lager</h1>
      <p className="klein mat-erklaerung">Provisorisch: eigene Teile einbuchen und ausbuchen. Nur für Admins sichtbar.</p>
      <div className="mat-kopf">
        <button className="knopf knopf--haupt" id="lager-ein" disabled={!daten || daten.fehlt}
          onClick={() => einbuchen(null, neu)}>+ Einbuchen</button>
        <button className="knopf" id="lager-aus" disabled={!daten || daten.fehlt}
          onClick={() => ausbuchen(null, bestand, neu)}>− Ausbuchen</button>
        <input className="mat-sucheingabe" id="lager-filter" type="search" value={suche}
          placeholder="Suchen: HOCO Nr., Bezeichnung, Ort, Notiz" onChange={(e) => setSuche(e.target.value)} />
      </div>
      <div className="reiter lager-reiter">
        <button className={"reiter__knopf" + (reiter === "bestand" ? " aktiv" : "")}
          id="lager-reiter-bestand" onClick={() => setReiter("bestand")}>Bestand</button>
        <button className={"reiter__knopf" + (reiter === "buchungen" ? " aktiv" : "")}
          id="lager-reiter-buchungen" onClick={() => setReiter("buchungen")}>Alle Buchungen</button>
      </div>
      {fehler && !daten
        ? <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>
        : !daten
          ? <div className="laedt">Wird geladen …</div>
          : daten.fehlt
            ? <div className="karte karte--hinweis"><p>Das Lager ist in der Datenbank noch nicht eingerichtet
                (sql/lager-teile.sql).</p></div>
            : reiter === "bestand"
              ? <Bestand bestand={bestand.filter((e) => passt(e.hoco + " " + (daten.bezeichnung.get(e.hoco) || "") + " " + ortText(e.orte)))}
                  daten={daten} offen={offen} setOffen={setOffen} neu={neu} alle={bestand} wer={wer} leer={!bestand.length} />
              : <Buchungen liste={daten.buchungen.filter((b) => passt([b.hoco_nr, daten.bezeichnung.get(b.hoco_nr), b.ort, b.fa_nr, b.notiz, wer(b.erstellt_von)].filter(Boolean).join(" ")))}
                  daten={daten} neu={neu} wer={wer} mitHoco />}
    </>
  );
}

function Bestand({ bestand, daten, offen, setOffen, neu, alle, wer, leer }) {
  if (!bestand.length) {
    return <div className="karte karte--hinweis"><p>{leer ? "Noch nichts an Lager. Mit „+ Einbuchen“ Teile eines Auftrags einbuchen." : "Nichts gefunden."}</p></div>;
  }
  return (
    <section className="karte lager-liste">
      <div className="lager-zeile lager-zeile--kopf klein">
        <span>HOCO Nr.</span><span>Bezeichnung</span><span className="lager-zahl">Bestand</span><span>Lagerort</span><span>Letzte Buchung</span>
      </div>
      {bestand.map((e) => (
        <div key={e.hoco} data-lager={e.hoco}>
          <button className={"lager-zeile" + (e.menge === 0 ? " lager-zeile--leer" : "") + (e.menge < 0 ? " lager-zeile--minus" : "")}
            onClick={() => setOffen(offen === e.hoco ? null : e.hoco)} aria-expanded={offen === e.hoco}>
            <b>{offen === e.hoco ? "▾ " : "▸ "}{e.hoco}</b>
            <span>{daten.bezeichnung.get(e.hoco) || ""}</span>
            <b className="lager-zahl">{alt.zahlText(e.menge)} Stk</b>
            <span>{ortText(e.orte)}</span>
            <span className="klein">{alt.datumZeitKurz(e.zuletzt)}</span>
          </button>
          {offen === e.hoco && (
            <div className="lager-offen">
              <div className="mat-kopf">
                <button className="knopf knopf--klein knopf--haupt" onClick={() => einbuchen({ hoco: e.hoco }, neu)}>+ Einbuchen</button>
                <button className="knopf knopf--klein" disabled={e.menge <= 0} onClick={() => ausbuchen(e, alle, neu)}>− Ausbuchen</button>
              </div>
              <Buchungen liste={e.buchungen} daten={daten} neu={neu} wer={wer} />
            </div>)}
        </div>))}
    </section>
  );
}

function Buchungen({ liste, neu, wer, daten, mitHoco }) {
  if (!liste.length) return <div className="karte karte--hinweis"><p>Keine Buchungen.</p></div>;
  return (
    <div className={mitHoco ? "karte lager-buchungen" : "lager-buchungen"}>
      {liste.map((b) => (
        <div key={b.id} className="lager-buchung" data-buchung={b.id}>
          <span className="klein">{alt.datumZeitKurz(b.erstellt_am)}</span>
          <b className={"lager-zahl " + (b.menge > 0 ? "lager-ein" : "lager-aus")}>{b.menge > 0 ? "+" : "−"}{alt.zahlText(Math.abs(b.menge))}</b>
          <span>
            {mitHoco && <b>{b.hoco_nr} </b>}
            {mitHoco && daten.bezeichnung.get(b.hoco_nr) ? <span className="klein">{daten.bezeichnung.get(b.hoco_nr)} · </span> : null}
            {b.ort || "ohne Ort"}{b.fa_nr ? " · FA " + b.fa_nr : ""}{b.notiz ? " · " + b.notiz : ""}
            {wer(b.erstellt_von) ? <span className="klein"> · {wer(b.erstellt_von)}</span> : null}
          </span>
          <button className="knopf knopf--klein knopf--gefahr" title="Buchung löschen"
            onClick={() => buchungLoeschen(b, neu)}>Löschen</button>
        </div>))}
    </div>
  );
}
