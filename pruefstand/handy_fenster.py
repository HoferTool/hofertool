# Fenster am Handy (1.864.1, Patrick 26. November 2026: "Auf dem Handy sehe
# ich nur einen Teil der Fenster und kann nicht verschieben oder scrollen
# oder zoomen"): Fenster passen in den Bildschirm, Inhalt rollt mit dem Finger.
import time, os, sys
sys.argv = sys.argv[:1]
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
SAAT = """
TEST.daten.erp_partner = [
  { id: 'k1', art: 'kunde', nr: '10001', name: 'Muster AG', aktiv: true, daten: { adresse: { strasse: 'Weg 1', plz: '4573', ort: 'Lohn' } } },
  { id: 'l1', art: 'lieferant', nr: '70001', name: 'Stahl AG', aktiv: true, daten: {} } ];
TEST.daten.erp_bedingungen = [];
TEST.daten.erp_lager = [{ id: 'lg1', lagerart: 'RM', platz: 'A1', bezeichnung: 'Regal A' }];
TEST.daten.erp_artikel = [
  { id: 'a1', art: 'hofer', nr: '10007-0589', idx: 'B', bezeichnung: 'Bolzen', einheit: 'Stk', preis: 1.5, aktiv: true,
    arbeitsplan: [{ pos: 10, bez: 'Drehen', maschine: '124' }, { pos: 20, bez: 'Waschen', maschine: '' }], daten: {} },
  { id: 'a0', art: 'hofer', nr: '10007-0589', idx: 'A', bezeichnung: 'Bolzen', einheit: 'Stk', aktiv: true, arbeitsplan: [], daten: {} },
  { id: 'r1', art: 'rohmaterial', nr: 'X8CrNiS18-9 rd 12', idx: '', bezeichnung: null, einheit: 'kg', aktiv: true, arbeitsplan: [], daten: {} } ];
TEST.daten.erp_belege = []; TEST.daten.erp_positionen = [];
TEST.daten.erp_bewegungen = [{ id: 'bw0', artikel_id: 'a0', charge: 'ALT-A', lager_id: 'lg1', menge: 500, art: 'korrektur', am: '2026-11-01T08:00:00Z' }];
TEST.daten.kalkulationen = [{ id: 'kk1', nr: 'K-1', kunde: 'Muster AG', artikel: '10007-0590',
  daten: { kopf: { artikel: '10007-0590', index: 'C', bezeichnung: 'Hülse', kunde: 'Muster AG' }, ags: [],
    material: { bez: 'X8CrNiS18-9 rd 12' }, preis: { pe: '1000', waehrung: 'CHF', rundung: '0.01' },
    staffeln: [{ menge: '5000', lose: '1', angebot: '200' }, { menge: '1000', lose: '1', angebot: '250' }] } },
  { id: 'kk2', nr: 'K-2', kunde: 'Muster AG', artikel: '10007-0591',
    daten: { kopf: { artikel: '10007-0591', index: '', bezeichnung: 'Stift', kunde: 'Muster AG' }, ags: [],
      material: { bez: 'CuZn39Pb3 rd 8' }, staffeln: [{ menge: '100', lose: '1', angebot: '3.5' }] } }];
TEST.daten.kalk_maschinen = [];
TEST.erpAlle = true;
"""

server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def messen(pg, sel, name):
    r = pg.evaluate("""(sel) => { const d = document.querySelector(sel); if (!d) return null;
      const b = d.getBoundingClientRect(); const fl = [...d.querySelectorAll('*')].concat([d])
        .filter(e => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2; });
      return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: innerWidth, h: innerHeight,
        rollt: fl.length, sw: document.documentElement.scrollWidth }; }""", sel)
    print(name, r)
    if not r: pruefe(False, name + " offen"); return
    pruefe(r["l"] >= -1 and r["r"] <= r["w"] + 1, name + ": ganz in der Breite")
    pruefe(r["t"] >= -1 and r["b"] <= r["h"] + 1, name + ": ganz in der Höhe")
    return r

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=1)
    pg = ctx.new_page()
    body = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { erpSehen: true, kalkulationSehen: true };\n" + SAAT
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/erp", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.evaluate("location.hash='#/erp'"); pg.wait_for_timeout(800)
    pg.click("[data-erp-reiter='stamm']") if pg.locator("[data-erp-reiter='stamm']").count() else None
    pg.wait_for_timeout(400)
    pg.click("[data-erp-stamm='artikel']"); pg.wait_for_timeout(400)
    pg.click("[data-erp-zeile='a1']"); pg.wait_for_timeout(900)
    pg.screenshot(path="/tmp/handy-artikel.png")
    r = messen(pg, ".dialog.erp-fenster.gf", "Artikelfenster")
    if r: pruefe(r["rollt"] >= 1, "Artikelfenster: ein Bereich rollt")
    # Finger wischt im Inhalt
    st = pg.evaluate("() => { const i = document.querySelector('.gf-inhalt'); return i ? getComputedStyle(i).touchAction : '' }")
    pruefe(st in ("auto", "pan-y", "pan-x pan-y", "manipulation"), "Inhalt lässt Wischen zu (%s)" % st)
    # Ganzes Fenster rollt mit dem Finger, Fuss bleibt sichtbar
    rs = pg.evaluate("""() => { const d = document.querySelector('.dialog.erp-fenster.gf'); const f = d.querySelector('.gf-fuss').getBoundingClientRect();
      const vor = d.scrollTop; d.scrollTop = 300; return { kann: d.scrollHeight > d.clientHeight, gerollt: d.scrollTop > vor, fuss: f.bottom <= innerHeight + 1 }; }""")
    pruefe(rs["kann"] and rs["gerollt"], "ganzes Fenster rollt")
    pruefe(rs["fuss"], "Knöpfe unten sichtbar")
    w = pg.evaluate("() => [...document.querySelectorAll('.gf-kopf input:not([type=checkbox]), .gf-kopf select')].map(e => e.getBoundingClientRect().width).filter(x => x > 0)")
    pruefe(w and min(w) > 150, "Kopffelder breit genug (%s)" % (min(w) if w else "-"))
    pg.screenshot(path="/tmp/handy-artikel-2.png")
    pg.click(".dialog.erp-fenster.gf .gf-zu") if pg.locator(".gf-zu").count() else pg.keyboard.press("Escape")
    pg.wait_for_timeout(400)
    # Kleineres Fenster: Ziehen am Titel mit dem Finger
    pg.evaluate("() => window.__hoferNachfragenTest = 1")
    pg.evaluate("""() => { const h = document.createElement('div'); h.className = 'dialog-huelle'; h.innerHTML = '<div class="dialog"><h2>Probe</h2><p>Text</p></div>'; document.body.appendChild(h); }""")
    pg.wait_for_timeout(300)
    t = pg.locator("body > .dialog-huelle .dialog h2").last
    tb = t.bounding_box(); vor = pg.locator("body > .dialog-huelle .dialog").last.bounding_box()
    pg.evaluate("""([x,y]) => { const el = document.elementFromPoint(x,y);
      const ev = (typ, x, y) => el.dispatchEvent(new PointerEvent(typ, {bubbles:true, pointerType:'touch', pointerId:5, isPrimary:true, button: 0, clientX:x, clientY:y}));
      ev('pointerdown', x, y); for (let i=1;i<=10;i++) document.dispatchEvent(new PointerEvent('pointermove', {bubbles:true, pointerType:'touch', pointerId:5, isPrimary:true, clientX:x, clientY:y-i*10}));
      document.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerType:'touch', pointerId:5, isPrimary:true, clientX:x, clientY:y-100})); }""", [tb["x"] + 60, tb["y"] + tb["height"]/2])
    pg.wait_for_timeout(300)
    nach = pg.locator("body > .dialog-huelle .dialog").last.bounding_box()
    pruefe(abs(nach["y"] - vor["y"]) > 30, "Fenster mit dem Finger verschoben (%d → %d)" % (vor["y"], nach["y"]))
    pg.screenshot(path="/tmp/handy-gezogen.png")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
