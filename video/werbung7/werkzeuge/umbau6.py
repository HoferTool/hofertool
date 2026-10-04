# Einmaliger Umbau der Vorlage von Fassung 5 auf Fassung 6 (englische Stimme, deutsche Texte):
# Szenen ab dem Stillstand bekommen neue Zeiten über die Abbildung M6 (Fassung-5-Zeit -> Fassung-6-Zeit),
# Bestellungen werden mit einer echten Aufnahme neu gebaut, "Weitere" zeigt nur noch die Sammelanzeige.
import re, json
P = "werkzeuge/vorlage.html.txt"
s = open(P, encoding="utf-8").read()
def ers(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:80]); s = s.replace(a, b)

# (Anfang, Ende) in Fassung-5-Zeit -> (Anfang, Ende) in Fassung-6-Zeit; N und O sind neu gebaut und fehlen hier
ZEITEN = [[30.0, 32.5, 27.0, 29.8], [32.5, 36.4, 29.8, 33.7], [36.4, 40.3, 33.7, 37.6], [40.3, 42.6, 37.6, 39.9],
          [42.6, 47.2, 39.9, 44.5], [47.2, 52.0, 44.5, 49.3], [52.0, 55.3, 49.3, 52.6], [55.3, 59.6, 52.6, 56.9],
          [59.6, 62.1, 56.9, 59.4], [72.3, 77.2, 73.6, 78.5], [77.2, 82.6, 78.5, 83.9]]
json.dump(ZEITEN, open("werkzeuge/zeiten6.json", "w"))
def M6(t):
    for a, b, c, d in ZEITEN:
        if a - 1e-6 <= t <= b + 1e-6: return c + (t - a) * (d - c) / (b - a)
    # zwischen den Abschnitten (z. B. ein Wisch kurz vor dem Schnitt): Versatz des nächsten Abschnitts
    for a, b, c, d in ZEITEN:
        if t < a: return t + (c - a)
    return t + (ZEITEN[-1][3] - ZEITEN[-1][1])

# ---------- Zeitabbildung im Skript ----------
ers("      const F = (s, a, b, t) => Z.fromTo(s, a, b, t);\n      const O = (s, b, t) => Z.to(s, b, t);",
    """      // Fassung 6: ab dem Stillstand werden die alten Zeiten über M6 auf die neue Länge der englischen Stimme abgebildet
      const ZEITEN = @@ZEITEN@@;
      const M6 = (t) => {
        for (const [a, b, c, d] of ZEITEN) if (t >= a - 1e-6 && t <= b + 1e-6) return c + (t - a) * (d - c) / (b - a);
        for (const [a, b, c, d] of ZEITEN) if (t < a) return t + (c - a);
        const z = ZEITEN[ZEITEN.length - 1]; return t + (z[3] - z[1]);
      };
      let ZT = (t) => t;
      const F = (s, a, b, t) => Z.fromTo(s, a, b, ZT(t));
      const O = (s, b, t) => Z.to(s, b, ZT(t));""")
ers('Z.to("#stage", { x, y, duration: 0.035, ease: "none" }, t + i * 0.035)', 'Z.to("#stage", { x, y, duration: 0.035, ease: "none" }, ZT(t) + i * 0.035)')
ers("""      // Ab hier alles wie in Fassung 4, auf einer eigenen Zeitleiste 6.1 s später
      const tl2 = gsap.timeline();
      tl.add(tl2, 6.1);
      Z = tl2;""", """      // Ab hier stehen die Zeiten von Fassung 4 im Skript: +6.1 ergibt Fassung 5, M6 dann Fassung 6
      ZT = (t) => M6(t + 6.1);""")

# ---------- B: Gabriele kommt später, Karten der GL kleiner ----------
ers("[11.0, 12.0, 12.8, 13.8].forEach((t, i) => {", "[10.9, 11.95, 12.85, 14.0].forEach((t, i) => {")

# ---------- C: kürzer, Zeiten der englischen Stimme ----------
ers('O("#halle", { scale: 1.05, duration: 14, ease: "none" }, 16.0);', 'O("#halle", { scale: 1.05, duration: 11, ease: "none" }, 16.0);')
ers('O("#h-lader-info", { opacity: 0, duration: 0.2 }, 22.5);', 'O("#h-lader-info", { opacity: 0, duration: 0.2 }, 22.2);')
ers('"back.out(3)" }, 22.0);\n      O("#c-hersteller > *", { x: 500, opacity: 0, duration: 0.3, ease: "power3.in", stagger: 0.05 }, 22.45);',
    '"back.out(3)" }, 21.75);\n      O("#c-hersteller > *", { x: 500, opacity: 0, duration: 0.3, ease: "power3.in", stagger: 0.05 }, 22.2);')
ers('F("#c-mat .kick", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.3, ease: E }, 22.8);',
    'F("#c-mat .kick", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.3, ease: E }, 22.55);')
a = s.index("      // bis 42 mm"); b = s.index("      // Ab hier stehen die Zeiten")
block = s[a:b]
block = "\n".join(re.sub(r"(, )(\d+\.\d+)(\);)$", lambda m: f"{m.group(1)}{float(m.group(2)) - 2.95:.2f}{m.group(3)}", z) if z.strip().startswith(("F(", "O(")) else z
                  for z in block.split("\n"))
block = block.replace("blitz(27.25, 0.35); wackeln(27.25, 10);", "blitz(24.3, 0.35); wackeln(24.3, 10);").replace('zaehlen("d-n", 0, 42, 27.3, 1.1)', 'zaehlen("d-n", 0, 42, 24.35, 1.1)')
assert "27." not in block and "28." not in block and "29." not in block, block
s = s[:a] + block + s[b:]

# ---------- J: roter Kreis erst beim Zoom (fromTo zeigte ihn sonst schon vorher) ----------
ers('F("#mat-ring", { opacity: 1, scale: 0.4 }, { opacity: 0, scale: 2.2, duration: 0.6, ease: "power2.out", repeat: 2 }, 44.3);',
    'F("#mat-ring", { opacity: 1, scale: 0.4 }, { opacity: 0, scale: 2.2, duration: 0.6, ease: "power2.out", repeat: 2, ...nicht }, 44.3);')

# ---------- N und O im Skript neu ----------
a = s.index("      // ---- N Bestellungen"); b = s.index("      // ---- P Solar live")
s = s[:a] + '''      // ---- N Bestellungen (Fassung 6: 59.4 – 71.0), echte Aufnahme: Position, Status, PDF ----
      ZT = (t) => t;
      wisch(59.4);
      F("#g-best", { opacity: 0, x: 500, rotationY: -30, scale: 0.85, transformPerspective: 2000 }, { opacity: 1, x: 0, rotationY: -6, scale: 1, duration: 0.5, ease: E }, 59.42);
      O("#g-best", { rotationY: 0, duration: 10.5, ease: "sine.inOut" }, 59.9);
      F(".n-t", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: E, stagger: 0.08 }, 59.5);
      F("#n-bsp", { opacity: 0, y: 40, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(2)" }, 60.6);
      schritte([["#n-s1", 61.0], ["#n-s2", 65.7], ["#n-s3", 67.85], ["#n-s4", 69.2]]);
      // Kamera: Fenster "Neue Bestellposition" gross, dann Status, dann die Bestellung als PDF
      F("#w-best", { scale: 1 }, { scale: 1.45, duration: 0.6, ease: EI, transformOrigin: "50% 48%" }, 59.9);
      O("#w-best", { scale: 1, duration: 0.5, ease: EI }, 65.25);
      F("#w-best", { scale: 1, transformOrigin: "50% 45%" }, { scale: 1.35, duration: 0.45, ease: EI, transformOrigin: "50% 45%", ...nicht }, 65.75);
      O("#w-best", { scale: 1, duration: 0.4, ease: EI }, 67.4);
      F("#w-best", { scale: 1, transformOrigin: "50% 40%" }, { scale: 1.3, duration: 0.6, ease: EI, transformOrigin: "50% 40%", ...nicht }, 68.0);
      F("#b-status", { opacity: 0, y: 40, scale: 0.6 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(2)" }, 66.6);
      F("#b-status span:last-child", { scale: 1 }, { scale: 1.15, duration: 0.12, yoyo: true, repeat: 1, ...nicht }, 66.95);
      O("#b-status", { opacity: 0, y: -30, duration: 0.2 }, 67.7);
      F("#b-mail", { opacity: 0, x: 200, y: 300, rotation: 12, scale: 0.6 }, { opacity: 1, x: 0, y: 0, rotation: -3, scale: 1, duration: 0.45, ease: "back.out(1.6)" }, 69.2);
      blitz(69.2, 0.3);
      O("#b-mail", { x: 1200, y: -500, rotation: 25, scale: 0.4, opacity: 0, duration: 0.45, ease: "power3.in" }, 70.35);
      O("#g-best, #s14b .f-text", { opacity: 0, duration: 0.2 }, 70.75);

      // ---- O Sammelanzeige (71.0 – 73.6) ----
      blitz(71.0, 0.4); wackeln(71.0, 10);
      F(".o-wort", { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2.5)", stagger: 0.045 }, 71.05);
      O(".o-wort", { x: (i) => (i % 2 ? 1 : -1) * (20 + i * 3), y: (i) => (i % 3 - 1) * 16, duration: 1.9, ease: "sine.inOut" }, 71.3);
      F(".o-wort.gross", { scale: 1 }, { scale: 1.15, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.out", ...nicht }, 72.0);
      O(".o-wort", { opacity: 0, scale: 0.4, duration: 0.2, stagger: 0.008 }, 73.3);
      ZT = (t) => M6(t + 6.1);

''' + s[b:]

# ---------- HTML: Zeiten ab dem Stillstand abbilden ----------
kopf, rest = s.split("        <!-- E Stillstand -->", 1)
html, js = rest.split("    <script>", 1)
def clip(m):
    st, du = float(m.group(1)), float(m.group(2))
    if st < 29.99: return m.group(0)
    a, b = M6(st), M6(st + du)
    return f'data-start="{a:.2f}" data-duration="{b - a:.2f}"'
html = re.sub(r'data-start="([\d.]+)" data-duration="([\d.]+)"', clip, html)
# N neu
a = html.index("        <!-- N Bestellungen -->"); b = html.index("        <!-- P Solar live -->")
html = html[:a] + '''        <!-- N Bestellungen: echte Aufnahme aus dem Prüfstand -->
        <div id="s14b" class="clip" data-start="59.4" data-duration="11.6" data-track-index="1">
          <div class="f-text">
            <div class="kick n-t">Bestellungen</div>
            <h2 class="n-t">Schnell bestellt.</h2>
            <div id="n-bsp">Beispiel: 50 × Wendeplatte<br><small>Vischer &amp; Bolli AG</small></div>
            <div class="schritte">
              <div class="schritt" id="n-s1"><i>1</i>Position erfassen</div>
              <div class="schritt" id="n-s2"><i>2</i>Status: Bestellt</div>
              <div class="schritt" id="n-s3"><i>3</i>Bestellung als PDF</div>
              <div class="schritt ok" id="n-s4"><i>✓</i>Mail mit PDF bereit</div>
            </div>
          </div>
        </div>
        <div class="geraet browser" id="g-best">
          <div class="leiste"><i></i><i></i><i></i><span>hofertool / bestellungen</span></div>
          <div class="vwrap" id="w-best"><video id="v-best" class="clip" src="assets/k_best.mp4" muted playsinline data-start="59.4" data-duration="11.6" data-track-index="3"></video></div>
        </div>

        <div id="s14c" class="clip" data-start="59.4" data-duration="11.6" data-track-index="4">
          <div id="b-status"><span style="background:#1b2330;color:#cfe1fb">Offen</span><i>→</i><span style="background:#1f7a4d;color:#fff">Bestellt</span></div>
          <div id="b-mail"><b>Bestellung an Vischer &amp; Bolli AG</b><small>Hofer + Co · Bestellung als E-Mail</small>
            <div class="pdf"><i>PDF</i>Bestellung.pdf</div></div>
        </div>

        <!-- O Sammelanzeige: alle weiteren Funktionen -->
        <div id="s14" class="clip" data-start="71.0" data-duration="2.6" data-track-index="1">
          <div id="o-wolke"><!--WOLKE--></div>
        </div>

''' + html[b:]
s = kopf + "        <!-- E Stillstand -->" + html + "    <script>" + js
ers('data-duration="82.6"', 'data-duration="83.9"', 4)
ers("const ENDE = 82.6;", "const ENDE = 83.9;")

# ---------- CSS ----------
css = '''
      /* Fassung 6: GL kleiner als der Inhaber, mehr Werkstoffe, Beispiel bei den Bestellungen */
      #sB .t-karte.klein { top: 390px; width: 280px; height: 470px; }
      #sB .t-karte.klein .t-foto { height: 330px; }
      #sB .t-karte.klein b { top: 350px; font-size: 30px; left: 22px; }
      #c-mat .c-w { height: 70px; font-size: 34px; margin: 0 12px 14px 0; padding: 0 26px 0 18px; }
      #c-mat .c-w i { width: 34px; height: 34px; }
      #n-bsp { margin: 26px 0 8px; padding: 16px 22px; border-radius: 16px; background: rgba(31,111,224,.18); border: 2px solid rgba(107,164,255,.5);
        font-size: 30px; font-weight: 850; line-height: 1.2; }
      #n-bsp small { font-size: 22px; font-weight: 700; color: #8b9db8; }
      .o-wort.gross { font-size: 48px; background: #1f6fe0; border-color: #6ba4ff; }
'''
i = s.index("    </style>"); s = s[:i] + css + s[i:]
open(P, "w", encoding="utf-8").write(s)
print("ok")
