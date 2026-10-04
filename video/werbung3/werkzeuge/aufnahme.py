# Nimmt Abläufe in der App mit Testdaten als Video auf, mit sichtbarem Zeiger
import sys, time, os, glob, shutil
sys.path.insert(0, "/home/claude/hofertool/pruefstand")
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
AUS = "/tmp/claude-0/hf/rec"
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

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    welche = sys.argv[1:] or ["planwand", "suche", "pad", "handy"]

    if "planwand" in welche:
        ctx, pg = kontext(br, "planwand", 1600, 900, 1, "pfeil")
        pg.evaluate("location.hash='#/planwand'"); pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(5500)
        pg.mouse.move(1300, 700)
        pg.evaluate("window.__T0 = performance.now()")
        sp = pg.query_selector_all(".pw-spuren:not(.pw-spuren--fein)")
        balken = sp[1].query_selector_all(".pw-balken")[-1]
        ziel = sp[4].query_selector_all(".pw-zelle")[9]
        bx, by = mitte(balken); zx, zy = mitte(ziel)
        hin(pg, bx, by, 0.8); pg.wait_for_timeout(250)
        pg.mouse.down(); pg.wait_for_timeout(120)
        pg.mouse.move(zx, zy, steps=45); pg.wait_for_timeout(300)
        pg.mouse.up(); pg.wait_for_timeout(250)
        hin(pg, 1250, 870, 0.6); pg.wait_for_timeout(700)
        if pg.locator("[data-ja]").count(): tipp(pg, "[data-ja]", 1600)
        pg.wait_for_timeout(1200)
        fertig(ctx, pg, "planwand")

    if "suche" in welche:
        ctx, pg = kontext(br, "suche", 1600, 900, 1, "pfeil")
        pg.evaluate("location.hash='#/planwand'"); pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(5500)
        pg.mouse.move(1200, 600)
        pg.wait_for_timeout(400)
        pg.keyboard.press("Control+k"); pg.wait_for_timeout(500)
        for t in "10007": pg.keyboard.type(t); pg.wait_for_timeout(160)
        pg.wait_for_timeout(700)
        pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(300)
        pg.keyboard.press("Enter"); pg.wait_for_timeout(2200)
        fertig(ctx, pg, "suche")

    if "pad" in welche:
        ctx, pg = kontext(br, "pad", 1280, 860, 1, "finger")
        pg.mouse.move(640, 600); pg.wait_for_timeout(300)
        tipp(pg, "button:has-text('Pad Mode')", 900)
        tipp(pg, "#pad [data-padwo='parks']", 800)
        tipp(pg, "#pad [data-park]", 800)
        if pg.locator("#pad [data-padtyp]").count(): tipp(pg, "#pad [data-padtyp]", 800)
        tipp(pg, pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first, 1100)
        tipp(pg, "#pad [data-padfeld='stand']", 700)
        if pg.locator("[data-zb='C']").count(): tipp(pg, "[data-zb='C']", 150)
        for t in "4321": tipp(pg, f"[data-zb='{t}']", 120)
        pg.wait_for_timeout(300)
        tipp(pg, "[data-zbja]", 1800)
        fertig(ctx, pg, "pad")

    if "handy" in welche:
        ctx, pg = kontext(br, "handy", 390, 844, 2, "finger", mobil=True)
        pg.mouse.move(200, 600); pg.wait_for_timeout(1500)
        pg.screenshot(path=f"{AUS}/handy_start.png")
        for _ in range(8): pg.mouse.wheel(0, 110); pg.wait_for_timeout(90)
        pg.wait_for_timeout(500)
        for _ in range(8): pg.mouse.wheel(0, -110); pg.wait_for_timeout(70)
        pg.wait_for_timeout(400)
        if pg.locator("#nav-klapp").is_visible(): tipp(pg, "#nav-klapp", 700)
        pg.screenshot(path=f"{AUS}/handy_menue.png")
        if pg.locator("[data-nav='produktion']").is_visible(): tipp(pg, "[data-nav='produktion']", 1500)
        else: pg.evaluate("location.hash='#/produktion'"); pg.wait_for_timeout(1500)
        pg.screenshot(path=f"{AUS}/handy_prod.png")
        for _ in range(6): pg.mouse.wheel(0, 120); pg.wait_for_timeout(100)
        pg.wait_for_timeout(900)
        fertig(ctx, pg, "handy")
    br.close()
