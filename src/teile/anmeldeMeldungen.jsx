// =================================================================
//  MELDUNGEN BEIM ANMELDEN (seit 1.44.0, Wunsch Patrick 13. Oktober
//  2026: „eine Meldung, die jeder Nutzer nach dem Anmelden zuerst
//  quittiert, bevor er weitermacht; um neue Funktionen zu erklären;
//  auch in den Einstellungen“)
//
//  Admins schreiben Meldungen unter Einstellungen → Allgemein. Nach
//  jeder Anmeldung (und jedem Start) holt die App die eingeschalteten
//  Meldungen, die diese Person noch nicht gelesen hat, und legt sie der
//  Reihe nach über alles. Weiter geht es nur mit „Gelesen“ (oder
//  Abmelden); Escape und Klick daneben tun bewusst nichts. Jede Meldung
//  kommt pro Person einmal (anmelde_quittungen).
//
//  Nicht für Externe (neue Funktionen nur auf Nachfrage), nicht für das
//  Dienstkonto und nicht für Gerätekonten („Andere Nutzer“ wie Planwand
//  und Pad Mode): Dort meldet sich keine Person an, die Meldung wäre
//  nach dem ersten Tipp für alle weg, die am Gerät arbeiten.
//
//  Ohne sql/anmelde-meldungen.sql fehlen die Tabellen: dann zeigt die
//  App einfach nichts, und die Einstellungen sagen, was fehlt.
// =================================================================
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { wiederOeffner } from "./wiederherstellen.js";
import { FettText } from "./FettText.jsx";

const TABELLE = "anmelde_meldungen";
const QUITTUNGEN = "anmelde_quittungen";

// Wer Meldungen bekommt: eine echte Person, kein Gerät, kein Externer
export function bekommtMeldungen(p) {
  return !!p && p.role !== "extern" && p.role !== "dienst" && !p.andere_nutzer && p.is_active !== false;
}

function datumText(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear();
}

function tabelleFehlt(f) {
  const t = String((f && (f.message || f.details || f.hint)) || "");
  return (f && (f.code === "42P01" || f.code === "PGRST205")) || /anmelde_(meldungen|quittungen)/.test(t);
}

// ---------- Nach dem Anmelden ----------

let sperre = null;   // { zu } solange das Feld offen ist

export async function meldungenNachAnmeldung() {
  try {
    const p = alt.profil;
    if (!bekommtMeldungen(p) || alt.istArchiv() || alt.istAndererNutzer()) return;
    if (sperre) return;
    const db = alt.db;
    const [m, q] = await Promise.all([
      alt.zeitlimit(db.from(TABELLE).select("id, titel, text, erstellt").eq("aktiv", true)
        .order("erstellt", { ascending: true }), 10000, "Meldungen"),
      alt.zeitlimit(db.from(QUITTUNGEN).select("meldung_id").eq("user_id", p.id), 10000, "Quittungen"),
    ]);
    if (m.error || q.error) return;
    const gelesen = new Set((q.data || []).map((x) => x.meldung_id));
    const offen = (m.data || []).filter((x) => !gelesen.has(x.id));
    // Inzwischen abgemeldet oder jemand anderes angemeldet?
    if (!offen.length || alt.profil !== p) return;
    sperreZeigen(offen, p.id);
  } catch (f) {
    console.warn("Meldungen:", f && f.message);
  }
}

export function meldungenWeg() {
  if (sperre) sperre.zu();
}

function sperreZeigen(liste, userId) {
  const huelle = document.createElement("div");
  huelle.className = "anmeldemeldung-huelle";
  document.body.appendChild(huelle);
  const wurzel = createRoot(huelle);
  // Escape gehört hier niemandem: weder Fenster darunter schliessen noch
  // „Abmelden?“ fragen. Die Meldung geht nur mit „Gelesen“ weg.
  const taste = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  window.addEventListener("keydown", taste, true);
  const zu = () => {
    window.removeEventListener("keydown", taste, true);
    huelle.remove();
    queueMicrotask(() => wurzel.unmount());
    sperre = null;
  };
  sperre = { zu };
  wurzel.render(<Sperre liste={liste} userId={userId} zu={zu} />);
}

function Sperre({ liste, userId, zu }) {
  const [nr, setNr] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  const m = liste[nr];
  const gelesen = async () => {
    setLaeuft(true);
    try {
      const { error } = await alt.zeitlimit(
        alt.db.from(QUITTUNGEN).insert({ meldung_id: m.id, user_id: userId }), 10000, "Quittieren");
      // Schon quittiert (etwa im zweiten Tab): zählt als gelesen
      if (error && error.code !== "23505") throw error;
    } catch (f) {
      setLaeuft(false);
      alt.meldung("Nicht gespeichert: " + alt.fehlertext(f), "fehler");
      return;
    }
    setLaeuft(false);
    if (nr + 1 < liste.length) setNr(nr + 1);
    else zu();
  };
  // Die Frage „Abmelden?“ ist ein gewöhnliches Fenster: solange sie
  // offen ist, liegt die Meldung darunter, bei „Abbrechen“ wieder oben.
  const abmelden = async (e) => {
    if (!window.abmeldenFragen) return;
    const huelle = e.currentTarget.closest(".anmeldemeldung-huelle");
    if (huelle) huelle.classList.add("anmeldemeldung-huelle--unten");
    try { await window.abmeldenFragen(); } finally {
      if (huelle) huelle.classList.remove("anmeldemeldung-huelle--unten");
    }
  };
  return (
    <div className="dialog anmeldemeldung" role="alertdialog" aria-modal="true"
      aria-labelledby="am-titel" key={m.id}>
      <div className="anmeldemeldung__kopf">
        <span className="anmeldemeldung__marke">Neu im Hofer Tool</span>
        <span className="anmeldemeldung__datum">
          {datumText(m.erstellt)}{liste.length > 1 ? " · " + (nr + 1) + " von " + liste.length : ""}</span>
      </div>
      <h2 id="am-titel">{m.titel}</h2>
      <div className="anmeldemeldung__text"><FettText text={m.text} /></div>
      <div className="dialog__knoepfe anmeldemeldung__knoepfe">
        <button className="knopf knopf--still" onClick={abmelden}>Abmelden</button>
        <button className="knopf knopf--haupt" id="am-gelesen" onClick={gelesen} disabled={laeuft} autoFocus>
          {nr + 1 < liste.length ? "Gelesen, weiter" : "Gelesen"}</button>
      </div>
    </div>
  );
}

// ---------- Admins: Meldungen verwalten (Einstellungen → Allgemein) ----------

async function laden() {
  const db = alt.db;
  const [m, q, p] = await Promise.all([
    db.from(TABELLE).select("*").order("erstellt", { ascending: false }),
    db.from(QUITTUNGEN).select("meldung_id, user_id, am"),
    db.from("profiles").select("*"),
  ]);
  if (m.error) throw m.error;
  if (q.error) throw q.error;
  return { meldungen: m.data || [], quittungen: q.data || [], personen: (p.data || []) };
}

export async function meldungenVerwalten() {
  let daten;
  try {
    daten = await alt.zeitlimit(laden(), 15000, "Meldungen");
  } catch (f) {
    alt.meldung(tabelleFehlt(f)
      ? "In der Datenbank fehlt noch sql/anmelde-meldungen.sql."
      : alt.fehlertext(f), "fehler");
    return;
  }
  fensterOeffnen((zu) => <Verwalten anfang={daten} zu={zu} />, null, null, { art: "anmeldemeldungen" });
}

wiederOeffner("anmeldemeldungen", () => meldungenVerwalten());

async function bearbeitenDialog(m) {
  const felder = [
    { name: "titel", label: "Titel", wert: m ? m.titel : "", pflicht: true,
      platzhalter: "z. B. Neu: Letzten Eintrag löschen" },
    { name: "text", label: "Text", typ: "textarea", fett: true, wert: m ? m.text : "",
      platzhalter: "Was ist neu, wo findet man es, wie geht es?" },
  ];
  if (m) {
    felder.push({ name: "neu", label: "Wer sie schon gelesen hat", wert: "nein",
      auswahl: [["nein", "Muss sie nicht nochmals lesen"], ["ja", "Bekommt sie nochmals"]] });
  }
  return alt.dialogFelder({
    titel: m ? "Meldung bearbeiten" : "Neue Meldung",
    text: m ? null : "Erscheint bei allen nach dem nächsten Anmelden, bis sie auf „Gelesen“ tippen.",
    felder,
    bestaetigen: m ? "Speichern" : "Veröffentlichen",
  });
}

function Verwalten({ anfang, zu }) {
  const [daten, setDaten] = useState(anfang);
  const [offen, setOffen] = useState(null);   // id der Meldung, deren Leser gezeigt werden
  const neuLaden = async () => {
    try { setDaten(await laden()); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  const empfaenger = daten.personen.filter(bekommtMeldungen);
  const name = (id) => alt.personName(daten.personen.find((x) => x.id === id), "unbekannt");

  const neu = async () => {
    const e = await bearbeitenDialog(null);
    if (!e) return;
    const { error } = await alt.db.from(TABELLE).insert({ titel: e.titel.trim(), text: e.text || "" });
    if (error) { alt.meldung("Nicht gespeichert: " + alt.fehlertext(error), "fehler"); return; }
    alt.meldung("Veröffentlicht. Alle sehen sie beim nächsten Anmelden.", "gut");
    neuLaden();
  };
  const bearbeiten = async (m) => {
    const e = await bearbeitenDialog(m);
    if (!e) return;
    const { error } = await alt.db.from(TABELLE)
      .update({ titel: e.titel.trim(), text: e.text || "", geaendert: new Date().toISOString() }).eq("id", m.id);
    if (error) { alt.meldung("Nicht gespeichert: " + alt.fehlertext(error), "fehler"); return; }
    if (e.neu === "ja") {
      const r = await alt.db.from(QUITTUNGEN).delete().eq("meldung_id", m.id);
      if (r.error) alt.meldung("Gespeichert, aber nicht zurückgesetzt: " + alt.fehlertext(r.error), "warn");
      else alt.meldung("Gespeichert. Alle bekommen sie nochmals.", "gut");
    } else alt.meldung("Gespeichert.", "gut");
    neuLaden();
  };
  const umschalten = async (m) => {
    const { error } = await alt.db.from(TABELLE).update({ aktiv: !m.aktiv }).eq("id", m.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    neuLaden();
  };
  const weg = async (m) => {
    const ok = await alt.nachfragen({ titel: "Meldung löschen",
      text: "„" + m.titel + "“ wird gelöscht, mit allen Quittungen.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const { error } = await alt.db.from(TABELLE).delete().eq("id", m.id);
    if (error) { alt.meldung("Nicht gelöscht: " + alt.fehlertext(error), "fehler"); return; }
    alt.meldung("Gelöscht.");
    neuLaden();
  };
  const vorschau = (m) => {
    // Dasselbe Feld wie nach dem Anmelden, quittiert aber nichts
    fensterOeffnen((schliessen) => (
      <div className="dialog anmeldemeldung">
        <div className="anmeldemeldung__kopf">
          <span className="anmeldemeldung__marke">Neu im Hofer Tool</span>
          <span className="anmeldemeldung__datum">{datumText(m.erstellt)} · Vorschau</span>
        </div>
        <h2>{m.titel}</h2>
        <div className="anmeldemeldung__text"><FettText text={m.text} /></div>
        <div className="dialog__knoepfe anmeldemeldung__knoepfe">
          <button className="knopf knopf--haupt" data-zu="" onClick={schliessen}>Schliessen</button>
        </div>
      </div>
    ));
  };

  return (
    <div className="dialog dialog--breit anmeldemeldungen">
      <div className="blatt__kopf"><h2>Meldungen beim Anmelden</h2>
        <button className="knopf knopf--klein" id="am-neu" onClick={neu}>Neue Meldung …</button>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>
      <p className="hinweis">Jede eingeschaltete Meldung erscheint bei jeder Person einmal nach dem Anmelden,
        bis sie auf „Gelesen“ tippt. Nicht für Externe und Gerätekonten.</p>
      {daten.meldungen.length === 0 && <p className="hinweis">Noch keine Meldung.</p>}
      <ul className="anmeldemeldungen__liste">
        {daten.meldungen.map((m) => {
          const q = daten.quittungen.filter((x) => x.meldung_id === m.id);
          const gelesen = new Set(q.map((x) => x.user_id));
          const fehlt = empfaenger.filter((x) => !gelesen.has(x.id));
          const zahl = empfaenger.filter((x) => gelesen.has(x.id)).length;
          return (
            <li key={m.id} className={"anmeldemeldungen__eintrag" + (m.aktiv ? "" : " aus")} data-meldung={m.id}>
              <div className="anmeldemeldungen__zeile">
                <div className="anmeldemeldungen__was">
                  <strong>{m.titel}</strong>
                  <span className="klein">{datumText(m.erstellt)}{m.aktiv ? "" : " · ausgeschaltet"}</span>
                </div>
                <button className="linkknopf" data-leser={m.id}
                  onClick={() => setOffen(offen === m.id ? null : m.id)}>
                  Gelesen: {zahl} von {empfaenger.length}</button>
              </div>
              <div className="anmeldemeldungen__knoepfe">
                <button className="knopf knopf--klein knopf--still" onClick={() => vorschau(m)}>Vorschau</button>
                <button className="knopf knopf--klein knopf--still" data-ambearbeiten={m.id} onClick={() => bearbeiten(m)}>Bearbeiten</button>
                <button className="knopf knopf--klein knopf--still" data-amaktiv={m.id} onClick={() => umschalten(m)}>
                  {m.aktiv ? "Ausschalten" : "Einschalten"}</button>
                <button className="linkknopf linkknopf--gefahr" data-amweg={m.id} onClick={() => weg(m)}>Löschen</button>
              </div>
              {offen === m.id && (
                <div className="anmeldemeldungen__leser">
                  <div><strong>Gelesen</strong>
                    {q.length ? <ul>{q.slice().sort((a, b) => (a.am < b.am ? 1 : -1)).map((x) => (
                      <li key={x.user_id}>{name(x.user_id)} <span className="klein">{datumText(x.am)}</span></li>))}</ul>
                      : <p className="klein">Noch niemand.</p>}</div>
                  <div><strong>Noch nicht</strong>
                    {fehlt.length ? <ul>{fehlt.map((x) => <li key={x.id}>{alt.personName(x, x.email)}</li>)}</ul>
                      : <p className="klein">Alle haben sie gelesen.</p>}</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
