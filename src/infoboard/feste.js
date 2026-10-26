// =================================================================
//  INFOBOARD: VERKLEIDUNG DER HÜHNER JE JAHRESZEIT UND FEST
//  Wunsch Patrick 25. Oktober 2026: „mach es automatisch, dass es für
//  jede Zeit im Jahr, also Ostern und so, auch es anpasst“. Der
//  Bildschirmschoner (Nacht.jsx) fragt vor jedem Flug, welches Fest
//  gerade ist, darum wechselt er um Mitternacht von selbst.
//
//  Feste gehen vor der Jahreszeit. Ostern und Fasnacht hängen am
//  Osterdatum, das jedes Jahr ausgerechnet wird. Fasnacht nach
//  Solothurner Art: vom Schmutzigen Donnerstag bis Aschermittwoch.
// =================================================================

// Ostersonntag nach der Gaussschen Osterformel (Meeus), gilt 1583–4099
export function ostersonntag(jahr) {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(jahr, monat - 1, tag);
}

// Tage seit Ostersonntag (negativ davor), in Ortszeit gezählt
function tageZuOstern(d) {
  const heute = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((heute - ostersonntag(d.getFullYear())) / 86400000);
}

// Liegt der Tag zwischen zwei Daten [Monat, Tag] (beide eingeschlossen)?
function zwischen(d, [m1, t1], [m2, t2]) {
  const x = (d.getMonth() + 1) * 100 + d.getDate();
  const von = m1 * 100 + t1, bis = m2 * 100 + t2;
  return von <= bis ? x >= von && x <= bis : x >= von || x <= bis;
}

// ---------- Was die Hühner tragen (im Raster des Huhns 124 × 100) ----------
// Kopf um (72, 28) mit Radius 12, Kamm oben bei y 9–20, Schnabel 82–96.
export const ZUSATZ = {
  // Weihnachten: Zipfelmütze, die nach hinten fällt
  samichlaus: {
    vorne: `<path d="M60 19 L86 17 C84 7 74 1 61 3 C54 4 49 8 46 13 C53 10 58 12 60 19 Z" fill="#d62828"/>
      <rect x="58" y="15" width="30" height="6" rx="3" fill="#f7f4ee" transform="rotate(-4 73 18)"/>
      <circle cx="45.5" cy="14" r="4.2" fill="#f7f4ee"/>`,
  },
  // Silvester: spitzer Partyhut mit Streifen
  partyhut: {
    vorne: `<path d="M63 18 L83 16 L71 -9 Z" fill="#f2c230"/>
      <path d="M66.5 11 L80 10 M69 4 L77.5 3.5" stroke="#1e3a8a" stroke-width="2.6"/>
      <circle cx="71" cy="-10" r="3.6" fill="#e63946"/>`,
  },
  // Fasnacht: bunte Larve über den Augen und ein Hütchen
  fasnacht: {
    vorne: `<path d="M64 17 L80 15.5 L73 -4 Z" fill="#2a9d8f"/>
      <path d="M67 10 L78 9.2" stroke="#f4a261" stroke-width="2.4"/>
      <circle cx="73" cy="-5" r="3" fill="#e76f51"/>
      <path d="M65 23 C70 19 81 19 85 23 C84 29 80 31 76 29 L75 27.5 L74 29 C70 31 66 29 65 23 Z" fill="#7b2cbf" stroke="#f2c230" stroke-width="1"/>
      <circle cx="75" cy="25.5" r="2.4" fill="#111"/><circle cx="75.8" cy="24.7" r=".8" fill="#fff"/>`,
  },
  // Valentinstag: Herz im Schnabel und rote Bäckchen
  herz: {
    vorne: `<circle cx="70" cy="33" r="3" fill="#f4a3b5" opacity=".9"/>
      <path d="M102 38 C93 31 94 23 99.5 24 C101 24.3 102 26 102 27.5 C102 26 103 24.3 104.5 24 C110 23 111 31 102 38 Z" fill="#e63946"/>`,
  },
  // Ostern: Hasenohren und ein bemaltes Ei in den Krallen
  ostern: {
    vorne: `<ellipse cx="65" cy="3" rx="4.6" ry="13" transform="rotate(-16 65 3)" fill="#f4f1ea" stroke="#d9d3c5"/>
      <ellipse cx="65" cy="4" rx="2" ry="9" transform="rotate(-16 65 4)" fill="#f5b5c8"/>
      <ellipse cx="78" cy="2" rx="4.6" ry="13" transform="rotate(12 78 2)" fill="#f4f1ea" stroke="#d9d3c5"/>
      <ellipse cx="78" cy="3" rx="2" ry="9" transform="rotate(12 78 3)" fill="#f5b5c8"/>
      <ellipse cx="44" cy="92" rx="7" ry="9" fill="#8ecae6"/>
      <path d="M37.5 90 L40.5 87.5 L43.5 90 L46.5 87.5 L50 90" stroke="#ffb703" stroke-width="1.8" fill="none"/>
      <path d="M37.5 95 L40.5 92.5 L43.5 95 L46.5 92.5 L50 95" stroke="#fb8500" stroke-width="1.8" fill="none"/>`,
  },
  // 1. August: Schweizerfahne auf dem Rücken
  augustfahne: {
    hinten: `<path d="M31 4 L34 54" stroke="#8a6a3a" stroke-width="2"/>
      <rect x="31" y="4" width="19" height="19" fill="#d52b1e"/>
      <rect x="38.7" y="7.5" width="3.6" height="12" fill="#fff"/>
      <rect x="34.5" y="11.7" width="12" height="3.6" fill="#fff"/>`,
  },
  // Frühling: Blume am Kamm
  blume: {
    vorne: `<g fill="#f7a8c8"><circle cx="61" cy="12" r="3.4"/><circle cx="65.2" cy="15" r="3.4"/><circle cx="63.6" cy="20" r="3.4"/><circle cx="58.4" cy="20" r="3.4"/><circle cx="56.8" cy="15" r="3.4"/></g>
      <circle cx="61" cy="16.4" r="2.6" fill="#ffd166"/>`,
  },
  // Sommer: Sonnenbrille
  sonnenbrille: {
    vorne: `<path d="M67 22 L85 21.5 L84 28 C81 31 77.5 30.5 76.5 27.5 L75.5 25 L74.5 27.5 C73 30.5 69.5 31 68 28.5 Z" fill="#111"/>
      <path d="M67 22.5 L57 24" stroke="#111" stroke-width="1.6"/>
      <path d="M78.5 23.5 L82 23.3" stroke="#6fd3ff" stroke-width="1.2" stroke-linecap="round"/>`,
  },
  // Herbst: Schal
  schal: {
    vorne: `<path d="M57 40 C63 47 74 47 81 40 L82 46 C75 53 63 53 56 46 Z" fill="#c8551b"/>
      <path d="M61 47 L56 64 L62.5 64 L66.5 49 Z" fill="#a8431a"/>
      <path d="M56.5 61 L63 61" stroke="#f2b233" stroke-width="1.4"/>`,
  },
  // Halloween am Tag (Umzug im Band oben, 1.211.0): Hexenhut statt der
  // düsteren Nachthühner, die im hellen Band zu finster wirken
  hexenhut: {
    vorne: `<path d="M58 19 L88 16 C82 13 78 11 76 6 C74 1 70 -6 62 -9 C66 -3 67 4 66 15 Z" fill="#2b2233"/>
      <path d="M55 20 C62 15 82 13 92 16 C84 20 64 22 55 20 Z" fill="#2b2233"/>
      <path d="M62 17 L84 15" stroke="#f28c28" stroke-width="2.4"/>`,
  },
  // Winter: Wollmütze und Schal
  wollmuetze: {
    vorne: `<path d="M59 20 C59 6 83 2 87 18 Z" fill="#2a6fdb"/>
      <rect x="57" y="15.5" width="31" height="6" rx="3" fill="#dfe8f7" transform="rotate(-4 72 18)"/>
      <circle cx="73" cy="5" r="4.6" fill="#f7f4ee"/>
      <path d="M57 40 C63 47 74 47 81 40 L82 46 C75 53 63 53 56 46 Z" fill="#2a6fdb"/>
      <path d="M61 47 L56 64 L62.5 64 L66.5 49 Z" fill="#1f56ae"/>`,
  },
};

// Das weisse Huhn aus 1.179.0, mit Platz für das Zubehör davor und dahinter
export function weissesHuhn(zusatz = {}) {
  return `<svg viewBox="0 0 124 100" xmlns="http://www.w3.org/2000/svg">
  ${zusatz.hinten || ""}
  <g fill="#f4f1ea">
    <path d="M22 50 L5 24 L15 33 L11 15 L23 32 L24 17 L31 38 Z"/>
    <ellipse cx="46" cy="54" rx="30" ry="21"/>
    <ellipse cx="67" cy="40" rx="11" ry="15"/>
    <circle cx="72" cy="28" r="12"/>
  </g>
  <g fill="#e2463b">
    <circle cx="67" cy="15" r="4.5"/><circle cx="73.5" cy="13.5" r="4.5"/><circle cx="79.5" cy="16.5" r="4"/>
    <ellipse cx="80" cy="40" rx="3.2" ry="5.5"/>
  </g>
  <path d="M82 25 L96 30 L82 35 Z" fill="#f2b233"/>
  <circle cx="75" cy="26" r="2.6" fill="#111"/>
  <g stroke="#f2b233" stroke-width="3" stroke-linecap="round" fill="none">
    <path class="huhn-bein" d="M40 72 L36 84 M36 84 L30 86 M36 84 L40 87"/>
    <path class="huhn-bein huhn-bein--2" d="M52 72 L50 84 M50 84 L44 86 M50 84 L54 87"/>
  </g>
  ${zusatz.vorne || ""}
  <g class="ib-huhn__fluegel"><path d="M30 50 C38 20 62 18 66 46 C56 60 40 62 30 50 Z" fill="#d9d3c5"/></g>
</svg>`;
}

// ---------- Was vom Himmel fällt ----------
// Jede Art liefert Inhalt und Grösse; die Farbe kommt zufällig aus der
// Liste des Festes.
const TEILCHEN = {
  feder: (f, g) => ({ w: g * 0.4, h: g, html: "",
    stil: `border-radius:50% 50% 45% 45% / 70% 70% 30% 30%;background:linear-gradient(180deg,${f},rgba(0,0,0,.25))` }),
  schnee: (f, g) => ({ w: g, h: g, html: `<svg viewBox="-10 -10 20 20"><g stroke="${f}" stroke-width="1.6" stroke-linecap="round"><path d="M0-9V9M-7.8-4.5L7.8 4.5M-7.8 4.5L7.8-4.5"/><path d="M-2.5-7L0-4.5L2.5-7M-2.5 7L0 4.5L2.5 7"/></g></svg>` }),
  ei: (f, g) => ({ w: g * 0.75, h: g, html: `<svg viewBox="0 0 20 26"><ellipse cx="10" cy="14" rx="9" ry="11.5" fill="${f}"/><path d="M1.5 12 L5 9.5 L8.5 12 L12 9.5 L15.5 12 L18.5 10" stroke="#fff" stroke-width="1.8" fill="none" opacity=".85"/></svg>` }),
  konfetti: (f, g) => ({ w: g * 0.45, h: g * 0.8, html: "", stil: `background:${f};border-radius:1px` }),
  blatt: (f, g) => ({ w: g * 0.8, h: g, html: `<svg viewBox="0 0 20 24"><path d="M10 1 C18 6 19 16 10 23 C1 16 2 6 10 1 Z" fill="${f}"/><path d="M10 3 V23" stroke="rgba(0,0,0,.3)" stroke-width="1"/></svg>` }),
  bluete: (f, g) => ({ w: g, h: g, html: `<svg viewBox="-10 -10 20 20"><g fill="${f}"><circle cx="0" cy="-5" r="4"/><circle cx="4.8" cy="-1.5" r="4"/><circle cx="3" cy="4" r="4"/><circle cx="-3" cy="4" r="4"/><circle cx="-4.8" cy="-1.5" r="4"/></g><circle r="2.4" fill="#ffd166"/></svg>` }),
  herz: (f, g) => ({ w: g, h: g, html: `<svg viewBox="0 0 20 18"><path d="M10 17 C1 10 1 2 6 1.5 C8 1.3 9.5 3 10 4.5 C10.5 3 12 1.3 14 1.5 C19 2 19 10 10 17 Z" fill="${f}"/></svg>` }),
  funke: (f, g) => ({ w: g * 0.6, h: g * 0.6, html: `<svg viewBox="-10 -10 20 20"><path d="M0-10L2.4-2.4L10 0L2.4 2.4L0 10L-2.4 2.4L-10 0L-2.4-2.4Z" fill="${f}"/></svg>`,
    stil: `filter:drop-shadow(0 0 4px ${f})` }),
};

export function teilchen(art, farbe, groesse) {
  return (TEILCHEN[art] || TEILCHEN.feder)(farbe, groesse);
}

// ---------- Die Feste ----------
// name: Kennung (data-fest), huhn: SVG, faellt: Art und Farben der Teilchen,
// die das Huhn verliert, regen: was dazu von oben fällt (oder nichts),
// himmel: Hintergrund, leuchten: Schein um die Hühner.
const WEISS_LEUCHTEN = "drop-shadow(0 0 10px rgba(255,255,255,.14))";
const fest = (name, zusatz, faellt, farben, extra = {}) => ({
  name, huhn: weissesHuhn(ZUSATZ[zusatz]), faellt, farben,
  regen: null, leuchten: WEISS_LEUCHTEN, himmel: "#000", ...extra,
});

export function festFuer(d = new Date()) {
  const ostern = tageZuOstern(d);

  if (zwischen(d, [12, 31], [1, 2])) return fest("silvester", "partyhut", "konfetti",
    ["#f2c230", "#e63946", "#4cc9f0", "#80ed99", "#f72585", "#ffffff"], {
      regen: "funke",
      himmel: "radial-gradient(90% 35% at 50% -5%, rgba(242,194,48,.16), transparent 70%), #000",
    });
  if (zwischen(d, [12, 1], [12, 30])) return fest("weihnachten", "samichlaus", "schnee",
    ["#ffffff", "#dfe8f7", "#cfe3ff"], {
      regen: "schnee",
      himmel: "radial-gradient(120% 40% at 50% 105%, rgba(214,40,40,.16), transparent 70%), radial-gradient(90% 30% at 50% -5%, rgba(120,170,255,.12), transparent 70%), #000",
    });
  if (ostern >= -52 && ostern <= -46) return fest("fasnacht", "fasnacht", "konfetti",
    ["#e63946", "#f2c230", "#2a9d8f", "#7b2cbf", "#4cc9f0", "#f4a261"], {
      regen: "konfetti",
      himmel: "radial-gradient(120% 40% at 50% 105%, rgba(123,44,191,.18), transparent 70%), #000",
    });
  if (zwischen(d, [2, 13], [2, 14])) return fest("valentinstag", "herz", "herz",
    ["#e63946", "#f4a3b5", "#ff6b8b"], {
      regen: "herz",
      himmel: "radial-gradient(120% 40% at 50% 105%, rgba(230,57,70,.18), transparent 70%), #000",
    });
  if (ostern >= -7 && ostern <= 1) return fest("ostern", "ostern", "ei",
    ["#8ecae6", "#ffb703", "#f5b5c8", "#b5e48c", "#cdb4db", "#fb8500"], {
      regen: "bluete",
      himmel: "radial-gradient(120% 40% at 50% 105%, rgba(181,228,140,.16), transparent 70%), #000",
    });
  if (zwischen(d, [7, 28], [8, 1])) return fest("august", "augustfahne", "funke",
    ["#d52b1e", "#ffffff", "#ffb703"], {
      regen: "funke",
      himmel: "radial-gradient(120% 40% at 50% 105%, rgba(213,43,30,.2), transparent 70%), #000",
    });
  if (zwischen(d, [10, 17], [11, 2])) return {
    name: "halloween", huhn: null, faellt: "feder", farben: ["#4a3d52", "#2c2433"],
    regen: null,
    leuchten: "drop-shadow(0 0 6px rgba(150,60,190,.55)) drop-shadow(0 0 18px rgba(255,90,20,.22))",
    himmel: "radial-gradient(120% 40% at 50% 105%, rgba(255,110,20,.14), transparent 70%), #000",
  };

  // Sonst die Jahreszeit
  if (zwischen(d, [3, 21], [6, 20])) return fest("fruehling", "blume", "bluete",
    ["#f7a8c8", "#ffffff", "#ffc8dd", "#cdb4db"], {
      regen: "bluete",
      himmel: "radial-gradient(120% 40% at 50% 105%, rgba(247,168,200,.14), transparent 70%), #000",
    });
  if (zwischen(d, [6, 21], [9, 22])) return fest("sommer", "sonnenbrille", "feder",
    ["#f4f1ea"], {
      regen: "funke",
      himmel: "radial-gradient(90% 35% at 50% -5%, rgba(255,183,3,.18), transparent 70%), #000",
    });
  if (zwischen(d, [9, 23], [11, 30])) return fest("herbst", "schal", "blatt",
    ["#c8551b", "#e9a23b", "#a8431a", "#d4a017", "#8c3b1a"], {
      regen: "blatt",
      himmel: "radial-gradient(120% 40% at 50% 105%, rgba(200,85,27,.16), transparent 70%), #000",
    });
  return fest("winter", "wollmuetze", "schnee", ["#ffffff", "#dfe8f7"], {
    regen: "schnee",
    himmel: "radial-gradient(90% 30% at 50% -5%, rgba(120,170,255,.12), transparent 70%), #000",
  });
}
