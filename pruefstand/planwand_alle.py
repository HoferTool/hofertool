# Planwand für alle ganz (Wunsch Patrick, 12. Oktober 2026, seit 1.35.0):
# Ein Kurzdreher sieht auf der Planwand alle Parks, in der Produktion
# nur seinen eigenen. Mit fest zugewiesenem Park genauso.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

ROLLE = '''role: "admin", is_active: true, geburtstag: null, bild_url: null, parks: [],'''
assert ROLLE in FAKE

def lauf(br, rolle, parks, name):
    F = FAKE.replace(ROLLE, f'''role: "{rolle}", is_active: true, geburtstag: null, bild_url: null, parks: {parks},''')
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    alle = pg.evaluate("TEST.daten.machines.filter(m => m.is_active !== false).length")
    zeilen = pg.evaluate("new Set([...document.querySelectorAll('.pw-tafel [data-mzeile]')].map(e => e.dataset.mzeile)).size")
    pruefe(f"{name}: Planwand zeigt alle Maschinen ({zeilen} von {alle})", zeilen == alle)
    pruefe(f"{name}: Planwand hat Balken aus beiden Parks", pg.evaluate("""() => {
      const park = Object.fromEntries(TEST.daten.machines.map(m => [m.id, m.park_id]));
      const ids = new Set([...document.querySelectorAll('.pw-balken[data-auftrag]')].map(b => b.dataset.auftrag));
      return new Set(TEST.daten.planwand.filter(j => ids.has(j.id)).map(j => park[j.machine_id])).size >= 2; }"""))
    pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(1500)
    sichtbar = pg.evaluate("""() => {
      const ids = new Set([...document.querySelectorAll('[data-maschine]')].map(e => e.dataset.maschine));
      const park = Object.fromEntries(TEST.daten.machines.map(m => [m.id, m.park_id]));
      // Die Produktion zeigt einen Park auf einmal, die übrigen als Knöpfe
      const knoepfe = [...document.querySelectorAll('button[data-park]')].map(b => b.dataset.park);
      return [...new Set([...ids].map(i => park[i]).concat(knoepfe))]; }""")
    pg.screenshot(path=f"/tmp/planwand_alle_{rolle}.png")
    pg.close()
    return sichtbar

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    # Parks aus dem Nachbau: P1 Langdreher, P2 Kurzdreher
    p1, p2 = "p-lang", "p-kurz"
    s = lauf(br, "kurzdreher", "[]", "Kurzdreher")
    pruefe(f"Kurzdreher: Produktion nur Kurzdreherpark ({s})", s == [p2])
    s = lauf(br, "mitarbeiter", f'["{p1}"]', "Zugewiesen Langdreher")
    pruefe(f"Zugewiesen: Produktion nur Langdreherpark ({s})", s == [p1])
    s = lauf(br, "admin", "[]", "Admin")
    pruefe(f"Admin: Produktion beide Parks ({s})", sorted(s) == sorted([p1, p2]))
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
