// Test ERP: Designer für die Druckformulare (seit 1.936.0, Wunsch Patrick
// 27. November 2026: „Designer für Formulare zum Anpassen“). Im Gewatec hat
// Patrick die festen Texte über Crystal Reports gesteuert; hier kann er sie je
// Formular ändern oder ausschalten, die Schriftgrösse wählen und Strichcode
// bzw. Bankverbindung ein- und ausschalten. Rechts zeigt eine Vorschau mit
// Beispieldaten sofort, wie das Blatt aussieht. Speichern nur Admins.
import { useEffect, useMemo, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { useEntwurfZurueck } from "../../teile/lokalZurueck.js";
import {
  FORMULARE, TEXTE, SCHALTER, BESTELLARTEN, formularEinstellungenLaden, formularEinstellungenSpeichern, formularVorschau,
} from "./formulare.js";

const gemerkt = { form: "re", art: "rohmaterial" };
const kopie = (x) => JSON.parse(JSON.stringify(x || {}));

export default function FormularDesigner() {
  const [gespeichert, setGespeichert] = useState(null);
  const [entwurf, setEntwurf] = useState(null);
  const [form, setForm] = useState(gemerkt.form);
  const [art, setArt] = useState(gemerkt.art);
  const [laeuft, setLaeuft] = useState(false);
  gemerkt.form = form; gemerkt.art = art;
  const admin = !!(alt.istAdmin && alt.istAdmin());

  useEffect(() => {
    formularEinstellungenLaden(true).then((e) => { setGespeichert(kopie(e)); setEntwurf(kopie(e)); },
      (e) => { setGespeichert({}); setEntwurf({}); alt.meldung("Formular-Einstellungen nicht geladen (" + ((e && e.message) || e) + "), es gelten die Standardtexte.", "warn"); });
  }, []);
  useEntwurfZurueck(entwurf, setEntwurf, !!entwurf);

  const f = (entwurf && entwurf[form]) || {};
  const setF = (neu) => setEntwurf({ ...entwurf, [form]: { ...f, ...neu } });
  const setText = (id, w) => setF({ texte: { ...(f.texte || {}), [id]: { ...((f.texte || {})[id] || {}), ...w } } });
  const html = useMemo(() => (entwurf ? formularVorschau(form, entwurf, art) : ""), [entwurf, form, art]);
  const geaendert = entwurf && JSON.stringify(entwurf) !== JSON.stringify(gespeichert);

  const speichern = async () => {
    setLaeuft(true);
    try {
      // Leere Einträge weglassen, damit nur echte Änderungen gespeichert sind
      const sauber = kopie(entwurf);
      Object.values(sauber).forEach((x) => {
        Object.entries(x.texte || {}).forEach(([k, t]) => { if (!t.aus && !(t.text && String(t.text).trim())) delete x.texte[k]; });
      });
      await formularEinstellungenSpeichern(sauber);
      setGespeichert(kopie(sauber)); setEntwurf(kopie(sauber));
      alt.meldung("Formulare gespeichert.", "gut");
    } catch (e) {
      alt.meldung("Speichern fehlgeschlagen: " + ((e && e.message) || e), "fehler");
    }
    setLaeuft(false);
  };

  // Das A4-Blatt in die Breite der Vorschau einpassen, damit nichts seitlich rollt
  const einpassen = (e) => {
    try {
      const doc = e.target.contentDocument;
      const breit = doc.documentElement.scrollWidth;
      const platz = e.target.clientWidth - 4;
      if (breit > platz) doc.documentElement.style.zoom = String(platz / breit);
    } catch (f) { /* Vorschau bleibt in voller Grösse */ }
  };

  if (!entwurf) return <p className="klein">Lade …</p>;
  return (
    <div className="fd">
      <div className="fd-links">
        <p className="klein">Hier änderst du die festen Texte der Druckformulare (wie früher im Crystal Reports).
          Leeres Feld = Standardtext. Platzhalter: <b>{"{nr}"}</b> Belegnummer, <b>{"{datum}"}</b> Datum,
          <b> {"{name}"}</b> Sachbearbeiter, <b>{"{kunde}"}</b> Kunde bzw. Lieferant.</p>
        <div className="fd-reihe">
          <label>Formular <select data-fd-form value={form} onChange={(e) => setForm(e.target.value)}>
            {FORMULARE.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select></label>
          {form === "be" && <label>Vorschau als <select data-fd-art value={art} onChange={(e) => setArt(e.target.value)}>
            {BESTELLARTEN.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select></label>}
          <label>Schriftgrösse <select data-fd-schrift value={f.schrift || 10} onChange={(e) => setF({ schrift: Number(e.target.value) })}>
            {[8, 8.5, 9, 9.5, 10, 10.5, 11, 12].map((s) => <option key={s} value={s}>{s} pt{s === 10 ? " (Standard)" : ""}</option>)}
          </select></label>
        </div>
        {(SCHALTER[form] || []).length > 0 && <div className="fd-reihe">
          {SCHALTER[form].map(([k, t]) => {
            const an = (f.schalter || {})[k] == null ? true : !!f.schalter[k];
            return <label key={k}><input type="checkbox" data-fd-schalter={k} checked={an}
              onChange={(e) => setF({ schalter: { ...(f.schalter || {}), [k]: e.target.checked } })} /> {t}</label>;
          })}
        </div>}
        {(TEXTE[form] || []).map(([id, titel, std]) => {
          const t = (f.texte || {})[id] || {};
          return (
            <div key={id} className="fd-text">
              <div className="fd-reihe">
                <label><input type="checkbox" data-fd-an={id} checked={!t.aus} onChange={(e) => setText(id, { aus: !e.target.checked })} /> <b>{titel}</b></label>
                {t.text && <button className="knopf knopf--klein" onClick={() => setText(id, { text: "" })}>Standard</button>}
              </div>
              <textarea data-fd-text={id} rows={Math.min(6, String(t.text || std).split("\n").length + 1)} disabled={t.aus}
                value={t.text || ""} placeholder={std} onChange={(e) => setText(id, { text: e.target.value })} />
            </div>
          );
        })}
        <div className="knopfreihe" style={{ marginTop: 10 }}>
          {admin ? <button className="knopf knopf--haupt" id="fd-speichern" disabled={!geaendert || laeuft} onClick={speichern}>Speichern</button>
            : <span className="klein">Ändern dürfen nur Admins.</span>}
          {geaendert && <button className="knopf" onClick={() => setEntwurf(kopie(gespeichert))}>Verwerfen</button>}
        </div>
      </div>
      <div className="fd-rechts hell-bleibt">
        <iframe title="Vorschau" className="fd-vorschau" srcDoc={html} onLoad={einpassen} />
      </div>
    </div>
  );
}
