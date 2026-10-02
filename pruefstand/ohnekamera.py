import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1400,"height":950}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.evaluate("document.getElementById('kopf-einstellungen').click()"); pg.wait_for_timeout(1500)
    print("Reiter:", pg.evaluate("[...document.querySelectorAll('[data-einst]')].map(e => e.textContent)"))
    txt = pg.evaluate("document.getElementById('einst-inhalt').innerText")
    print("Allgemein ohne Kameras:", "Kamera" not in txt, "| Mailtext da:", "Bestellmails" in txt, "| Pin da:", "Pin" in txt)
    for r in ("dokumente", "fehler", "farben", "nutzer"):
        if pg.locator(f"[data-einst='{r}']").count():
            pg.locator(f"[data-einst='{r}']").click(); pg.wait_for_timeout(900)
    # Ein alter Link auf den Kamerareiter führt nicht ins Leere
    pg.evaluate("location.hash = '#/einstellungen/kameras'"); pg.wait_for_timeout(1000)
    print("Barcode-Scanner noch da:", pg.evaluate("[...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => (r.selectorText||'').includes('.scanner')); } catch(e) { return false; } })"))
    print("Fehler:", f[:3] if f else "keine")
    br.close()
