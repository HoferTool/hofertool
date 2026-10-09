-- =================================================================
--  PLANWAND UND FERIEN NEU AUS INFOBOARD (Neustart, 9. Oktober 2026)
--
--  Wunsch Patrick: Planwand samt Ferien leeren, infoBoard neu auslesen
--  und die Planwand neu füllen.
--
--  Die neuen Daten liegen schon in der Datenbank bereit (aus dem
--  Export infoboard_alles.csv, siehe infoboard-export-alles.sql):
--    ib_neu_tab   alle Balken der Maschinen, schon gedeutet (wie
--                 ib_gedeutet; Zustand aus dem Zeichen in infoBoard:
--                 Haken fertig, Play läuft, Kreis geplant; laufen auf
--                 einer Maschine zwei, läuft nur der spätere)
--    ferien_neu   alle Ferien, je Person ein Eintrag, Zeile vergeben
--  Eine Kopie des bisherigen Stands liegt in jobs_vor_neustart,
--  vacations_vor_neustart, production_records_vor_neustart,
--  tool_changes_vor_neustart und pad_skizzen_vor_neustart.
--
--  Was diese Datei in einem Zug tut:
--   1. Kopie nachführen (was seit dem Ablegen dazukam)
--   2. Aufträge aus infoBoard anlegen, Dauer nach der Endtag-Regel,
--      je Maschine bündig setzen (wie infoboard-entzerren.sql),
--      Farben wie bisher (Neusilber gelb, Messing orange)
--   3. Stückzahlen, Werkzeugwechsel und Pad-Skizzen an den neuen
--      Auftrag mit gleicher HOCO Nr. und Maschine hängen; Stückzahlen
--      ohne passenden Auftrag gehen weg
--   4. Alle bisherigen Aufträge und Ferien löschen, Ferien neu füllen
--
--  Geht etwas schief, bleibt alles wie vorher (ein einziger Zug).
--  Läuft man sie ein zweites Mal, kommt dasselbe Ergebnis heraus.
-- =================================================================

begin;

insert into public.jobs_vor_neustart select * from public.jobs j
  where not exists (select 1 from public.jobs_vor_neustart b where b.id = j.id);
insert into public.vacations_vor_neustart select * from public.vacations v
  where not exists (select 1 from public.vacations_vor_neustart b where b.id = v.id);
insert into public.production_records_vor_neustart select * from public.production_records p
  where not exists (select 1 from public.production_records_vor_neustart b where b.id = p.id);
insert into public.tool_changes_vor_neustart select * from public.tool_changes t
  where not exists (select 1 from public.tool_changes_vor_neustart b where b.id = t.id);

drop table if exists public.neustart_alt_ids;
create table public.neustart_alt_ids as select id from public.jobs;

-- Je Maschine darf nur ein Auftrag laufen: die bisherigen laufenden
-- kurz beenden, sonst lässt die Datenbank die neuen nicht hinein
update public.jobs set ended_at = now()
where id in (select id from public.neustart_alt_ids) and plan_status = 'laeuft' and ended_at is null;

-- HOCO Nummern, die noch fehlen
insert into public.hoco_parts (hoco_nr, material)
select distinct on (g.hoco_nr) g.hoco_nr, g.material
from public.ib_neu_tab g
where g.hoco_nr is not null
  and not exists (select 1 from public.hoco_parts h where h.hoco_nr = g.hoco_nr)
order by g.hoco_nr, g.start_zeit desc;

-- Aufträge. Der Endtag geht nur an den Nachfolger, wenn an genau
-- diesem Tag auf derselben Maschine der nächste beginnt.
-- Angelegt "am 29. September", damit die Abrufinformation (Pflicht
-- erst für ab 8. Oktober angelegte Aufträge) nicht überall verlangt wird.
insert into public.jobs (job_number, machine_id, planned_from, planned_days, plan_status,
                  target_quantity, material_bez, plan_note, color,
                  started_at, ended_at, fa_erstellt, material_ok, created_at)
select
  g.hoco_nr, g.machine_id, g.start_zeit::date,
  greatest(1, (
    select count(*) from generate_series(
      g.start_zeit::date,
      case when g.end_zeit::date > g.start_zeit::date and exists (
             select 1 from public.ib_neu_tab n
             where n.machine_id = g.machine_id and n.hoco_nr is not null
               and n.ib_idx <> g.ib_idx
               and n.start_zeit::date = g.end_zeit::date
               and n.start_zeit >= g.start_zeit)
           then g.end_zeit::date - 1 else g.end_zeit::date end,
      '1 day') d
    where extract(isodow from d) < 6)),
  g.zustand,
  g.menge::int,
  g.material,
  case when g.notiz is null then 'aus infoBoard' else g.notiz || E'\n(aus infoBoard)' end,
  public.ib_farbe(g.r::int, g.g::int, g.b::int, g.material),
  g.start_zeit,
  case when g.zustand = 'fertig' then least(g.end_zeit, now()::timestamp) else null end,
  g.zustand = 'fertig',
  g.zustand <> 'geplant',
  timestamptz '2026-09-29 12:00:00+02'
from public.ib_neu_tab g
where g.hoco_nr is not null and g.machine_id is not null;

-- Je Maschine der Reihe nach bündig setzen: was sich überschneidet,
-- rückt auf den ersten freien Arbeitstag. Die Dauer bleibt.
do $$
declare
  r record; frei date; von date; aktuelle_maschine uuid := null;
begin
  for r in
    select id, machine_id, planned_from, greatest(1, coalesce(planned_days, 1)) as tage
    from public.jobs
    where id not in (select id from public.neustart_alt_ids)
    order by machine_id, planned_from, id
  loop
    if aktuelle_maschine is distinct from r.machine_id then
      aktuelle_maschine := r.machine_id; frei := null;
    end if;
    von := public.ib_naechster_arbeitstag(r.planned_from);
    if frei is not null and von < frei then von := frei; end if;
    if von <> r.planned_from then
      update public.jobs set planned_from = von where id = r.id;
    end if;
    frei := public.ib_plus_arbeitstage(public.ib_letzter_tag(von, r.tage), 1);
  end loop;
end $$;

-- Neusilber gelb, Messing orange (wie neusilber-gelb-messing-orange.sql)
update public.jobs
set color = case
    when material_bez ~* 'cuni|neusilber|arcap'                then 'gelb'
    when material_bez ~* 'eco ?bra|cuzn21si3|ohne ?pb'         then 'senf'
    when material_bez ~* 'cuzn|messing|\mms ?58'               then 'orange'
    when color = 'orange'                                      then 'gelb'
    when color = 'gelb'                                        then 'orange'
    else color
  end
where color in ('orange', 'gelb', 'senf')
  and id not in (select id from public.neustart_alt_ids);

-- Stückzahlen, Werkzeugwechsel und Skizzen an den neuen Auftrag hängen
drop table if exists public.neustart_umhaengen;
create table public.neustart_umhaengen as
select a.id as alt_id, (
  select n.id from public.jobs n
  where n.id not in (select id from public.neustart_alt_ids)
    and n.job_number = a.job_number and n.machine_id = a.machine_id
  order by abs(n.planned_from - a.planned_from), n.planned_from desc
  limit 1) as neu_id
from public.jobs a
where a.id in (select id from public.neustart_alt_ids)
  and (exists (select 1 from public.production_records p where p.job_id = a.id)
    or exists (select 1 from public.tool_changes t where t.job_id = a.id)
    or exists (select 1 from public.pad_skizzen s where s.job_id = a.id));

update public.production_records p set job_id = u.neu_id
from public.neustart_umhaengen u where p.job_id = u.alt_id and u.neu_id is not null;
delete from public.production_records p where p.job_id in (select id from public.neustart_alt_ids);

update public.tool_changes t set job_id = u.neu_id
from public.neustart_umhaengen u where t.job_id = u.alt_id and u.neu_id is not null;

update public.pad_skizzen s set job_id = u.neu_id
from public.neustart_umhaengen u where s.job_id = u.alt_id and u.neu_id is not null
  and not exists (select 1 from public.pad_skizzen x where x.job_id = u.neu_id);

-- Bisherige Aufträge und Ferien weg, Ferien neu
delete from public.jobs where id in (select id from public.neustart_alt_ids);

delete from public.vacations;
insert into public.vacations (person, von, tage, note, zeile)
select person, von, tage, note, zeile from public.ferien_neu;

drop table if exists public.neustart_umhaengen;
drop table if exists public.neustart_alt_ids;

commit;

notify pgrst, 'reload schema';

-- Probe: ok, wenn alle Aufträge und Ferien aus infoBoard da sind
select case
  when (select count(*) from public.jobs where plan_note like '%aus infoBoard%')
       = (select count(*) from public.ib_neu_tab where hoco_nr is not null and machine_id is not null)
   and (select count(*) from public.vacations) = (select count(*) from public.ferien_neu)
  then 'ok: ' || (select count(*) from public.jobs) || ' Aufträge, '
       || (select count(*) from public.vacations) || ' Ferien'
  else 'FEHLT' end as neustart;
