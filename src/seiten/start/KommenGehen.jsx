// Kommen / Gehen oben auf der Startseite im neuen Look (seit 1.732.0,
// Wunsch Patrick 23. November 2026: „Will oben auf Start Kommen Gehen
// Button haben“). Stempelt in HOFERTIME genau wie dort der grosse Knopf
// bei den eigenen Zeiten. Nur wer Zeiten erfasst (wie erfasst() in
// Zeiterfassung.jsx), nie Externe, Dienst und Gerätekonten.
import { useEffect, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { stempelLaden, stempeln, stand, uhrzeit } from "../../daten/zeit.js";
import { stempelBildHolen, StempelBild } from "../zeit/stempelBild.jsx";

function erfasst(p) {
  return p && p.id && p.is_active !== false && p.role !== "extern" && p.role !== "dienst" && !p.andere_nutzer && !p.zeit_terminal;
}

export default function KommenGehen() {
  const ich = alt.profil || {};
  const darf = erfasst(ich);
  const [st, setSt] = useState(null);       // { da, letzte } oder null (lädt / fehlt)
  const [laeuft, setLaeuft] = useState(false);
  const [bild, setBild] = useState(null);

  const laden = async () => {
    if (!darf) return;
    try {
      const von = new Date(Date.now() - 20 * 36e5).toISOString();
      const bis = new Date(Date.now() + 60e3).toISOString();
      const s = await stempelLaden(ich.id, von, bis);
      setSt(s === null ? null : stand(s));
    } catch { /* ohne Netz bleibt der letzte Stand */ }
  };
  useEffect(() => {
    laden();
    // Wer am Handy oder am Panel stempelt, soll den Knopf hier richtig sehen
    const t = setInterval(laden, 3 * 60e3);
    const sicht = () => { if (!document.hidden) laden(); };
    document.addEventListener("visibilitychange", sicht);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", sicht); };
  }, [darf]);
  useEffect(() => {
    if (!bild) return;
    const t = setTimeout(() => setBild(null), 3500);
    return () => clearTimeout(t);
  }, [bild]);

  if (!darf || !st) return null;
  const art = st.da ? "gehen" : "kommen";

  async function klick() {
    if (laeuft) return;
    setLaeuft(true);
    const r = await stempeln(art, ich.id);
    setLaeuft(false);
    if (!r) return;
    setSt({ da: art === "kommen", letzte: r });
    alt.meldung((art === "kommen" ? "Eingestempelt " : "Ausgestempelt ") + uhrzeit(r.zeit) + ".", "gut");
    const b = await stempelBildHolen(ich.id);
    if (b) setBild({ name: b, art });
  }

  return (
    <>
      <button type="button" id="sn2-stempel" data-art={art} disabled={laeuft}
        className={"sn2-stempel sn2-stempel--" + art} onClick={klick}
        title={st.da ? "In HOFERTIME ausstempeln" : "In HOFERTIME einstempeln"}>
        <span className="sn2-stempel__punkt" aria-hidden="true" />
        <span className="sn2-stempel__text">{st.da ? "Gehen" : "Kommen"}</span>
        {st.da && st.letzte && <span className="sn2-stempel__seit">da seit {uhrzeit(st.letzte.zeit)}</span>}
      </button>
      {bild && <div className={"ze-bestaetigt ze-bestaetigt--bild ze-bestaetigt--" + bild.art} onClick={() => setBild(null)}>
        <StempelBild name={bild.name} art={bild.art} />
      </div>}
    </>
  );
}
