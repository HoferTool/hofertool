# Einkaufsliste in React: hinzufügen, bearbeiten, abhaken mit
# Rückfrage, Rückgängig, Erledigtes anzeigen, löschen, und der
# laufende Abgleich frischt still auf, ohne die Seite neu aufzubauen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def dialog_felder(pg, werte):
    pg.wait_for_selector(".dialog-huelle .dialog input")
    felder = pg.locator(".dialog-huelle .dialog input")
    for i, w in enumerate(werte):
        felder.nth(i).fill(w)
    pg.click(".dialog-huelle [data-ja]")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1300,"height":900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.clock.install()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#einkauf'")
    pg.wait_for_selector("#ek-neu"); pg.wait_for_timeout(400)
    if "leer" not in pg.inner_text("#ek-inhalt"): fehler.append("leere Liste ohne Hinweis")

    # Hinzufügen: Kaffee, Sofort; Handschuhe, Irgendwann
    for text, menge, prio in [("Kaffee", "2 Packungen", "1"), ("Handschuhe <b>", "", "4")]:
        pg.click("#ek-neu"); dialog_felder(pg, [text, menge, ""])
        pg.wait_for_selector(f".dialog-huelle [data-w='{prio}']"); pg.click(f".dialog-huelle [data-w='{prio}']")
        pg.wait_for_timeout(500)
    karten = pg.locator("#ek-inhalt section.karte")
    if karten.count() != 2: fehler.append("Gruppen: %d statt 2" % karten.count())
    if "Sofort" not in karten.nth(0).inner_text(): fehler.append("Reihenfolge der Dringlichkeit")
    if "Handschuhe <b>" not in pg.inner_text("#ek-inhalt"): fehler.append("Text nicht wörtlich (Escaping)")

    # Bearbeiten
    pg.locator("[data-ekbearb]").first.click(); dialog_felder(pg, ["Kaffee Bohnen"])
    pg.click(".dialog-huelle [data-w='1']"); pg.wait_for_timeout(500)
    if "Kaffee Bohnen" not in pg.inner_text("#ek-inhalt"): fehler.append("Bearbeiten wirkt nicht")

    # Abhaken: zuerst abbrechen, dann bestätigen
    pg.locator("[data-ekfertig]").first.click(); pg.wait_for_selector(".dialog-huelle [data-nein]")
    pg.click(".dialog-huelle [data-nein]"); pg.wait_for_timeout(300)
    if pg.locator("[data-ekfertig]").count() != 2: fehler.append("Abbrechen hat trotzdem abgehakt")
    if pg.locator("[data-ekfertig]").first.is_checked(): fehler.append("Häkchen bleibt nach Abbrechen")
    pg.locator("[data-ekfertig]").first.click(); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(500)
    if pg.locator("[data-ekfertig]").count() != 1: fehler.append("Abhaken wirkt nicht")
    pg.click("#rueck-knopf"); pg.wait_for_timeout(600)
    if pg.locator("[data-ekfertig]").count() != 2: fehler.append("Rückgängig wirkt nicht")
    pg.locator("[data-ekfertig]").first.click(); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(500)

    # Erledigtes anzeigen und zurück
    pg.click("#ek-wechsel"); pg.wait_for_timeout(400)
    if pg.locator(".hakenfertig").count() != 1: fehler.append("Erledigtes fehlt")
    pg.click("#ek-wechsel"); pg.wait_for_timeout(400)

    # Abgleich von aussen: neuer Eintrag in der Datenbank, die Seite
    # wird still aufgefrischt, der Knopf bleibt dasselbe Element
    pg.evaluate("window._ekKnopf = document.getElementById('ek-neu')")
    pg.evaluate("""TEST.daten.shopping_items.push({id:'x1', text:'Klebeband', prio:2, is_done:false,
                   created_at:new Date().toISOString()})""")
    pg.locator("h1").click()   # kein Feld im Fokus, sonst wartet der Abgleich
    pg.clock.fast_forward(46000); pg.wait_for_timeout(800)
    if "Klebeband" not in pg.inner_text("#ek-inhalt"): fehler.append("Neuer Eintrag kommt nicht")
    if not pg.evaluate("window._ekKnopf === document.getElementById('ek-neu')"):
        fehler.append("Abgleich hat die Seite neu aufgebaut statt still aufzufrischen")

    # Löschen
    vorher = pg.locator("[data-ekweg]").count()
    pg.locator("[data-ekweg]").first.click(); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(500)
    if pg.locator("[data-ekweg]").count() != vorher - 1: fehler.append("Löschen wirkt nicht")
    pg.screenshot(path="einkauf.png")
    br.close()
print("Einkauf | Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
