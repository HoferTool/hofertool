// =================================================================
//  PAD MODE: PLANER (seit 1.507.0, Wunsch Patrick 12. November 2026:
//  „Dashboard für Planer im Pad Mode, aktuelle wichtige Sachen, Todos wie
//  Probleme (auch eigene Sachen verfassen), Materialbestellungen für die
//  nächsten Aufträge zeigen und nach Lieferant sortieren“). Kachel
//  „Planer“ auf dem Startbild des Pads, nur Admins, nie Externe.
//
//  Links Todo: gemeldete Probleme, offene QS-Meldungen, fehlendes
//  Material bald, laufend ohne WBG (alles von selbst) und eigene Todos
//  (Tabelle planer_todos). Rechts das Material der nächsten Aufträge,
//  nach Lieferant gebündelt (Rechnung in src/daten/planer.js).
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Planwand from "../seiten/Planwand.jsx";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { planwandFensterOeffnen } from "./PlanwandFenster.jsx";
import { qsQuittieren } from "../daten/qs.js";
import { planerLaden, zuBestellen, wahlSetzen, regelnLaden, regelnSpeichern, lieferbarText, todoNeu, todoHaken, todoAendern, todoLoeschen } from "../daten/planer.js";
import MaterialLieferanten from "../einstellungen/MaterialLieferanten.jsx";

export const planerSichtbar = () => alt.istAdmin() && !alt.istExtern();

const ZEITRAUM = [[5, "1 Woche"], [10, "2 Wochen"], [20, "4 Wochen"]];
const einst = () => {
  const p = alt.pad;
  if (!p.planer) p.planer = { tage: 10, ansicht: "lieferant", nurFehlt: false };
  return p.planer;
};

export async function planerSichtLaden() {
  // Im Reiter Planwand braucht es die Planer-Daten nicht; die Planwand lädt selbst.
  if (einst().reiter === "planwand") return { art: "planer", reiter: "planwand" };
  return { art: "planer", ...(await planerLaden(einst().tage)) };
}

// Reiter oben im Planer (seit 1.511.0, Wunsch Patrick 13. November 2026: „Planwand soll auch oben
// aufgelistet sein … schön gross mit allen Funktionen … umschaltbar wieder aufs Dashboard“).
function Reiter({ e, neu }) {
  const wahl = (r) => { if (e.reiter !== r) { e.reiter = r; neu(); } };
  const an = e.reiter === "planwand" ? "planwand" : "uebersicht";
  return (
    <div className="pl-reiter" role="tablist">
      <button role="tab" className={"pl-reiter__knopf" + (an === "uebersicht" ? " pl-reiter__knopf--an" : "")}
        data-plreiter="uebersicht" onClick={() => wahl("uebersicht")}>📋 Dashboard</button>
      <button role="tab" className={"pl-reiter__knopf" + (an === "planwand" ? " pl-reiter__knopf--an" : "")}
        data-plreiter="planwand" onClick={() => wahl("planwand")}>🗓️ Planwand</button>
    </div>
  );
}

// Die ganze Planwand wie auf der Seite Planwand, mit allen Knöpfen, über die volle Fläche.
// Wie das Fenster nach Tipp auf eine HOCO Nr. (PlanwandFenster.jsx):
// dieselbe Seite wie im Menü mit Kopfleiste, auf einer hellen Karte
// (Patrick 13. November 2026: „so gefällt es mir, die Ansicht gerne so“)
function PlanwandReiter() {
  const ref = useRef(null);
  const [b, setB] = useState(null);
  useLayoutEffect(() => { setB(ref.current); }, []);
  return (
    <div className="pl-planwand" id="pad-planer-planwand">
      <div className="dialog pad-pw pl-pw-karte">
        <div className="pad-pw__buehne" ref={ref}>{b && <Planwand behaelter={b} />}</div>
      </div>
    </div>
  );
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

export default function Planer({ d, Kopf, neu }) {
  const e = einst();
  const um = (aendern) => { aendern(e); neu(); };
  useHell();
  // Nach d, nicht nach e: beim Umschalten steht bis zum Laden noch die alte Ansicht da.
  if (d.reiter === "planwand") {
    return (
      <>
        <Kopf titel="Planer" zurueck />
        <Reiter e={e} neu={neu} />
        <PlanwandReiter />
      </>
    );
  }
  return (
    <>
      <Kopf titel="Planer" zurueck />
      <Reiter e={e} neu={neu} />
      <div className="pl" id="pad-planer">
        <Todos d={d} neu={neu} />
        <section className="pl-karte pl-material">
          <div className="pl-kopf">
            <h2>Material für die nächsten Aufträge</h2>
            <button className="pl-knopf" id="pl-lieferanten" onClick={() => lieferantenFenster(neu)}>⚙ Lieferanten</button>
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
            <button className={"pl-knopf" + (e.nurFehlt ? " pl-knopf--an" : "")} id="pl-nurfehlt"
              onClick={() => um((x) => { x.nurFehlt = !x.nurFehlt; })}>Nur zu bestellen</button>
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

function Todos({ d, neu }) {
  const heute = d.heute;
  const bald = alt.plusTage(heute, 7);
  const posten = [];
  for (const j of d.offen) {
    if (String(j.problem || "").trim()) posten.push({ k: "p" + j.id, art: "problem", rot: true, sort: "0" + (j.problem_at || ""),
      titel: (j.maschine_nr ? j.maschine_nr + " · " : "") + j.problem,
      unter: [j.job_number, j.problem_at ? alt.datumZeitKurz(j.problem_at) : "", j.problem_von].filter(Boolean).join(" · "),
      haken: () => alt.problemQuittieren(j, null, neu), auf: () => planwandFensterOeffnen(j) });
  }
  for (const q of d.qs) {
    posten.push({ k: "q" + q.id, art: "qs", sort: "1" + q.erstellt_am,
      titel: (d.nrVon[q.machine_id] ? d.nrVon[q.machine_id] + " · " : "") + zahl(q.stueck) + " Stk. Ausschuss am Counter abziehen",
      unter: [q.hoco_nr, q.notiz, alt.datumZeitKurz(q.erstellt_am)].filter(Boolean).join(" · "),
      haken: async () => { if (await qsQuittieren(q)) neu(); } });
  }
  for (const z of d.zeilen) {
    if (!zuBestellen(z) || (z.start > bald && !z.zuSpaet)) continue;
    posten.push({ k: "m" + z.j.id, art: "m", rot: z.zuSpaet, sort: "2" + z.start,
      titel: "Material " + (z.stand === "offen" ? "offen" : z.stand === "teil" ? "reicht nicht" : "fehlt") + ": Start " + tagText(z.start) + (z.maschine ? " auf " + z.maschine : ""),
      unter: [z.j.job_number, z.j.material_bez, z.stand === "offen" ? "„" + z.j.material_menge + "“" : "", z.stand === "teil" ? "fehlen noch " + zahl(z.fehltKg) + " kg" : "",
        z.zuSpaet ? "kommt zu spät" : ""].filter(Boolean).join(" · "),
      auf: () => planwandFensterOeffnen(z.j) });
  }
  for (const j of d.offen) {
    if (j.plan_status !== "laeuft" || j.wbg_url) continue;
    posten.push({ k: "w" + j.id, art: "wbg", sort: "3" + j.job_number,
      titel: (j.maschine_nr ? j.maschine_nr + " " : "") + "läuft ohne WBG", unter: j.job_number, auf: () => planwandFensterOeffnen(j) });
  }
  const eigene = (d.todos || []).filter((t) => !t.erledigt_am || String(t.erledigt_am) > new Date(Date.now() - 86400000).toISOString());
  eigene.sort((a, b) => (!!a.erledigt_am - !!b.erledigt_am) || String(a.faellig || "9").localeCompare(String(b.faellig || "9")));
  for (const t of eigene) {
    const spaet = !t.erledigt_am && t.faellig && t.faellig <= heute;
    posten.push({ k: "e" + t.id, art: "eigen", erledigt: !!t.erledigt_am, rot: spaet, sort: "4",
      titel: t.text,
      unter: t.erledigt_am ? "erledigt " + alt.datumZeitKurz(t.erledigt_am) + (t.erledigt_von ? " · " + t.erledigt_von : "")
        : [t.faellig ? "fällig " + tagText(t.faellig) : "", t.erstellt_name].filter(Boolean).join(" · "),
      haken: async () => { try { await todoHaken(t, !t.erledigt_am); neu(); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); } },
      auf: () => todoBearbeiten(t, neu) });
  }
  // Gemeldete (Probleme, QS) zuerst, gleich darunter die eigenen, dann was
  // von selbst kommt; Erledigtes ganz unten (Patrick 13. November 2026:
  // „eigene sollen gleich unter den gemeldeten kommen“)
  const RANG = { problem: 0, qs: 1, eigen: 2, m: 3, wbg: 4 };
  posten.sort((a, b) => (!!a.erledigt - !!b.erledigt) || RANG[a.art] - RANG[b.art] || a.sort.localeCompare(b.sort));
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
          <h2>Todo {offen > 0 && <span className="pl-anzahl">{offen}</span>}</h2>
          {d.todos !== null && <button className="pl-plus" id="pl-todo-neu" title="Eigenes Todo" onClick={() => todoBearbeiten(null, neu)}>+</button>}
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
                  {{ problem: "PROBLEM", qs: "QS", m: "M", wbg: "WBG", eigen: "EIGEN" }[p.art]}</span>{p.titel}</span>
                {p.unter && <span className="pl-todo__unter">{p.unter}</span>}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

async function todoBearbeiten(t, neu) {
  const w = await alt.dialogFelder({
    titel: t ? "Todo ändern" : "Neues Todo",
    felder: [
      { name: "text", label: "Was ist zu tun?", typ: "textarea", wert: t ? t.text : "", pflicht: true },
      { name: "faellig", label: "Fällig am (freiwillig)", typ: "date", wert: t ? t.faellig || "" : "" },
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
    if (t) await todoAendern(t, { text: w.text.trim(), faellig: w.faellig || null });
    else await todoNeu(w.text.trim(), w.faellig);
    neu();
  } catch (f) {
    alt.meldung(/planer_todos|schema cache|does not exist/i.test(f.message || "")
      ? "Eigene Todos brauchen zuerst sql/planer-todos.sql." : alt.fehlertext(f), "fehler");
  }
}

// ---------- Material ----------

function Material({ d, e, neu }) {
  let zeilen = d.zeilen;
  if (e.nurFehlt) zeilen = zeilen.filter(zuBestellen);
  if (!zeilen.length) return <p className="pl-leer">Keine Aufträge mit Material bis {tagText(d.bis)}.</p>;
  if (e.ansicht === "start") {
    return <div className="pl-gruppen"><div className="pl-lief"><Tabelle zeilen={zeilen} d={d} neu={neu} mitLieferant /></div></div>;
  }
  const vonName = Object.fromEntries(d.lieferanten.map((l) => [l.name, l]));
  const gruppen = new Map();
  const dazu = (k, z) => { if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(z); };
  for (const z of zeilen) {
    if (z.lieferant) dazu(z.lieferant, z);
    else if (z.stand === "bestellt") dazu("__bestellt", z);
    else dazu("__offen", z);
  }
  const fehlend = (l) => l.filter(zuBestellen);
  const reihe = [...gruppen.keys()].sort((a, b) => {
    const rang = (k) => (k === "__bestellt" ? 3 : k === "__offen" ? 1 : fehlend(gruppen.get(k)).length ? 0 : 2);
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
        const titel = k === "__bestellt" ? "Bestellt, Lieferant nicht erkannt"
          : k === "__offen" ? "Lieferant offen" : k;
        const lb = lieferbarText(l);
        const an = fehlt.find((z) => z.ankunft);
        return (
          <div key={k} className="pl-lief" data-pllieferant={titel}>
            <div className="pl-lief__kopf">
              <span className="pl-lief__name">{titel}</span>
              {lb && <span className="pl-marke pl-marke--grau">{lb}</span>}
              {k !== "__bestellt" && k !== "__offen" && !lb && <span className="pl-marke pl-marke--grau">Lieferzeit unbekannt</span>}
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
  if (!z.bedarf) return z.rahmen ? "Rahmen" : "–";
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
        const [st, ton] = STAND[z.stand];
        const fehlt = zuBestellen(z);
        return (
          <div key={z.j.id} className={"pl-zeile" + (z.zuSpaet ? " pl-zeile--spaet" : "")} data-plzeile={z.j.job_number}>
            <span className={"pl-start" + (z.zuSpaet ? " pl-rot" : "")}>{z.j.plan_status === "geplant" ? tagText(z.start) : "jetzt"}</span>
            <span className="pl-masch">{z.maschine}</span>
            <button className="pl-hoco" onClick={() => planwandFensterOeffnen(z.j)}>{z.j.job_number}</button>
            <span className="pl-mat">
              <i className="pl-punkt" style={{ background: farbe ? farbe.hex : "#667" }} />
              <span>{z.j.material_bez}
                {z.rest.length > 0 && fehlt && <small className="pl-rest"> Rest im Haus: {z.rest.map((p) => (p.menge ? zahl(p.menge) + " " + (p.einheit || "kg") : "")
                  + (p.ort ? " " + p.ort : "")).join(", ")}</small>}
              </span>
            </span>
            <span className="pl-bedarf">{bedarfText(z)}</span>
            <span className="pl-stand">
              <span className={"pl-chip pl-chip--" + ton}>{st}{z.stand === "teil" ? " " + zahl(z.fehltKg) + " kg (" + zahl(Math.round(z.hatKg)) + " kg da/bestellt)" : ""}{z.stand === "bestellt" && z.j.material_liefertermin ? " · " + z.j.material_liefertermin : ""}
                {z.zuSpaet ? " · zu spät!" : ""}</span>
              {fehlt && (mitLieferant || z.quelle) && <LieferantWahl z={z} d={d} neu={neu} />}
              {(z.stand === "offen" || z.stand === "teil") && <small className="pl-text">„{z.j.material_menge}“</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Regel je Material: „muss bei“ und „kann auch bei“ (nur Info), vorgefüllt
// mit dem Material ohne Toleranz; der Planer kürzt es selbst, etwa auf
// „Messing Rohr“, damit es für jede Dimension gilt
async function regelDialog(z, d, neu) {
  const vorher = z.regel;
  const material = vorher ? vorher.material
    : String(z.j.material_bez || "").replace(/\s*\|\s*$/, "").replace(/\b[hgfk]\d{1,2}\b/i, "").replace(/\s+/g, " ").trim();
  const namen = d.lieferanten.map((l) => [l.name, l.name]);
  const w = await alt.dialogFelder({
    titel: "Regel für Material",
    text: "Gilt für jedes Material, in dem alle Wörter vorkommen. „Messing Rohr“ gilt für jedes Messing-Rohr, „Automatenstahl rd 24“ nur für Ø24, „ETG“ für alles mit ETG.",
    felder: [
      { name: "material", label: "Material", wert: material, pflicht: true },
      { name: "muss", label: "Muss bestellt werden bei", wert: vorher ? vorher.muss : (z.lieferant || ""), auswahl: [["", "– keiner –"], ...namen] },
      { name: "kann", label: "Kann auch bestellt werden bei (nur Info, nie im Vorschlag)", wert: vorher ? vorher.kann : [], mehrfach: namen },
      ...(vorher ? [{ name: "weg", typ: "haken", label: "Regel löschen" }] : []),
    ],
    bestaetigen: "Regel speichern",
  });
  if (!w) return;
  try {
    const alle = (await regelnLaden()).filter((r) => !vorher || r.material !== vorher.material);
    if (!w.weg) alle.push({ material: w.material, muss: w.muss, kann: w.kann });
    await regelnSpeichern(alle);
    alt.meldung(w.weg ? "Regel gelöscht." : "Regel gespeichert.", "gut");
    neu();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

function LieferantWahl({ z, d, neu }) {
  const waehlen = async () => {
    const kand = new Set(z.kandidaten.map((k) => k.name));
    const opt = [
      ...z.kandidaten.map((k) => ({ wert: k.name, text: k.name + " (" + k.anzahl + "× bestellt" + (k.zuletzt ? ", zuletzt " + alt.kurzDatum(k.zuletzt) : "") + ")" })),
      ...d.lieferanten.filter((l) => !kand.has(l.name)).map((l) => ({ wert: l.name, text: l.name })),
    ];
    if (z.quelle === "gewaehlt") opt.push({ wert: "__weg", text: "Vorschlag der App nehmen" });
    opt.push({ wert: "__regel", text: z.regel ? "📌 Regel ändern: „" + z.regel.material + "“" : "📌 Regel für dieses Material …" });
    const w = await alt.auswahlDialog("Lieferant für " + z.j.job_number, opt, z.j.material_bez);
    if (!w) return;
    if (w === "__regel") { await regelDialog(z, d, neu); return; }
    try { await wahlSetzen(z.j.id, w === "__weg" ? null : w); neu(); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  return (
    <button className={"pl-lwahl" + (z.quelle === "gewaehlt" ? " pl-lwahl--fest" : "")} data-pllwahl={z.j.job_number} onClick={waehlen}
      title="Lieferant wechseln">
      {z.lieferant ? (z.quelle === "gewaehlt" ? "✓ " : z.quelle === "regel" ? "📌 " : "") + z.lieferant : "Lieferant wählen"}
      {z.auch.length > 0 && <small> auch: {z.auch.join(", ")}</small>}
      {z.kann.length > 0 && <small className="pl-kann" data-plkann=""> kann auch: {z.kann.join(", ")}</small>}
    </button>
  );
}
