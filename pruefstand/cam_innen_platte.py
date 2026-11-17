# HOFERCAM 3D-Simulation (seit 1.590.0): Drehplatten bei Innenbearbeitung
# kleiner, höchstens 80 % des kleinsten Schneidradius zur Drehmitte hin
# (Wunsch Patrick 17. November 2026). Aussenbearbeitung unverändert.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
S = "/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/"
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    for n, x in [("A", "17"), ("W", "15"), ("B", "1.5"), ("X", "-0.8"), ("S", "3000"), ("Z", "160"), ("F", "0.03")]:
        pg.fill(f"[data-cam='{n}']", x)
    # 0: Aussen drehen mit C-Platte (Lage ur)
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X12.F0.1\nG1Z8.\nG1X17.5")
    pg.click("[data-camwz-auf='0']"); pg.click("[data-camwz-form='C']")
    pg.fill("[data-camwz='r']", "0.4"); pg.click("[data-camwz-sl='ur']")
    pg.click(".cam-wz [title='Schliessen']")
    # 1: Bohren Ø6 von vorne
    pg.click("#cam-neu-front")
    pg.fill("[data-block='1'] [data-camblock='code']", "G1Z12.F0.05\nG0Z0.")
    pg.click("[data-camwz-auf='1']"); pg.click("[data-camwz-form='bohrer']")
    pg.fill("[data-camwz='d']", "6"); pg.fill("[data-camwz='winkel']", "118"); pg.fill("[data-camwz='laenge']", "20")
    pg.click(".cam-wz [title='Schliessen']")
    # 2: Innen ausdrehen mit festem Frontwerkzeug und C-Platte (Lage nach aussen)
    pg.click("#cam-neu-front")
    pg.fill("[data-block='2'] [data-camblock='code']", "G0X7.Z1.\nG1Z0.F0.05\nG1Z4.\nG1X6.\nG0Z-1.")
    pg.click("[data-camwz-auf='2']")
    if pg.locator("[data-camwz-art='dreh']").count(): pg.click("[data-camwz-art='dreh']")
    pg.click("[data-camwz-form='C']"); pg.fill("[data-camwz='r']", "0.2")
    sl = pg.eval_on_selector_all("[data-camwz-sl]", "e => e.map(x => x.dataset.camwzSl)")
    print("Lagen", sl)
    pg.click("[data-camwz-sl='or']")
    pg.click(".cam-wz [title='Schliessen']")
    pg.click("#cam-sim-auf"); pg.wait_for_selector("#cam-sim-bild"); pg.wait_for_timeout(300)
    def platte(i):
        pg.click(f"[data-cam-sim-schritt='{i}']"); pg.wait_for_timeout(250)
        return pg.evaluate("""() => { const c = document.querySelector('#cam-sim-bild'); const w = c.__werkzeuge || [];
          const sp = c.__stand && null; return w.length ? w[0].pts.map((q) => q.r) : null; }""")
    ra = platte(0)
    pruefe("Aussen: Platte voll gross (%.2f mm hoch)" % (max(ra) - min(ra)), ra and max(ra) - min(ra) > 5)
    ri = platte(2)
    print("Innen r von %.2f bis %.2f" % (min(ri), max(ri)))
    pruefe("Innen: Platte bleibt über der Drehmitte (min r %.2f)" % min(ri), ri and min(ri) > 0.3)
    pruefe("Innen: Platte höchstens 80 %% von R3 tief (%.2f)" % (max(ri) - min(ri)), ri and max(ri) - min(ri) <= 3 * 0.8 + 0.25)
    prof = pg.evaluate("() => { const st = document.querySelector('#cam-sim-bild').__stand.k1; const r = []; for (let z = 0; z <= 14; z += 1) r.push([z, +st.innen[Math.round((z - st.z0) / 0.02)].toFixed(2)]); return r; }")
    print("Innen je Z", prof)
    d = dict(prof)
    pruefe("Ausgedreht R3.5 bis Z3", d[1] == 3.5 and d[3] == 3.5)
    pruefe("Dahinter Bohrung R3 unverändert (Z5 %.2f)" % d[5], abs(d[5] - 2.5) < 0.6 and d[5] <= 3)
    pg.locator("#cam-sim").screenshot(path=S + "innen_platte.png")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
