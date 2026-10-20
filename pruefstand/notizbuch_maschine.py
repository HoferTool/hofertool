# Notizbuch im Pad springt zum Abschnitt der Maschine (seit 1.106.0,
# Wunsch Patrick 19. Oktober 2026): Abschnitt mit Maschinennummer im
# Namen geht direkt auf, sonst wie bisher der erste.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright

server_starten(); time.sleep(0.4)
NR = ["L-1000", "L-1001", "L-1002", "L-1003"]
ABS = "[{ id: 'a0', buch_id: 'nbA', name: 'Allgemein', reihenfolge: 1 }" + "".join(
    ", { id: 'a%d', buch_id: 'nbA', name: '%s Handbuch', reihenfolge: %d }" % (i + 1, n.replace("-", " "), i + 2) for i, n in enumerate(NR)) + "]"
SEI = "[{ id: 's0', buch_id: 'nbA', abschnitt_id: 'a0', titel: 'Übersicht', reihenfolge: 1, inhalt: [] }" + "".join(
    ", { id: 's%d', buch_id: 'nbA', abschnitt_id: 'a%d', titel: 'Schema %s', reihenfolge: 1, inhalt: [] }" % (i + 1, i + 1, n) for i, n in enumerate(NR)) + "]"
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
  "daten.notizbuecher = [{ id: 'nbB', name: 'Büro', farbe: '#1f5fbf', reihenfolge: 1, parks: ['p-lang'], erstellt_am: '2026-10-07T08:00:00Z' },"
  " { id: 'nbA', name: 'Maschinen', farbe: '#2e7d32', reihenfolge: 2, parks: ['p-lang'], erstellt_am: '2026-10-07T08:00:00Z' }];"
  " daten.notizbuch_abschnitte = " + ABS + "; daten.notizbuch_seiten = " + SEI + ";"
  " daten.notizbuch_abschnitte.push({ id: 'b0', buch_id: 'nbB', name: 'Büro', reihenfolge: 1 });"
  " daten.notizbuch_seiten.push({ id: 'sb', buch_id: 'nbB', abschnitt_id: 'b0', titel: 'Telefon', reihenfolge: 1, inhalt: [] });"
  " TEST.rpc.notizbuch_pad_abschnitte = (a) => daten.notizbuch_abschnitte.filter(x => x.buch_id === a.p_buch);"
  " TEST.rpc.notizbuch_pad_seiten_ab = (a) => daten.notizbuch_seiten.filter(x => x.buch_id === a.p_buch);"
  " TEST.rpc.notizbuch_pad_seiten = (a) => daten.notizbuch_seiten.filter(x => x.buch_id === a.p_buch);\n"
  "if (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1180, "height": 830}, device_scale_factor=1).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    for el in pg.query_selector_all("#pad [data-park]"):
        if "Lang" in (el.inner_text() or ""): el.click(); break
    pg.wait_for_timeout(1200)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel--maschine").first.click(); pg.wait_for_timeout(2000)
    text = pg.locator("#pad").inner_text()
    nr = next((n for n in NR if n in text), None)
    pruefe(nr is not None, "Maschine offen: %s" % nr)
    pg.locator("[data-padfeld='notizen']").click(); pg.wait_for_timeout(1500)
    pruefe(pg.locator(".dialog.nb").count() == 1, "Notizbücher offen")
    akt = pg.locator(".nb-eintrag.aktiv [data-nbabschnitt]")
    at = akt.inner_text() if akt.count() else ""
    pruefe(nr and at.replace(" ", "-").upper().startswith(nr), "Abschnitt der Maschine offen: " + at)
    pruefe(nr and pg.locator("[data-nbtitel]").input_value() == "Schema " + nr, "Seite der Maschine: " + pg.locator("[data-nbtitel]").input_value())
    pg.screenshot(path="notizbuch-maschine.png")
    # Anderes Buch wählen und zurück: kein erzwungener Sprung mehr
    pg.locator("[data-nbbuch='nbB']").click(); pg.wait_for_timeout(900)
    pruefe(pg.locator("[data-nbtitel]").input_value() == "Telefon", "anderes Buch lässt sich öffnen")
    br.close()
print("Fehler:", "keine" if not fehler and not f else (fehler + f))
