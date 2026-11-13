# NC-PRO → 508 Werkzeuge (seit 1.508.0): Werkzeugsatz .TLM aus InventorCAM statt CSV, mit Drehstählen und Greifer; seit 1.508.1 auch .TLS
import time, os, tempfile
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

def fach(nr, name, q, x, r, s=30000, t=3, i="180.0000", e=0):
    return [f"N{nr} D1 ({name})", f"G{nr}", f"T1 E{e} F1 P0 R0 Q{q}", "I9 J3600 K3600",
            f"A-2 S{s} T{t} I{i} J0.0000 K0.0000 F0 Q0 R0 B0.0", "A-3 I0 J0 K0 L0", "A-4 I0.0000 J0.0000 K0 L0"] + \
           [f"A{k} X{x} U0.0100 S0.0000 R{r}" for k in range(1, 5)] + ["A5 X999.9999 U0.0000 S0.0000 R0.0000"]
dat = ["%"] + fach(1, "BOHRER D 1.8 VHM", 160, "77.0639", "0.9000", i="118.0000") \
      + fach(2, "FRAESER VHM D2.0", 110, "73.8268", "0.9800") + ["N0", "G3"] \
      + fach(4, "MESSTASTER", 900, "125.1323", "1.0000", s=300) + ["N0", "G5", "%"]

def schneide(nr, name, tt, mill, len_="", fl="", inner=""):
    sh = f'<Shape Ver="7" ShapeType="0" NumFlutes="{fl}"><LenParams>{len_}</LenParams><Params>{inner}</Params></Shape>' if mill == "-1" else '<Shape Ver="7" ShapeType="0" ToolType="16"><LenParams/><Params/></Shape>'
    return (f'<CompTool Ver="6" ID="{nr}0" Name="Komplettwerkzeug" Type="0" ToolNumber="{nr}" DeviceId="0" StationId="0" IsOnMagazine="1">'
            f'<Components><CompTool Ver="3" Name="Halter" Type="2"><Components><CompTool Ver="1" Name="{name}" Type="1" IsMilling="{mill}" ToolType="{tt}">{sh}</CompTool></Components></CompTool></Components></CompTool>')
tlm = ('<?xml version="1.0" encoding="UTF-8"?>\r\n<ToolsItemsManager Version="11" Istoolkit="1" Machine="WilleminMacodel_508MT2_X1000_Fanuc31"><Components>'
       '<CompTool Ver="6" Name="Hainbuch S3" Type="0" ToolNumber="1" DeviceId="3" StationId="1" IsOnMagazine="0"></CompTool>'
       + schneide(1, "VHM BOHR D1.8", 0, "-1", '<D Units="0" Val="1.8"/><TL Units="0" Val="40"/>', 2, '<A Units="0" Val="140"/>')
       + schneide(3, "Kopierfräser R0.5", 15, "-1", '<D Units="0" Val="1"/><R Units="0" Val="0.5"/>', 2)
       + schneide(7, "DCGT 11T302", 16, "0")
       + '<CompTool Ver="6" Name="FESTO Greifer" Type="0" ToolNumber="4" DeviceId="0" StationId="0" IsOnMagazine="1"><Components><CompTool Ver="3" Name="C4 Grundhalter" Type="2"></CompTool></Components></CompTool>'
       '</Components></ToolsItemsManager>\r\n')
# Dieselbe Arbeit als .TLS des Teils: Machine leer, alles IsOnMagazine="0",
# das Spannmittel hängt mit LoadedOnDeviceId an der Spindel (seit 1.508.1)
tls = tlm.replace('Machine="WilleminMacodel_508MT2_X1000_Fanuc31"', 'Machine=""').replace('IsOnMagazine="1"', 'IsOnMagazine="0"') \
         .replace('DeviceId="3" StationId="1"', 'DeviceId="0" LoadedOnDeviceId="3" StationId="1"')
for name, inhalt in ([("satz.TLM", tlm), ("teil.TLS", tls)] if not os.environ.get("TLM") else [("satz.TLM", tlm)]):
    print("—", name)
    tmp = tempfile.mkdtemp()
    pd, pt = os.path.join(tmp, "GESTOUTI.DAT"), os.path.join(tmp, name)
    open(pd, "w", newline="").write("\r\n".join(dat))
    open(pt, "w", encoding="utf-8", newline="").write(os.environ.get("TLM") and open(os.environ["TLM"], encoding="utf-8").read() or inhalt)
    if os.environ.get("DAT"): open(pd, "wb").write(open(os.environ["DAT"], "rb").read())

    with sync_playwright() as p:
        br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = br.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
        pg.wait_for_selector("[data-unter='nc/wz508']"); pg.click("[data-unter='nc/wz508']")
        pg.wait_for_selector("#wz5")
        pg.set_input_files("#wz5-dat", pd); pg.set_input_files("#wz5-csv", pt)
        pg.wait_for_selector("#wz5-tabelle")
        pg.screenshot(path=os.path.join(tmp, "wz508_tlm.png"), full_page=True)
        print("Bild:", os.path.join(tmp, "wz508_tlm.png"))
        print(pg.text_content("#wz5-csv-ok"))
        if os.environ.get("TLM"):
            for r in pg.locator("#wz5-tabelle tbody tr").all(): print("  ", r.get_attribute("data-wz5"), r.locator(".wz5-schild").text_content(), [i.input_value() for i in r.locator("input.wz5-name, select:not(.wz5-fach), input.wz5-zahl").all()], " ".join(r.locator("td").last.text_content().split())[:90])
        else:
            zeile = lambda n: " ".join(pg.text_content(f"[data-wz5='{n}']").split())
            pruefe(name + ": Spannmittel weggelassen, 4 Werkzeuge", "4 Werkzeuge, davon 2 Drehstähle" in pg.text_content("#wz5-csv-ok"))
            pruefe(name + ": Bohrer 1 ändern", "Ändern" in zeile(1))
            pruefe(name + ": Kopierfräser 3 neu als 130", "Neu" in zeile(3) and pg.locator("[data-wz5='3'] select").nth(1).input_value() == "130")
            pruefe(name + ": Greifer 4 bleibt im Fach", "Bleibt" in zeile(4) and "steht in Fach 4" in zeile(4))
            pruefe(name + ": Drehstahl 7 fehlt", "Fehlt" in zeile(7) and pg.locator("#wz5-dreh-fehlt").count() == 1)
            pruefe(name + ": Drehstähle nicht im Magazin", pg.locator("[data-mag-wz='7']").count() == 0 and pg.locator("[data-mag-wz='3']").count() == 1)
            with pg.expect_download() as dl:
                pg.click("#wz5-laden")
            neu = open(dl.value.path(), "rb").read().decode("ascii").split("\r\n")
            pruefe(name + ": Neu Kopierfraeser in Fach 3", "N3 D1 (Kopierfraeser R0.5)" in neu)
            i3 = neu.index("N3 D1 (Kopierfraeser R0.5)")
            pruefe(name + ": Ohne H-Länge 999.9999, zu vermessen", neu[i3 + 2] == "T1 E6 F1 P0 R0 Q130" and neu[i3 + 7].startswith("A1 X999.9999") and "R0.5000" in neu[i3 + 7])
            pruefe(name + ": Taster bleibt", "N4 D1 (MESSTASTER)" in neu)
        br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
