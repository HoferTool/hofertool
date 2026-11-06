# Pad Mode: Kachel „Wartung“ statt „Internet“ (1.337.0, Wunsch Patrick
# 2. November 2026). Bild ablegen, terminieren; ab dem Termin zeigt der
# Bildschirmschoner das Bild statt des Einrichtblatts (auch wenn eine
# Kachel mahnt), bis „Erledigt“ unten in der Mitte quittiert.
# Seit 1.338.0 je Maschinentyp mit Wiederholung, Quittung je Maschine,
# dazu die Backup-Batterien mit eigenem Schoner.
# Seit 1.339.0 auch je Park oder einzelne Maschine.
import sys, time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """(() => { daten.machines.forEach((m) => { if (/^m-l/.test(m.id)) m.type_id = "t1"; }); })();"""
FAKE = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
AB = os.environ.get("BILDER_ORDNER", "/tmp")
PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                    "1f15c4890000000d49444154789c63f8cf80000000030001a5f2bd6f0000000049454e44ae426082")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def warten(pg, ms):
    pg.clock.fast_forward(ms); pg.wait_for_timeout(1300)
SCHONER = "[data-wartung-schoner]"

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.clock.install()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(800)

    pruefe("keine Internet-Kachel mehr", pg.locator(".pad-karte2--browser").count() == 0)
    r = pg.evaluate("""() => { const a=document.querySelector('.pad-karte2--abend').getBoundingClientRect(),
       b=document.querySelector('.pad-karte2--wartung').getBoundingClientRect();
       return {zeile: Math.abs(a.top-b.top)<2, gleich: Math.abs(a.width-b.width)<3}; }""")
    pruefe("Wartung neben Stück am Abend, gleich breit", r["zeile"] and r["gleich"])
    pruefe("Kachel: keine geplant", "keine geplant" in pg.locator(".pad-karte2--wartung").inner_text())

    # Ablegen ohne Termin
    pg.locator(".pad-karte2--wartung").click(); pg.wait_for_selector("#wartung")
    pg.set_input_files("#wartung-datei", files=[{"name": "Filter wechseln.png", "mimeType": "image/png", "buffer": PNG}])
    pg.wait_for_selector(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(300)
    pg.click(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(800)
    zeilen = pg.evaluate("TEST.daten.wartung_plan || []")
    pruefe("eine Wartung je Typ gespeichert", len(zeilen) == 1 and zeilen[0]["titel"] == "Filter wechseln"
           and zeilen[0]["art"] == "bild" and not zeilen[0].get("termin") and zeilen[0]["type_id"] == "t1")
    mid = pg.evaluate("TEST.daten.machines.find(m => document.querySelector('#wartung h2').textContent.includes(m.machine_number || m.name)).id")
    print("Maschine:", mid)
    pruefe("Batterien stehen im Fenster", pg.locator("#wartung [data-wartung-batterien]").count() == 1)
    pruefe("Zeile zeigt kein Termin", "Kein Termin" in pg.locator("#wartung").inner_text())

    # Terminieren: eine Minute in der Vergangenheit
    pg.locator("[data-wartung-termin]").first.click(); pg.wait_for_timeout(400)
    pg.evaluate("""() => { const d = new Date(Date.now() - 60000), z = (n) => String(n).padStart(2, '0');
      const el = document.querySelector('.dialog-huelle:nth-last-child(1 of .dialog-huelle) input[type=datetime-local]');
      el.value = d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())+'T'+z(d.getHours())+':'+z(d.getMinutes());
      const s = [...document.querySelectorAll('.dialog-huelle:nth-last-child(1 of .dialog-huelle) select')].find(x => [...x.options].some(o => o.value === 'woche')); s.value = 'woche'; s.dispatchEvent(new Event('change', {bubbles: true})); }""")
    pg.click(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(800)
    pruefe("Termin mit Wiederholung gesetzt", bool(pg.evaluate("TEST.daten.wartung_plan[0].termin"))
           and pg.evaluate("TEST.daten.wartung_plan[0].wiederholung") == "woche")
    pruefe("nächster Termin in einer Woche angezeigt", "Jede Woche" in pg.locator("#wartung").inner_text()
           and "nächster Termin" in pg.locator("#wartung").inner_text())
    pruefe("Zeile fällig mit Erledigt", pg.locator(".wartung__zeile--faellig [data-wartung-erledigt]").count() == 1)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-fenster.png"))
    pg.click("#wartung [data-zu]"); pg.wait_for_timeout(500)
    pruefe("Kachel fällig", pg.locator(".pad-karte2--wartung-faellig").count() == 1)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-kachel.png"))

    # Die Kacheln mahnen (Stückzeit, Stückzahl) – Wartung kommt trotzdem
    warten(pg, 61000)
    pruefe("Schoner zeigt die Wartung", pg.locator(SCHONER).count() == 1)
    pruefe("Bild im Schoner", pg.locator(SCHONER + " .pad-schoner__bild").count() == 1)
    pruefe("Titel oben", "Filter wechseln" in pg.locator(".pad-schoner__wartung-titel").inner_text())
    b = pg.locator("[data-wartung-erledigt-schoner]").bounding_box()
    pruefe("Erledigt unten in der Mitte", b and abs(b["x"] + b["width"] / 2 - 590) < 3 and b["y"] > 820 - 140)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-schoner.png"))

    # Tipp daneben: nur zurück, sie kommt wieder
    pg.locator("[data-padschonerzu]").click(position={"x": 200, "y": 300}); pg.wait_for_timeout(500)
    pruefe("Tipp daneben schliesst", pg.locator(SCHONER).count() == 0)
    pruefe("noch nicht erledigt", not pg.evaluate("TEST.daten.wartung_erledigt || []"))
    warten(pg, 61000)
    pruefe("kommt nach einer Minute wieder", pg.locator(SCHONER).count() == 1)

    pg.click("[data-wartung-erledigt-schoner]"); pg.wait_for_timeout(900)
    e = pg.evaluate("TEST.daten.wartung_erledigt || []")
    pruefe("Erledigt quittiert je Maschine", pg.locator(SCHONER).count() == 0 and len(e) == 1
           and e[0]["machine_id"] == mid and bool(pg.evaluate("TEST.daten.wartung_plan[0].termin")))
    warten(pg, 61000)
    pruefe("danach keine Wartung mehr im Schoner", pg.locator(SCHONER).count() == 0)
    pruefe("Kachel wieder ruhig", pg.locator(".pad-karte2--wartung-faellig").count() == 0)
    # Eine Woche später: wieder fällig
    # (Termin und Quittung eine Woche zurück = eine Woche später; die Uhr
    # weit vorstellen liesse die App stündlich neu laden)
    pg.evaluate("""() => { const w = 7 * 86400000, d = TEST.daten;
      d.wartung_plan[0].termin = new Date(new Date(d.wartung_plan[0].termin) - w).toISOString();
      d.wartung_erledigt.forEach((e) => { e.erledigt_am = new Date(new Date(e.erledigt_am) - w).toISOString(); });
      window.dispatchEvent(new Event('hofer:wartung')); }""")
    pg.wait_for_timeout(800)
    pruefe("nach einer Woche wieder fällig", pg.locator(".pad-karte2--wartung-faellig").count() == 1)
    warten(pg, 61000)
    pruefe("Schoner wieder da", pg.locator(SCHONER).count() == 1)
    pg.click("[data-wartung-erledigt-schoner]"); pg.wait_for_timeout(900)
    pruefe("zweite Quittung", len(pg.evaluate("TEST.daten.wartung_erledigt")) == 2)

    # Backup-Batterien heute fällig: eigener Schoner, Erledigt = gewechselt
    pg.evaluate("""(mid) => { const d = TEST.daten; d.maschinen_info = d.maschinen_info || [];
      const gestern = new Date(Date.now() - 86400000), z = (n) => String(n).padStart(2, '0');
      d.maschinen_info.push({ machine_id: mid, batterie_faellig: gestern.getFullYear()+'-'+z(gestern.getMonth()+1)+'-'+z(gestern.getDate()),
        batterie_hinweis: true, batterie_anzahl: 2, batterie_art: 'Mono D (LR20, die dicken)' });
      window.dispatchEvent(new Event('hofer:wartung')); }""", mid)
    pg.wait_for_timeout(800)
    pruefe("Kachel fällig wegen Batterien", "Backup-Batterien" in pg.locator(".pad-karte2--wartung").inner_text())
    # 1.345.0: Batterie steht bei „Als Nächstes“ mit „Gewechselt“, keine eigene Karte, ganzes Fenster rollt
    pg.locator(".pad-karte2--wartung").click(); pg.wait_for_selector("#wartung [data-wartung-naechstes]"); pg.wait_for_timeout(600)
    pruefe("Batterie bei Als Nächstes", pg.locator("#wartung [data-wartung-naechstes] [data-naechst='batterie']").count() == 1
           and "Mono D" in pg.locator("#wartung [data-wartung-naechstes]").inner_text())
    pruefe("keine eigene Batterie-Karte", pg.locator("#wartung [data-wartung-batterien]").count() == 0)
    pruefe("Gewechselt bei Als Nächstes", pg.locator("#wartung [data-wartung-naechstes] [data-batterie-erledigt]").count() == 1)
    rollt = pg.evaluate("""() => { const w = document.querySelector('#wartung'), l = w.querySelector('.wartung__liste');
      return { fenster: getComputedStyle(w).overflowY, liste: l ? getComputedStyle(l).overflowY : 'visible',
               hoch: w.scrollHeight > w.clientHeight }; }""")
    print("Rollen:", rollt)
    pruefe("ganzes Fenster rollt, Liste nicht für sich", rollt["fenster"] == "auto" and rollt["liste"] == "visible")
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-batterie-naechstes.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    warten(pg, 61000)
    pruefe("Batterie-Schoner", pg.locator(".pad-schoner--batterie").count() == 1
           and "2 × Mono D" in pg.locator(".pad-schoner--batterie").inner_text())
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-batterie.png"))
    pg.click("[data-wartung-erledigt-schoner]"); pg.wait_for_timeout(1000)
    info = pg.evaluate("(mid) => TEST.daten.maschinen_info.find(i => i.machine_id === mid)", mid)
    hist = pg.evaluate("(mid) => (TEST.daten.maschinen_wartung || []).filter(w => w.machine_id === mid)", mid)
    pruefe("Batterien gewechselt: Termin in 2 Jahren, Eintrag in Historie",
           info.get("batterie_gewechselt") and info["batterie_faellig"][:4] == str(int(info["batterie_gewechselt"][:4]) + 2)
           and len(hist) == 1)
    pruefe("Batterie-Schoner weg", pg.locator(".pad-schoner--batterie").count() == 0)
    # Einstellungen → Wartung: dieselbe Liste, Maschine wählen, gross
    pg.click("#pad [data-padzurueck]"); pg.wait_for_timeout(400)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('#pad [data-padzu], #pad .pad-schliessen') && document.querySelector('#pad [data-padzu], #pad .pad-schliessen').click()")
    pg.wait_for_timeout(500)
    if pg.locator("#pad").count(): pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.evaluate("TEST.daten.wartung_plan[0].url = location.origin + '/icon-512.png'")
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(700)
    pruefe("Reiter Wartung da", pg.locator("[data-einst='wartung']").count() == 1)
    pg.click("[data-einst='wartung']"); pg.wait_for_timeout(700)
    # 1.353.0: zuerst Vorlagen nach Langdreher, Kurzdreher, Extern
    pruefe("Reiter Vorlagen zuerst offen", pg.locator("#wartung-vorlagen").count() == 1
           and pg.locator("#wartung-vorlagen [data-vorlage-gruppe]").count() == 3)
    pg.set_input_files("#vorlage-datei", files=[{"name": "Langdreher Öl.png", "mimeType": "image/png", "buffer": PNG}])
    pg.wait_for_selector(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(300)
    pg.click(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(900)
    pg.click("#wartung-vorlagen [data-vorlage-gruppe='kurzdreher']"); pg.wait_for_timeout(300)
    pg.set_input_files("#vorlage-datei", files=[{"name": "Kurzdreher Filter.png", "mimeType": "image/png", "buffer": PNG}])
    pg.wait_for_selector(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(300)
    pg.click(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(900)
    vl = pg.evaluate("TEST.daten.wartung_vorlagen || []")
    print("Vorlagen:", [(v["titel"], v["gruppe"]) for v in vl])
    pruefe("zwei Vorlagen in ihrer Gruppe", len(vl) == 2 and {v["gruppe"] for v in vl} == {"langdreher", "kurzdreher"})
    pruefe("Kurzdreher zeigt nur ihre", pg.locator("#wartung-vorlagen [data-vorlage-zeile]").count() == 1)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-vorlagen.png"))
    pg.click("[data-wartung-teil='zuteilen']"); pg.wait_for_timeout(600)
    pg.click("[data-wartung-typ='t1']"); pg.wait_for_timeout(800)
    pruefe("Wartung des Typs in den Einstellungen", pg.locator(".es-wartung [data-wartung]").count() == 1)
    pruefe("Batterien aller Maschinen des Typs", pg.locator(".es-wartung [data-batterie-maschine]").count() >= 2)
    pruefe("Fällig an: andere Maschinen", "Fällig an" in pg.locator(".es-wartung [data-wartung]").inner_text()
           and pg.evaluate("(mid) => { const m = TEST.daten.machines.find(x => x.id === mid); return m.machine_number || m.name; }", mid) not in pg.locator(".es-wartung [data-faellig-an]").inner_text())
    # 1.346.0: Backup-Batterien für den ganzen Typ auf einmal
    pg.click(".es-wartung [data-batterie-alle]"); pg.wait_for_selector(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(300)
    pg.locator(".dialog-huelle:nth-last-child(1 of .dialog-huelle) input[type=date]").first.fill("2028-08-01")
    pg.evaluate("""() => { const d = document.querySelector('.dialog-huelle:nth-last-child(1 of .dialog-huelle)');
      const s = [...d.querySelectorAll('select')].find(x => [...x.options].some(o => o.value.startsWith('Mono D')));
      s.value = [...s.options].find(o => o.value.startsWith('Mono D')).value; s.dispatchEvent(new Event('change', {bubbles: true}));
      const n = [...d.querySelectorAll('input')].find(x => x.placeholder === 'z. B. 3');
      n.value = '3'; n.dispatchEvent(new Event('input', {bubbles: true})); }""")
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-batt-alle-dialog.png"))
    pg.click(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(1500)
    alle = pg.evaluate("""() => { const ids = TEST.daten.machines.filter(m => m.type_id === 't1').map(m => m.id);
      return ids.map(id => (TEST.daten.maschinen_info || []).find(i => i.machine_id === id) || {}); }""")
    print("Batterien:", [(i.get("batterie_faellig"), i.get("batterie_anzahl")) for i in alle])
    pruefe("Termin für alle Maschinen des Typs gesetzt", len(alle) >= 2 and all(i.get("batterie_faellig") == "2028-08-01"
           and i.get("batterie_anzahl") == 3 and str(i.get("batterie_art", "")).startswith("Mono D") for i in alle))
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-batt-alle.png"))
    vb = pg.locator(".es-wartung .wartung__vorschau").first.bounding_box()
    print("Vorschau:", vb)
    pruefe("Vorschau gross", vb and vb["height"] >= 320 and vb["width"] >= 400)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-einstellungen.png"))
    # 1.339.0: auch je Park oder einzelne Maschine
    pg.click("[data-wartung-art='maschine']"); pg.wait_for_timeout(600)
    andere = pg.evaluate("(mid) => TEST.daten.machines.find(m => m.id !== mid && m.is_active !== false && /^m-l/.test(m.id)).id", mid)
    pg.click(f"[data-wartung-wahl='{andere}']"); pg.wait_for_timeout(800)
    # 1.340.0: die Typ-Wartung steht auch bei der einzelnen Maschine
    pruefe("Maschine gewählt, Typ-Wartung steht dort mit Schild", pg.locator(".es-wartung [data-wartung]").count() == 1
           and pg.locator(".es-wartung [data-wartung-ziel='typ']").count() == 1)
    pg.set_input_files("#wartung-datei", files=[{"name": "Nur hier.png", "mimeType": "image/png", "buffer": PNG}])
    pg.wait_for_selector(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(300)
    pruefe("Vorgabe Gilt für: nur diese Maschine", pg.evaluate("(a) => [...document.querySelectorAll('.dialog-huelle:nth-last-child(1 of .dialog-huelle) select')].some(s => s.value === 'maschine:' + a)", andere))
    pg.click(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(900)
    neu = pg.evaluate("TEST.daten.wartung_plan.find(p => p.titel === 'Nur hier')")
    pruefe("Wartung nur für die Maschine", neu and neu.get("machine_id") == andere and not neu.get("type_id"))
    pruefe("steht in der Liste der Maschine", pg.locator(".es-wartung [data-wartung]").count() == 2)
    # Vorhandene wählen: Typ-Datei dieser Maschine zuteilen, ohne Hochladen
    vorher = pg.evaluate("TEST.daten.wartung_plan.length")
    typplan = pg.evaluate("TEST.daten.wartung_plan.find(p => p.type_id === 't1')")
    pg.click("#wartung-vorhanden"); pg.wait_for_timeout(500)
    pruefe("Auswahl öffnet bei Langdreher", pg.locator("#wartung-wahl [data-vorlage-gruppe='langdreher'][aria-selected=true]").count() == 1)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-vorhanden.png"))
    pg.click("#wartung-wahl [data-vorlage-gruppe='bisher']"); pg.wait_for_timeout(300)
    pg.locator(".dialog-huelle:nth-last-child(1 of .dialog-huelle) button").filter(has_text=typplan["titel"]).first.click(); pg.wait_for_timeout(500)
    pg.evaluate("() => { const f = document.querySelector('.dialog-huelle:nth-last-child(1 of .dialog-huelle) input[name=titel], .dialog-huelle:nth-last-child(1 of .dialog-huelle) input'); f.focus(); }")
    pg.locator(".dialog-huelle:nth-last-child(1 of .dialog-huelle) input").first.fill("Typ-Wartung hier")
    pg.click(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(900)
    neu = pg.evaluate("TEST.daten.wartung_plan.find(p => p.titel === 'Typ-Wartung hier')")
    pruefe("Vorhandene zugeteilt, gleiche Datei", neu and neu.get("machine_id") == andere and neu.get("url") == typplan["url"]
           and pg.evaluate("TEST.daten.wartung_plan.length") == vorher + 1)
    pruefe("steht dann dreimal bei der Maschine", pg.locator(".es-wartung [data-wartung]").count() == 3)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-maschine.png"))
    pg.evaluate("(t) => { const i = TEST.daten.wartung_plan.findIndex(p => p.titel === t); TEST.daten.wartung_plan.splice(i, 1); }", "Typ-Wartung hier")
    pg.evaluate("window.dispatchEvent(new Event('hofer:wartung'))"); pg.wait_for_timeout(500)
    pg.click("[data-wartung-art='park']"); pg.wait_for_timeout(600)
    park = pg.evaluate("(mid) => TEST.daten.machines.find(m => m.id === mid).park_id", mid)
    pg.click(f"[data-wartung-wahl='{park}']"); pg.wait_for_timeout(800)
    pg.set_input_files("#wartung-datei", files=[{"name": "Halle putzen.png", "mimeType": "image/png", "buffer": PNG}])
    pg.wait_for_selector(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(300)
    pg.click(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(900)
    neu = pg.evaluate("TEST.daten.wartung_plan.find(p => p.titel === 'Halle putzen')")
    pruefe("Wartung für den ganzen Park", neu and neu.get("park_id") == park and not neu.get("type_id"))
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-park.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    # Im Pad der ersten Maschine: Typ und Park gelten, „Nur hier“ (andere Maschine) nicht
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    nr = pg.evaluate("(mid) => { const m = TEST.daten.machines.find(x => x.id === mid); return m.machine_number || m.name; }", mid)
    pg.locator("#pad .pad-kachel--maschine").filter(has_text=nr).first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(800)
    pg.locator(".pad-karte2--wartung").click(); pg.wait_for_selector("#wartung"); pg.wait_for_timeout(800)
    t = pg.locator("#wartung").inner_text()
    nx = pg.locator("#wartung [data-wartung-naechstes]")
    pruefe("Als Nächstes oben", nx.count() == 1 and "Als Nächstes" in nx.inner_text())
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-naechstes.png"))
    pruefe("Pad zeigt Typ und Park, nicht die andere Maschine", "Filter wechseln" in t and "Halle putzen" in t and "Nur hier" not in t)
    pruefe("Schild Gilt für je Zeile", pg.locator("#wartung [data-wartung-ziel='park']").count() == 1
           and pg.locator("#wartung [data-wartung-ziel='typ']").count() == 1)
    pg.set_input_files("#wartung-datei", files=[{"name": "Spindel.png", "mimeType": "image/png", "buffer": PNG}])
    pg.wait_for_selector(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(300)
    pg.evaluate("""(mid) => { const s = [...document.querySelectorAll('.dialog-huelle:nth-last-child(1 of .dialog-huelle) select')]
      .find(x => [...x.options].some(o => o.value === 'maschine:' + mid));
      s.value = 'maschine:' + mid; s.dispatchEvent(new Event('change', {bubbles: true})); }""", mid)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-dialog.png"))
    pg.click(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(900)
    neu = pg.evaluate("TEST.daten.wartung_plan.find(p => p.titel === 'Spindel')")
    pruefe("im Pad: nur diese Maschine gewählt", neu and neu.get("machine_id") == mid and not neu.get("type_id"))
    pruefe("steht im Pad mit Schild", pg.locator("#wartung [data-wartung-ziel='maschine']").count() == 1)
    pg.locator("#wartung [data-wartung-ziel]").first.scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-pad-ziele.png"))
    # 1.353.0: Vorlage an der Maschine wählen und dem ganzen Park zuteilen
    pg.click("#wartung-vorhanden"); pg.wait_for_selector("#wartung-wahl"); pg.wait_for_timeout(400)
    pruefe("im Pad: Gruppe Langdreher vorgewählt", pg.locator("#wartung-wahl [data-vorlage-gruppe='langdreher'][aria-selected=true]").count() == 1
           and pg.locator("#wartung-wahl [data-vorlage]").count() == 1)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-vorlage-wahl.png"))
    pg.locator("#wartung-wahl [data-vorlage]").first.click(); pg.wait_for_timeout(500)
    pg.evaluate("""(pk) => { const s = [...document.querySelectorAll('.dialog-huelle:nth-last-child(1 of .dialog-huelle) select')]
      .find(x => [...x.options].some(o => o.value === 'park:' + pk));
      s.value = 'park:' + pk; s.dispatchEvent(new Event('change', {bubbles: true})); }""", park)
    pg.click(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(900)
    v = pg.evaluate("TEST.daten.wartung_vorlagen.find(x => x.gruppe === 'langdreher')")
    neu = pg.evaluate("TEST.daten.wartung_plan.find(p => p.titel === 'Langdreher Öl')")
    pruefe("Vorlage dem Park zugeteilt, gleiche Datei", neu and neu.get("park_id") == park and neu.get("url") == v["url"]
           and neu.get("art") == "bild")
    pruefe("keine Seitenfehler", not f)
    if f: print(f[:3])
    br.close()
print("Fehler:", fehler[:5] if fehler else "keine")
