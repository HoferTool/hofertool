// =================================================================
//  EINSTELLUNGEN → DOKUMENTE
//  Ordner abgleichen (die App liest einen Ordner, ordnet jede Datei
//  am Namen zu und lädt erst nach einem Blick auf die Zuordnung hoch),
//  die Ordner, die die Aufgabe „HoferTool“ alle fünf Minuten liest
//  (Pool, Einrichtblätter, Zeichnungen) und was zuletzt abgelegt wurde. Die Regeln für Dateinamen sind fest im Code (DOK_REGELN).
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

// ---------- Die Aufgabe „HoferTool“ auf dem Pool-Rechner ----------
//  Seit 111.108.0 (Wunsch Patrick 8. Oktober 2026) eine einzige Aufgabe
//  für alles, alle fünf Minuten im Hintergrund, ohne Knöpfe in der App:
//  WBGs aus dem Pool-Ordner (dort danach gelöscht), Zeichnungen und
//  Einrichtblätter (dort nur lesen), dazu Solar. Unveränderte Dateien
//  bleiben liegen. Jeder Teil meldet seinen Stand in app_config
//  (dok_pool_status, dok_pfad_status, eb_ordner_status), „gesehen“ ist
//  der letzte Durchlauf, „zuletzt“ wann zuletzt etwas hochkam.

function jsonOder(text, ersatz) {
  try { return text ? JSON.parse(text) : ersatz; } catch (f) { return ersatz; }
}

async function configLaden(schluessel, name) {
  const werte = {};
  try {
    const r = await alt.zeitlimit(alt.db.from("app_config").select("schluessel, wert")
      .in("schluessel", schluessel), 6000, name);
    ((r && r.data) || []).forEach((x) => { werte[x.schluessel] = x.wert; });
  } catch (f) { /* leer lassen */ }
  return werte;
}

// Jede Minute nachsehen, damit der Stand von selbst nachkommt
function useNachsehen(laden) {
  const [auffrischen, setAuffrischen] = useState(0);
  const { daten } = useDaten(laden, [auffrischen]);
  useEffect(() => {
    const t = setInterval(() => setAuffrischen((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  return { daten, neu: () => setAuffrischen((n) => n + 1) };
}

// Punkt, letzter Durchlauf, wann zuletzt etwas kam, Fehler. Grün, wenn
// sich die Aufgabe in den letzten 15 Minuten gemeldet hat.
function Lebt({ stand, children }) {
  if (!stand || !stand.immer) {
    return <span className="gedaempft">Die Aufgabe „HoferTool“ hat sich noch nicht gemeldet.</span>;
  }
  const minuten = (Date.now() - new Date(stand.gesehen || stand.zeit).getTime()) / 60000;
  const z = stand.zuletzt;
  return <>
    <span className={"dokpfad-punkt " + (minuten < 15 ? "dokpfad-punkt--gut" : "dokpfad-punkt--alt")} />
    Geprüft {alt.datumZeitKurz(stand.gesehen || stand.zeit)}{stand.rechner ? " auf " + stand.rechner : ""}
    {minuten >= 15 && <> <b>— seit {minuten < 5400 ? Math.round(minuten) + " Minuten" : "Tagen"} keine Meldung</b></>}
    {children}
    <div className="klein gedaempft">{z && z.zeit ? "Zuletzt hochgeladen " + alt.datumZeitKurz(z.zeit) + " (" + z.anzahl + ")"
      : "Noch nichts hochgeladen"}</div>
    {stand.fehler && <div className="klein" style={{ color: "var(--gefahr)" }}>{stand.fehler}</div>}
  </>;
}

const poolLaden = () => configLaden(["dok_pool_pfad", "dok_pool_status"], "Pool");

function PoolOrdner() {
  const { daten } = useNachsehen(poolLaden);
  // Nimmt WBGs von Aufträgen weg, die seit über fünf Tagen fertig sind (sonst einmal am Tag von selbst)
  const aufraeumen = async () => {
    const n = await alt.wbgAufraeumen(true);
    alt.meldung(n ? n + " alte WBG entfernt." : "Nichts aufzuräumen.");
  };
  return (
    <Gruppe titel="Pool-Ordner" id="pool-ordner"
      aktionen={<button className="knopf knopf--klein" id="wbg-aufraeumen" onClick={aufraeumen}>Alte WBG aufräumen</button>}
      text={"Nur für WBGs. Die Aufgabe „HoferTool“ lädt alle fünf Minuten die WBGs aus diesem Ordner hoch und "
        + "löscht sie dort. Anderes kommt in den Unterordner „nicht zugeordnet“. Eine WBG ohne geplanten Auftrag "
        + "bleibt bis zu sieben Tage liegen und kommt mit, sobald er geplant ist."}>
      {daten ? <PoolFormular werte={daten} /> : <div className="laedt">Wird geladen …</div>}
    </Gruppe>
  );
}

function PoolFormular({ werte }) {
  const [pfad, setPfad] = useState(werte.dok_pool_pfad || "");
  const st = jsonOder(werte.dok_pool_status, null);
  const admin = alt.darfDokumenteUndSicherung(); // Admins und Planwand (9. Oktober 2026)

  const speichern = async () => {
    const r = await alt.db.from("app_config").upsert([{ schluessel: "dok_pool_pfad", wert: pfad.trim() }]);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    alt.meldung("Pool-Ordner gespeichert.");
  };

  const lief = st && st.immer;
  return (
    <>
      <Zeile titel="Ordner" text="Auf dem Rechner, auf dem die Aufgabe läuft. Leer lassen, dann gilt C:\Hofer\Pool.">
        <input type="text" id="dokpool" aria-label="Pool-Ordner" placeholder={"C:\\Hofer\\Pool"} value={pfad}
          disabled={!admin} onChange={(e) => setPfad(e.target.value)} />
      </Zeile>
      <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
        <div id="dokpool-stand" className="dokpfad-stand">
          <Lebt stand={st}>{lief && st.wartet && st.wartet.length ? " · " + st.wartet.length + " warten auf ihren Auftrag" : ""}</Lebt>
          {lief && st.wartet && st.wartet.length > 0 && <div className="klein gedaempft">Wartet: {
            st.wartet.slice(0, 12).join(", ") + (st.wartet.length > 12 ? " …" : "")}</div>}
          {lief && st.ohne && st.ohne.length > 0 && <div className="klein gedaempft">Nicht zugeordnet: {
            st.ohne.slice(0, 12).join(", ") + (st.ohne.length > 12 ? " …" : "")}</div>}
        </div>
        {admin && <button className="knopf knopf--klein" id="dokpool-speichern" onClick={speichern}>Ordner speichern</button>}
      </div>
    </>
  );
}

// ---------- Einrichtblatt-Ordner (nur lesen, je Ordner ein Typ) ----------
//  einrichtblaetter.ps1 liest diese Ordner und lädt neue und geänderte
//  Excel-Dateien mit HOCO Nr. im Namen als Einrichtblatt auf den Typ
//  des Ordners. Es löscht dort nie etwas.

async function ebLaden() {
  const werte = await configLaden(["eb_ordner", "eb_ordner_status"], "Einrichtblatt-Ordner");
  const typen = await typenHolen();
  return { werte, typen };
}

function EinrichtblattOrdner() {
  const { daten } = useNachsehen(ebLaden);
  return (
    <Gruppe titel="Einrichtblatt-Ordner" id="eb-ordner"
      text={"Je Ordner ein Maschinentyp. Die Aufgabe „HoferTool“ lädt alle fünf Minuten neue und geänderte "
        + "Excel-Dateien mit HOCO Nr. im Namen hoch. In den Ordnern wird nie etwas gelöscht, verschoben oder geändert."}>
      {daten ? <EbFormular werte={daten.werte} typen={daten.typen} />
        : <div className="laedt">Wird geladen …</div>}
    </Gruppe>
  );
}

function EbFormular({ werte, typen }) {
  const start = jsonOder(werte.eb_ordner, null) || {};
  const [ordner, setOrdner] = useState(
    (start.ordner && start.ordner.length) ? start.ordner : [{ pfad: "", typ: "", unter: false }]);
  const st = jsonOder(werte.eb_ordner_status, null);
  const admin = alt.darfDokumenteUndSicherung(); // Admins und Planwand (9. Oktober 2026)

  const aendern = (i, feld, wert) => setOrdner((l) => l.map((o, j) => (j === i ? { ...o, [feld]: wert } : o)));
  const speichern = async () => {
    const l = ordner.map((o) => ({ pfad: (o.pfad || "").trim(), typ: o.typ || "", unter: !!o.unter }))
      .filter((o) => o.pfad);
    if (l.some((o) => !o.typ)) { alt.meldung("Bei jedem Ordner einen Maschinentyp wählen.", "warn"); return; }
    const r = await alt.db.from("app_config").upsert([{ schluessel: "eb_ordner", wert: JSON.stringify({ ordner: l }) }]);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    alt.meldung("Gespeichert.", "gut");
  };

  const lief = st && st.immer;
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
      <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
        <div id="eb-stand" className="dokpfad-stand">
          <Lebt stand={st}>{lief ? " · " + alt.zahlText(st.excel || 0) + " Excel-Dateien"
            + (st.rest ? " · " + alt.zahlText(st.rest) + " folgen im nächsten Durchlauf" : "") : ""}</Lebt>
        </div>
        {admin && <button className="knopf knopf--klein" id="eb-speichern" onClick={speichern}>Ordner speichern</button>}</div>
      {lief && st.ordner && st.ordner.some((o) => o.fehler) && <div className="klein" style={{ color: "var(--gefahr)" }}>
        {st.ordner.filter((o) => o.fehler).map((o) => o.pfad + ": " + o.fehler).join(" · ")}</div>}
    </>
  );
}

// ---------- Zeichnungs-Ordner (nur lesen) ----------
//  zeichnungen.ps1 lädt hier je HOCO Nr. eine PDF hoch („hofer“ vor
//  „kunde“ vor irgendeiner, 111.114.0); „Zeichnung entfernen“ im
//  Betrachter holt die nächste, von Hand Hochgeladenes ist Master. Die
//  HOCO Nr. steht im Dateinamen oder im Namen eines Ordners darüber
//  (111.113.0). Es löscht, verschiebt und ändert dort nie etwas.

const zngLaden = () => configLaden(["zng_ordner", "dok_pfad_status"], "Zeichnungs-Ordner");

function ZeichnungsOrdner() {
  const { daten, neu } = useNachsehen(zngLaden);
  return (
    <Gruppe titel="Zeichnungs-Ordner" id="zng-ordner"
      text={"Die Aufgabe „HoferTool“ lädt hier alle fünf Minuten je HOCO Nr. eine PDF hoch: zuerst eine mit „hofer“ im Namen, "
        + "sonst „kunde“, sonst irgendeine. Die HOCO Nr. darf im Dateinamen oder im Namen eines Ordners darüber stehen. "
        + "Passt die Zeichnung nicht, nimmt man sie im Betrachter mit „Zeichnung entfernen“ weg, dann kommt die nächste Datei. "
        + "Eine von Hand hochgeladene Zeichnung bleibt immer. Im Ordner wird nie etwas gelöscht, verschoben oder geändert."}>
      {daten ? <ZngFormular werte={daten} neu={neu} /> : <div className="laedt">Wird geladen …</div>}
    </Gruppe>
  );
}

function ZngFormular({ werte, neu }) {
  const start = jsonOder(werte.zng_ordner, null) || {};
  const [pfad, setPfad] = useState(start.pfad || "");
  const [unter, setUnter] = useState(!!start.unter);
  const st = jsonOder(werte.dok_pfad_status, null);
  const admin = alt.darfDokumenteUndSicherung(); // Admins und Planwand (9. Oktober 2026)

  const speichern = async () => {
    const r = await alt.db.from("app_config").upsert([{ schluessel: "zng_ordner",
      wert: JSON.stringify({ pfad: pfad.trim(), unter }) }]);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    alt.meldung("Gespeichert.", "gut");
    neu();
  };

  const lief = st && st.immer;
  return (
    <>
      <Zeile titel="Ordner" text="Als \\Server\Freigabe\… eintragen, nicht mit Laufwerksbuchstaben wie Z:.">
        <input type="text" id="zng-pfad" aria-label="Zeichnungs-Ordner" placeholder={"\\\\Server\\Zeichnungen"}
          value={pfad} disabled={!admin} onChange={(e) => setPfad(e.target.value)} />
      </Zeile>
      <SchalterZeile id="zng-unter" titel="Unterordner einbeziehen" checked={unter}
        onChange={admin ? (e) => setUnter(e.target.checked) : () => {}} />
      <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
        <div id="zng-stand" className="dokpfad-stand">
          <Lebt stand={st}>{lief ? " · " + alt.zahlText(st.nummern || 0) + " HOCO Nr. mit Zeichnung im Ordner"
            + (st.rest ? " · " + alt.zahlText(st.rest) + " folgen im nächsten Durchlauf" : "") : ""}</Lebt>
        </div>
        {admin && <button className="knopf knopf--klein" id="zng-speichern" onClick={speichern}>Ordner speichern</button>}
      </div>
    </>
  );
}

// Den Verlauf (Tabelle dokumente_verlauf) schreiben App und Aufgaben
// weiter, angezeigt wird er nicht mehr (Wunsch 5. Oktober 2026): Er ist
// nur zum Nachschauen, wenn etwas nicht stimmt.

// ---------- Zuletzt abgelegt ----------

async function letzteLaden() {
  const r = await alt.db.from("dokumente").select("*").order("erstellt_am", { ascending: false }).limit(100);
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
    <Gruppe titel="Zuletzt abgelegt" text="Die letzten 100 Dokumente."
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
