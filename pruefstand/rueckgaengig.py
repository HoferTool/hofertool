import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1500,"height":950}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1800)
    knopf = "() => { const k = document.getElementById('rueck-knopf'); const r = k.getBoundingClientRect(); return { sichtbar: r.width > 0, aus: k.disabled, text: k.innerText.trim() }; }"
    print("Knopf am Anfang:", pg.evaluate(knopf))

    # 1. Neuer Auftrag über Kopieren und Einfügen, dann Strg+Z nach Reglerbenutzung
    vorher = pg.evaluate("TEST.daten.jobs.length")
    staende = pg.evaluate("Object.fromEntries(TEST.daten.jobs.filter(j=>j.machine_id==='m-k2').map(j=>[j.id, j.planned_from]))")
    pg.locator(".pw-balken").first.click(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(400)
    pg.locator("#pl-kopieren-eigen").click(); pg.wait_for_timeout(700)
    ziel = pg.evaluate("""() => { for (const z of document.querySelectorAll('[data-zelle^="m-k2|"]')) {
        const r = z.getBoundingClientRect(); const x = r.x + r.width/2, y = r.y + r.height/2;
        if (document.elementFromPoint(x, y) === z) return { x, y }; } return null; }""")
    pg.mouse.click(ziel["x"], ziel["y"]); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(500)
    pg.evaluate("() => { const f = document.getElementById('pl-nr'); f.value = '10999-0002'; f.dispatchEvent(new Event('input', {bubbles:true})); }")
    pg.locator("#pl-ja").click(); pg.wait_for_timeout(1000)
    for _ in range(3):
        if pg.locator(".dialog-huelle [data-nein]").count():
            pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(700)
    pg.wait_for_timeout(800)
    pg.locator("#einfuege-ende").click()
    print("angelegt:", vorher, "→", pg.evaluate("TEST.daten.jobs.length"), "| Knopf:", pg.evaluate(knopf))

    # Regler anfassen, damit er den Fokus hat — genau der Fall, in dem Strg+Z nicht ging
    pg.locator("#pw-hoehe").focus()
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(1500)
    print("nach Strg+Z:", pg.evaluate("TEST.daten.jobs.length"), "Aufträge | Meldung:",
          pg.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).slice(-1)"))
    zurueck = pg.evaluate("Object.fromEntries(TEST.daten.jobs.filter(j=>j.machine_id==='m-k2').map(j=>[j.id, j.planned_from]))")
    print("nachgerückte wieder am alten Platz:", zurueck == staende)

    # 2. Ändern, dann Rückgängig per Knopf
    alt = pg.evaluate("TEST.daten.jobs[0].material_bez")
    pg.locator(".pw-balken").first.click(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(400)
    jid = pg.evaluate("document.querySelector('.dialog--auftrag') && (plan => null)()")
    pg.fill("#pl-mat-bez", "CW614N rd 20"); pg.locator("#pl-ja").click(); pg.wait_for_timeout(1000)
    for _ in range(3):
        if pg.locator(".dialog-huelle [data-nein]").count():
            pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(700)
    pg.wait_for_timeout(600)
    geaendert = pg.evaluate("TEST.daten.jobs.filter(j => j.material_bez === 'CW614N rd 20').map(j => j.id)")
    print("geändert:", len(geaendert), "Auftrag | Knopftitel:", pg.evaluate("document.getElementById('rueck-knopf').title"))
    pg.locator("#rueck-knopf").click(); pg.wait_for_timeout(1500)
    print("nach Knopf:", pg.evaluate(f"TEST.daten.jobs.find(j => j.id === '{geaendert[0]}').material_bez") if geaendert else "?",
          "| Knopf:", pg.evaluate(knopf))
    print("Fehler:", f[:3] if f else "keine")
    br.close()
