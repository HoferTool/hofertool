// =================================================================
//  QM alternativ (seit 1.463.0, Wunsch Patrick 10. November 2026: „neuer
//  Reiter QM alternativ … unternehmensbezogenes QM-System, mindestens
//  für eine Zertifizierung, ISO 9001:2026 kompatibel, praxisbezogen“)
//
//  Unabhängig vom Reiter QM. Sichtbar nur mit dem Vermerk qmSehen, nie
//  für Externe (die Datenbank prüft dasselbe mit qm_darf()).
//  Aufbau und Regeln in src/daten/qmAlt.js, Inhalte nur in der Datenbank.
//
//  Reiter: Cockpit (was fällig ist, Normabdeckung fürs Audit), Handbuch
//  (Abschnitte und Prozesse), Ziele, Abweichungen, Risiken, Prüfmittel,
//  Lieferanten, Kompetenzen (Matrix und Schulungen), Audits,
//  Managementbewertung (Zahlen kommen von selbst aus den Listen).
// =================================================================
import { useState } from "react";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import { Reiter } from "../teile/Reiter.jsx";
import { useSeitenSuche } from "../teile/seitenSuche.js";
import { teilMerken } from "../teile/wiederherstellen.js";
import {
  ARTEN, qmaLaden, fehltQma, statusVon, istZu, auswahlText, risikoWert, lieferantNote,
  faelligTon, eintragSpeichern, eintragLoeschen, normPruefen, heute, plusTageIso,
} from "../daten/qmAlt.js";
import Handbuch from "./qmAlt/Handbuch.jsx";
import Kompetenz from "./qmAlt/Kompetenz.jsx";
import Bewertung from "./qmAlt/Bewertung.jsx";
import { Schild } from "./qmAlt/Schild.jsx";

const REITER = [["cockpit", "Cockpit"], ["handbuch", "Handbuch"], ["ziel", "Ziele"], ["abweichung", "Abweichungen"],
  ["risiko", "Risiken"], ["pruefmittel", "Prüfmittel"], ["lieferant", "Lieferanten"], ["kompetenz", "Kompetenzen"],
  ["audit", "Audits"], ["bewertung", "Managementbewertung"]];

const gemerkt = { reiter: "cockpit", filter: {} };
teilMerken("qmalt", () => ({ ...gemerkt }), (x) => { Object.assign(gemerkt, x); });

export default function QmAlternativ({ auffrischen }) {
  const [reiter, setReiter] = useState(gemerkt.reiter);
  useGemerkt(gemerkt, { reiter });
  const d = useDaten(qmaLaden, [auffrischen]);

  useSeitenSuche({
    name: "QM alternativ", platzhalter: "Eintrag, Prozess, Abschnitt …",
    eintraege: () => !d.daten ? [] : [
      ...d.daten.eintraege.filter((e) => ARTEN[e.art]).map((e) => ({
        gruppe: ARTEN[e.art].titel, zeichen: "•", titel: e.titel || "ohne Titel",
        zeile: statusVon(e.art, e.status).text, id: e.id, art: e.art })),
      ...Object.values(d.daten.texte).filter((t) => t.titel && t.gruppe !== "entwurf").map((t) => ({
        gruppe: "Handbuch", zeichen: "§", titel: t.titel, zeile: t.norm ? "ISO " + t.norm : "", id: t.schluessel, art: "handbuch" })),
    ],
    springen: (x) => {
      setReiter(x.art);
      const e = d.daten.eintraege.find((y) => y.id === x.id);
      if (e) eintragDialog(e.art, e, d.daten.eintraege, d.neu);
    },
  });

  let inhalt;
  if (d.fehler && !d.daten) {
    inhalt = <div className="karte karte--fehler"><p>{fehltQma(d.fehler)
      ? "Es fehlen noch die Tabellen aus sql/qm-alternativ.sql in Supabase." : alt.fehlertext(d.fehler)}</p></div>;
  } else if (!d.daten) {
    inhalt = <div className="laedt">Wird geladen …</div>;
  } else if (reiter === "cockpit") inhalt = <Cockpit daten={d.daten} neu={d.neu} gehe={setReiter} />;
  else if (reiter === "handbuch") inhalt = <Handbuch daten={d.daten} neu={d.neu} gehe={setReiter} />;
  else if (reiter === "kompetenz") inhalt = <Kompetenz daten={d.daten} neu={d.neu} liste={<Liste art="schulung" daten={d.daten} neu={d.neu} />} />;
  else if (reiter === "bewertung") inhalt = <Bewertung daten={d.daten} neu={d.neu} eintragDialog={eintragDialog} />;
  else inhalt = <Liste art={reiter} daten={d.daten} neu={d.neu} />;

  return (<>
    <h1 className="seitentitel">QM alternativ</h1>
    <Reiter reiter={REITER} aktiv={reiter} waehlen={setReiter} merkmal="qmareiter" />
    <div id="qma-inhalt" data-qma={reiter}>{inhalt}</div>
  </>);
}

// ---------- Kleinteile ----------
const datum = (x) => (x ? alt.kurzDatum(x) : "");

// ---------- Cockpit ----------
const STAND = { ok: ["gruen", "erfüllt"], warn: ["gelb", "prüfen"], fehlt: ["rot", "fehlt"], na: ["grau", "nicht anwendbar"] };

function Cockpit({ daten, neu, gehe }) {
  const h = heute();
  const bald = plusTageIso(h, 30);
  const faellig = daten.eintraege
    .filter((e) => ARTEN[e.art] && !istZu(e) && e.faellig && e.faellig <= bald)
    .sort((a, b) => (a.faellig < b.faellig ? -1 : 1));
  const norm = normPruefen(daten.texte, daten.eintraege);
  const zaehl = (s) => norm.filter((n) => n.stand === s).length;
  const kacheln = ["abweichung", "ziel", "risiko", "pruefmittel", "lieferant", "schulung", "audit"].map((art) => {
    const alle = daten.eintraege.filter((e) => e.art === art);
    return { art, titel: ARTEN[art].titel, offen: alle.filter((e) => !istZu(e)).length,
      ueber: alle.filter((e) => !istZu(e) && e.faellig && e.faellig < h).length, alle: alle.length };
  });

  return (<>
    <section className="karte" id="qma-faellig">
      <div className="karte__kopf"><h2>Was ist zu tun</h2></div>
      {!faellig.length
        ? <p className="hinweis" id="qma-nichts">Nichts fällig in den nächsten 30 Tagen.</p>
        : <ul className="qma-todo">
            {faellig.map((e) => {
              const ton = faelligTon(e);
              return (
                <li key={e.id} data-qmafaellig={e.id} className="qma-todo__zeile"
                  onClick={() => eintragDialog(e.art, e, daten.eintraege, neu)}>
                  <Schild ton={ton === "rot" ? "rot" : "gelb"}>{ton === "rot" ? "überfällig" : "bald"} {datum(e.faellig)}</Schild>
                  <span className="qma-todo__art">{ARTEN[e.art].einzeln}</span>
                  <b>{e.titel}</b>
                  {e.daten.wer ? <span className="klein">{e.daten.wer}</span> : null}
                </li>);
            })}
          </ul>}
    </section>

    <div className="qma-kacheln">
      {kacheln.map((k) => (
        <button key={k.art} className="qma-kachel" data-qmakachel={k.art} onClick={() => gehe(k.art === "schulung" ? "kompetenz" : k.art)}>
          <span className="qma-kachel__titel">{k.titel}</span>
          <span className="qma-kachel__zahl">{k.offen}</span>
          <span className="klein">{k.alle ? "offen von " + k.alle : "noch nichts erfasst"}</span>
          {k.ueber ? <Schild ton="rot">{k.ueber} überfällig</Schild> : null}
        </button>))}
    </div>

    <section className="karte" id="qma-norm">
      <div className="karte__kopf"><h2>Normabdeckung ISO 9001</h2>
        <span className="klein">{zaehl("ok")} erfüllt · {zaehl("warn")} prüfen · {zaehl("fehlt")} fehlt</span></div>
      <p className="hinweis">Für das Audit: wo wir jedes Kapitel erfüllen. Was das HoferTool schon führt, ist der Nachweis und wird hier nicht doppelt geführt.</p>
      <div className="qm-tabelle-huelle"><table className="tabelle qm-tabelle">
        <thead><tr><th>Kapitel</th><th>Thema</th><th>Wo erfüllt</th><th>Stand</th></tr></thead>
        <tbody>
          {norm.map((n) => (
            <tr key={n.norm} data-qmanorm={n.norm} data-stand={n.stand}>
              <td className="qm-nowrap">{n.norm}</td>
              <td>{n.titel}</td>
              <td>{n.wo}{n.prozesse && n.prozesse.length ? <div className="klein qma-norm-prozesse">Prozesse: {n.prozesse
                .map((p) => (p.felder && p.felder.nr ? p.felder.nr + " " : "") + p.titel).join(", ")}</div> : null}</td>
              <td><Schild ton={STAND[n.stand][0]}>{STAND[n.stand][1]}</Schild>
                {n.stand !== "ok" && n.stand !== "na" && n.tipp ? <div className="klein">{n.tipp}</div> : null}</td>
            </tr>))}
        </tbody>
      </table></div>
    </section>
  </>);
}

// ---------- Eine Liste ----------
const FILTER = [["offen", "Offen"], ["alle", "Alle"]];

export function Liste({ art, daten, neu }) {
  const cfg = ARTEN[art];
  const [filter, setFilter] = useState(gemerkt.filter[art] || "offen");
  const alle = daten.eintraege.filter((e) => e.art === art);
  const zeigen = alle.filter((e) => filter === "alle" || !istZu(e))
    .sort((a, b) => ((a.faellig || "9") < (b.faellig || "9") ? -1 : (a.faellig || "9") > (b.faellig || "9") ? 1 : (b.nr || 0) - (a.nr || 0)));
  const waehlen = (f) => { gemerkt.filter = { ...gemerkt.filter, [art]: f }; setFilter(f); };

  return (
    <section className="karte" id={"qma-" + art}>
      <div className="karte__kopf">
        <h2>{cfg.titel} <span className="klein">ISO {cfg.norm}</span></h2>
        <button className="knopf knopf--haupt" data-qmaneu={art}
          onClick={() => eintragDialog(art, null, daten.eintraege, neu)}>+ {cfg.einzeln}</button>
      </div>
      <p className="hinweis">{cfg.hinweis}</p>
      <div className="qm-filter" role="group">
        {FILTER.map(([w, t]) => (
          <button key={w} className={"knopf knopf--klein" + (filter === w ? " knopf--haupt" : "")} data-qmafilter={w}
            onClick={() => waehlen(w)}>{t} <span className="klein">({alle.filter((e) => w === "alle" || !istZu(e)).length})</span></button>))}
      </div>
      {!zeigen.length
        ? <p className="hinweis" data-qmaleer={art}>{alle.length ? "Hier steht gerade nichts offen." : "Noch nichts erfasst."}</p>
        : <div className="qm-tabelle-huelle"><table className="tabelle qm-tabelle qma-tabelle">
            <thead><tr>{cfg.spalten.map(([k, t]) => <th key={k}>{t}</th>)}<th /></tr></thead>
            <tbody>
              {zeigen.map((e) => (
                <tr key={e.id} data-qmaeintrag={e.id} className="qm-zeile" onClick={() => eintragDialog(art, e, daten.eintraege, neu)}>
                  {cfg.spalten.map(([k]) => <td key={k}><Zelle art={art} e={e} k={k} /></td>)}
                  <td className="qm-nowrap" onClick={(ev) => ev.stopPropagation()}>
                    {cfg.schnell && <button className="knopf knopf--klein" data-qmaschnell={e.id}
                      onClick={() => schnell(art, e, daten.eintraege, neu)}>{cfg.schnell.text}</button>}
                    {art === "audit" && e.status === "durchgefuehrt" && String(e.daten.feststellungen || "").trim() && !e.daten.uebertragen &&
                      <button className="knopf knopf--klein" data-qmaueber={e.id}
                        onClick={() => feststellungenUebertragen(e, daten.eintraege, neu)}>→ Abweichungen</button>}
                    <button className="chipweg" title="löschen" data-qmaweg={e.id} onClick={() => loeschen(e, neu)}>×</button>
                  </td>
                </tr>))}
            </tbody>
          </table></div>}
    </section>
  );
}

function Zelle({ art, e, k }) {
  const d = e.daten || {};
  if (k === "nr") return <span>{e.nr}</span>;
  if (k === "status") { const s = statusVon(art, e.status); return <Schild ton={s.ton} data-status={e.status}>{s.text}</Schild>; }
  if (k === "faellig") {
    const ton = faelligTon(e);
    return e.faellig ? <span className={ton === "rot" ? "qm-spaet" : ton === "gelb" ? "qma-bald" : ""}>{datum(e.faellig)}</span> : null;
  }
  if (k === "wert") {
    const w = risikoWert(d);
    return <Schild ton={d.typ === "chance" ? "blau" : w >= 6 ? "rot" : w >= 4 ? "gelb" : "gruen"}>{d.w} × {d.a} = {w}</Schild>;
  }
  if (k === "note") { const n = lieferantNote(d); return n ? <Schild ton={{ A: "gruen", B: "gelb", C: "rot" }[n]}>{n}</Schild> : null; }
  const f = ARTEN[art].felder.find((x) => x.k === k);
  const w = k === "titel" ? e.titel : d[k];
  if (f && f.auswahl) return <span>{auswahlText(art, k, w)}</span>;
  if (f && f.typ === "date") return <span className="qm-nowrap">{datum(w)}</span>;
  if (f && f.typ === "textarea") return <span className="qma-kurz">{w || ""}</span>;
  if (k === "titel") return <b>{w}</b>;
  return <span>{w == null || w === 0 ? "" : String(w)}</span>;
}

// ---------- Fenster für einen Eintrag ----------
export async function eintragDialog(art, e, alle, neu, vorgabe) {
  const cfg = ARTEN[art];
  if (!cfg) return;
  const v = e ? { ...e.daten, titel: e.titel } : { ...(vorgabe || {}) };
  const felder = cfg.felder.map((f) => {
    let wert = v[f.k];
    if (wert == null && !e) wert = typeof f.vorgabe === "function" ? f.vorgabe() : f.vorgabe;
    const feld = { name: f.k, label: f.text, pflicht: f.pflicht, platzhalter: f.platzhalter || "" };
    if (f.auswahl) return { ...feld, auswahl: f.auswahl, wert: String(wert ?? "") };
    if (f.typ === "textarea") return { ...feld, typ: "textarea", zeilen: f.zeilen || 3, wert: wert || "" };
    if (f.typ === "number") return { ...feld, typ: "number", wert: wert ?? "" };
    if (f.typ === "date") return { ...feld, typ: "date", wert: wert || "" };
    return { ...feld, wert: wert ?? "" };
  });
  felder.push({ name: "_status", label: "Status", auswahl: cfg.status.map((s) => [s.wert, s.text]),
    wert: (e && e.status) || (vorgabe && vorgabe._status) || cfg.status[0].wert });
  const w = await alt.dialogFelder({
    titel: e ? cfg.einzeln + (e.nr ? " " + e.nr : "") + ": " + (e.titel || "") : "Neu: " + cfg.einzeln,
    felder, bestaetigen: "Speichern",
  });
  if (!w) return;
  const daten = { ...(e ? e.daten : {}), ...(vorgabe && vorgabe._extra) };
  for (const f of cfg.felder) {
    let x = w[f.k];
    if (typeof x === "string") x = x.trim();
    if (f.typ === "number") x = x === "" || x == null || Number.isNaN(Number(x)) || (Number(x) === 0 && f.k !== "intervall") ? null : Number(x);
    if (f.typ === "date") x = /^\d{4}-\d{2}-\d{2}$/.test(x || "") ? x : null;
    daten[f.k] = x === "" ? null : x;
  }
  try {
    await eintragSpeichern(art, e, daten, w._status, alle);
    alt.meldung("Gespeichert.", "gut");
    neu();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

async function schnell(art, e, alle, neu) {
  const s = ARTEN[art].schnell;
  if (s.dialog) return eintragDialog(art, { ...e, daten: { ...e.daten, letzte: heute() } }, alle, neu);
  try {
    await eintragSpeichern(art, e, { ...e.daten, ...s.setzen() }, e.status === "gesperrt" ? "aktiv" : e.status || "aktiv", alle);
    alt.meldung("Eingetragen.", "gut");
    neu();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

async function loeschen(e, neu) {
  const ok = await alt.nachfragen({ titel: "Löschen", text: "„" + (e.titel || "") + "“ wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
  if (!ok) return;
  try { await eintragLoeschen(e); alt.meldung("Gelöscht."); neu(); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

// Auditfeststellungen als Abweichungen, je Zeile eine
async function feststellungenUebertragen(e, alle, neu) {
  const zeilen = String(e.daten.feststellungen || "").split("\n").map((z) => z.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);
  if (!zeilen.length) return;
  const ok = await alt.nachfragen({ titel: "In die Liste Abweichungen",
    text: zeilen.length + " Feststellung" + (zeilen.length === 1 ? "" : "en") + " kommen als offene Einträge in die Liste Abweichungen.", bestaetigen: "Übertragen" });
  if (!ok) return;
  try {
    let liste = [...alle];
    for (const z of zeilen) {
      const id = await eintragSpeichern("abweichung", null, {
        quelle: "audit", datum: e.daten.datum || heute(), titel: z, termin: plusTageIso(heute(), 30),
        partner: e.daten.auditor || null, herkunft: e.id }, "offen", liste);
      liste = [...liste, { art: "abweichung", nr: Math.max(0, ...liste.filter((x) => x.art === "abweichung").map((x) => x.nr || 0)) + 1, id }];
    }
    await eintragSpeichern("audit", e, { ...e.daten, uebertragen: true }, e.status, alle);
    alt.meldung("In die Liste Abweichungen übertragen.", "gut");
    neu();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}
