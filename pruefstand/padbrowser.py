# Pad: Stück am Abend und Browser teilen sich eine Reihe (1.14.0).
# Tablet: Link öffnet einen neuen Tab; Computer: eigenes Fenster.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
f = []
def lauf(p, touch, name, start=False):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width":1180,"height":820}, device_scale_factor=2,
                         has_touch=touch, is_mobile=touch)
    ctx.route("**://www.google.ch/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<p>Google</p>"))
    pg = ctx.new_page()
    # App auf dem Startbildschirm des iPads (1.20.0): navigator.standalone
    if start: pg.add_init_script("Object.defineProperty(navigator, 'standalone', { get: () => true })")
    pg.on("pageerror", lambda e: f.append(str(e)[:220]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**",
              "**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    for el in pg.query_selector_all("#pad [data-park]"):
        if "Lang" in (el.inner_text() or ""): el.click(); break
    pg.wait_for_timeout(1200)
    i = pg.evaluate("""() => [...document.querySelectorAll('#pad .pad-kachel--maschine')]
      .findIndex(k => !k.innerText.includes('kein Auftrag'))""")
    pg.locator("#pad .pad-kachel--maschine").nth(max(0,i)).click(); pg.wait_for_timeout(2500)
    r = pg.evaluate("""() => { const a=document.querySelector('.pad-karte2--abend').getBoundingClientRect(),
       b=document.querySelector('.pad-karte2--browser').getBoundingClientRect();
       return {gleicheZeile: Math.abs(a.top-b.top)<2, aB: Math.round(a.width), bB: Math.round(b.width), h: Math.round(a.height)}; }""")
    print(name, "Reihe:", r)
    if not (r["gleicheZeile"] and abs(r["aB"]-r["bB"])<3): f.append(name+": Kacheln nicht nebeneinander")
    pg.screenshot(path=f"padbrowser-{name}.png")
    if start:
        # Ohne neuen Tab: im selben Fenster, das iOS über der App zeigt
        seiten = len(ctx.pages)
        pg.locator(".pad-karte2--browser").click(); pg.wait_for_timeout(1500)
        print(name, "geöffnet:", pg.url)
        if len(ctx.pages) != seiten: f.append(name + ": neuer Tab statt Fenster über der App")
        if "google" not in pg.url: f.append(name + ": kein Google")
        br.close(); return
    with ctx.expect_page(timeout=5000) as neu:
        pg.locator(".pad-karte2--browser").click()
    print(name, "geöffnet:", neu.value.url, "| Grösse:", neu.value.evaluate("[innerWidth, innerHeight]"))
    if "google" not in neu.value.url: f.append(name+": kein Google")
    br.close()
with sync_playwright() as p:
    lauf(p, True, "tablet")
    lauf(p, False, "computer")
    # Seit 1.20.2 auch vom Startbildschirm wieder ein neuer Tab (Safari)
    lauf(p, True, "startbildschirm")
print("Fehler:", f[:3] if f else "keine")
