// =================================================================
//  EINSTELLUNGEN → DOKUMENTE
//  Ordner abgleichen (die App liest einen Ordner, ordnet jede Datei
//  am Namen zu und lädt erst nach einem Blick auf die Zuordnung hoch),
//  die Ordner, die Aufgaben der Windows-Aufgabenplanung lesen (Pool und
//  Zeichnungen beim Öffnen, Einrichtblätter auf Knopfdruck) und was zuletzt abgelegt wurde. Die Regeln für Dateinamen sind fest im Code (DOK_REGELN).
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

// ---------- Knopfdruck für die Aufgaben auf dem Pool-Rechner ----------
//  Einrichtblätter kommen nur auf Knopfdruck (Wunsch Patrick 8. Oktober
//  2026: „das brauchts nur paar mal im Jahr“; WBGs und Zeichnungen seit
//  111.98.0 beim Öffnen, siehe unten). Der Knopf schreibt eb_auftrag in
//  app_config; die Aufgabe schaut alle fünf Minuten nach und tut sonst
//  nichts. Ihren Stand meldet sie unter eb_ordner_status. „gesehen“ im
//  Stand ist die letzte Meldung, „knopf“ heisst, dass die Fassung auf
//  dem Rechner den Knopf kennt.

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

// Offen = gedrückt, aber vom Programm noch nicht fertig gemeldet. Mehr
// Dateien, als ein Durchlauf schafft (rest > 0): Der nächste macht
// weiter. Nach zwei Tagen gilt der Knopfdruck auch für das Programm
// nicht mehr.
function auftragOffen(auftrag, stand) {
  if (!auftrag || !auftrag.id) return false;
  const a = stand && stand.auftrag;
  if (a && a.id === auftrag.id && !(stand.rest > 0)) return false;
  return Date.now() - new Date(auftrag.zeit).getTime() < 2 * 86400000;
}

// Nach dem Knopfdruck alle 10 Sekunden nachsehen, sonst jede Minute
function useNachsehen(laden) {
  const [auffrischen, setAuffrischen] = useState(0);
  const { daten } = useDaten(laden, [auffrischen]);
  const [offen, setOffen] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setAuffrischen((n) => n + 1), offen ? 10000 : 60000);
    return () => clearInterval(t);
  }, [offen]);
  return { daten, neu: () => setAuffrischen((n) => n + 1), setOffen };
}

// Punkt, Zeit der letzten Meldung, Warnung bei Stille oder alter Fassung
function Lebt({ stand, aufgabe, children }) {
  if (!stand) return <span className="gedaempft">Die Aufgabe „{aufgabe}“ hat sich noch nicht gemeldet.</span>;
  const minuten = (Date.now() - new Date(stand.gesehen || stand.zeit).getTime()) / 60000;
  return <>
    <span className={"dokpfad-punkt " + (minuten < 15 ? "dokpfad-punkt--gut" : "dokpfad-punkt--alt")} />
    {children}
    {minuten >= 15 && <> <b>— seit {Math.round(minuten)} Minuten keine Meldung</b></>}
    {stand.fehler && <div className="klein" style={{ color: "var(--gefahr)" }}>{stand.fehler}</div>}
    {!stand.knopf && <div className="klein dok-altfassung" style={{ color: "var(--gefahr)" }}>
      Auf dem Rechner läuft noch die alte Fassung des Programms. Sie kennt den Knopf noch nicht.</div>}
  </>;
}

// Die Knöpfe „Probelauf“ und „… hochladen“ mit der Zeile davor
function KnopfReihe({ id, schluessel, auftrag, offen, stand, probe, hochladen, frage, vorher, neu }) {
  const laeuft = offen && stand && stand.auftrag && stand.auftrag.id === auftrag.id;
  const geben = async (art) => {
    if (vorher && !(await vorher())) return;
    if (art === "hochladen" && frage) {
      const ok = await alt.nachfragen({ titel: hochladen + "?", text: frage, bestaetigen: "Hochladen" });
      if (!ok) return;
    }
    const p = alt.profil || {};
    const neuerAuftrag = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), art,
      zeit: new Date().toISOString(), von: p.full_name || p.email || "" };
    const r = await alt.db.from("app_config").upsert([{ schluessel, wert: JSON.stringify(neuerAuftrag) }]);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    neu();
  };
  return (
    <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
      <div id={id + "-auftrag"} className="dokpfad-stand dok-auftrag">
        {offen ? <><span className="si-dreher" aria-hidden="true" /> {(auftrag.art === "hochladen" ? "Hochladen" : "Probelauf")
          + (laeuft ? " läuft, beim nächsten Durchlauf geht es weiter." : " angefordert um " + alt.datumZeitKurz(auftrag.zeit)
            + ". Der Rechner beginnt innert fünf Minuten.")}</>
          : <span className="gedaempft">{probe ? "Der Probelauf zeigt nur, was hochgeladen würde." : ""}</span>}
      </div>
      {probe && <button className="knopf knopf--klein" id={id + "-probe"} disabled={offen}
        onClick={() => geben("probe")}>Probelauf</button>}
      <button className="knopf knopf--klein knopf--haupt" id={id + "-hochladen"} disabled={offen}
        onClick={() => geben("hochladen")}>{hochladen}</button>
    </div>
  );
}

// ---------- Pool-Ordner und Zeichnungs-Ordner: auf Abruf ----------
//  Seit 111.98.0 ohne Knöpfe und ohne fünf Minuten (Wunsch Patrick
//  8. Oktober 2026): Wer eine WBG oder Zeichnung öffnet, lässt
//  dokumente-abruf.ps1 auf dem Pool-Rechner nachschauen (DokAbruf.jsx).
//  Das Programm meldet sich alle 30 Sekunden unter dok_abruf_status,
//  nach dem Leeren des Pools wie bisher unter dok_pool_status.

// Lauscht die Aufgabe „Hofer Dokumente“?
function Lauscht({ st }) {
  if (!st || !st.gesehen) {
    return <span className="gedaempft">Die Aufgabe „Hofer Dokumente“ auf dem Rechner im Betrieb hat sich noch
      nicht gemeldet. Bis dahin zeigt die App nur, was schon hochgeladen ist.</span>;
  }
  const sekunden = (Date.now() - new Date(st.gesehen).getTime()) / 1000;
  const gut = sekunden < 90;
  return <>
    <span className={"dokpfad-punkt " + (gut ? "dokpfad-punkt--gut" : "dokpfad-punkt--alt")} />
    {gut ? "Bereit" + (st.rechner ? " auf " + st.rechner : "") + ", schaut beim Öffnen nach"
      : <b>Seit {sekunden < 5400 ? Math.round(sekunden / 60) + " Minuten" : alt.datumZeitKurz(st.gesehen)} keine Meldung
        {st.rechner ? " von " + st.rechner : ""}. Die App zeigt nur, was schon hochgeladen ist.</b>}
    {st.fehler && <div className="klein" style={{ color: "var(--gefahr)" }}>{st.fehler}</div>}
  </>;
}

const poolLaden = () => configLaden(["dok_pool_pfad", "dok_pool_status", "dok_abruf_status"], "Pool");

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
      text={"Nur für WBGs. Sobald jemand eine WBG öffnet, lädt der Rechner im Betrieb alle WBGs aus diesem Ordner "
        + "hoch und löscht sie dort. Anderes kommt in den Unterordner „nicht zugeordnet“. Eine WBG ohne geplanten "
        + "Auftrag bleibt bis zu sieben Tage liegen und kommt beim nächsten Öffnen mit."}>
      {daten ? <PoolFormular werte={daten} /> : <div className="laedt">Wird geladen …</div>}
    </Gruppe>
  );
}

function PoolFormular({ werte }) {
  const [pfad, setPfad] = useState(werte.dok_pool_pfad || "");
  const st = jsonOder(werte.dok_pool_status, null);
  const lauscht = jsonOder(werte.dok_abruf_status, null);
  const admin = alt.istAdmin();

  const speichern = async () => {
    const r = await alt.db.from("app_config").upsert([{ schluessel: "dok_pool_pfad", wert: pfad.trim() }]);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    alt.meldung("Pool-Ordner gespeichert.");
  };

  // Nur Stände des neuen Programms zählen, alte haben kein „abruf“
  const lief = st && st.abruf;
  return (
    <>
      <Zeile titel="Ordner" text="Auf dem Rechner, auf dem die Aufgabe läuft. Leer lassen, dann gilt C:\Hofer\Pool.">
        <input type="text" id="dokpool" aria-label="Pool-Ordner" placeholder={"C:\\Hofer\\Pool"} value={pfad}
          disabled={!admin} onChange={(e) => setPfad(e.target.value)} />
      </Zeile>
      <div className="knopfreihe es-knopfreihe es-knopfreihe--ende">
        <div id="dokpool-stand" className="dokpfad-stand">
          <Lauscht st={lauscht} />
          {lief && <div className="klein gedaempft">Zuletzt geleert {alt.datumZeitKurz(st.zeit)} · {st.neu || 0} abgelegt
            {st.wartet && st.wartet.length ? " · " + st.wartet.length + " warten auf ihren Auftrag" : ""}</div>}
          {lief && st.fehler && <div className="klein" style={{ color: "var(--gefahr)" }}>{st.fehler}</div>}
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
//  einrichtblaetter.ps1 liest diese Ordner über die Aufgabenplanung und
//  lädt Excel-Dateien mit HOCO Nr. im Namen als Einrichtblatt auf den Typ
//  des Ordners. Es löscht dort nie etwas.

async function ebLaden() {
  const werte = await configLaden(["eb_ordner", "eb_ordner_status", "eb_auftrag"], "Einrichtblatt-Ordner");
  const typen = await typenHolen();
  return { werte, typen };
}

function EinrichtblattOrdner() {
  const { daten, neu, setOffen } = useNachsehen(ebLaden);
  return (
    <Gruppe titel="Einrichtblatt-Ordner" id="eb-ordner"
      text={"Je Ordner ein Maschinentyp. Auf Knopfdruck werden Excel-Dateien mit HOCO Nr. im Namen "
        + "hochgeladen. In den Ordnern wird nie etwas gelöscht, verschoben oder geändert."}>
      {daten ? <EbFormular werte={daten.werte} typen={daten.typen} neu={neu} setOffen={setOffen} />
        : <div className="laedt">Wird geladen …</div>}
    </Gruppe>
  );
}

function EbFormular({ werte, typen, neu, setOffen }) {
  const start = jsonOder(werte.eb_ordner, null) || {};
  const [ordner, setOrdner] = useState(
    (start.ordner && start.ordner.length) ? start.ordner : [{ pfad: "", typ: "", unter: false }]);
  const [gespeichert, setGespeichert] = useState(JSON.stringify(start.ordner || []));
  const st = jsonOder(werte.eb_ordner_status, null);
  const auftrag = jsonOder(werte.eb_auftrag, null);
  const offen = auftragOffen(auftrag, st);
  useEffect(() => setOffen(offen), [offen]);
  const admin = alt.istAdmin();

  const aendern = (i, feld, wert) => setOrdner((l) => l.map((o, j) => (j === i ? { ...o, [feld]: wert } : o)));
  const liste = () => ordner.map((o) => ({ pfad: (o.pfad || "").trim(), typ: o.typ || "", unter: !!o.unter }))
    .filter((o) => o.pfad);
  // scharf bleibt immer aus: Eine noch alte Fassung von einrichtblaetter.ps1
  // auf dem Rechner lädt so nicht mehr von selbst alle fünf Minuten hoch
  const speichern = async (still) => {
    const l = liste();
    if (l.some((o) => !o.typ)) { alt.meldung("Bei jedem Ordner einen Maschinentyp wählen.", "warn"); return false; }
    const r = await alt.db.from("app_config").upsert([{ schluessel: "eb_ordner",
      wert: JSON.stringify({ scharf: false, ordner: l }) }]);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return false; }
    setGespeichert(JSON.stringify(l));
    if (!still) alt.meldung("Gespeichert.", "gut");
    return true;
  };
  const vorher = async () => {
    const l = liste();
    if (!l.length) { alt.meldung("Zuerst einen Ordner eintragen.", "warn"); return false; }
    return JSON.stringify(l) === gespeichert ? true : speichern(true);
  };

  const wuerde = st ? (st.neu || 0) + (st.ersetzt || 0) : 0;
  const lief = st && (!st.knopf || st.auftrag);
  const stand = (
    <Lebt stand={st} aufgabe="Hofer Einrichtblätter">
      {st && (!lief ? "Bereit" + (st.rechner ? " auf " + st.rechner : "") + " · noch nie auf Knopfdruck gelaufen"
        : (st.scharf ? (st.knopf ? "Hochgeladen " : "Zuletzt ") : "Probelauf ") + alt.datumZeitKurz(st.zeit)
        + (st.rechner ? " auf " + st.rechner : "") + " · " + (st.excel || 0) + " Excel-Dateien · "
        + (st.scharf ? (st.hochgeladen || 0) + " hochgeladen" + (st.rest ? ", " + alt.zahlText(st.rest) + " folgen" : "")
          : wuerde + " würden hochgeladen (" + (st.neu || 0) + " neu, " + (st.ersetzt || 0) + " ersetzen ein vorhandenes)"))}
    </Lebt>
  );
  const zeilen = (lief && st.liste) || [];

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
        <div id="eb-stand" className="dokpfad-stand">{stand}</div>
        {admin && <button className="knopf knopf--klein" id="eb-speichern"
          onClick={() => speichern(false)}>Ordner speichern</button>}</div>
      {admin && <KnopfReihe id="eb" schluessel="eb_auftrag" auftrag={auftrag} offen={offen} stand={st} probe
        hochladen="Einrichtblätter hochladen" vorher={vorher} neu={neu}
        frage={"Der Rechner im Betrieb lädt alle neuen und geänderten Einrichtblätter aus den Ordnern hoch. Ein "
          + "vorhandenes Einrichtblatt derselben HOCO Nr. auf demselben Typ wird in der App ersetzt. In den Ordnern "
          + "ändert sich nichts."} />}
      {zeilen.length > 0 && <details className="eb-liste" open={!st.scharf}>
        <summary>{st.scharf ? "Letzter Durchlauf" : "Was der Probelauf hochladen würde"} ({zeilen.length})</summary>
        <div className="tabellenrolle">
          <table className="tabelle es-tabelle" id="eb-tabelle"><thead><tr>
            <th>Datei</th><th>HOCO Nr.</th><th>Typ</th><th>Ergebnis</th></tr></thead>
            <tbody>{zeilen.map((x, i) => (
              <tr key={i}><td><code>{x.d}</code></td><td>{x.h || "–"}</td>
                <td>{(st.ordner && st.ordner[x.o] && st.ordner[x.o].typ) || ""}</td><td>{x.w}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>}
      {lief && st.ordner && st.ordner.some((o) => o.fehler) && <div className="klein" style={{ color: "var(--gefahr)" }}>
        {st.ordner.filter((o) => o.fehler).map((o) => o.pfad + ": " + o.fehler).join(" · ")}</div>}
    </>
  );
}

// ---------- Zeichnungs-Ordner (nur lesen) ----------
//  dokumente-abruf.ps1 sucht hier beim Öffnen einer Zeichnung die PDF
//  der HOCO Nr.: die mit „hofer“ im Namen, sonst die mit „kunde“; gibt
//  es keine, bleibt die Nummer weg (Wunsch 5. Oktober 2026). Es löscht,
//  verschiebt und ändert dort nie etwas.

const zngLaden = () => configLaden(["zng_ordner", "dok_abruf_status"], "Zeichnungs-Ordner");

function ZeichnungsOrdner() {
  const { daten, neu } = useNachsehen(zngLaden);
  return (
    <Gruppe titel="Zeichnungs-Ordner" id="zng-ordner"
      text={"Sobald jemand eine Zeichnung öffnet, sucht der Rechner im Betrieb hier die PDF der HOCO Nr. mit "
        + "„hofer“ im Namen, sonst die mit „kunde“, und lädt sie hoch, wenn sie neu oder geändert ist. Im Ordner "
        + "wird nie etwas gelöscht, verschoben oder geändert."}>
      {daten ? <ZngFormular werte={daten} neu={neu} /> : <div className="laedt">Wird geladen …</div>}
    </Gruppe>
  );
}

function ZngFormular({ werte, neu }) {
  const start = jsonOder(werte.zng_ordner, null) || {};
  const [pfad, setPfad] = useState(start.pfad || "");
  const [unter, setUnter] = useState(!!start.unter);
  const lauscht = jsonOder(werte.dok_abruf_status, null);
  const zuletzt = lauscht && lauscht.zng;
  const admin = alt.istAdmin();

  // scharf bleibt immer aus: Eine noch alte Fassung von zeichnungen.ps1 (vor 111.98.0)
  // auf dem Rechner lädt so nicht mehr von selbst hoch
  const speichern = async () => {
    const r = await alt.db.from("app_config").upsert([{ schluessel: "zng_ordner",
      wert: JSON.stringify({ pfad: pfad.trim(), unter, scharf: false }) }]);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    alt.meldung("Gespeichert.", "gut");
    neu();
  };

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
          <Lauscht st={lauscht} />
          {zuletzt && zuletzt.zeit && <div className="klein gedaempft">Zuletzt {alt.datumZeitKurz(zuletzt.zeit)}:
            {" "}{zuletzt.hoco} {zuletzt.text}</div>}
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
