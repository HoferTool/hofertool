# Umfragen (seit 1.761.0): QR-Code öffnet sich beim Admin, setzt umfragen.qr,
# und die Abstimmseite public/abstimmen/ stimmt ohne Anmeldung ab
import time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
SP = "/tmp/claude-0/-home-user/b4de6780-b9b6-56fd-b3ec-af0e4ff596b0/scratchpad/"
DAZU = """
TEST.daten.umfragen = [{ id: "11111111-2222-3333-4444-555555555555", titel: "Wohin geht der Ausflug?", beschreibung: null,
  bild_url: null, mehrfach: false, offen: true, qr: false, sort: 0, erstellt_am: "2026-11-17T10:00:00Z",
  umfrage_vorschlaege: [{ id: "v-1", text: "Europapark", sort: 0 }, { id: "v-2", text: "Bowling", sort: 1 }],
  umfrage_stimmen: [] }];
"""
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + DAZU))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(900)
    pruefe("Knopf QR-Code da", pg.locator("[data-umfqr]").count() == 1)
    pg.click("[data-umfqr]"); pg.wait_for_selector("[data-umf-qrfenster]", timeout=5000)
    pruefe("QR als Bild", pg.locator(".umf-qr__bild svg").count() == 1)
    pruefe("qr gesetzt", pg.evaluate("TEST.daten.umfragen[0].qr") is True)
    link = pg.locator(".umf-qr__link a").get_attribute("href")
    pruefe("Link auf Abstimmseite", "/abstimmen/?u=11111111-2222-3333-4444-555555555555" in link)
    pg.locator("[data-umf-qrfenster]").screenshot(path=SP + "umfrage_qr.png")

    # Abstimmseite am Handy ohne Anmeldung
    h = br.new_context(viewport={"width": 390, "height": 844}).new_page()
    h.on("pageerror", lambda e: fehler.append("SEITENFEHLER Handy: " + str(e)[:160]))
    h.add_init_script("""
      window.__st = [];
      window.TEST_RPC = async (n, d) => {
        if (n === 'umfrage_qr_lesen') return { id: d.p_umfrage, titel: 'Wohin geht der Ausflug?', beschreibung: 'Bis Freitag',
          bild_url: null, mehrfach: false, offen: true, leute: window.__st.length,
          vorschlaege: [{ id: 'v-1', text: 'Europapark', stimmen: window.__st.filter(s => s.v === 'v-1').length },
                        { id: 'v-2', text: 'Bowling', stimmen: window.__st.filter(s => s.v === 'v-2').length }] };
        if (n === 'umfrage_qr_abstimmen') { d.p_vorschlaege.forEach(v => window.__st.push({ v, name: d.p_name })); return null; }
      };""")
    h.goto(link)
    h.wait_for_selector("[data-v]")
    pruefe("Handy: zwei Vorschläge", h.locator("[data-v]").count() == 2)
    h.click("[data-v='v-2']"); h.fill("#name", "Saheesan"); h.click("#senden"); h.wait_for_timeout(300)
    pruefe("Handy: Stimme gesendet", h.evaluate("JSON.stringify(window.__st)") == json.dumps([{"v": "v-2", "name": "Saheesan"}], separators=(",", ":")))
    pruefe("Handy: Danke", "Danke, Saheesan" in h.inner_text("#inhalt"))
    pruefe("Handy: Ergebnis", "1 · 100 %" in h.inner_text("#inhalt"))
    pruefe("Handy: nicht breiter", h.evaluate("document.documentElement.scrollWidth <= 390"))
    h.screenshot(path=SP + "umfrage_qr_handy.png", full_page=True)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
