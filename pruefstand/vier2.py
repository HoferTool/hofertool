import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.jobs.forEach(j => { j.drawing_url = 'https://x.supabase.co/storage/v1/object/public/zeichnungen/z.pdf'; });"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
def seite(br, w=1440, h=900):
    pg = br.new_context(viewport={"width":w,"height":h}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2500)
    return pg, f
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg, f = seite(br)
    pg.screenshot(path="s_start.png", clip={"x": 200, "y": 50, "width": 1240, "height": 300})
    pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(1500)
    pg.locator("[data-modus='woche']").click(); pg.wait_for_timeout(1300)
    r = pg.locator(".raster--woche").bounding_box()
    pg.screenshot(path="s_woche.png", clip={"x": r["x"], "y": r["y"], "width": min(1000, r["width"]), "height": 330})
    pg.close()
    pg, f2 = seite(br, 1180, 820)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1200)
    pg.locator("#pad >> text=Maschinen").first.click(); pg.wait_for_timeout(1000)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1000)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1500)
    pg.locator("#pad [data-padreiter='zeichnung']").first.click(); pg.wait_for_timeout(1200)
    print("Betrachter:", pg.evaluate("(document.querySelector('.betrachter__titel')||{}).textContent"),
          "| Knöpfe:", pg.evaluate("[...document.querySelectorAll('.betrachter__knoepfe .knopf')].map(k => k.textContent)"),
          "| PDF:", pg.evaluate("(document.querySelector('.betrachter iframe')||{}).src||'—'").split('#')[1] if pg.evaluate("!!document.querySelector('.betrachter iframe')") else "—")
    pg.screenshot(path="s_pad.png")
    pg.locator(".betrachter [data-zu]").click(); pg.wait_for_timeout(800)
    print("nach Schliessen:", pg.evaluate("(document.querySelector('#pad .pad__titel')||{}).textContent"))
    print("Fehler:", (f + f2)[:3] if (f + f2) else "keine")
    br.close()
