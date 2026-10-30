# Index-Maschinen haben keine Backup-Batterien (1.320.3, Patrick 30. Oktober
# 2026): keine Karte auf der Seite der Maschine, kein Hinweis auf der Startseite.
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
    pg = br.new_context(viewport={"width": 1280, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("""() => { TEST.daten.machine_types.find(t => t.id === 't2').name = 'Index C100';
      TEST.daten.machines.forEach(m => { if (m.id === 'm-l6') m.type_id = 't2'; });
      const d = new Date(Date.now() - 86400000);
      const g = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      TEST.daten.maschinen_wartung = [];
      TEST.daten.maschinen_info = [
        { machine_id: 'm-l1', batterie_faellig: g, batterie_hinweis: true },
        { machine_id: 'm-l6', batterie_faellig: g, batterie_hinweis: true }]; }""")
    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(900)
    pg.click("[data-mpark='p1']" if pg.locator("[data-mpark='p1']").count() else "[data-mpark]:has-text('Langdreher')")
    pg.wait_for_timeout(600)
    pg.click("[data-mmaschine='m-l6']"); pg.wait_for_selector(".mseite-maschine"); pg.wait_for_timeout(800)
    pruefe(pg.locator("#mseite-batterie").count() == 0, "Index: keine Backup-Batterien")
    pruefe(pg.locator("#mseite-pad").count() == 1, "Index: Seite sonst da")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    pg.click("[data-mmaschine='m-l1']"); pg.wait_for_selector(".mseite-maschine"); pg.wait_for_timeout(800)
    pruefe(pg.locator("#mseite-batterie").count() == 1, "Star: Backup-Batterien da")
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(1500)
    k = pg.locator("#db-batterien")
    pruefe(k.count() == 1 and "1 Maschine" in k.inner_text(), "Startseite zählt nur die Star")
    pg.click("#db-batterien-liste"); pg.wait_for_selector("#batterie-fenster")
    pruefe(pg.locator("[data-batterie='m-l6']").count() == 0 and pg.locator("[data-batterie='m-l1']").count() == 1,
           "Liste ohne Index")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
