// =================================================================
//  PAD MODE
//  Eigene Oberfläche für die Tablets an den Maschinen. Schwarzer
//  Hintergrund wegen OLED, grosse Kacheln, wenig Text.
//  Aufbau: Start → Parks → (Typen) → Maschinen → Dashboard.
//
//  Öffnen und Schliessen (das Element #pad über der Seite, die
//  Einblendung, der Leerlaufwächter) macht weiter das alte Programm.
//  Es ruft padZeichnen() auf, sobald sich etwas geändert hat; der
//  Zustand (wo man ist, welcher Park, welche Maschine) liegt wie
//  bisher in alt.pad, weil auch der Abgleich und die Hash-Sprünge ihn
//  lesen.
//
//  Bleibt man in derselben Ansicht (etwa nach dem Speichern), steht
//  der alte Inhalt weiter da, bis der neue fertig ist: kein Aufblitzen
//  von „Wird geladen“. Nur eine neue Ansicht kommt mit Bewegung herein.
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { alt, reactAufraeumen } from "../bruecke.jsx";
import Maschine, { maschineLaden } from "./Maschine.jsx";
import QsCheck, { QsParks, qsLaden } from "./QsCheck.jsx";

let wurzel = null, huelle = null, zaehler = 0;

export function padZeichnen() {
  const h = document.getElementById("pad");
  if (!h) return;
  if (huelle !== h) { padAbbauen(); wurzel = createRoot(h); huelle = h; }
  zaehler++;
  wurzel.render(<Pad h={h} auffrischen={zaehler} />);
}

// Vor dem Entfernen von #pad. Später abbauen, weil Schliessen meist
// aus einem Klick im Pad selbst kommt.
export function padAbbauen() {
  const w = wurzel;
  wurzel = null; huelle = null;
  if (w) queueMicrotask(() => w.unmount());
}

const pad = () => alt.pad;
const gehe = (aendern) => { aendern(alt.pad); padZeichnen(); };

function sichtVon(p) {
  return [p.wo, p.parkId, p.typId, p.maschineId, p.wo === "maschine" ? p.reiter : ""].join("|");
}

// Ein Schritt zurück. In der Zeichnung oder WBG einer Maschine auf ihre
// Übersicht, nicht gleich zur Liste aller Maschinen.
export function padZurueck() {
  gehe((p) => {
    if (p.wo === "maschine" && p.reiter && p.reiter !== "uebersicht") p.reiter = "uebersicht";
    else if (p.wo === "maschine") p.wo = "maschinen";
    else if (p.wo === "maschinen") p.wo = p.typUebersprungen ? "parks" : "typen";
    else if (p.wo === "typen") p.wo = "parks";
    else if (p.wo === "qs") p.wo = p.qsParkUebersprungen ? "start" : "qsparks";
    else if (p.wo === "qsparks") p.wo = "start";
    else p.wo = "start";
  });
}

// Neu laden, und man bleibt, wo man ist (Wunsch Patrick, 10. Oktober
// 2026). padNeuLaden merkt sich Ansicht, Park und Maschine im Tab.
export function PadNeuLadenKnopf() {
  return (
    <button className="pad__neu" data-padneu="" aria-label="Neu laden" title="Neu laden"
      onClick={() => alt.padNeuLaden()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66" />
        <path d="M20 4v5h-5" /></svg>
    </button>
  );
}

// Grosse Knöpfe statt eines schmalen Balkens mit Pfeilchen: an der
// Maschine wird mit Handschuhen getippt.
export function PadKopf({ titel, zurueck }) {
  return (
    <div className="pad__kopf">
      {zurueck
        ? <button className="pad__zurueck" data-padzurueck="" onClick={padZurueck}>‹ Zurück</button>
        : <span className="pad__zurueck pad__zurueck--leer" />}
      <span className="pad__titel">{titel}</span>
      <PadNeuLadenKnopf />
      <button className="pad__zu" data-padzu="" onClick={() => alt.padSchliessen()}
        aria-label="Schliessen">✕<span className="pad__zutext"> Schliessen</span></button>
    </div>
  );
}

// ---------- Laden je Ansicht ----------

async function maschinenLaden(p) {
  const [maschinen, laufend] = await Promise.all([alt.ladeAlleMaschinen(), alt.ladeLaufendeAuftraege()]);
  const eigene = maschinen.filter((m) => m.park_id === p.parkId)
    .filter((m) => !p.typId || p.typId === "__alle"
      || (p.typId === "__ohne" ? !m.type_id : m.type_id === p.typId));
  return { art: "maschinen", eigene, laufend };
}

// Zwischen Park und Maschine: die Maschinentypen dieses Parks. Gibt
// es nur einen Typ, wird die Stufe übersprungen — dann gäbe es nichts
// zu wählen.
async function typenLaden(p) {
  const [maschinen, typen] = await Promise.all([
    alt.ladeAlleMaschinen(),
    alt.db.from("machine_types").select("id, name").then((r) => r.data || []),
  ]);
  const eigene = maschinen.filter((m) => m.park_id === p.parkId);
  const gruppen = {};
  eigene.forEach((m) => {
    const k = m.type_id || "__ohne";
    (gruppen[k] = gruppen[k] || []).push(m);
  });
  const schluessel = Object.keys(gruppen);

  if (schluessel.length <= 1) {
    p.typId = schluessel[0] || null;
    p.typUebersprungen = true;
    p.wo = "maschinen";
    return maschinenLaden(p);
  }
  p.typUebersprungen = false;

  const name = (k) => k === "__ohne" ? "Ohne Typ"
    : ((typen.find((t) => t.id === k) || {}).name || "Typ");
  schluessel.sort((a, b) => name(a).localeCompare(name(b), "de"));
  return { art: "typen", gruppen: schluessel.map((k) => ({ k, name: name(k), anzahl: gruppen[k].length })),
           alle: eigene.length };
}

async function sichtLaden(p) {
  if (p.wo === "parks") {
    // Mit der Zahl der Maschinen je Park, wie beim Anlagen Check
    // (Wunsch Patrick, 10. Oktober 2026)
    const [parks, maschinen] = await Promise.all([alt.ladeParks(false), alt.ladeAlleMaschinen()]);
    const anzahl = {};
    maschinen.forEach((m) => { anzahl[m.park_id] = (anzahl[m.park_id] || 0) + 1; });
    return { art: "parks", parks, anzahl };
  }
  if (p.wo === "typen") return typenLaden(p);
  if (p.wo === "maschinen") return maschinenLaden(p);
  if (p.wo === "maschine") {
    const d = await maschineLaden(p);
    if (d) return d;
    p.wo = "maschinen";
    return maschinenLaden(p);
  }
  if (p.wo === "qs" || p.wo === "qsparks") return qsLaden(p);
  if (p.wo === "planwand") return { art: "planwand" };
  if (String(p.wo).indexOf("seite:") === 0) {
    const pfad = p.wo.slice(6);
    const seite = alt.SEITEN.find((x) => x.pfad === pfad);
    if (seite && alt.seiteSichtbar(pfad)) return { art: "seite", seite };
  }
  p.wo = "start";
  return { art: "start" };
}

// ---------- Hülle ----------

function Pad({ h, auffrischen }) {
  const [stand, setStand] = useState({ sicht: null, daten: null, fehler: null, nr: 0, neu: true });
  const gezeigt = useRef(null);
  const lauf = useRef(0);

  useEffect(() => {
    const nr = ++lauf.current;
    const p = pad();
    const neu = sichtVon(p) !== gezeigt.current;
    if (neu) setStand((s) => ({ ...s, sicht: null, daten: null, fehler: null }));
    else h.classList.add("pad--frischt");

    sichtLaden(p).then(
      (daten) => ({ daten, fehler: null }),
      (fehler) => { alt.meldung(alt.fehlertext(fehler), "fehler"); return { daten: null, fehler }; })
      .then(({ daten, fehler }) => {
        if (nr !== lauf.current) return;
        h.classList.remove("pad--frischt");
        const sicht = sichtVon(p);
        const wirklichNeu = neu || sicht !== gezeigt.current;
        gezeigt.current = sicht;
        setStand({ sicht, daten, fehler, nr, neu: wirklichNeu });
      });
  }, [auffrischen, h]);

  // Nach dem Zeichnen: Bewegung bei einer neuen Ansicht, die neue
  // Stückzahl sichtbar hochzählen, Text der Auftragskachel einpassen
  useLayoutEffect(() => {
    if (!stand.nr || (!stand.daten && !stand.fehler)) return;
    // React-Seiten, die eben aus dem Pad gefallen sind, abbauen
    queueMicrotask(() => reactAufraeumen());
    if (stand.neu) alt.bewegungPad(h);
    alt.padZahlZaehlen(h);
    if (stand.daten && stand.daten.art === "maschine") alt.padTextEinpassen();
  }, [stand, h]);

  if (stand.fehler) {
    return (
      <>
        <PadKopf titel="Fehler" zurueck={pad().wo !== "start"} />
        <div className="pad__fehler">{alt.fehlertext(stand.fehler)}</div>
      </>
    );
  }
  const d = stand.daten;
  if (!d) return <div className="pad__laedt">Wird geladen …</div>;

  if (d.art === "start") return <Start />;
  if (d.art === "parks") return <Parks parks={d.parks} anzahl={d.anzahl} />;
  if (d.art === "typen") return <Typen gruppen={d.gruppen} alle={d.alle} />;
  if (d.art === "maschinen") return <Maschinen eigene={d.eigene} laufend={d.laufend} />;
  if (d.art === "maschine") return <Maschine d={d} />;
  if (d.art === "qsparks") return <QsParks gruppen={d.gruppen} />;
  if (d.art === "qs") return <QsCheck park={d.park} zeilen={d.zeilen} zeichnungen={d.zeichnungen} />;
  if (d.art === "planwand") {
    return <Rahmen key={stand.nr} titel="Planwand" id="pad-planwand" klasse="pad__rolle"
      zeichne={(ziel) => alt.seitePlanwand(ziel)} />;
  }
  return <Rahmen key={stand.nr} titel={d.seite.titel} id="pad-seite" klasse="pad__rolle pad__seite"
    zeichne={(ziel) => d.seite.zeige(ziel)} />;
}

// ---------- Start ----------

function Start() {
  return (
    <>
      <PadKopf titel="" zurueck={false} />
      <div className="pad__start">
        <img className="pad__logo pad__wahllogo" src={alt.LOGO_WEISS} alt="Hofer + Co." />
        {/* Im Pad gibt es nur die Maschinen, darunter seit 1.16.0 der
            QS Check über alle Maschinen (Wunsch Patrick, 10. Oktober 2026) */}
        <div className="pad__kacheln pad__kacheln--einzeln pad__kacheln--start">
          <button className="pad-kachel pad-kachel--gross" data-padwo="parks"
            onClick={() => gehe((p) => { p.wo = "parks"; })}>
            <span className="pad-kachel__zeichen">⚙</span><span>Maschinen</span>
          </button>
          <button className="pad-kachel pad-kachel--qs" data-padwo="qs"
            onClick={() => gehe((p) => { p.wo = "qsparks"; })}>
            <span className="pad-kachel__zeichen">🔍</span><span>Anlagen Check</span>
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- Planwand und übrige Bereiche: dieselbe Seite wie sonst ----------
// Der Rahmen scrollt und wischt in beide Richtungen wie am Handy —
// dafür sorgt die Klasse, die touch-action freigibt.

function Rahmen({ titel, id, klasse, zeichne }) {
  const ref = useRef(null);
  useLayoutEffect(() => { zeichne(ref.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <PadKopf titel={titel} zurueck />
      <div className={klasse + " pad--wischen"} id={id} ref={ref} />
    </>
  );
}

// ---------- Parks ----------

function Parks({ parks, anzahl }) {
  return (
    <>
      <PadKopf titel="Maschinenparks" zurueck />
      <div className="pad__wahl">
        <img className="pad__wahllogo" src={alt.LOGO_WEISS} alt="Hofer + Co." />
        <div className="pad__kacheln pad__kacheln--parks" style={{ "--pad-spalten": spalten(parks.length, 3) }}>
          {parks.length
            ? parks.map((park) => (
                <button key={park.id} className="pad-kachel" data-park={park.id}
                  onClick={() => gehe((p) => { p.parkId = park.id; p.typId = null; p.wo = "typen"; })}>
                  <span>{park.name}</span>
                  <span className="pad-kachel__nr">
                    {(anzahl[park.id] || 0) + ((anzahl[park.id] || 0) === 1 ? " Maschine" : " Maschinen")}
                  </span>
                </button>))
            : <p className="pad__leer">Keine Parks angelegt.</p>}
        </div>
      </div>
    </>
  );
}

// ---------- Typen eines Parks ----------

function Typen({ gruppen, alle }) {
  const waehlen = (k) => gehe((p) => { p.typId = k; p.wo = "maschinen"; });
  return (
    <>
      <PadKopf titel="Maschinentyp" zurueck />
      {/* Kompakt in der Mitte, in gleich vollen Reihen statt einer langen
          Zeile über den ganzen Bildschirm (Wunsch 5. Oktober 2026). */}
      <div className="pad__wahl">
        <img className="pad__wahllogo" src={alt.LOGO_WEISS} alt="Hofer + Co." />
      <div className="pad__kacheln pad__kacheln--typen" style={{ "--pad-spalten": spalten(gruppen.length + 1) }}>
        {gruppen.map((g) => (
          <button key={g.k} className="pad-kachel pad-kachel--typ" data-padtyp={g.k} onClick={() => waehlen(g.k)}>
            <span>{g.name}</span>
            <span className="pad-kachel__nr">{g.anzahl + (g.anzahl === 1 ? " Maschine" : " Maschinen")}</span>
          </button>
        ))}
        <button className="pad-kachel pad-kachel--typ pad-kachel--alle" data-padtyp="__alle"
          onClick={() => waehlen("__alle")}>
          <span>Alle</span><span className="pad-kachel__nr">{alle} Maschinen</span>
        </button>
      </div>
      </div>
    </>
  );
}

// ---------- Maschinen eines Parks ----------

// Gleich volle Reihen statt einer halbleeren letzten: 6 Kacheln werden
// 3 + 3 statt 4 + 2, 7 werden 4 + 3, 10 werden 4 + 3 + 3 …
function spalten(n, hoechstens = 4) {
  if (n <= hoechstens) return Math.max(n, 1);
  return Math.ceil(n / Math.ceil(n / hoechstens));
}

function Maschinen({ eigene, laufend }) {
  return (
    <>
      <PadKopf titel="Maschinen" zurueck />
      <div className="pad__wahl">
        <img className="pad__wahllogo" src={alt.LOGO_WEISS} alt="Hofer + Co." />
        <div className="pad__kacheln pad__kacheln--maschinen" style={{ "--pad-spalten": spalten(eigene.length) }}>
          {eigene.length
            ? eigene.map((m) => {
                const j = laufend[m.id];
                return (
                  <button key={m.id} className="pad-kachel pad-kachel--maschine" data-maschine={m.id}
                    onClick={() => gehe((p) => { p.maschineId = m.id; p.wo = "maschine"; p.reiter = "uebersicht"; })}>
                    <span className="pad-kachel__nr">{m.machine_number || ""}</span>
                    <span>{m.name}</span>
                    <span className="pad-kachel__auftrag">{j ? j.job_number : "kein Auftrag"}</span>
                  </button>
                );
              })
            : <p className="pad__leer">Keine Maschinen in diesem Park.</p>}
        </div>
      </div>
    </>
  );
}
