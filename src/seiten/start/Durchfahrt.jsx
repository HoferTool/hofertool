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
//  Gesteuert mit Zeitgebern und el.animate statt React-Zustand, damit
//  die Startseite dafür nie neu zeichnet.
// =================================================================
import { useEffect, useRef } from "react";

const zufall = (a, b) => a + Math.random() * (b - a);
const ganz = (a, b) => Math.floor(zufall(a, b + 1));
const eins = (liste) => liste[ganz(0, liste.length - 1)];

// Die Kreaturen, alle im Raster 80 × 120, Blick nach rechts, Füsse bei
// y 118. Klassen: spuk-bein (schwingt), spuk-arm (greift), spuk-kopf
// (wankt), spuk-auge (glüht), spuk-kiefer (klappert).
const ZOMBIE = (haut = "#8aa676", hautDunkel = "#6f8a5e", hemd = "#4e4638") => `<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg">
  <path class="spuk-arm spuk-arm--2" d="M42 46 L60 52 L72 54" stroke="${hautDunkel}" stroke-width="5.5" stroke-linecap="round" fill="none"/>
  <g class="spuk-bein"><path d="M34 74 L30 97 L32 115" stroke="#23262d" stroke-width="9" stroke-linecap="round" fill="none"/>
    <path d="M26 117 L38 117" stroke="#120f0d" stroke-width="5" stroke-linecap="round"/></g>
  <g class="spuk-bein spuk-bein--2"><path d="M42 74 L47 95 L45 108" stroke="#2c3038" stroke-width="9" stroke-linecap="round" fill="none"/>
    <path d="M41 104 l2 5 l2 -4 l2 5 l2 -5" stroke="#2c3038" stroke-width="2" fill="none"/>
    <path d="M45 108 L45 115" stroke="${hautDunkel}" stroke-width="4" stroke-linecap="round"/>
    <path d="M42 117 L53 117" stroke="${hautDunkel}" stroke-width="4.5" stroke-linecap="round"/></g>
  <path d="M28 44 C30 35 46 31 52 39 L55 75 L49 81 L46 76 L42 82 L38 77 L34 82 L31 77 Z" fill="${hemd}"/>
  <ellipse cx="45" cy="56" rx="7" ry="9" fill="#4a0a0a"/>
  <path d="M40 51 C43 50 47 50 50 51 M39 55 C43 54 47 54 51 55 M40 59 C43 58 47 58 50 59" stroke="#ddd3b8" stroke-width="1.4" fill="none"/>
  <path d="M44 64 C44 70 43 73 44 76 C45 73 46 70 46 64 Z" fill="#7a0b0b"/>
  <path d="M31 50 l5 5 l-3 4 M50 68 l-4 3" stroke="#221d17" stroke-width="1.3" fill="none"/>
  <g class="spuk-arm"><path d="M46 42 L64 45 L75 42" stroke="${haut}" stroke-width="6.5" stroke-linecap="round" fill="none"/>
    <path d="M75 42 l5 -3 M75 42 l6 0 M75 43 l4 3" stroke="${haut}" stroke-width="2" stroke-linecap="round"/>
    <path d="M44 37 L58 40 L57 48 L54 45 L51 49 L47 45 Z" fill="${hemd}"/>
    <path d="M64 43 l3 1" stroke="#5a0b0b" stroke-width="2"/></g>
  <path d="M46 37 L50 30" stroke="${hautDunkel}" stroke-width="7"/>
  <g class="spuk-kopf">
    <path d="M42 22 C40 10 52 4 60 8 C68 12 68 26 62 32 C56 36 46 34 42 22 Z" fill="${haut}"/>
    <path d="M45 14 C48 10 53 12 50 17 C48 18 45 17 45 14 Z" fill="${hautDunkel}"/>
    <path d="M57 8 C62 8 64 12 61 15 C58 15 56 12 57 8 Z" fill="#e3dcc7"/>
    <path d="M52 16 Q60 12 67 17" stroke="#33402b" stroke-width="2.6" fill="none"/>
    <ellipse cx="60" cy="19.5" rx="4" ry="3.4" fill="#120c0a"/><circle class="spuk-auge" cx="60.6" cy="19.5" r="1.8" fill="#ff2a14"/>
    <ellipse cx="52.5" cy="20" rx="2.8" ry="2.8" fill="#120c0a"/><circle class="spuk-auge" cx="53" cy="20" r="1.3" fill="#ff2a14"/>
    <path d="M54 25 C58 23 67 23 67 27 C66 34 58 35 54 30 Z" fill="#1e0404"/>
    <path d="M56 25.5 l1 2.4 l1 -2.4 l1 2.4 l1 -2.4 l1 2.4 l1 -2.4 l1 2.4 l1 -2.4 M57 32 l1 -2 l1 2 l1 -2 l1 2 l1 -2" stroke="#e8e0c0" stroke-width="1" fill="none"/>
    <path d="M58 32 C58 37 56.5 39 58 42 C59.5 39 59.5 36 59.5 32 Z" fill="#8f0c0c"/>
    <path d="M44 13 C40 9 41 5 45 6 M48 9 C47 3 50 2 53 4 M43 19 C39 18 39 15 40 13" stroke="#20201a" stroke-width="1.3" fill="none"/>
    <path d="M47 26 l4 1 M48 24 l1 4 M50 24 l1 4" stroke="#2a2a20" stroke-width=".9"/>
  </g>
</svg>`;

const SKELETT = `<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#e6e0cc" stroke-linecap="round" fill="none">
    <path class="spuk-arm spuk-arm--2" d="M38 41 L52 52 L68 50" stroke="#bdb6a0" stroke-width="2.6"/>
    <g class="spuk-bein"><path d="M38 72 L34 94 L36 115" stroke-width="3.6"/><path d="M32 117 h9" stroke-width="3"/><circle cx="34" cy="94" r="1.8" fill="#e6e0cc"/></g>
    <g class="spuk-bein spuk-bein--2"><path d="M42 72 L46 94 L44 115" stroke-width="3.6"/><path d="M41 117 h9" stroke-width="3"/><circle cx="46" cy="94" r="1.8" fill="#e6e0cc"/></g>
    <path d="M31 70 Q40 79 49 70" stroke-width="4.5"/>
    <path d="M40 70 L44 36" stroke-width="3.2" stroke-dasharray="3 1.4"/>
    <path d="M43 42 C33 42 32 55 41 57 M43 42 C53 42 53 55 45 57 M43 47 C36 47 35 53 42 54 M43 47 C51 47 51 53 45 54" stroke-width="1.9"/>
    <path d="M35 40 H53" stroke-width="2.8"/>
    <g class="spuk-arm"><path d="M51 40 L65 42 L78 37" stroke-width="2.9"/>
      <path d="M78 37 l3 -4 M78 37 l5 -1 M78 37 l4 3" stroke-width="1.5"/></g>
  </g>
  <path d="M60 30 L76 -2" stroke="#4a3626" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M74 -4 C88 -2 92 12 84 22 C86 12 82 4 72 2 Z" fill="#9aa2a8" stroke="#555c62" stroke-width=".8"/>
  <g class="spuk-kopf">
    <path d="M40 18 C38 4 60 2 62 14 C63 20 60 24 58 26 L46 27 C42 25 40 22 40 18 Z" fill="#ece6d2"/>
    <path d="M50 12.5 C53 10.5 57.5 11.5 57.5 15 C57 19 52 19 50 16 Z" fill="#0f0a08"/><circle class="spuk-auge" cx="54" cy="15" r="1.4" fill="#ff3018"/>
    <path d="M42.5 13.5 C44 11.5 47.5 12.5 47 15.5 C46 18 43 17.5 42.5 13.5 Z" fill="#0f0a08"/><circle class="spuk-auge" cx="45" cy="15" r="1" fill="#ff3018"/>
    <path d="M53 18.5 l-1.8 3.4 h3.4 Z" fill="#0f0a08"/>
    <path d="M46 4 l2 4 l-2 3 l2 3" stroke="#7d7562" stroke-width=".9" fill="none"/>
    <g class="spuk-kiefer"><path d="M45 24.5 L59 24.5 L57.5 31 L47 31 Z" fill="#dcd5be"/>
      <path d="M47.5 24.5 v3 M50 24.5 v3 M52.5 24.5 v3 M55 24.5 v3" stroke="#0f0a08" stroke-width=".8"/></g>
  </g>
</svg>`;

const WERWOLF = `<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg">
  <path class="spuk-arm spuk-arm--2" d="M44 48 C54 56 60 64 66 70" stroke="#241c17" stroke-width="7" stroke-linecap="round" fill="none"/>
  <g class="spuk-bein"><path d="M28 74 C20 88 34 96 26 114" stroke="#241c17" stroke-width="10" stroke-linecap="round" fill="none"/>
    <path d="M22 117 L34 116 M33 116 l3 -1 M30 117 l3 0" stroke="#efe6d0" stroke-width="1.4"/></g>
  <g class="spuk-bein spuk-bein--2"><path d="M38 76 C34 90 46 96 40 114" stroke="#2f2620" stroke-width="10" stroke-linecap="round" fill="none"/>
    <path d="M36 117 L48 116 M47 116 l3 -1" stroke="#efe6d0" stroke-width="1.4"/></g>
  <path d="M22 70 C14 52 26 30 46 30 C58 30 64 40 60 54 C58 66 50 78 36 80 Z" fill="#33291f"/>
  <path d="M22 68 l-6 -3 l4 -4 l-6 -5 l6 -2 l-4 -6 l7 -1 l-2 -7 l7 2 l0 -7 l6 4 l2 -6 l4 5 l4 -4" fill="#33291f"/>
  <path d="M50 46 C57 52 55 66 46 73 C44 62 46 52 50 46 Z" fill="#54443a"/>
  <path d="M30 50 l4 2 M34 60 l3 3 M26 58 l3 1" stroke="#1c1612" stroke-width="1.3"/>
  <g class="spuk-arm"><path d="M52 44 C62 50 68 56 73 60" stroke="#33291f" stroke-width="8" stroke-linecap="round" fill="none"/>
    <path d="M73 60 l6 0 M73 60 l5 4 M72 61 l1 6" stroke="#efe6d0" stroke-width="1.7" stroke-linecap="round"/></g>
  <g class="spuk-kopf">
    <path d="M46 34 C44 22 54 16 62 20 L76 25 C79 29 75 33 70 33 L60 40 C54 42 48 40 46 34 Z" fill="#33291f"/>
    <path d="M49 23 L48 7 L57 19 Z M56 20 L60 6 L64 21 Z" fill="#241c17"/><path d="M51 19 L50 12 L54 18 Z" fill="#5a2a2a"/>
    <path d="M56 23 L65 24.5 L57 27 Z" fill="#120c0a"/><path class="spuk-auge spuk-auge--gelb" d="M58 23.6 L64.5 24.6 L58.6 26 Z" fill="#ffd21a"/>
    <path d="M61 30 L78 27 L75 33 L64 37 Z" fill="#2a0404"/>
    <path d="M65 29.5 l1.2 4.5 l1.2 -4.8 M70 28.6 l1.2 4.5 l1.2 -4.8 M66 36.2 l1 -3.6 l1 3.2 M71 34.6 l1 -3.2 l1 2.8" fill="#f2ead2"/>
    <circle cx="77" cy="25.6" r="1.8" fill="#0b0908"/>
    <path d="M69 35 c0 3 -1 6 0 9" stroke="#c9d3e3" stroke-width=".9" fill="none" opacity=".7"/>
    <path d="M47 30 l-5 2 l4 1 l-5 3 l5 0" fill="#33291f"/>
  </g>
</svg>`;

const MUMIE = `<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg">
  <path class="spuk-band" d="M33 52 C25 55 20 62 13 63 C8 66 5 70 0 69" stroke="#bcae86" stroke-width="3.4" fill="none" stroke-linecap="round"/>
  <path class="spuk-arm spuk-arm--2" d="M42 45 L72 50" stroke="#b5a780" stroke-width="6.5" stroke-linecap="round"/>
  <g class="spuk-bein"><path d="M36 74 L33 115" stroke="#bfb08a" stroke-width="9" stroke-linecap="round"/>
    <path d="M30 82 l8 2 M30 92 l8 2 M30 102 l8 2" stroke="#8f8160" stroke-width="1.1"/></g>
  <g class="spuk-bein spuk-bein--2"><path d="M44 74 L46 115" stroke="#cdbf98" stroke-width="9" stroke-linecap="round"/>
    <path d="M41 84 l9 -1 M41 94 l9 -1 M42 104 l9 -1" stroke="#9d8f6b" stroke-width="1.1"/></g>
  <path d="M32 40 C32 31 51 29 53 40 L55 77 L31 78 Z" fill="#cdbf98"/>
  <g stroke="#9d8f6b" stroke-width="1.2"><path d="M32 46 L54 43 M31 52 L54 50 M31 58 L55 54 M31 64 L55 62 M31 70 L55 67 M31 76 L55 73"/></g>
  <path d="M38 58 C42 56 46 60 44 64 C40 66 36 62 38 58 Z" fill="#5e4a2c" opacity=".55"/>
  <g class="spuk-arm"><path d="M47 42 L76 43" stroke="#cdbf98" stroke-width="7" stroke-linecap="round"/>
    <path d="M54 39 l2 7 M60 39 l2 7 M66 40 l2 7 M72 40 l2 6" stroke="#9d8f6b" stroke-width="1.1"/>
    <path d="M70 46 C72 52 70 56 72 60" stroke="#cdbf98" stroke-width="2" fill="none"/></g>
  <g class="spuk-kopf">
    <circle cx="50" cy="22" r="12" fill="#d6c9a4"/>
    <path d="M38 17 L62 14 M38 23 L62 20 M40 29 L60 26 M42 12 L58 10" stroke="#9d8f6b" stroke-width="1.2"/>
    <path d="M49 17.5 L62 16 L61.5 22 L50 22.5 Z" fill="#140f08"/>
    <circle class="spuk-auge spuk-auge--gruen" cx="57" cy="19.3" r="2" fill="#6cff4a"/>
    <path d="M52 27 L60 26" stroke="#140f08" stroke-width="1.6"/>
  </g>
</svg>`;

const KUERBIS = `<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg">
  <path class="spuk-arm spuk-arm--2" d="M40 46 L56 54 L68 52" stroke="#3a2a3e" stroke-width="5" stroke-linecap="round" fill="none"/>
  <g class="spuk-bein"><path d="M35 74 L32 115" stroke="#6b5434" stroke-width="5" stroke-linecap="round"/><path d="M28 117 h9" stroke="#1a120c" stroke-width="4" stroke-linecap="round"/></g>
  <g class="spuk-bein spuk-bein--2"><path d="M43 74 L46 115" stroke="#6b5434" stroke-width="5" stroke-linecap="round"/><path d="M43 117 h9" stroke="#1a120c" stroke-width="4" stroke-linecap="round"/></g>
  <path d="M28 40 C32 33 50 32 54 40 L58 84 L54 79 L51 86 L47 79 L43 87 L39 79 L35 86 L32 79 L26 84 Z" fill="#2c2030"/>
  <path d="M36 50 l6 4 l-5 4 M50 62 l-5 3 l4 3" stroke="#4a3a52" stroke-width="1.3" fill="none"/>
  <path d="M30 44 l-4 6 M28 52 l-5 4" stroke="#c9a54a" stroke-width="1.4"/>
  <g class="spuk-arm"><path d="M46 42 L64 46 L74 44" stroke="#2c2030" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M74 44 l6 -3 M74 44 l6 1 M74 44 l5 4 M74 44 l3 5" stroke="#d6b24e" stroke-width="1.3" stroke-linecap="round"/></g>
  <path d="M47 36 L49 30" stroke="#3d5a1e" stroke-width="4"/>
  <g class="spuk-kopf">
    <path d="M36 20 C34 6 46 2 51 4 C56 2 69 6 67 20 C67 33 57 37 51 36 C46 37 36 33 36 20 Z" fill="#d9661a"/>
    <path d="M51 4 C47 12 47 28 51 36 M51 4 C55 12 55 28 51 36 M43 6 C38 14 39 28 45 34 M59 6 C64 14 63 28 57 34" stroke="#9e420e" stroke-width="1.2" fill="none"/>
    <g class="spuk-flackern" fill="#ffd43a">
      <path d="M53 12 L60 19 L51 19.5 Z M42 13 L48 19 L40 19.5 Z"/>
      <path d="M39 25 L65 23.5 L62 31 L58.5 27.5 L55 32 L51.5 27.5 L48 32 L45 28 L41 30.5 Z"/>
    </g>
    <path d="M50 4 C49 -2 53 -4 57 -2" stroke="#3d5a1e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M30 6 L72 4 L66 0 L58 -1 L52 -18 L46 -2 L38 0 Z" fill="#1a1220"/><path d="M38 1 L64 0" stroke="#7a1f2e" stroke-width="2.2"/>
  </g>
</svg>`;

const KREATUREN = [
  () => ZOMBIE(),
  () => ZOMBIE("#9aa088", "#7b806a", "#3a3f52"),
  () => ZOMBIE("#a3a98d", "#80866c", "#5a2626"),
  () => SKELETT,
  () => WERWOLF,
  () => MUMIE,
  () => KUERBIS,
];

// Der Sarg auf Rädern, Deichsel nach rechts (viewBox 0 -24 215 174,
// Räder unten bei y 146). Gruppen mit Klassen, damit die Räder drehen,
// der Wagen rumpelt und der Deckel sich hebt.
const SARG = `<svg viewBox="0 -24 215 174" xmlns="http://www.w3.org/2000/svg">
  <g class="spuk-sarg__wagen">
    <path d="M185 112 L209 104" stroke="#1d1612" stroke-width="5" stroke-linecap="round"/>
    <circle cx="209" cy="104" r="4.5" fill="none" stroke="#6b6b70" stroke-width="2.5"/>
    <rect x="12" y="104" width="176" height="12" rx="1" fill="#241a14"/>
    <path d="M12 110 H188" stroke="#3a2a20" stroke-width="1.2"/>
    <path d="M14 78 L38 50 L168 52 L190 76 L168 102 L38 104 Z" fill="#2a1b13" stroke="#0e0906" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M24 78 L42 58 L164 60 L180 76 L164 94 L42 96 Z" fill="none" stroke="#4a3122" stroke-width="1.6"/>
    <g class="spuk-sarg__gucker">
      <rect x="88" y="44" width="54" height="12" fill="#050302"/>
      <circle class="spuk-auge" cx="104" cy="50" r="2.4" fill="#ff2410"/><circle class="spuk-auge" cx="113" cy="50" r="2.4" fill="#ff2410"/>
      <circle class="spuk-auge" cx="128" cy="50.5" r="1.6" fill="#ff2410"/><circle class="spuk-auge" cx="134" cy="50.5" r="1.6" fill="#ff2410"/>
    </g>
    <g class="spuk-sarg__deckel">
      <path d="M12 54 L36 26 L168 36 L190 62 L168 66 L38 58 Z" fill="#3a2619" stroke="#0e0906" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M92 34 V54 M82 42 H104" stroke="#b9ad8a" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="30" cy="40" r="1.6" fill="#8a7a5a"/><circle cx="176" cy="54" r="1.6" fill="#8a7a5a"/>
      <g class="spuk-rabe">
        <path d="M138 34 C136 22 146 16 154 20 C160 22 160 30 156 34 L170 40 L154 38 C148 40 140 40 138 34 Z" fill="#0b0b10"/>
        <path d="M152 22 C154 16 160 16 162 20 L168 22 L161 24 C158 26 154 26 152 22 Z" fill="#0b0b10"/>
        <circle class="spuk-auge" cx="159" cy="20.5" r="1.2" fill="#ff2a14"/><path d="M167 21 L174 22.5 L167 24 Z" fill="#2a2a30"/>
        <path d="M146 37 l-2 5 M150 37 l1 5" stroke="#55555c" stroke-width="1.4"/>
      </g>
    </g>
    <g class="spuk-sarg__hand">
      <path d="M140 60 C146 62 150 70 150 80" stroke="#e3dcc7" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M150 80 l-3 7 M150 80 l0 8 M150 80 l3 7 M150 80 l5 4" stroke="#e3dcc7" stroke-width="1.5" stroke-linecap="round"/>
    </g>
    <path d="M40 104 L36 116 M170 104 L174 116" stroke="#1d1612" stroke-width="4"/>
    <path d="M30 100 C26 108 28 112 24 116 M64 102 C62 108 63 111 61 114" stroke="#7a0b0b" stroke-width="2" fill="none" stroke-linecap="round"/>
  </g>
  <g class="spuk-sarg__rad"><circle cx="48" cy="130" r="16" fill="#1c1a1a"/><circle cx="48" cy="130" r="11" fill="#4d4642"/>
    <path d="M48 119 V141 M37 130 H59 M40 122 L56 138 M56 122 L40 138" stroke="#1c1a1a" stroke-width="2.4"/><circle cx="48" cy="130" r="3" fill="#7a3a1a"/></g>
  <g class="spuk-sarg__rad"><circle cx="152" cy="130" r="16" fill="#1c1a1a"/><circle cx="152" cy="130" r="11" fill="#4d4642"/>
    <path d="M152 119 V141 M141 130 H163 M144 122 L160 138 M160 122 L144 138" stroke="#1c1a1a" stroke-width="2.4"/><circle cx="152" cy="130" r="3" fill="#7a3a1a"/></g>
</svg>`;

// Ein halber Zombie kriecht hinterher (viewBox 0 0 70 34, Blick nach rechts)
const KRIECHER = `<svg viewBox="0 0 70 34" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 30 C6 26 10 30 14 27 C18 30 22 26 24 29" stroke="#6a0a0a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M8 22 C10 14 30 12 40 18 L42 30 L10 31 Z" fill="#3e3a32"/>
  <path d="M8 24 l-4 2 l4 2 l-4 3" stroke="#b9b1a0" stroke-width="1.5" fill="none"/>
  <path class="spuk-arm" d="M38 22 L52 30 L62 30" stroke="#7d9a6a" stroke-width="4.5" stroke-linecap="round" fill="none"/>
  <path class="spuk-arm spuk-arm--2" d="M34 20 L48 14 L60 24" stroke="#6f8a5e" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M40 8 C40 0 54 -2 58 6 C61 12 56 20 48 20 C42 20 40 14 40 8 Z" fill="#8aa676"/>
  <circle cx="52" cy="9" r="2.6" fill="#120c0a"/><circle class="spuk-auge" cx="52.5" cy="9" r="1.3" fill="#ff2a14"/>
  <path d="M50 14 C53 13 58 13 58 15 C57 19 52 19 50 16 Z" fill="#1e0404"/>
</svg>`;

// Ein Geist schwebt über der Horde (viewBox 0 0 70 90, Blick nach rechts)
const GEIST = `<svg viewBox="0 0 70 90" xmlns="http://www.w3.org/2000/svg">
  <path class="spuk-geist__tuch" d="M14 40 C12 14 26 2 40 2 C56 2 66 16 64 40 L66 84 L58 76 L50 88 L42 78 L34 88 L26 76 L18 86 L12 72 Z" fill="rgba(226,236,240,.82)"/>
  <path d="M22 44 C10 48 4 42 0 34 M60 44 C70 50 72 44 70 36" stroke="rgba(226,236,240,.7)" stroke-width="6" stroke-linecap="round" fill="none"/>
  <ellipse cx="40" cy="26" rx="5.5" ry="8" fill="#0a0c12"/><ellipse cx="55" cy="25" rx="4.5" ry="7" fill="#0a0c12"/>
  <circle class="spuk-auge spuk-auge--blau" cx="41" cy="27" r="1.3" fill="#9fe8ff"/><circle class="spuk-auge spuk-auge--blau" cx="55.5" cy="26" r="1.1" fill="#9fe8ff"/>
  <path class="spuk-geist__mund" d="M42 40 C42 36 54 36 54 40 L52 58 C50 62 46 62 44 58 Z" fill="#0a0c12"/>
</svg>`;

// Fledermaus (viewBox 0 0 60 30)
const FLEDERMAUS = `<svg viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg">
  <g class="spuk-fledermaus__fluegel" fill="#0d0b12">
    <path d="M30 14 C24 4 14 2 2 6 C8 8 9 12 6 16 C12 14 14 18 13 22 C18 18 24 18 30 18 Z"/>
    <path d="M30 14 C36 4 46 2 58 6 C52 8 51 12 54 16 C48 14 46 18 47 22 C42 18 36 18 30 18 Z"/>
  </g>
  <path d="M26 12 L27 6 L29.5 10 L30.5 10 L33 6 L34 12 C35 20 25 20 26 12 Z" fill="#0d0b12"/>
  <circle class="spuk-auge" cx="28.4" cy="12.6" r=".9" fill="#ff3a1a"/><circle class="spuk-auge" cx="31.6" cy="12.6" r=".9" fill="#ff3a1a"/>
</svg>`;

// Eine Hand greift aus der Erde (viewBox 0 0 30 50)
const HAND = `<svg viewBox="0 0 30 50" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 50 L11 26 L18 26 L19 50 Z" fill="#6f8a5e"/>
  <path d="M8 28 C6 20 10 16 14 16 C20 16 23 20 22 28 Z" fill="#7d9a6a"/>
  <g stroke="#7d9a6a" stroke-width="3" stroke-linecap="round" fill="none">
    <path d="M9 19 L5 8 L6 3"/><path d="M12 17 L11 4 L13 0"/><path d="M16 17 L18 4 L21 1"/><path d="M20 20 L25 10 L28 8"/><path d="M8 24 L2 20"/>
  </g>
  <path d="M11 34 l3 2 l-1 3" stroke="#4a0a0a" stroke-width="1.4" fill="none"/>
  <path d="M10 38 l9 0" stroke="#3e3a32" stroke-width="4"/>
</svg>`;

// Grabsteine (viewBox 0 0 40 50, Fuss bei y 50)
const GRABSTEINE = [
  `<svg viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg"><path d="M6 50 V18 C6 4 34 4 34 18 V50 Z" fill="#4a4c52" stroke="#2a2b30" stroke-width="1.5"/>
   <text x="20" y="26" font-size="8" font-family="serif" text-anchor="middle" fill="#2a2b30">R.I.P.</text><path d="M12 34 h16 M14 39 h12" stroke="#2a2b30" stroke-width="1.2"/>
   <path d="M30 12 l-4 8 l3 4" stroke="#2a2b30" stroke-width="1" fill="none"/></svg>`,
  `<svg viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(-9 20 50)"><path d="M17 50 V22 H8 V15 H17 V5 H23 V15 H32 V22 H23 V50 Z" fill="#3d3f45" stroke="#222327" stroke-width="1.5"/></g></svg>`,
  `<svg viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(7 20 50)"><path d="M8 50 V14 L14 6 H26 L32 14 V50 Z" fill="#55575c" stroke="#2c2d31" stroke-width="1.5"/>
   <path d="M14 20 h12 M14 26 h12 M16 32 h8" stroke="#2c2d31" stroke-width="1.2"/><path d="M10 40 l6 -6 l2 5" stroke="#2c2d31" stroke-width="1" fill="none"/></g></svg>`,
];

// Totes Gras am oberen Rand der Erde
const GRAS = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='80' height='16' viewBox='0 0 80 16'>" +
  "<path d='M0 16 L3 8 L4 16 L7 3 L9 16 L12 9 L14 16 L18 5 L19 16 L24 10 L25 16 L28 2 L31 16 L35 8 L36 16 L40 4 " +
  "L42 16 L46 9 L48 16 L51 1 L53 16 L57 7 L59 16 L63 3 L64 16 L68 9 L70 16 L74 4 L76 16 L80 8 L80 16 Z' fill='#1f2416'/></svg>")}")`;

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

    // Unten ein dunkler Schein, darauf die Erde mit totem Gras,
    // Grabsteinen und ziehendem Nebel
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
      ], { duration: zufall(2600, 3800), easing: "ease-in", fill: "forwards" }));
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
      let naechsterDreck = 0, naechsterDunst = 0, naechstesBlut = performance.now() + zufall(600, 1800);
      const nebenbei = async () => {
        while (!aus && zug.isConnected) {
          await warte(90);
          if (aus || !zug.isConnected) return;
          const jetzt = performance.now();
          if (jetzt > naechsterDreck) {
            raeder.forEach((r) => { const bx = imBand(r); if (bx > -20 && bx < breit + 20) dreck(bx + zufall(-4, 4), boden - 2, H * zufall(.14, .22)); });
            naechsterDreck = jetzt + zufall(180, 360);
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
            naechstesBlut = jetzt + zufall(700, 2000);
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
