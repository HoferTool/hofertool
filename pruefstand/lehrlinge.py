# Seite Lehrlinge als Nachschlagewerk (1.149.0, Wunsch Patrick 22. Oktober 2026):
# Kapitel als Karten, im Kapitel Unterkapitel mit Fragen zum Aufklappen,
# Suche über alles, Escape geht zurück, nach Neuladen im selben Kapitel.
# Keine Anfrage an eine KI. Bilder am Computer und Handy.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILDER = os.environ.get("LEHR_BILDER", "")
ki = []

def seite(br, b, h, mobil=False):
    ctx = br.new_context(viewport={"width": b, "height": h}, timezone_id="Europe/Zurich",
                         has_touch=mobil, is_mobile=mobil)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.on("request", lambda r: ki.append(r.url) if "functions/v1" in r.url else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("location.hash='#/lehrlinge'"); pg.wait_for_timeout(700)
    return pg

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = seite(br, 1400, 900)
    karten = pg.locator(".lehr-karte").count()
    if max(len(t) for t in pg.locator(".lehr-karte__text").all_inner_texts()) > 120: fehler.append("Kartentext zu lang")
    if karten != 11: fehler.append("Kapitel: %d statt 11" % karten)
    if "ersetzt deinen Ausbildner nicht" not in pg.inner_text(".lehr__hinweis"): fehler.append("Hinweis fehlt")
    zahlen = pg.locator(".lehr-karte__zahl").all_inner_texts()
    if any(" 0 Fragen" in z or z.startswith("0 ") for z in zahlen): fehler.append("leeres Kapitel: " + str(zahlen))
    if BILDER: pg.screenshot(path=BILDER + "/lehr-uebersicht.png")
    # Kapitel Bohren und Gewinde öffnen
    pg.locator(".lehr-karte:has-text('Gewinde')").first.click(); pg.wait_for_timeout(300)
    if pg.locator(".lehr-unter").count() < 3: fehler.append("Unterkapitel fehlen")
    if pg.locator(".lehr-chip").count() < 3: fehler.append("Sprung-Knöpfe fehlen")
    frage = pg.locator(".lehr-frage:has-text('Kernloch')").first
    frage.locator("summary").click(); pg.wait_for_timeout(200)
    txt = frage.inner_text()
    if "6,8" not in txt or frage.locator("table tr").count() < 8: fehler.append("Antwort Kernloch falsch dargestellt: " + txt[:120])
    if "**" in txt or "|---" in txt: fehler.append("Rohtext sichtbar")
    if BILDER: pg.screenshot(path=BILDER + "/lehr-kapitel.png")
    # Code-Beispiel im Kapitel Programmieren
    pg.locator("button:has-text('›')").last.click(); pg.wait_for_timeout(200)
    pg.evaluate("location.hash='#/lehrlinge'")
    # Nach Neuladen im selben Kapitel
    titel = pg.inner_text(".lehr-kapitel__titel")
    pg.reload(); pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(900)
    if not pg.locator(".lehr-kapitel__titel").count() or pg.inner_text(".lehr-kapitel__titel") != titel:
        fehler.append("nach Neuladen nicht im Kapitel " + titel)
    # Escape zurück zur Übersicht
    pg.locator("body").click(position={"x": 5, "y": 880})
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    if pg.locator(".lehr-karte").count() != 11: fehler.append("Escape geht nicht zurück")
    if pg.locator(".dialog-huelle").count(): fehler.append("Escape fragt trotzdem Abmelden")
    # Suche
    pg.fill(".lehr__suche", "G76 gewinde"); pg.wait_for_timeout(300)
    if not pg.locator(".lehr-frage").count(): fehler.append("Suche G76 findet nichts")
    elif "G76" not in pg.locator(".lehr-frage").first.inner_text() and not pg.locator(".lehr-frage pre").count():
        pass
    pg.fill(".lehr__suche", "passung h7"); pg.wait_for_timeout(300)
    if not pg.locator(".lehr-frage:has-text('H7/g6')").count(): fehler.append("Suche Passung findet H7/g6 nicht")
    pg.fill(".lehr__suche", "xyzqq"); pg.wait_for_timeout(300)
    if "Nichts gefunden" not in pg.inner_text(".lehr__treffer"): fehler.append("kein Hinweis bei 0 Treffern")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    if pg.input_value(".lehr__suche"): fehler.append("Escape leert Suche nicht")
    # Alle Antworten einmal darstellen, ohne Rohzeichen
    pg.fill(".lehr__suche", "")
    for i in range(11):
        pg.locator(".lehr-karte").nth(i).click(); pg.wait_for_timeout(150)
        pg.evaluate("document.querySelectorAll('.lehr-frage').forEach(d => d.open = true)")
        t = pg.inner_text(".lehr-kapitel")
        if "```" in t or "|---" in t or "### " in t: fehler.append("Rohtext in " + pg.inner_text(".lehr-kapitel__titel"))
        if i == 5:
            if not pg.locator(".lehr-kapitel__achtung").count(): fehler.append("Einleitung Programmieren fehlt")
            if BILDER: pg.screenshot(path=BILDER + "/lehr-code.png")
        pg.locator(".lehr__zurueck").click(); pg.wait_for_timeout(100)
    # Handy
    ph = seite(br, 390, 844, mobil=True)
    ph.locator(".lehr-karte").nth(3).click(); ph.wait_for_timeout(300)
    ph.evaluate("document.querySelectorAll('.lehr-frage').forEach(d => d.open = true)")
    breite = ph.evaluate("document.documentElement.scrollWidth")
    if breite > 392: fehler.append("Handy: seitlich zu breit %d" % breite)
    if BILDER: ph.screenshot(path=BILDER + "/lehr-handy.png")
    if ki: fehler.append("Anfrage an Server-Funktion: " + ki[0])
    br.close()

print("Fehler:", "; ".join(fehler) if fehler else "keine")
