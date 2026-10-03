import sys, time, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pruefstand"))
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
AUS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    def seite(b=1600,h=900):
        pg = br.new_context(viewport={"width":b,"height":h}, device_scale_factor=1.5).new_page()
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2500)
        return pg
    pg = seite()
    pg.screenshot(path=f"{AUS}/start.png")
    pg.evaluate("location.hash='#/planwand'"); pg.wait_for_timeout(6500); pg.screenshot(path=f"{AUS}/planwand.png")
    pg.evaluate("location.hash='#/produktion'"); pg.wait_for_timeout(1800)
    pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(500); pg.screenshot(path=f"{AUS}/produktion.png")
    pg.evaluate("document.body.classList.remove('dunkel')")
    pg.evaluate("location.hash='#/bestellungen'"); pg.wait_for_timeout(1800); pg.screenshot(path=f"{AUS}/bestellungen.png")
    pg.evaluate("location.hash='#/rechner'"); pg.wait_for_timeout(1800); pg.screenshot(path=f"{AUS}/rechner.png")
    pg2 = seite(1280, 860)
    pg2.locator("button:has-text('Pad Mode')").first.click(); pg2.wait_for_timeout(1200)
    pg2.locator("#pad [data-padwo='parks']").click(); pg2.wait_for_timeout(1200)
    pg2.screenshot(path=f"{AUS}/pad.png")
    pg2.locator("#pad .pad-kachel").first.click(); pg2.wait_for_timeout(1200); pg2.screenshot(path=f"{AUS}/pad2.png")
    pg2.locator("#pad .pad-kachel").first.click(); pg2.wait_for_timeout(1200); pg2.screenshot(path=f"{AUS}/pad3.png")
    br.close()
