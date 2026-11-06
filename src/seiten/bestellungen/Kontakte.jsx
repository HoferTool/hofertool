// =================================================================
//  BESTELLUNGEN · Kontaktpersonen und Besuche beim Lieferanten
//  Wunsch Patrick 3. November 2026: „bei den Lieferanten die
//  Kontaktpersonen hinterlegen, am besten mit Erkennung der
//  Visitenkarte. Dazu Notizen, wenn ein Vertreter da war, am besten mit
//  Datum des Besuchs.“
//
//  Fenster je Lieferant (Knopf „Kontakte“ im Reiter Lieferanten):
//  oben die Kontaktpersonen, darunter die Besuche, neuester zuerst.
//  „Visitenkarte fotografieren“ liest die Karte im Gerät (Tesseract,
//  kostenlos, src/daten/visitenkarte.js) und füllt die Felder; das Foto
//  der Karte wird beim Kontakt abgelegt (Ablage „zeichnungen“ unter
//  lieferanten/<id>/karten/). Tabellen lieferant_kontakte und
//  lieferant_besuche aus sql/lieferant-kontakte.sql (eingespielt).
//  Lesen alle ausser Externen, ändern mit Schreibrecht, mit Rückgängig.
//  Profilbild je Kontakt (seit 1.377.0, Wunsch Patrick 3. November 2026:
//  „ein Foto soll auch hinzugefügt werden können“): rund in der Liste,
//  quadratisch zugeschnitten, 512 Pixel, Ablage „zeichnungen“ unter
//  lieferanten/<id>/profil/, Spalten foto_url und foto_pfad aus
//  sql/lieferant-kontakt-foto.sql (eingespielt).
//  PDFs und Bilder je Besuch (seit 1.433.0, Wunsch Patrick 6. November
//  2026: „bei den Vertreterbesuchen auch PDF/Bilder ablegen für
//  Angebote“): Knopf „PDF / Bild“ am Besuch, mehrere auf einmal, antippen
//  öffnet im Betrachter, ✕ löscht nach einer Rückfrage, mit Rückgängig.
//  Liste in lieferant_besuche.dateien [{name, url, pfad, typ}] aus
//  sql/lieferant-besuch-dateien.sql (eingespielt), Dateien in der Ablage
//  „zeichnungen“ unter lieferanten/<id>/besuche/<besuch>/; Löschen lässt
//  die Datei liegen, damit Rückgängig geht.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { wiederOeffner } from "../../teile/wiederherstellen.js";
import { Zeichen, Symbolknopf } from "./teile.jsx";

const FEHLT_TEXT = "Kontakte und Besuche brauchen noch die Datei lieferant-kontakte.sql in Supabase.";
const fehltTabelle = (f) => /lieferant_(kontakte|besuche)|dateien/.test(String((f && (f.message || f.details)) || f || ""))
  && /(does not exist|schema cache|not find)/i.test(String((f && f.message) || f || ""));
const fehlerText = (f) => (fehltTabelle(f) ? FEHLT_TEXT : alt.fehlertext(f));

// Für die Zeile im Reiter Lieferanten: je Lieferant Anzahl Kontakte und
// letzter Besuch. Fehlt die Tabelle, steht eben nichts da.
export async function kontakteUebersicht() {
  const [k, b] = await Promise.all([
    alt.db.from("lieferant_kontakte").select("supplier_id"),
    alt.db.from("lieferant_besuche").select("supplier_id, datum").order("datum", { ascending: false }),
  ]);
  const je = {};
  const eintrag = (id) => (je[id] = je[id] || { kontakte: 0, besuche: 0, letzter: null });
  for (const z of (k.data || [])) eintrag(z.supplier_id).kontakte++;
  for (const z of (b.data || [])) {
    const e = eintrag(z.supplier_id);
    e.besuche++;
    if (!e.letzter) e.letzter = z.datum;
  }
  return je;
}

async function ladeAlles(id) {
  const [k, b] = await Promise.all([
    alt.zeitlimit(alt.db.from("lieferant_kontakte").select("*").eq("supplier_id", id).order("name"), 10000, "Kontakte"),
    alt.zeitlimit(alt.db.from("lieferant_besuche").select("*").eq("supplier_id", id)
      .order("datum", { ascending: false }).order("erstellt_am", { ascending: false }), 10000, "Besuche"),
  ]);
  if (k.error) throw k.error;
  if (b.error) throw b.error;
  await alt.personenLaden();
  return { kontakte: k.data || [], besuche: b.data || [] };
}

// fertig: der Reiter Lieferanten zählt danach neu
export function kontakteOeffnen(l, fertig) {
  fensterOeffnen((zu) => <KontakteFenster l={l} zu={zu} />, () => { if (fertig) fertig(); },
    "kontakte-huelle", { art: "lieferant-kontakte", daten: { id: l.id, name: l.name } });
}
wiederOeffner("lieferant-kontakte", (d) => d && d.id && kontakteOeffnen(d));

function KontakteFenster({ l, zu }) {
  const { daten, fehler, neu } = useDaten(() => ladeAlles(l.id), [l.id]);
  const darf = alt.darfSchreiben() && !alt.istExtern();
  const foto = useRef(null);
  const kontakte = (daten && daten.kontakte) || [];

  return (
    <div className="dialog dialog--breit kontaktfenster" role="dialog" aria-modal="true" id="lk-fenster">
      <div className="blatt__kopf">
        <h2>{l.name}</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      {fehler && !daten
        ? <p className="hinweis">{fehlerText(fehler)}</p>
        : !daten ? <div className="laedt">Wird geladen …</div>
        : <>
            <section className="lk-bereich" id="lk-kontakte">
              <div className="karte__kopf"><h3>Kontaktpersonen</h3><span className="klein">{kontakte.length}</span></div>
              {darf && <div className="lk-knoepfe">
                <button className="knopf knopf--haupt" id="lk-karte" data-fokus=""
                  onClick={() => foto.current && foto.current.click()}>
                  <Zeichen name="kamera" /> Visitenkarte fotografieren</button>
                <button className="knopf" id="lk-neu" onClick={() => kontaktOeffnen(l, null, null, neu)}>
                  <Zeichen name="plus" /> Kontakt von Hand</button>
                <input ref={foto} type="file" accept="image/*" capture="environment" hidden id="lk-foto"
                  data-ablegen="direkt"
                  onChange={(e) => { const d = e.target.files && e.target.files[0]; e.target.value = "";
                    if (d) kontaktOeffnen(l, null, d, neu); }} />
              </div>}
              {!kontakte.length
                ? <p className="hinweis">Noch keine Kontaktperson hinterlegt.{darf ? " Am schnellsten mit „Visitenkarte fotografieren“." : ""}</p>
                : <div className="lk-liste">{kontakte.map((k) =>
                    <Kontakt key={k.id} k={k} l={l} darf={darf} neu={neu} />)}</div>}
            </section>

            <section className="lk-bereich" id="lk-besuche">
              <div className="karte__kopf"><h3>Besuche</h3><span className="klein">{daten.besuche.length}</span></div>
              {darf && <div className="lk-knoepfe">
                <button className="knopf knopf--haupt" id="lk-besuch-neu"
                  onClick={() => besuchDialog(l, null, kontakte, neu)}>
                  <Zeichen name="plus" /> Besuch eintragen</button>
              </div>}
              {!daten.besuche.length
                ? <p className="hinweis">Noch kein Besuch eingetragen.</p>
                : <div className="lk-liste">{daten.besuche.map((b) =>
                    <Besuch key={b.id} b={b} l={l} kontakte={kontakte} darf={darf} neu={neu} />)}</div>}
            </section>
          </>}
    </div>
  );
}

function Kontakt({ k, l, darf, neu }) {
  const loeschen = async () => {
    const ok = await alt.nachfragen({ titel: "Kontakt löschen",
      text: "„" + k.name + "“ wird bei " + l.name + " gelöscht. Besuche bleiben, ohne diesen Namen.",
      bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const vorher = await alt.rueckSichern("lieferant_kontakte", { id: k.id });
    const besuche = (await alt.rueckSichern("lieferant_besuche", { kontakt_id: k.id })).map((x) => x.id);
    const { error } = await alt.db.from("lieferant_kontakte").delete().eq("id", k.id);
    if (error) { alt.meldung(fehlerText(error), "fehler"); return; }
    // Zurück: Kontakt wieder rein, dann die Besuche wieder auf ihn
    alt.merkeSchritt("Löschen von " + k.name, [alt.rueckRein("lieferant_kontakte", vorher)]
      .concat(besuche.length ? [alt.rueckSetz("lieferant_besuche", { kontakt_id: k.id }, { id: besuche })] : []));
    alt.meldung("Gelöscht."); neu();
  };
  const tel = (n) => "tel:" + String(n).replace(/[^\d+]/g, "");
  return (
    <div className="lk-kontakt" data-lk={k.id}>
      {k.foto_url
        ? <button className="lk-profil" title="Profilbild ansehen"
            onClick={() => alt.betrachter(k.foto_url, k.name, false)}>
            <img src={k.foto_url} alt={k.name} loading="lazy" /></button>
        : <span className="lk-profil lk-profil--leer">{anfangsbuchstaben(k.name)}</span>}
      <div className="lk-kontakt__text">
        <div className="lk-kontakt__name">{k.name}</div>
        {k.funktion && <div className="klein">{k.funktion}</div>}
        <div className="lk-kontakt__info">
          {k.telefon && <a href={tel(k.telefon)}><Zeichen name="telefon" groesse={13} />{k.telefon}</a>}
          {k.mobil && <a href={tel(k.mobil)}><Zeichen name="telefon" groesse={13} />Mobil {k.mobil}</a>}
          {k.email && <a href={"mailto:" + k.email}><Zeichen name="mail" groesse={13} />{k.email}</a>}
        </div>
        {k.notiz && <div className="lk-notiz">{k.notiz}</div>}
      </div>
      {k.karte_url && <button className="lk-karte" title="Visitenkarte ansehen"
        onClick={() => alt.betrachter(k.karte_url, "Visitenkarte " + k.name, false)}>
        <img src={k.karte_url} alt="Visitenkarte" loading="lazy" /></button>}
      {darf && <div className="bs-pos__aktionen">
        <Symbolknopf zeichen="stift" text="Ändern" data-lkbearb={k.id} onClick={() => kontaktOeffnen(l, k, null, neu)} />
        <Symbolknopf zeichen="muell" text="Löschen" gefahr data-lkweg={k.id} onClick={loeschen} />
      </div>}
    </div>
  );
}

function anfangsbuchstaben(n) {
  return String(n || "").replace(/[^A-Za-zÄÖÜäöüÉéÈè\s-]/g, "").split(/[\s-]+/).filter(Boolean)
    .slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
}

// Profilbild: Mitte quadratisch ausschneiden, 512 Pixel, JPEG
async function profilZuschneiden(datei) {
  const bild = await createImageBitmap(datei);
  const s = Math.min(bild.width, bild.height);
  const z = Math.min(512, s);
  const c = document.createElement("canvas");
  c.width = c.height = z;
  c.getContext("2d").drawImage(bild, (bild.width - s) / 2, (bild.height - s) / 2, s, s, 0, 0, z, z);
  if (bild.close) bild.close();
  return await new Promise((ok, nein) => c.toBlob((b) => (b ? ok(b) : nein(new Error("Bild liess sich nicht umwandeln"))), "image/jpeg", 0.88));
}

function Besuch({ b, l, kontakte, darf, neu }) {
  const k = kontakte.find((x) => x.id === b.kontakt_id);
  const wer = alt.personVoll(b.erstellt_von);
  const loeschen = async () => {
    const ok = await alt.nachfragen({ titel: "Besuch löschen",
      text: "Der Besuch vom " + alt.langDatum(b.datum) + " wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const vorher = await alt.rueckSichern("lieferant_besuche", { id: b.id });
    const { error } = await alt.db.from("lieferant_besuche").delete().eq("id", b.id);
    if (error) { alt.meldung(fehlerText(error), "fehler"); return; }
    alt.merkeSchritt("Löschen des Besuchs vom " + alt.kurzDatum(b.datum), alt.rueckRein("lieferant_besuche", vorher));
    alt.meldung("Gelöscht."); neu();
  };
  return (
    <div className="lk-besuch" data-lb={b.id}>
      <div className="lk-besuch__kopf">
        <Zeichen name="kalender" groesse={15} />
        <b>{alt.langDatum(b.datum)}</b>
        {k && <span className="klein">· {k.name}</span>}
        <span className="lk-besuch__wer klein">{wer ? "eingetragen von " + wer : ""}</span>
        {darf && <span className="bs-pos__aktionen">
          <Symbolknopf zeichen="stift" text="Ändern" data-lbbearb={b.id} onClick={() => besuchDialog(l, b, kontakte, neu)} />
          <Symbolknopf zeichen="muell" text="Löschen" gefahr data-lbweg={b.id} onClick={loeschen} />
        </span>}
      </div>
      <div className="lk-notiz">{b.notiz}</div>
      <BesuchDateien b={b} l={l} darf={darf} neu={neu} />
    </div>
  );
}

const istPdf = (d) => /pdf/i.test(d.typ || "") || /\.pdf$/i.test(d.name || d.pfad || "");

function BesuchDateien({ b, l, darf, neu }) {
  const dateien = Array.isArray(b.dateien) ? b.dateien : [];
  const feld = useRef(null);
  const [laedt, setLaedt] = useState(0);
  const hochladen = async (liste) => {
    const gute = liste.filter((d) => /^image\//.test(d.type) || /pdf/i.test(d.type) || /\.pdf$/i.test(d.name));
    if (gute.length < liste.length) alt.meldung("Nur PDFs und Bilder gehen.", "warn");
    if (!gute.length) return;
    setLaedt(gute.length);
    const neueDateien = [];
    try {
      for (const d of gute) {
        const pdf = /pdf/i.test(d.type) || /\.pdf$/i.test(d.name);
        const endung = pdf ? "pdf" : ((d.name.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || "jpg").toLowerCase();
        const pfad = "lieferanten/" + l.id + "/besuche/" + b.id + "/" + crypto.randomUUID() + "." + endung;
        const up = await alt.db.storage.from("zeichnungen").upload(pfad, d,
          { contentType: d.type || (pdf ? "application/pdf" : "image/jpeg"), upsert: false });
        if (up.error) throw up.error;
        neueDateien.push({ name: d.name || ("Datei." + endung), url: alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl,
          pfad, typ: pdf ? "pdf" : "bild" });
        setLaedt((n) => n - 1);
      }
    } catch (f) {
      alt.meldung("Hochladen ging nicht: " + fehlerText(f), "fehler");
    }
    if (neueDateien.length) await dateienSetzen(b, dateien.concat(neueDateien),
      neueDateien.length === 1 ? "Datei „" + neueDateien[0].name + "“" : neueDateien.length + " Dateien zum Besuch");
    setLaedt(0); neu();
  };
  const weg = async (d) => {
    const ok = await alt.nachfragen({ titel: "Datei löschen", text: "„" + d.name + "“ wird beim Besuch gelöscht.",
      bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    if (await dateienSetzen(b, dateien.filter((x) => x.pfad !== d.pfad), "Löschen von „" + d.name + "“")) {
      alt.meldung("Gelöscht."); neu();
    }
  };
  if (!dateien.length && !darf) return null;
  return (
    <div className="lk-dateien" data-lbdateien={b.id}>
      {dateien.map((d) => (
        <div key={d.pfad || d.url} className="lk-datei" data-lbdatei={d.name}>
          <button className="lk-datei__knopf" title={d.name}
            onClick={() => alt.betrachter(d.url, d.name, istPdf(d))}>
            {istPdf(d)
              ? <span className="lk-datei__pdf"><Zeichen name="pdf" groesse={26} /><small>PDF</small></span>
              : <img src={d.url} alt={d.name} loading="lazy" />}
            <span className="lk-datei__name">{d.name}</span>
          </button>
          {darf && <button className="lk-datei__weg" title="Löschen" aria-label={"„" + d.name + "“ löschen"}
            data-lbdateiweg={d.name} onClick={() => weg(d)}>✕</button>}
        </div>))}
      {darf && <>
        <button className="lk-datei lk-datei--neu" data-lbdateineu={b.id} disabled={laedt > 0}
          onClick={() => feld.current && feld.current.click()}>
          {laedt > 0 ? <span className="klein">Wird hochgeladen …</span>
            : <><Zeichen name="plus" groesse={20} /><span className="klein">PDF / Bild</span></>}
        </button>
        <input ref={feld} type="file" accept="application/pdf,.pdf,image/*" multiple hidden data-ablegen="direkt"
          onChange={(e) => { const l0 = Array.from(e.target.files || []); e.target.value = ""; if (l0.length) hochladen(l0); }} />
      </>}
    </div>
  );
}

async function dateienSetzen(b, dateien, schritt) {
  const vorher = await alt.rueckSichern("lieferant_besuche", { id: b.id });
  const { error } = await alt.db.from("lieferant_besuche").update({ dateien }).eq("id", b.id);
  if (error) { alt.meldung(fehlerText(error), "fehler"); return false; }
  alt.merkeSchritt(schritt, alt.rueckRein("lieferant_besuche", vorher));
  return true;
}

async function besuchDialog(l, b, kontakte, neu) {
  const w = await alt.dialogFelder({
    titel: b ? "Besuch ändern" : "Besuch bei uns · " + l.name,
    felder: [
      { name: "datum", label: "Datum des Besuchs", typ: "date", pflicht: true,
        wert: b ? b.datum : alt.isoDatum(new Date()) },
      ...(kontakte.length ? [{ name: "kontakt", label: "Wer war da?",
        auswahl: [["", "– niemand Bestimmtes –"]].concat(kontakte.map((k) => [k.id, k.name + (k.funktion ? " · " + k.funktion : "")])),
        wert: b ? (b.kontakt_id || "") : (kontakte.length === 1 ? kontakte[0].id : "") }] : []),
      { name: "notiz", label: "Notiz", typ: "textarea", zeilen: 7, pflicht: true, wert: b ? b.notiz : "",
        platzhalter: "Was wurde besprochen? Neuheiten, Preise, Muster, was ist zu tun …" },
    ],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w.datum || "")) { alt.meldung("Bitte ein Datum wählen.", "warn"); return; }
  const daten = { supplier_id: l.id, datum: w.datum, kontakt_id: w.kontakt || null, notiz: w.notiz.trim() };
  if (b) daten.geaendert_am = new Date().toISOString();
  const vorher = b ? await alt.rueckSichern("lieferant_besuche", { id: b.id }) : [];
  const { data, error } = b
    ? await alt.db.from("lieferant_besuche").update(daten).eq("id", b.id)
    : await alt.db.from("lieferant_besuche").insert(daten).select("id");
  if (error) { alt.meldung(fehlerText(error), "fehler"); return; }
  const neuId = !b && Array.isArray(data) && data[0] && data[0].id;
  if (b) alt.merkeSchritt("Ändern des Besuchs", alt.rueckRein("lieferant_besuche", vorher));
  else if (neuId) alt.merkeSchritt("Besuch " + l.name, alt.rueckWeg("lieferant_besuche", { id: neuId }));
  alt.meldung("Gespeichert.", "gut"); neu();
}

// ---------- Kontakt anlegen oder ändern ----------

const FELDER = [
  ["name", "Name", "Vorname Nachname"],
  ["funktion", "Funktion", "Verkauf Aussendienst, Anwendungstechnik …"],
  ["telefon", "Telefon", "+41 32 …"],
  ["mobil", "Mobil", "+41 79 …"],
  ["email", "Mail", "name@firma.ch"],
];

function kontaktOeffnen(l, k, datei, neu) {
  fensterOeffnen((zu) => <KontaktFenster l={l} k={k} datei={datei} zu={zu} neu={neu} />, null, "kontakt-huelle");
}

function KontaktFenster({ l, k, datei, zu, neu }) {
  const [w, setW] = useState(() => ({ name: "", funktion: "", telefon: "", mobil: "", email: "", notiz: "", ...(k || {}) }));
  const [karte, setKarte] = useState(null); // neues Foto { datei, url }
  const [profil, setProfil] = useState(null); // neues Profilbild { blob, url } oder { weg: true }
  const [lesen, setLesen] = useState(null); // Fortschritt der Erkennung
  const [gelesen, setGelesen] = useState(null); // welche Felder die Karte gefüllt hat
  const [speichert, setSpeichert] = useState(false);
  const foto = useRef(null);
  const profilFeld = useRef(null);
  const setze = (n, v) => setW((x) => ({ ...x, [n]: v }));
  const profilNehmen = async (d) => {
    try {
      const blob = await profilZuschneiden(d);
      setProfil((p0) => { if (p0 && p0.url) URL.revokeObjectURL(p0.url); return { blob, url: URL.createObjectURL(blob) }; });
    } catch (f) {
      alt.meldung("Das Bild liess sich nicht öffnen: " + alt.fehlertext(f), "fehler");
    }
  };

  const karteNehmen = async (d) => {
    const url = URL.createObjectURL(d);
    setKarte((alt0) => { if (alt0) URL.revokeObjectURL(alt0.url); return { datei: d, url }; });
    setLesen({ text: "Texterkennung wird geladen …", p: 0 });
    try {
      const { karteLesen } = await import("../../daten/visitenkarte.js");
      const e = await karteLesen(d, (status, p) =>
        setLesen({ text: /recogn/i.test(status) ? "Karte wird gelesen …" : "Texterkennung wird geladen …", p }), l.name);
      const gefuellt = [];
      setW((x) => {
        const n = { ...x };
        for (const [f] of FELDER) if (e[f] && !String(x[f] || "").trim()) { n[f] = e[f]; gefuellt.push(f); }
        if (e.website && !String(x.notiz || "").includes(e.website) && !l.website)
          n.notiz = [x.notiz, e.website].filter(Boolean).join("\n");
        return n;
      });
      setGelesen({ felder: gefuellt, text: e.text });
    } catch (f) {
      if (alt.fehlerMerken) alt.fehlerMerken("Visitenkarte lesen", (f && f.message) || String(f), navigator.userAgent);
      alt.meldung("Die Karte liess sich nicht lesen: " + alt.fehlertext(f), "fehler");
      setGelesen({ felder: [], text: "" });
    }
    setLesen(null);
  };
  useEffect(() => { if (datei) karteNehmen(datei); }, []);
  useEffect(() => () => { if (karte) URL.revokeObjectURL(karte.url); }, [karte]);

  const speichern = async (e) => {
    if (e) e.preventDefault();
    if (!String(w.name || "").trim()) { alt.meldung("Name wird benötigt.", "warn"); document.getElementById("lk-f-name").focus(); return; }
    setSpeichert(true);
    try {
      const daten = { supplier_id: l.id };
      for (const [f] of FELDER) daten[f] = String(w[f] || "").trim() || null;
      daten.notiz = String(w.notiz || "").trim() || null;
      if (karte) {
        const { karteVerkleinern } = await import("../../daten/visitenkarte.js");
        const blob = await karteVerkleinern(karte.datei);
        const pfad = "lieferanten/" + l.id + "/karten/" + crypto.randomUUID() + ".jpg";
        const up = await alt.db.storage.from("zeichnungen").upload(pfad, blob, { contentType: "image/jpeg", upsert: false });
        if (up.error) throw up.error;
        daten.karte_url = alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
        daten.karte_pfad = pfad;
      }
      if (profil && profil.blob) {
        const pfad = "lieferanten/" + l.id + "/profil/" + crypto.randomUUID() + ".jpg";
        const up = await alt.db.storage.from("zeichnungen").upload(pfad, profil.blob, { contentType: "image/jpeg", upsert: false });
        if (up.error) throw up.error;
        daten.foto_url = alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
        daten.foto_pfad = pfad;
      } else if (profil && profil.weg) {
        daten.foto_url = null;
        daten.foto_pfad = null;
      }
      if (k) daten.geaendert_am = new Date().toISOString();
      const vorher = k ? await alt.rueckSichern("lieferant_kontakte", { id: k.id }) : [];
      const { data, error } = k
        ? await alt.db.from("lieferant_kontakte").update(daten).eq("id", k.id)
        : await alt.db.from("lieferant_kontakte").insert(daten).select("id");
      if (error) throw error;
      const neuId = !k && Array.isArray(data) && data[0] && data[0].id;
      if (k) alt.merkeSchritt("Ändern von " + daten.name, alt.rueckRein("lieferant_kontakte", vorher));
      else if (neuId) alt.merkeSchritt("Kontakt " + daten.name, alt.rueckWeg("lieferant_kontakte", { id: neuId }));
      alt.meldung("Gespeichert.", "gut");
      neu(); zu();
    } catch (f) {
      alt.meldung(fehlerText(f), "fehler");
      setSpeichert(false);
    }
  };

  const bild = karte ? karte.url : (k && k.karte_url);
  const profilBild = profil ? profil.url : (k && k.foto_url);
  return (
    <div className="dialog kontaktdialog" role="dialog" aria-modal="true" id="lk-dialog">
      <h2>{k ? "Kontakt ändern" : "Neuer Kontakt"} · {l.name}</h2>
      <div className="lk-karte-zeile">
        {bild && <img className="lk-karte-gross" src={bild} alt="Visitenkarte" />}
        <div className="lk-karte-zeile__rechts">
          <button type="button" className="knopf" id="lk-f-foto" onClick={() => foto.current && foto.current.click()}>
            <Zeichen name="kamera" /> {bild ? "Andere Visitenkarte" : "Visitenkarte fotografieren"}</button>
          <input ref={foto} type="file" accept="image/*" capture="environment" hidden data-ablegen="direkt"
            onChange={(e) => { const d = e.target.files && e.target.files[0]; e.target.value = ""; if (d) karteNehmen(d); }} />
          {lesen && <div className="lk-lesen" id="lk-lesen">{lesen.text}
            <div className="lk-lesen__balken"><span style={{ width: Math.round((lesen.p || 0) * 100) + "%" }} /></div></div>}
          {gelesen && !lesen && <p className="feldhinweis" id="lk-gelesen">{gelesen.felder.length
            ? "Von der Karte ausgefüllt: " + gelesen.felder.map((f) => FELDER.find((x) => x[0] === f)[1]).join(", ")
              + ". Bitte kurz prüfen."
            : "Auf der Karte war nichts sicher zu erkennen. Am besten flach hinlegen, gut beleuchtet und möglichst bildfüllend fotografieren, oder von Hand ausfüllen."}</p>}
        </div>
      </div>
      <div className="lk-profil-zeile">
        {profilBild
          ? <img className="lk-profil lk-profil--gross" id="lk-f-profilbild" src={profilBild} alt="Profilbild" />
          : <span className="lk-profil lk-profil--gross lk-profil--leer">{anfangsbuchstaben(w.name)}</span>}
        <div className="lk-profil-zeile__knoepfe">
          <button type="button" className="knopf" id="lk-f-profil" onClick={() => profilFeld.current && profilFeld.current.click()}>
            <Zeichen name="person" /> {profilBild ? "Anderes Profilbild" : "Profilbild hinzufügen"}</button>
          {profilBild && <button type="button" className="knopf knopf--still" id="lk-f-profil-weg"
            onClick={() => setProfil((p0) => { if (p0 && p0.url) URL.revokeObjectURL(p0.url); return k && k.foto_url ? { weg: true } : null; })}>
            Entfernen</button>}
          <input ref={profilFeld} type="file" accept="image/*" hidden data-ablegen="direkt" id="lk-f-profil-datei"
            onChange={(e) => { const d = e.target.files && e.target.files[0]; e.target.value = ""; if (d) profilNehmen(d); }} />
        </div>
      </div>
      <form onSubmit={speichern} className="lk-form">
        {FELDER.map(([f, label, platz]) => (
          <label key={f} className={"feld" + (gelesen && gelesen.felder.includes(f) ? " lk-feld--gelesen" : "")}>
            <span>{label}{f === "name" ? " *" : ""}</span>
            <input id={"lk-f-" + f} value={w[f] || ""} placeholder={platz}
              type="text" inputMode={f === "email" ? "email" : f === "telefon" || f === "mobil" ? "tel" : undefined}
              data-fokus={f === "name" && !datei ? "" : undefined}
              onChange={(e) => setze(f, e.target.value)} />
          </label>))}
        <label className="feld lk-form__breit"><span>Notiz</span>
          <textarea id="lk-f-notiz" rows={3} value={w.notiz || ""} placeholder="kann leer bleiben"
            onChange={(e) => setze("notiz", e.target.value)} /></label>
        <button type="submit" hidden />
      </form>
      {gelesen && gelesen.text && <details className="lk-rohtext"><summary>Gelesener Text der Karte</summary>
        <pre>{gelesen.text}</pre></details>}
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" data-nein="" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" id="lk-f-speichern" disabled={speichert || !!lesen} onClick={() => speichern()}>
          {speichert ? "Wird gespeichert …" : "Speichern"}</button>
      </div>
    </div>
  );
}
