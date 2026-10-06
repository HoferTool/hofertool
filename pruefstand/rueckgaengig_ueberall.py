# Rückgängig überall (111.73.0): Schritte überstehen Seitenwechsel und
# Neuladen, gelten auf jeder Seite, und Abmelden leert sie. Dazu
# Abmelden beim Schliessen: Die Sitzung liegt ohne "merken" im
# sessionStorage, mit "merken" im localStorage, und ein zweiter Tab
# bekommt sie vom ersten.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FEHLT ") + name)
    if not ok: fehler.append(name)

def seite(ctx):
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    return pg

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width":1400,"height":900})
    pg = seite(ctx)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#db-notizen .karte"); pg.wait_for_timeout(1000)
    titel = lambda: pg.evaluate("document.getElementById('rueck-knopf').title")
    aus = lambda: pg.evaluate("document.getElementById('rueck-knopf').disabled")

    # 1. Notiz anlegen, Seite wechseln, neu laden: Schritt ist noch da
    pg.click("#notiz-neu"); pg.wait_for_selector(".dialog-huelle textarea")
    pg.fill(".dialog-huelle textarea", "Späne leeren"); pg.click(".dialog-huelle [data-ja]")
    pg.wait_for_timeout(800)
    nid = pg.evaluate("TEST.daten.todos[0] && TEST.daten.todos[0].id")
    pruefe("Notiz angelegt", bool(nid))
    pruefe("Knopf bereit: " + titel(), not aus() and "Neue Notiz" in titel())
    pg.evaluate("location.hash = '#/bestellungen'"); pg.wait_for_timeout(800)
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector("#rueck-knopf"); pg.wait_for_timeout(1200)
    pruefe("nach Seitenwechsel und Neuladen noch bereit: " + titel(), not aus() and "Neue Notiz" in titel())
    # Der Nachbau vergisst beim Neuladen seine Daten: die Notiz wieder hinlegen
    pg.evaluate(f"TEST.daten.todos.push({{ id: '{nid}', text: 'Späne leeren', is_done: false }})")
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(1000)
    pruefe("Strg+Z auf den Bestellungen nimmt die Notiz weg",
           pg.evaluate(f"!TEST.daten.todos.some(t => t.id === '{nid}')"))
    pruefe("Knopf danach gesperrt", aus())

    # 2. Auftrag löschen auf der Planwand, neu laden, auf der Startseite zurückholen
    pg.evaluate("location.hash = '#/planwand'"); pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    pg.locator(".pw-balken").first.dblclick(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(400)
    jid = pg.evaluate("TEST.daten.jobs.length")
    pg.locator(".dialog--auftrag button", has_text="Löschen").last.click(); pg.wait_for_timeout(800)
    for _ in range(3):
        if pg.locator(".dialog-huelle [data-nein]").count():
            pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(600)
    pg.wait_for_timeout(600)
    weg = pg.evaluate("JSON.parse(sessionStorage.getItem('hofer.rueckgaengig')).slice(-1)[0]")
    pruefe("Löschen abgelegt: " + (weg or {}).get("text", "?"), weg and weg["text"].startswith("Löschen von"))
    geloescht = [s for s in weg["schritte"] if s["a"] == "rein" and s["t"] == "jobs"][0]["z"][0]["id"]
    pruefe("Auftrag ist weg", pg.evaluate(f"!TEST.daten.jobs.some(j => j.id === '{geloescht}')"))
    pg.evaluate("location.hash = '#/dashboard'"); pg.wait_for_timeout(300)
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector("#db-notizen .karte"); pg.wait_for_timeout(1000)
    pg.evaluate(f"(() => {{ const i = TEST.daten.jobs.findIndex(j => j.id === '{geloescht}'); if (i >= 0) TEST.daten.jobs.splice(i, 1); }})()")
    pg.click("#rueck-knopf"); pg.wait_for_timeout(1200)
    pruefe("auf der Startseite zurückgeholt", pg.evaluate(f"TEST.daten.jobs.some(j => j.id === '{geloescht}')"))
    toast = pg.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).slice(-1)[0] || ''")
    pruefe("Meldung: " + toast, "Zurückgenommen" in toast)

    # 3. Einkauf löschen, dann Abmelden leert die Liste
    pg.evaluate("location.hash = '#/einkauf'"); pg.wait_for_timeout(600)
    pg.evaluate("TEST.daten.shopping_items.push({ id: 'ek1', text: 'Kaffee', is_done: false, prio: 1, created_at: new Date().toISOString() })")
    pg.evaluate("location.hash = '#/dashboard'"); pg.wait_for_timeout(400)
    pg.evaluate("location.hash = '#/einkauf'"); pg.wait_for_selector("[data-ekweg='ek1']"); pg.wait_for_timeout(300)
    pg.click("[data-ekweg='ek1']"); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(800)
    pruefe("Einkauf gelöscht und merkbar: " + titel(), "Kaffee" in titel())
    pg.click("#rueck-knopf"); pg.wait_for_timeout(1000)
    pruefe("Einkauf zurück", pg.evaluate("TEST.daten.shopping_items.some(z => z.id === 'ek1')"))
    pruefe("Liste zeigt ihn wieder", pg.locator("[data-ekweg='ek1']").count() == 1)
    pg.click("[data-ekweg='ek1']"); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(800)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='allgemein']").click(); pg.wait_for_timeout(200)
    pg.locator("#ab").click(); pg.wait_for_timeout(300); pg.locator("[data-ja]").click(); pg.wait_for_timeout(1500)
    pruefe("nach Abmelden keine Schritte mehr",
           pg.evaluate("!sessionStorage.getItem('hofer.rueckgaengig') || JSON.parse(sessionStorage.getItem('hofer.rueckgaengig')).length === 0"))

    # 4. Wo die Sitzung liegt
    sp = "TEST.sitzungSpeicher"
    pg.evaluate("localStorage.removeItem('hofer.geraet.sitzungen')")
    pg.evaluate(sp + ".setItem('sb-x-auth-token', JSON.stringify({ user: { email: 'a@b.ch' }, refresh_token: 'r1' }))")
    pruefe("ohne merken: im sessionStorage",
           pg.evaluate("!!sessionStorage.getItem('sb-x-auth-token') && !localStorage.getItem('sb-x-auth-token')"))
    pruefe("lesbar", "r1" in (pg.evaluate(sp + ".getItem('sb-x-auth-token')") or ""))
    pg.evaluate("localStorage.setItem('hofer.geraet.sitzungen', JSON.stringify({ 'a@b.ch': 'r1' }))")
    pg.evaluate(sp + ".setItem('sb-x-auth-token', JSON.stringify({ user: { email: 'a@b.ch' }, refresh_token: 'r2' }))")
    pruefe("mit merken: im localStorage",
           pg.evaluate("!!localStorage.getItem('sb-x-auth-token') && !sessionStorage.getItem('sb-x-auth-token')"))
    pg.evaluate(sp + ".removeItem('sb-x-auth-token')")
    pruefe("entfernen: überall weg",
           pg.evaluate("!localStorage.getItem('sb-x-auth-token') && !sessionStorage.getItem('sb-x-auth-token')"))
    pg.evaluate("localStorage.removeItem('hofer.geraet.sitzungen')")

    # 5. Zweiter Tab bekommt die Sitzung vom ersten, ein Tab allein nicht
    pg.evaluate("sessionStorage.setItem('sb-y-auth-token', JSON.stringify({ user: { email: 'a@b.ch' }, refresh_token: 'r9' }))")
    pg2 = seite(ctx)
    pg2.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg2.wait_for_selector("#inhalt, .login"); pg2.wait_for_timeout(500)
    pruefe("zweiter Tab hat die Sitzung", "r9" in (pg2.evaluate("sessionStorage.getItem('sb-y-auth-token')") or ""))
    pg.close(); pg2.close()
    pg3 = seite(ctx)
    pg3.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg3.wait_for_selector("#inhalt, .login"); pg3.wait_for_timeout(500)
    pruefe("nach dem Schliessen aller Tabs keine Sitzung mehr",
           not pg3.evaluate("Object.keys(sessionStorage).concat(Object.keys(localStorage)).some(k => /^sb-.*-auth-token/.test(k))"))
    br.close()
print("Fehler:", fehler if fehler else "keine")
