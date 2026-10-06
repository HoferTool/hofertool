import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
zusatz = """
(() => {
  const o = daten.order_items[0];
  daten.order_items.push(Object.assign({}, o, { id: 'og', status: 'geliefert', quantity: 20,
    ordered_at: '2026-09-25T08:10:00Z', delivered_at: '2026-10-01T13:42:00Z', completed_at: '2026-10-01T13:42:00Z' }));
  daten.order_items.push(Object.assign({}, o, { id: 'ob', status: 'bestellt', quantity: 10, ordered_at: '2026-09-30T09:05:00Z' }));
})();
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1440,"height":900}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", zusatz + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.evaluate("location.hash='#bestellungen'"); pg.wait_for_timeout(1800)
    print("Offen — Zeiten:", pg.evaluate("[...document.querySelectorAll('.bs-pos__wer')].map(x => x.textContent)"))
    pg.locator("button:has-text('Historie'), [data-bansicht='historie']").first.click(); pg.wait_for_timeout(1500)
    print("Historie — Zeile:", pg.evaluate("(document.querySelector('.bs-tabelle--historie .bs-tabelle__zeile')||{}).innerText||''").replace("\n", " | ").replace("\t", " | "))
    pg.locator("[data-hstatus='og']").click(); pg.wait_for_timeout(500)
    print("Dialog:", pg.evaluate("(document.querySelector('.dialog')||{}).innerText||''").replace("\n", " | "))
    pg.locator(".dialog [data-neu='bestellt']").click(); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(1500)
    z = pg.evaluate("TEST.daten.order_items.find(x => x.id === 'og')")
    print("zurückgesetzt:", {k: z.get(k) for k in ("status", "delivered_at", "ordered_at", "status_am")})
    print("Historie danach:", pg.evaluate("document.querySelectorAll('[data-hstatus]').length"), "Positionen")
    pg.locator("button:has-text('Bestellt'), [data-bansicht='bestellt']").first.click(); pg.wait_for_timeout(1500)
    print("Bestellt — Zeiten:", pg.evaluate("[...document.querySelectorAll('.bs-pos__wer')].map(x => x.textContent)"))
    print("Fehler:", f[:3] if f else "keine")
    br.close()
