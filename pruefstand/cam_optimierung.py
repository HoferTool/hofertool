# HOFERCAM Optimierung (seit 1.692.0): zuerst Material, dann Vorschläge
# als Liste (Schnittgeschwindigkeit, Rautiefe, Leerwege, Bohrtiefe ohne
# Entspänen, doppelte Zeile, Verweilzeit).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
S = "/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/"
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    for n, x in [("A", "17"), ("W", "15"), ("B", "1.5"), ("X", "-0.8"), ("S", "3000"), ("Z", "160"), ("F", "0.03")]:
        pg.fill(f"[data-cam='{n}']", x)
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='0'] [data-camblock='S']", "3000")
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X20.Z-30.F0.3\nG1Z-3.\nG1X12.\nG1Z8.\nG1X17.5")
    pg.click("[data-camwz-auf='0']"); pg.click("[data-camwz-form='C']")
    pg.fill("[data-camwz='r']", "0.4"); pg.click("[data-camwz-sl='ur']")
    pg.click(".cam-wz [title='Schliessen']")
    pg.click("#cam-neu-front")
    pg.fill("[data-block='1'] [data-camblock='S']", "2500")
    pg.fill("[data-block='1'] [data-camblock='code']", "G4U1.\nG1Z30.F0.05\nG1Z0.F2.\nG0Z0.\nG0Z0.")
    pg.click("[data-camwz-auf='1']"); pg.click("[data-camwz-form='bohrer']")
    pg.fill("[data-camwz='d']", "5"); pg.fill("[data-camwz='winkel']", "118"); pg.fill("[data-camwz='laenge']", "40")
    pg.click(".cam-wz [title='Schliessen']")
    pg.click("#cam-opt-auf")
    pg.wait_for_selector("[data-cam-opt]")
    pruefe("Fragt zuerst nach Material", pg.locator("[data-cam-opt-werkstoff]").count() == 9 and pg.locator("[data-cam-opt-los]").is_disabled())
    pg.fill("[data-cam-opt-text]", "Aluminium rd 17")
    pg.wait_for_timeout(100)
    pruefe("Text erkannt: %s" % pg.text_content(".cam-opt__hinweis"), "Aluminium" in pg.text_content(".cam-opt__hinweis"))
    pg.click("[data-cam-opt-los]")
    pg.wait_for_selector(".cam-opt__zahlen")
    txt = pg.text_content("[data-cam-opt]")
    print(txt[:2500])
    pruefe("Alu: Drehzahl erhöhen", "erhöhen" in txt)
    pruefe("Rautiefe", "Rz" in txt)
    pruefe("Leerweg im Vorschub als Tipp", "wo kein Material mehr ist" in txt)
    pruefe("Wegfahren G1Z0.F2. ist kein Bohrvorschub (1.718.0)", "Bohrvorschub 2 " not in txt)
    pruefe("Bohrung ohne Entspänen wichtig", "ohne Entspänen" in txt and pg.locator("[data-cam-opt-stufe='wichtig']").count() >= 1)
    pruefe("Doppelte Zeile", "zweimal hintereinander" in txt)
    pruefe("Verweilzeit", "Verweilzeit 1 s" in txt)
    pruefe("Laufzeit geschätzt", "Laufzeit geschätzt" in txt)
    pg.locator("[data-cam-opt]").screenshot(path=S + "opt_alu.png")
    pg.click("[data-cam-opt-zurueck]")
    pg.click("[data-cam-opt-werkstoff='v2a']"); pg.click("[data-cam-opt-los]")
    pg.wait_for_selector(".cam-opt__zahlen")
    t2 = pg.text_content("[data-cam-opt]")
    pruefe("V2A: Drehen 165 m/min passt (kein Erhöhen beim T100)", "Nur 165" not in t2)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    pg.reload(); pg.wait_for_selector("#cam-kanaele")
    pg.click("#cam-opt-auf"); pg.wait_for_selector("[data-cam-opt]")
    pruefe("Gerät merkt V2A", "knopf--haupt" in (pg.get_attribute("[data-cam-opt-werkstoff='v2a']", "class") or ""))
    # Mit Patricks O1272/O2272/O3272 (SW-20, nur wenn im Projektordner)
    import os
    O = "/mnt/project-files/hofercam/sw20"
    dat = [O + "/" + n for n in ("1272.nc", "2272.nc", "3272.nc")]
    if all(os.path.exists(d) for d in dat):
        pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        pg.click("#cam-schliessen") if pg.locator("#cam-schliessen").count() else None
        pg.select_option("#cam-typwahl", "star-sw20"); pg.wait_for_timeout(400)
        if pg.locator(".dialog-huelle button:has-text('Ja')").count(): pg.click(".dialog-huelle button:has-text('Ja')")
        pg.set_input_files("#cam-einlesen input", dat); pg.wait_for_timeout(1200)
        pg.click("#cam-opt-auf"); pg.wait_for_selector("[data-cam-opt]")
        pg.click("[data-cam-opt-werkstoff='v2a']"); pg.click("[data-cam-opt-los]")
        pg.wait_for_selector(".cam-opt__zahlen")
        t3 = pg.text_content("[data-cam-opt]")
        print(t3[:3000])
        pruefe("SW-20 O1272: Liste mit Bearbeitungen", pg.locator("[data-cam-opt-block]").count() >= 1)
        pg.locator("[data-cam-opt]").screenshot(path=S + "opt_sw20.png")
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
