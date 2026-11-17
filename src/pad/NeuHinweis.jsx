// =================================================================
//  PAD MODE: „NEU BEIM EINRICHTBLATT“
//  Seit 1.613.1 ist die Reihe T3421–T3423 (frontangetrieben statt T3400)
//  im Einrichtblatt eine Option. Damit die Leute an den betroffenen
//  Maschinen (Vorlagen mit T3400: SB-20RG, SB-20C) es wissen, kommt am
//  Dashboard der Maschine einmal je Gerät ein Fenster, das die Neuerung
//  kurz erklärt (Wunsch Patrick 17. November 2026: „Mach bei allen SB die
//  es betrifft eine info im Padmode, neu beim Einrichtblatt“).
//  Gemerkt im localStorage des Geräts; nach BIS kommt es nicht mehr.
//  Weitere Neuerungen bekommen einen eigenen Eintrag in NEUES.
// =================================================================
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { vorlageFuer, front34Moeglich } from "../einrichtblatt/vorlagen.js";

const NEUES = [{
  id: "eb-front34",
  bis: "2026-12-31",
  passt: (typ) => front34Moeglich(vorlageFuer(typ)),
  titel: "Neu beim Einrichtblatt",
  inhalt: () => <>
    <p>Die Reihe <b>T3421 – T3423</b> (frontangetrieben, statt T3400) ist jetzt eine <b>Option</b>.</p>
    <p>Sie steht direkt <b>unter der Reihe T3100 – T3400</b> und nur dann, wenn man sie braucht.</p>
    <p>Einschalten: Einrichtblatt öffnen, <b>„Bearbeiten“</b>, oben rechts das Häkchen <b>„Frontangetrieben T3421–T3423“</b> setzen.</p>
    <p>Steht schon ein Werkzeug in T3421 – T3423, ist die Reihe von selbst da.</p>
  </>,
}];

const schluessel = (id) => "hofer.pad.neu." + id;
const gesehen = (id) => { try { return !!localStorage.getItem(schluessel(id)); } catch (f) { return true; } };
const merken = (id) => { try { localStorage.setItem(schluessel(id), new Date().toISOString()); } catch (f) { /* dann nochmals */ } };

let offen = false;

// m: die Maschine des Dashboards
export async function neuHinweisZeigen(m) {
  if (offen || !m || !m.type_id || alt.istExtern()) return;
  // Im Prüfstand nur auf Wunsch, sonst stört es alle Pad-Tests
  if (window.TEST && !window.TEST.neuHinweis) return;
  const heute = alt.isoDatum(new Date());
  const offenNeu = NEUES.filter((n) => heute <= n.bis && !gesehen(n.id));
  if (!offenNeu.length) return;
  let typ = null;
  try { typ = ((await alt.ladeTypen()) || []).find((t) => t.id === m.type_id) || null; } catch (f) { return; }
  if (!typ) return;
  const n = offenNeu.find((x) => { try { return x.passt(typ); } catch (f) { return false; } });
  if (!n || offen) return;
  offen = true;
  try {
    await new Promise((fertig) => fensterOeffnen((zu) => (
      <div className="dialog pad-neu" role="dialog" aria-modal="true" data-pad-neu={n.id}>
        <h2><span className="pad-neu__schild">Neu</span>{n.titel}</h2>
        {n.inhalt()}
        <div className="dialog__knoepfe">
          <button className="knopf knopf--haupt" data-pad-neu-ok="" data-fokus="" onClick={zu}>Verstanden</button>
        </div>
      </div>
    ), fertig));
    merken(n.id);
  } finally { offen = false; }
}
