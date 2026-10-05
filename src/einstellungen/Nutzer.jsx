// =================================================================
//  EINSTELLUNGEN → NUTZER
//  Benutzer mit Login (Rolle, Bearbeiten, Plant mit Kürzel, Geburtstag,
//  PIN und Passwort, aktiv), Zugriff auf Maschinenparks, der Link für
//  externe Partner und Personen ohne Login (nur für die Geburtstage
//  auf der Startseite). Ändern dürfen nur Administratoren, alle
//  anderen sehen die Liste.
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { Gruppe } from "./teile.jsx";
import { zuschneiden } from "../teile/Zuschnitt.jsx";

export default function Nutzer() {
  const bin = alt.istAdmin();
  const link = location.origin + location.pathname + "#/extern";
  const kopieren = async (e) => {
    const feld = e.currentTarget.parentElement.querySelector("input");
    try { await navigator.clipboard.writeText(link); }
    catch (f) { feld.select(); document.execCommand("copy"); }
    alt.meldung("Link kopiert.");
  };
  return (
    <>
      <Gruppe titel="Benutzer mit Login" text={bin
        ? "Änderungen gelten sofort. Namen, Kürzel und Geburtstag werden beim Verlassen des Felds gespeichert. Ein Klick auf das Bild setzt ein Foto."
        : "Ändern dürfen nur Administratoren."}>
        <div id="benutzerliste"><Benutzer bin={bin} /></div>
      </Gruppe>
      <Gruppe titel="Was die Rollen dürfen">
        <div className="rollenhilfe">
          <div><strong>Administrator</strong> darf alles, ohne etwas einzuschalten.</div>
          <div><strong>Planwand</strong> sieht alle Parks und darf ändern, sobald oben Bearbeiten eingeschaltet ist.</div>
          <div><strong>Langdreher</strong> und <strong>Kurzdreher</strong> sehen nur ihren Park, in Produktion und Planwand.</div>
          <div><strong>Mitarbeiter</strong> darf überall zusehen und den Einkauf nutzen, sonst nichts ändern.</div>
          <div><strong>Extern</strong> ist für Partner wie Zurbrügg: nur die Planwand der eigenen Maschinen ansehen
            und dort Stückzahlen melden, sonst nichts.</div>
          <div className="klein">Das Häkchen bei <strong>Plant</strong> heisst: Diese Person erscheint im
            Auftragsfenster unter „Eingeplant von". Das Kürzel daneben steht danach gross auf dem Balken.</div>
        </div>
      </Gruppe>
      <Gruppe titel="Link für externe Partner"
        text={"Diesen Link bekommt Zurbrügg. Wer die App einmal darüber öffnet, sieht auf diesem Gerät keine "
          + "Kacheln eurer Leute: beim ersten Mal nur E-Mail und Passwort, danach die eigene Kachel."}>
        <div className="linkzeile"><input type="text" id="extern-link" aria-label="Link für externe Partner" readOnly value={link} />
          <button className="knopf knopf--klein" id="extern-link-kopieren" onClick={kopieren}>Kopieren</button></div>
      </Gruppe>
      <Personen />
    </>
  );
}

// Bild oder Anfangsbuchstabe, wie in der Kopfzeile
function Bild({ url, name }) {
  return url
    ? <img className="kopf__bild" src={url} alt="" />
    : <span className="kopf__bild kopf__bild--leer">{(name || "?").charAt(0).toUpperCase()}</span>;
}

// Lädt ein gewähltes Bild zugeschnitten in die Ablage und gibt die
// öffentliche Adresse zurück (null, wenn abgebrochen).
async function bildHochladen(datei, pfad) {
  const klein = await zuschneiden(datei, { kante: 400 });
  if (!klein) return null;
  const r = await alt.db.storage.from("profilbilder").upload(pfad, klein, { contentType: "image/jpeg" });
  if (r.error) throw r.error;
  return alt.db.storage.from("profilbilder").getPublicUrl(pfad).data.publicUrl;
}

// Bild, das der Admin per Klick wechseln kann. Wer nie unter „Mein
// Konto“ vorbeikommt (Konten ohne Passwort am Tablet), bekommt sein
// Foto so vom Admin. Ein zweiter Knopf nimmt es wieder weg.
function BildWahl({ url, name, kennung, speichern }) {
  const waehlen = async (e) => {
    const f = (e.target.files || [])[0];
    e.target.value = "";
    if (!f) return;
    try {
      const adresse = await bildHochladen(f, "profil/" + kennung + "-" + Date.now() + ".jpg");
      if (adresse) await speichern(adresse);
    } catch (f2) { alt.meldung(alt.fehlertext(f2), "fehler"); }
  };
  return (
    <span className="bildwahl">
      <label className="bildwahl__knopf" title={url ? "Bild ändern" : "Bild setzen"}>
        <Bild url={url} name={name} />
        <input type="file" accept="image/*" hidden data-bild={kennung} onChange={waehlen} />
      </label>
      {url && <button type="button" className="bildwahl__weg" title="Bild entfernen" data-bildweg={kennung}
        onClick={() => speichern(null)}>×</button>}
    </span>
  );
}

// Textfeld, das beim Verlassen speichert, und nur, wenn sich etwas
// geändert hat. Kommt von aussen ein neuer Wert (etwa das vorgeschlagene
// Kürzel beim Anhaken von „Plant“), zeigt es diesen.
function Feld({ wert, speichern, gross, ...rest }) {
  const [text, setText] = useState(wert || "");
  useEffect(() => { setText(wert || ""); }, [wert]);
  const fertig = () => {
    const neu = gross ? text.trim().toUpperCase() : text.trim();
    if (gross) setText(neu);
    if (neu !== (wert || "")) speichern(neu);
  };
  return <input type="text" {...rest} value={text} onChange={(e) => setText(e.target.value)} onBlur={fertig}
    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

const kuerzelVorschlag = (name) => {
  const teile = String(name || "").trim().split(/\s+/);
  return ((teile[0] || "").charAt(0) + (teile[1] || "").charAt(0)).toUpperCase();
};

// ---------- Benutzer mit Login ----------

let ladeNr = 0;

async function benutzerLaden(bin) {
  const r = await alt.zeitlimit(alt.db.from("profiles").select("*").order("full_name"), 9000, "Benutzer");
  if (r.error) throw r.error;
  let parks = [];
  try {
    const p = await alt.zeitlimit(alt.db.from("machine_parks").select("id, name").eq("is_active", true).order("name"), 8000, "Parks");
    if (!p.error) parks = p.data || [];
  } catch (f) { /* ohne Parks geht es auch */ }
  // Wer schon eine PIN hat (nur ja/nein, nie die PIN selbst)
  let mitPin = null;
  if (bin) {
    try {
      const p = await alt.zeitlimit(alt.db.rpc("pin_vorhanden"), 8000, "PIN");
      if (!p.error && Array.isArray(p.data)) mitPin = new Set(p.data.map((x) => x.user_id));
    } catch (f) { /* ohne SQL gibt es noch keine PINs */ }
  }
  return { leute: r.data || [], parks, mitPin, nr: ++ladeNr };
}

function Benutzer({ bin }) {
  const { daten, fehler, neu } = useDaten(() => benutzerLaden(bin), []);
  if (fehler && !daten) return <p className="hinweis">Benutzer konnten nicht geladen werden: {alt.fehlertext(fehler)}</p>;
  if (!daten) return <div className="laedt">Wird geladen …</div>;
  // Neu aufgebaut bei jedem Laden: Die Liste hält Änderungen bis dahin selbst
  return <BenutzerListe key={daten.nr} {...daten} bin={bin} neu={neu} />;
}

function BenutzerListe({ leute: anfang, parks, mitPin, bin, neu }) {
  const [leute, setLeute] = useState(anfang);
  const ich = alt.profil && alt.profil.id;
  const ROLLEN = alt.ROLLEN;

  // Ändert Felder an einer Person. Die Liste zeigt die Änderung sofort
  // (ein Häkchen soll beim Klick umspringen, nicht erst nach dem
  // Speichern) und nimmt sie zurück, wenn das Speichern scheitert.
  const aendern = async (id, felder, gut) => {
    const vorher = leute.find((u) => u.id === id);
    const zurueck = {};
    Object.keys(felder).forEach((k) => { zurueck[k] = vorher ? vorher[k] : undefined; });
    setLeute((l) => l.map((u) => (u.id === id ? { ...u, ...felder } : u)));
    const { error } = await alt.db.from("profiles").update(felder).eq("id", id);
    if (error) {
      alt.meldung(alt.fehlertext(error), "fehler");
      setLeute((l) => l.map((u) => (u.id === id ? { ...u, ...zurueck } : u)));
      return false;
    }
    if ("ist_planer" in felder || "initialen" in felder) await alt.planerLaden();
    if (gut) alt.meldung(gut);
    return true;
  };

  const rolle = async (u, wert) => {
    const ok = await alt.nachfragen({ titel: "Rolle ändern?", text: "Neue Rolle: " + (ROLLEN[wert] || wert), bestaetigen: "Ja, ändern" });
    if (ok && await aendern(u.id, { role: wert }, "Rolle geändert.")) neu();
  };

  const plant = (u, an) => {
    const felder = { ist_planer: an };
    // Beim Anhaken ohne Kürzel gleich die Initialen vorschlagen
    if (an && !(u.initialen || "").trim()) {
      const k = kuerzelVorschlag(u.full_name);
      if (k) felder.initialen = k;
    }
    aendern(u.id, felder, "Gespeichert.");
  };

  const pinSetzen = async (u) => {
    const w = await alt.dialogFelder({
      titel: "PIN für " + (u.full_name || u.email || "Person"),
      text: "Die Person tippt danach auf ihre Kachel und gibt diese PIN ein. Ihr bisheriges Passwort gilt nicht "
        + "mehr. Sag ihr die PIN persönlich.",
      felder: [{ name: "pin", label: "PIN (4 bis 8 Ziffern, besser 6)", typ: "password", ziffern: true, pflicht: true }],
      bestaetigen: "PIN setzen" });
    if (!w) return;
    const pin = String(w.pin || "").trim();
    if (!/^\d{4,8}$/.test(pin)) { alt.meldung("Die PIN braucht 4 bis 8 Ziffern.", "warn"); return; }
    const { error } = await alt.db.rpc("pin_setzen", { p_pin: pin, p_ziel: u.id });
    if (error) {
      alt.meldung(/pin_setzen/.test(error.message || "")
        ? "Dafür fehlt noch pin-anmeldung.sql in der Datenbank." : alt.fehlertext(error), "fehler");
      return;
    }
    alt.meldung("PIN gesetzt.");
    neu();
  };

  // Passwort vergessen: Der Admin setzt ein neues, ohne das alte zu kennen.
  // Eine PIN fällt dabei weg, die Person meldet sich mit dem Passwort an.
  const passwortSetzen = async (u) => {
    const w = await alt.dialogFelder({
      titel: "Passwort für " + (u.full_name || u.email || "Person"),
      text: "Die Person meldet sich danach mit diesem Passwort an. Eine PIN gilt dann nicht mehr. Sag ihr das "
        + "Passwort persönlich.",
      felder: [
        { name: "pw", label: "Neues Passwort (mindestens 8 Zeichen)", typ: "password", pflicht: true },
        { name: "pw2", label: "Nochmals eingeben", typ: "password", pflicht: true }],
      bestaetigen: "Passwort setzen" });
    if (!w) return;
    if (String(w.pw || "").length < 8) { alt.meldung("Das Passwort braucht mindestens 8 Zeichen.", "warn"); return; }
    if (w.pw !== w.pw2) { alt.meldung("Die beiden Passwörter sind nicht gleich.", "warn"); return; }
    const { error } = await alt.db.rpc("passwort_setzen", { p_passwort: w.pw, p_ziel: u.id });
    if (error) {
      alt.meldung(/passwort_setzen/.test(error.message || "")
        ? "Dafür fehlt noch pin-anmeldung.sql in der Datenbank." : alt.fehlertext(error), "fehler");
      return;
    }
    alt.meldung("Passwort gesetzt.");
    neu();
  };

  const aktiv = async (u) => {
    const ein = !u.is_active;
    const ok = await alt.nachfragen({
      titel: ein ? "Benutzer aktivieren" : "Benutzer deaktivieren",
      text: ein ? "Die Person kann sich danach wieder anmelden." : "Die Person kann sich danach nicht mehr anmelden.",
      bestaetigen: ein ? "Aktivieren" : "Deaktivieren", gefahr: !ein });
    if (ok && await aendern(u.id, { is_active: ein })) neu();
  };

  const parkUmschalten = (u, parkId, an) => {
    const liste = (u.parks || []).filter((x) => x !== parkId);
    if (an) liste.push(parkId);
    aendern(u.id, { parks: liste }, "Zugriff gespeichert.");
  };

  const langDatum = (d) => (d ? alt.langDatum(d) : "–");

  return (
    <>
      <div className="tabellenrolle">
        <table className="tabelle tabelle--benutzer"><thead><tr>
          <th>Name</th><th>Rolle</th><th className="mitte">Bearbeiten</th>
          <th className="mitte">Plant</th><th className="mitte">Kürzel</th>
          <th>Geburtstag</th>{bin && <th>Anmeldung</th>}<th className="rechts">Status</th>
        </tr></thead>
        <tbody>{leute.map((u) => {
          const selbst = u.id === ich;
          return (
            <tr key={u.id} className={u.is_active ? "" : "zeile--inaktiv"}>
              <td><div className="bl-person">
                {bin
                  ? <BildWahl url={u.bild_url} name={u.full_name || u.email} kennung={u.id}
                      speichern={(adresse) => aendern(u.id, { bild_url: adresse }, adresse ? "Bild gespeichert." : "Bild entfernt.")} />
                  : <Bild url={u.bild_url} name={u.full_name || u.email} />}
                {bin
                  ? <Feld className="namensfeld-liste" data-name={u.id} wert={u.full_name} placeholder={u.email || ""}
                      speichern={(name) => aendern(u.id, { full_name: name || null }, "Name gespeichert.")} />
                  : <span>{u.full_name || u.email}</span>}
                {selbst && <> <span className="marke">du</span></>}
              </div></td>
              <td className="bu-rolle">{bin && !selbst
                ? <select className="auswahl" data-rolle={u.id} value={u.role || ""} onChange={(e) => rolle(u, e.target.value)}>
                    {Object.keys(ROLLEN).map((w) => <option key={w} value={w}>{ROLLEN[w]}</option>)}
                  </select>
                : (ROLLEN[u.role] || u.role)}</td>
              <td className="bu-bearb mitte">{bin && !selbst && u.role !== "admin"
                ? <input type="checkbox" data-bearb={u.id} checked={!!u.darf_bearbeiten}
                    onChange={(e) => aendern(u.id, { darf_bearbeiten: e.target.checked },
                      e.target.checked ? "Darf jetzt bearbeiten." : "Bearbeiten entzogen.")} />
                : (u.role === "admin" ? "immer" : (u.darf_bearbeiten ? "ja" : "nein"))}</td>
              <td className="bu-plant mitte">{bin
                ? <input type="checkbox" data-plan-ist={u.id} checked={!!u.ist_planer} onChange={(e) => plant(u, e.target.checked)} />
                : (u.ist_planer ? "ja" : "nein")}</td>
              <td className="bu-kuerzel mitte">{bin
                ? <Feld className="kuerzelfeld" data-plan-kuerzel={u.id} maxLength={4} gross wert={u.initialen}
                    speichern={(k) => aendern(u.id, { initialen: k || null }, "Kürzel gespeichert.")} />
                : (u.initialen || "–")}</td>
              <td className="bu-geb">{bin
                ? <input type="date" className="gebfeld" data-geb={u.id} value={u.geburtstag || ""}
                    onChange={(e) => aendern(u.id, { geburtstag: e.target.value || null }, "Geburtstag gespeichert.")} />
                : langDatum(u.geburtstag)}</td>
              {bin && <td className="bu-pin">
                <div className="bu-anmeldung">
                <button className="knopf knopf--mini" data-pinsetzen={u.id} onClick={() => pinSetzen(u)}>
                  {mitPin && mitPin.has(u.id) ? "PIN ändern" : "PIN setzen"}</button>
                {!selbst && <button className="knopf knopf--mini" data-pwsetzen={u.id} onClick={() => passwortSetzen(u)}>Passwort</button>}
                {mitPin && !mitPin.has(u.id) && u.ohne_passwort && <>{" "}<span className="bz-spaet"
                  title="Kommt erst mit PIN oder Passwort vom Admin wieder hinein">fehlt</span></>}
                </div>
              </td>}
              <td className="bu-status rechts">{bin && !selbst
                ? <button className="linkknopf" data-aktiv={u.id} data-wert={u.is_active ? "0" : "1"}
                    onClick={() => aktiv(u)}>{u.is_active ? "Deaktivieren" : "Aktivieren"}</button>
                : (u.is_active ? "aktiv" : "inaktiv")}</td>
            </tr>
          );
        })}</tbody></table>
      </div>

      {bin && parks.length > 0 && <>
        <div className="es-unterkopf">
          <h3>Zugriff auf Maschinenparks</h3>
          <p className="es-gruppe__text">Ohne Auswahl entscheidet die Rolle: Langdreher sieht Parks mit „lang“
            im Namen, Kurzdreher solche mit „kurz“.</p>
        </div>
        {leute.filter((u) => u.role !== "admin" && u.role !== "planwand").map((u) => (
          <div className="parkzeile" key={u.id}>
            <div className="parkzeile__name"><Bild url={u.bild_url} name={u.full_name || u.email} /><span>{u.full_name || u.email}</span></div>
            <div className="parkzeile__wahl">{parks.map((pk) => (
              <label className="parkchip" key={pk.id}>
                <input type="checkbox" data-pu={u.id} data-pp={pk.id} checked={(u.parks || []).includes(pk.id)}
                  onChange={(e) => parkUmschalten(u, pk.id, e.target.checked)} />
                <span>{pk.name}</span></label>
            ))}</div>
          </div>
        ))}
      </>}
    </>
  );
}

// ---------- Personen ohne Login ----------

async function personenLaden() {
  const r = await alt.zeitlimit(alt.db.from("people").select("*").order("name"), 8000, "Personen");
  if (r.error) throw r.error;
  return r.data || [];
}

function Personen() {
  const { daten: leute, fehler, neu } = useDaten(personenLaden, []);
  const oeffnen = (person) => {
    alt.plan.imDialog = true;
    fensterOeffnen((zu) => <PersonFenster person={person} zu={zu} fertig={neu} />, () => { alt.plan.imDialog = false; });
  };
  const loeschen = async (m) => {
    const ok = await alt.nachfragen({ titel: "Person löschen", text: m.name + " wird aus der Liste entfernt.",
      bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const { error } = await alt.db.from("people").delete().eq("id", m.id);
    if (error) alt.meldung(alt.fehlertext(error), "fehler");
    else { alt.meldung("Gelöscht."); neu(); }
  };

  let inhalt;
  if (fehler && !leute) inhalt = <p className="hinweis">Noch nicht verfügbar: {alt.fehlertext(fehler)}</p>;
  else if (!leute) inhalt = <div className="laedt">Wird geladen …</div>;
  else if (!leute.length) inhalt = <p className="es-leer">Noch niemand eingetragen.</p>;
  else {
    inhalt = (
      <table className="tabelle"><tbody>{leute.map((m) => (
        <tr key={m.id}>
          <td><div className="bl-person"><Bild url={m.bild_url} name={m.name} /><span>{m.name}</span></div></td>
          <td className="klein">{m.geburtstag ? alt.langDatum(m.geburtstag) : "–"}</td>
          <td className="rechts nowrap">
            <button className="linkknopf" data-pe={m.id} onClick={() => oeffnen(m)}>Bearbeiten</button>
            <button className="linkknopf linkknopf--gefahr" data-peweg={m.id} data-name={m.name}
              onClick={() => loeschen(m)}>Löschen</button>
          </td>
        </tr>
      ))}</tbody></table>
    );
  }
  return (
    <Gruppe titel="Personen ohne Login"
      text="Für Kollegen, die die App nicht benutzen, deren Geburtstag aber auf der Startseite erscheinen soll."
      aktionen={<button className="knopf knopf--klein" id="pe-neu" onClick={() => oeffnen(null)}>+ Person</button>}>
      <div id="personenliste">{inhalt}</div>
    </Gruppe>
  );
}

function PersonFenster({ person, zu, fertig }) {
  const [name, setName] = useState(person ? person.name || "" : "");
  const [geb, setGeb] = useState(person ? person.geburtstag || "" : "");
  const [bild, setBild] = useState(person ? person.bild_url || null : null);

  const bildWaehlen = async (e) => {
    const f = (e.target.files || [])[0];
    e.target.value = "";
    if (!f) return;
    try {
      const adresse = await bildHochladen(f, "person/" + Date.now() + ".jpg");
      if (!adresse) return;
      setBild(adresse);
      alt.meldung("Bild übernommen.");
    } catch (f2) { alt.meldung(alt.fehlertext(f2), "fehler"); }
  };

  const speichern = async () => {
    const n = name.trim();
    if (!n) { alt.meldung("Bitte einen Namen eintragen.", "warn"); return; }
    const daten = { name: n, geburtstag: geb || null, bild_url: bild };
    const { error } = person
      ? await alt.db.from("people").update(daten).eq("id", person.id)
      : await alt.db.from("people").insert(daten);
    zu();
    if (error) alt.meldung(alt.fehlertext(error), "fehler");
    else { alt.meldung("Gespeichert."); fertig(); }
  };

  return (
    <div className="dialog">
      <h2>{person ? "Person bearbeiten" : "Neue Person"}</h2>
      <div className="kontokopf">
        {bild
          ? <img className="profilbild-gross" id="pd-vorschau" src={bild} alt="" />
          : <span className="profilbild-gross kopf__bild--leer" id="pd-vorschau">{(name || "?").charAt(0).toUpperCase()}</span>}
        <label className="knopf bildknopf">Bild wählen<input type="file" id="pd-datei" accept="image/*" hidden onChange={bildWaehlen} /></label>
        {bild && <button type="button" className="knopf knopf--still" id="pd-bildweg" onClick={() => setBild(null)}>Entfernen</button>}
      </div>
      <label className="feld"><span>Name</span>
        <input type="text" id="pd-name" data-fokus="" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="feld"><span>Geburtstag</span>
        <input type="date" id="pd-geb" value={geb} onChange={(e) => setGeb(e.target.value)} /></label>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" id="pd-nein" data-nein="" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" id="pd-ja" onClick={speichern}>Speichern</button>
      </div>
    </div>
  );
}
