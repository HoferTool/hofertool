# Einkaufsliste als Fenster der Startseite statt eigener Reiter (seit 1.313.0,
# Wunsch Patrick 30. Oktober 2026)
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
    for breite, hoehe in [(1440, 900), (390, 844)]:
        pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#/dashboard", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
        pg.evaluate("""TEST.daten.shopping_items.push({ id: 'e1', text: 'Kaffeebohnen', menge: '2 kg', laden: 'Migros',
          prio: 2, is_done: false, created_by: 'u1', created_at: '2026-10-20T08:00:00Z' })""")
        pg.evaluate("location.hash = '#/planwand'"); pg.wait_for_timeout(800)
        pg.evaluate("location.hash = '#/dashboard'"); pg.wait_for_selector("#db-einkauf .karte"); pg.wait_for_timeout(500)
        w = str(breite)
        pruefe(w + ": kein Reiter Einkauf", pg.locator("[href='#/einkauf'], [data-pfad='einkauf']").count() == 0
               and "Einkauf" not in pg.evaluate("[...document.querySelectorAll('nav')].map(n => n.innerText).join(' ')"))
        pg.click("#db-einkauf h2"); pg.wait_for_timeout(800)
        pruefe(w + ": Fenster offen", pg.locator("#ek-fenster").count() == 1)
        pruefe(w + ": Startseite bleibt", "dashboard" in pg.evaluate("location.hash"))
        pruefe(w + ": Eintrag im Fenster", pg.locator("#ek-fenster [data-ek='e1']").count() == 1)
        # Abhaken im Fenster, nach Schliessen ist die Karte leer
        pg.click("[data-ekfertig='e1']"); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(800)
        pruefe(w + ": abgehakt", pg.evaluate("TEST.daten.shopping_items.find(z => z.id === 'e1').is_done") is True)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
        pruefe(w + ": Escape schliesst", pg.locator("#ek-fenster").count() == 0)
        pruefe(w + ": Karte aufgefrischt", "Kaffeebohnen" not in pg.inner_text("#db-einkauf"))
        # Alter Verweis öffnet das Fenster
        pg.evaluate("location.hash = '#/einkauf'"); pg.wait_for_timeout(1200)
        pruefe(w + ": #/einkauf öffnet Fenster", pg.locator("#ek-fenster").count() == 1)
        pruefe(w + ": ohne JS-Fehler " + "; ".join(f), not f)
        fehler += f; pg.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
