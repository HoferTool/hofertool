// =================================================================
//  RADIO UND VIDEOS IM PAUSENRAUM
//  Auf dem Pausenraum-Display unter Kalender und Geburtstagen Sender
//  zum Antippen (Wunsch Patrick 30. Oktober 2026: „verschiedene
//  Radiosender anwählen können“, dazu „den YouTube-Kanal Titans of
//  CNC“). Die Liste steht in app_config.radio_sender als
//  [{id, name, art: "radio"|"youtube", adresse}], ändern unter
//  Einstellungen → Allgemein → Radio im Pausenraum (nur Admins).
//  Ohne Eintrag gilt VORGABE.
// =================================================================
import { alt } from "../bruecke.jsx";

const SCHLUESSEL = "radio_sender";

// Adressen der SRG aus ihrer Liste auf broadcast.ch, dort mit http;
// der Server liefert dieselben auch über https, und http lädt der
// Browser auf unserer https-Seite nicht
export const VORGABE = [
  { id: "srf3", name: "SRF 3", art: "radio", adresse: "https://stream.srg-ssr.ch/srgssr/srf3/mp3/128" },
  { id: "srf1", name: "SRF 1", art: "radio", adresse: "https://stream.srg-ssr.ch/srgssr/srf1/mp3/128" },
  { id: "virus", name: "SRF Virus", art: "radio", adresse: "https://stream.srg-ssr.ch/srgssr/srfvirus/mp3/128" },
  { id: "mw", name: "Musikwelle", art: "radio", adresse: "https://stream.srg-ssr.ch/srgssr/srfmw/mp3/128" },
  { id: "rsp", name: "Swiss Pop", art: "radio", adresse: "https://stream.srg-ssr.ch/srgssr/rsp/mp3/128" },
  { id: "rsj", name: "Swiss Jazz", art: "radio", adresse: "https://stream.srg-ssr.ch/srgssr/rsj/mp3/128" },
  { id: "rsc", name: "Swiss Classic", art: "radio", adresse: "https://stream.srg-ssr.ch/srgssr/rsc_de/mp3/128" },
  { id: "energy", name: "Energy Bern", art: "radio", adresse: "https://energybern.ice.infomaniak.ch/energybern-high.mp3" },
  { id: "titans", name: "Titans of CNC", art: "youtube", adresse: "https://www.youtube.com/channel/UCc2lUKVOTXKlQR7Fm7h1JfQ" },
];

export async function senderLaden() {
  try {
    const r = await alt.db.from("app_config").select("wert").eq("schluessel", SCHLUESSEL).maybeSingle();
    const w = r && r.data && r.data.wert ? JSON.parse(r.data.wert) : null;
    if (Array.isArray(w)) return w.filter((s) => s && s.name && s.adresse);
  } catch (f) { /* ohne Einstellung: Vorgabe */ }
  return VORGABE;
}

export async function senderSpeichern(liste) {
  const { error } = await alt.db.from("app_config").upsert(
    [{ schluessel: SCHLUESSEL, wert: JSON.stringify(liste) }], { onConflict: "schluessel" });
  if (error) throw error;
}

// Adresse zum Einbetten aus allem, was man bei YouTube kopieren kann:
// Kanal (…/channel/UC…, dann seine hochgeladenen Videos als Liste
// UU…), Wiedergabeliste (?list=…) oder ein einzelnes Video
export function youtubeEinbetten(adresse) {
  const a = String(adresse || "").trim();
  const opt = "autoplay=1&rel=0&modestbranding=1&playsinline=1";
  let m = a.match(/(?:channel\/|^)(UC[\w-]{22})/);
  if (m) return "https://www.youtube-nocookie.com/embed/videoseries?list=UU" + m[1].slice(2) + "&" + opt;
  m = a.match(/[?&]list=([\w-]+)/) || a.match(/^((?:PL|UU|OL)[\w-]{10,})$/);
  if (m) return "https://www.youtube-nocookie.com/embed/videoseries?list=" + m[1] + "&" + opt;
  m = a.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/) || a.match(/^([\w-]{11})$/);
  if (m) return "https://www.youtube-nocookie.com/embed/" + m[1] + "?" + opt;
  return null;
}

export const neueSenderId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
