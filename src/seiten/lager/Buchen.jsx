// =================================================================
//  LAGER: EINBUCHEN UND AUSBUCHEN (seit 1.791.0)
//  Ein Fenster, das je nach Grund andere Felder zeigt:
//  Einbuchen aus der Produktion (Auftrag der Planwand, Index aus den
//  Stammdaten der HOCO Nr.), zurück vom externen Arbeitsschritt (offene
//  Lieferung wählen, Stufe und Art rechnet die App), Kundenrückgabe,
//  Korrektur. Ausbuchen immer von genau einer Lagerlinie (HOCO Nr. +
//  Index + Art + Platz), an einen externen Schritt (Vorschlag aus dem
//  Ablauf, Rückkehr nach der üblichen Dauer), Auslieferung, Korrektur.
// =================================================================
import { useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import {
  ARTEN, GRUENDE_EIN, GRUENDE_AUS, artText, stufeText, naechsterSchritt, artFuerStufe, stufeNach,
  externOffen, linienMitBestand, arbeitstageNach, heute, ganzeZahl, ablaufVon,
  tagText,
} from "./logik.js";

export function linieText(daten, l, mitHoco) {
  return [mitHoco ? l.hoco : null, l.index_nr ? "Index " + l.index_nr : "ohne Index",
    artText(l.art) + (stufeText(daten, l.hoco, l.art, l.stufe) ? " " + stufeText(daten, l.hoco, l.art, l.stufe) : ""),
    l.ort || null, alt.zahlText(l.menge) + " Stk"].filter(Boolean).join(" · ");
}

function auftragText(j) {
  const wann = j.ended_at ? "fertig " + tagText(j.ended_at) : (j.plan_status === "laeuft" ? "läuft" : j.plan_status || "");
  return j.job_number + (j.fa_nr ? " · FA " + j.fa_nr : "") + " · " + (j.maschine_nr || j.maschine || "")
    + " · " + wann + (j.stand ? " · " + alt.zahlText(j.stand) + " Stk" : "");
}

export function buchenOeffnen(richtung, daten, bestand, vorgabe, neu) {
  fensterOeffnen((zu) => <Buchen richtung={richtung} daten={daten} bestand={bestand}
    vorgabe={vorgabe || {}} zu={zu} neu={neu} />, null, "lager-huelle");
}

function Feld({ label, children, hinweis }) {
  return <label className="feld"><span>{label}</span>{children}{hinweis && <span className="feldhinweis">{hinweis}</span>}</label>;
}

function Buchen({ richtung, daten, bestand, vorgabe, zu, neu }) {
  const ein = richtung === "ein";
  const offeneExtern = externOffen(daten.buchungen);
  const linien = bestand.flatMap((e) => linienMitBestand(e).filter((l) => l.menge > 0))
    .filter((l) => !vorgabe.hoco || l.hoco === vorgabe.hoco);
  const [w, setW] = useState(() => {
    const grund = vorgabe.grund || (ein ? "produktion" : "extern_raus");
    const linie = vorgabe.linie || (linien[0] && linien[0].schluessel + "@" + linien[0].hoco) || "";
    const st = {
      grund, job: "", hoco: vorgabe.hoco || "", index_nr: vorgabe.hoco ? (daten.index.get(vorgabe.hoco) || "") : "",
      art: "fertig", ort: "", menge: "", notiz: "", bezug: vorgabe.bezug || "", ext: "", zurueck_bis: "", rest_erledigt: false, linie,
    };
    return vorbereiten(st, grund);
  });

  // Vorschläge, wenn der Grund oder die Auswahl wechselt
  function vorbereiten(st, grund) {
    const s = { ...st, grund };
    if (grund === "extern_zurueck") {
      const x = offeneExtern.find((o) => o.raus.id === s.bezug) || offeneExtern[0];
      if (x) {
        s.bezug = x.raus.id; s.hoco = x.raus.hoco_nr; s.index_nr = x.raus.index_nr || ""; s.menge = String(x.offen);
        const st2 = stufeNach(daten, x.raus.hoco_nr, x.raus.ext_id, x.raus.stufe);
        s.art = artFuerStufe(daten, x.raus.hoco_nr, st2);
      }
    }
    if (grund === "produktion" || grund === "kunde" || grund === "korr_plus") {
      if (s.hoco) s.art = grund === "produktion" ? artFuerStufe(daten, s.hoco, 0) : "fertig";
    }
    if (!ein) {
      const l = linieVon(s.linie);
      if (l && grund === "extern_raus") {
        const n = naechsterSchritt(daten, l.hoco, l.stufe);
        s.ext = n ? n.id : (s.ext || "");
        const ext = daten.extern.get(s.ext);
        s.zurueck_bis = arbeitstageNach(heute(), ext ? ext.dauer_tage || 0 : 0);
      }
    }
    return s;
  }
  function linieVon(wert) {
    const [k, hoco] = String(wert || "").split("@");
    return linien.find((l) => l.schluessel === k && l.hoco === hoco) || null;
  }
  const setze = (feld, wert) => setW((s) => {
    let n = { ...s, [feld]: wert };
    if (feld === "grund" || feld === "bezug" || feld === "linie") n = vorbereiten(n, n.grund);
    if (feld === "job") {
      const j = daten.auftraege.find((a) => a.id === wert);
      if (j) { n.hoco = j.job_number; n.index_nr = daten.index.get(j.job_number) || ""; n.art = artFuerStufe(daten, j.job_number, 0); }
    }
    if (feld === "hoco" && n.grund !== "extern_zurueck") {
      const h = wert.trim();
      if (daten.index.has(h)) n.index_nr = daten.index.get(h) || "";
      if (daten.ablaeufe.has(h) && n.grund === "produktion") n.art = artFuerStufe(daten, h, 0);
    }
    if (feld === "ext") {
      const ext = daten.extern.get(wert);
      n.zurueck_bis = arbeitstageNach(heute(), ext ? ext.dauer_tage || 0 : 0);
    }
    return n;
  });

  const linie = ein ? null : linieVon(w.linie);
  const offen = offeneExtern.find((o) => o.raus.id === w.bezug);
  const stIndex = daten.index.get((w.hoco || "").trim());
  const hocoAusAuftrag = w.grund === "produktion" && w.job;
  const auftraege = (daten.auftraege || []).filter((j) => j.ended_at || j.plan_status === "laeuft" || j.plan_status === "ruesten" || j.started_at)
    .sort((a, b) => String(b.ended_at || "9999").localeCompare(String(a.ended_at || "9999"))).slice(0, 150);
  const externListe = [...daten.extern.values()].filter((x) => x.aktiv !== false);

  async function speichern() {
    const menge = ganzeZahl(w.menge);
    if (!menge) { alt.meldung("Stück als ganze Zahl über 0 eintippen.", "warn"); return; }
    let zeile;
    if (ein) {
      const hoco = w.hoco.trim();
      if (!hoco) { alt.meldung("HOCO Nr. oder Auftrag wird benötigt.", "warn"); return; }
      zeile = { hoco_nr: hoco, menge, index_nr: w.index_nr.trim() || null, art: w.art, grund: w.grund,
        ort: w.ort.trim() || null, notiz: w.notiz.trim() || null, stufe: 0 };
      if (w.grund === "produktion") {
        const j = daten.auftraege.find((a) => a.id === w.job);
        if (j) { zeile.job_id = j.id; zeile.fa_nr = j.fa_nr || null; }
        zeile.stufe = 0;
      }
      if (w.grund === "extern_zurueck") {
        if (!offen) { alt.meldung("Keine offene Lieferung an einen externen Schritt gewählt.", "warn"); return; }
        zeile.bezug_id = offen.raus.id; zeile.ext_id = offen.raus.ext_id; zeile.job_id = offen.raus.job_id; zeile.fa_nr = offen.raus.fa_nr;
        zeile.index_nr = offen.raus.index_nr; zeile.hoco_nr = offen.raus.hoco_nr;
        zeile.stufe = stufeNach(daten, offen.raus.hoco_nr, offen.raus.ext_id, offen.raus.stufe);
        if (menge > offen.offen) {
          const ok = await alt.nachfragen({ titel: "Mehr als geschickt", text: "Unterwegs sind nur " + alt.zahlText(offen.offen) + " Stk. Trotzdem " + alt.zahlText(menge) + " einbuchen?", bestaetigen: "Trotzdem" });
          if (!ok) return;
        }
      }
      if (w.grund !== "extern_zurueck" && w.art !== "teil") zeile.stufe = w.art === "fertig" ? ablaufVon(daten, hoco).length : 0;
    } else {
      if (!linie) { alt.meldung("Bitte wählen, welche Teile ausgebucht werden.", "warn"); return; }
      if (w.grund === "extern_raus" && !w.ext) { alt.meldung("Bitte den externen Arbeitsschritt wählen.", "warn"); return; }
      if (menge > linie.menge) {
        const ok = await alt.nachfragen({ titel: "Mehr als an Lager", text: "An Lager sind nur " + alt.zahlText(linie.menge) + " Stk. Trotzdem " + alt.zahlText(menge) + " ausbuchen?", bestaetigen: "Trotzdem ausbuchen", gefahr: true });
        if (!ok) return;
      }
      zeile = { hoco_nr: linie.hoco, menge: -menge, index_nr: linie.index_nr || null, art: linie.art, stufe: linie.stufe,
        ort: linie.ort || null, grund: w.grund, notiz: w.notiz.trim() || null };
      if (w.grund === "extern_raus") { zeile.ext_id = w.ext; zeile.zurueck_bis = w.zurueck_bis || null; }
    }
    const r = await alt.db.from("lager_buchungen").insert(zeile).select("id").single();
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    const schritte = [alt.rueckWeg("lager_buchungen", { id: r.data.id })];
    if (ein && w.grund === "extern_zurueck" && w.rest_erledigt && offen) {
      const u = await alt.db.from("lager_buchungen").update({ erledigt: true }).eq("id", offen.raus.id);
      if (!u.error) schritte.push(alt.rueckSetz("lager_buchungen", { erledigt: false }, { id: offen.raus.id }));
    }
    alt.merkeSchritt("Lager " + (ein ? "eingebucht" : "ausgebucht"), schritte);
    alt.meldung(alt.zahlText(menge) + " Stk " + zeile.hoco_nr + (ein ? " eingebucht." : " ausgebucht."), "gut");
    zu(); neu();
  }

  return (
    <div className="dialog lager-dialog" role="dialog" aria-modal="true" data-lager-buchen={richtung}>
      <h2>{ein ? "Teile einbuchen" : "Teile ausbuchen"}</h2>
      <form onSubmit={(e) => { e.preventDefault(); speichern(); }}>
        <Feld label="Grund">
          <select id="lb-grund" value={w.grund} onChange={(e) => setze("grund", e.target.value)}>
            {(ein ? GRUENDE_EIN : GRUENDE_AUS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </Feld>

        {ein && w.grund === "produktion" && (
          <Feld label="Auftrag von der Planwand" hinweis="Ohne Auftrag die HOCO Nr. unten eintippen.">
            <select id="lb-job" value={w.job} onChange={(e) => setze("job", e.target.value)}>
              <option value="">— ohne Auftrag —</option>
              {auftraege.map((j) => <option key={j.id} value={j.id}>{auftragText(j)}</option>)}
            </select>
          </Feld>)}

        {ein && w.grund === "extern_zurueck" && (
          offeneExtern.length
            ? <Feld label="Welche Lieferung kommt zurück?">
                <select id="lb-bezug" value={w.bezug} onChange={(e) => setze("bezug", e.target.value)}>
                  {offeneExtern.map((o) => {
                    const ext = daten.extern.get(o.raus.ext_id);
                    return <option key={o.raus.id} value={o.raus.id}>
                      {o.raus.hoco_nr + (o.raus.index_nr ? " Index " + o.raus.index_nr : "") + " · " + (ext ? ext.schritt + (ext.firma ? " bei " + ext.firma : "") : "extern")
                        + " · " + alt.zahlText(o.offen) + " Stk offen · raus " + tagText(o.raus.erstellt_am)}</option>;
                  })}
                </select>
              </Feld>
            : <p className="feldhinweis">Zurzeit sind keine Teile bei externen Firmen.</p>)}

        {ein && w.grund !== "extern_zurueck" && (
          <div className="lager-zwei">
            <Feld label="HOCO Nr.">
              <input type="text" id="lb-hoco" value={w.hoco} disabled={!!hocoAusAuftrag} placeholder="z.B. 10007-0589"
                onChange={(e) => setze("hoco", e.target.value)} />
            </Feld>
            <Feld label="Index" hinweis={stIndex != null && stIndex !== w.index_nr.trim() ? "Stammdaten: " + (stIndex || "ohne") : null}>
              <input type="text" id="lb-index" value={w.index_nr} placeholder="ohne" onChange={(e) => setze("index_nr", e.target.value)} />
            </Feld>
          </div>)}

        {ein && (
          <Feld label="Art der Teile" hinweis={w.art === "teil" && w.hoco && ablaufVon(daten, w.hoco.trim()).length
            ? "Danach: " + ablaufVon(daten, w.hoco.trim()).map((x) => x.schritt).join(" → ") : null}>
            <div className="lager-knoepfe" id="lb-art">
              {ARTEN.map(([k, t]) => <button type="button" key={k} data-art={k}
                className={"knopf knopf--klein" + (w.art === k ? " knopf--haupt" : "")} onClick={() => setze("art", k)}>{t}</button>)}
            </div>
          </Feld>)}

        {!ein && (
          linien.length
            ? <Feld label="Welche Teile?">
                <select id="lb-linie" value={w.linie} onChange={(e) => setze("linie", e.target.value)}>
                  {linien.map((l) => <option key={l.schluessel + "@" + l.hoco} value={l.schluessel + "@" + l.hoco}>{linieText(daten, l, true)}</option>)}
                </select>
              </Feld>
            : <p className="feldhinweis">Es ist nichts an Lager.</p>)}

        {!ein && w.grund === "extern_raus" && (
          <div className="lager-zwei">
            <Feld label="Externer Arbeitsschritt" hinweis={linie && naechsterSchritt(daten, linie.hoco, linie.stufe)
              ? "Laut Ablauf als Nächstes" : (externListe.length ? null : "Zuerst unter Stammdaten anlegen.")}>
              <select id="lb-ext" value={w.ext} onChange={(e) => setze("ext", e.target.value)}>
                <option value="">— wählen —</option>
                {externListe.map((x) => <option key={x.id} value={x.id}>{x.schritt + (x.firma ? " · " + x.firma : "")}</option>)}
              </select>
            </Feld>
            <Feld label="Zurück erwartet am">
              <input type="text" id="lb-zurueck" type="date" value={w.zurueck_bis} onChange={(e) => setze("zurueck_bis", e.target.value)} />
            </Feld>
          </div>)}

        <div className="lager-zwei">
          <Feld label="Stück">
            <input type="text" id="lb-menge" inputMode="numeric" value={w.menge} data-fokus="" onChange={(e) => setze("menge", e.target.value)} />
          </Feld>
          {ein && <Feld label="Lagerplatz (freiwillig)"><input type="text" id="lb-ort" value={w.ort} onChange={(e) => setze("ort", e.target.value)} /></Feld>}
        </div>
        {ein && w.grund === "extern_zurueck" && offen && (
          <label className="feld-haken"><input type="checkbox" id="lb-rest" checked={w.rest_erledigt}
            onChange={(e) => setze("rest_erledigt", e.target.checked)} />
            <span>Rest nicht mehr erwartet (Lieferung abschliessen)</span></label>)}
        <Feld label={ein ? "Notiz (freiwillig)" : "Lieferschein / Notiz (freiwillig)"}>
          <input type="text" id="lb-notiz" value={w.notiz} onChange={(e) => setze("notiz", e.target.value)} />
        </Feld>
      </form>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" data-nein="" onClick={zu}>Abbrechen</button>
        <button className={"knopf " + (ein ? "knopf--haupt" : "knopf--gefahr")} data-ja="" onClick={speichern}>
          {ein ? "Einbuchen" : "Ausbuchen"}</button>
      </div>
    </div>
  );
}
