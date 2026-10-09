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
import { wiederOeffner } from "../teile/wiederherstellen.js";
import { zuschneiden } from "../teile/Zuschnitt.jsx";
import Dokumente from "./Dokumente.jsx";
import Farben from "./Farben.jsx";
import Symbole from "./Symbole.jsx";
import Nutzer from "./Nutzer.jsx";
import Sicherung from "./Sicherung.jsx";
import { bestellmailOeffnen } from "./Bestellmail.jsx";
import { Gruppe, Zeile, SchalterZeile, ReiterZeichen } from "./teile.jsx";

// Wer nicht Admin ist, sieht nur „Allgemein“ (Wunsch Patrick,
// 7. Oktober 2026: „für alle nicht Admins nur Allgemein sichtbar“).
// Ausnahme: Das Konto Planwand sieht auch „Dokumente“ und „Backup“
// (111.123.0) und seit 111.124.0 alles wie ein Admin ausser „Nutzer“
// (Wunsch Patrick, 9. Oktober 2026: „Planwand soll bei Einstellungen
// alles machen können wie Admin“), erkannt an darfDokumenteUndSicherung().
// Nutzer (Passwörter anderer, PINs anderer, Rollen) bleibt bei Admins. true = nur Admins, "dok" = Admins und Planwand.
const REITER = [["allgemein", "Allgemein"], ["dokumente", "Dokumente", "dok"], ["backup", "Backup", "dok"],
                ["fehler", "Fehlerprotokoll", "dok"], ["farben", "Farben und Material", "dok"],
                ["symbole", "Symbole", "dok"],
                ["nutzer", "Nutzer", true]];

const THEMEN = [["blau", "Blau"], ["rot", "Rot"], ["gruen", "Grün"], ["gelb", "Gelb"],
                ["rosa", "Rosa"], ["violett", "Violett"], ["orange", "Orange"]];

export function einstellungenOeffnen() {
  if (document.querySelector(".dialog--einstellungen")) return;
  alt.plan.imDialog = true;
  // Nach dem Neuladen wieder offen, im selben Reiter (alt.einst.reiter)
  fensterOeffnen((zu) => <Einstellungen zu={zu} />, () => { alt.plan.imDialog = false; }, null,
    { art: "einstellungen" });
}
wiederOeffner("einstellungen", () => einstellungenOeffnen());

function Einstellungen({ zu }) {
  const bin = alt.istAdmin();
  // Nur Reiter, für die man die Rechte hat. War zuletzt einer offen,
  // den diese Person nicht sehen darf — etwa weil vorher ein Admin
  // am selben Gerät angemeldet war —, geht es auf den ersten zurück.
  const dok = alt.darfDokumenteUndSicherung();
  const reiter = REITER.filter(([, , wer]) => !wer || bin || (wer === "dok" && dok));
  if (!reiter.some(([w]) => w === alt.einst.reiter)) alt.einst.reiter = reiter[0][0];
  const [offen, setOffen] = useState(alt.einst.reiter);
  const waehlen = (w) => { alt.einst.reiter = w; setOffen(w); };

  let inhalt;
  if (offen === "allgemein") inhalt = <Allgemein bin={bin} />;
  else if (offen === "backup") inhalt = <Backup />;
  else if (offen === "fehler") inhalt = <Fehlerprotokoll />;
  else if (offen === "dokumente") inhalt = <Dokumente />;
  else if (offen === "farben") inhalt = <Farben />;
  else if (offen === "symbole") inhalt = <Symbole />;
  else inhalt = <Nutzer />;

  return (
    <div className="dialog dialog--breit dialog--einstellungen es">
      <div className="einstellungenkopf">
        <h1 className="seitentitel">Einstellungen</h1>
        {/* Der Ablauf (Nachfrage, Abmelden, Aufräumen) liegt im alten Programm */}
        <button className="knopf knopf--gefahr" id="ab"
          onClick={() => window.abmeldenFragen && window.abmeldenFragen()}>Abmelden</button>
        <button className="dialog__schliessen-inline" title="Schliessen" data-zu="" onClick={zu}>✕</button>
      </div>
      {/* Breit: Reiter als Leiste links, der Inhalt rollt daneben.
          Schmal: Reiter oben zum Wischen. */}
      <div className="es-rumpf">
        <nav className="reiter es-reiter" aria-label="Bereiche der Einstellungen">
          {reiter.map(([w, t]) => (
            <button key={w} className={"reiter__knopf es-reiter__knopf" + (offen === w ? " aktiv" : "")}
              data-einst={w} aria-current={offen === w ? "page" : undefined}
              onClick={() => waehlen(w)}><ReiterZeichen name={w} /><span>{t}</span></button>
          ))}
        </nav>
        <div id="einst-inhalt" className="es-inhalt" key={offen}>{inhalt}</div>
      </div>
    </div>
  );
}

// ---------- Allgemein ----------

function Allgemein({ bin }) {
  return (
    <>
      <MeinKonto />
      <Darstellung />
      {(bin || alt.darfDokumenteUndSicherung()) && <Bestellmail />}
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
  const [mitSchutz, setMitSchutz] = useState(null);
  const admin = alt.istAdmin();
  // Passwort und PIN ändert jeder an seinem eigenen Konto (Wunsch Patrick,
  // 9. Oktober 2026), nur Gerätekonten („Andere Nutzer“) und das
  // Dienstkonto nicht. Die Datenbank prüft dasselbe (sql/eigenes-passwort.sql).
  const selbst = admin || (!alt.istAndererNutzer() && profil.role !== "dienst");
  // Ganz ohne Passwort, also ein Tipp auf die Kachel: nie für Externe
  const offenErlaubt = selbst && profil.role !== "extern";
  const db = alt.db;
  const { meldung, fehlertext } = alt;

  // ohne_passwort heisst „PIN“ oder „ganz offen“; das sagt erst pin_schutz
  useEffect(() => {
    if (!profil.ohne_passwort) return;
    db.rpc("pin_vorhanden").then((r) => {
      if (!r.error) setMitSchutz((r.data || []).some((z) => z.user_id === profil.id));
    });
  }, []);
  const offen = mitPin && mitSchutz === false;

  const bildWaehlen = async (e) => {
    const f = (e.target.files || [])[0];
    e.target.value = "";
    if (!f) return;
    try {
      const klein = await zuschneiden(f, { kante: 400 });
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
    setMitSchutz(true);
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

  // Passwort und PIN ganz weg: ein Tipp auf die Kachel genügt
  const ohneSchutz = async () => {
    const ja = await alt.nachfragen({
      titel: "Ohne Passwort anmelden?",
      text: "Danach kommt jeder mit einem Tipp auf deine Kachel in dein Konto. Dein Passwort und deine PIN "
        + "gelten nicht mehr.",
      bestaetigen: "Ohne Passwort" });
    if (!ja) return;
    const { error } = await db.rpc("ohne_passwort_setzen");
    if (error) {
      return meldung(/ohne_passwort_setzen/.test(error.message || "")
        ? "Dafür fehlt noch eigenes-passwort.sql in der Datenbank." : fehlertext(error), "fehler");
    }
    profil.ohne_passwort = true;
    setMitPin(true);
    setMitSchutz(false);
    meldung("Ab jetzt genügt ein Tipp auf deine Kachel.");
  };

  const anzeigename = name.trim() || profil.email || "";
  return (
    <>
      <Gruppe titel="Mein Konto">
        <div className="es-konto">
          {bild
            ? <img className="profilbild-gross" src={bild} alt="" />
            : <span className="profilbild-gross kopf__bild--leer">
                {(anzeigename || "?").charAt(0).toUpperCase()}</span>}
          <div className="es-konto__wer">
            <div className="es-konto__name">{anzeigename}</div>
            <div className="es-zeile__hinweis">{profil.email || ""}</div>
          </div>
          <label className="knopf knopf--klein bildknopf">Bild wählen
            <input type="file" id="mk-datei" accept="image/*" hidden onChange={bildWaehlen} /></label>
        </div>
        <Zeile titel="Anzeigename">
          <div className="es-eingabe">
            <input type="text" id="mn" aria-label="Anzeigename" value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") nameSpeichern(); }} />
            <button className="knopf knopf--klein" id="ns" onClick={nameSpeichern}>Speichern</button>
          </div>
        </Zeile>
        <Zeile titel="Geburtstag" text="Erscheint auf der Startseite, wenn er in den nächsten zwei Wochen ansteht.">
          <input type="date" id="mk-geburtstag" className="es-schmal" aria-label="Geburtstag" value={geburtstag}
            onChange={(e) => geburtstagSpeichern(e.target.value)} />
        </Zeile>
      </Gruppe>

      <Gruppe titel="Anmeldung" text={(offen
        ? "Du kommst zurzeit ohne Passwort hinein, mit einem Tipp auf deine Kachel."
        : mitPin
        ? "Du meldest dich zurzeit mit deiner PIN an."
        : "Du meldest dich zurzeit mit deinem Passwort an.")
        + (selbst ? "" : " Passwort und PIN ändert ein Administrator.")}>
        {selbst && <>
        <Zeile titel="Neues Passwort" text={offen ? "Ab dann wieder mit Passwort." : mitPin ? "Ersetzt deine PIN." : undefined}>
          <div className="es-eingabe">
            <input type="password" id="np" aria-label="Neues Passwort" autoComplete="new-password" value={passwort}
              onChange={(e) => setPasswort(e.target.value)} />
            <button className="knopf knopf--klein" id="ps" onClick={passwortAendern}>Passwort ändern</button>
          </div>
        </Zeile>
        <Zeile titel="PIN statt Passwort" text="Ersetzt das Passwort: Kachel antippen und PIN eingeben.">
          <div className="es-eingabe es-eingabe--pin">
            <input type="password" id="mk-pin" aria-label="PIN" inputMode="numeric" pattern="[0-9]*" maxLength={8}
              autoComplete="new-password" placeholder="4 bis 8 Ziffern" value={pin}
              onChange={(e) => setPin(e.target.value)} />
            <input type="password" id="mk-pin2" aria-label="PIN wiederholen" inputMode="numeric" pattern="[0-9]*"
              maxLength={8} autoComplete="new-password" placeholder="wiederholen" value={pin2}
              onChange={(e) => setPin2(e.target.value)} />
            <button className="knopf knopf--klein" id="mk-pinknopf" onClick={pinSpeichern}>PIN speichern</button>
          </div>
          {mitPin && !offen && <button className="linkknopf es-unterlink" id="mk-pinweg" onClick={pinWeg}>
            PIN entfernen und wieder mit Passwort anmelden</button>}
        </Zeile>
        {offenErlaubt && !offen && <Zeile titel="Ohne Passwort"
          text="Passwort und PIN löschen: ein Tipp auf deine Kachel genügt.">
          <button className="knopf knopf--klein" id="mk-offen" onClick={ohneSchutz}>Ohne Passwort</button>
        </Zeile>}
        </>}
        {alt.istAndererNutzer()
          ? <SchalterZeile id="mk-merken" titel="Auf diesem Gerät merken"
              text="Dieses Konto bleibt immer angemeldet, auch nach dem Schliessen." checked disabled />
          : <SchalterZeile id="mk-merken" titel="Auf diesem Gerät merken"
              text="Ein Tipp auf deine Kachel genügt hier, auch nach dem Abmelden."
              checked={merken} onChange={merkenAendern} />}
      </Gruppe>
    </>
  );
}

function Schalter({ id, name, titel, text, beiAenderung }) {
  return (
    <SchalterZeile id={id} titel={titel} text={text} defaultChecked={alt.einstellung(name)}
      onChange={(e) => {
        alt.einstellungSetzen(name, e.target.checked);
        if (beiAenderung) beiAenderung(e.target.checked);
      }} />
  );
}

function Darstellung() {
  const [thema, setThema] = useState(alt.themaJetzt());
  return (
    <Gruppe titel="Darstellung">
      <Zeile titel="Themenfarbe">
        <div className="themawahl">
          {THEMEN.map(([w, t]) => (
            <button key={w} type="button" className={"themaknopf themaknopf--" + w + (thema === w ? " aktiv" : "")}
              data-thema={w} aria-pressed={thema === w} onClick={() => { alt.themaSetzen(w); setThema(w); }}>
              <span className="themaknopf__punkt" />{t}</button>
          ))}
        </div>
      </Zeile>
      <Schalter id="e-dunkel" name="dunkel" titel="Dunkler Modus"
        beiAenderung={(an) => document.body.classList.toggle("dunkel", an)} />
      <Schalter id="e-wochestart" name="wochestart" titel="Erfassung mit der Woche öffnen"
        text="Sonst öffnet die Erfassung mit dem Tag." />
      {/* Sofort wirksam, nicht erst nach dem nächsten Anmelden. Andere
          Nutzer (Planwand, Päckli Pad …) werden nie von selbst abgemeldet,
          da gibt es nichts zu wählen (Wunsch Patrick, 8. Oktober 2026). */}
      {alt.istAndererNutzer()
        ? <SchalterZeile id="e-angemeldet" titel="Angemeldet bleiben"
            text="Dieses Konto wird nie von selbst abgemeldet." checked disabled />
        : <Schalter id="e-angemeldet" name="angemeldetbleiben" titel="Angemeldet bleiben"
            text="Ohne meldet sich die App nach fünf Minuten ohne Bedienung selbst ab."
            beiAenderung={() => { if (window.untaetigNeuStarten) window.untaetigNeuStarten(); }} />}
    </Gruppe>
  );
}

// Text der Bestellmail (Admins und Planwand seit 111.124.0, eigenes
// Fenster). Den PIN der Planwand gibt es nicht mehr (9. Oktober 2026).
function Bestellmail() {
  return (
    <Gruppe titel="Für alle">
      {/* Der Text steht nicht mehr hier, sondern im eigenen Fenster mit Vorschau */}
      <Zeile titel="Text für Bestellmails" text="Die Mail an den Lieferanten mit Logos und Links.">
        <button className="knopf knopf--klein" id="bestellmail-oeffnen" onClick={bestellmailOeffnen}>Text bearbeiten</button>
      </Zeile>
    </Gruppe>
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
  return (
    <p className="es-fuss">Version {alt.APP_VERSION} ·{" "}
      <span id="dateistand">{stand}</span></p>
  );
}

// ---------- Backup ----------

// „Planwand als Excel“ ist weg (Wunsch Patrick 8. Oktober 2026)
function Backup() {
  return <Sicherung />;
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
    <Gruppe titel="Fehlerprotokoll"
      text={(liste.length === 1 ? "1 Eintrag" : liste.length + " Einträge") + " auf diesem Gerät"}
      aktionen={liste.length > 0 && <>
        <button className="linkknopf linkknopf--gefahr" id="fp-leeren" onClick={leeren}>Leeren</button>
        <button className="knopf knopf--klein" id="fp-datei" onClick={() => alt.fehlerAlsDatei()}>
          Als Datei herunterladen</button>
      </>}>
      {liste.length
        ? <>
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
        : <div className="es-leer"><span className="es-leer__zeichen" aria-hidden="true">✓</span>
            Keine Fehler aufgezeichnet.</div>}
    </Gruppe>
  );
}
