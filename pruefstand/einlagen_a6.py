# Einlagen Generator 1.489.0 (Wunsch Patrick 11. November 2026): Papierformat 148 × 105 mm (A6 quer).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE + "\nTEST.daten.einlagen = []; TEST.daten.einlagen_werkzeuge = [];"))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/einlagen", wait_until="domcontentloaded")
    pg.wait_for_selector("iframe.einlagen-rahmen", timeout=20000)
    pg.frame_locator("iframe.einlagen-rahmen").locator("h1").wait_for(timeout=15000); pg.wait_for_timeout(2000)
    f = pg.frames[1]
    opt = f.evaluate("[...document.querySelectorAll('#paper option')].map(o => o.value + '|' + o.textContent)")
    pruefe(any(o.startswith("A6|") and "148 × 105" in o for o in opt), "Auswahl hat A6 quer 148 × 105: %s" % opt)
    f.evaluate("(() => { const s = document.getElementById('paper'); s.value = 'A6'; s.dispatchEvent(new Event('change')); })()"); pg.wait_for_timeout(1500)
    d = f.evaluate("(() => { const [W, H, land] = paperDims(); return { W, H, land, leer: st.leer, cw: st.sw, ch: st.sh, txt: document.getElementById('tbSheet').textContent }; })()")
    print(d)
    pruefe(d["W"] == 148 and d["H"] == 105 and d["land"], "leeres Blatt ist 148 × 105 quer")
    pruefe(d["leer"] and d["cw"] > d["ch"], "Blatt liegt quer")
    pruefe("A6 quer" in d["txt"], "Anzeige nennt A6 quer")
    f.evaluate("(() => { const s = document.getElementById('paper'); s.value = 'A4'; s.dispatchEvent(new Event('change')); })()"); pg.wait_for_timeout(1500)
    d = f.evaluate("(() => { const [W, H, land] = paperDims(); return { W, H, land }; })()")
    pruefe(d["W"] == 210 and d["H"] == 297 and not d["land"], "zurück auf A4 hoch: %s" % d)
    pruefe(not pf, "keine Fehler auf der Seite %s" % pf)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
