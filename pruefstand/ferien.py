# Ferienfenster: eintragen, Anfrage bestätigen, löschen, Abbrechen mit Escape
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    ferien = lambda: pg.evaluate("TEST.daten.vacations.map(v => v.person + ':' + v.genehmigt)")

    # Neu eintragen über eine leere Zelle
    pg.locator("[data-fzelle]").nth(3).click(); pg.wait_for_timeout(400)
    pruefe("Fenster „Ferien eintragen“", "Ferien eintragen" in pg.inner_text(".dialog-huelle h2"))
    pruefe("Fokus auf Wer", pg.evaluate("document.activeElement && document.activeElement.id") == "fd-person")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe("Escape schliesst", pg.locator("#fd-person").count() == 0)

    pg.locator("[data-fzelle]").nth(3).click(); pg.wait_for_timeout(400)
    pg.fill("#fd-person", "")
    pg.locator("#fd-ja").click(); pg.wait_for_timeout(300)
    pruefe("ohne Namen: bleibt offen", pg.locator("#fd-person").count() == 1)
    von = pg.input_value("#fd-von")
    pg.fill("#fd-person", "Testperson")
    pg.fill("#fd-notiz", "Wanderwoche")
    pg.locator("#fd-ja").click(); pg.wait_for_timeout(1200)
    neu = pg.evaluate("TEST.daten.vacations.find(v => v.person === 'Testperson') || null")
    pruefe("eingetragen: " + str(neu and (neu["von"], neu["tage"], neu["note"], neu["zeile"])),
           bool(neu) and neu["von"] == von and neu["note"] == "Wanderwoche" and neu["genehmigt"] is True)
    pruefe("Balken erscheint", pg.locator("[data-ferien]", has_text="Testperson").count() >= 1)

    # Anfrage von Tristan bestätigen
    pg.locator("[data-ferien='f2']").click(); pg.wait_for_timeout(500)
    pruefe("Anfrage: noch nicht bestätigt", "Noch nicht bestätigt" in pg.inner_text(".dialog-huelle"))
    pg.locator("#fd-ok").click(); pg.wait_for_timeout(1000)
    pruefe("bestätigt", pg.evaluate("TEST.daten.vacations.find(v => v.id === 'f2').genehmigt") is True)

    # Ramona löschen
    pg.locator("[data-ferien='f1']").click(); pg.wait_for_timeout(500)
    pruefe("Bestätigt-Kasten", "Bestätigt" in pg.inner_text(".dialog-huelle"))
    pg.locator("#fd-weg").click(); pg.wait_for_timeout(400)
    pg.locator("[data-ja]").click(); pg.wait_for_timeout(1000)
    pruefe("gelöscht", not pg.evaluate("TEST.daten.vacations.some(v => v.id === 'f1')"))
    pruefe("alle Fenster zu", pg.locator(".dialog-huelle").count() == 0)
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
