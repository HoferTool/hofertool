# Auftragsfenster frei wählbar (1.931.0, Wunsch Patrick 27. November 2026):
# In Einstellungen → Allgemein Teile ausschalten; ein bestehender Auftrag
# zeigt sie dann nicht mehr, ein neuer Auftrag zeigt immer alles.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

def balken(pg):
    return pg.evaluate("""() => { const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b =>
        b.getBoundingClientRect().width > 60 && b.getBoundingClientRect().y > 200); return b && b.dataset.auftrag; }""")

def oeffne(pg):
    pg.locator("[title='Einstellungen'], #einstellungen-knopf, button:has-text('Einstellungen')").first.click()
    pg.wait_for_selector("[data-auftragwahl]", timeout=5000)

def zeilen(pg, jid):
    pg.mouse.move(5, 5); pg.wait_for_timeout(150)
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed(); el.hover(); pg.wait_for_timeout(400)
    return pg.evaluate("[...document.querySelectorAll('.pw-info .pw-info__zeile')].map(d => d.textContent.trim())")

def oeffnen(pg, jid):
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed()
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_selector("#pl-zustand"); pg.wait_for_timeout(400)

def zu(pg):
    pg.locator("#pl-nein").click(); pg.wait_for_timeout(300)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = balken(pg)
    pruefe("Balken gefunden", bool(jid))
    oeffnen(pg, jid)
    pruefe("Standard: FA da", pg.locator("#pl-fa-nr").count() == 1)
    pruefe("Standard: Dokumente da", pg.locator(".auf-dokumente").count() == 1)
    zu(pg)

    oeffne(pg)
    pruefe("17 Teile zur Wahl", pg.locator("[data-auftragwahl]").count() == 17)
    for k in ["fa", "zeichnung", "dokumente", "matinfo", "stueckzeit", "notiz"]:
        pg.locator(f"[data-auftragwahl='{k}']").uncheck()
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(600)
    oeffnen(pg, jid)
    pruefe("FA weg", pg.locator("#pl-fa-nr").count() == 0)
    pruefe("Notiz weg", pg.locator("#pl-notiz").count() == 0)
    pruefe("Zustand und Menge noch da", pg.locator("#pl-zustand").count() == 1 and pg.locator("#pl-menge").count() == 1)
    pruefe("rechte Spalte weg", pg.locator(".auf-spalte--zeichnung").count() == 0
           and pg.locator(".auf-raster--ohne-rechts").count() == 1)
    breit = pg.evaluate("[document.querySelector('.dialog--auftrag').scrollWidth, document.querySelector('.dialog--auftrag').clientWidth]")
    pruefe("kein seitliches Rollen", breit[0] <= breit[1] + 1)
    # Speichern ohne Änderung bleibt möglich
    pg.screenshot(path="/tmp/claude-0/-home-user/f10c9bb7-0410-5cf9-ae3d-34907fdeb4b9/scratchpad/af.png")
    zu(pg)

    oeffne(pg)
    pg.locator("[data-auftragwahl-standard]").click()
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(600)
    oeffnen(pg, jid)
    pruefe("wieder alles da", pg.locator("#pl-fa-nr").count() == 1 and pg.locator(".auf-dokumente").count() == 1
           and pg.locator("#pl-notiz").count() == 1)
    zu(pg)
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
