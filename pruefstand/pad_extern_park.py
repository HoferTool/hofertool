# Park „Extern“ im Pad Mode nur für Externe und Admins (1.520.0,
# Wunsch Patrick 13. November 2026): bei Admin sichtbar, bei Mechaniker
# weder bei den Parks noch im QS Check.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def koerper(rolle):
    zusatz = """
(() => {
  daten.machine_parks.push({ id: 'pext', name: 'Extern', is_active: true, sort_order: 10 });
  const m = Object.assign({}, daten.machines[0], { id: 'mext', name: 'Zurbrügg 1', machine_number: '901', park_id: 'pext' });
  daten.machines.push(m);
  daten.profiles[0].role = '%s';
})();
""" % rolle
    return FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
        zusatz + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for rolle, soll in [("admin", True), ("mechaniker", False)]:
        pg = br.new_context(viewport={"width":1400,"height":950}).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        k = koerper(rolle)
        def liefern(r, k=k): r.fulfill(status=200, content_type="application/javascript", body=k)
        pg.route("**/cdn.jsdelivr.net/**", lambda r: liefern(r))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
                  "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
        pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
        pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
        pg.wait_for_timeout(600)
        parks = pg.locator("#pad [data-park]").all_inner_texts()
        da = any("Extern" in t for t in parks)
        print(rolle, "Parks:", [t.replace("\n", " ") for t in parks], "| Extern:", da)
        if da != soll: fehler.append(f"{rolle}: Extern bei den Parks {'fehlt' if soll else 'sichtbar'}")
        pg.locator("#pad [data-padzurueck]").first.click(); pg.wait_for_timeout(600)
        pg.click("#pad [data-padwo='qs']"); pg.wait_for_timeout(1500)
        text = pg.locator("#pad").inner_text()
        qs = "901" in text
        print(rolle, "QS Check mit 901:", qs)
        if qs != soll: fehler.append(f"{rolle}: Maschine 901 im QS Check {'fehlt' if soll else 'sichtbar'}")
        pg.context.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
