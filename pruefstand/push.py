# Push-Mitteilungen (1.35.0): Feld „Mitteilungen einschalten?“ nach dem
# Start, Gerät anmelden, Schalter in den Einstellungen, Admin sendet.
# Service Worker und Push-Dienst sind nachgebaut, die gibt es auf
# http://127.0.0.1 nicht.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

NACHBAU = """
(() => {
  let erlaubnis = 'default';
  window.__abo = null;
  const abo = () => ({ endpoint: 'https://push.example/abc', unsubscribe: async () => { window.__abo = null; return true; },
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } }) });
  const reg = { active: {}, pushManager: {
    getSubscription: async () => window.__abo,
    subscribe: async () => (window.__abo = abo()) } };
  Object.defineProperty(navigator, 'serviceWorker', { value: {
    register: async () => reg, getRegistration: async () => reg, ready: Promise.resolve(reg) } });
  window.Notification = function () {};
  Object.defineProperty(window.Notification, 'permission', { get: () => erlaubnis });
  window.Notification.requestPermission = async () => (erlaubnis = 'granted');
})();
"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script(NACHBAU)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200])); pg.on("console", lambda m: print("KONSOLE", m.text[:200]) if "Push" in m.text or "TEST" in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""TEST.funktionen = { 'push-senden': (b) => b ? { geraete: 3, erreicht: 2 } : { schluessel: 'BAAA' } };
      TEST.rpc.push_geraete_zahl = () => 3;""")
    pg.wait_for_timeout(3500)

    pruefe("Feld „Mitteilungen einschalten?“ erscheint", pg.locator(".push-hinweis").count() == 1)
    pg.locator(".push-hinweis button", has_text="Einschalten").click(); pg.wait_for_timeout(600)
    pruefe("Feld weg", pg.locator(".push-hinweis").count() == 0)
    abos = pg.evaluate("TEST.protokoll.filter(x => x.name === 'push_abo_setzen')")
    pruefe("Gerät angemeldet", len(abos) == 1 and abos[0]["args"]["p_endpoint"] == "https://push.example/abc")

    # Einstellungen: Schalter an, ausschalten meldet ab
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pruefe("Schalter Push an", pg.locator("#e-push").is_checked())
    pruefe("Admin sieht Senden", pg.locator("#push-senden").count() == 1)
    pg.locator("#e-push").uncheck(); pg.wait_for_timeout(600)
    pruefe("abgemeldet", pg.evaluate("TEST.protokoll.some(x => x.name === 'push_abo_entfernen')")
           and pg.evaluate("window.__abo") is None)
    pg.locator("#e-push").check(); pg.wait_for_timeout(600)
    pruefe("wieder angemeldet", pg.evaluate("TEST.protokoll.filter(x => x.name === 'push_abo_setzen').length") == 2)

    # Senden
    pg.locator("#push-senden").click(); pg.wait_for_timeout(500)
    pruefe("Dialog nennt Geräte", "3 Geräte" in pg.inner_text(".dialog-huelle:last-child"))
    pg.locator(".dialog-huelle:last-child input").first.fill("Info")
    pg.locator(".dialog-huelle:last-child textarea").fill("Morgen Betriebsversammlung")
    pg.locator(".dialog-huelle:last-child [data-ja]").click(); pg.wait_for_timeout(600)
    gesendet = pg.evaluate("TEST.protokoll.filter(x => x.art === 'funktion' && x.name === 'push-senden' && x.body)")
    pruefe("an Server geschickt", len(gesendet) == 1 and gesendet[0]["body"]["text"] == "Morgen Betriebsversammlung")
    pruefe("Meldung mit Zahl", "2 von 3" in pg.inner_text(".toast-bereich"))
    pg.screenshot(path="/tmp/claude-0/push-einst.png")

    # Historie (1.36.0)
    pg.evaluate("""TEST.daten.push_nachrichten = [
      { id: 1, titel: 'Info', text: 'Morgen Betriebsversammlung', von: 'u1', gesendet: '2026-10-12T15:00:00Z', geraete: 3, erreicht: 2 },
      { id: 2, titel: null, text: 'Kaffee ist da', von: 'u1', gesendet: '2026-10-11T07:00:00Z', geraete: 3, erreicht: 3 }]""")
    pg.locator("#push-historie").click(); pg.wait_for_timeout(600)
    h = pg.locator(".push-historie")
    pruefe("Historie offen", h.count() == 1)
    t = h.inner_text() if h.count() else ""
    pruefe("Historie zeigt Nachrichten", "Betriebsversammlung" in t and "Kaffee ist da" in t)
    pruefe("Historie zeigt Angekommen", "2 von 3" in t and "3 von 3" in t)
    pruefe("neueste zuerst", t.find("Betriebsversammlung") < t.find("Kaffee"))
    pg.screenshot(path="/tmp/claude-0/push-historie.png")
    # Löschen (1.39.0): einzeln mit einer Rückfrage, über die Server-Funktion
    pg.evaluate("""TEST.funktionen['push-senden'] = (b) => b && b.loeschen ? { geloescht: 1 } : b ? { geraete: 3, erreicht: 2 } : { schluessel: 'BAAA' }""")
    pg.locator("[data-pushweg='2']").click(); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle:last-child [data-ja]").click(); pg.wait_for_timeout(600)
    weg = pg.evaluate("TEST.protokoll.filter(x => x.art === 'funktion' && x.body && x.body.loeschen)")
    pruefe("einzeln gelöscht", len(weg) == 1 and weg[0]["body"]["loeschen"] == [2])
    pruefe("Zeile weg", "Kaffee ist da" not in pg.inner_text(".push-historie") and "Betriebsversammlung" in pg.inner_text(".push-historie"))
    pg.locator("#push-alleweg").click(); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle:last-child [data-ja]").click(); pg.wait_for_timeout(600)
    weg = pg.evaluate("TEST.protokoll.filter(x => x.art === 'funktion' && x.body && x.body.loeschen)")
    pruefe("alles gelöscht", len(weg) == 2 and weg[1]["body"]["loeschen"] == "alle")
    pruefe("Historie leer", "Noch keine Nachricht" in pg.inner_text(".push-historie"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Historie zu, Einstellungen offen", pg.locator(".push-historie").count() == 0 and pg.locator(".dialog--einstellungen").count() == 1)

    # Ohne Server-Schlüssel kein Feld
    pg2 = ctx.new_page()
    pg2.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg2.route(u, lambda r: r.abort())
    pg2.add_init_script("try { localStorage.removeItem('hofer.push.schluessel'); localStorage.removeItem('hofer.push.spaeter'); } catch (e) {}")
    pg2.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg2.wait_for_selector("#inhalt"); pg2.wait_for_timeout(3500)
    pruefe("ohne Server kein Feld", pg2.locator(".push-hinweis").count() == 0)

    pruefe("keine Skriptfehler", not f)
    if f: print(f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
