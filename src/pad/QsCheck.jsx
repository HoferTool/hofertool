// =================================================================
//  PAD MODE: ANLAGEN CHECK (früher QS Check, umbenannt in 1.16.1)
//  Alle Maschinen untereinander, je mit dem Auftrag, der gerade dran
//  ist, und am Ende der Zeile der Zustand zum direkten Wechseln
//  (Wunsch Patrick, 10. Oktober 2026). So geht man beim Rundgang
//  durch die Halle alle Maschinen an einem Tablet durch, ohne jede
//  einzeln zu öffnen.
//
//  „Dran“ ist, was läuft, gerüstet oder geprüft wird (dieselbe Wahl
//  wie im Dashboard). Steht nichts davon auf der Maschine, der
//  nächste geplante Auftrag — der kommt als Nächstes an die Reihe und
//  lässt sich so gleich auf Rüsten setzen. Gewechselt wird über
//  zustandSetzen, also mit denselben Regeln wie überall: Beenden
//  fragt nach und nach der Stückzeit, der nächste rückt auf Rüsten.
// =================================================================
//
//  Seit 1.62.0 alle Maschinen zusammen, ohne Parkwahl, über die ganze
//  Fläche, egal wie gross der Bildschirm ist; je Maschine dazu das
//  Material in seiner Werkstofffarbe und wie weit die Stückzahl ist
//  (Wunsch Patrick, 15. Oktober 2026). Externe sehen dieselbe Ansicht
//  mit ihren Maschinen (ladeMaschinen schränkt sie auf ihre Parks ein).
import { useLayoutEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { PadKopf, padZeichnen } from "./Pad.jsx";
import { qsFenster } from "../teile/QsFenster.jsx";
import { einrichtblattHinweis } from "../einrichtblatt/PadHinweis.jsx";
import { dokZeigen } from "../teile/DokAbruf.jsx";

// Die Zustände in der Reihenfolge, in der ein Auftrag sie durchläuft
const ABLAUF = ["geplant", "ruesten", "laeuft", "fertig"];

export async function qsLaden() {
  const [maschinen, laufend, offen] = await Promise.all([
    alt.ladeMaschinen(false),
    alt.ladeLaufendeAuftraege(),
    alt.db.from("jobs").select("*").is("ended_at", null)
      .not("planned_from", "is", null).order("planned_from")
      .then((r) => (r && r.data) || []),
  ]);
  // Das Auftragsfenster nimmt seine Maschinenliste von dort; im Pad
  // ist sie leer, wenn man vorher nicht auf der Planwand war
  if (!(alt.prod.maschinen || []).length) alt.prod.maschinen = maschinen;
  // Je Maschine der früheste noch geplante Auftrag
  const naechster = {};
  offen.forEach((j) => {
    if (!j.machine_id || !j.planned_from || j.ended_at || j.plan_status === "fertig") return;
    const da = naechster[j.machine_id];
    if (!da || String(j.planned_from) < String(da.planned_from)) naechster[j.machine_id] = j;
  });
  // Nach Nummer, wie man beim Rundgang an den Maschinen vorbeikommt
  const zeilen = maschinen
    .map((m) => ({ m, j: laufend[m.id] || naechster[m.id] || null }))
    .sort((a, b) => String(a.m.machine_number || "").localeCompare(
      String(b.m.machine_number || ""), "de", { numeric: true }));

  // Der nächste geplante Auftrag hat noch keinen Stand nachgetragen
  try {
    await alt.standsNachtragen(zeilen.map((z) => z.j).filter((j) => j && j.stand == null));
  } catch (f) { /* Beiwerk */ }

  // Zeichnung und Material der HOCO Nr., wenn am Auftrag nichts steht
  const nummern = [...new Set(zeilen.map((z) => z.j && z.j.job_number).filter(Boolean))];
  const teile = {};
  if (nummern.length) {
    try {
      const r = await alt.db.from("hoco_parts").select("hoco_nr, zeichnung_url, material").in("hoco_nr", nummern);
      ((r && r.data) || []).forEach((t) => { teile[t.hoco_nr] = t; });
    } catch (f) { /* Beiwerk */ }
  }
  return { art: "qs", zeilen, teile };
}

// Zeichnung und WBG im selben Betrachter wie im Dashboard
function dokOeffnen(art, j, adresse) {
  const istWbg = art === "wbg";
  dokZeigen({ art, titel: (istWbg ? "WBG " : "Zeichnung ") + (j.job_number || ""),
    adresse, hoco: j.job_number, auftragId: j.id, fa: j.fa_nr,
    neu: (a) => { if (istWbg) j.wbg_url = a; else j.drawing_url = a; padZeichnen(); } });
}

async function wechseln(j, wahl) {
  if (!j || wahl === (j.plan_status || "geplant")) return;
  try {
    if (wahl === "fertig") {
      const ok = await alt.nachfragen({
        titel: "Auftrag beenden",
        text: "Auftrag " + j.job_number + " wird abgeschlossen. "
          + "Der nächste Auftrag auf dieser Maschine rückt nach und steht auf Rüsten.",
        bestaetigen: "Auftrag beenden",
      });
      if (!ok) return;
    }
    const vorher = j.plan_status || "geplant";
    const r = await alt.zustandSetzen(j, wahl);
    alt.meldung(j.job_number + ": " + (wahl === "fertig" ? "beendet." : alt.PLANSTATUS[wahl].name + ".")
      + (r.hinweis ? " " + r.hinweis : ""), "gut");
    if (wahl === "fertig") { if (r.naechster && r.hinweis) await einrichtblattHinweis(r.naechster, r.naechster.plan_status); }
    else if (vorher === "geplant") await einrichtblattHinweis(j, wahl);
    try { alt.prod.auftraege = await alt.ladeLaufendeAuftraege(); } catch (g) { /* egal */ }
    padZeichnen();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

// Wie viele Spalten? Jede Karte will etwa 44 × 4,5 Schriftgrössen
// breit und hoch (eine Zeile), schmal 25 × 8 (zwei Zeilen). Gewählt
// wird, was die Schrift am grössten macht; so füllen die Karten jeden
// Bildschirm. Wird die Schrift kleiner als 10 Pixel, rollt die Liste.
const FORMEN = [{ zwei: false, b: 44, h: 4.5 }, { zwei: true, b: 25, h: 8 }];
const LUECKE = 6;
const MIN_SCHRIFT = 10;
function rasterWaehlen(breite, hoehe, n) {
  let best = null;
  for (const f of FORMEN) {
    for (let c = 1; c <= 8; c++) {
      const reihen = Math.ceil(Math.max(n, 1) / c);
      const w = (breite - (c - 1) * LUECKE) / c;
      const h = (hoehe - (reihen - 1) * LUECKE) / reihen;
      const schrift = Math.min(w / f.b, h / f.h, 22);
      // Ab der Mindestschrift rollt es senkrecht, dann zählt nur die Breite
      const wert = schrift >= MIN_SCHRIFT ? schrift : Math.min(w / f.b, MIN_SCHRIFT) - 1 + schrift / 100;
      if (!best || wert > best.wert) best = { wert, spalten: c, zwei: f.zwei, rollt: schrift < MIN_SCHRIFT };
    }
  }
  return best;
}

function useRaster(n) {
  const ref = useRef(null);
  const [raster, setRaster] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const messen = () => {
      // Am Handy rollt das ganze Pad, dort zählt die Höhe des Fensters
      const hoehe = Math.min(el.clientHeight, window.innerHeight - Math.max(0, el.getBoundingClientRect().top));
      const r = rasterWaehlen(el.clientWidth - 16, hoehe - 16, n);
      setRaster((v) => (v && v.spalten === r.spalten && v.zwei === r.zwei && v.rollt === r.rollt ? v : r));
    };
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);
  return [ref, raster];
}

// Die ganze Karte in der Farbe des Balkens auf der Planwand, ohne
// Bezeichnung; die steht im Auftragsfenster (Wunsch Patrick, 15. und
// 16. Oktober 2026)
function materialStil(j, bez) {
  const f = alt.auftragFarbe(j, bez);
  return f ? { "--ak-grund": f.hex, "--ak-schrift": f.schrift } : undefined;
}

// Die HOCO Nr. öffnet das Auftragsfenster wie auf der Planwand; nach dem
// Speichern zeichnet sich das Pad neu statt der Planwand
const PAD_ZIEL = { nachPlanAenderung: () => padZeichnen() };

// Stückzahl: „1'200 von 5'000“ mit Balken. Seit 1.78.0 ein Knopf, der
// das grosse Fenster zum Ausschuss melden öffnet (nicht für Externe,
// die haben die QS-Meldungen noch nicht)
function Fortschritt({ j, m }) {
  const stand = Number(j.stand) || 0;
  const ziel = Number(j.target_quantity) || 0;
  const prozent = ziel ? Math.min(100, Math.round(stand / ziel * 100)) : 0;
  const inhalt = <>
    <span className="pad-ak__zahl">
      <b>{alt.zahlText(stand)}</b><span>{ziel ? "von " + alt.zahlText(ziel) : "Stk"}</span>
    </span>
    <span className="pad-ak__balken"><i style={{ width: prozent + "%" }} /></span>
  </>;
  if (alt.istExtern()) return <div className="pad-ak__fort">{inhalt}</div>;
  return (
    <button type="button" className="pad-ak__fort pad-ak__fort--knopf" data-qsfort={m.id}
      title="Ausschuss melden" onClick={async () => { if (await qsFenster(j, m)) padZeichnen(); }}>{inhalt}</button>
  );
}

export default function QsCheck({ zeilen, teile }) {
  const darf = alt.darfSchreiben();
  const [ref, raster] = useRaster(zeilen.length);
  const klasse = "pad-ak pad--wischen" + (raster && raster.zwei ? " pad-ak--zwei" : "")
    + (raster && raster.rollt ? " pad-ak--rollt" : "");
  return (
    <>
      <PadKopf titel="QS Check" zurueck />
      <div ref={ref} className={klasse} style={{ "--ak-spalten": raster ? raster.spalten : 1 }}>
        {!zeilen.length && <p className="pad__leer">Keine Maschinen.</p>}
        {raster && zeilen.map(({ m, j }) => {
          const st = j ? (j.plan_status || "geplant") : null;
          const teil = (j && teile[j.job_number]) || {};
          const zeichnung = j ? (j.drawing_url || teil.zeichnung_url || "") : "";
          const wbg = j ? (j.wbg_url || "") : "";
          return (
            <div key={m.id} data-qsmaschine={m.id}
              style={j ? materialStil(j, j.material_bez || teil.material || "") : undefined}
              className={"pad-ak__karte" + (st ? " pad-ak__karte--" + st : "")}>
              <div className="pad-ak__innen">
                <div className="pad-ak__kopf">
                  {/* Nur die Nummer, der Typ wie „Star SR-20“ braucht es hier nicht (Wunsch Patrick, 16. Oktober 2026) */}
                  <span className="pad-ak__nr">{m.machine_number || "—"}</span>
                </div>
                {j ? (
                  <>
                    <div className="pad-ak__auftrag">
                      <button className="pad-ak__hoco" data-qsauftrag={j.id}
                        onClick={() => alt.planAuftragDialog(j, PAD_ZIEL)}>{j.job_number}</button>
                    </div>
                    <Fortschritt j={j} m={m} />
                    <div className="pad-ak__doks">
                      {[["zeichnung", "Zeichnung", zeichnung], ["wbg", "WBG", wbg]].map(([art, text, adresse]) => (
                        <button key={art} data-qsdok={art} onClick={() => dokOeffnen(art, j, adresse)}
                          className={"pad-ak__dok pad-knopf--" + art + (adresse ? "" : " pad-ak__dok--leer")}>{text}</button>
                      ))}
                    </div>
                    <div className="pad-ak__zustaende">
                      {ABLAUF.map((k) => (
                        <button key={k} data-qszustand={k} disabled={!darf}
                          className={"pad-ak__knopf" + (k === st ? " pad-ak__knopf--an pad-zustand--" + k : "")}
                          onClick={() => wechseln(j, k)}>
                          <span className="pad-ak__zeichen">{alt.PLANSTATUS[k].zeichen}</span>
                          <span className="pad-ak__wort">{alt.PLANSTATUS[k].name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : <div className="pad-ak__leer">kein Auftrag</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
