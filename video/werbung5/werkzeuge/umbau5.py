# Einmaliger Umbau der Vorlage von Fassung 4 auf Fassung 5:
# GL nur mit Namen (Patrick als Inhaber), eine einzige Maschine mit Herstellern, Werkstoffen und 42 mm,
# alles ab dem Stillstand rückt um 6.1 s nach hinten (eigene Zeitleiste tl2, so bleiben die alten Zeiten lesbar).
import re
P = "werkzeuge/vorlage.html.txt"
s = open(P, encoding="utf-8").read()
VERSATZ = 6.1

# ---------- HTML: B, C, D ersetzen ----------
a = s.index("        <!-- B Geschäftsleitung -->"); b = s.index("        <!-- E Stillstand -->")
neu_html = '''        <!-- B Inhaber und Geschäftsleitung -->
        <div id="sB" class="clip" data-start="7.7" data-duration="7.8" data-track-index="1">
          <div id="t-kick" class="zentriert kick">Hofer + Co</div>
          <div id="t-titel1" class="zentriert mega t-titel">Inhaber</div>
          <div id="t-titel2" class="zentriert mega t-titel">Geschäftsleitung</div>
<!--TEAM-->
        </div>

        <!-- C Eine Maschine: Hersteller, Werkstoffe, 42 mm -->
        <div id="sC" class="clip" data-start="15.5" data-duration="14.5" data-track-index="1">
          <div id="halle">
            <div id="h-wand"></div><div id="h-boden"></div><div id="h-boden-linien"></div>
            <div class="h-kegel" style="left: 360px"></div><div class="h-kegel" style="left: 960px"></div><div class="h-kegel" style="left: 1560px"></div>
            <div class="h-lampe" style="left: 340px"></div><div class="h-lampe" style="left: 830px"></div><div class="h-lampe" style="left: 1330px"></div>
<!--MASCHINE-->
          </div>
          <div id="h-lader-info">Stangenlader</div>
          <div id="c-text"><div class="kick">Unser Maschinenpark</div><b>CNC-Drehmaschinen<br>mit Stangenlader</b></div>
          <div id="c-hersteller"><div class="kick">Hersteller</div>
<!--SCHILDER-->
          </div>
          <div id="c-mat"><div class="kick">Werkstoffe</div>
<!--WERKSTOFFE-->
          </div>
          <div id="c-mm">
            <svg id="c-kreis" viewBox="0 0 680 680">
              <defs><pattern id="d-schraff" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="18" stroke="rgba(107,164,255,.35)" stroke-width="4" /></pattern></defs>
              <circle id="d-ring1" cx="340" cy="340" r="320" fill="none" stroke="rgba(107,164,255,.3)" stroke-width="4" stroke-dasharray="10 18" />
              <circle id="d-stange" cx="340" cy="340" r="270" fill="url(#d-schraff)" stroke="#eaf1fb" stroke-width="10" />
              <g id="d-mass">
                <line x1="70" y1="340" x2="610" y2="340" stroke="#f0b429" stroke-width="10" />
                <polygon points="70,340 110,318 110,362" fill="#f0b429" /><polygon points="610,340 570,318 570,362" fill="#f0b429" />
                <text x="340" y="310" text-anchor="middle" fill="#f0b429" font-family="Inter" font-weight="900" font-size="88">Ø 42</text>
              </g>
            </svg>
            <div id="c-zahl" class="mega">bis <span id="d-n">0</span><small>mm</small></div>
            <div id="c-sub">Stangendurchmesser</div>
          </div>
        </div>

'''
s = s[:a] + neu_html + s[b:]

# ---------- CSS ----------
css = '''
      /* Fassung 5: Team, eine Maschine */
      .t-titel { top: 90px; font-size: 92px; }
      .t-karte.inhaber { box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 3px #6ba4ff; }
      #c-ma { position: absolute; }
      #c-ma svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
      #c-text { position: absolute; left: 110px; top: 70px; }
      #c-text b { display: block; margin-top: 14px; font-size: 64px; font-weight: 850; letter-spacing: -0.03em; line-height: 1.02; }
      #c-hersteller, #c-mat { position: absolute; left: 1130px; top: 120px; width: 720px; }
      #c-hersteller .kick, #c-mat .kick { margin-bottom: 22px; }
      .c-schild { position: relative; height: 104px; margin-bottom: 22px; padding: 0 34px; border-radius: 18px; display: inline-flex; align-items: center;
        font-size: 54px; font-weight: 900; letter-spacing: .04em; color: #fff; white-space: nowrap; box-shadow: 0 20px 50px rgba(0,0,0,.45); }
      .c-schild small { font-size: 24px; font-weight: 900; margin-left: 18px; padding: 6px 12px; border-radius: 8px; background: #fff; color: #0b1424; letter-spacing: .05em; }
      .c-zeile { display: block; }
      #c-mat .c-w { display: inline-flex; align-items: center; gap: 16px; height: 84px; padding: 0 30px 0 22px; margin: 0 14px 16px 0; border-radius: 42px;
        background: rgba(17,29,49,.95); border: 2px solid rgba(107,164,255,.3); font-size: 40px; font-weight: 800; white-space: nowrap; }
      #c-mat .c-w i { display: block; width: 40px; height: 40px; border-radius: 50%; box-shadow: inset 0 0 0 3px rgba(255,255,255,.25); }
      #c-mm { position: absolute; left: 1130px; top: 560px; width: 760px; height: 330px; }
      #c-kreis { position: absolute; left: 0; top: 0; width: 300px; height: 300px; }
      #c-zahl { position: absolute; left: 330px; top: 30px; font-size: 150px; white-space: nowrap; }
      #c-zahl small { font-size: 70px; font-weight: 700; color: #6ba4ff; margin-left: 12px; }
      #c-sub { position: absolute; left: 338px; top: 222px; font-size: 38px; font-weight: 700; color: #8b9db8; white-space: nowrap; }
      #h-lader-info { top: 470px; }
      /* Tablet im Seitenverhältnis der Aufnahme, damit nichts abgeschnitten wird */
      #g-pad { height: 809px; top: 160px; }
      /* iPhone: Statuszeile oben, die App beginnt darunter */
      .ip-status { position: absolute; left: 0; right: 0; top: 0; height: 54px; background: #fff; color: #0b1424; font: 700 22px Inter, sans-serif;
        display: flex; align-items: center; justify-content: space-between; padding: 8px 46px 0 52px; box-sizing: border-box; }
      .ip-status span { display: flex; gap: 6px; align-items: flex-end; }
      .ip-status span i { display: block; width: 5px; background: #0b1424; border-radius: 2px; }
      .ip-status span em { display: block; width: 34px; height: 16px; margin-left: 8px; border-radius: 5px; border: 2px solid #0b1424; box-sizing: border-box; padding: 2px; }
      .ip-status span em::before { content: ""; display: block; width: 80%; height: 100%; background: #0b1424; border-radius: 2px; }
'''
i = s.index("    </style>")
s = s[:i] + css + s[i:]

# ---------- JS: B, C, D ersetzen ----------
a = s.index("      // ---- B Geschäftsleitung"); b = s.index("      // ---- E Stillstand")
neu_js = '''      // ---- B Inhaber und Geschäftsleitung (7.7 – 15.5) ----
      wisch(7.7);
      F("#t-kick", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.3, ease: E }, 7.8);
      knall("#t-titel1", 7.85, 0.35);
      // Erst steht Patrick gross in der Mitte, dann rückt er an seinen Platz und die GL kommt dazu
      F("#t-inhaber", { opacity: 0, x: @@INH_X@@, y: 400, scale: 1.25, rotationY: -50, transformPerspective: 1600 }, { opacity: 1, x: @@INH_X@@, y: 0, scale: 1.25, rotationY: 0, duration: 0.55, ease: E }, 8.0);
      F("#t-inhaber .t-foto img", { scale: 1.35 }, { scale: 1.05, duration: 7, ease: "power2.out" }, 8.0);
      F("#t-inhaber em", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.3, ease: E }, 8.8);
      F("#t-inhaber", { y: 0 }, { y: -16, duration: 0.15, yoyo: true, repeat: 1, ease: "power1.inOut", ...nicht }, 8.85);
      O("#t-titel1", { opacity: 0, y: -40, filter: "blur(10px)", duration: 0.22, ease: "power2.in" }, 9.45);
      knall("#t-titel2", 9.65, 0.35);
      O("#t-inhaber", { x: 0, scale: 1, duration: 0.6, ease: EI }, 9.6);
      [11.0, 12.0, 12.8, 13.8].forEach((t, i) => {
        F("#t-gl" + i, { opacity: 0, y: 500, rotationY: -60, transformPerspective: 1600 }, { opacity: 1, y: 0, rotationY: 0, duration: 0.45, ease: E }, t - 0.15);
        F("#t-gl" + i + " .t-foto img", { scale: 1.35 }, { scale: 1.05, duration: 3, ease: "power2.out" }, t - 0.15);
        blitz(t, 0.18);
      });
      F(".t-karte", { y: 0 }, { y: -14, duration: 0.15, yoyo: true, repeat: 1, ease: "power1.inOut", stagger: 0.07, ...nicht }, 14.5);
      O(".t-karte, #t-titel2, #t-kick", { opacity: 0, y: -60, filter: "blur(10px)", duration: 0.25, ease: "power2.in", stagger: 0.03 }, 15.15);

      // ---- C Eine Maschine (15.5 – 30.0) ----
      wisch(15.5);
      F("#halle", { scale: 1.12, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: E }, 15.52);
      O("#halle", { scale: 1.05, duration: 14, ease: "none" }, 16.0);
      F(".h-lampe, .h-kegel", { opacity: 0 }, { opacity: 1, duration: 0.08, stagger: 0.12, yoyo: true, repeat: 1, ...nicht }, 15.6);
      F("#c-ma", { y: 320, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: "back.out(1.5)" }, 15.65);
      F(".h-lader", { x: -600, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: E }, 16.0);
      F("#c-text > *", { x: -100, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: E, stagger: 0.1 }, 15.75);
      // Die Maschine arbeitet: Werkzeugbahn, Funke, grüne Lampe
      F("#c-ma .bahn", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.6, ease: "power1.inOut", repeat: 7, ...nicht }, 16.3);
      F("#c-ma .funke", { scale: 0.5 }, { scale: 1.4, duration: 0.09, yoyo: true, repeat: 140, ease: "none", transformOrigin: "50% 50%", svgOrigin: "0 0", ...nicht }, 16.3);
      F("#c-ma .lampe", { opacity: 0.25 }, { opacity: 1, duration: 0.2 }, 16.3);
      F("#h-lader-info", { opacity: 0, y: 30, scale: 0.6 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(2)" }, 17.7);
      F(".h-lader i", { filter: "brightness(1)" }, { filter: "brightness(1.6)", duration: 0.15, yoyo: true, repeat: 3, ...nicht }, 17.7);
      O("#h-lader-info", { opacity: 0, duration: 0.2 }, 22.5);
      F("#c-hersteller .kick", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.3, ease: E }, 18.5);
      const SCH = @@SCHILDER_JS@@;
      SCH.forEach(([k, t]) => {
        blitz(t, 0.25); wackeln(t, 8);
        knall("#hs-" + k, t, 0.32);
        F("#c-ma", { filter: "brightness(1)" }, { filter: "brightness(1.35)", duration: 0.16, yoyo: true, repeat: 1, ease: "power1.inOut", ...nicht }, t + 0.05);
      });
      F("#hs-wm small", { scale: 0, rotation: -30 }, { scale: 1, rotation: -6, duration: 0.3, ease: "back.out(3)" }, 22.0);
      O("#c-hersteller > *", { x: 500, opacity: 0, duration: 0.3, ease: "power3.in", stagger: 0.05 }, 22.45);
      // Werkstoffe kommen, wenn sie genannt werden
      F("#c-mat .kick", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.3, ease: E }, 22.8);
      @@WERKSTOFF_JS@@
      // bis 42 mm
      blitz(27.25, 0.35); wackeln(27.25, 10);
      F("#c-kreis", { scale: 0.2, rotation: -180, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.55, ease: E }, 27.2);
      F("#d-ring1", { rotation: 0, svgOrigin: "340 340" }, { rotation: 120, svgOrigin: "340 340", duration: 2.8, ease: "none" }, 27.2);
      F("#d-stange", { attr: { r: 40 } }, { attr: { r: 270 }, duration: 1.2, ease: "power3.out" }, 27.3);
      F("#d-mass", { opacity: 0, scaleX: 0, svgOrigin: "340 340" }, { opacity: 1, scaleX: 1, svgOrigin: "340 340", duration: 0.45, ease: E }, 28.2);
      F("#c-zahl", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.3, ease: E }, 27.25);
      zaehlen("d-n", 0, 42, 27.3, 1.1);
      F("#c-zahl", { scale: 1 }, { scale: 1.1, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out", transformOrigin: "0% 50%", ...nicht }, 28.4);
      F("#c-sub", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.35, ease: E }, 28.5);
      O("#halle, #c-text, #c-mat, #c-mm", { opacity: 0, filter: "blur(12px)", duration: 0.25, ease: "power2.in" }, 29.75);

      // Ab hier alles wie in Fassung 4, auf einer eigenen Zeitleiste 6.1 s später
      const tl2 = gsap.timeline();
      tl.add(tl2, @@VERSATZ@@);
      Z = tl2;

'''.replace("@@VERSATZ@@", str(VERSATZ))
s = s[:a] + neu_js + s[b:]

# Hilfsfunktionen über eine umschaltbare Zeitleiste Z
s = s.replace("      const F = (s, a, b, t) => tl.fromTo(s, a, b, t);\n      const O = (s, b, t) => tl.to(s, b, t);",
              "      let Z = tl;\n      const F = (s, a, b, t) => Z.fromTo(s, a, b, t);\n      const O = (s, b, t) => Z.to(s, b, t);")
s = s.replace('tl.to("#stage", { x, y, duration: 0.035, ease: "none" }, t + i * 0.035)', 'Z.to("#stage", { x, y, duration: 0.035, ease: "none" }, t + i * 0.035)')
s = s.replace("tl.to([b, w], { opacity: 0, duration: 0.1 }", "Z.to([b, w], { opacity: 0, duration: 0.1 }")
assert "let Z = tl" in s

# ---------- Zeiten im HTML ab dem Stillstand verschieben, Gesamtlänge ----------
kopf, rest = s.split("        <!-- E Stillstand -->", 1)
html, js = rest.split("    <script>", 1)
html = re.sub(r'data-start="([\d.]+)"', lambda m: f'data-start="{float(m.group(1)) + VERSATZ:.1f}"' if float(m.group(1)) >= 23.9 else m.group(0), html)
s = kopf + "        <!-- E Stillstand -->" + html + "    <script>" + js
s = s.replace('data-duration="76.5"', 'data-duration="82.6"').replace("const ENDE = 76.5;", "const ENDE = 82.6;")
open(P, "w", encoding="utf-8").write(s)
print("ok", s.count('data-duration="82.6"'))
