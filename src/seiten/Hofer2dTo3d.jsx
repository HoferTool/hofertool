// =================================================================
//  SEITE HOFER2DTO3D (seit 1.604.0, Wunsch Patrick 17. November 2026:
//  „du hast mir Fertigungszeichnungen in STEP-Files umgewandelt. Ich will
//  das im HoferTool haben … es soll das PDF zeigen und daneben das
//  erstellte STEP-File mit 3D-Ansicht zum Downloaden“, Reiter vor dem
//  Einlagen Generator)
//  Ablauf (Patrick: „warum muss ich das STEP hochladen, du machst es ja“):
//  Patrick lädt nur das PDF hoch, der Eintrag steht „offen“. Claude baut
//  das STEP aus der Zeichnung und legt es über die Datenbank-Verbindung in
//  zeichnung_3d_step ab (gzip + Base64, sql/hofer2dto3d-step-ablage.sql),
//  setzt status „arbeit“ (Schild „3D in Arbeit“, vorher „Wartet auf 3D“), am Schluss „fertig“, step_name und step_groesse. Wahlweise geht auch
//  ein STEP aus der Ablage (step_url). PDF in der Ablage „zeichnungen“
//  unter 2dto3d/<Kennung>/, die Liste in zeichnung_3d (sql/hofer2dto3d.sql).
//  Toleranzen sind im Modell immer auf Mitte Toleranz konstruiert
//  (Patrick). Nicht für Externe und Dienst.
// =================================================================
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import { PdfAnsicht } from "../teile/PdfAnsicht.jsx";
import { useSeitenSuche, hinzeigen } from "../teile/seitenSuche.js";
import { kannOrdner, idbTun, ordnerErlaubt } from "../teile/sicherung.js";

// three.js und OpenCascade erst laden, wenn ein Modell gezeigt wird
const Step3D = lazy(() => import("./hofer2dto3d/Step3D.jsx"));

const gemerkt = { suche: "", offen: null };

async function laden() {
  const r = await alt.zeitlimit(alt.db.from("zeichnung_3d").select("*")
    .order("erstellt_am", { ascending: false }), 15000, "HOFER2DTO3D");
  if (r.error) {
    if (/zeichnung_3d|relation|schema cache/i.test(String(r.error.message || ""))) return { fehlt: true, liste: [] };
    throw r.error;
  }
  const liste = r.data || [];
  const leute = await alt.zeitlimit(alt.db.from("profiles").select("id, full_name, email"), 8000, "Personen")
    .then((x) => x.data || [], () => []);
  return { liste, personen: new Map(leute.map((u) => [u.id, alt.personName(u)])) };
}

const istPdf = (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf";
const istStep = (f) => /\.(step|stp)$/i.test(f.name);
const hocoAus = (t) => { const m = String(t || "").match(/\d{5}-\d{4}/); return m ? m[0] : ""; };
const groesse = (b) => b > 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";

// Ablagename ohne Umlaute und Sonderzeichen, der Originalname bleibt in der Tabelle
function ablageName(name) {
  const n = String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_");
  return Date.now().toString(36) + "-" + n.slice(-80);
}

async function hochladen(ordner, datei, typ) {
  const pfad = "2dto3d/" + ordner + "/" + ablageName(datei.name);
  const up = await alt.db.storage.from("zeichnungen").upload(pfad, datei, { contentType: typ, upsert: false });
  if (up.error) throw up.error;
  return { url: alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl, pfad };
}

function dateienWaehlen(accept, mehrere) {
  return new Promise((gut) => {
    const i = document.createElement("input");
    i.type = "file"; i.accept = accept; i.multiple = !!mehrere;
    i.onchange = () => gut([...(i.files || [])]);
    i.click();
  });
}

function fehlerMelden(f) {
  const t = alt.fehlertext(f);
  alt.meldung(/exceeded|too large|413|maximum/i.test(t) ? "Die Datei ist zu gross für die Ablage." : t, "fehler");
}

// STEP aus der Datenbank: Base64 → gzip → Text, als Adresse für Ansicht und Download
const stepVorrat = new Map();
async function stepAusDb(id) {
  const r = await alt.zeitlimit(alt.db.from("zeichnung_3d_step").select("inhalt_gz").eq("id", id).maybeSingle(), 30000, "STEP");
  if (r.error) throw r.error;
  if (!r.data || !r.data.inhalt_gz) throw new Error("Das 3D-Modell ist noch nicht abgelegt.");
  const roh = Uint8Array.from(atob(r.data.inhalt_gz.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const strom = new Blob([roh]).stream().pipeThrough(new DecompressionStream("gzip"));
  const b = await new Response(strom).blob();
  return URL.createObjectURL(new Blob([b], { type: "application/step" }));
}
function stepAdresse(e) {
  if (e.step_url) return Promise.resolve(e.step_url);
  const k = e.id + "|" + (e.step_groesse || "") + "|" + (e.step_name || "");
  if (!stepVorrat.has(k)) {
    const p = stepAusDb(e.id);
    p.catch(() => stepVorrat.delete(k));
    stepVorrat.set(k, p);
  }
  return stepVorrat.get(k);
}
const stepDa = (e) => !!e.step_url || e.status === "fertig";

async function neuAnlegen(dateien, neu, setOffen) {
  const pdf = dateien.find(istPdf), step = dateien.find(istStep);
  if (!pdf) {
    alt.meldung("Bitte die Zeichnung als PDF wählen.", "warn");
    return;
  }
  const w = await alt.dialogFelder({
    titel: "Neue Zeichnung",
    text: "PDF: " + pdf.name + " · " + groesse(pdf.size) + (step ? "\nSTEP: " + step.name + " · " + groesse(step.size)
      : "\nDas 3D-Modell baut Claude aus der Zeichnung und legt es hier dazu."),
    felder: [
      { name: "hoco", label: "HOCO Nr. (freiwillig)", wert: hocoAus(pdf.name) || (step ? hocoAus(step.name) : ""), platzhalter: "z.B. 10053-1190" },
      { name: "titel", label: "Bezeichnung", pflicht: true,
        wert: (step ? step.name : pdf.name).replace(/\.(step|stp|pdf)$/i, "").replace(/[_]+/g, " ").trim() },
      { name: "notiz", label: "Notiz (freiwillig)" },
    ],
    bestaetigen: "Hochladen",
  });
  if (!w) return;
  const id = crypto.randomUUID();
  alt.meldung("Wird hochgeladen …");
  try {
    const p = await hochladen(id, pdf, "application/pdf");
    const s = step ? await hochladen(id, step, "application/step") : null;
    const r = await alt.db.from("zeichnung_3d").insert({
      id, hoco: w.hoco.trim() || null, titel: w.titel.trim(), notiz: w.notiz.trim() || null,
      pdf_url: p.url, pdf_pfad: p.pfad, pdf_name: pdf.name,
      ...(s ? { step_url: s.url, step_pfad: s.pfad, step_name: step.name, step_groesse: step.size, status: "fertig" } : { status: "offen" }),
    });
    if (r.error) throw r.error;
    alt.merkeSchritt("HOFER2DTO3D " + w.titel.trim(), alt.rueckWeg("zeichnung_3d", { id }));
    alt.meldung("Hochgeladen: " + w.titel.trim(), "gut");
    setOffen(id);
    neu();
  } catch (f) { fehlerMelden(f); }
}

async function aendern(e, neu) {
  const w = await alt.dialogFelder({
    titel: "Eintrag ändern",
    felder: [
      { name: "hoco", label: "HOCO Nr. (freiwillig)", wert: e.hoco || "" },
      { name: "titel", label: "Bezeichnung", wert: e.titel, pflicht: true },
      { name: "notiz", label: "Notiz (freiwillig)", wert: e.notiz || "" },
    ],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  speichern(e, { hoco: w.hoco.trim() || null, titel: w.titel.trim(), notiz: w.notiz.trim() || null }, "Ändern von " + e.titel, neu);
}

// PDF oder STEP ersetzen; die alte Datei bleibt liegen, damit Rückgängig geht
async function ersetzen(e, art, neu) {
  const [d] = await dateienWaehlen(art === "pdf" ? ".pdf,application/pdf" : ".step,.stp", false);
  if (!d) return;
  if (art === "pdf" ? !istPdf(d) : !istStep(d)) { alt.meldung(art === "pdf" ? "Bitte ein PDF wählen." : "Bitte eine .step- oder .stp-Datei wählen.", "warn"); return; }
  alt.meldung("Wird hochgeladen …");
  try {
    const x = await hochladen(e.id, d, art === "pdf" ? "application/pdf" : "application/step");
    const felder = art === "pdf"
      ? { pdf_url: x.url, pdf_pfad: x.pfad, pdf_name: d.name }
      : { step_url: x.url, step_pfad: x.pfad, step_name: d.name, step_groesse: d.size, status: "fertig" };
    await speichern(e, felder, (art === "pdf" ? "Zeichnung" : "STEP") + " ersetzen bei " + e.titel, neu);
  } catch (f) { fehlerMelden(f); }
}

async function speichern(e, felder, text, neu) {
  const vorher = await alt.rueckSichern("zeichnung_3d", { id: e.id });
  const r = await alt.db.from("zeichnung_3d").update(felder).eq("id", e.id);
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  if (vorher.length) alt.merkeSchritt(text, alt.rueckRein("zeichnung_3d", vorher));
  alt.meldung("Gespeichert.", "gut");
  neu();
}

async function loeschen(e, neu, setOffen) {
  const ok = await alt.nachfragen({ titel: "Löschen", text: "„" + e.titel + "“ mit Zeichnung und 3D-Modell löschen?",
    bestaetigen: "Löschen", gefahr: true });
  if (!ok) return;
  const vorher = await alt.rueckSichern("zeichnung_3d", { id: e.id });
  const r = await alt.db.from("zeichnung_3d").delete().eq("id", e.id);
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  if (vorher.length) alt.merkeSchritt("Löschen von " + e.titel, alt.rueckRein("zeichnung_3d", vorher));
  alt.meldung("Gelöscht.", "gut");
  setOffen(null);
  neu();
}

// ---------- Poolordner (Patrick: „in einen Poolordner legen … und im
// HOFER2DTO3D sagen jetzt umwandeln“, wie bei den Kreditoren) ----------
// Der Griff liegt nur im IndexedDB dieses Geräts (Chrome / Edge am PC).
const UEBERNOMMEN = "_Übernommen";
let poolHier = null;
async function poolHolen() {
  if (poolHier) return poolHier;
  try { return (await idbTun("get", "h3d-pool")) || null; } catch (f) { return null; }
}
async function poolWaehlen() {
  const h = await window.showDirectoryPicker({ id: "hofer-2dto3d", mode: "readwrite" });
  poolHier = h;
  try { await idbTun("put", h, "h3d-pool"); } catch (f) { /* dann nur bis zum Neuladen */ }
  return h;
}

// Alle PDFs direkt im Poolordner übernehmen: hochladen als „offen“ und in
// den Unterordner _Übernommen schieben. Gibt die Zahl zurück.
async function ausPoolUebernehmen(h) {
  const pdfs = [];
  for await (const [name, e] of h.entries()) if (e.kind === "file" && /\.pdf$/i.test(name)) pdfs.push(e);
  if (!pdfs.length) return 0;
  const ziel = await h.getDirectoryHandle(UEBERNOMMEN, { create: true });
  let n = 0;
  for (const e of pdfs) {
    const datei = await e.getFile();
    const id = crypto.randomUUID();
    const p = await hochladen(id, datei, "application/pdf");
    const r = await alt.db.from("zeichnung_3d").insert({
      id, hoco: hocoAus(datei.name) || null,
      titel: datei.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim(),
      pdf_url: p.url, pdf_pfad: p.pfad, pdf_name: datei.name, status: "offen", notiz: "aus dem Poolordner",
    });
    if (r.error) throw r.error;
    alt.merkeSchritt("HOFER2DTO3D " + datei.name, alt.rueckWeg("zeichnung_3d", { id }));
    // Verschieben = kopieren und löschen; gleicher Name schon da → Zeit davor
    let neuName = datei.name;
    try { await ziel.getFileHandle(neuName); neuName = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + " " + neuName; } catch (f) { /* frei */ }
    const w = await (await ziel.getFileHandle(neuName, { create: true })).createWritable();
    await w.write(await datei.arrayBuffer()); await w.close();
    await h.removeEntry(datei.name);
    n++;
  }
  return n;
}

function Pool({ neu }) {
  const [h, setH] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => { poolHolen().then(setH); }, []);
  if (!kannOrdner) return null;
  async function waehlen() {
    try { setH(await poolWaehlen()); } catch (f) { if (f && f.name !== "AbortError") alt.meldung(alt.fehlertext(f), "fehler"); }
  }
  async function umwandeln() {
    let g = h;
    if (!g) { try { g = await poolWaehlen(); setH(g); } catch (f) { return; } }
    if (await ordnerErlaubt(g, true) !== "granted") { alt.meldung("Der Browser hat den Poolordner nicht freigegeben.", "warn"); return; }
    setLaeuft(true);
    try {
      const n = await ausPoolUebernehmen(g);
      alt.meldung(n ? n + (n === 1 ? " Zeichnung" : " Zeichnungen") + " übernommen. Claude baut die 3D-Modelle, spätestens in einer Stunde, sofort, wenn du im Chat „umwandeln“ schreibst."
        : "Im Poolordner liegt kein PDF.", n ? "gut" : "warn");
      if (n) neu();
    } catch (f) { fehlerMelden(f); neu(); }
    setLaeuft(false);
  }
  return (
    <>
      <button className="knopf" id="h3d-umwandeln" disabled={laeuft} onClick={umwandeln}
        title="Alle PDFs aus dem Poolordner übernehmen und zum Umwandeln vormerken">{laeuft ? "Wird übernommen …" : "⟳ PDFs aus Poolordner holen"}</button>
      <button className="knopf knopf--klein" id="h3d-pool" onClick={waehlen}
        title="Ordner, in den du die Zeichnungen legst">📂 {h ? "Poolordner: " + h.name : "Poolordner wählen"}</button>
    </>);
}

// Herunterladen mit dem Originalnamen; über einen Blob, weil das
// download-Attribut bei Adressen einer anderen Website nicht wirkt
async function herunterladen(adresse, name) {
  try {
    const url = await adresse;
    const a = await fetch(url);
    if (!a.ok) throw new Error("Datei nicht erreichbar");
    const b = await a.blob();
    const u = URL.createObjectURL(b);
    const l = document.createElement("a");
    l.href = u; l.download = name || "datei"; document.body.appendChild(l); l.click(); l.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

const pdfVorrat = new Map();
function pdfHolen(url) {
  if (!pdfVorrat.has(url)) {
    const p = fetch(url).then((a) => { if (!a.ok) throw new Error("nicht erreichbar"); return a.arrayBuffer(); })
      .then((b) => new Uint8Array(b));
    p.catch(() => pdfVorrat.delete(url));
    if (pdfVorrat.size > 3) pdfVorrat.delete(pdfVorrat.keys().next().value);
    pdfVorrat.set(url, p);
  }
  return pdfVorrat.get(url);
}

function Zeichnung({ url }) {
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    let weg = false;
    setDaten(null); setFehler(false);
    pdfHolen(url).then((d) => { if (!weg) setDaten(d); }).catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [url]);
  if (fehler) return <div className="h3d-hinweis h3d-hinweis--fehler">Die Zeichnung lässt sich gerade nicht laden.</div>;
  if (!daten) return <div className="h3d-hinweis">Zeichnung wird geladen …</div>;
  // Kopie, weil pdf.js den Puffer übernimmt und der Vorrat ihn sonst verliert
  return <PdfAnsicht daten={daten.slice()} beiFehler={() => setFehler(true)} />;
}

function Modell({ e }) {
  const [url, setUrl] = useState(null);
  const [fehler, setFehler] = useState("");
  const k = e.id + "|" + (e.step_url || "") + "|" + (e.step_groesse || "");
  useEffect(() => {
    let weg = false;
    setUrl(null); setFehler("");
    if (!stepDa(e)) return undefined;
    stepAdresse(e).then((u) => { if (!weg) setUrl(u); }, (f) => { if (!weg) setFehler(alt.fehlertext(f)); });
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  if (!stepDa(e)) {
    return (
      <div className="h3d-flaeche h3d-flaeche--offen" data-h3d-offen>
        {e.status === "arbeit"
          ? <div className="h3d-hinweis"><b>3D-Modell in Arbeit</b><br />Claude baut gerade das STEP aus der Zeichnung,
              Toleranzen auf Mitte Toleranz. Danach erscheint es hier.</div>
          : <div className="h3d-hinweis"><b>Wartet auf 3D</b><br />Claude holt die Zeichnung spätestens in einer Stunde ab,
              sofort, wenn du im Chat „umwandeln“ schreibst.</div>}
      </div>);
  }
  if (fehler) return <div className="h3d-flaeche"><div className="h3d-hinweis h3d-hinweis--fehler">Das 3D-Modell lässt sich nicht laden: {fehler}</div></div>;
  if (!url) return <div className="h3d-flaeche"><div className="h3d-hinweis">3D-Modell wird geholt …</div></div>;
  return (
    <Suspense fallback={<div className="h3d-flaeche"><div className="h3d-hinweis">3D-Ansicht wird geladen …</div></div>}>
      <Step3D url={url} />
    </Suspense>);
}

export default function Hofer2dTo3d({ auffrischen }) {
  const [suche, setSuche] = useState(gemerkt.suche);
  const [offen, setOffen] = useState(gemerkt.offen);
  useGemerkt(gemerkt, { suche, offen });
  const { daten, fehler, neu } = useDaten(laden, [auffrischen]);
  const schreiben = alt.darfSchreiben() && !alt.istExtern();
  const liste = daten ? daten.liste : [];
  const s = suche.trim().toLowerCase();
  const sichtbar = liste.filter((e) => !s || s.split(/\s+/).every((w) =>
    [e.hoco, e.titel, e.notiz, e.pdf_name, e.step_name].filter(Boolean).join(" ").toLowerCase().includes(w)));
  const gewaehlt = liste.find((e) => e.id === offen) || (offen === null ? sichtbar[0] : null) || null;
  const oben = useRef(null);

  useSeitenSuche({
    name: "HOFER2DTO3D", platzhalter: "HOCO Nr., Bezeichnung …",
    eintraege: () => liste.map((e) => ({ gruppe: "HOFER2DTO3D", zeichen: "◳", titel: e.titel,
      zeile: [e.hoco, e.step_name].filter(Boolean).join(" · "), id: e.id })),
    springen: (x) => { setSuche(""); setOffen(x.id); hinzeigen('[data-h3d-eintrag="' + x.id + '"]'); },
  });

  const wer = (id) => (id && daten && daten.personen && daten.personen.get(id)) || "";

  return (
    <>
      <h1 className="seitentitel">HOFER2DTO3D</h1>
      <p className="klein mat-erklaerung">Fertigungszeichnung und das daraus gebaute 3D-Modell (STEP) nebeneinander.
        Toleranzen sind im Modell auf Mitte Toleranz konstruiert.</p>
      <div className="mat-kopf" ref={oben}>
        {schreiben && <button className="knopf knopf--haupt" id="h3d-neu" disabled={!daten || daten.fehlt}
          onClick={async () => neuAnlegen(await dateienWaehlen(".pdf,.step,.stp,application/pdf", true), neu, setOffen)}
          data-ablegen>+ Zeichnung (PDF)</button>}
        {schreiben && daten && !daten.fehlt && <Pool neu={neu} />}
        <input className="mat-sucheingabe" id="h3d-filter" type="search" value={suche}
          placeholder="Suchen: HOCO Nr., Bezeichnung, Datei" onChange={(e) => setSuche(e.target.value)} />
      </div>
      {fehler && !daten
        ? <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>
        : !daten
          ? <div className="laedt">Wird geladen …</div>
          : daten.fehlt
            ? <div className="karte karte--hinweis"><p>HOFER2DTO3D ist in der Datenbank noch nicht eingerichtet (sql/hofer2dto3d.sql).</p></div>
            : !liste.length
              ? <div className="karte karte--hinweis"><p>Noch nichts abgelegt.{schreiben ? " Mit „+ Zeichnung (PDF)“ die Zeichnung hochladen, das 3D-Modell kommt dann dazu." : ""}</p></div>
              : (
                <div className="h3d-seite">
                  <div className="h3d-liste karte">
                    {!sichtbar.length && <p className="klein">Nichts gefunden.</p>}
                    {sichtbar.map((e) => (
                      <button key={e.id} data-h3d-eintrag={e.id}
                        className={"h3d-eintrag" + (gewaehlt && gewaehlt.id === e.id ? " aktiv" : "")}
                        onClick={() => setOffen(e.id)}>
                        <b>{e.hoco || "ohne HOCO Nr."}</b>
                        <span>{e.titel}</span>
                        {!stepDa(e) && <span className={"h3d-schild" + (e.status === "arbeit" ? " h3d-schild--arbeit" : "")}>
                          {e.status === "arbeit" ? "3D in Arbeit" : "Wartet auf 3D"}</span>}
                      </button>))}
                  </div>
                  {gewaehlt && (
                    <div className="h3d-haupt" key={gewaehlt.id}>
                      <div className="h3d-kopf">
                        <div>
                          <b className="h3d-titel">{gewaehlt.hoco ? gewaehlt.hoco + " · " : ""}{gewaehlt.titel}</b>
                          <div className="klein">{[gewaehlt.notiz, "abgelegt " + alt.datumZeitKurz(gewaehlt.erstellt_am) + (wer(gewaehlt.erstellt_von) ? " von " + wer(gewaehlt.erstellt_von) : "")].filter(Boolean).join(" · ")}</div>
                        </div>
                        <div className="h3d-knoepfe">
                          <button className="knopf knopf--haupt" data-h3d-laden="step" disabled={!stepDa(gewaehlt)}
                            onClick={() => herunterladen(stepAdresse(gewaehlt), gewaehlt.step_name)}>⬇ STEP herunterladen</button>
                          <button className="knopf" data-h3d-laden="pdf"
                            onClick={() => herunterladen(gewaehlt.pdf_url, gewaehlt.pdf_name)}>⬇ PDF</button>
                          {schreiben && <>
                            <button className="knopf knopf--klein" onClick={() => aendern(gewaehlt, neu)}>Ändern</button>
                            <button className="knopf knopf--klein" onClick={() => ersetzen(gewaehlt, "pdf", neu)}>PDF ersetzen</button>
                            <button className="knopf knopf--klein" onClick={() => ersetzen(gewaehlt, "step", neu)}>{stepDa(gewaehlt) ? "STEP ersetzen" : "STEP selbst hochladen"}</button>
                            <button className="knopf knopf--klein knopf--gefahr" onClick={() => loeschen(gewaehlt, neu, setOffen)}>Löschen</button>
                          </>}
                        </div>
                      </div>
                      <div className="h3d-zwei">
                        <section className="karte h3d-teil">
                          <div className="h3d-teil-titel">Zeichnung <span className="klein">{gewaehlt.pdf_name}</span></div>
                          <div className="h3d-pdf"><Zeichnung url={gewaehlt.pdf_url} /></div>
                        </section>
                        <section className="karte h3d-teil">
                          <div className="h3d-teil-titel">3D-Modell <span className="klein">{gewaehlt.step_name || ""}{gewaehlt.step_groesse ? " · " + groesse(gewaehlt.step_groesse) : ""}</span></div>
                          <Modell e={gewaehlt} />
                        </section>
                      </div>
                    </div>)}
                </div>)}
    </>
  );
}
