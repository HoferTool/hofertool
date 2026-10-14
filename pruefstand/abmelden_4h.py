# Nach 4 Stunden ohne Bedienung immer abmelden (1.54.0, Wunsch Patrick
# 14. Oktober 2026: „egal was man eingestellt hat“): auch mit
# „Angemeldet bleiben“ und nach geschlossenem Tab. Gerätekonten
# („Andere Nutzer“) bleiben angemeldet.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.login_kacheln = [
  { email: 'saheesan.hudson@hoferco.ch', full_name: 'Marco Steiner', role: 'langdreher', andere_nutzer: false }];
if (window.BLEIBEN) daten.profiles[0].einstellungen = { angemeldetbleiben: 'true' };
if (window.PROFIL_ANDERE) { daten.profiles[0].andere_nutzer = true; daten.profiles[0].email = window.SITZUNG_MAIL; }
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

def seite(br, vorher=""):
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.clock.install()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script(vorher)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    return pg, f

def angemeldet(pg):
    return pg.evaluate("!document.getElementById('lg-auswahl') && !document.getElementById('lp')")

def text(pg):
    return pg.evaluate("document.body.textContent")

fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FEHLT"), name)
    if not ok: fehler.append(name)

STD = 60 * 60 * 1000
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # 1. Person mit „Angemeldet bleiben“: nach 3 Stunden noch da, nach 4 weg
    pg, f = seite(br, "window.OHNE_SITZUNG = false; window.SITZUNG_MAIL = 'saheesan.hudson@hoferco.ch'; window.BLEIBEN = true;")
    pruefe("Bleiben: angemeldet", angemeldet(pg))
    pg.clock.fast_forward(3 * STD); pg.wait_for_timeout(1000)
    pruefe("Bleiben: nach 3 Stunden noch angemeldet", angemeldet(pg))
    pg.mouse.click(700, 450); pg.wait_for_timeout(300)
    pg.clock.fast_forward(3 * STD + 50 * 60 * 1000); pg.wait_for_timeout(1000)
    pruefe("Bleiben: Klick setzt die 4 Stunden zurück", angemeldet(pg))
    pg.clock.fast_forward(15 * 60 * 1000); pg.wait_for_timeout(1500)
    pruefe("Bleiben: nach 4 Stunden ohne Bedienung abgemeldet", not angemeldet(pg))
    pruefe("Bleiben: Meldung 4 Stunden", "nach 4 Stunden ohne Bedienung" in text(pg))
    fehler += f; pg.close()

    # 2. Tab zu oder Rechner im Ruhezustand: letzte Bedienung vor 5 Stunden
    vor5 = "localStorage.setItem('hofer.zuletztAktiv', JSON.stringify({ u1: Date.now() - 5 * 3600000 }));"
    pg, f = seite(br, "window.OHNE_SITZUNG = false; window.SITZUNG_MAIL = 'saheesan.hudson@hoferco.ch'; window.BLEIBEN = true;"
                  + "if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); " + vor5 + " }")
    pruefe("Beim Öffnen nach 5 Stunden: abgemeldet", not angemeldet(pg))
    pruefe("Beim Öffnen: Meldung 4 Stunden", "nach 4 Stunden ohne Bedienung" in text(pg))
    fehler += f; pg.close()

    # 3. Vor 2 Stunden zuletzt bedient: bleibt angemeldet
    pg, f = seite(br, "window.OHNE_SITZUNG = false; window.SITZUNG_MAIL = 'saheesan.hudson@hoferco.ch'; window.BLEIBEN = true;"
                  "localStorage.setItem('hofer.zuletztAktiv', JSON.stringify({ u1: Date.now() - 2 * 3600000 }));")
    pruefe("Beim Öffnen nach 2 Stunden: angemeldet", angemeldet(pg))
    fehler += f; pg.close()

    # 4. Gerätekonto: auch nach 5 Stunden angemeldet, beim Öffnen und laufend
    pg, f = seite(br, "window.OHNE_SITZUNG = false; window.SITZUNG_MAIL = 'planwand@hoferco.ch'; window.PROFIL_ANDERE = true;"
                  "localStorage.setItem('hofer.zuletztAktiv', JSON.stringify({ u1: Date.now() - 5 * 3600000 }));")
    pruefe("Gerätekonto: beim Öffnen angemeldet", angemeldet(pg))
    pg.clock.fast_forward(5 * STD); pg.wait_for_timeout(1000)
    pruefe("Gerätekonto: nach 5 Stunden angemeldet", angemeldet(pg))
    fehler += f; pg.close()
    # 5. Neue Anmeldung nach langer Pause: die 4 Stunden beginnen neu
    pg, f = seite(br, "window.OHNE_SITZUNG = true; window.SITZUNG_MAIL = 'saheesan.hudson@hoferco.ch';"
                  "if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); "
                  "localStorage.setItem('hofer.zuletztAktiv', JSON.stringify({ u1: Date.now() - 9 * 3600000 })); }")
    pg.locator(".login__kachel", has_text="Marco").click(); pg.wait_for_timeout(900)
    pg.evaluate("window.OHNE_SITZUNG = false")
    pg.fill("#lp", "geheim"); pg.locator("#lk").click(); pg.wait_for_timeout(5000)
    pruefe("Neue Anmeldung: angemeldet", angemeldet(pg))
    alt = pg.evaluate("Date.now() - JSON.parse(localStorage.getItem('hofer.zuletztAktiv')).u1")
    pruefe("Neue Anmeldung: letzte Bedienung neu gesetzt", alt < 60000)
    fehler += f; pg.close()
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
