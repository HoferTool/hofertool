import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
zusatz = """daten.login_kacheln = [
  { id: 'u1', email: 'saheesan.hudson@hoferco.ch', full_name: 'Saheesan Hudson', role: 'admin' },
  { id: 'u2', email: 'ramona@hoferco.ch', full_name: 'Ramona', role: 'mitarbeiter', ohne_passwort: true },
  { id: 'u3', email: 'kontakt@zurbruegg.ch', full_name: 'Zurbrügg', role: 'extern' }];
TEST.daten = daten;"""
MARKIERT = "localStorage.setItem('hofer.geraet', 'extern'); localStorage.setItem('hofer.geraet.konten', JSON.stringify(['saheesan.hudson@hoferco.ch']));"
kacheln = "[...document.querySelectorAll('.login__kachel .login__kachel-name')].map(k=>k.textContent)"
def lauf(br, vorher, sitzung, pfad=""):
    pg = br.new_context(viewport={"width":1200,"height":850}).new_page()
    pg.on("pageerror", lambda e: print("  Seitenfehler:", str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE.replace("TEST.daten = daten;", zusatz)))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("window.OHNE_SITZUNG = " + ("false" if sitzung else "true") + ";")
    if vorher:
        pg.add_init_script("try { if (location.protocol.startsWith('http') && !sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); " + vorher + " } } catch (e) {}")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html{pfad}", wait_until="domcontentloaded"); pg.wait_for_timeout(2500)
    return pg
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ANMELDUNG, ANGEMELDET = False, True
    pg = lauf(br, "", ANMELDUNG)
    print("eigenes Gerät, normal:", pg.evaluate(kacheln))
    pg = lauf(br, MARKIERT, ANMELDUNG)
    print("so sah es bei dir aus (Gerät markiert):", pg.evaluate(kacheln))
    pg = lauf(br, MARKIERT, ANGEMELDET)
    print("nach deiner Anmeldung ist die Markierung:", pg.evaluate("localStorage.getItem('hofer.geraet') || 'weg'"))
    pg = lauf(br, MARKIERT, ANMELDUNG, "#/intern")
    print("über #/intern:", pg.evaluate(kacheln), "| Markierung:", pg.evaluate("localStorage.getItem('hofer.geraet') || 'weg'"),
          "| Adresse:", pg.evaluate("location.hash || '(leer)'"))
    br.close()
