// =================================================================
//  EINSTELLUNGEN → DOKUMENTE
//  Ordner abgleichen (die App liest einen Ordner, ordnet jede Datei
//  am Namen zu und lädt erst nach einem Blick auf die Zuordnung hoch),
//  die Regeln für Dateinamen mit Probe und Beispielen, der Pfad fürs
//  Hilfsprogramm auf dem Netzlaufwerk, der Verlauf und was zuletzt
//  abgelegt wurde.
//
//  Die Erkennung selbst (dokErkennen) und das Hochladen (dokHochladen)
//  sind noch im alten Programm: Sie werden auch beim Planen und von
//  der HOCO Nr. gebraucht.
// =================================================================
import { useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { Gruppe, Zeile, SchalterZeile } from "./teile.jsx";

const kannOrdner = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
const artVon = (a) => alt.DOK_ARTEN[a] || alt.DOK_ARTEN.sonstiges;

async function typenHolen() {
  if (alt.prod.typen && alt.prod.typen.length) return alt.prod.typen;
  try { return await alt.ladeTypen(); } catch (f) { return []; }
}

export default function Dokumente() {
  const darf = alt.darfSchreiben();
  // Zählt hoch, wenn etwas abgelegt oder aufgeräumt wurde: Verlauf und
  // „Zuletzt abgelegt“ laden dann frisch
  const [stand, setStand] = useState(0);
  const frisch = () => setStand((x) => x + 1);
  // Dateien, deren Zuordnung gerade angezeigt wird (null = keine)
  const [pool, setPool] = useState(null);

  const pruefen = async (dateien) => {
    setPool({ laedt: true });
    const typen = await typenHolen();
    // WBG mit FA Nr. und Einrichtblätter ohne Typ im Namen brauchen
    // einen Blick in die Aufträge, bevor die Zuordnung feststeht
    const eintraege = await Promise.all(dateien.map(async (datei) => {
      let zuordnung = alt.dokErkennen(datei.name, typen);
      if ((zuordnung.art === "wbg" && zuordnung.fa)
          || (zuordnung.art === "einrichtblatt" && zuordnung.hoco && !zuordnung.typ)) {
        zuordnung = await alt.dokZielSuchen(zuordnung, typen);
      }
      return { datei, zuordnung, nehmen: zuordnung.passt };
    }));
    setPool({ eintraege });
  };

  // Dateien aus dem Explorer auf die Fläche ziehen
  const [ueber, setUeber] = useState(false);
  const fallen = (e) => {
    e.preventDefault(); setUeber(false);
    if (!darf) return;
    const dateien = [...((e.dataTransfer && e.dataTransfer.files) || [])]
      .filter((d) => /\.(pdf|png|jpe?g|webp|tif?f|xlsx|xlsm|xls)$/i.test(d.name));
    if (!dateien.length) { alt.meldung("Keine passenden Dateien (PDF, Bild oder Excel).", "warn"); return; }
    pruefen(dateien);
  };

  const ordnerLesen = async () => {
    let ordner;
    try { ordner = await window.showDirectoryPicker({ mode: "read" }); } catch (f) { return; } // abgebrochen
    const dateien = [];
    try {
      for await (const eintrag of ordner.values()) {
        if (eintrag.kind !== "file") continue;
        if (!/\.(pdf|png|jpe?g|webp|tif?f|xlsx|xlsm|xls)$/i.test(eintrag.name)) continue;
        dateien.push(await eintrag.getFile());
        if (dateien.length >= 500) break;
      }
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
    if (!dateien.length) { alt.meldung("Im Ordner liegen keine Dateien.", "warn"); return; }
    pruefen(dateien);
  };

  const hochladenWaehlen = async () => {
    const dateien = await alt.dokWaehlen(true);
    if (dateien.length) pruefen(dateien);
  };

  return (
    <>
      <Gruppe titel="Ordner abgleichen"
        text={kannOrdner
          ? "Wähle den Ordner mit den Dateien. Die App liest ihn, ordnet jede Datei anhand ihres Namens zu "
            + "und zeigt dir die Zuordnung, bevor etwas hochgeladen wird. Der Ordner darf im Netzlaufwerk liegen."
          : "Das Auswählen eines ganzen Ordners geht nur in Chrome oder Edge am Rechner. Am Tablet und am "
            + "Handy lädst du Dateien einzeln hoch, bei der HOCO Nr. oder beim Maschinentyp."}
        aktionen={darf && kannOrdner && <button className="knopf knopf--klein knopf--haupt" id="pool-ordner"
          onClick={ordnerLesen}>Ordner wählen</button>}>
        {darf && !pool && <div id="pool-ablage" className={"pool-ablage" + (ueber ? " pool-ablage--ueber" : "")}
          onDragOver={(e) => { e.preventDefault(); setUeber(true); }}
          onDragLeave={() => setUeber(false)} onDrop={fallen}>
          <b>Dateien hierher ziehen</b>
          <span className="klein">WBG mit FA Nr. und HOCO Nr. im Namen (etwa „20268566 10007-0381.pdf“) kommen an den
            nächsten offenen Auftrag ohne FA Nr., die FA Nr. wird dort eingetragen. Einrichtblätter nur als Excel
            (etwa „10844-0049 SW-20.xlsx“; ohne Typ im Namen gilt der Typ der Maschine des nächsten Auftrags).</span>
        </div>}
        <div id="pool-liste">
          {pool && (pool.laedt
            ? <div className="laedt">Wird geprüft …</div>
            : <Zuordnung eintraege={pool.eintraege} fertig={() => { setPool(null); frisch(); }} />)}
        </div>
      </Gruppe>
      <Regeln />
      <PoolOrdner />
      <EinrichtblattOrdner />
      <Netzlaufwerk />
      <Verlauf stand={stand} frisch={frisch} />
      <Letzte stand={stand} hochladen={hochladenWaehlen} />
    </>
  );
}

// ---------- Zuordnung prüfen, dann hochladen ----------

function Zuordnung({ eintraege, fertig }) {
  const [nehmen, setNehmen] = useState(() => eintraege.map((e) => e.nehmen));
  const [laeuft, setLaeuft] = useState(null);
  const anzahl = nehmen.filter(Boolean).length;

  const los = async () => {
    if (laeuft || !anzahl) return;
    const liste = eintraege.filter((e, i) => nehmen[i]);
    let gut = 0, schief = 0;
    for (const e of liste) {
      setLaeuft("lädt " + (gut + schief + 1) + " von " + liste.length + " …");
      try { await alt.dokHochladen(e.datei, e.zuordnung, "ordner"); gut++; }
      catch (f) { schief++; alt.meldung(e.datei.name + ": " + alt.fehlertext(f), "fehler"); }
    }
    alt.meldung(gut + " Dateien abgelegt" + (schief ? ", " + schief + " fehlgeschlagen" : "."), schief ? "warn" : "gut");
    fertig();
  };

  return (
    <>
      <div className="pool-kopf">
        <span><b>{eintraege.length}</b> Dateien gelesen · <b>{anzahl}</b> zugeordnet</span>
        <button className="knopf knopf--klein knopf--haupt" id="pool-los"
          disabled={!anzahl} onClick={los}>{laeuft || anzahl + " hochladen"}</button>
      </div>
      <table className="tabelle"><thead><tr><th /><th>Datei</th><th>Art</th><th>HOCO Nr.</th><th>Typ</th><th>Auftrag</th></tr></thead>
        <tbody>{eintraege.map((e, i) => (
          <tr key={i} className={nehmen[i] ? "" : "pool-zeile--offen"}>
            <td><input type="checkbox" data-pool={i} checked={nehmen[i]}
              onChange={(ev) => setNehmen((n) => n.map((x, j) => (j === i ? ev.target.checked : x)))} /></td>
            <td>{e.datei.name}</td>
            <td>{artVon(e.zuordnung.art).zeichen} {artVon(e.zuordnung.art).name}</td>
            <td>{e.zuordnung.hoco || "—"}</td>
            <td>{e.zuordnung.typ ? e.zuordnung.typ.name + (e.zuordnung.typAusAuftrag ? " (vom Auftrag)" : "") : "—"}</td>
            <td className="klein">{e.zuordnung.fa
              ? (e.zuordnung.auftrag
                  ? "FA " + e.zuordnung.fa + (e.zuordnung.auftrag.planned_from ? " · geplant " + alt.kurzDatum(e.zuordnung.auftrag.planned_from) : "")
                  : e.zuordnung.grund)
              : "—"}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="hinweis">Grau hinterlegte Zeilen konnte die App keiner Nummer, keinem Typ oder keinem
        offenen Auftrag zuordnen. Benenne die Datei um, plane zuerst den Auftrag oder lade sie direkt bei der HOCO Nr. hoch.</p>
    </>
  );
}

// ---------- Regeln für Dateinamen ----------

const FELDER = [["zeichnung", "Zeichnung"], ["wbg", "WBG"], ["einrichtblatt", "Einrichtblatt"], ["allgemein", "Allgemein"]];

function felderAus(regeln) {
  const f = { nurNummer: regeln.nurNummer || "zeichnung" };
  FELDER.forEach(([k]) => { f[k] = (regeln[k] || []).join(", "); });
  return f;
}

function Regeln() {
  const [felder, setFelder] = useState(() => felderAus(alt.DOK_REGELN || alt.DOK_REGELN_VORGABE));
  const [probe, setProbe] = useState("");
  const { daten: typen } = useDaten(typenHolen, []);
  const setze = (k, w) => setFelder((f) => ({ ...f, [k]: w }));

  const regeln = { nurNummer: felder.nurNummer };
  FELDER.forEach(([k]) => { regeln[k] = felder[k].split(/[,;]+/).map((x) => x.trim()).filter(Boolean); });
  // Probe und Beispiele mit den Regeln, wie sie gerade in den Feldern stehen
  const erkennen = (name) => alt.dokMitRegeln(regeln, () => alt.dokErkennen(name, typen || []));

  const speichern = async () => {
    const { error } = await alt.db.from("app_config").upsert({ schluessel: "dok_regeln", wert: JSON.stringify(regeln) });
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.dokRegelnUebernehmen(regeln);
    alt.meldung("Regeln gespeichert.");
  };

  const p = probe.trim() ? erkennen(probe.trim()) : null;
  const typName = (typen && typen[0] && typen[0].name) || "SW-20";
  const beispiele = ["10844-0049.pdf", "10844-0049_WBG.pdf", "10844-0049_EB.xlsx",
    "10844-0049_EB_" + typName + ".xlsx", "EB_" + typName + ".xlsx", "10844-0049_EB.pdf",
    "10844-0049_Messbericht.pdf", "10844-0049 Zeichnung Rev B.pdf",
    "20268566 10007-0381.pdf", "10844-0049 " + typName + ".xlsx"];

  return (
    <>
      <Gruppe titel="So erkennt die App die Dateien"
        text={"Steht im Dateinamen eines dieser Stichwörter, kommt die Datei dorthin. Mehrere Stichwörter "
          + "mit Komma trennen. Gross und klein, Striche und Leerzeichen spielen keine Rolle, bei längeren "
          + "Wörtern wird ein Tippfehler verziehen. Die HOCO Nr. und der Maschinentyp werden immer von selbst erkannt."}>
        {FELDER.map(([k, t]) => (
          <Zeile key={k} titel={t}>
            <input type="text" data-dokregel={k} aria-label={t} value={felder[k]} onChange={(e) => setze(k, e.target.value)}
              placeholder={k === "allgemein" ? "z. B. messbericht, prüfprotokoll, foto" : undefined} />
          </Zeile>
        ))}
        <Zeile titel="Nur HOCO Nr. im Namen" text="Was ist die Datei, wenn sonst nichts im Namen steht?">
          <select id="dokregel-nur" className="es-schmal" aria-label="Nur HOCO Nr. im Namen"
            value={felder.nurNummer} onChange={(e) => setze("nurNummer", e.target.value)}>
            <option value="zeichnung">eine Zeichnung</option>
            <option value="allgemein">ein allgemeines Dokument</option>
          </select>
        </Zeile>
        <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
          <button className="linkknopf" id="dokregel-vorgabe"
            onClick={() => setFelder(felderAus(alt.DOK_REGELN_VORGABE))}>Vorgabe wiederherstellen</button>
          <button className="knopf knopf--klein knopf--haupt" id="dokregel-speichern" onClick={speichern}>Regeln speichern</button>
        </div>
      </Gruppe>

      <Gruppe titel="Ausprobieren" text="Dateiname eingeben, die App zeigt, wohin er ginge. Unten Beispiele mit den Regeln, wie sie gerade oben stehen.">
        <input type="text" id="dokprobe" aria-label="Dateiname zum Ausprobieren"
          placeholder="z. B. 10844-0049 EB SW20.pdf" value={probe} onChange={(e) => setProbe(e.target.value)} />
        <div id="dokprobe-ergebnis" className="dokprobe">
          {p && <><b>{alt.dokZielText(p)}</b><span className="klein"> — {p.grund || ""}</span></>}
        </div>
        <div id="dokbeispiele" className="tabellenrolle">
          <table className="tabelle es-tabelle"><thead><tr><th>Dateiname</th><th>Wird zugeordnet als</th></tr></thead>
            <tbody>{beispiele.map((n) => (
              <tr key={n}><td><code>{n}</code></td><td>{alt.dokZielText(erkennen(n))}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Gruppe>
    </>
  );
}

// ---------- Pool-Ordner (wird nach dem Hochladen geleert) ----------

async function poolLaden() {
  const werte = {};
  try {
    const r = await alt.zeitlimit(alt.db.from("app_config").select("schluessel, wert")
      .in("schluessel", ["dok_pool_pfad", "dok_pool_status"]), 6000, "Pool");
    ((r && r.data) || []).forEach((x) => { werte[x.schluessel] = x.wert; });
  } catch (f) { /* leer lassen */ }
  return werte;
}

function PoolOrdner() {
  const { daten } = useDaten(poolLaden, []);
  return (
    <Gruppe titel="Pool-Ordner"
      text={"Ein Ordner nur für WBGs. Das Programm dokumente-pool.ps1 holt sie über die Windows-Aufgabenplanung "
        + "alle fünf Minuten ab, ordnet sie zu wie oben und löscht sie danach aus dem Ordner. Alles andere, auch "
        + "Excel, löscht es nicht, sondern schiebt es in den Unterordner „nicht zugeordnet“; eine WBG, deren "
        + "Auftrag noch nicht geplant ist, wartet bis zu sieben Tage im Ordner."}>
      {daten ? <PoolFormular werte={daten} /> : <div className="laedt">Wird geladen …</div>}
    </Gruppe>
  );
}

function PoolFormular({ werte }) {
  const [pfad, setPfad] = useState(werte.dok_pool_pfad || "");
  let st = null;
  try { st = werte.dok_pool_status ? JSON.parse(werte.dok_pool_status) : null; } catch (f) { st = null; }

  const speichern = async () => {
    const r = await alt.db.from("app_config").upsert([{ schluessel: "dok_pool_pfad", wert: pfad.trim() }]);
    if (r.error) alt.meldung(alt.fehlertext(r.error), "fehler");
    else alt.meldung("Pool-Ordner gespeichert. Das Programm nimmt ihn beim nächsten Durchlauf.");
  };

  let stand;
  if (!st) stand = <span className="gedaempft">Das Programm hat sich noch nicht gemeldet.</span>;
  else {
    const minuten = (Date.now() - new Date(st.zeit).getTime()) / 60000;
    stand = <>
      <span className={"dokpfad-punkt " + (minuten < 15 ? "dokpfad-punkt--gut" : "dokpfad-punkt--alt")} />
      {"Zuletzt " + alt.datumZeitKurz(st.zeit) + (st.rechner ? " auf " + st.rechner : "")
        + " · " + (st.neu || 0) + " abgelegt"
        + (st.wartet && st.wartet.length ? " · " + st.wartet.length + " warten auf ihren Auftrag" : "")}
      {minuten >= 15 && <> <b>— seit {Math.round(minuten)} Minuten keine Meldung</b></>}
      {st.fehler && <div className="klein" style={{ color: "var(--gefahr)" }}>{st.fehler}</div>}
      {st.wartet && st.wartet.length > 0 && <div className="klein gedaempft">Wartet: {
        st.wartet.slice(0, 12).join(", ") + (st.wartet.length > 12 ? " …" : "")}</div>}
      {st.ohne && st.ohne.length > 0 && <div className="klein gedaempft">Nicht zugeordnet: {
        st.ohne.slice(0, 12).join(", ") + (st.ohne.length > 12 ? " …" : "")}</div>}
    </>;
  }

  return (
    <>
      <Zeile titel="Ordner" text="Auf dem Rechner, auf dem die Aufgabe läuft. Leer lassen, dann gilt C:\Hofer\Pool.">
        <input type="text" id="dokpool" aria-label="Pool-Ordner" placeholder={"C:\\Hofer\\Pool"} value={pfad}
          onChange={(e) => setPfad(e.target.value)} />
      </Zeile>
      <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
        <div id="dokpool-stand" className="dokpfad-stand">{stand}</div>
        <button className="knopf knopf--klein knopf--haupt" id="dokpool-speichern"
          onClick={speichern}>Ordner speichern</button></div>
    </>
  );
}

// ---------- Einrichtblatt-Ordner (nur lesen, je Ordner ein Typ) ----------
//  einrichtblaetter.ps1 liest diese Ordner über die Aufgabenplanung und
//  lädt Excel-Dateien mit HOCO Nr. im Namen als Einrichtblatt auf den Typ
//  des Ordners. Es löscht dort nie etwas. Solange „Hochladen“ aus ist,
//  meldet es nur, was es tun würde (Patrick will zuerst testen).

async function ebLaden() {
  const werte = {};
  try {
    const r = await alt.zeitlimit(alt.db.from("app_config").select("schluessel, wert")
      .in("schluessel", ["eb_ordner", "eb_ordner_status"]), 6000, "Einrichtblatt-Ordner");
    ((r && r.data) || []).forEach((x) => { werte[x.schluessel] = x.wert; });
  } catch (f) { /* leer lassen */ }
  const typen = await typenHolen();
  return { werte, typen };
}

function EinrichtblattOrdner() {
  const { daten } = useDaten(ebLaden, []);
  return (
    <Gruppe titel="Einrichtblatt-Ordner" id="eb-ordner"
      text={"Ordner mit den Excel-Einrichtblättern, je Ordner ein Maschinentyp. Das Programm einrichtblaetter.ps1 "
        + "schaut über die Windows-Aufgabenplanung alle fünf Minuten hinein und nimmt nur Excel-Dateien mit einer "
        + "HOCO Nr. im Namen, egal wie sie sonst heissen. PDF, CAD und alles andere lässt es liegen. Es liest nur: "
        + "In den Ordnern wird nie etwas gelöscht, verschoben oder geändert."}>
      {daten ? <EbFormular werte={daten.werte} typen={daten.typen} /> : <div className="laedt">Wird geladen …</div>}
    </Gruppe>
  );
}

function jsonOder(text, ersatz) {
  try { return text ? JSON.parse(text) : ersatz; } catch (f) { return ersatz; }
}

function EbFormular({ werte, typen }) {
  const start = jsonOder(werte.eb_ordner, null) || {};
  const [ordner, setOrdner] = useState(
    (start.ordner && start.ordner.length) ? start.ordner : [{ pfad: "", typ: "", unter: false }]);
  const [scharf, setScharf] = useState(!!start.scharf);
  const st = jsonOder(werte.eb_ordner_status, null);
  const admin = alt.istAdmin();

  const aendern = (i, feld, wert) => setOrdner((l) => l.map((o, j) => (j === i ? { ...o, [feld]: wert } : o)));
  const speichern = async (neuScharf) => {
    const liste = ordner.map((o) => ({ pfad: (o.pfad || "").trim(), typ: o.typ || "", unter: !!o.unter }))
      .filter((o) => o.pfad);
    if (liste.some((o) => !o.typ)) { alt.meldung("Bei jedem Ordner einen Maschinentyp wählen.", "warn"); return; }
    const r = await alt.db.from("app_config").upsert([{ schluessel: "eb_ordner",
      wert: JSON.stringify({ scharf: neuScharf, ordner: liste }) }]);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    setScharf(neuScharf);
    alt.meldung(neuScharf ? "Hochladen eingeschaltet. Ab dem nächsten Durchlauf lädt das Programm hoch."
      : "Gespeichert. Das Programm macht beim nächsten Durchlauf einen Probelauf.", "gut");
  };
  const umschalten = async () => {
    if (!scharf) {
      const ok = await alt.nachfragen({ titel: "Hochladen einschalten?",
        text: "Ab dem nächsten Durchlauf lädt das Programm die Einrichtblätter aus den Ordnern hoch. Ein vorhandenes "
          + "Einrichtblatt derselben HOCO Nr. auf demselben Typ wird in der App ersetzt. In den Ordnern ändert sich nichts.",
        bestaetigen: "Einschalten" });
      if (!ok) return;
    }
    speichern(!scharf);
  };

  let stand;
  if (!st) stand = <span className="gedaempft">Das Programm hat sich noch nicht gemeldet.</span>;
  else {
    const minuten = (Date.now() - new Date(st.zeit).getTime()) / 60000;
    const wuerde = (st.neu || 0) + (st.ersetzt || 0);
    stand = <>
      <span className={"dokpfad-punkt " + (minuten < 15 ? "dokpfad-punkt--gut" : "dokpfad-punkt--alt")} />
      {(st.scharf ? "Zuletzt " : "Probelauf ") + alt.datumZeitKurz(st.zeit) + (st.rechner ? " auf " + st.rechner : "")
        + " · " + (st.excel || 0) + " Excel-Dateien · "
        + (st.scharf ? (st.hochgeladen || 0) + " hochgeladen"
          : wuerde + " würden hochgeladen (" + (st.neu || 0) + " neu, " + (st.ersetzt || 0) + " ersetzen ein vorhandenes)")}
      {minuten >= 15 && <> <b>— seit {Math.round(minuten)} Minuten keine Meldung</b></>}
      {st.fehler && <div className="klein" style={{ color: "var(--gefahr)" }}>{st.fehler}</div>}
    </>;
  }
  const liste = (st && st.liste) || [];

  return (
    <>
      {ordner.map((o, i) => (
        <div className="eb-ordner-zeile" key={i}>
          <input type="text" className="eb-ordner-pfad" aria-label="Ordner" placeholder={"\\\\Server\\Einrichtblätter\\SW-20"}
            value={o.pfad} disabled={!admin} onChange={(e) => aendern(i, "pfad", e.target.value)} />
          <select aria-label="Maschinentyp" value={o.typ} disabled={!admin} onChange={(e) => aendern(i, "typ", e.target.value)}>
            <option value="">Typ wählen</option>
            {typen.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label className="eb-ordner-unter klein">
            <input type="checkbox" checked={!!o.unter} disabled={!admin}
              onChange={(e) => aendern(i, "unter", e.target.checked)} /> mit Unterordnern</label>
          {admin && <button className="knopf knopf--klein" aria-label="Ordner entfernen" title="Ordner entfernen"
            onClick={() => setOrdner((l) => (l.length > 1 ? l.filter((x, j) => j !== i) : [{ pfad: "", typ: "", unter: false }]))}>✕</button>}
        </div>
      ))}
      {admin && <button className="knopf knopf--klein" id="eb-ordner-dazu"
        onClick={() => setOrdner((l) => [...l, { pfad: "", typ: "", unter: false }])}>+ Ordner</button>}
      <p className="klein gedaempft">Ordner auf einem anderen Rechner als \\Server\Freigabe\… eintragen, nicht mit
        Laufwerksbuchstaben wie Z:. Gibt es für eine HOCO Nr. mehrere Excel-Dateien, zählt die zuletzt geänderte.</p>
      <SchalterZeile id="eb-scharf" titel="Hochladen"
        text={scharf ? "Ein: neue und geänderte Einrichtblätter werden hochgeladen."
          : "Aus: nur Probelauf. Das Programm zeigt unten, was es hochladen würde, und lädt nichts hoch."}
        checked={scharf} onChange={admin ? umschalten : () => {}} />
      <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
        <div id="eb-stand" className="dokpfad-stand">{stand}</div>
        {admin && <button className="knopf knopf--klein knopf--haupt" id="eb-speichern"
          onClick={() => speichern(scharf)}>Ordner speichern</button>}</div>
      {liste.length > 0 && <details className="eb-liste" open={!st.scharf}>
        <summary>{st.scharf ? "Letzter Durchlauf" : "Was der Probelauf hochladen würde"} ({liste.length})</summary>
        <div className="tabellenrolle">
          <table className="tabelle es-tabelle" id="eb-tabelle"><thead><tr>
            <th>Datei</th><th>HOCO Nr.</th><th>Typ</th><th>Ergebnis</th></tr></thead>
            <tbody>{liste.map((x, i) => (
              <tr key={i}><td><code>{x.d}</code></td><td>{x.h || "–"}</td>
                <td>{(st.ordner && st.ordner[x.o] && st.ordner[x.o].typ) || ""}</td><td>{x.w}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>}
      {st && st.ordner && st.ordner.some((o) => o.fehler) && <div className="klein" style={{ color: "var(--gefahr)" }}>
        {st.ordner.filter((o) => o.fehler).map((o) => o.pfad + ": " + o.fehler).join(" · ")}</div>}
    </>
  );
}

// ---------- Ordner auf dem Netzlaufwerk ----------

async function pfadLaden() {
  const werte = {};
  try {
    const r = await alt.zeitlimit(alt.db.from("app_config").select("schluessel, wert")
      .in("schluessel", ["dok_pfad", "dok_pfad_unterordner", "dok_pfad_status"]), 6000, "Pfad");
    ((r && r.data) || []).forEach((x) => { werte[x.schluessel] = x.wert; });
  } catch (f) { /* leer lassen */ }
  return werte;
}

function Netzlaufwerk() {
  const { daten } = useDaten(pfadLaden, []);
  return (
    <Gruppe titel="Ordner auf dem Netzlaufwerk"
      text={"Diesen Ordner prüft das Hilfsprogramm auf dem Server jede Minute. Neue und geänderte Dateien "
        + "lädt es hoch und legt sie nach den Regeln oben ab; was an derselben Stelle lag, wird ersetzt. "
        + "Die Dateien im Ordner bleiben liegen."}>
      {/* Erst nach dem Laden zeigen, damit die Felder mit dem
          gespeicherten Pfad beginnen */}
      {daten ? <PfadFormular werte={daten} /> : <div className="laedt">Wird geladen …</div>}
    </Gruppe>
  );
}

function PfadFormular({ werte }) {
  const [pfad, setPfad] = useState(werte.dok_pfad || "");
  const [unter, setUnter] = useState(werte.dok_pfad_unterordner === "ja");
  let st = null;
  try { st = werte.dok_pfad_status ? JSON.parse(werte.dok_pfad_status) : null; } catch (f) { st = null; }

  const speichern = async () => {
    const r = await alt.db.from("app_config").upsert([
      { schluessel: "dok_pfad", wert: pfad.trim() },
      { schluessel: "dok_pfad_unterordner", wert: unter ? "ja" : "nein" }]);
    if (r.error) alt.meldung(alt.fehlertext(r.error), "fehler");
    else alt.meldung("Pfad gespeichert. Das Hilfsprogramm nimmt ihn beim nächsten Durchlauf.");
  };

  let stand;
  if (!st) stand = <span className="gedaempft">Das Hilfsprogramm hat sich noch nicht gemeldet.</span>;
  else {
    const minuten = (Date.now() - new Date(st.zeit).getTime()) / 60000;
    stand = <>
      <span className={"dokpfad-punkt " + (minuten < 5 ? "dokpfad-punkt--gut" : "dokpfad-punkt--alt")} />
      {"Letzter Abgleich " + alt.datumZeitKurz(st.zeit) + (st.rechner ? " auf " + st.rechner : "")
        + " · " + (st.dateien || 0) + " Dateien im Ordner · " + (st.neu || 0) + " neu abgelegt"}
      {minuten >= 5 && <> <b>— seit {Math.round(minuten)} Minuten keine Meldung</b></>}
      {st.fehler && <div className="klein" style={{ color: "var(--gefahr)" }}>{st.fehler}</div>}
      {st.ohne && st.ohne.length > 0 && <div className="klein gedaempft">Nicht zugeordnet: {
        st.ohne.slice(0, 12).join(", ") + (st.ohne.length > 12 ? " …" : "")}</div>}
    </>;
  }

  return (
    <>
      <Zeile titel="Pfad">
        <input type="text" id="dokpfad" aria-label="Pfad" placeholder={"\\\\FS01\\Daten\\Zeichnungen"} value={pfad}
          onChange={(e) => setPfad(e.target.value)} />
      </Zeile>
      <SchalterZeile id="dokpfad-unter" titel="Unterordner einbeziehen" checked={unter}
        onChange={(e) => setUnter(e.target.checked)} />
      <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
        <div id="dokpfad-stand" className="dokpfad-stand">{stand}</div>
        <button className="knopf knopf--klein knopf--haupt" id="dokpfad-speichern"
          onClick={speichern}>Pfad speichern</button></div>
    </>
  );
}

// ---------- Verlauf ----------

const QUELLE = { hand: "von Hand", ordner: "Ordner", pfad: "Netzlaufwerk", pool: "Pool-Ordner", "eb-ordner": "Einrichtblatt-Ordner", "aufräumen": "aufgeräumt" };

async function verlaufLaden() {
  const r = await alt.zeitlimit(alt.db.from("dokumente_verlauf").select("*")
    .order("zeit", { ascending: false }).limit(100), 8000, "Verlauf");
  if (r.error) throw r.error;
  // Die Namen der Personen braucht „Wer“
  await alt.personenLaden();
  return r.data || [];
}

function Verlauf({ stand, frisch }) {
  const { daten: liste, fehler } = useDaten(verlaufLaden, [stand]);
  const aufraeumen = async () => {
    const n = await alt.wbgAufraeumen(true);
    alt.meldung(n ? n + " alte WBG entfernt." : "Nichts aufzuräumen.");
    frisch();
  };
  let inhalt;
  if (fehler && !liste) {
    inhalt = <p className="hinweis">Der Verlauf braucht noch <code>dokumente-verlauf.sql</code> in der Datenbank.</p>;
  } else if (!liste) inhalt = <div className="laedt">Wird geladen …</div>;
  else if (!liste.length) inhalt = <p className="es-leer">Noch nichts abgelegt.</p>;
  else {
    inhalt = (
      <div className="tabellenrolle"><table className="tabelle">
        <thead><tr><th>Zeit</th><th>Datei</th><th>Ging nach</th><th>Wie</th><th>Wer</th></tr></thead>
        <tbody>{liste.map((v, i) => (
          <tr key={v.id || i}>
            <td className="klein nowrap">{alt.datumZeitKurz(v.zeit)}</td>
            <td>{v.dateiname || "—"}</td>
            <td>{v.ziel || ""}{v.ersetzt && <> <span className="marke">ersetzt</span></>}</td>
            <td className="klein">{QUELLE[v.quelle] || v.quelle || ""}</td>
            <td className="klein">{alt.personVoll(v.von) || ""}</td>
          </tr>
        ))}</tbody>
      </table></div>
    );
  }
  return (
    <Gruppe titel="Verlauf" text="Welche Datei wohin ging."
      aktionen={<button className="knopf knopf--klein" id="wbg-aufraeumen" onClick={aufraeumen}>Alte WBG aufräumen</button>}>
      <div id="dokverlauf">{inhalt}</div>
    </Gruppe>
  );
}

// ---------- Zuletzt abgelegt ----------

async function letzteLaden() {
  const r = await alt.db.from("dokumente").select("*").order("erstellt_am", { ascending: false }).limit(25);
  if (r.error) throw r.error;
  return r.data || [];
}

function Letzte({ stand, hochladen }) {
  const { daten: liste, fehler, neu } = useDaten(letzteLaden, [stand]);
  const loeschen = async (id) => {
    const ok = await alt.nachfragen({ titel: "Dokument löschen", text: "Soll dieses Dokument gelöscht werden?",
      bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    try { await alt.dokLoeschen(id); alt.meldung("Gelöscht."); neu(); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  let inhalt;
  if (fehler && !liste) inhalt = <p className="hinweis">Dafür fehlt noch dokumente.sql in der Datenbank.</p>;
  else if (!liste) inhalt = <div className="laedt">Wird geladen …</div>;
  else if (!liste.length) inhalt = <p className="es-leer">Noch nichts abgelegt.</p>;
  else {
    inhalt = (
      <table className="tabelle">
        <thead><tr><th>Art</th><th>Datei</th><th>Gehört zu</th><th>Abgelegt</th><th /></tr></thead>
        <tbody>{liste.map((d) => (
          <tr key={d.id}>
            <td>{artVon(d.art).zeichen} {artVon(d.art).name}</td>
            <td>{d.dateiname || d.titel || ""}</td>
            <td>{d.hoco_nr || ""}</td>
            <td className="klein">{alt.kurzDatum(d.erstellt_am || "")}</td>
            <td className="rechts nowrap">
              <button className="linkknopf" data-dokauf={d.datei_url}
                onClick={() => alt.betrachter(d.datei_url, "Dokument", true)}>Ansehen</button>{" "}
              <button className="linkknopf linkknopf--gefahr" data-dokweg={d.id} onClick={() => loeschen(d.id)}>Löschen</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    );
  }
  return (
    <Gruppe titel="Zuletzt abgelegt" text="Die letzten 25 Dokumente."
      aktionen={<>
        {/* Nur ansehen, ohne hochzuladen: etwa ein Einrichtblatt als
            Excel vom Stick oder aus dem Mail */}
        <label className="knopf knopf--klein" id="dok-ansehen">Datei ansehen
          <input type="file" hidden accept={"application/pdf,image/*,.xlsx,.xlsm,.xls"}
            onChange={(e) => { const d = e.target.files && e.target.files[0]; e.target.value = ""; alt.dateiAnsehen(d); }} /></label>{" "}
        <button className="knopf knopf--klein" id="dok-neu" onClick={hochladen}>Dateien hochladen</button>
      </>}>
      <div id="dok-letzte">{inhalt}</div>
    </Gruppe>
  );
}
