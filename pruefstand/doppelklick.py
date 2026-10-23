# Planwand: Ein Klick auf den Balken zeigt die Zeichnung nur am Handy
# (seit 1.140.0), am Computer und Tablet tut er nichts ausser markieren.
# Doppelklick bzw. Doppeltipp öffnet das Auftragsfenster. Maus, Tablet, Handy.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for breite, hoehe, tablet in ((1600, 950, False), (1180, 820, True), (390, 844, True)):
        handy = breite < 700
        ctx = br.new_context(viewport={"width": breite, "height": hoehe}, has_touch=tablet)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.on("console", lambda m: fehler.append(m.text[:160])
              if m.type == "error" and "Failed to load resource" not in m.text else None)
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
        pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)

        zustand = lambda: {"auftrag": pg.locator(".dialog--auftrag").count(),
                           "betrachter": pg.locator(".betrachter").count(),
                           "warnung": pg.evaluate("[...document.querySelectorAll('.toast')].map(m => m.innerText).join(' ')")}
        def zu():
            # Nur solange etwas offen ist, sonst fragt Escape „Abmelden?“
            for _ in range(3):
                if not pg.locator(".dialog-huelle, .betrachter").count(): break
                pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
            pg.wait_for_timeout(1500)

        def tippen(sel, mal):
            el = pg.locator(sel).first
            el.scroll_into_view_if_needed()
            for _ in range(mal):
                # Rechts im Balken, links sitzt am Handy das Zustandszeichen
                if tablet: el.tap(position={"x": el.bounding_box()["width"] - 10, "y": 8})
                else: el.click()
                pg.wait_for_timeout(80)
            pg.wait_for_timeout(900)

        # Auftrag mit Zeichnung: ein Klick → Betrachter, kein Auftragsfenster
        mit = "(mit) => { const ids = new Set(TEST.daten.planwand.filter(j => !!j.drawing_url === mit).map(j => j.id));"\
              " const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag)"\
              " && b.getBoundingClientRect().width > 40); return b && b.dataset.auftrag; }"
        jid = pg.evaluate(mit, True)
        if not jid: fehler.append(f"{breite}: kein Balken mit Zeichnung")
        else:
            sel = f".pw-balken[data-auftrag='{jid}']"
            tippen(sel, 1); z = zustand(); print(breite, "ein Klick:", z["auftrag"], z["betrachter"])
            if handy and z["betrachter"] == 0: fehler.append(f"{breite}: ein Klick zeigt keine Zeichnung")
            if not handy and z["betrachter"]: fehler.append(f"{breite}: ein Klick zeigt die Zeichnung (nur Handy)")
            if pg.evaluate("document.querySelector('.pw-balken--angewaehlt') ? 1 : 0") == 0 and not z["betrachter"]:
                fehler.append(f"{breite}: ein Klick markiert den Balken nicht")
            if z["auftrag"]: fehler.append(f"{breite}: ein Klick öffnet das Auftragsfenster")
            zu()
            tippen(sel, 2); z = zustand(); print(breite, "Doppelklick:", z["auftrag"], z["betrachter"])
            if z["auftrag"] == 0: fehler.append(f"{breite}: Doppelklick öffnet kein Auftragsfenster")
            if z["betrachter"]: fehler.append(f"{breite}: Doppelklick zeigt zusätzlich die Zeichnung")
            # Nach einer Weile noch immer nur das Auftragsfenster
            pg.wait_for_timeout(600)
            if zustand()["betrachter"]: fehler.append(f"{breite}: Zeichnung kommt verspätet dazu")
            zu()
        # Auftrag ohne Zeichnung: ein Klick → Fenster „Keine Zeichnung vorhanden“
        jid2 = pg.evaluate(mit, False)
        if jid2 and handy:
            tippen(f".pw-balken[data-auftrag='{jid2}']", 1); z = zustand()
            pg.wait_for_timeout(600)
            t = pg.evaluate("(document.querySelector('.betrachter') || {}).innerText || ''")
            if "Keine Zeichnung vorhanden" not in t: fehler.append(f"{breite}: kein Hinweis ohne Zeichnung ({t[:60]})")
            if z["auftrag"]: fehler.append(f"{breite}: ein Klick ohne Zeichnung öffnet Auftragsfenster")
            zu()
        ctx.close()
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:10])
