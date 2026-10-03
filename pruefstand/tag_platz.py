# Tag in der Produktion: Karten im Stil der Woche — Zustand, Nummer,
# Balken für Stand und Ziel, Knöpfe in einer Reihe, grosses Eingabefeld
# mit Tagesleistung. Prüft breit, Tablet und schmal, hell und dunkel.
import time, os, sys
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
AUS = sys.argv[1] if len(sys.argv) > 1 else "."
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for breite, hoehe, dunkel in ((1626, 900, True), (1626, 900, False), (2340, 900, True), (1180, 820, True), (820, 1100, False), (390, 844, True)):
        ctx = br.new_context(viewport={"width": breite, "height": hoehe}, is_mobile=breite < 500, has_touch=breite < 1300)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)))
        pg.on("console", lambda m: fehler.append(m.text) if m.type == "error" else None)
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#produktion", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
        if dunkel: pg.evaluate("document.body.classList.add('dunkel')")
        pg.locator("[data-modus='tag']").click(); pg.wait_for_timeout(1300)
        w = pg.evaluate("""() => {
          const k = document.querySelector('.mkarten');
          const inhalt = k.parentElement.getBoundingClientRect();
          const karten = [...document.querySelectorAll('.mkarte')].map((x) => x.getBoundingClientRect());
          const ueber = karten.filter((r) => r.right > inhalt.right + 1).length;
          return { breite: Math.round(k.getBoundingClientRect().width), platz: Math.round(inhalt.width),
                   spalten: new Set(karten.map((r) => Math.round(r.left))).size, ueber,
                   seiteSchieben: document.documentElement.scrollWidth > innerWidth + 1,
                   balken: document.querySelectorAll('.mkarte .aw-fortschritt').length };
        }""")
        print(breite, "dunkel" if dunkel else "hell", w)
        if w["seiteSchieben"] or w["ueber"]: fehler.append(f"{breite}: zu breit")
        if w["breite"] < w["platz"] - 2: fehler.append(f"{breite}: Platz rechts bleibt leer")
        if breite >= 1600 and w["spalten"] < 3: fehler.append(f"{breite}: nur {w['spalten']} Spalten")
        pg.screenshot(path=os.path.join(AUS, f"tag_{breite}_{'d' if dunkel else 'h'}.png"), full_page=False)
        ctx.close()
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:10])
