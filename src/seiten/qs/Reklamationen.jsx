// =================================================================
//  REKLAMATIONSMANAGEMENT, Reiter der Seite Qualitätssicherung
//  (seit 1.746.0, Wunsch Patrick 23. November 2026: „bei QS einen
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

// Die Abschnitte wie in Patricks 8D-Report (seit 1.748.0, nach dem
// Bericht zu Faulhaber 200079578): 1 Problembeschreibung, 2 Fehlerart,
// 3 Fehlerort, 4 Fehlerursache(n), 5 Sofortmassnahme(n), 6 Geplante und
// 7 Eingeführte Abstellmassnahme(n), 8 Bemerkung. Meist sind es dieselben
// Gründe und Massnahmen (Patrick: „viel mit Häkchen setzen“): je
// Abschnitt Punkte zum Ankreuzen, gespeichert in reklamationen.achtd[s],
// dazu das freie Feld „Anderes / Ergänzung“ (Spalte in `text`).
// Die geplanten Massnahmen haben je ein Gegenstück für „eingeführt“
// (MASSNAHMEN), damit „Wie geplant“ Abschnitt 7 in einem Zug ankreuzt.
export const MASSNAHMEN = [
  ["Teile müssen an der Maschine besser überwacht werden", "Teile werden in Zukunft besser überwacht"],
  ["Endkontrolle verschärfen", "Endkontrolle wurde angepasst"],
  ["Dokumente anpassen", "Dokumente wurden angepasst"],
  ["Prüfintervall verkürzen", "Prüfintervall wurde verkürzt"],
  ["Prüfplan ergänzen", "Prüfplan wurde ergänzt"],
  ["NC-Programm korrigieren", "NC-Programm wurde korrigiert"],
  ["Werkzeug / Standzeit anpassen", "Werkzeug / Standzeit wurde angepasst"],
  ["Einrichtblatt ergänzen", "Einrichtblatt wurde ergänzt"],
  ["Messmittel ersetzen / kalibrieren", "Messmittel wurde ersetzt / kalibriert"],
  ["Maschine reparieren / einstellen", "Maschine wurde repariert / eingestellt"],
  ["Verpackung anpassen", "Verpackung wurde angepasst"],
  ["Mitarbeiter informieren", "Alle nötigen Mitarbeiter wurden informiert"],
];
export const ACHT_D = [
  { s: "fa", nr: 2, titel: "Fehlerart / Fehler", text: "fehlerart", gruppen: [["", [
    "Massfehler", "Form- / Lagefehler", "Oberflächenfehler / Kratzer / Schläge", "Grat", "Gewindefehler",
    "Falsches Material", "Teile vermischt / falsches Teil", "Mengenfehler", "Verschmutzung / Späne / Öl",
    "Verpackungs- / Transportschaden", "Dokumente / Zeugnis fehlen"]]] },
  { s: "ort", nr: 3, titel: "Fehlerort", text: "fehlerort", gruppen: [["", [
    "Decolletage", "Nachbearbeitung", "Waschen / Reinigen", "Endkontrolle", "Verpackung / Versand", "Lager",
    "Externe Bearbeitung (Härten, Beschichten …)", "Rohmaterial / Lieferant", "Transport"]]] },
  { s: "d4", nr: 4, titel: "Fehlerursache(n)", text: "ursache", gruppen: [
    ["Maschine / Prozess", ["Drehfehler am Rohteil", "Werkzeugverschleiss", "Werkzeugbruch", "Spannzange / Führungsbüchse",
      "Maschine ungenau / Warmlauf", "Abstechen / Länge ungenau"]],
    ["Mensch", ["Falsch eingestellt / korrigiert", "Unachtsamkeit", "Fehlende Einweisung"]],
    ["Material", ["Rohmaterial fehlerhaft", "Falsches Material / Charge verwechselt"]],
    ["Methode", ["NC-Programm fehlerhaft", "Zeichnung oder Index falsch gelesen", "Einrichtblatt unvollständig"]],
    ["Umfeld", ["Späne / Verschmutzung", "Teile vermischt", "Verpackung ungeeignet"]],
    ["Nicht entdeckt", ["Überwachungsfehler an der Maschine", "Merkmal nicht im Prüfplan", "Prüfintervall zu gross",
      "Stichprobe zu klein", "Messmittel ungeeignet / Messfehler", "Endkontrolle ungenügend"]]] },
  { s: "d3", nr: 5, titel: "Sofortmassnahme(n)", text: "sofort", gruppen: [["", [
    "Schlechtteil zur Gegenprüfung erhalten", "Fehler erkannt", "Ursachenanalyse", "Absprache im Team",
    "Verbesserungsmassnahmen definieren", "Lagerbestand gesperrt und geprüft", "Laufende Produktion geprüft",
    "Teile beim Kunden sortiert", "Teile zurückgenommen", "Ersatzlieferung", "Kunde informiert"]]] },
  { s: "d5", nr: 6, titel: "Geplante Abstellmassnahme(n)", text: "korrektur", gruppen: [["", MASSNAHMEN.map((m) => m[0])]] },
  { s: "d7", nr: 7, titel: "Eingeführte Abstellmassnahme(n)", text: "vorbeugung", gruppen: [["",
    MASSNAHMEN.map((m) => m[1]).concat("Wirksamkeit bei der nächsten Lieferung geprüft")]] },
];
// Kopf wie im Bericht, gespeichert in reklamationen.kopf
const KOPF = ["bearbeiter", "tel", "mail", "adresse", "berichtsdatum", "zeichnung", "index", "kunden_art",
  "bestellt", "retour", "gut", "lieferschein", "lieferdatum", "auftrag"];
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
  (p.data || []).forEach((x) => { personen[x.id] = alt.personName(x); mails[x.id] = x.email || ""; });
  // Kunden und Lieferanten aus den Stammdaten des Test ERP (seit 1.748.0): wer
  // dort nichts lesen darf oder noch nichts erfasst hat, tippt von Hand
  try {
    const s = await alt.zeitlimit(alt.db.from("erp_partner").select("id, art, nr, name, daten").eq("aktiv", true), 8000, "Stammdaten");
    stamm.length = 0;
    if (!s.error) (s.data || []).forEach((x) => stamm.push(x));
  } catch (f) { /* ohne Stammdaten */ }
  return { liste: r.data || [], personen };
}

// Mailadresse je Person, für den Bearbeiter im Kopf des Berichts
const mails = {};
// Kunden und Lieferanten aus den Stammdaten (erp_partner)
const stamm = [];
const stammArt = (art) => (art === "lieferant" ? "lieferant" : "kunde");
// Nach Nummer (10841, auch aus der HOCO Nr.) oder Name, ohne Gross/klein
function stammFinden(art, text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  const l = stamm.filter((p) => p.art === stammArt(art));
  return l.find((p) => String(p.nr) === t) || l.find((p) => String(p.name || "").trim().toLowerCase() === t) || null;
}
function stammAdresse(p) {
  const a = (p.daten && p.daten.adresse) || {};
  return [a.name2, a.strasse, [a.plz, a.ort].filter(Boolean).join(" "), a.land && a.land !== "CH" ? a.land : ""]
    .filter((x) => !leer(x)).join("\n");
}
function stammKontakt(p) {
  const k = ((p.daten && p.daten.kontakte) || [])[0];
  return k ? k.name || "" : "";
}
// Telefon aus Einstellungen → Mein Konto, früher je Gerät unter rk_tel gemerkt
const meinTelefon = () => String((alt.einstellungWert && (alt.einstellungWert("telefon", "") || alt.einstellungWert("rk_tel", ""))) || "");
const fehlerKurz = (r) => [...angekreuzt(r, "fa"), r.fehlerart].filter((x) => !leer(x)).join(", ");

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
      zeile: [r.hoco_nr, STAND_KURZ[r.status], fehlerKurz(r) || r.fehler].filter(Boolean).join(" · "),
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
      r.fehlerart, r.fehler, r.verantwortlich, r.ursache, r.fehlerort, r.bemerkung, Object.values(r.kopf || {}).join(" "), Object.values(r.achtd || {}).flat().join(" "), r.sofort, r.korrektur, r.vorbeugung, STAND_KURZ[r.status], ART_KURZ[r.art]]);
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
                <span className="rk-fehler">{fehlerKurz(r) ? <b>{fehlerKurz(r)}: </b> : null}{r.fehler || ""}</span>
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
  "status", "verantwortlich", "termin", "sofort", "ursache", "korrektur", "vorbeugung", "wirksamkeit", "fehlerort", "bemerkung"];
const FELDER_ZAHL = ["menge_geliefert", "menge_reklamiert", "kosten"];

function RkFenster({ r, zu, nachher, personen, alle }) {
  const darf = alt.darfSchreiben() && !alt.istExtern();
  const [w, setW] = useState(() => {
    const ich = alt.meineProfilId && alt.meineProfilId();
    // Neue Reklamation: Bearbeiter ist, wer sie erfasst; Telefon merkt sich das Konto
    const kopf = (r && r.kopf && typeof r.kopf === "object") ? { ...r.kopf } : {
      bearbeiter: (ich && personen[ich]) || "", mail: (ich && mails[ich]) || "",
      tel: meinTelefon(),
    };
    return { art: "kunde", status: "offen", eingang: heute(), ...(r || {}), kopf };
  });
  const [neueDateien, setNeue] = useState([]); // vor dem Speichern gewählte Dateien
  const [speichert, setSpeichert] = useState(false);
  const [hinweis, setHinweis] = useState("");
  const feld = useRef(null);
  const setze = (n, v) => setW((x) => ({ ...x, [n]: v }));
  const setzeKopf = (n, v) => setW((x) => ({ ...x, kopf: { ...(x.kopf || {}), [n]: v } }));
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
  // Name, Adresse und Kontakt aus den Stammdaten in leere Felder
  const stammEinsetzen = (n, p, gefuellt) => {
    if (leer(n.partner) || String(n.partner).trim() === String(p.nr)) { n.partner = p.name; gefuellt.push(n.art === "lieferant" ? "Lieferant" : "Kunde"); }
    const adr = stammAdresse(p);
    if (adr && leer((n.kopf || {}).adresse)) { n.kopf = { ...(n.kopf || {}), adresse: adr }; gefuellt.push("Adresse"); }
    const kt = stammKontakt(p);
    if (kt && leer(n.kontakt)) { n.kontakt = kt; gefuellt.push("Kontaktperson"); }
  };
  const partnerNachschlagen = (text) => {
    const p = stammFinden(w.art, text);
    if (!p) return;
    const gefuellt = [];
    setW((x) => { const n = { ...x }; stammEinsetzen(n, p, gefuellt); return n; });
    setTimeout(() => setHinweis(gefuellt.length ? "Aus den Stammdaten ausgefüllt: " + [...new Set(gefuellt)].join(", ") + "." : ""), 0);
  };
  const hocoNachschlagen = async (nr) => {
    nr = String(nr || "").trim();
    if (!nr) return;
    try {
      const [t, j] = await Promise.all([
        alt.db.from("hoco_parts").select("bezeichnung").eq("hoco_nr", nr).maybeSingle(),
        alt.db.from("jobs").select("job_number, fa_nr, customer_number, target_quantity, drawing_url, wbg_url").eq("job_number", nr)
          .order("planned_from", { ascending: false, nullsFirst: false }).limit(1),
      ]);
      const auftrag = (j.data || [])[0];
      const gefuellt = [];
      setW((x) => {
        const n = { ...x };
        if (leer(x.teil) && t.data && t.data.bezeichnung) { n.teil = t.data.bezeichnung; gefuellt.push("Teil"); }
        if (leer(x.fa_nr) && auftrag && auftrag.fa_nr) { n.fa_nr = auftrag.fa_nr; gefuellt.push("FA Nr."); }
        if (leer(x.partner) && x.art === "kunde") {
          // Kundennummer aus dem Auftrag, sonst vorne aus der HOCO Nr. (10841-0009 → 10841)
          const knr = (auftrag && auftrag.customer_number) ? String(auftrag.customer_number) : (nr.match(/^(\d{5})-/) || [])[1];
          const p = knr && stammFinden("kunde", knr);
          if (p) { stammEinsetzen(n, p, gefuellt); }
          else if (auftrag && auftrag.customer_number) { n.partner = String(auftrag.customer_number); gefuellt.push("Kunde"); }
        }
        return n;
      });
      // Zeichnungs-Nr. wie im Auftragsfenster (aus Dateiname oder WBG)
      if (auftrag) {
        try {
          const { zeichnungNrHolen } = await import("../../daten/zeichnungNr.js");
          const z = await zeichnungNrHolen(auftrag);
          if (z) setW((x) => (leer((x.kopf || {}).zeichnung) ? { ...x, kopf: { ...(x.kopf || {}), zeichnung: z } } : x));
          if (z) gefuellt.push("Zeichnungs-Nr.");
        } catch (f) { /* dann von Hand */ }
      }
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
      d.achtd = { ...(w.achtd && typeof w.achtd === "object" ? w.achtd : {}) };
      d.kopf = {};
      for (const f of KOPF) { const v = (w.kopf || {})[f]; if (!leer(v)) d.kopf[f] = String(v).trim(); }
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
      const { achtdPdf } = await import("./achtdPdf.js");
      const blob = await achtdPdf({ ...w, nr: s.nr }, "8D-Report " + s.nr);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "8D-Bericht " + s.nr + ".pdf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } catch (f) { alt.meldung("Bericht ging nicht: " + alt.fehlertext(f), "fehler"); }
  };

  const K = (n, label, extra = {}) => (
    <label className={"feld" + (extra.breit ? " rk-breit" : "")}>
      <span>{label}</span>
      {extra.zeilen
        ? <textarea id={"rk-k-" + n} rows={extra.zeilen} value={(w.kopf || {})[n] || ""} placeholder={extra.ph || ""} disabled={!darf}
            onChange={(e) => setzeKopf(n, e.target.value)} />
        : <input id={"rk-k-" + n} type={extra.typ || "text"} value={(w.kopf || {})[n] || ""} placeholder={extra.ph || ""}
            disabled={!darf} list={extra.liste} inputMode={extra.zahl ? "decimal" : undefined}
            onChange={(e) => setzeKopf(n, e.target.value)} />}
    </label>
  );
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
      const dazu = angekreuzt(x, d.s);
      a[d.s] = Array.from(new Set(angekreuzt(y, d.s).concat(dazu)));
    }
    alt.meldung("Häkchen von " + x.nr + " übernommen. Bitte prüfen.", "gut");
    return { ...y, achtd: a };
  });
  const wieGeplant = () => setW((y) => {
    const a = { ...(y.achtd || {}) };
    const dazu = angekreuzt(y, "d5").map((pk) => (MASSNAHMEN.find((m) => m[0] === pk) || [])[1]).filter(Boolean);
    a.d7 = Array.from(new Set(angekreuzt(y, "d7").concat(dazu)));
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
            <datalist id="rk-personen">{namen.map((f) => <option key={f} value={f} />)}</datalist>

      <div className="rk-art-wahl">
        {ARTEN.map(([a, t]) => (
          <button key={a} type="button" className={"rk-chip" + (w.art === a ? " aktiv" : "")} data-rkfart={a}
            disabled={!darf} onClick={() => setze("art", a)}>{t}</button>))}
      </div>

      <section className="rk-abschnitt">
        <h3>Beanstandung</h3>
        <div className="rk-raster">
          {w.art !== "intern" && T("partner", w.art === "kunde" ? "Kunde *" : "Lieferant *", { fokus: !r, ph: w.art === "kunde" ? "Firma oder Kunden-Nr." : "Lieferant", liste: "rk-stamm", blur: (e) => partnerNachschlagen(e.target.value) })}
          <datalist id="rk-stamm">{stamm.filter((p) => p.art === stammArt(w.art)).map((p) => <option key={p.id} value={p.name}>{p.nr}</option>)}</datalist>
          {w.art !== "intern" && T("kontakt", "Kontaktperson")}
          {w.art !== "intern" && T("ref_partner", w.art === "kunde" ? "Beanstand.-Nr. Kunde" : "Bestell-Nr. / Lieferschein")}
          {T("eingang", "Eröffnet am", { typ: "date" })}
          {w.art !== "intern" && K("adresse", "Adresse " + (w.art === "kunde" ? "Kunde" : "Lieferant"), { zeilen: 3, breit: true, ph: "Strasse\nPLZ Ort" })}
          {K("bearbeiter", "Bearbeiter", { liste: "rk-personen" })}
          {K("tel", "Tel. Bearbeiter")}
          {darf && !r && leer((w.kopf || {}).tel) && !meinTelefon() && <p className="feldhinweis rk-breit" id="rk-tel-fehlt">
            Dein Telefon fehlt noch: unter Einstellungen → Allgemein → Mein Konto eintragen, dann kommt es jedes Mal von selbst.</p>}
          {K("mail", "Mail Bearbeiter")}
          {K("berichtsdatum", "Berichtsdatum", { typ: "date" })}
        </div>
      </section>

      <section className="rk-abschnitt">
        <h3>Artikel und Mengen</h3>
        <div className="rk-raster">
          {T("hoco_nr", "Artikelnummer HOCO", { ph: "10841-0009", blur: (e) => hocoNachschlagen(e.target.value), fokus: !r && w.art === "intern" })}
          {T("teil", "Artikelbezeichnung", { breit: true })}
          {K("zeichnung", "Zeichnungs-Nr.")}
          {K("index", "Index")}
          {K("kunden_art", "Kunden Art. Nr.")}
          {K("bestellt", "Bestellte Menge", { zahl: true })}
          {T("menge_geliefert", "Gelieferte Menge", { zahl: true })}
          {T("menge_reklamiert", "Beanstandungsmenge", { zahl: true })}
          {K("retour", "Retournierte Menge", { zahl: true })}
          {K("gut", "Gutteile", { zahl: true })}
          {K("lieferschein", "Lieferschein Nr.")}
          {K("lieferdatum", "Lieferdatum", { typ: "date" })}
          {K("auftrag", "Auftrags Nr.")}
          {T("fa_nr", "Fabrikationsauftrag")}
        </div>
        {hinweis && <p className="feldhinweis" id="rk-hinweis">{hinweis}</p>}
        {!!frueher.length && <div className="rk-frueher" id="rk-frueher">
          <span>Schon reklamiert:</span>
          {frueher.map((x) => <span key={x.id} className="rk-frueher__eintrag">
            <b>{x.nr}</b> {datum(x.eingang)} {fehlerKurz(x)}
            {darf && <button type="button" className="knopf knopf--klein" data-rkuebernehmen={x.nr}
              onClick={() => uebernehmen(x)}>Häkchen übernehmen</button>}
          </span>)}
        </div>}
      </section>

      <section className="rk-abschnitt">
        <h3>1 · Problembeschreibung *</h3>
        {T("fehler", "", { zeilen: 4, breit: true, ph: "Was hat der Kunde gefunden? Mass, Stelle, wie viele …" })}
      </section>

      {ACHT_D.map((d) => (
        <section key={d.s} className="rk-abschnitt rk-8d" data-rk8d={d.s}>
          <h3>{d.nr} · {d.titel}{angekreuzt(w, d.s).length ? <small className="rk-8d-zahl"> · {angekreuzt(w, d.s).length} angekreuzt</small> : null}
            {d.s === "d7" && darf && <button type="button" className="knopf knopf--klein rk-wiegeplant" id="rk-wiegeplant"
              disabled={!angekreuzt(w, "d5").length} onClick={wieGeplant}>Wie geplant ✓</button>}</h3>
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
          {d.text && T(d.text, "Anderes / Ergänzung", { zeilen: 2, breit: true })}
        </section>))}

      <section className="rk-abschnitt">
        <h3>8 · Bemerkung</h3>
        {T("bemerkung", "", { zeilen: 2, breit: true })}
      </section>

      <section className="rk-abschnitt">
        <h3>Bearbeitung (intern, nicht im Bericht)</h3>
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
        <button className="knopf" id="rk-bericht" disabled={speichert || (!r && !darf)} onClick={bericht}>8D-Report (PDF)</button>
        {darf && r && <button className="knopf knopf--gefahr" id="rk-loeschen" onClick={loeschen}>Löschen</button>}
      </div>
    </div>
  );
}

