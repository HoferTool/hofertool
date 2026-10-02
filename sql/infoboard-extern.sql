-- =================================================================
--  INFOBOARD → HOFER TOOL: die Aufträge der Maschinen 303 und 304
--  (Extern, Zurbrügg) nachholen
--
--  Beim Import gab es diese beiden Maschinen in der App noch nicht,
--  deshalb wurden ihre Aufträge übersprungen. Dieses Skript holt nur
--  sie nach — mit derselben Deutung, denselben Regeln fürs Entzerren
--  und den Farben aus infoBoard. Alle anderen Maschinen bleiben, wie
--  sie sind, auch was du dort inzwischen von Hand geändert hast.
--
--  Voraussetzung: ib_import und ib_gedeutet vom ersten Import sind
--  noch da (das sind sie, wenn du sie nicht gelöscht hast).
--
--  Läuft gefahrlos mehrfach.
-- =================================================================


-- ---------- 1. Probe vorher ----------
select m.machine_number as nr, m.name, count(j.id) as auftraege_jetzt
from machines m
left join jobs j on j.machine_id = m.id
where m.machine_number in ('303', '304')
group by m.machine_number, m.name
order by 1;

select g.maschinen_nr as nr,
       count(*) filter (where g.hoco_nr is not null)                          as balken_mit_hoco,
       count(*) filter (where g.hoco_nr is not null and g.machine_id is not null) as zugeordnet
from ib_gedeutet g
where g.maschinen_nr in ('303', '304')
group by g.maschinen_nr
order by 1;


-- ---------- 2. HOCO Nummern, die noch fehlen ----------
insert into hoco_parts (hoco_nr, material)
select distinct on (g.hoco_nr) g.hoco_nr, g.material
from ib_gedeutet g
where g.maschinen_nr in ('303', '304')
  and g.hoco_nr is not null
  and not exists (select 1 from hoco_parts h where h.hoco_nr = g.hoco_nr)
order by g.hoco_nr, g.start_zeit desc;


-- ---------- 3. Aufträge anlegen ----------
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
  -- die Farbe genau wie in infoBoard
  '#' || lpad(to_hex(g.r), 2, '0') || lpad(to_hex(g.g), 2, '0') || lpad(to_hex(g.b), 2, '0'),
  g.start_zeit,
  case when g.zustand = 'fertig' then g.end_zeit else null end,
  g.zustand = 'fertig',
  g.zustand <> 'geplant'
from ib_gedeutet g
where g.maschinen_nr in ('303', '304')
  and g.hoco_nr is not null
  and g.machine_id is not null
  and not exists (
    select 1 from jobs j
    where j.job_number = g.hoco_nr
      and j.machine_id = g.machine_id
      and abs(j.planned_from - g.start_zeit::date) <= 5
  );


-- ---------- 4. Dauer nach der Endtag-Regel ----------
-- Der Endtag geht nur an den Nachfolger, wenn an genau diesem Tag
-- auf derselben Maschine der nächste Auftrag beginnt.
with zuordnung as (
  select distinct on (j.id)
    j.id, g.start_zeit, g.end_zeit,
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
    and g.maschinen_nr in ('303', '304')
  order by j.id, abs(g.start_zeit::date - j.planned_from)
)
update jobs j
set planned_from = z.start_zeit::date,
    planned_days = greatest(1, (
      select count(*)
      from generate_series(
             z.start_zeit::date,
             case when z.endtag_geht_weiter and z.end_zeit::date > z.start_zeit::date
                  then z.end_zeit::date - 1 else z.end_zeit::date end,
             '1 day') d
      where extract(isodow from d) < 6))
from zuordnung z
where z.id = j.id;


-- ---------- 5. Bündig setzen, nur diese zwei Maschinen ----------
do $$
declare
  r record;
  frei date;
  von date;
  aktuelle_maschine uuid := null;
  verschoben int := 0;
begin
  for r in
    select j.id, j.machine_id, j.planned_from, greatest(1, coalesce(j.planned_days, 1)) as tage
    from jobs j
    join machines m on m.id = j.machine_id
    where m.machine_number in ('303', '304')
    order by j.machine_id, j.planned_from, j.id
  loop
    if aktuelle_maschine is distinct from r.machine_id then
      aktuelle_maschine := r.machine_id;
      frei := null;
    end if;
    von := ib_naechster_arbeitstag(r.planned_from);
    if frei is not null and von < frei then von := frei; end if;
    if von <> r.planned_from then
      update jobs set planned_from = von where id = r.id;
      verschoben := verschoben + 1;
    end if;
    frei := ib_plus_arbeitstage(ib_letzter_tag(von, r.tage), 1);
  end loop;
  raise notice 'verschoben: %', verschoben;
end $$;


-- ---------- 6. Nachher ----------
select m.machine_number as nr, m.name, count(j.id) as auftraege,
       min(j.planned_from) as erster, max(j.planned_from) as letzter,
       count(*) filter (where j.plan_status <> 'fertig') as offen
from machines m
left join jobs j on j.machine_id = m.id
where m.machine_number in ('303', '304')
group by m.machine_number, m.name
order by 1;
