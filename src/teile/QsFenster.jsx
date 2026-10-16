// =================================================================
//  QS: GROSSES FENSTER ZUM AUFTRAG (1.78.0, Wunsch Patrick
//  16. Oktober 2026: „Der Fortschritt soll als Button sein, und wenn
//  man drauf drückt, öffnet es ein grosses Fenster, wo man genau den
//  Auftrag sieht, zum Stückzahl eingeben, welche man abziehen muss“)
//  Geöffnet vom Fortschritt im QS Check des Pad Mode und auf der Seite
//  QS. Oben der Auftrag gross (Maschine, HOCO Nr. in der Farbe des
//  Balkens, FA Nr., Material, Stand), darunter offene Meldungen dieser
//  Maschine zum Quittieren und die Felder für den Ausschuss.
//  Gespeichert wird nur die Meldung; abgezogen wird nichts von selbst.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { qsSpeichern, qsQuittieren, qsMeldungenLaden, wannText } from "../daten/qs.js";

function QsFenster({ j, m, zu, fertig }) {
  const [stueck, setStueck] = useState("");
  const [notiz, setNotiz] = useState("");
  const [offen, setOffen] = useState([]);
  const [sendet, setSendet] = useState(false);
  useEffect(() => {
    qsMeldungenLaden(m.id).then(setOffen).catch(() => {});
  }, [m.id]);

  const f = alt.auftragFarbe(j, j.material_bez || "");
  const stand = Number(j.stand) || 0;
  const ziel = Number(j.target_quantity) || 0;
  const prozent = ziel ? Math.min(100, Math.round(stand / ziel * 100)) : 0;
  const zustand = (alt.PLANSTATUS[j.plan_status] || {}).name || "";

  const melden = async () => {
    if (sendet) return;
    setSendet(true);
    const ok = await qsSpeichern(j, m, stueck, notiz);
    setSendet(false);
    if (ok) { fertig(true); zu(); }
  };
  const quittieren = async (me) => {
    if (await qsQuittieren(me)) setOffen((l) => l.filter((x) => x.id !== me.id));
  };

  return (
    <div className="dialog qsf" role="dialog" aria-modal="true" id="qs-fenster">
      <button className="qsf__zu" data-nein="" aria-label="Schliessen" onClick={() => { zu(); fertig(false); }}>✕</button>
      <div className="qsf__maschine">{alt.maschineZielText(m)}{zustand ? " · " + zustand : ""}</div>
      <div className="qsf__hoco" style={f ? { background: f.hex, color: f.schrift } : undefined}>
        {j.job_number || "ohne HOCO Nr."}</div>
      <div className="qsf__angaben">
        <span><small>FA Nr.</small>{j.fa_nr || "—"}</span>
        <span><small>Material</small>{j.material_bez || "—"}</span>
      </div>
      <div className="qsf__fort">
        <div className="qsf__zahl"><b>{alt.zahlText(stand)}</b>{ziel ? " von " + alt.zahlText(ziel) + " Stk" : " Stk"}
          {ziel ? <span className="qsf__prozent">{prozent} %</span> : null}</div>
        <span className="qsf__balken"><i style={{ width: prozent + "%" }} /></span>
      </div>

      {offen.length > 0 && <div className="qsf__offen">
        <h3>Offene Meldungen an dieser Maschine</h3>
        {offen.map((me) => (
          <div key={me.id} className="qsf__meldung" data-qsfmeldung={me.id}>
            <div><b>{alt.zahlText(me.stueck)} Stk.</b> abziehen{me.hoco_nr && me.hoco_nr !== j.job_number ? " (" + me.hoco_nr + ")" : ""}
              <div className="qsf__notiz">{me.notiz}</div>
              <small>{wannText(me.erstellt_am)}{me.erstellt_name ? " · " + me.erstellt_name : ""}</small></div>
            <button className="knopf" data-qsfquittieren={me.id} onClick={() => quittieren(me)}>Quittieren</button>
          </div>))}
      </div>}

      <h3 className="qsf__titel">Ausschuss melden</h3>
      <label className="qsf__feld">Stück am Counter abziehen
        <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" data-fokus=""
          id="qsf-stueck" value={stueck} onChange={(e) => setStueck(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("qsf-notiz").focus(); } }} />
      </label>
      <label className="qsf__feld">Notiz: was wurde aussortiert und warum?
        <textarea id="qsf-notiz" rows={3} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
      </label>
      <p className="klein">Die Meldung steht im Pad Mode dieser Maschine anstelle des Wetters, bis jemand quittiert.
        Abgezogen wird nichts von selbst.</p>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" onClick={() => { zu(); fertig(false); }}>Abbrechen</button>
        <button className="knopf knopf--haupt" data-ja="" disabled={sendet} onClick={melden}>Melden</button>
      </div>
    </div>
  );
}

// Gibt true zurück, wenn eine Meldung gespeichert wurde
export function qsFenster(j, m) {
  return new Promise((fertig) => {
    let erledigt = false;
    const einmal = (w) => { if (!erledigt) { erledigt = true; fertig(w); } };
    fensterOeffnen((zu) => <QsFenster j={j} m={m} zu={zu} fertig={einmal} />,
      () => einmal(false), "qsf-huelle");
  });
}
