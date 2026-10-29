// =================================================================
//  SEITE EINER MASCHINE (seit 1.134.0, Wunsch Patrick 21. Oktober 2026)
//
//  Von oben nach unten:
//   - Allgemeine Infos: ein Feld für alles, mindestens vier Zeilen,
//     wächst mit; Shift + Enter macht eine neue Zeile, Enter speichert
//   - Knopf zum Pad Mode dieser Maschine
//   - Backup-Batterien: zuletzt gewechselt, nächster Wechsel (Vorschlag
//     zwei Jahre, frei verschiebbar), Hinweis für alle ein oder aus
//   - Wartungshistorie: wer, wann, was, mit Bildern und PDFs
//   - Bedienungsanleitungen und Unterlagen (Datei oder Link)
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { betrachter } from "../../teile/Betrachter.jsx";
import { UnterlagenListe } from "../../teile/Unterlagen.jsx";
import { infoLaden, infoSetzen, wartungLaden, anhangHochladen, plusJahre, batterieFaellig,
  batterieText, tageBis, fehltSql, SQL_FEHLT, BATTERIE_JAHRE, istPdf, istBild,
  BATTERIE_ARTEN, batterieArtTeilen, batterieArtZusammen, batterienText } from "../../daten/maschinenInfo.js";

const langDatum = (iso) => iso ? alt.kurzDatum(iso) + iso.slice(0, 4) : "";

function padZeigen(m) {
  alt.padOeffnen({ wo: "maschine", parkId: m.park_id, typId: m.type_id || "__ohne",
    typUebersprungen: false, maschineId: m.id, reiter: "uebersicht" });
}

export default function MaschineSeite({ m, typ, park }) {
  const darf = alt.darfSchreiben();
  const info = useDaten(() => infoLaden(m.id), [m.id]);
  const sqlFehlt = info.fehler && fehltSql(info.fehler);

  return (
    <div className="mseite-maschine" data-maschine={m.id}>
      <div className="mseite-kopf">
        <div>
          <h2>{m.machine_number || m.name}{m.machine_number && m.name !== m.machine_number
            ? <span className="mseite-kopf__name"> {m.name}</span> : null}</h2>
          <span className="klein">{[typ && "Typ " + typ, park && park.name].filter(Boolean).join(" · ")}</span>
        </div>
        <button className="knopf knopf--haupt" id="mseite-pad" onClick={() => padZeigen(m)}>Pad Mode öffnen</button>
      </div>
      {sqlFehlt && <div className="karte karte--fehler"><p>{SQL_FEHLT}</p></div>}
      {info.fehler && !sqlFehlt && <div className="karte karte--fehler"><p>{alt.fehlertext(info.fehler)}</p></div>}
      {!info.fehler && info.laedt && !info.daten && <div className="laedt">Wird geladen …</div>}
      {!info.fehler && (!info.laedt || info.daten !== null) && <>
        <InfoFeld m={m} info={info.daten} darf={darf} neu={info.neu} />
        <Batterien m={m} info={info.daten} darf={darf} neu={info.neu} />
      </>}
      {!sqlFehlt && <Wartung m={m} darf={darf} />}
      <section className="karte unterlagen unterlagen--seite">
        <UnterlagenListe m={m} typ={typ} />
      </section>
    </div>
  );
}

// ---------- Allgemeine Infos ----------

function InfoFeld({ m, info, darf, neu }) {
  const gespeichert = (info && info.info) || "";
  const [text, setText] = useState(gespeichert);
  const [stand, setStand] = useState("");
  const ref = useRef(null);
  // Was zuletzt gespeichert wurde oder gerade gespeichert wird: Enter
  // und das Verlassen des Felds kommen kurz nacheinander, nur einmal senden
  const zuletzt = useRef(gespeichert);
  useEffect(() => { zuletzt.current = gespeichert; }, [gespeichert]);
  // Kommt ein neuer Stand vom Server und man tippt nicht gerade, übernehmen
  useEffect(() => { if (document.activeElement !== ref.current) setText(gespeichert); }, [gespeichert]);
  // Wächst mit dem Text, mindestens vier Zeilen (rows)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }, [text]);

  const speichern = async () => {
    if (text === zuletzt.current) return;
    zuletzt.current = text;
    setStand("speichert …");
    try {
      await infoSetzen(m.id, { info: text.trim() ? text : null }, "Infos zu " + (m.machine_number || m.name));
      setStand("gespeichert");
      setTimeout(() => setStand(""), 2000);
      neu();
    } catch (f) { zuletzt.current = gespeichert; setStand(""); alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  return (
    <section className="karte mseite-info">
      <div className="karte__kopf">
        <h2>Allgemeine Infos</h2>
        {stand && <span className="klein mseite-stand">{stand}</span>}
      </div>
      <textarea ref={ref} id="mseite-info" rows={4} value={text} readOnly={!darf}
        placeholder={darf ? "Was man über diese Maschine wissen muss …" : "Noch nichts eingetragen."}
        onChange={(e) => setText(e.target.value)} onBlur={speichern}
        onKeyDown={(e) => {
          // Shift + Enter = neue Zeile, Enter = fertig (wie die Abrufinformation)
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); speichern(); e.currentTarget.blur(); }
        }} />
      {darf && <p className="klein">Shift + Enter für eine neue Zeile. Gespeichert wird mit Enter oder beim Verlassen des Felds.</p>}
      {info && info.geaendert_am && info.info && <WerWann id={info.geaendert_von} am={info.geaendert_am} text="Zuletzt geändert" />}
    </section>
  );
}

function WerWann({ id, am, text }) {
  const [name, setName] = useState(() => alt.personVoll(id));
  useEffect(() => { if (!name && id) alt.personenLaden().then(() => setName(alt.personVoll(id))); }, [id]);
  return <p className="klein mseite-werwann">{text} {am ? alt.datumZeitKurz(am) : ""}{name ? " · " + name : ""}</p>;
}

// ---------- Backup-Batterien ----------

function Batterien({ m, info, darf, neu }) {
  const wer = m.machine_number || m.name;
  // Der Schalter springt sofort um, gespeichert wird dahinter
  const [hinweisJetzt, setHinweisJetzt] = useState(null);
  useEffect(() => setHinweisJetzt(null), [info]);
  const hinweis = hinweisJetzt !== null ? hinweisJetzt : (info ? info.batterie_hinweis !== false : true);
  const faellig = batterieFaellig(info);
  const t = tageBis(info && info.batterie_faellig);

  const setzen = async (felder, rueckText) => {
    try { await infoSetzen(m.id, felder, rueckText); neu(); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  // Heute gewechselt: Termin in zwei Jahren und ein Eintrag in der Wartung
  const gewechselt = async () => {
    const heute = alt.isoDatum(new Date());
    const w = await alt.dialogFelder({ titel: "Backup-Batterien gewechselt",
      felder: [
        { name: "am", label: "Gewechselt am", typ: "date", wert: heute, pflicht: true },
        { name: "naechst", label: "Nächster Wechsel", typ: "date", wert: plusJahre(heute, BATTERIE_JAHRE),
          hinweis: "Vorschlag: in " + BATTERIE_JAHRE + " Jahren. Kann man später verschieben." },
        { name: "notiz", label: "Notiz für die Wartung", typ: "textarea", platzhalter: "kann leer bleiben" }],
      bestaetigen: "Speichern" });
    if (!w) return;
    const naechst = w.naechst || plusJahre(w.am, BATTERIE_JAHRE);
    try {
      await infoSetzen(m.id, { batterie_gewechselt: w.am, batterie_faellig: naechst }, "Batterien " + wer);
      const ein = await alt.db.from("maschinen_wartung").insert({ machine_id: m.id, datum: w.am, erstellt_von: alt.meineProfilId(),
        text: "Backup-Batterien gewechselt" + (w.notiz ? "\n" + w.notiz : ""), anhaenge: [] }).select("id");
      if (!ein.error && ein.data && ein.data[0]) {
        alt.merkeSchritt("Wartung " + wer, alt.rueckWeg("maschinen_wartung", { id: ein.data[0].id }));
      }
      alt.meldung("Gespeichert. Nächster Wechsel am " + langDatum(naechst) + ".", "gut");
      neu();
      window.dispatchEvent(new Event("hofer:wartung"));
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  // Termin, dazu wie viele und welche Batterien (nur wenn der Hinweis an ist)
  const terminAendern = async () => {
    const teile = batterieArtTeilen(info && info.batterie_art);
    const w = await alt.dialogFelder({ titel: "Backup-Batterien",
      felder: [
        { name: "zuletzt", label: "Zuletzt gewechselt", typ: "date", wert: (info && info.batterie_gewechselt) || "" },
        { name: "naechst", label: "Nächster Wechsel", typ: "date", wert: (info && info.batterie_faellig) || "",
          hinweis: "Leer lassen, wenn es keinen Termin gibt." },
        ...(hinweis ? [
          { name: "anzahl", label: "Anzahl Batterien", ziffern: true, wert: (info && info.batterie_anzahl) || "",
            platzhalter: "z. B. 3" },
          { name: "art", label: "Art", wert: teile.art,
            auswahl: [["", "— nicht angegeben —"]].concat(BATTERIE_ARTEN.map((a) => [a, a]), [["andere", "Andere …"]]) },
          { name: "zusatz", label: "Genaue Bezeichnung", wert: teile.zusatz,
            platzhalter: "bei „Andere“ oder als Zusatz, z. B. Varta 4020", hinweis: "kann leer bleiben" },
        ] : [])],
      bestaetigen: "Speichern" });
    if (!w) return;
    const naechst = w.naechst || (w.zuletzt && !(info && info.batterie_faellig) ? plusJahre(w.zuletzt, BATTERIE_JAHRE) : null);
    const felder = { batterie_gewechselt: w.zuletzt || null, batterie_faellig: naechst || null };
    if (hinweis) {
      const n = parseInt(w.anzahl, 10);
      felder.batterie_anzahl = n > 0 ? n : null;
      felder.batterie_art = batterieArtZusammen(w.art, w.zusatz);
    }
    setzen(felder, "Backup-Batterien " + wer);
  };

  return (
    <section className={"karte mseite-batterie" + (faellig && hinweis ? " karte--warnung" : "")} id="mseite-batterie">
      <div className="karte__kopf">
        <h2>{faellig && hinweis ? "⚠ " : ""}Backup-Batterien</h2>
        {darf && <label className="mseite-schalter" title="Hinweis auf der Startseite, wenn der Wechsel fällig ist">
          <input type="checkbox" id="mseite-batterie-hinweis" checked={hinweis}
            onChange={(e) => { const ein = e.target.checked; setHinweisJetzt(ein);
              setzen({ batterie_hinweis: ein }, (ein ? "Hinweis ein " : "Hinweis aus ") + wer); }} />
          Hinweis für alle
        </label>}
      </div>
      <dl className="mseite-batterie__werte">
        <dt>Zuletzt gewechselt</dt><dd>{info && info.batterie_gewechselt ? langDatum(info.batterie_gewechselt) : "—"}</dd>
        <dt>Nächster Wechsel</dt>
        <dd className={t !== null && t < 0 ? "mseite-rot" : ""}>{info && info.batterie_faellig
          ? langDatum(info.batterie_faellig) + " · " + (t < 0 ? "überfällig" : t <= 30 ? batterieText(info) : "in " + t + " Tagen")
          : "kein Termin"}</dd>
        {hinweis && <><dt>Batterien</dt>
          <dd id="mseite-batterie-art">{batterienText(info) || <span className="klein">nicht angegeben</span>}</dd></>}
      </dl>
      {!hinweis && <p className="klein">Hinweis ausgeschaltet: Diese Maschine erscheint nicht auf der Startseite.</p>}
      {darf && <div className="karte__aktionen">
        <button className="knopf knopf--haupt" id="mseite-batterie-gewechselt" onClick={gewechselt}>Batterien gewechselt</button>
        <button className="knopf" id="mseite-batterie-termin" onClick={terminAendern}>Ändern</button>
      </div>}
    </section>
  );
}

// ---------- Wartungshistorie ----------

function Wartung({ m, darf }) {
  const [stoss, setStoss] = useState(0);
  const liste = useDaten(() => wartungLaden(m.id), [m.id, stoss]);
  useEffect(() => {
    const f = () => setStoss((x) => x + 1);
    window.addEventListener("hofer:wartung", f);
    return () => window.removeEventListener("hofer:wartung", f);
  }, []);
  const neu = () => setStoss((x) => x + 1);
  const ich = alt.meineProfilId();
  const [namen, setNamen] = useState(0);
  useEffect(() => { alt.personenLaden().then(() => setNamen((x) => x + 1)); }, []);

  const loeschen = async (e) => {
    const ja = await alt.nachfragen({ titel: "Eintrag löschen",
      text: "Soll der Eintrag vom " + langDatum(e.datum) + " gelöscht werden?", bestaetigen: "Löschen", gefahr: true });
    if (!ja) return;
    const vorher = await alt.rueckSichern("maschinen_wartung", { id: e.id });
    const { error } = await alt.db.from("maschinen_wartung").delete().eq("id", e.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    // Dateien bleiben liegen, damit Rückgängig sie wieder zeigt
    alt.merkeSchritt("Wartungseintrag löschen", alt.rueckRein("maschinen_wartung", vorher));
    neu();
  };

  return (
    <section className="karte mseite-wartung" id="mseite-wartung">
      <div className="karte__kopf">
        <h2>Wartungshistorie</h2>
        {darf && <button className="knopf knopf--haupt" id="wartung-neu"
          onClick={() => eintragOeffnen(m, null, neu)}>+ Eintrag</button>}
      </div>
      {liste.fehler && <p className="fehlertext">{fehltSql(liste.fehler) ? SQL_FEHLT : alt.fehlertext(liste.fehler)}</p>}
      {!liste.daten && !liste.fehler && <p className="klein">Lädt …</p>}
      {liste.daten && !liste.daten.length && <p className="hinweis">Noch keine Einträge.
        {darf ? " Mit „+ Eintrag“ festhalten, was gemacht wurde." : ""}</p>}
      {liste.daten && liste.daten.length > 0 && <ul className="wartung-liste" data-namen={namen}>
        {liste.daten.map((e) => (
          <li key={e.id} className="wartung-eintrag" data-wartung={e.id}>
            <div className="wartung-eintrag__kopf">
              <b>{langDatum(e.datum)}</b>
              <span className="klein">{alt.personVoll(e.erstellt_von) || "unbekannt"}</span>
              {darf && (e.erstellt_von === ich || alt.istAdmin()) && <span className="wartung-eintrag__knoepfe">
                <button className="knopf knopf--klein" data-wartung-aendern={e.id}
                  onClick={() => eintragOeffnen(m, e, neu)}>Ändern</button>
                <button className="knopf knopf--klein knopf--gefahr-leise" data-wartung-weg={e.id}
                  onClick={() => loeschen(e)}>Löschen</button>
              </span>}
            </div>
            <div className="wartung-eintrag__text">{e.text}</div>
            {(e.anhaenge || []).length > 0 && <Anhaenge liste={e.anhaenge} />}
          </li>))}
      </ul>}
    </section>
  );
}

function anhangZeigen(a) {
  if (istPdf(a)) return betrachter(a.url, a.name || "PDF", true);
  if (istBild(a)) return betrachter(a.url, a.name || "Bild", false, "bild");
  window.open(a.url, "_blank", "noopener");
}

function Anhaenge({ liste, weg }) {
  return (
    <div className="wartung-anhaenge">
      {liste.map((a, i) => (
        <span key={a.url + i} className="wartung-anhang">
          <button className="wartung-anhang__knopf" title={a.name} data-anhang={i} onClick={() => anhangZeigen(a)}>
            {istBild(a) ? <img src={a.url} alt={a.name || "Bild"} loading="lazy" />
              : <span className="wartung-anhang__pdf">{istPdf(a) ? "PDF" : "DATEI"}</span>}
            <span className="wartung-anhang__name">{a.name}</span>
          </button>
          {weg && <button className="wartung-anhang__weg" aria-label="Anhang entfernen" title="entfernen"
            onClick={() => weg(i)}>×</button>}
        </span>))}
    </div>
  );
}

// Fenster für einen neuen oder bestehenden Eintrag. Bilder und PDFs
// gehen gleich beim Wählen hoch, gespeichert wird der Eintrag erst mit
// „Speichern“.
function eintragOeffnen(m, e, fertig) {
  fensterOeffnen((zu) => <EintragFenster m={m} e={e} zu={zu} fertig={fertig} />, null, "wartung-huelle");
}

function EintragFenster({ m, e, zu, fertig }) {
  const [datum, setDatum] = useState((e && e.datum) || alt.isoDatum(new Date()));
  const [text, setText] = useState((e && e.text) || "");
  const [anhaenge, setAnhaenge] = useState((e && e.anhaenge) || []);
  const [laedt, setLaedt] = useState(0);
  const [sendet, setSendet] = useState(false);
  const wahl = useRef(null);
  const kamera = useRef(null);

  const hochladen = async (dateien) => {
    for (const d of dateien) {
      if (!(/^image\//.test(d.type) || /pdf/.test(d.type) || /\.pdf$/i.test(d.name))) {
        alt.meldung(d.name + ": nur Bilder und PDFs.", "warn"); continue;
      }
      setLaedt((x) => x + 1);
      try {
        const a = await anhangHochladen(m.id, d);
        setAnhaenge((l) => l.concat([a]));
      } catch (f) { alt.meldung(d.name + ": " + alt.fehlertext(f), "fehler"); }
      setLaedt((x) => x - 1);
    }
  };

  const speichern = async () => {
    if (!text.trim()) { alt.meldung("Was wurde gemacht? Bitte kurz beschreiben.", "warn"); return; }
    if (laedt) { alt.meldung("Bitte warten, bis alles hochgeladen ist.", "warn"); return; }
    setSendet(true);
    const daten = { datum: datum || alt.isoDatum(new Date()), text: text.trim(), anhaenge };
    const wer = m.machine_number || m.name;
    try {
      if (e) {
        const vorher = await alt.rueckSichern("maschinen_wartung", { id: e.id });
        const r = await alt.db.from("maschinen_wartung").update({ ...daten, geaendert_am: new Date().toISOString() }).eq("id", e.id);
        if (r.error) throw r.error;
        alt.merkeSchritt("Wartung ändern " + wer, alt.rueckRein("maschinen_wartung", vorher));
      } else {
        const r = await alt.db.from("maschinen_wartung").insert({ machine_id: m.id, erstellt_von: alt.meineProfilId(), ...daten }).select("id");
        if (r.error) throw r.error;
        const id = ((r.data || [])[0] || {}).id;
        if (id) alt.merkeSchritt("Wartung " + wer, alt.rueckWeg("maschinen_wartung", { id }));
      }
      alt.meldung("Gespeichert.", "gut");
      zu();
      fertig();
    } catch (f) { setSendet(false); alt.meldung(fehltSql(f) ? SQL_FEHLT : alt.fehlertext(f), "fehler"); }
  };

  return (
    <div className="dialog dialog--breit wartung-fenster" role="dialog" aria-modal="true" id="wartung-fenster">
      <h2>{e ? "Wartung ändern" : "Wartung erfassen"} · {m.machine_number || m.name}</h2>
      <label className="feld"><span>Wann</span>
        <input type="date" id="wartung-datum" value={datum} onChange={(x) => setDatum(x.target.value)} /></label>
      <label className="feld"><span>Was wurde gemacht?</span>
        <textarea id="wartung-text" rows={5} value={text} data-fokus=""
          placeholder="z. B. Öl gewechselt, Filter ersetzt, Spindel geprüft …"
          onChange={(x) => setText(x.target.value)} /></label>
      <div className="feld"><span>Bilder und PDFs</span>
        {anhaenge.length > 0 && <Anhaenge liste={anhaenge}
          weg={(i) => setAnhaenge((l) => l.filter((_, k) => k !== i))} />}
        <div className="wartung-fenster__knoepfe">
          <button className="knopf" id="wartung-datei" onClick={() => wahl.current.click()}>Datei wählen</button>
          <button className="knopf" id="wartung-foto" onClick={() => kamera.current.click()}>Foto aufnehmen</button>
          {laedt > 0 && <span className="klein">lädt hoch …</span>}
        </div>
        <input ref={wahl} type="file" multiple hidden id="wartung-dateien" accept="image/*,application/pdf,.pdf"
          onChange={(x) => { const d = [...x.target.files]; x.target.value = ""; hochladen(d); }} />
        <input ref={kamera} type="file" hidden accept="image/*" capture="environment"
          onChange={(x) => { const d = [...x.target.files]; x.target.value = ""; hochladen(d); }} />
      </div>
      <p className="klein">Wer: {alt.personVoll((e && e.erstellt_von) || alt.meineProfilId()) || "du"}</p>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" data-nein="" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" data-ja="" id="wartung-speichern" disabled={sendet}
          onClick={speichern}>Speichern</button>
      </div>
    </div>
  );
}
