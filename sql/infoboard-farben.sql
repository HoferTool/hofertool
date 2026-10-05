-- =================================================================
--  NICHT MEHR AUSFÜHREN (seit 111.37.0 nur noch Palettenfarben,
--  siehe eigene-farben-weg.sql).
--
--  FARBEN AUS INFOBOARD, unverändert
--
--  Beim Import wurde jede infoBoard-Farbe auf die nächstliegende
--  Farbe der App gerundet. Ab Version 104 kann ein Auftrag jede
--  Farbe tragen — dieses Skript setzt die Farben der importierten
--  Aufträge auf genau die Werte aus infoBoard.
--
--  Aufträge, die seit dem Einbau von "zuletzt geändert" jemand von
--  Hand angefasst hat, bleiben unangetastet — deren Farbe gilt.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

with zuordnung as (
  select distinct on (j.id)
    j.id,
    '#' || lpad(to_hex(g.r), 2, '0') || lpad(to_hex(g.g), 2, '0') || lpad(to_hex(g.b), 2, '0')
      as farbe_hex
  from jobs j
  join ib_gedeutet g
    on g.hoco_nr = j.job_number
   and g.machine_id = j.machine_id
   and abs(g.start_zeit::date - j.planned_from) <= 5
  where j.plan_note like '%aus infoBoard%'
  order by j.id, abs(g.start_zeit::date - j.planned_from)
)
update jobs j
set color = z.farbe_hex
from zuordnung z
where z.id = j.id
  and j.color is distinct from z.farbe_hex
  -- nur, was seither niemand in der App geändert hat
  and j.geaendert_von is null;

-- Ergebnis: welche Farben wie oft
select color, count(*) as auftraege
from jobs
group by color
order by auftraege desc;
