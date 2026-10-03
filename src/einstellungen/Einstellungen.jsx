// =================================================================
//  EINSTELLUNGEN
//  Fenster mit Reitern. Allgemein, Backup und Fehlerprotokoll sind
//  hier, Dokumente, Farben und Material sowie Nutzer in eigenen
//  Dateien daneben.
//
//  Welcher Reiter zuletzt offen war, merkt sich einst.reiter im alten
//  Programm, damit das Fenster beim nächsten Öffnen dort weitermacht.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import Dokumente from "./Dokumente.jsx";
import Farben from "./Farben.jsx";
import Nutzer from "./Nutzer.jsx";

const REITER = [["allgemein", "Allgemein"], ["dokumente", "Dokumente"], ["backup", "Backup"],
                ["fehler", "Fehlerprotokoll"], ["farben", "Farben und Material", true],
                ["nutzer", "Nutzer", true]];

const THEMEN = [["blau", "Blau"], ["rot", "Rot"], ["gruen", "Grün"], ["gelb", "Gelb"],
                ["rosa", "Rosa"], ["violett", "Violett"], ["orange", "Orange"]];

export function einstellungenOeffnen() {
  if (document.querySelector(".dialog--einstellungen")) return;
  alt.plan.imDialog = true;
  fensterOeffnen((zu) => <Einstellungen zu={zu} />, () => { alt.plan.imDialog = false; });
}

function Einstellungen({ zu }) {
  const bin = alt.istAdmin();
  // Nur Reiter, für die man die Rechte hat. War zuletzt einer offen,
  // den diese Person nicht sehen darf — etwa weil vorher ein Admin
  // am selben Gerät angemeldet war —, geht es auf den ersten zurück.
  const reiter = REITER.filter(([, , nurAdmin]) => bin || !nurAdmin);
  if (!reiter.some(([w]) => w === alt.einst.reiter)) alt.einst.reiter = reiter[0][0];
  const [offen, setOffen] = useState(alt.einst.reiter);
  const waehlen = (w) => { alt.einst.reiter = w; setOffen(w); };

  let inhalt;
  if (offen === "allgemein") inhalt = <Allgemein bin={bin} />;
  else if (offen === "backup") inhalt = <Backup />;
  else if (offen === "fehler") inhalt = <Fehlerprotokoll />;
  else if (offen === "dokumente") inhalt = <Dokumente />;
  else if (offen === "farben") inhalt = <Farben />;
  else inhalt = <Nutzer />;

  return (
    <div className="dialog dialog--breit dialog--einstellungen">
      <div className="einstellungenkopf">
        <h1 className="seitentitel">Einstellungen</h1>
        {/* Der Ablauf (Nachfrage, Abmelden, Aufräumen) liegt im alten Programm */}
        <button className="knopf knopf--gefahr" id="ab"
          onClick={() => window.abmeldenFragen && window.abmeldenFragen()}>Abmelden</button>
        <button className="dialog__schliessen-inline" title="Schliessen" data-zu="" onClick={zu}>✕</button>
      </div>
      <div className="reiter">
        {reiter.map(([w, t]) => (
          <button key={w} className={"reiter__knopf" + (offen === w ? " aktiv" : "")}
            data-einst={w} onClick={() => waehlen(w)}>{t}</button>
        ))}
      </div>
      <div id="einst-inhalt" key={offen}>{inhalt}</div>
    </div>
  );
}

// ---------- Allgemein ----------

function Allgemein({ bin }) {
  return (
    <>
      <MeinKonto />
      <Darstellung />
      {bin && <PinUndMail />}
      <UeberDieApp />
    </>
  );
}

function MeinKonto() {
  const profil = alt.profil || {};
  const [bild, setBild] = useState(profil.bild_url || null);
  const [name, setName] = useState(profil.full_name || "");
  const [geburtstag, setGeburtstag] = useState(profil.geburtstag || "");
  const [passwort, setPasswort] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [mitPin, setMitPin] = useState(!!profil.ohne_passwort);
  const [merken, setMerken] = useState(() => alt.sitzungGemerkt(profil.email));
  const db = alt.db;
  const { meldung, fehlertext } = alt;

  const bildWaehlen = async (e) => {
    const f = (e.target.files || [])[0];
    if (!f) return;
    try {
      const klein = await alt.bildZuschneiden(f, 400);
      if (!klein) return;
      const pfad = "profil/" + profil.id + "-" + Date.now() + ".jpg";
      const r = await db.storage.from("profilbilder").upload(pfad, klein, { contentType: "image/jpeg" });
      if (r.error) throw r.error;
      const url = db.storage.from("profilbilder").getPublicUrl(pfad).data.publicUrl;
      const u = await db.from("profiles").update({ bild_url: url }).eq("id", profil.id);
      if (u.error) throw u.error;
      profil.bild_url = url;
      setBild(url);
      meldung("Bild gespeichert.");
    } catch (f2) { meldung(fehlertext(f2), "fehler"); }
  };

  const nameSpeichern = async () => {
    const n = name.trim();
    const { error } = await db.from("profiles").update({ full_name: n }).eq("id", profil.id);
    if (error) return meldung(fehlertext(error), "fehler");
    profil.full_name = n;
    // Die Kopfzeile setzt den Namen nur beim Aufbau; hier gleich nachziehen
    const anz = document.querySelector("[data-benutzername]");
    if (anz) anz.textContent = n || profil.email;
    meldung("Name gespeichert.");
  };

  const geburtstagSpeichern = async (wert) => {
    setGeburtstag(wert);
    const { error } = await db.from("profiles").update({ geburtstag: wert || null }).eq("id", profil.id);
    if (error) meldung(fehlertext(error), "fehler");
    else { profil.geburtstag = wert || null; meldung("Gespeichert."); }
  };

  // Gerät merken: der Schlüssel der laufenden Sitzung wird aufgehoben
  const merkenAendern = async (e) => {
    const an = e.target.checked;
    setMerken(an);
    const s = await alt.sitzung();
    alt.sitzungMerken(profil.email, an && s ? s.refresh_token : null);
    meldung(an ? "Dieses Gerät merkt sich deine Anmeldung."
      : "Dieses Gerät fragt ab jetzt wieder nach Passwort oder PIN.");
  };

  // Ein eigenes Passwort ersetzt die PIN
  const pinAufheben = async () => {
    const r = await db.rpc("pin_entfernen");
    if (r.error) await db.from("profiles").update({ ohne_passwort: false }).eq("id", profil.id);
    profil.ohne_passwort = false;
    setMitPin(false);
  };

  const passwortAendern = async () => {
    // Keine Längenvorgabe — ein einzelnes Zeichen genügt. Leer bleibt
    // trotzdem unzulässig, sonst hätte das Konto gar keines.
    if (!passwort) return meldung("Bitte ein Passwort eingeben.", "warn");
    const { error } = await db.auth.updateUser({ password: passwort });
    if (error) return meldung(fehlertext(error), "fehler");
    setPasswort("");
    if (profil.ohne_passwort) await pinAufheben();
    profil.ohne_passwort = false;
    setMitPin(false);
    meldung("Passwort geändert. Du meldest dich jetzt mit dem Passwort an.");
  };

  const pinSpeichern = async () => {
    const p = pin.trim(), p2 = pin2.trim();
    if (!/^\d{4,8}$/.test(p)) return meldung("Die PIN braucht 4 bis 8 Ziffern.", "warn");
    if (p !== p2) return meldung("Die beiden PINs sind nicht gleich.", "warn");
    const { error } = await db.rpc("pin_setzen", { p_pin: p });
    if (error) {
      return meldung(/pin_setzen/.test(error.message || "")
        ? "Dafür fehlt noch pin-anmeldung.sql in der Datenbank." : fehlertext(error), "fehler");
    }
    setPin(""); setPin2("");
    profil.ohne_passwort = true;
    setMitPin(true);
    meldung("PIN gespeichert. Ab jetzt: Kachel antippen und PIN eingeben.");
  };

  // PIN entfernen: erst ein neues Passwort, sonst wäre das Konto ohne Schutz
  const pinWeg = async () => {
    const w = await alt.dialogFelder({
      titel: "PIN entfernen",
      text: "Damit dein Konto geschützt bleibt, braucht es dafür ein Passwort.",
      felder: [{ name: "pw", label: "Neues Passwort", typ: "password", pflicht: true }],
      bestaetigen: "Speichern",
    });
    if (!w || !(w.pw || "")) return meldung("Kein Passwort eingegeben. Nichts geändert.", "warn");
    const r = await db.auth.updateUser({ password: w.pw });
    if (r.error) return meldung(fehlertext(r.error), "fehler");
    await pinAufheben();
    meldung("PIN entfernt. Du meldest dich jetzt mit dem Passwort an.");
  };

  return (
    <section className="karte"><h2>Mein Konto</h2>
      <div className="kontokopf">
        {bild
          ? <img className="profilbild-gross" src={bild} alt="" />
          : <span className="profilbild-gross kopf__bild--leer">
              {((profil.full_name || profil.email) || "?").charAt(0).toUpperCase()}</span>}
        <label className="knopf bildknopf">Bild wählen
          <input type="file" id="mk-datei" accept="image/*" hidden onChange={bildWaehlen} /></label>
      </div>
      <label className="feld"><span>Anzeigename</span>
        <input type="text" id="mn" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <button className="knopf" id="ns" onClick={nameSpeichern}>Name speichern</button>
      <label className="feld feld--abstand"><span>Geburtstag</span>
        <input type="date" id="mk-geburtstag" value={geburtstag}
          onChange={(e) => geburtstagSpeichern(e.target.value)} />
        <span className="feldhinweis">Erscheint auf der Startseite, wenn er in den
          nächsten zwei Wochen ansteht.</span></label>
      <label className="feld feld--abstand"><span>Neues Passwort</span>
        <input type="password" id="np" autoComplete="new-password" value={passwort}
          onChange={(e) => setPasswort(e.target.value)} /></label>
      <button className="knopf" id="ps" onClick={passwortAendern}>Passwort ändern</button>
      <label className="feld feld--abstand"><span>PIN statt Passwort</span>
        <input type="password" id="mk-pin" inputMode="numeric" pattern="[0-9]*" maxLength={8}
          autoComplete="new-password" placeholder="4 bis 8 Ziffern" value={pin}
          onChange={(e) => setPin(e.target.value)} /></label>
      <label className="feld"><span>PIN wiederholen</span>
        <input type="password" id="mk-pin2" inputMode="numeric" pattern="[0-9]*" maxLength={8}
          autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value)} /></label>
      <button className="knopf" id="mk-pinknopf" onClick={pinSpeichern}>PIN speichern</button>
      <p className="hinweis">Danach tippst du auf deine Kachel und gibst die PIN ein. Das
        bisherige Passwort gilt nicht mehr. Nach 5 falschen Versuchen ist das Konto
        5 Minuten gesperrt. 6 Ziffern sind deutlich sicherer als 4.</p>
      {mitPin && <button className="linkknopf" id="mk-pinweg" onClick={pinWeg}>
        PIN entfernen und wieder mit Passwort anmelden</button>}
      <label className="schalter feld--abstand"><input type="checkbox" id="mk-merken"
        checked={merken} onChange={merkenAendern} />
        <span>Auf diesem Gerät merken</span></label>
      <p className="hinweis">Mit Haken genügt auf diesem Gerät ein Tipp auf deine Kachel,
        auch nach dem Abmelden. Ohne Haken fragt es jedes Mal nach Passwort oder PIN.</p>
    </section>
  );
}

function Schalter({ id, name, text, beiAenderung }) {
  return (
    <label className="schalter">
      <input type="checkbox" id={id} defaultChecked={alt.einstellung(name)} onChange={(e) => {
        alt.einstellungSetzen(name, e.target.checked);
        if (beiAenderung) beiAenderung(e.target.checked);
      }} />
      <span>{text}</span>
    </label>
  );
}

function Darstellung() {
  const [thema, setThema] = useState(alt.themaJetzt());
  return (
    <section className="karte"><h2>Darstellung</h2>
      <p className="hinweis">Die Themenfarbe gilt überall — Menü, Knöpfe, Planwand und Pad Mode.</p>
      <div className="themawahl">
        {THEMEN.map(([w, t]) => (
          <button key={w} type="button" className={"themaknopf themaknopf--" + w + (thema === w ? " aktiv" : "")}
            data-thema={w} onClick={() => { alt.themaSetzen(w); setThema(w); }}>
            <span className="themaknopf__punkt" />{t}</button>
        ))}
      </div>
      <Schalter id="e-dunkel" name="dunkel" text="Dunkler Modus"
        beiAenderung={(an) => document.body.classList.toggle("dunkel", an)} />
      <Schalter id="e-wochenende" name="wochenende" text="Samstag und Sonntag in der Wochenansicht zeigen" />
      <Schalter id="e-wochestart" name="wochestart" text="Erfassung immer mit der Wochenansicht öffnen" />
      {/* Sofort wirksam, nicht erst nach dem nächsten Anmelden */}
      <Schalter id="e-angemeldet" name="angemeldetbleiben"
        text="Angemeldet bleiben — nicht nach fünf Minuten abmelden"
        beiAenderung={() => { if (window.untaetigNeuStarten) window.untaetigNeuStarten(); }} />
      <p className="hinweis">Gilt überall, wo du dich anmeldest. Ohne Haken meldet sich die
        App nach fünf Minuten ohne Bedienung selbst ab.</p>
    </section>
  );
}

// Nur für Administratoren: Pin der Rolle Planwand und Text der Bestellmail
function PinUndMail() {
  const [pin, setPin] = useState("");
  const [mail, setMail] = useState(alt.bestellmailText());
  const db = alt.db;
  const { meldung, fehlertext } = alt;

  useEffect(() => {
    let weg = false;
    (async () => {
      try {
        const r = await alt.zeitlimit(db.from("app_config").select("wert")
          .eq("schluessel", "planwand_pin").maybeSingle(), 8000, "Pin");
        if (!weg && !r.error && r.data) setPin(r.data.wert || "");
      } catch (f) { /* Tabelle gibt es vielleicht noch nicht */ }
    })();
    return () => { weg = true; };
  }, [db]);

  const pinSpeichern = async () => {
    const wert = pin.trim();
    if (!wert) { meldung("Bitte einen Pin eingeben.", "warn"); return; }
    const { error } = await db.from("app_config").upsert({ schluessel: "planwand_pin", wert });
    if (error) meldung(fehlertext(error), "fehler");
    else meldung("Pin gespeichert.");
  };
  const mailSpeichern = async () => {
    const wert = mail.trim();
    const { error } = await db.from("app_config")
      .upsert({ schluessel: "bestellmail_text", wert: wert || alt.BESTELLMAIL_VORGABE });
    if (error) { meldung(fehlertext(error), "fehler"); return; }
    alt.bestellmailSetzen(wert);
    meldung("Text gespeichert.");
  };

  return (
    <section className="karte"><h2>Pin für die Planwand</h2>
      <p className="hinweis">Wer die Rolle Planwand hat, schaltet damit das Bearbeiten frei. Gilt für alle.</p>
      <label className="feld"><span>Pin</span>
        <input type="text" id="pin-feld" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} /></label>
      <label className="feld"><span>Text für Bestellmails</span>
        <textarea id="bestellmail-feld" rows={9} value={mail} onChange={(e) => setMail(e.target.value)} />
        <span className="feldhinweis">Steht in jeder Bestellmail über dem PDF.
          {" {datum}, {name} und {lieferant} werden ersetzt."}</span></label>
      <div className="knopfreihe">
        <button className="knopf knopf--klein" id="bestellmail-speichern" onClick={mailSpeichern}>Text speichern</button>
        <button className="linkknopf" id="bestellmail-vorgabe"
          onClick={() => setMail(alt.BESTELLMAIL_VORGABE)}>Vorgabe wiederherstellen</button>
      </div>
      <button className="knopf" id="pin-speichern" onClick={pinSpeichern}>Pin speichern</button>
    </section>
  );
}

// Zeigt, welche Datei der Server gerade ausliefert. Damit lässt sich
// unterscheiden, ob ein Upload nicht angekommen ist oder ob der
// Browser eine alte Fassung festhält.
function UeberDieApp() {
  const [stand, setStand] = useState("Dateistand wird geprüft …");
  useEffect(() => {
    let weg = false;
    (async () => {
      let text;
      try {
        const r = await fetch("./index.html?stand=" + Date.now(), { method: "HEAD", cache: "no-store" });
        const wann = r.headers.get("last-modified");
        text = wann ? "Datei vom " + new Date(wann).toLocaleString("de-CH") : "Dateistand unbekannt";
      } catch (f) { text = "Dateistand nicht abrufbar"; }
      if (!weg) setStand(text);
    })();
    return () => { weg = true; };
  }, []);
  const profil = alt.profil || {};
  return (
    <section className="karte"><h2>Über die App</h2>
      <p className="klein">Version {alt.APP_VERSION} · angemeldet als {profil.email || ""} ·{" "}
        <span id="dateistand">{stand}</span></p>
    </section>
  );
}

// ---------- Backup ----------

function Backup() {
  return (
    <>
      <section className="karte"><div className="karte__kopf"><h2>Planwand als Excel</h2></div>
        <p className="hinweis">Alle Aufträge der Planwand mit Maschine, Zeitraum, Zustand,
          Stückzahl, Material und Notiz als Tabelle — zum Ansehen, Weitergeben oder Aufheben.
          Ein zweites Blatt enthält die Maschinen.</p>
        <button className="knopf knopf--haupt" id="bk-excel" onClick={() => alt.planwandExcel()}>
          Excel herunterladen</button>
      </section>
      <section className="karte"><div className="karte__kopf"><h2>Sicherung der Datenbank</h2></div>
        <p className="hinweis">Die vollständige Sicherung macht Supabase mit dem Pro-Plan jeden Tag
          selbst, dazu kommt die Sicherung auf eurem Server mit <code>sicherung.ps1</code>.
          Die Excel-Datei oben ersetzt sie nicht, sie ist ein Stand zum Lesen.</p>
      </section>
    </>
  );
}

// ---------- Fehlerprotokoll ----------

function Fehlerprotokoll() {
  const [liste, setListe] = useState(() => alt.fehlerLesen().slice().reverse());
  const leeren = async () => {
    const ja = await alt.nachfragen({ titel: "Protokoll leeren?",
      text: "Alle Einträge auf diesem Gerät werden gelöscht.", bestaetigen: "Leeren", gefahr: true });
    if (!ja) return;
    localStorage.removeItem(alt.FEHLER_SCHLUESSEL);
    setListe([]);
  };
  return (
    <section className="karte">
      <div className="karte__kopf">
        <h2>Fehlerprotokoll</h2>
        <span className="klein">{liste.length} Einträge auf diesem Gerät</span>
        <div className="karte__aktionen">
          {liste.length > 0 && <>
            <button className="knopf knopf--klein" id="fp-datei" onClick={() => alt.fehlerAlsDatei()}>
              Als Datei herunterladen</button>
            <button className="linkknopf linkknopf--gefahr" id="fp-leeren" onClick={leeren}>Leeren</button>
          </>}
        </div>
      </div>
      {liste.length
        ? <>
            <p className="hinweis">Die Datei kannst du mir schicken, statt Screenshots zu machen.
              Jedes Gerät führt sein eigenes Protokoll.</p>
            <div className="tabellenrolle"><table className="tabelle fp-tabelle">
              <thead><tr><th>Zeit</th><th>Seite</th><th>Person</th><th>Meldung</th></tr></thead>
              <tbody>{liste.map((e, i) => (
                <tr key={i}>
                  <td className="klein nowrap">{alt.datumZeitKurz(e.zeit)}</td>
                  <td className="klein">{e.seite || ""}</td>
                  <td className="klein">{e.person || ""}</td>
                  <td>{e.art === "Programmfehler" && <><span className="marke marke--warn">intern</span> </>}
                    {e.text || ""}
                    {e.zusatz && <div className="klein gedaempft">{e.zusatz}</div>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </>
        : <p className="hinweis">Keine Fehler aufgezeichnet. So soll es sein.</p>}
    </section>
  );
}
