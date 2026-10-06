# Auftragsfenster (Wunsch Patrick 6. Oktober 2026): nichts darf über den
# Rand des Fensters hinausragen, auf grossem Bildschirm, Laptop, Tablet
# und Handy. Zustand ist ein Auswahlfeld, die Zeichnung steht rechts und
# quer, die Dokumente darunter, die Notiz unten links. Bilder nach /tmp/auftrag_<breite>x<hoehe>.png
import sys, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
GROESSEN = [(1920, 1080), (1536, 864), (1366, 768), (1280, 720), (1024, 768), (768, 1024), (390, 844)]
NUR_BILD = "--nur-bild" in sys.argv

def oeffnen(pg):
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate("""() => { const ids = new Map(TEST.daten.planwand.map(j => [j.id, j]));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag)
        && b.getBoundingClientRect().width > 30 && b.getBoundingClientRect().left > 0
        && b.getBoundingClientRect().right < innerWidth);
      if (!b) return null; const j = ids.get(b.dataset.auftrag);
      j.drawing_url = "data:application/pdf;base64,JVBERi0xLjQK";
      j.plan_note = "100'000 wöchentlich liefern ab KW08 immer ca. 2'000 Stk.\\nAb Rahmen\\nimmer beziehen !\\n500kg Aussenlager\\n(aus infoBoard)";
      j.material_bez = "11SMnPb37 rd 018 mm h9"; j.material_menge = "1'000 kg · Steeltec 2026001234";
      return b.dataset.auftrag; }""")
    if not jid: fehler.append("kein Balken"); return False
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(1000)
    return pg.locator(".dialog--auftrag").count() == 1

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for (bw, bh) in GROESSEN:
        pg = br.new_context(viewport={"width": bw, "height": bh}).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        if not oeffnen(pg):
            fehler.append(f"{bw}x{bh}: kein Auftragsfenster"); pg.context.close(); continue
        pg.screenshot(path=f"/tmp/auftrag_{bw}x{bh}.png")
        if NUR_BILD: pg.context.close(); continue
        # Jedes sichtbare Element muss innerhalb des Fensters liegen, und
        # das Fenster innerhalb des Bildschirms
        r = pg.evaluate("""() => {
          const d = document.querySelector('.dialog--auftrag'); const dr = d.getBoundingClientRect();
          const raus = [];
          if (dr.bottom > innerHeight + 1 || dr.top < -1 || dr.right > innerWidth + 1) raus.push('Fenster ' + JSON.stringify([dr.top, dr.bottom, innerHeight]));
          // Inhalt, der scrollt, gilt nur, wenn er im Scrollbereich liegt
          const raster = d.querySelector('.auf-raster');
          for (const e of d.querySelectorAll('input, select, textarea, button, label.knopf, .auf-vorschau, iframe')) {
            const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
            const huelle = raster.contains(e) ? raster.getBoundingClientRect() : dr;
            if (r.left < huelle.left - 1 || r.right > huelle.right + 1) raus.push((e.id || e.className || e.tagName) + ' seitlich');
            if (!raster.contains(e) && (r.bottom > dr.bottom + 1 || r.top < dr.top - 1)) raus.push((e.id || e.className || e.tagName) + ' unten');
          }
          // Im Raster: nichts darf über den Scrollbereich hinaus
          if (raster.scrollWidth > raster.clientWidth + 1) raus.push('Raster seitlich zu breit');
          const ueberlauf = getComputedStyle(raster).overflowY;
          if (raster.scrollHeight > raster.clientHeight + 1 && !/auto|scroll/.test(ueberlauf)) raus.push('Raster ragt unten raus');
          return { raus, scrollt: raster.scrollHeight > raster.clientHeight + 1 };
        }""")
        if "--mess" in sys.argv:
            print(pg.evaluate("""() => { const r = document.querySelector('.auf-raster');
              const o = [...document.querySelectorAll('.auf-dok .pdfreihe .knopf, .auf-dok')].map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().right));
              return { sh: r.scrollHeight, ch: r.clientHeight, sw: r.scrollWidth, cw: r.clientWidth, o }; }"""))
        print(f"{bw}x{bh}:", "ok" if not r["raus"] else r["raus"][:5], "(scrollt)" if r["scrollt"] else "")
        for x in r["raus"]: fehler.append(f"{bw}x{bh}: {x}")
        if bw >= 1280 and bh >= 720 and r["scrollt"]: fehler.append(f"{bw}x{bh}: muss scrollen")
        # Zustand als Auswahl, Vorschau rechts, Notiz links
        if pg.locator("select#pl-zustand").count() != 1: fehler.append(f"{bw}x{bh}: kein Auswahlfeld Zustand")
        else:
            lage = pg.evaluate("""() => { const q = (s) => document.querySelector(s).getBoundingClientRect();
              const v = q('#pl-vorschau');
              return { vorschauX: v.left, vorschauB: v.width, vorschauH: v.height, notizX: q('#pl-notiz').left,
                       faX: q('#pl-maschine').left, notizY: q('#pl-notiz').top, matY: q('#pl-mat-bez').top,
                       dokY: q('#pl-pdfreihe').top, vorschauU: v.bottom }; }""")
            # Zeichnung quer (Wunsch 6. Oktober 2026)
            if lage["vorschauB"] < lage["vorschauH"] * 1.2: fehler.append(f"{bw}x{bh}: Vorschau nicht quer {lage}")
            if lage["dokY"] < lage["vorschauU"] - 1: fehler.append(f"{bw}x{bh}: Dokumente nicht unter der Zeichnung")
            if not (abs(lage["notizX"] - lage["faX"]) < 2 and lage["notizY"] > lage["matY"]): fehler.append(f"{bw}x{bh}: Notiz nicht unten links {lage}")
            if bw >= 1200 and not (lage["vorschauX"] > lage["notizX"] + 200): fehler.append(f"{bw}x{bh}: Vorschau nicht rechts {lage}")
        pg.context.close()
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
