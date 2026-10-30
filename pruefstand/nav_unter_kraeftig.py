# Unterpunkte im Menü kräftig (1.320.1, Patrick 30. Oktober 2026: „nicht so
# durchsichtig, sondern wie früher“): „created by Ecker“ (.nav__zusatz) darf
# die Unterpunkte (.nav__unter) nicht blass und klein machen.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("IB_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for dunkel in (False, True):
        pg = br.new_page(viewport={"width": 1400, "height": 900}, color_scheme="dark" if dunkel else "light")
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#/bestellungen", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
        if dunkel: pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(300)
        w = "dunkel" if dunkel else "hell"
        s = pg.evaluate("""() => { const u = document.querySelector('.nav__unter'); if (!u) return null;
            const c = getComputedStyle(u), t = getComputedStyle(u.querySelector('.nav__unterpunkt'));
            return { op: c.opacity, fs: t.fontSize, zusatz: getComputedStyle(document.querySelector('.nav__zusatz') || u).opacity } }""")
        pruefe(s is not None, w + ": Unterpunkte da")
        if s:
            pruefe(s["op"] == "1", w + ": Unterpunkte nicht durchsichtig (%s)" % s["op"])
            pruefe(float(s["fs"].replace("px", "")) >= 13, w + ": Schrift nicht verkleinert (%s)" % s["fs"])
            pruefe(s["zusatz"] == "0.55", w + ": „created by Ecker“ bleibt blass (%s)" % s["zusatz"])
        pg.locator("nav, .nav").first.screenshot(path=BILD + "/nav-unter-%s.png" % w)
        pg.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
