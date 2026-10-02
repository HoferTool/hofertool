import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1440,"height":900}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_selector("#db-notizen"); pg.wait_for_timeout(3000)
    # Beobachten: wie oft werden die Teile der Startseite ausgetauscht oder geleert?
    pg.evaluate("""() => { window._wechsel = []; const inhalt = document.getElementById('inhalt');
      new MutationObserver((ms) => ms.forEach((m) => { if (m.type === 'childList' && m.target.id && m.target.id.startsWith('db-'))
        window._wechsel.push(m.target.id); m.addedNodes.forEach(n => { if (n.id && n.id.startsWith('db-')) window._wechsel.push('neu:' + n.id); }); }))
        .observe(inhalt, { childList: true, subtree: true }); }""")
    # 1. Jemand verschiebt einen Regler — nur seine Einstellungen ändern sich
    pg.evaluate("TEST.daten.profiles[0].einstellungen = { pwhoehe: 77 }")
    pg.wait_for_timeout(50000)
    print("nach einer Einstellung:", pg.evaluate("window._wechsel"))
    # 2. Jemand schreibt eine Notiz
    pg.evaluate("window._wechsel = []; TEST.daten.todos.push({ id: 'tx', text: 'Neue Notiz von Ramona', is_done: false, created_at: new Date().toISOString() })")
    pg.wait_for_timeout(50000)
    print("nach einer neuen Notiz:", pg.evaluate("window._wechsel"),
          "| Notiz sichtbar:", pg.evaluate("document.getElementById('db-notizen').innerText.includes('Neue Notiz von Ramona')"),
          "| alte Teile übrig:", pg.evaluate("document.querySelectorAll('[id$=\"-alt\"]').length"))
    print("Fehler:", f[:3] if f else "keine")
    br.close()
