# Fenster beim Drüberfahren frei wählbar (1.923.0, Wunsch Patrick
# 27. November 2026): Ohne Wahl wie bisher; in Einstellungen → Allgemein
# Zeilen ausschalten und umordnen, danach zeigt die Vorschau genau das.
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
    pg.wait_for_selector(".planinfo-wahl", timeout=5000)

def zeilen(pg, jid):
    pg.mouse.move(5, 5); pg.wait_for_timeout(150)
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed(); el.hover(); pg.wait_for_timeout(400)
    return pg.evaluate("[...document.querySelectorAll('.pw-info .pw-info__zeile')].map(d => d.textContent.trim())")

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
    vorher = zeilen(pg, jid)
    pruefe("Standard: Menge zuerst", "Stück" in vorher[0] or "Fertigungsmenge" in vorher[0])
    pruefe("Standard: FA da", any(z.startswith("FA ") or z == "Kein FA vorhanden" for z in vorher))
    pruefe("Standard: Lücken da", pg.locator(".pw-info .pw-info__luecke").count() == 2)

    # Einstellungen öffnen: FA ausschalten, Zustand ganz nach oben
    pg.mouse.move(5, 5)
    oeffne(pg)
    pruefe("16 Zeilen zur Wahl", pg.locator(".planinfo-wahl__zeile").count() == 16)
    pg.locator("[data-planinfo='fa']").uncheck()
    for _ in range(7):
        z = pg.locator(".planinfo-wahl__zeile").filter(has=pg.locator("[data-planinfo='zustand']"))
        z.locator("[aria-label='Nach oben']").click()
    erste = pg.locator(".planinfo-wahl__zeile input").first.get_attribute("data-planinfo")
    pruefe("Zustand steht oben", erste == "zustand")
    wert = pg.evaluate("Object.keys(localStorage).filter(k => k.includes('planInfoFelder')).map(k => localStorage.getItem(k))[0] || ''")
    pruefe("gespeichert ohne FA, Zustand vorne", wert.startswith("zustand,") and ",fa," not in wert)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(600)
    nachher = zeilen(pg, jid)
    pruefe("Zustand jetzt zuerst", bool(nachher) and nachher[0] in vorher and nachher[1] == vorher[0])
    pruefe("FA weg", not any(z.startswith("FA ") or z == "Kein FA vorhanden" for z in nachher))
    pruefe("eine Zeile weniger", len(nachher) == len(vorher) - 1)
    pruefe("Reihenfolge geändert", nachher[0] != vorher[0])

    # Wie am Anfang
    pg.mouse.move(5, 5)
    oeffne(pg)
    pg.locator("[data-planinfo-standard]").click()
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(600)
    pruefe("wieder wie am Anfang", zeilen(pg, jid) == vorher)
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
