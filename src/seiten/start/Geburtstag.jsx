// =================================================================
//  STARTSEITE · Geburtstag im blauen Band
//  Hat jemand Geburtstag, steht statt des Logos die Person in der
//  Mitte: grosses Profilbild, daneben ein kleiner Kuchen mit dem Alter,
//  Name und Geburtsdatum. Das Band wird dafür höher, und dahinter
//  fallen Konfetti und steigen Raketen. Wer am Gerät „weniger
//  Bewegung“ eingestellt hat, sieht das Konfetti still.
// =================================================================
import { useEffect, useRef } from "react";
import { alt } from "../../bruecke.jsx";

export function GeburtstagMitte({ kinder }) {
  return (
    <div className={"geb-mitte" + (kinder.length > 1 ? " geb-mitte--mehrere" : "")} id="geb-mitte">
      {kinder.map((m, i) => (
        <div className="geb-person" key={m.name + i} style={{ "--i": i }}>
          {m.bild
            ? <img className="geb-bild" src={m.bild} alt="" />
            : <span className="geb-bild geb-bild--leer">{m.name.charAt(0).toUpperCase()}</span>}
          <div className="geb-angaben">
            <div className="geb-kuchen" aria-label={m.alter + " Jahre"}>
              <span className="geb-alter">{m.alter}</span>
              <Kuchen />
            </div>
            <div className="geb-name">{vorname(m.name)}</div>
            <div className="geb-datum">{alt.langDatum(m.geboren)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Nur der Vorname. Steht statt eines Namens nur die Mailadresse da
// (etwa „vorname.nachname“), gilt der Teil vor dem Punkt.
function vorname(name) {
  const erster = String(name || "").trim().split(/[\s.@]+/)[0] || "";
  return erster.charAt(0).toUpperCase() + erster.slice(1);
}

// Ein kleiner Kuchen mit Kerze. Bewusst schlicht: Lesbar soll vor
// allem die Zahl darüber sein.
function Kuchen() {
  return (
    <svg className="geb-torte" viewBox="0 0 64 52" aria-hidden="true">
      <rect x="30" y="2" width="4" height="12" rx="1.5" fill="#fff" />
      <path className="geb-flamme" d="M32 -6 C36 0 35 4 32 4 C29 4 28 0 32 -6 Z" fill="#ffd166" />
      <rect x="8" y="16" width="48" height="14" rx="4" fill="#ffb3c7" />
      <path d="M8 22 q4 6 8 0 q4 6 8 0 q4 6 8 0 q4 6 8 0 q4 6 8 0 q4 6 8 0 V20 a4 4 0 0 0 -4 -4 H12 a4 4 0 0 0 -4 4 Z" fill="#fff" />
      <rect x="2" y="30" width="60" height="18" rx="4" fill="#f78c6b" />
      <path d="M2 36 q5 6 10 0 q5 6 10 0 q5 6 10 0 q5 6 10 0 q5 6 10 0 q5 6 10 0 V34 a4 4 0 0 0 -4 -4 H6 a4 4 0 0 0 -4 4 Z" fill="#ffe3ec" />
      <rect x="0" y="47" width="64" height="4" rx="2" fill="rgba(255,255,255,.55)" />
    </svg>
  );
}

const FARBEN = ["#ffd166", "#ef476f", "#06d6a0", "#4cc9f0", "#ffffff", "#f78c6b", "#c77dff"];
const zufall = (a, b) => a + Math.random() * (b - a);

// Konfetti und Feuerwerk auf einer Leinwand hinter dem Inhalt des
// Bands. Eine Leinwand statt vieler Elemente, damit die Startseite auch
// auf dem Fernseher im Büro flüssig bleibt. Im Hintergrund-Tab hält
// der Browser die Bewegung von selbst an.
export function Konfetti() {
  const ref = useRef(null);
  useEffect(() => {
    const leinwand = ref.current;
    const ctx = leinwand.getContext && leinwand.getContext("2d");
    if (!ctx) return undefined;
    const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let b = 0, h = 0;
    const messen = () => {
      const r = leinwand.getBoundingClientRect();
      b = r.width; h = r.height;
      leinwand.width = Math.round(b * dpr); leinwand.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    messen();

    const teil = (oben) => ({
      x: zufall(0, b), y: oben ? zufall(-40, -8) : zufall(0, h),
      vx: zufall(-0.3, 0.3), vy: zufall(0.35, 1.1), w: zufall(5, 10), hh: zufall(3, 6),
      dreh: zufall(0, 6.3), vdreh: zufall(-0.08, 0.08), phase: zufall(0, 6.3),
      farbe: FARBEN[Math.floor(Math.random() * FARBEN.length)],
    });
    const anzahl = () => Math.round(Math.max(30, Math.min(120, b / 9)));
    const teile = Array.from({ length: anzahl() }, () => teil(false));
    const raketen = [];
    const funken = [];


    const konfettiZeichnen = (dt) => {
      for (const p of teile) {
        if (dt) {
          p.phase += 0.05 * dt;
          p.x += (p.vx + Math.sin(p.phase) * 0.35) * dt;
          p.y += p.vy * dt;
          p.dreh += p.vdreh * dt;
          if (p.y > h + 10) Object.assign(p, teil(true));
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.dreh);
        // Das Kippen um die eigene Achse lässt das Papier flattern
        ctx.scale(1, Math.cos(p.phase));
        ctx.fillStyle = p.farbe;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(-p.w / 2, -p.hh / 2, p.w, p.hh);
        ctx.restore();
      }
    };

    const beobachter = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
      // Neue Grösse leert die Leinwand; das stille Konfetti neu malen
      messen();
      if (ruhig) konfettiZeichnen(0);
    }) : null;
    if (beobachter) beobachter.observe(leinwand);

    const zuenden = () => {
      raketen.push({ x: zufall(b * 0.08, b * 0.92), y: h + 4, ziel: zufall(h * 0.12, h * 0.5),
        vy: -zufall(3.2, 4.4), farbe: FARBEN[Math.floor(Math.random() * FARBEN.length)] });
    };
    const platzen = (r) => {
      const n = 34;
      for (let i = 0; i < n; i++) {
        const w = (i / n) * Math.PI * 2, v = zufall(1.2, 2.8);
        funken.push({ x: r.x, y: r.y, vx: Math.cos(w) * v, vy: Math.sin(w) * v, leben: 1,
          farbe: Math.random() < 0.25 ? "#ffffff" : r.farbe });
      }
    };

    let bild = 0, letzte = performance.now(), naechste = letzte + 600;
    const schritt = (t) => {
      const dt = Math.min(3, (t - letzte) / 16.7);
      letzte = t;
      ctx.clearRect(0, 0, b, h);
      konfettiZeichnen(dt);

      if (t > naechste) { zuenden(); naechste = t + zufall(1200, 3200); }
      for (let i = raketen.length - 1; i >= 0; i--) {
        const r = raketen[i];
        r.y += r.vy * dt;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = r.farbe;
        ctx.fillRect(r.x - 1, r.y, 2, 8);
        if (r.y <= r.ziel) { platzen(r); raketen.splice(i, 1); }
      }
      for (let i = funken.length - 1; i >= 0; i--) {
        const s = funken[i];
        s.vx *= 0.975; s.vy = s.vy * 0.975 + 0.035 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.leben -= 0.014 * dt;
        if (s.leben <= 0) { funken.splice(i, 1); continue; }
        ctx.globalAlpha = s.leben;
        ctx.fillStyle = s.farbe;
        ctx.beginPath(); ctx.arc(s.x, s.y, 1.9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      bild = requestAnimationFrame(schritt);
    };

    if (ruhig) konfettiZeichnen(0);
    else bild = requestAnimationFrame(schritt);
    return () => { cancelAnimationFrame(bild); if (beobachter) beobachter.disconnect(); };
  }, []);
  return <canvas className="geb-konfetti" ref={ref} aria-hidden="true" />;
}
