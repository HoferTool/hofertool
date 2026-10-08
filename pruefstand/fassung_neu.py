# Neue Fassung beim Anmelden (111.112.0, Wunsch Patrick 8. Oktober 2026):
# Liegt auf dem Server eine andere Programmdatei als die laufende, lädt
# die Seite nach der Anmeldung per Klick (mit und ohne „merken“) und
# beim Start neu. Gleiche Fassung: kein Neuladen. Dieselbe neue
# Fassung löst je Tab nur einmal ein Neuladen aus.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.login_kacheln = [
  { email: 'andrea@hoferco.ch', full_name: 'Andrea Meier', role: 'kurzdreher', ohne_passwort: true },
  { email: 'saheesan.hudson@hoferco.ch', full_name: 'Marco Steiner', role: 'langdreher' }];
// Der Nachbau hat keinen Sitzungsspeicher: Die Marke im sessionStorage
// steht für die Sitzung, die bei der echten Supabase das Neuladen übersteht
TEST.funktionen['pin-anmelden'] = (b) => { if (b.offen) sessionStorage.setItem('fake.sitzung', '1');
  return b.offen ? { status: 'ok', token_hash: 'offen' } : { status: 'falsch', rest: 4 }; };
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
NEU = open("../dist/index.html", encoding="utf-8").read().replace("assets/index-", "assets/index-NEU")

def seite(br, vorher="", neu=False):
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    # Die Nachfrage beim Server: wahlweise eine andere Programmdatei
    pg.route("**/index.html?stand=*", lambda r: r.fulfill(status=200, content_type="text/html", body=NEU) if neu else r.continue_())
    pg.add_init_script("window.OHNE_SITZUNG = !sessionStorage.getItem('fake.sitzung');" + vorher)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    return pg, f

fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FEHLT"), name)
    if not ok: fehler.append(name)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # 1. Gleiche Fassung: Anmeldung per Tipp, kein Neuladen
    pg, f = seite(br)
    pg.evaluate("window.__marke = 1")
    pg.locator(".login__kachel", has_text="Andrea").click(); pg.wait_for_timeout(2500)
    pruefe("gleiche Fassung: angemeldet", pg.evaluate("!document.getElementById('lg-auswahl')"))
    pruefe("gleiche Fassung: nicht neu geladen", pg.evaluate("window.__marke === 1"))
    pruefe("gleiche Fassung: Server gefragt", pg.evaluate("performance.getEntriesByType('resource').some(e => /index\\.html\\?stand=/.test(e.name))"))
    fehler += f; pg.close()

    # 2. Neue Fassung auf dem Server, ohne Sitzung: schon beim Start einmal neu geladen
    pg, f = seite(br, neu=True)
    pruefe("Start: einmal neu geladen", pg.evaluate("sessionStorage.getItem('hofer.fassung.neuladen')") == "index-NEUDMURMIpm.js".replace("DMURMIpm", NEU.split("assets/index-NEU")[1].split(".js")[0]))
    pruefe("Start: Kacheln da, kein Kreislauf", pg.locator(".login__kachel").count() == 2)
    # Die Marke gilt für diese neue Fassung: Anmeldung lädt nicht nochmal
    pg.evaluate("window.__marke = 1")
    pg.locator(".login__kachel", has_text="Andrea").click(); pg.wait_for_timeout(2500)
    pruefe("Anmeldung: dieselbe neue Fassung lädt nicht nochmal", pg.evaluate("window.__marke === 1 && !document.getElementById('lg-auswahl')"))
    fehler += f; pg.close()

    # 3. Marke weg (als wäre der Server erst nach dem Start neuer): Anmeldung per Tipp lädt neu
    pg, f = seite(br, neu=True)
    pg.evaluate("sessionStorage.removeItem('hofer.fassung.neuladen'); window.__marke = 1")
    pg.locator(".login__kachel", has_text="Andrea").click(); pg.wait_for_timeout(3500)
    pruefe("Tipp: neu geladen", pg.evaluate("window.__marke === undefined"))
    pruefe("Tipp: Anmeldung übersteht das Neuladen", pg.evaluate("!document.getElementById('lg-auswahl')"))
    fehler += f; pg.close()

    # 4. Mit Passwort ohne Häkchen „merken“: lädt ebenfalls neu
    pg, f = seite(br, neu=True)
    pg.evaluate("sessionStorage.removeItem('hofer.fassung.neuladen'); window.__marke = 1")
    pg.locator(".login__kachel", has_text="Marco").click(); pg.wait_for_timeout(900)
    pg.locator("#lmerk").uncheck()
    pg.evaluate("window.OHNE_SITZUNG = false; sessionStorage.setItem('fake.sitzung', '1')")
    pg.fill("#lp", "geheim"); pg.locator("#lk").click(); pg.wait_for_timeout(3500)
    pruefe("Passwort ohne Häkchen: neu geladen", pg.evaluate("window.__marke === undefined"))
    pruefe("Passwort ohne Häkchen: angemeldet", pg.evaluate("!document.getElementById('lg-auswahl') && !document.getElementById('lp')"))
    fehler += f; pg.close()
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
