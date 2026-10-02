import time, sys
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
breite, hoehe = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (1600, 900)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1000)
    pg.screenshot(path=f"w1_{breite}.png")
    pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(1000)
    pg.screenshot(path=f"w2_{breite}.png")
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1000)
    pg.screenshot(path=f"w3_{breite}.png")
    print("Fehler:", f[:2] if f else "keine")
    br.close()
