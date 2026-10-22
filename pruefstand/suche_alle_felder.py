# Suche auf der Planwand findet Text aus jedem Feld des Auftrags (seit 1.146.0)
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1440,"height":900}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded"); pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    nr = pg.evaluate("""() => { const j = TEST.daten.jobs.find(x => x.planned_from && !x.ended_at);
      j.abruf_info = 'Abruf Zebrafisch 77'; j.material_platz = 'Regal Kolibri'; return j.job_number; }""")
    def suchen(wort):
        pg.locator("#pw-suche-los").click(); pg.wait_for_timeout(500)
        pg.fill("#su-text", wort); pg.locator("#su-ja").click(); pg.wait_for_timeout(1200)
        t = pg.evaluate("(document.querySelector('.su-leiste__text')||{}).textContent || ''")
        if pg.locator("#su-ende").count(): pg.locator("#su-ende").click(); pg.wait_for_timeout(300)
        return t
    for w in ("zebrafisch", "Kolibri", "gibtsnicht123"):
        t = suchen(w); print(w, "→", t or "(kein Treffer)", "ok" if (nr in t) == (w != "gibtsnicht123") else "FALSCH")
    print("Fehler:", f[:3] if f else "keine")
    br.close()
