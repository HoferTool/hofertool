// =================================================================
//  HOFERCAM: STEP-Datei am Werkzeug hinterlegen (seit 1.622.0)
//  Im Fenster Werkzeug unter den Massen. Hochladen, dann zeigt ein
//  kleines Bild, wie das Werkzeug in der Simulation steht, mit der
//  Spitze als roter Punkt. Drehen um 90° und Versatz, falls die Datei
//  anders liegt als erwartet. Die Masse oben gelten weiter für das
//  Abtragen, die STEP-Datei ist nur zum Ansehen.
// =================================================================

import { useEffect, useRef, useState } from "react";
import { stepHochladen, stepHolen, stepFertig, stepLokal } from "./camStep.js";
import { alt } from "../../bruecke.jsx";

function Vorschau({ wz, rund }) {
  const cv = useRef(null);
  const url = wz.step.url;
  const [stand, setStand] = useState(() => (stepFertig(url) ? "fertig" : "laden"));
  const [fehler, setFehler] = useState("");
  useEffect(() => {
    if (stepFertig(url)) { setStand("fertig"); return; }
    let weg = false;
    setStand("laden");
    stepHolen(url).then(() => { if (!weg) setStand("fertig"); })
      .catch((f) => { if (!weg) { setStand("fehler"); setFehler((f && f.message) || String(f)); } });
    return () => { weg = true; };
  }, [url]);
  useEffect(() => {
    const c = cv.current, netz = stepFertig(url);
    if (!c || !netz) return;
    const W = 280, H = 200, dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const lokal = stepLokal(netz, wz, rund);
    // Ansicht wie an der Maschine: Z nach links, X nach oben, leicht von
    // vorne oben; Bohrer und Fräser mit der Achse nach oben
    const ka = Math.cos(0.45), sa = Math.sin(0.45), kb = Math.cos(0.5), sb = Math.sin(0.5);
    const proj = (q) => {
      const [x0, y0, t0] = rund ? [q[0], q[2], q[1]] : [-q[0], q[1], q[2]];
      const x1 = x0 * ka + t0 * sa, t1 = -x0 * sa + t0 * ka;
      return { x: x1, y: y0 * kb - t1 * sb, t: y0 * sb + t1 * kb };
    };
    const fl = lokal.map((t) => {
      const p = t.p.map(proj);
      const a = t.p[0], b = t.p[1], d = t.p[2];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(...n) || 1;
      const hell = 0.55 + 0.45 * Math.abs((n[0] * 0.3 + n[1] * 0.6 + n[2] * 0.75) / l);
      return { p, hell, tiefe: (p[0].t + p[1].t + p[2].t) / 3, nah: rund ? t.p.every((q) => q[2] < 6) : t.p.every((q) => Math.hypot(q[0], q[1]) < 4), farbe: t.farbe };
    });
    const xs = fl.flatMap((f) => f.p.map((q) => q.x)), ys = fl.flatMap((f) => f.p.map((q) => q.y));
    const x0 = Math.min(...xs, 0), x1 = Math.max(...xs, 0), y0 = Math.min(...ys, 0), y1 = Math.max(...ys, 0);
    const m = Math.min((W - 24) / ((x1 - x0) || 1), (H - 24) / ((y1 - y0) || 1));
    const P = (q) => ({ x: 12 + (q.x - x0) * m, y: H - 12 - (q.y - y0) * m });
    fl.sort((a, b) => a.tiefe - b.tiefe);
    for (const f of fl) {
      const basis = f.farbe && !(f.farbe[0] === f.farbe[1] && f.farbe[1] === f.farbe[2] && f.farbe[0] > 150) ? f.farbe : f.nah ? [224, 161, 42] : [150, 158, 170];
      const c2 = `rgb(${basis.map((q) => Math.min(255, Math.round(q * f.hell))).join(",")})`;
      g.beginPath();
      f.p.forEach((q, i) => { const s = P(q); if (i) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y); });
      g.closePath(); g.fillStyle = c2; g.strokeStyle = c2; g.lineWidth = 0.6; g.fill(); g.stroke();
    }
    const s = P({ x: 0, y: 0 });
    g.beginPath(); g.arc(s.x, s.y, 4, 0, 2 * Math.PI); g.fillStyle = "#d32f2f"; g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.stroke();
  });
  if (stand === "fehler") return <p className="klein cam-wz__stepfehler" data-camwz-stepfehler>STEP nicht lesbar: {fehler}</p>;
  if (stand === "laden") return <p className="klein" data-camwz-steplaedt>STEP wird gelesen …</p>;
  return <canvas ref={cv} className="cam-wz__stepbild" data-camwz-stepbild style={{ width: 280, height: 200 }}
    aria-label="So steht das Werkzeug in der Simulation, roter Punkt = Spitze" />;
}

export function StepFeld({ wz, art, setze }) {
  const [laedt, setLaedt] = useState(false);
  const datei = useRef(null);
  const rund = art !== "dreh";
  const st = wz.step;
  const neu = (x) => setze({ ...wz, step: x });
  const hoch = async (f) => {
    if (!f) return;
    if (!/\.(step|stp)$/i.test(f.name || "")) { alt.meldung("Bitte eine STEP-Datei (.step oder .stp) wählen.", "warn"); return; }
    setLaedt(true);
    try { neu(await stepHochladen(f)); }
    catch (e) { alt.meldung("STEP-Datei liess sich nicht hochladen: " + ((e && e.message) || e), "fehler"); }
    finally { setLaedt(false); }
  };
  const drehen = (k) => { const d = [...(st.dreh || [0, 0, 0])]; d[k] = ((d[k] || 0) + 1) % 4; neu({ ...st, dreh: d }); };
  const versatz = rund ? [["dz", "längs"], ["dx", "quer 1"], ["dy", "quer 2"]] : [["dz", "Z"], ["dx", "X"], ["dy", "Y"]];
  return (
    <div className="cam-wz__step" data-camwz-step>
      <div className="cam-wz__stepkopf">
        <b>3D-Modell (STEP)</b>
        {!st && <button className="knopf knopf--klein" data-camwz-stepwahl disabled={laedt} onClick={() => datei.current && datei.current.click()}>
          {laedt ? "Wird hochgeladen …" : "STEP-Datei hinterlegen"}</button>}
        {st && <span className="klein cam-wz__stepname" title={st.name}>{st.name}</span>}
        {st && <button className="knopf knopf--klein" data-camwz-stepweg title="STEP-Datei vom Werkzeug entfernen" onClick={() => neu(undefined)}>Entfernen</button>}
        <input ref={datei} type="file" accept=".step,.stp" hidden data-camwz-stepdatei data-ablegen="direkt"
          onChange={(e) => { hoch(e.target.files && e.target.files[0]); e.target.value = ""; }} />
      </div>
      {!st && <p className="klein cam-wz__hinweis">Freiwillig: Eine STEP-Datei des Werkzeugs (z.B. vom Hersteller) ersetzt in der Simulation den gerechneten Körper.</p>}
      {st && <>
        <Vorschau wz={wz} rund={rund} />
        <div className="cam-wz__stepknoepfe" role="group" aria-label="STEP ausrichten">
          {["X", "Y", "Z"].map((a, k) => <button key={a} className="knopf knopf--klein" data-camwz-stepdreh={a}
            title={`Um die STEP-Achse ${a} 90° drehen`} onClick={() => drehen(k)}>↻ {a}</button>)}
          <button className={"knopf knopf--klein" + (st.spiegel ? " aktiv" : "")} data-camwz-stepspiegel title="Spiegeln" onClick={() => neu({ ...st, spiegel: !st.spiegel })}>Spiegeln</button>
          <button className="knopf knopf--klein" data-camwz-stepnull title="Drehen, Spiegeln und Versatz zurücksetzen"
            onClick={() => neu({ url: st.url, pfad: st.pfad, name: st.name })}>Wie gelesen</button>
        </div>
        <div className="cam-wz__stepversatz">
          <span className="klein">Versatz [mm]</span>
          {versatz.map(([n, t]) => (
            <label key={n}><span className="klein">{t}</span>
              <input type="text" inputMode="decimal" data-camwz-step-v={n} value={st[n] ?? ""} placeholder="0"
                onChange={(e) => neu({ ...st, [n]: e.target.value })} /></label>))}
        </div>
        <p className="klein cam-wz__hinweis">{rund
          ? "Erwartet: Achse = STEP-Z, Spitze unten. Roter Punkt = Spitze. Abgetragen wird weiter mit den Massen oben."
          : "Die Spitze sucht die App aus der Schneidenlage (roter Punkt). Steht sie falsch, drehen oder verschieben. Abgetragen wird weiter mit den Massen oben."}</p>
      </>}
    </div>
  );
}
