// Erzeugt die Kartenpfade (Schweiz, Kantone, Gemeinden im Kanton Solothurn, Lohn-Ammannsegg) für das Video
const t = require("./node_modules/swiss-maps/2025/ch-combined.json");
const tc = require("topojson-client"), d3 = require("d3-geo"), fs = require("fs");
const land = tc.feature(t, t.objects.country);
const kantone = tc.feature(t, t.objects.cantons).features;
const gemeinden = tc.feature(t, t.objects.municipalities).features;
const seen = tc.feature(t, t.objects.lakes);
const proj = d3.geoMercator().fitExtent([[160, 90], [1760, 990]], land);
const pfad = d3.geoPath(proj).digits(2);
const so = kantone.find((k) => k.id == 11);
const lohn = gemeinden.find((g) => g.id == 2526);
const imSO = gemeinden.filter((g) => d3.geoContains(so, d3.geoCentroid(g)));
const bb = (f) => pfad.bounds(f).flat().map((v) => Math.round(v * 100) / 100);
fs.writeFileSync("karte.json", JSON.stringify({
  land: pfad(land), seen: pfad(seen),
  kantone: kantone.filter((k) => k.id != 11).map((k) => pfad(k)),
  so: pfad(so), soBox: bb(so), soMitte: proj(d3.geoCentroid(so)).map((v) => +v.toFixed(2)),
  gemeinden: imSO.filter((g) => g.id != 2526).map((g) => pfad(g)),
  lohn: pfad(lohn), lohnBox: bb(lohn), lohnMitte: proj(d3.geoCentroid(lohn)).map((v) => +v.toFixed(2)),
}));
console.log("Gemeinden SO", imSO.length, "Box SO", bb(so), "Box Lohn", bb(lohn), fs.statSync("karte.json").size);
