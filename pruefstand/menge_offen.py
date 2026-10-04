# Bestellungen: Unter „Offen“ lässt sich die Menge direkt in der Zeile
# ändern (Minus, Feld, Plus), unter „Bestellt“ nicht. Startseite: Der
# Geburtstag zeigt Vor- und Nachname, auch wenn nur der Anmeldename da ist.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
DATEN = """
const d = TEST.daten;
d.order_items.push(
 { id: "m1", article_id: "a1", supplier_id: "s1", quantity: 20, status: "offen", created_by: "u1",
   created_at: "2026-09-28T08:00:00Z" },
 { id: "m2", article_id: "a1", supplier_id: "s1", quantity: 40, status: "bestellt", created_by: "u1",
   created_at: "2026-09-20T08:00:00Z" });
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
    # Geburtstag: Anmeldename wird zu Vor- und Nachname
    pg.evaluate("""() => { const u = TEST.daten.profiles[0]; u.full_name = 'saheesan.hudson';
      const h = new Date(); u.geburtstag = (h.getFullYear() - 30) + '-' + String(h.getMonth()+1).padStart(2,'0') + '-' + String(h.getDate()).padStart(2,'0'); }""")
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_timeout(500)
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_selector(".geb-name", timeout=8000); pg.wait_for_timeout(500)
    pruefe("Band mit Vor- und Nachname", pg.inner_text(".geb-name").strip() == "Saheesan Hudson")
    pruefe("Karte mit Vor- und Nachname", "Saheesan Hudson" in pg.inner_text("#db-geburtstage"))

    pg.evaluate(DATEN)
    pg.evaluate("location.hash='#bestellungen'"); pg.wait_for_selector("#best-inhalt .bs-pos"); pg.wait_for_timeout(400)
    menge = lambda: pg.evaluate("TEST.daten.order_items.find(x => x.id === 'm1').quantity")
    pruefe("Mengenfeld in Offen", pg.locator("[data-menge='m1']").count() == 1)
    pg.click("[data-mplus='m1']"); pg.click("[data-mplus='m1']"); pg.wait_for_timeout(1000)
    pruefe("Plus zweimal: 22", menge() == 22 and pg.input_value("[data-menge='m1']") == "22")
    pg.click("[data-mminus='m1']"); pg.wait_for_timeout(1000)
    pruefe("Minus: 21", menge() == 21)
    pg.fill("[data-menge='m1']", "150"); pg.press("[data-menge='m1']", "Enter"); pg.wait_for_timeout(500)
    pruefe("Eintippen: 150", menge() == 150)
    pg.fill("[data-menge='m1']", "0"); pg.press("[data-menge='m1']", "Enter"); pg.wait_for_timeout(500)
    pruefe("Nie unter 1", menge() == 1 and pg.locator("[data-mminus='m1']").is_disabled())
    pg.screenshot(path="/tmp/claude-0/-home-claude-hofertool/ac5a1233-94ed-5390-be12-011144ed9f22/scratchpad/menge.png",
                  clip=pg.locator(".bs-lieferant").first.bounding_box())
    pg.click("[data-best='bestellt']"); pg.wait_for_timeout(500)
    pruefe("In Bestellt kein Feld", pg.locator("[data-menge]").count() == 0 and "40" in pg.inner_text("#best-inhalt"))
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
