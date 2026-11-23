// =================================================================
//  REKLAMATIONSMANAGEMENT, Reiter der Seite Qualitätssicherung
//  (seit 1.745.0, Wunsch Patrick 23. November 2026: „bei QS einen
//  weiteren Reiter, Reklamationsmanagement“).
//  Je Reklamation: von wem (Kunde, an Lieferant, intern), HOCO Nr.,
//  FA Nr., Teil, Mengen, Fehlerart und Beschreibung, Stand,
//  Verantwortlich, Termin und die Schritte wie im 8D-Bericht
//  (D1 Team bis D8 Wirksamkeit) zum Ankreuzen (`ACHT_D`, Spalte achtd), Kosten, Fotos und PDFs. Oben Zahlen, darunter die
//  Liste mit Filtern und Suche; „8D-Bericht“ macht ein PDF A4.
//  Tabelle reklamationen aus sql/reklamationen.sql (eingespielt), die
//  Nummer RKJJ-001 vergibt die Datenbank. Dateien in der Ablage
//  „zeichnungen“ unter reklamationen/<id>/. Nicht für Externe (die
//  sehen die Qualitätssicherung nicht, die Datenbank sperrt sie auch).
// =================================================================
import { useRef, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { passtWoerter } from "../../teile/Suchfeld.jsx";
import { useSeitenSuche } from "../../teile/seitenSuche.js";

export const ARTEN = [
  ["kunde", "Kundenreklamation"],
  ["lieferant", "Reklamation an Lieferant"],
  ["intern", "Interner Fehler"],
];
const ART_KURZ = { kunde: "Kunde", lieferant: "Lieferant", intern: "Intern" };
export const STAENDE = [
  ["offen", "Offen"],
  ["bearbeitung", "In Bearbeitung"],
  ["abgeschlossen", "Abgeschlossen"],
  ["abgelehnt", "Abgelehnt (nicht berechtigt)"],
];
const STAND_KURZ = { offen: "Offen", bearbeitung: "In Bearbeitung", abgeschlossen: "Abgeschlossen", abgelehnt: "Abgelehnt" };
const FEHLERARTEN = ["Mass ausser Toleranz", "Oberfläche / Kratzer", "Grat", "Gewinde", "Falsches Material",
  "Verwechslung / falsches Teil", "Menge falsch", "Verpackung / Transport", "Sauberkeit / Späne", "Dokumente fehlen", "Andere"];

// Die Schritte wie im 8D-Bericht. Meist sind es dieselben Gründe und
// Massnahmen (Patrick: „viel mit Häkchen setzen“): je Schritt Punkte zum
// Ankreuzen, gespeichert als Text in reklamationen.achtd[schluessel],
// dazu das freie Feld für „Anderes / Ergänzung“ (die bisherigen Spalten
// sofort, ursache, korrektur, vorbeugung, wirksamkeit).
export const ACHT_D = [
  { s: "d1", titel: "D1 · Team", gruppen: [["", ["Geschäftsleitung", "Qualität", "Produktion / Mechaniker", "Einrichter", "AVOR / Programmierung", "Logistik / Versand", "Einkauf"]]] },
  { s: "d3", titel: "D3 · Sofortmassnahme", text: "sofort", gruppen: [["", [
    "Lagerbestand gesperrt und geprüft", "Laufende Produktion gestoppt und geprüft", "Teile beim Kunden sortiert",
    "Teile zurückgenommen", "Ersatzlieferung", "Nacharbeit", "100 %-Kontrolle bis Ursache behoben",
    "Teile verschrottet", "Kunde informiert", "Lieferant informiert"]]] },
  { s: "d4", titel: "D4 · Ursache: warum ist der Fehler entstanden?", text: "ursache", gruppen: [
    ["Mensch", ["Falsch eingestellt / korrigiert", "Unachtsamkeit", "Fehlende Einweisung"]],
    ["Maschine", ["Werkzeugverschleiss", "Werkzeugbruch", "Spannzange / Führungsbüchse", "Maschine ungenau / Warmlauf"]],
    ["Material", ["Rohmaterial fehlerhaft", "Falsches Material / Charge verwechselt"]],
    ["Methode", ["NC-Programm fehlerhaft", "Zeichnung oder Index falsch gelesen", "Einrichtblatt unvollständig", "Prüfplan ungenügend"]],
    ["Messung", ["Messmittel ungeeignet", "Messmittel nicht kalibriert", "Messfehler"]],
    ["Umfeld", ["Späne / Verschmutzung", "Verpackung / Transport", "Teile vermischt"]]] },
  { s: "d4b", titel: "D4 · Ursache: warum wurde er nicht entdeckt?", gruppen: [["", [
    "Merkmal nicht im Prüfplan", "Prüfintervall zu gross", "Stichprobe zu klein", "Messmittel ungeeignet",
    "Sichtprüfung ungenügend", "Fehler trat zwischen zwei Prüfungen auf", "Keine Endkontrolle"]]] },
  { s: "d5", titel: "D5/D6 · Korrekturmassnahme", text: "korrektur", gruppen: [["", [
    "NC-Programm korrigiert", "Werkzeug gewechselt", "Standzeit angepasst", "Einrichtblatt ergänzt",
    "Prüfplan ergänzt", "Prüfintervall verkürzt", "Messmittel ersetzt / kalibriert", "Maschine repariert / eingestellt",
    "Mitarbeiter instruiert", "Verpackung angepasst", "8D beim Lieferanten verlangt"]]] },
  { s: "d7", titel: "D7 · Vorbeugen", text: "vorbeugung", gruppen: [["", [
    "Auf ähnliche Teile übertragen", "Hinweis im Einrichtblatt", "Standzeit im Werkzeugwechsel festgelegt",
    "Erstteilprüfung ergänzt", "Schulung im Team", "Vorrichtung / Lehre gebaut", "Prozess / QM-Dokument angepasst",
    "Risiko neu beurteilt"]]] },
  { s: "d8", titel: "D8 · Wirksamkeit und Abschluss", text: "wirksamkeit", gruppen: [["", [
    "Nächste Lieferung geprüft, ohne Fehler", "Keine weitere Reklamation", "Kunde hat Massnahmen akzeptiert",
    "Massnahmen wirksam", "Team informiert"]]] },
];
// Für Bericht und Suche: was in einem Schritt angekreuzt ist
const angekreuzt = (w, s) => ((w.achtd && Array.isArray(w.achtd[s])) ? w.achtd[s] : []);

const leer = (v) => v == null || String(v).trim() === "";
const heute = () => alt.isoDatum(new Date());
const datum = (d) => {
  if (!d) return "";
  const t = alt.ausIso(String(d).slice(0, 10));
  return isNaN(t.getTime()) ? String(d) : String(t.getDate()).padStart(2, "0") + "." + String(t.getMonth() + 1).padStart(2, "0") + "." + t.getFullYear();
};
const ueberfaellig = (r) => r.termin && (r.status === "offen" || r.status === "bearbeitung") && r.termin < heute();
const fehltTabelle = (f) => /reklamationen/.test(String((f && (f.message || f.details)) || f || ""))
  && /(does not exist|schema cache|not find)/i.test(String((f && f.message) || f || ""));
const fehlerText = (f) => (fehltTabelle(f) ? "Die Datenbank kennt die Reklamationen noch nicht (sql/reklamationen.sql)." : alt.fehlertext(f));

async function laden() {
  const [r, p] = await Promise.all([
    alt.zeitlimit(alt.db.from("reklamationen").select("*").order("eingang", { ascending: false })
      .order("nr", { ascending: false }), 10000, "Reklamationen"),
    alt.zeitlimit(alt.db.from("profiles").select("id, full_name, email").eq("is_active", true), 8000, "Personen"),
  ]);
  if (r.error) throw r.error;
  const personen = {};
  (p.data || []).forEach((x) => { personen[x.id] = alt.personName(x); });
  return { liste: r.data || [], personen };
}

// Gewählte Filter; bleiben beim Reiterwechsel
const filter = { stand: "offen", art: "", suche: "" };

export default function Reklamationen() {
  const { daten, fehler, neu } = useDaten(laden, []);
  const [, setF] = useState(0);
  const setze = (n, v) => { filter[n] = v; setF((x) => x + 1); };
  const darf = alt.darfSchreiben() && !alt.istExtern();

  useSeitenSuche({
    name: "Reklamationen", platzhalter: "Nr., Kunde, HOCO Nr., Fehler …",
    eintraege: () => ((daten && daten.liste) || []).map((r) => ({
      gruppe: "Reklamationen", zeichen: "⚠", titel: r.nr + " · " + (r.partner || ART_KURZ[r.art] || ""),
      zeile: [r.hoco_nr, STAND_KURZ[r.status], r.fehler].filter(Boolean).join(" · "),
      such: [r.fa_nr, r.teil, r.ursache, r.verantwortlich].filter(Boolean).join(" "), r })),
    springen: (x) => reklamationOeffnen(x.r, neu, daten.personen, daten.liste),
  });

  if (!daten) return <p className="klein">{fehler ? fehlerText(fehler) : "Wird geladen …"}</p>;
  const { liste, personen } = daten;
  const jahr = String(new Date().getFullYear());
  const zahl = {
    offen: liste.filter((r) => r.status === "offen").length,
    bearbeitung: liste.filter((r) => r.status === "bearbeitung").length,
    spaet: liste.filter(ueberfaellig).length,
    jahr: liste.filter((r) => String(r.eingang || "").startsWith(jahr)).length,
  };
  const gezeigt = liste.filter((r) => {
    if (filter.stand === "offen" && !(r.status === "offen" || r.status === "bearbeitung")) return false;
    if (filter.stand === "zu" && !(r.status === "abgeschlossen" || r.status === "abgelehnt")) return false;
    if (filter.stand === "spaet" && !ueberfaellig(r)) return false;
    if (filter.art && r.art !== filter.art) return false;
    return passtWoerter(filter.suche, [r.nr, r.partner, r.kontakt, r.ref_partner, r.hoco_nr, r.fa_nr, r.teil,
      r.fehlerart, r.fehler, r.verantwortlich, r.ursache, Object.values(r.achtd || {}).flat().join(" "), r.sofort, r.korrektur, r.vorbeugung, STAND_KURZ[r.status], ART_KURZ[r.art]]);
  });

  return (
    <div className="rk" id="rk">
      <div className="rk-zahlen">
        <button className={"rk-zahl" + (filter.stand === "offen" ? " aktiv" : "")} data-rkzahl="offen"
          onClick={() => setze("stand", "offen")}><b>{zahl.offen}</b><span>Offen</span></button>
        <button className={"rk-zahl" + (filter.stand === "offen" ? " aktiv" : "")} data-rkzahl="bearbeitung"
          onClick={() => setze("stand", "offen")}><b>{zahl.bearbeitung}</b><span>In Bearbeitung</span></button>
        <button className={"rk-zahl" + (zahl.spaet ? " rk-zahl--rot" : "") + (filter.stand === "spaet" ? " aktiv" : "")}
          data-rkzahl="spaet" onClick={() => setze("stand", "spaet")}><b>{zahl.spaet}</b><span>Termin überschritten</span></button>
        <button className={"rk-zahl" + (filter.stand === "alle" ? " aktiv" : "")} data-rkzahl="jahr"
          onClick={() => setze("stand", "alle")}><b>{zahl.jahr}</b><span>Im Jahr {jahr}</span></button>
        {darf && <button className="knopf knopf--haupt rk-neu" id="rk-neu"
          onClick={() => reklamationOeffnen(null, neu, personen, liste)}>+ Neue Reklamation</button>}
      </div>

      <div className="rk-filter">
        <div className="rk-wahl">
          {[["offen", "Offen"], ["spaet", "Überfällig"], ["zu", "Abgeschlossen"], ["alle", "Alle"]].map(([w, t]) => (
            <button key={w} className={"rk-chip" + (filter.stand === w ? " aktiv" : "")} data-rkstand={w}
              onClick={() => setze("stand", w)}>{t}</button>))}
        </div>
        <div className="rk-wahl">
          {[["", "Alle Arten"]].concat(ARTEN.map(([w]) => [w, ART_KURZ[w]])).map(([w, t]) => (
            <button key={w || "alle"} className={"rk-chip" + (filter.art === w ? " aktiv" : "")} data-rkart={w || "alle"}
              onClick={() => setze("art", w)}>{t}</button>))}
        </div>
        <input type="search" className="rk-suche" id="rk-suche" placeholder="Suchen: Nr., Kunde, HOCO Nr., Fehler …"
          value={filter.suche} onChange={(e) => setze("suche", e.target.value)} autoComplete="off" />
      </div>

      {!gezeigt.length
        ? <p className="hinweis" id="rk-leer">{liste.length ? "Keine Reklamation passt zum Filter." : "Noch keine Reklamation erfasst."}</p>
        : <div className="rk-liste" id="rk-liste">
            <div className="rk-zeile rk-zeile--kopf">
              <span>Nr.</span><span>Eingang</span><span>Von</span><span>HOCO Nr.</span><span>Fehler</span>
              <span>Verantwortlich</span><span>Termin</span><span>Stand</span>
            </div>
            {gezeigt.map((r) => (
              <button key={r.id} className={"rk-zeile" + (ueberfaellig(r) ? " rk-zeile--spaet" : "")} data-rk={r.nr}
                onClick={() => reklamationOeffnen(r, neu, personen, liste)}>
                <span className="rk-nr">{r.nr}</span>
                <span>{datum(r.eingang)}</span>
                <span><span className={"rk-art rk-art--" + r.art}>{ART_KURZ[r.art] || r.art}</span> {r.partner || ""}</span>
                <span>{r.hoco_nr || ""}{r.fa_nr ? <small> · FA {r.fa_nr}</small> : null}</span>
                <span className="rk-fehler">{r.fehlerart ? <b>{r.fehlerart}: </b> : null}{r.fehler || ""}</span>
                <span>{r.verantwortlich || ""}</span>
                <span className={ueberfaellig(r) ? "rk-rot" : ""}>{datum(r.termin)}</span>
                <span><span className={"rk-stand rk-stand--" + r.status}>{STAND_KURZ[r.status] || r.status}</span>
                  {(r.dateien || []).length ? <small className="rk-dateizahl"> 📎{r.dateien.length}</small> : null}</span>
              </button>))}
          </div>}
    </div>
  );
}

// ---------------------------------------------------------------
//  Fenster einer Reklamation
// ---------------------------------------------------------------
export function reklamationOeffnen(r, nachher, personen, alle) {
  fensterOeffnen((zu) => <RkFenster r={r} zu={zu} nachher={nachher} personen={personen || {}} alle={alle || []} />, null, "rk-huelle");
}

const FELDER_TEXT = ["art", "partner", "kontakt", "ref_partner", "eingang", "hoco_nr", "fa_nr", "teil", "fehlerart", "fehler",
  "status", "verantwortlich", "termin", "sofort", "ursache", "korrektur", "vorbeugung", "wirksamkeit"];
const FELDER_ZAHL = ["menge_geliefert", "menge_reklamiert", "menge_fehler", "kosten"];

function RkFenster({ r, zu, nachher, personen, alle }) {
  const darf = alt.darfSchreiben() && !alt.istExtern();
  const [w, setW] = useState(() => ({ art: "kunde", status: "offen", eingang: heute(), ...(r || {}),
    team: (r && r.achtd && r.achtd.team) || "" }));
  const [neueDateien, setNeue] = useState([]); // vor dem Speichern gewählte Dateien
  const [speichert, setSpeichert] = useState(false);
  const [hinweis, setHinweis] = useState("");
  const feld = useRef(null);
  const setze = (n, v) => setW((x) => ({ ...x, [n]: v }));
  // Punkt im 8D an- oder abkreuzen
  const kreuzen = (schritt, punkt) => setW((x) => {
    const a = { ...(x.achtd || {}) };
    const l = Array.isArray(a[schritt]) ? a[schritt] : [];
    a[schritt] = l.includes(punkt) ? l.filter((y) => y !== punkt) : l.concat(punkt);
    return { ...x, achtd: a };
  });
  const dateien = Array.isArray(w.dateien) ? w.dateien : [];
  const namen = Object.values(personen).sort((a, b) => a.localeCompare(b, "de"));

  // HOCO Nr. eingetippt: Teil, Kunde und FA Nr. aus dem jüngsten Auftrag vorschlagen
  const hocoNachschlagen = async (nr) => {
    nr = String(nr || "").trim();
    if (!nr) return;
    try {
      const [t, j] = await Promise.all([
        alt.db.from("hoco_parts").select("bezeichnung").eq("hoco_nr", nr).maybeSingle(),
        alt.db.from("jobs").select("fa_nr, customer_number, target_quantity").eq("job_number", nr)
          .order("planned_from", { ascending: false, nullsFirst: false }).limit(1),
      ]);
      const auftrag = (j.data || [])[0];
      const gefuellt = [];
      setW((x) => {
        const n = { ...x };
        if (leer(x.teil) && t.data && t.data.bezeichnung) { n.teil = t.data.bezeichnung; gefuellt.push("Teil"); }
        if (leer(x.fa_nr) && auftrag && auftrag.fa_nr) { n.fa_nr = auftrag.fa_nr; gefuellt.push("FA Nr."); }
        if (leer(x.partner) && x.art === "kunde" && auftrag && auftrag.customer_number) { n.partner = String(auftrag.customer_number); gefuellt.push("Kunde"); }
        return n;
      });
      setHinweis(gefuellt.length ? "Aus dem jüngsten Auftrag ausgefüllt: " + gefuellt.join(", ") + ". Bitte prüfen." : "");
    } catch (f) { /* dann eben von Hand */ }
  };

  const hochladen = async (id, liste) => {
    const raus = [];
    for (const d of liste) {
      const pdf = /pdf/i.test(d.type) || /\.pdf$/i.test(d.name);
      const endung = pdf ? "pdf" : ((d.name.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || "jpg").toLowerCase();
      const pfad = "reklamationen/" + id + "/" + crypto.randomUUID() + "." + endung;
      const up = await alt.db.storage.from("zeichnungen").upload(pfad, d,
        { contentType: d.type || (pdf ? "application/pdf" : "application/octet-stream"), upsert: false });
      if (up.error) throw up.error;
      raus.push({ name: d.name || ("Datei." + endung), url: alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl,
        pfad, typ: pdf ? "pdf" : /^image\//.test(d.type) ? "bild" : "datei" });
    }
    return raus;
  };

  const speichern = async (schliessen = true) => {
    if (leer(w.fehler)) { alt.meldung("Bitte den Fehler beschreiben.", "warn"); document.getElementById("rk-f-fehler").focus(); return null; }
    if (w.art !== "intern" && leer(w.partner)) {
      alt.meldung(w.art === "kunde" ? "Bitte den Kunden angeben." : "Bitte den Lieferanten angeben.", "warn");
      document.getElementById("rk-f-partner").focus(); return null;
    }
    setSpeichert(true);
    try {
      const d = {};
      for (const f of FELDER_TEXT) d[f] = leer(w[f]) ? null : String(w[f]).trim();
      for (const f of FELDER_ZAHL) {
        const z = leer(w[f]) ? null : Number(String(w[f]).replace(/['\s]/g, "").replace(",", "."));
        d[f] = z == null || isNaN(z) ? null : z;
      }
      d.achtd = { ...(w.achtd && typeof w.achtd === "object" ? w.achtd : {}), team: leer(w.team) ? "" : String(w.team).trim() };
      d.art = d.art || "kunde"; d.status = d.status || "offen"; d.eingang = d.eingang || heute();
      const zu0 = d.status === "abgeschlossen" || d.status === "abgelehnt";
      d.abgeschlossen_am = zu0 ? (r && r.abgeschlossen_am) || new Date().toISOString() : null;
      let id = r && r.id, nr = r && r.nr;
      if (r) {
        d.geaendert_am = new Date().toISOString();
        d.geaendert_von = (await alt.db.auth.getUser()).data.user?.id || null;
        const vorher = await alt.rueckSichern("reklamationen", { id: r.id });
        const { error } = await alt.db.from("reklamationen").update(d).eq("id", r.id);
        if (error) throw error;
        alt.merkeSchritt("Ändern der Reklamation " + r.nr, alt.rueckRein("reklamationen", vorher));
      } else {
        const { data, error } = await alt.db.from("reklamationen").insert(d).select("id, nr").single();
        if (error) throw error;
        id = data.id; nr = data.nr;
        alt.merkeSchritt("Reklamation " + nr, alt.rueckWeg("reklamationen", { id }));
      }
      if (neueDateien.length) {
        const dazu = await hochladen(id, neueDateien);
        const liste = dateien.concat(dazu);
        const { error } = await alt.db.from("reklamationen").update({ dateien: liste }).eq("id", id);
        if (error) throw error;
        setW((x) => ({ ...x, dateien: liste })); setNeue([]);
      }
      alt.meldung((r ? "Gespeichert: " : "Erfasst: ") + nr, "gut");
      if (nachher) nachher();
      if (schliessen) zu();
      return { id, nr };
    } catch (f) {
      alt.meldung(fehlerText(f), "fehler");
      return null;
    } finally { setSpeichert(false); }
  };

  const dateiWeg = async (d) => {
    const ok = await alt.nachfragen({ titel: "Datei löschen", text: "„" + d.name + "“ wird bei der Reklamation gelöscht.",
      bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const liste = dateien.filter((x) => x.pfad !== d.pfad);
    const vorher = await alt.rueckSichern("reklamationen", { id: r.id });
    const { error } = await alt.db.from("reklamationen").update({ dateien: liste }).eq("id", r.id);
    if (error) { alt.meldung(fehlerText(error), "fehler"); return; }
    alt.merkeSchritt("Löschen von „" + d.name + "“", alt.rueckRein("reklamationen", vorher));
    setW((x) => ({ ...x, dateien: liste }));
    if (nachher) nachher();
  };

  const loeschen = async () => {
    const ok = await alt.nachfragen({ titel: "Reklamation löschen", text: "Reklamation " + r.nr + " wird gelöscht.",
      bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const vorher = await alt.rueckSichern("reklamationen", { id: r.id });
    const { error } = await alt.db.from("reklamationen").delete().eq("id", r.id);
    if (error) { alt.meldung(fehlerText(error), "fehler"); return; }
    alt.merkeSchritt("Löschen der Reklamation " + r.nr, alt.rueckRein("reklamationen", vorher));
    alt.meldung("Gelöscht.");
    if (nachher) nachher();
    zu();
  };

  const bericht = async () => {
    // Zuerst speichern, damit der Bericht zeigt, was im Fenster steht
    const s = darf ? await speichern(false) : { nr: w.nr };
    if (!s) return;
    try {
      const { pdfAusHtml } = await import("../qmAlt/checklistePdf.js");
      const blob = await pdfAusHtml(berichtHtml({ ...w, nr: s.nr }), "8D-Bericht " + s.nr);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "8D-Bericht " + s.nr + ".pdf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } catch (f) { alt.meldung("Bericht ging nicht: " + alt.fehlertext(f), "fehler"); }
  };

  const T = (n, label, extra = {}) => (
    <label className={"feld" + (extra.breit ? " rk-breit" : "")}>
      <span>{label}</span>
      {extra.zeilen
        ? <textarea id={"rk-f-" + n} rows={extra.zeilen} value={w[n] || ""} placeholder={extra.ph || ""} disabled={!darf}
            onChange={(e) => setze(n, e.target.value)} />
        : <input id={"rk-f-" + n} type={extra.typ || "text"} value={w[n] == null ? "" : w[n]} placeholder={extra.ph || ""}
            disabled={!darf} list={extra.liste} inputMode={extra.zahl ? "decimal" : undefined}
            data-fokus={extra.fokus ? "" : undefined} onBlur={extra.blur}
            onChange={(e) => setze(n, e.target.value)} />}
    </label>
  );
  // Frühere Reklamationen derselben HOCO Nr.: ihre Häkchen lassen sich übernehmen,
  // weil Ursache und Massnahmen meist dieselben sind
  const frueher = leer(w.hoco_nr) ? [] : alle.filter((x) => (!r || x.id !== r.id)
    && String(x.hoco_nr || "").trim() === String(w.hoco_nr).trim()).slice(0, 4);
  const uebernehmen = (x) => setW((y) => {
    const a = { ...(y.achtd || {}) };
    for (const d of ACHT_D) {
      if (d.s === "d8") continue; // Abschluss gilt je Reklamation
      const dazu = angekreuzt(x, d.s);
      a[d.s] = Array.from(new Set(angekreuzt(y, d.s).concat(dazu)));
    }
    alt.meldung("Häkchen von " + x.nr + " übernommen. Bitte prüfen.", "gut");
    return { ...y, achtd: a };
  });
  const wer = r && r.erstellt_von && personen[r.erstellt_von];

  return (
    <div className="dialog dialog--breit rk-fenster" role="dialog" aria-modal="true" id="rk-fenster">
      <div className="blatt__kopf">
        <h2>{r ? "Reklamation " + r.nr : "Neue Reklamation"}</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      {r && <p className="klein rk-wer">Erfasst {datum(r.erstellt_am)}{wer ? " von " + wer : ""}
        {r.geaendert_am ? " · zuletzt geändert " + datum(r.geaendert_am) + (personen[r.geaendert_von] ? " von " + personen[r.geaendert_von] : "") : ""}
        {r.abgeschlossen_am ? " · abgeschlossen " + datum(r.abgeschlossen_am) : ""}</p>}
      <datalist id="rk-fehlerarten">{FEHLERARTEN.map((f) => <option key={f} value={f} />)}</datalist>
      <datalist id="rk-personen">{namen.map((f) => <option key={f} value={f} />)}</datalist>

      <div className="rk-art-wahl">
        {ARTEN.map(([a, t]) => (
          <button key={a} type="button" className={"rk-chip" + (w.art === a ? " aktiv" : "")} data-rkfart={a}
            disabled={!darf} onClick={() => setze("art", a)}>{t}</button>))}
      </div>

      <section className="rk-abschnitt">
        <h3>D1/D2 · Reklamation</h3>
        <div className="rk-raster">
          {w.art !== "intern" && T("partner", w.art === "kunde" ? "Kunde *" : "Lieferant *", { fokus: !r, ph: w.art === "kunde" ? "Kunde oder Kunden-Nr." : "Lieferant" })}
          {w.art !== "intern" && T("kontakt", "Kontaktperson")}
          {w.art !== "intern" && T("ref_partner", w.art === "kunde" ? "Reklamations-Nr. Kunde" : "Bestell-Nr. / Lieferschein")}
          {T("eingang", "Eingang", { typ: "date" })}
          {T("hoco_nr", "HOCO Nr.", { ph: "10841-0009", blur: (e) => hocoNachschlagen(e.target.value), fokus: !r && w.art === "intern" })}
          {T("fa_nr", "FA Nr.")}
          {T("teil", "Teil / Bezeichnung", { breit: true })}
          {T("menge_geliefert", "Menge geliefert", { zahl: true })}
          {T("menge_reklamiert", "Menge reklamiert", { zahl: true })}
          {T("menge_fehler", "Davon fehlerhaft", { zahl: true, ph: "nach Prüfung" })}
          {T("fehlerart", "Fehlerart", { liste: "rk-fehlerarten", ph: "wählen oder eintippen" })}
        </div>
        {hinweis && <p className="feldhinweis" id="rk-hinweis">{hinweis}</p>}
        {!!frueher.length && <div className="rk-frueher" id="rk-frueher">
          <span>Schon reklamiert:</span>
          {frueher.map((x) => <span key={x.id} className="rk-frueher__eintrag">
            <b>{x.nr}</b> {datum(x.eingang)} {x.fehlerart || ""}
            {darf && <button type="button" className="knopf knopf--klein" data-rkuebernehmen={x.nr}
              onClick={() => uebernehmen(x)}>Häkchen übernehmen</button>}
          </span>)}
        </div>}
        {T("fehler", "Fehlerbeschreibung *", { zeilen: 3, breit: true, ph: "Was genau ist falsch? Mass, Stelle, wie viele …" })}
      </section>

      <section className="rk-abschnitt">
        <h3>Bearbeitung</h3>
        <div className="rk-raster">
          <label className="feld"><span>Stand</span>
            <select id="rk-f-status" value={w.status} disabled={!darf} onChange={(e) => setze("status", e.target.value)}>
              {STAENDE.map(([s, t]) => <option key={s} value={s}>{t}</option>)}
            </select></label>
          {T("verantwortlich", "Verantwortlich", { liste: "rk-personen" })}
          {T("termin", "Termin", { typ: "date" })}
          {T("kosten", "Kosten CHF", { zahl: true, ph: "Ersatz, Sortieren, Fracht …" })}
        </div>
      </section>

      {ACHT_D.map((d) => (
        <section key={d.s} className="rk-abschnitt rk-8d" data-rk8d={d.s}>
          <h3>{d.titel}{angekreuzt(w, d.s).length ? <small className="rk-8d-zahl"> · {angekreuzt(w, d.s).length} angekreuzt</small> : null}</h3>
          {d.gruppen.map(([g, punkte]) => (
            <div key={g || "x"} className="rk-gruppe">
              {g && <span className="rk-gruppe__name">{g}</span>}
              <div className="rk-haken">
                {punkte.map((pk) => {
                  const an = angekreuzt(w, d.s).includes(pk);
                  return <button key={pk} type="button" className={"rk-haken__punkt" + (an ? " an" : "")} disabled={!darf}
                    aria-pressed={an} data-rkhaken={pk} onClick={() => kreuzen(d.s, pk)}>
                    <span className="rk-haken__box">{an ? "✓" : ""}</span>{pk}</button>;
                })}
              </div>
            </div>))}
          {d.s === "d1" && T("team", "Namen", { liste: "rk-personen", ph: "wer hat mitgearbeitet" })}
          {d.text && T(d.text, "Anderes / Ergänzung", { zeilen: 2, breit: true })}
        </section>))}

      <section className="rk-abschnitt">
        <h3>Fotos und Dokumente</h3>
        <div className="lk-dateien" id="rk-dateien">
          {dateien.map((d) => (
            <div key={d.pfad || d.url} className="lk-datei" data-rkdatei={d.name}>
              <button type="button" className="lk-datei__knopf" title={d.name}
                onClick={() => alt.betrachter(d.url, d.name, d.typ === "pdf")}>
                {d.typ === "bild" ? <img src={d.url} alt={d.name} loading="lazy" />
                  : <span className="lk-datei__pdf"><small>{d.typ === "pdf" ? "PDF" : "Datei"}</small></span>}
                <span className="lk-datei__name">{d.name}</span>
              </button>
              {darf && <button type="button" className="lk-datei__weg" title="Löschen" onClick={() => dateiWeg(d)}>✕</button>}
            </div>))}
          {neueDateien.map((d, i) => (
            <div key={"n" + i} className="lk-datei rk-datei--neu">
              <span className="lk-datei__knopf"><span className="lk-datei__pdf"><small>neu</small></span>
                <span className="lk-datei__name">{d.name}</span></span>
              <button type="button" className="lk-datei__weg" title="Weg"
                onClick={() => setNeue((l) => l.filter((_, j) => j !== i))}>✕</button>
            </div>))}
          {darf && <>
            <button type="button" className="lk-datei lk-datei--neu" id="rk-datei-neu"
              onClick={() => feld.current && feld.current.click()}><span className="klein">+ Foto / PDF</span></button>
            <input ref={feld} type="file" accept="application/pdf,.pdf,image/*" multiple hidden data-ablegen="direkt" id="rk-datei-feld"
              onChange={(e) => { const l0 = Array.from(e.target.files || []); e.target.value = ""; if (l0.length) setNeue((l) => l.concat(l0)); }} />
          </>}
        </div>
        {!!neueDateien.length && <p className="feldhinweis">Neue Dateien werden beim Speichern hochgeladen.</p>}
      </section>

      <div className="dialog__knoepfe rk-knoepfe">
        {darf && <button className="knopf knopf--haupt" id="rk-speichern" disabled={speichert}
          onClick={() => speichern(true)}>{speichert ? "Wird gespeichert …" : "Speichern"}</button>}
        <button className="knopf" id="rk-bericht" disabled={speichert || (!r && !darf)} onClick={bericht}>8D-Bericht (PDF)</button>
        {darf && r && <button className="knopf knopf--gefahr" id="rk-loeschen" onClick={loeschen}>Löschen</button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
//  8D-Bericht als A4 (gezeichnet mit pdfAusHtml aus dem QMS)
// ---------------------------------------------------------------
function berichtHtml(w) {
  const e = (s) => alt.esc(s == null ? "" : String(s));
  const zeilen = (s) => e(s).replace(/\n/g, "<br>");
  const art = (ARTEN.find((a) => a[0] === w.art) || ARTEN[0])[1];
  const z = (n) => (leer(n) ? "" : alt.zahlText(Number(n)));
  let h = "<div class='ck-titel'><div><h1>8D-Bericht " + e(w.nr) + "</h1><div class='ck-unter'>" + e(art)
    + " · Stand: " + e(STAND_KURZ[w.status] || w.status) + "</div></div><div class='ck-firma'>Hofer + Co<br>Präzisionsdrehteile</div></div>";
  h += "<h2>D1/D2 · Reklamation</h2><table class='ck-kopf'><tbody>"
    + "<tr><th>" + (w.art === "lieferant" ? "Lieferant" : "Kunde") + "</th><td>" + e(w.partner) + "</td><th>Kontakt</th><td>" + e(w.kontakt) + "</td></tr>"
    + "<tr><th>Eingang</th><td>" + e(datum(w.eingang)) + "</td><th>Referenz</th><td>" + e(w.ref_partner) + "</td></tr>"
    + "<tr><th>HOCO Nr.</th><td>" + e(w.hoco_nr) + "</td><th>FA Nr.</th><td>" + e(w.fa_nr) + "</td></tr>"
    + "<tr><th>Teil</th><td colspan='3'>" + e(w.teil) + "</td></tr>"
    + "<tr><th>Menge geliefert</th><td>" + z(w.menge_geliefert) + "</td><th>reklamiert / fehlerhaft</th><td>"
    + z(w.menge_reklamiert) + (leer(w.menge_fehler) ? "" : " / " + z(w.menge_fehler)) + "</td></tr>"
    + "<tr><th>Verantwortlich</th><td>" + e(w.verantwortlich) + "</td><th>Termin</th><td>" + e(datum(w.termin)) + "</td></tr>"
    + "</tbody></table>";
  h += "<h3>Fehlerbeschreibung" + (w.fehlerart ? " · " + e(w.fehlerart) : "") + "</h3><p>" + zeilen(w.fehler) + "</p>";
  for (const d of ACHT_D) {
    const an = angekreuzt(w, d.s);
    h += "<h2>" + e(d.titel) + "</h2>";
    if (d.s === "d1" && !leer(w.team)) h += "<p>" + e(w.team) + "</p>";
    const teile = [];
    for (const [g, punkte] of d.gruppen) {
      const da = punkte.filter((pk) => an.includes(pk));
      if (da.length) teile.push((g ? "<b>" + e(g) + ":</b> " : "") + da.map((pk) => "☒ " + e(pk)).join("&nbsp;&nbsp; "));
    }
    // Früher angekreuzte Punkte, die es in der Liste nicht mehr gibt, nicht verlieren
    const alle = d.gruppen.flatMap((g) => g[1]);
    const rest = an.filter((pk) => !alle.includes(pk));
    if (rest.length) teile.push(rest.map((pk) => "☒ " + e(pk)).join("&nbsp;&nbsp; "));
    if (d.text && !leer(w[d.text])) teile.push(zeilen(w[d.text]));
    h += "<p>" + (teile.length ? teile.join("<br>") : "<span class='ck-grau'>–</span>") + "</p>";
  }
  if (!leer(w.kosten)) h += "<p><b>Kosten:</b> CHF " + e(alt.zahlText(Number(w.kosten))) + "</p>";
  h += "<table class='ck-unterschrift'><tbody><tr><th>Datum</th><td></td><th>Visum</th><td></td></tr></tbody></table>";
  return h;
}
