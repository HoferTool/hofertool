# Kontrast im dunklen und hellen Modus (1.350.1, Wunsch Patrick 2. November 2026):
# helle Schilder mit weisser Schrift waren im dunklen Modus nicht lesbar
# („gesendet …“ bei den Bestellungen, Vorbereiten). Geht viele Seiten durch
# und sucht Schrift, die sich kaum von ihrer Fläche abhebt.
import time, sys
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

SUCHEN = r"""() => {
  const farbe = s => { const m = s.match(/[\d.]+/g); if (!m) return null; return m.map(Number); };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
    return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const grund = el => { let ebenen = []; let e = el;
    while (e && e.nodeType === 1) { const st = getComputedStyle(e);
      if (st.backgroundImage && st.backgroundImage !== 'none') return null;
      const c = farbe(st.backgroundColor); if (c && (c[3] === undefined || c[3] > 0)) { ebenen.push(c); if (c[3] === undefined || c[3] >= .99) break; }
      e = e.parentElement; }
    let r = [255, 255, 255];
    if (!ebenen.length) r = document.body.classList.contains('dunkel') ? [20, 24, 29] : [255, 255, 255];
    for (let i = ebenen.length - 1; i >= 0; i--) { const c = ebenen[i], a = c[3] === undefined ? 1 : c[3];
      if (i === ebenen.length - 1 && a < 1) { const b = document.body.classList.contains('dunkel') ? [20,24,29] : [255,255,255]; r = b; }
      r = r.map((v, k) => v * (1 - a) + c[k] * a); }
    return r; };
  const aus = [];
  const wurzel = window.__kWurzel || document.body; window.__kWurzel = null;
  for (const el of [wurzel, ...wurzel.querySelectorAll('*')]) {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
    const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('').trim();
    if (!t) continue;
    const st = getComputedStyle(el); if (st.visibility === 'hidden' || +st.opacity < .3) continue;
    if (el.closest('svg, canvas, .eba-seite, .eba-zseite, .excelansicht__blatt, .pw-balken, .nb-blatt')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const c = farbe(st.color); const g = grund(el); if (!c || !g) continue;
    const a = lum(c), b = lum(g); const k = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    if (k < 2.2) aus.push({ k: +k.toFixed(2), cls: (el.className && el.className.baseVal === undefined ? el.className : el.tagName) + ' < ' + (el.parentElement.className || el.parentElement.tagName), t: t.slice(0, 30) });
  }
  return aus; }"""

SEITEN = ["#/dashboard", "#/planwand", "#/produktion", "#/maschinen", "#/bestellungen", "#/material", "#/rechner", "#/einkauf", "#/statistik", "#/infoboard", "#/pausenraum", "#/empfang"]
gefunden = {}
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for dunkel in (True, False):
        pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
        pg.evaluate("() => { const n = new Date().toISOString(); (TEST.daten.order_items||[]).forEach(z => z.gesendet_am = n); }")
        name = "dunkel" if dunkel else "hell"
        def sammeln(wo):
            if dunkel: pg.evaluate("document.body.classList.add('dunkel')")
            pg.wait_for_timeout(250)
            for x in pg.evaluate(SUCHEN):
                gefunden.setdefault((name, x["cls"]), (wo, x["k"], x["t"]))
        def schweben(wo):
            for k in pg.query_selector_all("button:visible, .knopf:visible, [role=button]:visible")[:60]:
                try:
                    k.hover(timeout=400); pg.wait_for_timeout(60)
                    k.evaluate("e => window.__kWurzel = e")
                    for x in pg.evaluate(SUCHEN):
                        gefunden.setdefault((name, "HOVER " + x["cls"]), (wo, x["k"], x["t"]))
                except Exception: pass
            pg.mouse.move(0, 0)
        # Hinweisfenster beim Darüberfahren (Säulen der Statistik, Balken und
        # Ferien der Planwand, Symbole): sie stehen anderswo im Dokument,
        # darum die ganze Seite absuchen (1.352.3, Bild Patrick Statistik)
        def fenster_schweben(wo):
            for sel in (".dg-spalte", ".dg-zeile", ".pw-balken[data-auftrag]", "[data-ferien]", "[data-plsymbol]"):
                for k in pg.query_selector_all(sel)[:3]:
                    try:
                        if not k.is_visible(): continue
                        k.hover(timeout=400); pg.wait_for_timeout(250)
                        for x in pg.evaluate(SUCHEN):
                            gefunden.setdefault((name, "HOVER " + x["cls"]), (wo + " " + sel, x["k"], x["t"]))
                    except Exception: pass
            pg.mouse.move(0, 0)
        for s in SEITEN:
            pg.evaluate(f"location.hash='{s}'"); pg.wait_for_timeout(1300)
            sammeln(s)
            for knopf in pg.query_selector_all(".reiter__knopf, .unterreiter__knopf")[:8]:
                try: knopf.click(timeout=800); pg.wait_for_timeout(700); sammeln(s + " Reiter"); fenster_schweben(s + " Reiter")
                except Exception: pass
            schweben(s)
            fenster_schweben(s)
            pg.keyboard.press("Escape"); pg.keyboard.press("Escape")
        # Auftragsfenster und Vorbereiten
        pg.evaluate("location.hash='#/planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
        pg.evaluate("document.body.classList.remove('dunkel')")
        b = pg.locator(".pw-balken[data-auftrag]").filter(has_text="").nth(3)
        try:
            b.dblclick(); pg.wait_for_selector(".dialog--auftrag", timeout=4000); pg.wait_for_timeout(800)
            sammeln("Auftragsfenster"); schweben("Auftragsfenster")
            if pg.locator("#pl-vorbereiten").count():
                pg.click("#pl-vorbereiten"); pg.wait_for_timeout(900); sammeln("Vorbereiten"); schweben("Vorbereiten")
                pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        except Exception as e: print("Auftragsfenster:", str(e)[:100])
        # Einstellungen mit allen Reitern
        try:
            pg.click("#kopf-einstellungen"); pg.wait_for_timeout(900); sammeln("Einstellungen")
            n = pg.locator(".dialog .reiter__knopf").count()
            for i in range(n):
                pg.locator(".dialog .reiter__knopf").nth(i).click(); pg.wait_for_timeout(700); sammeln("Einstellungen Reiter %d" % i)
            pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        except Exception as e: print("Einstellungen:", str(e)[:100])
        # Pad Mode
        try:
            pg.evaluate("location.hash='#/dashboard'"); pg.wait_for_timeout(900)
            pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
            sammeln("Pad Start")
            for wo in pg.locator("#pad [data-padwo]").all()[1:3]:
                pass
            if pg.locator("#pad [data-padwo='qs']").count():
                pg.click("#pad [data-padwo='qs']"); pg.wait_for_timeout(1000); sammeln("Pad QS"); pg.locator("#pad [data-padzurueck]").first.click(); pg.wait_for_timeout(500)
            pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
            pg.locator("#pad [data-park]").first.click(); pg.wait_for_timeout(800)
            if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
            sammeln("Pad Maschinen")
            pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click(); pg.wait_for_timeout(1500)
            sammeln("Pad Maschine")
        except Exception as e: print("Pad:", str(e)[:100])
        pg.close()
    br.close()
# pad-ak__nr: weisse Schrift mit schwarzem Rand auf der Werkstofffarbe (gewollt)
# dg-wert--innen: weiss auf der farbigen Säule; dg-x steht unter der Säule (Messfehler)
GEWOLLT = ("pad-ak__nr", "dg-wert dg-wert--innen", "dg-x")
for (name, cls), (wo, k, t) in sorted(gefunden.items()):
    print(f"     {name:6} {k:5} {wo:22} {cls[:80]} | {t}")
    if not any(g in cls for g in GEWOLLT): pruefe(f"{name}: lesbar {cls[:60]} ({wo})", False)
pruefe("Seiten durchsucht", True)
print("Fehler:", "keine" if not fehler else fehler[:20])
