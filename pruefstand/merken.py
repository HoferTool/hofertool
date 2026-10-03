# Gerät merkt sich die Anmeldung: Häkchen, nur lokal abmelden, ein Tipp auf die Kachel, alter Schlüssel
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.login_kacheln = [
  { id: 'u3', email: 'andrea@hoferco.ch', full_name: 'Andrea Meier', role: 'kurzdreher', ohne_passwort: true },
  { id: 'u1', email: 'saheesan.hudson@hoferco.ch', full_name: 'Marco Steiner', role: 'langdreher' }];
TEST.schluessel = ['r-1'];
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

def seite(br, vorher=""):
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("window.OHNE_SITZUNG = true; window.SITZUNG_MAIL = 'saheesan.hudson@hoferco.ch';" + vorher)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    return pg, f

def gemerkt(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('hofer.geraet.sitzungen') || '{}')")

def abmelden(pg):
    pg.evaluate("document.getElementById('kopf-einstellungen').click()"); pg.wait_for_timeout(1200)
    pg.locator("#ab").click(); pg.wait_for_timeout(400)
    frage = pg.evaluate("[...document.querySelectorAll('.dialog-huelle')].pop().textContent")
    pg.locator(".dialog-huelle .knopf--haupt").last.click(); pg.wait_for_timeout(1500)
    return frage

fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # 1. Mit Passwort anmelden, Häkchen ist gesetzt: Gerät merkt sich den Schlüssel
    pg, f = seite(br)
    pg.locator(".login__kachel").nth(1).click(); pg.wait_for_timeout(500)
    haken = pg.evaluate("(() => { const e = document.getElementById('lmerk'); return !!(e && e.checked); })()")
    print("Häkchen da und gesetzt:", haken)
    if not haken: fehler.append("Häkchen fehlt")
    pg.screenshot(path="/tmp/merken_maske.png")
    pg.evaluate("window.OHNE_SITZUNG = false")
    pg.fill("#lp", "geheim"); pg.locator("#lk").click(); pg.wait_for_timeout(1500)
    print("gemerkt:", gemerkt(pg))
    if gemerkt(pg) != {"saheesan.hudson@hoferco.ch": "r-1"}: fehler.append("nicht gemerkt")

    # 2. Abmelden: nur hier, die Sitzung auf dem Server bleibt
    frage = abmelden(pg)
    print("Frage:", frage)
    if "Tipp auf deine Kachel" not in frage: fehler.append("Abmeldefrage nicht angepasst")
    abm = pg.evaluate("TEST.protokoll.filter(x => x.art === 'signOut').length")
    print("signOut beim Server:", abm, "| Kacheln sichtbar:", pg.evaluate("!!document.getElementById('lg-auswahl')"), "| gemerkt:", gemerkt(pg))
    if abm: fehler.append("Sitzung auf dem Server beendet")
    if "saheesan.hudson@hoferco.ch" not in gemerkt(pg): fehler.append("nach Abmelden vergessen")
    fehler += f; pg.close()

    # 3. Ein Tipp auf die Kachel genügt
    pg, f = seite(br, "localStorage.setItem('hofer.geraet.sitzungen', JSON.stringify({'saheesan.hudson@hoferco.ch': 'r-1'}));")
    pg.locator(".login__kachel").nth(1).click(); pg.wait_for_timeout(1500)
    print("refreshSession:", pg.evaluate("TEST.protokoll.filter(x => x.art === 'refreshSession').map(x => x.a.refresh_token)"),
          "| Passwortfeld:", pg.evaluate("!!document.getElementById('lp')"), "| gemerkt:", gemerkt(pg))
    if pg.evaluate("!!document.getElementById('lp') || !!document.getElementById('lg-auswahl')"): fehler.append("nicht direkt angemeldet")
    if gemerkt(pg).get("saheesan.hudson@hoferco.ch") != "r-2": fehler.append("neuer Schlüssel nicht abgelegt")
    fehler += f; pg.close()

    # 4. Alter Schlüssel: vergessen, Passwortfeld erscheint
    pg, f = seite(br, "localStorage.setItem('hofer.geraet.sitzungen', JSON.stringify({'saheesan.hudson@hoferco.ch': 'alt'}));")
    pg.locator(".login__kachel").nth(1).click(); pg.wait_for_timeout(1500)
    feld = pg.evaluate("(() => { const e = document.getElementById('lp'); return e && e.placeholder; })()")
    print("alter Schlüssel → Feld:", feld, "| gemerkt:", gemerkt(pg))
    if feld != "Passwort": fehler.append("kein Passwortfeld bei altem Schlüssel")
    if gemerkt(pg): fehler.append("alter Schlüssel nicht vergessen")

    # 5. Ohne Häkchen: nichts merken, Abmelden beendet die Sitzung wie bisher
    pg.evaluate("window.OHNE_SITZUNG = false")
    pg.locator("#lmerk").uncheck(); pg.fill("#lp", "geheim"); pg.locator("#lk").click(); pg.wait_for_timeout(1500)
    print("ohne Häkchen gemerkt:", gemerkt(pg))
    if gemerkt(pg): fehler.append("trotz fehlendem Häkchen gemerkt")
    print("Frage:", abmelden(pg))
    if not pg.evaluate("TEST.protokoll.filter(x => x.art === 'signOut').length"): fehler.append("signOut fehlt ohne Merken")
    fehler += f; pg.close()
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
