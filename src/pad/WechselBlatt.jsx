// =================================================================
//  WERKZEUGWECHSEL ALS BLATT IN DER HISTORIE
//  Die Historie sieht beim Index und bei Star (SB, SR) aus wie ihr PDF
//  und lässt sich darin bearbeiten (Wunsch Patrick 29. Oktober 2026:
//  „Historie so, dass sie aussieht wie das PDF … anpassen können,
//  Stückzahl, Werkzeugwahl und so“):
//  - Feld antippen: dieses Werkzeug in diesem Wechsel dazu oder weg
//  - Datum/Stückzahl antippen: Stückzahl oder Notiz ändern
//  - Papierkorb beim Wechsel: ganz löschen, ohne Liste (Wunsch Patrick
//    29. Oktober 2026)
//  - Spalte bzw. Zeile „Neu“: Werkzeuge antippen, dann eintragen
//  Index: Werkzeuge untereinander je Revolver, sechs Wechsel je Blatt
//  nebeneinander, neuer FA mit roter Spaltenlinie. Star: wie das Blatt
//  „Plattenwechsel“, je Wechsel eine Zeile, je Werkzeug eine Spalte.
// =================================================================
import { useState } from "react";
import { alt } from "../bruecke.jsx";
import { Eimer } from "./SwWechsel.jsx";

const datum = (iso) => new Date(iso).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
const stkText = (n) => (n === null || n === undefined ? "—" : alt.zahlText(n));
const visum = (name) => String(name || "").split(/[\s.]+/).filter(Boolean).map((w) => w[0].toUpperCase()).join("");
const neueId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : null);

// modell: { art: "index" | "star", gruppen: [{ name, farbe, werkzeuge }],
//   runden, laden(), spaltenJeBlatt }, je Werkzeug { key, tool_nr, path,
//   text, unter, farbe, schrift, passt(zeile) }
// aktionen: { eintragen(maschine, auftrag, liste), rundeLoeschen(maschine, runde),
//   nachrechnen(maschine, zeilen) } aus Werkzeugwechsel.jsx
export function WechselBlatt({ modell, maschine, auftrag, aktionen }) {
  const [runden, setRunden] = useState(modell.runden);
  const [neu, setNeu] = useState([]);
  const [laeuft, setLaeuft] = useState(false);
  const darf = alt.darfSchreiben();
  const werkzeuge = modell.gruppen.flatMap((g) => g.werkzeuge);
  const hat = (r, w) => r && r.zeilen && r.zeilen.find((z) => w.passt(z));

  const arbeit = async (fn) => {
    if (laeuft) return;
    setLaeuft(true);
    try { await fn(); setRunden(await modell.laden()); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    setLaeuft(false);
  };

  // Ein Werkzeug in einem schon eingetragenen Wechsel dazu oder weg
  const umschalten = (r, w) => darf && arbeit(async () => {
    const z = hat(r, w);
    if (z) {
      const vorher = await alt.rueckSichern("tool_changes", { id: z.id });
      const d = await alt.db.from("tool_changes").delete().eq("id", z.id).select("id");
      if (d.error) throw d.error;
      if (d.data && d.data.length === 0) { alt.meldung("Nicht geändert: Dafür fehlt dir das Recht.", "warn"); return; }
      await aktionen.nachrechnen({ id: z.machine_id || maschine.id }, [z]);
      alt.merkeSchritt("Werkzeugwechsel ändern", alt.rueckRein("tool_changes", vorher));
      alt.meldung(w.tool_nr + " aus dem Wechsel vom " + datum(r.wann) + " genommen.");
    } else {
      const v = r.zeilen[0];
      const id = neueId();
      const zeile = Object.assign(id ? { id } : {}, {
        machine_id: v.machine_id || maschine.id, job_id: v.job_id || null,
        hoco_nr: v.hoco_nr || (auftrag && auftrag.job_number) || null,
        tool_nr: w.tool_nr, bezeichnung: w.path || null, stueckzahl: r.stk,
        notiz: v.notiz || null, gewechselt_am: v.gewechselt_am });
      await alt.einfuegenOhneUnbekannte("tool_changes", [zeile]);
      if (id) alt.merkeSchritt("Werkzeugwechsel ändern", alt.rueckWeg("tool_changes", { id }));
      alt.meldung(w.tool_nr + " zum Wechsel vom " + datum(r.wann) + " dazu.");
    }
  });

  const rundeWeg = (r) => darf && arbeit(() => aktionen.rundeLoeschen({ id: r.zeilen[0].machine_id || maschine.id }, r));

  // Stückzahl und Notiz eines Wechsels ändern
  const rundeBearbeiten = async (r) => {
    if (!darf || laeuft) return;
    const w = await alt.dialogFelder({ titel: "Wechsel vom " + datum(r.wann),
      felder: [{ name: "stk", label: "Stückzahl", typ: "number", pflicht: true, wert: r.stk === null ? "" : r.stk },
        { name: "notiz", label: "Notiz", wert: (r.zeilen[0] && r.zeilen[0].notiz) || "" }],
      bestaetigen: "Speichern" });
    if (!w) return;
    const ids = r.zeilen.map((z) => z.id).filter(Boolean);
    await arbeit(async () => {
      const vorher = await alt.rueckSichern("tool_changes", { id: ids });
      const u = await alt.db.from("tool_changes").update({ stueckzahl: Math.max(0, Math.round(Number(w.stk) || 0)),
        notiz: w.notiz || null }).in("id", ids);
      if (u.error) throw u.error;
      alt.merkeSchritt("Werkzeugwechsel ändern", alt.rueckRein("tool_changes", vorher));
      alt.meldung("Wechsel geändert.", "gut");
    });
  };

  const neuUmschalten = (w) => darf && setNeu((n) => (n.includes(w.key) ? n.filter((k) => k !== w.key) : n.concat(w.key)));
  const eintragen = () => arbeit(async () => {
    const liste = werkzeuge.filter((w) => neu.includes(w.key)).map((w) => ({ tool_nr: w.tool_nr, path: w.path || null }));
    if (await aktionen.eintragen(maschine, auftrag, liste)) setNeu([]);
  });

  const knopf = darf && (
    <div className="dialog__knoepfe wzb-knoepfe">
      <span className="klein">Feld antippen: Werkzeug dazu oder weg. Datum antippen: Stückzahl ändern. Papierkorb: Wechsel löschen.</span>
      <button className="knopf knopf--haupt" data-wzbeintragen="" disabled={!neu.length || laeuft} onClick={eintragen}>
        {neu.length ? "Neuen Wechsel eintragen · " + neu.length : "Neuen Wechsel eintragen"}</button>
    </div>);

  return modell.art === "index"
    ? <IndexBlatt {...{ modell, runden, neu, darf, hat, umschalten, rundeBearbeiten, rundeWeg, neuUmschalten, auftrag, maschine }} knopf={knopf} />
    : <StarBlatt {...{ modell, runden, neu, darf, hat, umschalten, rundeBearbeiten, rundeWeg, neuUmschalten, werkzeuge, auftrag, maschine }} knopf={knopf} />;
}

function IndexBlatt({ modell, runden, neu, darf, hat, umschalten, rundeBearbeiten, rundeWeg, neuUmschalten, auftrag, maschine, knopf }) {
  const je = modell.spaltenJeBlatt;
  const spalten = runden.concat(darf ? [{ neu: true, job: auftrag.id, fa: auftrag.fa_nr || "" }] : []);
  const anzahl = Math.max(1, Math.ceil(spalten.length / je));
  const [seite, setSeite] = useState(null);
  const s = seite === null ? anzahl - 1 : Math.min(seite, anzahl - 1);
  const aufBlatt = spalten.slice(s * je, (s + 1) * je);
  while (aufBlatt.length < je) aufBlatt.push(null);
  const neuerFa = (c) => { const i = spalten.indexOf(c); return i > 0 && c && (spalten[i - 1].job || "") !== (c.job || ""); };
  const faText = (c) => (c.fa ? "FA " + c.fa : "anderer Auftrag");
  const kl = (c) => "wzb-sp" + (c && c.neu ? " wzb-sp--neu" : "") + (c && neuerFa(c) ? " wzb-sp--fa" : "");

  return (<>
    <div className="wzb-titel">
      <span>Werkstück: <strong>{auftrag.job_number}</strong></span>
      <span className="wzb-gross">Werkzeugwechselprotokoll</span>
      <span>{maschine.name}{maschine.machine_number ? " · " + maschine.machine_number : ""}</span>
      <span className="wzb-blaettern">
        <button className="knopf knopf--klein knopf--still" data-wzbzurueck="" disabled={s === 0} onClick={() => setSeite(s - 1)}>◀</button>
        <span data-wzbblatt="">Blatt {s + 1} von {anzahl}</span>
        <button className="knopf knopf--klein knopf--still" data-wzbweiter="" disabled={s >= anzahl - 1} onClick={() => setSeite(s + 1)}>▶</button>
      </span>
    </div>
    <div className="wzb-rollen">
      <table className="wzb-tabelle wzb-index">
        <colgroup><col className="wzb-nr" /><col className="wzb-wz" />{aufBlatt.map((c, i) => <col key={i} className="wzb-sp" />)}</colgroup>
        <thead>
          <tr className="wzb-falabel"><th colSpan="2"></th>{aufBlatt.map((c, i) => (
            <th key={i} className={kl(c)}>{c && (neuerFa(c) ? <span className="wzb-neufa" data-wzbneufa="">Neuer {faText(c)}</span>
              : (i === 0 ? <span className="wzb-fa">{faText(c)}</span> : null))}</th>))}</tr>
          <tr><th>T-Nr</th><th className="wzb-links">Werkzeug</th>{aufBlatt.map((c, i) => (
            <th key={i} className={kl(c) + (c && !c.neu && darf ? " wzb-tipp" : "")} data-wzbrunde={c && !c.neu ? "" : undefined}
              onClick={c && !c.neu ? () => rundeBearbeiten(c) : undefined}>
              {!c ? "Dat. / Stückz." : c.neu ? "Neu" : <>{datum(c.wann)}<br /><b>{stkText(c.stk)}</b></>}</th>))}</tr>
          {darf && <tr className="wzb-wegzeile"><th colSpan="2"></th>{aufBlatt.map((c, i) => (
            <th key={i} className={kl(c)}>{c && !c.neu && <button type="button" className="wz-weg" data-wzbweg=""
              title="Wechsel löschen" aria-label={"Wechsel vom " + datum(c.wann) + " löschen"} onClick={() => rundeWeg(c)}><Eimer /></button>}</th>))}</tr>}
        </thead>
        <tbody>{modell.gruppen.map((g) => [
          <tr key={g.name} className="wzb-gruppe"><th colSpan={2 + je} style={{ background: g.farbe }}>{g.name}</th></tr>,
          ...g.werkzeuge.map((w) => (
            <tr key={w.key} data-wzbplatz={w.key}>
              <td className="wzb-nr">{w.tool_nr}</td>
              <td className="wzb-wz"><strong>{w.text}</strong>{w.unter && <small> {w.unter}</small>}</td>
              {aufBlatt.map((c, i) => (
                <td key={i} className={kl(c) + (c && darf ? " wzb-tipp" : "")}
                  onClick={!c ? undefined : c.neu ? () => neuUmschalten(w) : () => umschalten(c, w)}>
                  {c && (c.neu ? (neu.includes(w.key) ? <span className="wzb-haken">✓</span> : "")
                    : hat(c, w) ? <span className="wzb-x" data-wzbx="">X</span> : "")}</td>))}
            </tr>)),
        ])}</tbody>
      </table>
    </div>
    {knopf}
  </>);
}

function StarBlatt({ modell, runden, neu, darf, hat, umschalten, rundeBearbeiten, rundeWeg, neuUmschalten, werkzeuge, auftrag, maschine, knopf }) {
  return (<>
    <div className="wzb-titel">
      <span>Werkstück: <strong>{auftrag.job_number}</strong></span>
      <span className="wzb-gross">Werkzeugwechsel {maschine.name}</span>
    </div>
    <div className="wzb-rollen">
      <table className="wzb-tabelle wzb-star">
        <thead><tr><th className="wzb-dat">Datum:</th><th className="wzb-stk">Stück:</th>
          {werkzeuge.map((w) => <th key={w.key} className="wzb-wzk" style={{ background: w.farbe, color: w.schrift }}><span>{w.text}</span></th>)}
          <th className="wzb-links">Bemerkung:</th><th className="wzb-vis">Visum:</th>{darf && <th aria-label="Löschen"></th>}</tr></thead>
        <tbody>
          {runden.map((r) => (
            <tr key={r.schluessel}>
              <td className={"wzb-dat" + (darf ? " wzb-tipp" : "")} data-wzbrunde="" onClick={() => rundeBearbeiten(r)}>{datum(r.wann)}</td>
              <td className={"wzb-stk" + (darf ? " wzb-tipp" : "")} onClick={() => rundeBearbeiten(r)}>{stkText(r.stk)}</td>
              {werkzeuge.map((w) => (
                <td key={w.key} className={"wzb-x-zelle" + (darf ? " wzb-tipp" : "")} onClick={() => umschalten(r, w)}>
                  {hat(r, w) ? <span className="wzb-x" data-wzbx="">X</span> : ""}</td>))}
              <td className="wzb-links klein">{(r.zeilen[0] && r.zeilen[0].notiz) || ""}</td>
              <td className="wzb-vis">{visum(r.person)}</td>
              {darf && <td className="wzb-weg"><button type="button" className="wz-weg" data-wzbweg="" title="Wechsel löschen"
                aria-label={"Wechsel vom " + datum(r.wann) + " löschen"} onClick={() => rundeWeg(r)}><Eimer /></button></td>}
            </tr>))}
          {darf && <tr className="wzb-neu">
            <td colSpan="2"><b>Neu</b></td>
            {werkzeuge.map((w) => (
              <td key={w.key} className="wzb-x-zelle wzb-tipp" data-wzbneu={w.key} onClick={() => neuUmschalten(w)}>
                {neu.includes(w.key) ? <span className="wzb-haken">✓</span> : ""}</td>))}
            <td colSpan="3"></td>
          </tr>}
        </tbody>
      </table>
    </div>
    {!runden.length && <p className="hinweis">Für diese HOCO Nr. ist noch kein Wechsel eingetragen.</p>}
    {knopf}
  </>);
}
