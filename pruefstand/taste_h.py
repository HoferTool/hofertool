import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
zusatz = """
daten.profiles[0].role = 'langdreher';
daten.todos.push({ id: 't1', text: 'Kühlmittel bei SR32 wechseln', due_date: '2026-10-09', is_done: false, created_by: 'u9', created_at: new Date().toISOString() });
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1440,"height":900}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", zusatz + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(2200)
    print("Notiz von jemand anderem — Knöpfe:", pg.evaluate("[...document.querySelectorAll('#db-notizen .linkknopf')].map(b => b.textContent)"))
    pg.locator("[data-notizbearb='t1']").click(); pg.wait_for_timeout(500)
    pg.locator(".dialog textarea").last.fill("Kühlmittel bei SR32 und SR20 wechseln"); pg.locator(".dialog [data-ja]").last.click(); pg.wait_for_timeout(900)
    print("direkt geändert:", pg.evaluate("TEST.daten.todos.find(t => t.id === 't1').text"))
    # Taste H
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    print("Knopf:", pg.evaluate("document.getElementById('pw-heute').innerText.replace(/\\n/g, ' ')"))
    pg.evaluate("""() => { const e = document.getElementById('pw-zeit'); e.value = Number(e.max) - 50; e.dispatchEvent(new Event('input', {bubbles:true})); }""")
    pg.wait_for_timeout(700)
    vor = pg.evaluate("(document.querySelector('.pw-monat')||{}).textContent")
    # In einem Feld darf H nichts tun
    pg.locator("#pw-tage-zahl, .pw-zoom input[type=number]").first.focus() if pg.locator(".pw-zoom input[type=number]").count() else None
    pg.keyboard.press("h"); pg.wait_for_timeout(500)
    im_feld = pg.evaluate("(document.querySelector('.pw-monat')||{}).textContent")
    pg.evaluate("document.activeElement && document.activeElement.blur()")
    pg.keyboard.press("h"); pg.wait_for_timeout(900)
    nach = pg.evaluate("(document.querySelector('.pw-monat')||{}).textContent")
    print("weg:", vor, "| H im Feld:", im_feld, "| H sonst:", nach)
    print("Fehler:", f[:3] if f else "keine")
    br.close()
