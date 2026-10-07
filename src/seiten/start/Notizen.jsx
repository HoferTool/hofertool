// =================================================================
//  STARTSEITE · Notizen
//  Jeder darf jede Notiz bearbeiten. Abhaken fragt nach und lässt
//  sich rückgängig machen; Löschen dürfen nur Administratoren.
//  Rechts oben das Buch: öffnet die Notizbücher (src/notizbuch/).
// =================================================================
import { alt, useDaten } from "../../bruecke.jsx";
import { notizbuecherOeffnen, BUCH } from "../../notizbuch/Notizbuecher.jsx";
import { Symbol } from "../../teile/zeichnen.jsx";

const PLUS = "M12 5v14M5 12h14";
import { materialBestellungLesen, materialAusNotizEntfernen } from "../../daten/materialBestellung.js";

export default function Notizen({ auffrischen }) {
  const { daten: todos, fehler, neu } = useDaten(() => alt.ladeTodos(), [auffrischen]);

  if (fehler && !todos) {
    return <div id="db-notizen"><div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div></div>;
  }
  if (!todos) return <div id="db-notizen" />;

  const heute = alt.isoDatum(new Date());
  const admin = alt.istAdmin();

  return (
    <div id="db-notizen">
      <section className="karte">
        <div className="karte__kopf"><h2>Notizen</h2>
          <div className="notiz-kopfrechts">
            {/* Nur ein Plus statt „+ Neue Notiz“ (Wunsch Patrick 7. Oktober 2026) */}
            {alt.darfSchreiben() &&
              <button type="button" className="notizbuch-knopf" id="notiz-neu" aria-label="Neue Notiz"
                title="Neue Notiz" onClick={() => neueNotiz(neu)}><Symbol d={PLUS} /></button>}
            {/* Notizbücher: nur ein Buch als Zeichen (Wunsch Patrick 7. Oktober 2026) */}
            {!alt.istExtern() &&
              <button type="button" className="notizbuch-knopf" id="notizbuch-knopf" aria-label="Notizbücher"
                title="Notizbücher" onClick={notizbuecherOeffnen}><Symbol d={BUCH} /></button>}
          </div>
        </div>
        {todos.length
          ? <div className="notizen">
              {todos.map((t) => (
                <label className="notiz" key={t.id}>
                  <input type="checkbox" data-erledigt={t.id} onChange={(e) => abhaken(e, t, neu)} />
                  <span className="notiz__text">{t.text}
                    <span className="klein"> von {alt.personName(t.profiles)}</span></span>
                  {t.due_date &&
                    <span className={"notiz__frist" + (t.due_date < heute ? " notiz__frist--spaet" : "")}>
                      {alt.kurzDatum(t.due_date)}</span>}
                  <button className="linkknopf" data-notizbearb={t.id}
                    onClick={(e) => { e.preventDefault(); bearbeiten(t, neu); }}>Bearbeiten</button>
                  {admin &&
                    <button className="linkknopf linkknopf--gefahr" data-nweg={t.id}
                      onClick={async (e) => {
                        e.preventDefault();
                        const w = await alt.loeschen({ tabelle: "todos", id: t.id, rueckText: "Löschen einer Notiz",
                          titel: "Notiz löschen", text: '"' + (t.text || "") + '" wird endgültig entfernt.' });
                        if (w) neu();
                      }}>Löschen</button>}
                </label>
              ))}
            </div>
          : <p className="hinweis">Keine offenen Notizen.</p>}
      </section>
    </div>
  );
}

async function neueNotiz(neu) {
  const w = await alt.dialogFelder({ titel: "Neue Notiz",
    felder: [
      { name: "text", label: "Was ist zu tun?", typ: "textarea", pflicht: true },
      { name: "frist", label: "Bis wann", typ: "date" }],
    bestaetigen: "Speichern" });
  if (!w) return;
  const { data, error } = await alt.db.from("todos")
    .insert({ text: w.text, due_date: w.frist || null }).select("id");
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  if (Array.isArray(data) && data[0]) alt.merkeSchritt("Neue Notiz", alt.rueckWeg("todos", { id: data[0].id }));
  alt.meldung("Notiz gespeichert."); neu(); materialInsAuftrag(w.text);
}

async function bearbeiten(t, neu) {
  const w = await alt.dialogFelder({ titel: "Notiz bearbeiten",
    felder: [
      { name: "text", label: "Was ist zu tun?", typ: "textarea", wert: t.text, pflicht: true },
      { name: "frist", label: "Bis wann", typ: "date", wert: t.due_date || "" }],
    bestaetigen: "Speichern" });
  if (!w) return;
  const { error } = await alt.db.from("todos")
    .update({ text: w.text, due_date: w.frist || null }).eq("id", t.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  alt.merkeSchritt("Notiz bearbeiten",
    alt.rueckSetz("todos", { text: t.text, due_date: t.due_date || null }, { id: t.id }));
  alt.meldung("Gespeichert."); neu(); if (w.text !== t.text) materialInsAuftrag(w.text);
}

async function abhaken(e, t, neu) {
  e.target.checked = false;   // erst nach Bestätigung wirklich abhaken
  const ok = await alt.nachfragen({ titel: "Notiz erledigt?",
    text: "Ist diese Aufgabe wirklich abgeschlossen?", bestaetigen: "Ja, erledigt" });
  if (!ok) return;
  const db = alt.db;
  const { error } = await db.from("todos").update({
    is_done: true, done_at: new Date().toISOString(), done_by: alt.profil.id,
  }).eq("id", t.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  alt.merkeSchritt("Notiz abhaken",
    alt.rueckSetz("todos", { is_done: false, done_at: null, done_by: null }, { id: t.id }));
  alt.meldung("Erledigt.");
  neu();
}

// Steht in einer Notiz eine HOCO Nr. und eine Material-Bestellung,
// etwa „10844-0049 Mat BE: Metalix 2025007893 500kg 24.09.26“, kommt
// sie rüber in den nächsten geplanten Auftrag dieser Nummer: Menge und
// Liefertermin werden eingetragen. In seine Notiz kommt sie nicht, und
// stand sie dort schon, fällt sie weg: sonst stünde alles doppelt da.
async function materialInsAuftrag(text) {
  if (!alt.darfSchreiben()) return;
  const hoco = String(text || "").match(/(?:^|\D)(\d{5})\s?-\s?(\d{4})(?!\d)/);
  const be = materialBestellungLesen(text);
  if (!hoco || !be) return;
  const nr = hoco[1] + "-" + hoco[2];
  try {
    const { data, error } = await alt.db.from("jobs")
      .select("id, plan_status, planned_from, plan_note")
      .eq("job_number", nr).neq("plan_status", "fertig")
      .order("planned_from", { ascending: true });
    if (error) throw error;
    // Der nächste, der noch nicht läuft; sonst der laufende
    const offen = data || [];
    const ziel = offen.find((j) => j.plan_status === "geplant") || offen[0];
    if (!ziel) {
      alt.meldung("Material-Bestellung erkannt, aber kein offener Auftrag " + nr + " auf der Planwand.", "warn");
      return;
    }
    const notiz = String(ziel.plan_note || "");
    const notizNeu = materialAusNotizEntfernen(notiz, be.mengeText, be.termin);
    const daten = {
      material_liefertermin: be.termin || undefined,
      material_menge: be.mengeText || undefined,
      material_ok: be.mengeText ? true : undefined,
      plan_note: notizNeu !== notiz ? notizNeu : undefined,
    };
    Object.keys(daten).forEach((k) => daten[k] === undefined && delete daten[k]);
    const r = await alt.aendernOhneUnbekannte("jobs", daten, "id", ziel.id);
    if (!r.ok) throw r.error || new Error("Speichern ging nicht");
    alt.meldung("Material für Auftrag " + nr + " eingetragen: "
      + [be.menge, be.termin].filter(Boolean).join(", ") + ".", "gut");
  } catch (f) {
    alt.fehlerMerken && alt.fehlerMerken("Material aus Notiz", alt.fehlertext(f));
    alt.meldung("Material konnte nicht in den Auftrag " + nr + " übernommen werden: " + alt.fehlertext(f), "fehler");
  }
}
