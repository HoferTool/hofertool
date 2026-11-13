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
import { padZurueck } from "./Pad.jsx";
import { istPlanerTab, planerTabVerlassen, planerSichtbar } from "./planerTab.js";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { planwandFensterOeffnen } from "./PlanwandFenster.jsx";
import { qsQuittieren } from "../daten/qs.js";
import { planerLaden, zuBestellen, wahlSetzen, regelnLaden, regelnSpeichern, lieferbarText, todoNeu, todoHaken, todoAendern, todoLoeschen } from "../daten/planer.js";
import MaterialLieferanten from "../einstellungen/MaterialLieferanten.jsx";

export { planerSichtbar };

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
// Seit 1.515.0 ganz oben ohne Kopfzeile (Patrick: „das Zurück und Schliessen, Neu laden braucht
// es nicht, beim Dashboard hast du mehr Platz“). Escape geht weiter einen Schritt zurück über
// den unsichtbaren Knopf mit data-padzurueck.
function Reiter({ an, wahl }) {
  return (
    <div className="pl-reiter" role="tablist">
      <button role="tab" className={"pl-reiter__knopf" + (an === "uebersicht" ? " pl-reiter__knopf--an" : "")}
        data-plreiter="uebersicht" onClick={() => wahl("uebersicht")}>📋 Dashboard</button>
      <button role="tab" className={"pl-reiter__knopf" + (an === "planwand" ? " pl-reiter__knopf--an" : "")}
        data-plreiter="planwand" onClick={() => wahl("planwand")}>🗓️ Planwand</button>
      <button hidden data-padzurueck="" onClick={verlassenFragen} />
    </div>
  );
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
    // Im eigenen Tab (seit 1.520.0) geht der Tab zu, sonst einen Schritt zurück
    if (ja) { if (istPlanerTab()) planerTabVerlassen(); else padZurueck(); }
  } finally { fragtGerade = false; }
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

export default function Planer({ d, neu }) {
  const e = einst();
  const um = (aendern) => { aendern(e); neu(); };
  useHell();
  // Schneller Wechsel (seit 1.515.0, Wunsch Patrick 13. November 2026: „das Wechseln von Reiter
  // zu Reiter soll schneller sein“): der Reiter wechselt hier, ohne das Pad neu zu laden. Die
  // Planwand bleibt nach dem ersten Öffnen aufgebaut (nur verborgen), das Dashboard zeigt sofort
  // den letzten Stand und frischt still im Hintergrund auf.
  const [reiter, setReiter] = useState(e.reiter === "planwand" ? "planwand" : "uebersicht");
  const [pwDa, setPwDa] = useState(reiter === "planwand");
  const [dash, setDash] = useState(d.reiter === "planwand" ? null : d);
  const lauf = useRef(0);
  useEffect(() => { if (d.reiter !== "planwand") { lauf.current++; setDash(d); } }, [d]);
  const dashHolen = () => {
    const nr = ++lauf.current;
    planerLaden(e.tage).then((x) => { if (nr === lauf.current) setDash({ art: "planer", ...x }); },
      (f) => { if (nr === lauf.current) alt.meldung(alt.fehlertext(f), "fehler"); });
  };
  // Mit der Planwand gestartet: das Dashboard kurz danach schon vorladen
  useEffect(() => {
    if (dash) return undefined;
    const t = setTimeout(dashHolen, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const wahl = (r) => {
    if (r === reiter) return;
    e.reiter = r;
    setReiter(r);
    if (r === "planwand") {
      setPwDa(true);
      // Die verborgene Tafel misst ihre Höhe neu
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    } else dashHolen();
  };
  return (
    <>
      <Reiter an={reiter} wahl={wahl} />
      {pwDa && <div className="pl-pw-huelle" hidden={reiter !== "planwand"}><PlanwandReiter /></div>}
      {reiter === "uebersicht" && !dash && <div className="pad__laedt">Wird geladen …</div>}
      {reiter === "uebersicht" && dash && <Dashboard d={dash} e={e} um={um} neu={neu} />}
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
  // „Nur für mich“ sieht nur, wer es geschrieben hat (seit 1.520.0)
  const ich = alt.meineProfilId();
  const eigene = (d.todos || []).filter((t) => (t.fuer_alle !== false || t.erstellt_von === ich)
    && (!t.erledigt_am || String(t.erledigt_am) > new Date(Date.now() - 86400000).toISOString()));
  eigene.sort((a, b) => (!!a.erledigt_am - !!b.erledigt_am) || String(a.faellig || "9").localeCompare(String(b.faellig || "9")));
  for (const t of eigene) {
    const spaet = !t.erledigt_am && t.faellig && t.faellig <= heute;
    posten.push({ k: "e" + t.id, art: "eigen", erledigt: !!t.erledigt_am, rot: spaet, sort: "4",
      titel: t.text,
      unter: t.erledigt_am ? "erledigt " + alt.datumZeitKurz(t.erledigt_am) + (t.erledigt_von ? " · " + t.erledigt_von : "")
        : [t.faellig ? "fällig " + tagText(t.faellig) : "", t.fuer_alle === false ? "nur für mich" : t.erstellt_name].filter(Boolean).join(" · "),
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
      // Neue Todos sind zuerst nur für mich, der Schieber stellt auf alle Admins
      // (seit 1.520.0, Wunsch Patrick 13. November 2026)
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
