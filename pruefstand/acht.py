import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.login_kacheln = [
  { id: 'u4', email: 'zoe@hoferco.ch', full_name: 'Zoe Weber', role: 'mitarbeiter' },
  { id: 'u1', email: 'marco@hoferco.ch', full_name: 'Marco Steiner', role: 'langdreher' },
  { id: 'u3', email: 'andrea@hoferco.ch', full_name: 'Andrea Meier', role: 'kurzdreher', ohne_passwort: true },
  { id: 'u9', email: 'ramona@hoferco.ch', full_name: 'ramona Keller', role: 'planwand' }];
daten.jobs.forEach(j => { j.drawing_url = 'https://x.supabase.co/storage/v1/object/public/zeichnungen/z.pdf'; }); daten.hoco_parts.forEach(h => { h.zeichnung_url = 'https://x.supabase.co/storage/v1/object/public/zeichnungen/z.pdf'; });
window._anmeldungen = [];
TEST.funktionen['pin-anmelden'] = (b) => { if (b.offen) return { status: 'pin' }; window._anmeldungen.push('PIN ' + b.pin); return b.pin === '4711' ? { status: 'ok', token_hash: 'x' } : { status: 'falsch', rest: 4 }; };
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
# Anmeldung nachbilden: Passwörter sind alle falsch, nur die PIN 4711 stimmt
F = F.replace("signInWithPassword: () => Promise.resolve({ data: {}, error: null }),",
  "signInWithPassword: (a) => { window._anmeldungen.push(a.password); return Promise.resolve({ data: null, error: { message: 'Invalid login credentials' } }); },")
F = F.replace("updateUser: () => Promise.resolve({ data: {}, error: null }),",
  "updateUser: (a) => { window._neuesPw = a.password; return Promise.resolve({ data: {}, error: null }); },")
def seite(br, sitzung, w=1440, h=900):
    pg = br.new_context(viewport={"width":w,"height":h}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("window.OHNE_SITZUNG = " + ("false" if sitzung else "true") + ";")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    return pg, f
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    fehler = []
    # Kacheln und PIN-Anmeldung
    pg, f = seite(br, False)
    print("Kacheln:", pg.evaluate("[...document.querySelectorAll('.login__kachel-name')].map(k => k.textContent)"))
    pg.locator(".login__kachel").nth(0).click(); pg.wait_for_timeout(500)
    pg.fill("#lp", "4711"); pg.locator("#lk").click(); pg.wait_for_timeout(1500)
    print("PIN-Anmeldung, versucht:", pg.evaluate("window._anmeldungen"))
    fehler += f; pg.close()
    # Startseite: Logo; Einstellungen: PIN speichern
    pg, f = seite(br, True)
    print("Logo auf der Startseite:", pg.evaluate("!!document.querySelector('.kopfkarte .kopfkarte__logo')"))
    pg.evaluate("document.getElementById('kopf-einstellungen').click()"); pg.wait_for_timeout(1300)
    pg.fill("#mk-pin", "4711"); pg.fill("#mk-pin2", "4711"); pg.locator("#mk-pinknopf").click(); pg.wait_for_timeout(800)
    print("PIN in den Einstellungen → gespeichert:", pg.evaluate("TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'pin_setzen').map(x => x.args.p_pin)"),
          "| Passwort unverändert:", pg.evaluate("window._neuesPw === undefined"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    # Woche
    pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(1500)
    pg.locator("[data-modus='woche']").click(); pg.wait_for_timeout(1300)
    print("Woche — Tagesspalte breit:", pg.evaluate("Math.round(document.querySelector('.raster--woche tbody td:not(.fest)').getBoundingClientRect().width)"), "px",
          "| linke Spalte:", pg.evaluate("Math.round(document.querySelector('.raster--woche th.fest').getBoundingClientRect().width)"), "px")
    fehler += f; pg.close()
    # Pad: Zeichnung, dann Zurück
    pg, f = seite(br, True, 1180, 820)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1200)
    pg.locator("#pad >> text=Maschinen").first.click(); pg.wait_for_timeout(1000)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1000)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1500)
    mat = pg.evaluate("(() => { const k = document.querySelector('.pad-karte2--material'); const c = getComputedStyle(k); return [k.className, c.backgroundColor, c.color]; })()")
    print("Materialkachel:", mat)
    pg.locator("#pad [data-padreiter='zeichnung']").click(); pg.wait_for_timeout(1000)
    print("Zeichnung offen:", pg.evaluate("(document.querySelector('.betrachter iframe')||{}).src||'—'"))
    pg.locator(".betrachter [data-zu]").click(); pg.wait_for_timeout(1200)
    print("nach Zurück:", pg.evaluate("document.querySelector('.pad__titel') ? document.querySelector('.pad__titel').textContent : ''"),
          "| Stückzahl-Kachel da:", pg.evaluate("!!document.querySelector('[data-padfeld], .pad-karte2--material')"))
    pg.locator("#pad [data-padzurueck]").click(); pg.wait_for_timeout(1200)
    print("nochmals Zurück:", pg.evaluate("[...document.querySelectorAll('#pad .pad-kachel')].length"), "Maschinenkacheln")
    fehler += f
    print("Fehler:", fehler[:3] if fehler else "keine")
    br.close()
