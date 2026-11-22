# Seitenleiste am Computer (seit 1.708.0): ☰ neben „Pad Mode“ klappt ein und aus,
# keine Kopfzeile oben, die Leiste rollt mit der Seite, das Bild öffnet die Einstellungen.
# Wunsch Patrick 22. November 2026.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
F = FAKE + "\n;(() => { TEST.ohneKopf = true; })();"
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1400,"height":800}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(1200)
    def breite(): return pg.evaluate("Math.round(document.querySelector('.nav').getBoundingClientRect().width)")
    if abs(breite() - 236) > 1: fehler.append(f"Start breite={breite()}")
    if pg.evaluate("(() => { const k = document.querySelector('header.kopf'); return !!k && k.getBoundingClientRect().height > 0; })()"):
        fehler.append("Kopfzeile oben noch sichtbar")
    pg.click("#nav-klapp2"); pg.wait_for_timeout(1000)
    if breite() > 80: fehler.append(f"Einklappen: breite={breite()}")
    pg.click("#nav-klapp2"); pg.wait_for_timeout(1000)
    if abs(breite() - 236) > 1: fehler.append(f"Ausklappen: breite={breite()}")
    # Menü rollt mit
    pg.evaluate("document.querySelector('#inhalt').style.minHeight='3000px'; window.scrollTo(0, 600)"); pg.wait_for_timeout(300)
    top = pg.evaluate("document.querySelector('.nav').getBoundingClientRect().top")
    if top > -100: fehler.append(f"Leiste rollt nicht mit: top={top}")
    pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(200)
    pg.click("#nav-ich"); pg.wait_for_timeout(800)
    if not pg.evaluate("!!document.querySelector('.dialog-huelle, .es')"): fehler.append("Bild öffnet keine Einstellungen")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
