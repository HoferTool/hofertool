import time
from pruefstand import server_starten, FAKE, CH, PORT, BILDER
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
zusatz = """
(() => {
  daten.profiles[0].role = 'extern';
  daten.machine_parks.push({ id: 'pe', name: 'Extern', is_active: true });
  daten.machines.push({ id: 'm-ex', park_id: 'pe', name: 'BNJ-42SY Zurbrügg', machine_number: '303', is_active: true, sort_order: 1 });
  daten.jobs.push({ id: 'jx1', job_number: '10841-0013', machine_id: 'm-ex', planned_from: arbeitstagPlus(montag, 0),
    planned_days: 8, plan_status: 'laeuft', started_at: new Date().toISOString(), target_quantity: 2000, color: '#0000ff' });
})();
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1500,"height":950}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
            zusatz + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(2200)
    sichtbar = "(s) => { const e = document.querySelector(s); if (!e) return 'fehlt'; const r = e.getBoundingClientRect(); return r.width > 0 ? 'sichtbar' : 'versteckt'; }"
    print("Startseite →", pg.evaluate("location.hash"))
    print("Navigation:", pg.evaluate("[...document.querySelectorAll('.nav__punkt')].map(a => a.textContent.trim())"))
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    print("Parks auf der Planwand:", pg.evaluate("[...document.querySelectorAll('.pw-park:not(.pw-park--ferien)')].map(p=>p.textContent.trim())"),
          "| Maschinen:", pg.evaluate("[...document.querySelectorAll('.pw-name__text')].map(n=>n.textContent)"))
    print("Suche:", pg.evaluate(sichtbar, "#kopf-suche"), "| Pad:", pg.evaluate(sichtbar, "#pad-knopf"),
          "| HOCO:", pg.evaluate(sichtbar, "#pw-hoco"), "| Excel:", pg.evaluate(sichtbar, "#pw-excel"),
          "| Ferien:", pg.evaluate(sichtbar, ".pw-zeile--ferienblock"))
    # Adresse von Hand auf Bestellungen → zurück auf die Planwand
    pg.evaluate("location.hash='#bestellungen'"); pg.wait_for_timeout(1200)
    print("Bestellungen von Hand →", pg.evaluate("location.hash"), "| Titel:", pg.evaluate("(document.querySelector('.seitentitel')||{}).textContent || 'Planwand'"))
    # Produktion: nur Erfassen, Feld freigegeben
    pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(1800)
    print("Produktionsreiter:", pg.evaluate("[...document.querySelectorAll('.reiter__knopf')].map(b=>b.textContent)"))
    felder = pg.evaluate("[...document.querySelectorAll('input.menge')].map(i => i.dataset.maschine + (i.disabled ? ' gesperrt' : ' frei'))")
    print("Stückzahlfelder:", felder[:6])
    if pg.locator("input.menge:not([disabled])").count():
        pg.locator("input.menge:not([disabled])").first.fill("480"); pg.keyboard.press("Tab"); pg.wait_for_timeout(1500)
        print("gemeldet:", pg.evaluate("TEST.daten.production_records.filter(r => r.machine_id === 'm-ex').map(r => r.quantity)"))
    # Strg+K öffnet keine Suche
    pg.keyboard.press("Control+k"); pg.wait_for_timeout(500)
    print("Suche mit Strg+K:", pg.evaluate("!!document.querySelector('.suche-alles')"))
    print("Fehler:", f[:3] if f else "keine")
    br.close()
