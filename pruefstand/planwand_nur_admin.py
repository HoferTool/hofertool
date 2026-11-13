# Planwand nur für Admins (1.10.0, Wunsch Patrick 9. Oktober 2026): das
# Konto Planwand und das alte Häkchen „Darf bearbeiten“ planen nicht mehr.
# Materialplatz mit Häkchen und Ferien gehen weiter.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def seite(br, rolle, extra=""):
    F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
        "daten.profiles[0].role = '" + rolle + "'; daten.profiles[0].darf_bearbeiten = true; " + extra
        + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(1200)
    return pg, f
def oeffnen(pg):
    jid = pg.evaluate("""() => { const ids = new Set(TEST.daten.planwand.filter(j => !j.ended_at && j.plan_status !== 'fertig').map(j => j.id));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag)
        && b.getBoundingClientRect().width > 40); return b && b.dataset.auftrag; }""")
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed(); el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for rolle in ["planwand", "langdreher"]:
        pg, f = seite(br, rolle, "daten.profiles[0].darf_materialplatz = true; daten.planwand.forEach(j => { j.material_platz = 'Regal 1'; });")
        # Seit 1.539.0 kein dauernder Hinweis, die Meldung kommt erst beim Versuch.
        pruefe(rolle + ": kein dauernder Hinweis", pg.locator(".nurlesen").count() == 0)
        pruefe(rolle + ": vor dem Versuch keine Meldung", pg.locator(".toast", has_text="nur Administratoren").count() == 0)
        bx = pg.evaluate("""() => { const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => b.getBoundingClientRect().width > 40);
          const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }""")
        pg.mouse.move(bx[0], bx[1]); pg.mouse.down(); pg.mouse.move(bx[0] + 60, bx[1], steps=6); pg.mouse.up()
        pg.wait_for_timeout(300)
        pruefe(rolle + ": Ziehen meldet nur Administratoren", pg.locator(".toast", has_text="nur Administratoren").count() == 1)
        pruefe(rolle + ": keine Griffe an Aufträgen", pg.locator(".pw-name--fassbar").count() == 0)
        pruefe(rolle + ": Ferien weiter mit Griffen", pg.locator("[data-ferien] [data-fgriff]").count() >= 1)
        oeffnen(pg)
        pruefe(rolle + ": Auftragsfenster nur zum Ansehen", pg.locator("#pl-nurlesen").count() == 1)
        pruefe(rolle + ": Maschine gesperrt", pg.locator("#pl-maschine").is_disabled())
        pruefe(rolle + ": Materialplatz mit Häkchen änderbar",
               pg.evaluate("() => { const e = document.querySelector('#pl-matort'); return !!e && !e.readOnly && !e.disabled; }"))
        pruefe(rolle + ": Seitenfehler " + str(f[:2]), not f)
        pg.close()
    pg, f = seite(br, "admin")
    pruefe("Admin: kein Hinweis", pg.locator(".nurlesen").count() == 0 and pg.locator(".toast", has_text="nur Administratoren").count() == 0)
    pruefe("Admin: Aufträge fassbar", pg.locator(".pw-name--fassbar").count() > 0)
    oeffnen(pg)
    pruefe("Admin: Fenster bearbeitbar", pg.locator("#pl-nurlesen").count() == 0 and pg.locator("#pl-maschine").is_enabled())
    pruefe("Admin: Seitenfehler " + str(f[:2]), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
