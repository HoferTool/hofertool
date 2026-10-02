-- =================================================================
--  INFOBOARD → HOFER TOOL, Schritt 2: Import in Supabase
--
--  Vorher infoboard-daten.sql ausführen — das legt die Tabelle
--  ib_import an und füllt sie mit allen Balken. Kein CSV-Upload nötig.
--
--  Dann dieses Skript im SQL-Editor ausführen. Es hat drei Teile:
--   A  Vorbereitung — liest die Texte auseinander
--   B  Probelauf   — zeigt Zahlen und was fehlen würde. NICHTS wird
--                    geschrieben. Zuerst nur bis hier ausführen.
--   C  Übernahme   — legt HOCO Nr. und Aufträge an. Erst ausführen,
--                    wenn der Probelauf stimmt.
-- =================================================================


-- ---------- A  Vorbereitung ----------

drop view if exists ib_gedeutet;

create view ib_gedeutet as
with roh as (
  select
    ib_idx,
    nullif(trim(balken_text), '')                             as text,
    start_zeit::timestamp                                     as start_zeit,
    end_zeit::timestamp                                       as end_zeit,
    nullif(trim(maschine), '')                                as maschine,
    nullif(farbe, '')::bigint                                 as farbe,
    ib_guid
  from ib_import
),
teile as (
  select r.*,
    -- HOCO Nr.: fünf Ziffern, Strich, vier Ziffern
    -- auch "10824- 0422" mit Leerzeichen wird erkannt und bereinigt
    regexp_replace(substring(r.text from '(\d{5}\s?-\s?\d{4})'), '\s', '', 'g')
                                                              as hoco_nr,
    -- Maschinennummer aus "SW-20 Nr. 121" oder "SB-20RG Nr.123"
    substring(r.maschine from 'Nr\.?\s*(\d+)')                as maschinen_nr,
    -- die Zeilen des Textes einzeln
    string_to_array(r.text, ' | ')                            as zeilen
  from roh r
),
gedeutet as (
  select t.*,
    -- Materialzeile: enthält "rd", "mm", eine Toleranz oder eine Norm
    (select z from unnest(t.zeilen) z
      where z ~* '(\srd\s|\smm\b|\sh\d\b|X\d+Cr|11SMn|CuZn|CuNi|AlMg|AlCu|\bTi\b|PEEK|POM|1\.4\d{3}|ETG|Ecobrass)'
      limit 1)                                                as material,
    -- Menge: die erste Zahl ab 100 im Text — ohne HOCO Nr., ohne
    -- Materialzeile (wegen "rd 024 mm"), ohne Kalenderwochen und
    -- Jahreszahlen. Mit oder ohne Tausenderzeichen: 8'000, 4000Stk.
    (select z from (
       select (regexp_replace(m[1], '[''\.]', '', 'g'))::bigint as z
       from regexp_matches(
         regexp_replace(regexp_replace(regexp_replace(
           array_to_string(array(
             select z2 from unnest(t.zeilen) z2
             where z2 !~* '(\srd\s|\smm\b|\sh\d\b|X\d+Cr|11SMn|CuZn|CuNi|AlMg|AlCu|\bTi\b|PEEK|POM|1\.4\d{3}|ETG|Ecobrass)'
           ), ' | '),
           '\d{5}-\d{4}', '', 'g'),
           '\m(KW|kw)\s*\d+', '', 'g'),
           '\m20[2-3]\d\M', '', 'g'),
         '(?<![\d.])(\d{1,3}(?:[''\.]\d{3})+|\d{3,7})(?![\d.])', 'g') m
     ) q
     where z between 100 and 2000000
     limit 1)                                                 as menge,
    -- Farbe von infoBoard (signed ARGB) in Rot, Grün, Blau
    ((t.farbe + 4294967296) % 4294967296 >> 16) & 255         as r,
    ((t.farbe + 4294967296) % 4294967296 >> 8) & 255          as g,
    ((t.farbe + 4294967296) % 4294967296) & 255               as b
  from teile t
)
select g.*,
  -- Notiz: alles ausser HOCO-Zeile und Materialzeile
  nullif(trim(array_to_string(array(
    select z from unnest(g.zeilen) z
    where trim(z) <> '' and z !~ '\d{5}\s?-\s?\d{4}' and z is distinct from g.material
  ), E'\n')), '')                                             as notiz,
  case
    when g.end_zeit < now() then 'fertig'
    when g.start_zeit <= now() and g.end_zeit >= now() then 'laeuft'
    else 'geplant'
  end                                                         as zustand,
  -- Arbeitstage zwischen Start und Ende (Mo–Fr), mindestens 1
  greatest(1, (
    select count(*) from generate_series(g.start_zeit::date, g.end_zeit::date, '1 day') d
    where extract(isodow from d) < 6
  ))                                                          as arbeitstage,
  -- nächstliegende Farbe der App
  (select f.name from (values
      ('blau',      0,  56, 132), ('hellblau',  61, 127, 209), ('marine',    11,  35,  80),
      ('tuerkis',   13, 125, 140), ('cyan',     23, 162, 184), ('gruen',     31, 122,  77),
      ('hellgruen',111, 191,  91), ('oliv',    107, 122,  47), ('gelb',     240, 180,  41),
      ('senf',     201, 146,  42), ('orange',  194, 101,  15), ('hellorange',240,139,  60),
      ('rot',      179,  38,  30), ('dunkelrot',122,  23,  18), ('rosa',     212,  99, 143),
      ('violett',   91,  58, 158), ('flieder', 155, 124, 201), ('braun',    122,  82,  48),
      ('beige',    216, 196, 154), ('grau',    122, 131, 141), ('anthrazit', 60,  68,  77),
      ('weiss',    255, 255, 255)
    ) as f(name, fr, fg, fb)
    order by (f.fr - g.r)^2 + (f.fg - g.g)^2 + (f.fb - g.b)^2
    limit 1)                                                  as farbe_app,
  -- Zuordnung zu euren Maschinen über die Nummer
  (select m.id from machines m
    where regexp_replace(coalesce(m.machine_number, ''), '\D', '', 'g') = g.maschinen_nr
       or m.name ~ ('(^|\D)' || g.maschinen_nr || '(\D|$)')
    order by m.is_active desc
    limit 1)                                                  as machine_id
from gedeutet g;


-- ---------- B  Probelauf ----------
-- Nur lesen. Zeigt, was übernommen würde und was fehlt.

select 'Balken im Export'                       as punkt, count(*)::text as wert from ib_import
union all
select 'davon mit HOCO Nr.',                    count(*)::text from ib_gedeutet where hoco_nr is not null
union all
select 'davon ohne HOCO Nr. (werden übersprungen)', count(*)::text from ib_gedeutet where hoco_nr is null
union all
select 'davon Maschine erkannt',                count(*)::text from ib_gedeutet where machine_id is not null
union all
select 'davon Maschine NICHT erkannt',          count(*)::text from ib_gedeutet where machine_id is null
union all
select 'mit Menge',                             count(*)::text from ib_gedeutet where menge is not null
union all
select 'mit Material',                          count(*)::text from ib_gedeutet where material is not null
union all
select 'Zustand fertig',                        count(*)::text from ib_gedeutet where zustand = 'fertig'
union all
select 'Zustand läuft',                         count(*)::text from ib_gedeutet where zustand = 'laeuft'
union all
select 'Zustand geplant',                       count(*)::text from ib_gedeutet where zustand = 'geplant'
union all
select 'neue HOCO Nr.',                         count(distinct hoco_nr)::text
  from ib_gedeutet g where hoco_nr is not null
    and not exists (select 1 from hoco_parts h where h.hoco_nr = g.hoco_nr);

-- Welche infoBoard-Zeilen keiner Maschine zugeordnet werden konnten.
-- Steht hier etwas, entweder die Maschine in der App anlegen (mit der
-- Nummer im Feld Maschinennummer) oder die Zeile bewusst weglassen.
select maschine, count(*) as balken
from ib_gedeutet
where machine_id is null
group by maschine
order by balken desc;

-- Stichprobe: so sähen die Aufträge aus
select hoco_nr, maschine, start_zeit::date as von, arbeitstage, zustand,
       menge, material, farbe_app, left(notiz, 60) as notiz
from ib_gedeutet
where hoco_nr is not null
order by start_zeit desc
limit 30;


-- ---------- C  Übernahme ----------
-- Erst ausführen, wenn der Probelauf passt. Läuft gefahrlos mehrfach:
-- was schon da ist, wird nicht doppelt angelegt.

-- HOCO-Stammdaten, die noch fehlen
insert into hoco_parts (hoco_nr, material)
select distinct on (g.hoco_nr) g.hoco_nr, g.material
from ib_gedeutet g
where g.hoco_nr is not null
  and not exists (select 1 from hoco_parts h where h.hoco_nr = g.hoco_nr)
order by g.hoco_nr, g.start_zeit desc;

-- Aufträge
insert into jobs (job_number, machine_id, planned_from, planned_days, plan_status,
                  target_quantity, material_bez, plan_note, color,
                  started_at, ended_at, fa_erstellt, material_ok)
select
  g.hoco_nr,
  g.machine_id,
  g.start_zeit::date,
  g.arbeitstage,
  g.zustand,
  g.menge,
  g.material,
  case when g.notiz is null then 'aus infoBoard'
       else g.notiz || E'\n(aus infoBoard)' end,
  g.farbe_app,
  g.start_zeit,
  case when g.zustand = 'fertig' then g.end_zeit else null end,
  g.zustand = 'fertig',
  g.zustand <> 'geplant'
from ib_gedeutet g
where g.hoco_nr is not null
  and g.machine_id is not null
  and not exists (
    select 1 from jobs j
    where j.job_number = g.hoco_nr
      and j.machine_id = g.machine_id
      and j.planned_from = g.start_zeit::date
  );

-- Ergebnis
select 'HOCO Nr. gesamt' as punkt, count(*)::text as wert from hoco_parts
union all
select 'Aufträge gesamt', count(*)::text from jobs
union all
select 'davon aus infoBoard', count(*)::text from jobs where plan_note like '%aus infoBoard%';
