# Anmeldung wie vor 111.12.0: offene Konten ohne Eingabe, PIN mit Ziffernblock, sonst Passwort
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.login_kacheln = [
  { id: 'u3', email: 'andrea@hoferco.ch', full_name: 'Andrea Meier', role: 'kurzdreher', ohne_passwort: true },
  { id: 'u4', email: 'beat@hoferco.ch', full_name: 'Beat Offen', role: 'langdreher', ohne_passwort: true },
  { id: 'u1', email: 'marco@hoferco.ch', full_name: 'Marco Steiner', role: 'langdreher' }];
// Server nachbilden: Andrea hat PIN 123456, Beat ist offen
window._aufrufe = [];
TEST.funktionen['pin-anmelden'] = (b) => {
  window._aufrufe.push(JSON.stringify(b));
  if (b.offen) return b.email === 'beat@hoferco.ch' ? { status: 'ok', token_hash: 'offen' }
    : b.email === 'andrea@hoferco.ch' ? { status: 'pin' } : { status: 'passwort' };
  return b.pin === '123456' ? { status: 'ok', token_hash: 'pin' } : { status: 'falsch', rest: 4 };
};
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

def seite(br, breite=1440, hoehe=900):
    pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("window.OHNE_SITZUNG = true;")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    return pg, f

def kachel(pg, name):
    pg.locator(".login__kachel", has_text=name).click(); pg.wait_for_timeout(1500)

def angemeldet(pg):
    return pg.evaluate("!document.getElementById('lg-auswahl')")

fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # 1. Offenes Konto: ein Tipp, drin
    pg, f = seite(br)
    pg.locator(".login__kachel", has_text="Beat").click(); pg.wait_for_timeout(700)
    mitte = pg.evaluate("""(() => { const e = document.querySelector('.login__flieger');
      if (!e) return null; const r = e.getBoundingClientRect();
      return [Math.round(r.left + r.width / 2 - innerWidth / 2), !!document.querySelector('.login__ring')]; })()""")
    print("Beat schwebt in der Mitte:", mitte)
    if not mitte or abs(mitte[0]) > 3 or not mitte[1]: fehler.append("Kachel schwebt nicht in die Mitte")
    pg.wait_for_timeout(1500)
    print("Beat angemeldet:", angemeldet(pg), pg.evaluate("window._aufrufe"))
    if not angemeldet(pg): fehler.append("offenes Konto kommt nicht rein")
    fehler += f; pg.close()

    # 2. Konto mit PIN: PIN-Feld mit Ziffernblock, Eingabe über die Tasten
    pg, f = seite(br, 820, 1180)
    kachel(pg, "Andrea")
    feld = pg.evaluate("document.getElementById('lp') && document.getElementById('lp').placeholder")
    tasten = pg.locator("[data-lz]").count()
    print("Andrea: Feld", feld, "| Tasten", tasten)
    if feld != "PIN" or tasten != 12: fehler.append("PIN-Feld oder Ziffernblock fehlt")
    pg.screenshot(path="/tmp/claude-0/-home-claude-hofertool/46e485a2-858c-5fdc-9377-488d9f3b6d4f/scratchpad/pin.png")
    for t in "1239⌫456": pg.locator(f"[data-lz='{t}']").click()
    wert = pg.evaluate("document.getElementById('lp').value"); print("Eingabe:", wert)
    if wert != "123456": fehler.append("Ziffernblock tippt falsch")
    pg.locator("#lk").click(); pg.wait_for_timeout(1500)
    print("Andrea angemeldet:", angemeldet(pg))
    if not angemeldet(pg): fehler.append("PIN-Anmeldung klappt nicht")
    fehler += f; pg.close()

    # 3. Konto mit Passwort: Passwortfeld, kein Ziffernblock, kein Serveraufruf
    pg, f = seite(br)
    kachel(pg, "Marco")
    feld = pg.evaluate("document.getElementById('lp').placeholder")
    print("Marco: Feld", feld, "| Tasten", pg.locator("[data-lz]").count(), "| Aufrufe", pg.evaluate("window._aufrufe"))
    if feld != "Passwort" or pg.locator("[data-lz]").count(): fehler.append("Passwortkonto falsch")
    fehler += f; pg.close()
    br.close()

print("Fehler:", "; ".join(fehler) if fehler else "keine")
