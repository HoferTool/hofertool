// =================================================================
//  WERKZEUGWECHSEL BEI SW
//  Bei den SW-Maschinen nutzen wir den Tool Life Counter der Maschine
//  selbst, aber nur, wenn bekannt ist, welche Standzeit realistisch ist
//  (Wunsch Patrick 29. Oktober 2026: „besser, einfacher und trotzdem
//  genialer als die anderen“). Darum ist das Fenster eine Karte je
//  Werkzeug statt einer Tabelle:
//  - wie viele Stück das Werkzeug seit dem letzten Wechsel gemacht hat
//  - welche Standzeit sich aus den bisherigen Wechseln ergibt, und ob
//    sie sicher genug ist, um sie in den Tool Life Counter zu tippen
//  - Karten antippen, dann „Wechsel eintragen“
//  - darunter der Verlauf: Datum/Stück antippen ändert, ein Werkzeug
//    antippen nimmt es aus dem Wechsel, der Papierkorb löscht ihn ganz
//  Gerechnet wird über alle SW-Maschinen desselben Typs, aber nur für
//  diese HOCO Nr. (protokollLaden), weil die Standzeit am Teil hängt.
// =================================================================
import { useState } from "react";
import { alt } from "../bruecke.jsx";
import { blattSpeichern, blattSuchen, platzInGebrauch } from "../einrichtblatt/daten.js";
import { auswahlDialog } from "../teile/Dialoge.jsx";
import { protokollLaden } from "./IndexProtokoll.jsx";

const datum = (iso) => new Date(iso).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
const z = (n) => alt.zahlText(n);
const nummer = (t) => { const m = String(t || "").match(/\d+/); return m ? Number(m[0]) : 0; };
// Bei SW gehört die Nummer fest zu einem Path: T100 Path 1, T1100 Path 3,
// T2100 Path 2; Farben wie im Einrichtblatt
export const swPath = (t) => { const n = nummer(t); return n < 1000 ? 1 : n < 2000 ? 3 : 2; };
const PATH_FARBE = { 1: "#FFC000", 2: "#00B0F0", 3: "#00B050" };
const ORDNUNG = [1, 3, 2];
const neueId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : null);

// Wie lange hielt ein Werkzeug? Abstand der Stückzahl zwischen zwei
// Wechseln desselben Platzes im selben Auftrag auf derselben Maschine.
// Über Aufträge hinweg zählt es nicht, weil der Zähler neu beginnt.
export function standzeitenVon(runden, toolNr) {
  const werte = [];
  const letzte = {};
  runden.forEach((r) => {
    const zeile = r.zeilen.find((x) => x.tool_nr === toolNr);
    if (!zeile || r.stk === null || r.stk === undefined) return;
    const k = (r.job || "") + "|" + (zeile.machine_id || "");
    if (letzte[k] !== undefined && r.stk > letzte[k]) werte.push(r.stk - letzte[k]);
    letzte[k] = r.stk;
  });
  return werte;
}

// Realistische Standzeit: von den letzten acht Werten die, die nahe am
// Median liegen (halb bis anderthalb Mal). Ausreisser wie ein Bruch
// nach 50 Stück oder ein vergessener Eintrag zählen nicht. Sicher erst
// mit mindestens drei ähnlichen Werten, die mindestens 60 % ausmachen.
// Der Vorschlag für den Counter ist der Wert, den drei von vier
// Werkzeugen erreicht haben (unteres Viertel), auf 10 abgerundet: so
// meldet die Maschine, bevor es knapp wird.
export function standzeitSchaetzen(alle) {
  const werte = alle.slice(-8);
  if (!werte.length) return { n: 0, sicher: false };
  const sortiert = werte.slice().sort((a, b) => a - b);
  const mitte = sortiert.length % 2 ? sortiert[(sortiert.length - 1) / 2]
    : (sortiert[sortiert.length / 2 - 1] + sortiert[sortiert.length / 2]) / 2;
  const typisch = sortiert.filter((w) => w >= mitte * 0.5 && w <= mitte * 1.5);
  const sicher = typisch.length >= 3 && typisch.length / werte.length >= 0.6;
  const viertel = typisch[Math.floor((typisch.length - 1) * 0.25)];
  return { n: werte.length, sicher, typisch: typisch.length, von: typisch[0], bis: typisch[typisch.length - 1],
    vorschlag: viertel ? Math.max(10, Math.floor(viertel / 10) * 10) : null };
}

export async function swModellLaden(maschine, auftrag, typ) {
  const hoco = auftrag.job_number;
  const [runden, blatt, paths] = await Promise.all([protokollLaden(hoco, typ.id),
    blattSuchen(hoco, typ.id), alt.ladeTypAufbau(typ.id).catch(() => [])]);
  // Plätze des Typs mit dem Namen ihres Path, wie ihn die Platzwahl speichert
  const pathName = {};
  const plaetze = [];
  (paths || []).forEach((p) => (p.type_slots || []).filter((s) => s.tool_nr).forEach((s) => {
    if (!pathName[s.tool_nr]) { pathName[s.tool_nr] = p.name || null; plaetze.push(s.tool_nr); }
  }));
  const eb = (blatt && blatt.plaetze) || {};
  Object.keys(eb).forEach((k) => { if (platzInGebrauch(eb[k]) && !plaetze.includes(k) && /^T\d+$/.test(k)) plaetze.push(k); });
  runden.forEach((r) => r.zeilen.forEach((x) => { if (!plaetze.includes(x.tool_nr)) plaetze.push(x.tool_nr); }));
  plaetze.sort((a, b) => nummer(a) - nummer(b));
  return { runden, blatt, plaetze, pathName, eb };
}

export function SwWechsel({ maschine, auftrag, typ, anfang, aktionen, zu }) {
  const [m, setM] = useState(anfang);
  const [gewaehlt, setGewaehlt] = useState([]);
  const [alleZeigen, setAlleZeigen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const darf = alt.darfSchreiben();
  const stand = auftrag.stand || 0;

  // Path vom Typ, wo der Platz angelegt ist, sonst aus der Nummer
  const pathVon = (t) => { const g = /\d+/.exec(m.pathName[t] || ""); return g ? Number(g[0]) : swPath(t); };
  const neu = async () => setM(await swModellLaden(maschine, auftrag, typ));
  const arbeit = async (fn) => {
    if (laeuft) return;
    setLaeuft(true);
    try { if ((await fn()) !== false) await neu(); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    setLaeuft(false);
  };

  // Ohne Blatt oder ohne belegte Plätze: alle Plätze des Typs
  const imEb = m.plaetze.filter((t) => platzInGebrauch(m.eb[t]) || m.runden.some((r) => r.zeilen.some((x) => x.tool_nr === t)));
  const sichtbar = alleZeigen || !imEb.length ? m.plaetze : imEb;

  const karten = sichtbar.map((t) => {
    const p = m.eb[t] || {};
    const schaetzung = standzeitSchaetzen(standzeitenVon(m.runden, t));
    const letzter = m.runden.filter((r) => r.job === auftrag.id && r.zeilen.some((x) => x.tool_nr === t)).pop();
    const seit = letzter && letzter.stk !== null ? Math.max(0, stand - letzter.stk) : stand;
    return { t, p, schaetzung, seit, seitWechsel: !!letzter };
  });

  const umschalten = (t) => darf && setGewaehlt((g) => (g.includes(t) ? g.filter((x) => x !== t) : g.concat(t)));
  const eintragen = () => arbeit(async () => {
    const ok = await aktionen.eintragen(maschine, auftrag, gewaehlt.map((t) => ({ tool_nr: t, path: m.pathName[t] || "Path " + pathVon(t) })));
    if (!ok) return false;
    setGewaehlt([]);
    return true;
  });

  // Die sichere Standzeit als Standzeit ins Einrichtblatt schreiben
  const insBlatt = (t, wert) => arbeit(async () => {
    const plaetze = Object.assign({}, m.blatt.plaetze, { [t]: Object.assign({}, m.blatt.plaetze[t], { standzeit: wert }) });
    await blattSpeichern(Object.assign({}, m.blatt, { plaetze }), "Standzeit ins Einrichtblatt");
    alt.meldung("Standzeit " + t + " im Einrichtblatt: " + z(wert) + " Stk.", "gut");
  });

  const rundeAendern = (r) => darf && arbeit(async () => {
    const w = await alt.dialogFelder({ titel: "Wechsel vom " + datum(r.wann),
      felder: [{ name: "stk", label: "Stückzahl", typ: "number", pflicht: true, wert: r.stk === null ? "" : r.stk },
        { name: "notiz", label: "Notiz", wert: r.notiz || "" }],
      bestaetigen: "Speichern" });
    if (!w) return false;
    const ids = r.zeilen.map((x) => x.id).filter(Boolean);
    const vorher = await alt.rueckSichern("tool_changes", { id: ids });
    const u = await alt.db.from("tool_changes").update({ stueckzahl: Math.max(0, Math.round(Number(w.stk) || 0)),
      notiz: w.notiz || null }).in("id", ids);
    if (u.error) throw u.error;
    alt.merkeSchritt("Werkzeugwechsel ändern", alt.rueckRein("tool_changes", vorher));
    alt.meldung("Wechsel geändert.", "gut");
  });
  const werkzeugWeg = (r, x) => darf && arbeit(async () => {
    if (r.zeilen.length === 1) return aktionen.rundeLoeschen({ id: x.machine_id || maschine.id }, r);
    const vorher = await alt.rueckSichern("tool_changes", { id: x.id });
    const d = await alt.db.from("tool_changes").delete().eq("id", x.id).select("id");
    if (d.error) throw d.error;
    if (d.data && d.data.length === 0) { alt.meldung("Nicht geändert: Dafür fehlt dir das Recht.", "warn"); return false; }
    await aktionen.nachrechnen({ id: x.machine_id || maschine.id }, [x]);
    alt.merkeSchritt("Werkzeugwechsel ändern", alt.rueckRein("tool_changes", vorher));
    alt.meldung(x.tool_nr + " aus dem Wechsel vom " + datum(r.wann) + " genommen.");
  });
  const rundeWeg = (r) => darf && arbeit(() => aktionen.rundeLoeschen({ id: r.zeilen[0].machine_id || maschine.id }, r));

  // Nachträglich dazu: ein Werkzeug in einen bestehenden Wechsel
  const werkzeugDazu = (r) => darf && arbeit(async () => {
    const frei = m.plaetze.filter((t) => !r.zeilen.some((x) => x.tool_nr === t));
    const t = await auswahlDialog("Werkzeug zum Wechsel vom " + datum(r.wann), frei.map((x) => ({ wert: x,
      text: x + ((m.eb[x] && (m.eb[x].taetigkeit || m.eb[x].werkzeug)) ? " · " + (m.eb[x].taetigkeit || m.eb[x].werkzeug) : "") })));
    if (!t) return false;
    const v = r.zeilen[0];
    const id = neueId();
    await alt.einfuegenOhneUnbekannte("tool_changes", [Object.assign(id ? { id } : {}, {
      machine_id: v.machine_id || maschine.id, job_id: v.job_id || null, hoco_nr: v.hoco_nr || auftrag.job_number,
      tool_nr: t, bezeichnung: m.pathName[t] || "Path " + pathVon(t), stueckzahl: r.stk, notiz: v.notiz || null,
      gewechselt_am: v.gewechselt_am })]);
    if (id) alt.merkeSchritt("Werkzeugwechsel ändern", alt.rueckWeg("tool_changes", { id }));
    alt.meldung(t + " zum Wechsel vom " + datum(r.wann) + " dazu.");
  });

  const verlauf = m.runden.slice().reverse().slice(0, 30);

  return (
    <div className="dialog dialog--breit wz-hist sw">
      <div className="blatt__kopf"><h2>Werkzeuge · {maschine.name}</h2>
        <span className="sw-kopf">HOCO <b>{auftrag.job_number}</b> · Stand <b data-swstand="">{z(stand)}</b> Stk</span>
        {imEb.length > 0 && imEb.length < m.plaetze.length && <button className="knopf knopf--klein knopf--still" data-swalle=""
          onClick={() => setAlleZeigen(!alleZeigen)}>{alleZeigen ? "Nur aus dem Einrichtblatt" : "Alle Plätze"}</button>}
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>

      <div className="sw-paths">{ORDNUNG.map((pn) => {
        const k = karten.filter((x) => pathVon(x.t) === pn);
        if (!k.length) return null;
        return (
          <div key={pn} className="sw-path">
            <div className="sw-path__name" style={{ borderColor: PATH_FARBE[pn] }}>Path {pn}</div>
            <div className="sw-gitter">{k.map(({ t, p, schaetzung: s, seit, seitWechsel }) => {
              const anteil = s.sicher && s.vorschlag ? seit / s.vorschlag : 0;
              const zustand = anteil >= 1 ? " sw-karte--faellig" : anteil >= 0.85 ? " sw-karte--bald" : "";
              return (
                <div key={t} role="button" tabIndex={0} data-swkarte={t}
                  className={"sw-karte" + zustand + (gewaehlt.includes(t) ? " sw-karte--an" : "")}
                  style={{ borderTopColor: PATH_FARBE[pn] }} onClick={() => umschalten(t)}>
                  <div className="sw-karte__kopf"><b>{t}</b><span>{p.taetigkeit || p.werkzeug || ""}</span>
                    {gewaehlt.includes(t) && <span className="sw-haken">✓</span>}</div>
                  <div className="sw-seit"><b>{z(seit)}</b> Stk {seitWechsel ? "seit Wechsel" : "seit Auftragsbeginn"}</div>
                  {s.sicher
                    ? <>
                        <div className="sw-balken"><i style={{ width: Math.min(100, anteil * 100) + "%" }} /></div>
                        <div className="sw-counter" data-swcounter={s.vorschlag}>Tool-Counter: <b>{z(s.vorschlag)}</b> Stk</div>
                        <div className="klein">{s.typisch} von {s.n} Wechseln hielten {z(s.von)} bis {z(s.bis)} Stk</div>
                      </>
                    : <div className="sw-unsicher" data-swunsicher="">Standzeit noch unsicher
                        {s.n ? " · " + s.n + " gemessen" : ""}{s.n && s.von ? " (" + z(s.von) + "–" + z(s.bis) + ")" : ""}</div>}
                  <div className="sw-eb klein">
                    {p.standzeit ? <>Im EB: {z(p.standzeit)} Stk</> : "Im EB: keine Standzeit"}
                    {darf && m.blatt && s.sicher && Number(p.standzeit) !== s.vorschlag && (
                      <button className="knopf knopf--klein" data-swinsblatt={t}
                        onClick={(e) => { e.stopPropagation(); insBlatt(t, s.vorschlag); }}>Ins EB: {z(s.vorschlag)}</button>)}
                  </div>
                </div>);
            })}</div>
          </div>);
      })}</div>

      {darf && <div className="dialog__knoepfe wzb-knoepfe">
        <span className="klein">Gewechselte Werkzeuge antippen. Tool-Counter steht erst, wenn mindestens drei Wechsel
          ähnlich lange hielten; vorgeschlagen ist, was drei von vier Werkzeugen geschafft haben.</span>
        <button className="knopf knopf--haupt" data-sweintragen="" disabled={!gewaehlt.length || laeuft} onClick={eintragen}>
          {gewaehlt.length ? "Wechsel eintragen · " + gewaehlt.length : "Wechsel eintragen"}</button>
      </div>}

      <h3 className="sw-verlauf-titel">Verlauf {auftrag.job_number}</h3>
      {verlauf.length ? <div className="sw-verlauf">{verlauf.map((r) => (
        <div key={r.schluessel} className="sw-runde" data-swrunde="">
          <button className="sw-runde__wann" data-swaendern="" disabled={!darf} onClick={() => rundeAendern(r)}>
            {datum(r.wann)}<b>{r.stk === null ? "—" : z(r.stk)} Stk</b></button>
          <div className="sw-runde__wz">
            {r.zeilen.map((x) => (
              <button key={x.id} className="sw-chip" data-swchip={x.tool_nr} disabled={!darf}
                style={{ borderColor: PATH_FARBE[pathVon(x.tool_nr)] }} title="Aus diesem Wechsel nehmen"
                onClick={() => werkzeugWeg(r, x)}>{x.tool_nr}{darf && <span> ✕</span>}</button>))}
            {darf && <button className="sw-chip sw-chip--dazu" data-swdazu="" onClick={() => werkzeugDazu(r)}>+</button>}
            {(r.notiz || r.person || r.maschine) && <span className="klein">
              {[r.notiz, r.maschine !== maschine.name ? r.maschine : null, r.person].filter(Boolean).join(" · ")}</span>}
          </div>
          {darf && <button type="button" className="wz-weg" data-swweg="" title="Wechsel löschen"
            aria-label={"Wechsel vom " + datum(r.wann) + " löschen"} disabled={laeuft} onClick={() => rundeWeg(r)}>
            <Eimer /></button>}
        </div>))}</div>
        : <p className="hinweis">Für diese HOCO Nr. ist noch kein Wechsel eingetragen.</p>}
    </div>
  );
}

export function Eimer() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>);
}

