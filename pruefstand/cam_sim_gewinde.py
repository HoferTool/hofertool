# HOFERCAM 3D-Simulation, Gewinde G76 (seit 1.637.0): jeder Durchgang
# einzeln (Tiefe Q·√n, an der Flanke zugestellt), der Gang als Wendel im
# Zellenraster statt eines abgedrehten Durchmessers; die Gewindeplatte
# steht senkrecht zur Achse, auch mit schräger Lage.
import time, math
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
    for n, x in [("A", "20"), ("W", "30"), ("B", "2"), ("X", "-0.5"), ("S", "3000"), ("Z", "110"), ("F", "0.05")]:
        pg.fill(f"[data-cam='{n}']", x)
    # Drehen auf Ø18 von Z0 bis Z25
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X18.F0.05\nG1Z25.\nG1X21.")
    pg.click("[data-camwz-auf='0']"); pg.click("[data-camwz-form='C']")
    pg.fill("[data-camwz='r']", "0.2"); pg.click("[data-camwz-sl='ur']")
    pg.click(".cam-wz [title='Schliessen']")
    # Gewinde M18x1 von Z3 bis Z21
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='1'] [data-camblock='anZ']", "3") if pg.locator("[data-block='1'] [data-camblock='anZ']").count() else None
    pg.fill("[data-block='1'] [data-camblock='code']", "G76P030060Q40R10\nG76X16.6Z21.P660Q80F1.")
    pg.click("[data-camwz-auf='1']"); pg.click("[data-camwz-form='G']")
    pg.fill("[data-camwz='r']", "0.1"); pg.click("[data-camwz-sl='ur']")
    pg.click(".cam-wz [title='Schliessen']")
    pg.click("#cam-sim-auf"); pg.wait_for_selector("#cam-sim-bild"); pg.wait_for_timeout(300)
    sim = pg.evaluate("() => { const s = document.querySelector('#cam-sim-bild').__sim; return { vox: s.vox, g: s.schritte[1].punkte.filter(p => p.gew).map(p => [p.gew.rt, p.gew.zA, p.z]) }; }")
    rts = sorted(set(round(x[0], 4) for x in sim["g"]))
    pruefe("Raster für das Gewinde da", sim["vox"] is not None)
    pruefe("mehrere Zustellungen (%d Tiefen)" % len(rts), len(rts) >= 6)
    pruefe("tiefste Zustellung auf Kern R8.3 (%s)" % rts[0], abs(rts[0] - 8.3) < 1e-3)
    pruefe("erste Zustellung 0.08 tief (%s)" % rts[-1], abs(rts[-1] - (8.96 - 0.08)) < 1e-3)
    zas = sorted(set(round(x[1], 4) for x in sim["g"]))
    pruefe("an der Flanke zugestellt (Start-Z verschieden: %d)" % len(zas), len(zas) >= 5)
    pg.click("#cam-sim-ende"); pg.wait_for_timeout(600)
    def aussen(z):
        return pg.evaluate("z => { const st = document.querySelector('#cam-sim-bild').__stand.k1; return st.aussen[Math.round((z - st.z0) / 0.02)]; }", z)
    pruefe("Ø18 bleibt im Radiusbild (%s)" % aussen(12), abs(aussen(12) - 9) < 0.03)
    # Raster: auf R8.6 bei Winkel 0 wechseln Gang und Material je Steigung
    lage = pg.evaluate("""() => { const v = document.querySelector('#cam-sim-bild').__stand.vox; if (!v) return null;
      const r = 8.6, iu = Math.floor((r + v.R) / v.h), iw = Math.floor(v.R / v.h); const out = [];
      for (let iz = 0; iz < v.nz; iz++) { const z = v.z0 + (iz + 0.5) * v.h; if (z > 8 && z < 18) out.push(v.feld[(iz * v.nu + iu) * v.nu + iw]); }
      return { weg: v.weg, out }; }""")
    wechsel = sum(1 for a, b in zip(lage["out"], lage["out"][1:]) if a != b)
    pruefe("Wendel weg (%d Zellen)" % lage["weg"], lage["weg"] > 1000)
    pruefe("Gang und Steg wechseln über 10 mm (%d Wechsel)" % wechsel, 16 <= wechsel <= 24)
    voll = sum(lage["out"]) / max(1, len(lage["out"]))
    pruefe("nicht alles weg auf R8.6 (%.2f)" % voll, 0.2 < voll < 0.8)
    pg.locator("#cam-sim").screenshot(path=S + "sim_gewinde.png")
    # Gewindeplatte: Profil symmetrisch zur X-Richtung, Spitze unten
    # mitten in einem Durchgang: Platte steht senkrecht
    pg.click("[data-cam-sim-schritt='1']"); pg.wait_for_timeout(200)
    s1 = pg.evaluate("() => document.querySelector('#cam-sim-bild').__sim.schritte[1]")
    k = [i for i, q in enumerate(s1["punkte"]) if q.get("gew")]
    pg.evaluate("n => { const r = document.querySelector('#cam-sim-regler'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, n); r.dispatchEvent(new Event('input', {bubbles: true})); }", s1["von"] + k[len(k) * 3 // 4])
    pg.wait_for_timeout(500)
    pg.locator("#cam-sim").screenshot(path=S + "sim_gewinde_mitte.png")
    br.close()
print("Fehler: " + ("keine" if not fehler else ", ".join(fehler)))
