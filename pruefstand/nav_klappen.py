# Seitenleiste am Computer (seit 1.707.0): sie klappt nie mehr ein,
# Wunsch Patrick 22. November 2026: „menu reiter sollen nicht mehr eingeklappt werden“.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1400,"height":800}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    # Eine früher gespeicherte schmale Leiste darf nicht mehr wirken
    pg.add_init_script("try{localStorage.setItem('navschmal','1')}catch(e){}")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(1200)
    def breite(): return pg.evaluate("document.querySelector('.nav').getBoundingClientRect().width")
    def schmal(): return pg.evaluate("document.body.classList.contains('nav--schmal')")
    if schmal() or abs(breite() - 236) > 1: fehler.append(f"Start: schmal={schmal()} breite={breite()}")
    sichtbar = pg.evaluate("(() => { const k = document.getElementById('nav-klapp'); if (!k) return false; const r = k.getBoundingClientRect(); return r.width > 0 && getComputedStyle(k).display !== 'none'; })()")
    if sichtbar:
        pg.click("#nav-klapp"); pg.wait_for_timeout(900)
        if schmal() or abs(breite() - 236) > 1: fehler.append(f"Nach ☰: schmal={schmal()} breite={breite()}")
    # Auch über die Klasse von aussen gesetzt bleibt nichts hängen nach Seitenwechsel
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
    if schmal(): fehler.append("Seitenwechsel: schmal")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
