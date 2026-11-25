# Nach dem Neuladen im selben Reiter (1.840.0, Wunsch Patrick 25. November
# 2026: „bei QS springt es einfach zum obersten“): QS → Prüfberichte und
# Lager-Reiter bleiben nach F5 stehen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []

def routen(pg):
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    routen(pg)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/qs", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    knopf = pg.locator("[data-qs='pruefberichte']").first
    if not knopf.count(): fehler.append("Reiter Prüfberichte fehlt")
    else:
        knopf.evaluate('e => e.click()'); pg.wait_for_timeout(800)
        pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(2000)
        aktiv = pg.evaluate("""() => [...document.querySelectorAll('[data-qs].aktiv')].map(e => e.textContent.trim()).join('|')""")
        print("aktiv nach Neuladen:", aktiv[:200])
        if "Prüfberichte" not in aktiv: fehler.append("QS nicht mehr bei Prüfberichte: " + aktiv[:120])
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
