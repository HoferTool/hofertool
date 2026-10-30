// =================================================================
//  SPIELE IM PAUSENRAUM
//  Wunsch Patrick 30. Oktober 2026: „kannst du auch 2–3 Spiele auf den
//  Bildschirm packen, es ist ein Touchscreen“, dazu „eine Liste zur
//  Auswahl wäre auch gut“. Eine Kachel mit Inhalt „Spiel“ öffnet entweder
//  ein Spiel direkt oder die Liste aller Spiele.
//
//  Eigene Spiele, keine Nachbauten bekannter Spiele:
//  - Tic Tac Toe (drei in einer Reihe), zu zweit oder gegen den Computer
//  - Klötzli: Steine aus 1 bis 5 Feldern fallen, volle Reihen verschwinden
//  - Hühnerhof: das Huhn pickt alle Körner, der Fuchs jagt es
//  - Flatterhuhn: Hühner flattern vorbei, antippen gibt Punkte („und noch
//    Moorhuhn“, Patrick)
//  - Eierschleuder: mit der Schleuder Eier auf Füchse auf Kisten („und
//    Angry Birds“, Patrick)
//  Alles mit grossen Knöpfen für den Finger; Rekorde je Gerät im
//  localStorage (darf fehlen, dann eben ohne Rekord).
// =================================================================
import { useCallback, useEffect, useRef, useState } from "react";

export const SPIELE = [
  { id: "dreigewinnt", name: "Tic Tac Toe", zeichen: "⭕", text: "Drei in einer Reihe. Zu zweit oder gegen den Computer." },
  { id: "kloetzli", name: "Klötzli", zeichen: "🧱", text: "Steine fallen, volle Reihen verschwinden." },
  { id: "huehnerhof", name: "Hühnerhof", zeichen: "🐔", text: "Das Huhn pickt alle Körner. Pass auf den Fuchs auf!" },
  { id: "flatterhuhn", name: "Flatterhuhn", zeichen: "🪶", text: "Hühner flattern vorbei. Tipp sie an, 90 Sekunden lang." },
  { id: "eierschleuder", name: "Eierschleuder", zeichen: "🥚", text: "Schleuder spannen und die Füchse von den Kisten werfen." },
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
        <div className="sp-start__titel">⭕ Tic Tac Toe ❌</div>
        <div className="sp-start__knoepfe">
          <button type="button" className="sp-gross" data-sp="ttt-zwei" onClick={() => setArt("zwei")}>👥 Zu zweit</button>
          <button type="button" className="sp-gross" data-sp="ttt-computer" onClick={() => setArt("computer")}>🤖 Gegen Computer</button>
        </div>
      </div>
    );
  }
  const g = Math.floor(Math.min(hoehe - 20, breite - 760) / 3);
  const namen = art === "computer" ? { X: "Du", O: "Computer" } : { X: "Spieler ❌", O: "Spieler ⭕" };
  return (
    <div className="sp-ttt" data-sp="ttt">
      <div className="sp-ttt__feld" style={{ gridTemplateColumns: `repeat(3, ${g}px)`, gridAutoRows: g + "px" }}>
        {f.map((v, i) => (
          <button type="button" key={i} data-sp={"ttt-" + i}
            className={"sp-ttt__zelle" + (v ? " sp-ttt__zelle--" + v : "") + (w && w.reihe.includes(i) ? " sp-ttt__zelle--sieg" : "")}
            style={{ fontSize: g * 0.7 }} onPointerDown={(e) => { e.preventDefault(); setzen(i); }}>
            {v === "X" ? "✕" : v === "O" ? "◯" : ""}</button>
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
const STEINE = [
  { teile: [[0, 0]], farbe: "#f59e0b" },
  { teile: [[0, 0], [1, 0]], farbe: "#10b981" },
  { teile: [[0, 0], [1, 0], [2, 0]], farbe: "#3b82f6" },
  { teile: [[0, 0], [1, 0], [0, 1]], farbe: "#ef4444" },
  { teile: [[0, 0], [1, 0], [2, 0], [1, 1]], farbe: "#a855f7" },
  { teile: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], farbe: "#ec4899" },
  { teile: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]], farbe: "#06b6d4" },
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
            style={c ? { "--sf": c } : undefined} />
        ))}
        {(!z || z.aus) &&
          <div className="sp-ueber">
            {z && z.aus && <div className="sp-ueber__titel">Fertig! {z.punkte.toLocaleString("de-CH")} Punkte</div>}
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
          ? <div key={x + "-" + y} className="sp-hof__zaun" style={{ left: x * k, top: y * k }} />
          : z && z.koerner.has(y * HB + x)
            ? <div key={x + "-" + y} className="sp-hof__korn" style={{ left: x * k, top: y * k }} />
            : null))}
        {z && <div className={"sp-hof__tier sp-hof__huhn" + (z.huhn.r === "rechts" ? " sp-hof__tier--rechts" : "")}
          data-sp="huhn" style={{ left: z.huhn.x * k, top: z.huhn.y * k }}>🐔</div>}
        {z && z.fuechse.map((f, i) => <div key={i} className="sp-hof__tier sp-hof__fuchs" style={{ left: f.x * k, top: f.y * k }}>🦊</div>)}
        {(!z || z.aus) &&
          <div className="sp-ueber">
            {!z && <div className="sp-ueber__text">Pick alle Körner auf! Steuern mit Wischen oder den Pfeilen.</div>}
            {z && z.aus && <div className="sp-ueber__titel">Der Fuchs war schneller! {z.punkte.toLocaleString("de-CH")} Punkte</div>}
            {z && z.neuerRekord && <div className="sp-ueber__rekord">🏆 Neuer Rekord!</div>}
            <button type="button" className="sp-gross" data-sp="hof-start" onClick={starten}>{z ? "Nochmal" : "▶ Start"}</button>
          </div>}
      </div>
      <div className="sp-seite">
        <div className="sp-zahlen">
          <div><span>Punkte</span><b data-sp="hof-punkte">{z ? z.punkte.toLocaleString("de-CH") : 0}</b></div>
          <div><span>Leben</span><b>{z ? "🐔".repeat(Math.max(0, z.leben)) || "–" : "🐔🐔🐔"}</b></div>
          <div><span>Hof</span><b>{z ? z.stufe : 1}</b></div>
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

function zeichneHuhn(g, x, y, s, flug, links) {
  g.save();
  g.translate(x, y);
  if (links) g.scale(-1, 1);
  g.scale(s, s);
  g.fillStyle = "#f8fafc"; g.strokeStyle = "#1e293b"; g.lineWidth = 3;
  g.beginPath(); g.ellipse(0, 0, 34, 26, 0, 0, Math.PI * 2); g.fill(); g.stroke();      // Bauch
  g.beginPath(); g.moveTo(-30, -6); g.lineTo(-52, -22); g.lineTo(-44, 4); g.closePath(); g.fill(); g.stroke(); // Schwanz
  g.beginPath(); g.arc(30, -22, 16, 0, Math.PI * 2); g.fill(); g.stroke();              // Kopf
  g.fillStyle = "#dc2626";
  g.beginPath(); g.arc(26, -40, 6, 0, Math.PI * 2); g.arc(34, -40, 6, 0, Math.PI * 2); g.fill(); // Kamm
  g.beginPath(); g.ellipse(40, -10, 4, 7, 0, 0, Math.PI * 2); g.fill();                 // Kehllappen
  g.fillStyle = "#f59e0b";
  g.beginPath(); g.moveTo(44, -26); g.lineTo(58, -21); g.lineTo(44, -16); g.closePath(); g.fill(); // Schnabel
  g.fillStyle = "#1e293b"; g.beginPath(); g.arc(35, -25, 3.2, 0, Math.PI * 2); g.fill(); // Auge
  g.fillStyle = "#e2e8f0";                                                               // Flügel
  g.beginPath(); g.moveTo(-6, -4);
  g.quadraticCurveTo(-4, -4 - 44 * flug, 22, -6 - 30 * flug); g.quadraticCurveTo(12, 4, -6, -4);
  g.fill(); g.stroke();
  g.restore();
}

function zeichneFuchs(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = "#ea580c"; g.strokeStyle = "#431407"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-30, -10); g.lineTo(-24, -42); g.lineTo(-8, -20);
  g.lineTo(8, -20); g.lineTo(24, -42); g.lineTo(30, -10); g.lineTo(0, 26); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#fff7ed";
  g.beginPath(); g.moveTo(-18, 2); g.lineTo(0, 26); g.lineTo(18, 2); g.lineTo(0, 8); g.closePath(); g.fill();
  g.fillStyle = "#1c1917";
  g.beginPath(); g.arc(-11, -6, 4, 0, Math.PI * 2); g.arc(11, -6, 4, 0, Math.PI * 2); g.arc(0, 22, 4, 0, Math.PI * 2); g.fill();
  g.restore();
}

function zeichneLandschaft(g, b, h) {
  const himmel = g.createLinearGradient(0, 0, 0, h);
  himmel.addColorStop(0, "#7dd3fc"); himmel.addColorStop(1, "#e0f2fe");
  g.fillStyle = himmel; g.fillRect(0, 0, b, h);
  g.fillStyle = "#fde68a"; g.beginPath(); g.arc(b - 160, 120, 60, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#86efac";
  g.beginPath(); g.moveTo(0, h * 0.78);
  for (let x = 0; x <= b + 40; x += 40) g.lineTo(x, h * 0.74 + Math.sin(x / 210) * 30);
  g.lineTo(b + 40, h); g.lineTo(0, h); g.fill();
  g.fillStyle = "#4ade80"; g.fillRect(0, h - 70, b, 70);
}

// ----------------------------- Flatterhuhn -----------------------------
const FH_DAUER = 90;

function Flatterhuhn({ breite, hoehe }) {
  const cv = useRef(null);
  const s = useRef(null);
  const [, neu] = useState(0);
  const [rekord, setRekord] = useState(() => rekordLesen("flatterhuhn"));
  const b = Math.floor(breite), h = Math.floor(hoehe - 4);

  const starten = () => { s.current = { huehner: [], federn: [], punkte: 0, treffer: 0, ende: Date.now() + FH_DAUER * 1000, laeuft: true, naechstes: 0 }; neu((n) => n + 1); };

  useEffect(() => {
    let rahmen, zuletzt = performance.now(), anzeige = -1;
    const schritt = (jetzt) => {
      const dt = Math.min(0.05, (jetzt - zuletzt) / 1000); zuletzt = jetzt;
      const c = cv.current, z = s.current;
      if (!c) return;
      const g = c.getContext("2d");
      zeichneLandschaft(g, b, h);
      if (z) {
        if (z.laeuft) {
          z.naechstes -= dt;
          if (z.naechstes <= 0) {
            // Ferne Hühner sind kleiner, schneller und geben mehr Punkte
            const tiefe = Math.random(), links = Math.random() < 0.5;
            const gr = 0.55 + tiefe * 1.0;
            z.huehner.push({ x: links ? b + 80 : -80, y: 90 + Math.random() * (h * 0.55), gr, links,
              v: (260 + (1 - tiefe) * 260) * (links ? -1 : 1), welle: Math.random() * 6, punkte: gr < 0.8 ? 25 : gr < 1.2 ? 10 : 5 });
            z.naechstes = 0.35 + Math.random() * 0.7;
          }
          if (Date.now() >= z.ende) {
            z.laeuft = false;
            if (rekordMerken("flatterhuhn", z.punkte)) { z.neuerRekord = true; setRekord(z.punkte); }
            neu((n) => n + 1);
          }
        }
        z.huehner = z.huehner.filter((u) => u.x > -150 && u.x < b + 150);
        z.huehner.sort((p, q) => p.gr - q.gr);
        for (const u of z.huehner) {
          u.x += u.v * dt; u.welle += dt * 5;
          zeichneHuhn(g, u.x, u.y + Math.sin(u.welle) * 18, u.gr, (Math.sin(u.welle * 3) + 1) / 2, u.links);
        }
        z.federn = z.federn.filter((f) => (f.zeit -= dt) > 0);
        for (const f of z.federn) {
          f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt;
          g.globalAlpha = Math.min(1, f.zeit);
          if (f.text) { g.fillStyle = "#1d4ed8"; g.font = "bold 44px system-ui"; g.fillText(f.text, f.x, f.y); }
          else { g.fillStyle = "#fff"; g.beginPath(); g.ellipse(f.x, f.y, 10, 4, f.vx / 200, 0, Math.PI * 2); g.fill(); }
          g.globalAlpha = 1;
        }
        const rest = z.laeuft ? Math.ceil((z.ende - Date.now()) / 1000) : 0;
        if (rest !== anzeige) { anzeige = rest; neu((n) => n + 1); }
      }
      rahmen = requestAnimationFrame(schritt);
    };
    rahmen = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(rahmen);
  }, [b, h]);

  const tippen = (e) => {
    const z = s.current;
    if (!z || !z.laeuft) return;
    const p = canvasPunkt(cv.current, e);
    // vorderste zuerst (grösste liegen oben)
    for (let i = z.huehner.length - 1; i >= 0; i--) {
      const u = z.huehner[i], yy = u.y + Math.sin(u.welle) * 18;
      if (Math.abs(p.x - u.x) < 50 * u.gr && Math.abs(p.y - yy + 10 * u.gr) < 42 * u.gr) {
        z.huehner.splice(i, 1);
        z.punkte += u.punkte; z.treffer++;
        for (let k = 0; k < 10; k++) z.federn.push({ x: u.x, y: yy, vx: (Math.random() - 0.5) * 400, vy: -Math.random() * 300, zeit: 1.2 });
        z.federn.push({ x: u.x - 20, y: yy - 40, vx: 0, vy: -60, zeit: 1, text: "+" + u.punkte });
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
        <span>Rekord <b>{rekord}</b></span>
      </div>
      {(!z || !z.laeuft) &&
        <div className="sp-ueber">
          {!z && <div className="sp-ueber__text">Tipp die Hühner an! Kleine, ferne geben mehr Punkte.</div>}
          {z && <div className="sp-ueber__titel">Zeit um! {z.punkte} Punkte, {z.treffer} Hühner</div>}
          {z && z.neuerRekord && <div className="sp-ueber__rekord">🏆 Neuer Rekord!</div>}
          <button type="button" className="sp-gross" data-sp="fh-start" onClick={starten}>{z ? "Nochmal" : "▶ Start"}</button>
        </div>}
    </div>
  );
}

// ---------------------------- Eierschleuder ----------------------------
const KISTE = 72;
const SCHWERE = 900;

// Ein Hof: Türme aus Kisten (manche aus Stein, die halten), oben Füchse
function hofBauen(stufe, b, boden) {
  const tuerme = [], anzahl = Math.min(5, 2 + Math.floor(stufe / 2));
  const x0 = b * 0.5, platz = (b - 120 - x0) / anzahl;
  for (let i = 0; i < anzahl; i++) {
    const hoch = 1 + Math.floor(Math.random() * Math.min(6, 2 + stufe));
    const kisten = Array.from({ length: hoch }, () => ({ stein: Math.random() < Math.min(0.35, 0.08 * stufe), y: 0 }));
    tuerme.push({ x: x0 + platz * i + platz / 2, kisten, fuchs: i === 0 || Math.random() < 0.7 ? { gefallen: 0, y: 0 } : null });
  }
  // Ziel-Höhen setzen (ohne Animation beim Aufbau)
  for (const t of tuerme) {
    t.kisten.forEach((k, j) => { k.y = boden - (j + 1) * KISTE; });
    if (t.fuchs) t.fuchs.y = boden - t.kisten.length * KISTE - 34;
  }
  return tuerme;
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
    let rahmen, zuletzt = performance.now();
    const schritt = (jetzt) => {
      const dt = Math.min(0.033, (jetzt - zuletzt) / 1000); zuletzt = jetzt;
      const c = cv.current, z = s.current;
      if (!c) return;
      const g = c.getContext("2d");
      zeichneLandschaft(g, b, h);
      g.fillStyle = "#a16207"; g.fillRect(0, boden, b, 8);
      // Schleuder
      g.strokeStyle = "#78350f"; g.lineWidth = 16; g.lineCap = "round";
      g.beginPath(); g.moveTo(sch.x, boden); g.lineTo(sch.x, sch.y + 50); g.lineTo(sch.x - 34, sch.y);
      g.moveTo(sch.x, sch.y + 50); g.lineTo(sch.x + 34, sch.y); g.stroke();
      zeichneHuhn(g, 110, boden - 26, 0.9, 0.2, false);
      if (z) {
        // Kisten und Füchse rutschen auf ihre Höhe
        let wirdGefallen = false;
        for (const t of z.tuerme) {
          t.kisten.forEach((k, j) => {
            const ziel = boden - (j + 1) * KISTE;
            if (k.y < ziel) { k.y = Math.min(ziel, k.y + 700 * dt); wirdGefallen = true; }
            g.fillStyle = k.stein ? "#94a3b8" : "#d97706"; g.strokeStyle = k.stein ? "#334155" : "#78350f"; g.lineWidth = 4;
            g.fillRect(t.x - KISTE / 2, k.y, KISTE, KISTE); g.strokeRect(t.x - KISTE / 2 + 2, k.y + 2, KISTE - 4, KISTE - 4);
            if (!k.stein) { g.beginPath(); g.moveTo(t.x - KISTE / 2 + 6, k.y + 6); g.lineTo(t.x + KISTE / 2 - 6, k.y + KISTE - 6); g.stroke(); }
          });
          if (t.fuchs) {
            const ziel = boden - t.kisten.length * KISTE - 34;
            if (t.fuchs.y < ziel) { t.fuchs.y = Math.min(ziel, t.fuchs.y + 700 * dt); wirdGefallen = true; }
            zeichneFuchs(g, t.x, t.fuchs.y, 1.1);
          }
        }
        // Gespannte Schleuder
        const spitze = z.zug ? z.zug : z.ei ? null : (z.eier > 0 && z.laeuft ? sch : null);
        if (spitze) {
          g.strokeStyle = "#451a03"; g.lineWidth = 6;
          g.beginPath(); g.moveTo(sch.x - 34, sch.y); g.lineTo(spitze.x, spitze.y); g.lineTo(sch.x + 34, sch.y); g.stroke();
          ei(g, spitze.x, spitze.y);
          if (z.zug) { // Zielhilfe: ein paar Punkte der Flugbahn
            const vx = (sch.x - z.zug.x) * 6.5, vy = (sch.y - z.zug.y) * 6.5;
            g.fillStyle = "rgba(30,41,59,.45)";
            for (let k = 1; k <= 8; k++) { const t = k * 0.07; g.beginPath(); g.arc(z.zug.x + vx * t, z.zug.y + vy * t + SCHWERE * t * t / 2, 6, 0, Math.PI * 2); g.fill(); }
          }
        }
        // Fliegendes Ei
        if (z.ei) {
          const e = z.ei;
          e.vy += SCHWERE * dt; e.x += e.vx * dt; e.y += e.vy * dt;
          ei(g, e.x, e.y);
          let weg = e.x > b + 50 || e.y > boden - 12;
          for (const t of z.tuerme) {
            if (weg) break;
            if (t.fuchs && Math.hypot(e.x - t.x, e.y - t.fuchs.y) < 46) {
              t.fuchs = null; z.punkte += 500; z.splat.push({ x: e.x, y: e.y, zeit: 1.2, text: "+500" }); weg = true; break;
            }
            for (let j = t.kisten.length - 1; j >= 0; j--) {
              const k = t.kisten[j];
              if (Math.abs(e.x - t.x) < KISTE / 2 + 12 && e.y > k.y - 12 && e.y < k.y + KISTE + 12) {
                if (!k.stein) {
                  t.kisten.splice(j, 1); z.punkte += 50;
                  if (t.fuchs) { t.fuchs.gefallen++; }
                }
                z.splat.push({ x: e.x, y: e.y, zeit: 1 });
                weg = true; break;
              }
            }
          }
          if (weg) { if (e.y > boden - 12) z.splat.push({ x: e.x, y: boden - 6, zeit: 1 }); z.ei = null; neu((n) => n + 1); }
        }
        // Wer zweimal fällt, rennt davon
        for (const t of z.tuerme) if (t.fuchs && t.fuchs.gefallen >= 2 && !wirdGefallen) {
          z.splat.push({ x: t.x, y: t.fuchs.y - 30, zeit: 1.2, text: "+500" }); t.fuchs = null; z.punkte += 500; neu((n) => n + 1);
        }
        z.splat = z.splat.filter((p) => (p.zeit -= dt) > 0);
        for (const p of z.splat) {
          g.globalAlpha = Math.min(1, p.zeit);
          if (p.text) { g.fillStyle = "#1d4ed8"; g.font = "bold 48px system-ui"; g.fillText(p.text, p.x - 50, p.y - (1.2 - p.zeit) * 60); }
          else { g.fillStyle = "#fef9c3"; g.beginPath(); g.ellipse(p.x, p.y, 30, 14, 0, 0, Math.PI * 2); g.fill();
            g.fillStyle = "#facc15"; g.beginPath(); g.arc(p.x, p.y, 9, 0, Math.PI * 2); g.fill(); }
          g.globalAlpha = 1;
        }
        // Hof leer oder keine Eier mehr
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
  const runter = (e) => {
    const z = s.current;
    if (!z || !z.laeuft || z.ei || z.eier <= 0) return;
    const p = canvasPunkt(cv.current, e);
    if (p.x > b * 0.45) return;
    cv.current.setPointerCapture && cv.current.setPointerCapture(e.pointerId);
    z.zug = zugBegrenzen(p);
  };
  const zugBegrenzen = (p) => {
    const dx = p.x - sch.x, dy = p.y - sch.y, l = Math.hypot(dx, dy), max = 170;
    return l > max ? { x: sch.x + dx / l * max, y: sch.y + dy / l * max } : p;
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
        <span>Eier <b data-sp="es-eier">{z ? "🥚".repeat(Math.max(0, z.eier)) || "–" : "–"}</b></span>
        <span>Hof <b>{z ? z.stufe : 1}</b></span>
        <span>Rekord <b>{rekord.toLocaleString("de-CH")}</b></span>
      </div>
      {(!z || !z.laeuft) &&
        <div className="sp-ueber">
          {!z && <div className="sp-ueber__text">Finger aufs Ei legen, nach hinten ziehen, loslassen. Graue Kisten sind aus Stein.</div>}
          {z && <div className="sp-ueber__titel">Keine Eier mehr! {z.punkte.toLocaleString("de-CH")} Punkte</div>}
          {z && z.neuerRekord && <div className="sp-ueber__rekord">🏆 Neuer Rekord!</div>}
          <button type="button" className="sp-gross" data-sp="es-start" onClick={starten}>{z ? "Nochmal" : "▶ Start"}</button>
        </div>}
    </div>
  );
}

function ei(g, x, y) {
  g.fillStyle = "#fffbeb"; g.strokeStyle = "#92400e"; g.lineWidth = 3;
  g.beginPath(); g.ellipse(x, y, 17, 22, 0, 0, Math.PI * 2); g.fill(); g.stroke();
}
