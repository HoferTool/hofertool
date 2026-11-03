# Startseite „Systemzustand“ (1.382.0, Wunsch Patrick 3. November 2026:
# „Wenn Sicherung nicht gemacht wurde melden“): nur wenn etwas nicht
# stimmt. Alles frisch: keine Karte. Alte Sicherung, Pool-Rechner still,
# Fehler beim Drucken: Karte mit genau diesen Zeilen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """(() => {
  const iso = (ms) => new Date(Date.now() - ms).toISOString();
  const s = (k, w) => daten.app_config.push({ schluessel: k, wert: JSON.stringify(w) });
  s("sicherung", { geraet: { id: "x", name: "Pool" } });
  s("sicherung_status", { letzte: { zeit: iso(3600e3) }, fehler: null });
  s("planwand_archiv", { geraet: { id: "x" } });
  s("planwand_archiv_status", { letzte: { zeit: iso(3600e3) }, fehler: null });
  s("dok_pool_status", { zeit: iso(5 * 60e3), fehler: null });
  s("druck_status", { gesehen: iso(60e3), fehler: null });
})();
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("window.OHNE_SITZUNG = false;")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2500)
    if pg.evaluate("!!document.querySelector('#db-systemzustand')"): fehler.append("Karte steht da, obwohl alles frisch ist")
    # Sicherung 2 Tage alt, Pool-Rechner seit 2 Stunden still, Druckfehler
    pg.evaluate("""(() => {
      const iso = (ms) => new Date(Date.now() - ms).toISOString();
      const setz = (k, w) => { TEST.daten.app_config.find(x => x.schluessel === k).wert = JSON.stringify(w); };
      setz("sicherung_status", { letzte: { zeit: iso(48 * 3600e3) }, fehler: null });
      setz("dok_pool_status", { zeit: iso(2 * 3600e3), fehler: null });
      setz("druck_status", { gesehen: iso(60e3), fehler: "Drucker offline" });
    })()""")
    pg.evaluate("location.hash = '#/planwand'"); pg.wait_for_timeout(800)
    pg.evaluate("location.hash = '#/'"); pg.wait_for_timeout(2000)
    was = pg.evaluate("[...document.querySelectorAll('[data-system]')].map(x => x.dataset.system)")
    print("Meldungen:", was)
    if was != ["Sicherung", "Pool-Rechner", "Drucken"]: fehler.append(f"Zeilen: {was}")
    txt = pg.evaluate("(document.querySelector('#db-systemzustand') || {}).innerText || ''")
    if "Tagen" not in txt and "Stunden" not in txt: fehler.append("Alter fehlt: " + txt[:120])
    pg.locator("#db-systemzustand").screenshot(path="/tmp/systemzustand.png")
    fehler += f; pg.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
