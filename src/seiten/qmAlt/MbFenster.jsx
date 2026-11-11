// =================================================================
//  Managementbewertung durchführen (seit 1.483.0, Wunsch Patrick
//  11. November 2026: „ähnlich einem durchzuführenden Audit“).
//
//  Ein grosses Fenster wie die Auditcheckliste. Je Kapitel nach ISO 9.3:
//  oben, was das HoferTool schon weiss (Listen des QMS und die
//  Produktionsstatistik), darunter die Fragen aus dem Katalog mit dem Wert
//  des Vorjahres, dann Gut / Handlungsbedarf / Kritisch, „Massnahmen
//  nötig?“ und eine Bemerkung mit Diktat. Am Schluss das Ergebnis (9.3.3):
//  neue Ziele, Massnahmen, Änderungs- und Ressourcenbedarf. Speichert von
//  selbst knapp eine Sekunde nach dem Tippen (daten.mb). „Abschliessen“
//  friert alles ein, legt Ziele und Massnahmen in ihre Listen, erstellt
//  den Bericht als PDF und gibt die Bewertung frei.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { DiktatKnopf } from "../../teile/Diktat.jsx";
import { eintragSpeichern, textSpeichern, jahresBild, heute } from "../../daten/qmAlt.js";
import {
  MB_KAPITEL, MB_BEWERTUNG, autoZeilen, mbFragenVon, mbFragenZuText, mbFragenAusText, wertText, vergleich, vorjahrWert, mbStand,
} from "../../daten/mbKatalog.js";
import { statistikLaden, statistikRechnen } from "../../daten/statistik.js";
import { STATISTIK_AB } from "../Statistik.jsx";

let jetztSpeichern = null;

export async function mbOeffnen(b0, texte, alle, neu) {
  const { data, error } = await alt.db.from("qma_eintraege").select("*").eq("id", b0.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  const b = (data && data[0]) || b0;
  fensterOeffnen((zu) => <MbFenster b={b} texte={texte} alle={alle} neu={neu} zu={zu} />,
    () => { if (jetztSpeichern) jetztSpeichern(); jetztSpeichern = null; neu(); }, "qma-ck-huelle");
}

// Produktionsstatistik des Jahres; sie zählt erst ab STATISTIK_AB und nie den heutigen Tag
export async function produktionJahr(jahr) {
  const gestern = alt.plusTage(heute(), -1);
  const von = [jahr + "-01-01", STATISTIK_AB].sort()[1];
  const bis = [jahr + "-12-31", gestern].sort()[0];
  if (von > bis) return { leer: true, ab: STATISTIK_AB };
  const r = statistikRechnen(await statistikLaden(von, bis));
  return { von, bis, ab: STATISTIK_AB, gesamt: r.gesamt, maschinen: r.maschinen.length, leer: !r.gesamt.stk };
}

const leer = () => ({ antworten: {}, kapitel: {}, ziele: [], massnahmen: [], aenderung: "", ressourcen: "" });

function MbFenster({ b, texte, alle, neu, zu }) {
  const d0 = b.daten || {};
  const jahr = Number(d0.jahr);
  const p = alt.profil || {};
  const [mb, setMb] = useState(() => ({ ...leer(), ...(d0.mb || {}),
    kopf: { datum: d0.datum || heute(), teilnehmer: d0.teilnehmer || "", ersteller: p.full_name || "", ...((d0.mb || {}).kopf || {}) } }));
  const [fragen, setFragen] = useState(() => ((d0.mb || {}).abgeschlossen_am && (d0.mb || {}).fragen) || mbFragenVon(texte));
  const [prod, setProd] = useState(null);
  const [prodFehler, setProdFehler] = useState("");
  const [stand, setStand] = useState("");
  const [arbeitet, setArbeitet] = useState(false);
  const daten = useRef({ ...d0 });
  const uhr = useRef(null);
  const zuletzt = useRef(mb);
  const gesperrt = !!mb.abgeschlossen_am;
  const vorBew = alle.find((e) => e.art === "bewertung" && Number(e.daten.jahr) === jahr - 1);
  const vorjahr = (f) => vorjahrWert(f, vorBew);

  useEffect(() => {
    if (gesperrt) return;
    let weg = false;
    produktionJahr(jahr).then((x) => !weg && setProd(x)).catch((f) => !weg && setProdFehler(alt.fehlertext(f)));
    return () => { weg = true; };
  }, []);

  const speichern = async () => {
    clearTimeout(uhr.current); uhr.current = null; jetztSpeichern = null;
    daten.current = { ...daten.current, mb: zuletzt.current };
    const { error } = await alt.db.from("qma_eintraege").update({ daten: daten.current, geaendert_am: new Date().toISOString() }).eq("id", b.id);
    if (error) { setStand("nicht gespeichert"); alt.meldung(alt.fehlertext(error), "fehler"); } else setStand("gespeichert");
  };
  const aendern = (fn) => {
    if (gesperrt) return;
    setMb((x) => { const n = fn(x); zuletzt.current = n; return n; });
    setStand("…");
    clearTimeout(uhr.current);
    uhr.current = setTimeout(speichern, 800);
    jetztSpeichern = speichern;
  };
  const antwort = (id, wert) => aendern((m) => ({ ...m, antworten: { ...m.antworten, [id]: { wert } } }));
  const kap = (id, teil) => aendern((m) => ({ ...m, kapitel: { ...m.kapitel, [id]: { ...(m.kapitel[id] || {}), ...teil } } }));
  const kopf = (k, w) => aendern((m) => ({ ...m, kopf: { ...m.kopf, [k]: w } }));
  const liste = (k, i, teil) => aendern((m) => ({ ...m, [k]: m[k].map((z, j) => (j === i ? { ...z, ...teil } : z)) }));
  const dazu = (k) => aendern((m) => ({ ...m, [k]: [...(m[k] || []), {}] }));
  const weg = (k, i) => aendern((m) => ({ ...m, [k]: m[k].filter((_, j) => j !== i) }));

  const ctx = { eintraege: alle, jahr, bew: b, prod, prodFehler };
  const autoVon = (kid) => (gesperrt && mb.auto ? mb.auto[kid] || [] : autoZeilen(kid, ctx));
  const st = mbStand(mb, fragen);

  const fragenAendern = async () => {
    const w = await alt.dialogFelder({
      titel: "Fragekatalog der Managementbewertung",
      felder: [{ name: "text", typ: "textarea", zeilen: 20, wert: mbFragenZuText(fragen),
        label: "„## Kapitel“ und darunter eine Frage je Zeile: Frage | Art (zahl, chf, prozent, text) | Einheit | Hilfe. Gleiche Fragen behalten ihre Antworten und den Vergleich zum Vorjahr." }],
      bestaetigen: "Speichern",
    });
    if (!w) return;
    const neue = mbFragenAusText(w.text, fragen);
    try {
      await textSpeichern("bewertung:fragen", { gruppe: "einstellung", titel: "Fragekatalog Managementbewertung", norm: "9.3", felder: { fragen: neue } },
        "Ändern: Fragekatalog Managementbewertung");
      setFragen(neue);
      alt.meldung("Fragen gespeichert.", "gut");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  const abschliessen = async () => {
    const offen = MB_KAPITEL.filter((k) => !(mb.kapitel[k.id] || {}).b);
    const ziele = (mb.ziele || []).filter((z) => String(z.titel || "").trim() && !z.angelegt);
    const ms = (mb.massnahmen || []).filter((z) => String(z.titel || "").trim() && !z.angelegt);
    const ok = await alt.nachfragen({
      titel: "Managementbewertung " + jahr + " abschliessen",
      text: <span className="qma-ap-zuordnung">
        <span>{st.kapitel} von {MB_KAPITEL.length} Kapiteln bewertet, {st.fragen} von {fragen.length} Fragen beantwortet.</span>
        {offen.length ? <span className="qma-ap-zuordnung__ohne">Noch nicht bewertet: {offen.map((k) => k.titel).join(", ")}</span> : null}
        {ziele.length ? <span>{ziele.length} neue Ziel(e) kommen in die Liste Qualitätsziele {jahr + 1}.</span> : null}
        {ms.length ? <span>{ms.length} Massnahme(n) kommen in die Liste Abweichungen und Verbesserungen.</span> : null}
        <span>Die Zahlen werden eingefroren, die App erstellt den Bericht als PDF und gibt die Bewertung frei.</span>
      </span>,
      bestaetigen: "Abschliessen",
    });
    if (!ok) return;
    setArbeitet(true);
    try {
      if (uhr.current) await speichern();
      let p2 = prod;
      if (!p2) { try { p2 = await produktionJahr(jahr); } catch (f) { p2 = null; } }
      const c2 = { ...ctx, prod: p2 };
      const auto = Object.fromEntries(MB_KAPITEL.map((k) => [k.id, autoZeilen(k.id, c2)]));
      let l = [...alle];
      const neuId = async (art, dd, status) => {
        const id = await eintragSpeichern(art, null, dd, status, l);
        l = [...l, { art, nr: Math.max(0, ...l.filter((x) => x.art === art).map((x) => x.nr || 0)) + 1, id }];
        return id;
      };
      const zieleNeu = [];
      for (const z of mb.ziele || []) {
        if (!String(z.titel || "").trim() || z.angelegt) { zieleNeu.push(z); continue; }
        const id = await neuId("ziel", { jahr: jahr + 1, titel: z.titel.trim(), messung: z.messung || null, zielwert: z.zielwert || null,
          wer: z.wer || null, termin: z.termin || null, herkunft: b.id }, "offen");
        zieleNeu.push({ ...z, angelegt: id });
      }
      const msNeu = [];
      for (const z of mb.massnahmen || []) {
        if (!String(z.titel || "").trim() || z.angelegt) { msNeu.push(z); continue; }
        const id = await neuId("abweichung", { quelle: "bewertung", typ: "verbesserung", datum: mb.kopf.datum || heute(), titel: z.titel.trim(),
          massnahme: z.titel.trim(), wer: z.wer || null, termin: z.termin || null, herkunft: b.id }, "offen");
        msNeu.push({ ...z, angelegt: id });
      }
      const fertig = { ...mb, ziele: zieleNeu, massnahmen: msNeu, auto, fragen, abgeschlossen_am: new Date().toISOString() };
      const { mbPdf } = await import("./mbPdf.js");
      const blob = await mbPdf({ ...b, daten: daten.current }, fertig, fragen, vorjahr);
      const name = jahr + "_Managementbewertung.pdf";
      const pfad = "qm/bewertungen/" + b.id + "/" + Date.now() + "-" + name;
      const up = await alt.db.storage.from("zeichnungen").upload(pfad, new File([blob], name, { type: "application/pdf" }), { contentType: "application/pdf", upsert: false });
      if (up.error) throw up.error;
      const url = alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
      const dd = { ...daten.current, mb: fertig, datum: mb.kopf.datum || heute(), teilnehmer: mb.kopf.teilnehmer || null,
        bericht_url: url, bericht_pfad: pfad, bericht_name: name, schnapp: jahresBild(alle, jahr),
        freigegeben_am: new Date().toISOString(), freigegeben_von: p.full_name || "" };
      await eintragSpeichern("bewertung", b, dd, "freigegeben", l);
      jetztSpeichern = null;
      alt.meldung("Managementbewertung abgeschlossen, Bericht erstellt.", "gut");
      zu();
      alt.betrachter(url, "Managementbewertung " + jahr, true);
    } catch (f) {
      setArbeitet(false);
      alt.meldung(alt.fehlertext(f), "fehler");
    }
  };

  const springen = (id) => { const x = document.getElementById("mb-k-" + id); if (x) x.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <div className="dialog dialog--breit qma-ck qma-mb" id="qma-mb">
      <div className="blatt__kopf qma-ck__kopf">
        <h2>Managementbewertung {jahr} <span className="klein">ISO 9001:2026 Kapitel 9.3 · Zeitraum 01.01.–31.12.{jahr}</span></h2>
        <span className="klein qma-ck__stand" id="qma-mb-stand">{st.kapitel} / {MB_KAPITEL.length} Kapitel bewertet{stand ? " · " + stand : ""}</span>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      <div className="qma-ck__rolle">
        {gesperrt && <div className="qma-ck__fertig" id="qma-mb-fertig">
          ✓ Abgeschlossen am {alt.kurzDatum(mb.abgeschlossen_am.slice(0, 10))}
          {d0.bericht_url && <button className="knopf knopf--klein" onClick={() => alt.betrachter(d0.bericht_url, "Managementbewertung " + jahr, true)}>📄 Bericht</button>}
          <span className="klein">„Wieder bearbeiten“ im Reiter Managementbewertung, danach nochmals abschliessen.</span>
        </div>}
        <div className="qma-ck__felder">
          <label>Datum<input type="date" value={mb.kopf.datum || ""} disabled={gesperrt} data-qmambkopf="datum" onChange={(ev) => kopf("datum", ev.target.value)} /></label>
          <label>Geschäftsleitung / Teilnehmer<input value={mb.kopf.teilnehmer || ""} disabled={gesperrt} data-qmambkopf="teilnehmer" onChange={(ev) => kopf("teilnehmer", ev.target.value)} /></label>
          <label>Erstellt von<input value={mb.kopf.ersteller || ""} disabled={gesperrt} data-qmambkopf="ersteller" onChange={(ev) => kopf("ersteller", ev.target.value)} /></label>
        </div>
        <div className="qma-mb__sprung">
          {MB_KAPITEL.map((k, i) => {
            const a = mb.kapitel[k.id] || {};
            return <button key={k.id} type="button" className={"qma-mb__chip" + (a.b ? " qma-mb__chip--" + a.b : "")} title={k.titel} onClick={() => springen(k.id)}>{i + 1}</button>;
          })}
          <button type="button" className="qma-mb__chip" onClick={() => springen("ergebnis")}>Ergebnis</button>
        </div>
        {!fragen.length && <p className="hinweis" id="qma-mb-ohne-fragen">Noch kein Fragekatalog hinterlegt. Mit „Fragen ändern“ unten anlegen.</p>}

        {MB_KAPITEL.map((k, i) => {
          const a = mb.kapitel[k.id] || {};
          const auto = autoVon(k.id);
          const fr = fragen.filter((f) => f.kapitel === k.id);
          return (
            <section key={k.id} className={"qma-mb__kapitel" + (a.b ? " qma-mb__kapitel--" + a.b : "")} id={"mb-k-" + k.id} data-qmambkap={k.id}>
              <h3><span className="qma-ck__nr">{i + 1}</span> {k.titel} <span className="qma-ck__norm">{k.norm}</span></h3>
              {!!auto.length && <div className="qma-mb__auto">
                <div className="klein">Aus dem HoferTool</div>
                <table><tbody>{auto.map(([t, w, z], n) => <tr key={n}><td>{t}</td><td><b>{w}</b></td><td className="klein">{z}</td></tr>)}</tbody></table>
              </div>}
              {fr.map((f) => {
                const w = (mb.antworten[f.id] || {}).wert || "";
                const v = vorjahr(f);
                if (f.art === "text") return (
                  <label key={f.id} className="qma-mb__frage" data-qmambfrage={f.id}>
                    <span>{f.text}{f.hilfe ? <span className="klein"> · {f.hilfe}</span> : null}</span>
                    {v ? <span className="klein qma-mb__vor">{jahr - 1}: {String(v).slice(0, 160)}{String(v).length > 160 ? " …" : ""}</span> : null}
                    <TextFeld gesperrt={gesperrt} wert={w} setzen={(t) => antwort(f.id, t)} data={{ "data-qmambwert": f.id }} />
                  </label>);
                return (
                  <label key={f.id} className="qma-mb__frage qma-mb__frage--zahl" data-qmambfrage={f.id}>
                    <span>{f.text}{f.hilfe ? <span className="klein"> · {f.hilfe}</span> : null}</span>
                    <span className="qma-mb__zahl">
                      <input inputMode="decimal" value={w} disabled={gesperrt} data-qmambwert={f.id} onChange={(ev) => antwort(f.id, ev.target.value)}
                        placeholder={f.art === "chf" ? "CHF" : f.art === "prozent" ? "%" : f.einheit || ""} />
                      <span className="klein">{f.art === "chf" ? "CHF" : f.art === "prozent" ? "%" : f.einheit}</span>
                      <span className="klein qma-mb__vor">{v ? jahr - 1 + ": " + wertText(f, v) : ""}{vergleich(f, w, v) ? " · " + vergleich(f, w, v) : ""}</span>
                    </span>
                  </label>);
              })}
              <div className="qma-mb__wertung">
                <div className="qma-ck__wahl" role="group" aria-label="Bewertung">
                  {MB_BEWERTUNG.map(([wv, t, ton]) => (
                    <button key={wv} type="button" disabled={gesperrt} data-qmambb={wv}
                      className={"qma-ck__b qma-mb__b--" + ton + (a.b === wv ? " qma-ck__b--an" : "")}
                      onClick={() => kap(k.id, { b: a.b === wv ? null : wv })}>{t}</button>))}
                </div>
                <div className="qma-ck__wahl qma-mb__mass" role="group" aria-label="Massnahmen nötig?">
                  <span className="klein">Massnahmen nötig?</span>
                  {[["nein", "Nein"], ["ja", "Ja"]].map(([wv, t]) => (
                    <button key={wv} type="button" disabled={gesperrt} data-qmambm={wv}
                      className={"qma-ck__b" + (a.m === wv ? " qma-ck__b--an" : "")} onClick={() => kap(k.id, { m: a.m === wv ? null : wv })}>{t}</button>))}
                </div>
              </div>
              <TextFeld gesperrt={gesperrt} wert={a.text} setzen={(t) => kap(k.id, { text: t })} ph={a.m === "ja" ? "Was ist zu tun? Unten bei Massnahmen eintragen." : "Bewertung, Bemerkung …"}
                data={{ "data-qmambtext": k.id }} />
            </section>);
        })}

        <section className="qma-mb__kapitel" id="mb-k-ergebnis">
          <h3>Ergebnis der Bewertung <span className="qma-ck__norm">9.3.3</span></h3>
          <div className="klein">Neue Ziele {jahr + 1} (kommen beim Abschliessen in die Liste Qualitätsziele)</div>
          <MbListe zeilen={mb.ziele} gesperrt={gesperrt} spalten={[["titel", "Ziel", 3], ["messung", "Messgrösse", 2], ["zielwert", "Zielwert", 1], ["wer", "Wer", 1], ["termin", "Bis", 1, "date"]]}
            setzen={(i, t) => liste("ziele", i, t)} dazu={() => dazu("ziele")} weg={(i) => weg("ziele", i)} knopf="+ Ziel" id="qma-mb-ziele" />
          <div className="klein">Verbesserungen und Massnahmen (kommen in die Liste Abweichungen und Verbesserungen)</div>
          <MbListe zeilen={mb.massnahmen} gesperrt={gesperrt} spalten={[["titel", "Massnahme", 4], ["wer", "Wer", 1], ["termin", "Bis", 1, "date"]]}
            setzen={(i, t) => liste("massnahmen", i, t)} dazu={() => dazu("massnahmen")} weg={(i) => weg("massnahmen", i)} knopf="+ Massnahme" id="qma-mb-massnahmen" />
          <label className="qma-mb__frage"><span>Änderungsbedarf am QM-System</span>
            <TextFeld gesperrt={gesperrt} wert={mb.aenderung} setzen={(t) => aendern((m) => ({ ...m, aenderung: t }))} data={{ "data-qmambergebnis": "aenderung" }} /></label>
          <label className="qma-mb__frage"><span>Bedarf an Ressourcen</span>
            <TextFeld gesperrt={gesperrt} wert={mb.ressourcen} setzen={(t) => aendern((m) => ({ ...m, ressourcen: t }))} data={{ "data-qmambergebnis": "ressourcen" }} /></label>
        </section>
      </div>
      <div className="qma-ck__fuss">
        {!gesperrt && <button className="knopf" id="qma-mb-fragen" onClick={fragenAendern}>Fragen ändern</button>}
        <span className="klein">{st.fragen} / {fragen.length} Fragen · {st.massnahmen} Kapitel mit Massnahmen</span>
        {!gesperrt && <button className="knopf knopf--haupt" id="qma-mb-ab" disabled={arbeitet} onClick={abschliessen}>
          {arbeitet ? "Bericht wird erstellt …" : "Abschliessen und Bericht erstellen"}</button>}
      </div>
    </div>
  );
}

// Ausserhalb der Komponente, sonst verliert das Feld bei jedem Tippen den Fokus
function TextFeld({ wert, setzen, zeilen = 2, ph, data, gesperrt }) {
  return (
    <div className="qma-ck__textfeld">
      <textarea rows={zeilen} value={wert || ""} disabled={gesperrt} placeholder={ph} {...data} onChange={(ev) => setzen(ev.target.value)} />
      <DiktatKnopf wert={wert || ""} gesperrt={gesperrt} setzen={setzen} />
    </div>);
}

function MbListe({ zeilen, spalten, setzen, dazu, weg, gesperrt, knopf, id }) {
  return (
    <div className="qma-mb__liste" id={id}>
      {(zeilen || []).map((z, i) => (
        <div key={i} className="qma-mb__zeile" style={{ gridTemplateColumns: spalten.map((s) => s[2] + "fr").join(" ") + " auto" }}>
          {spalten.map(([k, t, , typ]) => <input key={k} type={typ || "text"} placeholder={t} value={z[k] || ""} disabled={gesperrt || !!z.angelegt}
            data-qmambliste={k} onChange={(ev) => setzen(i, { [k]: ev.target.value })} />)}
          {z.angelegt ? <span className="klein" title="schon in der Liste">✓</span>
            : !gesperrt ? <button type="button" className="chipweg" title="entfernen" onClick={() => weg(i)}>×</button> : <span />}
        </div>))}
      {!gesperrt && <button type="button" className="knopf knopf--klein" onClick={dazu}>{knopf}</button>}
    </div>);
}
