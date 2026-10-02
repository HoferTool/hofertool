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
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("location.hash='#planwand'")      # Start → Planwand, wie im Alltag
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1800)
    vorher = pg.evaluate("TEST.daten.jobs.length")

    # 1. Auftrag öffnen und kopieren
    pg.locator(".pw-balken").first.click(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(500)
    quelle = pg.evaluate("document.getElementById('pl-mat-bez') && document.getElementById('pl-mat-bez').value")
    print("Knopfreihe unten:", pg.evaluate("[...document.querySelectorAll('.dialog--auftrag .dialog__knoepfe button')].map(b=>b.textContent)"),
          "| oben noch Kopieren:", pg.evaluate("!!document.querySelector('.auf-kopf__knoepfe #pl-kopieren-eigen')"))
    pg.locator("#pl-kopieren-eigen").click(); pg.wait_for_timeout(900)
    print("nach Kopieren:", pg.evaluate("location.hash"), "| Leiste:",
          pg.evaluate("(document.getElementById('einfuege-leiste')||{}).innerText||'fehlt'").replace("\n"," "),
          "| Fenster offen:", pg.evaluate("document.querySelectorAll('.dialog-huelle').length"))

    # 2. Freie Stelle anklicken → vorbefülltes Fenster an dieser Stelle
    ziel = pg.evaluate("""() => { for (const z of document.querySelectorAll('[data-zelle]')) {
        const r = z.getBoundingClientRect(); const x = r.x + r.width/2, y = r.y + r.height/2;
        if (document.elementFromPoint(x, y) === z && r.y > 260 && r.y < innerHeight - 80)
          return { x, y, zelle: z.dataset.zelle }; } return null; }""")
    pg.mouse.click(ziel["x"], ziel["y"]); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(600)
    print("Einfügen an:", ziel["zelle"], "| Material übernommen:",
          pg.evaluate("document.getElementById('pl-mat-bez').value") == quelle)
    nr = pg.locator("#pl-nummer, #pl-nr, input[id^='pl-'][id*='nr']").first
    pg.evaluate("""() => { const f = document.querySelector('#pl-nummer') || document.querySelector('#pl-nr');
      if (f) { f.value = '10999-0001'; f.dispatchEvent(new Event('input', {bubbles:true})); } }""")
    pg.locator("#pl-ja").click(); pg.wait_for_timeout(1200)
    for _ in range(3):
        if pg.locator(".dialog-huelle [data-nein]").count():
            pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(900)
    pg.wait_for_timeout(800)
    print("nach Speichern:", pg.evaluate("location.hash"), "| Aufträge:", vorher, "→", pg.evaluate("TEST.daten.jobs.length"),
          "| Leiste noch da:", pg.evaluate("!!document.getElementById('einfuege-leiste')"),
          "| Meldung:", pg.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).slice(-1)"))
    neu = pg.evaluate("TEST.daten.jobs[TEST.daten.jobs.length-1]")
    print("neuer Auftrag:", {k: neu.get(k) for k in ("job_number", "machine_id", "planned_from", "material_bez")})

    # 3. Fertig beendet das Einfügen
    pg.locator("#einfuege-ende").click(); pg.wait_for_timeout(300)
    print("nach Fertig:", pg.evaluate("!!document.getElementById('einfuege-leiste')"))

    # 4. Zurück-Taste: Fenster zu, Seite bleibt; zweites Zurück wechselt die Seite
    pg.locator(".pw-balken").first.click(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(400)
    pg.go_back(); pg.wait_for_timeout(900)
    print("Zurück bei offenem Fenster:", pg.evaluate("location.hash"), "| Fenster:", pg.evaluate("document.querySelectorAll('.dialog-huelle').length"))
    pg.go_back(); pg.wait_for_timeout(900)
    print("zweites Zurück:", pg.evaluate("location.hash"))
    print("Fehler:", f[:3] if f else "keine")
    br.close()
