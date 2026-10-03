import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1500,"height":950}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    zaehlen = """() => { const sicht = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return [...document.querySelectorAll('.dialog-huelle, .pw-suche, .hoco-fenster, .seitenfenster, [class*=fenster], [class*=overlay]')]
        .filter(sicht).map(e => e.className.split(' ')[0]); }"""
    def probe(name, oeffnen):
        oeffnen(); pg.wait_for_timeout(900)
        offen = pg.evaluate(zaehlen)
        pg.mouse.move(5, 5); pg.keyboard.press("Escape"); pg.wait_for_timeout(700)
        danach = pg.evaluate(zaehlen)
        print(f"{name:22} offen: {offen} → nach Esc: {danach}")
        # aufräumen, falls offen geblieben
        for _ in range(3):
            if pg.evaluate(zaehlen): pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    probe("Auftrag", lambda: pg.locator(".pw-balken").first.dblclick())
    probe("HOCO Nr.", lambda: pg.locator("#pw-hoco").click())
    probe("Suchen (Planwand)", lambda: pg.locator("#pw-suchen, [id*=suche]").first.click() if pg.locator("#pw-suchen").count() else None)
    probe("Suche über alles", lambda: pg.keyboard.press("Control+k"))
    probe("Ferien eintragen", lambda: pg.locator("[data-fzelle]").nth(3).click())
    print("Fehler:", f[:3] if f else "keine")
    br.close()
