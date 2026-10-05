-- =================================================================
--  EIGENE FARBEN WEG: alle Aufträge bekommen eine Palettenfarbe
--
--  Seit 111.37.0 gibt es nur noch die Farben der Palette (Wunsch
--  5. Oktober 2026). Die Aufträge aus infoBoard tragen noch ihre
--  eigenen Farben (zum Beispiel #ff0000). Dieses Skript setzt jede
--  davon auf die passende Palettenfarbe:
--
--    Rot          -> Rot      (V2A, Rostfrei)
--    Blau         -> Blau     (Automatenstahl, Eisen)
--    Rosa/Violett -> Rosa     (Chromstahl)
--    Grau         -> Grau     (V4A)
--    Weiss        -> Weiss    (Aluminium)
--    Gelb         -> Gelb     (Messing)
--    Orange, Grün -> Orange   (Neusilber)
--    Hellorange   -> Senf     (Ecobrass, Messing ohne Blei)
--    Titan        -> Violett
--  Alles andere: die nächstliegende Farbe der Palette.
--
--  "Zuletzt geändert von" bleibt, wie es ist (im SQL Editor ist
--  niemand angemeldet). Läuft gefahrlos mehrfach. Danach nicht mehr
--  infoboard-farben.sql ausführen, das würde die eigenen Farben
--  zurückholen.
-- =================================================================

with feste(hex, farbe) as (values
  ('#ff0000', 'rot'),    ('#ff0080', 'rot'),
  ('#0000ff', 'blau'),   ('#1a1aff', 'blau'),   ('#00008b', 'blau'),
  ('#da70d6', 'rosa'),   ('#ff80c0', 'rosa'),   ('#ff80ff', 'rosa'),
  ('#c080ff', 'rosa'),   ('#ff00ff', 'rosa'),
  ('#515151', 'grau'),   ('#4b4b4b', 'grau'),   ('#726b70', 'grau'),
  ('#706b72', 'grau'),   ('#515153', 'grau'),   ('#535353', 'grau'),
  ('#808080', 'grau'),
  ('#ffffff', 'weiss'),
  ('#ffff00', 'gelb'),
  ('#ff8040', 'orange'), ('#ff732f', 'orange'), ('#008000', 'orange'),
  ('#ffa500', 'senf'),   ('#ff8000', 'senf'),   ('#e67300', 'senf')
),
palette(farbe, fr, fg, fb) as (values
  ('blau',      0,  56, 132), ('hellblau',  61, 127, 209), ('marine',    11,  35,  80),
  ('tuerkis',  13, 125, 140), ('cyan',      23, 162, 184), ('gruen',     31, 122,  77),
  ('hellgruen',111,191,  91), ('oliv',     107, 122,  47), ('gelb',     240, 180,  41),
  ('senf',    201, 146,  42), ('orange',   194, 101,  15), ('hellorange',240,139,  60),
  ('rot',     179,  38,  30), ('dunkelrot',122,  23,  18), ('rosa',     212,  99, 143),
  ('violett',  91,  58, 158), ('flieder',  155, 124, 201), ('braun',    122,  82,  48),
  ('beige',   216, 196, 154), ('grau',     122, 131, 141), ('anthrazit', 60,  68,  77),
  ('weiss',   255, 255, 255)
),
neu as (
  select j.id,
    case
      -- Titan ist bei euch Violett, egal welche Farbe infoBoard hatte
      when j.material_bez ilike '%titan%' then 'violett'
      else coalesce(
        (select f.farbe from feste f where f.hex = lower(j.color)),
        (select p.farbe from palette p
          order by 2 * (p.fr - ('x' || substr(j.color, 2, 2))::bit(8)::int) ^ 2
                 + 4 * (p.fg - ('x' || substr(j.color, 4, 2))::bit(8)::int) ^ 2
                 + 3 * (p.fb - ('x' || substr(j.color, 6, 2))::bit(8)::int) ^ 2
          limit 1))
    end as farbe
  from jobs j
  where j.color ~* '^#[0-9a-f]{6}$'
)
update jobs j
set color = n.farbe
from neu n
where n.id = j.id;

-- Was nicht nach #rrggbb aussieht, aber trotzdem keine Palettenfarbe ist
update jobs set color = 'blau'
where color like '#%';

-- Senf (Ecobrass) und Violett (Titan) kommen neu vor. Damit sie im
-- Auftragsfenster zur Wahl stehen, bekommen sie ein Material, falls
-- sie noch keins haben. Unter Einstellungen -> Farben und Material
-- lässt sich das jederzeit ändern.
insert into farb_material (farbe, material, buchstabe, sortierung)
values ('senf', 'Ecobrass', 'EB', 9), ('violett', 'Titan', 'T', 15)
on conflict (farbe) do nothing;

notify pgrst, 'reload schema';

-- Probe: ok, wenn kein Auftrag mehr eine eigene Farbe hat
select case when count(*) = 0 then 'ok' else 'FEHLT: ' || count(*) || ' Aufträge mit eigener Farbe' end as probe
from jobs where color like '#%';
