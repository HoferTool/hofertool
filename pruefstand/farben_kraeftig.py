# Planwand: Die Balken sind kräftig gefärbt (111.46.0). Auf dunklen
# Farben wie Blau steht weisse Schrift, auf hellen wie Gelb schwarze,
# hell und dunkel gut lesbar. Der rote Punkt „keine Menge“ hat einen
# hellen Rand, damit er auch auf Rot sichtbar ist.
import os, sys, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILDER = os.environ.get("BILDER_ORDNER", "/tmp")
fehler = []
def pruefe(name, ok, info=""):
    print(("ok   " if ok else "FALSCH ") + name, info)
    if not ok: fehler.append(name)

MESSEN = """() => {
  const rgb = (s) => (s.match(/\\d+(\\.\\d+)?/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => { const l = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b); };
  const kontrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const satt = ([r, g, b]) => { const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2;
    return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)); };
  return [...document.querySelectorAll('.pw-balken:not(.pw-balken--fertig)')].map((b) => {
    const hg = rgb(getComputedStyle(b).backgroundColor);
    const nr = b.querySelector('.pw-balken__nr');
    const hell = (Math.max(...hg) + Math.min(...hg)) / 510;
    return { id: b.dataset.auftrag, hg, satt: satt(hg), hell,
             kontrast: kontrast(hg, rgb(getComputedStyle(nr).color)) };
  });
}"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 820}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(1500)
    for modus in ["hell", "dunkel"]:
        if modus == "dunkel":
            pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(400)
        werte = pg.evaluate(MESSEN)
        bunte = [w for w in werte if w["satt"] > 0.2]
        pruefe(modus + ": Balken gefunden", len(werte) > 5, len(werte))
        pruefe(modus + ": bunte Balken satt (Sättigung > 0.6)", bunte and min(w["satt"] for w in bunte) > 0.6,
               round(min(w["satt"] for w in bunte), 2) if bunte else "")
        # Früher wurde jede Farbe zu Pastell aufgehellt (Helligkeit um 0.7)
        pruefe(modus + ": bunte Balken nicht pastell (Helligkeit < 0.6)", bunte and max(w["hell"] for w in bunte) < 0.6,
               round(max(w["hell"] for w in bunte), 2) if bunte else "")
        pruefe(modus + ": Schrift lesbar (Kontrast >= 4)", min(w["kontrast"] for w in werte) >= 4,
               round(min(w["kontrast"] for w in werte), 2))
        pg.screenshot(path=os.path.join(BILDER, "planwand-farben-" + modus + ".png"))
    # Blau: weisse Schrift, Gelb: schwarze
    schrift = pg.evaluate("""() => {
      const s = {};
      document.querySelectorAll('.pw-balken:not(.pw-balken--fertig)').forEach((b) => {
        const j = (TEST.daten.jobs || []).find((x) => x.id === b.dataset.auftrag);
        if (j && !s[j.color]) s[j.color] = getComputedStyle(b.querySelector('.pw-balken__nr')).color;
      });
      return s;
    }""")
    pruefe("Blau mit weisser Schrift", schrift.get("blau") == "rgb(255, 255, 255)", schrift.get("blau"))
    pruefe("Gelb mit schwarzer Schrift", schrift.get("gelb") not in (None, "rgb(255, 255, 255)"), schrift.get("gelb"))
    punkt = pg.locator(".pw-balken__statusgross--ohnematerial")
    if punkt.count():
        pruefe("Roter Punkt mit hellem Rand", "255, 255, 255" in punkt.first.evaluate("e => getComputedStyle(e).textShadow"))
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
