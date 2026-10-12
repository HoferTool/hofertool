// =================================================================
//  PUSH-MITTEILUNGEN (seit 1.35.0, Wunsch Patrick 12. Oktober 2026:
//  „Admins sollen eine Push-Nachricht herausgeben können, jeder Nutzer
//  soll es automatisch schon anhaben und kann es in den Einstellungen
//  ausschalten“)
//
//  Jedes Gerät meldet sich beim Push-Dienst seines Browsers an (Apple,
//  Google, Mozilla) und legt die Adresse über push_abo_setzen in der
//  Datenbank ab. Die Server-Funktion push-senden schickt dann an alle.
//
//  „Automatisch an“ heisst: Die Einstellung „push“ steht von Anfang an
//  auf an. Erlauben muss jedes Gerät einmal selbst, das verlangt jeder
//  Browser, und auf iPhone und iPad nur nach einem Tipp der Person.
//  Darum erscheint nach der Anmeldung unten ein kleines Feld mit
//  „Einschalten“, solange das Gerät noch nicht gefragt wurde.
//
//  Auf iPhone und iPad gehen Mitteilungen nur, wenn das Hofer Tool auf
//  dem Startbildschirm liegt (iOS 16.4 oder neuer).
// =================================================================
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";

const SCHLUESSEL_SPEICHER = "hofer.push.schluessel";
const SPAETER_SPEICHER = "hofer.push.spaeter";
const SPAETER_MS = 3 * 24 * 3600 * 1000;

export function pushMoeglich() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
    && window.isSecureContext;
}

// iPhone oder iPad im Browser statt vom Startbildschirm: dort fehlt Push
export function pushNurVomStartbildschirm() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const startbildschirm = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  return ios && !startbildschirm;
}

export function pushEingeschaltet() {
  return alt.einstellungWert("push", "1") !== "0";
}

function pushFuerMich() {
  const p = alt.profil;
  return !!p && p.role !== "extern" && p.role !== "dienst" && !alt.istArchiv();
}

async function registrierung() {
  if (!pushMoeglich()) return null;
  const r = await navigator.serviceWorker.getRegistration();
  if (!r) return null;
  return r.active ? r : await alt.zeitlimit(navigator.serviceWorker.ready, 10000, "Service Worker");
}

// Der öffentliche Schlüssel des Absenders. Ändert sich nie, darum gemerkt.
async function absenderSchluessel() {
  try {
    const s = localStorage.getItem(SCHLUESSEL_SPEICHER);
    if (s) return s;
  } catch (f) { /* privat */ }
  const { data, error } = await alt.zeitlimit(
    alt.db.functions.invoke("push-senden", { method: "GET" }), 15000, "Push-Schlüssel");
  if (error || !data || !data.schluessel) throw error || new Error("kein Schlüssel");
  try { localStorage.setItem(SCHLUESSEL_SPEICHER, data.schluessel); } catch (f) { /* privat */ }
  return data.schluessel;
}

function alsBytes(b64) {
  const roh = atob((b64 + "=".repeat((4 - b64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(roh, (z) => z.charCodeAt(0));
}

function geraetName() {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android-Handy" : "Android-Tablet";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac/.test(ua)) return "Mac";
  return "Gerät";
}

// Meldet dieses Gerät an. Fragt den Browser nur, wenn erlaubt = true
// (also direkt aus einem Tipp heraus).
export async function pushAbonnieren(fragen) {
  const r = await registrierung();
  if (!r) throw new Error("Dieses Gerät kann keine Mitteilungen empfangen.");
  if (Notification.permission !== "granted") {
    if (!fragen) return false;
    const antwort = await Notification.requestPermission();
    if (antwort !== "granted") return false;
  }
  const schluessel = await absenderSchluessel();
  let abo = await r.pushManager.getSubscription();
  if (!abo) {
    abo = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: alsBytes(schluessel) });
  }
  const j = abo.toJSON();
  const { error } = await alt.db.rpc("push_abo_setzen", {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_geraet: geraetName(),
  });
  if (error) throw error;
  return true;
}

export async function pushAbmelden() {
  const r = await registrierung();
  const abo = r && await r.pushManager.getSubscription();
  if (!abo) return;
  try { await alt.db.rpc("push_abo_entfernen", { p_endpoint: abo.endpoint }); } catch (f) { /* egal */ }
  try { await abo.unsubscribe(); } catch (f) { /* egal */ }
}

// Nach jeder Anmeldung und jedem Start: Gerät nach der Einstellung der
// angemeldeten Person an- oder abmelden. Meldet sich auf einem Gerät
// jemand anderes an, gilt ab dann dessen Einstellung.
export async function pushNachAnmeldung() {
  try {
    if (!pushMoeglich() || !pushFuerMich()) return;
    if (!pushEingeschaltet()) { await pushAbmelden(); return; }
    if (Notification.permission === "granted") { await pushAbonnieren(false); return; }
    // Nur fragen, wenn der Server bereit ist (Schlüssel da). So taucht das
    // Feld nicht auf, solange sql/push-mitteilungen.sql fehlt.
    if (Notification.permission === "default") { await absenderSchluessel(); hinweisZeigen(); }
  } catch (f) {
    console.warn("Push:", f && f.message);
  }
}

// ---------- Kleines Feld unten: „Mitteilungen einschalten?“ ----------

let hinweisOffen = null;

function hinweisZeigen() {
  if (hinweisOffen || document.querySelector(".push-hinweis")) return;
  try {
    const s = Number(localStorage.getItem(SPAETER_SPEICHER) || 0);
    if (Date.now() - s < SPAETER_MS) return;
  } catch (f) { /* privat */ }
  const huelle = document.createElement("div");
  document.body.appendChild(huelle);
  const wurzel = createRoot(huelle);
  const zu = () => { wurzel.unmount(); huelle.remove(); hinweisOffen = null; };
  hinweisOffen = zu;
  const spaeter = () => {
    try { localStorage.setItem(SPAETER_SPEICHER, String(Date.now())); } catch (f) { /* privat */ }
    zu();
  };
  // Direkt im Tipp fragen, sonst lehnt Safari die Frage ab
  const einschalten = () => {
    pushAbonnieren(true).then((ok) => {
      zu();
      if (ok) alt.meldung("Mitteilungen sind eingeschaltet.", "gut");
      else spaeter();
    }).catch((f) => { zu(); alt.meldung("Mitteilungen gehen nicht: " + alt.fehlertext(f), "warn"); });
  };
  wurzel.render(
    <div className="push-hinweis" role="dialog" aria-label="Mitteilungen">
      <div className="push-hinweis__text">
        <strong>Mitteilungen einschalten?</strong>
        <span>Damit kommen Nachrichten vom Büro direkt auf dieses Gerät.</span>
      </div>
      <div className="push-hinweis__knoepfe">
        <button className="knopf knopf--still knopf--klein" onClick={spaeter}>Später</button>
        <button className="knopf knopf--klein" onClick={einschalten}>Einschalten</button>
      </div>
    </div>
  );
}

export function pushHinweisWeg() {
  if (hinweisOffen) hinweisOffen();
}

// ---------- Admins: Nachricht an alle ----------

export async function pushNachrichtSenden() {
  let zahl = null;
  try {
    const r = await alt.db.rpc("push_geraete_zahl");
    if (!r.error) zahl = r.data;
  } catch (f) { /* ohne Zahl */ }
  const e = await alt.dialogFelder({
    titel: "Push-Nachricht an alle",
    text: zahl === null ? "Geht an alle Geräte mit eingeschalteten Mitteilungen."
      : "Geht an " + zahl + (zahl === 1 ? " Gerät" : " Geräte") + " mit eingeschalteten Mitteilungen.",
    felder: [
      { name: "titel", label: "Titel", platzhalter: "Hofer Tool" },
      { name: "text", label: "Nachricht", typ: "textarea", pflicht: true },
    ],
    bestaetigen: "Senden",
  });
  if (!e) return;
  try {
    const { data, error } = await alt.zeitlimit(
      alt.db.functions.invoke("push-senden", { body: { titel: e.titel, text: e.text } }), 30000, "Push senden");
    if (error) {
      let text = alt.fehlertext(error);
      try { const k = await error.context.json(); if (k && k.fehler) text = k.fehler; } catch (f) { /* Text bleibt */ }
      throw new Error(text);
    }
    alt.meldung(data.geraete
      ? "Gesendet an " + data.erreicht + " von " + data.geraete + " Geräten."
      : "Noch kein Gerät hat Mitteilungen eingeschaltet.", data.geraete ? "gut" : "warn");
  } catch (f) {
    alt.meldung("Nicht gesendet: " + alt.fehlertext(f), "fehler");
  }
}

// ---------- Admins: Historie der gesendeten Nachrichten ----------
// (Wunsch Patrick, 12. Oktober 2026: „Historie einbauen“). Lesen dürfen
// nur Admins (Regel in sql/push-mitteilungen.sql), geschrieben wird
// sie nur von der Server-Funktion beim Senden.

export async function pushHistorieOeffnen() {
  let liste, personen = {};
  try {
    const { data, error } = await alt.zeitlimit(
      alt.db.from("push_nachrichten").select("id, titel, text, von, gesendet, geraete, erreicht")
        .order("gesendet", { ascending: false }).limit(500), 10000, "Push-Historie");
    if (error) throw error;
    liste = data || [];
    const ids = [...new Set(liste.map((n) => n.von).filter(Boolean))];
    if (ids.length) {
      const r = await alt.db.from("profiles").select("id, full_name, email").in("id", ids);
      for (const p of r.data || []) personen[p.id] = p;
    }
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  fensterOeffnen((zu) => <Historie liste={liste} personen={personen} zu={zu} />);
}

function mitJahr(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + String(d.getFullYear()).slice(2)
    + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function Historie({ liste, personen, zu }) {
  const [suche, setSuche] = useState("");
  const wer = (n) => (n.von ? alt.personName(personen[n.von], "unbekannt") : "—");
  const s = suche.trim().toLowerCase();
  const gezeigt = s ? liste.filter((n) => String(n.titel || "").toLowerCase().includes(s)
    || String(n.text || "").toLowerCase().includes(s) || wer(n).toLowerCase().includes(s)) : liste;
  return (
    <div className="dialog dialog--breit matausgabe-historie push-historie">
      <div className="blatt__kopf"><h2>Push-Nachrichten · Historie</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>
      {liste.length > 8 &&
        <input type="search" className="matausgabe-suche" placeholder="Suchen …" aria-label="Suchen"
          value={suche} onChange={(e) => setSuche(e.target.value)} />}
      {gezeigt.length
        ? <div className="matausgabe-rolle"><table className="tabelle">
            <thead><tr><th>Gesendet</th><th>Von</th><th>Nachricht</th><th>Angekommen</th></tr></thead>
            <tbody>{gezeigt.map((n) => (
              <tr key={n.id}>
                <td className="klein nowrap">{mitJahr(n.gesendet)}</td>
                <td className="klein">{wer(n)}</td>
                <td>{n.titel && <strong>{n.titel}<br /></strong>}<span className="push-historie__text">{n.text}</span></td>
                <td className="klein nowrap">{n.erreicht} von {n.geraete}</td>
              </tr>
            ))}</tbody>
          </table></div>
        : <p className="hinweis">{liste.length ? "Nichts gefunden." : "Noch keine Nachricht gesendet."}</p>}
    </div>
  );
}
