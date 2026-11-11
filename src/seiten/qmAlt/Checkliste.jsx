// =================================================================
//  Auditcheckliste (seit 1.469.0, Wunsch Patrick 10. November 2026:
//  „einfache Auditcheckliste nach ISO 9001:2026 für den Bereich Produktion
//  … eine Oberfläche, mit der ich das Audit durchführen kann, und nach
//  Abschluss automatisch den Bericht“)
//
//  Ein grosses Fenster zum Audit: Kopf (Datum, Auditor, Auditierte), je
//  Frage Erfüllt / Verbesserung / Abweichung / Nicht geprüft und eine
//  Bemerkung, dazu Stärken und Gesamteindruck. Speichert von selbst knapp
//  eine Sekunde nach dem Tippen am Audit (daten.checkliste). „Abschliessen“
//  macht den Bericht als PDF, hängt ihn ans Audit, setzt es auf
//  durchgeführt und legt die Feststellungen als offene Einträge in die
//  Liste Abweichungen. Die Fragen je Bereich stehen nur in der Datenbank
//  (qma_texte „checkliste:<Bereich>“), beim Abschluss friert das Audit sie ein.
// =================================================================
import { useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { qmDatum,
  CK_BEWERTUNG, checklisteFuer, fragenFuerRunde, checklisteAuswerten, fragenZuText, fragenAusText, eintragSpeichern, textSpeichern,
  auditBereiche, heute, plusTageIso, vorpunkteFuer, VP_BEWERTUNG, abwTyp,
} from "../../daten/qmAlt.js";
import { berichtDateiAblegen, berichtZeigen } from "./AuditPlan.jsx";
import { DiktatKnopf } from "../../teile/Diktat.jsx";

let jetztSpeichern = null;
const vpBewertet = (x) => !!(x && VP_BEWERTUNG.some((b) => b[0] === x.b));

export async function checklisteOeffnen(e0, texte, alle, neu) {
  // frisch holen, damit nichts überschrieben wird, was inzwischen gespeichert wurde
  const { data, error } = await alt.db.from("qma_eintraege").select("*").eq("id", e0.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  const e = (data && data[0]) || e0;
  const vorlage = checklisteFuer(texte, e, alle);
  if (!vorlage) { alt.meldung("Für diesen Bereich ist keine Checkliste hinterlegt.", "warn"); return; }
  fensterOeffnen((zu) => <CkFenster e={e} vorlage={vorlage} alle={alle} neu={neu} zu={zu} />,
    () => { if (jetztSpeichern) jetztSpeichern(); jetztSpeichern = null; neu(); }, "qma-ck-huelle");
}

function startwert(e) {
  const d = e.daten || {};
  const ck = d.checkliste || {};
  return {
    antworten: {}, vorpunkte: {}, staerken: "", fazit: "", ...ck,
    kopf: { datum: d.datum || heute(), auditor: d.auditor || "", auditiert: d.auditiert || "", ...(ck.kopf || {}) },
  };
}

function CkFenster({ e, vorlage, alle, neu, zu }) {
  const [ck, setCk] = useState(() => startwert(e));
  const [fragen, setFragen] = useState(vorlage.fragen);
  const [stand, setStand] = useState("");
  const [arbeitet, setArbeitet] = useState(false);
  const daten = useRef({ ...(e.daten || {}) });
  const uhr = useRef(null);
  const zuletzt = useRef(ck);
  const gesperrt = !!ck.abgeschlossen_am;

  const speichern = async () => {
    clearTimeout(uhr.current); uhr.current = null; jetztSpeichern = null;
    daten.current = { ...daten.current, checkliste: zuletzt.current };
    const { error } = await alt.db.from("qma_eintraege").update({ daten: daten.current, geaendert_am: new Date().toISOString() }).eq("id", e.id);
    if (error) { setStand("nicht gespeichert"); alt.meldung(alt.fehlertext(error), "fehler"); } else setStand("gespeichert");
  };
  const aendern = (fn) => {
    if (gesperrt) return;
    setCk((alt_) => {
      const n = fn(alt_);
      zuletzt.current = n;
      return n;
    });
    setStand("…");
    clearTimeout(uhr.current);
    uhr.current = setTimeout(speichern, 800);
    jetztSpeichern = speichern;
  };
  const antwort = (id, teil) => aendern((c) => ({ ...c, antworten: { ...c.antworten, [id]: { ...(c.antworten[id] || {}), ...teil } } }));
  const vp = (id, teil) => aendern((c) => ({ ...c, vorpunkte: { ...(c.vorpunkte || {}), [id]: { ...((c.vorpunkte || {})[id] || {}), ...teil } } }));
  // offene Punkte aus früheren Audits: nach dem Abschluss eingefroren
  const vorliste = ck.vorliste || vorpunkteFuer(e, vorlage.bereich, alle);
  const kopf = (k, w) => aendern((c) => ({ ...c, kopf: { ...c.kopf, [k]: w } }));

  const { zaehl } = checklisteAuswerten(fragen, ck.antworten);
  const beantwortet = fragen.length - zaehl.offen;

  const fragenAendern = async () => {
    if (!vorlage.schluessel) return;
    const w = await alt.dialogFelder({
      titel: "Fragen der Checkliste " + vorlage.bereich,
      felder: [{ name: "text", label: "Eine Frage je Zeile: Norm | Thema | Frage | Nachweis. Darunter je weitere Fassung (für spätere Audits) eine Zeile: > Frage | Nachweis. Antworten bleiben bei gleicher Frage erhalten.",
        typ: "textarea", zeilen: 18, wert: fragenZuText(vorlage.roh || fragen) }],
      bestaetigen: "Speichern",
    });
    if (!w) return;
    const neue = fragenAusText(w.text, vorlage.roh || fragen);
    if (!neue.length) { alt.meldung("Mindestens eine Frage.", "warn"); return; }
    try {
      await textSpeichern(vorlage.schluessel, { gruppe: "checkliste", titel: "Auditcheckliste " + vorlage.bereich, norm: "9.2",
        felder: { bereich: vorlage.bereich, fragen: neue } }, "Ändern: Checkliste " + vorlage.bereich);
      vorlage.roh = neue;
      setFragen(fragenFuerRunde(neue, vorlage.runde));
      alt.meldung("Fragen gespeichert.", "gut");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  const abschliessen = async () => {
    const aus = checklisteAuswerten(fragen, ck.antworten);
    const schon = new Set(ck.uebertragen || []);
    const neueF = aus.feststellungen.filter((f) => !schon.has(f.id));
    const ok = await alt.nachfragen({
      titel: "Audit abschliessen",
      text: <span className="qma-ap-zuordnung">
        <span>{aus.zaehl.ok} erfüllt · {aus.zaehl.v} Verbesserung · {aus.zaehl.a} Abweichung · {aus.zaehl.na + aus.zaehl.offen} nicht geprüft</span>
        {aus.zaehl.offen ? <span className="qma-ap-zuordnung__ohne">{aus.zaehl.offen} Frage(n) ohne Bewertung gelten als nicht geprüft.</span> : null}
        <span>Die App erstellt den Bericht als PDF, hängt ihn ans Audit und setzt es auf „Durchgeführt“.</span>
        {vorliste.length ? <span>Offene Punkte früherer Audits: {vorliste.filter((p) => vpBewertet((ck.vorpunkte || {})[p.id])).length} von {vorliste.length} geprüft.</span> : null}
        {neueF.length ? <span>{neueF.length} Feststellung(en) kommen als offene Einträge in die Liste Abweichungen.</span> : null}
      </span>,
      bestaetigen: "Abschliessen",
    });
    if (!ok) return;
    setArbeitet(true);
    try {
      if (uhr.current) await speichern();
      const k = ck.kopf || {};
      const vpa = ck.vorpunkte || {};
      const vpNeu = vorliste.filter((p) => p.art === "feststellung" && ["teil", "offen"].includes((vpa[p.id] || {}).b) && !schon.has("vp:" + p.id));
      const fertig = { ...ck, fragen, runde: vorlage.runde || 0, bereich: vorlage.bereich, abgeschlossen_am: new Date().toISOString(), vorliste,
        uebertragen: [...schon, ...neueF.map((f) => f.id), ...vpNeu.map((p) => "vp:" + p.id)] };
      const audit = { ...e, daten: daten.current };
      const { berichtPdf } = await import("./checklistePdf.js");
      const blob = await berichtPdf(audit, fertig, fragen);
      const name = (k.datum || heute()) + "_Internes_Audit_" + vorlage.bereich.replace(/\s+/g, "_") + ".pdf";
      const bericht = await berichtDateiAblegen(e, new File([blob], name, { type: "application/pdf" }));
      let liste = [...alle];
      for (const f of neueF) {
        const id = await eintragSpeichern("abweichung", null, {
          quelle: "audit", typ: f.art === "a" ? "abweichung" : "verbesserung", datum: k.datum || heute(), titel: f.text, termin: plusTageIso(heute(), 30),
          partner: k.auditor || null, herkunft: e.id }, "offen", liste);
        liste = [...liste, { art: "abweichung", nr: Math.max(0, ...liste.filter((x) => x.art === "abweichung").map((x) => x.nr || 0)) + 1, id }];
      }
      // Feststellungen des letzten Audits, die noch nicht erledigt sind, kommen in die Liste
      for (const p of vpNeu) {
        const x = vpa[p.id] || {};
        const id = await eintragSpeichern("abweichung", null, {
          quelle: "audit", typ: abwTyp({ daten: { titel: p.text, quelle: "audit" } }), datum: k.datum || heute(), titel: "Offen aus " + p.audit + ": " + p.text, termin: plusTageIso(heute(), 30),
          partner: k.auditor || null, herkunft: e.id, wirksamkeit: String(x.text || "").trim() || null }, "offen", liste);
        liste = [...liste, { art: "abweichung", nr: Math.max(0, ...liste.filter((y) => y.art === "abweichung").map((y) => y.nr || 0)) + 1, id }];
      }
      // Einträge der Liste Abweichungen: Ergebnis der Prüfung festhalten, erledigt = wirksam
      for (const p of vorliste.filter((q) => q.art === "abweichung" && vpBewertet(vpa[q.id]))) {
        const x = vpa[p.id];
        const { data } = await alt.db.from("qma_eintraege").select("*").eq("id", p.ref);
        const a = data && data[0];
        if (!a) continue;
        const notiz = "Geprüft im Audit " + (k.datum || heute()).split("-").reverse().join(".") + ": " + (x.b === "erledigt" ? "erledigt" : x.b === "teil" ? "teilweise erledigt" : "noch offen")
          + (String(x.text || "").trim() ? ", " + x.text.trim() : "");
        const w = [String(a.daten.wirksamkeit || "").trim(), notiz].filter(Boolean).join("\n");
        await eintragSpeichern("abweichung", a, { ...a.daten, wirksamkeit: w, pruef_am: x.b === "erledigt" ? (k.datum || heute()) : a.daten.pruef_am },
          x.b === "erledigt" ? "wirksam" : x.b === "teil" && a.status === "offen" ? "laeuft" : a.status, liste);
      }
      const ergebnis = [
        aus.zaehl.ok + " erfüllt, " + aus.zaehl.v + " Verbesserung, " + aus.zaehl.a + " Abweichung (Checkliste " + fragen.length + " Fragen)",
        String(ck.staerken || "").trim() ? "Stärken: " + ck.staerken.trim() : "",
        String(ck.fazit || "").trim(),
      ].filter(Boolean).join("\n");
      const d = {
        ...daten.current, checkliste: fertig, ...bericht,
        datum: k.datum || heute(), auditor: k.auditor || null, auditiert: k.auditiert || null,
        norm: aus.normen.join(" / "), ergebnis, feststellungen: aus.feststellungen.map((f) => f.text).join("\n") || null, uebertragen: true,
      };
      await eintragSpeichern("audit", e, d, "durchgefuehrt", alle);
      jetztSpeichern = null;
      alt.meldung("Audit abgeschlossen, Bericht erstellt.", "gut");
      zu();
      berichtZeigen({ ...e, daten: d });
    } catch (f) {
      setArbeitet(false);
      alt.meldung(alt.fehlertext(f), "fehler");
    }
  };

  const wiederBearbeiten = () => {
    setCk((c) => { const n = { ...c, abgeschlossen_am: null }; zuletzt.current = n; return n; });
    clearTimeout(uhr.current);
    uhr.current = setTimeout(speichern, 300);
    jetztSpeichern = speichern;
  };

  const d = daten.current;
  return (
    <div className="dialog dialog--breit qma-ck" id="qma-ck">
      <div className="blatt__kopf qma-ck__kopf">
        <h2>Auditcheckliste {vorlage.bereich} <span className="klein">ISO 9001:2026{e.titel !== vorlage.bereich ? " · " + e.titel : ""}{(vorlage.fassungen || 1) > 1 || vorlage.runde ? " · Fragen Fassung " + (((vorlage.runde || 0) % (vorlage.fassungen || 1)) + 1) + " von " + (vorlage.fassungen || 1) : ""}</span></h2>
        <span className="klein qma-ck__stand" id="qma-ck-stand">{beantwortet} / {fragen.length} beantwortet{stand ? " · " + stand : ""}</span>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      <div className="qma-ck__rolle">
        {gesperrt && <div className="qma-ck__fertig" id="qma-ck-fertig">
          ✓ Abgeschlossen am {qmDatum(ck.abgeschlossen_am.slice(0, 10))}
          {d.bericht_url && <button className="knopf knopf--klein" onClick={() => berichtZeigen({ ...e, daten: d })}>📄 Bericht</button>}
          <button className="knopf knopf--klein" id="qma-ck-wieder" onClick={wiederBearbeiten}>Wieder bearbeiten</button>
          <span className="klein">Nach dem Bearbeiten nochmals abschliessen, dann kommt ein neuer Bericht.</span>
        </div>}
        <div className="qma-ck__felder">
          <label>Datum<input type="date" value={ck.kopf.datum || ""} disabled={gesperrt} data-qmackkopf="datum"
            onChange={(ev) => kopf("datum", ev.target.value)} /></label>
          <label>Auditor<input value={ck.kopf.auditor || ""} disabled={gesperrt} data-qmackkopf="auditor"
            onChange={(ev) => kopf("auditor", ev.target.value)} /></label>
          <label>Auditierte Personen<input value={ck.kopf.auditiert || ""} disabled={gesperrt} data-qmackkopf="auditiert"
            onChange={(ev) => kopf("auditiert", ev.target.value)} /></label>
        </div>
        {vorliste.length > 0 && <div className="qma-ck__vor" id="qma-ck-vor">
          <h3>Offene Punkte aus früheren Audits <span className="klein">{vorliste.length} · zuerst prüfen</span></h3>
          <ul>
            {vorliste.map((p) => {
              const x = (ck.vorpunkte || {})[p.id] || {};
              return (
                <li key={p.id} className={"qma-ck__frage qma-ck__vorpunkt" + (x.b ? " qma-ck__vorpunkt--" + x.b : "")} data-qmackvor={p.id}>
                  <div className="qma-ck__text">
                    <span className="qma-ck__norm">{p.art === "abweichung" ? "Abw. Nr. " + p.nr : "Feststellung"}</span>
                    <span className="klein">{p.audit}</span>
                    <div>{p.text}</div>
                  </div>
                  <div className="qma-ck__wahl" role="group" aria-label="Stand">
                    {VP_BEWERTUNG.map(([w, t]) => (
                      <button key={w} type="button" disabled={gesperrt} data-qmackvorb={w}
                        className={"qma-ck__b qma-ck__b--vp-" + w + (x.b === w ? " qma-ck__b--an" : "")}
                        onClick={() => vp(p.id, { b: x.b === w ? null : w })}>{t}</button>
                    ))}
                  </div>
                  <div className="qma-ck__textfeld">
                    <textarea rows={2} value={x.text || ""} disabled={gesperrt} data-qmackvortext={p.id}
                      placeholder="Was wurde gemacht, wie geprüft, was fehlt noch …"
                      onChange={(ev) => vp(p.id, { text: ev.target.value })} />
                    <DiktatKnopf wert={x.text || ""} gesperrt={gesperrt} setzen={(t) => vp(p.id, { text: t })} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="klein">Beim Abschliessen: Einträge der Liste Abweichungen mit „Erledigt“ werden „Wirksam“, das Ergebnis steht bei der Wirksamkeit. Feststellungen „Teilweise“ oder „Noch offen“ kommen als neuer Eintrag in die Liste.</p>
        </div>}
        <ol className="qma-ck__liste">
          {fragen.map((f, i) => {
            const x = ck.antworten[f.id] || {};
            return (
              <li key={f.id} className={"qma-ck__frage" + (x.b ? " qma-ck__frage--" + x.b : "")} data-qmackfrage={f.id}>
                <div className="qma-ck__text">
                  <span className="qma-ck__nr">{i + 1}</span>
                  {f.norm && <span className="qma-ck__norm">{f.norm}</span>}
                  <b>{f.thema}</b>
                  <div>{f.frage}</div>
                  {f.nachweis && <div className="klein qma-ck__nachweis">Nachweis: {f.nachweis}</div>}
                </div>
                <div className="qma-ck__wahl" role="group" aria-label="Bewertung">
                  {CK_BEWERTUNG.map(([w, t]) => (
                    <button key={w} type="button" disabled={gesperrt} data-qmackb={w}
                      className={"qma-ck__b qma-ck__b--" + w + (x.b === w ? " qma-ck__b--an" : "")}
                      onClick={() => antwort(f.id, { b: x.b === w ? null : w })}>{t}</button>
                  ))}
                </div>
                <div className="qma-ck__textfeld">
                  <textarea rows={x.b === "a" || x.b === "v" ? 3 : 2} value={x.text || ""} disabled={gesperrt} data-qmacktext={f.id}
                    placeholder={x.b === "a" ? "Was genau entspricht nicht der Vorgabe? Beispiel, Auftrag, Maschine …"
                      : x.b === "v" ? "Was könnte besser werden?" : "Bemerkung, gesehener Nachweis …"}
                    onChange={(ev) => antwort(f.id, { text: ev.target.value })} />
                  <DiktatKnopf wert={x.text || ""} gesperrt={gesperrt} setzen={(t) => antwort(f.id, { text: t })} />
                </div>
              </li>
            );
          })}
        </ol>
        <div className="qma-ck__felder qma-ck__felder--gross">
          <label>Stärken<span className="qma-ck__textfeld"><textarea rows={3} value={ck.staerken || ""} disabled={gesperrt} data-qmackstaerken=""
            onChange={(ev) => aendern((c) => ({ ...c, staerken: ev.target.value }))} />
            <DiktatKnopf wert={ck.staerken || ""} gesperrt={gesperrt} setzen={(t) => aendern((c) => ({ ...c, staerken: t }))} /></span></label>
          <label>Gesamteindruck<span className="qma-ck__textfeld"><textarea rows={3} value={ck.fazit || ""} disabled={gesperrt} data-qmackfazit=""
            onChange={(ev) => aendern((c) => ({ ...c, fazit: ev.target.value }))} />
            <DiktatKnopf wert={ck.fazit || ""} gesperrt={gesperrt} setzen={(t) => aendern((c) => ({ ...c, fazit: t }))} /></span></label>
        </div>
      </div>
      <div className="qma-ck__fuss">
        {!gesperrt && vorlage.schluessel && <button className="knopf" id="qma-ck-fragen" onClick={fragenAendern}>Fragen ändern</button>}
        <span className="klein">{zaehl.ok} erfüllt · {zaehl.v} Verbesserung · {zaehl.a} Abweichung</span>
        {!gesperrt && <button className="knopf knopf--haupt" id="qma-ck-ab" disabled={arbeitet} onClick={abschliessen}>
          {arbeitet ? "Bericht wird erstellt …" : "Audit abschliessen und Bericht erstellen"}</button>}
      </div>
    </div>
  );
}

// Checkliste für einen weiteren Bereich anlegen oder ändern (Knopf im Auditplan)
export async function checklistenVerwalten(texte, neu) {
  const w1 = await alt.dialogFelder({
    titel: "Auditchecklisten",
    felder: [{ name: "bereich", label: "Für welchen Bereich?", auswahl: auditBereiche().map((b) => [b, b + (texte["checkliste:" + b] ? " ✓" : "")]),
      wert: auditBereiche().includes("Produktion") ? "Produktion" : auditBereiche()[0] }],
    bestaetigen: "Weiter",
  });
  if (!w1) return;
  const schluessel = "checkliste:" + w1.bereich;
  const vorher = (texte[schluessel] && texte[schluessel].felder && texte[schluessel].felder.fragen) || [];
  const w = await alt.dialogFelder({
    titel: "Checkliste " + w1.bereich,
    felder: [{ name: "text", label: "Eine Frage je Zeile: Norm | Thema | Frage | Nachweis. Darunter je weitere Fassung (für spätere Audits) eine Zeile: > Frage | Nachweis", typ: "textarea", zeilen: 18, wert: fragenZuText(vorher),
      platzhalter: "8.5.1 | Erstteil-Freigabe | Wird nach dem Einrichten ein Erstteil gemessen und freigegeben? | Keyence Berichte" }],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  const fragen = fragenAusText(w.text, vorher);
  if (!fragen.length) { alt.meldung("Mindestens eine Frage.", "warn"); return; }
  try {
    await textSpeichern(schluessel, { gruppe: "checkliste", titel: "Auditcheckliste " + w1.bereich, norm: "9.2", felder: { bereich: w1.bereich, fragen } },
      "Ändern: Checkliste " + w1.bereich);
    alt.meldung("Checkliste gespeichert.", "gut"); neu();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}
