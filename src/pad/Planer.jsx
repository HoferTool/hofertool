// =================================================================
//  PAD MODE: PLANER (seit 1.507.0, Wunsch Patrick 12. November 2026:
//  „Dashboard für Planer im Pad Mode, aktuelle wichtige Sachen, Todos wie
//  Probleme (auch eigene Sachen verfassen), Materialbestellungen für die
//  nächsten Aufträge zeigen und nach Lieferant sortieren“). Kachel
//  „Planer“ auf dem Startbild des Pads, nur Admins, nie Externe.
//
//  Links Todo: gemeldete Probleme, fehlendes Material bald, laufend ohne
//  WBG (alles von selbst) und eigene Todos (Tabelle planer_todos). Keine
//  QS-Meldungen (seit 1.529.0, Patrick: „das nervt“), erledigte eigene
//  Todos stehen im Fenster „Abgeschlossen“ neben dem Todo-Titel. Rechts das Material der nächsten Aufträge,
//  nach Lieferant gebündelt (Rechnung in src/daten/planer.js).
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { padZurueck } from "./Pad.jsx";
import { istPlanerTab, planerTabVerlassen, planerSichtbar, planerTabOeffnen } from "./planerTab.js";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { planwandFensterOeffnen } from "./PlanwandFenster.jsx";
import { problemArchivOeffnen, problemArchivSichtbar } from "../planwand/ProblemArchiv.jsx";
import { planerLaden, zuBestellen, wahlSetzen, regelnLaden, regelnSpeichern, lieferbarText, lieferantLogoDaten, todoNeu, todoHaken, todoAendern, todoLoeschen, meldungQuittieren, meldungWiederOffen } from "../daten/planer.js";
import MaterialLieferanten from "../einstellungen/MaterialLieferanten.jsx";
import { Logo } from "../seiten/bestellungen/teile.jsx";

export { planerSichtbar };

// Seit 1.646.0 2, 4 oder 6 Wochen und immer alles, ohne „Nur zu bestellen“ und
// „Auch Vorhandenes“ (Wunsch Patrick 19. November 2026: „mach 2 Wochen, 4, dann 6 …
// einfach alles immer anzeigen“)
const ZEITRAUM = [[10, "2 Wochen"], [20, "4 Wochen"], [30, "6 Wochen"]];
const einst = () => {
  const p = alt.pad;
  if (!p.planer) p.planer = { tage: 10, ansicht: "lieferant" };
  if (!ZEITRAUM.some(([t]) => t === p.planer.tage)) p.planer.tage = 10;
  return p.planer;
};

export async function planerSichtLaden() {
  return { art: "planer", ...(await planerLaden(einst().tage)) };
}

// Den Reiter Planwand im Planer (1.511.0 bis 1.524.x) gibt es seit 1.525.0 nicht mehr (Wunsch
// Patrick 13. November 2026: „beim Dashboard braucht es den Reiter Planwand nicht mehr“); die
// Planwand hat ihren eigenen Vollbild-Tab. Escape geht weiter über den unsichtbaren Knopf mit
// data-padzurueck.
function Zurueck() {
  return <button hidden data-padzurueck="" onClick={verlassenFragen} />;
}

// Aus dem Planer nur nach Rückfrage (seit 1.517.0, Wunsch Patrick 13. November 2026: „wenn man
// aus dem Dashboard will, soll kurz kommen wirklich und dann Enter, nicht dass man aus Versehen
// rausfällt“). Enter bestätigt, weil der Knopf „Verlassen“ den Fokus hat; Escape bleibt drin.
let fragtGerade = false;
async function verlassenFragen() {
  if (fragtGerade) return;
  fragtGerade = true;
  try {
    const ja = await alt.nachfragen({ titel: "Planer wirklich verlassen?", text: "Enter schliesst den Planer, Escape bleibt hier.", bestaetigen: "Verlassen" });
    // Im eigenen Tab (seit 1.521.0) geht der Tab zu, sonst einen Schritt zurück
    if (ja) { if (istPlanerTab()) planerTabVerlassen(); else padZurueck(); }
  } finally { fragtGerade = false; }
}

// Der Planer ist hell, ausser im dunklen Modus (Wunsch Patrick
// 13. November 2026: „hell, nicht so bläulich wie das restliche Pad“)
function useHell() {
  useEffect(() => {
    document.body.classList.add("pl-hell");
    return () => document.body.classList.remove("pl-hell");
  }, []);
}

const TAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const tagText = (iso) => (iso ? TAGE[new Date(iso + "T12:00:00").getDay()] + " " + alt.kurzDatum(iso) : "");
const zahl = (n) => (alt.zahlText ? alt.zahlText(n) : String(n));
const STAND = {
  fehlt: ["fehlt", "rot"], offen: ["offen", "rot"], teil: ["fehlen noch", "orange"], bestellt: ["bestellt", "blau"], da: ["da", "gruen"],
};

export default function Planer({ d, neu }) {
  const e = einst();
  const um = (aendern) => { aendern(e); neu(); };
  useHell();
  return (
    <>
      <Zurueck />
      <Dashboard d={d} e={e} um={um} neu={neu} />
    </>
  );
}

function Dashboard({ d, e, um, neu }) {
  return (
    <>
      <div className="pl" id="pad-planer">
        <Todos d={d} neu={neu} />
        <section className="pl-karte pl-material">
          <div className="pl-kopf">
            <h2>Material für die nächsten Aufträge</h2>
            <button className="pl-knopf" id="pl-lieferanten" onClick={() => lieferantenFenster(neu)}>⚙ Lieferanten</button>
            <MatErledigtKnopf d={d} neu={neu} />
          </div>
          <div className="pl-filter">
            <span className="pl-gruppe">
              <button className={"pl-knopf" + (e.ansicht === "lieferant" ? " pl-knopf--an" : "")} data-plansicht="lieferant"
                onClick={() => um((x) => { x.ansicht = "lieferant"; })}>Nach Lieferant</button>
              <button className={"pl-knopf" + (e.ansicht === "start" ? " pl-knopf--an" : "")} data-plansicht="start"
                onClick={() => um((x) => { x.ansicht = "start"; })}>Nach Start</button>
            </span>
            <span className="pl-gruppe">
              {ZEITRAUM.map(([t, text]) => (
                <button key={t} className={"pl-knopf" + (e.tage === t ? " pl-knopf--an" : "")} data-plzeit={t}
                  onClick={() => um((x) => { x.tage = t; })}>{text}</button>
              ))}
            </span>
          </div>
          <Material d={d} e={e} neu={neu} />
        </section>
      </div>
    </>
  );
}

function lieferantenFenster(neu) {
  fensterOeffnen((zu) => (
    <div className="dialog dialog--breit pl-lf">
      <div className="dialog__kopf"><h2>Material-Lieferanten</h2>
        <button className="dialog__schliessen-inline" title="Schliessen" onClick={zu}>✕</button></div>
      <MaterialLieferanten nachSpeichern={() => { zu(); neu(); }} />
    </div>
  ));
}

// ---------- Todo ----------

function Todos({ d, neu, titel, oeffnen = planwandZeigen, titelKlick }) {
  const heute = d.heute;
  const bald = alt.plusTage(heute, 7);
  const posten = [];
  for (const j of d.offen) {
    if (String(j.problem || "").trim()) posten.push({ k: "p" + j.id, art: "problem", rot: true, sort: "0" + (j.problem_at || ""),
      titel: (j.maschine_nr ? j.maschine_nr + " · " : "") + j.problem,
      unter: [j.job_number, j.problem_at ? alt.datumZeitKurz(j.problem_at) : "", j.problem_von].filter(Boolean).join(" · "),
      haken: () => alt.problemQuittieren(j, null, neu), auf: () => oeffnen(j) });
  }
  // Meldungen von selbst lassen sich quittieren (seit 1.643.0), dann
  // stehen sie nur noch im Fenster „Abgeschlossen“
  const quitt = d.quittiert || {};
  const offeneIds = new Set(d.offen.map((j) => String(j.id)));
  const quittieren = (k, titel, unter) => async () => {
    try { await meldungQuittieren(k, titel, unter, offeneIds); neu(); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  for (const z of d.zeilen) {
    if (!(zuBestellen(z) || z.liefertSpaet) || (z.start > bald && !z.zuSpaet)) continue;
    const k = "m" + z.j.id;
    if (quitt[k] || quitt["z" + z.j.id]) continue;
    const titelM = (z.liefertSpaet ? "Liefertermin nach Start" : "Material " + (z.stand === "offen" ? "offen" : z.stand === "teil" ? "reicht nicht" : "fehlt"))
      + ": Start " + tagText(z.start) + (z.maschine ? " auf " + z.maschine : "");
    const unterM = [z.j.job_number, z.j.material_bez, z.stand === "offen" ? "„" + z.j.material_menge + "“" : "", z.stand === "teil" ? "fehlen noch " + zahl(z.fehltKg) + " kg" : "",
      z.liefertSpaet ? "geliefert " + z.j.material_liefertermin : z.zuSpaet ? "kommt zu spät" : ""].filter(Boolean).join(" · ");
    posten.push({ k, art: "m", rot: z.zuSpaet, sort: "2" + z.start, titel: titelM, unter: unterM,
      haken: quittieren(k, titelM, unterM), auf: () => oeffnen(z.j) });
  }
  for (const j of d.offen) {
    if (j.plan_status !== "laeuft" || j.wbg_url) continue;
    const k = "w" + j.id;
    if (quitt[k]) continue;
    const titelW = (j.maschine_nr ? j.maschine_nr + " " : "") + "läuft ohne WBG";
    posten.push({ k, art: "wbg", sort: "3" + j.job_number, titel: titelW, unter: j.job_number,
      haken: quittieren(k, titelW, j.job_number), auf: () => oeffnen(j) });
  }
  // „Nur für mich“ sieht nur, wer es geschrieben hat (seit 1.521.0)
  const ich = alt.meineProfilId();
  const sichtbar = (d.todos || []).filter((t) => t.fuer_alle !== false || t.erstellt_von === ich);
  // Erledigtes steht nicht mehr in der Liste, nur im Fenster „Abgeschlossen“
  // (seit 1.529.0, Wunsch Patrick 13. November 2026)
  const erledigt = sichtbar.filter((t) => t.erledigt_am);
  const nQuitt = Object.keys(d.quittiert || {}).filter((k) => k[0] !== "z" && offeneIds.has(k.slice(1))).length;
  const eigene = sichtbar.filter((t) => !t.erledigt_am);
  eigene.sort((a, b) => String(a.faellig || "9").localeCompare(String(b.faellig || "9")));
  for (const t of eigene) {
    const spaet = !t.erledigt_am && t.faellig && t.faellig <= heute;
    posten.push({ k: "e" + t.id, art: "eigen", erledigt: !!t.erledigt_am, rot: spaet, sort: "4",
      titel: t.text,
      unter: t.erledigt_am ? "erledigt " + alt.datumZeitKurz(t.erledigt_am) + (t.erledigt_von ? " · " + t.erledigt_von : "")
        : [t.faellig ? "fällig " + tagText(t.faellig) : "", t.fuer_alle === false ? "nur für mich" : t.erstellt_name].filter(Boolean).join(" · "),
      haken: async () => { try { await todoHaken(t, !t.erledigt_am); neu(); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); } },
      auf: () => todoBearbeiten(t, neu), weg: () => todoWeg(t, neu) });
  }
  // Gemeldete Probleme zuerst, gleich darunter die eigenen, dann was von
  // selbst kommt (Patrick 13. November 2026: „eigene sollen gleich unter
  // den gemeldeten kommen“)
  const RANG = { problem: 0, eigen: 2, m: 3, wbg: 4 };
  posten.sort((a, b) => RANG[a.art] - RANG[b.art] || a.sort.localeCompare(b.sort));
  const offen = posten.filter((p) => !p.erledigt).length;
  const z = {
    prob: posten.filter((p) => p.art === "problem").length,
    mat: d.zeilen.filter(zuBestellen).length,
    spaet: d.zeilen.filter((x) => x.zuSpaet).length,
  };
  return (
    <div className="pl-links">
      <div className="pl-zahlen">
        <div className="pl-zahl"><span>Probleme offen</span><b className={z.prob ? "pl-rot" : ""}>{z.prob}</b></div>
        <div className="pl-zahl"><span>Material fehlt</span><b className={z.mat ? "pl-gelb" : ""}>{z.mat}</b></div>
        <div className="pl-zahl"><span>Kommt zu spät</span><b className={z.spaet ? "pl-rot" : ""}>{z.spaet}</b></div>
      </div>
      <section className="pl-karte pl-todo">
        <div className="pl-kopf">
          {titelKlick
            ? <h2><button className="pl-titelknopf" id="nav-todo-dashboard" title="Planer-Dashboard öffnen (eigener Tab)"
                onClick={titelKlick}>{titel || "Todo"} {offen > 0 && <span className="pl-anzahl">{offen}</span>} <span className="pl-titelpfeil" aria-hidden="true">↗</span></button></h2>
            : <h2>{titel || "Todo"} {offen > 0 && <span className="pl-anzahl">{offen}</span>}</h2>}
          <span className="pl-gruppe">
            <button className="pl-knopf" id="pl-abgeschlossen" title="Erledigte Todos und quittierte Meldungen ansehen oder wieder öffnen"
              onClick={() => abgeschlossenFenster(d, neu)}>✓ Abgeschlossen{erledigt.length + nQuitt > 0 ? " (" + (erledigt.length + nQuitt) + ")" : ""}</button>
            {d.todos !== null && <button className="pl-plus" id="pl-todo-neu" title="Eigenes Todo" onClick={() => todoBearbeiten(null, neu)}>+</button>}
          </span>
        </div>
        <div className="pl-liste">
          {!posten.length && <p className="pl-leer">Nichts zu tun. 🎉</p>}
          {posten.map((p) => (
            <div key={p.k} className={"pl-todo__eintrag" + (p.rot ? " pl-todo__eintrag--rot" : "") + (p.erledigt ? " pl-todo__eintrag--erledigt" : "")}
              data-pltodo={p.art}>
              {p.haken ? <button className="pl-haken" aria-label="Erledigt" onClick={p.haken} />
                : <span className="pl-haken pl-haken--leer" />}
              <button className="pl-todo__text" onClick={p.auf || p.haken}>
                <span className="pl-todo__titel"><span className={"pl-schild pl-schild--" + p.art}>
                  {{ problem: "PROBLEM", m: "M", wbg: "WBG", eigen: "EIGEN" }[p.art]}</span>{p.titel}</span>
                {p.unter && <span className="pl-todo__unter">{p.unter}</span>}
              </button>
              {p.weg && <button className="pl-todo__weg" data-pltodoweg="" title="Todo löschen" aria-label="Todo löschen"
                onClick={p.weg}>✕</button>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Erledigte eigene Todos zum Nachschauen oder Rückgängig machen, neuste
// zuoberst (seit 1.529.0, Wunsch Patrick 13. November 2026). Das Fenster
// lädt selbst neu, damit es nach dem Wieder-Öffnen stimmt.
function abgeschlossenFenster(d, neu) {
  const offeneIds = new Set(d.offen.map((j) => String(j.id)));
  const q = Object.entries(d.quittiert || {}).filter(([k]) => k[0] !== "z" && offeneIds.has(k.slice(1))).map(([k, v]) => ({ k, ...v }));
  fensterOeffnen((zu) => <Abgeschlossen start={d.todos} quitt={q} zu={zu} neu={neu} />);
}

function Abgeschlossen({ start, quitt: quittStart, zu, neu }) {
  const [todos, setTodos] = useState(start || []);
  const [quitt, setQuitt] = useState(quittStart || []);
  const meldungOffen = async (m) => {
    try { await meldungWiederOffen(m.k); setQuitt((x) => x.filter((y) => y.k !== m.k)); neu(); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  const ich = alt.meineProfilId();
  const liste = todos.filter((t) => t.erledigt_am && (t.fuer_alle !== false || t.erstellt_von === ich))
    .sort((a, b) => String(b.erledigt_am).localeCompare(String(a.erledigt_am)));
  const wiederOffen = async (t) => {
    try {
      await todoHaken(t, false);
      setTodos((x) => x.map((y) => (y.id === t.id ? { ...y, erledigt_am: null, erledigt_von: null } : y)));
      neu();
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  return (
    <div className="dialog dialog--breit pl-abg" id="pl-abg">
      <div className="dialog__kopf"><h2>Abgeschlossen</h2>
        {/* Erledigte Probleme der Aufträge (Archiv seit 1.634.0) stehen seit
            1.645.0 nur noch hier, nicht mehr als Knopf auf der Planwand
            (Wunsch Patrick 19. November 2026). Im Planer-Tab zum Balken über
            das Planwand-Fenster, sonst auf die Planwand. */}
        {problemArchivSichtbar() && <button className="knopf knopf--klein pl-abg__probleme" id="pl-abg-probleme"
          onClick={() => { zu(); problemArchivOeffnen(null, istPlanerTab() ? (j) => planwandZeigen(j) : null); }}>
          ⚠ Erledigte Probleme</button>}
        <button className="dialog__schliessen-inline" title="Schliessen" onClick={zu}>✕</button></div>
      <div className="pl-abg__liste">
        {!liste.length && !quitt.length && <p className="pl-abg__leer">Noch nichts abgeschlossen.</p>}
        {[...quitt].sort((a, b) => String(b.am).localeCompare(String(a.am))).map((m) => (
          <div key={m.k} className="pl-abg__zeile" data-plabgmeldung={m.k}>
            <span className="pl-abg__text">
              <b><span className={"pl-schild pl-schild--" + (m.k[0] === "w" ? "wbg" : "m")}>{m.k[0] === "w" ? "WBG" : "M"}</span>{m.titel}</b>
              <small>{[m.unter, "quittiert " + (m.am ? alt.datumZeitKurz(m.am) : ""), m.von].filter(Boolean).join(" · ")}</small>
            </span>
            <button className="knopf knopf--still" data-plmeldungwieder={m.k} onClick={() => meldungOffen(m)}>↶ Wieder offen</button>
          </div>
        ))}
        {liste.map((t) => (
          <div key={t.id} className="pl-abg__zeile" data-plabg={t.id}>
            <span className="pl-abg__text">
              <b>{t.text}</b>
              <small>{["erledigt " + alt.datumZeitKurz(t.erledigt_am), t.erledigt_von,
                t.fuer_alle === false ? "nur für mich" : ""].filter(Boolean).join(" · ")}</small>
            </span>
            <button className="knopf knopf--still" data-plwieder={t.id} onClick={() => wiederOffen(t)}>↶ Wieder offen</button>
            <button className="pl-todo__weg" data-plabgweg={t.id} title="Todo löschen" aria-label="Todo löschen"
              onClick={() => todoWeg(t, () => { setTodos((x) => x.filter((y) => y.id !== t.id)); neu(); })}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Eigenes Todo löschen mit dem ✕ am Eintrag, eine Rückfrage, mit
// Rückgängig (seit 1.573.0, Wunsch Patrick 16. November 2026: „man soll
// todos auch löschen können“; vorher nur über leeren Text, was die
// Pflicht im Feld verhinderte)
async function todoWeg(t, neu) {
  if (!(await alt.nachfragen({ titel: "Todo löschen?", text: t.text, bestaetigen: "Löschen", gefahr: true }))) return;
  try { await todoLoeschen(t); alt.meldung("Todo gelöscht.", "gut"); neu(); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

async function todoBearbeiten(t, neu) {
  const w = await alt.dialogFelder({
    titel: t ? "Todo ändern" : "Neues Todo",
    felder: [
      { name: "text", label: "Was ist zu tun?", typ: "textarea", wert: t ? t.text : "", pflicht: true },
      { name: "faellig", label: "Fällig am (freiwillig)", typ: "date", wert: t ? t.faellig || "" : "" },
      // Neue Todos sind zuerst nur für mich, der Schieber stellt auf alle Admins
      // (seit 1.521.0, Wunsch Patrick 13. November 2026)
      { name: "alle", typ: "haken", schieber: true, aus: "Nur für mich", label: "Alle Admins",
        wert: t ? t.fuer_alle !== false : false },
    ],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  if (t && !String(w.text || "").trim()) {
    if (await alt.nachfragen({ titel: "Todo löschen?", text: t.text, bestaetigen: "Löschen", gefahr: true })) {
      try { await todoLoeschen(t); neu(); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    }
    return;
  }
  try {
    if (t) await todoAendern(t, { text: w.text.trim(), faellig: w.faellig || null, fuer_alle: !!w.alle });
    else await todoNeu(w.text.trim(), w.faellig, !!w.alle);
    neu();
  } catch (f) {
    alt.meldung(/planer_todos|schema cache|does not exist/i.test(f.message || "")
      ? "Eigene Todos brauchen zuerst sql/planer-todos.sql." : alt.fehlertext(f), "fehler");
  }
}

// Links zur Planwand öffnen im Planer-Tab die normale Planwand im Tab, aus
// dem der Planer kam, beim Balken mit Auftragsfenster, statt die Planwand
// als Fenster über dem Planer (seit 1.648.0, Wunsch Patrick 19. November
// 2026: „soll nicht Planwand nochmal aufmachen, sondern die normale“).
// Fehlt dieser Tab, geht ein Tab mit der Planwand auf.
function planwandZeigen(j) {
  if (!istPlanerTab()) { planwandFensterOeffnen(j); return; }
  let w = null;
  try {
    const o = window.opener;
    if (o && !o.closed && o.hoferBalkenZeigen) {
      if (!o.name) o.name = "hofer-haupt";
      w = window.open("", o.name) || o;
    }
  } catch (f) { w = null; }
  if (!w) w = window.open("", "hofer-haupt");
  if (!w) { alt.meldung("Der Browser hat den Tab gesperrt. Bitte Pop-ups für das HoferTool erlauben.", "warn"); return; }
  try { w.focus(); } catch (f) { /* egal */ }
  const los = () => { try { if (w.hoferBalkenZeigen) { w.hoferBalkenZeigen(j.id); return true; } } catch (f) { /* lädt noch */ } return false; };
  if (los()) return;
  try {
    if (!w.location.href || w.location.href === "about:blank") w.location.href = location.href.split("#")[0] + "#/planwand";
  } catch (f) { /* egal */ }
  let n = 0;
  const t = setInterval(() => { if (los() || ++n > 120) clearInterval(t); }, 250);
}

// ---------- Material ----------

function Material({ d, e, neu }) {
  // Immer alles, auch ganz Vorhandenes in der Gruppe „Schon da“ (seit 1.646.0),
  // ausser Positionen, die als erledigt abgehakt sind (seit 1.647.0)
  const quitt = d.quittiert || {};
  const zeilen = d.zeilen.filter((z) => !quitt["z" + z.j.id]);
  if (!zeilen.length) return <p className="pl-leer">Keine Aufträge mit Material bis {tagText(d.bis)}.</p>;
  if (e.ansicht === "start") {
    return <div className="pl-gruppen"><div className="pl-lief"><Tabelle zeilen={zeilen} d={d} neu={neu} mitLieferant /></div></div>;
  }
  const vonName = Object.fromEntries(d.lieferanten.map((l) => [l.name, l]));
  const gruppen = new Map();
  const dazu = (k, z) => { if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(z); };
  for (const z of zeilen) {
    if (z.stand === "da") dazu("__da", z);
    else if (z.lieferant) dazu(z.lieferant, z);
    else if (z.stand === "bestellt") dazu("__bestellt", z);
    else dazu("__offen", z);
  }
  const fehlend = (l) => l.filter(zuBestellen);
  const reihe = [...gruppen.keys()].sort((a, b) => {
    const rang = (k) => (k === "__da" ? 4 : k === "__bestellt" ? 3 : k === "__offen" ? 1 : fehlend(gruppen.get(k)).length ? 0 : 2);
    const ga = gruppen.get(a), gb = gruppen.get(b);
    return rang(a) - rang(b) || gb.some((z) => z.zuSpaet) - ga.some((z) => z.zuSpaet)
      || fehlend(gb).length - fehlend(ga).length || a.localeCompare(b, "de");
  });
  return (
    <div className="pl-gruppen">
      {reihe.map((k) => {
        const l = vonName[k];
        const liste = gruppen.get(k);
        const fehlt = fehlend(liste);
        const titel = k === "__da" ? "Schon da" : k === "__bestellt" ? "Bestellt, Lieferant nicht erkannt"
          : k === "__offen" ? "Lieferant offen" : k;
        const lb = lieferbarText(l);
        const an = fehlt.find((z) => z.ankunft);
        return (
          <div key={k} className="pl-lief" data-pllieferant={titel}>
            <div className="pl-lief__kopf">
              {k.indexOf("__") !== 0 && <span className="pl-lief__logo"><Logo lief={lieferantLogoDaten(l || { name: k })} name={k} /></span>}
              <span className="pl-lief__name">{titel}</span>
              {lb && <span className="pl-marke pl-marke--grau">{lb}</span>}
              {k.indexOf("__") !== 0 && !lb && <span className="pl-marke pl-marke--grau">Lieferzeit unbekannt</span>}
              {an && <span className={"pl-marke " + (fehlt.some((z) => z.zuSpaet) ? "pl-marke--rot" : "pl-marke--gruen")}>
                heute bestellt: da {tagText(an.ankunft.da)}</span>}
              {k === "__offen" && <span className="pl-marke pl-marke--grau">noch nie mit Lieferant bestellt</span>}
              <span className="pl-frei" />
              {fehlt.length > 0 && k.indexOf("__") !== 0 && <button className="pl-knopf" data-plkopieren={k}
                onClick={() => listeKopieren(k, fehlt)}>⧉ Liste kopieren</button>}
            </div>
            {l && l.notiz && <div className="pl-lief__notiz" data-plnotiz="">{l.notiz}</div>}
            <Tabelle zeilen={liste} d={d} neu={neu} mitLieferant={k === "__offen"} />
          </div>
        );
      })}
    </div>
  );
}

function bedarfText(z) {
  if (!z.bedarf) return z.ohneBedarf || "–";
  return (z.bedarf.sicher ? "" : "ca. ") + zahl(z.bedarf.kg) + " kg · " + z.bedarf.stangen + " St.";
}

async function listeKopieren(name, zeilen) {
  const text = name + "\n" + zeilen.map((z) => "- " + z.j.material_bez + ": " + (z.stand === "teil" ? "noch " + zahl(z.fehltKg) + " kg" : bedarfText(z)) + " (für " + z.j.job_number + ", Start " + alt.kurzDatum(z.start) + ")").join("\n");
  try { await navigator.clipboard.writeText(text); alt.meldung("Liste kopiert.", "gut"); }
  catch (f) { alt.meldung("Kopieren ging nicht.", "warn"); }
}

function Tabelle({ zeilen, d, neu, mitLieferant }) {
  return (
    <div className="pl-tabelle">
      {zeilen.map((z) => {
        const farbe = alt.auftragFarbe ? alt.auftragFarbe(z.j, z.j.material_bez) : null;
        const [st, ton0] = STAND[z.stand];
        const ton = z.liefertSpaet ? "rot" : ton0;
        const fehlt = zuBestellen(z);
        return (
          <div key={z.j.id} className={"pl-zeile" + (z.zuSpaet ? " pl-zeile--spaet" : "")} data-plzeile={z.j.job_number}>
            <button className="pl-haken pl-zeile__haken" data-plzerledigt={z.j.id} title="Erledigt, anders geregelt: aus der Liste nehmen"
              aria-label="Erledigt" onClick={() => positionErledigt(z, d, neu)} />
            <span className={"pl-start" + (z.zuSpaet ? " pl-rot" : "")}>{z.anMaschine ? "jetzt" : tagText(z.start)}</span>
            <span className="pl-masch">{z.maschine}</span>
            <button className="pl-hoco" onClick={() => planwandZeigen(z.j)}>{z.j.job_number}</button>
            <span className="pl-mat">
              <i className="pl-punkt" style={{ background: farbe ? farbe.hex : "#667" }} />
              <span>{z.j.material_bez}
                {z.rest.length > 0 && fehlt && <small className="pl-rest"> Rest im Haus: {z.rest.map((p) => (p.menge ? zahl(p.menge) + " " + (p.einheit || "kg") : "")
                  + (p.ort ? " " + p.ort : "")).join(", ")}</small>}
              </span>
            </span>
            <span className="pl-bedarf">{z.bedarf ? <><b>{(z.bedarf.sicher ? "" : "ca. ") + zahl(z.bedarf.kg) + " kg"}</b><small>{z.bedarf.stangen + " Stangen"}</small></> : bedarfText(z)}</span>
            <span className="pl-stand">
              <span className={"pl-chip pl-chip--" + ton}>{st}{z.stand === "teil" ? " " + zahl(z.fehltKg) + " kg (" + zahl(Math.round(z.hatKg)) + " kg da/bestellt)" : ""}{z.stand === "bestellt" && z.j.material_liefertermin ? " · " + z.j.material_liefertermin : ""}
                {z.liefertSpaet ? " · Liefertermin nach Start!" : z.zuSpaet ? " · zu spät!" : ""}</span>
              {fehlt && (mitLieferant || z.quelle) && <LieferantWahl z={z} d={d} neu={neu} />}
              {(z.stand === "offen" || z.stand === "teil") && <small className="pl-text">„{z.j.material_menge}“</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Einzelne Positionen der Materialliste abhaken (seit 1.647.0, Wunsch Patrick
// 19. November 2026: „bei Lieferanten einzelne Pos wegmachen, weil man es
// anders geregelt hat“). Gemeinsam für alle Admins in app_config.planer_quittiert
// unter „z<Auftrag>“; die Meldung „Material fehlt“ im Todo fällt damit auch weg.
// Oben „✓ Erledigte (n)“ zeigt sie mit „Wieder offen“. Ist der Auftrag nicht
// mehr offen, räumt das nächste Abhaken den Eintrag weg.
function zTexte(z) {
  return [(z.j.job_number || "") + " · " + (z.j.material_bez || ""),
    ["Start " + (z.anMaschine ? "jetzt" : tagText(z.start)), z.maschine, z.lieferant, bedarfText(z)].filter(Boolean).join(" · ")];
}
async function positionErledigt(z, d, neu) {
  const [titel, unter] = zTexte(z);
  const k = "z" + z.j.id;
  try {
    await meldungQuittieren(k, titel, unter, new Set(d.offen.map((j) => String(j.id))));
    alt.meldung("Position erledigt: " + z.j.job_number + ". Wieder holen unter „✓ Erledigte“.", "gut");
    neu();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

function matErledigte(d) {
  const offeneIds = new Set(d.offen.map((j) => String(j.id)));
  return Object.entries(d.quittiert || {}).filter(([k]) => k[0] === "z" && offeneIds.has(k.slice(1)))
    .map(([k, v]) => ({ k, ...v }));
}

function MatErledigtKnopf({ d, neu }) {
  const n = matErledigte(d).length;
  return <button className="pl-knopf" id="pl-mat-erledigt" title="Abgehakte Positionen ansehen oder wieder öffnen"
    onClick={() => fensterOeffnen((zu) => <MatErledigt start={matErledigte(d)} zu={zu} neu={neu} />)}>✓ Erledigte ({n})</button>;
}

function MatErledigt({ start, zu, neu }) {
  const [liste, setListe] = useState(start);
  const wieder = async (m) => {
    try { await meldungWiederOffen(m.k); setListe((x) => x.filter((y) => y.k !== m.k)); neu(); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  return (
    <div className="dialog dialog--breit pl-abg" id="pl-mat-erl">
      <div className="dialog__kopf"><h2>Erledigte Positionen</h2>
        <button className="dialog__schliessen-inline" title="Schliessen" onClick={zu}>✕</button></div>
      <div className="pl-abg__liste">
        {!liste.length && <p className="pl-abg__leer">Keine erledigten Positionen.</p>}
        {[...liste].sort((a, b) => String(b.am).localeCompare(String(a.am))).map((m) => (
          <div key={m.k} className="pl-abg__zeile" data-plmaterl={m.k.slice(1)}>
            <span className="pl-abg__text">
              <b>{m.titel}</b>
              <small>{[m.unter, "erledigt " + (m.am ? alt.datumZeitKurz(m.am) : ""), m.von].filter(Boolean).join(" · ")}</small>
            </span>
            <button className="knopf knopf--still" data-plmatwieder={m.k.slice(1)} onClick={() => wieder(m)}>↶ Wieder offen</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Regel je Material: „muss bei“ und „kann auch bei“ (nur Info), vorgefüllt
// mit dem Material ohne Toleranz; der Planer kürzt es selbst, etwa auf
// „Messing Rohr“, damit es für jede Dimension gilt
// Tipp aufs Lieferantenfeld öffnet direkt die Regel für das Material (seit 1.516.0, Wunsch
// Patrick 13. November 2026): oben „Immer dort bestellen“ mit allen Lieferanten, darunter
// „Kann dort bestellt werden“: jede Wahl im Auswahlmenü kommt als Schild ins Feld, dann die
// nächste wählen und so weiter. Ohne Regel vorgefüllt mit dem Vorschlag aus dem Verlauf.
function regelFenster(z, d, neu) {
  fensterOeffnen((zu) => <RegelFenster z={z} d={d} neu={neu} zu={zu} />);
}

const materialOhneToleranz = (bez) => String(bez || "").replace(/\s*\|\s*$/, "")
  .replace(/\b[hgfk]\d{1,2}\b/i, "").replace(/\s+/g, " ").trim();

function RegelFenster({ z, d, neu, zu }) {
  const vorher = z.regel;
  const namen = d.lieferanten.map((l) => l.name);
  const [material, setMaterial] = useState(vorher ? vorher.material : materialOhneToleranz(z.j.material_bez));
  const [muss, setMuss] = useState(vorher ? vorher.muss || "" : (z.lieferant || ""));
  const [kann, setKann] = useState(vorher ? (vorher.kann || []).filter((k) => k !== vorher.muss)
    : z.kandidaten.map((k) => k.name).filter((n) => n !== z.lieferant));
  const [laeuft, setLaeuft] = useState(false);
  const anzahl = Object.fromEntries(z.kandidaten.map((k) => [k.name, k]));
  const mitZahl = (n) => n + (anzahl[n] ? " (" + anzahl[n].anzahl + "× bestellt)" : "");
  const frei = namen.filter((n) => n !== muss && !kann.includes(n));

  const speichern = async (weg) => {
    if (!weg && !material.trim()) { alt.meldung("Material eintragen.", "warn"); return; }
    setLaeuft(true);
    try {
      const alle = (await regelnLaden()).filter((r) => !(vorher && r.material === vorher.material) && r.material !== material.trim());
      if (!weg) alle.push({ material: material.trim(), muss, kann: kann.filter((k) => k !== muss) });
      await regelnSpeichern(alle);
      // Eine frühere Wahl von Hand für diesen Auftrag würde die Regel verdecken
      if (z.quelle === "gewaehlt") await wahlSetzen(z.j.id, null);
      alt.meldung(weg ? "Regel gelöscht." : "Regel gespeichert.", "gut");
      zu(); neu();
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); setLaeuft(false); }
  };

  return (
    <div className="dialog pl-rf" id="pl-regelfenster">
      <div className="dialog__kopf"><h2>Lieferant für {z.j.material_bez}</h2>
        <button className="dialog__schliessen-inline" title="Schliessen" onClick={zu}>✕</button></div>
      <label className="pl-rf__feld">
        <span>Material</span>
        <input type="text" value={material} onChange={(ev) => setMaterial(ev.target.value)} data-plrfmaterial="" />
        <small>Gilt für jedes Material, in dem alle Wörter vorkommen: „Messing Rohr“ für jedes Messing-Rohr, „ETG“ für alles mit ETG.</small>
      </label>
      <label className="pl-rf__feld">
        <span>Immer dort bestellen</span>
        <select value={muss} onChange={(ev) => { const n = ev.target.value; setMuss(n); setKann((k) => k.filter((x) => x !== n)); }}
          data-plrfmuss="">
          <option value="">– keiner –</option>
          {namen.map((n) => <option key={n} value={n}>{mitZahl(n)}</option>)}
        </select>
      </label>
      <div className="pl-rf__feld">
        <span>Kann dort bestellt werden <small>(nur Info)</small></span>
        <div className="pl-rf__schilder" data-plrfkann="">
          {kann.length === 0 && <em>noch keiner</em>}
          {kann.map((n) => (
            <span key={n} className="pl-rf__schild">{mitZahl(n)}
              <button title="Entfernen" onClick={() => setKann((k) => k.filter((x) => x !== n))}>✕</button></span>
          ))}
        </div>
        {frei.length > 0 && (
          <select value="" onChange={(ev) => { const n = ev.target.value; if (n) setKann((k) => [...k, n]); }} data-plrfdazu="">
            <option value="">+ Lieferant hinzufügen …</option>
            {frei.map((n) => <option key={n} value={n}>{mitZahl(n)}</option>)}
          </select>
        )}
      </div>
      <div className="dialog__knoepfe">
        {vorher && <button className="knopf knopf--gefahr-leise" disabled={laeuft} onClick={() => speichern(true)} data-plrfweg="">Regel löschen</button>}
        <button className="knopf knopf--still" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" disabled={laeuft} onClick={() => speichern(false)} data-plrfspeichern="">Speichern</button>
      </div>
    </div>
  );
}

function LieferantWahl({ z, d, neu }) {
  const waehlen = () => regelFenster(z, d, neu);
  return (
    <button className={"pl-lwahl" + (z.quelle === "gewaehlt" ? " pl-lwahl--fest" : "")} data-pllwahl={z.j.job_number} onClick={waehlen}
      title="Lieferant festlegen">
      {z.lieferant ? (z.quelle === "gewaehlt" ? "✓ " : z.quelle === "regel" ? "📌 " : "") + z.lieferant : "Lieferant wählen"}
      {z.auch.length > 0 && <small> auch: {z.auch.join(", ")}</small>}
      {z.kann.length > 0 && <small className="pl-kann" data-plkann=""> kann auch: {z.kann.join(", ")}</small>}
    </button>
  );
}

// ---------- Todo in der Seitenleiste ----------
// Dieselbe Todo-Liste wie im Planer, unten in der Seitenleiste unter den
// Menüpunkten (seit 1.536.0, Wunsch Patrick 13. November 2026: „diesen Teil
// beim Reiter unten, dass es dort aufgelistet wird bei Admins“). Nur Admins,
// nie Externe; lädt still alle drei Minuten neu, solange der Tab sichtbar ist.
export function NavTodos() {
  const [d, setD] = useState(null);
  useEffect(() => {
    let weg = false, laeuft = false;
    const laden = async () => {
      if (laeuft || document.hidden) return;
      laeuft = true;
      try { const x = await planerLaden(10); if (!weg) setD(x); }
      catch (f) { /* still: die Leiste ist nur eine Hilfe */ }
      finally { laeuft = false; }
    };
    laden();
    const uhr = setInterval(laden, 180000);
    const sicht = () => { if (!document.hidden) laden(); };
    document.addEventListener("visibilitychange", sicht);
    window.addEventListener("hofer-planer-neu", laden);
    return () => { weg = true; clearInterval(uhr); document.removeEventListener("visibilitychange", sicht);
      window.removeEventListener("hofer-planer-neu", laden); };
  }, []);
  if (!d) return null;
  const neu = () => window.dispatchEvent(new Event("hofer-planer-neu"));
  // Antippen springt zur Planwand beim Balken statt der schmalen Pad-Planwand
  // (seit 1.556.1, Patrick 15. November 2026: „soll zur Planwand gehen und
  // nicht so komisch öffnen“)
  const oeffnen = (j) => alt.balkenZeigen(j.id);
  return <div className="nav-todo" id="nav-todo"><Todos d={d} neu={neu} titel="Todos" oeffnen={oeffnen} titelKlick={planerTabOeffnen} /></div>;
}
