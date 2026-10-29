// =================================================================
//  ÄHNLICHE TREFFER (seit 1.255.0, Wunsch Patrick 29. Oktober 2026:
//  „manchmal findet es den Art. nicht, weil es ähnlich heisst, aber
//  nicht genau so“)
//  Die Datenbank findet nur, was genau so drinsteht. Hier wird
//  verglichen ohne Gross/klein, Leerzeichen, Bindestriche, Punkte
//  und Schrägstriche („UHM10 TX+“ = „UHM10TX+“ = „uhm-10-tx“), und
//  jedes Wort darf ein, ab 8 Zeichen zwei Tippfehler haben
//  (Buchstabe falsch, zu viel, zu wenig oder zwei vertauscht).
// =================================================================

export function normal(text) {
  return String(text == null ? "" : text).toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ø/g, "o")
    .replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
}

// Kleinste Zahl Tippfehler, mit der das Wort irgendwo im Text steht
// (Teilstück, nicht der ganze Text). Vertauschte Nachbarn zählen als einer.
function abstandImText(wort, text, grenze) {
  const m = wort.length, n = text.length;
  if (!m) return 0;
  if (text.includes(wort)) return 0;
  let vorvor = null;
  let vor = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const jetzt = new Array(n + 1);
    jetzt[0] = i;
    let kleinste = i;
    for (let j = 1; j <= n; j++) {
      const kosten = wort[i - 1] === text[j - 1] ? 0 : 1;
      let d = Math.min(vor[j] + 1, jetzt[j - 1] + 1, vor[j - 1] + kosten);
      if (vorvor && i > 1 && j > 1 && wort[i - 1] === text[j - 2] && wort[i - 2] === text[j - 1])
        d = Math.min(d, vorvor[j - 2] + 1);
      jetzt[j] = d;
      if (d < kleinste) kleinste = d;
    }
    // Schon zu weit weg: nicht weiterrechnen
    if (kleinste > grenze) return grenze + 1;
    vorvor = vor; vor = jetzt;
  }
  let best = m;
  for (let j = 0; j <= n; j++) if (vor[j] < best) best = vor[j];
  return best;
}

function erlaubt(laenge) {
  if (laenge < 4) return 0;
  return laenge >= 8 ? 2 : 1;
}

// Wert: 0 = passt ohne Tippfehler, höher = weiter weg, null = passt nicht.
// Ganze Suche zusammen oder jedes Wort für sich muss in einem der Felder stehen.
export function aehnlichWert(suche, felder) {
  const texte = felder.map(normal).filter(Boolean);
  if (!texte.length) return null;
  const ganz = normal(suche);
  if (!ganz) return null;
  const alles = texte.join(" ");
  const bester = (wort) => {
    const g = erlaubt(wort.length);
    let b = g + 1;
    for (const t of texte) {
      b = Math.min(b, abstandImText(wort, t, g));
      if (!b) break;
    }
    return b <= g ? b : null;
  };
  // „UHM10TX+“ gegen „UHM10 TX+“: am Stück verglichen
  const amStueck = bester(ganz);
  const woerter = String(suche).split(/[\s,]+/).map(normal).filter(Boolean);
  let jeWort = null;
  if (woerter.length > 1) {
    jeWort = 0;
    for (const w of woerter) {
      const d = alles.includes(w) ? 0 : bester(w);
      if (d == null) { jeWort = null; break; }
      jeWort += d;
    }
  }
  if (amStueck == null) return jeWort;
  if (jeWort == null) return amStueck;
  return Math.min(amStueck, jeWort);
}

// Ähnliche aus einer Liste, die nicht schon unter den genauen Treffern sind,
// die nächsten zuerst. Jeder bekommt aehnlich: true.
export function aehnlicheTreffer(suche, liste, felderVon, schon, hoechstens) {
  const da = new Set((schon || []).map((a) => a.id));
  const gefunden = [];
  for (const a of liste || []) {
    if (da.has(a.id)) continue;
    const w = aehnlichWert(suche, felderVon(a));
    if (w != null) gefunden.push({ a, w });
  }
  gefunden.sort((x, y) => x.w - y.w);
  return gefunden.slice(0, hoechstens || 20).map((g) => ({ ...g.a, aehnlich: true }));
}
