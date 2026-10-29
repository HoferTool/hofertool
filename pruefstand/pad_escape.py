# Pad: Escape geht wie „Zurück“ einen Schritt zurück, erst auf dem
# Startbild des Pads schliesst es das Pad ganz (Wunsch Patrick 29. Oktober 2026)
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    wo = lambda: pg.evaluate("document.getElementById('pad') ? (document.querySelector('#pad .pad__titel')||{}).textContent || 'pad' : 'zu'")
    esc = lambda: (pg.mouse.move(5, 5), pg.keyboard.press("Escape"), pg.wait_for_timeout(500))
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    typ = pg.locator("#pad [data-padtyp]").count() > 0
    if typ: pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl")
    # Ein Fenster im Pad: Escape schliesst nur das Fenster
    pg.click("#pad [data-padfeld='stand']", force=True); pg.wait_for_selector("[data-zbja]")
    esc()
    pruefe("Fenster zu, Dashboard bleibt", pg.locator("[data-zbja]").count() == 0 and pg.locator("#pad .pad-stk-zahl").count() == 1)
    esc()
    pruefe("Dashboard → Maschinen", pg.locator("#pad .pad-kachel--maschine").count() > 0 and pg.locator("#pad .pad-stk-zahl").count() == 0)
    if typ:
        esc(); pruefe("Maschinen → Typen", pg.locator("#pad [data-padtyp]").count() > 0)
    esc(); pruefe("→ Parks", pg.locator("#pad [data-park]").count() > 0)
    esc(); pruefe("→ Startbild", pg.locator("#pad [data-padwo='parks']").count() == 1)
    esc(); pruefe("Startbild: Pad ganz zu", pg.locator("#pad").count() == 0)
    pruefe("Keine Frage Abmelden", pg.locator(".dialog-huelle").count() == 0)
    fehler += f
    print("Fehler:", fehler if fehler else "keine")
    br.close()
