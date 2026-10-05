# Materialfarben nur aus der Palette (Wunsch 5. Oktober 2026): Im
# Auftragsfenster gibt es keinen freien Farbwähler mehr. "+" legt eine
# neue Farbe aus der Palette an, mit Material und Kürzel. Ein alter
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
    pruefe("Knopf Neue Farbe", pg.locator("#pl-farbneu").count() == 1)
    pruefe("Alte Farbe nach Vorschlag weg", pg.locator(".farbknopf--alt").count() == 0)
    hinweis = pg.inner_text("#pl-farbmaterial")
    print("     Hinweis:", hinweis)
    pruefe("Vorschlag nächstliegende Palettenfarbe", "ersetzt durch" in hinweis)
    aktiv = pg.evaluate("document.querySelector('[data-plfarbe].aktiv')?.dataset.plfarbe")
    print("     vorgeschlagen:", aktiv)
    pruefe("Vorschlag ist angebotene Farbe", bool(aktiv))
    pg.screenshot(path="/tmp/farbe_vorschlag.png")

    # Neue Farbe anlegen
    vorher = pg.evaluate("TEST.daten.farb_material.map(z => z.farbe)")
    pg.click("#pl-farbneu"); pg.wait_for_timeout(500)
    angebot = pg.evaluate("[...document.querySelectorAll('[data-neufarbe]')].map(b => b.dataset.neufarbe)")
    pruefe("Nur freie Palettenfarben angeboten", len(angebot) > 0 and not (set(angebot) & set(vorher)))
    pruefe("Auch im Dialog kein Farbwähler", pg.locator("input[type=color]").count() == 0)
    # Ohne Farbe geht es nicht
    pg.fill("#neufarbe-material", "Kupfer"); pg.click(".dialog-huelle:last-child [data-ja]"); pg.wait_for_timeout(300)
    pruefe("Ohne Farbe bleibt Dialog offen", pg.locator("[data-neufarbe]").count() > 0)
    neu = angebot[0]
    pg.click(f"[data-neufarbe='{neu}']"); pg.fill("#neufarbe-kuerzel", "CU")
    pg.screenshot(path="/tmp/farbe_neu_dialog.png")
    pg.click(".dialog-huelle:last-child [data-ja]"); pg.wait_for_timeout(800)
    z = pg.evaluate("(f) => TEST.daten.farb_material.find(z => z.farbe === f) || null", neu)
    pruefe("Zuteilung gespeichert", bool(z) and z["material"] == "Kupfer" and z["buchstabe"] == "CU")
    pruefe("Neue Farbe im Fenster gewählt", pg.evaluate("document.querySelector('[data-plfarbe].aktiv')?.dataset.plfarbe") == neu)
    pruefe("Material darunter", "Kupfer" in pg.inner_text("#pl-farbmaterial"))
    pg.screenshot(path="/tmp/farbe_neu.png")
    pg.click("#pl-ja"); pg.wait_for_timeout(1200)
    farbe = pg.evaluate("(id) => TEST.daten.planwand.find(j => j.id === id).color", jid)
    pruefe("Auftrag gespeichert mit Palettenfarbe", farbe == neu)
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
