# Notizbücher (111.82.0): verkleinern zum schwebenden Feld (verschieben,
# Grösse an Rand und Ecke ziehen, gemerkt je Person, bleibt beim Wechsel
# auf andere Seiten, Escape schliesst es nicht, Strg + Z der App greift
# nicht hinein) und Sperren mit Passwort (Schloss, Öffnen, falsches
# Passwort, Setzen, Aufheben, Hinweis ohne SQL).
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright

server_starten(); time.sleep(0.4)
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
                 "daten.notizbuecher = [{ id: 'nb1', name: 'Werkstatt', farbe: '#2e7d32', reihenfolge: 1, gesperrt: false, erstellt_am: '2026-10-07T08:00:00Z' },"
                 " { id: 'nb2', name: 'Geheim', farbe: '#c2185b', reihenfolge: 2, gesperrt: true, erstellt_am: '2026-10-07T08:00:00Z' }];\n"
                 "daten.notizbuch_seiten = [{ id: 'ns1', buch_id: 'nb1', titel: 'Spannzangen', reihenfolge: 1, erstellt_am: '2026-10-07T08:00:00Z',"
                 " inhalt: [{ t: 1, x: .05, y: .05, w: .5, s: 22, f: '#1d2430', h: 'Bestellen bis Freitag' }] },"
                 " { id: 'ns2', buch_id: 'nb2', titel: 'Lohnliste', reihenfolge: 1, erstellt_am: '2026-10-07T08:00:00Z', inhalt: [] }];\n"
                 "if (typeof window !== \"undefined\") window.TEST = TEST;")
BILDORDNER = os.environ.get("NB_BILDER", ".")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def start(p, breite=1400, hoehe=900):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": breite, "height": hoehe}, device_scale_factor=1)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    # Wie in der Datenbank: Seiten gesperrter Bücher nur nach dem Öffnen
    pg.evaluate("""() => { window.OFFEN = new Set();
      TEST.rpc.notizbuch_oeffnen = (a) => { if (a.p_passwort !== 'abcd') return 'falsch'; OFFEN.add(a.p_buch); return 'ok'; };
      TEST.rpc.notizbuch_passwort = (a) => { const b = TEST.daten.notizbuecher.find(x => x.id === a.p_buch);
        if (b.gesperrt && a.p_alt !== 'abcd') return 'falsch';
        b.gesperrt = !!a.p_neu; if (a.p_neu) OFFEN.add(a.p_buch); return 'ok'; };
      TEST.rpc.notizbuch_passwort_admin = (a) => { const b = TEST.daten.notizbuecher.find(x => x.id === a.p_buch);
        b.gesperrt = !!a.p_neu; OFFEN.delete(a.p_buch); return 'ok'; };
      TEST.rpc.notizbuch_zu = () => { OFFEN.clear(); return null; }; }""")
    return br, pg, f

def kasten(pg):
    return pg.locator(".nb-schwebend .dialog.nb").bounding_box()

with sync_playwright() as p:
    br, pg, f = start(p)
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(700)
    pg.locator("[data-nbbuch='nb1']").click(); pg.wait_for_timeout(700)
    pruefe(pg.locator("[data-nbumschalten]").count() == 1, "Knopf Verkleinern im Kopf")

    # ---------- Verkleinern ----------
    pg.locator("[data-nbumschalten]").click(); pg.wait_for_timeout(700)
    pruefe(pg.locator(".dialog-huelle").count() == 0, "grosses Fenster zu, App frei")
    pruefe(pg.locator(".nb-schwebend .dialog.nb").count() == 1, "kleines Notizbuch da")
    k = kasten(pg)
    pruefe(k and k["width"] < 700 and k["height"] < 600, "klein (%dx%d)" % (k["width"], k["height"]) if k else "kein Kasten")
    pruefe(pg.locator(".nb-schwebend [data-nbtext]").count() == 1, "Seite im kleinen Fenster sichtbar")
    pruefe(pg.locator(".nb-schwebend .nb--schmal").count() == 1 or pg.locator(".nb-schwebend .dialog.nb.nb--schmal").count() == 1,
           "schmal: Bücher und Seiten als Leisten")
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-klein.png"))

    # Verschieben am Kopf
    kopf = pg.locator(".nb-schwebend .nb-kopf h2").bounding_box()
    pg.mouse.move(kopf["x"] + 20, kopf["y"] + 8); pg.mouse.down()
    pg.mouse.move(kopf["x"] - 300, kopf["y"] - 200, steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    k2 = kasten(pg)
    pruefe(abs((k["x"] - k2["x"]) - 320) < 3 and abs((k["y"] - k2["y"]) - 208) < 3, "am Kopf verschoben (%d, %d)" % (k["x"] - k2["x"], k["y"] - k2["y"]))
    # Ecke unten rechts grösser ziehen
    e = pg.locator(".nb-schwebend [data-nbrand='se']").bounding_box()
    pg.mouse.move(e["x"] + e["width"] / 2, e["y"] + e["height"] / 2); pg.mouse.down()
    pg.mouse.move(e["x"] + e["width"] / 2 + 150, e["y"] + e["height"] / 2 + 60, steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    k3 = kasten(pg)
    pruefe(abs(k3["width"] - k2["width"] - 150) < 3 and abs(k3["height"] - k2["height"] - 60) < 3, "Ecke zieht die Grösse (%dx%d)" % (k3["width"], k3["height"]))
    # Linker Rand: schmaler, rechte Kante bleibt
    l = pg.locator(".nb-schwebend [data-nbrand='w']").bounding_box()
    pg.mouse.move(l["x"] + 5, l["y"] + 40); pg.mouse.down()
    pg.mouse.move(l["x"] + 105, l["y"] + 40, steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
    k4 = kasten(pg)
    pruefe(abs(k4["width"] - (k3["width"] - 100)) < 3 and abs((k4["x"] + k4["width"]) - (k3["x"] + k3["width"])) < 3, "linker Rand zieht schmaler")
    # Nicht kleiner als das Minimum
    pg.mouse.move(k4["x"] + 2, k4["y"] + 60); pg.mouse.down()
    pg.mouse.move(k4["x"] + 900, k4["y"] + 60, steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
    pruefe(kasten(pg)["width"] >= 319, "Mindestbreite")
    # Nicht aus dem Bild
    kopf = pg.locator(".nb-schwebend .nb-kopf h2").bounding_box()
    pg.mouse.move(kopf["x"] + 10, kopf["y"] + 8); pg.mouse.down()
    pg.mouse.move(-500, -500, steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
    k5 = kasten(pg)
    pruefe(k5["x"] >= 3 and k5["y"] >= 3, "bleibt im Bild")
    gemerkt = pg.evaluate("() => JSON.stringify(TEST.daten.profiles.map(p => (p.einstellungen || {}).notizbuch_rahmen).filter(Boolean))")
    pruefe("," in gemerkt, "Lage und Grösse je Person gemerkt " + gemerkt)

    # ---------- Mit auf andere Seiten ----------
    pg.evaluate("() => { location.hash = '#/planwand'; }"); pg.wait_for_timeout(1500)
    pruefe(pg.locator(".nb-schwebend .dialog.nb").count() == 1, "bleibt offen auf der Planwand")
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-klein-planwand.png"))
    pg.evaluate("() => { location.hash = '#/produktion'; }"); pg.wait_for_timeout(1200)
    pruefe(pg.locator(".nb-schwebend .dialog.nb").count() == 1, "bleibt offen in der Produktion")
    # Die Seite dahinter bleibt bedienbar
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe(pg.locator(".nb-schwebend .dialog.nb").count() == 1, "Escape schliesst es nicht")
    # Im kleinen Notizbuch schreiben, Strg + Z nimmt dort zurück, nicht in der App
    pg.locator(".nb-schwebend [data-nbtext]").first.click(); pg.wait_for_timeout(300)
    pg.keyboard.press("End"); pg.keyboard.type(" und Montag"); pg.wait_for_timeout(200)
    pg.locator(".nb-schwebend .nb-titel").click(); pg.wait_for_timeout(200)
    pg.locator(".nb-schwebend .nb-rolle").click(position={"x": 10, "y": 5}); pg.wait_for_timeout(1100)
    t = pg.evaluate("() => TEST.daten.notizbuch_seiten.find(s => s.id === 'ns1').inhalt.map(x => x.h).join('|')")
    pruefe("Montag" in t, "Text im kleinen Fenster gespeichert")
    n_rueck = pg.evaluate("() => TEST.protokoll.length")
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(1100)
    t = pg.evaluate("() => TEST.daten.notizbuch_seiten.find(s => s.id === 'ns1').inhalt.map(x => x.h).join('|')")
    pruefe("Montag" not in t, "Strg + Z nimmt im kleinen Fenster zurück")
    pruefe(pg.locator(".nb-schwebend .dialog.nb").count() == 1, "noch offen")

    # ---------- Wieder gross ----------
    pg.locator(".nb-schwebend [data-nbumschalten]").click(); pg.wait_for_timeout(700)
    pruefe(pg.locator(".nb-schwebend").count() == 0 and pg.locator(".dialog-huelle .dialog.nb").count() == 1, "wieder gross")
    d = pg.locator(".dialog-huelle .dialog.nb").bounding_box()
    pruefe(d["width"] > 1300, "gross über die ganze Breite")
    # Und wieder klein: gleiche Lage wie zuletzt
    pg.locator("[data-nbumschalten]").click(); pg.wait_for_timeout(700)
    k6 = kasten(pg)
    pruefe(abs(k6["x"] - k5["x"]) < 2 and abs(k6["width"] - k5["width"]) < 2, "kleines Fenster an derselben Stelle")
    # Buch-Knopf bei den Notizen macht es wieder gross
    pg.evaluate("() => { location.hash = '#/'; }"); pg.wait_for_timeout(1400)
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(700)
    pruefe(pg.locator(".nb-schwebend").count() == 0 and pg.locator(".dialog-huelle .dialog.nb").count() == 1, "Buch-Knopf macht es gross")

    # ---------- Passwort ----------
    pruefe(pg.locator("[data-nbbuch='nb2'] .nb-schlosschen").count() == 1, "Schloss beim gesperrten Buch")
    pg.locator("[data-nbbuch='nb2']").click(); pg.wait_for_timeout(700)
    pruefe(pg.locator("[data-nbschloss]").count() == 1 and pg.locator("[data-nbseite]").count() == 0, "gesperrt: Passwortfeld, keine Seiten")
    pruefe(pg.locator("[data-nbbuchweg]").count() == 0, "gesperrt: nicht löschbar")
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-gesperrt.png"))
    pg.locator("[data-nbpasswort]").fill("xxxx"); pg.keyboard.press("Enter"); pg.wait_for_timeout(600)
    pruefe(pg.locator(".nb-schloss__fehler:has-text('Falsches Passwort')").count() == 1, "falsches Passwort: rote Zeile")
    pg.locator("[data-nbpasswort]").fill("abcd"); pg.keyboard.press("Enter"); pg.wait_for_timeout(900)
    pruefe(pg.locator("[data-nbschloss]").count() == 0 and pg.locator("[data-nbseite='ns2']").count() == 1, "richtiges Passwort: Seiten da")
    # Verkleinern behält das Buch offen
    pg.locator("[data-nbumschalten]").click(); pg.wait_for_timeout(800)
    pruefe(pg.locator(".nb-schwebend [data-nbschloss]").count() == 0, "klein: bleibt offen")
    pg.locator(".nb-schwebend [data-zu]").click(); pg.wait_for_timeout(3000)
    zu = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'notizbuch_zu').length")
    pruefe(zu >= 1, "Schliessen sperrt wieder (notizbuch_zu)")
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-nbschloss]").count() == 1, "nach Schliessen wieder gesperrt")

    # Sperre aufheben: auch der Admin braucht im Notizbuch das alte Passwort
    pg.locator("[data-nbbuchpw]").click(); pg.wait_for_timeout(400)
    pruefe(pg.locator(".dialog-huelle:not(.nb-huelle) input[type=password]").count() == 3, "auch Admin: altes Passwort nötig")
    pg.locator(".dialog-huelle:not(.nb-huelle) input[type=password]").first.fill("abcd")
    pg.locator(".dialog-huelle:not(.nb-huelle) [data-ja]").click(); pg.wait_for_timeout(900)
    a = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'notizbuch_passwort').pop()")
    pruefe(a and a["args"]["p_neu"] == "" and a["args"]["p_alt"] == "abcd", "leer = Sperre aufheben")
    pruefe(pg.locator("[data-nbschloss]").count() == 0 and pg.locator("[data-nbbuch='nb2'] .nb-schlosschen").count() == 0, "aufgehoben: offen, kein Schloss")
    # Sperren mit neuem Passwort
    pg.locator("[data-nbbuchpw]").click(); pg.wait_for_timeout(400)
    fs = pg.locator(".dialog-huelle:not(.nb-huelle) input[type=password]")
    fs.nth(0).fill("geheim1"); fs.nth(1).fill("geheim2")
    pg.locator(".dialog-huelle:not(.nb-huelle) [data-ja]").click(); pg.wait_for_timeout(500)
    pruefe(pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'notizbuch_passwort').length") == 1, "ungleiche Passwörter: nichts gesendet")
    pg.locator("[data-nbbuchpw]").click(); pg.wait_for_timeout(400)
    fs = pg.locator(".dialog-huelle:not(.nb-huelle) input[type=password]")
    fs.nth(0).fill("abcd"); fs.nth(1).fill("abcd")
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-passwort.png"))
    pg.locator(".dialog-huelle:not(.nb-huelle) [data-ja]").click(); pg.wait_for_timeout(900)
    pruefe(pg.evaluate("() => TEST.daten.notizbuecher.find(b => b.id === 'nb2').gesperrt") is True, "gesperrt mit Passwort")
    pruefe(pg.locator("[data-nbschloss]").count() == 0, "wer sperrt, hat es offen")
    pg.locator("[data-nbbuch='nb1']").click(); pg.wait_for_timeout(500)
    pruefe(pg.locator("[data-nbbuch='nb2'] .nb-schlosschen.offen").count() == 1, "offenes Schloss in der Liste")
    pruefe(pg.locator(".dialog-huelle .dialog.nb").count() == 1, "Fenster noch offen")

    # ---------- Einstellungen → Notizbücher: Admin setzt neu ohne altes ----------
    pg.locator(".dialog-huelle .dialog.nb [data-zu]").click(); pg.wait_for_timeout(600)
    pg.evaluate("document.getElementById('kopf-einstellungen').click()"); pg.wait_for_timeout(1000)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_timeout(900)
    erste = pg.evaluate("() => document.querySelector('#einst-inhalt .es-gruppe').id")
    pruefe(erste == "nb-balken", "Balken Notizbücher ganz oben bei Dokumente (" + str(erste) + ")")
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-balken.png"))
    pg.locator("#nb-verwalten").click(); pg.wait_for_timeout(900)
    pruefe(pg.locator(".dialog--nbverwalten [data-esnb]").count() == 2, "Fenster listet die Bücher")
    z = pg.locator("[data-esnb='nb2']")
    pruefe(z.locator(".es-nb__stand.zu").count() == 1, "gesperrtes Buch als gesperrt")
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-einstellungen.png"))
    z.locator("[data-esnbneu]").click(); pg.wait_for_timeout(400)
    fs = pg.locator(".dialog-huelle .dialog:not(.dialog--einstellungen):not(.dialog--nbverwalten) input[type=password]")
    pruefe(fs.count() == 2, "ohne altes Passwort")
    fs.nth(0).fill("neu9"); fs.nth(1).fill("neu9")
    pg.locator(".dialog-huelle .dialog:not(.dialog--einstellungen):not(.dialog--nbverwalten) [data-ja]").click(); pg.wait_for_timeout(900)
    a = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'notizbuch_passwort_admin').pop()")
    pruefe(a and a["args"]["p_neu"] == "neu9", "Admin setzt neues Passwort")
    z.locator("[data-esnbweg]").click(); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle .dialog:not(.dialog--einstellungen):not(.dialog--nbverwalten) [data-ja]").click(); pg.wait_for_timeout(900)
    a = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'notizbuch_passwort_admin').pop()")
    pruefe(a and a["args"]["p_neu"] == "" and z.locator(".es-nb__stand.zu").count() == 0, "Admin hebt Sperre auf")
    br.close()
    fehler += f

    # ---------- Ohne SQL: Hinweis statt Absturz ----------
    br, pg, f = start(p)
    pg.evaluate("""() => { TEST.daten.notizbuecher.forEach(b => delete b.gesperrt);
      TEST.rpc.notizbuch_passwort = () => { throw { message: 'Could not find the function public.notizbuch_passwort', code: 'PGRST202' }; }; }""")
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(700)
    pg.locator("[data-nbbuch='nb2']").click(); pg.wait_for_timeout(600)
    pruefe(pg.locator("[data-nbschloss]").count() == 0, "ohne Spalte gesperrt: Buch normal offen")
    pg.locator("[data-nbbuchpw]").click(); pg.wait_for_timeout(400)
    fs = pg.locator(".dialog-huelle:not(.nb-huelle) input[type=password]")
    fs.nth(0).fill("abcd"); fs.nth(1).fill("abcd")
    pg.locator(".dialog-huelle:not(.nb-huelle) [data-ja]").click(); pg.wait_for_timeout(900)
    pruefe(pg.locator("text=notizbuch-passwort.sql").count() >= 1, "ohne SQL: Hinweis auf notizbuch-passwort.sql")
    br.close()
    fehler += f

    # ---------- Darkmode: dunkles Blatt, helle Schrift; Griff zieht Breite und Höhe ----------
    br, pg, f = start(p)
    pg.evaluate("() => document.body.classList.add('dunkel')")
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(700)
    pg.locator("[data-nbbuch='nb1']").click(); pg.wait_for_timeout(700)
    bg = pg.evaluate("() => getComputedStyle(document.querySelector('.nb-blatt')).backgroundColor")
    fa = pg.evaluate("() => getComputedStyle(document.querySelector('[data-nbtext]')).color")
    pruefe(bg == "rgb(28, 34, 43)", "Darkmode: Blatt dunkel " + bg)
    pruefe(fa == "rgb(238, 241, 245)", "Darkmode: Schrift hell " + fa)
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-dunkel.png"))
    pg.evaluate("() => document.body.classList.remove('dunkel')"); pg.wait_for_timeout(300)
    fa = pg.evaluate("() => getComputedStyle(document.querySelector('[data-nbtext]')).color")
    bg = pg.evaluate("() => getComputedStyle(document.querySelector('.nb-blatt')).backgroundColor")
    pruefe(fa == "rgb(29, 36, 48)" and bg == "rgb(255, 255, 255)", "hell: Blatt weiss, Schrift dunkel")
    pg.locator("[data-nbtext]").first.click(); pg.wait_for_timeout(400)
    r0 = pg.locator("[data-nbedit]").bounding_box()
    g = pg.locator("[data-nbbreite]").bounding_box()
    pg.mouse.move(g["x"] + g["width"] / 2, g["y"] + g["height"] / 2); pg.mouse.down()
    pg.mouse.move(g["x"] + g["width"] / 2 + 60, g["y"] + g["height"] / 2 + 80, steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    r1 = pg.locator("[data-nbedit]").bounding_box()
    pruefe(r1["height"] > r0["height"] + 60 and r1["width"] != r0["width"], "Textfeld-Ecke zieht Breite und Höhe (%dx%d -> %dx%d)" % (r0["width"], r0["height"], r1["width"], r1["height"]))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(1200)
    m = pg.evaluate("() => TEST.daten.notizbuch_seiten.find(s => s.id === 'ns1').inhalt[0].m")
    pruefe(m and m > 0.05, "Höhe gespeichert (m=%s)" % m)
    br.close()
    fehler += f

    # ---------- Handy: kleines Fenster passt hinein ----------
    br, pg, f = start(p, 390, 844)
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(700)
    pg.locator("[data-nbumschalten]").click(); pg.wait_for_timeout(700)
    k = kasten(pg)
    pruefe(k and k["x"] >= 3 and k["x"] + k["width"] <= 388 and k["y"] + k["height"] <= 842, "Handy: ganz im Bild")
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-klein-handy.png"))
    br.close()
    fehler += f

print("Fehler:", fehler if fehler else "keine")
