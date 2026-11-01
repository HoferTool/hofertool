# Startseite: Statt der umziehenden Hühner schlurft eine Horde Zombies und
# Halloween-Kreaturen mit einem Sarg auf Rädern über den Friedhof im Band
# oben (Wunsch Patrick 1. November 2026, seit 1.324.0). Die Wartezeit
# zwischen den Horden wird hier verkürzt.
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
        pg.add_init_script("""(() => { const st = window.setTimeout;
          window.setTimeout = (f, ms, ...r) => st(f, ms > 4000 ? 300 : ms, ...r); })();""")
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
            content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
                  "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector(".kopfkarte .durchfahrt")
        if not pg.locator(".kopfkarte .spuk-erde").count(): fehler.append(f"{name}: keine Erde")
        gesehen, richtung, staub, rauch = [], set(), False, False
        letzte = None
        for i in range(900):
            info = pg.evaluate("""() => { const z = document.querySelector('.spuk'); if (!z) return null;
                const r = z.getBoundingClientRect(), k = document.querySelector('.kopfkarte').getBoundingClientRect();
                return { mitte: r.left + r.width / 2 > k.left + k.width * .3 && r.left + r.width / 2 < k.right - k.width * .3,
                         links: r.left, unten: k.bottom - r.bottom, hoch: k.height, oben: r.top - k.top,
                         el: z.dataset.n || (z.dataset.n = String(Math.random())) } }""")
            # Dreck an den Rädern und Dunst aus dem Sarg, irgendwann unterwegs
            staub = staub or pg.locator(".spuk-dreck").count() > 0
            rauch = rauch or pg.locator(".spuk-dunst").count() > 0
            if info and info["mitte"] and info["el"] not in gesehen:
                gesehen.append(info["el"])
                if pg.locator(".fahrt, .fahrt-meer, .fahrt-geld").count(): fehler.append(f"{name}: Jetski noch da")
                if pg.locator(".spuk .spuk-sarg .spuk-sarg__rad").count() != 2: fehler.append(f"{name}: Sarg ohne Räder")
                n = pg.locator(".spuk .spuk-kreatur").count()
                if n < 4: fehler.append(f"{name}: zu wenige Kreaturen ({n})")
                if pg.locator(".spuk .spuk-kreatur--zieht").count() != 2: fehler.append(f"{name}: keine zwei Zugzombies")
                if pg.locator(".spuk .spuk-kette path").count() != 2: fehler.append(f"{name}: keine Kette zum Sarg")
                if not (0 <= info["unten"] <= info["hoch"] * .2): fehler.append(f"{name}: Zug nicht auf der Erde ({info['unten']:.0f})")
                if info["oben"] < -2: fehler.append(f"{name}: Zug ragt oben aus dem Band ({info['oben']:.0f})")
                # Bewegt er sich, und in welche Richtung?
                a = info["links"]; pg.wait_for_timeout(500)
                b = pg.evaluate("() => { const z = document.querySelector('.spuk'); return z ? z.getBoundingClientRect().left : null }")
                if b is None or abs(b - a) < 2: fehler.append(f"{name}: Zug steht")
                else: richtung.add("rechts" if b > a else "links")
                pg.locator(".kopfkarte").screenshot(path=f"durchfahrt_{name}_{len(gesehen)}.png")
                if pg.locator(".kopfkarte .umzug, .kopfkarte .umzug-huhn").count(): fehler.append(f"{name}: Hühner noch da")
                if not pg.locator(".kopfkarte .spuk-grab").count(): fehler.append(f"{name}: keine Grabsteine")
                if len(gesehen) >= 2: break
            pg.wait_for_timeout(100)
        if len(gesehen) < 2: fehler.append(f"{name}: zu wenige Horden: {len(gesehen)}")
        if not staub: fehler.append(f"{name}: kein Dreck")
        if not rauch: fehler.append(f"{name}: kein Dunst aus dem Sarg")
        print(name, len(gesehen), "Horden", sorted(richtung))
        pg.context.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
