      const tl = gsap.timeline({ paused: true });
      const E_ = "expo.out", BK = "back.out(1.15)", EL = "power3.out";
      const nicht = { immediateRender: false };
      const ruhig = (o) => { if (o && typeof o.rotation === "number" && Math.abs(o.rotation) < 90) o.rotation *= 0.15; return o; };
      const F = (s, a, b, t) => tl.fromTo(s, ruhig(a), ruhig(b), t);
      const O = (s, b, t) => tl.to(s, ruhig(b), t);
      // gleicher Zufall bei jedem Abspielen
      let saat = 12345; const zuf = () => { saat |= 0; saat = (saat + 0x6D2B79F5) | 0; let t = Math.imul(saat ^ (saat >>> 15), 1 | saat); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const zw = (a, b) => a + (b - a) * zuf();
      // Bausteine
      // professionell: ruhiges Einblenden, keine Drehungen, kein Rütteln
      const rein = (s, t, d = {}) => F(s, { opacity: 0, scale: 0.94, rotation: 0, y: d.y ?? 36, filter: "blur(8px)" }, { opacity: 1, scale: 1, rotation: 0, y: 0, filter: "blur(0px)", duration: 0.6, ease: "power3.out" }, t);
      const knall = (s, t, r = 0) => { F(s, { opacity: 0, scale: 1.25, rotation: 0, filter: "blur(10px)" }, { opacity: 1, scale: 1, rotation: 0, filter: "blur(0px)", duration: 0.45, ease: "power3.out" }, t); };
      const ruetteln = (s, t, st = 14) => tl.fromTo(s, { scale: 1.0 }, { scale: 1.0, duration: 0.01, ...nicht }, t);
      const weg = (s, t, d = 0.25) => O(s, { opacity: 0, scale: 0.6, duration: d, ease: "power2.in" }, t);
      const wackeln = (s, t, n = 3) => tl.to(s, { scale: 1.03, duration: 0.25, yoyo: true, repeat: 1, ease: "sine.inOut", ...nicht }, t);
      const zaehlen = (s, von, bis, t, d, fmt) => { const o = { v: von }; tl.to(o, { v: bis, duration: d, ease: "power2.out", onUpdate: () => { const e = document.querySelector(s); if (e) e.textContent = fmt(o.v); } }, t); };
      const zahl = (v, n = 0) => v.toFixed(n).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "'");
      const kamera = (i, von = 1, bis = 1.05) => F(`#z${i} .buehne`, { scale: von }, { scale: bis, duration: B[i] - A[i], ease: "none" }, A[i]);
      function konfetti(box, t, n = 60, ox = 960, oy = 500) {
        const el = document.querySelector(box); const farben = ["#ffd23f", "#1f6fe0", "#ff3b5c", "#16c784", "#ff8fb1", "#8b5cf6", "#fff"];
        for (let k = 0; k < n; k++) {
          const i = document.createElement("i"); i.style.left = ox + "px"; i.style.top = oy + "px"; i.style.background = farben[k % farben.length]; el.appendChild(i);
          const a = zw(0, Math.PI * 2), v = zw(300, 900);
          const t0 = t + zw(0, 0.12);
          tl.set(i, { opacity: 1 }, t0);
          tl.fromTo(i, { x: 0, y: 0, rotation: 0 }, { x: Math.cos(a) * v, y: Math.sin(a) * v * 0.7 + 520, rotation: zw(-720, 720), duration: zw(1.4, 2.2), ease: "power2.out", ...nicht }, t0);
        }
      }
      // Übergang: drei schräge Farbbalken über den Schnitt
      function wisch(t, f) {
        const b = document.querySelectorAll("#wisch i"); gsap.set(b, { xPercent: -130, skewX: -14 });
        b.forEach((e, k) => { tl.fromTo(e, { xPercent: -130 }, { xPercent: 0, duration: 0.22, ease: "power3.in", ...nicht }, t - 0.24 + k * 0.04);
          tl.to(e, { xPercent: 130, duration: 0.3, ease: "power3.out" }, t + 0.02 + k * 0.04); });
      }

      // Szenen mit Namen (A.x Anfang, B.x Ende, ZEL.x Element)
      Object.keys(A).forEach((k) => { if (!["dr", "sonicht", "tool"].includes(k)) wisch(A[k]); });
      Object.keys(A).forEach((k) => { if (!["dr", "masch", "doch", "sonicht", "tool", "gl"].includes(k)) F(`#${ZEL[k]} .buehne`, { scale: 1 }, { scale: 1.05, duration: B[k] - A[k], ease: "none" }, A[k]); });

      // ---- Drohne ----
      F("#dr-bild", { scale: 1.18, x: 160 }, { scale: 1.02, x: -120, duration: B.dr, ease: "none" }, 0);
      F("#dr-logo", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, 0.3);
      F("#dr-titel", { opacity: 0, y: 40, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "power3.out" }, S(1) - 0.15);
      rein("#dr-ort", W.lohn - 0.15);
      knall("#dr-seit", W.seit + 0.1);

      // ---- Inhaber und Geschäftsleitung ----
      rein("#gl-titel", A.gl + 0.1);
      F("#gl-patrick", { opacity: 0, rotationY: 180, scale: 0.6, transformPerspective: 2000 }, { opacity: 1, rotationY: 0, scale: 1, duration: 0.7, ease: E_ }, W.patrick - 0.35);
      F("#gl-patrick .holo", { xPercent: -120 }, { xPercent: 140, duration: 0.9, ease: "power2.inOut" }, W.patrick + 0.2);
      O("#gl-patrick", { x: -630, y: 120, scale: 0.78, rotation: -3, duration: 0.55, ease: "power3.inOut" }, W.team - 0.5);
      O("#gl-titel", { opacity: 0, y: -40, duration: 0.2 }, W.team - 0.55);
      F("#gl-titel2", { opacity: 0, y: -60 }, { opacity: 1, y: 0, duration: 0.4, ease: BK }, W.team - 0.2);
      ["michel", "tristan", "sebastian", "gabriele"].forEach((n, k) => {
        F(`#gl-${n}`, { opacity: 0, x: -900, y: 300 }, { opacity: 1, x: 0, y: 0, rotation: [-3, 2, -2, 3][k], duration: 0.5, ease: E_ }, W.team + 0.05 + k * 0.3);
        F(`#gl-${n} .holo`, { xPercent: -120 }, { xPercent: 140, duration: 0.8, ease: "power2.inOut" }, W.team + 0.4 + k * 0.3);
      });
      // ---- Team (ohne Stimme) ----
      rein("#tm-titel", A.team + 0.05);
      // drei Folien: je Gruppe Fotos herein, Titel dazu, beim Wechsel nach links hinaus
      FOLIEN.forEach((t0, g) => {
        const bis = g < FOLIEN.length - 1 ? FOLIEN[g + 1] : null, lab = `#tm-a${g + 1}`;
        F(lab, { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out" }, t0);
        document.querySelectorAll(`.twg${g}`).forEach((p, k) =>
          p.dataset.spaet === "1"
            ? F(p, { opacity: 0, scale: 1.6, rotation: 8 }, { opacity: 1, scale: 1, rotation: -3, duration: 0.3, ease: "back.out(1.6)" }, t0 + 0.75)
            : F(p, { opacity: 0, y: 60, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out" }, t0 + 0.05 + k * 0.05));
        if (bis !== null) {
          tl.to(lab, { opacity: 0, x: -60, duration: 0.25, ease: "power2.in", ...nicht }, bis - 0.3);
          tl.to(`.twg${g}`, { opacity: 0, x: -120, duration: 0.3, stagger: 0.015, ease: "power2.in", ...nicht }, bis - 0.32);
        }
      });
      F("#kaffee", { x: 700, rotation: 12 }, { x: 0, rotation: 0, duration: 0.55, ease: BK }, KAFFEE - 0.75);
      F("#kaffee .tasse", { y: 0 }, { y: -8, duration: 0.3, yoyo: true, repeat: 9, ease: "sine.inOut" }, KAFFEE - 0.2);
      F("#kaffee .d", { opacity: 0, y: 10 }, { opacity: 1, y: -20, duration: 0.6, repeat: 4, stagger: 0.3, ease: "sine.out" }, KAFFEE - 0.3);
      // alle schauen zum Kaffee
      O(".tw", { x: "+=40", rotation: "+=5", duration: 0.35, stagger: 0.02, ease: "power2.out" }, KAFFEE + 0.1);
      knall("#kf-sys", KAFFEE + 0.55, -5);
      O("#kf-anz", { color: "#ffd23f", duration: 0.01 }, KAFFEE + 0.55);


      // ---- Präzision und Maschinen (ohne Stimme) ----
      F("#pz-halle", { scale: 1.02 }, { scale: 1.16, duration: B.masch - A.masch, ease: "none" }, A.masch);
      F("#pz-titel", { opacity: 0, y: 40, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "power3.out" }, A.masch + 0.3);
      ["#mk-star", "#mk-hanwha", "#mk-index", "#mk-willemin"].forEach((m, k) => knall(m, A.masch + 1.8 + k * 0.45));
      // ---- Feiern (ohne Stimme) ----
      F("#disko, #disko-faden", { y: -500 }, { y: 0, duration: 0.9, ease: "power3.out" }, A.feiern + 0.1);
      F("#disko", { rotation: -10 }, { rotation: 10, duration: 0.5, yoyo: true, repeat: 12, ease: "sine.inOut", ...nicht }, A.feiern + 1);
      F("#spot1", { x: 0, y: 0 }, { x: 900, y: 300, duration: 3.2, yoyo: true, repeat: 1, ease: "sine.inOut" }, A.feiern);
      F("#spot2", { x: 0, y: 0 }, { x: -800, y: 500, duration: 3.0, yoyo: true, repeat: 1, ease: "sine.inOut" }, A.feiern);
      F("#spot3", { x: 0, y: 0, scale: 1 }, { x: 400, y: -300, scale: 1.3, duration: 2.8, yoyo: true, repeat: 1, ease: "sine.inOut" }, A.feiern);
      rein("#fe-titel", A.feiern + 0.1);
      F("#fe-mont", { opacity: 0 }, { opacity: 1, duration: 0.2 }, MONT0);
      let tm = MONT0; document.querySelectorAll(".fe-lab").forEach((e, k) => { const t = tm; tm += MONT[k];
        F(e, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.25, ease: "power3.out" }, t + 0.05);
        tl.to(e, { opacity: 0, duration: 0.15, ...nicht }, tm - 0.12); });
      rein("#fe-c1", B.feiern - 3.3, { r: -2 });
      rein("#fe-c2", B.feiern - 2.7, { r: 2 });
      konfetti("#fe-konf", B.feiern - 3.1, 50, 1600, 420);
      konfetti("#fe-konf", B.feiern - 1.0, 60, 960, 300);


      // ---- Ordnung (ohne Stimme) ----
      rein("#or-titel", A.ord + 0.15);
      rein("#or-selbst", A.ord + 1.1);
      ["#wz1", "#wz3", "#wz4", "#wz5", "#wz6", "#wz7", "#wz8", "#wz9"].forEach((s, k) => F(s, { opacity: 0, x: zw(-900, 900), y: zw(-700, 700), rotation: zw(-400, 400) }, { opacity: 1, x: 0, y: 0, rotation: 0, duration: 0.5, ease: E_ }, A.ord + 0.9 + k * 0.11));
      F("#wb", { boxShadow: "0 0 0 0 rgba(22,199,132,0)" }, { boxShadow: "0 0 0 18px rgba(22,199,132,.6)", duration: 0.3, yoyo: true, repeat: 1 }, A.ord + 2.1);
      F("#or-schub", { opacity: 0, y: 500 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, A.ord + 2.3);
      F("#wz-banane", { opacity: 0, x: 700, y: -700, rotation: 300 }, { opacity: 1, x: 10, y: 0, rotation: 35, duration: 0.45, ease: "power3.out" }, A.ord + 3.9);
      knall("#or-meist", A.ord + 4.45);
      wackeln("#wz-banane", A.ord + 4.9);

      // ---- Doch hinter den Maschinen ----
      F("#do-bild", { scale: 1.16, filter: "grayscale(0) brightness(1)" }, { scale: 1.3, filter: "grayscale(1) brightness(0.32)", duration: B.doch - A.doch, ease: "power1.inOut" }, A.doch);
      F("#do-1", { opacity: 0, y: 30, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.8, ease: "power3.out" }, S(3) - 0.1);
      F("#do-2", { opacity: 0, y: 30, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.8, ease: "power3.out" }, W.anders - 0.6);

      // ---- Magnetwand ----
      rein("#mg-t1", S(4) - 0.1);
      F("#mg-wand", { opacity: 0, y: 120 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, A.magnet + 0.1);
      document.querySelectorAll(".mgm").forEach((m, k) => F(m, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: BK }, A.magnet + 0.3 + k * 0.04));
      rein("#mg-t2", W.magnetwand - 0.1);
      tl.to("#mg-f", { keyframes: [{ rotation: -6, duration: 0.08 }, { rotation: 5, duration: 0.08 }, { rotation: -3, duration: 0.08 }], ...nicht }, W.faellt - 0.45);
      tl.to("#mg-f", { y: 560, rotation: 64, duration: 0.5, ease: "power2.in", ...nicht }, W.faellt - 0.2);
      tl.to("#mg-f", { y: 520, rotation: 80, duration: 0.18, yoyo: true, repeat: 1, ease: "power1.out", ...nicht }, W.faellt + 0.35);
      tl.to("#mg-wand", { x: 6, duration: 0.05, yoyo: true, repeat: 5, ease: "none", ...nicht }, W.faellt + 0.35);
      document.querySelectorAll(".mg-frage").forEach((q, k) => F(q, { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, W.niemand + k * 0.16));
      knall("#mg-wohin", W.wohin - 0.5);

      // ---- Material ----
      rein("#mc-t1", S(5) - 0.1);
      F("#mc-b1", { opacity: 0, y: 100 }, { opacity: 1, y: 0, rotation: -3, duration: 0.45, ease: E_ }, W.zweimal - 0.35);
      F("#mc-b2", { opacity: 0, y: 100 }, { opacity: 1, y: 0, rotation: 2, duration: 0.45, ease: E_ }, W.zweimal - 0.1);
      knall("#mc-2x", W.zweimal + 0.45);
      F("#mc-b3", { opacity: 0, y: 100 }, { opacity: 1, y: 0, rotation: 3, duration: 0.45, ease: E_ }, W.garnicht - 0.4);
      knall("#mc-0x", W.garnicht + 0.1);
      O("#mc-b1, #mc-b2, #mc-b3, #mc-2x, #mc-0x", { opacity: 0, y: -60, duration: 0.35, ease: "power2.in" }, W.rest5 - 0.4);
      F("#mc-lager", { opacity: 0 }, { opacity: 1, duration: 0.4 }, W.rest5 - 0.1);
      F("#mc-licht", { x: 0, y: 0 }, { x: 520, y: 80, duration: 1.6, ease: "sine.inOut" }, W.rest5);
      tl.to("#mc-licht", { x: 200, y: -120, duration: 1.2, ease: "sine.inOut", ...nicht }, W.rest5 + 1.6);
      rein("#mc-rest", W.rest5 - 0.2);
      knall("#mc-nicht", W.gefunden - 0.05);

      // ---- Excel-Versionen ----
      rein("#xl-t1", S(6) - 0.1);
      document.querySelectorAll(".xl").forEach((x, k) => F(x, { opacity: 0, y: -60, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, rotation: zw(-4, 4), duration: 0.35, ease: E_ }, S(6) + 0.1 + k * ((W.excel + 0.3 - S(6)) / 10)));
      zaehlen("#xl-zahl", 1, 10, S(6) + 0.1, W.excel + 0.3 - S(6), (v) => Math.round(v));
      rein("#xl-welche", W.welche - 0.1);
      O(".xl", { filter: "grayscale(1) brightness(.6)", duration: 0.4 }, W.ahnung - 0.3);
      knall("#xl-ahnung", W.ahnung - 0.05);

      // ---- Zettel, Werkzeug fehlt, Maschine steht ----
      document.querySelectorAll("#z8 .zettel").forEach((z, k) => F(z, { opacity: 0, y: -1300, rotation: zw(-90, 90) }, { opacity: 1, y: 0, rotation: +z.dataset.r, duration: zw(0.6, 0.9), ease: "power3.out" }, A.zettel + 0.1 + k * 0.06));
      rein("#ch-zettel", S(7) - 0.1);
      O("#z8 .zettel", { opacity: 0.25, duration: 0.3 }, W.werkzeug7 - 0.4);
      F("#stm", { opacity: 0, x: 300 }, { opacity: 1, x: 0, duration: 0.5, ease: E_ }, W.werkzeug7 - 0.4);
      knall("#ch-wz", W.werkzeug7 - 0.05);
      O("#stm-schirm", { attr: { fill: "#ef4f5f" }, duration: 0.15 }, W.steht - 0.1);
      F("#stm-lampe", { opacity: 0 }, { opacity: 1, duration: 0.25, yoyo: true, repeat: 7, ease: "sine.inOut" }, W.steht - 0.1);
      knall("#ch-steht", W.steht + 0.1);

      // ---- Telefon ----
      F("#telefon", { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1, duration: 0.3, ease: BK }, W.telefon - 0.4);
      tl.to("#telefon", { keyframes: [{ rotation: -14 }, { rotation: 14 }], duration: 0.08, repeat: 15, yoyo: true, ease: "none", ...nicht }, W.telefon);
      F("#ring", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1.1, duration: 0.2, yoyo: true, repeat: 5, ease: "power2.out" }, W.telefon);
      rein("#bl-wann", W.wann - 0.15);
      ["#ord1", "#ord2", "#ord3"].forEach((s, k) => F(s, { opacity: 0, y: -1100 }, { opacity: 1, y: 0, rotation: [-4, 2, 6][k], duration: 0.4, ease: "power3.out" }, W.wann + 0.6 + k * 0.12));
      F("#lupe", { x: 0, rotation: -20 }, { x: 2400, rotation: 20, duration: 1.8, ease: "sine.inOut" }, W.wann + 1.0);
      knall("#tel-gute", W.gute - 0.05);

      // ---- So konnte es nicht weitergehen ----
      F("#sn-text", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, S(9) - 0.1);
      F("#sn-linie", { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power3.inOut" }, W.weiter + 0.2);
      O("#sn-text, #sn-linie", { opacity: 0, duration: 0.3 }, B.sonicht - 0.35);

      // ---- Also haben wir ein Tool entwickelt ----
      F("#bh-text", { opacity: 0, filter: "blur(12px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.6, ease: "power2.out" }, S(10) - 0.1);
      F("#flut", { scale: 0 }, { scale: 1.1, duration: 0.55, ease: "power3.in" }, W.tool - 0.5);
      O("#bh-text", { opacity: 0, duration: 0.15 }, W.tool - 0.1);
      F("#strahlen", { opacity: 0, rotation: 0 }, { opacity: 1, rotation: 40, duration: 3, ease: "none" }, W.tool);
      F("#ht-logo", { opacity: 0, y: 100, scale: 0.5 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: BK }, W.tool - 0.05);
      F("#ht-name", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.5, ease: EL }, W.tool + 0.05);
      rein("#ht-gebaut", W.entwickelt);
      konfetti("#ht-konf", W.tool + 0.05, 70, 960, 600);

      // ---- Planwand ----
      rein("#z10 .nummer", S(11) - 0.15);
      F("#pw-fenster", { opacity: 0, x: 900 }, { opacity: 1, x: 0, duration: 0.5, ease: E_ }, A.pw + 0.05);
      F("#hand", { opacity: 0, x: 0, y: 200 }, { opacity: 1, x: 0, y: 0, duration: 0.3, ease: E_ }, W.ziehen - 0.4);
      O("#hand", { x: 420, y: 120, duration: 0.6, ease: "power2.inOut" }, W.ziehen);
      O("#hand", { scale: 0.85, duration: 0.1, yoyo: true, repeat: 1 }, W.loslassen);
      O("#hand", { opacity: 0, duration: 0.2 }, W.fertig11 + 0.4);
      rein("#pw-l1", W.ziehen - 0.1); rein("#pw-l2", W.loslassen - 0.1);
      O("#pw-l1, #pw-l2", { opacity: 0, duration: 0.2 }, W.sofort - 0.5);
      knall("#pw-ohne", W.sofort - 0.1);
      // ---- 11 Material ----
      rein("#z11 .nummer", S(12) - 0.15);
      F("#mt-fenster", { opacity: 0, y: 700, rotation: -4 }, { opacity: 1, y: 0, rotation: 0, duration: 0.5, ease: E_ }, A.mat + 0.05);
      rein("#mt-rechner", W.rechnet - 0.1, { r: 2 });
            O("#mt-rechner", { x: 600, opacity: 0, duration: 0.3, ease: "power2.in" }, W.liegt - 0.4);
      F("#mt-rest", { opacity: 0, scale: 0.2, rotation: 20 }, { opacity: 1, scale: 1, rotation: -3, duration: 0.55, ease: EL }, W.liegt - 0.05);
      wackeln("#mt-rest .emo", W.haus, 3);
      rein("#mt-neu", W.bevor - 0.3, { r: 4 });
      F("#mt-neu s", { textDecorationColor: "rgba(255,59,92,0)" }, { textDecorationColor: "rgba(255,59,92,1)", duration: 0.2 }, W.bevor + 0.1);
      knall("#mt-gespart", W.bevor + 0.45, -10);
      ruetteln("#z11 .buehne", W.bevor + 0.77, 18);
      document.querySelectorAll(".muenze").forEach((m, k) => F(m, { opacity: 0, y: -900, rotation: 0 }, { opacity: 1, y: 0, rotation: zw(-200, 200), duration: zw(0.7, 1.0), ease: "power3.out" }, W.bevor + 0.6 + k * 0.05));

      // ---- 12 Einrichtblatt ----
      rein("#z12 .nummer", S(13) - 0.15);
      F("#eb-fenster", { opacity: 0, rotationY: -50, x: -400, transformPerspective: 2200 }, { opacity: 1, rotationY: 0, x: 0, duration: 0.55, ease: E_ }, A.eb + 0.05);
      rein("#eb-t1", W.eines - 0.15, { r: -2 }); rein("#eb-t2", W.direkt - 0.15, { r: 2 }); rein("#eb-t3", W.direkt + 0.7, { r: -1 });
      F("#eb-finger", { opacity: 0, y: 300 }, { opacity: 1, y: 0, duration: 0.3, ease: E_ }, W.tipp - 0.45);
      O("#eb-finger", { scale: 0.8, duration: 0.08, yoyo: true, repeat: 1 }, W.tipp - 0.05);
      F("#eb-tipp", { opacity: 1, scale: 0.2 }, { opacity: 0, scale: 2.2, duration: 0.5, ease: "power2.out" }, W.tipp);
      O("#eb-finger", { opacity: 0, duration: 0.2 }, W.tipp + 0.4);
      F("#eb-paket", { opacity: 0, x: 0, y: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.25, ease: BK }, W.tipp + 0.15);
      tl.to("#eb-paket", { motionPath: { path: [{ x: 0, y: 0 }, { x: 400, y: -380 }, { x: 900, y: 120 }], curviness: 1.4 }, rotation: 380, duration: 0.8, ease: "power1.in", ...nicht }, W.tipp + 0.4);
      knall("#eb-bestellt", W.bestellt13 - 0.1, -3);

      // ---- 13 Pad ----
      rein("#z13 .nummer", S(14) - 0.15);
      F("#pd-tablet", { opacity: 0, y: 900, rotation: 8 }, { opacity: 1, y: 0, rotation: -1, duration: 0.55, ease: E_ }, A.pad + 0.05);
      rein("#pd-c1", W.stueck - 0.1, { r: -2 }); rein("#pd-c2", W.wechseln - 0.1, { r: 2 }); rein("#pd-c3", W.wartung - 0.1, { r: -2 });
      F("#daumen", { y: 0, rotation: -20 }, { y: -720, rotation: 0, duration: 0.5, ease: BK }, W.daumen - 0.55);
      O("#daumen", { y: -660, scale: 0.92, duration: 0.1, yoyo: true, repeat: 3 }, W.daumen);
      ruetteln("#pd-tablet", W.daumen + 0.05, 10);
      knall("#pd-gross", W.daumen + 0.3, -4);

      // ---- 14 QS Check ----
      rein("#z14 .nummer", S(15) - 0.15);
      F("#qs-fenster", { opacity: 0, scale: 0.5, rotation: -8 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.55, ease: E_ }, A.qs + 0.05);
      F("#qs-lupe", { opacity: 0, x: 0, y: 0 }, { opacity: 1, x: 300, y: -60, duration: 0.4, ease: E_ }, W.alle - 0.5);
      tl.to("#qs-lupe", { motionPath: { path: [{ x: 300, y: -60 }, { x: 700, y: 250 }, { x: 900, y: -40 }], curviness: 1.2 }, duration: 1.1, ease: "sine.inOut", ...nicht }, W.alle);
      O("#qs-lupe", { opacity: 0, duration: 0.2 }, W.blick + 0.4);
      F("#qs-blick", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.35, ease: BK }, W.blick - 0.3);
      tl.set("#qs-blick", { left: 520, top: 150 }, 0);

      // ---- 15 Statistik ----
      rein("#z15 .nummer", S(16) - 0.15);
      F("#st-fenster", { opacity: 0, y: -800 }, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out" }, A.stat + 0.05);
      ["#ar1", "#ar2", "#ar3"].forEach((s, k) => { rein(s, W.tag + 0.35 + k * 0.28, { r: [-3, 2, -2][k] }); F(`${s} .x`, { scaleX: 0 }, { scaleX: 1, duration: 0.18, ease: "power2.out" }, W.ausreden + 0.1 + k * 0.18); });
      O("#ar1, #ar2, #ar3", { y: 1000, rotation: 30, duration: 0.5, stagger: 0.08, ease: "power2.in" }, E(16) - 0.15);

      // ---- 16 Bestellungen ----
      rein("#z16 .nummer", S(17) - 0.15);
      F("#be-fenster", { opacity: 0, x: -900, rotation: -6 }, { opacity: 1, x: 0, rotation: 0, duration: 0.5, ease: E_ }, A.best + 0.05);
      rein("#be-was", W.zwanzig - 0.1, { r: 3 });
      O("#be-was", { opacity: 0, y: -30, duration: 0.2 }, W.klick - 0.3);
      F("#be-brief", { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.25, ease: BK }, W.klick - 0.05);
      tl.to("#be-brief", { motionPath: { path: [{ x: 0, y: 0 }, { x: 500, y: -500 }, { x: 1400, y: -700 }], curviness: 1.3 }, rotation: 25, scale: 0.6, duration: 0.8, ease: "power2.in", ...nicht }, W.klick + 0.3);
      knall("#be-weg", W.raus - 0.05);

      // ---- Infoboard, Pausenraum ----
      F("#vm-ib", { opacity: 0, y: 900 }, { opacity: 1, y: 0, rotation: -2, duration: 0.5, ease: E_ }, W.infoboard - 0.45);
      rein("#vm-ib-n", W.infoboard - 0.1);
      F("#vm-pr", { opacity: 0, x: 1100 }, { opacity: 1, x: 0, rotation: 1, duration: 0.5, ease: E_ }, W.pausenraum - 0.45);
      rein("#vm-pr-n", W.pausenraum - 0.1);
      rein("#vm-radio", W.pausenraum + 0.35);
      F(".note", { opacity: 0, y: 0, x: 0 }, { opacity: 1, y: -260, x: () => zw(-80, 80), duration: 1.0, stagger: 0.15, ease: "sine.out" }, W.pausenraum + 0.5);
      rein("#vm-spiel", W.pausenraum + 0.7);

      // ---- Solar ----
      F("#sol-titel", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, A.solar + 0.1);
      F("#sol-karte", { opacity: 0, y: 80 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, A.solar + 0.15);
      F("#sol-karte .sk-wert", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1, ease: "power3.out" }, A.solar + 0.45);
      F("#sol-linie", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.5, ease: "power2.inOut" }, A.solar + 0.6);
      F("#sol-flaeche", { opacity: 0 }, { opacity: 1, duration: 1.0, ease: "power1.out" }, A.solar + 1.2);
      F("#sol-verb", { opacity: 0 }, { opacity: 1, duration: 0.6 }, A.solar + 1.1);
      zaehlen("#sol-zahl", 0, 47.3, A.solar + 0.6, 1.5, (v) => zahl(v, 1));
      F("#sol-karte .sk-kacheln > div", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1, ease: "power3.out" }, A.solar + 1.7);
      F("#sol-handy", { opacity: 0, x: 120 }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, A.solar + 1.0);
      F("#sol-karte .sk-kopf em", { scale: 1 }, { scale: 1.25, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.out" }, W.live - 0.05);
      F("#sol-karte .sk-kopf i", { opacity: 1 }, { opacity: 0.2, duration: 0.4, yoyo: true, repeat: 9, ease: "sine.inOut" }, A.solar + 0.6);

      // ---- 19 Schluss ----
      F("#ende-logo", { opacity: 0, scale: 2.4, rotation: -12 }, { opacity: 1, scale: 1, rotation: -1, duration: 0.34, ease: "power4.in" }, S(19) - 0.05);
      ruetteln("#z19 .buehne", S(19) + 0.3, 16);
      F("#ende-1", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.45, ease: E_ }, W.praezise - 0.15);
      F("#ende-2", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.45, ease: E_ }, W.jetzt - 0.35);
      F("#ende-2 .mark", { backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%", duration: 0.5, ease: "power2.out" }, W.planung);
      rein("#ende-ht", W.planung + 0.6, { r: -2 });
      konfetti("#ende-konf", W.planung + 0.6, 80, 960, 900);

      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
      tl.seek(0);
