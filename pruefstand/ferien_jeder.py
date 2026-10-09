# Ferien darf jeder (1.1.0): auch ein Mitarbeiter ohne Planrecht trägt
# Ferien ein, zieht sie an den Griffen und löscht sie. Externe nicht.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def seite(br, rolle):
    F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
        "daten.profiles[0].role = '" + rolle + "'; daten.profiles[0].darf_bearbeiten = false;\nif (typeof window !== \"undefined\") window.TEST = TEST;")
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    return pg, f
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg, f = seite(br, "mitarbeiter")
    pruefe("Mitarbeiter: Planwand nur ansehen", pg.locator(".nurlesen").count() == 1)
    pruefe("Mitarbeiter: Griffe an Ferien", pg.locator("[data-ferien] [data-fgriff]").count() >= 1)
    pg.locator("[data-fzelle]").nth(3).click(); pg.wait_for_timeout(400)
    pruefe("Mitarbeiter: Fenster „Ferien eintragen“", pg.locator("#fd-person").count() == 1)
    pg.fill("#fd-person", "Mitarbeiterferien")
    pg.locator("#fd-ja").click(); pg.wait_for_timeout(1200)
    neu = pg.evaluate("TEST.daten.vacations.find(v => v.person === 'Mitarbeiterferien') || null")
    pruefe("Mitarbeiter: eingetragen", bool(neu) and neu["genehmigt"] is True)
    # Rechter Griff um zwei Spalten ziehen
    alt_tage = pg.evaluate("TEST.daten.vacations.find(v => v.id === 'f1').tage")
    g = pg.locator("[data-ferien='f1'] [data-fgriff='rechts']").bounding_box()
    spalte = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.pw-tafel')).getPropertyValue('--spalte')) || 40")
    pg.mouse.move(g["x"] + g["width"] / 2, g["y"] + g["height"] / 2); pg.mouse.down()
    for k in range(1, 11):
        pg.mouse.move(g["x"] + g["width"] / 2 + k * spalte * 2 / 10, g["y"] + g["height"] / 2); pg.wait_for_timeout(20)
    pg.mouse.up(); pg.wait_for_timeout(1200)
    neu_tage = pg.evaluate("TEST.daten.vacations.find(v => v.id === 'f1').tage")
    pruefe(f"Mitarbeiter: Griff ändert Dauer {alt_tage} → {neu_tage}", neu_tage != alt_tage)
    pg.locator("[data-ferien='f1']").click(); pg.wait_for_timeout(500)
    pg.locator("#fd-weg").click(); pg.wait_for_timeout(400)
    pg.locator("[data-ja]").click(); pg.wait_for_timeout(1000)
    pruefe("Mitarbeiter: gelöscht", not pg.evaluate("TEST.daten.vacations.some(v => v.id === 'f1')"))
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    pg.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
