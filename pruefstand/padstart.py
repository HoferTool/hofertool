import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1490,"height":800}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1200)
    print("Kacheln:", pg.evaluate("[...document.querySelectorAll('#pad .pad-kachel')].map(k => k.innerText.replace(/\\n/g, ' '))"))
    pg.screenshot(path="s_padstart.png")
    pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(1000)
    print("Maschinen geöffnet:", pg.evaluate("document.querySelectorAll('#pad .pad-kachel').length"), "Bereiche")
    print("Fehler:", f[:3] if f else "keine")
    br.close()
