# Stündlich nach neuer Fassung schauen (1.514.0, Patrick 13. November 2026:
# „lädt neu, aber ohne die neue Version zu holen“): Nach einer Stunde fragt
# die App den Server. Gleiche Fassung: kein Neuladen. Neue Fassung: neu
# geladen über eine Adresse mit ?fassung=…, die sicher frisch kommt.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.login_kacheln = [
  { email: 'andrea@hoferco.ch', full_name: 'Andrea Meier', role: 'kurzdreher', ohne_passwort: true },
  { email: 'saheesan.hudson@hoferco.ch', full_name: 'Marco Steiner', role: 'langdreher' }];
// Der Nachbau hat keinen Sitzungsspeicher: Die Marke im sessionStorage
// steht für die Sitzung, die bei der echten Supabase das Neuladen übersteht
// Seit 1.75.0 kommt ohne PIN nur noch ein gemerktes Gerät mit einem Tipp hinein
TEST.schluessel = { includes: (k) => !!k };
try { const _g = JSON.parse(localStorage.getItem('hofer.geraet.sitzungen') || '{}');
  if (!('andrea@hoferco.ch' in _g)) _g['andrea@hoferco.ch'] = 'g-1';
  localStorage.setItem('hofer.geraet.sitzungen', JSON.stringify(_g)); } catch (_f) {}
window._beiRefresh = () => sessionStorage.setItem('fake.sitzung', '1');
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
    pg.clock.install()
    pg.add_init_script("window.OHNE_SITZUNG = !sessionStorage.getItem('fake.sitzung');" + vorher)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    nav = []; pg.on("framenavigated", lambda fr: nav.append(fr.url) if fr == pg.main_frame else None)
    return pg, f, nav

fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FEHLT"), name)
    if not ok: fehler.append(name)

def anmelden(pg):
    pg.locator(".login__kachel", has_text="Andrea").click(); pg.wait_for_timeout(2500)
    pg.evaluate("window.__marke = 1")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # 1. Gleiche Fassung: nach über einer Stunde kein Neuladen
    pg, f, nav = seite(br)
    gefragt = []
    pg.on("request", lambda r: gefragt.append(1) if "index.html?stand=" in r.url else None)
    anmelden(pg)
    pruefe("angemeldet", pg.evaluate("!document.getElementById('lg-auswahl')"))
    vorher = len(gefragt)
    pg.clock.fast_forward(62 * 60 * 1000); pg.wait_for_timeout(3000)
    pruefe("gleiche Fassung: Server gefragt", len(gefragt) > vorher)
    pruefe("gleiche Fassung: nicht neu geladen", pg.evaluate("window.__marke === 1"))
    fehler += f; pg.close()

    # 2. Neue Fassung erscheint erst nach dem Start: nach einer Stunde neu geladen mit ?fassung=
    neu = {"an": False}
    pg, f, nav = seite(br)
    pg.unroute("**/index.html?stand=*")
    pg.route("**/index.html?stand=*", lambda r: r.fulfill(status=200, content_type="text/html", body=NEU) if neu["an"] else r.continue_())
    anmelden(pg)
    neu["an"] = True
    pg.clock.fast_forward(62 * 60 * 1000); pg.wait_for_timeout(5000)
    pruefe("neue Fassung: neu geladen", pg.evaluate("window.__marke === undefined"))
    pruefe("neue Fassung: über Adresse mit ?fassung=", any("fassung=NEU" in u for u in nav))
    pruefe("neue Fassung: Zusatz danach aus der Adresse", "fassung=" not in pg.url)
    pruefe("neue Fassung: Anmeldung übersteht das", pg.evaluate("!document.getElementById('lg-auswahl')"))
    fehler += f; pg.close()
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
