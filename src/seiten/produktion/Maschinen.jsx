// =================================================================
//  MASCHINEN UND TYPEN
//  Unterreiter: je Maschinenpark einer, dazu die Typen. So bleibt
//  die Seite kurz, statt alle Parks untereinander zu stapeln.
//  Parks und Maschinen verwalten ist in React, die Maschinentypen
//  mit ihrem Werkzeugaufbau laufen noch im alten Programm.
//
//  Die Grunddaten kommen aus der Produktion (prod.parks und
//  prod.maschinen, hier auch die ausgeblendeten). Nach jeder
//  Änderung wird das Stammdaten-Gedächtnis verworfen und neu geladen.
// =================================================================
import { useEffect, useReducer } from "react";
import { alt } from "../../bruecke.jsx";
import Typen from "./Typen.jsx";
import { Uebergang } from "../../teile/Reiter.jsx";

// Was die Datenbank meldet, kommt als Meldung unten rechts
// rueck: optional der Schritt für Rückgängig, [Text, Schritte]
async function senden(anfrage, gut, neuLaden, rueck) {
  const { error } = await anfrage;
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return false; }
  if (rueck) alt.merkeSchritt(rueck[0], rueck[1]);
  if (gut) alt.meldung(gut);
  neuLaden();
  return true;
}

// Eine Rückfrage, dann wird gelöscht (Wunsch 6. Oktober 2026: nur einmal fragen)
function loeschenFragen(titel, name, warnung, was) {
  return alt.nachfragen({ titel,
    text: "Soll " + name + " gelöscht werden? " + (warnung ? warnung + " " : "")
      + "Danach ist " + was + " weg. Deaktivieren wäre der sichere Weg.",
    bestaetigen: "Löschen", gefahr: true });
}

// Lehnt die Datenbank ab (es hängen noch Zahlen daran), dürfen
// Administratoren alles samt Anhang löschen.
async function hartLoeschen(error, verlust, rpc, argumente, neuLaden) {
  if (!alt.istAdmin()) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  const hart = await alt.nachfragen({
    titel: "Löschen wurde abgelehnt",
    text: alt.fehlertext(error) + " Als Administrator kannst du trotzdem löschen. "
      + "Dabei gehen " + verlust + " unwiderruflich verloren.",
    bestaetigen: "Trotzdem alles löschen", gefahr: true });
  if (!hart) return;
  const r = await alt.db.rpc(rpc, argumente);
  if (r.error) alt.meldung(alt.fehlertext(r.error), "fehler");
  else { alt.meldung(r.data || "Gelöscht."); neuLaden(); }
}

async function deaktivierenFragen(titel, was) {
  return alt.nachfragen({ titel,
    text: was + " verschwindet aus der Erfassung. Alle Zahlen bleiben erhalten.",
    bestaetigen: "Deaktivieren", gefahr: true });
}

const aktion = {
  async parkNeu(neuLaden) {
    const w = await alt.dialogFelder({ titel: "Neuer Maschinenpark",
      felder: [{ name: "name", label: "Name", pflicht: true, platzhalter: "z. B. Langdreherpark" }],
      bestaetigen: "Anlegen" });
    if (w) senden(alt.db.from("machine_parks").insert({ name: w.name }), "Maschinenpark angelegt.", neuLaden);
  },

  async parkUmbenennen(p, neuLaden) {
    const w = await alt.dialogFelder({ titel: "Maschinenpark umbenennen",
      felder: [{ name: "name", label: "Name", wert: p.name, pflicht: true }] });
    if (!w || w.name === p.name) return;
    senden(alt.db.from("machine_parks").update({ name: w.name }).eq("id", p.id), "Umbenannt.", neuLaden,
      ["Umbenennen von " + p.name, alt.rueckSetz("machine_parks", { name: p.name }, { id: p.id })]);
  },

  async parkAktiv(p, neuLaden) {
    const ein = !p.is_active;
    if (!ein && !(await deaktivierenFragen("Maschinenpark deaktivieren", "Der Park"))) return;
    senden(alt.db.from("machine_parks").update({ is_active: ein }).eq("id", p.id), null, neuLaden,
      [(ein ? "Aktivieren von " : "Deaktivieren von ") + p.name,
        alt.rueckSetz("machine_parks", { is_active: !ein }, { id: p.id })]);
  },

  async parkLoeschen(p, anzahl, neuLaden) {
    const ok = await loeschenFragen("Maschinenpark löschen", '"' + p.name + '"',
      anzahl > 0 ? "Achtung: " + anzahl + " Maschinen sind noch zugeordnet." : "", "der Park");
    if (!ok) return;
    const vorher = await alt.rueckSichern("machine_parks", { id: p.id });
    const { error } = await alt.db.from("machine_parks").delete().eq("id", p.id);
    if (!error) {
      alt.merkeSchritt("Löschen von " + p.name, alt.rueckRein("machine_parks", vorher));
      alt.meldung("Maschinenpark gelöscht."); neuLaden(); return;
    }
    hartLoeschen(error, "ALLE Maschinen, Stückzahlen, Aufträge und Kontrollmeldungen dieses Parks",
      "park_hart_loeschen", { p_park_id: p.id }, neuLaden);
  },

  async maschineNeu(parkId, neuLaden) {
    const w = await alt.dialogFelder({ titel: "Neue Maschine",
      felder: [
        { name: "name", label: "Name", pflicht: true, platzhalter: "z. B. Maschine 01" },
        { name: "nummer", label: "Maschinennummer", platzhalter: "kann leer bleiben" }],
      bestaetigen: "Anlegen" });
    if (!w) return;
    senden(alt.db.from("machines").insert({ park_id: parkId, name: w.name, machine_number: w.nummer || null }),
      "Maschine angelegt.", neuLaden);
  },

  async maschineBearbeiten(m, neuLaden) {
    // Der Typ bestimmt den ganzen Werkzeugaufbau. Gibt es noch
    // keinen, bleibt das Feld einfach leer.
    let typen = [];
    try { typen = await alt.ladeTypen(); } catch (f) { /* geht auch ohne */ }
    const w = await alt.dialogFelder({ titel: "Maschine bearbeiten",
      felder: [
        { name: "name", label: "Name", wert: m.name, pflicht: true },
        { name: "nummer", label: "Maschinennummer", wert: m.machine_number || "" },
        { name: "typ", label: "Typ", auswahl: [["", "kein Typ"]].concat(typen.map((t) => [t.id, t.name])),
          wert: m.type_id || "", hinweis: "Legt fest, welche Werkzeugplätze die Maschine hat" }] });
    if (!w) return;
    senden(alt.db.from("machines").update({ name: w.name, machine_number: w.nummer || null,
      type_id: w.typ || null }).eq("id", m.id), "Gespeichert.", neuLaden,
      ["Ändern von " + m.name, alt.rueckSetz("machines", { name: m.name,
        machine_number: m.machine_number || null, type_id: m.type_id || null }, { id: m.id })]);
  },

  async maschineAktiv(m, neuLaden) {
    const ein = !m.is_active;
    if (!ein && !(await deaktivierenFragen("Maschine deaktivieren", "Die Maschine"))) return;
    senden(alt.db.from("machines").update({ is_active: ein }).eq("id", m.id), null, neuLaden,
      [(ein ? "Aktivieren von " : "Deaktivieren von ") + m.name,
        alt.rueckSetz("machines", { is_active: !ein }, { id: m.id })]);
  },

  async maschineLoeschen(m, neuLaden) {
    if (!(await loeschenFragen("Maschine löschen", '"' + m.name + '"', "", "die Maschine"))) return;
    // Werkzeugwechsel gehen mit der Maschine, darum beide sichern
    const vorher = await alt.rueckSichern("machines", { id: m.id });
    const wechsel = await alt.rueckSichern("tool_changes", { machine_id: m.id });
    const { error } = await alt.db.from("machines").delete().eq("id", m.id);
    if (!error) {
      alt.merkeSchritt("Löschen von " + m.name,
        [alt.rueckRein("machines", vorher), alt.rueckRein("tool_changes", wechsel)]);
      alt.meldung("Maschine gelöscht."); neuLaden(); return;
    }
    hartLoeschen(error, "alle Stückzahlen, Aufträge und Kontrollmeldungen dieser Maschine",
      "maschine_hart_loeschen", { p_machine_id: m.id }, neuLaden);
  },

  // Tauschen und die ganze Liste des Parks neu durchnummerieren
  async verschieben(liste, i, richtung, neuLaden) {
    const j = i + richtung;
    if (j < 0 || j >= liste.length) return;
    const neu = liste.slice();
    neu.splice(j, 0, neu.splice(i, 1)[0]);
    for (let k = 0; k < neu.length; k++) {
      const { error } = await alt.db.from("machines").update({ sort_order: k }).eq("id", neu[k].id);
      if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    }
    neuLaden();
  },
};

function ParkKarte({ park: p, darf, neuLaden }) {
  const maschinen = alt.prod.maschinen.filter((m) => m.park_id === p.id);
  return (
    <section className={"karte mpark" + (p.is_active ? "" : " karte--inaktiv")}>
      <div className="karte__kopf">
        <h2>{p.name} <span className="mliste__anzahl">{maschinen.length} Maschinen</span>
          {!p.is_active && <> <span className="marke">inaktiv</span></>}</h2>
        {darf && <div className="karte__aktionen mliste__knoepfe">
          <button className="knopf knopf--klein" data-park-um={p.id}
            onClick={() => aktion.parkUmbenennen(p, neuLaden)}>Umbenennen</button>
          <button className="knopf knopf--klein" data-park-aktiv={p.id}
            onClick={() => aktion.parkAktiv(p, neuLaden)}>{p.is_active ? "Deaktivieren" : "Aktivieren"}</button>
          <button className="knopf knopf--klein knopf--gefahr-leise" data-park-weg={p.id}
            onClick={() => aktion.parkLoeschen(p, maschinen.length, neuLaden)}>Löschen</button>
        </div>}
      </div>

      {maschinen.length
        ? <ul className="mliste">
            {maschinen.map((m, i) => {
              const typ = (alt.prod.typen || []).find((t) => t.id === m.type_id);
              return (
                <li key={m.id} className={"mliste__zeile" + (m.is_active ? "" : " zeile--inaktiv")}>
                  {darf && <div className="mliste__sort">
                    <button className="sortknopf" data-hoch={m.id} disabled={i === 0} title="nach oben"
                      aria-label="nach oben" onClick={() => aktion.verschieben(maschinen, i, -1, neuLaden)}>↑</button>
                    <button className="sortknopf" data-runter={m.id} disabled={i === maschinen.length - 1}
                      title="nach unten" aria-label="nach unten"
                      onClick={() => aktion.verschieben(maschinen, i, 1, neuLaden)}>↓</button>
                  </div>}
                  <div className="mliste__name">
                    <strong>{m.name}</strong>
                    {m.machine_number && <span className="mliste__nr">{m.machine_number}</span>}
                  </div>
                  <span className={"mliste__typ" + (typ ? "" : " mliste__typ--leer")}>{typ ? typ.name : "kein Typ"}</span>
                  <span className={"mliste__zustand" + (m.is_active ? " mliste__zustand--an" : "")}>
                    {m.is_active ? "aktiv" : "aus"}</span>
                  {darf && <div className="mliste__knoepfe">
                    <button className="knopf knopf--klein" data-masch-um={m.id}
                      onClick={() => aktion.maschineBearbeiten(m, neuLaden)}>Bearbeiten</button>
                    <button className="knopf knopf--klein" data-masch-aktiv={m.id}
                      onClick={() => aktion.maschineAktiv(m, neuLaden)}>{m.is_active ? "Aus" : "Ein"}</button>
                    <button className="knopf knopf--klein knopf--gefahr-leise" data-masch-weg={m.id}
                      onClick={() => aktion.maschineLoeschen(m, neuLaden)}>Löschen</button>
                  </div>}
                </li>
              );
            })}
          </ul>
        : <p className="hinweis">Noch keine Maschine in diesem Park.</p>}

      {darf && <button className="knopf knopf--klein" data-masch-neu={p.id}
        onClick={() => aktion.maschineNeu(p.id, neuLaden)}>+ Maschine</button>}
    </section>
  );
}

export default function Maschinen({ geladen, behaelter }) {
  const prod = alt.prod;
  const darf = alt.darfSchreiben();
  const [, zeichnen] = useReducer((x) => x + 1, 0);
  // Stammdaten sind gemerkt; nach einer Änderung frisch holen. Die
  // Produktion lädt dann still neu und zeichnet diese Ansicht mit.
  const neuLaden = () => { alt.stammVergessen(); alt.seiteProduktion(behaelter); };

  // Die Typen braucht die Dokumentenerkennung. Einmal holen und merken.
  useEffect(() => {
    if (!prod.typen) alt.ladeTypen().then((t) => { prod.typen = t; }, () => { prod.typen = []; });
  }, [prod]);

  // Typen und ein geöffneter Typ
  const typenTeil = (
    <div id={prod.typOffen ? undefined : "park-inhalt"}>
      <Typen geladen={geladen} neuLaden={neuLaden} />
    </div>
  );

  // Ist ein Typ geöffnet, zählt nur er
  if (prod.typOffen) return typenTeil;

  const parks = prod.parks || [];
  if (![...parks.map((p) => p.id), "typen"].includes(prod.parkReiter)) {
    prod.parkReiter = parks.length ? parks[0].id : "typen";
  }
  const waehlen = (wert) => { prod.parkReiter = wert; zeichnen(); };
  const reiter = parks.map((p) => [p.id, p.name]).concat([["typen", "Typen"]]);
  const park = parks.find((p) => p.id === prod.parkReiter);

  return (
    <>
      <div className="reiter reiter--fein" id="park-reiter">
        {reiter.map(([w, t]) => (
          <button key={w} className={"reiter__knopf" + (prod.parkReiter === w ? " aktiv" : "")}
            data-parkreiter={w} onClick={() => waehlen(w)}>{t}</button>
        ))}
      </div>
      <Uebergang key={prod.parkReiter}>
        {prod.parkReiter === "typen"
          ? typenTeil
          : <div id="park-inhalt">
              {park && <ParkKarte park={park} darf={darf} neuLaden={neuLaden} />}
              {darf && <button className="knopf knopf--haupt knopf--breit" id="park-neu"
                onClick={() => aktion.parkNeu(neuLaden)}>+ Maschinenpark</button>}
            </div>}
      </Uebergang>
    </>
  );
}
