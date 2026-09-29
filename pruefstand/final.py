import time
from pruefstand import server_starten, FAKE, CH, PORT, BILDER
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for mob,w,h,name in [(False,1600,1000,"desktop"),(True,390,844,"handy")]:
        pg = br.new_context(viewport={"width":w,"height":h}, is_mobile=mob, has_touch=mob).new_page()
        f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:120]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
            content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
                  "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
        pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(800)
        if not mob:
            print("Zweite Zeile je Zustand:")
            for r in pg.evaluate("""() => {
              const m={geplant:'○',ruesten:'🔧',laeuft:'▶',fertig:'✔'};
              const out={};
              document.querySelectorAll('.pw-balken').forEach(b=>{
                const s=(b.querySelector('.pw-balken__statusgross')||{}).title||'?';
                const z=(b.querySelector('.pw-zeile2')||{}).textContent||'(leer)';
                if(!out[s]) out[s]=z;
              });
              return Object.entries(out).map(([k,v])=>k+': '+v); }"""): print("   ", r)
        m = pg.evaluate("""() => {
          const z=[...document.querySelectorAll('.pw-zeile')].filter(x=>x.querySelector('.pw-spuren:not(.pw-spuren--fein)'));
          const u=[]; document.querySelectorAll('.pw-spuren:not(.pw-spuren--fein)').forEach(sp=>{
            const bs=[...sp.querySelectorAll('.pw-balken')].map(b=>({v:+b.dataset.von,d:+b.dataset.dauer}));
            bs.sort((a,c)=>a.v-c.v);
            for(let i=1;i<bs.length;i++) if(bs[i].v<bs[i-1].v+bs[i-1].d) u.push(1);});
          const b=document.querySelector('.pw-balken');
          return {zeile:z[0]?Math.round(z[0].getBoundingClientRect().height):0,
            maschinen:z.length, ueber:u.length,
            zeilen3:document.querySelectorAll('.pw-zeile3:not([style*="none"])').length,
            monat:!!document.querySelector('.pw-monat'),
            tag:(document.querySelector('.pw-tag')||{}).textContent};
        }""")
        print(f"[{name}] {m} | Fehler: {f[:2] if f else 'keine'}")
        pg.screenshot(path=f"{BILDER}/ende-{name}.png")
    br.close()
