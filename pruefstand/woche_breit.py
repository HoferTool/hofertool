import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for breite in (2340, 1280):
        pg = br.new_context(viewport={"width": breite, "height": 900}).new_page()
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#produktion", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
        pg.locator("[data-modus='woche']").click(); pg.wait_for_timeout(1300)
        print(breite, "px Bildschirm — Tabelle:", pg.evaluate("Math.round(document.querySelector('.raster--woche').getBoundingClientRect().width)"),
              "| Tag:", pg.evaluate("Math.round(document.querySelector('.raster--woche tbody td:not(.fest)').getBoundingClientRect().width)"),
              "| seitwärts schieben nötig:", pg.evaluate("(() => { const r = document.querySelector('.rasterrolle'); return r.scrollWidth > r.clientWidth + 2; })()"))
        if breite == 2340:
            r = pg.locator(".karte--raster").bounding_box()
            pg.screenshot(path="s_woche_breit.png", clip={"x": r["x"], "y": r["y"], "width": r["width"], "height": 300})
        pg.close()
    br.close()
