# Nimmt Abläufe in der App mit Testdaten als Video auf, mit sichtbarem Zeiger
import sys, time, os, glob, shutil
sys.path.insert(0, "/home/claude/hofertool/pruefstand")
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
AUS = "/tmp/claude-0/hf/rec5"
ZEIGER = """
(() => { const los = () => {
  if (document.getElementById('__z')) return;
  const s = document.createElement('style');
  s.textContent = `#__z{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transition:transform .05s linear}
  #__z.pfeil{width:26px;height:26px;background:no-repeat url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M3 2l7 19 2.6-7.4L20 11z' fill='white' stroke='black' stroke-width='1.6' stroke-linejoin='round'/></svg>")}
  #__z.finger{width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.35);border:3px solid rgba(255,255,255,.9);box-shadow:0 0 0 2px rgba(0,0,0,.25)}
  .__r{position:fixed;z-index:2147483646;pointer-events:none;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:3px solid #6ba4ff;animation:__r .6s ease-out forwards}
  @keyframes __r{to{transform:scale(4);opacity:0}}`;
  document.head.appendChild(s);
  const z = document.createElement('div'); z.id='__z'; z.className = window.__ZEIGER || 'pfeil';
  document.body.appendChild(z);
  addEventListener('mousemove', e => { z.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
  addEventListener('mousedown', e => { const r = document.createElement('div'); r.className='__r';
    r.style.left=e.clientX+'px'; r.style.top=e.clientY+'px'; document.body.appendChild(r); setTimeout(()=>r.remove(),700);
    if (z.className==='finger') z.style.background='rgba(107,164,255,.6)'; }, true);
  addEventListener('mouseup', () => { if (z.className==='finger') z.style.background='rgba(255,255,255,.35)'; }, true);
}; if (document.readyState === 'loading') addEventListener('DOMContentLoaded', los); else los(); })();
"""
server_starten(); time.sleep(0.4)

def kontext(br, name, b, h, dpr, art, mobil=False, dunkel=False):
    ctx = br.new_context(viewport={"width": b, "height": h}, device_scale_factor=dpr, is_mobile=mobil,
                         record_video_dir=f"{AUS}/roh_{name}", record_video_size={"width": b*dpr, "height": h*dpr})
    ctx.add_init_script(f"window.__ZEIGER='{art}';" + ZEIGER)
    pg = ctx.new_page()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    if dunkel: pg.evaluate("document.body.classList.add('dunkel')")
    return ctx, pg

pos = {"x": 800, "y": 450}
def hin(pg, x, y, dauer=0.5):
    n = max(8, int(dauer * 40))
    pg.mouse.move(x, y, steps=n); pos.update(x=x, y=y)
def mitte(el):
    b = el.bounding_box(); return b["x"] + b["width"]/2, b["y"] + b["height"]/2
def tipp(pg, sel_or_el, warte=350):
    el = pg.locator(sel_or_el).first if isinstance(sel_or_el, str) else sel_or_el
    x, y = mitte(el); hin(pg, x, y, 0.45); pg.wait_for_timeout(120)
    pg.mouse.down(); pg.wait_for_timeout(90); pg.mouse.up(); pg.wait_for_timeout(warte)

def fertig(ctx, pg, name):
    v = pg.video.path(); ctx.close(); shutil.move(v, f"{AUS}/{name}.webm"); shutil.rmtree(f"{AUS}/roh_{name}", ignore_errors=True)

import subprocess
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx, pg = kontext(br, "best", 1600, 900, 1, "pfeil")
    pg.evaluate("location.hash='#/bestellungen'"); pg.wait_for_timeout(1800)
    pg.mouse.move(900, 600); pg.wait_for_timeout(300)
    t0 = time.time()
    tipp(pg, "text=+ Neue Position", 600)
    for z in "Wende": pg.keyboard.type(z); pg.wait_for_timeout(110)
    pg.wait_for_timeout(500)
    tipp(pg, ".dialog-huelle >> text=MTEC-452410", 600)
    tipp(pg, "#pd-menge", 150); pg.keyboard.press("Control+a"); 
    for z in "50": pg.keyboard.type(z); pg.wait_for_timeout(140)
    pg.wait_for_timeout(300)
    tipp(pg, "#pd-ja", 900)
    t1 = time.time()
    tipp(pg, "[data-bstatus]", 600)
    tipp(pg, ".dialog-huelle button:has-text('Bestellt')", 500)
    tipp(pg, "button:has-text('Ja, ändern')", 700)
    tipp(pg, "[data-best] >> text=Bestellt", 900)
    t2 = time.time()
    with ctx.expect_page() as neu:
        tipp(pg, "[data-bestellpdf]", 200)
    t3 = time.time()
    open(f"{AUS}/best_zeiten.txt", "w").write(f"{t1-t0} {t2-t0} {t3-t0}")
    p2 = neu.value
    p2.add_init_script(ZEIGER)
    p2.wait_for_timeout(1200)
    p2.evaluate("window.__ZEIGER='pfeil';" + ZEIGER)
    p2.mouse.move(800, 600); p2.wait_for_timeout(300)
    p2.mouse.move(1400, 28, steps=25); p2.wait_for_timeout(500)
    p2.mouse.down(); p2.wait_for_timeout(90); p2.mouse.up(); p2.wait_for_timeout(1500)
    v1 = pg.video.path(); v2 = p2.video.path()
    ctx.close()
    shutil.move(v1, f"{AUS}/best1.webm"); shutil.move(v2, f"{AUS}/best2.webm")
    br.close()
