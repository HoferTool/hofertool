# Produktion (1.33.0, Wunsch Patrick 12. Oktober 2026): „Beenden“ steht
# neben dem Zustand, dazu Knöpfe Zeichnung und WBG wie im Auftragsfenster.
# Geprüft auf PC, Tablet und Handy, in Woche und Tag.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
GROESSEN = [("pc", 1500, 950), ("tablet", 1180, 820), ("handy", 390, 844)]
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for name, b, h in GROESSEN:
        pg = br.new_context(viewport={"width": b, "height": h}, timezone_id="Europe/Zurich",
                            has_touch=name != "pc").new_page()
        pg.clock.set_fixed_time("2026-10-13T14:00:00+02:00")
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
              if m.type == "error" and "Failed to load resource" not in m.text else None)
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
            content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
                  "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt")
        # Auftrag Z läuft auf m-k1, mit Zeichnung an der HOCO Nr., ohne WBG
        pg.evaluate("""(() => {
          const D = TEST.daten;
          D.jobs.filter(j => j.machine_id === 'm-k1').forEach(j => { if (j.plan_status === 'laeuft') j.plan_status = 'geplant'; });
          const vorlage = D.jobs.find(j => j.machine_id === 'm-k1');
          D.jobs.push({ ...vorlage, id: 'tZ', job_number: '10555-0005', plan_status: 'laeuft',
            started_at: '2026-10-01T04:00:00Z', ended_at: null, target_quantity: 5000,
            planned_from: '2026-10-01', drawing_url: null, wbg_url: null });
          D.hoco_parts = D.hoco_parts || [];
          D.hoco_parts.push({ hoco_nr: '10555-0005', zeichnung_url: 'https://x.test/zeichnung.png' });
        })()""")
        pg.evaluate("location.hash='#produktion'")
        pg.wait_for_selector(".parkwahl__knopf"); pg.wait_for_timeout(500)
        pg.click(".parkwahl__knopf[data-park='p-kurz']"); pg.wait_for_timeout(800)
        for ansicht in ["woche", "tag"]:
            knopf = pg.locator(f"[data-modus='{ansicht}']")
            if knopf.count(): knopf.first.click(); pg.wait_for_timeout(600)
            ende = pg.locator(".aw-kopf__rechts [data-auftrag-ende='tZ']")
            if ende.count() != 1: fehler.append(f"{name}/{ansicht}: Beenden nicht neben dem Zustand"); continue
            st = pg.locator("[data-auftrag-status='tZ']").bounding_box()
            eb = ende.bounding_box()
            if not (abs(st["y"] - eb["y"]) < 20 and eb["x"] > st["x"]):
                fehler.append(f"{name}/{ansicht}: Beenden steht nicht rechts neben läuft: {st} {eb}")
            if pg.locator(".aw-knoepfe [data-auftrag-ende]").count(): fehler.append(f"{name}/{ansicht}: Beenden noch unten")
            for sel in ["[data-zeichnung='tZ']", "[data-wbg='tZ']"]:
                if pg.locator(sel).count() != 1: fehler.append(f"{name}/{ansicht}: {sel} fehlt")
            # Nichts ragt über den Block hinaus
            breit = pg.evaluate("""(() => { const k = document.querySelector("[data-auftrag-ende='tZ']").closest('th, .karte, td, .tag-karte, div.fest, .aw-block') || document.body;
              const r = k.getBoundingClientRect(); return [...k.querySelectorAll(".aw-knopf, .aw-status")].filter(x => { const q = x.getBoundingClientRect(); return q.width && q.right > r.right + 1; }).map(x => x.textContent); })()""")
            if breit: fehler.append(f"{name}/{ansicht}: ragt hinaus: {breit}")
            pg.locator("[data-auftrag-status='tZ']").scroll_into_view_if_needed()
            pg.screenshot(path=f"prod-knoepfe-{name}-{ansicht}.png")
        # Zeichnung: kommt von der HOCO Nr.
        pg.click("[data-zeichnung='tZ']"); pg.wait_for_timeout(800)
        if not pg.locator(".betrachter__titel:has-text('Zeichnung 10555-0005')").count(): fehler.append(f"{name}: Zeichnung öffnet nicht")
        elif pg.locator("[data-abruf='keines']").count(): fehler.append(f"{name}: Zeichnung leer, obwohl an HOCO Nr.")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
        if pg.locator(".betrachter").count(): pg.click(".betrachter [data-zu]"); pg.wait_for_timeout(400)
        # WBG fehlt: „Keine WBG vorhanden“
        pg.click("[data-wbg='tZ']"); pg.wait_for_timeout(600)
        if not pg.locator("[data-abruf='keines']:has-text('Keine WBG vorhanden')").count(): fehler.append(f"{name}: WBG-Fenster fehlt")
        pg.click(".betrachter [data-zu]"); pg.wait_for_timeout(400)
        # Beenden fragt wie bisher
        pg.click("[data-auftrag-ende='tZ']")
        try: pg.wait_for_selector(".dialog-huelle [data-ja]", timeout=3000)
        except Exception: fehler.append(f"{name}: Beenden fragt nicht")
        pg.close()
    br.close()
print("Fehler:", "keine" if not fehler else "\n" + "\n".join(fehler))
