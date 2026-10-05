// =================================================================
//  PAD MODE: DASHBOARD EINER MASCHINE
//  Drei Spalten: links der Auftrag mit der Info an der Maschine, in der Mitte alles zur
//  Stückzahl samt Tagesdiagramm, rechts Tag, Wetter und was danach
//  auf dieser Maschine kommt. Darunter die grossen Knöpfe.
//
//  Alle Felder und Knöpfe stehen immer da. Fehlt etwas, steht ein
//  Hinweis statt eines leeren Platzes — so sieht die Maschine an der
//  Wand immer gleich aus.
//
//  Zifferblock, Werkzeugwechsel, Einrichtblatt und der Betrachter
//  für Zeichnung und WBG sind noch Fenster aus dem alten Programm.
// =================================================================
import { useState } from "react";
import { alt } from "../bruecke.jsx";
import { padZeichnen, padZurueck } from "./Pad.jsx";
import { Ziffern } from "../effekte/Ziffern.jsx";
import { FettText } from "../teile/FettText.jsx";
import Skizze from "./Skizze.jsx";
import {
  holeWetterStunden, wetterZeichen, tagesmengen, letzteTage, schnitte,
  schnittTage, schnittLang, naechsteAuftraege, prognose,
} from "./daten.js";

const zweistellig = (n) => String(n).padStart(2, "0");
const prozent = (j) => Math.min(100, Math.round((j.stand || 0) / j.target_quantity * 100));

// Alles, was das Dashboard zeigt. null, wenn die Maschine fehlt.
export async function maschineLaden(p) {
  const [maschinen, laufend] = await Promise.all([alt.ladeAlleMaschinen(), alt.ladeLaufendeAuftraege()]);
  const m = maschinen.find((x) => x.id === p.maschineId);
  if (!m) return null;

  const j = laufend[m.id] || null;
  let teil = null;
  if (j && j.job_number) {
    try { teil = await alt.ladeHocoEins(j.job_number); } catch (f) { /* Beiwerk */ }
  }

  // Was im Einrichtblatt steht, hängt an HOCO Nr. und Maschinentyp.
  // Warum steht dort nichts? Das Pad soll den Grund nennen, statt
  // stumm "keine vorhanden" zu zeigen.
  let programm = "", blattDaten = null, programmGrund = "";
  if (!j) programmGrund = "kein Auftrag";
  else if (!m.type_id) programmGrund = "Maschine ohne Typ";
  if (j && j.job_number && m.type_id) {
    try {
      const r = await alt.db.from("hoco_type_data").select("*")
        .eq("hoco_nr", j.job_number).eq("type_id", m.type_id).limit(1);
      blattDaten = ((r && r.data) || [])[0] || null;
      programm = (blattDaten && blattDaten.programm_nr) || "";
    } catch (f) { /* Beiwerk */ }
    if (!programm) programmGrund = "nicht eingetragen";
  }

  const [jeTag, danach, wetter] = await Promise.all([
    // Statistik nur des laufenden Auftrags: Sie beginnt bei jedem
    // Auftragswechsel neu. Ohne Auftrag alles dieser Maschine.
    tagesmengen(m.id, j ? j.id : null),
    naechsteAuftraege(m.id, j ? j.id : null),
    holeWetterStunden().catch(() => null),
  ]);
  if (!p.reiter) p.reiter = "uebersicht";
  return { art: "maschine", m, j, teil, blattDaten, programm, programmGrund, jeTag, danach, wetter };
}

// ---------- Aktionen ----------

async function zustandWechseln(m, j) {
  try {
    if (j) {
      const PLANSTATUS = alt.PLANSTATUS;
      const wahl = await alt.auswahlDialog("Zustand — " + j.job_number,
        Object.keys(PLANSTATUS).filter((k) => k !== j.plan_status)
          .map((k) => ({ wert: k,
            text: PLANSTATUS[k].zeichen + "  " + PLANSTATUS[k].name
              + (k === "fertig" ? "  · nächster rückt nach" : "") })));
      if (!wahl) return;
      if (wahl === "fertig") {
        const ok = await alt.nachfragen({
          titel: "Auftrag beenden",
          text: "Auftrag " + j.job_number + " wird abgeschlossen. "
            + "Der nächste Auftrag auf dieser Maschine rückt nach und läuft.",
          bestaetigen: "Auftrag beenden",
        });
        if (!ok) return;
      }
      const r = await alt.zustandSetzen(j, wahl);
      alt.meldung((wahl === "fertig" ? "Auftrag beendet." : "Zustand geändert.")
        + (r.hinweis ? " " + r.hinweis : ""));
    } else {
      const n = await alt.db.from("jobs").select("*").eq("machine_id", m.id)
        .is("ended_at", null).not("planned_from", "is", null)
        .order("planned_from").limit(1);
      const naechster = n && n.data && n.data[0];
      if (!naechster) {
        alt.meldung("Für diese Maschine ist nichts eingeplant.", "warn");
        return;
      }
      const ok = await alt.nachfragen({
        titel: "Auftrag starten",
        text: naechster.job_number + " auf " + m.name + " starten?",
        bestaetigen: "Starten",
      });
      if (!ok) return;
      const r = await alt.zustandSetzen(naechster, "laeuft");
      alt.meldung(naechster.job_number + " läuft." + (r.hinweis ? " " + r.hinweis : ""));
    }
    try { alt.prod.auftraege = await alt.ladeLaufendeAuftraege(); } catch (g) { /* egal */ }
    padZeichnen();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

// Ein Feld am Blatt (HOCO Nr. und Typ) setzen, etwa die Info oder
// das Abendstück. Fehlt die Spalte noch, kommt ein Hinweis aufs SQL.
async function blattFeldSetzen(j, m, feld, wert) {
  const { error } = await alt.db.from("hoco_type_data").upsert(
    { hoco_nr: j.job_number, type_id: m.type_id, [feld]: wert },
    { onConflict: "hoco_nr,type_id" });
  if (error) {
    alt.meldung(new RegExp(feld).test(error.message || "")
      ? "Dafür fehlt noch blattpdf.sql in der Datenbank."
      : alt.fehlertext(error), "fehler");
    return;
  }
  alt.meldung(wert ? "Gespeichert." : "Eintrag entfernt.");
  padZeichnen();
}

async function infoBearbeiten(j, m, blattDaten) {
  const w = await alt.dialogFelder({ titel: "Info an der Maschine",
    hinweis: "Steht nur hier im Pad Mode. Läuft dieselbe HOCO Nr. später "
      + "wieder auf diesem Typ, steht der Text wieder da.",
    felder: [{ name: "text", label: "Text", typ: "textarea", fett: true,
               wert: (blattDaten && blattDaten.pad_info) || "" }],
    bestaetigen: "Speichern" });
  if (w) blattFeldSetzen(j, m, "pad_info", (w.text || "").trim() || null);
}

async function abendBearbeiten(j, m, blattDaten) {
  const zahl = await alt.zifferblock({ titel: "Stück am Abend",
    hinweis: "Wie viele Stück sind am Abend einzutragen?",
    wert: (blattDaten && blattDaten.abend_stk) || "",
    schritte: [50, 100, 500] });
  if (zahl !== null) blattFeldSetzen(j, m, "abend_stk", zahl ? Math.round(zahl) : null);
}

async function standEintragen(j, m) {
  const zahl = await alt.zifferblock({ titel: "Stückzahl eintragen",
    hinweis: "Zählerstand, gesamt seit Auftragsbeginn"
      + (j.target_quantity ? " · Ziel " + alt.zahlText(j.target_quantity) : ""),
    wert: j.stand || 0 });
  if (zahl === null) return;
  // Vor dem Speichern merken: danach steht der neue Wert schon im Auftrag
  const standVorher = j.stand || 0;
  const neu = Math.max(0, Math.round(zahl));
  try {
    await alt.speichereStand(m.id, alt.isoDatum(new Date()), neu, j.id);
    // Dieselbe Ablage wie in der Produktion — was hier eingetragen
    // wird, steht dort und auf der Planwand, und umgekehrt.
    try { alt.prod.auftraege = await alt.ladeLaufendeAuftraege(); } catch (g) { /* egal */ }
    alt.meldung("Stückzahl eingetragen.");
    // Die neue Zahl zählt nach dem Neuzeichnen sichtbar hoch
    alt.pad.zaehlen = { von: standVorher, auf: neu };
    padZeichnen();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

function knopfGedrueckt(wert, { m, j, zeichnung, wbg }) {
  if (wert === "blatt") {
    if (!j) { alt.meldung("Auf dieser Maschine läuft kein Auftrag — ohne HOCO Nr. "
      + "gibt es kein Einrichtblatt.", "warn"); return; }
    if (!m.type_id) { alt.meldung("Dieser Maschine ist kein Typ zugewiesen. Das wird "
      + "unter Produktion → Maschinen eingestellt.", "warn"); return; }
    alt.einrichtblattPdfOeffnen(j.job_number, m.type_id, j.job_number);
    return;
  }
  if (wert === "wechsel") {
    if (!m.type_id) { alt.meldung("Dieser Maschine ist kein Typ zugewiesen — ohne Typ "
      + "gibt es keine Werkzeugplätze.", "warn"); return; }
    alt.werkzeugWechselDialog(m, j);
    return;
  }
  if (wert === "zeichnung" && !zeichnung) {
    alt.meldung("Keine Zeichnung hinterlegt — weder am Auftrag noch bei der HOCO Nr.", "warn");
    return;
  }
  if (wert === "wbg" && !wbg) {
    alt.meldung(j
      ? "Für diesen Auftrag ist keine WBG hinterlegt. Hochladen geht im "
        + "Auftragsfenster auf der Planwand."
      : "Ohne laufenden Auftrag gibt es keine WBG.", "warn");
    return;
  }
  // Zeichnung und WBG öffnen im selben Betrachter wie das
  // Einrichtblatt — gleiche Leiste, gleiche Knöpfe, Schliessen führt
  // zurück auf diese Maschine
  const adresse = wert === "zeichnung" ? zeichnung : wbg;
  const titel = (wert === "zeichnung" ? "Zeichnung " : "WBG ") + ((j && j.job_number) || "");
  alt.betrachter(adresse, titel, !/\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(adresse));
}

// ---------- Teile ----------

// Eine Zeile im Auftragsblock, nur wenn es etwas zu zeigen gibt
function Zeile({ name, wert }) {
  if (!wert) return null;
  return <><b>{name}</b><span>{wert}</span></>;
}

function Leer({ children }) {
  return <span className="pad-leer">{children}</span>;
}

// Die Balken der Stückzahl-Kachel: Tage zeigen die Menge je Tag,
// Wochen und Monate den Schnitt pro Produktionstag
function StkBalken({ jeTag, art }) {
  const zahlText = alt.zahlText;
  if (art === "woche" || art === "monat") {
    const g = schnitte(jeTag, art);
    const hoechste = Math.max(1, ...g.map((x) => x.schnitt || 0));
    return g.map((x) => (
      <div key={x.von} className={"pad-tag" + (x.jetzt ? " pad-tag--heute" : "")}>
        <b>{x.schnitt === null ? "–" : zahlText(x.schnitt)}</b>
        <i style={{ height: (x.schnitt ? Math.max(3, Math.round(x.schnitt / hoechste * 100)) : 2) + "%" }} />
        <u>{x.titel}</u>
        <small>{x.tage ? zahlText(x.summe) + " · " + x.tage + " T" : "—"}</small>
      </div>
    ));
  }
  const tage = letzteTage(jeTag);
  const hoechste = Math.max(1, ...tage.map((t) => t.menge || 0));
  return tage.map((t) => (
    <div key={t.datum} className={"pad-tag" + (t.heute ? " pad-tag--heute" : "")}>
      <b>{t.menge === null || t.menge === undefined ? "–" : zahlText(t.menge)}</b>
      <i style={{ height: (t.menge ? Math.max(3, Math.round(t.menge / hoechste * 100)) : 2) + "%" }} />
      <u>{t.heute ? "Heute" : t.wochentag + " " + t.nummer + "."}</u>
      <small>{t.uhr || "—"}</small>
    </div>
  ));
}

// Seit wann die Statistik zählt: Beginn des laufenden Auftrags
function seitText(auftrag) {
  if (!auftrag || !auftrag.started_at) return "";
  const d = new Date(auftrag.started_at);
  return isNaN(d) ? "" : "seit Auftragsbeginn " + alt.kurzDatum(alt.isoDatum(d));
}

function StkFuss({ jeTag, art, auftrag }) {
  const zahlText = alt.zahlText;
  const seit = seitText(auftrag);
  if (art === "woche" || art === "monat") {
    const mitWert = schnitte(jeTag, art).filter((x) => x.tage);
    const summe = mitWert.reduce((n, x) => n + x.summe, 0);
    const tage = mitWert.reduce((n, x) => n + x.tage, 0);
    return (
      <>
        <span>Ø {tage ? zahlText(Math.round(summe / tage)) : "–"} pro Produktionstag</span>
        <span>{seit || (art === "woche" ? "letzte 8 Wochen" : "letzte 6 Monate")} · Zahl oben = Ø pro Tag</span>
      </>
    );
  }
  // Für die Prognose zählt der längere Schnitt — ein einzelner
  // schwacher Tag soll das Enddatum nicht wegschieben
  const schnitt = schnittTage(letzteTage(jeTag));
  return (
    <>
      <span>Schnitt {zahlText(schnitt)} pro Tag{seit && <span className="pad-stk-seit"> · {seit}</span>}</span>
      <span>{prognose(auftrag, schnittLang(jeTag) || schnitt)}</span>
    </>
  );
}

// Kurzer Verlauf unter den Tagesbalken: wie sich die Stückzahl
// entwickelt hat, dazu die Linie, die der Plan vorgibt.
function Verlauf({ tage, auftrag }) {
  const punkte = tage
    .map((t, i) => ({ i, stand: t.eintrag ? t.eintrag.stand : null }))
    .filter((x) => x.stand !== null);
  if (punkte.length < 2 || !auftrag) return null;

  const B = 600, H = 70;
  const ziel = Number(auftrag.target_quantity) || 0;
  const gross = Math.max(ziel || 1, ...punkte.map((x) => x.stand));
  const letzte = Math.max(1, tage.length - 1);
  const x = (i) => (i / letzte) * B;
  const y = (w) => H - (w / gross) * (H - 6) - 3;

  const linie = punkte.map((pk, k) => (k ? "L" : "M")
    + x(pk.i).toFixed(1) + " " + y(pk.stand).toFixed(1)).join(" ");
  const flaeche = linie + " L" + x(punkte[punkte.length - 1].i).toFixed(1)
    + " " + H + " L" + x(punkte[0].i).toFixed(1) + " " + H + " Z";

  return (
    <div className="pad-verlauf">
      <svg viewBox={"0 0 " + B + " " + H} preserveAspectRatio="none">
        <defs><linearGradient id="padFuell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9fd0ff" stopOpacity=".45" />
          <stop offset="100%" stopColor="#9fd0ff" stopOpacity="0" />
        </linearGradient></defs>
        {!!ziel && <line x1="0" y1={y(ziel).toFixed(1)} x2={B} y2={y(ziel).toFixed(1)}
          className="pad-verlauf__ziel" />}
        <path d={flaeche} className="pad-verlauf__flaeche" />
        <path d={linie} className="pad-verlauf__linie" />
      </svg>
      <div className="pad-verlauf__achse"><span>Verlauf der Stückzahl</span>
        {!!ziel && <span>Ziel {alt.zahlText(ziel)}</span>}</div>
    </div>
  );
}

function Fortschritt({ j }) {
  const r = j ? alt.fortschrittRechnen(j) : null;
  if (!r) {
    return <><span className="pad-name">Fortschritt</span>
      <span className="pad-wert"><Leer>kein Auftrag</Leer></span></>;
  }
  const t = r.tage;
  return (
    <>
      <span className="pad-name">{t < -0.5 ? "Verzug" : (t > 0.5 ? "Vorsprung" : "Im Plan")}</span>
      <span className={"pad-wert " + (t < -0.5 ? "pad-wert--rot" : "")}>
        {Math.abs(t) <= 0.5 ? "±0" : (t > 0 ? "+" : "") + t.toFixed(1).replace(".", ",")}
        {" "}<small>Tage{r.stueck ? " · " + (r.stueck > 0 ? "+" : "") + alt.zahlText(r.stueck) + " Stk" : ""}</small>
      </span>
    </>
  );
}

// Material und Werkstoff: eigene Kachel, Farbe der Werkstoffgruppe
function Material({ j, teil, ort }) {
  const bez = (j && j.material_bez) || (teil && teil.material) || "";
  const g = alt.werkstoffErkennen(bez);
  const f = g ? alt.farbeVon(g.farbe) : null;
  const menge = j && j.material_menge ? String(j.material_menge) : "";
  return (
    <div className={"pad-karte2 pad-karte2--material" + (f ? " pad-karte2--gefuellt" : "")}
      style={f ? { "--wf": f.hex, "--wfs": alt.schriftZu(f.hex) } : undefined}>
      <span className="pad-name">Material</span>
      <div className="pad-mat-zeile">
        <span className="pad-mat-bez">{bez || <Leer>nicht erfasst</Leer>}</span>
        {g && <span className="pad-mat-gruppe"><i />{g.name}{g.zusatz && <> <small>{g.zusatz}</small></>}</span>}
      </div>
      <div className="pad-mat-unten">
        {menge && <span>Menge <b>{menge}</b></span>}
        {g && g.spaene && <span>Späne <b>{g.spaene}</b></span>}
        {g && g.schrott && g.schrott !== g.spaene && <span>Schrott <b>{g.schrott}</b></span>}
        {ort && <span>📦 {ort}</span>}
      </div>
    </div>
  );
}

function Saeule({ wetter, danach }) {
  const jetzt = new Date();
  const heute = alt.isoDatum(jetzt);
  return (
    <div className="pad-karte2 pad-karte2--saeule">
      <div className="pad-uhrblock">
        <div><span className="pad-wtag">{alt.WOCHENTAGE[(jetzt.getDay() + 6) % 7]}</span>
          <div className="pad-uhr" id="pad-uhr"><Ziffern text={zweistellig(jetzt.getHours()) + ":" + zweistellig(jetzt.getMinutes())} /></div>
          <span className="pad-wdatum">{alt.kurzDatum(heute)} · KW {alt.kalenderwoche(heute)}</span></div>
        {wetter
          ? <div className="pad-wetterblock">
              <span className="pad-wzeichen">{wetterZeichen(wetter.code)}</span>
              <span className="pad-grad">{wetter.temperatur}°</span>
              <span className="pad-ort">{wetter.text}<br />Lohn-Ammannsegg</span>
            </div>
          : <span className="pad-ort">Wetter nicht verfügbar</span>}
      </div>

      {wetter && wetter.stunden.length > 0 && <>
        <div className="pad-stunden">
          {wetter.stunden.map((x) => (
            <div key={x.stunde}><b>{x.stunde}</b><i>{wetterZeichen(x.code)}</i><u>{x.grad}°</u></div>
          ))}
        </div>
        {wetter.untergang && <span className="pad-klein">Sonnenuntergang {wetter.untergang}</span>}
      </>}

      <div className="pad-linie" />
      <span className="pad-name">Als Nächstes auf dieser Maschine</span>
      {danach.length
        ? <div className="pad-danach">
            {danach.map((x) => (
              <div key={x.id} className="pad-danach__zeile">
                <b>{x.job_number}</b>
                <span>{(x.planned_from ? "ab " + alt.kurzDatum(x.planned_from) : "")
                  + (x.target_quantity ? " · " + alt.zahlText(x.target_quantity) : "")}</span>
              </div>
            ))}
          </div>
        : <span className="pad-klein">Nichts weiter eingeplant.</span>}
    </div>
  );
}

// ---------- Dashboard ----------

export default function Maschine({ d }) {
  const { m, j, teil, blattDaten, programm, programmGrund, jeTag, danach, wetter } = d;
  const pad = alt.pad;
  const zahlText = alt.zahlText;
  const [stkAnsicht, setStkAnsicht] = useState(pad.stkAnsicht || "tag");
  const mitTyp = !!(j && m.type_id);

  // Die Zeichnung kommt vom Auftrag, sonst aus den Stammdaten der
  // HOCO Nr. — sie ist für jeden Durchlauf dieselbe. Die WBG gehört zu
  // genau einer FA Nr., deshalb gibt es dort keine Ausweichsuche.
  const zeichnung = (j && j.drawing_url) || (teil && teil.zeichnung_url) || "";
  const wbg = (j && j.wbg_url) || "";
  const datei = pad.reiter === "zeichnung" ? zeichnung : (pad.reiter === "wbg" ? wbg : "");
  const kontext = { m, j, zeichnung, wbg };

  const padInfo = (blattDaten && blattDaten.pad_info) || "";
  const tage = letzteTage(jeTag);
  // Heute steht erst morgen fest (eingetragen wird am Morgen danach),
  // darum der jüngste Tag mit einer Menge
  const zuletzt = [...tage].reverse().find((t) => t.menge !== null && t.menge !== undefined);
  const status = j ? (alt.PLANSTATUS[j.plan_status] || alt.PLANSTATUS.geplant) : null;

  const ansichtWaehlen = (e, w) => {
    e.stopPropagation();
    pad.stkAnsicht = w;
    setStkAnsicht(w);
  };

  const druck = (e) => {
    const rahmen = e.currentTarget.closest("#pad").querySelector("iframe");
    try { rahmen.contentWindow.focus(); rahmen.contentWindow.print(); }
    catch (f) { window.open(datei, "_blank"); }
  };
  const neuerTab = () => {
    const w = window.open(datei, "_blank");
    if (!w) alt.meldung("Das Fenster wurde blockiert. Bitte Pop-ups erlauben.", "warn");
  };
  const speichern = () => {
    const a = document.createElement("a");
    a.href = datei; a.download = (pad.reiter === "wbg" ? "WBG" : "Zeichnung") + ".pdf";
    a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  };

  // Die Sprünge sitzen in der Kopfzeile, neben Name und Nummer.
  // Dadurch bleibt für die Zeichnung die ganze Fläche übrig.
  const kopf = (
    <div className="pad__kopf pad__kopf--dash">
      <img className="pad__logo2" src="./logo.png" alt="Hofer + Co." />
      <button className="pad__zurueck" data-padzurueck="" onClick={padZurueck}>‹ Zurück</button>
      <span className="pad__titel pad__titel--links">
        {m.name}{m.machine_number && <> <span className="pad__nr">{m.machine_number}</span></>}
      </span>
      <div className="pad__sprunge">
        {datei && <>
          <button className="pad-sprung" data-paddruck="" onClick={druck}>Drucken</button>
          <button className="pad-sprung" data-padspeichern="" onClick={speichern}>Speichern</button>
          <button className="pad-sprung" data-padtab="" onClick={neuerTab}>Neuer Tab</button>
        </>}
      </div>
      <button className="pad__zu" data-padzu="" onClick={() => alt.padSchliessen()}>✕ Schliessen</button>
    </div>
  );

  if (datei) {
    return <>{kopf}<div className="pad__datei">
      <iframe id="pad-datei" src={alt.pdfGanz(datei, true)} title="Ansicht" /></div></>;
  }

  return (
    <>
      {kopf}
      {!j && <p className="pad__hinweis">Auf dieser Maschine läuft gerade kein Auftrag.</p>}
      <div className="pad-flaeche">

        {/* ----- linke Spalte ----- */}
        <div className="pad-spalte">
          <div className="pad-karte2 pad-karte2--hoco">
            <span className="pad-name">HOCO Nr.</span>
            <span className="pad-wert pad-wert--gross">{j ? j.job_number : "kein Auftrag"}</span>
            {/* Der Textteil richtet seine Schrift nach der Menge (padTextEinpassen) */}
            <div className="pad-hocotext">
              <div className="pad-zeilen">
                <Zeile name="Bezeichnung" wert={teil && teil.bezeichnung} />
                <Zeile name="FA Nr." wert={j && j.fa_nr} />
                <Zeile name="Programm" wert={programm} />
              </div>
              {/* Die Notiz zum Auftrag steht hier nicht mehr (Wunsch Patrick
                  5. Oktober 2026), ihr Platz geht an die Info darunter. */}
              {/* Eigenes Feld nur fürs Pad: hängt an HOCO Nr. und Typ, steht
                  also wieder da, wenn dasselbe Teil hier erneut läuft. */}
              {mitTyp &&
                <div className="pad-info" data-padfeld="info" onClick={() => infoBearbeiten(j, m, blattDaten)}>
                  <span className="pad-name">Info an der Maschine · antippen</span>
                  {padInfo
                    ? <p><FettText text={padInfo} /></p>
                    : <p className="pad-leer">antippen und eintragen</p>}
                </div>}
            </div>
          </div>

          <div className="pad-karte2 pad-karte2--abend" data-padfeld={mitTyp ? "abend" : ""}
            onClick={mitTyp ? () => abendBearbeiten(j, m, blattDaten) : undefined}>
            <span className="pad-name">Stück am Abend{mitTyp ? " · antippen" : ""}</span>
            <span className="pad-wert">
              {blattDaten && blattDaten.abend_stk
                ? zahlText(blattDaten.abend_stk) + " Stk"
                : <Leer>{mitTyp ? "antippen und eintragen" : (programmGrund || "—")}</Leer>}
            </span>
          </div>

          <div className="pad-karte2 pad-karte2--verzug"><Fortschritt j={j} /></div>
        </div>

        {/* ----- Mitte: alles zur Stückzahl ----- */}
        <div className="pad-spalte">
          <div className="pad-karte2 pad-karte2--stk" data-padfeld={j ? "stand" : ""}
            onClick={j ? () => standEintragen(j, m) : undefined}>
            <div className="pad-stk-kopf">
              <div><span className="pad-name">Stückzahl{j ? " · antippen" : ""}</span>
                <div className="pad-stk-zahl">{j ? zahlText(j.stand || 0) : "—"}</div></div>
              <div className="pad-stk-neben">
                {!!(j && j.target_quantity) && <span>von {zahlText(j.target_quantity)} · {prozent(j)} %</span>}
                <span>{zuletzt
                  ? (zuletzt.heute ? "heute" : zuletzt.wochentag + " " + zuletzt.nummer + ".")
                    + " " + zahlText(zuletzt.menge) + " Stk"
                  : "noch keine Tagesmenge"}</span>
              </div>
            </div>
            <div className="pad-stk-leiste"><div className="pad-stk-wahl">
              {[["tag", "Tage"], ["woche", "Wochen"], ["monat", "Monate"]].map(([w, t]) => (
                <button key={w} type="button" className={"pad-stk-wahl__knopf" + (stkAnsicht === w ? " aktiv" : "")}
                  data-stkansicht={w} onClick={(e) => ansichtWaehlen(e, w)}>{t}</button>
              ))}
            </div></div>
            <div className="pad-tage" id="pad-stk-balken"><StkBalken jeTag={jeTag} art={stkAnsicht} /></div>
            <div id="pad-stk-verlauf" hidden={stkAnsicht !== "tag"}><Verlauf tage={tage} auftrag={j} /></div>
            <div className="pad-stk-fuss" id="pad-stk-fuss"><StkFuss jeTag={jeTag} art={stkAnsicht} auftrag={j} /></div>
          </div>
          <Material j={j} teil={teil} ort={alt.materialPlatz(j)} />
        </div>

        {/* ----- rechte Säule ----- */}
        <div className="pad-spalte pad-spalte--rechts"><Saeule wetter={wetter} danach={danach} />
          {/* Der Rest der Spalte ist zum Zeichnen da (Wunsch Patrick 5. Oktober 2026) */}
          <Skizze key={j ? j.id : "ohne"} j={j} /></div>
      </div>

      {/* ----- Knöpfe ----- */}
      <div className="pad-knoepfe">
        {[["zeichnung", "Zeichnung", !!zeichnung, "zeichnung"],
          ["wbg", "WBG", !!wbg, "wbg"],
          ["blatt", "Einrichtblatt", !!m.type_id, "blatt"],
          ["wechsel", "Werkzeugwechsel", !!m.type_id, "wz"]].map(([wert, text, da, farbe]) => (
          <button key={wert} className={"pad-knopf pad-knopf--" + farbe + (da ? "" : " pad-knopf--leer")}
            data-padreiter={wert} onClick={() => knopfGedrueckt(wert, kontext)}>{text}</button>
        ))}
        {status
          ? <button className={"pad-knopf pad-knopf--zustand pad-zustand--" + (j.plan_status || "geplant")}
              data-padstatus="wechseln" onClick={() => zustandWechseln(m, j)}>
              {status.zeichen} {status.name}</button>
          : <button className="pad-knopf pad-knopf--start" data-padstatus="start"
              onClick={() => zustandWechseln(m, null)}>Auftrag starten</button>}
      </div>

      {!!(j && j.target_quantity) &&
        <div className="pad__balken"><div className="pad__balken__fuellung" style={{ width: prozent(j) + "%" }} />
          <span>{prozent(j)} % · {zahlText(j.stand || 0)} von {zahlText(j.target_quantity)}</span></div>}
    </>
  );
}
