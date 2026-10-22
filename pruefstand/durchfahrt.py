# Startseite: Statt der Hühner fährt abwechselnd ein Ferrari und (seit
# 1.151.0) ein Jetski mit Jviano durchs Band oben (Wunsch Patrick 22. Oktober 2026).
# Die Wartezeit zwischen den Fahrten wird hier verkürzt, damit beide
# im Test vorkommen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for name, vp in [("pc", {"width":1300,"height":900}), ("handy", {"width":390,"height":844})]:
        pg = br.new_context(viewport=vp).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        # Wartezeiten zwischen den Fahrten stark kürzen
        pg.add_init_script("""(() => { const st = window.setTimeout;
          window.setTimeout = (f, ms, ...r) => st(f, ms > 10000 ? 300 : ms, ...r); })();""")
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
            content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
                  "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector(".kopfkarte .durchfahrt")
        if pg.locator(".huhn, .huehner").count(): fehler.append("Hühner noch da")
        if "mario" in pg.content().lower() and pg.locator(".fahrt--mario").count(): fehler.append("Mario noch da")
        gesehen = []
        for i in range(400):
            art = pg.evaluate("() => { const f = document.querySelector('.fahrt'); if (!f) return null;"
                " const r = f.getBoundingClientRect(), k = document.querySelector('.kopfkarte').getBoundingClientRect();"
                " return (r.left > k.left + 20 && r.right < k.right - 20) ? f.className : null }")
            if art:
                welcher = "ferrari" if "ferrari" in art else "jetski"
                if not gesehen or gesehen[-1] != welcher:
                    gesehen.append(welcher)
                    pg.locator(".kopfkarte").screenshot(path=f"durchfahrt_{name}_{welcher}_{len(gesehen)}.png")
                if len(gesehen) >= 3: break
            pg.wait_for_timeout(100)
        if len(gesehen) < 3: fehler.append(f"{name}: zu wenige Fahrten: {gesehen}")
        elif any(gesehen[i] == gesehen[i+1] for i in range(len(gesehen)-1)): fehler.append(f"{name}: nicht abwechselnd: {gesehen}")
        print(name, gesehen)
        pg.context.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
