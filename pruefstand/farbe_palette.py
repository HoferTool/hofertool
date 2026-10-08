# Materialfarben nur aus der Palette (Wunsch 5. Oktober 2026): Im
# Auftragsfenster gibt es keinen freien Farbwähler mehr. Neue Farben
# gibt es nur in den Einstellungen (Wunsch 8. Oktober 2026, vorher "+"
# im Auftragsfenster). Ein alter
# Auftrag mit eigener Farbe bekommt beim Bearbeiten die nächstliegende
# Palettenfarbe vorgeschlagen, gespeichert erst mit "Speichern".
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

def oeffnen(pg, jid):
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed()
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    # Ein Auftrag bekommt eine alte, frei gewählte Farbe (fast Rot)
    jid = pg.evaluate("""() => { const j = TEST.daten.planwand.find(j => !j.ended_at && j.plan_status !== 'fertig');
      j.color = '#b8281f'; return j.id; }""")
    pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    pruefe("Alte Farbe auf der Wand", pg.evaluate("""(id) => { const b = document.querySelector(`.pw-balken[data-auftrag='${id}']`);
      return !!b && getComputedStyle(b).backgroundColor.replace(/\\s/g,'') === 'rgb(184,40,31)'; }""", jid))

    oeffnen(pg, jid)
    pruefe("Fenster offen", pg.locator(".dialog--auftrag").count() == 1)
    pruefe("Kein freier Farbwähler", pg.locator(".dialog--auftrag input[type=color]").count() == 0)
    pruefe("Kein Knopf Neue Farbe mehr", pg.locator("#pl-farbneu").count() == 0)
    pruefe("Alte Farbe nach Vorschlag weg", pg.locator(".farbknopf--alt").count() == 0)
    hinweis = pg.inner_text("#pl-farbmaterial")
    print("     Hinweis:", hinweis)
    pruefe("Vorschlag nächstliegende Palettenfarbe", "ersetzt durch" in hinweis)
    aktiv = pg.evaluate("document.querySelector('[data-plfarbe].aktiv')?.dataset.plfarbe")
    print("     vorgeschlagen:", aktiv)
    pruefe("Vorschlag ist angebotene Farbe", bool(aktiv))
    pg.screenshot(path="/tmp/farbe_vorschlag.png")

    pg.click("#pl-ja"); pg.wait_for_timeout(1200)
    farbe = pg.evaluate("(id) => TEST.daten.planwand.find(j => j.id === id).color", jid)
    pruefe("Auftrag gespeichert mit Palettenfarbe", farbe == aktiv)
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
