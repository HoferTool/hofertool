import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width":1500,"height":950}, accept_downloads=True)
    pg = ctx.new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.add_init_script("""window.XLSX = { utils: { json_to_sheet: (r) => ({ r }), encode_range: () => 'A1', book_new: () => ({ s: [] }),
      book_append_sheet: (w, s, n) => w.s.push(n) }, writeFile: (w, n) => { window._excel = n; } };""")
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    print("Knöpfe:", pg.evaluate("[...document.querySelectorAll('.pw-eckknoepfe button')].map(b => b.textContent.trim())"))
    # weit wegfahren, dann Heute
    pg.evaluate("""() => { const e = document.getElementById('pw-zeit'); e.value = Number(e.max) - 50; e.dispatchEvent(new Event('input', {bubbles:true})); }""")
    pg.wait_for_timeout(800)
    print("weggefahren, erster Tag:", pg.evaluate("(document.querySelector('.pw-zeile--kopf .pw-tag')||{}).textContent"),
          "| Monat:", pg.evaluate("(document.querySelector('.pw-monat')||{}).textContent"))
    pg.locator("#pw-heute").click(); pg.wait_for_timeout(1000)
    print("nach Heute, erster Tag:", pg.evaluate("(document.querySelector('.pw-zeile--kopf .pw-tag')||{}).textContent"),
          "| Monat:", pg.evaluate("(document.querySelector('.pw-monat')||{}).textContent"),
          "| Heute-Spalte an Stelle:", pg.evaluate("[...document.querySelectorAll('.pw-zeile--kopf .pw-tag')].findIndex(t => t.classList.contains('pw-tag--heute'))"),
          "| Regler mitgezogen:", pg.evaluate("document.getElementById('pw-zeitvon') ? document.getElementById('pw-zeitvon').textContent : 'ok (ohne Beschriftung)'"))
    # Escape schliesst das kleine Infofenster
    b = pg.locator(".pw-balken").first.bounding_box()
    pg.mouse.move(b["x"] + 20, b["y"] + b["height"] / 2); pg.wait_for_timeout(900)
    vor = pg.evaluate("document.querySelectorAll('.pw-info').length")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    print("Infofenster vor/nach Escape:", vor, "/", pg.evaluate("document.querySelectorAll('.pw-info').length"))
    # Backup-Reiter (ohne Planwand-Excel seit 111.108.0)
    pg.mouse.move(5, 5)
    pg.evaluate("document.getElementById('kopf-einstellungen').click()"); pg.wait_for_timeout(1300)
    pg.locator("[data-einst='backup']").click(); pg.wait_for_timeout(800)
    print("Excel-Knopf weg:", pg.locator("#bk-excel").count() == 0)
    print("Fehler:", f[:3] if f else "keine")
    br.close()
