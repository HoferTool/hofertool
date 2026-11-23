# Angemeldet bleiben: Netzfehler vergisst den gemerkten Schlüssel nicht, Wiederholen klappt
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.login_kacheln = [
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
    pg.add_init_script("window.OHNE_SITZUNG = true; window.SITZUNG_MAIL = 'saheesan.hudson@hoferco.ch';"
        "localStorage.setItem('hofer.geraet.sitzungen', JSON.stringify({'saheesan.hudson@hoferco.ch': 'r-1'}));" + vorher)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    return pg, f

def gemerkt(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('hofer.geraet.sitzungen') || '{}')")

fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # 1. Zweimal Netz weg, dann klappt es: angemeldet, neuer Schlüssel gemerkt
    pg, f = seite(br, "window._refreshFehler = 2;")
    pg.locator(".login__kachel").first.click(); pg.wait_for_timeout(7000)
    n = pg.evaluate("TEST.protokoll.filter(x => x.art === 'refreshSession').length")
    print("Versuche:", n, "| gemerkt:", gemerkt(pg), "| Kacheln:", pg.evaluate("!!document.getElementById('lg-auswahl')"))
    if n < 3: fehler.append("kein Wiederholen")
    if pg.evaluate("!!document.getElementById('lp') || !!document.getElementById('lg-auswahl')"): fehler.append("nicht angemeldet nach Wiederholen")
    if gemerkt(pg).get("saheesan.hudson@hoferco.ch") in (None, "r-1"): fehler.append("neuer Schlüssel nicht gemerkt")
    fehler += f; pg.close()

    # 2. Netz ganz weg: Schlüssel bleibt, Hinweis, kein Passwortfeld
    pg, f = seite(br, "window._refreshFehler = 99;")
    pg.locator(".login__kachel").first.click(); pg.wait_for_timeout(7000)
    txt = pg.evaluate("document.body.innerText")
    print("gemerkt:", gemerkt(pg), "| Hinweis:", "nochmals antippen" in txt)
    if gemerkt(pg).get("saheesan.hudson@hoferco.ch") != "r-1": fehler.append("Schlüssel bei Netzfehler vergessen")
    if "nochmals antippen" not in txt: fehler.append("kein Hinweis bei Netzfehler")
    # danach wieder Netz: ein Tipp genügt
    pg.evaluate("window._refreshFehler = 0")
    pg.locator(".login__kachel").first.click(); pg.wait_for_timeout(3000)
    if pg.evaluate("!!document.getElementById('lp') || !!document.getElementById('lg-auswahl')"): fehler.append("zweiter Tipp meldet nicht an")
    fehler += f; pg.close()

    # 3. Abgelehnter Schlüssel wird weiterhin vergessen
    pg, f = seite(br, "")
    pg.evaluate("localStorage.setItem('hofer.geraet.sitzungen', JSON.stringify({'saheesan.hudson@hoferco.ch': 'alt'}))")
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    pg.evaluate("localStorage.setItem('hofer.geraet.sitzungen', JSON.stringify({'saheesan.hudson@hoferco.ch': 'alt'}))")
    pg.locator(".login__kachel").first.click(); pg.wait_for_timeout(2000)
    print("abgelehnt → gemerkt:", gemerkt(pg))
    if gemerkt(pg): fehler.append("abgelehnter Schlüssel nicht vergessen")
    fehler += f; pg.close()
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
