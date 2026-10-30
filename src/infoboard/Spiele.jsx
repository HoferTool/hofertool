// =================================================================
//  SPIELE IM PAUSENRAUM
//  Wunsch Patrick 30. Oktober 2026: „kannst du auch 2–3 Spiele auf den
//  Bildschirm packen, es ist ein Touchscreen“, dazu „eine Liste zur
//  Auswahl wäre auch gut“. Eine Kachel mit Inhalt „Spiel“ öffnet entweder
//  ein Spiel direkt oder die Liste aller Spiele.
//
//  Eigene Spiele, keine Nachbauten bekannter Spiele, seit 1.293.0 mit
//  Hofer + Co Charakter (Wunsch Patrick: „sollen einen Hofer + Co
//  Charakter haben“, Themen von hoferco.ch: Präzisionsdrehteile ab
//  Stange, Star, Index, Willemin, Prüfmittel). Der Bösewicht überall ist
//  das Spänemonster, ein Knäuel aus Fliessspänen.
//  - Tic Tac Toe: Schraube gegen Zahnrad, zu zweit oder gegen den Computer
//  - Materiallager: Werkstoff-Klötze in den Farben der Planwand fallen
//  - Hallenrunde: Drehteile zwischen den Maschinen einsammeln
//  - Ausschuss-Jagd: auf den Förderbändern die schlechten Teile antippen
//    („und noch Moorhuhn“, Patrick)
//  - Späneschleuder: mit Drehteilen die Spänemonster von den Material-
//    kisten schiessen („und Angry Birds“, Patrick)
//  Die Kennungen (kloetzli, huehnerhof …) bleiben, weil Kacheln und
//  Rekorde sie gespeichert haben.
//  Alles mit grossen Knöpfen für den Finger; Rekorde je Gerät im
//  localStorage (darf fehlen, dann eben ohne Rekord).
// =================================================================
import { useCallback, useEffect, useRef, useState } from "react";

export const SPIELE = [
  { id: "dreigewinnt", name: "Tic Tac Toe", zeichen: "🔩", text: "Schraube gegen Zahnrad. Zu zweit oder gegen den Computer." },
  { id: "kloetzli", name: "Materiallager", zeichen: "📦", text: "V2A, Messing, Alu … fallen ins Lager. Volle Reihen gehen in die Produktion." },
  { id: "huehnerhof", name: "Hallenrunde", zeichen: "🏭", text: "Sammle die Drehteile zwischen den Maschinen ein. Achtung, Spänemonster!" },
  { id: "flatterhuhn", name: "Ausschuss-Jagd", zeichen: "🔍", text: "Tipp auf den Förderbändern die schlechten Teile an. 90 Sekunden." },
  { id: "eierschleuder", name: "Späneschleuder", zeichen: "🎯", text: "Mit Drehteilen die Spänemonster von den Materialkisten schiessen." },
];
export const spielName = (id) => id === "alle" || !id ? "Alle Spiele zur Auswahl"
  : (SPIELE.find((s) => s.id === id) || {}).name || "Spiel";

function rekordLesen(id) {
  try { return Number(localStorage.getItem("hofer.pausenraum.rekord." + id)) || 0; } catch { return 0; }
}
function rekordMerken(id, punkte) {
  const alt0 = rekordLesen(id);
  if (punkte <= alt0) return false;
  try { localStorage.setItem("hofer.pausenraum.rekord." + id, String(punkte)); } catch { /* ohne Speicher */ }
  return true;
}

// Knopf, der schon beim Berühren reagiert (onClick kommt am Touchscreen
// spürbar später und fällt bei schnellem Tippen aus).
function Taste({ children, los, className = "", ...rest }) {
  return (
    <button type="button" className={"sp-taste " + className} {...rest}
      onPointerDown={(e) => { e.preventDefault(); los(); }}>{children}</button>
  );
}

// Pfeiltasten am PC, zum Ausprobieren
function usePfeile(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const t = (e) => {
      const r = { ArrowLeft: "links", ArrowRight: "rechts", ArrowUp: "hoch", ArrowDown: "runter", " ": "fallen" }[e.key];
      if (r && ref.current(r) !== false) e.preventDefault();
    };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, []);
}

// Wischen auf einer Fläche in eine Richtung
function wischen(fn) {
  let start = null;
  return {
    onPointerDown: (e) => { start = { x: e.clientX, y: e.clientY }; },
    onPointerUp: (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
      fn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "rechts" : "links") : (dy > 0 ? "runter" : "hoch"));
    },
  };
}

export function Spiele({ spiel, breite, hoehe }) {
  const [gewaehlt, setGewaehlt] = useState(spiel && spiel !== "alle" ? spiel : null);
  const liste = !spiel || spiel === "alle";
  if (!gewaehlt) {
    return (
      <div className="sp-liste" data-sp="liste" style={{ width: breite, height: hoehe }}>
        {SPIELE.map((s) => (
          <button type="button" key={s.id} className="sp-karte" data-sp={"wahl-" + s.id} onClick={() => setGewaehlt(s.id)}>
            <span className="sp-karte__zeichen">{s.zeichen}</span>
            <span className="sp-karte__name">{s.name}</span>
            <span className="sp-karte__text">{s.text}</span>
            <span className="sp-karte__los">Spielen</span>
          </button>
        ))}
      </div>
    );
  }
  const h = liste ? hoehe - 90 : hoehe;
  return (
    <div className="sp-rahmen" style={{ width: breite, height: hoehe }}>
      {liste && <button type="button" className="sp-zurueck" data-sp="zurueck" onClick={() => setGewaehlt(null)}>← Alle Spiele</button>}
      {gewaehlt === "dreigewinnt" && <DreiGewinnt breite={breite} hoehe={h} />}
      {gewaehlt === "kloetzli" && <Kloetzli breite={breite} hoehe={h} />}
      {gewaehlt === "huehnerhof" && <Huehnerhof breite={breite} hoehe={h} />}
      {gewaehlt === "flatterhuhn" && <Flatterhuhn breite={breite} hoehe={h} />}
      {gewaehlt === "eierschleuder" && <Eierschleuder breite={breite} hoehe={h} />}
    </div>
  );
}

// ----------------------------- Tic Tac Toe -----------------------------
const REIHEN = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function gewinner(f) {
  for (const r of REIHEN) if (f[r[0]] && f[r[0]] === f[r[1]] && f[r[0]] === f[r[2]]) return { wer: f[r[0]], reihe: r };
  return f.every(Boolean) ? { wer: "-", reihe: [] } : null;
}
// Bester Zug für O (Computer); ab und zu ein zufälliger, damit man auch gewinnen kann
function computerZug(f) {
  const frei = f.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (Math.random() < 0.2) return frei[Math.floor(Math.random() * frei.length)];
  const wert = (g, zug) => {
    const w = gewinner(g);
    if (w) return w.wer === "O" ? 10 : w.wer === "X" ? -10 : 0;
    const werte = g.map((v, i) => (v ? null : i)).filter((i) => i !== null).map((i) => {
      const n = g.slice(); n[i] = zug; return wert(n, zug === "O" ? "X" : "O");
    });
    return zug === "O" ? Math.max(...werte) : Math.min(...werte);
  };
  let best = frei[0], bw = -Infinity;
  for (const i of frei) {
    const n = f.slice(); n[i] = "O";
    const w = wert(n, "X");
    if (w > bw) { bw = w; best = i; }
  }
  return best;
}

function DreiGewinnt({ breite, hoehe }) {
  const [art, setArt] = useState(null); // "zwei" | "computer"
  const [f, setF] = useState(Array(9).fill(""));
  const [dran, setDran] = useState("X");
  const [stand, setStand] = useState({ X: 0, O: 0, "-": 0 });
  const w = gewinner(f);

  useEffect(() => {
    if (art !== "computer" || dran !== "O" || w) return;
    const t = setTimeout(() => {
      setF((alt0) => { const n = alt0.slice(); n[computerZug(alt0)] = "O"; return n; });
      setDran("X");
    }, 450);
    return () => clearTimeout(t);
  }, [art, dran, w]);
  useEffect(() => { if (w) setStand((s) => ({ ...s, [w.wer]: s[w.wer] + 1 })); }, [w && w.wer, w && w.reihe.join()]); // eslint-disable-line

  const setzen = (i) => {
    if (f[i] || w || (art === "computer" && dran === "O")) return;
    const n = f.slice(); n[i] = dran; setF(n); setDran(dran === "X" ? "O" : "X");
  };
  const nochmal = () => { setF(Array(9).fill("")); setDran("X"); };

  if (!art) {
    return (
      <div className="sp-start" data-sp="ttt-start">
        <div className="sp-start__titel">🔩 Tic Tac Toe ⚙️</div>
        <div className="sp-start__knoepfe">
          <button type="button" className="sp-gross" data-sp="ttt-zwei" onClick={() => setArt("zwei")}>👥 Zu zweit</button>
          <button type="button" className="sp-gross" data-sp="ttt-computer" onClick={() => setArt("computer")}>🤖 Gegen Computer</button>
        </div>
      </div>
    );
  }
  const g = Math.floor(Math.min(hoehe - 20, breite - 760) / 3);
  const namen = art === "computer" ? { X: "Du", O: "Computer" } : { X: "Schraube 🔩", O: "Zahnrad ⚙️" };
  return (
    <div className="sp-ttt" data-sp="ttt">
      <div className="sp-ttt__feld" style={{ gridTemplateColumns: `repeat(3, ${g}px)`, gridAutoRows: g + "px" }}>
        {f.map((v, i) => (
          <button type="button" key={i} data-sp={"ttt-" + i}
            className={"sp-ttt__zelle" + (v ? " sp-ttt__zelle--" + v : "") + (w && w.reihe.includes(i) ? " sp-ttt__zelle--sieg" : "")}
            style={{ fontSize: g * 0.62 }} onPointerDown={(e) => { e.preventDefault(); setzen(i); }}>
            {v === "X" ? "🔩" : v === "O" ? "⚙️" : ""}</button>
        ))}
      </div>
      <div className="sp-seite">
        <div className="sp-meldung" data-sp="ttt-meldung">
          {w ? (w.wer === "-" ? "Unentschieden!" : namen[w.wer] + (art === "computer" && w.wer === "X" ? " hast gewonnen! 🎉" : " gewinnt!"))
            : (art === "computer" && dran === "O" ? "Computer überlegt …" : namen[dran] + " ist dran")}
        </div>
        <div className="sp-zahlen">
          <div><span>{namen.X}</span><b>{stand.X}</b></div>
          <div><span>{namen.O}</span><b>{stand.O}</b></div>
          <div><span>Unentschieden</span><b>{stand["-"]}</b></div>
        </div>
        <button type="button" className="sp-gross" data-sp="ttt-nochmal" onClick={nochmal}>Neues Spiel</button>
        <button type="button" className="sp-klein" onClick={() => { nochmal(); setStand({ X: 0, O: 0, "-": 0 }); setArt(null); }}>Andere Spielart</button>
      </div>
    </div>
  );
}

// ------------------------------- Klötzli -------------------------------
const KB = 10, KH = 16;
// Farben wie die Werkstoffe auf der Planwand (werkstoffErkennen)
const WERKSTOFF = { "#dc2626": "V2A", "#94a3b8": "V4A", "#f59e0b": "MS", "#2563eb": "ST", "#f1f5f9": "AL", "#facc15": "NS", "#8b5cf6": "TI" };
const STEINE = [
  { teile: [[0, 0]], farbe: "#facc15" },
  { teile: [[0, 0], [1, 0]], farbe: "#94a3b8" },
  { teile: [[0, 0], [1, 0], [2, 0]], farbe: "#2563eb" },
  { teile: [[0, 0], [1, 0], [0, 1]], farbe: "#dc2626" },
  { teile: [[0, 0], [1, 0], [2, 0], [1, 1]], farbe: "#f59e0b" },
  { teile: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], farbe: "#8b5cf6" },
  { teile: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]], farbe: "#f1f5f9" },
];
const neuerStein = () => {
  const s = STEINE[Math.floor(Math.random() * STEINE.length)];
  return { teile: s.teile, farbe: s.farbe, x: Math.floor(KB / 2) - 1, y: 0 };
};
const drehen = (teile) => {
  const n = teile.map(([x, y]) => [-y, x]);
  const mx = Math.min(...n.map((p) => p[0])), my = Math.min(...n.map((p) => p[1]));
  return n.map(([x, y]) => [x - mx, y - my]);
};

function Kloetzli({ breite, hoehe }) {
  const s = useRef(null);
  const [, neu] = useState(0);
  const zeichne = () => neu((n) => n + 1);
  const [rekord, setRekord] = useState(() => rekordLesen("kloetzli"));

  const passt = (teile, x, y) => teile.every(([a, b]) => {
    const px = x + a, py = y + b;
    return px >= 0 && px < KB && py < KH && (py < 0 || !s.current.feld[py][px]);
  });
  const starten = () => {
    s.current = { feld: Array.from({ length: KH }, () => Array(KB).fill(null)), stein: neuerStein(), naechster: neuerStein(),
      punkte: 0, reihen: 0, aus: false, laeuft: true };
    zeichne();
  };
  const ablegen = () => {
    const z = s.current, st = z.stein;
    for (const [a, b] of st.teile) if (st.y + b >= 0) z.feld[st.y + b][st.x + a] = st.farbe;
    const voll = z.feld.filter((r) => r.every(Boolean)).length;
    if (voll) {
      z.feld = [...Array.from({ length: voll }, () => Array(KB).fill(null)), ...z.feld.filter((r) => !r.every(Boolean))];
      z.reihen += voll;
      z.punkte += [0, 100, 300, 600, 1000, 1500][voll] * (1 + Math.floor(z.reihen / 10));
    }
    z.stein = z.naechster; z.naechster = neuerStein();
    if (!passt(z.stein.teile, z.stein.x, z.stein.y)) {
      z.aus = true; z.laeuft = false;
      if (rekordMerken("kloetzli", z.punkte)) { z.neuerRekord = true; setRekord(z.punkte); }
    }
  };
  const tun = useCallback((was) => {
    const z = s.current;
    if (!z || !z.laeuft) return false;
    const st = z.stein;
    if (was === "links" && passt(st.teile, st.x - 1, st.y)) st.x--;
    else if (was === "rechts" && passt(st.teile, st.x + 1, st.y)) st.x++;
    else if (was === "hoch") {
      const d = drehen(st.teile);
      for (const dx of [0, -1, 1, -2, 2]) if (passt(d, st.x + dx, st.y)) { st.teile = d; st.x += dx; break; }
    } else if (was === "runter") {
      if (passt(st.teile, st.x, st.y + 1)) { st.y++; z.punkte += 1; } else ablegen();
    } else if (was === "fallen") {
      while (passt(st.teile, st.x, st.y + 1)) { st.y++; z.punkte += 2; }
      ablegen();
    }
    zeichne();
    return true;
  }, []); // eslint-disable-line
  usePfeile(tun);

  // Fallen von selbst, mit jeder zehnten Reihe schneller
  const stufe = s.current ? 1 + Math.floor(s.current.reihen / 10) : 1;
  const laeuft = !!(s.current && s.current.laeuft);
  useEffect(() => {
    if (!laeuft) return;
    const t = setInterval(() => {
      const z = s.current;
      if (!z || !z.laeuft) return;
      if (passt(z.stein.teile, z.stein.x, z.stein.y + 1)) z.stein.y++; else ablegen();
      zeichne();
    }, Math.max(140, 750 - (stufe - 1) * 70));
    return () => clearInterval(t);
  }, [laeuft, stufe]); // eslint-disable-line

  const z = s.current;
  const k = Math.floor(Math.min((hoehe - 10) / KH, (breite - 900) / KB));
  const bild = z ? z.feld.map((r) => r.slice()) : Array.from({ length: KH }, () => Array(KB).fill(null));
  let schatten = [];
  if (z && z.laeuft) {
    let gy = z.stein.y;
    while (passt(z.stein.teile, z.stein.x, gy + 1)) gy++;
    schatten = z.stein.teile.map(([a, b]) => (gy + b) * KB + z.stein.x + a);
    for (const [a, b] of z.stein.teile) if (z.stein.y + b >= 0) bild[z.stein.y + b][z.stein.x + a] = z.stein.farbe;
  }
  return (
    <div className="sp-kl" data-sp="kloetzli">
      <div className="sp-tasten sp-tasten--links">
        <Taste los={() => tun("hoch")} data-sp="kl-drehen">⟳<small>Drehen</small></Taste>
        <Taste los={() => tun("links")} data-sp="kl-links">◀</Taste>
      </div>
      <div className="sp-kl__feld" style={{ gridTemplateColumns: `repeat(${KB}, ${k}px)`, gridAutoRows: k + "px" }}
        {...wischen((r) => tun(r === "runter" ? "fallen" : r))}>
        {bild.flat().map((c, i) => (
          <div key={i} className={"sp-kl__z" + (c ? " sp-kl__z--voll" : schatten.includes(i) ? " sp-kl__z--schatten" : "")}
            style={c ? { "--sf": c, fontSize: k * 0.28 } : undefined}>{c ? WERKSTOFF[c] : null}</div>
        ))}
        {(!z || z.aus) &&
          <div className="sp-ueber">
            {z && z.aus && <div className="sp-ueber__titel">Lager voll! {z.punkte.toLocaleString("de-CH")} Punkte</div>}
            {z && z.neuerRekord && <div className="sp-ueber__rekord">🏆 Neuer Rekord!</div>}
            <button type="button" className="sp-gross" data-sp="kl-start" onClick={starten}>{z ? "Nochmal" : "▶ Start"}</button>
          </div>}
      </div>
      <div className="sp-tasten sp-tasten--rechts">
        <Taste los={() => tun("fallen")} data-sp="kl-fallen">⤓<small>Fallen</small></Taste>
        <Taste los={() => tun("rechts")} data-sp="kl-rechts">▶</Taste>
      </div>
      <div className="sp-seite sp-seite--schmal">
        <div className="sp-zahlen">
          <div><span>Punkte</span><b data-sp="kl-punkte">{z ? z.punkte.toLocaleString("de-CH") : 0}</b></div>
          <div><span>Reihen</span><b>{z ? z.reihen : 0}</b></div>
          <div><span>Stufe</span><b>{stufe}</b></div>
          <div><span>Rekord</span><b>{rekord.toLocaleString("de-CH")}</b></div>
        </div>
        {z && z.laeuft &&
          <div className="sp-naechster"><span>Als Nächstes</span>
            <div className="sp-naechster__bild">
              {[0, 1, 2].map((y) => [0, 1, 2].map((x) => (
                <div key={x + "-" + y} className="sp-kl__z" style={z.naechster.teile.some(([a, b]) => a === x && b === y)
                  ? { "--sf": z.naechster.farbe, background: "var(--sf)" } : { background: "transparent", border: 0 }} />
              )))}
            </div>
          </div>}
      </div>
    </div>
  );
}

// ------------------------------ Hühnerhof ------------------------------
const HOF = [
  "###################",
  "#........#........#",
  "#.##.###.#.###.##.#",
  "#.#...............#",
  "#.#.##.##-##.##.#.#",
  "#......#---#......#",
  "#.##.#.##-##.#.##.#",
  "#....#...H...#....#",
  "#.####.#####.####.#",
  "#.................#",
  "###################",
];
const HB = HOF[0].length, HH = HOF.length;
// Schilder auf den Maschinenblöcken der Halle (Zeile, erste Spalte, Breite)
const SCHILDER = [[2, 5, 3, "STAR"], [2, 11, 3, "STAR"], [8, 2, 4, "SW20"], [8, 7, 5, "INDEX C100"], [8, 13, 4, "WILLEMIN"],
  [4, 4, 2, "SB16"], [4, 13, 2, "SR32"]];
const RICHT = { links: [-1, 0], rechts: [1, 0], hoch: [0, -1], runter: [0, 1] };
const frei = (x, y) => x >= 0 && x < HB && y >= 0 && y < HH && HOF[y][x] !== "#";
const KOERNER = () => {
  const k = new Set();
  HOF.forEach((r, y) => [...r].forEach((c, x) => { if (c === ".") k.add(y * HB + x); }));
  return k;
};
const HUHN_START = (() => { const y = HOF.findIndex((r) => r.includes("H")); return { x: HOF[y].indexOf("H"), y }; })();
const FUCHS_STARTS = [{ x: 9, y: 5 }, { x: 8, y: 5 }, { x: 10, y: 5 }];

// Nächster Schritt des Fuchses zum Huhn (kürzester Weg), manchmal ein
// zufälliger, damit er nicht unschlagbar ist.
function fuchsSchritt(f, ziel, schlau) {
  const wege = Object.values(RICHT).filter(([dx, dy]) => frei(f.x + dx, f.y + dy));
  if (Math.random() > schlau) { const [dx, dy] = wege[Math.floor(Math.random() * wege.length)]; return { x: f.x + dx, y: f.y + dy }; }
  const start = ziel.y * HB + ziel.x, weit = new Map([[start, 0]]), q = [start];
  while (q.length) {
    const p = q.shift(), x = p % HB, y = Math.floor(p / HB);
    for (const [dx, dy] of Object.values(RICHT)) {
      const n = (y + dy) * HB + x + dx;
      if (frei(x + dx, y + dy) && !weit.has(n)) { weit.set(n, weit.get(p) + 1); q.push(n); }
    }
  }
  let best = wege[0], bw = Infinity;
  for (const [dx, dy] of wege) {
    const d = weit.get((f.y + dy) * HB + f.x + dx);
    if (d !== undefined && d < bw) { bw = d; best = [dx, dy]; }
  }
  return { x: f.x + best[0], y: f.y + best[1] };
}

function Huehnerhof({ breite, hoehe }) {
  const s = useRef(null);
  const [, neu] = useState(0);
  const zeichne = () => neu((n) => n + 1);
  const [rekord, setRekord] = useState(() => rekordLesen("huehnerhof"));

  const aufstellen = (z) => {
    z.huhn = { ...HUHN_START, r: "links" }; z.wunsch = "links";
    z.fuechse = FUCHS_STARTS.slice(0, Math.min(3, z.stufe)).map((p) => ({ ...p }));
    z.pause = 900; // kurz durchatmen nach dem Start oder Erwischtwerden
  };
  const starten = () => {
    const z = { koerner: KOERNER(), punkte: 0, leben: 3, stufe: 1, laeuft: true, aus: false };
    aufstellen(z);
    s.current = z;
    zeichne();
  };
  const tun = useCallback((r) => {
    const z = s.current;
    if (!z || !z.laeuft || !RICHT[r]) return false;
    z.wunsch = r;
    return true;
  }, []);
  usePfeile(tun);

  const laeuft = !!(s.current && s.current.laeuft);
  useEffect(() => {
    if (!laeuft) return;
    const TAKT = 50;
    let huhnZeit = 0, fuchsZeit = 0;
    const t = setInterval(() => {
      const z = s.current;
      if (!z || !z.laeuft) return;
      if (z.pause > 0) { z.pause -= TAKT; return; }
      const h = z.huhn;
      huhnZeit += TAKT; fuchsZeit += TAKT;
      let bewegt = false;
      if (huhnZeit >= 190) {
        huhnZeit = 0;
        const [wx, wy] = RICHT[z.wunsch];
        if (frei(h.x + wx, h.y + wy)) h.r = z.wunsch;
        const [dx, dy] = RICHT[h.r];
        if (frei(h.x + dx, h.y + dy)) { h.x += dx; h.y += dy; bewegt = true; }
        const p = h.y * HB + h.x;
        if (z.koerner.delete(p)) { z.punkte += 10; bewegt = true; }
        if (!z.koerner.size) {
          z.punkte += 500 * z.stufe; z.stufe++; z.koerner = KOERNER(); aufstellen(z); zeichne(); return;
        }
      }
      if (fuchsZeit >= Math.max(200, 330 - (z.stufe - 1) * 25)) {
        fuchsZeit = 0;
        z.fuechse = z.fuechse.map((f) => fuchsSchritt(f, h, Math.min(0.9, 0.65 + z.stufe * 0.05)));
        bewegt = true;
      }
      if (z.fuechse.some((f) => f.x === h.x && f.y === h.y)) {
        z.leben--;
        if (z.leben <= 0) {
          z.laeuft = false; z.aus = true;
          if (rekordMerken("huehnerhof", z.punkte)) { z.neuerRekord = true; setRekord(z.punkte); }
        } else aufstellen(z);
        bewegt = true;
      }
      if (bewegt) zeichne();
    }, TAKT);
    return () => clearInterval(t);
  }, [laeuft]);

  const z = s.current;
  const k = Math.floor(Math.min((hoehe - 10) / HH, (breite - 520) / HB));
  return (
    <div className="sp-hof" data-sp="huehnerhof">
      <div className="sp-hof__feld" style={{ width: k * HB, height: k * HH, "--k": k + "px" }}
        {...wischen(tun)}>
        {HOF.map((r, y) => [...r].map((c, x) => c === "#"
          ? <div key={x + "-" + y} className={"sp-hof__zaun" + (x === 0 || y === 0 || x === HB - 1 || y === HH - 1 ? " sp-hof__zaun--wand" : "")}
            style={{ left: x * k, top: y * k }} />
          : z && z.koerner.has(y * HB + x)
            ? <div key={x + "-" + y} className="sp-hof__korn" style={{ left: x * k, top: y * k }} />
            : null))}
        {SCHILDER.map(([y, x, w, t]) => <div key={t + x + y} className="sp-hof__schild"
          style={{ left: x * k, top: y * k, width: w * k, height: k, fontSize: k * 0.3 }}>{t}</div>)}
        {z && <div className={"sp-hof__tier sp-hof__huhn" + (z.huhn.r === "rechts" ? " sp-hof__tier--rechts" : "")}
          data-sp="huhn" style={{ left: z.huhn.x * k, top: z.huhn.y * k }}>🧑‍🏭</div>}
        {z && z.fuechse.map((f, i) => <div key={i} className="sp-hof__tier sp-hof__fuchs" style={{ left: f.x * k, top: f.y * k }}><SpaeneMonster /></div>)}
        {(!z || z.aus) &&
          <div className="sp-ueber">
            {!z && <div className="sp-ueber__text">Sammle alle Drehteile in der Halle ein! Die Spänemonster wollen dich erwischen. Steuern mit Wischen oder den Pfeilen.</div>}
            {z && z.aus && <div className="sp-ueber__titel">Das Spänemonster hat dich erwischt! {z.punkte.toLocaleString("de-CH")} Punkte</div>}
            {z && z.neuerRekord && <div className="sp-ueber__rekord">🏆 Neuer Rekord!</div>}
            <button type="button" className="sp-gross" data-sp="hof-start" onClick={starten}>{z ? "Nochmal" : "▶ Start"}</button>
          </div>}
      </div>
      <div className="sp-seite">
        <div className="sp-zahlen">
          <div><span>Punkte</span><b data-sp="hof-punkte">{z ? z.punkte.toLocaleString("de-CH") : 0}</b></div>
          <div><span>Leben</span><b>{z ? "❤️".repeat(Math.max(0, z.leben)) || "–" : "❤️❤️❤️"}</b></div>
          <div><span>Schicht</span><b>{z ? z.stufe : 1}</b></div>
          <div><span>Rekord</span><b>{rekord.toLocaleString("de-CH")}</b></div>
        </div>
        <div className="sp-kreuz">
          <Taste className="sp-kreuz__hoch" los={() => tun("hoch")} data-sp="hof-hoch">▲</Taste>
          <Taste className="sp-kreuz__links" los={() => tun("links")} data-sp="hof-links">◀</Taste>
          <Taste className="sp-kreuz__rechts" los={() => tun("rechts")} data-sp="hof-rechts">▶</Taste>
          <Taste className="sp-kreuz__runter" los={() => tun("runter")} data-sp="hof-runter">▼</Taste>
        </div>
      </div>
    </div>
  );
}

// ------------------------- Zeichnen auf Canvas -------------------------
// Die Tafel ist als Ganzes verkleinert (CSS transform), darum rechnen wir
// Berührungen von Bildschirm- in Canvas-Punkte um.
function canvasPunkt(c, e) {
  const r = c.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
}

// Das Spänemonster für die Hallenrunde (im DOM)
export function SpaeneMonster() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
      <g fill="none" stroke="#94a3b8" strokeWidth="7" strokeLinecap="round">
        <path d="M50 18 a32 32 0 1 1 -30 22 a22 22 0 1 1 20 30 a12 12 0 1 1 18 -8" />
        <path d="M18 28 q-14 -8 -6 -22 M82 22 q14 -4 10 -18 M86 78 q12 6 8 18 M14 74 q-12 8 -4 20" stroke="#64748b" strokeWidth="5" />
      </g>
      <g stroke="#1e293b" strokeWidth="4" strokeLinecap="round"><path d="M28 36 l14 6 M72 36 l-14 6" /></g>
      <circle cx="38" cy="50" r="10" fill="#fff" stroke="#1e293b" strokeWidth="3" />
      <circle cx="62" cy="50" r="10" fill="#fff" stroke="#1e293b" strokeWidth="3" />
      <circle cx="40" cy="52" r="4.5" fill="#1e293b" /><circle cx="60" cy="52" r="4.5" fill="#1e293b" />
      <path d="M38 72 q12 -8 24 0" fill="none" stroke="#1e293b" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// Dasselbe auf dem Canvas
function zeichneMonster(g, x, y, s, wackeln = 0) {
  g.save(); g.translate(x, y); g.rotate(Math.sin(wackeln) * 0.12); g.scale(s, s);
  g.lineCap = "round"; g.fillStyle = "rgba(148,163,184,.25)";
  g.beginPath(); g.arc(0, 0, 36, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#94a3b8"; g.lineWidth = 7;
  g.beginPath(); g.arc(0, 0, 32, -1.4, 4.2); g.stroke();
  g.beginPath(); g.arc(4, 2, 22, 1.2, 6.6); g.stroke();
  g.strokeStyle = "#64748b"; g.lineWidth = 5;
  for (const [a, l] of [[-2.4, 1], [-0.7, 1.2], [0.8, 0.9], [2.4, 1.1]]) {
    g.beginPath(); g.moveTo(Math.cos(a) * 34, Math.sin(a) * 34);
    g.quadraticCurveTo(Math.cos(a + 0.4) * 52 * l, Math.sin(a + 0.4) * 52 * l, Math.cos(a - 0.2) * 50 * l, Math.sin(a - 0.2) * 50 * l); g.stroke();
  }
  g.strokeStyle = "#1e293b"; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-22, -16); g.lineTo(-8, -10); g.moveTo(22, -16); g.lineTo(8, -10); g.stroke();
  for (const ax of [-12, 12]) {
    g.fillStyle = "#fff"; g.lineWidth = 3; g.beginPath(); g.arc(ax, 0, 10, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#1e293b"; g.beginPath(); g.arc(ax + (ax < 0 ? 2 : -2), 2, 4.5, 0, Math.PI * 2); g.fill();
  }
  g.lineWidth = 4; g.beginPath(); g.moveTo(-12, 22); g.quadraticCurveTo(0, 14, 12, 22); g.stroke();
  g.restore();
}

// Ein Drehteil von der Seite: abgesetzte Welle mit Gewinde, metallisch.
// fehler: "riss" | "rost" | "grat" | null
const FORMEN = [
  [[0, 36, 30], [36, 50, 18], [86, 34, 24]],     // Bolzen mit Bund
  [[0, 24, 22], [24, 60, 30], [84, 36, 14]],     // Achse
  [[0, 50, 26], [50, 24, 34], [74, 46, 20]],     // Hülse mit Kragen
];
function zeichneDrehteil(g, x, y, s, form = 0, fehler = null, drehung = 0) {
  const stufen = FORMEN[form % FORMEN.length];
  const l = stufen.reduce((m, [a, b]) => Math.max(m, a + b), 0);
  g.save(); g.translate(x, y); g.rotate(drehung); g.scale(s, s); g.translate(-l / 2, 0);
  for (const [a, b, d] of stufen) {
    const v = g.createLinearGradient(0, -d, 0, d);
    v.addColorStop(0, "#f8fafc"); v.addColorStop(0.35, "#cbd5e1"); v.addColorStop(0.7, "#64748b"); v.addColorStop(1, "#94a3b8");
    g.fillStyle = v; g.strokeStyle = "#334155"; g.lineWidth = 2.5;
    g.fillRect(a, -d, b, 2 * d); g.strokeRect(a, -d, b, 2 * d);
  }
  // Gewinde am letzten Absatz
  const [ga, gb, gd] = stufen[stufen.length - 1];
  g.strokeStyle = "rgba(30,41,59,.55)"; g.lineWidth = 2;
  for (let k = ga + 5; k < ga + gb - 3; k += 6) { g.beginPath(); g.moveTo(k, -gd); g.lineTo(k + 4, gd); g.stroke(); }
  if (fehler === "riss") {
    g.strokeStyle = "#dc2626"; g.lineWidth = 4; g.beginPath();
    const m = stufen[1][0] + stufen[1][1] / 2;
    g.moveTo(m - 6, -stufen[1][2]); g.lineTo(m + 6, -8); g.lineTo(m - 4, 4); g.lineTo(m + 8, stufen[1][2]); g.stroke();
  } else if (fehler === "rost") {
    g.fillStyle = "rgba(180,83,9,.85)";
    for (const [px, py, r] of [[l * 0.3, -6, 9], [l * 0.45, 8, 7], [l * 0.62, -2, 11], [l * 0.2, 10, 5]]) { g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); }
  } else if (fehler === "grat") {
    g.fillStyle = "#dc2626";
    const [a] = stufen[1];
    for (let k = -1; k <= 1; k += 2) { g.beginPath(); g.moveTo(a, k * stufen[1][2]); g.lineTo(a - 6, k * (stufen[1][2] + 16)); g.lineTo(a + 8, k * stufen[1][2]); g.fill(); }
  }
  g.restore();
}

// Hintergrund: unsere Halle mit Fenstern, Maschinen und gelber Linie am Boden
function zeichneHalle(g, b, h, boden, maschinen = true) {
  const wand = g.createLinearGradient(0, 0, 0, boden);
  wand.addColorStop(0, "#e2e8f0"); wand.addColorStop(1, "#f8fafc");
  g.fillStyle = wand; g.fillRect(0, 0, b, boden);
  // Fensterband mit Himmel
  for (let x = 40; x < b - 140; x += 260) {
    const f = g.createLinearGradient(0, 110, 0, 230);
    f.addColorStop(0, "#7dd3fc"); f.addColorStop(1, "#e0f2fe");
    g.fillStyle = f; g.fillRect(x, 110, 220, 120);
    g.strokeStyle = "#475569"; g.lineWidth = 6; g.strokeRect(x, 110, 220, 120);
    g.beginPath(); g.moveTo(x + 110, 110); g.lineTo(x + 110, 230); g.stroke();
  }
  g.fillStyle = "#1e3a8a"; g.font = "bold 34px system-ui"; g.textAlign = "right";
  g.fillText("HOFER + CO", b - 40, 280);
  g.font = "20px system-ui"; g.fillStyle = "#475569"; g.fillText("Präzisionsdrehteile · Lohn-Ammannsegg", b - 40, 308);
  g.textAlign = "left";
  // Maschinen hinten
  const namen = ["STAR SB-20", "INDEX C100", "STAR SW20", "WILLEMIN 508", "STAR SR-32", "INDEX C100"];
  let i = 0;
  g.globalAlpha = 0.55;
  for (let x = 30; maschinen && x < b; x += 330, i++) {
    const mh = 190 + (i % 2) * 30, my = boden - mh;
    g.fillStyle = "#cbd5e1"; g.fillRect(x, my, 290, mh);
    g.fillStyle = "#e2e8f0"; g.fillRect(x + 14, my + 14, 150, mh - 60);
    g.fillStyle = "rgba(125,211,252,.55)"; g.fillRect(x + 26, my + 26, 126, mh - 90);
    g.fillStyle = "#1d4ed8"; g.fillRect(x, my, 290, 12);
    g.fillStyle = "#334155"; g.fillRect(x + 184, my + 24, 86, 56);
    g.fillStyle = "#22c55e"; g.beginPath(); g.arc(x + 200, my + 100, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#475569"; g.font = "bold 18px system-ui"; g.fillText(namen[i % namen.length], x + 14, my + mh - 18);
  }
  g.globalAlpha = 1;
  g.fillStyle = "#9ca3af"; g.fillRect(0, boden, b, h - boden);
  for (let x = 0; x < b; x += 60) { g.fillStyle = x % 120 ? "#1f2937" : "#facc15"; g.fillRect(x, boden, 60, 12); }
}

// Funken, wo etwas getroffen wurde
function zeichneFunken(g, p) {
  g.strokeStyle = "#f59e0b"; g.lineWidth = 4;
  const r = (1.2 - p.zeit) * 90;
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * Math.PI * 2;
    g.beginPath(); g.moveTo(p.x + Math.cos(a) * r * 0.5, p.y + Math.sin(a) * r * 0.5); g.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); g.stroke();
  }
}

// ---------------------------- Ausschuss-Jagd ----------------------------
// Drei Förderbänder, darauf Drehteile. Schlechte Teile (Riss, Rost, Grat)
// antippen gibt Punkte, ein Gutteil antippen kostet Punkte.
const FH_DAUER = 90;
const FEHLER = ["riss", "rost", "grat"];

function Flatterhuhn({ breite, hoehe }) {
  const cv = useRef(null);
  const s = useRef(null);
  const [, neu] = useState(0);
  const [rekord, setRekord] = useState(() => rekordLesen("flatterhuhn"));
  const b = Math.floor(breite), h = Math.floor(hoehe - 4);
  const BAENDER = [0.42, 0.64, 0.86].map((f, i) => ({ y: Math.round(h * f), v: [220, 320, 430][i] * (i % 2 ? -1 : 1), punkte: [10, 15, 20][i] }));

  const starten = () => { s.current = { teile: [], texte: [], punkte: 0, treffer: 0, durch: 0, ende: Date.now() + FH_DAUER * 1000, laeuft: true, naechstes: [0, 0.6, 1.2] }; neu((n) => n + 1); };

  useEffect(() => {
    let rahmen, zuletzt = performance.now(), anzeige = -1, lauf = 0;
    const schritt = (jetzt) => {
      const dt = Math.min(0.05, (jetzt - zuletzt) / 1000); zuletzt = jetzt;
      const c = cv.current, z = s.current;
      if (!c) return;
      const g = c.getContext("2d");
      zeichneHalle(g, b, h, h - 30, false);
      if (z && z.laeuft) lauf += dt;
      // Bänder
      for (const band of BAENDER) {
        g.fillStyle = "#1f2937"; g.fillRect(0, band.y + 30, b, 34);
        g.fillStyle = "#374151";
        const off = ((lauf * band.v) % 60 + 60) % 60;
        for (let x = -60 + off; x < b; x += 60) g.fillRect(x, band.y + 34, 30, 26);
        g.fillStyle = "#6b7280"; for (let x = 20; x < b; x += 160) { g.beginPath(); g.arc(x, band.y + 47, 10, 0, Math.PI * 2); g.fill(); }
      }
      if (z) {
        if (z.laeuft) {
          BAENDER.forEach((band, i) => {
            z.naechstes[i] -= dt;
            if (z.naechstes[i] <= 0) {
              const defekt = Math.random() < 0.38;
              z.teile.push({ band: i, x: band.v > 0 ? -90 : b + 90, form: Math.floor(Math.random() * 3),
                fehler: defekt ? FEHLER[Math.floor(Math.random() * 3)] : null });
              z.naechstes[i] = 0.9 + Math.random() * 1.4;
            }
          });
          if (Date.now() >= z.ende) {
            z.laeuft = false;
            if (rekordMerken("flatterhuhn", z.punkte)) { z.neuerRekord = true; setRekord(z.punkte); }
            neu((n) => n + 1);
          }
        }
        for (const t of z.teile) {
          const band = BAENDER[t.band];
          if (z.laeuft) t.x += band.v * dt;
          zeichneDrehteil(g, t.x, band.y, 1.1, t.form, t.fehler);
        }
        const vorher = z.teile.length;
        z.teile = z.teile.filter((t) => {
          const raus = t.x < -120 || t.x > b + 120;
          if (raus && t.fehler) z.durch++;
          return !raus;
        });
        if (z.teile.length !== vorher) neu((n) => n + 1);
        z.texte = z.texte.filter((f) => (f.zeit -= dt) > 0);
        for (const f of z.texte) {
          g.globalAlpha = Math.min(1, f.zeit);
          if (f.funken) zeichneFunken(g, f);
          g.fillStyle = f.farbe; g.font = "bold 46px system-ui"; g.fillText(f.text, f.x - 40, f.y - 50 - (1.2 - f.zeit) * 50);
          g.globalAlpha = 1;
        }
        const rest = z.laeuft ? Math.ceil((z.ende - Date.now()) / 1000) : 0;
        if (rest !== anzeige) { anzeige = rest; neu((n) => n + 1); }
      }
      rahmen = requestAnimationFrame(schritt);
    };
    rahmen = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(rahmen);
  }, [b, h]); // eslint-disable-line

  const tippen = (e) => {
    const z = s.current;
    if (!z || !z.laeuft) return;
    const p = canvasPunkt(cv.current, e);
    for (let i = z.teile.length - 1; i >= 0; i--) {
      const t = z.teile[i], y = BAENDER[t.band].y;
      if (Math.abs(p.x - t.x) < 80 && Math.abs(p.y - y) < 50) {
        z.teile.splice(i, 1);
        if (t.fehler) {
          const pt = BAENDER[t.band].punkte;
          z.punkte += pt; z.treffer++;
          z.texte.push({ x: t.x, y, zeit: 1.2, text: "+" + pt, farbe: "#15803d", funken: true });
        } else {
          z.punkte = Math.max(0, z.punkte - 5);
          z.texte.push({ x: t.x, y, zeit: 1.2, text: "Gutteil! −5", farbe: "#dc2626" });
        }
        neu((n) => n + 1);
        return;
      }
    }
  };

  const z = s.current;
  const rest = z && z.laeuft ? Math.max(0, Math.ceil((z.ende - Date.now()) / 1000)) : 0;
  return (
    <div className="sp-leinwand" data-sp="flatterhuhn" style={{ width: b, height: h }}>
      <canvas ref={cv} width={b} height={h} onPointerDown={tippen} />
      <div className="sp-leinwand__zahlen">
        <span>Punkte <b data-sp="fh-punkte">{z ? z.punkte : 0}</b></span>
        <span>Zeit <b>{rest}</b></span>
        <span>Durchgerutscht <b>{z ? z.durch : 0}</b></span>
        <span>Rekord <b>{rekord}</b></span>
      </div>
      {(!z || !z.laeuft) &&
        <div className="sp-ueber">
          {!z && <div className="sp-ueber__text">Tipp die schlechten Teile an: mit Riss, Rost oder Grat.
            Gutteile in Ruhe lassen! Je schneller das Band, desto mehr Punkte.</div>}
          {!z && <div className="sp-ausschuss-muster"><MusterTeil fehler={null} text="Gutteil" /><MusterTeil fehler="riss" text="Riss" />
            <MusterTeil fehler="rost" text="Rost" /><MusterTeil fehler="grat" text="Grat" /></div>}
          {z && <div className="sp-ueber__titel">Schicht fertig! {z.punkte} Punkte</div>}
          {z && <div className="sp-ueber__text">{z.treffer} schlechte Teile gefunden, {z.durch} durchgerutscht</div>}
          {z && z.neuerRekord && <div className="sp-ueber__rekord">🏆 Neuer Rekord!</div>}
          <button type="button" className="sp-gross" data-sp="fh-start" onClick={starten}>{z ? "Nochmal" : "▶ Start"}</button>
        </div>}
    </div>
  );
}

// Kleines Musterbild für die Erklärung
function MusterTeil({ fehler, text }) {
  const cv = useRef(null);
  useEffect(() => {
    const g = cv.current && cv.current.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, 200, 90); zeichneDrehteil(g, 100, 45, 1.1, 0, fehler);
  }, [fehler]);
  return <div className={"sp-muster" + (fehler ? " sp-muster--schlecht" : "")}><canvas ref={cv} width={200} height={90} /><span>{text}</span></div>;
}

// ---------------------------- Späneschleuder ----------------------------
const KISTE = 72;
const SCHWERE = 900;
const KISTEN_STOFFE = [["V2A", "#dc2626"], ["V4A", "#94a3b8"], ["MS", "#f59e0b"], ["ST", "#2563eb"], ["AL", "#f1f5f9"], ["NS", "#facc15"], ["TI", "#8b5cf6"]];

// Ein Lager: Türme aus Materialkisten (manche Gussblöcke, die halten), oben Spänemonster
function hofBauen(stufe, b, boden) {
  const tuerme = [], anzahl = Math.min(5, 2 + Math.floor(stufe / 2));
  const x0 = b * 0.5, platz = (b - 120 - x0) / anzahl;
  for (let i = 0; i < anzahl; i++) {
    const hoch = 1 + Math.floor(Math.random() * Math.min(6, 2 + stufe));
    const kisten = Array.from({ length: hoch }, () => ({ stein: Math.random() < Math.min(0.35, 0.08 * stufe), y: 0,
      stoff: KISTEN_STOFFE[Math.floor(Math.random() * KISTEN_STOFFE.length)] }));
    tuerme.push({ x: x0 + platz * i + platz / 2, kisten, fuchs: i === 0 || Math.random() < 0.7 ? { gefallen: 0, y: 0 } : null });
  }
  for (const t of tuerme) {
    t.kisten.forEach((k, j) => { k.y = boden - (j + 1) * KISTE; });
    if (t.fuchs) t.fuchs.y = boden - t.kisten.length * KISTE - 40;
  }
  return tuerme;
}

function zeichneKiste(g, x, k0) {
  const k = { ...k0, y: k0.y + 2 }, KISTE = 68;
  const l = x - KISTE / 2;
  if (k.stein) {
    g.fillStyle = "#475569"; g.fillRect(l, k.y, KISTE, KISTE);
    g.strokeStyle = "#1e293b"; g.lineWidth = 4; g.strokeRect(l + 2, k.y + 2, KISTE - 4, KISTE - 4);
    g.fillStyle = "#cbd5e1"; g.font = "bold 16px system-ui"; g.textAlign = "center"; g.fillText("GUSS", x, k.y + KISTE / 2 + 6); g.textAlign = "left";
    return;
  }
  g.fillStyle = "#c08a4a"; g.fillRect(l, k.y, KISTE, KISTE);
  g.strokeStyle = "#7c4a1e"; g.lineWidth = 4; g.strokeRect(l + 2, k.y + 2, KISTE - 4, KISTE - 4);
  g.beginPath(); g.moveTo(l + 2, k.y + 24); g.lineTo(l + KISTE - 2, k.y + 24); g.moveTo(l + 2, k.y + 48); g.lineTo(l + KISTE - 2, k.y + 48); g.stroke();
  g.fillStyle = k.stoff[1]; g.fillRect(l + 12, k.y + 26, KISTE - 24, 20);
  g.fillStyle = k.stoff[1] === "#f1f5f9" || k.stoff[1] === "#facc15" ? "#1e293b" : "#fff";
  g.font = "bold 15px system-ui"; g.textAlign = "center"; g.fillText(k.stoff[0], x, k.y + 42); g.textAlign = "left";
}

function Eierschleuder({ breite, hoehe }) {
  const cv = useRef(null);
  const s = useRef(null);
  const [, neu] = useState(0);
  const [rekord, setRekord] = useState(() => rekordLesen("eierschleuder"));
  const b = Math.floor(breite), h = Math.floor(hoehe - 4);
  const boden = h - 70;
  const sch = { x: 230, y: boden - 170 }; // Mitte der Schleuder

  const level = (z) => { z.tuerme = hofBauen(z.stufe, b, boden); z.eier = 3 + Math.min(3, Math.floor(z.stufe / 2)); z.ei = null; z.zug = null; };
  const starten = () => { const z = { stufe: 1, punkte: 0, laeuft: true, splat: [] }; level(z); s.current = z; neu((n) => n + 1); };

  useEffect(() => {
    let rahmen, zuletzt = performance.now(), zeit = 0;
    const schritt = (jetzt) => {
      const dt = Math.min(0.033, (jetzt - zuletzt) / 1000); zuletzt = jetzt; zeit += dt;
      const c = cv.current, z = s.current;
      if (!c) return;
      const g = c.getContext("2d");
      zeichneHalle(g, b, h, boden);
      // Schleuder aus Stahl auf einem Sockel
      g.fillStyle = "#334155"; g.fillRect(sch.x - 40, boden - 26, 80, 26);
      g.strokeStyle = "#64748b"; g.lineWidth = 16; g.lineCap = "round";
      g.beginPath(); g.moveTo(sch.x, boden - 26); g.lineTo(sch.x, sch.y + 50); g.lineTo(sch.x - 34, sch.y);
      g.moveTo(sch.x, sch.y + 50); g.lineTo(sch.x + 34, sch.y); g.stroke();
      // Vorrat neben der Schleuder
      if (z) for (let k = 0; k < Math.max(0, z.eier - (z.zug || z.ei ? 0 : 1)); k++) zeichneDrehteil(g, 110 - k * 4, boden - 20 - k * 22, 0.4, 0);
      if (z) {
        let wirdGefallen = false;
        for (const t of z.tuerme) {
          t.kisten.forEach((k, j) => {
            const ziel = boden - (j + 1) * KISTE;
            if (k.y < ziel) { k.y = Math.min(ziel, k.y + 700 * dt); wirdGefallen = true; }
            zeichneKiste(g, t.x, k);
          });
          if (t.fuchs) {
            const ziel = boden - t.kisten.length * KISTE - 40;
            if (t.fuchs.y < ziel) { t.fuchs.y = Math.min(ziel, t.fuchs.y + 700 * dt); wirdGefallen = true; }
            zeichneMonster(g, t.x, t.fuchs.y, 1, zeit * 3 + t.x);
          }
        }
        const spitze = z.zug ? z.zug : z.ei ? null : (z.eier > 0 && z.laeuft ? sch : null);
        if (spitze) {
          g.strokeStyle = "#1e293b"; g.lineWidth = 6;
          g.beginPath(); g.moveTo(sch.x - 34, sch.y); g.lineTo(spitze.x, spitze.y); g.lineTo(sch.x + 34, sch.y); g.stroke();
          zeichneDrehteil(g, spitze.x, spitze.y, 0.45, 0);
          if (z.zug) {
            const vx = (sch.x - z.zug.x) * 6.5, vy = (sch.y - z.zug.y) * 6.5;
            g.fillStyle = "rgba(30,41,59,.45)";
            for (let k = 1; k <= 8; k++) { const t = k * 0.07; g.beginPath(); g.arc(z.zug.x + vx * t, z.zug.y + vy * t + SCHWERE * t * t / 2, 6, 0, Math.PI * 2); g.fill(); }
          }
        }
        if (z.ei) {
          const e = z.ei;
          e.vy += SCHWERE * dt; e.x += e.vx * dt; e.y += e.vy * dt; e.dreh = (e.dreh || 0) + dt * 12;
          zeichneDrehteil(g, e.x, e.y, 0.45, 0, null, e.dreh);
          let weg = e.x > b + 50 || e.y > boden - 12;
          for (const t of z.tuerme) {
            if (weg) break;
            if (t.fuchs && Math.hypot(e.x - t.x, e.y - t.fuchs.y) < 50) {
              t.fuchs = null; z.punkte += 500; z.splat.push({ x: e.x, y: e.y, zeit: 1.2, text: "+500" }); weg = true; break;
            }
            for (let j = t.kisten.length - 1; j >= 0; j--) {
              const k = t.kisten[j];
              if (Math.abs(e.x - t.x) < KISTE / 2 + 12 && e.y > k.y - 12 && e.y < k.y + KISTE + 12) {
                if (!k.stein) {
                  t.kisten.splice(j, 1); z.punkte += 50;
                  if (t.fuchs) t.fuchs.gefallen++;
                }
                z.splat.push({ x: e.x, y: e.y, zeit: 1 });
                weg = true; break;
              }
            }
          }
          if (weg) { if (e.y > boden - 12) z.splat.push({ x: e.x, y: boden - 6, zeit: 1 }); z.ei = null; neu((n) => n + 1); }
        }
        // Wer zweimal fällt, zerfällt in Späne
        for (const t of z.tuerme) if (t.fuchs && t.fuchs.gefallen >= 2 && !wirdGefallen) {
          z.splat.push({ x: t.x, y: t.fuchs.y, zeit: 1.2, text: "+500" }); t.fuchs = null; z.punkte += 500; neu((n) => n + 1);
        }
        z.splat = z.splat.filter((p) => (p.zeit -= dt) > 0);
        for (const p of z.splat) {
          g.globalAlpha = Math.min(1, p.zeit);
          zeichneFunken(g, p);
          if (p.text) { g.fillStyle = "#1d4ed8"; g.font = "bold 48px system-ui"; g.fillText(p.text, p.x - 50, p.y - 40 - (1.2 - p.zeit) * 60); }
          g.globalAlpha = 1;
        }
        if (z.laeuft && !z.ei && !wirdGefallen) {
          if (!z.tuerme.some((t) => t.fuchs)) {
            z.punkte += z.eier * 300; z.stufe++; level(z); neu((n) => n + 1);
          } else if (z.eier <= 0 && !z.splat.length) {
            z.laeuft = false;
            if (rekordMerken("eierschleuder", z.punkte)) { z.neuerRekord = true; setRekord(z.punkte); }
            neu((n) => n + 1);
          }
        }
      }
      rahmen = requestAnimationFrame(schritt);
    };
    rahmen = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(rahmen);
  }, [b, h]); // eslint-disable-line

  // Spannen: irgendwo links ansetzen und ziehen, loslassen schiesst
  const zugBegrenzen = (p) => {
    const dx = p.x - sch.x, dy = p.y - sch.y, l = Math.hypot(dx, dy), max = 170;
    return l > max ? { x: sch.x + dx / l * max, y: sch.y + dy / l * max } : p;
  };
  const runter = (e) => {
    const z = s.current;
    if (!z || !z.laeuft || z.ei || z.eier <= 0) return;
    const p = canvasPunkt(cv.current, e);
    if (p.x > b * 0.45) return;
    cv.current.setPointerCapture && cv.current.setPointerCapture(e.pointerId);
    z.zug = zugBegrenzen(p);
  };
  const ziehen = (e) => { const z = s.current; if (z && z.zug) z.zug = zugBegrenzen(canvasPunkt(cv.current, e)); };
  const los = () => {
    const z = s.current;
    if (!z || !z.zug) return;
    const vx = (sch.x - z.zug.x) * 6.5, vy = (sch.y - z.zug.y) * 6.5;
    if (Math.hypot(vx, vy) > 150) { z.ei = { x: z.zug.x, y: z.zug.y, vx, vy }; z.eier--; }
    z.zug = null;
    neu((n) => n + 1);
  };

  const z = s.current;
  return (
    <div className="sp-leinwand" data-sp="eierschleuder" style={{ width: b, height: h }}>
      <canvas ref={cv} width={b} height={h} onPointerDown={runter} onPointerMove={ziehen} onPointerUp={los} onPointerCancel={los} />
      <div className="sp-leinwand__zahlen">
        <span>Punkte <b data-sp="es-punkte">{z ? z.punkte.toLocaleString("de-CH") : 0}</b></span>
        <span>Teile <b data-sp="es-eier">{z ? "🔩".repeat(Math.max(0, z.eier)) || "–" : "–"}</b></span>
        <span>Lager <b>{z ? z.stufe : 1}</b></span>
        <span>Rekord <b>{rekord.toLocaleString("de-CH")}</b></span>
      </div>
      {(!z || !z.laeuft) &&
        <div className="sp-ueber">
          {!z && <div className="sp-ueber__text">Die Spänemonster haben sich im Materiallager eingenistet! Finger auf das Drehteil
            in der Schleuder legen, nach hinten ziehen, loslassen. Gussblöcke halten jedem Treffer stand.</div>}
          {z && <div className="sp-ueber__titel">Keine Teile mehr! {z.punkte.toLocaleString("de-CH")} Punkte</div>}
          {z && z.neuerRekord && <div className="sp-ueber__rekord">🏆 Neuer Rekord!</div>}
          <button type="button" className="sp-gross" data-sp="es-start" onClick={starten}>{z ? "Nochmal" : "▶ Start"}</button>
        </div>}
    </div>
  );
}
