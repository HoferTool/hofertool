# Eigenes Passwort und eigene PIN (seit 1.2.0): jeder ausser Gerätekonten
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

def seite(br, rolle, extra=""):
    K = ("TEST.daten.profiles.find(p => p.id === 'u1').role = '%s';" % rolle) + extra
    F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
                     "if (typeof window !== \"undefined\") window.TEST = TEST;\n" + K)
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(700)
    return pg, f

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    pg, f = seite(br, "langdreher")
    pruefe("Langdreher sieht Passwort", pg.locator("#np").count() == 1)
    pruefe("Langdreher sieht PIN", pg.locator("#mk-pin").count() == 1)
    pruefe("Langdreher sieht Ohne Passwort", pg.locator("#mk-offen").count() == 1)
    pruefe("kein Hinweis auf Administrator", "ändert ein Administrator" not in pg.inner_text(".dialog--einstellungen"))
    pg.fill("#mk-pin", "4321"); pg.fill("#mk-pin2", "4321"); pg.locator("#mk-pinknopf").click(); pg.wait_for_timeout(500)
    pruefe("PIN an den Server", pg.evaluate("TEST.protokoll.some(x => x.art === 'rpc' && x.name === 'pin_setzen')"))
    pruefe("PIN entfernen sichtbar", pg.locator("#mk-pinweg").count() == 1)
    pg.locator("#mk-offen").click(); pg.wait_for_timeout(300)
    pg.locator("[data-ja]").click(); pg.wait_for_timeout(500)
    pruefe("Ohne Passwort an den Server", pg.evaluate("TEST.protokoll.some(x => x.art === 'rpc' && x.name === 'ohne_passwort_setzen')"))
    txt = pg.inner_text(".dialog--einstellungen")
    pruefe("zeigt: ohne Passwort", "ohne Passwort hinein" in txt)
    pruefe("Knopf Ohne Passwort weg", pg.locator("#mk-offen").count() == 0)
    pruefe("PIN entfernen weg", pg.locator("#mk-pinweg").count() == 0)
    pruefe("keine Fehler (Langdreher)", not f)

    pg, f = seite(br, "extern")
    pruefe("Extern: Passwort ja", pg.locator("#np").count() == 1)
    pruefe("Extern: kein Ohne Passwort", pg.locator("#mk-offen").count() == 0)

    pg, f = seite(br, "planwand", "TEST.daten.profiles.find(p => p.id === 'u1').andere_nutzer = true;")
    pruefe("Gerätekonto: kein Passwort", pg.locator("#np").count() == 0)
    pruefe("Gerätekonto: keine PIN", pg.locator("#mk-pin").count() == 0)
    pruefe("Gerätekonto: Hinweis Administrator", "ändert ein Administrator" in pg.inner_text(".dialog--einstellungen"))
    pruefe("keine Fehler (Gerätekonto)", not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
