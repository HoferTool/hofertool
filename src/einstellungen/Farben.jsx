// =================================================================
//  EINSTELLUNGEN → FARBEN UND MATERIAL
//  Welche Balkenfarbe für welches Material steht (mit Kürzel auf dem
//  Balken) und die Werkstofferkennung: jede Materialbezeichnung aus
//  den Aufträgen mit der erkannten Gruppe, von Hand korrigierbar.
// =================================================================
import { useRef, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { Gruppe } from "./teile.jsx";

export default function Farben() {
  return (
    <>
      <Gruppe titel="Farben und Material"
        text={"Neue Farbe: bei einer freien Farbe das Material eintragen. Nur Farben mit einem Material "
          + "erscheinen im Auftragsfenster, neue Farben gibt es nur hier. Das Kürzel steht auf dem Balken, "
          + "mehrere Angaben mit Schrägstrich, zum Beispiel E/N. Gespeichert wird beim Verlassen des Felds."}>
        <div id="farbliste"><FarbListe /></div>
      </Gruppe>
      <Gruppe titel="Werkstofferkennung"
        text={"Nicht erkannte Werkstoffe stehen oben: einmal zuordnen, die App merkt es sich."}>
        <div id="werkstoffliste"><Werkstoffe /></div>
      </Gruppe>
    </>
  );
}

// ---------- Farben ----------

async function farbenLaden() {
  await alt.farbzuteilungLaden();
  // Eine Kopie: Die Felder starten mit dem gespeicherten Stand
  return JSON.parse(JSON.stringify(alt.FARBZUTEILUNG || {}));
}

function FarbListe() {
  const { daten: zuteilung, neu } = useDaten(farbenLaden, []);
  if (!zuteilung) return <div className="laedt">Wird geladen …</div>;
  return (
    <div className="farbzeilen">
      {alt.PLANFARBEN.map((f, nr) => (
        // Der Schlüssel bleibt nach dem Speichern gleich: Wer schon im
        // nächsten Feld tippt, verliert sonst, was er dort eingibt
        <FarbZeile key={f.wert} f={f} nr={nr}
          zu={zuteilung[f.wert] || {}} gespeichert={neu} />
      ))}
    </div>
  );
}

function FarbZeile({ f, nr, zu, gespeichert }) {
  const [material, setMaterial] = useState(zu.material || "");
  const [kuerzel, setKuerzel] = useState(zu.buchstabe || "");
  // Was zuletzt gespeichert ist. Unverändert verlassen speichert nicht.
  const gemerkt = useRef({ m: zu.material || "", k: zu.buchstabe || "" });

  // Gespeichert wird beim Verlassen des Felds, wie bisher (change)
  const speichern = async (mat, kue) => {
    const m = mat.trim(), k = kue.trim();
    if (m === gemerkt.current.m && k === gemerkt.current.k) return;
    if (!m) {
      // Ohne Material verschwindet die Farbe aus der Auswahl, das
      // Kürzel mit ihr
      await alt.db.from("farb_material").delete().eq("farbe", f.wert);
      alt.meldung("Farbe wird nicht mehr angeboten.");
      setKuerzel("");
      gemerkt.current = { m: "", k: "" };
    } else {
      const { error } = await alt.db.from("farb_material").upsert({
        farbe: f.wert, material: m, buchstabe: k || null, sortierung: nr });
      if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
      alt.meldung("Gespeichert.");
      gemerkt.current = { m, k };
    }
    gespeichert();
  };

  return (
    <div className={"farbzeile" + (material.trim() ? " farbzeile--belegt" : "")}>
      <span className="farbzeile__punkt" style={{ background: f.hex, color: f.schrift }}>{zu.buchstabe || ""}</span>
      <span className="farbzeile__name">{f.name}</span>
      <input type="text" className="farbzeile__material" data-fmat={f.wert} value={material} placeholder="Material"
        onChange={(e) => setMaterial(e.target.value)} onBlur={() => speichern(material, kuerzel)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      <input type="text" className="farbzeile__kuerzel" data-fkuerzel={f.wert} value={kuerzel} placeholder="Kürzel"
        onChange={(e) => setKuerzel(e.target.value)} onBlur={() => speichern(material, kuerzel)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    </div>
  );
}

// ---------- Werkstofferkennung ----------

async function werkstoffeLaden() {
  const alle = [];
  for (let von = 0; von < 20000; von += 1000) {
    const r = await alt.zeitlimit(alt.db.from("jobs").select("material_bez")
      .not("material_bez", "is", null).range(von, von + 999), 10000, "Werkstoffe");
    if (r.error) throw r.error;
    alle.push(...(r.data || []));
    if (!r.data || r.data.length < 1000) break;
  }
  // Je Werkstoff einmal, mit Anzahl
  const jeKern = new Map();
  alle.forEach(({ material_bez: b }) => {
    const k = alt.werkstoffKern(b);
    if (!k || k.length < 2) return;
    const s = alt.werkstoffSchluessel(b);
    const e = jeKern.get(s) || { kern: k, beispiel: b, n: 0 };
    e.n++; jeKern.set(s, e);
  });
  // Nicht Erkanntes zuerst, sonst die häufigsten oben
  return [...jeKern.values()].map((e) => Object.assign(e, { g: alt.werkstoffErkennen(e.beispiel) }))
    .sort((a, b) => (a.g ? 1 : 0) - (b.g ? 1 : 0) || b.n - a.n);
}

function Werkstoffe() {
  const { daten: zeilen, fehler, neu } = useDaten(werkstoffeLaden, []);
  if (fehler && !zeilen) return <p className="hinweis">{alt.fehlertext(fehler)}</p>;
  if (!zeilen) return <div className="laedt">Wird geladen …</div>;
  const gruppen = alt.WERKSTOFFGRUPPEN;
  const offen = zeilen.filter((z) => !z.g).length;

  const zuordnen = async (bez, gruppe) => {
    try {
      await alt.werkstoffZuordnen(bez, gruppe || null);
      alt.meldung(gruppe ? "Zugeordnet." : "Zuordnung entfernt.");
      neu();
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  return (
    <>
      <p className="es-zahlen">{zeilen.length} Werkstoffe · {offen
        ? <span className="es-marke es-marke--warn">{offen} nicht erkannt</span>
        : <span className="es-marke es-marke--gut">alle erkannt</span>}</p>
      <div className="tabellenrolle"><table className="tabelle ws-tabelle">
        <thead><tr><th>Werkstoff</th><th className="rechts">Aufträge</th><th>Gruppe</th><th>Von Hand</th></tr></thead>
        <tbody>{zeilen.map((z) => (
          <tr key={z.beispiel} className={z.g ? undefined : "ws-offen"}>
            <td><strong>{z.kern}</strong></td>
            <td className="rechts">{z.n}</td>
            <td>{z.g
              ? <><span className="ws-farbe" style={{ background: alt.farbeVon(z.g.farbe).hex }} />
                  {z.g.name}</>
              : <span className="gedaempft">nicht erkannt</span>}</td>
            <td>
              <select data-werkstoff={z.beispiel} value={z.g && z.g.gelernt ? z.g.key : ""}
                onChange={(e) => zuordnen(z.beispiel, e.target.value)}>
                <option value="">{z.g && !z.g.gelernt ? "automatisch" : "— nicht zugeordnet —"}</option>
                {Object.keys(gruppen).map((k) => <option key={k} value={k}>{gruppen[k].name}</option>)}
              </select>
            </td>
          </tr>
        ))}</tbody>
      </table></div>
    </>
  );
}
