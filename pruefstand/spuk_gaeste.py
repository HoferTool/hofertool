# Startseite: Zur Monster-Horde kommen ein Horror-Clown, der mit rotem
# Ballon aus einem Gully steigt, und ein eigener Zug (Clown mit Ballon,
# Zombie-Pfleger mit Sackkarre und Mann in Zwangsjacke mit Beissmaske).
# Wunsch Patrick 1. November 2026, seit 1.326.0. Wartezeiten verkürzt.
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
        gully = zug = False
        for i in range(1500):
            if not gully and pg.evaluate("""() => { const c = document.querySelector('.spuk-gully__clown');
                if (!c) return false; const a = c.getAnimations()[0];
                return a && a.currentTime > a.effect.getTiming().duration * .55; }"""):
                gully = True
                if pg.locator(".spuk-gully__ballon").count() != 1: fehler.append(f"{name}: Gully ohne Ballon")
                if pg.locator(".spuk-gully__loch").count() != 1: fehler.append(f"{name}: kein Gully-Loch")
                pg.locator(".kopfkarte").screenshot(path=f"spuk_gully_{name}.png")
            if not zug and pg.evaluate("""() => { const z = document.querySelector('.spuk-gaeste'); if (!z) return false;
                const r = z.getBoundingClientRect(), k = document.querySelector('.kopfkarte').getBoundingClientRect();
                return r.left > k.left + 5 && r.right < k.right - 5 || (r.width > k.width && r.left < k.left + 20 && r.right > k.right - 20); }"""):
                zug = True
                if pg.locator(".spuk-gaeste .spuk-karre__rad").count() != 2: fehler.append(f"{name}: Sackkarre ohne Rad")
                if pg.locator(".spuk-gaeste .spuk-ballon").count() != 1: fehler.append(f"{name}: Clown ohne Ballon")
                pg.locator(".kopfkarte").screenshot(path=f"spuk_zug_{name}.png")
            if gully and zug: break
            pg.wait_for_timeout(100)
        if not gully: fehler.append(f"{name}: kein Clown aus dem Gully")
        if not zug: fehler.append(f"{name}: kein Zug mit Sackkarre")
        print(name, "Gully", gully, "Zug", zug)
        pg.context.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
