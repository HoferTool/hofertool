// =================================================================
//  STARTSEITE · Notizen
//  Jeder darf jede Notiz bearbeiten. Abhaken fragt nach und lässt
//  sich rückgängig machen; Löschen dürfen nur Administratoren.
// =================================================================
import { alt, useDaten } from "../../bruecke.jsx";

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
          {alt.darfSchreiben() &&
            <button className="linkknopf" id="notiz-neu" onClick={() => neueNotiz(neu)}>+ Neue Notiz</button>}
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
                        const w = await alt.loeschen({ tabelle: "todos", id: t.id,
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
  const { error } = await alt.db.from("todos").insert({ text: w.text, due_date: w.frist || null });
  if (error) alt.meldung(alt.fehlertext(error), "fehler");
  else { alt.meldung("Notiz gespeichert."); neu(); }
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
  if (error) alt.meldung(alt.fehlertext(error), "fehler");
  else { alt.meldung("Gespeichert."); neu(); }
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
  alt.merkeSchritt("Notiz abhaken", async () => {
    await db.from("todos").update({ is_done: false, done_at: null, done_by: null }).eq("id", t.id);
    neu();
  });
  alt.meldung("Erledigt.");
  neu();
}
