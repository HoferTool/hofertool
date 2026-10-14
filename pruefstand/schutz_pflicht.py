# Passwort oder PIN ist Pflicht (seit 1.56.0): ohne beides sperrt ein Fenster alles
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

def seite(br, extra, breite=1440, hoehe=900):
    F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
                     "if (typeof window !== \"undefined\") window.TEST = TEST;\n" + extra)
    pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1800)
    return pg, f

def sperre(pg):
    return pg.locator(".schutzpflicht").count() == 1

OFFEN = "const _u = TEST.daten.profiles.find(p => p.id === 'u1'); _u.ohne_passwort = true; _u.role = '%s'; window._pins = []; TEST.rpc.pin_vorhanden = () => window._pins;"

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    pg, f = seite(br, OFFEN % "langdreher")
    pruefe("Sperre da ohne Passwort und PIN", sperre(pg))
    pg.screenshot(path="schutz_pflicht.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Escape schliesst nicht", sperre(pg))
    pruefe("keine Frage Abmelden nach Escape", pg.locator(".dialog-huelle").count() == 0)
    # Klick daneben auf die Navigation kommt nicht durch
    pg.mouse.click(5, 450); pg.wait_for_timeout(300)
    pruefe("Klick daneben tut nichts", sperre(pg))
    pg.locator("#sp-einstellungen").click(); pg.wait_for_timeout(800)
    pruefe("Einstellungen offen", pg.locator(".dialog--einstellungen").count() == 1)
    pruefe("Sperre weg, solange Einstellungen offen", not sperre(pg))
    pruefe("Reiter Allgemein", pg.locator(".es-reiter__knopf.aktiv[data-einst=allgemein]").count() == 1)
    pruefe("Kein Knopf Ohne Passwort", pg.locator("#mk-offen").count() == 0)
    pg.screenshot(path="schutz_pflicht_einstellungen.png")
    # Schliessen ohne etwas zu setzen: Sperre kommt zurück
    pg.locator(".dialog--einstellungen [data-zu]").first.click(); pg.wait_for_timeout(900)
    pruefe("Sperre zurück nach Schliessen", sperre(pg))
    # Jetzt eine PIN setzen
    pg.locator("#sp-einstellungen").click(); pg.wait_for_timeout(800)
    pg.fill("#mk-pin", "4321"); pg.fill("#mk-pin2", "4321")
    pg.evaluate("window._pins = [{ user_id: 'u1' }]")
    pg.locator("#mk-pinknopf").click(); pg.wait_for_timeout(500)
    pg.locator(".dialog--einstellungen [data-zu]").first.click(); pg.wait_for_timeout(900)
    pruefe("Nach PIN keine Sperre mehr", not sperre(pg))
    pg.wait_for_timeout(1000)
    pruefe("nicht wieder da", not sperre(pg))
    pruefe("keine Fehler", not f)
    pg.close()

    # Mit Passwort statt PIN: Sperre geht gleich beim Speichern weg
    pg, f = seite(br, OFFEN % "kurzdreher")
    pg.locator("#sp-einstellungen").click(); pg.wait_for_timeout(800)
    pg.fill("#np", "geheim1"); pg.locator("#ps").click(); pg.wait_for_timeout(600)
    pg.locator(".dialog--einstellungen [data-zu]").first.click(); pg.wait_for_timeout(900)
    pruefe("Nach Passwort keine Sperre", not sperre(pg))
    pg.close()

    # Mit PIN: keine Sperre
    pg, f = seite(br, OFFEN % "langdreher" + " window._pins = [{ user_id: 'u1' }];")
    pruefe("Mit PIN keine Sperre", not sperre(pg))
    pg.close()

    # Admin ohne Passwort: auch gesperrt
    pg, f = seite(br, OFFEN % "admin")
    pruefe("Admin ohne Passwort gesperrt", sperre(pg))
    pg.close()

    # Externe, Gerätekonten: keine Sperre
    pg, f = seite(br, OFFEN % "extern")
    pruefe("Extern keine Sperre", not sperre(pg))
    pg.close()
    pg, f = seite(br, OFFEN % "planwand" + " _u.andere_nutzer = true;")
    pruefe("Gerätekonto keine Sperre", not sperre(pg))
    pg.close()

    # Abmelden aus der Sperre
    pg, f = seite(br, OFFEN % "langdreher")
    pg.locator("#sp-abmelden").click(); pg.wait_for_timeout(400)
    pruefe("Frage Abmelden über der Sperre", pg.locator(".dialog-huelle").count() >= 1)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
