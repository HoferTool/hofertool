# Steckdosen (1.291.0, Wunsch Patrick 29. Oktober 2026): Hombli-Steckdosen
# über die Server-Funktion steckdosen anzeigen und schalten.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

MIT = FAKE + """;
TEST.sd = [
  { id: 'a1', name: 'Kaffeemaschine', online: true, schalter: [{ code: 'switch_1', an: true }], watt: 1203.4 },
  { id: 'b2', name: 'Kompressor', online: true, schalter: [{ code: 'switch_1', an: false }], watt: 0 },
  { id: 'c3', name: 'Lampe Lager', online: false, schalter: [{ code: 'switch_1', an: false }], watt: null },
];
TEST.funktionen = { steckdosen: (b) => {
  if (b && b.aktion === 'schalten') TEST.sd.find(g => g.id === b.id).schalter.find(s => s.code === b.code).an = b.an;
  return { geraete: JSON.parse(JSON.stringify(TEST.sd)), darfSchalten: true };
} };
"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for breite, hoehe in [(1440, 900), (390, 844)]:
        pg = br.new_page(viewport={"width": breite, "height": hoehe})
        pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=MIT))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#/steckdosen", wait_until="domcontentloaded")
        pg.wait_for_selector(".sd-karte", timeout=15000); pg.wait_for_timeout(600)
        pruefe(pg.locator(".sd-karte").count() == 3, "drei Steckdosen")
        t = pg.inner_text("[data-steckdose='a1']")
        pruefe("1'203 W" in t and "Ein" in t, "Watt und Ein: %r" % t)
        pruefe("nicht erreichbar" in pg.inner_text("[data-steckdose='c3']"), "offline angezeigt")
        pruefe(pg.locator("[data-steckdose='c3'] button").is_disabled(), "offline nicht schaltbar")
        pg.click("[data-steckdose='b2'] button"); pg.wait_for_timeout(800)
        pruefe(pg.evaluate("() => TEST.sd[1].schalter[0].an") is True, "Kompressor eingeschaltet")
        pruefe("Ein" in pg.inner_text("[data-steckdose='b2'] button"), "Knopf zeigt Ein")
        pg.screenshot(path="/tmp/claude-0/steckdosen-%d.png" % breite)
        pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
        pg.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
