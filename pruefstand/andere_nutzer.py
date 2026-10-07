# Andere Nutzer (111.85.0): Gerätekonten stehen bei der Anmeldung unten
# unter „Andere Nutzer“, der Admin setzt das Häkchen in Einstellungen →
# Nutzer, und Passwort und PIN ändert nur noch ein Admin.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.login_kacheln = window.OHNE_SPALTE ? [
  { email: 'andrea@hoferco.ch', full_name: 'Andrea Meier', role: 'kurzdreher' },
  { email: 'planwand@hoferco.ch', full_name: 'Planwand', role: 'planwand', ohne_passwort: true },
  { email: 'marco@hoferco.ch', full_name: 'Marco Steiner', role: 'langdreher' }] : [
  { email: 'andrea@hoferco.ch', full_name: 'Andrea Meier', role: 'kurzdreher', andere_nutzer: false },
  { email: 'planwand@hoferco.ch', full_name: 'Planwand', role: 'planwand', andere_nutzer: true },
  { email: 'paeckli@hoferco.ch', full_name: 'Päckli Pad', role: 'mitarbeiter', andere_nutzer: true },
  { email: 'chef@hoferco.ch', full_name: 'Chef Planwand', role: 'planwand', andere_nutzer: false },
  { email: 'marco@hoferco.ch', full_name: 'Marco Steiner', role: 'langdreher', andere_nutzer: false }];
if (window.NICHT_ADMIN) daten.profiles[0].role = 'langdreher';
daten.profiles[1].andere_nutzer = false;
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

def seite(br, sitzung, vorher="", breite=1440, hoehe=900):
    pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("window.OHNE_SITZUNG = " + ("false" if sitzung else "true") + ";" + vorher)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    return pg, f

NAMEN = "[...document.querySelectorAll('#lg-auswahl .login__kachel-name')].map(e => e.textContent)"
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # 1. Kachelwand: Leute zuerst, Gerätekonten hinter „Andere Nutzer“
    pg, f = seite(br, False)
    leute = pg.evaluate(NAMEN); print("Personen:", leute)
    if leute != ["Andrea Meier", "Chef Planwand", "Marco Steiner"]: fehler.append("falsche Personen-Kacheln")
    knopf = pg.locator("#lg-andere")
    print("Knopf:", knopf.text_content() if knopf.count() else None)
    if not knopf.count() or knopf.text_content() != "Andere Nutzer": fehler.append("Knopf Andere Nutzer fehlt")
    pg.screenshot(path="/tmp/an-personen.png")
    knopf.click(); pg.wait_for_timeout(500)
    andere = pg.evaluate(NAMEN); print("Andere:", andere)
    if andere != ["Päckli Pad", "Planwand"]: fehler.append("falsche andere Kacheln")
    if pg.locator("#lg-andere").text_content() != "Personen": fehler.append("Knopf zurück heisst falsch")
    pg.screenshot(path="/tmp/an-andere.png")
    # Gerätekonto mit Passwort wählen und mit „anderes Konto“ zurück: wieder die anderen
    pg.locator(".login__kachel", has_text="Päckli Pad").click(); pg.wait_for_timeout(1300)
    print("Anmeldefeld:", pg.evaluate("document.querySelector('.login__name') && document.querySelector('.login__name').textContent"))
    pg.locator("#lg-anderes").click(); pg.wait_for_timeout(1000)
    zurueck = pg.evaluate(NAMEN); print("nach anderes Konto:", zurueck)
    if zurueck != andere: fehler.append("nach anderes Konto falsche Gruppe")
    pg.locator("#lg-andere").click(); pg.wait_for_timeout(500)
    if pg.evaluate(NAMEN) != leute: fehler.append("zurück zu den Personen klappt nicht")
    fehler += f; pg.close()

    # 2. Ohne SQL (Kacheln ohne Spalte): Planwand-Konten gelten als andere
    pg, f = seite(br, False, "window.OHNE_SPALTE = true;")
    print("ohne SQL Personen:", pg.evaluate(NAMEN))
    if pg.evaluate(NAMEN) != ["Andrea Meier", "Marco Steiner"]: fehler.append("Rückfall ohne SQL falsch")
    pg.locator("#lg-andere").click(); pg.wait_for_timeout(500)
    if pg.evaluate(NAMEN) != ["Planwand"]: fehler.append("Rückfall: Planwand fehlt bei andere")
    fehler += f; pg.close()

    # 3. Admin: Häkchen in Einstellungen → Nutzer
    pg, f = seite(br, True)
    pg.evaluate("document.getElementById('kopf-einstellungen').click()"); pg.wait_for_timeout(1200)
    pg.locator("[data-einst='nutzer']").click(); pg.wait_for_timeout(1200)
    pg.click("[data-bearbeiten='u2']"); pg.wait_for_selector(".nutzerfenster")
    print("Häkchen:", pg.evaluate("[...document.querySelectorAll('[data-andere]')].map(k => k.dataset.andere + ':' + k.checked)"))
    pg.locator("[data-andere='u2']").click(); pg.wait_for_timeout(800)
    upd = pg.evaluate("[TEST.daten.profiles.find(u => u.id === 'u2').andere_nutzer, document.querySelector(\"[data-andere='u2']\").checked]")
    print("gespeichert, angezeigt:", upd)
    if upd != [True, True]: fehler.append("Häkchen speichert nicht")
    pg.locator(".nutzerfenster").screenshot(path="/tmp/an-fenster.png")
    pg.locator(".nutzerfenster [data-zu]").click(); pg.wait_for_timeout(800)
    print("Liste u2:", pg.inner_text("[data-nutzer='u2']").replace("\n", " / "))
    if "Andere Nutzer" not in pg.inner_text("[data-nutzer='u2']"): fehler.append("Liste zeigt Andere Nutzer nicht")
    pg.locator("#benutzerliste").screenshot(path="/tmp/an-einstellungen.png")
    pg.locator("[data-einst='allgemein']").click(); pg.wait_for_timeout(800)
    print("Admin sieht Passwort/PIN:", pg.locator("#np").count(), pg.locator("#mk-pin").count())
    if not pg.locator("#np").count(): fehler.append("Admin sieht eigenes Passwort nicht")
    fehler += f; pg.close()

    # Handy: Karte mit Zeile „Andere Nutzer“
    pg, f = seite(br, True, "", 390, 844)
    pg.evaluate("document.getElementById('kopf-einstellungen').click()"); pg.wait_for_timeout(1200)
    pg.locator("[data-einst='nutzer']").click(); pg.wait_for_timeout(1200)
    breit = pg.evaluate("document.documentElement.scrollWidth")
    print("Handy Breite:", breit)
    if breit > 391: fehler.append("Handy rollt seitlich")
    pg.locator("#benutzerliste").screenshot(path="/tmp/an-handy.png")
    pg.click("[data-bearbeiten='u2']"); pg.wait_for_selector(".nutzerfenster"); pg.wait_for_timeout(300)
    pg.screenshot(path="/tmp/an-handy-fenster.png")
    if pg.evaluate("document.querySelector('.nutzerfenster').scrollWidth > document.querySelector('.nutzerfenster').clientWidth + 1"): fehler.append("Fenster am Handy zu breit")
    fehler += f; pg.close()

    # 4. Kein Admin: kein Passwort- und kein PIN-Feld, „merken“ bleibt
    pg, f = seite(br, True, "window.NICHT_ADMIN = true;")
    pg.evaluate("document.getElementById('kopf-einstellungen').click()"); pg.wait_for_timeout(1200)
    da = pg.evaluate("[!!document.getElementById('np'), !!document.getElementById('mk-pin'), !!document.getElementById('mk-merken')]")
    text = pg.evaluate("[...document.querySelectorAll('.es-gruppe')].map(g => g.textContent).find(t => t.includes('Administrator')) || ''")
    print("Passwort, PIN, merken:", da, "|", text[:120])
    if da != [False, False, True]: fehler.append("Nicht-Admin sieht Passwort oder PIN")
    if "Passwort und PIN ändert ein Administrator" not in text: fehler.append("Hinweis fehlt")
    reiter = pg.evaluate("[...document.querySelectorAll('[data-einst]')].map(k => k.dataset.einst)")
    print("Reiter ohne Admin:", reiter)
    if reiter != ["allgemein"]: fehler.append("Nicht-Admin sieht mehr als Allgemein")
    fehler += f; pg.close()
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
