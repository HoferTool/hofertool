# Startseite „Laufend ohne WBG“ (1.246.0, Wunsch Patrick 28. Oktober 2026):
# laufende Aufträge der eigenen Parks ohne WBG. Rüsten und Aufträge mit
# WBG stehen nicht da, externe Parks auch nicht; Tipp öffnet den Auftrag.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """(() => {
  daten.jobs.forEach((j) => { if (j.plan_status === "laeuft" || j.plan_status === "ruesten") j.plan_status = "geplant"; });
  const a = daten.jobs.find((j) => j.machine_id === "m-k1");
  const b = daten.jobs.find((j) => j.machine_id === "m-l1");
  a.plan_status = "laeuft"; a.wbg_url = null;
  b.plan_status = "laeuft"; b.wbg_url = "https://x/wbg.pdf";
  daten.machine_parks.push({ id: "p-ext", name: "Extern", is_active: true });
  const x = daten.jobs.find((j) => j.machine_id === "m-k2");
  daten.machines.forEach((m) => { if (m.id === "m-k2") m.park_id = "p-ext"; });
  x.plan_status = "laeuft"; x.wbg_url = null;
  window.A = a.id; window.B = b.id; window.X = x.id;
})();
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for breite, hoehe, name in [(1440, 900, "pc"), (390, 844, "handy")]:
        pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.add_init_script("window.OHNE_SITZUNG = false;")
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2500)
        ids = pg.evaluate("[...document.querySelectorAll('[data-ohnewbg]')].map(b => b.dataset.ohnewbg)")
        a, b, x = pg.evaluate("[window.A, window.B, window.X]")
        print(name, "ohne WBG:", ids)
        if ids != [a]: fehler.append(f"{name}: {ids} statt nur {a}")
        pg.locator("#db-ohnewbg").screenshot(path=f"/tmp/ohnewbg-{name}.png")
        if name == "pc":
            pg.click(f"[data-ohnewbg='{a}']"); pg.wait_for_timeout(1500)
            if not pg.evaluate("!!document.querySelector('.dialog--auftrag')"): fehler.append("Auftragsfenster geht nicht auf")
            sel = pg.evaluate("(document.querySelector('.dialog--auftrag select option:checked[value=m-k1]') || {}).value")
            if sel != "m-k1": fehler.append(f"Maschine im Fenster: {sel}")
            pg.screenshot(path="/tmp/ohnewbg-fenster.png")
            # Alle mit WBG: keine Karte
            pg.evaluate(f"TEST.daten.jobs.find(j => j.id === '{a}').wbg_url = 'https://x/a.pdf'")
            pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            pg.evaluate("location.hash = '#/planwand'"); pg.wait_for_timeout(800)
            pg.evaluate("location.hash = '#/'"); pg.wait_for_timeout(1500)
            if pg.evaluate("!!document.querySelector('#db-ohnewbg')"): fehler.append("Karte steht trotz WBG da")
        fehler += f; pg.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
