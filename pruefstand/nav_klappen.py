# Seitenleiste ein- und ausklappen mit Auftritt (seit 1.114.0):
# Ablauf als Bilder, hell und dunkel, und am Ende sauberer Zustand.
# Seit 1.116.0 weich, dazu abwechselnd Späne, Huhn und Eier (klappFx.js).
import sys, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
ZIEL = sys.argv[1] if len(sys.argv) > 1 else None
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
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(1200)
    def breite(): return pg.evaluate("document.querySelector('.nav').getBoundingClientRect().width")
    for modus in ["hell", "dunkel"]:
        if modus == "dunkel": pg.evaluate("document.body.classList.add('dunkel')")
        for richtung, zeiten in [("zu", [150, 400, 700, 1000, 1400, 2000]), ("auf", [150, 400, 700, 1000, 1400, 2000]),
                                 ("zu", [150, 400, 700, 1000, 1400, 2000]), ("auf", [150, 400, 700, 1000, 1400, 2000])]:
            pg.click("#nav-klapp"); t0 = time.time()
            art = pg.evaluate("document.querySelector('.kfx')?.dataset.art || ''")
            if art not in ("spaene", "huhn", "eier"): fehler.append("Bildchen fehlt: " + str(art))
            for i, ms in enumerate(zeiten):
                warte = ms/1000 - (time.time() - t0)
                if warte > 0: time.sleep(warte)
                if ZIEL: pg.screenshot(path=f"{ZIEL}/k-{modus}-{art}-{i}.png", clip={"x":0,"y":0,"width":400,"height":800})
            pg.wait_for_timeout(900)
            if pg.locator(".kfx").count(): fehler.append("Bildchen bleibt liegen")
            schmal = pg.evaluate("document.body.classList.contains('nav--schmal')")
            rest = pg.evaluate("[...document.body.classList].filter(c => c.startsWith('nav--klappt'))")
            if rest: fehler.append(f"{richtung}: Klasse bleibt {rest}")
            b = breite()
            if richtung == "zu" and (not schmal or abs(b - 62) > 1): fehler.append(f"zu: schmal={schmal} breite={b}")
            if richtung == "auf" and (schmal or abs(b - 208) > 1): fehler.append(f"auf: schmal={schmal} breite={b}")
    # Schneller Doppelklick endet sauber
    pg.click("#nav-klapp"); pg.wait_for_timeout(100); pg.click("#nav-klapp"); pg.wait_for_timeout(1300)
    if pg.evaluate("document.body.classList.contains('nav--schmal')") or abs(breite() - 208) > 1:
        fehler.append("Doppelklick: nicht wieder breit")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
