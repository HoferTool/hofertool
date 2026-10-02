-- =================================================================
--  INFOBOARD → HOFER TOOL, Schritt 3 (neu): Aufträge entzerren,
--  diesmal ohne Lücken
--
--  Die erste Fassung nahm jedem Auftrag den Endtag weg. Das war
--  richtig, wo der nächste Auftrag am selben Tag beginnt — und
--  falsch überall sonst: Da entstand ein leerer Tag.
--
--  Neue Regel: Der Endtag geht nur dann an den Nachfolger, wenn
--  an genau diesem Tag auf derselben Maschine der nächste beginnt.
--  Sonst bleibt er beim Auftrag.
--
--  An euren Daten nachgerechnet: 0 Überlappungen, 0 neue Lücken,
--  12 Aufträge rücken um wenige Tage.
--
--  Läuft gefahrlos mehrfach. Setzt auch die fünf Aufträge zurück,
--  die die erste Fassung verschoben hat.
-- =================================================================


-- ---------- Hilfsfunktionen, falls noch nicht da ----------

create or replace function ib_naechster_arbeitstag(d date)
returns date language sql immutable as $$
  select case
    when extract(isodow from d) = 6 then d + 2
    when extract(isodow from d) = 7 then d + 1
    else d end
$$;

create or replace function ib_plus_arbeitstage(d date, n int)
returns date language plpgsql immutable as $$
declare x date := ib_naechster_arbeitstag(d); i int := 0;
begin
  while i < n loop
    x := ib_naechster_arbeitstag(x + 1);
    i := i + 1;
  end loop;
  return x;
end $$;

create or replace function ib_letzter_tag(von date, tage int)
returns date language sql immutable as $$
  select ib_plus_arbeitstage(von, greatest(1, coalesce(tage, 1)) - 1)
$$;

create or replace view ib_ueberlappungen as
select a.machine_id, a.id as auftrag_a, b.id as auftrag_b,
       a.job_number as nr_a, b.job_number as nr_b
from jobs a
join jobs b on b.machine_id = a.machine_id and b.id > a.id
where ib_naechster_arbeitstag(a.planned_from) <= ib_letzter_tag(b.planned_from, b.planned_days)
  and ib_naechster_arbeitstag(b.planned_from) <= ib_letzter_tag(a.planned_from, a.planned_days);


-- ---------- A  Vorher ----------

select 'überlappende Paare vorher' as punkt, count(*)::text as wert from ib_ueberlappungen;


-- ---------- B  Beginn und Dauer neu aus infoBoard ----------
-- Jeder importierte Auftrag wird seiner infoBoard-Zeile zugeordnet:
-- gleiche HOCO Nr., gleiche Maschine, Beginn höchstens fünf Tage
-- auseinander (die erste Fassung hat ein paar verschoben).

with zuordnung as (
  select distinct on (j.id)
    j.id,
    g.start_zeit,
    g.end_zeit,
    -- beginnt an diesem Endtag auf derselben Maschine der nächste?
    exists (
      select 1 from ib_gedeutet n
      where n.machine_id = g.machine_id
        and n.hoco_nr is not null
        and n.ib_idx <> g.ib_idx
        and n.start_zeit::date = g.end_zeit::date
        and n.start_zeit >= g.start_zeit
    ) as endtag_geht_weiter
  from jobs j
  join ib_gedeutet g
    on g.hoco_nr = j.job_number
   and g.machine_id = j.machine_id
   and abs(g.start_zeit::date - j.planned_from) <= 5
  where j.plan_note like '%aus infoBoard%'
  order by j.id, abs(g.start_zeit::date - j.planned_from)
)
update jobs j
set planned_from = z.start_zeit::date,
    planned_days = greatest(1, (
      select count(*)
      from generate_series(
             z.start_zeit::date,
             case when z.endtag_geht_weiter and z.end_zeit::date > z.start_zeit::date
                  then z.end_zeit::date - 1
                  else z.end_zeit::date end,
             '1 day') d
      where extract(isodow from d) < 6))
from zuordnung z
where z.id = j.id;


-- ---------- C  Bündig setzen ----------
-- Je Maschine der Reihe nach: was sich noch überschneidet, rückt auf
-- den ersten freien Arbeitstag. Die Dauer bleibt.

do $$
declare
  r record;
  frei date;
  von date;
  aktuelle_maschine uuid := null;
  verschoben int := 0;
begin
  for r in
    select id, machine_id, planned_from, greatest(1, coalesce(planned_days, 1)) as tage
    from jobs
    order by machine_id, planned_from, id
  loop
    if aktuelle_maschine is distinct from r.machine_id then
      aktuelle_maschine := r.machine_id;
      frei := null;
    end if;

    von := ib_naechster_arbeitstag(r.planned_from);
    if frei is not null and von < frei then
      von := frei;
    end if;

    if von <> r.planned_from then
      update jobs set planned_from = von where id = r.id;
      verschoben := verschoben + 1;
    end if;

    frei := ib_plus_arbeitstage(ib_letzter_tag(von, r.tage), 1);
  end loop;

  raise notice 'verschoben: %', verschoben;
end $$;


-- ---------- D  Nachher ----------

select 'überlappende Paare nachher' as punkt, count(*)::text as wert from ib_ueberlappungen
union all
select 'Aufträge gesamt', count(*)::text from jobs;

-- Falls doch noch etwas übrig ist, steht es hier
select m.name, m.machine_number, u.nr_a, u.nr_b
from ib_ueberlappungen u
join machines m on m.id = u.machine_id
limit 20;
