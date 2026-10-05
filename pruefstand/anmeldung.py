# Anmeldeseite: Kacheln alphabetisch, Passwortfeld, zurück mit Escape und
# „anderes Konto“, falsches Passwort, Anmelden, Formular ohne Kacheln,
# und nach dem Abmelden geht es wieder.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.login_kacheln = [
  { id: 'u3', email: 'zora@hoferco.ch', full_name: 'Zora Keller', role: 'kurzdreher', ohne_passwort: true },
  { id: 'u1', email: 'saheesan.hudson@hoferco.ch', full_name: 'saheesan.hudson', role: 'admin' },
  { id: 'u4', email: 'anna@hoferco.ch', full_name: 'Anna Brun', role: 'langdreher' },
  { id: 'u5', email: 'extern@zuerbrugg.ch', full_name: 'Extern', role: 'extern' }];
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
ANMELDEN = "window.OHNE_SITZUNG = true;"
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def seite(br, fake):
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=fake))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script(ANMELDEN)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2000)
    return pg, f
# Den Nachbau so ändern, dass signInWithPassword das Passwort prüft: „richtig“ stimmt
F2 = F.replace("signInWithPassword: () => Promise.resolve({ data: {}, error: null }),",
  "signInWithPassword: ({ password }) => { if (password === 'richtig') { window.OHNE_SITZUNG = false; return Promise.resolve({ data: {}, error: null }); } return Promise.resolve({ data: {}, error: { message: 'Invalid login credentials' } }); },")
assert F2 != F
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg, f = seite(br, F2)
    namen = pg.evaluate("[...document.querySelectorAll('.login__kachel-name')].map(k => k.textContent)")
    pruefe("Kacheln alphabetisch, ohne Extern: " + str(namen), len(namen) == 3 and namen[0].startswith("Anna") and namen[-1].startswith("Zora"))
    pruefe("PIN-Punkt nur bei Zora", pg.locator(".login__kachel .login__offen").count() == 1)

    pg.locator(".login__kachel").nth(0).click(); pg.wait_for_timeout(800)
    pruefe("Passwortfeld für Anna", pg.get_attribute("#lp", "placeholder") == "Passwort" and "Anna" in pg.inner_text(".login__name"))
    pruefe("Fokus im Feld", pg.evaluate("document.activeElement && document.activeElement.id") == "lp")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pruefe("Escape: zurück zur Auswahl", pg.locator("#lp").count() == 0 and pg.is_visible("#lg-auswahl"))
    pg.locator(".login__kachel").nth(2).click(); pg.wait_for_timeout(1200)
    pruefe("PIN-Feld für Zora", pg.get_attribute("#lp", "placeholder") == "PIN")
    pg.locator("#lg-anderes").click(); pg.wait_for_timeout(500)
    pruefe("anderes Konto: zurück", pg.locator("#lp").count() == 0)

    pg.locator(".login__kachel").nth(1).click(); pg.wait_for_timeout(800)
    pg.locator("#lk").click(); pg.wait_for_timeout(300)
    pruefe("leer: Hinweis unter dem Feld", "eingeben" in pg.inner_text(".login__fehler"))
    pg.fill("#lp", "falsch"); pg.press("#lp", "Enter"); pg.wait_for_timeout(600)
    pruefe("falsches Passwort: Text unter dem Feld", "stimmt nicht" in pg.inner_text(".login__fehler"))
    pruefe("keine Meldung unten rechts", pg.evaluate("!document.querySelector('.toast-bereich') || !document.querySelector('.toast-bereich').innerText.trim()"))
    pruefe("Knopf wieder bereit", pg.inner_text("#lk") == "Anmelden" and pg.is_enabled("#lk"))
    pg.fill("#lp", "richtig"); pg.locator("#lk").click(); pg.wait_for_timeout(2000)
    pruefe("auch beim Anmelden keine Meldung", pg.evaluate("!document.querySelector('.toast-bereich') || !document.querySelector('.toast-bereich').innerText.trim()"))
    pruefe("angemeldet: Gerüst steht", pg.locator("#inhalt").count() == 1 and pg.locator(".login").count() == 0)

    # Abmelden und wieder anmelden
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='allgemein']").click(); pg.wait_for_timeout(200)
    pg.locator("#ab").click(); pg.wait_for_timeout(300); pg.locator("[data-ja]").click(); pg.wait_for_timeout(1500)
    pruefe("nach dem Abmelden wieder Kacheln", pg.locator(".login__kachel").count() == 3)
    pruefe("blau, nicht dunkel", not pg.evaluate("document.body.classList.contains('dunkel') || !!document.body.dataset.thema"))
    pg.locator(".login__kachel").nth(1).click(); pg.wait_for_timeout(800)
    pg.fill("#lp", "richtig"); pg.locator("#lk").click(); pg.wait_for_timeout(2000)
    pruefe("zweites Anmelden klappt", pg.locator("#inhalt").count() == 1)
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    pg.close()

    # Ohne Kacheln: Formular
    F3 = F2.replace(K, "daten.login_kacheln = [];")
    pg, f = seite(br, F3)
    pruefe("Formular mit Benutzername", pg.locator("#le").count() == 1)
    pg.fill("#le", "anna"); pg.fill("#lp", "richtig"); pg.locator("#lk").click(); pg.wait_for_timeout(2000)
    pruefe("über das Formular angemeldet", pg.locator("#inhalt").count() == 1)
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
