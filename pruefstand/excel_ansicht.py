# Excel-Ansicht: Einrichtblatt als .xlsx (Schrift, Farben, Rahmen,
# verbundene Zellen, Bild, Blätter) und als altes .xls, aus den
# Dokumenten, als Datei vom Gerät und im Pad Mode. iPad, PC, Handy.
# Die Beispieldateien baut pruefstand/excel_beispiel.mjs.
import sys, time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
HIER = os.path.dirname(os.path.abspath(__file__))
XLSX = open(os.path.join(HIER, "einrichtblatt-beispiel.xlsx"), "rb").read()
XLS = open(os.path.join(HIER, "einrichtblatt-alt.xls"), "rb").read()

K = """daten.dokumente = [
 { id: 'd1', art: 'einrichtblatt', hoco_nr: '10844-0049', type_id: 't1', titel: 'EB neu', dateiname: 'eb.xlsx', datei_url: 'https://x.invalid/eb.xlsx', erstellt_am: '2026-10-05T08:00:00Z' },
 { id: 'd2', art: 'einrichtblatt', hoco_nr: '10844-0050', type_id: 't1', titel: 'EB alt', dateiname: 'eb.xls', datei_url: 'https://x.invalid/eb.xls', erstellt_am: '2026-10-04T08:00:00Z' },
 { id: 'd3', art: 'einrichtblatt', hoco_nr: '10844-0051', type_id: 't1', titel: 'EB kaputt', dateiname: 'kaputt.xlsx', datei_url: 'https://x.invalid/kaputt.xlsx', erstellt_am: '2026-10-03T08:00:00Z' }];"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
F = F.replace("blatt_url: null", "blatt_url: 'https://x.invalid/eb.xlsx'")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
bilder = len(sys.argv) > 1
AB = os.environ.get("BILDER_ORDNER", "/tmp")

def datei_route(r):
    u = r.request.url
    if "kaputt" in u: body, typ = b"das ist kein excel", "application/octet-stream"
    elif u.endswith(".xls"): body, typ = XLS, "application/vnd.ms-excel"
    else: body, typ = XLSX, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    r.fulfill(status=200, content_type=typ, body=body, headers={"Access-Control-Allow-Origin": "*"})

def blatt_text(pg):
    return pg.evaluate("() => { const b = document.querySelector('[data-excelblatt]'); return b ? b.innerText : ''; }")

def warte_blatt(pg):
    pg.wait_for_selector("[data-excelblatt]", timeout=20000); pg.wait_for_timeout(300)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for name, b, h in [("ipad-quer", 1180, 820), ("pc", 1600, 900), ("handy", 390, 844)]:
        pg = br.new_context(viewport={"width": b, "height": h}, device_scale_factor=2).new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
                  "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.route("**://x.invalid/**", datei_route)
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
        pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(500)
        pg.locator("[data-einst='dokumente']").click(); pg.wait_for_selector("[data-dokauf]")

        # .xlsx aus den Dokumenten
        pg.locator("[data-dokauf='https://x.invalid/eb.xlsx']").click(); warte_blatt(pg)
        t = blatt_text(pg)
        pruefe(name + ": Titel da", "Einrichtblatt 10844-0049" in t)
        pruefe(name + ": Zahlen mit Apostroph und Einheit", "12'500 Stk" in t and "4'700" in t and "3'200" in t)
        pruefe(name + ": Nachkommastellen", "0.080" in t and "0.035" in t)
        pruefe(name + ": Datum", "05.10.2026" in t)
        if "Achtung" not in t or "Masse nach" not in t: print(repr(t[-200:]))
        pruefe(name + ": Text mit zwei Schriften", "Achtung: Masse nach Zeichnung prüfen" in t)
        s = pg.evaluate("""() => {
          const els = [...document.querySelectorAll('[data-excelblatt] div')];
          const titel = els.find(e => e.textContent === 'Einrichtblatt 10844-0049');
          const pos = els.find(e => e.textContent === 'Pos');
          const summe = els.find(e => e.textContent === '4\\'700');
          const lang = els.find(e => e.textContent.startsWith('Langer Text'));
          const cs = (e) => e ? getComputedStyle(e) : {};
          return { titelFett: cs(titel).fontWeight, titelBg: cs(titel).backgroundColor, titelB: titel && titel.offsetWidth,
            posFett: cs(pos).fontWeight, posBg: cs(pos).backgroundColor, summeFarbe: cs(summe).color,
            langUmbruch: cs(lang).whiteSpace, langH: lang && lang.offsetHeight,
            striche: document.querySelectorAll('[data-excelblatt] > div[style*="border"]').length,
            bild: (() => { const i = document.querySelector('[data-excelblatt] img'); return i ? { b: i.offsetWidth, h: i.offsetHeight, ok: i.complete && i.naturalWidth > 0 } : null; })(),
            gitter: !!document.querySelector('[data-excelblatt] svg'),
            reiter: [...document.querySelectorAll('[data-blattreiter]')].map(r => r.textContent),
            seiten: document.querySelectorAll('[data-excelseite]').length,
            papier: (() => { const r = document.querySelector('[data-excelseite]').getBoundingClientRect();
              const bu = document.querySelector('.excelansicht__buehne').getBoundingClientRect();
              return { b: r.width, h: r.height, l: r.left - bu.left, o: r.top - bu.top, r: bu.right - r.right, u: bu.bottom - r.bottom }; })(),
            inhalt: (() => { const p = document.querySelector('[data-excelseite]').getBoundingClientRect();
              const f = document.querySelector('[data-excelseite] > div').getBoundingClientRect();
              return { l: f.left - p.left, o: f.top - p.top, r: p.right - f.right }; })(),
            quer: document.documentElement.scrollWidth <= window.innerWidth };
        }""")
        print(name, s)
        pruefe(name + ": Titel fett auf Blau", s["titelFett"] == "700" and s["titelBg"] == "rgb(0, 56, 132)")
        pruefe(name + ": Titel über vier Spalten verbunden", s["titelB"] and s["titelB"] > 400)
        pruefe(name + ": Kopfzeile fett und hell eingefärbt", s["posFett"] == "700" and s["posBg"] not in ("", "rgba(0, 0, 0, 0)"))
        pruefe(name + ": Summe rot", s["summeFarbe"] == "rgb(192, 0, 0)")
        # Dunkelmodus macht sonst jede Schrift weiss, auch auf dem Papier
        d = pg.evaluate("""() => { document.body.classList.add('dunkel');
          const els = [...document.querySelectorAll('[data-excelblatt] div')];
          const f = (t) => { const e = els.find(x => x.textContent === t); return e ? getComputedStyle(e).color : null; };
          const r = { titel: f('Pos'), summe: f('4\\'700') };
          document.body.classList.remove('dunkel'); return r; }""")
        pruefe(name + ": Dunkelmodus: Schrift bleibt schwarz und rot", d["titel"] == "rgb(0, 0, 0)" and d["summe"] == "rgb(192, 0, 0)")
        pruefe(name + ": Zeilenumbruch", s["langUmbruch"] == "pre-wrap")
        pruefe(name + ": Rahmenlinien", s["striche"] >= 20)
        pruefe(name + ": Bild geladen", bool(s["bild"] and s["bild"]["ok"] and s["bild"]["b"] > 50))
        # Werkzeugbild: in Excel zugeschnitten (linke Hälfte) und Weiss durchsichtig
        wz = pg.evaluate("""async () => {
          const imgs = [...document.querySelectorAll('[data-excelblatt] img')];
          if (imgs.length < 2) return { anzahl: imgs.length };
          const i = imgs[1], rahmen = i.parentElement;
          await (i.decode ? i.decode().catch(() => {}) : null);
          const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
          const g = c.getContext('2d'); g.drawImage(i, 0, 0);
          return { anzahl: imgs.length, bildB: i.getBoundingClientRect().width, rahmenB: rahmen.getBoundingClientRect().width,
            ueberlauf: getComputedStyle(rahmen).overflow, links: [...g.getImageData(5, 5, 1, 1).data],
            rechts: [...g.getImageData(35, 5, 1, 1).data] };
        }""")
        print(name, "werkzeug", wz)
        pruefe(name + ": Zuschnitt aus Excel", wz.get("anzahl") == 2 and wz["ueberlauf"] == "hidden"
               and abs(wz["bildB"] - 2 * wz["rahmenB"]) < 2)
        pruefe(name + ": Weiss durchsichtig, Rot bleibt", wz.get("rechts", [0, 0, 0, 255])[3] == 0
               and wz.get("links", [0, 0, 0, 0])[3] == 255 and wz["links"][0] > 150)
        pruefe(name + ": ohne Hilfslinien wie im Blatt eingestellt", not s["gitter"])
        pruefe(name + ": Blätter ohne verstecktes", s["reiter"] == ["Einrichtblatt", "Werkzeuge"])
        pa = s["papier"]
        pruefe(name + ": eine A4-Seite quer", s["seiten"] == 1 and abs(pa["b"] / pa["h"] - 1123 / 794) < 0.01)
        pruefe(name + ": ganze Seite sichtbar und eingepasst", min(pa["l"], pa["o"], pa["r"], pa["u"]) >= 8
               and min(pa["l"] + pa["r"], pa["o"] + pa["u"]) < 30)
        pruefe(name + ": Ränder der Seite zu sehen", s["inhalt"]["l"] > pa["b"] * 0.03 and s["inhalt"]["o"] > pa["h"] * 0.04
               and s["inhalt"]["r"] >= s["inhalt"]["l"] - 1)
        pruefe(name + ": nichts ragt aus dem Bildschirm", s["quer"])
        if bilder: pg.screenshot(path=f"{AB}/excel-{name}.png")
        # Zoom
        b0 = pa["b"]
        pg.click("[data-groesser]"); pg.wait_for_timeout(400)
        b1 = pg.evaluate("document.querySelector('[data-excelseite]').getBoundingClientRect().width")
        pruefe(name + ": Vergrössern", b1 > b0 * 1.3 and pg.inner_text("[data-einpassen]") == "140%")
        pg.click("[data-einpassen]"); pg.wait_for_timeout(400)
        pruefe(name + ": Einpassen zurück", abs(pg.evaluate("document.querySelector('[data-excelseite]').getBoundingClientRect().width") - b0) < 2)
        # Drucken: eigenes Fenster mit dem Blatt samt Bild
        with pg.expect_popup() as neu: pg.click(".betrachter [data-drucken]")
        dr = neu.value; dr.wait_for_timeout(800)
        pruefe(name + ": Drucken mit Blatt und Bild", "Einrichtblatt 10844-0049" in dr.inner_text("body")
               and dr.evaluate("[...document.images].every(i => i.naturalWidth > 0)"))
        dr.close()
        # Zweites Blatt
        pg.click("[data-blattreiter='1']"); pg.wait_for_timeout(300)
        t2 = blatt_text(pg)
        pruefe(name + ": zweites Blatt", "VCGT 160404" in t2 and "25%" in t2 and "Einrichtblatt 10844" not in t2)
        if bilder: pg.screenshot(path=f"{AB}/excel-{name}-blatt2.png")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
        pruefe(name + ": Escape schliesst", pg.locator(".betrachter-huelle").count() == 0)

        # Altes .xls
        pg.locator("[data-dokauf='https://x.invalid/eb.xls']").click(); warte_blatt(pg)
        t = blatt_text(pg)
        pruefe(name + ": altes .xls", "Einrichtblatt alt" in t and "3200" in t and "Abstechstahl" in t)
        pg.click(".betrachter [data-zu]"); pg.wait_for_timeout(300)

        # Kaputte Datei: verständliche Meldung statt Absturz
        pg.locator("[data-dokauf='https://x.invalid/kaputt.xlsx']").click()
        pg.wait_for_selector(".excelansicht__fehler", timeout=20000)
        pruefe(name + ": kaputte Datei mit Hinweis", "nicht anzeigen" in pg.inner_text(".excelansicht__fehler"))
        pg.click(".betrachter [data-zu]"); pg.wait_for_timeout(300)

        # Datei vom Gerät, ohne Hochladen
        with pg.expect_file_chooser() as fc: pg.click("#dok-ansehen")
        fc.value.set_files(os.path.join(HIER, "einrichtblatt-beispiel.xlsx")); warte_blatt(pg)
        pruefe(name + ": Datei vom Gerät", "Einrichtblatt 10844-0049" in blatt_text(pg)
               and pg.evaluate("TEST.protokoll.filter(x => JSON.stringify(x).includes('upload')).length") == 0)
        pg.click(".betrachter [data-zu]"); pg.wait_for_timeout(300)
        fehler += [name + ": " + x for x in f]
        pg.context.close()

    # Pad Mode: Knopf Einrichtblatt öffnet das Excel-Blatt
    pg = br.new_context(viewport={"width": 1180, "height": 820}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.route("**://x.invalid/**", datei_route)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl")
    pg.click("#pad [data-padreiter='blatt']"); warte_blatt(pg)
    pruefe("Pad: Einrichtblatt als Excel", "Einrichtblatt 10844-0049" in blatt_text(pg))
    if bilder: pg.screenshot(path=f"{AB}/excel-pad.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe("Pad: zurück auf der Maschine", pg.locator("#pad .pad-stk-zahl").count() == 1)
    fehler += ["pad: " + x for x in f]
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
