// =================================================================
//  ZOMBIES UND HALLOWEEN-KREATUREN, IM BAND OBEN
//  Geschichte (alles Wunsch Patrick): 1.130.0 bis 1.149.0 liefen hier
//  Hühner, 1.150.0 Ferrari und Mario, 1.151.0 bis 1.210.x Jiviano auf
//  dem Jetski, 1.211.0 bis 1.323.x zogen Hühner mit ihrem Stall auf
//  Rädern um (ab 1.212.0 im Winter durch Schnee).
//  Seit 1.324.0 (1. November 2026: „lass die umziehenden Hühner weg und
//  ersetze sie durch Zombies und Halloween-Kreaturen, aber richtig
//  furchterregend“): Unten liegt ein Friedhof mit Grabsteinen und
//  Nebel, ab und zu schlurft eine Horde vorbei, mal nach links, mal
//  nach rechts. Zwei Zombies ziehen an Ketten einen Sarg auf Rädern, aus
//  dessen Spalt rote Augen starren, eine Knochenhand heraushängt und
//  grüner Dunst steigt, auf dem Deckel sitzt ein Rabe. Davor wanken zwei
//  bis vier Kreaturen (Zombie, Skelett, Werwolf, Mumie, Kürbiskopf),
//  manchmal schwebt ein Geist darüber und kriecht hinten ein halber
//  Zombie nach. Dazwischen tropft Blut, Fledermäuse flattern über das
//  Band, und aus der Erde greifen Hände.
//  Seit 1.325.0 (1. November 2026: „das ist zu wenig echt und gruselig,
//  es soll richtig düster und blutig sein“): Das Band wird nachtschwarz
//  mit rotem Schein, ein Blutmond hinter ziehenden Wolken, ab und zu ein
//  Blitz, oben läuft Blut über den Rand und tropft herab. Die Kreaturen
//  haben Licht und Schatten, offene Wunden, Därme, ein herausgefallenes
//  Auge, blutige Klauen und Mäuler, aus denen es tropft; statt des
//  Kürbiskopfs geht ein Schlächter mit Hackbeil und abgetrenntem Kopf mit,
//  der Geist ist ein Gespenst mit Schädel, der Sarg blutet aus den Fugen
//  und zieht eine Blutspur, auf der Erde bleiben Blutlachen.
//  Gesteuert mit Zeitgebern und el.animate statt React-Zustand, damit
//  die Startseite dafür nie neu zeichnet.
// =================================================================
import { useEffect, useRef } from "react";

const zufall = (a, b) => a + Math.random() * (b - a);
const ganz = (a, b) => Math.floor(zufall(a, b + 1));
const eins = (liste) => liste[ganz(0, liste.length - 1)];

// Gemeinsame Verläufe für alle Zeichnungen, einmal im Band abgelegt
// (seit 1.325.0: Haut, Blut, Knochen und Holz mit Licht und Schatten statt
// flacher Farben, damit es echter wirkt). Nur für Flächen; Striche bleiben
// einfarbig, weil ein Verlauf auf einer geraden Linie nichts zeichnet.
const DEFS = `<svg class="spuk-defs" width="0" height="0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs>
  <radialGradient id="spuk-haut-a" cx="62%" cy="34%" r="78%"><stop offset="0" stop-color="#97a07f"/><stop offset=".5" stop-color="#5a6447"/><stop offset="1" stop-color="#1f241a"/></radialGradient>
  <radialGradient id="spuk-haut-b" cx="62%" cy="34%" r="78%"><stop offset="0" stop-color="#a6a99d"/><stop offset=".5" stop-color="#666a60"/><stop offset="1" stop-color="#25272a"/></radialGradient>
  <radialGradient id="spuk-haut-c" cx="62%" cy="34%" r="78%"><stop offset="0" stop-color="#a39a74"/><stop offset=".5" stop-color="#655d40"/><stop offset="1" stop-color="#241f14"/></radialGradient>
  <linearGradient id="spuk-schatten" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
  <linearGradient id="spuk-blut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9e0b0b" stop-opacity=".55"/><stop offset=".35" stop-color="#8a0606"/><stop offset="1" stop-color="#3a0000"/></linearGradient>
  <radialGradient id="spuk-wunde" cx="50%" cy="50%" r="55%"><stop offset="0" stop-color="#050000"/><stop offset=".55" stop-color="#3a0202"/><stop offset=".85" stop-color="#7a0a0a"/><stop offset="1" stop-color="#a51818"/></radialGradient>
  <linearGradient id="spuk-knochen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#efe8d0"/><stop offset=".6" stop-color="#c8bf9f"/><stop offset="1" stop-color="#7d7458"/></linearGradient>
  <radialGradient id="spuk-fell" cx="62%" cy="30%" r="80%"><stop offset="0" stop-color="#4a3b2f"/><stop offset=".55" stop-color="#261c15"/><stop offset="1" stop-color="#0a0706"/></radialGradient>
  <linearGradient id="spuk-binde" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b3a37a"/><stop offset=".6" stop-color="#7d6f4c"/><stop offset="1" stop-color="#3b3322"/></linearGradient>
  <linearGradient id="spuk-holz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d281a"/><stop offset="1" stop-color="#110905"/></linearGradient>
  <linearGradient id="spuk-sack" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f7a55"/><stop offset=".6" stop-color="#5e4d33"/><stop offset="1" stop-color="#2a2115"/></linearGradient>
  <linearGradient id="spuk-stahl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9dce0"/><stop offset=".5" stop-color="#8a9097"/><stop offset="1" stop-color="#3c4046"/></linearGradient>
  <linearGradient id="spuk-schuerze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a59c8a"/><stop offset="1" stop-color="#5a5348"/></linearGradient>
  <radialGradient id="spuk-mondg" cx="42%" cy="40%" r="60%"><stop offset="0" stop-color="#ff9a6a"/><stop offset=".45" stop-color="#d23a1c"/><stop offset=".85" stop-color="#7a0e06"/><stop offset="1" stop-color="#3e0503"/></radialGradient>
</defs></svg>`;

// Hautfarben der Zombies: Verlauf für Flächen, Mitte und Dunkel für Striche
const HAUT = {
  a: { verlauf: "url(#spuk-haut-a)", mitte: "#5f6a4b", dunkel: "#3f4732" },
  b: { verlauf: "url(#spuk-haut-b)", mitte: "#6c7066", dunkel: "#45483f" },
  c: { verlauf: "url(#spuk-haut-c)", mitte: "#6a6244", dunkel: "#463f2a" },
};

// Die Kreaturen, alle im Raster 80 × 120, Blick nach rechts, Füsse bei
// y 118. Klassen: spuk-bein (schwingt), spuk-arm (greift), spuk-kopf
// (wankt), spuk-auge (glüht), spuk-kiefer (klappert), spuk-tropf (Blut
// läuft und tropft), spuk-baumel (hängt und pendelt), spuk-gedaerm.
const ZOMBIE = (v = HAUT.a, hemd = "#3a3329") => `<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg">
  <g class="spuk-arm spuk-arm--2">
    <path d="M42 46 L57 52" stroke="${v.dunkel}" stroke-width="6" stroke-linecap="round"/>
    <path d="M57 52 L71 55" stroke="#c9c0a3" stroke-width="2.3" stroke-linecap="round"/>
    <path d="M58 50 L60.5 53 L57.5 55" stroke="#6e0909" stroke-width="2.6" fill="none" stroke-linejoin="round"/>
    <path d="M71 55 l4 -2.5 M71 55 l5 .5 M71 55 l3.5 3" stroke="#c9c0a3" stroke-width="1.1" stroke-linecap="round"/>
  </g>
  <g class="spuk-bein"><path d="M34 74 L30 97 L32 115" stroke="#1b1d22" stroke-width="9" stroke-linecap="round" fill="none"/>
    <path d="M28.5 90 l4 3 l-3 3" stroke="#4a0606" stroke-width="1.6" fill="none"/>
    <path d="M26 117 L38 117" stroke="#0a0908" stroke-width="5" stroke-linecap="round"/></g>
  <g class="spuk-bein spuk-bein--2"><path d="M42 74 L47 95 L46 103" stroke="#23262d" stroke-width="9" stroke-linecap="round" fill="none"/>
    <path d="M41 100 l2 5 l2 -4 l2 5 l2 -5" stroke="#23262d" stroke-width="2" fill="none"/>
    <path d="M46 103 L45 115" stroke="${v.dunkel}" stroke-width="4.2" stroke-linecap="round"/>
    <path d="M44.4 105 l1.6 4" stroke="#ddd4ba" stroke-width="1.1"/><path d="M47 107 c0 3 -1 4 0 6" stroke="#7a0909" stroke-width="1.2" fill="none"/>
    <path d="M42 117 L53 117" stroke="${v.dunkel}" stroke-width="4.5" stroke-linecap="round"/></g>
  <path d="M28 44 C30 35 46 31 52 39 L55 75 L49 81 L46 76 L42 82 L38 77 L34 82 L31 77 Z" fill="${hemd}"/>
  <path d="M31 57 C37 54 45 57 54 59 L55 75 L49 81 L46 76 L42 82 L38 77 L34 82 L31 77 Z" fill="url(#spuk-blut)"/>
  <path d="M28 44 C30 35 46 31 52 39 L55 75 L49 81 L46 76 L42 82 L38 77 L34 82 L31 77 Z" fill="url(#spuk-schatten)"/>
  <path d="M33 47 C37 46 39 51 35.5 54 C32.5 54 31.5 49 33 47 Z M49.5 43 c2 0 3 3 1 4.5 c-2 0 -2.5 -3 -1 -4.5 Z" fill="#6a0707"/>
  <path d="M34 78 c0 4 -1 6 0 9 M48 79 c0 3 1 5 0 7" stroke="#7a0808" stroke-width="1.5" fill="none" stroke-linecap="round" class="spuk-tropf"/>
  <ellipse cx="45" cy="56" rx="7.5" ry="10" fill="url(#spuk-wunde)"/>
  <path d="M39.5 50 C43 48.6 47 48.6 50.5 50 M39 54 C43 52.6 47 52.6 51 54 M39.5 58 C43 56.8 47 56.8 50.5 58" stroke="#d5cbad" stroke-width="1.4" fill="none"/>
  <path d="M40 50.5 l1 1.5 M49 54.5 l1 1.5" stroke="#7a0a0a" stroke-width="1.2"/>
  <g class="spuk-gedaerm">
    <path d="M43 60 C38 66 45 69 41 75 C37 81 44 84 41 91" stroke="#741a1e" stroke-width="3.6" fill="none" stroke-linecap="round"/>
    <path d="M47 61 C51 67 45 71 48 77 C50 81 46 84 47 87" stroke="#8c272c" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M42.3 61 C38 66 44.6 69 40.6 75 C37 80 43 84 40.4 89" stroke="#c4646a" stroke-width=".8" fill="none" opacity=".75"/>
    <path d="M41 91 c0 3 -1 5 0 7" stroke="#8f0c0c" stroke-width="1.6" fill="none" stroke-linecap="round" class="spuk-tropf"/>
  </g>
  <g class="spuk-arm"><path d="M46 42 L63 45" stroke="${v.mitte}" stroke-width="6.5" stroke-linecap="round" fill="none"/>
    <path d="M63 45 L74 42" stroke="${v.mitte}" stroke-width="5" stroke-linecap="round"/>
    <path d="M59 42.5 l3 3.5 l3 -2.5" stroke="#5a0606" stroke-width="2.2" fill="none"/>
    <path d="M74 42 l6 -4 M74 42 l7 -1 M74 42 l6 2 M74 43 l4 4" stroke="${v.mitte}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M71 41 l9 -3 M73 43 l7 1.5 M74 44.5 l3.5 2.5" stroke="#8a0a0a" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M76 46 c0 3 -1 5 0 7" stroke="#8f0c0c" stroke-width="1.3" fill="none" stroke-linecap="round" class="spuk-tropf"/>
    <path d="M44 37 L58 40 L57 48 L54 45 L51 49 L47 45 Z" fill="${hemd}"/></g>
  <path d="M46 37 L50 30" stroke="${v.dunkel}" stroke-width="7"/>
  <path d="M47 31.5 C49 33 50 35 48.5 37" stroke="#4a0303" stroke-width="2.6" fill="none"/>
  <g class="spuk-kopf">
    <path d="M42 22 C40 10 52 4 60 8 C68 12 68 26 62 32 C56 36 46 34 42 22 Z" fill="${v.verlauf}"/>
    <path d="M45 12 C47 7 54 6 56 10 C54 14 48 16 45 12 Z" fill="url(#spuk-knochen)"/>
    <path d="M47 9.5 l3 2 l-1 2" stroke="#6b6250" stroke-width=".7" fill="none"/>
    <path d="M44.5 12.5 C47 16.5 54 15 56.5 10.5" stroke="#5a0606" stroke-width="1.3" fill="none"/>
    <path d="M46 15 c0 3 -1 5 0 8" stroke="#7a0707" stroke-width="1.2" fill="none" class="spuk-tropf"/>
    <ellipse cx="60" cy="19.5" rx="4.4" ry="3.8" fill="#070404"/><circle class="spuk-auge" cx="60.6" cy="19.6" r="1.6" fill="#ff2a14"/>
    <ellipse cx="52.5" cy="20" rx="3" ry="3" fill="#070404"/>
    <path d="M57 23 c3 2 7 1 9 -1" stroke="#22281a" stroke-width="1" fill="none"/>
    <g class="spuk-baumel"><path d="M52.5 21 C52 24 53.5 26 52.5 28.5" stroke="#8a1a1a" stroke-width="1" fill="none"/>
      <circle cx="52.5" cy="30" r="2.1" fill="#e2dbc3"/><circle cx="53.3" cy="30.4" r="1" fill="#7a1010"/><circle cx="53.5" cy="30.5" r=".45" fill="#000"/></g>
    <path d="M58 25 C61 23 66 23.5 67 27 L66 30 C63 31 59 30 58 27.5 Z" fill="#150202"/>
    <path d="M59 25.5 l.9 2 l.9 -2 l.9 2 l.9 -2 l.9 2 l.9 -2 l.9 2 l.9 -2" stroke="#d2c8a8" stroke-width=".9" fill="none"/>
    <g class="spuk-kiefer"><path d="M56 30 C59 30 66 30 66.5 31 L64.5 37 C61 38.5 57 37 56 34 Z" fill="${v.dunkel}"/>
      <path d="M58 30.6 l.9 -1.6 l.9 1.6 l.9 -1.6 l.9 1.6 l.9 -1.6 l.9 1.6 l.9 -1.6" stroke="#d2c8a8" stroke-width=".8" fill="none"/>
      <path d="M57 32 C60 33 63 33 66 31.5 L65 34 C62 35 59 35 57 34 Z" fill="#7a0606"/>
      <path d="M58 35 C58 39 56.5 42 58 46" stroke="#8f0c0c" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M62 36.5 C62 39 61 41 62 43" stroke="#8f0c0c" stroke-width="1.5" fill="none" stroke-linecap="round" class="spuk-tropf"/></g>
    <path d="M44 13 C40 9 41 5 45 6 M48 8 C47 3 50 1 53 3 M43 19 C39 18 38 15 40 12 M42 23 C38 25 38 28 40 30" stroke="#14130e" stroke-width="1.1" fill="none"/>
    <path d="M47 26 l4 1 M48 24 l1 4 M50 24 l1 4" stroke="#1b1a12" stroke-width=".9"/>
  </g>
</svg>`;

const SKELETT = `<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg">
  <path class="spuk-herz" d="M41 50 C39 46.5 35.5 48 37.5 51.5 L42 56 L46.5 51.5 C48.5 48 45 46.5 43 50 Z" fill="#8a0a0e"/>
  <g stroke-linecap="round" fill="none">
    <path class="spuk-arm spuk-arm--2" d="M38 41 L52 52 L68 50" stroke="#a39a80" stroke-width="2.6"/>
    <g class="spuk-bein"><path d="M38 72 L34 94 L36 115" stroke="#bdb59b" stroke-width="3.6"/><path d="M32 117 h9" stroke="#bdb59b" stroke-width="3"/>
      <path d="M37.5 75 C35.5 81 36.5 85 35.5 90" stroke="#5e0a0a" stroke-width="3"/><circle cx="34" cy="94" r="2" fill="#bdb59b"/></g>
    <g class="spuk-bein spuk-bein--2"><path d="M42 72 L46 94 L44 115" stroke="#ddd6be" stroke-width="3.6"/><path d="M41 117 h9" stroke="#ddd6be" stroke-width="3"/><circle cx="46" cy="94" r="2" fill="#ddd6be"/>
      <path d="M45 96 C46 101 45 104 46 108" stroke="#7a0e0e" stroke-width="1.6"/></g>
    <path d="M31 70 Q40 79 49 70" stroke="#ddd6be" stroke-width="4.5"/>
    <path d="M40 70 L44 36" stroke="#ddd6be" stroke-width="3.2" stroke-dasharray="3 1.4"/>
    <path d="M43 42 C33 42 32 55 41 57 M43 42 C53 42 53 55 45 57 M43 47 C36 47 35 53 42 54 M43 47 C51 47 51 53 45 54" stroke="#ddd6be" stroke-width="1.9"/>
    <path d="M35.5 45 C33.5 49 35.5 52 34.5 56" stroke="#6e1010" stroke-width="2.6"/>
    <path d="M49.5 43 C51.5 47 49.5 50 50.5 54" stroke="#561010" stroke-width="2.2"/>
    <path d="M33 70 c-1 4 0 7 -1 10 M47 71 c1 3 0 6 1 9" stroke="#7a1010" stroke-width="1.6" class="spuk-tropf"/>
    <path d="M35 40 H53" stroke="#ddd6be" stroke-width="2.8"/>
    <g class="spuk-arm"><path d="M51 40 L65 42 L78 37" stroke="#ddd6be" stroke-width="2.9"/>
      <path d="M58 40.5 C61 42 63 41 65 42.5" stroke="#6e1010" stroke-width="2.2"/>
      <path d="M78 37 l3 -4 M78 37 l5 -1 M78 37 l4 3" stroke="#ddd6be" stroke-width="1.5"/></g>
  </g>
  <path d="M60 30 L76 -2" stroke="#2a1d14" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M74 -4 C88 -2 92 12 84 22 C86 12 82 4 72 2 Z" fill="url(#spuk-stahl)" stroke="#33373c" stroke-width=".8"/>
  <path d="M84.5 6 C87 11 86 17 84 22 C83.5 17 82.5 12 80 8 Z" fill="#760707"/>
  <path d="M84 22 c0 3 1 5 0 8" stroke="#8f0c0c" stroke-width="1.4" fill="none" stroke-linecap="round" class="spuk-tropf"/>
  <g class="spuk-kopf">
    <path d="M40 18 C38 4 60 2 62 14 C63 20 60 24 58 26 L46 27 C42 25 40 22 40 18 Z" fill="url(#spuk-knochen)"/>
    <path d="M40 18 C38 4 60 2 62 14 C63 20 60 24 58 26 L46 27 C42 25 40 22 40 18 Z" fill="url(#spuk-schatten)"/>
    <path d="M50 12.5 C53 10.5 57.5 11.5 57.5 15 C57 19 52 19 50 16 Z" fill="#060403"/><circle class="spuk-auge" cx="54" cy="15" r="1.3" fill="#ff3018"/>
    <path d="M42.5 13.5 C44 11.5 47.5 12.5 47 15.5 C46 18 43 17.5 42.5 13.5 Z" fill="#060403"/><circle class="spuk-auge" cx="45" cy="15" r=".9" fill="#ff3018"/>
    <path d="M53 18.5 l-1.8 3.4 h3.4 Z" fill="#060403"/>
    <path d="M46 4 l2 4 l-2 3 l2 3" stroke="#5a5040" stroke-width=".9" fill="none"/>
    <path d="M44 4 C49 3 52 5 50 8 C48 9 45 8 44 4 Z" fill="#6a0707"/>
    <path d="M47.5 8 C48 11 46.5 13 47.3 16" stroke="#8a0a0a" stroke-width="1.4" fill="none" class="spuk-tropf"/>
    <g class="spuk-kiefer"><path d="M45 24.5 L59 24.5 L57.5 31 L47 31 Z" fill="#cfc7ad"/>
      <path d="M47.5 24.5 v3 M50 24.5 v3 M52.5 24.5 v3 M55 24.5 v3" stroke="#060403" stroke-width=".8"/>
      <path d="M53 31 c0 3 -1 5 0 7" stroke="#8a0a0a" stroke-width="1.2" fill="none" class="spuk-tropf"/></g>
  </g>
</svg>`;

const WERWOLF = `<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg">
  <path class="spuk-arm spuk-arm--2" d="M44 48 C54 56 60 64 66 70" stroke="#1c1511" stroke-width="7" stroke-linecap="round" fill="none"/>
  <g class="spuk-bein"><path d="M28 74 C20 88 34 96 26 114" stroke="#1c1511" stroke-width="10" stroke-linecap="round" fill="none"/>
    <path d="M22 117 L34 116 M33 116 l3 -1 M30 117 l3 0" stroke="#e8dec6" stroke-width="1.4"/></g>
  <g class="spuk-bein spuk-bein--2"><path d="M38 76 C34 90 46 96 40 114" stroke="#28201a" stroke-width="10" stroke-linecap="round" fill="none"/>
    <path d="M33 82 l12 2 l-10 3" stroke="#3a3530" stroke-width="2" fill="none"/>
    <path d="M36 117 L48 116 M47 116 l3 -1" stroke="#e8dec6" stroke-width="1.4"/></g>
  <path d="M22 70 C14 52 26 30 46 30 C58 30 64 40 60 54 C58 66 50 78 36 80 Z" fill="url(#spuk-fell)"/>
  <path d="M22 68 l-6 -3 l4 -4 l-6 -5 l6 -2 l-4 -6 l7 -1 l-2 -7 l7 2 l0 -7 l6 4 l2 -6 l4 5 l4 -4" fill="#1e1611"/>
  <path d="M50 46 C57 52 55 66 46 73 C44 62 46 52 50 46 Z" fill="#3f322a"/>
  <path d="M48 50 C55 54 54 62 49 68 C46 62 46 56 48 50 Z" fill="url(#spuk-blut)"/>
  <path d="M49 68 c0 4 -1 6 0 9" stroke="#8a0a0a" stroke-width="1.5" fill="none" class="spuk-tropf"/>
  <path d="M30 50 l4 2 M34 60 l3 3 M26 58 l3 1 M38 44 l3 2 M28 66 l4 1" stroke="#0e0a08" stroke-width="1.3"/>
  <g class="spuk-arm"><path d="M52 44 C62 50 68 56 73 60" stroke="#261d17" stroke-width="8" stroke-linecap="round" fill="none"/>
    <path d="M66 54 C69 57 71 58 73 60" stroke="#6a0808" stroke-width="5" stroke-linecap="round" fill="none"/>
    <path d="M73 60 l7 -1 M73 60 l6 4 M72 61 l1 7" stroke="#e8dec6" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M77 59.5 l3 -.5 M77.5 63 l1.5 1 M72.8 65 l.2 3" stroke="#9a0c0c" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M73 68 c0 3 -1 5 0 8" stroke="#8f0c0c" stroke-width="1.4" fill="none" stroke-linecap="round" class="spuk-tropf"/></g>
  <g class="spuk-kopf">
    <path d="M46 34 C44 22 54 16 62 20 L76 25 C79 29 75 33 70 33 L60 40 C54 42 48 40 46 34 Z" fill="url(#spuk-fell)"/>
    <path d="M49 23 L48 7 L57 19 Z M56 20 L60 6 L64 21 Z" fill="#150f0c"/><path d="M51 19 L50 12 L54 18 Z" fill="#4a1a1a"/>
    <path d="M58 21 C62 20 66 22 68 24" stroke="#0c0807" stroke-width="1.6" fill="none"/>
    <path d="M56 23 L65 24.5 L57 27 Z" fill="#090605"/><path class="spuk-auge spuk-auge--gelb" d="M58 23.6 L64.5 24.6 L58.6 26 Z" fill="#ffd21a"/>
    <path d="M61 30 L78 27 L75 33 L64 37 Z" fill="#250303"/>
    <path d="M64 29.5 l1.4 5.5 l1.2 -5.8 M69.5 28.6 l1.3 5.2 l1.2 -5.6 M74 28 l1 4 l1 -4.2 M66 36.6 l1 -4.4 l1 4 M71 35 l1 -4 l1 3.6" fill="#ece3ca"/>
    <path d="M61 30 C66 31 72 29 78 27 L77 29 C72 31 66 32 62 32 Z M64 36 C68 36 72 34 75 33 L74 35 C70 37 67 37 64 37 Z" fill="#8a0808"/>
    <path d="M66 37 c0 3 -1 6 0 9 M72 35 c0 2 1 4 0 6" stroke="#8f0c0c" stroke-width="1.5" fill="none" stroke-linecap="round" class="spuk-tropf"/>
    <circle cx="77" cy="25.6" r="1.8" fill="#070505"/>
    <path d="M47 30 l-5 2 l4 1 l-5 3 l5 0" fill="#1e1611"/>
  </g>
</svg>`;

const MUMIE = `<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg">
  <path class="spuk-band" d="M33 52 C25 55 20 62 13 63 C8 66 5 70 0 69" stroke="#7d6f4c" stroke-width="3.4" fill="none" stroke-linecap="round"/>
  <path class="spuk-arm spuk-arm--2" d="M42 45 L72 50" stroke="#6e6244" stroke-width="6.5" stroke-linecap="round"/>
  <g class="spuk-bein"><path d="M36 74 L33 115" stroke="#7a6c4a" stroke-width="9" stroke-linecap="round"/>
    <path d="M30 82 l8 2 M30 92 l8 2 M30 102 l8 2" stroke="#4a4030" stroke-width="1.1"/><path d="M31 96 l6 1" stroke="#5a1a0e" stroke-width="2.5"/></g>
  <g class="spuk-bein spuk-bein--2"><path d="M44 74 L46 115" stroke="#94865f" stroke-width="9" stroke-linecap="round"/>
    <path d="M41 84 l9 -1 M41 94 l9 -1 M42 104 l9 -1" stroke="#5a4f38" stroke-width="1.1"/></g>
  <path d="M32 40 C32 31 51 29 53 40 L55 77 L31 78 Z" fill="url(#spuk-binde)"/>
  <g stroke="#4a4030" stroke-width="1.2"><path d="M32 46 L54 43 M31 52 L54 50 M31 58 L55 54 M31 64 L55 62 M31 70 L55 67 M31 76 L55 73"/></g>
  <path d="M42 52 C47 50 52 54 50 61 C46 64 40 60 42 52 Z" fill="#160b05"/>
  <path d="M44 54 C47 53 49 56 48 59 C46 61 43 58 44 54 Z" fill="url(#spuk-wunde)"/>
  <path d="M46 61 c0 4 -1 7 0 11" stroke="#5a0a05" stroke-width="1.6" fill="none" class="spuk-tropf"/>
  <path d="M33 60 C37 58 40 63 37 67 C34 68 32 64 33 60 Z M36 70 C40 69 41 74 38 76 C35 76 34 72 36 70 Z" fill="#5a1a0c" opacity=".8"/>
  <path d="M32 40 C32 31 51 29 53 40 L55 77 L31 78 Z" fill="url(#spuk-schatten)"/>
  <g class="spuk-arm"><path d="M47 42 L76 43" stroke="#8f8160" stroke-width="7" stroke-linecap="round"/>
    <path d="M54 39 l2 7 M60 39 l2 7 M66 40 l2 7 M72 40 l2 6" stroke="#4a4030" stroke-width="1.1"/>
    <path d="M74 41 l5 -2 M75 43 l5 0 M74 45 l4 2" stroke="#2a1d10" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M70 46 C72 52 70 56 72 60" stroke="#8f8160" stroke-width="2" fill="none"/></g>
  <g class="spuk-kopf">
    <circle cx="50" cy="22" r="12" fill="url(#spuk-binde)"/>
    <path d="M38 17 L62 14 M38 23 L62 20 M40 29 L60 26 M42 12 L58 10" stroke="#4a4030" stroke-width="1.2"/>
    <path d="M52 22 C55 20 61 21 61.5 23 C61 25 56 27 52 25 Z" fill="#2a1c10"/>
    <path d="M49 16.5 L62 15 L61.5 21 L50 21.5 Z" fill="#090603"/>
    <circle class="spuk-auge spuk-auge--gruen" cx="57" cy="18.3" r="2" fill="#6cff4a"/>
    <g class="spuk-kiefer"><path d="M52 25 C55 24 60 24 61 25.5 L60 31 C57 33 54 32 52 29 Z" fill="#090603"/>
      <path d="M54 25 l.8 1.6 l.8 -1.6 l.8 1.6 l.8 -1.6 l.8 1.6" stroke="#a89a70" stroke-width=".7" fill="none"/>
      <path d="M56 31 c0 3 -1 5 0 8" stroke="#2a1405" stroke-width="1.5" fill="none" class="spuk-tropf"/></g>
    <path d="M38 22 C36 28 40 32 44 33" stroke="#5a1a0c" stroke-width="2" fill="none" opacity=".8"/>
  </g>
</svg>`;

// Der Schlächter: Sackmaske, blutige Schürze, Hackbeil erhoben, in der
// anderen Hand ein abgetrennter Kopf an den Haaren (seit 1.325.0 statt des
// Kürbiskopfs, der zu lustig aussah)
const SCHLAECHTER = `<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg">
  <g class="spuk-arm spuk-arm--2">
    <path d="M40 46 L47 58 L55 63" stroke="#26221e" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M55 63 l3 1" stroke="#7a6a5a" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M57.5 65 C57 68 56.5 70 57.5 72 M59 65 C60 68 60.5 70 60 72 M58 65 C58 68 58.5 70 58.5 72" stroke="#120c08" stroke-width="1.1" fill="none"/>
    <g class="spuk-baumel">
      <circle cx="59" cy="77" r="6" fill="url(#spuk-haut-b)"/>
      <path d="M53.5 74 C55 70 63 70 64.5 74" stroke="#120c08" stroke-width="2.2" fill="none"/>
      <path d="M59.5 76 l2.5 .4 M56 76.2 l2 .2" stroke="#1a1a1a" stroke-width=".9"/>
      <path d="M58 79.5 C59 80.5 61 80.5 62 79.5 L61.5 81 C60.5 82 59 82 58.2 81 Z" fill="#250303"/>
      <path d="M56 78 C56 81 55 83 56 85" stroke="#7a0707" stroke-width="1" fill="none"/>
      <path d="M54 81 C56 84.5 62 84.5 64 81 C63 84 60 85.5 59 85.5 C57 85.5 55 84 54 81 Z" fill="#7a0808"/>
      <path d="M59 85 c0 3 -1 5 0 8" stroke="#8f0c0c" stroke-width="1.5" fill="none" stroke-linecap="round" class="spuk-tropf"/>
    </g>
  </g>
  <g class="spuk-bein"><path d="M34 76 L31 112" stroke="#1d1a17" stroke-width="7" stroke-linecap="round"/><path d="M26 116 h11" stroke="#080706" stroke-width="5.5" stroke-linecap="round"/></g>
  <g class="spuk-bein spuk-bein--2"><path d="M44 76 L47 112" stroke="#26221e" stroke-width="7" stroke-linecap="round"/><path d="M43 116 h11" stroke="#0c0a08" stroke-width="5.5" stroke-linecap="round"/></g>
  <path d="M25 44 C28 32 51 29 56 41 L58 82 L24 82 Z" fill="#2a2420"/>
  <path d="M30 46 L52 45 L56 86 L27 86 Z" fill="url(#spuk-schuerze)"/>
  <path d="M30 53 C35 50 41 57 47 52 C51 54 54 59 55 69 L56 86 L27 86 L28.5 62 C29 58 29.5 55 30 53 Z" fill="url(#spuk-blut)"/>
  <path d="M35 48 C38 47 40 51 37 53 C34 53 33 50 35 48 Z M45 58 l3 -1 l1 3 l-3 2 Z M40 66 C44 64 47 68 44 71 C41 72 38 69 40 66 Z" fill="#5e0606"/>
  <path d="M33 86 c0 3 -1 5 0 8 M44 86 c0 4 1 6 0 9 M52 86 c0 3 -1 5 0 7" stroke="#7a0808" stroke-width="1.6" fill="none" stroke-linecap="round" class="spuk-tropf"/>
  <path d="M25 44 C28 32 51 29 56 41 L58 82 L24 82 Z" fill="url(#spuk-schatten)"/>
  <g class="spuk-arm">
    <path d="M47 42 L58 30 L64 18" stroke="#2a2420" stroke-width="6.5" stroke-linecap="round" fill="none"/>
    <path d="M64 18 l2 -3" stroke="#7a6a5a" stroke-width="5" stroke-linecap="round"/>
    <path d="M65 16 L67 4" stroke="#2a1a10" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M62 -10 L82 -8 L81 7 L64 5 Z" fill="url(#spuk-stahl)" stroke="#2c3034" stroke-width=".8"/>
    <circle cx="66" cy="-6" r="1.2" fill="#2c3034"/>
    <path d="M64 -1 C68 1 72 -2 76 1 C79 0 81 2 81.5 4 L81 7 L64 5 Z" fill="#7a0606"/>
    <path d="M70 6 c0 3 -1 5 0 8 M78 7 c0 2 1 4 0 6" stroke="#8f0c0c" stroke-width="1.5" fill="none" stroke-linecap="round" class="spuk-tropf"/>
  </g>
  <path d="M44 36 L49 30" stroke="#2a2420" stroke-width="8"/>
  <g class="spuk-kopf">
    <path d="M40 22 C38 6 52 0 60 4 C69 8 69 24 63 31 C58 35 46 35 40 22 Z" fill="url(#spuk-sack)"/>
    <path d="M44 8 l2 3 M48 5 l1 3 M62 10 l-2 2 M42 16 l3 1 M64 22 l-3 0 M45 28 l2 -2" stroke="#3a2e1c" stroke-width=".8"/>
    <path d="M55 15 C57 13 62 13.5 62 16.5 C61 19 56 19 55 17 Z" fill="#050302"/><circle class="spuk-auge" cx="58.6" cy="16.2" r="1.4" fill="#ff2a14"/>
    <path d="M47.5 16 C49 14 52.5 14.5 52.5 17 C51.5 19 48 19 47.5 16 Z" fill="#050302"/><circle class="spuk-auge" cx="50.4" cy="16.6" r="1" fill="#ff2a14"/>
    <path d="M51 25 C55 24 60 24 64 25.5" stroke="#1a1208" stroke-width="1.3" fill="none"/>
    <path d="M52 23.5 l1 3 M55 23.2 l1 3 M58 23.2 l1 3 M61 23.6 l1 3" stroke="#1a1208" stroke-width=".9"/>
    <path d="M55 26 C57 27 59 26 61 27 C61 30 59 32 58 34" stroke="#7a0707" stroke-width="1.6" fill="none"/>
    <path d="M60 6 C64 7 66 10 65 13 C62 12 60 10 60 6 Z M46 25 C48 26 48 29 46 30 C44 29 44 26 46 25 Z" fill="#5e0606" opacity=".85"/>
    <path d="M42 28 C47 33 58 34 63 30" stroke="#1a120a" stroke-width="2.4" fill="none"/>
    <path d="M44 31 l-2 4 M47 32 l-1 5" stroke="#1a120a" stroke-width="1.1"/>
  </g>
</svg>`;

const KREATUREN = [
  () => ZOMBIE(),
  () => ZOMBIE(HAUT.b, "#2e3242"),
  () => ZOMBIE(HAUT.c, "#4a1e1e"),
  () => SKELETT,
  () => WERWOLF,
  () => MUMIE,
  () => SCHLAECHTER,
];

// Der Sarg auf Rädern, Deichsel nach rechts (viewBox 0 -24 215 174,
// Räder unten bei y 146). Gruppen mit Klassen, damit die Räder drehen,
// der Wagen rumpelt und der Deckel sich hebt. Aus den Fugen sickert Blut.
const SARG = `<svg viewBox="0 -24 215 174" xmlns="http://www.w3.org/2000/svg">
  <g class="spuk-sarg__wagen">
    <path d="M185 112 L209 104" stroke="#14100d" stroke-width="5" stroke-linecap="round"/>
    <circle cx="209" cy="104" r="4.5" fill="none" stroke="#55555a" stroke-width="2.5"/>
    <rect x="12" y="104" width="176" height="12" rx="1" fill="#1a120d"/>
    <path d="M12 110 H188" stroke="#2e2119" stroke-width="1.2"/>
    <path d="M14 78 L38 50 L168 52 L190 76 L168 102 L38 104 Z" fill="url(#spuk-holz)" stroke="#070403" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M24 78 L42 58 L164 60 L180 76 L164 94 L42 96 Z" fill="none" stroke="#3e281b" stroke-width="1.6"/>
    <path d="M50 70 C52 66 57 66 58 70 L57 80 L55 74 L54 81 L52 74 L51 80 Z" fill="#6a0707" opacity=".9"/>
    <path d="M70 64 l3 8 M120 66 l-2 9 M150 70 l3 6" stroke="#0a0604" stroke-width="1"/>
    <path d="M38 54 C60 57 100 56 140 58 C150 58 160 58 168 56 L166 60 C150 62 120 61 90 60 C70 59 50 59 40 58 Z" fill="#6a0505"/>
    <path d="M60 58 c0 6 -1 10 0 16 M98 59 c0 4 1 9 0 13 M132 60 c0 5 -1 8 0 12 M156 59 c0 4 1 7 0 10" stroke="#8a0808" stroke-width="2.2" fill="none" stroke-linecap="round" class="spuk-tropf"/>
    <g class="spuk-sarg__gucker">
      <rect x="88" y="44" width="54" height="12" fill="#030101"/>
      <circle class="spuk-auge" cx="104" cy="50" r="2.4" fill="#ff2410"/><circle class="spuk-auge" cx="113" cy="50" r="2.4" fill="#ff2410"/>
      <circle class="spuk-auge" cx="128" cy="50.5" r="1.6" fill="#ff2410"/><circle class="spuk-auge" cx="134" cy="50.5" r="1.6" fill="#ff2410"/>
    </g>
    <g class="spuk-sarg__deckel">
      <path d="M12 54 L36 26 L168 36 L190 62 L168 66 L38 58 Z" fill="url(#spuk-holz)" stroke="#070403" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M92 34 V54 M82 42 H104" stroke="#8a806a" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M86 46 C89 44 94 45 96 48 L95 53 L93 49 L92 54 L90 49 L88 52 Z" fill="#6a0707"/>
      <circle cx="30" cy="40" r="1.6" fill="#6a5d44"/><circle cx="176" cy="54" r="1.6" fill="#6a5d44"/>
      <g class="spuk-rabe">
        <path d="M138 34 C136 22 146 16 154 20 C160 22 160 30 156 34 L170 40 L154 38 C148 40 140 40 138 34 Z" fill="#06060a"/>
        <path d="M152 22 C154 16 160 16 162 20 L168 22 L161 24 C158 26 154 26 152 22 Z" fill="#06060a"/>
        <circle class="spuk-auge" cx="159" cy="20.5" r="1.2" fill="#ff2a14"/><path d="M167 21 L174 22.5 L167 24 Z" fill="#26262c"/>
        <path d="M172 22.5 C176 23 178 25 177 27 C175 26 173 25 172 22.5 Z" fill="#c9a8a0"/><path d="M175 26 c0 2 1 3 0 5" stroke="#8a0a0a" stroke-width="1" fill="none"/>
        <path d="M146 37 l-2 5 M150 37 l1 5" stroke="#4a4a50" stroke-width="1.4"/>
      </g>
    </g>
    <g class="spuk-sarg__hand">
      <path d="M140 60 C146 62 150 70 150 80" stroke="#d9d1b8" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M143 61 C146 63 148 66 149 70" stroke="#6a0808" stroke-width="3" fill="none"/>
      <path d="M150 80 l-3 7 M150 80 l0 8 M150 80 l3 7 M150 80 l5 4" stroke="#d9d1b8" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M150 88 c0 3 -1 5 0 8" stroke="#8f0c0c" stroke-width="1.4" fill="none" class="spuk-tropf"/>
    </g>
    <path d="M40 104 L36 116 M170 104 L174 116" stroke="#14100d" stroke-width="4"/>
    <path d="M30 100 C26 108 28 112 24 116 M64 102 C62 108 63 111 61 114 M110 104 C110 110 108 113 109 118 M150 102 C152 108 150 112 152 116" stroke="#7a0b0b" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </g>
  <g class="spuk-sarg__rad"><circle cx="48" cy="130" r="16" fill="#141212"/><circle cx="48" cy="130" r="11" fill="#3a3330"/>
    <path d="M48 119 V141 M37 130 H59 M40 122 L56 138 M56 122 L40 138" stroke="#141212" stroke-width="2.4"/><circle cx="48" cy="130" r="3" fill="#5a2a12"/>
    <path d="M34 124 A16 16 0 0 1 44 114.5" stroke="#5e0606" stroke-width="3" fill="none"/></g>
  <g class="spuk-sarg__rad"><circle cx="152" cy="130" r="16" fill="#141212"/><circle cx="152" cy="130" r="11" fill="#3a3330"/>
    <path d="M152 119 V141 M141 130 H163 M144 122 L160 138 M160 122 L144 138" stroke="#141212" stroke-width="2.4"/><circle cx="152" cy="130" r="3" fill="#5a2a12"/>
    <path d="M166 136 A16 16 0 0 1 158 145" stroke="#5e0606" stroke-width="3" fill="none"/></g>
</svg>`;

// Ein halber Zombie kriecht hinterher, ohne Beine, Wirbelsäule und Därme
// schleifen nach (viewBox 0 0 70 34, Blick nach rechts)
const KRIECHER = `<svg viewBox="0 0 70 34" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 31 C6 29 10 32 16 30 C20 32 24 29 28 31" stroke="#5e0606" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  <path d="M4 28 C8 24 10 30 14 26 C17 23 20 27 22 25" stroke="#7a1c20" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M2 25 L12 24" stroke="#cfc6aa" stroke-width="2" stroke-dasharray="2 1"/>
  <path d="M10 22 C12 14 30 12 40 18 L42 30 L12 31 Z" fill="#2e2a24"/>
  <path d="M10 22 C14 22 16 26 14 30 L12 31 Z" fill="url(#spuk-wunde)"/>
  <path d="M18 26 C24 24 34 25 41 28 L42 30 L14 31 Z" fill="url(#spuk-blut)"/>
  <path class="spuk-arm" d="M38 22 L52 30 L62 30" stroke="#5f6a4b" stroke-width="4.5" stroke-linecap="round" fill="none"/>
  <path d="M62 30 l5 -2 M62 30 l5 1 M60 31 l6 2" stroke="#8a0a0a" stroke-width="1.2" stroke-linecap="round"/>
  <path class="spuk-arm spuk-arm--2" d="M34 20 L48 14 L60 24" stroke="#3f4732" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M40 8 C40 0 54 -2 58 6 C61 12 56 20 48 20 C42 20 40 14 40 8 Z" fill="url(#spuk-haut-a)"/>
  <path d="M42 4 C45 1 49 1 50 4 C48 6 44 6 42 4 Z" fill="url(#spuk-knochen)"/>
  <circle cx="52" cy="9" r="2.6" fill="#070404"/><circle class="spuk-auge" cx="52.5" cy="9" r="1.3" fill="#ff2a14"/>
  <path d="M50 14 C53 13 58 13 58 15 C57 19 52 19 50 16 Z" fill="#1a0202"/>
  <path d="M51 14.6 l.8 1.4 l.8 -1.4 l.8 1.4 l.8 -1.4 l.8 1.4" stroke="#d2c8a8" stroke-width=".6" fill="none"/>
  <path d="M53 18 c0 3 -1 5 0 8" stroke="#8f0c0c" stroke-width="1.3" fill="none" class="spuk-tropf"/>
</svg>`;

// Ein Gespenst schwebt über der Horde: schwarze Kutte in Fetzen, darunter
// ein bleicher Schädel, lange Knochenfinger (viewBox 0 0 70 90)
const GEIST = `<svg viewBox="0 0 70 90" xmlns="http://www.w3.org/2000/svg">
  <path class="spuk-geist__tuch" d="M14 40 C12 14 26 2 40 2 C56 2 66 16 64 40 L67 84 L60 72 L56 89 L49 74 L43 90 L37 75 L30 88 L25 74 L17 86 L15 70 L10 80 Z" fill="rgba(14,10,16,.86)"/>
  <path d="M20 30 C18 50 22 66 20 80 M58 34 C60 52 58 66 61 78 M40 46 C39 60 41 72 40 84" stroke="rgba(60,40,60,.5)" stroke-width="1" fill="none"/>
  <path d="M22 44 C12 50 6 46 2 40 M60 44 C68 50 72 48 72 42" stroke="rgba(14,10,16,.86)" stroke-width="7" stroke-linecap="round" fill="none"/>
  <path d="M72 42 l4 -4 M72 42 l5 0 M72 42 l4 4 M72 42 l1 6" stroke="#d8cfb4" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M2 40 l-3 -4 M2 40 l-4 0 M2 40 l-3 4" stroke="#d8cfb4" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M30 18 C30 8 54 6 56 18 C57 26 54 32 50 36 L38 36 C33 32 30 26 30 18 Z" fill="url(#spuk-knochen)" opacity=".92"/>
  <path d="M30 18 C30 8 54 6 56 18 C57 26 54 32 50 36 L38 36 C33 32 30 26 30 18 Z" fill="url(#spuk-schatten)"/>
  <path d="M26 16 C28 2 52 -2 60 12 C56 8 44 6 34 10 C30 12 28 14 26 16 Z" fill="rgba(14,10,16,.95)"/>
  <ellipse cx="41" cy="21" rx="4.2" ry="5" fill="#040204"/><ellipse cx="51.5" cy="20.5" rx="3.4" ry="4.4" fill="#040204"/>
  <circle class="spuk-auge" cx="41.5" cy="21.5" r="1.3" fill="#ff2a14"/><circle class="spuk-auge" cx="51.8" cy="21" r="1.1" fill="#ff2a14"/>
  <path d="M46 25 l-1.4 3 h2.8 Z" fill="#040204"/>
  <path class="spuk-geist__mund" d="M39 31 C39 29 51 29 51 31 L49.5 45 C47 49 43 49 41 45 Z" fill="#040204"/>
  <path d="M40 31 l1.2 2 l1.2 -2 l1.2 2 l1.2 -2 l1.2 2 l1.2 -2 l1.2 2 l1.2 -2" stroke="#d2c8a8" stroke-width=".8" fill="none"/>
  <path d="M45 46 c0 4 -1 7 0 11" stroke="#8f0c0c" stroke-width="1.5" fill="none" class="spuk-tropf"/>
</svg>`;

// Fledermaus (viewBox 0 0 60 30)
const FLEDERMAUS = `<svg viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg">
  <g class="spuk-fledermaus__fluegel" fill="#07060a">
    <path d="M30 14 C24 4 14 2 2 6 C8 8 9 12 6 16 C12 14 14 18 13 22 C18 18 24 18 30 18 Z"/>
    <path d="M30 14 C36 4 46 2 58 6 C52 8 51 12 54 16 C48 14 46 18 47 22 C42 18 36 18 30 18 Z"/>
  </g>
  <path d="M26 12 L27 6 L29.5 10 L30.5 10 L33 6 L34 12 C35 20 25 20 26 12 Z" fill="#07060a"/>
  <circle class="spuk-auge" cx="28.4" cy="12.6" r=".9" fill="#ff3a1a"/><circle class="spuk-auge" cx="31.6" cy="12.6" r=".9" fill="#ff3a1a"/>
  <path d="M29 16 l.5 1.6 l.5 -1.6 M30.5 16 l.5 1.6 l.5 -1.6" stroke="#e8e0c8" stroke-width=".5" fill="none"/>
</svg>`;

// Eine verweste Hand greift aus der Erde, die Fingerspitzen blanker
// Knochen (viewBox 0 0 30 50)
const HAND = `<svg viewBox="0 0 30 50" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 50 L11 26 L18 26 L19 50 Z" fill="url(#spuk-haut-a)"/>
  <path d="M8 28 C6 20 10 16 14 16 C20 16 23 20 22 28 Z" fill="url(#spuk-haut-a)"/>
  <g stroke="#5f6a4b" stroke-width="3" stroke-linecap="round" fill="none">
    <path d="M9 19 L6 11"/><path d="M12 17 L11.5 8"/><path d="M16 17 L17.5 8"/><path d="M20 20 L24 12"/><path d="M8 24 L2 20"/>
  </g>
  <g stroke="#d9d1b8" stroke-width="1.4" stroke-linecap="round" fill="none">
    <path d="M6 11 L5 5"/><path d="M11.5 8 L12.5 2"/><path d="M17.5 8 L20 3"/><path d="M24 12 L27 9"/>
  </g>
  <path d="M11 30 C14 29 17 31 16 35 C13 37 10 34 11 30 Z" fill="url(#spuk-wunde)"/>
  <path d="M13 36 c0 3 -1 5 0 8" stroke="#8f0c0c" stroke-width="1.3" fill="none" class="spuk-tropf"/>
  <path d="M10 40 l9 0" stroke="#2a2620" stroke-width="4"/>
</svg>`;

// Grabsteine (viewBox 0 0 40 50, Fuss bei y 50), mit Blut beschmiert
const GRABSTEINE = [
  `<svg viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg"><path d="M6 50 V18 C6 4 34 4 34 18 V50 Z" fill="#33353a" stroke="#141518" stroke-width="1.5"/>
   <text x="20" y="26" font-size="8" font-family="serif" text-anchor="middle" fill="#141518">R.I.P.</text><path d="M12 34 h16 M14 39 h12" stroke="#141518" stroke-width="1.2"/>
   <path d="M30 12 l-4 8 l3 4" stroke="#141518" stroke-width="1" fill="none"/>
   <path d="M10 14 C14 12 16 16 13 19 C13 24 14 28 13 33 C12 28 11 24 11 20 C9 18 9 16 10 14 Z" fill="#5e0505"/></svg>`,
  `<svg viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(-9 20 50)"><path d="M17 50 V22 H8 V15 H17 V5 H23 V15 H32 V22 H23 V50 Z" fill="#2c2e33" stroke="#121316" stroke-width="1.5"/>
   <path d="M19 6 C22 6 23 9 21 12 L21 30 C20 26 19 22 19.5 14 C18 12 18 8 19 6 Z" fill="#5a0505"/></g></svg>`,
  `<svg viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(7 20 50)"><path d="M8 50 V14 L14 6 H26 L32 14 V50 Z" fill="#3a3c40" stroke="#16171a" stroke-width="1.5"/>
   <path d="M14 20 h12 M14 26 h12 M16 32 h8" stroke="#16171a" stroke-width="1.2"/><path d="M10 40 l6 -6 l2 5" stroke="#16171a" stroke-width="1" fill="none"/>
   <path d="M22 8 C26 8 28 11 26 14 C25 20 26 24 25 28 C24 24 23 20 23.5 15 C21 13 21 10 22 8 Z M12 42 c3 -2 6 0 5 3 c-2 1 -4 0 -5 -3 Z" fill="#600606"/></g></svg>`,
];

// Totes Gras am oberen Rand der Erde
const GRAS = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='80' height='16' viewBox='0 0 80 16'>" +
  "<path d='M0 16 L3 8 L4 16 L7 3 L9 16 L12 9 L14 16 L18 5 L19 16 L24 10 L25 16 L28 2 L31 16 L35 8 L36 16 L40 4 " +
  "L42 16 L46 9 L48 16 L51 1 L53 16 L57 7 L59 16 L63 3 L64 16 L68 9 L70 16 L74 4 L76 16 L80 8 L80 16 Z' fill='#120f0b'/></svg>")}")`;

// Oben läuft Blut über den Rand des Bandes herab
const BLUTRAND = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='24' viewBox='0 0 160 24'>" +
  "<path d='M0 0 H160 V4 C156 4 155 6 154 9 C153 13 150 13 150 9 C150 6 146 5 140 5 C134 5 133 7 132 14 C131 21 126 21 126 14 " +
  "C126 8 122 6 112 6 C104 6 103 8 102 10 C101 12 98 12 98 10 C98 7 92 5 82 5 C76 5 74 7 73 16 C72 24 66 24 66 16 C66 8 62 5 52 5 " +
  "C44 5 42 7 41 11 C40 15 36 15 36 11 C36 7 30 4 20 4 C14 4 12 6 11 13 C10 19 5 19 5 13 C5 7 3 4 0 4 Z' fill='#600404'/>" +
  "<path d='M0 0 H160 V2 C120 3 40 3 0 2 Z' fill='#900a0a'/></svg>")}")`;

export default function Durchfahrt() {
  const ref = useRef(null);
  useEffect(() => {
    const band = ref.current;
    if (!band) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let aus = false;
    const uhren = new Set();
    const warte = (ms) => new Promise((ok) => {
      const t = setTimeout(() => { uhren.delete(t); ok(); }, ms);
      uhren.add(t);
    });
    // Im versteckten Tab spukt es nicht
    const wach = async () => { while (!aus && document.hidden) await warte(1000); };
    const weg = (el, a) => { a.onfinish = () => el.remove(); };

    // Verläufe für alle Zeichnungen, dann die Nacht über dem ganzen Band:
    // Dunkel, Blutmond, Wolken davor, oben läuft Blut über den Rand
    band.insertAdjacentHTML("beforeend", DEFS);
    const himmel = document.createElement("div");
    himmel.className = "spuk-himmel";
    band.appendChild(himmel);
    const mond = document.createElement("div");
    mond.className = "spuk-mond";
    mond.innerHTML = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="48" fill="url(#spuk-mondg)"/>
      <circle cx="36" cy="38" r="9" fill="#7a1408" opacity=".45"/><circle cx="62" cy="58" r="12" fill="#6a0e06" opacity=".4"/>
      <circle cx="58" cy="28" r="5" fill="#7a1408" opacity=".35"/><circle cx="34" cy="66" r="6" fill="#6a0e06" opacity=".35"/></svg>`;
    band.appendChild(mond);
    for (let i = 0; i < 3; i++) {
      const w = document.createElement("div");
      w.className = "spuk-wolke";
      w.style.cssText = `top:${zufall(2, 30)}%;animation-duration:${zufall(55, 90).toFixed(0)}s;animation-delay:${-zufall(0, 80).toFixed(0)}s`;
      band.appendChild(w);
    }
    const blutrand = document.createElement("div");
    blutrand.className = "spuk-blutrand";
    blutrand.style.setProperty("--blutrand", BLUTRAND);
    band.appendChild(blutrand);
    const blitz = document.createElement("div");
    blitz.className = "spuk-blitz";
    band.appendChild(blitz);

    // Unten ein roter Schein, darauf die Erde mit totem Gras,
    // Grabsteinen, Blutlachen und ziehendem Nebel
    const schein = document.createElement("div");
    schein.className = "spuk-schein";
    band.appendChild(schein);
    const erde = document.createElement("div");
    erde.className = "spuk-erde";
    erde.style.setProperty("--gras", GRAS);
    band.appendChild(erde);
    const nebel = document.createElement("div");
    nebel.className = "spuk-nebel";
    band.appendChild(nebel);
    const erdeHoch = () => Math.max(10, Math.round((band.clientHeight || 120) * .13));
    const steine = [];
    const steineSetzen = () => {
      steine.forEach((s) => s.remove());
      steine.length = 0;
      const breit = band.clientWidth, g = erdeHoch() * 2.4;
      if (!breit) return;
      for (let x = zufall(10, 80); x < breit - 20; x += zufall(140, 320)) {
        const s = document.createElement("div");
        s.className = "spuk-grab";
        s.style.cssText = `left:${x}px;bottom:${erdeHoch() * .35}px;width:${g * .8}px;height:${g}px`;
        s.innerHTML = eins(GRABSTEINE);
        band.appendChild(s);
        steine.push(s);
      }
      // Blutlachen, die liegen bleiben
      for (let x = zufall(40, 200); x < breit - 30; x += zufall(180, 420)) {
        const l = document.createElement("div");
        l.className = "spuk-lache";
        const lw = zufall(30, 80);
        l.style.cssText = `left:${x}px;bottom:${erdeHoch() * zufall(.15, .5)}px;width:${lw}px;height:${lw * .18}px`;
        band.appendChild(l);
        steine.push(l);
      }
    };
    let breitVorher = 0;
    const erdeSetzen = () => {
      erde.style.height = erdeHoch() + "px";
      nebel.style.height = erdeHoch() * 2.6 + "px";
      if (Math.abs((band.clientWidth || 0) - breitVorher) > 40) { breitVorher = band.clientWidth; steineSetzen(); }
    };
    erdeSetzen();
    const wo = new ResizeObserver(erdeSetzen);
    wo.observe(band);

    // Erde, wo die Räder rollen: spritzt auf und vergeht
    const dreck = (x, y, g) => {
      const d = document.createElement("div");
      d.className = "spuk-dreck";
      d.style.cssText = `left:${x - g / 2}px;bottom:${y}px;width:${g}px;height:${g * .6}px`;
      band.appendChild(d);
      weg(d, d.animate([{ opacity: .7, transform: "scale(.4)" }, { opacity: 0, transform: `translate(0,${-g * .4}px) scale(1.6)` }],
        { duration: zufall(700, 1100), easing: "ease-out", fill: "forwards" }));
    };
    // Grüner Dunst aus dem Sarg: steigt und weht nach hinten
    const dunst = (x, y, g, nachHinten) => {
      const r = document.createElement("div");
      r.className = "spuk-dunst";
      r.style.cssText = `left:${x - g / 2}px;bottom:${y}px;width:${g}px;height:${g}px`;
      band.appendChild(r);
      weg(r, r.animate([{ opacity: .75, transform: "translate(0,0) scale(.5)" },
        { opacity: 0, transform: `translate(${nachHinten * zufall(20, 45)}px,${-zufall(25, 45)}px) scale(1.9)` }],
        { duration: zufall(1600, 2400), easing: "ease-out", fill: "forwards" }));
    };
    // Ein Blutstropfen fällt auf die Erde und bleibt kurz als Fleck liegen
    const blut = (x, y, boden) => {
      const g = zufall(3, 5);
      const t = document.createElement("div");
      t.className = "spuk-blut";
      t.style.cssText = `left:${x}px;bottom:${y}px;width:${g}px;height:${g * 1.4}px`;
      band.appendChild(t);
      const fall = Math.max(0, y - boden);
      weg(t, t.animate([
        { opacity: .95, transform: "translate(0,0)" },
        { opacity: .95, transform: `translate(0,${fall}px)`, offset: .25, easing: "ease-out" },
        { opacity: .9, transform: `translate(0,${fall}px) scale(2.6,.5)`, offset: .3 },
        { opacity: 0, transform: `translate(0,${fall}px) scale(2.8,.45)` },
      ], { duration: zufall(4500, 6500), easing: "ease-in", fill: "forwards" }));
    };
    // Blutspur hinter dem Sarg: ein Schmierer auf der Erde, der langsam vergeht
    const spur = (x, y, g) => {
      const s = document.createElement("div");
      s.className = "spuk-spur";
      s.style.cssText = `left:${x - g / 2}px;bottom:${y}px;width:${g}px;height:${g * .22}px`;
      band.appendChild(s);
      weg(s, s.animate([{ opacity: .85 }, { opacity: .6, offset: .5 }, { opacity: 0 }],
        { duration: zufall(5000, 7000), easing: "ease-in", fill: "forwards" }));
    };
    // Von oben läuft ein Rinnsal Blut herab, dann fällt ein Tropfen
    const rinnsal = () => {
      const breit = band.clientWidth, hoch = band.clientHeight;
      if (!breit || !hoch) return;
      const x = zufall(8, breit - 8), lang = hoch * zufall(.12, .38), w = zufall(2.5, 5);
      const r = document.createElement("div");
      r.className = "spuk-rinnsal";
      r.style.cssText = `left:${x}px;top:0;width:${w}px;height:${lang}px`;
      band.appendChild(r);
      const dauer = zufall(7000, 11000);
      weg(r, r.animate([
        { transform: "scaleY(0)", opacity: 1 },
        { transform: "scaleY(1)", opacity: 1, offset: .55 },
        { transform: "scaleY(1)", opacity: .9, offset: .8 },
        { transform: "scaleY(1)", opacity: 0 },
      ], { duration: dauer, easing: "ease-out", fill: "forwards" }));
      const t = setTimeout(() => { uhren.delete(t); if (!aus) blut(x - .5, hoch - lang - 2, erdeHoch() * .45 - 2); }, dauer * .55);
      uhren.add(t);
    };
    // Ein Blitz erhellt kurz alles
    const blitzen = () => {
      blitz.animate([{ opacity: 0 }, { opacity: .32, offset: .08 }, { opacity: .04, offset: .2 }, { opacity: .22, offset: .3 }, { opacity: 0 }],
        { duration: 900, easing: "ease-out" });
    };

    // Fledermäuse flattern in Wellen über das Band
    const fledermaus = () => {
      const breit = band.clientWidth, hoch = band.clientHeight;
      if (!breit || !hoch) return;
      const g = zufall(.12, .22) * hoch, rechts = Math.random() < .5;
      const f = document.createElement("div");
      f.className = "spuk-fledermaus";
      f.style.cssText = `left:0;top:${zufall(.05, .45) * hoch}px;width:${g * 2}px;height:${g}px;--flattern:${zufall(.12, .2).toFixed(2)}s`;
      f.innerHTML = FLEDERMAUS;
      band.appendChild(f);
      const von = rechts ? -g * 2 - 10 : breit + 10, bis = rechts ? breit + 10 : -g * 2 - 10;
      const welle = (p) => Math.sin(p * Math.PI * zufall(3, 5)) * hoch * .08;
      const schritte = [0, .2, .4, .6, .8, 1].map((p) => ({ transform: `translate(${von + (bis - von) * p}px,${welle(p)}px)` }));
      weg(f, f.animate(schritte, { duration: zufall(4000, 7000) * Math.max(1, breit / 1400), easing: "linear", fill: "forwards" }));
    };
    // Eine Hand greift aus der Erde und sinkt wieder zurück
    const hand = () => {
      const breit = band.clientWidth;
      if (!breit) return;
      const g = erdeHoch() * zufall(2.2, 3.2);
      const h = document.createElement("div");
      h.className = "spuk-hand";
      h.style.cssText = `left:${zufall(20, breit - 40)}px;bottom:0;width:${g * .6}px;height:${g + erdeHoch() * .5}px`;
      h.innerHTML = `<div class="spuk-hand__innen">${HAND}</div>`;
      band.appendChild(h);
      const innen = h.firstChild;
      innen.style.height = g + "px";
      weg(h, innen.animate([
        { transform: "translateY(100%)" },
        { transform: "translateY(8%) rotate(-6deg)", offset: .3, easing: "ease-out" },
        { transform: "translateY(4%) rotate(5deg)", offset: .45 },
        { transform: "translateY(10%) rotate(-4deg)", offset: .65 },
        { transform: "translateY(100%)" },
      ], { duration: zufall(3500, 5000), easing: "ease-in-out", fill: "forwards" }));
    };
    (async () => {
      await warte(zufall(2000, 4000));
      while (!aus) {
        await wach();
        if (aus) return;
        for (let n = ganz(1, 3); n > 0; n--) fledermaus();
        await warte(zufall(6000, 12000));
      }
    })();
    (async () => {
      await warte(zufall(800, 2000));
      while (!aus) {
        await wach();
        if (aus) return;
        rinnsal();
        await warte(zufall(1500, 3500));
      }
    })();
    (async () => {
      await warte(zufall(6000, 12000));
      while (!aus) {
        await wach();
        if (aus) return;
        blitzen();
        await warte(zufall(18000, 40000));
      }
    })();
    (async () => {
      await warte(zufall(3000, 6000));
      while (!aus) {
        await wach();
        if (aus) return;
        hand();
        await warte(zufall(7000, 14000));
      }
    })();

    const horde = async () => {
      const breit = band.clientWidth, hoch = band.clientHeight;
      if (!breit || !hoch) return;
      const H = Math.max(36, Math.min(140, hoch * .58));      // Sarg bis zum Rad unten
      const kh = H * .9, kw = kh * 80 / 120;                  // Kreatur
      const boden = erdeHoch() * .45;                         // dort stehen die Füsse
      const rechts = Math.random() < .5;                      // Laufrichtung

      const zug = document.createElement("div");
      zug.className = "spuk";
      const hoehe = H * 174 / 150;
      // Alles in der Zeichnung nach rechts laufend, von links: Kriecher,
      // Sarg, Ketten, zwei Zugzombies, vorne zwei bis vier Kreaturen
      const teile = [];
      const kriecher = Math.random() < .45;
      let x = kriecher ? kh * .75 : 0;
      const sargX = x;
      const sarg = document.createElement("div");
      sarg.className = "spuk-sarg";
      sarg.style.cssText = `left:${sargX}px;bottom:${-4 / 150 * H}px;width:${H * 215 / 150}px;height:${hoehe}px`;
      sarg.innerHTML = SARG;
      const deichsel = { x: sargX + 209 / 150 * H, y: (150 - 104) / 150 * H };
      x = deichsel.x + H * .25;
      const kreatur = (hx, klasse, svg, tiefer) => {
        const el = document.createElement("div");
        el.className = "spuk-kreatur " + klasse;
        const g = kh * (tiefer ? .92 : 1);
        el.style.cssText = `left:${hx}px;bottom:${-.02 * g + (tiefer ? kh * .08 : 0)}px;width:${g * 80 / 120}px;height:${g}px;` +
          `z-index:${tiefer ? 1 : 3};--schritt:${zufall(.55, .8).toFixed(2)}s;animation-delay:${-zufall(0, .8).toFixed(2)}s`;
        el.innerHTML = `<div class="spuk-kreatur__koerper">${svg}</div>`;
        el.querySelectorAll(".spuk-bein, .spuk-arm, .spuk-kopf").forEach((b) => { b.style.animationDelay = el.style.animationDelay; });
        teile.push({ el, x: hx, w: g * 80 / 120, g });
        return { el, g };
      };
      // Zwei Zombies ziehen an Ketten, einer etwas weiter hinten im Bild
      const zieher = [];
      for (const tiefer of [true, false]) {
        const hx = x + (tiefer ? kw * .55 : 0);
        const { g } = kreatur(hx, "spuk-kreatur--zieht", eins(KREATUREN.slice(0, 3))(), tiefer);
        zieher.push({ x: hx + 30 / 80 * g * 80 / 120, y: (tiefer ? kh * .08 : 0) + (120 - 62) / 120 * g });
      }
      x += kw * 1.9;
      const vorne = [...KREATUREN].sort(() => Math.random() - .5);
      for (let n = ganz(2, 4), i = 0; n > 0; n--, i++) {
        kreatur(x, "", vorne[i % vorne.length](), false);
        x += kw * zufall(1.15, 1.5);
      }
      const lang = x + kw * .3;
      const zh = hoehe + H * .2;
      zug.style.cssText = `width:${lang}px;height:${zh}px;bottom:${boden}px`;
      // Ketten von der Deichsel zu den Händen, leicht durchhängend
      const kette = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      kette.setAttribute("class", "spuk-kette");
      kette.setAttribute("viewBox", `0 0 ${lang} ${zh}`);
      kette.innerHTML = zieher.map((z) => {
        const ax = deichsel.x, ay = zh - deichsel.y, bx = z.x, by = zh - z.y;
        return `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)} Q${((ax + bx) / 2).toFixed(1)} ${(Math.max(ay, by) + H * .06).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}"/>`;
      }).join("");
      zug.appendChild(kette);
      zug.appendChild(sarg);
      teile.forEach((t) => zug.appendChild(t.el));
      if (kriecher) {
        const k = document.createElement("div");
        k.className = "spuk-kriecher";
        const kk = kh * .3;
        k.style.cssText = `left:0;bottom:0;width:${kk * 70 / 34}px;height:${kk}px`;
        k.innerHTML = KRIECHER;
        zug.appendChild(k);
      }
      if (Math.random() < .55) {
        const geist = document.createElement("div");
        geist.className = "spuk-geist";
        const gh = H * .5;
        geist.style.cssText = `left:${zufall(sargX + H * .3, Math.max(sargX + H * .4, lang - gh))}px;bottom:${H * .62}px;width:${gh * 70 / 90}px;height:${gh}px`;
        geist.innerHTML = GEIST;
        zug.appendChild(geist);
      }
      // Die Räder drehen genau so schnell, wie die Horde schlurft
      const dauer = zufall(20000, 26000) * Math.max(1, (breit + lang) / 1600);
      const tempo = (breit + lang + 40) / dauer * 1000;
      const umfang = 2 * Math.PI * 16 / 150 * H;
      zug.querySelectorAll(".spuk-sarg__rad").forEach((r) => { r.style.animationDuration = (umfang / tempo).toFixed(2) + "s"; });
      band.appendChild(zug);

      const spiegel = rechts ? "" : " scaleX(-1)";
      const von = rechts ? -lang - 20 : breit + 20, bis = rechts ? breit + 20 : -lang - 20;
      const a = zug.animate([{ transform: `translateX(${von}px)${spiegel}` }, { transform: `translateX(${bis}px)${spiegel}` }],
        { duration: dauer, easing: "linear", fill: "forwards" });
      // Stelle im Band zu einer Stelle in der Zeichnung
      const imBand = (px) => {
        const p = Math.min(1, (a.currentTime || 0) / dauer);
        const zx = von + (bis - von) * p;
        return zx + (rechts ? px : lang - px);
      };
      const raeder = [sargX + 48 / 150 * H, sargX + 152 / 150 * H];
      const spalt = { x: sargX + 115 / 150 * H, y: boden + (150 - 46) / 150 * H };
      let naechsterDreck = 0, naechsterDunst = 0, naechsteSpur = 0, naechstesBlut = performance.now() + zufall(300, 900);
      const nebenbei = async () => {
        while (!aus && zug.isConnected) {
          await warte(90);
          if (aus || !zug.isConnected) return;
          const jetzt = performance.now();
          if (jetzt > naechsterDreck) {
            raeder.forEach((r) => { const bx = imBand(r); if (bx > -20 && bx < breit + 20) dreck(bx + zufall(-4, 4), boden - 2, H * zufall(.14, .22)); });
            naechsterDreck = jetzt + zufall(180, 360);
          }
          if (jetzt > naechsteSpur) {
            const bx = imBand(raeder[0] + zufall(-H * .1, H * .1));
            if (bx > -20 && bx < breit + 20) spur(bx, boden - 3, H * zufall(.3, .5));
            naechsteSpur = jetzt + zufall(220, 380);
          }
          if (jetzt > naechsterDunst) {
            const bx = imBand(spalt.x + zufall(-H * .15, H * .15));
            if (bx > -20 && bx < breit + 20) dunst(bx, spalt.y, H * zufall(.14, .22), rechts ? -1 : 1);
            naechsterDunst = jetzt + zufall(300, 550);
          }
          if (jetzt > naechstesBlut) {
            const t = eins(teile);
            const bx = imBand(t.x + t.w * zufall(.55, .85));
            if (bx > 0 && bx < breit) blut(bx, boden + t.g * zufall(.45, .7), boden - 2);
            naechstesBlut = jetzt + zufall(300, 900);
          }
        }
      };
      nebenbei();
      await new Promise((ok) => { a.onfinish = ok; a.oncancel = ok; });
      zug.remove();
    };

    (async () => {
      await warte(zufall(1000, 2500));
      while (!aus) {
        await wach();
        if (aus) return;
        await horde();
        // Kurze Pause, dann kommt die nächste Horde
        await warte(zufall(5000, 10000));
      }
    })();

    return () => {
      aus = true;
      uhren.forEach(clearTimeout);
      uhren.clear();
      wo.disconnect();
      band.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      band.replaceChildren();
    };
  }, []);
  return <div className="durchfahrt" ref={ref} aria-hidden="true" />;
}
