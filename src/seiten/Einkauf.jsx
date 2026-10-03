// =================================================================
//  EINKAUFSLISTE
//  Für alles, was man beim nächsten Ladenbesuch mitnehmen soll.
//  Erste React-Seite mit Daten: lädt über useDaten, frischt sich
//  beim Abgleich still auf und nutzt die Fenster des alten Programms.
// =================================================================
import { useState } from "react";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import { PRIO } from "../daten/einkauf.js";

const gemerkt = { zeigeErledigte: false };

async function listeLaden(erledigte) {
  const { data, error } = await alt.zeitlimit(
    alt.db.from("shopping_items")
      .select("*, profiles!shopping_items_created_by_fkey(full_name, email)")
      .eq("is_done", erledigte)
      .order("prio").order("created_at"), 10000, "Einkaufsliste");
  if (error) throw error;
  return data || [];
}

export default function Einkauf({ auffrischen }) {
  const [zeigeErledigte, setZeigeErledigte] = useState(gemerkt.zeigeErledigte);
  useGemerkt(gemerkt, { zeigeErledigte });
  const { daten: liste, fehler, neu } = useDaten(
    () => listeLaden(zeigeErledigte), [zeigeErledigte, auffrischen]);

  return (
    <>
      <h1 className="seitentitel">Einkaufsliste</h1>
      <button className="knopf knopf--haupt knopf--breit" id="ek-neu"
        onClick={() => eintragDialog(null, neu)}>+ Auf die Liste setzen</button>
      <div id="ek-inhalt">
        {fehler && !liste
          ? <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>
          : !liste
            ? <div className="laedt">Wird geladen …</div>
            : <>
                <Liste liste={liste} erledigte={zeigeErledigte} neu={neu} />
                <button className="linkknopf" id="ek-wechsel"
                  onClick={() => setZeigeErledigte(!zeigeErledigte)}>
                  {zeigeErledigte ? "Offene Punkte anzeigen" : "Bereits Erledigtes anzeigen"}
                </button>
              </>}
      </div>
    </>
  );
}

function Liste({ liste, erledigte, neu }) {
  if (!liste.length) {
    return (
      <div className="karte karte--hinweis">
        <p>{erledigte ? "Noch nichts abgehakt." : "Die Liste ist leer. Sehr gut."}</p>
      </div>
    );
  }

  // Nach Dringlichkeit gruppieren
  const gruppen = {};
  liste.forEach((z) => { (gruppen[z.prio] = gruppen[z.prio] || []).push(z); });

  return Object.keys(gruppen).sort().map((prio) => {
    const p = PRIO[prio] || PRIO[3];
    return (
      <section className="karte" key={prio}>
        <div className="karte__kopf">
          <h2><span className={"priopunkt " + p.farbe}></span>{p.text}</h2>
          <span className="klein">{gruppen[prio].length}</span>
        </div>
        <div className="notizen">
          {gruppen[prio].map((z) => (
            <Eintrag key={z.id} z={z} erledigte={erledigte} neu={neu} />
          ))}
        </div>
      </section>
    );
  });
}

function Eintrag({ z, erledigte, neu }) {
  const abhaken = async (e) => {
    e.target.checked = false;
    const ok = await alt.nachfragen({ titel: "Eingekauft?",
      text: "Hast du das wirklich schon geholt?", bestaetigen: "Ja, habe ich" });
    if (!ok) return;
    const { error } = await alt.db.from("shopping_items").update({
      is_done: true, done_at: new Date().toISOString(), done_by: alt.profil.id,
    }).eq("id", z.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Einkauf abhaken", async () => {
      await alt.db.from("shopping_items")
        .update({ is_done: false, done_at: null, done_by: null }).eq("id", z.id);
      neu();
    });
    alt.meldung("Abgehakt.");
    neu();
  };

  const loeschen = async (e) => {
    e.preventDefault();
    const ok = await alt.nachfragen({ titel: "Von der Liste nehmen",
      text: "Soll dieser Punkt gelöscht werden?", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const { error } = await alt.db.from("shopping_items").delete().eq("id", z.id);
    if (error) alt.meldung(alt.fehlertext(error), "fehler");
    else { alt.meldung("Gelöscht."); neu(); }
  };

  return (
    <label className="notiz">
      {erledigte
        ? <span className="hakenfertig">✓</span>
        : <input type="checkbox" data-ekfertig={z.id} onChange={abhaken} />}
      <span className="notiz__text">
        {z.text}
        {z.menge && <> <span className="klein">{z.menge}</span></>}
        <div className="klein">
          {z.laden ? "bei " + z.laden + " · " : ""}von {alt.personName(z.profiles)}
        </div>
      </span>
      <button className="chipweg chipweg--bearb" data-ekbearb={z.id} title="bearbeiten"
        onClick={(e) => { e.preventDefault(); eintragDialog(z, neu); }}>✎</button>
      <button className="chipweg" data-ekweg={z.id} title="löschen" onClick={loeschen}>×</button>
    </label>
  );
}

async function eintragDialog(eintrag, neu) {
  const w = await alt.dialogFelder({
    titel: eintrag ? "Eintrag bearbeiten" : "Was brauchst du?",
    felder: [
      { name: "text", label: "Was", pflicht: true, wert: eintrag ? eintrag.text : "",
        platzhalter: "Kaffee, Handschuhe, Putzlappen, Klebeband …" },
      { name: "menge", label: "Wie viel", wert: eintrag ? (eintrag.menge || "") : "",
        platzhalter: "2 Packungen, 1 Kiste …" },
      { name: "laden", label: "Wo", wert: eintrag ? (eintrag.laden || "") : "",
        platzhalter: "Migros, Bauhaus … kann leer bleiben" },
    ],
    bestaetigen: "Weiter",
  });
  if (!w) return;

  const prio = await alt.auswahlDialog("Wie dringend?",
    Object.keys(PRIO).map((k) => ({ wert: k, text: PRIO[k].text + " – " + PRIO[k].hilfe })));
  if (prio === null) return;

  const daten = { text: w.text, menge: w.menge || null, laden: w.laden || null,
                  prio: Number(prio) };
  const { error } = eintrag
    ? await alt.db.from("shopping_items").update(daten).eq("id", eintrag.id)
    : await alt.db.from("shopping_items").insert(daten);

  if (error) alt.meldung(alt.fehlertext(error), "fehler");
  else { alt.meldung(eintrag ? "Gespeichert." : "Steht auf der Liste."); neu(); }
}
