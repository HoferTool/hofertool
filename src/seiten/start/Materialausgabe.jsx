// =================================================================
//  STARTSEITE · Materialausgabe Extern
//  Steht über den Notizen (Wunsch Patrick 8. Oktober 2026). Man
//  schreibt einfach ins Feld, was rausgeht, und hakt es ab, wenn es
//  zurück ist. Wer und wann kommen beim Erfassen („raus“) und beim
//  Abhaken („rein“) von selbst dazu. Abgehakte Einträge verschwinden
//  aus der Karte und stehen in der Historie (Knopf mit der Uhr).
//  Neues kommt wie bei den Notizen über den Plus-Knopf: ein Fenster
//  mit „Was“ und „An wen“, raus geht es erst, wenn beide ausgefüllt
//  sind (Wunsch Patrick 8. Oktober 2026, keine dauernd sichtbaren Felder).
//  Tabelle: sql/materialausgabe.sql
// =================================================================
import { useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { Symbol } from "../../teile/zeichnen.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";

const PLUS = "M12 5v14M5 12h14";
// Uhr mit Pfeil zurück: Historie
const HISTORIE = "M3 12a9 9 0 1 0 3-6.7M3 4v4.5h4.5M12 7.5V12l3 2";
const PERSON = "full_name, email";
const FELDER = "*, raus:profiles!materialausgabe_raus_von_fkey(" + PERSON + "), "
  + "rein:profiles!materialausgabe_rein_von_fkey(" + PERSON + ")";

// Fehlt die Tabelle noch (SQL nicht ausgeführt), bleibt die Karte weg
function fehltTabelle(f) {
  const t = String((f && (f.message || f.code)) || "");
  return /materialausgabe|PGRST205|42P01|schema cache/i.test(t);
}

async function offeneLaden() {
  const { data, error } = await alt.zeitlimit(
    alt.db.from("materialausgabe").select(FELDER).is("rein_am", null)
      .order("raus_am", { ascending: true }).limit(50), 8000, "Materialausgabe");
  if (error) throw error;
  return data || [];
}

export default function Materialausgabe({ auffrischen }) {
  const { daten: liste, fehler, neu } = useDaten(offeneLaden, [auffrischen]);

  if (alt.istExtern()) return null;
  if (fehler && !liste) {
    if (fehltTabelle(fehler)) return <div id="db-materialausgabe" />;
    return <div id="db-materialausgabe"><div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div></div>;
  }
  if (!liste) return <div id="db-materialausgabe" />;

  const admin = alt.istAdmin();

  const erfassen = async () => {
    const w = await alt.dialogFelder({ titel: "Materialausgabe Extern",
      felder: [
        { name: "text", label: "Was geht raus?", typ: "textarea", pflicht: true },
        { name: "an_wen", label: "An wen?", pflicht: true }],
      bestaetigen: "Raus" });
    if (!w) return;
    const t = String(w.text || "").trim(), a = String(w.an_wen || "").trim();
    if (!t || !a) { alt.meldung("Bitte beides ausfüllen: was und an wen.", "warn"); return; }
    let { data, error } = await alt.db.from("materialausgabe")
      .insert({ text: t, an_wen: a, raus_von: alt.profil.id }).select("id");
    // Ohne die Spalte an_wen (sql/materialausgabe.sql noch nicht neu
    // ausgeführt) steht der Empfänger im Text, damit nichts verloren geht
    if (error && /an_wen/.test(String(error.message || ""))) {
      ({ data, error } = await alt.db.from("materialausgabe")
        .insert({ text: t + " → " + a, raus_von: alt.profil.id }).select("id"));
    }
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    if (Array.isArray(data) && data[0]) alt.merkeSchritt("Materialausgabe erfassen", alt.rueckWeg("materialausgabe", { id: data[0].id }));
    alt.meldung("Raus eingetragen."); neu();
  };

  return (
    <div id="db-materialausgabe">
      <section className="karte">
        <div className="karte__kopf"><h2>Materialausgabe Extern
          {liste.length > 0 && <> <span className="marke">{liste.length}</span></>}</h2>
          <div className="notiz-kopfrechts">
            {/* Plus wie bei den Notizen, kein dauernd sichtbares Feld (Wunsch Patrick 8. Oktober 2026) */}
            {alt.darfSchreiben() &&
              <button type="button" className="notizbuch-knopf" id="matausgabe-neu" aria-label="Neue Materialausgabe"
                title="Neue Materialausgabe" onClick={erfassen}><Symbol d={PLUS} /></button>}
            <button type="button" className="notizbuch-knopf" id="matausgabe-historie" aria-label="Historie"
              title="Historie" onClick={historieOeffnen}><Symbol d={HISTORIE} /></button>
          </div>
        </div>
        {liste.length
          ? <div className="notizen">
              {liste.map((m) => (
                <label className="notiz" key={m.id}>
                  <input type="checkbox" data-matrein={m.id} title="Zurück, abhaken"
                    onChange={(e) => abhaken(e, m, neu)} />
                  <span className="notiz__text">{m.text}
                    {m.an_wen && <> <span className="matausgabe-an">an {m.an_wen}</span></>}
                    <span className="klein"> · raus {alt.datumZeitKurz(m.raus_am)}
                      {m.raus ? ", " + alt.personName(m.raus) : ""}</span></span>
                  <button className="linkknopf" data-matbearb={m.id}
                    onClick={(e) => { e.preventDefault(); bearbeiten(m, neu); }}>Bearbeiten</button>
                  {admin &&
                    <button className="linkknopf linkknopf--gefahr" data-matweg={m.id}
                      onClick={async (e) => {
                        e.preventDefault();
                        const w = await alt.loeschen({ tabelle: "materialausgabe", id: m.id,
                          rueckText: "Löschen einer Materialausgabe", titel: "Eintrag löschen",
                          text: '"' + (m.text || "") + '" wird endgültig entfernt.' });
                        if (w) neu();
                      }}>Löschen</button>}
                </label>
              ))}
            </div>
          : <p className="hinweis">Nichts draussen.</p>}
      </section>
    </div>
  );
}

async function abhaken(e, m, neu) {
  e.target.checked = true;
  const { error } = await alt.db.from("materialausgabe")
    .update({ rein_am: new Date().toISOString(), rein_von: alt.profil.id }).eq("id", m.id);
  if (error) { e.target.checked = false; alt.meldung(alt.fehlertext(error), "fehler"); return; }
  alt.merkeSchritt("Materialausgabe abhaken",
    alt.rueckSetz("materialausgabe", { rein_am: null, rein_von: null }, { id: m.id }));
  alt.meldung("Zurück eingetragen.", "gut");
  neu();
}

async function bearbeiten(m, neu) {
  const w = await alt.dialogFelder({ titel: "Materialausgabe bearbeiten",
    felder: [{ name: "text", label: "Was ging raus?", typ: "textarea", wert: m.text, pflicht: true },
      { name: "an_wen", label: "An wen?", wert: m.an_wen || "", pflicht: true }],
    bestaetigen: "Speichern" });
  if (!w || (w.text === m.text && w.an_wen === (m.an_wen || ""))) return;
  try { await alt.aendernOhneUnbekannte("materialausgabe", { text: w.text, an_wen: w.an_wen }, "id", m.id); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  alt.merkeSchritt("Materialausgabe bearbeiten",
    alt.rueckSetz("materialausgabe", { text: m.text, an_wen: m.an_wen || null }, { id: m.id }));
  alt.meldung("Gespeichert."); neu();
}

// ---------- Historie ----------

async function historieOeffnen() {
  let liste;
  try {
    const { data, error } = await alt.zeitlimit(
      alt.db.from("materialausgabe").select(FELDER).order("raus_am", { ascending: false }).limit(1000),
      10000, "Materialausgabe Historie");
    if (error) throw error;
    liste = data || [];
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  fensterOeffnen((zu) => <Historie liste={liste} zu={zu} />);
}

// In der Historie mit Jahr: sie reicht über den Jahreswechsel
function mitJahr(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + String(d.getFullYear()).slice(2)
    + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function Historie({ liste, zu }) {
  const [suche, setSuche] = useState("");
  const s = suche.trim().toLowerCase();
  const gezeigt = s ? liste.filter((m) => String(m.text || "").toLowerCase().includes(s)
    || String(m.an_wen || "").toLowerCase().includes(s)
    || alt.personName(m.raus, "").toLowerCase().includes(s)
    || alt.personName(m.rein, "").toLowerCase().includes(s)) : liste;
  return (
    <div className="dialog dialog--breit matausgabe-historie">
      <div className="blatt__kopf"><h2>Materialausgabe Extern · Historie</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>
      {liste.length > 8 &&
        <input type="search" className="matausgabe-suche" placeholder="Suchen …" aria-label="Suchen"
          value={suche} onChange={(e) => setSuche(e.target.value)} />}
      {gezeigt.length
        ? <div className="matausgabe-rolle"><table className="tabelle">
            <thead><tr><th>Was</th><th>An wen</th><th>Raus</th><th>Wer raus</th><th>Rein</th><th>Wer rein</th></tr></thead>
            <tbody>{gezeigt.map((m) => (
              <tr key={m.id} className={m.rein_am ? "" : "matausgabe-offen"}>
                <td>{m.text}</td>
                <td>{m.an_wen || "—"}</td>
                <td className="klein nowrap">{mitJahr(m.raus_am)}</td>
                <td className="klein">{m.raus ? alt.personName(m.raus) : "—"}</td>
                <td className="klein nowrap">{m.rein_am ? mitJahr(m.rein_am) : <strong>noch draussen</strong>}</td>
                <td className="klein">{m.rein ? alt.personName(m.rein) : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        : <p className="hinweis">{liste.length ? "Nichts gefunden." : "Noch nichts eingetragen."}</p>}
    </div>
  );
}
