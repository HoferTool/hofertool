// =================================================================
//  HOFER-NC-PRO → NC-Programme speichern und öffnen
//  Seit 1.385.0 (Wunsch Patrick 4. November 2026: „die NC Programme
//  sollen auch hier abgespeichert werden können“). Für Bohren / Fräsen
//  und Entgraten, gleich wie die Konturen: unter einem Namen (z. B.
//  HOCO Nr.) mit den Eingaben und dem damals erzeugten Programm, für
//  alle ausser Externen und Dienst an jedem Gerät. Tabelle
//  „nc_programme“ aus sql/nc-programme.sql, Spalte „art“ trennt die
//  Reiter. Ohne Tabelle bleibt es am eigenen Konto.
// =================================================================
import { useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";

const TABELLE = "nc_programme";
const ohneTabelle = (e) => e && /nc_programme|relation|schema cache|PGRST205|42P01/i.test((e.message || "") + (e.code || ""));

async function leuteNamen(ids) {
  const leute = {};
  const u = [...new Set(ids.filter(Boolean))];
  if (!u.length) return leute;
  const { data } = await alt.db.from("profiles").select("id, full_name, email").in("id", u);
  (data || []).forEach((p) => { leute[p.id] = p.full_name || p.email || ""; });
  return leute;
}

function ListeFenster({ titel, kurz, zeilen, zu, oeffnen, loeschen }) {
  const [suche, setSuche] = useState("");
  const [liste, setListe] = useState(zeilen);
  const w = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const passend = liste.filter((z) => w.every((x) => (z.name + " " + (z.wer || "")).toLowerCase().includes(x)));
  return (
    <div className="dialog kt-liste-fenster"><h2>{titel}</h2>
      <input type="text" data-fokus placeholder="Suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} id={kurz + "-suche"} />
      <div className="kt-gespeichert">
        {passend.length === 0 && <p className="klein">Nichts gefunden.</p>}
        {passend.map((z) => (
          <div key={z.id} className="kt-gesp" data-ncgesp={z.name}>
            <button className="kt-gesp__name" onClick={() => { oeffnen(z); zu(); }}>
              <b>{z.name}</b>
              <span className="klein">{z.geaendert_am ? alt.datumZeitKurz(z.geaendert_am) : ""}{z.wer ? " · " + z.wer : ""}</span>
            </button>
            <button className="kt-weg" title="Löschen" data-ncgespweg={z.name}
              onClick={async () => { if (await loeschen(z)) setListe((l) => l.filter((x) => x.id !== z.id)); }}>✕</button>
          </div>
        ))}
      </div>
      <div className="dialog__knoepfe"><button className="knopf knopf--still" onClick={zu}>Schliessen</button></div>
    </div>
  );
}

// art: "bohren" oder "entgraten"; daten: was gespeichert wird; laden(daten)
// setzt die Eingaben; gespeichert/setGespeichert hält der Reiter, damit
// der Stand auch nach einem Reiterwechsel bleibt.
export function NcAblage({ art, kurz, wort, daten, nc, laden, gespeichert, setGespeichert }) {
  const kontoName = "ncliste_" + art;
  const kontoListe = () => { try { return JSON.parse(alt.einstellungWert(kontoName, "[]")) || []; } catch (e) { return []; } };
  const name = gespeichert ? gespeichert.name : "";

  const sichern = async () => {
    const w = await alt.dialogFelder({ titel: wort + " speichern",
      text: "Gespeichert werden die Eingaben mit dem jetzt erzeugten NC-Programm, für alle sichtbar.",
      felder: [{ name: "name", label: "Name, z. B. HOCO Nr.", pflicht: true, wert: name }], bestaetigen: "Speichern" });
    if (!w) return;
    const neu = w.name.trim();
    const { data: da, error: fl } = await alt.db.from(TABELLE).select("id, name, geaendert_am, geaendert_von")
      .eq("art", art).ilike("name", neu.replace(/[%_\\]/g, "\\$&")).maybeSingle();
    if (fl && ohneTabelle(fl)) {
      const liste = kontoListe().filter((x) => x.name !== neu);
      const zeile = { name: neu, daten, nc, geaendert_am: new Date().toISOString() };
      alt.einstellungSetzenWert(kontoName, JSON.stringify([...liste, zeile]));
      setGespeichert({ ...zeile, id: "konto", konto: true });
      alt.meldung("„" + neu + "“ an deinem Konto gespeichert.", "gut");
      return;
    }
    // Wie bei der Kontur: hat jemand anderes inzwischen dasselbe
    // gespeichert, fragt Speichern nach, statt still zu überschreiben
    const vonAnderem = da && gespeichert && gespeichert.id === da.id && gespeichert.geaendert_am !== da.geaendert_am;
    if (da && (!gespeichert || gespeichert.id !== da.id || vonAnderem)) {
      let wer = "";
      if (vonAnderem) { const l = await leuteNamen([da.geaendert_von]); wer = l[da.geaendert_von] || "Jemand"; }
      const text = vonAnderem
        ? wer + " hat „" + da.name + "“ am " + alt.datumZeitKurz(da.geaendert_am) + " gespeichert, nachdem du es geöffnet hast. Mit deiner Fassung überschreiben?"
        : "„" + da.name + "“ gibt es schon. Überschreiben?";
      if (!(await alt.nachfragen({ titel: vonAnderem ? "Inzwischen geändert" : "Schon vorhanden", text, bestaetigen: "Überschreiben" }))) return;
    }
    const zeile = { art, name: neu, daten, nc };
    const r = da ? await alt.db.from(TABELLE).update(zeile).eq("id", da.id).select("id, name, nc, geaendert_am").single()
      : await alt.db.from(TABELLE).insert(zeile).select("id, name, nc, geaendert_am").single();
    if (r.error) { alt.meldung("Speichern ging nicht: " + (r.error.message || r.error), "fehler"); return; }
    setGespeichert(r.data);
    alt.meldung("„" + neu + "“ mit NC-Programm gespeichert.", "gut");
  };

  const oeffnen = async () => {
    const { data, error } = await alt.db.from(TABELLE).select("id, name, daten, nc, geaendert_am, geaendert_von")
      .eq("art", art).order("geaendert_am", { ascending: false }).limit(500);
    let zeilen;
    if (error) {
      if (!ohneTabelle(error)) { alt.meldung("Laden ging nicht: " + (error.message || error), "fehler"); return; }
      zeilen = kontoListe().map((x, i) => ({ ...x, id: "konto" + i, konto: true }));
    } else {
      const leute = await leuteNamen(data.map((x) => x.geaendert_von));
      zeilen = data.map((x) => ({ ...x, wer: leute[x.geaendert_von] || "" }));
    }
    if (!zeilen.length) { alt.meldung("Noch nichts gespeichert.", "warn"); return; }
    fensterOeffnen((zu) => (
      <ListeFenster titel={"Gespeichert: " + wort} kurz={kurz} zeilen={zeilen} zu={zu}
        oeffnen={(z) => { laden(z.daten || {}); setGespeichert(z); }}
        loeschen={async (z) => {
          if (!(await alt.nachfragen({ titel: "Löschen", text: "„" + z.name + "“ löschen?", bestaetigen: "Löschen", gefahr: true }))) return false;
          if (z.konto) {
            alt.einstellungSetzenWert(kontoName, JSON.stringify(kontoListe().filter((x) => x.name !== z.name)));
          } else {
            const r = await alt.db.from(TABELLE).delete().eq("id", z.id);
            if (r.error) { alt.meldung("Löschen ging nicht: " + (r.error.message || r.error), "fehler"); return false; }
          }
          if (gespeichert && gespeichert.id === z.id) setGespeichert(null);
          return true;
        }} />
    ));
  };

  return (
    <div className="kt-dateien nc-ablage">
      {name && <span className="klein" id={kurz + "-name"}>{name}</span>}
      {name && <button className="linkknopf" id={kurz + "-neu"} onClick={() => setGespeichert(null)}>Neu</button>}
      <button className="linkknopf" id={kurz + "-oeffnen"} onClick={oeffnen}>Öffnen</button>
      <button className="linkknopf" id={kurz + "-speichern"} onClick={sichern}>Speichern</button>
    </div>
  );
}

// Unter dem Code: gespeichert oder seither geändert
export function NcStand({ kurz, gespeichert, nc }) {
  if (!gespeichert) return null;
  if (gespeichert.nc === nc) {
    return <p className="klein" id={kurz + "-stand"}>Gespeichert als „{gespeichert.name}“{gespeichert.geaendert_am ? " am " + alt.datumZeitKurz(gespeichert.geaendert_am) : ""}.</p>;
  }
  return (
    <p className="kt-fehler" id={kurz + "-stand"}>Geändert seit dem Speichern als „{gespeichert.name}“. Nochmals „Speichern“, damit das neue Programm gilt.
      {" "}<button className="linkknopf" onClick={() => fensterOeffnen((zu) => (
        <div className="dialog"><h2>Gespeichertes Programm „{gespeichert.name}“</h2>
          <pre className="gcode">{gespeichert.nc}</pre>
          <div className="dialog__knoepfe"><button className="knopf knopf--still" onClick={zu}>Schliessen</button></div></div>))}>
        Gespeichertes ansehen</button></p>
  );
}
