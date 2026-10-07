# Notizbücher (111.91.0): Tabellen. „3 3“ ins Textfeld und Tab gibt eine
# Tabelle mit 3 Spalten und 3 Zeilen; Tab geht in die nächste Zelle, in
# der letzten kommt eine Zeile dazu; Umschalt + Tab zurück; Plus am Rand
# rechts und unten gibt eine Spalte oder Zeile mehr; Fett in der Zelle;
# Antippen öffnet die Tabelle wieder; Rückgängig; Radierer; dunkel lesbar.
import time, os, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright

server_starten(); time.sleep(0.4)
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
                 "daten.notizbuecher = [{ id: 'nb1', name: 'Werkstatt', farbe: '#2e7d32', reihenfolge: 1, gesperrt: false, erstellt_am: '2026-10-07T08:00:00Z' }];\n"
                 "daten.notizbuch_seiten = [{ id: 'ns1', buch_id: 'nb1', titel: 'Masse', reihenfolge: 1, erstellt_am: '2026-10-07T08:00:00Z', inhalt: [] }];\n"
                 "if (typeof window !== \"undefined\") window.TEST = TEST;")
BILDORDNER = os.environ.get("NB_BILDER", ".")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def inhalt(pg):
    return pg.evaluate("() => JSON.parse(JSON.stringify(TEST.daten.notizbuch_seiten[0].inhalt || []))")

def tabellen(pg):
    return [s for s in inhalt(pg) if s.get("t") == "tab"]

def zelle(pg):
    return pg.evaluate("() => document.activeElement && document.activeElement.dataset.nbzelle || ''")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1400, "height": 900}, device_scale_factor=1)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(700)
    pg.locator("[data-nbbuch='nb1']").click(); pg.wait_for_timeout(700)

    # ---------- „3 3“ und Tab ----------
    b = pg.locator("[data-nbblatt]").bounding_box()
    pg.mouse.click(b["x"] + 80, b["y"] + 80); pg.wait_for_timeout(300)
    pg.keyboard.type("3 3"); pg.keyboard.press("Tab"); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-nbtabedit] td").count() == 9, "3 3 + Tab gibt 9 Zellen (%d)" % pg.locator("[data-nbtabedit] td").count())
    pruefe(pg.locator("[data-nbfeld]").count() == 0, "Textfeld ist zur Tabelle geworden")
    pruefe(zelle(pg) == "0-0", "Schreibmarke in der ersten Zelle (%s)" % zelle(pg))
    pg.keyboard.type("Mass")
    pg.keyboard.press("Tab"); pruefe(zelle(pg) == "0-1", "Tab: nächste Zelle (%s)" % zelle(pg))
    pg.keyboard.type("Soll"); pg.keyboard.press("Tab"); pg.keyboard.type("Ist")
    pg.keyboard.press("Tab"); pruefe(zelle(pg) == "1-0", "Tab am Zeilenende: nächste Zeile (%s)" % zelle(pg))
    pg.keyboard.press("Shift+Tab"); pruefe(zelle(pg) == "0-2", "Umschalt + Tab zurück (%s)" % zelle(pg))
    for _ in range(6): pg.keyboard.press("Tab")
    pruefe(zelle(pg) == "2-2", "letzte Zelle erreicht (%s)" % zelle(pg))
    pg.keyboard.press("Tab"); pg.wait_for_timeout(200)
    pruefe(pg.locator("[data-nbtabedit] tr").count() == 4 and zelle(pg) == "3-0",
           "Tab in der letzten Zelle: neue Zeile (%d Zeilen, %s)" % (pg.locator("[data-nbtabedit] tr").count(), zelle(pg)))
    pg.keyboard.type("Ø 12")
    pruefe(pg.locator("[data-nbzelle='0-0']").inner_text() == "Mass", "Text der ersten Zelle bleibt beim Wachsen")

    # Fett in einer Zelle
    pg.locator("[data-nbzelle='1-0']").click(); pg.keyboard.type("Länge ")
    pg.locator("[data-nbtabedit] [data-stil='bold']").dispatch_event("pointerdown")
    pg.keyboard.type("fett"); pg.wait_for_timeout(100)

    # Plus rechts: Spalte dazu (erscheint beim Drüberfahren)
    plus = pg.locator("[data-nbtabedit] [data-nbspalteplus]")
    vor = plus.evaluate("e => getComputedStyle(e).opacity")
    plus.hover(); pg.wait_for_timeout(250)
    nach = plus.evaluate("e => getComputedStyle(e).opacity")
    pruefe(vor == "0" and nach == "1", "Plus erscheint erst am Rand (%s → %s)" % (vor, nach))
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-tabelle.png"))
    plus.click(); pg.wait_for_timeout(200)
    pruefe(pg.locator("[data-nbtabedit] tr").first.locator("td").count() == 4, "Plus rechts: 4 Spalten")
    pruefe(zelle(pg).endswith("-3"), "Schreibmarke in der neuen Spalte (%s)" % zelle(pg))
    pg.keyboard.type("Tol")
    pg.locator("[data-nbtabedit] [data-nbzeileplus]").click(); pg.wait_for_timeout(200)
    pruefe(pg.locator("[data-nbtabedit] tr").count() == 5 and zelle(pg) == "4-0", "Plus unten: neue Zeile (%s)" % zelle(pg))

    # Schliessen mit Klick daneben: gespeichert
    pg.mouse.click(b["x"] + 600, b["y"] + 900); pg.wait_for_timeout(1200)
    t = tabellen(pg)
    pruefe(len(t) == 1, "eine Tabelle gespeichert (%d)" % len(t))
    if t:
        z = t[0]["z"]
        pruefe(len(z) == 5 and len(z[0]) == 4, "Grösse 5 Zeilen × 4 Spalten (%dx%d)" % (len(z), len(z[0])))
        pruefe(z[0][:3] == ["Mass", "Soll", "Ist"] and z[1][3] == "Tol" and z[3][0] == "Ø 12", "Zellen richtig: %s" % json.dumps(z[0], ensure_ascii=False))
        pruefe(z[1][0] == "Länge <b>fett</b>", "Fett in der Zelle (%s)" % z[1][0])
        pruefe(t[0].get("v", 0) > 0.05, "Höhe gemessen (%s)" % t[0].get("v"))
    pruefe(not [s for s in inhalt(pg) if s.get("t") == 1], "kein Textfeld „3 3“ übrig")
    pruefe(pg.locator("[data-nbtab] td").count() == 20, "Tabelle auf dem Blatt angezeigt")

    # Plus am Rand der geschlossenen Tabelle
    pg.locator("[data-nbtab] [data-nbzeileplus]").hover(); pg.wait_for_timeout(200)
    pg.locator("[data-nbtab] [data-nbzeileplus]").click(); pg.wait_for_timeout(200)
    pruefe(pg.locator("[data-nbtabedit] tr").count() == 6 and zelle(pg) == "5-0", "Plus an geschlossener Tabelle öffnet mit neuer Zeile")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(1000)
    pruefe(len(tabellen(pg)[0]["z"]) == 6, "6 Zeilen gespeichert")

    # Antippen öffnet die Zelle unter dem Finger
    pg.locator("[data-nbtab] td").nth(5).click(); pg.wait_for_timeout(250)
    pruefe(zelle(pg) == "1-1", "Antippen öffnet die angetippte Zelle (%s)" % zelle(pg))
    pg.keyboard.type("10.0"); pg.keyboard.press("Escape"); pg.wait_for_timeout(1000)
    pruefe(tabellen(pg)[0]["z"][1][1] == "10.0", "Zelle nachgetragen")

    # Rückgängig im Notizbuch
    pg.locator("[data-nb='zurueck']").click(); pg.wait_for_timeout(900)
    pruefe(tabellen(pg)[0]["z"][1][1] == "", "Rückgängig nimmt die Eingabe zurück")

    # Normales Textfeld: Tab ohne Muster macht keine Tabelle
    pg.mouse.click(b["x"] + 700, b["y"] + 60); pg.wait_for_timeout(250)
    pg.keyboard.type("Hallo 3"); pg.keyboard.press("Tab"); pg.wait_for_timeout(200)
    pruefe(pg.locator("[data-nbtabedit]").count() == 0, "„Hallo 3“ + Tab bleibt Text")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(900)
    pruefe(len([x for x in inhalt(pg) if x.get("t") == 1]) == 1, "Text gespeichert")


    # Dunkel: Schrift hell auf dunklem Blatt
    pg.evaluate("() => document.body.classList.add('dunkel')"); pg.wait_for_timeout(300)
    farbe = pg.locator("[data-nbtab] td").first.evaluate("e => getComputedStyle(e).color")
    pruefe(farbe in ("rgb(238, 241, 245)",), "dunkel: Zellen hell (%s)" % farbe)
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-tabelle-dunkel.png"))
    pg.evaluate("() => document.body.classList.remove('dunkel')")

    # Löschen mit dem Eimer
    pg.locator("[data-nbtab] td").first.click(); pg.wait_for_timeout(200)
    pg.locator("[data-nbtabedit] [data-nbtextweg]").dispatch_event("pointerdown"); pg.wait_for_timeout(900)
    pruefe(len(tabellen(pg)) == 0, "Eimer löscht die Tabelle")
    pg.locator("[data-nb='zurueck']").click(); pg.wait_for_timeout(900)
    pruefe(len(tabellen(pg)) == 1, "Rückgängig holt sie zurück")
    # Radierer
    pg.locator("[data-nbwerkzeug='radierer']").click()
    pg.locator("[data-nbtab]").click(); pg.wait_for_timeout(900)
    pruefe(len(tabellen(pg)) == 0, "Radierer entfernt die Tabelle")

    pruefe(not f, "keine Skriptfehler: " + "; ".join(f))
    br.close()

print("Fehler:", "keine" if not fehler else len(fehler))
