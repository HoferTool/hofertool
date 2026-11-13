// =================================================================
//  EINSTELLUNGEN → WARTUNG → VORLAGEN (seit 1.353.0)
//  Bilder und PDFs für die Wartung als Vorlagen ablegen, gegliedert nur
//  in Langdreher, Kurzdreher und Extern (Wunsch Patrick 3. November
//  2026: „die Wartungsvorlagen sollen bei den Einstellungen abgelegt
//  werden können, unterscheide nur Langdreher, Kurzdreher, Extern“).
//  Zugeteilt wird an der Maschine mit „Vorlage wählen“ (Pad und
//  Einstellungen → Wartung → Zuteilen): nur diese Maschine, ganzer Park
//  oder Typ, mit eigenem Termin. Eine Vorlage löschen lässt die
//  Zuteilungen stehen (sie haben die Adresse der Datei selbst), darum
//  bleibt auch die Datei in der Ablage liegen.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { GRUPPEN, gruppeText, VORLAGEN, vorlagenLaden, Vorschau, ansehen, ablageName, endungVon,
  geaendert, istText, textSchreiben } from "../pad/Wartung.jsx";

// Seit 1.505.1 zuerst „Alle“: alle sehen alle Vorlagen (Wunsch Patrick
// 12. November 2026: „Wartungsvorlagen sollen alle alle sehen“)
let merkGruppe = "alle";
const gruppeOder = (g) => (g && g !== "alle" ? g : "langdreher");

export default function WartungVorlagen() {
  const [gruppe, setGruppe] = useState(merkGruppe);
  const [vorlagen, setVorlagen] = useState(null);
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState("");
  const wahl = useRef(null);
  const darf = alt.darfSchreiben() && !alt.istExtern();

  const laden = () => vorlagenLaden()
    .then((v) => { setVorlagen(v); setFehler(""); })
    .catch((f) => {
      const t = alt.fehlertext(f);
      setFehler(/wartung_vorlagen/.test(t) ? "Die Vorlagen sind in der Datenbank noch nicht eingerichtet (sql/wartung-vorlagen.sql)." : t);
      setVorlagen([]);
    });
  useEffect(() => { laden(); window.addEventListener("hofer:wartung", laden);
    return () => window.removeEventListener("hofer:wartung", laden); }, []);

  const gruppeWaehlen = (g) => { merkGruppe = g; setGruppe(g); };

  const hochladen = async (dateien) => {
    for (const datei of dateien) {
      const pdf = datei.type === "application/pdf" || endungVon(datei.name) === "pdf";
      if (!pdf && !/^image\//.test(datei.type || "")) { alt.meldung(datei.name + ": nur Bilder oder PDFs.", "warn"); continue; }
      const w = await alt.dialogFelder({
        titel: "Vorlage ablegen",
        felder: [
          { name: "titel", label: "Was ist zu tun?", pflicht: true,
            wert: datei.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() },
          { name: "gruppe", label: "Gruppe", wert: gruppeOder(gruppe), auswahl: GRUPPEN },
        ],
        bestaetigen: "Ablegen" });
      if (!w) continue;
      setLaedt(datei.name);
      try {
        const pfad = "wartung-vorlagen/" + ablageName(datei.name);
        const up = await alt.db.storage.from("zeichnungen").upload(pfad, datei,
          { contentType: datei.type || (pdf ? "application/pdf" : "application/octet-stream"), upsert: false });
        if (up.error) throw up.error;
        const url = alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
        const ein = await alt.db.from(VORLAGEN).insert({ gruppe: w.gruppe || gruppeOder(gruppe), titel: w.titel.trim(), url, pfad,
          dateiname: datei.name, art: pdf ? "pdf" : "bild" }).select("id");
        if (ein.error) throw ein.error;
        const neu = ((ein.data || [])[0] || {}).id;
        if (neu) alt.merkeSchritt("Vorlage " + w.titel.trim(), alt.rueckWeg(VORLAGEN, { id: neu }));
        alt.meldung("Vorlage abgelegt: " + w.titel.trim() + " (" + gruppeText(w.gruppe || gruppeOder(gruppe)) + ")", "gut");
        if (w.gruppe && w.gruppe !== gruppe) gruppeWaehlen(w.gruppe);
      } catch (f) {
        const t = alt.fehlertext(f);
        alt.meldung(/exceeded|too large|413|maximum/i.test(t) ? datei.name + " ist zu gross für die Ablage."
          : /wartung_vorlagen/.test(t) ? "Die Vorlagen sind in der Datenbank noch nicht eingerichtet." : t, "fehler");
      }
      setLaedt("");
    }
    geaendert();
  };

  // Vorlage mit Text statt Datei (seit 1.518.0)
  const textNeu = async () => {
    const t = await textSchreiben({ knopf: "Weiter" });
    if (!t) return;
    const w = await alt.dialogFelder({ titel: "Vorlage ablegen",
      felder: [{ name: "titel", label: "Was ist zu tun?", pflicht: true, wert: t.titel },
        { name: "gruppe", label: "Gruppe", wert: gruppeOder(gruppe), auswahl: GRUPPEN }],
      bestaetigen: "Ablegen" });
    if (!w) return;
    const ein = await alt.db.from(VORLAGEN).insert({ gruppe: w.gruppe || gruppeOder(gruppe), titel: w.titel.trim(),
      url: null, art: "text", inhalt: t.inhalt, inhalt_fmt: t.inhalt_fmt }).select("id");
    if (ein.error) {
      const f = alt.fehlertext(ein.error);
      alt.meldung(/inhalt|url/.test(f) ? "Vorlagen mit Text sind in der Datenbank noch nicht eingerichtet (sql/wartung-text.sql)." : f, "fehler");
      return;
    }
    const neu = ((ein.data || [])[0] || {}).id;
    if (neu) alt.merkeSchritt("Vorlage " + w.titel.trim(), alt.rueckWeg(VORLAGEN, { id: neu }));
    alt.meldung("Vorlage abgelegt: " + w.titel.trim(), "gut");
    if (w.gruppe && w.gruppe !== gruppe && gruppe !== "alle") gruppeWaehlen(w.gruppe);
    geaendert();
  };
  const textAendern = async (v) => {
    const t = await textSchreiben({ titel: v.titel, inhalt: v.inhalt, fmt: v.inhalt_fmt, knopf: "Speichern" });
    if (!t) return;
    const vorher = await alt.rueckSichern(VORLAGEN, { id: v.id });
    const { error } = await alt.db.from(VORLAGEN).update({ titel: t.titel, inhalt: t.inhalt, inhalt_fmt: t.inhalt_fmt }).eq("id", v.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Vorlage " + v.titel, alt.rueckRein(VORLAGEN, vorher));
    geaendert();
  };

  const bearbeiten = async (v) => {
    const w = await alt.dialogFelder({ titel: "Vorlage ändern",
      felder: [{ name: "titel", label: "Was ist zu tun?", wert: v.titel, pflicht: true },
        { name: "gruppe", label: "Gruppe", wert: v.gruppe, auswahl: GRUPPEN }],
      bestaetigen: "Speichern" });
    if (!w) return;
    const vorher = await alt.rueckSichern(VORLAGEN, { id: v.id });
    const { error } = await alt.db.from(VORLAGEN).update({ titel: w.titel.trim(), gruppe: w.gruppe }).eq("id", v.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Vorlage " + v.titel, alt.rueckRein(VORLAGEN, vorher));
    geaendert();
  };

  const loeschen = async (v) => {
    const ja = await alt.nachfragen({ titel: "Vorlage löschen",
      text: "Soll die Vorlage „" + v.titel + "“ gelöscht werden? Schon zugeteilte Wartungen bleiben.",
      bestaetigen: "Löschen", gefahr: true });
    if (!ja) return;
    const vorher = await alt.rueckSichern(VORLAGEN, { id: v.id });
    const { error } = await alt.db.from(VORLAGEN).delete().eq("id", v.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Löschen von Vorlage " + v.titel, alt.rueckRein(VORLAGEN, vorher));
    geaendert();
  };

  const liste = (vorlagen || []).filter((v) => gruppe === "alle" || (v.gruppe || "langdreher") === gruppe);
  return (
    <div className="wartung wartung--einstellungen" id="wartung-vorlagen">
      <div className="es-wartung__art" role="tablist">
        {[["alle", "Alle"]].concat(GRUPPEN).map(([g, t]) => (
          <button key={g} role="tab" aria-selected={g === gruppe} data-vorlage-gruppe={g}
            className={"knopf" + (g === gruppe ? " knopf--haupt" : "")} onClick={() => gruppeWaehlen(g)}>
            {t} <span className="es-wartung__zahl">{(vorlagen || []).filter((v) => g === "alle" || (v.gruppe || "langdreher") === g).length}</span>
          </button>))}
        {darf && <button className="knopf knopf--haupt wartung-vorlagen__neu" id="vorlage-neu" disabled={!!laedt}
          onClick={() => wahl.current && wahl.current.click()}>+ Bild oder PDF</button>}
        {darf && <button className="knopf knopf--haupt" id="vorlage-text-neu" onClick={textNeu}>+ Text</button>}
      </div>
      {darf && <input ref={wahl} type="file" multiple hidden id="vorlage-datei" accept="image/*,application/pdf,.pdf"
        onChange={(e) => { const d = [...e.target.files]; e.target.value = ""; if (d.length) hochladen(d); }} />}
      <p className="klein wartung__erklaerung">Vorlagen gelten noch nirgends. An der Maschine (Pad → Wartung oder hier
        unter „Zuteilen“) mit „Vorlage wählen“ zuteilen: nur diese Maschine, ganzer Park oder Maschinentyp, mit Termin
        und Wiederholung.</p>
      {laedt && <p className="unterlagen__laedt">Lädt hoch: {laedt} …</p>}
      {fehler && <p className="fehlertext">{fehler}</p>}
      {vorlagen === null ? <p className="klein">Lädt …</p>
        : !liste.length ? <p className="unterlagen__leer">Noch keine Vorlagen{gruppe === "alle" ? "" : " für " + gruppeText(gruppe)}.
            {darf ? " Mit „+ Bild oder PDF“ oder „+ Text“ beginnen." : ""}</p>
        : <ul className="wartung__liste">
            {liste.map((v) => (
              <li key={v.id} className="wartung__zeile" data-vorlage-zeile={v.id}>
                <button className="wartung__vorschau" title="Gross ansehen" onClick={() => ansehen(v)}><Vorschau w={v} /></button>
                <div className="wartung__text"><b>{v.titel}</b><span className="klein">{gruppeText(v.gruppe)}</span></div>
                {darf && <div className="wartung__knoepfe">
                  {istText(v) && <button className="knopf knopf--klein" data-vorlage-text={v.id} onClick={() => textAendern(v)}>Text ändern</button>}
                  <button className="knopf knopf--klein" data-vorlage-aendern={v.id} onClick={() => bearbeiten(v)}>Ändern</button>
                  <button className="knopf knopf--klein knopf--gefahr-leise" data-vorlage-weg={v.id}
                    onClick={() => loeschen(v)}>Löschen</button>
                </div>}
              </li>))}
          </ul>}
    </div>
  );
}
