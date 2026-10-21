// =================================================================
//  UNTERLAGEN ZU DEN MASCHINEN (seit 1.105.0, Wunsch Patrick
//  19. Oktober 2026: „ein Bereich innerhalb der Maschinen, um die
//  Maschinenhandbücher, Elektroschemas etc. anzuzeigen“)
//
//  Ein Fenster je Maschine, geöffnet im Pad Mode an der Maschine
//  (Knopf „Unterlagen“ oben) und unter Produktion → Maschinen. Eine
//  Unterlage gehört entweder zu dieser einen Maschine oder zu ihrem
//  Typ; dann steht sie bei allen Maschinen dieses Typs, damit ein
//  Handbuch nur einmal hochgeladen werden muss.
//
//  Tabelle maschinen_unterlagen (sql/maschinen-unterlagen.sql), Dateien
//  in der Ablage „zeichnungen“ unter maschinen/. Lesen alle ausser
//  Externen, hochladen, umbenennen und löschen nur Admins (auch in
//  der Datenbank so geregelt).
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { betrachter } from "./Betrachter.jsx";
import { istExcel } from "./excelLesen.js";
import { wiederOeffner } from "./wiederherstellen.js";

export const UNTERLAGEN_ARTEN = [
  ["handbuch", "Handbuch / Bedienungsanleitung"],
  ["elektro", "Elektroschema"],
  ["hydraulik", "Hydraulik / Pneumatik"],
  ["ersatzteile", "Ersatzteile"],
  ["wartung", "Wartung"],
  ["sonstiges", "Sonstiges"],
];
const ART_NAME = Object.fromEntries(UNTERLAGEN_ARTEN);

// Zwei einfache Abfragen statt or(): Maschine selbst und ihr Typ
export async function unterlagenLaden(m) {
  const holen = (spalte, wert) => wert
    ? alt.zeitlimit(alt.db.from("maschinen_unterlagen").select("*").eq(spalte, wert), 10000, "Unterlagen")
    : Promise.resolve({ data: [] });
  const [a, b] = await Promise.all([holen("machine_id", m.id), holen("type_id", m.type_id)]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  const alle = [...(a.data || []), ...(b.data || [])];
  const gesehen = new Set();
  return alle.filter((u) => !gesehen.has(u.id) && gesehen.add(u.id))
    .sort((x, y) => String(x.titel).localeCompare(String(y.titel), "de", { numeric: true }));
}

function groesseText(b) {
  if (!b) return "";
  if (b >= 1048576) return (b / 1048576).toFixed(1).replace(".", ",") + " MB";
  return Math.max(1, Math.round(b / 1024)) + " KB";
}

const endungVon = (name) => ((String(name || "").match(/\.([A-Za-z0-9]+)$/) || [])[1] || "").toLowerCase();
const BILD = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];

// PDF, Excel und Bilder zeigt der Betrachter der App; alles andere
// (Word, DWG, ZIP …) kann der Browser nicht anzeigen, also herunterladen
function zeigen(u) {
  // Verlinkt statt hochgeladen (seit 1.134.0): einfach die Seite öffnen
  if (istLink(u)) {
    const w = window.open(u.url, "_blank", "noopener");
    if (!w) alt.meldung("Das Fenster wurde blockiert. Bitte Pop-ups erlauben.", "warn");
    return;
  }
  const endung = endungVon(u.dateiname || u.url.split(/[?#]/)[0]);
  if (endung === "pdf") return betrachter(u.url, u.titel, true);
  if (istExcel(u.dateiname || u.url)) return betrachter(u.url, u.titel, false, "excel", endung);
  if (BILD.includes(endung)) return betrachter(u.url, u.titel, false, "bild", endung);
  const w = window.open(u.url, "_blank");
  if (!w) alt.meldung("Das Fenster wurde blockiert. Bitte Pop-ups erlauben.", "warn");
}

// Ein Link hat keine Datei in der Ablage
const istLink = (u) => !u.pfad && !u.dateiname;

// Dateinamen für die Ablage: ohne Umlaute und Sonderzeichen
function ablageName(name) {
  const rein = String(name || "datei").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  return Date.now().toString(36) + "-" + rein.slice(-80);
}

async function typName(m) {
  const t = (alt.prod && alt.prod.typen || []).find((x) => x.id === m.type_id);
  if (t) return t.name;
  if (!m.type_id) return "";
  try {
    const r = await alt.db.from("machine_types").select("id,name").eq("id", m.type_id);
    return ((r.data || [])[0] || {}).name || "";
  } catch (f) { return ""; }
}

export async function unterlagenOeffnen(m) {
  if (!m || !m.id) return;
  const typ = await typName(m);
  fensterOeffnen((zu) => <UnterlagenFenster m={m} typ={typ} zu={zu} />, null, "unterlagen-huelle",
    { art: "unterlagen", daten: { m: { id: m.id, name: m.name, machine_number: m.machine_number, type_id: m.type_id } } });
}

// Nach dem Neuladen wieder offen (wie die anderen Fenster ohne Eingaben)
wiederOeffner("unterlagen", (d) => unterlagenOeffnen(d.m));

function UnterlagenFenster({ m, typ, zu }) {
  return (
    <div className="dialog dialog--breit unterlagen" id="unterlagen">
      <UnterlagenListe m={m} typ={typ} zu={zu} />
    </div>
  );
}

// Die Liste selbst, im Fenster oder eingebettet auf der Seite einer
// Maschine (Seite Maschinen, seit 1.134.0). Ohne zu kein Schliessen.
export function UnterlagenListe({ m, typ, zu }) {
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState("");
  const wahl = useRef(null);
  const admin = alt.istAdmin();

  const laden = async () => {
    try { setListe(await unterlagenLaden(m)); setFehler(""); }
    catch (f) {
      const t = alt.fehlertext(f);
      setFehler(/maschinen_unterlagen/.test(t)
        ? "Die Unterlagen sind in der Datenbank noch nicht eingerichtet (sql/maschinen-unterlagen.sql)." : t);
      setListe([]);
    }
  };
  useEffect(() => { laden(); }, []);

  const giltFuerAuswahl = () => [
    ["maschine", "Nur diese Maschine (" + (m.machine_number || m.name) + ")"],
    ["typ", "Alle Maschinen vom Typ " + (typ || "dieser Maschine")]];

  const hochladen = async (dateien) => {
    for (const datei of dateien) {
      const vorschlag = datei.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
      const w = await alt.dialogFelder({
        titel: "Unterlage hochladen",
        felder: [
          { name: "titel", label: "Titel", wert: vorschlag, pflicht: true,
            hinweis: datei.name + " · " + groesseText(datei.size) },
          { name: "art", label: "Art", auswahl: UNTERLAGEN_ARTEN, wert: artErraten(datei.name) },
          ...(m.type_id
            ? [{ name: "fuer", label: "Gilt für", wert: "maschine", auswahl: giltFuerAuswahl() }]
            : []),
        ],
        bestaetigen: "Hochladen" });
      if (!w) continue;
      const fuerTyp = w.fuer === "typ" && m.type_id;
      const pfad = "maschinen/" + (fuerTyp ? "typ-" + m.type_id : m.id) + "/" + ablageName(datei.name);
      setLaedt(datei.name);
      try {
        const up = await alt.db.storage.from("zeichnungen").upload(pfad, datei,
          { contentType: datei.type || "application/octet-stream", upsert: false });
        if (up.error) throw up.error;
        const url = alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
        const ein = await alt.db.from("maschinen_unterlagen").insert({
          machine_id: fuerTyp ? null : m.id, type_id: fuerTyp ? m.type_id : null,
          art: w.art || "sonstiges", titel: w.titel.trim(), url, pfad,
          dateiname: datei.name, groesse: datei.size || null }).select("id");
        if (ein.error) throw ein.error;
        const neuId = ((ein.data || [])[0] || {}).id;
        if (neuId) alt.merkeSchritt("Hochladen von " + w.titel.trim(),
          alt.rueckWeg("maschinen_unterlagen", { id: neuId }));
        alt.meldung("Hochgeladen: " + w.titel.trim(), "gut");
      } catch (f) {
        const t = alt.fehlertext(f);
        alt.meldung(/exceeded|too large|413|maximum/i.test(t)
          ? datei.name + " ist zu gross für die Ablage (" + groesseText(datei.size) + ")." : t, "fehler");
      }
      setLaedt("");
    }
    laden();
  };

  // Statt einer Datei eine Adresse, etwa das Handbuch beim Hersteller
  // (Wunsch Patrick 21. Oktober 2026: „verlinken oder hochladen“)
  const linkNeu = async () => {
    const w = await alt.dialogFelder({ titel: "Link hinzufügen",
      felder: [
        { name: "url", label: "Adresse", pflicht: true, platzhalter: "https://…" },
        { name: "titel", label: "Titel", pflicht: true, platzhalter: "z. B. Bedienungsanleitung Star SR-20" },
        { name: "art", label: "Art", auswahl: UNTERLAGEN_ARTEN, wert: "handbuch" },
        ...(m.type_id ? [{ name: "fuer", label: "Gilt für", wert: "maschine", auswahl: giltFuerAuswahl() }] : []),
      ],
      bestaetigen: "Hinzufügen" });
    if (!w) return;
    let url = w.url.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const fuerTyp = w.fuer === "typ" && m.type_id;
    const ein = await alt.db.from("maschinen_unterlagen").insert({
      machine_id: fuerTyp ? null : m.id, type_id: fuerTyp ? m.type_id : null,
      art: w.art || "handbuch", titel: w.titel.trim(), url, pfad: null, dateiname: null }).select("id");
    if (ein.error) { alt.meldung(alt.fehlertext(ein.error), "fehler"); return; }
    const neuId = ((ein.data || [])[0] || {}).id;
    if (neuId) alt.merkeSchritt("Link " + w.titel.trim(), alt.rueckWeg("maschinen_unterlagen", { id: neuId }));
    laden();
  };

  // Auch „Gilt für“ lässt sich ändern (Wunsch Patrick 19. Oktober 2026),
  // mit denselben Möglichkeiten wie beim Hochladen. Die Datei bleibt, wo
  // sie liegt; es ändert sich nur, bei welchen Maschinen sie erscheint.
  const umbenennen = async (u) => {
    const fuerVorher = u.type_id ? "typ" : "maschine";
    const w = await alt.dialogFelder({ titel: "Unterlage ändern",
      felder: [{ name: "titel", label: "Titel", wert: u.titel, pflicht: true },
               { name: "art", label: "Art", auswahl: UNTERLAGEN_ARTEN, wert: u.art },
               ...(m.type_id
                 ? [{ name: "fuer", label: "Gilt für", wert: fuerVorher,
                      auswahl: giltFuerAuswahl() }]
                 : [])] });
    const fuer = (w && w.fuer) || fuerVorher;
    if (!w || (w.titel === u.titel && w.art === u.art && fuer === fuerVorher)) return;
    const daten = { titel: w.titel.trim(), art: w.art };
    if (fuer !== fuerVorher) {
      daten.machine_id = fuer === "typ" ? null : m.id;
      daten.type_id = fuer === "typ" ? m.type_id : null;
    }
    const vorher = await alt.rueckSichern("maschinen_unterlagen", { id: u.id });
    const { error } = await alt.db.from("maschinen_unterlagen")
      .update(daten).eq("id", u.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Ändern von " + u.titel, alt.rueckRein("maschinen_unterlagen", vorher));
    laden();
  };

  // Eine Rückfrage, dann weg (Wunsch 6. Oktober 2026). Die Datei bleibt
  // in der Ablage liegen, damit Rückgängig die Unterlage zurückholen kann.
  const loeschen = async (u) => {
    const ja = await alt.nachfragen({ titel: "Unterlage löschen",
      text: "Soll „" + u.titel + "“ gelöscht werden?"
        + (u.type_id ? " Sie verschwindet bei allen Maschinen vom Typ " + (typ || "") + "." : ""),
      bestaetigen: "Löschen", gefahr: true });
    if (!ja) return;
    const vorher = await alt.rueckSichern("maschinen_unterlagen", { id: u.id });
    const { error } = await alt.db.from("maschinen_unterlagen").delete().eq("id", u.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Löschen von " + u.titel, alt.rueckRein("maschinen_unterlagen", vorher));
    laden();
  };

  const gruppen = UNTERLAGEN_ARTEN.map(([art, name]) =>
    [art, name, (liste || []).filter((u) => (ART_NAME[u.art] ? u.art : "sonstiges") === art)])
    .filter((g) => g[2].length);

  return (
    <>
      <div className="blatt__kopf">
        {zu ? <h2>Unterlagen · {m.name}{m.machine_number ? " " + m.machine_number : ""}</h2>
          : <h2>Bedienungsanleitungen und Unterlagen</h2>}
        {typ && zu && <span className="klein">Typ {typ}</span>}
        {admin && <button className="knopf knopf--haupt" id="unterlagen-neu" disabled={!!laedt}
          onClick={() => wahl.current && wahl.current.click()}>+ Datei</button>}
        {admin && <button className="knopf" id="unterlagen-link" onClick={linkNeu}>+ Link</button>}
        {zu && <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>}
      </div>
      {admin && <input ref={wahl} type="file" multiple hidden id="unterlagen-datei"
        onChange={(e) => { const d = [...e.target.files]; e.target.value = ""; if (d.length) hochladen(d); }} />}
      {laedt && <p className="unterlagen__laedt">Lädt hoch: {laedt} …</p>}
      {fehler && <p className="fehlertext">{fehler}</p>}
      <div className="unterlagen__rolle">
        {liste === null
          ? <p className="klein">Lädt …</p>
          : !gruppen.length
          ? <p className="unterlagen__leer">Noch keine Unterlagen für diese Maschine.
              {admin ? " Mit „+ Datei“ ein Handbuch oder Schema hochladen oder mit „+ Link“ verlinken." : ""}</p>
          : gruppen.map(([art, name, teile]) => (
              <section key={art} className="unterlagen__gruppe" data-art={art}>
                <h3>{name}</h3>
                <ul>
                  {teile.map((u) => (
                    <li key={u.id} className="unterlagen__zeile" data-unterlage={u.id}>
                      <button className="unterlagen__oeffnen" onClick={() => zeigen(u)}>
                        <span className="unterlagen__symbol">{istLink(u) ? "LINK"
                          : endungVon(u.dateiname || u.url).toUpperCase().slice(0, 4) || "DATEI"}</span>
                        <span className="unterlagen__text">
                          <b>{u.titel}</b>
                          <span className="klein">
                            {u.type_id ? "alle " + (typ || "dieses Typs") : "nur diese Maschine"}
                            {u.groesse ? " · " + groesseText(u.groesse) : ""}</span>
                        </span>
                      </button>
                      {admin && <div className="unterlagen__knoepfe">
                        <button className="knopf knopf--klein" data-unterlage-aendern={u.id}
                          onClick={() => umbenennen(u)}>Ändern</button>
                        <button className="knopf knopf--klein knopf--gefahr-leise" data-unterlage-weg={u.id}
                          onClick={() => loeschen(u)}>Löschen</button>
                      </div>}
                    </li>))}
                </ul>
              </section>))}
      </div>
    </>
  );
}

// Aus dem Dateinamen die Art erraten, damit meist nur „Hochladen“ bleibt
function artErraten(name) {
  const n = String(name).toLowerCase();
  if (/elektr|schalt|schema|stromlauf|wiring|electric/.test(n)) return "elektro";
  if (/hydraul|pneumat/.test(n)) return "hydraulik";
  if (/ersatz|spare|teileliste|parts/.test(n)) return "ersatzteile";
  if (/wartung|service|maint|schmier/.test(n)) return "wartung";
  if (/handbuch|anleitung|bedien|manual|instruction|betrieb/.test(n)) return "handbuch";
  return "sonstiges";
}
