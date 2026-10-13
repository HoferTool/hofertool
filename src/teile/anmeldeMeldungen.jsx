// =================================================================
//  MELDUNGEN BEIM ANMELDEN (seit 1.44.0, Wunsch Patrick 13. Oktober
//  2026: „eine Meldung, die jeder Nutzer nach dem Anmelden zuerst
//  quittiert, bevor er weitermacht; um neue Funktionen zu erklären;
//  auch in den Einstellungen“)
//
//  Admins schreiben Meldungen unter Einstellungen → Allgemein. Nach
//  jeder Anmeldung (und jedem Start) holt die App die eingeschalteten
//  Meldungen, die diese Person noch nicht gelesen hat, und legt sie der
//  Reihe nach über alles. Weiter geht es nur mit „Gelesen“ (oder
//  Abmelden); Escape und Klick daneben tun bewusst nichts. Jede Meldung
//  kommt pro Person einmal (anmelde_quittungen).
//
//  Nicht für Externe (neue Funktionen nur auf Nachfrage), nicht für das
//  Dienstkonto und nicht für Gerätekonten („Andere Nutzer“ wie Planwand
//  und Pad Mode): Dort meldet sich keine Person an, die Meldung wäre
//  nach dem ersten Tipp für alle weg, die am Gerät arbeiten.
//
//  Ohne sql/anmelde-meldungen.sql fehlen die Tabellen: dann zeigt die
//  App einfach nichts, und die Einstellungen sagen, was fehlt.
// =================================================================
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { wiederOeffner } from "./wiederherstellen.js";
import { FettText, TextMitStil, stilWert } from "./FettText.jsx";

const TABELLE = "anmelde_meldungen";
const QUITTUNGEN = "anmelde_quittungen";
const ABLAGE = "zeichnungen";

// Bilder (Wunsch Patrick 13. Oktober 2026: „will auch Bilder reinmachen
// können“) liegen in der Ablage „zeichnungen“ unter meldungen/ und
// stehen als Liste hinten im Text: <!--bilder:["adresse", …]-->. So
// braucht es keine neue Spalte, und die Sicherung nimmt die Bilder mit,
// weil der Text auf sie verweist.
const BILDER = /<!--bilder:(\[[\s\S]*?\])-->\s*$/;

export function meldungTeilen(text) {
  text = text || "";
  const m = text.match(BILDER);
  let bilder = [];
  if (m) { try { bilder = JSON.parse(m[1]).filter((x) => typeof x === "string"); } catch (f) { /* ohne */ } }
  return { html: m ? text.slice(0, m.index) : text, bilder };
}

function meldungZusammen(html, bilder) {
  return (html || "") + (bilder && bilder.length ? "<!--bilder:" + JSON.stringify(bilder) + "-->" : "");
}

// Text und Bilder einer Meldung, wie sie nach dem Anmelden erscheint.
// Steht im Text „[Bild 2]“, kommt das zweite Bild genau dort hin
// (Wunsch Patrick 13. Oktober 2026: Bild gleich beim passenden Punkt);
// Bilder ohne solchen Platz stehen am Ende.
const BILD_PLATZ = /\[\s*Bild\s+(\d+)\s*\]/gi;

function Inhalt({ text }) {
  const { html, bilder } = meldungTeilen(text);
  const teile = [];
  const benutzt = new Set();
  let rest = 0, m;
  BILD_PLATZ.lastIndex = 0;
  const textStueck = (t, k) => {
    // Zeilenumbrüche direkt am Bild würden nur leere Zeilen machen
    t = t.replace(/^(\s*<br\s*\/?>)+|(<br\s*\/?>\s*)+$/gi, "");
    if (t.replace(/<[^>]*>|&nbsp;|\s/g, "")) teile.push(<div key={k}><FettText text={t} /></div>);
  };
  while ((m = BILD_PLATZ.exec(html))) {
    const nr = Number(m[1]) - 1;
    textStueck(html.slice(rest, m.index), "t" + m.index);
    rest = m.index + m[0].length;
    if (bilder[nr]) { benutzt.add(nr); teile.push(<Bild key={"b" + m.index} url={bilder[nr]} />); }
  }
  textStueck(html.slice(rest), "tende");
  bilder.forEach((b, i) => { if (!benutzt.has(i)) teile.push(<Bild key={"r" + i} url={b} />); });
  return <div className="anmeldemeldung__text">{teile}</div>;
}

function Bild({ url }) {
  // Bilder als data:-Adresse (eingefügt ohne Ablage) nicht als Link öffnen
  const bild = <img src={url} alt="" loading="eager" />;
  return /^https?:/.test(url)
    ? <a href={url} target="_blank" rel="noopener" className="anmeldemeldung__bild">{bild}</a>
    : <div className="anmeldemeldung__bild">{bild}</div>;
}

// Wer Meldungen bekommt: eine echte Person, kein Gerät, kein Externer
export function bekommtMeldungen(p) {
  return !!p && p.role !== "extern" && p.role !== "dienst" && !p.andere_nutzer && p.is_active !== false;
}

function datumText(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear();
}

function tabelleFehlt(f) {
  const t = String((f && (f.message || f.details || f.hint)) || "");
  return (f && (f.code === "42P01" || f.code === "PGRST205")) || /anmelde_(meldungen|quittungen)/.test(t);
}

// ---------- Nach dem Anmelden ----------

let sperre = null;   // { zu } solange das Feld offen ist

export async function meldungenNachAnmeldung() {
  try {
    const p = alt.profil;
    if (!bekommtMeldungen(p) || alt.istArchiv() || alt.istAndererNutzer()) return;
    if (sperre) return;
    const db = alt.db;
    // Zuerst nur die Kennungen: Text und Bilder können gross sein und
    // werden nur für die Meldungen geholt, die diese Person noch nicht kennt
    const [m, q] = await Promise.all([
      alt.zeitlimit(db.from(TABELLE).select("id").eq("aktiv", true), 10000, "Meldungen"),
      alt.zeitlimit(db.from(QUITTUNGEN).select("meldung_id").eq("user_id", p.id), 10000, "Quittungen"),
    ]);
    if (m.error || q.error) return;
    const gelesen = new Set((q.data || []).map((x) => x.meldung_id));
    const ids = (m.data || []).map((x) => x.id).filter((id) => !gelesen.has(id));
    if (!ids.length) return;
    const t = await alt.zeitlimit(db.from(TABELLE).select("id, titel, text, erstellt").in("id", ids)
      .order("erstellt", { ascending: true }), 30000, "Meldungen");
    const offen = (t.data || []).filter((x) => ids.includes(x.id))
      .sort((x, y) => (x.erstellt < y.erstellt ? -1 : 1));
    // Inzwischen abgemeldet oder jemand anderes angemeldet?
    if (t.error || !offen.length || alt.profil !== p) return;
    sperreZeigen(offen, p.id);
  } catch (f) {
    console.warn("Meldungen:", f && f.message);
  }
}

export function meldungenWeg() {
  if (sperre) sperre.zu();
}

function sperreZeigen(liste, userId) {
  const huelle = document.createElement("div");
  huelle.className = "anmeldemeldung-huelle";
  document.body.appendChild(huelle);
  const wurzel = createRoot(huelle);
  // Escape gehört hier niemandem: weder Fenster darunter schliessen noch
  // „Abmelden?“ fragen. Die Meldung geht nur mit „Gelesen“ weg.
  const taste = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  window.addEventListener("keydown", taste, true);
  const zu = () => {
    window.removeEventListener("keydown", taste, true);
    huelle.remove();
    queueMicrotask(() => wurzel.unmount());
    sperre = null;
  };
  sperre = { zu };
  wurzel.render(<Sperre liste={liste} userId={userId} zu={zu} />);
}

function Sperre({ liste, userId, zu }) {
  const [nr, setNr] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  const m = liste[nr];
  const gelesen = async () => {
    setLaeuft(true);
    try {
      const { error } = await alt.zeitlimit(
        alt.db.from(QUITTUNGEN).insert({ meldung_id: m.id, user_id: userId }), 10000, "Quittieren");
      // Schon quittiert (etwa im zweiten Tab): zählt als gelesen
      if (error && error.code !== "23505") throw error;
    } catch (f) {
      setLaeuft(false);
      alt.meldung("Nicht gespeichert: " + alt.fehlertext(f), "fehler");
      return;
    }
    setLaeuft(false);
    if (nr + 1 < liste.length) setNr(nr + 1);
    else zu();
  };
  // Die Frage „Abmelden?“ ist ein gewöhnliches Fenster: solange sie
  // offen ist, liegt die Meldung darunter, bei „Abbrechen“ wieder oben.
  const abmelden = async (e) => {
    if (!window.abmeldenFragen) return;
    const huelle = e.currentTarget.closest(".anmeldemeldung-huelle");
    if (huelle) huelle.classList.add("anmeldemeldung-huelle--unten");
    try { await window.abmeldenFragen(); } finally {
      if (huelle) huelle.classList.remove("anmeldemeldung-huelle--unten");
    }
  };
  return (
    <div className="dialog anmeldemeldung" role="alertdialog" aria-modal="true"
      aria-labelledby="am-titel" key={m.id}>
      <div className="anmeldemeldung__kopf">
        <span className="anmeldemeldung__marke">Neu im Hofer Tool</span>
        <span className="anmeldemeldung__datum">
          {datumText(m.erstellt)}{liste.length > 1 ? " · " + (nr + 1) + " von " + liste.length : ""}</span>
      </div>
      <h2 id="am-titel">{m.titel}</h2>
      <Inhalt text={m.text} />
      <div className="dialog__knoepfe anmeldemeldung__knoepfe">
        <button className="knopf knopf--still" onClick={abmelden}>Abmelden</button>
        <button className="knopf knopf--haupt" id="am-gelesen" onClick={gelesen} disabled={laeuft} autoFocus>
          {nr + 1 < liste.length ? "Gelesen, weiter" : "Gelesen"}</button>
      </div>
    </div>
  );
}

// ---------- Admins: Meldungen verwalten (Einstellungen → Allgemein) ----------

async function laden() {
  const db = alt.db;
  const [m, q, p] = await Promise.all([
    db.from(TABELLE).select("*").order("erstellt", { ascending: false }),
    db.from(QUITTUNGEN).select("meldung_id, user_id, am"),
    db.from("profiles").select("*"),
  ]);
  if (m.error) throw m.error;
  if (q.error) throw q.error;
  return { meldungen: m.data || [], quittungen: q.data || [], personen: (p.data || []) };
}

export async function meldungenVerwalten() {
  let daten;
  try {
    daten = await alt.zeitlimit(laden(), 15000, "Meldungen");
  } catch (f) {
    alt.meldung(tabelleFehlt(f)
      ? "In der Datenbank fehlt noch sql/anmelde-meldungen.sql."
      : alt.fehlertext(f), "fehler");
    return;
  }
  fensterOeffnen((zu) => <Verwalten anfang={daten} zu={zu} />, null, null, { art: "anmeldemeldungen" });
}

wiederOeffner("anmeldemeldungen", () => meldungenVerwalten());

// ---------- Vorschau am PC und am Handy ----------
// Die Meldung wird in echter Grösse auf einen Bildschirm von 1440 × 900
// (PC) oder 390 × 844 (Handy) gelegt und als Ganzes verkleinert, damit
// man sieht, wie viel Platz Text und Bilder dort wirklich brauchen.
const GERAETE = { pc: { b: 1440, h: 900, name: "PC" }, handy: { b: 390, h: 844, name: "Handy" } };

function geraeteVorschau(m) {
  fensterOeffnen((zu) => <GeraeteVorschau m={m} zu={zu} />, null, "am-vorschau-huelle");
}

function GeraeteVorschau({ m, zu }) {
  const [art, setArt] = useState(() => (window.innerWidth < 700 ? "handy" : "pc"));
  const g = GERAETE[art];
  const platzB = Math.min(window.innerWidth - 72, 1000);
  const platzH = window.innerHeight - 190;
  const mass = Math.min(1, platzB / g.b, platzH / g.h);
  return (
    <div className="dialog am-vorschau">
      <div className="am-vorschau__kopf">
        <h2>Vorschau</h2>
        <div className="am-vorschau__wahl" role="tablist" aria-label="Gerät">
          {Object.entries(GERAETE).map(([k, x]) => (
            <button key={k} role="tab" aria-selected={art === k} data-geraet={k}
              className={"knopf knopf--klein" + (art === k ? " knopf--haupt" : " knopf--still")}
              onClick={() => setArt(k)}>{x.name}</button>
          ))}
        </div>
        <button className="dialog__schliessen-inline" title="Schliessen" data-zu="" onClick={zu}>✕</button>
      </div>
      <div className="am-vorschau__buehne" style={{ width: g.b * mass, height: g.h * mass }}>
        <div className={"am-geraet am-geraet--" + art}
          style={{ width: g.b, height: g.h, transform: "scale(" + mass + ")" }}>
          <div className="am-geraet__huelle">
            <div className="dialog anmeldemeldung">
              <div className="anmeldemeldung__kopf">
                <span className="anmeldemeldung__marke">Neu im Hofer Tool</span>
                <span className="anmeldemeldung__datum">{datumText(m.erstellt)}</span>
              </div>
              <h2>{m.titel}</h2>
              <Inhalt text={m.text} />
              <div className="dialog__knoepfe anmeldemeldung__knoepfe">
                <button className="knopf knopf--still" tabIndex={-1}>Abmelden</button>
                <button className="knopf knopf--haupt" tabIndex={-1}>Gelesen</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="hinweis klein am-vorschau__fuss">So sieht es nach dem Anmelden aus{mass < 1 ? ", hier verkleinert" : ""}. Nichts wird gespeichert.</p>
    </div>
  );
}

// Eigenes Fenster statt dialogFelder, weil Bilder dazukommen: Titel,
// Text mit B, I, U und darunter die Bilder mit „Bild hinzufügen“ (auch
// Einfügen mit Strg + V). Ergebnis { titel, text, neu } oder null.
function bearbeitenDialog(m) {
  return new Promise((fertig) => {
    let ende = false;
    const raus = (w) => { if (!ende) { ende = true; fertig(w); } };
    fensterOeffnen((schliessen) => (
      <Bearbeiten m={m} fertig={(w) => { raus(w); schliessen(); }} />
    ), () => raus(null));
  });
}

async function bildHochladen(datei) {
  const blob = await alt.bildVerkleinern(datei, 1800);
  const pfad = "meldungen/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
  const r = await alt.zeitlimit(alt.db.storage.from(ABLAGE).upload(pfad, blob, { contentType: "image/jpeg" }),
    60000, "Bild hochladen");
  if (r.error) throw r.error;
  return alt.db.storage.from(ABLAGE).getPublicUrl(pfad).data.publicUrl;
}

function Bearbeiten({ m, fertig }) {
  const anfang = meldungTeilen(m ? m.text : "");
  const [titel, setTitel] = useState(m ? m.titel : "");
  const [bilder, setBilder] = useState(anfang.bilder);
  const [laedt, setLaedt] = useState(0);
  const [neu, setNeu] = useState("nein");
  const [fehlt, setFehlt] = useState(false);
  const wahl = useRef(null);

  const dazu = async (dateien) => {
    const liste = Array.from(dateien || []).filter((d) => /^image\//.test(d.type));
    if (!liste.length) return;
    setLaedt((n) => n + liste.length);
    for (const d of liste) {
      try {
        const url = await bildHochladen(d);
        setBilder((b) => [...b, url]);
      } catch (f) {
        alt.meldung("Bild nicht hochgeladen: " + alt.fehlertext(f), "fehler");
      }
      setLaedt((n) => n - 1);
    }
  };
  const einfuegen = (e) => {
    const d = Array.from((e.clipboardData && e.clipboardData.files) || []);
    if (d.some((x) => /^image\//.test(x.type))) { e.preventDefault(); dazu(d); }
  };
  // „[Bild n]“ an die Schreibmarke im Text, sonst ans Ende
  const inText = (i) => {
    const el = document.getElementById("am-text");
    if (!el) return;
    const sel = document.getSelection();
    if (!sel || !el.contains(sel.anchorNode)) {
      el.focus();
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
    }
    document.execCommand("insertText", false, "[Bild " + (i + 1) + "]");
  };
  const schieben = (i, r) => setBilder((b) => {
    const n = b.slice(); const j = i + r;
    if (j < 0 || j >= n.length) return b;
    [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const speichern = () => {
    if (!titel.trim()) { setFehlt(true); return; }
    const feld = document.getElementById("am-text");
    const html = feld ? stilWert(feld) : "";
    fertig({ titel: titel.trim(), text: meldungZusammen(html, bilder), neu });
  };

  // Vorschau (Wunsch Patrick 13. Oktober 2026: „beim Erstellen eine
  // Vorschau sehen, für PC und Handy“): nimmt den Stand der Felder, auch
  // ungespeichert, und zeigt die Meldung wie nach dem Anmelden.
  const vorschau = () => {
    const feld = document.getElementById("am-text");
    geraeteVorschau({ titel: titel.trim() || "(ohne Titel)",
      text: meldungZusammen(feld ? stilWert(feld) : "", bilder), erstellt: m ? m.erstellt : new Date().toISOString() });
  };
  return (
    <div className="dialog anmeldemeldung-bearbeiten" onPaste={einfuegen}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); dazu(e.dataTransfer.files); }}>
      <h2>{m ? "Meldung bearbeiten" : "Neue Meldung"}</h2>
      {!m && <p className="hinweis">Erscheint bei allen nach dem nächsten Anmelden, bis sie auf „Gelesen“ tippen.</p>}
      <label className="feld"><span>Titel</span>
        <input id="am-titel-feld" type="text" value={titel} data-fokus="" placeholder="z. B. Neu: Letzten Eintrag löschen"
          className={fehlt ? "fehlt" : ""} onChange={(e) => { setTitel(e.target.value); setFehlt(false); }} />
      </label>
      {fehlt && <p className="feld-fehler">Bitte einen Titel eingeben.</p>}
      <div className="feld"><span>Text</span>
        <TextMitStil id="am-text" wert={anfang.html} platzhalter="Was ist neu, wo findet man es, wie geht es?" />
      </div>
      <div className="feld"><span>Bilder</span>
        <div className="am-bilder">
          {bilder.map((b, i) => (
            <div key={b} className="am-bilder__eins">
              <img src={b} alt="" />
              <span className="am-bilder__nr">Bild {i + 1}</span>
              <button type="button" className="knopf knopf--klein am-bilder__intext" data-intext={i}
                title="„[Bild …]“ an der Schreibmarke in den Text setzen: dort erscheint das Bild"
                onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}
                onClick={() => inText(i)}>In Text</button>
              <div className="am-bilder__knoepfe">
                {bilder.length > 1 && <>
                  <button type="button" className="knopf knopf--klein knopf--still" title="Nach vorne"
                    disabled={i === 0} onClick={() => schieben(i, -1)}>‹</button>
                  <button type="button" className="knopf knopf--klein knopf--still" title="Nach hinten"
                    disabled={i === bilder.length - 1} onClick={() => schieben(i, 1)}>›</button></>}
                <button type="button" className="knopf knopf--klein am-bilder__weg" data-bildweg={i} title="Bild entfernen"
                  onClick={() => setBilder((x) => x.filter((y) => y !== b))}>✕</button>
              </div>
            </div>
          ))}
          {laedt > 0 && <div className="am-bilder__eins am-bilder__laedt">Lädt …</div>}
          <button type="button" className="am-bilder__dazu" id="am-bild-dazu" onClick={() => wahl.current.click()}>
            <span aria-hidden="true">+</span>Bild hinzufügen</button>
          <input ref={wahl} type="file" accept="image/*" multiple hidden id="am-bild-datei"
            onChange={(e) => { dazu(e.target.files); e.target.value = ""; }} />
        </div>
        <p className="hinweis klein">Am Computer auch Bild hierher ziehen oder mit Strg + V einfügen.
          „In Text“ setzt [Bild 1] an die Schreibmarke: dort erscheint das Bild, sonst steht es am Ende.</p>
      </div>
      {m && (
        <label className="feld"><span>Wer sie schon gelesen hat</span>
          <select id="am-neu-wahl" value={neu} onChange={(e) => setNeu(e.target.value)}>
            <option value="nein">Muss sie nicht nochmals lesen</option>
            <option value="ja">Bekommt sie nochmals</option>
          </select>
        </label>
      )}
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" id="am-vorschau" onClick={vorschau}>Vorschau</button>
        <button className="knopf knopf--still" data-nein="" onClick={() => fertig(null)}>Abbrechen</button>
        <button className="knopf knopf--haupt" id="am-speichern" disabled={laedt > 0} onClick={speichern}>
          {m ? "Speichern" : "Veröffentlichen"}</button>
      </div>
    </div>
  );
}

function Verwalten({ anfang, zu }) {
  const [daten, setDaten] = useState(anfang);
  const [offen, setOffen] = useState(null);   // id der Meldung, deren Leser gezeigt werden
  const neuLaden = async () => {
    try { setDaten(await laden()); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  const empfaenger = daten.personen.filter(bekommtMeldungen);
  const name = (id) => alt.personName(daten.personen.find((x) => x.id === id), "unbekannt");

  const neu = async () => {
    const e = await bearbeitenDialog(null);
    if (!e) return;
    const { error } = await alt.db.from(TABELLE).insert({ titel: e.titel.trim(), text: e.text || "" });
    if (error) { alt.meldung("Nicht gespeichert: " + alt.fehlertext(error), "fehler"); return; }
    alt.meldung("Veröffentlicht. Alle sehen sie beim nächsten Anmelden.", "gut");
    neuLaden();
  };
  const bearbeiten = async (m) => {
    const e = await bearbeitenDialog(m);
    if (!e) return;
    const { error } = await alt.db.from(TABELLE)
      .update({ titel: e.titel.trim(), text: e.text || "", geaendert: new Date().toISOString() }).eq("id", m.id);
    if (error) { alt.meldung("Nicht gespeichert: " + alt.fehlertext(error), "fehler"); return; }
    if (e.neu === "ja") {
      const r = await alt.db.from(QUITTUNGEN).delete().eq("meldung_id", m.id);
      if (r.error) alt.meldung("Gespeichert, aber nicht zurückgesetzt: " + alt.fehlertext(r.error), "warn");
      else alt.meldung("Gespeichert. Alle bekommen sie nochmals.", "gut");
    } else alt.meldung("Gespeichert.", "gut");
    neuLaden();
  };
  const umschalten = async (m) => {
    const { error } = await alt.db.from(TABELLE).update({ aktiv: !m.aktiv }).eq("id", m.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    neuLaden();
  };
  const weg = async (m) => {
    const ok = await alt.nachfragen({ titel: "Meldung löschen",
      text: "„" + m.titel + "“ wird gelöscht, mit allen Quittungen.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const { error } = await alt.db.from(TABELLE).delete().eq("id", m.id);
    if (error) { alt.meldung("Nicht gelöscht: " + alt.fehlertext(error), "fehler"); return; }
    alt.meldung("Gelöscht.");
    neuLaden();
  };
  const vorschau = (m) => geraeteVorschau(m);

  return (
    <div className="dialog dialog--breit anmeldemeldungen">
      <div className="blatt__kopf"><h2>Meldungen beim Anmelden</h2>
        <button className="knopf knopf--klein" id="am-neu" onClick={neu}>Neue Meldung …</button>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>
      <p className="hinweis">Jede eingeschaltete Meldung erscheint bei jeder Person einmal nach dem Anmelden,
        bis sie auf „Gelesen“ tippt. Nicht für Externe und Gerätekonten.</p>
      {daten.meldungen.length === 0 && <p className="hinweis">Noch keine Meldung.</p>}
      <ul className="anmeldemeldungen__liste">
        {daten.meldungen.map((m) => {
          const q = daten.quittungen.filter((x) => x.meldung_id === m.id);
          const gelesen = new Set(q.map((x) => x.user_id));
          const fehlt = empfaenger.filter((x) => !gelesen.has(x.id));
          const zahl = empfaenger.filter((x) => gelesen.has(x.id)).length;
          return (
            <li key={m.id} className={"anmeldemeldungen__eintrag" + (m.aktiv ? "" : " aus")} data-meldung={m.id}>
              <div className="anmeldemeldungen__zeile">
                <div className="anmeldemeldungen__was">
                  <strong>{m.titel}</strong>
                  <span className="klein">{datumText(m.erstellt)}{m.aktiv ? "" : " · ausgeschaltet"}</span>
                </div>
                <button className="linkknopf" data-leser={m.id}
                  onClick={() => setOffen(offen === m.id ? null : m.id)}>
                  Gelesen: {zahl} von {empfaenger.length}</button>
              </div>
              <div className="anmeldemeldungen__knoepfe">
                <button className="knopf knopf--klein knopf--still" onClick={() => vorschau(m)}>Vorschau</button>
                <button className="knopf knopf--klein knopf--still" data-ambearbeiten={m.id} onClick={() => bearbeiten(m)}>Bearbeiten</button>
                <button className="knopf knopf--klein knopf--still" data-amaktiv={m.id} onClick={() => umschalten(m)}>
                  {m.aktiv ? "Ausschalten" : "Einschalten"}</button>
                <button className="linkknopf linkknopf--gefahr" data-amweg={m.id} onClick={() => weg(m)}>Löschen</button>
              </div>
              {offen === m.id && (
                <div className="anmeldemeldungen__leser">
                  <div><strong>Gelesen</strong>
                    {q.length ? <ul>{q.slice().sort((a, b) => (a.am < b.am ? 1 : -1)).map((x) => (
                      <li key={x.user_id}>{name(x.user_id)} <span className="klein">{datumText(x.am)}</span></li>))}</ul>
                      : <p className="klein">Noch niemand.</p>}</div>
                  <div><strong>Noch nicht</strong>
                    {fehlt.length ? <ul>{fehlt.map((x) => <li key={x.id}>{alt.personName(x, x.email)}</li>)}</ul>
                      : <p className="klein">Alle haben sie gelesen.</p>}</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
