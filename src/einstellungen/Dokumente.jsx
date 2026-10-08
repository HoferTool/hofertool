// =================================================================
//  EINSTELLUNGEN → DOKUMENTE
//  Ordner abgleichen (die App liest einen Ordner, ordnet jede Datei
//  am Namen zu und lädt erst nach einem Blick auf die Zuordnung hoch),
//  die Ordner, die Aufgaben der Windows-Aufgabenplanung lesen (Pool,
//  Einrichtblätter, Zeichnungen) und was zuletzt abgelegt wurde. Die Regeln für Dateinamen sind fest im Code (DOK_REGELN).
//
//  Die Erkennung selbst (dokErkennen) und das Hochladen (dokHochladen)
//  sind noch im alten Programm: Sie werden auch beim Planen und von
//  der HOCO Nr. gebraucht.
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { Gruppe, Zeile, SchalterZeile } from "./teile.jsx";
import { notizbuecherVerwalten } from "./Notizbuecher.jsx";

const kannOrdner = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
const artVon = (a) => alt.DOK_ARTEN[a] || alt.DOK_ARTEN.sonstiges;
const DATEI_ARTEN = /\.(pdf|png|jpe?g|webp|tif?f|xlsx|xlsm|xls)$/i;
const typenSortiert = (typen) => typen.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));

// Einrichtblatt auf einen gewählten Typ setzen (oder ohne Typ zurück)
function typSetzen(z, t) {
  return Object.assign({}, z, t
    ? { typ: t, typGewaehlt: true, passt: true, grund: "Excel-Datei" }
    : { typ: null, typGewaehlt: false, passt: false, grund: "kein Maschinentyp gewählt" });
}

// Was auf die Fläche gezogen wurde, als [{ datei, ordner }]. Ganze Ordner
// (Chrome, Edge, Safari) werden mit ihren Unterordnern gelesen; jede Datei
// merkt sich die Namen der Ordner, in denen sie lag (der nächste zuletzt).
async function ausAblage(dt) {
  if (!dt) return [];
  // Die Einträge müssen sofort geholt werden, nach dem ersten await ist die Liste leer
  const eintraege = [...(dt.items || [])].map((i) => (i.kind === "file" && i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
  const lose = [...(dt.files || [])];
  if (!eintraege.some((e) => e && e.isDirectory)) return lose.map((datei) => ({ datei }));
  const aus = [];
  const datei = (e) => new Promise((ok, schief) => e.file(ok, schief));
  const lesen = (r) => new Promise((ok, schief) => r.readEntries(ok, schief));
  const gehe = async (e, ordner) => {
    if (aus.length >= 500 || !e) return;
    if (e.isFile) { aus.push({ datei: await datei(e), ordner }); return; }
    if (!e.isDirectory) return;
    const r = e.createReader();
    // readEntries liefert in Paketen, bis eine leere Liste kommt
    for (let teil = await lesen(r); teil.length; teil = await lesen(r)) {
      for (const k of teil) await gehe(k, ordner.concat(e.name));
    }
  };
  for (const e of eintraege) await gehe(e, []);
  return aus;
}

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

  // dateien: [{ datei, ordner }]; ordner sind die Namen der Ordner, aus
  // denen die Datei kam (beim Hineinziehen ganzer Ordner oder „Ordner wählen“)
  const pruefen = async (dateien) => {
    setPool({ laedt: true });
    const typen = await typenHolen();
    // WBG mit FA Nr. brauchen einen Blick in die Aufträge, bevor die Zuordnung feststeht
    const eintraege = await Promise.all(dateien.map(async ({ datei, ordner }) => {
      let zuordnung = alt.dokErkennen(datei.name, typen);
      if (zuordnung.art === "wbg" && zuordnung.fa) zuordnung = await alt.dokZielSuchen(zuordnung, typen);
      // Einrichtblatt ohne Typ im Namen (Wunsch Patrick, 7. Oktober 2026):
      // Heisst der Ordner wie ein Maschinentyp, gilt dieser Typ. Sonst wird
      // gefragt, nicht mehr still der Typ der Maschine des nächsten Auftrags genommen.
      if (zuordnung.art === "einrichtblatt" && zuordnung.hoco && !zuordnung.typ && /\.(xlsx|xlsm|xls)$/i.test(datei.name)) {
        let ordnerTyp = null;
        for (let i = (ordner || []).length - 1; i >= 0 && !ordnerTyp; i--) {
          ordnerTyp = alt.dokErkennen(ordner[i] + ".xlsx", typen).typ;
        }
        zuordnung = Object.assign({}, zuordnung, ordnerTyp
          ? { typ: ordnerTyp, typAusOrdner: true, geprueft: true }
          : { typFrage: true, geprueft: true, passt: false, grund: "kein Maschinentyp gewählt" });
      }
      return { datei, zuordnung };
    }));
    const offen = eintraege.filter((e) => e.zuordnung.typFrage);
    if (offen.length && typen.length) {
      const namen = offen.map((e) => "„" + e.datei.name + "“");
      const wahl = await alt.auswahlDialog("Für welchen Maschinentyp?",
        typenSortiert(typen).map((t) => ({ wert: t.id, text: t.name })),
        (offen.length === 1 ? "Im Namen von " + namen[0] + " steht kein Maschinentyp."
          : "Bei " + offen.length + " Einrichtblättern steht kein Maschinentyp im Namen: "
            + namen.slice(0, 5).join(", ") + (offen.length > 5 ? " …" : "") + ".")
          + (offen.length === 1 ? " In der Liste danach lässt sich der Typ noch ändern."
            : " Der gewählte Typ gilt für alle, in der Liste danach lässt er sich je Datei ändern."));
      const t = wahl !== null && typen.find((x) => String(x.id) === String(wahl));
      if (t) offen.forEach((e) => { e.zuordnung = typSetzen(e.zuordnung, t); });
    }
    setPool({ typen: typenSortiert(typen), eintraege: eintraege.map((e) => Object.assign(e, { nehmen: e.zuordnung.passt })) });
  };

  // Dateien aus dem Explorer auf die Fläche ziehen, auch ganze Ordner
  const [ueber, setUeber] = useState(false);
  const fallen = async (e) => {
    e.preventDefault(); setUeber(false);
    if (!darf) return;
    let dateien;
    try { dateien = await ausAblage(e.dataTransfer); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
    dateien = dateien.filter((d) => DATEI_ARTEN.test(d.datei.name));
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
        if (!DATEI_ARTEN.test(eintrag.name)) continue;
        dateien.push({ datei: await eintrag.getFile(), ordner: [ordner.name] });
        if (dateien.length >= 500) break;
      }
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
    if (!dateien.length) { alt.meldung("Im Ordner liegen keine Dateien.", "warn"); return; }
    pruefen(dateien);
  };

  const hochladenWaehlen = async () => {
    const dateien = await alt.dokWaehlen(true);
    if (dateien.length) pruefen(dateien.map((datei) => ({ datei })));
  };

  return (
    <>
      {/* Ganz oben: Passwörter der Notizbücher, nur für Admins
          (Wunsch Patrick 7. Oktober 2026) */}
      {alt.istAdmin() && <Gruppe titel="Notizbücher" id="nb-balken"
        text="Passwort eines Notizbuchs neu setzen oder die Sperre aufheben, ohne das alte zu kennen."
        aktionen={<button className="knopf knopf--klein" id="nb-verwalten" onClick={notizbuecherVerwalten}>Bearbeiten</button>} />}
      <Gruppe titel="Ordner abgleichen"
        text={kannOrdner
          ? "Die App ordnet jede Datei nach ihrem Namen zu und zeigt die Zuordnung, bevor etwas hochgeladen wird."
          : "Ganze Ordner gehen nur in Chrome oder Edge am Rechner."}
        aktionen={darf && kannOrdner && <button className="knopf knopf--klein knopf--haupt" id="pool-ordner"
          onClick={ordnerLesen}>Ordner wählen</button>}>
        {darf && !pool && <div id="pool-ablage" className={"pool-ablage" + (ueber ? " pool-ablage--ueber" : "")}
          onDragOver={(e) => { e.preventDefault(); setUeber(true); }}
          onDragLeave={() => setUeber(false)} onDrop={fallen}>
          <b>Dateien hierher ziehen</b>
          <span className="klein">WBG mit FA Nr. und HOCO Nr. im Namen (etwa „20268566 10007-0381.pdf“) kommen an den
            nächsten offenen Auftrag ohne FA Nr., die FA Nr. wird dort eingetragen. Einrichtblätter nur als Excel
            (etwa „10844-0049 SW-20.xlsx“). Steht kein Maschinentyp im Namen, fragt die App nach dem Typ, ausser
            der Ordner heisst wie der Typ: Dann einfach den ganzen Ordner hierher ziehen.</span>
        </div>}
        <div id="pool-liste">
          {pool && (pool.laedt
            ? <div className="laedt">Wird geprüft …</div>
            : <Zuordnung eintraege={pool.eintraege} typen={pool.typen} fertig={() => { setPool(null); frisch(); }} />)}
        </div>
      </Gruppe>
      <PoolOrdner />
      <EinrichtblattOrdner />
      <ZeichnungsOrdner />
      <Letzte stand={stand} hochladen={hochladenWaehlen} />
    </>
  );
}

// ---------- Zuordnung prüfen, dann hochladen ----------

function Zuordnung({ eintraege: anfang, typen, fertig }) {
  const [eintraege, setEintraege] = useState(anfang);
  const [nehmen, setNehmen] = useState(() => anfang.map((e) => e.nehmen));
  // Typ eines Einrichtblatts ohne Typ im Namen hier je Datei ändern
  const typWaehlen = (i, id) => {
    const t = (typen || []).find((x) => String(x.id) === id) || null;
    setEintraege((l) => l.map((e, j) => (j === i ? Object.assign({}, e, { zuordnung: typSetzen(e.zuordnung, t) }) : e)));
    setNehmen((n) => n.map((x, j) => (j === i ? !!t : x)));
  };
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
              disabled={e.zuordnung.typFrage && !e.zuordnung.typ}
              onChange={(ev) => setNehmen((n) => n.map((x, j) => (j === i ? ev.target.checked : x)))} /></td>
            <td>{e.datei.name}</td>
            <td>{artVon(e.zuordnung.art).zeichen} {artVon(e.zuordnung.art).name}</td>
            <td>{e.zuordnung.hoco || "—"}</td>
            <td>{e.zuordnung.typFrage
              ? <select data-pooltyp={i} value={e.zuordnung.typ ? String(e.zuordnung.typ.id) : ""}
                  onChange={(ev) => typWaehlen(i, ev.target.value)}>
                  <option value="">Typ wählen …</option>
                  {(typen || []).map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                </select>
              : e.zuordnung.typ ? e.zuordnung.typ.name + (e.zuordnung.typAusOrdner ? " (vom Ordner)" : "") : "—"}</td>
            <td className="klein">{e.zuordnung.fa
              ? (e.zuordnung.auftrag
                  ? "FA " + e.zuordnung.fa + (e.zuordnung.auftrag.planned_from ? " · geplant " + alt.kurzDatum(e.zuordnung.auftrag.planned_from) : "")
                  : e.zuordnung.grund)
              : "—"}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="hinweis">Grau hinterlegte Zeilen konnte die App keiner Nummer, keinem Typ oder keinem
        offenen Auftrag zuordnen. Fehlt bei einem Einrichtblatt nur der Typ, wähle ihn in der Spalte Typ. Benenne die Datei um, plane zuerst den Auftrag oder lade sie direkt bei der HOCO Nr. hoch.</p>
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
  // Nimmt WBGs von Aufträgen weg, die seit über fünf Tagen fertig sind (sonst einmal am Tag von selbst)
  const aufraeumen = async () => {
    const n = await alt.wbgAufraeumen(true);
    alt.meldung(n ? n + " alte WBG entfernt." : "Nichts aufzuräumen.");
  };
  return (
    <Gruppe titel="Pool-Ordner"
      aktionen={<button className="knopf knopf--klein" id="wbg-aufraeumen" onClick={aufraeumen}>Alte WBG aufräumen</button>}
      text={"Nur für WBGs. Alle fünf Minuten werden sie hochgeladen und aus dem Ordner gelöscht. Anderes kommt "
        + "in den Unterordner „nicht zugeordnet“. Eine WBG ohne geplanten Auftrag wartet bis zu sieben Tage."}>
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
      text={"Je Ordner ein Maschinentyp. Alle fünf Minuten werden Excel-Dateien mit HOCO Nr. im Namen "
        + "hochgeladen. In den Ordnern wird nie etwas gelöscht, verschoben oder geändert."}>
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

// ---------- Zeichnungs-Ordner (nur lesen, auf Knopfdruck) ----------
//  zeichnungen.ps1 liest diesen Ordner über die Aufgabenplanung. Darin
//  liegen viele PDFs und anderes. Je HOCO Nr. zählt nur eine PDF mit
//  „hofer“ im Namen, sonst eine mit „kunde“; gibt es keine, bleibt die
//  Nummer weg (Wunsch 5. Oktober 2026). Es löscht, verschiebt und ändert
//  dort nie etwas.
//  Hochgeladen wird nur noch auf Knopfdruck (Wunsch Patrick 8. Oktober
//  2026: „das brauchts nur paar mal im Jahr“). Der Knopf schreibt
//  zng_auftrag, das Programm schaut alle fünf Minuten nach und tut
//  sonst nichts. Den Stand meldet es unter dok_pfad_status: Diesen
//  Eintrag darf das Dienstkonto schon schreiben, so braucht es kein
//  neues SQL.

async function zngLaden() {
  const werte = {};
  try {
    const r = await alt.zeitlimit(alt.db.from("app_config").select("schluessel, wert")
      .in("schluessel", ["zng_ordner", "zng_auftrag", "dok_pfad_status"]), 6000, "Zeichnungs-Ordner");
    ((r && r.data) || []).forEach((x) => { werte[x.schluessel] = x.wert; });
  } catch (f) { /* leer lassen */ }
  return werte;
}

// Offen = gedrückt, aber vom Programm noch nicht fertig gemeldet. Mehr
// als 100 Dateien schafft es nicht in einem Durchlauf (rest > 0), dann
// macht es beim nächsten weiter. Nach zwei Tagen gilt der Knopfdruck
// auch für das Programm nicht mehr.
function zngOffen(auftrag, stand) {
  if (!auftrag || !auftrag.id) return false;
  const a = stand && stand.auftrag;
  if (a && a.id === auftrag.id && !(stand.rest > 0)) return false;
  return Date.now() - new Date(auftrag.zeit).getTime() < 2 * 86400000;
}

function ZeichnungsOrdner() {
  const [auffrischen, setAuffrischen] = useState(0);
  const { daten } = useDaten(zngLaden, [auffrischen]);
  const neu = () => setAuffrischen((n) => n + 1);
  // Nach dem Knopfdruck alle 10 Sekunden nachsehen, sonst jede Minute
  const st = daten && jsonOder(daten.dok_pfad_status, null);
  const offen = !!daten && zngOffen(jsonOder(daten.zng_auftrag, null), st && st.zng ? st : null);
  useEffect(() => {
    const t = setInterval(neu, offen ? 10000 : 60000);
    return () => clearInterval(t);
  }, [offen]);
  return (
    <Gruppe titel="Zeichnungs-Ordner" id="zng-ordner"
      text={"Auf Knopfdruck wird je HOCO Nr. die PDF mit „hofer“ im Namen als Zeichnung hochgeladen, "
        + "sonst die mit „kunde“. Im Ordner wird nie etwas gelöscht, verschoben oder geändert."}>
      {daten ? <ZngFormular werte={daten} offen={offen} neu={neu} /> : <div className="laedt">Wird geladen …</div>}
    </Gruppe>
  );
}

function ZngFormular({ werte, offen, neu }) {
  const start = jsonOder(werte.zng_ordner, null) || {};
  const [pfad, setPfad] = useState(start.pfad || "");
  const [unter, setUnter] = useState(!!start.unter);
  const st = jsonOder(werte.dok_pfad_status, null);
  // Ein Stand vom früheren Netzlaufwerk-Programm hat kein „zng“
  const stand = st && st.zng ? st : null;
  const auftrag = jsonOder(werte.zng_auftrag, null);
  const admin = alt.istAdmin();

  // scharf bleibt immer aus: Eine noch alte Fassung von zeichnungen.ps1
  // auf dem Rechner lädt so nicht mehr von selbst alle fünf Minuten hoch
  const speichern = async () => {
    const r = await alt.db.from("app_config").upsert([{ schluessel: "zng_ordner",
      wert: JSON.stringify({ pfad: pfad.trim(), unter, scharf: false }) }]);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return false; }
    return true;
  };

  const knopf = async (art) => {
    if (!pfad.trim()) { alt.meldung("Zuerst den Ordner eintragen.", "warn"); return; }
    if (art === "hochladen") {
      const ok = await alt.nachfragen({ titel: "Zeichnungen hochladen?",
        text: "Der Rechner im Betrieb lädt alle neuen und geänderten Zeichnungen aus dem Ordner hoch. Eine "
          + "vorhandene Zeichnung derselben HOCO Nr. wird in der App ersetzt. Im Ordner ändert sich nichts.",
        bestaetigen: "Hochladen" });
      if (!ok) return;
    }
    // Den Ordner, wie er gerade im Feld steht, gleich mitspeichern
    if (pfad.trim() !== (start.pfad || "") || unter !== !!start.unter) { if (!(await speichern())) return; }
    const p = alt.profil || {};
    const neuerAuftrag = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), art,
      zeit: new Date().toISOString(), von: p.full_name || p.email || "" };
    const r = await alt.db.from("app_config").upsert([{ schluessel: "zng_auftrag", wert: JSON.stringify(neuerAuftrag) }]);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    neu();
  };

  // ---------- Was das Programm meldet ----------
  let zeile;
  if (!stand) zeile = <span className="gedaempft">Die Aufgabe „Hofer Zeichnungen“ hat sich noch nicht gemeldet.</span>;
  else {
    const minuten = (Date.now() - new Date(stand.gesehen || stand.zeit).getTime()) / 60000;
    const wuerde = (stand.neu || 0) + (stand.ersetzt || 0);
    const durchlauf = stand.pdf !== undefined;
    zeile = <>
      <span className={"dokpfad-punkt " + (minuten < 15 ? "dokpfad-punkt--gut" : "dokpfad-punkt--alt")} />
      {!durchlauf ? "Bereit" + (stand.rechner ? " auf " + stand.rechner : "") + " · noch nie auf Knopfdruck gelaufen"
        : (stand.scharf ? "Hochgeladen " : "Probelauf ") + alt.datumZeitKurz(stand.zeit) + (stand.rechner ? " auf " + stand.rechner : "")
        + " · " + alt.zahlText(stand.pdf || 0) + " PDFs · " + alt.zahlText(stand.nummern || 0) + " HOCO Nr. mit Zeichnung · "
        + (stand.scharf ? (stand.hochgeladen || 0) + " hochgeladen" + (stand.rest ? ", " + alt.zahlText(stand.rest) + " folgen" : "")
          : wuerde + " würden hochgeladen (" + (stand.neu || 0) + " neu, " + (stand.ersetzt || 0) + " ersetzen eine vorhandene"
            + (stand.mb ? ", zusammen " + stand.mb + " MB" : "") + ")")}
      {minuten >= 15 && <> <b>— seit {Math.round(minuten)} Minuten keine Meldung</b></>}
      {stand.fehler && <div className="klein" style={{ color: "var(--gefahr)" }}>{stand.fehler}</div>}
      {!stand.knopf && <div className="klein" id="zng-altfassung" style={{ color: "var(--gefahr)" }}>
        Auf dem Rechner läuft noch die alte Fassung des Programms. Sie kennt den Knopf noch nicht.</div>}
    </>;
  }
  const liste = (stand && stand.liste) || [];
  const laeuft = offen && stand && stand.auftrag && stand.auftrag.id === (auftrag && auftrag.id);

  return (
    <>
      <Zeile titel="Ordner" text="Als \\Server\Freigabe\… eintragen, nicht mit Laufwerksbuchstaben wie Z:.">
        <input type="text" id="zng-pfad" aria-label="Zeichnungs-Ordner" placeholder={"\\\\Server\\Zeichnungen"}
          value={pfad} disabled={!admin} onChange={(e) => setPfad(e.target.value)} />
      </Zeile>
      <SchalterZeile id="zng-unter" titel="Unterordner einbeziehen" checked={unter}
        onChange={admin ? (e) => setUnter(e.target.checked) : () => {}} />
      <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
        <div id="zng-stand" className="dokpfad-stand">{zeile}</div>
        {admin && <button className="knopf knopf--klein" id="zng-speichern"
          onClick={async () => { if (await speichern()) { alt.meldung("Gespeichert.", "gut"); neu(); } }}>Ordner speichern</button>}</div>
      {admin && <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
        <div id="zng-auftrag" className="dokpfad-stand">
          {offen ? <><span className="si-dreher" aria-hidden="true" /> {(auftrag.art === "hochladen" ? "Hochladen" : "Probelauf")
            + (laeuft ? " läuft, beim nächsten Durchlauf geht es weiter." : " angefordert um " + alt.datumZeitKurz(auftrag.zeit)
              + ". Der Rechner beginnt innert fünf Minuten.")}</>
            : <span className="gedaempft">Der Probelauf zeigt nur, was hochgeladen würde.</span>}
        </div>
        <button className="knopf knopf--klein" id="zng-probe" disabled={offen} onClick={() => knopf("probe")}>Probelauf</button>
        <button className="knopf knopf--klein knopf--haupt" id="zng-hochladen" disabled={offen}
          onClick={() => knopf("hochladen")}>Zeichnungen hochladen</button>
      </div>}
      {liste.length > 0 && <details className="eb-liste" open={!stand.scharf}>
        <summary>{stand.scharf ? "Letzter Durchlauf" : "Was der Probelauf hochladen würde"} ({liste.length})</summary>
        <div className="tabellenrolle">
          <table className="tabelle es-tabelle" id="zng-tabelle"><thead><tr>
            <th>Datei</th><th>HOCO Nr.</th><th>Ergebnis</th></tr></thead>
            <tbody>{liste.map((x, i) => (
              <tr key={i}><td><code>{x.d}</code></td><td>{x.h || "–"}</td><td>{x.w}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>}
    </>
  );
}

// Den Verlauf (Tabelle dokumente_verlauf) schreiben App und Aufgaben
// weiter, angezeigt wird er nicht mehr (Wunsch 5. Oktober 2026): Er ist
// nur zum Nachschauen, wenn etwas nicht stimmt.

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
