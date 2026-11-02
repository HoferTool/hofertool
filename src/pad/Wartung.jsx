// =================================================================
//  PAD MODE: WARTUNG
//  Statt der Kachel „Internet“ steht im Pad an jeder Maschine die
//  Kachel „Wartung“ (Wunsch Patrick 2. November 2026: „man soll im
//  Button Bilder oder PDFs reintun, dann auswählen und terminieren
//  können, dass es dann statt EB als Bildschirmschoner anzeigt; man
//  soll es quittieren können, indem man auf den Button unten Mitte
//  drückt: Erledigt“).
//
//  Je Maschine eine Liste von Bildern und PDFs (Tabelle pad_wartungen,
//  sql/pad-wartung.sql). Jedes kann einen Termin haben. Ab dem Termin
//  ist es „fällig“: der Bildschirmschoner zeigt es statt des
//  Einrichtblatts, bis jemand „Erledigt“ tippt. Erledigt nimmt den
//  Termin weg; die Datei bleibt für das nächste Mal liegen.
//
//  Hochladen, terminieren, löschen: alle mit Schreibrecht. Quittieren:
//  alle, die es sehen. Externe haben die Kachel nicht (wie vorher
//  „Internet“).
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { betrachter } from "../teile/Betrachter.jsx";

const TABELLE = "pad_wartungen";
const AENDERUNG = "hofer-wartung";

const endungVon = (name) => ((String(name || "").match(/\.([A-Za-z0-9]+)$/) || [])[1] || "").toLowerCase();
export const istPdf = (w) => w.art === "pdf" || endungVon(w.dateiname || w.url.split(/[?#]/)[0]) === "pdf";

function ablageName(name) {
  const rein = String(name || "datei").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  return Date.now().toString(36) + "-" + rein.slice(-80);
}

// Für <input type="datetime-local">: Ortszeit ohne Zeitzone
const zwei = (n) => String(n).padStart(2, "0");
function feldWert(d) {
  return d.getFullYear() + "-" + zwei(d.getMonth() + 1) + "-" + zwei(d.getDate())
    + "T" + zwei(d.getHours()) + ":" + zwei(d.getMinutes());
}
const TAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export function zeitText(iso) {
  const d = new Date(iso);
  return TAGE[d.getDay()] + " " + d.getDate() + "." + (d.getMonth() + 1) + "." + d.getFullYear()
    + " " + zwei(d.getHours()) + ":" + zwei(d.getMinutes());
}

export const istFaellig = (w) => !!w.termin && new Date(w.termin).getTime() <= Date.now();
export function faellige(liste) {
  return (liste || []).filter(istFaellig).sort((a, b) => new Date(a.termin) - new Date(b.termin));
}

export async function wartungenLaden(maschineId) {
  const r = await alt.db.from(TABELLE).select("*").eq("machine_id", maschineId).order("erstellt_am");
  if (r.error) throw r.error;
  return r.data || [];
}

const geaendert = () => window.dispatchEvent(new Event(AENDERUNG));

// Liste einer Maschine, frisch nach jeder Änderung und jede Minute
// (ein Termin kann auch von einem anderen Gerät gesetzt werden)
export function useWartungen(maschineId) {
  const [liste, setListe] = useState([]);
  const [, setTakt] = useState(0);
  useEffect(() => {
    if (!maschineId || alt.istExtern()) { setListe([]); return; }
    let weg = false;
    const laden = () => wartungenLaden(maschineId)
      .then((l) => { if (!weg) setListe(l); })
      .catch(() => { /* ohne Tabelle eben keine Wartung */ });
    laden();
    // Jede Minute neu laden; dazu neu zeichnen, damit ein Termin
    // fällig wird, auch wenn sich in der Datenbank nichts ändert
    const t = setInterval(() => { laden(); setTakt((x) => x + 1); }, 60 * 1000);
    window.addEventListener(AENDERUNG, laden);
    return () => { weg = true; clearInterval(t); window.removeEventListener(AENDERUNG, laden); };
  }, [maschineId]);
  return liste;
}

// Quittieren: Termin weg, erledigt jetzt (wer, setzt die Datenbank)
export async function wartungErledigen(w) {
  const vorher = await alt.rueckSichern(TABELLE, { id: w.id });
  const { error } = await alt.db.from(TABELLE)
    .update({ termin: null, erledigt_am: new Date().toISOString() }).eq("id", w.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return false; }
  alt.merkeSchritt("Wartung erledigt: " + w.titel, alt.rueckRein(TABELLE, vorher));
  alt.meldung("Erledigt: " + w.titel, "gut");
  geaendert();
  return true;
}

function ansehen(w) {
  if (istPdf(w)) return betrachter(w.url, w.titel, true);
  return betrachter(w.url, w.titel, false, "bild", endungVon(w.dateiname || w.url));
}

// ---------- Kachel im Dashboard ----------
export function WartungKachel({ m }) {
  const liste = useWartungen(m && m.id);
  const f = faellige(liste);
  const naechste = liste.filter((w) => w.termin && !istFaellig(w))
    .sort((a, b) => new Date(a.termin) - new Date(b.termin))[0];
  return (
    <button type="button" className={"pad-karte2 pad-karte2--wartung" + (f.length ? " pad-karte2--wartung-faellig" : "")}
      data-padfeld="wartung" onClick={() => wartungFensterOeffnen(m)}>
      <span className="pad-name">Wartung · antippen</span>
      <span className="pad-wert pad-wartung">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3.5 17.2a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.1-5.4l-2.5 2.5-2.3-.6-.6-2.3z" /></svg>
        {f.length ? "Fällig" : "Wartung"}
      </span>
      <span className="pad-wartung__unter">
        {f.length ? f[0].titel + (f.length > 1 ? " (+" + (f.length - 1) + ")" : "")
          : naechste ? "nächste " + zeitText(naechste.termin) : "keine geplant"}
      </span>
    </button>
  );
}

// ---------- Fenster mit der Liste ----------
export function wartungFensterOeffnen(m) {
  if (!m || !m.id) return;
  fensterOeffnen((zu) => <WartungFenster m={m} zu={zu} />, null, "wartung-huelle");
}

function terminVorschlag(w) {
  if (w && w.termin) return feldWert(new Date(w.termin));
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0);
  return feldWert(d);
}

function WartungFenster({ m, zu }) {
  return (
    <div className="dialog dialog--breit wartung wartung--fenster" id="wartung">
      <WartungListe m={m} zu={zu} />
    </div>
  );
}

// Erste Seite eines PDF als Bild, so gross wie die Karte (Wunsch
// Patrick: „immer alles so gross wie möglich anzeigen“)
const vorschauVorrat = new Map();
function pdfVorschau(url) {
  if (!vorschauVorrat.has(url)) {
    const p = (async () => {
      const [{ pdfjs }, daten] = await Promise.all([import("../teile/PdfAnsicht.jsx"),
        fetch(url).then((a) => { if (!a.ok) throw new Error("nicht erreichbar"); return a.arrayBuffer(); })]);
      const lib = await pdfjs();
      const aufgabe = lib.getDocument({ data: new Uint8Array(daten), isEvalSupported: false });
      try {
        const doc = await aufgabe.promise;
        const seite = await doc.getPage(1);
        const v1 = seite.getViewport({ scale: 1 });
        const v = seite.getViewport({ scale: Math.min(3, 1400 / Math.max(v1.width, v1.height)) });
        const c = document.createElement("canvas");
        c.width = Math.floor(v.width); c.height = Math.floor(v.height);
        await seite.render({ canvasContext: c.getContext("2d"), viewport: v, canvas: c, intent: "print" }).promise;
        return { bild: c.toDataURL("image/jpeg", 0.88), seiten: doc.numPages };
      } finally { aufgabe.destroy(); }
    })();
    p.catch(() => vorschauVorrat.delete(url));
    vorschauVorrat.set(url, p);
  }
  return vorschauVorrat.get(url);
}

function Vorschau({ w }) {
  const pdf = istPdf(w);
  const [v, setV] = useState(null);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    if (!pdf) return;
    let weg = false;
    pdfVorschau(w.url).then((x) => { if (!weg) setV(x); }).catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [w.url]);
  if (!pdf) return <img className="wartung__vorschau-bild" src={w.url} alt={w.titel} loading="lazy" />;
  if (fehler) return <span className="wartung__vorschau-text">PDF lässt sich nicht anzeigen</span>;
  if (!v) return <span className="wartung__vorschau-text">PDF wird geladen …</span>;
  return <>
    <img className="wartung__vorschau-bild" src={v.bild} alt={w.titel} />
    <span className="wartung__pdf-marke">PDF{v.seiten > 1 ? " · " + v.seiten + " Seiten" : ""}</span>
  </>;
}

// Die Liste, im Fenster des Pads oder unter Einstellungen → Wartung.
// Ohne zu kein Schliessen.
export function WartungListe({ m, zu }) {
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState("");
  const wahl = useRef(null);
  const darf = alt.darfSchreiben() && !alt.istExtern();

  const laden = async () => {
    try { setListe(await wartungenLaden(m.id)); setFehler(""); }
    catch (f) {
      const t = alt.fehlertext(f);
      setFehler(/pad_wartungen/.test(t) ? "Die Wartung ist in der Datenbank noch nicht eingerichtet (sql/pad-wartung.sql)." : t);
      setListe([]);
    }
  };
  useEffect(() => {
    laden();
    window.addEventListener(AENDERUNG, laden);
    return () => window.removeEventListener(AENDERUNG, laden);
  }, []);

  const hochladen = async (dateien) => {
    for (const datei of dateien) {
      const pdf = datei.type === "application/pdf" || endungVon(datei.name) === "pdf";
      if (!pdf && !/^image\//.test(datei.type || "")) {
        alt.meldung(datei.name + ": nur Bilder oder PDFs.", "warn"); continue;
      }
      const w = await alt.dialogFelder({
        titel: "Wartung ablegen",
        felder: [
          { name: "titel", label: "Was ist zu tun?", pflicht: true,
            wert: datei.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() },
          { name: "termin", label: "Termin (leer = nur ablegen)", typ: "datetime-local", wert: "",
            hinweis: "Ab dann zeigt das Pad es als Bildschirmschoner, bis jemand „Erledigt“ tippt." },
        ],
        bestaetigen: "Ablegen" });
      if (!w) continue;
      setLaedt(datei.name);
      try {
        const pfad = "maschinen/" + m.id + "/wartung-pad/" + ablageName(datei.name);
        const up = await alt.db.storage.from("zeichnungen").upload(pfad, datei,
          { contentType: datei.type || (pdf ? "application/pdf" : "application/octet-stream"), upsert: false });
        if (up.error) throw up.error;
        const url = alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
        const ein = await alt.db.from(TABELLE).insert({
          machine_id: m.id, titel: w.titel.trim(), url, pfad, dateiname: datei.name,
          art: pdf ? "pdf" : "bild", termin: w.termin ? new Date(w.termin).toISOString() : null }).select("id");
        if (ein.error) throw ein.error;
        const neuId = ((ein.data || [])[0] || {}).id;
        if (neuId) alt.merkeSchritt("Wartung " + w.titel.trim(), alt.rueckWeg(TABELLE, { id: neuId }));
        alt.meldung("Abgelegt: " + w.titel.trim(), "gut");
      } catch (f) {
        const t = alt.fehlertext(f);
        alt.meldung(/exceeded|too large|413|maximum/i.test(t) ? datei.name + " ist zu gross für die Ablage." : t, "fehler");
      }
      setLaedt("");
    }
    geaendert();
  };

  const aendern = async (w, daten, text) => {
    const vorher = await alt.rueckSichern(TABELLE, { id: w.id });
    const { error } = await alt.db.from(TABELLE).update(daten).eq("id", w.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt(text, alt.rueckRein(TABELLE, vorher));
    geaendert();
  };

  const terminieren = async (w) => {
    const e = await alt.dialogFelder({
      titel: "Termin für „" + w.titel + "“",
      felder: [
        { name: "titel", label: "Was ist zu tun?", wert: w.titel, pflicht: true },
        { name: "termin", label: "Ab wann anzeigen?", typ: "datetime-local", wert: terminVorschlag(w), pflicht: true,
          hinweis: "Ab dann zeigt das Pad es als Bildschirmschoner statt des Einrichtblatts." },
      ],
      bestaetigen: "Terminieren" });
    if (!e || !e.termin) return;
    await aendern(w, { titel: e.titel.trim(), termin: new Date(e.termin).toISOString() }, "Termin " + w.titel);
  };

  const loeschen = async (w) => {
    const ja = await alt.nachfragen({ titel: "Wartung löschen",
      text: "Soll „" + w.titel + "“ gelöscht werden?", bestaetigen: "Löschen", gefahr: true });
    if (!ja) return;
    // Die Datei bleibt liegen, damit Rückgängig sie zurückholt
    const vorher = await alt.rueckSichern(TABELLE, { id: w.id });
    const { error } = await alt.db.from(TABELLE).delete().eq("id", w.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Löschen von " + w.titel, alt.rueckRein(TABELLE, vorher));
    geaendert();
  };

  // Fällige zuerst, dann geplante nach Termin, dann die übrigen
  const sortiert = [...(liste || [])].sort((a, b) => {
    const ta = a.termin ? new Date(a.termin).getTime() : Infinity;
    const tb = b.termin ? new Date(b.termin).getTime() : Infinity;
    return ta - tb;
  });

  return (
    <>
      <div className="blatt__kopf">
        <h2>Wartung · {m.name}{m.machine_number && m.machine_number !== m.name ? " " + m.machine_number : ""}</h2>
        {darf && <button className="knopf knopf--haupt" id="wartung-neu" disabled={!!laedt}
          onClick={() => wahl.current && wahl.current.click()}>+ Bild oder PDF</button>}
        {zu && <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>}
      </div>
      {darf && <input ref={wahl} type="file" multiple hidden id="wartung-datei" accept="image/*,application/pdf,.pdf"
        onChange={(e) => { const d = [...e.target.files]; e.target.value = ""; if (d.length) hochladen(d); }} />}
      <p className="klein wartung__erklaerung">Bild oder PDF ablegen, dann „Terminieren“: ab dem Termin zeigt das Pad
        es als Bildschirmschoner statt des Einrichtblatts, bis jemand unten in der Mitte „Erledigt“ tippt.</p>
      {laedt && <p className="unterlagen__laedt">Lädt hoch: {laedt} …</p>}
      {fehler && <p className="fehlertext">{fehler}</p>}
      {liste === null
        ? <p className="klein">Lädt …</p>
        : !sortiert.length
        ? <p className="unterlagen__leer">Noch nichts abgelegt.{darf ? " Mit „+ Bild oder PDF“ beginnen." : ""}</p>
        : <ul className="wartung__liste">
            {sortiert.map((w) => {
              const f = istFaellig(w);
              return (
                <li key={w.id} className={"wartung__zeile" + (f ? " wartung__zeile--faellig" : "")} data-wartung={w.id}>
                  <button className="wartung__vorschau" title="Gross ansehen" onClick={() => ansehen(w)}>
                    <Vorschau w={w} />
                  </button>
                  <div className="wartung__text">
                      <b>{w.titel}</b>
                      <span className="klein">
                        {f ? "Fällig seit " + zeitText(w.termin)
                          : w.termin ? "Geplant: " + zeitText(w.termin) : "Kein Termin"}
                        {w.erledigt_am ? " · zuletzt erledigt " + zeitText(w.erledigt_am) : ""}</span>
                  </div>
                  <div className="wartung__knoepfe">
                    {f && <button className="knopf knopf--klein knopf--haupt" data-wartung-erledigt={w.id}
                      onClick={() => wartungErledigen(w)}>Erledigt</button>}
                    {darf && <button className={"knopf knopf--klein" + (f ? "" : " knopf--haupt")} data-wartung-termin={w.id}
                      onClick={() => terminieren(w)}>{w.termin ? "Termin ändern" : "Terminieren"}</button>}
                    {darf && w.termin && !f && <button className="knopf knopf--klein" data-wartung-ohne={w.id}
                      onClick={() => aendern(w, { termin: null }, "Termin weg: " + w.titel)}>Kein Termin</button>}
                    {darf && <button className="knopf knopf--klein knopf--gefahr-leise" data-wartung-weg={w.id}
                      onClick={() => loeschen(w)}>Löschen</button>}
                  </div>
                </li>);
            })}
          </ul>}
    </>
  );
}
