# Artikel: Spalte HOCO Nr. der Spezialwerkzeuge (1.281.0)
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for breite, name in [(1400, "pc"), (390, "handy")]:
        pg = br.new_context(viewport={"width": breite, "height": 900}).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#bestellungen'")
        pg.wait_for_selector("#best-inhalt .bs-pos"); pg.wait_for_timeout(300)
        id0 = pg.evaluate("""() => { const a = TEST.daten.articles; a[0].spezial = true;
          if (a[1]) a[1].spezial = true;
          TEST.daten.spezialwerkzeuge = [{ id: 's1', article_id: a[0].id, hoco_nr: '10007-0415' },
            { id: 's2', article_id: a[0].id, hoco_nr: '10007-0045' }];
          return a[0].id; }""")
        pg.evaluate("document.querySelector(\"[data-unter='bestellungen/artikel']\").click()"); pg.wait_for_timeout(900)
        if name == "pc":
            pruefe("Kopf HOCO Nr.", "HOCO" in pg.inner_text("#ar-liste .bs-tabelle__kopf"))
        t = pg.inner_text(f"[data-arhoco='{id0}']")
        pruefe(name + ": beide HOCO Nr., sortiert", t.index("10007-0045") < t.index("10007-0415"))
        pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/41a7b6b6-e965-5e8b-a14e-1176f24a427b/scratchpad/artikel_hoco_" + name + ".png")
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
