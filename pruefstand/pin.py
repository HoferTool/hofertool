# Anmeldung mit PIN: Kachel, falsche PIN, Sperre, Rückfall aufs Passwort, Admin setzt PIN
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.login_kacheln = [
  { id: 'u3', email: 'andrea@hoferco.ch', full_name: 'Andrea Meier', role: 'kurzdreher', ohne_passwort: true },
  { id: 'u1', email: 'marco@hoferco.ch', full_name: 'Marco Steiner', role: 'langdreher' }];
// Server nachbilden: PIN 123456 stimmt, nach 5 Fehlern 5 Minuten Sperre
window._fehler = 0;
TEST.funktionen['pin-anmelden'] = (b) => {
  if (b.offen) return window._keineFunktion ? null : { status: 'pin' };
  if (window._keineFunktion) return null;
  if (window._fehler >= 5) return { status: 'gesperrt', sekunden: 290 };
  if (b.pin === '123456') { window._fehler = 0; return { status: 'ok', token_hash: 'abc' }; }
  window._fehler++;
  return window._fehler >= 5 ? { status: 'gesperrt', sekunden: 300 } : { status: 'falsch', rest: 5 - window._fehler };
};
TEST.rpc.pin_vorhanden = () => [{ user_id: 'u2' }];
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

def seite(br, sitzung, vorher=""):
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("window.OHNE_SITZUNG = " + ("false" if sitzung else "true") + ";" + vorher)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    return pg, f

def toast(pg):
    return pg.evaluate("(() => { const t = [...document.querySelectorAll('.toast-bereich > *')]; return t.length ? t[t.length - 1].textContent.trim() : ''; })()")

def versuch(pg, pin):
    pg.fill("#lp", pin); pg.locator("#lk").click(); pg.wait_for_timeout(700)
    return toast(pg)

fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # 1. Kachel mit PIN: Feld nimmt Ziffern
    pg, f = seite(br, False)
    pg.locator(".login__kachel").nth(0).click(); pg.wait_for_timeout(500)
    feld = pg.evaluate("(() => { const e = document.getElementById('lp'); return [e.placeholder, e.inputMode]; })()")
    print("PIN-Feld:", feld)
    if feld != ["PIN", "none"]: fehler.append("PIN-Feld falsch")
    # 2. Falsche PIN: Restversuche
    m = versuch(pg, "1111"); print("1. falsch:", m)
    if "Noch 4 Versuche" not in m: fehler.append("Restversuche fehlen")
    for _ in range(3): m = versuch(pg, "1111")
    print("4. falsch:", m)
    if "Noch 1 Versuch" not in m: fehler.append("letzter Versuch nicht angesagt")
    m = versuch(pg, "1111"); print("5. falsch:", m)
    if "5 Minuten" not in m: fehler.append("Sperre nicht angesagt")
    # 3. Während der Sperre hilft auch die richtige PIN nicht
    m = versuch(pg, "123456"); print("richtig, aber gesperrt:", m)
    if "Minuten" not in m: fehler.append("Sperre wirkt nicht")
    print("noch auf der Anmeldung:", pg.evaluate("!!document.getElementById('lp')"))
    # 4. Nach der Sperre: richtige PIN meldet an
    pg.evaluate("window._fehler = 0")
    versuch(pg, "123456"); pg.wait_for_timeout(1500)
    tausch = pg.evaluate("TEST.protokoll.filter(x => x.art === 'verifyOtp').map(x => x.a.token_hash)")
    print("Schlüssel getauscht:", tausch, "| angemeldet:", pg.evaluate("!document.getElementById('lg-auswahl')"))
    if tausch != ["abc"]: fehler.append("Anmeldung nach PIN fehlt")
    fehler += f; pg.close()

    # 5. Server-Funktion fehlt: Rückfall aufs Passwortfeld
    pg, f = seite(br, False, "window._keineFunktion = true;")
    pg.locator(".login__kachel").nth(0).click(); pg.wait_for_timeout(500)
    m = versuch(pg, "123456"); pg.wait_for_timeout(500)
    print("ohne Server-Funktion:", m, "| Feld jetzt:", pg.evaluate("document.getElementById('lp').placeholder"))
    if pg.evaluate("document.getElementById('lp').placeholder") != "Passwort": fehler.append("kein Rückfall aufs Passwort")
    fehler += f; pg.close()

    # 6. Admin: Spalte Anmeldung, PIN setzen
    pg, f = seite(br, True)
    pg.evaluate("document.getElementById('kopf-einstellungen').click()"); pg.wait_for_timeout(1200)
    pg.locator("[data-einst='nutzer']").click(); pg.wait_for_timeout(1200)
    knoepfe = pg.evaluate("[...document.querySelectorAll('[data-pinsetzen]')].map(k => k.dataset.pinsetzen + ':' + k.textContent)")
    print("PIN-Knöpfe:", knoepfe)
    if "u2:PIN ändern" not in knoepfe: fehler.append("PIN ändern fehlt")
    pg.locator("[data-pinsetzen='u3']").click(); pg.wait_for_timeout(500)
    print("Ziffernfeld im Fenster:", pg.evaluate("document.querySelector('.dialog input[type=password]').inputMode"))
    pg.locator(".dialog input[type=password]").fill("654321")
    pg.locator(".dialog-huelle .knopf--haupt").last.click(); pg.wait_for_timeout(900)
    gesetzt = pg.evaluate("TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'pin_setzen').map(x => x.args)")
    print("pin_setzen:", gesetzt)
    if gesetzt != [{"p_pin": "654321", "p_ziel": "u3"}]: fehler.append("pin_setzen nicht aufgerufen")
    # 7. Admin setzt ein Passwort, ohne das alte zu kennen
    print("Passwort-Knöpfe:", pg.evaluate("[...document.querySelectorAll('[data-pwsetzen]')].map(k => k.dataset.pwsetzen)"))
    if pg.locator("[data-pwsetzen='u1']").count(): fehler.append("Passwort-Knopf beim eigenen Konto")
    pg.locator("[data-pwsetzen='u3']").click(); pg.wait_for_timeout(500)
    pg.locator(".dialog input[type=password]").nth(0).fill("NeuesPasswort1")
    pg.locator(".dialog input[type=password]").nth(1).fill("NeuesPasswort1")
    pg.locator(".dialog-huelle .knopf--haupt").last.click(); pg.wait_for_timeout(900)
    pw = pg.evaluate("TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'passwort_setzen').map(x => x.args)")
    print("passwort_setzen:", pw)
    if pw != [{"p_passwort": "NeuesPasswort1", "p_ziel": "u3"}]: fehler.append("passwort_setzen nicht aufgerufen")
    fehler += f; pg.close()
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
