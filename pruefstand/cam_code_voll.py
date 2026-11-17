# HOFERCAM (seit 1.618.0): das Feld NC-Code einer Bearbeitung wächst mit dem
# Code, nichts rollt darin, auch bei langen Zeilen und nach Einfügen.
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
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        ctx.route(u, lambda r: r.abort())
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele"); pg.click("#cam-neu-dreh")
    cb = "[data-block='0'] [data-camblock='code']"
    m = lambda: pg.eval_on_selector(cb, "t => [t.scrollHeight, t.clientHeight, t.getBoundingClientRect().height]")
    h0 = m()[2]
    code = "\n".join(f"G1X{i}.Z-{i}.F0.05" for i in range(60)) + "\n" + "(" + "SEHR LANGER KOMMENTAR " * 20 + ")"
    pg.fill(cb, code); pg.wait_for_timeout(200)
    s, c, h = m()
    pruefe("Feld gewachsen", h > h0 * 5)
    pruefe("Kein Rollen im Feld", s <= c + 1)
    pg.fill(cb, "G0Z1."); pg.wait_for_timeout(200)
    pruefe("Wieder klein", m()[2] <= h0 + 2)
    pg.set_viewport_size({"width": 900, "height": 900}); pg.fill(cb, code); pg.wait_for_timeout(300)
    s, c, h = m()
    pruefe("Schmal: kein Rollen", s <= c + 1)
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
