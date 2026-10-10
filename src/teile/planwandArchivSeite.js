// =================================================================
//  PLANWAND-ARCHIV · die Seite in der Datei
//  Baut aus den Daten (alt.planArchivDaten in app.js) eine einzige
//  HTML-Datei mit Gestaltung und kleinem Programm darin. Sie braucht
//  nichts von aussen, kein Netz, keine Anmeldung: Doppelklick im Ordner
//  öffnet sie im Browser. Nur ein Reiter: Planwand (Wunsch Patrick,
//  10. Oktober 2026). Zum Ansehen, nichts lässt sich ändern.
//
//  Das Programm in der Datei ist bewusst einfaches JavaScript ohne
//  Abhängigkeiten, damit es auch in Jahren noch in jedem Browser läuft.
// =================================================================

// Daten so einbetten, dass kein „</script>“ im Text die Seite bricht
function datenJson(daten) {
  return JSON.stringify(daten).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function textEsc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const STIL = `
:root{--blau:#003884;--hg:#eef2f7;--flaeche:#fff;--text:#16202c;--leise:#5d6b7c;--linie:#dfe5ee;--woche:#9fb0c6;
--kopf:#f5f8fc;--park:#e3eaf4;--heute:rgba(0,56,132,.09);--nw:180px;--zh:40px}
@media (prefers-color-scheme:dark){:root{--hg:#0f141b;--flaeche:#171e27;--text:#e6edf5;--leise:#93a1b3;--linie:#273242;
--woche:#4a5a70;--kopf:#1c2430;--park:#202b3a;--heute:rgba(120,170,255,.12)}}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--hg);color:var(--text);font:14px/1.35 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;display:flex;flex-direction:column}
header{background:var(--blau);color:#fff;display:flex;align-items:flex-end;gap:18px;padding:10px 16px 0;flex:none;flex-wrap:wrap}
header .marke{font-weight:700;font-size:17px;padding-bottom:10px;letter-spacing:.2px}
header .reiter{background:var(--hg);color:var(--text);border-radius:8px 8px 0 0;padding:8px 18px;font-weight:600}
header .stand{margin-left:auto;padding-bottom:10px;font-size:13px;opacity:.9}
.leiste{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 16px;flex:none}
.leiste button,.leiste select,.leiste input{font:inherit;color:var(--text);background:var(--flaeche);border:1px solid var(--linie);border-radius:8px;padding:6px 11px;min-height:34px}
.leiste button{cursor:pointer}
.leiste button:hover{border-color:var(--blau)}
.leiste .titel{font-weight:600;margin:0 6px}
.leiste .rechts{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.leiste input[type=search]{width:220px}
.leiste .treffer{color:var(--leise);font-size:13px;min-width:54px}
.rolle{flex:1;overflow:auto;padding:0 16px 16px}
.tafel{background:var(--flaeche);border:1px solid var(--linie);border-radius:10px;position:relative;min-width:760px}
.zeile{display:grid;grid-template-columns:var(--nw) 1fr;border-bottom:1px solid var(--linie)}
.name{padding:0 10px;display:flex;align-items:center;gap:8px;border-right:1px solid var(--linie);position:sticky;left:0;background:var(--flaeche);z-index:3;min-height:var(--zh);overflow:hidden;white-space:nowrap}
.name .nr{font-weight:700}
.name .tx{color:var(--leise);overflow:hidden;text-overflow:ellipsis}
.kopf .name,.kopf{background:var(--kopf)}
.kopf .name{min-height:26px;font-size:12px;color:var(--leise)}
.spuren{position:relative;display:flex}
.spuren>div{flex:1 1 0;min-width:0;text-align:center;font-size:12px;padding:3px 0;border-left:1px solid var(--linie);white-space:nowrap;overflow:hidden}
.spuren>div.woche{border-left-color:var(--woche)}
.spuren>div.heute{background:var(--heute);font-weight:700;color:var(--blau)}
@media (prefers-color-scheme:dark){.spuren>div.heute{color:#9cc2ff}}
.tag .wt{display:block;color:var(--leise);font-size:11px}
.parkzeile{background:var(--park);font-weight:700}
.parkzeile .name{background:var(--park);min-height:28px}
.bahn{position:relative;min-height:var(--zh)}
.raster{position:absolute;inset:0;display:flex;pointer-events:none}
.raster>div{flex:1 1 0;border-left:1px solid var(--linie)}
.raster>div.woche{border-left-color:var(--woche)}
.raster>div.heute{background:var(--heute)}
.balken{position:absolute;top:3px;bottom:3px;border-radius:5px;color:#000;overflow:hidden;cursor:default;display:flex;align-items:center;gap:5px;padding:0 5px;border:1px solid rgba(0,0,0,.28);z-index:1}
.balken:hover,.balken.an{outline:2px solid #fff;box-shadow:0 0 0 3px rgba(0,0,0,.55);z-index:2;filter:brightness(1.08)}
.balken.fund{outline:3px solid #ffd400;box-shadow:0 0 0 5px rgba(0,0,0,.6);z-index:2}
.balken .rest{position:absolute;top:0;bottom:0;right:0;background:rgba(255,255,255,.36);pointer-events:none}
.balken .zei{flex:none;font-size:15px;line-height:1;position:relative}
.balken .mz{display:inline-block;background:#fff;color:#d00;font-weight:800;font-size:12px;line-height:16px;width:16px;text-align:center;border-radius:3px}
.balken .inh{min-width:0;position:relative;line-height:1.1}
.balken .z1{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}
.balken .z2{font-weight:500;white-space:nowrap;font-size:12px}
.balken .warn{color:#000;background:#ffd400;border-radius:3px;padding:0 3px;margin-left:4px;font-size:11px}
.balken.fertig{color:#10151c}
.balken.offen{border-top-left-radius:0;border-bottom-left-radius:0}
.ferien{position:absolute;height:18px;border-radius:4px;background:#8fb3e6;color:#0b2350;font-size:11px;padding:0 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:18px}
@media (prefers-color-scheme:dark){.ferien{background:#365f96;color:#e6edf5}}
.info{position:fixed;z-index:50;background:var(--flaeche);color:var(--text);border:1px solid var(--linie);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:10px 12px;max-width:340px;font-size:13px;pointer-events:none}
.info .k{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;margin-bottom:4px}
.info .siegel{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border-radius:50%;border:2px solid var(--blau);color:var(--blau);font-size:10px;font-weight:800;padding:0 3px}
.info .l{height:7px}
.info .klein{color:var(--leise);font-size:12px}
.info .warn{color:#b3261e;font-weight:600}
.info .abruf{font-weight:600}
.info .farbe{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:middle}
.leer{padding:30px;text-align:center;color:var(--leise)}
@media print{header,.leiste{display:none}.rolle{overflow:visible}body{background:#fff}}
`;

const PROGRAMM = `
(function(){
var D = JSON.parse(document.getElementById("daten").textContent);
var WT = ["Mo","Di","Mi","Do","Fr","Sa","So"];
var MON = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
function ausIso(t){var p=String(t).split("-");return new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));}
function iso(d){return d.toISOString().slice(0,10);}
function plus(t,n){var d=ausIso(t);d.setUTCDate(d.getUTCDate()+n);return iso(d);}
function wt(t){return (ausIso(t).getUTCDay()+6)%7;}
function nAT(t){while(wt(t)>4)t=plus(t,1);return t;}
function arbeitstage(ab,n){var l=[],d=nAT(ab);for(var i=0;i<n;i++){l.push(d);d=nAT(plus(d,1));}return l;}
function montag(t){return plus(t,-wt(t));}
function kw(t){var d=ausIso(t);d.setUTCDate(d.getUTCDate()+3-wt(t));var j=new Date(Date.UTC(d.getUTCFullYear(),0,4));
  return 1+Math.round(((d-j)/86400000-3+((j.getUTCDay()+6)%7))/7);}
function esc(t){return String(t==null?"":t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function datum(t){var d=ausIso(t);return WT[wt(t)]+", "+d.getUTCDate()+"."+(d.getUTCMonth()+1)+"."+d.getUTCFullYear();}

var erstellt = new Date(D.erstellt);
var standTag = erstellt.getFullYear()+"-"+String(erstellt.getMonth()+1).padStart(2,"0")+"-"+String(erstellt.getDate()).padStart(2,"0");
var heute = nAT(standTag);
// Alle Balken in einer Liste, für Suche und Zeichnen
var alle = [];
D.parks.forEach(function(p){p.maschinen.forEach(function(m){m.balken.forEach(function(b){b.m_=m;alle.push(b);});});});
var start = plus(montag(heute),-14);
var wochen = 6;
try { var w0 = +localStorage.getItem("hofer.archiv.wochen"); if (w0) wochen = w0; } catch(e) {}
var funde = [], fundNr = -1, fundBalken = null;

function zeichne(){
  var tage = arbeitstage(start, wochen*5);
  var idx = {}; tage.forEach(function(t,i){idx[t]=i;});
  var n = tage.length, von = tage[0], bis = tage[n-1];
  document.getElementById("titel").textContent = datum(von)+" – "+datum(bis);
  var neueWoche = function(t,i){return i>0 && montag(t)!==montag(tage[i-1]);};
  var raster = '<div class="raster">'+tage.map(function(t,i){return '<div class="'+(neueWoche(t,i)?"woche ":"")+(t===heute?"heute":"")+'"></div>';}).join("")+'</div>';
  // Monate und Wochen über den Tagen
  var gruppen = function(schl,txt){var g=[];tage.forEach(function(t){var k=schl(t);var l=g[g.length-1];if(l&&l.k===k)l.n++;else g.push({k:k,t:txt(t),n:1});});
    return g.map(function(x,i){return '<div style="flex:'+x.n+' 1 0"'+(i?' class="woche"':'')+'>'+esc(x.t)+'</div>';}).join("");};
  var h = '<div class="zeile kopf"><div class="name"></div><div class="spuren">'+gruppen(function(t){return t.slice(0,7);},function(t){var d=ausIso(t);return MON[d.getUTCMonth()]+" "+d.getUTCFullYear();})+'</div></div>'
    + '<div class="zeile kopf"><div class="name">Woche</div><div class="spuren">'+gruppen(function(t){return montag(t);},function(t){return "KW "+kw(t);})+'</div></div>'
    + '<div class="zeile kopf"><div class="name">Maschine</div><div class="spuren">'+tage.map(function(t,i){
        return '<div class="tag'+(neueWoche(t,i)?" woche":"")+(t===heute?" heute":"")+'"><span class="wt">'+WT[wt(t)]+'</span>'+ausIso(t).getUTCDate()+'</div>';}).join("")+'</div></div>';
  var bnr = 0;
  var sichtbar = function(b){
    if (b.von > bis) return null;
    if (plus(b.von, Math.ceil(b.tage*7/5)+4) < von) return null;
    var belegt = arbeitstage(b.von, b.tage), s = belegt.filter(function(t){return t in idx;});
    if (!s.length) return null;
    return {von: idx[s[0]], dauer: s.length, offen: belegt[0]!==s[0], vorlauf: belegt.indexOf(s[0]), ganz: belegt.length};
  };
  D.parks.forEach(function(p){
    h += '<div class="zeile parkzeile"><div class="name">'+esc(p.name)+'</div><div></div></div>';
    p.maschinen.forEach(function(m){
      var balken = m.balken.map(function(b){
        var s = sichtbar(b); if (!s) return "";
        b.i_ = bnr++;
        var rest = "";
        if (b.anteil !== null && b.anteil !== undefined) {
          var grenz = b.anteil/100*s.ganz, links = Math.max(0,Math.min(100,(grenz-s.vorlauf)/s.dauer*100));
          rest = '<div class="rest" style="left:'+links+'%"></div>';
        }
        return '<div class="balken'+(b.st==="fertig"?" fertig":"")+(s.offen?" offen":"")+(b===fundBalken?" fund":"")+'" data-i="'+b.i_+'" style="left:calc(100% * '+s.von+' / '+n+');width:calc(100% * '+s.dauer+' / '+n+' - 2px);background:'+b.hg+'">'
          + rest + '<span class="zei">'+(b.m?'<span class="mz">M</span>':esc(b.z))+'</span>'
          + '<div class="inh"><div class="z1">'+esc(b.nr)+(b.problem?'<span class="warn">⚠</span>':'')+'</div><div class="z2">'+esc(b.zwei)+'</div></div></div>';
      }).join("");
      h += '<div class="zeile"><div class="name" title="'+esc(m.name)+'">'+(m.nr?'<span class="nr">'+esc(m.nr)+'</span>':'')+'<span class="tx">'+esc(m.name)+'</span></div>'
        + '<div class="bahn">'+raster+balken+'</div></div>';
    });
  });
  // Ferien: jeder Eintrag in die oberste freie Bahn
  var fe = D.ferien.map(function(f){var s=sichtbar(f);return s?{f:f,s:s}:null;}).filter(Boolean)
    .sort(function(a,b){return a.s.von-b.s.von||b.s.dauer-a.s.dauer;});
  var bahnen = [];
  fe.forEach(function(x){var k=0;while(bahnen[k]&&bahnen[k].some(function(y){return x.s.von<y.s.von+y.s.dauer&&y.s.von<x.s.von+x.s.dauer;}))k++;
    (bahnen[k]=bahnen[k]||[]).push(x);x.k=k;});
  h += '<div class="zeile parkzeile"><div class="name">Ferien</div><div></div></div>'
    + '<div class="zeile"><div class="name">Wer ist weg</div><div class="bahn" style="min-height:'+(Math.max(2,bahnen.length+1)*21+4)+'px">'+raster
    + fe.map(function(x){return '<div class="ferien" title="'+esc(x.f.person)+'" style="top:'+(4+x.k*21)+'px;left:calc(100% * '+x.s.von+' / '+n+');width:calc(100% * '+x.s.dauer+' / '+n+' - 2px)">'+esc(x.f.person)+'</div>';}).join("")
    + '</div></div>';
  var tafel = document.getElementById("tafel");
  tafel.innerHTML = D.parks.length ? h : '<div class="leer">In dieser Datei sind keine Maschinen.</div>';
  sichtbare = {};
  alle.forEach(function(b){ if (b.i_ !== undefined) { sichtbare[b.i_] = b; } });
  alle.forEach(function(b){ delete b.i_; });
}
var sichtbare = {};

// Schnellvorschau beim Darüberfahren, auf dem Tablet beim Antippen
var info = null, angeheftet = null;
function infoZeigen(el, x, y){
  var b = sichtbare[el.getAttribute("data-i")]; if (!b) return;
  if (!info) { info = document.createElement("div"); info.className = "info"; document.body.appendChild(info); }
  info.innerHTML = '<div class="k">'+esc(b.nr)+(b.siegel||[]).map(function(s){return '<span class="siegel">'+esc(s)+'</span>';}).join("")+'</div>'
    + b.info.map(function(z){ if (!z[0]) return '<div class="l"></div>';
        return '<div class="'+esc(z[1]||"")+'">'+(z[2]?'<span class="farbe" style="background:'+esc(z[2])+'"></span>':'')+esc(z[0])+'</div>'; }).join("")
    + '<div class="klein">'+esc((b.m_.nr?b.m_.nr+" · ":"")+b.m_.name)+' · ab '+esc(datum(b.von))+', '+b.tage+(b.tage>1?" Arbeitstage":" Arbeitstag")+'</div>';
  info.style.display = "block";
  var w = info.offsetWidth, hh = info.offsetHeight;
  info.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w/2)) + "px";
  info.style.top = (y - 14 - hh >= 8 ? y - 14 - hh : Math.min(innerHeight - hh - 8, y + 18)) + "px";
}
function infoWeg(){ if (info) info.style.display = "none"; }
var tafelEl = document.getElementById("tafel");
tafelEl.addEventListener("mousemove", function(e){
  if (angeheftet) return;
  var el = e.target.closest(".balken"); if (el) infoZeigen(el, e.clientX, e.clientY); else infoWeg();
});
tafelEl.addEventListener("mouseleave", function(){ if (!angeheftet) infoWeg(); });
tafelEl.addEventListener("click", function(e){
  var el = e.target.closest(".balken");
  if (angeheftet) { angeheftet.classList.remove("an"); }
  if (!el || el === angeheftet) { angeheftet = null; infoWeg(); return; }
  angeheftet = el; el.classList.add("an"); infoZeigen(el, e.clientX, e.clientY);
});
document.getElementById("rolle").addEventListener("scroll", function(){ if (angeheftet) { angeheftet.classList.remove("an"); angeheftet = null; } infoWeg(); });

function gehe(t){ start = montag(t); angeheftet = null; infoWeg(); zeichne(); }
document.getElementById("zurueck").onclick = function(){ gehe(plus(start,-7)); };
document.getElementById("vor").onclick = function(){ gehe(plus(start,7)); };
document.getElementById("heute").onclick = function(){ fundBalken = null; gehe(plus(montag(heute),-14)); };
document.getElementById("datum").onchange = function(e){ if (e.target.value) gehe(plus(montag(e.target.value),-7)); };
var wSel = document.getElementById("wochen"); wSel.value = String(wochen);
wSel.onchange = function(){ wochen = +wSel.value; try { localStorage.setItem("hofer.archiv.wochen", wochen); } catch(e) {} zeichne(); };
document.addEventListener("keydown", function(e){
  if (e.target.tagName === "INPUT") return;
  if (e.key === "ArrowLeft") gehe(plus(start,-7));
  else if (e.key === "ArrowRight") gehe(plus(start,7));
  else if (e.key === "h" || e.key === "H") document.getElementById("heute").click();
  else if (e.key === "Escape") { if (angeheftet) angeheftet.classList.remove("an"); angeheftet = null; infoWeg(); }
});

// Suche nach HOCO Nr., FA Nr. oder Material, neuester Auftrag zuerst
var suche = document.getElementById("suche"), trefferEl = document.getElementById("treffer");
function suchen(){
  var q = suche.value.trim().toLowerCase();
  funde = q ? alle.filter(function(b){ return (b.nr+" "+b.fa+" "+b.mat).toLowerCase().indexOf(q) !== -1; })
    .sort(function(a,b){ return a.von < b.von ? 1 : a.von > b.von ? -1 : 0; }) : [];
  fundNr = -1; fundBalken = null;
  trefferEl.textContent = q ? (funde.length ? funde.length + " Treffer" : "kein Treffer") : "";
  if (funde.length) springe(1); else zeichne();
}
function springe(r){
  if (!funde.length) return;
  fundNr = (fundNr + r + funde.length) % funde.length;
  fundBalken = funde[fundNr];
  trefferEl.textContent = (fundNr+1) + " / " + funde.length;
  start = plus(montag(fundBalken.von), -7); zeichne();
  var el = document.querySelector(".balken.fund");
  if (el) el.scrollIntoView({block:"center", inline:"nearest"});
}
var warte = null;
suche.addEventListener("input", function(){ clearTimeout(warte); warte = setTimeout(suchen, 250); });
suche.addEventListener("keydown", function(e){ if (e.key === "Enter") { e.preventDefault(); springe(e.shiftKey ? -1 : 1); } });
document.getElementById("weiter").onclick = function(){ springe(1); };
document.getElementById("vorher").onclick = function(){ springe(-1); };

zeichne();
})();
`;

export function archivSeite(daten) {
  const d = new Date(daten.erstellt);
  const z = (n) => String(n).padStart(2, "0");
  const stand = z(d.getDate()) + "." + z(d.getMonth() + 1) + "." + d.getFullYear() + ", " + z(d.getHours()) + ":" + z(d.getMinutes()) + " Uhr";
  return `<!doctype html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Planwand ${textEsc(stand)}</title>
<style>${STIL}</style>
</head>
<body>
<header>
  <div class="marke">Hofer Tool</div>
  <div class="reiter">Planwand</div>
  <div class="stand">Stand vom ${textEsc(stand)} · nur zum Ansehen</div>
</header>
<div class="leiste">
  <button id="zurueck" title="Eine Woche zurück (Pfeil links)">◀</button>
  <button id="heute" title="Zum Stand-Tag (H)">Stand-Tag</button>
  <button id="vor" title="Eine Woche vor (Pfeil rechts)">▶</button>
  <span class="titel" id="titel"></span>
  <input type="date" id="datum" title="Zu einem Datum springen">
  <select id="wochen" title="Zeitraum">
    <option value="2">2 Wochen</option><option value="4">4 Wochen</option><option value="6">6 Wochen</option>
    <option value="8">8 Wochen</option><option value="12">12 Wochen</option><option value="26">26 Wochen</option>
  </select>
  <div class="rechts">
    <input type="search" id="suche" placeholder="HOCO Nr., FA oder Material suchen">
    <button id="vorher" title="Vorheriger Treffer">Zurück</button>
    <button id="weiter" title="Nächster Treffer (Enter)">Weiter</button>
    <span class="treffer" id="treffer"></span>
  </div>
</div>
<div class="rolle" id="rolle"><div class="tafel" id="tafel"></div></div>
<script type="application/json" id="daten">${datenJson(daten)}</script>
<script>${PROGRAMM}</script>
</body>
</html>
`;
}
